# Shipment App — Panduan untuk Claude

Aplikasi internal Waruna Group untuk otomasi & audit dokumen shipment (Courier DHL/FedEx, Sea &
Air, Direct Loading/FAR Overseas Air, Bunker). AI (n8n + Gemini) membaca dokumen upload lalu
mengisi tabel Supabase; aplikasi ini adalah panel untuk audit, koreksi manual, validasi cost, dan
approval-nya.

## Tech stack

- React 19 + TypeScript + Vite, Tailwind CSS v4 (utility class langsung, tidak ada file
  komponen CSS terpisah).
- Routing: `react-router-dom` v7.
- Backend data: Supabase (Postgres + RLS + RPC functions), client di `src/lib/supabase.ts`.
- Auth & profil user: `src/lib/AuthContext.tsx` (`useAuth()` — expose `user`, `profile`,
  `allowedPageKeys`, `isAdmin`, `signOut`, `refreshProfile`).
- Ikon: `lucide-react`. Server kecil (`server.ts`, Express) hanya untuk proxy — bukan backend
  data utama: upload ke n8n (`/api/n8n-proxy-start`), dan proxy preview file Google Drive
  (`/api/drive-file-proxy?id=<drive_file_id>`, dipakai `PreviewModal` di `AuditPoPage.tsx`/
  `AuditPoOverseasPage.tsx`, lihat bagian "Audit AP Local" untuk detailnya). **`tsx` (dipakai
  `npm run dev`) TIDAK hot-reload perubahan kode `server.ts`** — beda dari Vite HMR utk frontend,
  tiap ubah `server.ts` WAJIB restart dev server manual, kalau tidak endpoint baru/berubah tidak
  akan kepakai (gejalanya membingungkan: request ke endpoint itu jatuh ke SPA fallback & balikin
  `index.html` biasa, bukan 404 tegas).
- Verifikasi standar setelah edit: `npx tsc --noEmit` (harus bersih, tidak ada error).
- **Browser tab title = "BeeHive"** (2026-09, distandarkan — sebelumnya CAMPUR ANTARA 3 brand
  berbeda: `index.html` default "Shipment", sebagian halaman set `document.title = '... ·
  Shipment'` via `useEffect`, TAPI `UploadPage.tsx` & dashboard `SharedDataTable.tsx` malah pakai
  sisa brand lama "IMI Import System" — semua DISERAGAMKAN ke suffix `· BeeHive`, sesuai nama
  yang sudah dipakai di logo sidebar `MainLayout.tsx`). `index.html` `<title>` (dipakai halaman
  yg TIDAK override `document.title`, mis. `/login`) juga diganti dari "Shipment" → "BeeHive".
  Kalau nambah halaman baru yang set `document.title` sendiri, ikuti pola `'<Judul Halaman> ·
  BeeHive'`, JANGAN pakai "Shipment"/"IMI Import System" lagi.

## Struktur routing & halaman (`src/App.tsx`)

Semua route (kecuali `/login`) dibungkus `<ProtectedRoute>` → `<MainLayout>` (sidebar) →
`<RequirePageAccess pageKey="...">` (lihat RBAC di bawah).

| Route | Komponen | Catatan |
|---|---|---|
| `/courier/upload`, `/sea-air/upload` | `UploadPage` (`fixedType`) | form upload dokumen ke n8n |
| `/courier/audit` | `CourierAuditPage` → `SharedDataTable` | |
| `/courier/rekapan` | `CourierRekapanPage` → `SharedDataTable` | |
| `/courier/validasi` | `CourierValidasiPage` | halaman mandiri, bukan `SharedDataTable` |
| `/sea-air/audit`, `/sea-air/rekapan` | → `SharedDataTable` | |
| `/direct-loading`, `/direct-loading/:id` | `FarOverseasAirPage` | modul "FAR Overseas" di sidebar |
| `/bunker` | `BunkerPage` | |
| `/audit-po` | `AuditPoPage` | read-only, label menu "Audit AP Local", lihat bagian "Audit AP Local" di bawah |
| `/audit-po-overseas` | `AuditPoOverseasPage` | label menu "Audit AP Overseas", DUPLIKASI PERSIS `AuditPoPage` tabel `audit_po_apovs_comp`, lihat bagian "Audit AP Overseas" di bawah |
| `/audit-trail` | `AuditTrailPage` → `SharedDataTable` (tab `trail`) | |
| `/settings` | `SettingsPage` | hub: webhook config + kartu-kartu modul admin |
| `/settings/roles` | `RoleManagementPage` | admin-only |
| `/account` | `AccountPage` | |
| `/admin/rates` | `RateTablesAdmin` | tab-tab: RateSheetDHL/FedEx, SurchargeDHL/FedEx,
  ZoneMappingEditor, NPWPEditor, PPJKCostRule, SurchargeCIPLRule (di `src/pages/admin/`) |
| `/settings/fuel-surcharge` | `FuelSurchargePage` | |
| `/settings/kurs-bi` | `KursBIPage` | |
| `/settings/kurs-rule-vendor` | `KursRuleVendorPage` | |
| `/settings/tarif-kontrak` | `TarifKontrakPage` | |
| `/settings/tarif-far-overseas-vendor` | `FarOverseasVendorTarifPage` | |

**`SharedDataTable.tsx`** (`src/components/`, ~3800 baris) adalah komponen generik besar yang
menangani Courier Audit/Rekapan, Sea & Air Audit/Rekapan, dan Audit Trail — dipilih lewat prop
`defaultMainTab`/`defaultSubTab`. Hati-hati kalau edit — banyak logic bercabang berdasar
`activeMainTab`/`activeSubTab`.

- **`CourierRekapanRowGroup`** (~baris 1736): pasangan PO↔Vessel utk kolom NO PO/VESSEL yang
  bisa di-split banyak baris dibangun dari `rec.po_pt_imi`/`rec.vessel` (dipisah `+`/`,`).
  Pairing-nya jalan kalau SALAH SATU dari kedua field itu ada isinya (bukan cuma po_pt_imi) —
  dulu ada bug: kalau po_pt_imi kosong (baris ditambah manual tanpa PO tapi Vessel diisi), nilai
  vessel-nya hilang total dari tampilan tabel meski tetap tersimpan normal di `rec.vessel`
  (makanya masih muncul benar di form Edit inline & export Excel, yang baca `rec.vessel`
  langsung tanpa lewat pairing ini). SUDAH DIPERBAIKI (2026-09) — jangan reintroduce kondisi
  `if (typeof rec.po_pt_imi === 'string')` doang di awal blok ini.
- **Formatting display-only di `getCellData()`** (kolom tanpa `type`, ~baris 1293): kolom `ppjk`
  strip prefix `"OWN "` (mis. hasil extract Gemini "OWN DHL" → tampil "DHL" saja, konsisten
  dengan `ppjkTabs` filter yang sudah lebih dulu strip prefix ini) dan kolom `awb` strip prefix
  carrier `"DHL NO."`/`"FEDEX No."` (mis. "DHL NO. 1234567890" → tampil "1234567890" saja) —
  murni tampilan, DATA MENTAH DI SUPABASE TIDAK BERUBAH (masih ada prefix-nya). Kalau butuh raw
  value lagi (mis. utk search/filter), tetap pakai `rec.ppjk`/`rec.awb` asli, bukan hasil display
  ini.

## RBAC (role & akses per halaman)

Sudah diimplementasikan (lihat `sql/001_rbac_and_bunker_rls.sql`, `sql/002_direct_loading_rls.sql`):
- Tabel `roles`, `user_roles`, `role_page_access` — role "Admin" (`is_protected=true`) selalu
  akses penuh, di-hardcode di function `is_admin()`, tidak lewat `role_page_access`.
- `src/lib/permissions.ts` — `PAGE_REGISTRY` satu sumber kebenaran daftar `page_key` (dipakai
  sidebar, route guard, halaman Kelola Role & Akses). Tambah halaman baru → daftarkan di sini.
- `src/components/RequirePageAccess.tsx` — route guard, prop `pageKey` atau `adminOnly`.
- `AuthContext` panggil RPC `get_my_access()` sekali saat login → `{is_admin, page_keys}`.
- **Akses view-only vs edit (2026-09, SELESAI untuk semua halaman yang punya konsep edit)**:
  `role_page_access` punya kolom `can_edit boolean default true` (nambah 1 dimensi di atas akses
  lihat halaman yang sudah ada). Function `has_edit_access(p_page_key)` (pola sama
  `has_page_access`, syarat tambahan `can_edit=true`). RPC `get_my_access()` balikin juga
  `edit_page_keys` (subset dari `page_keys`). `AuthContext` expose `editPageKeys` (Set) + helper
  `canEdit(pageKey)`. UI matrix di `RoleManagementPage.tsx` — begitu suatu page_key dicentang utk 1
  role, muncul badge kecil `EDIT`/`VIEW` di sebelah checkbox-nya (klik utk toggle `can_edit`), lewat
  `toggleRoleCanEdit()`.
  **Keputusan desain (dikonfirmasi user 2026-09)**: granularitas TETAP per page_key terpisah, TIDAK
  digabung — halaman yang punya fitur tambahan dengan page_key sendiri di PAGE_REGISTRY (mis.
  Audit Courier punya Checklist/Doc Validation/Cost Validation) sengaja TIDAK ikut otomatis
  ter-cover oleh toggle Edit halaman utamanya; PIC atur satu-satu.
  **Cakupan final — 20 dari 23 page_key yang punya konsep "edit"** (dicek tuntas via query
  `pg_class.relrowsecurity`+`pg_policy`, SEMUA 32 tabel `policy_count=4`, SEMUA 15 RPC penulis
  data — 14 unik + 1 overload — punya guard `has_edit_access` & `SECURITY DEFINER`):
  `courier_audit`, `courier_rekapan`, `courier_validasi`, `courier_checklist_dokumen`,
  `courier_dokumen_validation`, `courier_cost_validation`, `sea_air_audit`, `sea_air_rekapan`,
  `sea_air_checklist_validation`, `sea_air_dokumen_validation`, `sea_air_cost_validation`,
  `bunker`, `direct_loading`, `audit_po`, `admin_rates`, `settings_fuel_surcharge`,
  `settings_kurs_bi`, `settings_kurs_rule_vendor`, `settings_tarif_kontrak`,
  `settings_tarif_far_overseas_vendor`. File/komponen terkait per modul: `SharedDataTable.tsx`
  (Courier+Sea&Air, termasuk `ChecklistModal`/`ValidasiModal`/`CostValidationModal`/
  `SeaAirChecklistModal`/`SeaAirValidasiModal`/`ValidasiShipmentInvoiceLengkap`),
  `BunkerPage.tsx`+modalnya, `FarOverseasAirPage.tsx`+modalnya, `AuditPoPage.tsx`,
  8 file `src/pages/admin/*`, `FuelSurchargePage.tsx`, `KursBIPage.tsx`,
  `KursRuleVendorPage.tsx`, `TarifKontrakPage.tsx`, `FarOverseasVendorTarifPage.tsx`.
  **3 page_key TIDAK ikut** (sengaja, bukan halaman "punya data yang bisa diedit" biasa):
  `courier_upload`+`sea_air_upload` (`UploadPage.tsx`) — tombol submit sudah di-gate `canEdit(...)`
  di UI, TAPI upload-nya lewat proxy Express (`/api/n8n-proxy-start`) ke n8n, BUKAN langsung ke
  Supabase, jadi TIDAK BISA diproteksi RLS — proteksinya cuma di level UI, bisa di-bypass kalau
  seseorang panggil endpoint proxy itu langsung; `audit_trail` — murni log baca-saja, tidak ada
  aksi edit; `settings_roles` — sudah admin-only lewat `isAdmin()`, bukan lewat matrix page_key.
  **Temuan penting (2026-09) soal RPC `SECURITY DEFINER`**: banyak RPC penulis data di app ini
  (`upsert_kurs_bi`, `update_seaair_row`, `insert_seaair_row`, `update_rekapan_far_overseas_manual`,
  `update_cost_validasi_far_overseas_manual`, `upsert_tarif_far_overseas_vendor`,
  `nonaktifkan_tarif_far_overseas_vendor`, `nonaktifkan_tarif_kontrak`, `upsert_kurs_rule_vendor`,
  `update_rekapan_po_vessel`, `update_validasi_matriks_manual`, `fn_delete_far_overseas_air`,
  `fn_delete_pib`, `fn_delete_cn`) adalah **`SECURITY DEFINER`** — jalan dengan hak akses pemilik
  function, BYPASS RLS tabel sepenuhnya. Kalau cuma split RLS tabel tanpa sadar ini, view-only
  tetap bisa nulis lewat RPC itu walau tombol UI-nya disembunyikan. FIX yang sudah diterapkan:
  tiap RPC itu ditambah `IF NOT public.has_edit_access('<page_key>') THEN RAISE EXCEPTION ...`
  di baris pertama body-nya (dikonfirmasi via `pg_get_functiondef(...) ilike '%has_edit_access%'`).
  **Kalau nanti nambah RPC baru yang menulis ke tabel ber-RLS, WAJIB cek dulu apakah
  `SECURITY DEFINER` — kalau ya, WAJIB tambah guard `has_edit_access` manual di dalamnya, RLS
  tabel saja TIDAK CUKUP.** RPC yang `SECURITY INVOKER` (mis. `fn_hitung_storage`,
  `fn_save_storage_estimate`, `fn_update_actual_value`, `fn_apply_credit_note`,
  `fn_recompute_totals`, `fn_revise_credit_note`, `fn_archive_pib`, `fn_archive_cn`) sudah otomatis
  ikut RLS tabel yang disentuhnya, tidak perlu guard tambahan. `get_kurs_efektif` sengaja TIDAK
  diberi guard — murni fungsi baca/hitung, tidak menulis apa pun.
  SQL migration-nya TIDAK disimpan sbg file di `sql/` (dijalankan user langsung lewat chat, sesuai
  preferensi) — kalau perlu reproduce, tulis ulang dari pola select/has_page_access +
  insert-update-delete/has_edit_access, lihat contoh lengkap di `sql/002_direct_loading_rls.sql`.
