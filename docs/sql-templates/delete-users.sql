-- =====================================================================================================
-- TEMPLATE: hapus user BeeHive (jalankan di Supabase SQL Editor, role postgres)
-- =====================================================================================================
-- Cara pakai:
--   1. Edit HANYA daftar email di LANGKAH 1 (satu baris = satu user).
--   2. Jalankan SELURUH file. Secara bawaan mode PREVIEW (v_eksekusi = false): hanya menampilkan apa yang
--      AKAN dihapus, tidak ada yang berubah. Setelah yakin, ubah v_eksekusi jadi true lalu Run lagi.
--
-- Yang dihapus per user (skema dicek 2026-10-21):
--   * auth.users (+ auth.identities/sessions/refresh_tokens ikut terhapus oleh GoTrue FK cascade)
--   * CASCADE otomatis dari auth.users: public.profiles, public.user_roles (user_id), public.user_presence,
--     public.user_security
--   * Manual (tidak punya FK): public.user_approval_tiers, public.far_overseas_step_signers
--   * public.user_roles.assigned_by (FK tanpa cascade) -> di-NULL-kan dulu supaya penghapusan tidak ditolak
--     kalau user itu pernah meng-assign role ke orang lain
-- Yang SENGAJA dibiarkan: riwayat (audit_trail, far_overseas_memo_log, kolom nama/email teks di tabel data) --
--   itu catatan historis, bukan relasi akun.
-- PERINGATAN: tidak bisa dibatalkan. Kalau hanya mau menutup akses, lebih aman cabut role-nya di Manage Roles
--   & Access (hapus baris user_roles) daripada menghapus akun. Admin terakhir jangan dihapus (script menolak
--   kalau akibatnya tidak ada Admin tersisa).
-- =====================================================================================================

-- ===================== LANGKAH 1: EDIT DAFTAR EMAIL DI SINI =====================
drop table if exists _del_users;
create temp table _del_users (email text);

insert into _del_users (email) values
  ('nama.user@finance.com'),
  ('user.kedua@purchasing.com');
-- tambah baris lain dengan format sama; baris terakhir diakhiri titik koma (;)

-- ===================== LANGKAH 2: proses =====================
do $$
declare
  v_eksekusi boolean := false;   -- false = PREVIEW saja; true = benar-benar hapus
  r record;
  v_id uuid;
  v_email text;
  v_admin_left int;
begin
  for r in select * from _del_users loop
    v_email := lower(btrim(r.email));
    select id into v_id from auth.users where lower(email) = v_email;

    if v_id is null then
      raise notice 'TIDAK DITEMUKAN (dilewati): %', v_email;
      continue;
    end if;

    raise notice '% -> %: profil=%, role=%, approval_tier=%, signer_memo=%',
      case when v_eksekusi then 'HAPUS' else 'PREVIEW' end, v_email,
      (select count(*) from public.profiles where id = v_id),
      (select count(*) from public.user_roles where user_id = v_id),
      (select count(*) from public.user_approval_tiers where user_id = v_id),
      (select count(*) from public.far_overseas_step_signers where user_id = v_id);

    if not v_eksekusi then
      continue;
    end if;

    -- cegah menghapus Admin terakhir
    if exists (select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id
               where ur.user_id = v_id and ro.is_protected) then
      select count(distinct ur.user_id) into v_admin_left
      from public.user_roles ur join public.roles ro on ro.id = ur.role_id
      where ro.is_protected and ur.user_id <> v_id
        and ur.user_id not in (select id from auth.users where lower(email) in (select lower(btrim(email)) from _del_users));
      if v_admin_left = 0 then
        raise exception 'Menolak: % adalah Admin terakhir yang tersisa', v_email;
      end if;
    end if;

    update public.user_roles set assigned_by = null where assigned_by = v_id;
    delete from public.user_approval_tiers where user_id = v_id;
    delete from public.far_overseas_step_signers where user_id = v_id;
    delete from auth.users where id = v_id;   -- cascade: profiles, user_roles, user_presence, user_security, identities, sessions
    raise notice 'DIHAPUS: %', v_email;
  end loop;
end $$;

-- ===================== LANGKAH 3: verifikasi =====================
-- Setelah eksekusi: kolom masih_ada harus false untuk semua baris. (Saat PREVIEW tentu masih true.)
select n.email,
       exists (select 1 from auth.users au where lower(au.email) = lower(btrim(n.email))) as masih_ada
from _del_users n
order by n.email;

drop table if exists _del_users;
