// Finance Handover gabungan (FAR Overseas + Sea & Air), 2026-10-01 -- SATU sumber data/aturan halaman
// /finance-handover. Spek user ("Finance Handover", BeeHive):
// - FAR Overseas: 1 handover per memo yg APPROVED (step 4). Payable to = forwarder (`ship_via`),
//   jumlah = total memo (IDR; non-IDR tampil ≈ IDR + nilai asli), due = due date memo, chip Urgent.
// - Sea & Air: 1 handover per BL/AWB yg sudah "Submit to Finance". Payable to = PPJK nama LENGKAP
//   (master `seaair_vendor_master`, sql/035), jumlah = invoice pengiriman TANPA duty & tax
//   (`computeLandedCost`), due = tanggal submit + TOP PPJK (default 14 hari).
// - Overdue = belum Paid & due < hari ini. Urut "Sent" terbaru dulu.
// - Courier (2026-10-02, sql/037): 1 handover per INVOICE rekapan_courier yg sudah punya Submit Date.
//   Payable to = PPJK nama LENGKAP (master `courier_vendor_master`, kode = PPJK tanpa "OWN"), jumlah =
//   total invoice (Credit Note = negatif), due = Submit Date + TOP (default 14 hari), Paid = `tgl_lunas`.
// Tulis HANYA lewat RPC (FAR: sql/027+035, Sea & Air: sql/034+035, Courier: sql/037). Tanpa upload bukti & tanpa Undo.
import { supabase } from '../lib/supabase'
import { computeCourierRekapanCalc, invoiceAmount, invoiceKind, ppjkCode, awbDisplay } from './CourierRecapHelpers'
import { computeLandedCost, parsePoDetail, RECAP_SEGMENTS } from './SeaAirRecapHelpers'
import {
  getFinanceStage, getMemoDueValue, totalInIdr, implicitFxRate, formatMoney, getApprovalEntries, findApprovalEntry, toLocalDay,
} from './FarOverseasAirHelpers'

export type HandoverSource = 'far' | 'seaair' | 'courier'
export type HandoverStage = 'waiting' | 'received' | 'paid'

export type HandoverItem = {
  key: string
  source: HandoverSource
  id: string
  refLabel: 'MEMO' | 'BL / AWB' | 'INVOICE'
  ref: string
  sub: string
  payee: string
  payeeIsCode: boolean          // Sea & Air: nama lengkap PPJK belum diisi di master vendor
  payeeLine: string             // "Vendor: …" / "Supplier: …"
  pt: string
  amountIdr: number
  amountOriginal: string | null // "RMB 3.642,5" kalau non-IDR
  sentDate: string | null       // YYYY-MM-DD
  receivedDate: string | null
  receivedBy: string | null
  paidDate: string | null
  paidReference: string | null
  dueDate: string | null
  topLabel: string | null       // "TOP 30d" / "TOP 14d (default)"
  urgent: boolean
  earlier: boolean              // Sea & Air tanpa data validasi -> hanya tab Handover
  stage: HandoverStage
  raw: any
}

export const DEFAULT_SEAAIR_TOP_DAYS = 14
export const DEFAULT_COURIER_TOP_DAYS = 14
const PAGE = 1000
const CHUNK = 50

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== ''
const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Tanggal lokal YYYY-MM-DD dari kolom date ATAU timestamptz (tanpa geser zona utk kolom date).
export function localDayIso(v: any): string | null {
  if (!hasVal(v)) return null
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : isoOf(d)
}
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOf(new Date(y, m - 1, d + days))
}
export const todayIso = () => isoOf(new Date())
export const isOverdue = (it: HandoverItem, today = todayIso()) => it.stage !== 'paid' && !!it.dueDate && it.dueDate < today

