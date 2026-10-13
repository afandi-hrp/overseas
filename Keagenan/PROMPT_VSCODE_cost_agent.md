# Prompt Claude (VS Code) – Modul Cost Agent (Biaya Keagenan) · versi 2

Disusun dari hasil analisa Prompt 0 (Vite + React 19 SPA, Express proxy, Supabase dari browser, polling, UI Inggris).
Jalankan **berurutan**: Prompt 1 dulu (fondasi), lalu 2–5. Satu prompt per sesi; review diff sebelum lanjut.

---

## Jawaban untuk 5 keputusan dari analisa (tempel di awal Prompt 1)

```
KEPUTUSAN MODUL COST AGENT (sudah final dari owner):
1. Approval Matrix: TABEL MATRIKS SENDIRI (cost_agent_approval_matrix), BUKAN user_approval_tiers.
   Aturan per PT / vendor / rentang nominal, berjenjang (step 1..n), approver = daftar email.
   Halaman Approval Matrix diatur user dengan edit access 'cost_agent_approval_matrix'.
   Approve/reject tetap digate canEdit('cost_agent_invoice') + server mengecek email approver (auth.email()).
2. Peran n8n: membaca invoice keagenan (PDF/foto) dengan Gemini, menyimpan header + baris biaya,
   mencocokkan voyage, menghitung compare history, menyimpan file ke Google Drive. Input = FILE lewat proxy.
   n8n yang menulis tabel (lewat RPC service_role). Browser hanya membaca + memanggil RPC berguard.
   Status job dipantau dari kolom cost_agent_invoices.status (processing -> verification/failed) — tidak ada tabel queue terpisah;
   job_id yang dikembalikan webhook = invoice_id.
3. Skema: SUDAH ADA, dirancang dari nol oleh owner (file SQL disediakan, lihat bagian "File SQL").
   Kapal memakai cost_agent_vessels sendiri (butuh DWT & tipe kapal untuk fallback history), tidak mengacu master_vessel.
4. Pembayaran: tanggal + referensi bank (pola Finance Handover), TANPA upload bukti.
   Ditambah pembuatan AP Note / PV yang diposting ke sistem finance lewat n8n.
5. Bahasa UI: Inggris (ikuti aturan translasi proyek). Pesan error dari RPC berbahasa Indonesia -> tampilkan apa adanya.
```

---

## Konteks bersama (tempel di awal Prompt 2–5)

