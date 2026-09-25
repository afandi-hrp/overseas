-- 2026-09: Isi profiles.nama + assign role "AP Finance" utk 12 akun baru.
-- WAJIB dijalankan SETELAH ke-12 akun dibuat manual lewat Supabase Dashboard
-- (Authentication -> Users -> Add User, "Auto Confirm User" dicentang), password default
-- "Waruna123" (staf ganti sendiri nanti). JANGAN insert langsung ke auth.users lewat SQL --
-- skema tabel itu dikelola internal Supabase, insert manual berisiko akun rusak/gagal login.
--
-- Cara kerja: cocokkan baris `auth.users.email` yang SUDAH ada, lalu upsert ke `profiles`
-- (isi `nama`) & `user_roles` (assign role "AP Finance" -- WAJIB SUDAH ADA di tabel `roles`,
-- kalau belum ada jalankan dulu `insert into public.roles (name) values ('AP Finance');`).
-- Idempotent -- aman dijalankan ulang (ON CONFLICT DO UPDATE/DO NOTHING).

with new_users (email, nama) as (
  values
    ('stella@finance.com', 'STELLA'),
    ('cindy.eileen@finance.com', 'CINDY EILEEN'),
    ('carissa@finance.com', 'CARISSA'),
    ('jesslyn@finance.com', 'JESSLYN'),
    ('jessica@finance.com', 'JESSICA'),
    ('chintya@finance.com', 'CHINTYA'),
    ('cintia@finance.com', 'CINTIA'),
    ('cindy.liguna@finance.com', 'CINDY LIGUNA'),
    ('suliana@finance.com', 'SULIANA'),
    ('megawaty@finance.com', 'MEGAWATY'),
    ('dewi@finance.com', 'DEWI'),
    ('fitri@finance.com', 'FITRI')
)
-- 1) Isi/perbarui profiles.nama utk tiap akun yang emailnya cocok di auth.users
insert into public.profiles (id, email, nama)
select au.id, au.email, nu.nama
from new_users nu
join auth.users au on au.email = nu.email
on conflict (id) do update set nama = excluded.nama;

-- 2) Assign role "AP Finance" ke ke-12 akun itu (skip kalau sudah pernah di-assign)
insert into public.user_roles (user_id, role_id)
select au.id, r.id
from auth.users au
join public.roles r on r.name = 'AP Finance'
where au.email in (
  'stella@finance.com', 'cindy.eileen@finance.com', 'carissa@finance.com', 'jesslyn@finance.com',
  'jessica@finance.com', 'chintya@finance.com', 'cintia@finance.com', 'cindy.liguna@finance.com',
  'suliana@finance.com', 'megawaty@finance.com', 'dewi@finance.com', 'fitri@finance.com'
)
on conflict (user_id, role_id) do nothing;

-- 3) Verifikasi -- cek 12 baris ini muncul semua sebelum dianggap selesai
select au.email, p.nama, r.name as role
from auth.users au
join public.profiles p on p.id = au.id
join public.user_roles ur on ur.user_id = au.id
join public.roles r on r.id = ur.role_id
where au.email like '%@finance.com'
order by au.email;
