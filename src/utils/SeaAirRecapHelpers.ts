// Invoice Recap Sea & Air -- tampilan kartu/Open (2026-10-01, spek "BeeHive AI · Invoice Recap" V167).
// SATU-SATUNYA sumber: kelompok biaya & landed cost (MURNI hitungan tampilan), daftar "issues"
// (needs attention), status kartu, ringkasan KPI & daftar id "needs attention" (query BACA saja),
// pemetaan section Doc/Cost Validation ke label tampilan, dan log.
// Keputusan user 2026-10-01:
// - Landed cost = HANYA biaya invoice (TANPA duty & tax). Duty & tax ditampilkan terpisah.
// - Kelompok "PPJK & trucking" = EMKL (trucking tidak punya kolom sendiri di Invoice Recap).
// - Supplier = kolom `vendor` (supplier BARANG; vendor jasa ada di kolom *_vendor per segmen).
// - Needs attention = persentase rendah & BELUM dikonfirmasi user (lihat computeRecapIssues).

import { supabase } from '../lib/supabase'
import { relaxSeaAirDocChecks } from './SeaAirValidasiHelpers'

// Sengaja TIDAK di-import dari SeaAirAuditHelpers (file itu meng-import helper ini -> hindari import melingkar).
const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

// ─── Kunci Submit to Finance (sql/031) ───────────────────────────────────────
// Setelah Submit to Finance baris Recap terkunci (trigger DB menolak edit/hapus) sampai Admin unlock.
export const isRecapLocked = (rec: any) => rec?.tgl_submit_finance !== null && rec?.tgl_submit_finance !== undefined && rec?.tgl_submit_finance !== ''

// ─── Data manual per PO (rekapan_seaair.po_manual, sql/031) ─────────────────
// { "<po_no>": { kg, valas, currency, partial, partial_no } } -- diisi user lewat Edit shipment,
// TIDAK disentuh AI (n8n). Kunci = nomor PO apa adanya (trim).
export type PoManualEntry = { kg?: number | null; valas?: number | null; currency?: string | null; partial?: boolean; partial_no?: number | null }
export const hasPoManualColumn = (rec: any) => !!rec && Object.prototype.hasOwnProperty.call(rec, 'po_manual')
export function parsePoManual(rec: any): Record<string, PoManualEntry> {
  const raw = rec?.po_manual
  let obj: any = raw
  if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch { obj = null } }
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
}
export const poKey = (po: any) => String(po ?? '').trim().toUpperCase()
export function poManualFor(map: Record<string, PoManualEntry>, po: any): PoManualEntry | null {
  const k = poKey(po)
  if (!k) return null
  const hit = Object.keys(map).find(x => poKey(x) === k)
  return hit ? map[hit] : null
}

// ─── po_detail (PO + vessel per PO) ──────────────────────────────────────────
// Parsing SAMA dgn SeaAirRekapanRowGroup / ExportModal (kosong -> 0 PO di tampilan baru).
export function parsePoDetail(rec: any): { po_no: string; vessel: string }[] {
  let arr: any[] = []
  try {
    if (Array.isArray(rec?.po_detail)) arr = rec.po_detail
    else if (typeof rec?.po_detail === 'string' && rec.po_detail.trim()) {
      const parsed = JSON.parse(rec.po_detail)
      if (Array.isArray(parsed)) arr = parsed
    }
  } catch { arr = [] }
  return arr
    .map((p: any) => ({ po_no: String(p?.po_no ?? '').trim(), vessel: String(p?.vessel ?? '').trim() }))
    .filter(p => p.po_no || p.vessel)
}

// ─── Kelompok biaya ───────────────────────────────────────────────────────────
export const COST_GROUP_COLORS = {
  ppjk: '#F2A97E',
  origin: '#8E4F93',
  local: '#D6A2CF',
  duty: '#3B1B3D',
}
export const COST_GROUP_LABELS = {
  ppjk: 'PPJK & trucking',
  origin: 'Origin charges',
  local: 'Local charges',
  duty: 'Duty & tax',
}
export type CostGroupKey = 'ppjk' | 'origin' | 'local'

