import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import shipmentIcon from '../assets/beehive-icon.png';

// Panel login baru muncul sekali di detik ke-2 (setelah animasi latar sempat diputar),
// lalu TETAP tampil walau animasinya loop terus -- cuma reset kalau halaman di-refresh
// (karena state ini di-reset otomatis setiap component mount ulang).
const PANEL_REVEAL_DELAY_MS = 2000;

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
      {/* Animasi latar login -- AI scan dokumen (HTML/CSS/JS statis, di-embed via iframe) */}
      <iframe
        src="/login-bg.html"
        title="Login background animation"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full border-0 pointer-events-none"
      />

      {/* Panel login + wordmark -- overlay di atas animasi latar, sebelah kiri (desktop) / bawah
          (mobile) supaya animasinya tetap kelihatan. Muncul smooth di detik ke-2, lalu tetap
          di tempatnya walau animasinya loop. Panel & wordmark diposisikan independen (bukan flex
          yang saling dorong) supaya wordmark selalu mulai persis di batas kiri "scene" (30% lebar
          layar, sama seperti login-space di public/login-bg.html) -- jadi lurus dengan kolom
          kartu dokumen di semua ukuran layar, bukan ikut menempel ke lebar panel. */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out
          ${showPanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Panel login -- lebar mengikuti layar (lebih besar di monitor 24" supaya proporsional
            dengan wordmark & animasi di sebelahnya, bukan terlihat kecil sendirian). */}
        <div
          className={`flex items-center justify-center h-full px-4
            md:absolute md:inset-y-0 md:left-0 md:w-[30%] md:justify-center md:px-6
            transition-transform duration-700 ease-out
            ${showPanel ? 'translate-y-0 md:translate-x-0' : 'translate-y-6 md:translate-y-0 md:-translate-x-6'}`}
        >
        <div className="w-full max-w-xs lg:max-w-sm 2xl:max-w-md shrink-0 bg-white/25 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white/40 p-8 2xl:p-10">
          <div className="flex flex-col items-center mb-6 2xl:mb-8">
            <img src={shipmentIcon} alt="BeeHive" className="h-16 w-16 2xl:h-20 2xl:w-20 object-contain mb-3 [filter:drop-shadow(0_0_14px_rgba(90,48,90,0.55))_drop-shadow(0_0_4px_rgba(90,48,90,0.7))]" />
            <h1 className="text-2xl 2xl:text-3xl font-bold text-[#5A305A] text-center">BeeHive</h1>
          </div>

          <h2 className="text-lg 2xl:text-xl font-bold text-[#5A305A] mb-4 2xl:mb-6">Log in</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 2xl:gap-4">
            <div className="flex items-center bg-white/70 rounded-full pl-1 pr-4 border border-white/60 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
              <span className="w-9 h-9 2xl:w-11 2xl:h-11 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm my-1">
                <Mail size={16} className="text-[#5A305A] 2xl:hidden" />
                <Mail size={19} className="text-[#5A305A] hidden 2xl:block" />
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm 2xl:text-base px-3 py-2.5 2xl:py-3.5 placeholder:text-[#5A305A]"
                placeholder="username or email"
              />
            </div>

            <div className="flex items-center bg-white/70 rounded-full pl-1 pr-4 border border-white/60 focus-within:ring-2 focus-within:ring-[#5A305A]/20 focus-within:border-[#5A305A] transition-all">
              <span className="w-9 h-9 2xl:w-11 2xl:h-11 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm my-1">
                <Lock size={16} className="text-[#5A305A] 2xl:hidden" />
                <Lock size={19} className="text-[#5A305A] hidden 2xl:block" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm 2xl:text-base px-3 py-2.5 2xl:py-3.5 placeholder:text-[#5A305A]"
                placeholder="password"
              />
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs 2xl:text-sm font-semibold text-[#5A305A]/70 hover:text-[#5A305A] shrink-0 whitespace-nowrap transition-colors"
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
                className="w-12 h-12 2xl:w-14 2xl:h-14 rounded-full bg-gradient-to-b from-[#5A305A] to-[#73507B] text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin 2xl:hidden" />
                    <Loader2 size={21} className="animate-spin hidden 2xl:block" />
                  </>
                ) : (
                  <>
                    <ArrowRight size={18} className="2xl:hidden" />
                    <ArrowRight size={21} className="hidden 2xl:block" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-xs 2xl:text-sm font-light text-[#5A305A] mt-6 2xl:mt-8">Powered by Waruna Group</p>
        </div>
        </div>

        {/* Wordmark -- logo bersih (transparan, tanpa kotak putih) di kiri + judul/subjudul di
            kanan. Diposisikan sendiri dari md:left-[30%] (persis batas kiri "scene" tempat kartu
            dokumen mulai) sampai md:right-[22%] (berhenti sebelum area hub AI di kanan) --
            supaya lurus dengan kolom kartu dokumen, bukan ikut lebar panel. Ukuran font pakai
            clamp(vw) dengan batas atas lebih tinggi supaya benar-benar mengisi pita kosong itu di
            monitor 24" (bukan cuma mentok kecil lalu nyisa ruang kosong), tapi tetap wajar di
            layar 14" karena vw-nya kecil di sana. "Bee" bold tegas + "Hive" bobot normal/lebih
            ringan (pola 2 bobot dalam 1 kata, sama seperti "ATS" bold vs "WARUNA" reguler).
            Text-shadow tipis supaya tetap terbaca di atas kartu animasi tanpa kotak latar opaque. */}
        <div
          className={`hidden md:flex md:absolute md:inset-y-0 md:left-[30%] md:right-[22%] md:items-center
            transition-transform duration-700 ease-out
            ${showPanel ? 'md:translate-x-0' : 'md:-translate-x-6'}`}
        >
          <div className="flex items-center gap-6 lg:gap-8 2xl:gap-10 min-w-0">
            <img src={shipmentIcon} alt="BeeHive" className="h-[clamp(4rem,7vw,9rem)] w-[clamp(4rem,7vw,9rem)] object-contain shrink-0 [filter:drop-shadow(0_0_16px_rgba(90,48,90,0.5))_drop-shadow(0_0_5px_rgba(90,48,90,0.65))]" />
            <div className="min-w-0">
              <h2 className="leading-tight tracking-tight [text-shadow:0_2px_16px_rgba(255,248,220,0.65)]">
                <span className="font-extrabold text-[clamp(2.75rem,7.5vw,9rem)] text-[#5A305A]">Bee</span><span className="font-normal text-[clamp(2.75rem,7.5vw,9rem)] text-[#73507B]">Hive</span>
              </h2>
              <p className="text-[#73507B] font-medium text-[clamp(1.1rem,2.4vw,2.5rem)] mt-2 leading-snug [text-shadow:0_2px_12px_rgba(255,248,220,0.6)]">AI Automation Waruna</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}