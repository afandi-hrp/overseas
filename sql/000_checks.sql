-- Jalankan di Supabase SQL Editor SEBELUM RBAC di-implementasikan.
-- Copy hasil kedua query ini (bisa sekali jalan, scroll ke bawah untuk hasil query ke-2)
-- dan kirim balik ke Claude.

-- 1) Tabel di schema public yang RLS-nya BELUM aktif -- dipakai untuk menentukan tabel apa
--    saja yang perlu dibuatkan RLS baru selain modul Bunker yang sudah diketahui.
select
  schemaname,
  tablename,
  rowsecurity as rls_aktif
from pg_tables
where schemaname = 'public'
order by rowsecurity asc, tablename asc;

-- 2) Policy RLS yang SUDAH ada di tabel profiles -- dipakai supaya policy baru "Admin boleh
--    lihat semua profile" (dibutuhkan halaman Kelola Role & Akses) ditambahkan tanpa merusak
--    perilaku self-service yang sudah jalan (AccountPage.tsx: user baca/update baris miliknya
--    sendiri).
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles';
