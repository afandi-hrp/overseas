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
- **Dashboard > "Documents without invoice" (2026-10-27)**: bagian baru TEPAT DI ATAS Pipeline (tab tetap 8). Faktur pajak / lampiran yang masuk lewat email tanpa invoice; sistem melampirkan otomatis bila yakin, sisanya menunggu di sini.
  File: `settings/UnmatchedDocsSection.tsx` (bagian + tabel), `settings/UnmatchedDocsDialogs.tsx` (`AttachDialog`, `DismissDialog`), tipe + pembungkus RPC di `hubApi.ts` (`hubListUnmatchedDocs`, `hubSearchInvoicesForAttach`, `hubAttachUnmatchedDocs`, `hubDismissUnmatchedDocs`).
  - **RPC** (bentuk hasil DIVERIFIKASI `pg_get_functiondef` production 2026-10-27; semua guard `assert_read/assert_edit('cost_agent_approval_matrix')`): `fn_cost_agent_list_unmatched_docs(p_status 'pending'|'attached'|'dismissed'|'all', p_limit)` -> `{pending_count, rows[]}`
    (pending_count = SEMUA pending, tidak terpengaruh filter status; `documents[].total_amount` bertipe teks; limit server maks 500); `fn_cost_agent_search_invoices_for_attach(p_q, p_limit)` -> ARRAY (bukan `{rows}`; q < 2 karakter = `[]`; invoice processing/cancelled tak muncul);
    `fn_cost_agent_attach_unmatched_docs(p_id, p_invoice_id)` -> object (menolak bila sudah ditangani / invoice processing|cancelled; dokumen dibaca ulang & dibandingkan dgn baris invoice, invoice TIDAK diubah); `fn_cost_agent_dismiss_unmatched_docs(p_id, p_note)` -> void (note maks 500).
  - **UI**: chip status Waiting (default `pending`) | Attached | Dismissed | All, `p_limit` 100; kolom Received, From, Subject (2 baris + tooltip), Files (tautan `file_url` HANYA bila http(s) -- sumbernya email, tak tepercaya; "+n" bila > 2), Documents (chip jenis + `doc_no`, tooltip tanggal/issuer/total), Why it is waiting (label `reason`), Actions.
    Attach/Dismiss hanya bila `canEdit('cost_agent_approval_matrix')` DAN status pending; read-only = daftar saja. Baris attached/dismissed = "Attached to {invoice_no|#id}" (tautan `/cost-agent/invoice/:id`; no. invoice diambil dari `candidates` bila ada) / "Dismissed", oleh/pada, note.
    Dialog Attach: radio "Suggested invoices" (`candidates`) + kotak "Search another invoice" (min 2 karakter, debounce 300 ms, limit 20); error server tampil DI DALAM dialog (dialog tetap terbuka). Sukses: toast ber-tautan ke invoice, muat ulang daftar, `notifyCostAgentApprovalsChanged()`.
  - **Badge**: shell hub memuat `pending_count` sekali saat halaman dibuka (`p_limit` 1) dan bagian Dashboard memperbaruinya lewat `ctx.setPendingDocs` (field baru `HubCtx`); badge amber di label tab "Dashboard" hanya bila sudah dimuat & > 0.
    Toast hub (`HubCtx.toast`) kini menerima `ReactNode` (tautan), pemanggil lama tetap string.
  - **"Invalidasi query invoice"**: aplikasi tidak memakai react-query; yang ada = event `beehive:cost-agent-approvals-changed` (dengar: daftar Agency Invoices + badge sidebar), jadi itu yang dipicu. Review modal invoice yang SUDAH terbuka tidak ikut dimuat ulang.
  - **BELUM di whitelist gateway**: 4 RPC ini belum ada di `server/db/whitelist.ts` (tidak diubah di sesi ini). Gateway masih mode `log` (tidak memblokir); WAJIB ditambahkan sebelum `DB_GATEWAY_MODE=enforce`.
- **Rapi-rapi tampilan hub (2026-10-27, permintaan user "simpel, elegan, informatif, responsif di semua monitor")** -- hanya tampilan, logika/RPC TIDAK berubah. Pola bersama di `settings/hubUi.tsx` (pakai ini utk tab/bagian baru, jangan bikin gaya sendiri):
  - **Judul bagian** = `SectionTitle` (kalimat biasa, tebal 14px, keterangan kecil opsional) -- dulu Dashboard huruf kapital kecil ungu sementara "Ladder" Approval Matrix gaya lain.
  - **Deretan angka** = `StatGrid` (Needs attention 5 kolom, Pipeline 9 kolom; garis tipis `gap-px`, sel dim bila 0, nada merah/amber bila perlu, titik warna status di Pipeline) menggantikan 19 kotak ber-border.
  - **Toolbar tab daftar**: kolom cari `FILTER_SEARCH` (melebar 180-320px, BUKAN lebar tetap), `ResetButton` (ghost), `HubToolbarEnd` (jumlah + badge "View only" + tombol utama satu kelompok di kanan; pindah utuh saat membungkus).
  - **Tabel**: `TableCard` kini `@container` + baris menyala saat disorot; kolom sekunder disembunyikan menurut LEBAR KARTU (`HIDE_LG` >= 1000px, `HIDE_XL` >= 1250px; pasangkan di `<th>` DAN `<td>`): Vessels GT/HP/Aliases/Short code, Ports Lat-Lon/Aliases, Cost Items GL account, Matrix Approver/Role, History Qty.
    Datanya tetap ada di drawer Edit. `ICON_BTN`/`ICON_BTN_DANGER` = tombol ikon aksi baris tanpa border; `ActiveStatus` = titik hijau/abu + teks (bukan chip hijau tiap baris); `UsedBy` = hanya hitungan > 0 ("12 invoices · 40 history"), semua nol = "Not used" (tooltip = rincian lengkap).
  - **History**: filter utama 1 baris (cari + Vessel/Vendor/Port/Cost item) + tombol "More filters" (badge = jumlah filter tambahan yang menyimpang dari bawaan; status bawaan Active) membuka baris Company/Status/Source/tanggal/nominal; ringkasan "n rows · IDR x" pindah ke toolbar; 14 kolom -> 10 (Invoice+Voyage, Vessel+Port, Status+Source+Used by digabung 2 baris).
  - **Tab bar** shell = tab bergaris bawah dalam kartu putih (bukan pil ungu penuh). **Documents without invoice**: kosong = satu baris hijau berikon centang (bukan blok teks); penjelasan + tip jadi keterangan judul.
  - **Belum diverifikasi visual di browser** (tidak ada akses login di sesi Claude): cek di laptop 14" (~1366-1536px) & monitor 24" bahwa toolbar 1-2 baris dan kolom yang disembunyikan terasa wajar.
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

## Finance mapping (Supplier / Kapal / Jenis biaya -> Ascend) -- tab hub + kartu invoice (2026-10-28, permintaan user; SQL `084_cost_agent_finance_mapping.sql` SUDAH DIJALANKAN per konfirmasi user)

Tujuan: memetakan master kita ke master Ascend supaya AP Note nanti bisa dibuat (Tahap 1b; kirim AP Note = tahap berikutnya). Tahap 1a (SQL 084) membuat tabel
`cost_agent_finance_supplier_map` / `_vessel_map` / `_expense_map`, RPC `fn_cost_agent_finance_{list_map,pick,save_map,delete_map,check}`,
`fn_cost_agent_set_finance_alias`, dan tabel/RPC aturan pajak (di bawah). Semua RPC sudah di `server/db/whitelist.ts` (11 RPC baru, termasuk
`apply_tax_rules` & `override_line_tax` yang BELUM dipanggil UI).

- **Alur: Supabase dulu -> Ascend -> simpan hasilnya.** `list_map` (Supabase) menampilkan yang sudah terpetakan + yang dibutuhkan invoice tapi belum (Missing).
  Pencarian ke Ascend lewat jalur yang SUDAH ada: browser -> `apiFetch('/api/lean/odata/<entity>')` (`src/pages/cost-agent/settings/ascendApi.ts`, dipakai
  bersama tab Ascend lama) -> proxy `server/routes/lean.ts` (X-Api-Key diisi server). Tidak ada klien Ascend baru, tidak ada key di frontend.
  Kolom diminta lewat `$select` aman saja: AP_Suppliers `SupplierID,SupplierCode,SupplierName,NPWP,Disabled`; IC_InventoryUsers_Fleet
  `InventoryUserID,InventoryUserCode,InventoryUserName,FleetName,Disabled,IsVessel`; FI_ExpenseTypes_Account `ExpenseTypeID,ExpenseTypeDescription,AccountName,Disabled`.
  Kolom bank/rekening/KTP/alamat TIDAK PERNAH diminta atau disimpan.
  **Tab "Expense Type (Ascend)" diganti "COA (Ascend)" (2026-10-30, `CoaAscendTab`, key `ascend-coa`)**: membaca entity lean-api `AC_Accounts` (tabel apa adanya, kolom dari
  katalog; tampil `AccountID, AccountCode, AccountName, IsDisabled` -- flag nonaktif bernama `IsDisabled`, `AscendTable` mendeteksi `Disabled`/`IsDisabled`). Diizinkan di
  `ODATA_PATHS` (`server/routes/lean.ts`) tapi TIDAK di `SAFE_ODATA_COLUMNS` -> user yang hanya punya `cost_agent_invoice` tidak bisa membacanya. Entity
  `FI_ExpenseTypes_Account` TETAP ada (dipakai Finance mapping & kartu invoice; keputusan user: mapping jenis biaya belum diganti COA).
  lean-api perlu di-build ulang/redeploy agar entity `AC_Accounts` aktif; dokumen `docs/api/coa-ascend.md` di repo lean-api.
  **Tombol "Map to Ascend" di tab Vendors (2026-10-30, `AscendReviewModal.tsx` kind `supplier`, komponen yang sama dgn Vessels)**: semua vendor aktif (`fn_cost_agent_list_vendors`, ikut alias) yang belum
  punya pemetaan supplier di PT mana pun, dicari HANYA di `AS_MJS` (keputusan user) dan disimpan Manual dgn `p_company='MJS'` (dicek ada di Companies; kalau tidak, dialog menampilkan error).
  Alias vendor ikut dicari (`MasterQuery.aliases`, maks 3 kata khas unik; hanya jalur dialog ini, Auto-map Finance mapping tidak berubah). Mayoritas vendor tanpa NPWP -> banyak hasil "Choose".
  Catatan: pemetaan tersimpan di PT MJS saja; bila `fn_cost_agent_finance_check` membaca pemetaan supplier per PT invoice, invoice PT lain belum menganggapnya mapped.
  **Kolom "Ascend" di tab Vessels & Vendors (2026-10-30, `AscendMapBadge.tsx` + `finMappedIndex` di `financeApi.ts`)**: chip Mapped (kode - nama Ascend, gembok = Manual, "+N" bila di beberapa PT;
  tooltip merinci per PT) atau Not mapped. Data = satu pembacaan `list_map` status mapped (semua PT), dimuat ulang setelah Save di dialog Map to Ascend. Hanya tampilan; belum ada filter Mapped/Not mapped
  (daftar tab dipaginasi server oleh `fn_cost_agent_list_*`, filter butuh perubahan RPC).
  **Tombol "Map to Ascend" di tab Vessels (2026-10-30, `AscendReviewModal.tsx` kind `vessel`; sebelumnya `VesselAscendReviewModal.tsx`)**: mencari padanan SEMUA kapal aktif di tabel `cost_agent_vessels` (`fetchCostAgentVessels`, bukan
  hanya yang dipakai invoice; bukan `master_vessel` = Reporting) yang belum terpetakan (dibuang bila ada di `list_map` status mapped) ke Ascend. Database Ascend per PT = `ascend_db` dari baris
  list_map; PT tanpa baris memakai `AS_<kode>` hanya bila ada di `ASCEND_DATABASES` (`ascendApi.ts`); kapal tanpa PT dilewati. Pencarian (`candidatesForMaster` -> `fn_cost_agent_finance_pick`, 3 paralel) lalu menampilkan REVIEW; tidak ada yang disimpan sebelum Save. Baris `auto` dicentang otomatis,
  `ambiguous` dipilih user dari daftar kandidat, `none` dilewati. Yang dicentang disimpan lewat `fn_cost_agent_finance_save_map(..., 'user')` = Manual/terkunci
  ke `cost_agent_finance_vessel_map` (keputusan user); baris yang sudah Manual dilaporkan "skipped". Kapal di PT tanpa `ascend_db` dilewati (jumlahnya ditampilkan). Tanpa SQL baru.
- **Nama database Ascend** = kolom `ascend_db` dari server (`AS_` + kode PT, prefix di setting `ascend_db_prefix`) -- JANGAN dihitung di frontend. Baris jenis biaya JUGA membawa `ascend_db` (sejak SQL 085), jadi segmen
  Cost items tidak punya dropdown database -- hanya teks kecil "Ascend database: AS_XXX" di toolbar.
- **Jenis biaya SELALU per PT (SQL 086, keputusan user 2026-10-28): ID expense type di Ascend BERBEDA di tiap PT (database).** Tidak ada lagi pemetaan "semua PT" (baris lama dihapus oleh SQL 086, dicatat di `cost_agent_master_log`;
  `cost_agent_finance_expense_map.company_code` NOT NULL; setting `finance_reference_company` dibuang). `fn_cost_agent_finance_list_map('expense', ...)` mewajibkan `p_company` (error "Company is required for cost items") dan
  tiap baris membawa `company_code`, `ascend_db`, `mapped_in` (array kode PT yang sudah dipetakan utk jenis biaya itu); `save_map` mewajibkan PT utk semua jenis. UI segmen Cost items: filter Company WAJIB (tanpa "All companies";
  bawaan = PT terakhir yang dipakai [localStorage `finance-mapping-company`] atau PT pertama), kolom "Mapped in" (chip kode PT, PT yang sedang dilihat ungu), "Auto-map missing" utk PT terpilih, dan **"Auto-map all companies"**
  (tiap PT berurutan, database tiap PT berbeda; progress per PT + Stop; ringkasan per PT mis. "WNS: 30 mapped, 4 need your choice"; teks cari diabaikan). Dialog Map to Ascend, kartu invoice dan "Resolve" memakai PT invoice/PT terpilih.
  `fn_cost_agent_finance_check` & `fn_cost_agent_apnote_preview` hanya membaca pemetaan PT invoice; pesan error preview "... is not mapped to an Ascend expense type" ditampilkan frontend sebagai `... is not mapped for <PT>`
  (penggantian teks di `CostAgentApNotePreviewModal.tsx issueText`; hilang sendiri bila pesan SQL kelak diubah). ApNote Type per office sekarang MEDAN = MDN, JAKARTA = JKT (setting `apnote_type_by_office`).
- **Auto vs Manual.** "Auto-map missing" (seluruh baris Missing pada filter yang tampil, bukan hanya halaman ini; maks 3 permintaan bersamaan; ada Stop) memanggil
  `fn_cost_agent_finance_pick`; HANYA bila `decision='auto'` (tepat satu kandidat paling yakin) disimpan dgn `source='auto'`. `ambiguous`/`none` dibiarkan Missing.
  Pilihan user lewat dialog "Map to Ascend" disimpan `source='user'` + `is_locked` (ikon gembok, "Manual") dan TIDAK ditimpa Auto-map (RPC mengembalikan
  `saved=false, reason='locked'`). Remove (konfirmasi) = `fn_cost_agent_finance_delete_map`. Cost items: kolom "AP Note name" (alias, `fn_cost_agent_set_finance_alias`,
  disimpan saat keluar dari kolom, kosong = nama jenis biaya) dipakai di deskripsi AP Note dan sebagai kunci pencocokan nama.
