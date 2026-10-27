-- =====================================================================
-- 079_cost_agent_hub_office_dashboard.sql
-- Halaman gabungan "Cost Agent" (hub): Dashboard | History | Approval Matrix | Vessels | Cost Items | Vendors | Ports | Companies.
-- Hak akses tetap key 'cost_agent_approval_matrix' (baca = akses halaman, ubah = hak edit).
--
--  1. OFFICE (kepemilikan kapal): kolom cost_agent_vessels.office = MEDAN | JAKARTA (kosong = belum diisi).
--     Approval Matrix punya kolom office juga (kosong = berlaku untuk semua office). fn_cost_agent_matrix_for dan
--     fn_cost_agent_submit_for_approval memakai office kapal invoice. Aturan khusus office menang atas aturan umum
--     (urutan: vendor > office > PT). Bila ada aturan khusus office yang aktif tetapi office kapal belum diisi, pengajuan ditolak.
--     list/save_vessel diperluas (office, filter, saran office dari sumber voyage); set_vessels_office = ubah massal.
--  2. Vendors / Ports / Companies: list, simpan, gabung (merge), hapus bila belum dipakai, verifikasi pelabuhan massal.
--  3. Dashboard (fn_cost_agent_dashboard) dan browser History (browse_history, set_history_active).
--
-- Prasyarat: 054-077 (078 = Voyage, tidak terkait). Aman dijalankan ulang. 15 RPC app baru (allowlist 33 -> 48) + matrix_for berparameter office.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OFFICE
-- ---------------------------------------------------------------------
alter table public.cost_agent_vessels add column if not exists office text;
do $$ begin
  alter table public.cost_agent_vessels add constraint cost_agent_vessels_office_chk check (office is null or office in ('MEDAN', 'JAKARTA'));
exception when duplicate_object then null; end $$;
create index if not exists cost_agent_vessels_office_idx on public.cost_agent_vessels(office);

alter table public.cost_agent_approval_matrix add column if not exists office text;
do $$ begin
  alter table public.cost_agent_approval_matrix add constraint cost_agent_matrix_office_chk check (office is null or office in ('MEDAN', 'JAKARTA'));
exception when duplicate_object then null; end $$;

drop function if exists public.fn_cost_agent_matrix_for(text, bigint, numeric);
create or replace function public.fn_cost_agent_matrix_for(p_company text, p_vendor_id bigint, p_amount numeric, p_office text default null)
returns table(step_no int, approver_label text, approver_emails text[], approver_role text)
language sql
stable
set search_path = ''
as $$
  -- aturan paling spesifik menang per step: vendor > office > PT > umum
  select distinct on (m.step_no) m.step_no, m.approver_label, m.approver_emails, m.approver_role
    from public.cost_agent_approval_matrix m
   where m.is_active
     and (m.company_code is null or m.company_code = p_company)
     and (m.vendor_id is null or m.vendor_id = p_vendor_id)
     and (m.office is null or m.office = upper(nullif(btrim(p_office), '')))
     and p_amount >= m.min_amount and (m.max_amount is null or p_amount <= m.max_amount)
   order by m.step_no, (m.vendor_id is not null) desc, (m.office is not null) desc, (m.company_code is not null) desc, m.id;
$$;