```
KONTEKS COST AGENT
Stack: Vite + React 19 + TS, react-router v7 (route datar di App.tsx), Tailwind v4, lucide-react, tanpa UI library,
supabase-js dari browser (supabase.from untuk baca, supabase.rpc untuk tulis), Express server.ts hanya proxy n8n.
Acuan pola: BunkerPage (list, pagination server-side, toggle card/list), BunkerUploadModal (upload),
FarOverseasAirDetailModal (detail + approval, 1 route dengan :id?), FinanceHandoverPage (mark paid),
SeaAirAuditUi (token visual), PaginationFooter + LoadingState (wajib). JANGAN sentuh SharedDataTable.
Toast: pola per halaman (toastMessage + setTimeout). Polling: setInterval seperti Bunker (tidak ada realtime).

Page keys: cost_agent_voyage, cost_agent_invoice, cost_agent_approval_matrix (halaman);
cost_agent_payment (fitur, parent Invoice, tanpa path). Gating UI: canEdit(pageKey).

Database (SUDAH ADA — JANGAN buat tabel/fungsi/policy baru; semua RPC SECURITY DEFINER sudah berguard
has_edit_access, fungsi khusus n8n menolak role authenticated):
 Tabel/view baca (RLS has_page_access):
  cost_agent_voyage_list_v (id, company_code, vessel_id, vessel_name, vessel_type, voyage_no, seq_in_report,
     charter_type, report_month, status draft|confirmed|closed, source manual|api|import|ai, route "BLW → LSM → SAB",
     first_arrival, last_departure, cargo_total, cargo_unit, invoice_count, next_port_code, next_eta_at, updated_at)
  cost_agent_invoice_list_v (id, status, company_code, invoice_no, invoice_date, service_date, grand_total, currency,
     vendor_name, vessel_name, port_code, port_name, voyage_no, voyage_id, voyage_call_id, duplicate_of, note_count,
     line_count, naik_count, baru_count, unverified_count, tax_status, po_numbers text[], document_count,
     documents_processing, created_at, updated_at)
  master: cost_agent_vessels(id,name,vessel_type,dwt,company_code), cost_agent_ports(id,code,name,aliases,tz,is_verified),
     cost_agent_vendors(id,name), cost_agent_cost_items(id,code,name,category,gl_account), cost_agent_companies(code,name)
  cost_agent_approval_matrix (CRUD langsung, RLS has_edit_access('cost_agent_approval_matrix'))
  cost_agent_approvals, cost_agent_tax_checks, cost_agent_payment_requests, cost_agent_status_log (baca saja)
  cost_agent_invoice_documents (baca saja): 1 baris per file yang pernah dikirim (invoice awal & susulan):
     id, invoice_id, job_id (uuid, = job_id dari respons webhook), mode invoice|susulan, seq, file_name, file_url,
     doc_type unknown|invoice|faktur_pajak|po|kwitansi|nota_pelabuhan|lampiran|lainnya, status processing|done|failed,
     extracted (ringkasan AI), tax_check_id, error_message, uploaded_by, created_at
 RPC dari app (p_actor boleh dikirim email user; server memakai auth.email() bila ada):
  fn_cost_agent_get_voyage(p_voyage_id) -> voyage + calls[] (+port_code, port_name, port_tz, invoices[]) + cargo[] + cargo_total
  fn_cost_agent_save_voyage(p_voyage jsonb, p_source 'manual', p_actor) -> {voyage_id, warnings[], calls[{seq, call_id}]}
  fn_cost_agent_upsert_voyages(p_rows jsonb[], p_source 'import', p_actor) -> {saved, voyages[], errors[]}
  fn_cost_agent_get_invoice_history(p_invoice_id) -> {invoice(+voyage, voyage_call), lines[...history[]], approvals[],
     documents[], tax_checks[], payments[], timeline[]}
  fn_cost_agent_update_invoice_header(p_invoice_id, p_vendor_id, p_vessel_id, p_port_id, p_voyage_call_id, p_company_code, p_actor)
  fn_cost_agent_verify_line(p_line_id, p_cost_item_id, p_is_verified, p_remark, p_include_in_history, p_learn_alias, p_actor)
  fn_cost_agent_add_cost_item(p_code, p_name, p_category, p_gl_account, p_keywords text[], p_actor) -> id
  fn_cost_agent_submit_for_approval(p_invoice_id, p_actor)
  fn_cost_agent_decide_approval(p_invoice_id, p_decision 'approved'|'rejected', p_note, p_actor)
  fn_cost_agent_matrix_for(p_company, p_vendor_id, p_amount) -> step yang terbentuk (untuk simulasi)
  fn_cost_agent_create_payment_request(p_invoice_id, p_doc_type 'AP_NOTE'|'PV', p_data jsonb, p_actor) -> request_id
  fn_cost_agent_mark_paid(p_invoice_id, p_paid_at, p_paid_ref, p_actor)
Status invoice (label UI): processing="Processing (AI)", failed="Failed", verification="Verification",
  waiting_approval="Waiting Approval", rejected="Rejected", approved="Approved", journal="Journal (AP/PV)", paid="Paid".
Waktu voyage = jam lokal pelabuhan (LT). Tampilkan dalam zona ports.tz, kirim ke RPC sebagai "YYYY-MM-DD HH:mm" tanpa offset.
Angka: format id-ID untuk Rupiah & liter (titik ribuan). Semua kode baru: src/pages/cost-agent/*, src/components/CostAgent*.tsx,
src/utils/CostAgent*.ts, docs/claude/cost-agent.md — plus 3 file bersama (permissions.ts, MainLayout.tsx, App.tsx) dan server.ts.
```

---

## PROMPT 1 — Fondasi: SQL, registrasi halaman, proxy n8n, helper

