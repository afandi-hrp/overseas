-- PATCH `update_rekapan_far_overseas_manual` -- REPLIKA PERSIS body yang user kirim
-- (`pg_get_functiondef`, 2026-09), HANYA nambah 2 kolom yang HILANG dari `v_allowed_columns`:
-- `item_description_manual` (NOTE 2 "Manual Note") dan `pic_user_id` (dropdown PIC per-memo).
--
-- Root cause ditemukan: kedua kolom ini SUDAH lama dipakai di frontend
-- (`REKAPAN_EDITABLE_FIELDS`, FarOverseasAirHelpers.ts) TAPI TIDAK ADA di whitelist RPC ini --
-- gejalanya SAMA PERSIS pola "toast tetap 'saved successfully' tapi nilai balik ke lama saat
-- refresh" yang sudah dicatat di CLAUDE.md sbg "sudah diperbaiki" -- ternyata perbaikan itu
-- belum (atau belum lagi) masuk ke versi RPC yang aktif sekarang. `item_description` SUDAH ADA
-- di whitelist (tidak perlu diapa-apakan, dikonfirmasi dari body yang dikirim user).
--
-- Body lain (logic loop, RAISE WARNING, edited_fields, dst) TIDAK diubah sama sekali dari versi
-- user -- HANYA menambah 2 string ke array `v_allowed_columns`.

CREATE OR REPLACE FUNCTION public.update_rekapan_far_overseas_manual(p_id uuid, p_updates jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_key              text;
  v_allowed_columns  text[] := ARRAY[
    'po_list', 'po_ori', 'dominant_company_code', 'vendor', 'ship_via',
    'no_invoice', 'invoice_date', 'departure_date', 'qty', 'weight_unit', 'unit_price',
    'unit_price_currency', 'freight_amount', 'clearance_amount', 'other_amount',
    'clearance_other_total', 'total_amount', 'total_amount_currency', 'kurs_used',
    'total_amount_idr', 'route_note', 'shipment_mode', 'origin_country',
    'destination_city', 'item_description', 'item_description_manual', 'status_note', 'other_note',
    'memo_title', 'expected_payment_date', 'vessel_internal_note', 'notes',
    'buyer_name', 'weight_breakdown', 'pic_name', 'pic_user_id', 'dokumen_urls'
  ];
  v_current_edited   jsonb;
  result             json;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) != 'object' THEN
    RAISE EXCEPTION 'p_updates harus berupa JSON object, contoh: {"vendor": "PT Baru", "unit_price": 220000}';
  END IF;

  SELECT COALESCE(edited_fields, '[]'::jsonb) INTO v_current_edited
  FROM rekapan_far_overseas_air WHERE id = p_id;

  IF v_current_edited IS NULL THEN
    v_current_edited := '[]'::jsonb;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_updates)
  LOOP
    IF v_key = ANY(v_allowed_columns) THEN
      IF v_key IN ('po_list', 'dokumen_urls') THEN
        EXECUTE format(
          'UPDATE rekapan_far_overseas_air SET %I = %L::jsonb WHERE id = %L',
          v_key, (p_updates->v_key)::text, p_id
        );
      ELSE
        EXECUTE format(
          'UPDATE rekapan_far_overseas_air SET %I = %L WHERE id = %L',
          v_key, p_updates->>v_key, p_id
        );
      END IF;

      IF NOT (v_current_edited ? v_key) THEN
        v_current_edited := v_current_edited || to_jsonb(ARRAY[v_key]);
      END IF;
    ELSE
      RAISE WARNING 'Kolom "%" tidak diizinkan diedit lewat RPC ini, dilewati.', v_key;
    END IF;
  END LOOP;

  UPDATE rekapan_far_overseas_air
  SET edited_fields = v_current_edited,
      is_edited      = true,
      updated_at      = now()
  WHERE id = p_id
  RETURNING to_json(rekapan_far_overseas_air.*) INTO result;

  RETURN result;
END;
$function$;
