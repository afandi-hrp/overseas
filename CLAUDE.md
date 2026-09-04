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

- **Kolom AWB — beda perilaku SENGAJA antara Audit Courier & Rekapan Courier** (2026-09,
  dikonfirmasi user, JANGAN disatukan lagi jadi 1 perilaku):
  - **Audit Courier** (`PIB_COLS`/`CN_COLS`, kolom `awb` TANPA `type` → masuk cabang `!c.type` di
    `getCellData()`, ~baris 1364) — tampil **APA ADANYA** dari `tabel_audit_pib`/`tabel_audit_cn`,
    termasuk prefix carrier ("DHL NO."/"FEDEX No.") kalau memang begitu tersimpan di database.
  - **Rekapan Courier** (`COURIER_COLS`, kolom `awb` diberi `type: 'awb_strip_carrier'`, cabang
    sendiri di `getCellData()`) — prefix carrier ("DHL NO."/"FEDEX No.") DIBUANG dari tampilan
    (regex `.replace(/^(DHL|FEDEX)\s*NO\.?\s*:?\s*/i, '')`), cuma nomornya saja yang tampil. Mode
    edit inline TETAP tampilkan/edit nilai mentah (tidak ikut di-strip) — stripping ini MURNI
    kosmetik tampilan read-only, sama pola dengan `ppjk` (buang prefix "OWN").
  - Filter/normalisasi serupa (`replace(/^(DHL|FEDEX).../)`) juga ADA & SENGAJA DIBIARKAN di
    `ValidasiModal.tsx`/`ValidasiHelper.ts` — itu utk internal matching/lookup AWB ke
    `tabel_audit_pib`, BUKAN utk display, jadi tidak termasuk cakupan 2 poin di atas.
- **Filter tanggal Audit Courier (`filterStartDate`/`filterEndDate`)** — SUDAH berdasarkan kolom
  `tgl_ppjk` (label kolom "PPJK Date") utk `courier_audit` (PIB maupun CN, lihat query ~baris
  3017-3031 & export ~baris 3322-3329/3373-3382) — BUKAN `created_at`/kolom lain. Beda dgn
  Courier Rekapan yang pakai `tgl_terima_email`. Kalau nanti ada laporan filter tanggal "salah
  kolom" lagi di Audit Courier, cek dulu apa benar row yang dimaksud `tgl_ppjk`-nya kosong/beda
  dari yang diharapkan user (data issue), bukan otomatis asumsi kode filternya yang salah.
- **Padding halaman `<header>`/`<main>`** (~baris 3864/3881, 2026-09) — dikecilkan dari `px-6` ke
  `px-3` (kiri-kanan simetris karena `px-*` = padding kedua sisi) atas laporan user: di laptop
  14", panel filter toolbar (`overflow-x-auto`) Audit Courier kepotong sampai tab **CN** (kadang
  **PIB**) tidak kelihatan tanpa scroll horizontal — dropdown Company sudah dikecilkan duluan
  (lihat poin di bawah) tapi masih kurang, jadi margin kiri (jarak ke sidebar)/kanan halaman ikut
  dipersempit juga. Berlaku ke SEMUA tab yang dirender lewat komponen ini (Courier/Sea & Air/Audit
  Trail), bukan cuma Audit Courier — kalau nanti ada laporan halaman lain jadi kurang lega,
  pertimbangkan trade-off ini.
- **Dropdown Company Audit Courier** (`activeCourierImporAnFilter`, ~baris 4158) — lebar
  dikecilkan dari `max-w-[160px]` ke `w-[70px]` lalu ke **`w-[48px]`** (2026-09, laporan sama
  seperti di atas, dipersempit 2x krn tab CN masih kepotong di iterasi pertama) + `truncate` —
  nama company panjang otomatis terpotong `...`, isi `<option>` tetap lengkap (cuma tampilan
  trigger-nya yang dipotong).
