# Halaman migrasi HTML mandiri (n8n AI) — SPB (Requisition RH, Oil Request, Auto Rename), Verification QFP, LSA

Empat halaman yg dulu file HTML mandiri, dimigrasi ke app 2026-10-06. Pola bersama: logika (webhook/polling/render/print) SAMA dgn file asli (file asli sudah dihapus, tidak ada di git); tanpa tabel Supabase; panggil webhook n8n LANGSUNG dari browser; tampilan gaya app.

<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat modulnya dikerjakan). -->

## Verification QFP (`/verification-qfp`, `src/pages/VerificationQfpPage.tsx`, 2026-10-06)

Migrasi `Verification QFP.html` ("Purchasing AI — Waruna Group"), submenu ke-6 **Compare Doc** (group PAGE_REGISTRY
sendiri `'Verification QFP'`, page_key `verification_qfp`, BELUM di-assign ke role -- hanya Admin). Tampilan pola SAMA
halaman SPB di bawah (lebar penuh, Sora, form kiri gradient plum, kotak upload multi-file). SAMA dgn file asli: file
PDF/gambar (dedup nama+ukuran, hapus per file) -> FormData field `data` berulang, POST `mode:'cors'` LANGSUNG ke
`.../webhook/verify-documents`; respons JSON -> 3 tabel (TABEL 1 Kelengkapan, TABEL 2 & 3 PO : Invoice : Faktur Pajak,
lebar kolom `COLS` sama), `formatFinanceValue` & `generateVisualTextDiff` (span `addition-marker` merah) disalin apa
adanya; gagal fetch/parse/susun data = "SISTEM ERROR: Gagal Menghubungi Webhook n8n" (data disusun di `buildView` DI
DALAM try, sama `renderResult` asli -- data n8n yg bentuknya aneh tidak merusak halaman); cetak `window.print()` dgn judul
sementara `Audit_Report_Audit_Report_PO_Invoice` (2 dtk, sama asli). BEDA: semua nilai n8n disanitasi DOMPurify (span
diff tetap tampil), area cetak = portal `#verification-qfp-print-area` (index.css) + `@page A4 portrait 10mm` lewat
`<style>` di halaman (aktif hanya selama halaman terbuka), chip ringkasan "N / M checks match" (tampilan saja).
Diuji jsdom 19 cek. Belum dites ke n8n production.

## LSA (`/lsa`, `src/pages/LsaPage.tsx`, 2026-10-06)

Migrasi `LSA.html` ("Waruna LSA Audit — Modern Compliance Dashboard"), submenu ke-7 **Compare Doc** (group `'LSA'`,
page_key `lsa`, BELUM di-assign ke role -- hanya Admin). SAMA dgn file asli: Quotation & Certificate wajib, Delivery Order
opsional, maks 50 MB/PDF; FormData `job_id`/`penawaran`/`sertifikat`/`surat_jalan` POST ke `.../webhook/audit-dokumen`;
polling `.../webhook/check-status-audit?job_id=&_t=` tiap 8 dtk (header no-cache; respons HTML/kosong/`processing`/baris
job tidak ada = tunggu), batas 10 menit (timer 1 dtk); baris job -> kolom payload1..payload20 digabung -> base64 UTF-8 ->
JSON (`tabel_audit` wajib array, else "Unrecognized audit payload format."). Header: vessel, vendor, badge versi workflow
n8n (+tooltip), overall status (warna & skor sama), alert dokumen MISSING; tab Document Compliance (Needs Attention, grup
`grup_penawaran`, alias "kode - sistem", badge sertifikat, baris alasan AI) & Certificate Registry (field mismatch merah,
badge expiry); filter "Only Issues" = perilaku asli (sembunyikan semua baris MATCH termasuk SELURUH baris registry
sertifikat); Hide/Show Upload Form; Print = header + kedua tabel (portal `#lsa-print-area`, `@page A4 landscape` lewat
`<style>` halaman). Nilai dulu di-escape `esc()` -> di React teks biasa (tanpa DOMPurify). Yang ditambah (tampilan):
jumlah issue/sertifikat di tab, progress bar waktu tunggu. Kotak upload 1 file = komponen bersama
**`src/components/SingleFileDrop.tsx`** (diekstrak dari Requisition RH, prop `required`/`badge`). Diuji jsdom 62 cek
(+ regresi Requisition RH 38). Belum dites ke n8n production.

