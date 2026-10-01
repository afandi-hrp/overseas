// Audit Courier — tampilan baru (2026-10-01, mengikuti Audit PIB Sea & Air). SATU-SATUNYA sumber
// rumus/format/query tampilan kartu, jendela Open & form Edit/Add Courier. Rumus auto-calc 7 kolom
// (`computeCourierAuditCalc`) DIPINDAH ke sini dari SharedDataTable (isi TIDAK berubah) supaya tabel
// lama & form baru memakai fungsi yang sama.
// Keputusan user: tab Draft / PIB / CN; Mark as audited TIDAK PERNAH dikunci walau validasi belum
// lengkap (ada kasus invoice freight memang tidak ditagihkan); fitur tabel lama tetap di mode List.
import { supabase } from '../lib/supabase'
import { normPct } from './SeaAirAuditHelpers'

// ─── Audit Courier — Auto-Calculate Kolom Turunan (2026-09) ─────────────────
// 7 kolom turunan dihitung otomatis dari kolom sumbernya, URUTAN WAJIB 1->7 (field bawah pakai
// hasil field atas). Field manapun yang PERNAH diedit manual oleh user TIDAK PERNAH ditimpa lagi
// oleh kalkulasi ini -- override dicatat permanen di kolom DB `manual_override_fields` (jsonb
// array nama field, ada di tabel_audit_pib & tabel_audit_cn). Dipakai di 4 jalur input: EditModal
// lama, form baru CourierAuditEditModal, fetchRecords/getExportData (live-compute utk data hasil
// isian n8n), handleInlineSaveRow (edit massal/per-baris inline). Kalau salah satu jalur ini lupa
// dipanggil, hasilnya nyasar diam2.
export const COURIER_AUDIT_CALC_FIELDS = ['total_nilai_pabean', 'total_nilai_pabean_bm', 'ppn_pct', 'pph_pct', 'item_price_idr', 'total_pib_cn', 'cek_selisih'] as const

export function courierAuditCalcNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'string') return Number(v.replace(/,/g, '')) || 0
  return Number(v) || 0
}

const courierAuditIsEmpty = (v: any) => v === null || v === undefined || v === ''

// `row` = gabungan record lama + perubahan baru (dependency terbaru). `jenisDokumen` = 'PIB'/'CN'
// (menentukan Sanksi ADM ikut dihitung atau 0). `overrideFields` = daftar key yang JANGAN
// ditimpa. Return HANYA field yang boleh dihitung ulang (field yg di-override tidak ada di
// return object -- pemanggil harus merge, bukan replace total).
export function computeCourierAuditCalc(row: Record<string, any>, jenisDokumen: string, overrideFields: string[] | Set<string> | null | undefined): Record<string, any> {
  const ov = overrideFields instanceof Set ? overrideFields : new Set(overrideFields || [])
  const n = courierAuditCalcNum
  const out: Record<string, any> = {}

  // 1. Total Customs Value = Valas DPP x Kurs NDPBM
  const totalNilaiPabeanCalc = n(row.valas_dpp) * n(row.kurs_ndpbm)
  if (!ov.has('total_nilai_pabean')) out.total_nilai_pabean = totalNilaiPabeanCalc
  const totalNilaiPabeanEff = ov.has('total_nilai_pabean') ? n(row.total_nilai_pabean) : totalNilaiPabeanCalc

  // 2. T N.Pabean + BM = (1) + BM (Rp)
  const totalNilaiPabeanBmCalc = totalNilaiPabeanEff + n(row.bm)
  if (!ov.has('total_nilai_pabean_bm')) out.total_nilai_pabean_bm = totalNilaiPabeanBmCalc
  const totalNilaiPabeanBmEff = ov.has('total_nilai_pabean_bm') ? n(row.total_nilai_pabean_bm) : totalNilaiPabeanBmCalc

  // 3 & 4. PPN/PPH (%) = Nilai (Rp) / (2) -- "" kalau (2) kosong/0 (guard pembagi nol)
  if (!ov.has('ppn_pct')) out.ppn_pct = totalNilaiPabeanBmEff ? (n(row.ppn_nilai) / totalNilaiPabeanBmEff) : ''
  if (!ov.has('pph_pct')) out.pph_pct = totalNilaiPabeanBmEff ? (n(row.pph_nilai) / totalNilaiPabeanBmEff) : ''

  // 5. Item Price (Rp) = "" kalau Item Price & Other Cost dua-duanya kosong; kalau Currency=USD
  // pakai (Item Price+Other Cost)*Kurs NDPBM, selain itu Item Price*Kurs BI (PIB tidak punya
  // kolom Kurs BI sendiri -- fallback ke Kurs NDPBM, sama pola fallback yang sudah ada di kode).
  const itemPriceEmpty = courierAuditIsEmpty(row.item_price) && courierAuditIsEmpty(row.other_cost)
  const currency = String(row.kurs || '').trim().toUpperCase()
  const kursBiEff = n(row.kurs_bi) || n(row.kurs_ndpbm)
  const itemPriceIdrCalc: number | '' = itemPriceEmpty ? '' : (currency === 'USD'
    ? (n(row.item_price) + n(row.other_cost)) * n(row.kurs_ndpbm)
    : n(row.item_price) * kursBiEff)
  if (!ov.has('item_price_idr')) out.item_price_idr = itemPriceIdrCalc
  const itemPriceIdrEff = ov.has('item_price_idr') ? n(row.item_price_idr) : n(itemPriceIdrCalc)

  // 6. Total PIB/CN (Rp) = BM (Rp) + PPN Nilai (Rp) + PPH Nilai (Rp) + (jalur CN ? Sanksi ADM : 0)
  const sanksiAdm = jenisDokumen === 'CN' ? n(row.sanksi_adm) : 0
  if (!ov.has('total_pib_cn')) out.total_pib_cn = n(row.bm) + n(row.ppn_nilai) + n(row.pph_nilai) + sanksiAdm

  // 7. Check Difference (Rp) = (1) - (Item Price (Rp) + Total Inv Freight)
  if (!ov.has('cek_selisih')) out.cek_selisih = totalNilaiPabeanEff - (itemPriceIdrEff + n(row.total_inv_freight))

  return out
}

