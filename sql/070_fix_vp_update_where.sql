-- 070: perbaiki "UPDATE requires a WHERE clause" pada fn_hitung_vendor_payments_seaair (panel Vendor payments Sea & Air).
-- Penyebab: ekstensi safeupdate (aktif utk role PostgREST/authenticated) menolak UPDATE tanpa WHERE. Satu-satunya pelanggar:
--   UPDATE _vp_inv SET oblig = round(grand - cn + dn, 2);
-- Patch ini membaca definisi fungsi LIVE, menambah `WHERE true`, lalu CREATE OR REPLACE (signature/grant tidak berubah). Idempotent.
-- Dijalankan MANUAL di SQL Editor (sesi Claude hanya punya akses baca).
DO $$
DECLARE
  d text;
  v_old constant text := 'UPDATE _vp_inv SET oblig = round(grand - cn + dn, 2);';
BEGIN
  d := pg_get_functiondef('public.fn_hitung_vendor_payments_seaair(uuid)'::regprocedure);
  IF position(v_old in d) = 0 THEN
    RAISE NOTICE 'Pola tidak ditemukan (sudah diperbaiki?) -- tidak ada perubahan.';
    RETURN;
  END IF;
  EXECUTE replace(d, v_old, 'UPDATE _vp_inv SET oblig = round(grand - cn + dn, 2) WHERE true;');
  RAISE NOTICE 'fn_hitung_vendor_payments_seaair diperbarui.';
END $$;

-- Cek setelah dijalankan: buka panel (atau) select public.fn_vp_simpan_hasil_seaair('<seaair_id>'); -> ada_data true / alasan, bukan error.
