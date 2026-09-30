-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 027 — FAR Overseas redesain TAHAP 2 (2026-09-28) — BELUM DIJALANKAN ke production.
--
-- Bagian E ditulis dari body LIVE yang dikirim user (pg_get_functiondef approve/reject/
-- update_rekapan, 2026-09-28) -- signature & return type TIDAK berubah, jadi CREATE OR REPLACE
-- aman (tidak ada overload baru, lihat insiden sql/014).
--
-- SEBELUM MENJALANKAN (aturan CLAUDE.md "Peta RPC"):
--   1. Pastikan belum ada fungsi/tabel dgn nama yang sama (hasil HARUS 0 baris / semua NULL):
--        select proname from pg_proc where proname like 'fn_far_overseas_%';
--        select to_regclass('public.far_overseas_memo_counter'), to_regclass('public.far_overseas_memo_log'),
--               to_regclass('public.far_overseas_step_signers');
--   2. Jalankan SELURUH file sekali (idempotent, aman diulang).
--   3. Bagian G (Storage bukti bayar) OPSIONAL -- hanya kalau Supabase Storage aktif di stack ini.
--   4. `fn_delete_far_overseas_air` BELUM diberi guard lock -- kirim pg_get_functiondef-nya dulu.
--
-- Isi: A kolom baru · B tabel log/counter/penandatangan per PT · C helper · D trigger nomor memo &
--      log upload · E patch RPC lama (approve/reject/update) · F RPC baru (undo, AI finding,
--      reminder, finance) · G storage bukti bayar (opsional).
-- ════════════════════════════════════════════════════════════════════════════════════════════


-- ── A. Kolom baru rekapan_far_overseas_air ───────────────────────────────────────────────────
-- FX memakai kolom LAMA `kurs_used` (sudah ada di whitelist RPC) -- tidak ada kolom fx baru.
alter table public.rekapan_far_overseas_air
  add column if not exists memo_no                     text,
  add column if not exists payment_type                text,        -- WITH_PO | NON_PO (dikonfirmasi user)
  add column if not exists payment_type_ai             text,        -- hasil n8n: WITH_PO | NON_PO | UNSURE
  add column if not exists payment_type_ai_reason      text,
  add column if not exists non_po_kind                 text,        -- PERSONAL_GOODS | PO_TO_FOLLOW
  add column if not exists non_po_goods_owner          text,
  add column if not exists non_po_billed_company_code  text,
  add column if not exists fx_locked_at                timestamptz, -- diisi saat Prepared By sign
  add column if not exists invoice_received_date       date,
  add column if not exists goods_received_date         date,
  add column if not exists due_date                    date,        -- hasil hitung term forwarder (frontend)
  add column if not exists due_date_note               text,        -- "Moved from Sunday 20 Sep to Friday 18 Sep"
  add column if not exists on_hold                     boolean not null default false,
  add column if not exists rejected_step               text,
  add column if not exists rejected_at                 timestamptz,
  add column if not exists ai_duplicate_of             uuid[] not null default '{}',   -- diisi n8n/frontend
  add column if not exists ai_findings_confirmed       jsonb  not null default '[]'::jsonb,
  add column if not exists finance_received_by         text,
  add column if not exists finance_received_at         date,
  add column if not exists finance_received_user_id    uuid,
  add column if not exists paid_at                     date,
  add column if not exists paid_reference              text,
  add column if not exists payment_proof_path          text,        -- path di bucket Storage (bagian G)
  -- 2026-09-30: Prepared By (Exim) ditunjuk per memo (mis. pengganti saat cuti). NULL = semua
  -- user berjabatan TIER1 boleh sign (perilaku lama); terisi = HANYA user ini (fn_far_overseas_can_sign).
  add column if not exists prepared_by_user_id         uuid references public.profiles(id);

