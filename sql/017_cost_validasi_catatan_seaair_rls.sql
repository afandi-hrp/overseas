-- 2026-09: RLS utk tabel `cost_validasi_catatan_seaair` (fitur "Catatan Konfirmasi Manual
-- per-Segmen" Cost Validation Sea & Air, ValidasiShipmentInvoiceLengkap.tsx) -- tabel ini SUDAH
-- ADA sebelumnya tapi BELUM py RLS sama sekali, jadi bisa dibaca/ditulis siapa pun yang py
-- anon/authenticated key langsung (celah sama pola yang pernah ditemukan di modul lain, lihat
-- CLAUDE.md "RLS 3 tabel baru -- SUDAH DIKONFIRMASI KOSONG TOTAL" di far-overseas.md).
--
-- page_key: `sea_air_cost_validation` (SATU-SATUNYA page_key yang menggerbangi modal ini --
-- lihat `canEdit={canEdit('sea_air_cost_validation')}` di SharedDataTable.tsx). Ditulis LANGSUNG
-- dari app (`.insert()`/`.delete()` di ValidasiShipmentInvoiceLengkap.tsx, BUKAN RPC -- tabel ini
-- murni catatan/anotasi, beda dari data cost inti `cost_validasi_seaair.checks` yang tetap
-- RPC-only), jadi RLS INSERT/UPDATE/DELETE via `has_edit_access` WAJIB ada (bukan cuma SELECT).
--
-- SEBELUM MENJALANKAN -- kalau ada laporan RLS/policy tabel ini ternyata SUDAH ada (dibuat user
-- sendiri langsung di Supabase tanpa tercermin di sql/ lokal), cek dulu via Table Editor/
-- `select * from pg_policies where tablename = 'cost_validasi_catatan_seaair'` sebelum jalankan
-- file ini -- idempotent (`drop policy if exists` dulu) jadi aman dijalankan ulang.

alter table public.cost_validasi_catatan_seaair enable row level security;

drop policy if exists "cost_validasi_catatan_seaair_select" on public.cost_validasi_catatan_seaair;
create policy "cost_validasi_catatan_seaair_select" on public.cost_validasi_catatan_seaair
  for select using (public.has_page_access('sea_air_cost_validation'));

drop policy if exists "cost_validasi_catatan_seaair_insert" on public.cost_validasi_catatan_seaair;
create policy "cost_validasi_catatan_seaair_insert" on public.cost_validasi_catatan_seaair
  for insert with check (public.has_edit_access('sea_air_cost_validation'));

drop policy if exists "cost_validasi_catatan_seaair_update" on public.cost_validasi_catatan_seaair;
create policy "cost_validasi_catatan_seaair_update" on public.cost_validasi_catatan_seaair
  for update using (public.has_edit_access('sea_air_cost_validation'))
  with check (public.has_edit_access('sea_air_cost_validation'));

drop policy if exists "cost_validasi_catatan_seaair_delete" on public.cost_validasi_catatan_seaair;
create policy "cost_validasi_catatan_seaair_delete" on public.cost_validasi_catatan_seaair
  for delete using (public.has_edit_access('sea_air_cost_validation'));
