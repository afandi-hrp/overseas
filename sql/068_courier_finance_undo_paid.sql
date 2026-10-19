-- =====================================================================================================
-- 068_courier_finance_undo_paid.sql -- Undo "Paid" Finance Handover Courier (Paid -> Accepted)  [2026-10-19]
-- =====================================================================================================
-- Jalankan di Supabase SQL Editor (stack supabase3), SELURUH file. Idempotent (CREATE OR REPLACE, signature baru).
-- Pre-check 2026-10-19 (MCP read-only): nama `fn_courier_finance_undo_paid` belum ada.
--
-- RPC public.fn_courier_finance_undo_paid(p_id uuid, p_reason text) -- pola SAMA fn_courier_finance_undo_receive (sql/040):
--   * Admin saja (is_admin), alasan wajib min. 5 karakter.
--   * Hanya invoice yang sudah Paid (tgl_lunas terisi). Mengosongkan tgl_lunas + paid_reference + paid_by (data transfer);
--     finance_received_at/by TETAP -> status kembali "Received · unpaid" (Accepted). Undo berikutnya (receipt) = RPC lama.
--   * Kolom yang diubah termasuk daftar bebas kunci Submit (trigger fn_courier_recap_lock, sql/038) -> invoice tetap terkunci.
--   * Dicatat ke audit_trail: "Finance paid (undo) — Lama: <tgl> · ref <ref> · by <paid_by> → Baru: - · reason: <alasan>"
--     (format app "— Lama: … → Baru: …" -> tampil di tab Audit trail Invoice Recap & Finance Handover).
-- =====================================================================================================

create or replace function public.fn_courier_finance_undo_paid(p_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare r record;
begin
  if not public.is_admin() then raise exception 'Only an Admin can undo a Finance payment.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'Undo reason is required (min. 5 characters).'; end if;
  select * into r from public.rekapan_courier where id = p_id for update;
  if not found then raise exception 'Invoice not found: %', p_id; end if;
  if r.tgl_lunas is null then raise exception 'This invoice is not marked as paid.'; end if;
  update public.rekapan_courier set tgl_lunas = null, paid_reference = null, paid_by = null where id = p_id;
  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_courier', 'UPDATE', r.awb, r.no_invoice, 'COURIER-REKAPAN - ' || coalesce(r.invoice_type, ''), auth.email(),
    'Finance paid (undo) — Lama: ' || r.tgl_lunas::text || ' · ref ' || coalesce(nullif(btrim(r.paid_reference), ''), '-')
    || ' · by ' || coalesce(r.paid_by, '-') || ' → Baru: - · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end $$;

revoke all on function public.fn_courier_finance_undo_paid(uuid, text) from public, anon;
grant execute on function public.fn_courier_finance_undo_paid(uuid, text) to authenticated;

-- Verifikasi: harus 1 baris.
select proname, pg_get_function_identity_arguments(oid) as args, prosecdef as security_definer
  from pg_proc where proname = 'fn_courier_finance_undo_paid';