- **Pencarian kandidat** (`ascendApi.ts masterFilters`; hasil digabung & dedup per id, lalu `fn_cost_agent_finance_pick` memutuskan -- pencocokan NPWP dilakukan di database): selalu `Disabled eq false` + `contains(...)` (BUKAN `$search`).
  Supplier: NPWP bila vendor punya (kirim DIGIT saja; NPWP Ascend berformat titik/strip -> hasil kosong itu NORMAL, bukan error) + SATU kata paling khas dari nama vendor (badan usaha PT/CV/UD/... dan kata umum seperti INDONESIA/TRANSPORT dibuang, ambil terpanjang);
  Kapal: seluruh nama tanpa awalan MV/MT/TB (`contains(InventoryUserName, nama)`); Jenis biaya: AP Note name (`finance_alias`) lebih dulu, lalu nama jenis biaya. Dialog "Map to Ascend" memakai pencarian master yang sama selama kotak cari belum diubah user
  (setelah diketik: kata-kata yang diketik, semuanya harus ada; kapal = seluruh teks; NPWP = digit). Kartu invoice mengambil alias semua jenis biaya dgn 1 panggilan `list_map('expense')` saat "Resolve".
- **Izin (tanpa page_key baru).** Tab hub = halaman `cost_agent_approval_matrix` (baca = akses halaman; tombol hanya bila `ctx.editable`). RPC memakai `fn_cost_agent_feature_key()`:
  `apnote` -> `cost_agent_invoice` (pick/save_map/check/apply/override), `master` -> `cost_agent_approval_matrix` (list_map/delete_map/pajak/alias). Jadi menyimpan pemetaan di hub
  butuh edit di KEDUA halaman; pesan database ditampilkan apa adanya lewat toast. Tahap 2 (role maker/checker) cukup mengubah fungsi itu.
- **Kartu "Finance mapping" (tab Payments modal review invoice, `CostAgentFinanceMappingCard.tsx`)**: `fn_cost_agent_finance_check` -> database Ascend, supplier, kapal, tiap jenis
  biaya (Mapped/Missing), baris tanpa jenis biaya, "Ready for AP Note". **Informasi saja -- TIDAK memblokir verifikasi/approval.** Tombol "Resolve" (butuh edit invoice): auto-map hanya
  item invoice ini, sisanya dialog "Map to Ascend" satu per satu (Skip = lewati).
- **Proxy lean dibatasi utk user yang HANYA punya `cost_agent_invoice`** (supaya kartu bisa mencari tanpa membuka tab Ascend): `server/routes/lean.ts` menambah
  `cost_agent_invoice` ke aturan akses `/odata`, lalu `server/leanPolicy.ts` memaksa -- hanya `AP_Suppliers`, `IC_InventoryUsers_Fleet`, `FI_ExpenseTypes_Account` (tanpa bentuk key);
  `$select` WAJIB dan hanya kolom aman di atas; parameter hanya `database,$select,$filter,$orderby,$top(<=200),$skip,$count` (`$search`, `$metadata`, `$expand`, dll ditolak, parameter ganda ditolak);
  `$filter`/`$orderby` hanya boleh menyebut kolom aman + kata kunci OData (`eq ne gt ge lt le and or not contains startswith endswith tolower toupper trim length true false null asc desc`;
  isi string literal diabaikan, karakter `/ $ @` ditolak); `database` wajib `^AS_[A-Z0-9]{2,12}$`. Query yang DITERUSKAN ke lean-api disusun ulang dari parameter yang lolos (bukan string mentah).
  Alasan: AP_Suppliers memuat kolom bank/KTP dan proxy meneruskan query apa adanya. Noon Report tetap tertutup bagi mereka. User dgn `cost_agent_approval_matrix`/`cost_agent_voyage`/Admin
  tidak berubah. Tes: `npm test` (`server/leanPolicy.test.ts`, 11 kasus: kolom bank di $select, $search, $filter ke kolom bank, entity lain, database salah, dll).
- **File**: `settings/FinanceMappingTab.tsx`, `settings/MapToAscendDialog.tsx`, `settings/financeApi.ts` (tipe + RPC + mesin auto-map), `settings/ascendApi.ts`, `settings/TaxRulesTab.tsx`,
  `components/CostAgentFinanceMappingCard.tsx`; tab didaftarkan di `CostAgentApprovalMatrixPage.tsx` (`finance-mapping`, `tax-rules`).
- Bila Ascend tidak terjangkau (jaringan / 502-504): dialog menampilkan "Ascend is not reachable"; tabel tetap bisa dipakai.

## Tax rules (aturan PPN / PPh) -- tab hub (2026-10-28, SQL 084)

- Tabel `cost_agent_tax_rules` (RLS baca `cost_agent_invoice`, tulis hanya lewat RPC). Kolom: `cost_item_id` / `vendor_id` / `company_code` (NULL = berlaku untuk semua), `ppn_applicable` + `ppn_rate`,
  `pph_type` + `pph_rate`, `effective_from`, `is_active`, `note`. Syarat: isi PPN (ya/tidak) ATAU tarif PPh. **Tarif disimpan PECAHAN (11% = 0.11)**; UI menampilkan & menerima persen
  (`fracToPct` / `pctToFrac`). PPN "applicable" tanpa tarif -> tarif default setting `default_ppn_rate` (0.11); PPN "not applicable" -> tarif 0. Jenis PPh wajib bila ada tarif (mis. PPH23).
- Urutan kekhususan saat aturan dipakai (`fn_cost_agent_tax_rule_for`): vendor+jenis biaya > jenis biaya > vendor > umum; lalu PT khusus; lalu `effective_from` terbaru.
- Tab "Tax rules": tabel + drawer tambah/ubah (combobox jenis biaya & vendor, pilihan PT, PPN, PPh, mulai berlaku, aktif, catatan) + hapus (konfirmasi). Bentrok cakupan+tanggal yang sama = pesan 23505 dari DB.
  Catatan di layar: aturan disalin ke baris invoice saat invoice diverifikasi; mengubah aturan tidak mengubah invoice lama.
- **BELUM dipakai UI**: `fn_cost_agent_apply_tax_rules(invoice)` (hitung pajak baris dari aturan; baris `tax_source='manual'` tidak disentuh) dan `fn_cost_agent_override_line_tax` (ubah manual, wajib alasan)
  -- ada di database & whitelist, dihubungkan ke alur verifikasi di tahap berikutnya. Anggapan: `amount` baris = nilai sebelum pajak (DPP).

## AP Note preview (pratinjau format Excel finance) -- kartu Finance mapping (2026-10-28, permintaan user; SQL `085_cost_agent_apnote_preview.sql` SUDAH DIJALANKAN, RPC-nya terbaca di production)

- Tombol **Preview AP Note** di kartu Finance mapping (tab Payments, semua status invoice) -> modal `CostAgentApNotePreviewModal.tsx`. **Hanya baca**: tidak mengubah data dan tidak memanggil Ascend.
  RPC `fn_cost_agent_apnote_preview(p_invoice_id)` (sudah di `server/db/whitelist.ts`) mengembalikan `header`, `columns` (17 nama kolom, urutan final), `rows` (17 kolom + field internal berawalan `_`:
  `_line_id`, `_line_no`, `_expense_type_id`, `_vessel_id`, `_supplier_id`, `_ppn_amount`, `_pph_amount`), `totals`, `issues`, `errors`, `warnings`, `can_send` (= invoice berstatus approved dan tanpa error).
- **Error (merah) = memblokir pengiriman**: company / nomor invoice / tanggal kosong, vendor atau kapal belum cocok atau belum dipetakan ke Ascend, office kapal kosong atau ApNote type office itu belum diisi
  (setting `apnote_type_by_office`), baris tanpa jenis biaya, jenis biaya belum dipetakan ke expense type, pajak (PPN/PPh) baris belum dihitung, invoice tanpa baris.
  **Warning (kuning) = peringatan saja**: tidak ada nomor faktur pajak (FPNo kosong), Remarks kosong, jenis biaya tanpa AP Note name (dipakai nama jenis biaya), nominal baris nol/negatif, grand total invoice
  beda dgn baris+PPN dan baris+PPN-PPh, invoice sudah journal/paid. Item ber-`line_no` punya tautan "Go to line N" (tutup modal -> tab Lines -> gulir ke baris itu, lewat `data-line-id`). Errors = 0 -> "Ready" hijau.
- **Excel** (`utils/ApNoteExcel.ts`, exceljs yang sudah ada, dimuat saat tombol ditekan): satu sheet "Sheet1", baris 1 = 17 nama kolom PERSIS urutan `columns`, satu baris per biaya (nilai header diulang),
  tanpa field `_`. Tanggal = tanggal Excel (dd/mm/yyyy, dibuat UTC supaya tidak bergeser), Exchange Rate / PPN Rate / PPh Rate / Qty / Unit Price = angka (tarif apa adanya dari RPC = PECAHAN mis. 0.11;
  layar menampilkan persen), sel kosong dibiarkan kosong. **JTO selalu kosong** (due date sengaja dikosongkan). **AccountCode & CostCentre sengaja KOSONG** sampai tahap kirim (dibuat saat AP Note dikirim,
  ditarik dari ID expense type / ID kapal Ascend -- ID-nya sudah ada di `_expense_type_id` / `_vessel_id`). Nama file `APNote_<Reference>_<Vessel>.xlsx` (karakter terlarang -> "_").
  Tombol aktif walau ada error, dgn peringatan "This file is incomplete".
- **Send to Ascend**: tampil tapi NONAKTIF (tooltip "Waiting for the Ascend AP Note endpoint"); tidak ada panggilan apa pun sampai endpoint tersedia.
- Perubahan 085 di Finance mapping: baris jenis biaya membawa `ascend_db` (lihat bagian Finance mapping di atas) dan pencarian kandidat ke Ascend diubah (NPWP digit + kata khas, nama kapal, alias lalu nama biaya).

## AP Note draft (2026-10-30, permintaan user; SQL `104_cost_agent_apnote_draft.sql` BELUM DIJALANKAN -- file lokal `sql/`)

- Tabel penampung `cost_agent_apnote_drafts` + `cost_agent_apnote_draft_lines` (1 draft aktif per invoice, unique index parsial; status draft|posting|posted|failed|cancelled). **CRUD murni dari frontend**
  (`utils/CostAgentApNoteDraft.ts`, supabase-js + RLS, TANPA RPC; keduanya di `server/db/whitelist.ts`). Baca = `has_page_access('cost_agent_invoice')`; tulis = `has_edit_access('cost_agent_payment')` & hanya saat status draft/failed.
- Kartu `CostAgentApNoteDraftCard.tsx` di tab Payments (di bawah Finance mapping): invoice `approved` + `canPay` -> draft terbentuk OTOMATIS saat tab dibuka (sekali per invoice), isinya dari `fn_cost_agent_apnote_preview` (RPC lama, hanya baca).
  Edit: FPNo, Remarks, deskripsi/qty/harga baris, "Rebuild from invoice" (ganti seluruh isi; dipakai setelah mapping/pajak berubah). Error/warning = snapshot saat build.
- Isu error/warning dipetakan ke sel penyebabnya (`issueField()` di kartu, lewat kata kunci pesan RPC; tanpa kecocokan -> kotak "Other"). Sel merah Supplier / Vessel / Expense type yang "not mapped" punya tautan
  **Map to Ascend** -> `MapToAscendDialog` untuk satu target (`finCheck` dulu utk ambil id master), lalu `syncApNoteDraftMapping` (header tanpa FPNo/Remarks, isu, expense type & pajak per baris; edit deskripsi/qty/harga TIDAK ditimpa).
- **Baris draft TIDAK bisa dihapus**: 1 invoice = 1 AP Note utuh (semua baris invoice ikut). PPN/PPh kosong dianggap 0% di draft (isu "tax is not set" turun jadi warning).
- **Post to Ascend NONAKTIF** (endpoint server -> lean-api `POST /v1/ap-notes` belum dibuat). Validasi sisi server tetap wajib saat endpoint dibuat (RLS tidak memvalidasi isi).

## Document gate and auto-verify (Tahap 2a, 2026-10-28, permintaan user; SQL `087_cost_agent_doc_gate_autoverify.sql` SUDAH DIJALANKAN, 3 RPC terbaca di production)

Aturan baru di DATABASE (UI hanya menampilkan & mencegah klik yang pasti ditolak): **Verify satu baris DAN Submit for approval DITOLAK bila dokumen belum lengkap.** Pesan error SELALU diawali `DOC_GATE:`
(mis. `DOC_GATE: documents are not complete (3 issues). Line 8: no matching attachment; ...`). **Membatalkan verifikasi (is_verified=false) tetap boleh.** Nama & argumen `fn_cost_agent_verify_line` / `fn_cost_agent_submit_for_approval` tidak berubah.

- **Yang diperiksa gerbang**: dokumen sudah dibaca (`not_analysed`); tiap baris cocok dengan lampiran (`attachment_missing` / `attachment_diff` / `attachment_line_missing`; jenis biaya AGENCY_FEE & MATERAI boleh tanpa lampiran);
  bila ada PPN: faktur pajak ada (`fp_missing`) dan baris kena-PPN ada di FP (`line_not_in_fp`, Materai dikecualikan), tanpa selisih (merah) di header/total pajak/tarif (`tax_line_diff`, `tax_total_diff`, `tax_rate_diff`, `header_diff`,
  `invoice_date_diff`); tanggal dokumen pelabuhan (nota, PNBP, pranota) berada DALAM periode invoice (tiba-berangkat, toleransi 2 hari) (`date_out_of_period`); periode invoice terisi (`period_missing`); periode voyage report dibanding
  periode invoice saja (`voyage_period_diff`, `voyage_missing` bila `gate_voyage_required`). Warning (tidak memblokir): `orphan_attachment`, `date_warn`, `voyage_not_linked`.
- **Periode invoice** = tiba - berangkat. Sumber berurutan (`period.source`): `invoice` (kolom periode invoice, dari header atau diisi manual) -> `invoice_document` (tanggal tiba/berangkat tercetak di dokumen invoice) -> `service_date` (tanggal kegiatan bila beda dari tanggal invoice).
- **Auto-verify**: baris yang cocok history kuat (kapal + pelabuhan sama, nilai <= pembanding), jenis biaya dikenali pasti (match_method bukan tebakan keyword) dan dokumen lengkap otomatis `verified_by='system'` (dicatat di Timeline). Submit tetap dilakukan manusia; maker boleh Unverify.
- **3 RPC baru** (sudah di `server/db/whitelist.ts`; helper & tipe di `src/utils/CostAgentGate.ts`):
  `fn_cost_agent_get_doc_gate(p_invoice_id)` -> `{enabled, complete, blockers[], warnings[], period{from,to,source}, voyage{arrived,departed}, tolerance_days, counts}` (hanya baca; item = `{code, label, detail, line_no?, doc_type?, doc_no?}`);
  `fn_cost_agent_run_checks(p_invoice_id)` -> `{invoice_id, status, gate, auto_verify{verified, reason}, lines{total,verified}, ready_to_submit}` (auto-verify lalu gerbang; butuh hak EDIT; aman diulang);
  `fn_cost_agent_set_invoice_period(p_invoice_id, p_from, p_to, p_actor)` -> `{from,to,source}` (dua tanggal terisi atau dua-duanya kosong = hapus; hanya status verification/rejected/failed).
