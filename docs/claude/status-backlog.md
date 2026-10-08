# Status & sisa pekerjaan (backlog)

Daftar terkini pekerjaan yg belum selesai/ditahan per modul. Item dicoret = selesai. **Keputusan permanen dari backlog lama (dihapus 2026-10-06, isi lengkap di git history)**: Delete PIB Sea & Air TETAP ikut menghapus Invoice Recap/checklist/validasi terkait `seaair_id` (keputusan user 2026-09-30, JANGAN "diperbaiki"); Export Audit PIB & Invoice Recap Sea & Air TETAP (format 31 kolom / 5 output ditahan).

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat modulnya dikerjakan). -->

## STATUS & SISA PEKERJAAN — Audit & Invoice Recap Sea & Air + Courier / Finance Handover (per 2026-10-02)

**DAFTAR TERKINI (satu-satunya acuan)** — 2 bagian "BACKLOG" di bawahnya = riwayat (item dicoret = selesai).
Semua SQL (027–035, 037–040) SUDAH jalan di production. Kode SELESAI & lolos uji jsdom/PGlite, tapi **BELUM dites
user di production** (testing bagian 2 + Finance Handover dijadwalkan user bersamaan dgn pekerjaan lain).

**Audit PIB Sea & Air (`/sea-air/audit`) — belum:**
1. Freight otomatis per delivery term (FOB/FCA = invoice "Freight · destination" BL sama, hanya baris
   ocean/air freight, THC tidak; EXW = "Freight · origin"; CIF/CFR = 0; tidak ada di Recap = manual + label
   sumber). Sekarang `total_inv_freight` dipakai apa adanya. Butuh keputusan aturan per baris invoice.
2. Log Edit per field & Delete PIB format app ("X — Lama: … → Baru: …"). Aksi utama (Mark audited,
   re-audit, Re-read, submit/unlock, review) SUDAH dicatat trigger sql/031.
3. Banner "shipment belum tercatat" (Recap tanpa baris Audit PIB) — belum ada cara deteksi; sementara
   chip "Waiting for …" di kartu Draft.
4. Status validasi "Shipment still being processed in Invoice Recap" — belum ada sumber data.
5. Draft otomatis saat 4 dokumen bea cukai lengkap (PIB/SPPB/Billing DJBC/BPN) + log "Recorded
   automatically…". Sekarang baru: PIB baru dari AI otomatis Draft (sql/032).
6. Valas per PO kosong kalau n8n tidak mengisi `po_harga_detail` (tab "Split evenly" jendela Open DIHAPUS 2026-10-05; isi lewat Edit) — cek
   workflow n8n ekstraksi PIB.
7. (Ditahan, keputusan user) Export format workbook 31 kolom — Export TETAP seperti sekarang.

**Invoice Recap Sea & Air (`/sea-air/rekapan`) — belum:**
1. Quotation freight per BL: tombol "+ Add quotation" SUDAH ada (info "coming soon"); belum ada tabel
   quotation, pembacaan AI (n8n), tarif berlaku pada ATA, "Save & re-check".
