-- =====================================================================
-- 063 COST AGENT – Perbaikan klasifikasi & pengenalan kapal (uji aplikasi 15-10-2026)
--  1. "Fee Keagenan" / "PNBP Rambu" KM. CENTRANS mengambil pembanding kapal lain: nama kapal di invoice salah ketik
--     ("CENTRANS" vs master "CEMTRANS") -> kapal tidak dikenali -> tidak bisa "Same vessel". Sekarang salah ketik 1 huruf
--     dikenali (nama >= 6 huruf, angka sama, hanya 1 kapal yang cocok) + catatan "cek" di invoice.
--  2. Baris "Not mapped": "Nota Pelsindo", "Pengawasan Kekarantinaan Kesehatan", "Pengiriman Berita Acara ...".
--     a. Sinonim/salah ketik dipakai juga untuk klasifikasi (PELSINDO -> PELINDO, KEKARANTINAAN -> KARANTINA),
--        hanya bila teks asli tidak cocok keyword apa pun.
--     b. Keyword baru: KIRIM_DOKUMEN "PENGIRIMAN BERITA ACARA" / "KIRIM BERITA ACARA"; PHQC "KEKARANTINAAN".
--     c. Cadangan terakhir: jenis biaya diambil dari baris history yang hampir sama (method 'history').
--  3. Nama bulan diabaikan saat mencocokkan teks: "25-September-2026" = "25 September2026" = "25/09/2026".
--  4. Invoice yang masih Verification: baris belum terpetakan & kapal kosong dicoba dikenali ulang, lalu compare ulang.
-- Idempotent. Jalankan SETELAH 062.
-- =====================================================================

create index if not exists cost_agent_hist_tokens_gin on public.cost_agent_cost_history using gin (line_tokens) where is_active;

insert into public.cost_agent_token_synonyms(token, canonical) values
  ('PELSINDO', 'PELINDO'), ('PELINDDO', 'PELINDO'), ('KEKARANTINAAN', 'KARANTINA'), ('KARANTINAAN', 'KARANTINA')
on conflict (token) do nothing;

update public.cost_agent_cost_items
   set keywords = (select array_agg(distinct k order by k) from unnest(keywords || array['PENGIRIMAN BERITA ACARA', 'KIRIM BERITA ACARA']) k)
 where code = 'KIRIM_DOKUMEN';
update public.cost_agent_cost_items
   set keywords = (select array_agg(distinct k order by k) from unnest(keywords || array['KEKARANTINAAN']) k)
 where code = 'PHQC';

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
                     'INVOICE','KEAGENAN','REDELIVERY','DELIVERY','CREW','ORANG',
                     -- nama bulan (ID/EN, lengkap & singkat): "25 September 2026" = "25/09/2026"
                     'JAN','JANUARI','JANUARY','FEB','FEBRUARI','FEBRUARY','PEB','PEBRUARI','MAR','MARET','MARCH',
                     'APR','APRIL','MEI','MAY','JUN','JUNI','JUNE','JUL','JULI','JULY','AGU','AGS','AGT','AGUSTUS',
                     'AUG','AUGUST','SEP','SEPT','SEPTEMBER','OKT','OKTOBER','OCT','OCTOBER','NOV','NOP','NOVEMBER',
                     'NOPEMBER','DES','DESEMBER','DEC','DECEMBER')
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

-- jenis biaya dari baris history yang hampir sama (kNN). Uji 1.500 baris history: 98% sama dengan jenis biaya
-- yang tercatat; untuk baris yang tidak cocok keyword apa pun 21 dari 24 benar (3 lainnya tercatat LAIN_LAIN).
create or replace function public.fn_cost_agent_suggest_cost_item(p_desc text, p_exclude_invoice_no text default null)
returns table (cost_item_id bigint, score numeric, share numeric, n int)
language sql
stable
set search_path = ''
as $$
  with t as (select public.fn_cost_agent_line_tokens(p_desc) as tok),
  c as (
    select h.cost_item_id, (public.fn_cost_agent_line_match(0, t.tok, h.line_tokens))[1] as sim
      from public.cost_agent_cost_history h, t
     where h.is_active and cardinality(t.tok) > 0 and h.line_tokens && t.tok
       and h.invoice_no is distinct from p_exclude_invoice_no
  ),
  top as (select * from c where sim >= 0.8 order by sim desc limit 30),
  agg as (select x.cost_item_id, sum(x.sim) as s, count(*) as k from top x group by 1),
  best as (select a.*, a.s / nullif((select sum(s) from agg), 0) as sh from agg a order by a.s desc limit 1)
  select b.cost_item_id, round(b.s, 2), round(b.sh, 2), b.k::int
    from best b
    join public.cost_agent_cost_items ci on ci.id = b.cost_item_id
   where b.sh >= 0.7 and b.k >= 2 and ci.is_active and ci.code <> 'LAIN_LAIN';
