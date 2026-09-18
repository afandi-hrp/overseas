// "Overseas Cost by Courier" (2026-09) -- SATU-SATUNYA tempat logic ambil data & agregasi utk
// halaman ini. Sumber data: `rekapan_courier` (Invoice Recap Courier) -- BUKAN
// `reporting_cost_allocation` yg dipakai modul "Overseas Cost by Vessel" (ReportingHelpers.ts),
// jadi file ini SENGAJA TERPISAH TOTAL, bukan reuse/extend file itu (beda tabel sumber, beda
// semantik kolom, beda cara agregasi -- "duplikasi sengaja", pola sama modul Reporting lain).
//
// PENTING -- kolom breakdown "...(Vessel)" (`breakdown_courier_adm_vessel` dkk) di
// `rekapan_courier` TIDAK PERNAH dipakai di sini (itu khusus modul Cost by Vessel, hasil bagi
// rata per-vessel). Semua angka di halaman ini dari kolom UTAMA recap (`courier_adm_fee`,
// `total_freight`, `bm`, `ppn`, `pph`, `total_amount`, `total_duty_tax`).
import { supabase } from '../lib/supabase';

export type PeriodMode = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') return Number(v.replace(/,/g, '')) || 0;
  return Number(v) || 0;
};

export type CourierRow = {
  id: any;
  tgl_terima_email: string | null;
  ppjk: string | null;
  an: string | null;
  origin: string | null;
  courier_adm_fee: number | null;
  total_duty_tax: number | null;
  total_freight: number | null;
  total_amount: number | null;
  bm: number | null;
  ppn: number | null;
  pph: number | null;
  awb: string | null;
  weight_kg: number | null;
  po_pt_imi: string | null;
  po_shipping: string | null;
};

const COURIER_ROW_SELECT = 'id, tgl_terima_email, ppjk, an, origin, courier_adm_fee, total_duty_tax, total_freight, total_amount, bm, ppn, pph, awb, weight_kg, po_pt_imi, po_shipping';

// AWB "DHL NO. 1234567890"/"FEDEX NO. ..."/"UPS NO. ..." -> strip prefix carrier, sisa nomor
// polos -- dipakai SEMUA hitungan distinct (AWB/Weight) di halaman ini. Regex diperluas dari
// pola yg sudah ada di SharedDataTable.tsx (`awb_strip_carrier`, cuma DHL|FEDEX) supaya ikut
// UPS (PPJK baru, lihat "Rate Tables & PPJK -- dukungan UPS" di CLAUDE.md).
export function stripAwbCarrier(awb: any): string {
  return String(awb || '').replace(/^(DHL|FEDEX|UPS)\s*NO\.?\s*:?\s*/i, '').trim();
}

// PO partial "I.PO/IMI.MDN/2601/0001(1)" & "...(2)" = 1 PO yg sama -- buang suffix "(N)" di
// ekor string sebelum dedup (permintaan eksplisit user, lihat "Aturan distinct count").
export function normalizePoKey(po: string): string {
  return po.trim().replace(/\(\d+\)\s*$/, '').trim();
}

// PO PT IMI / PO Non IMI bisa berisi gabungan "PO1 + PO2 + ..." (pola sama `vessel`/breakdown
// lain di `rekapan_courier`) -- dipisah sebelum dedup.
export function splitPoField(text: any): string[] {
  const t = String(text || '').trim();
  if (!t) return [];
  return t.split('+').map(s => s.trim()).filter(Boolean);
}

export function distinctAwbCount(rows: CourierRow[]): number {
  return new Set(rows.map(r => stripAwbCarrier(r.awb)).filter(Boolean)).size;
}

export function distinctPoCount(rows: CourierRow[]): number {
  const set = new Set<string>();
  rows.forEach(r => {
    splitPoField(r.po_pt_imi).forEach(po => set.add(normalizePoKey(po)));
    splitPoField(r.po_shipping).forEach(po => set.add(normalizePoKey(po)));
  });
  return set.size;
}

// Weight per AWB unik (Freight & Duty jadi baris terpisah utk 1 AWB yg sama, weight_kg-nya
// SAMA di kedua baris itu -- kalau dijumlah polos, weight jadi 2x lipat). Ambil weight PERTAMA
// yg ditemukan per AWB, bukan SUM semua baris.
export function distinctWeightTotal(rows: CourierRow[]): number {
  const map = new Map<string, number>();
  rows.forEach(r => {
    const key = stripAwbCarrier(r.awb);
    if (!key || map.has(key)) return;
    if (r.weight_kg != null) map.set(key, num(r.weight_kg));
  });
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}

