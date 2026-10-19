-- =====================================================================================================
-- 066_force_password_change.sql -- Wajib ganti password (user baru / password default)  [2026-10-19]
-- =====================================================================================================
-- Jalankan di Supabase SQL Editor (stack supabase3), SELURUH file sekaligus. Idempotent (aman dijalankan ulang).
--
-- Isi:
--   1. Tabel public.user_security (1 baris per user): must_change_password + jejak waktu.
--      RLS: user hanya BACA baris sendiri (Admin baca semua); TIDAK ADA grant tulis utk authenticated -> penanda tidak
--      bisa dihapus user lewat API (beda dgn public.profiles yg boleh di-update pemiliknya).
--   2. Trigger AFTER UPDATE di auth.users: password BENAR-BENAR berubah (encrypted_password beda) -> penanda dihapus
--      otomatis. Satu-satunya jalan user membersihkan penandanya = mengganti password. Trigger dibungkus EXCEPTION
--      supaya error apa pun TIDAK PERNAH menggagalkan login/ganti password GoTrue.
--   3. RPC public.fn_set_must_change_password(user_id, value) -- Admin saja (guard is_admin()).
--   4. LANGKAH BACKFILL (opsional, bawah): tandai user lama yg belum pernah login & yg password-nya masih default.
--
-- PENTING: reset password user oleh Admin (Dashboard -> Authentication / SQL) JUGA mengubah encrypted_password ->
-- trigger ikut menghapus penanda. Setelah reset, tandai lagi: select public.fn_set_must_change_password('<uuid>', true);
-- (atau jalankan template docs/sql-templates/add-users.sql utk user baru -- sudah otomatis menandai).
-- =====================================================================================================

-- ── 1. Tabel ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_security (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  must_change_password boolean     not null default false,
  flagged_at           timestamptz,
  flagged_by           text,
  password_changed_at  timestamptz,
  updated_at           timestamptz not null default now()
);

alter table public.user_security enable row level security;

drop policy if exists user_security_select on public.user_security;
create policy user_security_select on public.user_security
  for select using (user_id = auth.uid() or public.is_admin());
-- Tulis hanya Admin (praktiknya lewat RPC/trigger SECURITY DEFINER; grant tulis ke authenticated memang tidak ada).
drop policy if exists user_security_insert on public.user_security;
create policy user_security_insert on public.user_security
  for insert with check (public.is_admin());
drop policy if exists user_security_update on public.user_security;
create policy user_security_update on public.user_security
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists user_security_delete on public.user_security;
create policy user_security_delete on public.user_security
  for delete using (public.is_admin());

revoke all on public.user_security from public, anon, authenticated;
grant select on public.user_security to authenticated;

-- ── 2. Trigger: password berubah -> penanda hilang ───────────────────────────────────────────────────
create or replace function public.fn_user_security_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  begin
    update public.user_security
       set must_change_password = false,
           password_changed_at  = now(),
           updated_at           = now()
     where user_id = new.id;
  exception when others then
    -- JANGAN pernah menggagalkan proses auth GoTrue krn tabel ini.
    raise warning 'fn_user_security_on_password_change gagal utk %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.fn_user_security_on_password_change() from public, anon, authenticated;

drop trigger if exists trg_user_security_password_change on auth.users;
create trigger trg_user_security_password_change
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.fn_user_security_on_password_change();

-- ── 3. RPC Admin: tandai / lepas penanda ─────────────────────────────────────────────────────────────
create or replace function public.fn_set_must_change_password(p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya Admin yang boleh mengatur wajib ganti password.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User tidak ditemukan.';
  end if;
  insert into public.user_security (user_id, must_change_password, flagged_at, flagged_by, updated_at)
  values (p_user_id, coalesce(p_value, false), case when p_value then now() end, auth.email(), now())
  on conflict (user_id) do update
     set must_change_password = excluded.must_change_password,
         flagged_at = case when excluded.must_change_password then now() else public.user_security.flagged_at end,
         flagged_by = excluded.flagged_by,
         updated_at = now();
end;
$$;

revoke all on function public.fn_set_must_change_password(uuid, boolean) from public, anon;
grant execute on function public.fn_set_must_change_password(uuid, boolean) to authenticated;

-- ── 4. BACKFILL user lama (opsional) ─────────────────────────────────────────────────────────────────
-- 4a. Daftar password default yang pernah dibagikan ke user -- EDIT sesuai yang dipakai (boleh lebih dari 1 baris).
drop table if exists _default_passwords;
create temp table _default_passwords (pw text);
insert into _default_passwords (pw) values
  ('Waruna123');

-- 4b. Tandai: (i) user yang BELUM PERNAH login, (ii) user yang password-nya MASIH salah satu password default.
--     User yang sudah ditandai tetap ditandai; user yg tidak memenuhi kriteria TIDAK diubah.
insert into public.user_security (user_id, must_change_password, flagged_at, flagged_by, updated_at)
select u.id, true, now(), 'sql/066 backfill', now()
  from auth.users u
 where u.last_sign_in_at is null
    or exists (select 1 from _default_passwords d
                where u.encrypted_password is not null
                  and u.encrypted_password = extensions.crypt(d.pw, u.encrypted_password))
on conflict (user_id) do update
   set must_change_password = true,
       flagged_at = coalesce(public.user_security.flagged_at, now()),
       flagged_by = coalesce(public.user_security.flagged_by, 'sql/066 backfill'),
       updated_at = now();

drop table if exists _default_passwords;

-- ── 5. Verifikasi ────────────────────────────────────────────────────────────────────────────────────
-- Daftar user yang WAJIB ganti password setelah file ini dijalankan.
select u.email, p.nama, s.flagged_at, s.flagged_by, u.last_sign_in_at
  from public.user_security s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
 where s.must_change_password
 order by u.email;
