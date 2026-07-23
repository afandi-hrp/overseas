/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import SettingsPage from './pages/SettingsPage';
import FuelSurchargePage from './pages/FuelSurchargePage';
import KursBIPage from './pages/KursBIPage';
import KursRuleVendorPage from './pages/KursRuleVendorPage';
import TarifKontrakPage from './pages/TarifKontrakPage';
import RateTablesAdmin from './pages/RateTablesAdmin';
import MainLayout from './components/MainLayout';
import AdminLayout from './components/AdminLayout';

// New Pages
import CourierAuditPage from './pages/courier/CourierAuditPage';
import CourierRekapanPage from './pages/courier/CourierRekapanPage';
import CourierValidasiPage from './pages/courier/CourierValidasiPage';
import SeaAirAuditPage from './pages/sea-air/SeaAirAuditPage';
import SeaAirRekapanPage from './pages/sea-air/SeaAirRekapanPage';
import AuditTrailPage from './pages/audit-trail/AuditTrailPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* Main Application with Sidebar */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<Navigate to="/courier/audit" replace />} />
          <Route path="/courier/audit" element={<CourierAuditPage />} />
          <Route path="/courier/rekapan" element={<CourierRekapanPage />} />
          <Route path="/courier/validasi" element={<CourierValidasiPage />} />
          
          <Route path="/sea-air/audit" element={<SeaAirAuditPage />} />
          <Route path="/sea-air/rekapan" element={<SeaAirRekapanPage />} />
          
          <Route path="/audit-trail" element={<AuditTrailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        
        {/* Admin Routes with nested or wrapped layout */}
        <Route path="/admin/rates" element={<RateTablesAdmin />} />
        
        {/* Route to Fuel Surcharge page */}
        <Route path="/settings/fuel-surcharge" element={<FuelSurchargePage />} />
        <Route path="/settings/kurs-bi" element={<KursBIPage />} />
        <Route path="/settings/kurs-rule-vendor" element={<KursRuleVendorPage />} />
        <Route path="/settings/tarif-kontrak" element={<TarifKontrakPage />} />
      </Routes>
    </BrowserRouter>
  );
}