- **UI** (`CostAgentDocGate.tsx`, dipasang di `CostAgentInvoiceReviewModal.tsx`):
  - `run_checks` dipanggil SEKALI saat detail dibuka (invoice verification/rejected + hak edit; selain itu `get_doc_gate`), lalu hanya lewat tombol **Re-check**, setelah dokumen susulan/analisis ulang selesai, dan setelah periode diubah.
    Aksi baris biasa (Verify / Unverify / edit) hanya memuat ulang gerbang (BACA SAJA) -- JANGAN memanggil `run_checks` di sana: baris yang baru di-Unverify akan langsung diverifikasi ulang sistem.
  - Banner di atas tab Cost lines dan Documents & Tax (hanya invoice verification/rejected): hijau "Documents complete" (+ jumlah warning yang bisa dibuka) atau merah "Documents incomplete - N issues" dengan daftar blocker; `line_no` -> "Go to line N" (pindah ke tab Cost lines + gulir ke baris);
    kode dokumen -> "Open Documents & Tax"; `period_missing` -> "Set period". Toast "N lines auto-verified" bila `auto_verify.verified > 0`.
  - Verify per baris dan "Verify all matching" nonaktif selama gerbang belum lengkap (tooltip = blocker pertama); **Submit for approval** nonaktif bila gerbang tidak lengkap ("Documents incomplete") atau ada baris belum verified ("N lines not verified"). Gerbang yang belum termuat TIDAK memblokir di klien (server tetap menolak).
    Error berawalan `DOC_GATE:` dari server -> toast singkat + muat ulang gerbang (teks mentah tidak ditampilkan).
  - Baris auto-verified: badge kecil "Auto" (tooltip "Auto-verified: documents complete and amount not above history").
  - Header: "Period: 08 Mar 2026 - 14 Mar 2026" + pensil (dua date picker Arrival/Departure, Save/Clear -> `set_invoice_period` lalu `run_checks`); kosong = chip kuning "Period: not set"; tooltip = sumber periode. Pensil hanya utk status verification/rejected/failed + hak edit.
  - Tab Documents & Tax: kartu "Period check" (periode invoice, periode voyage report / "not linked", toleransi) di atas tampilan perbandingan yang sudah ada.
- **Setting** (tabel `cost_agent_settings`): `gate_enabled`, `gate_attachment_exempt_items`, `gate_fp_exempt_items`, `gate_period_doc_types`, `gate_period_tolerance_days`, `gate_period_required`, `gate_voyage_required`, `auto_verify_enabled`,
  `auto_verify_match_methods`, `auto_verify_levels`. **Belum ada layar untuk mengubahnya**: hub Cost Agent Settings tidak punya tab Settings umum dan tidak ada RPC tulis setting (hanya `fn_cost_agent_setting_num/bool/arr` utk baca di SQL), jadi diubah lewat SQL Editor
  sampai ada RPC tulisnya (butuh SQL baru -> nomor 088).

## Roles, parallel validation and approval (Tahap 2b, 2026-10-28, permintaan user; SQL `088_cost_agent_roles_parallel_validation.sql` SUDAH DIJALANKAN, 9 RPC baru terbaca di production)

**Role = kunci akses fitur** (bukan halaman): `cost_agent_maker`, `cost_agent_checker`, `cost_agent_approver`, `cost_agent_apnote`, `cost_agent_treasury`; master tetap `cost_agent_approval_matrix`. Didaftarkan di `src/lib/permissions.ts` (`PAGE_REGISTRY`,
`parent: 'Agency Invoices'`, tanpa path = TIDAK ada route/menu baru, pola `cost_agent_payment`; `ACCESS_MATRIX_ORDER` ikut) dengan label "Cost Agent - Maker/Checker/Approver/AP Note/Treasury", dibagikan di layar Kelola Role & Akses -- beri hak **EDIT**
(server memeriksa `has_edit_access`). Selama setting `roles_strict` = false (bawaan) pemegang hak edit `cost_agent_invoice` yang lama tetap boleh semua; `true` = hanya pemegang kunci role.

**Urutan pengaktifan (lae):** (1) jalankan SQL 088 + pasang UI ini; (2) beri kunci Maker/Checker/Approver ke orang yang tepat (satu orang boleh banyak kunci, SoD tetap berlaku per invoice); (3) setelah semua punya kunci, ubah `roles_strict` = true di tab Settings.

- **Jalur paralel**: Submit membuka DUA jalur bersamaan -- validasi checker dan approval sesuai matriks (urutan bebas). Invoice baru `approved` bila keduanya selesai (`fn_cost_agent_finalize_approval`). Invoice yang menunggu approval sebelum 088 (tanpa baris validasi) berjalan seperti dulu.
  Tabel `cost_agent_validations` (satu baris per putaran: pending/validated/returned/skipped, snapshot total saat submit). Setting `validation_required` (bawaan true).
- **Pemisahan tugas** (setting `sod_enforced`, bawaan true): yang men-submit tidak boleh memvalidasi/meng-approve; checker tidak boleh sekaligus approver. Error diawali **`SoD:`** (UI: toast dengan pesan server apa adanya).
- **Checker boleh**: ganti jenis biaya (`fn_cost_agent_checker_set_cost_item`), split baris (`fn_cost_agent_split_line`, status waiting_approval, bagian tetap verified), ubah pajak (`fn_cost_agent_override_line_tax`), **Validate** atau **Return to maker** (alasan wajib; status `rejected`, approval yang menunggu dibatalkan).
  Bila total invoice berubah setelah submit, Validate ditolak dengan **`TOTAL_CHANGED:`** (UI: dialog "The total changed after submit. Return the invoice to the maker so approvals restart." + tombol Return). `DOC_GATE:` pada Validate -> toast + muat ulang gerbang.
- **Split** (maker saat verification/rejected -- bagian harus di-Verify ulang; checker saat waiting_approval): 2..20 bagian `[{description, amount, cost_item_id?}]`, jumlah bagian HARUS = nilai baris asal (total invoice tidak berubah). Dialog "Split line": Add part, indikator "Parts total X of Y" hijau bila sama, Save nonaktif sampai sama.
- **Void** (status `cancelled`) utk invoice failed / verification / rejected / waiting_approval, alasan wajib (`fn_cost_agent_void_invoice`; approval & validasi yang menunggu di-skip).
- **9 RPC baru** (sudah di `server/db/whitelist.ts`; helper & tipe `src/utils/CostAgentWorkflow.ts`): `fn_cost_agent_get_workflow(p_invoice_id)` -> `{status, round, submitted_by/at, approved_at, validation{status,by,at,note}|null, approvals[{step,label,emails,decision,decided_by,decided_at,note}],
  current_step, me{email, can_verify, can_validate, can_approve, blocked_reason}}` (baca saja; **tombol aksi MENGIKUTI `me.can_*`**, `blocked_reason` = tooltip/penjelasan); `fn_cost_agent_my_tasks(p_limit)` -> `[{task: verify|validate|approve, invoice_id, invoice_no, company, vendor, vessel, amount, status, since, open_lines}]`;
  `fn_cost_agent_checker_validate(p_invoice_id, p_note)`, `fn_cost_agent_checker_set_cost_item(p_line_id, p_cost_item_id, p_learn_alias)`, `fn_cost_agent_split_line(p_line_id, p_parts)`, `fn_cost_agent_void_invoice(p_invoice_id, p_reason)`,
  `fn_cost_agent_list_settings()` -> `[{key, value, type, group, updated_at}]`, `fn_cost_agent_save_setting(p_key, p_value)` (hak master; tipe harus sama dengan nilai lama; angka >= 0; array = daftar teks; `apnote_type_by_office` hanya MEDAN/JAKARTA). Semua RPC juga punya `p_actor` opsional (tidak dikirim UI selain yang sudah ada).
- **UI**: `CostAgentWorkflow.tsx` (hook `useInvoiceWorkflow`, `WorkflowStepper`, `CheckerPanel`, `ReasonDialog`), `CostAgentLineDialogs.tsx` (`SplitLineDialog`, `LineTaxDialog`), `CostAgentInvoiceReviewModal.tsx`, `CostAgentApprovalPanel.tsx`, `CostAgentInvoiceLines.tsx`.
  - **Stepper** di atas tab Approval (status selain processing/failed/verification): Maker -> dua jalur sejajar [Checker validation] dan [Approval 1 > Approval 2 > ...] -> Approved; tiap kotak = status, siapa, kapan, note. Banner "All approvals done - waiting for checker validation" / "Validated - waiting for approvals". Dimuat ulang setiap `reload()` modal.
  - **Tombol**: Validate / Return to maker (panel Checker di tab Approval, hanya `me.can_validate`); Approve / Reject (`me.can_approve`); Verify / Submit / koreksi header / unggah susulan = `me.can_verify` (sebelum alur termuat atau status lain: hak edit lama); **Void invoice** di footer (alasan wajib; server memeriksa role maker).
    Mode checker di tab Cost lines (`checkerMode` = waiting_approval + `can_validate`): pemilih jenis biaya aktif (`checker_set_cost_item`), tombol Split dan Tax per baris. Banner gerbang dokumen juga tampil utk checker.
  - **Dialog pajak baris** ("Tax"): BARU dibuat di sini (sebelumnya belum ada UI utk `override_line_tax`): PPN %, jenis & tarif PPh %, alasan wajib; tarif dikirim pecahan.
  - **My tasks** (tab di hub Cost Agent Settings, badge jumlah, dimuat ulang saat tab browser kembali aktif): "To verify" (dgn jumlah baris belum verified), "To validate", "To approve"; klik invoice membuka detailnya.
  - **Tab Settings** (hak master): `list_settings` per `group`; boolean = switch (langsung simpan), angka >= 0, array = chip, string, object (JSON / MEDAN & JAKARTA); catatan khusus `roles_strict`; key tidak bisa ditambah/dihapus; perubahan tampil di "Recent changes" (master log entity `setting`).
- **Catatan celah (SQL, bukan UI)**: `fn_cost_agent_override_line_tax` (084) dan RPC Finance mapping / AP Note preview memakai `fn_cost_agent_feature_key('apnote')`, yang saat `roles_strict` = true menjadi kunci `cost_agent_apnote` -- jadi checker TANPA kunci AP Note akan ditolak saat mengubah pajak, dan
  kartu Finance mapping / AP Note preview hanya terbuka bagi pemegang kunci AP Note. Bila itu bukan maksudnya, ubah di SQL berikutnya (089), bukan di UI.

## Approval Matrix v2 (mode "semua setuju", pengganti, urutan, Director, pratinjau, pengingat) (Tahap 2b lanjutan, 2026-10-28, permintaan user; SQL `090_cost_agent_approval_matrix_v2.sql` SUDAH DIJALANKAN, 7 RPC baru terbaca di production)

Semua aturan ada di DATABASE (UI tidak mengulang logika approval). Prasyarat 084-089. Nomor SQL berikutnya = 091.

- **Mode langkah** (`cost_agent_approval_matrix.approval_mode`, disalin ke `cost_agent_approvals` saat submit): `any` (bawaan; salah satu email di daftar cukup) atau `all` (SEMUA email harus setuju; satu penolakan tetap membatalkan). Suara tercatat di `votes`
  `[{by, for, decision, at, note}]`. `decide_approval` pada langkah `all` yang belum lengkap mengembalikan `{status:'waiting_approval', step, votes, of, remaining[]}` (bukan error) -> toast "1 of 2 approved". Nama level = `approver_label` (form: "Level name"). Matriks tetap dikelola langsung ke tabel (RLS, hak edit master), kolom baru `approval_mode`.
- **Urutan**: `fn_cost_agent_reorder_matrix(p_ids)` -- id baris dari SATU aturan (PT, vendor, office, rentang nilai sama) dalam urutan baru -> `step_no` 1..n (2..10 langkah). UI (`MatrixTab.tsx`): aturan dikelompokkan per kelompok itu, langkah berurutan dengan tombol naik/turun; field "Step" di form tetap ada.
- **Pengganti (delegasi)**: tabel `cost_agent_approval_delegations`; approver menunjuk satu orang utk periode tertentu (maks 1 tahun). Pengganti boleh Approve/Reject langkah itu, tercatat "substitute for <email>" (SoD tetap berlaku bagi pengganti). `fn_cost_agent_list_delegations(p_only_active)`
  (master melihat semua; approver hanya miliknya sbg from/to), `fn_cost_agent_save_delegation(p_id, p_from, p_to, p_valid_from, p_valid_to, p_reason)` (approver hanya utk dirinya; master siapa saja), `fn_cost_agent_delete_delegation(p_id)`. UI: kartu "Substitutes" di tab Approval Matrix
  (From, Substitute, Valid from/to, Reason, badge "Active now", Add/Delete). `get_workflow.me.acting_for` = email yang digantikan -> banner "You are approving on behalf of <email>" di kartu Decision; `my_tasks[].acting_for` -> chip "for <email>" di My tasks.
- **Teruskan ke Director**: approver langkah TERAKHIR boleh `fn_cost_agent_forward_approval(p_invoice_id, p_note)` -- langkahnya disetujui dan langkah baru "Director" (`is_forwarded`, penerima = setting `director_emails`) ditambahkan, SEKALI saja. Tombol "Forward to Director" (di samping Approve) hanya bila `me.can_forward`;
  dialog catatan opsional "You approve this step and the Director gets the final approval." Langkah Director diberi badge "Director" di stepper.
- **Pratinjau & simulasi**: `fn_cost_agent_approval_preview(p_invoice_id)` dan `fn_cost_agent_simulate_matrix(p_company, p_vendor_id, p_amount, p_office)` -> `{matched, steps[{step, label, emails, mode, substitutes[{for, substitute, until}], missing_emails}], validation, sod, director_forward, reason?}`.
  Detail invoice (verification/rejected): kartu "Approval route" (`CostAgentApprovalRoute.tsx`, ringkas satu baris, bisa dibuka); `matched=false` -> alasan dari database tampil dan **Submit nonaktif** (tooltip = alasan). Tab Approval Matrix: kartu "Simulate" memakai RPC simulasi (level, mode, email, pengganti aktif; tidak cocok = alasan berwarna peringatan).
- **Stepper** (`CostAgentWorkflow.tsx`): langkah mode `all` menampilkan "n of N approved" + chip per email (hijau bila sudah; ikon pengganti bila disetujui pengganti); langkah aktif menampilkan "waiting N days" (`current_step.waiting_days`) dan berubah oranye bila >= setting `reminder_after_days`
  (dibaca lewat `list_settings` = hak baca master; bila tak terbaca dipakai 3). `get_workflow` kini membawa `approvals[].mode/votes/is_director`, `current_step.mode/votes/since/waiting_days`, `me.can_forward/acting_for`.
- **Pengingat otomatis = n8n, BUKAN UI**: `fn_cost_agent_due_reminders()` dan `fn_cost_agent_mark_reminded(...)` KHUSUS service role (tidak dapat dipanggil `authenticated`) dan SENGAJA tidak ada di `server/db/whitelist.ts`. UI hanya menampilkan "waiting N days". Setting grup "Approval reminders & Director": `reminder_enabled`, `reminder_after_days`,
  `reminder_repeat_days`, `director_forward_enabled`, `director_emails`, `checker_emails` (tab Settings; array email = chip email dengan validasi format di klien dan di server).
- **Error**: `SoD:` -> toast pesan server apa adanya; "The approval of ... is already recorded for this step" -> toast peringatan; `DOC_GATE:` / `TOTAL_CHANGED:` seperti sebelumnya.
- **7 RPC baru di whitelist**: `fn_cost_agent_reorder_matrix`, `_save_delegation`, `_delete_delegation`, `_list_delegations`, `_approval_preview`, `_simulate_matrix`, `_forward_approval`. Helper & tipe: `src/utils/CostAgentWorkflow.ts`.

## Invoice list v2 -- kartu + stepper, filter & urut berlevel, My tasks, "Needs attention" (Tahap 3a, 2026-10-28, permintaan user; SQL `091_cost_agent_invoice_cards.sql` SUDAH DIJALANKAN, 2 RPC terbaca di production)

