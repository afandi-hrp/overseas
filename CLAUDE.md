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
  `AuditPoOverseasPage.tsx`/`PiLocalPage.tsx`). **`tsx` (dipakai `npm run dev`) TIDAK
  hot-reload perubahan kode `server.ts`** — beda dari Vite HMR utk frontend, tiap ubah
  `server.ts` WAJIB restart dev server manual, kalau tidak endpoint baru/berubah jatuh ke SPA
  fallback & balikin `index.html` biasa (bukan 404 tegas — gejalanya membingungkan).
- Verifikasi standar setelah edit: `npx tsc --noEmit` (harus bersih).
- **Browser tab title = "BeeHive"** — semua halaman pakai suffix `· BeeHive` di `document.title`
  (atau `index.html` default utk halaman yg tidak override, mis. `/login`). Halaman baru ikuti
  pola `'<Judul Halaman> · BeeHive'`.

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
- **Folder `sql/` DIHAPUS (2026-09-26, 2026-10-01, lalu LAGI 2026-10-02)** — 036–039 juga SUDAH dijalankan & diverifikasi
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

## Struktur routing & halaman (`src/App.tsx`)

Semua route (kecuali `/login`) dibungkus `<ProtectedRoute>` → `<MainLayout>` (sidebar) →
`<RequirePageAccess pageKey="...">`.

| Route | Komponen | Catatan |
|---|---|---|
| `/courier/upload`, `/sea-air/upload` | `UploadPage` (`fixedType`) | form upload dokumen ke n8n |
| `/courier/audit` | `CourierAuditPage` → `SharedDataTable` | tampilan "PIB & CN Audit" kartu/Open (2026-10-01) + toggle List ke tabel lama — lihat "Audit Courier — tampilan baru" di `docs/claude/courier-features.md` |
| `/courier/rekapan` | `CourierRekapanPage` → `SharedDataTable` | tampilan "Invoice Recap" 1 kartu = 1 AWB (2026-10-02) + toggle List ke tabel lama — lihat "Invoice Recap Courier per AWB" di bawah |
| `/courier/validasi` | `CourierValidasiPage` | halaman mandiri, bukan `SharedDataTable` |
| `/finance-handover` | `FinanceHandoverPage` | Finance Handover GABUNGAN FAR Overseas + Sea & Air + Courier (2026-10-01; Courier 2026-10-02 sql/037, `RequirePageAccess pageKeys=[far_overseas_finance, sea_air_finance, courier_finance]`, sql/034+035). `/sea-air/finance` lama -> redirect ke sini; tab Finance Handover di halaman FAR -> link ke sini. Lihat "Finance Handover gabungan" di bawah |
| `/settings/seaair-vendors` | `SeaAirVendorMasterPage` | Master vendor Sea & Air (PPJK: nama legal + TOP hari), page_key `settings_seaair_vendors`, tabel `seaair_vendor_master` (sql/035) |
| `/settings/courier-vendors` | `CourierVendorMasterPage` | Master vendor Courier (PPJK tanpa "OWN ": nama legal + TOP hari), page_key `settings_courier_vendors`, tabel `courier_vendor_master` (sql/037). Kedua halaman vendor = komponen generik `VendorMasterPage.tsx` (prop `config`) |
| `/sea-air/audit`, `/sea-air/rekapan` | → `SharedDataTable` | Audit = tampilan "PIB Audit" (2026-09-30), Rekapan = tampilan "Invoice Recap" (2026-10-01) — keduanya kartu/Open + toggle List ke tabel lama; lihat "Audit PIB Sea & Air — tampilan baru" & "Invoice Recap Sea & Air — tampilan baru" di `docs/claude/bunker-courier-seaair.md` |
| `/direct-loading`, `/direct-loading/:id` | `FarOverseasAirPage` | modul "FAR Overseas" di sidebar; `page_key`/route TETAP `direct_loading`/`/direct-loading` (label tampil "FAR Overseas"). Redesain tahap 1 (2026-09-28, tab Memos/My Approvals, gaya visual & font sendiri) — lihat `docs/claude/far-overseas.md`; tahap 2 = `sql/027_far_overseas_phase2_DRAFT.sql` (SUDAH DIJALANKAN 2026-09-30) |
| `/bunker` | `BunkerPage` | |
| `/audit-po` | `AuditPoPage` | read-only judul card, label menu "Audit AP Local" |
| `/audit-po-overseas` | `AuditPoOverseasPage` | label "Audit AP Overseas", DUPLIKASI SENGAJA `AuditPoPage` (tabel `audit_po_apovs_comp`) |
| `/pi-local` | `PiLocalPage` | tabel `audit_po_pi_local_comp`, duplikasi arsitektur sama dgn AuditPoPage/AuditPoOverseasPage |
| `/accounting-rekap` | `AccountingRekapPage` | tabel `accounting_rekap_finance`, sub-halaman "Compare Doc", lihat bagian "Accounting Rekap" |
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

## Auto-logout: idle 30 menit + logout paksa saat tab ditutup (`src/lib/AuthContext.tsx`)

**Idle timeout** (pre-existing): `IDLE_TIMEOUT_MS = 30 menit`, cek tiap 15 detik, aktivitas
`mousemove`/`mousedown`/`keydown`/`touchstart`/`scroll` (throttle 1x/5dtk), timestamp di
`localStorage` (`shipment_last_activity_ts`, sengaja bukan state lokal — sinkron antar-tab).

**Logout paksa saat tab ditutup** (keputusan desain DIKONFIRMASI user, jangan ubah tanpa
konfirmasi ulang): (1) **tutup 1 tab = logout SEMUA tab** (bukan hitung tab yg masih terbuka);
(2) **refresh (F5) TETAP AMAN**, tidak boleh ikut logout.

Mekanisme: tiap tab dapat `tabId` unik di `sessionStorage` (bertahan saat refresh, hilang saat
tab ditutup beneran). Saat unload (`pagehide`+`beforeunload`), tulis `PENDING_CLOSE_KEY`
`{tabId, ts}` ke `localStorage`. Kalau tab yg SAMA mount lagi (refresh) → hapus jejak sendiri,
tidak logout. Kalau tab lain masih hidup → dengar event `storage`, tunggu `CLOSE_CONFIRM_MS`
(1.5 detik) lalu kalau jejak belum dibatalkan → semua tab `signOut()`. Kalau tidak ada tab lain
hidup → dicek ulang saat tab baru mount (`pending.tabId !== tabId baru` DAN
`Date.now()-pending.ts > CLOSE_CONFIRM_MS`) → logout saat mount. Keterbatasan diterima:
force-kill browser tidak terdeteksi (idle-timeout jadi jaring pengaman independen).

## Pindah tab browser TIDAK boleh me-refresh halaman (`AuthContext.tsx`, 2026-10-01)

Supabase memancarkan ulang event `SIGNED_IN` tiap tab browser kembali fokus (user & token sama).
AuthContext tetap mengecek ulang akses di background (`fetchAccess`/`fetchProfile`), TAPI state hanya
diganti kalau isinya BENAR-BENAR berubah (`keepSet`/`keepJson`/`sameSession` di atas `AuthProvider`):
`allowedPageKeys`, `editPageKeys`, `approvalTiersByPage`, `columnAccessByPage`, `profile`, dan `session`
(sama = user id + `access_token` + `expires_at` sama; token hasil refresh tetap mengganti sesi).
**Root cause bug lama**: objek baru tiap fokus -> `restrictSearchCols` (bergantung `columnAccessByPage`)
dibuat ulang -> `fetchRecords` SharedDataTable dibuat ulang -> tabel Courier / Sea & Air ter-refresh.
**Aturan**: setter state akses/profil/sesi di AuthContext WAJIB lewat helper ini (jangan `setX(new ...)`
polos lagi); hook di halaman boleh bergantung pada nilai-nilai itu tanpa takut refetch saat pindah tab.
Perubahan hak akses oleh Admin tetap terbaca saat event berikutnya. Logika lock screen/auto-logout TIDAK
disentuh. Diuji (AuthContext asli + SharedDataTable, jsdom): SIGNED_IN ulang -> 0 fetch tabel; kode lama
terbukti gagal di uji yang sama.

## Lock screen (`AuthContext.tsx`, `App.tsx`, `LockScreen.tsx`)

Auto-logout (idle atau tab-tertutup) SELAGI tab yg sama masih terbuka → JANGAN lempar ke
LoginPage kosong, tampilkan halaman TERAKHIR di-blur+`inert` + panel kecil minta PASSWORD SAJA.
Password benar → halaman hidup lagi tanpa reload. TAPI kalau tab BENERAN ditutup+sesi habis
(dibuka lagi nanti, React tree fresh) atau user klik "Logout" manual → tetap LoginPage penuh
(2 pengecualian dikonfirmasi eksplisit).

- `hadSessionRef` (ref, bukan localStorage, reset tiap tab baru): true permanen begitu session
  pernah truthy di tab ini. `manualSignOutRef`: true selama proses `signOut()` sengaja (tombol
  Logout) — supaya lock screen tidak muncul utk logout disengaja. `frozenRef`: snapshot
  `{session, profile, allowedPageKeys, editPageKeys, approvalTiersByPage, isAdmin}` TERAKHIR
  sebelum sesi hilang — context yg di-expose ke halaman TIDAK PERNAH ikut null selama
  `lockScreenActive`, tetap pakai nilai beku ini (supaya `useEffect([user?.id])` di halaman lain
  tidak ke-trigger ulang oleh transisi session->null sementara).
  `lockScreenActive = !session && hadSessionRef.current && !manualSignOutRef.current`.
