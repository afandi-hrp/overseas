import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PASSWORD_RULES_TEXT, validateNewPassword } from '../utils/passwordPolicy';
import shipmentIcon from '../assets/beehive-icon.png';

// Layar WAJIB ganti password (sql/066, tabel user_security) -- dirender ProtectedRoute (App.tsx) MENGGANTIKAN seluruh
// aplikasi selama `mustChangePassword` true: user baru (add-users.sql) / password masih default / ditandai Admin.
// Tidak ada jalan pintas: penanda di DB hanya hilang lewat trigger saat password BENAR-BENAR berubah, dan gateway
// /api/db menolak semua data selain self-service selama penanda aktif (server/routes/dbGateway.ts).
// Alur: verifikasi password saat ini (signInWithPassword, user sama -> AuthContext tidak menganggap ganti user) ->
// updateUser({password}) -> refreshProfile() membaca ulang penanda -> aplikasi terbuka.
export default function ForceChangePasswordScreen() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Change Password · BeeHive';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const email = user?.email;
    if (!email) {
      setError('Session not found. Please log in again.');
      return;
    }
    const invalid = validateNewPassword(pw1, { current, email });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (pw1 !== pw2) {
      setError('Password confirmation does not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) {
        setError(verifyError.message === 'Invalid login credentials' ? 'Current password is incorrect.' : verifyError.message);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: pw1 });
      if (updateError) {
        setError('Failed to change password: ' + updateError.message);
        return;
      }
      // Penanda di DB dihapus trigger saat password berubah -- baca ulang supaya aplikasi terbuka.
      await refreshProfile();
    } finally {
      setSubmitting(false);
    }
  };

  const inputRow = (icon: React.ReactNode, value: string, onChange: (v: string) => void, placeholder: string, autoFocus = false) => (
    <div className="flex items-center bg-white rounded-full pl-1 pr-4 border border-slate-200 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
      <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 my-1">{icon}</span>
      <input
        type="password"
        required
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm px-3 py-2.5 placeholder:text-slate-400"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#FFF5C5] to-[#F58C77] p-4">
      <div className="w-full max-w-sm bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/60 p-8">
        <div className="flex flex-col items-center mb-6">
          <img src={shipmentIcon} alt="BeeHive" className="h-14 w-14 object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#5A305A] text-center">Change Your Password</h1>
          <p className="text-xs text-[#5A305A]/70 text-center mt-1">
            Hi {profile?.nama || user?.email || 'there'}, for security you must set a new password before using BeeHive.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {inputRow(<Lock size={16} className="text-[#5A305A]" />, current, setCurrent, 'current password', true)}
          {inputRow(<KeyRound size={16} className="text-[#5A305A]" />, pw1, setPw1, 'new password')}
          {inputRow(<KeyRound size={16} className="text-[#5A305A]" />, pw2, setPw2, 'repeat new password')}

          <p className="text-[11px] text-[#5A305A]/70 px-2">{PASSWORD_RULES_TEXT}</p>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !current || !pw1 || !pw2}
            className="mt-1 w-full rounded-full bg-gradient-to-b from-[#5A305A] to-[#73507B] text-white font-semibold text-sm py-3 flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {submitting ? 'Saving...' : 'Save New Password'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full text-center text-xs font-semibold text-[#5A305A]/70 hover:text-[#5A305A] mt-6 transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