// Segmen invoice di Invoice Recap (kolom vendor / biaya / split per segmen).
export const RECAP_SEGMENTS: { key: string; label: string; group: CostGroupKey; vendorCol: string; costCol: string; splitCol: string }[] = [
  { key: 'emkl', label: 'PPJK & trucking (EMKL)', group: 'ppjk', vendorCol: 'emkl_vendor', costCol: 'emkl_biaya', splitCol: 'emkl_split' },
  { key: 'fo', label: 'Freight origin', group: 'origin', vendorCol: 'freight_vendor', costCol: 'biaya_origin', splitCol: 'split_biaya_origin' },
  { key: 'fd', label: 'Freight destination', group: 'local', vendorCol: 'freight_vendor', costCol: 'biaya_destination', splitCol: 'split_biaya_destination' },
  { key: 'pbm', label: 'Storage / PBM', group: 'local', vendorCol: 'pbm_vendor', costCol: 'pbm_biaya', splitCol: 'pbm_split' },
  { key: 'lolo', label: 'Lift off (LOLO)', group: 'local', vendorCol: 'lift_off_vendor', costCol: 'lift_off_biaya', splitCol: 'lift_off_split' },
  { key: 'insp', label: 'Inspection', group: 'local', vendorCol: 'inspeksi_vendor', costCol: 'inspeksi_biaya', splitCol: 'inspeksi_split' },
  { key: 'hdl', label: 'Handling', group: 'local', vendorCol: 'handling_vendor', costCol: 'handling_biaya', splitCol: 'handling_split' },
  { key: 'oth', label: 'Other', group: 'local', vendorCol: 'other_vendor', costCol: 'other_biaya', splitCol: 'other_split' },
]

const hasVal = (v: any) => v !== null && v !== undefined && v !== ''

export function computeLandedCost(rec: any) {
  const groups: Record<CostGroupKey, number> = { ppjk: 0, origin: 0, local: 0 }
  let anySegment = false
  RECAP_SEGMENTS.forEach(s => {
    if (hasVal(rec?.[s.costCol])) anySegment = true
    groups[s.group] += num(rec?.[s.costCol])
  })
  const sumSegments = groups.ppjk + groups.origin + groups.local
  // Belum ada satu pun biaya per segmen tapi Total Invoice terisi -> pakai Total Invoice (tanpa
  // rincian kelompok) supaya Landed cost tidak tampil 0.
  const usedTotalInvoiceFallback = !anySegment && hasVal(rec?.total_invoice)
  const landed = usedTotalInvoiceFallback ? num(rec.total_invoice) : sumSegments
  const duty = num(rec?.duty_total)
  return {
    groups, landed, duty, usedTotalInvoiceFallback,
    totalInvoice: hasVal(rec?.total_invoice) ? num(rec.total_invoice) : null,
    grandTotal: hasVal(rec?.total_keseluruhan_biaya) ? num(rec.total_keseluruhan_biaya) : null,
  }
}

// ─── Cost Validation: label section ───────────────────────────────────────────
// Urutan & nama tampilan section `cost_validasi_seaair.checks` (nilai `section` TIDAK diubah).
export const COST_SECTIONS: { key: string; label: string; confirmable: boolean; optional?: boolean }[] = [
  { key: 'EMKL', label: 'PPJK (EMKL)', confirmable: true },
  { key: 'CUSTOM', label: 'Custom', confirmable: false },
  { key: 'TRUCKING', label: 'Trucking', confirmable: true },
  { key: 'FREIGHT_ORIGIN', label: 'Freight origin', confirmable: true },
  { key: 'FREIGHT_DESTINATION', label: 'Freight destination', confirmable: true },
  { key: 'STORAGE', label: 'Storage', confirmable: true },
  { key: 'LOLO', label: 'LOLO', confirmable: true },
  { key: 'SURVEYOR', label: 'Surveyor (optional)', confirmable: true, optional: true },
]
export const costSectionLabel = (key: string) => COST_SECTIONS.find(s => s.key === key)?.label || key
export const isSummaryCostRow = (row: any) => {
  const u = String(row?.row || '').toUpperCase()
  return u === 'TOTAL' || u === 'TOTAL KESELURUHAN'
}

