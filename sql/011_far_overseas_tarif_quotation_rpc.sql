-- ============================================================================
-- 011_far_overseas_tarif_quotation_rpc.sql
-- PATCH atas 5 RPC yang SUDAH DIBUAT user sendiri (21_rpc_quotation_management.sql) --
-- BUKAN bikin RPC baru. Signature/nama SAMA PERSIS dgn yang sudah dijalankan ke
-- production (CREATE OR REPLACE dgn signature identik = aman, tidak bentrok
-- spt error 42P13 sebelumnya).
--
-- Kenapa perlu di-patch: 5 RPC ini SECURITY DEFINER menulis ke tabel ber-RLS
-- (far_overseas_vendor_master/far_overseas_tarif_quotation/..._detail) TAPI
-- belum ada guard has_edit_access -- artinya SIAPA PUN yang login (termasuk yang
-- TIDAK py akses edit halaman Tarif Vendor FAR Overseas) bisa panggil RPC ini
-- langsung dari console browser dan mengubah tarif. Pola wajib project ini:
-- "RPC SECURITY DEFINER bypass RLS total -- WAJIB guard has_edit_access di baris
-- pertama" (lihat CLAUDE.md bagian RBAC). Body lain TIDAK diubah dari versi user,
-- hanya nambah blok guard di baris pertama tiap fungsi.
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_far_overseas_vendor_master(
  p_id          uuid DEFAULT NULL,
  p_vendor_name text DEFAULT NULL,
  p_aktif       boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_edit_access('settings_tarif_far_overseas_vendor') THEN
    RAISE EXCEPTION 'Not authorized to edit FAR Overseas vendor tariffs';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO far_overseas_vendor_master (vendor_name, aktif)
    VALUES (p_vendor_name, COALESCE(p_aktif, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE far_overseas_vendor_master SET
      vendor_name = COALESCE(p_vendor_name, vendor_name),
      aktif        = COALESCE(p_aktif, aktif),
      updated_at    = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION upsert_far_overseas_tarif_quotation(
  p_id               uuid    DEFAULT NULL,
  p_vendor_name      text    DEFAULT NULL,
  p_jenis_layanan    text    DEFAULT NULL,
  p_tipe_layanan     text    DEFAULT NULL,
  p_origin           text    DEFAULT NULL,
  p_tujuan           text    DEFAULT NULL,
  p_kategori_barang  text    DEFAULT NULL,
  p_mata_uang        text    DEFAULT NULL,
  p_periode_mulai    date    DEFAULT NULL,
  p_periode_selesai  date    DEFAULT NULL,
  p_catatan          text    DEFAULT NULL,
  p_aktif            boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_edit_access('settings_tarif_far_overseas_vendor') THEN
    RAISE EXCEPTION 'Not authorized to edit FAR Overseas vendor tariffs';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO far_overseas_tarif_quotation (
      vendor_name, jenis_layanan, tipe_layanan, origin, tujuan, kategori_barang,
      mata_uang, periode_mulai, periode_selesai, catatan, aktif
    ) VALUES (
      p_vendor_name, p_jenis_layanan, p_tipe_layanan, p_origin, p_tujuan, p_kategori_barang,
      p_mata_uang, COALESCE(p_periode_mulai, CURRENT_DATE), p_periode_selesai, p_catatan, COALESCE(p_aktif, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE far_overseas_tarif_quotation SET
      vendor_name      = COALESCE(p_vendor_name, vendor_name),
      jenis_layanan    = COALESCE(p_jenis_layanan, jenis_layanan),
      tipe_layanan      = p_tipe_layanan,
      origin             = COALESCE(p_origin, origin),
      tujuan              = COALESCE(p_tujuan, tujuan),
      kategori_barang      = p_kategori_barang,
      mata_uang             = COALESCE(p_mata_uang, mata_uang),
      periode_mulai          = COALESCE(p_periode_mulai, periode_mulai),
      periode_selesai         = COALESCE(p_periode_selesai, periode_selesai),
      catatan                  = p_catatan,
      aktif                     = COALESCE(p_aktif, aktif),
      updated_at                 = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION upsert_far_overseas_tarif_quotation_detail(
  p_id                 uuid    DEFAULT NULL,
  p_quotation_id       uuid    DEFAULT NULL,
  p_berat_min          numeric DEFAULT NULL,
  p_berat_max          numeric DEFAULT NULL,
  p_harga_per_kg       numeric DEFAULT NULL,
  p_harga_per_cbm      numeric DEFAULT NULL,
  p_harga_per_cbm_min  numeric DEFAULT NULL,
  p_harga_per_cbm_max  numeric DEFAULT NULL,
  p_ppn_status         text    DEFAULT NULL,
  p_notes              text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_edit_access('settings_tarif_far_overseas_vendor') THEN
    RAISE EXCEPTION 'Not authorized to edit FAR Overseas vendor tariffs';
  END IF;

  IF p_id IS NULL THEN
    IF p_quotation_id IS NULL THEN
      RAISE EXCEPTION 'p_quotation_id wajib diisi utk menambah baris rentang berat baru';
    END IF;
    INSERT INTO far_overseas_tarif_quotation_detail (
      quotation_id, berat_min, berat_max, harga_per_kg, harga_per_cbm,
      harga_per_cbm_min, harga_per_cbm_max, ppn_status, notes
    ) VALUES (
      p_quotation_id, p_berat_min, p_berat_max, p_harga_per_kg, p_harga_per_cbm,
      p_harga_per_cbm_min, p_harga_per_cbm_max, p_ppn_status, p_notes
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE far_overseas_tarif_quotation_detail SET
      berat_min           = p_berat_min,
      berat_max            = p_berat_max,
      harga_per_kg          = p_harga_per_kg,
      harga_per_cbm           = p_harga_per_cbm,
      harga_per_cbm_min        = p_harga_per_cbm_min,
      harga_per_cbm_max         = p_harga_per_cbm_max,
      ppn_status                 = p_ppn_status,
      notes                       = p_notes,
      updated_at                   = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION nonaktifkan_far_overseas_tarif_quotation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.has_edit_access('settings_tarif_far_overseas_vendor') THEN
    RAISE EXCEPTION 'Not authorized to edit FAR Overseas vendor tariffs';
  END IF;

  UPDATE far_overseas_tarif_quotation
  SET aktif = false, updated_at = now()
  WHERE id = p_id;
END;
$$;


CREATE OR REPLACE FUNCTION hapus_far_overseas_tarif_quotation_detail(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.has_edit_access('settings_tarif_far_overseas_vendor') THEN
    RAISE EXCEPTION 'Not authorized to edit FAR Overseas vendor tariffs';
  END IF;

  DELETE FROM far_overseas_tarif_quotation_detail WHERE id = p_id;
END;
$$;

-- Cek hasilnya -- harus 5 baris:
SELECT proname FROM pg_proc
WHERE proname IN (
  'upsert_far_overseas_vendor_master',
  'upsert_far_overseas_tarif_quotation',
  'upsert_far_overseas_tarif_quotation_detail',
  'nonaktifkan_far_overseas_tarif_quotation',
  'hapus_far_overseas_tarif_quotation_detail'
);
