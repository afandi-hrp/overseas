// BT Vendor GABUNGAN Courier (2026-10-21, permintaan user): 1 BT membayar beberapa shipment, jadi Amount BT & semua invoice di BT
// TIDAK boleh dibandingkan langsung ke 1 AWB. Hanya LOGIKA aplikasi -- ekstraksi AI (bt_vendor_v / rincian_bt_vendor_v) tidak diubah.
// Dipakai `buildValidationValues` (ValidasiModal) DAN `generateValues` (ValidasiFill, persen kartu) supaya hasilnya SAMA.
// Referensi tampilan: mockup_bt_pib_cn.html. Aturan:
//   ACUAN: PIB -> pib_v.item_value; CN -> cipl_v.total_value. Daftar invoice AWB ini = No. Invoice CIPL / Final Invoice.
//   BT <= acuan (+toleransi) atau BT hanya berisi invoice AWB ini -> logika LAMA (return null, dibandingkan langsung).
//   BT > acuan & ada invoice shipment lain -> GABUNGAN: porsi = jumlah baris Rincian BT yang ref_no-nya invoice AWB ini.
// Encoding ke nilai baris (src/cmp) supaya `computeStatus` biasa tetap benar di SEMUA tempat (modal, panel Unmatched, persen kartu):
//   Match -> cmp = src; Mismatch -> cmp = porsi (atau Total BT bila alasannya Rincian != BT); "Perlu rincian BT" -> cmp = "" (partial).
// Catatan data: Payment Remarks (`bt_vendor_v.no_invoice`) HANYA berisi nomor invoice, tanpa nominal per invoice -> tanpa Rincian BT
// porsi tidak bisa dihitung (-> "Needs BT details"). Cek "rincian = remarks" per invoice = cek KEANGGOTAAN (bukan nilai).
import { parseNumeric } from './ValidasiHelper';
import { supabase } from '../lib/supabase';

// Toleransi pembulatan (selisih <= nilai ini = Match). Satu angka utk semua validasi BT Vendor Courier; diatur Admin di Settings
// (tabel courier_doc_settings, key 'bt_tolerance', sql/072). Dibaca sekali per ±60 dtk lewat `loadCourierDocTolerance()` (dipanggil sebelum
// menghitung nilai Doc Validation); sebelum/tanpa data memakai bawaan 0,5.
export const COURIER_DOC_TOLERANCE_DEFAULT = 0.5;
let tolerance = COURIER_DOC_TOLERANCE_DEFAULT;
let toleranceAt = 0;
export const courierDocTolerance = () => tolerance;
export const setCourierDocTolerance = (v: number) => { tolerance = isFinite(v) && v >= 0 ? v : COURIER_DOC_TOLERANCE_DEFAULT; toleranceAt = Date.now(); };
export async function loadCourierDocTolerance(force = false): Promise<number> {
  if (!force && Date.now() - toleranceAt < 60_000) return tolerance;
  try {
    const { data } = await supabase.from('courier_doc_settings').select('value').eq('key', 'bt_tolerance').maybeSingle();
    setCourierDocTolerance(data && data.value !== null && data.value !== undefined ? Number(data.value) : COURIER_DOC_TOLERANCE_DEFAULT);
  } catch { toleranceAt = Date.now(); }
  return tolerance;
}

export type BtState = 'ok' | 'bad' | 'needs';

export interface BtCombinedInfo {
  state: BtState;
  currency: string;
  total: number;                 // Amount BT
  acuan: number;
  porsi: number;                 // jumlah baris Rincian BT milik AWB ini
  rounded: boolean;              // porsi beda <= toleransi dari acuan (tetap Match)
  nThis: number;                 // jumlah invoice AWB ini
  nFound: number;                // invoice AWB ini yang ditemukan di BT
  nBt: number;                   // jumlah invoice di BT (rincian, atau remarks bila tanpa rincian)
  truncated: boolean;            // Payment Remarks terpotong
  hasRincian: boolean;
  rincianTotal: number | null;
  rinBad: boolean;               // total rincian != Amount BT
  rvr: 'skip' | string[] | null; // invoice yang beda antara rincian & Payment Remarks (null = tidak dicek)
  rvrOwn: string[];              // bagian rvr yang milik AWB ini
  reason: string;
  invoices: { inv: string; amount: number | null }[];   // invoice AWB ini
  others: { inv: string; amount: number | null }[];     // invoice shipment lain (diabaikan)
}

