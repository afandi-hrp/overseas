-- =====================================================================
-- 056 · Cost Agent -- hapus invoice (masa uji coba, permintaan user 2026-10-13)
-- RLS cost_agent_invoices menolak DELETE dari aplikasi (tulis hanya lewat RPC), jadi hapus = RPC ini.
-- Aturan:
--   * HANYA Admin (is_admin()) + hak edit cost_agent_invoice. n8n / SQL Editor (bukan 'authenticated') lolos.
--   * Status journal / paid TIDAK bisa dihapus (sudah diposting ke finance); juga ditolak bila ada payment
--     request submitted / posted / paid.
--   * Anak invoice ikut terhapus lewat FK ON DELETE CASCADE (lines, approvals, payment_requests, tax_checks,
--     invoice_documents, status_log). history biaya dari invoice ini (source='app') ikut dihapus supaya
--     data percobaan tidak menjadi acuan compare. duplicate_of yang menunjuk invoice ini dikosongkan.
--   * File di Google Drive TIDAK dihapus (di luar database).
-- Idempotent: aman dijalankan ulang. Pre-check: berhenti bila nama fungsi sudah dipakai fungsi lain.
-- =====================================================================

do $$
declare v_conflict text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_conflict
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_cost_agent_delete_invoice'
     and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:056%';
  if v_conflict is not null then
    raise exception 'STOP 056: nama fungsi sudah dipakai fungsi lain: %', v_conflict;
  end if;
end $$;

create or replace function public.fn_cost_agent_delete_invoice(p_invoice_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv  public.cost_agent_invoices%rowtype;
  v_hist int := 0;
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  if public.fn_cost_agent_caller_role() = 'authenticated' and not coalesce(public.is_admin(), false) then
    raise exception 'Hanya Admin yang boleh menghapus invoice' using errcode = '42501';
  end if;

  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice % tidak ditemukan', p_invoice_id; end if;
  if v_inv.status in ('journal', 'paid') then
    raise exception 'Invoice berstatus % sudah diposting ke finance, tidak bisa dihapus', v_inv.status;
  end if;
  if exists (select 1 from public.cost_agent_payment_requests
              where invoice_id = p_invoice_id and status in ('submitted', 'posted', 'paid')) then
    raise exception 'Invoice punya dokumen pembayaran aktif, tidak bisa dihapus';
  end if;

  update public.cost_agent_invoices set duplicate_of = null where duplicate_of = p_invoice_id;
  delete from public.cost_agent_cost_history where source_invoice_id = p_invoice_id and source = 'app';
  get diagnostics v_hist = row_count;
  delete from public.cost_agent_invoices where id = p_invoice_id;

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('cost_agent_invoices', 'DELETE', null, coalesce(v_inv.invoice_no, '#' || p_invoice_id), 'COST-AGENT',
          public.fn_cost_agent_actor(null),
          'Invoice Cost Agent — Lama: #' || p_invoice_id || ' (' || v_inv.status || ') → Baru: dihapus'
            || coalesce(' · ' || nullif(btrim(p_reason), ''), ''));

  return jsonb_build_object('deleted', p_invoice_id, 'status', v_inv.status, 'history_rows_removed', v_hist,
                            'files', v_inv.files);
end $$;

comment on function public.fn_cost_agent_delete_invoice(bigint, text) is 'beehive:056 hapus invoice Cost Agent (Admin, masa uji coba)';
revoke all on function public.fn_cost_agent_delete_invoice(bigint, text) from public, anon, authenticated;
grant execute on function public.fn_cost_agent_delete_invoice(bigint, text) to authenticated, service_role;
