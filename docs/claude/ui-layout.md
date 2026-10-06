# Layout & komponen UI bersama — detail

Ringkasan aturannya ada di CLAUDE.md "Pola UI wajib"; detail & riwayat di sini.

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat menyentuh layout/komponen bersama). -->

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
s.path))`. **Sejak 2026-10-06 `PAGE_REGISTRY[].group` = MENU SIDEBAR** (Compare Doc digabung 1 grup, dst) -- lihat
"Matrix Page Access per Role mengikuti sidebar" di bagian RBAC.

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

