import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth, LOCKSCREEN_PORTAL_ID } from '../lib/AuthContext';
import shipmentIcon from '../assets/beehive-icon.png';

// Overlay "layar kunci" -- muncul di atas halaman terakhir yang sedang dibuka (di-blur+`inert`
// oleh effect di AuthContext.tsx, diterapkan ke SEMUA child <body>) saat sesi berakhir SENDIRI
// (idle-timeout / logout-paksa-tutup-tab) SELAGI tab ini masih terbuka. Beda dari LoginPage
// penuh -- di sini user cuma perlu input password (email/nama sudah diketahui dari sesi
// sebelumnya), dan begitu berhasil, halaman yang tadi di-blur langsung "hidup" lagi apa adanya
// (state React tidak pernah hilang, tidak reload).
//
// RENDER LEWAT PORTAL ke document.body (2026-09, KEAMANAN) -- SENGAJA, bukan child biasa dari
// <Outlet/> lagi. `id={LOCKSCREEN_PORTAL_ID}` di elemen terluar WAJIB SAMA PERSIS dgn yang dicek
// effect blur+inert di AuthContext.tsx (satu-satunya pengecualian dari blur+inert seluruh
// <body>) -- kalau id-nya beda/hilang, LockScreen ini akan ikut memblur+mengunci DIRINYA SENDIRI
// sampai tidak bisa dipakai sama sekali.
export default function LockScreen() {
  const { lockedProfile, unlock, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: unlockError } = await unlock(password);
    setSubmitting(false);
    if (unlockError) {
      setError(unlockError);
      return;
    }
    setPassword('');
  };

  return createPortal(
    <div id={LOCKSCREEN_PORTAL_ID} className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/60 p-8">
        <div className="flex flex-col items-center mb-6">
          <img src={shipmentIcon} alt="BeeHive" className="h-14 w-14 object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#5A305A] text-center">Session Locked</h1>
          <p className="text-xs text-[#5A305A]/70 text-center mt-1">
            {lockedProfile?.nama || lockedProfile?.email || 'Your session'} was signed out due to inactivity. Enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center bg-white rounded-full pl-1 pr-4 border border-slate-200 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
            <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 my-1">
              <Lock size={16} className="text-[#5A305A]" />
            </span>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm px-3 py-2.5 placeholder:text-slate-400"
              placeholder="password"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex justify-end mt-1">
            <button
              type="submit"
              disabled={submitting || !password}
              aria-label="Unlock"
              className="w-12 h-12 rounded-full bg-gradient-to-b from-[#5A305A] to-[#73507B] text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full text-center text-xs font-semibold text-[#5A305A]/70 hover:text-[#5A305A] mt-6 transition-colors"
        >
          Not you? Log out
        </button>
      </div>
    </div>,
    document.body
  );
}