## SPB — Requisition RH & Oil Request (2026-10-06, migrasi 2 halaman HTML mandiri)

Menu induk sidebar **SPB** (ikon `ClipboardList`, `basePath:'/spb'`) berisi 2 submenu; group PAGE_REGISTRY `'SPB'`,
page_key `requisition_rh` & `oil_request` (BELUM di-assign ke role -- hanya Admin sampai di-assign). Keduanya TANPA tabel
Supabase (langsung ke webhook n8n dari browser, sama versi asli) & tampilan seragam (lebar penuh, Sora, form kiri dgn
header gradient plum + kotak upload drag & drop, kanan empty state 3 langkah / kartu Analyzing / hasil).
**Klik menu induk (desktop) sekarang membuka SUBTAB PERTAMA yg boleh diakses** (`t.subTabs?.[0]?.path ?? t.path`,
MainLayout) -- berlaku semua menu; akses penuh = sama dgn sebelumnya.

### Oil Request (`/spb/oil-request`, `src/pages/OilRequestPage.tsx`)

Migrasi `Oil Request.html` ("Waruna AI LSA Audit"). SAMA: Requisition/PO & Lubricating Oil Record masing2 boleh >1 PDF,
digabung di browser dgn **pdf-lib** (1 file = dikirim apa adanya) -> FormData `file_permintaan` (Requisition_Merged.pdf) &
`file_oil` (OilRecord_Merged.pdf) POST ke `.../webhook/Permintaan-Oli`; respons JSON -> `html || data || JSON.stringify`;
pesan error "Harap upload dokumen di kedua kolom!" / "Terjadi kesalahan: …" (dulu `alert`, kini kotak merah di form).
Daftar file: pilih berkali-kali = DITAMBAH (dedup nama+ukuran+tanggal), urutan daftar = urutan halaman, hapus per file.
**pdf-lib DIPASANG LAGI** (`^1.17.1`, versi sama file asli; di-`import()` dinamis hanya saat >1 file) -- catatan lama
"pdf-lib sudah di-uninstall" (FAR Overseas) tidak berlaku lagi utk dependency ini.
**Keamanan -- BEDA dari Requisition RH**: hasil n8n berupa HTML + script (versi asli `innerHTML` + `eval` di halaman).
DOMPurify akan membuang script -> hasil bisa rusak, jadi dirender di `<iframe srcDoc sandbox>` **TANPA
`allow-same-origin`** (origin opaque: script n8n tetap jalan tapi tidak bisa membaca token/localStorage app). Iframe
memuat lucide UMD (lingkungan sama halaman asli), font Sora dipaksa, & skrip kecil melapor tinggi konten via
`postMessage` (`__beehiveOilResultHeight`, parent hanya menerima dari `contentWindow` iframe itu). JANGAN ganti ke
`dangerouslySetInnerHTML`/`eval`. Diuji jsdom 19 cek (gabung PDF nyata 1+2 halaman = 3, passthrough 1 file, FormData,
sandbox, tinggi, fallback JSON, error, validasi). Belum dites ke n8n production (eksekusi script di iframe belum terverifikasi).

### Requisition RH (`/spb/requisition-rh`, `src/pages/RequisitionRhPage.tsx`)

