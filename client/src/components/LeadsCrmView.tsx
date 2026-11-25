import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Printer,
  Calendar,
  Phone,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  DonorLead,
  IncomeFundType,
  LeadSource,
  LeadStage,
  LedgerName,
  PaymentChannel,
  UserRole,
} from '../types/system';
import {
  exportRowsToXlsx,
  formatPkr,
  formatShortDate,
  getTodayIsoDate,
  INCOME_FUND_TYPES,
  inferDefaultLedgerForFund,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEDGER_NAMES,
  NON_CONVERSION_REASONS,
  PAYMENT_CHANNELS,
  STAFF_MEMBERS,
} from '../utils/accounts';
import { PrintReportConfig } from './PrintStatementModal';

interface LeadsCrmViewProps {
  leads: DonorLead[];
  currentRole: UserRole;
  currentStaffName: string;
  onAddLead: (lead: Omit<DonorLead, 'id' | 'createdAt'>) => void;
  onUpdateLead: (lead: DonorLead) => void;
  onConvertLeadWithVoucher: (params: {
    lead: DonorLead;
    receivedAmountPkr: number;
    fundType: IncomeFundType;
    ledger: LedgerName;
    channel: PaymentChannel;
    transactionDate: string;
    notes: string;
  }) => void;
  onOpenPrint: (config: PrintReportConfig) => void;
}

type CrmSubView = 'board' | 'table' | 'analytics';

