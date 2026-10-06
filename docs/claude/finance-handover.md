# Finance Handover (FAR Overseas + Sea & Air + Courier)

Halaman gabungan `/finance-handover`. Detail sumber Courier ada juga di `courier-features.md` ("Invoice Recap Courier per AWB", "Finance melihat validasi Courier").

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat modulnya dikerjakan). -->

## Finance Handover gabungan FAR Overseas + Sea & Air (`/finance-handover`, 2026-10-01)

Spek user ("Finance Handover", BeeHive) — 1 inbox pengganti tanda terima kertas. **Keputusan user**:
1 halaman gabungan (menu sidebar sendiri "Finance Handover", ikon `Wallet`; tab FAR & submenu Sea & Air
lama dihapus/diarahkan); TANPA switch "View as" (peran = hak akses: EDIT page_key sumber = Finance, selain
itu view only + catatan Exim); nama lengkap PPJK + TOP dari **master vendor Sea & Air baru**; **TANPA upload
bukti transfer** (FAR & Sea & Air; Mark paid = tanggal + referensi bank opsional); ~~TANPA Undo~~ (DIUBAH 2026-10-02: Undo
receipt oleh Admin, lihat di bawah); font
**Sora** (bukan Plus Jakarta Sans spek); chip **Urgent** FAR = kolom + toggle di Edit memo.

- **File**: `src/pages/FinanceHandoverPage.tsx`, `src/utils/FinanceHandoverHelpers.ts` (SATU sumber
  `HandoverItem`, fetch, due/overdue, RPC), `src/components/FinanceHandoverViewers.tsx` (viewer FAR & Sea &
  Air), `src/pages/SeaAirVendorMasterPage.tsx` (Settings). DIHAPUS: `FarOverseasAirFinanceHandover.tsx`,
  `SeaAirFinanceHandoverPage.tsx`, `SeaAirFinanceHelpers.ts`.
- **Sumber**: FAR = memo `approval_status='APPROVED'` (Sent = tanggal sign TIER3; payee = `ship_via`; jumlah
  IDR, non-IDR tampil nilai asli + ≈ IDR; due = `due_date`/`expected_payment_date`). Sea & Air = baris
  `rekapan_seaair` dgn `tgl_submit_finance` (payee = `seaair_vendor_master.legal_name` via kode `emkl_vendor`,
  fallback kode + tanda "Full PPJK name not set"; jumlah = `computeLandedCost().landed` tanpa duty; due =
  submit + `top_days`, default 14 hari "(default)"). "Earlier shipment" = Sea & Air tanpa `seaair_id` atau
  tanpa Doc/Cost Validation -> hanya view Handover. Courier = tab abu "SOON" (aktif 2026-10-02; sejak 2026-10-06 1 kartu per AWB —
  lihat bagian "Tab Courier" di bawah). Overdue = belum Paid & due < hari
  ini (tile Received merah "<n> overdue"). Urut Sent terbaru.
- **UI**: 4 tile status = filter (ring ungu), segmented sumber (hanya sumber yg boleh dilihat), Search, PT,
  baris berwarna per tahap (amber/putih/hijau), timeline Sent→Received (nama penerima)→Paid. Finance:
  Accept (dialog "Received by" default nama profil + tanggal, error "Fill in the receiver name and date.") /
  Mark paid (tanggal transfer + referensi opsional); selama Waiting view diganti "Accept to view". Non-Finance:
  pill status. Toast "<ref> received." / "<ref> marked as paid.".