```
[tempel KEPUTUSAN MODUL COST AGENT]
[tempel KONTEKS COST AGENT]

Kerjakan fondasi modul Cost Agent (belum ada halaman fungsional):

A. File SQL (JANGAN tulis SQL baru, hanya salin file yang saya berikan ke repo):
   sql/054_cost_agent_schema.sql, sql/055_cost_agent_seed_master.sql, sql/056_cost_agent_seed_history_part01..06.sql.
   Catat di docs bahwa nama RPC fn_cost_agent_* sudah dicek bebas bentrok (tidak ada fungsi n8n bernama sama).
   Bila CLAUDE.md mewajibkan cek pg_get_functiondef, minta saya menjalankan:
   select proname from pg_proc where proname like 'fn_cost_agent%' or proname like 'cost_agent%';

B. permissions.ts: tambah group 'Cost Agent' (union group + PAGE_GROUPS + ACCESS_MATRIX_ORDER), entri PAGE_REGISTRY
   DI AKHIR: cost_agent_voyage (/cost-agent/voyage, "Voyages"), cost_agent_invoice (/cost-agent/invoice, "Agency Invoices"),
   cost_agent_payment (fitur, parent Invoice, tanpa path, "Payment / AP-PV"), cost_agent_approval_matrix
   (/cost-agent/approval-matrix, "Approval Matrix"). MainLayout: 1 entri MAIN_TABS + ikon lucide (Anchor).
   App.tsx: route dibungkus RequirePageAccess, invoice memakai 1 route dengan :id? (pola FAR).
   Buat halaman placeholder kosong agar route bisa dibuka.

C. server.ts – proxy n8n:
   1. Tipe webhook baru untuk upload multipart (pola /api/n8n-proxy-start yang ada):
      cost_agent        -> env VITE_N8N_COST_AGENT_WEBHOOK_URL        (n8n path /webhook/proses-dokumen-cost-agent)  akses: edit cost_agent_invoice
                           (SATU webhook untuk invoice baru DAN dokumen susulan FP/PO/lampiran; dibedakan cost_agent_meta.mode)
      cost_agent_voyage -> env VITE_N8N_COST_AGENT_VOYAGE_WEBHOOK_URL (/webhook/baca-voyage-report-cost-agent)       akses: edit cost_agent_voyage
      Tambah ke UPLOAD_ACCESS, rantai defaultWebhookUrl, ENV_WEBHOOK_URLS, dan WebhookSettingsPage.
   2. KHUSUS tipe cost_agent*: teruskan juga field multipart `cost_agent_meta` (string JSON, maks 4 KB, harus JSON.parse valid,
      tolak bila bukan objek). Isi `uploaded_by` DITIMPA server dengan email user yang terautentikasi (jangan percaya client).
      Field lain tetap dibuang seperti sekarang. Jangan ubah perilaku tipe lama.
   3. Endpoint JSON baru POST /api/n8n-proxy-json (untuk aksi tanpa file), header X-Webhook-Type:
      cost_agent_voyage_pull -> VITE_N8N_COST_AGENT_VOYAGE_PULL_URL (/webhook/tarik-voyage-cost-agent)    akses: edit cost_agent_voyage
      cost_agent_payment     -> VITE_N8N_COST_AGENT_PAYMENT_URL     (/webhook/posting-pembayaran-cost-agent) akses: edit cost_agent_payment
      Pakai authorize(), N8N_WEBHOOK_SECRET/N8N_WEBHOOK_AUTH_HEADER yang sama, body JSON maks 64 KB,
      sisipkan requested_by = email user. Teruskan status & body respons n8n apa adanya.
   Ingat: server.ts tidak hot-reload — tulis di ringkasan bahwa server harus di-restart.

D. src/utils/CostAgentHelpers.ts: tipe TS untuk view/RPC di atas, wrapper fetch list (pagination .range + count exact,
   search .or ilike), wrapper RPC (lempar Error dengan message dari Supabase), STATUS_META (label, warna chip),
   formatter Rupiah/liter/tanggal-jam per timezone port (Intl.DateTimeFormat timeZone).
   src/utils/CostAgentVoyageImport.ts: SALIN file yang saya berikan apa adanya (helper impor Excel voyage).
   src/components/CostAgentUi.tsx: StatusChip, CompareFlagChip (sesuai/naik/turun/tanpa_history/item_baru),
   MatchLevelLabel (same_vessel_port="Same vessel & port", nearest_dwt="Nearest DWT (Δ n)", nearest_port="Nearest port (n km)"),
   memakai token SeaAirAuditUi.

E. docs/claude/cost-agent.md (ringkas: tabel, RPC, alur status, webhook, page keys) + 1 baris di tabel CLAUDE.md.
```

---

## PROMPT 2 — Voyages: form (format Voyage Report), import Excel, tarik dari aplikasi lain, baca laporan via AI

