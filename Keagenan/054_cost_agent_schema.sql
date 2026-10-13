-- =====================================================================
-- COST AGENT (Biaya Keagenan) - Schema & Functions
-- Supabase / Postgres 15+
-- Semua objek berawalan cost_agent_ agar tidak bentrok dengan sistem lain
-- (Bunker, Sea&Air, FAR Overseas Air, dll) di Supabase yang sama.
-- Idempotent: aman dijalankan ulang (create if not exists / create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper normalisasi teks
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]+', ' ', 'g')), '');
$$;

-- Nama kapal tanpa prefix (MV./MT./TB./LPGC./SV./BG./KM./SPOB.)
create or replace function public.fn_cost_agent_vessel_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.fn_cost_agent_norm(
    regexp_replace(upper(coalesce(p, '')),
      '^\s*(MV|MT|TB|LPGC|LNGC|SV|BG|KM|SPOB|OB|AHTS|TK|KMP|MOTOR TANKER|MOTOR VESSEL)\s*[\.\s]\s*', '')
  );
$$;

-- Nama vendor tanpa "PT", ", PT", cabang dalam kurung
create or replace function public.fn_cost_agent_vendor_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.fn_cost_agent_norm(
    regexp_replace(
      regexp_replace(
        regexp_replace(upper(coalesce(p, '')), '\(.*?\)', ' ', 'g'),
      '(^|[\s,\.])(PT|PERSERO|TBK|CV)([\s,\.]|$)', ' ', 'g'),
    '(^|[\s,\.])(PT|PERSERO|TBK|CV)([\s,\.]|$)', ' ', 'g')
  );
$$;

-- ---------------------------------------------------------------------
-- 1. MASTER DATA
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.cost_agent_settings(key, value) values
  ('history_limit',      '2'::jsonb),
  ('tolerance_pct',      '5'::jsonb),     -- selisih <= 5% dianggap sesuai
  ('nearest_port_max_km','800'::jsonb),   -- batas fallback pelabuhan terdekat
  ('voyage_match_days',  '7'::jsonb)
on conflict (key) do nothing;

create table if not exists public.cost_agent_companies (
  code        text primary key,               -- WNS, MJS, AMT, GMI, TTP, GUN
  name        text,
  npwp        text,
  is_active   boolean not null default true
);

