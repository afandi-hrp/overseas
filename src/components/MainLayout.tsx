import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, Ship, ScrollText, Settings, ChevronUp, ChevronDown, LogOut, UserCircle, FileCheck2, GitCompare, BarChart3, Menu, X } from 'lucide-react';
import shipmentIcon from '../assets/beehive-icon.png';
import { useAuth } from '../lib/AuthContext';

// Tipe eksplisit (2026-09, ditambahkan saat "Cost by Vessel" butuh `pageKeys` array di beberapa
// entry) -- tanpa ini TS infer union literal per-anggota array yg TIDAK saling exchangeable
// (mis. entry dgn `pageKey` tunggal vs `pageKeys` array dianggap 2 tipe beda total), bikin akses
// `t.pageKeys`/`s.pageKeys` di `visibleTabs` error walau valid secara logic (optional chaining
// tetap butuh properti itu ADA di tipe union-nya, bukan cuma di sebagian anggota).
type SubTab = { id: string; label: string; path: string; pageKey?: string; pageKeys?: string[] };
type MainTab = { id: string; label: string; icon: any; path: string; basePath: string; pageKey?: string; pageKeys?: string[]; subTabs?: SubTab[] };

const MAIN_TABS: MainTab[] = [
  {
    id: 'courier',
    label: 'Courier',
    icon: Plane,
    path: '/courier/audit',
    basePath: '/courier',
    subTabs: [
      { id: 'courier_audit', label: 'Audit', path: '/courier/audit', pageKey: 'courier_audit' },
      { id: 'courier_rekapan', label: 'Invoice Recap', path: '/courier/rekapan', pageKey: 'courier_rekapan' },
      { id: 'courier_validasi', label: 'Validation', path: '/courier/validasi', pageKey: 'courier_validasi' },
      { id: 'courier_upload', label: 'Upload', path: '/courier/upload', pageKey: 'courier_upload' },
    ]
  },
  {
    id: 'sea_air',
    label: 'Sea & Air',
    icon: Ship,
    path: '/sea-air/audit',
    basePath: '/sea-air',
    subTabs: [
      { id: 'sea_air_audit',   label: 'Audit', path: '/sea-air/audit', pageKey: 'sea_air_audit' },
      { id: 'sea_air_rekapan', label: 'Invoice Recap', path: '/sea-air/rekapan', pageKey: 'sea_air_rekapan' },
      { id: 'sea_air_upload', label: 'Upload', path: '/sea-air/upload', pageKey: 'sea_air_upload' },
    ]
  },
  {
    id: 'direct_loading',
    label: 'FAR Overseas',
    icon: FileCheck2,
    path: '/direct-loading',
    basePath: '/direct-loading',
    pageKey: 'direct_loading',
  },
  {
    // Posisi TEPAT DI BAWAH "FAR Overseas" (2026-09, permintaan user -- dulu di bawah "Compare
    // Doc"). Urutan array ini = urutan render sidebar, JANGAN dipindah lagi tanpa diminta ulang.
    // Riwayat: "Reporting Dashboard" & "Cost per Vessel" dulu 2 subtab terpisah -> digabung jadi
    // 1 halaman `CostByVesselPage.tsx` (2 tab DI DALAM halaman) -> menu sidebar sempat jadi 1
    // item tanpa subTabs -> SEKARANG (susulan, permintaan user) DIBUNGKUS LAGI jadi 1 menu induk
    // "Reporting" dgn 1 subtab "Cost by Vessel" (bukan lagi top-level langsung) -- supaya
    // struktur sidebar siap kalau modul Reporting lain ditambah ke depan sbg subtab baru.
    // `pageKeys` (array, BUKAN `pageKey` tunggal) di level SUBTAB -- tab ini tampil kalau user
    // py akses ke SALAH SATU dari 2 page_key lama (`reporting_dashboard`/
    // `reporting_cost_per_vessel`), keduanya TETAP ada di PAGE_REGISTRY (assignment role
    // existing tidak berubah) -- gating detail per-tab DI DALAM halaman tetap oleh
    // `CostByVesselPage.tsx` sendiri, ini cuma gating utk tampil/tidaknya menu sidebar.
    id: 'reporting',
    label: 'Reporting',
    icon: BarChart3,
    path: '/reporting/cost-by-vessel',
    basePath: '/reporting',
    subTabs: [
      { id: 'reporting_cost_by_vessel', label: 'Cost by Vessel', path: '/reporting/cost-by-vessel', pageKeys: ['reporting_dashboard', 'reporting_cost_per_vessel'] },
    ],
  },
  {
    // Menu gabungan (2026-09, permintaan user) -- Bunker, Audit AP Local, Audit AP Overseas
    // dulunya 3 tab top-level terpisah, sekarang jadi submenu di bawah 1 menu "Compare Doc".
    // `basePath` sengaja diisi path dummy yang tidak match route manapun ('/compare-doc') karena
    // ke-3 subtab-nya punya prefix path yang TIDAK senada (beda dari Courier/Sea & Air yang
    // semua subtab-nya berbagi 1 basePath) -- deteksi tab aktif utk grup ini murni dari cocokan
    // path masing-masing subtab, lihat helper `pathBelongs` & `activeMainTab` di bawah.
    id: 'compare_doc',
    label: 'Compare Doc',
    icon: GitCompare,
    path: '/bunker',
    basePath: '/compare-doc',
    subTabs: [
      { id: 'bunker', label: 'Bunker', path: '/bunker', pageKey: 'bunker' },
      { id: 'audit_po', label: 'Audit AP Local', path: '/audit-po', pageKey: 'audit_po' },
      { id: 'audit_po_overseas', label: 'Audit AP Overseas', path: '/audit-po-overseas', pageKey: 'audit_po_overseas' },
      { id: 'accounting_rekap', label: 'Accounting Rekap', path: '/accounting-rekap', pageKey: 'accounting_rekap' },
      { id: 'pi_local', label: 'PI Local', path: '/pi-local', pageKey: 'pi_local' },
    ]
  },
  {
    id: 'trail',
    label: 'Audit Trail',
    icon: ScrollText,
    path: '/audit-trail',
    basePath: '/audit-trail',
    pageKey: 'audit_trail',
  },
];


