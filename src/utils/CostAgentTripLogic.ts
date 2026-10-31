// Logika MURNI kartu "Trip dates & vessel" (SQL 112, 2026-10-31; dirapikan di 112b): tanggal tiba / berangkat + nama kapal dibandingkan antara voyage report, invoice dan tiap dokumen lampiran.
// Server (fn_cost_agent_trip_checks, kunci `trip_checks` pada fn_cost_agent_get_invoice_documents) yang memutuskan status, acuan dan selisih hari; di sini HANYA teks / warna / susunan baris.
// Halaman sumber disusun dari ANGKA (page / page_from / page_to), BUKAN dari `location`; tidak ada tautan ke dokumen. Hanya tipe yang diimpor, supaya bisa dites (npm test).
import type { DocCmpTripChecks, TripField, TripSource } from './CostAgentHelpers'

export type TripTone = 'green' | 'red' | 'amber' | 'blue' | 'grey' | 'plum'
export interface TripChip { label: string; tone: TripTone; faint?: boolean }

// Chip status per sumber (dipakai utk tooltip / label ikon). missing = abu muda; not_linked (voyage report belum ditautkan) = abu.
export const TRIP_SOURCE_CHIP: Record<string, TripChip> = {
  ref: { label: 'Reference', tone: 'blue' },
  ok: { label: 'Match', tone: 'green' },
  diff: { label: 'Different', tone: 'red' },
  na: { label: 'Not comparable', tone: 'grey' },
  missing: { label: 'Not found', tone: 'grey', faint: true },
  not_linked: { label: 'Not linked', tone: 'grey', faint: true },
}
export const tripSourceChip = (status: string | null | undefined): TripChip => TRIP_SOURCE_CHIP[String(status ?? '')] ?? { label: String(status || '—'), tone: 'grey' }

// Chip status bidang (kepala kartu): "All match" hijau, "N different" merah, "Dates spread N days" amber, "Single source" abu, "Not found" abu muda.
export function tripFieldChip(f: Pick<TripField, 'status' | 'spread_days'> & { sources?: Pick<TripSource, 'status'>[] }): TripChip {
  switch (f.status) {
    case 'diff': { const n = (f.sources ?? []).filter(s => s.status === 'diff').length; return { label: n > 0 ? `${n} different` : 'Different', tone: 'red' } }
    case 'warn': return { label: `Dates spread ${f.spread_days ?? '?'} day${f.spread_days === 1 ? '' : 's'}`, tone: 'amber' }
    case 'missing': return { label: 'Not found', tone: 'grey', faint: true }
    case 'single': return { label: 'Single source', tone: 'grey' }
    case 'ok': return { label: 'All match', tone: 'green' }
    default: return { label: String(f.status || '—'), tone: 'grey' }
  }
}

// Urutan kartu: Vessel | Arrival | Departure (bidang lain, bila ada, menyusul sesuai urutan server).
const FIELD_ORDER = ['vessel', 'arrival', 'departure']
export const orderTripFields = (fields: TripField[]): TripField[] => {
  const rank = (k: string) => { const i = FIELD_ORDER.indexOf(k); return i < 0 ? FIELD_ORDER.length : i }
  return fields.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f.key) - rank(b.f.key) || a.i - b.i).map(x => x.f)
}
// Label kapital kecil di kepala kartu (label dari server tetap dipakai utk bidang lain).
export const TRIP_FIELD_LABEL: Record<string, string> = { vessel: 'Vessel name', arrival: 'Arrival (TA)', departure: 'Departure (TD)' }
export const tripFieldLabel = (f: Pick<TripField, 'key' | 'label'>): string => TRIP_FIELD_LABEL[f.key] ?? f.label

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
// Pil ringkasan di atas kartu: "n differences" (merah), "n warnings" (amber), "n not found" (abu) -- hanya yang > 0. Semua nol -> [] (UI: pil hijau "All sources agree").
export interface TripPill { text: string; tone: TripTone }
export function tripSummaryPills(s: DocCmpTripChecks['summary'] | null | undefined): TripPill[] {
  if (!s) return []
  const out: TripPill[] = []
  if (s.diff > 0) out.push({ text: plural(s.diff, 'difference', 'differences'), tone: 'red' })
  if (s.warn > 0) out.push({ text: plural(s.warn, 'warning', 'warnings'), tone: 'amber' })
  if (s.missing > 0) out.push({ text: `${s.missing} not found`, tone: 'grey' })
  return out
}
export const tripNeedsAttention = (t: DocCmpTripChecks | null | undefined): boolean => !!t && (t.summary.diff > 0 || t.summary.warn > 0)
export const TRIP_AGREE_TEXT = 'All sources agree'
export const tripToleranceText = (days: number): string => `Tolerance ±${days} day${days === 1 ? '' : 's'}`

