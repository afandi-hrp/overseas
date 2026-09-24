## Export Excel — ikut Customize View & PPJK tanpa prefix "OWN" (2026-09)

**Kolom export ikut Customize View aktif** — tombol Export (panel filter, semua tab) SEBELUMNYA
selalu kirim `cols: activeCols` (SEMUA kolom default, TIDAK PERNAH ikut Customize View) ke
`ExportModal`. **Fix**: diganti `cols: visibleCols` (variable yang SUDAH ADA, dipakai thead+row
tabel Customize View -- lihat bagian "Customize View" di bawah) -- SATU baris ini otomatis
membuat Export mengikuti kolom+urutan yang SEDANG TAMPIL di layar utk `courier_audit` (SEMUA tab
Draft/PIB/CN, hidden-set SAMA lintas ketiganya) & `courier_rekapan` (Invoice Recap). Tab lain
(Sea & Air Audit/Rekapan, Document Validation) TIDAK punya Customize View sama sekali --
`visibleCols` di situ otomatis `=== activeCols` (fallback bawaan, TIDAK ADA perubahan perilaku).
"Reset to Default"/hidden-set kosong (belum pernah kustomisasi) → `visibleCols === activeCols` →
export otomatis balik ke SEMUA kolom default, tanpa kode tambahan. Header Excel = `c.label`
persis, sumber SAMA dgn `<th>` tabel (SATU array `cols` yang sama dipakai keduanya) -- tidak
mungkin drift. Baris export SUDAH lebih dulu ikut filter aktif (tanggal/company/PPJK/search,
lihat `getExportData()`) -- tidak disentuh, cakupan perbaikan ini MURNI soal kolom.

**PPJK export buang prefix "OWN "** — kolom PPJK Rekapan Courier di layar SUDAH buang prefix
"OWN " (`getCellData()`, lihat komentar "Kolom AWB ... Sama pola dgn kolom ppjk" di atas), TAPI
`ExportModal.tsx` (Excel + preview + filter kolom "contains") SEBELUMNYA baca nilai MENTAH
apa adanya ("OWN DHL" bukan "DHL") -- export tidak cerminan persis tampilan layar. Fix:
`stripDisplayPrefix(key, val)` (module-level, `ExportModal.tsx`, BARU) -- dipakai di 3 titik:
`buildCellValue` (isi Excel), blok render preview table, DAN `rawColVal` (dasar filter kolom
"contains", supaya cocokkan teks jg terhadap versi tanpa "OWN"). SATU-SATUNYA tempat strip prefix
ini di file export -- kalau ke depan ada kolom lain yang JUGA di-strip prefix internal serupa di
tampilan tabel, tambahkan case baru di fungsi yang sama, JANGAN duplikat logic strip di titik lain.

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

`ExportModal` (generik, dipakai SEMUA tab dgn tombol Export) dulu cuma py 1 filter: date range
(`startDate`/`endDate`, kolom tanggalnya di-HARDCODE per tab di `getExportData()`). Ditambah
filter by KOLOM APA SAJA, date picker tetap dipakai khusus kolom tanggal.

**Arsitektur**: filter kolom baru **MURNI client-side di dalam `ExportModal.tsx`** (TIDAK
mengubah `getExportData()`) — aman krn query itu SUDAH `.limit(25000-50000)` tanpa filter kolom
tambahan, data relevan sudah tertarik penuh ke browser. Konsekuensi: fitur ini otomatis berlaku
ke SEMUA tab yg pakai `ExportModal`, bukan cuma Courier.

- **State**: `columnFilters: ColumnFilter[]` (`{key,col,op,text,from,to,boolVal}`, semua
  di-AND-kan) + toggle panel `showColumnFilters`. Date range TETAP filter wajib server-side.
- **`opForType(type)`** — `date`/`datetime` → 2 date picker (from/to); `num`/`pct` → 2 input
  angka (min/max); `bool` → dropdown LULUS/GAGAL/Semua; sisanya → input teks "contains"
  (case-insensitive).
- **`filteredData`** (`useMemo`) — SATU SUMBER dipakai preview, teks "Total N row(s)", DAN
  `handleExport()` — file Excel SELALU SAMA PERSIS dgn preview.
- **Perbandingan nilai** — kolom `date`/`num` dari NILAI MENTAH (`rawColVal()`); kolom teks
  ("contains") dicocokkan ke VERSI TER-FORMAT (`formatValue()`, sama fungsi dipakai preview &
  Excel) — supaya pencarian cocok dgn apa yg user LIHAT. **JANGAN duplikat logic format lain.**
