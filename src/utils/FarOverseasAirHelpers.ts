// Helper bersama untuk fitur FAR Overseas Air (memo approval freight informal gabungan PO).
// Prinsip: field null TIDAK PERNAH ditebak/di-default -- selalu tampilkan "-" atau pesan eksplisit.

import { supabase } from '../lib/supabase';
import logoAMT from '../assets/far-overseas-air-logos/AMT.png';
import logoGMI from '../assets/far-overseas-air-logos/GMI.png';
import logoGUN from '../assets/far-overseas-air-logos/GUN.jpeg';
import logoIMI from '../assets/far-overseas-air-logos/IMI.png';
import logoMJS from '../assets/far-overseas-air-logos/MJS.png';
import logoTTP from '../assets/far-overseas-air-logos/TTP.png';
import logoWNS from '../assets/far-overseas-air-logos/WNS.png';
import logoWSI from '../assets/far-overseas-air-logos/WSI.png';

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === '' as any) return '-';
  const num = Number(amount);
  if (isNaN(num)) return '-';
  const formatted = num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  if (!currency) return formatted; // currency tidak diketahui -- JANGAN asumsikan IDR
  if (currency === 'IDR') return 'Rp ' + formatted;
  return currency + ' ' + formatted;
}

export function formatDateID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MEMO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format tanggal khusus memo cetak FAR Overseas Air (replika dokumen asli): "14-Jul-26".
export function formatDateMemo(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MEMO_MONTHS[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

export function formatDateTimeID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Bandingkan longgar (case-insensitive + trim) -- dipakai untuk cek NAMA PT di invoice vs PO tidak cocok.
export function looseNameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const APPROVAL_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  PENDING:      { label: 'Menunggu Persetujuan', badgeClass: 'bg-amber-100 text-amber-700' },
  TIER1_DONE:   { label: 'Tahap 1 Selesai',      badgeClass: 'bg-blue-100 text-blue-700' },
  TIER2_DONE:   { label: 'Tahap 2 Selesai',      badgeClass: 'bg-blue-100 text-blue-700' },
  APPROVED:     { label: 'Disetujui',            badgeClass: 'bg-emerald-100 text-emerald-700' },
  REJECTED:     { label: 'Ditolak',               badgeClass: 'bg-rose-100 text-rose-700' },
};

export const COST_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  MATCH:          { label: 'Match',          badgeClass: 'bg-emerald-100 text-emerald-700' },
  BELUM_LENGKAP:  { label: 'Belum Lengkap',  badgeClass: 'bg-amber-100 text-amber-700' },
  OVERCHARGE:     { label: 'Overcharge',     badgeClass: 'bg-rose-100 text-rose-700' },
  UNDERCHARGE:    { label: 'Undercharge',    badgeClass: 'bg-rose-100 text-rose-700' },
};

export const COMPANY_CODES = ['WNS', 'TTP', 'GMI', 'WSI', 'AMT', 'MJS', 'IMI', 'GUN'];

