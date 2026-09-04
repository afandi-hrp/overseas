/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import SettingsPage from './pages/SettingsPage';
import AccountPage from './pages/AccountPage';
import FuelSurchargePage from './pages/FuelSurchargePage';
import KursBIPage from './pages/KursBIPage';
import KursRuleVendorPage from './pages/KursRuleVendorPage';
import TarifKontrakPage from './pages/TarifKontrakPage';
import FarOverseasVendorTarifPage from './pages/FarOverseasVendorTarifPage';
import RateTablesAdmin from './pages/RateTablesAdmin';
import MainLayout from './components/MainLayout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import RoleManagementPage from './pages/RoleManagementPage';
import RequirePageAccess from './components/RequirePageAccess';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { getDefaultLandingPath } from './lib/permissions';

// New Pages
import CourierAuditPage from './pages/courier/CourierAuditPage';
import CourierRekapanPage from './pages/courier/CourierRekapanPage';
import CourierValidasiPage from './pages/courier/CourierValidasiPage';
import SeaAirAuditPage from './pages/sea-air/SeaAirAuditPage';
import SeaAirRekapanPage from './pages/sea-air/SeaAirRekapanPage';
import AuditTrailPage from './pages/audit-trail/AuditTrailPage';
import FarOverseasAirPage from './pages/FarOverseasAirPage';
import BunkerPage from './pages/BunkerPage';
import AuditPoPage from './pages/AuditPoPage';
import AuditPoOverseasPage from './pages/AuditPoOverseasPage';
import PiLocalPage from './pages/PiLocalPage';

function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#FFF5C5] to-[#F58C77]">
        <div className="w-8 h-8 border-4 border-[#5A305A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

// "/" dan "/dashboard" dulu redirect hardcode ke halaman Courier -- sekarang app dipakai lintas
// divisi (role menentukan halaman apa yang boleh diakses tiap user), jadi tujuannya dihitung
// dinamis dari akses user yang sedang login, bukan hardcode.
function DefaultLandingRedirect() {
  const { allowedPageKeys, isAdmin } = useAuth();
  return <Navigate to={getDefaultLandingPath(allowedPageKeys, isAdmin)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Main Application with Sidebar */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<DefaultLandingRedirect />} />
              <Route path="/dashboard" element={<DefaultLandingRedirect />} />
              <Route path="/courier/upload" element={<RequirePageAccess pageKey="courier_upload"><UploadPage fixedType="courier" /></RequirePageAccess>} />
              <Route path="/courier/audit" element={<RequirePageAccess pageKey="courier_audit"><CourierAuditPage /></RequirePageAccess>} />
              <Route path="/courier/rekapan" element={<RequirePageAccess pageKey="courier_rekapan"><CourierRekapanPage /></RequirePageAccess>} />
              <Route path="/courier/validasi" element={<RequirePageAccess pageKey="courier_validasi"><CourierValidasiPage /></RequirePageAccess>} />

              <Route path="/sea-air/upload" element={<RequirePageAccess pageKey="sea_air_upload"><UploadPage fixedType="sea_air" /></RequirePageAccess>} />
              <Route path="/sea-air/audit" element={<RequirePageAccess pageKey="sea_air_audit"><SeaAirAuditPage /></RequirePageAccess>} />
              <Route path="/sea-air/rekapan" element={<RequirePageAccess pageKey="sea_air_rekapan"><SeaAirRekapanPage /></RequirePageAccess>} />

              <Route path="/direct-loading" element={<RequirePageAccess pageKey="direct_loading"><FarOverseasAirPage /></RequirePageAccess>} />
              <Route path="/direct-loading/:id" element={<RequirePageAccess pageKey="direct_loading"><FarOverseasAirPage /></RequirePageAccess>} />

              <Route path="/bunker" element={<RequirePageAccess pageKey="bunker"><BunkerPage /></RequirePageAccess>} />

              <Route path="/audit-po" element={<RequirePageAccess pageKey="audit_po"><AuditPoPage /></RequirePageAccess>} />
              <Route path="/audit-po-overseas" element={<RequirePageAccess pageKey="audit_po_overseas"><AuditPoOverseasPage /></RequirePageAccess>} />
              <Route path="/pi-local" element={<RequirePageAccess pageKey="pi_local"><PiLocalPage /></RequirePageAccess>} />

              <Route path="/audit-trail" element={<RequirePageAccess pageKey="audit_trail"><AuditTrailPage /></RequirePageAccess>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/roles" element={<RequirePageAccess adminOnly><RoleManagementPage /></RequirePageAccess>} />
              <Route path="/account" element={<AccountPage />} />

              {/* Halaman-halaman modul Pengaturan -- sebelumnya dirender DI LUAR MainLayout jadi
                  sidebar navigasi tidak muncul sama sekali (gap arsitektur lama, pola sama
                  seperti bug /account yang sudah diperbaiki sebelumnya). Dipindah ke dalam sini
                  supaya sidebar tetap tampil di semua halaman Pengaturan. */}
              <Route path="/admin/rates" element={<RequirePageAccess pageKey="admin_rates"><RateTablesAdmin /></RequirePageAccess>} />
              <Route path="/settings/fuel-surcharge" element={<RequirePageAccess pageKey="settings_fuel_surcharge"><FuelSurchargePage /></RequirePageAccess>} />
              <Route path="/settings/kurs-bi" element={<RequirePageAccess pageKey="settings_kurs_bi"><KursBIPage /></RequirePageAccess>} />
              <Route path="/settings/kurs-rule-vendor" element={<RequirePageAccess pageKey="settings_kurs_rule_vendor"><KursRuleVendorPage /></RequirePageAccess>} />
              <Route path="/settings/tarif-kontrak" element={<RequirePageAccess pageKey="settings_tarif_kontrak"><TarifKontrakPage /></RequirePageAccess>} />
              <Route path="/settings/tarif-far-overseas-vendor" element={<RequirePageAccess pageKey="settings_tarif_far_overseas_vendor"><FarOverseasVendorTarifPage /></RequirePageAccess>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}