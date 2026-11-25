/**
 * Dependency-free PDF export for the statements and reports.
 *
 * Each page is drawn on a canvas by the browser (so Urdu / Arabic names and any
 * other script show correctly, which a plain PDF text font cannot do), turned
 * into a JPEG, and packed into a real PDF file (A4 landscape).
 *
 * Note: because pages are pictures, the text inside the PDF cannot be selected
 * or searched. Use the Excel (.xlsx) export when the data itself is needed.
 */

// ------------------------------------------------------------ PDF file ------
export interface PdfPageImage {
  jpeg: Uint8Array;
  width: number; // pixels
  height: number; // pixels
}

const enc = new TextEncoder();

/** Packs JPEG page images into a PDF. pageW/pageH are in points (1/72 inch). */
export function buildPdf(
  pages: PdfPageImage[],
  pageW: number,
  pageH: number
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // offsets[objectNumber] = byte position
  let length = 0;

  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (num: number) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
  };

  // header (the second line marks the file as binary)
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const pageObjNum = (i: number) => 3 + i * 3;
  const contentObjNum = (i: number) => 4 + i * 3;
  const imageObjNum = (i: number) => 5 + i * 3;

  beginObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  beginObject(2);
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ');
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    beginObject(pageObjNum(i));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >> >> ` +
        `/Contents ${contentObjNum(i)} 0 R >>\nendobj\n`
    );

    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    beginObject(contentObjNum(i));
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    beginObject(imageObjNum(i));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${page.jpeg.length} >>\nstream\n`
    );
    push(page.jpeg);
    push('\nendstream\nendobj\n');
  });

  const objectCount = 2 + pages.length * 3;
  const xrefStart = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objectCount; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(new ArrayBuffer(length));
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ------------------------------------------------------------ report model --
export type PdfCell = string | { text: string; sub?: string };

export interface PdfColumn {
  header: string;
  width: number; // relative weight
  align?: 'left' | 'right';
  tone?: 'credit' | 'debit' | 'bold';
}

export interface PdfReportModel {
  title: string;
  subtitle: string;
  generatedAt: string;
  summary?: { label: string; value: string; tone?: 'credit' | 'debit' }[];
  columns: PdfColumn[];
  rows: PdfCell[][];
  footerLeft: string;
  footerRight: string;
}

// ------------------------------------------------------------ drawing -------
const PAGE_W = 842; // A4 landscape, points
const PAGE_H = 595;
const SCALE = 2.5; // pixels per point (about 180 dpi)
const MARGIN = 36;
const FOOTER_H = 26;
const FONT = '"Segoe UI", Helvetica, Arial, "Noto Naskh Arabic", "Noto Nastaliq Urdu", sans-serif';

const COLORS = {
  brand: '#0b3d91',
  text: '#0f172a',
  muted: '#64748b',
  line: '#cbd5e1',
  zebra: '#f8fafc',
  credit: '#065f46',
  debit: '#be123c',
  headerText: '#ffffff',
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (ctx.measureText(attempt).width <= maxWidth) {
        current = attempt;
        continue;
      }
      if (current) lines.push(current);
      // a single very long word: break it by characters
      let piece = '';
      for (const ch of word) {
        if (ctx.measureText(piece + ch).width > maxWidth && piece) {
          lines.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      current = piece;
    }
    lines.push(current);
  }
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,1}$/, '…');
    return cut;
  }
  return lines;
}

function newPage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * SCALE);
  canvas.height = Math.round(PAGE_H * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Could not create page image'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      0.8
    );
  });
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the logo is optional
    img.src = src;
  });
}

