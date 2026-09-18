import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, BarChart3, ShieldAlert, Ship } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import Greeting from '../components/Greeting';
import ReportingDashboardPage from './ReportingDashboardPage';
import ReportingCostPerVesselPage from './ReportingCostPerVesselPage';

// Halaman gabungan "Cost by Vessel" (2026-09, permintaan user) -- GANTI TOTAL dari 2 halaman
// top-level terpisah "Reporting Dashboard" (`/reporting/dashboard`) & "Cost per Vessel"
// (`/reporting/cost-per-vessel`), sekarang jadi 2 TAB di 1 halaman/1 route
// (`/reporting/cost-by-vessel`). Kedua komponen ASLI (`ReportingDashboardPage`/
// `ReportingCostPerVesselPage`) TIDAK diubah struktur internalnya sama sekali (isi/logic di
// bawah `<main>` masing2 PERSIS spt sebelumnya) -- HANYA `<header>` bawaan masing2 yg di-skip
// (prop `embedded`, lihat komentar di file itu) krn halaman ini sekarang py SATU header sendiri
// (pola "Header halaman" standar di CLAUDE.md) + tab bar bersih di bawahnya (2026-09 susulan,
// laporan user "tab jelek, ada border putih" -- versi awal taruh tab bar di ATAS/terpisah dari
// header dgn style `border-b-2` mirip tab browser, kelihatan norak di atas background gradient
// halaman; SEKARANG tab jadi pill button polos tepat di bawah judul+deskripsi, konsisten dgn
// pola tab lain di app mis. `viewMode` toggle di `ReportingCostPerVesselPage.tsx`).
//
// page_key RBAC TETAP 2 terpisah ('reporting_dashboard'/'reporting_cost_per_vessel', lihat
// `PAGE_REGISTRY` di permissions.ts) -- TIDAK digabung jadi 1 page_key baru, supaya assignment
// akses per-role yang sudah ada di Kelola Role & Akses tetap valid apa adanya (halaman ini murni
// gabungan navigasi/UI, bukan penggabungan RBAC). Route ini SENGAJA TIDAK dibungkus
// `RequirePageAccess` pageKey tunggal di App.tsx (pola sama `/settings` hub -- `canSee()`
// internal, lihat SettingsPage.tsx) krn butuh cek "salah SATU dari 2 page_key", bukan 1 --
// tab yang tidak diizinkan disembunyikan dari tab bar, & kalau user tidak py akses ke KEDUANYA
// tampilkan pesan "Tidak Ada Akses" sendiri (replika gaya `RequirePageAccess.tsx`).
//
// Cross-navigation ANTAR 2 komponen ini (Dashboard -> "View Details"/klik chart vessel ->
// Cost per Vessel dgn filter+scroll+blink, tombol "Back to Dashboard") TETAP JALAN PERSIS
// SEPERTI SEBELUMNYA -- link internal di kedua komponen SUDAH diarahkan ulang (lihat
// `ReportingDashboardPage.tsx`/`ReportingCostPerVesselPage.tsx`) ke route baru ini dgn
// `?view=dashboard`/`?view=cost_per_vessel` (+ param lama mode/year/month/tab/highlight tetap
// dikirim apa adanya, dibaca oleh komponen anak masing2 lewat `useSearchParams()` sendiri --
// TIDAK ada props baru yg perlu di-thread, krn keduanya baca query string dari URL yg SAMA).
type ReportingView = 'dashboard' | 'cost_per_vessel';

export default function CostByVesselPage() {
  useEffect(() => { document.title = 'Overseas Cost by Vessel · BeeHive'; }, []);
  const { isAdmin, allowedPageKeys } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canSeeDashboard = isAdmin || allowedPageKeys.has('reporting_dashboard');
  const canSeeCostPerVessel = isAdmin || allowedPageKeys.has('reporting_cost_per_vessel');

  const initialView: ReportingView = searchParams.get('view') === 'cost_per_vessel' ? 'cost_per_vessel' : 'dashboard';
  const [view, setView] = useState<ReportingView>(
    initialView === 'dashboard' && !canSeeDashboard && canSeeCostPerVessel ? 'cost_per_vessel' : initialView
  );

  // Sinkron BALIK dari URL -- deep-link internal (klik chart/tombol di dalam salah satu
  // komponen anak) navigate ke `?view=...` baru, effect ini yg pindahin tab-nya (state lokal
  // TIDAK otomatis ikut brubah tiap render krn cuma dibaca sekali di `useState` initializer).
  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'dashboard' || v === 'cost_per_vessel') setView(v);
  }, [searchParams]);

  const switchTab = (v: ReportingView) => {
    setView(v);
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  if (!canSeeDashboard && !canSeeCostPerVessel) {
    return (
      <div className="flex-1 h-full flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={22} />
          </div>
          <h2 className="font-bold text-[#5A305A] mb-1.5">Tidak Ada Akses</h2>
          <p className="text-sm font-light text-[#5A305A]/80">Anda tidak memiliki akses ke halaman "Overseas Cost by Vessel". Hubungi PIC/admin kalau merasa ini seharusnya diizinkan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden min-w-0 flex flex-col">
      {/* Header standar (pola "Header halaman" di CLAUDE.md) -- satu2nya header yg tampil,
          menggantikan header bawaan `ReportingDashboardPage`/`ReportingCostPerVesselPage`
          (di-skip via prop `embedded` di bawah). */}
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Ship size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Overseas Cost by Vessel</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Cost summary per vessel — Courier, Sea, Air, FAR Overseas</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      {/* Tab bar bersih (pill button, TANPA border/garis pemisah putih) tepat di bawah
          judul+deskripsi -- pola sama tombol toggle tab lain di app (mis. `viewMode` di
          `ReportingCostPerVesselPage.tsx`). Tab yg page_key-nya tidak diizinkan disembunyikan
          (bukan disabled), sama pola "sidebar cuma nampilin menu yg role user boleh akses". */}
      <div className="flex items-center gap-2 px-3 pb-2 shrink-0">
        {canSeeDashboard && (
          <button onClick={() => switchTab('dashboard')}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${view === 'dashboard' ? 'bg-[#5A305A] text-white' : 'bg-white text-[#5A305A]/70 hover:text-[#5A305A]'}`}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
        )}
        {canSeeCostPerVessel && (
          <button onClick={() => switchTab('cost_per_vessel')}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${view === 'cost_per_vessel' ? 'bg-[#5A305A] text-white' : 'bg-white text-[#5A305A]/70 hover:text-[#5A305A]'}`}>
            <BarChart3 size={14} /> Cost per Vessel
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {view === 'dashboard' && canSeeDashboard && <ReportingDashboardPage embedded />}
        {view === 'cost_per_vessel' && canSeeCostPerVessel && <ReportingCostPerVesselPage embedded />}
      </div>
    </div>
  );
}
