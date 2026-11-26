import React, { useEffect, useState } from 'react';
import { AlertCircle, UserPlus, X } from 'lucide-react';
import { UserRole } from '../types/system';
import {
  AuthUser,
  createStaffUserApi,
  fetchUsersApi,
  toggleStaffUserStatusApi,
} from '../utils/api';

interface StaffAccessModalProps {
  open: boolean;
  currentUser: AuthUser;
  onClose: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  management: 'Management / Admin',
  accountant: 'Accountant',
  followup: 'Follow-Up Staff',
};

export const StaffAccessModal: React.FC<StaffAccessModalProps> = ({
  open,
  currentUser,
  onClose,
}) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [staffName, setStaffName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<UserRole>('accountant');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchUsersApi()
      .then((res) => setUsers(res.users))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unable to load users.')
      )
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await createStaffUserApi({
        staffName: staffName.trim(),
        email: email.trim(),
        title: title.trim() || undefined,
        role,
        password,
      });
      setUsers(res.users);
      setStaffName('');
      setEmail('');
      setTitle('');
      setPassword('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create staff account.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (u: AuthUser) => {
    setError(null);
    const currentlyActive = u.active !== false;
    try {
      const res = await toggleStaffUserStatusApi(u.username, !currentlyActive);
      setUsers(res.users);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update staff status.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-base text-slate-900">
              Staff Accounts &amp; Role Access (MongoDB Users)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Create and manage Management/Admin, Accountant, and Follow-Up Staff login accounts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-xs">
          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleCreate}
            className="border border-slate-200 rounded-md p-4 bg-slate-50/70 space-y-3"
          >
            <div className="font-medium text-slate-900 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-emerald-900" />
              <span>Add New Staff Login</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full Name (e.g. Tariq Mahmood)"
                className="px-3 py-2 border border-slate-200 rounded-md bg-white"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (e.g. accounts@baitulnoor.org)"
                className="px-3 py-2 border border-slate-200 rounded-md bg-white"
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (Optional)"
                className="px-3 py-2 border border-slate-200 rounded-md bg-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="accountant">Accountant</option>
                <option value="followup">Follow-Up Staff</option>
                <option value="management">Management / Admin</option>
              </select>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="px-3 py-2 border border-slate-200 rounded-md bg-white"
              />
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Staff Account'}
              </button>
            </div>
          </form>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-slate-500">
                Loading staff accounts...
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-2.5 px-4">Staff Member</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => {
                    const isActive = u.active !== false;
                    return (
                      <tr key={u.username}>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">
                            {u.staffName}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            {u.email || u.username} · {u.title}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {ROLE_LABELS[u.role]}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={
                              isActive
                                ? 'text-emerald-800 font-medium'
                                : 'text-rose-700 font-medium'
                            }
                          >
                            {isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {u.username === currentUser.username ? (
                            <span className="text-slate-400">Current Session</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggle(u)}
                              className="text-emerald-900 font-medium hover:underline"
                            >
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};