async function fetchAll(build: (from: number, to: number) => any): Promise<any[] | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) { console.error('[FinanceHandover] fetch gagal', error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// ── FAR Overseas ─────────────────────────────────────────────────────────────
export function farToItem(r: any): HandoverItem {
  const st = getFinanceStage(r)
  const tier3 = findApprovalEntry(getApprovalEntries(r), 'TIER3')
  const fx = implicitFxRate(r)
  const due = getMemoDueValue(r)
  const dueDay = due ? toLocalDay(due) : null
  return {
    key: `far:${r.id}`,
    source: 'far',
    id: String(r.id),
    refLabel: 'MEMO',
    ref: r.memo_no || r.memo_title || '—',
    sub: r.memo_title || '',
    payee: r.ship_via || '—',
    payeeIsCode: false,
    payeeLine: `Vendor: ${r.vendor || '—'}`,
    pt: r.dominant_company_code || '',
    amountIdr: totalInIdr(r) || 0,
    amountOriginal: fx != null ? formatMoney(r.total_amount, r.total_amount_currency) : null,
    sentDate: localDayIso(tier3?.approved_at),
    receivedDate: localDayIso(r.finance_received_at),
    receivedBy: r.finance_received_by || null,
    paidDate: localDayIso(r.paid_at),
    paidReference: r.paid_reference || null,
    dueDate: dueDay ? isoOf(dueDay) : null,
    topLabel: null,
    urgent: !!r.is_urgent,
    earlier: false,
    stage: st === 'PAID' ? 'paid' : st === 'RECEIVED' ? 'received' : 'waiting',
    raw: r,
  }
}

export async function fetchFarHandovers(): Promise<HandoverItem[] | null> {
  const rows = await fetchAll((a, b) => supabase.from('rekapan_far_overseas_air').select('*')
    .eq('approval_status', 'APPROVED').order('created_at', { ascending: false }).order('id', { ascending: true }).range(a, b))
  return rows ? rows.map(farToItem) : null
}

// ── Sea & Air ────────────────────────────────────────────────────────────────
export type SeaAirVendor = { vendor_code: string; legal_name: string | null; top_days: number | null }
export const vendorKey = (v: any) => String(v ?? '').trim().toUpperCase()

export async function fetchSeaAirVendorMap(): Promise<Record<string, SeaAirVendor>> {
  const { data, error } = await supabase.from('seaair_vendor_master').select('vendor_code, legal_name, top_days, aktif')
  if (error) { console.warn('[FinanceHandover] master vendor Sea & Air tidak terbaca (sql/035?)', error.message); return {} }
  const out: Record<string, SeaAirVendor> = {}
  ;(data || []).forEach((v: any) => { out[vendorKey(v.vendor_code)] = v })
  return out
}

export const seaAirInvoiceSegments = (r: any) => RECAP_SEGMENTS.filter(s => hasVal(r?.[s.costCol]))

export function seaAirToItem(r: any, vendors: Record<string, SeaAirVendor>, validated: Set<string>): HandoverItem {
  const v = vendors[vendorKey(r.emkl_vendor)]
  const top = v?.top_days ?? null
  const sent = localDayIso(r.tgl_submit_finance)
  const n = seaAirInvoiceSegments(r).length
  const type = String(r.shipment_type || '').toUpperCase()
  const route = r.origin || r.destination ? `${r.origin || '—'} → ${r.destination || '—'}` : ''
  const earlier = !r.seaair_id || !validated.has(String(r.seaair_id))
  return {
    key: `seaair:${r.id}`,
    source: 'seaair',
    id: String(r.id),
    refLabel: 'BL / AWB',
    ref: r.awb || '—',
    sub: [n ? `${n} invoice${n === 1 ? '' : 's'}` : '', type, route, earlier ? 'earlier shipment' : ''].filter(Boolean).join(' · '),
    payee: v?.legal_name?.trim() || r.emkl_vendor || '—',
    payeeIsCode: !v?.legal_name?.trim(),
    payeeLine: `Supplier: ${r.vendor || '—'}`,
    pt: r.a_n || '',
    amountIdr: computeLandedCost(r).landed,
    amountOriginal: null,
    sentDate: sent,
    receivedDate: localDayIso(r.finance_received_at),
    receivedBy: r.finance_received_by || null,
    paidDate: localDayIso(r.paid_date),
    paidReference: r.paid_reference || null,
    dueDate: sent ? addDaysIso(sent, top ?? DEFAULT_SEAAIR_TOP_DAYS) : null,
    topLabel: top != null ? `TOP ${top}d` : `TOP ${DEFAULT_SEAAIR_TOP_DAYS}d (default)`,
    urgent: false,
    earlier,
    stage: hasVal(r.paid_date) ? 'paid' : hasVal(r.finance_received_at) ? 'received' : 'waiting',
    raw: r,
  }
}

// seaair_id yg punya Doc Validation ATAU Cost Validation (selain itu = "earlier shipment").
async function fetchValidatedSeaAirIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const [m, c] = await Promise.all([
      supabase.from('dokumen_validasi_matriks_seaair').select('seaair_id').in('seaair_id', chunk),
      supabase.from('cost_validasi_seaair').select('seaair_id').in('seaair_id', chunk),
    ])
    ;[...(m.data || []), ...(c.data || [])].forEach((r: any) => out.add(String(r.seaair_id)))
  }
  return out
}

export async function fetchSeaAirHandovers(): Promise<HandoverItem[] | null> {
  const rows = await fetchAll((a, b) => supabase.from('rekapan_seaair').select('*')
    .not('tgl_submit_finance', 'is', null).order('tgl_submit_finance', { ascending: false }).order('id', { ascending: true }).range(a, b))
  if (!rows) return null
  const [vendors, validated] = await Promise.all([
    fetchSeaAirVendorMap(),
    fetchValidatedSeaAirIds(Array.from(new Set(rows.map(r => r.seaair_id).filter(Boolean).map(String)))),
  ])
  return rows.map(r => seaAirToItem(r, vendors, validated))
}

// Kolom Finance Sea & Air (sql/034) ada? Baris `select('*')` membawa key-nya walau null.
export async function probeSeaAirFinanceColumns(sample?: any): Promise<boolean> {
  if (sample) return Object.prototype.hasOwnProperty.call(sample, 'finance_received_at')
  const { error } = await supabase.from('rekapan_seaair').select('finance_received_at').limit(1)
  return !error
}