- **Status RLS 2 tabel yang DULU bolong total** (`audit_po_ap_comp`, `tabel_surcharge_rule`) —
  bisa diakses siapa saja termasuk tanpa login. Sudah DITUTUP (2026-09), sekarang bagian dari
  cakupan `admin_rates`/`audit_po` di atas (`policy_count=4`, dikonfirmasi).
  Catatan tersisa: `audit_po_ap_comp` diisi otomasi n8n tiap 30 menit — BELUM diverifikasi eksplisit
  apakah otomasi itu tetap jalan normal setelah RLS aktif (perlu proses itu pakai service role key).

## Translasi UI ke Bahasa Inggris (IN PROGRESS, dimulai 2026-09)

Atas permintaan user, SELURUH teks yang tampil ke user di aplikasi ini sedang ditranslasi dari
Bahasa Indonesia ke Bahasa Inggris, dikerjakan BERTAHAP per modul (bukan sekaligus) supaya tiap
tahap bisa diverifikasi `npx tsc --noEmit` + cek visual dulu sebelum lanjut. **Keputusan
cakupan yang sudah dikonfirmasi user**:
1. **Nilai status di database TIDAK diubah** (mis. `LENGKAP`/`PROSES`/`PENDING`/`REVISI`/
   `TIDAK LENGKAP`/`BELUM LENGKAP`/`PERLU REVIEW`/`ARCHIVED` di kolom `status` — ditulis oleh
   otomasi n8n, dibaca balik oleh logic frontend). `StatusBadge` (`SharedDataTable.tsx` ~baris
   112) SAAT INI merender nilai `status` mentah langsung tanpa lapisan mapping tampilan — kalau
   badge status mau ditranslasi ke Inggris juga nanti, WAJIB lewat lapisan mapping
   Indonesia→Inggris di level render SAJA, JANGAN pernah ubah nilai `status` yang dikirim ke
   Supabase (akan langsung tidak match dengan apa yang ditulis n8n).
2. **Istilah domain customs/logistik dibiarkan apa adanya**: PPJK, AWB, PIB, BM, DPP, SPTNP,
   NDPBM, CIPL, BPN, HS Code, dll — ini singkatan resmi dokumen kepabeanan Indonesia, tidak
   punya padanan baku dalam Bahasa Inggris yang dipakai industri. Hanya teks di SEKITAR
   istilah ini (label kolom seperti "Nomor"→"Number", "Tanggal"→"Date") yang ditranslasi.
3. Nama kolom/tabel database (mis. `nama_pt`, `jenis_dokumen`, `rekapan_seaair`) TIDAK diubah —
   itu identifier teknis, bukan teks tampilan; mengubahnya butuh migrasi skema + koordinasi
   ulang n8n, di luar cakupan task ini.

**TEMUAN PENTING (2026-09) — jangan asal translate string yang terlihat seperti label**: di
`src/utils/ValidasiHelper.ts` (dipakai `ValidasiModal.tsx`/`ValidasiPerhitunganPIB.tsx`/
`CourierValidasiPage.tsx`, sistem matrix Doc Validation Courier), field `field`/`rowLabel` di
tiap baris array `SECTIONS` BUKAN cuma teks tampilan — `computeStatus()` (baris ~253) melakukan
SUBSTRING MATCHING terhadap nilai `field` ini buat menentukan cara membandingkan 2 nilai (mis.
`fieldName.includes("DPP (")`, `.includes("Referensi (")`, `.includes("Cek Master NPWP")`,
`lowerField.includes("alamat")`/`"nama pt"`/`"nama npwp"`/`"npwp"`/`"harga"`/`"berat"`/`"awb"`/
`"invoice"`/`"value"`/`"total"`). `field`/`rowLabel` JUGA dipakai sebagai `groupKey` pengelompokan
baris di UI (`ValidasiModal.tsx` baris ~1418). Jadi string ini SEKALIGUS logic key & display
text — analog dengan peringatan "jangan ganti nama baris" dari user, tapi lebih dalam karena
nyambung ke keyword-matching di logic, bukan cuma dipakai sebagai object key lookup. **JANGAN
translate `field`/`rowLabel`/`compareDoc`/`label`/`srcLabel` di `SECTIONS` tanpa refactor
`computeStatus()` dulu supaya keyword-matching-nya tidak lagi bergantung ke teks Indonesia ini**
(mis. pindah ke matching berbasis `id` yang stabil). Modul Courier Validasi (SharedDataTable
`VALIDASI_COLS`/`COURIER_COLS` sendiri sudah aman ditranslate — sudah dilakukan; yang BELUM &
BERISIKO adalah isi `ValidasiModal.tsx`, `CostValidationModal.tsx`,
`ValidasiPerhitunganPIB.tsx`, `ValidasiHelper.ts`, `ValidasiPibHelper.ts`, `ValidasiFill.ts`,
dan bagian `CourierValidasiPage.tsx` yang merender label dari `SECTIONS`).

**Progress per modul** (update daftar ini tiap modul baru selesai ditranslasi):
- ✅ Sidebar/menu utama (`src/components/MainLayout.tsx`) — label submenu Courier/Sea & Air
  ("Rekapan Invoice"→"Invoice Recap", "Validasi"→"Validation", "Rekapan"→"Recap"), fallback
  nama akun ("Pengguna"→"User"), tombol/tooltip footer sidebar ("Akun Saya"→"My Account",
  "Pengaturan"→"Settings", "Keluar"→"Logout"). Label lain (Courier, Sea & Air, Audit, Upload,
  FAR Overseas, Bunker, Audit AP Local, Audit Trail) sudah Inggris dari awal, tidak disentuh.
- ✅ `src/components/Greeting.tsx` — sapaan waktu ("Selamat pagi/siang/sore/malam"→"Good
  morning/afternoon/evening/night"), format tanggal `toLocaleDateString` diganti locale
  `'id-ID'`→`'en-US'`.
- 🟡 Courier Upload — SELESAI. `src/pages/UploadPage.tsx` (dipakai bareng Sea & Air Upload lewat
  `fixedType`, jadi Sea & Air Upload OTOMATIS ikut selesai juga) + `src/components/
  ProcessingQueue.tsx` (dipakai kedua modul Upload) ditranslate penuh, termasuk toast/error
  message, step loading overlay, panduan dokumen wajib/opsional.
- 🟡 Courier Audit & Rekapan — SEBAGIAN BESAR selesai di `SharedDataTable.tsx` (dipakai bareng
  Sea & Air Audit/Rekapan, jadi banyak yang otomatis ikut kena juga): kolom `COURIER_COLS`/
  `PIB_COLS`/`CN_COLS`/`CHECKLIST_FIELDS`, `ChecklistModal`, `EditModal` (form Tambah/Edit +
  status select), `DeleteModal`, toolbar (search/filter/export/tambah data), tombol aksi inline
  per baris (Edit/Save/Cancel/Delete/Checklist), empty state & error state. Ditambah lapisan
  translasi tampilan `STATUS_LABELS`/`getStatusLabel()` (~baris 112) dipakai di badge status +
  select status — nilai DB tetap Indonesia, cuma tampilannya Inggris (lihat poin 1 di atas).
  Sentinel filter internal `'Semua'` diganti `'All'` di seluruh file (bukan nilai DB, aman).
  Susulan (2026-09, dari screenshot user): header kolom sticky "Aksi"→"Action", kolom sintetis
  `{ key: 'jenis_dokumen', label: 'Jenis' }` di tabel gabungan PIB+CN (tab Draft)→"Type", footer
  pagination "Menampilkan X-Y dari Z record"→"Showing X-Y of Z records".
  `SEA_AIR_AUDIT_COLS`/`SEA_AIR_REKAPAN_COLS` (kolom Sea & Air spesifik) ditranslate belakangan
  di modul Sea & Air, lihat poin di bawah.
- 🟡 Courier Validasi (`ValidasiModal.tsx`) — **HANYA UI chrome statis** yang ditranslate
  (dikonfirmasi eksplisit oleh user via screenshot 2026-09: "yang dirubah hanya kata-kata...
  untuk nama kolom nama baris dan nama tabel tidak perlu dirubah"): judul modal ("Validasi
  Dokumen"→"Document Validation" + subjudul), tombol (Cetak/Simpan/Batal/Ciutkan/Lebarkan →
  Print/Save/Cancel/Collapse/Expand), label field meta (Jenis Dokumen/Tanggal cek/Diperiksa oleh/
  Catatan Perubahan Manual → Document Type/Check date/Checked by/Manual Change Notes + 2
  placeholder input-nya), panel statistik (Sesuai/Tidak sesuai/Belum diisi/Akurasi validasi →
  Match/Mismatch/Not filled yet/Validation accuracy — via 2 mapping `STATUS_CONFIG` ~baris 468
  & `getCfg()` ~baris 1225, KEDUANYA cuma mapping status→label tampilan, key internalnya
  `match`/`mismatch`/`partial`/`empty` TIDAK diubah, aman). **TIDAK DISENTUH SAMA SEKALI**: array
  `SECTIONS` lokal di file ini (field/compareDoc/rowLabel/label/hint per baris matrix) — ini
  SAMA PERSIS risikonya dengan `ValidasiHelper.ts` (lihat "TEMUAN PENTING" di atas), file ini
  ternyata punya SECTIONS sendiri (bukan import dari ValidasiHelper.ts) dengan pola sama:
  `field` dipakai `computeStatus()` utk keyword-matching cara banding 2 nilai, bukan cuma teks
  tampilan.
  Susulan (2026-09, dari screenshot user, konfirmasi ulang cakupan "hanya kata-kata... nama
  kolom/baris/tabel tidak perlu dirubah"): badge status per-section "X/Y sesuai"/"X tidak
  sesuai" (~baris 1441-1444, teks statis di luar `section.label`, aman) → "match"/"mismatch";
  teks "jika ada — khusus jalur PIB" → "if applicable — PIB path only".
  **`ValidasiPerhitunganPIB.tsx`** (komponen kalkulasi PIB terpisah, dirender di dalam
  `ValidasiModal.tsx`) — HANYA UI chrome yang ditranslate: `StatusBadge` lokal-nya sendiri
  (~baris 100, "Sesuai"/"Tidak Sesuai"→"Match"/"Mismatch", key internal `match`/`mismatch`/
  `empty` tidak diubah, sama pola aman dengan `STATUS_CONFIG`), header tabel kalkulasi
  (AKTUAL/SELISIH/CARA PERHITUNGAN → ACTUAL/DIFFERENCE/CALCULATION METHOD, FIELD/EXPECTED/STATUS
  sudah Inggris), judul collapsible "Rincian Item Pabean (Halaman Lanjutan)"→"Customs Item
  Details (Continued Page)" + subjudulnya (warna teksnya juga diganti ke `#FFF5C5` sesuai
  permintaan user, ~baris 568). **TIDAK DISENTUH**: `FORMULA` (teks rumus statis, ~baris 5-15),
  label tiap baris kalkulasi (mis. "Freight (25)"/"Asuransi (24)"/"Nilai Pabean (26)" — row
  identifier, bukan cuma display), `status_checklist` (`'BELUM LENGKAP'`/`'ADA KETIDAKSESUAIAN'`/
  `'LULUS'` di `ValidasiModal.tsx` ~baris 971-973 — INI NILAI YANG DISIMPAN KE DB, sama kategori
  bahaya dengan `status` LENGKAP/PROSES/dst, JANGAN diubah).
  `CostValidationModal.tsx`, `ValidasiHelper.ts`, `ValidasiPibHelper.ts`, `ValidasiFill.ts`, dan
  `CourierValidasiPage.tsx` (list-nya, `VALIDASI_COLS` lokal) BELUM disentuh sama sekali.
- 🟡 Sea & Air — SELESAI (2026-09, dikonfirmasi user pola sama dengan Courier Validasi: "jangan
  rubah nama kolom, tabel dan baris"). Upload sudah otomatis selesai dari sesi Courier (file
  sama). Rincian:
  - `SharedDataTable.tsx`: label Indonesia tersisa di `SEA_AIR_AUDIT_COLS`/`SEA_AIR_REKAPAN_COLS`
    ditranslate (`Asuransi`→`Insurance`, `NILAI PABEAN`/`NILAI IMPOR`→`CUSTOMS VALUE`/`IMPORT
    VALUE`, `Tanggal`→`Date`, `Total Keseluruhan`→`Grand Total`, `Tgl Submit Finance`→`Finance
    Submit Date`, `Type Container`→`Container Type`, dan semua label `Biaya X`/`Vendor
    Inspeksi`/`Vendor Lainnya` dkk di breakdown cost EMKL/Freight/PBM/Lift Off/Inspeksi/
    Handling/Lainnya → `X Cost`/`Inspection Vendor`/`Other Vendor` dst). Select status
    LENGKAP/ARCHIVED di `SeaAirAuditRowGroup`/`SeaAirRekapanRowGroup` dibungkus `getStatusLabel()`
    (sebelumnya cuma dilakukan utk Courier). Tombol "💲 Cost Validasi"→"Cost Validation", badge
    boolean `type: 'bool'` (kolom V1-V14 di `VALIDASI_COLS`) "✅ LULUS"/"❌ GAGAL"→"✅ PASS"/
    "❌ FAIL" (murni turunan boolean, bukan nilai DB, aman).
  - `SeaAirChecklistModal.tsx` (read-only checklist viewer) — ditambah `STATUS_LABELS`/
    `getStatusLabel()` versi lokal (sama pola dgn `SharedDataTable.tsx`, termasuk status
    `'ADA KETIDAKSESUAIAN'`→"Mismatch Found" krn dipakai juga di modul ini), judul/label/empty
    state ditranslate penuh.
  - **`SeaAirValidasiModal.tsx`** — TERKONFIRMASI file ini punya SECTIONS-style data sendiri
    (`headerColors`, `INVOICE_FCL_COLS`/`FP_FCL_COLS`/`PIB_COLS`/dst, row/col dipakai sbg key
    lookup `checks.find(c => c.row === row && c.col === col)`) — SAMA RISIKONYA dgn
    `ValidasiHelper.ts`, TIDAK DISENTUH SAMA SEKALI. Yang ditranslate HANYA UI chrome: judul
    modal + subjudul, tombol (Mode Edit/Print/Simpan Perubahan), `StatusBadge` lokal (match/
    mismatch/null → "Match"/"Mismatch"/"Not checked yet", tooltip manual-edit), panel Statistik
    Global, empty state "Dokumen tidak diupload / tidak relevan"→"Document not uploaded / not
    relevant", badge "Kosong"→"Empty" (VesselTable), placeholder input DUTY table, semua
    `alert()`/`confirm()` dialog. Header kolom sticky "Validasi" (leftmost label column di semua
    tabel matrix ini) DITRANSLATE ke "Validation" — dikonfirmasi ini BUKAN key lookup (cuma
    literal JSX text di 7 tempat, grep `'Validasi'`/`"Validasi"` sbg string literal = 0 match),
    beda dari `headerColors`/`INVOICE_FCL_COLS` dkk yang memang dipakai sbg key. `SectionWrap`
    title prop (INVOICE/FAKTUR PAJAK/VESSEL/PIB/DUTY/EMKL/ACTUAL) TIDAK disentuh (nama section/
    tabel). `console.error`/comment dev tetap Indonesia (bukan scope).
    Susulan (2026-09, dari screenshot user, tabel DUTY): `headerColors` key `"Aktual (PIB)"` /
    `"Expected (Kalkulasi)"` (dipakai jadi key lookup WARNA saja, bukan matching data — beda
    dari `INVOICE_FCL_COLS` dkk — dicek aman, diganti bareng ke-2 pemakaiannya sekaligus)
    →`"Actual (PIB)"`/`"Expected (Calculation)"`. Row label tabel DUTY (`rows` array lokal di
    `DutyTable`, KUNCI lookup-nya `key: "bm"/"ppn"/"pph"/"total"` — BEDA dari `label` yang
    murni display, jadi aman diubah): **atas permintaan eksplisit user**, `label` "BM (PIB No.
    37)"/"PPN (PIB No. 41)"/"PPH (PIB No. 43)" disederhanakan jadi "BM"/"PPN"/"PPH" (lebar kolom
    dipertahankan, tidak berubah krn `LABEL_COL_PCT` persen tetap, bukan berdasar isi teks).
    "Item pabean (N item):"→"Customs items (N item(s)):", tombol "Sembunyikan"/"Tampilkan"→
    "Hide"/"Show", header sub-tabel item "Nilai Pabean"→"Customs Value", teks status PIB
    "Status validasi otomatis dari sistem berdasarkan perbandingan data dokumen."→"Automatic
    validation status from the system based on document data comparison."
    Susulan lain (screenshot user, halaman kosong "No data yet"): tombol "Upload sekarang →" di
    `SharedDataTable.tsx` (~baris 3904, muncul saat tabel Audit/Rekapan kosong & belum ada
    filter search) diterjemahkan ke "Upload now →" SEKALIGUS di-restyle jadi tombol solid
    `bg-[#5A305A]` (sebelumnya cuma teks link biru underline) sesuai permintaan user.
  - **`ValidasiShipmentInvoiceLengkap.tsx`** (modal Cost Validation Sea & Air "Cost Validasi
    Shipment & Invoice", dipanggil dari `SharedDataTable.tsx`, BELUM diaudit menyeluruh — baru
    beberapa bagian yang disentuh atas permintaan user 2026-09): "Ringkasan Validasi Cost"→"Cost
    Validation Summary", "Keseluruhan akurasi cost vs actual invoice"→"Overall cost accuracy vs
    actual invoice" (~baris 675-680, panel STATUS BAR bagian atas modal). File ini belum dicek
    apakah punya pola SECTIONS/row-col lookup serupa `SeaAirValidasiModal.tsx` — kalau ada
    permintaan translate lanjutan di file ini, cek dulu pola `checks.find(...)`/`field` dipakai
    sbg matching key sebelum translate row/col apa pun.
    **`globalStats`** (~baris 538, dipakai panel "Cost Validation Summary"): tambah persentase
    "Overall Accuracy" + progress bar (2026-09, replika persis pola `globalStats`/bar warna di
    `SeaAirValidasiModal.tsx` ~baris 1414/1478-1486 — hijau `>=90%`, kuning `>=60%`, merah di
    bawahnya). Formula: `pct = round(match / total * 100)`, `total` = jumlah SEMUA baris
    `checks` (bukan cuma yang statusnya match/mismatch — baris kosong/belum dicek tetap masuk
    `total`, cuma tidak masuk `match`), `match` = baris berstatus `"MATCH"`. **Baris dari tabel
    "INVOICE SURVEYOR (OPSIONAL)"** (`section === 'SURVEYOR'`, lihat `getRowsFor("SURVEYOR")`
    ~baris 747) DIKECUALIKAN dari `globalStats` sama sekali (difilter sebelum hitung
    match/total) — dikonfirmasi user 2026-09, karena tabel itu opsional, baris SURVEYOR yang
    kosong/belum diisi TIDAK BOLEH ikut menurunkan skor akurasi cost yang wajib. Kalau nanti ada
    section lain yang sifatnya opsional serupa, tambahkan `section` value-nya ke filter yang
    sama.
