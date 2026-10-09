# Auth & sesi — auto-logout, pindah tab, lock screen

WAJIB dibaca sebelum mengubah `src/lib/AuthContext.tsx`, `ProtectedRoute` di `src/App.tsx`, atau `LockScreen.tsx`.

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat modulnya dikerjakan). -->

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

## User Activity — siapa online + terakhir masuk (2026-10-09, permintaan user; `sql/051_user_presence.sql` SUDAH DIJALANKAN 2026-10-09, konfirmasi user)

Panel TERBAWAH Settings → Manage Roles & Access (`UserActivityPanel.tsx`, **Admin saja**: halaman adminOnly + RPC menolak non-Admin).
- **Terakhir masuk** = `auth.users.last_sign_in_at` (dicatat Supabase tiap login; app logout saat tab ditutup/idle 30 mnt jadi tiap kunjungan = login baru; hanya
  1 waktu terakhir, TIDAK ada riwayat -- keputusan user). Dibaca lewat `fn_user_activity()` (SECURITY DEFINER, `is_admin()`).
- **Online**: `usePresenceHeartbeat` (dipasang di `MainLayout`) memanggil `fn_user_heartbeat(p_page, p_active)` tiap 60 dtk (+ saat pindah halaman / tab kembali terlihat) ->
  tabel `user_presence` (1 baris/user; waktu dari SERVER). Berhenti kalau tak ada sesi ATAU `lockScreenActive`. Tanpa state/render ulang (hanya ref+timer) -> tidak melanggar
  aturan pindah tab. `active` = ada klik/ketik < 5 mnt (memakai `LAST_ACTIVITY_KEY` AuthContext, kini `export`). Kalau fungsi belum ada (sql/051 belum jalan) hook berhenti
  mencoba sampai reload (hanya `console.warn`).
- **Status** (`utils/UserPresence.ts`, dihitung dari `server_now` RPC): Online = heartbeat ≤ 3 mnt DAN aktif ≤ 5 mnt; Idle = heartbeat ≤ 3 mnt tapi tak aktif; Offline = selain itu.
  Tab ditutup -> baru tampil Offline setelah ≤ 3 mnt (tidak seketika). Halaman saat ini = `pageLabelFromPath(path)` (PAGE_REGISTRY + pemetaan manual).
- Panel: kartu ringkasan (online · idle · total), filter Online/Idle/Offline, pencarian, tabel User · Division · Status · Last login · Last seen · Current page; segar otomatis tiap
  30 dtk selagi tab terlihat + tombol Refresh. Kalau RPC belum ada: pesan "run sql/051".
- **SQL 051** (idempotent, pre-check nama): tabel `user_presence` (RLS 4 policy: baca = milik sendiri/Admin, tulis = milik sendiri, hapus = Admin), `fn_user_heartbeat` (SECURITY
  INVOKER), `fn_user_activity` (SECURITY DEFINER + guard `is_admin()`, `set search_path`, revoke dari public/anon). Diuji PGlite 12 cek (upsert, isolasi antar-user, non-admin ditolak, anon
  ditolak, idempotent) + 17 cek fungsi murni.

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
