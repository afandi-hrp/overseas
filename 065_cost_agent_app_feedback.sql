-- =====================================================================
-- 065 COST AGENT – Perbaikan dari uji aplikasi 16-10-2026
--  1. Voyage report datang SETELAH invoice: invoice yang belum tertaut otomatis ditautkan ke port call voyage
--     (kapal sama; pelabuhan sama; tanggal layanan/invoice dalam rentang tiba–berangkat ±7 hari, atau no voyage sama).
--  2. Setiap baris wajib punya jenis biaya sebelum Submit for approval (baris Not mapped tidak masuk history dan
--     tidak bisa dipelajari). Pilih jenis biaya / LAIN_LAIN -> alias tersimpan -> invoice berikutnya otomatis.
--  3. "Use as reference" tidak perlu dicentang: semua baris invoice yang masih bisa diedit diset masuk history.
--  4. Keterangan invoice: placeholder {year} / {yy}; template default jadi
--     "BY. AGEN DLL DI {port} - {vessel} VOY {voyage} / {year}" (bila template belum pernah diubah).
--  5. Catatan otomatis (vendor/kapal/pelabuhan tidak ada di master, voyage belum cocok) hilang sendiri setelah
--     header dikoreksi / voyage tertaut.
--  6. Edit manual baris biaya (teks, qty, harga, jumlah): RPC fn_cost_agent_update_line. RPC app jadi 18.
-- Idempotent. Jalankan SETELAH 064.
-- =====================================================================

drop function if exists public.fn_cost_agent_build_description(text, bigint, bigint, bigint, bigint, bigint, text, text, date, date, date, text, text, text);

create or replace function public.fn_cost_agent_build_description(
  p_company text, p_vendor_id bigint, p_vessel_id bigint, p_port_id bigint, p_voyage_id bigint,
  p_voyage_call_id bigint, p_voyage_no_raw text, p_activity_raw text, p_period_start date, p_period_end date,
  p_service_date date, p_invoice_no text, p_vessel_raw text, p_port_raw text, p_invoice_date date default null)
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
  v_tpl := coalesce(v_tpl, 'BY. AGEN DLL DI {port} - {vessel} VOY {voyage} / {year}');

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
  v_out := replace(v_out, '{year}', coalesce(to_char(coalesce(p_service_date, p_invoice_date, p_period_start, v_d1), 'YYYY'), ''));
  v_out := replace(v_out, '{yy}', coalesce(to_char(coalesce(p_service_date, p_invoice_date, p_period_start, v_d1), 'YY'), ''));
  -- rapikan bagian yang kosong: "VOY  / 2026" -> "/ 2026", "VOY " di akhir, " - " / " / " menggantung, spasi ganda
  v_out := regexp_replace(v_out, '\s+(VOY|VOYAGE)\.?\s+/', ' /', 'i');
  v_out := regexp_replace(v_out, '\s+/\s*$', '');
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
      new.vessel_name_raw, new.port_name_raw, new.invoice_date);
  end if;
  -- catatan otomatis yang sudah tidak berlaku dihapus (mis. pelabuhan sudah dipilih lewat Correct header)
  if tg_op = 'UPDATE' and jsonb_typeof(new.check_notes) = 'array' and jsonb_array_length(new.check_notes) > 0 then
    new.check_notes := coalesce((
      select jsonb_agg(n order by o) from jsonb_array_elements(new.check_notes) with ordinality t(n, o)
       where not (   (n ->> 'type' = 'vendor_unknown'   and new.vendor_id is not null)
                  or (n ->> 'type' = 'vessel_unknown'   and new.vessel_id is not null)
                  or (n ->> 'type' = 'port_unknown'     and new.port_id is not null)
                  or (n ->> 'type' = 'voyage_unmatched' and new.voyage_call_id is not null)
                  or (n ->> 'type' = 'vessel_fuzzy'     and new.vessel_id is distinct from old.vessel_id))), '[]'::jsonb);
  end if;
  return new;
end $$;

