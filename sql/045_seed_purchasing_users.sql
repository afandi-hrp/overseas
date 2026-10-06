-- beehive:045 -- 2026-10-06: buat 3 akun Purchasing (password default "Waruna123", staf ganti sendiri nanti
-- lewat halaman My Account / reset).
--   selly@purchasing.com    -> SELLY
--   vanessa@purchasing.com  -> VANESSA
--   caroline@purchasing.com -> CAROLINE
--
-- CATATAN: preseden sql/019 membuat akun lewat Dashboard (Authentication -> Users -> Add User, Auto Confirm)
-- krn auth.users dikelola GoTrue. Script ini membuat akun LANGSUNG lewat SQL dgn hati-hati:
--   * email disimpan huruf kecil (GoTrue menormalkan email saat login),
--   * kolom token diisi '' (BUKAN NULL -- NULL bikin login gagal "converting NULL to string"),
--   * auth.identities ikut dibuat (provider 'email'), menyesuaikan versi GoTrue (ada/tidaknya kolom provider_id),
--   * email yg SUDAH ADA di auth.users dilewati (aman dijalankan ulang).
-- KALAU BAGIAN 1 ERROR: buat ke-3 akun lewat Dashboard (Auto Confirm, password Waruna123), lalu jalankan
-- BAGIAN 2 & 3 saja.
-- Jalankan di SQL Editor (role postgres).

-- ===================== BAGIAN 1: akun auth =====================
do $$
declare
  r record;
  v_id uuid;
  v_has_provider_id boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) into v_has_provider_id;

  for r in
    select * from (values
      ('selly@purchasing.com', 'SELLY'),
      ('vanessa@purchasing.com', 'VANESSA'),
      ('caroline@purchasing.com', 'CAROLINE')
    ) as t(email, nama)
  loop
    if exists (select 1 from auth.users where lower(email) = r.email) then
      raise notice 'Lewati % (sudah ada)', r.email;
      continue;
    end if;

    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
      extensions.crypt('Waruna123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nama', r.nama), now(), now(),
      '', '', '', ''
    );

    if v_has_provider_id then
      execute 'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, $2, ''email'', now(), now(), now())'
        using v_id, jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true);
    else
      execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values ($1::text, $1, $2, ''email'', now(), now(), now())'
        using v_id, jsonb_build_object('sub', v_id::text, 'email', r.email);
    end if;

    raise notice 'Dibuat %', r.email;
  end loop;
end $$;

-- ===================== BAGIAN 2: profil (nama) =====================
-- Upsert (kalau ada trigger yg sudah membuat baris profiles otomatis, baris itu diperbarui).
insert into public.profiles (id, email, nama)
select au.id, au.email, t.nama
from (values
  ('selly@purchasing.com', 'SELLY'),
  ('vanessa@purchasing.com', 'VANESSA'),
  ('caroline@purchasing.com', 'CAROLINE')
) as t(email, nama)
join auth.users au on lower(au.email) = t.email
on conflict (id) do update set email = excluded.email, nama = excluded.nama;

-- ===================== (OPSIONAL) assign role =====================
-- Tanpa role, user bisa login tapi TIDAK melihat menu apa pun (hanya My Account). Assign bisa juga lewat
-- Settings -> Manage Roles & Access -> Roles per User. Kalau mau lewat SQL, ganti 'NAMA_ROLE' dgn nama role
-- yg sudah ada (cek: select name from public.roles order by name;) lalu hapus tanda komentar:
-- insert into public.user_roles (user_id, role_id)
-- select au.id, r.id
-- from auth.users au
-- join public.roles r on r.name = 'NAMA_ROLE'
-- where lower(au.email) in ('selly@purchasing.com', 'vanessa@purchasing.com', 'caroline@purchasing.com')
-- on conflict (user_id, role_id) do nothing;

-- ===================== BAGIAN 3: verifikasi =====================
-- Harus 3 baris, email_confirmed terisi, identity_ok = true, nama terisi.
select au.email,
       au.email_confirmed_at is not null as email_confirmed,
       exists (select 1 from auth.identities i where i.user_id = au.id and i.provider = 'email') as identity_ok,
       p.nama,
       coalesce((select string_agg(r.name, ', ') from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = au.id), '-') as roles
from auth.users au
left join public.profiles p on p.id = au.id
where lower(au.email) in ('selly@purchasing.com', 'vanessa@purchasing.com', 'caroline@purchasing.com')
order by au.email;
