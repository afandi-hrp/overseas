-- =====================================================================================================
-- 067_profiles_lock_and_admin_reset_password.sql  [2026-10-19]
-- =====================================================================================================
-- Jalankan di Supabase SQL Editor (stack supabase3), SELURUH file. Idempotent. Butuh sql/066 (tabel user_security).
--
-- 1. public.profiles: user login (authenticated) HANYA boleh mengubah kolom `nama` (+ `updated_at`) barisnya sendiri.
--    Sebelumnya policy "Users can update own profile" + grant tabel penuh = user bisa mengubah SEMUA kolom profilnya
--    lewat API (divisi, approval_tier, email). Kolom lain hanya lewat RPC Admin SECURITY DEFINER (mis. fn_set_user_divisi)
--    / service role (n8n) -- keduanya tidak terpengaruh grant kolom ini.
-- 2. RPC public.fn_admin_reset_user_password(p_user_id uuid, p_new_password text) -- Admin saja:
--    set password sementara (bcrypt, sama dgn GoTrue) -> user WAJIB ganti password saat login berikutnya (user_security)
--    -> semua sesi/refresh token user itu dicabut (logout paksa di semua perangkat). Admin tidak bisa me-reset dirinya sendiri.
-- 3. Kolom jejak reset di user_security + hak baca utk role read-only claude_ro (MCP sesi Claude) kalau role-nya ada.
-- =====================================================================================================

-- ── 1. profiles: update hanya kolom nama ─────────────────────────────────────────────────────────────
revoke update on public.profiles from authenticated;
grant update (nama, updated_at) on public.profiles to authenticated;

-- ── 3. Kolom jejak reset (dipakai RPC di bawah) ─────────────────────────────────────────────────────
alter table public.user_security add column if not exists password_reset_at timestamptz;
alter table public.user_security add column if not exists password_reset_by text;

-- ── 2. RPC Admin reset password ─────────────────────────────────────────────────────────────────────
create or replace function public.fn_admin_reset_user_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only Admin can reset a user password.';
  end if;
  if p_user_id is null then
    raise exception 'User not found.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot reset your own password here. Use My Account instead.';
  end if;
  if p_new_password is null or length(p_new_password) < 8
     or p_new_password !~ '[A-Za-z]' or p_new_password !~ '[0-9]' then
    raise exception 'Temporary password must be at least 8 characters and contain letters and numbers.';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if not found then
    raise exception 'User not found.';
  end if;

  -- Ganti password (trigger sql/066 ikut jalan & menghapus penanda -> ditandai ulang di bawah).
  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  insert into public.user_security (user_id, must_change_password, flagged_at, flagged_by, password_reset_at, password_reset_by, updated_at)
  values (p_user_id, true, now(), auth.email(), now(), auth.email(), now())
  on conflict (user_id) do update
     set must_change_password = true,
         flagged_at = now(),
         flagged_by = excluded.flagged_by,
         password_reset_at = now(),
         password_reset_by = excluded.password_reset_by,
         updated_at = now();

  -- Logout paksa di semua perangkat: cabut sesi & refresh token (access token lama habis sendiri <= 1 jam, dan selama
  -- itu user ditahan layar wajib ganti password + gateway). Dibungkus EXCEPTION -- skema auth beda versi tidak boleh
  -- menggagalkan reset.
  begin
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where user_id = $1' using p_user_id::text;
    end if;
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    end if;
  exception when others then
    raise warning 'fn_admin_reset_user_password: gagal mencabut sesi %: %', v_email, sqlerrm;
  end;
end;
$$;

revoke all on function public.fn_admin_reset_user_password(uuid, text) from public, anon;
grant execute on function public.fn_admin_reset_user_password(uuid, text) to authenticated;

-- Hak baca utk role read-only MCP (tabel ini dibuat sesudah default privileges claude_ro).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'claude_ro') then
    execute 'grant select on public.user_security to claude_ro';
  end if;
end $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────────────────────────────
-- Harus: update hanya (nama, updated_at); fungsi reset ada.
select 'profiles UPDATE kolom' as cek, string_agg(column_name, ', ' order by column_name) as hasil
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
union all
select 'profiles UPDATE tabel penuh (harus kosong)', string_agg(privilege_type, ', ')
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
union all
select 'fn_admin_reset_user_password', case when to_regprocedure('public.fn_admin_reset_user_password(uuid,text)') is not null then 'ada' else 'TIDAK ADA' end;
