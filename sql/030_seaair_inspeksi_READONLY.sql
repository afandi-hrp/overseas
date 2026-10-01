-- ============================================================================
-- 030 -- INSPEKSI DB Sea & Air (HANYA BACA, TIDAK MENGUBAH APA PUN) -- 2026-10-01
-- Tujuan: sebelum membuat trigger/fungsi/kolom baru utk "bagian 2" (relasi Audit PIB <-> Invoice
-- Recap), pastikan nama fungsi BELUM ADA & pahami trigger/RPC/kolom/policy yang SUDAH ADA.
--
-- CARA PAKAI: jalankan SEKALI di Supabase SQL Editor -> hasilnya 1 baris, 1 kolom `hasil` (JSON).
-- Klik sel hasil -> copy semua isinya -> kirim ke Claude.
-- Isi JSON:
--   1_fungsi_baru_harus_kosong  : nama fungsi yang AKAN dibuat (harus [] / kosong)
--   2_fungsi_terkait            : fungsi public bernama terkait Sea & Air/rekapan/tarif/dll
--   3_fungsi_menyentuh_tabel    : fungsi yang isinya menyentuh tabel Sea & Air (siapa mengisi data)
--   4_trigger                   : trigger di tabel Sea & Air + definisinya
--   5_rpc_app                   : isi lengkap RPC yang dipakai aplikasi Sea & Air
--   6_fungsi_trigger            : isi lengkap fungsi yang dipanggil trigger
--   7_kolom                     : kolom tabel terkait
--   8_tabel_terkait             : tabel/view yang namanya mirip (hindari nama bentrok)
--   9_policy_rls                : policy RLS tabel terkait
--   10_rekapan_pernah_diupdate  : bukti apakah baris rekapan pernah ditimpa setelah dibuat
-- ============================================================================
with
sea_tables as (
  select unnest(array['tabel_audit_seaair', 'rekapan_seaair', 'dokumen_checklist_seaair',
    'dokumen_validasi_matriks_seaair', 'dokumen_validasi_seaair', 'cost_validasi_seaair',
    'cost_validasi_catatan_seaair']) as tname
),
fn as (
  select p.oid, p.proname, p.prokind, p.prosecdef, p.prosrc,
    pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
trg as (
  select c.relname as tabel, t.tgname as trigger_name, t.tgfoid,
    pg_get_triggerdef(t.oid) as definisi
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal and c.relname in (select tname from sea_tables)
)
select jsonb_build_object(
  '1_fungsi_baru_harus_kosong', coalesce((
    select jsonb_agg(jsonb_build_object('fungsi', proname, 'args', args))
    from fn where proname in (
      'fn_seaair_guard_mark_audited', 'fn_seaair_recap_lock_after_submit',
      'fn_seaair_reaudit_on_recap_change', 'fn_seaair_snapshot_ai_values',
      'fn_seaair_reread_from_ai', 'fn_seaair_auto_draft_pib', 'fn_seaair_unlock_submit',
      'upsert_freight_quotation_seaair')
  ), '[]'::jsonb),

  '2_fungsi_terkait', coalesce((
    select jsonb_agg(jsonb_build_object('fungsi', proname, 'args', args, 'security_definer', prosecdef) order by proname)
    from fn where proname ilike any (array['%seaair%', '%sea_air%', '%rekapan%', '%quotation%',
      '%freight%', '%tarif%', '%kurs%', '%audit%', '%matriks%', '%checklist%', '%cost_valid%'])
  ), '[]'::jsonb),

  '3_fungsi_menyentuh_tabel', coalesce((
    select jsonb_agg(jsonb_build_object(
      'fungsi', proname, 'args', args,
      'tabel_audit_seaair', prosrc ilike '%tabel_audit_seaair%',
      'rekapan_seaair', prosrc ilike '%rekapan_seaair%',
      'cost_validasi_seaair', prosrc ilike '%cost_validasi_seaair%',
      'dokumen_validasi_matriks_seaair', prosrc ilike '%dokumen_validasi_matriks_seaair%',
      'dokumen_checklist_seaair', prosrc ilike '%dokumen_checklist_seaair%',
      'tarif_kontrak_seaair', prosrc ilike '%tarif_kontrak_seaair%') order by proname)
    from fn where prosrc ilike any (array['%tabel_audit_seaair%', '%rekapan_seaair%',
      '%cost_validasi_seaair%', '%dokumen_validasi_matriks_seaair%', '%dokumen_checklist_seaair%',
      '%tarif_kontrak_seaair%'])
  ), '[]'::jsonb),

  '4_trigger', coalesce((
    select jsonb_agg(jsonb_build_object('tabel', trg.tabel, 'trigger', trg.trigger_name,
      'fungsi', fn.proname, 'definisi', trg.definisi) order by trg.tabel, trg.trigger_name)
    from trg join fn on fn.oid = trg.tgfoid
  ), '[]'::jsonb),

  '5_rpc_app', coalesce((
    select jsonb_agg(jsonb_build_object('fungsi', proname, 'args', args, 'definisi', pg_get_functiondef(oid)) order by proname)
    from fn where prokind = 'f' and proname in ('update_seaair_row', 'insert_seaair_row',
      'update_cost_validasi_manual', 'update_validasi_matriks_manual', 'update_rekapan_po_vessel')
  ), '[]'::jsonb),

  '6_fungsi_trigger', coalesce((
    select jsonb_agg(jsonb_build_object('fungsi', x.proname, 'definisi', pg_get_functiondef(x.oid)) order by x.proname)
    from (select distinct fn.oid, fn.proname from trg join fn on fn.oid = trg.tgfoid where fn.prokind = 'f') x
  ), '[]'::jsonb),

  '7_kolom', coalesce((
    select jsonb_agg(jsonb_build_object('tabel', table_name, 'kolom', column_name, 'tipe', data_type,
      'default', column_default, 'nullable', is_nullable) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name in ('rekapan_seaair', 'tabel_audit_seaair',
      'dokumen_checklist_seaair', 'cost_validasi_seaair', 'dokumen_validasi_matriks_seaair',
      'cost_validasi_catatan_seaair', 'tarif_kontrak_seaair', 'kurs_rule_vendor_seaair', 'kurs_bi_seaair')
  ), '[]'::jsonb),

  '8_tabel_terkait', coalesce((
    select jsonb_agg(jsonb_build_object('tabel', table_name, 'tipe', table_type) order by table_name)
    from information_schema.tables
    where table_schema = 'public' and table_name ilike any (array['%quotation%', '%freight%',
      '%seaair%', '%sea_air%', '%partial%'])
  ), '[]'::jsonb),

  '9_policy_rls', coalesce((
    select jsonb_agg(jsonb_build_object('tabel', tablename, 'policy', policyname, 'cmd', cmd,
      'roles', roles, 'using', qual, 'with_check', with_check) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public' and tablename in ('audit_trail', 'rekapan_seaair', 'tabel_audit_seaair',
      'cost_validasi_seaair', 'dokumen_validasi_matriks_seaair', 'cost_validasi_catatan_seaair',
      'dokumen_checklist_seaair')
  ), '[]'::jsonb),

  -- to_jsonb(r) dipakai supaya query TIDAK error walau kolom updated_at tidak ada (hasilnya null).
  '10_rekapan_pernah_diupdate', (
    select jsonb_build_object(
      'total_baris', count(*),
      'punya_kolom_updated_at', bool_or(to_jsonb(r) ? 'updated_at'),
      'pernah_diupdate_1jam_setelah_dibuat', count(*) filter (
        where (to_jsonb(r) ->> 'updated_at') is not null and (to_jsonb(r) ->> 'created_at') is not null
          and (to_jsonb(r) ->> 'updated_at')::timestamptz > (to_jsonb(r) ->> 'created_at')::timestamptz + interval '1 hour'))
    from public.rekapan_seaair r
  )
) as hasil;