/** Draws the report onto A4-landscape pages and returns them as page images. */
export async function renderReportPages(
  model: PdfReportModel,
  logo: HTMLImageElement | null
): Promise<PdfPageImage[]> {
  const pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  const contentW = PAGE_W - MARGIN * 2;

  const totalWeight = model.columns.reduce((a, c) => a + c.width, 0);
  const colW = model.columns.map((c) => (c.width / totalWeight) * contentW);
  const colX: number[] = [];
  colW.reduce((x, w) => (colX.push(x), x + w), MARGIN);
  const PAD = 5;

  let page = newPage();
  pages.push(page);
  let y = MARGIN;

  // ---- first-page header: logo, organisation, title, generated date ----
  const drawFirstHeader = () => {
    const { ctx } = page;
    let textX = MARGIN;
    if (logo) {
      const size = 42;
      ctx.save();
      ctx.beginPath();
      ctx.arc(MARGIN + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, MARGIN, y, size, size);
      ctx.restore();
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(MARGIN + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      textX = MARGIN + size + 12;
    }
    ctx.fillStyle = COLORS.brand;
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('Bait-ul-Noor Orphanage Society', textX, y + 11);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(model.title, textX, y + 31);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 9.5px ${FONT}`;
    ctx.fillText(model.subtitle, textX, y + 45);

    ctx.textAlign = 'right';
    ctx.font = `400 9px ${FONT}`;
    ctx.fillText(`Generated: ${model.generatedAt}`, PAGE_W - MARGIN, y + 25);
    ctx.fillText('Currency: PKR', PAGE_W - MARGIN, y + 38);
    ctx.textAlign = 'left';

    y += 54;
    ctx.strokeStyle = COLORS.brand;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 14;
  };

  const drawContinuationHeader = () => {
    const { ctx } = page;
    ctx.fillStyle = COLORS.brand;
    ctx.font = `600 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('Bait-ul-Noor Orphanage Society', MARGIN, y + 9);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(model.title, MARGIN, y + 23);
    y += 32;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 10;
  };

  const drawSummary = () => {
    if (!model.summary || model.summary.length === 0) return;
    const { ctx } = page;
    const gap = 14;
    const boxW = (contentW - gap * (model.summary.length - 1)) / model.summary.length;
    model.summary.forEach((item, i) => {
      const x = MARGIN + i * (boxW + gap);
      ctx.fillStyle = COLORS.zebra;
      ctx.fillRect(x, y, boxW, 40);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x, y, boxW, 40);
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `400 8.5px ${FONT}`;
      ctx.fillText(item.label, x + 10, y + 15);
      ctx.fillStyle =
        item.tone === 'credit' ? COLORS.credit : item.tone === 'debit' ? COLORS.debit : COLORS.text;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(item.value, x + 10, y + 32);
    });
    y += 40 + 16;
  };

  const drawTableHeader = () => {
    const { ctx } = page;
    const h = 20;
    ctx.fillStyle = COLORS.brand;
    ctx.fillRect(MARGIN, y, contentW, h);
    ctx.fillStyle = COLORS.headerText;
    ctx.font = `700 8.5px ${FONT}`;
    model.columns.forEach((col, i) => {
      if (col.align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(col.header, colX[i] + colW[i] - PAD, y + 13);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(col.header, colX[i] + PAD, y + 13);
      }
    });
    ctx.textAlign = 'left';
    y += h;
  };

  const bodyBottom = () => PAGE_H - MARGIN - FOOTER_H;

  drawFirstHeader();
  drawSummary();
  drawTableHeader();

  const LH = 11; // line height of main text
  const LH_SUB = 9.5;
  const MAX_LINES = 4;

  model.rows.forEach((row, rowIndex) => {
    // work out the wrapped lines and the height of this row
    page.ctx.font = `400 9px ${FONT}`;
    const laid = row.map((cell, i) => {
      const text = typeof cell === 'string' ? cell : cell.text;
      const sub = typeof cell === 'string' ? undefined : cell.sub;
      const col = model.columns[i];
      page.ctx.font = `${col?.tone === 'bold' ? 700 : 400} 9px ${FONT}`;
      const lines = wrapText(page.ctx, text, colW[i] - PAD * 2, MAX_LINES);
      page.ctx.font = `400 8px ${FONT}`;
      const subLines = sub ? wrapText(page.ctx, sub, colW[i] - PAD * 2, 2) : [];
      return { lines, subLines };
    });
    const rowH =
      Math.max(
        ...laid.map((l) => l.lines.length * LH + l.subLines.length * LH_SUB),
        LH
      ) + 9;

    if (y + rowH > bodyBottom()) {
      page = newPage();
      pages.push(page);
      y = MARGIN;
      drawContinuationHeader();
      drawTableHeader();
    }

    const { ctx } = page;
    if (rowIndex % 2 === 1) {
      ctx.fillStyle = COLORS.zebra;
      ctx.fillRect(MARGIN, y, contentW, rowH);
    }
    laid.forEach((cellLayout, i) => {
      const col = model.columns[i];
      const right = col?.align === 'right';
      const x = right ? colX[i] + colW[i] - PAD : colX[i] + PAD;
      ctx.textAlign = right ? 'right' : 'left';
      let ty = y + 13;
      ctx.font = `${col?.tone === 'bold' ? 700 : 400} 9px ${FONT}`;
      ctx.fillStyle =
        col?.tone === 'credit' ? COLORS.credit : col?.tone === 'debit' ? COLORS.debit : COLORS.text;
      for (const line of cellLayout.lines) {
        ctx.fillText(line, x, ty);
        ty += LH;
      }
      ctx.font = `400 8px ${FONT}`;
      ctx.fillStyle = COLORS.muted;
      for (const line of cellLayout.subLines) {
        ctx.fillText(line, x, ty);
        ty += LH_SUB;
      }
    });
    ctx.textAlign = 'left';
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + rowH);
    ctx.lineTo(PAGE_W - MARGIN, y + rowH);
    ctx.stroke();
    y += rowH;
  });

  if (model.rows.length === 0) {
    const { ctx } = page;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `italic 400 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('No records to show.', MARGIN + PAD, y + 18);
  }

  // ---- footer on every page: left text, right page number ----
  pages.forEach((p, i) => {
    const { ctx } = p;
    const fy = PAGE_H - MARGIN + 6;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(MARGIN, fy - 12);
    ctx.lineTo(PAGE_W - MARGIN, fy - 12);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(model.footerLeft, MARGIN, fy);
    ctx.textAlign = 'right';
    ctx.fillText(`${model.footerRight}  ·  Page ${i + 1} of ${pages.length}`, PAGE_W - MARGIN, fy);
    ctx.textAlign = 'left';
  });

  const images: PdfPageImage[] = [];
  for (const p of pages) {
    images.push({
      jpeg: await canvasToJpeg(p.canvas),
      width: p.canvas.width,
      height: p.canvas.height,
    });
  }
  return images;
}

/** Builds the PDF and downloads it. */
export async function exportReportPdf(
  filename: string,
  model: PdfReportModel,
  logoSrc = '/logo.jpeg'
): Promise<void> {
  const logo = await loadImage(logoSrc);
  const images = await renderReportPages(model, logo);
  const bytes = buildPdf(images, PAGE_W, PAGE_H);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}