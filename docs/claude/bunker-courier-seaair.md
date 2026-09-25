## Sea & Air Audit — "PO Price Detail" bisa diedit manual (2026-09)

`SeaAirAuditRowGroup` (`SharedDataTable.tsx`) — dari 3 `repeatingCols` (`po_ori`/`vendor_inv_no`/
`po_harga_detail`, kolom gabungan banyak nilai dipisah `+`, direplika per baris split via
`splittedData`), **HANYA `po_harga_detail` (PO Price Detail) yang dibuat bisa diedit** saat mode
Edit baris aktif — `po_ori`/`vendor_inv_no` TETAP read-only (tidak diminta user, JANGAN ikut
dibuka tanpa diminta ulang). Sebelumnya SEMUA 3 kolom ini sengaja dikecualikan total dari
rendering input edit (`c.key !== 'po_harga_detail'` dkk di kondisi `isEditing`) — ketiganya cuma
tampil teks + tombol toggle "+N Data"/"Hide", tidak pernah masuk textbox apapun.

- **State terpisah `editHargaSplits: string[]`** (BUKAN bagian `editForm`) — index selaras
  `splittedData` (1 split = 1 elemen array). Diinisialisasi dari `splittedData.map(d=>d.harga)`
  saat `handleStartEdit` diklik. Tiap baris split (termasuk yang baru kelihatan setelah klik
  "+N Data") py `<input>` sendiri terikat `editHargaSplits[i]`.
- **Commit ke DB** — `handleSave` gabung balik array jadi 1 string `" + "`-separated
  (`editHargaSplits.map(v=>v.trim()).filter(Boolean).join(' + ')`) sebelum dibandingkan ke
  `rec.po_harga_detail` & dikirim `onInlineSaveRow` — format string tersimpan TETAP sama persis
  format lama (bisa di-split ulang dgn regex yang sama `/\s*\+\s*|,\s+/` di semua titik baca).
- **Klik "+N Data" saat edit** — tombol expand TETAP tampil terlepas mode edit (tidak digate
  `isEditing`), jadi split ke-2/3/dst bisa dibuka & diedit dalam sesi edit yang sama, bukan cuma
  split pertama.

## Bug fix: badge % Doc Validation Rekapan Sea & Air tidak sinkron dgn modal (2026-09)

Laporan user: badge tombol "Doc Validation" tampil 93%, tapi modal `SeaAirValidasiModal.tsx`
tampil "Overall Accuracy 87%" utk shipment yang SAMA. **Root cause**: modal itu TIDAK PERNAH
percaya `c.match` mentah tersimpan di `dokumen_validasi_matriks_seaair.checks` apa adanya --
`useEffect` load-nya SELALU hitung ulang `c.match` tiap baris non-manual di CLIENT pakai
fuzzyMatch/comparePoSet/matchLocation/strictAlnumMatch (evaluasi "relaxed", lihat kode lama),
HASIL HITUNG ULANG itu TIDAK otomatis ditulis balik ke DB (cuma state lokal `checks`, persist
kalau user klik Simpan). Badge `SharedDataTable.tsx` (`fetchRecords`, tab `sea_air_rekapan`)
sebelumnya baca `m.checks` MENTAH langsung dari DB tanpa evaluasi ulang ini -- kalau algoritma
fuzzy-nya sempat berubah/diperbaiki SETELAH baris itu terakhir disimpan, nilai `match` versi lama
di DB & versi baru hasil hitung ulang modal bisa BEDA, badge & modal jadi tampil % berbeda walau
baca tabel persis sama.

**Fix**: logic evaluasi ulang itu DIEKSTRAK ke `src/utils/SeaAirValidasiHelpers.ts` (fungsi
`relaxSeaAirDocChecks(checks)`, REPLIKA PERSIS -- `toNum`/`strictAlnumMatch`/`comparePoSet`/
`matchLocation`/`fuzzyMatch` ikut pindah ke situ, DIHAPUS dari `SeaAirValidasiModal.tsx` yang
sekarang `import` dari file ini, kecuali `toNum` LOKAL tetap ada di `SeaAirValidasiModal.tsx`
krn dipakai luas di tempat lain file itu yang tidak terkait match-evaluation). Badge
`SharedDataTable.tsx` (`seaAirDocValidationPctMap`) SEKARANG panggil `relaxSeaAirDocChecks()`
DULU sebelum hitung total/match -- badge & modal SELALU pakai nilai `match` yang identik sejak
saat itu. **JANGAN duplikat logic pencocokan ini di tempat ketiga** -- kalau algoritma fuzzy
perlu diubah lagi ke depan, ubah SATU-SATUNYA di `SeaAirValidasiHelpers.ts`, otomatis ikut ke
badge & modal.