2. Upload dokumen susulan via n8n (upsert by AWB, hasil AI lama tetap utuh) — pekerjaan sisi n8n.
3. Checklist per dokumen (tanggal upload, "3/4 · 1 file still missing", "Upload missing file", "Not
   needed" + alasan) & "Ask vendor for a new document" (perlu keputusan alur: email/WA/catatan).
4. Vendor payments (barang): termin DP/balance + bukti transfer.
5. Sort "Cost accuracy · lowest" & search nomor PO (PO di JSON `po_detail`, butuh RPC/kolom bantu).
6. Gerbang mismatch dokumen HANYA di frontend (DB hanya menegakkan checklist + cost; fuzzy relax ada di JS).
7. Segmen CUSTOM tidak bisa direview -> tidak dihitung issue walau Over/Under (perlu keputusan).
8. Indikasi duplikat (`duplicate_of`) baru chip — belum ada aksi "Not a duplicate"/gabung.
9. Kelompok "PIB value check" di tab Documents — belum ada sumber data terpisah.
10. (Ditahan, keputusan user) "Export cost data" 5 output — Export TETAP.

**Finance Handover (`/finance-handover`) — belum:**
1. ~~Sumber **Courier**~~ — SELESAI 2026-10-02 (per invoice, lihat "Invoice Recap Courier per AWB"; sql/037 SUDAH jalan).
2. Font: halaman Finance pakai Sora (keputusan user "semua halaman Sora"), TAPI modal FAR yg dibuka dari
   viewer masih Plus Jakarta Sans (modul FAR belum diubah) — konfirmasi user apakah FAR ikut Sora.
3. Keamanan: role Finance bisa membaca `tabel_audit_seaair` (berisi angka duty) lewat API krn policy baca
   viewer (sql/035). UI menyembunyikan; pengetatan butuh view/RPC khusus kalau diminta.
4. Master vendor Sea & Air: nama legal & TOP WAJIB diisi user (selama kosong tampil kode + tanda); hanya
   kode PPJK (`emkl_vendor`); kolom `aktif` belum dipakai saat pencocokan; tanpa tombol hapus.
5. Viewer FAR berganti modal antar tab -> ukuran dialog berubah (kosmetik).
6. (Dibatalkan, keputusan user) upload bukti transfer — TIDAK dibuat. **Undo Accept DIBUAT 2026-10-02** (keputusan user
   berubah, sql/040 SUDAH DIJALANKAN 2026-10-02) — lihat "Undo receipt" di bagian Finance Handover gabungan.
7. Courier: ~~viewer hanya dialog 1 invoice~~ — 2026-10-02 viewer = jendela Validation BACA SAJA (lihat "Finance melihat
   validasi Courier"); master vendor Courier (nama legal + TOP) WAJIB diisi user; page_key `courier_finance`/
   `settings_courier_vendors` WAJIB di-assign ke role.
8. Keamanan Courier: policy `rekapan_courier_select_finance` membuka SEMUA baris `rekapan_courier` (bukan hanya yg
   sudah submit) utk role Finance lewat API — UI hanya menampilkan yg ber-`submit_date`. Persempit kalau diminta.

**Audit Courier (`/courier/audit`) — status (keputusan user 2026-10-02):**
1. (Ditunda, belum dibutuhkan) Audit trail perubahan Checklist/Doc validation/Cost validation & log edit format app.
2. ~~Review cost per invoice~~ — SELESAI 2026-10-02 (sql/038, SUDAH dijalankan 2026-10-02) — lihat "Courier 2026-10-02 bagian 2".
3. (Diterima user) Tab Draft fetch & paging di browser — Draft hanya sementara, tidak perlu RPC gabungan.
4. ~~Kolom auto-calc & Reporting~~ — TIDAK PERLU TINDAKAN (dicek 2026-10-02): 7 kolom auto-calc Audit TIDAK dibaca
   Reporting (hanya app/export, sudah live-calc). Reporting membaca APA ADANYA 6 kolom auto-calc **Invoice Recap**
   (`breakdown_*_vessel` Cost by Vessel, `total_amount` Cost by Courier) — query baca user: 164 invoice, `total_amount`
   kosong 0, beda dari adm+duty+freight 0, `breakdown_freight_vessel` kosong 0 -> n8n/app sudah mengisi benar. Kalau
   kelak ada laporan "angka Reporting 0/beda dgn Invoice Recap", ulangi query itu dulu (opsi perbaikan: Reporting memanggil
   `computeCourierRekapanCalc` saat membaca, atau trigger DB).
5. Upload additional doc = n8n MENIMPA `dokumen_validasi` (konfirmasi user). Doc validation yang sudah tersimpan diperbarui
   lewat tombol **Recompute document data** (2026-10-02: isi + perbarui field yang belum diedit manual) + banner jumlah
   field yang punya data dokumen lebih baru.
6. ~~2 versi validasi~~ — logika DISAMAKAN 2026-10-02 (review cost, Recompute, cek error simpan Doc validation); sisa beda
   hanya tampilan & autosave (mode List) vs tombol Save (jendela baru) — keputusan user sebelumnya.

**Invoice Recap Courier (`/courier/rekapan`) — status (keputusan user 2026-10-02):**
1. ~~Badge "needs attention"~~ — SELESAI 2026-10-02: AWB yang masih punya invoice belum di-submit DAN validasi PIB/CN < 100%
   (badge merah sidebar + tombol filter "Needs attention").
2. (Keputusan user) 3 AWB "Not found in Audit" = data tambah manual, bukan n8n — biarkan dgn label itu.
3. Re-audit otomatis tetap (dijelaskan ke user: tanpa tombol, otomatis saat nominal/AWB/PO invoice diedit setelah Audited).
4. ~~Submit tanpa kunci~~ — SELESAI 2026-10-02 (sql/038, SUDAH dijalankan 2026-10-02): kunci setelah Submit + Unlock Admin, sama Sea & Air.
5. (Keputusan user) Tanpa issue count / review per invoice di Recap untuk sementara.
6. (Keputusan user) Edit tetap lewat tabel List; Export TETAP.
7. Panel Validation samping (2026-10-05) — kode SELESAI, sql/041 SUDAH dijalankan 2026-10-05, belum dites user di production.
8. Revisi bagian 2 (2026-10-05) — kartu disusun ulang + Due Date, header panel disederhanakan, Recompute di ringkasan, catatan
   Accept masuk catatan manual, KPI 4 kartu. sql/042 (tgl_invoice) SUDAH dijalankan 2026-10-05; pengisian `tgl_invoice` oleh n8n BELUM
   (menunggu info user). Finance Handover Courier TIDAK berubah (TOP tetap -- keputusan user, ditentukan terpisah nanti). Lihat bagian
   "Panel Validation samping Invoice Recap Courier".
10. Valid (note) + Selisih + Validasi PIB/SPPBMCP di notifikasi (2026-10-08) — kode SELESAI. sql/049 SUDAH dijalankan 2026-10-08 (konfirmasi user);
    baris Validasi PIB/SPPBMCP yang masuk notifikasi = hanya yang dihitung di akurasi (koreksi user; Freight/BM/PPN/PPH tetap dikecualikan). Lihat courier-features.md.
9. Invoice PPJK Date (2026-10-07) — kode aplikasi SELESAI (kolom List, tab Invoices, Due, KPI klik). **Pengisian `tgl_invoice` oleh n8n
   BELUM**: dicek user 2026-10-07 di `dokumen_validasi.data_validasi_raw` -- `invoice_freight_v`/`invoice_duty_v`/`credit_note_freight_v`/
   `credit_note_duty_v` TIDAK punya field tanggal (hanya alamat/awb/no_invoice/ppn/pt_penerima/subtotal/npwp/items/count). Perlu: prompt
   Gemini workflow Courier upload ditambah tanggal invoice + mapping ke `rekapan_courier.tgl_invoice` (YYYY-MM-DD). Data lama tetap kosong.

**Umum:** semua halaman di atas belum diuji user di production; `kurs` text bug SUDAH diperbaiki; badge
sidebar needs attention SUDAH; pindah tab browser tidak refresh SUDAH (lihat bagian AuthContext).
