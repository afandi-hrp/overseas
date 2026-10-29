// Laporan validasi detail invoice Cost Agent (Tahap 3b, 2026-10-28): popup "Cost validation" (dari tab Cost lines) dan "Document validation report" (dari tab Documents & Tax),
// plus pembangun 3 cek dokumen (Check 1 Invoice <-> Attachment, Check 2 Invoice <-> Master data, Check 3 Invoice <-> Tax invoice). MURNI TAMPILAN dari data yang sudah ada:
// baris + compare_flag (fn_cost_agent_get_invoice_history) dan perbandingan dokumen (fn_cost_agent_get_invoice_documents). Tidak ada aturan bisnis baru; hanya baca & Print.
import { useEffect, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_LABEL, type Tone } from './SeaAirAuditUi'
import {
  fmtDate, fmtNumber, fmtRupiah,
  type CostAgentDocCompare, type CostAgentInvoice, type CostAgentInvoiceLine,
} from '../utils/CostAgentHelpers'

// Esc menutup dialog ini SAJA (fase capture + stopImmediatePropagation) -- modal induk (detail invoice) memakai Esc untuk menutup dirinya.
export function useEscClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [active, onClose])
}

// ─── Cost validation ────────────────────────────────────────────────────────────────────────────────────────────
export type CostValStatus = 'ok' | 'accepted' | 'difference' | 'na'
// Arah selisih terhadap history (permintaan user 2026-10-28): invoice LEBIH TINGGI dari history = Above; LEBIH RENDAH = Under. Status 'difference' ditampilkan sbg Above / Under.
export type CostValDir = 'above' | 'under' | null
export type CostValKey = CostValStatus | 'above' | 'under'
export interface CostValRow { line: CostAgentInvoiceLine; status: CostValStatus; reason: string | null; dir: CostValDir; expected: number | null; actual: number; diff: number | null }
export interface CostValSummary { rows: CostValRow[]; counts: Record<CostValStatus, number>; above: number; under: number; accuracy: number | null }
export const costKey = (status: CostValStatus, dir: CostValDir): CostValKey => (status === 'difference' && dir ? dir : status)

// Klasifikasi per baris HANYA dari data baris: sesuai -> OK; naik/turun + verified -> Accepted (Overcharge / Undercharge), belum verified -> Difference;
// tanpa_history / item_baru / tanpa cost item -> N/A. Accuracy = (OK + Accepted) / baris yang punya pembanding.
// Satu baris: sesuai -> OK; naik/turun + verified -> Accepted (Overcharge / Undercharge); belum verified -> Difference; tanpa_history / item_baru / tanpa cost item -> N/A.
export function classifyCostLine(l: CostAgentInvoiceLine): { status: CostValStatus; reason: string | null; dir: CostValDir } {
  if (!l.cost_item_id) return { status: 'na', reason: 'Not mapped', dir: null }
  if (l.compare_flag === 'sesuai') return { status: 'ok', reason: null, dir: null }
  if (l.compare_flag === 'naik' || l.compare_flag === 'turun') {
    const dir: CostValDir = l.compare_flag === 'naik' ? 'above' : 'under'
    return l.is_verified ? { status: 'accepted', reason: dir === 'above' ? 'Above' : 'Under', dir } : { status: 'difference', reason: null, dir }
  }
  return { status: 'na', reason: l.compare_flag === 'item_baru' ? 'New item' : 'No history', dir: null }
}

export function classifyCostLines(lines: CostAgentInvoiceLine[]): CostValSummary {
  const counts: Record<CostValStatus, number> = { ok: 0, accepted: 0, difference: 0, na: 0 }
  let above = 0, under = 0
  const rows: CostValRow[] = lines.map(l => {
    const { status, reason, dir } = classifyCostLine(l)
    counts[status]++
    if (status === 'difference') { if (dir === 'above') above++; else if (dir === 'under') under++ }
    const expected = l.compare_ref_amount ?? null
    return { line: l, status, reason, dir, expected, actual: Number(l.amount || 0), diff: expected === null ? null : Number(l.amount || 0) - Number(expected) }
  })
  const base = counts.ok + counts.accepted + counts.difference
  return { rows, counts, above, under, accuracy: base > 0 ? Math.round(((counts.ok + counts.accepted) / base) * 100) : null }
}

