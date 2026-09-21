## Modul REPORTING — "Overseas Cost by Vessel" + "Overseas Cost by Courier" (2026-09)

Menu sidebar **"Reporting"** (icon `BarChart3`) berisi 2 submenu independen, TIDAK ada overlap
kode/data antar keduanya ("duplikasi sengaja"):
- **Overseas Cost by Vessel** (`/reporting/cost-by-vessel`, `src/pages/CostByVesselPage.tsx`) —
  biaya per vessel, sumber `reporting_cost_allocation`/`master_vessel` (snapshot tersimpan, diisi
  via tombol Recompute dari `rekapan_courier`/`rekapan_seaair`/`rekapan_far_overseas_air`).
- **Overseas Cost by Courier** (`/reporting/cost-by-courier`, `ReportingCostByCourierPage.tsx`) —
  biaya per PPJK/Origin/Weight Range, sumber LANGSUNG `rekapan_courier` (live query, bukan
  snapshot). Lihat bagian tersendiri di bawah.

Belum pernah dites end-to-end dgn data production 1 tahun penuh (baru dites recompute 1 bulan) —
kalau ada laporan "angka salah/kosong", cek dulu asumsi mapping kolom sumber di bawah sebelum
curiga bug logic (tidak ada akses DB langsung dari sesi Claude Code manapun utk verifikasi).

### Skema database

- `src/lib/permissions.ts` — page_key `reporting_dashboard` & `reporting_cost_per_vessel` (2
  page_key LAMA, SENGAJA TIDAK digabung jadi 1 biar assignment role existing tetap valid — lihat
  "Cost by Vessel = gabungan 2 halaman lama" di bawah) + `reporting_cost_by_courier` (BARU).
  `src/components/MainLayout.tsx` — 1 menu induk "Reporting" > 1 subtab "Overseas Cost by Vessel"
  (`pageKeys` array, tampil kalau user py akses SALAH SATU dari 2 page_key lama) + 1 subtab
  "Overseas Cost by Courier" (`pageKey` tunggal).

- **`master_vessel`** (`sql/003_reporting_master_vessel.sql`, **BELUM DIJALANKAN ke Supabase
  production**): `vessel_id` (bigint identity PK), `vessel_name` (unique), `alias_name` (text[],
  nullable), `base`, `fleet_group`, `category` (`VESSEL`/`OTHERS`), `status` (`AKTIF`/`SCRAP`),
  `sort_order` (int, migrasi `sql/006_master_vessel_sort_order.sql`, **BELUM DIJALANKAN** —
  backfill via `row_number() over (order by vessel_id)`). **`vessel_type` SENGAJA TIDAK ADA**
  (keputusan eksplisit user — cuma pakai `fleet_group`, JANGAN reintroduce tanpa diminta ulang).
  Data awal dari `MASTER VESSEL.xlsx` (254 baris, `alias_name` semua NULL). `category`:
  `fleet_group==='OTHERS'` → `'OTHERS'`, selain itu → `'VESSEL'` (termasuk `'TBA'`). `status`:
  suffix `"(SCRAP)"` di nama → `'SCRAP'` (suffix dibuang dari `vessel_name` tersimpan), sisanya
  → `'AKTIF'`. RLS SELECT via `has_page_access` salah satu dari 2 page_key Reporting lama; edit
  SEMENTARA `is_admin()` polos.

- **`reporting_cost_allocation`** (`sql/004_reporting_cost_allocation.sql`, **BELUM DIJALANKAN**,
  jalankan SETELAH `003_...`). Snapshot hasil pembagian biaya per vessel per bulan (DISIMPAN,
  bukan live-compute — bisa ditelusuri audit). Kolom generik union semua method: `method`
  (`COURIER`/`SEA`/`AIR`/`BORONGAN`), `period_month`, `vessel_id`/`vessel_name_raw`,
  `source_table`/`source_row_id` (jejak audit), `courier_adm`/`duty`/`freight`/
  `handling_total`/`bm`/`ppn_pph`/`borongan_total`, `needs_review`, `source_label` (kolom
  tambahan `sql/005_reporting_source_label.sql`, **BELUM DIJALANKAN** — identifier manusiawi:
  Courier/Sea&Air → `no_invoice` fallback `awb`; Borongan → `no_invoice` fallback `memo_title`).
  Unique constraint `(method, source_table, source_row_id, vessel_name_raw)` — recompute per
  bulan = delete baris `period_month` itu dulu lalu insert ulang (idempotent). RLS: SELECT via
  `has_page_access` salah satu 2 page_key lama, INSERT/UPDATE/DELETE via
  `has_edit_access('reporting_cost_per_vessel')`.

