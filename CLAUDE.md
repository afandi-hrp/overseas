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

### Diagnostik idle-logout tidak jalan (2026-09, log tetap ada, JANGAN dihapus)

Ditemukan via baca source `@supabase/auth-js` `GoTrueClient._signOut`: dulu `signOut()` dipanggil
fire-and-forget (tanpa await/cek) — kalau revoke ke server GAGAL (network/firewall, bukan
404/401/403), `_signOut()` return awal TANPA `_removeSession()` — sesi lokal tidak pernah
terhapus, TANPA error terlihat. Fix: SEMUA titik panggil `signOut()` (idle-timeout,
resolveStaleCloseTrace, tab-lain-tertutup) sekarang `await` + `console.error('[Auto-logout] ...
gagal', error)`. Log diagnostik `[Auto-logout]` (idle threshold reached, lockScreenActive jadi
true, unlock gagal/berhasil) SENGAJA DIBIARKAN — berguna kalau ada laporan serupa lagi.
`IDLE_TIMEOUT_MS` sempat diturunkan ke 5 menit utk testing, SUDAH DIKEMBALIKAN ke 30 menit
setelah user konfirmasi mekanismenya terbukti benar (root cause "30 menit tidak jalan" adalah
soal durasi tes, bukan bug).

### Audit keamanan lock screen — 3 celah ditemukan & diperbaiki

1. **Modal via React Portal ke `document.body` tidak ikut ter-blur** (`FarOverseasAirDetailModal`/
   `BunkerCompareDocModal` preview cetak) — DOM-nya sibling dari `#root`, bukan child `<Outlet/>`.
   Fix: blur+`inert` diterapkan via DOM API langsung ke SEMUA child langsung `<body>` KECUALI
   node portal LockScreen sendiri (`LOCKSCREEN_PORTAL_ID`) — generik, otomatis cover portal baru
   manapun. `ProtectedRoute` disederhanakan balik ke `<Outlet/>` polos. Limitasi diterima: effect
   cuma jalan sekali saat lock aktif, portal BARU yg muncul SETELAH lock aktif tidak ikut
   tertutup (risiko rendah karena `#root` sudah inert, tidak bisa klik trigger apa pun).
2. **bfcache restore snapshot SEBELUM lock aktif** (Back dari situs lain) — fix: listener
   `pageshow` (effect terpisah, TIDAK di-gate `isAuthed`), kalau `event.persisted===true` paksa
   `window.location.reload()`.
3. **`frozenRef` menyimpan `access_token`/`refresh_token` mentah** selama lock aktif (JWT tetap
   valid ~1 jam walau `signOut()` sukses) — fix: `access_token`/`refresh_token`/`provider_token`/
   `provider_refresh_token` di-REDACT (`'[redacted-while-locked]'`) sebelum simpan ke `frozenRef`
   (dikonfirmasi tidak ada kode yg baca field itu dari context manapun).

Keterbatasan INHEREN diterima: blur+inert cuma visual, DevTools (F12) tetap bisa baca DOM mentah
— ini batas semua lock-screen client-side, bukan spesifik implementasi ini. Threat model: "orang
lewat tanpa sengaja", bukan "penyerang teknis + akses fisik + DevTools".

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

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu**:
```sql
create table if not exists public.user_approval_tiers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  tier text not null,
  primary key (user_id, page_key)
);
alter table public.user_approval_tiers enable row level security;
create policy "Admins manage user_approval_tiers" on public.user_approval_tiers
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Users read own approval tiers" on public.user_approval_tiers
  for select using (auth.uid() = user_id);

create or replace function public.get_my_approval_tiers()
returns jsonb language sql security definer stable as $$
  select coalesce(jsonb_object_agg(uat.page_key, uat.tier), '{}'::jsonb)
  from public.user_approval_tiers uat where uat.user_id = auth.uid();
$$;
grant execute on function public.get_my_approval_tiers() to authenticated;
```
(Kolom `roles.approval_tier`/`profiles.approval_tier` iterasi lama aman didiamkan/di-drop, sudah
tidak dipakai.) RPC ini SENGAJA terpisah dari `get_my_access()` (supaya tidak menulis ulang body
yg battle-tested tanpa akses DB langsung).

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

**Progress**: Sidebar/Greeting/Bunker/AccountPage/RoleManagementPage/Courier Upload (+Sea&Air
Upload otomatis ikut, file sama)/Courier Audit&Rekapan (STATUS_LABELS mapping display, sentinel
`'Semua'`→`'All'`)/Courier Validasi (HANYA UI chrome, SECTIONS lokal TIDAK disentuh — lihat
pengecualian `s_no_vessel_imo` rowLabel di bawah)/Sea & Air (SEA_AIR_*_COLS, SeaAirChecklistModal,
SeaAirValidasiModal UI chrome saja — `SeaAirValidasiModal.tsx` py SECTIONS-style data sendiri
`INVOICE_FCL_COLS` dkk, TIDAK disentuh)/FAR Overseas Air (SELESAI, KECUALI badan memo cetak
`FarOverseasAirDetailModal.tsx` — pengecualian PERMANEN, lihat bawah)/Zoom 90%/dst — SELESAI.
BELUM: Bunker page sendiri sudah selesai; Audit AP Local, Audit Trail, Settings hub, halaman
admin, AccountPage, LoginPage — BELUM.

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
  `CourierValidasiPage.tsx`) — HANYA `FarOverseasAirPage.tsx`/`RateTablesAdmin.tsx`/
  `FuelSurchargePage.tsx` masih `pb-4` (belum diminta diselaraskan, cek user dulu).
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

## FAR Overseas Air — PIC per-memo assignment (GANTI TOTAL dari `user_approval_tiers`)

Kolom **PIC** di List Memo (dulu `pic_name` text bebas, TIDAK terhubung otorisasi — siapa pun
dgn jabatan "PIC" bisa approve tahap PIC memo MANAPUN) SEKARANG dropdown pilih user per-baris —
user yg dipilih SATU-SATUNYA yg boleh approve tahap PIC memo itu. Dropdown "Jabatan Approval FAR
Overseas" di Kelola Role & Akses TIDAK LAGI berpengaruh ke tahap PIC (TETAP berlaku ke
TIER2/SPV & TIER3/Director). Baris belum di-assign PIC → TIDAK ADA SIAPA PUN eligible (termasuk
Admin).

- Kolom baru `rekapan_far_overseas_air.pic_user_id` (uuid, FK `profiles.id`) — SATU-SATUNYA
  sumber otorisasi tahap PIC. `pic_name` (text) tetap ada, murni kosmetik/cetak, auto-sync
  tiap `pic_user_id` berubah.
  **Fix bug**: `picDisplayName` di `FarOverseasAirDetailModal.tsx` dulu fallback ke `rec.pic_name`
  kalau PIC belum approve — begitu `pic_name` jadi hasil sync otomatis, nama PIC LANGSUNG muncul
  di "Disiapkan Oleh" walau belum approve. Fix: fallback DIHAPUS TOTAL (`picEntry?.nama || null`,
  konsisten dgn `eximName`).
- Dropdown PIC (`ctx.picUsers`) HANYA user yg SUDAH punya jabatan "PIC" (`user_approval_tiers`
  page_key='direct_loading' tier='PIC') DAN masih punya page access — RPC
  `get_users_with_approval_tier(p_page_key, p_tier)` (RPC lama `get_users_with_page_access`
  DIHAPUS). Ini CUMA mempersempit pilihan dropdown, BUKAN mengembalikan `user_approval_tiers` jadi
  mekanisme otorisasi PIC (itu tetap `pic_user_id` per-memo). Admin TIDAK otomatis muncul (RPC
  baru sengaja tanpa bypass `is_protected`).
- `FarOverseasAirHelpers.ts`: `pic_user_id` di `REKAPAN_EDITABLE_FIELDS` (`pic_name` tetap ada).
  `fetchPicEligibleUsers()` wrapper RPC baru.
- `FarOverseasAirDetailModal.tsx`: `isEligibleForStep(step)` — utk PIC cek `rec.pic_user_id ===
  user?.id` (BUKAN `canApproveTier`), step lain tetap `canApproveTier(...)`.

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu** (versi TERBARU RPC
approve/reject, guard PIC via `pic_user_id`, guard TIER1/2/3 tetap via `user_approval_tiers`):
```sql
alter table public.rekapan_far_overseas_air
  add column if not exists pic_user_id uuid references public.profiles(id);

drop function if exists public.get_users_with_page_access(text);

create or replace function public.get_users_with_approval_tier(p_page_key text, p_tier text)
returns table (id uuid, nama text, email text)
language sql security definer stable as $$
  select distinct p.id, p.nama, p.email
  from public.profiles p
  join public.user_approval_tiers uat on uat.user_id = p.id and uat.page_key = p_page_key and uat.tier = p_tier
  join public.user_roles ur on ur.user_id = p.id
  join public.role_page_access rpa on rpa.role_id = ur.role_id and rpa.page_key = p_page_key
  order by p.nama;
$$;
grant execute on function public.get_users_with_approval_tier(text, text) to authenticated;

create or replace function public.approve_far_overseas_air(
  p_id uuid, p_step text, p_nama text, p_jabatan text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_current_status text; v_expected_status text; v_new_status text;
  v_entry_tier_text text; v_entry jsonb; v_new_approvals jsonb;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;
  if p_step not in ('TIER1', 'PIC', 'TIER2', 'TIER3') then
    raise exception 'Invalid approval step: %', p_step;
  end if;

  -- TAHAP PIC: otorisasi dari pic_user_id PER-MEMO, BUKAN user_approval_tiers.
  -- TIER1/TIER2/TIER3 TETAP lewat user_approval_tiers.
  if p_step = 'PIC' then
    if not exists (
      select 1 from public.rekapan_far_overseas_air
      where id = p_id and pic_user_id = auth.uid()
    ) then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
  else
    if not exists (
      select 1 from public.user_approval_tiers uat
      where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = p_step
    ) then
      raise exception 'You do not have the % approval role', p_step;
    end if;
  end if;

  select approval_status into v_current_status from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;

  v_expected_status := case p_step when 'TIER1' then 'PENDING' when 'PIC' then 'TIER1_DONE'
    when 'TIER2' then 'PIC_DONE' when 'TIER3' then 'TIER2_DONE' end;
  if v_current_status is distinct from v_expected_status then
    raise exception 'This memo is not currently awaiting the % step (current status: %)', p_step, v_current_status;
  end if;

  v_new_status := case p_step when 'TIER1' then 'TIER1_DONE' when 'PIC' then 'PIC_DONE'
    when 'TIER2' then 'TIER2_DONE' when 'TIER3' then 'APPROVED' end;
  v_entry_tier_text := case p_step when 'PIC' then 'PIC' when 'TIER1' then '1' when 'TIER2' then '2' when 'TIER3' then '3' end;
  v_entry := case p_step
    when 'PIC' then jsonb_build_object('tier','PIC','nama',p_nama,'jabatan','PIC','approved_at',now(),'user_email',auth.email())
    else jsonb_build_object('tier', (case p_step when 'TIER1' then 1 when 'TIER2' then 2 when 'TIER3' then 3 end),
      'nama', p_nama, 'jabatan', coalesce(p_jabatan,'-'), 'approved_at', now(), 'user_email', auth.email())
  end;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_approvals
  from jsonb_array_elements(coalesce((select approvals from public.rekapan_far_overseas_air where id = p_id), '[]'::jsonb)) elem
  where (elem->>'tier') is distinct from v_entry_tier_text;
  v_new_approvals := v_new_approvals || jsonb_build_array(v_entry);

  update public.rekapan_far_overseas_air set approval_status = v_new_status, approvals = v_new_approvals where id = p_id;
  return jsonb_build_object('approval_status', v_new_status, 'approvals', v_new_approvals);
end;
$$;
grant execute on function public.approve_far_overseas_air(uuid, text, text, text) to authenticated;

create or replace function public.reject_far_overseas_air(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer as $$
declare v_current_status text; v_next_step text;
begin
  if not public.has_edit_access('direct_loading') then raise exception 'Not authorized to edit FAR Overseas Air memos'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Rejection reason is required'; end if;
  select approval_status into v_current_status from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if v_current_status in ('APPROVED', 'REJECTED') then
    raise exception 'This memo cannot be rejected (current status: %)', v_current_status;
  end if;
  v_next_step := case coalesce(v_current_status, 'PENDING')
    when 'PENDING' then 'TIER1' when 'TIER1_DONE' then 'PIC' when 'PIC_DONE' then 'TIER2' when 'TIER2_DONE' then 'TIER3' end;
  if v_next_step = 'PIC' then
    if not exists (select 1 from public.rekapan_far_overseas_air where id = p_id and pic_user_id = auth.uid()) then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
  else
    if not exists (
      select 1 from public.user_approval_tiers uat
      where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = v_next_step
    ) then
      raise exception 'You do not have the % approval role for this step', v_next_step;
    end if;
  end if;
  update public.rekapan_far_overseas_air set approval_status = 'REJECTED', notes = p_reason where id = p_id;
  return jsonb_build_object('approval_status', 'REJECTED', 'notes', p_reason);
end;
$$;
grant execute on function public.reject_far_overseas_air(uuid, text) to authenticated;
```
Kalau nemu versi LAMA function ini (guard PIC lewat `user_approval_tiers` polos), `create or
replace` di atas timpa otomatis — JANGAN reintroduce guard lama itu utk tahap PIC.

## FAR Overseas Air / Bunker — Clear massal Processing Queue

Tombol **"✕ Clear Completed/Failed"** di header modal Processing Queue (`FarOverseasAirPage.tsx`
& `BunkerPage.tsx`, implementasi independen masing2, TIDAK shared) — muncul kalau ada ≥1 item
SUCCESS/FAILED, hapus semua sekaligus. Tombol "×" per-kartu (`dismissQueueItem`) tetap ada.
PENDING/PROCESSING tidak ikut kehapus. Pakai `confirm()` native + `toastMessage` state existing.
Bug fix di satu halaman TIDAK otomatis ikut ke yg lain (2 implementasi independen).

## FAR Overseas Air — NOTE 2 dipecah "From Document" + "Manual Note"

Kolom NOTE 2 dulu 1 field `item_description` (hasil ekstraksi n8n TAPI juga bisa diedit manual →
nilai ekstraksi asli hilang tanpa jejak). Sekarang 2 bagian: **kiri "From Document"** =
`item_description` read-only selamanya; **kanan "Manual Note"** = kolom baru
`item_description_manual`, ikut pola `pendingEdits` biasa.

**BELUM DIJALANKAN ke Supabase — WAJIB manual**:
```sql
alter table public.rekapan_far_overseas_air add column if not exists item_description_manual text;
```
`item_description` DIKELUARKAN dari `REKAPAN_EDITABLE_FIELDS`, `item_description_manual`
ditambahkan. Memo cetak SENGAJA TIDAK diubah — baris NOTE cetak resmi TETAP hanya
`item_description` (catatan manual murni internal, bukan bagian dokumen resmi).
`FAR_EXPORT_COLS` ditambah `item_description_manual`.

**Susulan (2026-09) — label "ITEMS" di baris NOTE 2 memo cetak**: `FarOverseasAirDetailModal.tsx`
baris NOTE cetak "2." (dari `item_description`, BUKAN `item_description_manual`) ditambah label
`ITEMS :` sebelum teksnya — jadi tampil "2. ITEMS : {nama items}". Murni teks statis di JSX,
tidak ada perubahan data/kolom.

