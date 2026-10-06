-- beehive:048 — Halaman Audit Trail: daftar user server-side + index pencarian (2026-10-06, permintaan user). Idempotent.
--
--   A. Cek pengaman nama fungsi.
--   B. RPC baca `fn_audit_trail_users()` -- daftar user_email UNIK dihitung di Postgres (dulu: 2.000 baris terbaru
--      diambil ke browser lalu di-dedup -> user yang aktivitasnya lebih lama tidak muncul di dropdown "User").
--      SECURITY INVOKER (baca saja) -> ikut RLS audit_trail / view v_audit_trail (security_invoker) yang sudah ada.
--   C. Index: btree user_email (filter "User" + distinct) & trigram (pg_trgm) utk Search `%…%` di awb / no_dokumen /
--      user_email. Index `tabel`, `awb`, `created_at` sudah ada (cek user 2026-10-06, audit_trail 6.399 baris).

-- ── A. Cek pengaman ─────────────────────────────────────────────────────────
do $$
declare v_conflict text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_audit_trail_users'
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:048%';
  if v_conflict is not null then
    raise exception 'STOP 048: nama fungsi sudah dipakai fungsi lain (bukan dari file 048): %', v_conflict;
  end if;
  if to_regclass('public.v_audit_trail') is null then
    raise exception 'STOP 048: view public.v_audit_trail tidak ditemukan.';
  end if;
end $$;

-- ── B. Daftar user unik ─────────────────────────────────────────────────────
create or replace function public.fn_audit_trail_users()
returns table (user_email text)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select distinct btrim(v.user_email) as user_email
  from public.v_audit_trail v
  where v.user_email is not null and btrim(v.user_email) <> ''
  order by 1
$$;
comment on function public.fn_audit_trail_users() is 'beehive:048 daftar user_email unik halaman Audit Trail (baca saja, ikut RLS)';
revoke all on function public.fn_audit_trail_users() from public, anon;
grant execute on function public.fn_audit_trail_users() to authenticated;

-- ── C. Index ────────────────────────────────────────────────────────────────
create index if not exists idx_audit_trail_user_email on public.audit_trail (user_email);

create extension if not exists pg_trgm with schema extensions;
do $$
declare v_schema text;
begin
  -- pg_trgm bisa terpasang di schema `extensions` ATAU `public` (tergantung riwayat stack) -> pakai schema yang ada.
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists idx_audit_trail_awb_trgm on public.audit_trail using gin (awb %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists idx_audit_trail_no_dokumen_trgm on public.audit_trail using gin (no_dokumen %I.gin_trgm_ops)', v_schema);
  execute format('create index if not exists idx_audit_trail_user_email_trgm on public.audit_trail using gin (user_email %I.gin_trgm_ops)', v_schema);
end $$;
