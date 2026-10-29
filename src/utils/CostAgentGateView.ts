// Tampilan gerbang dokumen (Tahap 3c, 2026-10-28, SQL 092): pill status HANYA dari `blockers`, dan pengelompokan `warnings` jadi "Notes" tab Documents & Tax.
// Murni (hanya tipe yang diimpor) supaya bisa dites (npm test). Server yang memutuskan blocker vs warning (setting gate_block_codes); di sini TIDAK ada aturan bisnis,
// hanya merangkum teks `label` / `detail` yang sudah dikirim server -- tidak mengarang kesimpulan baru.
import type { DocGate, GateItem } from './CostAgentGate'

export interface GatePill { tone: 'green' | 'red'; text: string; blockers: number }
// Hijau "Ready to submit" bila tidak ada blocker; merah "Fix N item(s) before submit". `warnings` TIDAK ikut menentukan. Gerbang mati / belum dimuat -> null.
export function gatePill(gate: Pick<DocGate, 'enabled' | 'blockers'> | null | undefined): GatePill | null {
  if (!gate || !gate.enabled) return null
  const n = (gate.blockers ?? []).length
  return n === 0 ? { tone: 'green', text: 'Ready to submit', blockers: 0 } : { tone: 'red', text: `Fix ${n} item(s) before submit`, blockers: n }
}

export interface NoteRow {
  key: string
  title: string
  lines: number[]        // nomor baris untuk tautan "Go to line"
  items: GateItem[]      // temuan asli (bisa dibuka satu per satu)
  detail?: string | null // teks detail server bila baris hanya mewakili satu temuan
  action?: 'set_period'  // tombol bantu (period_missing)
}
export interface NoteGroup { key: 'tax' | 'dates' | 'other'; title: string; hint?: string; rows: NoteRow[] }

export const TAX_NOTE_HINT = 'Notes do not block submit. Set a tax rule for a cost item to control which lines are expected on the tax invoice.'
const codeOf = (i: GateItem): string => String(i.code ?? '').toLowerCase()
const DATE_CODES = ['date_out_of_period', 'date_warn', 'invoice_date_diff', 'period_missing']
const isTax = (c: string) => c === 'fp_missing' || c === 'line_not_in_fp' || c === 'tax_line_diff' || c === 'tax_total_diff' || c === 'tax_rate_diff'
const isDates = (c: string) => DATE_CODES.includes(c) || c.startsWith('voyage_')

const uniqLines = (items: GateItem[]): number[] => Array.from(new Set(items.map(i => i.line_no).filter((n): n is number => typeof n === 'number'))).sort((a, b) => a - b)
const single = (i: GateItem, idx: number): NoteRow => ({
  key: `${codeOf(i)}-${idx}`, title: i.label, items: [i], detail: i.detail ?? null,
  lines: typeof i.line_no === 'number' ? [i.line_no] : [], action: codeOf(i) === 'period_missing' ? 'set_period' : undefined,
})

// Angka selisih dari teks detail server ("... (difference -16500)") dipakai apa adanya, hanya diberi pemisah ribuan & tanda minus; tidak ketemu -> dilewati.
const signedAmount = (raw: string): string => {
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n)) return raw
  const s = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n < 0 ? `−${s}` : n > 0 ? `+${s}` : s
}
export function taxTotalsTitle(items: GateItem[]): string {
  const parts = items.map(i => {
    const name = String(i.label ?? '').replace(/^\s*Tax totals differ:\s*/i, '').trim()
    const m = /difference\s+(-?[\d.,]+)/i.exec(String(i.detail ?? ''))
    return [name, m ? signedAmount(m[1]) : ''].filter(Boolean).join(' ')
  }).filter(Boolean)
  return parts.length ? `Tax totals differ: ${parts.join(' · ')}` : 'Tax totals differ'
}

