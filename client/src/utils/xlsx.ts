/**
 * Minimal, dependency-free .xlsx writer.
 * An .xlsx file is a ZIP of a few XML files, so this builds those files and
 * packs them into an (uncompressed) ZIP. No library is needed.
 *
 * Output: one sheet, a coloured bold header row (frozen, with filter buttons),
 * numbers stored as real numbers (so Excel can sum them), text stored as text
 * (so phone numbers keep their leading 0 and nothing can run as a formula).
 */

const encoder = new TextEncoder();

// ---------------------------------------------------------------- ZIP -------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildZip(files: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();

  const prepared = files.map((f) => ({
    nameBytes: encoder.encode(f.name),
    data: f.data,
    crc: crc32(f.data),
    offset: 0,
  }));

  let size = 22; // end-of-central-directory record
  for (const f of prepared) {
    size += 30 + f.nameBytes.length + f.data.length; // local header + data
    size += 46 + f.nameBytes.length; // central directory entry
  }

  const out = new Uint8Array(new ArrayBuffer(size));
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const f of prepared) {
    f.offset = pos;
    view.setUint32(pos, 0x04034b50, true); // local file header signature
    view.setUint16(pos + 4, 20, true); // version needed
    view.setUint16(pos + 6, 0x0800, true); // flags: UTF-8 file names
    view.setUint16(pos + 8, 0, true); // method 0 = stored
    view.setUint16(pos + 10, dosTime, true);
    view.setUint16(pos + 12, dosDate, true);
    view.setUint32(pos + 14, f.crc, true);
    view.setUint32(pos + 18, f.data.length, true); // compressed size
    view.setUint32(pos + 22, f.data.length, true); // uncompressed size
    view.setUint16(pos + 26, f.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true); // extra field length
    out.set(f.nameBytes, pos + 30);
    out.set(f.data, pos + 30 + f.nameBytes.length);
    pos += 30 + f.nameBytes.length + f.data.length;
  }

  const centralStart = pos;
  for (const f of prepared) {
    view.setUint32(pos, 0x02014b50, true); // central directory signature
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, dosTime, true);
    view.setUint16(pos + 14, dosDate, true);
    view.setUint32(pos + 16, f.crc, true);
    view.setUint32(pos + 20, f.data.length, true);
    view.setUint32(pos + 24, f.data.length, true);
    view.setUint16(pos + 28, f.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true); // extra
    view.setUint16(pos + 32, 0, true); // comment
    view.setUint16(pos + 34, 0, true); // disk number
    view.setUint16(pos + 36, 0, true); // internal attributes
    view.setUint32(pos + 38, 0, true); // external attributes
    view.setUint32(pos + 42, f.offset, true);
    out.set(f.nameBytes, pos + 46);
    pos += 46 + f.nameBytes.length;
  }
  const centralSize = pos - centralStart;

  view.setUint32(pos, 0x06054b50, true); // end of central directory
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, centralSize, true);
  view.setUint32(pos + 16, centralStart, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

// ---------------------------------------------------------------- XML -------
function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // not allowed in XML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Excel sheet names: max 31 characters, none of  \ / ? * [ ] :
export function cleanSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Report').slice(0, 31);
}

const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_INTEGER = 2;
const STYLE_DECIMAL = 3;

function buildSheetXml(headers: string[], rows: (string | number)[][]): string {
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);

  // column widths from the longest value in each column
  const widths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let longest = String(headers[c] ?? '').length;
    for (const row of rows) {
      const cell = row[c];
      const len =
        typeof cell === 'number' ? cell.toLocaleString('en-US').length + 2 : String(cell ?? '').length;
      if (len > longest) longest = len;
    }
    widths.push(Math.min(Math.max(longest + 2, 10), 48));
  }

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  parts.push(
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  );
  parts.push('<sheetFormatPr defaultRowHeight="15"/>');
  parts.push('<cols>');
  widths.forEach((w, i) => {
    parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`);
  });
  parts.push('</cols>');

  parts.push('<sheetData>');

  // header row
  parts.push('<row r="1" ht="22" customHeight="1">');
  for (let c = 0; c < colCount; c++) {
    const text = xmlEscape(String(headers[c] ?? ''));
    parts.push(
      `<c r="${columnLetter(c)}1" s="${STYLE_HEADER}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
    );
  }
  parts.push('</row>');

  // data rows
  rows.forEach((row, rIdx) => {
    const rowNumber = rIdx + 2;
    parts.push(`<row r="${rowNumber}">`);
    for (let c = 0; c < colCount; c++) {
      const cell = row[c];
      const ref = `${columnLetter(c)}${rowNumber}`;
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        const style = Number.isInteger(cell) ? STYLE_INTEGER : STYLE_DECIMAL;
        parts.push(`<c r="${ref}" s="${style}"><v>${cell}</v></c>`);
      } else if (cell === undefined || cell === null || cell === '') {
        continue; // leave the cell empty
      } else {
        // always stored as text, so it can never be treated as a formula
        parts.push(
          `<c r="${ref}" s="${STYLE_DEFAULT}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell))}</t></is></c>`
        );
      }
    }
    parts.push('</row>');
  });
  parts.push('</sheetData>');

  const lastRow = rows.length + 1;
  parts.push(`<autoFilter ref="A1:${columnLetter(colCount - 1)}${lastRow}"/>`);
  parts.push('</worksheet>');
  return parts.join('');
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B3D91"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/** Builds the bytes of a .xlsx file with one sheet. */
export function buildXlsx(
  headers: string[],
  rows: (string | number)[][],
  sheetName = 'Report'
): Uint8Array<ArrayBuffer> {
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(cleanSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS_XML) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(buildSheetXml(headers, rows)) },
  ]);
}