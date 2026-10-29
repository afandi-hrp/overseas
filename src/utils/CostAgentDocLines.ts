// Logika MURNI tabel "Per-line comparison" tab Documents & Tax (Tahap 3d, 2026-10-28, SQL 093). Server (fn_cost_agent_get_invoice_documents) mengirim per baris
// `expect: {attachment, tax}` = apakah dokumen itu DIHARAPKAN: attachment=false utk jenis biaya yang tidak wajib lampiran (mis. MATERAI, AGENCY_FEE); tax=true HANYA bila baris
// kena PPN menurut tax rule / koreksi manual. Klien hanya memakai flag itu utk memilih tampilan sel (tidak menghitung aturan): tidak ada dokumen yang diharapkan -> chip abu-abu netral "n/a".
// Hanya tipe yang diimpor, supaya bisa dites (npm test).
import type { DocCmpLineSide } from './CostAgentHelpers'

export type SideKind = 'attachment' | 'tax'
export type SideTone = 'green' | 'red' | 'amber' | 'grey'
export interface SideState { label: string; tone: SideTone; neutral: boolean; tip?: string }

export const NA_ATTACHMENT_TIP = 'Attachment not required for this cost item'
export const NA_TAX_TIP = 'Not expected on the tax invoice: no VAT in its tax rule'
// SQL 097: faktur pajak LUMPSUM (satu baris untuk seluruh biaya kena pajak) -> baris invoice yang tercakup berstatus `match_agg`; `tax.note` = `Covered by the lump-sum line "..." (amount)`.
export const LUMP_SUM_LABEL = 'Covered by tax invoice (lump sum)'

const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const MISSING = ['none', 'no_doc', 'not_in_fp']

// OK (hijau) / Diff (+selisih) (merah) / Missing (kuning) / n/a (abu-abu). Missing menjadi n/a NETRAL bila dokumen itu tidak diharapkan (expect[kind] === false).
// expect tidak ada (data lama / SQL 093 belum terpasang) -> perilaku lama: Missing.
export function sideState(side: Pick<DocCmpLineSide, 'status' | 'diff'> & { note?: string | null } | null | undefined, kind: SideKind, expect?: Partial<Record<SideKind, boolean>> | null): SideState {
  if (!side) return { label: 'n/a', tone: 'grey', neutral: true }
  const st = String(side.status || '')
  if (kind === 'tax' && st === 'match_agg') return { label: LUMP_SUM_LABEL, tone: 'green', neutral: false, tip: side.note ?? undefined } // tooltip = tax.note APA ADANYA
  if (st.startsWith('match')) return { label: 'OK', tone: 'green', neutral: false }
  if (st === 'diff') return { label: side.diff != null ? `Diff (${signed(Number(side.diff))})` : 'Diff', tone: 'red', neutral: false }
  if (MISSING.includes(st)) {
    if (expect && expect[kind] === false) return { label: 'n/a', tone: 'grey', neutral: true, tip: kind === 'attachment' ? NA_ATTACHMENT_TIP : NA_TAX_TIP }
    return { label: 'Missing', tone: 'amber', neutral: false }
  }
  return { label: 'n/a', tone: 'grey', neutral: true }
}

type SideLike = Pick<DocCmpLineSide, 'status' | 'diff'> | null
type LineLike = { attachment: SideLike; tax: SideLike; expect?: Partial<Record<SideKind, boolean>> | null }
const states = (l: LineLike): SideState[] => [sideState(l.attachment, 'attachment', l.expect), sideState(l.tax, 'tax', l.expect)]
// "Perlu dicek" = ada sel Diff (merah) atau Missing (kuning) yang BUKAN netral. Baris yang hanya netral tidak dihitung.
export const needsCheck = (l: LineLike): boolean => states(l).some(s => !s.neutral && (s.tone === 'red' || s.tone === 'amber'))
export const hasDiff = (l: LineLike): boolean => states(l).some(s => s.tone === 'red')
export const countToCheck = (lines: LineLike[]): number => lines.filter(needsCheck).length
// Filter "Show only items to check": bawaannya AKTIF selama ada baris yang perlu dicek.
export const defaultOnlyCheck = (lines: LineLike[]): boolean => countToCheck(lines) > 0
