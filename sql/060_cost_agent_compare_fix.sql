-- =====================================================================
-- 060 COST AGENT – Perbaikan pencocokan dari uji aplikasi (14-10-2026)
--  1. PNBP Labuh / PNBP Rambu MV. CEMTRANS di BJM mengambil "Same port · nearest DWT" padahal kapal sendiri punya
--     baris LABUH/RAMBU yang sama. Penyebab: aturan 058 menurunkan history yang tidak memuat SEMUA kata baris
--     invoice ("PNBP" tidak ada di history "LABUH"). Sekarang hanya baris yang benar-benar BEDA layanan
--     (mis. Kesehatan vs Syahbandar) yang diturunkan. Uji balik 1.500 baris: 969 harga persis (058: 962, 057: 951).
--  2. Kuantitas di teks ikut dicocokkan: "Penjagaan kapal 6 hari + mooring" -> token 6HARI, sehingga baris history
--     "(6 HARI)" didahulukan. (Nominal TIDAK dipakai untuk memilih pembanding — lihat penjelasan.)
--  3. Invoice lama untuk uji: dokumen yang sama (no invoice + vendor sama, mis. sudah ada di import Excel) tidak
--     dipakai sebagai pembanding dirinya sendiri; history SEBELUM tanggal invoice didahulukan, baru yang sesudahnya.
--  4. Klasifikasi: alias hasil verifikasi dikenali walau tanggal/voyage/angka berbeda; keyword frasa >= 3 kata
--     (mis. "PENGAWASAN KEKARANTINAAN KESEHATAN") menang dari keyword umum.
--  5. Setelah invoice di-approve dan masuk history, invoice lain yang masih Verification (kapal/pelabuhan & jenis
--     biaya sama) otomatis dihitung ulang pembandingnya.
-- Idempotent. Jalankan SETELAH 059. Signature get_line_history bertambah 1 parameter (internal, bukan RPC app).
-- =====================================================================

-- token kuantitas: "6 HARI" -> 6HARI, "56 TON" -> 56TON (angka 1-3 digit + satuan), dipakai agar baris dengan
-- jumlah hari/ton yang sama lebih diutamakan. Angka lain (tanggal, voyage, nominal) tetap diabaikan.
create or replace function public.fn_cost_agent_line_tokens(p text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct t order by t), '{}') from (
    select coalesce(sy.canonical, w) as t
      from unnest(regexp_split_to_array(
             public.fn_cost_agent_norm(regexp_replace(upper(coalesce(p, '')), '[0-9]+', ' ', 'g')), ' ')) w
      left join public.cost_agent_token_synonyms sy on sy.token = w
     where length(w) >= 3
       and w not in ('BIAYA','NOTA','TAGIHAN','DAN','UNTUK','THE','AND','FOR','DLL','KPL','KAPAL','VOY','VOYAGE',
                     'BONGKAR','MUAT','LOADING','DISCHARGE','DISCHARGING','TGL','PRD','PERIODE','SEBENARNYA','INV',
                     'INVOICE','KEAGENAN','REDELIVERY','DELIVERY','CREW','ORANG')
       and not exists (select 1 from public.cost_agent_ports pp where pp.code = w)
    union
    select (m[1]::int)::text || case m[2] when 'DAYS' then 'HARI' when 'DAY' then 'HARI' when 'HR' then 'HARI'
                                         when 'MT' then 'TON' when 'TONS' then 'TON' when 'ORG' then 'ORANG'
                                         when 'PAX' then 'ORANG' when 'PERSON' then 'ORANG' when 'PERSONS' then 'ORANG'
                                         else m[2] end
      from regexp_matches(upper(coalesce(p, '')),
             '(?:^|[^0-9.,/:-])([0-9]{1,3})\s*(HARI|HR|DAYS|DAY|TON|TONS|MT|M3|JAM|ORANG|ORG|PAX|PERSON|PERSONS|CREW|MALAM|KALI|TRIP|UNIT|SET)(?![A-Z])',
             'g') m
  ) x where t is not null;
$$;

