import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import {
  ChannelReconciliation,
  ComputedTransaction,
  DonorLead,
  LedgerName,
} from '../types/system';
import { formatPkr, formatShortDate } from '../utils/accounts';
import { exportReportPdf, PdfReportModel } from '../utils/pdf';

export type PrintReportConfig =
  | {
      kind: 'ledger';
      title: string;
      subtitle: string;
      ledgerFilter?: LedgerName | 'All';
      transactions: ComputedTransaction[];
    }
  | {
      kind: 'leads';
      title: string;
      subtitle: string;
      leads: DonorLead[];
    }
  | {
      kind: 'reconciliation';
      title: string;
      subtitle: string;
      reconciliations: ChannelReconciliation[];
      channelTotals: Record<
        string,
        { credits: number; debits: number; net: number; count: number }
      >;
    };

// A backdated entry that Management has not approved yet is not counted in totals
const isPending = (t: { isBackdated: boolean; backdateApproved: boolean }) =>
  t.isBackdated && !t.backdateApproved;

// Turns the report on screen into the table that is drawn into the PDF file
function buildPdfModel(
  config: PrintReportConfig,
  generatedAt: string
): PdfReportModel {
  const common = {
    title: config.title,
    subtitle: config.subtitle,
    generatedAt,
    footerLeft: 'Bait-ul-Noor Orphanage Society · Audited Financial Record',
    footerRight: 'Prepared by Society Accounts & CRM Office',
  };

  if (config.kind === 'ledger') {
    const counted = config.transactions.filter((t) => !isPending(t));
    const credits = counted
      .filter((t) => t.type === 'Credit')
      .reduce((a, t) => a + t.amountPkr, 0);
    const debits = counted
      .filter((t) => t.type === 'Debit')
      .reduce((a, t) => a + t.amountPkr, 0);
    return {
      ...common,
      summary: [
        { label: 'Total Credit (Inflow)', value: formatPkr(credits), tone: 'credit' },
        { label: 'Total Debit (Outflow)', value: formatPkr(debits), tone: 'debit' },
        { label: 'Net Balance', value: formatPkr(credits - debits) },
      ],
      columns: [
        { header: 'Txn Date', width: 8 },
        { header: 'Voucher', width: 12 },
        { header: 'Head / Ledger', width: 23 },
        { header: 'Channel', width: 10 },
        { header: 'Donor / Payee', width: 17 },
        { header: 'Credit', width: 10, align: 'right', tone: 'credit' },
        { header: 'Debit', width: 10, align: 'right', tone: 'debit' },
        { header: 'Running Balance', width: 10, align: 'right', tone: 'bold' },
      ],
      rows: config.transactions.map((t) => [
        formatShortDate(t.transactionDate) + (t.isBackdated ? ' (BD)' : ''),
        isPending(t) ? `${t.voucherNo}\n(Pending approval)` : t.voucherNo,
        { text: t.category, sub: t.ledger },
        t.channel,
        t.donorOrPayee,
        t.type === 'Credit' ? formatPkr(t.amountPkr) : '—',
        t.type === 'Debit' ? formatPkr(t.amountPkr) : '—',
        formatPkr(
          config.ledgerFilter && config.ledgerFilter !== 'All'
            ? t.ledgerRunningBalance
            : t.overallRunningBalance
        ),
      ]),
    };
  }

  if (config.kind === 'leads') {
    return {
      ...common,
      columns: [
        { header: 'Date', width: 9 },
        { header: 'Donor Name', width: 16, tone: 'bold' },
        { header: 'Phone / WhatsApp', width: 14 },
        { header: 'Source', width: 14 },
        { header: 'Stage', width: 11 },
        { header: 'Fund Type', width: 16 },
        { header: 'Pledged', width: 10, align: 'right' },
        { header: 'Received', width: 10, align: 'right', tone: 'bold' },
      ],
      rows: config.leads.map((l) => [
        formatShortDate(l.inquiryDate),
        l.donorName,
        l.phone,
        l.source,
        l.stage,
        l.fundInterest,
        formatPkr(l.pledgedAmountPkr),
        formatPkr(l.receivedAmountPkr),
      ]),
    };
  }

  return {
    ...common,
    columns: [
      { header: 'Channel', width: 14, tone: 'bold' },
      { header: 'Type & Reference', width: 24 },
      { header: 'Credits', width: 12, align: 'right' },
      { header: 'Debits', width: 12, align: 'right' },
      { header: 'Ledger Net', width: 13, align: 'right', tone: 'bold' },
      { header: 'Statement Bal', width: 13, align: 'right' },
      { header: 'Variance', width: 12, align: 'right' },
    ],
    rows: config.reconciliations.map((rec) => {
      const stats = config.channelTotals[rec.channel] || {
        credits: 0,
        debits: 0,
        net: 0,
        count: 0,
      };
      const variance = rec.statementBalancePkr - stats.net;
      return [
        rec.channel,
        { text: rec.channelType, sub: rec.accountRef },
        formatPkr(stats.credits),
        formatPkr(stats.debits),
        formatPkr(stats.net),
        formatPkr(rec.statementBalancePkr),
        variance === 0 ? 'Matched' : formatPkr(variance),
      ];
    }),
  };
}

interface PrintStatementModalProps {
  config: PrintReportConfig | null;
  onClose: () => void;
}

