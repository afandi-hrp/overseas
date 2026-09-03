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

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris.
// (Beda dengan formatDateMemo di bawah, yang sengaja tetap format singkat "14-Jul-26" karena
// replika persis dokumen memo cetak asli -- jangan disamakan.)
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDateID(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`;
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
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDateID(val)}, ${time}`;
}

// Bandingkan longgar (case-insensitive + trim) -- dipakai untuk cek NAMA PT di invoice vs PO tidak cocok.
export function looseNameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const APPROVAL_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  PENDING:      { label: 'Awaiting Approval', badgeClass: 'bg-amber-100 text-amber-700' },
  TIER1_DONE:   { label: 'Step 1 Complete',   badgeClass: 'bg-blue-100 text-blue-700' },
  TIER2_DONE:   { label: 'Step 2 Complete',   badgeClass: 'bg-blue-100 text-blue-700' },
  APPROVED:     { label: 'Approved',          badgeClass: 'bg-emerald-100 text-emerald-700' },
  REJECTED:     { label: 'Rejected',          badgeClass: 'bg-rose-100 text-rose-700' },
};

export const COST_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  MATCH:          { label: 'Match',          badgeClass: 'bg-emerald-100 text-emerald-700' },
  BELUM_LENGKAP:  { label: 'Incomplete',     badgeClass: 'bg-amber-100 text-amber-700' },
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
  'weight_breakdown', 'departure_date', 'pic_name',
]);

export async function updateRekapanFarOverseasAir(id: string | number, updates: Record<string, any>) {
  return supabase.rpc('update_rekapan_far_overseas_manual', { p_id: id, p_updates: updates });
}

export type PoListEntry = {
  po_no_raw?: string | null;
  vessel_raw?: string | null;
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
// berat (SUM weight_kg) kalau ada seri jumlah PO, lalu tie-break TERAKHIR: kalau jumlah PO
// SAMA dan total berat JUGA sama (atau tidak ada data berat sama sekali), otomatis menangkan
// WNS (PT. Waruna Nusa Sentana) -- TAPI hanya kalau WNS termasuk salah satu yang lagi seri.
// Kalau WNS tidak ada di antara yang seri, mundur ke urutan kemunculan pertama. Urutan logika
// HARUS persis seperti ini.
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
  if (topCodes.length === 1) return topCodes[0]; // tidak ada seri jumlah PO

  // Seri jumlah PO -- tie-break pakai TOTAL BERAT (SUM weight_kg) per perusahaan yang seri
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

  if (hasAnyWeight) {
    const maxWeight = Math.max(...topCodes.map(c => weights[c]));
    const topByWeight = topCodes.filter(c => weights[c] === maxWeight);
    if (topByWeight.length === 1) return topByWeight[0]; // menang di berat
    // kalau masih seri di berat juga, lanjut ke aturan WNS di bawah
  }

  // Masih seri (jumlah PO sama DAN berat sama/tidak ada data berat) -- default WNS
  // kalau WNS ada di antara yang seri, kalau tidak mundur ke urutan pertama.
  if (topCodes.indexOf('WNS') !== -1) return 'WNS';
  return topCodes[0];
}

export type RateRow = {
  origin?: string | null;
  tujuan?: string | null;
  jenis_layanan?: string | null;
  mata_uang?: string | null;
  harga_per_kg?: number | null;
  harga_per_cbm?: number | null;
  harga_per_cbm_min?: number | null;
  harga_per_cbm_max?: number | null;
  minimal_berat?: number | null;
  berat_min?: number | null;
  estimasi_waktu?: string | null;
  [key: string]: any;
};

