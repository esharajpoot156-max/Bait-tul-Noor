import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import {
  ActiveTab,
  ChannelReconciliation,
  DonorLead,
  IncomeFundType,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  SystemState,
  UserRole,
} from './types/system';
import { INITIAL_SYSTEM_STATE } from './data/seedData';
import {
  computeChronologicalLedgers,
  formatPkr,
  ROLE_PROFILES,
} from './utils/accounting';
import {
  approveBackdateApi,
  convertLeadApi,
  createAssetApi,
  createLeadApi,
  createRationApi,
  createTransactionApi,
  DatabaseHealth,
  fetchDatabaseHealth,
  fetchInitialSystemState,
  resetDatabaseApi,
  restoreSystemBackupApi,
  submitWebsiteSyncApi,
  updateLeadApi,
  updateReconciliationApi,
} from './utils/api';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { LeadsCrmView } from './components/LeadsCrmView';
import { LedgersView } from './components/LedgersView';
import { ChannelsAssetsView } from './components/ChannelsAssetsView';
import { WebsiteSyncView } from './components/WebsiteSyncView';
import { ReportsBackupView } from './components/ReportsBackupView';
import {
  PrintReportConfig,
  PrintStatementModal,
} from './components/PrintStatementModal';

const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Overview Dashboard',
    subtitle:
      'Real-time donor leads, four NGO ledgers, channels, and net society balances',
  },
  leads: {
    title: 'Donor Lead Management',
    subtitle:
      'Meta Ads, WhatsApp & Website inquiry pipeline, follow-ups, and conversions',
  },
  ledgers: {
    title: 'Account Ledgers & Vouchers',
    subtitle:
      'Welfare, Admin, Marketing & Miscellaneous double-entry books with backdated controls',
  },
  channels: {
    title: 'Channels, Assets & Ration Stock',
    subtitle:
      'Bank & mobile wallet reconciliation, Society Assets (Asase), and In-Kind Ration records',
  },
  website: {
    title: 'Direct Website & Meta Sync',
    subtitle:
      'Live public donation form, contact inquiry & WhatsApp click-to-chat integration',
  },
  reports: {
    title: 'Data Export, Backup & Atlas DB',
    subtitle:
      'Formatted Excel/PDF statements, MongoDB Atlas collections, and checksum-verified backups',
  },
};