- **Gap diketahui**: filter teks "contains" 1 nilai, BUKAN dropdown pilihan nilai unik ala Excel
  AutoFilter (effort lebih besar, belum diminta eksplisit).

## Highlight baris Submit Date — Rekapan Courier (`CourierRekapanRowGroup`)

Baris dgn `submit_date` terisi diberi warna latar `bg-[#FFF5C5]` (kuning, hover
`#F5E28F`) + `border-l-[3px] border-l-[#E6C25C]` — SELALU menang di atas kombinasi bg lain
(edit massal/split-PO). **Riwayat warna (ungu→coral→gradient→kuning solid FINAL) — JANGAN
reintroduce versi lama.** 2 tempat tambahan HARUS ikut disesuaikan (kolom pertama saat PO
expanded, kolom Action sticky) — kalau tidak, highlight "bolong" putih. Cakupan SENGAJA cuma
`CourierRekapanRowGroup`. App ini TIDAK punya dark mode.

**Badge warna per Invoice Type** (`getCellData()` type `invType`) — FREIGHT=coral, DUTY=kuning
gelap, CREDIT NOTE DUTY/FREIGHT=ungu brand, lainnya=sky biru (fallback). Deteksi
`.includes('CREDIT NOTE')` dicek PALING DULU sebelum exact-match DUTY/FREIGHT.

**Export Excel Rekapan Courier** — PO PT IMI/Vessel dkk **TIDAK di-split lagi jadi banyak baris**
(beda dari Sea & Air Rekapan yg TETAP split via `po_detail` JSON). `getSplitRows()` cabang
`courier_rekapan` DIHAPUS total, `parseCourierPoVesselPairs`/
`COURIER_REKAPAN_SPLIT_REPEATING_COLS` dihapus (dead code). Highlight `submit_date` ikut ke Excel
via `applySubmitDateHighlight()` (ARGB `FFFFF5C5`) — guard `splitByPoDetail !== 'courier_rekapan'`.
**Kalau warna on-screen diganti, WAJIB sinkron ARGB di sini juga.**

## Audit Courier — Auto-Calculate 7 kolom turunan (`SharedDataTable.tsx`)

7 kolom Audit Courier (PIB & CN) dihitung otomatis dari kolom sumbernya, urutan WAJIB 1→7 (field
bawah pakai hasil field atas), berlaku di SEMUA jalur input — Add Data, Edit, edit massal/inline,
DAN data hasil isian n8n (live-compute saat tampil). Field yg PERNAH diedit manual TIDAK PERNAH
ditimpa otomatis lagi (ditandai biru+ikon pensil di form).

**Formula** (`computeCourierAuditCalc()`, fungsi pure module-level — SATU-SATUNYA sumber
kebenaran, JANGAN duplikat logic ini di tempat lain):
1. `total_nilai_pabean` (Total Customs Value) = `valas_dpp` × `kurs_ndpbm`
2. `total_nilai_pabean_bm` (T N.Pabean + BM) = (1) + `bm`
3. `ppn_pct` = `ppn_nilai` / (2), `""` kalau (2) kosong/0 (guard pembagi nol)
4. `pph_pct` = `pph_nilai` / (2), `""` kalau (2) kosong/0
5. `item_price_idr` = `""` kalau `item_price`+`other_cost` DUA-DUANYA kosong; kalau `kurs`
   (kolom CURRENCY, `==='USD'`) → `(item_price+other_cost) × kurs_ndpbm`; selain itu →
   `item_price × kurs_bi` (PIB tidak punya Kurs BI sendiri, fallback `kurs_ndpbm`)
6. `total_pib_cn` (Total PIB/CN Rp) = `bm` + `ppn_nilai` + `pph_nilai` + (`jenis_dokumen==='CN'`
   ? `sanksi_adm` : 0)
7. `cek_selisih` (Check Difference) = (1) − (`item_price_idr` + `total_inv_freight`)

**Override manual per field** — kolom DB `manual_override_fields` (jsonb array nama field, di
`tabel_audit_pib` & `tabel_audit_cn`). **BELUM DIJALANKAN ke Supabase production**:
```sql
alter table public.tabel_audit_pib add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
alter table public.tabel_audit_cn add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
```
`computeCourierAuditCalc(row, jenisDokumen, overrideFields)` SKIP field yg ada di
`overrideFields` (pemanggil WAJIB merge, bukan replace total).

