-- Modul REPORTING -- tabel snapshot hasil alokasi biaya per vessel (Aturan Umum poin 2 brief
-- user: "Pembagian per vessel harus disimpan hasilnya, bukan dihitung di layar saja, supaya bisa
-- ditelusuri saat audit"). Diisi via proses "Recompute" di halaman Cost per Vessel (frontend,
-- BUKAN trigger DB) -- baca `rekapan_courier`/`rekapan_seaair`/`rekapan_far_overseas_air`,
-- cocokkan `vessel` ke `master_vessel`, simpan hasilnya di sini. Jalankan SETELAH
-- sql/003_reporting_master_vessel.sql.
--
-- Kolom biaya generik menampung union semua method (bukan tabel terpisah per method) --
-- kolom yg tidak relevan utk method tsb dibiarkan 0:
--   COURIER  : courier_adm, duty, freight, bm, ppn_pph
--   SEA/AIR  : duty, handling_total, bm, ppn_pph
--   BORONGAN : borongan_total

create table if not exists public.reporting_cost_allocation (
  id bigint generated always as identity primary key,
  method text not null check (method in ('COURIER', 'SEA', 'AIR', 'BORONGAN')),
  period_month date not null,
  vessel_id bigint references public.master_vessel(vessel_id),
  vessel_name_raw text not null,
  source_table text not null,
  source_row_id text not null,
  courier_adm numeric not null default 0,
  duty numeric not null default 0,
  freight numeric not null default 0,
  handling_total numeric not null default 0,
  bm numeric not null default 0,
  ppn_pph numeric not null default 0,
  borongan_total numeric not null default 0,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (method, source_table, source_row_id, vessel_name_raw)
);

create index if not exists reporting_cost_allocation_period_idx on public.reporting_cost_allocation (period_month);
create index if not exists reporting_cost_allocation_vessel_idx on public.reporting_cost_allocation (vessel_id);

alter table public.reporting_cost_allocation enable row level security;

-- page_key 'reporting_dashboard'/'reporting_cost_per_vessel' WAJIB didaftarkan di
-- src/lib/permissions.ts PAGE_REGISTRY (sudah dilakukan bareng halaman React-nya -- lihat
-- CLAUDE.md bagian "Modul REPORTING").
drop policy if exists reporting_cost_allocation_select on public.reporting_cost_allocation;
create policy reporting_cost_allocation_select on public.reporting_cost_allocation
  for select using (
    public.has_page_access('reporting_dashboard') or public.has_page_access('reporting_cost_per_vessel')
  );

-- Recompute (delete lama + insert baru per periode) dipicu dari halaman Cost per Vessel --
-- digating has_edit_access ke page_key itu, Dashboard cuma baca (tidak perlu edit access).
drop policy if exists reporting_cost_allocation_write on public.reporting_cost_allocation;
create policy reporting_cost_allocation_write on public.reporting_cost_allocation
  for all using (public.has_edit_access('reporting_cost_per_vessel'))
  with check (public.has_edit_access('reporting_cost_per_vessel'));
