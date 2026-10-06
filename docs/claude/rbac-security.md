# Keamanan, RBAC & translasi — detail lengkap

Ringkasan aturannya ada di CLAUDE.md; versi lengkap (riwayat SQL, daftar RPC ber-guard, jabatan approval, kolom per role, pengecualian translasi) di sini. Baca sebelum mengubah RLS/RPC/role_page_access/AuthContext akses atau label yg mungkin logic key.

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas). -->

## Keamanan — hasil audit 2026-09 (WAJIB dipatuhi kode baru)

- **Semua endpoint `server.ts` `/api/*` WAJIB login**: frontend memanggil lewat `apiFetch()`
  (`src/lib/apiFetch.ts`, tempel bearer token Supabase HANYA ke URL relatif `/api/`), server
  verifikasi token + hak akses via RPC `get_my_access()` pakai token user itu (`authorize()`,
  aturan per fitur `UPLOAD_ACCESS`/`DRIVE_PREVIEW_ACCESS` = sama dgn gating UI). **Endpoint `/api`
  baru WAJIB panggil `authorize()`; pemanggil baru WAJIB `apiFetch`, JANGAN `fetch` polos.**
  Env RUNTIME server wajib: `SUPABASE_URL`+`SUPABASE_ANON_KEY` (fallback `VITE_*`) — tanpa ini
  semua `/api/*` fail-closed 503. `x-webhook-url` hanya boleh ke origin n8n yg terdaftar (origin
  `VITE_N8N_*` + `N8N_ALLOWED_ORIGINS`) — dulu SSRF penuh. `N8N_WEBHOOK_SECRET` (opsional) dikirim
  sbg header `X-Webhook-Secret` ke n8n. Upload dibatasi multer 50MB/file, 30 file.
- **HTML dari backend/n8n WAJIB disanitasi `DOMPurify`** sebelum `dangerouslySetInnerHTML`
  (nilai di dalamnya hasil ekstraksi AI dari dokumen upload = input tak tepercaya). Satu-satunya
  titik saat ini: `HtmlValue` `BunkerCompareDocModal.tsx`.
- **Folder `sql/` DIHAPUS (2026-09-26, 2026-10-01, lalu LAGI 2026-10-02)** — 040 (Undo receipt Finance Handover, 3 RPC
  `fn_*_finance_undo_receive`) juga SUDAH dijalankan & diverifikasi (query baca 3 fungsi ber-komentar `beehive:040`, gagal 0,
  2026-10-02; isi terakhir di git commit `2fefc12`). 036–039 juga SUDAH dijalankan & diverifikasi
  (1 query baca 49 cek, semua `true`, 2026-10-02; isi terakhir ada di git commit `2fb0f3c`: 036 inspeksi baca, 037 Invoice Recap
  Courier per AWB/re-audit/Finance Courier/master vendor, 038 review cost + kunci Submit + Unlock [fungsi unlock sempat
  versi lama, dijalankan ulang], 039 policy baca Finance). Riwayat sebelumnya: — SEMUA file migrasi SUDAH dijalankan ke
  production: 001–026 (konfirmasi user 2026-09-26) dan 027–035 (diverifikasi dgn 1 query baca terhadap
  DB live 2026-10-01, semua cek `true`). Semua catatan "BELUM DIJALANKAN" di file ini & `docs/claude/*.md`
  utk file 001–035 TIDAK berlaku lagi. Isi SQL ada di git history (027–035 di commit `a013011`/`e070654`
  & sebelumnya; 024–026 tidak pernah di-commit). Ringkas: 027 = FAR tahap 2 (termasuk
  `prepared_by_user_id`; bagian G bucket bukti bayar SENGAJA tidak dijalankan), 028 = kolom
  `dokumen_checklist.catatan_checklist`, 029 = lock hapus memo FAR, 030/030b = query inspeksi baca saja,
  031/032 = relasi Audit PIB ↔ Invoice Recap Sea & Air + auto Draft PIB, 033 = fix hitung ringkasan RPC
  `update_cost_validasi_manual`, 034 = Finance Handover Sea & Air (versi pertama), 035 = Finance Handover
  gabungan (backfill opsional 033 TIDAK dijalankan). **Urutan kalau perlu dijalankan ulang dari git
  history: 031 -> 034 -> 035** (031 menimpa 2 fungsi yg diperbarui 034; 034 menimpa mark_paid Sea & Air yg
  diperbarui 035). SQL baru ke depan: buat file `sql/NNN_*.sql` baru lagi.
  **Setelah penghapusan itu**: `sql/036_courier_recap_inspeksi_READONLY.sql` (baca saja) SUDAH dijalankan user
  2026-10-02 (hasil dipakai merancang 037); **`sql/037_courier_recap.sql` SUDAH DIJALANKAN** (konfirmasi user
  2026-10-02; Invoice Recap Courier per AWB, re-audit otomatis, Finance Handover Courier, master vendor Courier) —
  lihat "Invoice Recap Courier per AWB" di bawah. **`sql/038_courier_cost_review_and_recap_lock.sql` SUDAH DIJALANKAN 2026-10-02** (file dihapus, lihat git `2fb0f3c`)
  (review cost per invoice Audit Courier + kunci Submit to Finance Invoice Recap Courier, lihat "Courier 2026-10-02 bagian 2").
  **`sql/039_courier_finance_read_validation.sql` SUDAH DIJALANKAN 2026-10-02** (setelah 038): policy SELECT `courier_finance`
  utk Finance melihat validasi PIB/CN (lihat "Finance melihat validasi Courier").
  **`sql/041_courier_validation_panel.sql` SUDAH DIJALANKAN 2026-10-05** (konfirmasi user; 2026-10-05, panel Validation samping
  Invoice Recap Courier): tabel `courier_checklist_doc_log` + trigger `trg_courier_checklist_doc_log` (riwayat centang dokumen)
  & tabel `cost_validasi_review_courier_item` (Accept cost per baris). Lihat "Panel Validation samping Invoice Recap Courier".
  **`sql/042_courier_recap_tgl_invoice.sql` SUDAH DIJALANKAN 2026-10-05** (konfirmasi user; 2026-10-05): kolom
  `rekapan_courier.tgl_invoice` (date) -- dasar Due Date kartu Invoice Recap Courier (+30 hari). Sumber pengisian (n8n) menyusul dari user.
  **`sql/044_seaair_form_e_note.sql` SUDAH DIJALANKAN 2026-10-05** (konfirmasi user; 2026-10-05, Invoice Recap Sea & Air): tabel BARU
  `seaair_form_e_note` (catatan manual Form E, 1 baris per `seaair_id`, RLS 4 policy). Aturan Form E kini AKTIF (memblokir Submit selama Form E belum tercentang / belum ada catatan); dulu sebelum jalan fail-open
  (tidak memblokir). Detail: `docs/claude/bunker-courier-seaair.md` "Form E utk barang dari China".
  **`sql/043_far_overseas_confirm_duplicate_urgent.sql` SUDAH DIJALANKAN 2026-10-05** (konfirmasi user; FAR Overseas):
  kolom `urgent_note`, deteksi duplikat (trigger `trg_far_overseas_auto_fields`), payment type otomatis With PO kalau ada PO,
  `fn_far_overseas_prepared_by_blockers` (Overcharge/Undercharge terkonfirmasi menggugurkan syarat Notes Manual; Octagon wajib goods
  received date sebelum Prepared By sign kecuali Urgent), Undo konfirmasi
  & nama pengonfirmasi, `fn_far_overseas_set_urgent(uuid, boolean, text)`. Detail: `docs/claude/far-overseas.md` "Update 2026-10-05".