Halaman daftar Agency Invoices (`/cost-agent/invoice/:id?`, `CostAgentInvoicePage.tsx`) diganti total tampilannya (route, menu, permissions TIDAK berubah). **Semua data & aturan dari database**: klien tidak menghitung status, stepper, temuan, atau tugas, dan tidak membaca tabel invoice
langsung utk daftar. Rincian di SQL 091: `fn_cost_agent_invoice_cards(p_params)`, `fn_cost_agent_invoice_attention(p_invoice_id)` (keduanya di `server/db/whitelist.ts`); `get_workflow` kini juga membawa `current_step.reminder_after_days`.

- **`fn_cost_agent_invoice_cards(p_params)`** -> `{total, limit, offset, items[], status_counts{bucket:n}, my_count}`. `p_params`: `q` (nomor invoice, vendor, kapal, port, nomor VOY), `company`, `status` (`all|verify|returned|review|approved|journal|paid|void|processing|failed`), `my` (bool),
  `rules:[{f,v}]` (`vendor|vessel|port` id; `voytype` L|D|LD|none; `fp` has|none; `issue` unmap|var|mis; `from|to` tanggal invoice yyyy-mm-dd; `min|max` nilai invoice, angka murni), `sorts:[{f,dir}]` (`date|pay|vendor|vessel|port|status`, level pertama paling utama), `limit` (10|20|50; bawaan 20, maks 100), `offset`,
  `include_gate` (bawaan true), `include_void` (bawaan false: status `all` menyembunyikan void). Bucket: verification=`verify`, rejected=`returned`, waiting_approval=`review`, cancelled=`void`, selain itu = nama statusnya (`approved` = "Waiting for payment", `journal` = "Posted").
  Satu item = identitas + vendor/vessel/port/voyage{id,no,type L|D|LD|O|none} + `amounts` + `lines{total,verified,unmapped,need_check}` + `has_fp` + `approvals` + `validation` + `task{kinds[verify|validate|approve], acting_for}` + `stages[4]` + `findings`/`findings_red` + `gate` + `current_step{step,label,waiting_days,reminder_after_days}`.
  Pesan error RPC (Inggris, mis. "Invalid value for filter from") tampil apa adanya sebagai toast (+ kartu error kecil dengan Retry).
- **`stages` (stepper 4 tahap)**: Completed (dokumen lengkap & cocok) | Verified (maker) | Approved (approval + validasi checker) | Paid, masing-masing `{key, label, cls: done|cur|idle|bad, sub}`. UI menampilkan apa adanya: done = hijau + centang, cur = plum berdenyut, idle = abu, bad = merah + silang.
- **`fn_cost_agent_invoice_attention(id)`** -> `[{sev: red|amber, code, title, detail, go: docs|lines|workflow, lines:[line_no]}]` (popover "Needs attention", dimuat saat dibuka). Klik temuan membuka detail invoice di tab `docs` -> Documents & Tax, `lines` -> Cost lines (baris di `lines` digulir & disorot 2,5 dtk), `workflow` -> Approval.
  Modal detail menerima 2 prop baru utk itu (`initialTab`, `focusLines`); selebihnya halaman detail TIDAK diubah.
- **Toolbar** (satu baris): pencarian (debounce 300 ms), Company, Status (dropdown ber-jumlah dari `status_counts`; opsi berjumlah 0 disembunyikan kecuali yang terpilih; "All" tidak menghitung void kecuali "Show void"; teks "n void hidden" -> pilih Void), **My tasks** (badge `my_count`),
  **Filter** (panel berlevel: "IF / AND" + field + nilai; "SORT BY / THEN BY"; Apply / Reset; satu field hanya sekali; nominal diketik dengan pemisah ribuan id-ID dan dikirim angka murni; centang "Show void invoices in All"), pemilih **Card | List** (disimpan di localStorage `beehive_cost_agent_invoice_view`), Refresh, Create AP Note / PV (bucket
  "Waiting for payment", multi-pilih, perilaku lama), Upload invoice (perilaku lama).
- **Query string URL** (`parseListState` / `writeListState` di `src/utils/CostAgentInvoiceCards.ts`): `?q=&co=&st=&my=1&void=1&p=2&size=20&f=vendor:12,fp:has,from:2026-01-01&s=pay:desc,vendor:asc`. Nilai bawaan tidak ditulis; parameter lain (`upload`, `call`) tidak disentuh; mengetik di kotak cari memakai `replace`, perubahan lain `push` (Back bekerja).
  Membuka / menutup detail invoice MEMPERTAHANKAN query string daftar.
- **Kartu** (tata letak diperbarui 2026-10-28: container query -- <768px bertumpuk, >=768px identitas | nilai + stepper di bawah, >=1024px satu baris tiga zona; ikon per tahap stepper & per info; pita "Your turn" jadi pil di baris identitas): nomor invoice, vendor, chip PT, pill status; kapal, port (kode + nama), chip VOY (centang + nomor; "No voyage" abu-abu; tooltip jenis kegiatan), tanggal; nilai `grand_total` (Rp bulat; tooltip "PPh 23 − Rp x" bila `amounts.pph` > 0); stepper; lencana "Needs attention" (merah bila ada temuan merah, kuning bila hanya kuning; tersembunyi bila 0);
  "Waiting N days for <level>" (oranye bila >= `reminder_after_days`, sama untuk semua user); pita "Your turn: Verify / Validate / Approve (for <email>)"; chip "Duplicate?". Seluruh kartu bisa diklik; tombol di dalam kartu menghentikan propagasi. Kartu failed tetap punya Reprocess; Admin tetap punya hapus (masa uji coba).
- **List**: Invoice | Vendor | Vessel | Port | VOY | Date | Amount | Status | Progress (empat titik dari `stages`) | Findings. Klik header Date/Amount/Vendor/Vessel/Port/Status mengurut (mengisi level pertama `sorts`, klik lagi membalik arah).
- **Halaman**: 10 / 20 / 50 (bawaan 20), Prev/Next, "Showing a–b of n"; muat ulang setelah aksi (upload, submit, approve, ...), saat event approval berubah, saat tab browser aktif lagi, dan polling 5 dtk selama ada invoice `processing`. Loading = skeleton kartu; kosong = "No invoices match these filters" + Reset; error = kartu merah + Retry.
- **File**: `src/utils/CostAgentInvoiceCards.ts` (tipe, RPC, kode query string), `src/components/CostAgentInvoiceCardsV2.tsx` (kartu, tabel, stepper, popover), `src/components/CostAgentInvoiceFilterPanel.tsx`. Komponen lama `CostAgentInvoiceCard` (`CostAgentCards.tsx`) dan `fetchCostAgentInvoiceList` tidak dipakai lagi oleh halaman ini.
- `include_gate` selalu dikirim true. Bila halaman 50 kartu terasa lambat, ubah `toCardParams` agar mengirim `include_gate:false` untuk `size = 50` (gerbang dokumen dihitung per kartu di tahap maker).

## Invoice detail v2 (Summary/Detailed) -- tab Cost lines & Documents & Tax (Tahap 3b, 2026-10-28, permintaan user; TANPA SQL baru, nomor SQL berikutnya tetap 092)

Hanya TAMPILAN yang berubah: semua tombol/aksi/pembatasan (Verify, Split, Tax, checker set cost item, Validate/Return, Void, gerbang DOC_GATE, upload susulan, run checks) memakai logika dan RPC yang SAMA, tetap mengikuti `get_workflow.me.can_*` dan error server.
Data: `fn_cost_agent_get_invoice_history` (baris + pembanding), `fn_cost_agent_get_invoice_documents` (doc compare), `fn_cost_agent_get_doc_gate`, `fn_cost_agent_get_workflow`, `fn_cost_agent_invoice_attention`. Tidak ada RPC / whitelist baru.

- **Switch "Summary | Detailed"** di kanan atas kedua tab (`CostAgentInvoiceReviewModal.tsx`). Summary = bawaan. "Detailed" membuka tampilan LAMA (komponen yang sama, tidak diubah) di modal besar sendiri ("Cost lines — detailed" / "Documents & Tax — detailed"; Esc / X menutup, switch kembali ke Summary).
  Esc menutup dialog teratas saja (`useEscClose` di `CostAgentValidationReports.tsx`: listener fase capture + `stopImmediatePropagation`, supaya modal detail invoice tidak ikut tertutup). Kunci localStorage `beehive_cost_agent_invoice_detail_view` hanya menyimpan 'summary' (Detailed selalu kembali ke Summary saat ditutup).
- **Cost lines -- Summary** = `CostAgentInvoiceLines variant="summary"` (komponen & state yang sama dgn Detailed; hanya cara baris digambar yang beda): satu baris per cost line, 4 kolom >= 900px (bertumpuk di bawahnya): INVOICE LINE (no, deskripsi 2 baris + tooltip, Rp bulat, chip jenis biaya / merah "Not mapped";
  pemilih jenis biaya bagi maker dan checker mode), INVOICE VS HISTORY (pill Same / Higher / Lower / No history / New item, History Rp, selisih Rp + persen, ikon "Check" bila `compare_check`), MAIN REFERENCE (label pembanding + tanggal, "View history", "+n more reference", "Browse history" bila tak ada pembanding, remark beraksen),
  ACTION (Verify / Verified toggle + badge "Auto" bila `verified_by='system'`, Remark, Split dan Tax untuk checker mode). Tepi kiri: hijau = verified, kuning = selisih / perlu cek, merah = Not mapped. Atas daftar: "{verified}/{total} verified · {n} need check · {m} not mapped", "Verify all matching (n)" (fungsi lama) dan "Cost validation". Panel dokumen berdampingan = tombol "Show file / Hide file" yang SUDAH ada (terlipat bawaan).
  **Chip "split" TIDAK ada**: data baris tidak punya penanda baris hasil split (tidak ada kolom untuk itu).
- **Popup "Cost validation"** (`CostValidationDialog`, hanya baca + Print): klasifikasi per baris HANYA dari data baris -- `compare_flag='sesuai'` -> OK; `naik`/`turun` + verified -> Accepted (Overcharge / Undercharge); `naik`/`turun` belum verified -> Difference; `tanpa_history` / `item_baru` / tanpa cost item -> N/A (No history / New item / Not mapped).
  Accuracy = (OK + Accepted) / (OK + Accepted + Difference). Tabel Validation | Expected (history) | Actual | Difference | Status; catatan "{n} differences not reviewed by the maker" (kuning) atau "All differences reviewed" (hijau).
- **Documents & Tax -- Summary** (`CostAgentDocsSummary.tsx`): (a) kartu "Documents (x/3)" + pill Completed / Not completed (dari `get_doc_gate.complete`) dgn baris Invoice / Tax invoice / Attachment (nama file atau "Not received", tanggal diterima, View, Upload susulan bila diizinkan seperti Detailed; info FP: nomor, tanggal, chip NPWP dari `header_checks` group tax);
  (b) kartu "Document validation": Check 1 Invoice <-> Attachment (`lines[].attachment` + header_checks bukan tax + kelengkapan lampiran), Check 2 Invoice <-> Master data (vendor / vessel / port / voyage terisi, jumlah baris ber-cost item, `date_checks`), Check 3 Invoice <-> Tax invoice (`lines[].tax` + header_checks tax + `tax_totals.checks` / `rate_checks` + kelengkapan faktur pajak);
  status gabungan OK / Needs review / Mismatch / N/A, "x of y OK", Accuracy (batang plum), switch "Mismatches only", tombol "Open validation report" (laporan Field | Invoice | Tax invoice | Attachment | Master data dgn chip Match / Mismatch / Expired / Not filled + Print);
  status baris: `match*` = OK, `diff` = mismatch, `none` / `no_doc` / `pending` = perlu perhatian, `not_required` / `not_in_fp` = netral (tidak dihitung); (c) kartu "Findings" (`invoice_attention`; klik = ke bagian terkait / baris di Cost lines / tab Approval).
  Di atasnya tetap banner gerbang dokumen (blocker teratas 5 + "and n more") dan kartu "Period check".
- **Print**: aturan `@media print` di `src/index.css` untuk `#cost-validation-print-area` dan `#doc-validation-print-area` (pola `#bunker-print-area`; tombol bertanda `print-hide` disembunyikan). Tanpa library baru.

- **Pembaruan 2026-10-28 (permintaan user, screenshot): banner gerbang dokumen + kartu "Approval route" PINDAH ke lonceng peringatan di header detail invoice** (`AlertsButton` di `CostAgentInvoiceReviewModal.tsx`) -- tidak lagi memakan ruang di tab Cost lines.
  Lencana lonceng = catatan header + jumlah blocker gerbang dokumen + 1 bila rute approval tidak cocok. Isi popover: catatan header (seperti dulu), bagian "Documents" (`DocGateBanner` apa adanya: blocker + tombol Open Documents & Tax / Go to line / Set period / Re-check, warning bisa dibuka) dan bagian "Approval route" (`ApprovalRouteView`).
  Rute tidak cocok tetap menonaktifkan Submit (tooltip = alasan); rute yang cocok tampil sebagai ringkasan satu baris "Route: A → B" di footer sebelum tombol Submit. Banner gerbang di tab Documents & Tax tetap ada (blocker teratas 5). Hook `useApprovalRoute` (`CostAgentApprovalRoute.tsx`) menggantikan kartu di tab.

- **Revisi 2026-10-28 (permintaan user, screenshot "Cost validation"): tab Cost lines -- Summary memakai gaya tabel Cost validation sebagai tampilan utama.** Kolom: Validation (segitiga ▶/▼ + no + deskripsi + jenis biaya) | Expected (history) | Actual | Difference | Status (OK / Accepted + Overcharge/Undercharge / Difference / N/A + alasan, ikon Check bila `compare_check`) | Action
  (Verify/Verified + badge Auto, Remark, Split, Tax -- aksi & aturan tidak berubah). Angka tidak membungkus (`whitespace-nowrap`). **Rincian Main reference dipindah ke panel yang dibuka segitiga di kiri baris** (pembanding utama + tanggal/nilai, View history / Browse history, "+n more reference", Reset to automatic, remark; membuka Remark ikut membuka panel).
  Di atas daftar: chip OK / Accepted / Difference / N/A, Accuracy dan catatan "n differences not reviewed by the maker". Klasifikasi per baris = `classifyCostLine` (`CostAgentValidationReports.tsx`, dipakai juga popup Cost validation yang tetap ada utk Print). Detailed tidak berubah.
- **Perapian kolom tabel Summary (2026-10-28)**: header kolom memakai kotak yang SAMA dgn baris (border + `border-l-4` transparan + `px-3`) supaya kolom persis sejajar; grid 3 tingkat berdasar lebar panel (container query): < 640px bertumpuk, 640-899px dua baris (deskripsi penuh | Expected, Actual, Difference, Status | Action), >= 900px satu baris enam kolom
  (`SUM_GRID`: 1fr | 132 | 116 | 128 | 156 | >=168px); "Expected (history)" tidak membungkus; pensil edit & ikon remark menempel di akhir teks deskripsi.
- **Revisi 2026-10-28 (permintaan user): switch "Summary | Detailed" INLINE, bukan modal.** Tab Cost lines: switch ada di toolbar tepat di samping tombol "Cost validation" (urutan: switch, Cost validation, Verify all matching); tombol Cost validation tampil di kedua mode. "Detailed" mengganti isi tab di tempat yang sama (komponen `CostAgentInvoiceLines` yang sama,
  `variant` berubah, state & dialog tetap). Tab Documents & Tax: switch di baris atas tab; Detailed = `CostAgentInvoiceDocuments` (tampilan lama) menggantikan `CostAgentDocsSummary` di tempat yang sama. Pilihan terakhir diingat per browser & per tab (localStorage `beehive_cost_agent_invoice_detail_view_lines` / `_docs`).
  Modal "Cost lines — detailed" / "Documents & Tax — detailed" DIHAPUS (bagian "Switch Summary | Detailed ... modal" di atas tidak berlaku lagi); `useEscClose` tetap dipakai dialog laporan validasi.