$$;

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
  -- teks dengan salah ketik/sinonim diganti (PELSINDO -> PELINDO, KEKARANTINAAN -> KARANTINA); dipakai HANYA bila
  -- teks asli tidak cocok keyword apa pun
  v_canon text := (select string_agg(coalesce(sy.canonical, w), ' ' order by o)
                     from unnest(string_to_array(public.fn_cost_agent_norm(p_desc), ' ')) with ordinality u(w, o)
                     left join public.cost_agent_token_synonyms sy on sy.token = u.w);
  v_k record;
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

  if v_canon is distinct from v_norm then
  select ci.id into cost_item_id
      from public.cost_agent_cost_items ci
     where ci.is_active
       and exists (select 1 from unnest(ci.keywords) kw where ' ' || v_canon || ' ' like '% ' || kw || ' %')
     -- frasa keyword >= 3 kata (sangat spesifik, mis. "PENGAWASAN KEKARANTINAAN KESEHATAN") menang dari keyword umum
     order by (select max(array_length(string_to_array(kw, ' '), 1)) from unnest(ci.keywords) kw
                where ' ' || v_canon || ' ' like '% ' || kw || ' %') >= 3 desc,
              ci.priority, ci.id
     limit 1;
    if found then method := 'keyword_synonym'; return; end if;
  end if;

  -- cadangan terakhir: baris history yang hampir sama (>= 80% mirip, minimal 2 baris, >= 70% sepakat satu jenis biaya)
  select * into v_k from public.fn_cost_agent_suggest_cost_item(p_desc, null);
  if v_k.cost_item_id is not null then
    cost_item_id := v_k.cost_item_id; method := 'history'; return;
  end if;

  method := 'none';
end $$;

-- jarak edit (Levenshtein) sederhana untuk nama pendek
create or replace function public.fn_cost_agent_levenshtein(a text, b text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  la int := length(a); lb int := length(b);
  prev int[]; cur int[]; i int; j int; cost int;
begin
  if a is null or b is null then return null; end if;
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i];
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

-- kapal: nama sama / alias, lalu salah ketik 1 huruf ("KM. CENTRANS" -> MV. CEMTRANS).
-- Syarat salah ketik: nama >= 6 huruf, angka di nama harus sama persis, dan hanya SATU kapal yang cocok.
create or replace function public.fn_cost_agent_resolve_vessel_ex(p_name text, out vessel_id bigint, out method text)
language plpgsql
stable
set search_path = ''
as $$
declare v_key text := public.fn_cost_agent_vessel_key(p_name); v_n int;
begin
  vessel_id := public.fn_cost_agent_resolve_vessel(p_name);
  if vessel_id is not null then method := 'exact'; return; end if;
  if v_key is null or length(v_key) < 6 then method := 'none'; return; end if;
  select count(*), min(v.id) into v_n, vessel_id
    from public.cost_agent_vessels v
   where abs(length(v.name_key) - length(v_key)) <= 1
     and regexp_replace(v.name_key, '\D', '', 'g') = regexp_replace(v_key, '\D', '', 'g')
     and public.fn_cost_agent_levenshtein(v.name_key, v_key) <= 1;
  if v_n = 1 then method := 'fuzzy'; else vessel_id := null; method := 'none'; end if;
end $$;

