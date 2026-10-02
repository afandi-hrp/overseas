-- 040 -- Finance Handover: Undo "Accept" (batalkan penerimaan Finance) -- 2026-10-02, permintaan user
-- Aturan (keputusan user, mengubah keputusan lama "tanpa Undo"): HANYA Admin, alasan WAJIB (min. 5 karakter), HANYA
-- selama belum "Mark paid", tercatat di log. Berlaku 3 sumber: FAR Overseas, Sea & Air, Courier.
-- Setelah Undo: status kembali "Waiting for Finance" (Received kosong) -> Admin bisa Unlock lagi di Invoice Recap
-- (Sea & Air / Courier) & Undo sign FAR kembali mungkin. Nama fungsi BARU (fn_seaair_finance_undo lama sudah di-DROP 035).
-- Idempotent. Pre-check membatalkan kalau ada fungsi bernama sama yang BUKAN buatan file ini.

-- ── 0. Pre-check nama ───────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.proname, obj_description(p.oid, 'pg_proc') as c
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('fn_far_overseas_finance_undo_receive', 'fn_seaair_finance_undo_receive', 'fn_courier_finance_undo_receive')
  loop
    if coalesce(r.c, '') not like 'beehive:040%' then
      raise exception 'Fungsi % sudah ada & bukan dari sql/040 -- hentikan, konsultasikan dulu.', r.proname;
    end if;
  end loop;
end $$;

-- ── A. FAR Overseas ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_far_overseas_finance_undo_receive(p_id uuid, p_reason text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'Only an Admin can undo a Finance receipt.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Undo reason is required (min. 5 characters).'; end if;
  select id, finance_received_at, finance_received_by, paid_at into r from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if r.finance_received_at is null then raise exception 'This memo has not been received by Finance.'; end if;
  if r.paid_at is not null then raise exception 'Already marked as paid — the receipt cannot be undone.'; end if;
  update public.rekapan_far_overseas_air
     set finance_received_at = null, finance_received_by = null, finance_received_user_id = null
   where id = p_id;
  insert into public.far_overseas_memo_log (memo_id, action, old_value, new_value, note)
  values (p_id, 'FINANCE_UNDO_RECEIVE', coalesce(r.finance_received_by, '') || ' · ' || r.finance_received_at::text, null, btrim(p_reason));
  return json_build_object('ok', true);
end $$;
comment on function public.fn_far_overseas_finance_undo_receive(uuid, text) is 'beehive:040 Undo Accept Finance Handover FAR (Admin)';
revoke all on function public.fn_far_overseas_finance_undo_receive(uuid, text) from public, anon;
grant execute on function public.fn_far_overseas_finance_undo_receive(uuid, text) to authenticated;

-- ── B. Sea & Air ────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_seaair_finance_undo_receive(p_rekapan_id uuid, p_reason text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'Only an Admin can undo a Finance receipt.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Undo reason is required (min. 5 characters).'; end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then raise exception 'Shipment not found: %', p_rekapan_id; end if;
  if r.finance_received_at is null then raise exception 'This shipment has not been received by Finance.'; end if;
  if r.paid_date is not null then raise exception 'Already marked as paid — the receipt cannot be undone.'; end if;

  perform set_config('app.seaair_unlock', 'on', true);   -- lolos kunci submit (trigger 031), pola SAMA fn_seaair_finance_accept
  update public.rekapan_seaair set finance_received_at = null, finance_received_by = null where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''), auth.email(),
    'Finance received (undo) — Lama: ' || r.finance_received_at::date::text || ' · by ' || coalesce(r.finance_received_by, '-')
    || ' → Baru: - · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end $$;
comment on function public.fn_seaair_finance_undo_receive(uuid, text) is 'beehive:040 Undo Accept Finance Handover Sea & Air (Admin)';
revoke all on function public.fn_seaair_finance_undo_receive(uuid, text) from public, anon;
grant execute on function public.fn_seaair_finance_undo_receive(uuid, text) to authenticated;

-- ── C. Courier ──────────────────────────────────────────────────────────────────────────────────
-- Kunci 038 (fn_courier_recap_lock) mengizinkan perubahan kolom Finance, jadi tanpa flag.
create or replace function public.fn_courier_finance_undo_receive(p_id uuid, p_reason text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'Only an Admin can undo a Finance receipt.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Undo reason is required (min. 5 characters).'; end if;
  select * into r from public.rekapan_courier where id = p_id for update;
  if not found then raise exception 'Invoice not found: %', p_id; end if;
  if r.finance_received_at is null then raise exception 'This invoice has not been received by Finance.'; end if;
  if r.tgl_lunas is not null then raise exception 'Already marked as paid — the receipt cannot be undone.'; end if;
  update public.rekapan_courier set finance_received_at = null, finance_received_by = null where id = p_id;
  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_courier', 'UPDATE', r.awb, r.no_invoice, 'COURIER-REKAPAN - ' || coalesce(r.invoice_type, ''), auth.email(),
    'Finance received (undo) — Lama: ' || r.finance_received_at::text || ' · by ' || coalesce(r.finance_received_by, '-')
    || ' → Baru: - · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end $$;
comment on function public.fn_courier_finance_undo_receive(uuid, text) is 'beehive:040 Undo Accept Finance Handover Courier (Admin)';
revoke all on function public.fn_courier_finance_undo_receive(uuid, text) from public, anon;
grant execute on function public.fn_courier_finance_undo_receive(uuid, text) to authenticated;