// Label kelompok Doc Validation (section INVOICE_FCL/FAKTUR_PAJAK/PIB/EMKL/ACTUAL/VESSEL) ada di
// `SeaAirRecapDocumentsTab.tsx` (SECTIONS) bersama struktur baris/kolomnya.

export type DocStats = { match: number; mismatch: number; notChecked: number; pct: number; openMismatch: number }
// Formula % SAMA dgn badge Doc Validation Rekapan & modal (relax dulu, null tidak dihitung).
export function computeDocStats(checksRaw: any): DocStats {
  const checks = relaxSeaAirDocChecks(Array.isArray(checksRaw) ? checksRaw : [])
  let match = 0, mismatch = 0, notChecked = 0, openMismatch = 0
  checks.forEach((c: any) => {
    if (c.match === true) match++
    else if (c.match === false) { mismatch++; if (!c.manual) openMismatch++ }
    else notChecked++
  })
  const total = match + mismatch
  return { match, mismatch, notChecked, pct: total > 0 ? Math.round((match / total) * 100) : 0, openMismatch }
}

// ─── Issues (needs attention) ────────────────────────────────────────────────
// Keputusan user: needs attention = persentase rendah DAN belum dikonfirmasi user.
// - Checklist (Doc complete) < 100% -> dokumen wajib belum lengkap (tidak ada mekanisme konfirmasi).
// - Cost: section punya baris Over/Under & BELUM ada konfirmasi manual (cost_validasi_catatan_seaair).
//   CUSTOM (tidak bisa dikonfirmasi) & SURVEYOR (opsional, tidak dihitung %) TIDAK jadi issue.
// - Doc: mismatch yang BUKAN hasil keputusan manual user (`c.manual` false).
export type RecapIssue = { kind: 'docs' | 'cost' | 'match'; text: string }

// ─── Form E utk barang dari China (2026-10-05, permintaan user; catatan = sql/044) ─────────────────
// Asal China = kolom `rekapan_seaair.origin` berisi CHINA / TIONGKOK / PRC / kode "CN" / nama pelabuhan
// utama China. Hong Kong SENGAJA tidak dihitung (bukan asal Form E). Kalau isi kolom origin di data
// ternyata beda format, tambahkan kata kuncinya di sini (SATU-SATUNYA definisi).
const CHINA_ORIGIN_RE = /\b(CHINA|TIONGKOK|PRC|P\.R\.C|SHANGHAI|SHENZHEN|SHEKOU|YANTIAN|NANSHA|HUANGPU|GUANGZHOU|NINGBO|QINGDAO|XIAMEN|TIANJIN|XINGANG|DALIAN|FUZHOU|LIANYUNGANG|ZHUHAI|ZHONGSHAN|FOSHAN|JIANGMEN|NANJING|TAICANG|ZHANGJIAGANG|RIZHAO|YINGKOU|YIWU|JINJIANG|QUANZHOU|WUHAN|CHONGQING|SHANTOU|ZHANJIANG|BEIJING|HANGZHOU|SUZHOU|DONGGUAN)\b/
export function isChinaOrigin(origin: any): boolean {
  const s = String(origin ?? '').toUpperCase()
  if (!s.trim()) return false
  // + kode negara "CN" berdiri sendiri, atau kode pelabuhan UN/LOCODE China (CNSHA, CNNGB, ...).
  return CHINA_ORIGIN_RE.test(s) || /(^|[\s,(\-/])CN($|[\s,)\-/])/.test(s) || /(^|[^A-Z])CN[A-Z]{3}($|[^A-Z])/.test(s)
}
export const FORM_E_ISSUE_TEXT = 'Shipped from China — Form E is not checked; fill in a note in Documents'
// Issue Form E: asal China, Form E belum tercentang, belum ada catatan manual. `formENote` undefined =
// tabel catatan belum ada (sql/044 belum jalan) -> aturan TIDAK diterapkan (fail-open, tidak memblokir).
export function formEIssueApplies(origin: any, checklist: any, formENote: string | null | undefined): boolean {
  if (formENote === undefined) return false
  if (!isChinaOrigin(origin)) return false
  if (checklist?.ada_form_e === true) return false
  return !String(formENote || '').trim()
}
export type FormENote = { seaair_id: any; note: string; created_by?: string | null; created_at?: string | null; updated_by?: string | null; updated_at?: string | null }
// Catatan Form E per seaair_id. null = tabel belum ada / gagal dibaca (aturan dimatikan, lihat atas).
export async function fetchFormENotes(seaairIds: (string | number)[]): Promise<Record<string, FormENote> | null> {
  const ids = Array.from(new Set(seaairIds.filter(v => v !== null && v !== undefined && v !== '').map(String)))
  const out: Record<string, FormENote> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase.from('seaair_form_e_note').select('*').in('seaair_id', ids.slice(i, i + 50))
    if (error) { console.warn('[SeaAirRecap] catatan Form E tidak bisa dibaca (sql/044 belum dijalankan?)', error.message); return null }
    ;(data || []).forEach((r: any) => { out[String(r.seaair_id)] = r })
  }
  return out
}

