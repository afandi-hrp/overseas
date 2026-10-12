-- 052: KPI "Freight + Duty" Invoice Recap Courier memakai rumus Grand Total BARU (sama kartu & tabel Total panel Validation)
-- ---------------------------------------------------------------------------------------------------------------
-- Keputusan user 2026-10-12. Rumus SATU sumber di frontend: src/utils/CourierTotalBreakdown.ts (`courierTotalBreakdown`);
-- fungsi ini MENIRUNYA di server supaya KPI = jumlah Grand Total kartu. Perubahan HANYA di angka `charges`
-- (credit_notes, jumlah invoice/AWB/status, not_in_audit TIDAK berubah). Signature & return type SAMA -> CREATE OR REPLACE aman.
--
--   AWB yang sudah ada invoice ber-submit_date ("frozen")  : angka lama (amt = total_amount / hasil auto-calc)
--   AWB belum dikirim (per invoice):
--     Credit Note : abs(amt)                                   (dikurangkan di Grand Total, tidak masuk charges)
--     Freight     : amt - total_duty_tax
--     Duty        : courier_adm_fee + import_export_duties_idr  kalau invoice duty terbaca
--                   (dokumen_validasi.data_validasi_raw > invoice_duty_cost > import_export_duties_idr; kosong/0 -> adm fee saja)
--                   tidak terbaca (tak ada pasangan PIB/CN, belum ada data) -> amt (angka lama)
--   Pasangan PIB/CN: kolom rekapan_courier.pib_id / cn_id (baris paling awal), cadangan: AWB ternormalisasi sama (PIB dulu).
--   >1 invoice Duty (tidak lazim): hanya yang no. invoicenya cocok dgn hasil ekstraksi yang memuat duty tax.
--
-- Fungsi baru: fn_courier_raw_json(jsonb) -- data_validasi_raw kadang tersimpan sebagai STRING JSON (frontend: JSON.parse).
-- Keduanya SECURITY INVOKER (ikut RLS user pemanggil; kalau user tak boleh baca dokumen_validasi -> rumus lama, SAMA panel).
-- Idempotent. Pre-check: nama fungsi baru tidak boleh sudah dipakai fungsi lain.

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_courier_raw_json' and p.prosrc not like '%beehive:052%'
  ) then
    raise exception 'fn_courier_raw_json sudah ada dengan isi lain -- cek pg_get_functiondef dulu, jangan ditimpa';
  end if;
end $$;

