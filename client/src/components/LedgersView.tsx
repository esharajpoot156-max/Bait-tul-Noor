import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Printer,
  Check,
  Clock,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  ComputedTransaction,
  DonorLead,
  ExpenseHead,
  IncomeFundType,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  TransactionType,
  UserRole,
} from '../types/system';
import {
  EXPENSE_HEADS,
  exportRowsToCsv,
  formatPkr,
  formatShortDate,
  formatTimestamp,
  getTodayIsoDate,
  INCOME_FUND_TYPES,
  LEDGER_META,
  LEDGER_NAMES,
  PAYMENT_CHANNELS,
} from '../utils/accounting';
import { PrintReportConfig } from './PrintStatementModal';

interface LedgersViewProps {
  chronological: ComputedTransaction[];
  ledgerTotals: Record<
    LedgerName,
    { credits: number; debits: number; net: number; count: number }
  >;
  auditTrail: AuditLogEntry[];
  leads: DonorLead[];
  currentRole: UserRole;
  selectedLedger: LedgerName | 'All' | 'Audit';
  onSelectLedger: (view: LedgerName | 'All' | 'Audit') => void;
  onAddTransaction: (
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
    >
  ) => void;
  onApproveBackdate: (txnId: string) => void;
  onOpenPrint: (config: PrintReportConfig) => void;
}