## Peran per user, kode pemblokir gerbang, Documents & Tax ringkas (Tahap 3c, 2026-10-28, permintaan user; SQL `092_cost_agent_gate_blocking_user_roles.sql` SUDAH DIJALANKAN, 3 RPC terbaca di production; TANPA SQL baru, nomor SQL berikutnya 093)

**Mengganti** bagian-bagian di atas yang menyebut kunci akses per fitur (`cost_agent_maker/checker/approver/apnote/treasury`) sebagai cara menetapkan peran, dan yang menyebut gerbang memblokir SEMUA temuan. Prompt 093 (menampilkan 5 kunci peran di Kelola Role & Akses) DIBATALKAN; kunci di `permissions.ts` dibiarkan apa adanya (tidak dipakai lagi untuk memberi peran).

### Roles (ditetapkan di Settings > User roles)
- Peran Maker / Checker / Approver / AP Note / Treasury diberikan per EMAIL di hub **Cost Agent Settings -> tab Settings -> grup "Roles & workflow" -> "User roles"** (`pages/cost-agent/settings/UserRolesCard.tsx`). Hak mengubah = hak editor Settings (`ctx.editable`, hak master); tanpa hak ubah tabel hanya baca.
- **Setiap user tetap butuh hak LIHAT (View) ke Agency Invoices di Kelola Role & Akses (sekali).** Hak EDIT per fitur tidak diperlukan lagi.
- Selama `roles_strict` = off, siapa pun yang boleh mengedit Agency Invoices bisa bertindak di semua peran. Nyalakan setelah tiap peran punya minimal satu user (switch "Enforce roles" ada di kartu yang sama; disimpan lewat `fn_cost_agent_save_setting`; konfirmasi menyebut peran yang masih 0 user).
- Tabel: User | Maker | Checker | Approver | AP Note | Treasury | Note | aksi. Satu panggilan `fn_cost_agent_save_user_roles` per baris (seluruh daftar peran baris itu); hapus user = kosongkan semua centang lalu Save, atau tombol **Remove** (dengan konfirmasi). Strip coverage di atas tabel dari `coverage` ("Maker 2 · Checker 1 · Approver 0 ..."), peran 0 user diberi tanda kuning "No one can act as Approver yet".
- **Add user**: input email dengan `<datalist>` dari `profiles` (`fetchAppUserEmails()`, sumber BACA yang sama dgn Kelola Role & Akses, RLS tetap berlaku; bila tak terbaca, ketik email biasa). Format email divalidasi ringan; database yang menormalkan (huruf kecil). Baris baru bertanda "not saved" sampai Save.
- Pesan error database ditampilkan apa adanya di toast (mis. "Enter a valid email address").
- **Chip peran saya** di header halaman Agency Invoices (`components/CostAgentMyRoles.tsx`, juga terlihat saat detail invoice terbuka): peran efektif yang `true` dari `fn_cost_agent_my_roles().effective`; semua false + `roles_strict` = chip abu-abu "View only". Dipanggil sekali per muat halaman (cache sesi `getMyRoles()` di `CostAgentWorkflow.ts`, dibuang `resetMyRolesCache()` saat peran/`roles_strict` diubah), tanpa polling.
- RPC baru (sudah di `server/db/whitelist.ts`): `fn_cost_agent_list_user_roles()` -> `{roles_strict, users:[{email,roles[],note,updated_at,updated_by}], coverage:{maker,checker,approver,apnote,treasury}}`; `fn_cost_agent_save_user_roles(p_email, p_roles text[], p_note default null)` -> `{email,roles[]}` (roles kosong = hapus); `fn_cost_agent_my_roles()` -> `{email, assigned[], roles_strict, effective:{...}}`.

### Document gate (hanya kode di `gate_block_codes` yang memblokir)
- Yang MEMBLOKIR Verify / Submit / Validate hanya temuan ber-kode di setting **`gate_block_codes`** (bawaan: `not_analysed`, `attachment_missing`, `attachment_diff`, `attachment_line_missing`). Semua temuan lain (faktur pajak, header, tanggal, voyage) ada di `warnings` dari `fn_cost_agent_get_doc_gate` dan TIDAK memblokir. Bentuk respons tetap `{enabled, complete, blockers[], warnings[], ...}`. `not_analysed` selalu memblokir (server mengembalikannya sebelum penyaringan).
- **Settings -> grup "Documents & auto-verify"**: `gate_block_codes` tampil sebagai daftar centang "What blocks submit?" (`settings/GateCodesRow.tsx`), bukan JSON. Tiga kelompok: Cost lines vs attachment (bawaan tercentang; `not_analysed` terkunci), Tax invoice, Header and dates. Kode di luar daftar tampil sebagai baris "Other: <kode>" yang bisa diubah. Simpan (tombol Save) -> `fn_cost_agent_save_setting('gate_block_codes', [kode tercentang])`. Daftar kode & label = `GATE_CODE_GROUPS` di `utils/CostAgentRolesLogic.ts`.
- **Kata-kata UI**: pill status HANYA dari `blockers` (`gatePill()` di `utils/CostAgentGateView.ts`): tanpa blocker -> hijau "Ready to submit"; ada -> merah "Fix N item(s) before submit". Kata "Documents incomplete" dihapus. `warnings` TIDAK membuat panel merah, tidak mematikan Submit/Verify, tidak ikut jumlah lonceng, dan tidak pernah jadi pesan penolakan. Tombol Submit/Verify mengikuti `me.can_*` + jumlah `blockers` (bukan `gate.complete`). Toast penolakan `DOC_GATE:` memakai `DOC_GATE_TOAST`. Banner di lonceng (`DocGateBanner`) memakai teks yang sama; warnings di sana disebut "notes".

### Tab Documents & Tax -- Summary dibuat ringkas
Urutan dari atas (`components/CostAgentDocsSummary.tsx`; data dari RPC yang sama):
1. Baris status: pill (di atas) di kiri; kanan "3 of 3 documents · 2 notes" (jumlah notes = baris hasil pengelompokan).
2. Tiga chip dokumen sejajar (Invoice, Attachment, Tax invoice): ikon, "Received <tanggal>" / "Not received" (merah), View, Upload (bila diizinkan seperti sebelumnya). Nama file panjang hanya di tooltip. Nomor/tanggal faktur pajak + chip NPWP = satu baris kecil di dalam chip Tax invoice.
3. **Must fix** -- hanya `blockers`, maks 5 lalu "Show all N"; tiap baris label + detail dari server + "Go to line" (dan "Set period" untuk `period_missing`). Kosong -> baris hijau "Invoice lines match the attachment".
3b. **Per-line comparison** (revisi 2026-10-28, permintaan user: JANGAN di popup) -- tabel per baris langsung di tab, di antara Must fix dan Notes (`DocLineComparison` di `CostAgentInvoiceDocuments.tsx`): kolom tetap **Line | Description | Invoice | Attachment | Tax invoice** (+ panah detail), SATU chip per sel (OK / Diff (+selisih) / Missing / n/a; nomor dokumen rujukan di tooltip, klik baris = drawer rujukan), judul + hitungan baris + chip "N to check" / "all match", filter "Show only items to check", "Not in invoice (n)" di bawah. Hanya tampil bila dokumen sudah dibaca (analysed) dan ada baris.
4. **Notes** -- hanya `warnings`, accordion TERTUTUP dgn jumlah. Dikelompokkan (`groupNotes()`): **Tax invoice** (6 `line_not_in_fp` -> SATU baris "6 lines are not on the tax invoice (lines 6, 7, ...)" dgn tautan per nomor; `tax_total_diff` -> satu baris "Tax totals differ: VAT −16,500 · ..."; `tax_line_diff` per baris; `fp_missing`, `tax_rate_diff` apa adanya) + teks bantu "Notes do not block submit. Set a tax rule ...", **Dates & voyage** (`date_out_of_period`, `voyage_*`, `date_warn`, `invoice_date_diff`, `period_missing`), **Other** (sisanya). Tiap baris bisa dibuka untuk melihat teks `detail` server; tidak ada teks simpulan baru.
5. Tombol **Full comparison** (kanan atas tab; menggantikan switch Summary/Detailed untuk tab ini; tombol kecil "Re-check" di sebelahnya menggantikan tombol Re-check banner lama) membuka modal besar (`components/CostAgentFullComparison.tsx`) berisi: Period check, tampilan lama (`CostAgentInvoiceDocuments` dgn `showLines={false}` -- tabel per baris TIDAK diulang di popup, ada di tab -- berisi accordion TERTUTUP Header checks / Dates / Tax totals, Files, Add documents, Analyse again), tiga cek validasi dengan Accuracy, dan laporan validasi 4 kolom + Print (Print membuka dialog laporan yang sama seperti sebelumnya).
- **Dipindah ke Full comparison**: tiga cek validasi + Accuracy + "Mismatches only", laporan 4 kolom + Print, kartu Period check, tampilan lama (accordion, Files, upload susulan, Analyse again).
- **Dihapus dari Summary**: kartu "Findings" (duplikat Notes + Must fix), lingkaran/batang Accuracy, banner daftar blocker (diganti Must fix), kartu Period check, switch Summary|Detailed untuk tab ini (state `docsDetail` & kunci localStorage `..._docs` tidak dipakai lagi). Popover "Needs attention" di daftar kartu dan tab Cost lines TIDAK diubah.

### Berkas & tes
- Logika murni (dites `npm test`, `src/utils/costAgentTahap3c.test.ts`): `utils/CostAgentGateView.ts` (pill, `groupNotes`, `visibleBlockers`), `utils/CostAgentRolesLogic.ts` (checkbox <-> `p_roles`, coverage, chip peran saya, daftar centang `gate_block_codes`).
- Uji manual: lihat laporan Tahap 3c (6 skenario).

### Kartu Finance mapping di tab Payments -- ditata ulang (2026-10-28, permintaan user)
Data & aksi TIDAK berubah (fn_cost_agent_finance_check, Resolve, Preview AP Note). Tampilan: strip kemajuan "N of M mapped"; Supplier & Vessel = dua kotak berdampingan (kuning bila belum dipetakan); Cost items = tabel berkolom Status | Cost item | Lines | Ascend expense type (baris Missing bertepi kuning, baris Mapped selang-seling, scroll di dalam bila panjang; di kartu sempit kolom Ascend turun ke baris kedua lewat container query).

### Tab Cost lines -- kolom proporsional, Above / Under, tombol Detailed dihapus (2026-10-28, permintaan user)
- Tombol Summary | Detailed di tab Cost lines DIHAPUS: tab selalu memakai tampilan ringkas (variant="summary"); varian "detailed" tetap ada di kode tapi tidak dipanggil dari modal. Kunci localStorage `..._lines` tidak dipakai lagi.
- Status selisih terhadap history: invoice LEBIH TINGGI dari history (compare_flag naik) = **Above**, LEBIH RENDAH (turun) = **Under** (menggantikan label "Difference"; chip Above merah, Under biru). Baris yang sudah di-verify = Accepted + alasan Above / Under (dulu Overcharge / Undercharge). Strip & dialog Cost validation: OK / Accepted / Above / Under / N/A + Accuracy; teks "N above / under not reviewed by the maker". Logika di `classifyCostLine` (`dir`) dan `costKey()`; Accuracy tidak berubah.
- Grid ringkas (SUM_GRID) kini PROPORSIONAL: Validation minmax(300px,1.7fr) | Expected 0.65fr | Actual 0.65fr | Difference 0.7fr | Status 0.8fr | Action 236px; picker jenis biaya lebih lebar (min 200, maks 340px).

### Kartu Agency Invoices -- dirapikan lagi (2026-10-28, permintaan user)
Data & aksi TIDAK berubah. Kartu (`InvoiceCardV2`) >= 1024px lebar kartu = EMPAT zona satu baris dipisah garis tipis: identitas | stepper | Grand total + "Needs attention" | **tombol hapus di ujung kanan** (hanya Admin; kolom ke-4 hanya ada bila tombolnya ada). Kartu lebih sempit: tombol hapus = pojok kanan atas, stepper turun ke baris bawah dengan garis pemisah. Meta (kapal, pelabuhan, tanggal) = pil lembut berlatar krem; teks lama menunggu / error Reprocess dipusatkan di bawah stepper.

## Perbaikan hasil review tangkapan layar (Tahap 3d, 2026-10-28, permintaan user; SQL `093_cost_agent_docs_review_fixes.sql` dari user SUDAH DIJALANKAN -- `expect` terbaca di fn_cost_agent_get_invoice_documents; TANPA SQL baru dari sesi ini, nomor berikutnya 094)
- **Per-line comparison**: tiap `lines[]` kini punya `expect: {attachment, tax}` (SQL 093). Sel Attachment: status none / no_doc + `expect.attachment === false` -> chip abu-abu "n/a" (tooltip "Attachment not required for this cost item"). Sel Tax invoice: none / not_in_fp + `expect.tax === false` -> "n/a" (tooltip "Not expected on the tax invoice: no VAT in its tax rule"); `expect.tax === true` dan tidak ada di FP -> kuning "Missing"; Diff tetap merah. Tanpa `expect` (data lama) = perilaku lama. Logika murni di `utils/CostAgentDocLines.ts` (`sideState`, `needsCheck`, `countToCheck`, `defaultOnlyCheck`); hitungan "N to check" & filter "Show only items to check" (bawaan AKTIF selama ada yang perlu dicek) TIDAK menghitung baris yang hanya netral. Baris Missing kuning di tabel = baris `line_not_in_fp` di Notes (server memakai aturan yang sama: kena PPN menurut tax rule).
- **Laporan / Full comparison**: tabel tanggal -- nilai dokumen tanpa pembanding di invoice (status na) ditampilkan APA ADANYA tanpa chip (dulu "Not filled"); "Not filled" hanya bila nilai kosong DAN statusnya bukan na. Kartu ringkasan dokumen memakai "N differences" (merah, sel Diff) dan "N to check" (kuning), kata "red flags" dihapus; chip "Attention" kuning bila tidak ada Diff. Dialog laporan (ReportShell) = ukuran sama dgn modal Full comparison (max-w 1180px, overlay sama).
- **Angka tidak terpotong**: popup Cost validation (kolom Expected / Actual / Difference: whitespace-nowrap + min-width, rata kanan, tabular-nums) dan grid Cost lines (kolom angka minimal 124 / 124 / 140px).
- **Tab Approval (belum diajukan)**: kartu "Approval route" dari fn_cost_agent_approval_preview (`routePreview` di `CostAgentApprovalPanel`; ikut tampil utk user read-only selama status verification / rejected). Tanpa aturan yang cocok: teks alasan server apa adanya + tautan "Open Approval Matrix" (bila user boleh membuka halamannya).
- **Alasan Submit nonaktif**: SATU baris di footer dekat tombol (`submitBlockReason()` di `utils/CostAgentGateView.ts`; urutan: me.blocked_reason -> PT -> jenis biaya -> verifikasi -> blocker gerbang pertama -> rute approval; tombol & tooltip memakai alasan yang sama).
- **Kartu daftar**: tombol aksi kecil di zona kanan (label = tugas saya Verify / Validate / Approve; tanpa tugas "Review", read-only "View"; klik = buka detail). Popover "Needs attention" memuat data normal (skeleton hanya selama RPC berjalan; di tangkapan layar dulu hanya soal waktu).
- **Settings**: peringatan peran 0 user = SATU kalimat ("No one can act as Maker, Checker yet."); baris generik `roles_strict` disembunyikan (switch hanya di kartu User roles); teks kosong Approval Matrix = "No rules — click \"Add\"."; strip tab hub diberi gradasi penanda gulir di tepi yang tersembunyi. Placeholder pencarian daftar di ponsel (< 640px) = "Search invoices". BELUM dikerjakan (opsional): kepala detail invoice di ponsel dijadikan satu baris yang bisa dibuka.
- Tes: `src/utils/costAgentTahap3c.test.ts` (sel netral dari expect, hitungan to check tanpa baris netral, alasan Submit, kalimat peran 0 user).
- **Tombol Action terpotong saat file/PDF tampil (2026-10-29)**: grid ringkas Cost lines (`SUM_GRID` di `CostAgentInvoiceLines.tsx`) pindah ke tata letak lebar (6 kolom) hanya bila panel >= **1120px** (dulu 900px; minimum kolom total ±1100px sehingga kolom Action meluber di panel ±960px saat PDF tampil). Di bawahnya (640-1119px): Validation satu baris penuh, lalu Expected / Actual / Difference / Status, Action di baris sendiri (rata tengah, wrap). Dicek 1024-2560px dgn file tampil: tanpa tombol terpotong / gulir horizontal. Folder `tmp/shots` (skrip tangkapan layar + `.auth.json`) sudah dihapus.