// Selisih hari terhadap acuan: "+1 d" / "−2 d" (tanda minus sebenarnya); 0 / null -> tidak ditampilkan (null). Merah bila di luar toleransi, abu bila di dalam.
export const gapText = (n: number | null | undefined): string | null => (n === null || n === undefined || !Number.isFinite(Number(n)) || Number(n) === 0 ? null : `${Number(n) > 0 ? '+' : '−'}${Math.abs(Number(n))} d`)
export const gapOutOfTolerance = (n: number | null | undefined, tolerance: number): boolean => n !== null && n !== undefined && Number.isFinite(Number(n)) && Math.abs(Number(n)) > tolerance

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Tanggal "YYYY-MM-DD" -> "DD Mon YYYY"; kosong -> "—". Nama kapal & nilai lain apa adanya.
export function tripValueText(fieldKey: string, value: string | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === '') return '—'
  if (fieldKey === 'vessel') return String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : String(value)
}

// Nilai acuan besar + keterangan kecil di bawahnya.
export const tripReferenceValue = (f: Pick<TripField, 'key' | 'reference'>): string => tripValueText(f.key, f.reference?.value)
export const tripReferenceCaption = (f: Pick<TripField, 'reference'>): string => (f.reference && f.reference.value ? `Reference: ${f.reference.label ?? 'source'}` : 'No reference available')
export const TRIP_NOT_LINKED_NOTE = 'No voyage report is linked, so the first available source is the reference.'

// Nama sumber: label + nomor dokumen (bila ada).
export const tripSourceName = (s: Pick<TripSource, 'label' | 'doc_no'>): { name: string; sub: string | null } => ({ name: s.label || '—', sub: s.doc_no ? String(s.doc_no) : null })

// ─── Halaman sumber ──────────────────────────────────────────────────────────────────────────────────────────
export const TRIP_PAGE_APPROX_TIP = 'Page taken from the document\'s page range. Run "Analyse again" to get the exact page.'
// Nomor file singkat (F1, F2, ...) HANYA bila kartu memuat > 1 nama file; urutan = kemunculan pertama (bidang menurut urutan kartu, sumber menurut urutan data).
export function tripFileOrder(fields: Pick<TripField, 'sources'>[]): Map<string, number> {
  const seen = new Map<string, number>()
  fields.forEach(f => (f.sources ?? []).forEach(s => {
    const n = String(s.file_name ?? '').trim()
    if (n && !seen.has(n)) seen.set(n, seen.size + 1)
  }))
  return seen
}
export interface TripPage { text: string; tip: string; exact: boolean }
// "p. 5" (halaman persis), "p. 3" (rentang 1 halaman), "pp. 4–5" (rentang, en dash); semua kosong -> null (tidak menampilkan apa pun). Prefiks "F2 · " bila fileOrder memuat > 1 file.
export function tripPage(s: Pick<TripSource, 'page' | 'page_exact' | 'page_from' | 'page_to' | 'file_name'>, fileOrder?: Map<string, number> | null): TripPage | null {
  let label: string, word: string, exact: boolean
  if (typeof s.page === 'number' && s.page > 0) { label = `p. ${s.page}`; word = `page ${s.page}`; exact = true }
  else if (typeof s.page_from === 'number' && s.page_from > 0) {
    const to = typeof s.page_to === 'number' && s.page_to > 0 ? s.page_to : s.page_from
    exact = false
    if (to === s.page_from) { label = `p. ${s.page_from}`; word = `page ${s.page_from}` } else { label = `pp. ${s.page_from}–${to}`; word = `pages ${s.page_from}–${to}` }
  } else return null
  const file = String(s.file_name ?? '').trim()
  const idx = file && fileOrder && fileOrder.size > 1 ? fileOrder.get(file) : undefined
  const tip = [file ? `${file} — ${word}` : word.charAt(0).toUpperCase() + word.slice(1), exact ? `Read from ${word}` : TRIP_PAGE_APPROX_TIP].join('\n')
  return { text: idx ? `F${idx} · ${label}` : label, tip, exact }
}

