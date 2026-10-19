import React, { useState } from 'react';
import { KeyRound, RefreshCw, Copy, Check, X, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateNewPassword } from '../utils/passwordPolicy';

// Modal Admin (Manage Roles & Access -> Roles per User): reset password user (sql/067 `fn_admin_reset_user_password`:
// set password sementara + WAJIB ganti saat login berikutnya + logout paksa semua perangkat) ATAU hanya mewajibkan /
// membatalkan wajib ganti password (sql/066 `fn_set_must_change_password`) tanpa mengubah password.
// Password sementara dibuat ACAK di browser (crypto.getRandomValues), tampil SEKALI utk disampaikan Admin ke user --
// tidak disimpan di mana pun selain hash bcrypt di auth.users.

// Tanpa karakter yang mirip (0/O, 1/l/I) supaya mudah didiktekan.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
function generateTempPassword(length = 12): string {
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(LETTERS + DIGITS));
  // acak urutan (Fisher-Yates)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export type ResetTarget = { id: string; nama: string | null; email: string | null; mustChangePassword: boolean };

export default function ResetUserPasswordModal({ target, onClose, onChanged }: {
  target: ResetTarget;
  onClose: () => void;
  // Dipanggil setelah status wajib ganti password user berubah (utk memperbarui badge di tabel).
  onChanged: (userId: string, mustChangePassword: boolean) => void;
}) {
  const [password, setPassword] = useState(() => generateTempPassword());
  const [busy, setBusy] = useState<'reset' | 'flag' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | 'reset' | 'flag-on' | 'flag-off'>(null);
  const [copied, setCopied] = useState(false);
  const who = target.nama || target.email || 'this user';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically -- please select and copy the password manually.');
    }
  };

  const handleReset = async () => {
    setError('');
    const invalid = validateNewPassword(password, { email: target.email });
    if (invalid) { setError(invalid); return; }
    setBusy('reset');
    const { error: rpcError } = await supabase.rpc('fn_admin_reset_user_password', { p_user_id: target.id, p_new_password: password });
    setBusy(null);
    if (rpcError) { setError('Failed to reset password: ' + rpcError.message); return; }
    onChanged(target.id, true);
    setDone('reset');
  };

  const handleFlag = async (value: boolean) => {
    setError('');
    setBusy('flag');
    const { error: rpcError } = await supabase.rpc('fn_set_must_change_password', { p_user_id: target.id, p_value: value });
    setBusy(null);
    if (rpcError) { setError('Failed to update: ' + rpcError.message); return; }
    onChanged(target.id, value);
    setDone(value ? 'flag-on' : 'flag-off');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0"><KeyRound size={17} /></span>
            <div className="min-w-0">
              <h3 className="font-bold text-[#5A305A] leading-tight">Reset Password</h3>
              <p className="text-xs text-[#5A305A]/70 truncate">{who}{target.email && target.nama ? ` · ${target.email}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={!!busy} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {done === 'reset' ? (
          <div className="space-y-3">
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              Password has been reset. {who} has been logged out on all devices and must change this password at the next login.
            </div>
            <p className="text-xs font-semibold text-[#5A305A]">Temporary password (shown only once):</p>
            <div className="flex gap-2">
              <code className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 select-all break-all text-[#5A305A]">{password}</code>
              <button onClick={copy} className="shrink-0 px-3 rounded-xl border border-slate-200 text-[#5A305A] hover:bg-slate-50 flex items-center gap-1.5 text-xs font-semibold">
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-[#5A305A]/70">Send it to the user privately (not in a group chat).</p>
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm px-5 py-2 rounded-xl">Done</button>
            </div>
          </div>
        ) : done ? (
          <div className="space-y-3">
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {done === 'flag-on'
                ? `${who} must change their password at the next page load or login. Their current password is unchanged.`
                : `${who} is no longer required to change their password.`}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm px-5 py-2 rounded-xl">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[#5A305A]">Temporary password</label>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 min-w-0 font-mono text-sm border border-slate-300 rounded-xl px-3 py-2.5 text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
              />
              <button onClick={() => setPassword(generateTempPassword())} disabled={!!busy} title="Generate a new random password"
                className="shrink-0 px-3 rounded-xl border border-slate-200 text-[#5A305A] hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw size={15} />
              </button>
              <button onClick={copy} disabled={!!busy} title="Copy"
                className="shrink-0 px-3 rounded-xl border border-slate-200 text-[#5A305A] hover:bg-slate-50 disabled:opacity-50">
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>
            <div className="flex gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>The user will be logged out on all devices and must change this temporary password at the next login.</span>
            </div>

            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={() => handleFlag(!target.mustChangePassword)}
                disabled={!!busy}
                title={target.mustChangePassword ? 'Remove the password change requirement' : 'Keep the current password but require a change at next use'}
                className="text-xs font-semibold text-[#5A305A]/80 hover:text-[#5A305A] underline-offset-2 hover:underline disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy === 'flag' && <Loader2 size={13} className="animate-spin" />}
                {target.mustChangePassword ? 'Cancel password change requirement' : 'Only require password change'}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} disabled={!!busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-[#5A305A] hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                <button onClick={handleReset} disabled={!!busy || !password}
                  className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm px-4 py-2 rounded-xl disabled:opacity-50 flex items-center gap-2">
                  {busy === 'reset' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
