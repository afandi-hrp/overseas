-- beehive:043 — FAR Overseas: konfirmasi temuan AI, deteksi duplikat, payment type otomatis, catatan Urgent
-- (2026-10-05, permintaan user). Idempotent — aman dijalankan ulang.
--
--   A. Cek pengaman nama fungsi (berhenti kalau ada fungsi bernama sama yang BUKAN dari file ini).
--   B. Kolom baru `rekapan_far_overseas_air.urgent_note` (alasan Urgent).
--   C. Helper `fn_far_overseas_norm_key` / `fn_far_overseas_po_keys` (normalisasi nomor invoice & PO).
--   D. Deteksi duplikat `fn_far_overseas_find_duplicates` — HANYA dibandingkan dgn memo yang LEBIH DULU masuk:
--        * memo punya nomor invoice -> invoice sama DAN (PO sama, kalau kedua memo punya PO);
--        * memo TANPA nomor invoice -> fallback: ada nomor PO yang sama.
--   E. Trigger `trg_far_overseas_auto_fields` (BEFORE INSERT/UPDATE):
--        * payment_type kosong + ada nomor PO (dan AI tidak bilang NON_PO) -> otomatis 'WITH_PO';
--        * nomor invoice / PO berubah -> `ai_duplicate_of` dihitung ulang.
--      + isi data lama: payment_type (semua memo) & ai_duplicate_of (memo yang belum ditandatangani).
--   F. `fn_far_overseas_confirm_ai_finding` — signature SAMA, menyimpan juga `user_name` (nama profil).
--   G. RPC BARU `fn_far_overseas_unconfirm_ai_finding(uuid, text)` — tombol Undo konfirmasi.
--   H. `fn_far_overseas_prepared_by_blockers` — signature SAMA (isi live 2026-10-05 dari user) dgn 3 perubahan:
--        * payment type kosong tapi ada PO = dianggap With PO;
--        * duplikat dihitung hanya kalau memo yang dirujuk masih ada;
--        * syarat "Notes (Manual)" utk unit price tidak cocok GUGUR kalau Overcharge/Undercharge sudah dikonfirmasi;
--        * BARU: memo Octagon (ship_via mengandung OCTAGON) wajib goods received date terisi, kecuali Urgent.
--   I. RPC overload BARU `fn_far_overseas_set_urgent(uuid, boolean, text)` — Urgent + catatan (wajib min. 5 karakter
--      saat Urgent). Versi 2-arg dari sql/035 TIDAK diubah/dihapus (frontend lama tetap jalan).

-- ── A. Cek pengaman ─────────────────────────────────────────────────────────
do $$
declare v_conflict text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname = any (array['fn_far_overseas_norm_key', 'fn_far_overseas_po_keys', 'fn_far_overseas_find_duplicates',
                             'fn_far_overseas_auto_fields', 'fn_far_overseas_unconfirm_ai_finding'])
      or (p.proname = 'fn_far_overseas_set_urgent' and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_urgent boolean, p_note text')
    )
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:043%';
  if v_conflict is not null then
    raise exception 'STOP 043: nama fungsi sudah dipakai fungsi lain (bukan dari file 043): %', v_conflict;
  end if;
  if to_regprocedure('public.fn_far_overseas_prepared_by_blockers(uuid)') is null
     or to_regprocedure('public.fn_far_overseas_confirm_ai_finding(uuid, text, text)') is null
     or to_regprocedure('public.fn_far_overseas_as_array(jsonb)') is null then
    raise exception 'STOP 043: fungsi FAR tahap 2 (sql/027) tidak lengkap.';
  end if;
end $$;

-- ── B. Kolom catatan Urgent ─────────────────────────────────────────────────
alter table public.rekapan_far_overseas_air add column if not exists urgent_note text;
comment on column public.rekapan_far_overseas_air.urgent_note is 'beehive:043 alasan memo Urgent (diisi lewat fn_far_overseas_set_urgent)';