// ── Courier (per invoice) ────────────────────────────────────────────────────
export async function fetchCourierVendorMap(): Promise<Record<string, SeaAirVendor>> {
  const { data, error } = await supabase.from('courier_vendor_master').select('vendor_code, legal_name, top_days, aktif')
  if (error) { console.warn('[FinanceHandover] master vendor Courier tidak terbaca (sql/037?)', error.message); return {} }
  const out: Record<string, SeaAirVendor> = {}
  ;(data || []).forEach((v: any) => { out[vendorKey(v.vendor_code)] = v })
  return out
}

export function courierToItem(r0: any, vendors: Record<string, SeaAirVendor>): HandoverItem {
  const r = { ...r0, ...computeCourierRekapanCalc(r0, r0.manual_override_fields) }
  const code = ppjkCode(r.ppjk)
  const v = vendors[vendorKey(code)]
  const top = v?.top_days ?? null
  const sent = localDayIso(r.submit_date)
  const cn = invoiceKind(r) === 'cn'
  return {
    key: `courier:${r.id}`,
    source: 'courier',
    id: String(r.id),
    refLabel: 'INVOICE',
    ref: r.no_invoice || '—',
    sub: [r.invoice_type || 'Invoice', r.awb ? `AWB ${awbDisplay(r.awb)}` : ''].filter(Boolean).join(' · '),
    payee: v?.legal_name?.trim() || code || '—',
    payeeIsCode: !v?.legal_name?.trim(),
    payeeLine: `Vendor: ${r.vendor || '—'}`,
    pt: r.an || '',
    amountIdr: cn ? -invoiceAmount(r) : invoiceAmount(r),
    amountOriginal: null,
    sentDate: sent,
    receivedDate: localDayIso(r.finance_received_at),
    receivedBy: r.finance_received_by || null,
    paidDate: localDayIso(r.tgl_lunas),
    paidReference: r.paid_reference || null,
    dueDate: sent ? addDaysIso(sent, top ?? DEFAULT_COURIER_TOP_DAYS) : null,
    topLabel: top != null ? `TOP ${top}d` : `TOP ${DEFAULT_COURIER_TOP_DAYS}d (default)`,
    urgent: false,
    earlier: false,
    stage: hasVal(r.tgl_lunas) ? 'paid' : hasVal(r.finance_received_at) ? 'received' : 'waiting',
    raw: r,
  }
}

export async function fetchCourierHandovers(): Promise<HandoverItem[] | null> {
  const rows = await fetchAll((a, b) => supabase.from('rekapan_courier').select('*')
    .not('submit_date', 'is', null).order('submit_date', { ascending: false }).order('id', { ascending: true }).range(a, b))
  if (!rows) return null
  const vendors = await fetchCourierVendorMap()
  return rows.map(r => courierToItem(r, vendors))
}

// Kolom Finance Courier (sql/037) ada?
export async function probeCourierFinanceColumns(sample?: any): Promise<boolean> {
  if (sample) return Object.prototype.hasOwnProperty.call(sample, 'finance_received_at')
  const { error } = await supabase.from('rekapan_courier').select('finance_received_at').limit(1)
  return !error
}

export const sortHandovers = (list: HandoverItem[]) =>
  [...list].sort((a, b) => (b.sentDate || '').localeCompare(a.sentDate || '') || a.ref.localeCompare(b.ref))

export function matchesHandoverSearch(it: HandoverItem, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const r = it.raw || {}
  return [it.ref, it.sub, it.payee, it.payeeLine, it.pt, it.paidReference, r.memo_title, r.vendor, r.no_invoice, r.emkl_vendor, r.ship_via, r.awb, r.ppjk]
    .some(v => String(v ?? '').toLowerCase().includes(s))
}

// ── RPC ──────────────────────────────────────────────────────────────────────
export async function receiveHandover(it: HandoverItem, receiverName: string, receivedDate: string) {
  if (it.source === 'far') return supabase.rpc('fn_far_overseas_finance_accept', { p_id: it.id, p_receiver_name: receiverName, p_received_date: receivedDate })
  if (it.source === 'courier') return supabase.rpc('fn_courier_finance_accept', { p_id: it.id, p_receiver_name: receiverName, p_received_date: receivedDate })
  return supabase.rpc('fn_seaair_finance_accept', { p_rekapan_id: it.id, p_receiver_name: receiverName, p_received_date: receivedDate })
}
export async function markHandoverPaid(it: HandoverItem, paidDate: string, reference: string | null) {
  if (it.source === 'far') return supabase.rpc('fn_far_overseas_mark_paid', { p_id: it.id, p_paid_date: paidDate, p_proof_path: null, p_reference: reference })
  if (it.source === 'courier') return supabase.rpc('fn_courier_finance_mark_paid', { p_id: it.id, p_paid_date: paidDate, p_reference: reference })
  return supabase.rpc('fn_seaair_finance_mark_paid', { p_rekapan_id: it.id, p_paid_date: paidDate, p_reference: reference })
}

export const seaAirPoList = (r: any) => parsePoDetail(r).map(p => p.po_no).filter(Boolean)