// ─── Identitas baris ──────────────────────────────────────────────────────────
export type CourierDocType = 'PIB' | 'CN'
export const COURIER_STATUS_DRAFT = 'ARCHIVED'
export const isCourierDraft = (rec: any) => rec?.status === COURIER_STATUS_DRAFT
// Baris tab PIB/CN dari 1 tabel tidak selalu membawa `jenis_dokumen` -> fallback ke tab aktif.
export function courierDocType(rec: any, tabFallback?: string): CourierDocType {
  const j = String(rec?.jenis_dokumen || '').trim().toUpperCase()
  if (j === 'CN' || j === 'PIB') return j
  if (rec?.tabel === 'tabel_audit_cn' || tabFallback === 'cn') return 'CN'
  return 'PIB'
}
export const courierTableOf = (t: CourierDocType) => (t === 'CN' ? 'tabel_audit_cn' : 'tabel_audit_pib')
// Nomor dokumen: PIB = No. PIB, CN = No. SPPBMCP.
export const courierDocNo = (rec: any, t: CourierDocType) => (t === 'CN' ? rec?.no_sppbmcp : rec?.no_pib) || ''
// Kunci unik kartu -- tab Draft menggabung 2 tabel dgn sequence id masing2 (id bisa kembar).
export const courierRowKey = (rec: any, t: CourierDocType) => `${t}-${rec?.id}`

// ─── Batas kolom per role (Finance) ───────────────────────────────────────────
// `allowed` = getAllowedColumns('courier_audit') (null = semua kolom). Kolom yang tidak diizinkan
// TIDAK ditampilkan di kartu/Open/KPI & TIDAK ada di form Edit (sama prinsip tabel lama).
export const makeColOk = (allowed: Set<string> | null) => (key: string) => !allowed || allowed.has(key)

// ─── Rincian Customs value & Duty (MURNI tampilan) ────────────────────────────
const TOLERANCE = 1000
const n = courierAuditCalcNum

export function computeCourierBuildUp(rec: any) {
  const cv = n(rec?.total_nilai_pabean)
  const valasDpp = n(rec?.valas_dpp)
  const kursNdpbm = n(rec?.kurs_ndpbm)
  const goodsIdr = n(rec?.item_price_idr)
  const freight = n(rec?.total_inv_freight)
  const cvCalc = valasDpp * kursNdpbm
  const difference = rec?.cek_selisih === null || rec?.cek_selisih === undefined || rec?.cek_selisih === '' ? cv - (goodsIdr + freight) : n(rec.cek_selisih)
  const currency = String(rec?.kurs || '').trim().toUpperCase()
  return {
    cv, valasDpp, kursNdpbm, goodsIdr, freight, cvCalc, difference,
    cvCalcMatches: Math.abs(cv - cvCalc) <= TOLERANCE,
    differenceOk: Math.abs(difference) <= TOLERANCE,
    goodsRule: currency === 'USD' ? '(Item price + other cost) × Kurs NDPBM' : 'Item price × Kurs BI',
    term: String(rec?.delivery_term || '').toUpperCase().trim(),
  }
}

