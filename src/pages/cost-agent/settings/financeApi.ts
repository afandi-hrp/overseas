// Finance mapping (master Cost Agent -> master Ascend) + aturan pajak (sql/084, 2026-10-28). Urutan kerja: Supabase dulu (fn_cost_agent_finance_list_map)
// -> Ascend (ascendApi.ts, read-only) -> fn_cost_agent_finance_pick memilih kandidat -> fn_cost_agent_finance_save_map menyimpan hasilnya.
// Hanya satu kandidat yang yakin yang disimpan otomatis ('auto'); pilihan user ('user') terkunci dan tidak ditimpa pencarian otomatis.
import { hubRpc } from './hubApi'
import { candidatesForMaster, saveData, type AscendCandidate, type AscendKind } from './ascendApi'

export type FinKind = AscendKind
export type FinSource = 'auto' | 'user'

interface FinRowBase {
  map_id: number | null; source: FinSource | null; is_locked: boolean | null; synced_at: string | null; mapped: boolean
}
export interface FinSupplierRow extends FinRowBase {
  vendor_id: number; company_code: string; vendor_name: string; vendor_npwp: string | null; ascend_db: string | null
  ascend_supplier_id: number | null; supplier_code: string | null; supplier_name: string | null
}
export interface FinVesselRow extends FinRowBase {
  vessel_id: number; company_code: string; vessel_name_master: string; ascend_db: string | null
  ascend_vessel_id: number | null; vessel_code: string | null; vessel_name: string | null
}
export interface FinExpenseRow extends FinRowBase {
  cost_item_id: number; code: string; name: string; category: string | null; finance_alias: string | null
  company_code: string; ascend_db: string | null; mapped_in: string[] | null; ascend_expense_type_id: number | null; expense_type_desc: string | null; account_name: string | null
}
export interface FinRows { supplier: FinSupplierRow; vessel: FinVesselRow; expense: FinExpenseRow }
export interface FinList<K extends FinKind> { total: number; rows: FinRows[K][] }

export const FIN_PAGE_SIZE = 100

export const finListMap = <K extends FinKind>(kind: K, p: { company?: string | null; q?: string; status?: 'all' | 'mapped' | 'missing'; limit?: number; offset?: number }) =>
  hubRpc<FinList<K>>('fn_cost_agent_finance_list_map', {
    p_kind: kind, p_company: p.company || null, p_q: p.q?.trim() || null, p_status: p.status || 'all', p_limit: p.limit ?? FIN_PAGE_SIZE, p_offset: p.offset ?? 0,
  })

export interface FinPick { decision: 'auto' | 'ambiguous' | 'none'; match: AscendCandidate | null; matches: AscendCandidate[] }
export const finPick = (kind: FinKind, refId: number, candidates: AscendCandidate[]) =>
  hubRpc<FinPick>('fn_cost_agent_finance_pick', { p_kind: kind, p_ref_id: refId, p_candidates: candidates })

export interface FinSaveResult { saved: boolean; reason?: 'locked'; map?: Record<string, unknown>; current?: Record<string, unknown> }
export const finSaveMap = (kind: FinKind, refId: number, company: string, c: AscendCandidate, source: FinSource) =>
  hubRpc<FinSaveResult>('fn_cost_agent_finance_save_map', { p_kind: kind, p_ref_id: refId, p_company: company, p_data: saveData(kind, c), p_source: source })

// Indeks pemetaan yang sudah ada (semua PT) utk kolom "Ascend" di tab Vessels / Vendors: id master -> daftar pemetaan (satu per PT).
export interface AscendMapInfo { company: string; code: string | null; name: string | null; source: FinSource | null }
export async function finMappedIndex(kind: 'vessel' | 'supplier'): Promise<Map<number, AscendMapInfo[]>> {
  const idx = new Map<number, AscendMapInfo[]>()
  let seen = 0
  for (let off = 0; off < 10000; off += 500) {
    const r = await finListMap(kind, { company: null, status: 'mapped', limit: 500, offset: off })
    for (const row of r.rows as (FinVesselRow | FinSupplierRow)[]) {
      if (!row.mapped) continue
      const v = row as FinVesselRow & FinSupplierRow
      const id = kind === 'vessel' ? v.vessel_id : v.vendor_id
      const info: AscendMapInfo = kind === 'vessel'
        ? { company: v.company_code, code: v.vessel_code, name: v.vessel_name, source: v.source }
        : { company: v.company_code, code: v.supplier_code, name: v.supplier_name, source: v.source }
      const list = idx.get(id)
      if (list) list.push(info); else idx.set(id, [info])
    }
    seen += r.rows.length
    if (seen >= r.total || r.rows.length === 0) break
  }
  return idx
}

export const finDeleteMap = (kind: FinKind, id: number) => hubRpc<{ deleted: boolean }>('fn_cost_agent_finance_delete_map', { p_kind: kind, p_id: id })
export const finSetAlias = (costItemId: number, alias: string) =>
  hubRpc<{ cost_item_id: number; finance_alias: string | null }>('fn_cost_agent_set_finance_alias', { p_cost_item_id: costItemId, p_alias: alias })