export default function App() {
  const [systemState, setSystemState] =
    useState<SystemState>(INITIAL_SYSTEM_STATE);
  const [dbStatus, setDbStatus] = useState<DatabaseHealth | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentRole, setCurrentRole] = useState<UserRole>('management');
  const [selectedLedgerView, setSelectedLedgerView] = useState<
    LedgerName | 'All' | 'Audit'
  >('All');
  const [printConfig, setPrintConfig] = useState<PrintReportConfig | null>(
    null
  );

  const loadFromServer = useCallback(async () => {
    try {
      const res = await fetchInitialSystemState();
      setSystemState(res.state);
      setDbStatus(res.dbStatus);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Unable to load society records from backend server.'
      );
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  const refreshHealth = async () => {
    try {
      const status = await fetchDatabaseHealth();
      setDbStatus(status);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to check database health.'
      );
    }
  };

  const computed = useMemo(
    () => computeChronologicalLedgers(systemState.transactions),
    [systemState.transactions]
  );

  const pendingBackdateCount = useMemo(
    () =>
      computed.chronological.filter((t) => t.isBackdated && !t.backdateApproved)
        .length,
    [computed.chronological]
  );

  const newInquiriesCount = useMemo(
    () => systemState.leads.filter((l) => l.stage === 'New Inquiry').length,
    [systemState.leads]
  );

  const activeProfile = ROLE_PROFILES[currentRole];

  const runMutation = async (fn: () => Promise<{ state: SystemState }>) => {
    setErrorBanner(null);
    try {
      const { state } = await fn();
      setSystemState(state);
      void refreshHealth();
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Operation failed on server.'
      );
    }
  };

  const handleAddLead = (leadData: Omit<DonorLead, 'id' | 'createdAt'>) => {
    void runMutation(() => createLeadApi(leadData, currentRole));
  };

  const handleUpdateLead = (updatedLead: DonorLead) => {
    void runMutation(() => updateLeadApi(updatedLead, currentRole));
  };

  const handleAddTransaction = (
    txnInput: Omit<
      LedgerTransaction,
      | 'id'
      | 'voucherNo'
      | 'systemEntryTimestamp'
      | 'isBackdated'
      | 'backdateApproved'
      | 'backdateApprovedBy'
      | 'enteredByName'
      | 'enteredByRole'
    >
  ) => {
    void runMutation(() => createTransactionApi(txnInput, currentRole));
  };

  const handleApproveBackdate = (txnId: string) => {
    void runMutation(() => approveBackdateApi(txnId, currentRole));
  };

  const handleConvertLeadWithVoucher = (params: {
    lead: DonorLead;
    receivedAmountPkr: number;
    fundType: IncomeFundType;
    ledger: LedgerName;
    channel: PaymentChannel;
    transactionDate: string;
    notes: string;
  }) => {
    void runMutation(() =>
      convertLeadApi(
        params.lead.id,
        {
          receivedAmountPkr: params.receivedAmountPkr,
          fundType: params.fundType,
          ledger: params.ledger,
          channel: params.channel,
          transactionDate: params.transactionDate,
          notes: params.notes,
        },
        currentRole
      )
    );
  };

  const handleSimulateWebsiteSubmission = (params: {
    submissionType: 'donation' | 'contact' | 'meta_whatsapp';
    donorName: string;
    phone: string;
    fundType: IncomeFundType;
    amountPkr: number;
    channel?: PaymentChannel;
    campaignName?: string;
    notes: string;
  }) => {
    void runMutation(() => submitWebsiteSyncApi(params));
  };

  const handleUpdateReconciliation = (updated: ChannelReconciliation) => {
    void runMutation(() =>
      updateReconciliationApi(
        updated.channel,
        {
          statementBalancePkr: updated.statementBalancePkr,
          notes: updated.notes,
        },
        currentRole
      )
    );
  };

  const handleAddAsset = (asset: Omit<SocietyAsset, 'id'>) => {
    void runMutation(() => createAssetApi(asset, currentRole));
  };

  const handleAddRation = (item: Omit<RationStockItem, 'id'>) => {
    void runMutation(() => createRationApi(item, currentRole));
  };

  const handleRestoreSystemState = async (
    restored: SystemState,
    actorNote: string
  ) => {
    const { state } = await restoreSystemBackupApi(
      restored,
      actorNote,
      currentRole
    );
    setSystemState(state);
    await refreshHealth();
  };

  const handleResetToSeed = async () => {
    await runMutation(() => resetDatabaseApi(currentRole));
  };

  const headerMeta = TAB_TITLES[activeTab];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentRole={currentRole}
          onChangeRole={setCurrentRole}
          pendingBackdateCount={pendingBackdateCount}
          newInquiriesCount={newInquiriesCount}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Workspace Header */}
          <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span>Bait-ul-Noor Orphanage Society</span>
                <span aria-hidden="true">/</span>
                <span className="text-slate-700 font-medium">
                  {headerMeta.title}
                </span>
              </div>
              <h1 className="font-display font-bold text-lg text-slate-900 mt-0.5">
                {headerMeta.title}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                {headerMeta.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-500">
                  Net Society Balance
                </div>
                <div className="font-mono tabular-nums text-sm font-semibold text-emerald-900">
                  {formatPkr(computed.netBalance)}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveTab(currentRole === 'followup' ? 'leads' : 'ledgers')
                }
                className="px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                {currentRole === 'followup'
                  ? 'Open Donor Pipeline'
                  : 'Open Ledger Register'}
              </button>
            </div>
          </header>

          {errorBanner && (
            <div className="no-print mx-6 mt-4 p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="p-1 text-rose-700 hover:text-rose-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main Content Viewport */}
          <main className="no-print flex-1 p-5 sm:p-6 max-w-[1440px] w-full mx-auto">
            {loadingInitial ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
                <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
              </div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'dashboard' && (
                  <DashboardView
                    leads={systemState.leads}
                    chronological={computed.chronological}
                    ledgerTotals={computed.ledgerTotals}
                    channelTotals={computed.channelTotals}
                    fundTotals={computed.fundTotals}
                    totalCredits={computed.totalCredits}
                    totalDebits={computed.totalDebits}
                    netBalance={computed.netBalance}
                    assets={systemState.assets}
                    rationStock={systemState.rationStock}
                    websiteSyncEvents={systemState.websiteSyncEvents}
                    onNavigateTab={setActiveTab}
                    onSelectLedgerFromDashboard={(ledger) => {
                      setSelectedLedgerView(ledger);
                      setActiveTab('ledgers');
                    }}
                  />
                )}

                {activeTab === 'leads' && (
                  <LeadsCrmView
                    leads={systemState.leads}
                    currentRole={currentRole}
                    currentStaffName={activeProfile.staffName}
                    onAddLead={handleAddLead}
                    onUpdateLead={handleUpdateLead}
                    onConvertLeadWithVoucher={handleConvertLeadWithVoucher}
                    onOpenPrint={setPrintConfig}
                  />
                )}

                {activeTab === 'ledgers' && (
                  <LedgersView
                    chronological={computed.chronological}
                    ledgerTotals={computed.ledgerTotals}
                    auditTrail={systemState.auditTrail}
                    leads={systemState.leads}
                    currentRole={currentRole}
                    selectedLedger={selectedLedgerView}
                    onSelectLedger={setSelectedLedgerView}
                    onAddTransaction={handleAddTransaction}
                    onApproveBackdate={handleApproveBackdate}
                    onOpenPrint={setPrintConfig}
                  />
                )}

                {activeTab === 'channels' && (
                  <ChannelsAssetsView
                    reconciliations={systemState.reconciliations}
                    channelTotals={computed.channelTotals}
                    assets={systemState.assets}
                    rationStock={systemState.rationStock}
                    currentRole={currentRole}
                    onUpdateReconciliation={handleUpdateReconciliation}
                    onAddAsset={handleAddAsset}
                    onAddRation={handleAddRation}
                    onOpenPrint={setPrintConfig}
                  />
                )}

                {activeTab === 'website' && (
                  <WebsiteSyncView
                    syncEvents={systemState.websiteSyncEvents}
                    onSimulateWebsiteSubmission={
                      handleSimulateWebsiteSubmission
                    }
                    onNavigateTab={setActiveTab}
                  />
                )}

                {activeTab === 'reports' && (
                  <ReportsBackupView
                    systemState={systemState}
                    chronological={computed.chronological}
                    channelTotals={computed.channelTotals}
                    currentRole={currentRole}
                    dbStatus={dbStatus}
                    onRefreshDbStatus={refreshHealth}
                    onRestoreSystemState={handleRestoreSystemState}
                    onResetToSeed={handleResetToSeed}
                    onOpenPrint={setPrintConfig}
                  />
                )}
              </motion.div>
            )}
          </main>
        </div>

        <PrintStatementModal
          config={printConfig}
          onClose={() => setPrintConfig(null)}
        />
      </div>
    </MotionConfig>
  );
}