export function computeRecapIssues(input: {
  checklist?: { pct_kelengkapan?: any; dokumen_kurang?: any; ada_form_e?: any } | null
  matriksChecks?: any[] | null
  costChecks?: any[] | null
  confirmations?: Map<string, string>
  origin?: any
  // undefined = aturan Form E tidak diterapkan (tabel catatan belum ada); null/'' = belum ada catatan.
  formENote?: string | null
}): RecapIssue[] {
  const issues: RecapIssue[] = []
  const cl = input.checklist
  if (cl && hasVal(cl.pct_kelengkapan) && num(cl.pct_kelengkapan) < 100) {
    const rawMissing = String(cl.dokumen_kurang || '').trim()
    const missing = rawMissing === '-' ? '' : rawMissing  // trigger kelengkapan isi '-' kalau lengkap
    issues.push({ kind: 'docs', text: `Missing required document${missing ? `: ${missing}` : ''}` })
  }
  if (formEIssueApplies(input.origin, cl, input.formENote)) issues.push({ kind: 'docs', text: FORM_E_ISSUE_TEXT })
  const conf = input.confirmations || new Map()
  const costChecks = Array.isArray(input.costChecks) ? input.costChecks : []
  COST_SECTIONS.filter(s => s.confirmable && !s.optional).forEach(s => {
    const rows = costChecks.filter((c: any) => String(c.section || '').trim().toUpperCase() === s.key && !isSummaryCostRow(c))
    const over = rows.some((c: any) => c.status === 'OVERCHARGE')
    const under = rows.some((c: any) => c.status === 'UNDERCHARGE')
    if ((over || under) && !conf.has(s.key)) {
      const what = over && under ? 'needs review' : over ? 'overcharge' : 'undercharge'
      issues.push({ kind: 'cost', text: `${costSectionLabel(s.key)} · ${what} — Admin to confirm in Costs` })
    }
  })
  if (Array.isArray(input.matriksChecks)) {
    const { openMismatch } = computeDocStats(input.matriksChecks)
    if (openMismatch > 0) issues.push({ kind: 'match', text: `${openMismatch} document mismatch${openMismatch === 1 ? '' : 'es'} — Admin to confirm in Documents` })
  }
  return issues
}

export type RecapStatus = { kind: 'submitted' | 'issues' | 'ready'; label: string }
export function recapStatus(rec: any, issues: RecapIssue[] | undefined): RecapStatus {
  // Tahap Finance Handover (sql/034) ikut ditampilkan kalau sudah ada.
  if (hasVal(rec?.paid_date)) return { kind: 'submitted', label: `✓ Paid ${fmtDayMonth(rec.paid_date)}` }
  if (hasVal(rec?.finance_received_at)) return { kind: 'submitted', label: '✓ Received by Finance' }
  if (hasVal(rec?.tgl_submit_finance)) return { kind: 'submitted', label: `✓ Submitted ${fmtDayMonth(rec.tgl_submit_finance)}` }
  const n = issues?.length || 0
  if (n > 0) return { kind: 'issues', label: `⚠ ${n} issue${n === 1 ? '' : 's'}` }
  return { kind: 'ready', label: '● Ready to submit' }
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDayMonth = (v: any) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(v || '')
  return `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]}`
}

