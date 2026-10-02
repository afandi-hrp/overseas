// Invoice Recap Courier -- tampilan kartu per AWB (2026-10-02, keputusan user; lihat CLAUDE.md "Rombak Invoice
// Recap Courier"). SATU sumber rumus/format/query modul ini:
// - auto-calc 6 kolom (DIPINDAH dari SharedDataTable, isi TIDAK berubah),
// - normalisasi AWB (SAMA fn_courier_awb_norm sql/037), pengelompokan invoice per AWB,
// - total: Freight + Duty (charges) dan Credit Note TERPISAH, total akhir = charges − CN,
// - split per vessel (jumlah breakdown_* per vessel, CN dikurangkan),
// - halaman kartu: RPC fn_courier_recap_awb_page / fn_courier_recap_summary (sql/037, opsi B); kalau RPC belum
//   ada (SQL belum dijalankan) -> fallback hitung di browser dgn aturan yang SAMA.
import { supabase } from '../lib/supabase'
import { courierAuditCalcNum, type CourierDocType } from './CourierAuditHelpers'

// ─── Auto-calc 6 kolom (DIPINDAH dari SharedDataTable 2026-10-02, isi tidak berubah) ─────────────
// Sama prinsip dgn COURIER_AUDIT_CALC_FIELDS (override manual permanen, live-compute di semua jalur input).
// "Jumlah Vessel" = jumlah pemisah '+' pada kolom Vessel + 1 (vessel kosong/tanpa '+' = 1).
export const COURIER_REKAPAN_CALC_FIELDS = ['total_amount', 'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel'] as const

export function courierRekapanVesselCount(vesselText: any): number {
  const text = String(vesselText || '')
  if (!text) return 1
  const plusCount = text.split('+').length - 1
  return plusCount + 1
}

export function computeCourierRekapanCalc(row: Record<string, any>, overrideFields: string[] | Set<string> | null | undefined): Record<string, any> {
  const ov = overrideFields instanceof Set ? overrideFields : new Set(overrideFields || [])
  const n = courierAuditCalcNum
  const out: Record<string, any> = {}

  const courierAdmFee = n(row.courier_adm_fee)
  const totalDutyTax = n(row.total_duty_tax)
  const totalFreight = n(row.total_freight)
  const bm = n(row.bm)
  const ppn = n(row.ppn)
  const pph = n(row.pph)
  const vesselCount = courierRekapanVesselCount(row.vessel)

  // 1. Total Amount = Courier Adm Fee + Total Duty Tax + Total Freight
  if (!ov.has('total_amount')) out.total_amount = courierAdmFee + totalDutyTax + totalFreight

  // 2-6. Breakdown per Vessel
  if (!ov.has('breakdown_courier_adm_vessel')) out.breakdown_courier_adm_vessel = courierAdmFee / vesselCount
  if (!ov.has('breakdown_duty_vessel')) out.breakdown_duty_vessel = totalDutyTax / vesselCount
  if (!ov.has('breakdown_freight_vessel')) out.breakdown_freight_vessel = totalFreight / vesselCount
  if (!ov.has('breakdown_bm_vessel')) out.breakdown_bm_vessel = bm / vesselCount
  if (!ov.has('breakdown_ppnpph_vessel')) out.breakdown_ppnpph_vessel = (ppn + pph) / vesselCount

  return out
}

const applyCalc = (r: any) => Object.assign(r, computeCourierRekapanCalc(r, r.manual_override_fields))

// ─── AWB, PPJK, jenis invoice ────────────────────────────────────────────────────────────────────
// SAMA fn_courier_awb_norm (sql/037): huruf besar, buang prefix "DHL NO." / "FEDEX No." / "EMSNO." dst,
// sisakan A-Z0-9. Kosong -> null.
export function courierAwbNorm(v: any): string | null {
  const s = String(v ?? '').toUpperCase().replace(/^[A-Z]+\s*NO\.?\s*:?\s*/, '').replace(/[^A-Z0-9]/g, '')
  return s || null
}
// Tampilan AWB tanpa prefix carrier (sama kolom AWB tabel Recap lama).
export const awbDisplay = (v: any) => String(v ?? '').replace(/^(DHL|FEDEX|UPS|EMS)\s*NO\.?\s*:?\s*/i, '').trim()
// Kode PPJK tanpa "OWN " (sama tab PPJK & master vendor Courier).
export const ppjkCode = (v: any) => String(v ?? '').trim().toUpperCase().replace(/^OWN\s+/, '')

