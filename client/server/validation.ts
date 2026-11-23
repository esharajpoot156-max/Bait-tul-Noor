import type {
  ChannelReconciliation,
  DonorLead,
  ExpenseHead,
  IncomeFundType,
  LeadSource,
  LeadStage,
  LedgerName,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  TransactionType,
  UserRole,
} from '../src/types/system.ts';

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  'management',
  'accountant',
  'followup',
]);

const ALLOWED_LEAD_STAGES: ReadonlySet<LeadStage> = new Set([
  'New Inquiry',
  'Qualified',
  'Converted / Donated',
  'Not Converted / Closed Lost',
]);

const ALLOWED_LEAD_SOURCES: ReadonlySet<LeadSource> = new Set([
  'Meta Ads (WhatsApp)',
  'Website Donation Form',
  'Website Contact Form',
  'Direct WhatsApp',
]);

const ALLOWED_LEDGERS: ReadonlySet<LedgerName> = new Set([
  'Welfare Ledger',
  'Admin Ledger',
  'Marketing Ledger',
  'Miscellaneous Ledger',
]);

const ALLOWED_TXN_TYPES: ReadonlySet<TransactionType> = new Set([
  'Credit',
  'Debit',
]);

const ALLOWED_CHANNELS: ReadonlySet<PaymentChannel> = new Set([
  'Faysal Bank',
  'Meezan Bank',
  'JazzCash',
  'EasyPaisa',
  'Donation Boxes',
  'In-Kind Ration / Ajnaas',
]);

const ALLOWED_INCOME_FUNDS: ReadonlySet<IncomeFundType> = new Set([
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
]);

const ALLOWED_EXPENSE_HEADS: ReadonlySet<ExpenseHead> = new Set([
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
]);

export function hasDangerousMongoKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasDangerousMongoKeys);
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        return true;
      }
      if (hasDangerousMongoKeys(nested)) {
        return true;
      }
    }
  }
  return false;
}

export function resolveRole(headerValue: unknown): UserRole {
  if (typeof headerValue === 'string' && ALLOWED_ROLES.has(headerValue as UserRole)) {
    return headerValue as UserRole;
  }
  return 'management';
}

export function asCleanString(value: unknown, maxLen = 400): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function asPositiveNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateLeadPayload(raw: Record<string, unknown>): {
  ok: true;
  data: Omit<DonorLead, 'id' | 'createdAt'>;
} | {
  ok: false;
  error: string;
} {
  const donorName = asCleanString(raw.donorName, 120);
  const phone = asCleanString(raw.phone, 40);
  if (!donorName || !phone) {
    return { ok: false, error: 'Donor name and phone are required.' };
  }
  const source = ALLOWED_LEAD_SOURCES.has(raw.source as LeadSource)
    ? (raw.source as LeadSource)
    : 'Direct WhatsApp';
  const stage = ALLOWED_LEAD_STAGES.has(raw.stage as LeadStage)
    ? (raw.stage as LeadStage)
    : 'New Inquiry';
  const fundInterest = ALLOWED_INCOME_FUNDS.has(raw.fundInterest as IncomeFundType)
    ? (raw.fundInterest as IncomeFundType)
    : 'Atiyaat (Donations)';

  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    data: {
      donorName,
      phone,
      source,
      campaignName: asCleanString(raw.campaignName, 140) || undefined,
      inquiryDate: isValidIsoDate(raw.inquiryDate) ? raw.inquiryDate : today,
      stage,
      fundInterest,
      pledgedAmountPkr: asPositiveNumber(raw.pledgedAmountPkr, 0),
      receivedAmountPkr: asPositiveNumber(raw.receivedAmountPkr, 0),
      assignedTo: asCleanString(raw.assignedTo, 80) || 'Ayesha Siddiqui',
      followUpDate: isValidIsoDate(raw.followUpDate) ? raw.followUpDate : today,
      followUpNote: asCleanString(raw.followUpNote, 300),
      nonConversionReason: asCleanString(raw.nonConversionReason, 200) || undefined,
      notes: asCleanString(raw.notes, 500),
      linkedVoucherId: asCleanString(raw.linkedVoucherId, 40) || undefined,
    },
  };
}

