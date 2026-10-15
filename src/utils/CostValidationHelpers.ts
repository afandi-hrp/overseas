// Helper bersama untuk ringkasan Cost Validation Courier (tabel_cost_validasi). SATU-SATUNYA
// tempat logic ini boleh ada -- dipakai baik oleh CostValidationModal.tsx (detail per shipment)
// MAUPUN SharedDataTable.tsx (badge persentase di tombol Cost Validation halaman Audit Courier).
// JANGAN duplikat logic ini di tempat lain -- kalau aturan visibilitas/klasifikasi baris
// berubah, cukup ubah di sini, otomatis konsisten di kedua tempat.
import { courierCnStates, courierHasStorage, courierStorageSaved, isCourierRulesRecord, type CnSide } from './CourierRecapRules';

export function isRowVisible(status: string | undefined, expected: any, actual?: any): boolean {
  const isNa = !status || status.toUpperCase() === 'N/A';
  if (!isNa) return true;
  if (actual !== null && actual !== undefined && actual !== '') return true;
  const isEmptyEx = expected === null || expected === undefined || expected === '';
  const isEmptyAc = actual === null || actual === undefined || actual === '';
  return !(isEmptyEx && isEmptyAc);
}

function classifyRow(status: any, selisih?: number): 'OK' | 'SELISIH' | 'NA' {
  const s = (status || '').toString().toUpperCase();
  if (s === 'OK') return 'OK';
  if (['SELISIH', 'OVERCHARGE', 'UNDERCHARGE'].includes(s)) {
    let direction = s;
    if (direction === 'SELISIH' && selisih !== undefined && selisih !== null && !isNaN(selisih)) {
      if (selisih > 1000) direction = 'OVERCHARGE';
      else if (selisih < -1000) direction = 'UNDERCHARGE';
    }
    return direction === 'UNDERCHARGE' ? 'OK' : 'SELISIH';
  }
  return 'NA';
}

function sumAdjustments(raw: any): number {
  let arr: any[] = [];
  if (typeof raw === 'string') { try { arr = JSON.parse(raw) || []; } catch (e) {} }
  else if (Array.isArray(raw)) { arr = raw; }
  else if (raw !== null && typeof raw === 'object') { arr = Object.values(raw); }
  return arr.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
}

// Review cost per invoice (sql/038 `cost_validasi_review_courier`, 2026-10-02): "Accept difference" (MATCH) =
// semua baris invoice itu dihitung sesuai (pola konfirmasi segmen Sea & Air); "Ask vendor" (MISMATCH) = tetap
// dihitung selisih. Baris detail di tabel TIDAK berubah, hanya ringkasan/persen.
export type CostReviewSection = 'FREIGHT' | 'DUTY';
// Accept per BARIS (sql/041 `cost_validasi_review_courier_item`, 2026-10-05, panel Validation Invoice Recap):
// berlaku HANYA selama Expected/Actual baris itu masih sama dgn snapshot saat di-Accept -- nilai berubah (mis.
// setelah upload susulan) -> Accept gugur & baris muncul lagi di ringkasan.
export type CostItemReview = { status: 'MATCH' | 'MISMATCH'; expected: number | null; actual: number | null };
export type CostReviewMap = Partial<Record<CostReviewSection, 'MATCH' | 'MISMATCH'>> & { items?: Record<string, CostItemReview> };

// Baris biaya yang punya selisih (Overcharge / Undercharge / Difference) -- sumber ringkasan panel Validation.
// `accepted`: 'item' = di-Accept per baris (sql/041), 'section' = invoice di-Accept (review per invoice sql/038).
export type CostDiffRow = {
  key: string;
  section: CostReviewSection;
  label: string;
  expected: number | null;
  actual: number | null;
  selisih: number | null;
  status: 'OVERCHARGE' | 'UNDERCHARGE' | 'DIFFERENCE';
  accepted: 'item' | 'section' | null;
  // Pernah di-Accept per baris tapi nilainya berubah sesudahnya.
  stale: boolean;
};

