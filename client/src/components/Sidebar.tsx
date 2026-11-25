import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Landmark,
  Globe,
  FileSpreadsheet,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { ActiveTab } from '../types/system';
import { ROLE_PROFILES } from '../utils/accounts';
import type { AuthUser } from '../utils/api';

// Props received from the parent component
interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  // The person who is logged in (their role decides which tabs they see)
  user: AuthUser;
  onLogout: () => void;
  pendingBackdateCount: number;
  newInquiriesCount: number;
}

// Navigation menu items (id, label and icon)
const NAV_ITEMS: {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Donor Leads CRM', icon: Users },
  { id: 'ledgers', label: 'Account Ledgers', icon: BookOpen },
  { id: 'channels', label: 'Channels & Assets', icon: Landmark },
  { id: 'website', label: 'Website & Meta Sync', icon: Globe },
  { id: 'reports', label: 'Exports & Atlas DB', icon: FileSpreadsheet },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  user,
  onLogout,
  pendingBackdateCount,
  newInquiriesCount,
}) => {
  // Becomes true if the logo image fails to load, so the "BN" fallback is shown
  const [logoFailed, setLogoFailed] = React.useState(false);
  const profile = ROLE_PROFILES[user.role];
  // Follow-Up Staff only work with donor leads, so they only see that tab
  const visibleNavItems =
    user.role === 'followup'
      ? NAV_ITEMS.filter((item) => item.id === 'leads')
      : NAV_ITEMS;

  return (
    <aside className="no-print w-full lg:w-64 shrink-0 bg-[#08241C] text-emerald-50 border-b lg:border-b-0 lg:border-r border-emerald-950 flex flex-col justify-between">
      <div>
        {/* Logo + organization name */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {!logoFailed ? (
              // Logo is served from client/public/logo.jpeg (use forward slash)
              <img
                src="/logo.jpeg"
                alt="Bait-ul-Noor Orphanage Society logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-11 h-11 rounded-full bg-white p-0.5 object-contain shrink-0 border border-emerald-300/30"
              />
            ) : (
              // Fallback circle shown only when the logo cannot be loaded
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 flex items-center justify-center font-display font-bold text-sm shrink-0">
                BN
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display font-bold text-sm tracking-tight text-white truncate">
                Bait-ul-Noor
              </div>
              <div className="text-xs text-emerald-200/75 truncate">
                Orphanage Society
              </div>
            </div>
          </div>
        </div>

        {/* Navigation menu */}
        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            // Small counter badge shown next to Leads and Ledgers
            const countText =
              item.id === 'leads' && newInquiriesCount > 0
                ? `${newInquiriesCount}`
                : item.id === 'ledgers' && pendingBackdateCount > 0
                  ? `${pendingBackdateCount}`
                  : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  isActive
                    ? 'bg-emerald-700/80 text-white'
                    : 'text-emerald-100/80 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-200' : 'text-emerald-300/70'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {countText && (
                  <span
                    className={`font-mono tabular-nums text-xs ${
                      isActive ? 'text-emerald-100' : 'text-emerald-300/80'
                    }`}
                  >
                    {countText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Role switcher + current user info */}
      {/* Signed-in user + logout */}
      <div className="p-4 border-t border-white/10 bg-black/15">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-200/90 mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span>Signed in as {profile.label}</span>
        </div>

        <div className="text-xs">
          <div className="font-medium text-white truncate">
            {user.staffName}
          </div>
          <div className="text-emerald-200/75 truncate">{user.title}</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-100/65">
            {profile.permissionsSummary}
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-white/15 text-xs font-medium text-emerald-50 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
};