export const LeadsCrmView: React.FC<LeadsCrmViewProps> = ({
  leads,
  currentRole,
  currentStaffName,
  onAddLead,
  onUpdateLead,
  onConvertLeadWithVoucher,
  onOpenPrint,
}) => {
  const [subView, setSubView] = useState<CrmSubView>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'All'>('All');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'All'>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('All');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead] = useState<DonorLead | null>(null);
  const [convertingLead, setConvertingLead] = useState<DonorLead | null>(null);

  // Add lead form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSource, setNewSource] = useState<LeadSource>('Meta Ads (WhatsApp)');
  const [newCampaign, setNewCampaign] = useState('');
  const [newInquiryDate, setNewInquiryDate] = useState(getTodayIsoDate());
  const [newFund, setNewFund] = useState<IncomeFundType>('Zakaat');
  const [newPledged, setNewPledged] = useState('25000');
  const [newAssignedTo, setNewAssignedTo] = useState(
    STAFF_MEMBERS.includes(currentStaffName)
      ? currentStaffName
      : STAFF_MEMBERS[0]
  );
  const [newFollowUpDate, setNewFollowUpDate] = useState(getTodayIsoDate());
  const [newNotes, setNewNotes] = useState('');

  // Convert lead modal state
  const [convertAmount, setConvertAmount] = useState('');
  const [convertFund, setConvertFund] = useState<IncomeFundType>('Zakaat');
  const [convertLedger, setConvertLedger] = useState<LedgerName>('Welfare Ledger');
  const [convertChannel, setConvertChannel] =
    useState<PaymentChannel>('Meezan Bank');
  const [convertDate, setConvertDate] = useState(getTodayIsoDate());
  const [convertNotes, setConvertNotes] = useState('');

  const canPostAccountingVoucher =
    currentRole === 'management' || currentRole === 'accountant';

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== 'All' && l.stage !== stageFilter) return false;
      if (sourceFilter !== 'All' && l.source !== sourceFilter) return false;
      if (assigneeFilter !== 'All' && l.assignedTo !== assigneeFilter)
        return false;
      if (!q) return true;
      return (
        l.donorName.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q) ||
        (l.campaignName || '').toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery, stageFilter, sourceFilter, assigneeFilter]);

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    onAddLead({
      donorName: newName.trim(),
      phone: newPhone.trim(),
      source: newSource,
      campaignName: newCampaign.trim() || undefined,
      inquiryDate: newInquiryDate,
      stage: 'New Inquiry',
      fundInterest: newFund,
      pledgedAmountPkr: Math.max(0, Number(newPledged) || 0),
      receivedAmountPkr: 0,
      assignedTo: newAssignedTo,
      followUpDate: newFollowUpDate,
      followUpNote: 'Initial inquiry logged.',
      notes: newNotes.trim(),
    });
    setNewName('');
    setNewPhone('');
    setNewCampaign('');
    setNewNotes('');
    setShowAddModal(false);
  };

  const openConvertModal = (lead: DonorLead) => {
    setConvertingLead(lead);
    setConvertAmount(String(lead.pledgedAmountPkr || 10000));
    setConvertFund(lead.fundInterest);
    setConvertLedger(inferDefaultLedgerForFund(lead.fundInterest));
    setConvertChannel(
      lead.fundInterest === 'Ration / Ajnaas (In-kind food & goods)'
        ? 'In-Kind Ration / Ajnaas'
        : 'Meezan Bank'
    );
    setConvertDate(getTodayIsoDate());
    setConvertNotes(`Donation received from ${lead.donorName} (${lead.source}).`);
  };

  const handleConfirmConversion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingLead) return;
    const amt = Math.max(0, Number(convertAmount) || 0);
    if (amt <= 0) return;

    if (canPostAccountingVoucher) {
      onConvertLeadWithVoucher({
        lead: convertingLead,
        receivedAmountPkr: amt,
        fundType: convertFund,
        ledger: convertLedger,
        channel: convertChannel,
        transactionDate: convertDate,
        notes: convertNotes.trim(),
      });
    } else {
      // Follow-Up Staff updates the lead conversion record for Accountant verification
      onUpdateLead({
        ...convertingLead,
        stage: 'Converted / Donated',
        fundInterest: convertFund,
        receivedAmountPkr: amt,
        followUpNote: `${convertingLead.followUpNote} · Receipt logged by Follow-Up Staff (${formatPkr(amt)} via ${convertChannel}); pending Accountant voucher link.`,
      });
    }
    setConvertingLead(null);
  };

  const handleExportCsv = () => {
    exportRowsToXlsx(
      `bait-ul-noor-donor-leads-${getTodayIsoDate()}.xlsx`,
      [
        'Lead ID',
        'Donor Name',
        'Phone / WhatsApp',
        'Source',
        'Campaign',
        'Inquiry Date',
        'Stage',
        'Fund Type',
        'Pledged (PKR)',
        'Received (PKR)',
        'Assigned Staff',
        'Follow-Up Date',
        'Follow-Up Note',
        'Non-Conversion Reason',
        'Linked Voucher',
      ],
      filteredLeads.map((l) => [
        l.id,
        l.donorName,
        l.phone,
        l.source,
        l.campaignName || '',
        l.inquiryDate,
        l.stage,
        l.fundInterest,
        l.pledgedAmountPkr,
        l.receivedAmountPkr,
        l.assignedTo,
        l.followUpDate,
        l.followUpNote,
        l.nonConversionReason || '',
        l.linkedVoucherId || '',
      ])
    );
  };

  // Campaign analytics
  const sourceStats = useMemo(() => {
    return LEAD_SOURCES.map((source) => {
      const items = leads.filter((l) => l.source === source);
      const converted = items.filter((l) => l.stage === 'Converted / Donated');
      const pledged = items.reduce((s, l) => s + l.pledgedAmountPkr, 0);
      const received = items.reduce((s, l) => s + l.receivedAmountPkr, 0);
      const rate =
        items.length > 0 ? Math.round((converted.length / items.length) * 100) : 0;
      return {
        source,
        total: items.length,
        converted: converted.length,
        rate,
        pledged,
        received,
      };
    });
  }, [leads]);

  const nonConversionSummary = useMemo(() => {
    const lost = leads.filter((l) => l.stage === 'Not Converted / Closed Lost');
    const counts: Record<string, number> = {};
    lost.forEach((l) => {
      const reason = l.nonConversionReason || 'Unspecified';
      counts[reason] = (counts[reason] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const todayIso = getTodayIsoDate();

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSubView('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subView === 'board'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pipeline Board
            </button>
            <button
              type="button"
              onClick={() => setSubView('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subView === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lead Directory ({filteredLeads.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('analytics')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subView === 'analytics'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Campaign Performance
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenPrint({
                  kind: 'leads',
                  title: 'Donor Leads & Conversion Statement',
                  subtitle: `Filtered view: ${filteredLeads.length} donor inquiries across Meta Ads, WhatsApp & Website`,
                  leads: filteredLeads,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF Statement</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Donor Inquiry</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        {subView !== 'analytics' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search donor, phone, campaign..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/30 focus:border-emerald-800"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as LeadStage | 'All')}
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
            >
              <option value="All">All Pipeline Stages</option>
              {LEAD_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as LeadSource | 'All')
              }
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
            >
              <option value="All">All Lead Sources</option>
              {LEAD_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
            >
              <option value="All">All Staff Assignees</option>
              {STAFF_MEMBERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Subview 1: Pipeline Board */}
      {subView === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {LEAD_STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.stage === stage);
            const stagePledged = stageLeads.reduce(
              (s, l) => s + l.pledgedAmountPkr,
              0
            );
            const headerTone =
              stage === 'Converted / Donated'
                ? 'text-emerald-900'
                : stage === 'Qualified'
                  ? 'text-amber-800'
                  : stage === 'Not Converted / Closed Lost'
                    ? 'text-rose-800'
                    : 'text-slate-900';

            return (
              <div
                key={stage}
                className="bg-slate-100/80 border border-slate-200 rounded-lg p-3 space-y-3"
              >
                <div className="px-1 flex items-baseline justify-between gap-2">
                  <h3 className={`font-display font-semibold text-xs ${headerTone}`}>
                    {stage}
                  </h3>
                  <span className="font-mono tabular-nums text-xs text-slate-500">
                    {stageLeads.length} · {formatPkr(stagePledged)}
                  </span>
                </div>

                {stageLeads.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-md p-4 text-xs text-slate-500 text-center">
                    No leads in this stage
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {stageLeads.map((lead) => {
                      const isFollowUpDue =
                        lead.stage !== 'Converted / Donated' &&
                        lead.stage !== 'Not Converted / Closed Lost' &&
                        lead.followUpDate <= todayIso;
                      return (
                        <div
                          key={lead.id}
                          className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2.5 hover:border-slate-300 transition-colors"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingLead(lead)}
                                className="text-left font-medium text-sm text-slate-900 hover:text-emerald-900 hover:underline"
                              >
                                {lead.donorName}
                              </button>
                              <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                                {lead.id}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span className="font-mono tabular-nums">
                                {lead.phone}
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 space-y-1">
                            <div>
                              {lead.source}
                              {lead.campaignName ? ` · ${lead.campaignName}` : ''}
                            </div>
                            <div className="text-slate-500">
                              Fund: {lead.fundInterest}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-500">
                              {lead.stage === 'Converted / Donated'
                                ? 'Received'
                                : 'Pledged'}
                            </span>
                            <span className="font-mono tabular-nums font-semibold text-slate-900">
                              {formatPkr(
                                lead.stage === 'Converted / Donated'
                                  ? lead.receivedAmountPkr
                                  : lead.pledgedAmountPkr
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="truncate">{lead.assignedTo}</span>
                            <span
                              className={`font-mono tabular-nums whitespace-nowrap ${
                                isFollowUpDue ? 'text-amber-700 font-medium' : ''
                              }`}
                            >
                              {isFollowUpDue ? 'Due ' : ''}
                              {formatShortDate(lead.followUpDate)}
                            </span>
                          </div>

                          {lead.nonConversionReason && (
                            <div className="text-[11px] text-rose-700">
                              Reason: {lead.nonConversionReason}
                            </div>
                          )}

                          {lead.linkedVoucherId && (
                            <div className="text-[11px] text-emerald-800 font-mono">
                              Linked Voucher: {lead.linkedVoucherId}
                            </div>
                          )}

                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingLead(lead)}
                              className="flex-1 py-1.5 px-2.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              Update Follow-Up
                            </button>
                            {lead.stage !== 'Converted / Donated' && (
                              <button
                                type="button"
                                onClick={() => openConvertModal(lead)}
                                className="py-1.5 px-2.5 rounded bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap"
                              >
                                Convert
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Subview 2: Lead Directory Table */}
      {subView === 'table' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-sm font-medium text-slate-900">
                No donor inquiries match the active filters
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Adjust your search or log a new donor inquiry from Meta Ads, WhatsApp, or the website.
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Donor Inquiry</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-3 px-4">Date &amp; ID</th>
                    <th className="py-3 px-4">Donor &amp; Contact</th>
                    <th className="py-3 px-4">Source &amp; Fund</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Assigned &amp; Follow-Up</th>
                    <th className="py-3 px-4 text-right">Pledged</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-900">
                          {formatShortDate(lead.inquiryDate)}
                        </div>
                        <div className="text-slate-500">{lead.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 text-sm">
                          {lead.donorName}
                        </div>
                        <div className="font-mono tabular-nums text-slate-500">
                          {lead.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{lead.source}</div>
                        <div className="text-slate-500">{lead.fundInterest}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            lead.stage === 'Converted / Donated'
                              ? 'text-emerald-800'
                              : lead.stage === 'Qualified'
                                ? 'text-amber-700'
                                : lead.stage === 'Not Converted / Closed Lost'
                                  ? 'text-rose-700'
                                  : 'text-slate-700'
                          }`}
                        >
                          {lead.stage}
                        </span>
                        {lead.linkedVoucherId && (
                          <div className="font-mono text-[11px] text-slate-500">
                            {lead.linkedVoucherId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{lead.assignedTo}</div>
                        <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span className="font-mono tabular-nums">
                            {formatShortDate(lead.followUpDate)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatPkr(lead.pledgedAmountPkr)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-800 whitespace-nowrap">
                        {formatPkr(lead.receivedAmountPkr)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingLead(lead)}
                          className="text-slate-700 hover:text-slate-900 font-medium underline"
                        >
                          Edit
                        </button>
                        {lead.stage !== 'Converted / Donated' && (
                          <button
                            type="button"
                            onClick={() => openConvertModal(lead)}
                            className="text-emerald-900 hover:text-emerald-700 font-medium underline"
                          >
                            Convert
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subview 3: Campaign Performance & Non-Conversion Reasons */}
      {subView === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg lg:col-span-2 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display font-semibold text-base text-slate-900">
                Meta Ads, WhatsApp &amp; Website Conversion Performance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pledged versus realized donations by acquisition source
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-3 px-5">Acquisition Source</th>
                    <th className="py-3 px-4 text-right">Inquiries</th>
                    <th className="py-3 px-4 text-right">Converted</th>
                    <th className="py-3 px-4 text-right">Conv. Rate</th>
                    <th className="py-3 px-4 text-right">Pledged</th>
                    <th className="py-3 px-5 text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sourceStats.map((row) => (
                    <tr key={row.source}>
                      <td className="py-3.5 px-5 font-medium text-slate-900">
                        {row.source}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {row.total}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-800 font-medium">
                        {row.converted}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {row.rate}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {formatPkr(row.pledged)}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums font-semibold text-emerald-800">
                        {formatPkr(row.received)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display font-semibold text-base text-slate-900">
                Non-Conversion Reasons
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit of closed-lost inquiries for ad optimization
              </p>
            </div>
            <div className="p-5">
              {nonConversionSummary.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No closed-lost inquiries recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {nonConversionSummary.map(([reason, count]) => (
                    <div
                      key={reason}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-700">{reason}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-slate-900">
                Log New Donor Inquiry
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Donor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Tariq Mehmood"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Phone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value as LeadSource)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {LEAD_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Meta Campaign (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCampaign}
                    onChange={(e) => setNewCampaign(e.target.value)}
                    placeholder="e.g. Orphan Education Nov"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fund Type Interest
                  </label>
                  <select
                    value={newFund}
                    onChange={(e) =>
                      setNewFund(e.target.value as IncomeFundType)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {INCOME_FUND_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pledged Amount (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newPledged}
                    onChange={(e) => setNewPledged(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Inquiry Date
                  </label>
                  <input
                    type="date"
                    value={newInquiryDate}
                    onChange={(e) => setNewInquiryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Assigned Staff
                  </label>
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {STAFF_MEMBERS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Follow-Up Reminder
                  </label>
                  <input
                    type="date"
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Inquiry Notes
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="WhatsApp conversation summary or donor instructions..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  Save Inquiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Follow-Up Modal */}
      {editingLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-base text-slate-900">
                  Update Lead · {editingLead.donorName}
                </h3>
                <div className="text-xs text-slate-500 font-mono">
                  {editingLead.id} · {editingLead.source}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLead(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateLead(editingLead);
                setEditingLead(null);
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pipeline Stage
                  </label>
                  <select
                    value={editingLead.stage}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        stage: e.target.value as LeadStage,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {LEAD_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Assigned Staff
                  </label>
                  <select
                    value={editingLead.assignedTo}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        assignedTo: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {STAFF_MEMBERS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fund Type
                  </label>
                  <select
                    value={editingLead.fundInterest}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        fundInterest: e.target.value as IncomeFundType,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {INCOME_FUND_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pledged Amount (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingLead.pledgedAmountPkr}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        pledgedAmountPkr: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Next Follow-Up Date
                  </label>
                  <input
                    type="date"
                    value={editingLead.followUpDate}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        followUpDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Follow-Up Note
                  </label>
                  <input
                    type="text"
                    value={editingLead.followUpNote}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        followUpNote: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              {editingLead.stage === 'Not Converted / Closed Lost' && (
                <div>
                  <label className="block font-medium text-rose-800 mb-1">
                    Reason for Non-Conversion
                  </label>
                  <select
                    value={editingLead.nonConversionReason || ''}
                    onChange={(e) =>
                      setEditingLead({
                        ...editingLead,
                        nonConversionReason: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-rose-200 rounded-md bg-white"
                  >
                    <option value="">Select reason...</option>
                    {NON_CONVERSION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Donor Notes
                </label>
                <textarea
                  rows={2}
                  value={editingLead.notes}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 flex justify-between gap-2">
                {editingLead.stage !== 'Converted / Donated' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingLead;
                      setEditingLead(null);
                      openConvertModal(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-emerald-800 text-emerald-900 font-medium hover:bg-emerald-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Convert to Donation</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingLead(null)}
                    className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                  >
                    Save Updates
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert & Link to Credit Voucher Modal */}
      {convertingLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-base text-slate-900">
                  Convert Donor Lead · {convertingLead.donorName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {canPostAccountingVoucher
                    ? 'Marks lead as Converted / Donated and automatically posts a linked Credit entry.'
                    : 'Follow-Up Staff mode: marks lead Converted with receipt details for Accountant ledger posting.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConvertingLead(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmConversion}
              className="p-6 space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Received Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Receipt Date
                  </label>
                  <input
                    type="date"
                    required
                    value={convertDate}
                    onChange={(e) => setConvertDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fund Type (Amdan)
                  </label>
                  <select
                    value={convertFund}
                    onChange={(e) => {
                      const fund = e.target.value as IncomeFundType;
                      setConvertFund(fund);
                      setConvertLedger(inferDefaultLedgerForFund(fund));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {INCOME_FUND_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Target Account Ledger
                  </label>
                  <select
                    value={convertLedger}
                    onChange={(e) =>
                      setConvertLedger(e.target.value as LedgerName)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {LEDGER_NAMES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Payment Channel
                </label>
                <select
                  value={convertChannel}
                  onChange={(e) =>
                    setConvertChannel(e.target.value as PaymentChannel)
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
                  Voucher Narration / Notes
                </label>
                <textarea
                  rows={2}
                  value={convertNotes}
                  onChange={(e) => setConvertNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConvertingLead(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  {canPostAccountingVoucher
                    ? 'Convert & Post Credit Entry'
                    : 'Confirm Lead Conversion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};