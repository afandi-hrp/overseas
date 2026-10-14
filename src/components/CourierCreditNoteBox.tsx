// Kartu Credit Note di tampilan DEPAN tab Cost Validation panel Invoice Recap Courier (2026-10-14, permintaan user) --
// SALINAN form "Credit Note Freight / Duty" di jendela Details (CostValidationModalLegacy), supaya PIC tidak terlewat memotong CN.
// - Data & RPC SAMA Details: kolom tabel_cost_validasi cv_cn_<side>_subtotal/_vat/_total/_log, fn_apply_credit_note (target +
//   nominal [+ index Other charges]), fn_revise_credit_note, lalu fn_recompute_totals -> baris terbaru dikembalikan ke induk.
//   Satu data, dua tampilan: Details membaca ulang tabel saat dibuka; perubahan di Details -> panel dibaca ulang saat ditutup.
// - Baris target = syarat SAMA Details (Actual > 0; Other charges: nilai tampil = actual − adjustment, kecuali status STORAGE).
// - Validasi: nominal > 0 dan tidak boleh melebihi sisa (subtotal / VAT) CN.
// - Per baris cost hanya ada SATU agregat CN Freight & SATU CN Duty (n8n menjumlah bila >1 credit note sejenis) -> satu kartu per
//   jenis CN, nomor CN dari invoice Credit Note AWB itu (prop `cnInvoices`).
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { VW_BTN_SECONDARY, VW_INPUT } from './validationWindowStyles'
import { fmtRp } from '../utils/SeaAirAuditHelpers'
import type { CnSide, CnState } from '../utils/CourierRecapRules'

export type CnInvoiceInfo = { side: CnSide; no: string; receivedAt: string | null }
type Target = { key: string; target: string; index?: number; label: string; kind: 'subtotal' | 'vat' }

const n = (v: any) => { const x = Number(v); return isNaN(x) ? 0 : x }
const parseArr = (v: any): any[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  if (v && typeof v === 'object') return Object.values(v)
  return []
}
const fmtDay = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtDateTime = (v: any) => {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  const p2 = (x: number) => String(x).padStart(2, '0')
  // "14-October-2026, 08:57" (gaya tanggal Courier).
  return `${p2(d.getDate())}-${d.toLocaleString('en-GB', { month: 'long' })}-${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Baris Other charges yang bisa dipotong (aturan SAMA renderOtherChargesRows di Details).
function otherTargets(cv: any, side: CnSide): Target[] {
  const rows = parseArr(side === 'freight' ? cv.cv_other_charges_freight : cv.cv_other_charges_duty)
  const adjRaw = side === 'freight' ? cv.cv_other_freight_adjustments : cv.cv_other_duty_adjustments
  const adj = typeof adjRaw === 'string' ? (() => { try { return JSON.parse(adjRaw) || [] } catch { return [] } })() : (adjRaw || [])
  const out: Target[] = []
  rows.forEach((row: any, i: number) => {
    const shown = n(row?.actual) - n(adj?.[i])
    const auto = row?.expected != null ? (Math.abs(shown - n(row.expected)) <= 1000 ? 'OK' : 'SELISIH') : String(row?.status || '').toUpperCase()
    const st = row?.status_manual ? String(row?.status || '').toUpperCase() : auto
    if (st === 'STORAGE' || shown <= 0) return
    out.push({ key: `other_${side}_${i}`, target: side === 'freight' ? 'other_freight' : 'other_duty', index: i, label: row?.name || row?.surcharge_name || `Other charge #${i + 1}`, kind: 'subtotal' })
  })
  return out
}

export function cnTargets(cv: any, side: CnSide): Target[] {
  if (side === 'freight') {
    return [
      ...(n(cv.cv_freight_actual) > 0 ? [{ key: 'freight', target: 'freight', label: 'Freight Charge', kind: 'subtotal' as const }] : []),
      ...(n(cv.cv_fuel_actual) > 0 ? [{ key: 'fuel', target: 'fuel', label: 'Fuel Surcharge', kind: 'subtotal' as const }] : []),
      ...otherTargets(cv, 'freight'),
      ...(n(cv.cv_vat_freight_actual_net || cv.cv_vat_freight_actual) > 0 ? [{ key: 'vat_freight', target: 'vat_freight', label: 'VAT Freight', kind: 'vat' as const }] : []),
    ]
  }
  return [
    ...(n(cv.cv_nonroutine_actual) > 0 ? [{ key: 'nonroutine', target: 'nonroutine', label: 'Non-Routine', kind: 'subtotal' as const }] : []),
    ...(n(cv.cv_disbursement_actual) > 0 ? [{ key: 'disbursement', target: 'disbursement', label: 'Disbursement', kind: 'subtotal' as const }] : []),
    ...(n(cv.cv_processing_fee_actual) > 0 ? [{ key: 'processing_fee', target: 'processing_fee', label: 'Processing Fee', kind: 'subtotal' as const }] : []),
    ...(n(cv.cv_import_export_duties) > 0 ? [{ key: 'duties', target: 'duties', label: 'Import Export Duties', kind: 'subtotal' as const }] : []),
    ...(n(cv.cv_storage_actual) > 0 ? [{ key: 'storage', target: 'storage', label: 'Bonded Storage', kind: 'subtotal' as const }] : []),
    ...otherTargets(cv, 'duty'),
    { key: 'vat_duty', target: 'vat_duty', label: 'VAT Duty', kind: 'vat' as const },
  ]
}