export interface BtRowValue { src: string; cmp: string; bt: BtCombinedInfo | null }

const norm = (s: any) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const splitInv = (s: any): string[] => String(s ?? '').split(/[+,]/).map(x => x.trim()).filter(Boolean);
const eq = (a: number, b: number) => Math.abs(a - b) <= tolerance;

// rincian_bt_vendor_v tersimpan sbg STRING JSON (n8n) atau objek.
export function parseRincianBt(raw: any): { items: { po_no: string; amount: number; ref_no: string }[]; total: number | null; currency: string } | null {
  let r = raw?.rincian_bt_vendor_v;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  if (!r || typeof r !== 'object') return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((x: any) => ({ po_no: String(x?.po_no ?? ''), ref_no: String(x?.ref_no ?? '').trim(), amount: Number(x?.amount) }))
    .filter((x: any) => x.ref_no && isFinite(x.amount));
  if (items.length === 0) return null;
  const total = r.total === null || r.total === undefined || r.total === '' ? null : Number(r.total);
  return { items, total: total !== null && isFinite(total) ? total : null, currency: String(r.currency ?? '').trim() };
}

export function computeBtCombined(raw: any, acuanVal: any, thisInvoicesRaw: any): BtCombinedInfo | null {
  const bt = raw?.bt_vendor_v || {};
  const total = parseNumeric(bt.item_value);
  const acuan = parseNumeric(acuanVal);
  if (total === null || acuan === null) return null;
  if (total <= acuan + tolerance) return null;               // BT <= acuan -> logika lama (Match / Mismatch langsung)

  const thisList = splitInv(thisInvoicesRaw);
  if (thisList.length === 0) return null;
  const thisSet = new Set(thisList.map(norm));

  const remarksRaw = String(bt.no_invoice ?? '');
  const remarks = splitInv(remarksRaw.replace(/\+\s*$/, ''));
  const rin = parseRincianBt(raw);
  const rinRefs = rin ? rin.items.map(i => i.ref_no) : [];

  // Remarks terpotong: ditandai "+" di ujung / flag eksplisit, atau (tanpa flag) remarks adalah AWALAN dari urutan rincian.
  const remNorm = remarks.map(norm);
  const prefixOfRincian = !!rin && remNorm.length > 0 && remNorm.length < rinRefs.length && remNorm.every((x, i) => x === norm(rinRefs[i]));
  const truncated = bt.remarks_truncated === true || /\+\s*$/.test(remarksRaw) || prefixOfRincian;

  const known = rin ? rinRefs : remarks;
  const others = known.filter(x => !thisSet.has(norm(x)));
  if (others.length === 0 && !truncated) return null;                    // semua invoice di BT milik AWB ini -> logika lama

  const currency = rin?.currency || String(bt.currency ?? '').trim();
  const amountOf = (inv: string) => { const it = rin?.items.find(i => norm(i.ref_no) === norm(inv)); return it ? it.amount : null; };
  const invoices = thisList.map(inv => ({ inv, amount: rin ? amountOf(inv) : null }));
  const foundInvs = rin ? invoices.filter(i => i.amount !== null) : thisList.filter(x => remNorm.includes(norm(x))).map(inv => ({ inv, amount: null as number | null }));
  const nFound = foundInvs.length;
  const porsi = rin ? invoices.reduce((a, x) => a + (x.amount ?? 0), 0) : 0;
  const rincianTotal = rin ? rin.items.reduce((a, x) => a + x.amount, 0) : null;
  const rinBad = rin ? !eq(rincianTotal as number, total) : false;

  let rvr: BtCombinedInfo['rvr'] = null;
  let rvrOwn: string[] = [];
  if (rin) {
    if (truncated) rvr = 'skip';
    else {
      const a = new Set(rinRefs.map(norm)), b = new Set(remNorm);
      const diff = [...rinRefs.filter(x => !b.has(norm(x))), ...remarks.filter(x => !a.has(norm(x)))];
      rvr = diff;
      rvrOwn = diff.filter(x => thisSet.has(norm(x)));
    }
  }

  let state: BtState;
  let reason: string;
  if (!rin) { state = 'needs'; reason = nFound < thisList.length ? `${nFound}/${thisList.length} invoice found in Payment Remarks${truncated ? ' (truncated)' : ''} — upload the BT details` : 'Payment Remarks has no per-invoice amount — upload the BT details'; }
  else if (rinBad) { state = 'bad'; reason = `BT details total ${fmt(rincianTotal as number)} ≠ BT amount ${fmt(total)}`; }
  else if (nFound < thisList.length) { state = 'needs'; reason = `${nFound}/${thisList.length} invoice found (${invoices.filter(i => i.amount === null).map(i => i.inv).join(', ')} missing)`; }
  else if (rvrOwn.length) { state = 'bad'; reason = `BT details ≠ Payment Remarks: ${rvrOwn.join(', ')}`; }
  else if (!eq(porsi, acuan)) { state = 'bad'; reason = `difference ${fmt(porsi - acuan)}`; }
  else { state = 'ok'; reason = ''; }

  return {
    state, currency, total, acuan, porsi, rounded: state === 'ok' && porsi !== acuan, nThis: thisList.length, nFound,
    nBt: rin ? rin.items.length : remarks.length, truncated, hasRincian: !!rin, rincianTotal, rinBad, rvr, rvrOwn, reason,
    invoices, others: others.map(inv => ({ inv, amount: rin ? amountOf(inv) : null })),
  };
}