```
[tempel KONTEKS COST AGENT]

Buat CostAgentVoyagePage (/cost-agent/voyage). Data mengikuti format "VOYAGE REPORT" bulanan per kapal:
1 voyage = 1 pelabuhan MUAT + 1..n pelabuhan BONGKAR berurutan, tiap pelabuhan punya
Arrival (Tiba), Berthed (Sandar), Commenced (Mulai), Completed (Selesai), Departure (Berangkat) dalam jam lokal (LT),
plus cargo per produk (mis. B50, PERTALITE) dalam liters at 15°C, dan catatan ETA pelabuhan berikutnya.

A. List (pola BunkerPage, sumber cost_agent_voyage_list_v)
   - Filter: company, vessel, report month (default bulan berjalan), status (draft/confirmed), source.
   - Kolom: Report Month, Vessel (+type), Voy, Seq, Charter, Route (badge per port), First Arrival, Last Departure,
     Cargo Total (+unit), Invoices (count), Next ETA, Status (Draft = kuning "needs review"), Source.
   - Mode "Monthly Report" (toggle): untuk 1 kapal + 1 bulan tampilkan tabel persis layout laporan
     (NO URUT | NO VOY | LOAD: Arrival, Berthed, Commenced, Completed, Departure | DISCHARGE (baris per port) | CARGO per produk)
     + total cargo bulan itu + ETA berikutnya. Tombol "Export Excel" dengan layout yang sama (SheetJS).
   - Klik baris -> drawer detail (fn_cost_agent_get_voyage): timeline pelabuhan (handling_hours, port_stay_hours),
     cargo, dan daftar invoice per pelabuhan singgah (status chip, link ke invoice) + tombol "Upload invoice for this port call"
     (membuka upload Prompt 3 dengan voyage_call_id terisi).

B. Form Voyage (modal besar / halaman, untuk create & edit; edit memuat fn_cost_agent_get_voyage)
   Header: Vessel (searchable cost_agent_vessels, tampilkan type & DWT; company default dari kapal), Company,
   Voyage No (wajib), Seq in Report, Charter Type (COA/TC/SPOT/lainnya, bebas ketik), Report Month (month picker),
   Next Port + Next ETA (opsional), Remarks.
   Port calls (tabel dinamis, minimal 1; tombol "Add discharge port"; drag/up-down untuk urutan; seq = urutan):
     Port (searchable cost_agent_ports by code/name/aliases; port is_verified=false diberi ikon warning),
     Activity (Load/Discharge/Load & Discharge/STS/Bunker/Docking/Other -> muat/bongkar/bongkar_muat/sts/bunker/docking/lainnya),
     Arrival, Berthed, Commenced, Completed, Departure (datetime-local; tampilkan zona port, mis. "WIB"/"WITA"),
     Handling hours & port stay (hitung live, read-only). Baris pertama default activity Load.
     Validasi live pakai validateCallTimes() dari CostAgentVoyageImport.ts (warning kuning, tidak memblok).
     Hapus port call yang sudah punya invoice -> disable + tooltip.
   Cargo (tabel dinamis): Product (combobox: B50, PERTALITE, SOLAR, PERTAMAX, AVTUR, SEMEN CURAH, bebas ketik), Qty, Unit (L15/MT/KL/BBL),
     Discharge port (opsional, pilih dari port calls bongkar). Tampilkan total per unit.
   Simpan -> fn_cost_agent_save_voyage(p_voyage, 'manual', email). Tampilkan warnings[] dari server.
   Voyage berstatus draft (hasil AI/import) punya tombol "Confirm" (save dengan status 'confirmed').
   Payload: { id?, vessel_id, company_code, voyage_no, seq_in_report, charter_type, report_month:'YYYY-MM-01',
     next_port, next_eta_at:'YYYY-MM-DD HH:mm', status, remarks,
     calls:[{seq, port_id, activity, arrived_at, berthed_at, commenced_at, completed_at, departed_at}],
     cargo:[{product, qty, unit, call_seq}] }

C. Import Excel
   - "Download Template" -> sajikan file template_import_voyage.xlsx yang saya berikan (taruh di public/templates/).
   - "Import Excel": parse SheetJS (baris 1 = nama kolom, baris 2 = judul -> buang), groupFlatVoyageRows(),
     tampilkan preview per voyage (route, jumlah port, cargo) + problems[]; kirim ke fn_cost_agent_upsert_voyages(rows,'import')
     per 50 voyage; tampilkan errors[] per voyage.

D. Ambil dari aplikasi lain
   - Tombol "Pull from source system": modal date from/to (wajib) + vessel (opsional) ->
     POST /api/n8n-proxy-json (X-Webhook-Type: cost_agent_voyage_pull) {date_from, date_to, vessel_name}.
     Tampilkan {saved, errors[]} lalu refresh. Voyage source='api' diberi badge "API"; field dari sumber read-only kecuali Remarks.
   - Tombol "Read Voyage Report (AI)": upload PDF/foto laporan via proxy multipart (X-Webhook-Type: cost_agent_voyage,
     cost_agent_meta {company_code, hint}). Respons berisi voyages tersimpan sebagai DRAFT + ai.cargo_total_match;
     bila false tampilkan peringatan "Cargo total differs from report". Arahkan user membuka draft untuk dicek & Confirm.
```

