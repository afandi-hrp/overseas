// Master vendor Courier (PPJK) — /settings/courier-vendors, page_key `settings_courier_vendors` (2026-10-02).
// Tabel `courier_vendor_master` (sql/037): kode = PPJK rekapan_courier tanpa "OWN " (DHL, FEDEX, EMS, UPS, ...)
// -> nama legal lengkap + TOP (hari) utk Finance Handover Courier (per invoice).
import VendorMasterPage from './VendorMasterPage'
import { DEFAULT_COURIER_TOP_DAYS } from '../utils/FinanceHandoverHelpers'

export default function CourierVendorMasterPage() {
  return (
    <VendorMasterPage config={{
      table: 'courier_vendor_master',
      pageKey: 'settings_courier_vendors',
      title: 'Courier Vendors',
      subtitle: 'Courier PPJK full legal name and payment term (TOP) used by Finance Handover',
      codePlaceholder: 'DHL',
      namePlaceholder: 'PT. BIROTIKA SEMESTA (DHL EXPRESS)',
      defaultTopDays: DEFAULT_COURIER_TOP_DAYS,
      sqlHint: 'sql/037',
    }} />
  )
}
