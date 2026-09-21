## Sea & Air — kolom khusus

- **Audit, "No. PIB" dari `no_aju`** (bukan `no_pib`) — permintaan eksplisit HANYA Sea & Air,
  `PIB_COLS` Courier TIDAK ikut diubah (tetap `no_pib`). `searchCols` sudah cakup kedua kolom.
- **Audit, kolom Balance & Asuransi** — formula hardcode frontend:
  `BALANCE = VALAS_DPP*KURS_NDPBM - (TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`,
  `ASURANSI = 0.5%*(TOTAL_INV_FREIGHT+ITEM_PRICE_IDR)`. Diimplementasi di 3 tempat HARUS sinkron:
  `EditModal` useEffect, `handleInlineSaveRow` (diff-based), `fetchRecords`'s `enrichedData` DAN
  `getExportData` (live-computed tiap fetch, krn n8n tidak pernah isi kolom ini). `balance`/
  `asuransi` DIKELUARKAN dari `isInlineEditable()`.
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
format catatan yang cocok salah satu pola di atas**. `BunkerAuditLogModal.tsx` (modal per-baris)
TIDAK diubah, filter client-side-nya independen & tetap valid.

Riwayat Bunker LAMA sempat dibersihkan total via `DELETE FROM audit_trail WHERE tabel =
'bunker_dokumen';` (permintaan eksplisit user, dieksekusi user sendiri) — kategori lain
(Courier/Sea & Air/Audit AP) TIDAK ikut dibersihkan.

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

## Sea & Air — Modal Cost Validasi Shipment & Invoice (`ValidasiShipmentInvoiceLengkap.tsx`)

`globalStats` (footer "Cost Validation Summary") — % + progress bar (REPLIKA
`SeaAirValidasiModal.tsx`). `pct = round(match/total*100)`, `total` = SEMUA baris `checks`.
Baris `'SURVEYOR'` DIKECUALIKAN dari hitungan. File ini BELUM diaudit menyeluruh apakah punya
pola SECTIONS/row-col-lookup lain — cek dulu sebelum translate/ubah row/col lain.
