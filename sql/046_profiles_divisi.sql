-- beehive:046 -- 2026-10-06: divisi per user (Finance / Shipment / Purchasing / ...) utk pengelompokan panel
-- "Roles per User" di Settings -> Manage Roles & Access. Murni pengelompokan tampilan, BUKAN hak akses.
--   * kolom public.profiles.divisi (text, NULL = belum ada divisi; disimpan HURUF BESAR, mis. 'FINANCE')
--   * RPC public.fn_set_user_divisi(uuid, text) -- HANYA Admin (is_admin()); dipakai krn policy UPDATE tabel
--     profiles bisa saja hanya mengizinkan baris milik sendiri (AccountPage).
-- Idempotent (aman dijalankan ulang). Pre-check: batal kalau sudah ada fungsi bernama sama yang BUKAN buatan file ini.
-- Jalankan di SQL Editor (role postgres).

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_set_user_divisi'
      and coalesce(obj_description(p.oid, 'pg_proc'), '') not like '%beehive:046%'
  ) then
    raise exception 'Fungsi public.fn_set_user_divisi sudah ada & bukan dari sql/046 -- cek dulu (pg_get_functiondef) sebelum lanjut.';
  end if;
end $$;

alter table public.profiles add column if not exists divisi text;

create or replace function public.fn_set_user_divisi(p_user_id uuid, p_divisi text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_divisi text := nullif(upper(btrim(coalesce(p_divisi, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Only Admin can change a user division';
  end if;
  if v_divisi is not null and length(v_divisi) > 60 then
    raise exception 'Division name is too long (max 60 characters)';
  end if;
  update public.profiles set divisi = v_divisi where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;
  return v_divisi;
end;
$$;

comment on function public.fn_set_user_divisi(uuid, text) is 'beehive:046 -- set divisi user (Admin saja)';
revoke execute on function public.fn_set_user_divisi(uuid, text) from public, anon;
grant execute on function public.fn_set_user_divisi(uuid, text) to authenticated;

-- (OPSIONAL) isi awal dari domain email yang jelas -- hapus komentar kalau mau:
-- update public.profiles set divisi = 'FINANCE'    where divisi is null and lower(email) like '%@finance.com';
-- update public.profiles set divisi = 'PURCHASING' where divisi is null and lower(email) like '%@purchasing.com';

-- Verifikasi: kolom ada & fungsi ada (keduanya true)
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'divisi') as kolom_divisi,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fn_set_user_divisi') as fungsi_set_divisi;
