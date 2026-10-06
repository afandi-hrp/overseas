# Shipment App (BeeHive) — Panduan untuk Claude

Aplikasi internal Waruna Group untuk otomasi & audit dokumen shipment (Courier DHL/FedEx, Sea & Air, FAR Overseas,
Bunker, Compare Doc, SPB). AI (n8n + Gemini) membaca dokumen upload lalu mengisi tabel Supabase; aplikasi ini panel
audit, koreksi manual, validasi cost, approval & serah terima Finance.

**File ini SENGAJA ringkas (aturan lintas modul saja, diringkas 2026-10-06 dari ±375 KB).** Detail per modul ada di
`docs/claude/*.md` dan **TIDAK dimuat otomatis** — WAJIB baca file modul yang relevan (tabel "Dokumentasi modul" di
bawah) SEBELUM mengubah modul itu. Catatan baru: detail modul ditulis di file modulnya, CLAUDE.md hanya utk aturan
yang berlaku lintas modul. Rujukan lama di docs berbunyi "lihat CLAUDE.md bagian X" → judul bagian itu kini ada di salah satu `docs/claude/*.md` (cari judulnya). Riwayat lengkap versi lama: git history.

## Dokumentasi modul (baca sesuai modul yang dikerjakan)

| Kerjakan … | Baca |
|---|---|
| Courier (Audit, Invoice Recap, Validation panel, Upload susulan, sort/reorder, Customize View, Export, auto-calc, kolom per role SQL, rate/PPJK/surcharge admin, Webhook settings) | `docs/claude/courier-features.md` |
| Sea & Air (Audit PIB, Invoice Recap, relasi PIB↔Recap, Form E, Duty), Bunker, Document Validation Courier (`ValidasiModal`) | `docs/claude/bunker-courier-seaair.md` |
| FAR Overseas (memo, approval, Cost Validation, Tarif Vendor, cetak memo) | `docs/claude/far-overseas.md` |
| Finance Handover (`/finance-handover`) | `docs/claude/finance-handover.md` |
| Audit AP Local/Overseas, PI Local, Accounting Rekap, Card/List Compare Doc | `docs/claude/audit-po.md` |
| Requisition RH, Oil Request (SPB), Verification QFP, LSA | `docs/claude/migrated-pages.md` |
| Reporting (Cost by Vessel, Cost by Courier, Master Vessel) | `docs/claude/reporting.md` |
| AuthContext / lock screen / auto-logout / pindah tab | `docs/claude/auth-session.md` |
| RLS, RPC guard, role_page_access, jabatan approval, kolom per role, translasi (detail & riwayat) | `docs/claude/rbac-security.md` |
| Zoom 90%, shell tabel, navigasi mobile, menu sidebar, loading state (detail) | `docs/claude/ui-layout.md` |
| Sisa pekerjaan / backlog per modul | `docs/claude/status-backlog.md` |

## Tech stack

- React 19 + TypeScript + Vite, Tailwind CSS v4 (utility class langsung), `react-router-dom` v7, ikon `lucide-react`.
- Data: Supabase (Postgres + RLS + RPC), client `src/lib/supabase.ts`. Auth/akses: `src/lib/AuthContext.tsx`
  (`useAuth()` → `user`, `profile`, `allowedPageKeys`, `isAdmin`, `canEdit(pageKey)`, `canApproveTier`,
  `getAllowedColumns`, `signOut`, `refreshProfile`).
- `server.ts` (Express) HANYA proxy: upload ke n8n (`/api/n8n-proxy-start`) & preview Google Drive
  (`/api/drive-file-proxy?id=`). **`npm run dev` (tsx) TIDAK hot-reload `server.ts`** — tiap ubah, restart manual
  (kalau tidak, endpoint baru jatuh ke SPA fallback & balikin `index.html`, bukan 404). Port dev = `PORT` di `.env` (3002).
  Vite watcher bisa crash `EBUSY` kalau ada file yang sedang disalin/terkunci di root proyek — restart `npm run dev`.
- Verifikasi standar setelah edit: `npx tsc --noEmit` (harus bersih); perubahan besar juga `npx vite build`.
- `document.title` = `'<Judul Halaman> · BeeHive'`.
- Komentar kode & dokumen ini Bahasa Indonesia; teks UI Bahasa Inggris (lihat Translasi).