MIGRASI halaman mandiri `Manualbook.html` ("Verification Portal - Waruna Group", verifikasi AI requisition/PO
vs Running Hours report) ke app -- permintaan user: **murni migrasi, LOGIKA JANGAN DIUBAH**. Yang sama persis
dgn file asli: POST FormData (`engine_type`, `job_id`=`JOB-<ms>`, `RH_Report`, `Requisition_Report`) LANGSUNG
dari browser ke webhook n8n `.../webhook/277b56f1-...` (BUKAN lewat proxy `/api`), polling
`.../webhook/check-audit-status?job_id=` tiap 3 dtk maks 60x (timeout 3 menit), semua pesan error n8n
(PESAN_ERROR/DATA KOSONG/API ERROR/TIMEOUT, Bahasa Indonesia apa adanya), kelompok per `Subsystem`
("-"/kosong = GENERAL COMPONENTS), checkbox VERIFY default tercentang kalau `AI_Status` mengandung "APPROVED",
warna badge REDUCED/UNDER-ORDER/lainnya, Download (tanpa kolom Inventory & Decision) / Download Full -- hanya
baris tercentang dicetak, kolom VERIFY tidak dicetak, header subsystem tanpa baris tercentang disembunyikan.
Yang berubah: tampilan gaya app (revisi 2026-10-06 permintaan user: LEBAR PENUH tanpa `max-w`, font Sora dipaksa
`style` root krn kontrol bawaan browser tidak selalu mewarisi, form kiri 340px/360px di 2xl dgn header gradient plum,
Engine Category = 2 tombol radio ME/AE [nilai sama], kotak upload drag & drop -- input file asli tetap ada `sr-only`
& tetap sumber file saat submit, kartu Analyzing + timer tampilan, empty state 3 langkah, ringkasan Items/Approved/
Reduced/Under-order/Verified, aksen kiri baris per status) dan **semua nilai dari n8n disanitasi DOMPurify** (dulu disuntik mentah ke
innerHTML). Print = portal `#requisition-rh-print-area` (`hidden print:block`, aturan di `src/index.css`); Ctrl+P
biasa = semua baris (sama asli). Tanpa tabel Supabase; page_key `requisition_rh` (group "Requisition RH") BELUM
di-assign ke role -- hanya Admin sampai di-assign di Kelola Role & Akses. **Catatan keamanan (diterima, sama
versi asli)**: URL webhook n8n terlihat di bundle & webhook tidak butuh login; polling berhenti kalau user pindah
halaman (job n8n tetap jalan). Diuji jsdom 38 cek, `tsc` bersih, `vite build` sukses. Belum dites ke n8n production.

### Auto Rename (`/spb/auto-rename`, `src/pages/AutoRenamePage.tsx`, 2026-10-08)

Migrasi `auto Rename.html` ("Item Names AI -- Item Normalization Workspace", normalisasi nama item T01), submenu ke-3 **SPB**
(page_key `auto_rename`, BELUM di-assign ke role -- hanya Admin). Tanpa tabel Supabase. SAMA dgn file asli: upload
.xlsx/.xls (maks 4 MB), dibaca di browser dgn **SheetJS 0.20.3**, sheet pertama yg punya header `ItemName` dipilih otomatis
(dropdown ganti sheet), baris kosong dibuang, id baris `R<n>`; "Process with AI" membangun ulang xlsx 1 sheet `Items` dari
sheet terpilih -> FormData `data` (`items-to-validate.xlsx`) POST LANGSUNG ke `https://n8.waruna-group.co.id/webhook/validate-excel-ai-v2`
(timeout 180 dtk, maks 2.000 item); respons (`[]` / `results` / `data.results`) dipasangkan per `row_id` + `ItemCode`
(duplikat / tidak ada / kode beda = NEED_REVIEW, rekomendasi = nama asli); modal Review -> Save & Approve disimpan di browser;
Export Excel (sheet `AI Review`, 5 kolom hasil ditambah, nama asli tidak ditimpa); Try Sample; semua pesan toast Indonesia apa adanya.
**Dependency `xlsx`** dipasang dari tarball resmi SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) -- JANGAN
ganti ke `xlsx` npm (0.18.5, usang & ada CVE); `exceljs` tidak bisa baca .xls. Di-`import()` dinamis (chunk terpisah ±500 KB).
Nilai n8n dirender sbg teks React (tanpa innerHTML/DOMPurify). BEDA (tampilan): gaya app (header ikon ungu, kartu, `PaginationFooter`
15 baris/halaman, modal & toast gaya app); sidebar/topbar file asli dibuang; kartu stat "Need Review" bisa diklik = filter
Need Review (pengganti menu "AI Review" sidebar asli). Diuji jsdom 34 cek (xlsx + xls, sheet pertama tanpa ItemName,
tolak ekstensi/ukuran, mapping hasil, filter/search, review, Esc, export, 404). **Belum dites ke n8n production** -- perlu
CORS (Allowed Origins) di node Webhook mengizinkan origin BeeHive.