// Weight per AWB unik -- dipakai Weight Range (butuh peta AWB->weight, bukan cuma totalnya).
export function distinctWeightMap(rows: CourierRow[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach(r => {
    const key = stripAwbCarrier(r.awb);
    if (!key || map.has(key)) return;
    if (r.weight_kg != null) map.set(key, num(r.weight_kg));
  });
  return map;
}

export type CourierSums = {
  totalCost: number; freight: number; courierAdm: number; bm: number; ppn: number; pph: number; totalDutyTax: number;
};
export function zeroCourierSums(): CourierSums {
  return { totalCost: 0, freight: 0, courierAdm: 0, bm: 0, ppn: 0, pph: 0, totalDutyTax: 0 };
}
export function addCourierSums(s: CourierSums, r: CourierRow) {
  s.totalCost += num(r.total_amount);
  s.freight += num(r.total_freight);
  s.courierAdm += num(r.courier_adm_fee);
  s.bm += num(r.bm);
  s.ppn += num(r.ppn);
  s.pph += num(r.pph);
  s.totalDutyTax += num(r.total_duty_tax);
}
export const exclPpnPph = (s: CourierSums) => s.totalCost - s.ppn - s.pph;

// 5 rentang berat baku halaman ini (breakpoint 25kg = additional handling, 70kg = overweight,
// TIDAK terkait breakpoint tarif courier di modul admin lain -- murni pengelompokan tampilan).
export const WEIGHT_RANGES: { label: string; min: number; max: number }[] = [
  { label: '0–5 kg', min: 0, max: 5 },
  { label: '5–25 kg', min: 5, max: 25 },
  { label: '25–70 kg', min: 25, max: 70 },
  { label: '70–150 kg', min: 70, max: 150 },
  { label: '>150 kg', min: 150, max: Infinity },
];
export function weightRangeLabel(w: number): string {
  const r = WEIGHT_RANGES.find(rg => w >= rg.min && w < rg.max);
  return (r || WEIGHT_RANGES[WEIGHT_RANGES.length - 1]).label;
}

export async function fetchCourierRows(start: string, end: string, anFilter: Set<string>): Promise<CourierRow[]> {
  let q = supabase.from('rekapan_courier').select(COURIER_ROW_SELECT)
    .gte('tgl_terima_email', start).lte('tgl_terima_email', end);
  if (anFilter.size > 0) q = q.in('an', Array.from(anFilter));
  const { data, error } = await q.limit(20000);
  if (error) throw error;
  return (data || []) as unknown as CourierRow[];
}

export async function fetchDistinctAn(): Promise<string[]> {
  const { data } = await supabase.from('rekapan_courier').select('an').not('an', 'is', null).limit(5000);
  const set = new Set<string>();
  (data || []).forEach((d: any) => { const v = (d.an || '').trim(); if (v) set.add(v); });
  return Array.from(set).sort();
}
export async function fetchDistinctPpjk(): Promise<string[]> {
  const { data } = await supabase.from('rekapan_courier').select('ppjk').not('ppjk', 'is', null).limit(5000);
  const set = new Set<string>();
  (data || []).forEach((d: any) => { const v = (d.ppjk || '').trim(); if (v) set.add(v); });
  return Array.from(set).sort();
}

// ─── Periode ────────────────────────────────────────────────────────────────
export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const quarterOfMonth = (month: number): 1 | 2 | 3 | 4 => Math.ceil(month / 3) as 1 | 2 | 3 | 4;
export const monthsOfQuarter = (q: 1 | 2 | 3 | 4): number[] => { const s = (q - 1) * 3 + 1; return [s, s + 1, s + 2]; };

const pad2 = (n: number) => String(n).padStart(2, '0');
const lastDayOfMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export function periodRange(mode: PeriodMode, year: number, month: number, quarter: 1 | 2 | 3 | 4): { start: string; end: string } {
  if (mode === 'YEARLY') return { start: `${year}-01-01`, end: `${year}-12-31` };
  if (mode === 'QUARTERLY') {
    const months = monthsOfQuarter(quarter);
    return { start: `${year}-${pad2(months[0])}-01`, end: `${year}-${pad2(months[2])}-${pad2(lastDayOfMonth(year, months[2]))}` };
  }
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}` };
}

export function previousPeriod(mode: PeriodMode, year: number, month: number, quarter: 1 | 2 | 3 | 4): { year: number; month: number; quarter: 1 | 2 | 3 | 4 } {
  if (mode === 'YEARLY') return { year: year - 1, month, quarter };
  if (mode === 'QUARTERLY') {
    if (quarter === 1) return { year: year - 1, month, quarter: 4 };
    return { year, month, quarter: (quarter - 1) as 1 | 2 | 3 };
  }
  if (month === 1) return { year: year - 1, month: 12, quarter };
  return { year, month: month - 1, quarter };
}

export function periodLabel(mode: PeriodMode, year: number, month: number, quarter: 1 | 2 | 3 | 4): string {
  if (mode === 'YEARLY') return String(year);
  if (mode === 'QUARTERLY') return `Q${quarter} ${year}`;
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

// Deret N periode berturut-turut berakhir di (year,month,quarter) -- dipakai Trend chart & Data
// Performance table (MTM/QTQ/YoY, lihat halaman). Urutan lama -> baru.
export function buildPeriodSeries(mode: PeriodMode, year: number, month: number, quarter: 1 | 2 | 3 | 4, count: number) {
  const out: { year: number; month: number; quarter: 1 | 2 | 3 | 4; label: string }[] = [];
  let cur = { year, month, quarter };
  for (let i = 0; i < count; i++) {
    out.unshift({ ...cur, label: periodLabel(mode, cur.year, cur.month, cur.quarter) });
    cur = previousPeriod(mode, cur.year, cur.month, cur.quarter);
  }
  return out;
}

export const fmtIdr = (n: number) => `IDR ${Math.round(n).toLocaleString('id-ID')}`;
export const fmtIdrSigned = (n: number) => `${n < 0 ? '-' : ''}IDR ${Math.round(Math.abs(n)).toLocaleString('id-ID')}`;
export const pctOf = (cur: number, prev: number) => prev !== 0 ? ((cur - prev) / prev) * 100 : (cur !== 0 ? 100 : 0);