## Keamanan (WAJIB dipatuhi kode baru)

- **Endpoint `server.ts` `/api/*` WAJIB login**: frontend lewat `apiFetch()` (`src/lib/apiFetch.ts`, bearer token
  hanya ke URL relatif `/api/`); server `authorize()` (verifikasi token + `get_my_access()`, aturan `UPLOAD_ACCESS`/
  `DRIVE_PREVIEW_ACCESS`). Endpoint baru WAJIB `authorize()`; pemanggil baru WAJIB `apiFetch`, JANGAN `fetch` polos.
  Env runtime wajib `SUPABASE_URL`+`SUPABASE_ANON_KEY` (fallback `VITE_*`), tanpa itu `/api/*` 503. `x-webhook-url`
  hanya ke origin n8n terdaftar (`VITE_N8N_*` + `N8N_ALLOWED_ORIGINS`). Upload multer 50MB/file, 30 file.
  (Pengecualian sadar: 4 halaman migrasi SPB/QFP/LSA memanggil webhook n8n LANGSUNG dari browser, sama versi asli.)
- **HTML dari backend/n8n WAJIB disanitasi `DOMPurify`** sebelum `dangerouslySetInnerHTML` (hasil AI = input tak
  tepercaya). Kalau HTML n8n butuh script (Oil Request): render di `<iframe sandbox>` TANPA `allow-same-origin`,
  JANGAN `eval`/innerHTML di halaman.
- **SQL**: semua migrasi `sql/001`–`sql/044` SUDAH dijalankan di production (isi di git history).
  `sql/045_seed_purchasing_users.sql` (3 akun @purchasing.com, insert langsung ke `auth.users`+`auth.identities`,
  diuji PGlite) dibuat 2026-10-06 — BELUM dikonfirmasi dijalankan.
  `sql/046_profiles_divisi.sql` (kolom `profiles.divisi` + RPC `fn_set_user_divisi`, Admin saja) SUDAH DIJALANKAN 2026-10-06
  (konfirmasi user). `sql/047_profiles_divisi_from_email.sql` (isi divisi dari domain email: @finance→FINANCE,
  @purchasing→PURCHASING, @shipmentoverseas→SHIPMENT; hanya yg masih kosong) dibuat 2026-10-06 — BELUM dikonfirmasi. Catatan "BELUM DIJALANKAN" di `docs/claude/*.md` utk file ≤044 TIDAK berlaku. SQL baru: file
  `sql/NNN_*.sql` baru (idempotent, pre-check nama fungsi), user yang menjalankan manual — tidak ada akses DB dari sesi.
- **Kondisi DB production (stack `supabase3`)**: `anon` tanpa hak di schema public, GraphQL ditutup, semua tabel RLS
  (`has_page_access`/`has_edit_access`, tidak ada `using (true)`), view `security_invoker`, RPC `SECURITY DEFINER`
  ber-`search_path` & guard. **Aturan objek baru**: tabel WAJIB RLS 4 policy; RPC `SECURITY DEFINER` WAJIB guard
  `IF NOT public.has_edit_access('<page_key>') THEN RAISE EXCEPTION` di baris pertama + `set search_path = public,
  extensions, pg_temp` + `revoke ... from public, anon`; view WAJIB `security_invoker`. RLS tabel saja TIDAK cukup
  utk RPC `SECURITY DEFINER` (bypass RLS). RPC `SECURITY INVOKER` ikut RLS, tanpa guard tambahan.
- Catatan "sudah ada guard" di dokumen PERNAH terbukti salah — selalu minta `pg_get_functiondef` live dulu.
- **Sebelum `revoke execute` dari `authenticated`, cek pemanggil DI DALAM DB** (`pg_proc.prosrc ilike '%nama%'`) —
  insiden: `fn_normalize_awb_courier` dicabut krn "tidak dipakai frontend", ternyata dipanggil trigger → semua save
  Audit Courier gagal.
- **Nambah parameter ke RPC yang sudah ada WAJIB `DROP FUNCTION` signature lama dulu** — `CREATE OR REPLACE` dgn
  jumlah param beda = overload baru → panggilan ambigu ("Could not choose the best candidate function").
