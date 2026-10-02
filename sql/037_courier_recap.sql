-- 037 -- Invoice Recap Courier per AWB + re-audit otomatis + Finance Handover Courier (2026-10-02)
-- Keputusan user (CLAUDE.md "Rombak Invoice Recap Courier"): kartu per AWB (pagination di DB = opsi B),
-- re-audit otomatis, Finance Handover Courier per INVOICE (Sent = submit_date, Received = kolom baru,
-- Paid = tgl_lunas yang sudah ada), master vendor Courier baru (TOP), TANPA kunci & TANPA syarat submit.
-- Idempotent (aman dijalankan ulang). Pre-check membatalkan kalau ada fungsi bernama sama yang BUKAN
-- buatan file ini (tanpa komentar 'beehive:037').
-- Penulis service (n8n / SQL Editor, auth.email() IS NULL) TIDAK memicu re-audit.

-- ── 0. Pre-check nama ───────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.proname, obj_description(p.oid, 'pg_proc') as c
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'fn_courier_awb_norm', 'fn_courier_recap_awb_page', 'fn_courier_recap_summary', 'fn_courier_reaudit',
      'fn_courier_reaudit_clear', 'fn_courier_finance_accept', 'fn_courier_finance_mark_paid')
  loop
    if coalesce(r.c, '') not like 'beehive:037%' then
      raise exception 'Fungsi % sudah ada & bukan dari sql/037 -- hentikan, konsultasikan dulu.', r.proname;
    end if;
  end loop;
end $$;

-- ── A. Kolom baru ──────────────────────────────────────────────────────────────────────────────
alter table public.rekapan_courier add column if not exists finance_received_at date;
alter table public.rekapan_courier add column if not exists finance_received_by text;
alter table public.rekapan_courier add column if not exists paid_reference text;
alter table public.rekapan_courier add column if not exists paid_by text;
alter table public.tabel_audit_pib add column if not exists reaudit_reason text;
alter table public.tabel_audit_pib add column if not exists reaudit_at timestamptz;
alter table public.tabel_audit_cn add column if not exists reaudit_reason text;
alter table public.tabel_audit_cn add column if not exists reaudit_at timestamptz;

-- ── B. Normalisasi AWB (huruf besar, buang prefix "DHL NO." / "FEDEX No." / "EMSNO." dst, sisakan A-Z0-9) ──
create or replace function public.fn_courier_awb_norm(p text)
returns text language sql immutable
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(regexp_replace(upper(coalesce(p, '')), '^[A-Z]+\s*NO\.?\s*:?\s*', ''), '[^A-Z0-9]', '', 'g'), '')
$$;
comment on function public.fn_courier_awb_norm(text) is 'beehive:037 normalisasi AWB Courier';
revoke execute on function public.fn_courier_awb_norm(text) from public, anon;
grant execute on function public.fn_courier_awb_norm(text) to authenticated;

create index if not exists idx_rekapan_courier_awb_norm on public.rekapan_courier (public.fn_courier_awb_norm(awb));
create index if not exists idx_audit_pib_awb_norm on public.tabel_audit_pib (public.fn_courier_awb_norm(awb));
create index if not exists idx_audit_cn_awb_norm on public.tabel_audit_cn (public.fn_courier_awb_norm(awb));

-- ── C. Daftar kartu per AWB (SECURITY INVOKER -> RLS rekapan_courier tetap berlaku) ───────────────
-- Filter: p_ppjk = tab PPJK (ilike, sama tabel lama: "DHL" ikut "OWN DHL") -> kartu hanya berisi invoice
-- PPJK itu. Company/tanggal email/search menentukan AWB mana yang tampil; kartu tetap memuat SEMUA invoice
-- AWB itu (dalam tab PPJK). Urut: tanggal email terbaru per AWB, lalu created_at terbaru.
-- Hasil: { total: n, groups: [{ awb: <kunci>, ids: [uuid...] }] }. AWB kosong -> kartu sendiri per baris.
create or replace function public.fn_courier_recap_awb_page(
  p_ppjk text default null, p_an text default null, p_from date default null, p_to date default null,
  p_search text default null, p_search_cols text[] default null, p_offset int default 0, p_limit int default 12)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_cols text[] := coalesce(p_search_cols, array['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
  v_pat text := '%' || coalesce(p_search, '') || '%';
  v jsonb;
begin
  with b as (
    select r.id, r.created_at, r.tgl_terima_email,
           coalesce(public.fn_courier_awb_norm(r.awb), 'ID:' || r.id::text) as k,
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
  ), g as (
    select k, array_agg(id order by created_at, id) as ids, max(tgl_terima_email) as last_email, max(created_at) as last_created
    from b group by k having bool_or(hit)
  ), pg as (
    select * from g order by last_email desc nulls last, last_created desc, k offset greatest(p_offset, 0) limit greatest(p_limit, 1)
  )
  select jsonb_build_object(
    'total', (select count(*) from g),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('awb', k, 'ids', to_jsonb(ids)) order by last_email desc nulls last, last_created desc, k) from pg), '[]'::jsonb)
  ) into v;
  return v;
