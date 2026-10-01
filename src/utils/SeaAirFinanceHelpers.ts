// Finance Handover Sea & Air (2026-10-01) -- SATU sumber tahap/filter/RPC halaman /sea-air/finance.
// Spek V167: 1 handover per BL/AWB, dibayar ke PPJK (`emkl_vendor`), semua invoice pengiriman
// (landed cost = invoice saja, `computeLandedCost`), TANPA duty & tax. Alur Sent -> Received -> Paid.
// Tulis HANYA lewat RPC sql/034 (baris yg sudah submit TERKUNCI utk UPDATE langsung, trigger sql/031).
import { supabase } from '../lib/supabase'
import { computeLandedCost } from './SeaAirRecapHelpers'

export type FinanceStage = 'waiting' | 'received' | 'paid'
export type FinanceTab = FinanceStage | 'all'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== ''

export function financeStage(rec: any): FinanceStage {
  if (hasVal(rec?.paid_date)) return 'paid'
  if (hasVal(rec?.finance_received_at)) return 'received'
  return 'waiting'
}

export const FINANCE_STAGE_LABEL: Record<FinanceStage, string> = {
  waiting: 'Waiting for Finance',
  received: 'Received · unpaid',
  paid: 'Paid',
}

// Kolom sql/034 sudah ada? (baris `select('*')` membawa key-nya walau null). Tanpa baris -> probe.
export async function probeFinanceColumns(sample?: any): Promise<boolean> {
  if (sample) return Object.prototype.hasOwnProperty.call(sample, 'finance_received_at')
  const { error } = await supabase.from('rekapan_seaair').select('finance_received_at').limit(1)
  return !error
}

const PAGE = 1000
// Semua shipment yang SUDAH Submit to Finance (urut tanggal submit terbaru). Jumlahnya wajar (hanya
// yg sudah submit), filter tab/search/company dilakukan di browser supaya angka kotak selalu sinkron.
export async function fetchFinanceRows(): Promise<any[] | null> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('rekapan_seaair').select('*')
      .not('tgl_submit_finance', 'is', null)
      .order('tgl_submit_finance', { ascending: false }).order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[SeaAirFinance] fetch gagal', error); return null }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export const financeAmount = (rec: any) => computeLandedCost(rec).landed

export function matchesFinanceSearch(rec: any, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return ['awb', 'no_invoice', 'vendor', 'emkl_vendor', 'a_n', 'paid_reference'].some(k => String(rec?.[k] ?? '').toLowerCase().includes(s))
}

export async function financeAccept(id: any) {
  return supabase.rpc('fn_seaair_finance_accept', { p_rekapan_id: id })
}
export async function financeMarkPaid(id: any, paidDate: string, reference: string) {
  return supabase.rpc('fn_seaair_finance_mark_paid', { p_rekapan_id: id, p_paid_date: paidDate, p_reference: reference })
}
export async function financeUndo(id: any, reason: string) {
  return supabase.rpc('fn_seaair_finance_undo', { p_rekapan_id: id, p_reason: reason })
}
