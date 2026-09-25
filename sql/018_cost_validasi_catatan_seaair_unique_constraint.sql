-- 2026-09: fitur "Catatan Konfirmasi Manual per-Segmen" Cost Validation Sea & Air direvisi --
-- status_konfirmasi sekarang dipilih eksplisit staf (MATCH/MISMATCH via dropdown), disimpan
-- lewat UPSERT by (seaair_id, section) supaya "1 segmen cuma boleh py 1 catatan aktif" (staf
-- ubah kapan saja = upsert menimpa baris lama, bukan insert baris baru terus-terusan).
-- `.upsert({...}, { onConflict: 'seaair_id,section' })` di ValidasiShipmentInvoiceLengkap.tsx
-- BUTUH unique constraint di kolom itu supaya Postgres tahu mana yang "conflict".

-- `CREATE UNIQUE INDEX` (bukan `ALTER TABLE ADD CONSTRAINT`, Postgres TIDAK mendukung sintaks
-- `ADD CONSTRAINT IF NOT EXISTS`) -- unique index berfungsi PERSIS sama dgn unique constraint
-- utk keperluan `ON CONFLICT`, idempotent lewat `IF NOT EXISTS`.
create unique index if not exists cost_validasi_catatan_seaair_seaair_section_key
  on public.cost_validasi_catatan_seaair (seaair_id, section);
