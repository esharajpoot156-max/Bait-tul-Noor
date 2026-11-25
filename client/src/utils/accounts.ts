import {
  ComputedTransaction,
  ExpenseHead,
  IncomeFundType,
  LeadSource,
  LeadStage,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  RoleProfile,
  UserRole,
} from '../types/system';
import { buildXlsx } from './xlsx';

export const ROLE_PROFILES: Record<UserRole, RoleProfile> = {
  management: {
    role: 'management',
    label: 'Management / Admin',
    staffName: 'Muhmmad Abbas',
    title: 'General Secretary',
    permissionsSummary:
      'Full overview, backdate voucher approval, all four ledgers, and backup import/export.',
  },
  accountant: {
    role: 'accountant',
    label: 'Accountant',
    staffName: 'Asim Bhai',
    title: 'Society Accountant',
    permissionsSummary:
      'Credit/Debit entries, four-ledger management, bank/wallet reconciliation, assets, and Excel/PDF exports.',
  },
  followup: {
    role: 'followup',
    label: 'Follow-Up Staff',
    staffName: 'Ayesha Siddiqui',
    title: 'Donor Relations Coordinator',
    permissionsSummary:
      'WhatsApp & website lead updates, follow-up reminders, pledged tracking, and conversion logging.',
  },
};

export const LEDGER_NAMES: LedgerName[] = [
  'Welfare Ledger',
  'Admin Ledger',
  'Marketing Ledger',
  'Miscellaneous Ledger',
];

export const LEDGER_META: Record<
  LedgerName,
  {
    shortName: string;
    scope: string;
    primaryInflows: IncomeFundType[];
    primaryExpenses: ExpenseHead[];
  }
> = {
  'Welfare Ledger': {
    shortName: 'Welfare',
    scope:
      'Direct orphan care, Zakaat/Sadqa/Fitrana/Mashroot inflows, girls school fees, daily groceries, and transport.',
    primaryInflows: [
      'Zakaat',
      'Sadqa',
      'Fitrana',
      'Mashroot Fund (Restricted Fund)',
      'Ration / Ajnaas (In-kind food & goods)',
    ],
    primaryExpenses: [
      "Girls' School Expenses (Bachiyon ke school ke akhrajat)",
      'Daily Food & Groceries Purchase (Rozana khane peene ki ashiya-e-khuronoosh ki kharidari)',
      'Pick-and-Drop Transport Rent (Aane aur jaane ke liye transport ka kiraya)',
    ],
  },
  'Admin Ledger': {
    shortName: 'Admin',
    scope:
      'Society administration, Ghair Mashroot/Atiyaat funds, building rent, staff salaries, and society assets.',
    primaryInflows: [
      'Ghair Mashroot Fund (Unrestricted Fund)',
      'Atiyaat (Donations)',
      'Online Donation',
      'Naqd Donation (Cash Donation)',
    ],
    primaryExpenses: [
      'Monthly House/Building Rent (Mahana kiraya makaan)',
      'Staff Salaries (Staff ki tankhwahien)',
      'Society Assets Purchase (Asase)',
    ],
  },
  'Marketing Ledger': {
    shortName: 'Marketing',
    scope:
      'Donor acquisition campaigns, fundraising budgets, social media marketing, and marketing staff expenses.',
    primaryInflows: [
      'Ghair Mashroot Fund (Unrestricted Fund)',
      'Atiyaat (Donations)',
      'Online Donation',
    ],
    primaryExpenses: [
      'Social Media Marketing Expenses (Social media marketing akhrajat)',
      'Marketing Staff Expenses (Marketing amle ke akhrajat)',
    ],
  },
  'Miscellaneous Ledger': {
    shortName: 'Miscellaneous',
    scope:
      'General utility bills, electricity, Deegar Atiyaat, and minor ad-hoc petty cash adjustments.',
    primaryInflows: [
      'Deegar Atiyaat (Other Contributions)',
      'Naqd Donation (Cash Donation)',
    ],
    primaryExpenses: [
      'Electricity Bills & Miscellaneous (Bil bijli aur deegar)',
      'Petty Cash Adjustment',
    ],
  },
};

export const INCOME_FUND_TYPES: IncomeFundType[] = [
  'Mashroot Fund (Restricted Fund)',
  'Ghair Mashroot Fund (Unrestricted Fund)',
  'Naqd Donation (Cash Donation)',
  'Online Donation',
  'Sadqa',
  'Atiyaat (Donations)',
  'Zakaat',
  'Fitrana',
  'Deegar Atiyaat (Other Contributions)',
  'Ration / Ajnaas (In-kind food & goods)',
];

