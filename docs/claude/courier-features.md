## Drag & Drop Reorder — Audit Courier (Draft/PIB/CN) & Invoice Recap Courier (2026-09)

Fitur susun ulang urutan BARIS & KOLOM secara manual via drag-and-drop, `SharedDataTable.tsx`
(SATU-SATUNYA file kode yang disentuh). Scope **GLOBAL** (1 urutan sama utk SEMUA user, bukan
per-user — dikonfirmasi eksplisit user, BEDA dari "Customize View"/visibility kolom yang tetap
per-user via localStorage) — dikonfirmasi via 2 pertanyaan ke user sebelum development (scope
penyimpanan Global vs Per-user; drag baris bebas ke posisi manapun lintas SELURUH tabel meski
tab PIB/CN & Invoice Recap pakai server-side pagination `.range()`, bukan dibatasi 1 halaman).
Library: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` + `@dnd-kit/modifiers` (baru
ditambahkan, React 19 compatible).

**Urutan BARIS — 1 kolom `sort_order` (BUKAN 2 kolom + `COALESCE`)** di `tabel_audit_pib`,
`tabel_audit_cn`, `rekapan_courier` (`sql/022_courier_row_sort_order.sql`, **BELUM DIJALANKAN ke
Supabase production — WAJIB dijalankan manual dulu**) — SELALU terisi (PostgREST `.order()`
tidak bisa ekspresi/`COALESCE`, makanya didesain 1 kolom yang selalu ada nilainya, bukan
komputasi di query):
- **Default (baris baru dari n8n, tidak tahu kolom ini sama sekali)**: trigger generik
  `fn_set_default_sort_order()` (`BEFORE INSERT`, dipasang di ke-3 tabel) —
  `sort_order := -extract(epoch from created_at)` kalau `NULL`. Nilai NEGATIF epoch → `ORDER BY
  sort_order ASC` otomatis taruh baris TERBARU di paling atas (rule default "CREATED AT, terbaru
  di atas" TIDAK berubah) — baris upload SETELAH user reorder otomatis nempel ATAS TANPA app
  campur tangan (nilainya pasti lebih negatif dari baris manapun yang sudah ada).
- **Drag manual**: `sort_order` baru = titik tengah 2 tetangga di posisi baru
  (`computeDroppedSortOrder()`, `SORT_ORDER_GAP=1000` kalau didrop di ujung) — commit
  `.update({sort_order}).eq('id',id)` LANGSUNG (bukan RPC, cukup RLS UPDATE `has_edit_access`
  yang SUDAH ADA di ke-3 tabel). **Keterbatasan diterima**: drag berulang PERSIS di titik yang
  sama bisa habiskan presisi float lama-lama, belum di-renormalize otomatis — tangani kalau ada
  laporan nyata (pola project ini).

**Kapan `sort_order` dipakai vs sort-by-kolom (existing)** — `isDefaultSortState(sortColumn,
sortDirection)` = `sortColumn==='created_at' && sortDirection==='desc'` (state SEBELUM user klik
header kolom manapun, default `useState`). Selama tuple ini TIDAK berubah → urutan pakai
`sort_order` ASC (server `.order('sort_order',...)` utk PIB/CN/Invoice Recap; JS
`combined.sort()` utk Draft yang client-side combine PIB+CN — AMAN digabung krn skala epoch
sama persis). Klik header kolom lain → PERILAKU EXISTING TIDAK BERUBAH (urutan manual TETAP
tersimpan DB, cuma "tertutup sementara"). Tombol toolbar **"Reset to Manual Order"** (muncul
kalau state bukan tuple default) = jalan pintas `setSortColumn('created_at');
setSortDirection('desc')`. `getExportData()` ikut logic yang SAMA (`usesRowSortOrderExport`) —
export SEKARANG konsisten dgn urutan layar, Draft branch-nya BARU ditambah sort sama sekali
(sebelumnya tidak sort apa pun).

**Mode Reorder (`reorderMode` toggle toolbar, gated `canEdit('courier_audit')`/
`('courier_rekapan')`)** — drag lintas SELURUH tabel butuh SEMUA baris ter-fetch tanpa
`.range()`, TIDAK match dgn paginasi hemat default. `handleToggleReorderMode()` →
`fetchAllForReorder()` (REPLIKA filter `fetchRecords()`, pola duplikasi yang sudah ada antara
`fetchRecords()`/`getExportData()` di file ini) fetch semua baris cocok filter aktif, order
`sort_order` ASC, ke `reorderRows` state. **Guard >2000 baris** (`reorderTooMany`) — minta user
persempit filter dulu drpd fetch semua & bikin browser berat (banner amber di atas tabel).
`displayRows = reorderMode && reorderRows ? reorderRows : records` — SATU-SATUNYA sumber baris
yang dirender tbody, otomatis fallback ke `records`/paginasi normal saat mode tidak aktif.
Footer pagination & tombol Export **disembunyikan/disabled** selama mode aktif. Tombol "Exit
Reorder Mode" WAJIB `fetchRecords()` (fix 2026-09-26: tanpa ini tabel balik ke snapshot `records`
lama, urutan baru baru tampil setelah refresh manual). **Keluar
otomatis** begitu tab/filter berubah (`useEffect` deps `activeMainTab`/`activeSubTab`/
`courierAuditType`/filter — `reorderRows` snapshot jadi basi kalau scope berubah, cegah drag
"nyasar" ke query yang salah).

Kolom "No." (`type==='index'`) render **grip handle (⋮⋮) + badge bulat oranye** (nomor urut LIVE
posisi array) SAAT `reorderMode` — di luar mode, tampilan TETAP seperti sebelumnya (teks biasa).
`CourierAuditRowGroup`/`CourierRekapanRowGroup` panggil `useSortable({id:rec.id,
disabled:!reorderMode})` TANPA SYARAT (Rules of Hooks — hook selalu dipanggil, listener/transform
yang kondisional), ref/style HANYA dipasang ke `<tr>` PERTAMA (baris split PO lanjutan TIDAK ikut
ter-transform saat drag, keterbatasan diterima, kasus jarang). `handleRowDragEnd()` — `arrayMove`
+ hitung `sort_order` baru + `.update()` (tabel target: `rekapan_courier` utk Invoice Recap;
`tabel_audit_pib`/`cn` utk Audit Courier, ditentukan dari `jenis_dokumen` (Draft) atau
`courierAuditType` (PIB/CN tab), pola sama `handleUndraft`).

**Bug fix — drag tidak bisa dipicu sama sekali (2026-09, laporan user setelah versi awal)**:
root cause CSS `transform` TIDAK reliable diterapkan ke elemen `<tr>`/`<th>` (keterbatasan
dikenal luas dnd-kit + tabel HTML, beda browser beda hasil) — versi awal cuma andalkan
`transform`+`ref` LANGSUNG di `<tr>`/`<th>`, tanpa preview terpisah. **Fix**: `<DragOverlay>`
(dnd-kit, portal ke `document.body` — div biasa, BUKAN elemen tabel, `transform`-nya SELALU
jalan) ditambahkan di KEDUA `DndContext` (baris & kolom) sbg preview yang mengikuti kursor;
`ref={sortable.setActivatorNodeRef}` ditambahkan ke tombol grip (pola resmi dnd-kit saat drag
handle beda elemen dari node yang di-sort). Baris/kolom SUMBER (bukan overlay) cuma diredupkan
(`opacity`) saat `isDragging`, TIDAK lagi andalkan `transform` utk elemen tabel aslinya.

**Susulan — animasi drag dihaluskan (2026-09, permintaan user "bisa dibuat lebih smooth")**:
(1) `@dnd-kit/modifiers` (`restrictToVerticalAxis` utk `DndContext` baris,
`restrictToHorizontalAxis` utk kolom) — overlay preview dipaksa bergerak PERSIS 1 sumbu (vertikal
utk baris, horizontal utk header kolom) drpd bebas diagonal, kesan gerakannya jadi jauh lebih
"terkontrol"/smooth. (2) `transition` (baris/kolom SUMBER, `sortableStyle`/`SortableColumnHeader`
`style`) diberi fallback eksplisit `'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)'` kalau
`sortable.transition` kosong (dnd-kit default), easing lebih halus & KONSISTEN di baris & kolom.
`opacity` baris/kolom yg di-drag diredupkan sedikit lebih (0.5→0.4) biar kontras dgn overlay
lebih jelas.

**Urutan KOLOM — tabel global BARU `table_column_order`** (`sql/023_table_column_order.sql`,
**BELUM DIJALANKAN ke Supabase production**) — `menu` (`'courier_audit'`|`'courier_rekapan'`,
SAMA partisi dgn `activeCourierCustomizeMenu` Customize View yang sudah ada — `courier_audit`
mewakili Draft+PIB+CN sekaligus, `courier_rekapan` semua sub-tab PPJK) + `column_order` (jsonb
array key). RLS: SELECT via `has_page_access`, INSERT/UPDATE/DELETE via `has_edit_access` (per
menu). `reorderCols(baseCols, storedKeys)` (module-level, pure) — kolom `type==='index'` SELALU
posisi PERTAMA (struktural, tidak ikut drag); key tersimpan yang sudah tidak ada di kode di-skip,
kolom BARU yang belum pernah ada di `storedKeys` di-APPEND akhir (graceful). Dipakai SEBELUM
filter hidden-set Customize View (`orderedActiveCols` → `visibleCols`, 2 concern independen,
tidak saling ganggu). `SortableColumnHeader` (komponen terpisah, WAJIB krn `useSortable()` tidak
boleh dipanggil di dalam callback `.map()` biasa — Rules of Hooks) — draggable (whole `<th>`,
BUKAN handle kecil spt baris) HANYA kolom data (bukan `index`) SAAT `reorderMode`; klik-utk-sort
(existing) HANYA aktif saat BUKAN `reorderMode` (2 gesture sengaja saling eksklusif).
`handleColumnDragEnd()` → `.upsert({menu, column_order, updated_by}, {onConflict:'menu'})`.
**Export kolom OTOMATIS ikut** — `ExportModal` sudah terima `cols: visibleCols` (lihat bagian
"Export Excel — ikut Customize View" di bawah), tidak perlu sentuh `ExportModal.tsx` sama sekali.

## Audit Courier — revisi rule Undraft, tombol Edit PIB/CN, highlight/badge NAS Submit Date, counter outstanding PIB/CN (2026-09)

Konteks user: PIC Invoice Recap & PIC Audit orang BERBEDA, isi manual "Doc Acceptance" nyulitkan
tracking siapa yang proses. 4 revisi, SEMUA di `CourierAuditRowGroup`/`fetchOutstandingCount`
(`SharedDataTable.tsx`), tab Draft/PIB/CN (`courierAuditType`). Alur upload dokumen (otomatis
kebagi ke Draft & Invoice Recap) & menu Action tab Draft (Edit/Checklist/Doc Validation/Cost
Validation/Undraft/Delete) **TIDAK BERUBAH SAMA SEKALI** — cakupan revisi ini murni 4 poin di
bawah.

1. **`handleUndraft` — Doc Acceptance auto-isi tanggal sistem**. Setelah RPC
   `fn_undraft_pib`/`fn_undraft_cn` (SUDAH ADA, dibuat user sendiri — TIDAK diubah signature-nya)
   sukses mindah status ARCHIVED→LENGKAP (baris otomatis "pindah" ke tab PIB/CN krn query tab itu
   sudah `.neq('status','ARCHIVED')`), langsung susul 1 `.update({doc_acceptance: todayIso})`
   langsung ke `tabel_audit_pib`/`tabel_audit_cn` (pola sama `handleInlineSaveRow`, BUKAN
   parameter RPC — RPC tsb dibuat user sendiri, jangan diubah tanpa konfirmasi ulang, lihat bagian
   "Peta RPC function Supabase" CLAUDE.md utama). `todayIso = new Date().toISOString().slice(0,10)`
   — TANPA input manual apa pun.
2. **Tabel PIB & CN — tombol Edit ditambahkan, bisa edit semua kolom termasuk NAS Submit Date**.
   Root cause lama: `editingThisRow` (mengontrol SEMUA rendering kolom jadi input) DAN visibility
   tombol Edit/Save di panel Action sama-sama digerbangi `rec.status !== 'LENGKAP'` — begitu baris
   di-Undraft (status jadi LENGKAP), SATU-SATUNYA tombol yang muncul di tab PIB/CN cuma
   "📦 Unarchived" (`onArchive`). **Fix**: syarat `rec.status !== 'LENGKAP'` DIHAPUS dari
   `editingThisRow` dan dari kondisi tombol Edit/Save — tab Draft TIDAK terdampak (baris di situ
   status-nya SELALU `ARCHIVED`, restriksi itu memang tidak pernah kena di sana). Tombol
   Checklist/Doc Validation/Cost Validation/Delete TETAP tersembunyi utk status LENGKAP (TIDAK
   diminta ikut dibuka — kalau diminta lagi, itu perubahan terpisah). `tgl_submit_nas` (NAS Submit
   Date) SUDAH ada di `PIB_COLS`/`CN_COLS` & TIDAK dikecualikan `isInlineEditable()`, jadi otomatis
   ikut ter-edit (`<input type="date">`) begitu tombol Edit baris ini dipakai — tidak perlu kode
   tambahan lagi.
3. **Auto-highlight baris + badge "🗄️ Archived"** — `nasSubmitted = !!getVal(rec,
   'tgl_submit_nas')` (pakai `getVal()`, BUKAN `rec.tgl_submit_nas` mentah, supaya ikut
   pending-edit yang BELUM disimpan juga — highlight langsung berubah saat user mengetik
   tanggalnya). Baris dgn `nasSubmitted` true → `bg-emerald-50/70` + `border-l-[3px]
   border-l-emerald-400` (SENGAJA warna hijau/emerald, BUKAN kuning `#FFF5C5` yg sudah dipakai
   fitur BEDA "Highlight baris Submit Date — Rekapan Courier" di bawah — field beda
   (`tgl_submit_nas` tabel PIB/CN vs `submit_date` `rekapan_courier`), warna disengajakan beda
   supaya 2 fitur highlight ini tidak tertukar makna di mata user) — kalah prioritas dari highlight
   edit aktif (`bg-blue-50/50` tetap menang kalau `editingThisRow`). Badge chip "🗄️ Archived"
   (hijau, `w-[80px]`) muncul di atas tombol "Action" pada kolom sticky kanan, kondisi sama
   `nasSubmitted`. Diterapkan di `CourierAuditRowGroup` (dipakai bersama ketiga tab Draft/PIB/CN —
   satu implementasi, otomatis berlaku ke semua tabel Audit Courier yang punya konsep archive).
4. **Badge counter outstanding — diseragamkan ke tab PIB & CN** (SEBELUMNYA cuma tab Draft yang
   py badge). State `draftOutstandingCount` (single number) DIGANTI
   `courierAuditOutstandingCounts: {archive, pib, cn}` — `fetchOutstandingCount()` sekarang
   query 4 kombinasi paralel (Promise.all): PIB+CN `status='ARCHIVED'` (Draft, TIDAK BERUBAH dari
   formula lama) DAN PIB+CN `status<>'ARCHIVED'` (PIB/CN tab, BARU) — SEMUANYA
   `.is('tgl_submit_nas', null)` (outstanding = NAS Submit Date masih kosong, BUKAN total baris —
   rule ini WAJIB SAMA di ketiga tab, permintaan eksplisit user). Render toolbar pill Courier
   Audit Type di-refactor dari kondisi hardcode `type.id === 'archive'` jadi lookup
   `courierAuditOutstandingCounts[type.id]` generik — badge otomatis muncul di ketiga tab tanpa
   percabangan tambahan.

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