-- ── C. Normalisasi ──────────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_norm_key(p text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
comment on function public.fn_far_overseas_norm_key(text) is 'beehive:043 normalisasi nomor (huruf besar, hanya A-Z0-9)';

-- Nomor PO unik ternormalisasi dari po_list (po_no_raw) + po_ori ("PO1 + PO2"). Awalan "I.PO/" / "PO/" dibuang
-- supaya "I.PO/WNS.MDN/2608/0349" = "PO/WNS.MDN/2608/0349".
create or replace function public.fn_far_overseas_po_keys(p_po_list jsonb, p_po_ori text)
returns text[]
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select coalesce(array_agg(distinct k), '{}')
  from (
    select public.fn_far_overseas_norm_key(regexp_replace(upper(btrim(s)), '^[A-Z]?\.?\s*PO\s*[/.\-]\s*', '')) as k
    from (
      select e->>'po_no_raw' as s from jsonb_array_elements(public.fn_far_overseas_as_array(p_po_list)) e
      union all
      select x from unnest(string_to_array(coalesce(p_po_ori, ''), '+')) x
    ) raw
    where s is not null
  ) t
  where k <> ''
$$;
comment on function public.fn_far_overseas_po_keys(jsonb, text) is 'beehive:043 daftar nomor PO ternormalisasi';

-- ── D. Deteksi duplikat ─────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_find_duplicates(p_id uuid, p_no_invoice text, p_po_list jsonb, p_po_ori text, p_created_at timestamptz)
returns uuid[]
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with me as (
    select public.fn_far_overseas_norm_key(p_no_invoice) as inv,
           public.fn_far_overseas_po_keys(p_po_list, p_po_ori) as pos,
           coalesce(p_created_at, now()) as ts
  ), cand as (
    select o.id, o.created_at, public.fn_far_overseas_norm_key(o.no_invoice) as inv,
           public.fn_far_overseas_po_keys(o.po_list, o.po_ori) as pos
    from public.rekapan_far_overseas_air o, me
    where o.id <> p_id
      and (o.created_at < me.ts or (o.created_at = me.ts and o.id < p_id))
  )
  select coalesce(array_agg(c.id order by c.created_at), '{}')
  from cand c, me
  where (me.inv <> '' and c.inv = me.inv
         and (cardinality(me.pos) = 0 or cardinality(c.pos) = 0 or me.pos && c.pos))
     or (me.inv = '' and cardinality(me.pos) > 0 and me.pos && c.pos)
$$;
comment on function public.fn_far_overseas_find_duplicates(uuid, text, jsonb, text, timestamptz) is 'beehive:043 memo lebih awal dgn invoice (+PO) sama / PO sama kalau tanpa invoice';
revoke all on function public.fn_far_overseas_find_duplicates(uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;

-- ── E. Trigger otomatis ─────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_auto_fields()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.payment_type is null
     and coalesce(new.payment_type_ai, '') <> 'NON_PO'
     and cardinality(public.fn_far_overseas_po_keys(new.po_list, new.po_ori)) > 0 then
    new.payment_type := 'WITH_PO';
  end if;
  if tg_op = 'INSERT' then
    new.ai_duplicate_of := public.fn_far_overseas_find_duplicates(new.id, new.no_invoice, new.po_list, new.po_ori, new.created_at);
  elsif new.no_invoice is distinct from old.no_invoice
     or new.po_ori is distinct from old.po_ori
     or new.po_list::text is distinct from old.po_list::text then
    new.ai_duplicate_of := public.fn_far_overseas_find_duplicates(new.id, new.no_invoice, new.po_list, new.po_ori, new.created_at);
  end if;
  return new;
end;
$$;
comment on function public.fn_far_overseas_auto_fields() is 'beehive:043 payment type otomatis (ada PO) + deteksi duplikat';
revoke all on function public.fn_far_overseas_auto_fields() from public, anon, authenticated;

drop trigger if exists trg_far_overseas_auto_fields on public.rekapan_far_overseas_air;
create trigger trg_far_overseas_auto_fields
  before insert or update on public.rekapan_far_overseas_air
  for each row execute function public.fn_far_overseas_auto_fields();

-- Data lama.
update public.rekapan_far_overseas_air
   set payment_type = 'WITH_PO'
 where payment_type is null
   and coalesce(payment_type_ai, '') <> 'NON_PO'
   and cardinality(public.fn_far_overseas_po_keys(po_list, po_ori)) > 0;

update public.rekapan_far_overseas_air r
   set ai_duplicate_of = public.fn_far_overseas_find_duplicates(r.id, r.no_invoice, r.po_list, r.po_ori, r.created_at)
 where coalesce(r.approval_status, 'PENDING') in ('PENDING', 'REJECTED');

-- ── F. Konfirmasi temuan AI (+ nama profil) ─────────────────────────────────
create or replace function public.fn_far_overseas_confirm_ai_finding(p_id uuid, p_finding text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_list jsonb;
  v_name text;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;
  if p_finding not in ('OVERCHARGE', 'DUPLICATE', 'UNDERCHARGE') then
    raise exception 'Unknown finding: %', p_finding;
  end if;
  if p_note is null or length(btrim(p_note)) < 5 then
    raise exception 'A note of at least 5 characters is required';
  end if;
  select nullif(btrim(nama), '') into v_name from public.profiles where id = auth.uid();
  update public.rekapan_far_overseas_air
     set ai_findings_confirmed =
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(ai_findings_confirmed, '[]'::jsonb)) e where e->>'finding' <> p_finding), '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('finding', p_finding, 'note', btrim(p_note), 'user_email', auth.email(), 'user_name', v_name, 'at', now()))
   where id = p_id and (approval_status is null or approval_status in ('PENDING', 'REJECTED'))
   returning ai_findings_confirmed into v_list;
  if not found then
    raise exception 'Memo not found or locked (Prepared By already signed)';
  end if;
  insert into public.far_overseas_memo_log (memo_id, action, field, note) values (p_id, 'CONFIRM_AI', p_finding, btrim(p_note));
  return jsonb_build_object('ai_findings_confirmed', v_list);
end;
$$;

-- ── G. Undo konfirmasi ──────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_unconfirm_ai_finding(p_id uuid, p_finding text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_list jsonb;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;
  update public.rekapan_far_overseas_air
     set ai_findings_confirmed =
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(ai_findings_confirmed, '[]'::jsonb)) e where e->>'finding' <> p_finding), '[]'::jsonb)
   where id = p_id and (approval_status is null or approval_status in ('PENDING', 'REJECTED'))
   returning ai_findings_confirmed into v_list;
  if not found then
    raise exception 'Memo not found or locked (Prepared By already signed)';
  end if;
  insert into public.far_overseas_memo_log (memo_id, action, field, note) values (p_id, 'UNCONFIRM_AI', p_finding, null);
  return jsonb_build_object('ai_findings_confirmed', v_list);
