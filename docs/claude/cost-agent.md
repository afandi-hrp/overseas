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
- **Baris** (edit hanya verification/rejected & `canEdit('cost_agent_invoice')`): select cost item (per kategori) ->
  `verify_line(learn_alias true)`; Verified (learn alias saat dicentang); "Ref" = include_in_history; Remark disimpan saat blur
  (RPC memakai coalesce -> remark tidak bisa dikosongkan). Baris tanpa cost item / item_baru: "Not in cost master yet" + **Add as new
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

## Konvensi lanjutan

Pola acuan: BunkerPage (list, pagination server-side, Card/List, polling `setInterval` 5 dtk HANYA selama ada processing),
BunkerUploadModal (upload), FarOverseasAirDetailModal (detail + approval, route `:id?`), FinanceHandoverPage (mark paid),
`PaginationFooter` + `LoadingState` wajib. JANGAN sentuh `SharedDataTable`. Toast per halaman. Waktu voyage = jam lokal
pelabuhan (`ports.tz`), kirim ke RPC "YYYY-MM-DD HH:mm" tanpa offset. Angka Rupiah/liter format id-ID.