---

## PROMPT 3 — Agency Invoices: upload, daftar, review + history, verifikasi, faktur pajak

```
[tempel KONTEKS COST AGENT]

Buat CostAgentInvoicePage (/cost-agent/invoice/:id?) + CostAgentUploadModal + CostAgentInvoiceReviewModal.

A. Upload (turunan BunkerUploadModal)
   - Satu upload = SATU invoice; boleh beberapa file sekaligus (invoice + faktur pajak + lampiran) -> file_0..n.
   - Field: Company (wajib), Voyage port call (opsional; combobox "MT. EXPO · Voy 5 · LSM (6 Sep)" dari voyage list;
     terisi otomatis bila dibuka dari drawer voyage), Note/hint (opsional).
   - Kirim lewat proxy multipart X-Webhook-Type: cost_agent, cost_agent_meta = JSON {company_code, voyage_call_id, hint}.
     Respons {job_id (uuid), invoice_id, mode:'invoice'} -> invoice langsung tampil di list sebagai Processing.
   - Mode "Batch": banyak invoice sekaligus = beberapa request berurutan (1 request per invoice).

B. List (cost_agent_invoice_list_v, pola BunkerPage)
   - Tab status (lihat KONTEKS). Kolom: Invoice Date, Vendor, Invoice No, Vessel, Port, Voyage, Total, flags:
     "▲ n higher" (naik_count), "n new items" (baru_count), "Duplicate of #id", "Tax: match/mismatch/—",
     PO numbers (chips dari po_numbers), ikon dokumen (document_count; spinner bila documents_processing > 0), Status.
   - Polling 5 detik HANYA selama ada baris status processing atau documents_processing > 0 (pola Bunker), berhenti otomatis.
   - Status failed: tampilkan error_message + tombol "Reprocess" -> kirim ulang via proxy dengan
     cost_agent_meta {reprocess_invoice_id: id} TANPA file (n8n mengunduh ulang dari Drive).

C. Review modal (satu panggilan fn_cost_agent_get_invoice_history)
   1. Header: vendor, vessel (+type, DWT), port, voyage + port call (tiba–berangkat), invoice no/date, company,
      subtotal, VAT, WHT, stamp duty, grand total, lines_total. check_notes sebagai alert.
      Status verification/rejected: koreksi vendor/vessel/port/port call -> fn_cost_agent_update_invoice_header (lalu reload).
   2. Split view: viewer file (files[] / file_url Google Drive -> embed preview /preview) | tabel baris.
   3. Tabel baris + sub-baris history (maks 2 dari RPC):
      Line: No, Description, Cost Item (select, editable), Qty × Price, Amount, CompareFlagChip (+/- %), Remark,
      "Use as reference" (include_in_history), Verified (checkbox).
      History rows: MatchLevelLabel, date, invoice no, voyage, vessel (DWT), port, vendor, amount, Δ vs current (Rp & %).
      Baris item_baru: "Not in cost master yet" + tombol "Add as new cost item" (modal code/name/category/GL/keywords)
      -> fn_cost_agent_add_cost_item lalu fn_cost_agent_verify_line(new_id). Ubah cost item / verifikasi ->
      fn_cost_agent_verify_line(p_learn_alias => true). Tombol "Verify all matching" (flag sesuai saja). Footer total per flag.
   4. Tab "Documents & Tax" (dokumen susulan ke invoice yang SAMA, tanpa membuat invoice baru):
      - Tombol "Upload supporting documents" (boleh multi-file: faktur pajak, PO, kwitansi, lampiran) -> proxy multipart
        X-Webhook-Type: cost_agent, cost_agent_meta = JSON {mode:'susulan', invoice_id, hint}. Respons {job_id, invoice_id, mode:'susulan'}.
        Tersedia di semua status kecuali processing/cancelled. Status invoice TIDAK berubah karena susulan.
      - Daftar documents[] (dari RPC): file (link Drive), doc_type chip, status (processing/done/failed + error_message),
        uploader, waktu, ringkasan AI (extracted.summary). Poll 5 dtk selama ada dokumen status processing
        (query cost_agent_invoice_documents where job_id = ...).
      - PO numbers: tampilkan invoice.po_numbers sebagai chips (terisi otomatis dari invoice atau dokumen PO susulan).
      - Daftar tax_checks (status match/mismatch/error, no FP, tanggal, NPWP seller/buyer, DPP, VAT, tabel check_results
        field/expected/actual/ok) + link ke dokumennya (documents[].tax_check_id).
      - check_notes bertipe 'susulan_mismatch' (dokumen menyebut no invoice lain) tampil sebagai alert kuning.
      Bila FP/PO sudah ikut di file invoice awal, datanya sudah terisi otomatis saat AI memproses invoice.
   5. Tab "Timeline" (timeline[]).
   6. Aksi: verification/rejected -> "Submit for approval" (fn_cost_agent_submit_for_approval; disable + jumlah baris
      belum verified). waiting_approval -> panel approval (Prompt 4). approved/journal -> tombol payment (Prompt 5).
```

