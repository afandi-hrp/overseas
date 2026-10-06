<!-- Dipindah dari CLAUDE.md 2026-10-06 (CLAUDE.md diringkas; file ini dibaca saat modulnya dikerjakan). -->

## Relasi Audit PIB ↔ Invoice Recap Sea & Air — "bagian 2" (2026-10-01, kode SELESAI, sql/031+032 SUDAH DIJALANKAN 2026-10-01)

Item yang menyangkut KEDUA halaman dikerjakan bareng. **Pelurusan user**: n8n HANYA membaca dokumen
dgn AI lalu menulis hasilnya ke Supabase — SEMUA otomatisasi dibuat di DB (trigger/fungsi), BUKAN
n8n; nama fungsi baru dipastikan belum ada (inspeksi `sql/030`/`030b`, + pre-check di awal 031 yg
membatalkan kalau ada fungsi bernama sama TANPA komentar `beehive:031`). Export TETAP.
"Penulis service" = `auth.email() IS NULL` (n8n / SQL Editor) — SELALU lolos semua guard di bawah.

**Keputusan user (jangan diubah tanpa konfirmasi ulang)**:
1. Konfirmasi validasi (review cost Accept/Ask vendor, edit nominal cost, Accept/Mark mismatch/
   **Correct** nilai dokumen) **HANYA Admin**. Edit Duty tetap boleh siapa pun yg punya hak edit.
2. **Submit to Finance** hanya kalau 0 issue (TIDAK ada "submit anyway"). Setelah submit baris
   **terkunci** (Edit/Delete/review/edit Costs & Documents nonaktif, DB menolak UPDATE/DELETE) —
   hanya **Admin** bisa **Unlock** dgn alasan (≥5 karakter), tercatat di audit trail.
3. **Mark as audited** (Audit PIB: tombol, "Save & mark as audited", menu "Move PIB to Audited" di
   Recap) hanya kalau PIB terhubung ke baris Recap DAN Recap-nya 0 issue (= sudah bisa Submit).
   PIB manual yg belum terhubung -> hanya bisa disimpan Draft.
4. Edit shipment di Recap (user) -> PIB terkait otomatis kembali Draft + chip/banner ungu
   "↻ Changed in Invoice Recap — please re-audit" (kolom `reaudit_reason`/`reaudit_at`).
5. Upload ulang AWB yg sama tanpa sadar -> ditandai **duplikat** (`duplicate_of`, chip merah) —
   TIDAK digabung/ditimpa. Upload dokumen susulan nanti via n8n (upsert by AWB) — hasil AI tetap utuh.
6. Quotation freight per BL: BARU tombol "+ Add quotation" (kartu Freight origin/destination tab
   Costs) — klik = info "coming soon"; pembacaan quotation oleh n8n menyusul.

**`sql/031`** (idempotent, uji PGlite 45 cek): kolom baru `rekapan_seaair.po_manual jsonb`,
`duplicate_of`, `submit_unlock_reason/_by/_at`; `tabel_audit_seaair.reaudit_reason/_at`,
`ai_snapshot jsonb`, `ai_snapshot_at`, `duplicate_of`. Fungsi: `fn_seaair_recap_issue_count`
(checklist <100 + cost Over/Under belum direview; doc mismatch TIDAK — fuzzy relax hanya ada di JS),
trigger `trg_seaair_guard_mark_audited`, `trg_seaair_recap_lock`, `trg_seaair_reaudit`,
`trg_seaair_snapshot_ai` (simpan nilai AI tiap tulis service), `trg_seaair_flag_duplicate`,
`trg_seaair_validation_admin_only` (catatan cost, `checks` cost, check dokumen `manual` yg
`match`/`values` berubah atau baru jadi manual), RPC `fn_seaair_unlock_submit(p_rekapan_id,
p_reason)` & `fn_seaair_reread_from_ai(p_seaair_id)` (Draft saja, kembalikan nilai AI; notes &
status tidak disentuh). Semua aksi dicatat ke `audit_trail` format app "X — Lama: … → Baru: …".
**`sql/032`**: `trg_seaair_auto_draft` — PIB baru dari service (status null/LENGKAP) -> ARCHIVED.
**Efek setelah dijalankan (2026-10-01)**: PIB/Recap LAMA tidak punya `ai_snapshot` (tombol Re-read
baru muncul utk baris yg ditulis n8n SETELAH 031) & `duplicate_of` hanya terisi utk insert baru;
baris Recap yg SUDAH punya `tgl_submit_finance` langsung TERKUNCI (perlu Unlock Admin utk dikoreksi);
insert dari SQL Editor juga dianggap service (ikut jadi Draft, lolos guard).

**Frontend**: `markAuditedBlocker()` (`SeaAirAuditHelpers.ts`, SATU-SATUNYA aturan blokir audited di
UI) dipakai `SeaAirAuditDetailModal`/`SeaAirAuditEditModal`; `fetchSeaAirAuditLinkInfo` kini juga
hitung `recapIssues`/`recapPoManual`. Recap: `isRecapLocked`, `parsePoManual`/`poManualFor`
(`SeaAirRecapHelpers.ts`); Costs/Documents tab terima `isAdmin`/`locked`; Edit shipment: field
"Submitted to Finance" DIHAPUS, KG/valas/currency/Partial per PO -> `po_manual` (hanya tampil kalau
kolomnya ada = 031 sudah jalan) + tombol "Split weight evenly"; Split per PO "By KG" otomatis kalau
SEMUA PO punya KG (toggle "As recorded"); chip Partial di Recap & Audit PIB. Issue `dokumen_kurang`
'-' (trigger kelengkapan isi '-' kalau lengkap) diabaikan.
**Uji**: jsdom Recap 112 cek, Audit page 51, render 95, PGlite 031 45 + 032 3 — 0 gagal.
Belum dites ke production.