export const EXPENSE_HEADS: ExpenseHead[] = [
  "Girls' School Expenses (Bachiyon ke school ke akhrajat)",
  'Pick-and-Drop Transport Rent (Aane aur jaane ke liye transport ka kiraya)',
  'Monthly House/Building Rent (Mahana kiraya makaan)',
  'Electricity Bills & Miscellaneous (Bil bijli aur deegar)',
  'Daily Food & Groceries Purchase (Rozana khane peene ki ashiya-e-khuronoosh ki kharidari)',
  'Staff Salaries (Staff ki tankhwahien)',
  'Social Media Marketing Expenses (Social media marketing akhrajat)',
  'Marketing Staff Expenses (Marketing amle ke akhrajat)',
  'Society Assets Purchase (Asase)',
  'Petty Cash Adjustment',
];

export const PAYMENT_CHANNELS: PaymentChannel[] = [
  'Faysal Bank',
  'Meezan Bank',
  'JazzCash',
  'EasyPaisa',
  'Donation Boxes',
  'In-Kind Ration / Ajnaas',
];

export const LEAD_STAGES: LeadStage[] = [
  'New Inquiry',
  'Qualified',
  'Converted / Donated',
  'Not Converted / Closed Lost',
];

export const LEAD_SOURCES: LeadSource[] = [
  'Meta Ads (WhatsApp)',
  'Website Donation Form',
  'Website Contact Form',
  'Direct WhatsApp',
];

export const NON_CONVERSION_REASONS = [
  'No response after 3 follow-ups',
  'Committed for next month / Ramadan',
  'Requested cash pickup outside coverage area',
  'Inquiry for general info only',
  'Budget constraints / declined politely',
  'Duplicate WhatsApp inquiry',
];

export const STAFF_MEMBERS = [
  'Ayesha Siddiqui',
  'Bilal Qureshi',
  'Sana Farooq',
  'Asim Bhai',
];

