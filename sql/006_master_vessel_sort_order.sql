-- Modul REPORTING -- kolom `sort_order` di master_vessel supaya Cost per Vessel bisa menampilkan
-- baris PERSIS urutan file Excel Master Vessel (BUKAN alfabet, lihat revisi 2026-09 "REVISI MENU
-- REPORTING" poin B7: BASE tidak berurutan rapi di file, mis. JAKARTA muncul di awal lalu muncul
-- LAGI di bawah setelah BELAWAN/TBA/DUMAI/SURABAYA -- urutan baris HARUS diikuti apa adanya).
--
-- `vessel_id` (bigint identity) SUDAH inkremen persis sesuai urutan baris file Excel saat insert
-- awal (sql/003_reporting_master_vessel.sql ditulis apa adanya per baris file, belum ada
-- reordering apa pun sejak itu) -- backfill via row_number() over (order by vessel_id) aman.
alter table public.master_vessel add column if not exists sort_order integer;

update public.master_vessel set sort_order = sub.rn
from (
  select vessel_id, row_number() over (order by vessel_id) as rn
  from public.master_vessel
) sub
where public.master_vessel.vessel_id = sub.vessel_id and public.master_vessel.sort_order is null;

alter table public.master_vessel alter column sort_order set not null;
-- Vessel baru lewat MasterVesselAdminPage.tsx yang tidak diisi sort_order manual otomatis
-- nempel di paling akhir daftar (bukan error/di awal tak terduga).
alter table public.master_vessel alter column sort_order set default 2147483647;