// Tanggal LOKAL hari ini "YYYY-MM-DD" (Submit to Finance) -- BUKAN toISOString (UTC, bisa mundur sehari).
export const todayLocalIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Data issue per seaair_id (dipakai ringkasan KPI) ────────────────────────
const CHUNK = 50
export async function fetchRecapIssueData(seaairIds: (string | number)[]) {
  const ids = Array.from(new Set(seaairIds.filter(Boolean).map(String)))
  const matriks: Record<string, any[]> = {}
  const cost: Record<string, any[]> = {}
  const checklist: Record<string, any> = {}
  const conf: Record<string, Map<string, string>> = {}
  const origin: Record<string, any> = {}
  const formENotes = await fetchFormENotes(ids)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const [m, c, cl, ct, rk] = await Promise.all([
      supabase.from('dokumen_validasi_matriks_seaair').select('seaair_id, checks').in('seaair_id', chunk),
      supabase.from('cost_validasi_seaair').select('seaair_id, checks').in('seaair_id', chunk),
      supabase.from('dokumen_checklist_seaair').select('seaair_id, pct_kelengkapan, dokumen_kurang, ada_form_e').in('seaair_id', chunk),
      supabase.from('cost_validasi_catatan_seaair').select('seaair_id, section, status_konfirmasi').in('seaair_id', chunk),
      supabase.from('rekapan_seaair').select('seaair_id, origin').in('seaair_id', chunk),
    ])
    ;(rk.data || []).forEach((r: any) => { if (origin[String(r.seaair_id)] === undefined) origin[String(r.seaair_id)] = r.origin })
    ;(m.data || []).forEach((r: any) => { matriks[String(r.seaair_id)] = r.checks })
    ;(c.data || []).forEach((r: any) => { cost[String(r.seaair_id)] = r.checks })
    ;(cl.data || []).forEach((r: any) => { checklist[String(r.seaair_id)] = r })
    ;(ct.data || []).forEach((r: any) => {
      const k = String(r.seaair_id)
      if (!conf[k]) conf[k] = new Map()
      conf[k].set(r.section, r.status_konfirmasi)
    })
  }
  const out: Record<string, RecapIssue[]> = {}
  ids.forEach(id => {
    out[id] = computeRecapIssues({
      checklist: checklist[id], matriksChecks: matriks[id], costChecks: cost[id], confirmations: conf[id],
      origin: origin[id], formENote: formENotes ? (formENotes[id]?.note ?? null) : undefined,
    })
  })
  return out
}

// ─── Ringkasan KPI (baca saja) ────────────────────────────────────────────────
export const SEA_AIR_RECAP_SEARCH_COLS = ['no_aju', 'no_invoice', 'vendor', 'awb']
export type RecapFilters = { shipmentType: string; company: string; startDate: string; endDate: string; search: string }

export function applyRecapFilters(query: any, f: RecapFilters) {
  let q = query
  if (f.shipmentType && f.shipmentType !== 'All') q = q.eq('shipment_type', f.shipmentType)
  if (f.company && f.company !== 'All') q = q.eq('a_n', f.company)
  if (f.startDate) q = q.gte('tgl', f.startDate)
  if (f.endDate) q = q.lte('tgl', `${f.endDate} 23:59:59`)
  if (f.search) q = q.or(SEA_AIR_RECAP_SEARCH_COLS.map(col => `${col}.ilike.%${f.search}%`).join(','))
  return q
}

export type RecapSummary = {
  total: number; fcl: number; lcl: number; air: number
  landedSum: number; dutySum: number
  needsAttention: number; needsAttentionIds: (string | number)[]
  notSubmitted: number; notSubmittedLanded: number
}