export type InvoiceKind = 'freight' | 'duty' | 'cn'
export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = { freight: 'Freight', duty: 'Duty', cn: 'Credit Note' }
export function invoiceKind(r: any): InvoiceKind {
  const t = String(r?.invoice_type || '').toUpperCase()
  if (t.includes('CREDIT NOTE')) return 'cn'
  if (t.includes('DUTY')) return 'duty'
  return 'freight'
}
const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n }
// Nilai invoice = total_amount (auto-calc / override). Credit Note selalu positif (dikurangkan di total akhir).
export const invoiceAmount = (r: any) => (invoiceKind(r) === 'cn' ? Math.abs(num(r.total_amount)) : num(r.total_amount))

// Pasangan PO ↔ Vessel -- SALINAN aturan CourierRekapanRowGroup (tabel lama).
export function poVesselPairs(r: any): { po: string; vessel: string }[] {
  const poStr = typeof r.po_pt_imi === 'string' ? r.po_pt_imi : ''
  const vesselStr = typeof r.vessel === 'string' ? r.vessel : ''
  const out: { po: string; vessel: string }[] = []
  if (poStr || vesselStr) {
    const pos = poStr.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean)
    const vessels = vesselStr.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean)
    const maxLen = Math.max(pos.length, vessels.length)
    for (let i = 0; i < maxLen; i++) {
      out.push({ po: pos[i] || (pos.length === 1 ? pos[0] : ''), vessel: vessels[i] || (vessels.length === 1 ? vessels[0] : '') })
    }
  }
  return out
}
const splitPlus = (v: any) => String(v ?? '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean)

// ─── Kelompok per AWB ────────────────────────────────────────────────────────────────────────────
export type RecapAuditLink = { rec: any; docType: CourierDocType; by: 'id' | 'awb' }
export type RecapGroup = {
  key: string                     // AWB ternormalisasi, atau "ID:<uuid>" kalau AWB kosong
  awb: string                     // AWB tampilan (tanpa prefix carrier)
  awbRaw: string                  // AWB apa adanya (baris pertama) -- dipakai pencarian Audit & log
  rows: any[]                     // semua invoice (urut created_at)
  byKind: Record<InvoiceKind, any[]>
  ppjks: string[]                 // nilai ppjk mentah unik (mis. DHL, OWN DHL)
  an: string
  origin: string
  weight: number | null
  pos: string[]
  vessels: string[]
  firstEmail: string | null
  lastEmail: string | null
  freight: number
  duty: number
  charges: number                 // freight + duty
  cn: number                      // jumlah Credit Note (positif)
  finalTotal: number              // charges − cn
  submitted: number
  received: number
  paid: number
  audit: RecapAuditLink | null    // diisi fetchRecapAuditLinks
}

const firstVal = (rows: any[], k: string) => { for (const r of rows) { const v = r[k]; if (v !== null && v !== undefined && String(v).trim() !== '') return v } return null }

export function buildRecapGroup(key: string, rowsIn: any[]): RecapGroup {
  const rows = [...rowsIn].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
  const byKind: Record<InvoiceKind, any[]> = { freight: [], duty: [], cn: [] }
  rows.forEach(r => byKind[invoiceKind(r)].push(r))
  const sum = (list: any[]) => list.reduce((s, r) => s + invoiceAmount(r), 0)
  const freight = sum(byKind.freight)
  const duty = sum(byKind.duty)
  const cn = sum(byKind.cn)
  const emails = rows.map(r => r.tgl_terima_email).filter(Boolean).map(String).sort()
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)))
  const pos = uniq(rows.flatMap(r => [...splitPlus(r.po_pt_imi), ...splitPlus(r.po_shipping)]))
  const vessels = uniq(rows.flatMap(r => splitPlus(r.vessel)))
  const w = firstVal(rows, 'weight_kg')
  const awbRaw = String(firstVal(rows, 'awb') ?? '')
  return {
    key, awb: awbDisplay(awbRaw) || '—', awbRaw, rows, byKind,
    ppjks: uniq(rows.map(r => String(r.ppjk || '').trim())),
    an: String(firstVal(rows, 'an') ?? ''),
    origin: String(firstVal(rows, 'origin') ?? ''),
    weight: w === null ? null : num(w),
    pos, vessels,
    firstEmail: emails[0] || null,
    lastEmail: emails[emails.length - 1] || null,
    freight, duty, charges: freight + duty, cn, finalTotal: freight + duty - cn,
    submitted: rows.filter(r => r.submit_date).length,
    received: rows.filter(r => r.finance_received_at).length,
    paid: rows.filter(r => r.tgl_lunas).length,
    audit: null,
  }
}