// Kolom jsonb (po_list, document_validation, cost_validation, rate_row_used, dst) NORMALNYA
// sudah datang sebagai array/object JS asli lewat supabase-js. Tapi kalau nilainya sempat
// di-double-encode jadi string JSON sebelum masuk kolom jsonb (mis. dari workflow n8n yang
// stringify manual), supabase-js akan mengembalikannya sebagai string biasa -- bukan array --
// sehingga Array.isArray()/pengecekan panjang gagal dan UI kelihatan kosong padahal datanya ada.
// Parse manual sebagai jaring pengaman. (Sumber bug yang sama pernah ditemukan di
// FarOverseasAirCostValidationModal.tsx untuk document_validation/cost_validation.)
export function parseJsonField(val: unknown): any {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

// Field yang boleh diedit manual lewat RPC update_rekapan_far_overseas_manual -- kirim HANYA
// field yang berubah di p_updates (bukan array lengkap seperti RPC cost validasi).
export const REKAPAN_EDITABLE_FIELDS = new Set([
  'po_list', 'po_ori', 'dominant_company_code', 'vendor', 'ship_via', 'no_invoice',
  'invoice_date', 'qty', 'weight_unit', 'unit_price', 'unit_price_currency', 'freight_amount',
  'clearance_amount', 'other_amount', 'clearance_other_total', 'total_amount',
  'total_amount_currency', 'kurs_used', 'total_amount_idr', 'route_note', 'shipment_mode',
  'origin_country', 'destination_city', 'item_description', 'status_note', 'other_note',
  'memo_title', 'expected_payment_date', 'vessel_internal_note', 'notes', 'buyer_name',
  'weight_breakdown',
]);

export async function updateRekapanFarOverseasAir(id: string | number, updates: Record<string, any>) {
  return supabase.rpc('update_rekapan_far_overseas_manual', { p_id: id, p_updates: updates });
}

export type PoListEntry = {
  po_no_raw?: string | null;
  company_code?: string | null;
  vendor_name?: string | null;
  item_summary?: string | null;
  total_value?: number | null;
  currency?: string | null;
  source?: string | null;
  weight_kg?: number | null;
};

// String tampilan breakdown berat per PO, dipakai di kolom WEIGHT BREAKDOWN tabel list.
// Format persis: "I.PO/AMT.MDN/2607/0247: 50 KG + I.PO/GMI.MDN/2607/0333: 30 KG"
export function buildWeightBreakdownDisplay(poList: PoListEntry[]): string | null {
  const withWeight = poList.filter(po => po.weight_kg != null);
  if (withWeight.length === 0) return null;
  return withWeight.map(po => `${po.po_no_raw}: ${po.weight_kg} KG`).join(' + ');
}

// Hitung ulang dominant_company_code -- menang berdasarkan jumlah PO, tie-break pakai total
// berat (SUM weight_kg) kalau ada seri jumlah PO. Urutan logika HARUS persis seperti ini.
export function recomputeDominantCompany(poList: PoListEntry[]): string | null {
  const counts: Record<string, number> = {};
  poList.forEach(po => {
    if (!po.company_code) return;
    counts[po.company_code] = (counts[po.company_code] || 0) + 1;
  });
  const codes = Object.keys(counts);
  if (codes.length === 0) return null;

  const maxCount = Math.max(...codes.map(c => counts[c]));
  const topCodes = codes.filter(c => counts[c] === maxCount);

  if (topCodes.length === 1) return topCodes[0];

  const weights: Record<string, number> = {};
  let hasAnyWeight = false;
  topCodes.forEach(code => {
    weights[code] = poList
      .filter(po => po.company_code === code)
      .reduce((sum, po) => {
        if (po.weight_kg != null) hasAnyWeight = true;
        return sum + (po.weight_kg || 0);
      }, 0);
  });

  if (!hasAnyWeight) {
    return topCodes[0];
  }

  let winner = topCodes[0];
  topCodes.forEach(code => {
    if (weights[code] > weights[winner]) winner = code;
  });
  return winner;
}

// company_code -> logo perusahaan (dari folder "3. FULL LOGO WARUNA GROUP", disalin ke
// src/assets/far-overseas-air-logos). Dikunci berdasarkan company_code langsung, bukan kolom
// logo_asset_key di far_overseas_signer_config (kolom itu sebagian besar masih NULL di DB).
// Kalau company_code tidak dikenal / tidak ada di map ini, CompanyLogo fallback ke teks nama
// perusahaan (lihat FarOverseasAirDetailModal.tsx), bukan error/crash.
export const LOGO_ASSETS: Record<string, string> = {
  WNS: logoWNS,
  TTP: logoTTP,
  GMI: logoGMI,
  WSI: logoWSI,
  AMT: logoAMT,
  MJS: logoMJS,
  IMI: logoIMI,
  GUN: logoGUN,
};
