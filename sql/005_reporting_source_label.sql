-- Modul REPORTING -- kolom tambahan `source_label` di `reporting_cost_allocation`, dipakai
-- panel "NEEDS REVIEW" (Cost per Vessel) supaya user tahu baris sumber mana (No. Invoice/AWB)
-- yang perlu dicari manual di halaman Courier/Sea & Air/FAR Overseas saat nama vessel-nya tidak
-- cocok Master Vessel. Jalankan SETELAH sql/004_reporting_cost_allocation.sql.

alter table public.reporting_cost_allocation add column if not exists source_label text;
