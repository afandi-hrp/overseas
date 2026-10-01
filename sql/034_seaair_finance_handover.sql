-- 034 — Finance Handover Sea & Air — 2026-10-01
--
-- Spek V167: "Submit to Finance -> ONE handover per BL/AWB in Finance Handover: payable to the PPJK,
-- all shipping invoices reimbursed via PPJK, EXCLUDING duty & tax". Alur: Sent (tgl_submit_finance,
-- sql/031) -> Received (Finance terima) -> Paid (tanggal bayar + referensi transfer).
--
-- Isi:
--   A. Cek pengaman nama fungsi (berhenti kalau nama dipakai fungsi lain yg BUKAN dari file ini/031).
--   B. Kolom baru rekapan_seaair (finance_received_*, paid_*).
--   C. Policy SELECT tambahan: role ber-page_key `sea_air_finance` boleh BACA rekapan_seaair (policy
--      lama tidak diubah; policy permisif digabung OR).
--   D. RPC fn_seaair_finance_accept / fn_seaair_finance_mark_paid / fn_seaair_finance_undo
--      (SECURITY DEFINER, guard has_edit_access('sea_air_finance'), log audit_trail format app).
--   E. fn_seaair_unlock_submit (031) diperbarui: TIDAK bisa unlock kalau Finance sudah menerima.
--   F. fn_seaair_reaudit_on_recap_change (031) diperbarui: kolom Finance & updated_at tidak memicu
--      re-audit PIB.
-- Idempotent (aman dijalankan ulang). PENTING: kalau sql/031 dijalankan ULANG, jalankan file ini lagi
-- sesudahnya (031 menimpa fungsi E & F ke versi lama).

-- ── A. Cek pengaman nama fungsi ─────────────────────────────────────────────
do $$
declare v_conflict text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array[
      'fn_seaair_finance_accept', 'fn_seaair_finance_mark_paid', 'fn_seaair_finance_undo',
      'fn_seaair_unlock_submit', 'fn_seaair_reaudit_on_recap_change'])
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:03%';
  if v_conflict is not null then
    raise exception 'STOP 034: nama fungsi sudah dipakai fungsi lain (bukan dari file 031/034): %', v_conflict;
  end if;
end $$;

-- ── B. Kolom baru ───────────────────────────────────────────────────────────
alter table public.rekapan_seaair
  add column if not exists finance_received_at timestamptz,
  add column if not exists finance_received_by text,
  add column if not exists paid_date date,             -- tanggal transfer (diisi Finance)
  add column if not exists paid_reference text,        -- no. referensi / bukti transfer
  add column if not exists paid_by text,
  add column if not exists paid_recorded_at timestamptz;

-- ── C. Akses baca utk Finance ───────────────────────────────────────────────
drop policy if exists "rekapan_seaair_select_finance" on public.rekapan_seaair;
create policy "rekapan_seaair_select_finance" on public.rekapan_seaair
  for select using (public.has_page_access('sea_air_finance'));

-- ── D. RPC Finance ──────────────────────────────────────────────────────────
create or replace function public.fn_seaair_finance_accept(p_rekapan_id uuid)
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
     set finance_received_at = now(), finance_received_by = auth.email()
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Finance received — Lama: - → Baru: ' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_finance_accept(uuid) is 'beehive:034 Finance Handover Sea & Air — terima';
revoke all on function public.fn_seaair_finance_accept(uuid) from public, anon;
grant execute on function public.fn_seaair_finance_accept(uuid) to authenticated;

create or replace function public.fn_seaair_finance_mark_paid(p_rekapan_id uuid, p_paid_date date, p_reference text)
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
  if p_paid_date is null then raise exception 'Payment date is required.'; end if;
  if p_reference is null or length(btrim(p_reference)) < 3 then
    raise exception 'Payment reference is required (min. 3 characters).';
  end if;
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
     set paid_date = p_paid_date, paid_reference = btrim(p_reference), paid_by = auth.email(), paid_recorded_at = now()
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Paid — Lama: - → Baru: ' || p_paid_date::text || ' · ref: ' || btrim(p_reference));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_finance_mark_paid(uuid, date, text) is 'beehive:034 Finance Handover Sea & Air — tandai lunas';
revoke all on function public.fn_seaair_finance_mark_paid(uuid, date, text) from public, anon;
grant execute on function public.fn_seaair_finance_mark_paid(uuid, date, text) to authenticated;