- ✅ FAR Overseas / Direct Loading — SELESAI (2026-09), dengan 1 pengecualian permanen yang
  dikonfirmasi user (memo cetak, lihat di bawah).
  - `src/utils/FarOverseasAirHelpers.ts`: `APPROVAL_STATUS_META`/`COST_STATUS_META` (pola
    display-only sama dgn `STATUS_LABELS`, key `PENDING`/`TIER1_DONE`/`TIER2_DONE`/`APPROVED`/
    `REJECTED`/`MATCH`/`BELUM_LENGKAP`/`OVERCHARGE`/`UNDERCHARGE` TIDAK diubah, cuma `.label`)
    ditranslate penuh. Notes template di `computeExpectedFromRate` ("Tarif rentang..."/"origin:
    ..., tujuan: ...") ditranslate SEBAGIAN — teks scaffolding-nya saja, `rate.jenis_layanan`/
    `rate.mata_uang` (nilai asli dari `far_overseas_tarif_vendor`) TIDAK disentuh.
    **JANGAN SENTUH** `mapModeToJenisLayanan()` — mapping keyword (REGULER/SEA/AIR/dst) ke
    STRING INDONESIA `'Reguler Freight'/'Economy'/'Express'/'Sea Freight'/'Air Freight'` yang
    harus PERSIS SAMA dengan nilai kolom `jenis_layanan` di tabel `far_overseas_tarif_vendor`
    (dibaca `rematchTarif()`) — ini data-matching, bukan teks tampilan, translate akan
    memutus pencocokan tarif otomatis sepenuhnya.
  - `FarOverseasAirPage.tsx`: List Memo (toolbar/header/toast/confirm delete/empty state/
    "Simpan Semua"/Antrian Proses) ditranslate penuh, termasuk `header:` kolom tabel ("JUDUL
    MEMO"→"MEMO TITLE", "STATUS APPROVAL"→"APPROVAL STATUS", "STATUS COST"→"COST STATUS").
    **JANGAN SENTUH** `inputPlaceholder: 'PENGIRIMAN DARI {ASAL} KE {TUJUAN} (AIR/SEA/REG/
    EXPRESS/ECONOMY)'` (kolom NOTE 1/`route_note`) — ini BUKAN cuma hint UI, `parseRouteNote()`
    di `FarOverseasAirHelpers.ts` pakai regex `/^PENGIRIMAN DARI (.+) KE (.+) \((.+)\)$/i` yang
    WAJIB user ikuti literal (Bahasa Indonesia) saat isi field ini secara manual — translate
    hint-nya ke Inggris tanpa translate regex-nya akan bikin user salah format & re-kalkulasi
    cost validation gagal diam-diam (`parseRouteNote` return null).
  - `FarOverseasAirUploadModal.tsx`, `FarOverseasAirWeightBreakdownModal.tsx` — ditranslate
    penuh (murni UI chrome, tidak ada memo cetak/matching logic).
  - `FarOverseasAirCostValidationModal.tsx` — ditranslate penuh: `COST_ROW_LABELS` (key
    `KG`/`UNIT_PRICE_DARI_DESCRIPTION`/`OTHER_CHARGES`/`TOTAL` tidak diubah, cuma label),
    `RateCandidateCard` labels (Origin/Tujuan/Jenis Layanan/Harga/Estimasi Waktu →
    Origin/Destination/Service Type/Price/Estimated Time — LABEL saja, `rate.jenis_layanan` dkk
    values tidak disentuh), badge SESUAI/TIDAK SESUAI→MATCH/MISMATCH, semua toast/error/empty
    state. **`RateRowCard`** (render `Object.entries(row)` mentah dari `RateRow`) SENGAJA TIDAK
    disentuh — itu literal nama kolom database (`jenis_layanan`, `harga_per_kg`, dst) yang
    dirender langsung sebagai label debug, bukan UI label yang di-desain, jadi tidak bisa/tidak
    perlu ditranslate.
  - **`FarOverseasAirDetailModal.tsx`** (modal memo approval + REPLIKA MEMO CETAK) — UI chrome
    non-print (toolbar, toast, `ApprovalConfirmModal`, `RejectModal`, "PO Details", "Rejection
    Reason", tombol "Reject") SUDAH ditranslate. **KEPUTUSAN FINAL (dikonfirmasi user 2026-09,
    JANGAN diubah lagi tanpa ditanya ulang)**: istilah yang tercetak di badan memo resmi
    (bagian dalam kotak border `#FFF5C5`, replika dokumen fisik asli) SENGAJA DIBIARKAN Bahasa
    Indonesia — label tanda tangan "Disiapkan Oleh,"/"Diperiksa Oleh," (`SignatureColumn`
    ~baris 317-319), "Tanggal:" di kolom approval (~baris 60), blok "NOTE :" & catatan
    pembayaran "MOHON DIBANTU BAYARKAN PADA TANGGAL :" (~baris 303/325-328), karena ini dokumen
    resmi yang mungkin dicetak/dikirim ke pihak eksternal (vendor/perusahaan) — beda risikonya
    dari teks UI aplikasi biasa. Konsisten dengan itu, `TIER_ACTION_LABEL`/`PIC_ACTION_LABEL`
    (tombol "Setujui — Disiapkan Oleh"/dst, MERUJUK istilah yang sama) dan teks PIC "Persetujuan
    PIC — terpisah dari tahapan Disiapkan/Diperiksa di atas..." JUGA SENGAJA DIBIARKAN Indonesia
    biar konsisten dengan istilah cetaknya. Ini SATU-SATUNYA bagian UI yang sengaja TIDAK ikut
    program translasi keseluruhan aplikasi — pengecualian permanen, bukan item yang belum
    dikerjakan.
- ⬜ Bunker (`BunkerPage.tsx`) — belum.
- ⬜ Audit AP Local (`AuditPoPage.tsx`) — belum.
- ⬜ Audit Trail, Settings hub, halaman admin (`src/pages/admin/*`, RoleManagementPage,
  FuelSurchargePage, KursBIPage, KursRuleVendorPage, TarifKontrakPage,
  FarOverseasVendorTarifPage), AccountPage, LoginPage — belum.

Komentar kode & isi CLAUDE.md ini SENGAJA TETAP Bahasa Indonesia (bukan bagian dari scope
"teks yang tampil ke user").

## Pola UI yang harus diikuti (dikonsolidasi sepanjang sesi-sesi sebelumnya)

- **Warna brand**: ungu `#5A305A` (hover `#73507B`) untuk tombol aksi utama & ikon header.
  Beberapa tombol lama masih `bg-blue-600` (belum semua dimigrasi) — kalau menyentuh halaman
  lama, samakan ke `#5A305A` saat diminta user.
- **Header halaman** (pola wajib, contoh: `FarOverseasVendorTarifPage.tsx`, `KursBIPage.tsx`):
  ```jsx
  <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
    <header className="px-6 pt-1 pb-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
            <Icon size={17} />
          </div>
          <div>
            <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Judul</h1>
            <p className="text-[#5A305A] font-light text-sm mt-1">Subjudul</p>
          </div>
        </div>
        <Greeting />
      </div>
    </header>
    <main className="max-w-7xl mx-auto px-4 pt-3 pb-8">
      ...
    </main>
  </div>
  ```
  Header **full-width** (BUKAN di dalam `max-w-* mx-auto`) — kalau header ikut kena `mx-auto`,
  `<Greeting />` kepental ke bawah judul di layar sempit/nama panjang. `main` pakai `pt-3` (bukan
  `py-8`) di sisi atas supaya jaraknya rapat ke header, `max-w-7xl` untuk halaman dengan tabel
  lebar, `max-w-2xl`/`max-w-5xl` untuk form sempit.
- **`<Greeting />`** (`src/components/Greeting.tsx`) — sapaan "Good morning/afternoon/evening/
  night, {nama}" + ikon waktu + tanggal (format `en-US`, sejak translasi UI ke Inggris 2026-09,
  lihat bagian "Translasi UI ke Bahasa Inggris" di bawah). Satu sumber kebenaran, dipasang di
  HAMPIR SEMUA halaman (kecuali `/login`). Jangan duplikat logic `getGreetingMeta` lagi di file
  lain.
- **Panel filter tabel**: 1 kartu putih (`bg-white rounded-2xl shadow-sm border border-slate-200
  p-4`) berisi search/dropdown/checkbox/total/tombol "Tambah X" — SEMUA dalam **1 baris**
  (`flex flex-nowrap items-center gap-3 overflow-x-auto`, bukan `flex-wrap`) supaya tidak pecah
  jadi 2 baris di layar sempit. Filter dengan banyak opsi pakai `<select>` dropdown, BUKAN
  tombol-tombol pill, kalau ingin tetap ringkas 1 baris. Tombol "Tambah ..." biasanya ditaruh di
  ujung kanan panel filter ini (`ml-auto`), bukan di header.
- **Pagination tabel**: kalau data di-fetch semua sekaligus (bukan server-side paginated), pakai
  pola client-side: `page`/`pageSize` state, `useMemo` slice dari `filteredData`, `useEffect`
  reset `page` ke 1 saat filter berubah, footer "Menampilkan X–Y dari Z" + tombol
  `ChevronLeft`/`ChevronRight` (contoh: `TarifKontrakPage.tsx`, `FarOverseasVendorTarifPage.tsx`).
- **Modal (Antrian Proses, Upload Dokumen, konfirmasi hapus, dll)**: overlay
  `fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70..9999] flex items-center justify-center
  p-4`, box `bg-white rounded-2xl shadow-2xl`. Modal antrian/upload lebar mengikuti layar
  (`w-[70vw] max-w-3xl` / `w-[85vw] max-w-6xl`), bukan lebar tetap kecil — supaya proporsional
  di layar besar (24").

## FAR Overseas Air — arsitektur cost validation (kompleks, baca dulu sebelum ubah)

- `rekapan_far_overseas_air` (1 baris = 1 memo, punya `route_note` = "PENGIRIMAN DARI {asal} KE
  {tujuan} ({mode})") ↔ 1:1 via `far_overseas_id` FK ↔ `cost_validasi_far_overseas_air`
  (`vendor_matched`, `rate_row_used` jsonb, `status`, `catatan`, `cost_validation` jsonb array
  `{row_key, expected, actual, notes, edited}`).
- **Baris TOTAL AMOUNT** (memo cetak, `FarOverseasAirDetailModal.tsx`) — kalau mata uangnya
  bukan IDR (`showIdrHint`), selain konversi "(≈ Rp ...)" sekarang ada juga "(Kurs: ...)" kecil
  italic di sampingnya. Kurs ini DIHITUNG ULANG langsung dari `total_amount_idr / total_amount`
  (bukan baca field `kurs_used` yang tersimpan) — supaya selalu konsisten dgn 2 angka yang
  sama-sama tercetak di baris itu.
- **Filter approval per level** (List Memo, `FarOverseasAirPage.tsx`, 2026-09) — dropdown
  "Approval" (state `approvalFilter`: `ALL`/`PIC`/`TIER1`/`TIER2`/`TIER3`), tiap opsi selain ALL
  nunjukin COUNT total memo yang pending di level itu (state `approvalCounts`, dihitung
  `fetchApprovalCounts`). TIER1/TIER2/TIER3 map ke kolom biasa `approval_status`
  (`PENDING`/`TIER1_DONE`/`TIER2_DONE`) — bisa difilter server-side via `.eq()` dalam `fetchList`.
  PIC beda sendiri: approvalnya INDEPENDEN dari `approval_status` (lihat array jsonb
  `approvals`), jadi TIDAK bisa `.eq()` biasa — SENGAJA tidak dipakaikan operator containment
  PostgREST (`cs`/`not.cs`) karena belum ada akses DB langsung utk verifikasi sintaksnya persis
  benar; sebagai gantinya `fetchList` ambil SEMUA baris (bukan REJECTED) lalu filter+paginate
  manual di JS kalau `approvalFilter==='PIC'` — kalau suatu saat tabel ini jadi sangat besar,
  pendekatan ini perlu diganti pakai containment operator (setelah sintaksnya diverifikasi ke DB
  asli) atau kolom generated column terpisah. `fetchApprovalCounts` dipanggil sekali di awal +
  lewat helper `refreshList` (dipanggil dari `onChanged` `FarOverseasAirDetailModal` & tombol
  Refresh) supaya count-nya ikut update begitu ada approve/reject/delete.
- **Document Validation** (`FarOverseasAirCostValidationModal.tsx`) — baris NAMA PT tiap PO yang
  namanya cocok (`looseNameMatch`) dengan `dominantPtName` (nama PT dari `dominant_company_code`,
  yang juga tampil di kolom PO baris CONCLUSION) dikasih centang hijau (`CheckCircle2`), supaya
  user langsung tau PO mana saja yang jadi kontributor nama PT dominan di CONCLUSION (2026-09).
- **RPC-only mutation** — JANGAN pernah `.update()`/`.insert()` mentah ke 2 tabel ini. Selalu
  lewat `update_rekapan_far_overseas_manual(p_id, p_updates)` dan
  `update_cost_validasi_far_overseas_manual(p_id, p_document_validation?, p_cost_validation?,
  p_status?, p_rate_row_used?, p_catatan?)`. **`p_catatan` param BELUM terverifikasi ada di
  fungsi Postgres-nya** (ditambahkan sisi frontend, belum ada akses DB langsung untuk konfirmasi
  — cek dulu sebelum mengandalkan behavior ini di production).
- `src/utils/FarOverseasAirHelpers.ts` — `computeExpectedFromRate`, `computeCostStatus`,
  `parseRouteNote`, `mapModeToJenisLayanan`, `rematchTarif` (REPLIKA PERSIS logic matching tarif
  n8n — filter berjenjang jenis layanan→origin→tujuan→berat, "lunak" — kalau diubah, HARUS tetap
  sinkron dengan n8n, jangan diubah sepihak di frontend saja). `rematchTarif` SATU-SATUNYA fungsi
  pencocokan tarif di app ini (dulu bernama `matchOctagonTarif`, Octagon-only — sudah
  digeneralisasi 2026-09, vendor Octagon/Jianqiao ditentukan dari `ship_via`, JANGAN bikin
  salinan/versi kedua lagi).
- **Edit NOTE 1 (`route_note`) memicu re-kalkulasi Cost Validation otomatis** (2026-09, VERSI
  FINAL — pernah ada 2 versi berbeda sebelumnya, versi lama SUDAH DIGANTI total, jangan
  reintroduce logic lama itu): berlaku generik utk vendor Octagon MAUPUN Jianqiao. Fungsi
  `reMatchAfterRouteNoteEdit` di `FarOverseasAirPage.tsx`, dipanggil dari `handleSaveAllEdits`
  setiap kali `route_note` termasuk field yang diubah saat "Simpan Semua". Alur: parse
  `route_note` baru (`parseRouteNote`, format wajib
  `"PENGIRIMAN DARI {asal} KE {tujuan} ({mode})"`, kalau tidak match → skip + toast peringatan
  format) → ambil `ship_via`/`qty` dari baris terkait → tentukan `jenisLayananSaatIni`:
  PRIORITASKAN hasil `mapModeToJenisLayanan(mode)` dari NOTE 1 yang baru (user BISA mengoreksi
  kata mode-nya juga, bukan cuma kota — kata kunci valid: AIR/SEA/REG atau REGULER/EXPRESS/
  ECONOMY, map ke `jenis_layanan` PERSIS di `far_overseas_tarif_vendor`), kalau kata kuncinya
  tidak dikenali baru fallback ke `jenis_layanan` dari `rate_row_used` YANG SEDANG TERSIMPAN
  (null kalau masih array/ambigu) → `rematchTarif(...)` → 0 kandidat = `rate_row_used=null` +
  status `BELUM_LENGKAP`, 1 kandidat = hitung ulang expected via `computeExpectedFromRate` +
  simpan, >1 kandidat = `rate_row_used` jadi array (UI munculkan pilihan manual) + status
  `BELUM_LENGKAP` → semua disimpan lewat `update_cost_validasi_far_overseas_manual`. Input
  `route_note` di List Memo dikasih `inputPlaceholder` (lihat `EditableCell`/
  `ListColumn.inputPlaceholder`) berisi hint format + kata kunci mode yang valid.
  **Kenapa teks kota di `unitPriceNotes` (kolom Notes baris "Unit Price" di Cost Validation)
  kadang TIDAK ikut berubah walau NOTE 1 sudah diedit & disimpan** (2026-09, sudah diperbaiki) —
  akar masalahnya di sifat "lunak" filter origin/tujuan `rematchTarif`: kalau kota yang baru
  diketik user TIDAK ketemu persis di kolom `origin`/`tujuan` tabel `far_overseas_tarif_vendor`
  utk vendor itu, filter itu di-skip (bukan gagal) dan kandidat SEBELUM filter origin/tujuan
  tetap dipakai — paling kentara utk vendor yang cuma punya 1 baris tarif generik per jenis
  layanan (mis. Jianqiao yang rutenya di tabel tarif memang selalu "origin: CHINA, tujuan:
  JAKARTA" apa pun kota yang diketik user, karena Jianqiao memang tidak punya varian kota lain di
  tarifnya) — hasilnya `candidates.length` tetap 1 (dianggap "berhasil" cocok) TAPI kota di
  tarif yang kepakai bukan kota yang baru diketik. FIX: `computeExpectedFromRate` sekarang terima
  2 parameter opsional `displayOrigin`/`displayTujuan` (HANYA mempengaruhi teks `unitPriceNotes`,
  TIDAK PERNAH mempengaruhi angka `expected` — itu tetap murni dari data `rate` yang match) —
  `reMatchAfterRouteNoteEdit` WAJIB isi 2 param ini dengan `parsed.origin`/`parsed.destination`
  (hasil parse NOTE 1 yang baru), supaya teks Notes SELALU sinkron dengan apa yang diketik user
  di NOTE 1, terlepas dari kota apa yang sebenarnya kepakai di baris tarif yang match. Pemanggil
  lain (`handleSelectRate`, fitur pilih-rate-manual di `FarOverseasAirCostValidationModal.tsx`)
  SENGAJA TIDAK isi 2 param ini (biarkan default ke `rate.origin`/`rate.tujuan`) karena di situ
  tidak ada "kota yang baru diketik" utk dijadikan acuan.
- Kolom `po_list` (jsonb array di `rekapan_far_overseas_air`, tipe `PoListEntry` di
  `FarOverseasAirHelpers.ts`) tiap entry punya `po_no_raw` & `vessel_raw` — ini SATU-SATUNYA
  sumber pasangan PO↔Vessel yang presisi baris-per-baris. `vessel_internal_note` cuma string
  ringkas nama-nama kapal (digabung " + "), TIDAK ada info nomor PO di teks itu lagi — JANGAN
  di-parse buat breakdown. Di List Memo (`FarOverseasAirPage.tsx`), kolom **NO PO** & **VESSEL**
  berbagi 1 state expand (`expandedPoRows`/`togglePoExpanded`, tombol toggle ada di kolom NO PO
  saja) — saat expanded, keduanya render baris-per-baris dari `po_list` (bukan
  `vessel_internal_note`), sejajar per index, baris dengan `vessel_raw` null tampil `"-"` (tidak
  di-skip, supaya urutan tetap 1:1 dengan No PO).
- **Memo cetak** (`FarOverseasAirDetailModal.tsx`) — `vessel_internal_note` SENGAJA TIDAK PERNAH
  dirender di modal ini sama sekali (bukan cuma `print:hidden`) — field itu HANYA boleh tampil di
  kolom VESSEL tabel List Memo. NOTE 3 (`status_note`) & NOTE 4 (`other_note`) SEKARANG ikut masuk
  ke baris "NOTE :" di memo cetak (bareng NOTE 1/NOTE 2), tapi HANYA render barisnya kalau isinya
  tidak null/kosong (baris yang kosong tidak dirender sama sekali, bukan tampil "-").
- **PIC** (2026-09, versi final — sempat dicoba 2 pendekatan berbeda sebelum ini: kolom tanda
  tangan terpisah dengan approval terpisah, lalu dicoba tanpa approval sama sekali; keduanya
  SUDAH DIGANTI dengan versi di bawah ini, JANGAN reintroduce versi lama): kolom manual
  `pic_name` (text, mirip `buyer_name`, ada di `REKAPAN_EDITABLE_FIELDS` & editable inline di
  List Memo lewat kolom "PIC") TETAP ADA sebagai fallback nama sebelum di-approve. TIDAK ADA
  kolom tanda tangan terpisah untuk PIC di memo cetak — nama PIC digabung bersebelahan dengan
  nama Exim Officer (approval tahap 1) di kolom "Disiapkan Oleh" YANG SAMA, format
  `"{nama exim}/{nama PIC}"` (kalau salah satu belum ada, tampilkan yang ada saja) — lihat
  `disiapkanNama`/`picDisplayName` & `SignatureColumn.nameOverride` di
  `FarOverseasAirDetailModal.tsx`. TAPI approval PIC-nya TETAP ADA sebagai aksi terpisah &
  INDEPENDEN dari alur tier1→tier2→tier3 (tombol "Setujui — PIC", tidak menghalangi/dihalangi
  status tahap manapun, TIDAK PERNAH mengubah `approval_status`) — untuk sementara approver-nya
  = user yang login (`profile?.nama || user?.email`, sama seperti default tier1), append 1 entry
  `{tier: 'PIC', nama, jabatan: 'PIC', approved_at, user_email}` ke array `approvals`; begitu ada
  entry ini, nama approver itulah yang tampil di "Disiapkan Oleh" (menggantikan `pic_name`
  manual), sama pola dengan tier1/2/3. `ApprovalEntry.tier` bertipe `number | 'PIC'`
  (`ApprovalTier`). Kolom **BUYER** (`buyer_name`) ditambahkan di List Memo bersebelahan dengan
  PIC (2026-09) — sebelumnya `buyer_name` cuma tampil di memo cetak, sekarang juga editable
  inline di List Memo (sudah ada di `REKAPAN_EDITABLE_FIELDS` dari awal).
- **Field baris header memo cetak** (PO.No/Supplier kiri, Inv.No/Date kanan) — kedua kolom
  SENGAJA dipisah jadi 2 blok independen (bukan 2 baris flex-row PO.No+Inv.No lalu
  Supplier+Date) supaya Inv.No & Date tetap rapat berdekatan walau PO.No isinya panjang/wrap
  banyak baris (mis. gabungan banyak PO) — kalau digabung 1 baris flex, tinggi baris itu ikut
  ketarik setinggi PO.No, jadi Date jadi jauh dari Inv.No.
- **Note pembayaran** (2026-09): 1 baris teks kecil `"Note: MOHON DIBANTU BAYARKAN PADA TANGGAL :
  {expected_payment_date}"` (format `formatDateMemo`) ditaruh DI LUAR kotak/tabel memo (di bawah
  signature table), TAPI TETAP ikut tercetak di mode print (bukan `print:hidden`) — beda dari
  field lain di luar kotak memo yang defaultnya `print:hidden`. Karena field ini sekarang sudah
  tercetak lewat note ini, blok "Catatan Internal (tidak tercetak di memo)" yang dulu menampilkan
  Expected Payment Date terpisah SUDAH DIHAPUS (redundant).

## Sea & Air — Audit, kolom Balance & Asuransi (`src/components/SharedDataTable.tsx`, 2026-09)

Kolom `balance` & `asuransi` di tabel `tabel_audit_seaair` (halaman Audit Sea & Air) SEKARANG
punya formula hardcode di frontend (sebelumnya murni field pass-through hasil ekstraksi n8n,
lihat catatan lama di bawah soal ini):
- `BALANCE = VALAS_DPP * KURS_NDPBM - (TOTAL_INV_FREIGHT + ITEM_PRICE_IDR)`
- `ASURANSI = 0.5% * (TOTAL_INV_FREIGHT + ITEM_PRICE_IDR)`

Diimplementasi di 3 tempat (Sea & Air Audit editing-nya INLINE per baris, bukan modal, lihat
`SeaAirAuditRowGroup`/`isInlineEditable` — modal `EditModal` cuma dipakai utk flow "Tambah
Data"):
1. `EditModal` (~baris 218+, `useEffect` khusus `tab.id === 'sea_air_audit'`) — pola sama
   persis dengan auto-calc `item_price_idr`/`cek_selisih` milik `courier_audit` yang sudah ada
   duluan di atasnya, dipakai saat create record baru.
2. `handleInlineSaveRow` (~baris 3277) — inline edit cuma kirim field yang BERUBAH (diff), jadi
   kalau salah satu dari 4 kolom sumber ikut berubah, balance/asuransi dihitung ulang dari
   gabungan `record` lama + `cleanedPayload` baru, lalu disisipkan ke payload sebelum dikirim
   ke RPC `update_seaair_row` (jadi ikut TERSIMPAN ke DB).
3. **`fetchRecords`'s `enrichedData` DAN `getExportData`** (2026-09, FIX bug — awalnya SENGAJA
   tidak dipasang di sini, niatnya biar nilai asli n8n tetap tampil apa adanya sampai user edit,
   analog `item_price_idr`. Ternyata ini bikin baris yang belum PERNAH diedit manual — yaitu
   HAMPIR SEMUA baris, karena n8n memang tidak pernah isi `balance`/`asuransi` — selalu tampil
   "-" walau ke-4 data sumbernya lengkap, user lapor "hasil kalkulasi tidak muncul". Fix: hitung
   ulang `r.balance`/`r.asuransi` dari 4 field sumber di SETIAP baris hasil fetch/export, sama
   persis formula di poin 1/2 — idempoten dengan hasil edit-triggered karena formulanya sama,
   jadi tidak konflik. Sekarang kolom ini SELALU live-computed dari data yang ada, bukan
   menunggu user mengedit dulu.

`balance`/`asuransi` DIKELUARKAN dari `isInlineEditable()` (~baris 1316) — tidak bisa diketik
manual lagi lewat inline edit, murni hasil formula (sama perlakuan dengan `cek_selisih`). Kalau
formula perlu diubah lagi nanti, HARUS disinkronkan di SEMUA 4 tempat ini (EditModal,
handleInlineSaveRow, fetchRecords enrichedData, getExportData).

## Sea & Air — Rekapan, badge persentase di tombol Doc/Cost Validation (2026-09)

Di halaman **Rekapan Sea & Air**, tombol "🔎 Doc Validation" & "💲 Cost Validation" pada panel
Action tiap baris (`SeaAirRekapanRowGroup`, ~baris 2228-2249) sekarang punya BADGE PERSENTASE
kecil di pojok kanan-atas tombolnya (bulat, hijau `>=90%` / kuning `>=60%` / merah di bawahnya),
supaya user langsung tahu skor akurasi validasi tanpa buka modalnya dulu. Badge SELALU tampil
(dikonfirmasi user 2026-09) — termasuk saat 0% atau belum ada data validasi sama sekali untuk
shipment itu (fallback `total === 0` / tidak ketemu record matriks|cost validasi → `0`, BUKAN
`null` seperti percobaan awal yang bikin badge-nya malah hilang).

Dihitung di `fetchRecords` (~baris 2907-2946, bareng `seaAirAuditStatusMap` yang sudah ada
lebih dulu) lewat 2 batch query tambahan (chunk 50, sejalan dengan pola `tabel_audit_seaair`
yang sudah ada), lalu disimpan ke `r.doc_validation_pct`/`r.cost_validation_pct` per baris di
`enrichedData` — **BUKAN dihitung ulang di komponen row**, supaya query-nya batch sekali per
halaman (bukan N+1 query per baris):
- **Doc Validation** — dari `dokumen_validasi_matriks_seaair.checks` (jsonb array, join
  `seaair_id`). Formula REPLIKA PERSIS `globalStats` di `SeaAirValidasiModal.tsx` (~baris 1402):
  cuma hitung `checks` yang `match` sudah terisi (`true`/`false`, BUKAN `null` = "Belum dicek")
  sebagai `total`, `match === true` sebagai pembilang.
- **Cost Validation** — dari `cost_validasi_seaair.checks` (jsonb array, join `seaair_id`).
  Formula REPLIKA PERSIS `globalStats` di `ValidasiShipmentInvoiceLengkap.tsx` (~baris 538,
  SUDAH termasuk fix exclude SURVEYOR 2026-09): `checks` dengan `section === 'SURVEYOR'`
  DIKECUALIKAN dulu sebelum hitung `total`/`status === 'MATCH'`.

**Kalau formula persentase di salah satu modal itu diubah lagi nanti, WAJIB disinkronkan juga
di sini** (3 tempat: `SeaAirValidasiModal.tsx` `globalStats`, `ValidasiShipmentInvoiceLengkap.tsx`
`globalStats`, `SharedDataTable.tsx` `fetchRecords` map di atas) — kalau tidak, badge di List
Rekapan bisa beda angka dengan yang ditampilkan di dalam modalnya sendiri.

## Courier — Audit, badge persentase di tombol Doc/Cost Validation + footer % Cost Validation (2026-09)

Pola yang sama dengan badge Sea & Air Rekapan di atas, diterapkan juga ke tombol "🔍 Doc
Validation" & "💲 Cost. Validation" di panel Action tiap baris **Audit Courier**
(`CourierAuditRowGroup`, ~baris 1764-1789) — badge SELALU tampil (termasuk 0%, sama kebijakan
dgn Sea & Air).

- **`src/utils/CostValidationHelpers.ts`** (FILE BARU) — `isRowVisible()` & `computeLiveCostSummary()`
  DIPINDAHKAN ke sini dari `CostValidationModal.tsx` (logic aslinya SAMA PERSIS, cuma
  dipindah/di-export, bukan ditulis ulang) supaya jadi SATU-SATUNYA sumber kebenaran ringkasan
  Cost Validation Courier (visibilitas 9 baris komponen Freight/Duty + klasifikasi OK/SELISIH/NA
  + status TOTAL Freight & TOTAL Duty). Dipakai oleh 2 tempat: `CostValidationModal.tsx` (detail
  per shipment, lewat `liveSummary = useMemo(() => computeLiveCostSummary(data, jenisDokumen))`)
  DAN `SharedDataTable.tsx` `fetchRecords` (badge, panggil langsung per baris `tabel_cost_validasi`
  yang di-fetch). **Kalau aturan visibilitas/klasifikasi baris cost validation berubah, WAJIB
  diubah di file ini SAJA** — jangan pernah tulis ulang logic yang sama di `CostValidationModal.tsx`
  atau di `SharedDataTable.tsx` lagi.
  `computeLiveCostSummary()` sekarang juga mengembalikan `pct` (`total_ok / total_cost_cek * 100`,
  dibulatkan, `0` kalau `total_cost_cek` 0) — dipakai baik utk badge maupun panel "Overall
  Accuracy" baru di footer modal (lihat di bawah).
- **`CostValidationModal.tsx`** — footer "Summary Footer" (sebelumnya cuma Total Validable/OK/
  SELISIH/N/A + badge STATUS besar + badge Invoice Freight/Duty, TANPA persentase sama sekali)
  SEKARANG ditambah panel "Overall Accuracy" + progress bar (~setelah baris STATUS, sebelum
  badge Invoice Freight/Duty), replika visual PERSIS pola `SeaAirValidasiModal.tsx`/
  `ValidasiShipmentInvoiceLengkap.tsx` (hijau `>=90%`, kuning `>=60%`, merah di bawahnya).
- **`SharedDataTable.tsx` `fetchRecords`** (courier_audit branch, ~setelah `mergeChecklistData`)
  — 2 batch query TAMBAHAN (paralel via `Promise.all`, chunk 50, per pib_id/cn_id):
  1. **Doc Validation** — dari `tabel_checklist_validasi` (`total_match`/`total_mismatch`),
     formula SAMA PERSIS `CourierValidasiPage.tsx`: `pct = checked>0 ? match/checked*100 : 0`
     (`checked = total_match+total_mismatch`, `total_empty`/"belum diisi" TIDAK masuk penyebut).
     **TIDAK pakai fallback live-calc** (SECTIONS/`computeStatus`/`generateValues`/
     `calculatePibStats`, yang dipakai `CourierValidasiPage.tsx` kalau baris
     `tabel_checklist_validasi`-nya belum ada) — demi performa list (badge cuma baca 1 tabel
     kecil per baris, bukan live-compute puluhan field per baris x N baris per halaman). Kalau
     baris `tabel_checklist_validasi`-nya belum pernah dibuat (belum pernah dibuka di modal Doc
     Validation), badge-nya tampil `0%`, BUKAN disembunyikan (kebijakan sama dgn Sea & Air).
  2. **Cost Validation** — dari `tabel_cost_validasi` (`select('*')`, order `created_at` desc,
     ambil baris PALING BARU per pib_id/cn_id kalau ada >1, sama pola dgn `costValidations` utk
     Rekapan Courier yang sudah ada duluan), lalu panggil `computeLiveCostSummary()` yang sama
     dipakai modalnya sendiri — TIDAK ada duplikasi formula.
  Kedua map di-attach ke `r.doc_validation_pct`/`r.cost_validation_pct` per baris di
  `enrichedData` (branch `courier_audit`, bareng `cek_selisih`), key `pib_${id}`/`cn_${id}`
  ditentukan dari `r.jenis_dokumen` (fallback `courierAuditType` utk baris di tab PIB/CN murni).

  **PENTING (fix susulan 2026-09, dari laporan user "badge belum ada" di tab Draft)**: `fetchRecords`
  punya **2 JALUR FETCH TERPISAH** utk `courier_audit` — jalur normal (query `tabel_audit_pib`
  ATAU `tabel_audit_cn` sendiri-sendiri, tergantung `courierAuditType` 'pib'/'cn') DAN jalur
  KHUSUS tab Draft/`courierAuditType === 'archive'` (~baris 2726, query PIB+CN SEKALIGUS lalu
  di-`combine`, `return` lebih awal SEBELUM sampai ke jalur normal — beda `setRecords()` call
  sendiri). Badge yang tadinya cuma dipasang di jalur normal TIDAK PERNAH kena di tab Draft
  karena early-return itu. Fix: logic batch-query badge dipindah jadi fungsi module-level
  **`fetchCourierValidationBadgePct(rows)`** (~baris 918, tepat setelah `mergeChecklistData`),
  dipanggil dari KEDUA jalur (jalur Draft ~baris 2822, jalur normal ~baris 3068) supaya badge-nya
  konsisten muncul di semua tab (PIB/CN/Draft). **Kalau nanti nambah jalur fetch baru lagi utk
  `courier_audit`, WAJIB panggil `fetchCourierValidationBadgePct()` juga di situ** — jangan tulis
  ulang batch query-nya.

## Badge persentase tombol Checklist — Audit Courier & Rekapan Sea & Air (2026-09)

Pola sama dgn badge Doc/Cost Validation di atas, tapi lebih sederhana karena persentasenya
SUDAH TERSIMPAN LANGSUNG di database (kolom `pct_kelengkapan`, diisi `ChecklistModal.tsx`/
`SeaAirChecklistModal.tsx` saat checklist disimpan) — TIDAK perlu dihitung ulang di frontend
sama sekali, beda dari Doc/Cost Validation yang harus live-compute dari `checks`.

- **Audit Courier** (`CourierAuditRowGroup`, tombol "📋 Checklist") — TIDAK perlu query
  tambahan apa pun. `rec.pct_kelengkapan` SUDAH otomatis ke-merge ke tiap baris lewat
  `mergeChecklistData()` (dipanggil di KEDUA jalur fetch `courier_audit`, termasuk jalur
  Draft/archive) — `CHECKLIST_MERGE_FIELDS` (~baris 882) sudah dari awal mencakup
  `pct_kelengkapan`. Badge langsung baca `Number(rec.pct_kelengkapan) || 0`.
- **Rekapan Sea & Air** (`SeaAirRekapanRowGroup`, tombol "✓ Checklist") — badge baru
  `rec.checklist_pct`, diisi dari batch query TAMBAHAN ke `dokumen_checklist_seaair`
  (`seaair_id, pct_kelengkapan`) di `fetchRecords`, dalam blok yang sama dengan
  `seaAirAuditStatusMap`/Doc/Cost Validation pct map (biar cuma 1 batch round-trip per
  kolom per halaman, bukan nambah round-trip terpisah).

Kedua badge pakai kebijakan sama dengan Doc/Cost Validation: SELALU tampil termasuk `0%`
(fallback `?? 0`, bukan `null`/hilang).

## Sea & Air — Dokumen Validasi (`src/components/SeaAirValidasiModal.tsx`)

Tabel-tabel di modal ini (INVOICE FCL, FAKTUR PAJAK FCL, PIB Matrix, dll) render kolom "data
check" (PPJK/Freight Origin/Freight Destination/Storage/Laporan Surveyor/LOLO/Trucking/dst)
lewat **daftar kolom yang di-HARDCODE**, BUKAN otomatis mengikuti field apa saja yang ada di
data — `INVOICE_FCL_COLS` & `FP_FCL_COLS` (~baris 450/521). Kalau n8n/backend menambah jenis
data check baru di kolom-kolom ini, kolom itu TIDAK akan muncul di tabel sampai ditambahkan
manual ke daftar tsb + entry warna di `headerColors` (~baris 10). Kolom "Trucking" sudah
ditambahkan (2026-09) ke `INVOICE_FCL_COLS`, `FP_FCL_COLS`, dan `headerColors`.

## Audit AP Local — halaman laporan otomasi + koreksi manual terbatas (`src/pages/AuditPoPage.tsx`)

Nama file/route/`page_key` tetap `AuditPoPage`/`/audit-po`/`audit_po` (nama teknis dari saat
dibuat), tapi label yang tampil ke user di sidebar & judul halaman adalah **"Audit AP Local"**.
Halaman ini TIDAK punya judul card ("Daftar Hasil Audit..." sengaja dihapus atas permintaan
user) — panel filter langsung jadi header card, `justify-end`.

- Tabel `audit_po_ap_comp` (1 baris = 1 hasil audit PO/vendor) diisi OTOMASI BACKEND tiap 30
  menit — pola dasar sama seperti `BunkerPage.tsx` tapi lebih sederhana (tidak ada
  upload/modal-antrian). 5 kolom (`nama_pt`, `nomor_po`, `vendor_name`, `status_audit`,
  `kategori`) BOLEH dikoreksi manual lewat modal Edit, dan barisnya BOLEH dihapus permanen lewat
  modal Hapus — semua kolom lain (`durasi_text`, `durasi_detik`, `url_pdf`, `url_html`,
  `drive_file_id_*`) tetap read-only murni karena dihasilkan otomatis dari file asli oleh backend.
- Kolom **Aksi** — di-*group* jadi 1 tombol toggle "Aksi" per baris (state `openActionsRowId`),
  BUKAN beberapa tombol terpisah sekaligus. Pola diambil PERSIS dari kolom AKSI di
  `FarOverseasAirPage.tsx` (List Memo, baris ~862-910): klik toggle → panel kecil di bawahnya
  (non-floating, reflow row, bukan `position: absolute`) berisi Edit/Hapus/Download PDF/Hasil
  Audit, tiap klik item menutup panel lagi (`setOpenActionsRowId(null)`). Kalau nambah aksi baru
  di kolom ini, ikuti pola ini juga, jangan balik ke tombol terpisah.
- Tabel pakai `table-fixed` + `<colgroup>` (lebar eksplisit per kolom) — BUKAN auto layout —
  supaya lebar kolom (terutama Durasi) tidak "digencet" gara-gara sticky Aksi (quirk browser saat
  sticky column dikombinasi table auto-layout). Kolom Kategori & Aksi sengaja dibuat sempit,
  teks kategori panjang di-truncate (`...`) via class `truncate` pada tombol combobox-nya.
  - `EditAuditPoModal` (`AuditPoPage.tsx`) — form Nama PT/Nomor PO/Vendor/Status Audit/Kategori,
    disimpan sekaligus lewat `updateAuditPoRow(id, updates)`. **Nama PT & Nomor PO SEKARANG
    read-only (2026-09, permintaan user)** — kedua field ini di-render `<input disabled>` (bukan
    `<select>`/`<input>` biasa lagi), value tetap dikirim apa adanya ke `updateAuditPoRow` saat
    Simpan (tidak berubah, cuma tidak bisa diedit user). Vendor/Status Audit/Kategori tetap bisa
    diedit seperti biasa.
  - `DeleteAuditPoModal` — pola sama persis `DeleteConfirmModal` di `BunkerPage.tsx`, konfirmasi
    dulu sebelum `deleteAuditPoRow(id)` (hard delete permanen).
  - **Tombol "Preview PDF"/"Hasil Audit" (2026-09, GANTI dari `<a target="_blank">` biasa)** —
    sekarang tombol yg buka `PreviewModal` (iframe besar `w-[90vw] max-w-6xl h-[85vh]`) dalam
    aplikasi, bukan langsung download/buka tab baru. `buildPreviewSrc(rawUrl, driveFileId)`
    PRIORITASKAN `url_pdf`/`url_html` MENTAH dulu (host asli di luar Drive), `drive_file_id_*`
    cuma fallback kalau raw url-nya null.
    **Versi awal KEBALIK (prioritas Drive dulu) — SUDAH DIPERBAIKI (2026-09), jangan reintroduce**:
    sempat prioritaskan `drive_file_id_html` → URL `https://drive.google.com/file/d/<id>/preview`
    duluan, TERNYATA (dikonfirmasi user via screenshot) Google Drive SENGAJA TIDAK PERNAH
    me-render file HTML upload user sbg halaman hidup di endpoint itu (proteksi bawaan Google,
    cegah XSS/phishing dari origin drive.google.com) — yang muncul cuma SOURCE CODE mentah
    dgn syntax highlight (ketauan dari `<!DOCTYPE html>...` tampil apa adanya + ikon kaca
    pembesar cari-teks khas Drive), bukan halaman ter-render. Fallback ke Drive TETAP OK KHUSUS
    PDF (Drive PDF viewer beneran render PDF, beda dari HTML) tapi jangan diandalkan utk HTML.
    **Iterasi ke-2 juga gagal — SUDAH DIPERBAIKI (2026-09)**: setelah fix di atas, `target.src`
    (skrg `url_pdf`/`url_html` mentah) ditaruh LANGSUNG di `<iframe src=...>` — TERNYATA blank
    total tanpa pesan error apapun (dikonfirmasi user via screenshot ke-2). Ini gejala khas server
    asal file itu ngirim header `X-Frame-Options`/CSP `frame-ancestors` yg BLOKIR framing dari
    origin lain (browser blank-in diam2, tidak nampilin halaman error besar) — iframe `src` ke
    URL pihak lain SELALU tunduk ke header itu, sesuai host aslinya, TIDAK ADA cara di-bypass dari
    sisi `src` doang mau app apapun yg nge-embed.
    **Versi final (2026-09)**: `PreviewModal` sekarang `fetch()` konten filenya lewat JS dulu
    (di `useEffect`, dgn cleanup `cancelled` flag + `URL.revokeObjectURL` biar tidak leak), BARU
    suntikkan HASIL fetch-nya (bukan URL-nya lagi) ke iframe — `srcDoc` (teks HTML mentah) utk
    `kind: 'html'`, atau `blob:` object URL (`URL.createObjectURL`) utk `kind: 'pdf'` (browser
    tetap render pakai PDF viewer bawaannya dari `blob:` URL). Iframe yg isinya `srcDoc`/`blob:`
    DIANGGAP SAME-ORIGIN oleh browser, jadi TIDAK tunduk lagi ke X-Frame-Options/frame-ancestors
    server asalnya — itu inti kenapa cara ini bisa nembus sementara `src` langsung tidak bisa.
    `PreviewTarget` nambah field `kind: 'pdf' | 'html'` (diisi eksplisit oleh caller pas klik
    tombol PDF vs Hasil Audit, BUKAN di-sniff dari content-type response) supaya tau cara proses
    hasil fetch-nya. State modal: `'loading' | 'html' | 'blob' | 'error'` — `'error'` muncul kalau
    `fetch` gagal (network error ATAU response bukan 2xx), tampilkan pesan jelas + arahkan ke
    tombol "Buka di tab baru", BUKAN diam2 blank lagi.
    **Iterasi ke-3, akar masalah sebenarnya (2026-09, dikonfirmasi user)**: user coba buka
    `url_html` LANGSUNG di Google Drive (bukan lewat app ini) — TERAP tetap cuma nampilin source
    code, bukan halaman ter-render. Ini MEMBUKTIKAN `url_html`/`url_pdf` MEMANG link Google Drive
    juga (bukan host terpisah di luar Drive spt dugaan awal), dan batasan "Drive tidak pernah
    render HTML" ini berlaku di link/endpoint Drive MANAPUN (`/view`, `/preview`, atau di-fetch
    client) — fetch client-side ke `url_html` sama saja percuma, yang didapat cuma halaman
    viewer Drive-nya, bukan file HTML asli.
    **Solusi final (2026-09) — proxy backend `server.ts`**: endpoint baru
    `GET /api/drive-file-proxy?id=<drive_file_id>` — `id` divalidasi regex ketat
    (`/^[a-zA-Z0-9_-]{10,100}$/`) SEBELUM dipakai, endpoint ini SENGAJA HANYA boleh minta ke
    domain Drive (bukan proxy generik ke URL dari client) supaya BUKAN celah SSRF. Server minta
    file ASLI dari `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`
    (endpoint file mentah, BUKAN endpoint viewer `/view`/`/preview` yg dipakai browser saat
    navigasi biasa) — request ini server-ke-server, TIDAK tunduk CORS/X-Frame-Options browser
    sama sekali — lalu di-STREAM langsung ke response (`Readable.fromWeb(driveRes.body).pipe(res)`,
    dari `node:stream`) TANPA PERNAH ditulis ke disk (murni relay real-time, dikonfirmasi ke user
    sebelum diimplementasikan — TIDAK membebani storage server berapa pun banyak file di-preview).
    `buildPreviewSrc(driveFileId, rawUrl)` (URUTAN PARAM DIBALIK dari versi sebelumnya) SEKARANG
    prioritaskan proxy ini (`/api/drive-file-proxy?id=<drive_file_id>`) DULU, `url_pdf`/`url_html`
    mentah cuma fallback kalau `drive_file_id`-nya null (fallback ini kemungkinan besar tetap
    gagal krn alasan yg sama di atas, tapi tetap dicoba drpd langsung nyerah).
    **Bug lanjutan yg ditemukan & diperbaiki (2026-09)**: setelah proxy jalan, preview HTML sudah
    OK tapi preview PDF malah trigger DOWNLOAD file (nama file jadi UUID tanpa ekstensi di
    Downloads browser, bukan tampil di iframe) — penyebabnya header `Content-Type` dari respons
    Drive utk endpoint download kadang generik (`application/octet-stream`), bukan
    `application/pdf`, dan browser menolak render `blob:` URL ber-type octet-stream secara inline
    (di-treat sbg "harus di-download", bukan "boleh ditampilkan"). Fix: di blok `kind === 'pdf'`
    `PreviewModal`, `Blob` hasil fetch di-rewrap paksa jadi `type: 'application/pdf'`
    (`new Blob([rawBlob], { type: 'application/pdf' })`) SEBELUM `URL.createObjectURL` — TIDAK
    mengandalkan header Content-Type upstream sama sekali utk kasus PDF, krn `target.kind` sudah
    pasti tau ini PDF dari tombol mana yg diklik. **PENTING**: `tsx` (dipakai `npm run dev`,
    lihat `server.ts`) TIDAK hot-reload perubahan kode backend seperti Vite HMR utk frontend —
    tiap kali `server.ts` diubah, dev server WAJIB di-restart manual (stop lalu `npm run dev`
    lagi) supaya perubahan endpoint proxy ini kepakai, kalau tidak permintaan ke
    `/api/drive-file-proxy` bakal jatuh ke SPA fallback (`app.get('*', ...)`) dan balikin
    `index.html` biasa, bukan error yg jelas — gejalanya membingungkan (kelihatan spt endpoint
    "ada" tapi behavior salah, bukan 404 tegas).
    **Penyesuaian UI lanjutan (2026-09, setelah preview PDF/HTML terbukti jalan)**: tinggi modal
    dinaikkan `h-[85vh]` → `h-[95vh]` (lebih tinggi, permintaan user krn PDF viewer butuh ruang
    vertikal lebih). Tombol pojok kanan atas (`externalUrl`, target `_blank`) di-relabel dari
    "Buka di tab baru" (ikon `ExternalLink`) → **"Download File"** (ikon `Download`) — user
    klarifikasi fungsi tombol ini SECARA PRAKTIK memang selalu memicu download (bukan preview tab
    baru beneran), krn `externalUrl` link Drive/host asli yg sama² kena batasan render yg
    dijelaskan di atas, jadi label lama menyesatkan. Perilaku `<a>`-nya TIDAK diubah (masih
    `target="_blank" rel="noopener noreferrer"` ke `externalUrl` yg sama), cuma teks & ikon.
- Pagination **server-side** (`.select('*', { count: 'exact' }).range(...)`) karena tabel terus
  bertambah — beda dari kebanyakan halaman admin lain di app ini yang client-side paginated.
  Filter: search (debounced 400ms) ke `nomor_po`/`vendor_name` via `.ilike`, dropdown `nama_pt`
  (single-select, opsi hardcode: AMT/GMI/TTP/MJS/WSI/WNS/GENERAL — cek ulang ke DB kalau ada PT
  baru), dropdown **`kategori`** (2026-09, GANTI dari dropdown `status_audit` sebelumnya — daftar
  opsi dari `KATEGORI_OPTIONS` yang sama dgn kolom Kategori, bukan dari `status_audit` lagi),
  rentang tanggal `created_at`. `STATUS_AUDIT_OPTIONS` (2 nilai tetap: "Selesai Diproses"/"Doc
  tidak terbaca") TETAP dipakai sbg `<datalist>` saran di field Status Audit modal Edit, HANYA
  dihapus dari filter panel.
- Kolom `url_pdf`/`url_html` dirender sebagai `<a target="_blank">` biasa (link download
  langsung dari backend, tidak ada logic tambahan di frontend).
- Kolom **Kategori** (`kategori`, text, nullable) — dipilih lewat combobox searchable terkontrol
  `KategoriPicker` (`AuditPoPage.tsx`, dipakai 2 tempat: `KategoriCell` di kolom tabel = auto-save
  per pilih via `updateAuditPoKategori`; form di `EditAuditPoModal` = disimpan barengan field lain
  saat klik "Simpan"): ketik untuk filter, klik untuk pilih dari daftar tetap `KATEGORI_OPTIONS`
  (`src/utils/AuditPoHelpers.ts`) — BUKAN free text bebas. Kolom ini perlu di-provision dulu lewat
  `alter table public.audit_po_ap_comp add column if not exists kategori text;` (dijalankan
  manual oleh user langsung di Supabase SQL editor, tidak disimpan sbg file migrasi di `sql/`) —
  **belum terverifikasi sudah dijalankan di Supabase production**, cek dulu sebelum mengandalkan
  behavior update/edit/hapus kalau ada laporan gagal simpan.
- `src/utils/AuditPoHelpers.ts` — tipe `AuditPoRow`, `AuditPoEditableFields`, `statusAuditMeta`
  (badge hijau/merah), `KATEGORI_OPTIONS`, `updateAuditPoKategori`, `updateAuditPoRow`,
  `deleteAuditPoRow`.
- Didaftarkan di `PAGE_REGISTRY` (`src/lib/permissions.ts`, key `audit_po`, group
  `'Audit AP Local'` — ini grouping utk matrix Kelola Role & Akses SAJA, TIDAK terkait dgn
  struktur submenu sidebar, lihat poin "Compare Doc" di bawah).
- **Tombol "Dashboard" + `DashboardModal`** (2026-09, tombol di panel filter, PALING KIRI —
  sempat dicoba di `ml-auto`/ujung kanan lebih dulu, DIGANTI atas permintaan user; panel filter
  halaman ini pakai `overflow-x-auto` bukan `flex-wrap` supaya tetap muat 1 baris di layar 14")
  — buka modal ringkasan poin ala slide internal "Document Test Overview" tim Cost Controller.
  Filter rentang tanggal (`created_at`, default 7 hari terakhir) → 3 angka + pie chart: **Total
  PO Running AI** = count baris dalam rentang, **Total PO Bermasalah** = count baris dalam
  rentang dgn `status_audit` TIDAK null, **Total PO Sesuai** = selisih keduanya (dihitung di
  frontend, bukan query terpisah). Fetch pakai `count: 'exact', head: true` (2 query paralel via
  `Promise.all`, tidak menarik data baris ke client) — kalau nanti breakdown per-kategori/per-PT
  ditambahkan, tetap pertahankan pola head-count ini, jangan fetch semua baris lalu hitung di JS.
  Pie chart pakai CSS `conic-gradient` murni (TIDAK ada library chart baru ditambahkan ke
  project — cek dulu `package.json` kalau mau, project ini belum punya recharts/d3/dst). Ornamen
  dekoratif (arc lingkaran pojok kiri-atas, mark diamond/chevron, dotted grid kanan, stripe
  segitiga hijau/kuning pojok bawah) murni CSS/SVG inline di dalam modal, meniru gaya visual
  slide aslinya — TIDAK ada logo Waruna (tidak ada file asset logo di `src/`, byline "Cost
  Controller" di slide asli diganti "Audit AP Local" biar konsisten dgn nama halaman ini). Blok
  judul & filter tanggal dikasih `pl-8` tambahan (2026-09) supaya teksnya tidak tertimpa ornamen
  arc/diamond di pojok kiri-atas. Ukuran modal & pie chart berubah beberapa kali sebelum versi
  FINAL (2026-09): `max-w-5xl`/`w-64 h-64` (awal) → dikecilkan ke `w-40 h-40` supaya muat 1 layar
  14" tanpa scroll → diperbesar ke `max-w-6xl`/`w-60 h-60` DENGAN list `w-64` + container
  `justify-center` (supaya pie "tidak mepet kanan") — TAPI versi `justify-center` ini ternyata
  malah bikin jarak list↔pie jadi kegedean/aneh & teks kelihatan tidak natural rata-kiri lagi
  (dikonfirmasi user dari screenshot, DIBATALKAN). **Versi final (2026-09)**: modal `max-w-4xl`, container `flex items-center gap-10 pl-8` (TANPA
  `justify-center`). List angka block SEKARANG lebar auto (bukan `w-56` fixed lagi) +
  `whitespace-nowrap` per `<li>` — supaya tiap baris ("Total PO Running AI : N Documents") SELALU
  1 baris, tidak ter-wrap 2 baris (masalah yg dikeluhkan user waktu list masih dipaksa `w-56`
  sempit). **Pie chart DIGANTI TOTAL dari CSS `conic-gradient` div ke SVG manual** (2026-09,
  meniru gaya "pointer-line callout" di slide asli persis, bukan cuma dot+teks di bawah pie lagi)
  — helper geometri `polarPoint`/`buildPieSlicePath` (di scope modul, atas `DashboardModal`)
  menghitung slice pie via `<path>` arc (sudut diukur SEARAH JARUM JAM dari jam 12, `angleDeg=0`
  di atas — SAMA dgn arah default CSS conic-gradient, sengaja disamakan biar warnanya konsisten
  kalau nanti mau dibanding-banding). Kasus 1 warna 100% di-`<circle>` biasa (arc SVG tidak bisa
  gambar lingkaran penuh 360° dari titik awal=akhir yg sama, makanya di-special-case). Slice
  dgn `pct <= 0.05` (nyaris 0%) SENGAJA TIDAK dirender callout-nya sama sekali (baik shape
  maupun garis+labelnya) — meniru screenshot referensi user yg cuma nampilin "PO Sesuai 100%"
  tanpa "PO Bermasalah 0%" sama sekali saat datanya semua sesuai. Garis callout: titik di tepi
  pie (`r`) → titik tekuk (`r+18`) → leader horizontal sepanjang 45px ke arah kanan/kiri
  (ditentukan dari posisi x titik tekuk vs pusat), lalu label 2 baris (nama tebal + persentase
  abu-abu) nempel di ujung leader, `textAnchor` menyesuaikan sisi kiri/kanan. Kalau nanti nambah
  breakdown pie 3 warna+ (bukan cuma sesuai/bermasalah), pola `slices` map ini generik & bisa
  diperpanjang array-nya, TIDAK perlu ubah helper geometri-nya.
  **Fix clipping label (2026-09)**: `viewBox`/`cx`/`r` awal (`400x280`, `cx=130`, `r=105`)
  ternyata KETERLALU SEMPIT di sisi kiri — label "PO Bermasalah" (slice kecil, muncul di sisi
  kiri lingkaran) kepotong krn garis callout+teksnya keluar dari batas SVG (margin kiri cuma
  `cx - r` = 25px, jauh dari cukup utk kink+leader+lebar teks). Sempat dinaikkan ke `620x300`/
  `cx=310,r=95` (modal ikut ke `max-w-6xl`) supaya tidak clip, TAPI modalnya jadi kelihatan
  kelewat lebar (dikeluhkan user) — **versi final**: `viewBox="0 0 570 300"`, `cx=285, cy=150,
  r=90` (dinaikkan sedikit dari `r=85` atas permintaan user, "perbesar sedikit lagi"), modal
  tetap `max-w-5xl` (tinggi/padding TIDAK diubah, cuma lebar pie). Margin simetris kiri/kanan
  `cx - r` = 195px, masih di atas reach maksimum callout (`kink(14) + leader(38) + gap(6) +
  lebar teks terpanjang "PO Bermasalah" ~120px` ≈ 178px < 195, buffer ~17px) jadi TIDAK clip.
  Kalau nanti label lebih panjang ditambahkan atau ukuran pie diubah lagi, HITUNG ULANG margin
  ini (`cx - r` harus tetap lebih besar dari total reach callout ke arah itu, sisakan buffer
  secukupnya) SEBELUM ubah lebar modal — itu 2x penyebab bug/komplain sebelumnya (clip krn
  margin kurang, lalu kelewat lebar krn overkompensasi). JANGAN pakai `justify-center` pada
  container list+pie ini lagi (sudah terbukti bikin layout aneh di percobaan sebelumnya), cukup
  sesuaikan `max-w-*` modal + lebar list/ukuran pie bareng² secara proporsional, dan tetap cek
  muat di layar 14" (`92vh` scroll fallback masih ada, tapi usahakan tidak sampai kepakai).
- **Filter tanggal panel utama** (2026-09, DISELARASKAN dgn gaya date-range filter Sea & Air di
  `SharedDataTable.tsx`) — dari 2 `<input type="date">` terpisah + teks "s/d" polos, diganti jadi
  1 pill (`CalendarDays` icon + 2 input tanggal + separator "–" + tombol clear `X` kalau salah
  satu terisi), pola & lebar input (`w-[100px]`) SAMA PERSIS dgn filter tanggal Audit/Rekapan
  Sea & Air. Tombol Refresh jadi ICON-ONLY (teks "Refresh" dihapus, tetap ada `title` attribute
  utk aksesibilitas/tooltip browser).

## Audit AP Overseas — duplikasi persis Audit AP Local, tabel beda (`src/pages/AuditPoOverseasPage.tsx`)

Dibuat 2026-09 atas permintaan user: "buat halaman baru yang kurang lebih sama seperti Audit AP
Local, tapi dari tabel yang berbeda" — jadi DUPLIKASI SENGAJA (bukan komponen generik/di-share),
supaya kedua halaman bisa berkembang independen tanpa risiko saling pengaruh. Kalau nanti ada
bug/fitur yang perlu diterapkan ke salah satu, JANGAN asumsikan otomatis ke-apply ke yang lain —
harus di-porting manual ke file satunya (dan sebaliknya).

- Tabel `audit_po_apovs_comp` (skema identik `audit_po_ap_comp` PLUS kolom `kategori` yang
  ditambah manual via SQL, lihat bawah — tabel aslinya dari user TIDAK punya kolom ini, beda dari
  `audit_po_ap_comp` yang sudah lebih dulu punya). Struktur & perilaku SAMA PERSIS dengan Audit
  AP Local: 5 kolom (`nama_pt`, `nomor_po`, `vendor_name`, `status_audit`, `kategori`) boleh
  dikoreksi manual, `nama_pt`/`nomor_po` READ-ONLY di modal Edit (ikut perilaku terbaru AP Local,
  bukan versi awal), kolom lain read-only murni hasil otomasi backend.
- `src/utils/AuditPoOverseasHelpers.ts` — duplikasi PERSIS `AuditPoHelpers.ts`, fungsi diberi
  suffix `Overseas` (`updateAuditPoOverseasKategori`, `updateAuditPoOverseasRow`,
  `deleteAuditPoOverseasRow`, type `AuditPoOverseasRow`/`AuditPoOverseasEditableFields`).
  `PT_OPTIONS` (di halaman) SAMA PERSIS dgn AP Local (dikonfirmasi user). `KATEGORI_OPTIONS`
  SEMPAT sama persis dgn AP Local juga, TAPI **DIGANTI TOTAL (2026-09, permintaan eksplisit
  user)** — daftar kategori Overseas BEDA dari AP Local (istilah bahasa Inggris/Impor: "DOKUMEN
  STOCK IN/PI", "IMPORT CALCULATION/LOGISTIC", "DESTINATION INDONESIA", "CUSTOMER NAME",
  "CURRENCY", "PN NUMBER", dst — bukan sekadar variasi kecil, daftar lengkapnya beda total dari
  AP Local yg masih Bahasa Indonesia/istilah lokal). **Sejak sini `KATEGORI_OPTIONS` TIDAK BOLEH
  disamakan otomatis lagi antara AuditPoHelpers.ts & AuditPoOverseasHelpers.ts** — dulu (sebelum
  2026-09 ini) kalau ada perubahan `KATEGORI_OPTIONS` di salah satu, wajar diporting ke yg lain
  krn memang sama; SEKARANG JANGAN, keduanya sudah sengaja berbeda isi kategori-nya, cuma pola
  UI-nya (combobox searchable, dst) yg tetap sama.
- Tombol Dashboard + `DashboardModal` (SVG pie callout dkk) — duplikasi PERSIS versi final AP
  Local per saat halaman ini dibuat, cuma judul sub-heading "Audit AP Overseas" & "# AP PO
  Overseas", query ke `audit_po_apovs_comp`. Kalau geometri pie/ukuran modal AP Local diubah
  lagi nanti, ingat porting manual ke sini juga kalau mau konsisten.
- Tombol "Preview PDF"/"Hasil Audit" + `PreviewModal`/`buildDrivePreviewSrc` (2026-09) — ikut
  diporting bareng dari AP Local (user minta fiturnya di AP Local, diterapkan juga ke sini
  proaktif biar 2 halaman ini tetap konsisten sesuai prinsip duplikasi di atas) — lihat detail
  lengkap & catatan verifikasi di bagian "Audit AP Local" di atas.
- Page_key `audit_po_overseas`, route `/audit-po-overseas`, group PAGE_REGISTRY `'Audit AP
  Overseas'` (`src/lib/permissions.ts`, generik lewat `PAGE_GROUPS` jadi otomatis muncul di
  matrix Kelola Role & Akses tanpa perubahan tambahan di `RoleManagementPage.tsx` — grouping ini
  cuma utk matrix, TIDAK terkait struktur submenu sidebar, lihat poin "Compare Doc" di bawah).
  **Bug ditemukan & diperbaiki saat menambahkan halaman ini**: `MainLayout.tsx` penentu tab
  sidebar aktif (`activeMainTab`) tadinya pakai `location.pathname.startsWith(t.basePath)` polos
  — karena `/audit-po-overseas` diawali string `/audit-po`, tanpa fix ini halaman Overseas akan
  salah ke-highlight. Diperbaiki jadi helper `pathBelongs` (exact match atau diikuti `/`) —
  detail lengkapnya sekarang ada di poin "Compare Doc" di bawah karena helper ini dipakai lagi
  & diperluas di sana.
- SQL setup (dijalankan user langsung di Supabase SQL editor, TIDAK disimpan sbg file di `sql/`,
  sama pola dgn migration Audit AP Local sebelumnya):
  ```sql
  alter table public.audit_po_apovs_comp add column if not exists kategori text;
  alter table public.audit_po_apovs_comp enable row level security;
  create policy "audit_po_apovs_comp_select" on public.audit_po_apovs_comp
    for select using (public.has_page_access('audit_po_overseas'));
  create policy "audit_po_apovs_comp_insert" on public.audit_po_apovs_comp
    for insert with check (public.has_edit_access('audit_po_overseas'));
  create policy "audit_po_apovs_comp_update" on public.audit_po_apovs_comp
    for update using (public.has_edit_access('audit_po_overseas'))
    with check (public.has_edit_access('audit_po_overseas'));
  create policy "audit_po_apovs_comp_delete" on public.audit_po_apovs_comp
    for delete using (public.has_edit_access('audit_po_overseas'));
  ```
  **BELUM TERVERIFIKASI sudah dijalankan di Supabase production** (sama seperti catatan kolom
  `kategori` di Audit AP Local) — cek dulu sebelum mengandalkan filter Kategori atau proteksi
  edit/hapus di halaman ini kalau ada laporan gagal simpan atau data bisa diedit tanpa akses.

## Struktur menu sidebar "Compare Doc" (`src/components/MainLayout.tsx`, 2026-09)

`MAIN_TABS` — Bunker, Audit AP Local, dan Audit AP Overseas DULUNYA 3 tab top-level terpisah di
sidebar, digabung atas permintaan user jadi 1 menu induk **"Compare Doc"** (icon `GitCompare`)
dengan 3 submenu (pola sama seperti Courier/Sea & Air yang sudah lebih dulu punya submenu).
Route masing-masing (`/bunker`, `/audit-po`, `/audit-po-overseas`) & page_key-nya TIDAK berubah
sama sekali — murni reorganisasi tampilan sidebar, `PAGE_REGISTRY`/RLS/halaman-nya sendiri tetap
apa adanya.

- `id: 'compare_doc'`, `path: '/bunker'` (tujuan default kalau tombol menu induk sendiri
  diklik), `basePath: '/compare-doc'` — **`basePath` ini SENGAJA dummy/tidak match route
  manapun**, beda dari Courier/Sea & Air yang subtab-nya berbagi 1 basePath asli (`/courier`,
  `/sea-air`). Bunker/Audit AP Local/Audit AP Overseas TIDAK berbagi prefix path yang senada
  (`/bunker` vs `/audit-po` vs `/audit-po-overseas`), jadi basePath induk tunggal tidak bisa
  dipakai utk deteksi "submenu compare_doc sedang aktif".
- Karena itu, logic `activeMainTab` (penentu highlight tab di sidebar) DIPERLUAS: sebelumnya cuma
  cek `pathBelongs(pathname, t.basePath)`, SEKARANG kalau tab itu punya `subTabs`, ikut dicek
  juga `t.subTabs.some(s => pathBelongs(pathname, s.path))`. Helper `pathBelongs(pathname, base)`
  = `pathname === base || pathname.startsWith(base + '/')` (bukan `startsWith` polos — ini fix
  bug yg sama dgn yg ditemukan pas nambah Audit AP Overseas, `/audit-po` adalah prefix string
  dari `/audit-po-overseas`). Kalau nanti nambah grup submenu campuran serupa (path-nya tidak
  senada), pastikan basePath induknya tetap dummy & pola pengecekan subTabs ini yang dipakai,
  BUKAN nyoba paksa basePath asli salah satu subtab jadi basePath induk (bakal salah highlight
  submenu lain yang path-nya beda).
- Icon `Fuel`/`ClipboardCheck`/`Globe2` (dulu dipakai Bunker/Audit AP Local/Audit AP Overseas
  sbg tab top-level) DIHAPUS dari import `MainLayout.tsx` krn submenu di app ini TIDAK
  menampilkan icon per-item (cuma label + dot indicator, lihat rendering `subTabs.map` di file
  ini) — kalau nanti mau submenu punya icon lagi, baru re-add.
- `PAGE_REGISTRY` groups (`'Bunker'`, `'Audit AP Local'`, `'Audit AP Overseas'`, dipakai matrix
  Kelola Role & Akses) SENGAJA TIDAK ikut digabung — itu concern terpisah dari struktur visual
  submenu sidebar ini, biar PIC tetap bisa lihat & atur akses per modul dgn jelas di halaman
  Kelola Role & Akses walau tampilannya di sidebar sekarang nested.

## Peta tabel Supabase (per modul, dari grep `.from(...)` di seluruh `src/`)

**Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`.

**Courier**: `rekapan_courier`, `tabel_audit_pib`, `tabel_audit_cn`, `tabel_cost_validasi`,
`dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`,
`tabel_processing_queue`. View `v_pib_lengkap`/`v_cn_lengkap` (join `tabel_audit_pib`/`tabel_audit_cn`
↔ `dokumen_checklist`) MASIH ADA di Supabase tapi TIDAK DIPAKAI LAGI di frontend sejak 2026-09 —
halaman Courier Audit sekarang query langsung ke `tabel_audit_pib`/`tabel_audit_cn`, lalu kolom
`status_kelengkapan`/`dokumen_kurang`/`pct_kelengkapan`/`total_mandatory*`/`ada_*` di-merge manual
di JS dari `dokumen_checklist` lewat helper `mergeChecklistData()` (`SharedDataTable.tsx`, dipakai di
`fetchRecords` & `getExportData`). Merge ini cocokkan `pib_id`/`cn_id` = `id` (cabang fallback lama
`awb`-only di view sudah dead code, sudah dicek 0 baris `dokumen_checklist` dengan `pib_id`/`cn_id`
NULL per 2026-09) — kalau suatu saat ada baris `dokumen_checklist` yang `pib_id`/`cn_id`-nya NULL
lagi, `mergeChecklistData` TIDAK akan menemukannya (beda dari behavior lama view).

**Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`,
`dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`,
`kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`.

**FAR Overseas Air (Direct Loading)**: `rekapan_far_overseas_air`,
`cost_validasi_far_overseas_air`, `far_overseas_tarif_vendor`, `far_overseas_signer_config`,
`far_overseas_air_processing_queue`.

**Bunker**: `bunker_dokumen`, `bunker_processing_queue`.

**Audit AP Local**: `audit_po_ap_comp` (diisi otomasi backend).

**Audit AP Overseas**: `audit_po_apovs_comp` (diisi otomasi backend, duplikasi struktur `audit_po_ap_comp` — lihat bagian "Audit AP Overseas" di atas).

**Admin/rate master (Courier)**: `tabel_rate_sheet_dhl`, `tabel_rate_sheet_fedex`,
`tabel_surcharge_dhl`, `tabel_surcharge_fedex`, `tabel_surcharge_rule` (CIPL),
`tabel_zone_mapping`, `tabel_ppjk_cost_rule`, `tabel_fuel_surcharge`.

**Lain-lain**: `v_audit_trail` (view gabungan buat halaman Audit Trail).

## Peta RPC function Supabase (dari grep `.rpc(...)`)

- Auth: `get_my_access()`.
- FAR Overseas Air: `update_rekapan_far_overseas_manual`,
  `update_cost_validasi_far_overseas_manual`, `fn_delete_far_overseas_air`,
  `upsert_tarif_far_overseas_vendor`, `nonaktifkan_tarif_far_overseas_vendor`.
- Sea & Air: `insert_seaair_row`, `update_seaair_row`, `update_rekapan_po_vessel`,
  `update_validasi_matriks_manual`, `update_cost_validasi_manual`, `get_kurs_efektif`,
  `upsert_kurs_rule_vendor`, `upsert_kurs_bi`, `nonaktifkan_tarif_kontrak`.
- Courier cost validation (`CostValidationModal.tsx`): `fn_hitung_storage`,
  `fn_save_storage_estimate`, `fn_update_actual_value`, `fn_apply_credit_note`,
  `fn_recompute_totals`, `fn_revise_credit_note`.

Tidak ada akses DB langsung dari sesi Claude Code manapun sejauh ini — semua daftar di atas
disimpulkan dari pemanggilan di kode frontend, BUKAN dari `information_schema` Supabase. Kalau
ragu soal signature/param exact suatu RPC, cek dulu ke Supabase (SQL editor) sebelum ubah
pemanggilannya, terutama untuk param yang baru ditambahkan sisi frontend (lihat catatan
`p_catatan` di atas).
