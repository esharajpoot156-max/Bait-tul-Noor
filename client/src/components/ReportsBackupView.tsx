import React, { useRef, useState } from 'react';
import {
  Download,
  Printer,
  Upload,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Database,
  RefreshCw,
} from 'lucide-react';
import {
  BackupFilePayload,
  ChannelReconciliation,
  ComputedTransaction,
  DonorLead,
  LedgerName,
  PaymentChannel,
  SystemState,
  UserRole,
} from '../types/system';
import {
  deobfuscateWithPassphrase,
  exportRowsToCsv,
  getTodayIsoDate,
  LEDGER_NAMES,
  obfuscateWithPassphrase,
  ROLE_PROFILES,
  sha256Hex,
} from '../utils/accounting';
import { DatabaseHealth } from '../utils/api';
import { PrintReportConfig } from './PrintStatementModal';

interface ReportsBackupViewProps {
  systemState: SystemState;
  chronological: ComputedTransaction[];
  channelTotals: Record<
    PaymentChannel,
    { credits: number; debits: number; net: number; count: number }
  >;
  currentRole: UserRole;
  dbStatus: DatabaseHealth | null;
  onRefreshDbStatus: () => Promise<void>;
  onRestoreSystemState: (
    restored: SystemState,
    actorNote: string
  ) => Promise<void>;
  onResetToSeed: () => Promise<void>;
  onOpenPrint: (config: PrintReportConfig) => void;
}