// Hitung ulang expected KG/Unit Price/Total dari 1 tarif (rate) yang dipilih user, saat
// rate_row_used ambigu (array beberapa tarif sama-sama cocok). Logic ini MIRROR PERSIS dari
// logic n8n supaya hasilnya konsisten baik dihitung otomatis maupun manual dipilih user --
// JANGAN diubah tanpa menyamakan juga di sisi n8n. (nilai unitPriceExpected/kgExpected/
// totalExpected TIDAK PERNAH dipengaruhi oleh displayOrigin/displayTujuan di bawah -- 2 param
// itu MURNI kosmetik teks `unitPriceNotes`.)
//
// `displayOrigin`/`displayTujuan` (opsional) -- dipakai HANYA untuk teks `unitPriceNotes`,
// menimpa `rate.origin`/`rate.tujuan`. Dibutuhkan karena filter origin/tujuan di `rematchTarif`
// "lunak" (soft): kalau kota yang diketik user tidak ketemu persis di tabel
// `far_overseas_tarif_vendor`, filter itu di-skip dan tarif SEBELUMNYA (belum tentu kota yang
// baru diketik) tetap dipakai -- terutama kentara utk vendor yang cuma py 1 baris tarif generik
// per jenis layanan (mis. Jianqiao "China->Jakarta" tetap). Tanpa override ini, notes akan
// menampilkan kota dari baris tarif yang match (bisa beda dari yang baru diketik user di NOTE 1)
// -- pemanggil dari alur re-kalkulasi NOTE 1 (`reMatchAfterRouteNoteEdit`) WAJIB isi param ini
// dengan origin/tujuan hasil parse NOTE 1 yang baru, supaya notes SELALU sinkron dengan NOTE 1.
// Pemanggil dari fitur "pilih rate manual" (`handleSelectRate`) TIDAK isi param ini (biarkan
// default ke `rate.origin`/`rate.tujuan`) karena di situ tidak ada "kota yang baru diketik".
export function computeExpectedFromRate(
  rate: RateRow,
  qty: number | null,
  actualUnitPrice: number | null,
  displayOrigin?: string | null,
  displayTujuan?: string | null,
) {
  let unitPriceExpected: number | null = null;
  let unitPriceNotes: string | null = null;

  if (rate.harga_per_cbm_min != null && rate.harga_per_cbm_max != null) {
    // Tarif berbentuk RENTANG (cth REGULER ITEM Jianqiao Sea)
    if (actualUnitPrice != null && actualUnitPrice >= rate.harga_per_cbm_min && actualUnitPrice <= rate.harga_per_cbm_max) {
      unitPriceExpected = actualUnitPrice; // di dalam rentang -- dianggap sesuai
    } else if (actualUnitPrice != null) {
      unitPriceExpected = (actualUnitPrice < rate.harga_per_cbm_min) ? rate.harga_per_cbm_min : rate.harga_per_cbm_max;
    }
    unitPriceNotes = `Rate range ${rate.harga_per_cbm_min}-${rate.harga_per_cbm_max} ${rate.mata_uang}/CBM.`;
  } else {
    unitPriceExpected = rate.harga_per_kg ?? rate.harga_per_cbm ?? null;
    unitPriceNotes = `${rate.jenis_layanan} -- origin: ${displayOrigin ?? rate.origin ?? '-'}, destination: ${displayTujuan ?? rate.tujuan ?? '-'}.`;
  }

  const kgExpected = rate.minimal_berat ?? rate.berat_min ?? null;
  const totalExpected = (unitPriceExpected != null && qty != null)
    ? Math.round(unitPriceExpected * qty * 100) / 100
    : null;

  return { unitPriceExpected, unitPriceNotes, kgExpected, totalExpected };
}

// Parse NOTE 1 (route_note) yang sudah dikoreksi manual user -- format persis
// "PENGIRIMAN DARI {asal} KE {tujuan} ({mode})". Kalau formatnya tidak cocok pola ini
// (mis. user tulis catatan bebas lain), return null -- pemanggil TIDAK boleh trigger
// re-kalkulasi cost validation kalau hasilnya null.
export function parseRouteNote(routeNoteText: string | null | undefined): { origin: string; destination: string; mode: string } | null {
  if (!routeNoteText) return null;
  const m = routeNoteText.match(/^PENGIRIMAN DARI (.+) KE (.+) \((.+)\)$/i);
  if (!m) return null;
  return { origin: m[1].trim(), destination: m[2].trim(), mode: m[3].trim().toUpperCase() };
}