// Status kartu (Submit to Finance per invoice).
export function recapGroupStatus(g: RecapGroup): { label: string; tone: 'green' | 'amber' | 'blue' | 'grey' } {
  const n = g.rows.length
  if (n > 0 && g.paid === n) return { label: 'Paid', tone: 'green' }
  if (n > 0 && g.submitted === n) return { label: g.paid > 0 ? `Submitted · ${g.paid}/${n} paid` : 'Submitted to Finance', tone: 'blue' }
  if (g.submitted > 0) return { label: `${g.submitted}/${n} submitted`, tone: 'amber' }
  return { label: 'Not submitted', tone: 'grey' }
}

// Split per vessel: jumlah breakdown_* tiap invoice yang memuat vessel itu (Credit Note dikurangkan).
export type VesselSplit = { vessel: string; adm: number; freight: number; duty: number; bm: number; ppnpph: number; total: number }
export function splitPerVessel(rows: any[]): VesselSplit[] {
  const map = new Map<string, VesselSplit>()
  rows.forEach(r => {
    const sign = invoiceKind(r) === 'cn' ? -1 : 1
    const mag = (v: any) => (invoiceKind(r) === 'cn' ? Math.abs(num(v)) : num(v))
    const vessels = splitPlus(r.vessel)
    const list = vessels.length ? vessels : ['(no vessel)']
    list.forEach(v => {
      const e = map.get(v) || { vessel: v, adm: 0, freight: 0, duty: 0, bm: 0, ppnpph: 0, total: 0 }
      e.adm += sign * mag(r.breakdown_courier_adm_vessel)
      e.freight += sign * mag(r.breakdown_freight_vessel)
      e.duty += sign * mag(r.breakdown_duty_vessel)
      e.bm += sign * mag(r.breakdown_bm_vessel)
      e.ppnpph += sign * mag(r.breakdown_ppnpph_vessel)
      e.total = e.adm + e.freight + e.duty
      map.set(v, e)
    })
  })
  return Array.from(map.values())
}

// ─── Query halaman kartu ─────────────────────────────────────────────────────────────────────────
export type RecapFilters = { ppjk: string | null; an: string | null; from: string | null; to: string | null; search: string; searchCols: string[] }
export type RecapSummaryCourier = { awb: number; invoices: number; charges: number; credit_notes: number; not_submitted: number; submitted_unpaid: number; paid: number; not_in_audit: number }

const PAGE = 1000
const rpcMissing = (e: any) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message || ''))

async function fetchRowsByIds(ids: string[]): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('rekapan_courier').select('*').in('id', ids.slice(i, i + 100))
    if (error) throw error
    out.push(...(data || []))
  }
  return out
}

// Fallback (SQL 037 belum jalan): semua baris tab PPJK, dikelompokkan & difilter di browser -- aturan SAMA RPC.
async function fallbackGroups(f: RecapFilters): Promise<{ key: string; rows: any[]; hit: boolean }[]> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('rekapan_courier').select('*').order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (f.ppjk) q = q.ilike('ppjk', `%${f.ppjk}%`)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const s = f.search.trim().toLowerCase()
  const hit = (r: any) =>
    (!f.an || r.an === f.an)
    && (!f.from || (r.tgl_terima_email && String(r.tgl_terima_email) >= f.from))
    && (!f.to || (r.tgl_terima_email && String(r.tgl_terima_email).slice(0, 10) <= f.to))
    && (!s || f.searchCols.some(c => String(r[c] ?? '').toLowerCase().includes(s)))
  const map = new Map<string, { key: string; rows: any[]; hit: boolean }>()
  rows.forEach(r => {
    const key = courierAwbNorm(r.awb) || `ID:${r.id}`
    const g = map.get(key) || { key, rows: [], hit: false }
    g.rows.push(r)
    g.hit = g.hit || hit(r)
    map.set(key, g)
  })
  const groups = Array.from(map.values()).filter(g => g.hit)
  const lastOf = (g: { rows: any[] }, k: string) => g.rows.map(r => String(r[k] || '')).sort().pop() || ''
  groups.sort((a, b) => {
    const ea = lastOf(a, 'tgl_terima_email'), eb = lastOf(b, 'tgl_terima_email')
    if (ea !== eb) return !ea ? 1 : !eb ? -1 : eb.localeCompare(ea)
    const ca = lastOf(a, 'created_at'), cb = lastOf(b, 'created_at')
    return cb.localeCompare(ca) || a.key.localeCompare(b.key)
  })
  return groups
}

