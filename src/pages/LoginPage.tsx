import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import shipmentIcon from '../assets/shipment-icon-badge.png';

// Panel login baru muncul sekali di detik ke-8 (setelah animasi logo sempat diputar),
// lalu TETAP tampil walau videonya loop terus -- cuma reset kalau halaman di-refresh
// (karena state ini di-reset otomatis setiap component mount ulang).
const PANEL_REVEAL_DELAY_MS = 8000;

export default function LoginPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: 'sukses' | 'gagal', text: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowPanel(true), PANEL_REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!authLoading && session) {
    const from = (location.state as any)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message === 'Invalid login credentials' ? 'Incorrect email or password.' : signInError.message);
      return;
    }
    const from = (location.state as any)?.from?.pathname || '/';
    navigate(from, { replace: true });
  };

  const handleForgotPassword = async () => {
    setForgotMsg(null);
    if (!email.trim()) {
      setForgotMsg({ type: 'gagal', text: 'Enter your email above first.' });
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) {
      setForgotMsg({ type: 'gagal', text: resetError.message });
    } else {
      setForgotMsg({ type: 'sukses', text: 'Password reset link sent to your email.' });
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-[#FFF5C5] to-[#F58C77]">
      {/* Animasi logo -- versi desktop */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="hidden md:block absolute inset-0 w-full h-full object-cover"
      >
        <source src="/videos/login-motion-desktop.mp4" type="video/mp4" />
      </video>

      {/* Animasi logo -- versi mobile (resolusi menyesuaikan lebar layar) */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="md:hidden absolute inset-0 w-full h-full object-cover"
      >
        <source src="/videos/login-motion-mobile-sm.mp4" media="(max-width: 420px)" type="video/mp4" />
        <source src="/videos/login-motion-mobile.mp4" type="video/mp4" />
      </video>

      {/* Panel login -- overlay di atas video, sebelah kiri (desktop) / bawah (mobile)
          supaya animasi logo tetap kelihatan. Muncul smooth di detik ke-8, lalu tetap
          di tempatnya walau videonya loop. */}
      <div
        className={`absolute inset-0 flex items-center justify-center px-4
          md:inset-y-0 md:left-0 md:right-auto md:justify-start md:pl-28 md:pr-16
          transition-all duration-700 ease-out
          ${showPanel ? 'opacity-100 translate-y-0 md:translate-x-0 pointer-events-auto' : 'opacity-0 translate-y-6 md:translate-y-0 md:-translate-x-6 pointer-events-none'}`}
      >
        <div className="w-full max-w-xs mx-auto md:mx-0 bg-white/25 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/40 p-8">
          <div className="flex flex-col items-center mb-6">
            <img src={shipmentIcon} alt="Shipment" className="h-16 w-16 object-contain mb-3 rounded-2xl shadow-md" />
            <h1 className="text-2xl font-bold text-[#5A305A] text-center">Shipment</h1>
          </div>

          <h2 className="text-lg font-bold text-[#5A305A] mb-4">Log in</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center bg-white/70 rounded-full pl-1 pr-4 border border-white/60 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
              <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm my-1">
                <Mail size={16} className="text-[#5A305A]" />
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm px-3 py-2.5 placeholder:text-[#5A305A]"
                placeholder="username or email"
              />
            </div>

            <div className="flex items-center bg-white/70 rounded-full pl-1 pr-4 border border-white/60 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
              <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm my-1">
                <Lock size={16} className="text-[#5A305A]" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm px-3 py-2.5 placeholder:text-[#5A305A]"
                placeholder="password"
              />
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-semibold text-[#5A305A]/70 hover:text-[#5A305A] shrink-0 whitespace-nowrap transition-colors"
              >
                I forgot
              </button>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
            )}
            {forgotMsg && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${forgotMsg.type === 'sukses' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                {forgotMsg.text}
              </div>
            )}

            <div className="flex justify-end mt-1">
              <button
                type="submit"
                disabled={submitting}
                aria-label="Sign in"
                className="w-12 h-12 rounded-full bg-gradient-to-b from-[#5A305A] to-[#73507B] text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              </button>
            </div>
          </form>

          <p className="text-center text-xs font-bold text-[#5A305A] mt-6">Powered by Waruna Group</p>
        </div>
      </div>
    </div>
  );
}