do $$ begin
  alter table public.rekapan_far_overseas_air add constraint rekapan_far_payment_type_chk
    check (payment_type is null or payment_type in ('WITH_PO', 'NON_PO'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rekapan_far_overseas_air add constraint rekapan_far_payment_type_ai_chk
    check (payment_type_ai is null or payment_type_ai in ('WITH_PO', 'NON_PO', 'UNSURE'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rekapan_far_overseas_air add constraint rekapan_far_non_po_kind_chk
    check (non_po_kind is null or non_po_kind in ('PERSONAL_GOODS', 'PO_TO_FOLLOW'));
exception when duplicate_object then null; end $$;

create unique index if not exists rekapan_far_overseas_air_memo_no_uq
  on public.rekapan_far_overseas_air (memo_no) where memo_no is not null;


-- ── B. Tabel baru ────────────────────────────────────────────────────────────────────────────
-- B1. Counter nomor memo per bulan -- HANYA disentuh trigger SECURITY DEFINER.
create table if not exists public.far_overseas_memo_counter (
  yymm    text primary key,
  last_no integer not null default 0
);
alter table public.far_overseas_memo_counter enable row level security;
revoke all on public.far_overseas_memo_counter from public, anon, authenticated;

-- B2. Audit trail per memo (append-only dari app; ditulis RPC di bawah).
create table if not exists public.far_overseas_memo_log (
  id          bigint generated always as identity primary key,
  memo_id     uuid not null references public.rekapan_far_overseas_air(id) on delete cascade,
  action      text not null,   -- UPLOAD | EDIT | SIGN | UNDO_SIGN | REJECT | CONFIRM_AI | REMIND | FINANCE_ACCEPT | PAID
  field       text,
  old_value   text,
  new_value   text,
  note        text,
  user_id     uuid default auth.uid(),
  user_email  text default auth.email(),
  created_at  timestamptz not null default now()
);
create index if not exists far_overseas_memo_log_memo_idx on public.far_overseas_memo_log (memo_id, created_at desc);
alter table public.far_overseas_memo_log enable row level security;
drop policy if exists far_overseas_memo_log_select on public.far_overseas_memo_log;
drop policy if exists far_overseas_memo_log_insert on public.far_overseas_memo_log;
drop policy if exists far_overseas_memo_log_update on public.far_overseas_memo_log;
drop policy if exists far_overseas_memo_log_delete on public.far_overseas_memo_log;
create policy far_overseas_memo_log_select on public.far_overseas_memo_log
  for select using (public.has_page_access('direct_loading'));
create policy far_overseas_memo_log_insert on public.far_overseas_memo_log
  for insert with check (public.has_edit_access('direct_loading') and user_id = auth.uid());
create policy far_overseas_memo_log_update on public.far_overseas_memo_log
  for update using (false) with check (false);
create policy far_overseas_memo_log_delete on public.far_overseas_memo_log
  for delete using (false);
revoke all on public.far_overseas_memo_log from anon;

-- B3. Penandatangan tahap 3/4 PER PT (spek: Director per PT; rantai IMI tahap 3 = Custom
--     Officer, tahap 4 = Exim SPV). Kalau PT memo PUNYA baris di sini utk tahap itu, HANYA user
--     yang terdaftar yang boleh sign; kalau tidak ada baris, fallback ke jabatan global
--     `user_approval_tiers` (perilaku lama). Label jabatan cetak tetap dari
--     `far_overseas_signer_config.tier2_role/tier3_role` (utk IMI isi "CUSTOM OFFICER"/"EXIM SPV").
create table if not exists public.far_overseas_step_signers (
  company_code text not null,
  step         text not null check (step in ('TIER2', 'TIER3')),
  user_id      uuid not null,
  primary key (company_code, step, user_id)
);
alter table public.far_overseas_step_signers enable row level security;
drop policy if exists far_overseas_step_signers_select on public.far_overseas_step_signers;
drop policy if exists far_overseas_step_signers_insert on public.far_overseas_step_signers;
drop policy if exists far_overseas_step_signers_update on public.far_overseas_step_signers;
drop policy if exists far_overseas_step_signers_delete on public.far_overseas_step_signers;
create policy far_overseas_step_signers_select on public.far_overseas_step_signers
  for select using (public.has_page_access('direct_loading'));
create policy far_overseas_step_signers_insert on public.far_overseas_step_signers
  for insert with check (public.is_admin());
create policy far_overseas_step_signers_update on public.far_overseas_step_signers
  for update using (public.is_admin()) with check (public.is_admin());
create policy far_overseas_step_signers_delete on public.far_overseas_step_signers
  for delete using (public.is_admin());
revoke all on public.far_overseas_step_signers from anon;


-- ── C. Helper ────────────────────────────────────────────────────────────────────────────────
-- C1. jsonb -> array, tahan data double-encoded string (pola parseJsonField di frontend).
create or replace function public.fn_far_overseas_as_array(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
begin
  if p is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p) = 'array' then return p; end if;
  if jsonb_typeof(p) = 'string' then
    begin
      p := (p #>> '{}')::jsonb;
      if jsonb_typeof(p) = 'array' then return p; end if;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;
  return '[]'::jsonb;
end;
$$;

-- C2. text -> numeric tanpa error.
create or replace function public.fn_far_overseas_try_numeric(p text)
returns numeric
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return btrim(p)::numeric;
exception when others then
  return null;
end;
$$;

-- C3. Boleh sign/reject tahap ini? SATU-SATUNYA aturan eligibility (dipakai approve, reject,
--     dan boleh dipanggil frontend). PIC = assignment per memo; TIER2/TIER3 = penandatangan per
--     PT kalau diatur (B3), else jabatan global; TIER1 = `prepared_by_user_id` kalau diisi, else
--     jabatan global. TANPA bypass Admin.
create or replace function public.fn_far_overseas_can_sign(p_id uuid, p_step text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company text;
  v_pic uuid;
  v_prep uuid;
begin
  if auth.uid() is null then return false; end if;
  select dominant_company_code, pic_user_id, prepared_by_user_id into v_company, v_pic, v_prep
    from public.rekapan_far_overseas_air where id = p_id;
  if not found then return false; end if;
  if p_step = 'PIC' then
    return v_pic is not null and v_pic = auth.uid();
  end if;
  if p_step = 'TIER1' and v_prep is not null then
    return v_prep = auth.uid();
  end if;
  if p_step in ('TIER2', 'TIER3') and v_company is not null
     and exists (select 1 from public.far_overseas_step_signers s where s.company_code = v_company and s.step = p_step) then
    return exists (select 1 from public.far_overseas_step_signers s where s.company_code = v_company and s.step = p_step and s.user_id = auth.uid());
  end if;
  return exists (
    select 1 from public.user_approval_tiers uat
    where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = p_step
  );
end;
$$;

-- C4. Daftar alasan Prepared By BELUM boleh sign (array kosong = boleh). SATU-SATUNYA sumber
--     syarat spek -- dipanggil approve (TIER1) DAN boleh dipanggil frontend utk pesan yang sama.
--     Toleransi unit price 3% = `computeCostStatus()` frontend.
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

  if r.payment_type is null then
    v_out := array_append(v_out, 'Payment type (With PO / Non-PO) is not confirmed');
  elsif r.payment_type = 'WITH_PO' and v_n = 0 and coalesce(btrim(r.po_ori), '') = '' then
    v_out := array_append(v_out, 'PO number is required for a With-PO memo');
  elsif r.payment_type = 'NON_PO' and (
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

  if cardinality(r.ai_duplicate_of) > 0 and not (r.ai_findings_confirmed @> '[{"finding": "DUPLICATE"}]'::jsonb) then
    v_out := array_append(v_out, 'Possible duplicate is not confirmed');
  end if;

  select * into cv from public.cost_validasi_far_overseas_air where far_overseas_id = p_id limit 1;
  if not found then
    v_out := array_append(v_out, 'Cost validation is not available yet');
  else
    if cv.status = 'OVERCHARGE' and not (r.ai_findings_confirmed @> '[{"finding": "OVERCHARGE"}]'::jsonb) then
      v_out := array_append(v_out, 'Overcharge finding is not confirmed');
    end if;
    select e into v_up from jsonb_array_elements(public.fn_far_overseas_as_array(cv.cost_validation)) e
      where e->>'row_key' = 'UNIT_PRICE_DARI_DESCRIPTION' limit 1;
    v_exp := public.fn_far_overseas_try_numeric(v_up->>'expected');
    v_act := public.fn_far_overseas_try_numeric(v_up->>'actual');
    if not (v_exp is not null and v_act is not null and v_exp <> 0 and abs(v_act - v_exp) / abs(v_exp) <= 0.03)
       and coalesce(btrim(cv.notes_manual), '') = '' then
      v_out := array_append(v_out, 'Unit price is not a match — fill in Notes (Manual) in Cost Validation');
    end if;
  end if;

  return v_out;
end;
$$;

-- C5. Ringkasan po_list yang bisa dibaca manusia utk log ("PO: 0.8 KG / KM A + ...").
create or replace function public.fn_far_overseas_po_summary(p jsonb)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select string_agg(format('%s: %s KG / %s', coalesce(e->>'po_no_raw', '?'), coalesce(e->>'weight_kg', '—'), coalesce(nullif(e->>'vessel_raw', ''), '—')), ' + ')
  from jsonb_array_elements(public.fn_far_overseas_as_array(p)) e
$$;

revoke all on function public.fn_far_overseas_as_array(jsonb) from public, anon, authenticated;
revoke all on function public.fn_far_overseas_try_numeric(text) from public, anon, authenticated;
revoke all on function public.fn_far_overseas_po_summary(jsonb) from public, anon, authenticated;
revoke all on function public.fn_far_overseas_can_sign(uuid, text) from public, anon;
grant execute on function public.fn_far_overseas_can_sign(uuid, text) to authenticated;
revoke all on function public.fn_far_overseas_prepared_by_blockers(uuid) from public, anon;
grant execute on function public.fn_far_overseas_prepared_by_blockers(uuid) to authenticated;


-- ── D. Trigger: nomor memo FAR/YYMM/NNN + log UPLOAD ─────────────────────────────────────────
-- YYMM dari TANGGAL UPLOAD (created_at, Asia/Jakarta), urut 001 per bulan sesuai urutan insert.
create or replace function public.fn_far_overseas_assign_memo_no()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_yymm text;
  v_no   integer;
begin
  if new.memo_no is not null then return new; end if;
  v_yymm := to_char(coalesce(new.created_at, now()) at time zone 'Asia/Jakarta', 'YYMM');
  insert into public.far_overseas_memo_counter as c (yymm, last_no) values (v_yymm, 1)
    on conflict (yymm) do update set last_no = c.last_no + 1
    returning last_no into v_no;
  new.memo_no := 'FAR/' || v_yymm || '/' || lpad(v_no::text, 3, '0');
  return new;
end;
$$;

create or replace function public.fn_far_overseas_log_upload()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.far_overseas_memo_log (memo_id, action, note)
  values (new.id, 'UPLOAD', coalesce(new.memo_no, '') || case when auth.uid() is null then ' · uploaded & checked by AI' else ' · manual entry' end);
  return new;
end;
$$;
revoke all on function public.fn_far_overseas_assign_memo_no() from public, anon, authenticated;
revoke all on function public.fn_far_overseas_log_upload() from public, anon, authenticated;

drop trigger if exists trg_far_overseas_assign_memo_no on public.rekapan_far_overseas_air;
create trigger trg_far_overseas_assign_memo_no
  before insert on public.rekapan_far_overseas_air
  for each row execute function public.fn_far_overseas_assign_memo_no();
drop trigger if exists trg_far_overseas_log_upload on public.rekapan_far_overseas_air;
create trigger trg_far_overseas_log_upload
  after insert on public.rekapan_far_overseas_air
  for each row execute function public.fn_far_overseas_log_upload();

-- Backfill nomor utk memo LAMA (sekali, idempotent -- hanya baris memo_no NULL, urut upload).
with ordered as (
  select id,
         to_char(created_at at time zone 'Asia/Jakarta', 'YYMM') as yymm,
         row_number() over (partition by to_char(created_at at time zone 'Asia/Jakarta', 'YYMM') order by created_at, id) as n
  from public.rekapan_far_overseas_air where memo_no is null
), base as (
  select yymm, coalesce((select last_no from public.far_overseas_memo_counter c where c.yymm = o.yymm), 0) as start_no
  from (select distinct yymm from ordered) o
)
update public.rekapan_far_overseas_air r
   set memo_no = 'FAR/' || o.yymm || '/' || lpad((b.start_no + o.n)::text, 3, '0')
  from ordered o join base b on b.yymm = o.yymm
 where o.id = r.id;
insert into public.far_overseas_memo_counter (yymm, last_no)
  select substr(memo_no, 5, 4), max(substr(memo_no, 10)::int)
  from public.rekapan_far_overseas_air where memo_no like 'FAR/____/%'
  group by 1
on conflict (yymm) do update set last_no = greatest(public.far_overseas_memo_counter.last_no, excluded.last_no);


-- ── E. PATCH RPC LAMA (dari body live 2026-09-28; signature & return type SAMA) ──────────────

-- E1. approve -- PERUBAHAN vs live:
--   * eligibility lewat fn_far_overseas_can_sign (tambah penandatangan per PT, B3)
--   * TIER1 menerima status PENDING / NULL / REJECTED (live: hanya PENDING -> memo yang
--     di-reject TIDAK PERNAH bisa ditandatangani ulang)
--   * TIER1 wajib lolos fn_far_overseas_prepared_by_blockers (syarat spek)
--   * TIER1 me-reset approvals ke entri barunya saja (buang sisa tanda tangan dari putaran lama)
--   * TIER1 mengisi fx_locked_at; setiap sign dicatat di far_overseas_memo_log
create or replace function public.approve_far_overseas_air(p_id uuid, p_step text, p_nama text, p_jabatan text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_current_status text;
  v_new_status text;
  v_entry_tier_text text;
  v_entry jsonb;
  v_new_approvals jsonb;
  v_blockers text[];
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;

  if p_step not in ('TIER1', 'PIC', 'TIER2', 'TIER3') then
    raise exception 'Invalid approval step: %', p_step;
  end if;

  select approval_status into v_current_status
  from public.rekapan_far_overseas_air
  where id = p_id
  for update;

  if not found then
    raise exception 'Memo not found: %', p_id;
  end if;

  if not public.fn_far_overseas_can_sign(p_id, p_step) then
    if p_step = 'PIC' then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
    raise exception 'You do not have the % approval role for this memo', p_step;
  end if;

  if not (
       (p_step = 'TIER1' and (v_current_status is null or v_current_status in ('PENDING', 'REJECTED')))
    or (p_step = 'PIC'   and v_current_status = 'TIER1_DONE')
    or (p_step = 'TIER2' and v_current_status = 'PIC_DONE')
    or (p_step = 'TIER3' and v_current_status = 'TIER2_DONE')
  ) then
    raise exception 'This memo is not currently awaiting the % step (current status: %)', p_step, v_current_status;
  end if;

  if p_step = 'TIER1' then
    v_blockers := public.fn_far_overseas_prepared_by_blockers(p_id);
    if cardinality(v_blockers) > 0 then
      raise exception 'Cannot sign yet: %', array_to_string(v_blockers, '; ');
    end if;
  end if;

  v_new_status := case p_step
    when 'TIER1' then 'TIER1_DONE'
    when 'PIC' then 'PIC_DONE'
    when 'TIER2' then 'TIER2_DONE'
    when 'TIER3' then 'APPROVED'
  end;

  v_entry_tier_text := case p_step when 'PIC' then 'PIC' when 'TIER1' then '1' when 'TIER2' then '2' when 'TIER3' then '3' end;

  v_entry := case p_step
    when 'PIC' then jsonb_build_object('tier', 'PIC', 'nama', p_nama, 'jabatan', 'PIC', 'approved_at', now(), 'user_email', auth.email())
    when 'TIER1' then jsonb_build_object('tier', 1, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
    when 'TIER2' then jsonb_build_object('tier', 2, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
    when 'TIER3' then jsonb_build_object('tier', 3, 'nama', p_nama, 'jabatan', coalesce(p_jabatan, '-'), 'approved_at', now(), 'user_email', auth.email())
  end;

  if p_step = 'TIER1' then
    v_new_approvals := jsonb_build_array(v_entry);
  else
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_new_approvals
    from jsonb_array_elements(
      coalesce((select approvals from public.rekapan_far_overseas_air where id = p_id), '[]'::jsonb)
    ) elem
    where (elem->>'tier') is distinct from v_entry_tier_text;
    v_new_approvals := v_new_approvals || jsonb_build_array(v_entry);
  end if;

  update public.rekapan_far_overseas_air
  set approval_status = v_new_status,
      approvals = v_new_approvals,
      fx_locked_at = case when p_step = 'TIER1' then now() else fx_locked_at end
  where id = p_id;

  insert into public.far_overseas_memo_log (memo_id, action, field, note)
  values (p_id, 'SIGN', p_step, coalesce(p_nama, '') || ' · ' || coalesce(v_current_status, 'PENDING') || ' -> ' || v_new_status);

  return jsonb_build_object('approval_status', v_new_status, 'approvals', v_new_approvals);
end;
$function$;

-- E2. reject -- PERUBAHAN vs live:
--   * eligibility lewat fn_far_overseas_can_sign
--   * alasan minimal 5 karakter (spek)
--   * SEMUA tanda tangan dihapus (approvals = []), rejected_step/rejected_at diisi, kurs dibuka
--     lagi (fx_locked_at = null) -> memo kembali ke Prepared By; dicatat di log
create or replace function public.reject_far_overseas_air(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_current_status text;
  v_next_step text;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Rejection reason must be at least 5 characters';
  end if;

  select approval_status into v_current_status
  from public.rekapan_far_overseas_air
  where id = p_id
  for update;

  if not found then
    raise exception 'Memo not found: %', p_id;
  end if;

  if v_current_status in ('APPROVED', 'REJECTED') then
    raise exception 'This memo cannot be rejected (current status: %)', v_current_status;
  end if;

  v_next_step := case coalesce(v_current_status, 'PENDING')
    when 'PENDING' then 'TIER1'
    when 'TIER1_DONE' then 'PIC'
    when 'PIC_DONE' then 'TIER2'
    when 'TIER2_DONE' then 'TIER3'
  end;

  if v_next_step is null then
    raise exception 'Unknown approval status: %', v_current_status;
  end if;

  if not public.fn_far_overseas_can_sign(p_id, v_next_step) then
    if v_next_step = 'PIC' then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
    raise exception 'You do not have the % approval role for this step', v_next_step;
  end if;

  update public.rekapan_far_overseas_air
  set approval_status = 'REJECTED',
      notes = btrim(p_reason),
      approvals = '[]'::jsonb,
      rejected_step = v_next_step,
      rejected_at = now(),
      fx_locked_at = null
  where id = p_id;

  insert into public.far_overseas_memo_log (memo_id, action, field, note)
  values (p_id, 'REJECT', v_next_step, btrim(p_reason));

  return jsonb_build_object('approval_status', 'REJECTED', 'notes', btrim(p_reason), 'approvals', '[]'::jsonb, 'rejected_step', v_next_step);
end;
$function$;

-- E3. update_rekapan_far_overseas_manual -- PERUBAHAN vs live:
--   * whitelist + kolom baru bagian A yang boleh diedit user (payment_type, non_po_*,
--     invoice_received_date, goods_received_date, due_date, due_date_note, on_hold)
--   * LOCK: setelah Prepared By sign (TIER1_DONE/PIC_DONE/TIER2_DONE/APPROVED) hanya kolom
--     `v_after_sign_columns` yang boleh berubah (tanggal barang diterima & NOTE 3 turunannya,
--     due/on hold) -- selain itu DITOLAK dgn error (bukan dilewati diam-diam). REJECTED bebas.
--   * memo tidak ditemukan -> error (live: diam-diam return NULL)
--   * setiap field yang BENAR-BENAR berubah dicatat old -> new di far_overseas_memo_log
--     (po_list diringkas "PO: KG / vessel")
--   * perilaku lain (cast jsonb utk po_list/dokumen_urls, edited_fields, is_edited, updated_at,
--     RAISE WARNING utk kolom tak dikenal) SAMA PERSIS dgn live
create or replace function public.update_rekapan_far_overseas_manual(p_id uuid, p_updates jsonb)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_key              text;
  v_allowed_columns  text[] := array[
    'po_list', 'po_ori', 'dominant_company_code', 'vendor', 'ship_via',
    'no_invoice', 'invoice_date', 'departure_date', 'qty', 'weight_unit', 'unit_price',
    'unit_price_currency', 'freight_amount', 'clearance_amount', 'other_amount',
    'clearance_other_total', 'total_amount', 'total_amount_currency', 'kurs_used',
    'total_amount_idr', 'route_note', 'shipment_mode', 'origin_country',
    'destination_city', 'item_description', 'item_description_manual', 'status_note', 'other_note',
    'memo_title', 'expected_payment_date', 'vessel_internal_note', 'notes',
    'buyer_name', 'weight_breakdown', 'pic_name', 'pic_user_id', 'dokumen_urls',
    -- tahap 2
    'payment_type', 'non_po_kind', 'non_po_goods_owner', 'non_po_billed_company_code',
    'invoice_received_date', 'goods_received_date', 'due_date', 'due_date_note', 'on_hold',
    -- 2026-09-30
    'prepared_by_user_id'
  ];
  v_after_sign_columns text[] := array['goods_received_date', 'status_note', 'due_date', 'due_date_note', 'on_hold'];
  v_status           text;
  v_locked           boolean;
  v_current_edited   jsonb;
  v_old              text;
  v_new              text;
  result             json;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) != 'object' then
    raise exception 'p_updates harus berupa JSON object, contoh: {"vendor": "PT Baru", "unit_price": 220000}';
  end if;

  select coalesce(edited_fields, '[]'::jsonb), approval_status into v_current_edited, v_status
  from rekapan_far_overseas_air where id = p_id
  for update;

  if not found then
    raise exception 'Memo not found: %', p_id;
  end if;

  v_locked := v_status in ('TIER1_DONE', 'PIC_DONE', 'TIER2_DONE', 'APPROVED');
  if v_locked then
    for v_key in select jsonb_object_keys(p_updates) loop
      if v_key = any(v_allowed_columns) and not (v_key = any(v_after_sign_columns)) then
        raise exception 'Memo is locked after Prepared By signed — "%" cannot be changed (undo the sign or reject it first)', v_key;
      end if;
    end loop;
  end if;

  if v_current_edited is null then
    v_current_edited := '[]'::jsonb;
  end if;

  for v_key in select jsonb_object_keys(p_updates)
  loop
    if v_key = any(v_allowed_columns) then
      if v_key in ('po_list', 'dokumen_urls') then
        if v_key = 'po_list' then
          select public.fn_far_overseas_po_summary(po_list) into v_old from rekapan_far_overseas_air where id = p_id;
        else
          select dokumen_urls::text into v_old from rekapan_far_overseas_air where id = p_id;
        end if;
        execute format(
          'update rekapan_far_overseas_air set %I = %L::jsonb where id = %L',
          v_key, (p_updates->v_key)::text, p_id
        );
        v_new := case when v_key = 'po_list' then public.fn_far_overseas_po_summary(p_updates->v_key) else (p_updates->v_key)::text end;
      else
        execute format('select %I::text from rekapan_far_overseas_air where id = %L', v_key, p_id) into v_old;
        execute format(
          'update rekapan_far_overseas_air set %I = %L where id = %L',
          v_key, p_updates->>v_key, p_id
        );
        execute format('select %I::text from rekapan_far_overseas_air where id = %L', v_key, p_id) into v_new;
      end if;

      if v_old is distinct from v_new then
        insert into public.far_overseas_memo_log (memo_id, action, field, old_value, new_value)
        values (p_id, 'EDIT', v_key, left(v_old, 2000), left(v_new, 2000));
      end if;

      if not (v_current_edited ? v_key) then
        v_current_edited := v_current_edited || to_jsonb(array[v_key]);
      end if;
    else
      raise warning 'Kolom "%" tidak diizinkan diedit lewat RPC ini, dilewati.', v_key;
    end if;
  end loop;

  update rekapan_far_overseas_air
  set edited_fields = v_current_edited,
      is_edited      = true,
      updated_at      = now()
  where id = p_id
  returning to_json(rekapan_far_overseas_air.*) into result;

  return result;
end;
$function$;


-- ── F. RPC BARU ──────────────────────────────────────────────────────────────────────────────

-- F1. Undo last sign -- HANYA user yang tanda tangan terakhir; ditolak setelah Finance terima.
create or replace function public.fn_far_overseas_undo_last_sign(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text;
  v_approvals jsonb;
  v_finance date;
  v_last jsonb;
  v_new_status text;
  v_new_approvals jsonb;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;
  select approval_status, coalesce(approvals, '[]'::jsonb), finance_received_at
    into v_status, v_approvals, v_finance
    from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if v_status is null or v_status in ('PENDING', 'REJECTED') then
    raise exception 'Nothing to undo (status: %)', coalesce(v_status, 'PENDING');
  end if;
  if v_finance is not null then
    raise exception 'Finance has already received this memo — undo is not allowed';
  end if;
  select e into v_last from jsonb_array_elements(v_approvals) e
   where (e->>'tier') = case v_status when 'TIER1_DONE' then '1' when 'PIC_DONE' then 'PIC'
                                       when 'TIER2_DONE' then '2' when 'APPROVED' then '3' end
   limit 1;
  if v_last is null or (v_last->>'user_email') is distinct from auth.email() then
    raise exception 'Only the person who signed last can undo it';
  end if;
  v_new_status := case v_status when 'TIER1_DONE' then 'PENDING' when 'PIC_DONE' then 'TIER1_DONE'
                                when 'TIER2_DONE' then 'PIC_DONE' when 'APPROVED' then 'TIER2_DONE' end;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_new_approvals
    from jsonb_array_elements(v_approvals) e where e is distinct from v_last;
  update public.rekapan_far_overseas_air
     set approval_status = v_new_status,
         approvals = v_new_approvals,
         fx_locked_at = case when v_new_status = 'PENDING' then null else fx_locked_at end
   where id = p_id;
  insert into public.far_overseas_memo_log (memo_id, action, note) values (p_id, 'UNDO_SIGN', v_status || ' -> ' || v_new_status);
  return jsonb_build_object('approval_status', v_new_status, 'approvals', v_new_approvals);
end;
$$;

-- F2. Konfirmasi temuan AI (OVERCHARGE / DUPLICATE / UNDERCHARGE) + catatan wajib (min 5).
create or replace function public.fn_far_overseas_confirm_ai_finding(p_id uuid, p_finding text, p_note text)
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
  if p_finding not in ('OVERCHARGE', 'DUPLICATE', 'UNDERCHARGE') then
    raise exception 'Unknown finding: %', p_finding;
  end if;
  if p_note is null or length(btrim(p_note)) < 5 then
    raise exception 'A note of at least 5 characters is required';
  end if;
  update public.rekapan_far_overseas_air
     set ai_findings_confirmed =
           coalesce((select jsonb_agg(e) from jsonb_array_elements(ai_findings_confirmed) e where e->>'finding' <> p_finding), '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('finding', p_finding, 'note', btrim(p_note), 'user_email', auth.email(), 'at', now()))
   where id = p_id and (approval_status is null or approval_status in ('PENDING', 'REJECTED'))
   returning ai_findings_confirmed into v_list;
  if not found then
    raise exception 'Memo not found or locked (Prepared By already signed)';
  end if;
  insert into public.far_overseas_memo_log (memo_id, action, field, note) values (p_id, 'CONFIRM_AI', p_finding, btrim(p_note));
  return jsonb_build_object('ai_findings_confirmed', v_list);
end;
$$;

-- F3. Catat pengingat approval (spek: "setiap pengingat tercatat di audit trail"). Pengiriman
--     notifikasi sungguhan (email/WA) BELUM ada -- fungsi ini HANYA mencatat.
create or replace function public.fn_far_overseas_log_reminder(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text;
  v_step text;
begin
  if not public.has_page_access('direct_loading') then
    raise exception 'Not authorized to view FAR Overseas Air memos';
  end if;
  select approval_status into v_status from public.rekapan_far_overseas_air where id = p_id;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  v_step := case coalesce(v_status, 'PENDING') when 'PENDING' then 'TIER1' when 'TIER1_DONE' then 'PIC'
                 when 'PIC_DONE' then 'TIER2' when 'TIER2_DONE' then 'TIER3' end;
  if v_step is null then raise exception 'Memo is not waiting for anyone (status: %)', v_status; end if;
  insert into public.far_overseas_memo_log (memo_id, action, field, note) values (p_id, 'REMIND', v_step, nullif(btrim(coalesce(p_note, '')), ''));
  return jsonb_build_object('reminded_step', v_step);
end;
$$;

-- F4. Finance: Accept. Butuh page_key BARU `far_overseas_finance` (PAGE_REGISTRY frontend +
--     role_page_access). Role Finance JUGA butuh akses lihat `direct_loading` (RLS tabel memo).
create or replace function public.fn_far_overseas_finance_accept(p_id uuid, p_receiver_name text, p_received_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.has_edit_access('far_overseas_finance') then
    raise exception 'Not authorized for FAR Overseas Finance';
  end if;
  if p_receiver_name is null or btrim(p_receiver_name) = '' or p_received_date is null then
    raise exception 'Receiver name and date are required';
  end if;
  update public.rekapan_far_overseas_air
     set finance_received_by = btrim(p_receiver_name), finance_received_at = p_received_date, finance_received_user_id = auth.uid()
   where id = p_id and approval_status = 'APPROVED' and finance_received_at is null;
  if not found then raise exception 'Memo is not approved or was already accepted'; end if;
  insert into public.far_overseas_memo_log (memo_id, action, note) values (p_id, 'FINANCE_ACCEPT', btrim(p_receiver_name) || ' · ' || p_received_date::text);
  return jsonb_build_object('finance_received_by', btrim(p_receiver_name), 'finance_received_at', p_received_date);
end;
$$;

-- F5. Finance: Mark paid -- tanggal transfer & bukti bayar WAJIB, referensi opsional.
create or replace function public.fn_far_overseas_mark_paid(p_id uuid, p_paid_date date, p_proof_path text, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.has_edit_access('far_overseas_finance') then
    raise exception 'Not authorized for FAR Overseas Finance';
  end if;
  if p_paid_date is null or p_proof_path is null or btrim(p_proof_path) = '' then
    raise exception 'Transfer date and payment proof are required';
  end if;
  update public.rekapan_far_overseas_air
     set paid_at = p_paid_date,
         paid_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         payment_proof_path = btrim(p_proof_path)
   where id = p_id and finance_received_at is not null and paid_at is null;
  if not found then raise exception 'Memo must be accepted by Finance first (or is already paid)'; end if;
  insert into public.far_overseas_memo_log (memo_id, action, note)
  values (p_id, 'PAID', p_paid_date::text || coalesce(' · ' || nullif(btrim(coalesce(p_reference, '')), ''), ''));
  return jsonb_build_object('paid_at', p_paid_date, 'payment_proof_path', btrim(p_proof_path));
end;
$$;

revoke all on function public.fn_far_overseas_undo_last_sign(uuid) from public, anon;
grant execute on function public.fn_far_overseas_undo_last_sign(uuid) to authenticated;
revoke all on function public.fn_far_overseas_confirm_ai_finding(uuid, text, text) from public, anon;
grant execute on function public.fn_far_overseas_confirm_ai_finding(uuid, text, text) to authenticated;
revoke all on function public.fn_far_overseas_log_reminder(uuid, text) from public, anon;
grant execute on function public.fn_far_overseas_log_reminder(uuid, text) to authenticated;
revoke all on function public.fn_far_overseas_finance_accept(uuid, text, date) from public, anon;
grant execute on function public.fn_far_overseas_finance_accept(uuid, text, date) to authenticated;
revoke all on function public.fn_far_overseas_mark_paid(uuid, date, text, text) from public, anon;
grant execute on function public.fn_far_overseas_mark_paid(uuid, date, text, text) to authenticated;
-- Pastikan RPC lama tetap bisa dipanggil (CREATE OR REPLACE mempertahankan grant, ini jaga2).
grant execute on function public.approve_far_overseas_air(uuid, text, text, text) to authenticated;
grant execute on function public.reject_far_overseas_air(uuid, text) to authenticated;
grant execute on function public.update_rekapan_far_overseas_manual(uuid, jsonb) to authenticated;


-- ── G. OPSIONAL — Supabase Storage utk bukti bayar (jalankan HANYA kalau Storage aktif) ─────
-- insert into storage.buckets (id, name, public)
--   values ('far-overseas-payment-proofs', 'far-overseas-payment-proofs', false)
--   on conflict (id) do nothing;
-- drop policy if exists far_proof_select on storage.objects;
-- drop policy if exists far_proof_insert on storage.objects;
-- create policy far_proof_select on storage.objects for select to authenticated
--   using (bucket_id = 'far-overseas-payment-proofs' and public.has_page_access('direct_loading'));
-- create policy far_proof_insert on storage.objects for insert to authenticated
--   with check (bucket_id = 'far-overseas-payment-proofs' and public.has_edit_access('far_overseas_finance'));
