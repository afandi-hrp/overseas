-- 035 — Finance Handover gabungan (FAR Overseas + Sea & Air) — 2026-10-01
--
-- Keputusan user:
--   * 1 halaman Finance Handover utk FAR Overseas + Sea & Air (frontend).
--   * TANPA upload bukti transfer (FAR & Sea & Air): Mark paid = tanggal transfer + referensi bank opsional.
--   * TANPA Undo.
--   * Nama lengkap PPJK + TOP (hari) dari master vendor Sea & Air BARU (dikelola di Settings).
--   * Chip "Urgent" FAR: kolom + toggle di Edit memo.
--
-- Isi:
--   A. Cek pengaman (nama fungsi/tabel baru belum dipakai objek lain; RPC FAR mark_paid ada dgn signature 027).
--   B. FAR: kolom is_urgent + RPC fn_far_overseas_set_urgent; fn_far_overseas_mark_paid -> bukti bayar OPSIONAL
--      (signature SAMA dgn sql/027, CREATE OR REPLACE aman).
--   C. Sea & Air: Receive = nama penerima + tanggal terima (fn_seaair_finance_accept signature BARU ->
--      DROP versi 034 dulu); Mark paid referensi OPSIONAL; fn_seaair_finance_undo DIHAPUS.
--   D. Tabel master vendor Sea & Air `seaair_vendor_master` (kode -> nama legal + TOP hari) + RLS 4 policy,
--      diisi awal dgn kode emkl_vendor yg sudah ada (nama & TOP kosong, diisi user di Settings).
--   E. Akses BACA utk Finance (page_key sea_air_finance) ke tabel validasi Sea & Air + Audit PIB (viewer
--      Handover · Documents · Cost validation; angka/dokumen duty disembunyikan di UI).
-- Idempotent. Kalau sql/034 dijalankan ULANG, jalankan file ini lagi sesudahnya.

-- ── A. Cek pengaman ─────────────────────────────────────────────────────────
do $$
declare v_conflict text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array['fn_far_overseas_set_urgent', 'fn_seaair_finance_accept', 'fn_seaair_finance_mark_paid'])
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:03%';
  if v_conflict is not null then
    raise exception 'STOP 035: nama fungsi sudah dipakai fungsi lain (bukan dari file 03x): %', v_conflict;
  end if;

  if to_regclass('public.seaair_vendor_master') is not null
     and coalesce(obj_description(to_regclass('public.seaair_vendor_master'), 'pg_class'), '') not like 'beehive:035%' then
    raise exception 'STOP 035: tabel public.seaair_vendor_master sudah ada (bukan dari file 035) — cek dulu isinya.';
  end if;

  if to_regprocedure('public.fn_far_overseas_mark_paid(uuid, date, text, text)') is null then
    raise exception 'STOP 035: fn_far_overseas_mark_paid(uuid, date, text, text) dari sql/027 tidak ditemukan.';
  end if;
end $$;

-- ── B. FAR Overseas ─────────────────────────────────────────────────────────
alter table public.rekapan_far_overseas_air
  add column if not exists is_urgent boolean not null default false;   -- boleh dibayar sebelum barang diterima