export function validateTransactionPayload(raw: Record<string, unknown>): {
  ok: true;
  data: {
    transactionDate: string;
    type: TransactionType;
    ledger: LedgerName;
    category: IncomeFundType | ExpenseHead;
    channel: PaymentChannel;
    amountPkr: number;
    donorOrPayee: string;
    linkedLeadId?: string;
    notes: string;
  };
} | {
  ok: false;
  error: string;
} {
  if (!ALLOWED_TXN_TYPES.has(raw.type as TransactionType)) {
    return { ok: false, error: 'Invalid transaction type.' };
  }
  if (!ALLOWED_LEDGERS.has(raw.ledger as LedgerName)) {
    return { ok: false, error: 'Invalid account ledger.' };
  }
  if (!ALLOWED_CHANNELS.has(raw.channel as PaymentChannel)) {
    return { ok: false, error: 'Invalid payment channel.' };
  }
  const type = raw.type as TransactionType;
  const categoryValid =
    type === 'Credit'
      ? ALLOWED_INCOME_FUNDS.has(raw.category as IncomeFundType)
      : ALLOWED_EXPENSE_HEADS.has(raw.category as ExpenseHead);
  if (!categoryValid) {
    return { ok: false, error: 'Invalid account head or fund category.' };
  }
  const amountPkr = asPositiveNumber(raw.amountPkr, 0);
  if (amountPkr <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  const donorOrPayee = asCleanString(raw.donorOrPayee, 140);
  if (!donorOrPayee) {
    return { ok: false, error: 'Donor or payee name is required.' };
  }
  if (!isValidIsoDate(raw.transactionDate)) {
    return { ok: false, error: 'Valid YYYY-MM-DD transactionDate is required.' };
  }
  return {
    ok: true,
    data: {
      transactionDate: raw.transactionDate,
      type,
      ledger: raw.ledger as LedgerName,
      category: raw.category as IncomeFundType | ExpenseHead,
      channel: raw.channel as PaymentChannel,
      amountPkr,
      donorOrPayee,
      linkedLeadId: asCleanString(raw.linkedLeadId, 40) || undefined,
      notes: asCleanString(raw.notes, 500),
    },
  };
}

export function validateReconciliationPayload(
  channelParam: string,
  raw: Record<string, unknown>
): { ok: true; statementBalancePkr: number; notes: string } | { ok: false; error: string } {
  if (!ALLOWED_CHANNELS.has(channelParam as PaymentChannel)) {
    return { ok: false, error: 'Invalid channel.' };
  }
  const n = Number(raw.statementBalancePkr);
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'Valid statementBalancePkr is required.' };
  }
  return {
    ok: true,
    statementBalancePkr: Math.round(n),
    notes: asCleanString(raw.notes, 400),
  };
}

export function validateAssetPayload(raw: Record<string, unknown>): {
  ok: true;
  data: Omit<SocietyAsset, 'id'>;
} | { ok: false; error: string } {
  const name = asCleanString(raw.name, 140);
  if (!name) return { ok: false, error: 'Asset name is required.' };
  const conditionRaw = asCleanString(raw.condition, 40);
  const condition: SocietyAsset['condition'] =
    conditionRaw === 'Fair' || conditionRaw === 'Needs Maintenance'
      ? conditionRaw
      : 'Good';
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    data: {
      assetCode: asCleanString(raw.assetCode, 40) || 'BN-AS-NEW',
      name,
      category: asCleanString(raw.category, 80) || 'General',
      quantity: Math.max(1, asPositiveNumber(raw.quantity, 1)),
      unitValuePkr: asPositiveNumber(raw.unitValuePkr, 0),
      acquiredDate: isValidIsoDate(raw.acquiredDate) ? raw.acquiredDate : today,
      location: asCleanString(raw.location, 100) || 'Main Facility',
      condition,
    },
  };
}

export function validateRationPayload(raw: Record<string, unknown>): {
  ok: true;
  data: Omit<RationStockItem, 'id'>;
} | { ok: false; error: string } {
  const itemName = asCleanString(raw.itemName, 140);
  if (!itemName) return { ok: false, error: 'Ration item name is required.' };
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    data: {
      itemName,
      quantity: Math.max(1, asPositiveNumber(raw.quantity, 1)),
      unit: asCleanString(raw.unit, 40) || 'kg',
      estimatedValuePkr: asPositiveNumber(raw.estimatedValuePkr, 0),
      donorSource: asCleanString(raw.donorSource, 120) || 'Direct In-Kind Donor',
      lastUpdated: isValidIsoDate(raw.lastUpdated) ? raw.lastUpdated : today,
    },
  };
}

export function sanitizeReconciliationChannel(
  channel: string
): ChannelReconciliation['channel'] | null {
  return ALLOWED_CHANNELS.has(channel as PaymentChannel)
    ? (channel as PaymentChannel)
    : null;
}
