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

## RBAC (role & akses per halaman)

Sudah diimplementasikan (lihat `sql/001_rbac_and_bunker_rls.sql`, `sql/002_direct_loading_rls.sql`):
- Tabel `roles`, `user_roles`, `role_page_access` — role "Admin" (`is_protected=true`) selalu
  akses penuh, di-hardcode di function `is_admin()`, tidak lewat `role_page_access`.
- `src/lib/permissions.ts` — `PAGE_REGISTRY` satu sumber kebenaran daftar `page_key` (dipakai
  sidebar, route guard, halaman Kelola Role & Akses). Tambah halaman baru → daftarkan di sini.
- `src/components/RequirePageAccess.tsx` — route guard, prop `pageKey` atau `adminOnly`.
- `AuthContext` panggil RPC `get_my_access()` sekali saat login → `{is_admin, page_keys}`.
- RLS baru HANYA diterapkan ke tabel yang sebelumnya belum ada RLS (terutama Bunker & FAR
  Overseas/Direct Loading) — tabel lama Courier/Sea & Air TIDAK di-retrofit (di luar scope waktu
  itu).

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
- **RPC-only mutation** — JANGAN pernah `.update()`/`.insert()` mentah ke 2 tabel ini. Selalu
  lewat `update_rekapan_far_overseas_manual(p_id, p_updates)` dan
  `update_cost_validasi_far_overseas_manual(p_id, p_document_validation?, p_cost_validation?,
  p_status?, p_rate_row_used?, p_catatan?)`. **`p_catatan` param BELUM terverifikasi ada di
  fungsi Postgres-nya** (ditambahkan sisi frontend, belum ada akses DB langsung untuk konfirmasi
  — cek dulu sebelum mengandalkan behavior ini di production).
- `src/utils/FarOverseasAirHelpers.ts` — `computeExpectedFromRate`, `computeCostStatus`,
  `parseRouteNote`, `matchOctagonTarif` (REPLIKA PERSIS logic matching tarif n8n — filter
  berjenjang jenis layanan→origin→tujuan→berat, "lunak" — kalau diubah, HARUS tetap sinkron
  dengan n8n, jangan diubah sepihak di frontend saja).
- Vendor **OCTAGON LOGISTIC**: origin/tujuan bisa dikoreksi manual via edit `route_note`, lalu
  cost validation dihitung ulang otomatis (lihat `reMatchOctagonAfterRouteNoteEdit` di
  `FarOverseasAirPage.tsx`). Vendor **Jianqiao**: rute selalu tetap China→Jakarta, tidak perlu
  re-matching origin/tujuan.
- Kolom `po_list` (jsonb array di `rekapan_far_overseas_air`, tipe `PoListEntry` di
  `FarOverseasAirHelpers.ts`) tiap entry punya `po_no_raw` & `vessel_raw` — ini SATU-SATUNYA
  sumber pasangan PO↔Vessel yang presisi baris-per-baris. `vessel_internal_note` cuma string
  ringkas nama-nama kapal (digabung " + "), TIDAK ada info nomor PO di teks itu lagi — JANGAN
  di-parse buat breakdown. Di List Memo (`FarOverseasAirPage.tsx`), kolom **NO PO** & **VESSEL**
  berbagi 1 state expand (`expandedPoRows`/`togglePoExpanded`, tombol toggle ada di kolom NO PO
  saja) — saat expanded, keduanya render baris-per-baris dari `po_list` (bukan
  `vessel_internal_note`), sejajar per index, baris dengan `vessel_raw` null tampil `"-"` (tidak
  di-skip, supaya urutan tetap 1:1 dengan No PO).

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
`tabel_processing_queue`, view `v_pib_lengkap`, `v_cn_lengkap`.

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
