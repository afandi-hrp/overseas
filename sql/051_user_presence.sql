-- beehive:051 -- 2026-10-09: "User Activity" (siapa online + kapan terakhir masuk + halaman yang sedang dibuka) -- panel terbawah
-- Settings -> Manage Roles & Access (HANYA Admin).
--   * tabel public.user_presence (1 baris per user; diisi heartbeat aplikasi ~tiap 60 dtk; waktu SELALU dari server `now()`)
--   * RPC public.fn_user_heartbeat(text, boolean)  -- SECURITY INVOKER, menulis baris MILIK SENDIRI (ikut RLS)
--   * RPC public.fn_user_activity()                -- SECURITY DEFINER, HANYA Admin (is_admin()), gabung profiles + auth.users.last_sign_in_at
-- "Terakhir masuk" = auth.users.last_sign_in_at (dicatat Supabase tiap login; aplikasi logout saat tab ditutup/idle 30 mnt, jadi tiap kunjungan = login baru).
-- Idempotent (aman dijalankan ulang). Pre-check: batal kalau objek bernama sama sudah ada & BUKAN buatan file ini.
-- Jalankan di SQL Editor (role postgres). Sebelum itu (aturan proyek) cek nama belum dipakai:
--   select to_regclass('public.user_presence'), to_regproc('public.fn_user_heartbeat'), to_regproc('public.fn_user_activity');  -- semua harus NULL

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('fn_user_heartbeat', 'fn_user_activity')
      and coalesce(obj_description(p.oid, 'pg_proc'), '') not like '%beehive:051%'
  ) then
    raise exception 'Fungsi fn_user_heartbeat / fn_user_activity sudah ada & bukan dari sql/051 -- cek dulu (pg_get_functiondef) sebelum lanjut.';
  end if;
  if to_regclass('public.user_presence') is not null
     and coalesce(obj_description(to_regclass('public.user_presence'), 'pg_class'), '') not like '%beehive:051%' then
    raise exception 'Tabel public.user_presence sudah ada & bukan dari sql/051 -- cek dulu sebelum lanjut.';
  end if;
end $$;

-- ───────────────────────── tabel ─────────────────────────
create table if not exists public.user_presence (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  last_seen   timestamptz not null default now(),   -- heartbeat terakhir (tab aplikasi terbuka & sesi hidup)
  last_active timestamptz,                          -- terakhir user benar-benar mengetik/klik (NULL = belum pernah)
  page        text                                  -- path halaman yang dibuka saat heartbeat terakhir
);
comment on table public.user_presence is 'beehive:051 -- presence user (heartbeat aplikasi); dibaca Admin lewat fn_user_activity()';

alter table public.user_presence enable row level security;

revoke all on public.user_presence from anon, public;
grant select, insert, update, delete on public.user_presence to authenticated;

-- 4 policy (aturan proyek): user hanya menulis baris MILIKNYA; baca = miliknya atau Admin (ON CONFLICT DO UPDATE butuh baca baris sendiri); hapus = Admin.
drop policy if exists user_presence_select on public.user_presence;
drop policy if exists user_presence_insert on public.user_presence;
drop policy if exists user_presence_update on public.user_presence;
drop policy if exists user_presence_delete on public.user_presence;
create policy user_presence_select on public.user_presence for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_presence_insert on public.user_presence for insert to authenticated
  with check (user_id = auth.uid());
create policy user_presence_update on public.user_presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_presence_delete on public.user_presence for delete to authenticated
  using (public.is_admin());

-- ───────────────────────── heartbeat (SECURITY INVOKER) ─────────────────────────
create or replace function public.fn_user_heartbeat(p_page text, p_active boolean default true)
returns void
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.user_presence as up (user_id, last_seen, last_active, page)
  values (auth.uid(), now(), case when p_active then now() end, left(p_page, 200))
  on conflict (user_id) do update
    set last_seen   = now(),
        last_active = case when p_active then now() else up.last_active end,
        page        = left(p_page, 200);
end;
$$;
comment on function public.fn_user_heartbeat(text, boolean) is 'beehive:051 -- heartbeat presence (baris milik sendiri)';
revoke execute on function public.fn_user_heartbeat(text, boolean) from public, anon;
grant execute on function public.fn_user_heartbeat(text, boolean) to authenticated;

-- ───────────────────────── daftar aktivitas (SECURITY DEFINER, Admin saja) ─────────────────────────
create or replace function public.fn_user_activity()
returns table (
  user_id         uuid,
  email           text,
  nama            text,
  divisi          text,
  last_sign_in_at timestamptz,
  last_seen       timestamptz,
  last_active     timestamptz,
  page            text,
  server_now      timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can view user activity' using errcode = '42501';
  end if;
  return query
    select p.id, p.email::text, p.nama::text, p.divisi::text,
           au.last_sign_in_at, up.last_seen, up.last_active, up.page, now()
    from public.profiles p
    left join auth.users au on au.id = p.id
    left join public.user_presence up on up.user_id = p.id
    order by up.last_seen desc nulls last, au.last_sign_in_at desc nulls last, p.nama;
end;
$$;
comment on function public.fn_user_activity() is 'beehive:051 -- aktivitas semua user (Admin saja)';
revoke execute on function public.fn_user_activity() from public, anon;
grant execute on function public.fn_user_activity() to authenticated;

-- Verifikasi (semua true)
select
  to_regclass('public.user_presence') is not null as tabel_ada,
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_presence' and policyname = 'user_presence_select') as policy_ada,
  to_regproc('public.fn_user_heartbeat') is not null as fungsi_heartbeat,
  to_regproc('public.fn_user_activity') is not null as fungsi_activity;
