import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AdminLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();

  const menu = [
    { name: 'Dashboard', path: '/dashboard', icon: '🏠' },
    { name: 'Rate Tables', path: '/admin/rates', icon: '📊' },
    { name: 'Fuel Surcharge', path: '/settings/fuel-surcharge', icon: '⛽' },
    // { name: 'Zone Mapping', path: '/admin/zones', icon: '🗺️' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-navy-900 border-r border-navy-800 text-white flex flex-col items-stretch sticky top-0 h-screen">
        <div className="p-5 border-b border-navy-800">
          <h2 className="font-bold text-lg">Admin Panel</h2>
        </div>
        <nav className="flex-1 py-4">
          <ul>
            {menu.map(m => {
              const active = location.pathname.startsWith(m.path);
              return (
                <li key={m.path}>
                  <Link
                    to={m.path}
                    className={`flex items-center px-5 py-3 text-sm font-medium transition-colors ${
                      active ? 'bg-[#5A305A] text-white' : 'text-[#5A305A] hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <span className="mr-3">{m.icon}</span>
                    {m.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 max-w-full overflow-hidden">
        {children || <Outlet />}
      </main>
    </div>
  )
}
