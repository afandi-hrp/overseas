-- RLS utk 3 tabel baru struktur Tarif Vendor FAR Overseas Air (quotation+periode) yang tampil
-- "UNRESTRICTED" di Supabase Table Editor -- artinya RLS belum aktif sama sekali, tabel bisa
-- dibaca/ditulis siapa pun yang py anon/authenticated key, TERLEPAS RPC di
-- sql/011_far_overseas_tarif_quotation_rpc.sql sudah py guard has_edit_access atau belum
-- (guard RPC TIDAK menggantikan RLS tabel -- kalau RLS tabel kosong, `.select()`/`.insert()`
-- LANGSUNG dari frontend/console browser tetap tembus tanpa lewat RPC sama sekali).
--
-- `far_overseas_tarif_vendor_flat` (VIEW, ikon mata di screenshot) TIDAK di-alter di sini --
-- Postgres tidak punya RLS utk view biasa (row security ikut tabel dasarnya). Kalau view ini
-- masih dipakai baca data (bukan cuma sisa nama lama), pastikan tabel DASAR-nya (kemungkinan
-- far_overseas_tarif_vendor_legacy_backup atau gabungan quotation+detail) sudah py RLS yang
-- benar -- cek definisi view-nya dulu kalau ada laporan "data tetap bisa dibaca tanpa login".
--
-- Pola: SELECT via has_page_access('settings_tarif_far_overseas_vendor') (page_key HALAMAN,
-- bukan generik), INSERT/UPDATE/DELETE via has_edit_access -- konsisten pola RLS tabel lain
-- (Audit AP/Accounting Rekap/dll) di app ini. Idempotent: drop policy dulu supaya aman
-- dijalankan ulang.

alter table public.far_overseas_vendor_master enable row level security;

drop policy if exists "far_overseas_vendor_master_select" on public.far_overseas_vendor_master;
create policy "far_overseas_vendor_master_select" on public.far_overseas_vendor_master
  for select using (public.has_page_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_vendor_master_insert" on public.far_overseas_vendor_master;
create policy "far_overseas_vendor_master_insert" on public.far_overseas_vendor_master
  for insert with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_vendor_master_update" on public.far_overseas_vendor_master;
create policy "far_overseas_vendor_master_update" on public.far_overseas_vendor_master
  for update using (public.has_edit_access('settings_tarif_far_overseas_vendor'))
  with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_vendor_master_delete" on public.far_overseas_vendor_master;
create policy "far_overseas_vendor_master_delete" on public.far_overseas_vendor_master
  for delete using (public.has_edit_access('settings_tarif_far_overseas_vendor'));


alter table public.far_overseas_tarif_quotation enable row level security;

drop policy if exists "far_overseas_tarif_quotation_select" on public.far_overseas_tarif_quotation;
create policy "far_overseas_tarif_quotation_select" on public.far_overseas_tarif_quotation
  for select using (public.has_page_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_insert" on public.far_overseas_tarif_quotation;
create policy "far_overseas_tarif_quotation_insert" on public.far_overseas_tarif_quotation
  for insert with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_update" on public.far_overseas_tarif_quotation;
create policy "far_overseas_tarif_quotation_update" on public.far_overseas_tarif_quotation
  for update using (public.has_edit_access('settings_tarif_far_overseas_vendor'))
  with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_delete" on public.far_overseas_tarif_quotation;
create policy "far_overseas_tarif_quotation_delete" on public.far_overseas_tarif_quotation
  for delete using (public.has_edit_access('settings_tarif_far_overseas_vendor'));


alter table public.far_overseas_tarif_quotation_detail enable row level security;

drop policy if exists "far_overseas_tarif_quotation_detail_select" on public.far_overseas_tarif_quotation_detail;
create policy "far_overseas_tarif_quotation_detail_select" on public.far_overseas_tarif_quotation_detail
  for select using (public.has_page_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_detail_insert" on public.far_overseas_tarif_quotation_detail;
create policy "far_overseas_tarif_quotation_detail_insert" on public.far_overseas_tarif_quotation_detail
  for insert with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_detail_update" on public.far_overseas_tarif_quotation_detail;
create policy "far_overseas_tarif_quotation_detail_update" on public.far_overseas_tarif_quotation_detail
  for update using (public.has_edit_access('settings_tarif_far_overseas_vendor'))
  with check (public.has_edit_access('settings_tarif_far_overseas_vendor'));

drop policy if exists "far_overseas_tarif_quotation_detail_delete" on public.far_overseas_tarif_quotation_detail;
create policy "far_overseas_tarif_quotation_detail_delete" on public.far_overseas_tarif_quotation_detail
  for delete using (public.has_edit_access('settings_tarif_far_overseas_vendor'));

-- Cek hasilnya -- ketiga tabel di atas harus rowsecurity = true, dan masing2 4 policy:
select relname, relrowsecurity
from pg_class
where relname in ('far_overseas_vendor_master', 'far_overseas_tarif_quotation', 'far_overseas_tarif_quotation_detail');

select tablename, policyname, cmd
from pg_policies
where tablename in ('far_overseas_vendor_master', 'far_overseas_tarif_quotation', 'far_overseas_tarif_quotation_detail')
order by tablename, cmd;