**Susulan LAGI (2026-09) — `item_description_manual` SEKARANG ikut tampil di memo cetak, dalam
kurung** — GANTI dari keputusan sebelumnya ("Memo cetak SENGAJA TIDAK diubah") yang sudah TIDAK
BERLAKU LAGI: baris "2. ITEMS :" sekarang `{item_description}{' ('}{item_description_manual}{')'}`
kalau `item_description_manual` terisi (kalau kosong, baris tetap sama seperti sebelumnya, tanpa
kurung kosong). Kondisi render baris tetap `rec.item_description` (dari NOTE 2 kiri/"From
Document") — `item_description_manual` MURNI tambahan di dalam kurung, TIDAK bisa bikin baris
"2." muncul sendirian kalau `item_description` kosong.

## FAR Overseas Air — NOTE 3 format baku "BARANG DITERIMA LOG {KOTA} {TANGGAL}" (2026-09)

List Memo kolom NOTE 3 (`status_note`) — dulu free-text bebas, sekarang UI-nya dipaksa format
baku: **kota** (read-only, otomatis dari `cost_validasi_far_overseas_air.rate_row_used.tujuan`
— kota TUJUAN yang sama dipakai Cost Validation) + **tanggal** (dipilih manual via
`<input type="date">`, kalender bawaan browser). Kolom DB TETAP 1 (`status_note`, text) — TIDAK
ADA kolom tanggal/kota terpisah, hasil pilihan di-komposisi jadi 1 string
`"BARANG DITERIMA LOG {KOTA} {DD/MM/YYYY}"` lalu itu yang disimpan (`composeStatusNote()`,
`FarOverseasAirPage.tsx`). Saat baris dibuka edit lagi, tanggalnya di-parse balik dari akhir
string tersimpan (`parseStatusNoteDateIso()`, regex `(\d{2})\/(\d{2})\/(\d{4})\s*$`) untuk
prefill date picker — **kalau format teks di DB tidak cocok pola ini** (data lama sebelum fitur
ini, atau pernah diedit manual di luar UI ini), date picker tampil kosong (bukan error), user
tinggal pilih ulang tanggalnya.

- **Sumber kota** — `ListRenderCtx.costCityMap` (state BARU `costCityMap`, `FarOverseasAirPage.tsx`),
  di-fetch BARENG `costStatusMap` (1 query yang sama, `fetchCostStatusMap()`, nambah kolom
  `rate_row_used` ke `.select()`) — `parseJsonField(c.rate_row_used).tujuan`. TIDAK ada fetch
  terpisah, TIDAK live-refresh saat `rate_row_used` berubah di
  `FarOverseasAirCostValidationModal.tsx` (baru ikut ter-update saat `fetchList()` berikutnya,
  sama batasannya dgn `costStatusMap`).
- **Kalau belum ada Cost Validation matched** (`costCityMap[r.id]` kosong) — date picker
  `disabled`, teks "(no destination city yet)" ditampilkan — TIDAK BISA compose NOTE 3 tanpa
  kota, mencegah tersimpan string "BARANG DITERIMA LOG  DD/MM/YYYY" (kota kosong).
  `handleInlineSaveRow`/pendingEdits TIDAK berubah — field `status_note` tetap ikut pola edit
  massal/inline biasa, cuma UI-nya yang diganti dari free-text jadi kota+date picker.
- Value baku ini MURNI hasil komposisi UI — user TIDAK BISA lagi ketik bebas ke NOTE 3 lewat
  form ini. Kalau ke depan perlu tambahan teks bebas, pertimbangkan field baru terpisah (pola
  sama NOTE 2 "From Document"/"Manual Note" di atas), JANGAN kembalikan NOTE 3 ke free-text
  polos tanpa diminta ulang.

## FAR Overseas Air — toggle tampilan List/Card (`FarOverseasAirPage.tsx`, 2026-09)

Toolbar List Memo dapat toggle **List/Card** (state lokal `viewMode`, default **CARD** — TIDAK
disimpan, reset ke Card lagi tiap buka halaman/refresh, pola sama preferensi tampilan sesaat
lain di app ini). **Card MURNI
tampilan ringkas untuk browsing cepat, TIDAK mereplikasi form edit apa pun** — keputusan
disengaja setelah diskusi dgn user: kolom di tabel List ada ~25an, kalau dipaksa jadi card
penuh malah lebih berantakan dibanding tabel. `FarOverseasAirDetailModal.tsx` (modal
approval memo) **SENGAJA TIDAK disentuh sama sekali** oleh fitur ini — sensitif/replika
dokumen fisik (lihat pengecualian translasi di atas), cuma DIPANGGIL apa adanya (persis pola
`navigate('/direct-loading/${id}')` yang sudah dipakai tombol "Approval" di List) dari tombol
Card, bukan dimodifikasi.

- **Card view** (`viewMode==='CARD'`) — grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. `rows`/
  `page`/`pageSize`/filter approval SAMA PERSIS dgn List (state yang sama, cuma cara render
  beda) — pindah List<->Card TIDAK reset halaman/filter.
  **Urutan baris field DI DALAM card (2026-09, permintaan user, riwayat beberapa iterasi urutan —
  KHUSUS card, BEDA dari urutan kolom `LIST_COLUMNS` di tabel List, JANGAN disamakan otomatis
  kalau urutan List berubah ke depan)**: baris header = **Ship Via** (kiri) + badge Approval/
  Cost Status (kanan) -> grid 2 kolom **Invoice No | Inv Date** -> **Vendor** (full-width) ->
  **No PO** (ringkas, "+N more" kalau gabungan banyak PO, full-width) -> grid 2 kolom
  **Total Amount | Qty/Weight** (`{r.qty}/{r.weight_unit}` 1 baris, mis. "120/KG") ->
  **Notes 1** (`route_note`, full-width). Field **Vessel** (`vessel_internal_note`) yang dulu
  ada di card DIHAPUS dari tampilan card (tidak lagi ditampilkan sama sekali di Card, TETAP ada
  di tabel List seperti biasa). `memo_title` ditampilkan TEPAT DI ATAS badge Approval Status
  (pojok kanan atas card, `text-right`, `max-w-[55%]` supaya judul panjang tidak mendesak Ship
  Via di kiri) — cuma render kalau terisi (`r.memo_title &&`, banyak memo lama tidak punya judul).
- **Tombol "Print Memo" di baris aksi card (2026-09)** — di SAMPING tombol Edit (setelah Edit,
  urutan akhir: Approval | Cost | Edit | Print Memo | Delete).
  `FarOverseasAirDetailModal.tsx` (memo cetak) **SENGAJA TIDAK disentuh sama sekali**
  (permintaan eksplisit user) — tombol ini MURNI meminjam mekanisme deep-link
  `/direct-loading/:id` yang SUDAH ADA (dipakai tombol "Approval"), yang membuka modal itu lalu
  otomatis memicu `window.print()`. Alur: `onClick` set `autoPrintRef.current = true` (ref
  BARU, bukan state — tidak perlu re-render) lalu `navigate('/direct-loading/${r.id}')` (SAMA
  PERSIS tombol Approval) -> effect `loadDeepLink` (sudah ada, fetch record & `setSelected`)
  cek `autoPrintRef.current`, kalau true: reset ke `false` lalu poll (`waitForPrintAreaThenPrint`,
  interval 50ms, maks 20x percobaan) sampai `#far-overseas-print-area` (elemen root modal, CSS
  `@media print` di `src/index.css` yang mengisolasi elemen ini saat cetak SUDAH ADA dari fitur
  Print manual di dalam modal, TIDAK diubah) BENERAN ada di DOM, baru `window.print()` di dalam
  2x `requestAnimationFrame` bersarang (1 frame commit React, 1 frame browser selesai paint).
  **Bug ditemukan & diperbaiki (3 iterasi)**: (1) versi awal pakai `setTimeout(..., 200)`
  fixed-delay — `window.print()` mencetak APA ADANYA yang sudah ter-render di DOM saat
  dipanggil (bukan nunggu render selesai dulu), jadi kalau device/koneksi lambat & 200ms belum
  cukup buat modal (portal ke `document.body`) selesai commit+paint, hasilnya PRINT PREVIEW
  KOSONG — diganti poll DOM (elemen `#far-overseas-print-area` ada/tidak) + rAF; (2) SUSULAN —
  poll DOM keberadaan elemen saja TERNYATA belum cukup, laporan user "header kiri memo (nama PT)
  masih tampil '-'" — root cause `FarOverseasAirDetailModal.tsx` punya fetch ASYNC KEDUA setelah
  mount (`far_overseas_signer_config` by `dominant_company_code`, isi komponen `CompanyLogo` di
  file itu — nama PT/logo header memo) yang belum resolve saat elemen print area SUDAH ada di
  DOM. Coba fix: `loadDeepLink` duplikasi query YANG SAMA sbg PROXY waktu tunggu (`await`
  sebelum print) — SUDAH DIGANTI LAGI, TERBUKTI TIDAK RELIABLE (lihat poin 3); (3) FIX FINAL —
  laporan user lanjutan: buka via "Approval" dulu baru klik Print MANUAL di dalam modal =
  lengkap, tapi "Print Memo" langsung dari card = TETAP kosong sebagian, membuktikan proxy-fetch
  di poin (2) tidak menjamin urutan (2 network request independen paralel, query proxy yang cuma
  `select` 1 kolom kerap selesai LEBIH CEPAT drpd query asli modal yang `select('*')`). Diganti
  **`MutationObserver`** generik pada `#far-overseas-print-area` — tunggu sampai TIDAK ADA
  perubahan DOM lagi selama 400ms (debounce, menandakan semua fetch async di dalam modal SUDAH
  selesai & re-render-nya SUDAH commit), BARU `window.print()` (dalam 2x rAF). Safety cap 3
  detik. **Pendekatan ini generik & TIDAK PERLU tahu/menduplikasi fetch spesifik apa pun di
  dalam modal** — otomatis tetap benar walau `FarOverseasAirDetailModal.tsx` nanti nambah fetch
  async lain lagi, TIDAK seperti pendekatan proxy-fetch di poin (2) yang WAJIB di-duplikasi
  manual tiap ada fetch baru (makanya diganti). **JANGAN reintroduce pola proxy-fetch itu.**
  **Edge case DITERIMA**: kalau modal untuk
  memo YANG SAMA sudah terbuka saat tombol Print di-klik, `navigate()` ke path yang sama TIDAK
  mengubah `deepLinkId` -> effect `loadDeepLink` TIDAK jalan ulang -> print tidak otomatis
  terpicu (`autoPrintRef` tertinggal `true` tanpa konsumsi) — user tinggal klik tombol Print
  manual di dalam modal yang sudah terbuka itu, bukan bug yang blocking.
- **4 tombol aksi per card** — REPLIKA fungsi tombol Action per-baris di List, dipanggil
  langsung (bukan lewat dropdown "Action" seperti List, karena card sudah cukup lega utk
  tombol langsung): **Approval** (`navigate('/direct-loading/${r.id}')`, buka
  `FarOverseasAirDetailModal.tsx` via deep-link route — SAMA PERSIS mekanisme List, TIDAK ada
  jalur baru); **Cost** (`setCostModalRow(r)`); **Edit** (gated `canEditDirectLoading`, lihat
  poin di bawah); **Delete** (gated `canEditDirectLoading`, `openDeleteConfirm(r)`, SAMA fungsi
  dgn List).
- **Tombol Edit di card buka `FarOverseasAirCardEditModal` (modal tersendiri, DEFINISI FINAL,
  2026-09)** — versi SEBELUMNYA ("Edit di card pindah balik ke mode List + auto-scroll ke
  baris", `handleEditFromCard`/`<tr id="far-row-{id}">` sbg target scroll) SUDAH DIGANTI TOTAL
  atas permintaan susulan user ("jangan mengarah ke List, tapi modal tersendiri") — JANGAN
  reintroduce alur pindah-ke-List itu tanpa diminta ulang. `<tr id="far-row-{id}">` di tabel
  List dibiarkan ada (harmless leftover, tidak dipakai lagi tapi tidak mengganggu).
  - State `cardEditRow: any | null` (null = modal tertutup) — diisi `setCardEditRow(r)` saat
    tombol Edit card diklik.
  - **`FarOverseasAirCardEditModal` (komponen module-level, di atas `export default function
    FarOverseasAirPage()`) REUSE PERSIS `LIST_COLUMNS`** — TIDAK menduplikasi logic input per
    field. Iterasi semua `LIST_COLUMNS` KECUALI header `NO`/`APPROVAL STATUS`/`COST STATUS`
    (`CARD_EDIT_EXCLUDED_HEADERS`, bukan field yang bisa diedit): kolom ber-`render` (NO PO,
    NOTE 2, NOTE 3, PIC, VESSEL, Weight Breakdown) dipanggil apa adanya
    (`col.render(row, 0, costStatus, ctx)`); kolom ber-`field` polos pakai `<EditableCell
    editable>` yang sama seperti di List. **Trik kuncinya**: `ctx` yang dioper ke modal ini
    py `editingRowId` DIPAKSA `=== row.id` (dibuat di titik render modal, BUKAN memakai
    `editingRowId` milik List) — SEMUA `col.render` yang mengecek `ctx.editingRowId === r.id`
    (NOTE 2/NOTE 3/PIC/VESSEL/NO PO) otomatis tampil varian EDIT-nya tanpa kode tambahan apa
    pun. `pendingEdits`/`getVal`/`setVal` SAMA PERSIS instance dgn List/edit massal (key by
    row id yang sama) — modal ini BUKAN state terpisah, cuma jendela tampilan lain ke
    `pendingEdits[row.id]` yang sama.
  - **Save Changes** — `onSave` panggil `handleSaveAllEdits([row.id])` lalu tutup modal.
    `handleSaveAllEdits` diperluas terima parameter opsional `idsOverride?: string[]` (default
    tanpa argumen TETAP simpan SEMUA `changedRowIds` spt sebelumnya, dipakai tombol "Save All"
    floating bar) — di dalamnya SEKARANG filter ulang `idsOverride` ke id yang BENERAN py
    pending edit (`pendingEdits[id]` ada isinya) supaya klik "Save Changes" tanpa perubahan
    apa pun (`pendingEdits[row.id]` belum ada) tidak memanggil RPC dgn payload kosong/undefined.
    `setPendingEdits` sesudah save SEKARANG hapus HANYA id yang di-save (bukan `{}` polos
    ganti-semua) — supaya save 1 baris dari modal Card TIDAK ikut membuang pending edit baris
    LAIN yang mungkin sedang berjalan di List/edit massal secara bersamaan.
  - **Cancel** — `onCancel` panggil `handleDiscardRowEdit(row.id)` (fungsi BARU, discard
    KHUSUS 1 row id) lalu tutup modal — beda dari tombol "X" (`onClose`) yang CUMA menutup
    modal TANPA membuang pending edit (biar user bisa buka lagi lain waktu atau simpan lewat
    "Save All" floating bar bawah).
  - Modal ini `z-[65]` — di ANTARA `FarOverseasAirDetailModal.tsx` (`z-[60]`) dan
    `FarOverseasAirCostValidationModal.tsx`/`FarOverseasAirWeightBreakdownModal.tsx`
    (`z-[70]`/`z-[75]`) — kolom "Weight Breakdown" di dalam modal ini bisa buka
    `FarOverseasAirWeightBreakdownModal` (via `ctx.onOpenWeightModal`), yang WAJIB tampil DI
    ATAS modal Edit Card ini, makanya `z-index`-nya sengaja lebih rendah dari kedua modal itu.
- Area scroll Card **TERPISAH dari List** — List punya scroll ganda horizontal (`topScrollRef`/
  `bottomScrollRef`, tabel lebar banyak kolom), Card cukup 1 `overflow-y-auto` vertikal biasa
  (grid card tidak butuh scroll horizontal). Footer Pagination (`rows.length > 0 && (...)`)
  TIDAK diduplikasi — tetap 1 footer di luar kedua blok List/Card, dipakai bareng oleh
  keduanya krn `rows`/`page`/`totalRecords` sama.
- **Baris tombol aksi SELALU rata bawah per card** (2026-09, laporan user "tombol tidak
  seragam" — posisinya naik-turun tergantung berapa banyak baris teks Vendor/Vessel dkk yang
  panjangnya bervariasi antar memo). Fix: konten card (baris No PO+badge & grid info) dibungkus
  1 `<div className="flex-1">`, baris tombol dikasih `mt-auto` (GANTI dari `mt-1` biasa) — card
  itu sendiri `flex flex-col`, jadi wrapper `flex-1` ini mengisi SEMUA sisa tinggi card (CSS
  Grid `grid-cols-*` secara default men-stretch semua card 1 baris ke tinggi card TERTINGGI di
  baris itu), mendorong baris tombol turun rata ke tepi bawah card tanpa peduli berapa
  banyak konten di atasnya. **Kalau nambah field baru ke card, WAJIB taruh di DALAM wrapper
  `flex-1` ini** (bukan sejajar dengan baris tombol) supaya rata-bawah ini tidak rusak lagi.

## FAR Overseas Air — Search + Sort di toolbar List Memo (`FarOverseasAirPage.tsx`, 2026-09)

Dropdown "Items" (pageSize selector) di toolbar List Memo DIGANTI jadi **Search box + dropdown
Sort + tombol toggle arah** (permintaan user). `pageSize` state TETAP ADA (dipakai apa adanya,
default 10) — cuma UI selector-nya yang dihilangkan, bukan fungsinya.

- **Search** (`searchInput`/`searchTerm`, debounced 400ms — pola sama Audit AP Local) — cari di
  4 kolom sekaligus via `.or()` ilike server-side: `ship_via`, `vendor`, `route_note` (NOTE 1,
  mengandung negara/kota asal), `item_description_manual` (NOTE 2 Manual). `%`/`_` di input
  di-escape (`\\$&`) sebelum masuk pattern `ilike` — cegah user input karakter wildcard SQL
  ilike tidak sengaja mengubah maksud pencarian.
- **Sort** (`sortBy`/`sortDir`, default `invoice_date` DESC — SAMA seperti urutan lama
  `created_at` desc) — 5 opsi: Date (`invoice_date`), Ship Via, Vendor, **Notes 1 (Origin)**,
  **Notes 2 (Manual)**. Tombol toggle arah (ikon panah atas/bawah) terpisah dari dropdown.
  **Batasan disengaja "Notes 1 (Origin)"**: sort ini ORDER BY kolom `route_note` APA ADANYA
  (bukan hasil ekstrak origin-nya doang) — SEMUA nilai `route_note` berformat baku "PENGIRIMAN
  DARI {asal} KE {tujuan} (...)" (lihat `parseRouteNote`), jadi prefix "PENGIRIMAN DARI " SELALU
  SAMA di semua baris → ORDER BY teks mentahnya otomatis ekuivalen dengan sort by nama kota/negara
  asal (karakter pertama yang beda antar baris justru mulai persis dari situ, setelah prefix yang
  sama). Baris yang formatnya TIDAK cocok pola baku (data lama/manual non-standar) tetap ikut
  ter-sort, cuma relatif kurang presisi — DITERIMA, tidak ada kolom "origin" terpisah di DB untuk
  sort yang 100% akurat tanpa parsing di level SQL (di luar cakupan Supabase-js query builder).
- `page` di-reset ke 1 otomatis (`useEffect([searchTerm, sortBy, sortDir])`) tiap search/sort
  berubah — konsisten dengan `approvalFilter` yang juga reset page manual di `onChange`-nya.
- **LEBAR diperkecil** (2026-09, laporan user — TERNYATA maksudnya lebar, BUKAN ukuran/tinggi/
  font, percobaan pertama sempat memperkecil semuanya termasuk `h-[34px]`->`h-[28px]`+font+ikon,
  SUDAH DIREVERT balik ke ukuran SAMA dgn kontrol toolbar lain di baris itu). Kondisi FINAL:
  tinggi/font/ikon TETAP `h-[34px]`/`text-xs`/`size={13-14}` (sama semua kontrol toolbar lain),
  HANYA lebar yang dipersempit — Search box `w-[125px]` (dari `w-[200px]`), Sort box `w-[150px]`
  (BARU, sebelumnya tanpa lebar tetap/selebar konten). Placeholder dipendekkan jadi
  `"Search..."` (deskripsi 4 kolom yang dicari dipindah ke `title` tooltip).
- Berlaku SAMA ke List & Card (keduanya baca `rows`/`page` yang sama, search+sort tidak
  dibedakan per viewMode).

## FAR Overseas Air — arsitektur cost validation

`rekapan_far_overseas_air` (`route_note` = "PENGIRIMAN DARI {asal} KE {tujuan} ({mode})") ↔ 1:1
via `far_overseas_id` ↔ `cost_validasi_far_overseas_air` (`vendor_matched`, `rate_row_used`
jsonb, `status`, `catatan`, `cost_validation` jsonb array).

- Baris TOTAL AMOUNT (memo cetak) non-IDR: "(≈ Rp ...)" + "(Kurs: ...)" — kurs dihitung ulang
  dari `total_amount_idr/total_amount` (bukan field `kurs_used` tersimpan), supaya konsisten.
- **Filter approval per level** (List Memo) — dropdown `approvalFilter` (ALL/TIER1/PIC/TIER2/
  TIER3), tiap opsi tampil COUNT pending (`fetchApprovalCounts`). Rantai approval WAJIB
  berurutan (lihat di bawah) → semua level map ke `approval_status` via `APPROVAL_FILTER_STATUS`
  (TIER1→PENDING, PIC→TIER1_DONE, TIER2→PIC_DONE, TIER3→TIER2_DONE), server-side `.eq()` murni.
- **Approval berjenjang WAJIB berurutan: Prepared By(Exim) → PIC → SPV → Director** (VERSI
  FINAL — GANTI TOTAL dari 2 versi lama PIC-independen, jangan reintroduce). `approval_status`
  5 nilai: `PENDING`→`TIER1_DONE`→`PIC_DONE`→`TIER2_DONE`→`APPROVED`.
  `nextStepForStatus()`/`STEP_ENTRY_TIER`/`STEP_STATUS_AFTER`/`STEP_LABEL`/`STEP_ACTION_LABEL`
  di `FarOverseasAirDetailModal.tsx`. Kolom tanda tangan cetak TETAP cuma 3 — nama PIC digabung
  ke kolom "Disiapkan Oleh" bareng Exim (`"{exim}/{pic}"`), TIDAK PERNAH kolom sendiri.
  Gating approve: `canEditDirectLoading` DAN `canApproveTier('direct_loading', step)` (2 syarat
  independen). Data lama (sebelum fitur PIC) wajar tidak punya entry PIC di `approvals`.
  **Approve satu klik langsung, TIDAK ADA modal konfirmasi nama** (dihapus total, jangan
  reintroduce) — `handleApprove(nextStep, defaultNamaForStep(nextStep))` langsung jalan.
  `defaultNamaForStep`: TIER1&PIC = `profile?.nama || user?.email` (identitas login);
  TIER2&TIER3 = `signer?.tier2_name`/`tier3_name` dari `far_overseas_signer_config` (jabatan
  resmi TETAP, TIDAK ikut nama user login — permintaan eksplisit). Tombol
  `disabled={submitting}`, label "Saving...".
  **Reject HANYA utk user eligible approve TAHAP AKTIF** (VERSI FINAL — versi awal "punya
  jabatan approval apa saja" SUDAH DIGANTI): `canReject = nextStep != null &&
  canApproveTier('direct_loading', nextStep)` — SAMA syarat dgn Approve, tidak ada bypass Admin.
  Enforcement server-side via RPC `reject_far_overseas_air` (SQL lengkap di atas, bagian PIC
  per-memo — sudah versi terbaru, JANGAN pakai `.update()` langsung).
- **Document Validation** (`FarOverseasAirCostValidationModal.tsx`) — baris NAMA PT yg cocok
  `dominantPtName` dikasih centang hijau. **PT Name & PO Number 1 baris horizontal** (`flex
  items-center gap-2 flex-nowrap`, urutan: PO No. dulu baru PT Name — `whitespace-nowrap`/
  `shrink-0` supaya tidak wrap 2 baris walau nama PT panjang). Modal `max-w-5xl`.
- **RPC-only mutation** — JANGAN `.update()`/`.insert()` mentah ke 2 tabel ini. Selalu
  `update_rekapan_far_overseas_manual(p_id, p_updates)` &
  `update_cost_validasi_far_overseas_manual(...)`.
  **KRITIS — whitelist kolom RPC TERPISAH dari frontend**: `update_rekapan_far_overseas_manual`
  punya `v_allowed_columns` HARDCODE terpisah total dari `REKAPAN_EDITABLE_FIELDS` frontend.
  Field yg ada di frontend tapi TIDAK di whitelist RPC → diam-diam SKIP (`RAISE WARNING`, bukan
  error) — toast "saved successfully" tapi nilai balik ke lama saat refresh. Bug ini SUDAH
  TERJADI utk `item_description_manual` & `pic_user_id`. **ATURAN WAJIB**: tiap kali nambah
  field ke `REKAPAN_EDITABLE_FIELDS`, WAJIB minta user jalankan `create or replace` nambah nama
  kolom yg sama ke `v_allowed_columns` — 2 tempat ini HARUS selalu sinkron manual. Kalau ada
  laporan "sudah Save tapi field X balik kosong", cek `v_allowed_columns` dulu (`pg_get_functiondef`).
- `FarOverseasAirHelpers.ts` — `computeExpectedFromRate`, `computeCostStatus`, `parseRouteNote`,
  `mapModeToJenisLayanan`, `rematchTarif` (REPLIKA PERSIS logic matching tarif n8n — kalau
  diubah, HARUS sinkron n8n). `rematchTarif` SATU-SATUNYA fungsi matching (generik Octagon &
  Jianqiao via `ship_via`, JANGAN bikin versi kedua).
- **Edit NOTE 1 memicu re-kalkulasi Cost Validation otomatis** (VERSI FINAL, generik utk semua
  vendor) — `reMatchAfterRouteNoteEdit` di `FarOverseasAirPage.tsx`, dipanggil dari
  `handleSaveAllEdits` tiap `route_note` berubah. Parse `route_note` baru → prioritaskan
  `mapModeToJenisLayanan(mode baru)`, fallback ke `rate_row_used` tersimpan kalau tidak dikenali
  → `rematchTarif` → 0 kandidat=`BELUM_LENGKAP`, 1=hitung ulang expected, >1=array pilihan manual.
  `computeExpectedFromRate` terima param opsional `displayOrigin`/`displayTujuan` (HANYA
  pengaruhi teks `unitPriceNotes`, TIDAK PERNAH pengaruhi angka `expected`) — fix bug teks kota
  Notes tidak sinkron kalau vendor cuma py 1 baris tarif generik (filter origin/tujuan di-skip
  krn "lunak"). `reMatchAfterRouteNoteEdit` WAJIB isi 2 param ini dari hasil parse; pemanggil
  lain (`handleSelectRate`) sengaja TIDAK isi (default ke `rate.origin`/`rate.tujuan`).
- `po_list` (jsonb array, tiap entry `po_no_raw`/`vessel_raw`) = SATU-SATUNYA sumber pasangan
  PO↔Vessel presisi. `vessel_internal_note` cuma string ringkas nama kapal, JANGAN di-parse utk
  breakdown. List Memo kolom NO PO & VESSEL berbagi 1 state expand, render dari `po_list`
  (bukan `vessel_internal_note`) saat expanded.
- Memo cetak: `vessel_internal_note` TIDAK PERNAH dirender (hanya di kolom VESSEL List Memo).
  NOTE 3 (`status_note`)/NOTE 4 (`other_note`) ikut masuk baris "NOTE:" cetak (hanya kalau isi).
- **PIC** kolom manual `pic_name` tetap ada sbg fallback nama (lihat "PIC per-memo assignment"
  di atas utk approval sebenarnya). Kolom BUYER (`buyer_name`) editable inline di List Memo.
- Urutan field memo cetak: PO.No/Supplier & Inv.No/Date SENGAJA 2 blok independen (bukan 1 baris
  flex, supaya PO.No panjang tidak menarik Date jauh dari Inv.No). Baris bawahnya: Buyer → Ship
  Via → Departure Date → Weight → Price/Kg → TOTAL AMOUNT.
- Note pembayaran: 1 baris "Note: MOHON DIBANTU BAYARKAN PADA TANGGAL : {date}" DI LUAR kotak
  memo tapi TETAP tercetak (bukan `print:hidden`).

## Sea & Air — kolom khusus

- **Audit, "No. PIB" dari `no_aju`** (bukan `no_pib`) — permintaan eksplisit HANYA Sea & Air,
  `PIB_COLS` Courier TIDAK ikut diubah (tetap `no_pib`). `searchCols` sudah cakup kedua kolom.
- **Audit, kolom Balance & Asuransi** — formula hardcode frontend:
  `BALANCE = VALAS_DPP*KURS_NDPBM - (TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`,
  `ASURANSI = 0.5%*(TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`. Diimplementasi di 3 tempat HARUS sinkron:
  `EditModal` useEffect, `handleInlineSaveRow` (diff-based), `fetchRecords`'s `enrichedData` DAN
  `getExportData` (live-computed tiap fetch — awalnya sengaja TIDAK di sini supaya nilai n8n
  asli tampil, tapi n8n memang tidak pernah isi kolom ini jadi selalu "-" sampai diedit; fix:
  hitung ulang di semua baris hasil fetch). `balance`/`asuransi` DIKELUARKAN dari
  `isInlineEditable()`.
- **Rekapan, badge % Doc/Cost Validation** di tombol (bulat, hijau≥90%/kuning≥60%/merah).
  Dihitung batch di `fetchRecords` (bukan per-row query), disimpan `r.doc_validation_pct`/
  `r.cost_validation_pct`. Formula REPLIKA PERSIS `globalStats` `SeaAirValidasiModal.tsx` (Doc,
  exclude `match===null`) & `ValidasiShipmentInvoiceLengkap.tsx` (Cost, exclude
  `section==='SURVEYOR'`). **Kalau formula di modal berubah, WAJIB sinkron ulang di 3 tempat
  ini** (2 modal + `SharedDataTable.tsx` fetchRecords).
- **Modal Cost Validasi Shipment & Invoice** disamakan ukuran dgn Courier CostValidationModal:
  `max-w-6xl max-h-[97vh]` (drop `h-[90vh]` fixed lama).
- **`SeaAirValidasiModal.tsx`** — kolom "data check" HARDCODE (`INVOICE_FCL_COLS`/`FP_FCL_COLS`
  ~baris 450/521 + `headerColors`), TIDAK otomatis ikut field baru dari backend — kolom
  "Trucking" sudah ditambahkan manual ke ketiganya.

## Bunker — Riwayat Perubahan menyembunyikan entri "asing" bukan dari aplikasi (2026-09)

Laporan user: modal "Change History" (`BunkerAuditLogModal.tsx`) menampilkan entri berantakan
`By: Unknown` + isi `catatan` dump mentah diff SELURUH kolom row (`vendor: X → Y; summary: {...}
→ {...}; source_files: [...]; extracted_raw: {...}`), bukan format rapi 1 field yang biasa.
**Root cause**: entri ini BUKAN ditulis `logBunkerAudit()` (lihat `BunkerHelpers.ts`) — fungsi
itu SELALU isi `user_email` & format `catatan` ketat `"{field} — Lama: X → Baru: Y"`. Entri asing
ini kemungkinan besar di-insert LANGSUNG ke tabel `audit_trail` (`tabel='bunker_dokumen'`) oleh
proses lain (n8n/trigger DB) — **BELUM diverifikasi sumber pastinya** (tidak ada akses n8n/DB
langsung dari sesi Claude Code). Fix SEMENTARA di sisi tampilan (`BunkerAuditLogModal.tsx`):
entri difilter `splitAuditCatatan(e.catatan) || e.user_email` — yang GAGAL diparse formatnya
DAN `user_email` kosong disembunyikan (bukan dihapus dari DB, murni tidak dirender). Kalau nanti
ketahuan proses n8n mana yang insert entri ini, root cause sebenarnya ada di sana, bukan di app.

## Bunker — seksi "Original Documents" (`source_files`) di `BunkerCompareDocModal.tsx` (2026-09)

Kolom `bunker_dokumen.source_files` (jsonb array, KUMULATIF — riwayat SEMUA file yg pernah
diupload utk PO itu termasuk dokumen susulan, elemen `{filename, file_url, uploaded_at,
job_id}`) ditampilkan sbg seksi baru "3. Original Documents" di `BunkerCompareDocModal.tsx`
(`SourceFilesSection`), setelah seksi "2. Document Comparison". Diurutkan terbaru→terlama
(`uploaded_at`), TIDAK di-dedupe (filename sama berulang = riwayat sah, bukan bug). `file_url`
bisa `null` (dokumen lama sebelum fitur ini ADA/upload ke Drive gagal — kondisi NORMAL) → badge
abu-abu "Preview unavailable" (non-klik), bukan link mati. Array kosong/tidak ada → empty-state
"No files uploaded yet.".

**Susulan (2026-09) — preview LANGSUNG di dalam aplikasi, BUKAN lagi tab baru**: permintaan
user, GANTI TOTAL dari versi awal (`<a target="_blank">` polos ke link Drive apa adanya). Sekarang
pakai pola SAMA PERSIS modul lain (`PreviewModal` di `AuditPoPage.tsx`/`AccountingRekapPage.tsx`
dkk) — proxy backend `/api/drive-file-proxy?id=<drive_file_id>` (`server.ts`), fetch via JS lalu
suntik `srcDoc` (HTML)/`blob:` (PDF, di-rewrap paksa `type:'application/pdf'`) ke iframe supaya
lolos X-Frame-Options server asal. **Beda dari modul lain**: `bunker_dokumen.source_files` TIDAK
punya kolom `drive_file_id` terpisah (cuma `file_url` mentah) — `extractDriveFileId()` (BARU)
parse ID dari pola URL Drive umum (`/file/d/<ID>/...` atau `?id=<ID>`) via regex. Kalau ID gagal
diekstrak (URL bukan format Drive standar), `buildBunkerPreviewSrc()` return `null` → badge
"Preview unavailable" (BUKAN fallback ke URL mentah spt modul lain — URL Drive mentah TIDAK BISA
di-`fetch()` dari sini krn CORS kalau bukan lewat proxy, lebih jujur tampilkan unavailable drpd
iframe kosong/error diam2). Tombol "Open" berubah jadi "Preview" (ikon `Eye`), modal preview
(`BunkerPreviewModal`) py tombol "Download File" (`<a target="_blank">` ke `file_url` ASLI,
bukan proxy) sbg fallback kalau preview gagal dimuat.

## Courier — Audit, badge % + footer % Cost Validation

Pola sama Sea & Air Rekapan di atas, diterapkan ke `CourierAuditRowGroup` tombol Doc/Cost
Validation. **`src/utils/CostValidationHelpers.ts`** (BARU) — `isRowVisible()`/
`computeLiveCostSummary()` DIPINDAHKAN dari `CostValidationModal.tsx` ke sini, SATU-SATUNYA
sumber kebenaran (dipakai `CostValidationModal.tsx` DAN `SharedDataTable.tsx` fetchRecords).
`computeLiveCostSummary()` juga return `pct` — dipakai badge & panel "Overall Accuracy" baru di
footer modal.

**Doc Validation fallback** — `tabel_checklist_validasi` CUMA keisi kalau seseorang PERNAH buka
`ValidasiModal.tsx` & klik Simpan (bukan otomatis n8n). Fix: `fetchCourierValidationBadgePct()`
punya FALLBACK live-calc (REPLIKA logic `CourierValidasiPage.tsx` `needsCalculation`) utk
pib_id/cn_id yg tidak ketemu di tabel itu — JANGAN tulis ulang formula ini di tempat ketiga.
Badge `0%` hanya kalau setelah fallback pun benar2 tidak ada data.

**PENTING — 2 jalur fetch terpisah utk `courier_audit`**: jalur normal (PIB/CN sendiri-sendiri)
DAN jalur khusus tab Draft/`archive` (query gabung, `return` lebih awal). Logic badge dipindah
jadi fungsi module-level `fetchCourierValidationBadgePct(rows)`, dipanggil dari KEDUA jalur.
**Nambah jalur fetch baru → WAJIB panggil fungsi ini juga.**

## Upload Dokumen Susulan — Audit Courier (`CourierUploadSusulanModal.tsx`)

Tombol "Upload Additional Doc" di footer `ChecklistModal` — kirim dokumen susulan tanpa bikin
record shipment baru. REPLIKA `BunkerUploadModal.tsx`+`BunkerKelengkapanModal.tsx`, beda field
hint = `awb_hint` (bukan `no_po_hint`). Webhook type tetap `'courier'`.

- `server.ts` forward `awb_hint` — **SELALU** append (`|| ''`, bukan cek truthy) baik client
  maupun server (`req.body?.awb_hint !== undefined`, bukan truthy check) — fix bug field hilang
  total kalau `record.awb` kosong. Restart dev server manual wajib.
- Status job inline di `ChecklistModal` (state `activeJobId`/`activeJobStatus`, REPLIKA polling
  `BunkerKelengkapanModal.tsx`, BUKAN `ProcessingQueue` generik). Kalau n8n balikin `job_id` →
  poll `tabel_processing_queue` tiap 4dtk. Kalau tidak → banner "Document sent...".
  **BELUM TERVERIFIKASI** apakah n8n Courier balikin `job_id` sama sekali.
- ⚠️ **KETERGANTUNGAN EKSTERNAL — workflow n8n Courier HARUS diupdate** utk terima `awb_hint` &
  MERGE ke record existing (bukan bikin PIB/CN baru) — belum ada visibilitas/konfirmasi ini
  sudah dikerjakan di sisi n8n.
- Gate: tombol muncul kalau `canEdit('courier_checklist_dokumen')` — proteksi MURNI UI (proxy
  Express, bukan RLS), sama seperti `courier_upload`.

## Badge % Checklist — Audit Courier & Rekapan Sea & Air

Lebih sederhana — % SUDAH tersimpan langsung (`pct_kelengkapan`), tidak perlu live-compute.
Audit Courier: `rec.pct_kelengkapan` sudah ter-merge via `mergeChecklistData()` (kedua jalur
fetch termasuk Draft). Rekapan Sea & Air: `rec.checklist_pct` dari batch query
`dokumen_checklist_seaair` (digabung 1 round-trip dgn Doc/Cost Validation pct map).

## Bunker — badge % Match & Riwayat Perubahan

- `computeMatrixMatchStats()` (`src/utils/BunkerHelpers.ts`) — SATU-SATUNYA sumber Match/
  Warning/Mismatch + %, dari `row_status` `matrix_perbandingan`. Dipakai banner modal Compare Doc
  & badge tombol "Compare Doc" List Bunker.
- **Riwayat Perubahan** (tombol "Riwayat", `BunkerAuditLogModal.tsx`) — PAKAI ULANG tabel
  `audit_trail` existing (bukan tabel baru). **Kolom ASLI tabel ini**: `id`, `created_at`,
  `tabel`, `action`, `awb`, `no_dokumen`, `jenis`, `user_email`, `catatan` — **TIDAK ADA**
  `deskripsi`/`old_value`/`new_value` (percobaan pertama pakai `deskripsi` GAGAL runtime,
  `deskripsi` cuma label tampilan `TRAIL_COLS` via view `v_audit_trail`). Semua info digabung ke
  `catatan` format `"{field_label} — Lama: {old} → Baru: {new}"`, di-parse balik
  `splitAuditCatatan()`. `no_dokumen` = `no_po` (kunci filter balik ke 1 baris, karena tabel ini
  tidak punya `record_id` eksplisit). Dicatat LANGSUNG dari app (`logBunkerAudit()`, bukan
  trigger DB).
  **BELUM DIJALANKAN ke Supabase production**:
  ```sql
  create policy "audit_trail_insert_bunker_app" on public.audit_trail
    for insert with check (tabel = 'bunker_dokumen' and public.has_edit_access('bunker'));
  create policy "audit_trail_select_bunker_app" on public.audit_trail
    for select using (tabel = 'bunker_dokumen' and public.has_page_access('bunker'));
  ```
  Belum terverifikasi apakah tumpang tindih dgn policy SELECT lama (kemungkinan aman krn
  Postgres OR-kan policy permissive, tapi cek dulu kalau ragu).

## Courier — Document Validation (`ValidasiModal.tsx`) — kumpulan fitur 2026-09

**Konteks penting**: file ini punya SECTIONS + `fill()`/`generateValues` SENDIRI, TERPISAH dari
`ValidasiHelper.ts`/`ValidasiFill.ts` — SUDAH TERBUKTI TIDAK SINKRON (id `bdjbc01`-`bdjbc04`
beda nilai). **Kalau mau tau/ubah src-cmp yg BENERAN tampil, baca/edit `ValidasiModal.tsx`,
JANGAN `ValidasiFill.ts`** (belum disinkronkan, belum diminta user).

- **Kolom "REFERENCE" khusus section `s_pib`** — Src di section ini SELALU identik di semua
  kolom dokumen per baris (beda dari `s_inv_freight_duty` yg src BEDA per kolom — JANGAN
  asumsikan section lain sama tanpa verifikasi ulang seperti investigasi ini). 1 kolom Referensi
  tunggal disisip setelah "VALIDASI FIELD" (guard `section.id==='s_pib'`), kolom dokumen lain
  cuma render Cmp (Src+"vs" disembunyikan). `setSrcForGroup(section,field,val)` — tulis ke
  SEMUA row id yg berbagi `groupKey` sekaligus.
- **Pill status berlabel** — ikon polos diganti pill rounded + teks (`getCfg(st)`, sudah ada
  sebelumnya sbg dead code, dipakai ulang). `STATUS_CONFIG` lama TETAP dead code, jangan
  duplikat mapping lagi.
- **Cmp "(dalam kurung)" tanpa label "vs"** — "vs" dihapus total. Cmp mode-lihat: kurung +
  `text-[10px]` + warna redup `/70` — KECUALI section `s_pib`, DIKEMBALIKAN ke gaya lama (tanpa
  kurung, `text-xs`, solid) atas permintaan susulan. **Kalau section lain diminta balik ke gaya
  lama, tambahkan id-nya ke kondisi `section.id === 's_pib'` di 3 titik (JANGAN duplikat blok
  baru)**. Placeholder literal "Src"/"Cmp" DIHAPUS (placeholder "Format..." row `isFormat` &
  "Referensi" kolom REFERENCE TETAP ADA). Pill status "empty" diganti label "Not checked yet" +
  ikon `Clock` (bg lavender `#EEEAF3`/warna `#5A305A`, bukan abu polos lagi).
  **Percobaan DIBATALKAN**: sempat nambah `s_inv_freight_duty` ke exception ini, TERNYATA salah
  paham maksud user, SUDAH DIREVERT — jangan re-apply tanpa konfirmasi ulang.
- **Border kolom kontras** — SEMUA border vertikal (7 titik + 2 box-shadow sticky) diseragamkan
  `border-slate-300`/`#cbd5e1` (dari `border-slate-200`/`#e2e8f0` yg kontrasnya jelek di atas
  header berwarna pastel). BUKAN bug geometris — kalau ada laporan "border putus" lagi, cek
  kontras dulu SEBELUM curiga bug struktural (sudah 2x ditelusuri, murni soal warna).
- **Baris "Subtotal after CN" digabung ke "Subtotal"** — `rowLabel: "Subtotal / Subtotal After
  CN"` sama di 4 row config (`if02`/`id01`/`cnf02_b`/`cnd02_b`).
- **Lebar kolom "VALIDASI FIELD" diseragamkan** — `w-[160px] min-w-[160px] max-w-[160px]
  whitespace-normal` (`<td>` + `break-words`) di SEMUA tabel (2 titik th/td).
- **"Other Cost" (PIB Item Value & CIPL Total Item Value kolom PO) bisa diedit manual** —
  `otherCost` ditambahkan ke `values[id]` (otomatis ke-serialize ke `values_json`, tanpa ubah
  skema/RPC). Default awal dari `raw.other_cost_valas`, setelah pernah tersimpan baca
  `cl.values_json` langsung (jalur fill() di-skip). Data lama fallback: baca `v.otherCost` dulu,
  fallback raw.
- **Sel CN dipindah kolom** — 4 row (`cnf02_b`/`cnd02_b` "Subtotal.../PPN") pindah `compareDoc`
  dari "CN INVOICE FREIGHT/DUTY" → "FP Revisi Freight/Duty". Kolom lama tetap ada (dipakai row
  lain), sekarang tampil "-" utk 2 baris ini.
- **"DPP"→"DPP / DPP After CN"**, **"PPN"→"PPN / PPN After CN"** (rowLabel saja, `field` mentah
  tidak disentuh, keyword-matching aman).
- **Src baris "No. AWB" kolom SPPB** (`pib02`) diganti dari `pibV.no_awb` → `invF.awb ||
  invD.awb` (samakan dgn `id07`). **BUKAN retroaktif** — checklist yg SUDAH tersimpan
  (`tabel_checklist_validasi` ada baris) TIDAK ikut ke-update, karena jalur `fill()` di-skip
  total kalau sudah ada baris tersimpan. Keputusan user: TIDAK ADA fix kode, cukup dijelaskan.
- **Bug status "Not checked yet" padahal Cmp terisi** — cabang khusus
  `fieldName.includes("Referensi (")` pakai `||` (salah, salah satu kosong="empty") bukan `&&`
  (konvensi umum: kedua kosong baru "empty", satu kosong="partial"/Incomplete). Fixed:
  `if (!srcVal && !cmpVal) return "empty"; if (!srcVal || !cmpVal) return "partial";`
- **Tabel "NO VESSEL NAME AND IMO NUMBER" gated Document Completeness Checklist** —
  `getDocChecklistFlag(compareDoc, flags)` map PO/CIPL/Final Invoice → `ada_po`/`ada_cipl`/
  `ada_final_invoice`. `computeStatus(..., docChecked=true)` — `if (!docChecked) return
  "partial"` dicek **PALING AWAL, SEBELUM `isPoNonImi`** (urutan KRITIS — versi awal taruh
  `isPoNonImi` duluan, bug: PO non-IMI bypass total gating checklist walau dok "Missing").
  **JANGAN tukar urutan ini lagi.** State `docCompletenessFlags` di-fetch sekali di `doLoad()`
  dari `dokumen_checklist`, SEBELUM early-return baris tersimpan.

## Courier — Document Validation, tombol "Recompute Missing Data" (`ValidasiModal.tsx`, 2026-09)

**Kasus nyata yang memicu fitur ini** (AWB "DHL NO. 1973256202", jenis CN): user melaporkan
kolom "Final Invoice" di tabel CIPL (khusus CN) berstatus "Incomplete", dan baris "Final
Invoice"/"BT Vendor" di TABEL NPWP berstatus "Not checked yet" — padahal user sudah cek langsung
ke `dokumen_validasi.data_validasi_raw` dan datanya (`cipl_v`/`final_invoice`/`bt_vendor_v`)
LENGKAP. Ditelusuri (baca kode + query SQL manual `tabel_checklist_validasi.values_json` utk
AWB itu): checklist SUDAH tersimpan sejak SEBELUM dokumen Final Invoice/BT Vendor-nya lengkap
(kemungkinan besar dokumen itu menyusul belakangan atau baru diproses ulang n8n) — `values_json`
tersimpan py `cipl03.cmp=""`, `cipl04.cmp=""`, `final_invoice_nama_npwp.src=""`,
`bt_vendor_nama_npwp.src=""` walau `dokumen_validasi` SEKARANG sudah lengkap. Ini BUKAN bug baru
— pola PERSIS sama dgn catatan "Src baris No. AWB kolom SPPB (pib02)" di atas: begitu ada 1
baris `tabel_checklist_validasi` tersimpan, `doLoad()` SELALU load `values_json` itu apa adanya
& tidak pernah hitung ulang dari `dokumen_validasi` (`if (checklist.length > 0) { setValues(...);
return; }`, lihat bagian gating Checklist di atas) — kalau dokumen sumbernya lengkap BELAKANGAN,
field yang kadung kosong di checklist TIDAK PERNAH otomatis ter-update ("BUKAN retroaktif").

**Kenapa TIDAK digabung ke `dokumen_validasi` sekalian (dibahas dgn user)**: `dokumen_validasi.
data_validasi_raw` ditimpa TOTAL oleh n8n tiap kali dokumen diproses ulang — kalau checklist
manual (status per baris, catatan, nama checker) ditulis ke kolom yang sama, hasil kerja manual
user bisa hilang tertimpa n8n tanpa jejak. `tabel_checklist_validasi` sengaja terpisah supaya
hasil ekstraksi AI vs hasil kerja manusia tidak saling menimpa, DAN supaya ada riwayat audit
(nama checker/tanggal cek). **Solusinya BUKAN menggabung tabel, tapi mekanisme recompute.**

**Arsitektur solusi**:
- **`buildValidationValues(raw, docAwb, localNpwps)`** (fungsi module-level BARU, di atas
  `computeStatus()`) — hasil EKSTRAKSI VERBATIM dari fill() block yang SEBELUMNYA inline di
  dalam `doLoad()` (~300 baris, TIDAK ada satu baris logic pun yang diubah, cuma dipindah +
  `newV`→`out` + wrap jadi fungsi murni yang seed semua `SECTIONS` row id dulu baru fill()).
  Fungsi ini SEKARANG SATU-SATUNYA sumber logic fill() — `doLoad()` tidak lagi punya salinan
  sendiri. **Kalau logic fill() perlu diubah lagi ke depan, ubah DI SINI SAJA.**
- **`doLoad()` direstrukturisasi** — urutan lama: (fetch raw) → (cek checklist, `return` kalau
  ada) → (fetch NPWP master) → (fill() inline, HANYA jalan kalau checklist TIDAK ada). Urutan
  BARU: (fetch raw) → (fetch NPWP master, DIPINDAH ke sini, SEKARANG SELALU jalan) → `const
  computed = buildValidationValues(...)` (SELALU dihitung, disimpan ke `computedValuesRef`) →
  (cek checklist, `return` kalau ada, TIDAK BERUBAH) → `setValues(computed)` (kalau checklist
  tidak ada, ganti dari fill() inline jadi pakai `computed` yang sudah dihitung). Efek samping
  KECIL yang diterima: fetch NPWP master sekarang jalan juga di kasus checklist SUDAH ada (dulu
  di-skip) — biaya 1 query ekstra, perlu supaya `computedValuesRef` selalu siap dipakai tombol
  Recompute kapan pun, termasuk saat checklist SUDAH ada.
- **`computedValuesRef`** (`useRef`, BUKAN state — murni data mentah utk tombol, tidak perlu
  re-render) — menyimpan hasil `buildValidationValues()` PALING TERBARU tiap `doLoad()` jalan
  (checklist ada ATAU tidak).
- **Tombol "Recompute Missing Data"** — HANYA muncul di mode Edit (aksi disengaja, ikut alur
  Save/Cancel yang SUDAH ADA: klik Cancel akan membatalkan hasil recompute juga lewat
  `snapshotValues` yang sudah ada sebelumnya, TIDAK ada mekanisme undo baru yang perlu dibuat).
  `handleRecomputeMissing()` — utk TIAP row id, isi **src** dari `computed[id].src` HANYA kalau
  `cur.src` kosong DAN `cur.src_edited` tidak true; isi **cmp** dari `computed[id].cmp` HANYA
  kalau `cur.cmp` kosong DAN `cur.cmp_edited` tidak true — src/cmp dicek & diisi SECARA
  TERPISAH (bukan "isi kalau KEDUANYA kosong") krn kasus nyata di atas persis begini: `cipl03.src`
  SUDAH terisi ("EX-29") tapi `cipl04.cmp` kosong — kalau syaratnya "keduanya kosong", baris ini
  tidak akan ke-refill sama sekali. **Field yang SUDAH terisi (dari fill() lama ATAU edit manual
  user) TIDAK PERNAH ditimpa** — ini alasan utama kenapa fitur ini AMAN dipakai kapan saja tanpa
  risiko menghapus kerja checker yang sudah ada. `manual_status` (override status Match/Mismatch
  manual via `toggleManualStatus`) SENGAJA TIDAK dianggap "sudah diedit" di sini (field terpisah
  dari src/cmp) — override status tetap dipertahankan apa adanya walau src/cmp-nya baru terisi.
  Toast hasil (`recomputeMsg`, state lokal BARU) tampil "N field terisi..." atau "Tidak ada field
  kosong yang bisa diisi ulang..." — auto-hilang 6 detik.
- **Persistensi** — TIDAK ADA kode simpan baru; `setValues()` dari `handleRecomputeMissing`
  memicu `useEffect` autosave debounce yang SUDAH ADA (upsert ke `tabel_checklist_validasi`
  seperti edit manual biasa), jadi hasil recompute otomatis tersimpan.

**Susulan (2026-09) — cegah checklist baru kebuat cuma krn user MEMBUKA/MELIHAT modal (tanpa
edit apa pun)**: laporan user — untuk 1 record yang baru dibuka utk keperluan investigasi di
atas, baris `tabel_checklist_validasi` tetap ke-INSERT walau TIDAK ADA satu pun ikon pensil
"sudah diedit" muncul (artinya benar2 belum ada field yang disentuh user). Root cause PASTINYA
belum 100% dikonfirmasi (kandidat: race/timing autosave lama di sekitar `skipNextAutosaveRef`),
tapi solusinya DIBUAT GENERIK supaya aman terlepas dari penyebab persisnya:

- **`userActionRef`** (`useRef(false)`, BARU) — diset `true` HANYA di titik yang BENERAN dipicu
  aksi user: `setObj`, `setSrcForGroup`, `toggleManualStatus`, `handleRecomputeMissing`, DAN 4
  `onChange` input header (No. AWB, Check Date, Checked By, Manual Change Notes — ke-4nya HANYA
  editable saat `isEditMode`). **TIDAK PERNAH** diset di `doLoad()` (pengisian programatik awal
  dari `dokumen_validasi`/checklist tersimpan) — itu justru state yang HARUS TETAP dianggap
  "belum ada aksi user".
- **Guard di autosave effect** (SEBELUM membangun `payload`/insert-update) — `if (!(existing &&
  existing.length > 0) && !userActionRef.current) return;`. Efeknya: kalau BELUM ADA baris
  checklist sama sekali UNTUK shipment ini DAN belum ada satu pun aksi user tercatat di sesi
  modal ini, autosave di-skip TOTAL (tidak insert baris baru) — modal boleh dibuka/dilihat
  berkali-kali tanpa pernah membuat baris checklist kalau memang tidak ada yang diedit. Baris
  yang **SUDAH ADA** sebelumnya (kasus `existing.length > 0`) TETAP diupdate seperti biasa,
  TIDAK ikut diblokir guard ini — mengubah itu di luar cakupan permintaan (fokusnya cuma
  mencegah checklist BARU yang "phantom", bukan menghentikan update checklist yang memang sudah
  legitimate ada). **Kalau nambah cara edit BARU ke `values`/`awbNo`/`tanggal`/`namaChecker`/
  `catatanManual` ke depan (field baru, tombol baru, dst), WAJIB set `userActionRef.current =
  true` juga di situ** — kalau lupa, edit itu tidak akan pernah membuat baris checklist BARU
  (walau field-nya sendiri tetap ter-update di state React, cuma tidak ke-persist ke DB sampai
  ada aksi lain yang men-set `userActionRef`).

## Courier Audit — kolom "Kurs BI (Rp)" di tab Draft

Tab Draft (gabung PIB+CN) pakai `activeCols=PIB_COLS` yg tidak punya `kurs_bi` (cuma
`CN_COLS` yg punya) — baris CN di Draft dulu tidak pernah tampil Kurs BI. Fix: `activeCols` utk
Draft dibangun via IIFE, sisip `{key:'kurs_bi', label:'Kurs BI (Rp)', type:'num'}` setelah
`kurs_ndpbm`. `COURIER_AUDIT_CUSTOMIZABLE_COLS` sudah cakup ini dari awal.

## Sea & Air — Modal Cost Validasi Shipment & Invoice (`ValidasiShipmentInvoiceLengkap.tsx`)

`globalStats` (footer "Cost Validation Summary") tambah % + progress bar (REPLIKA
`SeaAirValidasiModal.tsx`). `pct = round(match/total*100)`, `total` = SEMUA baris `checks`
(bukan cuma yg statusnya terisi). Baris section `'SURVEYOR'` DIKECUALIKAN dari hitungan (opsional,
tidak boleh turunkan skor). File ini BELUM diaudit menyeluruh apakah punya pola SECTIONS/
row-col-lookup lain — cek dulu sebelum translate/ubah row/col lain.

## Audit AP Local — halaman laporan otomasi + koreksi terbatas (`src/pages/AuditPoPage.tsx`)

Nama file/route/page_key `AuditPoPage`/`/audit-po`/`audit_po` (teknis), label tampil **"Audit AP
Local"**. Tidak punya judul card, panel filter langsung jadi header, `justify-end`.

**PENTING — 3 halaman duplikat arsitektur**: `AuditPoPage.tsx` (tabel `audit_po_ap_comp`),
`AuditPoOverseasPage.tsx` (`audit_po_apovs_comp`), `PiLocalPage.tsx` (`audit_po_pi_local_comp`)
adalah **DUPLIKASI SENGAJA, TIDAK ADA KOMPONEN SHARED** — pola/struktur identik persis
(`KategoriPicker`, `PreviewModal`, `DashboardModal`, dll masing2 py salinan sendiri). Kalau
mengubah salah satu, **WAJIB porting manual ke 2 lainnya** kecuali disebutkan HANYA utk 1
halaman. Rule ini dinyatakan SEKALI di sini — subbagian di bawah tidak mengulanginya lagi
kecuali ada pengecualian scope.

- Tabel `audit_po_ap_comp` diisi otomasi backend tiap 30 menit. 5 kolom (`nama_pt`, `nomor_po`,
  `vendor_name`, `status_audit`, `kategori`) bisa dikoreksi manual + baris bisa dihapus permanen;
  kolom lain read-only murni. `nama_pt`/`nomor_po` SEKARANG read-only di modal Edit (permintaan
  user), Vendor/Status Audit/Kategori tetap edit.
- **Kolom Aksi** — toggle panel per baris (`openActionsRowId`, pola `FarOverseasAirPage.tsx`,
  bukan floating absolute). Panel **TIDAK auto-close** setelah klik item (fix: `setOpenActionsRowId
  (null)` dihapus dari 4 onClick) — hanya tutup via toggle manual.
- Tabel `table-fixed` + `<colgroup>` lebar eksplisit (bukan auto-layout, hindari sticky-column
  quirk). **Beberapa percobaan fix "kolom Aksi kosong/tidak fit" SEMUA DIREVERT** — kondisi
  final: 8 `<col>` lebar tetap (Vendor 160px, Aksi 105px), `w-full`, `min-w-[980px]`, wrapper
  tombol Aksi `w-[92px] mx-auto` (rata tengah — ini yg fix "ruang kosong kanan", BUKAN
  colgroup/table-layout). **JANGAN coba lagi**: (a) tambah `<col>` ke-9, (b) shrink konten
  th/td doang, (c) lepas `w-full` (bikin celah di luar tabel), (d) jadikan kolom Vendor polos
  tanpa lebar (teknis berhasil tapi user bilang "tidak cantik").
  **Aturan wajib**: tiap tambah/hapus kolom tabel `table-fixed`, WAJIB samakan `min-w-[...]`
  dgn SUM lebar `<col>` tersisa (bug pernah terjadi: hapus kolom Durasi di PiLocalPage tanpa
  update `min-w`, kolom lain jadi redistribusi tidak proporsional).
  - `EditAuditPoModal` — form, `updateAuditPoRow(id, updates)`.
  - `DeleteAuditPoModal` — pola `DeleteConfirmModal` Bunker.
  - **Preview PDF/Hasil Audit via `PreviewModal` in-app** (BUKAN `<a target=_blank>` biasa) —
    riwayat: Drive tidak pernah render HTML upload user sbg halaman hidup (proteksi XSS bawaan,
    cuma source code mentah tampil) → iframe `src` langsung ke URL luar kena X-Frame-
    Options/CSP blank tanpa pesan. **Solusi final**: proxy backend
    `GET /api/drive-file-proxy?id=<drive_file_id>` (`server.ts`, id divalidasi regex ketat
    `^[a-zA-Z0-9_-]{10,100}$`, request server-ke-server ke
    `https://drive.usercontent.google.com/download?id=...&export=download&confirm=t`, di-STREAM
    langsung tanpa disk). `PreviewModal` fetch via JS lalu suntik `srcDoc` (HTML) atau
    `blob:` URL (PDF, `Blob` di-rewrap paksa `type:'application/pdf'` — fix bug PDF trigger
    download krn Content-Type upstream generik) ke iframe — `srcDoc`/`blob:` dianggap
    same-origin, imun X-Frame-Options. `buildPreviewSrc(driveFileId, rawUrl)` prioritaskan proxy,
    `url_pdf`/`url_html` mentah fallback. Tombol pojok kanan "Download File" (bukan lagi "Buka
    di tab baru" — fungsinya memang selalu trigger download). Tombol **Print** —
    `sandbox="allow-same-origin allow-modals"` WAJIB (tanpa `allow-modals`, `window.print()`
    diblokir diam-diam meski dipanggil dari parent window). Tinggi modal `h-[98vh]`.
  - Tombol "Reset Filter" (`FilterX` icon polos) — reset search/PT/Kategori/tanggal, TIDAK reset
    sortBy/sortDir/pageSize.
  - Pagination **server-side** (`.range()`, tabel terus bertambah). Search debounced 400ms ke
    `nomor_po`/`vendor_name`. Dropdown `nama_pt` & `kategori` DINAMIS dari data asli (lihat
    subbagian tersendiri di bawah, bukan lagi hardcode `PT_OPTIONS`). `STATUS_AUDIT_OPTIONS`
    datalist DIHAPUS TOTAL (input polos, ketik manual).
  - Kolom **Kategori** — combobox `KategoriPicker` (bukan free text), **MULTI-SELECT** (checkbox
    toggle + tombol "Selesai", disimpan 1 string gabung `" + "` via `KATEGORI_MULTI_SEPARATOR`/
    `parseKategoriMulti()`). Filter kategori pakai `.ilike('%..%')` bukan `.eq` (exact match
    gagal cocok ke gabungan). **Dropdown di-render via React Portal ke `document.body`**
    (`position:fixed`, arah buka dihitung ulang tiap buka dari `getBoundingClientRect()` vs
    `window.innerHeight`) — FIX TUNTAS dari 2 percobaan gagal sebelumnya (tebak arah dari index
    baris — salah kalau total baris sedikit). Prop `openDirection` DIHAPUS TOTAL dari
    `KategoriPicker`/`KategoriCell`.
  - Kolom Vendor — `break-words` (bukan truncate+tooltip), nama panjang wrap penuh.
  - `src/utils/AuditPoHelpers.ts` — `AuditPoRow`, `AuditPoEditableFields`, `statusAuditMeta`,
    `KATEGORI_OPTIONS`, `updateAuditPoKategori`, `updateAuditPoRow`, `deleteAuditPoRow`.
  - `PAGE_REGISTRY` key `audit_po`, group `'Audit AP Local'` (grouping utk matrix Kelola Role
    SAJA, tidak terkait struktur submenu sidebar — lihat "Compare Doc" di bawah).
  - **Tombol "Dashboard" + `DashboardModal`** (paling kiri panel filter) — ringkasan poin ala
    slide internal. Tab **Overview**: pie chart SVG manual (bukan `conic-gradient` lagi, sudah
    diganti — geometri lingkaran penuh dipertahankan utk callout label akurat), efek "3D"
    (radial gradient + drop-shadow + rim stroke, helper `lightenHex`/`darkenHex`), `r=105,
    cx=300` (JAGA `cx-r=195` konstan kalau resize pie — margin callout aman). Tab **Per Vendor**:
    chart batang vertikal per `nama_pt` (`status_audit` terisi), `niceAxisStep()` helper axis.
    Tab **Kategori** (chart batang HORIZONTAL per `kategori`, `wrapKategoriLabel()` word-wrap,
    TIDAK di-seed 0 seperti Per Vendor — kalau kosong, pesan "Tidak ada kategori tercatat").
    Wrapper `min-h-[380px] mt-3 flex flex-col justify-center` (SAMA di semua tab, cegah modal
    "meloncat" ukuran). Tab switcher aktif = `bg-[#5A305A] text-white`.
    Semua 3 tab (Overview/Per Vendor/Kategori) + efek 3D + dropdown dinamis PT — porting: 3
    halaman duplikat (lihat catatan di atas).
  - **Filter dropdown "Semua PT" & seed chart "Per Vendor" DINAMIS** (bukan hardcode
    `PT_OPTIONS` lagi) — `fetchDistinctNamaPt(table)` (`select('nama_pt')`, dedup+sort client),
    fallback ke `PT_OPTIONS` kalau gagal/kosong. State `ptOptions`, 2 titik per halaman (komponen
    utama + `DashboardModal`). Fix laporan "PT baru (mis. GUN) tidak muncul di dropdown/chart".
  - **Kolom Kategori sortable** — `type SortKey` tambah `'kategori'`, `<SortableHeader>` di th.
    Sort server-side (`.order()`, generik). `.order(sortBy,{ascending, nullsFirst:false})` —
    fix bug baris kosong nongol di atas saat sort ASC (Postgres default NULL=largest).

## Audit AP Overseas (`AuditPoOverseasPage.tsx`)

Duplikasi persis Audit AP Local (lihat rule duplikasi di atas), tabel `audit_po_apovs_comp`.
`KATEGORI_OPTIONS` **BEDA TOTAL** dari AP Local (istilah Impor/Overseas bahasa Inggris: "DOKUMEN
STOCK IN/PI", "IMPORT CALCULATION/LOGISTIC", "CUSTOMER NAME", "CURRENCY", "PN NUMBER" dst) —
**sejak 2026-09 JANGAN disamakan otomatis lagi** antara `AuditPoHelpers.ts` &
`AuditPoOverseasHelpers.ts` (dulu wajar sama, sekarang sengaja beda).

Tab ke-3 "Kategori" di Dashboard PERTAMA KALI dibuat di sini, lalu di-porting ke AP Local &
PiLocal (lihat detail di bagian Audit AP Local). `MainLayout.tsx` bug fix: `activeMainTab`
deteksi via `pathBelongs(pathname, base)` (exact match atau diikuti `/`) — bukan `startsWith`
polos, krn `/audit-po-overseas` diawali string `/audit-po`.

Page_key `audit_po_overseas`, route `/audit-po-overseas`, group `'Audit AP Overseas'`.

**BELUM DIJALANKAN ke Supabase production**:
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

## Accounting Rekap — duplikasi Audit AP Local, tabel finance baru (`src/pages/AccountingRekapPage.tsx`, 2026-09)

Dibuat 2026-09 atas permintaan user: halaman baru "identik" tampilannya dgn Audit AP Local, jadi
sub-halaman ke-4 di bawah menu sidebar "Compare Doc" (bareng Bunker/Audit AP Local/Audit AP
Overseas) — DUPLIKASI SENGAJA (bukan komponen generik/di-share), sama prinsipnya dgn Audit AP
Overseas/PI Local. Kalau ada bug/fitur yang perlu diterapkan ke salah satu halaman "Compare Doc"
manapun, JANGAN asumsikan otomatis ke-apply ke yang lain.

- Tabel `accounting_rekap_finance` (skema diberikan user apa adanya): `id`, `created_at`,
  `tanggal_dokumen`, `vendor`, `nomor_po`, `pt_internal`, `bank`, `total_bayar` (bigint),
  `lokasi_folder`, `drive_file_id`, `url_view`, `waktu_proses`, `status_proses`. **RLS
  DISERAGAMKAN (2026-09, permintaan user) dgn pola `audit_po_apovs_comp`/Audit AP Overseas** —
  policy SELECT longgar bawaan (`accounting_rekap_finance_select_anon`, `to anon,
  authenticated using (true)`) DIGANTI jadi `has_page_access('accounting_rekap')`, ditambah 3
  policy INSERT/UPDATE/DELETE via `has_edit_access('accounting_rekap')`:
  ```sql
  drop policy if exists "accounting_rekap_finance_select_anon" on public.accounting_rekap_finance;
  create policy "accounting_rekap_finance_select" on public.accounting_rekap_finance
    for select using (public.has_page_access('accounting_rekap'));
  create policy "accounting_rekap_finance_insert" on public.accounting_rekap_finance
    for insert with check (public.has_edit_access('accounting_rekap'));
  create policy "accounting_rekap_finance_update" on public.accounting_rekap_finance
    for update using (public.has_edit_access('accounting_rekap'))
    with check (public.has_edit_access('accounting_rekap'));
  create policy "accounting_rekap_finance_delete" on public.accounting_rekap_finance
    for delete using (public.has_edit_access('accounting_rekap'));
  ```
  **BELUM DIVERIFIKASI dijalankan ke Supabase production** — WAJIB dijalankan manual dulu
  sebelum halaman ini bisa diakses sama sekali (SELECT sekarang butuh page access, bukan lagi
  `true` bebas) dan sebelum Edit/Hapus bisa jalan.
- Beda dari Audit AP Local: **TIDAK ADA kolom `kategori` sama sekali** di tabel ini — jadi
  `KategoriPicker`/`KategoriCell`/kolom Kategori di tabel & tab "Kategori" di modal Dashboard
  DIHILANGKAN TOTAL (bukan disembunyikan), modal Dashboard cuma py 2 tab (Overview/Per Vendor).
  Field mapping: `nama_pt`→`pt_internal`, `vendor_name`→`vendor`, `status_audit`→`status_proses`,
  `durasi_text`→`waktu_proses`. Field baru yang tidak ada di Audit AP Local:
  `tanggal_dokumen`/`bank`/`total_bayar`/`lokasi_folder` — `tanggal_dokumen`/`bank`/
  `total_bayar`/`status_proses` boleh dikoreksi manual lewat modal Edit (bareng `vendor`),
  `pt_internal`/`nomor_po` TETAP read-only (konsisten pola Audit AP Local versi terbaru).
  `lokasi_folder`/`drive_file_id`/`url_view`/`waktu_proses` murni hasil otomasi backend.
- **Preview dokumen disederhanakan jadi 1 file** (beda dari Audit AP Local yg py 2 tombol
  terpisah PDF/Hasil Audit) — tombol tunggal "Preview" pakai `url_view`/`drive_file_id` yg sama,
  `guessPreviewKind()` menebak `html` vs `pdf` dari ekstensi URL (fallback `pdf`, kemungkinan
  besar dokumen finance di-scan sbg PDF). `buildPreviewSrc`/`PreviewModal` (proxy
  `/api/drive-file-proxy?id=...`, fetch+srcDoc/blob teknik) REPLIKA PERSIS Audit AP Local.
- `statusProsesMeta()` (`AccountingRekapHelpers.ts`) — beda dari `statusAuditMeta` Audit AP Local
  (yang cuma 2 nilai tetap "Selesai Diproses"/"Doc tidak terbaca") — domain nilai `status_proses`
  BELUM DITENTUKAN (bebas teks dari otomasi/manual), jadi TIDAK ada mapping label per-nilai,
  cukup tampilkan apa adanya + badge amber kalau terisi, abu-abu netral kalau kosong. **Badge
  `StatusBadge` WAJIB bisa wrap** (`rounded-lg break-words`, BUKAN `rounded-full whitespace-nowrap`
  spt versi awal) — krn teksnya bebas panjang (bukan enum tetap), pill nowrap bikin teks panjang
  overflow keluar kolom & tidak kelihatan (2026-09, laporan user). Sama pola dgn kolom Nomor
  PO/Vendor (`break-words`) di tabel yg sama.
  **Kolom "Waktu Proses" disembunyikan dari tabel** (2026-09, permintaan user) — `<col>`/`<th>`/
  `<td>`-nya dihapus total (bukan cuma disembunyikan CSS), `colSpan` empty-state 10->9, `min-w`
  table-fixed disamakan ke SUM lebar `<col>` tersisa (1175px->1075px, lihat aturan wajib
  table-fixed di bagian "Audit AP Local" di atas). Data `waktu_proses` TETAP ada di DB/query,
  cuma tidak dirender.
  Dashboard "Total Bermasalah"/"Total Sesuai" pakai konvensi SAMA dgn Audit AP Local:
  `status_proses` TIDAK null = "Bermasalah", selisihnya = "Sesuai".
- `formatRupiah()` (baru, tidak ada equivalent di Audit AP Local) — format `total_bayar` jadi
  `"Rp 1.234.567"` (`toLocaleString('id-ID')`), dipakai kolom tabel & (belum) di modal Dashboard.
- Page_key `accounting_rekap`, route `/accounting-rekap`, group PAGE_REGISTRY `'Accounting
  Rekap'` (grup baru, generik lewat `PAGE_GROUPS` — otomatis muncul di matrix Kelola Role &
  Akses). Didaftarkan sbg subTab ke-4 grup "Compare Doc" di `MainLayout.tsx` (`basePath` induk
  `/compare-doc` tetap dummy, tidak perlu diubah — `pathBelongs` generik sudah menangani path
  baru ini otomatis lewat `t.subTabs?.some(...)`, lihat bagian "Compare Doc" di bawah).
- `src/utils/AccountingRekapHelpers.ts` — duplikasi pola `AuditPoHelpers.ts`: tipe
  `AccountingRekapRow`, `AccountingRekapEditableFields`, `statusProsesMeta`, `formatRupiah`,
  `updateAccountingRekapRow`, `deleteAccountingRekapRow`.
- **BELUM porting**: fitur "Dropdown Kategori bisa multi-select"/`KategoriPicker` (tidak relevan,
  tabel ini tidak punya kolom kategori), badge persentase/Checklist/Cost Validation (tabel ini
  tidak py konsep checklist/cost-validasi terpisah spt Courier). `PT_OPTIONS` fallback +
  `fetchDistinctPtInternal('accounting_rekap_finance')` (pola sama `fetchDistinctNamaPt` Audit AP
  Local) SUDAH diterapkan dari awal (bukan hardcode statis).

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

## Customize View — Audit Courier & Rekapan Courier (`SharedDataTable.tsx`)

Pilih kolom tampil, terpisah 2 menu (Sea & Air/Validasi/Audit Trail tidak ikut).
`COURIER_AUDIT_CUSTOMIZABLE_COLS` (gabungan dedup PIB_COLS+CN_COLS)/
`COURIER_REKAPAN_CUSTOMIZABLE_COLS` (COURIER_COLS). Disimpan localStorage (BUKAN Supabase — murni
preferensi tampilan), key `beehive_customize_view:${user.id}:courier_audit`/`:courier_rekapan`
(tidak sinkron lintas device, disengaja). `CustomizeViewModal` generik (title/allCols/hiddenKeys/
onCancel/onSave), state pending lokal (butuh klik Save, bukan auto-apply). Tombol "Reset to
Default"/"Uncheck All" di footer.

**Penerapan**: `activeCols` (dipakai EditModal/AddRowModal/Export) TETAP UTUH — variable BARU
`visibleCols` (filter buang hidden keys, HANYA aktif di courier_audit/courier_rekapan) dipakai
GANTI `activeCols` di thead + row-group Courier saja. **Kalau diperluas ke tab lain, WAJIB ikuti
pola ini — jangan filter `activeCols` itu sendiri.**

## Export Excel — "Filter by Column" (`ExportModal.tsx`, 2026-09)

Sebelumnya `ExportModal` (dipakai SEMUA tab yang punya tombol Export: Audit Courier, Rekapan
Courier, Audit Sea & Air, Rekapan Sea & Air, Audit Trail, dll — komponen generik SATU-SATUNYA)
cuma punya 1 filter: date range (`startDate`/`endDate`), dan kolom tanggal yang dipakai
DI-HARDCODE per tab di `getExportData()` (`SharedDataTable.tsx`, mis. Audit Courier =
`tgl_ppjk`, Rekapan Courier = `tgl_terima_email`) — tidak bisa filter by kolom lain. User minta
bisa filter by KOLOM APA SAJA, dengan date picker TETAP dipakai khusus kolom tanggal.

**Keputusan arsitektur (Opsi A dari analisa)**: filter kolom baru ini **MURNI client-side**, di
DALAM `ExportModal.tsx` saja — TIDAK mengubah `getExportData()` di `SharedDataTable.tsx` sama
sekali (file itu sudah besar & sensitif, banyak logic bercabang per tab). Alasan ini AMAN:
query `getExportData` SUDAH `.limit(25000-50000)` tanpa filter kolom tambahan pun (cuma
dibatasi date range server-side) — jadi data yang relevan SUDAH tertarik penuh ke browser
sebelum file Excel dibuat, filter kolom lanjutan tidak perlu round-trip ke Supabase lagi.
Konsekuensinya: **fitur ini otomatis berlaku ke SEMUA tab yang pakai `ExportModal`** (tidak
cuma Audit/Rekapan Courier yang diminta awal), krn satu implementasi generik.

- **State BARU**: `columnFilters: ColumnFilter[]` (`{key,col,op,text,from,to,boolVal}`, `key`
  = id unik row filter biar bisa banyak filter sekaligus, semua di-AND-kan) + toggle panel
  `showColumnFilters`. Date range (`startDate`/`endDate`) TIDAK diubah/dihapus — TETAP filter
  utama/wajib di server (biar volume fetch awal terkontrol), filter kolom ini MURNI tambahan.
- **`opForType(type)`** — nentuin jenis input dari tipe kolom (`c.type`, SUDAH ADA di `cols`
  prop yang dikirim tiap pemanggil `ExportModal`, sama persis yang dipakai render tabel
  on-screen): `date`/`datetime` -> **2 date picker (from/to)** (permintaan eksplisit user "date
  picker tetap ada"); `num`/`pct` -> 2 input angka (min/max); `bool` -> dropdown
  LULUS/GAGAL/Semua; sisanya (teks, `status`, `invType`, `awb_strip_carrier`, dll) -> input teks
  "contains" (case-insensitive).
- **`filteredData`** (`useMemo`, filter `data` yang sudah ke-fetch dari date range) — SATU
  SUMBER dipakai KETIGA tempat: tabel preview (10 baris pertama), teks "Total N row(s)", DAN
  `handleExport()` (`filteredData.forEach` GANTI `data.forEach`) — supaya file Excel yang
  didownload SELALU SAMA PERSIS dgn yang di-preview, tidak pernah beda.
- **Perbandingan nilai** — kolom `date`/`num` dibandingkan dari NILAI MENTAH (`item[col.key]`,
  via `rawColVal()`, termasuk fallback `po_no`/`vessel` dari `po_detail` yang sudah ada sblmnya)
  supaya perbandingan range akurat (bukan string hasil format). Kolom teks ("contains")
  dicocokkan ke VERSI TER-FORMAT (`formatValue()`, fungsi yang SAMA dipakai preview & Excel) —
  supaya pencarian teks cocok dengan apa yang user LIHAT di preview, bukan raw value internal
  yang mungkin beda format (mis. NPWP mentah vs NPWP yang sudah diformat titik-strip).
  **JANGAN duplikat logic format lain di sini** — selalu reuse `formatValue()`/`rawColVal()`.
- **UI** — tombol "Filter by Column (N)" di toolbar (jadi ungu solid kalau ada filter aktif,
  konsisten pola toggle lain di app), toggle panel di bawahnya isi baris-baris filter (dropdown
  pilih kolom + input sesuai tipe + tombol ✕ hapus baris itu), tombol "+ Tambah Filter Kolom" /
  "Hapus Semua Filter Kolom". Panel HANYA tampil kalau `showColumnFilters` true — supaya toolbar
  modal tidak penuh utk user yang tidak butuh fitur ini.
- **Gap diketahui**: filter kolom teks pakai match sederhana ("contains" 1 nilai), BUKAN
  dropdown pilihan nilai unik ala Excel AutoFilter (skrinsyut acuan user) — dipertimbangkan tapi
  TIDAK diimplementasikan krn effort lebih besar (perlu hitung distinct value per kolom dari
  `data`) utk manfaat marginal (user masih bisa ketik nilai yang dicari). Bisa ditingkatkan kalau
  diminta eksplisit.

## Highlight baris Submit Date — Rekapan Courier (`CourierRekapanRowGroup`)

Baris dgn `submit_date` terisi diberi warna latar `bg-[#FFF5C5]` (kuning, hover
`#F5E28F`) + `border-l-[3px] border-l-[#E6C25C]` — SELALU menang di atas kombinasi bg lain
(edit massal/split-PO). **Riwayat warna (ungu→coral→gradient→kuning solid FINAL) — JANGAN
reintroduce versi lama.** 2 tempat tambahan HARUS ikut disesuaikan (kolom pertama saat PO
expanded, kolom Action sticky) — kalau tidak, highlight "bolong" putih. Cakupan SENGAJA cuma
`CourierRekapanRowGroup` (3 row-group lain dgn pola sama TIDAK disentuh). App ini TIDAK punya
dark mode.

**Badge warna per Invoice Type** (`getCellData()` type `invType`) — FREIGHT=coral, DUTY=kuning
gelap, CREDIT NOTE DUTY/FREIGHT=ungu brand, lainnya=sky biru (fallback). Deteksi
`.includes('CREDIT NOTE')` dicek PALING DULU sebelum exact-match DUTY/FREIGHT.

**Export Excel Rekapan Courier** — PO PT IMI/Vessel dkk **TIDAK di-split lagi jadi banyak baris**
(beda dari Sea & Air Rekapan yg TETAP split via `po_detail` JSON — TIDAK disentuh). `getSplitRows()`
cabang `courier_rekapan` DIHAPUS total, `parseCourierPoVesselPairs`/
`COURIER_REKAPAN_SPLIT_REPEATING_COLS` dihapus (dead code). Highlight `submit_date` ikut ke Excel
via `applySubmitDateHighlight()` (ARGB `FFFFF5C5`, `row.eachCell({includeEmpty:true})`) — guard
`splitByPoDetail !== 'courier_rekapan'` supaya tidak ikut mewarnai export lain. **Kalau warna
on-screen diganti, WAJIB sinkron ARGB di sini juga.**

## Audit Courier — Auto-Calculate 7 kolom turunan (2026-09, `SharedDataTable.tsx`)

Permintaan user: 7 kolom Audit Courier (PIB & CN) dihitung otomatis dari kolom sumbernya, urutan
WAJIB 1->7 (field bawah pakai hasil field atas), berlaku di SEMUA jalur input — form Add Data,
form Edit, edit massal/inline, DAN data hasil isian n8n (live-compute saat tampil, app ini tidak
bisa "mencegat" insert n8n langsung ke Supabase). Field manapun yg PERNAH diedit manual oleh user
TIDAK PERNAH ditimpa otomatis lagi (ditandai biru+ikon pensil di form).

**Formula** (`computeCourierAuditCalc()`, fungsi pure module-level dipakai di semua jalur di
bawah — SATU-SATUNYA sumber kebenaran, JANGAN duplikat logic ini di tempat lain):
1. `total_nilai_pabean` (Total Customs Value) = `valas_dpp` × `kurs_ndpbm`
2. `total_nilai_pabean_bm` (T N.Pabean + BM) = (1) + `bm`
3. `ppn_pct` = `ppn_nilai` / (2), `""` kalau (2) kosong/0 (guard pembagi nol)
4. `pph_pct` = `pph_nilai` / (2), `""` kalau (2) kosong/0
5. `item_price_idr` = `""` kalau `item_price`+`other_cost` DUA-DUANYA kosong; kalau `kurs`
   (kolom CURRENCY, dibandingkan `==='USD'`) → `(item_price+other_cost) × kurs_ndpbm`; selain
   itu → `item_price × kurs_bi` (PIB tidak punya kolom Kurs BI sendiri, fallback `kurs_ndpbm`,
   sama pola fallback yg sudah ada sebelumnya di kode)
6. `total_pib_cn` (Total PIB/CN Rp) = `bm` + `ppn_nilai` + `pph_nilai` + (`jenis_dokumen==='CN'`
   ? `sanksi_adm` : 0)
7. `cek_selisih` (Check Difference) = (1) − (`item_price_idr` + `total_inv_freight`)

**Override manual per field** — kolom DB baru `manual_override_fields` (jsonb array nama field,
di `tabel_audit_pib` & `tabel_audit_cn`). **BELUM DIJALANKAN ke Supabase production**:
```sql
alter table public.tabel_audit_pib add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
alter table public.tabel_audit_cn add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
```
`computeCourierAuditCalc(row, jenisDokumen, overrideFields)` SKIP field yg ada di
`overrideFields` dari return-nya (pemanggil WAJIB merge, bukan replace total, ke row/payload).

**3 jalur wajib panggil fungsi ini, kalau ada jalur input baru WAJIB ikut ditambahkan**:
1. **`EditModal` (Add Data & Edit form)** — state `overrides: Set<string>` (diisi awal dari
   `record.manual_override_fields`), `setManual(key,val)` dipakai KHUSUS onChange 7 field ini
   (bukan `set` biasa) supaya nge-add ke `overrides` + `useEffect` (dependency semua kolom
   sumber formula) hitung ulang tiap render, SKIP field yg ada di `overrides`. Saat Save,
   `payload.manual_override_fields = Array.from(overrides)` (difilter cuma 7 nama field
   valid). Label field yg ke-override dikasih ikon `Pencil` biru (lucide-react) + title
   "Nilai diedit manual, tidak lagi dihitung otomatis". `allowedKeysCreate` (strip payload
   create, lihat bug di bawah) WAJIB include `'manual_override_fields'` juga (union manual),
   kalau lupa nasibnya sama dgn bug `status` di bawah — field percuma ditulis tapi hilang
   sebelum insert.
2. **`fetchRecords`/`getExportData`** (masing2 2 cabang: gabungan Draft + normal PIB/CN,
   TOTAL 4 titik) — `rows.forEach(r => Object.assign(r, computeCourierAuditCalc(r,
   r.jenis_dokumen, r.manual_override_fields)))` dipanggil SETELAH data mentah di-fetch. Ini
   yg bikin data hasil isian n8n ikut "terkoreksi" saat tampil tanpa perlu ubah workflow n8n.
3. **`handleInlineSaveRow`** (edit massal/per-baris inline courier_audit) — gabung
   `record` lama + `cleanedPayload` baru jadi `mergedRow`, field 7-kalkulasi yg ADA LANGSUNG
   di `cleanedPayload` (user ketik manual via inline edit) otomatis masuk
   `manual_override_fields` baru (union dgn yg lama), lalu `computeCourierAuditCalc` dipanggil
   dgn override gabungan itu & hasilnya di-`Object.assign` balik ke `cleanedPayload` sebelum
   `.update()`. **Bug terkait ditemukan & diperbaiki**: `activeCols` dipakai loop konversi
   Number sebelumnya salah pakai `COURIER_COLS` (kolom Rekapan) utk cabang `courier_audit` --
   diganti `[...PIB_COLS, ...CN_COLS]` supaya field2 kalkulasi ini beneran ke-convert Number
   sebelum dipakai hitung ulang dependency-nya.

**Field baru "Sanksi ADM" di form Add Data** — `sanksi_adm` sudah ada di `CN_COLS` (jadi
otomatis muncul saat tab aktif = CN), TAPI form Add Data dari tab **Draft** (default tab saat
buka Audit Courier) pakai `activeCols` berbasis `PIB_COLS` yg tidak punya kolom ini sama sekali
-- disisipkan manual (pola sama dgn `kurs_bi` yg sudah lebih dulu disisipkan ke cols Draft ini,
lihat catatan di bawah "Kolom AWB"). Sengaja TIDAK dibedakan tampil/sembunyi berdasar value
dropdown Document Type real-time (keputusan desain lama yg sudah dikonfirmasi, lihat bug fix
"Add Data kirim ke tabel salah" di bawah) — konsisten dgn precedent `kurs_bi`.

**Bug ditemukan & diperbaiki selama implementasi (status masih `LENGKAP` bukan `ARCHIVED` saat
Add Data)** — lihat detail lengkap di bagian "Add Data manual Audit Courier — kolom Status
terkunci ARCHIVED" di atas; root cause SAMA PERSIS (`allowedKeysCreate` strip key yg tidak ada
di `PIB_COLS`/`CN_COLS`) yg mengingatkan kenapa `manual_override_fields` WAJIB di-union manual
juga ke whitelist itu.

## Rekapan Courier — Auto-Calculate 6 kolom turunan (2026-09, `SharedDataTable.tsx`)

Sama prinsip & arsitektur dgn "Audit Courier — Auto-Calculate" di atas (baca itu dulu utk pola
umum: override manual permanen via kolom `manual_override_fields`, live-compute di 3 jalur
input). Fungsi pure `computeCourierRekapanCalc()` + `COURIER_REKAPAN_CALC_FIELDS` (6 field).

**Formula**: "Jumlah Vessel" = jumlah pemisah `+` pada kolom `vessel` + 1 (`courierRekapanVesselCount()`
-- vessel kosong = 1, TIDAK PERNAH 0, guard pembagi nol otomatis krn selalu minimal 1).
1. `total_amount` = `courier_adm_fee` + `total_duty_tax` + `total_freight` (berdiri sendiri,
   TIDAK bergantung Jumlah Vessel)
2. `breakdown_courier_adm_vessel` = `courier_adm_fee` / Jumlah Vessel
3. `breakdown_duty_vessel` = `total_duty_tax` / Jumlah Vessel
4. `breakdown_freight_vessel` = `total_freight` / Jumlah Vessel
5. `breakdown_bm_vessel` = `bm` / Jumlah Vessel
6. `breakdown_ppnpph_vessel` = (`ppn` + `pph`) / Jumlah Vessel

**BELUM DIJALANKAN ke Supabase production**:
```sql
alter table public.rekapan_courier add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
```

**3 jalur wajib** (sama pola persis dgn Audit Courier, jangan diulang detail di sini):
1. `EditModal` — `useEffect` GANTI TOTAL breakdown-calc lama yg SUDAH ADA sebelumnya di kode
   (breakdown_* sudah auto-calc dari awal, TAPI dulu selalu overwrite tanpa override-awareness
   & split vessel pakai `.split('+').filter(Boolean)` bukan formula char-count resmi -- kini
   `courierRekapanVesselCount()` konsisten). `total_amount` BARU (dulu tidak ada sama sekali).
2. **3 titik live-compute** (BUKAN 2 spt disebut di bagian Audit Courier -- Rekapan punya 1
   titik ekstra): `fetchRecords`'s `enrichedData` (~baris 3593, GANTI TOTAL blok breakdown lama
   yg sama masalahnya kayak di EditModal), DAN `getExportData`'s return-map (~baris 3906, sama).
   Cabang `courier_audit` di 2 tempat yg sama SEKARANG cuma comment "sudah dihitung duluan lewat
   `data.forEach`" -- **bug ditemukan & diperbaiki**: sebelum fix ini, blok lama di sini
   (formula `cek_selisih` versi lama, cuma jalan utk CN, tanpa sadar override) jalan SETELAH
   `data.forEach` yg sudah benar, jadi DIAM2 MENIMPA BALIK hasil yg sudah benar dgn nilai basi
   tiap kali halaman di-fetch/export -- root cause ini ditemukan pas nambah fitur Rekapan
   Courier, bukan dari laporan user terpisah.
3. `handleInlineSaveRow` cabang `courier_rekapan` — pola sama persis dgn `courier_audit`.

## Bug fix: "Add Data" Audit Courier bisa kirim payload ke tabel yg salah (`EditModal`, `SharedDataTable.tsx`)

Laporan user: tambah data jalur CN error `Could not find the 'no_pib' column of
'tabel_audit_cn' in the schema cache`. **Root cause**: form "Add Data" dirender pakai `cols` =
`activeCols` yg ditentukan dari TAB YANG SEDANG AKTIF (PIB_COLS/CN_COLS/Draft), TAPI field
"Document Type" (`jenis_dokumen`) di form itu cuma `<input>` teks bebas (tidak ada validasi
dropdown) — user bisa ketik "CN" manual walau field2 yg tampil masih dari `PIB_COLS` (mis.
`no_pib`), atau sebaliknya. `handleSave` (isCreate) resolve tabel tujuan dari `jenis_dokumen`
yg DIKETIK itu, TAPI payload tetap membawa semua key dari `cols` asal (termasuk `no_pib` yg
TIDAK ADA di `tabel_audit_cn` sama sekali) → Supabase menolak insert.
**Fix**: sebelum insert, payload di-strip ke HANYA key yg ada di `(jenisDokumen === 'CN' ?
CN_COLS : PIB_COLS).map(c => c.key)` — generik utk mismatch arah manapun (CN→PIB atau
sebaliknya). Path EDIT (bukan create) TIDAK kena bug ini — target tabel di situ diresolve dari
`record.jenis_dokumen` (data asli row, bukan ketikan user), jadi payload/cols dari awal sudah
konsisten dgn tabel record itu berada.

**Susulan (2026-09, permintaan user)**: field "Document Type" (`jenis_dokumen`) di `EditModal`
DIGANTI dari `<input>` teks bebas jadi `<select>` cuma 2 opsi `PIB`/`CN` (guard `c.key ===
'jenis_dokumen' && tab.id === 'courier_audit'`, dicek SEBELUM cabang `status` di renderer field
generik). **Disabled saat mode Edit** (`disabled={!isCreate}`) — mengubah field ini di baris yg
sudah ada TIDAK memindahkan row ke tabel lain (target tabel Edit tetap diresolve dari
`record.jenis_dokumen` asli), jadi disable-nya mencegah user mengira bisa "pindah jalur" lewat
situ. Dropdown ini MENGURANGI risiko typo/nilai selain PIB/CN, TAPI TIDAK menggantikan fix
stripping payload di atas — field2 yg TAMPIL di form tetap ikut tab yg SEDANG AKTIF (bukan ikut
value dropdown ini secara real-time), jadi kombinasi keduanya (dropdown genggam nilai valid +
stripping payload jaga-jaga mismatch) tetap dipertahankan.

## Add Data manual Audit Courier — kolom Status terkunci ARCHIVED (`SharedDataTable.tsx`)

Permintaan user: field **Status** di form "Add Data" Audit Courier BUKAN lagi dropdown pilihan
(dulu `LENGKAP`/`PROSES`/`PENDING`/`REVISI`) — sekarang SELALU `ARCHIVED` otomatis, tidak ada
opsi lain utk dipilih user. Guard renderer field: `c.key === 'status' && tab.id === 'courier_audit'
&& isCreate` (dicek SEBELUM cabang `status` generik lain — cabang lama tetap dipakai Edit
record biasa & tab lain). Tampil `<input disabled>` teks "Archived" (via `getStatusLabel`), nilai
aktual dikirim lewat `createDefaults={{status:'ARCHIVED'}}` (`EditModal` prop, bukan dari
`form.status` krn input disabled tidak update state). `createDefaults` ini berlaku utk SEMUA
`courierAuditType` (PIB/CN/Draft), bukan cuma tab Draft seperti sebelumnya.

**Bug ditemukan & diperbaiki — status masih ke-insert `LENGKAP` (default DB) padahal
`createDefaults` sudah `ARCHIVED`**: kolom asli `status` (dipakai filter `.eq('status',
'ARCHIVED')` archive) SENGAJA TIDAK ADA di `PIB_COLS`/`CN_COLS` (yg ada cuma
`status_kelengkapan`, field beda) — logic anti-mismatch-tabel `allowedKeysCreate` (strip key
payload yg bukan bagian `cols` tabel tujuan, lihat bug "Add Data kirim ke tabel salah" di bawah)
ikut MEMBUANG `status` dari payload sebelum insert krn dianggap key asing, `createDefaults` jadi
percuma. Fix: `allowedKeysCreate` di-union manual dgn `'status'`.

**Konsekuensi berdampak (sesuai desain existing, bukan bug baru)**: query Audit Courier normal
`.neq('status','ARCHIVED')` (lihat bagian arsitektur Courier di atas) — data manual baru TIDAK
tampil di tab PIB/CN Audit biasa, hanya kelihatan lewat tab **Draft**. Ini konsisten dgn
mekanisme ARCHIVED yg sudah ada (bukan hal baru dari perubahan ini), hanya sekarang jadi
satu-satunya jalur utk data manual.

## Edit Massal — Audit Courier & Rekapan Courier (`SharedDataTable.tsx`)

Arsitektur `pendingEdits`/`getVal`/`setVal` direplika dari FAR Overseas List Memo, TAPI toggle
mode **GLOBAL** (`courierAuditEditMode`/`courierRekapanEditMode: boolean`, bukan per-baris seperti
FAR Overseas — versi awal per-baris DITOLAK user, "mau klik satu tombol edit"). Toggle di
toolbar → SEMUA baris tampil masuk mode input sekaligus. Disimpan via "Save All" (commit semua
`pendingEdits` via `handleInlineSaveRow` paralel) atau "Cancel" (buang semua).

**Tombol Edit per-baris DIKEMBALIKAN** (susulan, user masih butuh edit 1 baris saja) — state
LOKAL `rowEditOn` di dalam row-group (bukan diangkat ke parent). `editingThisRow = (!!editMode
|| rowEditOn) && canBulkEdit`. Tombol Edit TIDAK menutup panel Action (beda dari aksi lain) —
supaya tombol Save langsung kelihatan.

**Tombol Save per-baris** (`handleSaveOneCourierAuditRow`/`Rekapan`) — commit HANYA
`pendingEdits[id]` itu (bukan semua), pakai `handleInlineSaveRow` yg sama. Muncul HANYA kalau
`rowEditOn` true (bukan mode global — Save All tetap jalur commit utk mode global).

**Bar "Save All" kondisi tampil** — DITAMBAH syarat `courierAuditEditMode`/`courierRekapanEditMode`
(bukan cuma "ada pending edit apa pun") — fix bug bar muncul saat cuma edit per-baris manual.

**ROOT CAUSE Save All gagal diam-diam (2 bug ditemukan & diperbaiki)**:
1. `Object.keys(pendingEdits).map(Number)...` bisa crash (`NaN` index) kalau key tidak numerik
   kanonik — fix: `Object.entries(pendingEdits).filter(([,edits])=>edits &&
   Object.keys(edits).length>0).map(([id])=>Number(id))`.
2. **Tipe id bigint-vs-int4**: kolom `id` bigint dikembalikan Supabase-js sbg STRING (bukan JS
   number, cegah presisi hilang). `courierAuditChangedRowIds` dulu paksa `Number(id)` — kalau
   `id` asli string, `records.find(r=>r.id===id)` (strict equality, tipe beda) SELALU gagal
   diam-diam (early return sebelum try/catch, TIDAK ada console.error). **FIX (2 sisi wajib
   bareng)**: (a) `pendingEdits` tipe `Record<string,...>`, `changedRowIds` TIDAK di-`Number()`
   lagi; (b) `handleInlineSaveRow` — SEMUA pencarian record via id (4 titik) pakai
   `String(r.id) === String(id)`, bukan `r.id === id` polos. **Cabang baru yg cari record via
   id WAJIB pakai pola String() ini.**
3. `handleInlineSaveRow` sekarang SELALU `console.error` di catch (dulu silent=true bikin error
   hilang total tanpa jejak) + `fetchRecords()` dipanggil setelah commit sukses (bukan cuma
   patch optimis state lokal — jaga2 RLS diam2 gagal 0 row tanpa error).

**RESIKO PRE-EXISTING, bukan bug baru dari fitur ini**: tab Draft gabung PIB+CN dari 2 tabel
BEDA sequence id (potensi collision id sama). `pendingEdits`/`handleInlineSaveRow` key by `rec.id`
mentah (tanpa prefix pib_/cn_) — kalau collision, edit bisa nyasar ke baris lain jenis dokumen
beda. BELUM diperbaiki (butuh redesain key composite, di luar cakupan edit massal ini).

## Konfigurasi Webhook Otomasi jadi halaman sendiri (`src/pages/WebhookSettingsPage.tsx`)

Panel "Konfigurasi Webhook Otomasi" (Courier/Sea & Air/Direct Loading/Bunker) yang dulu inline
di `SettingsPage.tsx` DIPINDAH jadi halaman sendiri `/settings/webhooks`, diakses lewat kartu
`ModuleCard` di hub `/settings` (pola sama dgn kartu "Rate Tables & PPJK"). Logic (state
`webhookUrl` dkk, `handleSave`/`handleTest`, key localStorage `n8n_webhook_url`/
`n8n_seaair_webhook_url`/`n8n_far_overseas_air_webhook_url`/`n8n_bunker_webhook_url`) TIDAK
berubah, murni dipindah lokasi — `SettingsPage.tsx` sekarang murni presentational (cuma
`canSee()` dari `useAuth()`, tanpa state). Page_key baru `settings_webhooks` didaftarkan di
`PAGE_REGISTRY` — **TIDAK ada konsep edit terpisah** (halaman ini tidak menulis ke Supabase,
cuma localStorage, sama seperti `courier_upload`/`sea_air_upload`).
**Konsekuensi RBAC**: page_key ini BARU & BELUM di-assign ke role mana pun di
`role_page_access` — HANYA Admin yang otomatis bisa akses sampai PIC assign page_key
`settings_webhooks` ke role yang relevan di Kelola Role & Akses (beda dari perilaku LAMA yang
semua user login bisa akses tanpa batasan role sama sekali) — WAJAR/disengaja, bukan bug kalau
ada laporan "user non-admin tidak lihat kartu Webhook lagi".

## Rate Tables & PPJK — dukungan UPS (`src/pages/admin/`)

Keputusan dikonfirmasi user: Category UPS = tambah opsi baru (`SURCHARGE`, `SERVICE`) ke dropdown
Category existing (13 opsi total), BUKAN petakan ke kategori lama. `SurchargeUPS.tsx` TERPISAH
**TIDAK dibuat** — `PPJKCostRule.tsx` yg diperluas sudah cukup.

**`PPJKCostRule.tsx`**: Courier dropdown +`UPS`. Price Mechanism +6 opsi baru
(`FLAT_PER_PACKAGE`, `FLAT_PER_PALLET`, `PER_PACKAGE_MAX_SHIPMENT`,
`GREATER_OF_SHIPMENT_OR_KG`, `PER_TIER_VALUE`, `PER_KG_PER_DAY`). 2 field baru:
`max_shipment_idr`, `tier_value_idr`. `getNilaiText()` +6 cabang baru — **kalau nambah mechanism
baru lagi, WAJIB tambah cabang di sini juga** (kalau lupa, badge "Nilai" tampil "-" walau data
lengkap). **BELUM DIVERIFIKASI ke production**: CHECK constraint enum `courier`/
`price_mechanism`/`category` mungkin perlu update juga; kolom baru WAJIB provision:
```sql
alter table public.tabel_ppjk_cost_rule add column if not exists max_shipment_idr numeric;
alter table public.tabel_ppjk_cost_rule add column if not exists tier_value_idr numeric;
```

**`RateSheetUPS.tsx`** (BARU, tabel `tabel_rate_sheet_ups`) — duplikasi struktur `RateSheetDHL.tsx`
(bukan generik, konsisten pola duplikasi Rate Sheet). Beda field: `service` (4 pilihan UPS
WORLDWIDE...), `package_type` (+`PALLET`), `rate_type` (+`MINIMUM_RATE`, tanpa field berat sama
sekali), `zone` (string `'Zone 1'`..`'Zone 10'`, BEDA schema dari DHL/number & FedEx/single-letter).
Field berat 4-kolom: `weight_exact_kg` (FIXED), `weight_from_kg`/`weight_to_kg` (MULTIPLIER),
`weight_label` (teks bebas opsional). Didaftarkan di `RateTablesAdmin.tsx` tab `ups_rate`.

**BELUM DIJALANKAN — tabel `tabel_rate_sheet_ups` BELUM ADA SAMA SEKALI** (tabel baru, bukan
cuma kolom), harus dibuat manual (skema/RLS ikut pola `tabel_rate_sheet_dhl`/`fedex` +
`has_page_access`/`has_edit_access('admin_rates')`).

**Belum diimplementasikan (SENGAJA TERPISAH, jangan campur ke task UPS)**: kemungkinan mismatch
`min_idr`/`max_idr` frontend vs nama kolom DB asli `minimum_idr`/`maximum_idr` di
`PPJKCostRule.tsx` — pre-existing (bukan spesifik UPS), user minta diverifikasi/diperbaiki
TERPISAH kalau diminta eksplisit nanti.

## Cost Validation Courier — panel "Hitung Ulang Estimasi Bonded Storage" (`CostValidationModal.tsx`)

Field2 di panel ini bagi dua: **Storage Actual/Storage Weight** langsung dari kolom tabel
`tabel_cost_validasi` (`cv_storage_actual`, `cv_storage_weight_kg` fallback `cv_chargeable_kg`,
BUKAN RPC); **Billing Days/Expected Storage** dari RPC `fn_hitung_storage` (live-preview, tiap
ETA/Release Date berubah) lalu dipersist via `fn_save_storage_estimate` (trigger
`fn_recompute_totals` di sisi Supabase) saat klik "Simpan Estimasi Baru".

**`getActualDays()` — Actual Days DIHITUNG DI FRONTEND (JS), BUKAN RPC/Supabase** — cuma
`Math.ceil((releaseDate - etaDate) / 1hari)`, lalu dikirim sbg parameter `p_actual_days` ke 2 RPC
di atas (Supabase cuma terima angka jadi, tidak hitung ulang dari tanggal mentah). **+1 (2026-09,
permintaan user)** — ETA & Release Date dihitung PENUH dua-duanya (bukan cuma selisih murni):
ETA 1 Sep -> Release 3 Sep dulu = 2 hari, sekarang = 3 hari. Guard `Math.max(0, ...)` tetap ada
(kalau Release < ETA, tidak boleh negatif). Sebelum perubahan ini formula TIDAK PERNAH diubah
sejak fungsi ini pertama dibuat (dicek via `git log -p`).

**Storage Weight bisa diedit manual** (2026-09, permintaan user) — dulu murni display read-only
dari `data.cv_storage_weight_kg` (fallback `cv_chargeable_kg`), sekarang jadi `<input>` (state
`storageWeightManual`, prefill dari data tiap `data` berubah via `useEffect([data])`).
`checkExpected()` (RPC `fn_hitung_storage`) prioritaskan `storageWeightManual` di atas nilai data
asli. Disimpan bareng ETA/Release Date lewat `.update()` langsung ke `tabel_cost_validasi`
(`cv_storage_weight_kg`, BUKAN via RPC `fn_save_storage_estimate` — RPC itu tidak punya param
weight sama sekali) saat klik "Simpan Estimasi Baru" — jadi tetap butuh ETA & Release Date diisi
juga (tombol Simpan gated syarat yg sama spt sebelumnya, TIDAK ada jalur simpan weight sendirian
tanpa 2 tanggal itu).

**ETA/Release Date prefill dari estimasi tersimpan sebelumnya** (2026-09, permintaan user) —
dulu SENGAJA selalu kosong tiap buka panel (klik tombol edit di `editStorageManual`), sekarang
`useEffect([data])` isi `etaDate`/`releaseDate` dari `data.cv_eta_date`/`cv_release_date` kalau
sudah pernah disimpan. Actual Days & Billing Days TIDAK disimpan sbg kolom terpisah yg dibaca
balik — begitu 2 tanggal ini prefill, `useEffect` `checkExpected()` (RPC `fn_hitung_storage`)
otomatis jalan ulang & isi keduanya live, sama seperti alur input baru.

## Modul REPORTING (Dashboard + Cost per Vessel) — BARU (2026-09)

Menu baru "Reporting" (2 submenu: Dashboard, Cost per Vessel) — biaya per vessel digabung dari 3
sumber (Courier Invoice Recap, Sea & Air Invoice Recap, FAR Overseas/Borongan), dicocokkan ke
`master_vessel`. **Status: schema + ETL + 2 halaman Reporting + 1 halaman admin
`MasterVesselAdminPage.tsx` SUDAH ADA**, recompute SUDAH DITES BERHASIL (2026-09, setelah 2 bug
ditemukan & diperbaiki — lihat catatan bug di bawah), TAPI belum pernah dites end-to-end dgn
data production 1 tahun penuh (belum ada tools DB langsung dari sesi Claude Code manapun — lihat
catatan umum di paling bawah CLAUDE.md) — kalau ada laporan "angka salah/kosong", cek dulu
asumsi2 mapping kolom sumber di bawah sebelum curiga bug logic.

- `src/lib/permissions.ts` — page_key `reporting_dashboard` (`/reporting/dashboard`) &
  `reporting_cost_per_vessel` (`/reporting/cost-per-vessel`), group `'Reporting'` baru.
- `src/components/MainLayout.tsx` — menu sidebar "Reporting" (icon `BarChart3`), `basePath`
  `/reporting` REAL (bukan dummy spt "Compare Doc" — 2 subtab-nya beneran berbagi prefix ini).
- `src/App.tsx` — 2 route baru, pola sama persis modul lain (`RequirePageAccess` per page_key).

- **`master_vessel`** (`sql/003_reporting_master_vessel.sql`, BELUM DIJALANKAN ke Supabase
  production — WAJIB dijalankan manual dulu): `vessel_id` (bigint identity, PK — SENGAJA bukan
  nama, sesuai permintaan user), `vessel_name` (unique), `alias_name` (text[], nullable),
  `base`, `fleet_group`, `category` (`VESSEL`/`OTHERS`), `status` (`AKTIF`/`SCRAP`).
  **`vessel_type` SENGAJA TIDAK ADA** (keputusan eksplisit user 2026-09: "buang saja", cuma
  pakai `fleet_group` utk pengelompokan DAN chart — domain awal yg disebutkan user
  TANKER/TUGBOAT/CEMENT CARRIER/OTHERS/TBA lebih sempit dari `fleet_group` asli yg py juga
  BULK CARRIER/TOWING BARGE/OIL BARGE, jadi `fleet_group` dipakai apa adanya, JANGAN
  reintroduce `vessel_type` tanpa app diminta ulang).
- **Sumber data**: `MASTER VESSEL.xlsx` (root project, dikirim user) — HANYA 3 kolom terisi
  (`UNDER`=base, `UNDER2`=fleet_group, `VESSEL NAME`=vessel_name; kolom COURIER/DUTY/FREIGHT/
  BM/PPN+PPH di header row-nya KOSONG semua, sekadar template, bukan data). 254 baris unik,
  di-extract via Node `xlsx` package (sudah ada di `package.json`) jadi INSERT statement
  langsung di file SQL di atas — **`alias_name` SEMUA NULL** (file sumber tidak py data alias
  sama sekali, walau kolomnya disiapkan di skema utk diisi manual belakangan).
  **Derivasi kolom yg tidak ada di file sumber** (dikonfirmasi user):
  - `category`: `fleet_group === 'OTHERS'` → `'OTHERS'`, selain itu (termasuk `fleet_group`
    `'TBA'`, mis. "MT. PERTAMINA GALUNGGUNG" yg armadanya belum ditentukan — TETAP kapal
    sungguhan) → `'VESSEL'`.
  - `status`: suffix `"(SCRAP)"`/`"(Scrap)"` di nama → `'SCRAP'` (suffix dibuang dari
    `vessel_name` yg disimpan, cuma 3 baris: MT. DEEP BLUE, MT. MARTHA OPTION, MT. MEDELIN
    MASTER), sisanya → `'AKTIF'`.
- **RLS**: SELECT via `has_page_access('reporting_dashboard')` ATAU
  `has_page_access('reporting_cost_per_vessel')` — **2 page_key ini BELUM didaftarkan** di
  `PAGE_REGISTRY` (`src/lib/permissions.ts`) krn halaman React-nya belum dibuat; WAJIB
  didaftarkan bareng saat halaman dibuat, kalau tidak RLS block semua (has_page_access selalu
  false utk page_key yg tidak terdaftar). Edit (INSERT/UPDATE/DELETE) SEMENTARA `is_admin()`
  polos (bukan `has_edit_access` ke page_key spesifik) krn belum ada halaman admin utk kelola
  master vessel di scope ini.
### Tabel alokasi biaya (`reporting_cost_allocation`, `sql/004_reporting_cost_allocation.sql`)

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu, SETELAH
`sql/003_reporting_master_vessel.sql`.** Snapshot hasil pembagian biaya per vessel per bulan,
DISIMPAN (bukan live-compute di layar, sesuai Aturan Umum #2 brief user — bisa ditelusuri audit).
Kolom generik menampung union semua method (field yg tidak relevan dibiarkan 0):
`method` (`COURIER`/`SEA`/`AIR`/`BORONGAN`), `period_month` (tanggal awal bulan),
`vessel_id`/`vessel_name_raw`, `source_table`/`source_row_id` (jejak baris asal, utk audit),
`courier_adm`/`duty`/`freight`/`handling_total`/`bm`/`ppn_pph`/`borongan_total`, `needs_review`
(vessel tidak cocok master). Unique constraint `(method, source_table, source_row_id,
vessel_name_raw)` — recompute per bulan = delete semua baris `period_month` itu dulu, insert
ulang (idempotent). RLS: SELECT via `has_page_access` salah satu dari 2 page_key Reporting,
INSERT/UPDATE/DELETE via `has_edit_access('reporting_cost_per_vessel')`.

### ETL / alokasi (`src/utils/ReportingHelpers.ts`) — SATU-SATUNYA sumber kebenaran formula

`recomputeReportingMonth(monthDate)` — dipanggil dari tombol "Recompute" di Cost per Vessel,
proses 1 bulan sekaligus (Tahunan = loop 12x). 3 fungsi builder per sumber, jalan paralel:

- **`buildCourierRows`** — dari `rekapan_courier`, filter `tgl_terima_email` di bulan itu. Pisah
  kolom `vessel` dgn `+` (`splitVesselList()`), **NILAI BREAKDOWN (`breakdown_courier_adm_vessel`
  dst, lihat "Rekapan Courier — Auto-Calculate" di atas) DIPAKAI APA ADANYA, TIDAK dibagi lagi**
  (permintaan eksplisit user) — tiap nama vessel di baris itu dapat nilai breakdown yg SAMA.
- **`buildSeaAirRows`** — dari `rekapan_seaair`, filter `tgl`. `shipment_type` LCL/FCL -> method
  `SEA`, `AIR` -> method `AIR` (shipment_type lain diabaikan, di luar cakupan 2 method ini).
  **Bug ditemukan & diperbaiki saat testing (`column rekapan_seaair.vessel does not exist`)**:
  tabel ini TIDAK PUNYA kolom `vessel` mentah di top-level sama sekali (beda dari
  `rekapan_courier`/`rekapan_far_overseas_air`) — daftar vessel-nya HANYA ada di dalam kolom
  jsonb `po_detail` (array `{po_no, vessel}`, lihat "Export Excel Rekapan Courier"/
  `SeaAirRekapanRowGroup` di atas: Sea & Air Rekapan TETAP split PO↔Vessel via `po_detail`, beda
  dari Courier yg sudah berhenti split). Fix: `extractSeaAirVesselNames(poDetail)` parse
  `po_detail` (array atau string JSON), ambil `vessel` tiap entry (di-`splitVesselList()` lagi
  jaga2 kalau 1 entry sendiri sudah gabungan `+`). Pakai kolom RAW (`duty_total`, `bm`, `ppn`,
  `pph`, `emkl_biaya`/`biaya_origin`/`biaya_destination`/`pbm_biaya`/`lift_off_biaya`/
  `inspeksi_biaya`/`handling_biaya`/`other_biaya` dijumlah jadi `handling_total`) — **BUKAN**
  kolom `*_split` yg juga ada di tabel ini (`duty_split`/`bm_split`/dst, itu hasil split PO↔Vessel
  fitur LAIN, sengaja tidak dipakai di sini krn user eksplisit minta formula dari kolom RAW
  dibagi jumlah vessel, bukan pakai nilai yg sudah pernah di-split sebelumnya). Dibagi rata
  `/ jumlah vessel` (hasil `extractSeaAirVesselNames`), sesuai permintaan user.
- **`buildBoronganRows`** — dari `rekapan_far_overseas_air`, filter `invoice_date` ("sementara,
  karena belum ada tgl terima", sesuai brief user — GANTI ke kolom lain kalau field tgl terima
  yg sebenarnya sudah ada/diminta). Vessel dari `vessel_internal_note` (bukan `po_list` — field
  itu utk pairing PO presisi, di luar cakupan; **ASUMSI**: `vessel_internal_note` pakai pemisah
  `+` sama seperti sumber lain, BELUM diverifikasi ke data production sungguhan). Total dari
  `total_amount_idr` (fallback `total_amount` kalau kosong, asumsi sudah IDR) dibagi rata jumlah
  vessel. **TIDAK difilter `approval_status`** (semua memo ikut, apapun status approval-nya) —
  kalau maunya cuma yg sudah APPROVED, WAJIB diubah eksplisit kalau diminta.
  **Konfirmasi user (2026-09)**: `vessel_internal_note` memang pakai pemisah `+` sama seperti
  sumber lain — asumsi ini TERBUKTI BENAR, tidak perlu diragukan lagi.
- **`matchVessel(rawName, masterList)`** — cocokkan case/whitespace-insensitive ke
  `vessel_name` ATAU salah satu `alias_name`. Tidak ketemu -> `vessel_id=null`,
  `needs_review=true`, baris TETAP disimpan (Aturan Umum #3 — tidak boleh hilang diam2).
- Formula total (`totalCost`/`totalExclPpn`/`metricForMethod`/`zeroSums`/`addSums`,
  `MetricKey`/`ALL_METRIC_KEYS`) — **SATU-SATUNYA tempat rumus total biaya**, di-import KEDUA
  halaman (Cost per Vessel & Dashboard) supaya angkanya tidak pernah beda (Aturan Umum #1).
  `metricForMethod`: ALL=jumlah semua kolom; COURIER=adm+duty+freight+bm+ppn_pph;
  SEA/AIR=duty+handling_total+bm+ppn_pph; BORONGAN=borongan_total.

### `ReportingCostPerVesselPage.tsx`

Tabel pivot 4 tab, label tombol singkat (2026-09, permintaan user) — **All**/Courier/**Sea &
Air**/**FAR Ovs** (value internal `TabId` TETAP `'ALL'|'COURIER'|'SEA_AIR'|'BORONGAN'`, cuma
label tombol yg dipendekkan — "FAR Ovs" label utk method `BORONGAN`, JANGAN bingung dgn modul
"FAR Overseas"/`direct_loading` yg beda sama sekali, cuma kebetulan sama istilah singkatnya
krn sumber data Borongan emang dari situ). SEA & AIR SUDAH DIGABUNG 1 tab (lihat catatan "Tab
Sea & Air digabung" di bawah), filter Monthly/Yearly + tahun/bulan. **Dashboard TIDAK ikut
disingkat** (`METHOD_LABEL` di `ReportingDashboardPage.tsx` tetap "Chartered", bukan "FAR Ovs" —
permintaan user SPESIFIK cuma label tab Cost per Vessel).
Baris = SEMUA `master_vessel` (termasuk yg biayanya 0 bulan itu — vessel jadi sumber baris,
bukan cuma yg py transaksi) + grup tambahan "PERLU DIPERIKSA" (vessel_name dari sumber yg tidak
match master, SELALU tampil paling bawah). Base/Fleet Group tidak diulang (blank kalau sama dgn
baris sebelumnya, dicek via komponen sebelumnya di array `displayRows` yg sudah tersorted), ada
baris Subtotal per fleet_group (bg `#EEEAF3`) & Grand Total (bg `#5A305A` solid) di paling bawah.
Tahunan = 12 kolom bulan, 1 angka total per bulan (`metricForMethod`) — sesuai instruksi user
"supaya tabel tidak terlalu lebar", diterapkan ke SEMUA 5 tab termasuk All Method (bukan cuma
tab per-method) krn brief tidak eksplisit kecualikan All Method & lebih konsisten.
Tombol **Recompute** (gated `canEdit('reporting_cost_per_vessel')`) panggil
`recomputeReportingMonth` (Tahunan = loop 12 bulan sekuensial, TIDAK paralel — hindari flood
request). Tombol **Export** — Excel via `exceljs` (pola sama `ExportModal.tsx`), replika
struktur tabel on-screen (grup/subtotal/grand total ikut, subtotal & grand total row di-bold).
Baca filter awal dari query string (`?mode=&year=&month=&tab=`) via `useSearchParams` — dipakai
Dashboard utk "chart bisa diklik buka Cost per Vessel terfilter".
**Tombol "Customize View"** — pilih kolom biaya tampil/sembunyi PER TAB (`CustomizeViewModal`
lokal di file ini, TIDAK reuse punya `SharedDataTable.tsx` yg tidak di-export), HANYA muncul di
mode Bulanan (Tahunan selalu 12 kolom bulan tetap, tidak relevan utk dikustomisasi). Disimpan
localStorage key `beehive_customize_view:${user.id}:reporting_cost_per_vessel:${tab}` (pola sama
modul Courier). Export Excel IKUT Customize View (kolom yg disembunyikan di layar juga tidak ikut
ke file Excel).

### `ReportingDashboardPage.tsx` — layout FINAL (v3, 2026-09, beberapa revisi susulan user)

**Urutan baris (dari atas ke bawah) — JANGAN diubah tanpa diminta ulang**:
1. **3 kartu ringkasan**: Total Cost (+ % vs periode sebelumnya) | **Highest Vessel Cost**
   (nama + nominal vessel biaya TERTINGGI periode terpilih, `topVessels[0]` — array YG SAMA
   dipakai section 3 di bawah, JANGAN hitung ulang terpisah) | Previous Period.
   **GANTI TOTAL dari kartu "Jumlah Vessel Aktif Biaya"** (versi v1/v2 nampilin COUNT DISTINCT
   vessel — DIHAPUS, bukan lagi bagian dashboard ini sama sekali, permintaan user eksplisit).
2. **Cost per Method** — 4 kartu terpisah (Courier/Sea/Air/Chartered, bukan digabung).
3. **Vessels with Highest Cost** — bar horizontal, MELEBAR PENUH baris sendiri (v1/v2 dulu
   setengah lebar bersebelahan "Cost by Category" — DIPINDAH krn user minta chart ini
   ditonjolkan/dilebarkan).
4. **Cost by Category** (kiri) + **Cost per Fleet Group** (kanan), setengah lebar masing2 —
   "Cost by Category" GANTI NAMA dari "Cost per Cost Type" (v2). Posisi "Cost per Fleet Group"
   TERTUKAR dgn section 3 (dulu di sini melebar penuh, sekarang di sini setengah lebar).
5. **Monthly Trend** — SELALU 12 bulan penuh (terlepas filter Bulanan/Tahunan yg aktif di kartu
   lain), tetap chart vertikal.

**`HorizontalBarChart` DAN `VerticalBarChart` — HTML, BUKAN SVG SAMA SEKALI** (2026-09, KEDUANYA
sempat lewat versi SVG lalu di-drop total, JANGAN reintroduce SVG utk chart bar manapun di
halaman ini):
- `HorizontalBarChart`: v1 `<div>` width% -> v2 SVG manual dgn label dipotong paksa
  `.slice(0,19)+'…'` kalau >20 karakter (laporan user "nama vessel kepotong titik-titik", SVG
  `<text>` tidak bisa wrap multi-baris tanpa hitung lebar per-karakter manual) -> v3 FINAL balik
  ke HTML (`<div>` flex row: label `w-48 break-words` + bar `flex-1` + nilai `w-44` kanan) —
  label SELALU tampil PENUH, membungkus (wrap) kalau kepanjangan, TIDAK PERNAH dipotong lagi.
- `VerticalBarChart` (Monthly Trend): v1 SVG viewBox tetap (`preserveAspectRatio="xMinYMin
  meet"`) -> sempat di-patch `preserveAspectRatio="none"` (fix laporan "bolong kanan", TERNYATA
  bikin masalah BARU: stretch non-uniform sumbu X jauh lebih besar drpd Y bikin sudut rect
  (`rx=4`)/garis gridline putus2 TERDISTORSI, laporan user "gepeng & pecah") -> v3 FINAL
  **DIHAPUS TOTAL SVG-nya**, ganti `<div>` flex (`flex-1` per bulan, tinggi bar % dari
  `max-height` container `h-52`, label bulan baris terpisah di bawah pakai `flex-1` yg sama biar
  align persis dgn bar-nya) — TIDAK ADA viewBox/scaling manual lagi sama sekali, jadi TIDAK
  MUNGKIN kena masalah stretch non-uniform apa pun.
Tooltip KEDUA chart via atribut HTML native `title` (pengganti `<title>` SVG yg dulu dipakai).

**Nominal SELALU format penuh** (2026-09, permintaan user eksplisit) — `fmtRpShort()`
(singkatan M/Jt, versi v1/v2) **DIHAPUS TOTAL** dari file ini, SEMUA tempat (kartu ringkasan,
Cost per Method, label+tooltip bar chart) sekarang pakai `fmtRp()` biasa (`Rp 2.412.885.640`,
BUKAN `Rp 2.4 M`). `ReportingCostPerVesselPage.tsx` TIDAK PERNAH punya versi singkat sama
sekali (sudah full number dari awal), jadi tidak ada yg perlu diubah di halaman itu.

Semua kartu/bar yg bisa diklik pakai `<Link>`/`onBarClick`+`useNavigate` ke Cost per Vessel dgn
query string filter (`filterQuery()`, lihat pola di atas).

### Ciutkan/lebarkan baris per Fleet Group (`ReportingCostPerVesselPage.tsx`, 2026-09)

State `collapsedGroups: Set<string>` (key `${base}::${fleetGroup}`, sama persis `groupKey` yg
sudah dihitung tiap baris `vessel`/`subtotal` di `displayRows`). Baris vessel dari grup yg
diciutkan DIFILTER dari render (`visibleDisplayRows = displayRows.filter(row => row.type !==
'vessel' || !collapsedGroups.has(row.groupKey))`) — baris **Subtotal TETAP SELALU tampil**
(berfungsi jg sbg "header" grup saat diciutkan, ada tombol chevron + label jumlah vessel
`(N vessel)`). Tombol toolbar "Ciutkan Semua"/"Lebarkan Semua" isi/kosongkan
`collapsedGroups` sekaligus dari `allGroupKeys` (dihitung dari `displayRows`, BUKAN
`visibleDisplayRows` -- supaya "Lebarkan Semua" tetap bisa buka grup yg sedang diciutkan).
State lokal saja (tidak disimpan localStorage/Supabase), reset tiap buka halaman. Export Excel
TIDAK ikut status ciutkan (`handleExport` tetap pakai `displayRows` penuh, bukan
`visibleDisplayRows`) — export selalu lengkap terlepas dari tampilan layar.

**3 baris per grup: HEADER (toggle, ATAS) + vessel + SUBTOTAL (angka, BAWAH)** — DESAIN FINAL
2026-09, 2 iterasi sebelumnya SALAH:
- v1: Subtotal (angka + toggle jadi 1 baris) di BAWAH -> laporan user "kenapa ciutkannya di
  bawah, harusnya di atas".
- v2 (SALAH PAHAM, SEMPAT DIKERJAKAN LALU DIREVERT): pindahkan baris Subtotal ITU SENDIRI
  (angka + toggle) ke ATAS -> user klarifikasi maksudnya BUKAN itu: **Subtotal (rekap angka)
  TETAP di bawah spt semula**, yg diminta naik ke atas CUMA TOGGLE-nya.
- v3 (FINAL): `type Disp` sekarang py **4 varian** (nambah `'header'`) -- per grup push urutan
  `{type:'header', base, fleetGroup, groupKey, count}` (TANPA angka, toggle ciutkan +
  nama grup DI SINI) dulu, baru semua baris `{type:'vessel', ...}`, baru
  `{type:'subtotal', ..., sums, monthly}` (angka rekap, TANPA toggle, TETAP paling bawah spt
  desain awal). `toggleGroup(groupKey)` SEKARANG di baris header, BUKAN subtotal.
  `visibleDisplayRows` filter TETAP HANYA sembunyikan `type==='vessel'` (header & subtotal
  SELALU tampil, header jadi "jangkar" grup saat ciutkan, subtotal tetap keliatan rekapnya).
  **3 tempat WAJIB tangani varian `'header'` baru ini** (kalau nambah renderer baru lain utk
  `displayRows`, WAJIB ikut juga): render tabel on-screen, `handleExport` (skip -- baris header
  tidak ikut ke Excel, Fleet Group sudah ada di baris Subtotal), `ExportPreviewModal` (return
  `null`, tidak dihitung di preview).
  Baris vessel TETAP tidak menampilkan Base/Fleet Group sendiri (kosong, `pl-6` indent) — sudah
  terwakili baris header DI ATAS & subtotal DI BAWAH.

**Ikon toggle diperhalus** — dulu tukar `ChevronRight`/`ChevronDown` (2 icon beda), SEKARANG 1
icon `ChevronDown` yg di-rotate `-90deg` (CSS `transition-transform`) saat ciutkan, dibungkus
lingkaran kecil border (`w-5 h-5 rounded-full border`) yg highlight saat hover — animasi mulus,
BUKAN icon lompat ganti. **Warna toggle `#73507B`** (permintaan user eksplisit — border
lingkaran, ikon chevron, DAN `border-l` aksen kiri baris header semua ikut warna ini; BEDA dari
`#5A305A` yg dipakai teks Base/label lain di baris yg sama, sengaja dibedakan biar toggle-nya
menonjol). **Dipaksa via inline `style={{color:'#73507B'}}`/`style={{border:'1.5px solid
#73507B'}}`** (BUKAN className Tailwind arbitrary-value `text-[#73507B]`/`border-[#73507B]/40`
spt percobaan pertama) — user laporan warnanya "belum berubah" walau kode sudah benar (kemungkinan
opacity modifier `/40`/`/50` bikin warnanya terlalu redup mirip `#5A305A` sekilas, atau delay
HMR) — inline style solid (tanpa opacity) memastikan warnanya PASTI beda & jelas kelihatan,
tidak bergantung Tailwind JIT arbitrary-value edge case.

**Lebar kolom tabel — `table-fixed` + `colgroup`** (2026-09, laporan user "jarak kolom terlalu
jauh") — sebelumnya `<table>` polos tanpa `colgroup` (auto-layout): kalau kolom cuma sedikit
(mis. tab All cuma 2 kolom angka), browser meregangkan kolom terakhir isi SISA lebar layar,
bikin jarak kosong lebar antara label & angkanya. Fix: `numericColCount` (jumlah kolom angka yg
lagi tampil -- `visibleMonthlyCols.length` utk Bulanan, SELALU `12` utk Tahunan) x `numColW`
(150px tetap per kolom) + 3 kolom awal tetap (Base 130px, Fleet Group 150px, Vessel 150px) =
`min-width` tabel, dibungkus `overflow-x-auto` (scroll horizontal muncul kalau kolom banyak,
BUKAN kolom meregang random). **Susulan**: kolom PALING KANAN sempat kelihatan mepet nempel tepi
kartu (laporan user) — semua `<th>`/`<td>` numerik (header + vessel + subtotal + grand total)
ditambah `last:pr-5` (Tailwind `last:` variant, cuma kena elemen TERAKHIR di tiap `<tr>`) supaya
ada nafas ekstra di kanan tanpa mengubah lebar `colgroup`/proporsi kolom lain. **Cuma diterapkan
ke tabel utama on-screen** -- `ExportPreviewModal` BELUM ikut colgroup/padding ini (preview
export, dampak lebih kecil, bisa ditambah kalau diminta).

**Baris pemisah Subtotal pakai warna `#FFF5C5`** (kuning, `hover:#F5E28F` +
`border-l-[3px] border-l-[#E6C25C]`) — GANTI dari `#EEEAF3` (ungu muda) versi v1, permintaan
user supaya konsisten dgn warna highlight kuning yg sudah dipakai modul lain (lihat "Highlight
baris Submit Date — Rekapan Courier" di atas, sumber warna yg sama).

### Toggle "Hide Scrapped" (`ReportingCostPerVesselPage.tsx`, label dipendekkan 2026-09 dari
"Hide Scrapped Vessels" — permintaan user)

Checkbox di toolbar filter, state lokal `hideScrap` (default `false`/tampil semua, TIDAK
disimpan — reset tiap buka halaman). Saat aktif: vessel `master_vessel.status==='SCRAP'`
DIKELUARKAN TOTAL dari seeding baris pivot (tidak nongol sbg baris 0), DAN baris
`reporting_cost_allocation` yg `vessel_id`-nya cocok ke vessel SCRAP itu DIBUANG dari agregasi
(bukan cuma disembunyikan visual) — supaya Subtotal/Grand Total ikut benar tidak menghitung
biaya vessel yg disembunyikan. Vessel SCRAP yg PUNYA biaya bulan itu (kapal baru discrap
tengah bulan mis.) sengaja TETAP ikut kebuang saat toggle aktif — kalau mau granular per-bulan
(tampilkan biaya SEBELUM discrap), belum diimplementasi.

### Export Excel — preview dulu sebelum file dibuat (2026-09, permintaan user)

`ExportPreviewModal` (`ReportingCostPerVesselPage.tsx`, komponen lokal) — pola sama `ExportModal.tsx`
(dipakai Audit Courier dkk): tombol "Export" toolbar sekarang cuma buka modal preview dulu
(`showExportPreview`), file Excel baru beneran dibuat (`handleExport`, logic-nya TIDAK berubah)
saat user klik "Export" DI DALAM modal. Preview replika PERSIS struktur tabel on-screen
(vessel/subtotal/grand total) dibatasi 15 baris pertama + pesan "showing first N rows...". Header
tabel preview **`#5A305A`** (permintaan user eksplisit — SENGAJA beda dari `ExportModal.tsx` yg
pakai abu-abu `bg-slate-100`, disamakan ke warna brand khusus di modal Reporting ini). Header
FILE EXCEL-nya sendiri (`headerRow.fill` di `handleExport`) SUDAH `FF5A305A` dari awal (tidak
berubah), jadi preview & file akhir sekarang konsisten warnanya. TIDAK ada langkah konfirmasi
password spt `ExportModal.tsx` (Cost per Vessel bukan data sensitif spt Audit Courier, tidak
diminta user) — kalau nanti diminta, tambahkan pola `ExportPasswordConfirmModal` yg sama.

### Panel "NEEDS REVIEW" — detail sumber vessel_name yg tidak cocok master (2026-09)

**`reporting_cost_allocation.source_label`** — kolom baru (`sql/005_reporting_source_label.sql`,
**BELUM DIJALANKAN ke Supabase production**, jalankan SETELAH `sql/004_...`), diisi identifier
manusiawi per baris sumber saat recompute: Courier -> `no_invoice` (fallback `awb`); Sea & Air ->
`no_invoice` (fallback `awb`); Borongan -> `no_invoice` (fallback `memo_title`). Kolom ini MURNI
utk ditampilkan (bukan dipakai matching/kalkulasi apa pun).

`METHOD_SOURCE_PAGE` (`ReportingHelpers.ts`, exported) — map `AllocationMethod` -> halaman &
label identifier tujuan (`{label, path, idLabel}`), mis. `COURIER` -> `{'Courier > Invoice
Recap', '/courier/rekapan', 'Invoice No. / AWB'}`. `SEA`/`AIR` sama-sama arah ke Sea & Air
Rekapan (konsisten dgn tab gabungan "Sea & Air" di Cost per Vessel).

**`ReviewDetailsModal`** (`ReportingCostPerVesselPage.tsx`) — dibuka via tombol "View Details" di
banner NEEDS REVIEW. Data dikumpulkan di useMemo yg sama dgn `displayRows` (`reviewMap`,
key=`vessel_name_raw`, value=array `{method, sourceLabel, periodMonth}` — 1 vessel_name bisa
muncul di banyak baris sumber/bulan berbeda, SEMUA ditampilkan bukan cuma yg pertama). Tiap
kemunculan tampil: link halaman tujuan (`<Link>` react-router, BUKAN deep-link ke baris spesifik
— app ini belum punya route per-record utk Courier/Sea&Air/FAR Overseas) + identifier
(`source_label`) + bulan periodenya, supaya user tinggal Ctrl+F/cari manual di halaman itu.
**BELUM ADA fitur alias langsung dari modal ini** (mis. tombol "Tambah sbg Alias" yg langsung
`.update()` `master_vessel.alias_name`) — user masih harus buka `/settings/master-vessel` manual
kalau mau menambahkan alias. Tambahkan kalau diminta eksplisit.

### Tab Sea & Air digabung, tombol Collapse/Expand digabung, translasi Inggris (2026-09)

**Tab SEA/AIR digabung jadi 1 tab "Sea & Air" LALU DIPISAH LAGI** (`ReportingCostPerVesselPage.tsx`)
— riwayat: awalnya 2 tab terpisah -> digabung 1 tab "Sea & Air" (permintaan user saat itu) ->
**DIPISAH BALIK jadi 2 tab lagi** (permintaan susulan user, "SEA_AIR" dianggap kurang
detail/kurang jelas dipisah per method). **KONDISI FINAL/SEKARANG**: `TabId` PERSIS sama dgn
`AllocationMethod | 'ALL'` (`'ALL'|'COURIER'|'SEA'|'AIR'|'BORONGAN'`), TIDAK ADA lagi id
gabungan `'SEA_AIR'` sama sekali — `rowsForTab` filter `r.method === activeTab` polos (generik,
sama pola tab lain), `metricForTab()` panggil `metricForMethod(sums, tab)` LANGSUNG tanpa
mapping/alias apa pun. **Kalau ada permintaan gabung lagi ke depan, JANGAN otomatis reuse nama
`'SEA_AIR'` dari riwayat ini** — cek dulu apakah user masih mau persis pola yg sama atau beda.

**Tombol Collapse All/Expand All digabung jadi 1** (dulu 2 tombol terpisah) — `allCollapsed =
allGroupKeys.length>0 && allGroupKeys.every(k=>collapsedGroups.has(k))`, label & ikon ganti
otomatis ("Collapse All" <-> "Expand All") mengikuti status semua grup saat ini.

**Translasi Inggris — `ReportingCostPerVesselPage.tsx` & `ReportingDashboardPage.tsx`** (2 halaman
Reporting utama, PERMINTAAN EKSPLISIT user 2026-09) — SEMUA teks UI (label, toast, placeholder,
tooltip title, empty-state) diterjemahkan ke Inggris. Beberapa keputusan istilah:
- **"Borongan" -> "Chartered"** (label tab & kartu Dashboard) — method `BORONGAN` di kolom DB
  `reporting_cost_allocation.method` TIDAK BERUBAH (cuma label tampilan), jangan translate value
  data manapun yg match string ini.
- **"PERLU DIPERIKSA" (pseudo base/fleet_group utk vessel tak cocok master) -> "NEEDS REVIEW"**
  (konstanta `NEEDS_REVIEW` di `ReportingCostPerVesselPage.tsx`, string literal langsung di
  `ReportingDashboardPage.tsx` — murni label tampilan, bukan value tersimpan ke DB manapun).
- **`MasterVesselAdminPage.tsx` SENGAJA TIDAK ikut** translasi ini (user minta "2 halaman" — tabel
  pivot + dashboard, bukan halaman admin master vessel) — masih Bahasa Indonesia, JANGAN
  disamakan otomatis tanpa diminta eksplisit.
- Komentar kode TETAP Bahasa Indonesia (bukan scope translasi UI, sama konvensi modul lain —
  lihat bagian "Translasi UI ke Bahasa Inggris" di atas).

### Warna toolbar per tombol (`ReportingCostPerVesselPage.tsx`, 2026-09)

Dulu SEMUA tombol toolbar (Collapse/Expand, Customize View, Export) putih/outline polos KECUALI
Recompute (oranye, sudah dari awal) — permintaan user dikasih warna tematik masing2 biar gampang
dibedakan sekilas: **Collapse/Expand All** = ungu `#73507B` (`bg-[#73507B]/10 text-[#73507B]
border-[#73507B]/30`, senada warna toggle chevron di baris header grup — sama-sama soal
struktur/tampilan tabel); **Recompute** = oranye `bg-orange-50 text-orange-700` (TIDAK diubah,
aksi hitung ulang data); **Customize View** = biru `bg-blue-50 text-blue-700` (pengaturan
tampilan); **Export** = hijau `bg-emerald-50 text-emerald-700` (konvensi umum aksi
unduh/keluarkan data). Tab pemilih method (All/Courier/Sea & Air/FAR Ovs) TIDAK ikut diwarnai
beda2 — TETAP pola toggle aktif `#5A305A` solid vs putih-outline, sengaja tidak disentuh.

### Bug ditemukan & diperbaiki — Recompute gagal `duplicate key value violates unique
constraint "reporting_cost_allocation_...key"` (2026-09, laporan user)

**Root cause**: 1 baris sumber (mis. 1 baris `rekapan_courier`, ATAU 1 baris `rekapan_seaair`
dgn 2 entry `po_detail` yg VESSEL-nya SAMA) bisa menghasilkan nama vessel yg SAMA muncul 2x
setelah di-split — kode lama push 1 baris terpisah per kemunculan nama, langsung tabrakan sama
unique constraint `(method, source_table, source_row_id, vessel_name_raw)` saat insert (SEMUA
insert dalam 1 chunk gagal krn constraint, `recomputeReportingMonth` sudah keburu `delete()`
duluan sebelum insert gagal → laporan susulan user "datanya jadi tidak ada yang muncul" cocok
dgn gejala ini: delete sukses, insert gagal, hasil akhir 0 baris).
**Fix**: `pushDedupedRows()` (`ReportingHelpers.ts`) — SEMUA 3 builder (`buildCourierRows`/
`buildSeaAirRows`/`buildBoronganRows`) sekarang WAJIB lewat fungsi ini, bukan push langsung ke
array `rows`. Nama vessel yg sama dalam 1 baris sumber di-GABUNG (SUM nilainya) jadi 1 entry
SEBELUM insert — ini bukan cuma workaround constraint, tapi SECARA MATEMATIS BENAR: vessel yg
muncul 2x di daftar memang seharusnya dapat 2 "jatah" (constraint di DB jadi guard yg benar,
bukan yg dilanggar). **Kalau nambah sumber method baru lagi ke modul Reporting, WAJIB pakai
`pushDedupedRows()` juga** — push manual ke array `rows` langsung berisiko re-introduce bug ini.

### `MasterVesselAdminPage.tsx` — halaman admin kelola `master_vessel` (2026-09)

Route `/settings/master-vessel`, admin-only (`RequirePageAccess adminOnly`, pola SAMA
`RoleManagementPage.tsx` — BUKAN lewat matrix page_key, konsisten dgn RLS write
`master_vessel_admin_write` yg `is_admin()` polos). Page_key `settings_master_vessel`
didaftarkan di `PAGE_REGISTRY` murni utk tampil di matrix Kelola Role & Akses (dokumentasi),
BUKAN sumber gating sebenarnya. Kartu akses di `/settings` digating `isAdmin` (sama pola kartu
"Kelola Role & Akses").

Cuma ~250an baris data (awal dari `MASTER VESSEL.xlsx`) — fetch semua sekaligus via
`fetchMasterVessels()` (`ReportingHelpers.ts`), filter/sort/search MURNI client-side (search
cocokkan `vessel_name` + `alias_name`), TIDAK perlu pagination server-side. CRUD langsung
`.insert()`/`.update()`/`.delete()` ke `master_vessel` (bukan RPC — RLS `is_admin()` sudah cukup
proteksinya, beda dari modul FAR Overseas yg WAJIB RPC krn ada whitelist kolom terpisah).
Form Edit: `alias_name` input teks dipisah koma -> `string[]` (kosong -> `null`, bukan array
kosong). Delete: baris `reporting_cost_allocation` yg pernah cocok ke vessel ini TIDAK ikut
terhapus (tidak ada FK cascade) — vessel_id jadi rujukan basi, aman krn `vessel_id` bigint
identity TIDAK PERNAH di-reuse Postgres.

**Tambah vessel baru otomatis nempel di BAWAH grup Base+Fleet Group yang sudah ada** (2026-09,
permintaan user: "vessel baru terlist di Fleet Group yang sama tapi di paling bawah, jangan
disisipkan di tengah, biar tau mana yang baru mana yang lama") — sebelumnya field Sort Order
dikosongkan = pakai DEFAULT KOLOM (nempel di paling akhir SELURUH tabel, bukan di grupnya, lihat
"Bug ditemukan" bagian Cost per Vessel di atas soal kenapa itu salah). Fix: `insertAfterGroup()`
(fungsi baru di `MasterVesselAdminPage.tsx`) — form Tambah Vessel deteksi LIVE saat mengetik
Base+Fleet Group: kalau cocok grup yang sudah ada (`matchedGroup`), Sort Order dikosongkan ->
otomatis dihitung `MAX(sort_order anggota grup itu) + 1`, tampil info hijau "akan ditambahkan di
paling bawah grup ... (setelah '...')" di form.

**KRITIS — kenapa TIDAK BISA cuma `MAX+1` polos tanpa geser baris lain**: `sort_order` hasil
migrasi awal RAPAT tanpa celah (1..N, lihat `sql/006_master_vessel_sort_order.sql`) — nilai
`MAX(grup)+1` HAMPIR PASTI sudah dipakai vessel LAIN (anggota grup berikutnya persis di file
asli) → kalau dibiarkan, vessel baru "tie" sama vessel grup lain, dan urutan tampil (ikut
`ORDER BY sort_order`) bisa nyasar gabung ke grup TETANGGA bukan grup yang dimaksud. Fix:
`insertAfterGroup()` GESER (+1) SEMUA vessel yang `sort_order`-nya lebih besar dari titik sisip,
diproses dari nilai PALING BESAR mundur ke kecil (`toShift.sort((a,b)=>b.sort_order-a.sort_order)`)
supaya tidak pernah ada 2 baris kebentur nilai sama di tengah proses pergeseran — baru setelah
itu vessel baru pakai slot yang sudah kosong. Proses ini beberapa request `.update()` berurutan
(bisa puluhan-ratusan tergantung posisi grup di file), jadi Save bisa makan beberapa detik utk
grup yang posisinya di awal/tengah file — DITERIMA (aksi admin manual, jarang terjadi, bukan
tabel besar). Kalau grup BELUM ADA (fleet group baru sama sekali), `insertAfterGroup()` return
`null` → fallback ke perilaku lama (Sort Order kosong = default kolom = nempel akhir tabel).
Field Sort Order manual TETAP ada sbg override kalau admin mau posisi spesifik lain.

### Chart Dashboard — upgrade dari `<div>` width% ke SVG manual (2026-09)

`HorizontalBarChart`/`VerticalBarChart` (komponen lokal `ReportingDashboardPage.tsx`, BUKAN
library chart — konsisten pola SVG manual yg sudah dipakai `AuditPoPage.tsx` DashboardModal).
Dipakai section 3 (Top Vessel)/4 (Per Jenis Biaya)/5 (Per Fleet Group) — horizontal — & section 6
(Tren Bulanan) — vertical, dgn gridline. Tooltip pakai `<title>` SVG native (hover browser
bawaan, bukan tooltip custom JS) — nampilkan label+nilai persis saat hover bar. Klik-through ke
Cost per Vessel (`onBarClick`) pindah dari `<Link>` per-bar (v1) jadi `onClick` + `useNavigate()`
(SVG `<g onClick>`, lebih simpel drpd nest elemen anchor di dalam `<svg>`). Section 1
(kartu ringkasan)/2 (Biaya per Method) TETAP `<Link>` biasa (bukan chart, tidak perlu SVG).

### Header panel berwarna (`ReportingDashboardPage.tsx`, 2026-09)

Permintaan user: SEMUA panel dulu `bg-white` polos ("flat putih"), diberi header berwarna dari 4
warna brand yg dilampirkan user (`#FFF5C5` kuning pastel, `#F58C77` coral, `#5A305A` ungu tua,
`#73507B` ungu medium). Helper `PanelHeader({color, dark, children})` — strip
`rounded-t-2xl` berwarna solid di atas tiap panel, teks putih default, `dark` prop (teks
`#5A305A`) dipakai KHUSUS background `#FFF5C5` (terlalu terang utk teks putih, kontras jelek).
Wrapper panel WAJIB `overflow-hidden` (bukan lagi `p-4` langsung) supaya sudut rounded
`rounded-t-2xl` header ke-clip rapi, konten asli dipindah ke `<div className="p-4">` terpisah
di bawah header. Kartu yg berupa `<Link>` (Total Cost, Highest Vessel Cost) tetap
clickable — `PanelHeader` + content div taruh di DALAM `<Link>`, `hover:border-[#5A305A]` tetap
di elemen `<Link>` terluar.

**Assignment warna per panel** (variasi manual, bukan formula — sekadar supaya tidak monoton):
Total Cost=`#5A305A`, Highest Vessel Cost=`#73507B`, Previous Period=`#FFF5C5`(dark), Cost per
Method=`#F58C77`, Vessels with Highest Cost=`#5A305A`, Cost by Category=`#73507B`, Cost per
Fleet Group=`#FFF5C5`(dark), Monthly Trend=`#F58C77`. 4 sub-kartu method (Courier/Sea/Air/
Chartered) DI DALAM panel "Cost per Method" TIDAK ikut diubah — tetap `border-slate-200` polos +
teks warna `METHOD_COLOR` masing2 (beda concern dari header panel luar).

### Header panel berwarna — susulan: konten masih "putih-putih" (2026-09)

Laporan user setelah header panel diwarnai (lihat bagian di atas): AREA KONTEN di bawah header
(chart/kartu) masih terasa "flat putih" krn `<div className="p-4">` konten tetap `bg-white`
polos. Fix: tiap `<div className="p-4">` konten SEKARANG dikasih `style={{backgroundColor:
'<colorHeaderNya>0D'}}` (hex 8-digit, alpha `0D`≈5%) -- tint sangat tipis dari warna header
panel yg sama, supaya nuansa warnanya "menular" ke seluruh kartu bukan cuma strip header doang.
Khusus panel dgn header `#FFF5C5` (kuning pastel, sudah terang dari awal) alpha-nya lebih besar
(`80`≈50%) supaya tintnya kelihatan (5% dari warna sepucat itu nyaris tidak beda dari putih).
Sub-kartu method (Courier/Sea/Air/Chartered) di DALAM panel "Cost per Method" ditambah
`bg-white` eksplisit (sebelumnya transparan/ikut tint parent-nya) supaya tetap kontras & mudah
dibaca di atas tint parent yg berwarna. **Kalau nambah panel baru ke halaman ini, WAJIB kasih
tint sama (`${headerColor}0D`, atau `80` khusus `#FFF5C5`) ke content div-nya juga** -- jangan
biarkan `bg-white`/tanpa style, nanti balik keliatan "putih-putih" lagi.

**Susulan lagi — masih ada garis/strip putih di bagian BAWAH sebagian kartu** (2026-09, laporan
user + screenshot, kelihatan jelas di kartu "Previous Period" & "Total Cost" yg kontennya
pendek): root cause BUKAN soal alpha tint, tapi wrapper kartu (`<Link>`/`<div>` terluar) adalah
grid item yg di-stretch (`align-items: stretch` default) menyamakan tingginya dgn kartu
TERTINGGI di baris grid yg sama, SEMENTARA `<div className="p-4">` konten di dalamnya cuma
setinggi konten aslinya (tidak ikut stretch) -- sisa ruang kosong di bawah expose
`bg-white`/transparent milik WRAPPER, bukan tint konten. Fix: wrapper kartu ditambah
`flex flex-col`, `<div>` konten ditambah `flex-1` -- konten (dan tint-nya) SEKARANG otomatis
mengisi PENUH sisa tinggi kartu, tidak ada lagi celah putih di bawah apapun tinggi konten
relatif ke kartu lain di grid yg sama. **Diterapkan ke SEMUA 8 wrapper panel di halaman ini --
kalau nambah panel baru, WAJIB `flex flex-col` di wrapper + `flex-1` di content div juga.**

### Klik vessel di chart "Vessels with Highest Cost" -> scroll+blink ke baris di Cost per Vessel (2026-09)

Permintaan user: klik bar vessel di Dashboard harus membuka Cost per Vessel LANGSUNG mengarah
(scroll) ke baris vessel itu + ada efek kedap-kedip (bukan cuma buka halaman filter umum spt
sebelumnya). Alur:
- `ReportingDashboardPage.tsx` — `topVessels` (dipakai section "Highest Vessel Cost" & chart
  "Vessels with Highest Cost") sekarang IKUT nyimpan `key` per entry (`v:<vessel_id>` utk vessel
  cocok master / `u:<vessel_name_raw>` utk needs-review) — SENGAJA format PERSIS SAMA dgn
  `VesselAgg.key` di `ReportingCostPerVesselPage.tsx`, supaya bisa langsung dipakai cari baris
  target di sana tanpa mapping tambahan. `vesselFilterQuery(tab, vesselKey)` (varian
  `filterQuery()` yg SUDAH ADA, nambah `&highlight=<vesselKey encoded>`) dipakai di 2 tempat:
  `<Link>` kartu "Highest Vessel Cost" (arah ke `topVessels[0]`) & `onBarClick` chart "Vessels
  with Highest Cost" (arah ke vessel yg DIKLIK, bukan selalu index 0).
- `ReportingCostPerVesselPage.tsx` — baca `?highlight=` sbg state `highlightKey` (dikonsumsi
  SEKALI, di-null-kan setelah baris ketemu supaya tidak berulang tiap re-render/ganti filter
  lain). `useEffect` (dependency `highlightKey`/`loading`/`displayRows`/`collapsedGroups`) cari
  baris `type==='vessel'` yg `data.key===highlightKey` di `displayRows` (BUKAN
  `visibleDisplayRows` -- perlu cek grup-nya walau lagi diciutkan) -- kalau grup vessel itu
  SEDANG diciutkan, `collapsedGroups` di-buka paksa dulu (`collapsedGroups` sengaja masuk
  dependency effect ini, supaya effect jalan LAGI begitu grup selesai terbuka & barisnya beneran
  ada di DOM). Setelah elemen ketemu (`document.getElementById('vessel-row-'+encodeURIComponent
  (key))`) -> `scrollIntoView({behavior:'smooth', block:'center'})` + set `blinkKey` (dibersihkan
  otomatis via `setTimeout` 5 detik, SINKRON dgn durasi animasi CSS `.reporting-row-blink` di
  `src/index.css`, `@keyframes reporting-row-blink` 1s x 5 iterasi = 5dtk (2026-09, permintaan
  user diperpanjang dari versi awal 1.8dtk -- **kalau durasi diubah lagi, WAJIB samakan ANGKA
  DETIK di 2 tempat ini** -- CSS animation & `setTimeout` JS, keduanya harus identik), kuning
  `#FFF5C5`/`#F5E28F` -- SAMA warna dgn highlight baris Subtotal, konsisten dgn "bahasa warna
  kuning = disorot" yg sudah dipakai modul lain).
- `<tr>` baris vessel dikasih `id={'vessel-row-'+encodeURIComponent(row.data.key)}` (SELALU ada,
  tidak cuma saat highlight aktif -- murni anchor DOM, tidak ganggu apa pun) + className
  kondisional `reporting-row-blink` saat `blinkKey===row.data.key`.
- **Chart Dashboard lain (Monthly Trend/Cost by Category/Cost per Fleet Group) TIDAK ikut fitur
  ini** — cuma diminta utk chart per-VESSEL (target barisnya jelas 1:1), chart2 lain arah ke
  bulan/kategori/fleet_group yg tidak punya baris tunggal spesifik di tabel pivot utk di-scroll.

**Bug ditemukan & diperbaiki — klik vessel BELUM mengarah ke barisnya (2026-09, laporan susulan
user)**: root cause RACE CONDITION -- `masterVessels` (`fetchMasterVessels()`) di-fetch di effect
TERPISAH dari `rawRows` (`loadRows()`), independen & async. Effect scroll+blink cuma nunggu
`loading` (state punya `loadRows()`/`rawRows`) jadi `false`, TIDAK nunggu `masterVessels` --
kalau render pertama kali `loading` sudah `false` tapi `masterVessels` MASIH `[]`, baris target
(vessel_id valid) sementara jatuh ke grup fallback "NEEDS REVIEW" (blm ke-map ke master), effect
tetap "berhasil" nemu elemennya di posisi SEMENTARA itu -> scroll ke situ -> `highlightKey`
langsung di-null-kan (consumed sekali). Detik berikutnya `masterVessels` datang, baris PINDAH ke
grup Base/Fleet Group asli (posisi scroll jadi tidak relevan lagi) -- TAPI tidak ada re-scroll
susulan krn `highlightKey` sudah kepakai duluan. **Fix**: state baru `mastersLoaded` (di-set
`true` setelah `fetchMasterVessels()` resolve/reject), effect scroll+blink SEKARANG WAJIB
`mastersLoaded===true` juga sebelum boleh consume `highlightKey` (guard `if (!highlightKey ||
loading || !mastersLoaded) return;`, `mastersLoaded` masuk dependency array) -- baris target
sudah pasti di posisi FINAL (grup Base/Fleet Group yg benar) saat scroll beneran terjadi.

### Label vessel_name kosong: "(kosong)" -> "(empty)" (2026-09)

`pushDedupedRows()` (`ReportingHelpers.ts`) pakai fallback string kalau nama vessel hasil split
sumbernya string kosong (mis. `vessel`/`vessel_internal_note` benar2 tidak diisi) -- SEMPAT
`'(kosong)'` (Indonesia, kebawa dari sesi lama sebelum 2 halaman Reporting ini ikut program
translasi Inggris), diganti `'(empty)'` (permintaan user eksplisit, konsisten dgn seluruh UI
halaman ini yg sudah Inggris). **Nilai ini DISIMPAN ke `reporting_cost_allocation.vessel_name_raw`
saat Recompute** (bukan live-computed) -- ganti kode di sini TIDAK otomatis mengubah baris yg
SUDAH pernah di-recompute sebelumnya, user WAJIB klik tombol **Recompute** ulang (bulan yg
relevan) di Cost per Vessel supaya baris lama yg masih bertuliskan "(kosong)" ke-refresh jadi
"(empty)".

### REVISI BESAR "REPORTING" (2026-09) — Cost per Vessel & Dashboard

Permintaan user dalam 1 pesan terstruktur ("REVISI MENU REPORTING", bagian A = Cost per Vessel,
B = Dashboard). Semua poin di bawah SUDAH diimplementasikan dalam 1 sesi yg sama, `npx tsc
--noEmit` bersih.

**A1. Sembunyikan vessel tanpa biaya (`ReportingCostPerVesselPage.tsx`)** — checkbox baru "Show
vessels without cost" (default **TIDAK** dicentang -- kebalikan `hideScrap`/"Hide Scrapped" yg
defaultnya tampil). State `showZeroCost`. Filter diterapkan di `all = all.filter(v =>
totalCost(v.sums) !== 0)` **SEBELUM** grouping (bukan filter visual sesudahnya) -- vessel `v.sums`
SUDAH terfilter per-tab lewat `rowsForTab` di awal `useMemo`, jadi cek `totalCost` otomatis benar
per-tab TANPA logic tambahan (mis. tab Courier vessel yg cuma py biaya Sea, `totalCost` bakal 0
di situ, ke-hide -- benar sesuai maksud "tanpa biaya DI TAB itu"). Konsekuensi otomatis dari
filter di titik ini (bukan filter terpisah): (a) jumlah "(N vessel)" di baris header/subtotal
ikut menyesuaikan; (b) fleet_group yg SEMUA vesselnya ke-filter otomatis tidak muncul grup-nya
sama sekali (grup dibangun dari isi `all` yg sudah difilter); (c) `vesselRowCount`/preview Export
(`ExportPreviewModal`) OTOMATIS ikut benar tanpa perubahan kode terpisah, krn keduanya baca
`displayRows` yg sama (turunan dari `all` yg sudah difilter).

**A2. Tombol "Back to Dashboard"** — `<Link to="/reporting/dashboard">` + ikon `ArrowLeft`, di
`<header>`, baris sendiri DI ATAS baris icon+judul+Greeting (bukan sebaris persis dgn judul,
supaya tidak berdesakan dgn Greeting di kanan) -- tetap "pojok kiri atas, sebelum filter
periode" krn `<header>` mendahului `<main>` (tempat filter) di urutan DOM.

**A3. Lock header & Grand Total (sticky) — REARSITEKTUR ke "shell tinggi tetap + scroll
internal"** (pola SAMA persis dgn `BunkerPage.tsx`/`AuditPoPage.tsx` dkk, lihat bagian tersendiri
di atas) — wrapper terluar `flex-1 h-full overflow-HIDDEN` (BUKAN lagi `overflow-y-auto`,
halaman ITU SENDIRI tidak lagi scroll), `<header>` & filter card `shrink-0` (jadi SELALU
terlihat, tidak perlu sticky krn memang tidak pernah ikut scroll), kartu tabel `flex-1 flex
flex-col min-h-0`, div scroll BARU (`ref={scrollRef}`, `overflow-auto flex-1 min-h-0`) yg
membungkus `<table>` -- INI yg beneran scroll (ganti dari `overflow-x-auto` polos sebelumnya
yg TIDAK py scroll vertikal sendiri). `<thead>` tetap `sticky top-0`. Baris GRAND TOTAL
**DIPINDAH keluar dari `<tbody>`** (dulu baris terakhir hasil `.map()`) jadi elemen `<tfoot>`
tersendiri dgn `sticky bottom-0` (dihitung terpisah via `displayRows.find(r=>r.type==='grand')`,
BUKAN dari `visibleDisplayRows.map()` lagi -- row union type `Disp` TETAP py varian `'grand'`,
cuma cara render-nya yg dipisah).

**A4. Tab "FAR Ovs" -> "All-In Import"** — `TABS` label BORONGAN diganti, value internal
`TabId`/`AllocationMethod` TETAP `'BORONGAN'` (tidak ada migrasi data/kode logic apa pun).

**A5. Kolom "Total Unofficial Cost" -> "Total All-In Import"** — `columnsForTab()` cabang
`BORONGAN`, murni label kolom (key tetap `borongan_total`).

**A6. Tombol lompat atas/bawah melayang** — `scrollRef` (div scroll dari poin A3) + state
`atTop`/`atBottom` (listener `scroll`+`resize` pada `scrollRef.current`, dihitung ulang tiap
`visibleDisplayRows.length`/`loading` berubah). Tombol `fixed bottom-32 right-6` (panah atas,
sembunyi kalau `atTop`) & `fixed bottom-20 right-6` (panah bawah, sembunyi kalau `atBottom`) --
`bottom-32`/`bottom-20` (BUKAN `bottom-6` biasa) sengaja diberi jarak dari baris GRAND TOTAL
sticky di bawah tabel (permintaan eksplisit "jangan menutupi grand total"). Scrollbar tabel
TIDAK perlu disembunyikan manual -- app ini SUDAH default sembunyikan semua scrollbar
(`src/index.css`), tombol ini murni gantinya biar tetap bisa lompat cepat.

---

**B1. Kartu baru "Total Cost Exclude PPN+PPH" (`ReportingDashboardPage.tsx`)** — disisipkan PERSIS
di antara "Total Cost" & "Highest Vessel Cost" (urutan final: Total Cost | Total Cost Exclude
PPN+PPH | Highest Vessel Cost | Previous Period), grid `md:grid-cols-2 xl:grid-cols-4` (dari
`md:grid-cols-3`). Nilainya `totalExclPpn(curSums)` (fungsi SUDAH ADA di `ReportingHelpers.ts`,
sebelumnya cuma dipakai `ReportingCostPerVesselPage.tsx` kolom "Total Excl. PPN+PPH" -- SEKARANG
diimpor juga ke Dashboard, SATU-SATUNYA sumber formula, Aturan Umum #1 tetap terjaga). Warna
header panel `#D97706` (oranye, belum pernah dipakai di 8 panel lain -- variasi tambahan).

**B2. "Chartered" -> "All-In Import"** — `METHOD_LABEL[BORONGAN]` (card di panel "Cost per
Method") DAN label yg sama di array `perJenisBiaya` ("Cost by Category", supaya konsisten --
TIDAK diminta eksplisit tapi disamakan krn kalau tidak, 1 dashboard bisa nampilkan 2 istilah beda
utk nilai yg sama & membingungkan). Value data (`borongan_total`) TIDAK berubah.

**B3. Dropdown filter method di header "Cost per Method"** — `METHOD_FILTER_OPTIONS` (All
Method/Courier/Sea/Air/All-In Import), state `methodFilter`. `PanelHeader` diperluas terima prop
opsional `right` (render node di kanan judul, dipakai taruh `<select>` ini). **Filter method INI
SENGAJA TIDAK memfilter panel "Cost per Method" itu sendiri** (`perMethod` tetap dihitung dari
`currentRows` MENTAH, breakdown semua method harus tetap kelihatan semua) -- yg terfilter
`filteredCurrentRows`/`filteredPreviousRows`/`filteredYearRows` (turunan `useMemo` baru), dipakai
GANTI `currentRows`/`previousRows`/`yearRows` polos utk: `curSums`/`prevSums` (3 dari 4 kartu
ringkasan yg berbasis total, `Previous Period` ikut lewat `prevSums`), `topVessels`,
`perFleetGroup`, `monthlyTrend`. Link/`onBarClick` navigasi ke Cost per Vessel yg tadinya
hardcode `tab=ALL` (kartu Total Cost/Highest Vessel Cost/chart Vessels with Highest Cost/Monthly
Trend) diganti pakai `filteredTabParam` (=`methodFilter`) -- konsisten dgn apa yg SEDANG
ditampilkan dashboard saat diklik. 4 sub-kartu method DI DALAM panel "Cost per Method" itu
sendiri TIDAK berubah (tetap link ke method masing2 apa adanya, tidak terpengaruh dropdown ini).

**B4. Tombol lompat atas/bawah melayang** — pola SAMA persis poin A6, TAPI halaman ini **TIDAK**
dikonversi ke shell "tinggi tetap" (tidak diminta lock header/footer di sini, beda dari Cost per
Vessel) -- `pageScrollRef` nunjuk ke div `overflow-y-auto` yg SUDAH ADA dari awal (wrapper
terluar halaman ini, `ref` baru ditambahkan ke situ + `relative` biar aman utk elemen `fixed`
turunannya). Effect cek `atTop`/`atBottom` py dependency tambahan `methodFilter`/`periodMode`/
`year`/`month` (BUKAN cuma `loading` spt di Cost per Vessel) -- konten Dashboard bisa berubah
tinggi drastis (jumlah baris chart dst) tanpa event `scroll`/`resize` asli terpicu saat filter
ganti, jadi effect-nya WAJIB ikut jalan ulang manual lewat dependency ini. Tombol `bottom-20`
(atas)/`bottom-6` (bawah) -- TIDAK perlu jarak ekstra ala Cost per Vessel krn halaman ini tidak
punya baris sticky di bawah yg perlu dihindari.

### Susulan revisi Cost per Vessel (2026-09) — Back to Dashboard melayang, hapus Hide Scrapped, singkat label

3 perubahan kecil susulan dari revisi besar di atas, semua di `ReportingCostPerVesselPage.tsx`:

- **"Back to Dashboard" jadi tombol melayang** (dulu link inline di `<header>`, DIHAPUS dari
  situ) -- sekarang `<Link>` `fixed bottom-44 right-6` (icon-only `ArrowLeft`, tooltip `title`),
  DITUMPUK di ATAS 2 tombol lompat atas/bawah yg sudah ada (`bottom-32`/`bottom-20`, gaya bulat
  sama persis) -- 3 tombol melayang total di pojok kanan bawah, urutan dari atas ke bawah: Back
  to Dashboard -> Jump to top -> Jump to bottom.
- **Checkbox "Hide Scrapped" DIHAPUS TOTAL** (state `hideScrap`, `scrapVesselIds` filtering di
  `displayRows` useMemo, JSX checkbox-nya) -- permintaan eksplisit user. **Konsekuensi**: vessel
  berstatus SCRAP SEKARANG SELALU ikut tampil di pivot (perilaku sama seperti dulu saat checkbox
  ini TIDAK dicentang/default) -- tidak ada lagi cara menyembunyikannya dari UI. Kalau diminta
  lagi nanti, fitur ini perlu dibuat ulang dari nol (bukan cuma un-hide, kodenya sudah dibuang).
- **Label checkbox "Show vessels without cost" -> "Show zero-cost"** (terlalu panjang, permintaan
  user) -- state (`showZeroCost`) & logic filter TIDAK berubah, murni teks label.
- **Susulan LAGI (2026-09, screenshot user): 3 tombol melayang kegedean & nutupin baris tabel** --
  dulu `w-10 h-10`/ikon `18`, tersebar `bottom-20`/`bottom-32`/`bottom-44` (melayang di TENGAH
  ketinggian tabel, nutupin banyak baris data). Diperkecil `w-8 h-8`/ikon `14`, DAN ditumpuk
  RAPAT betulan di pojok kanan-BAWAH LAYAR (`right-3`, `bottom-3`/`bottom-14`/`bottom-24` --
  bukan lagi tersebar dari tengah ke bawah). Baris GRAND TOTAL sticky tetap aman tidak
  ketutupan krn beda posisi vertikal (grand total nempel di tepi BAWAH AREA TABEL, bukan tepi
  bawah LAYAR -- `main` masih py `pb-2` jadi ada jarak alami).
- **Susulan LAGI-LAGI (2026-09): `right-3` masih kurang mepet tepi layar** -- digeser jadi
  `right-1` (laporan user "masih kurang geser ke kanan"). Ukuran (`w-8 h-8`/ikon `14`) TIDAK
  diubah lagi, user konfirmasi sudah pas. **`ReportingDashboardPage.tsx` disamakan juga**
  (permintaan eksplisit "lakukan juga hal yang sama pada halaman Reporting Dashboard") -- 2
  tombol lompat atas/bawah di situ (dulu `w-10 h-10`/ikon `18`/`right-6`, TIDAK PERNAH
  diperkecil sebelumnya krn revisi ukuran sebelumnya cuma menyentuh Cost per Vessel) ikut
  diseragamkan jadi `w-8 h-8`/ikon `14`/`right-1`/`bottom-14`+`bottom-3` (Dashboard tidak py
  tombol "Back to Dashboard" melayang -- cuma 2 tombol, bukan 3 spt Cost per Vessel).

### Fix: halaman tidak full-width di monitor 24" (2026-09, laporan user + screenshot)

`ReportingDashboardPage.tsx`/`ReportingCostPerVesselPage.tsx` py `<main className="max-w-7xl
mx-auto ...">` sejak awal dibuat (ikut pola "Header halaman" umum di dokumen ini yg memang
`max-w-7xl`/`max-w-2xl`/`max-w-5xl` sesuai kebutuhan) -- TERNYATA di layar lebar (monitor 24")
nyisa ruang kosong besar kiri-kanan, beda dari Audit Courier (`SharedDataTable.tsx` `<main>`)
yg TIDAK py `max-w-*`/`mx-auto` sama sekali, jadi selalu full-width sejajar sidebar & tepi
layar. Fix: `max-w-7xl mx-auto` DIHAPUS dari `<main>` KEDUA halaman Reporting ini, disamakan
`px-3 pt-2 pb-*` polos spt Audit Courier. **Halaman lain yg SUDAH `max-w-7xl`/`max-w-2xl` dkk
TIDAK ikut disentuh** (lihat "Pola UI wajib" di atas -- itu tetap konvensi resmi utk halaman
form/list sempit; 2 halaman Reporting ini SEKARANG pengecualian krn tabel pivotnya lebar &
diminta full-width, sama alasannya dgn Audit Courier/Audit AP Local dkk yg juga full-width).

### Dropdown filter method dipindah ke panel filter periode (2026-09, laporan user "tidak keliatan"+susulan "di sebelah tahun")

Dropdown `METHOD_FILTER_OPTIONS` (`ReportingDashboardPage.tsx`) awalnya ditaruh di header panel
"Cost per Method" (pojok kanan, prop `right` di `PanelHeader`) -- user melaporkan "tidak ada
dropdown-nya" (screenshot cuma nunjuk panel filter periode paling atas, belum scroll ke panel
"Cost per Method" yg lebih bawah) lalu diminta eksplisit dipindah ke panel filter periode
utama, sejajar dgn dropdown Monthly/Sep/2026 (`<select>` ke-4, setelah `year`). `PanelHeader`
panel "Cost per Method" balik jadi bentuk polos (tanpa prop `right`, prop-nya sendiri TETAP ada
di komponen `PanelHeader` -- BUKAN dihapus, cuma tidak dipakai lagi di panel ini, aman dipakai
lagi kalau ada panel lain butuh elemen di kanan header ke depannya). Logic filter
(`filteredCurrentRows`/`filteredPreviousRows`/`filteredYearRows`, `filteredTabParam`) TIDAK
berubah sama sekali -- murni pindah LOKASI elemen `<select>`-nya di JSX.

### Warna tematik dropdown panel filter (`ReportingDashboardPage.tsx`, 2026-09)

Permintaan user: 4 dropdown di panel filter periode (dulu SEMUA putih/border abu polos, sama
`border-slate-300` spt sebelum revisi warna toolbar `ReportingCostPerVesselPage.tsx` dilakukan)
dikasih warna tematik, pola sama "Warna toolbar per tombol" (lihat bagian tsb di atas). 3
dropdown periode (Monthly/Yearly, bulan, tahun) dikelompokkan 1 warna ungu `#73507B`
(`bg-[#73507B]/10 text-[#73507B] border-[#73507B]/30`, soal "kapan" -- SAMA warna dgn tombol
Collapse/Expand All di Cost per Vessel yg jg soal struktur/kontrol tampilan). Dropdown method
(paling kanan, lihat bagian "Dropdown filter method dipindah..." di atas) dikasih warna coral
`#F58C77` TERPISAH (`bg-[#F58C77]/10 text-[#F58C77] border-[#F58C77]/40`) -- SENGAJA disamakan
dgn warna header panel "Cost per Method" (sumber `METHOD_LABEL`), asosiasi visual "warna ini =
filter method". **Bug ditemukan & diperbaiki saat implementasi ini**: percobaan pertama tidak
sengaja MENGHAPUS pembungkus `<div className="flex flex-nowrap items-center gap-3
overflow-x-auto">` (nested di dalam kartu filter `bg-white rounded-2xl ...`) saat menyisipkan
komentar penjelasan warna -- `npx tsc --noEmit` lolos (JSX tetap balance krn jumlah tag
buka/tutup `<div>` di seluruh return statement kebetulan tetap genap), TAPI struktur DOM jadi
salah (4 `<select>` jadi child LANGSUNG kartu putih, bukan di dalam flex row-nya) -- ditemukan
lewat re-read manual, BUKAN dari error compiler. **Pelajaran**: `tsc` TIDAK menjamin JSX
nesting semantically benar, cuma syntactically valid -- WAJIB baca ulang hasil edit structural
JSX (bukan cuma andalkan tsc bersih) tiap kali Edit tool memotong potongan besar berisi tag
pembuka/penutup campuran.

### Header panel diseragamkan (riwayat 4 iterasi warna, 2026-09)

Semua 8 panel dashboard yg sebelumnya variasi 4 warna brand berbeda (`#5A305A`/`#73507B`/
`#F58C77`/`#FFF5C5`, lihat bagian "Header panel berwarna" di atas) diseragamkan SEMUA jadi 1
warna, BERUBAH 3x SETELAHNYA -- **kondisi FINAL/SEKARANG: `#DCC9E0`** (lavender pastel sangat
muda, user kasih hex eksplisit langsung "ganti jadi warna ini") + prop `dark` WAJIB (teks
`#5A305A`, brightness `#DCC9E0` ~209 dari skala 0-255/formula ITU-R BT.601 `0.299R+0.587G+
0.114B` -- JAUH di atas ambang ganti ke teks gelap ~150, teks putih nyaris tidak kebaca di
warna sepucat ini). Content tint `#DCC9E080` (alpha besar, pola sama `#FFF5C5` dulu -- warna
pucat butuh alpha tinggi spy tint kelihatan beda dari putih polos). Riwayat iterasi SEBELUMNYA
(JANGAN reintroduce tanpa diminta ulang): `#FFF5C5`(+`dark`) -> `#73507B`(tanpa `dark`) ->
`#8F7395`("lighten 20%" dari `#73507B`, tanpa `dark`) -> `#DCC9E0`(+`dark`, FINAL). **`PanelHeader`
prop `color`/`dark` TIDAK dihapus** (masih diterima komponennya) -- kalau diminta variasi warna
lagi ke depan, tinggal ganti value `color`/tambah-hapus `dark` per panel sesuai brightness-nya
(pakai formula ITU-R BT.601 di atas, ambang kasar ~150 utk tentukan perlu `dark` atau tidak),
arsitekturnya tetap fleksibel. 4 sub-kartu method (Courier/Sea/Air/Chartered) di DALAM panel
"Cost per Method" & warna bar chart (`#D97706` Cost by Category, `#0284C7` Cost per Fleet
Group) TIDAK ikut diseragamkan -- beda konteks (warna isi konten, bukan header panel luar).

### Susulan: konten panel putih polos + hilangkan border "garis putih" (2026-09, screenshot user)

2 perbaikan lanjutan dari header `#DCC9E0` di atas, `ReportingDashboardPage.tsx`:

- **Content di bawah header SEKARANG `bg-white` polos** (dulu ikut tint warna header,
  `#DCC9E080` dkk) -- permintaan "warna konten-nya buat putih aja". Cuma STRIP HEADER-nya yg
  berwarna, badan panel selalu putih bersih. Style inline `backgroundColor` di content div
  DIHAPUS TOTAL, ganti className `bg-white` polos.
  **Susulan (2026-09) ganti warna header lagi -> WAJIB reset content div balik ke `bg-white`
  polos juga (JANGAN tint ulang otomatis)** -- keputusan user eksplisit "konten putih aja",
  beda dari revisi warna header sebelumnya yg selalu ikut nge-tint konten.
- **Border `border border-slate-200` DIHAPUS dari 8 wrapper panel** (laporan user "seperti ada
  garis putih/border putih di tiap panel", screenshot menunjukkan outline tipis di sekeliling
  tiap kartu terhadap background gradient peach/lavender halaman -- border abu SANGAT terang
  itu yg kelihatan spt "putih" saat kontras dgn gradient warna di belakangnya). Wrapper panel
  sekarang cuma `bg-white rounded-2xl shadow-sm overflow-hidden` (`shadow-sm` tetap dipertahankan
  utk elevasi visual, TANPA border). **Kartu filter periode (`p-4 mb-3` di atas 8 panel) & 4
  sub-kartu method di DALAM panel "Cost per Method" TIDAK ikut dihapus border-nya** -- cakupan
  permintaan user MURNI "8 panel" utama, bukan elemen lain di halaman ini.

### Susulan: 2 kelompok warna header berbeda (2026-09, riwayat 2 iterasi warna kelompok kedua)

Setelah SEMPAT diseragamkan 1 warna (`#DCC9E0`, lihat bagian di atas), user minta 5 dari 8 panel
dibedakan lagi warnanya: **Cost per Method, Vessels with Highest Cost, Cost by Category, Cost
per Fleet Group, Monthly Trend** diganti `#F7A392` (coral muda, hasil "lighten ~20%" dari
`#F58C77` ke arah putih -- permintaan eksplisit "warna #F58C77 tapi lebih muda"), LALU diganti
LAGI (susulan langsung) jadi **`#FFF5C5`** (kuning pastel, permintaan eksplisit user berikutnya
-- kebetulan hex-nya sama dgn salah satu iterasi warna SELURUH-8-panel yg lampau, TAPI ini
keputusan BARU yg cakupannya cuma 5 panel ini, BUKAN reintroduce state lama secara utuh).
**4 kartu ringkasan (Total Cost/Total Cost Exclude PPN+PPH/Highest Vessel Cost/Previous
Period) TETAP `#DCC9E0`** (TIDAK disentuh sama sekali di kedua revisi susulan ini, di luar
cakupan permintaan). Konten di bawah header (`bg-white` polos, dari revisi sebelumnya) TIDAK
berubah -- user eksplisit bilang "konteksnya tetap warna putih", jadi warna baru INI HANYA
berlaku ke strip header, bukan area konten. **Kondisi final SEKARANG: 2 kelompok warna header
berbeda** di halaman yg sama (`#DCC9E0` kartu ringkasan / `#FFF5C5` panel analitik-chart) --
kalau nambah panel baru, WAJIB tanya/tentukan masuk kelompok mana sebelum asal pilih salah
satu warna.

### REVISI MENU REPORTING (2026-09, lanjutan) — label FAR Ovs, kartu baru, donut, Periodic View

Permintaan user terstruktur ("REVISI MENU REPORTING", bagian A = Dashboard, B = Cost per
Vessel). Klarifikasi yang dikonfirmasi user SEBELUM implementasi (penting utk keputusan
arsitektur di bawah): (1) kolom akumulasi Periodic View ("TOTAL YTD"/"TOTAL TAHUN"/"TOTAL
AKUMULASI") = **jumlah dari periode yang SEDANG ditampilkan/dipilih saja** (BUKAN year-to-date
sungguhan/akumulasi seluruh histori data — jadi TIDAK perlu fetch data tahun lain di luar yang
dipilih user); (2) TIDAK ADA dropdown Quarter terpisah — quarter di tab Quarterly (Periodic
View) **diturunkan dari dropdown Bulan** yang dipilih fleksibel (grouping bulan-bulan terpilih
ke kuartalnya, cuma menjumlah bulan yang BENERAN dipilih, bukan otomatis tarik bulan lain).

**"All-In Import" -> "FAR Ovs" (LAGI, kembali ke penamaan sebelum di-rename)** — di KEDUA
halaman (`METHOD_LABEL`/`METHOD_FILTER_OPTIONS`/`perJenisBiaya` di Dashboard; `TABS`/
`columnsForTab` label kolom "Total FAR Ovs" di Cost per Vessel). Value internal
`AllocationMethod`/`TabId` TETAP `'BORONGAN'` — HANYA label tampilan yang berubah, riwayat 2
iterasi nama sebelumnya (FAR Ovs -> All-In Import -> FAR Ovs lagi) dicatat supaya tidak
reintroduce nama lain tanpa diminta ulang.

**`master_vessel.sort_order` (BARU)** — kolom int, migrasi `sql/006_master_vessel_sort_order.sql`
(**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu**, backfill via
`row_number() over (order by vessel_id)` krn `vessel_id` identity SUDAH inkremen persis sesuai
urutan baris file Excel Master Vessel saat insert awal). Cost per Vessel WAJIB tampilkan baris
PERSIS urutan file (bukan alfabet) — `fetchMasterVessels()` diganti `.order('sort_order')`
(dari `.order('vessel_name')`). `ReportingCostPerVesselPage.tsx` — resort alfabet manual di
`displayRows` useMemo (`a.base.localeCompare(...)` dkk) **DIHAPUS TOTAL**: urutan
`Array.from(aggMap.values())` otomatis benar krn `aggMap` dibangun dari `masterVessels.forEach`
yang urutannya sudah `sort_order`. Ini otomatis menangani kasus "BASE tidak berurutan rapi di
file" (mis. JAKARTA muncul 2 blok terpisah, dipisah BELAWAN/TBA/DUMAI/SURABAYA di antaranya) —
grouping baris konsekutif `${base}::${fleetGroup}` yang SUDAH ADA sebelumnya otomatis membuat
blok terpisah kalau posisinya memang tidak berurutan, TANPA logic tambahan. `MasterVesselAdminPage.tsx`
— kolom "Sort" + field edit `sort_order` (opsional, kosong = default kolom = taruh di akhir),
list di-sort by `sort_order` (bukan alfabet lagi).

**`ReportingHelpers.ts` — arsitektur periode generik `{year,month}[]`** — `fetchAllocationRows
(mode,year,month)` (Monthly/Yearly saja) diganti fondasi baru `fetchAllocationRowsByMonths
(pairs: YearMonth[])` (`.in('period_month', [...])`, dedup) — SATU-SATUNYA query dipakai KEDUA
halaman (Aturan Umum #1 tetap terjaga). `monthsOfYear`/`monthsOfQuarter`/`quarterOfMonth` helper
kecil. `fetchAllocationRows(mode,year,month,quarter?)` TETAP ADA sbg wrapper single-period
(dipakai Dashboard yang tidak butuh multi-select), `PeriodMode` nambah `'QUARTERLY'`.

**A. Reporting Dashboard** — mode periode Monthly/Yearly -> **Monthly/Quarterly/Yearly** (dropdown
Quarter Q1-Q4 SINGLE-select muncul saat Quarterly, BEDA dari Cost per Vessel yang multi-select).
**4 kartu ringkasan, urutan BARU**: Total Cost | Highest Vessel Cost | Total Cost Excl. PPN+PPH |
**Total PPN+PPH (kartu BARU)** — kartu "Previous Period" lama DIHAPUS (fungsinya sekarang murni
bahan hitung %, bukan kartu sendiri). 3 kartu nominal tampilkan %, Highest Vessel Cost TIDAK.
Teks pembanding dinamis (`comparePeriodLabel`) ikut mode aktif: Monthly `"vs Aug 2026"` (english
3-huruf, SENGAJA beda dari dropdown bulan Indonesia `MONTH_NAMES` yang dipakai di tempat lain),
Quarterly `"vs Q2 2026"`, Yearly `"vs 2025"`. **"Cost per Method" jadi Donut chart** (komponen
baru `DonutChart`, SVG `stroke-dasharray` per segmen, viewBox persegi TETAP — bukan bar chart,
jadi imun dari masalah distorsi stretch non-uniform yang pernah dialami `VerticalBarChart` versi
SVG lama) — total di tengah, legend kanan (nama+persen+nominal PENUH). Ditaruh 1 baris `grid
lg:grid-cols-2` bersama "Vessels with Highest Cost" (donut kiri, bar kanan) — GANTI TOTAL dari
layout lama (Cost per Method full-width kartu kecil di atas, Vessels with Highest Cost full-width
baris sendiri di bawah). "Cost by Category"/"Cost per Fleet Group" TIDAK berubah.

**B. Cost per Vessel — perubahan TERBESAR** — `ReportingCostPerVesselPage.tsx`:
- Deretan tombol tab method -> **1 dropdown** (`TABS.map` jadi `<select>`, "All Method" default).
- **Periode multi-select**: `year`/`month` single-value diganti `selectedYears: Set<number>`/
  `selectedMonths: Set<number>` + komponen lokal BARU `MultiSelectDropdown` (tombol+panel
  checkbox+"All"/"Clear", TIDAK pakai React Portal serumit `KategoriPicker` krn filter bar cukup
  ruang). **Bulan kosong utk 1+ tahun = seluruh 12 bulan tahun itu** (`emptyMeansAll` prop) —
  mendukung contoh user "pilih 2024+2025+2026 saja". `selectedPeriods` useMemo = cartesian
  product tahun x bulan, SATU-SATUNYA sumber resolusi periode final (fetch, Recompute, kolom
  Periodic View semua pakai ini). Chip periode aktif ditampilkan di bawah filter bar.
- **2 sub-tab tampilan** (`viewMode: 'SUMMARY'|'PERIODIC'`): **Summary View** = layout `displayRows`
  LAMA TIDAK diubah strukturnya, cuma sumber datanya sekarang gabungan `selectedPeriods`.
  **Periodic View (BARU)** — sub-tab periode sendiri (`periodicMode: 'MONTHLY'|'QUARTERLY'|'YEARLY'`,
  HANYA relevan Periodic View), kolom dihitung `buildPeriodColumns(selectedPeriods, periodicMode)`
  — grouping bulan-bulan terpilih ke level periode (quarter = `Math.ceil(month/3)` dari bulan yg
  BENERAN dipilih, bukan tarik semua bulan quarter itu). Header 2 tingkat (`<thead>` 2 `<tr>`,
  `rowSpan`/`colSpan` HTML): tingkat 1 = label periode ("JANUARI 2026"/"JAN-MAR (Q1) 2026"/
  "TAHUN 2026"), tingkat 2 = "Total Cost"/"Excl PPN+PPH". Kolom PALING KANAN = akumulasi
  (`accLabel` ikut `periodicMode`: "TOTAL YTD"/"TOTAL TAHUN"/"TOTAL AKUMULASI") = **`VesselAgg.sums`
  APA ADANYA** (sesuai klarifikasi user: SUM seluruh periode yang sedang ditampilkan, BUKAN
  fetch histori tambahan). `VesselAgg.monthly: Record<number,sums>` (key 1-12, collision-prone
  lintas tahun) **DIGANTI `periodSums: Record<string,sums>`** (key `'YYYY-MM'`, aman multi-tahun)
  — `sumPeriodKeys()` helper gabungkan balik ke level quarter/year saat render/export.
- **Export ikut PERSIS tampilan** (poin B5) — `handleExport`/`ExportPreviewModal` sekarang terima
  `viewMode`/`periodColumns`/`accLabel`, dan **pakai `visibleDisplayRows`** (BUKAN `displayRows`
  mentah — FIX bug lama: baris grup yang sedang diciutkan dulu TETAP ke-export, sekarang tidak).
  Header Excel Periodic View pakai `ws.mergeCells(...)` 2 tingkat, sama persis struktur on-screen.
- **Recompute** (poin B6) — loop SEMUA bulan unik di `selectedPeriods` (bukan lagi tergantung
  mode Monthly/Yearly terpisah) — krn Summary View & KETIGA sub-mode Periodic View semuanya murni
  agregasi dari baris bulanan yang sama (`reporting_cost_allocation`), merecompute bulan2 ini
  OTOMATIS bikin semua tampilan konsisten tanpa logic terpisah per mode. **"Last recomputed"**
  ditampilkan di filter bar — TANPA kolom/tabel baru, cukup `MAX(created_at)` dari baris yang
  SUDAH ter-fetch client-side (`created_at` sudah ke-select via `select('*')`).

### Cost per Vessel — revisi susulan (2026-09): key collision, dropdown ke-clip, kolom diseragamkan, header akumulasi

7 perbaikan/perubahan susulan dari revisi besar di atas, semua di `ReportingCostPerVesselPage.tsx`.

1. **Tombol Summary View/Periodic View dipindah** dari deretan filter atas ke pojok kiri-atas
   KARTU TABEL (baris toolbar baru `shrink-0 border-b` tepat di atas `scrollRef` div) — dropdown
   `periodicMode` (Monthly/Quarterly/Yearly) ikut pindah ke situ, cuma muncul saat Periodic View.
2. **Bug ditemukan & diperbaiki — dropdown Year/Month "tidak bisa diklik"**: root cause
   `MultiSelectDropdown` panelnya dulu `position:absolute` DI DALAM container filter bar yang
   py `overflow-x-auto` — CSS quirk: `overflow-x` non-`visible` tanpa `overflow-y` eksplisit
   bikin browser meng-clip SUMBU Y JUGA, jadi panel checkbox-nya ke-clip habis oleh parent-nya
   sendiri (bukan literally "tidak bisa diklik", tapi TIDAK PERNAH TERLIHAT/TERJANGKAU). Fix:
   panel di-render via React Portal ke `document.body`, `position:fixed` dihitung dari
   `getBoundingClientRect()` tombolnya (pola sama `KategoriPicker` di `AuditPoHelpers.ts`,
   reposisi ulang tiap `resize`/`scroll` window selama panel terbuka).
3. **Bug ditemukan & diperbaiki — "Show Zero Cost" tidak menampilkan vessel lengkap di beberapa
   fleet group"**: BUKAN bug logic filter `showZeroCost` (kodenya sudah benar) — root cause
   **React key collision**: base+fleet_group yang SAMA PERSIS bisa muncul di >1 BLOK terpisah
   non-kontinu di file Master Vessel (mis. JAKARTA/TANKER dkk, lihat poin B7 revisi sebelumnya).
   Key React (`hdr-${groupKey}`/`sub-${base}-${fleetGroup}`) DAN entry `collapsedGroups` dulu
   dibentuk dari `groupKey = base::fleetGroup` APA ADANYA — 2 blok berbeda dgn nama sama jadi
   py key IDENTIK, bikin React salah reuse/skip elemen DOM antar blok (gejala persis laporan
   user: "toggle Collapse/Expand berulang kadang memunculkan vessel yg tadinya hilang" — classic
   symptom key collision, force re-render kadang "membetulkan" tampilan sesaat). Fix: `groupKey`
   final sekarang `${base}::${fleetGroup}#${index blok}` (unik per BLOK, bukan per NAMA) —
   deteksi kontinuitas (kapan mulai blok baru) tetap pakai `base::fleetGroup` mentah, cuma key
   akhirnya yang dibikin unik. Key subtotal row disamakan pakai `row.groupKey` juga (dulu
   `sub-${base}-${fleetGroup}`, sama masalahnya).
4. **Kolom Summary View diseragamkan** — All Method/Courier/Sea/Air SEKARANG SAMA PERSIS 2 kolom
   `Total Vessel Cost`/`Total Excl. PPN+PPH` (dulu Courier dijabarkan Courier Adm/Duty/Freight/
   BM/PPN+PPH, Sea/Air dijabarkan Duty/Handling Total/BM/PPN+PPH). Breakdown ini DIHAPUS TOTAL
   dari `columnsForTab()` — SECARA MATEMATIS tetap benar krn `sums` yang dipakai SUDAH terfilter
   per-method lewat `rowsForTab`, cuma beda cara tampil (total vs breakdown), bukan beda angka.
   **FAR Ovs (BORONGAN) SENGAJA TETAP 1 kolom sendiri** (`Total FAR Ovs`) — pengecualian
   eksplisit user, method ini memang cuma py 1 jenis biaya (`borongan_total`), tidak ada apa pun
   utk diseragamkan/dihapus.
5-7. **Header kolom akumulasi Periodic View disederhanakan** — label "TOTAL YTD"(Monthly)/
   "TOTAL TAHUN"(Quarterly)/"TOTAL AKUMULASI"(Yearly) DIHAPUS TOTAL dari kolom paling kanan
   (di 3 tempat: tabel on-screen, `ExportPreviewModal`, DAN file Excel `handleExport` via
   `ws.mergeCells`) — header "Total Cost"/"Excl PPN+PPH" kolom itu sekarang `rowSpan={2}`
   MEMBENTANG dari baris 1 langsung (SAMA persis pola Base/Fleet Group/Vessel di kiri), bukan
   lagi py baris label periode terpisah di atasnya. Berlaku SERAGAM ke ketiga `periodicMode`
   (Monthly/Quarterly/Yearly) — TIDAK ADA lagi variasi teks label per mode utk kolom ini. Const
   `accLabel` (dulu menghasilkan 3 variasi teks itu) DIHAPUS TOTAL dari kode, sudah tidak dipakai
   di mana pun.

### Reporting Dashboard + Cost per Vessel digabung jadi 1 halaman "Cost by Vessel" (2026-09)

Permintaan user: 2 halaman top-level terpisah ("Reporting Dashboard" `/reporting/dashboard` &
"Cost per Vessel" `/reporting/cost-per-vessel`) digabung jadi **1 halaman/1 route**
(`/reporting/cost-by-vessel`, `src/pages/CostByVesselPage.tsx`, BARU) dengan **2 tab** di
dalamnya — masing2 tab tetap menampilkan komponen yang PERSIS SAMA seperti sebelumnya
(`ReportingDashboardPage.tsx`/`ReportingCostPerVesselPage.tsx` TIDAK diubah struktur
internalnya sama sekali, hanya dirender bergantian sbg children tab).

- **page_key RBAC TETAP 2 terpisah** (`reporting_dashboard`/`reporting_cost_per_vessel` di
  `PAGE_REGISTRY`) — SENGAJA TIDAK digabung jadi 1 page_key baru, supaya assignment akses
  per-role yang sudah ada di Kelola Role & Akses tetap valid apa adanya tanpa perlu migrasi SQL
  apa pun (murni penggabungan navigasi/UI). `PAGE_REGISTRY[].path` keduanya sekarang menunjuk ke
  route gabungan yang SAMA, dibedakan lewat query `?view=dashboard`/`?view=cost_per_vessel`.
- **Route `/reporting/cost-by-vessel` SENGAJA TIDAK dibungkus `RequirePageAccess pageKey=...`
  tunggal** di `App.tsx` (butuh cek "salah SATU dari 2 page_key", bukan 1) — gating dilakukan
  INTERNAL oleh `CostByVesselPage.tsx` sendiri (pola sama hub `/settings` — `canSee()` internal,
  lihat `SettingsPage.tsx`): tab yang page_key-nya tidak diizinkan disembunyikan dari tab bar
  (bukan disabled), dan kalau user tidak punya akses ke KEDUANYA, tampilkan pesan "Tidak Ada
  Akses" sendiri (replika gaya `RequirePageAccess.tsx`).
- **Sidebar** (`MainLayout.tsx`) — menu "Reporting" (2 subtab) sempat GANTI TOTAL jadi 1 item
  tanpa subtab label "Cost by Vessel" langsung, LALU (susulan, permintaan user) **DIBUNGKUS LAGI**
  jadi 1 menu induk **"Reporting"** dgn 1 subtab **"Cost by Vessel"** di dalamnya (struktur
  expand/collapse sama persis Courier/Sea & Air — klik header "Reporting" buka/tutup submenu,
  klik "Cost by Vessel" baru navigasi) — supaya sidebar siap kalau modul Reporting lain
  ditambah ke depan sbg subtab baru di bawah induk yang sama. `pageKeys` (array, beda dari
  `pageKey` tunggal yang dipakai tab lain) dipasang di level SUBTAB "Cost by Vessel" — tampil
  kalau user punya akses ke SALAH SATU dari 2 page_key lama. `MAIN_TABS`/`visibleTabs` di
  `MainLayout.tsx` sekarang py tipe eksplisit `MainTab`/`SubTab` (ditambahkan krn TS tidak bisa
  infer union `pageKey`/`pageKeys` lintas-anggota array literal tanpa anotasi tipe) — mendukung
  `pageKeys` di level MAIN_TAB TANPA subTabs (dulu) MAUPUN di level SUBTAB (sekarang), generik
  bisa dipakai tab/subtab lain ke depan kalau perlu akses "salah satu dari beberapa page_key".
- **Cross-navigation internal TETAP JALAN PERSIS SEPERTI SEBELUMNYA** (kartu/chart Dashboard ->
  scroll+blink ke baris vessel di Cost per Vessel, tombol "Back to Dashboard") — SEMUA link
  hardcode `/reporting/cost-per-vessel`/`/reporting/dashboard` di KEDUA komponen anak diarahkan
  ulang ke route gabungan + `?view=...` (param lama mode/year/month/tab/highlight TETAP dikirim
  apa adanya, dibaca komponen anak masing2 lewat `useSearchParams()`-nya sendiri karena berbagi
  URL yang sama — TIDAK ADA props baru yang perlu di-thread antar 2 komponen). `CostByVesselPage.tsx`
  baca `?view=` via `useEffect` (bereaksi ke navigasi internal dari komponen anak) + tombol tab
  manual (`switchTab()`, update state DAN `setSearchParams` sekaligus supaya URL & tab selalu
  sinkron dua arah).
- Kedua komponen anak TETAP py `document.title` sendiri-sendiri (`useEffect([])` masing2) —
  `CostByVesselPage.tsx` set "Cost by Vessel · BeeHive" duluan saat mount awal, TAPI effect
  komponen ANAK jalan lebih dulu dari effect PARENT tiap commit (urutan React: child effects
  duluan) jadi title akhirnya balik ke title spesifik tab yang lagi aktif setiap kali pindah tab
  — DITERIMA sebagai perilaku wajar (title tetap relevan menunjukkan tab mana yang aktif),
  BUKAN bug, tidak perlu "dipaksa" selalu "Cost by Vessel" kalau tidak diminta eksplisit.

**Susulan (2026-09) — tab bar dirapikan + header dikonsolidasi**: laporan user "tab jelek, ada
border putih, harusnya di bawah keterangan halaman" (versi awal taruh tab bar `border-b-2` mirip
tab browser TERPISAH DI ATAS masing2 komponen anak yang MASIH py header bawaan sendiri —
hasilnya dobel header + tab strip kelihatan norak nempel di background gradient). Fix:
- `ReportingDashboardPage`/`ReportingCostPerVesselPage` sekarang terima prop opsional
  **`embedded?: boolean`** — kalau `true`, blok `<header>` bawaan (ikon+judul+deskripsi+
  `<Greeting/>`) DISKIP total, SISANYA (`<main>` ke bawah, SEMUA logic/state/tampilan) TIDAK
  disentuh sama sekali. Prop ini generik (default `undefined`/falsy) — dipanggil TANPA prop di
  tempat lain manapun (kalau ada) akan tetap render header seperti biasa, tidak ada breaking
  change.
- `CostByVesselPage.tsx` sekarang py **1 header sendiri** (pola "Header halaman" standar,
  ikon `Ship`, judul "Cost by Vessel") + **tab bar pill button polos** tepat di bawah
  judul+deskripsi (`bg-[#5A305A] text-white` aktif / `bg-white text-[#5A305A]/70` non-aktif,
  TANPA border/garis pemisah apa pun — pola sama tombol toggle `viewMode` di
  `ReportingCostPerVesselPage.tsx`), lalu render komponen anak dengan `embedded` (menghilangkan
  header duplikat mereka).

### REVISI "Overseas Cost by Vessel" (2026-09, lanjutan) — rename, bulan Inggris, IDR di kartu,
Trend ikut periode, freeze filter, pindah tombol, shading kolom akumulasi

Permintaan user terstruktur ("Revisi menu Overseas Cost by Vessel"). Tidak ada perubahan
rumus/angka apa pun — MURNI penamaan, penataan filter/tombol, penyesuaian tampilan trend, dan
pewarnaan kolom. Semua di bawah SUDAH diimplementasikan, `npx tsc --noEmit` + `npm run build`
bersih.

**Umum**:
- **"Cost by Vessel" -> "Overseas Cost by Vessel"** — label menu sidebar (`MainLayout.tsx`,
  entri `reporting_cost_by_vessel`), `<h1>` + `document.title` + teks pesan "Tidak Ada Akses"
  di `CostByVesselPage.tsx`. Sub-judul TIDAK berubah ("Cost summary per vessel — Courier, Sea,
  Air, FAR Overseas"). `PAGE_REGISTRY` label ("Dashboard (Reporting)"/"Cost per Vessel", dipakai
  matrix Kelola Role & Akses) SENGAJA TIDAK ikut diubah — di luar cakupan (bukan halaman itu
  sendiri, murni label administratif).
- **Tab "Reporting Dashboard" -> "Dashboard"** — label tombol tab di `CostByVesselPage.tsx`,
  DAN (utk konsistensi, tidak diminta eksplisit tapi disamakan) `<h1>`/`document.title` internal
  `ReportingDashboardPage.tsx` (hanya kepakai saat `!embedded`, tapi title efeknya tetap jalan
  duluan lalu ketimpa CostByVesselPage — lihat catatan lama "child effect run after parent").
- **Nama bulan ke Inggris di SELURUH halaman ini** (2 file: `ReportingDashboardPage.tsx`,
  `ReportingCostPerVesselPage.tsx`) — `MONTH_NAMES` (dulu Indonesia "Jan/Feb/Mar/Apr/Mei/Jun/
  Jul/Agu/Sep/Okt/Nov/Des") jadi "Jan/Feb/Mar/Apr/May/Jun/Jul/Aug/Sep/Oct/Nov/Dec" di KEDUA file.
  `MONTH_NAMES_ID_FULL` (`ReportingCostPerVesselPage.tsx`, dipakai label kolom Periodic View
  Monthly "JANUARI 2026" dst) di-rename `MONTH_NAMES_FULL` + isi Inggris ALL-CAPS ("JANUARY"
  dst). `MONTH_NAMES_FULL` di `ReportingDashboardPage.tsx` (dipakai `comparePeriodLabel`) SUDAH
  Inggris dari awal, tidak perlu diubah. `MasterVesselAdminPage.tsx` TETAP TIDAK ikut (pengecualian
  lama, lihat bagian "Tab Sea & Air digabung..." di atas).

**Tab Dashboard** (`ReportingDashboardPage.tsx`):
- **Nilai IDR dalam kurung di samping %** — 3 kartu nominal (Total Cost/Total Cost Excl.
  PPN+PPH/Total PPN+PPH) tampilkan selisih NOMINAL (`cur - prev`, nilai absolut) setelah teks
  %, format `fmtIdrAbs()` = `"IDR {angka}"` (prefix "IDR", BEDA dari `fmtRp()` yang prefix "Rp"
  — literal sesuai contoh user `(IDR 2.530.110.000)`/`(IDR 0)`). "Highest Vessel Cost" TETAP
  TIDAK tampilkan % ataupun IDR ini (sudah dari awal tidak pakai %, konsisten).
- **Monthly Trend — angka ditampilkan di sisi kiri tiap bar** (`VerticalBarChart`) — SEBELUMNYA
  angka cuma muncul di tooltip (`title` attr) saat hover, sekarang SELALU tampil sebagai teks
  vertikal (`writing-mode: vertical-rl` + `rotate(180deg)` supaya terbaca bawah-ke-atas
  mengikuti arah tumbuh bar) di sebelah kiri tiap bar, anchor ke dasar kolom (sejajar `items-end`
  parent). Nominal SELALU penuh (BUKAN singkatan — konsisten aturan lama halaman ini yang sudah
  menghapus total `fmtRpShort`).
- **Trend MENGIKUTI `periodMode` aktif** (GANTI TOTAL dari versi lama yang SELALU tampil 12
  bulan tahun `year` terlepas pilihan filter) — Monthly: 12 bulan penuh tahun `year` (SAMA
  seperti sebelumnya); Quarterly: 4 bar "Jan-Mar"/"Apr-Jun"/"Jul-Sep"/"Oct-Dec" (agregasi
  `filteredYearRows` per kuartal via `Math.ceil(month/3)`); Yearly: multi-tahun (`trendYears`,
  RENTANG SAMA dgn dropdown filter Year — `todayYear-3`..`todayYear+2`, 6 tahun) — butuh FETCH
  TERPISAH (`yearlyTrendRows`, via `fetchAllocationRowsByMonths(trendYears.flatMap(monthsOfYear))`,
  effect BARU yang HANYA jalan saat `periodMode==='YEARLY'` supaya tidak query 6-tahun penuh
  kalau tidak perlu — `yearRows`/`prevRows` yang SUDAH ADA cuma cakup 1-2 tahun, tidak cukup utk
  trend multi-tahun). Panel judul ikut dinamis: "Monthly Trend (Y)"/"Quarterly Trend (Y)"/
  "Yearly Trend" (tanpa tahun, krn spans multi-tahun). Klik bar (`onBarClick`) disesuaikan per
  mode: Monthly -> bulan itu; Quarterly -> bulan PERTAMA kuartal itu; Yearly -> tahun itu (bulan
  dibiarkan bulan berjalan saat ini, BUKAN presisi "1 tahun penuh" — batasan diterima, di luar
  cakupan revisi deep-link).
- **Cost by Category label "All-In Import" -> ikut dropdown method (`METHOD_LABEL.BORONGAN` =
  "FAR Ovs")** — `perJenisBiaya` array literal `'All-In Import'` diganti referensi
  `METHOD_LABEL.BORONGAN` (dinamis, otomatis ikut kalau `METHOD_LABEL` berubah lagi ke depan,
  BUKAN hardcode string kedua kalinya). Value data (`curSums.borongan_total`) TIDAK berubah.
- **Freeze baris filter atas** — kartu filter (Monthly/Quarterly/Yearly | Bulan | Tahun | All
  Method) dikasih `sticky top-0 z-20 bg-white` (relatif scroll container `pageScrollRef` yang
  membungkus `<header>`+`<main>`) — `bg-white` WAJIB eksplisit (bg asal transparan) supaya
  konten yang discroll di baliknya tidak tembus pandang. Halaman ini TETAP scroll penuh (BEDA
  dari Cost per Vessel yang sudah "shell tinggi tetap" — filter di situ MEMANG sudah selalu
  terlihat karena `shrink-0` di luar area scroll, poin freeze ini KHUSUS relevan utk Dashboard).

**Tab Cost per Vessel** (`ReportingCostPerVesselPage.tsx`):
- **Checkbox "Show zero-cost" & tombol "Collapse All" DIPINDAH** dari filter bar atas (sejajar
  dropdown Year/Month) ke toolbar kartu tabel, sejajar tombol Summary View/Periodic View (kanan,
  `ml-auto`). State (`showZeroCost`/`collapsedGroups`) & logic filter/collapse TIDAK berubah,
  murni pindah lokasi elemen JSX-nya.
- **2 kolom akumulasi paling kanan (Total Cost/Excl PPN+PPH) di Periodic View diberi latar
  abu-abu agak gelap** (`bg-slate-200/70`) — diterapkan di 3 tempat: header 2-tingkat (kedua
  `<th rowSpan={2}>`), body `renderNumericCells` (baris vessel & subtotal, 2 `<td>` terakhir),
  DAN baris header grup (placeholder `<td>` kosong, kondisional `i >= numericColCount - 2` DAN
  `viewMode==='PERIODIC'` saja) — supaya garis kolom abu-abu itu terlihat MENERUS dari header
  sampai body, bukan cuma di sebagian baris. **Baris GRAND TOTAL (`<tfoot>`) SENGAJA TIDAK ikut**
  — seluruh barisnya sudah 1 warna ungu solid (`bg-[#5A305A]`), menambah shading di situ tidak
  akan kelihatan beda & berisiko malah kelihatan aneh. Berlaku HANYA saat `viewMode==='PERIODIC'`
  (Summary View tidak punya konsep "kolom akumulasi vs kolom periode", tidak relevan).

### Yang belum dikerjakan / gap yang diketahui

Belum ada testing menyeluruh dgn data production 1 tahun penuh (baru dites recompute 1 bulan,
sudah lolos setelah 2 bug ditemukan & diperbaiki); vessel SCRAP yg baru discrap TENGAH BULAN
tidak bisa ditampilkan granular (toggle "Sembunyikan SCRAP" buang seluruh biaya bulan itu, tidak
cuma sebagian sebelum tanggal scrap). Klik bar Trend Quarterly/Yearly di Dashboard arah ke Cost
per Vessel dgn presisi bulan yang tidak sepenuhnya akurat (lihat poin "Trend MENGIKUTI periodMode"
di atas) — di luar cakupan revisi ini, bisa disempurnakan kalau diminta.

## Overseas Cost by Courier — halaman BARU di menu Reporting (`ReportingCostByCourierPage.tsx`, 2026-09)

Submenu ke-2 di bawah "Reporting" (sejajar "Overseas Cost by Vessel", TIDAK digabung 1 halaman —
route/page_key sendiri: `/reporting/cost-by-courier`, `reporting_cost_by_courier`). **Sumber data
`rekapan_courier` (Invoice Recap Courier) — TERPISAH TOTAL dari modul "Overseas Cost by Vessel"**
(`reporting_cost_allocation`/`master_vessel`, lihat bagian besar di atas) — TIDAK ada overlap
kode/logic sama sekali, "duplikasi sengaja" pola sama modul Reporting lain.

**File**: `src/utils/ReportingCourierHelpers.ts` (SATU-SATUNYA tempat fetch/agregasi — kalau
formula berubah, ubah DI SINI), `src/pages/ReportingCostByCourierPage.tsx` (UI).

**PENTING — kolom sumber**: SEMUA angka biaya dari kolom UTAMA `rekapan_courier`
(`courier_adm_fee`, `total_freight`, `bm`, `ppn`, `pph`, `total_amount`, `total_duty_tax`).
Kolom `breakdown_*_vessel` (`breakdown_courier_adm_vessel` dkk, milik modul Cost by Vessel, hasil
bagi rata per-vessel) **SENGAJA TIDAK PERNAH dipakai di halaman ini** — permintaan eksplisit user.

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu, kalau tidak halaman ini
akan tampil KOSONG utk user yang punya akses `reporting_cost_by_courier` tapi TIDAK punya akses
`courier_rekapan`** (RLS `rekapan_courier` SELECT existing di-gate `has_page_access('courier_rekapan')`
saja — policy BARU ini menambah alternatif akses via OR, TIDAK mengganti/menghapus policy lama):
```sql
create policy "rekapan_courier_select_reporting_cost_by_courier" on public.rekapan_courier
  for select using (public.has_page_access('reporting_cost_by_courier'));
```

**Aturan distinct count (Freight & Duty jadi 2 baris terpisah per AWB di recap → dobel kalau
naif)** — `stripAwbCarrier()` (regex diperluas dari pola `awb_strip_carrier` di
`SharedDataTable.tsx`, DHL|FEDEX|UPS) dipakai SEMUA hitungan distinct:
- **AWB/Shipment distinct** — `Set` dari AWB yang sudah di-strip prefix carrier.
- **PO distinct** — `po_pt_imi` + `po_shipping` di-split `+` (pola sama `vessel`/breakdown lain
  di tabel ini), suffix `"(N)"` (PO partial, mis. `...0001(1)` vs `...0001(2)`) DIBUANG sebelum
  dedup (`normalizePoKey()`) — 2 partial dianggap 1 PO, sesuai permintaan eksplisit user.
- **Weight distinct** — `distinctWeightMap()`/`distinctWeightTotal()`: ambil `weight_kg` baris
  PERTAMA per AWB unik (BUKAN SUM semua baris — weight_kg SAMA di baris Freight & Duty utk 1
  AWB, kalau dijumlah polos jadi 2x lipat).
- Sum KOMPONEN BIAYA (Total Cost/Freight/Courier Adm/BM/PPN/PPH/Total Duty Tax) TIDAK di-dedup —
  SUM semua baris apa adanya (baris Freight & Duty memang 2 catatan biaya berbeda, keduanya sah
  dijumlah).

**Filter PPJK — meeting-mode (SESUAI SPEK, bukan filter recompute biasa)**: `selectedPpjk`
(`Set<string>`, kosong = "All") HANYA memfilter data yang DITAMPILKAN kartu/breakdown/detail
table (`currentRowsSelected`), TAPI donut & persentase card SELALU dihitung terhadap
`sumsAll`/`ppjkTotals` (SEMUA PPJK, TIDAK terfilter) sebagai penyebut — 1 PPJK terpilih TIDAK
PERNAH "dinormalisasi ulang jadi 100%". Donut `dimmed` (abu-abu, `#E2E8F0`) utk slice yang TIDAK
termasuk seleksi, tapi TETAP di posisi/ukuran ASLI-nya dalam lingkaran (bukan dihapus/di-reflow) —
inti "meeting-mode": klik FedEx di dropdown PPJK -> card jadi "IDR 1,5 M (70.0% dari total)",
donut FedEx tetap slice 70% di posisi aslinya, sisanya abu kosong (BUKAN redraw donut jadi 100%
FedEx). Trend chart, Breakdown Komponen Biaya, Detail Data tables, Data Performance — SEMUA ikut
`selectedPpjk` yang sama (filter, bukan filter+renormalize).

**Periode**: `PeriodMode` (`MONTHLY`/`QUARTERLY`/`YEARLY`) + tahun + bulan/kuartal — SINGLE-select
(BEDA dari Cost per Vessel yang multi-select tahun/bulan) krn halaman ini fokus 1 periode
"current" + 1 "previous" utk kartu %, bukan agregasi bentang banyak periode sekaligus. Fetch
efisien: `yearRows`/`prevYearRows` (2 query MAKS, cuma 1 kalau tahun current & previous SAMA —
pola sama `ReportingDashboardPage.tsx`) ambil SATU TAHUN PENUH, lalu `currentRows`/`previousRows`
dipotong client-side via `periodRange()` — Trend chart (SELALU Jan-Dec tahun `year` terpilih,
terlepas `periodMode`, pola sama Cost by Vessel Monthly Trend versi lama) langsung reuse
`yearRows` yang sama, TIDAK fetch ulang.

**Data Performance (di dalam By Weight Range)** — `perfMode` (`MTM`/`QTQ`/`YOY`) menentukan
`perfPeriodMode`+jumlah kolom (`perfCount`: 6 bulan / 4 kuartal / 3 tahun) dari periode SEKARANG
mundur ke belakang (`buildPeriodSeries()`). **Fetch TERPISAH** (`perfRowsByPeriod`, N query
paralel via `Promise.all`, N=perfCount) — BUKAN reuse `yearRows` krn bisa melintasi tahun
(mis. MTM 6 bulan dari Sep mundur ke Apr, atau YoY 3 tahun). Kolom "Total" = SUM/agregasi ulang
dari GABUNGAN seluruh baris N periode (bukan cuma jumlah kolom-kolom yang sudah ditampilkan) --
Shipment/Weight distinct di kolom Total dihitung ulang dari gabungan baris (`perfTotal`, BUKAN
sum naif kolom AWB-distinct per periode yang bisa dobel-hitung AWB yang sama muncul di >1 periode
kalau shipment-nya lintas tanggal — batasan diterima, jarang terjadi krn 1 AWB biasanya 1 tanggal
terima email).

**PT dropdown — KETERBATASAN DIKETAHUI**: spek minta "dropdown tampilkan NAMA PT, A/N sebagai
kunci" — TIDAK ADA sumber data pemetaan kode `an` (mis. "IMI"/"WNS"/"GMI") ke nama PT lengkap
yang bisa dipakai dgn percaya diri utk `rekapan_courier` (LOGO_ASSETS di `FarOverseasAirHelpers.ts`
cuma peta kode->logo gambar, bukan nama; `far_overseas_signer_config.company_name_full` scoped ke
modul FAR Overseas, TIDAK ada jaminan kode-nya funtuk konsisten dgn kode `an` Courier). Dropdown
"PT" SAAT INI menampilkan kode `an` mentah apa adanya sbg label DAN value (`fetchDistinctAn()`,
query distinct langsung ke `rekapan_courier`) — **BELUM sesuai spek "tampilkan nama PT"**, perlu
sumber pemetaan resmi (tabel master baru, atau konfirmasi apakah `far_overseas_signer_config`
memang boleh dipakai lintas modul) sebelum bisa diperbaiki — MINTA DIKONFIRMASI kalau mau
diselesaikan.

**Header ikon halaman** — DIGANTI (2026-09, laporan user "samakan dgn halaman lain") dari coral
`ACCENT` (`#F58C77`) ke ungu brand `bg-[#5A305A]` (pola "Header halaman" standar CLAUDE.md,
sama semua halaman lain). Toggle sub-tab (By PPJK/Origin/Weight Range) & tombol `perfMode`
(MTM/QTQ/YoY) di Data Performance JUGA disamakan ke `bg-[#5A305A]` saat aktif (dulu ikut
`ACCENT`). `ACCENT` (coral) TETAP dipakai KHUSUS sbg warna bar/line chart (Breakdown Freight bar,
Trend line, HBar Origin/Weight) — itu bukan elemen UI interaktif, konsisten dgn pola modul
Reporting lain yang tiap chart py warna aksen sendiri (mis. `#D97706` Cost by Category,
`#0284C7` Cost per Fleet Group di `ReportingDashboardPage.tsx`).

**Export — preview mirror PERSIS + header berwarna (2026-09, susulan)** — 2 perubahan:
1. **Modal preview digantI TOTAL** dari teks deskripsi singkat jadi TABEL SUNGGUHAN yang me-mirror
   isi file Excel (Summary/Component/Detail table, header ungu `#5A305A` sama persis dgn yang
   nanti ditulis ke Excel) — `activeDetailRows`/`activeDetailTitle`/`activeDetailNameLabel`/
   `activeHideWeightPo` (variable BARU, dihitung SEKALI dari `viewMode` yang aktif) jadi SATU
   SUMBER dipakai KEDUA tempat (preview modal DAN `handleExport()`) supaya tidak pernah beda.
   Detail table di preview dibatasi 15 baris pertama (+ pesan "showing first N of M rows — file
   Excel tetap berisi SEMUA baris") — pola sama preview export di `ReportingCostPerVesselPage.tsx`.
2. **Nominal di Excel ditulis sbg TEKS YANG SUDAH DIFORMAT** (`fmtIdr()` = "IDR 1.503.385.576",
   `weight.toLocaleString('id-ID')` dst) — **BUKAN angka mentah + number format Excel** (versi
   AWAL, laporan user "kok di Excel cuma 312137179 polos, weight malah 'lucu' jadi '1158,1'").
   Root cause versi awal: `ws.addRow([..., sumsSelected.totalCost])` menulis NILAI NUMERIK
   mentah tanpa format cell sama sekali — Excel menampilkannya sesuai locale sistem PENERIMA
   file (bisa beda2, bukan "IDR" + titik pemisah ribuan spt di aplikasi). Fix: SEMUA sel nominal
   ditulis sbg string HASIL `fmtIdr()`/`toLocaleString('id-ID')` yang SAMA PERSIS dgn yang
   dirender di layar aplikasi — dijamin identik apa pun locale sistem penerima file, krn sudah
   jadi teks tetap (bukan angka yang diformat ulang oleh Excel).
3. **Header tabel di file Excel diberi warna** — `styleHeaderRow(row)` (helper BARU di
   `handleExport()`, dipakai berulang tiap tabel: Summary/Component/Detail) — fill solid
   `FF5A305A` (ungu brand) + font putih tebal, ExcelJS `row.eachCell(c => {c.fill=...;
   c.font=...})`. Judul halaman (`titleRow`) dapat `font: {bold:true,size:14,color:'FF5A305A'}`
   (teks ungu, BUKAN fill background — beda styling dari header tabel, biar tidak "terlalu
   penuh warna").

**Bug ditemukan & diperbaiki — chart "Shipment" (By Weight Range) salah tampil format Rupiah**
(2026-09, laporan user + screenshot) — `HBar` (komponen chart bar horizontal generik, dipakai
juga utk By Origin & Cost by Weight Range) HARDCODE `fmtIdr()` utk label nilai, padahal chart
"Shipment" di By Weight Range nilainya JUMLAH shipment (angka biasa, bukan nominal) — tampil
salah "IDR 14" dst. Fix: `HBar` terima prop opsional `formatValue` (default `fmtIdr`, dipakai
apa adanya oleh chart Cost & By Origin yang MEMANG nominal) — pemanggilan chart Shipment di By
Weight Range kirim `formatValue={n => n.toLocaleString('id-ID')}` (angka polos, tanpa prefix).

**Belum diimplementasikan / gap diketahui**: Weight Range breakpoint (0-5/5-25/25-70/70-150/>150)
HARDCODE di `WEIGHT_RANGES` (`ReportingCourierHelpers.ts`), belum ada UI utk mengubahnya;
Conclusion box teksnya template string sederhana (bukan AI-generated), cukup utk insight dasar
meeting tapi tidak sedalam analisis manual.

### REVISI BESAR "Overseas Cost by Courier" (2026-09, susulan)

Permintaan user terstruktur ("Prompt Revisi: Overseas Cost by Courier"). Semua poin di bawah
SUDAH diimplementasikan dalam 1 sesi, `npx tsc --noEmit` + `npm run build` bersih.

**1. Nama PPJK — buang prefix "OWN"** — `normalizePpjk()` (fungsi BARU, SATU-SATUNYA tempat,
`ReportingCourierHelpers.ts`) strip `/^OWN\s+/i` dari `r.ppjk` — "OWN FEDEX"/"OWN DHL" digabung
jadi "FEDEX"/"DHL". Dipakai di SEMUA titik yang baca `r.ppjk`: `fetchDistinctPpjk()` (dropdown),
grouping donut/detail table, filter `selectedPpjk`. "OWN" TIDAK PERNAH tampil di visual mana pun.

**2. Dropdown Bulan & Tahun jadi multi-select** — GANTI TOTAL dari single `year`/`month`/`quarter`
ke `selectedYears`/`selectedMonths` (`Set<number>`, pola SAMA persis `ReportingCostPerVesselPage.tsx`
— bulan kosong = seluruh 12 bulan tahun terpilih). `buildSelectedPeriods()` (helper BARU) =
cartesian product tahun x bulan, SATU-SATUNYA sumber resolusi periode (fetch DAN kolom
Trend/Data Performance). **"Periode sebelumnya" utk kartu %** — diambil dari periode PALING AWAL
di antara yang terpilih (`earliestPeriod`), mundur 1 unit sesuai `periodMode` (`previousPeriod()`)
— keputusan desain (BUKAN diminta eksplisit persis begini di prompt, tapi paling masuk akal utk
multi-select): kalau user pilih Agu+Sep 2026, kartu % membandingkan TOTAL (Agu+Sep) vs Jul 2026
(1 bulan sebelum Agu, bukan 2 bulan). **Cache per tahun** (`yearsData: Map<year, CourierRow[]>`,
di-fetch SEKALI per tahun+filter PT, dipakai ulang tiap ganti bulan/kuartal dalam tahun yang
sama) — GANTI dari fetch per-request lama.

**3. Data Performance dipindah keluar dari tab, jadi section SELALU tampil** — di bawah Breakdown
Komponen Biaya, DI ATAS sub-toggle By PPJK/Origin/Weight Range (BUKAN lagi di dalam tab By Weight
Range). Ikut dropdown periode UTAMA (`periodMode`+`selectedYears`+`selectedMonths`) — tombol
internal Month-to-Month/Quarter-to-Quarter/Year-to-Year (`perfMode`, dulu fetch N-periode
terpisah via `buildPeriodSeries`) **DIHAPUS TOTAL** (fungsinya sekarang duplikat dgn dropdown
`periodMode` di atas). Kolom Data Performance SEKARANG reuse `periodColumnRows` (SUMBER SAMA
dgn Trend chart — `buildPeriodColumns()`, SATU-SATUNYA tempat hitung kolom periode) — TIDAK ADA
lagi fetch terpisah utk Data Performance (`perfRowsByPeriod`/N-query paralel versi lama DIHAPUS).
**Baris DIPANGKAS** dari 8 jadi 4: Shipment Growth %, Weight Growth %, Total Shipment (AWB
distinct), Total Weight — baris Total Freight/Total Duty Tax/Courier Adm Fee/Sum of Total Amount
DIHAPUS (sudah terwakili di Breakdown Komponen Biaya).

**4. "Show zero-cost" (BARU, pola sama Cost per Vessel)** — checkbox di filter bar, default
TIDAK dicentang (baris PPJK/Origin/Weight Range bernilai nol DISEMBUNYIKAN). Saat dicentang:
- **By PPJK** — universe jadi `selectedPpjk` (kalau ada seleksi) atau SEMUA `ppjkOptions`
  (kalau "All"), diseed nol dulu sebelum diisi dari data — PPJK yang TIDAK muncul sama sekali
  di data periode itu tetap tampil baris 0.
- **By Origin** — universe = `originOptions` (fetch BARU, `fetchDistinctOrigin()`).
- **By Weight Range** — SUDAH otomatis selalu 5 bucket tetap (`WEIGHT_RANGES`), toggle ini cuma
  MENYARING (bukan menambah) — saat TIDAK dicentang, bucket dgn cost=0 & shipment=0 disaring
  dari tampilan bar/detail table (`weightBuckets` = filtered dari `weightBucketsFull`).
Donut PPJK & By Origin ikut aturan yang sama (entries dgn value 0 disaring saat toggle OFF).

**5. Export mencakup SEMUA tabel termasuk Data Performance** — `handleExport()` sekarang tulis
section Data Performance juga (baris Total Shipment/Total Weight per kolom periode + Total),
sebelumnya cuma Summary/Component/Detail table.

**A. Card Shipment/PO** — format teks diganti `"{N} shipment / {M} PO"` (huruf kecil, sesuai
contoh user), dari sebelumnya `"{N} / {M}"` polos.

**B. Breakdown Komponen Biaya — GANTI TOTAL dari bar chart ke list vertikal** (`ComponentLine`,
komponen BARU) — tiap baris: label, nilai (`fmtIdr`), lalu %+arah+nilai periode sebelumnya dlm
kurung (persis gaya kartu ringkasan) — `Freight : IDR … — ▲12.4% vs Aug 2026 (IDR …)`. Komponen
lama `ComponentBar` (bar horizontal) DIHAPUS TOTAL dari file.

**D. Detail Data — kolom diseragamkan utk KETIGA tab** (By PPJK/Origin/Weight Range, dulu Weight
Range cuma py "Total Cost"+"Shipment"): `Freight | Courier Adm Fee | BM | PPN | PPH | Total Cost
| Total Excl. PPN+PPH | Shipment | PO` (9 kolom data + No + Nama = 11 kolom total, tabel lebar
dgn scroll horizontal). `DetailTable` (komponen) di-refactor total, prop `hideWeightPo`
(versi lama) DIHAPUS — Weight Range SEKARANG hitung Freight/Courier Adm/BM/PPN/PPH/PO per bucket
juga (sebelumnya cuma Cost+Shipment) via `weightBucketsFull` yang sekarang kumpulkan `rows`
per bucket (bukan cuma `sums`) supaya `distinctPoCount()` bisa dihitung. Kolom "Weight" DIHAPUS
dari Detail Data (tidak ada di spek kolom seragam baru — tetap ada di card/bar chart lain,
cuma bukan di tabel Detail Data).

**E. Donut PPJK — "Others" gabungan (GANTI dari versi lama "tiap PPJK non-terpilih dimmed
satu-satu")** — saat 1+ PPJK dipilih: slice PPJK terpilih tampil nama+%+cost di posisi ASLI
(proporsi thd grand total SEMUA PPJK, TIDAK dinormalisasi ulang — perilaku meeting-mode LAMA
tetap dipertahankan), TAPI SEMUA PPJK lain yang TIDAK dipilih digabung jadi **1 slice "Others"**
abu-abu (`OTHERS_COLOR = '#E2E8F0'`) — legend cuma tampil "Others" + % (TANPA cost, TANPA nama
PPJK individual di baliknya). Saat "All PPJK" (tidak ada seleksi): semua PPJK tampil terpisah
nama+%+cost seperti biasa (TIDAK berubah). `Donut` komponen prop `dimmed` (per-segment) DIGANTI
`isOthers` (cuma 1 segment yang bisa `isOthers`, bukan banyak segment `dimmed` independen).

**Tab By Weight Range — 2 tambahan**:
- **Card "Highest Range (Shipment)"** (BARU, mirip referensi Power BI user) — bucket dgn
  `shipment` TERBANYAK (`highestRangeBucket`, dari `weightBucketsFull` UNFILTERED — supaya
  akurat terlepas status toggle Show Zero Cost), tampilkan label range + "{N} shipment / {M} kg".
- **Bar Shipment dgn info berat** — `ShipmentWeightBar` (komponen BARU, GANTI `HBar` generik utk
  chart ini) — label tiap bar `"{N} Shipment / {M} Kg"` (2 angka sekaligus, `HBar` biasa cuma
  bisa 1 angka via `formatValue`). Chart Cost tetap pakai `HBar` biasa (1 angka, format Rupiah).
  Weight per bucket (`weightBucketsFull[].weight`) dihitung dari `distinctWeightMap()` (weight
  per AWB unik, BUKAN sum baris — sama aturan distinct yang sudah ada), dijumlah per bucket via
  `Set` AWB-per-bucket supaya 1 AWB (kalau py >1 baris Freight/Duty) tidak dobel-hitung
  weight-nya di bucket itu.

**Aturan distinct — TETAP, tidak berubah** (PO gabung PT IMI+Non IMI, partial `(1)`/`(2)`=1 PO;
Shipment & Weight dari AWB distinct, weight_kg diambil 1x per AWB bukan di-sum).

**Bug ditemukan & diperbaiki — kolom "Weight Range" di Detail Data (By Weight Range) tampil
KOSONG** (2026-09, laporan user + screenshot) — `weightBucketsFull` (sumber `weightBuckets`/
`activeDetailRows` utk tab ini) sempat mengisi field nama bucket sbg `label` (mis. `{label:
rg.label, sums, ...}`), padahal `DetailTable`/`DetailRow` (generik, dipakai KETIGA tab By
PPJK/Origin/Weight Range) baca field `name`. Nama kolom "Freight"/"BM"/dst tetap terisi
(field-field itu namanya sama), TAPI kolom "Weight Range" (dari `r.name`) selalu `undefined` ->
kosong. **TypeScript tidak menangkap ini** krn `weightBucketsFull` tidak diberi anotasi tipe
eksplisit `DetailRow[]` di titik deklarasinya (`useMemo` infer tipe bebas dari object literal
internal) — assignment ke `activeDetailRows: DetailRow[]` baru dicek belakangan & entah kenapa
tidak flag error (union-type inference quirk). Fix: (1) field diganti `name` (bukan `label`,
titik ganti SATU-SATUNYA sumber di `WEIGHT_RANGES.map(...)`), 3 titik pemakaian lain yang masih
baca `.label` ikut diperbaiki (`highestRangeBucket.name`, chart `HBar`/`ShipmentWeightBar`
mapping, teks Conclusion); (2) `weightBucketsFull` SEKARANG diberi anotasi tipe eksplisit
`(DetailRow & { weight: number })[]` di `useMemo` — supaya kalau field ini salah nama lagi ke
depan, `tsc --noEmit` LANGSUNG menangkapnya sebelum sempat jadi bug runtime seperti ini.

## Peta tabel Supabase (per modul)

**Auth & RBAC**: `profiles`, `roles`, `user_roles`, `role_page_access`.

**Courier**: `rekapan_courier`, `tabel_audit_pib`, `tabel_audit_cn`, `tabel_cost_validasi`,
`dokumen_checklist`, `dokumen_validasi`, `tabel_checklist_validasi`, `tabel_npwp`,
`tabel_processing_queue`. View `v_pib_lengkap`/`v_cn_lengkap` MASIH ADA tapi TIDAK DIPAKAI lagi
di frontend — Audit Courier sekarang query langsung `tabel_audit_pib`/`tabel_audit_cn`, kolom
kelengkapan di-merge manual di JS dari `dokumen_checklist` via `mergeChecklistData()` (cocokkan
`pib_id`/`cn_id`=`id`; cabang fallback `awb`-only lama sudah dead code, dicek 0 baris NULL).

**Sea & Air**: `rekapan_seaair`, `tabel_audit_seaair`, `cost_validasi_seaair`,
`dokumen_checklist_seaair`, `dokumen_validasi_seaair`, `dokumen_validasi_matriks_seaair`,
`kurs_bi_seaair`, `kurs_rule_vendor_seaair`, `tarif_kontrak_seaair`.

**FAR Overseas Air (Direct Loading)**: `rekapan_far_overseas_air`,
`cost_validasi_far_overseas_air`, `far_overseas_tarif_vendor`, `far_overseas_signer_config`,
`far_overseas_air_processing_queue`.

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

- Auth: `get_my_access()`, `get_my_approval_tiers()`.
- FAR Overseas Air: `update_rekapan_far_overseas_manual`,
  `update_cost_validasi_far_overseas_manual`, `fn_delete_far_overseas_air`,
  `upsert_tarif_far_overseas_vendor`, `nonaktifkan_tarif_far_overseas_vendor`,
  `approve_far_overseas_air`, `reject_far_overseas_air`, `get_users_with_approval_tier`.
- Sea & Air: `insert_seaair_row`, `update_seaair_row`, `update_rekapan_po_vessel`,
  `update_validasi_matriks_manual`, `update_cost_validasi_manual`, `get_kurs_efektif`,
  `upsert_kurs_rule_vendor`, `upsert_kurs_bi`, `nonaktifkan_tarif_kontrak`.
- Courier cost validation (`CostValidationModal.tsx`): `fn_hitung_storage`,
  `fn_save_storage_estimate`, `fn_update_actual_value`, `fn_apply_credit_note`,
  `fn_recompute_totals`, `fn_revise_credit_note`.

Tidak ada akses DB langsung dari sesi Claude Code manapun — daftar di atas disimpulkan dari
pemanggilan kode frontend, BUKAN `information_schema` Supabase. Kalau ragu soal signature/param
exact suatu RPC (terutama param baru dari sisi frontend), cek dulu di Supabase SQL editor
sebelum ubah pemanggilannya.