**Keterbatasan / catatan**:
- Gerbang doc mismatch HANYA di frontend (DB cuma menghitung checklist + cost).
- Mode **List** (tabel lama) — SUDAH digate 2026-10-01: baris terkunci tampil chip "🔒 Locked" tanpa
  Edit/Delete, tombol "Audit" (undraft) nonaktif selama ada issue, modal lama Cost/Doc Validation
  `canEdit` = hak edit && Admin && tidak terkunci (edit Duty non-Admin lewat tab Documents jendela Open).
- (Historis) Sebelum 031 dijalankan: Submit/Mark audited sudah digate di UI, tapi tidak ada kunci DB, kolom
  `po_manual` tidak ada (form KG per PO tersembunyi), Unlock/Re-read RPC belum ada (error).
- RPC `update_cost_validasi_manual` dulu menghitung `SESUAI`/`TIDAK_SESUAI` (app memakai `MATCH`/
  `OVERCHARGE`/`UNDERCHARGE`) -> kolom ringkasan salah; DIPERBAIKI `sql/033` (signature sama, backfill
  baris lama opsional & dikomentari). Aplikasi tidak membaca kolom ringkasan itu.
- Belum: freight otomatis per delivery term, quotation per BL (n8n), bukti bayar (upload) di Finance
  Handover, status "still being processed".

## Invoice Recap Sea & Air — tampilan baru "Invoice Recap" (2026-10-01)

Redesain `/sea-air/rekapan` dari spek user ("BeeHive AI · Invoice Recap", V167), pola SAMA dgn Audit
PIB di bawah (token `SeaAirAuditUi.tsx`, font Sora). Backlog fitur yg ditunda: CLAUDE.md "BACKLOG —
Invoice Recap Sea & Air". **Keputusan user**: Supplier = kolom `vendor` (supplier BARANG; vendor jasa
di `*_vendor`); **Landed cost = HANYA biaya invoice, TANPA duty & tax**; kelompok "PPJK & trucking" =
EMKL; Needs attention = skor rendah & BELUM dikonfirmasi user; Submit to Finance = tombol, tanggal
otomatis hari ini (lokal); tab Costs DIBANGUN ULANG (opsi A); Card | List (List = tabel lama
`SeaAirRekapanRowGroup` apa adanya); Export TETAP; menu sidebar tetap.

**File**: `src/utils/SeaAirRecapHelpers.ts` (SATU sumber: `RECAP_SEGMENTS`, `computeLandedCost`,
`computeRecapIssues`, `recapStatus`, `computeDocStats`, `fetchRecapSummary`, `fetchRecapLog`,
`todayLocalIso`), `SeaAirRecapCardList.tsx` (5 KPI + kartu + `CostMixBar`/`ScoreDot`),
`SeaAirRecapDetailModal.tsx` (Open), `SeaAirRecapCostsTab.tsx` (tab Costs), `SeaAirRecapDocumentsTab.tsx`
(tab Documents), `SeaAirRecapEditModal.tsx`
(Edit shipment). `SharedDataTable.tsx` disentuh HANYA di cabang `isSeaAirRekapan` + enrichment
rekapan di `fetchRecords` (checklist kini juga `dokumen_kurang`; `r.recap_issues`, `r.recap_has`) +
filter `recapNeedsAttentionOnly` (`.in('id', recapNeedsAttentionIds)`).

- **Kelompok biaya** (`RECAP_SEGMENTS`): PPJK & trucking = `emkl_biaya`; Origin = `biaya_origin`;
  Local = `biaya_destination`+`pbm`+`lift_off`+`inspeksi`+`handling`+`other`. Landed cost = jumlah
  segmen (fallback `total_invoice` kalau semua segmen kosong). `total_invoice` & `total_keseluruhan_biaya`
  ditampilkan apa adanya ("recorded") di kartu Landed cost. Duty & tax (`duty_total`, BM/PPN/PPh)
  ditampilkan terpisah ("not in landed cost").