const PAGE = 1000
// Ringkasan dihitung dari SEMUA baris yg lolos filter (bukan cuma halaman aktif). Tab tipe
// (All/LCL/FCL/AIR) IKUT filter (beda dgn Audit PIB) supaya angka "needs attention" = isi daftar.
// ─── Badge sidebar "needs attention" (2026-10-01) ───────────────────────────
// Definisi SAMA dgn KPI "Needs attention" halaman (tanpa filter): baris BELUM submit, terhubung
// ke Audit PIB (`seaair_id`), punya >= 1 issue (computeRecapIssues via fetchRecapIssueData).
export const SEA_AIR_RECAP_CHANGED_EVENT = 'beehive:seaair-recap-changed'
export const notifySeaAirRecapChanged = () => {
  try { window.dispatchEvent(new Event(SEA_AIR_RECAP_CHANGED_EVENT)) } catch { /* abaikan */ }
}
export async function fetchRecapNeedsAttentionCount(): Promise<number | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('rekapan_seaair').select('id, seaair_id')
      .is('tgl_submit_finance', null).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('[SeaAirRecap] badge needs attention gagal', error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const linked = rows.filter(r => r.seaair_id)
  if (linked.length === 0) return 0
  const issueMap = await fetchRecapIssueData(linked.map(r => r.seaair_id))
  return linked.filter(r => (issueMap[String(r.seaair_id)] || []).length > 0).length
}

export async function fetchRecapSummary(f: RecapFilters): Promise<RecapSummary | null> {
  const cols = ['id', 'shipment_type', 'seaair_id', 'tgl_submit_finance', 'total_invoice', 'duty_total', ...RECAP_SEGMENTS.map(s => s.costCol)]
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const base = supabase.from('rekapan_seaair').select(Array.from(new Set(cols)).join(', '))
    const { data, error } = await applyRecapFilters(base, f).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('[SeaAirRecap] ringkasan gagal', error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const s: RecapSummary = { total: rows.length, fcl: 0, lcl: 0, air: 0, landedSum: 0, dutySum: 0, needsAttention: 0, needsAttentionIds: [], notSubmitted: 0, notSubmittedLanded: 0 }
  const pending: any[] = []
  rows.forEach(r => {
    const t = String(r.shipment_type || '').toUpperCase()
    if (t === 'FCL') s.fcl++; else if (t === 'LCL') s.lcl++; else if (t === 'AIR') s.air++
    const lc = computeLandedCost(r)
    s.landedSum += lc.landed
    s.dutySum += lc.duty
    if (!hasVal(r.tgl_submit_finance)) {
      s.notSubmitted++
      s.notSubmittedLanded += lc.landed
      pending.push(r)
    }
  })
  const issueMap = await fetchRecapIssueData(pending.map(r => r.seaair_id).filter(Boolean))
  pending.forEach(r => {
    if (r.seaair_id && (issueMap[String(r.seaair_id)] || []).length > 0) {
      s.needsAttention++
      s.needsAttentionIds.push(r.id)
    }
  })
  return s
}

// ─── Log (audit_trail) ────────────────────────────────────────────────────────
export type RecapLogEntry = { at: string; who: string; what: string; detail: string }
const quote = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`
const TABLE_LABEL: Record<string, string> = {
  rekapan_seaair: 'Invoice Recap',
  cost_validasi_seaair: 'Cost validation',
  dokumen_validasi_matriks_seaair: 'Document validation',
  tabel_audit_seaair: 'Audit PIB',
}
export async function fetchRecapLog(rec: any): Promise<RecapLogEntry[]> {
  const entries: RecapLogEntry[] = []
  if (rec?.awb) {
    const { data, error } = await supabase.from('v_audit_trail')
      .select('created_at, user_email, action, tabel, deskripsi, catatan')
      .in('tabel', Object.keys(TABLE_LABEL))
      .or(`awb.eq.${quote(rec.awb)}`)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) console.error('[SeaAirRecap] log gagal', error)
    ;(data || []).forEach((r: any) => {
      const act = String(r.action || '').toUpperCase()
      const verb = act === 'INSERT' ? 'created' : act === 'DELETE' ? 'deleted' : act === 'UPDATE' ? 'updated' : 'changed'
      const cat = String(r.catatan || '')
      entries.push({
        at: r.created_at,
        who: r.user_email || 'System',
        what: `${TABLE_LABEL[r.tabel] || r.tabel} ${verb}`,
        detail: cat.includes('— Lama:') ? cat : (r.deskripsi || ''),
      })
    })
  }
  if (rec?.created_at) entries.push({ at: rec.created_at, who: 'System', what: 'Shipment recorded', detail: 'Invoice Recap row created' })
  return entries
}