## Sea & Air — kolom khusus

- **Audit, "No. PIB" dari `no_aju`** (bukan `no_pib`) — permintaan eksplisit HANYA Sea & Air,
  `PIB_COLS` Courier TIDAK ikut diubah (tetap `no_pib`). `searchCols` sudah cakup kedua kolom.
- **Audit, kolom Balance & Asuransi** — formula hardcode frontend:
  `BALANCE = VALAS_DPP*KURS_NDPBM - (TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`,
  `ASURANSI = 0.5%*(TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`. Diimplementasi di 4 tempat HARUS sinkron:
  `EditModal` useEffect, `handleInlineSaveRow` (diff-based), `fetchRecords`'s `enrichedData` DAN
  `getExportData` (live-computed tiap fetch, krn n8n tidak pernah isi kolom ini). `balance`/
  `asuransi` DIKELUARKAN dari `isInlineEditable()`.
  **Pengecualian Delivery Term CIF (2026-09, permintaan user)**: kalau kolom `delivery_term`
  mengandung "CIF" (case-insensitive substring via `isCifDeliveryTerm()`, module-level SATU-SATUNYA
  tempat definisi ini — cocokkan juga "CIF JAKARTA" dkk, bukan cuma exact "CIF" polos), KEDUA
  formula di atas DIABAIKAN, `balance`/`asuransi` dipaksa **0** — asuransi shipment CIF sudah
  ditanggung seller/freight, jadi kolom ini tidak relevan lagi utk term itu. Berlaku di SEMUA 4
  titik implementasi yang sama (termasuk `depKeys`/dependency re-kalkulasi `EditModal` &
  `handleInlineSaveRow` ikut ditambah `delivery_term`, supaya ganti Delivery Term SENDIRIAN --
  susulan: kolom `balance` diganti `type: 'num'` (SAMA dgn `asuransi`, dulu `'num_dash_null'` --
  SATU-SATUNYA kolom yang pakai string type itu, beda dari `num_dash_if_null` yang dipakai
  `sptnp_total` dkk & SENGAJA TETAP tampil "-" saat 0, TIDAK disentuh) supaya baris CIF (Balance
  DAN Insurance sama2 dipaksa 0) tampil KONSISTEN "0" di kedua kolom, bukan Balance "-" vs
  Insurance "0"
  — tanpa menyentuh 4 kolom angka sumber formula — tetap memicu Balance/Asuransi ke-reset ke 0).
- **Rekapan, badge % Doc/Cost Validation** di tombol (bulat, hijau≥90%/kuning≥60%/merah).
  Dihitung batch di `fetchRecords`, disimpan `r.doc_validation_pct`/`r.cost_validation_pct`.
  Formula REPLIKA PERSIS `globalStats` `SeaAirValidasiModal.tsx` (Doc, exclude `match===null`) &
  `ValidasiShipmentInvoiceLengkap.tsx` (Cost, exclude `section==='SURVEYOR'`). **Kalau formula di
  modal berubah, WAJIB sinkron ulang di 3 tempat ini**.
- **Modal Cost Validasi Shipment & Invoice** ukuran `max-w-6xl max-h-[97vh]`.
- **`SeaAirValidasiModal.tsx`** — kolom "data check" HARDCODE (`INVOICE_FCL_COLS`/`FP_FCL_COLS`
  + `headerColors`), TIDAK otomatis ikut field baru dari backend.

## Bunker & Courier/Sea & Air — Audit Trail: sumber "asing" dari trigger DB, sudah di-guard

