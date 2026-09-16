// Modul Reporting (Dashboard + Cost per Vessel) -- ETL/alokasi biaya per vessel. SATU-SATUNYA
// tempat logic pencocokan vessel_name & pembagian biaya per sumber (Courier/Sea/Air/Borongan)
// ada di sini -- dipakai ReportingCostPerVesselPage.tsx (tombol "Recompute") DAN
// ReportingDashboardPage.tsx (baca hasilnya, TIDAK menghitung ulang sendiri -- lihat Aturan
// Umum #1 brief user: Dashboard & Cost per Vessel WAJIB pakai kueri/filter yang sama).
import { supabase } from '../lib/supabase';

export type MasterVessel = {
  vessel_id: number;
  vessel_name: string;
  alias_name: string[] | null;
  base: string;
  fleet_group: string;
  category: 'VESSEL' | 'OTHERS';
  status: 'AKTIF' | 'SCRAP';
};

export type AllocationMethod = 'COURIER' | 'SEA' | 'AIR' | 'BORONGAN';

export type AllocationRow = {
  method: AllocationMethod;
  period_month: string; // 'YYYY-MM-01'
  vessel_id: number | null;
  vessel_name_raw: string;
  source_table: string;
  source_row_id: string;
  source_label: string | null;
  courier_adm: number;
  duty: number;
  freight: number;
  handling_total: number;
  bm: number;
  ppn_pph: number;
  borongan_total: number;
  needs_review: boolean;
};

const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') return Number(v.replace(/,/g, '')) || 0;
  return Number(v) || 0;
};

// Vessel dipisah dgn tanda "+" (spasi-plus-spasi seperti di data lama, tapi regex ini generik
// terima ada/tidaknya spasi) -- SATU-SATUNYA tempat parsing "Jumlah Vessel" utk modul Reporting.
export function splitVesselList(text: any): string[] {
  const t = String(text || '').trim();
  if (!t) return [];
  return t.split('+').map(s => s.trim()).filter(Boolean);
}

const normalizeName = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

// Cocokkan 1 nama vessel mentah (hasil split) ke master_vessel -- exact match vessel_name ATAU
// salah satu alias_name (case/whitespace-insensitive). Return null kalau tidak ketemu -- baris
// TETAP disimpan (needs_review=true), TIDAK PERNAH dibuang diam-diam (Aturan Umum #3).
export function matchVessel(rawName: string, masterList: MasterVessel[]): MasterVessel | null {
  const norm = normalizeName(rawName);
  if (!norm) return null;
  for (const mv of masterList) {
    if (normalizeName(mv.vessel_name) === norm) return mv;
    if (mv.alias_name && mv.alias_name.some(a => normalizeName(a) === norm)) return mv;
  }
  return null;
}

export function monthStart(dateStr: string): string {
  const d = String(dateStr).substring(0, 10);
  return `${d.substring(0, 7)}-01`;
}

export async function fetchMasterVessels(): Promise<MasterVessel[]> {
  const { data, error } = await supabase.from('master_vessel').select('*').order('vessel_name');
  if (error) throw error;
  return (data || []) as MasterVessel[];
}

// ─── Formula total biaya -- SATU-SATUNYA sumber kebenaran (Aturan Umum #1: Dashboard & Cost per
// Vessel WAJIB pakai formula yang sama) ─────────────────────────────────────
export type MetricKey = 'courier_adm' | 'duty' | 'freight' | 'handling_total' | 'bm' | 'ppn_pph' | 'borongan_total';
export const ALL_METRIC_KEYS: MetricKey[] = ['courier_adm', 'duty', 'freight', 'handling_total', 'bm', 'ppn_pph', 'borongan_total'];
export const zeroSums = (): Record<MetricKey, number> => ({ courier_adm: 0, duty: 0, freight: 0, handling_total: 0, bm: 0, ppn_pph: 0, borongan_total: 0 });
export function totalCost(s: Record<MetricKey, number>): number { return ALL_METRIC_KEYS.reduce((a, k) => a + s[k], 0); }
export function totalExclPpn(s: Record<MetricKey, number>): number { return totalCost(s) - s.ppn_pph; }
export function metricForMethod(s: Record<MetricKey, number>, method: AllocationMethod | 'ALL'): number {
  if (method === 'ALL') return totalCost(s);
  if (method === 'COURIER') return s.courier_adm + s.duty + s.freight + s.bm + s.ppn_pph;
  if (method === 'SEA' || method === 'AIR') return s.duty + s.handling_total + s.bm + s.ppn_pph;
  return s.borongan_total;
}
export function addSums(target: Record<MetricKey, number>, row: any) {
  ALL_METRIC_KEYS.forEach(k => { target[k] += Number(row[k]) || 0; });
}