create or replace function public.fn_cost_agent_submit_for_approval(p_invoice_id bigint, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.cost_agent_invoices%rowtype; v_unverified int; v_round int; v_steps int;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', p_invoice_id; end if;
  if v_inv.status not in ('verification','rejected') then
    raise exception 'Invoice berstatus % tidak bisa diajukan', v_inv.status;
  end if;
  select count(*) into v_unverified from public.cost_agent_invoice_lines
   where invoice_id = p_invoice_id and not is_verified;
  if v_unverified > 0 then raise exception 'Masih ada % baris belum diverifikasi', v_unverified; end if;
  -- setiap baris wajib punya jenis biaya, supaya masuk history & dikenali otomatis di invoice berikutnya
  select count(*) into v_unverified from public.cost_agent_invoice_lines
   where invoice_id = p_invoice_id and cost_item_id is null;
  if v_unverified > 0 then
    raise exception '% baris belum punya jenis biaya (Not mapped). Pilih jenis biaya yang sesuai (atau LAIN_LAIN) lalu Verify', v_unverified;
  end if;
  if v_inv.vessel_id is null or v_inv.port_id is null or v_inv.vendor_id is null then
    raise exception 'Vendor, kapal dan pelabuhan wajib terisi sebelum diajukan';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round from public.cost_agent_approvals where invoice_id = p_invoice_id;
  insert into public.cost_agent_approvals(invoice_id, round_no, step_no, approver_label, approver_emails, approver_role)
  select p_invoice_id, v_round, m.step_no, m.approver_label, m.approver_emails, m.approver_role
    from public.fn_cost_agent_matrix_for(v_inv.company_code, v_inv.vendor_id,
                                      coalesce(v_inv.grand_total, v_inv.lines_total, 0)) m;
  get diagnostics v_steps = row_count;
  if exists (select 1 from public.cost_agent_approvals
              where invoice_id = p_invoice_id and round_no = v_round and coalesce(cardinality(approver_emails), 0) = 0) then
    raise exception 'Approval Matrix untuk invoice ini punya step tanpa email approver. Lengkapi dulu di halaman Approval Matrix.';
  end if;
  if v_steps = 0 then raise exception 'Tidak ada approval matrix yang cocok (PT %, nilai %)',
                      v_inv.company_code, coalesce(v_inv.grand_total, v_inv.lines_total); end if;

  update public.cost_agent_invoices set submitted_by = public.fn_cost_agent_actor(p_actor), submitted_at = now()
   where id = p_invoice_id;
  perform public.fn_cost_agent_set_status(p_invoice_id, 'waiting_approval', p_actor,
                                       format('Diajukan, %s step approval', v_steps));
  return jsonb_build_object('invoice_id', p_invoice_id, 'round', v_round, 'steps', v_steps);
end $$;

-- ---------------------------------------------------------------------
-- 1. Tautkan invoice ke voyage yang datang belakangan
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_link_invoices_to_voyage(p_voyage_id bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; m record; v_vessel bigint; v_n int := 0;
begin
  select vessel_id into v_vessel from public.cost_agent_voyages where id = p_voyage_id;
  if v_vessel is null then return 0; end if;
  for r in select i.* from public.cost_agent_invoices i
            where i.vessel_id = v_vessel and i.voyage_call_id is null
              and i.status not in ('processing', 'cancelled') loop
    select * into m from public.fn_cost_agent_match_voyage_call(
      r.vessel_id, r.port_id, coalesce(r.service_date, r.period_start, r.invoice_date), r.voyage_no_raw, null);
    if m.voyage_id = p_voyage_id and m.call_id is not null then
      update public.cost_agent_invoices
         set voyage_id = m.voyage_id, voyage_call_id = m.call_id,
             port_id = coalesce(port_id, (select port_id from public.cost_agent_voyage_calls where id = m.call_id)),
             updated_at = now()
       where id = r.id;
      insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
      values (r.id, r.status, r.status, 'system', 'Voyage tertaut otomatis setelah voyage report masuk');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.fn_cost_agent_voyage_call_link_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  for v_id in select distinct voyage_id from new_calls loop
    perform public.fn_cost_agent_link_invoices_to_voyage(v_id);
  end loop;
  return null;
end $$;
drop trigger if exists cost_agent_call_link_ins on public.cost_agent_voyage_calls;
drop trigger if exists cost_agent_call_link_upd on public.cost_agent_voyage_calls;
create trigger cost_agent_call_link_ins after insert on public.cost_agent_voyage_calls
  referencing new table as new_calls for each statement execute function public.fn_cost_agent_voyage_call_link_trg();
create trigger cost_agent_call_link_upd after update on public.cost_agent_voyage_calls
  referencing new table as new_calls for each statement execute function public.fn_cost_agent_voyage_call_link_trg();

-- ---------------------------------------------------------------------
-- 6. Edit manual baris biaya
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_update_line(
  p_line_id bigint, p_description text, p_qty numeric, p_unit_price numeric, p_amount numeric,
  p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.cost_agent_invoice_lines%rowtype; v_inv public.cost_agent_invoices%rowtype;
  v_desc text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g')), '');
  v_ci record; v_changes text[] := '{}';
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_line from public.cost_agent_invoice_lines where id = p_line_id;
  if not found then raise exception 'Baris % tidak ditemukan', p_line_id; end if;
  select * into v_inv from public.cost_agent_invoices where id = v_line.invoice_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', v_line.invoice_id; end if;
  if v_inv.status not in ('verification', 'rejected') then
    raise exception 'Invoice berstatus % tidak bisa diubah', v_inv.status;
  end if;
  if v_desc is null then raise exception 'Keterangan baris wajib diisi'; end if;
  if length(v_desc) > 500 then raise exception 'Keterangan baris maksimal 500 karakter'; end if;
  if p_amount is null then raise exception 'Jumlah wajib diisi'; end if;

  if v_desc is distinct from v_line.description_raw then
    v_changes := v_changes || format('teks "%s" -> "%s"', v_line.description_raw, v_desc);
  end if;
  if p_amount is distinct from v_line.amount then
    v_changes := v_changes || format('jumlah %s -> %s', v_line.amount, p_amount);
  end if;
  if p_qty is distinct from v_line.qty or p_unit_price is distinct from v_line.unit_price then
    v_changes := v_changes || format('qty x harga %s x %s -> %s x %s', v_line.qty, v_line.unit_price, p_qty, p_unit_price);
  end if;
  if cardinality(v_changes) = 0 then return jsonb_build_object('changed', false); end if;

  update public.cost_agent_invoice_lines
     set description_raw = v_desc, qty = p_qty, unit_price = p_unit_price, amount = p_amount,
         is_verified = false, verified_by = null, verified_at = null, updated_at = now()
   where id = p_line_id;

  -- teks berubah & jenis biaya belum dipilih manual -> klasifikasi ulang
  if v_desc is distinct from v_line.description_raw and coalesce(v_line.match_method, 'none') <> 'manual' then
    select * into v_ci from public.fn_cost_agent_resolve_cost_item(v_desc, v_inv.vendor_id);
    update public.cost_agent_invoice_lines
       set cost_item_id = v_ci.cost_item_id, match_method = v_ci.method,
           gl_account = coalesce((select gl_account from public.cost_agent_cost_items where id = v_ci.cost_item_id), gl_account)
     where id = p_line_id;
  end if;

  update public.cost_agent_invoices
     set lines_total = (select sum(amount) from public.cost_agent_invoice_lines where invoice_id = v_inv.id),
         updated_at = now()
   where id = v_inv.id;
  perform public.fn_cost_agent_refresh_compare(v_inv.id);
  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (v_inv.id, v_inv.status, v_inv.status, public.fn_cost_agent_actor(p_actor),
          format('Baris #%s diedit manual: %s', v_line.line_no, array_to_string(v_changes, '; ')));
  return jsonb_build_object('changed', true, 'changes', to_jsonb(v_changes));
end $$;

-- ---------------------------------------------------------------------
-- data: template default + tahun, Use as reference = otomatis, rapikan catatan & tautkan voyage yang sudah ada
-- ---------------------------------------------------------------------
update public.cost_agent_settings
   set value = to_jsonb('BY. AGEN DLL DI {port} - {vessel} VOY {voyage} / {year}'::text), updated_at = now()
 where key = 'invoice_description_template'
   and value #>> '{}' = 'BY. AGEN DLL DI {port} - {vessel} VOY {voyage}';

update public.cost_agent_invoice_lines l set include_in_history = true
  from public.cost_agent_invoices i
 where i.id = l.invoice_id and not l.include_in_history
   and i.status in ('processing', 'verification', 'rejected', 'waiting_approval', 'failed');

-- sentuh invoice terbuka -> trigger mengisi ulang keterangan otomatis & membersihkan catatan
update public.cost_agent_invoices set updated_at = updated_at
 where status not in ('approved', 'journal', 'paid', 'cancelled');

do $$ declare r record; begin
  for r in select id from public.cost_agent_voyages loop
    perform public.fn_cost_agent_link_invoices_to_voyage(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- GRANT: allowlist resmi = 18 RPC aplikasi (+ fn_cost_agent_update_line); fungsi lain hanya service_role.
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
    'fn_cost_agent_delete_invoice', 'fn_cost_agent_set_invoice_description',
    'fn_cost_agent_update_line'];
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