export type CostValidationSummary = {
  total_cost_cek: number;
  // total_ok TERMASUK baris berselisih yang sudah di-Accept (per baris sql/041 atau per invoice sql/038). `total_accepted` =
  // jumlah baris itu (2026-10-15, permintaan user: kotak Accepted terpisah) -> OK murni = total_ok - total_accepted.
  // Accuracy (pct) = (OK + Accepted) / (OK + Accepted + Difference) -- N/A tidak dihitung (rumus TIDAK berubah).
  total_ok: number;
  total_accepted?: number;
  // TOTAL tabel Invoice Freight / Invoice Duty sudah di-Accept seluruh selisihnya (label "✓ ACCEPTED").
  freight_total_accepted?: boolean;
  duty_total_accepted?: boolean;
  total_selisih: number;
  total_na: number;
  status_cost: 'OK' | 'ADA SELISIH' | 'N/A';
  invoice_freight_status: 'OK' | 'N/A' | 'ADA SELISIH';
  invoice_duty_status: 'OK' | 'N/A' | 'ADA SELISIH';
  pct: number;
  // Ada selisih per invoice SEBELUM review diterapkan (dipakai utk menampilkan kotak review).
  section_diff: { FREIGHT: boolean; DUTY: boolean };
  // Semua baris berselisih (termasuk yang sudah di-Accept -- lihat `accepted`).
  diff_rows: CostDiffRow[];
  // Revisi Invoice Recap 2026-10-14 (CourierRecapRules.ts): CN yang sisanya belum habis & estimasi storage yang belum
  // disimpan. Ikut menentukan pct HANYA bila `rules_apply` (baris cost dibuat setelah fitur aktif).
  cn_pending?: CnSide[];
  storage_pending?: boolean;
  rules_apply?: boolean;
};

const numOrNull = (v: any): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const sameAmount = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1);
export const itemReviewValid = (rev: CostItemReview | undefined, expected: any, actual: any): boolean =>
  !!rev && rev.status === 'MATCH' && sameAmount(rev.expected, numOrNull(expected)) && sameAmount(rev.actual, numOrNull(actual));
// Arah selisih utk ringkasan (SAMA resolveStatus tabel: SELISIH > Rp 1.000 = Overcharge, < -Rp 1.000 = Undercharge).
const resolveDiffStatus = (status: any, selisih: number | null): CostDiffRow['status'] | null => {
  const s = (status || '').toString().toUpperCase();
  if (s === 'OVERCHARGE') return 'OVERCHARGE';
  if (s === 'UNDERCHARGE') return 'UNDERCHARGE';
  if (s === 'SELISIH') {
    if (selisih !== null && selisih > 1000) return 'OVERCHARGE';
    if (selisih !== null && selisih < -1000) return 'UNDERCHARGE';
    return 'DIFFERENCE';
  }
  return null;
};