// ─── Baris sumber ────────────────────────────────────────────────────────────────────────────────────────────
// URUTAN BARIS SAMA di ketiga kartu (permintaan user 2026-10-31): Voyage report dulu, lalu Invoice, lalu dokumen menurut urutan kemunculan pertama di kartu mana pun
// (kartu berurutan Vessel | Arrival | Departure). Baris acuan TIDAK dipindah ke atas -- ditandai tag "Ref" di tempatnya.
export const TRIP_ROW_LIMIT = 6 // lebih dari ini -> 5 teratas + "Show N more"
export const TRIP_ROW_COLLAPSED = 5
const KIND_RANK: Record<string, number> = { voyage: 0, invoice: 1 }
// Urutan tetap: Voyage report (0), Invoice (1), Invoice document / dokumen berjenis invoice (2), lalu dokumen lain (3).
const rankOf = (s: Pick<TripSource, 'kind' | 'label' | 'doc_type'>): number => KIND_RANK[s.kind] ?? (s.doc_type === 'invoice' || /^invoice document/i.test(s.label ?? '') ? 2 : 3)
const srcKey = (s: Pick<TripSource, 'kind' | 'label' | 'doc_no'>): string => [s.kind, s.label, s.doc_no ?? ''].join('|')
export function tripRowOrder(fields: Pick<TripField, 'sources'>[]): Map<string, number> {
  const seen = new Map<string, number>()
  fields.forEach(f => (f.sources ?? []).forEach(s => { const k = srcKey(s); if (!seen.has(k)) seen.set(k, seen.size) }))
  return seen
}
export function tripRows(f: Pick<TripField, 'sources'>, order?: Map<string, number> | null): TripSource[] {
  return (f.sources ?? []).map((s, i) => ({ s, i }))
    .sort((x, y) => rankOf(x.s) - rankOf(y.s) || (order?.get(srcKey(x.s)) ?? 1e6) - (order?.get(srcKey(y.s)) ?? 1e6) || x.i - y.i)
    .map(x => x.s)
}
export const isTripNotFound = (s: Pick<TripSource, 'status'>): boolean => s.status === 'missing' || s.status === 'not_linked'
// Teks pengganti nilai bagi sumber yang tidak ditemukan ("Not found" / "Not linked"); sumber lain -> null.
export const tripNotFoundLabel = (s: Pick<TripSource, 'status'>): string | null => (isTripNotFound(s) ? (s.status === 'not_linked' ? 'Not linked' : 'Not found') : null)
// Bawaan HANYA baris bermasalah: tidak ditemukan (missing / not_linked) dan tidak cocok (diff; pada bidang 'warn' juga sumber yang bergeser dari acuan). Yang cocok disembunyikan
// dan hanya dihitung; 'Show all sources' menampilkan semuanya.
export const isTripIssue = (f: Pick<TripField, 'status'>, s: Pick<TripSource, 'status' | 'gap_days'>): boolean =>
  s.status === 'diff' || isTripNotFound(s) || (f.status === 'warn' && s.status !== 'ref' && s.gap_days !== null && s.gap_days !== undefined && Number(s.gap_days) !== 0)
export function tripVisible(f: Pick<TripField, 'status' | 'sources'>, order: Map<string, number> | null | undefined, showAll: boolean): { shown: TripSource[]; hidden: number } {
  const rows = tripRows(f, order)
  if (showAll) return { shown: rows, hidden: 0 }
  const shown = rows.filter(s => isTripIssue(f, s))
  return { shown, hidden: rows.length - shown.length }
}
export const tripHasHidden = (fields: Pick<TripField, 'status' | 'sources'>[], order?: Map<string, number> | null): boolean => fields.some(f => tripVisible(f, order, false).hidden > 0)

// Berapa baris tampil: semua bila <= 6 atau dibuka, selain itu 5 teratas.
export const tripVisibleCount = (total: number, expanded: boolean): number => (expanded || total <= TRIP_ROW_LIMIT ? total : TRIP_ROW_COLLAPSED)

// Ikon status baris (menggantikan kata "Match"): centang hijau = ok / ref, ! merah = diff, setengah amber = bergeser (bidang warn), titik abu = tidak bisa dibandingkan.
export type TripIconKind = 'ok' | 'diff' | 'warn' | 'na'
export function tripRowIcon(s: Pick<TripSource, 'status' | 'gap_days'>, fieldStatus: string): { kind: TripIconKind; label: string } {
  if (s.status === 'diff') return { kind: 'diff', label: 'Different' }
  if (s.status === 'ref') return { kind: 'ok', label: 'Reference' }
  if (s.status === 'ok') {
    const moved = fieldStatus === 'warn' && s.gap_days !== null && s.gap_days !== undefined && Number(s.gap_days) !== 0
    return moved ? { kind: 'warn', label: 'Date shifted' } : { kind: 'ok', label: 'Match' }
  }
  if (isTripNotFound(s)) return { kind: 'na', label: tripNotFoundLabel(s) as string }
  return { kind: 'na', label: 'Not comparable' }
}
