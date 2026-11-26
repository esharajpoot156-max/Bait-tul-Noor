import React, { useMemo, useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Clock, MessageCircle, Phone } from 'lucide-react';
import { DonorLead } from '../types/system';
import { formatShortDate, getTodayIsoDate } from '../utils/accounts';

// ---------------------------------------------------------------------------
// Helpers (exported so the Sidebar can show a badge with the same count)
// ---------------------------------------------------------------------------

// A lead needs a reminder only while it is still open (not donated, not closed)
function isOpenLead(lead: DonorLead): boolean {
  return (
    lead.stage !== 'Converted / Donated' &&
    lead.stage !== 'Not Converted / Closed Lost'
  );
}

// Whole days between two YYYY-MM-DD dates (positive = date is in the past)
function daysBetween(dateIso: string, todayIso: string): number {
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// Adds days to a YYYY-MM-DD date (used by the "Snooze" buttons)
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Turns a Pakistani number like 0300-1234567 into 923001234567 for wa.me links
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  return digits;
}

// All open leads whose follow-up date is today or earlier (oldest first)
export function getDueFollowUps(leads: DonorLead[]): DonorLead[] {
  const today = getTodayIsoDate();
  return leads
    .filter((l) => isOpenLead(l) && l.followUpDate && l.followUpDate <= today)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
}

// Number used for badges ("3 follow-ups due")
export function countDueFollowUps(leads: DonorLead[]): number {
  return getDueFollowUps(leads).length;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FollowUpRemindersProps {
  leads: DonorLead[];
  currentStaffName: string;
  // Opens the normal "Update Lead" window for this lead
  onOpenLead: (lead: DonorLead) => void;
  // Saves a changed lead (used to move the follow-up date when snoozing)
  onUpdateLead: (lead: DonorLead) => void;
}

export const FollowUpReminders: React.FC<FollowUpRemindersProps> = ({
  leads,
  currentStaffName,
  onOpenLead,
  onUpdateLead,
}) => {
  const [expanded, setExpanded] = useState(true);
  // "mine" = only leads assigned to the logged-in person, "all" = everyone's
  const [scope, setScope] = useState<'mine' | 'all'>('all');

  const today = getTodayIsoDate();

  const due = useMemo(() => getDueFollowUps(leads), [leads]);
  const visible = useMemo(
    () =>
      scope === 'mine'
        ? due.filter((l) => l.assignedTo === currentStaffName)
        : due,
    [due, scope, currentStaffName]
  );

  const overdueCount = visible.filter((l) => l.followUpDate < today).length;
  const todayCount = visible.length - overdueCount;

  // Nothing is due: show nothing, so the page stays clean
  if (due.length === 0) return null;

  // Moves the follow-up date forward and saves the lead
  const snooze = (lead: DonorLead, days: number) => {
    onUpdateLead({ ...lead, followUpDate: addDaysIso(today, days) });
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg">
      {/* Header: summary + show/hide */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <BellRing className="w-4 h-4 text-amber-700 shrink-0" />
          <div className="text-sm font-medium text-amber-950">
            Follow-up reminders
          </div>
          <div className="text-xs text-amber-900/80">
            {overdueCount > 0 && <span>{overdueCount} overdue</span>}
            {overdueCount > 0 && todayCount > 0 && <span> · </span>}
            {todayCount > 0 && <span>{todayCount} due today</span>}
            {visible.length === 0 && <span>none for you</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mine / All switch */}
          <div className="flex items-center gap-0.5 p-0.5 bg-amber-100 rounded-md">
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  scope === s
                    ? 'bg-white text-amber-950 shadow-2xs'
                    : 'text-amber-900/70 hover:text-amber-950'
                }`}
              >
                {s === 'mine' ? 'My leads' : 'Everyone'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-amber-800 hover:text-amber-950"
            aria-label={expanded ? 'Hide reminders' : 'Show reminders'}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* List of due leads */}
      {expanded && visible.length > 0 && (
        <ul className="divide-y divide-amber-200/70 border-t border-amber-200">
          {visible.map((lead) => {
            const lateBy = daysBetween(lead.followUpDate, today);
            return (
              <li
                key={lead.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenLead(lead)}
                    className="text-sm font-medium text-slate-900 hover:text-emerald-900 hover:underline text-left"
                  >
                    {lead.donorName}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {lead.phone}
                    </span>
                    <span>{lead.stage}</span>
                    <span>Assigned: {lead.assignedTo}</span>
                    <span
                      className={`flex items-center gap-1 font-medium ${
                        lateBy > 0 ? 'text-rose-700' : 'text-amber-800'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {lateBy > 0
                        ? `${lateBy} day${lateBy === 1 ? '' : 's'} overdue (${formatShortDate(lead.followUpDate)})`
                        : 'Due today'}
                    </span>
                  </div>
                  {lead.followUpNote && (
                    <div className="mt-1 text-xs text-slate-500 truncate">
                      {lead.followUpNote}
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`https://wa.me/${toWhatsAppNumber(lead.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => snooze(lead, 1)}
                    className="px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    +1 day
                  </button>
                  <button
                    type="button"
                    onClick={() => snooze(lead, 7)}
                    className="px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    +1 week
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};