- **Input tanggal panel filter** (`filterStartDate`/`filterEndDate`, ~baris 4007/4014, dipakai
  Courier/Sea & Air Audit/Rekapan + Audit Trail) — lebar tiap input dikecilkan dari `w-[100px]`
  ke `w-[82px]` (2026-09, bagian dari iterasi kedua pelebaran ruang toolbar Audit Courier) — ikut
  ke SEMUA tab yang pakai filter tanggal ini (bukan cuma Audit Courier), karena satu style class
  yang sama dipakai berulang di tempat itu.
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
- **Layout `RoleManagementPage.tsx` dirapikan (2026-09)** — makin banyak halaman/role/user
  terdaftar, 2 panel (matrix akses & daftar user) bisa jadi sangat panjang ke bawah. Fix:
  - **Matrix "Akses Halaman per Role"**: tiap grup (`PAGE_GROUPS`) sekarang bisa di-collapse
    satu-satu (state `collapsedGroups: Set<string>`, tombol toggle di header grup + chevron),
    plus tombol "Ciutkan Semua"/"Bentangkan Semua" di pojok kanan atas panel. Container tabelnya
    dikasih `max-h-[520px] overflow-auto` + header (`<thead>`) `sticky top-0` (dobel sticky
    dengan kolom pertama yg sudah `sticky left-0` dari awal) — jadi walau daftar halaman panjang,
    tinggi panel di halaman TIDAK ikut membengkak tanpa batas, tinggal scroll di dalam kotaknya,
    nama role tetap kelihatan pas scroll ke bawah.
  - **"Role per User"**: list user dibungkus `max-h-[420px] overflow-y-auto` (sebelumnya scroll
    ikut halaman penuh, bisa sangat panjang kalau user banyak) — search box yg sudah ada
    (`userSearch`) TETAP di luar kotak scroll ini (selalu kelihatan). Counter kecil ditambah di
    kedua panel ("N halaman · M grup", "N dari M user") supaya PIC langsung tau skala datanya
    tanpa perlu scroll/hitung manual.
  - Kalau nanti nambah lagi elemen yg berpotensi jadi panjang di halaman ini (mis. daftar role
    kalau nanti jumlahnya banyak), ikuti pola yg sama: kotak dgn `max-h-*` + `overflow-y-auto`
    + header/kolom kunci `sticky`, bukan biarkan mengalir bebas ke bawah halaman.
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
- **"Jabatan approval" per USER, PER HALAMAN (2026-09, VERSI FINAL #2 — dipakai FAR Overseas Air
  sekarang, dirancang generik utk modul approval lain di masa depan, lihat bagian FAR Overseas
  Air di bawah utk detail alur Direct Loading-nya)** — riwayat desain (SEMUA versi sebelumnya
  SUDAH DIGANTI, jangan reintroduce yang manapun): (1) `roles.approval_tier` per-role — salah
  paham dari maksud user; (2) `profiles.approval_tier` per-user tapi 1 kolom GLOBAL (cuma cukup
  utk 1 modul approval) — user lalu bilang ke depan bakal ada approval berjenjang di halaman lain
  dgn jabatan beda (mis. "SPV" di Direct Loading tapi "Manager" di Bunker), jadi 1 kolom global
  tidak cukup. **Desain final**: tabel `user_approval_tiers` (`user_id`, `page_key`, `tier`, PK
  gabungan `(user_id, page_key)` — 1 user MAKSIMAL 1 jabatan PER HALAMAN, tapi BEBAS beda-beda
  jabatan di halaman berbeda) NEMPEL LANGSUNG di user, TERPISAH TOTAL dari role RBAC manapun —
  jabatan di halaman X baru **"berfungsi"** kalau user itu JUGA punya role (role apa saja) yang
  kasih akses edit ke halaman X (2 syarat INDEPENDEN per halaman, harus sama-sama terpenuhi:
  gating ganda `canEdit(pageKey) && canApproveTier(pageKey, step)`, lihat `AuthContext.tsx` &
  `FarOverseasAirDetailModal.tsx`). Daftar tier & label yang VALID per halaman (vocab BEBAS beda
  per halaman, tidak perlu sama kayak TIER1/PIC/TIER2/TIER3-nya Direct Loading) SATU SUMBER
  KEBENARANNYA `PAGE_REGISTRY[].approvalTiers` (`src/lib/permissions.ts`) — halaman baru yang mau
  punya approval berjenjang TINGGAL isi field `approvalTiers` di entry `PAGE_REGISTRY`-nya,
  `RoleManagementPage.tsx` OTOMATIS nambah 1 dropdown baru utk halaman itu tanpa perlu ubah kode
  di file itu (lihat `APPROVAL_TIER_PAGES` export). **BELUM DIJALANKAN ke Supabase production —
  WAJIB dijalankan manual dulu di SQL editor sebelum fitur approval bisa dipakai sama sekali**
  (tanpa ini, query `user_approval_tiers` di `RoleManagementPage.tsx` akan error tabel tidak ada,
  dan RPC `get_my_approval_tiers()` di bawah juga belum ada):
  ```sql
  create table if not exists public.user_approval_tiers (
    user_id uuid not null references public.profiles(id) on delete cascade,
    page_key text not null,
    tier text not null,
    primary key (user_id, page_key)
  );
  alter table public.user_approval_tiers enable row level security;
  -- FIX (2026-09) -- versi PERTAMA lupa bikin policy sama sekali, akibatnya RLS nolak SEMUA
  -- akses langsung ke tabel ini (termasuk dari RoleManagementPage.tsx yang pakai
  -- .from('user_approval_tiers') langsung, BUKAN lewat RPC, utk select/upsert/delete) -- dropdown
  -- "Jabatan Approval" kelihatan tapi gagal tersimpan. Policy ini WAJIB ada: admin boleh
  -- select/insert/update/delete BEBAS (dipakai RoleManagementPage.tsx), user biasa boleh SELECT
  -- baris miliknya sendiri saja (jaga-jaga kalau nanti ada UI non-admin yang perlu baca
  -- langsung -- SAAT INI baca normal tetap lewat RPC get_my_approval_tiers, bukan lewat ini).
  create policy "Admins manage user_approval_tiers" on public.user_approval_tiers
    for all
    using (public.is_admin())
    with check (public.is_admin());
  create policy "Users read own approval tiers" on public.user_approval_tiers
    for select
    using (auth.uid() = user_id);

  create or replace function public.get_my_approval_tiers()
  returns jsonb
  language sql
  security definer
  stable
  as $$
    select coalesce(jsonb_object_agg(uat.page_key, uat.tier), '{}'::jsonb)
    from public.user_approval_tiers uat
    where uat.user_id = auth.uid();
  $$;

  grant execute on function public.get_my_approval_tiers() to authenticated;
  ```
  (Kalau sempat menjalankan versi `roles.approval_tier` atau `profiles.approval_tier` dari
  iterasi sebelumnya, kolom itu aman dibiarkan nganggur/di-drop manual — tidak dipakai lagi di
  kode manapun.)
  SENGAJA dibuat sebagai RPC **BARU/TERPISAH** (`get_my_approval_tiers()`), BUKAN nambah field ke
  `get_my_access()` yang sudah ada — supaya tidak perlu menulis ulang body `get_my_access()` yang
  sudah kritikal & battle-tested tanpa akses DB langsung utk verifikasi isi aslinya (resikonya
  kalau salah tebak logic-nya, bisa lock-out semua user dari semua halaman).
  - `src/lib/AuthContext.tsx` — panggil RPC ini di `fetchAccess()` (paralel dgn `get_my_access()`),
    expose `approvalTiersByPage: Record<string, string>` (`page_key` → `tier`, BUKAN `Set<string>`
    datar lagi seperti versi 1-kolom-global) + helper `canApproveTier(pageKey, tier)` (`isAdmin`
    selalu lolos di semua halaman tanpa perlu baris `user_approval_tiers`). Fail-closed kalau RPC
    belum ada di Supabase (objek kosong `{}`, BUKAN diam-diam boleh semua) — TAPI karena
    `fetchAccess` tidak return-early lagi kalau panggilan `get_my_access()` gagal (lihat kode),
    akses halaman biasa tetap jalan normal meski RPC approval_tiers ini belum ada, cuma fitur
    approve-nya yg nonaktif (tombol tidak pernah muncul kecuali Admin).
  - `src/lib/permissions.ts` — `PageEntry.approvalTiers?: {value, label}[]` (opsional, array =
    urutan rantai approval dari awal ke akhir), `APPROVAL_TIER_PAGES` (filter `PAGE_REGISTRY` yang
    py `approvalTiers` terisi, dipakai `RoleManagementPage.tsx` render dropdown-nya).
  - `src/pages/RoleManagementPage.tsx` — 1 dropdown kecil "Jabatan Approval" PER HALAMAN di
    `APPROVAL_TIER_PAGES` untuk TIAP BARIS USER (panel "Role per User", BUKAN di panel "Daftar
    Role") — kalau baru 1 halaman (`direct_loading`) yang py `approvalTiers`, cuma 1 dropdown yang
    tampil; nanti nambah otomatis begitu ada halaman lain didaftarkan. Handler
    `updateUserApprovalTier(profile, pageKey, tier)` — `tier` kosong (opsi "—") berarti `.delete()`
    baris `user_approval_tiers` user itu utk halaman itu, `tier` terisi berarti `.upsert()`
    (`onConflict: 'user_id,page_key'`). TIDAK ADA pengecualian khusus utk Admin di sini — dropdown
    tetap muncul & BERPENGARUH di baris user manapun termasuk yang py role Admin, KARENA
    `canApproveTier` SENGAJA tidak punya bypass `isAdmin` (2026-09, permintaan eksplisit user:
    "admin tidak bisa bebas melakukan approval") — user Admin TETAP HARUS di-assign jabatan
    approval-nya sendiri lewat dropdown ini kalau mau bisa approve tahap manapun. Ini beda dari
    `canEdit`/akses halaman biasa yang Admin TETAP selalu bypass (`is_admin()` hardcode akses
    penuh, tidak berubah) — HANYA gating approval-tier yang tidak lagi otomatis lolos utk Admin.
  - **Enforcement server-side (2026-09) — RPC `approve_far_overseas_air`**: approval SEKARANG
    lewat RPC ini (`SECURITY DEFINER`), BUKAN lagi `.update()` langsung ke
    `rekapan_far_overseas_air` (versi sebelumnya cuma gating frontend, itu jadi RIWAYAT — sudah
    DIGANTI, jangan reintroduce `.update()` langsung utk approval). RPC-nya **BELUM DIJALANKAN ke
    Supabase production — WAJIB dijalankan manual dulu** (kalau belum, tombol approve akan error
    "function does not exist" begitu diklik):
    ```sql
    create or replace function public.approve_far_overseas_air(
      p_id uuid,          -- SESUAIKAN tipe ini kalau `rekapan_far_overseas_air.id` BUKAN uuid
                           -- (cek dulu di Table Editor Supabase -- belum ada akses DB langsung
                           -- utk konfirmasi tipe PK-nya, uuid dipilih krn paling umum di app ini)
      p_step text,         -- 'TIER1' | 'PIC' | 'TIER2' | 'TIER3'
      p_nama text,
      p_jabatan text default null
    )
    returns jsonb
    language plpgsql
    security definer
    as $$
    declare
      v_current_status text;
      v_expected_status text;
      v_new_status text;
      v_entry_tier_text text;
      v_entry jsonb;
      v_new_approvals jsonb;
    begin
      if not public.has_edit_access('direct_loading') then
        raise exception 'Not authorized to edit FAR Overseas Air memos';
      end if;

      if p_step not in ('TIER1', 'PIC', 'TIER2', 'TIER3') then
        raise exception 'Invalid approval step: %', p_step;
      end if;

      -- Jabatan approval NEMPEL DI USER PER HALAMAN (user_approval_tiers), BUKAN di role &
      -- BUKAN 1 kolom global -- lihat catatan "Jabatan approval per USER, PER HALAMAN" di atas.
      -- 'direct_loading' hardcode di sini krn RPC ini KHUSUS utk modul FAR Overseas Air -- RPC
      -- approval modul lain (kalau nanti dibuat) filter page_key masing-masing. Guard
      -- has_edit_access di atas SUDAH menangani syarat "user ini punya role dgn akses edit ke
      -- halaman" (syarat ke-2). SENGAJA TIDAK ADA bypass `is_admin()` di sini (2026-09,
      -- permintaan eksplisit user) -- Admin TETAP harus punya baris user_approval_tiers yang
      -- cocok utk bisa approve, sama kayak user lain. JANGAN tambahkan lagi
      -- `not public.is_admin() and` di depan exists ini.
      if not exists (
        select 1 from public.user_approval_tiers uat
        where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = p_step
      ) then
        raise exception 'You do not have the % approval role', p_step;
      end if;

      select approval_status into v_current_status
      from public.rekapan_far_overseas_air
      where id = p_id
      for update;

      if not found then
        raise exception 'Memo not found: %', p_id;
      end if;

      v_expected_status := case p_step
        when 'TIER1' then 'PENDING'
        when 'PIC' then 'TIER1_DONE'
        when 'TIER2' then 'PIC_DONE'
        when 'TIER3' then 'TIER2_DONE'
      end;

      if v_current_status is distinct from v_expected_status then
        raise exception 'This memo is not currently awaiting the % step (current status: %)', p_step, v_current_status;
      end if;

      v_new_status := case p_step
        when 'TIER1' then 'TIER1_DONE'
        when 'PIC' then 'PIC_DONE'
        when 'TIER2' then 'TIER2_DONE'
        when 'TIER3' then 'APPROVED'
      end;

      v_entry_tier_text := case p_step when 'PIC' then 'PIC' when 'TIER1' then '1' when 'TIER2' then '2' when 'TIER3' then '3' end;

      v_entry := case p_step
        when 'PIC' then jsonb_build_object('tier', 'PIC', 'nama', p_nama, 'jabatan', 'PIC', 'approved_at', now(), 'user_email', auth.email())
        when 'TIER1' then jsonb_build_object('tier', 1, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
        when 'TIER2' then jsonb_build_object('tier', 2, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
        when 'TIER3' then jsonb_build_object('tier', 3, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
      end;

      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      into v_new_approvals
      from jsonb_array_elements(
        coalesce((select approvals from public.rekapan_far_overseas_air where id = p_id), '[]'::jsonb)
      ) elem
      where (elem->>'tier') is distinct from v_entry_tier_text;

      v_new_approvals := v_new_approvals || jsonb_build_array(v_entry);

      update public.rekapan_far_overseas_air
      set approval_status = v_new_status,
          approvals = v_new_approvals
      where id = p_id;

      return jsonb_build_object('approval_status', v_new_status, 'approvals', v_new_approvals);
    end;
    $$;

    grant execute on function public.approve_far_overseas_air(uuid, text, text, text) to authenticated;
    ```
    Guard 3-lapis di dalamnya: (1) `has_edit_access('direct_loading')`, (2) user (atau
    `is_admin()`) harus punya baris `user_approval_tiers` dgn `page_key='direct_loading'` &
    `tier = p_step`, (3) `approval_status` SAAT INI harus PERSIS
    status "menunggu tahap ini" (`v_expected_status`, dgn `for update` row lock supaya 2 approval
    bersamaan tidak balapan) — kalau salah satu gagal, function `raise exception` (client terima di
    `error.message`). Function ini yang MENENTUKAN `approval_status`/`approvals` baru (bukan
    dihitung di client) — `handleApprove` di `FarOverseasAirDetailModal.tsx` pakai APA ADANYA hasil
    `returns jsonb` dari RPC ini (`{approval_status, approvals}`) buat update state lokal, TIDAK
    menghitung ulang sendiri, supaya client selalu sinkron persis dengan hasil di DB. `jabatan`
    (teks role utk tampilan tanda tangan, mis. "Manager Finance") & `nama` masih dikirim dari
    client (bukan divalidasi/di-derive ulang di RPC) — ini AMAN karena keduanya murni teks
    kosmetik utk memo cetak, bukan bagian keputusan otorisasi (yang divalidasi adalah `p_step`
    lewat `user_approval_tiers`, bukan `p_nama`/`p_jabatan`).

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
- ✅ **Bunker** (`src/pages/BunkerPage.tsx` + `src/components/BunkerUploadModal.tsx`/
  `BunkerKelengkapanModal.tsx`/`BunkerCompareDocModal.tsx`/`BunkerAuditLogModal.tsx` +
  `src/utils/BunkerHelpers.ts`) — SELESAI penuh (2026-09). Termasuk semua toast/error message,
  judul modal, tombol, placeholder, label field, header tabel (Kapal→Vessel, Lokasi→Location,
  Aksi→Action, dst), pesan error upload (`humanizeUploadError`), `friendlyDbError`. Label
  tampilan (BUKAN key/value DB) juga ditranslate: `SUMMARY_STATUS_META`/`STATUS_WORKFLOW_META`
  (`summaryStatusMeta`/`workflowMeta` di `BunkerHelpers.ts` — KEY jsonb/DB seperti
  `'LOLOS VERIFIKASI'`/`'BUTUH REVIEW'`/`'BARU'`/`'DIPROSES'`/`'DISETUJUI'`/`'DIBAYAR'` TIDAK
  diubah, cuma `label`-nya: Lolos Verifikasi→Passed Verification, Butuh Review→Needs Review,
  Baru→New, Diproses→In Progress, Disetujui→Approved, Dibayar→Paid), `KELENGKAPAN_LABELS`/
  `MATRIX_COLUMN_LABELS` (Faktur Pajak→Tax Invoice, Kwitansi→Receipt, Berita Acara→Official
  Report, Hasil Lab→Lab Results — istilah dokumen bisnis umum, BUKAN singkatan resmi kepabeanan
  spesifik semacam PPJK/PIB yang dipertahankan apa adanya per aturan translasi poin 2 di atas).
  **SENGAJA TIDAK disentuh** (data/matching logic yang baca teks dari database/backend, bukan
  label tampilan statis): `resolveAcuanColumnKey()` (cocokkan `acuan_label` dari backend, masih
  Indonesia), `isWrongRowMismatch()` di `BunkerCompareDocModal.tsx` (regex cocokkan teks
  `summary.mismatches` dari backend), dan format `"{field} — Lama: X → Baru: Y"` yang ditulis
  `logBunkerAudit()`/dibaca `splitAuditCatatan()` (`BunkerAuditLogModal.tsx`) — ini format
  PERSISTEN yang sudah kepakai di data historis `audit_trail`, ubah kata "Lama"/"Baru"-nya
  butuh migrasi data + sinkron ulang regex parser-nya, DI LUAR cakupan translasi UI murni (kalau
  nanti mau diubah, lakukan sengaja & terpisah, bukan collateral dari task translasi lain).
  `field_label` yang DIKIRIM ke `logBunkerAudit()` (mis. "Manual Confirmation: ...", "Manual
  Notes") sudah Inggris utk entri BARU — entri lama tetap Indonesia (riwayat, tidak diubah).
- ✅ `src/pages/AccountPage.tsx` (Akun Saya) — SELESAI penuh (2026-09): judul halaman "Akun
  Saya"→"My Account" + subjudul, label field (Nama→Name), placeholder input (Nama
  lengkap→Full name, Minimal 6 karakter→At least 6 characters, Ulangi password baru→Repeat new
  password), tombol (Simpan→Save, Menyimpan...→Saving..., Ganti Password→Change Password,
  Ubah Password→Change Password, Memproses...→Processing...), label Password Baru/Konfirmasi
  Password Baru→New Password/Confirm New Password, semua pesan sukses/error inline. Key internal
  `'sukses'`/`'gagal'` pada state message TIDAK diubah (cuma dipakai utk pilih warna teks, bukan
  teks tampilan).
- ✅ `src/pages/RoleManagementPage.tsx` (Kelola Role & Akses) — SELESAI penuh (2026-09): judul
  halaman + subjudul, judul 3 panel ("Daftar Role"→"Role List", "Akses Halaman per
  Role"→"Page Access per Role", "Role per User"→"Roles per User"), tombol/label (Tambah
  Role→Add Role, Bentangkan/Ciutkan Semua→Expand/Collapse All, Bawaan→Built-in, kolom
  Halaman→Page), placeholder input, semua toast sukses/error, confirm dialog hapus role, tooltip
  checkbox akses/EDIT-VIEW & dropdown jabatan approval, empty state "Tidak ada user
  ditemukan"→"No users found", "(tanpa nama)"→"(no name)".
  Label jabatan approval Direct Loading di `PAGE_REGISTRY` (`permissions.ts`) disamakan
  Inggris-nya dgn `STEP_LABEL` di `FarOverseasAirDetailModal.tsx` ("Exim (Disiapkan
  Oleh)"→"Prepared By (Exim)", "Direktur"→"Director"). Susulan (2026-09, permintaan user): grup
  di matrix "Akses Halaman per Role" defaultnya CIUTKAN semua (`collapsedGroups` init
  `new Set(PAGE_GROUPS)`, sebelumnya default terbentang semua), tinggi baris matrix & baris grup
  diperbesar sedikit (`py-2`→`py-3.5`/`py-3`).
  **Panel "Roles per User" dirombak jadi tabel matrix (2026-09, permintaan user "mempercantik
  panel ini")** — SEBELUMNYA layout 1 baris per user berisi pill button per role (klik toggle) +
  dropdown jabatan approval di sebelahnya, TIDAK KONSISTEN visual dgn panel "Page Access per
  Role" di atasnya. SEKARANG pola tabelnya PERSIS sama dgn panel itu: sticky kolom pertama (nama
  + email user), header sticky, checkbox bulat emerald per kolom role (`toggleUserRole`
  tidak berubah logic-nya, cuma pembungkus visualnya jadi `<td>`/tombol checkbox, bukan pill).
  Kolom dropdown jabatan approval (`APPROVAL_TIER_PAGES`, kalau ada) ditaruh SEBELUM kolom-kolom
  role, tetap `<select>` (bukan checkbox, krn nilainya bukan boolean) — value dropdown sekarang
  cukup label tier-nya saja (`opt.label`) tanpa prefix nama halaman lagi (dulu
  `"{page.label}: {opt.label}"`) krn sudah ada di header kolom (`{page.label} Approval`), jadi
  tidak perlu diulang. Badge "No role assigned" (dulu muncul di baris user tanpa role) DIHAPUS --
  di tabel matrix, user tanpa role cukup kelihatan dari semua kolom role-nya kosong (unchecked),
  tidak perlu badge terpisah lagi.
- **Entry `direct_loading` di `PAGE_REGISTRY` — `label` & `group` diganti ke "FAR Overseas"
  (2026-09, koreksi user: nama tampilnya di RBAC selama ini masih "Direct Loading", padahal
  halamannya sendiri sudah "FAR Overseas" di sidebar & semua tempat lain)** — sebelumnya
  `label: 'Direct Loading', group: 'Direct Loading'`. `key` (`'direct_loading'`) & `path`
  (`/direct-loading`) TETAP TIDAK DIUBAH (identifier teknis/route, dipakai di kode & RLS/RPC
  Supabase — mengubahnya butuh migrasi lebih luas, di luar cakupan koreksi nama tampil ini) — pola
  sama seperti `AuditPoPage`/`audit_po` yang nama teknisnya beda dari label yang ditampilkan
  ("Audit AP Local"). `PageEntry['group']` (union type) & `PAGE_GROUPS` array ikut diganti
  `'Direct Loading'`→`'FAR Overseas'` supaya header grup collapsible di matrix "Page Access per
  Role" juga ikut konsisten. Efeknya otomatis nyebar ke: matrix akses (nama grup & label baris),
  dropdown "Jabatan Approval" panel "Roles per User" (header kolom jadi "FAR Overseas Approval").
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
  "Approval" (state `approvalFilter`: `ALL`/`TIER1`/`PIC`/`TIER2`/`TIER3`, urutan dropdown SENGAJA
  ikut urutan rantai approval), tiap opsi selain ALL nunjukin COUNT total memo yang pending di
  level itu (state `approvalCounts`, dihitung `fetchApprovalCounts`). Karena rantai approval
  sekarang WAJIB berurutan (lihat subbagian "Approval berjenjang" di bawah), SEMUA level filter
  map ke `approval_status` kolom biasa lewat `APPROVAL_FILTER_STATUS` (`TIER1`→`PENDING`,
  `PIC`→`TIER1_DONE`, `TIER2`→`PIC_DONE`, `TIER3`→`TIER2_DONE`) — server-side `.eq()` murni,
  TIDAK ADA lagi filter/paginate manual di JS (versi sebelum PIC masuk rantai utama SEMPAT begitu,
  karena PIC dulu independen dari `approval_status` — sudah tidak berlaku). `fetchApprovalCounts`
  dipanggil sekali di awal + lewat helper `refreshList` (dipanggil dari `onChanged`
  `FarOverseasAirDetailModal` & tombol Refresh) supaya count-nya ikut update begitu ada
  approve/reject/delete.
- **Approval berjenjang WAJIB berurutan: Prepared By (Exim) → PIC → SPV → Director** (2026-09,
  VERSI FINAL — GANTI TOTAL dari 2 versi sebelumnya: pertama PIC independen tanpa gating jabatan,
  lalu PIC independen TAPI dengan approval terpisah; keduanya SUDAH TIDAK BERLAKU, jangan
  reintroduce). `approval_status` sekarang py 5 nilai berurutan: `PENDING` (nunggu Prepared
  By) → `TIER1_DONE` (nunggu PIC) → `PIC_DONE` (nunggu SPV) → `TIER2_DONE` (nunggu Director) →
  `APPROVED`. Semua logic state machine ada di `FarOverseasAirDetailModal.tsx`:
  `nextStepForStatus(status)` (tentukan tahap berikutnya dari status saat ini),
  `STEP_ENTRY_TIER`/`STEP_STATUS_AFTER`/`STEP_LABEL`/`STEP_ACTION_LABEL` (mapping per tahap).
  `handleApprove(step, nama)` SELALU update `approval_status` (beda dari versi PIC-independen
  lama yang skip update status utk tahap PIC) + append 1 entry `{tier, nama, jabatan,
  approved_at, user_email}` ke `approvals` (tier utk PIC tetap string `'PIC'`, tier1/2/3 tetap
  number, supaya `entryFor(1)`/`entryFor(2)`/`entryFor(3)`/`entryFor('PIC')` & tampilan
  signature table tidak perlu berubah). Kolom tanda tangan cetak TETAP cuma 3 (Disiapkan Oleh /
  Diperiksa Oleh x2) — nama PIC TETAP digabung ke kolom "Disiapkan Oleh" bareng nama Exim
  (`disiapkanNama`, format `"{exim}/{pic}"`), TIDAK PERNAH jadi kolom tanda tangan sendiri.
  **Gating siapa yang boleh approve tahap yang sedang aktif**: 2 syarat INDEPENDEN — `canEditDirectLoading`
  (akses edit halaman, dari role RBAC manapun) DAN `canApproveTier('direct_loading', step)` dari
  `useAuth()` (user itu SENDIRI — bukan role-nya — harus py baris `user_approval_tiers` utk
  halaman `direct_loading` yang tier-nya PERSIS cocok tahap itu, lihat subbagian "Jabatan
  approval per USER, PER HALAMAN" di bagian RBAC atas — governance/skema datanya
  didokumentasikan di sana, bukan di sini). Kalau
  user py akses edit tapi jabatannya tidak cocok, tombol approve TIDAK muncul, diganti pesan
  penjelas "You don't have the '{tahap}' approval role for this step." (bukan disembunyikan
  total tanpa penjelasan). **Data lama (sebelum fitur ini) berpotensi tidak konsisten** — memo
  yang sudah `APPROVED`/lanjut ke tahap tinggi dari sebelum ada tahap PIC di rantai TIDAK
  otomatis punya entry PIC di `approvals`-nya (tidak ada migrasi data retroaktif), jadi kolom
  "Disiapkan Oleh" utk memo lama itu cuma nampilin nama Exim tanpa PIC — ini WAJAR utk data lama,
  bukan bug.
  **Nama approver tahap PIC TIDAK BISA diketik manual** (2026-09, permintaan user) — di
  `ApprovalConfirmModal`, field "Approver Name" untuk step `'PIC'` dirender READ-ONLY (teks
  statis, bukan `<input>`), SELALU ikut `defaultNamaForStep('PIC')` (= `profile?.nama ||
  user?.email`, nama user yang sedang login) — beda dari tahap TIER1/TIER2/TIER3 yang tetap
  boleh diedit bebas (approver-nya bisa beda dari yang login, mis. admin approve atas nama orang
  di `signer_config`). Kalau nanti nambah tahap approval baru (di modul manapun) yang juga mau
  perilaku "auto dari nama login, tidak bisa diketik", ikuti pola `nameEditable` di
  `ApprovalConfirmModal` ini.
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
- **PIC** — kolom manual `pic_name` (text, mirip `buyer_name`, ada di `REKAPAN_EDITABLE_FIELDS` &
  editable inline di List Memo lewat kolom "PIC") TETAP ADA sebagai fallback nama sebelum
  di-approve. Nama PIC ditampilkan digabung bersebelahan dengan nama Exim di kolom "Disiapkan
  Oleh" (bukan kolom tanda tangan sendiri) — untuk alur approval PIC yang sebenarnya (sekarang
  bagian rantai WAJIB berurutan Exim→PIC→SPV→Director, BUKAN lagi independen), lihat subbagian
  **"Approval berjenjang WAJIB berurutan"** di atas (RBAC/`FarOverseasAirDetailModal.tsx`) — versi
  ini SUDAH 2x diganti total dari pendekatan sebelumnya, jangan reintroduce versi lama manapun.
  Kolom **BUYER** (`buyer_name`) ditambahkan di List Memo bersebelahan dengan PIC (2026-09) —
  sebelumnya `buyer_name` cuma tampil di memo cetak, sekarang juga editable inline di List Memo
  (sudah ada di `REKAPAN_EDITABLE_FIELDS` dari awal).
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
     **FIX (2026-09, laporan user "badge Doc Validation 0% semua, tidak sinkron dgn halaman
     Dokumen Validasi")**: `tabel_checklist_validasi` CUMA keisi kalau seseorang PERNAH buka
     `ValidasiModal.tsx` (Doc Validation) dan klik Simpan (insert/update manual di
     `handleSaveValidasi`, ~baris 1001-1013 — BUKAN diisi otomatis oleh n8n). Jadi mayoritas baris
     yang belum pernah dibuka modalnya TIDAK punya baris sama sekali di situ — awalnya badge-nya
     selalu 0% BUKAN karena skornya beneran 0%, tapi karena datanya belum pernah dihitung. Fix:
     ditambah FALLBACK live-calc di `fetchCourierValidationBadgePct()` (~baris 929) utk pib_id/
     cn_id yang tidak ketemu di `tabel_checklist_validasi` — REPLIKA PERSIS logic fallback yang
     sudah lebih dulu ada di `CourierValidasiPage.tsx` (fetch `dokumen_validasi.data_validasi_raw`
     per pib_id/cn_id yang hilang, lalu `SECTIONS`/`computeStatus`/`generateValues`/
     `calculatePibStats`, sama seperti `needsCalculation` branch di halaman itu). **JANGAN tulis
     ulang formula fallback ini lagi di tempat ketiga** — kalau perlu diubah, cek dulu apakah
     `CourierValidasiPage.tsx` juga perlu diubah bareng biar tetap sinkron.
     Badge tampil `0%` (bukan disembunyikan) HANYA kalau setelah fallback pun tetap tidak ada
     data sama sekali (baris `dokumen_validasi` jenis itu juga tidak ketemu) — kebijakan sama
     dgn Sea & Air.
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

## Bunker — badge persentase Match & Riwayat Perubahan per baris (2026-09)

- **Badge persentase "Match" di banner modal Compare Doc + badge di tombol "Compare Doc" list**
  (`BunkerCompareDocModal.tsx`/`BunkerPage.tsx`) — `computeMatrixMatchStats()`
  (`src/utils/BunkerHelpers.ts`) SATU-SATUNYA sumber kebenaran hitungan Match/Warning/Mismatch +
  persentase, dari `row_status` tiap baris `matrix_perbandingan` (baris tanpa `row_status` tidak
  ikut jadi penyebut, sama pola dgn "Overall Accuracy" Cost Validation Courier/Sea & Air). Dipakai
  2 tempat: (1) banner ringkasan atas modal (jumlah Match/Warning/Mismatch + progress bar warna
  hijau ≥90%/kuning ≥60%/merah di bawahnya), (2) badge bulat pojok kanan-atas tombol "Compare
  Doc" di tiap baris List Bunker (`r.matrix_perbandingan` sudah ikut ke-fetch dari `select('*')`
  yang sudah ada, TIDAK perlu query tambahan). Kalau formula/threshold warnanya diubah, ubah di
  `computeMatrixMatchStats()` saja, JANGAN hitung ulang manual di 2 tempat itu.
