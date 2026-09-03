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
- Ikon: `lucide-react`. Server kecil (`server.ts`, Express) hanya untuk proxy upload ke n8n
  (`/api/n8n-proxy-start`) — bukan backend data utama.
- Verifikasi standar setelah edit: `npx tsc --noEmit` (harus bersih, tidak ada error).

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
- **`<Greeting />`** (`src/components/Greeting.tsx`) — sapaan "Selamat pagi/siang/sore/malam,
  {nama}" + ikon waktu + tanggal. Satu sumber kebenaran, dipasang di HAMPIR SEMUA halaman
  (kecuali `/login`). Jangan duplikat logic `getGreetingMeta` lagi di file lain.
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
    disimpan sekaligus lewat `updateAuditPoRow(id, updates)`.
  - `DeleteAuditPoModal` — pola sama persis `DeleteConfirmModal` di `BunkerPage.tsx`, konfirmasi
    dulu sebelum `deleteAuditPoRow(id)` (hard delete permanen).
- Pagination **server-side** (`.select('*', { count: 'exact' }).range(...)`) karena tabel terus
  bertambah — beda dari kebanyakan halaman admin lain di app ini yang client-side paginated.
  Filter: search (debounced 400ms) ke `nomor_po`/`vendor_name` via `.ilike`, dropdown `nama_pt`
  (single-select, opsi hardcode: AMT/GMI/TTP/MJS/WSI/WNS/GENERAL — cek ulang ke DB kalau ada PT
  baru), dropdown `status_audit` (2 nilai tetap: "Selesai Diproses"/"Doc tidak terbaca"), rentang
  tanggal `created_at`.
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
- Didaftarkan di `PAGE_REGISTRY` (`src/lib/permissions.ts`, key `audit_po`, group baru
  `'Audit AP Local'`) dan `MAIN_TABS` (`src/components/MainLayout.tsx`, icon `ClipboardCheck`)
  sebagai menu top-level sendiri (bukan submenu Courier/Sea & Air).

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

**Audit AP Local**: `audit_po_ap_comp` (read-only dari app ini, diisi otomasi backend).

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
