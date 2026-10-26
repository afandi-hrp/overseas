# Cost Agent / Biaya Keagenan

<!-- Dibuat 2026-10-13 (Prompt 1 = fondasi). Sumber spek: Keagenan/PROMPT_VSCODE_cost_agent.md (versi 2) dari owner. -->

Modul audit biaya keagenan kapal: n8n (Gemini) membaca invoice keagenan (PDF/foto), menyimpan header + baris biaya,
mencocokkan voyage/port call, menghitung compare vs history biaya, simpan file ke Google Drive. Aplikasi = panel
verifikasi baris, approval berjenjang (matrix sendiri), AP Note/PV & mark paid. UI Bahasa Inggris; pesan error RPC
(Indonesia) ditampilkan apa adanya.

**Status**: Prompt 1 (fondasi) SELESAI 2026-10-13. Prompt 2 (Voyages) SELESAI 2026-10-13 -- lihat "Voyages" di bawah.
Prompt 3 (Agency Invoices) SELESAI 2026-10-13 -- lihat "Agency Invoices" di bawah.
Prompt 4 (Approval Matrix + My Approvals + panel approval) & Prompt 5 (Payment AP Note/PV + Mark paid) SELESAI 2026-10-13.
Modul lengkap (kode); BELUM dites ke DB/n8n. sql/054 = versi user dgn guard (2026-10-13), dianalisa -- lihat "Database".

## Keputusan owner (final, jangan diubah tanpa konfirmasi)

1. Approval = tabel `cost_agent_approval_matrix` (per PT / vendor / rentang nominal, step 1..n, approver = daftar email),
   BUKAN `user_approval_tiers`. Edit matrix = `canEdit('cost_agent_approval_matrix')`. Approve/reject digate
   `canEdit('cost_agent_invoice')` + RPC mengecek email approver (`auth.email()`).
2. n8n yg menulis tabel (service_role). Browser hanya baca + RPC berguard. Status job = kolom
   `cost_agent_invoices.status` (processing -> verification/failed), TANPA tabel queue; `job_id` respons webhook = invoice_id
   (versi 2: uuid di `cost_agent_invoice_documents.job_id`).
3. Skema dari owner; kapal = `cost_agent_vessels` sendiri (DWT & tipe utk fallback history), BUKAN `master_vessel`.
4. Pembayaran: tanggal + referensi bank (pola Finance Handover), TANPA upload bukti; AP Note / PV diposting via n8n.
5. UI Inggris.

## File

- SQL `sql/054_cost_agent_schema.sql`, `sql/055_cost_agent_seed_master.sql`, `sql/056_cost_agent_delete_invoice.sql` SUDAH
  DIJALANKAN 2026-10-13 & dihapus dari repo (isi: `git show a21e206:sql/<file>`). Salinan SQL di `Keagenan/` juga dihapus.
  `sql/056_cost_agent_seed_history_part01..06.sql` disebut di spek tapi **TIDAK ADA** di folder owner (belum disalin).
- `src/utils/CostAgentHelpers.ts` -- SATU sumber tipe view/RPC, `fetchCostAgentList` (`.range` + count exact + search `.or ilike`
  lewat `orSafe`), `fetchCostAgentVoyageList`/`InvoiceList`, master (`fetchCostAgentVessels/Ports/Vendors/CostItems/Companies`),
  wrapper RPC `callCostAgentRpc` (lempar `Error(message)`) + 1 fungsi per RPC, proxy `costAgentUpload` (multipart) &
  `costAgentJsonAction` (JSON), `INVOICE_STATUS_META`/`VOYAGE_STATUS_META`/`COMPARE_FLAG_META`/`TAX_STATUS_META`/
  `ACTIVITY_LABEL`/`DOC_TYPE_LABEL`, formatter id-ID (`fmtRupiah`, `fmtLiter`, `fmtNumber`, `fmtPct`, `fmtHours`) & waktu per
  zona pelabuhan (`fmtDateTimePort`, `tzAbbrev` WIB/WITA/WIT, `toPortLocalInput` -> datetime-local, `fromLocalInput` ->
  "YYYY-MM-DD HH:mm" utk RPC), `fmtDate`, `fmtReportMonth`.
- `src/utils/CostAgentVoyageImport.ts` -- disalin APA ADANYA dari owner (`groupFlatVoyageRows`, `validateCallTimes`,
  `toLocalTimestamp`, `normalizeActivity`). Logika SAMA node n8n "Map Data Sumber -> Kontrak Voyage" -- JANGAN diubah sepihak.
- `src/components/CostAgentUi.tsx` -- `StatusChip` (invoice/voyage), `CompareFlagChip`, `MatchLevelLabel`,
  `CostAgentPageHeader`, `CostAgentComingSoon`; token `SeaAirAuditUi`.
- `src/pages/cost-agent/CostAgentVoyagePage.tsx`, `CostAgentInvoicePage.tsx`, `CostAgentApprovalMatrixPage.tsx` -- placeholder.
- File bersama yg disentuh: `permissions.ts`, `MainLayout.tsx`, `App.tsx`, `server.ts`, `WebhookSettingsPage.tsx`.

## Page key & menu

| page_key | path | menu |
|---|---|---|
| `cost_agent_voyage` | `/cost-agent/voyage` | Voyages |
| `cost_agent_invoice` | `/cost-agent/invoice/:id?` (1 route, pola FAR; key `motion.div` MainLayout disamakan) | Agency Invoices |
| `cost_agent_payment` | — (fitur, `parent: 'Agency Invoices'`) | Payment / AP-PV |
| `cost_agent_approval_matrix` | `/cost-agent/approval-matrix` | Approval Matrix |

Group `'Cost Agent'` (PAGE_GROUPS & sidebar: setelah SPB, sebelum Audit Trail; ikon `Anchor`). Entri PAGE_REGISTRY di AKHIR
(halaman awal login user lama tidak berubah). page_key baru belum di-assign ke role (hanya Admin).

## Proxy n8n (`server.ts`) -- restart server setelah ubah

| X-Webhook-Type | Endpoint | Env URL default | Akses (edit) | localStorage override |
|---|---|---|---|---|
| `cost_agent` | `/api/n8n-proxy-start` (multipart) | `VITE_N8N_COST_AGENT_WEBHOOK_URL` (`/webhook/proses-dokumen-cost-agent`) | `cost_agent_invoice` | `n8n_cost_agent_webhook_url` |
| `cost_agent_voyage` | `/api/n8n-proxy-start` (multipart) | `VITE_N8N_COST_AGENT_VOYAGE_WEBHOOK_URL` (`/webhook/baca-voyage-report-cost-agent`) | `cost_agent_voyage` | `n8n_cost_agent_voyage_webhook_url` |
| `cost_agent_noon` | `/api/n8n-proxy-start` (multipart) | `VITE_N8N_COST_AGENT_NOON_WEBHOOK_URL` (`/webhook/baca-noon-report-cost-agent`; cadangan kode di `WEBHOOK_FALLBACK_URLS`) | `cost_agent_voyage` | `n8n_cost_agent_noon_webhook_url` |
| `cost_agent_voyage_pull` | `/api/n8n-proxy-json` | `VITE_N8N_COST_AGENT_VOYAGE_PULL_URL` (`/webhook/tarik-voyage-cost-agent`) | `cost_agent_voyage` | `n8n_cost_agent_voyage_pull_url` |
| `cost_agent_payment` | `/api/n8n-proxy-json` | `VITE_N8N_COST_AGENT_PAYMENT_URL` (`/webhook/posting-pembayaran-cost-agent`) | `cost_agent_payment` | `n8n_cost_agent_payment_url` |

- `cost_agent` = SATU webhook utk invoice baru DAN dokumen susulan (dibedakan `cost_agent_meta.mode`).
- Multipart tipe `cost_agent*`: field `cost_agent_meta` (string JSON objek, maks 4 KB, harus valid) DITERUSKAN; `uploaded_by`
  SELALU ditimpa email user login (klaim email JWT, dibaca setelah token lolos `get_my_access`). Field tidak dikirim -> `{}` +
  uploaded_by. Field lain tetap dibuang. Tipe lama tidak berubah.
- `/api/n8n-proxy-json`: `authorize()` sebelum body dibaca, `express.json` maks 64 KB, body wajib objek, `requested_by` = email
  user, header rahasia `N8N_WEBHOOK_SECRET`/`N8N_WEBHOOK_AUTH_HEADER` sama. Status & body respons n8n diteruskan apa adanya
  (non-JSON -> `text/plain`). Error body: 413 (>64 KB) / 400 (JSON rusak).
- URL default kini dari peta `WEBHOOK_ENV_KEYS` (tipe tak dikenal tetap jatuh ke Courier). Override `x-webhook-url` tetap
  dibatasi origin terdaftar (env Cost Agent ikut masuk daftar).
- Webhook Settings: 4 kartu baru; tombol Test kini mengirim `X-Webhook-Type` (dulu kolom kosong selalu menguji URL .env
  Courier, termasuk utk Sea & Air/FAR/Bunker).
- Smoke test 2026-10-13 (port 3999): tipe tak dikenal 400, tanpa token/token palsu 401, Courier tetap 401 tanpa token.
  Upload/aksi dgn sesi login asli BELUM dites (perlu n8n + SQL 054 jalan).

## Database (sql/054–056 SUDAH DIJALANKAN 2026-10-13; file dihapus dari repo, isi di git commit `a21e206`)

Tabel: `cost_agent_settings`, `_companies`, `_ports` (tz, is_verified), `_vessels` (dwt, vessel_type), `_vendors`,
`_cost_items`, `_cost_item_aliases`, `_voyages`, `_voyage_calls` (handling_hours/port_stay_hours generated), `_voyage_cargo`,
`_invoices`, `_invoice_lines`, `_cost_history`, `_approval_matrix`, `_approvals`, `_payment_requests`, `_tax_checks`,
`_status_log`. View `cost_agent_voyage_list_v`, `cost_agent_invoice_list_v` (security_invoker). RLS 4 policy per tabel
(`has_page_access` baca; tulis `has_edit_access` atau `false` = hanya lewat RPC).
Alur status invoice: processing -> verification -> waiting_approval -> approved -> journal -> paid; processing -> failed;
waiting_approval -> rejected (kembali bisa diedit/diajukan). Label UI di `INVOICE_STATUS_META`.

RPC app (guard `fn_cost_agent_assert_edit(page_key)`): `fn_cost_agent_save_voyage`, `_upsert_voyages` (voyage);
`_update_invoice_header`, `_add_cost_item`, `_verify_line`, `_submit_for_approval`, `_decide_approval`,
`_create_tax_check` (invoice); `_create_payment_request`, `_mark_paid` (payment). Baca: `_get_voyage`, `_get_invoice_history`,
`_matrix_for`. Khusus n8n (`fn_cost_agent_assert_service`, menolak authenticated): `_create_invoice_stub`, `_ingest_invoice`,
`_mark_invoice_failed`, `_mark_payment_posted`, `_save_tax_check`, `_mark_tax_check_failed`, `_set_invoice_files`.

**Analisa sql/054 versi user (guard, 2026-10-13)** -- `sql/054_cost_agent_schema.sql` diganti versi ini (salinan di root
dihapus: memicu crash watcher Vite EBUSY). Hasil:
- SEMUA fungsi `SECURITY DEFINER` kini ber-guard di baris pertama: app = `fn_cost_agent_assert_edit(page_key)` /
  `fn_cost_agent_assert_read(page_key)` (BARU, has_page_access, dipakai `get_invoice_history` & `get_voyage`); n8n =
  `fn_cost_agent_assert_service()`. Pengecualian: `set_status`, `refresh_compare`, `push_to_history` = internal TANPA guard
  tapi TIDAK di-grant ke authenticated (aman -- hanya dipanggil dari RPC lain).
- GRANT bagian 11: revoke semua `fn_cost_agent_*` dari public/anon/authenticated, grant service_role, lalu grant authenticated
  HANYA allowlist 12 RPC app (get/save/upsert voyage, get_invoice_history, update_invoice_header, verify_line, add_cost_item,
  submit_for_approval, decide_approval, matrix_for, create_payment_request, mark_paid). Sesuai aturan CLAUDE.md.
- `fn_cost_agent_actor` kini SELALU email JWT utk user app (p_actor diabaikan) -> actor log tidak bisa dipalsukan.
- search_path `''` (lebih ketat dari pola `public, extensions, pg_temp` CLAUDE.md) -- semua objek sudah ber-schema
  (`public.` / `auth.`), tidak ada panggilan fungsi extension tanpa schema. Guard lewat helper (bukan `IF NOT has_edit_access`
  literal) -- setara; fail-open hanya bila fungsi `has_*_access` tidak ada (production punya).
- Tabel baru `cost_agent_invoice_documents` ber-RLS (baca cost_agent_invoice, tulis hanya RPC); view list kini membawa
  `po_numbers`/`document_count`/`documents_processing`; `get_invoice_history` membawa `documents[]` -> cocok dgn frontend.
- `fn_cost_agent_matrix_for` SECURITY INVOKER (ikut RLS approval_matrix) -- simulasi butuh akses halaman Approval Matrix.
- **SISA TEMUAN (belum diperbaiki, keputusan user)**:
  1. `fn_cost_agent_mark_paid` TIDAK mengecek status invoice -> user ber-hak edit payment bisa menandai Paid invoice status apa
     pun (verification, waiting_approval, ...). Frontend hanya menampilkan tombol di status `journal`, tapi RPC tetap terbuka.
     Saran: `if v_status <> 'journal' then raise exception ...` sebelum update.
  2. `fn_cost_agent_decide_approval`: step dgn `approver_emails` KOSONG bisa di-approve siapa pun yg punya edit
     `cost_agent_invoice`. Form Approval Matrix mewajibkan >=1 email, tapi aturan lama / SQL Editor bisa kosong.
  3. Kalau 054 versi LAMA pernah dijalankan, `create or replace view cost_agent_invoice_list_v` gagal (urutan kolom berubah)
     -> `drop view` dulu. (Belum pernah dijalankan per 2026-10-13.)
- Cek bentrok nama tetap: `select proname from pg_proc where proname like 'fn_cost_agent%' or proname like 'cost_agent%';`

## Voyages (`/cost-agent/voyage`, Prompt 2, 2026-10-13)

File: `src/pages/cost-agent/CostAgentVoyagePage.tsx` (halaman), `src/components/CostAgentVoyageForm.tsx` (form create/edit),
`CostAgentVoyageDrawer.tsx` (detail), `CostAgentVoyageImportModal.tsx` (Excel), `CostAgentVoyageSourceModals.tsx` (Pull + AI),
`CostAgentVoyageMonthlyReport.tsx` (laporan bulanan + export). Template: `public/templates/template_import_voyage.xlsx`
(salinan file owner). Primitif UI baru di `CostAgentUi.tsx`: `CostAgentModal` (portal), `CostAgentCombobox`, `FieldLabel`,
`RouteBadges`.

- **List**: `cost_agent_voyage_list_v`, pagination server-side (`PaginationFooter`), filter company / vessel (terfilter company)
  / report month (default bulan berjalan, tombol × = semua bulan) / status / source + search (vessel, voy, route, charter),
  urut report_month desc. Draft = baris kuning + chip "Draft · needs review". Waktu First Arrival / Last Departure / Next ETA
  ditampilkan di zona pelabuhan (port pertama / terakhir dari `route`, next port) -- view tidak membawa tz, dicocokkan lewat
  master ports (kode). Penjaga respons lama `seqRef`.
- **Monthly Report** (toggle List | Monthly Report): wajib pilih 1 vessel + 1 bulan. Baca list (filter kapal+bulan, maks 200)
  + `fn_cost_agent_get_voyage` per voyage. Load = port call aktivitas BUKAN bongkar; Discharge = `bongkar`/`bongkar_muat`/`sts`
  (`isDischargeActivity`); 1 baris per pasangan, No Urut/No Voy/cargo rowSpan. Kolom cargo = semua produk bulan itu; baris
  TOTAL; ETA berikutnya = voyage terakhir yg punya next_eta_at. Export Excel (SheetJS, dynamic import) layout sama + merge.
