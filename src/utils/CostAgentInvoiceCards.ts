// Daftar Agency Invoices v2 (Tahap 3a, 2026-10-28, SQL 091): kartu + stepper 4 tahap, filter & urut berlevel, My tasks, "Needs attention".
// Filter, urut, pencarian dan halaman dikerjakan DATABASE (fn_cost_agent_invoice_cards); klien TIDAK menghitung status / stepper / temuan.
// State daftar disimpan di query string URL (?q=&co=&st=&my=1&void=1&p=2&size=20&f=...&s=...) supaya tautan bisa dibagikan dan tombol Back bekerja.
import { callCostAgentRpc } from './CostAgentHelpers'

export type CardBucket = 'verify' | 'returned' | 'review' | 'approved' | 'journal' | 'paid' | 'void' | 'processing' | 'failed'
export type StageCls = 'done' | 'cur' | 'idle' | 'bad'
export interface CardStage { key: 'completed' | 'verified' | 'approved' | 'paid'; label: string; cls: StageCls; sub: string }
export interface InvoiceCard {
  id: number; invoice_no: string | null; invoice_date: string | null; company: string | null; status: string; bucket: CardBucket
  source: string | null; created_at: string | null; submitted_at: string | null; paid_at: string | null; duplicate_of: number | null
  vendor: { id: number | null; name: string | null }
  vessel: { id: number | null; name: string | null }
  port: { id: number | null; name: string | null; code: string | null }
  voyage: { id: number; no: string | null; type: 'L' | 'D' | 'LD' | 'O' | 'none' } | null
  amounts: { grand_total: number | null; lines_total: number | null; subtotal: number | null; ppn: number | null; pph: number | null; materai: number | null }
  lines: { total: number; verified: number; unmapped: number; need_check: number }
  has_fp: boolean
  approvals: { round: number; total: number; approved: number; current_label: string | null } | null
  validation: null | 'pending' | 'validated' | 'returned' | 'skipped'
  task: { kinds: ('verify' | 'validate' | 'approve')[]; acting_for?: string | null }
  stages: CardStage[]
  findings: number
  findings_red: number
  gate: { enabled: boolean; complete: boolean; blockers: number; warnings: number } | null
  current_step?: { step: number; label: string; waiting_days: number | null; reminder_after_days: number } | null
}
export interface InvoiceCardsResult {
  total: number; limit: number; offset: number; items: InvoiceCard[]
  status_counts: Partial<Record<CardBucket, number>>
  my_count: number
}

export type RuleField = 'vendor' | 'vessel' | 'port' | 'voytype' | 'fp' | 'issue' | 'from' | 'to' | 'min' | 'max'
export type SortField = 'date' | 'pay' | 'vendor' | 'vessel' | 'port' | 'status'
export interface FilterRule { f: RuleField; v: string }
export interface SortLevel { f: SortField; dir: 'asc' | 'desc' }
export interface CardParams {
  q?: string; company?: string; status?: string; my?: boolean; rules?: FilterRule[]; sorts?: SortLevel[]
  limit?: number; offset?: number; include_gate?: boolean; include_void?: boolean
}
export const costAgentInvoiceCards = (p: CardParams) => callCostAgentRpc<InvoiceCardsResult>('fn_cost_agent_invoice_cards', { p_params: p })

export interface AttentionItem { sev: 'red' | 'amber'; code: string; title: string; detail: string | null; go: 'docs' | 'lines' | 'workflow'; lines: number[] }
export const costAgentInvoiceAttention = (invoiceId: number) => callCostAgentRpc<AttentionItem[]>('fn_cost_agent_invoice_attention', { p_invoice_id: invoiceId })

// ─── Label & urutan ─────────────────────────────────────────────────────────────────────────────────────────────
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'verify', label: 'To verify' }, { value: 'returned', label: 'Returned' }, { value: 'review', label: 'In review' },
  { value: 'approved', label: 'Waiting for payment' }, { value: 'journal', label: 'Posted' }, { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' }, { value: 'processing', label: 'Processing' }, { value: 'failed', label: 'Failed' },
]
export const BUCKET_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]))
export const RULE_FIELDS: { value: RuleField; label: string; kind: 'master' | 'enum' | 'date' | 'amount' }[] = [
  { value: 'vendor', label: 'Vendor', kind: 'master' }, { value: 'vessel', label: 'Vessel', kind: 'master' }, { value: 'port', label: 'Port', kind: 'master' },
  { value: 'voytype', label: 'Voyage activity', kind: 'enum' }, { value: 'fp', label: 'Tax invoice', kind: 'enum' }, { value: 'issue', label: 'Findings', kind: 'enum' },
  { value: 'from', label: 'Invoice date from', kind: 'date' }, { value: 'to', label: 'Invoice date to', kind: 'date' },
  { value: 'min', label: 'Amount min', kind: 'amount' }, { value: 'max', label: 'Amount max', kind: 'amount' },
]
export const RULE_ENUMS: Partial<Record<RuleField, { value: string; label: string }[]>> = {
  voytype: [{ value: 'L', label: 'Loading' }, { value: 'D', label: 'Discharging' }, { value: 'LD', label: 'Loading & discharging' }, { value: 'none', label: 'No voyage' }],
  fp: [{ value: 'has', label: 'Received' }, { value: 'none', label: 'Missing' }],
  issue: [{ value: 'unmap', label: 'Item without cost item' }, { value: 'var', label: 'History difference' }, { value: 'mis', label: 'Lines differ from invoice subtotal' }],
}
export const SORT_FIELDS: { value: SortField; label: string; asc: string; desc: string }[] = [
  { value: 'date', label: 'Invoice date', asc: 'Oldest first', desc: 'Newest first' },
  { value: 'pay', label: 'Amount', asc: 'Smallest first', desc: 'Largest first' },
  { value: 'vendor', label: 'Vendor', asc: 'A → Z', desc: 'Z → A' },
  { value: 'vessel', label: 'Vessel', asc: 'A → Z', desc: 'Z → A' },
  { value: 'port', label: 'Port', asc: 'A → Z', desc: 'Z → A' },
  { value: 'status', label: 'Status', asc: 'Earliest stage first', desc: 'Latest stage first' },
]
export const DEFAULT_SORT_DIR: Record<SortField, 'asc' | 'desc'> = { date: 'desc', pay: 'desc', vendor: 'asc', vessel: 'asc', port: 'asc', status: 'asc' }

