-- 039 -- Finance Handover Courier: Finance boleh MELIHAT Checklist, Doc validation & Cost validation PIB/CN (2026-10-02)
-- Keputusan user: Finance melihat validasi Audit Courier tanpa bisa mengubah. Pola SAMA sql/035 (Sea & Air): policy
-- SELECT tambahan berbasis has_page_access('courier_finance') -- TANPA policy INSERT/UPDATE/DELETE, jadi tetap baca saja.
-- Role Finance TIDAK perlu akses halaman Audit Courier. Jalankan SETELAH sql/038 (tabel review cost).
-- Idempotent (drop policy if exists). Tabel yang tidak ada dilewati (dicatat NOTICE).
do $$
declare
  t text;
begin
  foreach t in array array[
    'tabel_audit_pib', 'tabel_audit_cn',            -- baris PIB/CN pasangan invoice (judul, kalkulasi PIB/SPPBMCP)
    'dokumen_checklist',                            -- Checklist kelengkapan dokumen
    'dokumen_validasi', 'tabel_checklist_validasi', -- Doc validation (data AI + hasil cek tersimpan)
    'tabel_npwp',                                   -- master NPWP (dipakai Doc validation)
    'tabel_cost_validasi', 'cost_validasi_review_courier' -- Cost validation + review per invoice (sql/038)
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabel % tidak ada -- dilewati', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select_courier_finance', t);
    execute format('create policy %I on public.%I for select using (public.has_page_access(%L))',
      t || '_select_courier_finance', t, 'courier_finance');
  end loop;
end $$;

-- Info (baca saja): fungsi yang dipanggil tampilan validasi. prosecdef = true -> SECURITY DEFINER (tidak butuh izin
-- tabel tambahan). Kalau get_kurs_efektif = false & kalkulasi PIB di layar Finance tidak menampilkan kurs, kabari Claude.
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_kurs_efektif', 'fn_hitung_storage');