-- kecocokan teks berbobot -> {similarity, cakupan, cakupan_invoice}
--   token kuantitas (6HARI, 56TON) tidak pernah dianggap langka (selalu berbobot)
--   bobot kata = ln(1 + (N+1)/(df+1)) dalam jenis biaya; kata huruf yang sangat langka (df <= 2, mis. nama crew) = 0
create or replace function public.fn_cost_agent_line_match(p_cost_item_id bigint, a text[], b text[])
returns numeric[]
language sql
stable
set search_path = ''
as $$
  with n as (
    select coalesce((select df from public.cost_agent_token_stats
                      where cost_item_id = coalesce(p_cost_item_id, 0) and token = '#'), 0) as n),
  w as (
    select case when n.n >= 50 and coalesce(s.df, 0) <= 2 and t.x !~ '[0-9]' then 0
                else ln(1 + (n.n + 1)::numeric / (coalesce(s.df, 0) + 1)) end as w,
           t.x = any (a) as ina, t.x = any (b) as inb
      from (select distinct x from unnest(coalesce(a, '{}') || coalesce(b, '{}')) x) t
      cross join n
      left join public.cost_agent_token_stats s on s.cost_item_id = coalesce(p_cost_item_id, 0) and s.token = t.x),
  agg as (
    select coalesce(sum(w) filter (where ina and inb), 0) as m,
           coalesce(sum(w) filter (where ina), 0) as wa, coalesce(sum(w) filter (where inb), 0) as wb
      from w)
  select case when coalesce(cardinality(a), 0) = 0 or coalesce(cardinality(b), 0) = 0 then array[0, 1, 1]::numeric[]
              else array[coalesce(round(m / nullif(greatest(wa, wb), 0), 2), 0),
                         coalesce(round(m / nullif(least(wa, wb), 0), 2), 1),
                         coalesce(round(m / nullif(wa, 0), 2), 1)] end
    from agg;
$$;

drop function if exists public.fn_cost_agent_get_line_history(bigint, bigint, bigint, bigint, bigint, int, text, date);
create or replace function public.fn_cost_agent_get_line_history(
  p_cost_item_id       bigint,
  p_port_id            bigint,
  p_vessel_id          bigint,
  p_vendor_id          bigint default null,
  p_exclude_invoice_id bigint default null,
  p_limit              int default null,
  p_description        text default null,
  p_ref_date           date default null,
  p_exclude_invoice_no text default null)