- **Drawer**: header, timeline port call (jam lokal + WIB/WITA/WIT, handling/port stay dari kolom generated), invoice per port
  call (link `/cost-agent/invoice/:id`), cargo + total per unit. Tombol "Upload invoice for this port call" ->
  `/cost-agent/invoice?upload=1&call=<voyage_call_id>` (**Prompt 3 WAJIB membaca query ini** & membuka upload dgn port call
  terisi). Draft -> "Review & Confirm" membuka form.
- **Form**: payload `CostAgentVoyagePayload` -> `fn_cost_agent_save_voyage(p_voyage, 'manual', email)`. `next_port` dikirim
  KODE pelabuhan; waktu "YYYY-MM-DD HH:mm" tanpa offset; seq = urutan di form; cargo `call_seq` = urutan port call bongkar
  terpilih. Status: voyage baru tidak mengirim status (server: confirmed, AI: draft); edit mengirim status lama; tombol
  **Confirm** (hanya draft) = simpan dgn `status:'confirmed'`. `warnings[]` server ({seq, field, msg}) ditampilkan setelah
  simpan (form tetap terbuka sampai Close). Validasi live `validateCallTimes` (kuning, tidak memblok). Handling/port stay
  dihitung live. **Port call yg sudah punya invoice**: server menyimpan per seq (id lama dipertahankan bila seq sama) ->
  tombol hapus / naik / turun dinonaktifkan kalau akan mengubah posisi port call ber-invoice (`keepsInvoicedSeq`); server
  juga menolak hapus. Voyage `source='api'`: semua field read-only kecuali Remarks. Qty cargo terima "3.751.843" / "3,751,843"
  (`parseQtyInput`).
- **Import Excel**: sheet "Voyage" (fallback sheet pertama), `sheet_to_json(range 0, raw false).slice(1)` ->
  `groupFlatVoyageRows` -> report_month dinormalkan ke "YYYY-MM-01" -> preview + problems[] -> `fn_cost_agent_upsert_voyages`
  per 50 voyage (error batch dicatat per voyage, batch lain lanjut) -> saved / errors[] / warnings.
