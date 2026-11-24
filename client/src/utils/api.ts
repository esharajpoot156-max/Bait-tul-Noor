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

// The logged-in user, as returned by the backend login route
export interface AuthUser {
  username: string;
  role: UserRole;
  staffName: string;
  title: string;
}

// Backend address. Empty in development (the Vite proxy forwards /api to the backend).
// On Vercel, set VITE_API_URL to the deployed backend address.
const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// ---- Login token storage (kept in the browser so a page refresh stays logged in) ----
const TOKEN_KEY = 'bn_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the person simply has to log in again after a refresh
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear
  }
}

// The app registers a function here so any "401 Unauthorized" answer
// (for example an expired session) sends the person back to the login screen
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    // Kept so existing calls still compile. The backend now reads the role
    // from the login token, so this value is no longer sent.
    role?: UserRole;
    body?: unknown;
    isLogin?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session ended: forget the token and show the login screen
    if (res.status === 401 && !options.isLogin) {
      clearStoredToken();
      unauthorizedHandler?.();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ---- Authentication ----

export async function loginApi(
  username: string,
  password: string
): Promise<AuthUser> {
  const data = await apiRequest<{ token: string; user: AuthUser }>(
    '/api/auth/login',
    { method: 'POST', body: { username, password }, isLogin: true }
  );
  storeToken(data.token);
  return data.user;
}

// Restores the session after a page refresh (null when nobody is logged in)
export async function fetchCurrentUserApi(): Promise<AuthUser | null> {
  if (!getStoredToken()) return null;
  const data = await apiRequest<{ user: AuthUser }>('/api/auth/me');
  return data.user;
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