create or replace function public.fn_courier_raw_json(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
-- beehive:052
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'string' then
    begin
      return (j #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
  end if;
  return j;
end
$$;

revoke all on function public.fn_courier_raw_json(jsonb) from public, anon;
grant execute on function public.fn_courier_raw_json(jsonb) to authenticated;

create or replace function public.fn_courier_recap_summary(
  p_ppjk text default null::text,
  p_an text default null::text,
  p_from date default null::date,
  p_to date default null::date,
  p_search text default null::text,
  p_search_cols text[] default null::text[]
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cols text[] := coalesce(p_search_cols, array['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
  v_pat text := '%' || coalesce(p_search, '') || '%';
  v jsonb;
begin
  with b as (
    select r.*, coalesce(public.fn_courier_awb_norm(r.awb), 'ID:' || r.id::text) as k,
           case when coalesce(r.manual_override_fields, '[]'::jsonb) ? 'total_amount' then coalesce(r.total_amount, 0)
                else coalesce(r.courier_adm_fee, 0) + coalesce(r.total_duty_tax, 0) + coalesce(r.total_freight, 0) end as amt,
           upper(coalesce(r.invoice_type, '')) like '%CREDIT NOTE%' as is_cn,
           (upper(coalesce(r.invoice_type, '')) like '%DUTY%' and upper(coalesce(r.invoice_type, '')) not like '%CREDIT NOTE%') as is_duty,
           (p_an is null or p_an = '' or r.an = p_an)
           and (p_from is null or r.tgl_terima_email >= p_from)
           and (p_to is null or r.tgl_terima_email <= p_to)
           and (coalesce(p_search, '') = '' or (
                 ('awb' = any(v_cols) and r.awb ilike v_pat) or
                 ('no_invoice' = any(v_cols) and r.no_invoice ilike v_pat) or
                 ('vendor' = any(v_cols) and r.vendor ilike v_pat) or
                 ('po_pt_imi' = any(v_cols) and r.po_pt_imi ilike v_pat) or
                 ('ppjk' = any(v_cols) and r.ppjk ilike v_pat))) as hit
    from public.rekapan_courier r
    where p_ppjk is null or p_ppjk = '' or r.ppjk ilike '%' || p_ppjk || '%'
  ), keep as (
    select k from b group by k having bool_or(hit)
  ), f as (
    select b.* from b join keep using (k)
  ), grp as (
    select k,
           bool_or(pib_id is not null or cn_id is not null) as linked_id,
           min(public.fn_courier_awb_norm(awb)) as awb_n,
           bool_or(submit_date is not null) as frozen,
           count(*) filter (where is_duty) as n_duty
    from f group by k
  ), link_id as (
    -- pasangan lewat kolom pib_id / cn_id: baris paling awal (created_at, id) yang record Audit-nya ada; PIB menang atas CN.
    select distinct on (f.k) f.k,
           case when p.id is not null then 'PIB' else 'CN' end as t,
           coalesce(p.id::text, c.id::text) as i
    from f
    join grp g on g.k = f.k and not g.frozen and g.n_duty > 0
    left join public.tabel_audit_pib p on p.id::text = f.pib_id::text
    left join public.tabel_audit_cn c on c.id::text = f.cn_id::text
    where p.id is not null or c.id is not null
    order by f.k, f.created_at, f.id
  ), link_awb as (
    -- cadangan: AWB ternormalisasi sama (PIB dulu)
    select distinct on (g.k) g.k, a.t, a.i
    from grp g
    join (
      select 'PIB'::text as t, id::text as i, public.fn_courier_awb_norm(awb) as n, 1 as pr from public.tabel_audit_pib
      union all
      select 'CN'::text, id::text, public.fn_courier_awb_norm(awb), 2 from public.tabel_audit_cn
    ) a on a.n = g.k
    where not g.frozen and g.n_duty > 0 and g.k not like 'ID:%'
      and not exists (select 1 from link_id l where l.k = g.k)
    order by g.k, a.pr, a.i
  ), lnk as (
    select k, t, i from link_id
    union all
    select k, t, i from link_awb
  ), duty_raw as (
    select distinct on (l.k) l.k,
           x.rj -> 'invoice_duty_cost' as cost,
           x.rj -> 'invoice_duty_v' ->> 'no_invoice' as inv_no
    from lnk l
    join public.dokumen_validasi d
      on (l.t = 'PIB' and d.pib_id::text = l.i) or (l.t = 'CN' and d.cn_id::text = l.i)
    cross join lateral (select public.fn_courier_raw_json(d.data_validasi_raw) as rj) x
    where jsonb_typeof(x.rj -> 'invoice_duty_cost') = 'object'
    order by l.k
  ), dr as (
    select k,
           case jsonb_typeof(cost -> 'import_export_duties_idr')
             when 'number' then (cost ->> 'import_export_duties_idr')::numeric
             when 'string' then case when btrim(cost ->> 'import_export_duties_idr') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                     then btrim(cost ->> 'import_export_duties_idr')::numeric else 0 end
             else 0 end as duty_line,
           regexp_replace(upper(coalesce(inv_no, '')), '[^A-Z0-9]', '', 'g') as inv_n
    from duty_raw
  ), calc as (
    select f.k, f.is_cn, f.amt,
           case
             when f.is_cn then abs(f.amt)
             when g.frozen then f.amt
             when not f.is_duty then f.amt - coalesce(f.total_duty_tax, 0)
             when d.k is null then f.amt                                             -- invoice duty tidak terbaca -> angka lama
             when g.n_duty = 1 then coalesce(f.courier_adm_fee, 0) + d.duty_line
             when d.inv_n <> '' and d.inv_n = regexp_replace(upper(coalesce(f.no_invoice, '')), '[^A-Z0-9]', '', 'g')
               then coalesce(f.courier_adm_fee, 0) + d.duty_line
             when exists (select 1 from f f2 where f2.k = f.k and f2.is_duty and d.inv_n <> ''
                            and d.inv_n = regexp_replace(upper(coalesce(f2.no_invoice, '')), '[^A-Z0-9]', '', 'g'))
               then coalesce(f.courier_adm_fee, 0)                                   -- ada yang cocok, baris ini bukan itu
             else f.amt                                                              -- >1 Duty & tak ada yang cocok -> angka lama
           end as eff
    from f
    join grp g on g.k = f.k
    left join dr d on d.k = f.k
  )
  select jsonb_build_object(
    'awb', (select count(*) from grp),
    'invoices', (select count(*) from f),
    'charges', (select coalesce(sum(eff), 0) from calc where not is_cn),
    'credit_notes', (select coalesce(sum(abs(amt)), 0) from calc where is_cn),
    'not_submitted', (select count(*) from f where submit_date is null),
    'submitted_unpaid', (select count(*) from f where submit_date is not null and tgl_lunas is null),
    'paid', (select count(*) from f where tgl_lunas is not null),
    'not_in_audit', (select count(*) from grp g where not g.linked_id and not exists (
        select 1 from public.tabel_audit_pib p where g.awb_n is not null and public.fn_courier_awb_norm(p.awb) = g.awb_n
        union all
        select 1 from public.tabel_audit_cn c where g.awb_n is not null and public.fn_courier_awb_norm(c.awb) = g.awb_n))
  ) into v;
  return v;
end $function$;