end $$;
comment on function public.fn_courier_recap_awb_page(text, text, date, date, text, text[], int, int) is 'beehive:037 halaman kartu Invoice Recap Courier per AWB';
revoke execute on function public.fn_courier_recap_awb_page(text, text, date, date, text, text[], int, int) from public, anon;
grant execute on function public.fn_courier_recap_awb_page(text, text, date, date, text, text[], int, int) to authenticated;

-- ── D. Ringkasan KPI (filter SAMA fungsi C) ─────────────────────────────────────────────────────
-- total_amount per invoice = kolom total_amount kalau di-override manual, selain itu adm + duty + freight
-- (SAMA rumus auto-calc frontend computeCourierRekapanCalc). Credit Note dihitung terpisah (nilai absolut).
create or replace function public.fn_courier_recap_summary(
  p_ppjk text default null, p_an text default null, p_from date default null, p_to date default null,
  p_search text default null, p_search_cols text[] default null)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_cols text[] := coalesce(p_search_cols, array['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
  v_pat text := '%' || coalesce(p_search, '') || '%';
  v jsonb;
begin
  with b as (
    select r.*, coalesce(public.fn_courier_awb_norm(r.awb), 'ID:' || r.id::text) as k,
           case when coalesce(r.manual_override_fields, '[]'::jsonb) ? 'total_amount' then coalesce(r.total_amount, 0)
                else coalesce(r.courier_adm_fee, 0) + coalesce(r.total_duty_tax, 0) + coalesce(r.total_freight, 0) end as amt,
           upper(coalesce(r.invoice_type, '')) like 'CREDIT NOTE%' as is_cn,
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
           min(public.fn_courier_awb_norm(awb)) as awb_n
    from f group by k
  )
  select jsonb_build_object(
    'awb', (select count(*) from grp),
    'invoices', (select count(*) from f),
    'charges', (select coalesce(sum(amt), 0) from f where not is_cn),
    'credit_notes', (select coalesce(sum(abs(amt)), 0) from f where is_cn),
    'not_submitted', (select count(*) from f where submit_date is null),
    'submitted_unpaid', (select count(*) from f where submit_date is not null and tgl_lunas is null),
    'paid', (select count(*) from f where tgl_lunas is not null),
    'not_in_audit', (select count(*) from grp g where not g.linked_id and not exists (
        select 1 from public.tabel_audit_pib p where g.awb_n is not null and public.fn_courier_awb_norm(p.awb) = g.awb_n
        union all
        select 1 from public.tabel_audit_cn c where g.awb_n is not null and public.fn_courier_awb_norm(c.awb) = g.awb_n))
  ) into v;
  return v;
end $$;
comment on function public.fn_courier_recap_summary(text, text, date, date, text, text[]) is 'beehive:037 KPI Invoice Recap Courier';
revoke execute on function public.fn_courier_recap_summary(text, text, date, date, text, text[]) from public, anon;
grant execute on function public.fn_courier_recap_summary(text, text, date, date, text, text[]) to authenticated;

-- ── E. Re-audit otomatis ────────────────────────────────────────────────────────────────────────
-- User mengubah kolom angka / AWB / PO / jenis / no invoice di Invoice Recap -> PIB/CN terkait yang sudah
-- Audited (LENGKAP) kembali Draft (ARCHIVED) + alasan. Terkait = pib_id/cn_id baris itu ATAU AWB sama.
-- SECURITY DEFINER: editor Recap belum tentu punya hak edit Audit. Edit catatan/tanggal (submit_date,
-- tgl_lunas, kolom Finance, notes, keterangan, sort_order) TIDAK memicu.
create or replace function public.fn_courier_reaudit()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_changed text[] := '{}';
  v_awb text;
  v_reason text;
begin
  if auth.email() is null then return new; end if;
  if new.awb is distinct from old.awb then v_changed := array_append(v_changed, 'AWB'::text); end if;
  if new.po_pt_imi is distinct from old.po_pt_imi then v_changed := array_append(v_changed, 'PO PT IMI'::text); end if;
  if new.po_shipping is distinct from old.po_shipping then v_changed := array_append(v_changed, 'PO Non IMI'::text); end if;
  if new.invoice_type is distinct from old.invoice_type then v_changed := array_append(v_changed, 'Invoice Type'::text); end if;
  if new.no_invoice is distinct from old.no_invoice then v_changed := array_append(v_changed, 'No. Invoice'::text); end if;
  if new.courier_adm_fee is distinct from old.courier_adm_fee then v_changed := array_append(v_changed, 'Courier Adm Fee'::text); end if;
  if new.total_duty_tax is distinct from old.total_duty_tax then v_changed := array_append(v_changed, 'Total Duty Tax'::text); end if;
  if new.total_freight is distinct from old.total_freight then v_changed := array_append(v_changed, 'Total Freight'::text); end if;
  if new.total_amount is distinct from old.total_amount then v_changed := array_append(v_changed, 'Total Amount'::text); end if;
  if new.bm is distinct from old.bm then v_changed := array_append(v_changed, 'BM'::text); end if;
  if new.ppn is distinct from old.ppn then v_changed := array_append(v_changed, 'PPN'::text); end if;
  if new.pph is distinct from old.pph then v_changed := array_append(v_changed, 'PPH'::text); end if;
  if coalesce(array_length(v_changed, 1), 0) = 0 then return new; end if;

  v_reason := 'Changed in Invoice Recap (' || coalesce(new.invoice_type, 'invoice')
    || coalesce(' ' || nullif(btrim(new.no_invoice), ''), '') || '): ' || array_to_string(v_changed, ', ');
  v_awb := public.fn_courier_awb_norm(coalesce(new.awb, old.awb));

  update public.tabel_audit_pib set status = 'ARCHIVED', reaudit_reason = v_reason, reaudit_at = now()
  where status = 'LENGKAP'
    and (id = new.pib_id or id = old.pib_id or (v_awb is not null and public.fn_courier_awb_norm(awb) = v_awb));
  update public.tabel_audit_cn set status = 'ARCHIVED', reaudit_reason = v_reason, reaudit_at = now()
  where status = 'LENGKAP'
    and (id = new.cn_id or id = old.cn_id or (v_awb is not null and public.fn_courier_awb_norm(awb) = v_awb));
  return new;
end $$;
comment on function public.fn_courier_reaudit() is 'beehive:037 re-audit otomatis PIB/CN saat Invoice Recap Courier diedit';
revoke execute on function public.fn_courier_reaudit() from public, anon;

drop trigger if exists trg_courier_recap_reaudit on public.rekapan_courier;
create trigger trg_courier_recap_reaudit after update on public.rekapan_courier
  for each row execute function public.fn_courier_reaudit();

-- Tanda re-audit dihapus otomatis begitu PIB/CN di-Mark as audited lagi.
create or replace function public.fn_courier_reaudit_clear()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'LENGKAP' and old.status is distinct from 'LENGKAP' then
    new.reaudit_reason := null;
    new.reaudit_at := null;
  end if;
  return new;
end $$;
comment on function public.fn_courier_reaudit_clear() is 'beehive:037 hapus tanda re-audit saat audited';
revoke execute on function public.fn_courier_reaudit_clear() from public, anon;

drop trigger if exists trg_courier_reaudit_clear_pib on public.tabel_audit_pib;
create trigger trg_courier_reaudit_clear_pib before update of status on public.tabel_audit_pib
  for each row execute function public.fn_courier_reaudit_clear();
drop trigger if exists trg_courier_reaudit_clear_cn on public.tabel_audit_cn;
create trigger trg_courier_reaudit_clear_cn before update of status on public.tabel_audit_cn
  for each row execute function public.fn_courier_reaudit_clear();

-- ── F. Master vendor Courier (PPJK: nama legal + TOP) ───────────────────────────────────────────
create table if not exists public.courier_vendor_master (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  legal_name text,
  top_days integer check (top_days is null or (top_days >= 0 and top_days <= 365)),
  aktif boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists uq_courier_vendor_master_code on public.courier_vendor_master (upper(btrim(vendor_code)));
alter table public.courier_vendor_master enable row level security;
drop policy if exists courier_vendor_master_select on public.courier_vendor_master;
create policy courier_vendor_master_select on public.courier_vendor_master for select
  using (public.has_page_access('settings_courier_vendors') or public.has_page_access('courier_finance') or public.has_page_access('courier_rekapan'));
drop policy if exists courier_vendor_master_insert on public.courier_vendor_master;
create policy courier_vendor_master_insert on public.courier_vendor_master for insert
  with check (public.has_edit_access('settings_courier_vendors'));
drop policy if exists courier_vendor_master_update on public.courier_vendor_master;
create policy courier_vendor_master_update on public.courier_vendor_master for update
  using (public.has_edit_access('settings_courier_vendors')) with check (public.has_edit_access('settings_courier_vendors'));
drop policy if exists courier_vendor_master_delete on public.courier_vendor_master;
create policy courier_vendor_master_delete on public.courier_vendor_master for delete
  using (public.has_edit_access('settings_courier_vendors'));

-- Isi awal: kode PPJK yang sudah ada (prefix "OWN " dibuang, sama tampilan & tab PPJK).
insert into public.courier_vendor_master (vendor_code)
select distinct upper(btrim(regexp_replace(ppjk, '^\s*OWN\s+', '', 'i')))
from public.rekapan_courier
where nullif(btrim(coalesce(ppjk, '')), '') is not null
on conflict do nothing;

-- ── G. Finance Handover Courier (per invoice) ───────────────────────────────────────────────────
drop policy if exists rekapan_courier_select_finance on public.rekapan_courier;
create policy rekapan_courier_select_finance on public.rekapan_courier for select
  using (public.has_page_access('courier_finance'));

create or replace function public.fn_courier_finance_accept(p_id uuid, p_receiver_name text, p_received_date date)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  if not public.has_edit_access('courier_finance') then
    raise exception 'Not authorized to receive Courier invoices';
  end if;
  if nullif(btrim(coalesce(p_receiver_name, '')), '') is null or p_received_date is null then
    raise exception 'Fill in the receiver name and date.';
  end if;
  select id, submit_date, finance_received_at into r from public.rekapan_courier where id = p_id for update;
  if not found then raise exception 'Invoice not found: %', p_id; end if;
  if r.submit_date is null then raise exception 'This invoice has not been submitted to Finance yet.'; end if;
  if r.finance_received_at is not null then raise exception 'This invoice has already been received.'; end if;
  update public.rekapan_courier set finance_received_at = p_received_date, finance_received_by = btrim(p_receiver_name) where id = p_id;
end $$;
comment on function public.fn_courier_finance_accept(uuid, text, date) is 'beehive:037 Finance terima invoice Courier';
revoke execute on function public.fn_courier_finance_accept(uuid, text, date) from public, anon;
grant execute on function public.fn_courier_finance_accept(uuid, text, date) to authenticated;

create or replace function public.fn_courier_finance_mark_paid(p_id uuid, p_paid_date date, p_reference text default null)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  if not public.has_edit_access('courier_finance') then
    raise exception 'Not authorized to mark Courier invoices as paid';
  end if;
  if p_paid_date is null then raise exception 'Fill in the transfer date.'; end if;
  select id, finance_received_at, tgl_lunas into r from public.rekapan_courier where id = p_id for update;
  if not found then raise exception 'Invoice not found: %', p_id; end if;
  if r.finance_received_at is null then raise exception 'Receive this invoice first before marking it paid.'; end if;
  if r.tgl_lunas is not null then raise exception 'This invoice is already marked as paid.'; end if;
  update public.rekapan_courier
     set tgl_lunas = p_paid_date, paid_reference = nullif(btrim(coalesce(p_reference, '')), ''), paid_by = auth.email()
   where id = p_id;
end $$;
comment on function public.fn_courier_finance_mark_paid(uuid, date, text) is 'beehive:037 Finance tandai lunas invoice Courier (tgl_lunas)';
revoke execute on function public.fn_courier_finance_mark_paid(uuid, date, text) from public, anon;
grant execute on function public.fn_courier_finance_mark_paid(uuid, date, text) to authenticated;
