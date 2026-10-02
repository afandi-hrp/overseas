// Master vendor Sea & Air (PPJK) — /settings/seaair-vendors, page_key `settings_seaair_vendors` (2026-10-01).
// Tabel `seaair_vendor_master` (sql/035): kode seperti di rekapan_seaair.emkl_vendor -> nama legal lengkap + TOP.
// Isi halaman = komponen generik VendorMasterPage (2026-10-02, tampilan & perilaku tidak berubah).
import VendorMasterPage from './VendorMasterPage'
import { DEFAULT_SEAAIR_TOP_DAYS } from '../utils/FinanceHandoverHelpers'

export default function SeaAirVendorMasterPage() {
  return (
    <VendorMasterPage config={{
      table: 'seaair_vendor_master',
      pageKey: 'settings_seaair_vendors',
      title: 'Sea & Air Vendors',
      subtitle: 'PPJK full legal name and payment term (TOP) used by Finance Handover',
      codePlaceholder: 'AKSI',
      namePlaceholder: 'PT. ANEKA KREASI SELARAS INDONESIA',
      defaultTopDays: DEFAULT_SEAAIR_TOP_DAYS,
      sqlHint: 'sql/035',
    }} />
  )
}
