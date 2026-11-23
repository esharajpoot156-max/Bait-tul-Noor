import {
  DonorLead,
  IncomeFundType,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  SystemState,
  UserRole,
} from '../types/system';

export interface DatabaseHealth {
  storageMode: 'atlas' | 'preview-fallback';
  connected: boolean;
  databaseName: string;
  collections: {
    leads: number;
    transactions: number;
    reconciliations: number;
    assets: number;
    rationStock: number;
    auditTrail: number;
    websiteSyncEvents: number;
  };
  errorMessage?: string;
}

async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    role?: UserRole;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.role) {
    headers['x-user-role'] = options.role;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchInitialSystemState(): Promise<{
  state: SystemState;
  dbStatus: DatabaseHealth;
}> {
  return apiRequest('/api/state');
}

export async function fetchDatabaseHealth(): Promise<DatabaseHealth> {
  return apiRequest('/api/health');
}

export async function createLeadApi(
  lead: Omit<DonorLead, 'id' | 'createdAt'>,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/leads', { method: 'POST', role, body: lead });
}

export async function updateLeadApi(
  lead: DonorLead,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest(`/api/leads/${encodeURIComponent(lead.id)}`, {
    method: 'PUT',
    role,
    body: lead,
  });
}

export async function convertLeadApi(
  leadId: string,
  payload: {
    receivedAmountPkr: number;
    fundType: IncomeFundType;
    ledger: LedgerName;
    channel: PaymentChannel;
    transactionDate: string;
    notes: string;
  },
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest(`/api/leads/${encodeURIComponent(leadId)}/convert`, {
    method: 'POST',
    role,
    body: payload,
  });
}

export async function createTransactionApi(
  txn: Omit<
    LedgerTransaction,
    | 'id'
    | 'voucherNo'
    | 'systemEntryTimestamp'
    | 'isBackdated'
    | 'backdateApproved'
    | 'backdateApprovedBy'
    | 'enteredByName'
    | 'enteredByRole'
  >,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/transactions', { method: 'POST', role, body: txn });
}

export async function approveBackdateApi(
  txnId: string,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest(
    `/api/transactions/${encodeURIComponent(txnId)}/approve-backdate`,
    {
      method: 'PATCH',
      role,
    }
  );
}

export async function updateReconciliationApi(
  channel: PaymentChannel,
  payload: { statementBalancePkr: number; notes: string },
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest(`/api/reconciliations/${encodeURIComponent(channel)}`, {
    method: 'PUT',
    role,
    body: payload,
  });
}

export async function createAssetApi(
  asset: Omit<SocietyAsset, 'id'>,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/assets', { method: 'POST', role, body: asset });
}

export async function createRationApi(
  item: Omit<RationStockItem, 'id'>,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/ration', { method: 'POST', role, body: item });
}

export async function submitWebsiteSyncApi(payload: {
  submissionType: 'donation' | 'contact' | 'meta_whatsapp';
  donorName: string;
  phone: string;
  fundType: IncomeFundType;
  amountPkr: number;
  channel?: PaymentChannel;
  campaignName?: string;
  notes: string;
}): Promise<{ state: SystemState }> {
  return apiRequest('/api/website-sync', {
    method: 'POST',
    body: payload,
  });
}

export async function restoreSystemBackupApi(
  state: SystemState,
  actorNote: string,
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/backup/restore', {
    method: 'POST',
    role,
    body: { state, actorNote },
  });
}

export async function resetDatabaseApi(
  role: UserRole
): Promise<{ state: SystemState }> {
  return apiRequest('/api/backup/reset', {
    method: 'POST',
    role,
  });
}