- **`rekapan_courier`** — RLS SELECT existing di-gate `has_page_access('courier_rekapan')` saja;
  policy tambahan (**BELUM DIJALANKAN**) menambah alternatif akses via OR utk
  `reporting_cost_by_courier` (bukan ganti policy lama):
  ```sql
  create policy "rekapan_courier_select_reporting_cost_by_courier" on public.rekapan_courier
    for select using (public.has_page_access('reporting_cost_by_courier'));
  ```

### ETL / formula alokasi biaya per vessel (`src/utils/ReportingHelpers.ts`) — SATU-SATUNYA sumber kebenaran

`recomputeReportingMonth(monthDate)` (tombol "Recompute", Tahunan = loop 12x sekuensial) — 3
builder per sumber, SEMUA WAJIB lewat `pushDedupedRows()` sebelum insert (lihat gotcha di bawah):

- **`buildCourierRows`** — dari `rekapan_courier`, filter `tgl_terima_email`. Split kolom
  `vessel` dgn `+`. Nilai `breakdown_*_vessel` (kolom Auto-Calculate Rekapan Courier) DIPAKAI APA
  ADANYA per nama vessel, TIDAK dibagi lagi.
- **`buildSeaAirRows`** — dari `rekapan_seaair`, filter `tgl`. `shipment_type` LCL/FCL→`SEA`,
  `AIR`→`AIR`. Vessel HANYA ada di kolom jsonb `po_detail` (tabel ini TIDAK py kolom `vessel`
  top-level) — `extractSeaAirVesselNames(poDetail)` parse array/string JSON. Pakai kolom RAW
  (`duty_total`/`bm`/`ppn`/`pph`/biaya-biaya dijumlah `handling_total`), BUKAN kolom `*_split`
  (fitur split PO↔Vessel lain, sengaja tidak dipakai). Dibagi rata `/ jumlah vessel`.
- **`buildBoronganRows`** — dari `rekapan_far_overseas_air`, filter `invoice_date` (sementara,
  belum ada kolom tgl terima yg lebih tepat). Vessel dari `vessel_internal_note` (pemisah `+`,
  TERKONFIRMASI benar ke data production). Total dari `total_amount_idr` (fallback
  `total_amount`) dibagi rata jumlah vessel. TIDAK difilter `approval_status`.
- **`matchVessel(rawName, masterList)`** — cocokkan case/whitespace-insensitive ke `vessel_name`
  ATAU `alias_name`. Tidak ketemu → `vessel_id=null`, `needs_review=true`, baris TETAP disimpan
  (tidak boleh hilang diam2, tampil sbg grup "NEEDS REVIEW" di UI).
- Formula total (`totalCost`/`totalExclPpn`/`metricForMethod`/`zeroSums`/`addSums`) —
  SATU-SATUNYA rumus, di-import KEDUA halaman Reporting supaya angka tidak pernah beda.
  `metricForMethod`: ALL=jumlah semua kolom; COURIER=adm+duty+freight+bm+ppn_pph;
  SEA/AIR=duty+handling_total+bm+ppn_pph; BORONGAN=borongan_total.
- `fetchAllocationRowsByMonths(pairs: YearMonth[])` — SATU-SATUNYA query fetch, dipakai kedua
  halaman (`.in('period_month', [...])`, dedup).