returns table (
  match_level   text,      -- same_vessel_port | nearest_dwt (pelabuhan sama) | same_vessel (pelabuhan lain) | nearest_port
  history_id    bigint,
  service_date  date,
  invoice_no    text,
  voyage_no     text,
  amount        numeric,
  qty           numeric,
  unit_price    numeric,
  vessel_name   text,
  vessel_dwt    numeric,
  port_code     text,
  port_name     text,
  vendor_name   text,
  distance_km   numeric,
  dwt_diff      numeric,
  days_diff     int,       -- tanggal history - tanggal invoice (negatif = sebelum invoice)
  description_raw text,
  invoice_description text,
  similarity    numeric,
  line_match    text)      -- same_line | similar | different_line | no_text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit int := coalesce(p_limit, public.fn_cost_agent_setting_num('history_limit', 2)::int);
  v_min   numeric := public.fn_cost_agent_setting_num('line_similarity_min', 0.5);
  v_same  numeric := public.fn_cost_agent_setting_num('line_similarity_same', 0.8);
  v_maxkm numeric := public.fn_cost_agent_setting_num('nearest_port_max_km', 800);
  v_tok   text[] := public.fn_cost_agent_line_tokens(p_description);
  v_ref   date := coalesce(p_ref_date, current_date);
  v_dwt   numeric;
  v_lat   double precision;
  v_lon   double precision;
  v_excl  text := nullif(upper(regexp_replace(coalesce(p_exclude_invoice_no, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if p_cost_item_id is null then return; end if;
  select dwt into v_dwt from public.cost_agent_vessels where id = p_vessel_id;
  select lat, lon into v_lat, v_lon from public.cost_agent_ports where id = p_port_id;

  return query
  with near as (       -- 5 pelabuhan terdekat yang punya history jenis biaya ini
    select p.id, (6371 * 2 * asin(sqrt(power(sin(radians(p.lat - v_lat) / 2), 2)
             + cos(radians(v_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lon - v_lon) / 2), 2))))::numeric as km
      from public.cost_agent_ports p
     where v_lat is not null and p.lat is not null and p.id is distinct from p_port_id
       and exists (select 1 from public.cost_agent_cost_history h0
                    where h0.port_id = p.id and h0.cost_item_id = p_cost_item_id and h0.is_active)
     order by 2
     limit 5
  ),
  cand as (
    select h.*, n.km,
           public.fn_cost_agent_line_match(p_cost_item_id, v_tok, h.line_tokens) as lm,
           (h.vessel_id = p_vessel_id) as same_vessel,
           (h.port_id = p_port_id) as same_port
      from public.cost_agent_cost_history h
      left join near n on n.id = h.port_id
     where h.is_active and h.cost_item_id = p_cost_item_id
       and (p_exclude_invoice_id is null or h.source_invoice_id is distinct from p_exclude_invoice_id)
       -- dokumen yang sama (mis. invoice lama yang sudah ada di import Excel) tidak dipakai sebagai pembanding dirinya sendiri
       and (v_excl is null or upper(regexp_replace(coalesce(h.invoice_no, ''), '[^A-Za-z0-9]', '', 'g')) is distinct from v_excl
            or h.vendor_id is distinct from p_vendor_id)
       and (h.vessel_id = p_vessel_id or h.port_id = p_port_id or (n.id is not null and n.km <= v_maxkm))
  ),
  ranked as (
    select c.*, c.lm[1] as sim, c.lm[2] as cov,
           case when cardinality(v_tok) = 0 then 'no_text'
                when c.lm[1] >= v_same then 'same_line'
                when c.lm[2] >= v_min then 'similar'
                else 'different_line' end as lmatch,
           case when c.same_vessel and c.same_port then 1
                when c.same_port then 2
                when c.same_vessel then 3
                else 4 end as tier,
           case when c.same_vessel or v_dwt is null or c.vessel_dwt is null then 0
                when abs(c.vessel_dwt - v_dwt) <= 0.10 * v_dwt then 0
                when abs(c.vessel_dwt - v_dwt) <= 0.25 * v_dwt then 1 else 2 end as dwt_band,
           abs(c.service_date - v_ref) as ddays,
           bool_or(cardinality(v_tok) > 0 and c.lm[1] >= v_same) over () as has_same_line
      from cand c
  )
  select case r.tier when 1 then 'same_vessel_port' when 2 then 'nearest_dwt'
                     when 3 then 'same_vessel' else 'nearest_port' end,
         r.id, r.service_date, r.invoice_no, r.voyage_no, r.amount, r.qty, r.unit_price,
         v.name, r.vessel_dwt, p.code, p.name, vd.name,
         case when r.same_port then 0::numeric else round(r.km, 0) end,
         round(abs(coalesce(r.vessel_dwt, 0) - coalesce(v_dwt, 0)), 0),
         (r.service_date - v_ref)::int,
         r.description_raw, r.invoice_description, r.sim, r.lmatch
    from ranked r
    left join public.cost_agent_vessels v on v.id = r.vessel_id
    left join public.cost_agent_ports p on p.id = r.port_id
    left join public.cost_agent_vendors vd on vd.id = r.vendor_id
   -- 1) baris yang benar-benar BEDA layanan (Kesehatan vs Syahbandar) hanya dipakai bila tidak ada baris yang sama.
   --    Beda kata umum (invoice "PNBP Labuh" vs history "LABUH") TIDAK diturunkan.
   -- 2) lokasi  3) teks  4) DWT  5) tanggal: sebelum/sama dengan tanggal invoice dulu, lalu yang paling dekat
   order by (r.has_same_line and r.lmatch = 'different_line'), r.tier,
            case r.lmatch when 'same_line' then 2 when 'similar' then 1 else 0 end desc,
            r.dwt_band, (r.service_date > v_ref), r.ddays, r.sim desc,
            (r.vendor_id is not distinct from p_vendor_id) desc,
            abs(coalesce(r.vessel_dwt, 0) - coalesce(v_dwt, 0)), r.service_date desc, r.id desc
   limit v_limit;
end $$;

