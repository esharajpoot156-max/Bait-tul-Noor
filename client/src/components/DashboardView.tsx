import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import {
  ActiveTab,
  ComputedTransaction,
  DonorLead,
  LedgerName,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  WebsiteSyncEvent,
} from '../types/system';
import {
  formatPkr,
  formatShortDate,
  formatTimestamp,
  INCOME_FUND_TYPES,
  LEDGER_META,
  LEDGER_NAMES,
} from '../utils/accounts';

interface DashboardViewProps {
  leads: DonorLead[];
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
  assets: SocietyAsset[];
  rationStock: RationStockItem[];
  websiteSyncEvents: WebsiteSyncEvent[];
  onNavigateTab: (tab: ActiveTab) => void;
  // Only Management can open the Website & Meta Sync simulator (default: hidden)
  canTestSync?: boolean;
  onSelectLedgerFromDashboard: (ledger: LedgerName) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  leads,
  chronological,
  ledgerTotals,
  channelTotals,
  fundTotals,
  totalCredits,
  totalDebits,
  netBalance,
  assets,
  rationStock,
  websiteSyncEvents,
  onNavigateTab,
  canTestSync = false,
  onSelectLedgerFromDashboard,
}) => {
  const [hoveredLedger, setHoveredLedger] = useState<LedgerName | null>(null);

  const newCount = leads.filter((l) => l.stage === 'New Inquiry').length;
  const qualifiedCount = leads.filter((l) => l.stage === 'Qualified').length;
  const convertedCount = leads.filter(
    (l) => l.stage === 'Converted / Donated'
  ).length;
  const lostCount = leads.filter(
    (l) => l.stage === 'Not Converted / Closed Lost'
  ).length;

  const metaWhatsappLeads = leads.filter(
    (l) =>
      l.source === 'Meta Ads (WhatsApp)' || l.source === 'Direct WhatsApp'
  );
  const metaWhatsappConverted = metaWhatsappLeads.filter(
    (l) => l.stage === 'Converted / Donated'
  ).length;
  const metaConversionRate =
    metaWhatsappLeads.length > 0
      ? Math.round((metaWhatsappConverted / metaWhatsappLeads.length) * 100)
      : 0;

  const totalPledged = leads.reduce((sum, l) => sum + l.pledgedAmountPkr, 0);
  const totalReceivedFromLeads = leads.reduce(
    (sum, l) => sum + l.receivedAmountPkr,
    0
  );

  const pendingBackdateCount = chronological.filter(
    (t) => t.isBackdated && !t.backdateApproved
  ).length;

  const totalAssetValue = assets.reduce(
    (sum, a) => sum + a.quantity * a.unitValuePkr,
    0
  );
  const totalRationValue = rationStock.reduce(
    (sum, r) => sum + r.estimatedValuePkr,
    0
  );

  const activeChannels: PaymentChannel[] = [
    'Faysal Bank',
    'Meezan Bank',
    'JazzCash',
    'EasyPaisa',
    'Donation Boxes',
  ];

  const maxChannelAbs = Math.max(
    1,
    ...activeChannels.map((ch) => Math.abs(channelTotals[ch]?.net || 0))
  );

  const maxLedgerBarValue = Math.max(
    1,
    ...LEDGER_NAMES.flatMap((name) => [
      ledgerTotals[name].credits,
      ledgerTotals[name].debits,
    ])
  );

  const fundEntries = INCOME_FUND_TYPES.map((fund) => ({
    fund,
    amount: fundTotals[fund] || 0,
  })).sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Real-Time Net Society Balance
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
            {formatPkr(netBalance)}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            <span>Across 4 ledgers</span>
            <span aria-hidden="true">·</span>
            <span>{chronological.length} posted vouchers</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Total Credit Inflows (Amdan)
            </span>
            <ArrowUpRight className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-emerald-800 mt-1.5">
            {formatPkr(totalCredits)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            From {chronological.filter((t) => t.type === 'Credit').length} credit
            receipts
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Total Debit Outflows (Akhrajat)
            </span>
            <ArrowDownRight className="w-4 h-4 text-rose-700" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-rose-700 mt-1.5">
            {formatPkr(totalDebits)}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            <span>
              {chronological.filter((t) => t.type === 'Debit').length} expense
              vouchers
            </span>
            {pendingBackdateCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-medium">
                  {pendingBackdateCount} backdate pending
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Meta &amp; WhatsApp Conversion Rate
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-slate-900 mt-1.5">
            {metaConversionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            <span>
              {metaWhatsappConverted} of {metaWhatsappLeads.length} Meta/WA leads
            </span>
            <span aria-hidden="true">·</span>
            <span>{leads.length} total inquiries</span>
          </div>
        </div>
      </div>

      {/* Interactive Ledger Inflow vs Outflow Chart + Four Dedicated Account Ledgers Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="bg-white border border-slate-200 rounded-lg xl:col-span-5 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Ledger Inflow vs. Outflow Balance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hover or click any ledger bar to inspect entries
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-800 inline-block" />
                Credit
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-700 inline-block" />
                Debit
              </span>
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between">
            <svg
              viewBox="0 0 420 210"
              className="w-full h-52 overflow-visible"
              role="img"
              aria-label="Four Ledger Credit versus Debit comparison chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = 170 - tick * 145;
                return (
                  <g key={tick}>
                    <line
                      x1="12"
                      y1={y}
                      x2="408"
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray={tick === 0 ? undefined : '3 3'}
                    />
                  </g>
                );
              })}

              {LEDGER_NAMES.map((name, idx) => {
                const stats = ledgerTotals[name];
                const groupX = 28 + idx * 96;
                const creditH = Math.max(
                  3,
                  (stats.credits / maxLedgerBarValue) * 145
                );
                const debitH = Math.max(
                  3,
                  (stats.debits / maxLedgerBarValue) * 145
                );
                const isHovered = hoveredLedger === name;

                return (
                  <g
                    key={name}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredLedger(name)}
                    onMouseLeave={() => setHoveredLedger(null)}
                    onClick={() => onSelectLedgerFromDashboard(name)}
                  >
                    <rect
                      x={groupX - 6}
                      y={16}
                      width="72"
                      height="160"
                      rx="6"
                      fill={isHovered ? '#F1F5F9' : 'transparent'}
                    />
                    <rect
                      x={groupX + 4}
                      y={170 - creditH}
                      width="22"
                      height={creditH}
                      rx="3"
                      fill="#065F46"
                    />
                    <rect
                      x={groupX + 32}
                      y={170 - debitH}
                      width="22"
                      height={debitH}
                      rx="3"
                      fill="#BE123C"
                    />
                    <text
                      x={groupX + 30}
                      y="192"
                      textAnchor="middle"
                      className="fill-slate-700 text-[11px] font-medium"
                    >
                      {LEDGER_META[name].shortName}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs min-h-[36px]">
              {hoveredLedger ? (
                <>
                  <span className="font-medium text-slate-900">
                    {hoveredLedger}
                  </span>
                  <span className="font-mono tabular-nums text-slate-700">
                    In {formatPkr(ledgerTotals[hoveredLedger].credits)} · Out{' '}
                    {formatPkr(ledgerTotals[hoveredLedger].debits)} · Net{' '}
                    <strong className="text-slate-900">
                      {formatPkr(ledgerTotals[hoveredLedger].net)}
                    </strong>
                  </span>
                </>
              ) : (
                <span className="text-slate-500">
                  Welfare holds the largest restricted &amp; Zakaat pool; click a bar to inspect vouchers.
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg xl:col-span-7 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Four Dedicated Account Ledgers
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Departmental separation across Welfare, Admin, Marketing, and Miscellaneous accounts
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('ledgers')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 hover:text-emerald-700 whitespace-nowrap shrink-0"
            >
              <span>Open Ledger Register</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-5">Account Ledger</th>
                  <th className="py-3 px-4 text-right">Credits (Amdan)</th>
                  <th className="py-3 px-4 text-right">Debits (Kharch)</th>
                  <th className="py-3 px-4 text-right">Net Balance</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {LEDGER_NAMES.map((name) => {
                  const stats = ledgerTotals[name];
                  return (
                    <tr
                      key={name}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-5 align-top">
                        <div className="font-medium text-slate-900">{name}</div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {stats.count} entries
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                        {formatPkr(stats.credits)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                        {formatPkr(stats.debits)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatPkr(stats.net)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectLedgerFromDashboard(name)}
                          className="text-xs font-medium text-emerald-900 hover:underline"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Two-Column Breakdown: Channels Liquidity + Lead Funnel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        {/* Channel Balances */}
        <section className="bg-white border border-slate-200 rounded-lg flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Payment Channels &amp; Physical Assets
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Banks, mobile wallets, donation boxes, society assets &amp; ration valuation
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('channels')}
              className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0"
            >
              Reconcile
            </button>
          </div>
          <div className="divide-y divide-slate-200 flex-1">
            {activeChannels.map((ch) => {
              const stats = channelTotals[ch];
              const pct = Math.max(
                4,
                Math.min(100, Math.round((Math.abs(stats.net) / maxChannelAbs) * 100))
              );
              return (
                <div key={ch} className="px-5 py-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-medium text-slate-900">{ch}</span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums ml-2">
                        In {formatPkr(stats.credits)} · Out{' '}
                        {formatPkr(stats.debits)}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatPkr(stats.net)}
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-800 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="px-5 py-3 bg-slate-50/70 flex items-center justify-between gap-4 text-xs text-slate-600">
              <span>Society Assets (Asase) Valuation</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatPkr(totalAssetValue)}
              </span>
            </div>
            <div className="px-5 py-3 bg-slate-50/70 flex items-center justify-between gap-4 text-xs text-slate-600 rounded-b-lg">
              <span>In-Kind Ration / Ajnaas Stock Valuation</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatPkr(totalRationValue)}
              </span>
            </div>
          </div>
        </section>

        {/* Donor Pipeline & Website Sync */}
        <section className="bg-white border border-slate-200 rounded-lg flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Donor Pipeline &amp; Pledged vs Realized
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Meta Ads, WhatsApp &amp; Website lead progression
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('leads')}
              className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0"
            >
              Manage Leads
            </button>
          </div>

          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500">New Inquiry</div>
              <div className="font-mono tabular-nums text-xl font-semibold text-slate-900 mt-1">
                {newCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Qualified</div>
              <div className="font-mono tabular-nums text-xl font-semibold text-amber-700 mt-1">
                {qualifiedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Converted</div>
              <div className="font-mono tabular-nums text-xl font-semibold text-emerald-800 mt-1">
                {convertedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Not Converted</div>
              <div className="font-mono tabular-nums text-xl font-semibold text-rose-700 mt-1">
                {lostCount}
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total Pledged: </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatPkr(totalPledged)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Realized into Ledgers: </span>
              <span className="font-mono tabular-nums font-semibold text-emerald-800">
                {formatPkr(totalReceivedFromLeads)}
              </span>
            </div>
          </div>

          <div className="p-5 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-700">
                Recent Website &amp; Meta WhatsApp Sync Events
              </span>
              {canTestSync && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('website')}
                  className="text-xs text-emerald-900 font-medium hover:underline"
                >
                  Test Live Sync
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {websiteSyncEvents.slice(0, 4).map((ev) => (
                <div
                  key={ev.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {ev.donorName}
                    </div>
                    <div className="text-slate-500 truncate">
                      {ev.source} · {ev.fundType}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums font-medium text-slate-900">
                      {ev.amountPkr ? formatPkr(ev.amountPkr) : 'Lead Only'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatTimestamp(ev.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Credit Inflows by Master Fund Type & Recent Vouchers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg xl:col-span-1">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Credit Inflows by Fund Type
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Master Chart of Accounts breakdown
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {fundEntries.map((item) => (
              <div
                key={item.fund}
                className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <span className="text-slate-700 truncate">{item.fund}</span>
                <span className="font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                  {formatPkr(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg xl:col-span-2">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Latest Chronological Ledger Entries
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Running balances automatically recalculate on backdated vouchers
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('ledgers')}
              className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Voucher</th>
                  <th className="py-2.5 px-4">Ledger &amp; Category</th>
                  <th className="py-2.5 px-4">Channel</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Overall Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {[...chronological]
                  .reverse()
                  .slice(0, 6)
                  .map((txn) => (
                    <tr key={txn.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">
                        <div>{formatShortDate(txn.transactionDate)}</div>
                        {txn.isBackdated && (
                          <div className="text-[11px] text-amber-700 font-sans">
                            Backdated
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap text-slate-700">
                        {txn.voucherNo}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900 truncate max-w-[240px]">
                          {txn.category}
                        </div>
                        <div className="text-slate-500">
                          {txn.ledger} · {txn.donorOrPayee}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-700">
                        {txn.channel}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                          txn.type === 'Credit'
                            ? 'text-emerald-800'
                            : 'text-rose-700'
                        }`}
                      >
                        {txn.type === 'Credit' ? '+' : '-'}
                        {formatPkr(txn.amountPkr)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatPkr(txn.overallRunningBalance)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};