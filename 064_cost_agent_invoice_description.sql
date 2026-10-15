-- =====================================================================
-- 064 COST AGENT – Keterangan invoice (seperti kolom KETERANGAN header di Excel)
--  - cost_agent_invoices.description : keterangan invoice, mis. "BY. AGEN DLL DI BJM - MV. CEMTRANS VOY 12"
--    terisi OTOMATIS dari template, bisa diubah user (RPC fn_cost_agent_set_invoice_description).
--  - Ikut tersimpan ke history (invoice_description) saat approve -> tampil sebagai judul di history/browse.
--  - Template diatur di cost_agent_settings (bukan di kode):
--      invoice_description_template          (default, gaya Medan: BY. AGEN DLL DI {port} - {vessel} VOY {voyage})
--      invoice_description_template_<PT>     (opsional per PT, mis. _AMT gaya Jakarta)
--    Placeholder: {port} kode, {port_name}, {vessel}, {vessel_short} (kode 4 huruf), {voyage}, {activity}
--    (BONGKAR/MUAT), {dates} (tgl tiba-berangkat / periode, mis. 12-17/04/25), {invoice_no}, {vendor}
--  - Selama user belum mengubahnya, keterangan ikut berubah saat header (kapal/pelabuhan/voyage) dikoreksi.
-- Idempotent. Jalankan SETELAH 063.
-- =====================================================================

alter table public.cost_agent_invoices add column if not exists description text;
alter table public.cost_agent_invoices add column if not exists description_auto boolean not null default true;

insert into public.cost_agent_settings(key, value) values
  ('invoice_description_template', to_jsonb('BY. AGEN DLL DI {port} - {vessel} VOY {voyage}'::text))
on conflict (key) do nothing;

