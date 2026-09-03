// Helper bersama untuk ringkasan Cost Validation Courier (tabel_cost_validasi). SATU-SATUNYA
// tempat logic ini boleh ada -- dipakai baik oleh CostValidationModal.tsx (detail per shipment)
// MAUPUN SharedDataTable.tsx (badge persentase di tombol Cost Validation halaman Audit Courier).
// JANGAN duplikat logic ini di tempat lain -- kalau aturan visibilitas/klasifikasi baris
// berubah, cukup ubah di sini, otomatis konsisten di kedua tempat.

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

export type CostValidationSummary = {
  total_cost_cek: number;
  total_ok: number;
  total_selisih: number;
  total_na: number;
  status_cost: 'OK' | 'ADA SELISIH' | 'N/A';
  invoice_freight_status: 'OK' | 'N/A' | 'ADA SELISIH';
  invoice_duty_status: 'OK' | 'N/A' | 'ADA SELISIH';
  pct: number;
};

// Replika PERSIS `liveSummary` di CostValidationModal.tsx -- dihitung dari status & visibilitas
// baris yang BENERAN tampil di tabel Invoice Freight Validation & Invoice Duty Validation,
// bukan dibaca langsung dari kolom tersimpan (total_cost_cek/status_cost dst, yang cuma diisi
// n8n waktu data pertama dibuat dan tidak ikut ter-update saat user edit manual).
export function computeLiveCostSummary(data: any, jenisDokumen?: string | null): CostValidationSummary {
  if (!data) {
    return { total_cost_cek: 0, total_ok: 0, total_selisih: 0, total_na: 0, status_cost: 'N/A', invoice_freight_status: 'N/A', invoice_duty_status: 'N/A', pct: 0 };
  }

  const isPib = (jenisDokumen || data.jenis_dokumen || '').toUpperCase() === 'PIB';

  const mainFields = [
    { visible: isRowVisible(data.cv_freight_status, data.cv_freight_expected, data.cv_freight_actual), status: data.cv_freight_status, selisih: Number(data.cv_freight_selisih) },
    { visible: isRowVisible(data.cv_fuel_status, data.cv_fuel_expected, data.cv_fuel_actual), status: data.cv_fuel_status, selisih: Number(data.cv_fuel_selisih) },
    { visible: isRowVisible(data.cv_vat_freight_status, data.cv_vat_freight_expected, data.cv_vat_freight_actual_net), status: data.cv_vat_freight_status, selisih: Number(data.cv_vat_freight_selisih) },
    { visible: data.cv_import_export_duties !== null || data.cv_duties_expected !== null, status: data.cv_duties_status, selisih: Number(data.cv_duties_selisih) },
    { visible: isPib && isRowVisible(data.cv_nonroutine_status, data.cv_nonroutine_expected, data.cv_nonroutine_actual), status: data.cv_nonroutine_status, selisih: Number(data.cv_nonroutine_selisih) },
    { visible: data.cv_disbursement_actual != null || isRowVisible(data.cv_disbursement_status, data.cv_disbursement_expected, data.cv_disbursement_actual), status: data.cv_disbursement_status, selisih: Number(data.cv_disbursement_selisih) },
    { visible: data.cv_processing_fee_actual != null || isRowVisible(data.cv_processing_fee_status, data.cv_processing_fee_expected, data.cv_processing_fee_actual), status: data.cv_processing_fee_status, selisih: Number(data.cv_processing_fee_selisih) },
    { visible: data.cv_storage_actual !== null || data.cv_storage_status === 'MANUAL', status: data.cv_storage_status, selisih: Number(data.cv_storage_selisih) },
    { visible: isRowVisible(data.cv_vat_duty_status, data.cv_vat_duty_expected, data.cv_vat_duty_actual_net), status: data.cv_vat_duty_status, selisih: Number(data.cv_vat_duty_selisih) },
  ];

  let total_ok = 0, total_selisih = 0, total_na = 0;
  mainFields.forEach(f => {
    if (!f.visible) return;
    const cls = classifyRow(f.status, f.selisih);
    if (cls === 'OK') total_ok++;
    else if (cls === 'SELISIH') total_selisih++;
    else total_na++;
  });

  let invoiceFreightStatus = data.cv_total_freight_status || 'N/A';
  if (invoiceFreightStatus === 'SELISIH') {
    const totalSelisihNum = (Number(data.cv_total_freight_selisih) || 0) - sumAdjustments(data.cv_other_freight_adjustments);
    if (totalSelisihNum > 1000) invoiceFreightStatus = 'OVERCHARGE';
    else if (totalSelisihNum < -1000) invoiceFreightStatus = 'UNDERCHARGE';
  }

  const dutyExpectedNum = Number(data.cv_total_duty_expected || 0);
  let invoiceDutyStatus = 'N/A';
  if (dutyExpectedNum !== 0) {
    let dutyActualNum = Number(data.cv_total_duty_actual || 0) - sumAdjustments(data.cv_other_duty_adjustments);
    const dutySelisihNum = dutyActualNum - dutyExpectedNum;
    if (Math.abs(dutySelisihNum) <= dutyExpectedNum * 0.02) invoiceDutyStatus = 'OK';
    else if (dutyActualNum > dutyExpectedNum) invoiceDutyStatus = 'OVERCHARGE';
    else invoiceDutyStatus = 'UNDERCHARGE';
  }

  const isOverchargeLike = (s: string) => s === 'OVERCHARGE' || s === 'SELISIH';
  const overallStatusCost = (isOverchargeLike(invoiceFreightStatus) || isOverchargeLike(invoiceDutyStatus)) ? 'ADA SELISIH' : 'OK';

  const total_cost_cek = total_ok + total_selisih;

  return {
    total_cost_cek,
    total_ok,
    total_selisih,
    total_na,
    status_cost: overallStatusCost,
    invoice_freight_status: classifyRow(invoiceFreightStatus) === 'NA' ? 'N/A' : (classifyRow(invoiceFreightStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
    invoice_duty_status: classifyRow(invoiceDutyStatus) === 'NA' ? 'N/A' : (classifyRow(invoiceDutyStatus) === 'OK' ? 'OK' : 'ADA SELISIH'),
    pct: total_cost_cek > 0 ? Math.round((total_ok / total_cost_cek) * 100) : 0,
  };
}