- Detail invoice sempat dijadikan halaman (2026-10-29) lalu DIKEMBALIKAN ke modal atas permintaan user; tampilan modal (portal, overlay, X/Close, Esc menutup) = seperti semula.

## Kunci peran lama dipensiunkan dari Kelola Role & Akses (2026-10-29, permintaan user; SQL `sql/095_cost_agent_retire_role_keys.sql` -- file lokal, SUDAH DIJALANKAN user 2026-10-29; dicek via MCP: kelima kunci sudah 0 baris di role_page_access, pemindahan ke User roles tidak bisa dibaca claude_ro)

- Lima baris "Cost Agent - Maker / Checker / Approver / AP Note / Treasury" DIHAPUS dari `PAGE_REGISTRY` & `ACCESS_MATRIX_ORDER` (`permissions.ts`): peran per user = Cost Agent Settings > User roles (092). **Tetap ada di matrix**: `cost_agent_payment` (Payment / AP-PV: pengaman fitur pembayaran -- tombol AP Note/PV, Mark as paid, proxy n8n, `fn_cost_agent_create_payment_request` & `fn_cost_agent_mark_paid` -- BUKAN peran) dan `cost_agent_approval_matrix`.
- **Mengapa SQL dulu**: `fn_cost_agent_has_role` masih menerima kunci itu (assigned roles OR `has_edit_access('cost_agent_<peran>')` OR, selama `roles_strict` mati, Edit di `cost_agent_invoice`). Cek production 2026-10-29: satu-satunya pemberian aktif = Checker untuk role "Bunker" (2 user). Menyembunyikan baris tanpa membersihkan = akses tak terlihat. **095** (satu transaksi, idempotent): tiap role yang punya Edit di salah satu kunci itu -> semua user role tsb ditambahkan ke `cost_agent_user_roles` (peran sama, `updated_by = 'migration 095'`, hanya bila belum ada), lalu baris `role_page_access` kelima kunci dihapus. Tidak mengubah fungsi DB.
- **Selama 095 belum dijalankan**: matrix sudah tidak menampilkan baris itu, tetapi pemberian Checker role Bunker masih berlaku diam-diam -- jalankan 095 segera. Setelah 095, kunci itu tidak punya pemegang; jalur fallback di fungsi DB tetap ada tetapi tidak aktif.

## Alasan "kenapa baris belum auto-verified" (2026-10-29, permintaan user; RPC baca-saja `fn_cost_agent_get_line_verify_reasons` dari SQL user `sql/095_cost_agent_line_verify_reasons.sql` -- BELUM terbaca di production per cek MCP 2026-10-29: layar menyembunyikan ikon & ringkasan secara diam sampai SQL itu dijalankan)

- **RPC** (sudah di `server/db/whitelist.ts`; wrapper `costAgentGetLineVerifyReasons` di `CostAgentWorkflow.ts`): `{invoice_id, auto_verify{enabled,methods,levels}, documents_complete, summary{total,verified,eligible,needs_user}, lines[{line_id,line_no,verified,code,label,hint,needs_user}]}`. Aturan dihitung di DATABASE (urutan SAMA dgn `fn_cost_agent_auto_verify`); klien TIDAK meniru aturan, hanya menampilkan. Nomor SQL bentrok: file ini bernomor 095 sama dgn `095_cost_agent_retire_role_keys` (sudah dijalankan & dihapus) -- isi beda; file dipindah ke `sql/` (jangan di root).
- **Hook** `useLineVerifyReasons(invoiceId, enabled, signature)` (`CostAgentVerifyReasons.tsx`): dipanggil SEKALI saat detail terbuka pada status verification / rejected, lalu ulang HANYA saat `signature` berubah (tanda baris: id, verified, cost item, amount, flag/ref/check + keadaan gerbang dokumen) = setelah Verify, Verify all matching, Re-check, ganti cost item, simpan dokumen. TANPA polling; gagal ambil = data null (ikon & ringkasan tidak tampil, tanpa toast). Pengguna read-only ikut melihat (RPC mengizinkan baca).
- **Per baris** (`CostAgentInvoiceLines`, varian summary, kolom Action tepat setelah tombol Verify / chip status): baris BELUM verified -> `VerifyReasonIcon` (ikon info 20px = sama dgn ikon pensil, netral abu; kuning hanya bila `needs_user`; `code = ready` -> centang abu, popover hanya label). Hover / fokus / ketuk membuka popover (portal `fixed`, lebar maks 280px, teks membungkus, dijepit ke dalam layar -> aman di 390px; koreksi zoom global 90%). Label tidak dipotong; hint abu-abu bila ada. Baris verified tidak punya ikon (badge "Auto" / nama verifier tetap).
- **Ringkasan** (di atas tabel, di bawah strip OK/Above/Under): "Auto-verified N of M · K need your check" (N = summary.verified total); auto-verify mati: "Auto-verify is off in Settings"; dokumen belum lengkap dan K = 0: "· Waiting for documents". Klik = daftar baris needs_user per kode ("Above history (3): lines 8, 11, 14"), nomor baris = gulir ke baris (`[data-line-id]`). Logika murni & tes: `utils/CostAgentVerifyReasons.ts`, `utils/costAgentVerifyReasons.test.ts`.
- Setting `auto_verify_match_methods` di production kini memuat `keyword` (cek MCP 2026-10-29) -> baris auto-verified lewat keyword punya remark "Auto-verified: matched by keyword, amount is not above history" (tampil seperti remark lain, tanpa perubahan UI).

- **Rapikan kolom Action Cost lines (2026-10-29, laporan user: ikon alasan membuat tombol berantakan)**: tombol Action tidak lagi membungkus (`flex-nowrap`): Verify/Verified lebar tetap (min 100px) | SLOT 40px tetap berisi chip "Auto" ATAU ikon alasan (`data-reason-slot`, supaya tombol sejajar antar baris) | Remark 32px | Split/Tax (label hanya >= 1150px, di bawahnya ikon saja + aria-label). Grid ringkas 4 tingkat (container query panel): >= 1150px enam kolom (Action 264px, rata tengah); 760-1149px baris 1 Validation penuh + baris 2 Expected | Actual | Difference | Status | Action SATU baris (kolom auto); 640-759px Action pindah ke baris 3 rata kanan; < 640px bertumpuk (Action rata kiri, satu baris). Breakpoint lebar 1120 -> 1150 (kolom Action 236 -> 264px).
- **Revisi 2 (2026-10-29, screenshot user: header tabel hilang saat file tampil, susunan tombol & ikon alasan kurang pas)**: tingkat 760 DIHAPUS; header kolom + satu baris enam kolom kini mulai panel **>= 980px** (kompak: Validation >= 220px, angka >= 100-108px, Action 212px; >= 1200px lebih lega, Action 248px + label Split/Tax). 640-979px: baris 1 Validation, baris 2 Expected | Actual | Difference | Status, baris 3 Action rata kanan; < 640px bertumpuk. **Kolom Action = tiga tombol berukuran tetap**: Verify/Verified 128px (badge "Auto" di DALAM tombol, `data-auto-verified`) | Remark 32px | Split 32px (ikon; label >= 1200px) -> sejajar antar baris, tanpa slot kosong. **Ikon alasan (info) pindah ke baris judul kolom Validation**, tepat setelah ikon pensil edit (keterangan tentang baris itu, bukan aksi); popover tetap portal 280px.
- **Toolbar Cost lines = SATU baris (2026-10-29, permintaan user)**: varian summary: Show file | chip OK / Accepted / Above / Under / N/A / Accuracy (lebih ringkas) | ringkasan auto-verify ("Auto-verified N of M · K need your check", klik = daftar `VerifyReasonsList` di bawah toolbar; fallback "N/M verified" bila RPC alasan tidak ada) | Verify all matching di kanan (`ml-auto`); `flex-wrap` sebagai cadangan di layar sempit. Dihapus: tombol **Cost validation** (prop `onOpenValidation`, state/dialog `CostValidationDialog` di modal; komponen `CostValidationDialog` di `CostAgentValidationReports.tsx` dibiarkan, tidak dipakai), teks "n need check · n not mapped" (angkanya sudah di footer "Needs check" & chip header "without cost item") dan kalimat "n above / under not reviewed by the maker" (kini tooltip strip chip). Cetak laporan Cost validation lewat tombol itu TIDAK ada lagi; laporan Documents tetap di "Full comparison".
- **Laptop 14" saat file tampil (2026-10-29, laporan user: header tabel hilang & tidak rapi)**: panel kanan saat file tampil ±900-1000px (viewport 1280-1440) sempat jatuh ke tingkat tanpa header (< 980px). Kini **header + satu baris enam kolom mulai panel >= 870px** (kompak: Validation >= 190px, angka 96-104px, Status 84px, Action 204px, jarak kolom 8px; >= 1200px lega: jarak 16px, Action 248px, label Split/Tax). Picker jenis biaya min 170px. Viewer file 36% -> 33% (maks 600px) supaya tabel lebih lebar. Toolbar satu baris diringkas di panel < 1100px (container query pada akar komponen): "Acc." (tooltip Accuracy) dan "Verify all (n)" menggantikan "Accuracy" & "Verify all matching (n)". Tingkat 640-869px: Validation / angka+Status / Action rata kanan (tanpa header).

## Faktur Pajak resmi saja, FP lumpsum, kartu dokumen per file/halaman (2026-10-29, permintaan user; SQL 097 dari user -- `fn_cost_agent_doc_match` terbaca memuat "Covered by the lump-sum" di production; file `sql/097_cost_agent_tax_docs_lumpsum.sql`)
- **A. Nota Pelindo bukan faktur pajak**: UI tidak lagi memakai `is_tax_equivalent` (server tetap mengirim kolomnya, selalu false). `taxPart` (Documents & Tax Summary), kartu FP & status "Tax totals" (`CostAgentInvoiceDocuments.TaxTotals`) = parts ber-`doc_type = faktur_pajak`. Nota Pelindo/KSOP = `nota_pelabuhan` = label "Port note" di kartu **Attachment**. Teks/badge "equivalent / dipersamakan": TIDAK DITEMUKAN di UI (hanya pemakaian `is_tax_equivalent` di dua komponen itu). Keanggotaan kartu = `completeness[key].docs` dari server (tax_invoice = `doc_type = faktur_pajak` & `dup_of is null`).
- **B. FP lumpsum**: sel pajak `match_agg` = "Covered by tax invoice (lump sum)" (hijau, chip boleh membungkus 2 baris; tooltip = `tax.note` apa adanya; sisi Attachment `match_agg` tetap "OK / Combined in one row"); drawer baris memakai label & note yang sama. Full comparison > Tax totals: satu kartu FP (nilai gabungan, file + halaman) dan baris "Covered by the lump-sum tax invoice: N lines (1–14)" dari status baris (`tax.status = match_agg`; `tax.refs` dipakai drawer). `tax_totals.checks` / `rate_checks` TIDAK diubah (tampil apa adanya; tidak ada peringatan baru di klien). Kolom tabel per-baris: Tax invoice 24%.
- **C. Kartu dokumen** (`utils/CostAgentDocCards.ts`, `CostAgentDocsSummary.tsx`): urutan **Invoice, Tax invoice, Attachment**; tiap kartu = satu baris per dokumen logis: jenis, nomor, halaman ("p. 3–5"), **View ke file MILIK dokumen itu** (`part.file_id` -> file) + `#page=N` (`page_from`); file campuran boleh tampil di beberapa kartu dengan halaman berbeda; duplikat (`duplicate_of`) berlabel "Duplicate", tautan ke dokumen ASLI, tidak dihitung di jumlah kartu, urut setelah asli; urut dokumen = `files[].seq` lalu `page_from`. Tab Files (Full comparison) menambah satu baris "dokumen di dalam file" (jenis nomor (halaman)). **Batas**: pratinjau tetap tautan ke file (tab baru), bukan penampil di dalam aplikasi; fragmen `#page=N` bekerja utk PDF langsung, penampil Google Drive bisa mengabaikannya (BELUM diuji dgn data nyata). Tes: `utils/costAgentDocCards.test.ts`.

## "Not in invoice" tanpa bukti ganda (2026-10-29, permintaan user; SQL 098 dari user, `sql/098_cost_agent_orphan_evidence.sql` -- `orphans.attachment_covered` terbaca di `fn_cost_agent_doc_compare` production; teks alasan ada di `fn_cost_agent_doc_match`)
- Tampilan murni dari hasil RPC (tanpa hitungan klien): **"Not in invoice (N)"** = `orphans.attachment` + `orphans.tax` seperti sebelumnya, disembunyikan bila N = 0 (gaya lama). Bagian BARU tertutup **"Also supports an invoice line (M)"** dari `orphans.attachment_covered` (disembunyikan bila M = 0): jenis dokumen · nomor · uraian · nominal + keterangan kecil dari `reason` (`same_amount_as_line` = "Same amount as an invoice line", `total_of_document_items` = "Total of the items in a document"; alasan lain = tanpa keterangan), warna netral. Tipe `DocCmpOrphanCovered`; teks di `utils/CostAgentDocCards.ts` (`coveredReasonText`). Gerbang/blokir tidak diubah (peringatan `orphan_attachment` tetap notifikasi dari server).
- Pembaca lain `orphans`: TIDAK DITEMUKAN (hanya `LineComparison`); badge/kartu ringkasan tidak menghitung orphan sendiri (jumlah peringatan = `gate.warnings` dari server).

