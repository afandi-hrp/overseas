import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, Ship, ScrollText, Settings, ChevronUp, ChevronDown, LogOut, UserCircle, FileCheck2, GitCompare } from 'lucide-react';
import shipmentIcon from '../assets/beehive-icon.png';
import { useAuth } from '../lib/AuthContext';

const MAIN_TABS = [
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
      { id: 'sea_air_rekapan', label: 'Recap', path: '/sea-air/rekapan', pageKey: 'sea_air_rekapan' },
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
        const visibleSub = isAdmin ? t.subTabs : t.subTabs.filter(s => allowedPageKeys.has(s.pageKey));
        return visibleSub.length > 0 ? { ...t, subTabs: visibleSub } : null;
      }
      const allowed = isAdmin || (t.pageKey ? allowedPageKeys.has(t.pageKey) : false);
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

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gradient-to-br from-[#FFF5C5] to-[#F58C77] md:p-4 md:gap-4">
      
      {/* ── Mobile Top Navigation ── */}
      <div className="md:hidden flex flex-col shrink-0 bg-[#5A305A] text-white z-50 shadow-md rounded-b-[1.5rem]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
           <div className="flex items-center gap-2.5">
             <img src={shipmentIcon} alt="BeeHive" className="h-7 w-7 object-contain shrink-0" />
             <div className="font-bold text-xl tracking-wide">BeeHive</div>
           </div>
           <div className="flex gap-2">
             <Link to="/account" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-[#a394a8] hover:bg-white/10 hover:text-white transition-colors">
               <UserCircle size={18} />
             </Link>
             <Link to="/settings" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-[#a394a8] hover:bg-white/10 hover:text-white transition-colors">
               <Settings size={18} />
             </Link>
             <button onClick={handleLogout} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-[#a394a8] hover:bg-white/10 hover:text-white transition-colors">
               <LogOut size={18} />
             </button>
           </div>
        </div>

        <div className="flex overflow-x-auto no-scrollbar px-3 py-3 gap-2">
          {visibleTabs.map(t => {
            const isActive = activeMainTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => navigate(t.path)}
                className={`flex items-center whitespace-nowrap gap-2 px-4 py-2.5 rounded-xl transition-all ${
                  isActive ? 'bg-white text-[#5A305A] shadow-sm' : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} strokeWidth={2.25} />
                <span className="text-[15px] font-bold">{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Subtabs horizontal list if they exist */}
        {visibleTabs.find(t => t.id === activeMainTab)?.subTabs && (
          <div className="flex overflow-x-auto no-scrollbar px-3 pb-3 gap-2">
            {visibleTabs.find(t => t.id === activeMainTab)?.subTabs?.map(sub => {
              const isSubActive = activeSubTabPath === sub.path;
              return (
                <Link
                  key={sub.id}
                  to={sub.path}
                  className={`text-[13px] font-bold whitespace-nowrap px-4 py-2 rounded-lg transition-all border ${
                    isSubActive
                      ? 'bg-[#5B4266] text-white border-transparent shadow-inner'
                      : 'border-white/10 text-[#a394a8] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {sub.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

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