export function formatPkr(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = abs.toLocaleString('en-PK');
  return amount < 0 ? `-PKR ${formatted}` : `PKR ${formatted}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatShortDate(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  if (!y || !m || !d) return isoDate;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  return `${d} ${months[monthIdx]} ${y}`;
}

export function formatTimestamp(isoTimestamp: string): string {
  if (!isoTimestamp) return '—';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return isoTimestamp;
  return dt.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Chronologically sorts all transactions by transactionDate ascending (then systemEntryTimestamp)
 * and recalculates running balances globally, per ledger, and per payment channel.
 * This ensures any backdated entry automatically recalculates subsequent chronological balances.
 */
export function computeChronologicalLedgers(
  transactions: LedgerTransaction[]
): {
  chronological: ComputedTransaction[];
  ledgerTotals: Record<
    LedgerName,
    { credits: number; debits: number; net: number; count: number }
  >;
  channelTotals: Record<
    PaymentChannel,
    { credits: number; debits: number; net: number; count: number }
  >;
  fundTotals: Record<string, number>;
  totalCredits: number;
  totalDebits: number;
  netBalance: number;
} {
  const sorted = [...transactions].sort((a, b) => {
    const dateCmp = a.transactionDate.localeCompare(b.transactionDate);
    if (dateCmp !== 0) return dateCmp;
    return a.systemEntryTimestamp.localeCompare(b.systemEntryTimestamp);
  });

  let overallRunning = 0;
  const ledgerRunning: Record<LedgerName, number> = {
    'Welfare Ledger': 0,
    'Admin Ledger': 0,
    'Marketing Ledger': 0,
    'Miscellaneous Ledger': 0,
  };
  const channelRunning: Record<PaymentChannel, number> = {
    'Faysal Bank': 0,
    'Meezan Bank': 0,
    JazzCash: 0,
    EasyPaisa: 0,
    'Donation Boxes': 0,
    'In-Kind Ration / Ajnaas': 0,
  };

  const ledgerTotals: Record<
    LedgerName,
    { credits: number; debits: number; net: number; count: number }
  > = {
    'Welfare Ledger': { credits: 0, debits: 0, net: 0, count: 0 },
    'Admin Ledger': { credits: 0, debits: 0, net: 0, count: 0 },
    'Marketing Ledger': { credits: 0, debits: 0, net: 0, count: 0 },
    'Miscellaneous Ledger': { credits: 0, debits: 0, net: 0, count: 0 },
  };

  const channelTotals: Record<
    PaymentChannel,
    { credits: number; debits: number; net: number; count: number }
  > = {
    'Faysal Bank': { credits: 0, debits: 0, net: 0, count: 0 },
    'Meezan Bank': { credits: 0, debits: 0, net: 0, count: 0 },
    JazzCash: { credits: 0, debits: 0, net: 0, count: 0 },
    EasyPaisa: { credits: 0, debits: 0, net: 0, count: 0 },
    'Donation Boxes': { credits: 0, debits: 0, net: 0, count: 0 },
    'In-Kind Ration / Ajnaas': { credits: 0, debits: 0, net: 0, count: 0 },
  };

  const fundTotals: Record<string, number> = {};
  let totalCredits = 0;
  let totalDebits = 0;

  const chronological: ComputedTransaction[] = sorted.map((txn) => {
    // A backdated entry still waiting for Management approval is shown in the
    // list, but it is not counted in any balance or total until it is approved.
    if (txn.isBackdated && !txn.backdateApproved) {
      return {
        ...txn,
        ledgerRunningBalance: ledgerRunning[txn.ledger] || 0,
        overallRunningBalance: overallRunning,
        channelRunningBalance: channelRunning[txn.channel] || 0,
      };
    }

    const delta = txn.type === 'Credit' ? txn.amountPkr : -txn.amountPkr;
    overallRunning += delta;
    ledgerRunning[txn.ledger] = (ledgerRunning[txn.ledger] || 0) + delta;
    channelRunning[txn.channel] = (channelRunning[txn.channel] || 0) + delta;

    if (txn.type === 'Credit') {
      totalCredits += txn.amountPkr;
      ledgerTotals[txn.ledger].credits += txn.amountPkr;
      channelTotals[txn.channel].credits += txn.amountPkr;
      fundTotals[txn.category] = (fundTotals[txn.category] || 0) + txn.amountPkr;
    } else {
      totalDebits += txn.amountPkr;
      ledgerTotals[txn.ledger].debits += txn.amountPkr;
      channelTotals[txn.channel].debits += txn.amountPkr;
    }

    ledgerTotals[txn.ledger].net += delta;
    ledgerTotals[txn.ledger].count += 1;
    channelTotals[txn.channel].net += delta;
    channelTotals[txn.channel].count += 1;

    return {
      ...txn,
      ledgerRunningBalance: ledgerRunning[txn.ledger],
      overallRunningBalance: overallRunning,
      channelRunningBalance: channelRunning[txn.channel],
    };
  });

  return {
    chronological,
    ledgerTotals,
    channelTotals,
    fundTotals,
    totalCredits,
    totalDebits,
    netBalance: overallRunning,
  };
}

export function inferDefaultLedgerForFund(fund: IncomeFundType): LedgerName {
  if (
    fund === 'Zakaat' ||
    fund === 'Sadqa' ||
    fund === 'Fitrana' ||
    fund === 'Mashroot Fund (Restricted Fund)' ||
    fund === 'Ration / Ajnaas (In-kind food & goods)'
  ) {
    return 'Welfare Ledger';
  }
  if (fund === 'Deegar Atiyaat (Other Contributions)') {
    return 'Miscellaneous Ledger';
  }
  return 'Admin Ledger';
}

export function exportRowsToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  // UTF-8 BOM for crisp Excel opening
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic hash for non-HTTPS local contexts
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function obfuscateWithPassphrase(
  plainJson: string,
  passphrase: string
): string {
  if (!passphrase) return plainJson;
  const textBytes = new TextEncoder().encode(plainJson);
  const keyBytes = new TextEncoder().encode(passphrase);
  const out = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    out[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  let binary = '';
  for (let i = 0; i < out.length; i++) {
    binary += String.fromCharCode(out[i]);
  }
  return btoa(binary);
}

export function deobfuscateWithPassphrase(
  encoded: string,
  passphrase: string
): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const keyBytes = new TextEncoder().encode(passphrase);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(out);
}

// ---------------------------------------------------------------------------
// Backup encryption: AES-256-GCM, key derived from the passphrase with PBKDF2.
// (The old XOR functions above are kept only so older backup files still restore.)
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 310000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface BackupEncryptionInfo {
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
}

export async function encryptBackup(
  plainJson: string,
  passphrase: string
): Promise<{ payload: string; encryption: BackupEncryptionInfo }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainJson)
  );
  return {
    payload: bytesToBase64(new Uint8Array(cipher)),
    encryption: {
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
  };
}

// Throws if the passphrase is wrong or the file was changed (GCM checks integrity).
export async function decryptBackup(
  payload: string,
  passphrase: string,
  info: BackupEncryptionInfo
): Promise<string> {
  const key = await deriveAesKey(
    passphrase,
    base64ToBytes(info.salt),
    info.iterations
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(info.iv) },
    key,
    base64ToBytes(payload)
  );
  return new TextDecoder().decode(plain);
}

// Real Excel (.xlsx) download. Falls back to CSV if the browser cannot build it.
export function exportRowsToXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  try {
    // Sheet name from the file name: "bait-ul-noor-master-statement-2026-11-25.xlsx" -> "Master Statement"
    const sheetName = filename
      .replace(/\.xlsx$/i, '')
      .replace(/^bait-ul-noor-/, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/, '')
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const bytes = buildXlsx(headers, rows, sheetName);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    exportRowsToCsv(filename.replace(/\.xlsx$/i, '.csv'), headers, rows);
  }
}