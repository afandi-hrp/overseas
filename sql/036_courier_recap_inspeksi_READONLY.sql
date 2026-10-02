-- 036 -- INSPEKSI BACA SAJA (tidak mengubah apa pun) utk rombak Invoice Recap Courier (2026-10-02).
-- Jalankan di Supabase SQL Editor, lalu kirim hasil JSON-nya (1 baris, kolom "hasil") ke Claude.
-- Tujuan:
--   (a) struktur kolom/trigger/policy/index rekapan_courier & tabel_audit_pib/cn,
--   (b) memastikan NAMA fungsi/tabel/view baru yg akan dibuat BELUM dipakai (harus kosong),
--   (c) data nyata: berapa AWB Invoice Recap yg tidak ketemu pasangannya di Audit (pertanyaan no. 4),
--       AWB dgn >1 PPJK, AWB yg punya PIB DAN CN, format AWB di audit_trail (cek Audit trail kosong),
--   (d) master vendor yg sudah ada (seaair_vendor_master) utk TOP Finance Handover Courier.
-- AWB dinormalisasi: huruf besar, buang prefix "DHL NO."/"FEDEX No."/"UPS NO." & spasi.

with
recap as (
  select id, ppjk, invoice_type,
         nullif(regexp_replace(regexp_replace(upper(coalesce(awb, '')), '^(DHL|FEDEX|UPS)\s*NO\.?\s*:?\s*', ''), '\s', '', 'g'), '') as awb_n
  from public.rekapan_courier
),
audit as (
  select 'PIB' as t, id, status,
         nullif(regexp_replace(regexp_replace(upper(coalesce(awb, '')), '^(DHL|FEDEX|UPS)\s*NO\.?\s*:?\s*', ''), '\s', '', 'g'), '') as awb_n
  from public.tabel_audit_pib
  union all
  select 'CN', id, status,
         nullif(regexp_replace(regexp_replace(upper(coalesce(awb, '')), '^(DHL|FEDEX|UPS)\s*NO\.?\s*:?\s*', ''), '\s', '', 'g'), '')
  from public.tabel_audit_cn
),
recap_awb as (select distinct awb_n from recap where awb_n is not null),
audit_awb as (select distinct awb_n from audit where awb_n is not null)
select jsonb_build_object(
  -- (a) struktur
  'kolom', (
    select jsonb_object_agg(t, cols) from (
      select table_name as t, jsonb_agg(column_name || ':' || data_type order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'public' and table_name in ('rekapan_courier', 'tabel_audit_pib', 'tabel_audit_cn', 'seaair_vendor_master')
      group by table_name
    ) x
  ),
  'trigger', (
    select jsonb_agg(c.relname || ' · ' || tg.tgname || ' -> ' || p.proname order by c.relname, tg.tgname)
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal and c.relname in ('rekapan_courier', 'tabel_audit_pib', 'tabel_audit_cn')
  ),
  'policy_rekapan_courier', (
    select jsonb_agg(policyname || ' [' || cmd || '] ' || coalesce(qual, '') || ' | ' || coalesce(with_check, ''))
    from pg_policies where schemaname = 'public' and tablename = 'rekapan_courier'
  ),
  'index_rekapan_courier', (
    select jsonb_agg(indexdef) from pg_indexes where schemaname = 'public' and tablename = 'rekapan_courier'
  ),
  'fn_normalize_awb_courier', (
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_normalize_awb_courier' limit 1
  ),
  -- (b) nama calon objek baru -- HARUS null/kosong semua
  'nama_baru_sudah_dipakai', (
    select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'fn_courier_recap_awb_page', 'fn_courier_recap_awb_count', 'fn_courier_recap_summary',
      'fn_courier_recap_submit_all', 'fn_courier_finance_accept', 'fn_courier_finance_mark_paid',
      'fn_courier_reaudit', 'fn_courier_awb_norm'
    )
  ),
  'tabel_view_baru_sudah_ada', (
    select jsonb_agg(c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('courier_vendor_master', 'v_courier_recap_awb')
  ),
  -- (c) data nyata
  'invoice_type', (
    select jsonb_object_agg(coalesce(invoice_type, '(kosong)'), n) from (
      select invoice_type, count(*) as n from public.rekapan_courier group by invoice_type
    ) x
  ),
  'ppjk', (
    select jsonb_object_agg(coalesce(ppjk, '(kosong)'), n) from (
      select ppjk, count(*) as n from public.rekapan_courier group by ppjk
    ) x
  ),
  'jumlah', jsonb_build_object(
    'recap_baris', (select count(*) from recap),
    'recap_awb_kosong', (select count(*) from recap where awb_n is null),
    'recap_awb_unik', (select count(*) from recap_awb),
    'audit_baris', (select count(*) from audit),
    'audit_awb_unik', (select count(*) from audit_awb),
    'recap_awb_tidak_ada_di_audit', (select count(*) from recap_awb r where not exists (select 1 from audit_awb a where a.awb_n = r.awb_n)),
    'audit_awb_tidak_ada_di_recap', (select count(*) from audit_awb a where not exists (select 1 from recap_awb r where r.awb_n = a.awb_n)),
    'awb_dgn_lebih_1_ppjk', (select count(*) from (select awb_n from recap where awb_n is not null group by awb_n having count(distinct ppjk) > 1) x),
    'awb_dgn_pib_dan_cn', (select count(*) from (select awb_n from audit where awb_n is not null group by awb_n having count(distinct t) > 1) x),
    'awb_dgn_lebih_1_baris_audit', (select count(*) from (select awb_n from audit where awb_n is not null group by awb_n having count(*) > 1) x),
    'recap_submit_date_terisi', (select count(*) from public.rekapan_courier where submit_date is not null),
    'recap_tgl_lunas_terisi', (select count(*) from public.rekapan_courier where tgl_lunas is not null)
  ),
  'contoh_recap_awb_tidak_ada_di_audit', (
    select jsonb_agg(x) from (
      select r.awb_n as x from recap_awb r where not exists (select 1 from audit_awb a where a.awb_n = r.awb_n) limit 10
    ) y
  ),
  'contoh_audit_awb_tidak_ada_di_recap', (
    select jsonb_agg(x) from (
      select a.awb_n as x from audit_awb a where not exists (select 1 from recap_awb r where r.awb_n = a.awb_n) limit 10
    ) y
  ),
  -- format AWB di audit_trail vs tabel asli (Audit trail Courier kosong kalau beda format)
  'contoh_awb_audit_trail_pib', (
    select jsonb_agg(awb) from (
      select awb from public.audit_trail where tabel = 'tabel_audit_pib' and awb is not null order by created_at desc limit 5
    ) y
  ),
  'contoh_awb_tabel_audit_pib', (
    select jsonb_agg(awb) from (select awb from public.tabel_audit_pib where awb is not null order by created_at desc limit 5) y
  ),
  'contoh_awb_rekapan_courier', (
    select jsonb_agg(awb) from (select awb from public.rekapan_courier where awb is not null order by created_at desc limit 5) y
  ),
  -- (d) master vendor Sea & Air (utk dibandingkan dgn kebutuhan Courier)
  'seaair_vendor_master_isi', (
    select jsonb_agg(to_jsonb(v) - 'id' - 'created_at' - 'updated_at') from (select * from public.seaair_vendor_master limit 20) v
  )
) as hasil;