- **Kondisi DB production (stack `supabase3`, audit 2026-09-26)**: role `anon` tanpa hak apa pun
  di schema public (tabel, fungsi, default privileges); GraphQL ditutup; semua tabel RLS dgn
  policy `has_page_access`/`has_edit_access` (tidak ada `using (true)`); semua view
  `security_invoker`; semua RPC `SECURITY DEFINER` punya `search_path`; RPC tulis ber-guard.
  **Aturan objek baru**: tabel WAJIB RLS 4 policy; RPC `SECURITY DEFINER` WAJIB guard +
  `set search_path = public, extensions, pg_temp` + `revoke ... from public, anon`; view WAJIB
  `security_invoker`. Catatan "sudah ada guard" di dokumen lama PERNAH terbukti salah — selalu cek
  `pg_get_functiondef` live dulu.
  **Sebelum `revoke execute` fungsi dari `authenticated`, cek pemanggil DI DALAM DB** (trigger/fungsi
  lain, `pg_proc.prosrc ilike '%nama%'`), bukan cuma grep frontend — insiden 2026-09-26:
  `fn_normalize_awb_courier` dicabut krn "tidak dipakai frontend", ternyata dipanggil trigger UPDATE
  `tabel_audit_pib`/`cn` -> semua save Audit Courier gagal "permission denied for function".
- Signup publik (email & phone) DITUTUP di ketiga stack Supabase via env GoTrue
  (`DISABLE_SIGNUP=true`, phone signup/autoconfirm `false`). Stack `supabase`/`supabase2` BELUM
  diaudit level DB.

## RBAC (role & akses per halaman)

`sql/001_rbac_and_bunker_rls.sql`, `sql/002_direct_loading_rls.sql`. Tabel `roles`,
`user_roles`, `role_page_access` — role "Admin" (`is_protected=true`) selalu akses penuh
(hardcode `is_admin()`, bukan lewat `role_page_access`).

- `src/lib/permissions.ts` — `PAGE_REGISTRY` = satu sumber kebenaran daftar `page_key`. Tambah
  halaman baru → daftarkan di sini.
- **`RoleManagementPage.tsx`** — matrix "Page Access per Role": grup (`PAGE_GROUPS`) collapsible
  per grup + tombol Expand/Collapse All (default CIUTKAN semua), container `max-h-[520px]
  overflow-auto` + `<thead>` sticky. Panel "Roles per User" — REBUILT jadi tabel matrix (bukan
  pill list lama): sticky kolom pertama, checkbox bulat emerald per role, dropdown jabatan
  approval (kalau ada `APPROVAL_TIER_PAGES`) SEBELUM kolom role, `max-h-[420px] overflow-y-auto`.
  Semua teks Inggris (lihat bagian Translasi di bawah).
- **Matrix Page Access per Role mengikuti sidebar (2026-10-06, permintaan user)**: `PageEntry.group` = menu sidebar
  (`Courier`/`Sea & Air`/`FAR Overseas`/`Finance Handover`/`Reporting`/`Compare Doc`/`SPB`/`Audit Trail`/`Settings`;
  `PAGE_GROUPS` = urutan sidebar). Field baru `menuLabel` (nama submenu sidebar, HANYA tampilan matrix; `label` tetap
  dipakai pesan "tidak punya akses") & `parent` (page_key fitur/tombol, mis. Checklist di dalam Audit -> baris menjorok).
  Urutan baris = `ACCESS_MATRIX_ORDER` (urutan submenu) -- urutan `PAGE_REGISTRY` SENGAJA tidak diubah krn menentukan
  halaman awal login (`getDefaultLandingPath`). Matrix: ikon menu sidebar per grup, baris grup berisi ringkasan "n/m"
  per role (tetap informatif saat diciutkan), header role = jumlah halaman, Search page, legenda, lebar penuh, max-h
  70vh. Finance Handover 3 page_key kini 1 grup sendiri. page_key & data DB TIDAK berubah. **Halaman/page_key baru:
  isi `group` = menu sidebar-nya + tambahkan ke `ACCESS_MATRIX_ORDER`** (kalau lupa, tampil di akhir grupnya).