Kolom "Catatan" di modal Riwayat (`BunkerAuditLogModal.tsx`) & halaman Audit Trail global sempat
tampil dump JSON RAKSASA (`summary`/`source_files`/`extracted_raw`/dll) — root cause SUDAH
DIKONFIRMASI PENUH (2026-09, user jalankan SQL Editor sendiri): **10 trigger Postgres**
`trg_audit_*` (`fn_audit_bunker_dokumen`/`fn_audit_pib`/`fn_audit_cn`/`fn_audit_courier`/
`fn_audit_seaair`/`fn_audit_rekapan_seaair`/`fn_audit_checklist_validasi`/`fn_audit_cost_validasi`/
`fn_audit_validasi_matriks_seaair`/`fn_audit_cost_validasi_seaair`), semua `AFTER INSERT OR
DELETE OR UPDATE ... SECURITY DEFINER`, cabang `UPDATE` panggil `fn_audit_diff(to_jsonb(OLD),
to_jsonb(NEW))` yang dump SELURUH kolom berubah mentah-mentah ke `catatan` — independen total
dari `logBunkerAudit()`/`logAuditPoAudit()` milik app. Cabang `INSERT`/`DELETE` TIDAK PERNAH isi
`catatan` (kolom itu bahkan tidak ada di daftar kolom insert-nya) — SELALU NULL, aman.

**Fix DB (dijalankan user manual)** — SEMUA 10 fungsi ditambah guard di baris pertama:
```sql
IF auth.email() IS NULL THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END IF;
```
Rasional: n8n konek pakai **service role key** (tidak py sesi JWT → `auth.email()` NULL), user
login SELALU py `auth.email()` terisi — jadi update/insert/delete DARI N8N TIDAK LAGI membuat
baris apa pun di `audit_trail`. Update lewat APLIKASI (user login) TETAP tercatat spt biasa
(termasuk dump mentah `fn_audit_diff` utk 8 dari 10 fungsi) — makanya filter tampilan di bawah
MASIH tetap diperlukan sbg lapis kedua. Data lama (sebelum guard dipasang) TIDAK ikut terhapus
otomatis dari fix ini.

