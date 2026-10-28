// Baris tabel Cost Validation FAR Overseas Air: status per baris (Match / Above / Below / OK / Not in quotation) + temuan AI per baris.
// Dipisah dari modal (2026-10-27) supaya bisa diuji tanpa komponen. SATU sumber utk tabel di modal DAN kotak "AI finding".
import { computeCostStatus } from './FarOverseasAirHelpers';

export type CostValRow = { row_key: string; expected?: any; actual?: any; notes?: string | null; edited?: boolean };

// Status per baris tabel biaya (spek: Match / Above / Below) -- Unit price & TOTAL pakai
// `computeCostStatus()` (SATU-SATUNYA fungsi status cost, toleransi 3%).
export function rowCheck(row: CostValRow): { label: string; cls: string } | null {
  const exp = row.expected != null && row.expected !== '' ? Number(row.expected) : null;
  const act = row.actual != null && row.actual !== '' ? Number(row.actual) : null;
  if (row.row_key === 'KG') {
    if (exp == null || act == null || isNaN(exp) || isNaN(act)) return null;
    return act >= exp ? { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' } : { label: 'Below min.', cls: 'bg-amber-50 text-amber-800' };
  }
  if (row.row_key === 'OTHER_CHARGES') {
    if (act == null || act === 0) return { label: 'OK', cls: 'bg-emerald-50 text-emerald-700' };
    if (exp == null) return { label: 'Not in quotation', cls: 'bg-rose-50 text-rose-700' };
  }
  if (exp == null || act == null || isNaN(exp) || isNaN(act)) return null;
  const st = computeCostStatus(exp, act);
  if (st === 'MATCH') return { label: 'Match', cls: 'bg-emerald-50 text-emerald-700' };
  if (st === 'OVERCHARGE') return { label: 'Above', cls: 'bg-rose-50 text-rose-700' };
  if (st === 'UNDERCHARGE') return { label: 'Below', cls: 'bg-amber-50 text-amber-800' };
  return null;
}

// Temuan AI per BARIS (2026-10-27, permintaan user): baris biaya selain TOTAL yang hasil check-nya BUKAN Match / OK -- KG di bawah minimum,
// Unit price Above/Below, Other charges Not in quotation (atau Above/Below) -- ikut tampil di kotak "AI finding" supaya user mengisi catatan.
// Kunci konfirmasi per baris: ROW_KG / ROW_UNIT_PRICE / ROW_OTHER_CHARGES (disimpan di ai_findings_confirmed, RPC butuh sql/082). TOTAL TIDAK diulang
// (sudah jadi temuan Overcharge / Undercharge). Hanya catatan: server TIDAK memblokir tanda tangan utk temuan baris (hanya Overcharge & duplikat).
const ROW_FINDING_KEY: Record<string, string> = { KG: 'ROW_KG', UNIT_PRICE_DARI_DESCRIPTION: 'ROW_UNIT_PRICE', OTHER_CHARGES: 'ROW_OTHER_CHARGES' };
export function deriveRowFindings(rows: CostValRow[], qtyUnit: string): { key: string; title: string; detail: string }[] {
  const out: { key: string; title: string; detail: string }[] = [];
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  rows.forEach(row => {
    const key = ROW_FINDING_KEY[row.row_key];
    if (!key) return;
    const chk = rowCheck(row);
    if (!chk || chk.label === 'Match' || chk.label === 'OK') return;
    const exp = row.expected != null && row.expected !== '' ? Number(row.expected) : null;
    const act = row.actual != null && row.actual !== '' ? Number(row.actual) : null;
    const both = exp != null && act != null && !isNaN(exp) && !isNaN(act) ? `Expected ${fmt(exp)} · Actual ${fmt(act)}.` : '';
    const item = row.row_key === 'KG' ? qtyUnit : row.row_key === 'OTHER_CHARGES' ? 'Other charges' : 'Unit price';
    if (chk.label === 'Below min.') out.push({ key, title: `${item} below minimum`, detail: `${both} The invoice is below the minimum of the matching contract rate.`.trim() });
    else if (chk.label === 'Not in quotation') out.push({ key, title: 'Other charges not in quotation', detail: `${act != null ? fmt(act) : 'An amount'} is billed but there is no matching charge in the quotation.${row.notes ? ` Note on the invoice: ${row.notes}` : ''}` });
    else out.push({ key, title: `${item} ${chk.label.toLowerCase()} contract rate`, detail: `${both} The invoice is ${chk.label.toLowerCase()} the matching contract rate.`.trim() });
  });
  return out;
}
