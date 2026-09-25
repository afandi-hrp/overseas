-- 2026-09: Bikin 12 akun baru SEKALIGUS (auth.users + auth.identities) + isi profiles.nama +
-- assign role "AP Finance" -- SATU FILE, sekali jalan (GANTI dari sql/019 yang butuh akun
-- dibuat manual dulu lewat Dashboard). Password default "Waruna123" utk semua 12 akun (staf
-- ganti sendiri nanti). Idempotent -- baris yang emailnya SUDAH ada di auth.users otomatis
-- di-skip (tidak dobel), jadi aman dijalankan ulang.
--
-- WAJIB dicek DULU sebelum run: role "AP Finance" sudah ada di tabel roles --
--   insert into public.roles (name) values ('AP Finance') on conflict (name) do nothing;
--
-- SARAN: setelah dijalankan, coba login pakai SALAH SATU akun (mis. stella@finance.com /
-- Waruna123) dulu utk pastikan berhasil, sebelum menganggap semuanya beres.

create extension if not exists pgcrypto;

do $$
declare
  v_id uuid;
  v_role_id uuid;
  v_password text := 'Waruna123';
  v_users text[][] := array[
    ['stella@finance.com', 'STELLA'],
    ['cindy.eileen@finance.com', 'CINDY EILEEN'],
    ['carissa@finance.com', 'CARISSA'],
    ['jesslyn@finance.com', 'JESSLYN'],
    ['jessica@finance.com', 'JESSICA'],
    ['chintya@finance.com', 'CHINTYA'],
    ['cintia@finance.com', 'CINTIA'],
    ['cindy.liguna@finance.com', 'CINDY LIGUNA'],
    ['suliana@finance.com', 'SULIANA'],
    ['megawaty@finance.com', 'MEGAWATY'],
    ['dewi@finance.com', 'DEWI'],
    ['fitri@finance.com', 'FITRI']
  ];
  v_row text[];
begin
  select id into v_role_id from public.roles where name = 'AP Finance';
  if v_role_id is null then
    raise exception 'Role "AP Finance" belum ada di tabel roles -- jalankan dulu: insert into public.roles (name) values (''AP Finance'');';
  end if;

  foreach v_row slice 1 in array v_users
  loop
    if exists (select 1 from auth.users where email = v_row[1]) then
      raise notice 'Skip % -- akun sudah ada', v_row[1];
    else
      v_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_row[1],
        crypt(v_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', v_row[1]),
        'email', now(), now(), now()
      );

      raise notice 'Akun dibuat: %', v_row[1];
    end if;

    -- profiles/user_roles tetap di-upsert walau akunnya sudah ada dari sebelumnya (mis. sisa
    -- percobaan sql/019) -- supaya nama & role tetap ke-assign dgn benar.
    select id into v_id from auth.users where email = v_row[1];

    insert into public.profiles (id, email, nama)
    values (v_id, v_row[1], v_row[2])
    on conflict (id) do update set nama = excluded.nama;

    insert into public.user_roles (user_id, role_id)
    values (v_id, v_role_id)
    on conflict (user_id, role_id) do nothing;
  end loop;
end $$;

-- Verifikasi -- HARUS muncul 12 baris.
select au.email, p.nama, r.name as role
from auth.users au
join public.profiles p on p.id = au.id
join public.user_roles ur on ur.user_id = au.id
join public.roles r on r.id = ur.role_id
where au.email like '%@finance.com'
order by au.email;