// Replika PERSIS `liveSummary` di CostValidationModal.tsx -- dihitung dari status & visibilitas
// baris yang BENERAN tampil di tabel Invoice Freight Validation & Invoice Duty Validation,
// bukan dibaca langsung dari kolom tersimpan (total_cost_cek/status_cost dst, yang cuma diisi
// n8n waktu data pertama dibuat dan tidak ikut ter-update saat user edit manual).
export function computeLiveCostSummary(data: any, jenisDokumen?: string | null, reviews?: CostReviewMap | null): CostValidationSummary {
  if (!data) {
    return { total_cost_cek: 0, total_ok: 0, total_accepted: 0, total_selisih: 0, total_na: 0, status_cost: 'N/A', invoice_freight_status: 'N/A', invoice_duty_status: 'N/A', pct: 0, section_diff: { FREIGHT: false, DUTY: false }, diff_rows: [] };
  }

  const isPib = (jenisDokumen || data.jenis_dokumen || '').toUpperCase() === 'PIB';

  // `key` = kunci Accept per baris (sql/041); `exp`/`act` = kolom Expected/Actual baris itu (snapshot Accept).
  const mainFields = [
    { key: 'freight', label: 'Freight charge', exp: 'cv_freight_expected', act: 'cv_freight_actual', sec: 'FREIGHT', visible: isRowVisible(data.cv_freight_status, data.cv_freight_expected, data.cv_freight_actual), status: data.cv_freight_status, selisih: Number(data.cv_freight_selisih) },
    { key: 'fuel', label: 'Fuel surcharge', exp: 'cv_fuel_expected', act: 'cv_fuel_actual', sec: 'FREIGHT', visible: isRowVisible(data.cv_fuel_status, data.cv_fuel_expected, data.cv_fuel_actual), status: data.cv_fuel_status, selisih: Number(data.cv_fuel_selisih) },
    { key: 'vat_freight', label: 'VAT (freight)', exp: 'cv_vat_freight_expected', act: 'cv_vat_freight_actual_net', sec: 'FREIGHT', visible: isRowVisible(data.cv_vat_freight_status, data.cv_vat_freight_expected, data.cv_vat_freight_actual_net), status: data.cv_vat_freight_status, selisih: Number(data.cv_vat_freight_selisih) },
    { key: 'duties', label: (data.cv_courier || '').toUpperCase() === 'DHL' ? 'Import export duties' : 'Duty & tax', exp: 'cv_duties_expected', act: 'cv_import_export_duties', sec: 'DUTY', visible: data.cv_import_export_duties !== null || data.cv_duties_expected !== null, status: data.cv_duties_status, selisih: Number(data.cv_duties_selisih) },
    { key: 'nonroutine', label: 'Non-routine entry', exp: 'cv_nonroutine_expected', act: 'cv_nonroutine_actual', sec: 'DUTY', visible: isPib && isRowVisible(data.cv_nonroutine_status, data.cv_nonroutine_expected, data.cv_nonroutine_actual), status: data.cv_nonroutine_status, selisih: Number(data.cv_nonroutine_selisih) },
    { key: 'disbursement', label: 'Disbursement', exp: 'cv_disbursement_expected', act: 'cv_disbursement_actual', sec: 'DUTY', visible: data.cv_disbursement_actual != null || isRowVisible(data.cv_disbursement_status, data.cv_disbursement_expected, data.cv_disbursement_actual), status: data.cv_disbursement_status, selisih: Number(data.cv_disbursement_selisih) },
    { key: 'processing_fee', label: 'Processing fee', exp: 'cv_processing_fee_expected', act: 'cv_processing_fee_actual', sec: 'DUTY', visible: data.cv_processing_fee_actual != null || isRowVisible(data.cv_processing_fee_status, data.cv_processing_fee_expected, data.cv_processing_fee_actual), status: data.cv_processing_fee_status, selisih: Number(data.cv_processing_fee_selisih) },
    { key: 'storage', label: 'Bonded storage', exp: 'cv_storage_expected', act: 'cv_storage_actual', sec: 'DUTY', visible: data.cv_storage_actual !== null || data.cv_storage_status === 'MANUAL', status: data.cv_storage_status, selisih: Number(data.cv_storage_selisih) },
    { key: 'vat_duty', label: 'VAT duty', exp: 'cv_vat_duty_expected', act: 'cv_vat_duty_actual_net', sec: 'DUTY', visible: isRowVisible(data.cv_vat_duty_status, data.cv_vat_duty_expected, data.cv_vat_duty_actual_net), status: data.cv_vat_duty_status, selisih: Number(data.cv_vat_duty_selisih) },
  ];

  let total_ok = 0, total_selisih = 0, total_na = 0, total_accepted = 0;
  const rowDiff = { FREIGHT: false, DUTY: false };
  const diff_rows: CostDiffRow[] = [];
  mainFields.forEach(f => {
    if (!f.visible) return;
    const sec = f.sec as CostReviewSection;
    const selisihNum = isNaN(f.selisih) ? null : f.selisih;
    const itemRev = reviews?.items?.[f.key];
    const itemOk = itemReviewValid(itemRev, data[f.exp], data[f.act]);
    const sectionOk = reviews?.[sec] === 'MATCH';
    const diffStatus = resolveDiffStatus(f.status, selisihNum);
    if (diffStatus) {
      diff_rows.push({
        key: f.key, section: sec, label: f.label, expected: numOrNull(data[f.exp]), actual: numOrNull(data[f.act]), selisih: selisihNum,
        status: diffStatus, accepted: itemOk ? 'item' : sectionOk ? 'section' : null, stale: !!itemRev && !itemOk,
      });
    }
    let cls = classifyRow(f.status, f.selisih);
    if (cls === 'SELISIH') {
      rowDiff[sec] = true;
      if (sectionOk || itemOk) cls = 'OK';
    }
    // Accepted = baris berselisih (Over/Undercharge -- Undercharge memang sudah dihitung OK) yang di-Accept (2026-10-15).
    if (diffStatus && (sectionOk || itemOk) && cls === 'OK') total_accepted++;
    if (cls === 'OK') total_ok++;
    else if (cls === 'SELISIH') total_selisih++;
    else total_na++;
  });

  let invoiceFreightStatus = data.cv_total_freight_status || 'N/A';
  const freightAdj = sumAdjustments(data.cv_other_freight_adjustments);
  const freightTotalSelisih = (Number(data.cv_total_freight_selisih) || 0) - freightAdj;
  if (invoiceFreightStatus === 'SELISIH') {
    if (freightTotalSelisih > 1000) invoiceFreightStatus = 'OVERCHARGE';
    else if (freightTotalSelisih < -1000) invoiceFreightStatus = 'UNDERCHARGE';
  }

  const dutyExpectedNum = Number(data.cv_total_duty_expected || 0);
  const dutyActualNum = Number(data.cv_total_duty_actual || 0) - sumAdjustments(data.cv_other_duty_adjustments);
  let invoiceDutyStatus = 'N/A';
  if (dutyExpectedNum !== 0) {
    const dutySelisihNum = dutyActualNum - dutyExpectedNum;
    if (Math.abs(dutySelisihNum) <= dutyExpectedNum * 0.02) invoiceDutyStatus = 'OK';
    else if (dutyActualNum > dutyExpectedNum) invoiceDutyStatus = 'OVERCHARGE';
    else invoiceDutyStatus = 'UNDERCHARGE';
  }

  const isOverchargeLike = (s: string) => s === 'OVERCHARGE' || s === 'SELISIH';
  const section_diff = { FREIGHT: rowDiff.FREIGHT || isOverchargeLike(invoiceFreightStatus), DUTY: rowDiff.DUTY || isOverchargeLike(invoiceDutyStatus) };

  // Total invoice (sql/041): jadi baris ringkasan HANYA kalau selisihnya tidak datang dari baris utama (mis. dari
  // Other charges). Kalau ada baris utama berselisih & SEMUA sudah di-Accept, total ikut dianggap beres.
  const totalAccepted = (sec: CostReviewSection, key: string, label: string, status: string, expected: any, actual: any, selisih: any): boolean => {
    const diffStatus = resolveDiffStatus(status, numOrNull(selisih));
    if (!diffStatus) return false;
    const mains = diff_rows.filter(r => r.section === sec);
    if (mains.length > 0) return mains.every(r => r.accepted !== null);
    const itemRev = reviews?.items?.[key];
    const itemOk = itemReviewValid(itemRev, expected, actual);
    diff_rows.push({
      key, section: sec, label, expected: numOrNull(expected), actual: numOrNull(actual), selisih: numOrNull(selisih), status: diffStatus,
      accepted: itemOk ? 'item' : reviews?.[sec] === 'MATCH' ? 'section' : null, stale: !!itemRev && !itemOk,
    });
    return itemOk;
  };
  const freightTotalOk = totalAccepted('FREIGHT', 'total_freight', 'Invoice freight total', invoiceFreightStatus,
    data.cv_total_freight_expected, (Number(data.cv_total_freight_actual) || 0) - freightAdj, freightTotalSelisih);
  const dutyTotalOk = totalAccepted('DUTY', 'total_duty', 'Invoice duty total', invoiceDutyStatus,
    dutyExpectedNum, dutyActualNum, dutyActualNum - dutyExpectedNum);

  // Total invoice di-Accept (semua selisih baris utama / total di-Accept, atau review per invoice) -> label "✓ ACCEPTED" di TOTAL tabel.
  const isDiffLike = (st: string) => st === 'OVERCHARGE' || st === 'UNDERCHARGE' || st === 'SELISIH';
  const freight_total_accepted = (reviews?.FREIGHT === 'MATCH' || freightTotalOk) && isDiffLike(invoiceFreightStatus);
  const duty_total_accepted = (reviews?.DUTY === 'MATCH' || dutyTotalOk) && isDiffLike(invoiceDutyStatus);
  if ((reviews?.FREIGHT === 'MATCH' || freightTotalOk) && isOverchargeLike(invoiceFreightStatus)) invoiceFreightStatus = 'OK';
  if ((reviews?.DUTY === 'MATCH' || dutyTotalOk) && isOverchargeLike(invoiceDutyStatus)) invoiceDutyStatus = 'OK';
  const overallStatusCost = (isOverchargeLike(invoiceFreightStatus) || isOverchargeLike(invoiceDutyStatus)) ? 'ADA SELISIH' : 'OK';

  // Syarat 100% tambahan (2026-10-14): tiap Credit Note = 1 cek (OK bila sisa subtotal & VAT = 0), Bonded storage = 1 cek
  // (OK bila estimasi sudah disimpan). Hanya data setelah fitur aktif -- persen data lama TIDAK berubah.
  const cnStates = courierCnStates(data);
  const cn_pending = cnStates.filter(c => !c.done).map(c => c.side);
  const storage_pending = courierHasStorage(data) && !courierStorageSaved(data);
  const rules_apply = isCourierRulesRecord(data.created_at);
  if (rules_apply) {
    cnStates.forEach(c => { if (c.done) total_ok++; else total_selisih++; });
    if (courierHasStorage(data)) { if (storage_pending) total_selisih++; else total_ok++; }
  }

  const total_cost_cek = total_ok + total_selisih;

  return {
    total_cost_cek,
    total_ok,
    total_accepted,
    freight_total_accepted,
    duty_total_accepted,
    total_selisih,
    total_na,
    status_cost: overallStatusCost,
    invoice_freight_status: classifyRow(invoiceFreightStatus) === 'NA' ? 'N/A' : (classifyRow(invoiceFreightStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
    invoice_duty_status: classifyRow(invoiceDutyStatus) === 'NA' ? 'N/A' : (classifyRow(invoiceDutyStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
    pct: total_cost_cek > 0 ? Math.round((total_ok / total_cost_cek) * 100) : 0,
    section_diff,
    diff_rows,
    cn_pending,
    storage_pending,
    rules_apply,
  };
}
