// Satu sumber kebenaran untuk daftar halaman yang bisa dibatasi lewat role -- dipakai oleh
// route guard (RequirePageAccess), sidebar (MainLayout), SettingsPage, dan halaman admin
// Kelola Role & Akses (RoleManagementPage). Kalau ada halaman baru ditambahkan ke app, daftarkan
// juga di sini supaya PIC bisa atur akses per-role-nya.
//
// TIDAK termasuk di sini (selalu bisa diakses siapa pun yang sudah login, tidak dibatasi role):
// /login (belum login), /account (halaman profil diri sendiri), /settings (hub -- nyaring
// sendiri kartu mana yang tampil berdasar page_key masing-masing).

export type PageEntry = {
  key: string;
  label: string;
  // path kosong = bukan halaman/route tersendiri, cuma "fitur" (tombol aksi modal) di dalam
  // halaman lain -- lihat courier_cost_validation dkk di bawah. Tidak ikut route guard
  // (RequirePageAccess), cuma dipakai SharedDataTable.tsx utk sembunyikan/tampilkan tombol.
  path?: string;
  group: 'Courier' | 'Sea & Air' | 'FAR Overseas' | 'Bunker' | 'Audit AP Local' | 'Audit AP Overseas' | 'PI Local' | 'General' | 'Settings';
  // Daftar "jabatan approval" yang berlaku KHUSUS utk halaman ini (opsional -- cuma diisi utk
  // halaman yang punya alur approval berjenjang, mis. Direct Loading/FAR Overseas Air:
  // Exim -> PIC -> SPV -> Direktur). Kosongkan/hilangkan field ini utk halaman yang belum py
  // approval berjenjang. Vocab tier BEBAS beda-beda per halaman (tidak perlu sama dgn halaman
  // lain) -- disimpan per user PER HALAMAN di tabel `user_approval_tiers` (user_id, page_key,
  // tier), SATU sumber kebenaran daftar tier & label-nya ada di sini supaya dropdown "Jabatan
  // Approval" di RoleManagementPage.tsx otomatis nambah kolom baru begitu suatu halaman dikasih
  // `approvalTiers` -- TIDAK perlu ubah RoleManagementPage.tsx tiap ada modul approval baru,
  // cukup daftarkan tier-nya di sini. Urutan array = urutan rantai approval (dari awal ke akhir).
  approvalTiers?: { value: string; label: string }[];
};