export const ReportsBackupView: React.FC<ReportsBackupViewProps> = ({
  systemState,
  chronological,
  channelTotals,
  currentRole,
  dbStatus,
  onRefreshDbStatus,
  onRestoreSystemState,
  onResetToSeed,
  onOpenPrint,
}) => {
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [refreshingDb, setRefreshingDb] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    state: SystemState;
    checksumVerified: boolean;
    exportedAt: string;
    exportedBy: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canExportReports =
    currentRole === 'management' || currentRole === 'accountant';
  const canManageBackups = currentRole === 'management';
  const todayIso = getTodayIsoDate();

  const handleRefreshDb = async () => {
    setRefreshingDb(true);
    try {
      await onRefreshDbStatus();
    } finally {
      setRefreshingDb(false);
    }
  };

  const downloadLedgerCsv = (ledgerFilter: LedgerName | 'All') => {
    const rows =
      ledgerFilter === 'All'
        ? chronological
        : chronological.filter((t) => t.ledger === ledgerFilter);
    const slug =
      ledgerFilter === 'All'
        ? 'master-statement'
        : ledgerFilter.toLowerCase().replace(/\s+/g, '-');
    exportRowsToCsv(
      `bait-ul-noor-${slug}-${todayIso}.csv`,
      [
        'Txn Date',
        'Voucher #',
        'Backdated',
        'System Entry Timestamp',
        'Ledger',
        'Type',
        'Category',
        'Channel',
        'Donor / Payee',
        'Credit (PKR)',
        'Debit (PKR)',
        'Running Balance (PKR)',
      ],
      rows.map((t) => [
        t.transactionDate,
        t.voucherNo,
        t.isBackdated ? 'Yes' : 'No',
        t.systemEntryTimestamp,
        t.ledger,
        t.type,
        t.category,
        t.channel,
        t.donorOrPayee,
        t.type === 'Credit' ? t.amountPkr : 0,
        t.type === 'Debit' ? t.amountPkr : 0,
        ledgerFilter === 'All'
          ? t.overallRunningBalance
          : t.ledgerRunningBalance,
      ])
    );
  };

  const downloadLeadsCsv = () => {
    exportRowsToCsv(
      `bait-ul-noor-donor-leads-${todayIso}.csv`,
      [
        'Lead ID',
        'Donor Name',
        'Phone',
        'Source',
        'Inquiry Date',
        'Stage',
        'Fund Interest',
        'Pledged (PKR)',
        'Received (PKR)',
        'Assigned To',
        'Non-Conversion Reason',
      ],
      systemState.leads.map((l: DonorLead) => [
        l.id,
        l.donorName,
        l.phone,
        l.source,
        l.inquiryDate,
        l.stage,
        l.fundInterest,
        l.pledgedAmountPkr,
        l.receivedAmountPkr,
        l.assignedTo,
        l.nonConversionReason || '',
      ])
    );
  };

  const downloadReconciliationCsv = () => {
    exportRowsToCsv(
      `bait-ul-noor-reconciliation-${todayIso}.csv`,
      [
        'Channel',
        'Type',
        'Account Ref',
        'Book Net (PKR)',
        'Statement Bal (PKR)',
        'Variance (PKR)',
        'Last Reconciled',
      ],
      systemState.reconciliations.map((r: ChannelReconciliation) => {
        const net = channelTotals[r.channel]?.net || 0;
        return [
          r.channel,
          r.channelType,
          r.accountRef,
          net,
          r.statementBalancePkr,
          r.statementBalancePkr - net,
          r.lastReconciledDate,
        ];
      })
    );
  };

  const handleExportFullBackup = async () => {
    try {
      const rawJson = JSON.stringify(systemState);
      const checksumSha256 = await sha256Hex(rawJson);
      const encrypted = Boolean(exportPassphrase.trim());
      const payload = encrypted
        ? obfuscateWithPassphrase(rawJson, exportPassphrase.trim())
        : rawJson;

      const backup: BackupFilePayload = {
        formatVersion: '1.0',
        organization: 'Bait-ul-Noor Orphanage Society',
        exportedAt: new Date().toISOString(),
        exportedBy: ROLE_PROFILES[currentRole].staffName,
        checksumSha256,
        encrypted,
        payload,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `bait-ul-noor-full-backup-${todayIso}.json`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: `Full system backup exported (${encrypted ? 'passphrase-encrypted' : 'structured JSON'} · SHA-256 verified).`,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Failed to generate backup file. Please try again.',
      });
    }
  };

  const handleSelectBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage(null);
    setPendingRestore(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFilePayload;
      if (!parsed.payload || !parsed.checksumSha256) {
        setStatusMessage({
          type: 'error',
          text: 'Invalid backup schema. Missing payload or SHA-256 checksum.',
        });
        return;
      }

      let rawJson = parsed.payload;
      if (parsed.encrypted) {
        if (!importPassphrase.trim()) {
          setStatusMessage({
            type: 'error',
            text: 'This backup file is passphrase-protected. Enter the backup passphrase first, then re-select the file.',
          });
          return;
        }
        rawJson = deobfuscateWithPassphrase(
          parsed.payload,
          importPassphrase.trim()
        );
      }

      const computedHash = await sha256Hex(rawJson);
      const stateObj = JSON.parse(rawJson) as SystemState;

      if (
        !Array.isArray(stateObj.leads) ||
        !Array.isArray(stateObj.transactions) ||
        !Array.isArray(stateObj.reconciliations)
      ) {
        setStatusMessage({
          type: 'error',
          text: 'Backup payload failed structure validation (missing leads or transactions).',
        });
        return;
      }

      setPendingRestore({
        fileName: file.name,
        state: stateObj,
        checksumVerified: computedHash === parsed.checksumSha256,
        exportedAt: parsed.exportedAt,
        exportedBy: parsed.exportedBy,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Unable to parse or decrypt backup file. Check the file format and passphrase.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      await onRestoreSystemState(
        pendingRestore.state,
        `Restored backup ${pendingRestore.fileName} (exported ${pendingRestore.exportedAt})`
      );
      setStatusMessage({
        type: 'success',
        text: `Database restored cleanly from ${pendingRestore.fileName}. All ledgers and balances recalculated.`,
      });
      setPendingRestore(null);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Restore failed on the server.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* MongoDB Atlas Database & Collections Status */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-emerald-900 shrink-0" />
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                MongoDB Atlas Database &amp; Collections
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Server-side persistence via <span className="font-mono">MONGODB_URI</span> in Secrets ({dbStatus?.databaseName || 'bait_ul_noor_crm'})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshDb}
            disabled={refreshingDb}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshingDb ? 'animate-spin' : ''}`}
            />
            <span>Verify Atlas Connection</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs pb-4 border-b border-slate-100">
            <div>
              <span className="text-slate-500">Active Storage Mode: </span>
              <span
                className={`font-medium ${
                  dbStatus?.storageMode === 'atlas'
                    ? 'text-emerald-800'
                    : 'text-amber-800'
                }`}
              >
                {dbStatus?.storageMode === 'atlas'
                  ? 'MongoDB Atlas Connected'
                  : 'Preview Server Memory Store (Configure MONGODB_URI in Secrets to persist to MongoDB Atlas)'}
              </span>
            </div>
            {dbStatus?.errorMessage && (
              <div className="text-rose-700 font-medium">
                {dbStatus.errorMessage}
              </div>
            )}
          </div>

          {dbStatus && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {(
                [
                  ['leads', dbStatus.collections.leads],
                  ['transactions', dbStatus.collections.transactions],
                  ['reconciliations', dbStatus.collections.reconciliations],
                  ['assets', dbStatus.collections.assets],
                  ['ration_stock', dbStatus.collections.rationStock],
                  ['audit_trail', dbStatus.collections.auditTrail],
                  ['website_sync', dbStatus.collections.websiteSyncEvents],
                ] as const
              ).map(([colName, count]) => (
                <div
                  key={colName}
                  className="border border-slate-200 rounded-md px-3 py-2.5 bg-slate-50/60"
                >
                  <div className="font-mono text-[11px] text-slate-500 truncate">
                    {colName}
                  </div>
                  <div className="font-mono tabular-nums text-base font-semibold text-slate-900 mt-0.5">
                    {count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Excel & PDF Statement Exports */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-semibold text-base text-slate-900">
              Excel (.csv) &amp; Printable PDF Statement Downloads
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Download formatted Excel spreadsheets or formal printable PDF statements across all ledgers, donor lists, and bank reconciliations
            </p>
          </div>
          {!canExportReports && (
            <span className="text-xs text-amber-700 font-medium">
              Financial exports require Accountant or Management role
            </span>
          )}
        </div>

        <div className="divide-y divide-slate-200">
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm text-slate-900">
                Donor Leads &amp; Conversion Report
              </div>
              <div className="text-xs text-slate-500">
                {systemState.leads.length} donor inquiries across Meta Ads, WhatsApp &amp; Website
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadLeadsCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (.csv)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenPrint({
                    kind: 'leads',
                    title: 'Donor Leads & Conversion Statement',
                    subtitle: `Complete CRM inquiry log (${systemState.leads.length} records)`,
                    leads: systemState.leads,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Statement</span>
              </button>
            </div>
          </div>

          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm text-slate-900">
                Master Credit / Debit Transaction Statement
              </div>
              <div className="text-xs text-slate-500">
                All {chronological.length} chronological entries with running balances &amp; backdate flags
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() => downloadLedgerCsv('All')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (.csv)</span>
              </button>
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() =>
                  onOpenPrint({
                    kind: 'ledger',
                    title: 'Master Credit / Debit Transaction Statement',
                    subtitle:
                      'All four dedicated NGO ledgers (Welfare, Admin, Marketing, Miscellaneous)',
                    ledgerFilter: 'All',
                    transactions: chronological,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Statement</span>
              </button>
            </div>
          </div>

          {LEDGER_NAMES.map((ledger) => {
            const count = chronological.filter(
              (t) => t.ledger === ledger
            ).length;
            return (
              <div
                key={ledger}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <div className="font-medium text-sm text-slate-900">
                    {ledger} Report
                  </div>
                  <div className="text-xs text-slate-500">
                    {count} chronological entries with dedicated ledger running balance
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canExportReports}
                    onClick={() => downloadLedgerCsv(ledger)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel (.csv)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!canExportReports}
                    onClick={() =>
                      onOpenPrint({
                        kind: 'ledger',
                        title: `${ledger} Financial Statement`,
                        subtitle: `Individual departmental ledger report (${count} entries)`,
                        ledgerFilter: ledger,
                        transactions: chronological.filter(
                          (t) => t.ledger === ledger
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PDF Statement</span>
                  </button>
                </div>
              </div>
            );
          })}

          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm text-slate-900">
                Bank &amp; Wallet Reconciliation Statement
              </div>
              <div className="text-xs text-slate-500">
                Faysal Bank, Meezan Bank, JazzCash, EasyPaisa &amp; Donation Boxes
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canExportReports}
                onClick={downloadReconciliationCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (.csv)</span>
              </button>
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() =>
                  onOpenPrint({
                    kind: 'reconciliation',
                    title: 'Bank, Wallet & Donation Box Reconciliation Statement',
                    subtitle:
                      'Book balance vs statement balance variance verification',
                    reconciliations: systemState.reconciliations,
                    channelTotals,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Statement</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Full System Backup Export & Import */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-base text-slate-900">
              Full System Backup Export &amp; Validated Restore
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              One-click complete backup (CRM leads, 4 ledgers, backdated audit trail, reconciliations, assets &amp; ration stock) with SHA-256 verification
            </p>
          </div>
          {!canManageBackups && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-800 font-medium">
              <ShieldCheck className="w-4 h-4" />
              Management / Admin Role Required for Backup &amp; Restore
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">
          {statusMessage && (
            <div
              className={`p-3.5 rounded-md border text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-slate-200 rounded-md p-5 space-y-4">
              <div>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  Export Full Database Backup
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Generates a checksum-signed offline backup file. Optionally enter a passphrase to encrypt the exported payload.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Encryption Passphrase (Optional)
                </label>
                <input
                  type="password"
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                  disabled={!canManageBackups}
                  placeholder="Leave blank for unencrypted JSON"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <button
                type="button"
                disabled={!canManageBackups}
                onClick={handleExportFullBackup}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Generate &amp; Download Full Backup (.json)</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-md p-5 space-y-4">
              <div>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  Import &amp; Restore Backup File
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Validates file structure and SHA-256 checksum before restoring MongoDB Atlas / system records.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Decryption Passphrase (If Backup Encrypted)
                </label>
                <input
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  disabled={!canManageBackups}
                  placeholder="Enter passphrase if file was encrypted"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  disabled={!canManageBackups}
                  onChange={handleSelectBackupFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={!canManageBackups}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Backup File (.json)</span>
                </button>
                <button
                  type="button"
                  disabled={!canManageBackups}
                  onClick={onResetToSeed}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Sample Data</span>
                </button>
              </div>

              {pendingRestore && (
                <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="font-medium text-slate-900">
                    Ready to Restore: {pendingRestore.fileName}
                  </div>
                  <div className="text-slate-600">
                    Checksum:{' '}
                    <span
                      className={
                        pendingRestore.checksumVerified
                          ? 'text-emerald-800 font-medium'
                          : 'text-rose-700 font-medium'
                      }
                    >
                      {pendingRestore.checksumVerified
                        ? 'SHA-256 Verified'
                        : 'Checksum Mismatch'}
                    </span>{' '}
                    · Exported by {pendingRestore.exportedBy}
                  </div>
                  <div className="font-mono tabular-nums text-slate-700">
                    {pendingRestore.state.leads.length} Leads ·{' '}
                    {pendingRestore.state.transactions.length} Ledger Entries ·{' '}
                    {pendingRestore.state.assets.length} Assets ·{' '}
                    {pendingRestore.state.rationStock.length} Ration Items
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={confirmRestore}
                      className="px-3.5 py-1.5 rounded bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                    >
                      Confirm &amp; Restore Database
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRestore(null)}
                      className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