**3 jalur wajib panggil fungsi ini, jalur input baru WAJIB ikut ditambahkan**:
1. **`EditModal` (Add Data & Edit)** — `overrides: Set<string>` (dari `record.manual_override_
   fields`), `setManual(key,val)` khusus onChange 7 field ini + `useEffect` hitung ulang tiap
   render, skip field di `overrides`. Save: `payload.manual_override_fields = Array.from
   (overrides)`. `allowedKeysCreate` WAJIB include `'manual_override_fields'` juga (kalau lupa,
   field percuma ditulis tapi hilang sebelum insert — sama pola bug `status` di bawah).
2. **`fetchRecords`/`getExportData`** (4 titik total) — `rows.forEach(r => Object.assign(r,
   computeCourierAuditCalc(r, r.jenis_dokumen, r.manual_override_fields)))` setelah fetch — ini
   yg bikin data isian n8n ikut "terkoreksi" saat tampil tanpa ubah workflow n8n.
3. **`handleInlineSaveRow`** — gabung record lama + payload baru, field kalkulasi yg diketik
   manual masuk `manual_override_fields` (union dgn lama), lalu recompute & assign balik ke
   payload. **Bug fix**: loop konversi Number sempat salah pakai `COURIER_COLS` (kolom Rekapan)
   utk cabang `courier_audit` — diganti `[...PIB_COLS, ...CN_COLS]`.

**Field "Sanksi ADM" di form Add Data tab Draft** — `sanksi_adm` ada di `CN_COLS` tapi Draft
pakai `activeCols` berbasis `PIB_COLS` → disisipkan manual (pola sama `kurs_bi`). Sengaja TIDAK
dibedakan tampil/sembunyi berdasar dropdown Document Type real-time (konsisten precedent
`kurs_bi`).

## Rekapan Courier — Auto-Calculate 6 kolom turunan (`SharedDataTable.tsx`)

Sama arsitektur dgn Audit Courier di atas (override permanen via `manual_override_fields`,
live-compute di 3 jalur). Fungsi pure `computeCourierRekapanCalc()` +
`COURIER_REKAPAN_CALC_FIELDS` (6 field).

**Formula**: "Jumlah Vessel" = jumlah pemisah `+` pada `vessel` + 1 (`courierRekapanVesselCount()`
— vessel kosong = 1, TIDAK PERNAH 0).
1. `total_amount` = `courier_adm_fee` + `total_duty_tax` + `total_freight` (berdiri sendiri)
2. `breakdown_courier_adm_vessel` = `courier_adm_fee` / Jumlah Vessel
3. `breakdown_duty_vessel` = `total_duty_tax` / Jumlah Vessel
4. `breakdown_freight_vessel` = `total_freight` / Jumlah Vessel
5. `breakdown_bm_vessel` = `bm` / Jumlah Vessel
6. `breakdown_ppnpph_vessel` = (`ppn` + `pph`) / Jumlah Vessel

**BELUM DIJALANKAN ke Supabase production**:
```sql
alter table public.rekapan_courier add column if not exists manual_override_fields jsonb not null default '[]'::jsonb;
```

**3 jalur wajib** (pola sama Audit Courier): `EditModal` (GANTI TOTAL breakdown-calc lama yg
selalu overwrite tanpa override-awareness); **2 titik live-compute ekstra**
`fetchRecords`/`getExportData` (formula `cek_selisih` versi lama sempat jalan SETELAH
`data.forEach` yg benar, diam2 menimpa balik hasil benar — sudah diganti jadi comment); dan
`handleInlineSaveRow` cabang `courier_rekapan`.

## Bug fix: "Add Data" Audit Courier bisa kirim payload ke tabel yg salah (`EditModal`)

Root cause: form Add Data render pakai `cols`=`activeCols` dari TAB AKTIF (PIB_COLS/CN_COLS/
Draft), tapi field "Document Type" (`jenis_dokumen`) dulu `<input>` teks bebas — user bisa ketik
"CN" walau field yg tampil dari `PIB_COLS` → payload bawa key yg tidak ada di tabel tujuan
(mis. `no_pib` ke `tabel_audit_cn`) → Supabase tolak insert. **Fix**: payload di-strip ke HANYA
key `(jenisDokumen==='CN' ? CN_COLS : PIB_COLS).map(c=>c.key)` sebelum insert. Path EDIT tidak
kena (tabel diresolve dari `record.jenis_dokumen` asli).

**Susulan**: field "Document Type" diganti `<select>` 2 opsi PIB/CN, **disabled saat mode Edit**
(`record.jenis_dokumen` asli tetap sumber kebenaran, cegah kesan "pindah jalur"). Dropdown ini
MENGURANGI risiko typo, TAPI TIDAK menggantikan fix stripping payload di atas — keduanya tetap
dipertahankan.

