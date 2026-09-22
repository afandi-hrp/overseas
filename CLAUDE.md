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

CLAUDE.md ini awalnya 1 file ~3300 baris — dipecah (2026-09, permintaan user "file kekecilan")
supaya lebih ringkas & gampang dinavigasi. Bagian di ATAS (Tech stack s/d Pola UI wajib) + BAWAH
(Navigasi mobile s/d Peta RPC) TETAP di sini (aturan lintas-modul/app-wide, sering dirujuk dari
banyak modul). Detail per-modul dipindah ke file terpisah via `@import` — Claude Code otomatis
memuat isinya sbg bagian dari instruksi proyek ini, JADI TETAP DIBACA PENUH tiap sesi, cuma
lokasinya dipisah. **Ini MURNI pemindahan lokasi, TIDAK ADA konten yang dihapus/diringkas** —
riwayat iterasi lama, SQL migrasi belum dijalankan, & aturan arsitektur semuanya tetap utuh
persis seperti sebelumnya di file barunya masing2. Kalau ke depan mau memangkas isi (bukan cuma
pindah lokasi) — mis. riwayat iterasi v1->v2->v3 yang sudah closed diringkas jadi kondisi final
saja — itu pekerjaan terpisah, belum dikerjakan di sesi ini.

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

Sebelum ini, teks "sedang memuat data" tersebar di ~35 titik/file dengan variasi tidak konsisten
— campuran Inggris ("Loading data...", "Loading...") & Indonesia ("Memuat data...", "Memuat data
dokumen...", "Memuat data validasi cost...", "Memperbarui data..."), sebagian TANPA spinner sama
sekali (teks polos), warna spinner juga campur (`blue-500`/`blue-600` vs brand ungu `#5A305A`).
**Ditemukan 1 titik yang bocor nama backend ke user** — `SharedDataTable.tsx` sempat tampil
literal **"Loading data from Supabase..."** — SUDAH DIPERBAIKI (user TIDAK PERNAH boleh lihat
nama teknologi backend).

**Keputusan user (2026-09)**: SEMUA teks loading dibakukan ke **Inggris, "Loading data..."**
— TERLEPAS dari status program terjemahan modul lain yang masih berjalan bertahap per-modul
(lihat bagian "Translasi UI ke Bahasa Inggris" di atas) — teks loading SENGAJA jadi
**pengecualian**, dibakukan duluan di SEMUA modul (termasuk yang UI-nya sendiri belum
diterjemahkan, mis. Audit AP Local/Overseas/PI Local, Tarif Kontrak, Kurs BI/Rule Vendor, admin
Rate/Surcharge). **JANGAN anggap ini berarti modul-modul itu "sudah selesai" diterjemahkan
penuh** — cuma teks loading-nya saja yang ikut dibakukan, sisa UI modul itu TETAP mengikuti
status terjemahan modul masing-masing seperti sebelumnya.

- **`LoadingState`** (blok penuh — halaman/kartu/modal) — spinner brand ungu (`border-[#5A305A]/20
  border-t-[#5A305A]`) + teks "Loading data..." (bisa di-override via prop `label` kalau ada
  konteks yang benar-benar perlu lebih spesifik — SEMUA titik yang diganti kemarin SENGAJA
  dibiarkan pakai default, tidak ada yang pakai `label` custom, demi konsistensi maksimal).
  Prop `fullHeight` (default `true`, pakai `h-full`) — di-set `false` utk konteks yang parent-nya
  TIDAK py tinggi eksplisit (mis. `<main>` halaman biasa) supaya tidak collapse jadi 0px.
- **`LoadingTableRow`** — varian utk `<tbody>` (`<tr><td colSpan={N}>`), `colSpan` WAJIB diisi
  sama dengan jumlah kolom tabel itu (`activeCols.length`/hitung manual sesuai `<th>` yang ada).
- **Cakupan yang SUDAH diganti** — SEMUA halaman/modal yang py loading state tabel/blok utama:
  `SharedDataTable.tsx` (termasuk overlay "Updating data..." saat refresh & modal checklist),
  `ExportModal.tsx`, `ValidasiModal.tsx`, `ValidasiShipmentInvoiceLengkap.tsx`,
  `CostValidationModal.tsx`, `FarOverseasAirCostValidationModal.tsx`, `SeaAirChecklistModal.tsx`,
  `SeaAirValidasiModal.tsx`, `AccountingRekapPage.tsx`, `AuditPoPage.tsx`,
  `AuditPoOverseasPage.tsx`, `PiLocalPage.tsx`, `BunkerPage.tsx`, `FarOverseasAirPage.tsx`,
  `KursBIPage.tsx`, `KursRuleVendorPage.tsx`, `FarOverseasVendorTarifPage.tsx`,
  `TarifKontrakPage.tsx`, `MasterVesselAdminPage.tsx`, `RoleManagementPage.tsx`,
  `CourierValidasiPage.tsx`, `ReportingDashboardPage.tsx`, `ReportingCostPerVesselPage.tsx`,
  `ReportingCostByCourierPage.tsx`, admin `PPJKCostRule.tsx`/`RateSheetDHL.tsx`/
  `RateSheetFedEx.tsx`/`RateSheetUPS.tsx`/`SurchargeDHL.tsx`/`SurchargeFedEx.tsx`/
  `SurchargeCIPLRule.tsx`/`ZoneMappingEditor.tsx`/`NPWPEditor.tsx`.
- **SENGAJA TIDAK diganti** — spinner kecil INLINE di tombol aksi (Save/Submit/Refresh icon
  `RefreshCw` yang berputar, tombol Login/Lock Screen, dsb) — itu indikator "sedang memproses
  AKSI" (submit/save), BUKAN "sedang memuat data awal dari database", beda konteks/beda tujuan
  visual, di luar cakupan permintaan user ("loading data dari database").
- **Halaman baru ke depan yang butuh loading state data awal WAJIB pakai `LoadingState`/
  `LoadingTableRow`** — JANGAN bikin blok spinner+teks manual baru lagi (apalagi sampai ada teks
  Indonesia lagi atau warna spinner selain brand ungu) — akan merusak konsistensi yang baru
  dibakukan ini.

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