create or replace function public.fn_cost_agent_submit_for_approval(p_invoice_id bigint, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.cost_agent_invoices%rowtype; v_unverified int; v_round int; v_steps int; v_office text;
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

  -- office kapal (Medan / Jakarta) menentukan jalur approval bila Approval Matrix punya aturan khusus office
  select office into v_office from public.cost_agent_vessels where id = v_inv.vessel_id;
  if v_office is null and exists (select 1 from public.cost_agent_approval_matrix where is_active and office is not null) then
    raise exception 'The office (Medan / Jakarta) of this vessel is not set. Set it in Cost Agent > Vessels, then submit again.';
  end if;

  select coalesce(max(round_no), 0) + 1 into v_round from public.cost_agent_approvals where invoice_id = p_invoice_id;
  insert into public.cost_agent_approvals(invoice_id, round_no, step_no, approver_label, approver_emails, approver_role)
  select p_invoice_id, v_round, m.step_no, m.approver_label, m.approver_emails, m.approver_role
    from public.fn_cost_agent_matrix_for(v_inv.company_code, v_inv.vendor_id,
                                      coalesce(v_inv.grand_total, v_inv.lines_total, 0), v_office) m;
  get diagnostics v_steps = row_count;
  if exists (select 1 from public.cost_agent_approvals
              where invoice_id = p_invoice_id and round_no = v_round and coalesce(cardinality(approver_emails), 0) = 0) then
    raise exception 'Approval Matrix untuk invoice ini punya step tanpa email approver. Lengkapi dulu di halaman Approval Matrix.';
  end if;
  if v_steps = 0 then raise exception 'Tidak ada approval matrix yang cocok (PT %, office %, nilai %)',
                      v_inv.company_code, coalesce(v_office, '-'), coalesce(v_inv.grand_total, v_inv.lines_total); end if;

  update public.cost_agent_invoices set submitted_by = public.fn_cost_agent_actor(p_actor), submitted_at = now()
   where id = p_invoice_id;
  perform public.fn_cost_agent_set_status(p_invoice_id, 'waiting_approval', p_actor,
                                       format('Diajukan, %s step approval%s', v_steps, coalesce(' (office ' || v_office || ')', '')));
  return jsonb_build_object('invoice_id', p_invoice_id, 'round', v_round, 'steps', v_steps, 'office', v_office);
end $$;

-- ubah office banyak kapal sekaligus (pilih beberapa baris di tab Vessels)
create or replace function public.fn_cost_agent_set_vessels_office(p_ids bigint[], p_office text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_off text := upper(nullif(btrim(p_office), '')); n int;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if v_off is not null and v_off not in ('MEDAN', 'JAKARTA') then raise exception 'Office must be Medan or Jakarta'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Select at least one vessel'; end if;
  if cardinality(p_ids) > 500 then raise exception 'Too many vessels at once (max 500)'; end if;
  update public.cost_agent_vessels set office = v_off, updated_at = now() where id = any (p_ids) and office is distinct from v_off;
  get diagnostics n = row_count;
  perform public.fn_cost_agent_log_master('vessel', null, 'update', format('Office set to %s for %s vessels', coalesce(v_off, '(empty)'), n),
                                          null, jsonb_build_object('office', v_off, 'vessel_ids', to_jsonb(p_ids)));
  return jsonb_build_object('updated', n, 'office', v_off);
end $$;

-- ---------------------------------------------------------------------
-- Pembantu: hitung rujukan & pindahkan semua FK satu kolom ke tabel master (bigint)
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_ref_counts(p_table text, p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare f record; n bigint; v_out jsonb := '{}'::jsonb;
begin
  for f in select c.conrelid::regclass::text as tbl, a.attname::text as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.confrelid = p_table::regclass and c.contype = 'f' and array_length(c.conkey, 1) = 1 loop
    execute format('select count(*) from %s where %I = $1', f.tbl, f.col) into n using p_id;
    if n > 0 then v_out := v_out || jsonb_build_object(f.tbl || '.' || f.col, n); end if;
  end loop;
  return v_out;
end $$;

create or replace function public.fn_cost_agent_repoint(p_table text, p_keep bigint, p_remove bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare f record; n bigint; v_moved jsonb := '{}'::jsonb;
begin
  for f in select c.conrelid::regclass::text as tbl, a.attname::text as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.confrelid = p_table::regclass and c.contype = 'f' and array_length(c.conkey, 1) = 1 loop
    begin
      execute format('update %s set %I = $1 where %I = $2', f.tbl, f.col, f.col) using p_keep, p_remove;
      get diagnostics n = row_count;
      if n > 0 then v_moved := v_moved || jsonb_build_object(f.tbl, n); end if;
    exception when unique_violation then
      raise exception 'Cannot merge: both records have overlapping rows in % (for example the same voyage or alias). Resolve those first.', f.tbl
        using errcode = '23505';
    end;
  end loop;
  return v_moved;
end $$;

create or replace function public.fn_cost_agent_clean_npwp(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v_d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if btrim(coalesce(p, '')) = '' then return null; end if;
  if length(v_d) not in (15, 16) then raise exception 'NPWP must have 15 or 16 digits'; end if;
  return btrim(p);
end $$;

-- =====================================================================
-- 2a. VENDORS
-- =====================================================================
create or replace function public.fn_cost_agent_list_vendors(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f      jsonb := coalesce(p_filter, '{}'::jsonb);
  v_q    text := nullif(btrim(f ->> 'q'), '');
  v_qk   text := public.fn_cost_agent_vendor_key(f ->> 'q');
  v_qd   text := nullif(regexp_replace(coalesce(f ->> 'q', ''), '\D', '', 'g'), '');
  v_act  boolean := nullif(f ->> 'active', '')::boolean;
  v_miss text := nullif(lower(btrim(f ->> 'missing')), '');
  v_lim  int := least(greatest(coalesce(nullif(f ->> 'limit', '')::int, 100), 1), 500);
  v_off  int := greatest(coalesce(nullif(f ->> 'offset', '')::int, 0), 0);
  v_total bigint; v_rows jsonb;
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  with fl as materialized (
    select v.id from public.cost_agent_vendors v
     where (v_q is null or v.name ilike '%' || v_q || '%'
            or (v_qk is not null and (v.name_key like '%' || v_qk || '%' or v_qk = any (v.aliases)))
            or (v_qd is not null and length(v_qd) >= 6 and regexp_replace(coalesce(v.npwp, ''), '\D', '', 'g') like '%' || v_qd || '%'))
       and (v_act is null or v.is_active = v_act)
       and (v_miss is null or (v_miss = 'npwp' and nullif(btrim(v.npwp), '') is null))),
  pg as (select v.* from public.cost_agent_vendors v join fl on fl.id = v.id order by v.name limit v_lim offset v_off)
  select (select count(*) from fl),
         coalesce((select jsonb_agg(to_jsonb(pg) || jsonb_build_object(
             'invoices_count', (select count(*) from public.cost_agent_invoices i where i.vendor_id = pg.id),
             'history_count',  (select count(*) from public.cost_agent_cost_history h where h.vendor_id = pg.id),
             'rules_count',    (select count(*) from public.cost_agent_approval_matrix m where m.vendor_id = pg.id),
             'alias_count',    (select count(*) from public.cost_agent_cost_item_aliases a where a.vendor_id = pg.id),
             'missing', to_jsonb(array_remove(array[case when nullif(btrim(pg.npwp), '') is null then 'npwp' end], null))) order by pg.name) from pg), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.fn_cost_agent_save_vendor(p_id bigint, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cost_agent_vendors%rowtype; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_name text; v_key text; v_npwp text; v_alias text[]; v_act boolean; c record; v_row public.cost_agent_vendors%rowtype;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_id is not null then
    select * into o from public.cost_agent_vendors where id = p_id for update;
    if not found then raise exception 'Vendor not found'; end if;
  end if;
  v_name := case when d ? 'name' then nullif(upper(regexp_replace(btrim(d ->> 'name'), '\s+', ' ', 'g')), '') else o.name end;
  if v_name is null then raise exception 'Vendor name is required'; end if;
  v_key := public.fn_cost_agent_vendor_key(v_name);
  if v_key is null then raise exception 'Vendor name is not valid'; end if;
  v_npwp := case when d ? 'npwp' then public.fn_cost_agent_clean_npwp(d ->> 'npwp') else o.npwp end;
  v_act := case when d ? 'is_active' then (d ->> 'is_active')::boolean else coalesce(o.is_active, true) end;
  v_alias := case when d ? 'aliases' then
                    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'aliases') = 'array' then d -> 'aliases' else '[]'::jsonb end)), '{}')
                  else o.aliases end;
  v_alias := coalesce((select array_agg(distinct k order by k) from (select public.fn_cost_agent_vendor_key(a) as k from unnest(coalesce(v_alias, '{}')) a) s
                        where k is not null and k <> v_key), '{}');
  select v.id, v.name into c from public.cost_agent_vendors v
   where v.id is distinct from p_id
     and (v.name_key = v_key or v_key = any (v.aliases) or v.name_key = any (v_alias) or v.aliases && v_alias
          or (v_npwp is not null and v.npwp is not null and ltrim(regexp_replace(v.npwp, '\D', '', 'g'), '0') = ltrim(regexp_replace(v_npwp, '\D', '', 'g'), '0')))
   limit 1;
  if found then
    raise exception 'Vendor "%" (id %) already uses this name, alias or NPWP. Use Merge to combine duplicate vendors.', c.name, c.id using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.cost_agent_vendors(name, name_key, npwp, aliases, is_active) values (v_name, v_key, v_npwp, v_alias, v_act) returning * into v_row;
    perform public.fn_cost_agent_log_master('vendor', v_row.id, 'create', 'Vendor created: ' || v_row.name, null, to_jsonb(v_row));
  else
    update public.cost_agent_vendors set name = v_name, name_key = v_key, npwp = v_npwp, aliases = v_alias, is_active = v_act, updated_at = now()
     where id = p_id returning * into v_row;
    if to_jsonb(v_row) - 'updated_at' is distinct from to_jsonb(o) - 'updated_at' then
      perform public.fn_cost_agent_log_master('vendor', v_row.id, 'update', 'Vendor updated: ' || v_row.name, to_jsonb(o), to_jsonb(v_row));
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.fn_cost_agent_merge_vendors(p_keep bigint, p_remove bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare k public.cost_agent_vendors%rowtype; r public.cost_agent_vendors%rowtype; v_moved jsonb; v_inv bigint; v_n int := 0; v_dropped int;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'Choose two different vendors'; end if;
  select * into k from public.cost_agent_vendors where id = p_keep for update;
  if not found then raise exception 'Vendor to keep not found'; end if;
  select * into r from public.cost_agent_vendors where id = p_remove for update;
  if not found then raise exception 'Vendor to merge not found'; end if;
  -- alias hasil belajar yang sama persis di kedua vendor: yang milik vendor lama dibuang
  delete from public.cost_agent_cost_item_aliases a
   where a.vendor_id = p_remove and exists (select 1 from public.cost_agent_cost_item_aliases b where b.vendor_id = p_keep and b.alias_norm = a.alias_norm);
  get diagnostics v_dropped = row_count;
  v_moved := public.fn_cost_agent_repoint('public.cost_agent_vendors', p_keep, p_remove);
  update public.cost_agent_vendors set
    aliases = coalesce((select array_agg(distinct a order by a) from unnest(k.aliases || r.aliases || array[r.name_key]) a where a is not null and a <> k.name_key), '{}'),
    npwp = coalesce(nullif(btrim(k.npwp), ''), r.npwp), updated_at = now()
   where id = p_keep;
  delete from public.cost_agent_vendors where id = p_remove;
  for v_inv in select id from public.cost_agent_invoices where vendor_id = p_keep and status in ('verification', 'rejected') loop
    perform public.fn_cost_agent_refresh_compare(v_inv); v_n := v_n + 1;
  end loop;
  perform public.fn_cost_agent_log_master('vendor', p_keep, 'merge', format('Vendor "%s" merged into "%s"', r.name, k.name), to_jsonb(r),
                                          jsonb_build_object('keep_id', p_keep, 'moved', v_moved, 'duplicate_aliases_dropped', v_dropped));
  return jsonb_build_object('kept_id', p_keep, 'removed_id', p_remove, 'moved', v_moved, 'invoices_recompared', v_n);
end $$;

create or replace function public.fn_cost_agent_delete_vendor(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.cost_agent_vendors%rowtype; v_refs jsonb;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  select * into v from public.cost_agent_vendors where id = p_id for update;
  if not found then raise exception 'Vendor not found'; end if;
  v_refs := public.fn_cost_agent_ref_counts('public.cost_agent_vendors', p_id);
  if v_refs <> '{}'::jsonb then
    raise exception 'Vendor "%" is already used (%). Deactivate it or merge it into another vendor instead.', v.name, v_refs::text using errcode = '23503';
  end if;
  delete from public.cost_agent_vendors where id = p_id;
  perform public.fn_cost_agent_log_master('vendor', p_id, 'delete', 'Vendor deleted: ' || v.name, to_jsonb(v), null);
  return jsonb_build_object('deleted_id', p_id);
end $$;

-- =====================================================================
-- 2b. PORTS
-- =====================================================================
create or replace function public.fn_cost_agent_list_ports(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f     jsonb := coalesce(p_filter, '{}'::jsonb);
  v_q   text := nullif(btrim(f ->> 'q'), '');
  v_qn  text := public.fn_cost_agent_norm(f ->> 'q');
  v_ver boolean := nullif(f ->> 'verified', '')::boolean;
  v_prov text := nullif(btrim(f ->> 'province'), '');
  v_src text := nullif(btrim(f ->> 'source'), '');
  v_lim int := least(greatest(coalesce(nullif(f ->> 'limit', '')::int, 100), 1), 500);
  v_off int := greatest(coalesce(nullif(f ->> 'offset', '')::int, 0), 0);
  v_total bigint; v_rows jsonb;
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  with fl as materialized (
    select p.id from public.cost_agent_ports p
     where (v_q is null or upper(p.code) = upper(v_q) or p.name ilike '%' || v_q || '%'
            or (v_qn is not null and (public.fn_cost_agent_norm(p.name) like '%' || v_qn || '%' or v_qn = any (p.aliases))))
       and (v_ver is null or p.is_verified = v_ver)
       and (v_prov is null or p.province ilike v_prov)
       and (v_src is null or p.source = v_src)),
  pg as (select p.* from public.cost_agent_ports p join fl on fl.id = p.id order by p.name limit v_lim offset v_off)
  select (select count(*) from fl),
         coalesce((select jsonb_agg(to_jsonb(pg) || jsonb_build_object(
             'invoices_count', (select count(*) from public.cost_agent_invoices i where i.port_id = pg.id),
             'history_count',  (select count(*) from public.cost_agent_cost_history h where h.port_id = pg.id),
             'calls_count',    (select count(*) from public.cost_agent_voyage_calls c where c.port_id = pg.id)) order by pg.name) from pg), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows,
    'provinces', (select coalesce(jsonb_agg(distinct province order by province), '[]'::jsonb) from public.cost_agent_ports where province is not null),
    'sources',   (select coalesce(jsonb_agg(distinct source order by source), '[]'::jsonb) from public.cost_agent_ports where source is not null));
end $$;

create or replace function public.fn_cost_agent_save_port(p_id bigint, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cost_agent_ports%rowtype; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_code text; v_name text; v_alias text[]; v_prov text; v_lat double precision; v_lon double precision; v_tz text; v_ver boolean; v_notes text; v_src text;
  v_nk text; c record; v_row public.cost_agent_ports%rowtype;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_id is not null then
    select * into o from public.cost_agent_ports where id = p_id for update;
    if not found then raise exception 'Port not found'; end if;
    if d ? 'code' and upper(btrim(d ->> 'code')) is distinct from o.code then raise exception 'The code of a port cannot be changed'; end if;
    v_code := o.code;
  else
    v_code := upper(btrim(coalesce(d ->> 'code', '')));
    if v_code !~ '^[A-Z0-9]{2,10}$' then raise exception 'Port code must be 2-10 letters or digits (use the Accurate abbreviation)'; end if;
    if exists (select 1 from public.cost_agent_ports where code = v_code) then raise exception 'Port code % already exists', v_code using errcode = '23505'; end if;
  end if;
  v_name := case when d ? 'name' then nullif(upper(regexp_replace(btrim(d ->> 'name'), '\s+', ' ', 'g')), '') else o.name end;
  if v_name is null then raise exception 'Port name is required'; end if;
  v_nk := public.fn_cost_agent_norm(v_name);
  v_prov := case when d ? 'province' then nullif(btrim(d ->> 'province'), '') else o.province end;
  v_lat := case when d ? 'lat' then nullif(btrim(d ->> 'lat'), '')::double precision else o.lat end;
  v_lon := case when d ? 'lon' then nullif(btrim(d ->> 'lon'), '')::double precision else o.lon end;
  if v_lat is not null and (v_lat < -15 or v_lat > 10) then raise exception 'Latitude is outside Indonesia (-15 to 10)'; end if;
  if v_lon is not null and (v_lon < 90 or v_lon > 145) then raise exception 'Longitude is outside Indonesia (90 to 145)'; end if;
  v_tz := case when d ? 'tz' then coalesce(nullif(btrim(d ->> 'tz'), ''), 'Asia/Jakarta') else coalesce(o.tz, 'Asia/Jakarta') end;
  if v_tz not in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura') then raise exception 'Time zone must be Asia/Jakarta (WIB), Asia/Makassar (WITA) or Asia/Jayapura (WIT)'; end if;
  v_ver := case when d ? 'is_verified' then (d ->> 'is_verified')::boolean else coalesce(o.is_verified, false) end;
  v_notes := case when d ? 'notes' then nullif(btrim(d ->> 'notes'), '') else o.notes end;
  v_src := case when p_id is null then coalesce(nullif(btrim(d ->> 'source'), ''), 'TAMBAHAN') else o.source end;
  v_alias := case when d ? 'aliases' then
                    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'aliases') = 'array' then d -> 'aliases' else '[]'::jsonb end)), '{}')
                  else o.aliases end;
  v_alias := coalesce((select array_agg(distinct k order by k) from (select public.fn_cost_agent_norm(a) as k from unnest(coalesce(v_alias, '{}')) a) s
                        where k is not null and k <> v_nk), '{}');
  select pp.id, pp.name into c from public.cost_agent_ports pp
   where pp.id is distinct from p_id
     and (public.fn_cost_agent_norm(pp.name) = v_nk or v_nk = any (pp.aliases) or public.fn_cost_agent_norm(pp.name) = any (v_alias) or pp.aliases && v_alias)
   limit 1;
  if found then
    raise exception 'Port "%" (id %) already uses this name or alias. Use Merge to combine duplicate ports.', c.name, c.id using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.cost_agent_ports(code, name, aliases, province, lat, lon, tz, is_verified, source, notes)
    values (v_code, v_name, v_alias, v_prov, v_lat, v_lon, v_tz, v_ver, v_src, v_notes) returning * into v_row;
    perform public.fn_cost_agent_log_master('port', v_row.id, 'create', 'Port created: ' || v_row.code || ' ' || v_row.name, null, to_jsonb(v_row));
  else
    update public.cost_agent_ports set name = v_name, aliases = v_alias, province = v_prov, lat = v_lat, lon = v_lon, tz = v_tz,
           is_verified = v_ver, notes = v_notes, updated_at = now()
     where id = p_id returning * into v_row;
    if to_jsonb(v_row) - 'updated_at' is distinct from to_jsonb(o) - 'updated_at' then
      perform public.fn_cost_agent_log_master('port', v_row.id, 'update', 'Port updated: ' || v_row.code, to_jsonb(o), to_jsonb(v_row));
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.fn_cost_agent_set_ports_verified(p_ids bigint[], p_verified boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Select at least one port'; end if;
  if cardinality(p_ids) > 500 then raise exception 'Too many ports at once (max 500)'; end if;
  update public.cost_agent_ports set is_verified = coalesce(p_verified, true), updated_at = now()
   where id = any (p_ids) and is_verified is distinct from coalesce(p_verified, true);
  get diagnostics n = row_count;
  perform public.fn_cost_agent_log_master('port', null, 'update', format('%s ports marked %s', n, case when coalesce(p_verified, true) then 'verified' else 'unverified' end),
                                          null, jsonb_build_object('port_ids', to_jsonb(p_ids), 'verified', coalesce(p_verified, true)));
  return jsonb_build_object('updated', n);
end $$;

create or replace function public.fn_cost_agent_merge_ports(p_keep bigint, p_remove bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare k public.cost_agent_ports%rowtype; r public.cost_agent_ports%rowtype; v_moved jsonb; v_inv bigint; v_n int := 0;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'Choose two different ports'; end if;
  select * into k from public.cost_agent_ports where id = p_keep for update;
  if not found then raise exception 'Port to keep not found'; end if;
  select * into r from public.cost_agent_ports where id = p_remove for update;
  if not found then raise exception 'Port to merge not found'; end if;
  v_moved := public.fn_cost_agent_repoint('public.cost_agent_ports', p_keep, p_remove);
  update public.cost_agent_ports set
    aliases = coalesce((select array_agg(distinct a order by a) from unnest(k.aliases || r.aliases || array[public.fn_cost_agent_norm(r.name)]) a
                         where a is not null and a <> public.fn_cost_agent_norm(k.name)), '{}'),
    province = coalesce(k.province, r.province), lat = coalesce(k.lat, r.lat), lon = coalesce(k.lon, r.lon), updated_at = now()
   where id = p_keep;
  delete from public.cost_agent_ports where id = p_remove;
  for v_inv in select id from public.cost_agent_invoices where port_id = p_keep and status in ('verification', 'rejected') loop
    perform public.fn_cost_agent_refresh_compare(v_inv); v_n := v_n + 1;
  end loop;
  perform public.fn_cost_agent_log_master('port', p_keep, 'merge', format('Port "%s" merged into "%s"', r.code || ' ' || r.name, k.code || ' ' || k.name),
                                          to_jsonb(r), jsonb_build_object('keep_id', p_keep, 'moved', v_moved));
  return jsonb_build_object('kept_id', p_keep, 'removed_id', p_remove, 'moved', v_moved, 'invoices_recompared', v_n);
end $$;

create or replace function public.fn_cost_agent_delete_port(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.cost_agent_ports%rowtype; v_refs jsonb;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  select * into v from public.cost_agent_ports where id = p_id for update;
  if not found then raise exception 'Port not found'; end if;
  v_refs := public.fn_cost_agent_ref_counts('public.cost_agent_ports', p_id);
  if v_refs <> '{}'::jsonb then
    raise exception 'Port "%" is already used (%). Merge it into another port instead.', v.code || ' ' || v.name, v_refs::text using errcode = '23503';
  end if;
  delete from public.cost_agent_ports where id = p_id;
  perform public.fn_cost_agent_log_master('port', p_id, 'delete', 'Port deleted: ' || v.code, to_jsonb(v), null);
  return jsonb_build_object('deleted_id', p_id);
end $$;

-- =====================================================================
-- 2c. COMPANIES (PT)
-- =====================================================================
create or replace function public.fn_cost_agent_list_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  return jsonb_build_object('rows', (
    select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
             'vessels_count',  (select count(*) from public.cost_agent_vessels v where v.company_code = c.code),
             'invoices_count', (select count(*) from public.cost_agent_invoices i where i.company_code = c.code),
             'rules_count',    (select count(*) from public.cost_agent_approval_matrix m where m.company_code = c.code),
             'missing', to_jsonb(array_remove(array[case when nullif(btrim(c.npwp), '') is null then 'npwp' end,
                                                    case when nullif(btrim(c.name), '') is null or c.name = c.code then 'name' end], null))) order by c.code), '[]'::jsonb)
      from public.cost_agent_companies c));
end $$;

create or replace function public.fn_cost_agent_save_company(p_code text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cost_agent_companies%rowtype; d jsonb := coalesce(p_data, '{}'::jsonb); v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text; v_npwp text; v_act boolean; v_row public.cost_agent_companies%rowtype; v_new boolean;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if v_code !~ '^[A-Z0-9]{2,6}$' then raise exception 'Company code must be 2-6 letters or digits'; end if;
  select * into o from public.cost_agent_companies where code = v_code for update;
  v_new := not found;
  v_name := case when d ? 'name' then nullif(btrim(d ->> 'name'), '') else o.name end;
  if v_name is null then raise exception 'Company name is required'; end if;
  v_npwp := case when d ? 'npwp' then public.fn_cost_agent_clean_npwp(d ->> 'npwp') else o.npwp end;
  v_act := case when d ? 'is_active' then (d ->> 'is_active')::boolean else coalesce(o.is_active, true) end;
  if v_new then
    insert into public.cost_agent_companies(code, name, npwp, is_active) values (v_code, v_name, v_npwp, v_act) returning * into v_row;
    perform public.fn_cost_agent_log_master('company', null, 'create', 'Company created: ' || v_code, null, to_jsonb(v_row));
  else
    update public.cost_agent_companies set name = v_name, npwp = v_npwp, is_active = v_act where code = v_code returning * into v_row;
    if to_jsonb(v_row) is distinct from to_jsonb(o) then
      perform public.fn_cost_agent_log_master('company', null, 'update', 'Company updated: ' || v_code, to_jsonb(o), to_jsonb(v_row));
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

-- ---------------------------------------------------------------------
-- 1b. Kapal: list/save diperluas dengan office (kolom lama tidak berubah)
-- ---------------------------------------------------------------------
create or replace function public.fn_cost_agent_list_vessels(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f      jsonb := coalesce(p_filter, '{}'::jsonb);
  v_q    text := nullif(btrim(f ->> 'q'), '');
  v_qk   text := public.fn_cost_agent_vessel_key(f ->> 'q');
  v_co   text := nullif(upper(btrim(f ->> 'company_code')), '');
  v_act  boolean := nullif(f ->> 'active', '')::boolean;
  v_miss text := nullif(lower(btrim(f ->> 'missing')), '');       -- dwt | company | type | office
  v_ofc  text := nullif(upper(btrim(f ->> 'office')), '');          -- MEDAN | JAKARTA | NONE
  v_lim  int := least(greatest(coalesce(nullif(f ->> 'limit', '')::int, 200), 1), 500);
  v_off  int := greatest(coalesce(nullif(f ->> 'offset', '')::int, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  with f as materialized (
    select v.id from public.cost_agent_vessels v
     where (v_q is null or v.name ilike '%' || v_q || '%' or upper(coalesce(v.short_code, '')) = upper(v_q)
            or (v_qk is not null and (v.name_key like '%' || v_qk || '%' or v_qk = any (v.aliases))))
       and (v_co is null or v.company_code = v_co)
       and (v_act is null or v.is_active = v_act)
       and (v_ofc is null or (v_ofc = 'NONE' and v.office is null) or v.office = v_ofc)
       and (v_miss is null
            or (v_miss = 'dwt' and v.dwt is null)
            or (v_miss = 'company' and v.company_code is null)
            or (v_miss = 'type' and v.vessel_type is null)
            or (v_miss = 'office' and v.office is null))),
  pg as (
    select v.* from public.cost_agent_vessels v join f on f.id = v.id order by v.name limit v_lim offset v_off)
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(pg) || jsonb_build_object(
             'invoices_count', (select count(*) from public.cost_agent_invoices i where i.vessel_id = pg.id),
             'voyages_count',  (select count(*) from public.cost_agent_voyages y where y.vessel_id = pg.id),
             'history_count',  (select count(*) from public.cost_agent_cost_history h where h.vessel_id = pg.id),
             'missing', to_jsonb(array_remove(array[case when pg.dwt is null then 'dwt' end,
                                                    case when pg.company_code is null then 'company' end,
                                                    case when pg.vessel_type is null then 'type' end,
                                                    case when pg.office is null then 'office' end], null)),
             -- saran office dari sumber voyage: Noon Report = Jakarta, SOF / Time Sheet = Medan
             'office_hint', (select case when bool_or(y.extra ->> 'input' = 'noon_report') then 'JAKARTA'
                                         when bool_or(y.extra ->> 'input' is not null) then 'MEDAN' end
                               from public.cost_agent_voyages y where y.vessel_id = pg.id)) order by pg.name) from pg), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.fn_cost_agent_save_vessel(p_id bigint, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o         public.cost_agent_vessels%rowtype;
  d         jsonb := coalesce(p_data, '{}'::jsonb);
  v_name    text;
  v_key     text;
  v_prefix  text;
  v_type    text;
  v_dwt     numeric;
  v_gt      numeric;
  v_hp      numeric;
  v_year    int;
  v_company text;
  v_office  text;
  v_short   text;
  v_alias   text[];
  v_active  boolean;
  c         record;
  v_row     public.cost_agent_vessels%rowtype;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_id is not null then
    select * into o from public.cost_agent_vessels where id = p_id for update;
    if not found then raise exception 'Vessel not found'; end if;
  end if;

  v_name := case when d ? 'name' then nullif(upper(regexp_replace(btrim(d ->> 'name'), '\s+', ' ', 'g')), '') else o.name end;
  if v_name is null then raise exception 'Vessel name is required'; end if;
  v_prefix := case when d ? 'prefix' then nullif(upper(btrim(d ->> 'prefix')), '') else o.prefix end;
  if v_prefix is null then
    v_prefix := (regexp_match(upper(v_name), '^\s*(MV|MT|TB|LPGC|LNGC|SV|BG|KM|SPOB|OB|AHTS|TK|KMP)\s*[\.\s]'))[1];
  end if;
  if v_prefix is not null and upper(v_name) !~ ('^\s*' || v_prefix || '\s*[\.\s]') then
    v_name := v_prefix || '. ' || v_name;
  end if;
  v_key := public.fn_cost_agent_vessel_key(v_name);
  if v_key is null then raise exception 'Vessel name is not valid'; end if;

  v_type    := case when d ? 'vessel_type' then nullif(upper(btrim(d ->> 'vessel_type')), '') else o.vessel_type end;
  v_dwt     := case when d ? 'dwt' then nullif(btrim(d ->> 'dwt'), '')::numeric else o.dwt end;
  v_gt      := case when d ? 'gt'  then nullif(btrim(d ->> 'gt'), '')::numeric else o.gt end;
  v_hp      := case when d ? 'hp'  then nullif(btrim(d ->> 'hp'), '')::numeric else o.hp end;
  v_year    := case when d ? 'year_built' then nullif(btrim(d ->> 'year_built'), '')::int else o.year_built end;
  v_company := case when d ? 'company_code' then nullif(upper(btrim(d ->> 'company_code')), '') else o.company_code end;
  v_office  := case when d ? 'office' then nullif(upper(btrim(d ->> 'office')), '') else o.office end;
  v_short   := case when d ? 'short_code' then nullif(upper(btrim(d ->> 'short_code')), '') else o.short_code end;
  v_active  := case when d ? 'is_active' then (d ->> 'is_active')::boolean else coalesce(o.is_active, true) end;

  if v_dwt is not null and (v_dwt < 0 or v_dwt > 1000000) then raise exception 'DWT must be between 0 and 1,000,000'; end if;
  if v_gt  is not null and (v_gt  < 0 or v_gt  > 1000000) then raise exception 'GT must be between 0 and 1,000,000'; end if;
  if v_hp  is not null and (v_hp  < 0 or v_hp  > 1000000) then raise exception 'HP must be between 0 and 1,000,000'; end if;
  if v_year is not null and (v_year < 1900 or v_year > extract(year from now())::int + 1) then raise exception 'Year built is not valid'; end if;
  if v_office is not null and v_office not in ('MEDAN', 'JAKARTA') then raise exception 'Owner office must be Medan or Jakarta'; end if;
  if v_short is not null and v_short !~ '^[A-Z0-9]{1,12}$' then raise exception 'Short code must be 1-12 letters or digits'; end if;
  if v_company is not null and not exists (select 1 from public.cost_agent_companies where code = v_company) then
    raise exception 'Unknown company %', v_company;
  end if;

  -- alias disimpan sebagai key (tanpa prefix MV/MT, huruf besar, tanpa tanda baca) seperti pencocokan di n8n
  v_alias := case when d ? 'aliases' then
                    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'aliases') = 'array' then d -> 'aliases' else '[]'::jsonb end)), '{}')
                  else o.aliases end;
  v_alias := coalesce((select array_agg(distinct k order by k) from (select public.fn_cost_agent_vessel_key(a) as k from unnest(coalesce(v_alias, '{}')) a) s
                        where k is not null and k <> v_key), '{}');

  select v.id, v.name into c from public.cost_agent_vessels v
   where v.id is distinct from p_id
     and (v.name_key = v_key or v_key = any (v.aliases) or v.name_key = any (v_alias) or v.aliases && v_alias)
   limit 1;
  if found then
    raise exception 'Vessel "%" (id %) already uses this name or alias. Use Merge to combine duplicate vessels.', c.name, c.id
      using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.cost_agent_vessels(name, name_key, prefix, vessel_type, dwt, gt, hp, year_built, company_code, short_code, aliases, is_active, office)
    values (v_name, v_key, v_prefix, v_type, v_dwt, v_gt, v_hp, v_year, v_company, v_short, v_alias, v_active, v_office)
    returning * into v_row;
    perform public.fn_cost_agent_log_master('vessel', v_row.id, 'create', 'Vessel created: ' || v_row.name, null, to_jsonb(v_row));
  else
    update public.cost_agent_vessels set
      name = v_name, name_key = v_key, prefix = v_prefix, vessel_type = v_type, dwt = v_dwt, gt = v_gt, hp = v_hp,
      year_built = v_year, company_code = v_company, short_code = v_short, aliases = v_alias, is_active = v_active, office = v_office, updated_at = now()
    where id = p_id returning * into v_row;
    if to_jsonb(v_row) - 'updated_at' is distinct from to_jsonb(o) - 'updated_at' then
      perform public.fn_cost_agent_log_master('vessel', v_row.id, 'update', 'Vessel updated: ' || v_row.name, to_jsonb(o), to_jsonb(v_row));
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

-- merge kapal: office ikut diisi dari kapal yang digabung bila kapal tujuan belum punya
create or replace function public.fn_cost_agent_merge_vessels(p_keep bigint, p_remove bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.cost_agent_vessels%rowtype;
  r public.cost_agent_vessels%rowtype;
  f record;
  n bigint;
  v_moved jsonb := '{}'::jsonb;
  v_inv bigint;
  v_refreshed int := 0;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'Choose two different vessels'; end if;
  select * into k from public.cost_agent_vessels where id = p_keep for update;
  if not found then raise exception 'Vessel to keep not found'; end if;
  select * into r from public.cost_agent_vessels where id = p_remove for update;
  if not found then raise exception 'Vessel to merge not found'; end if;

  for f in select c.conrelid::regclass::text as tbl, a.attname::text as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.confrelid = 'public.cost_agent_vessels'::regclass and c.contype = 'f' and array_length(c.conkey, 1) = 1 loop
    begin
      execute format('update %s set %I = $1 where %I = $2', f.tbl, f.col, f.col) using p_keep, p_remove;
      get diagnostics n = row_count;
      if n > 0 then v_moved := v_moved || jsonb_build_object(f.tbl, n); end if;
    exception when unique_violation then
      raise exception 'Cannot merge: both vessels have overlapping records in % (for example the same voyage). Resolve those first.', f.tbl
        using errcode = '23505';
    end;
  end loop;

  update public.cost_agent_vessels set
    aliases = coalesce((select array_agg(distinct a order by a) from unnest(k.aliases || r.aliases || array[r.name_key]) a
                         where a is not null and a <> k.name_key), '{}'),
    vessel_type  = coalesce(k.vessel_type, r.vessel_type),
    dwt          = coalesce(k.dwt, r.dwt),
    office       = coalesce(k.office, r.office),
    gt           = coalesce(k.gt, r.gt),
    hp           = coalesce(k.hp, r.hp),
    year_built   = coalesce(k.year_built, r.year_built),
    company_code = coalesce(k.company_code, r.company_code),
    short_code   = coalesce(k.short_code, r.short_code),
    prefix       = coalesce(k.prefix, r.prefix),
    updated_at   = now()
  where id = p_keep;
  delete from public.cost_agent_vessels where id = p_remove;

  -- invoice yang masih terbuka dibandingkan ulang (kapal yang sama sekarang punya history gabungan)
  for v_inv in select id from public.cost_agent_invoices where vessel_id = p_keep and status in ('verification', 'rejected') loop
    perform public.fn_cost_agent_refresh_compare(v_inv);
    v_refreshed := v_refreshed + 1;
  end loop;

  perform public.fn_cost_agent_log_master('vessel', p_keep, 'merge', format('Vessel "%s" merged into "%s"', r.name, k.name),
                                          to_jsonb(r), jsonb_build_object('keep_id', p_keep, 'moved', v_moved));
  return jsonb_build_object('kept_id', p_keep, 'removed_id', p_remove, 'moved', v_moved, 'invoices_recompared', v_refreshed);
end $$;

-- =====================================================================
-- 3. DASHBOARD
-- =====================================================================
create or replace function public.fn_cost_agent_dashboard(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f        jsonb := coalesce(p_filter, '{}'::jsonb);
  v_office text := nullif(upper(btrim(f ->> 'office')), '');
  v_co     text := nullif(upper(btrim(f ->> 'company_code')), '');
  v_months int := least(greatest(coalesce(nullif(f ->> 'months', '')::int, 6), 1), 24);
  v_from   date := (date_trunc('month', current_date) - make_interval(months => least(greatest(coalesce(nullif(f ->> 'months', '')::int, 6), 1), 24) - 1))::date;
  r        jsonb;
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  if v_office is not null and v_office not in ('MEDAN', 'JAKARTA', 'NONE') then raise exception 'Office must be Medan, Jakarta or none'; end if;

  with inv as materialized (
    select i.id, i.status, i.company_code, i.vendor_id, i.vessel_id, i.grand_total, i.lines_total, i.invoice_no, i.check_notes,
           i.submitted_at, i.created_at, i.error_message, i.updated_at,
           coalesce(i.invoice_date, i.created_at::date) as d, v.office as office
      from public.cost_agent_invoices i
      left join public.cost_agent_vessels v on v.id = i.vessel_id
     where (v_co is null or i.company_code = v_co)
       and (v_office is null or (v_office = 'NONE' and v.office is null) or v.office = v_office)),
  val as materialized (     -- invoice yang nilainya sah dihitung (bukan gagal/batal/masih diproses)
    select * from inv where status not in ('processing', 'failed', 'cancelled') and d >= v_from),
  ln as materialized (
    select l.id, l.invoice_id, l.cost_item_id, l.amount, l.compare_flag, l.compare_diff_pct, l.compare_ref_amount, l.is_verified, l.description_raw, l.line_no
      from public.cost_agent_invoice_lines l join val on val.id = l.invoice_id),
  pend as (
    select a.invoice_id, a.step_no, a.approver_label,
           row_number() over (partition by a.invoice_id order by a.step_no) as rn
      from public.cost_agent_approvals a
     where a.decision = 'pending'
       and a.round_no = (select max(a2.round_no) from public.cost_agent_approvals a2 where a2.invoice_id = a.invoice_id))
  select jsonb_build_object(
    'filter', jsonb_build_object('office', v_office, 'company_code', v_co, 'months', v_months, 'from', v_from),
    'generated_at', now(),

    'status', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n, 'total', s.t) order by s.ord), '[]'::jsonb) from (
                 select status, count(*) n, round(coalesce(sum(coalesce(grand_total, lines_total)), 0)) t,
                        array_position(array['processing','failed','verification','waiting_approval','rejected','approved','journal','paid','cancelled'], status) ord
                   from inv group by status) s),

    'attention', jsonb_build_object(
      'failed_invoices',   (select count(*) from inv where status = 'failed'),
      'processing_stuck',  (select count(*) from inv where status = 'processing' and updated_at < now() - interval '30 minutes'),
      'failed_documents',  (select count(*) from public.cost_agent_invoice_documents d join inv on inv.id = d.invoice_id where d.status = 'failed'),
      'in_verification',   (select count(*) from inv where status = 'verification'),
      'waiting_approval',  (select count(*) from inv where status = 'waiting_approval'),
      'waiting_over_3d',   (select count(*) from inv where status = 'waiting_approval' and submitted_at < now() - interval '3 days'),
      'rejected',          (select count(*) from inv where status = 'rejected'),
      'unmapped_lines',    (select count(*) from public.cost_agent_invoice_lines l join inv on inv.id = l.invoice_id
                             where inv.status in ('verification', 'rejected') and l.cost_item_id is null),
      'voyage_unmatched',  (select count(*) from inv where status in ('verification', 'rejected') and check_notes @> '[{"type":"voyage_unmatched"}]'::jsonb),
      'office_missing',    (select count(*) from inv where status in ('verification', 'rejected') and office is null)),

    'compare', jsonb_build_object(
      'flags', (select coalesce(jsonb_object_agg(coalesce(compare_flag, 'none'), n), '{}'::jsonb) from (select compare_flag, count(*) n from ln group by compare_flag) x),
      'top_naik', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                     select l.invoice_id, val.invoice_no, l.description_raw, round(l.amount) as amount, round(l.compare_ref_amount) as ref_amount, l.compare_diff_pct
                       from ln l join val on val.id = l.invoice_id
                      where l.compare_flag = 'naik' and val.status in ('verification', 'rejected', 'waiting_approval')
                      order by l.compare_diff_pct desc nulls last limit 10) t)),

    'trend', (select coalesce(jsonb_agg(to_jsonb(t) order by t.month, t.office), '[]'::jsonb) from (
                select to_char(date_trunc('month', d), 'YYYY-MM') as month, coalesce(office, 'NONE') as office, count(*) as invoices,
                       round(coalesce(sum(coalesce(grand_total, lines_total)), 0)) as total
                  from val group by 1, 2) t),

    'top_cost_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                         select ci.code, ci.name, ci.category, count(*) as lines, round(sum(l.amount)) as total
                           from ln l join public.cost_agent_cost_items ci on ci.id = l.cost_item_id
                          group by ci.code, ci.name, ci.category order by sum(l.amount) desc nulls last limit 8) t),
    'top_vendors', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                      select vd.id, vd.name, count(*) as invoices, round(sum(coalesce(val.grand_total, val.lines_total))) as total
                        from val join public.cost_agent_vendors vd on vd.id = val.vendor_id
                       group by vd.id, vd.name order by sum(coalesce(val.grand_total, val.lines_total)) desc nulls last limit 8) t),
    'top_vessels', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                      select vs.id, vs.name, vs.office, count(*) as invoices, round(sum(coalesce(val.grand_total, val.lines_total))) as total
                        from val join public.cost_agent_vessels vs on vs.id = val.vessel_id
                       group by vs.id, vs.name, vs.office order by sum(coalesce(val.grand_total, val.lines_total)) desc nulls last limit 8) t),

    'waiting_list', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                       select inv.id, inv.invoice_no, vd.name as vendor_name, vs.name as vessel_name, inv.office, inv.company_code,
                              round(coalesce(inv.grand_total, inv.lines_total)) as total, inv.submitted_at,
                              floor(extract(epoch from (now() - inv.submitted_at)) / 86400)::int as age_days,
                              p.step_no as pending_step, p.approver_label as pending_approver
                         from inv
                         left join public.cost_agent_vendors vd on vd.id = inv.vendor_id
                         left join public.cost_agent_vessels vs on vs.id = inv.vessel_id
                         left join pend p on p.invoice_id = inv.id and p.rn = 1
                        where inv.status = 'waiting_approval'
                        order by inv.submitted_at nulls last limit 15) t),

    'failed_list', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                      select * from (
                        select 'invoice' as kind, inv.id as invoice_id, inv.invoice_no, null::text as file_name, left(inv.error_message, 300) as error, inv.updated_at as at
                          from inv where inv.status = 'failed'
                        union all
                        select 'document', d.invoice_id, inv.invoice_no, d.file_name, left(d.error_message, 300), d.updated_at
                          from public.cost_agent_invoice_documents d join inv on inv.id = d.invoice_id where d.status = 'failed') u
                      order by at desc limit 10) t),

    'master_health', jsonb_build_object(
      'vessels_active',     (select count(*) from public.cost_agent_vessels where is_active),
      'vessels_no_dwt',     (select count(*) from public.cost_agent_vessels where is_active and dwt is null),
      'vessels_no_office',  (select count(*) from public.cost_agent_vessels where is_active and office is null),
      'vessels_no_company', (select count(*) from public.cost_agent_vessels where is_active and company_code is null),
      'ports_unverified',   (select count(*) from public.cost_agent_ports where not is_verified),
      'vendors_no_npwp',    (select count(*) from public.cost_agent_vendors where is_active and nullif(btrim(npwp), '') is null),
      'history_rows',       (select count(*) from public.cost_agent_cost_history where is_active),
      'matrix_rules',       (select count(*) from public.cost_agent_approval_matrix where is_active),
      'matrix_without_email', (select count(*) from public.cost_agent_approval_matrix where is_active and coalesce(cardinality(approver_emails), 0) = 0))
  ) into r;
  return r;