export const fmt = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

// Nilai 2 baris BT Vendor (item value & no. invoice) utk SATU jalur. `acuan*` = nilai referensi (src) apa adanya.
export function btVendorRowValues(raw: any, acuanVal: any, acuanInvoices: any, btItemValue: any, btInvoices: any, sepFix: (v: any) => any): { item: BtRowValue; inv: BtRowValue } {
  const srcItem = acuanVal || '';
  const srcInv = sepFix(acuanInvoices) || '';
  const legacy = { item: { src: String(srcItem), cmp: String(btItemValue ?? ''), bt: null }, inv: { src: String(srcInv), cmp: String(sepFix(btInvoices) || ''), bt: null } } as { item: BtRowValue; inv: BtRowValue };
  const bt = computeBtCombined(raw, acuanVal, acuanInvoices || (raw?.final_invoice?.inv_no));
  if (!bt) return legacy;
  const foundList = bt.hasRincian ? bt.invoices.filter(i => i.amount !== null).map(i => i.inv) : bt.invoices.map(i => i.inv).filter(x => splitInv(btInvoices).map(norm).includes(norm(x)));
  const allFound = bt.nFound >= bt.nThis;
  const cmpItem = bt.state === 'ok' ? String(srcItem) : bt.state === 'needs' ? '' : (bt.rinBad || bt.rvrOwn.length || eq(bt.porsi, bt.acuan) ? String(bt.total) : String(bt.porsi));
  return {
    item: { src: String(srcItem), cmp: cmpItem, bt },
    inv: { src: String(srcInv), cmp: allFound ? foundList.join(' + ') : '', bt },
  };
}

// Dipanggil dari fill di buildValidationValues & generateValues: `set(id, src, cmp, bt)`.
export function applyBtVendorRows(raw: any, sepFix: (v: any) => any, set: (id: string, src: string, cmp: string, bt: BtCombinedInfo | null) => void) {
  const pibV = raw?.pib_v || {}, ciplV = raw?.cipl_v || {}, fi = raw?.final_invoice || {}, btV = raw?.bt_vendor_v || {};
  // Jalur PIB: acuan = nilai invoice di PIB; daftar invoice AWB ini = No. Invoice CIPL / Final Invoice (fallback PIB).
  const pib = btVendorRowValues(raw, pibV.item_value, ciplV.no_invoice || fi.inv_no || pibV.no_invoice, btV.item_value, btV.no_invoice, sepFix);
  const pibInvSrc = sepFix(pibV.no_invoice) || '';
  set('bt_vendor_item_value_vs_pib', pib.item.src, pib.item.cmp, pib.item.bt);
  set('bt_vendor_no_invoice_vs_pib', pib.inv.bt ? pib.inv.src : String(pibInvSrc), pib.inv.cmp, pib.inv.bt);
  // Jalur CN: acuan = total CIPL / Final Invoice.
  const cn = btVendorRowValues(raw, ciplV.total_value, ciplV.no_invoice || fi.inv_no, btV.item_value, btV.no_invoice, sepFix);
  set('cipl_bt_vendor_item_value', cn.item.src, cn.item.cmp, cn.item.bt);
  set('cipl_bt_vendor_no_invoice', String(ciplV.no_invoice || ''), cn.inv.cmp, cn.inv.bt);
}
