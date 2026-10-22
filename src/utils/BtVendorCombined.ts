// BT Vendor GABUNGAN Courier (2026-10-21, revisi 2026-10-22; permintaan user): 1 BT membayar beberapa shipment, jadi Amount BT & semua invoice di BT
// TIDAK boleh dibandingkan langsung ke 1 AWB. Hanya LOGIKA aplikasi -- ekstraksi AI (bt_vendor_v / rincian_bt_vendor_v) tidak diubah.
// Dipakai `buildValidationValues` (ValidasiModal) DAN `generateValues` (ValidasiFill, persen kartu) supaya hasilnya SAMA.
// Referensi tampilan: mockup_bt_final_1.html. Aturan:
//   ACUAN: PIB -> pib_v.item_value; CN -> cipl_v.total_value. Daftar invoice AWB ini = No. Invoice CIPL / Final Invoice.
//   BT <= acuan (+toleransi) atau BT hanya berisi invoice AWB ini -> logika LAMA (return null, dibandingkan langsung).
//   BT > acuan & (ada invoice shipment lain / Payment Remarks terpotong / invoice AWB ini tidak terdaftar di BT) -> GABUNGAN:
//   porsi = jumlah baris Rincian BT yang ref_no-nya invoice AWB ini (dicocokkan PERSIS: huruf besar/kecil & spasi diabaikan, TANPA normalisasi I/1, O/0).
//   Payment Remarks: kosong / "-" / tidak memuat satu pun nomor invoice Rincian BT -> cek remarks DILEWATI ("no invoice list in BT"), sama dgn remarks terpotong.
// Encoding ke nilai baris (src/cmp) supaya `computeStatus` biasa tetap benar di SEMUA tempat (modal, panel Unmatched, persen kartu):
//   Match -> cmp = src; Mismatch -> cmp = porsi (atau Total BT bila alasannya Rincian != BT); "Needs BT details" -> cmp = "" (partial).
// Catatan data: Payment Remarks (`bt_vendor_v.no_invoice`) HANYA berisi nomor invoice, tanpa nominal; `cipl_v` hanya total + daftar invoice (TIDAK ada
// nilai per invoice) -> kolom CIPL per invoice hanya terisi utk AWB dgn SATU invoice (= acuan); utk beberapa invoice nilai dicek lewat total porsi vs acuan.
import { parseNumeric } from './ValidasiHelper';

// Toleransi pembulatan (selisih <= nilai ini = Match "rounding", dalam mata uang BT). Konstanta tetap -- BUKAN setting Admin (keputusan user 2026-10-21).
export const COURIER_DOC_TOLERANCE = 0.5;
const tolerance = COURIER_DOC_TOLERANCE;

export type BtState = 'ok' | 'bad' | 'needs';
export type BtReason = 'ok' | 'portion' | 'invoice_diff' | 'rin_total' | 'remarks_diff' | 'no_details' | 'not_found';

export interface BtInvoiceRow {
  inv: string;
  amount: number | null;      // nilai di Rincian BT (null = tidak ditemukan / belum ada rincian)
  cipl?: number | null;       // nilai CIPL/Final Invoice invoice ini (hanya bila AWB punya SATU invoice), selain itu null
  ok?: boolean | null;        // true = cocok, false = beda dari CIPL, null = tidak ditemukan / belum bisa dicek
  found?: boolean;            // invoice ini terdaftar di BT (Rincian BT, atau Payment Remarks bila belum ada rincian)
}

export interface BtCombinedInfo {
  state: BtState;
  reasonCode?: BtReason;
  path?: 'PIB' | 'CN';           // jalur acuan (label pembanding: "Reference PIB" / "Reference Final Invoice")
  vendor?: string;
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
  rvr?: 'skip' | string[] | null; // invoice yang beda antara rincian & Payment Remarks ('skip' = dilewati; null = tidak dicek)
  rvrSkip?: 'truncated' | 'no_list' | null; // alasan cek remarks dilewati
  rvrOwn: string[];              // bagian rvr yang milik AWB ini
  reason: string;                // 1 baris alasan utk kartu Unmatched fields (Bahasa Inggris)
  invoices: BtInvoiceRow[];      // invoice AWB ini
  others: { inv: string; amount: number | null }[];     // invoice shipment lain (diabaikan)
}

export interface BtRowValue { src: string; cmp: string; bt: BtCombinedInfo | null }

const norm = (s: any) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const splitInv = (s: any): string[] => String(s ?? '').split(/[+,]/).map(x => x.trim()).filter(Boolean);
const eq = (a: number, b: number) => Math.abs(a - b) <= tolerance;