create or replace function public.fn_far_overseas_set_urgent(p_id uuid, p_urgent boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas memos';
  end if;
  select id, is_urgent, paid_at into r from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if r.paid_at is not null then raise exception 'This memo is already paid.'; end if;
  if r.is_urgent is not distinct from coalesce(p_urgent, false) then
    return jsonb_build_object('is_urgent', r.is_urgent);
  end if;
  update public.rekapan_far_overseas_air set is_urgent = coalesce(p_urgent, false) where id = p_id;
  insert into public.far_overseas_memo_log (memo_id, action, field, old_value, new_value)
  values (p_id, 'EDIT', 'is_urgent', coalesce(r.is_urgent, false)::text, coalesce(p_urgent, false)::text);
  return jsonb_build_object('is_urgent', coalesce(p_urgent, false));
end;
$$;
comment on function public.fn_far_overseas_set_urgent(uuid, boolean) is 'beehive:035 FAR memo urgent toggle';
revoke all on function public.fn_far_overseas_set_urgent(uuid, boolean) from public, anon;
grant execute on function public.fn_far_overseas_set_urgent(uuid, boolean) to authenticated;

-- Mark paid FAR: bukti bayar TIDAK wajib lagi (keputusan user). Signature & default SAMA sql/027.
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
  if p_paid_date is null then
    raise exception 'Transfer date is required';
  end if;
  update public.rekapan_far_overseas_air
     set paid_at = p_paid_date,
         paid_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         payment_proof_path = nullif(btrim(coalesce(p_proof_path, '')), '')
   where id = p_id and finance_received_at is not null and paid_at is null;
  if not found then raise exception 'Memo must be accepted by Finance first (or is already paid)'; end if;
  insert into public.far_overseas_memo_log (memo_id, action, note)
  values (p_id, 'PAID', p_paid_date::text || coalesce(' · ' || nullif(btrim(coalesce(p_reference, '')), ''), ''));
  return jsonb_build_object('paid_at', p_paid_date, 'paid_reference', nullif(btrim(coalesce(p_reference, '')), ''));
end;
$$;
revoke all on function public.fn_far_overseas_mark_paid(uuid, date, text, text) from public, anon;
grant execute on function public.fn_far_overseas_mark_paid(uuid, date, text, text) to authenticated;

-- ── C. Sea & Air ────────────────────────────────────────────────────────────
drop function if exists public.fn_seaair_finance_undo(uuid, text);
drop function if exists public.fn_seaair_finance_accept(uuid);

-- Receive: nama penerima (finance_received_by) + tanggal terima (finance_received_at = tanggal itu).
create or replace function public.fn_seaair_finance_accept(p_rekapan_id uuid, p_receiver_name text, p_received_date date)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
begin
  if not public.has_edit_access('sea_air_finance') then
    raise exception 'Not authorized to update Sea & Air Finance Handover';
  end if;
  if p_receiver_name is null or btrim(p_receiver_name) = '' or p_received_date is null then
    raise exception 'Fill in the receiver name and date.';
  end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then raise exception 'Shipment not found: %', p_rekapan_id; end if;
  if r.tgl_submit_finance is null then
    raise exception 'This shipment has not been submitted to Finance.';
  end if;
  if r.finance_received_at is not null then
    raise exception 'Already received by Finance on %.', r.finance_received_at::date;
  end if;

  perform set_config('app.seaair_unlock', 'on', true);   -- lolos kunci submit (trigger 031 E)
  update public.rekapan_seaair
     set finance_received_at = p_received_date::timestamp, finance_received_by = btrim(p_receiver_name)
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Finance received — Lama: - → Baru: ' || p_received_date::text || ' · by ' || btrim(p_receiver_name));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_finance_accept(uuid, text, date) is 'beehive:035 Finance Handover Sea & Air — terima (nama + tanggal)';
revoke all on function public.fn_seaair_finance_accept(uuid, text, date) from public, anon;
grant execute on function public.fn_seaair_finance_accept(uuid, text, date) to authenticated;

-- Mark paid: tanggal wajib, referensi bank opsional. Signature SAMA sql/034.
create or replace function public.fn_seaair_finance_mark_paid(p_rekapan_id uuid, p_paid_date date, p_reference text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.has_edit_access('sea_air_finance') then
    raise exception 'Not authorized to update Sea & Air Finance Handover';
  end if;
  if p_paid_date is null then raise exception 'Fill in the transfer date.'; end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then raise exception 'Shipment not found: %', p_rekapan_id; end if;
  if r.finance_received_at is null then
    raise exception 'Receive this shipment first before marking it paid.';
  end if;
  if r.paid_date is not null then
    raise exception 'Already marked paid on %.', r.paid_date;
  end if;

  perform set_config('app.seaair_unlock', 'on', true);
  update public.rekapan_seaair
     set paid_date = p_paid_date, paid_reference = v_ref, paid_by = auth.email(), paid_recorded_at = now()
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Paid — Lama: - → Baru: ' || p_paid_date::text || coalesce(' · ref: ' || v_ref, ''));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_finance_mark_paid(uuid, date, text) is 'beehive:035 Finance Handover Sea & Air — tandai lunas (ref opsional)';
revoke all on function public.fn_seaair_finance_mark_paid(uuid, date, text) from public, anon;
grant execute on function public.fn_seaair_finance_mark_paid(uuid, date, text) to authenticated;

-- ── D. Master vendor Sea & Air ──────────────────────────────────────────────
create table if not exists public.seaair_vendor_master (
  id          uuid primary key default gen_random_uuid(),
  vendor_code text not null,                 -- kode seperti di rekapan_seaair.emkl_vendor (mis. AKSI)
  legal_name  text,                          -- nama lengkap (mis. PT. ANEKA KREASI SELARAS INDONESIA)
  top_days    integer check (top_days is null or (top_days >= 0 and top_days <= 365)),
  aktif       boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
comment on table public.seaair_vendor_master is 'beehive:035 master vendor Sea & Air (nama legal + TOP) utk Finance Handover';
create unique index if not exists seaair_vendor_master_code_uq on public.seaair_vendor_master (upper(btrim(vendor_code)));

alter table public.seaair_vendor_master enable row level security;
drop policy if exists seaair_vendor_master_select on public.seaair_vendor_master;
drop policy if exists seaair_vendor_master_insert on public.seaair_vendor_master;
drop policy if exists seaair_vendor_master_update on public.seaair_vendor_master;
drop policy if exists seaair_vendor_master_delete on public.seaair_vendor_master;
create policy seaair_vendor_master_select on public.seaair_vendor_master for select using (
  public.has_page_access('settings_seaair_vendors') or public.has_page_access('sea_air_finance') or public.has_page_access('sea_air_rekapan'));
create policy seaair_vendor_master_insert on public.seaair_vendor_master for insert
  with check (public.has_edit_access('settings_seaair_vendors'));
create policy seaair_vendor_master_update on public.seaair_vendor_master for update
  using (public.has_edit_access('settings_seaair_vendors')) with check (public.has_edit_access('settings_seaair_vendors'));
create policy seaair_vendor_master_delete on public.seaair_vendor_master for delete
  using (public.has_edit_access('settings_seaair_vendors'));

-- Isi awal: kode PPJK yg sudah dipakai di Invoice Recap (nama & TOP kosong -> diisi di Settings).
insert into public.seaair_vendor_master (vendor_code)
select distinct upper(btrim(emkl_vendor))
from public.rekapan_seaair
where nullif(btrim(emkl_vendor), '') is not null
on conflict do nothing;

-- ── E. Akses BACA utk Finance (viewer) ──────────────────────────────────────
drop policy if exists "dokumen_checklist_seaair_select_finance" on public.dokumen_checklist_seaair;
create policy "dokumen_checklist_seaair_select_finance" on public.dokumen_checklist_seaair
  for select using (public.has_page_access('sea_air_finance'));
drop policy if exists "dokumen_validasi_matriks_seaair_select_finance" on public.dokumen_validasi_matriks_seaair;
create policy "dokumen_validasi_matriks_seaair_select_finance" on public.dokumen_validasi_matriks_seaair
  for select using (public.has_page_access('sea_air_finance'));
drop policy if exists "cost_validasi_seaair_select_finance" on public.cost_validasi_seaair;
create policy "cost_validasi_seaair_select_finance" on public.cost_validasi_seaair
  for select using (public.has_page_access('sea_air_finance'));
drop policy if exists "cost_validasi_catatan_seaair_select_finance" on public.cost_validasi_catatan_seaair;
create policy "cost_validasi_catatan_seaair_select_finance" on public.cost_validasi_catatan_seaair
  for select using (public.has_page_access('sea_air_finance'));
drop policy if exists "tabel_audit_seaair_select_finance" on public.tabel_audit_seaair;
create policy "tabel_audit_seaair_select_finance" on public.tabel_audit_seaair
  for select using (public.has_page_access('sea_air_finance'));

-- Selesai. Cek cepat:
-- select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname like 'fn_seaair_finance_%' or proname = 'fn_far_overseas_set_urgent';
-- select vendor_code, legal_name, top_days from public.seaair_vendor_master order by 1;