export const COST_CHIP: Record<CostValKey, { tone: Tone; label: string }> = {
  ok: { tone: 'green', label: 'OK' }, accepted: { tone: 'amber', label: 'Accepted' }, difference: { tone: 'red', label: 'Difference' },
  above: { tone: 'red', label: 'Above' }, under: { tone: 'blue', label: 'Under' }, na: { tone: 'grey', label: 'N/A' },
}
const PTH = 'px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] bg-[#FBF7F4] border-b border-[#EADFD6] whitespace-nowrap'
const PTD = 'px-2.5 py-2 text-[12.5px] text-[#3B1B3D] align-top border-b border-[#F3EEEA]'

function ReportShell({ id, title, subtitle, onClose, children }: { id: string; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  useEscClose(true, onClose)
  return createPortal(
    <div className="fixed inset-0 z-[88] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div id={id} role="dialog" aria-label={title} className="bg-white rounded-2xl shadow-2xl w-full max-w-[1180px] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[#3B1B3D] leading-tight">{title}</h2>
            {subtitle && <p className="text-[12px] text-[#6E5E70] mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 print-hide">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => window.print()}><Printer size={13} /> Print</button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function CostValidationDialog({ lines, invoiceNo, onClose }: { lines: CostAgentInvoiceLine[]; invoiceNo: string | null; onClose: () => void }) {
  const s = useMemo(() => classifyCostLines(lines), [lines])
  const unreviewed = s.counts.difference
  const tiles: { st: CostValKey; n: number }[] = [{ st: 'ok', n: s.counts.ok }, { st: 'accepted', n: s.counts.accepted }, { st: 'above', n: s.above }, { st: 'under', n: s.under }, { st: 'na', n: s.counts.na }]
  return (
    <ReportShell id="cost-validation-print-area" title="Cost validation" subtitle={`Invoice ${invoiceNo || ''} · each line compared with its history reference`} onClose={onClose}>
      <div className="p-5 space-y-4" data-cost-validation>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {tiles.map(t => (
            <div key={t.st} className="rounded-xl border border-[#EADFD6] px-3 py-2.5">
              <div className={SA_LABEL}>{COST_CHIP[t.st].label}</div>
              <div className="text-[22px] font-extrabold tabular-nums text-[#3B1B3D] leading-tight" data-count={t.st}>{t.n}</div>
            </div>
          ))}
          <div className="rounded-xl border border-[#D9C7DA] bg-[#F5EDF3] px-3 py-2.5">
            <div className={SA_LABEL}>Accuracy</div>
            <div className="text-[22px] font-extrabold tabular-nums text-[#6B3470] leading-tight" data-accuracy>{s.accuracy === null ? '—' : `${s.accuracy}%`}</div>
          </div>
        </div>
        {unreviewed > 0
          ? <p className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] font-semibold text-[#7A4F00]">{unreviewed} above / under not reviewed by the maker</p>
          : <p className="rounded-lg border border-[#BFE3CC] bg-[#EAF6EF] px-3 py-2 text-[12.5px] font-semibold text-[#17663D]">Nothing above or under is left to review</p>}
        <div className="rounded-xl border border-[#EADFD6] overflow-x-auto">
          <table className="min-w-full">
            <thead><tr><th className={PTH}>Validation</th><th className={`${PTH} text-right min-w-[150px]`}>Expected (history)</th><th className={`${PTH} text-right min-w-[130px]`}>Actual</th><th className={`${PTH} text-right min-w-[140px]`}>Difference</th><th className={PTH}>Status</th></tr></thead>
            <tbody>
              {s.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No cost lines.</td></tr>}
              {s.rows.map(r => (
                <tr key={r.line.id}>
                  <td className={`${PTD} min-w-[220px]`}><span className="text-[#8A7A8B] mr-1.5 tabular-nums">{r.line.line_no}.</span>{r.line.description_raw}</td>
                  <td className={`${PTD} text-right tabular-nums whitespace-nowrap`}>{r.expected === null ? '—' : fmtRupiah(r.expected)}</td>
                  <td className={`${PTD} text-right tabular-nums font-semibold whitespace-nowrap`}>{fmtRupiah(r.actual)}</td>
                  <td className={`${PTD} text-right tabular-nums whitespace-nowrap ${r.diff ? (r.diff > 0 ? 'text-[#A8231A]' : 'text-[#17663D]') : ''}`}>{r.diff === null ? '—' : `${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${fmtRupiah(Math.abs(r.diff))}`}</td>
                  <td className={PTD}><Chip tone={COST_CHIP[costKey(r.status, r.dir)].tone}>{COST_CHIP[costKey(r.status, r.dir)].label}</Chip>{r.reason && <span className="ml-1.5 text-[11px] text-[#6E5E70]">{r.reason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  )
}

// ─── Document validation: 3 cek ─────────────────────────────────────────────────────────────────────────────────
export type RowState = 'ok' | 'mismatch' | 'attention' | 'neutral'
export interface CheckRow { label: string; state: RowState; invoice?: string | null; other?: string | null; note?: string | null }
export interface CheckBlock { key: 'c1' | 'c2' | 'c3'; title: string; rows: CheckRow[]; ok: number; checked: number; state: 'ok' | 'review' | 'mismatch' | 'na'; accuracy: number | null }

// match* = OK; diff = mismatch; none / no_doc / pending = perlu perhatian; not_required / not_in_fp (dikecualikan) = netral.
export function lineState(s?: string | null): RowState {
  if (!s) return 'neutral'
  if (s.startsWith('match')) return 'ok'
  if (s === 'diff') return 'mismatch'
  if (s === 'none' || s === 'no_doc' || s === 'pending') return 'attention'
  return 'neutral'
}
export function checkState(s?: string | null): RowState {
  return s === 'ok' ? 'ok' : s === 'diff' ? 'mismatch' : s === 'warn' ? 'attention' : 'neutral'
}
const val = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? fmtNumber(v, 0) : String(v))
const compRow = (c: { key: string; status: string; required?: boolean; label: string } | undefined, label: string): CheckRow | null => {
  if (!c) return null
  if (c.status === 'present') return { label, state: 'ok' }
  if (c.status === 'not_required') return { label, state: 'neutral', note: 'Not required' }
  return { label, state: 'attention', note: c.status === 'pending' ? 'Waiting' : 'Not received' }
}

function finish(key: CheckBlock['key'], title: string, rows: CheckRow[]): CheckBlock {
  const checked = rows.filter(r => r.state !== 'neutral').length
  const ok = rows.filter(r => r.state === 'ok').length
  const state: CheckBlock['state'] = rows.some(r => r.state === 'mismatch') ? 'mismatch' : rows.some(r => r.state === 'attention') ? 'review' : checked === 0 ? 'na' : 'ok'
  return { key, title, rows, ok, checked, state, accuracy: checked > 0 ? Math.round((ok / checked) * 100) : null }
}

export function buildDocChecks(cmp: CostAgentDocCompare | null, inv: CostAgentInvoice, lines: CostAgentInvoiceLine[]): CheckBlock[] {
  const completeness = cmp?.completeness || []
  const byKey = (k: string) => completeness.find(c => c.key === k)
  const cmpLines = cmp?.lines || []
  const headers = cmp?.header_checks || []
  const dates = cmp?.date_checks || []

  // Check 1 -- Invoice <-> Attachment
  const c1: CheckRow[] = []
  const att = compRow(byKey('attachment'), 'Attachment received'); if (att) c1.push(att)
  cmpLines.forEach(l => c1.push({ label: `Line ${l.line_no} · ${l.description || l.cost_item || ''}`.trim(), state: lineState(l.attachment?.status), invoice: val(l.amount), other: val(l.attachment?.matched_amount), note: l.attachment?.status === 'diff' ? `Difference ${val(l.attachment?.diff) ?? ''}`.trim() : null }))
  headers.filter(h => h.group !== 'tax').forEach(h => c1.push({ label: h.field, state: checkState(h.status), invoice: val(h.invoice_value), other: val(h.doc_value), note: h.note }))

  // Check 2 -- Invoice <-> Master data
  const mapped = lines.filter(l => l.cost_item_id).length
  const c2: CheckRow[] = [
    { label: 'Vendor', state: inv.vendor_id ? 'ok' : 'attention', invoice: inv.vendor_name_raw, other: inv.vendor_name, note: inv.vendor_id ? null : 'Not matched' },
    { label: 'Vessel', state: inv.vessel_id ? 'ok' : 'attention', invoice: inv.vessel_name_raw, other: inv.vessel_name, note: inv.vessel_id ? null : 'Not matched' },
    { label: 'Port', state: inv.port_id ? 'ok' : 'attention', invoice: inv.port_name_raw, other: inv.port_name, note: inv.port_id ? null : 'Not matched' },
    { label: 'Voyage', state: inv.voyage_id ? 'ok' : 'attention', invoice: inv.voyage_no_raw, other: inv.voyage_id ? String((inv.voyage as any)?.voyage_no ?? inv.voyage_id) : null, note: inv.voyage_id ? null : 'Not matched' },
  ]
  if (lines.length > 0) c2.push({ label: 'Cost items', state: mapped === lines.length ? 'ok' : 'attention', invoice: `${lines.length} lines`, other: `${mapped} mapped`, note: mapped === lines.length ? null : `${lines.length - mapped} not mapped` })
  dates.forEach(d => c2.push({ label: d.label, state: checkState(d.status), invoice: val(d.compare_to) && fmtDate(d.compare_to), other: val(d.date) && fmtDate(d.date), note: d.note }))

  // Check 3 -- Invoice <-> Tax invoice
  const c3: CheckRow[] = []
  const tax = compRow(byKey('tax_invoice'), 'Tax invoice received'); if (tax) c3.push(tax)
  cmpLines.forEach(l => c3.push({ label: `Line ${l.line_no} · ${l.description || l.cost_item || ''}`.trim(), state: lineState(l.tax?.status), invoice: val(l.amount), other: val(l.tax?.matched_amount), note: l.tax?.status === 'diff' ? `Difference ${val(l.tax?.diff) ?? ''}`.trim() : null }))
  headers.filter(h => h.group === 'tax').forEach(h => c3.push({ label: h.field, state: checkState(h.status), invoice: val(h.invoice_value), other: val(h.doc_value), note: h.note }))
  ;(cmp?.tax_totals?.checks || []).forEach(t => c3.push({ label: t.label, state: checkState(t.status), invoice: val(t.invoice_value), other: val(t.doc_value), note: t.note }))
  ;(cmp?.tax_totals?.rate_checks || []).forEach(t => c3.push({ label: `VAT rate · ${t.doc_no || ''}`.trim(), state: checkState(t.status), other: t.rate_pct === null ? null : `${t.rate_pct}%`, note: t.note }))

  return [finish('c1', 'Check 1 · Invoice ↔ Attachment', c1), finish('c2', 'Check 2 · Invoice ↔ Master data', c2), finish('c3', 'Check 3 · Invoice ↔ Tax invoice', c3)]
}

// ─── Laporan 4 kolom (Field | Invoice | Tax invoice | Attachment | Master data) ──────────────────────────────────
type CellState = 'match' | 'mismatch' | 'expired' | 'notfilled' | 'plain'
interface ReportCell { value: string | null; st: CellState }
interface ReportRow { field: string; invoice: string | null; tax?: ReportCell; att?: ReportCell; master?: ReportCell }
const CELL_CHIP: Record<Exclude<CellState, 'plain'>, { tone: Tone; label: string }> = { match: { tone: 'green', label: 'Match' }, mismatch: { tone: 'red', label: 'Mismatch' }, expired: { tone: 'amber', label: 'Expired' }, notfilled: { tone: 'grey', label: 'Not filled' } }
const cell = (value: unknown, status: string | null | undefined, kind: 'field' | 'date' = 'field'): ReportCell | undefined => {
  const v = val(value)
  // Tahap 3d: nilai kosong + status na / tidak ada = sisi itu memang tidak menyimpannya -> "—" tanpa chip. "Not filled" hanya bila nilai yang DIHARAPKAN di dokumen tidak terbaca (status lain).
  if (v === null) return !status || status === 'na' ? undefined : { value: null, st: 'notfilled' }
  if (status === 'ok') return { value: v, st: 'match' }
  if (status === 'warn' && kind === 'date') return { value: v, st: 'expired' }
  if (status === 'diff' || status === 'warn') return { value: v, st: 'mismatch' }
  return { value: v, st: 'plain' } // nilai dokumen ada tetapi tidak ada pembanding di invoice (status na): tampilkan nilainya TANPA chip
}

export function buildReportRows(cmp: CostAgentDocCompare | null, inv: CostAgentInvoice): ReportRow[] {
  const rows: ReportRow[] = []
  const map = new Map<string, ReportRow>()
  ;(cmp?.header_checks || []).forEach(h => {
    let r = map.get(h.field)
    if (!r) { r = { field: h.field, invoice: val(h.invoice_value) }; map.set(h.field, r); rows.push(r) }
    if (h.group === 'tax') r.tax = cell(h.doc_value, h.status); else r.att = cell(h.doc_value, h.status)
  })
  const m = (label: string, raw: string | null, name: string | null, id: number | null): ReportRow => ({ field: label, invoice: raw, master: id ? { value: name, st: name ? 'match' : 'notfilled' } : { value: null, st: 'notfilled' } })
  rows.push(m('Vendor', inv.vendor_name_raw, inv.vendor_name, inv.vendor_id), m('Vessel', inv.vessel_name_raw, inv.vessel_name, inv.vessel_id),
    m('Port', inv.port_name_raw, inv.port_name, inv.port_id), m('Voyage', inv.voyage_no_raw, inv.voyage_id ? String((inv.voyage as any)?.voyage_no ?? inv.voyage_id) : null, inv.voyage_id))
  ;(cmp?.date_checks || []).forEach(d => rows.push({ field: d.label, invoice: val(d.compare_to) && fmtDate(d.compare_to), att: cell(d.date && fmtDate(d.date), d.status, 'date') }))
  ;(cmp?.tax_totals?.checks || []).forEach(t => rows.push({ field: t.label, invoice: val(t.invoice_value), tax: cell(t.doc_value, t.status) }))
  return rows
}

const Cell = ({ c }: { c?: ReportCell }) => (!c ? <span className="text-[#C9BFCB]">—</span> : (
  <div className="flex items-center gap-1.5 flex-wrap"><span className="[overflow-wrap:anywhere]">{c.value ?? ''}</span>{c.st !== 'plain' && <Chip tone={CELL_CHIP[c.st].tone}>{CELL_CHIP[c.st].label}</Chip>}</div>
))

// Tabel laporan 4 kolom (dipakai dialog cetak di bawah dan modal "Full comparison").
export function DocValidationTable({ cmp, inv }: { cmp: CostAgentDocCompare | null; inv: CostAgentInvoice }) {
  const rows = useMemo(() => buildReportRows(cmp, inv), [cmp, inv])
  return (
    <div className="rounded-xl border border-[#EADFD6] overflow-x-auto">
      <table className="min-w-full">
        <thead><tr><th className={PTH}>Field</th><th className={PTH}>Invoice</th><th className={PTH}>Tax invoice</th><th className={PTH}>Attachment</th><th className={PTH}>Master data</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">Nothing to compare yet.</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={`${PTD} font-semibold min-w-[140px]`}>{r.field}</td>
              <td className={`${PTD} [overflow-wrap:anywhere]`}>{r.invoice ?? <span className="text-[#C9BFCB]">—</span>}</td>
              <td className={PTD}><Cell c={r.tax} /></td>
              <td className={PTD}><Cell c={r.att} /></td>
              <td className={PTD}><Cell c={r.master} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DocValidationReport({ cmp, inv, onClose }: { cmp: CostAgentDocCompare | null; inv: CostAgentInvoice; onClose: () => void }) {
  return (
    <ReportShell id="doc-validation-print-area" title="Document validation report" subtitle={`Invoice ${inv.invoice_no || ''} · ${inv.vendor_name || inv.vendor_name_raw || ''}`} onClose={onClose}>
      <div className="p-5" data-doc-validation-report>
        <DocValidationTable cmp={cmp} inv={inv} />
      </div>
    </ReportShell>
  )
}
