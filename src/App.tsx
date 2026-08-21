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
import { AuthProvider, useAuth } from './lib/AuthContext';

// New Pages
import CourierAuditPage from './pages/courier/CourierAuditPage';
import CourierRekapanPage from './pages/courier/CourierRekapanPage';
import CourierValidasiPage from './pages/courier/CourierValidasiPage';
import SeaAirAuditPage from './pages/sea-air/SeaAirAuditPage';
import SeaAirRekapanPage from './pages/sea-air/SeaAirRekapanPage';
import AuditTrailPage from './pages/audit-trail/AuditTrailPage';
import FarOverseasAirPage from './pages/FarOverseasAirPage';
import BunkerPage from './pages/BunkerPage';

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Main Application with Sidebar */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/courier/upload" replace />} />
              <Route path="/dashboard" element={<Navigate to="/courier/audit" replace />} />
              <Route path="/courier/upload" element={<UploadPage fixedType="courier" />} />
              <Route path="/courier/audit" element={<CourierAuditPage />} />
              <Route path="/courier/rekapan" element={<CourierRekapanPage />} />
              <Route path="/courier/validasi" element={<CourierValidasiPage />} />

              <Route path="/sea-air/upload" element={<UploadPage fixedType="sea_air" />} />
              <Route path="/sea-air/audit" element={<SeaAirAuditPage />} />
              <Route path="/sea-air/rekapan" element={<SeaAirRekapanPage />} />

              <Route path="/direct-loading" element={<FarOverseasAirPage />} />
              <Route path="/direct-loading/:id" element={<FarOverseasAirPage />} />

              <Route path="/bunker" element={<BunkerPage />} />

              <Route path="/audit-trail" element={<AuditTrailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Admin Routes with nested or wrapped layout */}
            <Route path="/admin/rates" element={<RateTablesAdmin />} />

            {/* Route to Fuel Surcharge page */}
            <Route path="/account" element={<AccountPage />} />
            <Route path="/settings/fuel-surcharge" element={<FuelSurchargePage />} />
            <Route path="/settings/kurs-bi" element={<KursBIPage />} />
            <Route path="/settings/kurs-rule-vendor" element={<KursRuleVendorPage />} />
            <Route path="/settings/tarif-kontrak" element={<TarifKontrakPage />} />
            <Route path="/settings/tarif-far-overseas-vendor" element={<FarOverseasVendorTarifPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}