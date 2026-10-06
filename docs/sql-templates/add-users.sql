-- =====================================================================================================
-- TEMPLATE: tambah user baru BeeHive (jalankan di Supabase SQL Editor, role postgres)
-- =====================================================================================================
-- Cara pakai:
--   1. Edit HANYA daftar di LANGKAH 1 (satu baris = satu user). Kolom:
--        email     : email login (otomatis disimpan huruf kecil)
--        nama      : nama tampil (mis. 'SELLY')
--        password  : password awal, minimal 6 karakter (minta user ganti setelah login pertama)
--        divisi    : grup di Manage Roles & Access, mis. 'FINANCE' / 'PURCHASING' / 'SHIPMENT' (boleh null)
--        role_name : nama role yang SUDAH ADA di Manage Roles & Access, mis. 'AP Finance' (boleh null = tanpa role)
--      Cek nama role yang ada:  select name from public.roles order by name;
--   2. Jalankan SELURUH file (Run). Hasil akhir = tabel verifikasi.
--
-- Perilaku:
--   * Email BARU   -> akun dibuat & langsung terkonfirmasi (tanpa email verifikasi), profil + divisi + role diisi.
--   * Email SUDAH ADA -> akun & password TIDAK diubah; nama/divisi diperbarui & role ditambahkan (kalau diisi).
--   * Role yang namanya tidak ditemukan dilewati (lihat pesan NOTICE di tab Messages), user tetap dibuat.
--   * Aman dijalankan ulang.
-- Catatan teknis: akun dibuat langsung di auth.users + auth.identities (token diisi '' bukan NULL; menyesuaikan
-- versi GoTrue ada/tidaknya kolom identities.provider_id). Kalau gagal, buat akun lewat Dashboard ->
-- Authentication -> Users -> Add User (Auto Confirm), lalu jalankan file ini lagi untuk mengisi nama/divisi/role.
-- JANGAN commit file ini setelah diisi password asli.
-- =====================================================================================================

-- ===================== LANGKAH 1: EDIT DAFTAR USER DI SINI =====================
drop table if exists _new_users;
create temp table _new_users (email text, nama text, password text, divisi text, role_name text);

insert into _new_users (email, nama, password, divisi, role_name) values
  ('nama.user@finance.com',    'NAMA USER',   'Waruna123', 'FINANCE',    'AP Finance'),
  ('user.kedua@purchasing.com', 'USER KEDUA', 'Waruna123', 'PURCHASING', null);
-- tambah baris lain dengan format sama; baris terakhir diakhiri titik koma (;)

-- ===================== LANGKAH 2: proses (tidak perlu diubah) =====================
do $$
declare
  r record;
  v_id uuid;
  v_email text;
  v_new boolean;
  v_role_id uuid;
  v_has_provider_id boolean;
  v_has_divisi boolean;
begin
  select exists (select 1 from information_schema.columns
                 where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id')
    into v_has_provider_id;
  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'divisi')
    into v_has_divisi;

  for r in select * from _new_users loop
    v_email := lower(btrim(r.email));
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Email tidak valid: %', r.email;
    end if;

    select id into v_id from auth.users where lower(email) = v_email;
    v_new := v_id is null;

    if v_new then
      if r.password is null or length(r.password) < 6 then
        raise exception 'Password % minimal 6 karakter', v_email;
      end if;
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
        extensions.crypt(r.password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nama', r.nama), now(), now(),
        '', '', '', ''
      );
      if v_has_provider_id then
        execute 'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                 values (gen_random_uuid(), $1, $1::text, $2, ''email'', now(), now(), now())'
          using v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true);
      else
        execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                 values ($1::text, $1, $2, ''email'', now(), now(), now())'
          using v_id, jsonb_build_object('sub', v_id::text, 'email', v_email);
      end if;
      raise notice 'DIBUAT  : %', v_email;
    else
      raise notice 'SUDAH ADA (password tidak diubah): %', v_email;
    end if;

    -- profil: nama (+ divisi kalau kolomnya ada)
    if v_has_divisi then
      execute 'insert into public.profiles (id, email, nama, divisi) values ($1, $2, $3, $4)
               on conflict (id) do update set email = excluded.email,
                 nama = coalesce(excluded.nama, public.profiles.nama),
                 divisi = coalesce(excluded.divisi, public.profiles.divisi)'
        using v_id, v_email, nullif(btrim(r.nama), ''), nullif(upper(btrim(coalesce(r.divisi, ''))), '');
    else
      insert into public.profiles (id, email, nama) values (v_id, v_email, nullif(btrim(r.nama), ''))
      on conflict (id) do update set email = excluded.email, nama = coalesce(excluded.nama, public.profiles.nama);
    end if;

    -- role (opsional)
    if nullif(btrim(coalesce(r.role_name, '')), '') is not null then
      select id into v_role_id from public.roles where lower(name) = lower(btrim(r.role_name));
      if v_role_id is null then
        raise notice 'ROLE TIDAK DITEMUKAN "%" utk % -- dilewati (atur di Manage Roles & Access)', r.role_name, v_email;
      else
        insert into public.user_roles (user_id, role_id) values (v_id, v_role_id)
        on conflict (user_id, role_id) do nothing;
      end if;
    end if;
  end loop;
end $$;

-- ===================== LANGKAH 3: verifikasi =====================
-- Harus 1 baris per user: email_confirmed & identity_ok = true, nama terisi, role sesuai.
select au.email,
       au.email_confirmed_at is not null as email_confirmed,
       exists (select 1 from auth.identities i where i.user_id = au.id and i.provider = 'email') as identity_ok,
       p.nama,
       to_jsonb(p) ->> 'divisi' as divisi,
       coalesce((select string_agg(ro.name, ', ') from public.user_roles ur join public.roles ro on ro.id = ur.role_id
                 where ur.user_id = au.id), '-') as roles
from _new_users n
join auth.users au on lower(au.email) = lower(btrim(n.email))
left join public.profiles p on p.id = au.id
order by au.email;

drop table if exists _new_users;