- `App.tsx` `ProtectedRoute`: SELALU render struktur yg SAMA (`<div><div className={lockScreenActive
  ? 'blur-md brightness-95' : 'contents'} inert={lockScreenActive||undefined}><Outlet/></div>
  {lockScreenActive && <LockScreen/>}</div>`) — kalau strukturnya berubah kondisional, React
  unmount+remount seluruh halaman (persis kebalikan tujuannya). Redirect check:
  `if (!session && !lockScreenActive)`.
- `unlock(password)`: `signInWithPassword({email dari frozenRef, password})`. Sukses →
  `onAuthStateChange` existing otomatis isi session lagi → lockScreenActive false sendiri.
  `unlockInFlight` flag menekan `loading` global selama proses unlock (fix bug flash-spinner:
  email sama dgn null-transisi bikin `isRealUserChange` salah anggap user id berubah).
- `resolveStaleCloseTrace(tabId)` (ASYNC, dipanggil PALING AWAL sebelum `getSession()`) — fix bug
  "tab ditutup semalam, dibuka lagi besok tapi lihat LockScreen bukan LoginPage": kalau tab
  sebelumnya terbukti beneran tertutup, `signOut()` dipanggil DULU sebelum `getSession()` supaya
  sesi basi tidak pernah sempat kelihatan truthy (`hadSessionRef` tidak pernah ke-set salah).

### Catatan permanen — lock screen & idle-logout (final, JANGAN diubah tanpa alasan baru)

- Semua panggilan `signOut()` (idle-timeout, `resolveStaleCloseTrace`, tab-lain-tertutup) WAJIB
  `await` + `console.error('[Auto-logout] ... gagal', error)` — fire-and-forget lama bikin sesi
  lokal tidak kehapus diam2 kalau revoke ke server gagal (root cause insiden lama, sudah fix).
  Log `[Auto-logout]` SENGAJA DIBIARKAN utk diagnosa laporan serupa ke depan. `IDLE_TIMEOUT_MS`
  = 30 menit (final, PERNAH diturunkan ke 5 menit utk testing lalu dikembalikan).
- Modal via React Portal ke `document.body` (mis. `FarOverseasAirDetailModal`,
  `BunkerCompareDocModal`) ikut ter-blur+`inert` saat lock aktif lewat DOM API generik ke semua
  child `<body>` KECUALI portal LockScreen sendiri — cover portal apa pun otomatis, TAPI portal
  BARU yg muncul SETELAH lock aktif tidak ikut ter-lock (risiko rendah, `#root` sudah inert).
- bfcache restore (tombol Back dari situs lain) dipaksa `window.location.reload()` via listener
  `pageshow` (`event.persisted===true`) supaya tidak menampilkan snapshot sebelum lock aktif.
- `frozenRef` REDACT `access_token`/`refresh_token`/`provider_token`/`provider_refresh_token`
  (`'[redacted-while-locked]'`) — JWT lama tetap valid ~1 jam walau `signOut()` sukses.
- Keterbatasan INHEREN diterima: blur+inert murni visual, DevTools (F12) tetap bisa baca DOM
  mentah. Threat model: "orang lewat tanpa sengaja", BUKAN penyerang teknis+akses fisik+DevTools.

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

## Zoom 90% otomatis di layar laptop 14" (`src/index.css`)

`@media (max-width:1600px){html{zoom:90%;}}` — pakai `zoom` (BUKAN `transform:scale`, app ini
banyak pakai `position:fixed`/sticky, `transform` bikin containing block baru yg merusak semua
fixed/sticky positioning). Non-standar CSS, Firefox lama tidak dukung (fallback aman: tampil
100% normal, bukan rusak). Breakpoint 1600px = heuristik viewport width kasar utk laptop 14",
BUKAN deteksi ukuran fisik — kalau ada laporan salah kalibrasi, sesuaikan angka.

**Bug ditemukan & diperbaiki — strip putih di bawah halaman**: CSS `zoom` TIDAK ikut menyesuaikan
unit `vh` di Chromium (`100vh` dihitung dari window asli, baru di-shrink visual 90%, sisa ruang
expose background body putih). Fix, DI DALAM media query yg sama:
```css
.h-screen { height: calc(100vh / 0.9); }
.min-h-screen { min-height: calc(100vh / 0.9); }
```
Otomatis cover semua pemakaian class ini. TIDAK dikompensasi utk `vh` spesifik non-fullpage (mis.
modal `h-[92vh]`) — trade-off minor diterima kecuali ada laporan spesifik.

## Shell "tinggi tetap + scroll internal" — Bunker, AuditPo*, PiLocal, CourierValidasi

Pola wajib utk halaman list (replika `SharedDataTable.tsx`/`FarOverseasAirPage.tsx`): wrapper
terluar `flex flex-col overflow-hidden` (BUKAN `overflow-y-auto` di 1 halaman penuh — sudut
rounded card List akan ikut ter-scroll lewat & kelihatan "kotak" kalau salah). `<header>`+toolbar
`shrink-0`. Kartu List `flex-1 flex flex-col min-h-0`. Wrapper `<table>`
`overflow-x-auto overflow-y-auto flex-1 min-h-0`, `<thead className="sticky top-0 z-20">`.
Pagination footer `shrink-0`. Diterapkan di `BunkerPage.tsx`, `AuditPoPage.tsx`,
`AuditPoOverseasPage.tsx`, `PiLocalPage.tsx`. `KategoriPicker` dropdown `z-30` (di atas thead
z-20). `CourierValidasiPage.tsx` sudah pola shell sama tapi list-nya kartu bukan `<table>`, lihat
bagian tersendiri di bawah.

## Pola UI wajib (dikonsolidasi)

- **Warna brand**: ungu `#5A305A` (hover `#73507B`) tombol aksi utama & ikon header. Beberapa
  tombol lama masih `bg-blue-600` (belum semua dimigrasi) — samakan ke `#5A305A` saat menyentuh
  halaman lama & diminta user.
- **Header halaman** (pola wajib, contoh: `FarOverseasVendorTarifPage.tsx`, `KursBIPage.tsx`):
  ```jsx
  <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
    <header className="px-3 pt-1 pb-1">
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
    <main className="max-w-7xl mx-auto px-3 pt-2 pb-8">
      ...
    </main>
  </div>
  ```
  Header **full-width** (BUKAN di dalam `max-w-* mx-auto`, atau `<Greeting/>` kepental ke bawah
  judul di layar sempit). Nilai STANDAR (SEMUA halaman baru wajib ikuti — versi lama `pb-2`/
  `pt-3`/`pt-4`/`px-6`/`px-4` sudah tidak berlaku): `header` `px-3 pt-1 pb-1`; `main` `px-3`,
  top-padding `pt-2`, `max-w-7xl` (tabel lebar)/`max-w-2xl`/`max-w-5xl` (form sempit). Bottom
  padding `main` **`pb-2`** utk SEMUA halaman list "shell tinggi tetap" (`BunkerPage.tsx`,
  `AuditPoPage.tsx`, `AuditPoOverseasPage.tsx`, `PiLocalPage.tsx`, `SharedDataTable.tsx`,
  `CourierValidasiPage.tsx`, `FarOverseasAirPage.tsx` — diselaraskan 2026-09, laporan user margin
  bawah tabel tidak sejajar sidebar) — HANYA `RateTablesAdmin.tsx`/`FuelSurchargePage.tsx` masih
  `pb-4` (belum diminta diselaraskan, cek user dulu).
  `px-3` berlaku SEMUA halaman (16 file + `SharedDataTable.tsx` diseragamkan 2026-09) — jarak ke
  sidebar & tepi layar sama persis. **Halaman baru WAJIB `px-3`, JANGAN `px-6`/`px-4`.**
- **`<Greeting />`** (`src/components/Greeting.tsx`) — sapaan waktu + ikon + tanggal (`en-US`),
  satu sumber kebenaran, dipasang hampir semua halaman kecuali `/login`.
- **Panel filter tabel**: 1 kartu (`bg-white rounded-2xl shadow-sm border border-slate-200 p-4`),
  semua kontrol dalam 1 baris (`flex flex-nowrap items-center gap-3 overflow-x-auto`, BUKAN
  `flex-wrap`). Dropdown utk banyak opsi, bukan pill buttons. Tombol "Tambah ..." di ujung kanan
  (`ml-auto`).
  **Pagination**: client-side kalau data fetch semua sekaligus (`page`/`pageSize` state,
  `useMemo` slice, reset `page` ke 1 saat filter berubah, footer "Showing X-Y of Z" +
  Chevron tombol). AuditPo*/PiLocal pakai **server-side** pagination (`.range()`, tabel besar).
- **Modal**: overlay `fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70..9999] flex
  items-center justify-center p-4`, box `bg-white rounded-2xl shadow-2xl`. Modal
  antrian/upload lebar mengikuti layar (`w-[70vw] max-w-3xl`/`w-[85vw] max-w-6xl`).

## Dokumentasi modul terpisah (2026-09, CLAUDE.md dipecah krn kepanjangan)

CLAUDE.md ini awalnya 1 file ~3300 baris — dipecah (2026-09) supaya lebih ringkas. Bagian di ATAS
(Tech stack s/d Pola UI wajib) + BAWAH (Navigasi mobile s/d Peta RPC) TETAP di sini (aturan
lintas-modul/app-wide). Detail per-modul dipindah ke file terpisah via `@import` — Claude Code
otomatis memuat isinya sbg bagian dari instruksi proyek ini, JADI TETAP DIBACA PENUH tiap sesi,
cuma lokasinya dipisah. **Susulan (2026-09) — dipadatkan lagi**: beberapa bagian narasi panjang
(riwayat diagnosa idle-logout, audit keamanan lock screen, progress translasi) diringkas jadi
kondisi final saja (SQL migrasi belum dijalankan & aturan arsitektur tetap dipertahankan utuh di
tiap file modul, TIDAK ikut dipangkas). Kalau butuh detail riwayat lengkap versi lama, cek git
history file ini.

