// Revisi Cost Validation Courier 2026-10-19 (permintaan user, mockup `mockup_cost_validation_rule.html`) -- normalisasi
// TAMPILAN baris tabel_cost_validasi. **Keputusan user: HANYA di tampilan** -- data DB TIDAK diubah (n8n tetap menulis apa
// adanya); semua tampilan (panel Invoice Recap, Details, popup Audit, Finance Handover, badge/KPI/kunci Submit) membaca
// lewat `computeLiveCostSummary` / `normalizeCourierCostView` sehingga konsisten.
//
// A. Baris dobel & OTHER CHARGES (RULE NOT FOUND): saat dokumen di-upload ulang, n8n MENAMBAH baris "OTHER CHARGES"
//    RULE_NOT_FOUND ke baris lama padahal biaya yang sama sudah ada sebagai rule (mis. FEDEX 878021573327: OTHER CHARGES
//    18.000 + DEMAND SURCHARGE 18.000; Duty OTHER CHARGES 14.500 + Bonded Storage 14.500). Item RULE_NOT_FOUND DITANDAI
//    `_merged_into` (TIDAK dihapus -- index array tetap utuh utk Edit/Potong CN/RPC fn_update_actual_value yang ber-index):
//    1. nilai 0/kosong -> baris kosong;
//    2. deskripsi storage/bonded/gudang -> Bonded Storage (Actual storage kosong -> diisi nilai itu di tampilan);
//    3. nama sama dgn item rule lain di invoice yg sama -> item itu;
//    4. nilai sama (±Rp 1) dgn item rule lain / baris utama di invoice yg sama -> baris itu.
//    Selain itu tetap RULE NOT FOUND. Hanya item RULE_NOT_FOUND yang disentuh.
// TOTAL Invoice Freight/Duty SELALU dihitung ulang dgn rumus RPC `fn_recompute_totals` (total tersimpan dari n8n kadang
// tidak memasukkan Bonded Storage) dari item yang tidak ditandai.
//
// C. Status freight turunan Checklist (`courierFreightDerived`): baris freight ZONE_NOT_FOUND ->
//    Invoice Freight belum ada di Checklist = WAITING_FREIGHT ("Menunggu Invoice Freight"); di-"Accept with note" = N/A;
//    sudah ada = ZONE_NOT_FOUND. Konteks dari `fetchCourierCostContexts` (dokumen_checklist + rekapan_courier).
//
// A4. Total dokumen invoice (`ctx.invoiceTotals`): Freight = SUM(total_amount) invoice FREIGHT; Duty = SUM(courier_adm_fee)
//    invoice DUTY (+ SUM(total_duty_tax) bila baris Duty & Tax ikut divalidasi). Dicek production 2026-10-19 dgn rumus
//    fn_recompute_totals: Freight 93/96 & Duty 105/110 cocok, sisanya selisih nyata.
import { supabase } from '../lib/supabase';

export type FreightInvoiceState = 'present' | 'missing' | 'accepted' | null;
export type CourierInvoiceTotals = { FREIGHT?: number | null; DUTY_ADM?: number | null; DUTY_TAX?: number | null };
export type CourierCostContext = { freightInvoice?: FreightInvoiceState; invoiceTotals?: CourierInvoiceTotals | null };

export type CostMergeInfo = { section: 'FREIGHT' | 'DUTY'; index: number; name: string; actual: number | null; into: string };

const RNF = 'RULE_NOT_FOUND';
const num = (v: any): number => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v));
const numOrNull = (v: any): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const sameAmt = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= 1;
const normName = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const STORAGE_RE = /STORAGE|BONDED|GUDANG|PENIMBUNAN|WAREHOUS/;

export function parseCostArray(raw: any): any[] {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } } // double-encoded (data lama)
  return Array.isArray(v) ? v : [];
}
export function parseAdjustments(raw: any): Record<number, number> {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  const out: Record<number, number> = {};
  if (Array.isArray(v)) v.forEach((x, i) => { out[i] = num(x); });
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { const i = Number(k); if (!isNaN(i)) out[i] = num(x); });
  return out;
}

// Baris utama per invoice (nilai Actual yang dipakai TOTAL) -- pembanding dedupe nilai sama (aturan 4).
const mainActuals = (d: any, sec: 'FREIGHT' | 'DUTY'): { label: string; actual: number | null }[] => sec === 'FREIGHT'
  ? [
      { label: 'Freight Charge', actual: numOrNull(d.cv_freight_actual) },
      { label: 'Fuel Surcharge', actual: numOrNull(d.cv_fuel_actual) },
      { label: 'VAT', actual: numOrNull(d.cv_vat_freight_actual_net ?? d.cv_vat_freight_actual) },
    ]
  : [
      { label: 'Duty & Tax', actual: numOrNull(d.cv_import_export_duties) },
      { label: 'Non-Routine Entry', actual: numOrNull(d.cv_nonroutine_actual) },
      { label: 'Disbursement', actual: numOrNull(d.cv_disbursement_actual) },
      { label: 'Processing Fee', actual: numOrNull(d.cv_processing_fee_actual) },
      { label: 'Bonded Storage', actual: numOrNull(d.cv_storage_actual) },
      { label: 'VAT Duty', actual: numOrNull(d.cv_vat_duty_actual_net ?? d.cv_vat_duty_actual) },
    ];