export type CourierDutyRow = { key: 'bm' | 'ppn' | 'pph' | 'adm'; label: string; rate: number | null; calculated: number | null; amount: number; diff: number | null; status: 'match' | 'differs' | 'derived' | 'na' }

// BM% = BM ÷ customs value (tidak ada kolom persen BM — sama keputusan Sea & Air). PPN/PPh % di
// Courier DIHITUNG OTOMATIS dari nilai ÷ import value (auto-calc) -> status "Derived"; baru jadi
// pembanding sungguhan kalau persennya diisi manual (ada di `manual_override_fields`). Persen
// tersimpan sbg pecahan (0,11) -> normPct. CN: Admin penalty (`sanksi_adm`) ikut Total PIB/CN.
export function computeCourierDutyRows(rec: any, t: CourierDocType) {
  const overrides = new Set<string>(Array.isArray(rec?.manual_override_fields) ? rec.manual_override_fields : [])
  const cv = n(rec?.total_nilai_pabean)
  const bm = n(rec?.bm)
  const importValueCalc = cv + bm
  const importValueStored = rec?.total_nilai_pabean_bm === null || rec?.total_nilai_pabean_bm === undefined || rec?.total_nilai_pabean_bm === '' ? null : n(rec.total_nilai_pabean_bm)
  const base = importValueStored ?? importValueCalc
  const mk = (key: 'ppn' | 'pph', label: string, pctRaw: any, valueRaw: any): CourierDutyRow => {
    const rate = normPct(pctRaw)
    const amount = n(valueRaw)
    if (rate === null) return { key, label, rate, calculated: null, amount, diff: null, status: 'na' }
    if (!overrides.has(`${key}_pct`)) return { key, label, rate, calculated: amount, amount, diff: null, status: 'derived' }
    const calculated = Math.round(base * rate / 100)
    const diff = amount - calculated
    return { key, label, rate, calculated, amount, diff, status: Math.abs(diff) <= TOLERANCE ? 'match' : 'differs' }
  }
  const rows: CourierDutyRow[] = [
    { key: 'bm', label: 'Bea masuk (BM)', rate: cv > 0 ? Math.round((bm / cv) * 10000) / 100 : null, calculated: bm, amount: bm, diff: null, status: 'derived' },
    mk('ppn', 'PPN impor', rec?.ppn_pct, rec?.ppn_nilai),
    mk('pph', 'PPh 22 impor', rec?.pph_pct, rec?.pph_nilai),
  ]
  if (t === 'CN') rows.push({ key: 'adm', label: 'Admin penalty (sanksi adm.)', rate: null, calculated: null, amount: n(rec?.sanksi_adm), diff: null, status: 'na' })
  const sum = rows.reduce((s, r) => s + r.amount, 0)
  const total = n(rec?.total_pib_cn)
  const invoiceDuty = rec?.total_inv_duty === null || rec?.total_inv_duty === undefined || rec?.total_inv_duty === '' ? null : n(rec.total_inv_duty)
  return {
    rows, cv, importValueCalc, importValueStored,
    importValueMatches: importValueStored === null ? null : Math.abs(importValueStored - importValueCalc) <= TOLERANCE,
    sum, total, totalMatches: Math.abs(total - sum) <= TOLERANCE,
    invoiceDuty, invoiceDutyMatches: invoiceDuty === null ? null : Math.abs(invoiceDuty - total) <= TOLERANCE,
  }
}

// ─── Ringkasan KPI ────────────────────────────────────────────────────────────
export type CourierAuditFilters = { importAn: string; startDate: string; endDate: string; search: string; searchColsPib: string[]; searchColsCn: string[] }
export type CourierAuditSummary = {
  total: number; draft: number; pib: number; cn: number
  cvSum: number; bmSum: number; ppnSum: number; pphSum: number; admSum: number; dutySum: number
  nasEmpty: number; nasEmptyDraft: number; nasEmptyPib: number; nasEmptyCn: number
  draftRows: any[]   // baris Draft (lengkap) -> dipakai parent utk hitung "Validation incomplete"
}

