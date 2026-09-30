-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 029 — Guard LOCK server utk fn_delete_far_overseas_air (2026-09-30) — BELUM DIJALANKAN.
--
-- Body = REPLIKA PERSIS versi live (pg_get_functiondef kiriman user 2026-09-30), signature &
-- return type SAMA -> CREATE OR REPLACE aman (tidak ada overload baru). Satu-satunya tambahan:
-- memo yang sudah ditandatangani Prepared By (TIER1_DONE / PIC_DONE / TIER2_DONE / APPROVED)
-- DITOLAK dihapus -- sama aturan tombol Delete di UI (`isMemoLocked`) & lock update RPC sql/027.
-- PENDING / REJECTED / NULL tetap boleh dihapus (termasuk baris kosong "Add Manual Entry" yang
-- dibatalkan). Memo yang id-nya tidak ada: perilaku lama (tidak error, 0 baris terhapus).
-- Idempotent, aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_delete_far_overseas_air(p_far_overseas_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_deleted_cost_count  integer;
  v_unlinked_queue_count integer;
  v_status text;
BEGIN
  IF NOT public.has_edit_access('direct_loading') THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak punya izin edit untuk Direct Loading.';
  END IF;

  -- LOCK (2026-09-30): kunci baris dulu supaya tidak balapan dgn approve yang sedang berjalan.
  SELECT approval_status INTO v_status
  FROM rekapan_far_overseas_air
  WHERE id = p_far_overseas_id
  FOR UPDATE;

  IF v_status IN ('TIER1_DONE', 'PIC_DONE', 'TIER2_DONE', 'APPROVED') THEN
    RAISE EXCEPTION 'Memo is locked after Prepared By signed (status: %) — undo the sign or reject it before deleting', v_status;
  END IF;

  DELETE FROM cost_validasi_far_overseas_air WHERE far_overseas_id = p_far_overseas_id;
  GET DIAGNOSTICS v_deleted_cost_count = ROW_COUNT;

  UPDATE far_overseas_air_processing_queue
  SET far_overseas_id = NULL
  WHERE far_overseas_id = p_far_overseas_id;
  GET DIAGNOSTICS v_unlinked_queue_count = ROW_COUNT;

  DELETE FROM rekapan_far_overseas_air WHERE id = p_far_overseas_id;

  RETURN jsonb_build_object(
    'deleted_rekapan_id',          p_far_overseas_id,
    'deleted_cost_validasi_count', v_deleted_cost_count,
    'unlinked_queue_rows',         v_unlinked_queue_count,
    'success',                     true
  );
END;
$function$;

revoke execute on function public.fn_delete_far_overseas_air(uuid) from public, anon;
grant execute on function public.fn_delete_far_overseas_air(uuid) to authenticated;
