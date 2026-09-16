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

## Courier — Document Validation tombol Checklist "Upload Additional Doc" — lihat bagian tersendiri di atas.

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

**`HorizontalBarChart` — HTML, BUKAN SVG lagi** (v1 pakai `<div>` width%, v2 diganti SVG manual
dgn label dipotong paksa `.slice(0,19)+'…'` kalau >20 karakter — laporan user "nama vessel
kepotong titik-titik" krn SVG `<text>` TIDAK BISA wrap multi-baris tanpa hitung lebar per-
karakter manual). v3 FINAL: kembali ke HTML (`<div>` flex row: label `w-48 break-words` + bar
`flex-1` + nilai `w-44` kanan) — label SELALU tampil PENUH, membungkus (wrap) ke baris
berikutnya kalau kepanjangan, TIDAK PERNAH dipotong/`...` lagi. Tooltip native via atribut HTML
`title` (pengganti `<title>` SVG). `VerticalBarChart` (Monthly Trend) TETAP SVG (label bulan
pendek/tetap, tidak kena masalah yg sama).

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

### Chart Dashboard — upgrade dari `<div>` width% ke SVG manual (2026-09)

`HorizontalBarChart`/`VerticalBarChart` (komponen lokal `ReportingDashboardPage.tsx`, BUKAN
library chart — konsisten pola SVG manual yg sudah dipakai `AuditPoPage.tsx` DashboardModal).
Dipakai section 3 (Top Vessel)/4 (Per Jenis Biaya)/5 (Per Fleet Group) — horizontal — & section 6
(Tren Bulanan) — vertical, dgn gridline. Tooltip pakai `<title>` SVG native (hover browser
bawaan, bukan tooltip custom JS) — nampilkan label+nilai persis saat hover bar. Klik-through ke
Cost per Vessel (`onBarClick`) pindah dari `<Link>` per-bar (v1) jadi `onClick` + `useNavigate()`
(SVG `<g onClick>`, lebih simpel drpd nest elemen anchor di dalam `<svg>`). Section 1
(kartu ringkasan)/2 (Biaya per Method) TETAP `<Link>` biasa (bukan chart, tidak perlu SVG).

### Yang belum dikerjakan / gap yang diketahui

Belum ada testing menyeluruh dgn data production 1 tahun penuh (baru dites recompute 1 bulan,
sudah lolos setelah 2 bug ditemukan & diperbaiki); vessel SCRAP yg baru discrap TENGAH BULAN
tidak bisa ditampilkan granular (toggle "Sembunyikan SCRAP" buang seluruh biaya bulan itu, tidak
cuma sebagian sebelum tanggal scrap).

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