- `src/components/RequirePageAccess.tsx` — route guard (`pageKey` atau `adminOnly`).
- `AuthContext` panggil RPC `get_my_access()` saat login → `{is_admin, page_keys}`.
- **View-only vs edit**: `role_page_access.can_edit boolean default true`. `has_edit_access
  (p_page_key)` (pola sama `has_page_access`). `get_my_access()` juga balikin `edit_page_keys`.
  `AuthContext` expose `editPageKeys` + `canEdit(pageKey)`. Matrix UI: badge EDIT/VIEW toggle di
  sebelah checkbox akses. Granularitas TETAP per page_key terpisah (Audit Courier
  Checklist/Doc Validation/Cost Validation punya page_key sendiri, TIDAK otomatis ikut toggle
  edit halaman utama).
- **Kolom per role (2026-09-29, utk role Finance)** — `role_page_access.visible_columns` (jsonb
  array key kolom; NULL = semua kolom). Audit Courier & Rekapan Courier + (2026-10-02) page_key Finance `courier_finance`/
  `sea_air_finance` = kolom Invoice Recap (`recap:`) & Audit di Finance Handover (lihat "Finance melihat validasi Courier") (`COLUMN_ACCESS_PAGES`,
  export dari `SharedDataTable.tsx` — SATU-SATUNYA daftar kolom pilihan). Matrix UI: tombol
  `ALL`/`n/total` (ikon kolom) di sebelah badge EDIT/VIEW → `ColumnAccessModal` (checklist; semua
  dicentang = simpan NULL). RPC baca `get_my_column_access()` → `AuthContext.getAllowedColumns
  (pageKey)` (union antar role; salah satu role NULL = semua; Admin selalu semua). Di
  `SharedDataTable.tsx` filter `roleVisibleCols` diterapkan SEBELUM Customize View → otomatis ke
  tabel, Export, pilihan Customize View; form Edit/Add pakai `editFormCols`; Search hanya ke kolom
  diizinkan (`restrictSearchCols`, termasuk badge counter PPJK). Filter tanggal & badge % kolom
  Action TIDAK ikut dibatasi (keputusan user). **MURNI MERAPIKAN TAMPILAN, BUKAN KEAMANAN**: data
  kolom lain tetap terkirim ke browser (`select('*')`) → sengaja FAIL-OPEN (RPC gagal/kolom DB
  belum ada = semua kolom). Kalau kelak ada kolom yg harus RAHASIA, butuh redesain level DB
  (RPC/view per role), bukan fitur ini. Perubahan berlaku setelah user refresh (sama `get_my_access`).
  SQL (kolom + RPC) diberikan ke user 2026-09-29, dijalankan manual — isi lengkap di
  `docs/claude/courier-features.md` "Kolom per role".
  **Cakupan final: 20 dari 23 page_key** (semua 32 tabel RLS `policy_count=4`, semua 15 RPC
  penulis data — 14 unik+1 overload — punya guard `has_edit_access`+`SECURITY DEFINER`).
  3 page_key TIDAK ikut: `courier_upload`/`sea_air_upload` (upload lewat proxy Express ke n8n,
  bukan langsung Supabase, RLS tidak berlaku — proteksi cuma UI); `audit_trail` (baca-saja);
  `settings_roles` (admin-only via `isAdmin()`, bukan matrix).
  **PENTING — RPC `SECURITY DEFINER` bypass RLS total**: banyak RPC penulis data
  (`upsert_kurs_bi`, `update_seaair_row`, `insert_seaair_row`,
  `update_rekapan_far_overseas_manual`, `update_cost_validasi_far_overseas_manual`,
  `upsert_tarif_far_overseas_vendor`, `nonaktifkan_tarif_far_overseas_vendor`,
  `nonaktifkan_tarif_kontrak`, `upsert_kurs_rule_vendor`, `update_rekapan_po_vessel`,
  `update_validasi_matriks_manual`, `fn_delete_far_overseas_air`, `fn_delete_pib`,
  `fn_delete_cn`) adalah `SECURITY DEFINER` — tiap satu WAJIB ditambah
  `IF NOT public.has_edit_access('<page_key>') THEN RAISE EXCEPTION` di baris pertama body-nya,
  RLS tabel saja TIDAK CUKUP. **Nambah RPC baru yg menulis ke tabel ber-RLS: WAJIB cek dulu
  apakah `SECURITY DEFINER`, kalau ya WAJIB tambah guard manual.** RPC `SECURITY INVOKER`
  (`fn_hitung_storage`, `fn_save_storage_estimate`, `fn_update_actual_value`,
  `fn_apply_credit_note`, `fn_recompute_totals`, `fn_revise_credit_note`, `fn_archive_pib`,
  `fn_archive_cn`) otomatis ikut RLS tabel, tidak perlu guard tambahan. `get_kurs_efektif` murni
  baca, tidak perlu guard.
  `audit_po_ap_comp`/`tabel_surcharge_rule` dulu RLS bolong total (bisa diakses tanpa login) —
  SUDAH DITUTUP, sekarang bagian cakupan `admin_rates`/`audit_po` (`policy_count=4`). Catatan:
  `audit_po_ap_comp` diisi otomasi n8n tiap 30 menit — belum diverifikasi eksplisit otomasi itu
  tetap jalan setelah RLS aktif (perlu service role key).

