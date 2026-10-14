-- 058 -- Kembalikan hak EXECUTE fn_cost_agent_delete_invoice utk authenticated (2026-10-14).
-- Gejala: hapus invoice di Agency Invoices -> "permission denied for function fn_cost_agent_delete_invoice".
-- sql/056 dulu sudah grant ke authenticated; kemungkinan tercabut oleh blok revoke massal fn_cost_agent_* (pola GRANT
-- bagian 11 sql/054: revoke semua lalu grant allowlist) yg dijalankan ulang di 057 -- allowlist itu tidak memuat delete_invoice.
-- Keamanan TIDAK berubah: fungsi tetap SECURITY DEFINER dgn guard fn_cost_agent_assert_edit('cost_agent_invoice') + is_admin()
-- di dalamnya (sql/056). Idempotent, aman dijalankan berulang.

-- 0. Diagnosa (opsional, jalankan dulu utk melihat kondisi sekarang):
-- select p.oid::regprocedure, p.proacl,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_exec
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'fn_cost_agent_delete_invoice';

do $$
begin
  -- Pre-check: fungsi (bigint, text) dari sql/056 harus ada.
  if to_regprocedure('public.fn_cost_agent_delete_invoice(bigint, text)') is null then
    raise exception '058: public.fn_cost_agent_delete_invoice(bigint, text) tidak ditemukan -- jalankan sql/056 dulu';
  end if;

  revoke all on function public.fn_cost_agent_delete_invoice(bigint, text) from public, anon;
  grant execute on function public.fn_cost_agent_delete_invoice(bigint, text) to authenticated, service_role;
end $$;

-- Cek hasil (harus true):
select has_function_privilege('authenticated', 'public.fn_cost_agent_delete_invoice(bigint, text)', 'execute') as authenticated_can_exec,
       has_function_privilege('anon', 'public.fn_cost_agent_delete_invoice(bigint, text)', 'execute') as anon_can_exec;