export default function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Navigasi mobile (2026-09, permintaan user) -- dulu top bar mobile nampilin SEMUA tab+subtab
  // sbg 2 baris scroll horizontal (kepotong/kepanjangan di layar sempit). GANTI TOTAL jadi
  // hamburger (ikon 3 garis) + drawer slide-in dari kiri, replika struktur menu desktop sidebar
  // (main tab + submenu expand) TAPI komponen JSX terpisah sendiri (gesture/interaksi mobile --
  // tap buka/tutup submenu -- beda dari desktop yg hover).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedTab, setMobileExpandedTab] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, allowedPageKeys, isAdmin, profile, user } = useAuth();
  const accountName = profile?.nama || user?.email?.split('@')[0] || 'User';
  const accountInitial = accountName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Sidebar cuma nampilin menu yang role user boleh akses (lihat src/lib/permissions.ts) --
  // tab dengan subTabs (Courier, Sea & Air) tetap tampil kalau MINIMAL 1 subtab-nya diizinkan,
  // subtab yang tidak diizinkan disembunyikan satu-satu. Admin selalu lihat semua.
  const visibleTabs = useMemo(() => {
    return MAIN_TABS.map(t => {
      if (t.subTabs) {
        // Subtab bisa py `pageKey` tunggal (Courier/Sea & Air dst) ATAU `pageKeys` array (mis.
        // "Cost by Vessel" -- lolos kalau py akses ke SALAH SATU dari beberapa page_key).
        const visibleSub = isAdmin ? t.subTabs : t.subTabs.filter(s =>
          s.pageKey ? allowedPageKeys.has(s.pageKey) : s.pageKeys ? s.pageKeys.some(pk => allowedPageKeys.has(pk)) : false
        );
        return visibleSub.length > 0 ? { ...t, subTabs: visibleSub } : null;
      }
      // `pageKeys` (array) di level MAIN_TAB tanpa subTabs -- sama polanya, lolos kalau py akses
      // ke SALAH SATU dari beberapa page_key.
      const allowed = isAdmin || (t.pageKey ? allowedPageKeys.has(t.pageKey) : t.pageKeys ? t.pageKeys.some(pk => allowedPageKeys.has(pk)) : false);
      return allowed ? t : null;
    }).filter((t): t is NonNullable<typeof t> => t !== null);
  }, [allowedPageKeys, isAdmin]);

  // Cocokkan path dengan batas segmen yang benar (exact match atau diikuti "/"), BUKAN
  // startsWith polos: mis. basePath '/audit-po' adalah prefix string dari '/audit-po-overseas',
  // startsWith polos bakal salah cocok.
  const pathBelongs = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

  // Determine active main tab -- cek basePath tab itu sendiri DULU, lalu (kalau ada subTabs)
  // cek path masing-masing subtab satu-satu. Perlu utk grup "Compare Doc": subtab-nya
  // (Bunker/Audit AP Local/Audit AP Overseas) punya prefix path yang TIDAK senada satu sama
  // lain, beda dari Courier/Sea & Air yang semua subtab-nya berbagi 1 basePath -- jadi tidak
  // cukup dicek lewat basePath induk saja.
  const activeMainTab = MAIN_TABS.find(t =>
    pathBelongs(location.pathname, t.basePath) || t.subTabs?.some(s => pathBelongs(location.pathname, s.path))
  )?.id || visibleTabs[0]?.id || 'courier';
  const activeSubTabPath = location.pathname;

  // Submenu terbuka/tertutup independen dari section aktif -- supaya bisa ditutup manual
  // setelah user pilih salah satu sub menu, tidak selalu terbuka terus.
  const [expandedTab, setExpandedTab] = useState<string | null>(activeMainTab);
  useEffect(() => {
    setExpandedTab(activeMainTab);
  }, [activeMainTab]);

  // Drawer mobile: tutup otomatis tiap pindah halaman (jaga2 kalau ada jalur navigasi yg lolos
  // dari `onClick` manual di link/tombol drawer), & submenu yg ke-expand default ikut section
  // aktif SETIAP drawer dibuka (`mobileMenuOpen`) -- bukan `activeMainTab` polos, supaya user
  // BEBAS ciutkan submenu section aktif tanpa balik ke-expand paksa tiap render biasa.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
  useEffect(() => { if (mobileMenuOpen) setMobileExpandedTab(activeMainTab); }, [mobileMenuOpen, activeMainTab]);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gradient-to-br from-[#FFF5C5] to-[#F58C77] md:p-4 md:gap-4">
      
      {/* ── Mobile Top Bar (compact, hamburger only) ── */}
      <div className="md:hidden flex items-center justify-between px-5 py-4 shrink-0 bg-[#5A305A] text-white z-50 shadow-md rounded-b-[1.5rem]">
        <div className="flex items-center gap-2.5">
          <img src={shipmentIcon} alt="BeeHive" className="h-7 w-7 object-contain shrink-0" />
          <div className="font-bold text-xl tracking-wide">BeeHive</div>
        </div>
        <button onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors">
          <Menu size={20} />
        </button>
      </div>

      {/* ── Mobile Nav Drawer (2026-09) -- slide-in dari kiri, backdrop gelap, isinya replika
          struktur menu desktop sidebar (main tab + submenu tap-to-expand) + Account/Settings/
          Logout di footer. Ganti total dari versi lama (2 baris scroll horizontal semua
          tab+subtab sekaligus di top bar). */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <React.Fragment>
            <motion.div
              className="md:hidden fixed inset-0 bg-black/50 z-[60]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              className="md:hidden fixed top-0 left-0 bottom-0 w-[82vw] max-w-[19rem] bg-[#5A305A] z-[70] flex flex-col shadow-2xl"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <img src={shipmentIcon} alt="BeeHive" className="h-7 w-7 object-contain shrink-0" />
                  <div className="font-bold text-lg tracking-wide text-white">BeeHive</div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3">
                {visibleTabs.map(t => {
                  const isActive = activeMainTab === t.id;
                  const Icon = t.icon;
                  return (
                    <div key={t.id} className="mb-0.5">
                      <button
                        onClick={() => {
                          if (t.subTabs) { setMobileExpandedTab(prev => prev === t.id ? null : t.id); }
                          else { navigate(t.path); setMobileMenuOpen(false); }
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition-all ${
                          isActive ? 'bg-white text-[#5A305A] shadow-sm' : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon size={16} strokeWidth={2.25} />
                          <span className="text-[15px] font-bold">{t.label}</span>
                        </span>
                        {t.subTabs && (mobileExpandedTab === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </button>

                      {t.subTabs && mobileExpandedTab === t.id && (
                        <div className="flex flex-col pl-9 gap-1 mt-1 mb-2">
                          {t.subTabs.map(sub => {
                            const isSubActive = activeSubTabPath === sub.path;
                            return (
                              <Link
                                key={sub.id}
                                to={sub.path}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 text-[14px] font-semibold py-2 px-3 rounded-lg transition-all ${
                                  isSubActive ? 'bg-[#5B4266] text-white shadow-inner' : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                                }`}
                              >
                                <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${isSubActive ? 'bg-white' : 'bg-[#a394a8]'}`}></span>
                                {sub.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 px-3 pb-4 pt-2 border-t border-white/10">
                <Link to="/account" onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    location.pathname === '/account' ? 'text-white bg-white/10' : 'text-[#a394a8] hover:bg-white/5 hover:text-white'
                  }`}>
                  <UserCircle size={16} strokeWidth={2.25} />
                  <span className="text-[15px] font-semibold">My Account</span>
                </Link>
                <Link to="/settings" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[#a394a8] hover:bg-white/5 hover:text-white">
                  <Settings size={16} strokeWidth={2.25} />
                  <span className="text-[15px] font-semibold">Settings</span>
                </Link>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[#a394a8] hover:bg-white/5 hover:text-white">
                  <LogOut size={16} strokeWidth={2.25} />
                  <span className="text-[15px] font-semibold">Logout</span>
                </button>
              </div>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar Navigation ── */}
      <div className="hidden md:block relative shrink-0 w-[5rem] z-50">
        <div
          className={`absolute left-0 top-0 bottom-0 bg-[#5A305A] transition-all duration-300 shadow-2xl flex flex-col overflow-hidden rounded-[1.5rem] ring-1 ring-white/[0.06] ${
            isSidebarOpen ? 'w-[17rem]' : 'w-[5rem]'
          }`}
          onMouseEnter={() => setIsSidebarOpen(true)}
          onMouseLeave={() => { setIsSidebarOpen(false); setExpandedTab(activeMainTab); }}
        >
          <div className={`flex items-center h-12 shrink-0 mt-2 transition-all duration-300 ${isSidebarOpen ? 'px-6 gap-3' : 'justify-center'}`}>
            <img src={shipmentIcon} alt="BeeHive" className="h-9 w-9 object-contain shrink-0 drop-shadow-sm" />
            <span className={`text-white font-bold text-lg tracking-wide whitespace-nowrap transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
              BeeHive
            </span>
          </div>

          <div className="flex-1 flex flex-col py-1 gap-0.5 px-2.5 overflow-y-auto no-scrollbar">
            {visibleTabs.map(t => {
              const isActive = activeMainTab === t.id;
              const Icon = t.icon;
              const text = t.label;
              return (
                <div key={t.id} className="flex flex-col" onMouseEnter={() => setExpandedTab(t.id)}>
                  <button
                    onClick={() => navigate(t.path)}
                    className={`flex items-center justify-between px-2.5 py-2.5 rounded-xl border transition-all ${
                      isActive
                        ? 'text-white bg-white/10 backdrop-blur-md border-white/20 shadow-lg shadow-[#5A305A]/10'
                        : 'text-[#a394a8] border-transparent hover:bg-white/5 hover:text-white'
                    }`}
                    title={!isSidebarOpen ? text : undefined}
                  >
                    <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'bg-white/15 text-white shadow-inner' : 'bg-white/5 text-[#a394a8]'
                      }`}>
                        <Icon size={16} strokeWidth={2.25} />
                      </span>
                      <span className={`text-[15px] font-semibold tracking-wide transition-opacity duration-300 ${
                        isSidebarOpen ? 'opacity-100' : 'opacity-0'
                      }`}>
                        {text}
                      </span>
                    </div>
                    {t.subTabs && isSidebarOpen && (
                      <span className="shrink-0 opacity-60 ml-2">
                        {expandedTab === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    )}
                  </button>

                  {/* Submenus, cuma tampil kalau section ini sedang di-expand manual */}
                  {expandedTab === t.id && t.subTabs && (
                    <div className={`flex flex-col pl-9 gap-1 mt-1 mb-2 transition-all duration-300 ${
                      isSidebarOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pointer-events-none'
                    }`}>
                      {t.subTabs.map(sub => {
                        const isSubActive = activeSubTabPath === sub.path;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            onClick={() => { setIsSidebarOpen(false); setExpandedTab(null); }}
                            className={`flex items-center gap-3 text-left text-[15px] font-semibold py-2.5 px-3 rounded-xl transition-all whitespace-nowrap ${
                              isSubActive
                                 ? 'bg-white text-[#5A305A] shadow-sm'
                                 : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${isSubActive ? 'bg-[#5A305A]' : 'bg-[#a394a8]'}`}></span>
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer -- dipin di bawah, tidak ikut scroll/kegencet oleh daftar menu di atas */}
          <div className="shrink-0 px-2.5 pb-3">
            <hr className="border-white/10 my-1 mx-1" />
            <Link
              to="/account"
              className={`flex items-center gap-3 px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap overflow-hidden ${
                location.pathname === '/account' ? 'text-white bg-white/10' : 'text-[#a394a8] hover:bg-white/5 hover:text-white'
              }`}
              title={!isSidebarOpen ? "My Account" : undefined}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5">
                <UserCircle size={16} strokeWidth={2.25} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}>
                My Account
              </span>
            </Link>
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap overflow-hidden text-[#a394a8] hover:bg-white/5 hover:text-white`}
              title={!isSidebarOpen ? "Settings" : undefined}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5">
                <Settings size={16} strokeWidth={2.25} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}>
                Settings
              </span>
            </Link>

            {/* Nama akun yang sedang login -- tepat di atas tombol Keluar */}
            <div
              className="flex items-center gap-3 px-2.5 py-1.5 rounded-xl whitespace-nowrap overflow-hidden text-[#a394a8]"
              title={!isSidebarOpen ? accountName : undefined}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/10 text-white text-xs font-bold">
                {accountInitial}
              </span>
              <span className={`text-[13px] font-semibold text-white/90 truncate transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}>
                {accountName}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-2.5 py-1.5 rounded-xl transition-all whitespace-nowrap overflow-hidden text-[#a394a8] hover:bg-white/5 hover:text-white w-full"
              title={!isSidebarOpen ? "Logout" : undefined}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5">
                <LogOut size={16} strokeWidth={2.25} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}>
                Logout
              </span>
            </button>
          </div>
        </div>
      </div>
      
      {/* ── Main Content Area ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex-1 min-w-0 h-full relative flex flex-col overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
