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
- **Folder `sql/` DIHAPUS (2026-09-26)** — semua file migrasi (001–026) SUDAH dijalankan ke
  production (konfirmasi user). Semua catatan "BELUM DIJALANKAN" di file ini & `docs/claude/*.md`
  TIDAK berlaku lagi; isi SQL lama ada di git history (001–023; 024–026 tidak pernah di-commit).
- **Kondisi DB production (stack `supabase3`, audit 2026-09-26)**: role `anon` tanpa hak apa pun
  di schema public (tabel, fungsi, default privileges); GraphQL ditutup; semua tabel RLS dgn
  policy `has_page_access`/`has_edit_access` (tidak ada `using (true)`); semua view
  `security_invoker`; semua RPC `SECURITY DEFINER` punya `search_path`; RPC tulis ber-guard.
  **Aturan objek baru**: tabel WAJIB RLS 4 policy; RPC `SECURITY DEFINER` WAJIB guard +
  `set search_path = public, extensions, pg_temp` + `revoke ... from public, anon`; view WAJIB
  `security_invoker`. Catatan "sudah ada guard" di dokumen lama PERNAH terbukti salah — selalu cek
  `pg_get_functiondef` live dulu.
- Signup publik (email & phone) DITUTUP di ketiga stack Supabase via env GoTrue
  (`DISABLE_SIGNUP=true`, phone signup/autoconfirm `false`). Stack `supabase`/`supabase2` BELUM
  diaudit level DB.

## Struktur routing & halaman (`src/App.tsx`)

Semua route (kecuali `/login`) dibungkus `<ProtectedRoute>` → `<MainLayout>` (sidebar) →
`<RequirePageAccess pageKey="...">`.

| Route | Komponen | Catatan |
|---|---|---|
| `/courier/upload`, `/sea-air/upload` | `UploadPage` (`fixedType`) | form upload dokumen ke n8n |
| `/courier/audit` | `CourierAuditPage` → `SharedDataTable` | |
| `/courier/rekapan` | `CourierRekapanPage` → `SharedDataTable` | |
| `/courier/validasi` | `CourierValidasiPage` | halaman mandiri, bukan `SharedDataTable` |
| `/sea-air/audit`, `/sea-air/rekapan` | → `SharedDataTable` | |
| `/direct-loading`, `/direct-loading/:id` | `FarOverseasAirPage` | modul "FAR Overseas" di sidebar; `page_key`/route TETAP `direct_loading`/`/direct-loading` (label tampil "FAR Overseas") |
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
- **Padding halaman** — lihat "Pola UI yang harus diikuti" di bawah (standar `px-3`/`pt-2`/`pb-1`
  di semua halaman termasuk file ini).
- Dropdown Company Audit Courier (`activeCourierImporAnFilter`) — `w-[48px] truncate` (dipersempit
  drastis, layar 14" toolbar filter kepotong sampai tab CN tidak kelihatan tanpa scroll).
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
chrome saja)/FAR Overseas Air (kecuali badan memo cetak, permanen)/Zoom 90%. **BELUM**: Audit AP
Local, Audit Trail, Settings hub, halaman admin, LoginPage.

**Pengecualian PERMANEN — badan memo cetak `FarOverseasAirDetailModal.tsx`**: istilah dalam kotak
border `#FFF5C5` (replika dokumen fisik) SENGAJA TETAP Indonesia ("Disiapkan Oleh,"/"Diperiksa
Oleh,", "Tanggal:", "NOTE :", "MOHON DIBANTU BAYARKAN...") — dokumen resmi dikirim ke pihak
eksternal, beda risiko dari teks UI biasa. `TIER_ACTION_LABEL`/`PIC_ACTION_LABEL` & teks PIC juga
ikut Indonesia utk konsistensi. **Satu-satunya bagian UI yg sengaja TIDAK ikut program translasi.**

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

## Peta tabel Supabase (per modul)

**Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`, `user_approval_tiers`
(jabatan approval per user per halaman).

**Courier**: `rekapan_courier`, `tabel_audit_pib`, `tabel_audit_cn`, `tabel_cost_validasi`,
`dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`,
`tabel_processing_queue`. View `v_pib_lengkap`/`v_cn_lengkap` MASIH ADA tapi TIDAK DIPAKAI lagi
di frontend — Audit Courier sekarang query langsung `tabel_audit_pib`/`tabel_audit_cn`, kolom
kelengkapan di-merge manual di JS dari `dokumen_checklist` via `mergeChecklistData()` (cocokkan
`pib_id`/`cn_id`=`id`; cabang fallback `awb`-only lama sudah dead code, dicek 0 baris NULL).

**Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`,
`cost_validasi_catatan_seaair` (catatan konfirmasi manual per-segmen Cost Validation, 2026-09),
`dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`,
`kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`.

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

- Auth: `get_my_access()`, `get_my_approval_tiers()`.
- FAR Overseas Air (List Memo & approval): `update_rekapan_far_overseas_manual`,
  `insert_rekapan_far_overseas_manual` (Add Manual Entry, 2026-09),
  `update_cost_validasi_far_overseas_manual`, `fn_delete_far_overseas_air`,
  `approve_far_overseas_air`, `reject_far_overseas_air`, `get_users_with_approval_tier`.
- FAR Overseas Air — Tarif Vendor (struktur quotation+periode, 2026-09; RPC LAMA
  `upsert_tarif_far_overseas_vendor`/`nonaktifkan_tarif_far_overseas_vendor` SUDAH TIDAK DIPAKAI,
  lihat `docs/claude/far-overseas.md`): `upsert_far_overseas_vendor_master`,
  `upsert_far_overseas_tarif_quotation`, `upsert_far_overseas_tarif_quotation_detail`,
  `nonaktifkan_far_overseas_tarif_quotation`, `hapus_far_overseas_tarif_quotation_detail`.
- Sea & Air: `insert_seaair_row`, `update_seaair_row`, `update_rekapan_po_vessel`,
  `update_validasi_matriks_manual`, `update_cost_validasi_manual`, `get_kurs_efektif`,
  `upsert_kurs_rule_vendor`, `upsert_kurs_bi`, `nonaktifkan_tarif_kontrak`.
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