@docs/claude/far-overseas.md
@docs/claude/bunker-courier-seaair.md
@docs/claude/audit-po.md
@docs/claude/courier-features.md
@docs/claude/reporting.md

## STATUS & SISA PEKERJAAN — Audit & Invoice Recap Sea & Air + Courier / Finance Handover (per 2026-10-02)

**DAFTAR TERKINI (satu-satunya acuan)** — 2 bagian "BACKLOG" di bawahnya = riwayat (item dicoret = selesai).
Semua SQL (027–035, 037–039) SUDAH jalan di production. Kode SELESAI & lolos uji jsdom/PGlite, tapi **BELUM dites
user di production** (testing bagian 2 + Finance Handover dijadwalkan user bersamaan dgn pekerjaan lain).

**Audit PIB Sea & Air (`/sea-air/audit`) — belum:**
1. Freight otomatis per delivery term (FOB/FCA = invoice "Freight · destination" BL sama, hanya baris
   ocean/air freight, THC tidak; EXW = "Freight · origin"; CIF/CFR = 0; tidak ada di Recap = manual + label
   sumber). Sekarang `total_inv_freight` dipakai apa adanya. Butuh keputusan aturan per baris invoice.
2. Log Edit per field & Delete PIB format app ("X — Lama: … → Baru: …"). Aksi utama (Mark audited,
   re-audit, Re-read, submit/unlock, review) SUDAH dicatat trigger sql/031.
3. Banner "shipment belum tercatat" (Recap tanpa baris Audit PIB) — belum ada cara deteksi; sementara
   chip "Waiting for …" di kartu Draft.
4. Status validasi "Shipment still being processed in Invoice Recap" — belum ada sumber data.
5. Draft otomatis saat 4 dokumen bea cukai lengkap (PIB/SPPB/Billing DJBC/BPN) + log "Recorded
   automatically…". Sekarang baru: PIB baru dari AI otomatis Draft (sql/032).
6. Valas per PO kosong kalau n8n tidak mengisi `po_harga_detail` (ditambal tab "Split evenly") — cek
   workflow n8n ekstraksi PIB.
7. (Ditahan, keputusan user) Export format workbook 31 kolom — Export TETAP seperti sekarang.

**Invoice Recap Sea & Air (`/sea-air/rekapan`) — belum:**
1. Quotation freight per BL: tombol "+ Add quotation" SUDAH ada (info "coming soon"); belum ada tabel
   quotation, pembacaan AI (n8n), tarif berlaku pada ATA, "Save & re-check".
