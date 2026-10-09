// Section "Total" Courier -- Invoice Freight / Invoice Duty / Grand Total (2026-10-09, keputusan user; referensi
// section_total_duty.html). SATU-SATUNYA rumus: dipakai tab Invoices panel Validation (Invoice Recap) dan tab Invoices
// Finance Handover. Hasil n8n TIDAK diubah (n8n selalu menyalin BM+PPN+PPh dari PIB/SPPBMCP ke `total_duty_tax` baris Duty
// dan `total_amount` = adm fee + pajak), jadi angka invoice yang sebenarnya diturunkan di sini:
//   Invoice Freight = total_amount − total_duty_tax
//   Invoice Duty    = courier_adm_fee + import_export_duties_idr (hasil ekstraksi Gemini di
//                     dokumen_validasi.data_validasi_raw › invoice_duty_cost; kosong/0 -> adm fee saja)
//   Grand Total     = Freight + Duty − Credit Note. BM/PPN/PPh hanya rincian abu-abu, TIDAK pernah dijumlah.
// AWB yang SUDAH dikirim ke Finance (ada invoice ber-submit_date) TIDAK diubah angkanya (rumus lama = total_amount), hanya
// label; "Needs check" tetap dihitung sebagai info. Data tidak ada / belum terbaca / tanpa nomor AWB -> TIDAK ditebak:
// angka baris Duty memakai nilai lama + "Needs check" (AWB belum dikirim: Submit terkunci sampai Internal remarks terisi).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { courierAwbNorm, invoiceAmount, invoiceKind, type RecapAuditLink, type RecapGroup } from './CourierRecapHelpers'

export const COURIER_DUTY_TOLERANCE = 3000 // selisih pembulatan duty tax (SAMA toleransi duty Sea & Air)

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'
const normNo = (v: any) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ─── Data mentah invoice duty (dokumen_validasi) ─────────────────────────────────────────────────
export type DutyRawReason = 'no_link' | 'no_doc' | 'no_duty_cost' | 'error'
export type DutyRaw =
  | { state: 'idle' }                                         // tidak perlu dibaca (tidak ada invoice duty)
  | { state: 'loading' }
  | { state: 'ok'; dutyLine: number | null; invoiceNo: string | null }
  | { state: 'missing'; reason: DutyRawReason }

export async function fetchCourierDutyRaw(audit: RecapAuditLink | null): Promise<DutyRaw> {
  if (!audit) return { state: 'missing', reason: 'no_link' }
  const col = audit.docType === 'CN' ? 'cn_id' : 'pib_id'
  const { data, error } = await supabase.from('dokumen_validasi').select('data_validasi_raw').eq(col, audit.rec.id)
  if (error) { console.warn('[CourierTotal] dokumen_validasi tidak terbaca', error.message); return { state: 'missing', reason: 'error' } }
  if (!data || data.length === 0) return { state: 'missing', reason: 'no_doc' }
  for (const d of data as any[]) {
    let raw: any = d.data_validasi_raw
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = null } }
    const cost = raw?.invoice_duty_cost
    if (cost && typeof cost === 'object' && !Array.isArray(cost)) {
      const line = cost.import_export_duties_idr
      return { state: 'ok', dutyLine: hasVal(line) ? num(line) : null, invoiceNo: hasVal(raw?.invoice_duty_v?.no_invoice) ? String(raw.invoice_duty_v.no_invoice) : null }
    }
  }
  return { state: 'missing', reason: 'no_duty_cost' }
}