end;
$$;
comment on function public.fn_far_overseas_unconfirm_ai_finding(uuid, text) is 'beehive:043 undo konfirmasi temuan AI (sebelum Prepared By sign)';
revoke all on function public.fn_far_overseas_unconfirm_ai_finding(uuid, text) from public, anon;
grant execute on function public.fn_far_overseas_unconfirm_ai_finding(uuid, text) to authenticated;

-- ── H. Syarat Prepared By ───────────────────────────────────────────────────
create or replace function public.fn_far_overseas_prepared_by_blockers(p_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  cv record;
  v_po jsonb;
  v_n int;
  v_qty numeric;
  v_kg_unit boolean;
  v_auto_split boolean;
  v_missing int;
  v_sum numeric;
  v_up jsonb;
  v_exp numeric;
  v_act numeric;
  v_ptype text;
  v_price_confirmed boolean;
  v_out text[] := '{}';
begin
  if not public.has_page_access('direct_loading') then
    raise exception 'Not authorized to view FAR Overseas Air memos';
  end if;
  select * into r from public.rekapan_far_overseas_air where id = p_id;
  if not found then raise exception 'Memo not found: %', p_id; end if;

  v_po := public.fn_far_overseas_as_array(r.po_list);
  v_n := jsonb_array_length(v_po);
  v_qty := public.fn_far_overseas_try_numeric(r.qty::text);
  v_kg_unit := coalesce(nullif(upper(btrim(r.weight_unit::text)), ''), 'KG') like '%KG%';
  v_auto_split := v_n >= 5 and v_kg_unit and v_qty is not null and v_qty > 0 and v_qty <= 1;

  if r.pic_user_id is null then
    v_out := array_append(v_out, 'PIC Shipment is not assigned');
  end if;

  -- 043: memo dgn nomor PO otomatis dianggap With PO (tanpa konfirmasi manual).
  v_ptype := r.payment_type;
  if v_ptype is null and coalesce(r.payment_type_ai, '') <> 'NON_PO'
     and cardinality(public.fn_far_overseas_po_keys(r.po_list, r.po_ori)) > 0 then
    v_ptype := 'WITH_PO';
  end if;

  if v_ptype is null then
    v_out := array_append(v_out, 'Payment type (With PO / Non-PO) is not confirmed');
  elsif v_ptype = 'WITH_PO' and v_n = 0 and coalesce(btrim(r.po_ori), '') = '' then
    v_out := array_append(v_out, 'PO number is required for a With-PO memo');
  elsif v_ptype = 'NON_PO' and (
        r.non_po_kind is null
     or coalesce(btrim(r.non_po_billed_company_code), '') = ''
     or (r.non_po_kind = 'PERSONAL_GOODS' and coalesce(btrim(r.non_po_goods_owner), '') = '')) then
    v_out := array_append(v_out, 'Non-PO data is incomplete (type, goods owner, billed PT)');
  end if;

  if v_n > 1 and not v_auto_split then
    select count(*) filter (where public.fn_far_overseas_try_numeric(e->>'weight_kg') is null),
           coalesce(sum(public.fn_far_overseas_try_numeric(e->>'weight_kg')), 0)
      into v_missing, v_sum
      from jsonb_array_elements(v_po) e;
    if v_missing > 0 then
      v_out := array_append(v_out, format('KG per PO is missing for %s PO(s)', v_missing));
    elsif v_kg_unit and v_qty is not null and abs(v_sum - v_qty) >= 0.0005 then
      v_out := array_append(v_out, format('KG per PO totals %s KG but the memo weight is %s KG', v_sum, v_qty));
    end if;
  end if;

  if v_n > 0 then
    select count(*) filter (where coalesce(btrim(e->>'vessel_raw'), '') = '') into v_missing
      from jsonb_array_elements(v_po) e;
    if v_missing > 0 then
      v_out := array_append(v_out, format('Vessel is missing for %s PO(s)', v_missing));
    end if;
  elsif coalesce(btrim(r.vessel_internal_note), '') = '' then
    v_out := array_append(v_out, 'Vessel is not filled in');
  end if;

  if coalesce(r.total_amount_currency, 'IDR') <> 'IDR' and public.fn_far_overseas_try_numeric(r.kurs_used::text) is null then
    v_out := array_append(v_out, 'FX rate is not filled in');
  end if;

  -- 043: Octagon baru boleh di-approve setelah barang diterima (kecuali Urgent). Tanggal bayar TETAP dari
  -- invoice received date (+14), dihitung di aplikasi. Memo lama: tanggal barang di NOTE 3 (status_note) dianggap terisi.
  -- Teks pesan SAMA dgn GOODS_RECEIVED_BLOCKER di FarOverseasAirHelpers.ts.
  if upper(coalesce(r.ship_via, '')) like '%OCTAGON%'
     and not coalesce(r.is_urgent, false)
     and r.goods_received_date is null
     and coalesce(r.status_note, '') !~ '\d{2}/\d{2}/\d{4}\s*$' then
    v_out := array_append(v_out, 'Goods received date is not filled in (Octagon is approved only after the goods are received)');
  end if;

  -- 043: hanya rujukan ke memo yang masih ada.
  if exists (select 1 from public.rekapan_far_overseas_air o where o.id = any(coalesce(r.ai_duplicate_of, '{}')))
     and not (coalesce(r.ai_findings_confirmed, '[]'::jsonb) @> '[{"finding": "DUPLICATE"}]'::jsonb) then
    v_out := array_append(v_out, 'Possible duplicate is not confirmed');
  end if;

  v_price_confirmed := coalesce(r.ai_findings_confirmed, '[]'::jsonb) @> '[{"finding": "OVERCHARGE"}]'::jsonb
                    or coalesce(r.ai_findings_confirmed, '[]'::jsonb) @> '[{"finding": "UNDERCHARGE"}]'::jsonb;

  select * into cv from public.cost_validasi_far_overseas_air where far_overseas_id = p_id limit 1;
  if not found then
    v_out := array_append(v_out, 'Cost validation is not available yet');
  else
    if cv.status = 'OVERCHARGE' and not (coalesce(r.ai_findings_confirmed, '[]'::jsonb) @> '[{"finding": "OVERCHARGE"}]'::jsonb) then
      v_out := array_append(v_out, 'Overcharge finding is not confirmed');
    end if;
    select e into v_up from jsonb_array_elements(public.fn_far_overseas_as_array(cv.cost_validation)) e
      where e->>'row_key' = 'UNIT_PRICE_DARI_DESCRIPTION' limit 1;
    v_exp := public.fn_far_overseas_try_numeric(v_up->>'expected');
    v_act := public.fn_far_overseas_try_numeric(v_up->>'actual');
    if not (v_exp is not null and v_act is not null and v_exp <> 0 and abs(v_act - v_exp) / abs(v_exp) <= 0.03)
       and coalesce(btrim(cv.notes_manual), '') = ''
       and not v_price_confirmed then
      v_out := array_append(v_out, 'Unit price is not a match — fill in Notes (Manual) in Cost Validation');
    end if;
  end if;

  return v_out;
end;
$$;

-- ── I. Urgent + catatan ─────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_set_urgent(p_id uuid, p_urgent boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  v_urgent boolean := coalesce(p_urgent, false);
  v_note text := case when coalesce(p_urgent, false) then nullif(btrim(coalesce(p_note, '')), '') else null end;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas memos';
  end if;
  if v_urgent and (v_note is null or length(v_note) < 5) then
    raise exception 'Fill in why this memo is urgent (min. 5 characters)';
  end if;
  select id, is_urgent, urgent_note, paid_at into r from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if r.paid_at is not null then raise exception 'This memo is already paid.'; end if;
  if r.is_urgent is not distinct from v_urgent and r.urgent_note is not distinct from v_note then
    return jsonb_build_object('is_urgent', r.is_urgent, 'urgent_note', r.urgent_note);
  end if;
  update public.rekapan_far_overseas_air set is_urgent = v_urgent, urgent_note = v_note where id = p_id;
  if r.is_urgent is distinct from v_urgent then
    insert into public.far_overseas_memo_log (memo_id, action, field, old_value, new_value)
    values (p_id, 'EDIT', 'is_urgent', coalesce(r.is_urgent, false)::text, v_urgent::text);
  end if;
  if r.urgent_note is distinct from v_note then
    insert into public.far_overseas_memo_log (memo_id, action, field, old_value, new_value)
    values (p_id, 'EDIT', 'urgent_note', r.urgent_note, v_note);
  end if;
  return jsonb_build_object('is_urgent', v_urgent, 'urgent_note', v_note);
end;
$$;
comment on function public.fn_far_overseas_set_urgent(uuid, boolean, text) is 'beehive:043 FAR memo urgent + alasan';
revoke all on function public.fn_far_overseas_set_urgent(uuid, boolean, text) from public, anon;
grant execute on function public.fn_far_overseas_set_urgent(uuid, boolean, text) to authenticated;