function markSection(view: any, sec: 'FREIGHT' | 'DUTY', merged: CostMergeInfo[]): any[] {
  const field = sec === 'FREIGHT' ? 'cv_other_charges_freight' : 'cv_other_charges_duty';
  const arr = parseCostArray(view[field]).map((it: any) => ({ ...it }));
  const isRnf = (it: any) => String(it?.status || '').toUpperCase() === RNF && !it._merged_into;
  arr.forEach((it: any, i: number) => {
    if (!isRnf(it)) return;
    const actual = numOrNull(it.actual);
    const name = normName(it.name || it.surcharge_name);
    let into: string | null = null;
    if (actual === null || actual === 0) into = '(empty line)';
    if (!into && STORAGE_RE.test(name)) {
      const st = numOrNull(view.cv_storage_actual);
      if (st === null) { view.cv_storage_actual = actual; into = 'Bonded Storage'; }
      else if (sameAmt(st, actual)) into = 'Bonded Storage';
    }
    if (!into && name) {
      const twin = arr.find((o: any, j: number) => j !== i && !isRnf(o) && !o._merged_into && normName(o.name || o.surcharge_name) === name && String(o.status || '').toUpperCase() !== 'STORAGE');
      if (twin) into = String(twin.name || twin.surcharge_name);
    }
    if (!into) {
      const twin = arr.find((o: any, j: number) => j !== i && !isRnf(o) && !o._merged_into && sameAmt(numOrNull(o.actual), actual));
      if (twin) into = String(twin.name || twin.surcharge_name || 'other charge');
    }
    if (!into) {
      const main = mainActuals(view, sec).find(m => sameAmt(m.actual, actual));
      if (main) into = main.label;
    }
    if (into) {
      it._merged_into = into;
      merged.push({ section: sec, index: i, name: String(it.name || it.surcharge_name || ''), actual, into });
    }
  });
  return arr;
}

// TOTAL = rumus fn_recompute_totals (other charges dikurangi adjustment potong CN per index, item STORAGE & item yg
// ditandai _merged_into tidak dihitung; Bonded Storage expected = expected ?? actual; Duty & Tax hanya bila > 0).
function recomputeTotals(view: any) {
  const tol = 0.02;
  const sumOther = (field: string, adjField: string) => {
    const adj = parseAdjustments(view[adjField]);
    let exp = 0, act = 0;
    parseCostArray(view[field]).forEach((e: any, i: number) => {
      if (String(e?.status || '') === 'STORAGE' || e?._merged_into) return;
      const a = Math.max(num(e.actual) - num(adj[i]), 0);
      act += a;
      exp += e.expected !== null && e.expected !== undefined && e.expected !== '' ? num(e.expected) : a;
    });
    return { exp, act };
  };
  const statusOf = (exp: number, act: number) => (exp === 0 ? 'N/A' : Math.abs(act - exp) <= exp * tol ? 'OK' : act > exp ? 'OVERCHARGE' : 'UNDERCHARGE');
  const of = sumOther('cv_other_charges_freight', 'cv_other_freight_adjustments');
  const od = sumOther('cv_other_charges_duty', 'cv_other_duty_adjustments');
  const fExp = num(view.cv_freight_expected) + num(view.cv_fuel_expected) + num(view.cv_vat_freight_expected) + of.exp;
  const fAct = num(view.cv_freight_actual) + num(view.cv_fuel_actual) + num(view.cv_vat_freight_actual_net ?? view.cv_vat_freight_actual) + of.act;
  const dutiesShown = num(view.cv_import_export_duties) > 0;
  const stAct = num(view.cv_storage_actual);
  const stExp = view.cv_storage_expected !== null && view.cv_storage_expected !== undefined ? num(view.cv_storage_expected) : stAct;
  const dExp = (dutiesShown ? num(view.cv_duties_expected) : 0) + num(view.cv_nonroutine_expected) + num(view.cv_disbursement_expected)
    + num(view.cv_processing_fee_expected) + stExp + od.exp + num(view.cv_vat_duty_expected);
  const dAct = (dutiesShown ? num(view.cv_import_export_duties) : 0) + num(view.cv_nonroutine_actual) + num(view.cv_disbursement_actual)
    + num(view.cv_processing_fee_actual) + stAct + od.act + num(view.cv_vat_duty_actual_net ?? view.cv_vat_duty_actual);
  view.cv_total_freight_expected = fExp;
  view.cv_total_freight_actual = fAct;
  view.cv_total_freight_selisih = fAct - fExp;
  view.cv_total_freight_status = statusOf(fExp, fAct);
  view.cv_total_duty_expected = dExp;
  view.cv_total_duty_actual = dAct;
  view.cv_total_duty_selisih = dAct - dExp;
  view.cv_total_duty_status = statusOf(dExp, dAct);
}