end $$;

-- =====================================================================
-- 4. HISTORY (lihat & nonaktifkan baris history yang salah)
-- =====================================================================
create or replace function public.fn_cost_agent_browse_history(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f      jsonb := coalesce(p_filter, '{}'::jsonb);
  v_q    text := nullif(btrim(f ->> 'q'), '');
  v_ves  bigint := nullif(f ->> 'vessel_id', '')::bigint;
  v_ven  bigint := nullif(f ->> 'vendor_id', '')::bigint;
  v_port bigint := nullif(f ->> 'port_id', '')::bigint;
  v_item bigint := nullif(f ->> 'cost_item_id', '')::bigint;
  v_co   text := nullif(upper(btrim(f ->> 'company_code')), '');
  v_act  boolean := nullif(f ->> 'active', '')::boolean;
  v_src  text := nullif(btrim(f ->> 'source'), '');
  v_from date := nullif(f ->> 'from', '')::date;
  v_to   date := nullif(f ->> 'to', '')::date;
  v_min  numeric := nullif(f ->> 'min_amount', '')::numeric;
  v_max  numeric := nullif(f ->> 'max_amount', '')::numeric;
  v_lim  int := least(greatest(coalesce(nullif(f ->> 'limit', '')::int, 50), 1), 200);
  v_off  int := greatest(coalesce(nullif(f ->> 'offset', '')::int, 0), 0);
  v_total bigint; v_sum numeric; v_rows jsonb;
begin
  perform public.fn_cost_agent_assert_read('cost_agent_approval_matrix');
  with fl as materialized (
    select h.id, h.amount from public.cost_agent_cost_history h
     where (v_ves is null or h.vessel_id = v_ves) and (v_ven is null or h.vendor_id = v_ven)
       and (v_port is null or h.port_id = v_port) and (v_item is null or h.cost_item_id = v_item)
       and (v_co is null or h.company_code = v_co) and (v_act is null or h.is_active = v_act)
       and (v_src is null or h.source = v_src)
       and (v_from is null or coalesce(h.service_date, h.invoice_date) >= v_from)
       and (v_to is null or coalesce(h.service_date, h.invoice_date) <= v_to)
       and (v_min is null or h.amount >= v_min) and (v_max is null or h.amount <= v_max)
       and (v_q is null or h.description_raw ilike '%' || v_q || '%' or h.invoice_no ilike '%' || v_q || '%' or h.voyage_no ilike '%' || v_q || '%')),
  pg as (
    select h.* from public.cost_agent_cost_history h join fl on fl.id = h.id
     order by coalesce(h.service_date, h.invoice_date) desc nulls last, h.id desc limit v_lim offset v_off)
  select (select count(*) from fl), (select round(coalesce(sum(amount), 0)) from fl),
         coalesce((select jsonb_agg(jsonb_build_object(
             'id', pg.id, 'service_date', pg.service_date, 'invoice_date', pg.invoice_date, 'invoice_no', pg.invoice_no, 'voyage_no', pg.voyage_no,
             'activity', pg.activity, 'description_raw', pg.description_raw, 'qty', pg.qty, 'unit_price', round(pg.unit_price), 'amount', round(pg.amount),
             'currency', pg.currency, 'company_code', pg.company_code, 'vessel_dwt', pg.vessel_dwt, 'source', pg.source, 'is_active', pg.is_active,
             'source_invoice_id', pg.source_invoice_id,
             'cost_item_code', ci.code, 'cost_item_name', ci.name, 'vendor_name', vd.name, 'vessel_name', vs.name,
             'port_code', pt.code, 'port_name', pt.name,
             'used_by_lines', (select count(*) from public.cost_agent_invoice_lines l where l.ref_history_id = pg.id))
             order by coalesce(pg.service_date, pg.invoice_date) desc nulls last, pg.id desc)
             from pg left join public.cost_agent_cost_items ci on ci.id = pg.cost_item_id
                     left join public.cost_agent_vendors vd on vd.id = pg.vendor_id
                     left join public.cost_agent_vessels vs on vs.id = pg.vessel_id
                     left join public.cost_agent_ports pt on pt.id = pg.port_id), '[]'::jsonb)
    into v_total, v_sum, v_rows;
  return jsonb_build_object('total', v_total, 'total_amount', v_sum, 'rows', v_rows,
    'sources', (select coalesce(jsonb_agg(distinct source order by source), '[]'::jsonb) from public.cost_agent_cost_history where source is not null));
end $$;

create or replace function public.fn_cost_agent_set_history_active(p_ids bigint[], p_active boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_act boolean := coalesce(p_active, false); n int; v_inv bigint; v_cnt int := 0; v_reason text := nullif(btrim(p_reason), '');
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_approval_matrix');
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Select at least one history row'; end if;
  if cardinality(p_ids) > 500 then raise exception 'Too many history rows at once (max 500)'; end if;
  if not v_act and v_reason is null then raise exception 'A reason is required to deactivate history rows'; end if;

  update public.cost_agent_cost_history set is_active = v_act where id = any (p_ids) and is_active is distinct from v_act;
  get diagnostics n = row_count;

  -- invoice yang masih terbuka dan terpengaruh dibandingkan ulang (yang dirujuk baris history ini, atau jenis biaya + pelabuhan yang sama)
  for v_inv in
    select distinct i.id from public.cost_agent_invoices i
     where i.status in ('verification', 'rejected')
       and (exists (select 1 from public.cost_agent_invoice_lines l where l.invoice_id = i.id and l.ref_history_id = any (p_ids))
            or exists (select 1 from public.cost_agent_invoice_lines l
                         join public.cost_agent_cost_history h on h.id = any (p_ids) and h.cost_item_id = l.cost_item_id and h.port_id is not distinct from i.port_id
                        where l.invoice_id = i.id))
     limit 200 loop
    perform public.fn_cost_agent_refresh_compare(v_inv); v_cnt := v_cnt + 1;
  end loop;

  perform public.fn_cost_agent_log_master('history', null, case when v_act then 'activate' else 'deactivate' end,
    format('%s history rows %s%s', n, case when v_act then 'activated' else 'deactivated' end, coalesce(' - ' || v_reason, '')),
    null, jsonb_build_object('history_ids', to_jsonb(p_ids), 'active', v_act, 'reason', v_reason));
  return jsonb_build_object('updated', n, 'invoices_recompared', v_cnt);
end $$;

-- =====================================================================
-- GRANT
-- =====================================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname as nm
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('fn_cost_agent_matrix_for', 'fn_cost_agent_submit_for_approval', 'fn_cost_agent_set_vessels_office',
                                'fn_cost_agent_list_vessels', 'fn_cost_agent_save_vessel', 'fn_cost_agent_merge_vessels',
                                'fn_cost_agent_list_vendors', 'fn_cost_agent_save_vendor', 'fn_cost_agent_merge_vendors', 'fn_cost_agent_delete_vendor',
                                'fn_cost_agent_list_ports', 'fn_cost_agent_save_port', 'fn_cost_agent_set_ports_verified', 'fn_cost_agent_merge_ports', 'fn_cost_agent_delete_port',
                                'fn_cost_agent_list_companies', 'fn_cost_agent_save_company',
                                'fn_cost_agent_dashboard', 'fn_cost_agent_browse_history', 'fn_cost_agent_set_history_active',
                                'fn_cost_agent_ref_counts', 'fn_cost_agent_repoint', 'fn_cost_agent_clean_npwp') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.nm not in ('fn_cost_agent_ref_counts', 'fn_cost_agent_repoint', 'fn_cost_agent_clean_npwp') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