## Add Data manual Audit Courier — kolom Status terkunci ARCHIVED (`SharedDataTable.tsx`)

Field Status di form Add Data SELALU `ARCHIVED` otomatis (bukan dropdown LENGKAP/PROSES/PENDING/
REVISI lagi). Guard `c.key==='status' && tab.id==='courier_audit' && isCreate` (sebelum cabang
`status` generik). `<input disabled>` teks "Archived", nilai dikirim via
`createDefaults={{status:'ARCHIVED'}}` (EditModal prop).

**Bug fix**: kolom `status` TIDAK ADA di `PIB_COLS`/`CN_COLS` (yg ada `status_kelengkapan`) —
`allowedKeysCreate` ikut MEMBUANG `status` sebagai key asing, `createDefaults` jadi percuma,
tetap ke-insert `LENGKAP` default DB. Fix: `allowedKeysCreate` di-union manual dgn `'status'`.

**Konsekuensi (desain existing, bukan bug baru)**: query Audit Courier normal `.neq('status',
'ARCHIVED')` — data manual baru cuma kelihatan lewat tab **Draft**.

## Edit Massal — Audit Courier & Rekapan Courier (`SharedDataTable.tsx`)

`pendingEdits`/`getVal`/`setVal` direplika dari FAR Overseas List Memo, TAPI toggle mode
**GLOBAL** (`courierAuditEditMode`/`courierRekapanEditMode: boolean`, bukan per-baris —
per-baris versi awal DITOLAK user). Toggle toolbar → semua baris masuk mode input. Disimpan via
"Save All" (`handleInlineSaveRow` paralel) atau "Cancel" (buang semua).

**Tombol Edit per-baris DIKEMBALIKAN** (susulan) — state lokal `rowEditOn`.
`editingThisRow = (!!editMode || rowEditOn) && canBulkEdit`. Tombol Edit TIDAK menutup panel
Action. **Tombol Save per-baris** commit HANYA `pendingEdits[id]` itu. **Bar "Save All"**
ditambah syarat `courierAuditEditMode`/`courierRekapanEditMode` (bukan cuma "ada pending edit").

**ROOT CAUSE Save All gagal diam-diam (2 bug ditemukan & diperbaiki)**:
1. `Object.keys(pendingEdits).map(Number)` bisa crash (`NaN`) kalau key tidak numerik — fix:
   filter dulu key yg py isi via `Object.entries`.
2. **Tipe id bigint-vs-int4**: kolom `id` bigint dikembalikan Supabase-js sbg STRING (cegah
   presisi hilang). Paksa `Number(id)` bikin `records.find(r=>r.id===id)` (strict equality)
   SELALU gagal diam-diam. **Fix (2 sisi wajib bareng)**: (a) `pendingEdits` tipe
   `Record<string,...>`, TIDAK di-`Number()`; (b) `handleInlineSaveRow` — SEMUA pencarian record
   via id pakai `String(r.id) === String(id)`. **Cabang baru yg cari record via id WAJIB pakai
   pola String() ini.**
3. `handleInlineSaveRow` sekarang SELALU `console.error` di catch + `fetchRecords()` dipanggil
   setelah commit sukses (jaga2 RLS diam2 gagal 0 row tanpa error).

**RESIKO PRE-EXISTING, belum diperbaiki**: tab Draft gabung PIB+CN dari 2 tabel BEDA sequence id
(potensi collision). `pendingEdits` key by `rec.id` mentah — kalau collision, edit bisa nyasar ke
baris lain jenis dokumen beda (butuh redesain key composite, di luar cakupan edit massal ini).

## Konfigurasi Webhook Otomasi jadi halaman sendiri (`src/pages/WebhookSettingsPage.tsx`)

Panel "Konfigurasi Webhook Otomasi" dipindah dari inline `SettingsPage.tsx` jadi halaman sendiri
`/settings/webhooks`, diakses via kartu `ModuleCard` di hub `/settings`. Logic (state
`webhookUrl` dkk, key localStorage `n8n_webhook_url`/`n8n_seaair_webhook_url`/
`n8n_far_overseas_air_webhook_url`/`n8n_bunker_webhook_url`) TIDAK berubah, murni pindah lokasi.
Page_key baru `settings_webhooks` — **TIDAK ada konsep edit terpisah** (localStorage saja, sama
`courier_upload`/`sea_air_upload`).
**Konsekuensi RBAC**: page_key ini BELUM di-assign ke role mana pun — HANYA Admin otomatis bisa
akses sampai PIC assign manual di Kelola Role & Akses (WAJAR/disengaja, bukan bug).

## Rate Tables & PPJK — dukungan UPS (`src/pages/admin/`)