// Terjemahkan kata kunci mode/jenis di NOTE 1 (bagian dalam kurung, cth "AIR"/"SEA"/"REG") ke
// nilai jenis_layanan PERSIS yang dipakai di far_overseas_tarif_vendor. User BISA mengoreksi kata
// ini juga (bukan cuma kota asal/tujuan) saat edit NOTE 1 -- kalau tidak dikenali, return null
// (JANGAN menebak), pemanggil lalu fallback ke jenis_layanan yang sudah tersimpan sebelumnya.
export function mapModeToJenisLayanan(modeText: string | null | undefined): string | null {
  if (!modeText) return null;
  const upper = modeText.trim().toUpperCase();
  if (upper.includes('REGULER') || upper === 'REG') return 'Reguler Freight';
  if (upper.includes('ECONOMY')) return 'Economy';
  if (upper.includes('EXPRESS')) return 'Express';
  if (upper.includes('SEA')) return 'Sea Freight';
  if (upper.includes('AIR')) return 'Air Freight';
  return null;
}

// Cocokkan ulang tarif (Octagon Logistic ATAU Jianqiao, ditentukan dari `shipVia`) berdasarkan
// kota asal/tujuan hasil koreksi manual NOTE 1 -- REPLIKA PERSIS alur filter n8n (jenis layanan
// -> kota asal -> kota tujuan -> berat, SEMUA "lunak": kalau hasil filter di satu tahap kosong,
// batalkan filter itu & lanjut pakai daftar sebelumnya). HARUS selalu sinkron dengan logic n8n --
// jangan diubah sendirian di sini saja. SATU-SATUNYA fungsi pencocokan tarif di app ini -- dipakai
// baik oleh alur re-kalkulasi otomatis setelah edit NOTE 1 (`FarOverseasAirPage.tsx`) maupun
// (kalau nanti dibutuhkan) fitur pilih-rate-manual, supaya logic-nya tidak pernah pecah jadi 2
// salinan berbeda. Return array kandidat: 0 = tidak ketemu, 1 = pasti, >1 = ambigu (user pilih manual).
export function rematchTarif({ vendorRows, shipVia, jenisLayananSaatIni, origin, tujuan, qty }: {
  vendorRows: RateRow[];
  shipVia: string | null | undefined;
  jenisLayananSaatIni: string | null | undefined;
  origin: string | null | undefined;
  tujuan: string | null | undefined;
  qty: number | null;
}): RateRow[] {
  const shipViaUpper = (shipVia || '').toUpperCase();
  let vendorTarget: string | null = null;
  if (shipViaUpper.includes('OCTAGON')) vendorTarget = 'OCTAGON LOGISTIC';
  else if (shipViaUpper.includes('JIANQIAO')) vendorTarget = 'PT. JIANQIAO LOGISTICS INDONESIA';

  let candidates = vendorRows.filter(t => t.vendor_name === vendorTarget && t.aktif !== false);

  if (jenisLayananSaatIni) {
    const byJenis = candidates.filter(t => t.jenis_layanan === jenisLayananSaatIni);
    if (byJenis.length > 0) candidates = byJenis;
  }

  if (origin) {
    const originUpper = origin.toUpperCase();
    const byOrigin = candidates.filter(t => t.origin && t.origin.toUpperCase() === originUpper);
    if (byOrigin.length > 0) candidates = byOrigin;
  }

  if (tujuan) {
    const tujuanUpper = tujuan.toUpperCase();
    const byTujuan = candidates.filter(t => !t.tujuan || t.tujuan.toUpperCase() === tujuanUpper);
    if (byTujuan.length > 0) candidates = byTujuan;
  }

  if (qty != null) {
    const byWeight = candidates.filter(t => {
      if (t.berat_min == null && t.berat_max == null) return true;
      if (t.berat_min != null && qty < t.berat_min) return false;
      if (t.berat_max != null && qty > t.berat_max) return false;
      return true;
    });
    if (byWeight.length > 0) candidates = byWeight;
  }

  return candidates;
}

// Status ringkasan Cost Validation dari selisih TOTAL actual vs expected -- toleransi 3%.
export function computeCostStatus(totalExpected: number | null, totalActual: number | null): string | null {
  if (totalExpected == null || totalActual == null || totalExpected === 0) return null;
  const diffPct = Math.abs(totalActual - totalExpected) / Math.abs(totalExpected);
  if (diffPct <= 0.03) return 'MATCH';
  return totalActual > totalExpected ? 'OVERCHARGE' : 'UNDERCHARGE';
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