create or replace function public.fn_cost_agent_refresh_compare(p_invoice_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record; h record;
  v_tol numeric := public.fn_cost_agent_setting_num('tolerance_pct', 5);
  v_inv public.cost_agent_invoices%rowtype;
  v_ref date;
  v_pct numeric;
begin
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id;
  v_ref := coalesce(v_inv.service_date, v_inv.invoice_date, current_date);
  for r in select * from public.cost_agent_invoice_lines where invoice_id = p_invoice_id loop
    h := null;
    if r.ref_history_id is not null then
      select * into h from public.fn_cost_agent_history_row(r.ref_history_id, r.description_raw, v_ref);
    elsif r.cost_item_id is null then
      update public.cost_agent_invoice_lines
         set compare_flag = 'item_baru', compare_level = 'none', compare_ref_amount = null, compare_diff_pct = null,
             compare_similarity = null,
             remark = coalesce(remark, 'Biaya belum ada di record master'), updated_at = now()
       where id = r.id;
      continue;
    else
      select * into h from public.fn_cost_agent_get_line_history(
        r.cost_item_id, v_inv.port_id, v_inv.vessel_id, v_inv.vendor_id, v_inv.id, 1, r.description_raw, v_ref,
        v_inv.invoice_no) limit 1;
    end if;
    if h.history_id is null then
      update public.cost_agent_invoice_lines
         set compare_flag = 'tanpa_history', compare_level = 'none', compare_ref_amount = null,
             compare_diff_pct = null, compare_similarity = null, updated_at = now()
       where id = r.id;
    else
      v_pct := case when coalesce(h.amount, 0) = 0 then null
                    else round((r.amount - h.amount) / abs(h.amount) * 100, 2) end;
      update public.cost_agent_invoice_lines
         set compare_level = h.match_level, compare_ref_amount = h.amount, compare_diff_pct = v_pct,
             compare_similarity = h.similarity,
             compare_flag = case when v_pct is null or abs(v_pct) <= v_tol then 'sesuai'
                                 when v_pct > 0 then 'naik' else 'turun' end,
             updated_at = now()
       where id = r.id;
    end if;
  end loop;
end $$;

create or replace function public.fn_cost_agent_get_invoice_history(p_invoice_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_cost_agent_assert_read('cost_agent_invoice');
  return (
  select jsonb_build_object(
    'invoice', to_jsonb(i) || jsonb_build_object(
        'vendor_name', vd.name, 'vessel_name', vs.name, 'vessel_dwt', vs.dwt, 'vessel_type', vs.vessel_type,
        'port_code', p.code, 'port_name', p.name,
        'voyage', case when vy.id is null then null else to_jsonb(vy) end,
        'voyage_call', case when vc.id is null then null else to_jsonb(vc) end),
    'lines', coalesce((
      select jsonb_agg(
               to_jsonb(l) || jsonb_build_object(
                 'cost_item_code', ci.code, 'cost_item_name', ci.name,
                 'history', coalesce((
                    select jsonb_agg(to_jsonb(hx))
                      from (select * from public.fn_cost_agent_history_row(
                                     l.ref_history_id, l.description_raw, coalesce(i.service_date, i.invoice_date))
                             where l.ref_history_id is not null
                            union all
                            select * from public.fn_cost_agent_get_line_history(
                                   l.cost_item_id, i.port_id, i.vessel_id, i.vendor_id, i.id, null, l.description_raw,
                                   coalesce(i.service_date, i.invoice_date), i.invoice_no) g
                             where g.history_id is distinct from l.ref_history_id) hx), '[]'::jsonb))
               order by l.line_no)
        from public.cost_agent_invoice_lines l
        left join public.cost_agent_cost_items ci on ci.id = l.cost_item_id
       where l.invoice_id = i.id), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(a) order by a.round_no, a.step_no)
                             from public.cost_agent_approvals a where a.invoice_id = i.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(dc) order by dc.created_at desc, dc.seq)
                             from public.cost_agent_invoice_documents dc where dc.invoice_id = i.id), '[]'::jsonb),
    'tax_checks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
                              from public.cost_agent_tax_checks t where t.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.created_at desc)
                            from public.cost_agent_payment_requests pr where pr.invoice_id = i.id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
                            from public.cost_agent_status_log s where s.invoice_id = i.id), '[]'::jsonb)
  )
  from public.cost_agent_invoices i
  left join public.cost_agent_vendors vd on vd.id = i.vendor_id
  left join public.cost_agent_vessels vs on vs.id = i.vessel_id
  left join public.cost_agent_ports p on p.id = i.port_id
  left join public.cost_agent_voyages vy on vy.id = i.voyage_id
  left join public.cost_agent_voyage_calls vc on vc.id = i.voyage_call_id
  where i.id = p_invoice_id
  );