export const fmt = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);
// 2 desimal (popover & kartu, sama mockup).
export const fmt2 = (n: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// rincian_bt_vendor_v tersimpan sbg STRING JSON (n8n) atau objek.
export function parseRincianBt(raw: any): { items: { po_no: string; amount: number; ref_no: string }[]; total: number | null; currency: string; vendor: string } | null {
  let r = raw?.rincian_bt_vendor_v;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  if (!r || typeof r !== 'object') return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((x: any) => ({ po_no: String(x?.po_no ?? ''), ref_no: String(x?.ref_no ?? '').trim(), amount: Number(x?.amount) }))
    .filter((x: any) => x.ref_no && isFinite(x.amount));
  if (items.length === 0) return null;
  const total = r.total === null || r.total === undefined || r.total === '' ? null : Number(r.total);
  return { items, total: total !== null && isFinite(total) ? total : null, currency: String(r.currency ?? '').trim(), vendor: String(r.vendor ?? '').trim() };
}

export function computeBtCombined(raw: any, acuanVal: any, thisInvoicesRaw: any, path: 'PIB' | 'CN' = 'PIB'): BtCombinedInfo | null {
  const bt = raw?.bt_vendor_v || {};
  const total = parseNumeric(bt.item_value);
  const acuan = parseNumeric(acuanVal);
  if (total === null || acuan === null) return null;
  if (total <= acuan + tolerance) return null;               // BT <= acuan -> logika lama (Match / Mismatch langsung)

  const thisList = splitInv(thisInvoicesRaw);
  if (thisList.length === 0) return null;
  const thisSet = new Set(thisList.map(norm));

  const remarksRaw = String(bt.no_invoice ?? '');
  const remarks = splitInv(remarksRaw.replace(/\+\s*$/, '')).filter(x => /[A-Za-z0-9]/.test(x)); // "-" / kosong tidak dihitung
  const rin = parseRincianBt(raw);
  const rinRefs = rin ? rin.items.map(i => i.ref_no) : [];

  // Remarks terpotong: ditandai "+" di ujung / flag eksplisit, atau (tanpa flag) remarks adalah AWALAN dari urutan rincian.
  const remNorm = remarks.map(norm);
  const prefixOfRincian = !!rin && remNorm.length > 0 && remNorm.length < rinRefs.length && remNorm.every((x, i) => x === norm(rinRefs[i]));
  const truncated = bt.remarks_truncated === true || /\+\s*$/.test(remarksRaw) || prefixOfRincian;

  const known = rin ? rinRefs : remarks;
  const knownSet = new Set(known.map(norm));
  const others = known.filter(x => !thisSet.has(norm(x)));
  const allThisKnown = thisList.every(x => knownSet.has(norm(x)));
  if (others.length === 0 && !truncated && allThisKnown) return null;   // semua invoice di BT milik AWB ini -> logika lama

  const currency = rin?.currency || String(bt.currency ?? '').trim();
  const amountOf = (inv: string) => { const it = rin?.items.find(i => norm(i.ref_no) === norm(inv)); return it ? it.amount : null; };
  // Nilai CIPL per invoice hanya diketahui bila AWB punya SATU invoice (= acuan).
  const single = thisList.length === 1;
  const invoices: BtInvoiceRow[] = thisList.map(inv => {
    const amount = rin ? amountOf(inv) : null;
    const cipl = single ? acuan : null;
    const ok = amount === null ? null : cipl === null ? true : eq(amount, cipl);
    return { inv, amount, cipl, ok, found: rin ? amount !== null : remNorm.includes(norm(inv)) };
  });
  const foundInvs = rin ? invoices.filter(i => i.amount !== null) : thisList.filter(x => remNorm.includes(norm(x)));
  const nFound = foundInvs.length;
  const porsi = rin ? invoices.reduce((a, x) => a + (x.amount ?? 0), 0) : 0;
  const rincianTotal = rin ? rin.items.reduce((a, x) => a + x.amount, 0) : null;
  const rinBad = rin ? !eq(rincianTotal as number, total) : false;

  // Cek Rincian vs Payment Remarks (keanggotaan invoice). Remarks kosong / tanpa satu pun nomor invoice Rincian BT = DILEWATI (no_list).
  let rvr: BtCombinedInfo['rvr'] = null;
  let rvrSkip: BtCombinedInfo['rvrSkip'] = null;
  let rvrOwn: string[] = [];
  if (rin) {
    const overlap = remNorm.some(x => rinRefs.some(r => norm(r) === x));
    if (!overlap) { rvr = 'skip'; rvrSkip = 'no_list'; }
    else if (truncated) { rvr = 'skip'; rvrSkip = 'truncated'; }
    else {
      const a = new Set(rinRefs.map(norm)), b = new Set(remNorm);
      const diff = [...rinRefs.filter(x => !b.has(norm(x))), ...remarks.filter(x => !a.has(norm(x)))];
      rvr = diff;
      rvrOwn = diff.filter(x => thisSet.has(norm(x)));
    }
  }

  let state: BtState;
  let reasonCode: BtReason;
  let reason: string;
  const missing = invoices.filter(i => rin ? i.amount === null : !remNorm.includes(norm(i.inv))).map(i => i.inv);
  const diffInv = invoices.filter(i => i.ok === false);
  if (!rin) {
    state = 'needs';
    if (nFound === 0 || remarks.length === 0) { reasonCode = 'no_details'; reason = 'BT details not uploaded · possibly combined payment'; }
    else { reasonCode = 'not_found'; reason = `${nFound}/${thisList.length} invoices found · ${missing.length === 1 ? `${missing[0]} not in BT` : `${missing.length} invoices not in BT`}`; }
  } else if (rinBad) {
    state = 'bad'; reasonCode = 'rin_total'; reason = `BT details total ${fmt2(rincianTotal as number)} vs BT amount ${fmt2(total)}`;
  } else if (nFound < thisList.length) {
    state = 'needs'; reasonCode = 'not_found';
    reason = `${nFound}/${thisList.length} invoices found · ${missing.length === 1 ? `${missing[0]} not in BT details` : `${missing.length} invoices not in BT details`}`;
  } else if (rvrOwn.length) {
    state = 'bad'; reasonCode = 'remarks_diff'; reason = `${rvrOwn.length} invoice${rvrOwn.length === 1 ? '' : 's'} differ from Payment Remarks`;
  } else if (!eq(porsi, acuan)) {
    state = 'bad';
    if (single && diffInv.length === 1) { reasonCode = 'invoice_diff'; reason = `1 invoice differs from CIPL · ${diffInv[0].inv}`; }
    else { reasonCode = 'portion'; reason = `BT portion ${fmt2(porsi)} vs Reference ${fmt2(acuan)} · diff ${fmt2(porsi - acuan)}`; }
  } else { state = 'ok'; reasonCode = 'ok'; reason = ''; }

  return {
    state, reasonCode, path, vendor: rin?.vendor || '', currency, total, acuan, porsi, rounded: state === 'ok' && porsi !== acuan, nThis: thisList.length, nFound,
    nBt: rin ? rin.items.length : remarks.length, truncated, hasRincian: !!rin, rincianTotal, rinBad, rvr, rvrSkip, rvrOwn, reason,
    invoices, others: others.map(inv => ({ inv, amount: rin ? amountOf(inv) : null })),
  };
}

// Nilai 2 baris BT Vendor (item value & no. invoice) utk SATU jalur. `acuan*` = nilai referensi (src) apa adanya.
export function btVendorRowValues(raw: any, acuanVal: any, acuanInvoices: any, btItemValue: any, btInvoices: any, sepFix: (v: any) => any, path: 'PIB' | 'CN' = 'PIB'): { item: BtRowValue; inv: BtRowValue } {
  const srcItem = acuanVal || '';
  const srcInv = sepFix(acuanInvoices) || '';
  const legacy = { item: { src: String(srcItem), cmp: String(btItemValue ?? ''), bt: null }, inv: { src: String(srcInv), cmp: String(sepFix(btInvoices) || ''), bt: null } } as { item: BtRowValue; inv: BtRowValue };
  const bt = computeBtCombined(raw, acuanVal, acuanInvoices || (raw?.final_invoice?.inv_no), path);
  if (!bt) return legacy;
  const remSet = new Set(splitInv(btInvoices).map(norm));
  const foundList = bt.invoices.filter(i => bt.hasRincian ? i.amount !== null : remSet.has(norm(i.inv))).map(i => i.inv);
  const allFound = bt.nFound >= bt.nThis;
  // Status nilai: ok -> cmp=src (Match); needs -> kosong (partial); bad -> cmp = Total BT (alasan Rincian != BT / remarks / bukan selisih porsi) atau porsi.
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
  const pib = btVendorRowValues(raw, pibV.item_value, ciplV.no_invoice || fi.inv_no || pibV.no_invoice, btV.item_value, btV.no_invoice, sepFix, 'PIB');
  const pibInvSrc = sepFix(pibV.no_invoice) || '';
  set('bt_vendor_item_value_vs_pib', pib.item.src, pib.item.cmp, pib.item.bt);
  set('bt_vendor_no_invoice_vs_pib', pib.inv.bt ? pib.inv.src : String(pibInvSrc), pib.inv.cmp, pib.inv.bt);
  // Jalur CN: acuan = total CIPL / Final Invoice.
  const cn = btVendorRowValues(raw, ciplV.total_value, ciplV.no_invoice || fi.inv_no, btV.item_value, btV.no_invoice, sepFix, 'CN');
  set('cipl_bt_vendor_item_value', cn.item.src, cn.item.cmp, cn.item.bt);
  set('cipl_bt_vendor_no_invoice', String(ciplV.no_invoice || ''), cn.inv.cmp, cn.inv.bt);
}