create table if not exists public.cost_agent_ports (
  id          bigint generated always as identity primary key,
  code        text not null unique,            -- kode internal: BLW, BJM, TBN, ...
  name        text not null,
  aliases     text[] not null default '{}',    -- variasi penulisan (BELAWAN, KR.RAYA, ...)
  province    text,
  lat         double precision,
  lon         double precision,
  tz          text not null default 'Asia/Jakarta',   -- jam lokal "LT" di laporan voyage (WIB/WITA/WIT)
  is_verified boolean not null default false,  -- false = nama/koordinat perlu dicek user
  source      text,                            -- SNI | TAMBAHAN | NON-STANDAR (history)  (file Singkatan Accurate)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cost_agent_ports_aliases_gin on public.cost_agent_ports using gin (aliases);
alter table public.cost_agent_ports add column if not exists source text;
alter table public.cost_agent_ports add column if not exists notes text;

create table if not exists public.cost_agent_vessels (
  id           bigint generated always as identity primary key,
  name         text not null,                  -- MT. GARUDA ASIA
  name_key     text not null unique,           -- GARUDA ASIA
  prefix       text,                           -- MT / MV / TB / LPGC
  vessel_type  text,                           -- SMALL TANKER, CEMENT CARRIER, MR, GP, ...
  dwt          numeric(12,2),
  gt           numeric(12,2),
  hp           numeric(12,2),
  year_built   int,
  company_code text references public.cost_agent_companies(code),
  short_code   text,                           -- singkatan 4 huruf di Accurate (EXPO, UTRA, MLUC, ...)
  aliases      text[] not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cost_agent_vessels_company_idx on public.cost_agent_vessels(company_code);
create index if not exists cost_agent_vessels_dwt_idx on public.cost_agent_vessels(dwt);
alter table public.cost_agent_vessels add column if not exists short_code text;
create index if not exists cost_agent_vessels_aliases_gin on public.cost_agent_vessels using gin (aliases);

create table if not exists public.cost_agent_vendors (
  id          bigint generated always as identity primary key,
  name        text not null,                   -- PERTAMINA TRANS KONTINENTAL
  name_key    text not null unique,
  npwp        text,
  aliases     text[] not null default '{}',    -- nama di invoice/AP (dengan cabang)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cost_agent_vendors_aliases_gin on public.cost_agent_vendors using gin (aliases);
create index if not exists cost_agent_vendors_npwp_idx on public.cost_agent_vendors(npwp) where npwp is not null;

-- Master jenis biaya (acuan compare). keywords dipakai klasifikasi otomatis.
create table if not exists public.cost_agent_cost_items (
  id          bigint generated always as identity primary key,
  code        text not null unique,            -- AGENCY_FEE, PNBP_LABUH, TUNDA, ...
  name        text not null,
  category    text not null,                   -- PORT, AGENCY, CREW, DOCUMENT, WATER, TAX, OTHER
  gl_account  text,                            -- default akun (61030, 61050, ...)
  keywords    text[] not null default '{}',    -- sudah dinormalisasi (fn_cost_agent_norm)
  priority    int not null default 100,        -- kecil = dicek lebih dulu
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Alias hasil belajar: deskripsi baris vendor -> cost item (diisi saat user verifikasi)
create table if not exists public.cost_agent_cost_item_aliases (
  id            bigint generated always as identity primary key,
  alias_norm    text not null,
  vendor_id     bigint references public.cost_agent_vendors(id) on delete cascade,
  cost_item_id  bigint not null references public.cost_agent_cost_items(id) on delete cascade,
  created_by    text,
  created_at    timestamptz not null default now()
);
create unique index if not exists cost_agent_cia_uniq
  on public.cost_agent_cost_item_aliases(alias_norm, coalesce(vendor_id, 0));
create index if not exists cost_agent_cia_item_idx on public.cost_agent_cost_item_aliases(cost_item_id);
create index if not exists cost_agent_cia_vendor_idx on public.cost_agent_cost_item_aliases(vendor_id);

-- ---------------------------------------------------------------------
-- 2. VOYAGE (format "Voyage Report": 1 voyage = 1+ pelabuhan muat, 1+ pelabuhan bongkar, cargo per produk)
--    cost_agent_voyages        : header (kapal, no voy, COA/TC, periode laporan, ETA berikut)
--    cost_agent_voyage_calls   : persinggahan pelabuhan berurutan (tiba, sandar, mulai, selesai, berangkat)
--    cost_agent_voyage_cargo   : muatan per produk (B50, Pertalite, Semen, ...) + satuan (L15, MT, KL)
--    Invoice keagenan ditautkan ke 1 port call (pelabuhan tempat biaya terjadi).
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_voyages (
  id               bigint generated always as identity primary key,
  vessel_id        bigint not null references public.cost_agent_vessels(id),
  company_code     text references public.cost_agent_companies(code),
  voyage_no        text not null,                 -- "5", "22 D / 2026"
  seq_in_report    int,                           -- "NO. URUT" di laporan bulanan
  charter_type     text,                          -- COA / TC / SPOT / ...
  report_month     date,                          -- bulan laporan (tgl 1), mis. 2026-09-01
  next_port_id     bigint references public.cost_agent_ports(id),   -- "ETA BELAWAN"
  next_eta_at      timestamptz,
  status           text not null default 'confirmed' check (status in ('draft','confirmed','closed')),
  remarks          text,
  extra            jsonb not null default '{}',
  source           text not null default 'manual' check (source in ('manual','api','import','ai')),
  external_ref     text,                          -- id di aplikasi sumber (upsert idempotent)
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists cost_agent_voyages_ext_uniq
  on public.cost_agent_voyages(source, external_ref) where external_ref is not null;
create unique index if not exists cost_agent_voyages_vessel_voy_uniq
  on public.cost_agent_voyages(vessel_id, voyage_no, coalesce(report_month, '1900-01-01'::date));
create index if not exists cost_agent_voyages_company_idx on public.cost_agent_voyages(company_code);
create index if not exists cost_agent_voyages_next_port_idx on public.cost_agent_voyages(next_port_id);
create index if not exists cost_agent_voyages_month_idx on public.cost_agent_voyages(report_month desc);

create table if not exists public.cost_agent_voyage_calls (
  id              bigint generated always as identity primary key,
  voyage_id       bigint not null references public.cost_agent_voyages(id) on delete cascade,
  seq             int not null,                   -- urutan persinggahan 1,2,3...
  port_id         bigint not null references public.cost_agent_ports(id),
  activity        text not null check (activity in ('muat','bongkar','bongkar_muat','sts','bunker','docking','lainnya')),
  arrived_at      timestamptz,                    -- TIBA
  anchored_at     timestamptz,                    -- lego jangkar (opsional)
  berthed_at      timestamptz,                    -- SANDAR
  commenced_at    timestamptz,                    -- MULAI muat/bongkar
  completed_at    timestamptz,                    -- SELESAI muat/bongkar
  departed_at     timestamptz,                    -- BERANGKAT
  handling_hours  numeric(10,2) generated always as
                    (round((extract(epoch from (completed_at - commenced_at)) / 3600.0)::numeric, 2)) stored,
  port_stay_hours numeric(10,2) generated always as
                    (round((extract(epoch from (departed_at - arrived_at)) / 3600.0)::numeric, 2)) stored,
  remarks         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (voyage_id, seq)
);
create index if not exists cost_agent_calls_match_idx on public.cost_agent_voyage_calls(port_id, arrived_at desc);
create index if not exists cost_agent_calls_voyage_idx on public.cost_agent_voyage_calls(voyage_id);

create table if not exists public.cost_agent_voyage_cargo (
  id          bigint generated always as identity primary key,
  voyage_id   bigint not null references public.cost_agent_voyages(id) on delete cascade,
  call_id     bigint references public.cost_agent_voyage_calls(id) on delete set null, -- pelabuhan bongkar (opsional)
  seq         int not null default 1,
  product     text not null,                     -- B50, PERTALITE, SEMEN CURAH, ...
  qty         numeric(18,3) not null,
  unit        text not null default 'L15',       -- L15 = liters at 15°C, MT, KL, BBL
  remarks     text,
  created_at  timestamptz not null default now()
);
create index if not exists cost_agent_cargo_voyage_idx on public.cost_agent_voyage_cargo(voyage_id);
create index if not exists cost_agent_cargo_call_idx on public.cost_agent_voyage_cargo(call_id);

-- ---------------------------------------------------------------------
-- 3. INVOICE + BARIS BIAYA
-- ---------------------------------------------------------------------
-- Alur status:
-- processing -> verification -> waiting_approval -> approved -> journal -> paid
--            \-> failed                 \-> rejected (kembali ke verification saat diedit)
create table if not exists public.cost_agent_invoices (
  id               bigint generated always as identity primary key,
  status           text not null default 'processing'
                     check (status in ('processing','failed','verification','waiting_approval',
                                       'rejected','approved','journal','paid','cancelled')),
  source           text not null default 'webhook' check (source in ('webhook','email','manual')),
  company_code     text references public.cost_agent_companies(code),
  vendor_id        bigint references public.cost_agent_vendors(id),
  vessel_id        bigint references public.cost_agent_vessels(id),
  port_id          bigint references public.cost_agent_ports(id),
  voyage_id        bigint references public.cost_agent_voyages(id),
  voyage_call_id   bigint references public.cost_agent_voyage_calls(id),
  -- nilai mentah dari AI (untuk audit & bila master belum cocok)
  vendor_name_raw  text,
  vendor_npwp_raw  text,
  vessel_name_raw  text,
  port_name_raw    text,
  voyage_no_raw    text,
  activity_raw     text,
  invoice_no       text,
  invoice_date     date,
  service_date     date,                 -- tanggal kegiatan (tiba/sandar) dari invoice
  period_start     date,
  period_end       date,
  currency         text not null default 'IDR',
  subtotal         numeric(18,2),
  ppn              numeric(18,2),
  pph              numeric(18,2),
  materai          numeric(18,2),
  grand_total      numeric(18,2),
  lines_total      numeric(18,2),        -- jumlah baris hasil AI (cek konsistensi)
  file_url         text,                 -- file utama (Google Drive view link)
  file_name        text,
  files            jsonb not null default '[]',   -- semua file batch: [{file_name, file_url, drive_id}]
  email_message_id text,
  ai_model         text,
  ai_raw           jsonb,
  check_notes      jsonb not null default '[]',   -- catatan validasi otomatis
  duplicate_of     bigint references public.cost_agent_invoices(id),
  error_message    text,
  uploaded_by      text,
  submitted_by     text,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  paid_at          timestamptz,
  paid_ref         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cost_agent_invoices_status_idx  on public.cost_agent_invoices(status, created_at desc);
create index if not exists cost_agent_invoices_vendor_no   on public.cost_agent_invoices(vendor_id, invoice_no);
create index if not exists cost_agent_invoices_vessel_idx  on public.cost_agent_invoices(vessel_id);
create index if not exists cost_agent_invoices_port_idx    on public.cost_agent_invoices(port_id);
create index if not exists cost_agent_invoices_voyage_idx  on public.cost_agent_invoices(voyage_id);
create index if not exists cost_agent_invoices_call_idx    on public.cost_agent_invoices(voyage_call_id);
create index if not exists cost_agent_invoices_company_idx on public.cost_agent_invoices(company_code);
create index if not exists cost_agent_invoices_dup_idx     on public.cost_agent_invoices(duplicate_of);
create unique index if not exists cost_agent_invoices_email_uniq
  on public.cost_agent_invoices(email_message_id) where email_message_id is not null;

create table if not exists public.cost_agent_invoice_lines (
  id                 bigint generated always as identity primary key,
  invoice_id         bigint not null references public.cost_agent_invoices(id) on delete cascade,
  line_no            int not null,
  description_raw    text not null,
  cost_item_id       bigint references public.cost_agent_cost_items(id),
  match_method       text,                    -- alias_vendor | alias | keyword | manual | none
  qty                numeric(14,3),
  unit               text,
  unit_price         numeric(18,2),
  amount             numeric(18,2) not null,
  gl_account         text,
  -- snapshot hasil compare saat diproses (untuk badge di list, cepat)
  compare_flag       text check (compare_flag in ('sesuai','naik','turun','tanpa_history','item_baru')),
  compare_level      text,                    -- same_vessel_port | nearest_dwt | nearest_port | none
  compare_ref_amount numeric(18,2),
  compare_diff_pct   numeric(9,2),
  remark             text,                    -- mis. "Biaya belum ada di record"
  include_in_history boolean not null default true,
  is_verified        boolean not null default false,
  verified_by        text,
  verified_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (invoice_id, line_no)
);
create index if not exists cost_agent_lines_item_idx on public.cost_agent_invoice_lines(cost_item_id);

-- ---------------------------------------------------------------------
-- 4. HISTORY BIAYA (tabel acuan compare - ramping & ter-index)
--    Diisi dari: import Excel lama + baris invoice yang sudah APPROVED.
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_cost_history (
  id                bigint generated always as identity primary key,
  cost_item_id      bigint not null references public.cost_agent_cost_items(id),
  port_id           bigint references public.cost_agent_ports(id),
  vessel_id         bigint references public.cost_agent_vessels(id),
  vendor_id         bigint references public.cost_agent_vendors(id),
  company_code      text,
  vessel_dwt        numeric(12,2),            -- snapshot DWT saat transaksi
  service_date      date not null,
  invoice_date      date,
  invoice_no        text,
  voyage_no         text,
  activity          text,
  description_raw   text,
  qty               numeric(14,3),
  unit_price        numeric(18,2),
  amount            numeric(18,2) not null,
  currency          text not null default 'IDR',
  gl_account        text,
  source            text not null check (source in ('import','app','manual')),
  source_invoice_id bigint references public.cost_agent_invoices(id) on delete set null,
  source_line_id    bigint references public.cost_agent_invoice_lines(id) on delete set null,
  source_ref        text unique,              -- kunci idempotent import (file:row)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
-- Level 1: item + pelabuhan + kapal, terbaru dulu
create index if not exists cost_agent_hist_l1
  on public.cost_agent_cost_history(cost_item_id, port_id, vessel_id, service_date desc)
  include (amount, vendor_id) where is_active;
-- Level 2: item + pelabuhan, kapal dengan DWT terdekat
create index if not exists cost_agent_hist_l2
  on public.cost_agent_cost_history(cost_item_id, port_id, vessel_dwt)
  include (service_date, amount) where is_active;
-- Level 3: item di pelabuhan lain (pelabuhan terdekat)
create index if not exists cost_agent_hist_l3
  on public.cost_agent_cost_history(port_id, cost_item_id, service_date desc) where is_active;
create index if not exists cost_agent_hist_vessel_idx  on public.cost_agent_cost_history(vessel_id);
create index if not exists cost_agent_hist_vendor_idx  on public.cost_agent_cost_history(vendor_id);
create index if not exists cost_agent_hist_inv_idx     on public.cost_agent_cost_history(source_invoice_id);
create index if not exists cost_agent_hist_line_idx    on public.cost_agent_cost_history(source_line_id);

-- ---------------------------------------------------------------------
-- 5. APPROVAL MATRIX & APPROVAL
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_approval_matrix (
  id              bigint generated always as identity primary key,
  name            text not null,                 -- "WNS < 50jt - Step 1 Supervisor"
  company_code    text references public.cost_agent_companies(code),  -- null = semua PT
  vendor_id       bigint references public.cost_agent_vendors(id),    -- null = semua vendor
  min_amount      numeric(18,2) not null default 0,
  max_amount      numeric(18,2),                 -- null = tanpa batas atas
  step_no         int not null check (step_no between 1 and 10),
  approver_label  text not null,                 -- "Finance Supervisor"
  approver_emails text[] not null default '{}',  -- siapa saja yg boleh approve step ini
  approver_role   text,                          -- opsional: role di aplikasi
  is_active       boolean not null default true,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (max_amount is null or max_amount >= min_amount)
);
create index if not exists cost_agent_matrix_lookup
  on public.cost_agent_approval_matrix(is_active, company_code, min_amount);
create index if not exists cost_agent_matrix_vendor_idx on public.cost_agent_approval_matrix(vendor_id);

create table if not exists public.cost_agent_approvals (
  id              bigint generated always as identity primary key,
  invoice_id      bigint not null references public.cost_agent_invoices(id) on delete cascade,
  round_no        int not null default 1,        -- naik tiap kali diajukan ulang setelah reject
  step_no         int not null,
  approver_label  text not null,
  approver_emails text[] not null default '{}',
  approver_role   text,
  decision        text not null default 'pending' check (decision in ('pending','approved','rejected','skipped')),
  decided_by      text,
  decided_at      timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  unique (invoice_id, round_no, step_no)
);
create index if not exists cost_agent_approvals_pending
  on public.cost_agent_approvals(decision, invoice_id) where decision = 'pending';
create index if not exists cost_agent_approvals_emails_gin
  on public.cost_agent_approvals using gin (approver_emails);

-- ---------------------------------------------------------------------
-- 6. PEMBAYARAN (AP Note / PV ke database finance lain)
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_payment_requests (
  id              bigint generated always as identity primary key,
  invoice_id      bigint not null references public.cost_agent_invoices(id) on delete cascade,
  doc_type        text not null check (doc_type in ('AP_NOTE','PV')),
  doc_no          text,                    -- nomor dari sistem tujuan (setelah posting)
  company_code    text,
  vendor_id       bigint references public.cost_agent_vendors(id),
  amount          numeric(18,2) not null,
  pph_amount      numeric(18,2) default 0,
  due_date        date,
  bank_name       text,
  bank_account_name text,
  bank_account_no text,
  description     text,
  journal_lines   jsonb not null default '[]',   -- [{gl_account, description, debit, credit}]
  status          text not null default 'draft'
                    check (status in ('draft','submitted','posted','failed','paid','cancelled')),
  posted_ref      text,
  posted_at       timestamptz,
  response        jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cost_agent_pay_invoice_idx on public.cost_agent_payment_requests(invoice_id);
create index if not exists cost_agent_pay_status_idx  on public.cost_agent_payment_requests(status);
create index if not exists cost_agent_pay_vendor_idx  on public.cost_agent_payment_requests(vendor_id);

-- ---------------------------------------------------------------------
-- 7. CEK FAKTUR PAJAK / DOKUMEN PENDUKUNG
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_tax_checks (
  id            bigint generated always as identity primary key,
  invoice_id    bigint not null references public.cost_agent_invoices(id) on delete cascade,
  doc_type      text not null default 'faktur_pajak' check (doc_type in ('faktur_pajak','invoice','lainnya')),
  status        text not null default 'processing' check (status in ('processing','match','mismatch','error')),
  file_url      text,
  file_name     text,
  fp_number     text,
  fp_date       date,
  seller_name   text,
  seller_npwp   text,
  buyer_name    text,
  buyer_npwp    text,
  dpp           numeric(18,2),
  ppn           numeric(18,2),
  extracted     jsonb,
  check_results jsonb not null default '[]',   -- [{field, expected, actual, ok}]
  error_message text,
  checked_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists cost_agent_tax_invoice_idx on public.cost_agent_tax_checks(invoice_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. LOG STATUS (timeline di aplikasi)
-- ---------------------------------------------------------------------
create table if not exists public.cost_agent_status_log (
  id           bigint generated always as identity primary key,
  invoice_id   bigint not null references public.cost_agent_invoices(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor        text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists cost_agent_status_log_inv on public.cost_agent_status_log(invoice_id, created_at);

-- =====================================================================
-- 9. RLS – 4 policy per tabel (select/insert/update/delete) mengikuti konvensi app:
--    has_page_access(page_key) untuk baca, has_edit_access(page_key) untuk tulis.
--    Bila fungsi tsb belum ada (mis. DB uji), fallback: authenticated boleh baca, tulis via RPC saja.
--    n8n memakai service_role -> bypass RLS.
-- =====================================================================
do $$
declare
  r record;
  has_page boolean := to_regprocedure('public.has_page_access(text)') is not null;
  has_edit boolean := to_regprocedure('public.has_edit_access(text)') is not null;
  sel text; wr text;
begin
  for r in select * from (values
      -- tabel, page_key baca, page_key tulis (null = hanya lewat RPC), master (dibaca semua halaman cost agent)
      ('cost_agent_settings',          'cost_agent_invoice',         null,                          true),
      ('cost_agent_companies',         'cost_agent_invoice',         'cost_agent_approval_matrix',  true),
      ('cost_agent_ports',             'cost_agent_invoice',         'cost_agent_voyage',           true),
      ('cost_agent_vessels',           'cost_agent_invoice',         'cost_agent_voyage',           true),
      ('cost_agent_vendors',           'cost_agent_invoice',         'cost_agent_invoice',          true),
      ('cost_agent_cost_items',        'cost_agent_invoice',         null,                          true),
      ('cost_agent_cost_item_aliases', 'cost_agent_invoice',         null,                          false),
      ('cost_agent_voyages',           'cost_agent_voyage',          null,                          true),
      ('cost_agent_voyage_calls',      'cost_agent_voyage',          null,                          true),
      ('cost_agent_voyage_cargo',      'cost_agent_voyage',          null,                          true),
      ('cost_agent_invoices',          'cost_agent_invoice',         null,                          false),
      ('cost_agent_invoice_lines',     'cost_agent_invoice',         null,                          false),
      ('cost_agent_cost_history',      'cost_agent_invoice',         null,                          false),
      ('cost_agent_approval_matrix',   'cost_agent_approval_matrix', 'cost_agent_approval_matrix',  false),
      ('cost_agent_approvals',         'cost_agent_invoice',         null,                          false),
      ('cost_agent_payment_requests',  'cost_agent_invoice',         null,                          false),
      ('cost_agent_tax_checks',        'cost_agent_invoice',         null,                          false),
      ('cost_agent_status_log',        'cost_agent_invoice',         null,                          false)
    ) as t(tbl, read_key, write_key, is_master)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    -- bersihkan policy versi lama
    execute format('drop policy if exists %I on public.%I', r.tbl || '_read', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_write', r.tbl);
    foreach sel in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', r.tbl || '_' || sel, r.tbl);
    end loop;

    -- SELECT: master boleh dibaca siapa pun yang punya akses salah satu halaman cost agent
    if not has_page then
      sel := 'true';
    elsif r.is_master then
      sel := '(select public.has_page_access(''cost_agent_invoice'')) or (select public.has_page_access(''cost_agent_voyage''))'
          || ' or (select public.has_page_access(''cost_agent_approval_matrix''))';
    else
      sel := format('(select public.has_page_access(%L))', r.read_key);
    end if;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', r.tbl || '_select', r.tbl, sel);

    wr := case when r.write_key is null then 'false'
               when has_edit then format('(select public.has_edit_access(%L))', r.write_key)
               else 'true' end;
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tbl || '_insert', r.tbl, wr);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.tbl || '_update', r.tbl, wr, wr);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.tbl || '_delete', r.tbl, wr);
  end loop;
end $$;

-- =====================================================================
-- 10. FUNCTIONS
-- =====================================================================

-- Peran pemanggil: 'service_role' (n8n), 'authenticated' (app), '' (SQL editor / psql langsung)
create or replace function public.fn_cost_agent_caller_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
$$;

-- Guard RPC dari aplikasi: user wajib punya hak edit halaman (konvensi has_edit_access app).
-- n8n (service_role) dan akses langsung DB dilewati.
create or replace function public.fn_cost_agent_assert_edit(p_page_key text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare v_ok boolean;
begin
  if public.fn_cost_agent_caller_role() <> 'authenticated' then return; end if;
  if to_regprocedure('public.has_edit_access(text)') is null then return; end if;
  execute 'select public.has_edit_access($1)' into v_ok using p_page_key;
  if not coalesce(v_ok, false) then
    raise exception 'Akses ditolak: tidak punya hak edit %', p_page_key using errcode = '42501';
  end if;
end $$;

-- Guard fungsi yang hanya boleh dipanggil n8n (service_role) / langsung dari DB
create or replace function public.fn_cost_agent_assert_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.fn_cost_agent_caller_role() in ('authenticated', 'anon') then
    raise exception 'Fungsi ini khusus proses n8n' using errcode = '42501';
  end if;
end $$;

-- actor: email dari JWT Supabase Auth bila ada, kalau tidak pakai parameter
create or replace function public.fn_cost_agent_actor(p_actor text default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), nullif(p_actor, ''), 'system');
$$;

create or replace function public.fn_cost_agent_setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.cost_agent_settings where key = p_key), p_default);
$$;

create or replace function public.fn_cost_agent_set_status(
  p_invoice_id bigint, p_to text, p_actor text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_from text;
begin
  select status into v_from from public.cost_agent_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', p_invoice_id; end if;
  update public.cost_agent_invoices set status = p_to, updated_at = now() where id = p_invoice_id;
  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, v_from, p_to, public.fn_cost_agent_actor(p_actor), p_note);
end $$;

-- ---------- Resolver master ----------
create or replace function public.fn_cost_agent_resolve_vessel(p_name text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from public.cost_agent_vessels v
  where v.name_key = public.fn_cost_agent_vessel_key(p_name)
     or public.fn_cost_agent_vessel_key(p_name) = any (v.aliases)
  order by (v.name_key = public.fn_cost_agent_vessel_key(p_name)) desc
  limit 1;
$$;

create or replace function public.fn_cost_agent_resolve_vendor(p_name text, p_npwp text default null)
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from (
    select id, 1 as rk from public.cost_agent_vendors
     where p_npwp is not null and regexp_replace(npwp, '\D', '', 'g') = regexp_replace(p_npwp, '\D', '', 'g')
    union all
    select id, 2 from public.cost_agent_vendors where name_key = public.fn_cost_agent_vendor_key(p_name)
    union all
    select id, 3 from public.cost_agent_vendors where public.fn_cost_agent_vendor_key(p_name) = any (aliases)
    union all  -- nama vendor di invoice lebih panjang/pendek dari master
    select id, 4 from public.cost_agent_vendors
     where length(name_key) >= 8
       and (public.fn_cost_agent_vendor_key(p_name) like name_key || '%'
            or name_key like public.fn_cost_agent_vendor_key(p_name) || '%')
  ) s order by rk limit 1;
$$;

create or replace function public.fn_cost_agent_resolve_port(p_name text)
returns bigint
language sql
stable
set search_path = ''
as $$
  with k as (select public.fn_cost_agent_norm(p_name) as n)
  select p.id from public.cost_agent_ports p, k
  where k.n is not null
    and (p.code = k.n or public.fn_cost_agent_norm(p.name) = k.n or k.n = any (p.aliases)
         -- "DERMAGA PT. SEMEN INDONESIA ... BALIKPAPAN" -> cari nama pelabuhan di dalam teks
         or (length(public.fn_cost_agent_norm(p.name)) >= 4 and k.n like '%' || public.fn_cost_agent_norm(p.name) || '%'))
  order by (p.code = k.n) desc, (public.fn_cost_agent_norm(p.name) = k.n) desc, (k.n = any (p.aliases)) desc,
           length(p.name) desc
  limit 1;
$$;

-- Klasifikasi deskripsi baris -> cost item.
-- Urutan: alias khusus vendor > alias umum > keyword (priority) > null (item baru)
create or replace function public.fn_cost_agent_resolve_cost_item(
  p_desc text, p_vendor_id bigint default null,
  out cost_item_id bigint, out method text)
language plpgsql
stable
set search_path = ''
as $$
declare v_norm text := public.fn_cost_agent_norm(p_desc);
begin
  if v_norm is null then method := 'none'; return; end if;

  select a.cost_item_id into cost_item_id from public.cost_agent_cost_item_aliases a
   where a.alias_norm = v_norm and a.vendor_id = p_vendor_id limit 1;
  if found then method := 'alias_vendor'; return; end if;

  select a.cost_item_id into cost_item_id from public.cost_agent_cost_item_aliases a
   where a.alias_norm = v_norm and a.vendor_id is null limit 1;
  if found then method := 'alias'; return; end if;

  select ci.id into cost_item_id
    from public.cost_agent_cost_items ci
   where ci.is_active
     and exists (select 1 from unnest(ci.keywords) kw where ' ' || v_norm || ' ' like '% ' || kw || ' %')
   order by ci.priority, ci.id
   limit 1;
  if found then method := 'keyword'; return; end if;

  method := 'none';
end $$;

-- ---------------------------------------------------------------------
-- CORE: history per baris biaya (maks N, default 2) dengan fallback:
--   L1 same_vessel_port : item + pelabuhan + kapal yang sama (vendor sama didahulukan)
--   L2 nearest_dwt      : item + pelabuhan sama, kapal lain dengan DWT terdekat
--   L3 nearest_port     : item sama, pelabuhan terdekat (butuh lat/lon), DWT terdekat
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_get_line_history(
  p_cost_item_id      bigint,
  p_port_id           bigint,
  p_vessel_id         bigint,
  p_vendor_id         bigint default null,
  p_exclude_invoice_id bigint default null,
  p_limit             int default null)
returns table (
  match_level   text,
  history_id    bigint,
  service_date  date,
  invoice_no    text,
  voyage_no     text,
  amount        numeric,
  qty           numeric,
  unit_price    numeric,
  vessel_name   text,
  vessel_dwt    numeric,
  port_code     text,
  port_name     text,
  vendor_name   text,
  distance_km   numeric,
  dwt_diff      numeric,
  description_raw text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit int := coalesce(p_limit, public.fn_cost_agent_setting_num('history_limit', 2)::int);
  v_dwt   numeric;
  v_lat   double precision;
  v_lon   double precision;
  v_maxkm numeric := public.fn_cost_agent_setting_num('nearest_port_max_km', 800);
  v_found int;
begin
  if p_cost_item_id is null then return; end if;
  select dwt into v_dwt from public.cost_agent_vessels where id = p_vessel_id;
  select lat, lon into v_lat, v_lon from public.cost_agent_ports where id = p_port_id;

  -- L1
  if p_port_id is not null and p_vessel_id is not null then
    return query
      select 'same_vessel_port'::text, h.id, h.service_date, h.invoice_no, h.voyage_no, h.amount, h.qty,
             h.unit_price, v.name, h.vessel_dwt, p.code, p.name, vd.name, 0::numeric, 0::numeric, h.description_raw
        from public.cost_agent_cost_history h
        join public.cost_agent_vessels v on v.id = h.vessel_id
        join public.cost_agent_ports p on p.id = h.port_id
        left join public.cost_agent_vendors vd on vd.id = h.vendor_id
       where h.is_active and h.cost_item_id = p_cost_item_id and h.port_id = p_port_id
         and h.vessel_id = p_vessel_id
         and (p_exclude_invoice_id is null or h.source_invoice_id is distinct from p_exclude_invoice_id)
       order by (h.vendor_id is not distinct from p_vendor_id) desc, h.service_date desc, h.id desc
       limit v_limit;
    get diagnostics v_found = row_count;
    if v_found > 0 then return; end if;
  end if;

  -- L2
  if p_port_id is not null then
    return query
      select 'nearest_dwt'::text, h.id, h.service_date, h.invoice_no, h.voyage_no, h.amount, h.qty,
             h.unit_price, v.name, h.vessel_dwt, p.code, p.name, vd.name, 0::numeric,
             round(abs(coalesce(h.vessel_dwt, 0) - coalesce(v_dwt, 0)), 0), h.description_raw
        from public.cost_agent_cost_history h
        left join public.cost_agent_vessels v on v.id = h.vessel_id
        join public.cost_agent_ports p on p.id = h.port_id
        left join public.cost_agent_vendors vd on vd.id = h.vendor_id
       where h.is_active and h.cost_item_id = p_cost_item_id and h.port_id = p_port_id
         and h.vessel_id is distinct from p_vessel_id
         and (p_exclude_invoice_id is null or h.source_invoice_id is distinct from p_exclude_invoice_id)
       order by (h.vessel_dwt is null), abs(coalesce(h.vessel_dwt, 0) - coalesce(v_dwt, 0)),
                h.service_date desc, h.id desc
       limit v_limit;
    get diagnostics v_found = row_count;
    if v_found > 0 then return; end if;
  end if;

  -- L3 (butuh koordinat pelabuhan)
  if v_lat is not null and v_lon is not null then
    return query
      with near_ports as (
        select p.id, p.code, p.name,
               (6371 * 2 * asin(sqrt(power(sin(radians(p.lat - v_lat) / 2), 2)
                 + cos(radians(v_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lon - v_lon) / 2), 2))))::numeric as km
          from public.cost_agent_ports p
         where p.lat is not null and p.id <> p_port_id
           and exists (select 1 from public.cost_agent_cost_history h0
                        where h0.port_id = p.id and h0.cost_item_id = p_cost_item_id and h0.is_active)
         order by 4
         limit 3
      )
      select 'nearest_port'::text, h.id, h.service_date, h.invoice_no, h.voyage_no, h.amount, h.qty,
             h.unit_price, v.name, h.vessel_dwt, np.code, np.name, vd.name, round(np.km, 0),
             round(abs(coalesce(h.vessel_dwt, 0) - coalesce(v_dwt, 0)), 0), h.description_raw
        from near_ports np
        join lateral (
          select * from public.cost_agent_cost_history h1
           where h1.port_id = np.id and h1.cost_item_id = p_cost_item_id and h1.is_active
             and (p_exclude_invoice_id is null or h1.source_invoice_id is distinct from p_exclude_invoice_id)
           order by (h1.vessel_id is not distinct from p_vessel_id) desc,
                    abs(coalesce(h1.vessel_dwt, 0) - coalesce(v_dwt, 0)), h1.service_date desc
           limit v_limit
        ) h on true
        left join public.cost_agent_vessels v on v.id = h.vessel_id
        left join public.cost_agent_vendors vd on vd.id = h.vendor_id
       where np.km <= v_maxkm
       order by np.km, (h.vessel_id is not distinct from p_vessel_id) desc,
                abs(coalesce(h.vessel_dwt, 0) - coalesce(v_dwt, 0)), h.service_date desc
       limit v_limit;
  end if;
end $$;

-- Satu panggilan untuk 1 invoice: header + semua baris + history masing-masing.
-- Dipakai halaman review & approval di aplikasi.
create or replace function public.fn_cost_agent_get_invoice_history(p_invoice_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) || jsonb_build_object(
        'vendor_name', vd.name, 'vessel_name', vs.name, 'vessel_dwt', vs.dwt, 'vessel_type', vs.vessel_type,
        'port_code', p.code, 'port_name', p.name,
        'voyage', case when vy.id is null then null else to_jsonb(vy) end,
        'voyage_call', case when vc.id is null then null else to_jsonb(vc) end),
    'lines', coalesce((
      select jsonb_agg(
               to_jsonb(l) || jsonb_build_object(
                 'cost_item_code', ci.code, 'cost_item_name', ci.name,
                 'history', coalesce((
                    select jsonb_agg(to_jsonb(hx))
                      from public.fn_cost_agent_get_line_history(
                             l.cost_item_id, i.port_id, i.vessel_id, i.vendor_id, i.id, null) hx), '[]'::jsonb))
               order by l.line_no)
        from public.cost_agent_invoice_lines l
        left join public.cost_agent_cost_items ci on ci.id = l.cost_item_id
       where l.invoice_id = i.id), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(a) order by a.round_no, a.step_no)
                             from public.cost_agent_approvals a where a.invoice_id = i.id), '[]'::jsonb),
    'tax_checks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
                              from public.cost_agent_tax_checks t where t.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.created_at desc)
                            from public.cost_agent_payment_requests pr where pr.invoice_id = i.id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
                            from public.cost_agent_status_log s where s.invoice_id = i.id), '[]'::jsonb)
  )
  from public.cost_agent_invoices i
  left join public.cost_agent_vendors vd on vd.id = i.vendor_id
  left join public.cost_agent_vessels vs on vs.id = i.vessel_id
  left join public.cost_agent_ports p on p.id = i.port_id
  left join public.cost_agent_voyages vy on vy.id = i.voyage_id
  left join public.cost_agent_voyage_calls vc on vc.id = i.voyage_call_id
  where i.id = p_invoice_id;
$$;

-- Hitung ulang snapshot compare (flag) untuk semua baris 1 invoice
create or replace function public.fn_cost_agent_refresh_compare(p_invoice_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record; h record;
  v_tol numeric := public.fn_cost_agent_setting_num('tolerance_pct', 5);
  v_inv public.cost_agent_invoices%rowtype;
  v_pct numeric;
begin
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id;
  for r in select * from public.cost_agent_invoice_lines where invoice_id = p_invoice_id loop
    h := null;
    if r.cost_item_id is null then
      update public.cost_agent_invoice_lines
         set compare_flag = 'item_baru', compare_level = 'none', compare_ref_amount = null, compare_diff_pct = null,
             remark = coalesce(remark, 'Biaya belum ada di record master'), updated_at = now()
       where id = r.id;
      continue;
    end if;
    select * into h from public.fn_cost_agent_get_line_history(
      r.cost_item_id, v_inv.port_id, v_inv.vessel_id, v_inv.vendor_id, v_inv.id, 1) limit 1;
    if h.history_id is null then
      update public.cost_agent_invoice_lines
         set compare_flag = 'tanpa_history', compare_level = 'none', compare_ref_amount = null,
             compare_diff_pct = null, updated_at = now()
       where id = r.id;
    else
      v_pct := case when coalesce(h.amount, 0) = 0 then null
                    else round((r.amount - h.amount) / abs(h.amount) * 100, 2) end;
      update public.cost_agent_invoice_lines
         set compare_level = h.match_level, compare_ref_amount = h.amount, compare_diff_pct = v_pct,
             compare_flag = case when v_pct is null or abs(v_pct) <= v_tol then 'sesuai'
                                 when v_pct > 0 then 'naik' else 'turun' end,
             updated_at = now()
       where id = r.id;
    end if;
  end loop;
end $$;

-- ---------- n8n: buat record awal (status processing) ----------
create or replace function public.fn_cost_agent_create_invoice_stub(
  p_source text, p_file_url text, p_file_name text, p_uploaded_by text default null,
  p_voyage_id bigint default null, p_company_code text default null, p_email_message_id text default null,
  p_voyage_call_id bigint default null, p_reprocess_invoice_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint; v_status text;
begin
  perform public.fn_cost_agent_assert_service();
  -- proses ulang invoice yang gagal / masih processing: pakai id yang sama
  if p_reprocess_invoice_id is not null then
    select status into v_status from public.cost_agent_invoices where id = p_reprocess_invoice_id for update;
    if v_status is null then raise exception 'Invoice % tidak ditemukan', p_reprocess_invoice_id; end if;
    if v_status not in ('failed', 'processing') then
      raise exception 'Invoice % berstatus %, tidak bisa diproses ulang', p_reprocess_invoice_id, v_status;
    end if;
    update public.cost_agent_invoices set error_message = null where id = p_reprocess_invoice_id;
    if v_status = 'failed' then
      perform public.fn_cost_agent_set_status(p_reprocess_invoice_id, 'processing', p_uploaded_by, 'Proses ulang AI');
    end if;
    return p_reprocess_invoice_id;
  end if;
  if p_email_message_id is not null then
    select id into v_id from public.cost_agent_invoices where email_message_id = p_email_message_id;
    if found then return v_id; end if;
  end if;
  if p_voyage_call_id is not null and p_voyage_id is null then
    select voyage_id into p_voyage_id from public.cost_agent_voyage_calls where id = p_voyage_call_id;
  end if;
  insert into public.cost_agent_invoices(source, file_url, file_name, uploaded_by, voyage_id, voyage_call_id,
                                         company_code, email_message_id, status)
  values (coalesce(p_source, 'webhook'), p_file_url, p_file_name, p_uploaded_by, p_voyage_id, p_voyage_call_id,
          nullif(p_company_code, ''), p_email_message_id, 'processing')
  returning id into v_id;
  insert into public.cost_agent_status_log(invoice_id, to_status, actor, note)
  values (v_id, 'processing', coalesce(p_uploaded_by, 'n8n'), 'Invoice diterima, diproses AI');
  return v_id;
end $$;

create or replace function public.fn_cost_agent_mark_invoice_failed(p_invoice_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_cost_agent_assert_service();
  -- hanya invoice yang sedang diproses AI yang boleh jadi failed (jangan timpa invoice yang sudah diverifikasi)
  if exists (select 1 from public.cost_agent_invoices where id = p_invoice_id and status = 'processing') then
    update public.cost_agent_invoices set error_message = left(p_error, 2000) where id = p_invoice_id;
    perform public.fn_cost_agent_set_status(p_invoice_id, 'failed', 'n8n', left(p_error, 500));
  end if;
end $$;

-- Cari port call (pelabuhan dalam voyage) yang cocok untuk invoice:
-- kapal sama + pelabuhan sama + tanggal kegiatan invoice di dalam [tiba - N hari, berangkat + N hari],
-- atau no voyage sama. Bila p_voyage_id diisi (user upload dari halaman voyage), dibatasi ke voyage tsb.
create or replace function public.fn_cost_agent_match_voyage_call(
  p_vessel_id bigint, p_port_id bigint, p_service_date date, p_voyage_no text default null,
  p_voyage_id bigint default null)
returns table (voyage_id bigint, call_id bigint)
language sql
stable
set search_path = ''
as $$
  with d as (select public.fn_cost_agent_setting_num('voyage_match_days', 7)::int as n)
  select v.id, c.id
    from public.cost_agent_voyages v
    join public.cost_agent_voyage_calls c on c.voyage_id = v.id
    cross join d
   where (p_voyage_id is null or v.id = p_voyage_id)
     and (p_vessel_id is null or v.vessel_id = p_vessel_id)
     and (p_vessel_id is not null or p_voyage_id is not null)
     and (p_port_id is null or c.port_id = p_port_id)
     and (
       p_voyage_id is not null
       or (p_service_date is not null and c.arrived_at is not null
           and p_service_date between (c.arrived_at at time zone 'Asia/Jakarta')::date - d.n
                                  and (coalesce(c.departed_at, c.arrived_at) at time zone 'Asia/Jakarta')::date + d.n)
       or (p_voyage_no is not null
           and public.fn_cost_agent_norm(v.voyage_no) = public.fn_cost_agent_norm(regexp_replace(p_voyage_no, '^\s*VOY(AGE)?\.?\s*', '', 'i')))
     )
   order by (p_port_id is not null and c.port_id = p_port_id) desc,
            abs(coalesce((c.arrived_at at time zone 'Asia/Jakarta')::date, p_service_date)
                - coalesce(p_service_date, (c.arrived_at at time zone 'Asia/Jakarta')::date)) nulls last,
            c.seq
   limit 1;
$$;

-- ---------- n8n: simpan hasil AI (header + baris), resolve master, compare ----------
-- p_payload = {
--   "invoice_id": 123, "company_code": "WNS", "ai_model": "gemini-2.5-flash",
--   "header": {vendor_name, vendor_npwp, buyer_name, invoice_no, invoice_date, vessel_name, port_name,
--              voyage_no, activity, arrived_date, departed_date, period_start, period_end,
--              currency, subtotal, ppn, pph, materai, grand_total},
--   "lines": [{line_no, description, qty, unit, unit_price, amount}],
--   "ai_raw": {...} }
create or replace function public.fn_cost_agent_ingest_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       bigint := (p_payload ->> 'invoice_id')::bigint;
  h          jsonb  := coalesce(p_payload -> 'header', '{}'::jsonb);
  l          jsonb;
  v_inv      public.cost_agent_invoices%rowtype;
  v_vendor   bigint;
  v_vessel   bigint;
  v_port     bigint;
  v_voyage   bigint;
  v_call     bigint;
  v_service  date;
  v_dup      bigint;
  v_item     record;
  v_notes    jsonb := '[]'::jsonb;
  v_lines_total numeric := 0;
  v_n        int := 0;
  v_company  text;
begin
  perform public.fn_cost_agent_assert_service();
  if v_id is null then
    v_id := public.fn_cost_agent_create_invoice_stub('webhook', p_payload ->> 'file_url', p_payload ->> 'file_name');
  end if;
  select * into v_inv from public.cost_agent_invoices where id = v_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', v_id; end if;
  if v_inv.status not in ('processing', 'failed') then
    raise exception 'Invoice % sudah berstatus %, hasil AI tidak ditimpa', v_id, v_inv.status;
  end if;

  v_vendor := public.fn_cost_agent_resolve_vendor(h ->> 'vendor_name', h ->> 'vendor_npwp');
  v_vessel := public.fn_cost_agent_resolve_vessel(h ->> 'vessel_name');
  v_port   := public.fn_cost_agent_resolve_port(h ->> 'port_name');
  v_service := coalesce(nullif(h ->> 'arrived_date', '')::date, nullif(h ->> 'period_start', '')::date,
                        nullif(h ->> 'invoice_date', '')::date);

  -- PT pembeli: dari payload, dari voyage, atau dari master kapal
  v_company := coalesce(nullif(p_payload ->> 'company_code', ''), v_inv.company_code,
                        (select company_code from public.cost_agent_vessels where id = v_vessel));

  -- voyage/port call: pilihan user saat upload diutamakan, kapal & pelabuhan ikut dari data voyage
  if v_inv.voyage_call_id is not null then
    select c.voyage_id, c.id, coalesce(v_vessel, v.vessel_id), coalesce(v_port, c.port_id)
      into v_voyage, v_call, v_vessel, v_port
      from public.cost_agent_voyage_calls c join public.cost_agent_voyages v on v.id = c.voyage_id
     where c.id = v_inv.voyage_call_id;
  else
    select m.voyage_id, m.call_id into v_voyage, v_call
      from public.fn_cost_agent_match_voyage_call(
             coalesce(v_vessel, (select vessel_id from public.cost_agent_voyages where id = v_inv.voyage_id)),
             v_port, v_service, h ->> 'voyage_no', v_inv.voyage_id) m;
    v_voyage := coalesce(v_voyage, v_inv.voyage_id);
    if v_inv.voyage_id is not null then
      select coalesce(v_vessel, vessel_id) into v_vessel from public.cost_agent_voyages where id = v_inv.voyage_id;
      if v_port is null and v_call is not null then
        select port_id into v_port from public.cost_agent_voyage_calls where id = v_call;
      end if;
    end if;
  end if;
  if v_company is null and v_voyage is not null then
    select company_code into v_company from public.cost_agent_voyages where id = v_voyage;
  end if;

  if v_vendor is null then v_notes := v_notes || jsonb_build_object('type','vendor_unknown','msg','Vendor tidak ada di master: ' || coalesce(h ->> 'vendor_name','-')); end if;
  if v_vessel is null then v_notes := v_notes || jsonb_build_object('type','vessel_unknown','msg','Kapal tidak ada di master: ' || coalesce(h ->> 'vessel_name','-')); end if;
  if v_port   is null then v_notes := v_notes || jsonb_build_object('type','port_unknown','msg','Pelabuhan tidak ada di master: ' || coalesce(h ->> 'port_name','-')); end if;
  if v_call is null then v_notes := v_notes || jsonb_build_object('type','voyage_unmatched','msg','Voyage / pelabuhan singgah belum tercocokkan, pilih manual'); end if;

  -- duplikat (vendor + no invoice)
  if nullif(h ->> 'invoice_no', '') is not null then
    select id into v_dup from public.cost_agent_invoices
     where id <> v_id and status <> 'cancelled'
       and public.fn_cost_agent_norm(invoice_no) = public.fn_cost_agent_norm(h ->> 'invoice_no')
       and (vendor_id is not distinct from v_vendor)
     order by id limit 1;
    if v_dup is not null then
      v_notes := v_notes || jsonb_build_object('type','duplicate','msg','No invoice sama dengan invoice #' || v_dup);
    end if;
  end if;

  delete from public.cost_agent_invoice_lines where invoice_id = v_id;  -- re-process aman

  for l in select * from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) loop
    continue when nullif(l ->> 'amount', '') is null or (l ->> 'amount')::numeric = 0;
    v_n := v_n + 1;
    select * into v_item from public.fn_cost_agent_resolve_cost_item(l ->> 'description', v_vendor);
    insert into public.cost_agent_invoice_lines(
      invoice_id, line_no, description_raw, cost_item_id, match_method, qty, unit, unit_price, amount, gl_account,
      remark)
    values (
      v_id, coalesce((l ->> 'line_no')::int, v_n), coalesce(l ->> 'description', '-'), v_item.cost_item_id,
      v_item.method, nullif(l ->> 'qty', '')::numeric, l ->> 'unit', nullif(l ->> 'unit_price', '')::numeric,
      (l ->> 'amount')::numeric,
      (select gl_account from public.cost_agent_cost_items where id = v_item.cost_item_id),
      nullif(concat_ws(' | ', nullif(l ->> 'line_note', ''),
             case when v_item.cost_item_id is null then 'Biaya belum ada di record master' end), ''))
    on conflict (invoice_id, line_no) do update
      set description_raw = excluded.description_raw, amount = excluded.amount,
          cost_item_id = excluded.cost_item_id, match_method = excluded.match_method;
    v_lines_total := v_lines_total + (l ->> 'amount')::numeric;
  end loop;

  if nullif(h ->> 'subtotal', '') is not null
     and abs(v_lines_total - (h ->> 'subtotal')::numeric) > 1 then
    v_notes := v_notes || jsonb_build_object('type','total_mismatch',
      'msg', format('Jumlah baris %s <> subtotal invoice %s', v_lines_total, h ->> 'subtotal'));
  end if;

  update public.cost_agent_invoices set
    vendor_id = v_vendor, vessel_id = v_vessel, port_id = v_port, voyage_id = v_voyage, voyage_call_id = v_call,
    company_code = v_company,
    vendor_name_raw = h ->> 'vendor_name', vendor_npwp_raw = h ->> 'vendor_npwp',
    vessel_name_raw = h ->> 'vessel_name', port_name_raw = h ->> 'port_name',
    voyage_no_raw = h ->> 'voyage_no', activity_raw = h ->> 'activity',
    invoice_no = h ->> 'invoice_no', invoice_date = nullif(h ->> 'invoice_date', '')::date,
    service_date = v_service,
    period_start = nullif(h ->> 'period_start', '')::date, period_end = nullif(h ->> 'period_end', '')::date,
    currency = coalesce(nullif(h ->> 'currency', ''), 'IDR'),
    subtotal = nullif(h ->> 'subtotal', '')::numeric, ppn = nullif(h ->> 'ppn', '')::numeric,
    pph = nullif(h ->> 'pph', '')::numeric, materai = nullif(h ->> 'materai', '')::numeric,
    grand_total = nullif(h ->> 'grand_total', '')::numeric, lines_total = v_lines_total,
    ai_model = p_payload ->> 'ai_model', ai_raw = p_payload -> 'ai_raw',
    files = coalesce(p_payload -> 'files', files),
    file_url = coalesce(nullif(p_payload ->> 'file_url', ''), file_url),
    duplicate_of = v_dup, check_notes = v_notes, error_message = null, updated_at = now()
  where id = v_id;

  perform public.fn_cost_agent_refresh_compare(v_id);
  perform public.fn_cost_agent_set_status(v_id, 'verification', 'n8n', 'AI selesai, menunggu verifikasi user');

  -- faktur pajak ikut ter-scan di file invoice -> langsung dicek
  if nullif(p_payload #>> '{faktur_pajak,fp_number}', '') is not null then
    perform public.fn_cost_agent_save_tax_check(jsonb_build_object(
      'invoice_id', v_id, 'doc_type', 'faktur_pajak',
      'file_url', coalesce(p_payload ->> 'file_url', v_inv.file_url), 'file_name', v_inv.file_name,
      'extracted', p_payload -> 'faktur_pajak'));
  end if;

  return jsonb_build_object(
    'invoice_id', v_id, 'lines', v_n, 'lines_total', v_lines_total,
    'vendor_id', v_vendor, 'vessel_id', v_vessel, 'port_id', v_port, 'voyage_id', v_voyage, 'voyage_call_id', v_call,
    'duplicate_of', v_dup, 'notes', v_notes,
    'flags', (select jsonb_object_agg(f, c) from (
                select compare_flag f, count(*) c from public.cost_agent_invoice_lines
                 where invoice_id = v_id group by 1) s));
end $$;

-- ---------- App: koreksi header (kapal/pelabuhan/vendor/voyage) ----------
create or replace function public.fn_cost_agent_update_invoice_header(
  p_invoice_id bigint, p_vendor_id bigint, p_vessel_id bigint, p_port_id bigint,
  p_voyage_call_id bigint, p_company_code text, p_actor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text; v_voyage bigint;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select status into v_status from public.cost_agent_invoices where id = p_invoice_id;
  if v_status not in ('verification','rejected','failed') then
    raise exception 'Invoice berstatus % tidak bisa diubah', v_status;
  end if;
  update public.cost_agent_invoices
     set vendor_id = p_vendor_id, vessel_id = p_vessel_id, port_id = p_port_id,
         voyage_call_id = p_voyage_call_id,
         voyage_id = (select voyage_id from public.cost_agent_voyage_calls where id = p_voyage_call_id),
         company_code = coalesce(p_company_code, company_code), updated_at = now()
   where id = p_invoice_id;
  perform public.fn_cost_agent_refresh_compare(p_invoice_id);
  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, v_status, v_status, public.fn_cost_agent_actor(p_actor), 'Header dikoreksi');
end $$;

-- ---------- App: tambah jenis biaya baru (untuk baris "biaya belum ada") ----------
create or replace function public.fn_cost_agent_add_cost_item(
  p_code text, p_name text, p_category text, p_gl_account text default null,
  p_keywords text[] default '{}', p_actor text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  insert into public.cost_agent_cost_items(code, name, category, gl_account, keywords, priority)
  values (upper(regexp_replace(p_code, '[^A-Za-z0-9]+', '_', 'g')), p_name, coalesce(p_category, 'OTHER'),
          p_gl_account, coalesce((select array_agg(public.fn_cost_agent_norm(k)) from unnest(p_keywords) k), '{}'), 500)
  on conflict (code) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

-- ---------- App: verifikasi 1 baris (sekaligus belajar alias) ----------
create or replace function public.fn_cost_agent_verify_line(
  p_line_id bigint, p_cost_item_id bigint, p_is_verified boolean default true,
  p_remark text default null, p_include_in_history boolean default true,
  p_learn_alias boolean default true, p_actor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_line public.cost_agent_invoice_lines%rowtype; v_inv public.cost_agent_invoices%rowtype;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_line from public.cost_agent_invoice_lines where id = p_line_id;
  select * into v_inv from public.cost_agent_invoices where id = v_line.invoice_id;
  if v_inv.status not in ('verification','rejected') then
    raise exception 'Invoice berstatus % tidak bisa diverifikasi', v_inv.status;
  end if;

  update public.cost_agent_invoice_lines set
    cost_item_id = p_cost_item_id,
    match_method = case when p_cost_item_id is distinct from v_line.cost_item_id then 'manual' else match_method end,
    gl_account = coalesce((select gl_account from public.cost_agent_cost_items where id = p_cost_item_id), gl_account),
    is_verified = p_is_verified, remark = coalesce(p_remark, remark),
    include_in_history = p_include_in_history,
    verified_by = public.fn_cost_agent_actor(p_actor), verified_at = now(), updated_at = now()
  where id = p_line_id;

  if p_learn_alias and p_cost_item_id is not null then
    insert into public.cost_agent_cost_item_aliases(alias_norm, vendor_id, cost_item_id, created_by)
    values (public.fn_cost_agent_norm(v_line.description_raw), v_inv.vendor_id, p_cost_item_id,
            public.fn_cost_agent_actor(p_actor))
    on conflict (alias_norm, coalesce(vendor_id, 0)) do update set cost_item_id = excluded.cost_item_id;
  end if;

  if p_cost_item_id is distinct from v_line.cost_item_id then
    perform public.fn_cost_agent_refresh_compare(v_inv.id);
  end if;
end $$;

-- ---------- Ambil approver dari matrix ----------
create or replace function public.fn_cost_agent_matrix_for(p_company text, p_vendor_id bigint, p_amount numeric)
returns table(step_no int, approver_label text, approver_emails text[], approver_role text)
language sql
stable
set search_path = ''
as $$
  -- aturan paling spesifik menang per step (vendor > company > umum)
  select distinct on (m.step_no) m.step_no, m.approver_label, m.approver_emails, m.approver_role
    from public.cost_agent_approval_matrix m
   where m.is_active
     and (m.company_code is null or m.company_code = p_company)
     and (m.vendor_id is null or m.vendor_id = p_vendor_id)
     and p_amount >= m.min_amount and (m.max_amount is null or p_amount <= m.max_amount)
   order by m.step_no, (m.vendor_id is not null) desc, (m.company_code is not null) desc, m.id;
$$;

create or replace function public.fn_cost_agent_submit_for_approval(p_invoice_id bigint, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.cost_agent_invoices%rowtype; v_unverified int; v_round int; v_steps int;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id for update;
  if v_inv.status not in ('verification','rejected') then
    raise exception 'Invoice berstatus % tidak bisa diajukan', v_inv.status;
  end if;
  select count(*) into v_unverified from public.cost_agent_invoice_lines
   where invoice_id = p_invoice_id and not is_verified;
  if v_unverified > 0 then raise exception 'Masih ada % baris belum diverifikasi', v_unverified; end if;
  if v_inv.vessel_id is null or v_inv.port_id is null or v_inv.vendor_id is null then
    raise exception 'Vendor, kapal dan pelabuhan wajib terisi sebelum diajukan';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round from public.cost_agent_approvals where invoice_id = p_invoice_id;
  insert into public.cost_agent_approvals(invoice_id, round_no, step_no, approver_label, approver_emails, approver_role)
  select p_invoice_id, v_round, m.step_no, m.approver_label, m.approver_emails, m.approver_role
    from public.fn_cost_agent_matrix_for(v_inv.company_code, v_inv.vendor_id,
                                      coalesce(v_inv.grand_total, v_inv.lines_total, 0)) m;
  get diagnostics v_steps = row_count;
  if v_steps = 0 then raise exception 'Tidak ada approval matrix yang cocok (PT %, nilai %)',
                      v_inv.company_code, coalesce(v_inv.grand_total, v_inv.lines_total); end if;

  update public.cost_agent_invoices set submitted_by = public.fn_cost_agent_actor(p_actor), submitted_at = now()
   where id = p_invoice_id;
  perform public.fn_cost_agent_set_status(p_invoice_id, 'waiting_approval', p_actor,
                                       format('Diajukan, %s step approval', v_steps));
  return jsonb_build_object('invoice_id', p_invoice_id, 'round', v_round, 'steps', v_steps);
end $$;

-- Pindahkan baris invoice yang sudah approved ke tabel history (acuan berikutnya)
create or replace function public.fn_cost_agent_push_to_history(p_invoice_id bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  insert into public.cost_agent_cost_history(
    cost_item_id, port_id, vessel_id, vendor_id, company_code, vessel_dwt, service_date, invoice_date,
    invoice_no, voyage_no, activity, description_raw, qty, unit_price, amount, currency, gl_account,
    source, source_invoice_id, source_line_id, source_ref)
  select l.cost_item_id, i.port_id, i.vessel_id, i.vendor_id, i.company_code, vs.dwt,
         coalesce(i.service_date, i.invoice_date, current_date), i.invoice_date, i.invoice_no,
         coalesce(vy.voyage_no, i.voyage_no_raw), coalesce(vc.activity, i.activity_raw), l.description_raw,
         l.qty, l.unit_price, l.amount, i.currency, l.gl_account, 'app', i.id, l.id, 'app:line:' || l.id
    from public.cost_agent_invoice_lines l
    join public.cost_agent_invoices i on i.id = l.invoice_id
    left join public.cost_agent_vessels vs on vs.id = i.vessel_id
    left join public.cost_agent_voyages vy on vy.id = i.voyage_id
    left join public.cost_agent_voyage_calls vc on vc.id = i.voyage_call_id
   where l.invoice_id = p_invoice_id and l.include_in_history and l.cost_item_id is not null
  on conflict (source_ref) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.fn_cost_agent_decide_approval(
  p_invoice_id bigint, p_decision text, p_note text default null, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := lower(public.fn_cost_agent_actor(p_actor));
  v_step public.cost_agent_approvals%rowtype;
  v_left int; v_hist int := 0;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  if p_decision not in ('approved','rejected') then raise exception 'Keputusan harus approved / rejected'; end if;
  perform 1 from public.cost_agent_invoices where id = p_invoice_id and status = 'waiting_approval' for update;
  if not found then raise exception 'Invoice tidak dalam status waiting_approval'; end if;

  select * into v_step from public.cost_agent_approvals
   where invoice_id = p_invoice_id and decision = 'pending'
   order by round_no desc, step_no limit 1;
  if not found then raise exception 'Tidak ada step approval yang pending'; end if;
  if cardinality(v_step.approver_emails) > 0
     and not (v_actor = any (select lower(e) from unnest(v_step.approver_emails) e)) then
    raise exception 'User % bukan approver step % (%)', v_actor, v_step.step_no, v_step.approver_label;
  end if;

  update public.cost_agent_approvals
     set decision = p_decision, decided_by = v_actor, decided_at = now(), note = p_note
   where id = v_step.id;

  if p_decision = 'rejected' then
    update public.cost_agent_approvals set decision = 'skipped'
     where invoice_id = p_invoice_id and round_no = v_step.round_no and decision = 'pending';
    perform public.fn_cost_agent_set_status(p_invoice_id, 'rejected', v_actor,
                                         format('Ditolak di step %s: %s', v_step.step_no, coalesce(p_note, '-')));
    return jsonb_build_object('status', 'rejected', 'step', v_step.step_no);
  end if;

  select count(*) into v_left from public.cost_agent_approvals
   where invoice_id = p_invoice_id and round_no = v_step.round_no and decision = 'pending';
  if v_left = 0 then
    update public.cost_agent_invoices set approved_at = now() where id = p_invoice_id;
    v_hist := public.fn_cost_agent_push_to_history(p_invoice_id);
    perform public.fn_cost_agent_set_status(p_invoice_id, 'approved', v_actor,
                                         format('Semua approval selesai, %s baris masuk history', v_hist));
    return jsonb_build_object('status', 'approved', 'history_rows', v_hist);
  end if;
  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, 'waiting_approval', 'waiting_approval', v_actor,
          format('Step %s (%s) approved', v_step.step_no, v_step.approver_label));
  return jsonb_build_object('status', 'waiting_approval', 'next_steps', v_left);
end $$;

-- ---------- Pembayaran: buat AP Note / PV ----------
create or replace function public.fn_cost_agent_create_payment_request(
  p_invoice_id bigint, p_doc_type text, p_data jsonb default '{}'::jsonb, p_actor text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.cost_agent_invoices%rowtype; v_id bigint;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_payment');
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id for update;
  if v_inv.status not in ('approved','journal') then
    raise exception 'Hanya invoice approved yang bisa dibuat %', p_doc_type;
  end if;
  if exists (select 1 from public.cost_agent_payment_requests
              where invoice_id = p_invoice_id and status in ('draft','submitted','posted','paid')) then
    raise exception 'Invoice ini sudah punya dokumen pembayaran aktif';
  end if;

  insert into public.cost_agent_payment_requests(
    invoice_id, doc_type, company_code, vendor_id, amount, pph_amount, due_date, bank_name,
    bank_account_name, bank_account_no, description, journal_lines, status, created_by)
  values (
    p_invoice_id, p_doc_type, v_inv.company_code, v_inv.vendor_id,
    coalesce((p_data ->> 'amount')::numeric, v_inv.grand_total, v_inv.lines_total),
    coalesce((p_data ->> 'pph_amount')::numeric, v_inv.pph, 0),
    nullif(p_data ->> 'due_date', '')::date, p_data ->> 'bank_name', p_data ->> 'bank_account_name',
    p_data ->> 'bank_account_no', p_data ->> 'description',
    coalesce(p_data -> 'journal_lines', (
      select jsonb_agg(jsonb_build_object('gl_account', gl_account, 'description', description_raw,
                                          'debit', amount, 'credit', 0) order by line_no)
        from public.cost_agent_invoice_lines where invoice_id = p_invoice_id)),
    'submitted', public.fn_cost_agent_actor(p_actor))
  returning id into v_id;

  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, v_inv.status, v_inv.status, public.fn_cost_agent_actor(p_actor),
          format('%s #%s dibuat, menunggu posting ke finance', p_doc_type, v_id));
  return v_id;
end $$;

-- dipanggil n8n / app setelah dokumen berhasil diposting ke database finance
create or replace function public.fn_cost_agent_mark_payment_posted(
  p_request_id bigint, p_success boolean, p_doc_no text default null, p_response jsonb default null,
  p_actor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv bigint; v_type text;
begin
  perform public.fn_cost_agent_assert_service();
  update public.cost_agent_payment_requests
     set status = case when p_success then 'posted' else 'failed' end,
         doc_no = coalesce(p_doc_no, doc_no), posted_ref = p_doc_no, response = p_response,
         posted_at = case when p_success then now() end, updated_at = now()
   where id = p_request_id
  returning invoice_id, doc_type into v_inv, v_type;
  if p_success then
    perform public.fn_cost_agent_set_status(v_inv, 'journal', p_actor, format('%s %s terposting', v_type, p_doc_no));
  else
    insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
    values (v_inv, 'approved', 'approved', public.fn_cost_agent_actor(p_actor), 'Posting gagal: ' || coalesce(p_response::text, '-'));
  end if;
end $$;

create or replace function public.fn_cost_agent_mark_paid(
  p_invoice_id bigint, p_paid_at timestamptz default now(), p_paid_ref text default null, p_actor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_payment');
  update public.cost_agent_invoices set paid_at = p_paid_at, paid_ref = p_paid_ref where id = p_invoice_id;
  update public.cost_agent_payment_requests set status = 'paid', updated_at = now()
   where invoice_id = p_invoice_id and status = 'posted';
  perform public.fn_cost_agent_set_status(p_invoice_id, 'paid', p_actor, coalesce('Dibayar, ref ' || p_paid_ref, 'Dibayar'));
end $$;

-- ---------- Faktur pajak: simpan hasil cek dari n8n ----------
-- p_payload = {invoice_id, tax_check_id?, doc_type, file_url, file_name,
--              extracted:{fp_number, fp_date, seller_name, seller_npwp, buyer_name, buyer_npwp, dpp, ppn}}
create or replace function public.fn_cost_agent_save_tax_check(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb := coalesce(p_payload -> 'extracted', '{}'::jsonb);
  v_inv public.cost_agent_invoices%rowtype;
  v_vendor_npwp text;
  v_company_npwp text;
  v_res jsonb := '[]'::jsonb;
  v_ok boolean := true;
  v_id bigint := nullif(p_payload ->> 'tax_check_id', '')::bigint;
  v_dpp numeric := nullif(e ->> 'dpp', '')::numeric;
  v_ppn numeric := nullif(e ->> 'ppn', '')::numeric;
begin
  perform public.fn_cost_agent_assert_service();
  select * into v_inv from public.cost_agent_invoices where id = (p_payload ->> 'invoice_id')::bigint;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;
  select npwp into v_vendor_npwp from public.cost_agent_vendors where id = v_inv.vendor_id;
  select npwp into v_company_npwp from public.cost_agent_companies where code = v_inv.company_code;

  -- PPN di FP vs PPN di invoice
  v_res := v_res || jsonb_build_object('field','ppn','expected',v_inv.ppn,'actual',v_ppn,
             'ok', v_inv.ppn is null or v_ppn is null or abs(v_inv.ppn - v_ppn) <= 1);
  -- DPP di FP vs subtotal kena pajak (perkiraan: ppn/rate atau subtotal)
  v_res := v_res || jsonb_build_object('field','dpp','expected',v_inv.subtotal,'actual',v_dpp,
             'ok', v_inv.subtotal is null or v_dpp is null or v_dpp <= v_inv.subtotal + 1);
  -- NPWP penjual = NPWP vendor
  v_res := v_res || jsonb_build_object('field','seller_npwp','expected',v_vendor_npwp,'actual',e ->> 'seller_npwp',
             'ok', v_vendor_npwp is null or regexp_replace(v_vendor_npwp,'\D','','g') = regexp_replace(coalesce(e ->> 'seller_npwp',''),'\D','','g'));
  -- NPWP pembeli = NPWP PT kita
  v_res := v_res || jsonb_build_object('field','buyer_npwp','expected',v_company_npwp,'actual',e ->> 'buyer_npwp',
             'ok', v_company_npwp is null or regexp_replace(v_company_npwp,'\D','','g') = regexp_replace(coalesce(e ->> 'buyer_npwp',''),'\D','','g'));
  -- Nomor FP wajib ada
  v_res := v_res || jsonb_build_object('field','fp_number','expected','terisi','actual',e ->> 'fp_number',
             'ok', nullif(e ->> 'fp_number','') is not null);

  select bool_and((x ->> 'ok')::boolean) into v_ok from jsonb_array_elements(v_res) x;

  if v_id is null then
    insert into public.cost_agent_tax_checks(invoice_id, doc_type, file_url, file_name)
    values (v_inv.id, coalesce(p_payload ->> 'doc_type','faktur_pajak'), p_payload ->> 'file_url', p_payload ->> 'file_name')
    returning id into v_id;
  end if;
  update public.cost_agent_tax_checks set
    status = case when v_ok then 'match' else 'mismatch' end,
    fp_number = e ->> 'fp_number', fp_date = nullif(e ->> 'fp_date','')::date,
    seller_name = e ->> 'seller_name', seller_npwp = e ->> 'seller_npwp',
    buyer_name = e ->> 'buyer_name', buyer_npwp = e ->> 'buyer_npwp',
    dpp = v_dpp, ppn = v_ppn, extracted = e, check_results = v_res, error_message = null, updated_at = now()
  where id = v_id;
  return jsonb_build_object('tax_check_id', v_id, 'status', case when v_ok then 'match' else 'mismatch' end,
                            'results', v_res);
end $$;

-- dibuat app sebelum kirim dokumen ke n8n, agar baris "sedang dicek" langsung tampil
create or replace function public.fn_cost_agent_create_tax_check(
  p_invoice_id bigint, p_doc_type text default 'faktur_pajak', p_file_url text default null,
  p_file_name text default null, p_actor text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  insert into public.cost_agent_tax_checks(invoice_id, doc_type, file_url, file_name, checked_by, status)
  values (p_invoice_id, coalesce(p_doc_type, 'faktur_pajak'), p_file_url, p_file_name,
          public.fn_cost_agent_actor(p_actor), 'processing')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_cost_agent_mark_tax_check_failed(p_tax_check_id bigint, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.fn_cost_agent_assert_service();
  update public.cost_agent_tax_checks
     set status = 'error', error_message = left(p_error, 2000), updated_at = now()
   where id = p_tax_check_id;
$$;

-- payload lengkap untuk diposting ke sistem finance (AP Note / PV)
create or replace function public.fn_cost_agent_get_payment_payload(p_request_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payment_request', to_jsonb(pr),
    'invoice', jsonb_build_object('id', i.id, 'invoice_no', i.invoice_no, 'invoice_date', i.invoice_date,
                 'company_code', i.company_code, 'currency', i.currency, 'subtotal', i.subtotal, 'ppn', i.ppn,
                 'pph', i.pph, 'materai', i.materai, 'grand_total', i.grand_total, 'file_url', i.file_url),
    'vendor', jsonb_build_object('id', vd.id, 'name', vd.name, 'npwp', vd.npwp),
    'vessel', jsonb_build_object('id', vs.id, 'name', vs.name),
    'port', jsonb_build_object('code', p.code, 'name', p.name),
    'voyage_no', coalesce(vy.voyage_no, i.voyage_no_raw),
    'faktur_pajak', (select jsonb_build_object('fp_number', t.fp_number, 'fp_date', t.fp_date, 'dpp', t.dpp, 'ppn', t.ppn)
                       from public.cost_agent_tax_checks t where t.invoice_id = i.id and t.status = 'match'
                      order by t.created_at desc limit 1),
    'lines', (select jsonb_agg(jsonb_build_object('line_no', l.line_no, 'description', l.description_raw,
                       'cost_item', ci.code, 'gl_account', l.gl_account, 'amount', l.amount) order by l.line_no)
                from public.cost_agent_invoice_lines l
                left join public.cost_agent_cost_items ci on ci.id = l.cost_item_id
               where l.invoice_id = i.id))
  from public.cost_agent_payment_requests pr
  join public.cost_agent_invoices i on i.id = pr.invoice_id
  left join public.cost_agent_vendors vd on vd.id = i.vendor_id
  left join public.cost_agent_vessels vs on vs.id = i.vessel_id
  left join public.cost_agent_ports p on p.id = i.port_id
  left join public.cost_agent_voyages vy on vy.id = i.voyage_id
  where pr.id = p_request_id;
$$;

-- ---------- Voyage: simpan (form / import / API / AI) ----------
-- Waktu boleh dikirim:
--   * dengan offset ("2026-09-01T08:00:00+07:00")  -> dipakai apa adanya
--   * tanpa offset   ("2026-09-01 08:00")           -> dianggap jam lokal (LT) pelabuhan (ports.tz)
create or replace function public.fn_cost_agent_local_ts(p_value text, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if nullif(btrim(p_value), '') is null then return null; end if;
  if p_value ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then return p_value::timestamptz; end if;
  return (p_value::timestamp) at time zone coalesce(p_tz, 'Asia/Jakarta');
end $$;

-- p_voyage = {
--   id?, external_ref?, source?, status?, vessel_id | vessel_name, company_code?, voyage_no, seq_in_report?,
--   charter_type?, report_month? ("2026-09-01"), next_port (kode/nama)?, next_eta_at?, remarks?, extra?,
--   calls: [{seq, port (kode/nama) | port_id, activity, arrived_at, anchored_at, berthed_at,
--            commenced_at, completed_at, departed_at, remarks}],
--   cargo: [{product, qty, unit, call_seq?, remarks}] }
-- Calls & cargo diganti penuh (replace) setiap simpan; id port call lama dipertahankan bila seq sama,
-- supaya invoice yang sudah tertaut tidak lepas.
create or replace function public.fn_cost_agent_save_voyage(
  p_voyage jsonb, p_source text default 'manual', p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      bigint := nullif(p_voyage ->> 'id', '')::bigint;
  v_vessel  bigint;
  v_src     text := coalesce(nullif(p_voyage ->> 'source', ''), p_source, 'manual');
  c         jsonb;
  g         jsonb;
  v_port    bigint;
  v_tz      text;
  v_seq     int;
  v_seqs    int[] := '{}';
  v_call    bigint;
  v_warn    jsonb := '[]'::jsonb;
  v_prev    timestamptz;
  t         text;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_voyage');
  v_vessel := coalesce(nullif(p_voyage ->> 'vessel_id', '')::bigint,
                       public.fn_cost_agent_resolve_vessel(p_voyage ->> 'vessel_name'));
  if v_vessel is null then raise exception 'Kapal tidak dikenal: %', coalesce(p_voyage ->> 'vessel_name', '-'); end if;
  if nullif(p_voyage ->> 'voyage_no', '') is null then raise exception 'No voyage wajib diisi'; end if;
  if jsonb_array_length(coalesce(p_voyage -> 'calls', '[]'::jsonb)) = 0 then
    raise exception 'Minimal 1 pelabuhan singgah (muat/bongkar)';
  end if;

  if v_id is null and nullif(p_voyage ->> 'external_ref', '') is not null then
    select id into v_id from public.cost_agent_voyages where source = v_src and external_ref = p_voyage ->> 'external_ref';
  end if;
  if v_id is null then
    select id into v_id from public.cost_agent_voyages
     where vessel_id = v_vessel and voyage_no = btrim(p_voyage ->> 'voyage_no')
       and coalesce(report_month, '1900-01-01') = coalesce(nullif(p_voyage ->> 'report_month', '')::date, '1900-01-01');
  end if;

  if v_id is null then
    insert into public.cost_agent_voyages(vessel_id, company_code, voyage_no, seq_in_report, charter_type, report_month,
      next_port_id, next_eta_at, status, remarks, extra, source, external_ref, created_by)
    values (v_vessel,
      coalesce(nullif(p_voyage ->> 'company_code', ''), (select company_code from public.cost_agent_vessels where id = v_vessel)),
      btrim(p_voyage ->> 'voyage_no'), nullif(p_voyage ->> 'seq_in_report', '')::int, nullif(p_voyage ->> 'charter_type', ''),
      date_trunc('month', nullif(p_voyage ->> 'report_month', '')::date)::date,
      public.fn_cost_agent_resolve_port(p_voyage ->> 'next_port'),
      public.fn_cost_agent_local_ts(p_voyage ->> 'next_eta_at',
        (select tz from public.cost_agent_ports where id = public.fn_cost_agent_resolve_port(p_voyage ->> 'next_port'))),
      coalesce(nullif(p_voyage ->> 'status', ''), case when v_src = 'ai' then 'draft' else 'confirmed' end),
      p_voyage ->> 'remarks', coalesce(p_voyage -> 'extra', '{}'::jsonb), v_src,
      nullif(p_voyage ->> 'external_ref', ''), public.fn_cost_agent_actor(p_actor))
    returning id into v_id;
  else
    update public.cost_agent_voyages set
      vessel_id = v_vessel,
      company_code = coalesce(nullif(p_voyage ->> 'company_code', ''), company_code),
      voyage_no = btrim(p_voyage ->> 'voyage_no'),
      seq_in_report = nullif(p_voyage ->> 'seq_in_report', '')::int,
      charter_type = nullif(p_voyage ->> 'charter_type', ''),
      report_month = date_trunc('month', nullif(p_voyage ->> 'report_month', '')::date)::date,
      next_port_id = public.fn_cost_agent_resolve_port(p_voyage ->> 'next_port'),
      next_eta_at = public.fn_cost_agent_local_ts(p_voyage ->> 'next_eta_at',
        (select tz from public.cost_agent_ports where id = public.fn_cost_agent_resolve_port(p_voyage ->> 'next_port'))),
      status = coalesce(nullif(p_voyage ->> 'status', ''), status),
      remarks = p_voyage ->> 'remarks', extra = coalesce(p_voyage -> 'extra', extra), updated_at = now()
    where id = v_id;
  end if;

  -- port calls
  for c in select * from jsonb_array_elements(p_voyage -> 'calls') loop
    v_port := coalesce(nullif(c ->> 'port_id', '')::bigint, public.fn_cost_agent_resolve_port(c ->> 'port'));
    if v_port is null then raise exception 'Pelabuhan tidak dikenal: %', coalesce(c ->> 'port', '-'); end if;
    select tz into v_tz from public.cost_agent_ports where id = v_port;
    v_seq := coalesce(nullif(c ->> 'seq', '')::int, coalesce(array_length(v_seqs, 1), 0) + 1);
    v_seqs := v_seqs || v_seq;
    insert into public.cost_agent_voyage_calls(voyage_id, seq, port_id, activity, arrived_at, anchored_at, berthed_at,
      commenced_at, completed_at, departed_at, remarks)
    values (v_id, v_seq, v_port, coalesce(nullif(c ->> 'activity', ''), 'bongkar'),
      public.fn_cost_agent_local_ts(c ->> 'arrived_at', v_tz), public.fn_cost_agent_local_ts(c ->> 'anchored_at', v_tz),
      public.fn_cost_agent_local_ts(c ->> 'berthed_at', v_tz), public.fn_cost_agent_local_ts(c ->> 'commenced_at', v_tz),
      public.fn_cost_agent_local_ts(c ->> 'completed_at', v_tz), public.fn_cost_agent_local_ts(c ->> 'departed_at', v_tz),
      c ->> 'remarks')
    on conflict (voyage_id, seq) do update set
      port_id = excluded.port_id, activity = excluded.activity, arrived_at = excluded.arrived_at,
      anchored_at = excluded.anchored_at, berthed_at = excluded.berthed_at, commenced_at = excluded.commenced_at,
      completed_at = excluded.completed_at, departed_at = excluded.departed_at, remarks = excluded.remarks,
      updated_at = now();

    -- peringatan urutan waktu (tidak memblok)
    v_prev := null;
    foreach t in array array['arrived_at','berthed_at','commenced_at','completed_at','departed_at'] loop
      if nullif(c ->> t, '') is not null then
        if v_prev is not null and public.fn_cost_agent_local_ts(c ->> t, v_tz) < v_prev then
          v_warn := v_warn || jsonb_build_object('seq', v_seq, 'field', t, 'msg', 'Waktu lebih awal dari tahap sebelumnya');
        end if;
        v_prev := public.fn_cost_agent_local_ts(c ->> t, v_tz);
      end if;
    end loop;
  end loop;

  -- port call yang dihapus dari form: hapus bila tidak dipakai invoice
  if exists (select 1 from public.cost_agent_voyage_calls vc
              where vc.voyage_id = v_id and not (vc.seq = any (v_seqs))
                and exists (select 1 from public.cost_agent_invoices i where i.voyage_call_id = vc.id)) then
    raise exception 'Pelabuhan singgah yang sudah punya invoice tidak bisa dihapus';
  end if;
  delete from public.cost_agent_voyage_calls where voyage_id = v_id and not (seq = any (v_seqs));

  -- cargo (replace)
  delete from public.cost_agent_voyage_cargo where voyage_id = v_id;
  v_seq := 0;
  for g in select * from jsonb_array_elements(coalesce(p_voyage -> 'cargo', '[]'::jsonb)) loop
    continue when nullif(g ->> 'product', '') is null or nullif(g ->> 'qty', '') is null;
    v_seq := v_seq + 1;
    select id into v_call from public.cost_agent_voyage_calls
     where voyage_id = v_id and seq = nullif(g ->> 'call_seq', '')::int;
    insert into public.cost_agent_voyage_cargo(voyage_id, call_id, seq, product, qty, unit, remarks)
    values (v_id, v_call, v_seq, upper(btrim(g ->> 'product')),
            replace(replace(g ->> 'qty', ',', ''), ' ', '')::numeric,
            coalesce(nullif(g ->> 'unit', ''), 'L15'), g ->> 'remarks');
  end loop;

  return jsonb_build_object('voyage_id', v_id, 'warnings', v_warn,
    'calls', (select jsonb_agg(jsonb_build_object('seq', seq, 'call_id', id) order by seq)
                from public.cost_agent_voyage_calls where voyage_id = v_id));
end $$;

-- Banyak voyage sekaligus (import Excel / API / AI). Error per voyage tidak menggagalkan yang lain.
create or replace function public.fn_cost_agent_upsert_voyages(
  p_rows jsonb, p_source text default 'manual', p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb; v_ok int := 0; v_err jsonb := '[]'::jsonb; v_ids jsonb := '[]'::jsonb; v_res jsonb;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_voyage');
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_res := public.fn_cost_agent_save_voyage(r, p_source, p_actor);
      v_ok := v_ok + 1;
      v_ids := v_ids || jsonb_build_object('voyage_no', r ->> 'voyage_no', 'voyage_id', v_res -> 'voyage_id',
                                           'warnings', v_res -> 'warnings');
    exception when others then
      v_err := v_err || jsonb_build_object('voyage_no', r ->> 'voyage_no', 'vessel', r ->> 'vessel_name',
                                           'external_ref', r ->> 'external_ref', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('saved', v_ok, 'voyages', v_ids, 'errors', v_err);
end $$;

-- Satu voyage lengkap untuk form edit / drawer detail
create or replace function public.fn_cost_agent_get_voyage(p_voyage_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(v) || jsonb_build_object(
    'vessel_name', vs.name, 'vessel_dwt', vs.dwt, 'vessel_type', vs.vessel_type,
    'next_port_code', np.code, 'next_port_name', np.name,
    'calls', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                 'port_code', p.code, 'port_name', p.name, 'port_tz', p.tz,
                 'invoices', (select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'invoice_no', i.invoice_no,
                                 'vendor_name', vd.name, 'grand_total', i.grand_total) order by i.id)
                                from public.cost_agent_invoices i
                                left join public.cost_agent_vendors vd on vd.id = i.vendor_id
                               where i.voyage_call_id = c.id)) order by c.seq)
               from public.cost_agent_voyage_calls c join public.cost_agent_ports p on p.id = c.port_id
              where c.voyage_id = v.id), '[]'::jsonb),
    'cargo', coalesce((select jsonb_agg(to_jsonb(g) order by g.seq) from public.cost_agent_voyage_cargo g
                        where g.voyage_id = v.id), '[]'::jsonb),
    'cargo_total', (select sum(qty) from public.cost_agent_voyage_cargo g where g.voyage_id = v.id))
  from public.cost_agent_voyages v
  join public.cost_agent_vessels vs on vs.id = v.vessel_id
  left join public.cost_agent_ports np on np.id = v.next_port_id
  where v.id = p_voyage_id;
$$;

-- List voyage: 1 baris per voyage dengan ringkasan rute (untuk halaman daftar)
create or replace view public.cost_agent_voyage_list_v
with (security_invoker = true) as
select v.id, v.company_code, v.vessel_id, vs.name as vessel_name, vs.vessel_type, v.voyage_no, v.seq_in_report,
       v.charter_type, v.report_month, v.status, v.source,
       (select string_agg(p.code, ' → ' order by c.seq) from public.cost_agent_voyage_calls c
          join public.cost_agent_ports p on p.id = c.port_id where c.voyage_id = v.id) as route,
       (select min(c.arrived_at) from public.cost_agent_voyage_calls c where c.voyage_id = v.id) as first_arrival,
       (select max(c.departed_at) from public.cost_agent_voyage_calls c where c.voyage_id = v.id) as last_departure,
       (select sum(g.qty) from public.cost_agent_voyage_cargo g where g.voyage_id = v.id) as cargo_total,
       (select string_agg(distinct g.unit, '/') from public.cost_agent_voyage_cargo g where g.voyage_id = v.id) as cargo_unit,
       (select count(*) from public.cost_agent_invoices i where i.voyage_id = v.id) as invoice_count,
       np.code as next_port_code, v.next_eta_at, v.updated_at
  from public.cost_agent_voyages v
  join public.cost_agent_vessels vs on vs.id = v.vessel_id
  left join public.cost_agent_ports np on np.id = v.next_port_id;

-- Simpan link file (Google Drive) hasil upload n8n
create or replace function public.fn_cost_agent_set_invoice_files(p_invoice_id bigint, p_files jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.fn_cost_agent_assert_service();
  update public.cost_agent_invoices
     set files = coalesce(p_files, '[]'::jsonb),
         file_url = coalesce(p_files -> 0 ->> 'file_url', file_url),
         file_name = coalesce(p_files -> 0 ->> 'file_name', file_name),
         updated_at = now()
   where id = p_invoice_id;
$$;

-- ---------- Ringkasan list invoice (halaman daftar) ----------
create or replace view public.cost_agent_invoice_list_v
with (security_invoker = true) as
select i.id, i.status, i.company_code, i.invoice_no, i.invoice_date, i.service_date, i.grand_total, i.currency,
       vd.name as vendor_name, vs.name as vessel_name, p.code as port_code, p.name as port_name,
       vy.voyage_no, i.voyage_id, i.voyage_call_id, i.duplicate_of, jsonb_array_length(i.check_notes) as note_count,
       (select count(*) from public.cost_agent_invoice_lines l where l.invoice_id = i.id) as line_count,
       (select count(*) from public.cost_agent_invoice_lines l where l.invoice_id = i.id and l.compare_flag = 'naik') as naik_count,
       (select count(*) from public.cost_agent_invoice_lines l where l.invoice_id = i.id and l.compare_flag in ('item_baru','tanpa_history')) as baru_count,
       (select count(*) from public.cost_agent_invoice_lines l where l.invoice_id = i.id and not l.is_verified) as unverified_count,
       (select t.status from public.cost_agent_tax_checks t where t.invoice_id = i.id order by t.created_at desc limit 1) as tax_status,
       i.created_at, i.updated_at
  from public.cost_agent_invoices i
  left join public.cost_agent_vendors vd on vd.id = i.vendor_id
  left join public.cost_agent_vessels vs on vs.id = i.vessel_id
  left join public.cost_agent_ports p on p.id = i.port_id
  left join public.cost_agent_voyages vy on vy.id = i.voyage_id;

create index if not exists cost_agent_lines_inv_flag on public.cost_agent_invoice_lines(invoice_id, compare_flag);

-- =====================================================================
-- 11. GRANT eksekusi RPC (bukan untuk anon)
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'fn\_cost\_agent\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

grant select on public.cost_agent_invoice_list_v, public.cost_agent_voyage_list_v to authenticated, service_role;