// Baris DB `reporting_cost_allocation` punya unique constraint (method, source_table,
// source_row_id, vessel_name_raw) -- kalau 1 baris sumber punya nama vessel yg SAMA MUNCUL 2X
// (mis. po_detail 2 entry utk vessel yg sama, atau kolom Vessel diketik "A + A") harus DIGABUNG
// (SUM) dulu SEBELUM push ke `rows`, bukan push 2 baris terpisah -- insert bakal gagal
// duplicate-key (2026-09, laporan user "Gagal recompute: duplicate key..."). Menggabung/SUM di
// sini juga SECARA MATEMATIS BENAR (bukan cuma workaround constraint): kalau vessel yg sama
// muncul 2x di daftar, itu berarti vessel itu dapat 2 "jatah" (baik dari pembagian rata di
// Sea/Air/Borongan, ATAU dari breakdown Courier yg sudah dihitung asumsi N total kemunculan
// nama) -- menjumlahkannya balik pas.
function pushDedupedRows(
  rows: AllocationRow[], names: string[], perNameValues: Record<MetricKey, number>, masterList: MasterVessel[],
  base: { method: AllocationMethod; period_month: string; source_table: string; source_row_id: string; source_label: string | null }
) {
  const map = new Map<string, Record<MetricKey, number>>();
  names.forEach(name => {
    const key = name || '(kosong)';
    if (!map.has(key)) map.set(key, zeroSums());
    addSums(map.get(key)!, perNameValues);
  });
  map.forEach((sums, name) => {
    const mv = matchVessel(name, masterList);
    rows.push({ ...base, vessel_id: mv?.vessel_id ?? null, vessel_name_raw: name, ...sums, needs_review: !mv });
  });
}

// ─── Per-sumber: bangun baris alokasi utk 1 bulan ──────────────────────────

async function buildCourierRows(monthStartStr: string, monthEndStr: string, masterList: MasterVessel[]): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from('rekapan_courier')
    .select('id, tgl_terima_email, vessel, awb, no_invoice, breakdown_courier_adm_vessel, breakdown_duty_vessel, breakdown_freight_vessel, breakdown_bm_vessel, breakdown_ppnpph_vessel')
    .gte('tgl_terima_email', monthStartStr)
    .lt('tgl_terima_email', monthEndStr);
  if (error) throw error;

  const rows: AllocationRow[] = [];
  (data || []).forEach((r: any) => {
    const names = splitVesselList(r.vessel);
    if (names.length === 0) names.push('');
    // Nilai breakdown SUDAH terbagi per kapal (Jumlah Vessel) -- TIDAK dibagi lagi di sini,
    // tiap nama vessel yg terdaftar di baris ini dapat nilai breakdown yg SAMA (permintaan user).
    // `source_label` -- identifier yg gampang dicari manual di halaman Rekapan Courier (No.
    // Invoice, fallback AWB) -- dipakai panel "NEEDS REVIEW" (Cost per Vessel).
    pushDedupedRows(rows, names, {
      courier_adm: num(r.breakdown_courier_adm_vessel),
      duty: num(r.breakdown_duty_vessel),
      freight: num(r.breakdown_freight_vessel),
      handling_total: 0,
      bm: num(r.breakdown_bm_vessel),
      ppn_pph: num(r.breakdown_ppnpph_vessel),
      borongan_total: 0,
    }, masterList, {
      method: 'COURIER', period_month: monthStartStr, source_table: 'rekapan_courier', source_row_id: String(r.id),
      source_label: r.no_invoice || r.awb || null,
    });
  });
  return rows;
}

