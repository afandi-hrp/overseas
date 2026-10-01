// Audit PIB Sea & Air -- tampilan kartu/Open/Edit (2026-09-30, redesain tampilan "PIB Audit").
// SATU-SATUNYA sumber: rumus Balance/Asuransi (dipakai juga tabel lama SharedDataTable.tsx),
// rincian Customs value & Duty & tax (MURNI tampilan, tidak disimpan), status "Validated in
// Invoice Recap" (dari Doc Validation Sea & Air bagian PIB MATRIX), dan query baca tambahan
// (ringkasan KPI, hubungan ke Invoice Recap, checklist dokumen bea cukai, log).
// Data tabel `tabel_audit_seaair` TIDAK diubah oleh file ini -- tulis data tetap lewat RPC lama
// `update_seaair_row`/`insert_seaair_row` (lihat SeaAirAuditEditModal.tsx).

import { supabase } from '../lib/supabase'
import { relaxSeaAirDocChecks, SEA_AIR_PIB_MATRIX_ROWS, toNum } from './SeaAirValidasiHelpers'
import { fetchSignerCompanyOptions } from './FarOverseasAirHelpers'
import { computeRecapIssues, parsePoManual, type RecapIssue, type PoManualEntry } from './SeaAirRecapHelpers'

// ─── Angka & format ───────────────────────────────────────────────────────────

export const num = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
export const parseLooseNumber = (v: any): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  if (!/[0-9]/.test(String(v))) return null
  return toNum(v)
}

const idFmt = (n: number, maxFrac = 2) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac }).format(n)

export const fmtRp = (v: any): string => {
  const n = numOrNull(v)
  return n === null ? '—' : `Rp ${idFmt(n)}`
}
export const fmtValas = (v: any): string => {
  const n = numOrNull(v)
  return n === null ? '—' : idFmt(n)
}
// "Rp 7,2B" / "Rp 974M" / "Rp 1,5M" -- dipakai kartu KPI (spek).
export const fmtRpShort = (v: any): string => {
  const n = num(v)
  const abs = Math.abs(n)
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [size, label] of units) {
    if (abs >= size) {
      const scaled = n / size
      return `Rp ${idFmt(scaled, Math.abs(scaled) >= 100 ? 0 : 1)}${label}`
    }
  }
  return `Rp ${idFmt(n, 0)}`
}
export const fmtPctShort = (v: number | null): string => (v === null ? '—' : `${idFmt(v, 2)}%`)

// Nomor aju 26 karakter -> "000020-ANE956-20260924-811402" (dipakai juga tabel lama SharedDataTable).
export const formatNoAju = (v: any) => {
  if (!v || typeof v !== 'string') return v
  const clean = v.replace(/[\s-]/g, '')
  if (clean.length === 26) {
    return `${clean.substring(0, 6)}-${clean.substring(6, 12)}-${clean.substring(12, 20)}-${clean.substring(20, 26)}`
  }
  return v
}