const TARGET_LABEL: Record<string, string> = {
  freight: 'Freight Charge', fuel: 'Fuel Surcharge', vat_freight: 'VAT Freight', nonroutine: 'Non-Routine', disbursement: 'Disbursement',
  processing_fee: 'Processing Fee', duties: 'Import Export Duties', storage: 'Bonded Storage', vat_duty: 'VAT Duty',
}
export function cnLogTargetLabel(cv: any, side: CnSide, log: any): string {
  if (log?.target === 'other_freight' || log?.target === 'other_duty') {
    const row = parseArr(side === 'freight' ? cv?.cv_other_charges_freight : cv?.cv_other_charges_duty)[n(log.index)]
    return row?.name || row?.surcharge_name || `Other charge #${n(log.index) + 1}`
  }
  return TARGET_LABEL[log?.target] || String(log?.target || '—')
}
export const cnSideLabel = (side: CnSide) => (side === 'freight' ? 'Credit Note Freight' : 'Credit Note Duty')
export const cnNosOf = (cnInvoices: CnInvoiceInfo[], side: CnSide) => cnInvoices.filter(c => c.side === side)

// Riwayat pemotongan 1 CN (dipakai kartu & ringkasan "Show credit note").
export const CnLogList: React.FC<{ cv: any; state: CnState; canEdit?: boolean; busy?: boolean; onRevise?: (idx: number) => void }> = ({ cv, state, canEdit, busy, onRevise }) => {
  const [confirm, setConfirm] = useState<number | null>(null)
  if (state.log.length === 0) return null
  return (
    <ul className="flex flex-col gap-0.5 text-[11.5px] text-[#3B1B3D]">
      {state.log.map((log: any, idx: number) => (
        <li key={idx} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[#17663D] font-bold">✓</span>
          <span><b className="tabular-nums">{fmtRp(log.amount)}</b> deducted from <b>{cnLogTargetLabel(cv, state.side, log)}</b>
            <span className="text-[#8A7A8B]">{log.by || log.user || log.actor ? ` · ${log.by || log.user || log.actor}` : ''}{log.at || log.created_at ? ` · ${fmtDateTime(log.at || log.created_at)}` : ''}</span></span>
          {canEdit && onRevise && (confirm === idx ? (
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="text-[#7A4F00]">Revise this deduction?</span>
              <button type="button" className="font-semibold text-[#6E5E70] hover:underline" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" disabled={busy} className="font-semibold text-[#A8231A] hover:underline disabled:opacity-50" onClick={() => { setConfirm(null); onRevise(idx) }}>Revise</button>
            </span>
          ) : (
            <button type="button" disabled={busy} className="text-[11px] font-semibold text-[#6B3470] hover:underline disabled:opacity-50" onClick={() => setConfirm(idx)}>Revise</button>
          ))}
        </li>
      ))}
    </ul>
  )
}

export default function CourierCreditNoteBox({ cv, state, cnInvoices, canEdit, onApplied }: {
  cv: any
  state: CnState
  cnInvoices: CnInvoiceInfo[]
  canEdit: boolean
  onApplied: (fresh: any | null) => void // baris tabel_cost_validasi terbaru (null = baca ulang)
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const side = state.side
  const targets = cnTargets(cv, side)
  const subs = targets.filter(t => t.kind === 'subtotal')
  const vats = targets.filter(t => t.kind === 'vat')
  const mine = cnNosOf(cnInvoices, side)
  const received = mine.map(c => c.receivedAt).filter(Boolean).sort().pop()
  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500) }

  const recompute = async () => {
    const { data: recomputed, error } = await supabase.rpc('fn_recompute_totals', { p_cv_id: cv.id })
    if (error) throw error
    return (Array.isArray(recomputed) ? recomputed[0] : recomputed) || null
  }
  const apply = async (t: Target) => {
    const max = t.kind === 'vat' ? state.vat : state.subtotal
    const raw = amounts[t.key] !== undefined ? amounts[t.key] : String(max)
    const amount = Number(raw)
    if (isNaN(amount) || amount <= 0) { flash('Amount must be more than 0.', false); return }
    if (amount > max + 0.0001) { flash(`Amount cannot be more than the remaining ${t.kind === 'vat' ? 'CN VAT' : 'CN subtotal'} (${fmtRp(max)}).`, false); return }
    setBusy(true)
    try {
      const args: Record<string, any> = side === 'freight'
        ? { p_cv_id: cv.id, p_freight_target: t.target, p_freight_amount: amount, p_other_index: t.index ?? null }
        : { p_cv_id: cv.id, p_duty_target: t.target, p_duty_amount: amount, p_other_index: t.index ?? null }
      const { error } = await supabase.rpc('fn_apply_credit_note', args)
      if (error) throw error
      setAmounts(p => { const x = { ...p }; delete x[t.key]; return x })
      let fresh: any = null
      try { fresh = await recompute() } catch (e) { console.error('[CreditNoteBox] recompute gagal', e) }
      onApplied(fresh)
    } catch (e: any) {
      console.error('[CreditNoteBox] apply gagal', e)
      flash('Failed to apply the credit note: ' + (e?.message || String(e)), false)
    } finally {
      setBusy(false)
    }
  }
  const revise = async (logIndex: number) => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('fn_revise_credit_note', { p_cv_id: cv.id, p_side: side, p_log_index: logIndex })
      if (error) throw error
      let fresh: any = null
      try { fresh = await recompute() } catch (e) { console.error('[CreditNoteBox] recompute gagal', e) }
      onApplied(fresh)
    } catch (e: any) {
      flash('Failed to revise the credit note: ' + (e?.message || String(e)), false)
    } finally {
      setBusy(false)
    }
  }

  const row = (t: Target) => {
    const max = t.kind === 'vat' ? state.vat : state.subtotal
    const val = amounts[t.key] !== undefined ? amounts[t.key] : String(max)
    return (
      <div key={t.key} className="flex items-center gap-2" data-cn-target={t.key}>
        <span className="w-40 shrink-0 text-[12px] font-medium text-[#3B1B3D]">{t.label}:</span>
        <input type="number" aria-label={`${cnSideLabel(side)} amount for ${t.label}`} disabled={!canEdit || busy} value={val}
          onChange={e => setAmounts(p => ({ ...p, [t.key]: e.target.value }))} className={`${VW_INPUT} w-32 tabular-nums`} />
        {canEdit && <button type="button" className={VW_BTN_SECONDARY} disabled={busy} onClick={() => apply(t)}>Deduct</button>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2.5" data-cn-card={side}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] font-bold text-[#7A4F00]">{cnSideLabel(side)}</span>
          {mine.length > 0 && <span className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]">CN {mine.map(c => c.no).join(', ')}</span>}
          <span className="px-1.5 py-0.5 rounded-md bg-[#FFE9C2] text-[#7A4F00] text-[10px] font-bold">not allocated yet</span>
        </div>
        {received && <span className="text-[11px] font-semibold text-[#7A4F00]">CN received {fmtDay(received)}</span>}
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-3 gap-2 mb-2.5">
        <div className="bg-white border border-[#F3E2C2] rounded-lg px-2.5 py-1.5"><div className="text-[10.5px] text-[#A6772A]">Remaining CN subtotal</div><div className="text-[13px] font-bold text-[#3B1B3D] tabular-nums">{fmtRp(state.subtotal)}</div></div>
        <div className="bg-white border border-[#F3E2C2] rounded-lg px-2.5 py-1.5"><div className="text-[10.5px] text-[#A6772A]">Remaining CN VAT</div><div className="text-[13px] font-bold text-[#3B1B3D] tabular-nums">{fmtRp(state.vat)}</div></div>
        <div className="bg-white border border-[#F3E2C2] rounded-lg px-2.5 py-1.5"><div className="text-[10.5px] text-[#A6772A]">Max total (original)</div><div className="text-[13px] font-bold text-[#A8231A] tabular-nums">−{fmtRp(state.total)}</div>
          {mine.length > 1 && <div className="text-[10px] text-[#8A7A8B]">sum of {mine.length} credit notes</div>}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[11.5px] font-semibold text-[#7A4F00]">Deduct CN subtotal from:</div>
        {state.subtotal > 0
          ? (subs.length ? subs.map(row) : <div className="text-[11.5px] text-[#8A7A8B]">No cost line with an amount to deduct from.</div>)
          : <div className="text-[11.5px] font-semibold text-[#17663D]">✓ CN subtotal fully deducted.</div>}
        <div className="border-t border-[#F3E2C2] mt-1 pt-1.5 text-[11.5px] font-semibold text-[#7A4F00]">Deduct CN VAT from:</div>
        {state.vat > 0
          ? (vats.length ? vats.map(row) : <div className="text-[11.5px] text-[#8A7A8B]">No VAT line to deduct from.</div>)
          : <div className="text-[11.5px] font-semibold text-[#17663D]">✓ CN VAT fully deducted.</div>}
      </div>
      {state.log.length > 0 && (
        <div className="border-t border-[#F3E2C2] mt-2 pt-1.5">
          <div className="text-[11px] font-semibold text-[#7A4F00] mb-0.5">Deduction history</div>
          <CnLogList cv={cv} state={state} canEdit={canEdit} busy={busy} onRevise={revise} />
        </div>
      )}
      {msg && <div className={`mt-1.5 text-[11.5px] font-semibold ${msg.ok ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>{msg.text}</div>}
    </div>
  )
}
