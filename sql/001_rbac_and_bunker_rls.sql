-- RBAC (role & page access) + RLS untuk modul Bunker.
-- Jalankan SETELAH mengecek hasil sql/000_checks.sql. Aman dijalankan sekali (idempotent-ish
-- lewat "if not exists" pada DDL, tapi seed INSERT di bagian bawah TIDAK idempotent -- kalau
-- perlu re-run, hapus dulu baris seed-nya manual).

-- ── 1. Tabel RBAC ──────────────────────────────────────────────────────────
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_protected boolean not null default false, -- true HANYA utk role "Admin" bawaan
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key (user_id, role_id)
);

create table if not exists public.role_page_access (
  role_id uuid not null references public.roles(id) on delete cascade,
  page_key text not null,
  primary key (role_id, page_key)
);

-- ── 2. Function pengecekan akses (security definer -- boleh baca tabel RBAC
--    walau RLS-nya sendiri mengunci akses langsung ke tabel-tabel itu) ─────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_protected = true
  );
$$;

-- CATATAN: is_admin() TIDAK bergantung ke role_page_access sama sekali (cuma cek
-- roles.is_protected) -- supaya role Admin tidak bisa ke-lock-out gara-gara PIC salah
-- uncheck kotak di matrix halaman Kelola Role & Akses.
create or replace function public.has_page_access(p_page_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_roles ur
    join public.role_page_access rpa on rpa.role_id = ur.role_id
    where ur.user_id = auth.uid() and rpa.page_key = p_page_key
  );
$$;

-- RPC tunggal dipanggil frontend sekali per login -- frontend TIDAK query
-- user_roles/role_page_access langsung (supaya tidak bocor role user lain).
create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_admin', public.is_admin(),
    'page_keys', coalesce(
      (select jsonb_agg(distinct rpa.page_key)
       from public.user_roles ur
       join public.role_page_access rpa on rpa.role_id = ur.role_id
       where ur.user_id = auth.uid()),
      '[]'::jsonb)
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_page_access(text) to authenticated;
grant execute on function public.get_my_access() to authenticated;

-- ── 3. RLS pada tabel RBAC itu sendiri ──────────────────────────────────────
-- Hanya Admin yang boleh baca/tulis langsung ke ketiga tabel ini (dipakai halaman
-- Kelola Role & Akses). User biasa dapat status akses mereka sendiri lewat get_my_access().
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_page_access enable row level security;

drop policy if exists roles_admin_all on public.roles;
create policy roles_admin_all on public.roles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists user_roles_admin_all on public.user_roles;
create policy user_roles_admin_all on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists role_page_access_admin_all on public.role_page_access;
create policy role_page_access_admin_all on public.role_page_access
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 4. Tambahan policy di tabel profiles yang SUDAH ADA ─────────────────────
-- Cek dulu hasil query #2 di sql/000_checks.sql -- policy self-service yang sudah ada
-- (user baca/update baris miliknya sendiri) TIDAK disentuh, ini cuma NAMBAH izin baca
-- untuk Admin supaya halaman Kelola Role & Akses bisa menampilkan daftar semua user.
drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all on public.profiles
  for select using (public.is_admin());

-- ── 5. Seed: role "Admin" bawaan, akses penuh, di-assign ke SEMUA user yang
--    sudah ada sekarang -- supaya tidak ada yang ke-lock-out di hari pertama.
--    PIC bisa cabut/atur ulang lewat halaman Kelola Role & Akses setelah ini.
insert into public.roles (name, description, is_protected)
values ('Admin', 'Akses penuh ke seluruh halaman & bisa atur role user lain.', true)
on conflict (name) do nothing;

insert into public.role_page_access (role_id, page_key)
select (select id from public.roles where name = 'Admin'), pk
from unnest(array[
  'courier_upload','courier_audit','courier_rekapan','courier_validasi',
  'sea_air_upload','sea_air_audit','sea_air_rekapan',
  'direct_loading','bunker','audit_trail',
  'admin_rates','settings_fuel_surcharge','settings_kurs_bi',
  'settings_kurs_rule_vendor','settings_tarif_kontrak',
  'settings_tarif_far_overseas_vendor','settings_roles'
]) as pk
on conflict (role_id, page_key) do nothing;

insert into public.user_roles (user_id, role_id)
select p.id, (select id from public.roles where name = 'Admin')
from public.profiles p
on conflict (user_id, role_id) do nothing;

-- ── 6. RLS untuk modul Bunker (tabel baru, belum ada RLS sama sekali) ───────
-- n8n menulis ke tabel ini pakai SERVICE ROLE KEY -- otomatis melewati RLS di bawah,
-- jadi policy ini TIDAK mengganggu proses insert/update otomatis dari n8n, hanya
-- membatasi akses lewat aplikasi frontend (anon key + auth.uid()).
alter table public.bunker_dokumen enable row level security;
alter table public.bunker_processing_queue enable row level security;

drop policy if exists bunker_dokumen_page_access on public.bunker_dokumen;
create policy bunker_dokumen_page_access on public.bunker_dokumen
  for all using (public.has_page_access('bunker'))
  with check (public.has_page_access('bunker'));

drop policy if exists bunker_processing_queue_page_access on public.bunker_processing_queue;
create policy bunker_processing_queue_page_access on public.bunker_processing_queue
  for all using (public.has_page_access('bunker'))
  with check (public.has_page_access('bunker'));

-- Tabel baru lain yang muncul di hasil sql/000_checks.sql (kalau ada, selain Bunker) akan
-- menyusul dengan pola yang sama persis: ENABLE RLS + 1 policy FOR ALL USING/WITH CHECK
-- (has_page_access('<page_key>')) -- atau di-OR beberapa has_page_access(...) kalau tabelnya
-- dipakai lebih dari 1 halaman.
