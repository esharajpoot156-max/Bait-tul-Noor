export type UserRole = 'management' | 'accountant' | 'followup';

export interface RoleProfile {
  role: UserRole;
  label: string;
  staffName: string;
  title: string;
  permissionsSummary: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'leads'
  | 'ledgers'
  | 'channels'
  | 'website'
  | 'reports';

export type LeadStage =
  | 'New Inquiry'
  | 'Qualified'
  | 'Converted / Donated'
  | 'Not Converted / Closed Lost';

export type LeadSource =
  | 'Meta Ads (WhatsApp)'
  | 'Website Donation Form'
  | 'Website Contact Form'
  | 'Direct WhatsApp';

export type LedgerName =
  | 'Welfare Ledger'
  | 'Admin Ledger'
  | 'Marketing Ledger'
  | 'Miscellaneous Ledger';

export type TransactionType = 'Credit' | 'Debit';

export type IncomeFundType =
  | 'Mashroot Fund (Restricted Fund)'
  | 'Ghair Mashroot Fund (Unrestricted Fund)'
  | 'Naqd Donation (Cash Donation)'
  | 'Online Donation'
  | 'Sadqa'
  | 'Atiyaat (Donations)'
  | 'Zakaat'
  | 'Fitrana'
  | 'Deegar Atiyaat (Other Contributions)'
  | 'Ration / Ajnaas (In-kind food & goods)';

export type ExpenseHead =
  | "Girls' School Expenses (Bachiyon ke school ke akhrajat)"
  | 'Pick-and-Drop Transport Rent (Aane aur jaane ke liye transport ka kiraya)'
  | 'Monthly House/Building Rent (Mahana kiraya makaan)'
  | 'Electricity Bills & Miscellaneous (Bil bijli aur deegar)'
  | 'Daily Food & Groceries Purchase (Rozana khane peene ki ashiya-e-khuronoosh ki kharidari)'
  | 'Staff Salaries (Staff ki tankhwahien)'
  | 'Social Media Marketing Expenses (Social media marketing akhrajat)'
  | 'Marketing Staff Expenses (Marketing amle ke akhrajat)'
  | 'Society Assets Purchase (Asase)'
  | 'Petty Cash Adjustment';

export type PaymentChannel =
  | 'Faysal Bank'
  | 'Meezan Bank'
  | 'JazzCash'
  | 'EasyPaisa'
  | 'Donation Boxes'
  | 'In-Kind Ration / Ajnaas';

export interface DonorLead {
  id: string;
  donorName: string;
  phone: string;
  source: LeadSource;
  campaignName?: string;
  inquiryDate: string; // YYYY-MM-DD
  stage: LeadStage;
  fundInterest: IncomeFundType;
  pledgedAmountPkr: number;
  receivedAmountPkr: number;
  assignedTo: string;
  followUpDate: string;
  followUpNote: string;
  nonConversionReason?: string;
  notes: string;
  linkedVoucherId?: string;
  createdAt: string;
}

export interface LedgerTransaction {
  id: string;
  voucherNo: string;
  transactionDate: string; // YYYY-MM-DD (supports backdated entries)
  systemEntryTimestamp: string; // ISO timestamp when entered into system
  isBackdated: boolean;
  backdateApproved: boolean;
  backdateApprovedBy?: string;
  type: TransactionType;
  ledger: LedgerName;
  category: IncomeFundType | ExpenseHead;
  channel: PaymentChannel;
  amountPkr: number;
  donorOrPayee: string;
  linkedLeadId?: string;
  notes: string;
  enteredByName: string;
  enteredByRole: UserRole;
}

export interface ComputedTransaction extends LedgerTransaction {
  ledgerRunningBalance: number;
  overallRunningBalance: number;
  channelRunningBalance: number;
}

export interface ChannelReconciliation {
  channel: PaymentChannel;
  channelType: 'Bank Account' | 'Mobile Wallet' | 'Physical Channel';
  accountRef: string;
  statementBalancePkr: number;
  lastReconciledDate: string;
  reconciledBy: string;
  notes: string;
}

export interface SocietyAsset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  quantity: number;
  unitValuePkr: number;
  acquiredDate: string;
  location: string;
  condition: 'Good' | 'Fair' | 'Needs Maintenance';
}

export interface RationStockItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedValuePkr: number;
  donorSource: string;
  lastUpdated: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetRef: string;
  details: string;
}

export interface WebsiteSyncEvent {
  id: string;
  timestamp: string;
  source: LeadSource;
  donorName: string;
  phone: string;
  amountPkr?: number;
  fundType: IncomeFundType;
  leadId: string;
  voucherNo?: string;
  status: 'Synced to CRM' | 'Synced to CRM + Credit Voucher';
}

export interface SystemState {
  leads: DonorLead[];
  transactions: LedgerTransaction[];
  reconciliations: ChannelReconciliation[];
  assets: SocietyAsset[];
  rationStock: RationStockItem[];
  auditTrail: AuditLogEntry[];
  websiteSyncEvents: WebsiteSyncEvent[];
}

export interface BackupFilePayload {
  formatVersion: string;
  organization: string;
  exportedAt: string;
  exportedBy: string;
  checksumSha256: string;
  encrypted: boolean;
  payload: string; // JSON string or XOR/Base64 obfuscated encrypted payload
}