## Aturan cost line per peran (2026-10-29, permintaan user; SQL 101 dari user, SUDAH DIJALANKAN -- fungsi barunya terbaca di production; file lokal `sql/101_cost_agent_line_rules_by_role.sql`)
Kolom baru di `cost_agent_invoice_lines`: `origin_line_id, maker_description, maker_amount, maker_qty, maker_unit_price, is_validated, validated_by, validated_at, checker_remark`; setting baru `checker_require_line_validation` (bawaan false = Validated per baris TIDAK wajib; true = pesan server "Every line must be validated before the invoice can be validated", tampil apa adanya). Putaran submit baru menghapus jejak checker putaran lama (trigger).
**Siapa boleh apa (ditegakkan SERVER; UI hanya mengikuti):**
- **Maker**: ganti jenis biaya (`fn_cost_agent_verify_line`), "Add as new cost item", Verify/Unverify, Verify all, Remark maker. TIDAK bisa edit teks / qty / harga / nominal (`fn_cost_agent_update_line` menolak: "The maker cannot edit ...") dan TIDAK bisa Split. Tombol pensil & Split tidak ada untuk maker.
- **Checker** (saat validasi menunggu, mode `checkerMode` di `CostAgentInvoiceLines`): pensil Edit (teks + nominal; Qty/Unit price disembunyikan, server mengosongkannya bila nominal berubah) lewat `fn_cost_agent_update_line`; tombol per baris **Validate -> Validated** (`fn_cost_agent_checker_validate_line`, klik lagi = batal; mengubah teks/nominal/split otomatis mencabutnya); **Validate all lines** di toolbar (`fn_cost_agent_checker_validate_lines` -> toast `validated` / `skipped_without_cost_item`); ringkasan toolbar "N/M validated"; remark checker (`fn_cost_agent_checker_set_line_remark`, maks 500; remark maker tampil read-only berlabel "Maker:"); Split (nominal bagian dikunci klien "N left" -- `utils/CostAgentSplit.ts` -- server juga menolak bagian > nominal baris / negatif); Tax. Baris yang diubah checker menampilkan teks kecil **"Original: <teks asli> · <nominal asli>"** (dari `maker_*`, helper `originalOf` di `utils/CostAgentLinesView.ts`); bagian hasil split diberi chip "Split" (`origin_line_id`). Panel Checker tab Approval hanya **Validate** (Return to maker dihapus; `fn_cost_agent_checker_return` DROP di sql/101, juga dihapus dari klien, hook, tipe & whitelist). `TOTAL_CHANGED:` / pesan server lain tampil sebagai toast apa adanya.
- **Approver** (HANYA bila approver; bukan maker/checker/apnote/treasury): baca saja, melihat versi ASLI maker (baris sebelum split, teks & nominal sebelum edit checker), tanpa remark checker & status Validated. Tidak ada tombol edit/split/validate.
- **Tab Payments** disembunyikan dari Maker dan Approver (`canSeePaymentsTab` di `utils/CostAgentRolesLogic.ts`; peran Checker/AP Note/Treasury tetap melihat; View only / belum terbaca = tampil). Tombol footer "Create AP Note / PV" dan "Mark as paid" ikut. Hanya tampilan -- RLS/RPC pembayaran tidak berubah.
**Sambungan ke server:** `costAgentGetInvoiceHistory` (`utils/CostAgentHelpers.ts`) kini memanggil `fn_cost_agent_get_invoice_history` DAN `fn_cost_agent_get_invoice_lines` bersamaan lalu `mergeLinesView` (`utils/CostAgentLinesView.ts`): baris yang ditampilkan = yang dikirim RPC peran; `view = 'maker'` membuang baris split dan kolom checker; kolom tambahan (nama jenis biaya, history pembanding) tetap dari RPC history. Gagal membaca baris = error (tidak jatuh ke baris RPC history, supaya split tidak bocor ke approver). Whitelist: `fn_cost_agent_get_invoice_lines`, `fn_cost_agent_checker_validate_line`, `fn_cost_agent_checker_validate_lines`, `fn_cost_agent_checker_set_line_remark` ditambah; `fn_cost_agent_checker_return` dihapus. Varian `detailed` di `CostAgentInvoiceLines` tidak terpakai di modal dan TIDAK dilengkapi fitur checker (hanya varian `summary`). Tes: `utils/costAgentRoleViews.test.ts`.
**Catatan keamanan (belum ditutup, sisi SQL):** `fn_cost_agent_get_invoice_history` masih mengirim SEMUA baris + kolom checker ke semua peran (UI membuangnya untuk approver, tetapi respons jaringan mentah masih memuatnya); akses tabel langsung juga tidak berubah. Fungsi lain yang membaca `cost_agent_invoice_lines` dan bisa dipanggil dari klien -- isi balikannya untuk approver BELUM diperiksa: `fn_cost_agent_get_invoice_documents` (perbandingan dokumen per baris, tab Documents & Tax), `fn_cost_agent_attention_items`, `fn_cost_agent_invoice_cards`, `fn_cost_agent_my_tasks`.

## Kartu Agency Invoices mengikuti kartu Invoice Recap Courier (2026-10-29, permintaan user) -- hanya tampilan
`InvoiceCardV2` (`components/CostAgentInvoiceCardsV2.tsx`) disusun ulang meniru `CourierRecapGroupCard` (`CourierRecapCardList.tsx`): judul no. invoice tebal ungu `#3B2260` + vendor kecil abu + pil PT | kapal + "Port <kode · nama>" (gaya PO · Origin) | pil berwarna dengan label lebar tetap (**Voyage** hijau / abu "No voyage", **Invoice date** biru) | stepper 4 tahap + lama menunggu / error Reprocess | pil status + **Need Attention** (pil merah/kuning berikon "!" dengan jumlah temuan; popover tetap) atau **centang hijau** bila tanpa temuan (bukan void/failed/processing) | **Grand total** | tombol bulat **"<Verify|Validate|Approve|Review|View> ›"** (terisi ungu bila ada tugas saya, garis ungu bila tidak) | tombol hapus Admin di kolom paling kanan. Container query pada lebar kartu: **>= 1240px** tujuh kolom + pembatas vertikal samar (`border-[rgba(138,123,155,0.18)]`); lebih sempit dua kolom dengan pembatas horizontal dan stepper selebar kartu (urutan: judul | kapal / pil | status / stepper / total | tombol). Garis kiri berwarna per bucket (`EDGE`) dipertahankan. Atribut uji `data-invoice-card`, `data-invoice-amount`, `data-card-action`, `data-waiting`, `data-stages`, `data-attention-badge` tidak berubah; `data-no-findings` baru untuk centang hijau. `AttentionBadge` ikut bergaya baru (juga di kolom Findings tabel List). Data & aturan TIDAK berubah (semua dari `fn_cost_agent_invoice_cards`); belum dilihat di browser.

## Tab Documents & Tax: header tabel sejajar, kartu dokumen satu baris, strip periode (2026-10-29, permintaan user) -- hanya tampilan
- **Header "Per-line comparison" tidak sejajar**: kelas dasar `TH` di `CostAgentInvoiceDocuments.tsx` memuat `text-left`, dan `text-center` yang ditambahkan di header Attachment / Tax invoice / Line / Status kalah (urutan CSS Tailwind), sehingga header rata kiri sedangkan isi sel (chip) di tengah. Perbaikan: semua `${TH} text-center` jadi `!text-center` (6 tempat: tabel per baris, Header checks, Dates, Tax totals). Aturan: perataan selain kiri pada `TH` WAJIB memakai `!`.
- **Kartu dokumen (Invoice / Tax invoice / Attachment) = SATU baris** di `CostAgentDocsSummary.tsx`: ikon, judul (+ jumlah), "Received <tanggal>" / "Not received" / dst., lalu tombol ikon View (hanya bila satu dokumen), Upload, dan panah buka (`data-doc-toggle`). Daftar per dokumen (jenis, nomor, halaman, View, "Duplicate") serta info Tax invoice (nomor, tanggal, chip NPWP) TERTUTUP sampai panah diklik (`openCards`); kartu satu dokumen tanpa rincian tambahan tidak punya panah. Isi data tidak berubah (`buildDocCards`).
- **Strip periode di paling atas tab** (`data-period-strip`, satu baris bersama tombol Re-check / Full comparison): **Invoice period** (`gate.period`, pensil membuka pengisian periode di header bila boleh), **Attachment period**, **Voyage report** (`gate.voyage` arrived - departed). Invoice & voyage apa adanya dari `fn_cost_agent_get_doc_gate`. **Periode lampiran TIDAK dikirim server**: ditampilkan sebagai tanggal dokumen paling awal - paling akhir dari dokumen lampiran (bukan invoice / faktur pajak / duplikat; `attachmentDateRange` di `utils/CostAgentDocCards.ts`, tes di `costAgentDocCards.test.ts`); tanpa tanggal = "not found". Kartu "Period check" di Full comparison tidak diubah. Belum dilihat di browser.

## Tab Documents & Tax: baris status & "Must fix" kosong dihapus (2026-10-29, permintaan user) -- hanya tampilan
Pil "Ready to submit" + "3 of 3 documents · 2 notes" dan kartu "Must fix" yang hanya berisi "Invoice lines match the attachment" dihapus karena duplikat: hitungan dokumen sudah terlihat di tiga kartu dokumen, jumlah catatan di judul Notes, kesiapan submit di tombol Submit / lonceng header, dan kalimat hijau itu bahkan menyempitkan arti (pemblokir mencakup juga pajak, header, tanggal). Sekarang: baris status HANYA muncul untuk keadaan khusus (memeriksa dokumen, gagal, pemeriksaan dimatikan, sedang membaca dokumen); "Must fix" HANYA muncul bila ada pemblokir (judul + jumlah merah + daftar + "Go to line"); `gatePill` di `CostAgentGateView.ts` tetap ada (dipakai tempat lain dan tes).