**Fix tampilan** — `TRAIL_APP_WRITTEN_FILTER` (`SharedDataTable.tsx`, dipakai di query trail
list utama & `getExportData`): entri hanya tampil/di-export kalau `catatan` **NULL** (SELALU
lolos — baris INSERT/DELETE tidak pernah py dump panjang) ATAU cocok format resmi app
(mengandung `" — Lama:"` = `logBunkerAudit()`/`logAuditPoAudit()`, atau diawali "Baris dihapus
permanen —" = `logAuditPoDelete()`). **Gotcha yang sudah diperbaiki**: versi pertama filter LUPA
cabang `catatan.is.null` — `.ilike()` terhadap NULL di Postgres selalu FALSE (bukan "lolos"),
jadi SEMUA baris INSERT/DELETE (semua kategori, bukan cuma Bunker) sempat ikut kebuang, halaman
Audit Trail tampil "No data yet" total. Kondisi final:
`'catatan.is.null,catatan.ilike.%— Lama:%,catatan.ilike.Baris dihapus permanen —%'`.
Efek DISENGAJA: kategori Courier & Sea & Air di Audit Trail global TAMPIL KOSONG utk baris
UPDATE (tidak py fungsi log manual sendiri di app ini) sampai/kecuali app nanti nulis log manual
utk 2 modul itu — **kalau nambah fungsi log manual baru ke tabel Courier/Sea & Air, WAJIB pakai
format catatan yang cocok salah satu pola di atas**.

**Susulan (2026-09) — `BunkerAuditLogModal.tsx` (modal per-baris) TERNYATA masih tembus entri
"asing"**: filter lama `splitAuditCatatan(e.catatan) || e.user_email` meloloskan entri kalau
SALAH SATU syarat terpenuhi — trigger `fn_audit_bunker_dokumen` jalan utk SEMUA UPDATE termasuk
yang dipicu user login (bukan cuma n8n), jadi `user_email`-nya JUGA ikut terisi (sama persis
email user yg lagi login), sementara `catatan`-nya tetap dump mentah `fn_audit_diff` (mis.
`status_manual: {} -> {...}`) — laporan user: modal per-baris tampil 2 baris (1 rapi dari
`logBunkerAudit()` + 1 dump mentah), padahal Audit Trail global cuma tampil 1 (sudah tersaring
`TRAIL_APP_WRITTEN_FILTER`). **Fix**: filter modal ini disamakan prinsipnya dgn
`TRAIL_APP_WRITTEN_FILTER` — HANYA andalkan hasil parse `splitAuditCatatan` (`e.user_email`
DIBUANG TOTAL dari kondisi filter), krn `logBunkerAudit()` SATU-SATUNYA fungsi yg menulis ke
tabel ini dari app & SELALU format ketat "{field} — Lama: X → Baru: Y" — entri manapun yg GAGAL
diparse itu BUKAN dari app ini, terlepas `user_email`-nya terisi atau tidak.

Riwayat Bunker LAMA sempat dibersihkan total via `DELETE FROM audit_trail WHERE tabel =
'bunker_dokumen';` (permintaan eksplisit user, dieksekusi user sendiri) — kategori lain
(Courier/Sea & Air/Audit AP) TIDAK ikut dibersihkan.

**Susulan lagi (2026-09) — duplikasi baris FISIK di database, bukan cuma di tampilan**: root
cause di atas (2 sumber tulis independen ke 1 UPDATE yang sama) diperbaiki lebih dalam di trigger
itu sendiri, bukan cuma filter tampilan. **`sql/010_fn_audit_bunker_dokumen_skip_status_manual.sql`
(BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu)** — `CREATE OR REPLACE`
`fn_audit_bunker_dokumen` (didahului `pg_get_functiondef` utk pastikan isi trigger yang ada
SEKARANG tidak asal ditimpa): cabang `UPDATE` sekarang **skip insert `audit_trail` sama sekali**
kalau kolom yang BENERAN berubah HANYA `status_manual` (dibandingkan via `to_jsonb(OLD) -
'status_manual' - 'updated_at' = to_jsonb(NEW) - 'status_manual' - 'updated_at'` — `updated_at`
ikut dikecualikan dari perbandingan krn itu kolom timestamp auto-touch, bukan konten yang
relevan diaudit). Kalau ada kolom LAIN yang ikut berubah bareng `status_manual` dalam 1 UPDATE
yang sama, trigger TETAP jalan normal (baris tetap tercatat apa adanya, `status_manual` TIDAK
dikecualikan dari ISI dump `fn_audit_diff`, hanya dikecualikan dari SYARAT "perlu insert atau
tidak"). Guard `auth.email() IS NULL` & cabang DELETE/INSERT TIDAK disentuh. **Kalau ke depan ada
kolom lain yang JUGA dicatat manual via `logBunkerAudit()` (duplikasi serupa ditemukan lagi),
tambahkan nama kolomnya ke daftar `- 'kolom'` yang sama di trigger ini.**

## Bunker — seksi "Original Documents" (`source_files`) di `BunkerCompareDocModal.tsx`

Kolom `bunker_dokumen.source_files` (jsonb array KUMULATIF, elemen `{filename, file_url,
uploaded_at, job_id}`) ditampilkan sbg seksi "3. Original Documents" (`SourceFilesSection`),
diurutkan terbaru→terlama, TIDAK di-dedupe. `file_url` NULL (dokumen lama/upload gagal, kondisi
NORMAL) → badge abu-abu "Preview unavailable". Array kosong → empty-state "No files uploaded
yet.".

**Preview LANGSUNG di dalam aplikasi** (bukan tab baru) — pola SAMA PERSIS modul lain
(`PreviewModal`) — proxy backend `/api/drive-file-proxy?id=<drive_file_id>`, fetch via JS lalu
suntik `srcDoc`/`blob:` ke iframe. Beda dari modul lain: tabel ini TIDAK py kolom `drive_file_id`
terpisah — `extractDriveFileId()` parse ID dari pola URL Drive umum via regex. ID gagal
diekstrak → `buildBunkerPreviewSrc()` return `null` → badge "Preview unavailable" (BUKAN
fallback ke URL mentah — URL Drive mentah tidak bisa di-`fetch()` dari sini krn CORS). Tombol
"Preview" (ikon `Eye`), modal py tombol "Download File" (`<a target="_blank">` ke `file_url`
ASLI) sbg fallback.

## Courier — Audit, badge % + footer % Cost Validation

Pola sama Sea & Air Rekapan di atas, diterapkan ke `CourierAuditRowGroup`.
**`src/utils/CostValidationHelpers.ts`** — `isRowVisible()`/`computeLiveCostSummary()`
SATU-SATUNYA sumber kebenaran (dipakai `CostValidationModal.tsx` DAN `SharedDataTable.tsx`
fetchRecords). `computeLiveCostSummary()` juga return `pct` — dipakai badge & panel "Overall
Accuracy" footer modal.

**Doc Validation fallback** — `tabel_checklist_validasi` cuma keisi kalau seseorang PERNAH buka
`ValidasiModal.tsx` & klik Simpan (bukan otomatis n8n). `fetchCourierValidationBadgePct()` py
FALLBACK live-calc (REPLIKA logic `CourierValidasiPage.tsx` `needsCalculation`) utk pib_id/cn_id
yg tidak ketemu di tabel itu — JANGAN tulis ulang formula ini di tempat ketiga.

**2 jalur fetch terpisah utk `courier_audit`** (normal PIB/CN vs tab Draft/`archive`) — logic
badge di fungsi module-level `fetchCourierValidationBadgePct(rows)`, dipanggil dari KEDUA jalur.
**Nambah jalur fetch baru → WAJIB panggil fungsi ini juga.**

## Upload Dokumen Susulan — Audit Courier (`CourierUploadSusulanModal.tsx`)

Tombol "Upload Additional Doc" di footer `ChecklistModal` — kirim dokumen susulan tanpa bikin
record shipment baru. REPLIKA `BunkerUploadModal.tsx`+`BunkerKelengkapanModal.tsx`, field hint =
`awb_hint`. `server.ts` forward `awb_hint` **SELALU** append (`|| ''`, bukan cek truthy) baik
client maupun server — restart dev server manual wajib tiap ubah `server.ts`.
⚠️ **KETERGANTUNGAN EKSTERNAL — workflow n8n Courier HARUS diupdate** utk terima `awb_hint` &
MERGE ke record existing — belum ada konfirmasi ini sudah dikerjakan di sisi n8n.
Gate: `canEdit('courier_checklist_dokumen')` — proteksi MURNI UI (proxy Express, bukan RLS).

## Badge % Checklist — Audit Courier & Rekapan Sea & Air

% SUDAH tersimpan langsung (`pct_kelengkapan`), tidak perlu live-compute. Audit Courier:
`rec.pct_kelengkapan` ter-merge via `mergeChecklistData()`. Rekapan Sea & Air: `rec.checklist_pct`
dari batch query `dokumen_checklist_seaair`.

## Bunker — badge % Match & Riwayat Perubahan

- `computeMatrixMatchStats()` (`BunkerHelpers.ts`) — SATU-SATUNYA sumber Match/Warning/Mismatch
  + %, dari `row_status` `matrix_perbandingan`.
- **Riwayat Perubahan** (`BunkerAuditLogModal.tsx`) — pakai ulang tabel `audit_trail` existing.
  **Kolom ASLI tabel**: `id`, `created_at`, `tabel`, `action`, `awb`, `no_dokumen`, `jenis`,
  `user_email`, `catatan` — TIDAK ADA `deskripsi`/`old_value`/`new_value` (`deskripsi` cuma
  label tampilan via view `v_audit_trail`). Semua info di `catatan` format `"{field_label} —
  Lama: {old} → Baru: {new}"`, di-parse `splitAuditCatatan()`. `no_dokumen` = `no_po`. Dicatat
  LANGSUNG dari app (`logBunkerAudit()`, bukan trigger DB).
  **BELUM DIJALANKAN ke Supabase production**:
  ```sql
  create policy "audit_trail_insert_bunker_app" on public.audit_trail
    for insert with check (tabel = 'bunker_dokumen' and public.has_edit_access('bunker'));
  create policy "audit_trail_select_bunker_app" on public.audit_trail
    for select using (tabel = 'bunker_dokumen' and public.has_page_access('bunker'));
  ```

## Courier — Document Validation (`ValidasiModal.tsx`)

**Konteks penting**: file ini punya SECTIONS + `fill()`/`generateValues` SENDIRI, TERPISAH dari
`ValidasiHelper.ts`/`ValidasiFill.ts` — SUDAH TERBUKTI TIDAK SINKRON. **Kalau mau tau/ubah
src-cmp yg BENERAN tampil, baca/edit `ValidasiModal.tsx`, JANGAN `ValidasiFill.ts`.**

- **Kolom "REFERENCE" khusus section `s_pib`** — Src SELALU identik di semua kolom dokumen per
  baris (beda dari `s_inv_freight_duty` yg src BEDA per kolom — JANGAN asumsikan section lain
  sama tanpa verifikasi). `setSrcForGroup(section,field,val)` tulis ke SEMUA row id 1 `groupKey`.
- **Pill status berlabel** — `getCfg(st)`. `STATUS_CONFIG` lama TETAP dead code, jangan
  duplikat mapping lagi.
- **Cmp "(dalam kurung)" tanpa label "vs"** — mode-lihat: kurung + `text-[10px]` + redup `/70` —
  KECUALI section `s_pib` (gaya lama: tanpa kurung, `text-xs`, solid). Kalau section lain diminta
  balik ke gaya lama, tambahkan id-nya ke kondisi `section.id === 's_pib'` di 3 titik (JANGAN
  duplikat blok baru). Pill "empty" → label "Not checked yet" + ikon `Clock`.
- **Border kolom** — SEMUA border vertikal diseragamkan `border-slate-300`/`#cbd5e1` — BUKAN bug
  geometris, kalau ada laporan "border putus" cek kontras dulu.
- **Baris "Subtotal after CN" digabung ke "Subtotal"** — `rowLabel: "Subtotal / Subtotal After
  CN"` di 4 row config (`if02`/`id01`/`cnf02_b`/`cnd02_b`).
- **Lebar kolom "VALIDASI FIELD"** — `w-[160px] min-w-[160px] max-w-[160px] whitespace-normal`
  di SEMUA tabel.
- **"Other Cost"** (PIB Item Value & CIPL Total Item Value kolom PO) bisa diedit manual —
  `otherCost` di `values[id]` (serialize ke `values_json`, tanpa ubah skema/RPC).
- **Sel CN dipindah kolom** — 4 row (`cnf02_b`/`cnd02_b`) `compareDoc` dari "CN INVOICE
  FREIGHT/DUTY" → "FP Revisi Freight/Duty".
- **"DPP"→"DPP / DPP After CN"**, **"PPN"→"PPN / PPN After CN"** (rowLabel saja, `field` mentah
  tidak disentuh).
- **Src baris "No. AWB" kolom SPPB** (`pib02`) = `invF.awb || invD.awb` (samakan `id07`). BUKAN
  retroaktif — checklist yg SUDAH tersimpan tidak ikut ter-update.
- **Bug status "Not checked yet" padahal Cmp terisi** — cabang `fieldName.includes("Referensi
  (")` pakai `||` (salah) → fixed jadi: `if (!srcVal && !cmpVal) return "empty"; if (!srcVal ||
  !cmpVal) return "partial";`.
- **Tabel "NO VESSEL NAME AND IMO NUMBER" gated Document Completeness Checklist** —
  `getDocChecklistFlag()` map PO/CIPL/Final Invoice. `computeStatus(..., docChecked=true)` —
  cek `!docChecked` **PALING AWAL, SEBELUM `isPoNonImi`** (urutan KRITIS — tukar urutan ini bikin
  PO non-IMI bypass total gating checklist). **JANGAN tukar urutan ini lagi.**

## Courier — Document Validation, tombol "Recompute Missing Data" (`ValidasiModal.tsx`)

**Masalah yang diselesaikan**: checklist yg SUDAH tersimpan sejak SEBELUM dokumen sumbernya
lengkap tidak pernah otomatis ter-update (`doLoad()` selalu load `values_json` apa adanya kalau
`tabel_checklist_validasi` sudah py baris, tidak pernah hitung ulang dari `dokumen_validasi` —
"BUKAN retroaktif", sama pola dgn catatan `pib02` di atas). **Kenapa TIDAK digabung ke
`dokumen_validasi` sekalian**: kolom itu ditimpa TOTAL oleh n8n tiap reprocess — kalau checklist
manual ditulis ke kolom yang sama, hasil kerja manual bisa hilang tertimpa n8n tanpa jejak.

**Arsitektur**: `buildValidationValues(raw, docAwb, localNpwps)` (module-level, SATU-SATUNYA
sumber logic fill(), ekstraksi verbatim dari `doLoad()` lama — kalau logic fill() perlu diubah
lagi, ubah DI SINI SAJA). `doLoad()` SELALU hitung `computed = buildValidationValues(...)` →
simpan ke `computedValuesRef` (useRef, bukan state) — dipakai tombol **"Recompute Missing
Data"** (HANYA muncul mode Edit): utk tiap row id, isi **src** kalau `cur.src` kosong DAN belum
`src_edited`; isi **cmp** kalau `cur.cmp` kosong DAN belum `cmp_edited` — dicek TERPISAH (bukan
"isi kalau keduanya kosong", krn kasus nyata sering salah satu sudah terisi). **Field yang SUDAH
terisi (fill() lama ATAU edit manual) TIDAK PERNAH ditimpa** — aman dipakai kapan saja.
`manual_status` (override Match/Mismatch) TIDAK dianggap "sudah diedit" (field terpisah). Simpan
otomatis via autosave debounce yang sudah ada.

**Guard cegah checklist "phantom" kebuat cuma krn user MEMBUKA modal tanpa edit apa pun**:
`userActionRef` (`useRef(false)`) diset `true` HANYA di titik yang beneran dipicu aksi user
(`setObj`, `setSrcForGroup`, `toggleManualStatus`, `handleRecomputeMissing`, 4 `onChange` header)
— TIDAK PERNAH diset di `doLoad()`. Guard di autosave effect: `if (!(existing.length > 0) &&
!userActionRef.current) return;` — baris yg SUDAH ADA tetap diupdate normal, cuma checklist BARU
yang di-skip kalau belum ada aksi user. **Kalau nambah cara edit baru ke `values`/header field,
WAJIB set `userActionRef.current = true` juga di situ** — kalau lupa, edit itu tidak akan pernah
ke-persist ke DB sbg baris checklist baru.

## Courier Audit — kolom "Kurs BI (Rp)" di tab Draft

Tab Draft (gabung PIB+CN) pakai `activeCols=PIB_COLS` yg tidak punya `kurs_bi` — `activeCols`
Draft dibangun via IIFE, sisip `{key:'kurs_bi', label:'Kurs BI (Rp)', type:'num'}` setelah
`kurs_ndpbm`.

## Sea & Air — Catatan Konfirmasi Manual per-Segmen Cost Validation (2026-09, VERSI FINAL)

`ValidasiShipmentInvoiceLengkap.tsx` — tabel `cost_validasi_catatan_seaair` (id, seaair_id,
section, **status_konfirmasi** [`'MATCH'`/`'MISMATCH'`, dipilih EKSPLISIT staf lewat
toggle/dropdown -- BUKAN lagi sekadar "ada baris = confirmed" spt iterasi awal], catatan,
dikonfirmasi_oleh, dikonfirmasi_at). **BELUM PY RLS SAMA SEKALI saat tabel ini pertama ditemukan**
-- **BELUM DIJALANKAN ke Supabase production, WAJIB dijalankan manual dulu, URUTAN**:
1. `sql/017_cost_validasi_catatan_seaair_rls.sql` -- `enable row level security` + 4 policy
   (SELECT via `has_page_access('sea_air_cost_validation')`, INSERT/UPDATE/DELETE via
   `has_edit_access` page_key yang sama -- SATU-SATUNYA page_key yang menggerbangi modal ini,
   lihat `canEdit={canEdit('sea_air_cost_validation')}` di `SharedDataTable.tsx`).
2. `sql/018_cost_validasi_catatan_seaair_unique_constraint.sql` -- `create unique index ...
   (seaair_id, section)` (BUKAN `alter table add constraint if not exists`, Postgres TIDAK
   dukung sintaks itu utk constraint) -- **WAJIB** supaya `.upsert({...}, {onConflict:
   'seaair_id,section'})` di frontend berfungsi (Postgres butuh unique index/constraint di
   kolom conflict target).

Keduanya idempotent, aman dijalankan ulang. Sampai kedua file ini dijalankan, upsert dari modal
akan gagal (error "there is no unique or exclusion constraint matching the ON CONFLICT
specification") ATAU (sebelum RLS aktif) tabel bisa diakses siapa saja tanpa login.

**Konsep fitur**: staf bisa menandai 1 segmen sebagai MATCH atau MISMATCH secara manual, TANPA
mengubah data `checks` asli di `cost_validasi_seaair` -- 1 baris `cost_validasi_catatan_seaair`
= 1 konfirmasi AKTIF per (seaair_id, section), disimpan via **UPSERT** (staf ubah kapan saja =
menimpa baris lama, bukan numpuk baris baru) atau **DELETE total** (hapus konfirmasi kapan saja).

- **HANYA aktif utk 7 segmen**: EMKL, TRUCKING, FREIGHT_ORIGIN, FREIGHT_DESTINATION, STORAGE,
  LOLO, SURVEYOR — `ValidationTable` prop `enableManualConfirmation` (default `false`).
  **"INVOICE CUSTOM" SENGAJA TIDAK ikut** (tidak diminta di requirement fitur ini) — dirender
  tanpa prop ini, badge & blok konfirmasi TOTAL tidak tampil. `renderConfirmableTable(title,
  section)` (helper lokal di komponen utama) hindari duplikasi wiring props yang sama tiap segmen.
- **Blok konfirmasi SELALU tampil** (bukan cuma saat ada mismatch lagi, GANTI dari iterasi awal)
  di bawah tabel tiap 1 dari 7 segmen, kalau `canEdit`: toggle **Match/Mismatch** + textarea
  catatan (placeholder berubah ikut toggle: "Wajib diisi..." saat Mismatch, "(opsional)..." saat
  Match) + tombol **"Simpan Konfirmasi"/"Perbarui Konfirmasi"** (disabled kalau status=Mismatch
  DAN catatan kosong -- validasi FORM SEBELUM submit, dicek ULANG di `handleSaveConfirmation`
  sbg jaring pengaman kedua) + tombol **"Hapus Konfirmasi"** (muncul HANYA kalau sudah ada
  konfirmasi tersimpan). User tanpa `canEdit` yang segmennya SUDAH dikonfirmasi lihat versi
  read-only (status+catatan+oleh siapa, tanpa form). `getConfirmDraft(section)`: draft form pakai
  `catatanDraft[section]` kalau staf SUDAH menyentuh form sesi ini, kalau belum derive dari
  `catatanMap` (konfirmasi tersimpan) atau default `{status:'MATCH', catatan:''}`.
- **Badge header segmen** (di sebelah judul tabel `ValidationTable`) — mengikuti
  `catatan.status_konfirmasi` PILIHAN STAF kalau sudah dikonfirmasi (MATCH=hijau "Match
  (Dikonfirmasi)", MISMATCH=**merah** "Mismatch (Dikonfirmasi)", SAMA warna `StatusBadge` baris
  detail -- BUKAN selalu dipaksa hijau lagi spt iterasi awal). Belum dikonfirmasi -> fallback ke
  hasil hitung otomatis (hijau "Match" kalau semua baris cocok, amber "Perlu Konfirmasi Manual"
  kalau ada baris OVERCHARGE/UNDERCHARGE yg belum ditinjau staf). **Baris DETAIL individual
  (`StatusBadge` per-baris expected/actual/selisih) TIDAK PERNAH ikut berubah** — TETAP tampil
  status asli (merah/kuning) apa adanya, HANYA badge header segmen & persentase keseluruhan yang
  terpengaruh konfirmasi manual.
- **Persentase keseluruhan (globalStats)** — `computeSeaAirCostGlobalStats(checks,
  confirmationBySection)` (`src/utils/SeaAirCostValidasiHelpers.ts`, SATU-SATUNYA sumber formula
  ini) — `confirmationBySection: Map<section, 'MATCH'|'MISMATCH'>` (BUKAN `Set` lagi). Section
  dgn konfirmasi MATCH -> SEMUA baris `checks`-nya dihitung match; MATCH konfirmasi MISMATCH ->
  baris-baris di section itu dihitung tidak-match (pertahankan klasifikasi OVERCHARGE/UNDERCHARGE
  asli baris kalau memang sudah begitu, fallback 'OVERCHARGE' kalau baris itu justru
  komputasinya MATCH tapi segmennya sengaja ditandai Mismatch -- kasus tepi). Section TANPA
  konfirmasi -> `c.status` masing2 baris apa adanya (perilaku lama). SURVEYOR TETAP dikecualikan
  dari total. **TANPA mengubah `checks` yang tersimpan** (murni komputasi tampilan).
- **Badge % Cost Validation di Rekapan Sea & Air (`SharedDataTable.tsx`)** — DIWAJIBKAN sinkron
  dgn modal (pola sama fix badge Doc Validation). `fetchRecords` fetch `cost_validasi_catatan_seaair`
  (kolom `seaair_id, section, status_konfirmasi`, batch chunk 50), bangun
  `Map<seaair_id, Map<section, 'MATCH'|'MISMATCH'>>`, panggil `computeSeaAirCostGlobalStats()`
  yang SAMA PERSIS. **JANGAN duplikat logic hitung Cost Validation % di tempat ketiga manapun** —
  kalau formula perlu diubah, ubah SATU-SATUNYA di `SeaAirCostValidasiHelpers.ts`.

## Sea & Air — Modal Cost Validasi Shipment & Invoice (`ValidasiShipmentInvoiceLengkap.tsx`)

`globalStats` (footer "Cost Validation Summary") — % + progress bar (REPLIKA
`SeaAirValidasiModal.tsx`). `pct = round(match/total*100)`, `total` = SEMUA baris `checks`.
Baris `'SURVEYOR'` DIKECUALIKAN dari hitungan. File ini BELUM diaudit menyeluruh apakah punya
pola SECTIONS/row-col-lookup lain — cek dulu sebelum translate/ubah row/col lain.
