// Hitung ulang estimasi Bonded Storage Courier (tabel_cost_validasi) -- SATU sumber logika (2026-10-05), dipakai
// CostValidationModal (baru), CostValidationModalLegacy (Details/mode List) & ringkasan Cost Validation panel Invoice
// Recap (CourierCostSummary). Isi SAMA PERSIS logika lama di kedua modal (dipindah ke sini, tidak diubah):
// - Actual days = selisih hari ETA -> Release + 1 (ETA & Release dihitung penuh, permintaan user 2026-09).
// - Expected = RPC fn_hitung_storage (courier, jenis, actual days, berat storage: input manual > cv_storage_weight_kg >
//   cv_chargeable_kg).
// - Simpan = update cv_eta_date/cv_release_date/cv_storage_input_manual/cv_storage_weight_kg lalu RPC
//   fn_save_storage_estimate (trigger fn_recompute_totals), lalu baca ulang baris yang SAMA lewat id.
// Karena semua sisi menyimpan ke kolom yang sama, isian dari ringkasan & dari Details otomatis sinkron.
import { supabase } from '../lib/supabase';

export type StorageEstimate = { expected_idr: number; billing_days?: number; rate_per_day?: number; rate_per_kg?: number };

export function courierStorageActualDays(etaDate: string, releaseDate: string): number {
  if (!etaDate || !releaseDate) return 0;
  const diffTime = new Date(releaseDate).getTime() - new Date(etaDate).getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
}

export async function computeCourierStorageExpected(data: any, jenisDokumen: string | null | undefined, storageWeightManual: string, etaDate: string, releaseDate: string): Promise<StorageEstimate> {
  const courier = (data?.cv_courier || '').toUpperCase();
  const jd = (jenisDokumen || data?.jenis_dokumen || '').toUpperCase();
  const storage_weight = Number(storageWeightManual) || Number(data?.cv_storage_weight_kg) || Number(data?.cv_chargeable_kg) || 0;
  const { data: rpcData, error } = await supabase.rpc('fn_hitung_storage', {
    p_courier: courier,
    p_jenis: jd,
    p_actual_days: courierStorageActualDays(etaDate, releaseDate),
    p_weight_kg: storage_weight,
  });
  if (error) throw error;
  return {
    expected_idr: rpcData?.expected_idr || 0,
    billing_days: rpcData?.billing_days || 0,
    rate_per_day: rpcData?.rate_per_day || 0,
    rate_per_kg: rpcData?.rate_per_kg || 0,
  };
}

// Simpan estimasi baru; return baris tabel_cost_validasi terbaru (null kalau baca ulang gagal). Melempar error RPC.
export async function saveCourierStorageEstimate(data: any, etaDate: string, releaseDate: string, storageWeightManual: string, result: StorageEstimate): Promise<any | null> {
  await supabase
    .from('tabel_cost_validasi')
    .update({
      cv_eta_date: etaDate,
      cv_release_date: releaseDate,
      cv_storage_input_manual: true,
      cv_storage_weight_kg: Number(storageWeightManual) || null,
    })
    .eq('id', data.id);
  const { error } = await supabase.rpc('fn_save_storage_estimate', {
    p_cv_id: data.id,
    p_actual_days: courierStorageActualDays(etaDate, releaseDate),
    p_billing_days: result.billing_days || 0,
    p_rate_per_day: result.rate_per_day || 0,
    p_rate_per_kg: result.rate_per_kg || 0,
    p_expected_idr: result.expected_idr || 0,
  });
  if (error) throw error;
  // Baca ulang PERSIS baris yang diedit (id), bukan query awb/docId terbaru (lihat catatan lama di modal).
  const { data: freshRow, error: refetchError } = await supabase.from('tabel_cost_validasi').select('*').eq('id', data.id).single();
  return refetchError ? null : freshRow;
}