- **Issues** (`computeRecapIssues`): checklist `pct_kelengkapan` < 100 ("Missing required document:
  <dokumen_kurang>"); section Cost Validation (kecuali CUSTOM & SURVEYOR) dgn baris Over/Under &
  BELUM ada baris `cost_validasi_catatan_seaair`; mismatch Doc Validation (setelah relax) yg
  `manual` false. Status kartu: Submitted (`tgl_submit_finance` terisi) / ⚠ N issues / Ready.
- **KPI** (`fetchRecapSummary`): SEMUA baris lolos filter (tipe/company/tanggal `tgl`/search),
  issue dihitung utk baris belum submit (chunk 50) — juga sumber id utk toggle Needs attention.
- **Kartu**: BL/AWB, tipe·container, badge PT, Uploaded (`created_at`), rute, ETD/ETA/ATA,
  supplier, PO +N/Hide, chip status (+tooltip issues), titik Doc match/Cost/Doc complete
  (`doc_validation_pct`/`cost_validation_pct`/`checklist_pct`, abu kalau datanya belum ada),
  Landed cost + bar kelompok, Open. Sort: Newest/Oldest/Total invoice · highest.
- **2026-10-06 (permintaan user)**: (1) Export & "Upload documents" DIPINDAH dari header ke ujung kanan panel filter;
  panel `@container` + `flex-wrap` (label "Company"->"PT", "Needs attention"->"Attention", "Upload documents"->"Upload" di
  bawah lebar panel 1450px) -- pola SAMA Audit PIB. (2) Jendela Open: layar <=1600px HAMPIR PENUH LAYAR
  (`max-[1600px]:max-w-none h-full`), monitor besar `max-w-[1560px]` (dulu 1180px). (3) **Split per PO dibangun ulang (gambar
  user)**: kolom PO · vessel (chip "◐ Partial N · USD x this shipment") | KG · share | PPJK & trucking | Origin | Local | Duty & tax |
  TOTAL (TERMASUK duty); toggle Summary|Per invoice + **By KG | Evenly**. Nilai DIHITUNG di browser dari biaya invoice
  (`allocate`, dibulatkan ke rupiah, selisih pembulatan ke baris terakhir -> jumlah PERSIS total); By KG = total × KG PO ÷ total
  KG (aktif hanya kalau SEMUA PO punya KG di Edit shipment, default kalau ada), Evenly = total ÷ jumlah PO. Opsi lama "As
  recorded" (kolom `*_split` tersimpan) DIHAPUS dari tampilan (kolom DB tidak diubah). (4) **Tab Audit trail dipercantik**
  (`RecapAuditTrail`): per hari + garis waktu, entri menit sama + user sama + aksi sama digabung 1 baris dgn chip modul
  (Invoice Recap / Audit PIB / Document validation / Cost validation), ×N utk duplikat, deskripsi generik trigger ("Edit/Hapus
  data ...") disembunyikan, format app "X — Lama → Baru" dirapikan, 12 event pertama + "Show all". `RecapLogEntry` + `entity`/`verb`.
- **Open**: header (Edit, Submit to Finance [ada issue -> "· N to fix" + konfirmasi daftar issue,
  tetap bisa submit], ⋯ = Move PIB Draft/Audited (`handleDraftSeaAir`/`handleUndraftSeaAir` lama) &
  Delete (`DeleteModal` lama, perilaku TETAP)), chip skor, banner blocker/submitted.
  Overview: Shipment (Company nama lengkap, Supplier, Invoice no, Recap date, Delivery term dari
  `tabel_audit_seaair`, berat/CBM, ETD→ETA, ATD→ATA, container (field "Freight invoice · storage" DIHAPUS 2026-10-05, permintaan user),
  AI note=`notes`), Landed cost (+By vendor), Split per PO (Summary/Per invoice dari `*_split`
  tersimpan — 1 nilai per shipment = bagi rata; By KG belum).
- **Tab Costs** (`SeaAirRecapCostsTab`): logika SALINAN PERSIS `ValidasiShipmentInvoiceLengkap.tsx`
  (toleransi, Jalur Hijau/Merah EMKL `expected_alt`, sisip baris SURVEYOR, `updateCheck`, simpan RPC
  `update_cost_validasi_manual` seluruh `checks`, review = upsert/hapus `cost_validasi_catatan_seaair`
  onConflict `seaair_id,section`; Accept difference=MATCH, Ask vendor=MISMATCH wajib note). **Kalau
  modal lama diubah, WAJIB sinkron ke file ini.** + kartu Duty & tax (PIB) (sejak 2026-10-05 = rumus &
  data tab Documents › Duty, lihat "Duty SATU rumus" di bawah) & SPTNP.
- **Tab Documents** (`SeaAirRecapDocumentsTab`, DIBANGUN ULANG PENUH 2026-10-01 atas permintaan
  user): kiri Checklist (daftar dokumen SAMA `SeaAirChecklistModal`, baca saja); kanan Document
  validation per section (`SECTIONS` di file itu = baris/kolom SAMA konstanta modal lama:
  INVOICE_FCL/FAKTUR_PAJAK/PIB [baris `SEA_AIR_PIB_MATRIX_ROWS`, kolom `required`]/EMKL/ACTUAL/VESSEL)
  + kartu Duty. Logika SALINAN PERSIS `SeaAirValidasiModal.tsx`: load -> `relaxSeaAirDocChecks`;
  "✓ Checked — accept"/"Mark mismatch" = toggle 2 arah, PER BARIS utk INVOICE_FCL/EMKL/ACTUAL
  (`toggleRowStatus`), PER SEL utk FAKTUR_PAJAK/PIB (`toggleCheckStatus`), VESSEL tanpa status
  ("Has data/Empty"), "Nama Barang Kena Pajak" tanpa status; "Correct" = edit `values.doc` (parser
  `parseIndoInput`/`parseForeignInput` sama); TOTAL CIPL × Bukti TF dijumlah (tampilan); Duty =
  NDPBM + item + Actual, status toleransi Rp 3.000; simpan RPC `update_validasi_matriks_manual`
  (p_checks/p_duty_items/p_duty_aktual/p_duty_ndpbm, `Number()` sama modal lama) + verifikasi
  panjang checks. "Undo" = kembalikan sel ke kondisi saat dimuat (hanya perubahan BELUM disimpan).
  Section yg punya mismatch saat dimuat terbuka otomatis & TIDAK menutup sendiri saat di-accept.
  **Kalau modal lama diubah, WAJIB sinkron ke file ini.**
- **Hak akses tab** (sama page_key modal lama): Costs tampil kalau `canSee('sea_air_cost_validation')`,
  edit = `canEdit('sea_air_cost_validation')`; Documents tampil kalau dokumen_validation ATAU
  checklist_validation bisa dilihat, edit = `canEdit('sea_air_dokumen_validation')`; Edit shipment/
  Submit/Draft/Delete = `canEdit('sea_air_rekapan')`. Tab Costs/Documents yg sudah dibuka TETAP
  terpasang (hidden) -> perubahan belum disimpan tidak hilang saat pindah tab; tutup jendela dgn
  perubahan belum disimpan -> konfirmasi.
- **Edit shipment**: field yg bisa diedit di tabel lama (EMKL vendor TETAP read-only, `*_split` via
  List), PO & vessel (`po_detail`), "Submitted to Finance" bisa dikoreksi/Clear. Simpan =
  `handleInlineSaveRow` lama (cbm -> tabel_audit_seaair).
- **Diuji (2026-10-01)**: `tsc` bersih, `vite build` sukses, uji integrasi halaman penuh (jsdom +
  Supabase tiruan yg menyimpan data) 82 cek lulus: KPI, kartu & status, tab tipe, Needs attention,
  List, Overview, Costs (review simpan/undo, Jalur Merah, edit Actual -> RPC & status MATCH),
  Documents (accept/undo per sel, toggle per baris, Correct value, Duty, simpan RPC & cek DB,
  perubahan bertahan saat pindah tab, konfirmasi tutup, Discard), view-only (tanpa tombol tulis),
  Audit trail, Edit shipment (ETA & vessel tersimpan & tampil), Move Draft, Submit (tanggal hari ini),
  Delete, Export. Regresi Audit PIB tetap lulus (50 + 83). Satu-satunya
  console.error = peringatan dnd-kit tabel lama. **Belum dites ke Supabase production.**

### Bagian 2 (2026-10-01) — aturan relasi dengan Audit PIB

Ringkasan lengkap di CLAUDE.md "Relasi Audit PIB ↔ Invoice Recap Sea & Air". Di jendela Open:
Submit to Finance nonaktif selama ada issue (tanpa "submit anyway"), setelah submit chip "Locked" +
banner hijau read-only + tombol **Unlock (Admin)** (textarea alasan -> RPC `fn_seaair_unlock_submit`,
info "Unlocked by Admin … — alasan" tampil setelahnya); Edit & Delete shipment nonaktif saat
terkunci; menu "Move PIB to Audited" nonaktif selama ada issue. Tab Costs & Documents: konfirmasi
hanya Admin (`canEdit && isAdmin && !locked`), non-Admin lihat catatan abu; Edit duty tetap
`canEdit && !locked`. Chip duplikat (`duplicate_of`) di kartu & header. Split per PO "By KG"
memakai TOTAL shipment × KG PO / total KG (pembulatan per sel, tampilan saja).

## Kartu Audit PIB & Invoice Recap — susunan baru + responsif 14"/24" (2026-10-05, gambar user)

- **Invoice Recap** (`SeaAirRecapCardList.tsx`): 4 kolom -- AWB/tipe/PT/Uploaded | **supplier tebal (huruf besar) + chip rute
  "ORIGIN → DEST"**, baris 2 = PO (+N PO) + chip ETD/ETA/ATA | chip status ("⚠ N issues", Chip kecil) + titik skor | Landed cost +
  bar + Open.
- **Audit PIB** (`SeaAirAuditCardList.tsx`): **5 kolom** -- PIB | PT + supplier + PO | **kolom validasi BARU** (chip
  `validationLabel`/`VALIDATION_META` "! N PIB differences to review" + chip kuning nama field beda, re-audit/duplikat/Waiting) |
  Duty & tax | chip Draft/Audited + tombol Open ungu penuh. `StatusPill`/`ValidationPill` tidak dipakai kartu lagi.
- **Responsif = container query lebar KARTU** (`@container`, pola Finance Handover): < @2xl 1 kolom, @2xl 2 kolom bertumpuk,
  `@5xl` (≥1024px kartu, laptop 14" + zoom 90%) 1 baris ringkas, `@7xl` (≥1280px, monitor 24") kolom tepi & jarak lebih lega.
  JANGAN kembali ke breakpoint layar `lg:` (lebar kartu tergantung sidebar). Diuji jsdom 11 cek (isi kolom), CSS dicek di build.

## Form E utk barang dari China — Invoice Recap Sea & Air (2026-10-05, permintaan user; `sql/044` SUDAH DIJALANKAN 2026-10-05)

Shipment yang asalnya China (`rekapan_seaair.origin`, `isChinaOrigin` di `SeaAirRecapHelpers.ts` = SATU-SATUNYA definisi:
CHINA/TIONGKOK/PRC, kode "CN" berdiri sendiri, UN/LOCODE "CNxxx", nama pelabuhan/kota utama China; Hong Kong TIDAK) WAJIB
Form E tercentang (`dokumen_checklist_seaair.ada_form_e`). Belum tercentang & belum ada catatan -> issue
`FORM_E_ISSUE_TEXT` di `computeRecapIssues` -> Submit to Finance terkunci, kartu "⚠ N issues", KPI/badge Needs attention,
gerbang Mark as audited Audit PIB (semua lewat `computeRecapIssues`; 3 pemanggil -- SharedDataTable, `fetchRecapIssueData`,
`fetchSeaAirAuditLinkInfo` -- kini juga membaca `ada_form_e`, `origin` & catatan). Tab Documents: tile Form E merah
"Required — from China" + alert di bawah checklist dgn textarea catatan (min. 5 karakter) -> Save -> alert hilang,
catatan tampil (Edit/Delete). Catatan = tabel BARU `seaair_form_e_note` (sql/044: 1 baris per `seaair_id`, tipe ikut
`dokumen_checklist_seaair.seaair_id`, catatan ≥5 karakter, RLS baca rekapan/audit/finance, tulis `has_edit_access('sea_air_rekapan')`)
-- SENGAJA bukan kolom di checklist (ditulis n8n) / rekapan (trigger re-audit & kunci). Tulis = upsert onConflict seaair_id
(`canEdit('sea_air_rekapan')`, tidak terkunci, bukan financeView). **Gerbang HANYA di frontend** (DB `fn_seaair_recap_issue_count`
tidak tahu aturan ini, sama seperti gerbang doc mismatch). Tabel belum ada -> `fetchFormENotes` null -> aturan TIDAK diterapkan
(fail-open) + info abu "run sql/044". Diuji: PGlite 044 8 cek, jsdom 33 cek.

## Duty SATU rumus — Audit PIB, Invoice Recap Costs & Documents (2026-10-05, permintaan user)

Kartu duty di jendela Open Audit PIB ("Duties & taxes"), tab Costs Invoice Recap ("Duty & tax (PIB)") dan tab
Documents › Duty kini memakai rumus & data YANG SAMA: `calcSeaAirDuty`/`compareSeaAirDuty` (`SeaAirAuditHelpers.ts`,
SATU-SATUNYA rumus) dari `dokumen_validasi_matriks_seaair` (`duty_ndpbm`, `duty_items`, `duty_aktual`): per item Rp =
nilai pabean × NDPBM; BM = Rp × %BM; basis = Rp + BM; PPN/PPh = basis × %; toleransi **Rp 3.000**
(`SEA_AIR_DUTY_TOLERANCE`). Baris BM / PPN / PPh / Total duty; kolom Actual (PIB) | Expected (calculation) | Status.
Actual = `duty_aktual` (sama tab Documents); kosong/0 -> nilai baris Audit PIB (bm/ppn_nilai/pph_nilai/total_pib).
Matriks/NDPBM/item belum ada -> Expected "—", status "Not calculated" + keterangan isi lewat Documents › Edit duty.
Tabel bersama `SeaAirDutyCompareTable.tsx` (baca saja; edit duty tetap di tab Documents). Tab Costs membaca ulang data
duty tiap tab-nya ditampilkan (prop `active`). `computeDutyRows` TETAP dipakai utk Import value, Checks ("Total PIB =
BM + PPN + PPh", "Import value = customs value + BM") & kartu daftar Audit PIB. Diuji jsdom 16 cek.

## Finance Handover Sea & Air — DIGANTI halaman gabungan (2026-10-01)

Halaman `/sea-air/finance` versi pertama (sql/034) DIGANTI halaman gabungan FAR + Sea & Air
`/finance-handover` — lihat "Finance Handover gabungan" di CLAUDE.md. Yang tetap dari 034: kolom
`finance_received_at/_by`, `paid_date`, `paid_reference`, `paid_by`, `paid_recorded_at`, policy
`rekapan_seaair_select_finance`, kunci submit (flag `app.seaair_unlock`), Unlock Admin ditolak kalau Finance
sudah menerima, kolom Finance tidak memicu re-audit. Invoice Recap: status kartu "✓ Received by Finance" /
"✓ Paid dd Mon", banner jendela Open menampilkan Received/Paid.

## Audit PIB Sea & Air — tampilan baru "PIB Audit" (2026-09-30)

Redesain TAMPILAN `/sea-air/audit` dari spek prototipe user ("BeeHive AI · Audit PIB", V165).
Cakupan yang disepakati = **tahap 1: tampilan + query BACA tambahan** — fitur spek yang butuh
DB/n8n/logika bisnis baru SENGAJA BELUM dibuat (lihat "Belum" di bawah). Font TETAP Sora (keputusan
user), warna ikut spek (plum `#3B1B3D`, primer `#6B3470`, garis `#EADFD6`, teks samar `#6E5E70`,
token di `SeaAirAuditUi.tsx`, KHUSUS halaman ini).

**File**: `src/utils/SeaAirAuditHelpers.ts` (SATU-SATUNYA sumber rumus/format/query modul ini),
`src/components/SeaAirAuditUi.tsx` (token + chip/pill/kartu), `SeaAirAuditCardList.tsx` (kartu KPI +
daftar kartu), `SeaAirAuditDetailModal.tsx` (jendela Open), `SeaAirAuditEditModal.tsx` (Edit PIB /
Add manually). `SharedDataTable.tsx` HANYA disentuh di cabang `isSeaAirAudit` (header, toolbar,
area daftar, modal) + refactor rumus di bawah.

- **2026-10-06 (permintaan user, laptop 14" berantakan)**: Export & "+ Add manually" DIPINDAH dari header ke ujung kanan panel
  filter (`ml-auto`, label "+ Add" di bawah lebar panel 1450px); panel filter `@container` + `flex-wrap` (dulu nowrap +
  overflow-x -> tombol Refresh terpotong), label "PIB date"->"date" & "Company"->"PT" di bawah 1450px (pola panel Courier).
  **Audit trail jendela Open ringkas**: entri berturutan identik (aksi+user+detail, hari sama) digabung "×N", awal 6 baris
  terbaru + "Show all (N more)" (area scroll maks 340px) / "Show less"; jumlah entri di judul. Data tetap `fetchSeaAirAuditLog`.
- **Header** eyebrow "SEA & AIR" + "PIB Audit", Export (sama ExportModal lama, kolom TIDAK berubah)
  + "+ Add manually" (form baru) + Greeting. **Kartu KPI** (PIB records x draft · y audited /
  Customs value / Duties & taxes BM·PPN·PPh / Not validated yet) = `fetchSeaAirAuditSummary()`:
  baca SEMUA baris yg lolos filter (Company/tanggal/search, TANPA filter tab) per 1.000 baris,
  refetch saat filter berubah atau `seaAirSummaryNonce` naik (aksi tulis/Refresh/Delete).
- **Kartu filter**: tab **Draft | Audited | All** (+angka dari ringkasan; state `seaAirAuditType`
  `'draft'|'audit'|'all'`, default SEKARANG `'draft'`; 'all' = tanpa filter status di
  `fetchRecords`/`getExportData`), Search, PIB DATE (= `tgl_ppjk`, tidak ada kolom tgl PIB lain),
  COMPANY, toggle **Card | List** (`seaAirViewMode`, default Card; List = tabel lama
  `SeaAirAuditRowGroup` APA ADANYA), Refresh. Search kini juga `hs_code`
  (`SEA_AIR_AUDIT_SEARCH_COLS`).
- **Kartu PIB** (grid 270 | 1fr | 230 | 230): tanggal+No. PIB+chip Via/Term+AWB | PT badge+supplier+PO
  pertama & "+N PO"/Hide | DUTY & TAX (`total_pib`) + BM/PPN/PPh % | status Draft/Audited + pill
  validasi + Open. Garis kiri amber=draft, merah=ada PIB differences, hijau=audited. Chip
  **"Waiting for SPPB/…"** (pengganti banner kuning spek, keputusan user) = Draft yg
  `dokumen_checklist_seaair` `ada_pib/ada_sppb/ada_billing_djbc/ada_bpn`-nya belum lengkap.
- **Status validasi** (`fetchSeaAirAuditLinkInfo`, per id audit via `seaair_id`): ada baris
  `dokumen_validasi_matriks_seaair` → section 'PIB' di-`relaxSeaAirDocChecks` (SAMA modal) & hanya
  sel `required` `SEA_AIR_PIB_MATRIX_ROWS` (DIPINDAH dari SeaAirValidasiModal ke
  SeaAirValidasiHelpers, isi tidak berubah) → ada `match===false` = "differences", ada yg dinilai =
  "validated", else "not validated"; tanpa matriks & tanpa `rekapan_seaair` = "Not in Invoice
  Recap yet". "Open in Invoice Recap" = navigate `/sea-air/rekapan?q=<awb>` (SharedDataTable kini
  membaca `?q=` sbg isi awal Search).
- **Jendela Open**: Document (semua kolom `SEA_AIR_AUDIT_COLS` termasuk Document type/Remarks/
  SPTNP/Notes), Goods per PO (split `+` SAMA tabel lama; Valas per PO = `po_harga_detail`, IDR per
  PO = valas × kurs tersirat `item_price_idr ÷ item_price`; `po_harga_detail` KOSONG -> 1 PO pakai
  Item price valas/Rp; >1 PO -> PO Price Detail APA ADANYA (kosong = "—" + keterangan kuning "isi
  lewat Edit › Goods per PO"). Tab "As recorded | Split evenly" (estimasi bagi rata) DIHAPUS
  2026-10-05 atas permintaan user -- JANGAN dikembalikan tanpa diminta; form Edit: tombol "Split evenly"
  mengisi Amount valas tiap PO, baru tersimpan saat Save), Customs value build-up (Goods → Freight → Insurance=`asuransi`
  → Rounding/"Unexplained balance" >Rp1.000 → CV; header Balance = rumus lama), Duties & taxes
  (sejak 2026-10-05 = rumus & data tab Documents › Duty Invoice Recap, lihat "Duty SATU rumus" di bawah;
  versi lama "calculated vs on PIB" + BM "Derived" DIGANTI), Checks, Audit trail (`v_audit_trail`
  tabel_audit_seaair cocok awb/no_aju; dump mentah trigger TIDAK ditampilkan). Aksi: Edit & Delete
  (Draft saja, pola lama: baris LENGKAP tidak bisa diedit), Mark as audited (status LENGKAP,
  **tanpa syarat validated — keputusan user, "nanti diupdate"**), Reopen as draft (ARCHIVED).
- **Form Edit/Add**: 5 section + Live check. Menulis kolom yg SAMA lewat `update_seaair_row`
  (hanya field yg berubah) / `insert_seaair_row`. Customs value/Import value/Total PIB TETAP
  input manual, hitungan "AUTO/SUM/Reference" cuma pembanding + tombol "Use". Goods per PO ditulis
  balik " + " HANYA kolom yg berubah (`goodsLinesToFields`). Currency = kolom `kurs` (TEXT di DB).
  Uncheck "This PIB has an SPTNP" = kosongkan 3 kolom SPTNP saat simpan. Save as draft = ARCHIVED,
  Save & mark as audited = LENGKAP. Add: wajib PIB no./PIB date/BL, default USD/PPN 11/PPh 2,5.
- **Rumus Balance/Asuransi + `isCifDeliveryTerm` DIPINDAH** ke `computeSeaAirBalanceAsuransi()`
  (helper) — 4 titik lama di SharedDataTable (EditModal, fetchRecords, getExportData,
  handleInlineSaveRow) memanggilnya, hasil identik. `formatNoAju` juga dipindah ke helper.
- **Sidebar**: badge jumlah Draft (status ARCHIVED, count head) di submenu Sea & Air › Audit
  (`MainLayout.tsx`), refresh tiap pindah halaman + event `SEA_AIR_AUDIT_CHANGED_EVENT`.
- Nama PT lengkap dari `far_overseas_signer_config.company_name_full` (keputusan user); gagal/RLS
  → tampil kode.
- **Diuji (2026-09-30)**: `tsc --noEmit` bersih, `vite build` sukses, 28 unit test helper (angka
  mockup GMI cocok persis: Balance 4.967.143, Insurance 4.967.086,29, Rounding 56,71, BM 5%), 65
  asersi render jsdom + Supabase tiruan (kartu, Open draft/audited/view-only, Edit payload, Add,
  SPTNP), 0 console error. **Uji integrasi halaman penuh** (SharedDataTable + MainLayout di jsdom,
  Supabase tiruan yang MENYIMPAN data): 50 cek lulus — tab Draft/Audited/All, +PO, List/Card,
  Search, Company, Refresh, Open→Edit→simpan (nilai tersimpan & tampil lagi di Open/kartu),
  Mark as audited/Reopen (status + KPI + badge sidebar ikut berubah), Delete, Add manually, Export,
  Open in Invoice Recap (`?q=`), edit inline tabel lama (Balance/Asuransi hasil refactor benar).
  Satu-satunya console.error = peringatan nesting `<div>` di `<table>` dari dnd-kit tabel lama mode
  List (SUDAH ADA sebelumnya, bukan dari perubahan ini). **Belum dites ke Supabase production**
  (tidak ada akses DB dari sesi Claude Code) — cek RPC `update_seaair_row`/`insert_seaair_row`
  menerima semua kolom yg dikirim form baru (termasuk `kurs` teks & `status`).
- **Belum (spek, butuh DB/n8n/keputusan)**: syarat validated sebelum Mark as audited, re-audit
  otomatis saat Invoice Recap diedit, "Re-read from Invoice Recap", Partial PO, freight otomatis
  per delivery term dari Invoice Recap, log aksi rapi per PIB, Export 31 kolom (user: export TETAP
  seperti sekarang), banner shipment belum tercatat.
- **Bug lama DICATAT (belum diperbaiki, keputusan user)**: `kurs` bertipe TEXT (kode mata uang)
  tapi `SEA_AIR_AUDIT_COLS` memberi `type:'num'` → form Add Data/Edit LAMA (tabel List) input angka
  & `Number("USD")` = NaN → kemungkinan tersimpan null; tampilan tabel bisa "-". Form baru
  (`SeaAirAuditEditModal`) sudah memperlakukan `kurs` sbg teks.

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
  `sptnp_total` dkk & SENGAJA TETAP tampil "-" saat 0, TIDAK disentuh) (2026-09-30: rumus 4 titik ini
  kini SATU fungsi `computeSeaAirBalanceAsuransi()` di `SeaAirAuditHelpers.ts`) supaya baris CIF (Balance
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

## Bunker — tampilan Card | List + toolbar dinamis (2026-10-02)

Permintaan user: samakan dgn 4 halaman Compare Doc (lihat `docs/claude/audit-po.md` "Tampilan Card |
List" & "Toolbar dinamis"), komponen bersama `src/components/CompareDocCards.tsx`. Toggle Card | List
(default Card, tidak disimpan) di toolbar sebelum "Items"; List = tabel lama apa adanya. Baris kartu
(`DocRow alignTop`, susunan final 2026-10-02 permintaan user): kiri No PO besar PALING ATAS (sejajar
Vendor -- `alignTop` = kolom kiri & tengah rata atas, Doc Match & aksi tetap tengah), label "Workflow
Status" + `WorkflowSelect` (SAMA) 1 baris, `StatusBadge` sistem + "Updated <tgl>" PALING BAWAH | tengah Vendor tebal, chip Location
& Vessel SEJAJAR 1 baris (Location kosong = "-") | kanan "Doc Match" % besar (`computeMatrixMatchStats`,
warna hijau >=90/kuning >=60/merah, sama badge tombol Compare Doc tabel) | aksi Completeness, Compare Doc,
ikon History & Delete (gating `canEditBunker`). TANPA bar Urutkan (Bunker memang tanpa sort, selalu
`updated_at` DESC). Toolbar `@container`, Search `flex-1 min-w-[150px] max-w-[360px]`, label "Items" &
teks Card/List hilang di bawah lebar toolbar 1450px.

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

**Sejak 2026-09-30 badge % di 3 tombol Audit Courier DIGANTI titik status tombol "Validation"**
(nilai % yang sama, lihat "Jendela Validation" di `docs/claude/courier-features.md`) — perhitungan
di bawah TETAP berlaku.

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

## Courier — Document Validation, bug fix tooltip "Nilai dari ..." salah label (2026-09)

`getSrcTooltipLabel()` (module-level, `ValidasiModal.tsx`) — fungsi ini nentuin label tooltip
hover ("Nilai dari X") di kolom Src tiap sel, section `s_inv_freight_duty` (INVOICE FREIGHT &
INVOICE DUTY), baris "No. AWB". Ditemukan (via analisa lengkap src/cmp per sel diminta user)
**3 tooltip SALAH** karena logic-nya cuma cocokkan prefix id generik (`startsWith('if')`/
`startsWith('id')`), padahal 3 row id ini KEBETULAN cocok prefix itu tapi src-nya BUKAN dari
dokumen yang prefix-nya sugestikan:
- `if01` (kolom "Invoice Duty") — tooltip lama "Invoice Freight", SEHARUSNYA "Invoice Duty"
  (`fill("if01", invD.awb, invF.awb)` — src dari `raw.invoice_duty_v.awb`).
- `id06` (kolom "AWB") — tooltip lama "Invoice Duty", SEHARUSNYA "AWB" (`fill("id06", docAwb,
  cmpAwbFisik)` — src dari `dokumen_validasi.awb`, dokumen fisik AWB, BUKAN Invoice Duty sama
  sekali).
- `pib02` (kolom "SPPB/SPPBMCP") — tooltip lama "PIB", SEHARUSNYA "Invoice Freight / Invoice
  Duty" (`fill("pib02", invF.awb || invD.awb, sppbV.no_awb)` — src TIDAK PERNAH dari PIB).

**Fix**: 3 pengecualian eksplisit `if (rowMatch.id === '...')` ditambahkan SEBELUM cabang prefix
generik di `getSrcTooltipLabel()`. **Kalau nambah row id baru ke section `s_inv_freight_duty`
yang src-nya TIDAK sesuai pola prefix "if"="Invoice Freight"/"id"="Invoice Duty" (mis. row id
baru yang kebetulan diawali "if"/"id" tapi datanya dari dokumen lain) — WAJIB tambah
pengecualian eksplisit yang sama di sini, JANGAN andalkan prefix matching apa adanya.**

## Courier — Document Validation, revisi kolom & baris tabel INVOICE FREIGHT & INVOICE DUTY (2026-09)

Susulan dari analisa src/cmp mentahan di atas, 4 revisi eksplisit dari user ke section
`s_inv_freight_duty` (`ValidasiModal.tsx`):

1. **Rename kolom** (`compareDoc` row config) — "SPPB" → **"SPPB/SPPBMCP"** (row `pib02`, HANYA
   di section ini — row `pib01` di section `s_pib` juga py `compareDoc: "SPPB"` tapi itu kolom
   BEDA di tabel PIB terpisah, SENGAJA TIDAK ikut diubah); "PIB / SPPBMCP" → **"PIB"** (row
   `id07`, satu-satunya row yg pakai string itu).
2. **Baris "No. AWB", kolom "Invoice Duty" (`if01`)** — Cmp diganti dari `docAwb` jadi
   **`invoice_freight_v.awb`** (`fill("if01", invD.awb, invF.awb)`, GANTI dari
   `fill("if01", invD.awb, docAwb)`).
3. **Baris "Berat (kg)", kolom "AWB" (`id04`)** — Src diganti jadi fallback 2 tahap:
   **`invoice_freight_cost.actual_weight_kg` kalau ada Invoice Freight (`hasInvoiceFreight`),
   else `invoice_duty_cost.actual_weight_kg`** (`fill("id04", hasInvoiceFreight ?
   idOther.actual_weight_kg : invDutyCost.actual_weight_kg, hasInvoiceFreight ? awbDet.weight :
   null)` — `idOther` = alias `raw.invoice_freight_cost`, `invDutyCost` = `raw.invoice_duty_cost`,
   KEDUANYA sudah dideklarasikan di scope yang sama, TIDAK perlu variable baru). Cmp TIDAK
   berubah (tetap `awbDet.weight` kalau `hasInvoiceFreight`, else kosong).
4. **Row `id04` `hint`** — "(dari Invoice Freight)" → **"(dari Invoice Freight / Invoice Duty)"**
   (menyusul perubahan #3, label baris ikut mencerminkan sumber fallback barunya).

Tooltip `getSrcTooltipLabel()` utk `id04` (special-case top-level, SEBELUM cabang
`section.id === 's_inv_freight_duty'`) ikut disesuaikan jadi **"Invoice Freight / Invoice Duty"**
(GANTI dari "Invoice Freight" statis) — konsisten dgn pola fix tooltip di atas, cegah label jadi
basi lagi krn logic src-nya sekarang bercabang.

**Mapping src/cmp mentahan (Supabase) LENGKAP section `s_inv_freight_duty`** (SUDAH REFLEK 4
revisi di atas) — `raw` = `dokumen_validasi.data_validasi_raw` (jsonb, di-parse), `docAwb` =
`dokumen_validasi.awb` (kolom biasa). Semua path di bawah adalah `raw.<key>` kecuali disebut lain:

| Baris (Validasi Field) | Kolom (Cmp) | Src (raw.*) | Cmp (raw.*) |
|---|---|---|---|
| No. AWB | Invoice Duty | `invoice_duty_v.awb` | `invoice_freight_v.awb` |
| No. AWB | CN INVOICE FREIGHT | `credit_note_freight_v.awb_no` | `docAwb` |
| No. AWB | CN INVOICE DUTY | `credit_note_duty_v.awb_no` | `docAwb` |
| No. AWB | SPPB/SPPBMCP | `invoice_freight_v.awb \|\| invoice_duty_v.awb` | `sppb_v.no_awb` |
| No. AWB | PIB | `invoice_freight_v.awb \|\| invoice_duty_v.awb` | `pib_v.no_awb` |
| No. AWB | BPN/HTBK | `bpn_v.awb` | `invoice_freight_v.awb` |
| No. AWB | AWB | `docAwb` | `docAwb` kalau `awb_detail_v` ada isi, else kosong |
| No Invoice PPJK | FP Freight | `faktur_pajak_freight.no_referensi` | `invoice_freight_v.no_invoice` |
| No Invoice PPJK | FP Duty | `faktur_pajak_duty.no_referensi` | `invoice_duty_v.no_invoice` |
| No Invoice PPJK | FP Revisi Freight | `fp_revisi_freight.no_referensi` | `invoice_freight_v.no_invoice` |
| No Invoice PPJK | FP Revisi Duty | `fp_revisi_duty.no_referensi` | `invoice_duty_v.no_invoice` |
| Subtotal/After CN | FP Freight | `invoice_freight_v.subtotal` | `faktur_pajak_freight.subtotal` |
| Subtotal/After CN | FP Duty | `invoice_duty_cost.vat_duty_basis_idr` | `faktur_pajak_duty.harga_jual` |
| Subtotal/After CN | FP Revisi Freight | hitung: `invoice_freight_v.subtotal − credit_note_freight_v.subtotal` | `fp_revisi_freight.subtotal` |
| Subtotal/After CN | FP Revisi Duty | hitung: `faktur_pajak_duty.harga_jual − credit_note_duty_v.subtotal` | `fp_revisi_duty.subtotal` |
| DPP/After CN | FP Freight | `faktur_pajak_freight.dpp` | hitung dari `faktur_pajak_freight.subtotal`+`.no_seri` |
| DPP/After CN | FP Duty | `faktur_pajak_duty.dpp` | hitung dari `faktur_pajak_duty.harga_jual`+`.no_seri` |
| DPP/After CN | FP Revisi Freight | `fp_revisi_freight.dpp` | hitung dari `fp_revisi_freight.subtotal`+`.no_seri` |
| DPP/After CN | FP Revisi Duty | `fp_revisi_duty.dpp` | hitung dari `fp_revisi_duty.subtotal`+`.no_seri` |
| PPN/After CN | FP Freight | `invoice_freight_v.ppn` | `faktur_pajak_freight.ppn` |
| PPN/After CN | FP Duty | `invoice_duty_v.ppn` | `faktur_pajak_duty.ppn` |
| PPN/After CN | FP Revisi Freight | hitung: `faktur_pajak_freight.ppn − credit_note_freight_v.ppn` | `fp_revisi_freight.ppn` |
| PPN/After CN | FP Revisi Duty | hitung: `faktur_pajak_duty.ppn − credit_note_duty_v.ppn` | `fp_revisi_duty.ppn` |
| Berat (kg) (dari Invoice Freight / Invoice Duty) | AWB | `invoice_freight_cost.actual_weight_kg` kalau ada Invoice Freight, else `invoice_duty_cost.actual_weight_kg` | `awb_detail_v.weight` kalau ada Invoice Freight, else kosong |

**Fungsi `hitungDppCmp(subtotal, no_seri)`**: dipakai di semua baris "DPP/After CN" kolom Cmp —
hitung DPP dari nilai subtotal/harga_jual dokumen tsb + nomor seri faktur pajaknya (bukan field
mentah tunggal, JANGAN dicari sbg 1 kolom `raw.*` langsung).

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
`SeaAirValidasiModal.tsx`). `pct = round(match/(match+over+under)*100)` (sejak 2026-10-05, permintaan user: baris Not validated & Incomplete TIDAK ikut penyebut; dulu `total` = SEMUA baris `checks`). Berlaku di semua pemakai `computeSeaAirCostGlobalStats` (tab Costs Invoice Recap, titik Cost kartu, badge List, modal lama).
Baris `'SURVEYOR'` DIKECUALIKAN dari hitungan. File ini BELUM diaudit menyeluruh apakah punya
pola SECTIONS/row-col-lookup lain — cek dulu sebelum translate/ubah row/col lain.