Category UPS = tambah opsi baru (`SURCHARGE`, `SERVICE`) ke dropdown Category existing (13 opsi
total), BUKAN petakan ke kategori lama. `SurchargeUPS.tsx` terpisah **TIDAK dibuat** —
`PPJKCostRule.tsx` yg diperluas sudah cukup.

**`PPJKCostRule.tsx`**: Courier dropdown +`UPS`. Price Mechanism +6 opsi baru
(`FLAT_PER_PACKAGE`, `FLAT_PER_PALLET`, `PER_PACKAGE_MAX_SHIPMENT`,
`GREATER_OF_SHIPMENT_OR_KG`, `PER_TIER_VALUE`, `PER_KG_PER_DAY`). 2 field baru:
`max_shipment_idr`, `tier_value_idr`. `getNilaiText()` +6 cabang baru — **kalau nambah mechanism
baru lagi, WAJIB tambah cabang di sini juga** (kalau lupa, badge "Nilai" tampil "-").
**BELUM DIVERIFIKASI ke production**: CHECK constraint enum mungkin perlu update; kolom baru
WAJIB provision:
```sql
alter table public.tabel_ppjk_cost_rule add column if not exists max_shipment_idr numeric;
alter table public.tabel_ppjk_cost_rule add column if not exists tier_value_idr numeric;
```

**`RateSheetUPS.tsx`** (BARU, tabel `tabel_rate_sheet_ups`) — duplikasi struktur
`RateSheetDHL.tsx`. Beda field: `service` (4 pilihan UPS WORLDWIDE...), `package_type`
(+`PALLET`), `rate_type` (+`MINIMUM_RATE`, tanpa field berat), `zone` (string `'Zone 1'`..
`'Zone 10'`, beda schema dari DHL/FedEx). Field berat 4-kolom: `weight_exact_kg` (FIXED),
`weight_from_kg`/`weight_to_kg` (MULTIPLIER), `weight_label` (opsional). Didaftarkan di
`RateTablesAdmin.tsx` tab `ups_rate`.

**BELUM DIJALANKAN — tabel `tabel_rate_sheet_ups` BELUM ADA SAMA SEKALI** (tabel baru, bukan
cuma kolom), buat manual (skema/RLS ikut pola `tabel_rate_sheet_dhl`/`fedex` +
`has_page_access`/`has_edit_access('admin_rates')`).

**Belum diimplementasikan (TERPISAH, jangan campur ke task UPS)**: kemungkinan mismatch
`min_idr`/`max_idr` frontend vs kolom DB asli `minimum_idr`/`maximum_idr` di `PPJKCostRule.tsx`
— pre-existing, perbaiki kalau diminta eksplisit.

## Cost Validation Courier — panel "Hitung Ulang Estimasi Bonded Storage" (`CostValidationModal.tsx`)

Field bagi dua: **Storage Actual/Storage Weight** langsung dari kolom tabel `tabel_cost_validasi`
(`cv_storage_actual`, `cv_storage_weight_kg` fallback `cv_chargeable_kg`, BUKAN RPC); **Billing
Days/Expected Storage** dari RPC `fn_hitung_storage` (live-preview tiap ETA/Release Date
berubah), dipersist via `fn_save_storage_estimate` (trigger `fn_recompute_totals`) saat klik
"Simpan Estimasi Baru".

**`getActualDays()` — DIHITUNG DI FRONTEND (JS), BUKAN RPC** — `Math.ceil((releaseDate-etaDate)/
1hari)`, dikirim sbg `p_actual_days` ke 2 RPC di atas. **+1**: ETA & Release Date dihitung PENUH
dua-duanya (ETA 1 Sep → Release 3 Sep = 3 hari, bukan 2). Guard `Math.max(0,...)` tetap ada.

**Storage Weight bisa diedit manual** — `<input>` (state `storageWeightManual`, prefill dari
`data` tiap berubah). `checkExpected()` prioritaskan `storageWeightManual`. Disimpan bareng ETA/
Release Date lewat `.update()` langsung ke `tabel_cost_validasi` (`cv_storage_weight_kg`, RPC
`fn_save_storage_estimate` tidak punya param weight) — tetap butuh ETA & Release Date terisi.

**ETA/Release Date prefill dari estimasi tersimpan sebelumnya** — `useEffect([data])` isi dari
`data.cv_eta_date`/`cv_release_date` kalau sudah pernah disimpan, lalu `checkExpected()` jalan
ulang otomatis isi Actual/Billing Days live (Actual/Billing Days sendiri TIDAK disimpan sbg
kolom terpisah).
