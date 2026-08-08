import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, Ship, ScrollText, Settings, ChevronUp, ChevronDown } from 'lucide-react';
import warunaLogo from '../assets/waruna-logo-white.png';

const MAIN_TABS = [
  {
    id: 'courier',
    label: 'Courier',
    icon: Plane,
    path: '/courier/audit',
    basePath: '/courier',
    subTabs: [
      { id: 'courier_audit', label: 'Audit', path: '/courier/audit' },
      { id: 'courier_rekapan', label: 'Rekapan Invoice', path: '/courier/rekapan' },
      { id: 'courier_validasi', label: 'Validasi', path: '/courier/validasi' },
      { id: 'courier_upload', label: 'Upload', path: '/courier/upload' },
    ]
  },
  {
    id: 'sea_air',
    label: 'Sea & Air',
    icon: Ship,
    path: '/sea-air/audit',
    basePath: '/sea-air',
    subTabs: [
      { id: 'sea_air_audit',   label: 'Audit', path: '/sea-air/audit' },
      { id: 'sea_air_rekapan', label: 'Rekapan', path: '/sea-air/rekapan' },
      { id: 'sea_air_upload', label: 'Upload', path: '/sea-air/upload' },
    ]
  },
  {
    id: 'trail',
    label: 'Audit Trail',
    icon: ScrollText,
    path: '/audit-trail',
    basePath: '/audit-trail'
  },
];


export default function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine active main tab
  const activeMainTab = MAIN_TABS.find(t => location.pathname.startsWith(t.basePath))?.id || 'courier';
  const activeSubTabPath = location.pathname;

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gradient-to-br from-[#FFF0E2] to-[#FFC3A0] md:p-4 md:gap-4">
      
      {/* ── Mobile Top Navigation ── */}
      <div className="md:hidden flex flex-col shrink-0 bg-gradient-to-b from-[#3D2C44] to-[#2B1E30] text-white z-50 shadow-md rounded-b-[1.5rem]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
           <div className="flex items-center gap-2.5">
             <img src={warunaLogo} alt="Waruna" className="h-7 w-7 object-contain shrink-0" />
             <div className="font-bold text-xl tracking-wide">WARUNA HO</div>
           </div>
           <div className="flex gap-2">
             <Link to="/settings" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-[#a394a8] hover:bg-white/10 hover:text-white transition-colors">
               <Settings size={18} />
             </Link>
           </div>
        </div>

        <div className="flex overflow-x-auto hide-scrollbar px-3 py-3 gap-2">
          {MAIN_TABS.map(t => {
            const isActive = activeMainTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => navigate(t.path)}
                className={`flex items-center whitespace-nowrap gap-2 px-4 py-2.5 rounded-xl transition-all ${
                  isActive ? 'bg-white text-[#3D2C44] shadow-sm' : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} strokeWidth={2.25} />
                <span className="text-[15px] font-bold">{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Subtabs horizontal list if they exist */}
        {MAIN_TABS.find(t => t.id === activeMainTab)?.subTabs && (
          <div className="flex overflow-x-auto hide-scrollbar px-3 pb-3 gap-2">
            {MAIN_TABS.find(t => t.id === activeMainTab)?.subTabs?.map(sub => {
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
          className={`absolute left-0 top-0 bottom-0 bg-gradient-to-b from-[#3D2C44] to-[#2B1E30] transition-all duration-300 shadow-2xl flex flex-col overflow-hidden rounded-[1.5rem] ring-1 ring-white/[0.06] ${
            isSidebarOpen ? 'w-[17rem]' : 'w-[5rem]'
          }`}
          onMouseEnter={() => setIsSidebarOpen(true)}
          onMouseLeave={() => setIsSidebarOpen(false)}
        >
          <div className={`flex items-center h-20 shrink-0 mt-4 transition-all duration-300 ${isSidebarOpen ? 'px-6 gap-3' : 'justify-center'}`}>
            <img src={warunaLogo} alt="Waruna" className="h-9 w-9 object-contain shrink-0 drop-shadow-sm" />
            <span className={`text-white font-bold text-lg tracking-wide whitespace-nowrap transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 hidden'}`}>
              WARUNA HO
            </span>
          </div>

          <div className="flex-1 flex flex-col py-4 gap-0.5 px-2.5 overflow-y-auto mt-2 hide-scrollbar">
            {MAIN_TABS.map(t => {
              const isActive = activeMainTab === t.id;
              const Icon = t.icon;
              const text = t.label;
              return (
                <div key={t.id} className="flex flex-col">
                  <button
                    onClick={() => navigate(t.path)}
                    className={`flex items-center justify-between px-2.5 py-2.5 rounded-xl border transition-all ${
                      isActive
                        ? 'text-white bg-white/10 backdrop-blur-md border-white/20 shadow-lg shadow-black/10'
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
                        {isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    )}
                  </button>
                  
                  {/* Submenus if active */}
                  {isActive && t.subTabs && (
                    <div className={`flex flex-col pl-9 gap-1 mt-1 mb-2 transition-all duration-300 ${
                      isSidebarOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pointer-events-none'
                    }`}>
                      {t.subTabs.map(sub => {
                        const isSubActive = activeSubTabPath === sub.path;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            onClick={() => setIsSidebarOpen(false)}
                            className={`flex items-center gap-3 text-left text-[15px] font-semibold py-2.5 px-3 rounded-xl transition-all whitespace-nowrap ${
                              isSubActive 
                                 ? 'bg-white text-[#3D2C44] shadow-sm' 
                                 : 'text-[#a394a8] hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${isSubActive ? 'bg-[#3D2C44]' : 'bg-[#a394a8]'}`}></span>
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            <hr className="border-white/10 my-4 mx-3" />
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all whitespace-nowrap overflow-hidden text-[#a394a8] hover:bg-white/5 hover:text-white`}
              title={!isSidebarOpen ? "Pengaturan" : undefined}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5">
                <Settings size={16} strokeWidth={2.25} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-opacity duration-300 ${
                isSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}>
                Pengaturan
              </span>
            </Link>
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