// `enabled` = AWB punya baris Duty (kalau tidak, data mentah tidak dibutuhkan). Dibaca ulang kalau pasangan Audit berganti.
export function useCourierDutyRaw(audit: RecapAuditLink | null, enabled: boolean): DutyRaw {
  const auditId = audit ? `${audit.docType}:${audit.rec?.id}` : ''
  const [raw, setRaw] = useState<DutyRaw>(enabled ? { state: 'loading' } : { state: 'idle' })
  useEffect(() => {
    if (!enabled) { setRaw({ state: 'idle' }); return }
    let alive = true
    setRaw({ state: 'loading' })
    fetchCourierDutyRaw(audit).then(r => { if (alive) setRaw(r) }).catch(e => {
      console.warn('[CourierTotal] gagal membaca invoice duty', e)
      if (alive) setRaw({ state: 'missing', reason: 'error' })
    })
    return () => { alive = false }
  }, [auditId, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return raw
}

// ─── Hasil perhitungan ───────────────────────────────────────────────────────────────────────────
export type CheckCode = 'no_awb' | 'no_link' | 'unread' | 'multi_unmatched' | 'pib_with_tax' | 'cn_without_tax'
export type TotalMode = 'included' | 'self' | 'none' | 'legacy' | 'unknown'
export type TotalRowView = { row: any; label: string; amount: number; cn: boolean; kindIndex: number }
export type TotalBreakdown = {
  frozen: boolean                 // sudah dikirim ke Finance -> angka lama
  loading: boolean
  mode: TotalMode                 // included = duty tax di Invoice Duty; self = dibayar sendiri; none = belum ada invoice duty
  rows: TotalRowView[]
  hasDutyRow: boolean
  adm: number                     // Courier adm fee baris Duty (rincian abu-abu mode included)
  bm: number; ppn: number; pph: number; taxSum: number
  dutyLine: number | null         // import_export_duties_idr
  dutyCounted: number             // duty tax yang ikut Grand Total (included: baris duty; selain itu 0)
  selisih: number | null          // dutyLine − (BM+PPN+PPh), hanya mode included
  checks: CheckCode[]
  needsCheck: boolean
  grandTotal: number
}

export const CHECK_MESSAGE: Record<CheckCode, string> = {
  no_awb: 'These invoices have no AWB number.',
  no_link: 'No PIB / CN record is linked to this AWB, so the Invoice Duty content cannot be read.',
  unread: 'The Invoice Duty content has not been read yet (no extracted data).',
  multi_unmatched: 'There is more than one Invoice Duty and none matches the extracted invoice number.',
  pib_with_tax: 'Jalur PIB, but the Invoice Duty contains duty tax (normally paid separately).',
  cn_without_tax: 'Jalur CN, but the Invoice Duty has no duty tax line (normally paid by the PPJK).',
}

const KIND_ORDER: Record<string, number> = { 'Invoice Freight': 0, 'Invoice Duty': 1, 'Credit Note Freight': 2, 'Credit Note Duty': 3 }
export const courierTotalLabel = (r: any): string => {
  const k = invoiceKind(r)
  if (k === 'freight') return 'Invoice Freight'
  if (k === 'duty') return 'Invoice Duty'
  return /DUTY/i.test(String(r?.invoice_type || '')) ? 'Credit Note Duty' : 'Credit Note Freight'
}

export function courierTotalBreakdown(g: RecapGroup, raw: DutyRaw, audit: RecapAuditLink | null = g.audit): TotalBreakdown {
  const frozen = g.submitted > 0
  const dutyRows = g.byKind.duty
  const hasDutyRow = dutyRows.length > 0
  const checks: CheckCode[] = []
  if (g.key.startsWith('ID:') || !courierAwbNorm(g.awbRaw)) checks.push('no_awb')

  // ── Baris Duty: dibaca dari invoice (hanya kalau datanya ada & jelas). ──
  let dutyLine: number | null = null
  let readOk = false
  const dutyPart = new Map<string, boolean>() // id baris Duty -> memuat baris duty tax invoice
  const loading = hasDutyRow && raw.state === 'loading'
  if (hasDutyRow) {
    if (raw.state === 'ok') {
      if (dutyRows.length === 1) { readOk = true; dutyLine = raw.dutyLine ?? 0; dutyPart.set(String(dutyRows[0].id), true) }
      else {
        const m = raw.invoiceNo ? dutyRows.find(r => normNo(r.no_invoice) && normNo(r.no_invoice) === normNo(raw.invoiceNo)) : undefined
        if (m) { readOk = true; dutyLine = raw.dutyLine ?? 0; dutyRows.forEach(r => dutyPart.set(String(r.id), r === m)) }
        else checks.push('multi_unmatched')
      }
    } else if (raw.state === 'missing') {
      checks.push(!audit || raw.reason === 'no_link' ? 'no_link' : 'unread')
    }
  }

  // ── Rincian pajak (abu-abu): SATU sumber per AWB (n8n menyalin pajak PIB ke tiap baris Duty -> jangan dijumlah). ──
  const taxOf = (r: any) => ({ bm: num(r.bm), ppn: num(r.ppn), pph: num(r.pph) })
  const taxSource = [...dutyRows, ...g.byKind.freight].find(r => { const t = taxOf(r); return t.bm + t.ppn + t.pph > 0 })
  const tax = taxSource ? taxOf(taxSource) : { bm: 0, ppn: 0, pph: 0 }
  const taxSum = tax.bm + tax.ppn + tax.pph
  const included = readOk && (dutyLine ?? 0) > 0

  // ── Cek silang dengan jalur (PIB / CN). ──
  if (readOk && audit) {
    if (included && audit.docType === 'PIB') checks.push('pib_with_tax')
    if (!included && audit.docType === 'CN') checks.push('cn_without_tax')
  }

  const mode: TotalMode = frozen ? 'legacy' : !hasDutyRow ? 'none' : readOk ? (included ? 'included' : 'self') : 'unknown'
  const adm = dutyRows.reduce((s, r) => s + num(r.courier_adm_fee), 0)

  // ── Nominal per baris. ──
  const rows: TotalRowView[] = g.rows.map(r => {
    const label = courierTotalLabel(r)
    const k = invoiceKind(r)
    let amount = invoiceAmount(r) // angka lama (total_amount; Credit Note positif)
    if (!frozen) {
      if (k === 'freight') amount = invoiceAmount(r) - num(r.total_duty_tax)
      else if (k === 'duty' && readOk) amount = num(r.courier_adm_fee) + (dutyPart.get(String(r.id)) ? (dutyLine ?? 0) : 0)
    }
    return { row: r, label, amount, cn: k === 'cn', kindIndex: KIND_ORDER[label] }
  }).sort((a, b) => a.kindIndex - b.kindIndex)

  const grandTotal = rows.reduce((s, x) => s + (x.cn ? -x.amount : x.amount), 0)
  const selisih = mode === 'included' ? (dutyLine ?? 0) - taxSum : null
  return {
    frozen, loading, mode, rows, hasDutyRow, adm, ...tax, taxSum, dutyLine,
    dutyCounted: mode === 'included' ? (dutyLine ?? 0) : 0,
    selisih, checks, needsCheck: checks.length > 0, grandTotal,
  }
}

// Submit to Finance terkunci (frontend saja): AWB belum dikirim yang "Needs check" sampai Internal remarks (`keterangan`)
// terisi pada salah satu invoice AWB itu; juga selama data invoice duty masih dimuat.
export function courierSubmitLock(bd: TotalBreakdown, rows: any[]): 'loading' | 'needs_remarks' | null {
  if (bd.frozen) return null
  if (bd.loading) return 'loading'
  if (bd.needsCheck && !rows.some(r => hasVal(r.keterangan))) return 'needs_remarks'
  return null
}

// Simpan Internal remarks (rekapan_courier.keterangan) ke semua invoice AWB yang BELUM di-Submit (yang sudah Submit terkunci sql/038).
export async function saveInternalRemarks(rows: any[], text: string): Promise<{ ok: boolean; error?: string }> {
  const ids = rows.filter(r => !r.submit_date).map(r => r.id)
  if (ids.length === 0) return { ok: false, error: 'All invoices are already submitted.' }
  const value = text.trim() === '' ? null : text.trim()
  const { error } = await supabase.from('rekapan_courier').update({ keterangan: value }).in('id', ids)
  return error ? { ok: false, error: error.message } : { ok: true }
}