- **Viewer**: FAR = modal LAMA Memo/Documents/Cost dgn prop `tabBar` (tab geser). Sea & Air = dialog
  Handover (fakta + "Invoices in this handover" + Total payable) · Documents · Cost validation — dua tab
  terakhir = `SeaAirRecapDocumentsTab`/`SeaAirRecapCostsTab` mode **`financeView`** (baca saja; checklist tanpa
  PIB/SPPB/Billing DJBC/BPN/SPTNP, % & "Missing" dihitung ulang dari dokumen non-duty, section PIB & kartu
  Duty disembunyikan; Cost tanpa segmen CUSTOM & kartu Duty & tax + ringkasan "N of M invoices match the
  contract rate"). **Aturan: jangan tampilkan angka/dokumen duty di halaman ini.**
- **DB `sql/035`** (SUDAH DIJALANKAN 2026-10-01): lihat Peta RPC; kolom `rekapan_far_overseas_air.is_urgent`; tabel
  `seaair_vendor_master` (RLS 4 policy, unik `upper(btrim(vendor_code))`, diisi awal kode `emkl_vendor` yg
  ada); policy SELECT tambahan `sea_air_finance` ke `dokumen_checklist_seaair`, `dokumen_validasi_matriks_seaair`,
  `cost_validasi_seaair`, `cost_validasi_catatan_seaair`, `tabel_audit_seaair` (catatan: tabel Audit PIB
  berisi angka duty — tersembunyi di UI, tapi bisa dibaca role Finance lewat API).
  Sea & Air Receive menyimpan `finance_received_by` = nama yg diketik, `finance_received_at` = tanggal terima.
- **Layout baris (2026-10-02, laporan user "di laptop 14\" tombol turun ke bawah")**: daftar = `@container`, grid baris
  pakai container query (`@2xl:` 2 kolom, `@4xl:` 1 baris 5 kolom) -> ikut LEBAR DAFTAR, bukan lebar layar (dulu `xl:`).
  Semua tombol lihat (Memo/Invoice/Handover/Recap/Audit/Docs/Cost) + "Undo receipt…" (Admin) digabung 1 menu **View ▾**
  (`ViewMenu`, portal + fixed, tutup klik luar/Escape/scroll); kolom aksi = Accept / Mark paid + View.
  Daftar + pagination dalam SATU panel (2026-10-02, seperti Audit Courier): `PaginationFooter` bersama (Rows 10/25/50/100,
  default 25, Prev / Page X of Y / Next) -- versi kartu putih + nomor halaman sebelumnya DIGANTI atas permintaan user.
- **Undo receipt (2026-10-02, keputusan user, `sql/040_finance_undo_receive.sql` SUDAH DIJALANKAN 2026-10-02, file dihapus — git `2fefc12`)**: membatalkan
  Accept -> kembali "Waiting for Finance". HANYA **Admin** (`is_admin()`), alasan WAJIB min. 5 karakter, HANYA selama belum
  Paid; berlaku FAR / Sea & Air / Courier. RPC BARU `fn_far_overseas_finance_undo_receive(uuid,text)` (log
  `far_overseas_memo_log` action `FINANCE_UNDO_RECEIVE`), `fn_seaair_finance_undo_receive(uuid,text)` (flag `app.seaair_unlock`
  lolos kunci 031, audit_trail), `fn_courier_finance_undo_receive(uuid,text)` (kunci 038 mengizinkan kolom Finance,
  audit_trail) -- catatan "Finance received (undo) — Lama: <tgl> · by <nama> → Baru: - · reason: …". Setelah undo, Unlock
  Admin (Sea & Air/Courier) & Undo sign FAR kembali mungkin. UI: tombol "Undo receipt" di baris Finance Handover status
  Received · unpaid (Admin saja) -> dialog alasan (`undoReceiveHandover`). Uji: PGlite 19 cek, jsdom courier_recap 58.
- **Urgent FAR**: toggle di Edit memo (section due date), tampil hanya kalau kolom ada; bisa diubah walau memo
  terkunci, selama belum Paid; disimpan di `saveRowEdits` lewat RPC `fn_far_overseas_set_urgent` (BUKAN whitelist
  `update_rekapan_far_overseas_manual`; `setVal` mengizinkan field ini khusus). Chip "Urgent" di kartu memo FAR &
  Finance Handover.
- **Diuji**: jsdom 53 cek (tile/filter/search/PT, Accept & Mark paid FAR + Sea & Air + RPC, viewer kedua sumber,
  view-only, master vendor, status Recap) + 5 cek toggle Urgent; PGlite 22 cek (035).

## Tab Courier: 1 kartu per AWB + Open di dalam kartu (2026-10-06, keputusan user)

Spek user + referensi tampilan `finance_handover_courier.html` (root repo; HANYA tata letak — warna/font tetap gaya app).
**FAR Overseas & Sea & Air TIDAK berubah** (tetap menu View ▾, "Accept to view"). TANPA SQL baru (RPC 037/040 per invoice dipakai ulang).
- **Data** (`FinanceHandoverHelpers.ts`): `fetchCourierHandovers` = invoice `rekapan_courier` ber-`submit_date` dikelompokkan per AWB
  (`courierAwbNorm`, tanpa AWB = "ID:<id>", SAMA Invoice Recap) -> `buildRecapGroup` + `fetchRecapAuditLinks` (Jalur PIB/CN) ->
  `courierGroupToItem`. `HandoverItem.courier` = { group, rows (Freight·Duty·CN), courierCode, jalur, vendor, waitingIds, receivedIds },
  `extraSearch` = semua no. invoice. **Total** = Freight + Duty − CN (`courierSignedAmount`). **Status AWB**: ada invoice belum diterima =
  Waiting; semua diterima & ada yg belum Paid = Received · unpaid; semua Paid = Paid. Sent = submit TERBARU; Received/Paid = tanggal
  terbaru (hanya bila seluruh AWB sudah di tahap itu); **Due** = submit + TOP (master Courier, default 14) TERDEKAT dari invoice belum Paid.
  Invoice yang belum di-Submit TIDAK ikut. Kartu lama per invoice (`courierToItem`) DIHAPUS.
- **Accept / Mark paid / Undo receipt per AWB** = RPC per invoice (`fn_courier_finance_accept` utk `waitingIds`, `_mark_paid` & `_undo_receive`
  utk `receivedIds`) dipanggil berurutan (`eachCourierInvoice`, berhenti di error pertama). Dialog menampilkan daftar invoice yang ikut
  diproses (`CourierAffected`). Undo receipt (Admin) = link kecil di bawah tombol kartu (menu View tidak ada di Courier).
- **Kartu** (`CourierAwbCard` di FinanceHandoverPage): chip Courier · kode courier · PT · Jalur (PIB biru/CN ungu, "Jalur —" kalau pasangan
  Audit tidak ketemu) · AWB · "N invoices · Freight + Duty + CN Freight" | Payable to (nama lengkap master Courier) + Vendor + pill status |
  Total + Due/TOP (atau Paid + ref) | timeline Sent–Received–Paid | Accept / Mark paid (Finance) + **Open** (SEMUA status & semua yg boleh
  lihat; gaya SAMA tombol Open lama Invoice Recap Courier `bg-[#6B3470] h-8 rounded-xl`, terbuka = "Close" `bg-[#3B1B3D]`). 1 kartu
  terbuka sekaligus; buka kartu lain menutup yg lama & tab kembali ke Invoices. **Aturan "Accept dulu baru bisa lihat" DIHAPUS utk Courier.**
- **Detail** (`FinanceCourierAwbDetail.tsx`, expand DI DALAM kartu, semua baca saja; viewer jendela `CourierHandoverViewer` DIHAPUS): tab
  **Invoices · Cost Validation · Doc Validation** (tab Checklist DIHAPUS 2026-10-06, permintaan user: Finance tidak butuh;
  prop `onCounts` ChecklistModal ikut dicabut); label = % + titik (`validationDotClass`: hijau 100, oranye <100, abu belum ada
  data; "…" saat memuat). Kedua tab validasi dipasang sekaligus saat kartu dibuka (tab lain `hidden`) supaya % label langsung akurat.
  - Invoices: hanya invoice handover AWB ini; kolom jenis + no. invoice · email received · amount; CN dalam kurung "(289.000)"; baris Total (net).
  - Cost Validation: `CostValidationModalLegacy` (= isi Details Invoice Recap) prop BARU **`financeView`**: header ringkasan gaya jendela Open
    Audit (OK / Difference / N/A + "x of y invoices match the rate sheet" + Accuracy, `computeLiveCostSummary` SAMA) menggantikan toolbar;
    Potong CN / Revisi / Update Estimasi / Hitung Ulang Estimasi disembunyikan; Catatan Perubahan Manual tetap tampil.
  - Doc Validation: `ValidasiModal` embedded prop BARU **`financeView`** (+ konstanta `FINANCE_DOC_SECTIONS`): hanya 3 tabel (Invoice freight &
    invoice duty, SPPBMCP [jalur CN; PIB = catatan], NPWP table), semua terbuka; meta (Check date/Checked by/No. AWB/Manual change notes),
    banner mismatch, Recompute, Expand all & kalkulasi PIB/SPPBMCP disembunyikan (kalkulasi tetap dipasang tersembunyi). **Angka Match /
    Mismatch / Not filled & akurasi = perhitungan yang sudah ada (seluruh pemeriksaan PIB/CN, SAMA % di Audit/Recap)**, bukan hanya 3 tabel.
  - Pasangan PIB/CN tidak ketemu -> tab validasi berisi catatan, titik abu.
- **Print** (tombol di baris tab): `window.print()`; kartu terbuka ber-id `#finance-courier-print-area` (aturan `index.css`: leluhur dilepas
  overflow/tinggi/posisi lewat `*:has(...)` karena kartu TIDAK di-portal). Tercetak: info kartu + tab aktif + keterangan
  "Finance Handover · Courier · <tab> · printed <tgl jam>" (`hidden print:block`, waktu diperbarui di `beforeprint` dgn `flushSync`).
  Tab bar & semua tombol `print:hidden`, kartu lain tidak tercetak.
- **Diuji**: jsdom `fh` 59 cek (setelah Checklist dihapus; sebelumnya 64) (3 kartu per AWB, total − CN, chip/payee/due/status, Search no. invoice, Open di semua status & gaya, detail di
  dalam kartu, 3 tab (tanpa Checklist) + % + titik, Invoices kurung/total/tanpa AWB, Cost header & tanpa aksi + catatan,
  Doc 3 tabel & tanpa aksi/meta, catatan SPPBMCP jalur PIB, tanpa pasangan Audit, Print + keterangan, 1 kartu terbuka, Accept 3 RPC, Mark paid
  2 RPC + ref, Undo Admin 3 RPC, view-only) + regresi finance lama 57 — 0 gagal; `tsc` bersih, `vite build` sukses. Belum dites di production.
