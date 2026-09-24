-- 2026-09: RPC BARU (belum pernah dibuat sebelumnya di sesi Claude Code manapun) -- fondasi
-- fitur "Add Manual Entry" di List Memo FAR Overseas Air (`FarOverseasAirPage.tsx`), pola sama
-- tombol "Tambah Data" Audit AP Local/Overseas/PI Local: dokumen yang GAGAL diproses otomasi n8n
-- sama sekali (tidak pernah masuk `rekapan_far_overseas_air` lewat jalur normal) bisa dibuat
-- manual dari UI. SEBELUM MENJALANKAN INI -- ikuti aturan wajib CLAUDE.md bagian "Peta RPC
-- function Supabase": pastikan dulu fungsi bernama `insert_rekapan_far_overseas_manual` BELUM
-- ada (mis. `select pg_get_functiondef('insert_rekapan_far_overseas_manual'::regproc)` harus
-- error "does not exist") -- project ini dipakai bersama n8n & bisa saja ada fungsi serupa yang
-- dibuat user sendiri tanpa tercermin di kode/dokumen ini.
--
-- Cuma insert 1 BARIS KOSONG (approval_status='PENDING', SAMA seperti shipment hasil otomasi
-- normal -- TIDAK ADA kolom/penanda "manual" terpisah, sesuai keputusan: baris ini ikut alur
-- approval biasa apa adanya). Pengisian SEMUA field lain (Ship Via/Vendor/Invoice/dst) dilakukan
-- SETELAH ini lewat RPC `update_rekapan_far_overseas_manual` yang SUDAH ADA (form edit yang sama
-- persis dipakai utk Edit biasa, `FarOverseasAirCardEditModal`) -- RPC ini SENGAJA tidak terima
-- parameter apa pun, supaya tidak perlu duplikasi ~25 kolom whitelist yang sudah ada di RPC itu.
create or replace function public.insert_rekapan_far_overseas_manual()
returns json
language plpgsql
security definer
as $$
declare
  new_id uuid;
  result json;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to add FAR Overseas Air memos';
  end if;

  insert into public.rekapan_far_overseas_air (approval_status)
  values ('PENDING')
  returning id into new_id;

  select to_json(rekapan_far_overseas_air.*) into result
  from public.rekapan_far_overseas_air where id = new_id;

  return result;
end;
$$;
grant execute on function public.insert_rekapan_far_overseas_manual() to authenticated;