const MONTHS_SHORT =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "24 Sep 2026" -- parse manual YYYY-MM-DD (kolom `date`) supaya tidak geser zona waktu.
export const fmtDateShort = (v: any): string => {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1] || m[2]} ${m[1]}`
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

// Persen tersimpan `ppn_pct`/`pph_pct` dibaca sbg angka persen (11 = 11%). Jaga2 kalau ada data
// lama berbentuk pecahan (0,11) -- nilai 0 < x < 1 dianggap pecahan & dikali 100 (HANYA tampilan).
export const normPct = (v: any): number | null => {
  const n = numOrNull(v)
  if (n === null) return null
  return n > 0 && n < 1 ? n * 100 : n
}

// ─── Status Draft/Audited ─────────────────────────────────────────────────────
// Draft = status ARCHIVED, Audited = selain ARCHIVED (LENGKAP) -- pemetaan lama, tidak berubah.
export const isSeaAirDraft = (rec: any) => rec?.status === 'ARCHIVED'
export const SEA_AIR_STATUS_DRAFT = 'ARCHIVED'
export const SEA_AIR_STATUS_AUDITED = 'LENGKAP'

// ─── Rumus Balance & Asuransi (SATU-SATUNYA definisi) ─────────────────────────
// BALANCE = VALAS DPP × KURS NDPBM − (TOTAL INV FREIGHT + ITEM PRICE (RP))
// ASURANSI = 0,5% × (TOTAL INV FREIGHT + ITEM PRICE (RP))
// Delivery Term mengandung "CIF" -> keduanya 0 (lihat isCifDeliveryTerm).
export const isCifDeliveryTerm = (deliveryTerm: any) => String(deliveryTerm || '').toUpperCase().includes('CIF')

export function computeSeaAirBalanceAsuransi(row: any): { balance: number; asuransi: number } {
  const valasDpp = num(row?.valas_dpp)
  const kursNdpbm = num(row?.kurs_ndpbm)
  const totalInvFreight = num(row?.total_inv_freight)
  const itemPriceIdr = num(row?.item_price_idr)
  if (isCifDeliveryTerm(row?.delivery_term)) return { balance: 0, asuransi: 0 }
  return {
    balance: Number((valasDpp * kursNdpbm - (totalInvFreight + itemPriceIdr)).toFixed(2)),
    asuransi: Number(((totalInvFreight + itemPriceIdr) * 0.005).toFixed(2)),
  }
}
export const SEA_AIR_BALANCE_DEP_KEYS = ['valas_dpp', 'kurs_ndpbm', 'total_inv_freight', 'item_price_idr', 'delivery_term']

// ─── Goods per PO (po_ori / vendor_inv_no / po_harga_detail, gabungan dipisah "+") ──
// Regex & pasangan baris SAMA PERSIS dgn SeaAirAuditRowGroup (tabel lama): kalau salah satu kolom
// cuma 1 nilai, nilai itu dipakai di semua baris.
export const splitMulti = (v: any): string[] =>
  typeof v === 'string' ? v.split(/\s*\+\s*|,\s+/).map(s => s.trim()).filter(Boolean) : []

export type GoodsLine = { po: string; inv: string; amt: string }

export function buildGoodsLines(rec: any): GoodsLine[] {
  const pos = splitMulti(rec?.po_ori)
  const invs = splitMulti(rec?.vendor_inv_no)
  const amts = splitMulti(rec?.po_harga_detail)
  const len = Math.max(pos.length, invs.length, amts.length)
  const lines: GoodsLine[] = []
  for (let i = 0; i < len; i++) {
    lines.push({
      po: pos[i] || (pos.length === 1 ? pos[0] : ''),
      inv: invs[i] || (invs.length === 1 ? invs[0] : ''),
      amt: amts[i] || (amts.length === 1 ? amts[0] : ''),
    })
  }
  return lines
}

// Bagi rata uang ke `n` bagian (valas 2 desimal, Rp 0 desimal) -- sisa pembulatan ke bagian
// PERTAMA supaya jumlah SELALU persis total (pola sama `splitEvenly` FAR, tapi FAR pakai 3 desimal
// utk KG -- 3 desimal di teks `po_harga_detail` bisa terbaca pemisah ribuan, makanya dibuat terpisah).
export function splitMoneyEvenly(total: number, n: number, decimals: number): number[] {
  if (n <= 0 || !isFinite(total)) return []
  const unit = Math.pow(10, decimals)
  const totalUnits = Math.round(total * unit)
  const base = Math.trunc(totalUnits / n)
  const remainder = totalUnits - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / unit)
}

// Balik dari baris form ke 3 kolom teks. Kolom yang isinya TIDAK berubah dari data asli dibiarkan
// string aslinya (tidak ditulis ulang), supaya format lama (mis. 1 invoice utk semua PO) tidak
// berubah hanya krn form dibuka & disimpan.
export function goodsLinesToFields(lines: GoodsLine[], original: any): Record<string, string | null> {
  const origLines = buildGoodsLines(original)
  const out: Record<string, string | null> = {}
  const fields: [keyof GoodsLine, string][] = [['po', 'po_ori'], ['inv', 'vendor_inv_no'], ['amt', 'po_harga_detail']]
  fields.forEach(([k, col]) => {
    const now = lines.map(l => (l[k] || '').trim())
    const before = origLines.map(l => (l[k] || '').trim())
    const same = now.length === before.length && now.every((v, i) => v === before[i])
    if (same) return
    const joined = now.filter(Boolean).join(' + ')
    out[col] = joined || null
  })
  return out
}

// ─── Rincian Customs value & Duty (MURNI tampilan) ────────────────────────────
const TOLERANCE = 1000

export function computeCustomsBuildUp(rec: any) {
  const cv = num(rec?.total_nilai_pabean)
  const valasDpp = num(rec?.valas_dpp)
  const kursNdpbm = num(rec?.kurs_ndpbm)
  const goodsValas = num(rec?.item_price)
  const goodsIdr = num(rec?.item_price_idr)
  // Kurs barang TIDAK disimpan -- pakai kurs tersirat Rp ÷ valas supaya pasti cocok dgn Rp tersimpan.
  const goodsRate = goodsValas > 0 && goodsIdr > 0 ? goodsIdr / goodsValas : null
  const freight = num(rec?.total_inv_freight)
  const { balance, asuransi } = computeSeaAirBalanceAsuransi(rec)
  const residual = cv - (goodsIdr + freight + asuransi)
  const cvCalc = valasDpp * kursNdpbm
  return {
    cv, valasDpp, kursNdpbm, goodsValas, goodsIdr, goodsRate, freight,
    insurance: asuransi, balance, residual,
    isRounding: Math.abs(residual) <= TOLERANCE,
    cvCalc, cvCalcMatches: Math.abs(cv - cvCalc) <= TOLERANCE,
    isCif: isCifDeliveryTerm(rec?.delivery_term),
    term: String(rec?.delivery_term || '').toUpperCase().trim(),
  }
}

export type DutyStatus = 'match' | 'differs' | 'derived' | 'na'
export type DutyRow = { key: 'bm' | 'ppn' | 'pph'; label: string; rate: number | null; calculated: number | null; onPib: number; diff: number | null; status: DutyStatus }

// BM%: TIDAK ada kolom persen BM -> dihitung BM ÷ Customs value (keputusan user 2026-09-30,
// tidak bisa diedit). Akibatnya baris BM selalu "derived" (bukan pembanding sungguhan).
export function computeDutyRows(rec: any) {
  const cv = num(rec?.total_nilai_pabean)
  const bm = num(rec?.bm)
  const importValueCalc = cv + bm
  const importValueStored = numOrNull(rec?.total_nilai_pabean_bm)
  const bmRate = cv > 0 ? Math.round((bm / cv) * 10000) / 100 : null
  const mk = (key: 'ppn' | 'pph', label: string, pctRaw: any, valueRaw: any): DutyRow => {
    const rate = normPct(pctRaw)
    const onPib = num(valueRaw)
    if (rate === null) return { key, label, rate, calculated: null, onPib, diff: null, status: 'na' }
    const calculated = Math.round(importValueCalc * rate / 100)
    const diff = onPib - calculated
    return { key, label, rate, calculated, onPib, diff, status: Math.abs(diff) <= TOLERANCE ? 'match' : 'differs' }
  }
  const rows: DutyRow[] = [
    { key: 'bm', label: 'Bea masuk (BM)', rate: bmRate, calculated: bm, onPib: bm, diff: null, status: 'derived' },
    mk('ppn', 'PPN impor', rec?.ppn_pct, rec?.ppn_nilai),
    mk('pph', 'PPh 22 impor', rec?.pph_pct, rec?.pph_nilai),
  ]
  const sumOnPib = rows.reduce((s, r) => s + r.onPib, 0)
  const totalPib = num(rec?.total_pib)
  return {
    rows, cv, bmRate, importValueCalc, importValueStored,
    importValueMatches: importValueStored === null ? null : Math.abs(importValueStored - importValueCalc) <= TOLERANCE,
    sumOnPib, totalPib, totalMatches: Math.abs(totalPib - sumOnPib) <= TOLERANCE,
  }
}

// ─── Status validasi dari Invoice Recap (Doc Validation Sea & Air, section PIB) ─
export type SeaAirValidationState = 'validated' | 'differences' | 'not_validated' | 'not_in_recap'

export function evaluatePibValidation(checksRaw: any): { evaluated: number; mismatchLabels: string[] } {
  // relax SELURUH checks dulu (sama dgn modal -- pinjaman ref "NO PO" mencari di semua baris), baru ambil section PIB
  const pibChecks = relaxSeaAirDocChecks(Array.isArray(checksRaw) ? checksRaw : []).filter((c: any) => c?.section === 'PIB')
  let evaluated = 0
  const mismatchLabels: string[] = []
  SEA_AIR_PIB_MATRIX_ROWS.forEach(row => {
    let rowMismatch = false
    row.required.forEach(col => {
      const c = pibChecks.find((x: any) => x.row === row.dbRow && x.col === col)
      if (c && c.match !== null && c.match !== undefined) {
        evaluated++
        if (c.match === false) rowMismatch = true
      }
    })
    if (rowMismatch) mismatchLabels.push(row.label)
  })
  return { evaluated, mismatchLabels }
}

export type SeaAirAuditLinkInfo = {
  rekapanId: string | number | null
  validation: SeaAirValidationState
  diffFields: string[]
  // Dokumen bea cukai yg belum ada di checklist Invoice Recap (PIB/SPPB/Billing DJBC/BPN);
  // null = checklist belum ada (tidak diketahui).
  missingDocs: string[] | null
  // Gerbang "Mark as audited" (2026-10-01, sql/031): issue Invoice Recap terkait -- aturan SAMA
  // computeRecapIssues (dipakai tombol Submit to Finance). Audited baru boleh kalau = 0.
  recapIssues: RecapIssue[]
  recapSubmittedAt: string | null
  recapPoManual: Record<string, PoManualEntry>
}

// Alasan tombol "Mark as audited" diblokir (null = boleh). Urutan alur: semua issue Invoice Recap
// dikonfirmasi Admin -> Submit to Finance bisa -> baru PIB boleh Audited.
export function markAuditedBlocker(info?: SeaAirAuditLinkInfo | null): string | null {
  if (!info) return 'Checking Invoice Recap…'
  if (info.rekapanId === null || info.rekapanId === undefined) return 'Not linked to an Invoice Recap shipment'
  const n = (info.recapIssues || []).length
  if (n > 0) return `${n} open issue${n === 1 ? '' : 's'} in Invoice Recap must be confirmed by Admin first`
  return null
}

const CUSTOMS_DOC_FIELDS: [string, string][] = [['ada_pib', 'PIB'], ['ada_sppb', 'SPPB'], ['ada_billing_djbc', 'Billing DJBC'], ['ada_bpn', 'BPN']]
const CHUNK = 50

export async function fetchSeaAirAuditLinkInfo(ids: (string | number)[]): Promise<Record<string, SeaAirAuditLinkInfo>> {
  const unique = Array.from(new Set(ids.filter(Boolean).map(String)))
  const rekapanBy: Record<string, any> = {}
  const checksBy: Record<string, any> = {}
  const checklistBy: Record<string, any> = {}
  const costBy: Record<string, any> = {}
  const confBy: Record<string, Map<string, string>> = {}
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const [rek, mat, chk, cost, conf] = await Promise.all([
      // select('*') -- kolom po_manual (sql/031) mungkin belum ada; '*' aman sebelum/sesudah SQL.
      supabase.from('rekapan_seaair').select('*').in('seaair_id', chunk),
      supabase.from('dokumen_validasi_matriks_seaair').select('seaair_id, checks').in('seaair_id', chunk),
      supabase.from('dokumen_checklist_seaair').select('seaair_id, ada_pib, ada_sppb, ada_billing_djbc, ada_bpn, pct_kelengkapan, dokumen_kurang').in('seaair_id', chunk),
      supabase.from('cost_validasi_seaair').select('seaair_id, checks').in('seaair_id', chunk),
      supabase.from('cost_validasi_catatan_seaair').select('seaair_id, section, status_konfirmasi').in('seaair_id', chunk),
    ])
    if (rek.error) console.error('[SeaAirAudit] rekapan link gagal', rek.error)
    if (mat.error) console.error('[SeaAirAudit] matriks gagal', mat.error)
    if (chk.error) console.error('[SeaAirAudit] checklist gagal', chk.error)
    if (cost.error) console.error('[SeaAirAudit] cost gagal', cost.error)
    if (conf.error) console.error('[SeaAirAudit] catatan gagal', conf.error)
    ;(rek.data || []).forEach((r: any) => { if (rekapanBy[String(r.seaair_id)] === undefined) rekapanBy[String(r.seaair_id)] = r })
    ;(mat.data || []).forEach((m: any) => { checksBy[String(m.seaair_id)] = m.checks })
    ;(chk.data || []).forEach((c: any) => { checklistBy[String(c.seaair_id)] = c })
    ;(cost.data || []).forEach((c: any) => { costBy[String(c.seaair_id)] = c.checks })
    ;(conf.data || []).forEach((c: any) => {
      const k = String(c.seaair_id)
      if (!confBy[k]) confBy[k] = new Map()
      confBy[k].set(c.section, c.status_konfirmasi)
    })
  }
  const out: Record<string, SeaAirAuditLinkInfo> = {}
  unique.forEach(id => {
    const rekRow = rekapanBy[id]
    const rekapanId = rekRow ? rekRow.id : null
    const checks = checksBy[id]
    let validation: SeaAirValidationState
    let diffFields: string[] = []
    if (checks !== undefined) {
      const { evaluated, mismatchLabels } = evaluatePibValidation(checks)
      diffFields = mismatchLabels
      validation = mismatchLabels.length > 0 ? 'differences' : evaluated > 0 ? 'validated' : 'not_validated'
    } else {
      validation = rekapanId !== null ? 'not_validated' : 'not_in_recap'
    }
    const cl = checklistBy[id]
    const missingDocs = cl ? CUSTOMS_DOC_FIELDS.filter(([k]) => !cl[k]).map(([, label]) => label) : null
    const recapIssues = rekRow
      ? computeRecapIssues({ checklist: cl || null, matriksChecks: checks !== undefined ? checks : null, costChecks: costBy[id] ?? null, confirmations: confBy[id] || new Map() })
      : []
    out[id] = {
      rekapanId, validation, diffFields, missingDocs, recapIssues,
      recapSubmittedAt: rekRow?.tgl_submit_finance || null,
      recapPoManual: rekRow ? parsePoManual(rekRow) : {},
    }
  })
  return out
}

export const VALIDATION_META: Record<SeaAirValidationState, { label: string; tone: 'green' | 'red' | 'grey'; sub: string }> = {
  validated: { label: '✓ Validated in Invoice Recap', tone: 'green', sub: 'PIB fields match the documents checked in Invoice Recap › Doc Validation (PIB matrix).' },
  differences: { label: 'PIB differences to review', tone: 'red', sub: 'Doc Validation in Invoice Recap found PIB fields that do not match.' },
  not_validated: { label: 'Not validated yet', tone: 'grey', sub: 'The shipment is in Invoice Recap but its PIB matrix has not been checked yet.' },
  not_in_recap: { label: 'Not in Invoice Recap yet', tone: 'grey', sub: 'No Invoice Recap shipment is linked to this PIB yet.' },
}
export const validationLabel = (info?: SeaAirAuditLinkInfo | null): string => {
  if (!info) return 'Checking…'
  if (info.validation === 'differences') return `! ${info.diffFields.length} PIB difference${info.diffFields.length === 1 ? '' : 's'} to review`
  return VALIDATION_META[info.validation].label
}

// ─── Filter & ringkasan KPI (baca saja) ───────────────────────────────────────
// Kolom Search Audit Sea & Air -- dipakai fetchRecords/getExportData SharedDataTable.tsx juga.
export const SEA_AIR_AUDIT_SEARCH_COLS = ['no_aju', 'no_pib', 'awb', 'po_ori', 'vendor', 'hs_code']

export type SeaAirAuditFilters = { importAn: string; startDate: string; endDate: string; search: string }

export function applySeaAirAuditFilters(query: any, f: SeaAirAuditFilters) {
  let q = query
  if (f.importAn && f.importAn !== 'All') q = q.eq('impor_an', f.importAn)
  if (f.startDate) q = q.gte('tgl_ppjk', f.startDate)
  if (f.endDate) q = q.lte('tgl_ppjk', `${f.endDate} 23:59:59`)
  if (f.search) q = q.or(SEA_AIR_AUDIT_SEARCH_COLS.map(col => `${col}.ilike.%${f.search}%`).join(','))
  return q
}

export type SeaAirAuditSummary = {
  total: number; draft: number; audited: number
  cvSum: number; bmSum: number; ppnSum: number; pphSum: number; dutySum: number
  dutyDraft: number; dutyAudited: number
  notValidated: number | null
}

const PAGE = 1000
export async function fetchSeaAirAuditSummary(f: SeaAirAuditFilters): Promise<SeaAirAuditSummary | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const base = supabase.from('tabel_audit_seaair').select('id, status, total_nilai_pabean, bm, ppn_nilai, pph_nilai, total_pib')
    const { data, error } = await applySeaAirAuditFilters(base, f).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('[SeaAirAudit] ringkasan gagal', error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const s: SeaAirAuditSummary = { total: rows.length, draft: 0, audited: 0, cvSum: 0, bmSum: 0, ppnSum: 0, pphSum: 0, dutySum: 0, dutyDraft: 0, dutyAudited: 0, notValidated: null }
  const draftIds: string[] = []
  rows.forEach(r => {
    const duty = num(r.total_pib)
    if (isSeaAirDraft(r)) { s.draft++; s.dutyDraft += duty; draftIds.push(r.id) } else { s.audited++; s.dutyAudited += duty }
    s.cvSum += num(r.total_nilai_pabean)
    s.bmSum += num(r.bm)
    s.ppnSum += num(r.ppn_nilai)
    s.pphSum += num(r.pph_nilai)
    s.dutySum += duty
  })
  if (draftIds.length > 0) {
    const info = await fetchSeaAirAuditLinkInfo(draftIds)
    s.notValidated = draftIds.filter(id => info[String(id)]?.validation !== 'validated').length
  } else {
    s.notValidated = 0
  }
  return s
}

// Nama lengkap PT dari far_overseas_signer_config (keputusan user). Gagal/RLS -> {} (tampil kode).
export async function fetchCompanyNameMap(): Promise<Record<string, string>> {
  const opts = await fetchSignerCompanyOptions()
  const map: Record<string, string> = {}
  opts.forEach((o: any) => { if (o.company_code) map[String(o.company_code).trim().toUpperCase()] = o.company_name_full || o.company_code })
  return map
}
export const companyFullName = (map: Record<string, string>, code: any): string => {
  const c = String(code || '').trim()
  if (!c) return '—'
  return map[c.toUpperCase()] || c
}

// ─── Log (audit_trail) ────────────────────────────────────────────────────────
// Trigger DB `fn_audit_seaair` hanya mencatat perubahan dari user login (baris n8n dilewati guard
// auth.email()). Isi `catatan` dari trigger = dump mentah -> hanya aksi/waktu/user yg ditampilkan.
export type SeaAirAuditLogEntry = { at: string; who: string; what: string; detail: string }

const quote = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`