// `rekapan_seaair` TIDAK punya kolom `vessel` mentah di top-level (beda dari
// `rekapan_courier`/`rekapan_far_overseas_air`) -- daftar vessel-nya ada di dalam `po_detail`
// (jsonb array `{po_no, vessel}`, lihat "Export Excel Rekapan Courier"/`SeaAirRekapanRowGroup`
// di SharedDataTable.tsx: Sea & Air Rekapan TETAP split PO<->Vessel via po_detail, beda dari
// Courier yang sudah berhenti split). Ambil SEMUA nama vessel dari tiap entry po_detail (`+` di
// dalam 1 entry ikut dipecah lagi, jaga2).
function extractSeaAirVesselNames(poDetail: any): string[] {
  let list: any[] = [];
  try {
    if (Array.isArray(poDetail)) list = poDetail;
    else if (typeof poDetail === 'string') list = JSON.parse(poDetail) || [];
  } catch { list = []; }
  const names: string[] = [];
  list.forEach((p: any) => { names.push(...splitVesselList(p?.vessel)); });
  return names;
}

async function buildSeaAirRows(monthStartStr: string, monthEndStr: string, masterList: MasterVessel[]): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from('rekapan_seaair')
    .select('id, tgl, shipment_type, po_detail, awb, no_invoice, duty_total, bm, ppn, pph, emkl_biaya, biaya_origin, biaya_destination, pbm_biaya, lift_off_biaya, inspeksi_biaya, handling_biaya, other_biaya')
    .gte('tgl', monthStartStr)
    .lt('tgl', monthEndStr);
  if (error) throw error;

  const rows: AllocationRow[] = [];
  (data || []).forEach((r: any) => {
    const shipmentType = String(r.shipment_type || '').toUpperCase();
    // SEA = LCL+FCL digabung, AIR = AIR terpisah (permintaan user) -- shipment_type lain (kalau
    // ada) TIDAK masuk method manapun, sengaja diabaikan (di luar cakupan 2 method ini).
    const method: AllocationMethod | null = (shipmentType === 'LCL' || shipmentType === 'FCL') ? 'SEA' : (shipmentType === 'AIR' ? 'AIR' : null);
    if (!method) return;

    const names = extractSeaAirVesselNames(r.po_detail);
    if (names.length === 0) names.push('');
    const count = names.length;

    // Kolom RAW (bukan `*_split` -- itu produk fitur split PO<->Vessel lain, lihat catatan di
    // atas `extractSeaAirVesselNames`) dibagi rata jumlah vessel di po_detail, sesuai formula
    // eksplisit user: "seluruh biaya dibagi rata dengan jumlah vessel pada kolom VESSEL".
    const duty = num(r.duty_total);
    const bm = num(r.bm);
    const ppnPph = num(r.ppn) + num(r.pph);
    const handlingTotal = num(r.emkl_biaya) + num(r.biaya_origin) + num(r.biaya_destination)
      + num(r.pbm_biaya) + num(r.lift_off_biaya) + num(r.inspeksi_biaya) + num(r.handling_biaya) + num(r.other_biaya);

    pushDedupedRows(rows, names, {
      courier_adm: 0,
      duty: duty / count,
      freight: 0,
      handling_total: handlingTotal / count,
      bm: bm / count,
      ppn_pph: ppnPph / count,
      borongan_total: 0,
    }, masterList, {
      method, period_month: monthStartStr, source_table: 'rekapan_seaair', source_row_id: String(r.id),
      source_label: r.no_invoice || r.awb || null,
    });
  });
  return rows;
}

