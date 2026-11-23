import React, { useState } from 'react';
import { Send, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  ActiveTab,
  IncomeFundType,
  LeadSource,
  PaymentChannel,
  WebsiteSyncEvent,
} from '../types/system';
import {
  formatPkr,
  formatTimestamp,
  INCOME_FUND_TYPES,
} from '../utils/accounting';

interface WebsiteSyncViewProps {
  syncEvents: WebsiteSyncEvent[];
  onSimulateWebsiteSubmission: (params: {
    submissionType: 'donation' | 'contact' | 'meta_whatsapp';
    donorName: string;
    phone: string;
    fundType: IncomeFundType;
    amountPkr: number;
    channel?: PaymentChannel;
    campaignName?: string;
    notes: string;
  }) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const WebsiteSyncView: React.FC<WebsiteSyncViewProps> = ({
  syncEvents,
  onSimulateWebsiteSubmission,
  onNavigateTab,
}) => {
  const [formMode, setFormMode] = useState<
    'donation' | 'contact' | 'meta_whatsapp'
  >('donation');
  const [donorName, setDonorName] = useState('');
  const [phone, setPhone] = useState('');
  const [fundType, setFundType] = useState<IncomeFundType>('Zakaat');
  const [amount, setAmount] = useState('25000');
  const [channel, setChannel] = useState<PaymentChannel>('JazzCash');
  const [campaignName, setCampaignName] = useState(
    'Orphan Education Sponsorship Nov'
  );
  const [notes, setNotes] = useState('');
  const [lastSyncedMsg, setLastSyncedMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName.trim() || !phone.trim()) return;
    const amtNum = Math.max(0, Number(amount) || 0);
    onSimulateWebsiteSubmission({
      submissionType: formMode,
      donorName: donorName.trim(),
      phone: phone.trim(),
      fundType,
      amountPkr: amtNum,
      channel: formMode === 'donation' ? channel : undefined,
      campaignName: formMode === 'meta_whatsapp' ? campaignName : undefined,
      notes: notes.trim(),
    });
    setLastSyncedMsg(
      formMode === 'donation'
        ? `Synced ${donorName.trim()} directly into Donor Leads CRM & posted Credit Voucher (${formatPkr(amtNum)} via ${channel}).`
        : `Synced ${donorName.trim()} directly into Donor Leads CRM as a New Inquiry.`
    );
    setDonorName('');
    setPhone('');
    setNotes('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Live Website & Meta Integration Simulator */}
      <section className="bg-white border border-slate-200 rounded-lg xl:col-span-7">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-display font-semibold text-base text-slate-900">
            Direct Website &amp; Meta WhatsApp Integration Simulator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit a public website donation form, contact inquiry, or Meta Ads WhatsApp click-to-chat event to verify real-time sync into the CRM and accounting ledgers.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
            <button
              type="button"
              onClick={() => {
                setFormMode('donation');
                setLastSyncedMsg(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                formMode === 'donation'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Website Donation Form
            </button>
            <button
              type="button"
              onClick={() => {
                setFormMode('contact');
                setLastSyncedMsg(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                formMode === 'contact'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Website Contact Form
            </button>
            <button
              type="button"
              onClick={() => {
                setFormMode('meta_whatsapp');
                setLastSyncedMsg(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                formMode === 'meta_whatsapp'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Meta Ads → WhatsApp Trigger
            </button>
          </div>

          {lastSyncedMsg && (
            <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
                <span>{lastSyncedMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('leads')}
                className="inline-flex items-center gap-1 font-medium text-emerald-900 underline whitespace-nowrap"
              >
                <span>View in CRM</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Donor Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="e.g.Salman Haider"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  WhatsApp / Mobile Number *
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 5511990"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Fund / Contribution Type
                </label>
                <select
                  value={fundType}
                  onChange={(e) =>
                    setFundType(e.target.value as IncomeFundType)
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
                  {formMode === 'donation'
                    ? 'Paid Donation Amount (PKR) *'
                    : 'Estimated / Pledged Amount (PKR)'}
                </label>
                <input
                  type="number"
                  min={formMode === 'donation' ? '1' : '0'}
                  required={formMode === 'donation'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
            </div>

            {formMode === 'donation' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Online Payment Gateway / Channel
                </label>
                <select
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as PaymentChannel)
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="JazzCash">JazzCash</option>
                  <option value="EasyPaisa">EasyPaisa</option>
                  <option value="Meezan Bank">Meezan Bank (IBFT)</option>
                  <option value="Faysal Bank">Faysal Bank (IBFT)</option>
                </select>
              </div>
            )}

            {formMode === 'meta_whatsapp' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Meta Ad Campaign Source
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Message / Donor Instructions
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note from website donor or WhatsApp message..."
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {formMode === 'donation'
                  ? 'Submit Website Donation & Auto-Post Credit Voucher'
                  : 'Send Inquiry to CRM Dashboard'}
              </span>
            </button>
          </form>
        </div>
      </section>

      {/* Right: Real-Time Sync Feed & Integration Contract */}
      <section className="bg-white border border-slate-200 rounded-lg xl:col-span-5">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display font-semibold text-base text-slate-900">
            Live Website &amp; WhatsApp Sync Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Incoming donor submissions synced directly into CRM leads and accounts
          </p>
        </div>
        <div className="divide-y divide-slate-200">
          {syncEvents.map((ev) => (
            <div key={ev.id} className="p-4 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900 text-sm">
                  {ev.donorName}
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {formatTimestamp(ev.timestamp)}
                </span>
              </div>
              <div className="text-slate-600">
                {ev.source as LeadSource} · {ev.phone}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-emerald-800 font-medium">
                  {ev.status} ({ev.leadId}
                  {ev.voucherNo ? ` / ${ev.voucherNo}` : ''})
                </span>
                {ev.amountPkr ? (
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatPkr(ev.amountPkr)}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