// Kelompok Notes (urutan: Tax invoice, Dates & voyage, Other). Banyak `line_not_in_fp` -> SATU baris; `tax_total_diff` -> SATU baris; sisanya satu baris per temuan.
export function groupNotes(warnings: GateItem[] | null | undefined): NoteGroup[] {
  const list = warnings ?? []
  const taxItems = list.filter(i => isTax(codeOf(i)))
  const dateItems = list.filter(i => isDates(codeOf(i)))
  const otherItems = list.filter(i => !isTax(codeOf(i)) && !isDates(codeOf(i)))

  const tax: NoteRow[] = []
  taxItems.filter(i => codeOf(i) === 'fp_missing').forEach((i, ix) => tax.push(single(i, ix)))
  const notOnFp = taxItems.filter(i => codeOf(i) === 'line_not_in_fp')
  if (notOnFp.length > 0) {
    const n = notOnFp.length
    tax.push({ key: 'line_not_in_fp', title: n === 1 ? '1 line is not on the tax invoice' : `${n} lines are not on the tax invoice`, items: notOnFp, lines: uniqLines(notOnFp) })
  }
  const totals = taxItems.filter(i => codeOf(i) === 'tax_total_diff')
  if (totals.length > 0) tax.push({ key: 'tax_total_diff', title: taxTotalsTitle(totals), items: totals, lines: [] })
  taxItems.filter(i => codeOf(i) === 'tax_line_diff').forEach((i, ix) => tax.push(single(i, ix)))
  taxItems.filter(i => codeOf(i) === 'tax_rate_diff').forEach((i, ix) => tax.push(single(i, ix)))

  const groups: NoteGroup[] = [
    { key: 'tax', title: 'Tax invoice', hint: TAX_NOTE_HINT, rows: tax },
    { key: 'dates', title: 'Dates & voyage', rows: dateItems.map(single) },
    { key: 'other', title: 'Other', rows: otherItems.map(single) },
  ]
  return groups.filter(g => g.rows.length > 0)
}
export const noteRowCount = (groups: NoteGroup[]): number => groups.reduce((a, g) => a + g.rows.length, 0)
// Teks polos satu baris (tes & tooltip): judul + nomor baris bila ada.
export const noteRowText = (r: NoteRow): string =>
  r.key === 'line_not_in_fp' && r.lines.length > 0 ? `${r.title} (${r.lines.length === 1 ? 'line' : 'lines'} ${r.lines.join(', ')})` : r.title

// Must fix: tampil 5 dulu, sisanya lewat "Show all N".
export const MUST_FIX_LIMIT = 5
export const visibleBlockers = <T,>(items: T[], showAll: boolean, limit = MUST_FIX_LIMIT): T[] => (showAll ? items : items.slice(0, limit))

// ─── Alasan tombol "Submit for approval" nonaktif (Tahap 3d, 2026-10-28): SATU alasan, yang pertama berlaku. Hanya merangkum syarat yang SUDAH ada
// (hasil workflow / gerbang / rute dari server); tidak ada aturan baru. Urutan: pemisahan tugas (server) -> PT -> jenis biaya -> verifikasi -> gerbang dokumen -> rute approval.
export interface SubmitBlockInputs {
  blockedReason?: string | null // me.blocked_reason (SoD / peran) dari fn_cost_agent_get_workflow
  companyMissing?: boolean
  unmapped?: number
  unverified?: number
  gateFirst?: string | null // label blocker gerbang pertama (bila ada blocker)
  routeBlock?: string | null // alasan "tidak ada aturan approval yang cocok" dari fn_cost_agent_approval_preview
}
export function submitBlockReason(i: SubmitBlockInputs): string | null {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (i.blockedReason) return i.blockedReason
  if (i.companyMissing) return 'Choose the company first'
  if ((i.unmapped ?? 0) > 0) return (i.unmapped as number) === 1 ? '1 line has no cost item' : `${i.unmapped} lines have no cost item`
  if ((i.unverified ?? 0) > 0) return `Verify ${plural(i.unverified as number, 'line')} first`
  if (i.gateFirst) return `Fix first: ${i.gateFirst}`
  if (i.routeBlock) return i.routeBlock
  return null
}