- **Riwayat Perubahan per baris** (tombol "Riwayat" baru di panel Aksi List Bunker,
  `BunkerPage.tsx`, buka `BunkerAuditLogModal.tsx`) — mencatat SIAPA/KAPAN/APA YANG DIUBAH utk
  3 titik edit yang ada di `BunkerCompareDocModal.tsx`: Status Workflow, Catatan Manual (via
  `handleSave`), dan Konfirmasi Manual per field (`ConfirmMatchCell` submit/cancel). **SENGAJA
  PAKAI ULANG tabel `audit_trail` yang sudah ada** (yang sama dibaca halaman "Audit Trail" global
  lewat `v_audit_trail`, lihat `TRAIL_TABLES.BUNKER` di `SharedDataTable.tsx`) — dikonfirmasi user
  2026-09, supaya TIDAK menambah tabel audit-trail baru lagi. **Kolom ASLI tabel `audit_trail`
  (dikonfirmasi via `information_schema.columns` 2026-09): `id`, `created_at`, `tabel`, `action`,
  `awb`, `no_dokumen`, `jenis`, `user_email`, `catatan` — TIDAK ADA kolom `deskripsi`/`old_value`/
  `new_value` terpisah (percobaan pertama pakai kolom `deskripsi` GAGAL run-time, "column
  audit_trail.deskripsi does not exist" — `deskripsi` cuma label kolom tampilan di `TRAIL_COLS`
  utk halaman Audit Trail global via view `v_audit_trail`, BUKAN nama kolom fisik tabel
  `audit_trail` aslinya).** Kolom yang dipakai: `tabel` (selalu `'bunker_dokumen'`), `jenis`
  (`'BUNKER'`), `action` (`'UPDATE'`), `no_dokumen` (diisi `no_po` baris itu — **KUNCI filter
  riwayat balik ke 1 baris**, karena tabel ini tidak punya kolom `record_id` eksplisit; valid krn
  kontrak data "1 baris bunker_dokumen = 1 No PO" yang sudah ada dari awal), `user_email`, dan
  `catatan` — SEMUA info (nama field + nilai lama/baru) digabung jadi SATU string di `catatan`
  (satu-satunya kolom bebas yang ada), format tetap `"{field_label} — Lama: {old} → Baru:
  {new}"`, di-parse balik oleh `splitAuditCatatan()` di `BunkerAuditLogModal.tsx` utk ditampilkan
  terpisah (nama field jadi header, lama/baru jadi 2 kotak warna) — fallback tampil apa adanya
  kalau formatnya tidak cocok. Dicatat LANGSUNG dari aplikasi (fungsi `logBunkerAudit()`/
  `fetchBunkerAuditLog()` di `BunkerHelpers.ts`), BUKAN trigger DB — app yang paling tau nilai
  lama & baru persis tanpa perlu logic diff di Postgres. Baris yang belum/tidak punya `no_po`
  DILEWATI (tidak nulis log) drpd nyasar ke riwayat baris lain yang `no_po`-nya sama-sama null.
  **BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu** (tanpa ini, insert
  riwayat dari `logBunkerAudit()` akan gagal diam-diam kena RLS, dan/atau tombol "Riwayat" bisa
  kosong utk user yang tidak punya akses halaman Audit Trail terpisah):
  ```sql
  -- Insert riwayat LANGSUNG dari browser (bukan service role n8n) -- scoped SUPAYA user cuma
  -- bisa insert baris bertanda tabel='bunker_dokumen', tidak bisa menyuntik entri utk modul lain.
  create policy "audit_trail_insert_bunker_app" on public.audit_trail
    for insert
    with check (tabel = 'bunker_dokumen' and public.has_edit_access('bunker'));

  -- SELECT tambahan (permissive, di-OR dgn policy SELECT yang sudah ada) -- supaya user yang
  -- PUNYA akses halaman Bunker TAPI TIDAK PUNYA akses halaman Audit Trail terpisah (page_key
  -- berbeda) tetap bisa buka tombol "Riwayat" per baris di List Bunker.
  create policy "audit_trail_select_bunker_app" on public.audit_trail
    for select
    using (tabel = 'bunker_dokumen' and public.has_page_access('bunker'));
  ```
  **BELUM TERVERIFIKASI**: definisi persis policy SELECT `audit_trail` yang sudah ada sebelumnya
  (dibuat waktu modul Audit Trail global dulu dibangun) — belum ada akses DB langsung utk
  konfirmasi apakah policy tambahan di atas akan tumpang tindih/duplikat scope dgn yang sudah ada
  (Postgres OR-kan semua policy permissive utk command yang sama, jadi seharusnya aman ditambah,
  tapi tetap cek dulu sebelum run kalau ragu).

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