### "Jabatan approval" per USER, per HALAMAN

**Desain final** (2 versi sebelumnya — `roles.approval_tier`, `profiles.approval_tier` global —
SUDAH DIGANTI, jangan reintroduce): tabel `user_approval_tiers` (`user_id`, `page_key`, `tier`,
PK gabungan) — 1 user maks 1 jabatan PER HALAMAN, bebas beda per halaman. Jabatan "berfungsi"
HANYA kalau user JUGA punya role dgn akses edit ke halaman itu (2 syarat independen: gating
ganda `canEdit(pageKey) && canApproveTier(pageKey, step)`). Daftar tier/label valid per halaman:
`PAGE_REGISTRY[].approvalTiers` (`src/lib/permissions.ts`) — `RoleManagementPage.tsx` otomatis
render dropdown baru tanpa ubah kode (`APPROVAL_TIER_PAGES` export).

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu**: SQL lengkap dipindah
ke `sql/021_user_approval_tiers.sql` (tabel `user_approval_tiers` + RPC `get_my_approval_tiers()`,
terpisah dari `get_my_access()` supaya tidak menulis ulang body yg battle-tested).

- `AuthContext.tsx` panggil paralel dgn `get_my_access()`, expose `approvalTiersByPage:
  Record<string,string>` + `canApproveTier(pageKey, tier)` (`isAdmin` selalu lolos). Fail-closed
  kalau RPC belum ada (`{}`), TAPI akses halaman biasa tetap jalan normal (fetchAccess tidak
  return-early).
