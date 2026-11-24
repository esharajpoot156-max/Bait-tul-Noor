import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { AuthUser, loginApi } from '../utils/api';

interface LoginScreenProps {
  // Called with the logged-in user once the backend accepts the password
  onLoggedIn: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoggedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Falls back to a "BN" circle if the logo file cannot be loaded
  const [logoFailed, setLogoFailed] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const user = await loginApi(username.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reach the server. Please try again.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08241C] px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo + organization name */}
        <div className="flex flex-col items-center text-center mb-6">
          {!logoFailed ? (
            <img
              src="/logo.jpeg"
              alt="Bait-ul-Noor Orphanage Society logo"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-20 h-20 rounded-full bg-white p-1 object-contain border border-emerald-300/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 flex items-center justify-center font-display font-bold text-xl">
              BN
            </div>
          )}
          <h1 className="mt-4 font-display font-bold text-xl text-white tracking-tight">
            Bait-ul-Noor Orphanage Society
          </h1>
          <p className="mt-1 text-sm text-emerald-200/75">
            CRM &amp; NGO Accounting System
          </p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow-xl p-6 space-y-4"
        >
          <div>
            <h2 className="font-display font-bold text-base text-slate-900">
              Staff Login
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sign in with the username and password given to you.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Username</span>
            <div className="mt-1 relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                required
                className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Password</span>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-10 py-2 rounded-md border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="w-full py-2.5 rounded-md bg-emerald-900 text-white text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-emerald-200/60">
          Authorized society staff only.
        </p>
      </div>
    </div>
  );
};