export async function fetchCourierRecapPage(f: RecapFilters, offset: number, limit: number): Promise<{ total: number; groups: RecapGroup[]; fallback: boolean }> {
  const { data, error } = await supabase.rpc('fn_courier_recap_awb_page', {
    p_ppjk: f.ppjk, p_an: f.an, p_from: f.from, p_to: f.to, p_search: f.search || null, p_search_cols: f.searchCols, p_offset: offset, p_limit: limit,
  })
  if (error && !rpcMissing(error)) throw error
  if (!error && data) {
    const page: { awb: string; ids: string[] }[] = data.groups || []
    const rows = await fetchRowsByIds(page.flatMap(g => g.ids.map(String)))
    const byId = new Map(rows.map(r => [String(r.id), applyCalc(r)]))
    return {
      total: Number(data.total) || 0,
      groups: page.map(g => buildRecapGroup(g.awb, g.ids.map(id => byId.get(String(id))).filter(Boolean))).filter(g => g.rows.length > 0),
      fallback: false,
    }
  }
  console.warn('[CourierRecap] RPC fn_courier_recap_awb_page belum ada (sql/037?) -- fallback di browser')
  const all = await fallbackGroups(f)
  return {
    total: all.length,
    groups: all.slice(offset, offset + limit).map(g => buildRecapGroup(g.key, g.rows.map(applyCalc))),
    fallback: true,
  }
}

export async function fetchCourierRecapSummary(f: RecapFilters): Promise<RecapSummaryCourier | null> {
  const { data, error } = await supabase.rpc('fn_courier_recap_summary', {
    p_ppjk: f.ppjk, p_an: f.an, p_from: f.from, p_to: f.to, p_search: f.search || null, p_search_cols: f.searchCols,
  })
  if (!error && data) {
    return {
      awb: Number(data.awb) || 0, invoices: Number(data.invoices) || 0, charges: Number(data.charges) || 0, credit_notes: Number(data.credit_notes) || 0,
      not_submitted: Number(data.not_submitted) || 0, submitted_unpaid: Number(data.submitted_unpaid) || 0, paid: Number(data.paid) || 0,
      not_in_audit: Number(data.not_in_audit) || 0,
    }
  }
  if (error && !rpcMissing(error)) { console.error('[CourierRecap] ringkasan gagal', error); return null }
  try {
    const all = (await fallbackGroups(f)).map(g => buildRecapGroup(g.key, g.rows.map(applyCalc)))
    const inv = all.flatMap(g => g.rows)
    return {
      awb: all.length, invoices: inv.length,
      charges: all.reduce((s, g) => s + g.charges, 0), credit_notes: all.reduce((s, g) => s + g.cn, 0),
      not_submitted: inv.filter(r => !r.submit_date).length,
      submitted_unpaid: inv.filter(r => r.submit_date && !r.tgl_lunas).length,
      paid: inv.filter(r => r.tgl_lunas).length,
      not_in_audit: -1, // tidak dihitung di fallback (butuh sql/037)
    }
  } catch (e) {
    console.error('[CourierRecap] ringkasan fallback gagal', e)
    return null
  }
}