- Signup publik ditutup di ketiga stack (`DISABLE_SIGNUP=true`). Stack `supabase`/`supabase2` belum diaudit level DB.
- Penulis "service" (n8n / SQL Editor) = `auth.email() IS NULL` — trigger audit & guard tertentu sengaja melewatinya.

## Routing & halaman (`src/App.tsx`)

Semua route (kecuali `/login`) dibungkus `<ProtectedRoute>` → `<MainLayout>` (sidebar) → `<RequirePageAccess
pageKey | pageKeys | adminOnly>`.

| Route | Komponen | page_key / catatan |
|---|---|---|
| `/courier/audit`, `/courier/rekapan` | `SharedDataTable` (via `Courier*Page`) | `courier_audit`, `courier_rekapan` — kartu (Card) + toggle List (tabel lama) |
| `/courier/validasi` | `CourierValidasiPage` | `courier_validasi` |
| `/courier/upload`, `/sea-air/upload` | `UploadPage` (`fixedType`) | `courier_upload`, `sea_air_upload` (proxy n8n) |
| `/sea-air/audit`, `/sea-air/rekapan` | `SharedDataTable` | `sea_air_audit`, `sea_air_rekapan` — Card + List |
| `/direct-loading/:id?` | `FarOverseasAirPage` | `direct_loading` (label "FAR Overseas", 1 route supaya tidak remount) |
| `/finance-handover` | `FinanceHandoverPage` | `pageKeys=[far_overseas_finance, sea_air_finance, courier_finance]`; `/sea-air/finance` → redirect |
| `/reporting/cost-by-vessel`, `/reporting/cost-by-courier` | `CostByVesselPage`, `ReportingCostByCourierPage` | gating internal (`reporting_dashboard`/`reporting_cost_per_vessel`), `reporting_cost_by_courier` |
| `/bunker`, `/audit-po`, `/audit-po-overseas`, `/accounting-rekap`, `/pi-local` | `BunkerPage`, `AuditPoPage`, `AuditPoOverseasPage`, `AccountingRekapPage`, `PiLocalPage` | Compare Doc; 3 halaman AuditPo/PiLocal = DUPLIKASI SENGAJA (porting manual) |
| `/verification-qfp`, `/lsa` | `VerificationQfpPage`, `LsaPage` | Compare Doc, `verification_qfp`, `lsa` |
| `/spb/requisition-rh`, `/spb/oil-request` | `RequisitionRhPage`, `OilRequestPage` | SPB, `requisition_rh`, `oil_request` |
| `/audit-trail` | `AuditTrailPage` → `SharedDataTable` | `audit_trail` |
| `/settings` | `SettingsPage` | hub kartu (tanpa gating sendiri) |
| `/settings/roles`, `/settings/master-vessel` | `RoleManagementPage`, `MasterVesselAdminPage` | `adminOnly` |
| `/settings/webhooks`, `/admin/rates`, `/settings/fuel-surcharge`, `/settings/kurs-bi`, `/settings/kurs-rule-vendor`, `/settings/tarif-kontrak`, `/settings/tarif-far-overseas-vendor`, `/settings/seaair-vendors`, `/settings/courier-vendors` | halaman Settings masing2 | page_key `settings_*` / `admin_rates` |
| `/account` | `AccountPage` | semua user login |

`SharedDataTable.tsx` (komponen generik besar, Courier/Sea & Air/Audit Trail, banyak cabang `activeMainTab`/
`activeSubTab`) — hati-hati; catatan kolom/filter Courier di `docs/claude/courier-features.md`.

## Auth & sesi (ringkas — detail WAJIB baca `docs/claude/auth-session.md` sebelum mengubah)

- Idle 30 menit → logout (`IDLE_TIMEOUT_MS`, final). Tutup 1 tab = logout SEMUA tab; refresh (F5) TETAP aman
  (keputusan user, jangan ubah tanpa konfirmasi).
- Auto-logout selagi tab masih terbuka → **lock screen** (halaman terakhir blur+`inert`, minta password), BUKAN
  LoginPage; tab benar2 ditutup / Logout manual → LoginPage. `ProtectedRoute` WAJIB render struktur yang SAMA
  (kondisional = remount seluruh halaman).