**Gotcha — WAJIB pakai `pushDedupedRows()` kalau nambah sumber method baru**: 1 baris sumber
bisa menghasilkan nama vessel yang SAMA muncul 2x setelah split (mis. 2 entry `po_detail` dgn
vessel sama) — push manual ke array `rows` akan tabrakan sama unique constraint SETELAH
`delete()` sudah jalan duluan, hasil akhirnya 0 baris (root cause bug "Recompute gagal, data
hilang total" yang pernah terjadi). `pushDedupedRows()` GABUNG (SUM) nama vessel yang sama dalam
1 baris sumber jadi 1 entry sebelum insert — ini bukan cuma workaround, tapi matematis benar.

### `CostByVesselPage.tsx` — 1 halaman gabungan, 2 tab (Dashboard + Cost per Vessel)

2 halaman top-level lama (`ReportingDashboardPage.tsx`/`ReportingCostPerVesselPage.tsx`)
digabung jadi 1 route dgn 2 tab — komponen internal TIDAK diubah struktur, cuma dirender lewat
prop `embedded?: boolean` (kalau `true`, header bawaan masing2 komponen di-skip, `CostByVesselPage.tsx`
pasang 1 header + tab bar pill sendiri). page_key RBAC TETAP 2 terpisah (`reporting_dashboard`/
`reporting_cost_per_vessel`) supaya assignment role lama tetap valid — dibedakan via query
`?view=dashboard`/`?view=cost_per_vessel`, route TIDAK dibungkus `RequirePageAccess` tunggal
(gating internal, mirip hub `/settings`). Cross-navigation (scroll+blink dari Dashboard ke baris
vessel di Cost per Vessel — lihat di bawah) tetap jalan lewat query string yang sama.

**Tab "Dashboard"** — urutan panel (JANGAN diubah tanpa diminta ulang):
1. 4 kartu ringkasan: Total Cost | Total Cost Excl. PPN+PPH | Highest Vessel Cost | Total
   PPN+PPH — 3 kartu nominal tampilkan % vs periode sebelumnya + nilai IDR absolut dalam kurung
   (`fmtIdrAbs()` = `"IDR {angka}"`, prefix beda dari `fmtRp()`="Rp"). Highest Vessel Cost TIDAK
   pakai %. Teks pembanding ikut mode: Monthly `"vs Aug 2026"`, Quarterly `"vs Q2 2026"`, Yearly
   `"vs 2025"`.
2. **Cost per Method** — Donut chart (SVG `stroke-dasharray`, viewBox persegi tetap) + **Vessels
   with Highest Cost** (bar horizontal) 1 baris `grid lg:grid-cols-2`.
3. **Cost by Category** (kiri) + **Cost per Fleet Group** (kanan), setengah lebar masing2.
4. **Monthly/Quarterly/Yearly Trend** — ikut `periodMode` aktif (Monthly=12 bulan tahun terpilih;
   Quarterly=4 bar agregasi kuartal; Yearly=multi-tahun `todayYear-3`..`todayYear+2`, fetch
   terpisah `fetchAllocationRowsByMonths` khusus mode ini). Angka SELALU tampil di sisi bar
   (`writing-mode: vertical-rl`), bukan cuma tooltip. Klik bar → Cost per Vessel terfilter.

Filter periode: **Monthly/Quarterly/Yearly** (dropdown Quarter Q1-Q4 single-select), + dropdown
filter method (All/Courier/Sea/Air/FAR Ovs — SENGAJA TIDAK memfilter panel "Cost per Method"
sendiri, cuma memfilter kartu ringkasan/topVessels/trend/dll). Filter bar `sticky top-0 z-20
bg-white`. Nama bulan Inggris (`MONTH_NAMES`), 8 panel header berwarna `#DCC9E0` (kartu
ringkasan, teks `dark`=`#5A305A`) / `#FFF5C5` (5 panel analitik-chart) — 2 kelompok warna beda,
konten SELALU `bg-white` polos (bukan tint), TANPA border (`shadow-sm` saja).
**`HorizontalBarChart`/`VerticalBarChart` — HTML murni, BUKAN SVG** (JANGAN reintroduce SVG utk
chart bar manapun — versi SVG lama py masalah label vessel terpotong & distorsi stretch
non-uniform, sudah dihapus total). Semua nominal format PENUH (`fmtRp()`, TIDAK ADA versi
singkat M/Jt).

**Tab "Cost per Vessel"** — tabel pivot, dropdown method (All/Courier/Sea/Air/FAR Ovs, value
internal TETAP `TabId`/`AllocationMethod` = `'ALL'|'COURIER'|'SEA'|'AIR'|'BORONGAN'`, label
tampilan "FAR Ovs" khusus utk `BORONGAN`). Periode **multi-select** (`selectedYears`/
`selectedMonths: Set<number>`, bulan kosong = semua 12 bulan tahun itu, panel checkbox via
React Portal — bukan `position:absolute` biasa, krn filter bar `overflow-x-auto` meng-clip
sumbu Y juga kalau portal tidak dipakai). 2 sub-tab: **Summary View** (kolom SERAGAM 2 kolom
`Total Vessel Cost`/`Total Excl. PPN+PPH` semua method KECUALI FAR Ovs yg tetap 1 kolom `Total
FAR Ovs`) & **Periodic View** (`periodicMode: MONTHLY/QUARTERLY/YEARLY`, kolom per periode +
kolom akumulasi paling kanan = SUM periode yang SEDANG dipilih, `bg-slate-200/70`, HEADER kolom
`rowSpan={2}` tanpa label ekstra "TOTAL YTD" dkk).

Baris = SEMUA `master_vessel` urut `sort_order` (bukan alfabet — WAJIB, backfill sesuai urutan
file Excel asli) + grup "NEEDS REVIEW" (vessel tak cocok master, selalu di bawah). Base/Fleet
Group blank kalau sama dgn baris sebelumnya. **3 baris per grup**: HEADER (toggle ciutkan, di
ATAS) → baris vessel → SUBTOTAL (angka rekap, TETAP di BAWAH). `groupKey` = `${base}::${fleetGroup}#${indexBlok}`
(unik PER BLOK bukan per nama — 2 blok fleet_group yg sama tapi non-kontinu di file Master
Vessel WAJIB beda key, kalau tidak React key collision bikin toggle "kadang hilang vessel").
Checkbox **"Show zero-cost"** (default TIDAK dicentang, sembunyikan vessel `totalCost===0` DI TAB
itu) + tombol **Collapse/Expand All** (1 tombol, label ganti otomatis) — di toolbar kartu tabel
(bukan filter bar atas).

Shell "tinggi tetap + scroll internal" (header+filter `shrink-0`, `<thead>` sticky, GRAND TOTAL
di `<tfoot sticky bottom-0>` terpisah dari `<tbody>`). Tombol melayang pojok kanan-bawah LAYAR
(`right-1`, `w-8 h-8`, ikon `14`): Back to Dashboard (`bottom-24`) → Jump to top (`bottom-14`) →
Jump to bottom (`bottom-3`). Export Excel preview dulu (`ExportPreviewModal`, header `#5A305A`)
sebelum file dibuat, replika PERSIS tampilan (`visibleDisplayRows`, ikut status ciutkan &
Customize View kolom). Recompute loop semua bulan unik di `selectedPeriods`.

### Klik vessel di chart Dashboard → scroll+blink ke barisnya di Cost per Vessel

`topVessels` simpan `key` per entry (`v:<vessel_id>`/`u:<vessel_name_raw>`, format SAMA persis
`VesselAgg.key`) — link/`onBarClick` kirim `?highlight=<key>`. Cost per Vessel baca sekali,
scroll (`scrollIntoView` + kedap-kedip `.reporting-row-blink` 5 detik — **kalau durasi diubah,
WAJIB samakan angka di CSS `src/index.css` DAN `setTimeout` JS, keduanya harus identik**), buka
paksa grup kalau lagi diciutkan. **Gotcha**: effect scroll WAJIB nunggu `mastersLoaded===true`
(bukan cuma `loading===false`) — `masterVessels` di-fetch di effect terpisah/async, kalau tidak
ditunggu baris target sempat "salah lokasi" sesaat di grup NEEDS REVIEW sebelum pindah ke grup
asli, scroll jadi ke posisi yang sudah tidak relevan.

### `MasterVesselAdminPage.tsx` (`/settings/master-vessel`, admin-only)

CRUD langsung `.insert()`/`.update()`/`.delete()` ke `master_vessel` (RLS `is_admin()` cukup,
bukan RPC). Kolom "Sort" + field edit `sort_order`. **Tambah vessel baru → otomatis nempel di
BAWAH grup Base+Fleet Group yang sudah ada** (`insertAfterGroup()`, deteksi live saat mengetik) —
**KRITIS**: karena `sort_order` awal rapat tanpa celah, `MAX(grup)+1` polos HAMPIR PASTI sudah
dipakai vessel lain (anggota grup berikutnya) → harus GESER (+1) semua vessel dgn `sort_order`
lebih besar, diproses dari nilai PALING BESAR mundur ke kecil supaya tidak collision di tengah
proses. Kalau grup belum ada, fallback ke default kolom (nempel akhir tabel).
`MasterVesselAdminPage.tsx` SENGAJA TIDAK ikut translasi Inggris (masih Bahasa Indonesia).

### Gap yang diketahui

Belum testing production 1 tahun penuh; vessel SCRAP yg baru discrap TENGAH BULAN tidak bisa
ditampilkan granular (checkbox "Hide Scrapped" pernah ada, SUDAH DIHAPUS TOTAL atas permintaan
user — kalau diminta lagi perlu dibuat ulang dari nol); klik bar Trend Quarterly/Yearly di
Dashboard arah ke Cost per Vessel dgn presisi bulan yang tidak 100% akurat.

## Overseas Cost by Courier (`ReportingCostByCourierPage.tsx`, `src/utils/ReportingCourierHelpers.ts`)

Sumber data `rekapan_courier` LANGSUNG (live query, bukan snapshot) — TERPISAH TOTAL dari modul
Cost by Vessel di atas, tidak ada overlap kode.

**Kolom sumber**: SEMUA angka dari kolom UTAMA `rekapan_courier` (`courier_adm_fee`,
`total_freight`, `bm`, `ppn`, `pph`, `total_amount`, `total_duty_tax`). Kolom `breakdown_*_vessel`
(milik modul Cost by Vessel) **SENGAJA TIDAK PERNAH dipakai di sini**.

**Aturan distinct count** (Freight & Duty = 2 baris terpisah per AWB di recap → dobel kalau naif)
— `stripAwbCarrier()` dipakai semua hitungan distinct:
- **AWB/Shipment** — `Set` AWB yang sudah di-strip prefix carrier (DHL|FEDEX|UPS).
- **PO** — split `+` pada `po_pt_imi`+`po_shipping`, suffix `"(N)"` (partial) DIBUANG sebelum
  dedup (`normalizePoKey()`) — 2 partial dianggap 1 PO.
- **Weight** — `distinctWeightMap()` ambil `weight_kg` baris PERTAMA per AWB unik (BUKAN SUM —
  nilainya sama di baris Freight & Duty, kalau dijumlah jadi 2x lipat).
- Komponen biaya (Freight/Courier Adm/BM/PPN/PPH/dll) TIDAK di-dedup — SUM semua baris apa
  adanya (2 baris Freight & Duty memang 2 catatan biaya berbeda, sah dijumlah).

**Filter PPJK — "meeting-mode"**: `selectedPpjk` (`Set<string>`, kosong = All) HANYA memfilter
kartu/breakdown/detail table yang DITAMPILKAN — donut & persentase card SELALU dihitung terhadap
SEMUA PPJK sebagai penyebut (1 PPJK terpilih TIDAK PERNAH dinormalisasi ulang jadi 100%). Donut
PPJK yang tidak dipilih digabung 1 slice **"Others"** abu-abu (`#E2E8F0`, tanpa nama individual).
`normalizePpjk()` buang prefix "OWN " ("OWN FEDEX"→"FEDEX") di SEMUA titik baca `r.ppjk`.

**Periode**: `PeriodMode` (Monthly/Quarterly/Yearly) + **multi-select** tahun/bulan (`Set<number>`,
pola sama Cost per Vessel, `buildSelectedPeriods()` = cartesian product). Cache per tahun
(`yearsData: Map<year, CourierRow[]>`). "Periode sebelumnya" utk kartu % = periode PALING AWAL
yang dipilih mundur 1 unit (`previousPeriod()`).

**Data Performance** (section SELALU tampil, di bawah Breakdown Komponen Biaya, di atas sub-toggle
By PPJK/Origin/Weight Range) — reuse `periodColumnRows`/`buildPeriodColumns()` yang SAMA dgn
Trend chart (SATU-SATUNYA sumber kolom periode). 4 baris: Shipment Growth %, Weight Growth %,
Total Shipment, Total Weight.

**Checkbox "Show zero-cost"** (default TIDAK dicentang) — By PPJK/By Origin diseed 0 dulu dari
universe options sebelum diisi data; By Weight Range (5 bucket tetap `WEIGHT_RANGES`) MENYARING
bucket yg cost=0 & shipment=0.

**Detail Data** — kolom SERAGAM ketiga tab (By PPJK/Origin/Weight Range): `Freight | Courier Adm
Fee | BM | PPN | PPH | Total Cost | Total Excl. PPN+PPH | Shipment | PO` (field bucket weight
range disebut `name`, BUKAN `label` — lihat gotcha di bawah).

**By Weight Range tambahan**: card "Highest Range (Shipment)" (dari data UNFILTERED, akurat
terlepas toggle Show Zero Cost) + bar `ShipmentWeightBar` (2 angka sekaligus: `"{N} Shipment /
{M} Kg"`).

**Breakdown Komponen Biaya** — list vertikal (`ComponentLine`, BUKAN bar chart): tiap baris
label + nilai + %/arah/nilai-sebelumnya dalam kurung, gaya sama kartu ringkasan.

**Header ikon halaman** — ungu brand `#5A305A` (pola standar CLAUDE.md, samakan semua halaman).
`ACCENT` coral (`#F58C77`) TETAP dipakai KHUSUS warna bar/line chart (bukan elemen interaktif).

**Export** — modal preview TABEL SUNGGUHAN (me-mirror persis isi Excel: Summary/Component/Detail,
header `#5A305A`), 15 baris pertama + pesan "showing first N of M". Nominal Excel ditulis sbg
**TEKS SUDAH DIFORMAT** (`fmtIdr()`, `toLocaleString('id-ID')`) — BUKAN angka mentah + number
format Excel (root cause bug lama: locale sistem penerima file beda2, hasilnya angka polos tanpa
"IDR"/pemisah ribuan). Header tabel Excel diberi fill `FF5A305A` + font putih via
`styleHeaderRow()`. Export mencakup SEMUA tabel termasuk Data Performance.

**Gotcha — field bucket Weight Range HARUS `name`, bukan `label`**: `DetailTable`/`DetailRow`
generik (dipakai ketiga tab) baca field `r.name` — kalau builder bucket menaruh nilainya di
`label`, kolom "Weight Range" tampil kosong TANPA error TypeScript (union-type inference tidak
menangkap mismatch field di object literal `useMemo` tanpa anotasi tipe eksplisit). Fix yang
sudah diterapkan: `weightBucketsFull` diberi anotasi tipe eksplisit `(DetailRow & {weight:
number})[]` — **kalau bikin builder detail-row baru lagi, WAJIB kasih anotasi tipe eksplisit
juga**, jangan andalkan `tsc --noEmit` bersih sbg jaminan field-nya benar.

**Gotcha — chart formatValue**: `HBar` (komponen chart bar horizontal generik, dipakai Cost/By
Origin/By Weight Range) py prop `formatValue` (default `fmtIdr`) — chart yang nilainya BUKAN
nominal (mis. "Shipment" di By Weight Range, angka biasa) WAJIB kirim `formatValue={n =>
n.toLocaleString('id-ID')}` eksplisit, kalau tidak akan salah tampil "IDR 14" dst.

**PT dropdown — keterbatasan diketahui**: BELUM ADA sumber pemetaan resmi kode `an` (mis.
"IMI"/"WNS"/"GMI") ke nama PT lengkap utk `rekapan_courier` — dropdown "PT" saat ini tampilkan
kode `an` mentah sbg label DAN value, BELUM sesuai spek "tampilkan nama PT". Perlu tabel master
baru atau konfirmasi apakah `far_overseas_signer_config.company_name_full` boleh dipakai lintas
modul — MINTA DIKONFIRMASI kalau mau diselesaikan.

**Gap diketahui**: Weight Range breakpoint (0-5/5-25/25-70/70-150/>150) HARDCODE di
`WEIGHT_RANGES`, belum ada UI utk mengubahnya; Conclusion box teksnya template string sederhana.

## Skalabilitas >100rb baris — paginasi penuh & dropdown distinct via RPC (2026-09)

Analisa (diminta user, sama pola sesi Audit AP sebelumnya): ke-3 halaman/tab (Dashboard, Cost per
Vessel, Cost by Courier) TIDAK akan crash di data besar (semua fetch tetap dibatasi filter
tanggal/periode), TAPI 2 masalah ditemukan & diperbaiki:

1. **`fetchCourierRows()`/`fetchCourierYear()` (`ReportingCourierHelpers.ts`) — DULU
   `.limit(20000)` TUNGGAL** — kalau `rekapan_courier` 1 tahun sudah >20rb baris, Supabase DIAM2
   memotong ke 20.000 baris pertama TANPA error ke UI (silent truncation — SEMUA turunan
   chart/kartu/Detail Data/export tahun itu jadi salah tanpa terlihat sbg bug). **Fix**: GANTI
   jadi paginasi penuh via `.range()` per `COURIER_PAGE_SIZE=1000` berurutan (`order('id')` WAJIB
   supaya urutan antar-halaman stabil) sampai halaman terakhir — SEMUA baris yang cocok filter
   SELALU ter-fetch, apa pun jumlahnya, tidak ada lagi batas atas yang diam2 memotong.
2. **Dropdown filter PT/PPJK/Origin (`fetchDistinctAn`/`fetchDistinctPpjk`/`fetchDistinctOrigin`,
   `ReportingCourierHelpers.ts`) — DULU `.limit(5000)` baris MENTAH lalu dedup di JS** (limitnya
   di baris mentah SEBELUM dedup, bukan 5000 nilai unik — PT/PPJK/Origin baru yang baru muncul di
   baris ke-5001+ bisa diam2 tidak pernah tampil). **Fix**: RPC baru
   `fn_reporting_courier_distinct(p_column)` (`sql/008_reporting_courier_distinct_rpc.sql`,
   **BELUM DIJALANKAN ke Supabase production**) — `SELECT DISTINCT` di Postgres, tanpa limit
   (volume nilai UNIK jauh lebih kecil dari jumlah baris tabel). Normalisasi "OWN X"->"X" (PPJK)
   tetap dilakukan di client SETELAH terima hasil RPC (bisa menggabung 2 nilai distinct jadi 1,
   perlu dedup Set ulang).
3. **`buildCourierRows`/`buildSeaAirRows`/`buildBoronganRows`/`fetchAllocationRowsByMonths`
   (`ReportingHelpers.ts`) — DULU 1 query polos TANPA `.limit()`/`.range()` sama sekali** (bukan
   silent-wrong-data spt poin 1, TAPI berisiko lambat/timeout Supabase REST kalau 1
   bulan/rentang periode sumbernya sudah puluhan-ratusan ribu baris — terutama tombol "Recompute"
   yang baca 3 tabel sumber sekaligus per bulan). **Fix**: SEMUA 4 fungsi ini GANTI ke helper
   generik `fetchAllPaginated()` (BARU, module-level di `ReportingHelpers.ts`) — paginasi
   `.range()` per `REPORTING_PAGE_SIZE=1000` berurutan (`order('id')`), volume TOTAL yang ditarik
   TIDAK berubah (tetap semua baris cocok filter), cuma dipecah jadi request lebih kecil supaya
   tidak 1 request raksasa yang rawan timeout.

**Index tambahan** (`sql/008_reporting_courier_distinct_rpc.sql`) — B-tree pada
`rekapan_courier.tgl_terima_email`/`rekapan_courier.an` (filter+urut paginasi baru di atas).
Index kolom lain (`rekapan_seaair.tgl`, `rekapan_far_overseas_air.invoice_date`,
`reporting_cost_allocation.period_month`) **TIDAK DIKETAHUI status-nya dari kode frontend** —
perlu verifikasi manual langsung di Supabase.

`fetchMasterVessels()` (`master_vessel`, ~250 baris, diisi CRUD admin manual bukan otomasi
backend) SENGAJA TIDAK disentuh — karakternya beda total dari tabel transaksi, fetch full-table
tanpa limit aman selama tabel ini tetap berorde ratusan baris.