create or replace function public.fn_cost_agent_ingest_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       bigint := (p_payload ->> 'invoice_id')::bigint;
  h          jsonb  := coalesce(p_payload -> 'header', '{}'::jsonb);
  l          jsonb;
  v_inv      public.cost_agent_invoices%rowtype;
  v_vendor   bigint;
  v_vessel   bigint;
  v_port     bigint;
  v_voyage   bigint;
  v_call     bigint;
  v_service  date;
  v_dup      bigint;
  v_item     record;
  v_notes    jsonb := '[]'::jsonb;
  v_lines_total numeric := 0;
  v_n        int := 0;
  v_company  text;
  v_vmethod  text;
begin
  perform public.fn_cost_agent_assert_service();
  if v_id is null then
    v_id := public.fn_cost_agent_create_invoice_stub('webhook', p_payload ->> 'file_url', p_payload ->> 'file_name');
  end if;
  select * into v_inv from public.cost_agent_invoices where id = v_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', v_id; end if;
  if v_inv.status not in ('processing', 'failed') then
    raise exception 'Invoice % sudah berstatus %, hasil AI tidak ditimpa', v_id, v_inv.status;
  end if;

  v_vendor := public.fn_cost_agent_resolve_vendor(h ->> 'vendor_name', h ->> 'vendor_npwp');
  select x.vessel_id, x.method into v_vessel, v_vmethod from public.fn_cost_agent_resolve_vessel_ex(h ->> 'vessel_name') x;
  v_port   := public.fn_cost_agent_resolve_port(h ->> 'port_name');
  v_service := coalesce(nullif(h ->> 'arrived_date', '')::date, nullif(h ->> 'period_start', '')::date,
                        nullif(h ->> 'invoice_date', '')::date);

  -- PT pembeli: dari payload, dari voyage, atau dari master kapal
  v_company := coalesce(nullif(p_payload ->> 'company_code', ''), v_inv.company_code,
                        (select company_code from public.cost_agent_vessels where id = v_vessel));

  -- voyage/port call: pilihan user saat upload diutamakan, kapal & pelabuhan ikut dari data voyage
  if v_inv.voyage_call_id is not null then
    select c.voyage_id, c.id, coalesce(v_vessel, v.vessel_id), coalesce(v_port, c.port_id)
      into v_voyage, v_call, v_vessel, v_port
      from public.cost_agent_voyage_calls c join public.cost_agent_voyages v on v.id = c.voyage_id
     where c.id = v_inv.voyage_call_id;
  else
    select m.voyage_id, m.call_id into v_voyage, v_call
      from public.fn_cost_agent_match_voyage_call(
             coalesce(v_vessel, (select vessel_id from public.cost_agent_voyages where id = v_inv.voyage_id)),
             v_port, v_service, h ->> 'voyage_no', v_inv.voyage_id) m;
    v_voyage := coalesce(v_voyage, v_inv.voyage_id);
    if v_inv.voyage_id is not null then
      select coalesce(v_vessel, vessel_id) into v_vessel from public.cost_agent_voyages where id = v_inv.voyage_id;
      if v_port is null and v_call is not null then
        select port_id into v_port from public.cost_agent_voyage_calls where id = v_call;
      end if;
    end if;
  end if;
  if v_company is null and v_voyage is not null then
    select company_code into v_company from public.cost_agent_voyages where id = v_voyage;
  end if;

  if v_vendor is null then v_notes := v_notes || jsonb_build_object('type','vendor_unknown','msg','Vendor tidak ada di master: ' || coalesce(h ->> 'vendor_name','-')); end if;
  if v_vessel is null then v_notes := v_notes || jsonb_build_object('type','vessel_unknown','msg','Kapal tidak ada di master: ' || coalesce(h ->> 'vessel_name','-')); end if;
  if v_vmethod = 'fuzzy' then
    v_notes := v_notes || jsonb_build_object('type','vessel_fuzzy','msg','Nama kapal di invoice "' || coalesce(h ->> 'vessel_name','-')
               || '" dianggap ' || (select name from public.cost_agent_vessels where id = v_vessel) || ' (beda 1 huruf) — cek');
  end if;
  if v_port   is null then v_notes := v_notes || jsonb_build_object('type','port_unknown','msg','Pelabuhan tidak ada di master: ' || coalesce(h ->> 'port_name','-')); end if;
  if v_call is null then v_notes := v_notes || jsonb_build_object('type','voyage_unmatched','msg','Voyage / pelabuhan singgah belum tercocokkan, pilih manual'); end if;

  -- duplikat (vendor + no invoice)
  if nullif(h ->> 'invoice_no', '') is not null then
    select id into v_dup from public.cost_agent_invoices
     where id <> v_id and status <> 'cancelled'
       and public.fn_cost_agent_norm(invoice_no) = public.fn_cost_agent_norm(h ->> 'invoice_no')
       and (vendor_id is not distinct from v_vendor)
     order by id limit 1;
    if v_dup is not null then
      v_notes := v_notes || jsonb_build_object('type','duplicate','msg','No invoice sama dengan invoice #' || v_dup);
    end if;
  end if;

  delete from public.cost_agent_invoice_lines where invoice_id = v_id;  -- re-process aman

  for l in select * from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) loop
    continue when nullif(l ->> 'amount', '') is null or (l ->> 'amount')::numeric = 0;
    v_n := v_n + 1;
    select * into v_item from public.fn_cost_agent_resolve_cost_item(l ->> 'description', v_vendor);
    insert into public.cost_agent_invoice_lines(
      invoice_id, line_no, description_raw, cost_item_id, match_method, qty, unit, unit_price, amount, gl_account,
      remark)
    values (
      v_id, coalesce((l ->> 'line_no')::int, v_n), coalesce(l ->> 'description', '-'), v_item.cost_item_id,
      v_item.method, nullif(l ->> 'qty', '')::numeric, l ->> 'unit', nullif(l ->> 'unit_price', '')::numeric,
      (l ->> 'amount')::numeric,
      (select gl_account from public.cost_agent_cost_items where id = v_item.cost_item_id),
      nullif(concat_ws(' | ', nullif(l ->> 'line_note', ''),
             case when v_item.cost_item_id is null then 'Biaya belum ada di record master' end), ''))
    on conflict (invoice_id, line_no) do update
      set description_raw = excluded.description_raw, amount = excluded.amount,
          cost_item_id = excluded.cost_item_id, match_method = excluded.match_method;
    v_lines_total := v_lines_total + (l ->> 'amount')::numeric;
  end loop;

  if nullif(h ->> 'subtotal', '') is not null
     and abs(v_lines_total - (h ->> 'subtotal')::numeric) > 1 then
    v_notes := v_notes || jsonb_build_object('type','total_mismatch',
      'msg', format('Jumlah baris %s <> subtotal invoice %s', v_lines_total, h ->> 'subtotal'));
  end if;

  update public.cost_agent_invoices set
    vendor_id = v_vendor, vessel_id = v_vessel, port_id = v_port, voyage_id = v_voyage, voyage_call_id = v_call,
    company_code = v_company,
    vendor_name_raw = h ->> 'vendor_name', vendor_npwp_raw = h ->> 'vendor_npwp',
    vessel_name_raw = h ->> 'vessel_name', port_name_raw = h ->> 'port_name',
    voyage_no_raw = h ->> 'voyage_no', activity_raw = h ->> 'activity',
    invoice_no = h ->> 'invoice_no', invoice_date = nullif(h ->> 'invoice_date', '')::date,
    service_date = v_service,
    period_start = nullif(h ->> 'period_start', '')::date, period_end = nullif(h ->> 'period_end', '')::date,
    currency = coalesce(nullif(h ->> 'currency', ''), 'IDR'),
    subtotal = nullif(h ->> 'subtotal', '')::numeric, ppn = nullif(h ->> 'ppn', '')::numeric,
    pph = nullif(h ->> 'pph', '')::numeric, materai = nullif(h ->> 'materai', '')::numeric,
    grand_total = nullif(h ->> 'grand_total', '')::numeric, lines_total = v_lines_total,
    ai_model = p_payload ->> 'ai_model', ai_raw = p_payload -> 'ai_raw',
    files = coalesce(p_payload -> 'files', files),
    po_numbers = (select coalesce(array_agg(distinct x), '{}') from (
                    select unnest(po_numbers) x
                    union select upper(btrim(value)) from jsonb_array_elements_text(coalesce(p_payload -> 'po_numbers', '[]'::jsonb))
                    where nullif(btrim(value), '') is not null) s),
    file_url = coalesce(nullif(p_payload ->> 'file_url', ''), file_url),
    duplicate_of = v_dup, check_notes = v_notes, error_message = null, updated_at = now()
  where id = v_id;

  perform public.fn_cost_agent_refresh_compare(v_id);
  perform public.fn_cost_agent_set_status(v_id, 'verification', 'n8n', 'AI selesai, menunggu verifikasi user');

  -- dokumen kiriman ini: tandai selesai + jenis dokumen hasil klasifikasi AI
  if nullif(p_payload ->> 'job_id', '') is not null then
    perform public.fn_cost_agent_finish_job_documents((p_payload ->> 'job_id')::uuid, p_payload -> 'documents', 'invoice');
  end if;

  -- faktur pajak ikut ter-scan di file invoice -> langsung dicek
  if nullif(p_payload #>> '{faktur_pajak,fp_number}', '') is not null then
    perform public.fn_cost_agent_save_tax_check(jsonb_build_object(
      'invoice_id', v_id, 'doc_type', 'faktur_pajak',
      'file_url', coalesce(p_payload ->> 'file_url', v_inv.file_url), 'file_name', v_inv.file_name,
      'extracted', p_payload -> 'faktur_pajak'));
  end if;

  return jsonb_build_object(
    'invoice_id', v_id, 'lines', v_n, 'lines_total', v_lines_total,
    'vendor_id', v_vendor, 'vessel_id', v_vessel, 'port_id', v_port, 'voyage_id', v_voyage, 'voyage_call_id', v_call,
    'duplicate_of', v_dup, 'notes', v_notes,
    'flags', (select jsonb_object_agg(f, c) from (
                select compare_flag f, count(*) c from public.cost_agent_invoice_lines
                 where invoice_id = v_id group by 1) s));
end $$;

-- ---------------------------------------------------------------------
-- Token ulang (nama bulan), lalu kenali ulang invoice yang masih bisa diedit
-- ---------------------------------------------------------------------
select public.fn_cost_agent_retokenize_history() as baris_token_diperbarui;

do $$
declare r record; v record; c record;
begin
  -- kapal kosong -> coba salah ketik
  for r in select id, vessel_name_raw from public.cost_agent_invoices
            where status in ('verification', 'rejected') and vessel_id is null and vessel_name_raw is not null loop
    select * into v from public.fn_cost_agent_resolve_vessel_ex(r.vessel_name_raw);
    if v.vessel_id is not null then
      update public.cost_agent_invoices
         set vessel_id = v.vessel_id,
             check_notes = check_notes || jsonb_build_array(jsonb_build_object('type','vessel_fuzzy','msg',
               'Nama kapal di invoice "' || r.vessel_name_raw || '" dianggap '
               || (select name from public.cost_agent_vessels where id = v.vessel_id) || ' (beda 1 huruf) — cek')),
             updated_at = now()
       where id = r.id;
    end if;
  end loop;
  -- baris belum terpetakan & belum diverifikasi -> klasifikasi ulang
  for r in select l.id, l.description_raw, i.vendor_id from public.cost_agent_invoice_lines l
             join public.cost_agent_invoices i on i.id = l.invoice_id
            where i.status in ('verification', 'rejected') and l.cost_item_id is null and not l.is_verified loop
    select * into c from public.fn_cost_agent_resolve_cost_item(r.description_raw, r.vendor_id);
    if c.cost_item_id is not null then
      update public.cost_agent_invoice_lines
         set cost_item_id = c.cost_item_id, match_method = c.method,
             gl_account = coalesce((select gl_account from public.cost_agent_cost_items where id = c.cost_item_id), gl_account),
             remark = nullif(remark, 'Biaya belum ada di record master'), updated_at = now()
       where id = r.id;
    end if;
  end loop;
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
