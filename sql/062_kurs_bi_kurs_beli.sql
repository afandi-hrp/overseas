-- 062 · Kurs BI Harian: kolom Kurs Beli (2026-10-15, permintaan user -- import Excel Kurs BI).
-- Idempotent: aman dijalankan berulang. TIDAK mengubah RPC `upsert_kurs_bi` / `get_kurs_efektif` (Kurs Efektif tetap
-- Kurs Jual, atau Kurs Tengah + Rp200). Frontend (KursBIPage / KursBIImportModal) mendeteksi kolom ini otomatis:
-- sebelum dijalankan, Kurs Beli hanya dipakai menghitung Kurs Tengah = (Kurs Jual + Kurs Beli) / 2 dan tidak disimpan.
-- Kurs Beli ditulis langsung ke tabel (UPDATE) setelah `upsert_kurs_bi` -> butuh policy UPDATE tabel ini utk editor
-- `settings_kurs_bi` (cek bagian 2 di bawah).

-- 1. Pre-check (baca saja): kolom & policy yang ada sekarang.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'kurs_bi_seaair'
order by ordinal_position;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'kurs_bi_seaair';

-- 2. Tambah kolom (idempotent).
alter table public.kurs_bi_seaair add column if not exists kurs_beli numeric;
comment on column public.kurs_bi_seaair.kurs_beli is
  'Kurs Beli BI (Rp). Kurs Tengah = (Kurs Jual + Kurs Beli) / 2 dihitung di aplikasi saat input/import. sql/062.';

-- 3. Verifikasi.
select count(*) as total_baris, count(kurs_beli) as baris_dengan_kurs_beli from public.kurs_bi_seaair;