export const PrintStatementModal: React.FC<PrintStatementModalProps> = ({
  config,
  onClose,
}) => {
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState('');

  if (!config) return null;

  const generatedDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const slug =
        config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
        'report';
      const today = new Date().toISOString().slice(0, 10);
      await exportReportPdf(
        `bait-ul-noor-${slug}-${today}.pdf`,
        buildPdfModel(config, generatedDate)
      );
    } catch {
      setPdfError('Could not create the PDF. Please use Print / Save PDF instead.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center overflow-y-auto p-4 sm:p-8 print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl print-surface">
        <div className="no-print flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
          <div>
            <h2 className="font-display font-semibold text-base text-slate-900">
              Printable Statement Preview
            </h2>
            <p className="text-xs text-slate-500">
              Download a ready PDF file, or use Print to send it to a printer.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{pdfBusy ? 'Creating PDF…' : 'Download PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close statement preview"
              className="p-2 rounded-md border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {pdfError && (
          <div className="no-print px-6 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
            {pdfError}
          </div>
        )}

        <div className="p-8 text-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b-2 border-emerald-900 mb-6">
            <div className="flex items-center gap-4">
              <img
                src="/logo.jpeg"
                alt="Bait-ul-Noor Orphanage Society logo"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-contain border border-slate-200 bg-white shrink-0"
              />
              <div>
                <div className="text-xs font-medium text-emerald-900">
                  Bait-ul-Noor Orphanage Society
                </div>
                <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                  {config.title}
                </h1>
                <p className="text-xs text-slate-600 mt-1">{config.subtitle}</p>
              </div>
            </div>
            <div className="text-xs text-slate-600 sm:text-right font-mono tabular-nums">
              <div>Generated: {generatedDate}</div>
              <div>Currency: PKR</div>
            </div>
          </div>

          {config.kind === 'ledger' && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6 pb-5 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">Total Credit (Amdan)</div>
                  <div className="font-mono tabular-nums text-base font-semibold text-emerald-800 mt-1">
                    {formatPkr(
                      config.transactions
                        .filter((t) => t.type === 'Credit' && !isPending(t))
                        .reduce((acc, t) => acc + t.amountPkr, 0)
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total Debit (Kharch)</div>
                  <div className="font-mono tabular-nums text-base font-semibold text-rose-700 mt-1">
                    {formatPkr(
                      config.transactions
                        .filter((t) => t.type === 'Debit' && !isPending(t))
                        .reduce((acc, t) => acc + t.amountPkr, 0)
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Net Statement Balance</div>
                  <div className="font-mono tabular-nums text-base font-semibold text-slate-900 mt-1">
                    {formatPkr(
                      config.transactions.reduce(
                        (acc, t) =>
                          isPending(t)
                            ? acc
                            : acc + (t.type === 'Credit' ? t.amountPkr : -t.amountPkr),
                        0
                      )
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600 font-medium">
                    <th className="py-2 pr-3">Txn Date</th>
                    <th className="py-2 pr-3">Voucher</th>
                    <th className="py-2 pr-3">Ledger &amp; Head</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Donor / Payee</th>
                    <th className="py-2 pr-3 text-right">Credit</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Running Bal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {config.transactions.map((t) => {
                    const runningBal =
                      config.ledgerFilter && config.ledgerFilter !== 'All'
                        ? t.ledgerRunningBalance
                        : t.overallRunningBalance;
                    return (
                      <tr key={t.id}>
                        <td className="py-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                          {formatShortDate(t.transactionDate)}
                          {t.isBackdated ? ' (BD)' : ''}
                        </td>
                        <td className="py-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                          {t.voucherNo}
                          {isPending(t) && (
                            <span className="ml-1 text-amber-700">(Pending approval)</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900">
                            {t.category}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {t.ledger}
                          </div>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{t.channel}</td>
                        <td className="py-2 pr-3">{t.donorOrPayee}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                          {t.type === 'Credit' ? formatPkr(t.amountPkr) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                          {t.type === 'Debit' ? formatPkr(t.amountPkr) : '—'}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                          {formatPkr(runningBal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {config.kind === 'leads' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 font-medium">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Donor Name</th>
                  <th className="py-2 pr-3">Phone / WhatsApp</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">Fund Type</th>
                  <th className="py-2 pr-3 text-right">Pledged</th>
                  <th className="py-2 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {config.leads.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                      {formatShortDate(l.inquiryDate)}
                    </td>
                    <td className="py-2 pr-3 font-medium">{l.donorName}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                      {l.phone}
                    </td>
                    <td className="py-2 pr-3">{l.source}</td>
                    <td className="py-2 pr-3">{l.stage}</td>
                    <td className="py-2 pr-3">{l.fundInterest}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatPkr(l.pledgedAmountPkr)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                      {formatPkr(l.receivedAmountPkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {config.kind === 'reconciliation' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 font-medium">
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Type &amp; Reference</th>
                  <th className="py-2 pr-3 text-right">Credits</th>
                  <th className="py-2 pr-3 text-right">Debits</th>
                  <th className="py-2 pr-3 text-right">Ledger Net</th>
                  <th className="py-2 pr-3 text-right">Statement Bal</th>
                  <th className="py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {config.reconciliations.map((rec) => {
                  const stats = config.channelTotals[rec.channel] || {
                    credits: 0,
                    debits: 0,
                    net: 0,
                  };
                  const variance = rec.statementBalancePkr - stats.net;
                  return (
                    <tr key={rec.channel}>
                      <td className="py-2 pr-3 font-medium">{rec.channel}</td>
                      <td className="py-2 pr-3">
                        <div>{rec.channelType}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {rec.accountRef}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {formatPkr(stats.credits)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {formatPkr(stats.debits)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums font-medium">
                        {formatPkr(stats.net)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {formatPkr(rec.statementBalancePkr)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {variance === 0 ? 'Matched' : formatPkr(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
            <span>Bait-ul-Noor Orphanage Society · Audited Financial Record</span>
            <span>Prepared by Society Accounts &amp; CRM Office</span>
          </div>
        </div>
      </div>
    </div>
  );
};