-- 069: Agency Invoices -- koreksi nominal header invoice (Subtotal / VAT / WHT / Stamp) dari modal review.
-- Grand total dihitung ulang di server = subtotal + ppn - pph + materai (cocok data nyata: 21.384.700 + 2.352.317 - 100.000 + 10.000 = 23.647.017).
-- Hanya status verification / rejected / failed (sama dgn fn_cost_agent_update_invoice_header). Catatan total_mismatch otomatis
-- dibuang bila selisih lines_total vs subtotal baru <= 1. Dicatat ke cost_agent_status_log.
-- Idempotent. Pre-check: pastikan nama belum dipakai ->  select to_regproc('public.fn_cost_agent_update_invoice_amounts');

create or replace function public.fn_cost_agent_update_invoice_amounts(
  p_invoice_id bigint, p_subtotal numeric, p_ppn numeric, p_pph numeric, p_materai numeric, p_actor text default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.cost_agent_invoices%rowtype;
  v_sub numeric(18,2); v_ppn numeric(18,2); v_pph numeric(18,2); v_mat numeric(18,2); v_grand numeric(18,2);
begin
  perform public.fn_cost_agent_assert_edit('cost_agent_invoice');
  select * into v_inv from public.cost_agent_invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;
  if v_inv.status not in ('verification','rejected','failed') then
    raise exception 'Invoice berstatus % tidak bisa diubah', v_inv.status;
  end if;
  if p_subtotal is null or p_subtotal < 0 or coalesce(p_ppn, 0) < 0 or coalesce(p_pph, 0) < 0 or coalesce(p_materai, 0) < 0 then
    raise exception 'Nominal tidak valid (Subtotal wajib diisi, semua nominal tidak boleh negatif)';
  end if;
  v_sub := round(p_subtotal, 2); v_ppn := round(coalesce(p_ppn, 0), 2);
  v_pph := round(coalesce(p_pph, 0), 2); v_mat := round(coalesce(p_materai, 0), 2);
  v_grand := v_sub + v_ppn - v_pph + v_mat;

  update public.cost_agent_invoices
     set subtotal = v_sub, ppn = v_ppn, pph = v_pph, materai = v_mat, grand_total = v_grand,
         check_notes = coalesce((select jsonb_agg(n) from jsonb_array_elements(check_notes) n
                                  where not (n ->> 'type' = 'total_mismatch' and abs(coalesce(v_inv.lines_total, 0) - v_sub) <= 1)), '[]'::jsonb),
         updated_at = now()
   where id = p_invoice_id;

  insert into public.cost_agent_status_log(invoice_id, from_status, to_status, actor, note)
  values (p_invoice_id, v_inv.status, v_inv.status, public.fn_cost_agent_actor(p_actor),
          format('Nominal dikoreksi — Subtotal: %s → %s; VAT: %s → %s; WHT: %s → %s; Stamp: %s → %s; Grand total: %s → %s',
                 coalesce(v_inv.subtotal::text, '-'), v_sub, coalesce(v_inv.ppn::text, '-'), v_ppn, coalesce(v_inv.pph::text, '-'), v_pph,
                 coalesce(v_inv.materai::text, '-'), v_mat, coalesce(v_inv.grand_total::text, '-'), v_grand));
  return v_grand;
end $$;

revoke all on function public.fn_cost_agent_update_invoice_amounts(bigint, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.fn_cost_agent_update_invoice_amounts(bigint, numeric, numeric, numeric, numeric, text) to authenticated, service_role;