create or replace function public.fn_cost_agent_build_description(
  p_company text, p_vendor_id bigint, p_vessel_id bigint, p_port_id bigint, p_voyage_id bigint,
  p_voyage_call_id bigint, p_voyage_no_raw text, p_activity_raw text, p_period_start date, p_period_end date,
  p_service_date date, p_invoice_no text, p_vessel_raw text, p_port_raw text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tpl text; v_out text; v_d1 date; v_d2 date; v_dates text; v_act text;
  v_vessel text; v_short text; v_port text; v_portname text; v_voy text; v_vendor text;
begin
  select value #>> '{}' into v_tpl from public.cost_agent_settings
   where key = 'invoice_description_template_' || upper(coalesce(p_company, ''));
  if v_tpl is null then
    select value #>> '{}' into v_tpl from public.cost_agent_settings where key = 'invoice_description_template';
  end if;
  v_tpl := coalesce(v_tpl, 'BY. AGEN DLL DI {port} - {vessel} VOY {voyage}');

  select name, short_code into v_vessel, v_short from public.cost_agent_vessels where id = p_vessel_id;
  select code, name into v_port, v_portname from public.cost_agent_ports where id = p_port_id;
  select name into v_vendor from public.cost_agent_vendors where id = p_vendor_id;
  select coalesce(vy.voyage_no, p_voyage_no_raw) into v_voy from (select 1) x
    left join public.cost_agent_voyages vy on vy.id = p_voyage_id;
  select upper(coalesce(vc.activity, p_activity_raw)), coalesce(vc.arrived_at::date, p_period_start, p_service_date),
         coalesce(vc.departed_at::date, p_period_end)
    into v_act, v_d1, v_d2
    from (select 1) x left join public.cost_agent_voyage_calls vc on vc.id = p_voyage_call_id;
  v_act := case when v_act in ('BONGKAR', 'DISCHARGE', 'DISCHARGING') then 'BONGKAR'
                when v_act in ('MUAT', 'LOADING', 'LOAD') then 'MUAT' else v_act end;
  v_dates := case
    when v_d1 is null then null
    when v_d2 is null or v_d2 = v_d1 then to_char(v_d1, 'DD/MM/YY')
    when to_char(v_d1, 'MM/YY') = to_char(v_d2, 'MM/YY') then to_char(v_d1, 'DD') || '-' || to_char(v_d2, 'DD/MM/YY')
    else to_char(v_d1, 'DD/MM') || '-' || to_char(v_d2, 'DD/MM/YY') end;

  v_out := v_tpl;
  v_out := replace(v_out, '{port_name}', coalesce(upper(v_portname), upper(p_port_raw), ''));
  v_out := replace(v_out, '{port}', coalesce(v_port, upper(p_port_raw), ''));
  v_out := replace(v_out, '{vessel_short}', coalesce(v_short, ''));
  v_out := replace(v_out, '{vessel}', coalesce(v_vessel, upper(p_vessel_raw), ''));
  v_out := replace(v_out, '{voyage}', coalesce(v_voy, ''));
  v_out := replace(v_out, '{activity}', coalesce(v_act, ''));
  v_out := replace(v_out, '{dates}', coalesce(v_dates, ''));
  v_out := replace(v_out, '{invoice_no}', coalesce(p_invoice_no, ''));
  v_out := replace(v_out, '{vendor}', coalesce(v_vendor, ''));
  -- rapikan bagian yang kosong: "VOY " di akhir, " - " menggantung, spasi ganda
  v_out := regexp_replace(v_out, '\s+(VOY|VOYAGE|DI)\.?\s*$', '', 'i');
  v_out := regexp_replace(v_out, '\s+-\s*$', '');
  v_out := regexp_replace(v_out, '^\s*-\s+', '');
  v_out := regexp_replace(v_out, '\s+-\s+-\s+', ' - ', 'g');
  v_out := btrim(regexp_replace(v_out, '\s{2,}', ' ', 'g'));
  return nullif(v_out, '');
end $$;

create or replace function public.fn_cost_agent_invoice_desc_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.description_auto and new.status not in ('approved', 'journal', 'paid', 'cancelled') then
    new.description := public.fn_cost_agent_build_description(
      new.company_code, new.vendor_id, new.vessel_id, new.port_id, new.voyage_id, new.voyage_call_id,
      new.voyage_no_raw, new.activity_raw, new.period_start, new.period_end, new.service_date, new.invoice_no,
      new.vessel_name_raw, new.port_name_raw);
  end if;
  return new;
end $$;
drop trigger if exists cost_agent_invoice_desc on public.cost_agent_invoices;
create trigger cost_agent_invoice_desc before insert or update on public.cost_agent_invoices
  for each row execute function public.fn_cost_agent_invoice_desc_trg();

-- App: ubah keterangan invoice. Kosong -> kembali otomatis dari template.
create or replace function public.fn_cost_agent_set_invoice_description(
  p_invoice_id bigint, p_description text, p_actor text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.cost_agent_invoices%rowtype; v_desc text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g')), '');
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', p_invoice_id; end if;
  if v_inv.status not in ('verification', 'rejected', 'failed') then
    raise exception 'Invoice berstatus % tidak bisa diubah', v_inv.status;
  end if;
  if length(v_desc) > 300 then raise exception 'Keterangan maksimal 300 karakter'; end if;
  update public.cost_agent_invoices
     set description = upper(v_desc), description_auto = (v_desc is null), updated_at = now()
   where id = p_invoice_id
  returning description into v_desc;
  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, v_inv.status, v_inv.status, public.fn_cost_agent_actor(p_actor),
          'Keterangan invoice: ' || coalesce(v_desc, '-'));
  return v_desc;
end $$;

-- history dari app: judul = keterangan invoice (bila ada), selain itu seperti sebelumnya
create or replace function public.fn_cost_agent_hist_tokens_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.line_tokens := public.fn_cost_agent_line_tokens(new.description_raw);
  if new.invoice_description is null and new.source_invoice_id is not null then
    select coalesce(i.description,
                    nullif(concat_ws(' - ', i.invoice_no, i.vessel_name_raw, i.port_name_raw, i.activity_raw), ''))
      into new.invoice_description
      from public.cost_agent_invoices i where i.id = new.source_invoice_id;
  end if;
  return new;
end $$;

-- isi keterangan untuk invoice yang sudah ada
update public.cost_agent_invoices set description_auto = description_auto
 where description is null and status not in ('approved', 'journal', 'paid', 'cancelled');
update public.cost_agent_invoices i
   set description = public.fn_cost_agent_build_description(
         i.company_code, i.vendor_id, i.vessel_id, i.port_id, i.voyage_id, i.voyage_call_id, i.voyage_no_raw,
         i.activity_raw, i.period_start, i.period_end, i.service_date, i.invoice_no, i.vessel_name_raw, i.port_name_raw)
 where i.description is null and i.status in ('approved', 'journal', 'paid');
update public.cost_agent_cost_history h
   set invoice_description = i.description
  from public.cost_agent_invoices i
 where h.source = 'app' and h.source_invoice_id = i.id and i.description is not null
   and h.invoice_description is distinct from i.description;

-- ---------------------------------------------------------------------
-- GRANT: allowlist resmi = 17 RPC aplikasi (+ fn_cost_agent_set_invoice_description); fungsi lain hanya service_role.
-- SQL Cost Agent berikutnya akan memakai daftar ini.
-- ---------------------------------------------------------------------
do $$
declare
  f record;
  app_rpc text[] := array[
    'fn_cost_agent_get_voyage', 'fn_cost_agent_save_voyage', 'fn_cost_agent_upsert_voyages',
    'fn_cost_agent_get_invoice_history', 'fn_cost_agent_update_invoice_header', 'fn_cost_agent_verify_line',
    'fn_cost_agent_add_cost_item', 'fn_cost_agent_submit_for_approval', 'fn_cost_agent_decide_approval',
    'fn_cost_agent_matrix_for', 'fn_cost_agent_create_payment_request', 'fn_cost_agent_mark_paid',
    'fn_cost_agent_search_history', 'fn_cost_agent_set_line_reference', 'fn_cost_agent_add_vendor',
    'fn_cost_agent_delete_invoice', 'fn_cost_agent_set_invoice_description'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'fn\_cost\_agent\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname = any (app_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