- **Pull from source system**: `costAgentJsonAction('cost_agent_voyage_pull', {date_from, date_to, vessel_name})`, tampil
  {saved, errors[]} lalu refresh. **Read report (AI)**: `costAgentUpload('cost_agent_voyage', files, {company_code, hint})`;
  respons dibaca longgar (`voyages[]`/`data.voyages[]`, `ai.cargo_total_match`=false -> peringatan "Cargo total differs from
  report"); setelah selesai list difilter status Draft + semua bulan. Kontrak respons final ada di workflow n8n.
- Hak akses: tombol Pull / Read report / Import / New voyage / Edit = `canEdit('cost_agent_voyage')`; link upload invoice =
  `canEdit('cost_agent_invoice')`. Format tanggal memakai nama bulan sendiri (`MON`) -- Intl en-GB menulis "Sept".
- **Diuji 2026-10-13**: `tsc` bersih, `vite build` sukses, parse template via helper (3 voyage, 0 problem, cargo benar),
  formatter/qty/validasi waktu dicek di Node. App jalan di dev (route, template, proxy 401 tanpa token). BELUM dites ke DB
  (sql/054 belum dijalankan) & n8n.

## Agency Invoices — update sql/071 + sql/072 (2026-10-23; SQL SUDAH dijalankan user, file lokal `071_cost_agent_amount_stamp_company.sql` & `072_cost_agent_documents_compare.sql` di root repo -- JANGAN di-commit)

HANYA halaman Agent Invoice yang diubah (Voyage & Approval Matrix, permissions.ts, MainLayout, App, server.ts TIDAK disentuh). Teks UI Inggris.
- **Rupiah bulat tanpa desimal** (071): `fmtMoney(v, _currency?)` kini MENGABAIKAN currency & selalu `formatMoney(v)` = `fmtRupiah` ("Rp 21.384.734", titik ribuan id-ID seperti seluruh aplikasi; contoh spek
  memakai koma -- sengaja mengikuti format aplikasi). Tidak ada pemilih mata uang / USD / 2 desimal. Input Amount modal "Edit line": `type=number step=1`, bagian sen dibuang saat mengetik, qty × unit price
  dipotong (`Math.trunc`); nilai dikirim apa adanya (database yang memotong).
- **Upload** (`CostAgentUploadModal`): TIDAK ada lagi Single/Batch & Company; satu request multipart (X-Webhook-Type cost_agent) `cost_agent_meta {voyage_call_id?, hint?}` berisi SEMUA file (n8n mendeteksi 1 atau banyak
  invoice, PT dari master kapal). Modal menutup begitu balasan `{job_id, invoice_id}` datang; **`useCostAgentUploadTracker`** (`CostAgentUploadResultDialog.tsx`) polling 5 dtk (maks 10 menit) ke
  `cost_agent_invoice_documents` (job_id) + status invoice (`fetchCostAgentJobSnapshot`): selesai = tak ada dokumen/invoice `processing`. 1 invoice -> toast "Invoice ready for review" + dibuka; >1 -> toast
  "N invoices detected from this upload" + dialog daftar (nomor / vendor / total / status / Open); gagal -> `error_message`. Prop `onJob` opsional: halaman Voyages (pemanggil lama, TIDAK diubah) tetap memakai `onSent`;
  prop `companies`/`defaultCompany` dipertahankan opsional & diabaikan.
- **Kotak total** (footer modal review, `AmountsBar`): Cost lines (incl. stamp duty) = `lines_total` | VAT = `ppn` | VAT not collected = `ppn_not_collected` (abu-abu, hanya > 0, tooltip "Already deducted from VAT") |
  WHT = `pph` | Grand total. Stamp BUKAN lagi kelompok pajak (baris biasa, cost item MATERAI). Pensil mengubah VAT & WHT saja (subtotal & materai dikirim apa adanya ke `fn_cost_agent_update_invoice_amounts`); Grand total =
  subtotal + VAT + materai − WHT. Penanda selisih `linesMismatch`: lines_total harus = subtotal ATAU subtotal + materai (toleransi Rp 1 per baris).
- **check_notes**: teks baru `company_unknown`, `grand_mismatch`, `susulan_mismatch`, `non_idr_currency` (peringatan biasa) di `CostAgentNotes.ts`; `note.msg` (Indonesia, server) tampil KECIL abu-abu di bawah teks Inggris
  (`noteMsg`; keputusan lama 2026-10-16 "msg tak ditampilkan" DIGANTI permintaan ini) di daftar alert header & tab Documents. `company_unknown` bisa "Fix" (Correct header): dropdown Company di-highlight kuning;
  **Submit for approval nonaktif selama company kosong** (tooltip "Choose the company first").
- **Tab Documents & Tax -- DIRINGKAS 2026-10-23** (`CostAgentInvoiceDocuments.tsx`; data/RPC TIDAK berubah: `fn_cost_agent_get_invoice_documents`, tipe `CostAgentDocCompare`/`DocCmp*` di CostAgentHelpers). Dulu 7 panel panjang sekaligus; kini PRINSIP:
  yang NORMAL (ok / match / na) diringkas jadi satu baris / hitungan, yang BERMASALAH (diff / warn / none / missing) tampil lengkap. Susunan dari atas:
  1. **Summary card** (selalu terbuka): chip overall (Not analysed abu / Incomplete biru / Attention merah / OK hijau) + SATU kalimat hasil (`resultSentence`: ok -> "All lines match the attachments and tax invoice.";
     attention -> "{n} need checking: {d} different amount, {x} not found." (d = baris diff, x = baris none; not_in_fp / pending / not_required / no_doc BUKAN masalah); incomplete -> "Waiting for tax invoice." /
     "Missing …") + "{n} red flags" + Add documents / Analyse again + baris chip kelengkapan dokumen (`CompletenessChip`: ✔ hijau [+ jumlah], ✘ merah (wajib), Pending biru, Not required abu; hover/klik = popover
     doc_no + tanggal; TIDAK ada tabel terpisah). `analysed=false` -> hanya kartu "Not analysed yet — documents of this invoice have not been read for comparison" + Analyse again (panel lain disembunyikan;
     pengecualian: bila ada `tax_checks` lama, accordion Tax totals tetap muncul tertutup supaya data lama tidak hilang).
  2. **Line comparison** (selalu terbuka, inti): tabel padat No | Invoice line (description, cost item) | Amount | Attachment | Tax invoice; sel = chip kecil + **ANGKA DARI DOKUMENNYA** (`matched_amount`; cadangan invoice − `diff`; merah bila diff) -- BUKAN selisih (membingungkan, laporan user); selisih hanya di tooltip & drawer; match_group/sum/agg tetap "Match"
     (tooltip), pending = "Waiting"; refs HANYA di drawer saat baris diklik; border kiri merah (diff) / amber (none). Toggle **"Show only items to check"** default ON bila overall='attention' (teks "{n} matching lines hidden"),
     OFF selain itu (`onlyCheck` null = otomatis). Footer "Not in invoice ({n})" (orphans) tertutup, tidak tampil bila 0. Tabel scroll internal (`max-h-[22rem]`).
  3. **Accordion "Checks"** (tertutup bawaan; header = judul + "— {n} to check" merah / "— all match|consistent" hijau): *Header checks* (header_checks attachment + tax digabung, hanya diff/warn dikelompokkan per dokumen, "{n} fields match" +
     "Show all fields"), *Dates* (hanya diff/warn: Source | Label | Date | Compared to | Gap; "{n} dates consistent" + "Show all dates"), *Tax totals* (kartu kecil per FP + HANYA checks/rate_checks diff/warn, "{n} checks passed"; pemeriksaan
     faktur pajak LAMA `tax_checks` jadi sub-bagian di dalamnya, bukan panel sendiri). Terbuka otomatis HANYA bila punya masalah DAN overall='attention'.
  4. **Accordion "Files (n)"** (tertutup, paling bawah; badge merah "{k} failed" / biru "{k} processing"; terbuka sendiri selama ada file processing -> polling 5 dtk): satu baris per file (nama link · jenis · status analisis · waktu),
     error analisis + tombol Analyse again di baris file failed, dokumen duplikat abu-abu "Duplicate of #id — not used in comparison".
  **Status baris `match_gross` (2026-10-24)**: `lines[].attachment.status` / `lines[].tax.status` bisa `'match_gross'` (nominal baris invoice = harga jual + PPN (+ materai) sebuah nota/faktur pajak, atau item-item nota beserta PPN-nya).
  Objek sisi punya field opsional `base` (harga jual sebelum PPN) & `note` (mis. "Selling price 9,730,199 + VAT 1,070,322 + stamp duty 10,000"); `parts[].stamp_duty` (nilai materai; item MATERAI di nota tetap ada).
  Tampilan: chip hijau **"Match · incl. VAT"** (`LINE_CHIP`), `note` = tooltip chip + teks kecil abu di bawah chip (`SideChip`); angka di sel = `matched_amount` (= nominal baris itu sendiri, sudah termasuk PPN; bila null
  -> nominal baris), TIDAK dijumlahkan dari refs. Drawer baris: refs ditampilkan seperti `match_sum` (doc_type · doc_no · description · amount) + satu baris ringkas `note` (+ "Before VAT: base") di atasnya.
  Dihitung COCOK: `hasIssue()` (filter "Show only items to check") & `resultSentence` hanya menghitung `diff`/`none` sebagai masalah, jadi match_gross otomatis bukan masalah. Tax totals: pemeriksaan `ok`/non-masalah dengan
  `invoice_value` null + `note` (mis. "Invoice VAT vs FP VAT (collected)" -> "VAT is included in the invoice lines (matched including VAT)") ditampilkan sbg daftar info kecil (`data-tax-info-notes`), bukan error. Kartu FP: + "Stamp duty" bila > 0.
  Perilaku TIDAK berubah: Add documents (susulan) & Analyse again (start_redo -> webhook redo_docs -> polling job -> baca ulang), invoice lama "Not analysed yet", FP belum ada -> "Waiting" + Incomplete tanpa error.
- **Kartu Agency Invoices = 3 kolom tetap** (2026-10-23, laporan user "timeline progres tidak rata"): `@4xl` (>= 896px, laptop 14" ikut) `grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_264px]` = Identitas | Garis progres | Nominal + Review (+ hapus).
  Penyebab lama: kolom kanan `auto` -> lebar mengikuti isi ("—" saat AI membaca vs "Rp 15.803.330") sehingga kolom progres tiap kartu bergeser. Nominal rata kanan `flex-1`, ruang tombol hapus dicadangkan
  (non-Admin) supaya Review lurus antar kartu; di bawah 896px ditumpuk 1 kolom (nominal kiri, tombol kanan). Padding `px-5 py-3.5`, gap-x 20px.
  **Layar lebar** (zoom out / monitor 24", laporan user "tidak simetris"): `@7xl` (>= 1280px) `grid-cols-[minmax(0,520px)_minmax(0,1fr)_264px]` -- identitas 520px tetap | progres mengisi sisanya | nominal 264px, sehingga jarak identitas->progres dan progres->nominal sama kecil
  (percobaan 1fr|520px|1fr lalu 1fr|1,7fr|1fr ditolak: nominal rata kanan meninggalkan ruang kosong besar di kiri-kanan progres di monitor 24"). Langkah TERAKHIR stepper (`Paid`) selebar isinya (`shrink-0`),
  bukan slot `flex-1` (slot kosong di kanan titik Paid ikut melebarkan jarak ke nominal).
- Whitelist gateway (`server/db/whitelist.ts`): + `fn_cost_agent_get_invoice_documents`, `fn_cost_agent_start_redo`. Opsi F (chip dokumen di list invoice) TIDAK dikerjakan (tidak memanggil RPC per baris).
- Diuji: `tsc` bersih, `vite build` sukses. BELUM dites ke n8n / data asli (RPC perbandingan tak bisa dibaca role read-only) -- bentuk JSON mengikuti spesifikasi, semua akses null-safe.

## Voyages — Noon Report (2026-10-22; sisi aplikasi. Backend SQL/n8n dari user SUDAH ada di DB production: view punya `input_source`, `fn_cost_agent_get_voyage` membawa `noon`, dicek via MCP)

Voyage punya 2 sumber terpisah: dokumen SOF/Time Sheet (Medan, AI) dan **Noon Report Excel** (Jakarta, dibaca KODE di n8n). Voyage noon selalu
`draft` + `input_source = 'noon_report'`; semua jam port call, handling/port stay & cargo = `null` (noon hanya kondisi jam 12.00; tanggal kegiatan ada di
`remarks` port call + daftar harian `noon`).
- **Upload**: tombol "Upload Noon Report" (Voyages, `canEdit('cost_agent_voyage')`) -> `CostAgentNoonUploadModal.tsx` (HANYA .xlsx/.xlsm, multi-file, maks 50 MB/file
  ditolak di dialog sebelum kirim; company opsional). `costAgentUpload('cost_agent_noon', ...)` -> proxy `cost_agent_noon` (tabel di atas; `server/routes/n8n.ts`:
  `WEBHOOK_ENV_KEYS`, `WEBHOOK_FALLBACK_URLS`, `UPLOAD_ACCESS`). Beda dgn tipe lain: gagal dari n8n `{ok:false,error}` (mis. HTTP 502) diteruskan sbg `pesan`
  apa adanya (tipe lain: 502/504 diubah jadi warning "timeout"). Klik ganda dicegah (`sendingRef`); tanpa timeout klien (fetch bawaan).
- **Hasil**: ringkasan "N port calls, N days saved, N days skipped", tabel voyage/port call, warnings (kuning, gabungan `voyages[].warnings` + `ai.warnings`),
  errors (merah), notes, "Skipped days (n)" collapsible (`ai.skipped`). `ok:true` + `saved:0` = info "No loading/discharge days found in this file" (BUKAN error).
  Teks server (Indonesia) ditampilkan apa adanya. Selesai (saved > 0): filter ke Draft + semua bulan, list di-refresh (pola Read report AI).
- **Label hasil belajar AI (2026-10-26; backend sql/078 + n8n dari user SUDAH ada)**: kata label template yang belum dikenal kode (mis. "NO. PELAYARAN") dipetakan Gemini ke nama baku, yang lolos
  pemeriksaan langsung dipakai & DISIMPAN (alias); AI juga menilai hari ambigu dan hanya memberi PERINGATAN ("Review AI (hanya peringatan) ..."). Nilai (angka/tanggal/lokasi) tetap dibaca kode, bukan AI.
  Sisi aplikasi: (1) 3 RPC baru -- `fn_cost_agent_noon_alias_list()`, `fn_cost_agent_noon_alias_set_active(p_id, p_active)`, `fn_cost_agent_noon_alias_add(p_label, p_field)` -- pembungkus
  `costAgentNoonAliasList/SetActive/Add` + tipe `CostAgentNoonAlias` di CostAgentHelpers, ditambah ke whitelist gateway; tabel `cost_agent_noon_label_alias` / `cost_agent_noon_ai_cache`
  TIDAK dibaca client. (2) Dialog hasil Upload Noon Report: respons punya `learned_labels[]` (label baru pada kiriman ini) & `ai_notes[]` (anggap [] bila tak ada) -> kotak biru "The AI learned N new
  label(s) ..." (label -> nama ramah, contoh nilai, tautan "Review learned labels" membuka dialog di bawah), `ai_notes` teks kecil abu (Indonesia, apa adanya), `ai.skipped[].ai_review` tampil di
  bawah alasan dilewati dgn ikon ⚠ (di dalam "Skipped days"), peringatan berawalan "Review AI" (`isAiReviewWarning`) pada dialog bergaya ungu + ikon Sparkles; di tabel Daily Noon Report ikon
  ⚠ (peringatan biasa) dan ikon Sparkles ungu (AI review) dipisah, tooltip tetap teks asli. Remarks port call TIDAK di-parse. (3) **`CostAgentNoonLabelsModal.tsx`** ("Noon Report labels", `z-[80]` di atas
  dialog upload; tombol di panel >= 2000px & item menu Actions, hanya `canEdit('cost_agent_voyage')`): tabel Label as written (`example_label`, cadangan `label_norm`; tooltip file contoh) | Meaning
  (`noonFieldLabel`: nama ramah utk field yg disebut spesifikasi -- Voyage number, Vessel name, Current location, Latitude/Longitude, From/To, Steaming hours, Distance run, bahan bakar HSFO/LSFO/MDO/LSMGO/HSD,
  Fresh water, Lubricating oil; field lain ditampilkan apa adanya) | Example value | Source (badge AI/Manual) | Seen | Last seen | switch Active (optimistic; gagal -> kembali + toast; mematikan butuh konfirmasi
  inline "This label will no longer be recognised. The AI will not suggest it again."). "Add label" = teks + dropdown `NOON_FIELD_OPTIONS` (nilai baku persis) -> `..._alias_add`, pesan server
  ditampilkan di form. Perubahan berlaku pada upload BERIKUTNYA. Empty state "No learned labels yet. Built-in labels are always recognised."
- **List**: kolom view `cost_agent_voyage_list_v.input_source` -> badge "Noon Report" (kartu & List); filter baru "Input" (All / Noon Report / Documents & manual =
  `input_source IS NULL`, lewat param baru `isNull` di `fetchCostAgentList`) -- terpisah dari filter "Source" (kolom `source`).
- **Drawer**: `fn_cost_agent_get_voyage` kini membawa array `noon[]` (tipe `CostAgentNoonDay`) -> section "Daily Noon Report" (Date, Doc No, Location + "STS with <partner>",
  ROB/Consumption/Received x LSFO/LSMGO/MDO/HSFO/FW, Weather, ikon ⚠ tooltip `warnings`; footer Total consumption; angka maks. 3 desimal, null = "—"; scroll horizontal).
  Voyage noon (`isNoonReportVoyage`: `input_source` atau `extra.input`) -> banner info + cargo kosong "Cargo is not available in noon reports."; `remarks` port call tampil di
  bawah nama pelabuhan (rentang tanggal, no. dokumen, kapal STS). Waktu null otomatis "—" (`fmtDateTimePort`/`fmtHours`). Confirm/Edit manual tetap seperti draft lain.
- **Kartu Voyage dipercantik (2026-10-23, permintaan user "terlalu simple")**: `CostAgentVoyageCard` 4 blok -- identitas (ubin ikon kapal, nama, PT/bulan, chip Voy #seq / charter / tipe kapal /
  Noon Report), **jalur rute bertitik** (hijau = pelabuhan pertama, biru = terakhir, putih = tengah; > 6 pelabuhan -> tengah diringkas "+n") + Arrival/Departure berwarna, status (+ titik utk Draft) +
  source + "Updated <tgl>" + panah. Blok angka (tile Cargo / Invoices / Next ETA) sempat dibuat lalu **DIHAPUS atas permintaan user** (kartu = 3 blok; cargo/invoice/next ETA ada di drawer
  & mode List). Data = baris view yang sama, container query lama (`@md`/`@5xl`) dipertahankan.
  Penyempurnaan (permintaan user): kolom `@5xl` = `1fr | 1.5fr | 1fr` (kiri-kanan sama lebar -> rute TEPAT di tengah badan kartu, lebar garis maks 560px, label "Route" di tengah; Arrival rata kiri di
  bawah titik pertama, Departure rata kanan di bawah titik terakhir); blok status = `Pill` status, chip source berikon (AI ungu/Sparkles, API biru/Cloud, Import hijau, Manual abu), jam + tanggal
  diperbarui, dan tombol panah bulat di ujung kanan.
- **Hapus voyage (2026-10-23, permintaan user; sql/073 `fn_cost_agent_delete_voyage(p_voyage_id, p_reason)` -- file lokal `sql/073_cost_agent_delete_voyage.sql`, SUDAH DIJALANKAN user
  2026-10-23, dicek via MCP: SECURITY DEFINER, authenticated boleh, anon tidak)**: sebelumnya tidak ada RPC hapus & policy DELETE tabel voyage = false. Tombol **Delete** di footer drawer
  (`data-delete-voyage`, hanya `canEdit('cost_agent_voyage')` -> prop `onDeleted`), konfirmasi `window.confirm` (sebut jumlah port call/cargo/hari noon). RPC: guard
  `fn_cost_agent_assert_edit('cost_agent_voyage')`; DITOLAK bila ada invoice terkait voyage/port call-nya (FK NO ACTION; tombol juga nonaktif bila `calls[].invoices` ada) atau status
  `closed`; port call/cargo/noon ikut terhapus (cascade); no. urut kapal+bulan dihitung ulang (`fn_cost_agent_renumber_voyages`); dicatat di `audit_trail`. Whitelist gateway
  ditambah `fn_cost_agent_delete_voyage`.
- **Modal Agency Invoices dirapikan (2026-10-23, permintaan user)**: (1) ringkasan "N/M not verified" (+ "N without cost item") PINDAH dari toolbar Cost lines ke **header**
  modal (kiri tombol alert ⚠; `data-lines-summary`); chip "12 lines" dihapus. (2) Tombol **Submit for approval** tanpa chip alert: **abu nonaktif** bila ada baris belum verified /
  tanpa cost item (alasan di tooltip), **hijau** bila siap. (3) Toggle "Show only differences / Show all compares" DIHAPUS -> selalu mode "only differences"
  (`showAllCompares = false` di `CostAgentInvoiceLines`; pembanding lain via "+n more reference"). (4) Tab Documents & Tax: bagian "PO numbers" dihapus (`po_numbers` tetap ada di
  data & kartu). Catatan lama di bagian bawah dokumen yg menyebut toggle/chip/Submit kuning = sudah tidak berlaku.
- **Kartu Agency Invoices: chip & keterangan SEJAJAR kolom** (2026-10-23, permintaan user; `CostAgentInvoiceCard`, `data-invoice-ship`): Vessel / Port / Voy (baris 1) dan
  Invoice date / Service date / jumlah dokumen (baris 2) satu grid 3 kolom (+ kolom ke-4 PO) -> teks tepat di bawah chip-nya. Teks tanggal `truncate` (kartu sempit tidak saling menimpa).
- **Panel filter Voyages tetap 1 baris** (2026-10-23, permintaan user): filter "Input"/"Source" tanpa label sampai panel >= 2000px, select Vessel/Status/Input/Source dipersempit
  (`FILTER_SELECT_VESSEL`/`FILTER_SELECT_SM`). Aksi sekunder (Pull, Read report AI, Upload Noon Report, Import Excel) = tombol terpisah hanya di panel >= 2000px; di bawahnya
  digabung jadi satu dropdown **Actions** (`FilterMenu` di `CostAgentUi.tsx`, popover `absolute` krn html ber-CSS zoom); **Refresh, Card/List dan New voyage tetap tampil**.
- Webhook Settings: kartu baru "Cost Agent — Upload Noon Report (Excel)". Env baru `VITE_N8N_COST_AGENT_NOON_WEBHOOK_URL` (repo tidak punya `.env.example`; `.env` lokal sudah
  ditambah, **production perlu env ini atau pakai cadangan kode** -- server perlu restart).
- Diuji: `tsc` bersih, `vite build` sukses. BELUM dites dgn n8n/file asli (`NOON_REPORT_OKTOBER_2026_1.xlsx`).

## Agency Invoices (`/cost-agent/invoice/:id?`, Prompt 3, 2026-10-13)

File: `src/pages/cost-agent/CostAgentInvoicePage.tsx` (daftar), `src/components/CostAgentUploadModal.tsx`,
`CostAgentInvoiceReviewModal.tsx` (review + `HeaderEditor`), `CostAgentInvoiceLines.tsx` (baris + history + `AddCostItemModal`),
`CostAgentInvoiceDocuments.tsx` (tab Documents & Tax), `CostAgentHistoryBrowser.tsx` (drawer Browse history, update 057). `CostAgentFileDrop` (CostAgentUi) = pemilih file bersama upload & susulan
(PDF/JPG/PNG, 50 MB/file, 30 file -- selaras server.ts).

- **Route**: `:id` = invoice yg dibuka di review modal (klik baris = `navigate('/cost-agent/invoice/<id>')`, tutup = kembali tanpa
  id; key `motion.div` MainLayout sudah disamakan -> halaman tidak remount). `?upload=1&call=<voyage_call_id>` (drawer Voyage)
  membuka upload dgn port call terisi lalu param dihapus.
- **Daftar**: `cost_agent_invoice_list_v`, tab All + 8 status (jumlah = head count per status, filter company/search sama),
  urut created_at desc, search invoice no/vendor/vessel/port/voy. Flags: "▲ n higher" (naik_count), "n new items" (baru_count =
  item_baru + tanpa_history), "Duplicate of #id", "Tax: …" (tax_status), "n to verify". PO chips & ikon Docs dari kolom v2
  (`po_numbers`/`document_count`/`documents_processing`) -- kosong "—" selama view belum diperbarui. Failed: error_message dibaca
  dari `cost_agent_invoices` (view tidak membawanya) + tombol **Reprocess** (`costAgentUpload('cost_agent', [], {reprocess_invoice_id})`
  -- server meneruskan multipart tanpa file). **Polling 5 dtk HANYA** selama ada baris processing / documents_processing > 0
  (refresh senyap, berhenti otomatis).
- **Upload**: mode "One invoice" (semua file = 1 invoice) | "Batch" (1 file = 1 invoice, request berurutan). Company wajib, port call
  opsional (combobox "MT. EXPO · Voy 5 · LSM (06 Sep)" dari `cost_agent_voyage_calls` + embed port/voyage/vessel, 400 terbaru;
  difilter company), hint. Meta `{company_code, voyage_call_id, hint}`.
- **Review modal** (1x `fn_cost_agent_get_invoice_history`, dimuat ulang senyap setelah tiap aksi; status processing -> muat ulang
  tiap 5 dtk): header vendor/kapal(+type, DWT)/pelabuhan/voyage + port call (tiba→berangkat zona pelabuhan), nilai mentah AI
  ditandai "(unmatched)" bila master belum cocok, nominal (subtotal, VAT, WHT, stamp duty, grand total, lines total merah bila
  beda >1 dari subtotal), `check_notes` sbg alert (label `CHECK_NOTE_LABEL`, msg Indonesia apa adanya). **Correct header**
  (status verification/rejected & canEdit): vendor/kapal/port call (difilter kapal di server, `!inner`)/pelabuhan (ikut port call)/
  company -> `fn_cost_agent_update_invoice_header`.
  Tab **Cost lines**: split view viewer file (`files[]` / `file_url`; link Drive -> `/preview` iframe, lainnya tombol Open;
  disembunyikan < lg) | tabel baris. Tab **Documents & Tax**. Tab **Timeline** (status_log).
- **Baris** (edit hanya verification/rejected & `canEdit('cost_agent_invoice')`): pilih cost item (per kategori; sejak 2026-10-15
  BISA DIKETIK utk mencari -- `CostAgentCostItemPicker.tsx`: cari code/nama/kategori/keyword alias, ↑/↓ Enter Esc, daftar portal
  `fixed` supaya tidak terpotong tabel; simpan SAMA select lama; diuji jsdom 11 cek). **Zoom 90%** (laptop 14", laporan user
  2026-10-15: daftar menutupi kotak ketik): posisi = koordinat layar / faktor zoom yang DIUKUR dari lebar daftar (`scale`), diverifikasi
  Edge headless; baris "Search: <teks>" sticky di atas daftar. Pola ini berlaku utk dropdown portal `fixed` lain di bawah zoom ->
  `verify_line(learn_alias true)`; Verified (learn alias saat dicentang); "Ref" = include_in_history (DIHAPUS 065, selalu true); Remark disimpan saat blur
  (RPC memakai coalesce(p_remark, remark): null tidak mengubah; sejak 2026-10-16 frontend mengirim '' utk MENGOSONGKAN remark). Baris tanpa cost item / item_baru: "Not in cost master yet" + **Add as new
  cost item** (code/name/category/GL/keywords -> `add_cost_item` -> `verify_line(id baru, verified)`). Field **Code** = combobox
  (2026-10-13): daftar cost item aktif (cari code/nama/kategori, maks 60) + "New code"; code yg cocok persis dgn item yg ada ->
  mode "Use existing cost item" (field lain read-only berisi data item itu, TANPA `add_cost_item`) -> `verify_line(id item lama,
  verified, learn_alias)` sehingga teks baris dipelajari sbg alias. **Verify all matching** = baris
  flag sesuai yg belum verified (berurutan). Sub-baris history (maks 2 + pembanding manual; detail tampilan lihat "Update 057"): match level, tanggal, invoice, voy, kapal (DWT), port, vendor,
  amount, Δ vs baris ini (Rp & %). Footer: jumlah & total per flag.
- **Documents & Tax**: upload susulan (semua status kecuali processing/cancelled) meta `{mode:'susulan', invoice_id, hint}`; respons
  `job_id` -> poll `cost_agent_invoice_documents` per job 5 dtk sampai tidak ada processing lalu muat ulang (tabel tidak ada ->
  berhenti, info "refresh later"). Daftar `documents[]` (doc_type, status, uploader, ringkasan AI, error), PO chips, alert
  `susulan_mismatch`, tax_checks (status, FP no/tgl, NPWP seller/buyer, DPP, VAT, tabel check_results, link dokumen via
  `documents[].tax_check_id`). **Selama sql v2 belum ada**: `documents` undefined -> info + daftar `files[]` invoice.
- **Aksi footer**: Submit for approval (verification/rejected, nonaktif + "· N not verified" bila ada baris belum verified;
  konfirmasi) -> `fn_cost_agent_submit_for_approval`. waiting_approval / approved / journal / paid = info saja (Prompt 4/5).
- **Diuji 2026-10-13**: `tsc` bersih, `vite build` sukses, modul & route tersaji di dev server. BELUM dites ke DB/n8n.

### Update 057 -- history per baris, pembanding manual, vendor baru (2026-10-13)

`sql/057_cost_agent_history_fix.sql` SUDAH DIJALANKAN (konfirmasi user; file SQL tidak ditulis dari sesi ini). Hanya halaman
Agency Invoices yg berubah (Voyages & Approval Matrix tidak disentuh; `CostAgentUi.tsx` tidak diubah).

- **Data baru**: `history[]` per baris = `description_raw` (teks BARIS saja), `invoice_description` (judul invoice lama -- dulu
  tergabung "judul | baris"), `similarity` 0..1, `match_level` + `'manual'` (pembanding pilihan user, selalu urutan pertama).
  `lines[]` + `ref_history_id` (null = otomatis) & `compare_similarity`. Invoice membawa `vendor_name_raw`/`vessel_name_raw`/
  `port_name_raw`. Tipe di `CostAgentHelpers.ts` (field baru opsional).
- **RPC baru** (wrapper di helper): `costAgentSearchHistory(filter, limit 20, offset)` -> `fn_cost_agent_search_history(p_filter,
  p_limit, p_offset)` {rows[], has_more, limit, offset}; filter `{cost_item_id, port_id, vessel_id, vendor_id, q, date_from,
  date_to, description}` -- key kosong dibuang, minimal SATU filter utama (`hasHistoryMainFilter`) atau RPC error.
  `costAgentSetLineReference(lineId, historyId|null, actor)` -> `fn_cost_agent_set_line_reference` (hanya verification/rejected,
  null = kembali otomatis, flag compare dihitung ulang server). `costAgentAddVendor({name, npwp, aliases, actor})` ->
  `fn_cost_agent_add_vendor` (nama/alias/NPWP sudah ada -> id lama). Plus `searchCostAgentVendors(term, 20)` (baca
  `cost_agent_vendors` name ilike, `%`/`_` di-escape) & `formatNpwp` (15 digit -> 00.000.000.0-000.000).
- **Sub-baris history** (`CostAgentInvoiceLines.tsx`): baris 1 = match level (`'manual'` -> "Chosen by user" + ikon pin, garis kiri
  ungu) + badge similarity + `description_raw`; baris 2 kecil abu = `invoice_description` · tgl · invoice · voy · kapal (DWT) · port ·
  vendor. Badge `SimilarityBadge` (di `CostAgentHistoryBrowser.tsx`): >= 0.8 "Same line" hijau, 0.5–0.79 "Similar" biru, < 0.5
  "Cost item only" abu (tooltip "No similar line text found; compared by cost item"); null = tidak tampil. Baris invoice: badge
  `compare_similarity` di samping chip flag compare + link **Browse history** (semua user yg bisa buka modal, baca saja) +
  **Reset to automatic** (bila `ref_history_id` terisi & editable).
- **Drawer `CostAgentHistoryBrowser.tsx`** (portal z-[80], lebar `min(1560px, 98vw)`, hanya dari modal review; tabel `w-full`, kolom Line
  menyerap sisa lebar + truncate, kolom tombol aksi `sticky right-0` -- dulu tombol "Use as comparison" terpotong di kanan): filter awal cost item baris + port/vessel/vendor
  header + description = teks baris; chips bisa dihapus, select cost item, combobox port/vessel/vendor (master dari halaman), teks
  cari `q` debounce 400 ms, date from/to. Tanpa filter utama -> tombol Search nonaktif + hint, tidak memanggil RPC. Cari otomatis
  saat filter berubah; tombol Search = cari ulang melewati cache. 20 baris/halaman, **Load more** (offset = jumlah baris) bila
  `has_more`. Cache per filter = `Map` milik modal review (`historyCache` ref, hilang saat modal ditutup). Kolom: Date, Line
  (`description_raw` + judul/invoice/voy/cost item kecil), Vessel (DWT), Port, Vendor, Amount (qty × price), Δ vs current (Rp & %),
  Match (similarity), Source (Import/App). Baris similarity >= 0.5 hijau muda; pembanding manual aktif ungu muda + label "Chosen by
  user". **Use as comparison** (prop `editable` = verification/rejected && `canEdit('cost_agent_invoice')`) -> set_line_reference
  -> drawer tutup -> modal dimuat ulang; gagal = pesan di drawer. Esc menutup drawer saja (listener capture).
- **Correct header -- vendor** (`HeaderEditor`): `VendorCombobox` cari server (debounce 250 ms, maks 20); teks tidak cocok persis
  dgn hasil -> "+ Add vendor "<teks>"" -> `AddVendorModal`: Name (default `vendor_name_raw`, fallback teks diketik), NPWP opsional
  (mask 15 digit), Aliases chips (Enter/koma, default `vendor_name_raw`). Simpan -> add_vendor -> vendor otomatis terpilih; id
  sudah ada di master halaman / hasil cari -> toast "Vendor already exists, selected". Di bawah Vendor/Vessel/Port: "As written on
  invoice: <*_name_raw>". Simpan header tetap `fn_cost_agent_update_invoice_header` (server menyimpan alias otomatis). Daftar
  vendor halaman (`vendors` prop) TIDAK dimuat ulang setelah tambah vendor -- dipakai hanya utk cek "already exists" & filter drawer.
- **Diuji 2026-10-13**: `tsc` bersih, `vite build` sukses. BELUM dites ke DB (RPC 057) dari sesi ini.

### Update 058 -- compare v2: line_match, days_diff, same_vessel, sort (2026-10-14)

`sql/058_cost_agent_compare_v2.sql` (file USER, bukan di repo) SUDAH DIJALANKAN; tanpa RPC baru. **Nomor 058 dipakai 2 file**: file repo
`sql/058_cost_agent_delete_invoice_grant.sql` (grant delete_invoice, BELUM dijalankan per 2026-10-14) berbeda isi -- SQL berikutnya 059.
- **Data**: `history[]` (get_invoice_history) & `rows[]` (search_history) + `line_match` ('same_line' | 'similar' | 'different_line' |
  'no_text', dihitung SERVER), `days_diff` (tgl history − tgl invoice), `similarity` (tooltip saja). `match_level` + `same_vessel`.
  search_history `p_filter` + `ref_date` ('YYYY-MM-DD') & `sort` ('similarity' | 'date'); respons + `sort`. Tipe di CostAgentHelpers.
- **Badge** `LineMatchBadge` (CostAgentHistoryBrowser.tsx, MENGGANTIKAN SimilarityBadge angka): same_line "Same line" hijau, similar
  "Similar line" biru, different_line "Different line" oranye (tooltip "Different service/wording than this invoice line — check
  manually"), no_text tanpa badge; persen similarity hanya di tooltip; label "Cost item only" DIHAPUS. Baris invoice: badge dari
  `history[0].line_match` (pembanding terpakai), bukan `compare_similarity`.
- **Label sumber** (`matchLevelLabel`, hanya dipakai tabel baris invoice): same_vessel_port "Same vessel & port", nearest_dwt "Same port ·
  nearest DWT (Δ x)", same_vessel "Same vessel · other port", nearest_port "Nearest port (x km)", manual "Chosen by user" + teks kecil
  `daysDiffLabel` ("12 days before" / "5 days after" / "same day") di sub-baris & kolom Date drawer.
- **Browse history**: `ref_date` = service_date invoice (fallback invoice_date); toggle **Sort: Best match | Newest** (default Best
  match), ikut kunci cache. Highlight baris = line_match same_line/similar (dulu similarity >= 0.5).
- **Correct header**: tampil juga utk status `failed` (dulu hanya verification/rejected; baris tetap verification/rejected). Combobox
  vendor + Add vendor + "As written on invoice" SUDAH ada sejak update 057 (tidak diubah).
- **Add new cost item**: helper text Keywords. Code yg SUDAH ada kini bisa menambah keyword ("Keywords to add", default teks baris; daftar
  keyword lama tampil) -> `fn_cost_agent_add_cost_item(code lama, …)` (server menambah keyword, nama/keyword lama tetap) lalu verify_line;
  dikosongkan = langsung pakai item (tanpa RPC).

- **Analisa isi 058_cost_agent_compare_v2.sql (2026-10-14, file user di root)**: kontrak data COCOK dgn frontend (history & rows: `line_match`,
  `days_diff`, `similarity`; match_level nearest_dwt = pelabuhan sama, same_vessel = pelabuhan lain; search_history `ref_date`/`sort` +
  respons `sort`; add_cost_item `on conflict (code)` hanya menggabung keyword, return id). Tabel baru `cost_agent_token_synonyms` &
  `cost_agent_token_stats` ber-RLS 4 policy (baca `has_page_access('cost_agent_invoice')`, tulis false). Fungsi baru search_path '';
  search_history/add_cost_item ber-guard. **Temuan**:
  1. **Bagian 9 GRANT (revoke massal `fn_cost_agent_*` + allowlist 15 RPC) TIDAK memuat `fn_cost_agent_delete_invoice`** -> setiap kali
     058 (atau SQL dgn pola sama) dijalankan, izin hapus invoice TERCABUT lagi (penyebab insiden "permission denied"). Grant repo
     `sql/058_cost_agent_delete_invoice_grant.sql` dijalankan user SETELAH compare_v2 (2026-10-14) -> aman sekarang. SQL berikutnya yg
     memakai pola ini WAJIB menambah `fn_cost_agent_delete_invoice` ke `app_rpc` (selama fitur hapus dipertahankan).
  2. Best match search_history hanya berlaku bila `description` (chip "Line text") terisi; tanpa itu server urut tanggal -> drawer
     menampilkan "Sorted by date — no line text" (dari respons `sort`).
  3. `fn_cost_agent_update_invoice_header` (TIDAK diubah 058) -- **diverifikasi user 2026-10-14 (pg_get_functiondef live)**: guard
     `assert_edit('cost_agent_invoice')`, status `verification/rejected/failed` diizinkan (cocok tombol Correct header UI), status invoice
     TIDAK berubah (failed tetap failed), alias vendor/kapal/pelabuhan dari `*_name_raw` dipelajari otomatis, lalu `refresh_compare` +
     status_log "Header dikoreksi". Catatan kecil: id invoice tak ada -> status NULL lolos cek (NOT IN dgn NULL), update 0 baris, insert
     status_log bisa gagal FK -- tidak terjangkau dari UI (modal hanya utk invoice yg ada).

### SQL 059 (file user, SUDAH DIJALANKAN 2026-10-14) -- pesan jelas bila invoice/baris sudah tidak ada + delete_invoice resmi

Dianalisa 2026-10-14 thd isi asli `git show a21e206:sql/054_cost_agent_schema.sql` / `056_cost_agent_delete_invoice.sql`:
- `update_invoice_header`, `verify_line`, `submit_for_approval`, `create_payment_request`: + `if not found then raise exception 'Invoice
  % tidak ditemukan'` (verify_line juga 'Baris % tidak ditemukan' + kunci invoice `for update`). Isi lain SAMA 054/057, KECUALI
  `submit_for_approval` + aturan BARU: step matrix tanpa `approver_emails` -> submit DITOLAK ("Approval Matrix untuk invoice ini punya step
  tanpa email approver…"; insert approvals ikut dibatalkan) -> menutup SISA TEMUAN #2 utk invoice yg diajukan sesudah 059.
- `delete_invoice` (return jsonb SAMA 056, + `files`): guard sama (assert_edit + Admin bila `fn_cost_agent_caller_role()` =
  authenticated -- fungsi ada di 054), + not found; invoice lain yg memakai history invoice ini sbg pembanding manual -> refresh_compare
  (verification/rejected saja); statistik kata 058 diperbarui utk jenis biaya terdampak.
- **GRANT allowlist resmi = 16 RPC (+ `fn_cost_agent_delete_invoice`)** -> izin hapus tidak tercabut lagi oleh SQL Cost Agent berikutnya
  yg memakai daftar ini. `sql/058_cost_agent_delete_invoice_grant.sql` (repo) kini hanya riwayat.
- Frontend TIDAK perlu diubah (pesan error RPC sudah tampil apa adanya di modal/toast).
- **FK `cost_agent_invoice_lines` (dicek user 2026-10-14, pg_constraint)**: `ref_history_id_fkey` = `n` (ON DELETE SET NULL) -> hapus
  invoice yg history-nya dipakai pembanding manual invoice lain AMAN (pembanding jadi otomatis lalu refresh_compare 059);
  `invoice_id_fkey` = `c` (cascade, baris ikut terhapus); `cost_item_id_fkey` = `a` (no action -- cost item yg dipakai baris tidak bisa
  dihapus; app memang tidak punya hapus cost item).
- SISA TEMUAN #1 (`mark_paid` tanpa cek status) TETAP terbuka.

### File SQL Cost Agent di repo (2026-10-14)

Semua SQL 057–061 SUDAH dijalankan (konfirmasi user 2026-10-14) & folder `sql/` DIHAPUS. Isi terakhir file yang pernah di repo:
`git show 2fc583b:sql/058_cost_agent_delete_invoice_grant.sql`, `…:sql/060_cost_agent_compare_fix.sql`, `…:sql/061_cost_agent_compare_alternative.sql`.
057, 058_cost_agent_compare_v2 & 059 tidak pernah masuk repo (isinya dianalisa di bagian masing2 di atas). SQL berikutnya: 062.

### Update 061 -- pembanding alternatif & "Check reference" (2026-10-14)

`sql/060_cost_agent_compare_fix.sql` & `sql/061_cost_agent_compare_alternative.sql` = file USER, SUDAH dijalankan (konfirmasi user);
disalin user ke ROOT repo (memicu crash watcher Vite EBUSY) -> dipindah ke `sql/` 2026-10-14. Tanpa RPC baru. **Dianalisa 2026-10-14**:
- 060: token kuantitas ("6 HARI" -> 6HARI), dokumen sama (no invoice + vendor) tidak jadi pembanding dirinya (`p_exclude_invoice_no`,
  get_line_history internal 9 param), history SEBELUM tgl invoice didahulukan, `resolve_cost_item` alias tanpa angka + keyword frasa >= 3
  kata, trigger history approved -> refresh_compare invoice lain (verification/rejected, kapal/pelabuhan & jenis biaya sama, maks 200).
- 061: kolom `compare_alt_amount numeric(18,2)`, `compare_check boolean not null default false`; get_line_history & history_row + kolom
  `pick`; alternatif = baris same_line ranking terbaik di tier <= 3 (kapal sendiri / pelabuhan sama) HANYA bila primary bukan same_line,
  menggantikan `next` (limit 2); refresh_compare: flag dari primary, `compare_check` = alternatif beda > tolerance_pct (5) dari primary;
  dgn pembanding MANUAL compare_alt_amount null & compare_check false.
- Keduanya memakai GRANT allowlist resmi 16 RPC (delete_invoice ikut) -> izin hapus tetap.
- **Penyesuaian frontend dari analisa**: get_invoice_history tetap mengirim baris otomatis `pick='primary'` walau ada pembanding manual ->
  label "Main reference" hanya tampil bila baris TIDAK punya `ref_history_id`.
- **Data**: `history[].pick` = 'primary' (pembanding utama, flag dihitung dari sini) | 'next' | 'alternative' (baris SAMA / same_line di
  kapal sendiri-pelabuhan lain atau pelabuhan sama-kapal lain; hanya bila primary bukan same_line) | 'manual'. `lines[]` +
  `compare_alt_amount`, `compare_check` (alternatif beda > 5% dari pembanding utama).
- **Sub-baris** (`CostAgentInvoiceLines`): primary = label kecil "Main reference" di depan label sumber; alternative = chip "Alternative ·
  same line" (ungu muda, tooltip "Same service found elsewhere. The flag is still based on the main reference — check which one fits."),
  garis kiri putus-putus, latar ungu sangat muda + tombol **Use as comparison** langsung (`set_line_reference(line, history)` -> modal
  dimuat ulang; hanya `editable` = verification/rejected & canEdit). Badge line_match baris invoice kini dari pembanding TERPAKAI (manual >
  primary > baris pertama utk data lama tanpa `pick`).
- **compare_check**: chip kuning "Check reference" di samping flag (tooltip "Main reference: Rp … · Same-line alternative: Rp …");
  footer "Needs check: n" = tombol filter (hanya baris compare_check / tampilkan semua); **Verify all matching mengecualikan baris
  compare_check**.
- **Sub-baris history responsif (2026-10-14, laporan user: label panjang menimpa kolom Amount)**: baris label (Main reference / Alternative,
  sumber, badge line_match, jarak hari) `flex-wrap` (turun baris), teks `description_raw` di baris sendiri (truncate), isi sel `overflow-hidden`;
  sel sticky Ref/Verified sub-baris alternative ikut latar ungu muda. Diuji render SSR komponen asli lebar tabel 900 / 1100px.
- **Poin C (ikon check di daftar invoice) DILEWATI**: view `cost_agent_invoice_list_v` tidak membawa hitungan compare_check & spek melarang
  query tambahan berat. Bisa ditambah kalau view diberi kolom (mis. `check_count`).

## Hub "Cost Agent Settings" (2026-10-26, permintaan user; SQL 079 hub dari user; halaman Approval Matrix DIUBAH, bukan halaman baru)

Route `/cost-agent/approval-matrix`, page_key `cost_agent_approval_matrix` dan posisi menu TETAP; satu-satunya perubahan menu = teks label submenu di `MainLayout.tsx` ("Approval Matrix" -> "Cost Agent Settings").
`permissions.ts` TIDAK diubah, jadi `menuLabel` di registry (dipakai matrix Manage Roles & Access) masih "Approval Matrix" -- ubah di sana bila ingin seragam (perlu izin user).
- **File**: shell `pages/cost-agent/CostAgentApprovalMatrixPage.tsx` (judul "Cost Agent Settings", tab di query string `?tab=`, tab dimuat malas `React.lazy`+`Suspense`, toast & konteks `HubCtx`)
  + folder `pages/cost-agent/settings/`: `hubApi.ts` (tipe hasil RPC, pembungkus `hubRpc` yang MEMBAWA kode error Postgres `HubRpcError.code`, `cleanFilter`), `hubUi.tsx` (drawer, ChipInput, ConfirmModal, MergeModal,
  `RecentChanges`, `StateRow`, `Pager`, `useAsync` dgn penjaga urutan, `useSelection`), tab `DashboardTab` | `HistoryTab` | `MatrixTab` | `VesselsTab` | `CostItemsTab` (+`CostItemDialogs`) | `VendorsTab` | `PortsTab` | `CompaniesTab`.
  Urutan tab: Dashboard (default), History, Approval Matrix, Vessels, Cost Items, Vendors, Ports, Companies. Tautan Dashboard "Master data health" membuka tab + preset filter lewat query (`?tab=vessels&missing=office`, `?tab=ports&verified=false`, `?tab=vendors&missing=npwp`).
- **Hak akses**: halaman terbuka bila punya akses `cost_agent_approval_matrix`; SEMUA tombol ubah (Add, Edit, Merge, Delete, Rename category, Re-classify, Move/Delete alias, Set office, Mark verified, Deactivate/Activate history)
  hanya bila `canEdit('cost_agent_approval_matrix')`; selain itu read-only (daftar, filter, Dashboard dan "Test description" tetap jalan). Server menolak tulis lewat guard RPC; pesan error RPC (Inggris) ditampilkan apa adanya
  (23505 duplikat -> inline di drawer; 23503 "already used" -> toast merah). Semua tulis lewat RPC (kecuali aturan Approval Matrix yang sejak dulu ditulis langsung ke tabel).
- **RPC** (semua di whitelist gateway `server/db/whitelist.ts`): `fn_cost_agent_dashboard`, `browse_history`, `set_history_active`, `list/save/merge/delete_vessel(s)` + `set_vessels_office`, `list/save/merge/delete_vendor(s)`,
  `list/save/merge/delete_port(s)` + `set_ports_verified`, `list_companies`/`save_company`, `list_cost_items`/`save_cost_item`/`rename_category`/`test_classify`/`list_aliases`/`update_alias`/`delete_alias`/`reclassify_open_lines`,
  `list_master_log`, `matrix_for(p_company, p_vendor_id, p_amount, p_office)`. Payload simpan memakai kunci `is_active` (BUKAN `active`), port `lat`/`lon`/`tz`/`is_verified`, kapal `vessel_type`/`short_code`/`office`;
  filter list memakai `active` (boolean), `missing`, `verified`, `office` (MEDAN|JAKARTA|NONE), `company_code`. Daftar 50 baris/halaman (`limit`/`offset`), kecuali Cost Items (dimuat sekali limit 500, dipecah di klien).
- **Tidak ada cache klien** yang perlu di-invalidasi: halaman lain (Voyage/Invoice) membaca master saat dibuka; tab hub memuat ulang daftar + master combobox setelah simpan/gabung/hapus.
- **Office (sql/079)**: kapal punya `office` (MEDAN | JAKARTA; kosong = belum diisi, label UI "Owner office"), aturan Approval Matrix punya `office` (kosong = semua office). Aturan dihitung SERVER (jangan diimplementasi ulang di klien):
  aturan ber-office hanya utk invoice kapal ber-office itu; per step aturan paling spesifik menang vendor > office > PT > umum; bila ada aturan khusus office aktif dan kapal invoice belum punya office, pengajuan approval DITOLAK
  ("The office (Medan / Jakarta) of this vessel is not set. Set it in Cost Agent > Vessels, then submit again."). Tab Approval Matrix = isi halaman lama + kolom/field Office (badge, ladder per (PT, Office), Simulate dgn Office,
  peringatan celah nominal per (PT, Office) -- aturan tanpa office ikut menutup semua office; `matrixCoverageGaps(rules, company, office?)` & `costAgentMatrixFor(..., office)` di CostAgentHelpers, param opsional). Tab Vessels: badge Medan / Jakarta / "Not set" (amber),
  chip "Suggested: <office>" dari `office_hint` (Noon Report = Jakarta, SOF / Time Sheet = Medan; klik = isi), aksi massal "Set owner office" & "Apply suggestions on this page" (satu panggilan per office, ringkasan dulu), badge "No DWT".
- **Pola tab daftar**: toolbar (cari debounce 300 ms + filter + Add), loading `LoadingTableRow`, error + Retry, empty state, hapus hanya aktif bila semua hitungan "Used by" = 0 (tooltip "In use — deactivate or merge it"), merge dgn pilih tujuan + centang "I understand"
  (toast "{n} records moved, {m} open invoices compared again"), accordion tertutup "Recent changes" (`fn_cost_agent_list_master_log`, 20 baris; Cost Items menggabung entitas cost_item + category + alias; entitas lain vessel/vendor/port/company/history).
- **Dashboard** read-only (`fn_cost_agent_dashboard`): Needs attention (10 kartu; Agency Invoices belum punya filter status via URL -> hanya angka, satu-satunya tautan "Vessel office not set" -> Vessels ?missing=office), Pipeline 9 status, Monthly trend (batang CSS bertumpuk
  Medan/Jakarta/Not set, toggle Amount|Invoices -- belum ada library chart), Cost vs history (bar proporsi + 10 baris `top_naik`), Top 8 (cost item / vendor / kapal), Waiting for approval (badge merah > 3 hari), Failed processing, Master data health. Baris invoice menaut ke `/cost-agent/invoice/:id`.
- **UPDATE 2026-10-26 (migrasi 076/077 user SUDAH DIJALANKAN, dicek MCP read-only)**: semua RPC di bawah kini ada, signature cocok dgn pembungkus di `hubApi.ts`, grant `authenticated` OK, semua fungsi yg dipanggilnya ada
  (`log_master`, `vessel_refs`, `resolve_cost_item`, dst), tabel `cost_agent_master_log` ada. Bentuk hasil DIVERIFIKASI dari `pg_get_functiondef`: `list_cost_items` = `{categories[{category,count}], rows[]}` (baris + `is_system` utk MATERAI/AGENCY_FEE/LAIN_LAIN,
  `lines_count`, `open_lines`, `history_count`, `alias_count`; TANPA `total`, param limit/offset diabaikan -> paging di klien); `save_cost_item` = `{item, warnings[{keyword,other_code,other_keyword,kind same|overlap}]}`, kode hanya saat Add, prioritas bawaan server 500 (UI ikut 500),
  keyword dinormalkan server; `test_classify` = `{normalized, result{cost_item_id,method,code,name,category}|null, candidates[{code,name,priority,matched_keywords}]}`; `list_aliases` = `{total, rows[{id,alias_norm,vendor_id,vendor_name,cost_item_id,code,name,created_by,created_at}]}`;
  `reclassify_open_lines` = `{applied,checked,changed,invoices,has_more,last_line_id,changes[{invoice_id,invoice_no,line_no,description,from,to,method}]}` (`invoices` = 0 saat pratinjau); `list_master_log` = array `{id,entity,entity_id,action,summary,actor,created_at}`
  (entitas: vessel, vendor, port, company, history, cost_item, category, alias; aksi tambahan `rename`, `reclassify`). Catatan di bawah ini = KONDISI SEBELUM migrasi itu (arsip).
- **KONDISI DB PRODUCTION (dicek MCP read-only 2026-10-26, SEBELUM migrasi 076/077 dijalankan -- sudah tidak berlaku)**: RPC hub dari SQL 079 SUDAH ada (dashboard, history, vessels/vendors/ports/companies, matrix_for 4-arg), TAPI **BELUM ada**: `fn_cost_agent_log_master`, tabel `cost_agent_master_log`,
  `fn_cost_agent_list_master_log`, `fn_cost_agent_delete_vessel`, semua RPC Cost Items (`list_cost_items`, `save_cost_item`, `rename_category`, `test_classify`, `list_aliases`, `update_alias`, `delete_alias`, `reclassify_open_lines`), dan kolom `is_system`/`priority` jenis biaya
  mungkin berbeda. Akibatnya SEBELUM migrasi 076/077 (Cost Items + master log) dijalankan: tab Cost Items tampil error RPC, "Recent changes" error, dan semua TULIS master (save/merge/delete/set_*) gagal karena memanggil `fn_cost_agent_log_master`; baca/Dashboard/History/Office berfungsi.
  Bentuk hasil RPC Cost Items / aliases / reclassify / master log dibaca TOLERAN (nama field ditebak dari spesifikasi) -- verifikasi setelah SQL-nya ada. Nomor SQL: file root `079_cost_agent_hub_office_dashboard.sql` (user) BENTROK dgn `sql/079_rls_select_initplan_compare_doc.sql` (RLS); isi beda, tidak saling menimpa.

## Approval (Prompt 4, 2026-10-13)

- **Approval Matrix** (`src/pages/cost-agent/CostAgentApprovalMatrixPage.tsx`): CRUD langsung `cost_agent_approval_matrix`
  (`fetchCostAgentApprovalMatrix` / `saveCostAgentMatrixRule` / `deleteCostAgentMatrixRule`), edit = `canEdit('cost_agent_approval_matrix')`.
  Tabel aturan (Rule name, Company/Vendor kosong = all, Min, Max kosong = no limit, Step, Approver label, emails chip, Role,
  Active) + Edit / Duplicate / Delete; Ladder per (PT, vendor, rentang) "WNS • 0 – 50M : Step 1 … → Step 2 …"
  (`fmtShortAmount`); filter company + Show inactive. Form `RuleModal`: max >= min, step 1..10, >=1 email valid (Enter/koma
  untuk menambah, autocomplete dari `profiles.email/nama` -- RLS bisa membatasi, gagal = tanpa saran). **Simulate** =
  `fn_cost_agent_matrix_for(company, vendor, amount)`. **Peringatan celah** `matrixCoverageGaps` per PT: aturan aktif umum
  (vendor kosong, company = PT atau semua) diurutkan, celah dihitung rupiah bulat (min > max sebelumnya + 1); aturan per vendor
  TIDAK dihitung menutup.
- **My Approvals** (tab di Agency Invoices + badge ungu sidebar submenu Agency Invoices, MainLayout): `fetchMyApprovalInvoiceIds`
  = approvals pending yg `approver_emails` overlap email user (asli + lowercase) -> semua approvals invoice itu -> invoice
  `waiting_approval` yg step AKTIF (`activeApprovalStep`: round terakhir, step pending terendah = urutan decide_approval)
  memuat email user. Event `COST_AGENT_APPROVALS_CHANGED_EVENT` (submit / keputusan) menyegarkan badge & daftar.
- **Panel approval** (`CostAgentApprovalPanel.tsx`, tab "Approval" review; tab awal otomatis saat waiting_approval):
  ringkasan baris higher / new + total selisih vs `compare_ref_amount`; ladder per round (terbaru di atas, round lama pudar):
  keputusan, oleh, kapan, catatan. Approve / Reject (catatan WAJIB saat reject, konfirmasi) HANYA bila email user di step
  aktif && `canEdit('cost_agent_invoice')` (server cek ulang). Approve terakhir -> toast "n lines saved as cost reference"
  (`history_rows`). Footer review: "Review & decide" utk approver.

## Payment (Prompt 5, 2026-10-13)

- **`CostAgentPaymentModal.tsx`** (fitur `cost_agent_payment`): dari review (status approved, belum ada payment aktif) atau
  multi-select tab Approved (checkbox, "Create AP Note / PV (n)") -> antrean 1 invoice per form ("Next invoice"/"Skip").
  Isi: AP Note | PV, ringkasan invoice, WHT (default `pph`), amount to pay (default grand_total; berubah -> alasan >=5 karakter,
  ditempel ke description "(Amount adjusted: …)" + `amount_reason` di p_data), due date (wajib), bank (wajib utk PV; saran
  rekening terakhir per vendor dari localStorage `cost_agent_vendor_bank`), description default "Agency cost {vessel} voy
  {voyage} at {port} - {invoice no}". **Jurnal** editable: debit per baris invoice (gl_account baris) + stamp duty (bila
  materai > 0 & tidak ada baris cost item MATERAI) + VAT in (ppn); kredit WHT payable + AP vendor (= amount). Jurnal ikut
  amount/WHT selama belum diedit manual; tombol Reset. Validasi: GL terisi semua, debit = kredit. Tax invoice terakhir bukan
  `match` -> peringatan + centang "Continue anyway".
- **Akun GL** `COST_AGENT_GL_DEFAULTS`: AP vendor / VAT in / WHT payable SENGAJA KOSONG (wajib dari Finance), stamp duty
  61030 (GL cost item MATERAI seed 055). Bisa diisi TANPA ubah kode lewat `cost_agent_settings` key `gl_ap_vendor`,
  `gl_vat_in`, `gl_wht_payable`, `gl_stamp_duty` (value jsonb string, mis. `'"21010"'`) -- `fetchCostAgentGlAccounts`.
- **Send to Finance**: `fn_cost_agent_create_payment_request` -> request_id (status submitted) lalu
  `costAgentJsonAction('cost_agent_payment', {request_id})`. Langkah 2 gagal -> request tetap ada, pesan ke user, kirim ulang
  lewat tab Payments. n8n menandai hasil via `fn_cost_agent_mark_payment_posted` (sukses -> invoice `journal` + doc_no).
- **Tab Payments** (`CostAgentPaymentsPanel.tsx`): daftar payments (tipe, doc no / Request #id, status `PAYMENT_STATUS_META`,
  nominal, WHT, bank, waktu, respons JSON bila failed) + **Resend** (status failed / submitted, canEdit payment). **Mark as
  paid** (status journal & canEdit payment): tanggal bayar (default hari ini, maks hari ini) + referensi bank (wajib) ->
  `fn_cost_agent_mark_paid`. Tanpa upload bukti.
- **Diuji 2026-10-13**: `tsc` bersih, `vite build` sukses, unit helper (celah matrix 5 kasus, step aktif/approver, format
  ringkas) lulus, modul tersaji di dev server. BELUM dites ke DB/n8n.

## Tata letak laptop 14" (2026-10-13, laporan user "berantakan")

- **Panel filter = 1 baris** di ketiga halaman: komponen bersama `FilterPanel` / `FilterSearch` / `FilterField` / `FilterSegment` /
  `FilterButton` + kelas `FILTER_SELECT` / `FILTER_SELECT_WIDE` (`CostAgentUi.tsx`), pola SAMA panel Invoice Recap Sea & Air:
  `@container`, baris dalam `flex-wrap @min-[1150px]:flex-nowrap`, Search menyusut (min 120px), label kecil field tampil mulai
  panel 1450px, tombol sekunder (Refresh / Pull / Read report / Import) ikon saja di bawah 1650px, tombol utama teks pendek
  ("New", "Upload", "Add", "AP/PV") di bawah 1450px. **Voyages (panel terpadat)**: `FilterField labelFrom={1750}` & tombol
  sekunder `labelFrom={2000}` -- dulu label tombol muncul mulai 1650px sehingga di monitor 24" (panel ~1760px) isi melebihi
  panel & "New voyage" TERPOTONG (laporan user 2026-10-13). Diukur headless Chrome (scrollWidth/tinggi baris) 17 lebar
  1150–2100px × 3 panel, zoom 90% & 100%: semua 1 baris tanpa overflow (kecuali panel < 1150px = wrap 2 baris, disengaja).
  **Menambah kontrol ke panel = ukur ulang di rentang ini** (label yg muncul di lebar besar bisa membuat isi melebihi panel).
- **Tombol aksi halaman DIPINDAH dari header ke ujung kanan panel filter** (New voyage, Pull, Read report, Import Excel;
  Upload invoice, Create AP/PV; Add rule). Header = judul + Greeting saja (prop `right` CostAgentPageHeader tidak dipakai).
- **Agency Invoices**: 10 tab status diganti select **Status** ber-jumlah ("Verification (3)", termasuk "My Approvals (n)") +
  tombol toggle **My Approvals** (badge jumlah) -- 10 tab tidak muat 1 baris.
- **Voyages tabel**: rute badge 1 baris (`RouteBadges` nowrap), tanggal ringkas `fmtDateTimeCompact` ("20 Sep 20:00" + zona
  kecil; lengkap di tooltip), Seq digabung ke kolom Voy ("7 #3"), Source digabung di bawah chip Status, Draft = chip "Draft"
  (tooltip "needs review") + baris kuning. Muat tanpa scroll horizontal di panel 1300px.
- **Approval Matrix**: kolom Simulate di kanan mulai lebar area 1100px (container query, dulu `xl:`); peringatan celah nominal
  ringkas (PT dgn celah sama digabung 1 baris; tanpa aturan aktif = 1 baris "No active rule yet").

## Tampilan Card -- Voyages & Agency Invoices (2026-10-14, keputusan user)

- **Card = default, List tetap ada** (toggle `FilterSegment`): Voyages **Card | List | Monthly Report**, Agency Invoices **Card | List**.
  TANPA KPI (keputusan user). Kartu = `src/components/CostAgentCards.tsx` (`CostAgentVoyageCard`, `CostAgentInvoiceCard`,
  `CostAgentCardScroller`) -- pola SAMA kartu Courier/Sea & Air (token SeaAirAuditUi, garis warna status kiri `border-l-4`, container
  query `@xl`/`@5xl` memadatkan kartu saat berbagi lebar). Data = query daftar yang SAMA mode List (tanpa query tambahan), pagination
  `PaginationFooter` tetap.
- **Voyages**: kartu = PT · bulan, kapal, Voy #seq · charter · tipe | rute + Arrival/Departure (zona pelabuhan) | cargo, jumlah invoice,
  Next ETA | status + source; Draft = latar kuning muda. Klik kartu -> **panel detail samping** = `CostAgentVoyageDrawer` prop `embedded`
  (isi sama drawer, tanpa overlay/portal; pola panel Invoice Recap Courier: daftar `lg:w-[35%]` min 380 / maks 720px, panel kanan,
  layar < lg ditumpuk; key per voyage). Ganti tampilan menutup panel (`changeView`); List & Monthly Report tetap drawer overlay.
- **Agency Invoices**: kartu = PT · tgl invoice, vendor, invoice no | vessel · Voy, port, docs + PO chip | flags (higher/new/duplicate/
  tax/to verify) + jumlah baris + error & Reprocess (failed) | Grand total + status + hapus (Admin). Tab Approved & hak payment: checkbox
  per kartu + "Select all on this page". Klik kartu tetap membuka **modal review besar** (keputusan user).
- **Bug kartu tergencet (laporan user 2026-10-14)**: kartu di kolom flex yg di-scroll ikut MENYUSUT (flex-shrink default) saat daftar lebih
  tinggi dari layar -> isi terpotong `overflow-hidden`. Fix: `shrink-0` di kelas kartu (`cardCls`). Kartu 2 kolom mulai lebar kartu 448px
  (`@md`, pola kartu Courier), 4 kolom mulai 1024px (`@5xl`). **Diukur** (komponen ASLI dirender Vite SSR + CSS build, headless Chrome,
  lebar daftar 380–1700px, data panjang: vendor 40+ huruf, 3 PO, 5 chip, error failed): 0 elemen terpotong/meluber di semua lebar; tinggi
  kartu invoice 93px (1450px) / 114px (1280px, laptop 14") / 190px (520px); voyage 108px (>=1150px) / 180px (520–1024px); 380–450px = 1
  kolom (2 kolom di lebar itu memotong rute & vendor).
- **Port call 3 kolom di panel/drawer detail voyage (2026-10-16, permintaan user: ruang kanan kosong)** -- `CostAgentVoyageDrawer.tsx`: tiap port
  call (di bawah judul #seq port + aktivitas) = grid container query `@min-[720px]:grid-cols-[auto_minmax(0,1fr)_auto]` (body panel `@container`):
  kolom 1 jam Arrival…Departure + Handling/Port stay; kolom 2 **Matched invoices (n)** = kartu per invoice (status + grand total, no invoice,
  vendor; link `/cost-agent/invoice/:id`) atau "No invoice matched to this port call yet."; kolom 3 tombol **Upload invoice** (`SA_BTN_PRIMARY`,
  dulu link teks "Upload invoice for this port call") di TENGAH kolom (vertikal & horizontal, kolom min 180px); pemisah `border-l`. Panel < 720px:
  bertumpuk (tombol rata kiri). Diuji (RPC di-mock) headless Chrome 1150 &
  640px.
- **Upload invoice per port call LANGSUNG dari Voyages (2026-10-14, permintaan user)**: tombol "Upload invoice for this port call" di
  panel/drawer membuka `CostAgentUploadModal` di halaman Voyages (prop `onUploadInvoice` drawer; port call terisi, company = company
  voyage, fallback filter Company halaman). Form, proxy n8n (`cost_agent`) & meta SAMA halaman Agency Invoices; selesai -> toast + daftar &
  panel dibaca ulang. Dulu pindah ke `/cost-agent/invoice?upload=1&call=` -- query itu TETAP didukung halaman Invoice (drawer tanpa prop
  `onUploadInvoice` = link lama).
- **Lebar panel filter diukur** (headless Chrome + CSS hasil build, markup panel sama, 1150–2100px): Agency Invoices (kasus terpadat tab
  Approved + AI processing) 1 baris di semua lebar; Voyages 1 baris mulai 1200px, 1150px wrap 2 baris (tanpa terpotong, disengaja).

## Hapus invoice -- masa uji coba (2026-10-13, permintaan user; `sql/056` SUDAH DIJALANKAN 2026-10-13, konfirmasi user)

- RLS `cost_agent_invoices` menolak DELETE dari app -> RPC baru `fn_cost_agent_delete_invoice(p_invoice_id, p_reason)`
  (`sql/056_cost_agent_delete_invoice.sql`, SECURITY DEFINER, search_path '', guard `fn_cost_agent_assert_edit('cost_agent_invoice')`
  + **Admin saja** (`is_admin()`; n8n/SQL Editor lolos), pre-check nama fungsi (komentar `beehive:056`), revoke public/anon lalu
  grant authenticated + service_role). Ditolak bila status `journal`/`paid` atau ada payment request submitted/posted/paid.
  Anak invoice ikut terhapus (FK cascade: lines, approvals, payment_requests, tax_checks, invoice_documents, status_log);
  `cost_agent_cost_history` source='app' dari invoice ini DIHAPUS (data uji coba tidak jadi acuan compare); `duplicate_of` yg
  menunjuk invoice ini dikosongkan; dicatat ke `audit_trail` format "Invoice Cost Agent — Lama: #id (status) → Baru: dihapus".
  File Google Drive TIDAK dihapus. Alias cost item hasil belajar TETAP.
- UI: ikon tempat sampah di kolom Status daftar + tombol **Delete** di header review -- hanya `isAdmin && canEdit('cost_agent_invoice')`
  & status bukan journal/paid (`canDeleteInvoice`); review tertutup bila invoice yg dibuka dihapus. Konfirmasi = **modal**
  (`CostAgentModal` z-[85] di `CostAgentInvoicePage.tsx`, 2026-10-14; dulu `window.confirm`): peringatan, Reason opsional (kosong =
  "Hapus data uji coba" -> p_reason), tombol merah "Delete invoice"; error RPC tampil di modal (modal tetap terbuka).
- **Insiden 2026-10-14**: "permission denied for function fn_cost_agent_delete_invoice" -- grant EXECUTE authenticated dari 056
  tercabut (dugaan: blok revoke massal `fn_cost_agent_*` + grant allowlist yg dijalankan ulang di 057 tanpa delete_invoice).
  Perbaikan `sql/058_cost_agent_delete_invoice_grant.sql` (pre-check fungsi, revoke public/anon, grant authenticated+service_role,
  query cek). **BELUM DIJALANKAN** per 2026-10-14. SQL berikutnya yg memakai pola revoke massal + allowlist WAJIB memasukkan
  `fn_cost_agent_delete_invoice(bigint, text)` selama fitur hapus masih dipertahankan (keputusan tertunda di bawah).
- **KEPUTUSAN TERTUNDA (user, 2026-10-13)**: nasib fitur hapus setelah masa uji coba (cabut grant RPC / hapus tombol /
  pertahankan) akan ditentukan user -- JANGAN diubah sebelum ada keputusan (juga dicatat di CLAUDE.md bagian SQL).

## Review invoice di laptop 14" (2026-10-13, laporan user)

- Header modal = strip info 1 baris (`flex-wrap`, item `whitespace-nowrap`, label kecil di atas nilai, Grand total di kanan);
  dulu grid breakpoint layar `md:/xl:` -> 3 baris & ±separuh tinggi modal. check_notes = chip kecil sebaris. Tab & footer dirapatkan.
- Viewer file 36% (min 280, maks 640); tombol Hide/Show file dipindah ke toolbar tabel baris (prop `toolbarLeft`
  CostAgentInvoiceLines) -- hemat 1 baris.
- Tabel baris 8 kolom: Qty × Price dipindah ke bawah Amount; min-width kolom diturunkan; sub-baris history 1 baris
  (`max-w-0` + truncate, detail di tooltip). Diukur headless Chrome: tabel di ruang 960–1150px overflow-x = 0.
- **2026-10-14 (laporan user, setelah update 057 menambah badge similarity + Browse history)**: kolom **Ref & Verified `sticky right`**
  (Verified `right-0` 64px, Ref `right-[64px]` 48px, latar = latar baris `rowBg`; sub-baris history punya 2 sel sticky kosong) -> selalu
  terlihat di laptop 14" walau tabel melebar; kolom Compare kini boleh pindah baris (dulu `whitespace-nowrap`). **Remark** = textarea yg
  tingginya ikut panjang teks (maks 6 baris, bisa ditarik), tampilan baca saja `whitespace-pre-wrap`. **Add new cost item**: body
  `min-h-[460px]`, daftar Code langsung terbuka saat modal tampil (`codeOpen` awal true), dropdown `max-h-72`.
- **Viewer file TIDAK membuka tab baru (2026-10-14, permintaan user)**: link "Open" (`target=_blank`) diganti tombol **Full screen** =
  overlay di halaman yang sama (`fullView`, portal z-[85], pilihan file, X / Esc menutup overlay saja). Iframe Drive `/preview` diberi
  `sandbox="allow-scripts allow-same-origin allow-forms"` (TANPA allow-popups) + tombol kita (48px, kanan atas) MENUTUPI ikon pop-out
  Drive (Full screen / Exit full screen) -- `FilePreviewFrame`. File non-Drive tidak di-sandbox (viewer PDF Chrome menolak iframe
  ber-sandbox) & tampil langsung di overlay.

## Agent Invoice -- Description invoice, vessel_fuzzy, label match method (2026-10-15; sql/063 & sql/064 SUDAH DIJALANKAN, konfirmasi user)

HANYA halaman Agent Invoice (Voyage / Approval Matrix / routing / permissions TIDAK berubah). File: `CostAgentHelpers.ts`,
`CostAgentInvoiceReviewModal.tsx`, `CostAgentInvoiceLines.tsx`, `CostAgentInvoicePage.tsx`, `CostAgentCards.tsx` (hanya `CostAgentInvoiceCard`).
- **Data (sql/064)**: `cost_agent_invoices.description` (keterangan, mis. "BY. AGEN DLL DI BJM - MV. CEMTRANS VOY 12", otomatis dari template
  `cost_agent_settings.invoice_description_template[_<PT>]` lewat trigger selama `description_auto`) + `description_auto` (true = otomatis).
  Ikut ke history (`invoice_description`) saat approve = judul di history/Browse history. RPC `fn_cost_agent_set_invoice_description(p_invoice_id,
  p_description, p_actor) -> text` (huruf besar, maks 300, '' = kembali otomatis; hanya verification/rejected/failed + `cost_agent_invoice` edit;
  dicatat di status_log). Wrapper `costAgentSetInvoiceDescription`, konstanta `COST_AGENT_DESCRIPTION_MAX`. Tipe `CostAgentInvoice.description/
  description_auto`, `CostAgentInvoiceListRow.description` (opsional).
- **A. Header modal review** (`InvoiceDescription`, lebar penuh di bawah strip Vessel/Port/Voyage/nominal): teks + badge **Auto**/**Edited**; pensil
  -> input (maks 300, penghitung, Enter = Save, Esc = Cancel tanpa menutup modal) + Save / Cancel -> RPC lalu reload; **Reset to auto** hanya bila
  Edited (RPC dgn ''). Hak = `headerEditable` (canEdit + verification/rejected/failed), selain itu baca saja. Helper text sesuai spek.
- **B. check_notes `vessel_fuzzy`** (sql/063, nama kapal dikenali dari salah ketik 1 huruf): label "Vessel name recognised from a typo" di
  `CHECK_NOTE_LABEL`, alert kuning sama note lain + tombol **Correct header** (membuka HeaderEditor) bila header boleh dikoreksi.
- **C. Match method** (`MATCH_METHOD_LABEL`): baris dgn cost item & `match_method` keyword_synonym / history / alias_pattern -> teks kecil abu di
  bawah Cost item ("Keyword (typo/synonym)" / "Similar past line" / "Learned alias", tooltip "Matched by: …"). Metode lain tanpa label.
- **D. Daftar**: description = teks kecil abu di bawah Invoice No (List & Card), truncate 1 baris, tooltip penuh. View `cost_agent_invoice_list_v`
  BELUM memuat kolom ini (064 tidak mengubah view) -> `fetchCostAgentInvoiceList` membaca `id, description` dari `cost_agent_invoices` utk id
  halaman itu (1 query; error -> tanpa keterangan, console.warn). Kalau view kelak ditambah kolom `description`, query tambahan otomatis dilewati.
- **Diuji 2026-10-15**: jsdom modal review 15 cek (tampil + badge Auto, helper text, note vessel_fuzzy + Correct header, label match method,
  Edit -> RPC -> Edited, Reset to auto -> '' -> Auto, baca saja saat approved). `tsc` (lint) bersih. Belum dites di browser / production.

## Agent Invoice -- update 065: compare kiri–kanan, edit baris, wajib cost item (2026-10-16; sql/065 SUDAH DIJALANKAN, konfirmasi user)

HANYA halaman Agent Invoice (Voyage / Approval Matrix / routing / permissions / MainLayout / server.ts TIDAK berubah; SQL tidak ditulis
dari sesi ini -- file `065_cost_agent_app_feedback.sql` milik user di root repo). File: `CostAgentHelpers.ts`, `CostAgentInvoiceLines.tsx`,
`CostAgentInvoiceReviewModal.tsx`.
- **Data/RPC (065)**: `fn_cost_agent_update_line(p_line_id, p_description, p_qty, p_unit_price, p_amount, p_actor) -> {changed, changes[]}`
  (verification/rejected + edit `cost_agent_invoice`; baris jadi BELUM verified, cost item dikenali ulang bila teks berubah & match_method
  bukan manual, lines_total + compare dihitung ulang, status_log "Baris #n diedit manual: …"). Wrapper `costAgentUpdateLine`,
  `COST_AGENT_LINE_DESCRIPTION_MAX` (500), tipe `CostAgentUpdateLineResult`. `submit_for_approval` MENOLAK baris `cost_item_id` null.
  `include_in_history` selalu true. check_notes hilang sendiri setelah header dikoreksi / voyage tertaut (cukup reload). Allowlist GRANT = 18 RPC.
- **A. "Use as reference" DIHAPUS**: kolom/checkbox Ref hilang; `costAgentVerifyLine` tidak punya param `includeInHistory` lagi, SELALU
  mengirim `p_include_in_history: true`.
- **B. Baris tanpa cost item**: chip merah "Not mapped"; tombol Verify disable (tooltip "Choose a cost item first (or LAIN_LAIN)"; unverify
  tetap bisa); Verify all matching melewatinya (sudah sejak awal: syarat `cost_item_id`); toolbar "n without cost item"; footer modal
  Submit disable + "· n line(s) without cost item" (prioritas di atas "· n not verified").
- **C. Edit baris** (`EditLineModal`, tombol "Edit" ber-ikon pensil, hanya `editable`): Description (wajib, maks 500, penghitung), Qty & Unit
  price opsional, Amount wajib -- otomatis qty × unit price (dibulatkan 2 desimal) setiap qty/price diubah & keduanya valid, tetap bisa
  diketik. Angka diterima "1.250.000" / "1,5" / "2.5" (`parseAmountInput`: separator terakhir = desimal bila ada titik & koma; 1 titik saja =
  desimal; banyak titik = ribuan) + pratinjau Rupiah. Kotak "Original: …" = nilai baris SAAT INI (bukan nilai AI dari Timeline -- keputusan
  spek). Save -> RPC -> reload + toast "Line updated — please verify again"; `changed=false` -> toast "No changes to save.". Toast lewat prop
  baru `onToast` (diteruskan modal review).
- **D. Tampilan kiri–kanan** (menggantikan tabel 8 kolom + sub-baris history): tiap baris = blok `grid xl:grid-cols-2` (layar >= 1280px 2
  kolom, di bawahnya bertumpuk), garis kiri hijau bila verified. Kiri: No, Description, Edit + Verify (tombol, dulu checkbox), cost item
  picker + label match method, Amount + qty × price, chip flag / line_match / Check reference / Not mapped, "Not in cost master yet" + Add
  as new cost item, Browse history / Reset to automatic, Remark (textarea, blur = simpan). Kanan (`ComparatorCard`): pembanding utama =
  pick manual > primary > history[0] (`pickComparators`) -- label Main reference / Chosen by user, sumber (`MatchLevelLabel`), line_match,
  description_raw + invoice_description kecil, tgl (x days before/after) · kapal (DWT) · port · vendor, Amount, selisih Rp & % (merah naik /
  hijau turun / abu sama atau flag `sesuai`). Pembanding ke-2 = pick next / alternative (lebih tipis); alternative tetap chip "Alternative ·
  same line" + **Use as comparison**. Tanpa history: "Not in cost master yet" (item_baru / tanpa cost item) atau "No history yet".
- **E. Auto-hide**: panel kanan DILIPAT bila `compare_flag = 'sesuai'` && line_match pembanding utama = `same_line` && `!compare_check` ->
  ringkasan "✓ Same line · Rp <ref> · <%>" + "Show compare" (per baris, bisa "Hide compare" lagi). Toggle toolbar **Show only differences**
  (default) | **Show all compares** -- state komponen saja (tanpa localStorage).
- **Diuji 2026-10-16**: `tsc` (= `npm run lint`) bersih; render Vite SSR komponen asli 4 baris contoh (sesuai+same_line, naik+alternative,
  item_baru tanpa cost item, tanpa_history) editable & baca saja: 1 terlipat + ringkasan benar, 1 kartu utama + 1 ke-2, Use as comparison
  hanya editable, Verify disable+tooltip baris Not mapped, Verify all = 1, tanpa "Use as reference". Belum dites di browser / DB.

### Rapikan modal review (2026-10-16, permintaan user dgn screenshot)

File: `CostAgentInvoiceReviewModal.tsx`, `CostAgentInvoiceLines.tsx`.
- **Header = bubble** (`InfoBubble`, rounded-xl border, label kecil di atas nilai): Vessel, Port, Voyage · port call, Subtotal, VAT, WHT, Stamp,
  Lines total (merah bila beda > 1 dari subtotal). Dulu strip polos + VAT·WHT digabung.
- **Alert langsung di field** (`NOTE_FIELD`): vessel_unknown/vessel_fuzzy -> bubble Vessel, port_unknown -> Port, voyage_unmatched -> Voyage,
  total_mismatch -> Lines total, vendor_unknown/duplicate -> di samping judul vendor. Chip kuning `FieldNote` = label `CHECK_NOTE_LABEL`, pesan
  Indonesia di tooltip, tombol **Fix** (buka Correct header) utk catatan vendor/kapal/pelabuhan/voyage bila `headerEditable`. Tipe lain (tak
  dikenal) tetap baris chip di bawah bubble; susulan_mismatch tetap di tab Documents.
- **Header v2 (2026-10-16, permintaan user)**: bubble (pill `rounded-full`) HANYA membungkus isian, label polos di atasnya. Baris 1 Vessel / Port /
  Voyage · port call; baris 2 (di bawah Vessel) Subtotal / VAT / WHT / Stamp. **Lines total DIHAPUS** -- selisih lines total vs subtotal (> 1)
  + note `total_mismatch` kini ditandai di bubble Subtotal (merah + tooltip "Cost lines total Rp … differs from subtotal"). Description: label +
  badge Auto/Edited + isi + pensil dalam SATU baris; helper text "Saved to history as the invoice title…" DIHAPUS.
- **Header v3 (2026-10-16, permintaan user "kanan terlalu kosong")** -- MENGGANTIKAN alert per field di atas: header info 2 kolom (`flex-wrap`):
  KIRI bubble (2 baris), KANAN (`flex-1 min-w-[340px]`) Description + daftar SEMUA alert check_notes (kecuali susulan_mismatch; termasuk vendor
  / duplicate yg dulu di judul) = kotak kuning "⚠ Label: pesan" + tombol **Fix** (Correct header) utk vendor/kapal/pelabuhan/voyage. Bubble field
  yg punya alert tetap bergaris kuning (`InfoBubble warn`). `FieldNote` dihapus. Layar sempit: kolom kanan turun ke bawah bubble.
  **Rata kanan (2026-10-16, laporan user "terlalu ke kiri, alert banyak ruang kosong")**: blok kanan `ml-auto items-end` (Description `justify-end`),
  tiap alert `w-fit` (selebar teksnya, dulu selebar kolom), tombol Fix `ml-2`. Diuji (RPC di-mock) headless Chrome 1420 & 1700px.
  **Responsif (2026-10-16, laporan user: laptop 14" + 3 alert + description panjang -> blok kanan turun ke bawah bubble, kiri kosong)**: header
  info = wrapper `@container` + grid; lebar header >= 1250px `grid-cols-[auto_minmax(0,1fr)]` (bubble | kanan, blok kanan TIDAK pernah turun,
  teks description membungkus & rata kanan, alert mendatar `flex-wrap` rata kanan); < 1250px bertumpuk rata kiri (description 1 baris, alert
  mendatar). Dulu `flex-wrap` + `ml-auto` -> blok kanan selebar description & pindah baris. Diuji (RPC di-mock, data sama screenshot user)
  1366 / 1100 / 820px.
- **Teks alert check_notes Inggris (2026-10-16)**: field `msg` (Indonesia) TIDAK ditampilkan lagi. Helper BARU `src/utils/CostAgentNotes.ts`
  `noteText(note, invoice)` = SATU baris per alert dari `type` + data invoice: vendor_unknown "Vendor not in master: <vendor_name_raw>",
  vessel_unknown / port_unknown sama pola, vessel_fuzzy "Vessel matched by similar name: <raw> → <vessel_name> — please check", voyage_unmatched
  "Voyage / port call not matched", duplicate "Possible duplicate of invoice #<duplicate_of>", total_mismatch "Line total does not match invoice
  total (Lines: Rp … · Invoice: Rp <grand_total ?? subtotal>)", susulan_mismatch "Supporting document refers to a different invoice number",
  tipe lain "Check required"; nilai raw kosong -> tanpa ": …". Dipakai di daftar alert header modal review & alert susulan tab Documents & Tax
  (daftar invoice tidak menampilkan check_notes). `CHECK_NOTE_LABEL` (CostAgentHelpers) DIHAPUS. Tombol Fix tetap. Diuji 9 tipe × data
  lengkap/kosong via Vite SSR.
- **Grand total** pindah ke footer tab Cost lines (prop baru `footerRight` CostAgentInvoiceLines, ujung kanan sebelah ringkasan flag); di tab lain
  tampil di footer aksi kiri (`GrandTotal`).
- **Viewer file default tersembunyi** (`showViewer` awal false; tombol Show file tetap).
- **Baris (laporan "bingung dibaca")**: 2 kolom kini **container query** panel `@min-[900px]` (dulu layar `xl:`) dgn proporsi 1 : 1.15 + judul kolom
  sticky "Invoice line" | "Compared with history — the flag follows the main reference". Kiri: baris 1 = No + teks + Amount (qty × price kecil);
  baris 2 = cost item + chip flag/Check reference/Not mapped/match method; baris 3 = Add as new cost item · Browse history · Reset · **+ Remark**
  (remark hanya tampil bila ada isi / diklik) + Edit/Verify di kanan. Badge line_match hanya di kartu kanan (tidak dobel). Kartu pembanding:
  baris label (Main reference / 2nd reference / Alternative · sumber · line_match), teks history, judul invoice lama HANYA bila beda dgn teks
  baris (dulu tampil 2x), tgl (x days before) · kapal (DWT) · port · vendor; kanan = nominal history + chip kalimat "▼ This line 84% lower" /
  "▲ This line 20% higher" / "Same amount" + selisih Rp kecil.
- **Diuji 2026-10-16**: `tsc` bersih; komponen baris asli dirender (Vite SSR + CSS index.css) & di-screenshot headless Chrome lebar 1420 / 900px:
  2 kolom rapi, tanpa teks terpotong/meluber. Header bubble belum di-screenshot (butuh data RPC) -- cek di browser.
- **v2 -- 3 kolom (2026-10-16, laporan user: compare masih membingungkan, baris terlalu tinggi, "seperti bursa saham")** -- MENGGANTIKAN tata
  letak 2 kolom + kartu di atas. Grid `@min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]` (ditulis LITERAL; Tailwind tidak membaca
  kelas interpolasi), judul kolom sticky **Invoice line | Compare with history | Action**; < 900px: kolom 1 penuh, lalu Compare | Action.
  Baris PUTIH (latar merah/kuning per flag dihapus; warna hanya di chip), garis kiri hijau = verified.
  - Kolom 1: No + teks + Amount; cost item picker (lebar 260) + Not mapped / Add as new cost item / match method / qty × price; remark tersimpan
    = 1 baris italic kecil.
  - Kolom 2 (`CompareHeadline`): **[chip flag] vs history Rp X (selisih Rp)** + Check reference -- flag pindah ke sini (dulu di kolom kiri).
    `HistoryDetail` 2 baris kecil: [line_match] teks history · tgl (x days before) / "Main reference:" atau "Chosen by user" + sumber · kapal
    (DWT) · port · vendor (truncate, lengkap di tooltip). Pembanding lain (`OtherReference`, alternative didahulukan) = 1 baris ringkas, dilipat
    di balik "+n more reference" -- otomatis terbuka bila compare_check atau "Show all compares". Baris tenang (auto-hide 065 E) = headline saja
    + badge Same line + toggle Details/Less. Tanpa history: chip flag + "Not in cost master yet — nothing to compare" / "No history yet for this
    cost item".
  - Kolom 3 (lebar 112): tombol **Verify/Verified** + ikon Edit, Browse history, Remark (buka textarea selebar baris, simpan saat blur lalu
    tertutup), Reset to automatic (bila pembanding manual).
  - Diuji: `tsc` bersih; screenshot headless Chrome 1420px (6 baris contoh, tinggi baris ±70–90px, 3 kolom) & 800px (bertumpuk) tanpa luber.
- **Detail history -> ikon ⓘ (2026-10-16, update kecil)**: di kolom Compare (`HistoryDetail` utama + `OtherReference` next/alternative) teks
  "tgl (x days before/after) · kapal (DWT) · port · vendor" DISEMBUNYIKAN. Tetap tampil: label sumber (Main reference / Chosen by user /
  `matchLevelLabel`, Alternative · same line / 2nd ref), badge line_match, description_raw (+ judul invoice kecil bila beda), Amount & selisih
  Rp/% (headline utama; baris lain "(this line +Rp … · +x%)"). Komponen `HistoryInfo` = ikon ⓘ di samping label sumber: hover (desktop,
  tutup 150 ms setelah kursor keluar, popover bisa disentuh) / klik (mobile, toggle; klik di luar menutup) -> popover Date (+ days), Vessel
  (DWT), Port (kode — nama), Vendor, Invoice no, Voyage. Popover = portal `fixed` z-[120] (tidak terpotong panel scroll), posisi dibagi faktor
  zoom yg diukur (rect / offsetWidth) & dijepit ke viewport. Ringkasan baris terlipat & drawer Browse history TIDAK berubah. Diuji: `tsc`
  bersih; halaman uji di dev server + headless Chrome (zoom 90%): 3 ikon ⓘ, klik -> popover berisi 6 field & tepat di bawah ikon, panel
  tidak lagi memuat vendor / "days before".
- **Pemisah kolom + 1 tombol menu (2026-10-16, permintaan user)**: garis vertikal `@min-[900px]:border-l border-[#E4D8CF] pl-4` di kolom Compare &
  Action (header & baris). Padding vertikal dipindah dari baris ke SEL (`pt-2 pb-2`, baris `gap-y-0`) supaya garis menyambung penuh antar baris;
  header memakai `border-l-4 border-l-transparent px-3` = sama dgn baris (garis header lurus dgn garis baris). Kolom Action (lebar 136) = **Verify** +
  tombol **⋯** (`ActionMenu`, portal `fixed`, rata kanan tombol, klik luar / Esc menutup menu saja): Edit line, Browse history, Add/Edit remark,
  Reset comparison to automatic (hanya bila pembanding manual; Edit/Remark/Reset hanya `editable`). Dulu 3–4 ikon terpisah di bawah Verify.
  Posisi popover bersama `useFixedPopover` (juga dipakai ⓘ) + `useOutsideClick`. Diuji di dev server + headless Chrome (zoom 90%): garis kolom 2
  & 3 di x yang sama utk semua baris, menu berisi 4 aksi & tampil di bawah tombol.
- **v3 (2026-10-16, permintaan user)** -- MENGGANTIKAN menu ⋯: (1) semua tombol aksi TERLIHAT, vertikal di kolom Action (`ActionBtn` h-6 ikon +
  label): Verify, Edit line, History, Remark/Edit remark, Reset (hanya pembanding manual; tooltip "Reset comparison…"); `ActionMenu` dihapus.
  (2) Ringkasan jumlah & total per flag di footer DIHAPUS -- footer = Needs check (kiri) + Grand total (kanan). (3) Tombol **Submit for
  approval** dipertegas: siap = hijau pekat h-10 font bold + ring; belum siap = kotak kuning tebal (border-2, TIDAK pudar) + chip alasan
  "n line(s) without cost item" / "n not verified". Diuji: `tsc` bersih; screenshot headless Chrome 1420px (baris + footer); tombol Submit di
  modal belum di-screenshot (butuh data RPC).
- **Laptop 14" + file terbuka (2026-10-16, laporan user: tampilan "jelek", beda dgn 24")**: penyebab = panel baris < 900px saat viewer file tampil ->
  kolom bertumpuk. Batas 3 kolom diturunkan ke container **640px** (`@min-[640px]`); kolom Action `w-[120px]` (136px mulai panel 1000px), padding
  pemisah `pl-3`; baris 1 kolom Invoice line `flex-wrap` (teks min 110px, Amount `ml-auto` turun ke kanan bila sempit). Diuji headless Chrome
  zoom 90% lebar panel 760 & 980px: 3 kolom, tanpa teks terpotong/meluber.
- **v4 tombol per kolom (2026-10-16, permintaan user)**: **Remark / Edit remark** pindah ke kolom Invoice line (bar bawah, + teks remark italic di
  sampingnya), **History** (+ **Reset to automatic** bila pembanding manual) pindah ke kolom Compare (bar bawah). Kolom Action = Verify + Edit line.
  Kolom 1 & 2 `flex flex-col`, bar tombol `mt-auto` -> tombol Remark & History sejajar di dasar baris; semua `ActionBtn` setinggi Verify (h-7).
  Diuji headless Chrome zoom 90% lebar 820 & 1420px.
- **v5 (2026-10-16, permintaan user: "jangan di bawah, buat di samping")** -- MENGGANTIKAN bar bawah v4: **Remark** di SAMPING cost item picker
  (picker `flex-1 min-w-[140px] max-w-[260px]` menyempit supaya tombol muat), teks remark italic menyusul di baris itu; **History** (+ **Reset**)
  di kanan kolom Compare sejajar headline (`flex items-start`, isi compare `flex-1`). Tinggi baris kembali ±70px. Diuji 820 & 1420px.
- **Fix 2nd ref "terlewat" (2026-10-16, laporan user)**: `OtherReference` dulu 1 baris dgn teks history (description_raw) di UJUNG setelah nominal ->
  di kolom Compare sempit (laptop 14" + file terbuka) lebarnya 0 & teks hilang. Kini 2 baris seperti pembanding utama (garis kiri; alternative
  putus-putus): [2nd ref / Alternative · same line] [line_match] teks history / sumber ⓘ · Rp X (this line +Rp … · +x%) [Use as comparison],
  `flex-wrap`. Toggle Details/Less di headline tidak lagi `ml-auto` (dulu menabrak tombol History). Diuji headless Chrome 760px + Show all compares.
- **v6 nominal history di kiri (2026-10-16, permintaan user)** -- MENGGANTIKAN headline "[flag] vs history Rp X" & `HistoryDetail`: kolom Compare
  per pembanding = blok nominal KIRI (`AMT_COL` 96px / 112px mulai panel 1000px: Rp history tebal + selisih Rp kecil, "same amount" bila sama;
  pembanding lain + %) langsung bersanding dgn nominal invoice di ujung kanan kolom Invoice line; di kanannya (garis kiri) baris 1 = [flag /
  2nd ref / Alternative] [line_match] [Check reference] **nama baris cost** history (`min-w-[140px]`, turun baris bila sempit), baris 2 =
  `RefWhere` "Main reference: <sumber> · **<vessel> · <port kode — nama>**" + ⓘ (boleh membungkus; tgl/DWT/vendor/invoice/voyage/invoice title
  tetap di popover). Komponen `MainReference` (folded = baris 1 saja + Details/Less) & `OtherReference`. Diuji headless Chrome 1420 & 820px.
- **v7 tata letak mockup user (2026-10-16)** -- MENGGANTIKAN v2–v6 (3 kolom + judul kolom sticky + pemisah): tiap baris = grid container query
  `@min-[1000px]:grid-cols-[32px_minmax(0,1.15fr)_118px_82px_118px_minmax(0,1.35fr)_120px]`: **No** (kotak abu) | **Invoice line** (nama tebal,
  cost item picker maks 260px, tombol **Edit line** (+ Add as new cost item), chip: "⚠ Not in master record" (tanpa cost item, dulu "Not mapped"),
  remark = chip abu, match method, qty × price) | **Invoice** (label kecil + Rp tebal) | **pill selisih** (`DiffPill`: naik merah "▲ 75,0%", turun
  biru "▼ 60,3%", sesuai hijau "= 0,0%", New item, No history; % = `compare_diff_pct`) | **History** (label + Rp, rata kanan) | **detail history**
  (nama baris cost HURUF BESAR + badge line_match; `RefWhere` "sumber · vessel · port kode" + ⓘ; link **View history**, "+n more reference" /
  Hide, Less/Details utk baris tenang, Reset to automatic, chip Check reference; pembanding lain `OtherReference` ringkas di bawahnya) |
  **Verify** + **Remark/Edit remark** (h-8). Tanpa judul kolom (label Invoice/History di sel). Panel < 1000px: No | (line, baris angka
  Invoice-pill-History, detail) | aksi. Textarea remark selebar kolom 2–6. Komponen lama `MainReference`/`CompareHeadline`/`HistoryDetail` dihapus.
  Diuji headless Chrome 1420 & 820px.
  **Revisi (2026-10-16, permintaan user)**: judul kolom sticky KEMBALI (`data-lines-header`, hanya panel >= 1000px, grid sama baris): # | Invoice
  line | Invoice vs history (span 3 kolom angka) | Main reference | Action (rata kanan). Tombol **Edit** (dulu "Edit line" di bawah picker) di
  SAMPING nama biaya. Chip remark (mis. "In/Out") DIHAPUS -- remark tetap lewat tombol Remark/Edit remark (tooltip berisi isinya). `ActionBtn`
  dihapus (tidak terpakai).
  **Main reference ringkas (2026-10-16, permintaan user)**: nama baris history (description_raw) + badge line_match DISEMBUNYIKAN dari kolom Main
  reference -- yang tampil hanya `RefWhere strong` "sumber · vessel · port" TEBAL + ⓘ; popover ⓘ (`HistoryInfo`) kini juga memuat **History
  line** & **Line match** ("Different line — check manually"). Toggle Details/Less & logika lipat (`isQuietLine`, `expanded`) DIHAPUS -- tidak ada
  lagi detail yg dilipat; "Show only differences / Show all compares" kini hanya mengatur pembanding lain (selain via "+n more reference" &
  compare_check).
- **v8 tabel ber-kolom (2026-10-16, permintaan user: "3 kolom terpisah" + rapi di laptop 14" & saat PDF tampil)** -- MENGGANTIKAN tata letak v7:
  Invoice / Diff / History kini 3 KOLOM TERPISAH dgn judul sendiri & garis pemisah `border-l` di semua kolom (padding di sel supaya garis penuh).
  Container query panel: **>= 1100px** `grid-cols-[28px_minmax(0,1.1fr)_122px_80px_130px_minmax(0,1.3fr)_132px]` = # | Invoice line | Invoice |
  Diff | History | Main reference | Action; **640–1099px** (laptop 14", PDF terbuka) `grid-cols-[28px_minmax(0,1fr)_118px_78px_126px_132px]` = sama tanpa
  kolom Main reference -- Main reference turun ke baris 2 (kolom 2–5, garis atas putus-putus, label kecil "MAIN REFERENCE"); **< 640px** bertumpuk
  (angka 1 baris flex dgn label Invoice/History). Judul kolom sticky tampil mulai 640px (Main reference hanya >= 1100px). Wrapper angka
  `@min-[640px]:contents` -> tiap sel jadi kolom grid. **PENTING**: posisi sel memakai `[grid-column:…]` / `[grid-row:…]` eksplisit -- `col-span-*`/
  `row-span-*` Tailwind v4 = shorthand `grid-column: span N` yg MENIMPA `col-start-*` (sempat membuat baris berantakan di 900px). Diuji headless Chrome
  1420 / 900 / 560px.
- **v9 (2026-10-16, koreksi user: "3 kolom" = Invoice line | Invoice vs history | Main reference, bukan 5; & tampilan SAMA saat PDF tampil)** --
  MENGGANTIKAN v8: Invoice · pill % · History kembali dalam SATU kolom "Invoice vs history" (sel = `@container`: lebar sel >= 270px sebaris, lebih
  sempit -> pill turun di tengah bawah). Kolom: # | Invoice line | Invoice vs history | Main reference | Action, garis pemisah `border-l`.
  Main reference TIDAK lagi turun ke baris 2 saat file/PDF tampil -- satu tata letak utk semua panel >= 640px, hanya lebar kolom yg menyesuaikan:
  640–1199px `grid-cols-[28px_minmax(0,0.9fr)_296px_minmax(0,1fr)_128px]`, >= 1200px `grid-cols-[28px_minmax(0,1fr)_320px_minmax(0,1.2fr)_132px]`;
  < 640px bertumpuk. Judul kolom Invoice line / Invoice vs history / Main reference / Action rata tengah. Baris "Alternative" di Main reference `flex-wrap` (Use as comparison turun bila sempit). Diuji headless Chrome 1420 / 900 /
  760 / 560px.
- **Remark di kolom Main reference (2026-10-16, permintaan user)**: remark baris tampil di AKHIR sel Main reference (setelah link View history /
  +n more & daftar pembanding lain -> ikut turun saat "+n more reference" dibuka) sbg kotak kecil abu (ikon pesan, teks utuh `whitespace-pre-wrap`,
  `data-line-remark`). Tombol Remark/Edit remark (kolom Action) membuka textarea DI POSISI YANG SAMA (dulu textarea selebar baris di bawah
  baris), simpan saat blur. **Mengosongkan remark** (2026-10-16, laporan user "tidak tersimpan"): dulu frontend hanya menyimpan bila teks tidak
  kosong; kini teks kosong dikirim `''` -> RPC `verify_line` (`remark = coalesce(p_remark, remark)`, versi a21e206) mengosongkan remark.
  **Diverifikasi user 2026-10-16 (pg_get_functiondef live)**: `remark = coalesce(p_remark, remark)` tanpa nullif -> '' mengosongkan, tanpa SQL baru.
  Catatan: verify_line SELALU mengisi `verified_by`/`verified_at` (juga saat hanya simpan remark / unverify) -- perilaku server, tidak diubah.
- **Invoice title hanya di ⓘ (2026-10-16)**: `invoice_description` (judul invoice lama, mis. "BY. AGEN DLL DI TJP - …") TIDAK lagi tampil di
  kolom Compare (pembanding utama, 2nd ref / alternative, ringkasan terlipat) maupun tooltip-nya -- yang tampil hanya `description_raw`.
  Dipindah ke popover ⓘ (`HistoryInfo`) baris **Invoice title**. Drawer Browse history tidak berubah.

## Konvensi lanjutan

Pola acuan: BunkerPage (list, pagination server-side, Card/List, polling `setInterval` 5 dtk HANYA selama ada processing),
BunkerUploadModal (upload), FarOverseasAirDetailModal (detail + approval, route `:id?`), FinanceHandoverPage (mark paid),
`PaginationFooter` + `LoadingState` wajib. JANGAN sentuh `SharedDataTable`. Toast per halaman. Waktu voyage = jam lokal
pelabuhan (`ports.tz`), kirim ke RPC "YYYY-MM-DD HH:mm" tanpa offset. Angka Rupiah/liter format id-ID.

## Agency Invoices -- kartu progres, header & footer nominal editable (2026-10-20, permintaan user; sql/069 SUDAH DIJALANKAN 2026-10-20, file dihapus: `git show 79d908a:sql/069_cost_agent_update_invoice_amounts.sql`)

- **Kartu** (`CostAgentCards.tsx`): chip higher/new item/tax/to verify/jumlah baris/status DIHAPUS -> 4 pil progres **Completed / Verified / Approved / Paid**
  (`invoiceProgress()`; hijau + centang bila tahap terlewati, abu bila belum). Completed = bukan processing/failed/cancelled; Verified = semua baris
  verified (verification dgn 0 baris belum verif, atau waiting_approval dst); Approved = approved/journal/paid; Paid = paid. processing/failed/rejected/
  duplicate tetap chip merah/biru di depan pil. Kiri: PT badge + vendor + invoice no; tengah: Vessel / Port / Voy; kanan: Grand total.
- **Modal review** (`CostAgentInvoiceReviewModal.tsx`): header kanan = tombol alert (`AlertsButton`, ikon + badge jumlah check_notes, klik -> daftar +
  Fix) + pensil Correct header (ikon saja) + Delete + X. Baris pil: Vessel / Port (bisa diedit langsung: pensil -> combobox -> pilih = simpan via
  `fn_cost_agent_update_invoice_header`; ganti vessel melepas port call) / Voyage · port call / Description. Alert tidak lagi tampil terbuka di header.
- **Footer** (semua tab): pil Subtotal / VAT / WHT / Stamp (+ pensil -> edit 4 angka, Save) + Grand total (footerRight Lines tidak dipakai lagi).
  Simpan = RPC BARU `fn_cost_agent_update_invoice_amounts` (`sql/069_cost_agent_update_invoice_amounts.sql`, definer, guard `assert_edit`, status
  verification/rejected/failed): grand_total dihitung server = subtotal + ppn - pph + materai, catatan `total_mismatch` dibuang bila selisih <= 1,
  dicatat ke status_log. Sudah masuk `server/db/whitelist.ts`. Hak edit = `headerEditable`. 

## Agency Invoices — pembersihan header & Correct header (2026-10-20, permintaan user)
- **Subjudul halaman dihapus** di Agency Invoices & Voyages (`CostAgentPageHeader` `subtitle` kini opsional; Approval Matrix tetap pakai subjudul).
- **Pensil inline Vessel / Port / Description di header modal invoice DIHAPUS** (`InlinePick` & `saveHeaderField` dibuang). Semua koreksi header lewat **Correct header**
  (`HeaderEditor`); Description kini field di editor itu (disimpan via `fn_cost_agent_set_invoice_description` hanya bila berubah & tidak kosong). "Reset to auto" tetap di header.
- **Footer nominal**: Subtotal & Grand total TIDAK bisa diedit (Subtotal tampil read-only saat edit, nilai tersimpan dikirim apa adanya ke `fn_cost_agent_update_invoice_amounts`); hanya
  VAT / WHT / Stamp; panah spinner input angka dihilangkan.
- **Vendor di Correct header**: invoice yang vendornya SUDAH ter-match (`vendor_id` terisi) -> field terkunci (read-only). Belum ter-match -> `VendorCombobox addOnly`: tidak ada daftar
  pilih, hanya "+ Add vendor" (server mengembalikan id lama bila nama/alias/NPWP sudah ada). **Pembatasan di UI saja** -- RPC koreksi header masih menerima `vendorId`.

## Agency Invoices — modal review dipercantik (2026-10-20, permintaan user; DISETUJUI user)
- Murni tampilan, pola panel Validation Courier; tanpa perubahan RPC/state/handler. `CostAgentInvoiceReviewModal.tsx`: header = badge PT + judul + no invoice (label abu) + chip status;
  Vessel / Port / Voyage·port call / Description jadi **strip info** (`InfoStrip` + `InfoCell`, latar `#F5EDF3`, sel amber + ikon bila ada check_note) yang bisa dilipat
  ("Hide info"/"Show all info", localStorage `beehive_cost_agent_invoice_info_open`, default terlipat bila tinggi jendela < 900px); tab gaya Courier (sudut atas membulat, garis
  bawah 3px) dgn titik status (Cost lines hijau/kuning, Approval, Payments); area isi latar krem + kartu putih (Cost lines, Timeline). Footer nominal tidak berubah.
- `CostAgentInvoiceLines.tsx`: tiap baris = **kartu** (garis kiri hijau = verified / amber = tanpa cost item / abu), header kolom ungu muda, nomor baris bulatan plum,
  Edit/View history/"+n more reference"/Reset = chip ungu lembut (`LINK`), Verify hijau lembut (verified = hijau pekat + CheckCircle2), Remark ungu bila ada remark (kotak remark kuning),
  pill selisih bulat dgn ikon panah, toolbar = chip jumlah + segmen toggle seperti Courier.

## Agency Invoices — kartu daftar disederhanakan (2026-10-20, permintaan user; DISETUJUI user)
- `CostAgentCards.tsx` `CostAgentInvoiceCard`: kartu putih polos, garis kiri 4px mengikuti nada status, SATU warna tombol (ungu). Grid 3 kolom (`@5xl`; `@3xl` 2 kolom; sempit ditumpuk):
  kiri = badge PT + vendor + label no invoice, **pil Vessel (plum) / Port (biru) / Voy (hijau)**, tanggal invoice/service + dokumen + PO; tengah = `InvoiceStepper`
  (garis progres Completed -> Verified -> Approved -> Paid ala Timeline Finance Handover: simpul bulat, selesai = hijau + centang, tahap berjalan bercincin per nada status
  (amber/ungu/biru spinner/merah X), keterangan "Done / n to verify / Waiting / Rejected / AI reading… / Failed / Pending"); kanan = Grand total + tombol Review + ikon hapus (Admin)
  di PALING UJUNG. Chip status, chip alert, "n lines · n to verify" & Description/strip info SENGAJA dihapus dari kartu (keputusan user; semuanya ada di modal).
- Chip "Duplicate of #id" & "Your approval" tetap tampil hanya bila relevan; prop `mine` (invoice `waiting_approval` yg step aktifnya memuat email user, dari `myIds` halaman) -> tombol "Decide".
- Isi modal yg TIDAK ada di data daftar (Subtotal/VAT/WHT/Stamp, uploaded by, jam port call, detail alert) belum bisa ditampilkan di kartu -- butuh kolom baru di view `cost_agent_invoice_list_v` (SQL, belum dikerjakan).

## Read Voyage Report (AI) — panel progres (2026-10-22, permintaan user)

- `CostAgentVoyageAiModal` (`CostAgentVoyageSourceModals.tsx`): selagi menunggu respons webhook n8n, form diganti panel `AiWaitPanel` (ikon berdenyut, bar tak-tentu `ca-indeterminate` di `index.css`, 4 tahap
  yang berganti menurut lama menunggu + penghitung detik). n8n TIDAK mengirim progres sungguhan -> sengaja TANPA persentase palsu. Gagal -> form kembali + pesan error.