// ─── State daftar <-> query string ──────────────────────────────────────────────────────────────────────────────
export interface ListState {
  q: string; co: string; st: string; my: boolean; showVoid: boolean; page: number; size: number; rules: FilterRule[]; sorts: SortLevel[]
}
export const PAGE_SIZES = [10, 20, 50]
const RULE_KEYS = new Set<string>(RULE_FIELDS.map(r => r.value))
const SORT_KEYS = new Set<string>(SORT_FIELDS.map(s => s.value))
const STATUS_KEYS = new Set<string>(['all', ...STATUS_OPTIONS.map(o => o.value)])

export function parseListState(sp: URLSearchParams): ListState {
  const size = Number(sp.get('size'))
  const page = Number(sp.get('p'))
  const rules: FilterRule[] = []
  const sorts: SortLevel[] = []
  const seenR = new Set<string>(); const seenS = new Set<string>()
  for (const part of (sp.get('f') || '').split(',')) {
    const i = part.indexOf(':')
    if (i < 1) continue
    const f = part.slice(0, i); let v = ''
    try { v = decodeURIComponent(part.slice(i + 1)) } catch { continue }
    if (RULE_KEYS.has(f) && v && !seenR.has(f)) { seenR.add(f); rules.push({ f: f as RuleField, v }) }
  }
  for (const part of (sp.get('s') || '').split(',')) {
    const [f, dir] = part.split(':')
    if (SORT_KEYS.has(f) && !seenS.has(f)) { seenS.add(f); sorts.push({ f: f as SortField, dir: dir === 'asc' ? 'asc' : 'desc' }) }
  }
  const st = sp.get('st') || 'all'
  return {
    q: sp.get('q') || '', co: (sp.get('co') || '').toUpperCase(), st: STATUS_KEYS.has(st) ? st : 'all', my: sp.get('my') === '1', showVoid: sp.get('void') === '1',
    page: Number.isInteger(page) && page > 0 ? page : 1, size: PAGE_SIZES.includes(size) ? size : 20, rules, sorts,
  }
}

// Menulis state ke salinan `base` (parameter lain, mis. upload/call, TIDAK disentuh); nilai bawaan dihilangkan dari URL.
export function writeListState(base: URLSearchParams, s: ListState): URLSearchParams {
  const n = new URLSearchParams(base)
  const set = (k: string, v: string | null) => { if (v) n.set(k, v); else n.delete(k) }
  set('q', s.q.trim() || null); set('co', s.co || null); set('st', s.st !== 'all' ? s.st : null); set('my', s.my ? '1' : null); set('void', s.showVoid ? '1' : null)
  set('p', s.page > 1 ? String(s.page) : null); set('size', s.size !== 20 ? String(s.size) : null)
  set('f', s.rules.length ? s.rules.map(r => `${r.f}:${encodeURIComponent(r.v)}`).join(',') : null)
  set('s', s.sorts.length ? s.sorts.map(x => `${x.f}:${x.dir}`).join(',') : null)
  return n
}

// Parameter RPC dari state. Aturan / urutan kosong tidak dikirim; nilai nominal dikirim angka murni.
export function toCardParams(s: ListState): CardParams {
  const rules = s.rules.map(r => ({ f: r.f, v: r.f === 'min' || r.f === 'max' ? r.v.replace(/[^0-9]/g, '') : r.v })).filter(r => r.v !== '')
  return {
    q: s.q.trim() || undefined, company: s.co || undefined, status: s.st, my: s.my || undefined, rules: rules.length ? rules : undefined,
    sorts: s.sorts.length ? s.sorts : undefined, limit: s.size, offset: (s.page - 1) * s.size, include_gate: true, include_void: s.showVoid || undefined,
  }
}