2. Upload dokumen susulan via n8n (upsert by AWB, hasil AI lama tetap utuh) — pekerjaan sisi n8n.
3. Checklist per dokumen (tanggal upload, "3/4 · 1 file still missing", "Upload missing file", "Not
   needed" + alasan) & "Ask vendor for a new document" (perlu keputusan alur: email/WA/catatan).
4. Vendor payments (barang): termin DP/balance + bukti transfer.
5. Sort "Cost accuracy · lowest" & search nomor PO (PO di JSON `po_detail`, butuh RPC/kolom bantu).
6. Gerbang mismatch dokumen HANYA di frontend (DB hanya menegakkan checklist + cost; fuzzy relax ada di JS).
7. Segmen CUSTOM tidak bisa direview -> tidak dihitung issue walau Over/Under (perlu keputusan).
8. Indikasi duplikat (`duplicate_of`) baru chip — belum ada aksi "Not a duplicate"/gabung.
9. Kelompok "PIB value check" di tab Documents — belum ada sumber data terpisah.
10. (Ditahan, keputusan user) "Export cost data" 5 output — Export TETAP.

**Finance Handover (`/finance-handover`) — belum:**
1. ~~Sumber **Courier**~~ — SELESAI 2026-10-02 (per invoice, lihat "Invoice Recap Courier per AWB"; sql/037 SUDAH jalan).
2. Font: halaman Finance pakai Sora (keputusan user "semua halaman Sora"), TAPI modal FAR yg dibuka dari
   viewer masih Plus Jakarta Sans (modul FAR belum diubah) — konfirmasi user apakah FAR ikut Sora.
3. Keamanan: role Finance bisa membaca `tabel_audit_seaair` (berisi angka duty) lewat API krn policy baca
   viewer (sql/035). UI menyembunyikan; pengetatan butuh view/RPC khusus kalau diminta.
4. Master vendor Sea & Air: nama legal & TOP WAJIB diisi user (selama kosong tampil kode + tanda); hanya
   kode PPJK (`emkl_vendor`); kolom `aktif` belum dipakai saat pencocokan; tanpa tombol hapus.
5. Viewer FAR berganti modal antar tab -> ukuran dialog berubah (kosmetik).
6. (Dibatalkan, keputusan user) upload bukti transfer & Undo — TIDAK dibuat.
7. Courier: ~~viewer hanya dialog 1 invoice~~ — 2026-10-02 viewer = jendela Validation BACA SAJA (lihat "Finance melihat
   validasi Courier"); master vendor Courier (nama legal + TOP) WAJIB diisi user; page_key `courier_finance`/
   `settings_courier_vendors` WAJIB di-assign ke role.
8. Keamanan Courier: policy `rekapan_courier_select_finance` membuka SEMUA baris `rekapan_courier` (bukan hanya yg
   sudah submit) utk role Finance lewat API — UI hanya menampilkan yg ber-`submit_date`. Persempit kalau diminta.

**Audit Courier (`/courier/audit`) — status (keputusan user 2026-10-02):**
1. (Ditunda, belum dibutuhkan) Audit trail perubahan Checklist/Doc validation/Cost validation & log edit format app.
2. ~~Review cost per invoice~~ — SELESAI 2026-10-02 (sql/038, SUDAH dijalankan 2026-10-02) — lihat "Courier 2026-10-02 bagian 2".
3. (Diterima user) Tab Draft fetch & paging di browser — Draft hanya sementara, tidak perlu RPC gabungan.
4. ~~Kolom auto-calc & Reporting~~ — TIDAK PERLU TINDAKAN (dicek 2026-10-02): 7 kolom auto-calc Audit TIDAK dibaca
   Reporting (hanya app/export, sudah live-calc). Reporting membaca APA ADANYA 6 kolom auto-calc **Invoice Recap**
   (`breakdown_*_vessel` Cost by Vessel, `total_amount` Cost by Courier) — query baca user: 164 invoice, `total_amount`
   kosong 0, beda dari adm+duty+freight 0, `breakdown_freight_vessel` kosong 0 -> n8n/app sudah mengisi benar. Kalau
   kelak ada laporan "angka Reporting 0/beda dgn Invoice Recap", ulangi query itu dulu (opsi perbaikan: Reporting memanggil
   `computeCourierRekapanCalc` saat membaca, atau trigger DB).
5. Upload additional doc = n8n MENIMPA `dokumen_validasi` (konfirmasi user). Doc validation yang sudah tersimpan diperbarui
   lewat tombol **Recompute document data** (2026-10-02: isi + perbarui field yang belum diedit manual) + banner jumlah
   field yang punya data dokumen lebih baru.
6. ~~2 versi validasi~~ — logika DISAMAKAN 2026-10-02 (review cost, Recompute, cek error simpan Doc validation); sisa beda
   hanya tampilan & autosave (mode List) vs tombol Save (jendela baru) — keputusan user sebelumnya.

**Invoice Recap Courier (`/courier/rekapan`) — status (keputusan user 2026-10-02):**
1. ~~Badge "needs attention"~~ — SELESAI 2026-10-02: AWB yang masih punya invoice belum di-submit DAN validasi PIB/CN < 100%
   (badge merah sidebar + tombol filter "Needs attention").
2. (Keputusan user) 3 AWB "Not found in Audit" = data tambah manual, bukan n8n — biarkan dgn label itu.
3. Re-audit otomatis tetap (dijelaskan ke user: tanpa tombol, otomatis saat nominal/AWB/PO invoice diedit setelah Audited).
4. ~~Submit tanpa kunci~~ — SELESAI 2026-10-02 (sql/038, SUDAH dijalankan 2026-10-02): kunci setelah Submit + Unlock Admin, sama Sea & Air.
5. (Keputusan user) Tanpa issue count / review per invoice di Recap untuk sementara.
6. (Keputusan user) Edit tetap lewat tabel List; Export TETAP.

**Umum:** semua halaman di atas belum diuji user di production; `kurs` text bug SUDAH diperbaiki; badge
sidebar needs attention SUDAH; pindah tab browser tidak refresh SUDAH (lihat bagian AuthContext).

## Redesain Courier mengikuti Sea & Air — STATUS (2026-10-01)

**Tahap 1 Audit Courier SELESAI** (tampilan kartu/Open/Edit, lihat "Audit Courier — tampilan baru" di
`docs/claude/courier-features.md`). **Susulan 2026-10-01**: jendela Open = tab Overview | Documents (Checklist + Doc validation
per field, tanpa tabel) | Costs (kartu per invoice, klik angka/status, bar Save/Discard) | Audit trail — SAMA pola
jendela Open Invoice Recap Sea & Air; data & cara simpan tetap (lihat "Tab Documents / Costs / Audit trail ala
Invoice Recap Sea & Air" di file yang sama). Doc validation mode embedded TIDAK autosave lagi (keputusan user).
**Mode List** (2026-10-02, keputusan user) = tampilan SEBELUM rombak (jendela Validation & form Add Data lama, file
`*Legacy.tsx`) — lihat "Mode List = tampilan SEBELUM rombak" di `docs/claude/courier-features.md`. **Keputusan user permanen**: Mark as audited TIDAK PERNAH dikunci walau
validasi belum lengkap (ada kasus invoice freight memang tidak ditagihkan) — JANGAN tambah gerbang validasi
Courier. Tab tetap Draft/PIB/CN (tanpa "All"). Fitur tabel lama tetap di mode List.
**Tahap 2 & 3 SELESAI (kode, 2026-10-02)**: Invoice Recap Courier per AWB + relasi Audit↔Recap (re-audit otomatis)
+ sumber Courier di Finance Handover — lihat "Invoice Recap Courier per AWB" di bawah (sql/037 SUDAH DIJALANKAN 2026-10-02).
Analisa awal (RIWAYAT, sebelum tahap 1):
- **Bisa** dibuat tampilan sama (kartu + jendela Open + form Edit + KPI, toggle List = tabel lama tetap
  utuh dgn Reorder/Edit Mode/Customize View/Export). Token `SeaAirAuditUi.tsx` & pola komponen bisa dipakai.
- **Audit Courier paling cocok**: kolom PIB_COLS/CN_COLS hampir identik `SEA_AIR_AUDIT_COLS` (customs value,
  BM/PPN/PPh, total_pib_cn, SPTNP, PO per baris). Beda: 2 jenis dokumen (PIB & CN/SPPBMCP, `sanksi_adm`),
  tab Draft/PIB/CN, auto-calc 7 kolom + `manual_override_fields`, NAS Submit Date (highlight + badge
  outstanding), Doc Acceptance, urutan manual `sort_order`, jendela Validation 3 tab yg SUDAH ada (bisa jadi
  isi jendela Open), dan **batas kolom per role (Finance)** yg WAJIB ikut di kartu/Open.
- **Rekapan Courier beda model**: 1 baris = 1 INVOICE (FREIGHT/DUTY/CREDIT NOTE) per AWB, bukan 1 shipment
  dgn banyak segmen spt Sea & Air; tab per-PPJK; PO↔vessel + breakdown per vessel (auto-calc 6 kolom);
  sudah punya `submit_date` & `tgl_lunas`. Perlu keputusan: kartu per invoice atau digabung per AWB.
- **Relasi Audit↔Rekapan Courier** hanya lewat AWB (tanpa FK spt `seaair_id`); validasi Courier menempel di
  baris PIB/CN Audit. Gerbang/kunci/re-audit ala Sea & Air butuh pencocokan AWB + SQL baru.
- Saran urutan bila disetujui: (1) Audit Courier tampilan, (2) Rekapan Courier tampilan, (3) relasi &
  sumber Courier di Finance Handover. Pertanyaan keputusan dicatat di jawaban sesi.

## Rombak Invoice Recap Courier — keputusan user (2026-10-02, SUDAH DIKERJAKAN — lihat bagian berikut)

Hasil inspeksi `sql/036` (2026-10-02): rekapan 157 baris, audit 92; 3 AWB Recap tanpa pasangan Audit (2 format EMS,
1 nyata); 31 AWB punya >1 PPJK; 0 AWB punya PIB & CN sekaligus; kolom `rekapan_courier.pib_id`/`cn_id` ADA; tidak
ada nama fungsi bentrok. Keputusan:
1. **1 kartu = 1 AWB** (AWB dinormalisasi tanpa prefix carrier), invoice Freight / Duty / Credit Note = tab di kartu/jendela.
2. Pagination **opsi B** = view/RPC kelompok per AWB di DB (SQL).
3. Tab per-PPJK hanya menampilkan invoice PPJK itu; "All PPJK" lengkap.
4. Urutan kartu = tanggal email diterima terbaru per AWB; drag `sort_order` tetap hanya di mode List.
5. Isi kartu: AWB, PPJK, A/N, origin, berat, PO +N / vessel, total semua invoice, chip status, titik validasi, Open.
6. Credit Note ditampilkan TERPISAH + tetap ada total akhir = Freight + Duty − CN.
7. Breakdown per vessel: per invoice di tab Invoices + ringkasan "Split per vessel" di Overview (pola "Split per PO").
8. **Edit tetap lewat tabel List** (tanpa form Edit baru); setelah save, kartu ikut ter-update.
9. Submit to Finance **per invoice + tombol "Submit all" per AWB**; **tanpa syarat** (bebas) & **tanpa kunci**.
10. Finance Handover sumber Courier: payee = nama PPJK, due date/TOP dari **master vendor baru**, Mark paid = kolom
    `tgl_lunas` yang sudah ada.
11. Tombol **Validation juga ada di kartu Invoice Recap** (selain di Audit).
12. Mode List = tampilan lama (pola Sea & Air & Audit Courier). Badge sidebar "needs attention" diputuskan terpisah.
13. KPI "AWB belum ada di Audit" DIGANTI chip merah "Not found in Audit" di kartu (setelah dijelaskan ke user).
14. **Re-audit otomatis DIPAKAI**: edit kolom nominal/AWB/PO di Recap oleh user setelah PIB/CN Audited -> PIB/CN kembali
    Draft + alasan (pola Sea & Air). Validasi dari Recap = aturan SAMA Audit (bisa diubah hanya selama PIB/CN Draft).
15. Finance Handover Courier **per invoice**; kolom baru `finance_received_at/_by` (opsi A); master vendor = **tabel baru
    khusus Courier** `courier_vendor_master` + halaman Settings sendiri.

## Courier 2026-10-02 bagian 2 — review cost, Recompute, needs attention, kunci Submit (sql/038 SUDAH DIJALANKAN 2026-10-02)

- **sql/038** (idempotent, pre-check nama `beehive:038`, uji PGlite 28 cek): tabel `cost_validasi_review_courier`
  (`doc_type` PIB/CN + `audit_id` teks + `section` FREIGHT/DUTY unik, `status_konfirmasi` MATCH/MISMATCH, catatan WAJIB utk
  MISMATCH, RLS 4 policy page_key `courier_cost_validation`); kolom `rekapan_courier.submit_unlock_reason/_by/_at`; trigger
  `fn_courier_recap_lock` (BEFORE UPDATE/DELETE: baris ber-`submit_date` hanya boleh ubah kolom Finance/`sort_order`, DELETE
  ditolak; submit baru dicatat audit_trail "Submit to Finance — Lama: - → Baru: <tgl>"; service lolos; flag
  `app.courier_unlock`); RPC `fn_courier_unlock_submit(uuid, text)` (Admin, alasan ≥5, ditolak kalau Finance sudah terima ATAU sudah
  lunas -- data lama: `tgl_lunas` terisi tanpa Received; dicatat audit_trail). **Efek saat 038 dijalankan**: SEMUA invoice
  lama yg sudah punya Submit Date (per 2026-10-02: 84 baris, 68 Waiting + 16 Paid) langsung TERKUNCI. RPC Finance Courier (037) tetap jalan di baris terkunci.
- **Review cost** (`CourierCostReviewHelpers.ts` SATU-SATUNYA query tabel, `CourierCostReviewBox.tsx` dipakai jendela baru &
  `CostValidationModalLegacy` [prop `legacy`]): kotak per invoice Freight/Duty, muncul kalau invoice ada selisih ATAU sudah
  direview; Accept difference (catatan opsional) / Ask vendor to revise (catatan wajib) / Change / Undo; hak = `canEdit`
  modal (Draft + `courier_cost_validation`). `computeLiveCostSummary(data, jenis, reviews)` — MATCH = baris selisih invoice
  itu dihitung OK & status invoice OK (baris detail tidak berubah); `section_diff` = ada selisih sebelum review. Badge persen
  (`fetchCourierValidationBadgePct`) ikut membaca review -> titik kartu, KPI, jendela, versi lama SAMA.
- **Persen validasi Courier dipindah** ke `src/utils/CourierValidationPct.ts` (isi sama): `mergeChecklistFields`
  (SharedDataTable `mergeChecklistData` = wrapper dgn `CHECKLIST_MERGE_FIELDS`), `fetchCourierValidationBadgePct`,
  `rowValidationPct` (re-export dari CourierValidationWindow), `courierValidationIncomplete`, `enrichCourierValidationPct`.
- **Recompute document data** (`src/utils/CourierDocRecompute.ts`, dipakai ValidasiModal & ValidasiModalLegacy): isi +
  perbarui sisi src/cmp yang BELUM diedit manual dari data dokumen terbaru (nilai kosong tidak menghapus, `manual_status`
  tetap); banner "N field(s) have newer document data" (`data-recompute-pending`). Versi lama kini juga cek error simpan.
- **Needs attention** (`recapGroupNeedsAttention`, `fetchCourierRecapAttentionGroups`, `fetchCourierRecapNeedsAttentionCount`
  di CourierRecapHelpers): AWB dgn invoice belum submit & PIB/CN validasi (tab yg boleh dilihat) < 100%/belum ada. Badge merah
  submenu Courier › Invoice Recap (MainLayout, refresh mount/masuk /courier/* & event Recap/Audit) + tombol filter "Needs
  attention" (kartu dihitung di browser, paging 12 sendiri).
- **Kunci di UI**: List (`CourierRekapanRowGroup`) baris ber-`submit_date` -> Edit/Delete hilang + "🔒 Locked"; jendela Open:
  chip Locked per invoice & header, **Unlock (Admin)** + alasan -> RPC, info "Last unlock". Konfirmasi Submit menyebut kunci.
- **Diuji**: jsdom `courier_lock` 30 cek + regresi render 95/page 51/recap 112/finance 53/urgent 5/authfocus 12/courier 41/
  courier_ui 56/courier_recap 44, PGlite 038 28 + 037 39 — 0 gagal. Belum dites di production.

## Finance melihat validasi Courier (2026-10-02, keputusan user; sql/039 SUDAH DIJALANKAN 2026-10-02)

Finance HARUS bisa melihat Checklist, Doc validation & Cost validation PIB/CN pasangan invoice Courier, TANPA bisa
mengubah. `CourierHandoverViewer` (`FinanceHandoverViewers.tsx`) = `CourierValidationWindow` yang SAMA Audit Courier
(tab Overview = rincian invoice & serah terima · Documents · Costs), `editAccess` semua false, `ChecklistModal` (kini
diekspor dari SharedDataTable) `canEdit={false}` -> tanpa Upload additional doc / Save / Accept / Correct / Recompute /
review / Deduct CN. Pasangan PIB/CN dicari SAMA Invoice Recap (`fetchRecapAuditLinks`: pib_id/cn_id, cadangan AWB);
tidak ketemu -> dialog rincian invoice saja + catatan. Tombol baris Finance Handover Courier: Invoice · Audit · Docs · Cost
(tetap "Accept to view" sebelum Finance menerima, sama sumber lain). **Berbeda dari Sea & Air** (angka duty disembunyikan
di Finance): Courier menampilkan semua krn invoice Duty Courier memang dibayar Finance ke PPJK.
**`sql/039`**: policy SELECT `<tabel>_select_courier_finance` (`has_page_access('courier_finance')`) di `tabel_audit_pib`,
`tabel_audit_cn`, `dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`, `tabel_cost_validasi`,
`cost_validasi_review_courier` — TANPA policy tulis (baca saja); role Finance tidak perlu akses halaman Audit Courier.
**Tab "Audit" (2026-10-02, keputusan user: tab di jendela invoice, kolom dipilih Admin PER ROLE, Courier + Sea & Air,
hanya baris pasangan handover)**: `FinanceAuditFields` (`FinanceHandoverViewers.tsx`, baca saja) -- Courier = tab "Audit PIB"/
"Audit CN" (prop BARU `extraTab` di `CourierValidationWindow`, nilai SAMA layar Audit: `computeCourierAuditCalc` + kolom
kelengkapan), kolom `FINANCE_AUDIT_COLS.courierPib/courierCn`; Sea & Air = tab "Audit PIB" di viewer Sea & Air (baris
`tabel_audit_seaair` via `seaair_id`, Balance/Insurance `computeSeaAirBalanceAsuransi`), kolom `FINANCE_AUDIT_COLS.seaair`
(muncul juga utk "earlier shipment" yg punya `seaair_id`). Kolom yg tampil = `getAllowedColumns('courier_finance' |
'sea_air_finance')` -> Admin mengatur di Kelola Role & Akses › tombol Columns di baris page_key Finance (dialog diberi
keterangan `COLUMN_ACCESS_NOTE`); NULL (belum diatur) = SEMUA kolom. **Pengecualian aturan "jangan tampilkan duty"
Sea & Air**: tab Audit PIB menampilkan kolom duty KALAU Admin tidak membatasinya (keputusan user: Admin yg memilih).
**Kolom Invoice Recap (2026-10-02, permintaan user)** -- mekanisme SAMA: 1 tombol Columns per page_key Finance berisi
"Invoice Recap · …" (key berawalan `recap:`, `FINANCE_RECAP_COLS` = COURIER_COLS / SEA_AIR_REKAPAN_COLS) + "Audit · …" (key
polos, kompatibel pengaturan sebelumnya); `splitFinanceColumns(allowed)` memecah per kelompok (NULL = semua; kalau diatur,
kelompok tanpa centang = tidak ada kolom -> pesan "ask an Admin"). Courier: tab Overview = kartu Handover (tetap) + kartu
"Invoice Recap" (kolom per role, menggantikan rincian invoice tetap); Sea & Air: tab BARU "Invoice Recap" (PO & Vessel
dari `po_detail`), tab Handover tetap. Header "Payable to · jumlah · due" selalu tampil. Tombol baris: Courier Invoice ·
Audit · Docs · Cost; Sea & Air Handover · Recap · Audit · Docs · Cost. Diuji: jsdom courier_recap 53, finance 57.
Cek user 2026-10-02: `get_kurs_efektif` SECURITY DEFINER (kurs tampil utk Finance); `fn_hitung_storage` INVOKER tapi hanya
dipakai panel Recalculate bonded storage yg tersembunyi di mode baca saja -> tidak perlu policy tambahan.
**Admin di Finance Handover** = diperlakukan sbg Finance (canEdit selalu true): daftar SAMA (hanya yg sudah submit),
bisa Accept/Mark paid, detail tetap "Accept to view" sebelum diterima. Diuji: jsdom courier_recap 49 cek, PGlite 039 4.

## Invoice Recap Courier per AWB + Finance Handover Courier (2026-10-02, kode SELESAI, sql/037 SUDAH DIJALANKAN 2026-10-02)

Detail tampilan: "Invoice Recap Courier — tampilan baru per AWB" di `docs/claude/courier-features.md`. Ringkas:
- **File**: `src/utils/CourierRecapHelpers.ts` (SATU sumber: `courierAwbNorm` [upper, buang prefix huruf+"NO.", sisa
  A-Z0-9 — SAMA `fn_courier_awb_norm` SQL], `buildRecapGroup`, `invoiceKind`/`invoiceAmount` [CN = nilai absolut],
  `splitPerVessel`, `fetchCourierRecapPage`/`fetchCourierRecapSummary` [RPC + FALLBACK browser kalau RPC belum ada],
  `fetchRecapAuditLinks` [`pib_id`/`cn_id` dulu, cadangan AWB ternormalisasi], `submitRecapInvoices`; auto-calc 6
  kolom `computeCourierRekapanCalc` DIPINDAH ke sini, isi tidak berubah), `CourierRecapCardList.tsx` (5 KPI + kartu,
  paging 12/halaman sendiri), `CourierRecapDetailModal.tsx` (Open). SharedDataTable: cabang `isCourierRecapView`.
- **sql/037** (idempotent, pre-check nama berkomentar `beehive:037`, uji PGlite 39 cek): kolom `rekapan_courier.
  finance_received_at/_by`, `paid_reference`, `paid_by`; `tabel_audit_pib/cn.reaudit_reason/_at`; `fn_courier_awb_norm` +
  index ekspresi; RPC baca `fn_courier_recap_awb_page` & `fn_courier_recap_summary` (SECURITY INVOKER, ikut RLS);
  trigger `fn_courier_reaudit` (AFTER UPDATE rekapan_courier, user saja) & `fn_courier_reaudit_clear` (Mark as audited
  menghapus alasan); tabel `courier_vendor_master` (RLS 4 policy, seed kode PPJK tanpa OWN); policy SELECT
  `rekapan_courier_select_finance`; RPC `fn_courier_finance_accept(uuid,text,date)` & `fn_courier_finance_mark_paid(uuid,
  date,text)` (guard `has_edit_access('courier_finance')`, Mark paid mengisi `tgl_lunas`).
- **(Historis) Sebelum 037 jalan**: kartu & KPI tetap jalan lewat fallback (semua baris tab PPJK diambil, dikelompokkan di browser;
  KPI "not in audit" tidak dihitung); re-audit otomatis belum aktif; Finance Handover Courier tampil baca saja + banner.
- **page_key baru**: `courier_finance` (Finance Handover Courier, EDIT = Accept/Mark paid) & `settings_courier_vendors`
  — BELUM di-assign ke role mana pun (hanya Admin sampai di-assign di Kelola Role & Akses).
- **Diuji**: jsdom 44 cek (kartu/grup/urutan/total − CN, tab PPJK, Search, Open Overview/Invoices/Audit trail, Submit per
  invoice & Submit all, Validation dari Recap, Edit in List, view-only, batas kolom role, Finance Courier Accept/Mark paid
  + viewer, master vendor Courier & Sea & Air), regresi render 95/page 51/recap 112/finance 53/urgent 5/authfocus 12/
  courier 39/courier_ui 56 — 0 gagal. Belum dites di production.

## BACKLOG — Audit PIB Sea & Air, tahap berikutnya (dicatat 2026-09-30) — RIWAYAT, lihat "STATUS & SISA PEKERJAAN" di atas

**DITAHAN (keputusan user 2026-10-01)** — backlog ini BELUM dikerjakan krn berkaitan dgn redesain
halaman Invoice Recap Sea & Air (spek "BeeHive AI · Invoice Recap" V167: validasi, Submit to
Finance, Partial PO, freight quotation, log, export). Kerjakan bareng/sesudah redesain Invoice
Recap, JANGAN dikerjakan terpisah tanpa konfirmasi user.

Tahap 1 (tampilan kartu/Open/Edit + query baca, lihat "Audit PIB Sea & Air — tampilan baru" di
`docs/claude/bunker-courier-seaair.md`) SUDAH jadi. Item di bawah berasal dari spek prototipe user
("BeeHive AI · Audit PIB", V165) & SENGAJA ditunda krn butuh DB/n8n/keputusan bisnis. Kerjakan
satu per satu, konfirmasi user dulu (terutama yg menyentuh SQL/RPC — ikuti aturan "Peta RPC").

1. ~~**Syarat "validated" sebelum Mark as audited**~~ — SELESAI bagian 2 (lihat "Relasi Audit PIB ↔
   Invoice Recap" di bawah: syarat = Recap 0 issue). Catatan lama: sekarang tombol Mark as audited / "Save & mark
   as audited" BISA diklik kapan saja (keputusan user: "nanti diupdate"). Spek: hanya boleh kalau
   status = validated (`fetchSeaAirAuditLinkInfo`), selain itu tampil pesan "<alasan> — the PIB can
   be marked as audited once it is validated in Invoice Recap". Idealnya juga ditegakkan di server
   (guard di RPC `update_seaair_row` saat `status` -> LENGKAP; cek `pg_get_functiondef` dulu).
2. ~~**Re-audit otomatis**~~ — SELESAI bagian 2 (trigger `trg_seaair_reaudit`, sql/031). Lama: PIB Audited kembali Draft + chip ungu "↻ Changed in Invoice Recap —
   please re-audit" kalau shipment-nya diedit di Invoice Recap. Butuh trigger DB/n8n + kolom
   penanda (mis. `reaudit`), belum ada.
3. ~~**"Re-read from Invoice Recap"**~~ — SELESAI bagian 2 sbg "Re-read from AI" (snapshot
   `ai_snapshot`, RPC `fn_seaair_reread_from_ai`). Lama: timpa edit manual dgn nilai hasil baca AI dari PIB upload
   (+ dicatat di log). Butuh nilai asli AI tersimpan terpisah (kolom/tabel baru atau n8n ulang).
4. ~~**Partial PO**~~ — SELESAI bagian 2 (`po_manual`, Edit shipment Recap). Lama: per PO centang Partial + nomor partial + mata uang (diisi di Invoice Recap ›
   Edit), chip "◐ Partial n · USD x", hint "Invoice lebih kecil dari PO". Butuh field baru.
5. **Freight otomatis per delivery term** — FOB/FCA dari invoice "Freight · destination" (BL sama,
   hanya baris ocean/air freight, THC dikecualikan), EXW dari "Freight · origin", CIF/CFR = 0,
   tidak ada di Recap = manual + label sumber. Sekarang `total_inv_freight` dipakai apa adanya.
6. **Log aksi rapi per PIB** — tiap aksi (Mark audited, Reopen, Edit + field berubah, Delete,
   Re-read) ditulis ke log dgn format app (pola `logBunkerAudit`/`logAuditPoAudit`, format
   "{field} — Lama: X → Baru: Y" supaya lolos `TRAIL_APP_WRITTEN_FILTER`) + policy RLS
   `audit_trail` utk `tabel_audit_seaair`. Sekarang panel Audit trail hanya menampilkan
   aksi/waktu/user dari trigger `fn_audit_seaair` (isi dump mentah disembunyikan).
7. **Export format workbook 31 kolom** (spek §9: NO · PO · VENDOR · REMARKS · KURS · ... · TGL PIB,
   REMARKS dari partial PO, OTHER COST = DPP valas − item price, TOTAL = TOTAL PIB + SPTNP, CSV
   "PIB-audit-<tab>.csv") — user memutuskan Export TETAP seperti sekarang; baru dikerjakan kalau
   diminta ulang (bentrok dgn kolom tersimpan `remarks`/`other_cost`, perlu keputusan).
8. **Banner shipment belum tercatat** ("GMI · HDMUBSBW2608812 — not recorded yet · Waiting for
   SPPB") — butuh cara mendeteksi shipment Invoice Recap yang BELUM punya baris audit (checklist
   Sea & Air terikat `seaair_id` baris audit). Sementara diganti chip "Waiting for …" di kartu Draft.
9. **(Sebagian: `sql/032` PIB baru dari AI otomatis Draft — SUDAH DIJALANKAN 2026-10-01.)** **Draft dibuat otomatis saat 4 dokumen bea cukai lengkap** (PIB, SPPB, Billing DJBC, BPN) +
   log "Recorded automatically from Invoice Recap — Last customs document uploaded <tgl>" —
   perilaku n8n, belum diverifikasi/diubah.
10. **Status validasi tambahan** "Shipment still being processed in Invoice Recap" (spek §5) —
    belum ada sumber data yang membedakannya dari "Not validated yet".
11. ~~**Bug lama `kurs`**~~ — DIPERBAIKI 2026-10-01 (`SEA_AIR_AUDIT_COLS` `kurs` tanpa `type`, jadi
    teks; label/Export tetap "Kurs"). Catatan lama: kolom `tabel_audit_seaair.kurs` bertipe TEXT (kode mata uang, mis. USD)
    tapi `SEA_AIR_AUDIT_COLS` memberi `type:'num'` -> form Add Data/inline edit tabel LAMA (mode
    List) memakai input angka & `Number("USD")` = NaN (kemungkinan tersimpan null), tampilan bisa
    "-". Keputusan user: DICATAT dulu, belum diperbaiki. Form baru (`SeaAirAuditEditModal`) sudah
    memperlakukan `kurs` sbg teks.
12. ~~Delete PIB ikut menghapus Invoice Recap~~ — **KEPUTUSAN USER 2026-09-30: perilaku Delete
    TETAP SAMA seperti dulu, JANGAN diubah.** `DeleteModal` lama (dipakai juga tombol Delete di
    jendela Open) memang menghapus `rekapan_seaair`/checklist/validasi yg terhubung `seaair_id`.
    (Bukan backlog lagi, dicatat supaya tidak "diperbaiki" tanpa diminta.)
13. **Goods per PO — Valas/IDR per PO kosong** kalau `po_harga_detail` (PO Price Detail) kosong di
    DB (n8n tidak mengisinya utk sebagian PIB). Sekarang (keputusan user 2026-09-30): 1 PO -> pakai
    Item price (valas/Rp) sbg nilai PO itu; >1 PO -> **2 tab "As recorded" | "Split evenly"** di
    kartu Goods per PO jendela Open (tab awal Split evenly kalau PO Price Detail kosong, selain itu
    As recorded). Split evenly = Item price DIBAGI RATA **HANYA TAMPILAN** (chip "≈ split evenly",
    `splitMoneyEvenly`, TIDAK disimpan) + keterangan; form Edit punya
    tombol **"Split evenly"** (isi Amount valas tiap PO, baru tersimpan kalau user klik Save).
    Nilai asli per PO tetap sebaiknya diisi n8n ke `po_harga_detail` (cek workflow ekstraksi PIB) —
    begitu terisi, tampilan otomatis pakai nilai asli.

## Relasi Audit PIB ↔ Invoice Recap Sea & Air — "bagian 2" (2026-10-01, kode SELESAI, sql/031+032 SUDAH DIJALANKAN 2026-10-01)

Item yang menyangkut KEDUA halaman dikerjakan bareng. **Pelurusan user**: n8n HANYA membaca dokumen
dgn AI lalu menulis hasilnya ke Supabase — SEMUA otomatisasi dibuat di DB (trigger/fungsi), BUKAN
n8n; nama fungsi baru dipastikan belum ada (inspeksi `sql/030`/`030b`, + pre-check di awal 031 yg
membatalkan kalau ada fungsi bernama sama TANPA komentar `beehive:031`). Export TETAP.
"Penulis service" = `auth.email() IS NULL` (n8n / SQL Editor) — SELALU lolos semua guard di bawah.

**Keputusan user (jangan diubah tanpa konfirmasi ulang)**:
1. Konfirmasi validasi (review cost Accept/Ask vendor, edit nominal cost, Accept/Mark mismatch/
   **Correct** nilai dokumen) **HANYA Admin**. Edit Duty tetap boleh siapa pun yg punya hak edit.
2. **Submit to Finance** hanya kalau 0 issue (TIDAK ada "submit anyway"). Setelah submit baris
   **terkunci** (Edit/Delete/review/edit Costs & Documents nonaktif, DB menolak UPDATE/DELETE) —
   hanya **Admin** bisa **Unlock** dgn alasan (≥5 karakter), tercatat di audit trail.
3. **Mark as audited** (Audit PIB: tombol, "Save & mark as audited", menu "Move PIB to Audited" di
   Recap) hanya kalau PIB terhubung ke baris Recap DAN Recap-nya 0 issue (= sudah bisa Submit).
   PIB manual yg belum terhubung -> hanya bisa disimpan Draft.
4. Edit shipment di Recap (user) -> PIB terkait otomatis kembali Draft + chip/banner ungu
   "↻ Changed in Invoice Recap — please re-audit" (kolom `reaudit_reason`/`reaudit_at`).
5. Upload ulang AWB yg sama tanpa sadar -> ditandai **duplikat** (`duplicate_of`, chip merah) —
   TIDAK digabung/ditimpa. Upload dokumen susulan nanti via n8n (upsert by AWB) — hasil AI tetap utuh.
6. Quotation freight per BL: BARU tombol "+ Add quotation" (kartu Freight origin/destination tab
   Costs) — klik = info "coming soon"; pembacaan quotation oleh n8n menyusul.

**`sql/031`** (idempotent, uji PGlite 45 cek): kolom baru `rekapan_seaair.po_manual jsonb`,
`duplicate_of`, `submit_unlock_reason/_by/_at`; `tabel_audit_seaair.reaudit_reason/_at`,
`ai_snapshot jsonb`, `ai_snapshot_at`, `duplicate_of`. Fungsi: `fn_seaair_recap_issue_count`
(checklist <100 + cost Over/Under belum direview; doc mismatch TIDAK — fuzzy relax hanya ada di JS),
trigger `trg_seaair_guard_mark_audited`, `trg_seaair_recap_lock`, `trg_seaair_reaudit`,
`trg_seaair_snapshot_ai` (simpan nilai AI tiap tulis service), `trg_seaair_flag_duplicate`,
`trg_seaair_validation_admin_only` (catatan cost, `checks` cost, check dokumen `manual` yg
`match`/`values` berubah atau baru jadi manual), RPC `fn_seaair_unlock_submit(p_rekapan_id,
p_reason)` & `fn_seaair_reread_from_ai(p_seaair_id)` (Draft saja, kembalikan nilai AI; notes &
status tidak disentuh). Semua aksi dicatat ke `audit_trail` format app "X — Lama: … → Baru: …".
**`sql/032`**: `trg_seaair_auto_draft` — PIB baru dari service (status null/LENGKAP) -> ARCHIVED.
**Efek setelah dijalankan (2026-10-01)**: PIB/Recap LAMA tidak punya `ai_snapshot` (tombol Re-read
baru muncul utk baris yg ditulis n8n SETELAH 031) & `duplicate_of` hanya terisi utk insert baru;
baris Recap yg SUDAH punya `tgl_submit_finance` langsung TERKUNCI (perlu Unlock Admin utk dikoreksi);
insert dari SQL Editor juga dianggap service (ikut jadi Draft, lolos guard).

**Frontend**: `markAuditedBlocker()` (`SeaAirAuditHelpers.ts`, SATU-SATUNYA aturan blokir audited di
UI) dipakai `SeaAirAuditDetailModal`/`SeaAirAuditEditModal`; `fetchSeaAirAuditLinkInfo` kini juga
hitung `recapIssues`/`recapPoManual`. Recap: `isRecapLocked`, `parsePoManual`/`poManualFor`
(`SeaAirRecapHelpers.ts`); Costs/Documents tab terima `isAdmin`/`locked`; Edit shipment: field
"Submitted to Finance" DIHAPUS, KG/valas/currency/Partial per PO -> `po_manual` (hanya tampil kalau
kolomnya ada = 031 sudah jalan) + tombol "Split weight evenly"; Split per PO "By KG" otomatis kalau
SEMUA PO punya KG (toggle "As recorded"); chip Partial di Recap & Audit PIB. Issue `dokumen_kurang`
'-' (trigger kelengkapan isi '-' kalau lengkap) diabaikan.
**Uji**: jsdom Recap 112 cek, Audit page 51, render 95, PGlite 031 45 + 032 3 — 0 gagal.
Belum dites ke production.

**Keterbatasan / catatan**:
- Gerbang doc mismatch HANYA di frontend (DB cuma menghitung checklist + cost).
- Mode **List** (tabel lama) — SUDAH digate 2026-10-01: baris terkunci tampil chip "🔒 Locked" tanpa
  Edit/Delete, tombol "Audit" (undraft) nonaktif selama ada issue, modal lama Cost/Doc Validation
  `canEdit` = hak edit && Admin && tidak terkunci (edit Duty non-Admin lewat tab Documents jendela Open).
- (Historis) Sebelum 031 dijalankan: Submit/Mark audited sudah digate di UI, tapi tidak ada kunci DB, kolom
  `po_manual` tidak ada (form KG per PO tersembunyi), Unlock/Re-read RPC belum ada (error).
- RPC `update_cost_validasi_manual` dulu menghitung `SESUAI`/`TIDAK_SESUAI` (app memakai `MATCH`/
  `OVERCHARGE`/`UNDERCHARGE`) -> kolom ringkasan salah; DIPERBAIKI `sql/033` (signature sama, backfill
  baris lama opsional & dikomentari). Aplikasi tidak membaca kolom ringkasan itu.
- Belum: freight otomatis per delivery term, quotation per BL (n8n), bukti bayar (upload) di Finance
  Handover, status "still being processed".

## BACKLOG — Invoice Recap Sea & Air, tahap berikutnya (dicatat 2026-10-01) — RIWAYAT, lihat "STATUS & SISA PEKERJAAN" di atas

Tahap 1 (tampilan kartu/Open 4 tab + Edit shipment + Submit to Finance, lihat "Invoice Recap Sea &
Air — tampilan baru" di `docs/claude/bunker-courier-seaair.md`) SUDAH jadi. Item spek V167 yang
ditunda (butuh DB/n8n/keputusan) — kerjakan bareng backlog Audit PIB di atas:
1. ~~**KG per PO**~~ — SELESAI bagian 2 (`po_manual`, Split per PO "By KG").
2. ~~**Partial PO**~~ — SELESAI bagian 2.
3. ~~**Submit to Finance terkunci & berpagar**~~ — SELESAI bagian 2; halaman Finance Handover SELESAI
   2026-10-01, sekarang halaman GABUNGAN `/finance-handover` (FAR + Sea & Air, sql/034+035). Lama: sekarang tombol tetap bisa diklik walau ada issue
   (konfirmasi dulu), tidak ada kunci setelah submit (tanggal masih bisa dikoreksi di Edit
   shipment/tabel List). Halaman **Finance Handover** Sea & Air belum ada.
4. **Freight per BL "+ Add quotation"** (tombol SUDAH ada, isi menyusul n8n), tarif berlaku pada ATA, **"Save & re-check"** (n8n).
5. **Checklist per dokumen** (tanggal upload, "3/4 · 1 file still missing", "Upload missing file",
   "Not needed" + alasan) & **"Ask vendor for a new document"**.
6. ~~Tab Documents dibangun ulang penuh~~ — SELESAI 2026-10-01 (`SeaAirRecapDocumentsTab.tsx`,
   Accept/Mark mismatch/Correct/Undo/Duty inline, simpan RPC lama). Sisa: "Ask vendor for a new
   document" (item 5) & kelompok "PIB value check" (belum ada sumber data terpisah).
7. **Vendor payments (goods)** — termin DP/balance & bukti transfer.
8. **Export "Export cost data"** 5 output (keputusan user: Export TETAP seperti sekarang).
9. **Sort "Cost accuracy · lowest"** & **Search PO** (PO di JSON `po_detail`, butuh RPC/kolom).
10. ~~**Badge sidebar "needs attention"**~~ — SELESAI 2026-10-01 (badge merah submenu Invoice Recap,
    `fetchRecapNeedsAttentionCount`, definisi SAMA KPI halaman; dihitung saat mount, masuk /sea-air/*,
    & event `SEA_AIR_RECAP_CHANGED_EVENT`/`SEA_AIR_AUDIT_CHANGED_EVENT`).
11. **Review segmen CUSTOM** — tidak bisa dikonfirmasi (keputusan lama), jadi tidak dihitung issue
    walau Over/Under; konfirmasi user kalau mau diubah.

## Finance Handover gabungan FAR Overseas + Sea & Air (`/finance-handover`, 2026-10-01)

Spek user ("Finance Handover", BeeHive) — 1 inbox pengganti tanda terima kertas. **Keputusan user**:
1 halaman gabungan (menu sidebar sendiri "Finance Handover", ikon `Wallet`; tab FAR & submenu Sea & Air
lama dihapus/diarahkan); TANPA switch "View as" (peran = hak akses: EDIT page_key sumber = Finance, selain
itu view only + catatan Exim); nama lengkap PPJK + TOP dari **master vendor Sea & Air baru**; **TANPA upload
bukti transfer** (FAR & Sea & Air; Mark paid = tanggal + referensi bank opsional); **TANPA Undo**; font
**Sora** (bukan Plus Jakarta Sans spek); chip **Urgent** FAR = kolom + toggle di Edit memo.

- **File**: `src/pages/FinanceHandoverPage.tsx`, `src/utils/FinanceHandoverHelpers.ts` (SATU sumber
  `HandoverItem`, fetch, due/overdue, RPC), `src/components/FinanceHandoverViewers.tsx` (viewer FAR & Sea &
  Air), `src/pages/SeaAirVendorMasterPage.tsx` (Settings). DIHAPUS: `FarOverseasAirFinanceHandover.tsx`,
  `SeaAirFinanceHandoverPage.tsx`, `SeaAirFinanceHelpers.ts`.
- **Sumber**: FAR = memo `approval_status='APPROVED'` (Sent = tanggal sign TIER3; payee = `ship_via`; jumlah
  IDR, non-IDR tampil nilai asli + ≈ IDR; due = `due_date`/`expected_payment_date`). Sea & Air = baris
  `rekapan_seaair` dgn `tgl_submit_finance` (payee = `seaair_vendor_master.legal_name` via kode `emkl_vendor`,
  fallback kode + tanda "Full PPJK name not set"; jumlah = `computeLandedCost().landed` tanpa duty; due =
  submit + `top_days`, default 14 hari "(default)"). "Earlier shipment" = Sea & Air tanpa `seaair_id` atau
  tanpa Doc/Cost Validation -> hanya view Handover. Courier = tab abu "SOON". Overdue = belum Paid & due < hari
  ini (tile Received merah "<n> overdue"). Urut Sent terbaru.
- **UI**: 4 tile status = filter (ring ungu), segmented sumber (hanya sumber yg boleh dilihat), Search, PT,
  baris berwarna per tahap (amber/putih/hijau), timeline Sent→Received (nama penerima)→Paid. Finance:
  Accept (dialog "Received by" default nama profil + tanggal, error "Fill in the receiver name and date.") /
  Mark paid (tanggal transfer + referensi opsional); selama Waiting view diganti "Accept to view". Non-Finance:
  pill status. Toast "<ref> received." / "<ref> marked as paid.".
- **Viewer**: FAR = modal LAMA Memo/Documents/Cost dgn prop `tabBar` (tab geser). Sea & Air = dialog
  Handover (fakta + "Invoices in this handover" + Total payable) · Documents · Cost validation — dua tab
  terakhir = `SeaAirRecapDocumentsTab`/`SeaAirRecapCostsTab` mode **`financeView`** (baca saja; checklist tanpa
  PIB/SPPB/Billing DJBC/BPN/SPTNP, % & "Missing" dihitung ulang dari dokumen non-duty, section PIB & kartu
  Duty disembunyikan; Cost tanpa segmen CUSTOM & kartu Duty & tax + ringkasan "N of M invoices match the
  contract rate"). **Aturan: jangan tampilkan angka/dokumen duty di halaman ini.**
- **DB `sql/035`** (SUDAH DIJALANKAN 2026-10-01): lihat Peta RPC; kolom `rekapan_far_overseas_air.is_urgent`; tabel
  `seaair_vendor_master` (RLS 4 policy, unik `upper(btrim(vendor_code))`, diisi awal kode `emkl_vendor` yg
  ada); policy SELECT tambahan `sea_air_finance` ke `dokumen_checklist_seaair`, `dokumen_validasi_matriks_seaair`,
  `cost_validasi_seaair`, `cost_validasi_catatan_seaair`, `tabel_audit_seaair` (catatan: tabel Audit PIB
  berisi angka duty — tersembunyi di UI, tapi bisa dibaca role Finance lewat API).
  Sea & Air Receive menyimpan `finance_received_by` = nama yg diketik, `finance_received_at` = tanggal terima.
- **Urgent FAR**: toggle di Edit memo (section due date), tampil hanya kalau kolom ada; bisa diubah walau memo
  terkunci, selama belum Paid; disimpan di `saveRowEdits` lewat RPC `fn_far_overseas_set_urgent` (BUKAN whitelist
  `update_rekapan_far_overseas_manual`; `setVal` mengizinkan field ini khusus). Chip "Urgent" di kartu memo FAR &
  Finance Handover.
- **Diuji**: jsdom 53 cek (tile/filter/search/PT, Accept & Mark paid FAR + Sea & Air + RPC, viewer kedua sumber,
  view-only, master vendor, status Recap) + 5 cek toggle Urgent; PGlite 22 cek (035).

## Navigasi mobile -- hamburger + drawer (`src/components/MainLayout.tsx`, 2026-09)

Permintaan user (+ screenshot): top bar mobile (`md:hidden`) dulu nampilin SEMUA main tab +
subtab section aktif sbg 2 baris scroll horizontal LANGSUNG di top bar (padat, gampang salah
tap, kepanjangan kalau tab-nya banyak). **GANTI TOTAL** jadi pola umum "hamburger menu": top bar
mobile SEKARANG cuma logo "BeeHive" + 1 tombol ikon 3 garis (`Menu` dari `lucide-react`, state
`mobileMenuOpen`) -- klik buka **drawer** slide-in dari kiri (`motion.div`, `AnimatePresence`,
`initial/animate/exit x: '-100%'->0`, `w-[82vw] max-w-[19rem]`) + backdrop gelap terpisah
(`bg-black/50`, klik nutup drawer). Drawer isinya REPLIKA struktur menu desktop sidebar (main
tab + submenu expand), TAPI state expand submenu terpisah sendiri (`mobileExpandedTab`, BUKAN
reuse `expandedTab` desktop yg dikendalikan hover mouse -- gesture mobile beda, tap toggle
buka/tutup, bukan hover) + footer My Account/Settings/Logout (dulu di top bar versi lama,
sekarang pindah ke dalam drawer krn top bar sudah terlalu ringkas cuma logo+hamburger).

- **Auto-tutup drawer**: `useEffect([location.pathname])` set `mobileMenuOpen=false` tiap
  route berubah (jaring pengaman tambahan di luar `onClick` manual tiap link/tombol di dalam
  drawer yg SUDAH menutup manual juga -- dobel proteksi, bukan duplikasi bug).
- **`mobileExpandedTab` di-reset ke `activeMainTab` SETIAP drawer dibuka** (`useEffect([mobileMenuOpen,
  activeMainTab])`, BUKAN tiap `activeMainTab` berubah polos) -- supaya section yg lagi aktif
  otomatis muncul ter-expand tiap buka drawer, TAPI user tetap bebas ciutkan manual tanpa
  ke-expand paksa balik oleh render lain selama drawer masih terbuka.
- Tombol main tab TANPA `subTabs` (mis. FAR Overseas/Audit Trail) langsung `navigate()` +
  tutup drawer sekali klik (SAMA pola tab dgn subTabs yg diklik langsung dari header-nya sendiri
  -- beda dari tab BER-subTabs yg klik header-nya cuma toggle expand/collapse, harus lanjut klik
  salah satu subtab utk benar2 pindah halaman).
- 2 `<AnimatePresence>` independen di komponen ini (1 utk drawer mobile, 1 utk transisi konten
  halaman `key={location.pathname}` yg SUDAH ADA dari awal) -- React mengizinkan banyak instance
  `AnimatePresence` bersisian, TIDAK saling konflik.
- Desktop sidebar (`hidden md:block`) TIDAK disentuh SAMA SEKALI oleh perubahan ini -- cakupan
  MURNI `md:hidden` (mobile) saja.

## Struktur menu sidebar "Compare Doc" (`src/components/MainLayout.tsx`)

Bunker, Audit AP Local, Audit AP Overseas digabung 1 menu induk "Compare Doc" (icon
`GitCompare`) dgn submenu (2026-09 nambah subTab ke-4 "Accounting Rekap") — murni reorganisasi
sidebar, route/page_key TIDAK berubah. `basePath:'/compare-doc'` SENGAJA dummy (route-route ini
tidak berbagi prefix senada). `activeMainTab`
diperluas: kalau tab punya `subTabs`, cek juga `subTabs.some(s => pathBelongs(pathname,
s.path))`. `PAGE_REGISTRY` groups TIDAK ikut digabung (beda concern dari struktur visual).

## Loading state dibakukan — `LoadingState`/`LoadingTableRow` (`src/components/LoadingState.tsx`, 2026-09)

Semua teks loading data (dulu ~35 titik tidak konsisten, campur Inggris/Indonesia, 1 titik
sempat bocor nama backend "Loading data from Supabase...") dibakukan jadi **Inggris, "Loading
data..."**, spinner brand ungu — SENGAJA jadi pengecualian dari program Translasi UI (berlaku ke
SEMUA modul termasuk yang UI-nya sendiri belum diterjemahkan; **JANGAN anggap itu berarti modul
itu sudah selesai diterjemahkan penuh**, cuma teks loading-nya saja).

- **`LoadingState`** (blok penuh) — prop `label` opsional utk override teks (default dipakai di
  semua titik existing, demi konsistensi), prop `fullHeight` (default `true`) di-set `false`
  kalau parent tidak py tinggi eksplisit.
- **`LoadingTableRow`** — varian `<tbody><tr><td colSpan={N}>`, `colSpan` WAJIB = jumlah kolom.
- Sudah diterapkan ke SEMUA halaman/modal yang py loading state tabel/blok utama (Courier/Sea &
  Air/FAR Overseas/Bunker/Audit AP/Reporting/admin rate — cek `LoadingState.tsx` usage kalau perlu
  daftar lengkap). SENGAJA TIDAK diganti: spinner INLINE di tombol aksi (Save/Refresh/Login) —
  itu indikator "memproses aksi", beda konteks dari "memuat data awal".
- **Halaman baru WAJIB pakai `LoadingState`/`LoadingTableRow`** — jangan bikin blok spinner+teks
  manual baru (apalagi teks Indonesia/warna spinner selain ungu).
- **Spinner KAPSUL `LoadingSpinner` (2026-09-28, permintaan user)** — `w-8 h-4 shrink-0 border-4
  rounded-full animate-spin` (kapsul berputar, BUKAN lingkaran). Asalnya bug tak disengaja di
  `CourierValidasiPage` (`className="h-40 py-0"` bentrok `py-14` bawaan → spinner tergencet
  flexbox jadi 32×16), user suka tampilannya → dibakukan SENGAJA. SATU-SATUNYA definisi spinner
  loading data, dipakai `LoadingState`/`LoadingTableRow` + loading auth/akses halaman
  (`App.tsx`/`RequirePageAccess.tsx`, `variant="solid"` utk latar gradient) + overlay "Updating
  data..." `SharedDataTable.tsx` + 6 modal (Validasi/Checklist/Cost Validation Courier, Sea & Air,
  FAR Overseas). TIDAK ikut: spinner inline tombol aksi, indikator antrian proses (amber) Bunker/
  FAR, animasi UploadPage, ikon `RefreshCw` berputar. Loading data baru WAJIB pakai komponen ini.

## Peta tabel Supabase (per modul)

**Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`, `user_approval_tiers`
(jabatan approval per user per halaman).

**Courier**: `rekapan_courier`, `tabel_audit_pib`, `tabel_audit_cn`, `tabel_cost_validasi`, `courier_vendor_master`
(sql/037, master vendor Finance Handover Courier), `cost_validasi_review_courier` (sql/038, review cost per invoice),
`dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`,
`tabel_processing_queue`. View `v_pib_lengkap`/`v_cn_lengkap` MASIH ADA tapi TIDAK DIPAKAI lagi
di frontend — Audit Courier sekarang query langsung `tabel_audit_pib`/`tabel_audit_cn`, kolom
kelengkapan di-merge manual di JS dari `dokumen_checklist` via `mergeChecklistData()` (cocokkan
`pib_id`/`cn_id`=`id`; cabang fallback `awb`-only lama sudah dead code, dicek 0 baris NULL).

**Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`,
`cost_validasi_catatan_seaair` (catatan konfirmasi manual per-segmen Cost Validation, 2026-09),
`dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`,
`kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`. Master vendor PPJK (Finance Handover, sql/035):
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

## Peta RPC function Supabase

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
  `fn_seaair_finance_mark_paid` referensi opsional, `fn_seaair_finance_undo` DI-DROP (tanpa Undo, keputusan
  user), FAR `fn_far_overseas_set_urgent(uuid, boolean)` BARU, `fn_far_overseas_mark_paid` bukti bayar opsional.
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
