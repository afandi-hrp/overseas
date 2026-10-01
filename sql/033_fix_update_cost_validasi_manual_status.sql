-- 033 — Perbaikan kolom ringkasan RPC update_cost_validasi_manual (Sea & Air) — 2026-10-01
--
-- MASALAH (body LIVE dari inspeksi sql/030b): RPC menghitung status 'SESUAI' / 'TIDAK_SESUAI',
-- padahal `checks` berisi status 'MATCH' / 'OVERCHARGE' / 'UNDERCHARGE' / 'BELUM_LENGKAP'.
-- Akibatnya tiap simpan dari aplikasi: total_sesuai = 0, total_tidak_sesuai = 0,
-- status_cost_validasi = 'SESUAI' walau ada overcharge. Aplikasi TIDAK membaca kolom2 ini
-- (persen/issue dihitung dari `checks`) — dampaknya hanya utk pembaca lain (n8n/laporan/query).
--
-- PERBAIKAN: hanya cara menghitung. Signature (p_id uuid, p_checks jsonb) RETURNS void, SECURITY
-- DEFINER, search_path, guard has_edit_access, kolom yg di-update & nilai status_cost_validasi
-- ('SESUAI' / 'PERLU REVIEW') SAMA PERSIS dgn versi live -> CREATE OR REPLACE aman, hak EXECUTE
-- tetap. Status lama 'SESUAI'/'TIDAK_SESUAI' tetap dikenali (jaga2 data lama).
-- Guard Admin (trigger trg_seaair_validation_admin_only, sql/031) TETAP berlaku krn trigger jalan
-- dgn auth.email() user yg memanggil.

create or replace function public.update_cost_validasi_manual(p_id uuid, p_checks jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_total integer;
  v_sesuai integer;
  v_gagal integer;
begin
  if not public.has_edit_access('sea_air_cost_validation') then
    raise exception 'Not authorized to edit Sea & Air cost validation';
  end if;

  select
    count(*) filter (where (c->>'status') is distinct from 'BELUM_LENGKAP'),
    count(*) filter (where (c->>'status') in ('MATCH', 'SESUAI')),
    count(*) filter (where (c->>'status') in ('OVERCHARGE', 'UNDERCHARGE', 'TIDAK_SESUAI'))
  into v_total, v_sesuai, v_gagal
  from jsonb_array_elements(coalesce(p_checks, '[]'::jsonb)) as c;

  update cost_validasi_seaair
  set checks = p_checks,
      total_checks = v_total,
      total_sesuai = v_sesuai,
      total_tidak_sesuai = v_gagal,
      status_cost_validasi = case when v_gagal = 0 then 'SESUAI' else 'PERLU REVIEW' end
  where id = p_id;
end;
$function$;

-- ── OPSIONAL: hitung ulang kolom ringkasan baris LAMA ───────────────────────
-- Jalankan HANYA kalau kolom total_sesuai / total_tidak_sesuai / status_cost_validasi memang
-- dipakai di luar aplikasi DAN tidak sedang diisi sendiri oleh n8n dgn arti lain.
-- 1) Lihat dulu dampaknya (baca saja):
-- select id, total_checks, total_sesuai, total_tidak_sesuai, status_cost_validasi,
--        (select count(*) from jsonb_array_elements(coalesce(checks,'[]'::jsonb)) c where c->>'status' in ('MATCH','SESUAI')) as sesuai_baru,
--        (select count(*) from jsonb_array_elements(coalesce(checks,'[]'::jsonb)) c where c->>'status' in ('OVERCHARGE','UNDERCHARGE','TIDAK_SESUAI')) as gagal_baru
-- from public.cost_validasi_seaair order by id limit 50;
-- 2) Kalau setuju, hitung ulang (dari SQL Editor = penulis service -> lolos guard Admin & tidak
--    menulis audit trail; kolom checks TIDAK diubah):
-- update public.cost_validasi_seaair t set
--   total_checks       = x.total,
--   total_sesuai       = x.sesuai,
--   total_tidak_sesuai = x.gagal,
--   status_cost_validasi = case when x.gagal = 0 then 'SESUAI' else 'PERLU REVIEW' end
-- from (
--   select id,
--     (select count(*) from jsonb_array_elements(coalesce(checks,'[]'::jsonb)) c where (c->>'status') is distinct from 'BELUM_LENGKAP') as total,
--     (select count(*) from jsonb_array_elements(coalesce(checks,'[]'::jsonb)) c where c->>'status' in ('MATCH','SESUAI')) as sesuai,
--     (select count(*) from jsonb_array_elements(coalesce(checks,'[]'::jsonb)) c where c->>'status' in ('OVERCHARGE','UNDERCHARGE','TIDAK_SESUAI')) as gagal
--   from public.cost_validasi_seaair
-- ) x where x.id = t.id;