- `permissions.ts` — `PageEntry.approvalTiers?: {value,label}[]`, `APPROVAL_TIER_PAGES`.
- `RoleManagementPage.tsx` — dropdown "Jabatan Approval" per halaman PER BARIS USER (panel "Roles
  per User"). `updateUserApprovalTier` — tier kosong = delete, terisi = upsert
  (`onConflict:'user_id,page_key'`). **TIDAK ADA bypass Admin di sini** (permintaan eksplisit:
  "admin tidak bisa bebas approval") — beda dari `canEdit`/akses halaman biasa yg Admin selalu
  bypass. HANYA gating approval-tier yg tidak otomatis lolos utk Admin.
- **Enforcement server-side** — approval lewat RPC `approve_far_overseas_air`
  (`SECURITY DEFINER`), BUKAN `.update()` langsung (versi lama, JANGAN reintroduce). SQL lengkap
  ada di bagian "FAR Overseas Air — PIC per-memo assignment" di bawah (versi TERBARU, sudah
  termasuk perubahan guard PIC).

## Translasi UI ke Bahasa Inggris (IN PROGRESS, per modul)

**Cakupan yg dikonfirmasi TIDAK diubah**: (1) nilai status di DATABASE tetap Indonesia
(`LENGKAP`/`PROSES`/`PENDING`/`REVISI`/dst) — kalau badge status mau ditranslate, WAJIB lewat
lapisan mapping render-only, JANGAN ubah nilai yg dikirim ke Supabase; (2) istilah domain
customs/logistik dibiarkan (PPJK/AWB/PIB/BM/DPP/SPTNP/NDPBM/CIPL/BPN/HS Code dst) — hanya label
sekitarnya yg ditranslate; (3) nama kolom/tabel database TIDAK diubah.

**TEMUAN KRITIS — field/rowLabel bisa jadi logic key, bukan cuma display**: di
`src/utils/ValidasiHelper.ts` & SECTIONS lokal `ValidasiModal.tsx`/`SeaAirValidasiModal.tsx`,
`field`/`rowLabel`/`compareDoc` dipakai SUBSTRING MATCHING di `computeStatus()` (mis.
`.includes("DPP (")`, `.includes("Tidak Ada Vessel")`) DAN sbg `groupKey` pengelompokan baris —
JANGAN translate `field`/`rowLabel`/`compareDoc`/`label`/`srcLabel` di SECTIONS mana pun tanpa
refactor `computeStatus()` dulu (pindah ke matching berbasis `id` stabil). `label`/`srcLabel`
aman diubah (murni display); `field`/`rowLabel`/`compareDoc` HARUS dicek dulu.

**Progress**: SELESAI — Sidebar/Greeting/Bunker/AccountPage/RoleManagementPage/Courier
Upload+Sea&Air Upload/Courier Audit&Rekapan/Courier Validasi (UI chrome saja)/Sea & Air (UI
chrome saja)/FAR Overseas Air (TERMASUK label kertas memo cetak, lihat di bawah)/Zoom 90%.
**BELUM**: Audit AP Local, Audit Trail, Settings hub, halaman admin, LoginPage.

**Kertas memo cetak FAR Overseas (`FarOverseasMemoPaper.tsx`) — pengecualian lama DICABUT
(2026-09-28)**: dulu label memo sengaja tetap Indonesia ("Disiapkan Oleh,"/"MOHON DIBANTU
BAYARKAN..."); spek redesain dari user menetapkan label Bahasa Inggris (Prepared By/Checked By/
PLEASE ARRANGE PAYMENT ON) dan HANYA isi Notes 1-4 yang tetap format baku Bahasa Indonesia (teks
dari DB, jangan ditranslate — regex `parseRouteNote` & format NOTE 3 bergantung padanya). Detail:
`docs/claude/far-overseas.md` bagian "REDESAIN FAR Overseas — TAHAP 1".

**Pengecualian lain yg dikonfirmasi eksplisit user**: `ValidasiModal.tsx` section
`s_no_vessel_imo` — `section.label`/`srcLabel` DITERJEMAHKAN ("NO VESSEL NAME AND IMO NUMBER"),
`rowLabel: "No Vessel/IMO Format"` (gabungan 3 row cipl05/po01/fi01), `hint: 'Match if empty'` —
TAPI `field` mentah (`"Format Pass: Tidak Ada Vessel & IMO"`, logic-critical) TIDAK disentuh.

**Regex logic-critical yg TIDAK BOLEH ditranslate**: `mapModeToJenisLayanan()`
(`FarOverseasAirHelpers.ts`) — mapping ke string Indonesia HARUS PERSIS sama dgn kolom
`jenis_layanan` di `far_overseas_tarif_vendor`. `inputPlaceholder: 'PENGIRIMAN DARI {ASAL} KE
{TUJUAN} (...)'` (kolom NOTE 1) — regex `parseRouteNote()` `/^PENGIRIMAN DARI (.+) KE (.+)
\((.+)\)$/i` WAJIB diikuti literal, translate hint tanpa translate regex bikin parse gagal diam2.

Komentar kode & CLAUDE.md ini TETAP Bahasa Indonesia (bukan scope translasi UI).


# Arsip versi lengkap dari CLAUDE.md lama (2026-10-06)

Versi ringkas & terkini ada di CLAUDE.md. Di sini versi lengkap (catatan per route, nomor SQL per RPC).

## (Arsip) Struktur routing & halaman (`src/App.tsx`)

Semua route (kecuali `/login`) dibungkus `<ProtectedRoute>` → `<MainLayout>` (sidebar) →
`<RequirePageAccess pageKey="...">`.

| Route | Komponen | Catatan |
|---|---|---|
| `/courier/upload`, `/sea-air/upload` | `UploadPage` (`fixedType`) | form upload dokumen ke n8n |
| `/courier/audit` | `CourierAuditPage` → `SharedDataTable` | tampilan "PIB & CN Audit" kartu/Open (2026-10-01) + toggle List ke tabel lama — lihat "Audit Courier — tampilan baru" di `docs/claude/courier-features.md` |
| `/courier/rekapan` | `CourierRekapanPage` → `SharedDataTable` | tampilan "Invoice Recap" 1 kartu = 1 AWB (2026-10-02) + toggle List ke tabel lama — lihat "Invoice Recap Courier per AWB" di bawah; sejak 2026-10-05 tombol Open DIHAPUS, Validation = panel samping (lihat "Panel Validation samping Invoice Recap Courier") |
| `/courier/validasi` | `CourierValidasiPage` | halaman mandiri, bukan `SharedDataTable` |
| `/finance-handover` | `FinanceHandoverPage` | Finance Handover GABUNGAN FAR Overseas + Sea & Air + Courier (2026-10-01; Courier 2026-10-02 sql/037, `RequirePageAccess pageKeys=[far_overseas_finance, sea_air_finance, courier_finance]`, sql/034+035). `/sea-air/finance` lama -> redirect ke sini; tab Finance Handover di halaman FAR -> link ke sini. Lihat "Finance Handover gabungan" di bawah |
| `/settings/seaair-vendors` | `SeaAirVendorMasterPage` | Master vendor Sea & Air (PPJK: nama legal + TOP hari), page_key `settings_seaair_vendors`, tabel `seaair_vendor_master` (sql/035) |
| `/settings/courier-vendors` | `CourierVendorMasterPage` | Master vendor Courier (PPJK tanpa "OWN ": nama legal + TOP hari), page_key `settings_courier_vendors`, tabel `courier_vendor_master` (sql/037). Kedua halaman vendor = komponen generik `VendorMasterPage.tsx` (prop `config`) |
| `/sea-air/audit`, `/sea-air/rekapan` | → `SharedDataTable` | Audit = tampilan "PIB Audit" (2026-09-30), Rekapan = tampilan "Invoice Recap" (2026-10-01) — keduanya kartu/Open + toggle List ke tabel lama; lihat "Audit PIB Sea & Air — tampilan baru" & "Invoice Recap Sea & Air — tampilan baru" di `docs/claude/bunker-courier-seaair.md` |
| `/direct-loading/:id?` (1 route, `:id` opsional sejak 2026-10-05) | `FarOverseasAirPage` | modul "FAR Overseas" di sidebar; `page_key`/route TETAP `direct_loading`/`/direct-loading` (label tampil "FAR Overseas"). Redesain tahap 1 (2026-09-28, tab Memos/My Approvals, gaya visual & font sendiri) — lihat `docs/claude/far-overseas.md`; tahap 2 = `sql/027_far_overseas_phase2_DRAFT.sql` (SUDAH DIJALANKAN 2026-09-30) |
| `/bunker` | `BunkerPage` | |
| `/audit-po` | `AuditPoPage` | read-only judul card, label menu "Audit AP Local" |
| `/audit-po-overseas` | `AuditPoOverseasPage` | label "Audit AP Overseas", DUPLIKASI SENGAJA `AuditPoPage` (tabel `audit_po_apovs_comp`) |
| `/pi-local` | `PiLocalPage` | tabel `audit_po_pi_local_comp`, duplikasi arsitektur sama dgn AuditPoPage/AuditPoOverseasPage |
| `/accounting-rekap` | `AccountingRekapPage` | tabel `accounting_rekap_finance`, sub-halaman "Compare Doc", lihat bagian "Accounting Rekap" |
| `/verification-qfp` | `VerificationQfpPage` | submenu "Compare Doc" › Verification QFP, page_key `verification_qfp` -- migrasi `Verification QFP.html`, lihat "Verification QFP" di bawah |
| `/lsa` | `LsaPage` | submenu "Compare Doc" › LSA, page_key `lsa` -- migrasi `LSA.html`, lihat "LSA" di bawah |
| `/spb/requisition-rh` | `RequisitionRhPage` | submenu "SPB" › Requisition RH, page_key `requisition_rh` -- migrasi `Manualbook.html`, lihat "SPB" di bawah |
| `/spb/oil-request` | `OilRequestPage` | submenu "SPB" › Oil Request, page_key `oil_request` -- migrasi `Oil Request.html`, lihat "SPB" di bawah |
| `/audit-trail` | `AuditTrailPage` → `SharedDataTable` (tab `trail`) | |
| `/settings` | `SettingsPage` | hub kartu-kartu modul admin (murni presentational, tanpa state) |
| `/settings/webhooks` | `WebhookSettingsPage` | Konfigurasi Webhook Otomasi — page_key `settings_webhooks`, diakses via kartu di `/settings` |
| `/settings/roles` | `RoleManagementPage` | admin-only |
| `/account` | `AccountPage` | |
| `/admin/rates` | `RateTablesAdmin` | tab: RateSheetDHL/FedEx/UPS, SurchargeDHL/FedEx, ZoneMappingEditor, NPWPEditor, PPJKCostRule, SurchargeCIPLRule (`src/pages/admin/`) |
| `/settings/fuel-surcharge` | `FuelSurchargePage` | |
| `/settings/kurs-bi` | `KursBIPage` | |
| `/settings/kurs-rule-vendor` | `KursRuleVendorPage` | |
| `/settings/tarif-kontrak` | `TarifKontrakPage` | |
| `/settings/tarif-far-overseas-vendor` | `FarOverseasVendorTarifPage` | |

**`SharedDataTable.tsx`** (`src/components/`, ~3800 baris) komponen generik besar: Courier
Audit/Rekapan, Sea & Air Audit/Rekapan, Audit Trail — dipilih via prop
`defaultMainTab`/`defaultSubTab`. Banyak logic bercabang berdasar
`activeMainTab`/`activeSubTab`, hati-hati saat edit.

- **Kolom AWB — beda SENGAJA antara Audit Courier & Rekapan Courier** (JANGAN disatukan):
  Audit Courier (`PIB_COLS`/`CN_COLS`, `awb` tanpa `type`) tampil APA ADANYA termasuk prefix
  carrier ("DHL NO."/"FEDEX No."). Rekapan Courier (`COURIER_COLS`, `type:'awb_strip_carrier'`)
  BUANG prefix carrier di tampilan (regex `.replace(/^(DHL|FEDEX)\s*NO\.?\s*:?\s*/i,'')`) — mode
  edit inline tetap raw. Sama pola dgn kolom `ppjk` (buang prefix "OWN"). Regex serupa di
  `ValidasiModal.tsx`/`ValidasiHelper.ts` untuk internal matching AWB, bukan display — di luar
  cakupan ini.
- **Filter tanggal Audit Courier** — berdasar `tgl_ppjk` ("PPJK Date"), BUKAN `created_at`.
  Rekapan Courier pakai `tgl_terima_email`. Kalau ada laporan "filter salah kolom", cek dulu
  apa datanya (`tgl_ppjk` kosong/beda), bukan otomatis curigai kode.
- **Sort default BEDA per tab Courier (2026-09-29)** — Audit Draft & Invoice Recap All PPJK =
  Created At langsung; Audit PIB/CN & Invoice Recap per-PPJK = kolom `sort_order` (drag manual),
  nilai awalnya dari trigger DB: Doc Acceptance (PIB/CN) / Email Received Date (per-PPJK), yang
  KOSONG selalu paling atas. Detail: "Sort default per tab Courier" di
  `docs/claude/courier-features.md`.
- **Padding halaman** — lihat "Pola UI yang harus diikuti" di bawah (standar `px-3`/`pt-2`/`pb-1`
  di semua halaman termasuk file ini).
- Dropdown Company Audit Courier (`activeCourierImporAnFilter`) — `max-w-[160px]` (2026-09, dulu
  `w-[48px] truncate` krn toolbar 1 baris kepotong di layar 14"; sejak toolbar Courier jadi 2
  baris, Company pindah ke baris 1 & ruangnya cukup — lihat "Toolbar 2 baris" di
  `docs/claude/courier-features.md`).
- Input tanggal filter (`filterStartDate`/`filterEndDate`) — `w-[82px]`, dipakai
  Courier/Sea & Air Audit/Rekapan + Audit Trail.
- **`CourierRekapanRowGroup`**: pairing PO↔Vessel dari `rec.po_pt_imi`/`rec.vessel` jalan kalau
  SALAH SATU field ada isinya (bukan cuma `po_pt_imi`) — dulu bug: `po_pt_imi` kosong bikin
  `vessel` hilang dari tampilan (tetap ada di data/export). Sudah fix, jangan reintroduce cek
  `if (typeof rec.po_pt_imi === 'string')` doang.
- **`getCellData()` formatting display-only**: kolom `ppjk` strip prefix "OWN ", kolom `awb`
  strip prefix carrier — murni tampilan, data mentah Supabase TIDAK berubah.

## (Arsip) Peta tabel Supabase (per modul)

**Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`, `user_approval_tiers`
(jabatan approval per user per halaman).

**Courier**: `rekapan_courier`, `tabel_audit_pib`, `tabel_audit_cn`, `tabel_cost_validasi`, `courier_vendor_master`
(sql/037, master vendor Finance Handover Courier), `cost_validasi_review_courier` (sql/038, review cost per invoice),
`cost_validasi_review_courier_item` (sql/041, Accept cost per baris), `courier_checklist_doc_log` (sql/041, riwayat centang Checklist),
kolom `rekapan_courier.tgl_invoice` (sql/042, dasar Due Date kartu Recap),
`dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`,
`tabel_processing_queue`. View `v_pib_lengkap`/`v_cn_lengkap` MASIH ADA tapi TIDAK DIPAKAI lagi
di frontend — Audit Courier sekarang query langsung `tabel_audit_pib`/`tabel_audit_cn`, kolom
kelengkapan di-merge manual di JS dari `dokumen_checklist` via `mergeChecklistData()` (cocokkan
`pib_id`/`cn_id`=`id`; cabang fallback `awb`-only lama sudah dead code, dicek 0 baris NULL).

**Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`,
`cost_validasi_catatan_seaair` (catatan konfirmasi manual per-segmen Cost Validation, 2026-09),
`dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`,
`kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`, `seaair_form_e_note` (sql/044, catatan manual Form E). Master vendor PPJK (Finance Handover, sql/035):
`seaair_vendor_master`.

**FAR Overseas Air (Direct Loading)**: `rekapan_far_overseas_air`,
`cost_validasi_far_overseas_air`, `far_overseas_signer_config`,
`far_overseas_air_processing_queue`. Tarif vendor (struktur quotation+periode, 2026-09):
`far_overseas_vendor_master`, `far_overseas_tarif_quotation`,
`far_overseas_tarif_quotation_detail` (`far_overseas_tarif_vendor` LAMA sudah TIDAK dipakai,
sisa backup `far_overseas_tarif_vendor_legacy_backup`).

**Bunker**: `bunker_dokumen`, `bunker_processing_queue`.

**Audit AP Local**: `audit_po_ap_comp` (otomasi backend).

**Accounting Rekap**: `accounting_rekap_finance` (otomasi backend, RLS baru cuma SELECT — lihat
bagian "Accounting Rekap" di atas soal gap INSERT/UPDATE/DELETE).
**Audit AP Overseas**: `audit_po_apovs_comp` (otomasi backend, duplikasi struktur).
**PI Local**: `audit_po_pi_local_comp` (otomasi backend, duplikasi struktur juga — lihat
"Audit AP Local" utk arsitektur 3-halaman duplikat).

**Admin/rate master (Courier)**: `tabel_rate_sheet_dhl`, `tabel_rate_sheet_fedex`,
`tabel_rate_sheet_ups`, `tabel_surcharge_dhl`, `tabel_surcharge_fedex`, `tabel_surcharge_rule`
(CIPL), `tabel_zone_mapping`, `tabel_ppjk_cost_rule`, `tabel_fuel_surcharge`.

**Reporting** (lihat bagian tersendiri di atas): `master_vessel`, `reporting_cost_allocation`
(snapshot hasil alokasi, sumbernya baca `rekapan_courier`/`rekapan_seaair`/
`rekapan_far_overseas_air`, BUKAN tabel baru miliknya sendiri).

**Lain-lain**: `v_audit_trail` (view gabungan Audit Trail).

## (Arsip) Peta RPC function Supabase

**WAJIB dibaca sebelum bikin RPC/function BARU apa pun** (2026-09, insiden nyata terjadi 2x dalam
sesi yang sama — lihat "Tarif Vendor FAR Overseas Air" di `docs/claude/far-overseas.md`): project
Supabase ini **DIPAKAI BERSAMA n8n** (workflow otomasi baca/tulis tabel & bisa saja punya
RPC/function sendiri yang TIDAK tercermin di kode frontend ini sama sekali) DAN oleh user
LANGSUNG lewat SQL Editor (RPC bisa dibuat user sendiri tanpa lewat sesi Claude Code). Akibatnya:
**sebelum membuat RPC/function baru, WAJIB tanya ke user dulu apakah fungsi dgn
nama/tujuan serupa sudah ada** — JANGAN asumsikan "belum pernah dibuat" hanya krn tidak ada di
daftar bawah ini atau tidak ada file SQL lokal utk itu. Insiden nyata yang sudah terjadi: (1)
sesi ini pernah bikin ulang RPC Tarif Vendor FAR Overseas dgn signature beda dari yang user SUDAH
buat sendiri duluan, gagal `CREATE OR REPLACE` (`42P13: cannot remove parameter defaults from
existing function`); (2) whitelist kolom `v_allowed_columns` di RPC yang dibuat user sendiri bisa
saja BEDA/basi dari asumsi dokumen ini. **Cara aman**: minta user jalankan
`select pg_get_functiondef('nama_fungsi'::regproc)` di SQL Editor dulu (kalau fungsi belum ada,
querynya akan error "does not exist" — itu sinyal aman utk lanjut bikin baru) SEBELUM menulis
`CREATE (OR REPLACE) FUNCTION` apa pun, terutama utk nama yang generik/mirip fungsi umum (`upsert_*`,
`update_*`, `get_*`) yang berpotensi sudah dipakai n8n atau dibuat user di sesi lain. Tidak ada
akses DB langsung dari sesi Claude Code manapun ke Supabase — daftar di bawah ini **disimpulkan
dari `grep -rhoE ".rpc\\('[a-zA-Z_0-9]+'" src/` di kode frontend, BUKAN dari `information_schema`
Supabase** — bisa saja sudah basi (RPC lain ditambahkan user langsung tanpa tercermin di sini).

- Auth: `get_my_access()`, `get_my_approval_tiers()`, `get_my_column_access()` (2026-09-29, batas
  kolom per role — lihat "Kolom per role" di bagian RBAC).
- FAR Overseas Air (List Memo & approval): `update_rekapan_far_overseas_manual`,
  `insert_rekapan_far_overseas_manual` (Add Manual Entry, 2026-09),
  `update_cost_validasi_far_overseas_manual`, `fn_delete_far_overseas_air`,
  `approve_far_overseas_air`, `reject_far_overseas_air`, `get_users_with_approval_tier`.
  Tahap 2 (sql/027, SUDAH dijalankan 2026-09-30): `fn_far_overseas_can_sign`,
  `fn_far_overseas_prepared_by_blockers`, `fn_far_overseas_undo_last_sign`,
  `fn_far_overseas_confirm_ai_finding`, `fn_far_overseas_log_reminder`,
  `fn_far_overseas_finance_accept`, `fn_far_overseas_mark_paid` (+ trigger nomor memo/log upload);
  tabel `far_overseas_memo_log`, `far_overseas_memo_counter`, `far_overseas_step_signers`.
- FAR Overseas Air — Tarif Vendor (struktur quotation+periode, 2026-09; RPC LAMA
  `upsert_tarif_far_overseas_vendor`/`nonaktifkan_tarif_far_overseas_vendor` SUDAH TIDAK DIPAKAI,
  lihat `docs/claude/far-overseas.md`): `upsert_far_overseas_vendor_master`,
  `upsert_far_overseas_tarif_quotation`, `upsert_far_overseas_tarif_quotation_detail`,
  `nonaktifkan_far_overseas_tarif_quotation`, `hapus_far_overseas_tarif_quotation_detail`.
- Sea & Air: `insert_seaair_row`, `update_seaair_row`, `update_rekapan_po_vessel`,
  `update_validasi_matriks_manual`, `update_cost_validasi_manual`, `get_kurs_efektif`,
  `upsert_kurs_rule_vendor`, `upsert_kurs_bi`, `nonaktifkan_tarif_kontrak`. Bagian 2 (sql/031,
  SUDAH DIJALANKAN 2026-10-01): `fn_seaair_unlock_submit`, `fn_seaair_reread_from_ai`, helper
  `fn_seaair_recap_issue_count` (+ 6 fungsi trigger `fn_seaair_*`). Finance Handover (sql/034, SUDAH
  DIJALANKAN 2026-10-01): `fn_seaair_finance_accept`, `fn_seaair_finance_mark_paid`. **sql/035 (SUDAH DIJALANKAN 2026-10-01)**:
  `fn_seaair_finance_accept(uuid, text, date)` (signature BARU: nama + tanggal terima; versi 1-arg DI-DROP),
  `fn_seaair_finance_mark_paid` referensi opsional, `fn_seaair_finance_undo` DI-DROP (diganti 2026-10-02 oleh
  `fn_*_finance_undo_receive` sql/040, Admin saja; keputusan
  user), FAR `fn_far_overseas_set_urgent(uuid, boolean)` BARU, `fn_far_overseas_mark_paid` bukti bayar opsional.
- FAR Overseas (sql/043, SUDAH DIJALANKAN 2026-10-05): `fn_far_overseas_unconfirm_ai_finding(uuid, text)` BARU, overload
  `fn_far_overseas_set_urgent(uuid, boolean, text)` BARU (versi 2-arg sql/035 tetap), `fn_far_overseas_confirm_ai_finding` &
  `fn_far_overseas_prepared_by_blockers` (signature sama, isi diperbarui), helper `fn_far_overseas_norm_key`/`_po_keys`/
  `_find_duplicates` + fungsi trigger `fn_far_overseas_auto_fields`.
- Courier panel Validation Invoice Recap (sql/041, SUDAH DIJALANKAN 2026-10-05): fungsi trigger `fn_courier_checklist_doc_log()` (trigger
  `trg_courier_checklist_doc_log` di `dokumen_checklist`); tanpa RPC (Accept cost per baris = upsert langsung, RLS).
- Courier review cost & kunci Submit (sql/038, SUDAH DIJALANKAN 2026-10-02): `fn_courier_unlock_submit(uuid, text)` (+ trigger
  `fn_courier_recap_lock`); tabel `cost_validasi_review_courier`.
- Courier Invoice Recap & Finance (sql/037, SUDAH DIJALANKAN 2026-10-02): `fn_courier_recap_awb_page`, `fn_courier_recap_summary`,
  `fn_courier_awb_norm`, `fn_courier_finance_accept(uuid, text, date)`, `fn_courier_finance_mark_paid(uuid, date, text)`
  (+ fungsi trigger `fn_courier_reaudit`, `fn_courier_reaudit_clear`).
- Courier Audit — Draft/Archive lifecycle (`SharedDataTable.tsx`, nama RPC dipilih dinamis via
  `isPib ? '..._pib' : '..._cn'`): `fn_delete_pib`/`fn_delete_cn`, `fn_archive_pib`/
  `fn_archive_cn`, `fn_undraft_pib`/`fn_undraft_cn`.
- Courier cost validation (`CostValidationModal.tsx`): `fn_hitung_storage`,
  `fn_save_storage_estimate`, `fn_update_actual_value`, `fn_apply_credit_note`,
  `fn_recompute_totals`, `fn_revise_credit_note`.
- Reporting (skalabilitas dropdown/stats, lihat `docs/claude/reporting.md`/`audit-po.md`):
  `fn_reporting_distinct_pt`, `fn_reporting_vendor_stats`, `fn_reporting_kategori_stats`,
  `fn_reporting_courier_distinct`.

Kalau ragu soal signature/param exact suatu RPC (terutama param baru dari sisi frontend), cek
dulu di Supabase SQL editor sebelum ubah pemanggilannya — jangan tebak dari nama parameter yang
"kelihatan masuk akal".