end $$;

create or replace function public.fn_cost_agent_resolve_cost_item(
  p_desc text, p_vendor_id bigint default null,
  out cost_item_id bigint, out method text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_norm text := public.fn_cost_agent_norm(p_desc);
  v_pat  text := public.fn_cost_agent_norm(regexp_replace(coalesce(p_desc, ''), '[0-9]+', ' ', 'g'));
begin
  if v_norm is null then method := 'none'; return; end if;

  select a.cost_item_id into cost_item_id from public.cost_agent_cost_item_aliases a
   where a.alias_norm = v_norm and a.vendor_id = p_vendor_id limit 1;
  if found then method := 'alias_vendor'; return; end if;

  select a.cost_item_id into cost_item_id from public.cost_agent_cost_item_aliases a
   where a.alias_norm = v_norm and a.vendor_id is null limit 1;
  if found then method := 'alias'; return; end if;

  -- alias yang dipelajari dari verifikasi, tanpa memperhatikan angka (tanggal, voyage, jumlah) -> teks yang sama
  -- dengan tanggal berbeda tetap dikenali. Vendor sama didahulukan, lalu yang terbaru.
  if v_pat is not null then
    select a.cost_item_id into cost_item_id from public.cost_agent_cost_item_aliases a
     where public.fn_cost_agent_norm(regexp_replace(a.alias_norm, '[0-9]+', ' ', 'g')) = v_pat
       and (a.vendor_id = p_vendor_id or a.vendor_id is null)
     order by (a.vendor_id = p_vendor_id) desc nulls last, a.id desc
     limit 1;
    if found then method := 'alias_pattern'; return; end if;
  end if;

  select ci.id into cost_item_id
    from public.cost_agent_cost_items ci
   where ci.is_active
     and exists (select 1 from unnest(ci.keywords) kw where ' ' || v_norm || ' ' like '% ' || kw || ' %')
   -- frasa keyword >= 3 kata (sangat spesifik, mis. "PENGAWASAN KEKARANTINAAN KESEHATAN") menang dari keyword umum
   order by (select max(array_length(string_to_array(kw, ' '), 1)) from unnest(ci.keywords) kw
              where ' ' || v_norm || ' ' like '% ' || kw || ' %') >= 3 desc,
            ci.priority, ci.id
   limit 1;
  if found then method := 'keyword'; return; end if;

  method := 'none';
end $$;

create or replace function public.fn_cost_agent_hist_stats_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_items bigint[]; r record;
begin
  select array_agg(distinct cost_item_id) into v_items from new_rows where cost_item_id is not null;
  if v_items is not null then
    perform public.fn_cost_agent_refresh_token_stats(v_items);
    -- invoice yang masih diverifikasi & punya jenis biaya yang sama di kapal/pelabuhan yang sama -> pembanding diperbarui
    for r in
      select distinct i.id
        from public.cost_agent_invoices i
        join public.cost_agent_invoice_lines l on l.invoice_id = i.id
       where i.status in ('verification', 'rejected')
         and l.cost_item_id = any (v_items)
         and exists (select 1 from new_rows n
                      where n.cost_item_id = l.cost_item_id
                        and (n.vessel_id = i.vessel_id or n.port_id = i.port_id))
         and i.id not in (select source_invoice_id from new_rows where source_invoice_id is not null)
       limit 200
    loop
      perform public.fn_cost_agent_refresh_compare(r.id);
    end loop;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Token ulang semua history (token kuantitas baru) + statistik + hitung ulang invoice yang masih bisa diedit
-- ---------------------------------------------------------------------
select public.fn_cost_agent_retokenize_history() as baris_token_diperbarui;
do $$
declare r record;
begin
  for r in select id from public.cost_agent_invoices where status in ('verification', 'rejected') loop
    perform public.fn_cost_agent_refresh_compare(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- GRANT: allowlist resmi = 16 RPC aplikasi (ditambah fn_cost_agent_delete_invoice); fungsi lain hanya service_role.
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
    'fn_cost_agent_delete_invoice'];
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
