-- ============================================================================
-- 030b -- INSPEKSI DB Sea & Air, BAGIAN YANG TERPOTONG dari 030 (HANYA BACA) -- 2026-10-01
-- Hasil 030 kepotong batas 50.000 karakter chat. Query ini HANYA mengambil bagian yang belum
-- terbaca, versi ringkas. Jalankan SEKALI -> 1 sel JSON `hasil`.
-- Kalau hasilnya masih sangat panjang: simpan sebagai file .json / .txt lalu LAMPIRKAN (jangan
-- di-paste) supaya tidak terpotong lagi.
-- ============================================================================
with fn as (
  select p.oid, p.proname, p.prokind, p.prosecdef, p.prosrc,
    pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select jsonb_build_object(
  -- Nama fungsi/tabel/kolom yang AKAN dibuat -- HARUS kosong semua.
  '1_fungsi_baru_harus_kosong', coalesce((
    select jsonb_agg(proname || '(' || args || ')')
    from fn where proname in (
      'fn_seaair_guard_mark_audited', 'fn_seaair_recap_lock_after_submit',
      'fn_seaair_reaudit_on_recap_change', 'fn_seaair_snapshot_ai_values',
      'fn_seaair_reread_from_ai', 'fn_seaair_auto_draft_pib', 'fn_seaair_unlock_submit',
      'upsert_freight_quotation_seaair', 'fn_seaair_flag_duplicate_upload',
      'fn_seaair_recap_issue_count', 'fn_seaair_is_validated')
  ), '[]'::jsonb),
  '1b_kolom_baru_harus_kosong', coalesce((
    select jsonb_agg(table_name || '.' || column_name)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('rekapan_seaair', 'tabel_audit_seaair')
      and column_name in ('submit_locked', 'submit_unlock_reason', 'submit_unlocked_by', 'submit_unlocked_at',
        'reaudit_reason', 'reaudit_at', 'ai_snapshot', 'ai_snapshot_at', 'po_manual',
        'duplicate_of', 'duplicate_flag', 'freight_quotation')
  ), '[]'::jsonb),

  -- Nama saja (tanpa isi) -- ringkas.
  '2_fungsi_terkait', coalesce((
    select jsonb_agg(proname || '(' || args || ')' || case when prosecdef then ' [DEFINER]' else '' end order by proname)
    from fn where proname ilike any (array['%seaair%', '%sea_air%', '%rekapan%', '%quotation%',
      '%freight%', '%tarif%', '%kurs%', '%matriks%', '%checklist%', '%cost_valid%'])
  ), '[]'::jsonb),

  -- Fungsi yang ISI-nya menulis/menyentuh tabel Sea & Air (nama + tabel yang disentuh).
  '3_fungsi_menyentuh_tabel', coalesce((
    select jsonb_agg(proname || ' -> ' || concat_ws(',',
      case when prosrc ilike '%tabel_audit_seaair%' then 'audit' end,
      case when prosrc ilike '%rekapan_seaair%' then 'rekapan' end,
      case when prosrc ilike '%cost_validasi_seaair%' then 'cost' end,
      case when prosrc ilike '%dokumen_validasi_matriks_seaair%' then 'matriks' end,
      case when prosrc ilike '%dokumen_checklist_seaair%' then 'checklist' end,
      case when prosrc ilike '%tarif_kontrak_seaair%' then 'tarif' end) order by proname)
    from fn where prosrc ilike any (array['%tabel_audit_seaair%', '%rekapan_seaair%',
      '%cost_validasi_seaair%', '%dokumen_validasi_matriks_seaair%', '%dokumen_checklist_seaair%',
      '%tarif_kontrak_seaair%'])
  ), '[]'::jsonb),

  -- Isi 3 fungsi trigger yang penting saja (checklist % & audit trail rekapan/audit).
  '6_fungsi_trigger_penting', coalesce((
    select jsonb_agg(jsonb_build_object('fungsi', proname, 'definisi', pg_get_functiondef(oid)) order by proname)
    from fn where prokind = 'f' and proname in ('fn_hitung_kelengkapan_seaair', 'fn_audit_rekapan_seaair', 'fn_audit_seaair')
  ), '[]'::jsonb),

  '8_tabel_terkait', coalesce((
    select jsonb_agg(table_name || ' [' || table_type || ']' order by table_name)
    from information_schema.tables
    where table_schema = 'public' and table_name ilike any (array['%quotation%', '%freight%',
      '%seaair%', '%sea_air%', '%partial%'])
  ), '[]'::jsonb),

  -- Policy: tabel Sea & Air + policy audit_trail yang khusus Sea & Air / umum (bukan audit_po/bunker).
  '9_policy_rls', coalesce((
    select jsonb_agg(tablename || ' | ' || policyname || ' | ' || cmd || ' | using: ' || coalesce(qual, '-')
      || ' | check: ' || coalesce(with_check, '-') order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and (tablename in ('rekapan_seaair', 'tabel_audit_seaair', 'cost_validasi_seaair',
             'dokumen_validasi_matriks_seaair', 'cost_validasi_catatan_seaair', 'dokumen_checklist_seaair')
        or (tablename = 'audit_trail' and coalesce(qual, '') || coalesce(with_check, '') not ilike '%audit_po%'
            and coalesce(qual, '') || coalesce(with_check, '') not ilike '%bunker%'))
  ), '[]'::jsonb),

  -- Duplikat AWB yang SUDAH ada (indikasi upload ulang yang bikin baris baru).
  '10_awb_duplikat', jsonb_build_object(
    'rekapan_awb_dobel', (select count(*) from (select awb from public.rekapan_seaair where coalesce(awb, '') <> '' group by awb having count(*) > 1) x),
    'audit_awb_dobel', (select count(*) from (select awb from public.tabel_audit_seaair where coalesce(awb, '') <> '' group by awb having count(*) > 1) x),
    'rekapan_tanpa_seaair_id', (select count(*) from public.rekapan_seaair where seaair_id is null),
    'audit_tanpa_rekapan', (select count(*) from public.tabel_audit_seaair a where not exists (select 1 from public.rekapan_seaair r where r.seaair_id = a.id))
  )
) as hasil;