---

## PROMPT 4 — Approval Matrix + inbox + panel approval

```
[tempel KONTEKS COST AGENT]

A. CostAgentApprovalMatrixPage (/cost-agent/approval-matrix), CRUD langsung tabel cost_agent_approval_matrix
   (edit hanya bila canEdit('cost_agent_approval_matrix')).
   - Kolom: Rule name, Company (kosong = all), Vendor (kosong = all), Min, Max (kosong = no limit), Step, Approver label,
     Approver emails (chips; autocomplete dari profil user aplikasi), Role (opsional), Active.
   - Tampilan "ladder" per (company, vendor, range): "WNS • 0 – 50M : Step 1 Finance Supervisor"
     "WNS • > 50M : Step 1 Supervisor → Step 2 Finance Manager".
   - Validasi: max >= min, step 1..10, minimal 1 email. Tombol Duplicate rule.
   - Panel "Simulate": company + vendor + amount -> rpc fn_cost_agent_matrix_for -> step yang terbentuk.
   - Warning bila ada rentang nominal yang tidak tertutup aturan aktif untuk suatu company (submit akan gagal).

B. Inbox "My Approvals" (tab di halaman invoice): invoice waiting_approval yang step pending terendah (round terakhir)
   memuat email user di approver_emails (cost_agent_approvals, decision='pending', approver_emails cs {email}).
   Badge jumlah di sidebar memakai pola *_CHANGED_EVENT yang ada.

C. Panel approval di review modal: ladder step (approved/pending/rejected/skipped, oleh siapa, kapan, catatan).
   Bila user approver step aktif dan canEdit('cost_agent_invoice'): Approve / Reject (catatan wajib saat reject)
   -> fn_cost_agent_decide_approval. Ringkasan sebelum memutuskan: jumlah baris higher/new + total selisih vs history.
   Approve terakhir -> status Approved, respons history_rows -> toast "n lines saved as cost reference".
```

---

## PROMPT 5 — Payment: AP Note / PV + Mark paid

```
[tempel KONTEKS COST AGENT]

Buat CostAgentPaymentModal (fitur cost_agent_payment, pola FinanceHandoverPage), dibuka dari review invoice
status approved (dan multi-select di tab Approved; 1 request per invoice).
- Document type: AP Note | PV.
- Ringkasan: vendor, invoice no, vessel, voyage, port, subtotal, VAT, WHT (editable, default invoice.pph), stamp duty,
  amount to pay (default grand_total; alasan wajib bila diubah).
- Due date, vendor bank (bank, account name, account no; saran terakhir per vendor dari localStorage), description
  (default "Agency cost {vessel} voy {voyage} at {port} - {invoice no}").
- Journal lines (editable): default debit per baris invoice (gl_account, description, amount) + VAT in + credit AP vendor
  (akun AP & VAT dari konstanta di CostAgentHelpers.ts). Validasi total debit = total kredit.
- Status tax invoice terakhir; mismatch/belum ada -> warning + konfirmasi.
- "Send to Finance": 1) fn_cost_agent_create_payment_request(...) -> request_id
  2) POST /api/n8n-proxy-json (X-Webhook-Type: cost_agent_payment) {request_id}. n8n memposting ke sistem finance dan
     menandai hasil -> invoice "Journal (AP/PV)" + doc_no. Tampilkan hasil; tab "Payments" di review menampilkan payments[]
     (type, doc no, status, time, response bila failed) + "Resend" untuk yang failed.
- "Mark as paid" (status journal, canEdit('cost_agent_payment')): paid date + bank reference -> fn_cost_agent_mark_paid. Tanpa upload bukti.
```