- Semua `signOut()` otomatis WAJIB `await` + `console.error('[Auto-logout] ...')`.
- Pindah tab browser TIDAK boleh me-refresh halaman: setter state akses/profil/sesi di AuthContext WAJIB lewat helper
  `keepSet`/`keepJson`/`sameSession` (jangan `setX(new ...)` polos).

## RBAC (ringkas — detail `docs/claude/rbac-security.md`)

- Tabel `roles`, `user_roles`, `role_page_access` (`can_edit`, `visible_columns`), `user_approval_tiers`. Role
  "Admin" (`is_protected`) selalu akses penuh (`is_admin()`). RPC baca: `get_my_access()` (page_keys +
  edit_page_keys), `get_my_approval_tiers()`, `get_my_column_access()`. Perubahan berlaku setelah user refresh.
- `src/lib/permissions.ts` `PAGE_REGISTRY` = SATU-SATUNYA daftar page_key. **Halaman baru WAJIB**: daftar di
  `PAGE_REGISTRY` (`group` = menu sidebar-nya, `menuLabel` = nama submenu, `parent` utk tombol/fitur di dalam
  halaman), tambahkan ke `ACCESS_MATRIX_ORDER` (urutan matrix), route di `App.tsx` + `RequirePageAccess`, menu di
  `MainLayout.tsx` `MAIN_TABS`. Urutan `PAGE_REGISTRY` menentukan halaman awal login (`getDefaultLandingPath`) —
  jangan diacak. page_key baru belum di-assign ke role mana pun (hanya Admin sampai di-assign).
- Matrix Manage Roles & Access (`RoleManagementPage.tsx`) dikelompokkan SAMA dgn sidebar (`PAGE_GROUPS`): Courier, Sea &
  Air, FAR Overseas, Finance Handover, Reporting, Compare Doc, SPB, Audit Trail, Settings.
- View vs edit: `canEdit(pageKey)` (+ `has_edit_access` di DB). Granularitas per page_key (Checklist/Doc/Cost
  Validation punya page_key sendiri). Jabatan approval per USER per HALAMAN (`approvalTiers` di registry); gating
  ganda `canEdit && canApproveTier`, **Admin TIDAK otomatis lolos approval**.
- Kolom per role (`visible_columns`, `COLUMN_ACCESS_PAGES` di SharedDataTable) = merapikan tampilan, BUKAN keamanan
  (data tetap terkirim; fail-open).
- Klik menu induk sidebar (desktop) membuka subtab pertama yang boleh diakses user.
- Panel Roles per User dikelompokkan per **divisi user** (`profiles.divisi`, sql/046, dropdown per user, Admin saja) —
  pengelompokan tampilan, BUKAN hak akses.

## Translasi UI ke Bahasa Inggris (ringkas — detail `docs/claude/rbac-security.md`)

- Nilai status di DATABASE tetap Indonesia (`LENGKAP`/`PROSES`/...) — terjemahan hanya lewat mapping render-only.
  Istilah domain (PPJK/AWB/PIB/BM/DPP/SPTNP/NDPBM/CIPL/BPN/HS Code) & nama kolom/tabel tidak diterjemahkan.
- **`field`/`rowLabel`/`compareDoc` di SECTIONS `ValidasiModal.tsx`/`SeaAirValidasiModal.tsx`/`ValidasiHelper.ts`
  adalah LOGIC KEY** (substring matching di `computeStatus()` & groupKey) — JANGAN diterjemahkan; `label`/`srcLabel`
  aman. Regex `parseRouteNote()` (`PENGIRIMAN DARI … KE … (…)`) & `mapModeToJenisLayanan()` FAR WAJIB tetap literal
  Indonesia. Isi NOTE 1–4 memo FAR tetap Indonesia.
- Belum diterjemahkan: Audit AP Local, Audit Trail, Settings hub, halaman admin, LoginPage, Master Vessel.

## Pola UI wajib (detail & riwayat `docs/claude/ui-layout.md`)

- Brand ungu `#5A305A` (hover `#73507B`) utk tombol utama & ikon header (modul FAR punya palet sendiri `#6B3470`,
  Audit/Recap Sea & Air & Courier pakai token `SeaAirAuditUi.tsx` — sengaja). Font app **Sora** (global `index.css`).