// Salinan TAMPILAN (idempotent: `_cv_view` = sudah dinormalisasi). `_cv_merged` = daftar item yang ditandai.
export function normalizeCourierCostView(raw: any): any {
  if (!raw || raw._cv_view) return raw;
  const view: any = { ...raw };
  const merged: CostMergeInfo[] = [];
  view.cv_other_charges_freight = markSection(view, 'FREIGHT', merged);
  view.cv_other_charges_duty = markSection(view, 'DUTY', merged);
  recomputeTotals(view);
  view._cv_view = true;
  view._cv_merged = merged;
  return view;
}

// Status turunan baris Freight (C). null = tidak berlaku (pakai status kolom apa adanya).
export type FreightDerived = 'WAITING_FREIGHT' | 'N/A' | 'ZONE_NOT_FOUND' | null;
export function courierFreightDerived(data: any, ctx?: CourierCostContext | null): FreightDerived {
  if (!data || String(data.cv_freight_status || '').toUpperCase() !== 'ZONE_NOT_FOUND') return null;
  if (ctx?.freightInvoice === 'missing') return 'WAITING_FREIGHT';
  if (ctx?.freightInvoice === 'accepted') return 'N/A';
  return 'ZONE_NOT_FOUND';
}

// Total dokumen invoice per bagian (null = tidak dibandingkan: tidak ada invoice / ada Credit Note di bagian itu).
export function courierInvoiceDocTotal(view: any, sec: 'FREIGHT' | 'DUTY', ctx?: CourierCostContext | null): number | null {
  const t = ctx?.invoiceTotals;
  if (!t || !view) return null;
  if (sec === 'FREIGHT') {
    if (num(view.cv_cn_freight_total) > 0 || t.FREIGHT === null || t.FREIGHT === undefined) return null;
    return num(t.FREIGHT);
  }
  if (num(view.cv_cn_duty_total) > 0 || t.DUTY_ADM === null || t.DUTY_ADM === undefined) return null;
  return num(t.DUTY_ADM) + (num(view.cv_import_export_duties) > 0 ? num(t.DUTY_TAX) : 0);
}

// Konteks per baris Audit (docType PIB/CN + id) -- batch, gagal = konteks kosong (perilaku lama, fail-open).
export async function fetchCourierCostContexts(items: { docType: string; id: any }[]): Promise<Record<string, CourierCostContext>> {
  const out: Record<string, CourierCostContext> = {};
  const byKey = (dt: string, id: any) => `${String(dt).toUpperCase()}:${id}`;
  const groups: { idKey: 'pib_id' | 'cn_id'; dt: 'PIB' | 'CN'; ids: any[] }[] = [
    { idKey: 'pib_id', dt: 'PIB', ids: items.filter(i => String(i.docType).toUpperCase() === 'PIB' && i.id).map(i => i.id) },
    { idKey: 'cn_id', dt: 'CN', ids: items.filter(i => String(i.docType).toUpperCase() === 'CN' && i.id).map(i => i.id) },
  ];
  const chunk = 50;
  await Promise.all(groups.map(async g => {
    for (let i = 0; i < g.ids.length; i += chunk) {
      const ids = Array.from(new Set(g.ids.slice(i, i + chunk)));
      const [chk, inv] = await Promise.all([
        supabase.from('dokumen_checklist').select(`${g.idKey}, ada_invoice_freight, accepted_docs, catatan_checklist`).in(g.idKey, ids),
        supabase.from('rekapan_courier').select(`${g.idKey}, invoice_type, total_amount, courier_adm_fee, total_duty_tax`).in(g.idKey, ids),
      ]);
      if (chk.error) console.warn('[CostCtx] dokumen_checklist gagal dibaca:', chk.error.message);
      if (inv.error) console.warn('[CostCtx] rekapan_courier gagal dibaca:', inv.error.message);
      (chk.data || []).forEach((c: any) => {
        const key = byKey(g.dt, c[g.idKey]);
        const accepted = Array.isArray(c.accepted_docs) && c.accepted_docs.includes('ada_invoice_freight') && String(c.catatan_checklist || '').trim() !== '';
        (out[key] ||= {}).freightInvoice = c.ada_invoice_freight ? 'present' : accepted ? 'accepted' : 'missing';
      });
      (inv.data || []).forEach((r: any) => {
        const key = byKey(g.dt, r[g.idKey]);
        const t = ((out[key] ||= {}).invoiceTotals ||= {});
        const type = String(r.invoice_type || '').toUpperCase();
        if (type === 'FREIGHT') t.FREIGHT = num(t.FREIGHT) + num(r.total_amount);
        else if (type === 'DUTY') { t.DUTY_ADM = num(t.DUTY_ADM) + num(r.courier_adm_fee); t.DUTY_TAX = num(t.DUTY_TAX) + num(r.total_duty_tax); }
      });
    }
  }));
  return out;
}
export const courierCostCtxKey = (docType: string, id: any) => `${String(docType || '').toUpperCase()}:${id}`;
