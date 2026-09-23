-- 2026-09: kolom baru "Notes (Manual)" di Cost Validation FAR Overseas Air.
-- Wajib diisi manual (bukan otomasi n8n) sebelum memo bisa di-approve tahap Prepared By (Exim/TIER1).
-- Frontend: FarOverseasAirCostValidationModal.tsx (form isi) + FarOverseasAirDetailModal.tsx
-- (gating tombol Approve TIER1). Lihat docs/claude/far-overseas.md bagian "Cost Validation --
-- Notes (Manual) WAJIB sebelum approval Exim".

alter table public.cost_validasi_far_overseas_air
  add column if not exists notes_manual text;

-- Patch RPC update_cost_validasi_far_overseas_manual (body ASLI dikonfirmasi user via
-- pg_get_functiondef, 2026-09) -- REPLIKA PERSIS signature+body lama, HANYA menambah parameter
-- `p_notes_manual` (di akhir, default NULL -- aman utk pemanggil lama yg belum kirim parameter
-- ini) + 1 baris assignment kolom. Tidak ada logic lain yang diubah (termasuk TIDAK menambah
-- guard has_edit_access -- versi asli memang belum punya, konsisten dgn yang sudah ada).
CREATE OR REPLACE FUNCTION public.update_cost_validasi_far_overseas_manual(
  p_id uuid,
  p_document_validation jsonb DEFAULT NULL::jsonb,
  p_cost_validation jsonb DEFAULT NULL::jsonb,
  p_status text DEFAULT NULL::text,
  p_catatan text DEFAULT NULL::text,
  p_rate_row_used jsonb DEFAULT NULL::jsonb,
  p_notes_manual text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  UPDATE cost_validasi_far_overseas_air SET
    document_validation = COALESCE(p_document_validation, document_validation),
    cost_validation      = COALESCE(p_cost_validation, cost_validation),
    status                 = COALESCE(p_status, status),
    catatan                = COALESCE(p_catatan, catatan),
    rate_row_used            = COALESCE(p_rate_row_used, rate_row_used),
    notes_manual             = COALESCE(p_notes_manual, notes_manual),
    is_edited                  = true
  WHERE id = p_id
  RETURNING to_json(cost_validasi_far_overseas_air.*) INTO result;

  RETURN result;
END;
$function$;

-- Catatan pola COALESCE (SAMA seperti field lain di fungsi ini): mengirim string kosong ''
-- MASIH tersimpan (COALESCE cuma menahan NULL), tapi TIDAK BISA meng-clear notes_manual balik
-- ke NULL setelah pernah terisi -- konsisten dgn keterbatasan field lain di RPC ini, bukan bug
-- baru dari patch ini.

-- OPSIONAL, DISARANKAN -- penegakan server-side (pola project ini: gating WAJIB di 2 tempat,
-- frontend DAN server, lihat catatan approve_far_overseas_air di far-overseas.md). Guard ini
-- BELUM ditambahkan ke approve_far_overseas_air karena body aslinya (versi PIC per-memo) ada di
-- CLAUDE.md/far-overseas.md -- kalau mau ditegakkan di server juga, tambahkan di awal cabang
-- `p_step = 'TIER1'` pada approve_far_overseas_air:
--   if p_step = 'TIER1' then
--     if not exists (
--       select 1 from public.cost_validasi_far_overseas_air
--       where far_overseas_id = p_id and coalesce(btrim(notes_manual), '') <> ''
--     ) then
--       raise exception 'Cost Validation notes must be filled in before Exim approval';
--     end if;
--   end if;