export const LedgersView: React.FC<LedgersViewProps> = ({
  chronological,
  ledgerTotals,
  auditTrail,
  leads,
  currentRole,
  selectedLedger,
  onSelectLedger,
  onAddTransaction,
  onApproveBackdate,
  onOpenPrint,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'All'>('All');
  const [channelFilter, setChannelFilter] = useState<PaymentChannel | 'All'>(
    'All'
  );
  const [backdatedOnly, setBackdatedOnly] = useState(false);

  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [vType, setVType] = useState<TransactionType>('Credit');
  const [vLedger, setVLedger] = useState<LedgerName>('Welfare Ledger');
  const [vCategory, setVCategory] = useState<IncomeFundType | ExpenseHead>(
    'Zakaat'
  );
  const [vChannel, setVChannel] = useState<PaymentChannel>('Meezan Bank');
  const [vDate, setVDate] = useState(getTodayIsoDate());
  const [vAmount, setVAmount] = useState('');
  const [vParty, setVParty] = useState('');
  const [vLinkedLead, setVLinkedLead] = useState('');
  const [vNotes, setVNotes] = useState('');

  const canPostEntries =
    currentRole === 'management' || currentRole === 'accountant';
  const canApproveBackdates = currentRole === 'management';

  const todayIso = getTodayIsoDate();
  const isFormBackdated = vDate < todayIso;

  const filteredTxns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chronological.filter((t) => {
      if (
        selectedLedger !== 'All' &&
        selectedLedger !== 'Audit' &&
        t.ledger !== selectedLedger
      ) {
        return false;
      }
      if (typeFilter !== 'All' && t.type !== typeFilter) return false;
      if (channelFilter !== 'All' && t.channel !== channelFilter) return false;
      if (backdatedOnly && !t.isBackdated) return false;
      if (!q) return true;
      return (
        t.voucherNo.toLowerCase().includes(q) ||
        t.donorOrPayee.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      );
    });
  }, [
    chronological,
    selectedLedger,
    typeFilter,
    channelFilter,
    backdatedOnly,
    searchQuery,
  ]);

  const activeLedgerTotals = useMemo(() => {
    if (selectedLedger === 'All' || selectedLedger === 'Audit') {
      const credits = chronological
        .filter((t) => t.type === 'Credit')
        .reduce((s, t) => s + t.amountPkr, 0);
      const debits = chronological
        .filter((t) => t.type === 'Debit')
        .reduce((s, t) => s + t.amountPkr, 0);
      return {
        credits,
        debits,
        net: credits - debits,
        count: chronological.length,
      };
    }
    return ledgerTotals[selectedLedger];
  }, [selectedLedger, chronological, ledgerTotals]);

  const pendingBackdates = chronological.filter(
    (t) => t.isBackdated && !t.backdateApproved
  ).length;

  const openModalWithType = (type: TransactionType) => {
    setVType(type);
    const targetLedger =
      selectedLedger !== 'All' && selectedLedger !== 'Audit'
        ? selectedLedger
        : 'Welfare Ledger';
    setVLedger(targetLedger);
    if (type === 'Credit') {
      setVCategory(LEDGER_META[targetLedger].primaryInflows[0]);
    } else {
      setVCategory(LEDGER_META[targetLedger].primaryExpenses[0]);
    }
    setVDate(todayIso);
    setVAmount('');
    setVParty('');
    setVLinkedLead('');
    setVNotes('');
    setShowVoucherModal(true);
  };

  const handleSubmitVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(vAmount) || 0);
    if (amt <= 0 || !vParty.trim()) return;
    onAddTransaction({
      transactionDate: vDate,
      type: vType,
      ledger: vLedger,
      category: vCategory,
      channel: vChannel,
      amountPkr: amt,
      donorOrPayee: vParty.trim(),
      linkedLeadId: vLinkedLead || undefined,
      notes: vNotes.trim(),
    });
    setShowVoucherModal(false);
  };

  const handleExportCsv = () => {
    const label =
      selectedLedger === 'All' || selectedLedger === 'Audit'
        ? 'Master-All-Ledgers'
        : selectedLedger.replace(/\s+/g, '-');
    exportRowsToCsv(
      `bait-ul-noor-${label}-${todayIso}.csv`,
      [
        'Transaction Date',
        'Backdated',
        'Backdate Approved',
        'System Entry Timestamp',
        'Voucher #',
        'Ledger',
        'Type',
        'Category / Account Head',
        'Channel',
        'Donor / Payee',
        'Credit (PKR)',
        'Debit (PKR)',
        'Ledger Running Balance (PKR)',
        'Overall Running Balance (PKR)',
        'Entered By',
        'Notes',
      ],
      filteredTxns.map((t) => [
        t.transactionDate,
        t.isBackdated ? 'Yes' : 'No',
        t.backdateApproved ? 'Approved' : 'Pending',
        t.systemEntryTimestamp,
        t.voucherNo,
        t.ledger,
        t.type,
        t.category,
        t.channel,
        t.donorOrPayee,
        t.type === 'Credit' ? t.amountPkr : 0,
        t.type === 'Debit' ? t.amountPkr : 0,
        t.ledgerRunningBalance,
        t.overallRunningBalance,
        t.enteredByName,
        t.notes,
      ])
    );
  };

  return (
    <div className="space-y-5">
      {/* Ledger Tabs + Actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => onSelectLedger('All')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                selectedLedger === 'All'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Ledgers
            </button>
            {LEDGER_NAMES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onSelectLedger(l)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  selectedLedger === l
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {LEDGER_META[l].shortName}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSelectLedger('Audit')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                selectedLedger === 'Audit'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit Trail ({auditTrail.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedLedger !== 'Audit' && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenPrint({
                      kind: 'ledger',
                      title:
                        selectedLedger === 'All'
                          ? 'Master Credit / Debit Ledger Statement'
                          : `${selectedLedger} Statement`,
                      subtitle:
                        selectedLedger === 'All'
                          ? 'Chronological double-entry statement across all four NGO ledgers'
                          : LEDGER_META[selectedLedger].scope,
                      ledgerFilter: selectedLedger,
                      transactions: filteredTxns,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF Statement</span>
                </button>
              </>
            )}

            {canPostEntries ? (
              <button
                type="button"
                onClick={() => openModalWithType('Credit')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Credit / Debit</span>
              </button>
            ) : (
              <span className="text-xs text-slate-500 px-2">
                View-only in Follow-Up Staff role
              </span>
            )}
          </div>
        </div>

        {/* Ledger Scope & Summary */}
        {selectedLedger !== 'Audit' && (
          <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 max-w-2xl">
              <span className="font-medium text-slate-900">
                {selectedLedger === 'All'
                  ? 'Consolidated Society Ledgers: '
                  : `${selectedLedger}: `}
              </span>
              {selectedLedger === 'All'
                ? 'Combined chronological inflows (Amdan) and outflows (Kharch) across Welfare, Admin, Marketing, and Miscellaneous ledgers.'
                : LEDGER_META[selectedLedger].scope}
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs shrink-0">
              <div>
                <div className="text-slate-500">Total Credit (Amdan)</div>
                <div className="font-mono tabular-nums font-semibold text-emerald-800 text-sm">
                  {formatPkr(activeLedgerTotals.credits)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Total Debit (Kharch)</div>
                <div className="font-mono tabular-nums font-semibold text-rose-700 text-sm">
                  {formatPkr(activeLedgerTotals.debits)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Net Balance</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                  {formatPkr(activeLedgerTotals.net)}
                </div>
              </div>
              {pendingBackdates > 0 && (
                <div>
                  <div className="text-slate-500">Backdates</div>
                  <div className="font-mono tabular-nums font-semibold text-amber-700 text-sm">
                    {pendingBackdates} Pending
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        {selectedLedger !== 'Audit' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search voucher, donor, payee..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as TransactionType | 'All')
              }
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
            >
              <option value="All">All Credit &amp; Debit Entries</option>
              <option value="Credit">Credit Only (Amdan / Inflow)</option>
              <option value="Debit">Debit Only (Kharch / Outflow)</option>
            </select>

            <select
              value={channelFilter}
              onChange={(e) =>
                setChannelFilter(e.target.value as PaymentChannel | 'All')
              }
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
            >
              <option value="All">All Channels &amp; Wallets</option>
              {PAYMENT_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={backdatedOnly}
                onChange={(e) => setBackdatedOnly(e.target.checked)}
                className="accent-emerald-900"
              />
              <span>Backdated Vouchers Only</span>
            </label>
          </div>
        )}
      </div>

      {/* Ledger Table */}
      {selectedLedger !== 'Audit' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredTxns.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-sm font-medium text-slate-900">
                No ledger vouchers match your filter
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Clear your search filters or record a new Credit/Debit voucher.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-3 px-4">Txn Date &amp; Audit</th>
                    <th className="py-3 px-4">Voucher #</th>
                    <th className="py-3 px-4">Ledger &amp; Account Head</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Donor / Payee</th>
                    <th className="py-3 px-4 text-right">Credit (Amdan)</th>
                    <th className="py-3 px-4 text-right">Debit (Kharch)</th>
                    <th className="py-3 px-4 text-right">
                      {selectedLedger === 'All'
                        ? 'Overall Bal'
                        : 'Ledger Bal'}
                    </th>
                    <th className="py-3 px-4 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTxns.map((txn) => {
                    const displayBal =
                      selectedLedger === 'All'
                        ? txn.overallRunningBalance
                        : txn.ledgerRunningBalance;

                    return (
                      <tr key={txn.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 whitespace-nowrap align-top">
                          <div className="font-mono tabular-nums font-medium text-slate-900">
                            {formatShortDate(txn.transactionDate)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Entered {formatTimestamp(txn.systemEntryTimestamp)}
                          </div>
                          {txn.isBackdated && (
                            <div className="text-[11px] font-medium text-amber-700 mt-0.5">
                              Backdated Entry
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap align-top text-slate-700">
                          <div>{txn.voucherNo}</div>
                          {txn.linkedLeadId && (
                            <div className="text-[11px] text-emerald-800">
                              Lead {txn.linkedLeadId}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <div className="font-medium text-slate-900">
                            {txn.category}
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {txn.ledger} · {txn.notes || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap align-top text-slate-700">
                          {txn.channel}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <div className="font-medium text-slate-900">
                            {txn.donorOrPayee}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            By {txn.enteredByName}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-800 font-medium whitespace-nowrap align-top">
                          {txn.type === 'Credit'
                            ? formatPkr(txn.amountPkr)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700 font-medium whitespace-nowrap align-top">
                          {txn.type === 'Debit'
                            ? formatPkr(txn.amountPkr)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap align-top">
                          {formatPkr(displayBal)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                          {txn.isBackdated ? (
                            txn.backdateApproved ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-medium">
                                <Check className="w-3 h-3" />
                                Approved
                              </span>
                            ) : canApproveBackdates ? (
                              <button
                                type="button"
                                onClick={() => onApproveBackdate(txn.id)}
                                className="px-2.5 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-medium hover:bg-amber-100"
                              >
                                Approve Backdate
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                                <Clock className="w-3 h-3" />
                                Pending Admin
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Posted
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Audit Trail View */
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Backdated Voucher &amp; System Audit Trail
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable log of Transaction Date vs System Entry Timestamp, backdate approvals, and automated sync events
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-5">System Timestamp</th>
                  <th className="py-3 px-4">Actor &amp; Role</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-5">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditTrail.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 px-5 font-mono tabular-nums whitespace-nowrap text-slate-700">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">
                        {entry.actorName}
                      </span>
                      <span className="text-slate-500"> · {entry.actorRole}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap text-emerald-900">
                      {entry.targetRef}
                    </td>
                    <td className="py-3 px-5 text-slate-600">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Credit / Debit Voucher Modal */}
      {showVoucherModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-base text-slate-900">
                  Record Credit / Debit Ledger Voucher
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological running balances recalculate automatically on submission
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVoucherModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitVoucher}
              className="p-6 space-y-4 text-xs"
            >
              {/* Type Segmented Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    setVType('Credit');
                    setVCategory(LEDGER_META[vLedger].primaryInflows[0]);
                  }}
                  className={`py-2 px-3 rounded text-xs font-semibold transition-colors ${
                    vType === 'Credit'
                      ? 'bg-emerald-900 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Credit (Amdan / Inflow)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVType('Debit');
                    setVCategory(LEDGER_META[vLedger].primaryExpenses[0]);
                  }}
                  className={`py-2 px-3 rounded text-xs font-semibold transition-colors ${
                    vType === 'Debit'
                      ? 'bg-rose-800 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Debit (Kharch / Outflow)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Ledger
                  </label>
                  <select
                    value={vLedger}
                    onChange={(e) => {
                      const nextL = e.target.value as LedgerName;
                      setVLedger(nextL);
                      setVCategory(
                        vType === 'Credit'
                          ? LEDGER_META[nextL].primaryInflows[0]
                          : LEDGER_META[nextL].primaryExpenses[0]
                      );
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {LEDGER_NAMES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Transaction Date (Supports Backdating)
                  </label>
                  <input
                    type="date"
                    required
                    max={todayIso}
                    value={vDate}
                    onChange={(e) => setVDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>

              {isFormBackdated && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-amber-900">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">
                      Backdated Entry Mode ({formatShortDate(vDate)})
                    </div>
                    <p className="text-[11px] mt-0.5">
                      Chronological running balances will automatically recalculate from {formatShortDate(vDate)} onward. Both Transaction Date and System Entry Timestamp are recorded in the audit trail.
                      {currentRole === 'accountant'
                        ? ' Requires Management/Admin approval badge after posting.'
                        : ' Auto-approved under Management/Admin role.'}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {vType === 'Credit'
                    ? 'Income / Fund Type (Amdan)'
                    : 'Operational Expense Head (Akhrajat)'}
                </label>
                <select
                  value={vCategory}
                  onChange={(e) =>
                    setVCategory(
                      e.target.value as IncomeFundType | ExpenseHead
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  {vType === 'Credit'
                    ? INCOME_FUND_TYPES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))
                    : EXPENSE_HEADS.map((eh) => (
                        <option key={eh} value={eh}>
                          {eh}
                        </option>
                      ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Channel / Asset
                  </label>
                  <select
                    value={vChannel}
                    onChange={(e) =>
                      setVChannel(e.target.value as PaymentChannel)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {PAYMENT_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={vAmount}
                    onChange={(e) => setVAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {vType === 'Credit' ? 'Donor Name / Source *' : 'Payee / Vendor *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={vParty}
                    onChange={(e) => setVParty(e.target.value)}
                    placeholder={
                      vType === 'Credit'
                        ? 'e.g. Haji Muhammad Aslam'
                        : 'e.g. Al-Noor Book Depot'
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>

                {vType === 'Credit' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Link CRM Lead (Optional)
                    </label>
                    <select
                      value={vLinkedLead}
                      onChange={(e) => setVLinkedLead(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                    >
                      <option value="">No linked lead</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id} · {l.donorName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Voucher Narration &amp; Receipt Reference
                </label>
                <textarea
                  rows={2}
                  value={vNotes}
                  onChange={(e) => setVNotes(e.target.value)}
                  placeholder="Receipt #, IBFT reference, or expense description..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoucherModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  Post Voucher &amp; Recalculate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