- Header halaman: `<div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">` → `<header className="px-3 pt-1
  pb-1">` full-width berisi kotak ikon `w-9 h-9 rounded-xl bg-[#5A305A]` + `<h1 className="font-bold text-2xl
  text-[#5A305A]">` + subjudul `font-light text-sm` + `<Greeting />` di kanan → `<main className="px-3 pt-2 …">`.
  **Semua halaman `px-3`** (JANGAN `px-4`/`px-6`). Halaman list "shell tinggi tetap" `main` `pb-2`.
- Shell list tinggi tetap: wrapper `flex flex-col overflow-hidden`, header/toolbar `shrink-0`, kartu list `flex-1
  min-h-0`, tabel `overflow-auto flex-1 min-h-0` + `<thead className="sticky top-0 z-20">`, pagination `shrink-0`.
- Toolbar/filter yang harus tetap rapi di laptop 14" & monitor 24": pakai `@container` + container query (BUKAN
  breakpoint layar `lg:`), `flex-wrap` sbg cadangan; JANGAN `justify-end` + `overflow-x-auto` (isi terpotong).
- Pagination footer: komponen bersama `src/components/PaginationFooter.tsx` (halaman list baru WAJIB pakai).
- Loading data: `LoadingState` / `LoadingTableRow` / `LoadingSpinner` (`src/components/LoadingState.tsx`, spinner
  kapsul ungu, teks "Loading data..."). Spinner inline tombol aksi boleh beda. JANGAN bikin spinner+teks manual baru.
- Modal: overlay `fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70..] flex items-center justify-center p-4`,
  box `bg-white rounded-2xl shadow-2xl`.
- Zoom global 90% di layar ≤1600px (`html{zoom:90%}` + kompensasi `.h-screen`/`.min-h-screen`) — pakai `zoom`, JANGAN
  `transform:scale` (merusak fixed/sticky). Unit `vh` tidak ikut zoom.
- Print: aturan global `body * {visibility:hidden}` di `index.css`; area cetak = elemen ber-id (portal ke body)
  dgn aturan `#<id>-print-area` sendiri di `index.css`; `@page` khusus halaman lewat `<style>` di komponen.
- Sidebar mobile = hamburger + drawer (`MainLayout.tsx`, `md:hidden`); desktop sidebar terpisah.

## Peta tabel Supabase (per modul)

- **Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`, `user_approval_tiers`.
- **Courier**: `rekapan_courier` (+`tgl_invoice`, kolom Finance), `tabel_audit_pib`, `tabel_audit_cn`,
  `tabel_cost_validasi`, `cost_validasi_review_courier`, `cost_validasi_review_courier_item`,
  `courier_checklist_doc_log`, `courier_vendor_master`, `dokumen_checklist`, `dokumen_validasi`,
  `tabel_checklist_validasi`, `tabel_npwp`, `tabel_processing_queue`. (View `v_pib_lengkap`/`v_cn_lengkap` tidak
  dipakai lagi; kelengkapan di-merge di JS `mergeChecklistData()`.)
- **Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`, `cost_validasi_catatan_seaair`,
  `dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`, `seaair_form_e_note`,
  `seaair_vendor_master`, `kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`.
- **FAR Overseas**: `rekapan_far_overseas_air`, `cost_validasi_far_overseas_air`, `far_overseas_signer_config`,
  `far_overseas_air_processing_queue`, `far_overseas_memo_log`, `far_overseas_memo_counter`,
  `far_overseas_step_signers`, tarif: `far_overseas_vendor_master`, `far_overseas_tarif_quotation`,
  `far_overseas_tarif_quotation_detail` (`far_overseas_tarif_vendor` LAMA tidak dipakai — pakai
  `fetchActiveTarifRateRows()`).
- **Bunker**: `bunker_dokumen`, `bunker_processing_queue`.
- **Compare Doc (otomasi backend)**: `audit_po_ap_comp`, `audit_po_apovs_comp`, `audit_po_pi_local_comp`,
  `accounting_rekap_finance`. (Verification QFP/LSA/SPB tanpa tabel.)