async function buildBoronganRows(monthStartStr: string, monthEndStr: string, masterList: MasterVessel[]): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from('rekapan_far_overseas_air')
    .select('id, invoice_date, vessel_internal_note, total_amount, total_amount_idr, no_invoice, memo_title')
    .gte('invoice_date', monthStartStr)
    .lt('invoice_date', monthEndStr);
  if (error) throw error;

  const rows: AllocationRow[] = [];
  (data || []).forEach((r: any) => {
    const names = splitVesselList(r.vessel_internal_note);
    if (names.length === 0) names.push('');
    const count = names.length;
    // Total Amount -- prioritaskan versi IDR (kolom currency asli bisa non-IDR), fallback ke
    // total_amount mentah kalau total_amount_idr kosong (asumsi sudah IDR).
    const total = num(r.total_amount_idr) || num(r.total_amount);

    pushDedupedRows(rows, names, {
      courier_adm: 0,
      duty: 0,
      freight: 0,
      handling_total: 0,
      bm: 0,
      ppn_pph: 0,
      borongan_total: total / count,
    }, masterList, {
      method: 'BORONGAN', period_month: monthStartStr, source_table: 'rekapan_far_overseas_air', source_row_id: String(r.id),
      source_label: r.no_invoice || r.memo_title || null,
    });
  });
  return rows;
}

// Hitung ulang alokasi 1 bulan (semua 4 method sekaligus) -- hapus baris lama bulan itu dulu
// (idempotent), lalu insert hasil baru. Dipanggil dari tombol "Recompute" halaman Cost per
// Vessel. `monthDate` = tanggal apa saja di bulan yang mau dihitung ulang.
export async function recomputeReportingMonth(monthDate: Date): Promise<{ rows: number; needsReview: number }> {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const monthStartStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(y, m + 1, 1);
  const monthEndStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const masterList = await fetchMasterVessels();

  const [courierRows, seaAirRows, boronganRows] = await Promise.all([
    buildCourierRows(monthStartStr, monthEndStr, masterList),
    buildSeaAirRows(monthStartStr, monthEndStr, masterList),
    buildBoronganRows(monthStartStr, monthEndStr, masterList),
  ]);

  const allRows = [...courierRows, ...seaAirRows, ...boronganRows];

  const { error: delErr } = await supabase.from('reporting_cost_allocation').delete().eq('period_month', monthStartStr);
  if (delErr) throw delErr;

  if (allRows.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const { error: insErr } = await supabase.from('reporting_cost_allocation').insert(chunk);
      if (insErr) throw insErr;
    }
  }

  return { rows: allRows.length, needsReview: allRows.filter(r => r.needs_review).length };
}

// Dipakai panel "NEEDS REVIEW" (Cost per Vessel) -- tunjukkan ke user halaman apa & identifier
// apa yg harus dicari manual utk baris yg vessel_name-nya tidak cocok Master Vessel.
export const METHOD_SOURCE_PAGE: Record<AllocationMethod, { label: string; path: string; idLabel: string }> = {
  COURIER: { label: 'Courier > Invoice Recap', path: '/courier/rekapan', idLabel: 'Invoice No. / AWB' },
  SEA: { label: 'Sea & Air > Invoice Recap', path: '/sea-air/rekapan', idLabel: 'Invoice No. / AWB' },
  AIR: { label: 'Sea & Air > Invoice Recap', path: '/sea-air/rekapan', idLabel: 'Invoice No. / AWB' },
  BORONGAN: { label: 'FAR Overseas > Memo List', path: '/direct-loading', idLabel: 'Invoice No. / Memo Title' },
};

export type PeriodMode = 'MONTHLY' | 'YEARLY';

// Ambil baris alokasi tersimpan utk 1 bulan spesifik ATAU 1 tahun penuh (12 bulan) -- fungsi
// generik ini dipakai KEDUA halaman (Dashboard & Cost per Vessel) supaya query/filter selalu
// identik (Aturan Umum #1).
export async function fetchAllocationRows(mode: PeriodMode, year: number, month: number): Promise<any[]> {
  let query = supabase.from('reporting_cost_allocation').select('*');
  if (mode === 'MONTHLY') {
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    query = query.eq('period_month', monthStartStr);
  } else {
    query = query.gte('period_month', `${year}-01-01`).lt('period_month', `${year + 1}-01-01`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