## Kartu Voyage mengikuti kartu Invoice Recap Courier (2026-10-29, permintaan user) -- hanya tampilan
`CostAgentVoyageCard` (`components/CostAgentCards.tsx`) disusun ulang meniru `CourierRecapGroupCard`: nama kapal tebal ungu `#3B2260` + bulan laporan kecil abu + pil (PT abu, **Voy #seq** hijau, charter plum, tipe kapal kuning, Noon Report biru) | **Route** (kode pelabuhan berurutan dipisah "›", hijau = pertama, biru = terakhir, > 6 pelabuhan diringkas "+n") | pil berwarna **Arrival** (hijau) dan **Departure** (biru) berlabel lebar tetap + tanggal-jam + zona waktu pelabuhan pertama/terakhir | pil status (titik untuk Draft) + pil source berikon (AI / API / Import / Manual) | **Updated** + tanggal | tombol bulat "Open ›" / "Opened ✓" (menggantikan panah bulat). Container query pada lebar kartu: >= 1180px enam kolom + pembatas vertikal samar; lebih sempit dua kolom + pembatas horizontal. Garis kiri per status dan latar kuning tipis Draft dipertahankan. Jalur rute bertitik versi 2026-10-23 diganti teks kode pelabuhan (kolom kartu Courier berbasis teks). Atribut uji `data-voyage-card`, `data-voyage-route` tetap; `data-voyage-times`, `data-open-card` baru. Data & klik kartu (buka drawer) tidak berubah; belum dilihat di browser.

## SQL 102 -- User roles berlaku mutlak bagi akun terdaftar (2026-10-29, permintaan user; ditulis Claude, SUDAH DIJALANKAN user 2026-10-29 dan terbaca di production (aturan baru ada di prosrc); file lokal `sql/102_cost_agent_has_role_assigned_wins.sql`)
Temuan: `fn_cost_agent_has_role` memberi Admin SEMUA peran (`has_edit_access` selalu TRUE untuk Admin; `roles_strict` = false di production juga memberi semua peran kepada siapa pun yang boleh edit `cost_agent_invoice`), sehingga Admin yang didaftarkan hanya sebagai Checker tetap bisa Verify / Submit sebagai Maker. Perbaikan (satu fungsi, signature sama): akun yang punya baris di `cost_agent_user_roles` hanya memegang peran yang tercatat (Admin ikut); akun tanpa baris = perilaku lama; service / n8n tetap TRUE. UI tidak berubah (chip peran & tab Payments membaca `fn_cost_agent_my_roles().effective`). Efek: Admin yang terdaftar sebagian tidak bisa bertindak di peran lain -- kosongkan centangnya di Settings > User roles untuk akses penuh. Rollback ada di komentar file.

## Gerbang dokumen untuk non-Maker (2026-10-29) -- perbaikan
Gejala: akun yang HANYA Checker (setelah SQL 102) membuka invoice berstatus verification -> tab Documents & Tax menampilkan "Document check failed: Akses ditolak: butuh role maker (cost_agent_maker)". Penyebab: `useInvoiceGate` memanggil `fn_cost_agent_run_checks` (auto-verify; `assert_role('maker')`) SEKALI saat dibuka, padahal peran dari alur kerja belum termuat (`makerCan` jatuh ke hak edit halaman) dan sebelum SQL 102 Admin selalu lolos sehingga tidak pernah terlihat. Perbaikan: bila server menolak dengan "Akses ditolak" (`isAccessDeniedError`, `utils/CostAgentRolesLogic.ts`), hook jatuh ke `fn_cost_agent_get_doc_gate` (baca saja, tanpa auto-verify) -- tanpa error. Pemeriksaan RPC lain yang dipanggil klien saat detail dibuka (`get_workflow`, `get_invoice_documents`, `get_line_verify_reasons`, `approval_preview`, `my_tasks`, `invoice_attention`, `apnote_preview`): semuanya hanya `assert_read`, tidak ada `assert_role` lain. Tidak perlu SQL; tidak perlu akun Maker lebih dulu.

## Approval Matrix: peringatan celah nominal & label rentang (2026-10-29)
Peringatan "Amounts not covered by an active rule ... Rp 0 - Rp 1" (Jakarta) berasal dari DATA, bukan bug: aturan Step 1 "Supervisor" (PT semua, office semua) bermin_amount = 1, sedangkan server mencocokkan `nominal >= min_amount` (`fn_cost_agent_matrix_for`) sehingga nominal < Rp 1 tidak cocok aturan mana pun untuk Jakarta (aturan Medan min 0 menutup Medan). Solusi: edit aturan itu, Min amount = 0 ("Any amount"). Label rentang tanpa batas atas diubah dari "> N" menjadi "≥ N" di `MatrixTab.tsx` (sesuai `>=` server).

## Alasan checker tidak bisa Validate tampil di tab Cost lines (2026-10-29)
Kasus: akun yang berperan Checker membuka invoice berstatus waiting_approval tetapi tombol Validate / Split / Tax tidak muncul. Penyebab paling umum = SoD (`sod_enforced` = true): `fn_cost_agent_get_workflow` mengembalikan `me.can_validate = false` dan `me.blocked_reason = 'SoD: you submitted or approved this invoice'` bila akun yang sama men-submit invoice itu (atau sudah memutuskan salah satu langkah approval-nya). Mode checker (`checkerMode`) hanya aktif bila `can_validate` true. Sebelumnya alasan ini hanya terlihat di tab Approval; kini juga muncul sebagai banner kuning "You cannot validate this invoice: <alasan server>" di atas daftar baris (`data-checker-blocked`), hanya saat validasi masih pending dan ada `blocked_reason`. Untuk menguji alur checker pakai akun yang berbeda dari yang men-submit.

## Void invoice saat menunggu approval: hanya approver langkah aktif (2026-10-29, permintaan user; SQL 103 ditulis Claude, SUDAH DIJALANKAN user 2026-10-29 dan terbaca di production; file lokal `sql/103_cost_agent_void_by_active_approver.sql`)
Sebelumnya `fn_cost_agent_void_invoice` menuntut peran Maker di SEMUA status, jadi Maker masih bisa membatalkan invoice yang sudah di tahap approval dan Approver (bukan Maker) tidak bisa sama sekali. Aturan baru: failed / verification / rejected = Maker (tetap); **waiting_approval = hanya pengguna ber-peran Approver yang namanya ada di langkah approval AKTIF** (langkah pending paling awal ronde terakhir) **atau penggantinya (delegasi)**; service / n8n tetap lolos; alasan wajib dan efek void tidak berubah; void tidak dikenai SoD. UI (`CostAgentInvoiceReviewModal` `canVoid`): waiting_approval -> tombol hanya bila `wf.me.can_approve` atau email ada di langkah aktif; status lain seperti sebelumnya. Server kini menegakkan aturan yang sama (Maker ditolak saat waiting_approval; approver langkah aktif / pengganti boleh).

## Teks footer saat semua approval selesai tapi checker belum (2026-10-29)
Validasi checker dan approval berjalan PARALEL; invoice baru `approved` bila validasi checker `validated` DAN semua langkah approval `approved` (`fn_cost_agent_finalize_approval`). Bila semua level sudah approve tetapi validasi masih `pending`, footer detail sebelumnya tetap menulis "Waiting for approval." (menyesatkan). Kini: "All approvals done — waiting for the checker to validate." (`data-footer-waiting`, `CostAgentInvoiceReviewModal.tsx`); selain itu tetap "Waiting for approval — step N: <level>".

## Footer detail invoice dirapikan (2026-10-29, permintaan user) -- hanya tampilan
`CostAgentInvoiceReviewModal.tsx`: (1) **Grand total** memakai struktur yang SAMA dengan bubble Cost lines / VAT / WHT (label kecil di atas, angka di bawah dan sebaris dengan isian bubble; angka 17px tebal ungu) dan dipisah garis tipis vertikal (sebelumnya label di samping angka sehingga turun dari baris bubble); (2) **status** footer jadi chip bulat berikon (Waiting for approval — step N / All approvals done — waiting for the checker to validate: ungu muda + jam; Paid: hijau + centang), satu baris, memotong teks bila sempit; (3) baris footer tetap `flex-wrap`, kelompok jumlah di kiri, tombol di kanan (`ml-auto`). Belum dilihat di browser.

## Kartu Agency Invoices direvisi untuk laptop 14" (2026-10-29, laporan user) -- menggantikan tata letak 7 kolom / ambang 1240px di atas
Gejala: pada lebar kartu ±1300px nomor invoice panjang pecah 3 baris, Grand total (kolom tetap 120px) meluap ke tombol, pil Need Attention menempel ke total, label stepper berdempetan. Penyebab: jumlah lebar MINIMUM kolom + jarak (±1210px) hampir sama dengan lebar kartu sehingga fr-kolom menyusut ke minimum dan isi meluap. Perbaikan di `InvoiceCardV2`: kapal & pelabuhan digabung ke kolom identitas (teks "kapal · kode pelabuhan" satu baris, dipotong); **enam kolom** `minmax(200px,1.5fr) | 208px | minmax(250px,1.4fr) | 150px | 150px | 96px` (+36px hapus Admin) = minimum + jarak 1166px < **ambang 1180px** (container query lebar kartu); judul maks 2 baris (`line-clamp-2`, tooltip penuh) 13.5px; Grand total 17px di kolom 150px; tombol lebih ramping. Di bawah 1180px: dua kolom -- identitas penuh | pil + status | stepper penuh | total + tombol. Data & aturan tidak berubah. Belum dilihat di browser.

## Bagian atas modal detail invoice mengikuti gambar referensi (2026-10-29, permintaan user) -- hanya tampilan
`CostAgentInvoiceReviewModal.tsx`: **header putih** satu baris -- kiri pil PT + nama vendor besar (24px extrabold) + status (+ "Duplicate of"); kanan **Grand total** besar, **bilah progres "x/y verified"** (menggantikan chip "N/M not verified"; chip merah "N without cost item" tetap), lonceng alert, pensil Correct header, Delete (Admin), **Submit** (PINDAH dari footer; abu + tooltip alasan bila belum siap, hijau bila siap; alasan & ringkasan rute tetap tampil di footer; label "Submit for approval" -> "Submit"), tombol tutup. Di bawahnya **strip ungu muda** dengan "Hide full info / Show all info" dan **grid putih 4 kolom**: Invoice | Vessel | Port | Voy / Company (nama PT lengkap) | Voyage route | TA (Arrival) | TD (Departure) / Invoice date | Service date | Period (InvoicePeriod `bare`, pensil + editor tetap di sini; editor yang dibuka dari tab Documents / lonceng membuka grid otomatis) | Uploaded by / Description (lebar penuh, badge Auto/Edited + Reset to auto). **Tab** pindah ke bawah strip. Footer: Grand total tidak lagi diulang di tampilan biasa (tetap ada di mode edit VAT/WHT sebagai pratinjau). **Voyage route**: tidak ada di data invoice, jadi diambil dari `fn_cost_agent_get_voyage(voyage_id).calls` (butuh hak baca Voyages; gagal = "—") dan ditulis "PAD (L) → MLH (D)" (`voyageRouteText`, `utils/CostAgentInvoiceHeader.ts`, tes di `costAgentRoleViews.test.ts`). "VOY 01 D / 2026" pada gambar tidak ada padanannya di data -> tetap "Voy 09". Belum dilihat di browser.

Revisi ukuran (2026-10-29, laporan user: terlalu besar): bagian atas modal dikembalikan ke skala komponen lain -- nama vendor & Grand total 18px bold (bukan 24px extrabold), bilah progres 110px x 6px dengan teks 11.5px, tombol Submit / tutup berukuran standar (h-9, 13px), grid info memakai ukuran lama (label 9.5px, isi 12px, padding sel px-2.5 py-1.5, strip px-3 py-2, sudut 12px). Susunan & isi tidak berubah.

## Footer modal detail invoice dihapus (2026-10-29, permintaan user)
`CostAgentInvoiceReviewModal.tsx`: **footer dihapus seluruhnya**; tombol **Close** dibuang (tutup lewat X di header / Esc / klik latar); tombol **Delete** (Admin, masa uji coba) di header modal dihapus -- prop `onDelete` modal ikut dibuang; hapus invoice tetap lewat ikon sampah di kartu / tabel daftar dan tombol di halaman. Tombol bekas footer pindah ke header kanan: **Review & decide**, **Create AP Note / PV**, **Mark as paid** (syarat sama seperti sebelumnya), **Submit**, **Void invoice** (merah, aturan `canVoid` / SQL 103 sama). Teks bekas footer pindah ke baris keterangan di bawah judul (`data-header-notes`): error aksi, chip status alur ("Waiting for approval — step N" / "All approvals done — waiting for the checker to validate"), "Paid <tanggal>", alasan Submit belum siap, ringkasan rute approval. **Cost lines / VAT / WHT** (AmountsBar, termasuk pensil edit VAT/WHT) pindah ke grid info sebagai baris lebar penuh (`data-cell="Amounts"`; terlihat saat "Show all info" terbuka). Grand total tetap di header.

Revisi (2026-10-29, permintaan user): baris **Cost lines / VAT / WHT** di grid info modal DIHAPUS (komponen `AmountsBar`, `GrandTotal` dan cek `linesMismatch` ikut dibuang dari modal; riwayat di git). Konsekuensi: **VAT & WHT tidak bisa lagi diedit dari modal** (RPC `fn_cost_agent_update_invoice_amounts` / `costAgentUpdateInvoiceAmounts` di `CostAgentHelpers.ts` tetap ada, tanpa UI) dan peringatan merah "total baris != subtotal" tidak tampil lagi di modal (catatan `total_mismatch` tetap lewat lonceng). Grand total tetap di header.

Revisi (2026-10-29, permintaan user): rincian status **digabung ke chip status di header** modal (`statusDetail`): "Waiting Approval · step 1: Supervisor" atau "Waiting Approval · all approvals done, waiting for the checker" (dengan ikon jam; `data-footer-waiting`), dan "Paid · <tanggal> · ref <ref>". Chip tetap memakai nada warna status dari `INVOICE_STATUS_META`, teks rincian dipotong bila sempit (tooltip memuat teks penuh); status lain tetap `StatusChip` biasa. Chip terpisah di baris keterangan dihapus; baris itu kini hanya memuat alasan Submit belum siap, ringkasan rute approval, dan error aksi.

## Urutan kolom Cost lines: Actual di depan Expected (2026-10-30, permintaan user)
`CostAgentInvoiceLines.tsx` (tampilan Summary tab Cost lines di modal detail invoice): kolom **Actual** kini sebelum **Expected (history)** -- urutan Validation | Actual | Expected (history) | Difference | Status | Action. Header, sel baris, dan label mobile ikut tertukar; lebar kolom `SUM_GRID` sama jadi tak diubah. Tabel di panel Validation reports (`CostAgentValidationReports.tsx`) TIDAK diubah (masih Expected | Actual).

## Tautan manual baris–dokumen & penanda "Amount includes VAT" (2026-10-30, permintaan user "PROMPT UPDATE 109"; SQL 107/108/109 dibuat & dijalankan di luar sesi UI, file lokal di `sql/`, TIDAK di-commit)
**Backend (sudah ada, UI hanya membaca/memanggil)**: 107 = status `match_gross` (nominal baris = harga + PPN) + `includes_vat_hint` / `vat_rate` per baris di `fn_cost_agent_get_invoice_documents` + alasan orphan `components_of_line`; 108 = kolom `cost_agent_invoice_lines.amount_includes_vat` (null belum diputuskan / true termasuk PPN / false di luar), `ppn_amount` / `pph_amount` dihitung server (trigger), RPC `fn_cost_agent_set_line_includes_vat(line, bool, alasan)`, issue AP Note `vat_inclusive` (level error, memblokir kirim); 109 = tabel `cost_agent_invoice_line_links` + status sisi `manual` (`manual:{ids,by,at,reason,incl}`, `diff` tetap diisi) + RPC `fn_cost_agent_line_link_candidates`, `fn_cost_agent_link_line_items(line, side, item_ids, alasan, includes_vat)`, `fn_cost_agent_unlink_line_items(line, side, alasan)`. Hak ubah (server): AP Note; Maker saat `verification`/`rejected`; Checker saat `waiting_approval` + validasi `pending`; Approver hanya melihat. 4 RPC baru sudah di `server/db/whitelist.ts`.
**UI**:
- `src/utils/CostAgentLinkLogic.ts` (MURNI, dites `src/utils/costAgentLinkLogic.test.ts`): `canEditLineEvidence` (hak TAMPIL dari `MyRoles.effective` + status + validasi pending), `canLinkLine` (diff / none / not_in_fp / manual), pilihan item `toggleItem` (satu sisi per simpan, maks 20), validasi alasan wajib, kontrol tiga keadaan `VatChoice`, `needsVatDecision`, `nearGap` (|gap incl. VAT| <= 5 hijau), `manualTipLines`.
- `CostAgentDocLines.sideState`: status `manual` -> chip biru "Linked manually" (bukan merah, tidak dihitung "to check"), selisih tidak 0 tampil di bawah chip, tooltip = by / at / reason / "Compared as item + VAT". Status TIDAK dikenal -> teks mentah (abu-abu), tidak error; `pending` / `not_required` tetap "n/a". `SideTone` + `'blue'`.
- Tab **Documents & Tax** (tabel Per-line comparison, `CostAgentInvoiceDocuments.tsx` `DocLineComparison` + prop `evidence`): tombol "Link document…" di sel deskripsi baris (hanya bila `canEdit` dan salah satu sisi diff / none / not_in_fp / manual); peringatan kuning "Matches the documents as price + VAT (11%): confirm whether the amount includes VAT" + tombol Yes / No (membuka `LineVatDialog` dgn pilihan awal; alasan wajib) bila `includes_vat_hint` true dan `amount_includes_vat` null; drawer baris memuat kotak info tautan manual.
- `CostAgentLinkDocumentDialog.tsx`: kandidat dari `fn_cost_agent_line_link_candidates` DIPERTAHANKAN urutan server, dibagi tab Attachments / Tax invoice; kolom Document, Description, Amount, Gap, Gap incl. VAT (hijau bila kecil), Similarity; "Already used by line N" (tetap boleh dipilih); kotak "Amount includes VAT (item + 11%)" (tarif = `vat_rate_used`); alasan wajib; "Remove link" bila sisi itu manual. `validation_reset=true` -> toast "The checker validation of this line was cleared because its evidence changed". Setelah simpan/lepas: muat ulang dokumen + baris + gerbang (`onChanged` DocsSummary). Tidak ada penyimpanan di browser.
- Tab **Cost lines** (`CostAgentInvoiceLines.tsx`, prop `canEditEvidence` dari modal): lencana biru "Incl. VAT" bila `amount_includes_vat` true (tombol bila boleh ubah, lainnya hanya lencana); tombol "Incl. VAT?" / "VAT: excluded" (hanya bila boleh ubah dan `ppn_rate` > 0) membuka `LineVatDialog` (`CostAgentLineDialogs.tsx`: Not decided / Yes / No, Not decided hanya keadaan awal karena RPC menolak null; alasan wajib; pesan error server apa adanya).
- `CostAgentDocCards.COVERED_REASON_TEXT.components_of_line` = "Components of an invoice line". Catatan `warn` pada `tax_totals.checks` sudah tampil lewat `note` (tidak diubah). Issue `vat_inclusive` di AP Note preview tampil lewat daftar error generik (pesan dari backend).
**Tidak dihitung di UI**: PPN / PPh / Unit Price AP Note (semua dari server). **Perbedaan dari deskripsi prompt (dilaporkan)**: (1) kontrol "Amount includes VAT" ditaruh sbg dialog sendiri di baris Cost lines, BUKAN di dalam dialog Tax (dialog Tax hanya ada utk Checker, sedangkan penanda ini juga milik Maker / AP Note); (2) peringatan kuning + Yes / No ditaruh di tab Documents & Tax (sumber datanya `includes_vat_hint` hanya ada di RPC dokumen; tab Cost lines tidak memuat RPC itu), tab Cost lines hanya punya lencana + tombol. Belum diuji manual di browser dgn 3 akun (maker / checker / approver).

## Kartu Agency Invoices: kolom proporsional + stepper lebih lega (2026-10-30, permintaan user) -- hanya tampilan
`CostAgentInvoiceCardsV2.tsx` `InvoiceCardV2`: lebar kolom enam-kolom (>= 1180px lebar kartu) kini **minimum + pecahan (fr)** untuk semua kolom (`minmax(190px,1.5fr) minmax(208px,0.9fr) minmax(270px,1.6fr) minmax(150px,0.7fr) minmax(150px,0.7fr) minmax(96px,0.4fr)`; jumlah minimum + jarak + padding = 1176px < ambang 1180px, tetap aman di laptop 14") sehingga saat layar lebar / zoom-out semua kolom melebar rata, bukan hanya identitas & stepper. Kolom stepper memakai pembatas kiri + padding kiri 24px / kanan 12px (bukan `sepV`) supaya label "Completed" tahap pertama tidak menimpa garis pembatas. Pil Voyage / Invoice date `max-w-[260px]` di layar lebar. Kartu Voyage (`CostAgentCards.tsx`) TIDAK diubah. Belum dilihat di browser.

## Kartu Voyage: pembatas kolom setinggi kartu & lebih tegas (2026-10-30, permintaan user: garis pembatas tidak jelas ikut kolom mana) -- hanya tampilan
`CostAgentCards.tsx` `CostAgentVoyageCard` (>= 1180px): kolom diregangkan (`items-stretch`) dan isi tiap kolom dipusatkan vertikal (`V_CENTER`), sehingga garis pembatas kiri kolom Route / Arrival-Departure / Status SAMA panjang (setinggi baris), bukan setinggi isi masing-masing; warna garis 0.38 (dulu 0.18); lebar kolom = minimum + pecahan (Route lebih sempit supaya garis dekat isinya): `minmax(200px,1.4fr) minmax(150px,0.8fr) minmax(260px,1fr) minmax(130px,0.6fr) minmax(110px,0.5fr) 100px`. Layar sempit tidak berubah. Belum dilihat di browser.

Revisi (2026-10-30, permintaan user): isi kolom **Route** kartu Voyage dipusatkan horizontal di antara dua pembatas (padding kiri-kanan sama, teks + node rute rata tengah, >= 1180px). Kolom lain tidak diubah.
Revisi (2026-10-30, permintaan user): label Route tidak lagi di atas -- sebaris "Route: BLW › LSM › KRR" (tetap di tengah pembatas; membungkus bila rute panjang).
