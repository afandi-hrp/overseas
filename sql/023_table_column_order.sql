-- Drag & Drop Reorder -- urutan KOLOM global (2026-09). Lihat sql/022_... utk urutan BARIS.
-- BELUM DIJALANKAN ke Supabase production -- WAJIB dijalankan manual dulu.

-- 1 baris per "menu" ('courier_audit' mewakili tab Draft+PIB+CN sekaligus, 'courier_rekapan'
-- mewakili Invoice Recap semua sub-tab PPJK) -- konsisten dgn partisi Customize View
-- (visibility kolom) yang sudah ada di frontend, cuma bedanya urutan ini GLOBAL (semua user),
-- Customize View tetap per-user via localStorage (TIDAK disentuh migrasi ini).
create table if not exists public.table_column_order (
  menu text primary key,
  column_order jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.table_column_order enable row level security;

drop policy if exists "table_column_order_select" on public.table_column_order;
create policy "table_column_order_select" on public.table_column_order
  for select using (
    (menu = 'courier_audit' and public.has_page_access('courier_audit'))
    or (menu = 'courier_rekapan' and public.has_page_access('courier_rekapan'))
  );

drop policy if exists "table_column_order_upsert" on public.table_column_order;
create policy "table_column_order_upsert" on public.table_column_order
  for all using (
    (menu = 'courier_audit' and public.has_edit_access('courier_audit'))
    or (menu = 'courier_rekapan' and public.has_edit_access('courier_rekapan'))
  ) with check (
    (menu = 'courier_audit' and public.has_edit_access('courier_audit'))
    or (menu = 'courier_rekapan' and public.has_edit_access('courier_rekapan'))
  );