// ─── Pasangan Audit (PIB/CN) ─────────────────────────────────────────────────────────────────────
// Prioritas: kolom rekapan_courier.pib_id / cn_id, cadangan: AWB ternormalisasi sama.
export async function fetchRecapAuditLinks(groups: RecapGroup[]): Promise<void> {
  if (groups.length === 0) return
  const pibIds = Array.from(new Set(groups.flatMap(g => g.rows.map(r => r.pib_id)).filter(Boolean).map(String)))
  const cnIds = Array.from(new Set(groups.flatMap(g => g.rows.map(r => r.cn_id)).filter(Boolean).map(String)))
  const found: { rec: any; docType: CourierDocType; by: 'id' | 'awb' }[] = []
  const load = async (table: string, t: CourierDocType, ids: string[]) => {
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from(table).select('*').in('id', ids.slice(i, i + 100))
      ;(data || []).forEach((rec: any) => found.push({ rec: { ...rec, jenis_dokumen: t }, docType: t, by: 'id' }))
    }
  }
  await Promise.all([load('tabel_audit_pib', 'PIB', pibIds), load('tabel_audit_cn', 'CN', cnIds)])
  const byId = new Map(found.map(f => [`${f.docType}:${f.rec.id}`, f]))
  const missing: RecapGroup[] = []
  groups.forEach(g => {
    const hit = g.rows.map(r => (r.pib_id && byId.get(`PIB:${r.pib_id}`)) || (r.cn_id && byId.get(`CN:${r.cn_id}`))).find(Boolean)
    if (hit) g.audit = hit
    else if (!g.key.startsWith('ID:')) missing.push(g)
  })
  if (missing.length === 0) return
  // Cari lewat AWB (ilike angka inti), lalu cocokkan normalisasi di browser.
  const keys = missing.map(g => g.key)
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20)
    const or = chunk.map(k => `awb.ilike.%${k.replace(/[%_,()"]/g, '_')}%`).join(',')
    const [p, c] = await Promise.all([
      supabase.from('tabel_audit_pib').select('*').or(or),
      supabase.from('tabel_audit_cn').select('*').or(or),
    ])
    const cand = [
      ...(p.data || []).map((rec: any) => ({ rec: { ...rec, jenis_dokumen: 'PIB' }, docType: 'PIB' as CourierDocType, by: 'awb' as const })),
      ...(c.data || []).map((rec: any) => ({ rec: { ...rec, jenis_dokumen: 'CN' }, docType: 'CN' as CourierDocType, by: 'awb' as const })),
    ]
    missing.filter(g => chunk.includes(g.key)).forEach(g => {
      const m = cand.find(x => courierAwbNorm(x.rec.awb) === g.key)
      if (m) g.audit = m
    })
  }
}

// ─── Submit to Finance (per invoice / semua invoice AWB) ─────────────────────────────────────────
// Tanpa syarat & tanpa kunci (keputusan user). Hanya mengisi submit_date yang masih kosong.
export async function submitRecapInvoices(ids: string[], dateIso: string) {
  return supabase.from('rekapan_courier').update({ submit_date: dateIso }).in('id', ids).is('submit_date', null)
}

// ─── Audit trail (v_audit_trail tabel rekapan_courier, cocok AWB mentah tiap invoice) ─────────────
export type RecapLogEntry = { at: string; who: string; what: string; detail: string }
export async function fetchRecapCourierLog(g: RecapGroup): Promise<RecapLogEntry[]> {
  const awbs = Array.from(new Set(g.rows.map(r => r.awb).filter(Boolean).map(String)))
  const entries: RecapLogEntry[] = []
  if (awbs.length) {
    const { data, error } = await supabase.from('v_audit_trail')
      .select('created_at, user_email, action, deskripsi, catatan')
      .eq('tabel', 'rekapan_courier')
      .in('awb', awbs)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('[CourierRecap] log gagal', error)
    ;(data || []).forEach((r: any) => {
      const act = String(r.action || '').toUpperCase()
      const what = act === 'INSERT' ? 'Created' : act === 'DELETE' ? 'Deleted' : act === 'UPDATE' ? 'Updated' : (r.action || 'Changed')
      const cat = String(r.catatan || '')
      entries.push({ at: r.created_at, who: r.user_email || 'System', what, detail: cat.includes('— Lama:') ? cat : (r.deskripsi || (act === 'UPDATE' ? 'Invoice updated' : '')) })
    })
  }
  g.rows.forEach(r => { if (r.created_at) entries.push({ at: r.created_at, who: 'System', what: 'Recorded', detail: `${r.invoice_type || 'Invoice'} ${r.no_invoice || ''} recorded`.trim() }) })
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export const COURIER_RECAP_CHANGED_EVENT = 'beehive:courier-recap-changed'
export const notifyCourierRecapChanged = () => { try { window.dispatchEvent(new Event(COURIER_RECAP_CHANGED_EVENT)) } catch { /* abaikan */ } }