export async function fetchSeaAirAuditLog(rec: any): Promise<SeaAirAuditLogEntry[]> {
  const keys: string[] = []
  if (rec?.awb) keys.push(`awb.eq.${quote(rec.awb)}`)
  if (rec?.no_aju) keys.push(`no_dokumen.eq.${quote(rec.no_aju)}`)
  const entries: SeaAirAuditLogEntry[] = []
  if (keys.length > 0) {
    const { data, error } = await supabase.from('v_audit_trail')
      .select('created_at, user_email, action, deskripsi, catatan')
      .eq('tabel', 'tabel_audit_seaair')
      .or(keys.join(','))
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) console.error('[SeaAirAudit] log gagal', error)
    ;(data || []).forEach((r: any) => {
      const act = String(r.action || '').toUpperCase()
      const what = act === 'INSERT' ? 'Created' : act === 'DELETE' ? 'Deleted' : act === 'UPDATE' ? 'Updated' : (r.action || 'Changed')
      const cat = String(r.catatan || '')
      const detail = cat.includes('— Lama:') ? cat : (r.deskripsi || (act === 'UPDATE' ? 'PIB record updated' : ''))
      entries.push({ at: r.created_at, who: r.user_email || 'System', what, detail })
    })
  }
  // Baris "Recorded" dari created_at -- aplikasi tidak menyimpan sumbernya (n8n vs manual).
  if (rec?.created_at) entries.push({ at: rec.created_at, who: 'System', what: 'Recorded', detail: 'PIB record created' })
  return entries
}

// Beri tahu sidebar (badge jumlah Draft) bahwa data Audit PIB berubah.
export const SEA_AIR_AUDIT_CHANGED_EVENT = 'beehive:seaair-audit-changed'
export const notifySeaAirAuditChanged = () => {
  try { window.dispatchEvent(new Event(SEA_AIR_AUDIT_CHANGED_EVENT)) } catch { /* abaikan */ }
}