// ─── Kesiapan invoice (kartu di detail invoice) ─────────────────────────────────────────────────────────────────
export type FinStatus = 'mapped' | 'missing' | 'no_vendor' | 'no_vessel'
export interface FinCheck {
  invoice_id: number; company_code: string | null; ascend_db: string | null
  supplier: { status: FinStatus; vendor_id?: number; supplier_code?: string | null; supplier_name?: string | null; source?: FinSource; is_locked?: boolean }
  vessel: { status: FinStatus; vessel_id?: number; vessel_code?: string | null; vessel_name?: string | null; source?: FinSource; is_locked?: boolean }
  items: { cost_item_id: number; code: string; name: string; lines: number; amount: number | null; status: 'mapped' | 'missing'; expense_type_desc: string | null; account_name: string | null }[]
  lines_without_cost_item: number
  lines_tax_not_set: number
  missing: string[]
  ready: boolean
}
export const finCheck = (invoiceId: number) => hubRpc<FinCheck>('fn_cost_agent_finance_check', { p_invoice_id: invoiceId })

// ─── Aturan pajak ───────────────────────────────────────────────────────────────────────────────────────────────
export interface TaxRule {
  id: number; cost_item_id: number | null; vendor_id: number | null; company_code: string | null
  ppn_applicable: boolean | null; ppn_rate: number | null; pph_type: string | null; pph_rate: number | null
  effective_from: string; is_active: boolean; note: string | null
  cost_item_name: string | null; vendor_name: string | null
  port_id?: number | null; port_name?: string | null // sql/111: null = semua pelabuhan
}
export const taxListRules = () => hubRpc<TaxRule[]>('fn_cost_agent_list_tax_rules', { p_vendor_id: null, p_cost_item_id: null })
// Tarif dikirim sebagai PECAHAN (11% = 0.11); tampilan memakai persen.
export const taxSaveRule = (id: number | null, data: Record<string, unknown>) => hubRpc<TaxRule>('fn_cost_agent_save_tax_rule', { p_id: id, p_data: data })
export const taxDeleteRule = (id: number) => hubRpc<{ deleted: boolean }>('fn_cost_agent_delete_tax_rule', { p_id: id })
// 0.11 <-> "11" (hindari 0.07*100 = 7.000000000000001).
export const fracToPct = (f: number | null | undefined): string => (f === null || f === undefined ? '' : String(Math.round(Number(f) * 10000) / 100))
export const pctToFrac = (p: string): number | null => {
  const t = p.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 10000 : NaN
}

// ─── Auto-map ───────────────────────────────────────────────────────────────────────────────────────────────────
// Satu item yang akan dipetakan otomatis. `database` = nama database Ascend baris itu (dari server, BUKAN dihitung di frontend).
export interface AutoItem { kind: FinKind; refId: number; company: string; database: string; name: string; npwp?: string | null; alias?: string | null }
export interface AutoSummary { total: number; mapped: number; needChoice: number; locked: number; failed: number; stopped: boolean; firstError: string | null }

export const AUTO_CONCURRENCY = 3 // jangan membanjiri Ascend

// Cari ke Ascend -> pick -> simpan bila 'auto'. Hasil: 'mapped' | 'choice' (ambiguous / none) | 'locked'.
export async function autoMapOne(it: AutoItem): Promise<'mapped' | 'choice' | 'locked'> {
  const cands = await candidatesForMaster(it.kind, it.database, { name: it.name, npwp: it.npwp, alias: it.alias })
  if (cands.length === 0) return 'choice'
  const pick = await finPick(it.kind, it.refId, cands)
  if (pick.decision !== 'auto' || !pick.match) return 'choice'
  const r = await finSaveMap(it.kind, it.refId, it.company, pick.match, 'auto')
  return r.saved ? 'mapped' : r.reason === 'locked' ? 'locked' : 'choice'
}

export async function autoMapAll(items: AutoItem[], onProgress: (done: number, total: number) => void, isStopped: () => boolean): Promise<AutoSummary> {
  const sum: AutoSummary = { total: items.length, mapped: 0, needChoice: 0, locked: 0, failed: 0, stopped: false, firstError: null }
  let next = 0
  let done = 0
  const worker = async () => {
    while (!isStopped()) {
      const i = next++
      if (i >= items.length) return
      try {
        const r = await autoMapOne(items[i])
        if (r === 'mapped') sum.mapped++
        else if (r === 'locked') sum.locked++
        else sum.needChoice++
      } catch (e: any) {
        sum.failed++
        if (!sum.firstError) sum.firstError = e?.message || String(e)
      }
      onProgress(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(AUTO_CONCURRENCY, items.length) }, worker))
  sum.stopped = isStopped() && done < items.length
  return sum
}

// ─── Pratinjau AP Note (sql/085) -- format "Format Paste APNote", hanya baca ─────────────────────────────────────
export interface ApNoteIssue { level: 'error' | 'warning'; code: string; message: string; line_no?: number }
export interface ApNoteHeader {
  invoice_id: number; ascend_db: string | null; company_code: string | null; invoice_status: string
  supplier_code: string | null; supplier_name: string | null; vessel_name: string | null; office: string | null
  reference: string | null; fp_no: string | null; note_type: string | null; remarks: string | null
}
// Satu baris = 17 kolom (kunci = nama kolom) + field internal berawalan "_" (TIDAK ikut ke Excel).
export type ApNoteRow = Record<string, string | number | null>
export interface ApNotePreview {
  header: ApNoteHeader
  columns: string[]
  rows: ApNoteRow[]
  totals: { subtotal: number; ppn: number; pph: number; total_with_ppn: number; total_after_pph: number; invoice_grand_total: number | null }
  issues: ApNoteIssue[]
  errors: number
  warnings: number
  can_send: boolean
}
export const finApnotePreview = (invoiceId: number) => hubRpc<ApNotePreview>('fn_cost_agent_apnote_preview', { p_invoice_id: invoiceId })