- **Admin/rate master Courier**: `tabel_rate_sheet_dhl`/`_fedex`/`_ups`, `tabel_surcharge_dhl`/`_fedex`,
  `tabel_surcharge_rule`, `tabel_zone_mapping`, `tabel_ppjk_cost_rule`, `tabel_fuel_surcharge`.
- **Reporting**: `master_vessel`, `reporting_cost_allocation` (snapshot dari tabel rekapan).
- **Lain**: `audit_trail` + view `v_audit_trail`; log app wajib format `"{field} — Lama: X → Baru: Y"` (lolos
  `TRAIL_APP_WRITTEN_FILTER`; trigger audit DB melewati penulis service).

## Peta RPC Supabase

**WAJIB sebelum membuat RPC/function BARU**: project ini dipakai bersama n8n & user (SQL Editor) — RPC bisa sudah ada
tanpa tercermin di kode. Tanya user & minta `select pg_get_functiondef('nama'::regproc)` dulu (error "does not exist" =
aman buat baru), terutama nama generik (`upsert_*`/`update_*`/`get_*`). Insiden: RPC Tarif Vendor FAR dibuat ulang dgn
signature beda → `42P13`; whitelist `v_allowed_columns` RPC buatan user bisa basi → field "tersimpan" tapi kembali
kosong (cek whitelist dulu). Daftar di bawah disimpulkan dari `.rpc('...')` di frontend, bisa basi.

- Auth: `get_my_access`, `get_my_approval_tiers`, `get_my_column_access`.
- FAR Overseas: `update_rekapan_far_overseas_manual` (whitelist kolom TERPISAH dari `REKAPAN_EDITABLE_FIELDS` —
  tambah field = tambah whitelist), `insert_rekapan_far_overseas_manual`, `update_cost_validasi_far_overseas_manual`,
  `fn_delete_far_overseas_air`, `approve_far_overseas_air`, `reject_far_overseas_air`, `get_users_with_approval_tier`,
  `fn_far_overseas_can_sign`, `fn_far_overseas_prepared_by_blockers`, `fn_far_overseas_undo_last_sign`,
  `fn_far_overseas_confirm_ai_finding`, `fn_far_overseas_unconfirm_ai_finding`, `fn_far_overseas_log_reminder`,
  `fn_far_overseas_finance_accept`, `fn_far_overseas_mark_paid`, `fn_far_overseas_finance_undo_receive`,
  `fn_far_overseas_set_urgent` (2-arg & 3-arg). Tarif: `upsert_far_overseas_vendor_master`,
  `upsert_far_overseas_tarif_quotation`, `upsert_far_overseas_tarif_quotation_detail`,
  `nonaktifkan_far_overseas_tarif_quotation`, `hapus_far_overseas_tarif_quotation_detail`.
- Sea & Air: `insert_seaair_row`, `update_seaair_row`, `update_rekapan_po_vessel`, `update_validasi_matriks_manual`,
  `update_cost_validasi_manual`, `get_kurs_efektif`, `upsert_kurs_rule_vendor`, `upsert_kurs_bi`,
  `nonaktifkan_tarif_kontrak`, `fn_seaair_unlock_submit`, `fn_seaair_reread_from_ai`, `fn_seaair_recap_issue_count`,
  `fn_seaair_finance_accept(uuid,text,date)`, `fn_seaair_finance_mark_paid`, `fn_seaair_finance_undo_receive`.
- Courier: `fn_delete_pib`/`_cn`, `fn_archive_pib`/`_cn`, `fn_undraft_pib`/`_cn`, `fn_hitung_storage`,
  `fn_save_storage_estimate`, `fn_update_actual_value`, `fn_apply_credit_note`, `fn_recompute_totals`,
  `fn_revise_credit_note`, `fn_courier_recap_awb_page`, `fn_courier_recap_summary`, `fn_courier_awb_norm`,
  `fn_courier_finance_accept`, `fn_courier_finance_mark_paid`, `fn_courier_finance_undo_receive`,
  `fn_courier_unlock_submit`.
- Reporting: `fn_reporting_distinct_pt`, `fn_reporting_vendor_stats` (tidak dipakai lagi oleh 4 halaman Compare
  Doc), `fn_reporting_kategori_stats`, `fn_reporting_courier_distinct`.

Ragu soal signature/param RPC → cek di SQL Editor dulu, jangan tebak dari nama parameter.