export const PAGE_REGISTRY: PageEntry[] = [
  { key: 'courier_upload', label: 'Upload (Courier)', path: '/courier/upload', group: 'Courier' },
  { key: 'courier_audit', label: 'Audit (Courier)', path: '/courier/audit', group: 'Courier' },
  { key: 'courier_rekapan', label: 'Rekapan Invoice (Courier)', path: '/courier/rekapan', group: 'Courier' },
  { key: 'courier_validasi', label: 'Validasi (Courier)', path: '/courier/validasi', group: 'Courier' },
  // Tombol aksi di dalam Audit (Courier) -- bukan halaman/route tersendiri (lihat catatan path
  // di PageEntry di atas), jadi kalau di-uncheck di matrix role, tombolnya hilang dari dropdown
  // "Aksi" tapi halaman Audit (Courier) itu sendiri tetap bisa diakses seperti biasa.
  { key: 'courier_cost_validation', label: 'Cost Validation (Courier)', group: 'Courier' },
  { key: 'courier_dokumen_validation', label: 'Dokumen Validation (Courier)', group: 'Courier' },
  { key: 'courier_checklist_dokumen', label: 'Checklist Dokumen (Courier)', group: 'Courier' },

  { key: 'sea_air_upload', label: 'Upload (Sea & Air)', path: '/sea-air/upload', group: 'Sea & Air' },
  { key: 'sea_air_audit', label: 'Audit (Sea & Air)', path: '/sea-air/audit', group: 'Sea & Air' },
  { key: 'sea_air_rekapan', label: 'Rekapan (Sea & Air)', path: '/sea-air/rekapan', group: 'Sea & Air' },
  // Tombol aksi di dalam Rekapan (Sea & Air) -- sama seperti Courier di atas, bukan route sendiri.
  { key: 'sea_air_cost_validation', label: 'Cost Validation (Sea & Air)', group: 'Sea & Air' },
  { key: 'sea_air_dokumen_validation', label: 'Dokumen Validation (Sea & Air)', group: 'Sea & Air' },
  { key: 'sea_air_checklist_validation', label: 'Checklist Validation (Sea & Air)', group: 'Sea & Air' },

  {
    key: 'direct_loading', label: 'FAR Overseas', path: '/direct-loading', group: 'FAR Overseas',
    approvalTiers: [
      { value: 'TIER1', label: 'Prepared By (Exim)' },
      { value: 'PIC', label: 'PIC' },
      { value: 'TIER2', label: 'SPV' },
      { value: 'TIER3', label: 'Director' },
    ],
  },

  { key: 'bunker', label: 'Bunker', path: '/bunker', group: 'Bunker' },

  { key: 'audit_po', label: 'Audit AP Local', path: '/audit-po', group: 'Audit AP Local' },

  { key: 'audit_po_overseas', label: 'Audit AP Overseas', path: '/audit-po-overseas', group: 'Audit AP Overseas' },

  { key: 'pi_local', label: 'PI Local', path: '/pi-local', group: 'PI Local' },

  { key: 'audit_trail', label: 'Audit Trail', path: '/audit-trail', group: 'General' },

  { key: 'admin_rates', label: 'Rate Tables & PPJK', path: '/admin/rates', group: 'Settings' },
  { key: 'settings_fuel_surcharge', label: 'Fuel Surcharge', path: '/settings/fuel-surcharge', group: 'Settings' },
  { key: 'settings_kurs_bi', label: 'Kurs BI Harian', path: '/settings/kurs-bi', group: 'Settings' },
  { key: 'settings_kurs_rule_vendor', label: 'Aturan Kurs Vendor', path: '/settings/kurs-rule-vendor', group: 'Settings' },
  { key: 'settings_tarif_kontrak', label: 'Tarif Kontrak Vendor', path: '/settings/tarif-kontrak', group: 'Settings' },
  { key: 'settings_tarif_far_overseas_vendor', label: 'Tarif Vendor FAR Overseas Air', path: '/settings/tarif-far-overseas-vendor', group: 'Settings' },
  // settings_roles sengaja TIDAK dipakai route guard-nya (RoleManagementPage di-gate langsung
  // via isAdmin, bukan lewat matrix page_key ini) -- tapi tetap didaftarkan di sini supaya
  // tetap tampil & konsisten di matrix Kelola Role & Akses utk keperluan dokumentasi/display.
  { key: 'settings_roles', label: 'Kelola Role & Akses', path: '/settings/roles', group: 'Settings' },
];

export const PAGE_GROUPS: PageEntry['group'][] = ['Courier', 'Sea & Air', 'FAR Overseas', 'Bunker', 'Audit AP Local', 'Audit AP Overseas', 'PI Local', 'General', 'Settings'];

export function pageLabel(key: string): string {
  return PAGE_REGISTRY.find(p => p.key === key)?.label || key;
}

// Halaman-halaman yang punya alur approval berjenjang (py `approvalTiers` terisi) -- dipakai
// RoleManagementPage.tsx utk merender 1 dropdown "Jabatan Approval" per halaman per user, dan
// FarOverseasAirDetailModal.tsx (& modul approval lain di masa depan) utk validasi tier yang
// valid utk halamannya masing-masing.
export const APPROVAL_TIER_PAGES: PageEntry[] = PAGE_REGISTRY.filter(p => !!p.approvalTiers?.length);

// Halaman tujuan default setelah login / buka "/" atau "/dashboard" -- prioritas mengikuti
// urutan PAGE_REGISTRY (Courier duluan, dst). Kalau user belum punya akses ke halaman manapun
// (baru dibuat, belum di-assign role oleh PIC), arahkan ke /account -- bukan halaman kosong
// atau nyangkut di layar "tidak ada akses".
export function getDefaultLandingPath(allowedPageKeys: Set<string>, isAdmin: boolean): string {
  const routedPages = PAGE_REGISTRY.filter(p => !!p.path);
  if (isAdmin) return routedPages[0].path!;
  const firstAllowed = routedPages.find(p => allowedPageKeys.has(p.key));
  return firstAllowed ? firstAllowed.path! : '/account';
}