-- Undo 1 langkah (salah klik): Paid -> Received, atau Received -> Waiting. Wajib alasan.
create or replace function public.fn_seaair_finance_undo(p_rekapan_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  v_txt text;
begin
  if not public.has_edit_access('sea_air_finance') then
    raise exception 'Not authorized to update Sea & Air Finance Handover';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Undo reason is required (min. 5 characters).';
  end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then raise exception 'Shipment not found: %', p_rekapan_id; end if;

  perform set_config('app.seaair_unlock', 'on', true);
  if r.paid_date is not null then
    update public.rekapan_seaair
       set paid_date = null, paid_reference = null, paid_by = null, paid_recorded_at = null
     where id = p_rekapan_id;
    v_txt := 'Finance (undo) — Lama: Paid ' || r.paid_date::text || ' · ref: ' || coalesce(r.paid_reference, '-')
      || ' → Baru: Received · reason: ' || btrim(p_reason);
  elsif r.finance_received_at is not null then
    update public.rekapan_seaair
       set finance_received_at = null, finance_received_by = null
     where id = p_rekapan_id;
    v_txt := 'Finance (undo) — Lama: Received ' || to_char(r.finance_received_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
      || ' → Baru: Waiting for Finance · reason: ' || btrim(p_reason);
  else
    perform set_config('app.seaair_unlock', 'off', true);
    raise exception 'Nothing to undo — Finance has not received this shipment yet.';
  end if;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''), auth.email(), v_txt);
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_finance_undo(uuid, text) is 'beehive:034 Finance Handover Sea & Air — undo 1 langkah';
revoke all on function public.fn_seaair_finance_undo(uuid, text) from public, anon;
grant execute on function public.fn_seaair_finance_undo(uuid, text) to authenticated;

-- ── E. Unlock (Admin) ditolak kalau Finance sudah menerima ──────────────────
create or replace function public.fn_seaair_unlock_submit(p_rekapan_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can unlock a shipment submitted to Finance.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Unlock reason is required (min. 5 characters).';
  end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then
    raise exception 'Shipment not found: %', p_rekapan_id;
  end if;
  if r.tgl_submit_finance is null then
    raise exception 'This shipment is not locked (not submitted to Finance).';
  end if;
  if r.finance_received_at is not null then
    raise exception 'Finance has already received this shipment — ask Finance to undo the receipt first.';
  end if;

  perform set_config('app.seaair_unlock', 'on', true);
  update public.rekapan_seaair
     set tgl_submit_finance = null,
         submit_unlock_reason = btrim(p_reason),
         submit_unlocked_by = auth.email(),
         submit_unlocked_at = now()
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Submit to Finance (unlock) — Lama: ' || r.tgl_submit_finance::text || ' → Baru: unlocked · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_unlock_submit(uuid, text) is 'beehive:031 RPC unlock Submit to Finance (Admin) — diperbarui 034 (tolak kalau Finance sudah terima)';
revoke all on function public.fn_seaair_unlock_submit(uuid, text) from public, anon;
grant execute on function public.fn_seaair_unlock_submit(uuid, text) to authenticated;

-- ── F. Re-audit: kolom Finance & updated_at tidak memicu re-audit ────────────
create or replace function public.fn_seaair_reaudit_on_recap_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_changed text;
  v_rows integer;
begin
  if auth.email() is null or new.seaair_id is null then return new; end if;
  select string_agg(n.key, ', ' order by n.key) into v_changed
  from jsonb_each(to_jsonb(new)) as n(key, value)
  where n.key not in ('tgl_submit_finance', 'submit_unlock_reason', 'submit_unlocked_by', 'submit_unlocked_at', 'duplicate_of',
                      'finance_received_at', 'finance_received_by', 'paid_date', 'paid_reference', 'paid_by', 'paid_recorded_at',
                      'updated_at')
    and n.value is distinct from (to_jsonb(old) -> n.key);
  if v_changed is null then return new; end if;

  update public.tabel_audit_seaair
     set status = 'ARCHIVED',
         reaudit_reason = 'Changed in Invoice Recap: ' || v_changed,
         reaudit_at = now()
   where id = new.seaair_id and status is distinct from 'ARCHIVED';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
    values ('tabel_audit_seaair', 'UPDATE', new.awb, null, 'SEAAIR-PIB', auth.email(),
      'Status PIB — Lama: Audited → Baru: Draft (re-audit, changed in Invoice Recap: ' || v_changed || ')');
  end if;
  return new;
end;
$$;
comment on function public.fn_seaair_reaudit_on_recap_change() is 'beehive:031 re-audit PIB saat Invoice Recap diedit — diperbarui 034 (kolom Finance dikecualikan)';
revoke all on function public.fn_seaair_reaudit_on_recap_change() from public, anon;

-- Selesai. Cek cepat:
-- select proname from pg_proc where proname like 'fn_seaair_finance_%';
-- select polname from pg_policy where polrelid = 'public.rekapan_seaair'::regclass;