## Customize View — Audit Courier & Rekapan Courier (`src/components/SharedDataTable.tsx`, 2026-09)

Fitur pilih kolom mana yang tampil di tabel, TERPISAH untuk 2 menu: Audit Courier & Rekapan
Courier (Sea & Air, Validasi, Audit Trail TIDAK ikut cakupan ini).

- **Sumber daftar kolom** (SESUAI PRINSIP "pakai kolom yang sudah ada, jangan bikin daftar
  baru"): `COURIER_AUDIT_CUSTOMIZABLE_COLS` (~setelah `COURIER_COLS`) = gabungan dedup-by-key
  dari `PIB_COLS` + `CN_COLS` — 1 preferensi berlaku ke SEMUA sub-tipe tab Audit (PIB/CN/Draft),
  kalau suatu kolom hasil hide tidak ada di sub-tipe yang aktif otomatis tidak berpengaruh
  (aman, tidak perlu preferensi terpisah per sub-tipe). `COURIER_REKAPAN_CUSTOMIZABLE_COLS` =
  langsung dari `COURIER_COLS`. Kolom `index` ("No.") dikeluarkan dari daftar — selalu tampil,
  tidak bisa disembunyikan; kolom `Action` (sticky) juga tidak termasuk cakupan fitur ini.
- **Penyimpanan preferensi**: localStorage (BUKAN tabel Supabase baru — ini murni preferensi
  tampilan, bukan data bisnis, jadi disepakati tidak perlu migrasi SQL), key
  `beehive_customize_view:${user.id}:courier_audit` / `:courier_rekapan` (per-user via `user.id`
  dari `useAuth()`, per-menu via key terpisah). **Konsekuensi yang disadari**: preferensi TIDAK
  sinkron lintas device/browser (khas localStorage) — kalau nanti user minta sinkron lintas
  device, perlu upgrade ke tabel Supabase baru (belum diimplementasikan, sengaja localStorage
  dulu krn lebih simpel & sudah memenuhi requirement "per-user per-menu" as-is).
- **State**: `courierAuditHiddenCols`/`courierRekapanHiddenCols` (`Set<string>`, isi = kolom yang
  DI-HIDE, kosong = default/semua tampil — ini definisi "kondisi default" karena SEBELUM fitur
  ini semua kolom memang selalu tampil apa adanya, tidak ada konsep hidden-by-default di tabel
  manapun di app ini). Di-init dari localStorage via `loadHiddenCols()`, di-reload ulang lewat
  `useEffect` kalau `user?.id` berubah (ganti akun di browser yang sama).
- **`CustomizeViewModal`** (komponen baru, ditaruh setelah `DeleteModal`) — modal generik terima
  `title`/`allCols`/`hiddenKeys`/`onCancel`/`onSave`, dipakai bareng utk kedua menu (Audit &
  Recap) lewat prop yang beda. State pending (`pendingHidden`) LOKAL di dalam modal — perubahan
  checkbox TIDAK langsung ter-apply ke tabel, harus klik "Save" (App requirement #5). Tombol
  "Reset to Default" cuma mengosongkan `pendingHidden` (= semua tercentang) di dalam modal, TETAP
  butuh klik "Save" sesudahnya utk benar-benar ter-apply & tersimpan (bukan auto-save). Search
  bar filter list berdasar `label` (case-insensitive substring), tidak mempengaruhi apa yang
  sudah tercentang/tidak. Tombol "Uncheck All" (2026-09, di footer sebelah "Reset to Default",
  SEMPAT dicoba jadi link kecil di bawah search bar dulu — dipindah atas permintaan user) —
  meng-uncheck SEMUA kolom di `allCols` (bukan cuma hasil filter search saat ini), berguna utk
  mulai dari kosong lalu user tinggal cari & centang beberapa kolom yang diinginkan saja.
- **Penerapan ke tabel**: `activeCols` (variable existing yang menentukan daftar kolom aktif per
  tab) **TETAP UTUH/tidak difilter** — masih dipakai apa adanya utk `EditModal`/`AddRowModal`/
  Export (`ExportModal`), supaya field yang disembunyikan dari TAMPILAN TABEL tetap bisa diedit
  & tetap ikut ter-export. Variable BARU `visibleCols` (dihitung sesudah `activeCols`) = filter
  `activeCols` buang key yang ada di hidden-set, HANYA saat `activeSubTab` adalah `courier_audit`/
  `courier_rekapan` (tab lain `visibleCols === activeCols`, tidak berubah). `visibleCols` dipakai
  GANTI `activeCols` di 3 tempat: `<thead>` (`activeCols.map` → `visibleCols.map`), prop
  `cols={...}` di `CourierAuditRowGroup`, dan `cols={...}` di `CourierRekapanRowGroup` — supaya
  header & isi baris tetap sejajar. Row-group lain (`SeaAirAuditRowGroup`/`SeaAirRekapanRowGroup`/
  `DataRow` default) TIDAK disentuh, tetap pakai `activeCols` penuh.
  **Kalau fitur ini nanti diperluas ke tab lain (mis. Sea & Air), WAJIB ikuti pola yang sama:
  jangan filter `activeCols` itu sendiri (akan ikut memfilter Edit/Add/Export), buat
  `visibleCols` terpisah dan cuma pasang di thead + row-group yang relevan.**
- Tombol toolbar "Customize View" (icon `SlidersHorizontal`, dekat tombol Refresh) muncul kalau
  `activeSubTab` courier_audit/courier_rekapan — SENGAJA TIDAK digate `canEdit()`, karena ini
  preferensi tampilan pribadi (bukan aksi mengubah data), semua role yang bisa lihat halaman ini
  boleh customize tampilannya sendiri.

## Highlight baris Submit Date — Rekapan Courier (`CourierRekapanRowGroup`, 2026-09)

Baris di tabel **Recap Courier** (SEMUA tab All PPJK/DHL/FEDEX & semua pilihan Company) diberi
warna latar kalau kolom `submit_date`-nya terisi (tidak null/kosong) — murni penanda visual,
TIDAK ada perubahan data, teks, label, ikon, bold, tooltip, atau notifikasi apa pun.

- `hasSubmitDate = !!String(effectiveRec.submit_date ?? '').trim()` (dihitung dari `effectiveRec`
  — record yang SUDAH digabung dengan pending edit yang belum disimpan, sama seperti tampilan sel
  lain di komponen ini — jadi warnanya juga ikut update live kalau user sedang mengedit
  `submit_date` di mode edit massal/per-baris, walau ini bonus di luar scope awal yang cuma minta
  konsisten lintas sort/filter/pagination/search).
- Style: `bg-[#FFF5C5]` (kuning muda) + `border-l-[3px] border-l-[#E6C25C]` (aksen emas, gelap
  dari base) di `<tr>`. Hover jadi `hover:bg-[#F5E28F]` (sedikit lebih gelap, BUKAN hilang/ketutup
  warna hover biru biasa `hover:bg-blue-50/30`) — kalau `hasSubmitDate` true, seluruh kombinasi
  bg/hover lain (mode edit massal `bg-blue-50/50`, baris ke-2+ hasil split PO `bg-slate-50/40`)
  DIABAIKAN, kuning SELALU menang (row-level ternary tunggal di `rowBgClass`, bukan menumpuk
  banyak class bg sekaligus yg hasilnya tidak terprediksi krn cuma 1 declaration bg yg menang di
  CSS). **Riwayat warna (2026-09, JANGAN reintroduce versi lama)**: ungu solid
  (`#F1E7F1`/`#5A305A`) → coral solid (`#FBE4DD`/`#F3D0C4`/`#E0724E`) → gradient kuning→coral
  (`linear-gradient(90deg,#FFF5C5_0%,#F58C77_100%)`) → **VERSI FINAL: kuning solid `#FFF5C5`**
  (permintaan user berturut-turut, gradient-nya "tidak cocok"). `#FFF5C5`/`#F5E28F` KEBETULAN
  sama persis dgn `auditHighlightClass` yang sudah lebih dulu ada di `SeaAirRekapanRowGroup`
  (~baris 2286, penanda `audit_status === 'LENGKAP'`, fitur BEDA & TIDAK terkait) — hanya
  kebetulan warna yang sama, bukan style yang di-share/reuse antar 2 fitur ini.
- **2 tempat tambahan yang HARUS ikut disesuaikan warnanya, kalau tidak baris highlight akan
  "bolong" putih di tengah/kanan**: (1) `additionalClasses` utk kolom pertama saat PO di-split &
  expanded (`bg-white group-hover:bg-blue-50/30` → jadi `bg-[#FFF5C5] group-hover:bg-[#F5E28F]`
  kalau `hasSubmitDate`); (2) kolom **Action** sticky kanan (`bg-white group-hover:bg-slate-50` →
  jadi `bg-[#FFF5C5] group-hover:bg-[#F5E28F]` kalau `hasSubmitDate`) — keduanya render `<td>`
  dgn bg eksplisit sendiri yg SECARA VISUAL menutupi bg `<tr>` di area itu kalau tidak ikut
  disesuaikan.
- Badge `INVOICE TYPE` (Freight/Duty/Credit Note, `type: 'invType'` di `getCellData()`) tetap
  render span dgn warna badge sendiri di atas background kuning baris (badge invType SEKARANG
  py warna per jenis sejak susulan 2026-09 di bawah, TIDAK lagi cuma amber/sky polos — tetap
  konsisten kontras di atas background kuning highlight ini krn warnanya beda kategori).
- **Cakupan SENGAJA cuma `CourierRekapanRowGroup`** — `CourierAuditRowGroup`/
  `SeaAirAuditRowGroup`/`SeaAirRekapanRowGroup` (3 komponen lain yg py pola `additionalClasses`
  sama persis, ditemukan lewat grep saat implementasi) TIDAK ikut disentuh, request-nya cuma utk
  halaman Invoice Recap Courier.
- **App ini TIDAK punya dark mode** (dicek: 0 pemakaian class `dark:` di seluruh `src/`) — jadi
  warna solid `#FFF5C5`/`#E6C25C`/`#F5E28F` dipakai apa adanya tanpa varian `dark:`. Kalau nanti
  app beneran nambah dark mode, style highlight ini WAJIB direvisit (kontras kuning muda di atas
  background gelap kemungkinan besar tidak terbaca).

### Badge warna per jenis Invoice Type (`getCellData()`, `type: 'invType'`, 2026-09 susulan)

Sebelumnya badge kolom **INVOICE TYPE** cuma bedain 2 warna (`DUTY` = amber, SELAIN itu = sky
biru polos — jadi Freight/Credit Note Duty/Credit Note Freight semuanya keliatan sama birunya).
Diganti jadi warna per jenis (permintaan user, dari screenshot yang nunjukin badge biru itu
ketimpa/kurang kontras di atas highlight baris kuning `#FFF5C5` di atas):
- `FREIGHT` → `bg-[#F58C77] text-white` (coral)
- `DUTY` → `bg-[#F5E28F] text-[#5A305A]` (kuning lebih gelap dari highlight baris `#FFF5C5`,
  biar tetap ada beda kontras walau baris ybs juga lagi ke-highlight kuning)
- `CREDIT NOTE DUTY` & `CREDIT NOTE FREIGHT` → `bg-[#5A305A] text-white` (ungu brand)
- Value lain yang tidak dikenali (fallback) → tetap `bg-sky-100 text-sky-700` (perilaku lama)

Deteksi jenis via `String(rec.invoice_type ?? '').toUpperCase()` lalu `.includes('CREDIT NOTE')`
(dicek PALING DULU, sebelum cek `DUTY`/`FREIGHT` exact-match, supaya "CREDIT NOTE DUTY" tidak
kepental ke cabang `DUTY` biasa) — case-insensitive, tahan variasi casing data dari Gemini/n8n.
Ini kolom `getCellData()` generik (dipakai di banyak tempat lewat `COURIER_COLS`), TIDAK
dibatasi cuma render di `CourierRekapanRowGroup` — tapi `invoice_type`/`type: 'invType'` sejauh
ini CUMA ada di `COURIER_COLS` (Rekapan Courier), jadi secara praktis efeknya cuma kelihatan di
situ.

### Export Excel Rekapan Courier — PO PT IMI/PO Non IMI/Vessel TIDAK di-split lagi (`src/components/ExportModal.tsx`, 2026-09)

Export Excel di halaman **Rekapan Courier** (Invoice Recap) SEBELUMNYA memecah 1 shipment jadi
BANYAK baris Excel kalau `po_pt_imi`/`vessel` punya lebih dari 1 nilai (mis. 4 PO → 4 baris
Excel, kolom lain di-merge/`mergeCells` supaya kelihatan 1 kesatuan) — pola ini REPLIKA dari
split serupa yang sudah lebih dulu ada utk Rekapan Sea & Air (`po_detail`, array JSON per-PO).
**Diganti (permintaan user, dikonfirmasi HANYA utk Rekapan Courier — TIDAK menyentuh Sea & Air
Rekapan yang split-nya TETAP jalan seperti biasa)**: kolom `po_pt_imi`/`po_shipping`/`vessel`
(& `breakdown_courier_adm_vessel`/`breakdown_duty_vessel`/`breakdown_freight_vessel`/
`breakdown_bm_vessel`/`breakdown_ppnpph_vessel`) sekarang SELALU 1 baris per shipment di export,
persis apa adanya nilai kolom di DB (yang MEMANG sudah tersimpan ter-gabung tanda `"+"`, mis.
`"PO123 + PO456"` — beda dari Sea & Air yang PO/vessel-nya tidak ada sbg kolom teks langsung,
cuma ada di `po_detail` JSON, jadi Sea & Air tetap butuh proses split/rebuild).
- `getSplitRows()` di `ExportModal.tsx` — cabang `splitByPoDetail === 'courier_rekapan'`
  DIHAPUS, sekarang SELALU `return null` kalau bukan `'sea_air_rekapan'`, jatuh ke jalur baris
  normal (`buildCellValue(item, c, undefined, false)`, baca `item[c.key]` apa adanya).
  `parseCourierPoVesselPairs()` & `COURIER_REKAPAN_SPLIT_REPEATING_COLS` (helper khusus split
  Courier yg jadi dead code) DIHAPUS TOTAL, bukan cuma dibiarkan nganggur.
- `SharedDataTable.tsx` masih mengirim prop `splitByPoDetail="courier_rekapan"` ke `ExportModal`
  saat export dari tab Rekapan Courier (TIDAK diubah, sengaja dibiarkan) — value ini SEKARANG
  cuma dipakai sbg penanda "bukan sea_air_rekapan" (selalu jatuh ke `return null`), tidak error
  apa pun kalau dikirim, tapi kalau nanti mau bersih-bersih total boleh juga dihapus dari
  pemanggilnya (di luar scope perubahan ini, sengaja tidak disentuh biar diff minimal).
- Preview tabel di dalam modal (bagian atas `ExportModal.tsx`, `data.slice(0, 10)`) TIDAK
  pernah melakukan split sama sekali (baca `row[c.key]` langsung) — jadi preview-nya dari awal
  SUDAH selalu 1 baris per shipment, tidak ada perubahan tampilan preview krn fix ini.

### Export Excel Rekapan Courier — highlight `submit_date` ikut ke Excel (`applySubmitDateHighlight`, 2026-09)

Susulan dari fix split di atas: baris yang di aplikasi kelihatan kuning (highlight
`submit_date` terisi, lihat bagian "Highlight baris Submit Date — Rekapan Courier" di atas)
SEKARANG juga kuning di file Excel hasil export — baris yang putih di aplikasi tetap putih di
Excel, TIDAK ada perubahan lain (angka/teks/format kolom tetap apa adanya).
- `applySubmitDateHighlight(row, item)` di `ExportModal.tsx` (dekat `applyNumberFormat`) —
  replika warna PERSIS dari highlight on-screen (`bg-[#FFF5C5]` → ARGB Excel `FFFFF5C5`), pakai
  `row.eachCell({ includeEmpty: true }, cell => cell.fill = {...})` supaya SELURUH kolom di
  baris itu ke-warnai (bukan cuma kolom yang kebetulan punya nilai).
- Dipanggil di jalur baris normal (`data.forEach` di `handleExport`, setelah `applyNumberFormat`)
  — cukup di situ SAJA krn jalur `splitRows` (dipakai Sea & Air Rekapan) sudah tidak pernah
  aktif lagi utk `courier_rekapan` sejak fix split sebelumnya (lihat section di atas), jadi
  SEMUA baris Rekapan Courier pasti lewat jalur normal ini.
- Guard `splitByPoDetail !== 'courier_rekapan'` di baris pertama function — memastikan fitur ini
  CUMA aktif utk export Rekapan Courier, TIDAK ikut mewarnai export Sea & Air Rekapan/Audit
  Courier/lain-lain yang kebetulan lewat komponen `ExportModal` yang sama.
- Kalau nanti warna highlight on-screen (`#FFF5C5`, lihat section "Highlight baris Submit Date")
  diganti lagi, WAJIB disinkronkan ke sini juga (ganti literal ARGB `FFFFF5C5`) — supaya
  aplikasi & hasil export tidak beda warna.

## Edit Massal — Audit Courier & Rekapan Courier (`src/components/SharedDataTable.tsx`, 2026-09)

Fitur baru: banyak baris bisa punya perubahan (kolom BEDA-BEDA per baris) yang belum disimpan
sekaligus, disimpan bareng lewat 1 tombol "Save All". Arsitektur `pendingEdits`/`getVal`/`setVal`
DIREPLIKA dari List Memo FAR Overseas (`FarOverseasAirPage.tsx`), TAPI toggle mode editnya SUDAH
DIUBAH dari per-baris jadi GLOBAL (lihat di bawah) — beda dari FAR Overseas yang masih per-baris
— kalau nanti modul lain butuh fitur serupa, contoh yang lebih relevan adalah versi Courier ini,
bukan FAR Overseas.

**Konsep inti (VERSI FINAL, 2026-09 — direvisi dari desain awal yang per-baris)**: awalnya dibuat
1 tombol "Edit" per baris (replika persis pola FAR Overseas) — user MENOLAK desain ini ("lae
berarti harus tetap klik edit di tiap baris yang ada? itu namanya bukan edit masal lae, saya mau
klik satu tombol edit lae"). Diganti jadi **SATU tombol toggle global "Edit Mode" di toolbar**
(sebelah tombol "Add Data", muncul kalau `canEdit('courier_audit')`/`canEdit('courier_rekapan')`)
— `courierAuditEditMode`/`courierRekapanEditMode` (`boolean`, BUKAN `editingRowId: number|null`
lagi). Sekali diklik ON, SEMUA baris yang sedang tampil (lintas halaman/pagination — lihat catatan
`page` di bawah) langsung masuk mode input sekaligus, tidak perlu klik per baris. Perubahan
tetap disimpan di `pendingEdits` (keyed by row `id`), dipakai baik saat mode input aktif maupun
buat `effectiveRec` read-only merge (`getCellData()`), sampai user klik "Save All" (commit semua
ke DB via `handleInlineSaveRow` per baris, `Promise.all` paralel) atau "Cancel" (buang SEMUA
pending edit). Mode edit TIDAK otomatis mati setelah "Save All" — sengaja dibiarkan ON supaya user
bisa lanjut edit baris lain tanpa klik toggle lagi.

**Tombol "Edit" per-baris DIKEMBALIKAN LAGI (2026-09, susulan)** — sempat dihapus total waktu
toggle global ditambahkan (asumsi awal: toggle global menggantikan kebutuhan toggle per-baris),
TERNYATA user masih butuh keduanya ("tombol edit perbaris nya jangan di hilangkan juga lae,
karena perlu juga edit per baris tanpa edit masal lae") — kadang cuma mau koreksi 1 baris tanpa
membuka mode edit di SEMUA baris sekaligus. Diimplementasikan sbg state LOKAL per-row-group
(`rowEditOn`, `useState` di dalam `CourierAuditRowGroup`/`CourierRekapanRowGroup` sendiri, BUKAN
diangkat ke parent seperti `pendingEdits`) — `editingThisRow = (!!editMode || rowEditOn) &&
canBulkEdit && ...`. Tombol "✏️ Edit"/"Editing" di panel Action toggle `rowEditOn` murni lokal;
TIDAK ADA `onToggleEdit` prop lagi (beda dari desain lama sebelum toggle global) — parent tidak
perlu tahu baris mana yang lagi di-toggle manual, karena `pendingEdits` tetap 1 sumber kebenaran
yang sama dipakai baik dari toggle global maupun toggle per-baris ini. Jadi SEKARANG ADA 2 CARA
independen utk masuk mode input per baris: toggle global (semua baris) ATAU tombol Edit baris itu
sendiri (cuma baris itu) — keduanya menulis ke `pendingEdits` yang sama, "Save All"/"Cancel" tetap
berlaku ke SEMUA baris yang berubah dari cara manapun.

**Tombol "Save" per-baris (2026-09, susulan lagi)** — laporan user: "setelah di coba tombol
simpan nya tidak bisa lae, harusnya di bedakan tombol simpan edit masal dan tombol simpan edit
per baris lae". Sebelum ini SATU-SATUNYA cara commit ke DB adalah bar mengambang "Save All" yang
commit SEMUA baris di `pendingEdits` sekaligus — kalau user cuma edit 1 baris lewat tombol Edit
per-baris (`rowEditOn`), tidak ada cara simpan CUMA baris itu tanpa ikut nge-commit baris lain
yang mungkin belum selesai diedit. Fix: ditambah `handleSaveOneCourierAuditRow(id)`/
`handleSaveOneCourierRekapanRow(id)` (~baris setelah `handleDiscardAll*Edits`) — ambil
`pendingEdits[id]` doang, panggil `handleInlineSaveRow(id, payload, true)` (fungsi SAMA yang
dipakai "Save All", TIDAK ada logic simpan baru), sukses → hapus entry itu SAJA dari
`pendingEdits` (bukan `setPendingEdits({})` semua). Diteruskan ke row-group lewat prop baru
`onSaveRow?: (id: number) => Promise<boolean>`. Tombol "💾 Save" (hijau) muncul di panel Action
HANYA kalau `rowEditOn` true (state lokal row ini) — dengan kata lain **kalau baris masuk mode
edit lewat toggle GLOBAL toolbar ("Edit Mode"), tombol Save per-baris TIDAK muncul** (memang
disengaja — cara simpannya utk mode global tetap "Save All" bar, supaya jelas dipisah: edit
massal → Save All, edit satu baris manual → tombol Save di baris itu sendiri). Klik Save sukses →
`rowEditOn` di-set `false` lagi (keluar dari mode input baris itu otomatis), state loading lokal
`savingRow` men-disable tombol selama proses & ganti teks jadi "Saving...".

**2 bug susulan lagi (2026-09, laporan yang SAMA: "tombol save all pada edit masal seperti
tidak berfungsi... tidak bisa simpan ke database", DAN "jika edit per baris kenapa tombol save
all edit masal muncul juga lae? harusnya tidak muncul")**:
1. **Bar "Save All" muncul walau lagi edit PER-BARIS (bukan edit massal)** — kondisi tampil bar
   sebelumnya cuma `courierAuditChangedRowIds.length > 0` (ADA pending edit apa pun, dari toggle
   global MAUPUN dari tombol Edit satu baris — keduanya nulis ke `pendingEdits` yang sama, lihat
   poin di atas). FIX: tambah syarat `courierAuditEditMode`/`courierRekapanEditMode` (toggle
   GLOBAL) di kondisi tampil bar (~baris sebelum `<AlertTriangle>`) — bar "Save All" SEKARANG
   CUMA muncul kalau mode edit GLOBAL sedang aktif, bukan cuma krn ada 1 baris pending dari edit
   manual per-baris (yang punya tombol Save sendiri, lihat poin di atas).
2. **Save All "kelihatan tidak simpan ke DB"** — `handleInlineSaveRow` sebenarnya SUDAH patch
   `records` state lokal secara optimis begitu sukses (`setRecords(prev => prev.map(...))`), tapi
   TIDAK PERNAH panggil `fetchRecords()` (refetch penuh dari server) setelahnya — kalau ternyata
   ada kasus dimana update Supabase "sukses" (tidak error) tapi sebenarnya 0 baris ke-update (mis.
   RLS `USING` clause diam-diam memfilter baris tanpa melempar error — perilaku umum Postgres RLS
   utk UPDATE), tampilan tetap kelihatan "berhasil" padahal DB tidak berubah, dan setelah
   navigasi/refresh manual baru ketahuan datanya balik ke nilai lama. FIX (defensif, ROOT CAUSE
   PASTI belum terverifikasi krn belum ada akses DB langsung/log Supabase dari sesi manapun):
   (a) `handleSaveAllCourierAuditEdits`/`Rekapan` & `handleSaveOneCourierAuditRow`/`Rekapan`
   SEKARANG panggil `fetchRecords()` setelah ada minimal 1 baris sukses disimpan, supaya tabel
   selalu mencerminkan state DB SEBENARNYA, bukan cuma patch optimis; (b) `handleInlineSaveRow`
   SEKARANG SELALU `console.error('handleInlineSaveRow failed:', { id, payload, error })` di
   blok catch (sebelumnya kalau dipanggil dgn `silent=true` — SEMUA pemanggil bulk-edit pakai
   `silent=true` — errornya benar-benar hilang tanpa jejak apa pun, termasuk di console).
   Kalau user lapor lagi "tidak tersimpan" setelah fix ini, MINTA screenshot Console (F12) dulu —
   sekarang harus ada log `handleInlineSaveRow failed: {...}` di sana yang nunjukin pesan error
   asli dari Supabase (mis. kolom tidak ada di tabel tujuan — lihat RESIKO PIB/CN id collision di
   atas — atau RLS) — JANGAN tebak-tebak lagi tanpa lihat pesan itu.

**ROOT CAUSE Save All ketemu & diperbaiki (2026-09, susulan lagi)** — setelah user konfirmasi
"edit perbaris sudah berhasil simpan" TAPI Save All (edit massal) masih gagal, bandingkan 2 jalur
kode itu ketemu bedanya: **tipe data `id`**. Kolom `id` bertipe `bigint`/`int8` di Postgres
(kemungkinan `tabel_audit_pib`/`tabel_audit_cn`, cek skema asli kalau perlu verifikasi)
dikembalikan Supabase-js sbg **STRING** (bukan JS number, demi mencegah presisi hilang di angka
besar) — sedangkan kolom `int4` biasa dikembalikan sbg number. Tombol Save PER-BARIS meneruskan
`rec.id` APA ADANYA (tipe aslinya, entah string atau number) ke `handleInlineSaveRow`, jadi
`records.find(r => r.id === id)` di dalamnya selalu cocok. TAPI `courierAuditChangedRowIds`/
`courierRekapanChangedRowIds` (dipakai Save All) sebelumnya PAKSA `.map(([id]) => Number(id))` —
kalau `id` aslinya string bigint, hasil `Number(id)` jadi tipe BEDA dari `r.id` yang masih
string, jadi `r.id === id` (strict equality) SELALU `false` → `records.find(...)` selalu
`undefined` → `if (!record) return false;` → gagal DIAM-DIAM (early return SEBELUM try/catch
sempat jalan, jadi TIDAK ADA console.error/alert sama sekali, cocok dgn laporan user "modal
konfirmasi/bar tidak hilang, tidak ada pesan apa pun"). FIX (2 sisi, HARUS bareng):
1. `courierAuditPendingEdits`/`courierRekapanPendingEdits` diubah tipe dari `Record<number, ...>`
   ke **`Record<string, ...>`** (state tetap JS object biasa jadi ini murni perbaikan tipe TS,
   TIDAK ada perubahan runtime), dan `courierAuditChangedRowIds`/`courierRekapanChangedRowIds`
   TIDAK LAGI `Number(id)` — dibiarkan string apa adanya (key asli dari `Object.entries`).
2. `handleInlineSaveRow` (parameter `id` sekarang `number | string`) — SEMUA perbandingan
   `r.id === id`/pencarian record via id (4 titik: `sea_air_audit` depKeys block, `sea_air_
   rekapan`, `courier_audit`, plus `setRecords` optimistic patch di akhir) diganti jadi
   `String(r.id) === String(id)` — perbandingan berbasis string SELALU konsisten apa pun tipe asli
   `r.id` (number ATAU string), jadi imun dari mismatch tipe int4-vs-bigint ini. **Kalau nanti
   nambah cabang baru di `handleInlineSaveRow` yang butuh cari record via id, WAJIB pakai pola
   `String(r.id) === String(id)` ini juga, JANGAN `r.id === id` polos lagi.**

**Tombol Action tetap terbuka saat Edit per-baris (2026-09, susulan)** — laporan user: "jika edit
perbaris harusnya tombol aksi nya tetap muncul, supaya untuk simpan bisa mudah". Sebelumnya klik
"Edit" ikut `setShowActions(false)` (menutup panel Action), jadi tombol "💾 Save" yang baru muncul
langsung ikut tersembunyi juga — user harus buka lagi panel Action manual utk klik Save. FIX:
tombol Edit SEKARANG cuma `setRowEditOn(v => !v)` TANPA menutup panel Action — panel tetap
terbuka (`showActions` tidak disentuh) supaya tombol Save langsung kelihatan & bisa diklik tanpa
buka-tutup panel lagi. Tombol Save & aksi lain (Checklist/Delete/dst) TETAP menutup panel setelah
diklik seperti biasa (`setShowActions(false)` di situ tidak diubah) — cuma tombol Edit yang
dikecualikan.

**Implementasi** (state di komponen induk `SharedDataTable`, ~baris 2737-2758):
- `courierAudit{EditMode,PendingEdits}` + `courierRekapan{EditMode,PendingEdits}` — state
  TERPISAH per sub-tab (bukan digabung), supaya tidak ada state nyasar antar tab.
- `getCourierAuditVal`/`setCourierAuditVal`/`courierAuditChangedRowIds` (dan pasangan
  Rekapan-nya) — helper murni. TIDAK ADA `toggleCourierAuditEditRow` di level PARENT lagi (toggle
  per-baris sekarang murni state lokal `rowEditOn` di dalam row-group masing-masing, lihat di
  atas) — toggle GLOBAL tetap langsung `setCourierAuditEditMode(v => !v)` dari tombol toolbar.
- `CourierAuditRowGroup`/`CourierRekapanRowGroup` terima prop `editMode?: boolean` (mode global
  dari parent) DIGABUNG dengan state lokal `rowEditOn` (mode manual per-baris) —
  `editingThisRow = (!!editMode || rowEditOn) && canBulkEdit` (Audit masih ada gate tambahan
  `rec.status !== 'LENGKAP'`). Kedua row-group PUNYA tombol "Edit"/"Editing" lagi di panel Action
  (paling atas, sebelum Checklist/Validasi/Cost/Archive/Undraft/Delete).
- **Bug (ditemukan & diperbaiki 2026-09)**: `courierAuditChangedRowIds`/`courierRekapanChangedRowIds`
  awalnya dihitung `Object.keys(pendingEdits).map(Number).filter(id =>
  Object.keys(pendingEdits[id]).length > 0)` — pola ini RAWAN CRASH (`TypeError: Cannot convert
  undefined or null to object` di `Object.keys`) kalau key asli di `pendingEdits` bukan string
  numerik kanonik (mis. baris tanpa `id` valid, key jadi `"undefined"`, lalu `Number("undefined")`
  = `NaN` dipakai sbg index balik `pendingEdits[NaN]` → dicoba akses properti `"NaN"` yang TIDAK
  ADA → `undefined` → `Object.keys(undefined)` meledak). User lapor "layar putih" (React unmount
  total, tidak ada error boundary) begitu ngedit sebuah field (mis. tanggal) di mode edit massal.
  FIX: ganti ke `Object.entries(pendingEdits).filter(([, edits]) => edits &&
  Object.keys(edits).length > 0).map(([id]) => Number(id))` — TIDAK PERNAH re-index balik ke
  object pakai key yang sudah di-coerce, jadi aman dari mismatch key apa pun bentuknya.
- **`handleInlineSaveRow` DIPAKAI ULANG untuk commit** (parameter ke-3 `silent?: boolean` supaya
  bulk-save tidak memicu N `alert()` terpisah kalau beberapa baris gagal — cukup 1 alert
  ringkasan di akhir) — SATU-SATUNYA tempat resolusi tabel tujuan (PIB vs CN vs
  `rekapan_courier`) & coercion tipe angka, JANGAN duplikat logic ini lagi di handler bulk-save.
  Baris yang GAGAL disimpan TETAP ada di `pendingEdits` (supaya user bisa retry "Save All" lagi),
  baris yang BERHASIL langsung dibuang dari situ.
- Bar mengambang "N row(s) have unsaved changes" + Cancel/Save All (~sebelum penutup return
  utama SharedDataTable) — 2 blok terpisah (Audit vs Rekapan), muncul HANYA kalau
  `activeSubTab` yang cocok & ada `changedRowIds`. Direset otomatis (dibuang, bukan disimpan) kalau
  user pindah `activeMainTab`/`activeSubTab`/`courierAuditType` — TAPI SENGAJA TIDAK direset saat
  pindah `page` (dikeluarkan dari dependency array `useEffect` reset), supaya user bisa mengedit
  banyak baris LINTAS HALAMAN pagination dulu, baru "Save All" sekaligus di akhir — konsekuensi
  dari mode edit yang sekarang global, bukan per-baris.

**RESIKO YANG SUDAH DIKETAHUI, BUKAN BUG BARU** (pre-existing dari `handleInlineSaveRow`, sudah
ada SEBELUM fitur edit massal ini, edit massal cuma memperbesar kemungkinan kejadiannya karena
sekarang bisa banyak baris pending sekaligus): di tab **Draft** Audit Courier, baris PIB dan CN
digabung dari 2 tabel terpisah (`tabel_audit_pib`/`tabel_audit_cn`) yang masing-masing punya
sequence id sendiri-sendiri — SECARA TEORI bisa collision (PIB id=5 dan CN id=5 sama-sama ada).
`pendingEdits` di sini di-key oleh `rec.id` MENTAH (tanpa prefix `pib_`/`cn_` seperti yang
dipakai badge persentase di `fetchCourierValidationBadgePct`), dan `handleInlineSaveRow` resolve
tabel tujuan lewat `records.find(r => r.id === id)` (ambil match PERTAMA di array, bukan
berdasar jenis dokumen eksplisit). Kalau collision itu benar-benar terjadi, edit pada 1 baris
bisa salah nyasar ke baris lain yang id-nya sama tapi beda jenis dokumen. BELUM diperbaiki
(butuh redesain key jadi composite `pib_${id}`/`cn_${id}` di `handleInlineSaveRow` DAN
`pendingEdits` DAN `editingRowId` sekaligus, cakupannya lebih luas dari sekadar fitur edit
massal ini) — kalau ada laporan user "data record lain ikut berubah" di tab Draft, ini
kemungkinan besar penyebabnya, cek dulu ke sini.

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