const PAGE = 1000
function applyFilters(q: any, f: CourierAuditFilters, cols: string[]) {
  if (f.importAn && f.importAn !== 'All') q = q.eq('impor_an', f.importAn)
  if (f.startDate) q = q.gte('tgl_ppjk', f.startDate)
  if (f.endDate) q = q.lte('tgl_ppjk', `${f.endDate} 23:59:59`)
  if (f.search && cols.length) q = q.or(cols.map(c => `${c}.ilike.%${f.search}%`).join(','))
  return q
}
async function fetchAllRows(table: string, f: CourierAuditFilters, cols: string[]): Promise<any[] | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await applyFilters(supabase.from(table).select('*'), f, cols).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) { console.error('[CourierAudit] ringkasan gagal', table, error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// Filter SAMA dgn daftar (Company/tanggal PPJK/search ke kolom yg diizinkan role), TANPA filter tab.
export async function fetchCourierAuditSummary(f: CourierAuditFilters): Promise<CourierAuditSummary | null> {
  const [pib, cn] = await Promise.all([fetchAllRows('tabel_audit_pib', f, f.searchColsPib), fetchAllRows('tabel_audit_cn', f, f.searchColsCn)])
  if (!pib || !cn) return null
  const s: CourierAuditSummary = { total: 0, draft: 0, pib: 0, cn: 0, cvSum: 0, bmSum: 0, ppnSum: 0, pphSum: 0, admSum: 0, dutySum: 0, nasEmpty: 0, nasEmptyDraft: 0, nasEmptyPib: 0, nasEmptyCn: 0, draftRows: [] }
  const add = (r: any, t: CourierDocType) => {
    const row = { ...r, jenis_dokumen: t }
    Object.assign(row, computeCourierAuditCalc(row, t, row.manual_override_fields))
    s.total++
    const draft = isCourierDraft(row)
    if (draft) { s.draft++; s.draftRows.push(row) } else if (t === 'PIB') s.pib++; else s.cn++
    s.cvSum += n(row.total_nilai_pabean)
    s.bmSum += n(row.bm); s.ppnSum += n(row.ppn_nilai); s.pphSum += n(row.pph_nilai)
    if (t === 'CN') s.admSum += n(row.sanksi_adm)
    s.dutySum += n(row.total_pib_cn)
    if (row.tgl_submit_nas === null || row.tgl_submit_nas === undefined || row.tgl_submit_nas === '') {
      s.nasEmpty++
      if (draft) s.nasEmptyDraft++; else if (t === 'PIB') s.nasEmptyPib++; else s.nasEmptyCn++
    }
  }
  pib.forEach(r => add(r, 'PIB'))
  cn.forEach(r => add(r, 'CN'))
  return s
}

// ─── Audit trail (v_audit_trail, trigger fn_audit_pib/cn) ─────────────────────
export type CourierAuditLogEntry = { at: string; who: string; what: string; detail: string }
const quote = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`

export async function fetchCourierAuditLog(rec: any, t: CourierDocType): Promise<CourierAuditLogEntry[]> {
  const entries: CourierAuditLogEntry[] = []
  if (rec?.awb) {
    const { data, error } = await supabase.from('v_audit_trail')
      .select('created_at, user_email, action, deskripsi, catatan')
      .eq('tabel', courierTableOf(t))
      .or(`awb.eq.${quote(rec.awb)}`)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) console.error('[CourierAudit] log gagal', error)
    ;(data || []).forEach((r: any) => {
      const act = String(r.action || '').toUpperCase()
      const what = act === 'INSERT' ? 'Created' : act === 'DELETE' ? 'Deleted' : act === 'UPDATE' ? 'Updated' : (r.action || 'Changed')
      const cat = String(r.catatan || '')
      // Isi `catatan` dari trigger = dump mentah -> hanya format app ("— Lama:") yg ditampilkan.
      const detail = cat.includes('— Lama:') ? cat : (r.deskripsi || (act === 'UPDATE' ? `${t} record updated` : ''))
      entries.push({ at: r.created_at, who: r.user_email || 'System', what, detail })
    })
  }
  if (rec?.created_at) entries.push({ at: rec.created_at, who: 'System', what: 'Recorded', detail: `${t} record created` })
  return entries
}

// ─── Badge sidebar Draft ──────────────────────────────────────────────────────
export const COURIER_AUDIT_CHANGED_EVENT = 'beehive:courier-audit-changed'
export const notifyCourierAuditChanged = () => {
  try { window.dispatchEvent(new Event(COURIER_AUDIT_CHANGED_EVENT)) } catch { /* abaikan */ }
}
export async function fetchCourierDraftCount(): Promise<number | null> {
  const [a, b] = await Promise.all([
    supabase.from('tabel_audit_pib').select('id', { count: 'exact', head: true }).eq('status', COURIER_STATUS_DRAFT),
    supabase.from('tabel_audit_cn').select('id', { count: 'exact', head: true }).eq('status', COURIER_STATUS_DRAFT),
  ])
  if (a.error || b.error) return null
  return (a.count ?? 0) + (b.count ?? 0)
}
