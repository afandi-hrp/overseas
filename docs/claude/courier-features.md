## Invoice Recap Courier — tampilan baru per AWB (2026-10-02)

Keputusan user & SQL: CLAUDE.md "Rombak Invoice Recap Courier" + "Invoice Recap Courier per AWB". Pola SAMA Invoice
Recap Sea & Air (token `SeaAirAuditUi.tsx`, font Sora); mode **List** = tabel lama `CourierRekapanRowGroup` APA ADANYA
(Reorder/Edit Mode/Customize View/Export tetap). Default mode = Card (state `courierRecapView`, tidak disimpan).

- **Export & "+ Add manually" mode Card (2026-10-02, permintaan user)**: DIPINDAH dari header ke ujung kanan panel filter
  (kelompok `ml-auto`, tombol `h-9 rounded-xl`, `renderExportBtn(true, true)`). Panel filter Audit Courier mode Card
  `flex-wrap` (BUKAN nowrap + overflow-x) supaya di laptop 14" kelompok tombol turun ke baris 2 & tetap terlihat.
  **Susulan 2026-10-02 (user: harus 1 baris di laptop 14")**: panel = `@container`; di bawah lebar panel 1450px label
  dipersingkat ("PPJK date"->"PPJK", "Company"->"PT", "+ Add manually"->"+ Add" + tooltip), Search `min-w-[150px]`,
  select PT `max-w-[110px]`, input tanggal `w-[104px]`. `flex-wrap` tetap sbg cadangan layar lebih sempit.
- **Footer pagination BERSAMA `src/components/PaginationFooter.tsx` (2026-10-02, permintaan user: warna SAMA di semua
  halaman)**: dipakai footer SharedDataTable (Audit/Invoice Recap Courier & Sea & Air), kartu Invoice Recap Courier (dulu
  latar putih + panah, beda warna) & Finance Handover. Gaya = footer lama SharedDataTable (bg-slate-50, Prev / Page X of Y /
  Next) + Rows per page. Halaman list baru WAJIB pakai komponen ini.
- **Rows per page (2026-10-02, permintaan user)**: pilihan 10/20/50/100, default 10 -- di footer pagination BERSAMA
  SharedDataTable (Audit Courier, Audit PIB & Invoice Recap Sea & Air, Invoice Recap Courier mode List; nonaktif selama
  Reorder Mode) & footer kartu Invoice Recap Courier (`CourierRecapCardView`, dulu tetap 12/halaman).
- **Reorder Mode di tampilan Card Audit Courier (2026-10-02, permintaan user)**: tombol "Reorder"/"Done" di panel filter Card,
  syarat SAMA List (`showReorderButton`: tab PIB/CN bukan Draft, tanpa filter, `canEdit`). Tiap kartu dibungkus
  `SortableCardShell` (useSortable, grip + nomor posisi GLOBAL + popover "Move to" = `ReorderIndexCell` prop `asDiv`), simpan
  lewat handler SAMA List (`handleRowDragEnd` / `handleMoveRowTo`, kolom `sort_order`). Banner teks versi Card. Ganti Card<->List
  = keluar Reorder. **Invoice Recap Courier TETAP tanpa drag di Card** (kartu per AWB berisi beberapa invoice, urut email
  terbaru -- keputusan user #4; drag hanya mode List). Baris "N draft records" (Audit) & "N AWB · newest email received
  first" (Recap) DIHAPUS (permintaan user). Uji: jsdom courier_reorder 11 cek.
- **Header 4 halaman Courier & Sea & Air (2026-10-02, permintaan user)**: label kecil "COURIER"/"SEA & AIR" di atas judul
  DIHAPUS, diganti 1 baris keterangan halaman di BAWAH judul (gaya sama Finance Handover).
- **Header** eyebrow "Courier" + "Invoice Recap". **Kartu filter** (mode Card): tab PPJK (state `activePpjkFilter` SAMA
  toolbar lama, filter `ilike %X%` -> tab per-PPJK hanya invoice PPJK itu), Search (kolom yang diizinkan role), Email
  date (`tgl_terima_email`), Company, Card|List, Refresh. Mode List: toggle Card|List ditambahkan di toolbar lama.
- **5 KPI** (`fetchCourierRecapSummary`, filter sama daftar): AWB, Freight + Duty, Total (− credit notes), Not submitted
  to Finance, Submitted · unpaid.
- **Kartu = 1 AWB** (urut email terbaru per AWB; baris tanpa AWB = kartu sendiri "No AWB"): AWB tanpa prefix carrier,
  chip PPJK (tanpa "OWN"), PT, rentang email; chip jenis invoice (Freight/Duty/Credit Note + jumlah), origin · berat, PO
  (+N/Hide), vessel; pill status (Not submitted / "n/N submitted" / Submitted to Finance / Paid), chip Audit "PIB · Draft/Audited"
  + "↻ Re-audit" + titik validasi (klik = buka tab itu) ATAU chip merah "Not found in Audit"; Total = Freight + Duty − CN
  (baris kecil "charges − CN"); tombol Validation (kalau ada pasangan Audit) & Open. Paging 12 kartu sendiri
  (`CourierRecapCardView`), refresh lewat `courierRecapNonce` (Submit/tutup Validation/Refresh/simpan di List).
- **Jendela Open** (`CourierRecapDetailModal`): header Total, Validation, View in Audit (`/courier/audit?q=<awb>`),
  Edit in List (tutup jendela, pindah ke List, Search = AWB), Submit all to Finance / "Submit all (N left)".
  Tab **Overview** (Shipment, Audit PIB/CN + "Linked record"/"Same AWB", Total dgn CN terpisah + total akhir, Split per
  vessel = jumlah breakdown per vessel tiap invoice dikurangi CN, daftar Finance per invoice) · **Invoices (N)** (sub-tab
  Freight/Duty/Credit Note; kartu per invoice: nominal, NTPN/PO/remarks, chip Sent/Received/Paid, tombol Submit to
  Finance, tabel PO · Vessel · breakdown) · **Audit trail** (`CourierAuditTrail` + loader `fetchRecapCourierLog`,
  `v_audit_trail` tabel `rekapan_courier` cocok AWB).
- **Submit to Finance**: per invoice / semua invoice AWB, konfirmasi, isi `submit_date` = hari ini (lokal) HANYA yang
  masih kosong; TANPA syarat & TANPA kunci (keputusan user).
- **Validation dari Recap** = `CourierValidationWindow` baru (tanpa Overview) utk PIB/CN pasangan; bisa diubah HANYA kalau
  PIB/CN masih Draft (Audited = lihat saja) — aturan SAMA Audit Courier.
- **Batas kolom role** (`getAllowedColumns('courier_rekapan')`): kolom tak diizinkan tidak tampil di kartu/Open/KPI
  ("Amounts hidden for your role" kalau `total_amount` disembunyikan).
- Re-audit (sql/037): chip "↻ Changed in Invoice Recap — please re-audit" juga di kartu Audit Courier & banner Overview.
- **Panel filter mode Card (2026-10-02, permintaan user, perlakuan SAMA Audit Courier)**: `@container` + `flex-wrap`; di bawah
  lebar panel 1500px label dipersingkat ("Email date"->"Email", "Company"->"PT", "Needs attention"->"Attention");
  **Export DIPINDAH dari header ke ujung kanan panel** (`renderExportBtn(true, true)`, kelompok `ml-auto`).
- **2026-10-02 bagian 2** (sql/038): tombol filter "Needs attention" + badge sidebar, kunci setelah Submit to Finance
  (List: "🔒 Locked" tanpa Edit/Delete; Open: chip Locked + Unlock (Admin) dgn alasan). Detail: CLAUDE.md
  "Courier 2026-10-02 bagian 2".

## Audit Courier — tampilan baru "PIB & CN Audit" (2026-10-01)

Mengikuti Audit PIB Sea & Air (token `SeaAirAuditUi.tsx`, font Sora). Keputusan user: samakan dgn Audit PIB
Sea & Air + sesuaikan perbedaan (tab Draft/PIB/CN, Admin penalty CN, NAS Submit Date, batas kolom role
Finance); fitur tabel lama (Reorder drag, Edit Mode massal, Customize View, Export) TETAP di mode **List**
(tabel & toolbar 2 baris lama APA ADANYA + toggle Card|List); Open = jendela Validation + tab Overview;
label "Undraft" -> **Mark as audited**, "📦 Unarchived/Draft" -> **Move back to Draft** (logika sama, RPC
`fn_undraft_*` + Doc Acceptance otomatis / `fn_archive_*`); form Edit/Add baru dgn auto-calc 7 kolom; badge
Draft di sidebar; **TIDAK ADA kunci validasi** (validasi = info saja); tab Draft/PIB/CN (tanpa All).

- **File**: `src/utils/CourierAuditHelpers.ts` (SATU sumber: auto-calc dipindah dari SharedDataTable,
  `courierDocType`, `computeCourierBuildUp`/`computeCourierDutyRows`, `fetchCourierAuditSummary`,
  `fetchCourierAuditLog`, badge sidebar), `CourierAuditCardList.tsx` (5 KPI + kartu), `CourierAuditOverview.tsx`
  (tab Overview), `CourierAuditEditModal.tsx` (Edit/Add). `CourierValidationWindow.tsx` diperluas prop opsional
  `overview`/`initialTab`/`title`/`subtitle`/`headerActions` (tanpa prop itu = perilaku lama persis).
  SharedDataTable: cabang `isCourierAuditView` (header, toolbar Card, area kartu, modal) +
  `undraftCourierRecord`/`archiveCourierRecord` (return boolean, dipakai tombol lama & jendela Open).
- **KPI** (`fetchCourierAuditSummary`, filter SAMA daftar: Company/tanggal PPJK/search kolom yg diizinkan
  role, tanpa filter tab; auto-calc di-apply): Records (draft·PIB·CN), Customs value, Duties & taxes (BM/PPN/
  PPh/Adm), Not submitted to NAS, Validation incomplete (Draft dgn tab validasi yg boleh dilihat <100%/belum
  ada — dihitung dgn `mergeChecklistData` + `fetchCourierValidationBadgePct` yg SAMA tombol Validation).
- **Kartu**: jenis dokumen + tgl PPJK, No. PIB / No. SPPBMCP, Via/Term, AWB apa adanya | PT + supplier + PO
  (+N) + chip Accepted (Doc Acceptance) & NAS submitted | Duty & tax (`total_pib_cn`) + BM/PPN/PPh % +
  "incl. admin penalty" (CN) | pill Draft/Audited + 3 titik validasi (klik = buka tab itu) + Open. Garis kiri:
  amber Draft, hijau NAS submitted, ungu audited. Urutan = urutan `records` (sort_order PIB/CN).
- **Jendela Open** (`CourierValidationWindow` + `overview`): tab Overview (Validation info-only, Document,
  Goods per PO As recorded/Split evenly, Customs value + Check difference, Duties & taxes + Admin penalty +
  invoice duty, Checks) · Documents (Checklist + Doc validation) · Costs · Audit trail (sejak 2026-10-01, lihat
  sub-bagian di bawah). Validasi bisa DIEDIT hanya
  saat Draft (sama tombol lama); Audited = lihat saja. Header: Edit, Mark as audited / Move back to Draft,
  Delete (hanya Draft di tab Draft — DeleteModal jalur Draft). Setelah aksi, baris dibaca ulang
  (`reloadCourierRow`, enrich sama fetchRecords) & jendela tetap terbuka.
- **Form Edit/Add** (`CourierAuditEditModal`): menulis kolom yg sama form lama langsung ke tabel_audit_pib/cn,
  hanya field yg berubah; 7 kolom auto-calc tampil "AUTO", mengetik = manual biru (+ tombol kembali ke otomatis),
  `manual_override_fields` ikut tersimpan; PPN/PPh % ditampilkan persen (DB pecahan). Add = Draft (status
  ARCHIVED, jenis PIB/CN dipilih), wajib AWB + tgl PPJK; "Save & mark as audited" = insert/update lalu
  `undraftCourierRecord`. Tombol "Add Data" mode List juga membuka form baru ini.
- **Batas kolom role** (`makeColOk(getAllowedColumns('courier_audit'))`): kolom tak diizinkan TIDAK tampil di
  kartu/Overview/KPI ("Hidden for your role") & TIDAK ada/dikirim di form.
- **Bug fix ikut**: key React baris tabel List Audit Courier kini `${jenis}-${id}` (dulu `id` saja -> PIB & CN
  ber-id sama di tab Draft bentrok key, baris bisa dobel/hilang). Saat membangun fitur ini sempat ketemu bug
  key kembar jendela Open vs form Edit (jendela terduplikasi -> Delete mengenai baris salah) — sudah diberi
  awalan `courier-open-`/`courier-edit-`; JANGAN pakai key `${jenis}-${id}` polos utk 2 elemen sibling.
- **Diuji**: jsdom 39 cek (KPI, tab, kartu PIB/CN, List↔Card, Open/Overview/tab validasi, Mark as audited &
  Move back (RPC+DB+Doc Acceptance), Edit (field berubah saja, auto-calc, override), Add CN + Save & mark as
  audited, Delete draft CN benar, role Finance, view-only, badge sidebar). Belum dites di production.

### Mode List = tampilan SEBELUM rombak (2026-10-02, keputusan user)

Pola Invoice Recap Sea & Air: mode **List** Audit Courier memakai tampilan LAMA, mode **Card**/jendela Open memakai yang
baru. Tombol "✅ Validation" tabel List membuka `CourierValidationWindowLegacy` (tab Checklist | Doc Validation | Cost
Validation, strip Shipment Info, tabel matriks, tombol Edit/Edit Cost Validasi, autosave Doc Validation) — file
`*Legacy.tsx` (`CourierValidationWindowLegacy`, `ValidasiModalLegacy`, `CostValidationModalLegacy`,
`ValidasiPerhitunganPIBLegacy`, `validationWindowStylesLegacy.ts`) = SALINAN PERSIS git `9d5d88a` (beda hanya import,
diverifikasi diff). ChecklistModal prop `legacy` = cabang embedded lama (token `*_L`, `catatanInputLegacy`). Tombol
"Add Data" toolbar List = form lama (`EditModal`/`showAddRowModal`), "+ Add manually" header mode Card = form baru.
Header halaman & toggle Card|List tetap baru di kedua mode (sama Sea & Air). **Susulan 2026-10-02 (permintaan user: "header tidak boleh berubah saat
pilih List")**: kartu KPI + panel filter BARU dipakai di Card DAN List (Audit & Invoice Recap Courier); toolbar lama 2 baris
TIDAK dirender lagi utk Courier (cabang `isCourierToolbar` tak terjangkau, kode dibiarkan). Tombol khusus tabel muncul di
panel HANYA saat List: Customize View (ikon), Edit Mode, Reset sort ("Manual order"/"Default sort"), Reorder (Recap: tab
per-PPJK), "+ Add" = form Add Data LAMA (Card = form baru Audit). "Needs attention" Recap hanya di Card. KPI Recap kini juga
dihitung saat List. **Kalau logika (load/simpan/RPC) salah
satu versi diubah, WAJIB sinkron ke versi lainnya** (versi baru: ChecklistModal non-legacy, ValidasiModal,
CostValidationModal, ValidasiPerhitunganPIB). Diuji: `courier_ui` 56 cek (termasuk 6 cek mode List legacy).

### Tab Documents / Costs / Audit trail ala Invoice Recap Sea & Air (2026-10-01, VERSI FINAL)

Iterasi 1 (restyle tabel lama) DITOLAK user: harus SAMA dgn jendela Open Invoice Recap Sea & Air (di Sea & Air
checklist/doc/cost ada di Recap, di Courier ada di Audit). **Keputusan user**: (1) tombol Doc validation spt Sea &
Air — tanpa mode Edit, simpan lewat bar Save/Discard; (2) "Correct" membuka 2 kotak (nilai dokumen sumber & nilai
pembanding); (3) Costs opsi A — TANPA review per invoice ("Accept difference/Ask vendor" butuh tabel baru, belum),
status per baris tetap manual spt dulu; (4) Shipment Info pindah ke kartu Document Overview; (5) hak edit tetap per
page_key lama & hanya selama Draft (TANPA aturan Admin-only Sea & Air); (6) nama tab ikut Sea & Air.
- **Jendela** (`CourierValidationWindow`): tab **Overview | Documents | Costs | Audit trail** (Documents tampil kalau
  boleh lihat checklist ATAU doc; Costs kalau cost). Pil skor kanan "Doc complete / Doc match / Cost" (%), titik tab
  Documents = terburuk checklist/doc, titik kuning kecil = perubahan belum disimpan. Tab Documents/Costs dipasang
  saat pertama dibuka lalu tetap terpasang; tutup (X/klik luar) dgn perubahan belum disimpan -> konfirmasi.
  `initialTab` 'checklist'/'doc' -> Documents, 'cost' -> Costs (titik kartu & chip Overview). `overview` = fungsi
  `({ openTab, cv }) => node`. Strip Shipment Info HANYA di jendela mode List (tanpa Overview); helper
  `courierShipmentInfo(cv)` = satu sumber format (dipakai Overview & strip).
- **Documents** = grid `[320px | 1fr]`: kiri **ChecklistModal embedded** (kartu Checklist Sea & Air: % + bar,
  Missing, tile Required merah/hijau & Optional, catatan; klik tile = centang; **baris tombol di ATAS kartu**: Upload
  additional doc (CourierUploadSusulanModal SAMA, kirim n8n tidak berubah) + Save checklist/Discard saat ada perubahan —
  `handleSave` & payload SAMA. Kolom kiri TIDAK sticky: versi awal menaruh tombol di bawah kartu sticky yg lebih tinggi
  dari layar -> tombol Upload tidak kelihatan (laporan user 2026-10-01), JANGAN diulang), kanan **ValidasiModal embedded**:
  kartu ringkasan (Match/Mismatch/Not filled + akurasi + meta Check date/Checked by/No. AWB/Manual change notes yg
  langsung bisa diisi + Recompute missing data + Expand/Collapse all), banner mismatch belum dikonfirmasi, kartu
  section lipat (mismatch terbuka otomatis) berisi **per field** (label + hint + "Reference" utk s_pib) -> daftar
  dokumen per baris: titik warna dokumen, nilai sumber + "(nilai pembanding)" (s_pib: nilai dokumen saja), chip
  status (✎ = manual), aksi **✓ Checked — accept / Mark mismatch** (`applyManualStatus` -> `manual_status` SAMA
  klik pil lama) / **Correct** (2 kotak: sumber — utk s_pib "Reference" lewat `setSrcForGroup` — & pembanding via
  `setObj`, + Other cost utk 2 baris khusus) / **Undo** (kembali ke snapshot tersimpan). Kalkulasi PIB/SPPBMCP di
  bawah (tombol "Edit calculation values" = isEditMode komponen itu). Simpan = bar "Unsaved changes · Discard /
  Save changes" -> `persistChecklist()` (DIEKSTRAK dari body autosave lama, isi payload & guard `userActionRef`
  TIDAK berubah; return pesan error). **Mode embedded TIDAK autosave lagi**; mode standalone tetap autosave 2 dtk.
  Snapshot `docSnap` diambil tiap selesai load & setelah Save; dirty = JSON beda snapshot.
- **Costs** (`CostValidationModal` embedded): ringkasan (OK/Difference/N/A, akurasi, "n of m invoices match the
  rate sheet", chip Edited), kartu **Rate basis** (Ship date / Origin code / Chargeable weight bisa langsung diisi =
  panel "Edit Shipment Info" lama), kartu lipat **Invoice freight / Invoice duty** (header total + "+Rp x over" +
  pill), tabel Item/Expected/Actual/Difference/Status: Actual (& Expected bonded storage) **klik utk mengisi**
  (`AmountCell`), chip status **klik utk pilih status manual** (`StatusCell`, opsi SAMA dropdown lama), Difference
  live selama ada perubahan, "Show all lines (incl. empty)" = baris yg disembunyikan `isRowVisible` (dulu hanya
  muncul saat Edit). Perubahan pertama menyalin `data` ke `editForm` (`editField` = handleEditClick +
  handleFieldChange lama) -> bar Save/Discard = `handleSaveEdit`/`handleCancelEdit` lama (RPC fn_update_actual_value
  + update tabel tidak berubah). Credit note (Deduct CN, riwayat + Revise) & Recalculate bonded storage tetap,
  dikunci selama ada perubahan belum disimpan (sama dulu: tersembunyi saat Edit) & hanya utk user ber-hak edit.
  `otherRowsModel()` = SATU sumber hitung baris Other Charges (dipakai tampilan lama & baru).
  **Review per invoice (2026-10-02, sql/038)**: kotak `CourierCostReviewBox` di bawah header kartu Invoice freight/duty
  (juga di versi lama mode List) — Accept difference / Ask vendor to revise, ikut dihitung di persen (lihat CLAUDE.md).
- **Audit trail** (`CourierAuditTrail.tsx`): timeline per hari, "Lama → Baru" diparse, entri kembar "×N", Refresh;
  data SAMA `fetchCourierAuditLog`.
- Token warna Sea & Air di `validationWindowStyles.ts` (`VW_*`, `VW_TILE*`, `VW_INPUT`, `VW_TH`).
- **Ukuran jendela (2026-10-02, permintaan user)**: layar besar `max-w-[1320px] h-[94vh]` (awalnya 1180px = SAMA Open
  Invoice Recap Sea & Air, lalu DIPERLEBAR atas permintaan user), overlay `p-3 md:p-5`; layar <=1600px (laptop 14", zoom 90%) =
  `max-[1600px]:max-w-none max-[1600px]:h-full` + overlay `p-2.5` (hampir penuh layar, `vh` tidak ikut zoom).
  Berlaku juga utk jendela Validation dari Invoice Recap Courier; jendela LAMA mode List (`*Legacy`) tidak berubah.
- **Tutup jendela Open TIDAK reload tabel (2026-10-02, laporan user)**: `closeOpen` memanggil
  `patchCourierRowSilently(rec)` (baca ulang 1 baris lewat `reloadCourierRow` & tempel ke `records`, tanpa overlay
  "Updating data..."); KPI hanya dihitung ulang kalau persen kelengkapan/validasi baris berubah. JANGAN kembali ke
  `fetchRecords()` di sini. Aksi yg memindahkan baris (Mark as audited/Move back/Edit/Delete) tetap refresh penuh.
- **Checklist membaca centang dari DB (2026-10-02, bug fix)**: `ChecklistModal` load `select('*')` dari `dokumen_checklist`
  -> form/savedForm dari DB (dulu hanya dari `record` yg di-merge pemanggil -> Finance Handover Courier tampil 0%).
- **Validation dari Invoice Recap tampil DI DEPAN jendela Open (2026-10-02, bug fix)**: prop `zIndexClass` (default `z-50`);
  Recap merender jendela Validation lewat `createPortal` ke body + `z-[80]` (jendela Open Recap = portal `z-[70]`).
- **"Manual change notes"** (tab Documents) = textarea `VW_INPUT` `block` tinggi `h-8` supaya sejajar input
  Check date/Checked by/No. AWB (dulu inline -> turun ~6px).
- **Diuji**: jsdom `courier_ui` 47 cek (tab/pil/strip, Shipment Info di Overview, chip Overview -> Costs, Costs:
  kartu, show all lines, Deduct CN, Revise, klik angka -> bar, kunci CN saat dirty, Difference live, status manual,
  Save -> fn_update_actual_value + update tabel, Discard, Update estimate; Documents: checklist toggle + Save ->
  update dokumen_checklist, per-field tanpa tabel, (nilai pembanding), banner, Accept -> tile & ✎, Save ->
  tabel_checklist_validasi (values_json/meta/total), tidak ada autosave, Correct 2 kotak, Undo, konfirmasi tutup;
  Audit trail; view-only tanpa tombol edit) + courier 39, render 95, page 51, recap 112, finance 53, urgent 5,
  authfocus 12 — 0 gagal; `tsc` bersih, `vite build` sukses. Belum dites di production.

## Jendela "Validation" — Audit Courier Draft/PIB/CN (2026-09-30, `CourierValidationWindow.tsx`)

**RIWAYAT — tab & tata letak di bawah DIGANTI 2026-10-01** (Documents/Costs ala Sea & Air, lihat sub-bagian di atas);
aturan % titik, hak lihat/edit per page_key, Save Checklist tidak menutup jendela, `checklistVersion` TETAP berlaku.


3 tombol Action lama (Checklist / Doc Validation / Cost Validation) DIGABUNG jadi 1 tombol
**"✅ Validation"** di `CourierAuditRowGroup` (Draft, PIB, CN — syarat tampil sama spt dulu:
`rec.status !== 'LENGKAP'`) + pil kecil 3 titik status di pojok (hanya tab yang boleh dilihat).
Aturan titik (keputusan user): **hijau = 100%, oranye = <100%, abu = null/belum ada data** —
`validationDotClass()` di `CourierValidationWindow.tsx` SATU-SATUNYA definisi (dipakai tombol & tab).
Sumber % di baris = badge lama (`pct_kelengkapan`, `doc_validation_pct`, `cost_validation_pct`,
`rowValidationPct()`); formula TIDAK diubah.

- **Jendela 3 tab** (Checklist | Doc Validation | Cost Validation), label "Checklist 83%" + titik.
  Tab muncul per hak LIHAT page_key lama (`courier_checklist_dokumen`/`courier_dokumen_validation`/
  `courier_cost_validation`), hak edit tetap per page_key. **Tab awal** = tab pertama yang belum
  hijau; semua hijau -> Checklist.
- **Isi tab = modal LAMA dalam mode `embedded`** (`ChecklistModal` di SharedDataTable.tsx,
  `ValidasiModal.tsx`, `CostValidationModal.tsx`) — tanpa overlay/judul/X sendiri; semua tombol &
  fungsi tetap. Mode non-embedded masih utuh (tidak dipakai lagi di Audit Courier).
- **Ketiga tab SELALU terpasang** (tab tidak aktif `hidden`) supaya edit belum-disimpan tidak hilang
  saat pindah tab. Konsekuensi: 3 query jalan saat jendela dibuka.
- **% label tab live**: tiap modal kirim `onPctChange` (Checklist dari isian form; Doc dari `stats.pct`,
  null kalau tidak ada `dokumen_validasi` & checklist tersimpan; Cost dari `computeLiveCostSummary`
  atas `editForm` selama Edit, null kalau belum ada baris `tabel_cost_validasi`).
- **Save Checklist mode embedded TIDAK menutup jendela** (insert pakai `.select('id')` supaya save
  berikutnya UPDATE, bukan baris kembar); Cancel = kembalikan isian ke nilai tersimpan. Setelah save
  -> `checklistVersion` naik -> Doc Validation baca ulang HANYA flag `ada_po/ada_cipl/ada_final_invoice`
  (gating "NO VESSEL NAME AND IMO NUMBER"), BUKAN reload penuh (reload memotong autosave 2 dtk).
- **Tata letak (revisi 2026-09-30, laporan user "header jelek, Doc Validation header dobel, isi
  Checklist sempit")**: Shipment Info = kartu grid garis-rambut (bukan gradient peach), tab bar gaya
  garis bawah + pil persen. **Tiap tab punya TOOLBAR TAB putih sendiri** (isi beda, gaya sama —
  `src/components/validationWindowStyles.ts`, SATU-SATUNYA sumber kelas `VW_*`): Checklist = status
  + progres + Upload Additional Doc/Cancel/Save Checklist; Doc Validation = Check date/Checked by/
  No. AWB (saat Edit) + skor Match/Mismatch/Not filled + akurasi + Edit/Recompute/Save/Cancel +
  baris Manual Change Notes (MENGGANTIKAN bar judul + panel gradient "Import Document Validation
  Table" saat embedded; teks bantuan "PT Indo Mulia Indah — enter the value..." tidak ditampilkan);
  Cost = Status + Edited + OK/Selisih/N/A + akurasi + Edit Cost Validasi/Batal/Simpan. Checklist
  embedded lebar penuh 2 kolom (kartu Required/Optional Documents | kartu Missing Documents +
  Catatan Checklist), BUKAN kolom sempit `max-w-3xl`. Mode standalone ketiga modal TIDAK berubah.
- **Tutup jendela** (satu tombol X) -> ~~`fetchRecords()` 1x~~ (DIGANTI 2026-10-02: baca ulang 1 baris tanpa reload tabel, lihat atas).
- **Shipment Info SATU di level jendela** (grid 5 kolom, 10 field, "—" kalau kosong, nilai
  `[overflow-wrap:anywhere]` + `min-w-0`, tanpa nowrap/ellipsis). Sumber: AWB/Vendor/Jalur
  (`jenis_dokumen`)/No. PIB (`no_pib`, CN selalu "—") dari baris `tabel_audit_pib/cn`; Courier/
  Direction-Type/Ship Date/Origin-Zone/Chargeable Weight/Service dari baris terbaru
  `tabel_cost_validasi` (fetch sendiri, lalu disinkron dari tab Cost via `onDataChange`). Saat
  embedded: panel Shipment Info Cost Validation disembunyikan — KECUALI saat Edit Cost Validasi,
  3 field yang bisa diedit (Ship Date/Origin/Chargeable Weight) muncul di panel "Edit Shipment Info";
  chip Document Type/No. PIB/Vendor Doc Validation disembunyikan, No. AWB (isian checker) hanya
  saat Edit.
- **Catatan per tab**: Checklist = kolom BARU `dokumen_checklist.catatan_checklist`
  (`sql/028_dokumen_checklist_catatan.sql`, SUDAH DIJALANKAN — diverifikasi 2026-10-01; kalau kolom tidak ada -> textarea
  nonaktif & tidak ikut payload, deteksi via error select); Doc Validation = "Manual Change Notes"
  (`tabel_checklist_validasi.catatan_manual`, tidak berubah); Cost = "Catatan Perubahan Manual"
  (`tabel_cost_validasi.catatan`, tidak berubah).
- **Print** (1 tombol di bar jendela; tombol Print lama Doc Validation disembunyikan saat embedded)
  = Shipment Info + tab AKTIF saja — `#courier-validation-print-area` + class `cvw-fill` di
  `src/index.css` (pola `#bunker-print-area`). Catatan: aturan print global `body *
  {visibility:hidden}` di index.css membuat Print Doc Validation versi LAMA (standalone) kemungkinan
  tercetak kosong — tidak relevan lagi krn Audit Courier sekarang lewat jendela ini.
- Diuji (jsdom + Supabase tiruan, di luar repo): 73 cek (jendela 37, Checklist embedded 27, tombol
  baris 9), 0 console error; `tsc --noEmit` bersih, `vite build` sukses. Belum dites ke production.

## Kolom per role — Audit Courier & Rekapan Courier (2026-09-29, role Finance)

Ringkasan arsitektur ada di CLAUDE.md bagian RBAC ("Kolom per role"). SQL yang diberikan ke user
(nama RPC dicek user dulu: "does not exist" 2026-09-29):
```sql
alter table public.role_page_access add column if not exists visible_columns jsonb;

create or replace function public.get_my_column_access()
returns jsonb
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  with my_rows as (
    select rpa.page_key, rpa.visible_columns
    from public.user_roles ur
    join public.role_page_access rpa on rpa.role_id = ur.role_id
    where ur.user_id = auth.uid()
  ),
  restricted_pages as (
    select page_key from my_rows group by page_key
    having bool_and(visible_columns is not null and jsonb_typeof(visible_columns) = 'array')
  ),
  cols as (
    select m.page_key, jsonb_agg(distinct c.value) as cols
    from my_rows m
    join restricted_pages rp on rp.page_key = m.page_key
    cross join lateral jsonb_array_elements_text(m.visible_columns) as c(value)
    group by m.page_key
  )
  select case when public.is_admin() then '{}'::jsonb
              else coalesce((select jsonb_object_agg(page_key, cols) from cols), '{}'::jsonb) end;
$$;
revoke execute on function public.get_my_column_access() from public, anon;
grant execute on function public.get_my_column_access() to authenticated;
```
- Hasil `{page_key: [kolom]}`; page_key TIDAK ada = semua kolom. Page yg salah satu role user-nya
  NULL (semua kolom) → tidak masuk `restricted_pages` → semua kolom (union).
- RPC baca-saja milik user sendiri (`auth.uid()`), tanpa guard `has_edit_access` (tidak menulis).
- `RoleManagementPage.tsx` menulis `visible_columns` via `.update()` langsung ke `role_page_access`
  (pola sama toggle `can_edit`, RLS admin yg menggerbangi). Fetch matrix tahan kolom belum ada
  (query ulang tanpa `visible_columns`, tombol "Columns" disembunyikan).
- Kolom `index` (No.) selalu tampil. Urutan kolom tetap ikut `table_column_order` global.

## Sort default per tab Courier (2026-09-29)

| Menu / tab | Urutan default | Sumber |
|---|---|---|
| Audit — Draft | `created_at` DESC LANGSUNG (sort di browser, `compareCreatedAtDesc`) | tidak pakai `sort_order` (tab ini tanpa Reorder) |
| Audit — PIB / CN | `sort_order` ASC (+`id`) | trigger: Doc Acceptance (kosong paling atas), + drag manual |
| Invoice Recap — All PPJK | `created_at` DESC LANGSUNG | tidak pakai `sort_order` (tab ini tanpa Reorder) |
| Invoice Recap — per-PPJK (DHL/FEDEX/...) | `sort_order` ASC (+`id`) | trigger: Email Received Date (kosong paling atas), + drag manual |

**Frontend** (`SharedDataTable.tsx`):
- `usesRowSortOrder`/`usesRowSortOrderExport` mengecualikan `activePpjkFilter==='All'` → jatuh
  ke `.order('created_at', desc)` biasa. Draft (fetch & export) state default → `compareCreatedAtDesc`
  (dulu `sort_order`).
- Sort hasil klik header DI-RESET tiap pindah tab PPJK / Draft-PIB-CN
  (`useEffect([activePpjkFilter, courierAuditType])`) — dulu terbawa antar-tab.
- `courierDefaultUsesSortOrder` (PIB/CN & per-PPJK) → tombol reset "Reset to Manual Order", tab
  lain "Reset to Default Sort"; `headerSortColumn` sembunyikan panah ↓ header "Created At" saat
  state default di tab ber-`sort_order` (urutannya bukan Created At).

**DB — `fn_set_default_sort_order()`** (1 fungsi dipakai 3 trigger INSERT
`trg_set_sort_order_pib`/`_cn`/`_rekapan_courier`; isi versi lama dikonfirmasi user via
`pg_get_functiondef` 2026-09-29 = `-epoch(coalesce(created_at, now()))` kalau NULL):
- Kolom tanggal per tabel via `TG_TABLE_NAME`: `rekapan_courier` → `tgl_terima_email`;
  `tabel_audit_pib`/`cn` → `doc_acceptance`. Dibaca lewat `to_jsonb(new)->>kolom` (fungsi dipakai
  bersama, akses field langsung ke kolom yg tidak ada di tabel lain akan error). Tabel lain (kalau
  kelak dipasang) → perilaku lama.
- **Kosong (NULL/''/'-') → PALING ATAS**: `-(epoch(created_at) + 1e10)` — offset 1e10 dtk (~317 thn)
  menjamin lebih negatif dari baris bertanggal mana pun; sesama kosong urut Created At terbaru.
- **Ada tanggal**: `-(epoch(tengah malam WIB hari itu) + clamp(created_at − tengah malam,
  0..8.639.999 dtk)/100)` — offset dibagi 100 & di-clamp supaya SELALU < 86.400 (tidak nyebrang
  ke "ember" hari lain), resolusi 0,01/detik (> `SORT_ORDER_MIN_GAP`).
- **Isi tidak kosong tapi gagal di-cast ke date** → fallback `-epoch(created_at)` (TIDAK ikut ke atas).
- Trigger UPDATE BARU `BEFORE UPDATE OF <kolom tanggal>, sort_order`
  (`trg_resort_on_email_date_rekapan_courier`, `trg_resort_on_doc_acceptance_pib`/`_cn`) → hitung
  ulang kalau `sort_order` di-set NULL, ATAU kolom tanggal berubah TANPA `sort_order` ikut diubah
  di statement yg sama (drag manual = ubah `sort_order` saja → dihormati). Undraft (isi Doc
  Acceptance otomatis) → baris masuk PIB/CN langsung di posisi tanggalnya.
- **Konsekuensi (dikonfirmasi user)**: ubah tanggal = baris pindah posisi (urutan manual baris itu
  hilang); backfill `update ... set sort_order = null` MERESET semua urutan manual 3 tabel.
- **Status SQL (2026-09-29)**: paket final (fungsi + 3 trigger UPDATE + backfill 3 tabel)
  diberikan ke user, dijalankan manual oleh user — belum ada konfirmasi sudah jalan. Daftar trigger
  ke-3 tabel SUDAH dicek (hasil `pg_trigger` dari user): selain trigger sort_order, hanya ada
  `trg_audit_pib`/`_cn`/`_courier` (AFTER, ber-guard `auth.email() IS NULL` → dilewati saat backfill
  dari SQL Editor; `fn_normalize_awb_courier` dipanggil DI DALAM fungsi audit ini, bukan trigger
  sendiri) & `trg_calc_item_price_idr_cn` (`UPDATE OF item_price, other_cost, kurs, tgl_ppjk` →
  TIDAK terpicu backfill `sort_order`). Trigger `trg_resort_on_email_date_rekapan_courier` SUDAH
  ADA di production (versi awal SQL rekapan pernah dijalankan user). Sebelum paket ini jalan,
  PIB/CN masih urut Created At (frontend aman di-deploy duluan). Kalau ada laporan "urutan masih
  Created At", cek dulu SQL ini sudah jalan.

## Toolbar 2 baris + rule Reorder saat filter aktif — Audit Courier & Invoice Recap (2026-09)

`SharedDataTable.tsx` — toolbar KHUSUS `courier_audit`/`courier_rekapan` (`isCourierToolbar`)
sekarang 2 baris dalam 1 kartu (dipisah `border-t` tipis); tab lain (Sea & Air/Audit Trail/
Validasi) TETAP toolbar 1 baris lama (cabang `else`). Elemen yang dipakai kedua cabang diekstrak
jadi const di render body (`dateRangeEl`/`searchEl`/`refreshBtnEl`/`renderExportBtn(outline)`/
`addDataBtnEl`) — fungsi/handler TIDAK berubah, murni tata letak.
- **Baris 1**: kiri tab (Draft/PIB/CN atau PPJK) + badge; kanan dropdown Company
  (`max-w-[160px]`, dulu Audit `w-[48px]`).
- **Baris 2** (`flex-nowrap`, `overflow-x-auto` sbg fallback layar sempit, TIDAK wrap): kiri
  tanggal → Search → Refresh (ikon) → Customize View (ikon saja + tooltip); kanan Edit Mode →
  Reorder Mode → (Reset to Manual Order, kondisi lama) → pemisah `w-px` → Export → Add Data.
- **Hierarki**: Add Data SATU-SATUNYA solid ungu; Export outline hijau (`renderExportBtn(true)`,
  tab lain tetap hijau solid); Edit Mode aktif biru "Editing All Rows"; Reorder aktif oranye
  "Reordering…".
- **Edit ↔ Reorder saling menonaktifkan**: `toggleCourierEditMode()` keluar Reorder dulu kalau
  aktif; `handleToggleReorderMode()` saat masuk mematikan kedua Edit Mode (pending edit TIDAK
  dibuang, sama perilaku toggle Edit Mode off biasa).
- **Tombol Reorder Mode tampil** HANYA kalau `reorderTabEligible` (Audit: PIB/CN, BUKAN Draft;
  Invoice Recap: tab per-PPJK, BUKAN "All PPJK"; + `canEdit`) DAN `!courierFilterActive`
  (Search terisi — `search` mentah, bukan debounced —, tanggal terisi, atau Company ≠ "All").
  Filter aktif → tombol DISEMBUNYIKAN TOTAL (bukan disabled); `useEffect([reorderMode,
  courierFilterActive])` keluar otomatis (`exitReorderMode()`) kalau filter diisi saat mode aktif.
  Alasan: drag di data terfilter menghitung `sort_order` dari tetangga yang KELIHATAN saja.
- **Saat Reorder aktif**: banner oranye di atas tabel ("Reorder Mode aktif — drag ikon di kolom
  No. untuk mengubah urutan" + tombol "Selesai" = `exitReorderMode()`), Export disabled (tooltip
  "Selesaikan Reorder dulu"), sort klik header sudah nonaktif (`SortableColumnHeader`). Teks
  banner/tooltip ini SENGAJA Bahasa Indonesia persis spek user (pengecualian program translasi).
- Batas 2.000 baris (`reorderTooMany`) SUDAH DIHAPUS 2026-09-28 — Reorder Mode sekarang PER
  HALAMAN, lihat "Mode Reorder" di bawah.

## Audit Courier tab Draft — jalur fetch client-side (fix 2026-09-28)

Tab Draft (`courierAuditType==='archive'`) di `fetchRecords()` punya jalur SENDIRI (gabung
PIB+CN `status='ARCHIVED'` di browser, sort & paginasi `slice()` di JS — BELUM server-side, tanpa
`.range()`/`.limit()`), `return` duluan sebelum blok "Apply Date Filter" jalur PIB/CN.
- **Bug fix**: filter tanggal dulu TIDAK diterapkan di jalur ini (input tanggal di tab Draft tidak
  menyaring apa pun) — sekarang `.gte/.lte('tgl_ppjk', ...)` di kedua query, sama kolom dgn tab
  PIB/CN & `getExportData()` Draft (yang sudah benar dari awal).
- Query ulang `sptnp_total` per-50-id (dobel, kolom sudah ikut `select('*')` dari
  `tabel_audit_pib`) DIBUANG dari `fetchRecords()` & `getExportData()` jalur Draft. Pola loop yang
  sama MASIH ADA di jalur PIB/CN normal (belum disentuh, di luar cakupan fix ini).
- **Gap tersisa (belum dikerjakan)**: tanpa limit/paginasi server, Draft >1.000 baris per tabel
  berisiko terpotong diam-diam oleh max-rows PostgREST; badge %/checklist dihitung utk SEMUA baris
  Draft, bukan cuma halaman aktif. Server-side penuh butuh view/RPC gabungan PIB+CN (tanya user
  dulu apakah sudah ada — aturan "Peta RPC function Supabase").

## Drag & Drop Reorder — Audit Courier (Draft/PIB/CN) & Invoice Recap Courier (2026-09)

**CATATAN (2026-09)**: scope tombol Reorder Mode dipersempit — lihat "Toolbar 2 baris" di atas
(Draft & "All PPJK" tidak lagi punya Reorder Mode; filter aktif = tombol hilang). Sejak
2026-09-28 Reorder Mode PER HALAMAN (bukan fetch semua baris) + respace otomatis — lihat "Mode
Reorder" di bawah. Urutan kolom TIDAK berubah.

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
  yang SUDAH ADA di ke-3 tabel).
- **Respace otomatis (2026-09-28)** — kalau 2 tetangga jaraknya `< SORT_ORDER_MIN_GAP` (1e-3):
  nilai KEMBAR (baris n8n di detik `created_at` yang sama — trigger default isi nilai identik)
  ATAU presisi float habis krn drag berulang di titik sama → `respaceSortOrder()` ambil SEMUA
  baris TABEL (lintas scope PPJK/status) dgn nilai di rentang [before, after], lalu dibagi rata di
  antara nilai distinct terdekat di luar rentang (`lo`/`hi`), baris yg dipindah disisipkan tepat
  setelah `before` — urutan relatif baris lain tidak berubah. Guard `SORT_ORDER_RESPACE_MAX=500`
  baris per blok (error kalau lebih). Update per baris (batch 50 paralel).
- **Tiebreak `id` WAJIB** di semua order `sort_order` (`fetchRecords`/`getExportData`
  `.order('sort_order').order('id')`; Draft `combined.sort` tiebreak `jenis_dokumen`+`id`) —
  tanpa ini urutan baris kembar tidak stabil antar-halaman `.range()` (baris dobel/terlewat).
- **Efek samping diketahui**: tiap UPDATE `sort_order` memicu trigger audit DB (`fn_audit_pib`/
  `cn`/`courier`) → baris `audit_trail` dump mentah (tersaring dari tampilan oleh
  `TRAIL_APP_WRITTEN_FILTER`, tapi tetap tersimpan). Respace bisa menulis banyak baris sekaligus.

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

**Mode Reorder — PER HALAMAN (2026-09-28, GANTI fetch-semua-baris + batas 2.000)** — toggle
toolbar, hanya tab PIB/CN & per-PPJK, filter dilarang (lihat "Toolbar 2 baris"). Karena tanpa
filter & urutan default, 1 halaman `fetchRecords()` = potongan UTUH urutan global scope tab, posisi
cukup dihitung dari tetangga. `fetchAllForReorder`/`reorderRows`/`reorderTooMany` DIHAPUS —
tabel SELALU render `records` (`displayRows` cuma alias).
- `handleToggleReorderMode()` simpan pageSize user di `prevPageSizeRef`, paksa
  `REORDER_PAGE_SIZE=100` (halaman dipilih supaya baris pertama yg terlihat tetap di layar), reset
  sort ke default, matikan Edit Mode. `exitReorderMode()` kembalikan pageSize — SENGAJA TIDAK
  panggil `fetchRecords()` manual (`records` sudah sinkron DB; fetch manual bisa balapan dgn
  closure pageSize lama, fetch ulang jalan otomatis lewat deps). Effect tab/filter-change juga
  mengembalikan pageSize.
- `getReorderScope()` — tabel + kondisi scope tab (PIB/CN: `neq status ARCHIVED`; per-PPJK:
  `ilike ppjk`), HARUS sama persis dgn `fetchRecords()`. `fetchScopeRowAt(pos)` ambil 1 baris di
  posisi global (`.range(pos,pos)`, order `sort_order`+`id`).
- `handleRowDragEnd()` — drag di dalam halaman; drop di baris paling atas/bawah halaman ambil
  tetangga dari halaman sebelah via `fetchScopeRowAt(pageStart-1)`/`(pageStart+len)`.
  `placeRowBetween()` → titik tengah biasa (update `sort_order` lokal, tanpa refetch) atau
  respace (refetch). Gagal → alert + `fetchRecords()` utk kembalikan tampilan.
- **Pindah lintas halaman**: klik badge nomor (`ReorderIndexCell`, popover portal `fixed`) → "To
  top" / "To bottom" / "Move" ke No. N (1-based, posisi GLOBAL). `handleMoveRowTo()` — tetangga
  di urutan akhir: naik `[t-1, t]`, turun `[t, t+1]` (posisi sekarang), lalu loncat ke halaman
  tempat baris mendarat. Badge nomor = posisi GLOBAL (`startIndex + index`), bukan nomor di
  halaman.
- `reorderSaving` — drag/move berikutnya diabaikan selama simpan berjalan ("Saving…" di banner).
- Footer pagination TETAP tampil; Export tetap disabled selama mode aktif.

Kolom "No." (`type==='index'`) render **grip handle (⋮⋮) + badge oranye** (`ReorderIndexCell`,
nomor posisi GLOBAL, klik = popover "Move to") SAAT `reorderMode` — di luar mode, tampilan TETAP seperti sebelumnya (teks biasa).
`CourierAuditRowGroup`/`CourierRekapanRowGroup` panggil `useSortable({id:rec.id,
disabled:!reorderMode})` TANPA SYARAT (Rules of Hooks — hook selalu dipanggil, listener/transform
yang kondisional), ref/style HANYA dipasang ke `<tr>` PERTAMA (baris split PO lanjutan TIDAK ikut
ter-transform saat drag, keterbatasan diterima, kasus jarang). `handleRowDragEnd()` — `arrayMove`
+ hitung `sort_order` baru + `.update()` (tabel target: `rekapan_courier` utk Invoice Recap;
`tabel_audit_pib`/`cn` utk Audit Courier dari `courierAuditType`, lewat `getReorderScope()`).

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
   "Peta RPC function Supabase" CLAUDE.md utama) — TANPA input manual apa pun.
   **Revisi 2026-09-28 — HANYA kalau kosong**: `.update({doc_acceptance: todayIso}).eq('id', id)
   .is('doc_acceptance', null)` — syarat "kosong" DI DALAM 1 perintah UPDATE (atomik, BUKAN
   baca-dulu-lalu-tulis). Doc Acceptance yang sudah terisi (mis. via Edit di tab Draft — kolom ini
   ada di `PIB_COLS`/`CN_COLS` type `date` & lolos `isInlineEditable`), tanggal lama/baru apa
   pun, TIDAK ditimpa & ikut terbawa ke tab PIB/CN. "Kosong" = NULL saja (app selalu simpan `''`
   sbg null). `todayIso` = tanggal LOKAL browser (dulu `toISOString()` = UTC → Undraft jam
   00:00–06:59 WIB terisi tanggal kemarin). **Belum diverifikasi**: apakah RPC `fn_undraft_pib`/
   `cn` (buatan user) sendiri menyentuh `doc_acceptance` — kalau iya, nilai lama bisa hilang
   SEBELUM update ini jalan (cek `pg_get_functiondef` kalau uji "tanggal lama tetap" gagal).
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

**Formula** (`computeCourierAuditCalc()`, fungsi pure — SATU-SATUNYA sumber kebenaran, JANGAN duplikat
logic ini di tempat lain; sejak 2026-10-01 tinggal di `src/utils/CourierAuditHelpers.ts`, di-import
SharedDataTable & form baru `CourierAuditEditModal`):
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
