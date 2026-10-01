// Form "Edit shipment" Invoice Recap Sea & Air (2026-10-01). Field = kolom yang SUDAH bisa diedit
// lewat edit inline tabel lama (isInlineEditable) -- `emkl_vendor` TETAP read-only (dikecualikan di
// tabel lama juga), kolom *_split diedit lewat mode List. Simpan = parent memanggil
// `handleInlineSaveRow` lama (rekapan_seaair .update; `cbm` diarahkan ke tabel_audit_seaair).
// Hanya field yang BERUBAH yang dikirim.
// Bagian 2 (sql/031): field "Submitted to Finance" DIHAPUS (submit lewat tombol, unlock khusus Admin);
// data manual per PO (KG / valas / Partial) disimpan ke `po_manual` -- terpisah dari `po_detail`
// yang ditulis AI -- dan hanya tampil kalau kolom itu sudah ada (sql/031 sudah dijalankan).
// Menyimpan perubahan apa pun mengembalikan PIB terkait ke Draft utk re-audit (trigger DB).
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { SA_CARD, SA_INPUT, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY } from './SeaAirAuditUi'
import { RECAP_SEGMENTS, hasPoManualColumn, parsePoManual, poManualFor, poKey, type PoManualEntry } from '../utils/SeaAirRecapHelpers'

const TEXT = ['vendor', 'no_invoice', 'a_n', 'shipment_type', 'container_type', 'origin', 'destination', 'notes',
  'freight_vendor', 'pbm_vendor', 'lift_off_vendor', 'inspeksi_vendor', 'handling_vendor', 'other_vendor'] as const
const NUMS = ['container_count', 'weight_kg', 'cbm', 'total_invoice', 'total_keseluruhan_biaya', 'duty_total', 'bm', 'ppn', 'pph',
  'emkl_biaya', 'biaya_origin', 'biaya_destination', 'pbm_biaya', 'lift_off_biaya', 'inspeksi_biaya', 'handling_biaya', 'other_biaya'] as const
const DATES = ['tgl', 'etd', 'eta', 'atd', 'ata'] as const

const toStr = (v: any) => (v === null || v === undefined ? '' : String(v))
const toNumOrNull = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

type ManualRow = { kg: string; valas: string; currency: string; partial: boolean; partial_no: string }
const toManualRow = (m: PoManualEntry | null): ManualRow => ({
  kg: toStr(m?.kg), valas: toStr(m?.valas), currency: toStr(m?.currency), partial: !!m?.partial, partial_no: toStr(m?.partial_no),
})
// Bentuk kanonik (kunci urut, entri kosong dibuang) supaya perbandingan "berubah?" tidak tertipu urutan kunci.
const canonPoManual = (map: Record<string, PoManualEntry>) => {
  const out: Record<string, PoManualEntry> = {}
  Object.keys(map).sort().forEach(k => {
    const m = map[k] || {}
    const e: PoManualEntry = {}
    if (m.kg !== null && m.kg !== undefined && (m.kg as any) !== '') e.kg = Number(m.kg)
    if (m.valas !== null && m.valas !== undefined && (m.valas as any) !== '') e.valas = Number(m.valas)
    if (m.currency) e.currency = String(m.currency)
    if (m.partial) e.partial = true
    if (m.partial && m.partial_no !== null && m.partial_no !== undefined && (m.partial_no as any) !== '') e.partial_no = Number(m.partial_no)
    if (Object.keys(e).length) out[k.trim()] = e
  })
  return out
}

const F: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="text-[11.5px] font-semibold text-[#3B1B3D]">{label}</span>
    {children}
  </label>
)

export default function SeaAirRecapEditModal({ rec, onClose, onSave }: {
  rec: any
  onClose: () => void
  onSave: (changes: Record<string, any>) => Promise<boolean>
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {}
    ;[...TEXT, ...NUMS].forEach(k => { f[k] = toStr(rec[k]) })
    DATES.forEach(k => { f[k] = rec[k] ? String(rec[k]).substring(0, 10) : '' })
    return f
  })
  const rawPoDetail: any[] = (() => {
    try {
      if (Array.isArray(rec.po_detail)) return rec.po_detail
      if (typeof rec.po_detail === 'string' && rec.po_detail.trim()) { const p = JSON.parse(rec.po_detail); return Array.isArray(p) ? p : [] }
    } catch { /* abaikan */ }
    return []
  })()
  const [pos, setPos] = useState(() => rawPoDetail.map((p: any) => ({ ...p })))
  const manualEnabled = hasPoManualColumn(rec)
  const origManual = parsePoManual(rec)
  const [manual, setManual] = useState<ManualRow[]>(() => rawPoDetail.map((p: any) => toManualRow(poManualFor(origManual, p?.po_no))))
  const setM = (i: number, patch: Partial<ManualRow>) => setManual(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const splitWeightEvenly = () => {
    const w = toNumOrNull(form.weight_kg || '')
    if (w === null || pos.length === 0) return
    const each = Math.round((w / pos.length) * 100) / 100
    // sisa pembulatan masuk PO terakhir supaya jumlahnya persis = berat shipment
    const last = Math.round((w - each * (pos.length - 1)) * 100) / 100
    setManual(prev => prev.map((x, i) => ({ ...x, kg: String(i === pos.length - 1 ? last : each) })))
  }
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const input = (k: string, type: 'text' | 'number' | 'date' = 'text') => (
    <input type={type} step={type === 'number' ? 'any' : undefined} value={form[k]} onChange={e => set(k, e.target.value)}
      className={`${SA_INPUT} ${type === 'number' ? 'text-right tabular-nums' : ''}`} />
  )

  const handleSave = async () => {
    setErr(null)
    const changes: Record<string, any> = {}
    for (const k of NUMS) {
      if (form[k] !== '' && toNumOrNull(form[k]) === null) { setErr(`"${k}" must be a number.`); return }
      const v = toNumOrNull(form[k])
      const o = rec[k] === null || rec[k] === undefined || rec[k] === '' ? null : Number(rec[k])
      if (v !== o) changes[k] = v
    }
    TEXT.forEach(k => {
      const v = form[k].trim() === '' ? null : form[k].trim()
      const o = rec[k] === null || rec[k] === undefined || String(rec[k]).trim() === '' ? null : String(rec[k]).trim()
      if (v !== o) changes[k] = v
    })
    DATES.forEach(k => {
      const v = form[k] || null
      const o = rec[k] ? String(rec[k]).substring(0, 10) : null
      if (v !== o) changes[k] = v
    })
    if (JSON.stringify(pos) !== JSON.stringify(rawPoDetail)) changes.po_detail = pos
    if (manualEnabled) {
      const built: Record<string, PoManualEntry> = {}
      for (let i = 0; i < pos.length; i++) {
        const m = manual[i]
        if (!m) continue
        const key = String(pos[i]?.po_no ?? '').trim()
        const filled = m.kg.trim() || m.valas.trim() || m.currency.trim() || m.partial
        if (!filled) continue
        if (!key) { setErr(`PO #${i + 1}: fill in the PO number before entering KG / valas / partial.`); return }
        for (const [label, v] of [['KG', m.kg], ['Valas', m.valas], ['Partial no.', m.partial_no]] as const) {
          if (v.trim() !== '' && toNumOrNull(v) === null) { setErr(`PO ${key}: "${label}" must be a number.`); return }
        }
        if (built[key] || Object.keys(built).some(k => poKey(k) === poKey(key))) { setErr(`PO ${key} appears twice — KG / valas per PO needs unique PO numbers.`); return }
        built[key] = {
          kg: toNumOrNull(m.kg), valas: toNumOrNull(m.valas), currency: m.currency.trim().toUpperCase() || null,
          partial: m.partial, partial_no: m.partial ? toNumOrNull(m.partial_no) : null,
        }
      }
      const next = canonPoManual(built)
      if (JSON.stringify(next) !== JSON.stringify(canonPoManual(origManual))) changes.po_manual = next
    }
    if (Object.keys(changes).length === 0) { onClose(); return }
    setSaving(true)
    const ok = await onSave(changes)
    setSaving(false)
    if (!ok) setErr('Failed to save — see the message shown.')
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <div>
            <h2 className="text-[17px] font-bold text-[#3B1B3D]">Edit shipment</h2>
            <div className="text-[12px] text-[#6E5E70]">{rec.awb || '—'}</div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
          <div className={`${SA_CARD} p-4`}>
            <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-3">Shipment</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <F label="Recap date">{input('tgl', 'date')}</F>
              <F label="Supplier (goods)" className="md:col-span-2">{input('vendor')}</F>
              <F label="Invoice no">{input('no_invoice')}</F>
              <F label="Company (A/N)">{input('a_n')}</F>
              <F label="Shipment type">
                <select value={form.shipment_type} onChange={e => set('shipment_type', e.target.value)} className={SA_INPUT}>
                  <option value="">—</option>
                  {Array.from(new Set(['FCL', 'LCL', 'AIR', ...(form.shipment_type ? [form.shipment_type] : [])])).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="Qty container">{input('container_count', 'number')}</F>
              <F label="Container type">{input('container_type')}</F>
              <F label="Weight (kg)">{input('weight_kg', 'number')}</F>
              <F label="CBM">{input('cbm', 'number')}</F>
              <F label="Origin">{input('origin')}</F>
              <F label="Destination">{input('destination')}</F>
              <F label="ETD">{input('etd', 'date')}</F>
              <F label="ETA">{input('eta', 'date')}</F>
              <F label="ATD">{input('atd', 'date')}</F>
              <F label="ATA">{input('ata', 'date')}</F>
              <F label="Notes (AI note)" className="md:col-span-4">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${SA_INPUT} h-auto py-2 resize-y`} />
              </F>
            </div>
          </div>

          <div className={`${SA_CARD} p-4`}>
            <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-3">Invoices</h3>
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 items-center">
              <span className={SA_LABEL}>Service</span><span className={SA_LABEL}>Vendor</span><span className={`${SA_LABEL} text-right`}>Amount (Rp)</span>
              {RECAP_SEGMENTS.map(s => (
                <React.Fragment key={s.key}>
                  <span className="text-[12.5px] font-semibold text-[#3B1B3D]">{s.label}</span>
                  {s.vendorCol === 'emkl_vendor'
                    ? <div className={`${SA_INPUT} flex items-center bg-[#F6EFEA] text-[#6E5E70]`} title="EMKL vendor is not editable (same as the table view)">{rec.emkl_vendor || '—'}</div>
                    : s.key === 'fd' ? <div className="text-[11.5px] text-[#8A7A8B]">same as Freight origin vendor</div>
                    : input(s.vendorCol)}
                  {input(s.costCol, 'number')}
                </React.Fragment>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <F label="Total invoice (Rp)">{input('total_invoice', 'number')}</F>
              <F label="Grand total (Rp)">{input('total_keseluruhan_biaya', 'number')}</F>
              <F label="Duty total (Rp)">{input('duty_total', 'number')}</F>
              <F label="BM total (Rp)">{input('bm', 'number')}</F>
              <F label="PPN total (Rp)">{input('ppn', 'number')}</F>
              <F label="PPh total (Rp)">{input('pph', 'number')}</F>
            </div>
            <div className="text-[11px] text-[#8A7A8B] mt-2">Per-PO split amounts are edited in the List view.</div>
          </div>

          <div className={`${SA_CARD} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-[14px] font-bold text-[#3B1B3D]">PO &amp; vessel</h3>
                {manualEnabled && pos.length > 0 && <div className="text-[11.5px] text-[#6E5E70]">KG per PO is used to split costs by weight (all POs must have KG). Mark a PO as partial when only part of it ships here.</div>}
              </div>
              {manualEnabled && pos.length > 1 && (
                <button type="button" className={SA_BTN_OUTLINE} onClick={splitWeightEvenly} disabled={toNumOrNull(form.weight_kg || '') === null}
                  title={toNumOrNull(form.weight_kg || '') === null ? 'Fill in Weight (kg) first' : 'Divide the shipment weight evenly across the POs (saved only when you click Save changes)'}>
                  Split weight evenly
                </button>
              )}
            </div>
            {pos.length === 0 ? (
              <div className="text-[12.5px] text-[#6E5E70]">No PO recorded for this shipment.</div>
            ) : (
              <div className="overflow-x-auto">
                <div className={`grid gap-2 items-center ${manualEnabled ? 'grid-cols-[24px_minmax(150px,1.3fr)_minmax(120px,1fr)_90px_110px_70px_minmax(110px,auto)] min-w-[760px]' : 'grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)]'}`}>
                  <span /><span className={SA_LABEL}>PO no.</span><span className={SA_LABEL}>Vessel</span>
                  {manualEnabled && <><span className={`${SA_LABEL} text-right`}>KG</span><span className={`${SA_LABEL} text-right`}>Valas</span><span className={SA_LABEL}>Cur.</span><span className={SA_LABEL}>Partial</span></>}
                  {pos.map((p: any, i: number) => (
                    <React.Fragment key={i}>
                      <span className="text-[12px] text-[#8A7A8B] text-center">{i + 1}</span>
                      <input value={p.po_no ?? ''} onChange={e => setPos(prev => prev.map((x: any, j: number) => j === i ? { ...x, po_no: e.target.value } : x))} className={SA_INPUT} />
                      <input value={p.vessel ?? ''} onChange={e => setPos(prev => prev.map((x: any, j: number) => j === i ? { ...x, vessel: e.target.value } : x))} className={SA_INPUT} />
                      {manualEnabled && manual[i] && (
                        <>
                          <input type="number" step="any" aria-label={`KG PO ${i + 1}`} value={manual[i].kg} onChange={e => setM(i, { kg: e.target.value })} className={`${SA_INPUT} text-right tabular-nums`} />
                          <input type="number" step="any" aria-label={`Valas PO ${i + 1}`} value={manual[i].valas} onChange={e => setM(i, { valas: e.target.value })} className={`${SA_INPUT} text-right tabular-nums`} />
                          <input aria-label={`Currency PO ${i + 1}`} value={manual[i].currency} placeholder="USD" maxLength={5} onChange={e => setM(i, { currency: e.target.value.toUpperCase() })} className={SA_INPUT} />
                          <div className="flex items-center gap-1.5">
                            <label className="inline-flex items-center gap-1 text-[12px] text-[#3B1B3D] cursor-pointer">
                              <input type="checkbox" checked={manual[i].partial} onChange={e => setM(i, { partial: e.target.checked })} className="accent-[#6B3470]" /> Partial
                            </label>
                            {manual[i].partial && <input type="number" min={1} aria-label={`Partial no PO ${i + 1}`} placeholder="#" value={manual[i].partial_no} onChange={e => setM(i, { partial_no: e.target.value })} className={`${SA_INPUT} w-14 text-right`} />}
                          </div>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {manualEnabled && (() => {
                  const kgs = manual.slice(0, pos.length).map(m => toNumOrNull(m.kg))
                  const w = toNumOrNull(form.weight_kg || '')
                  if (!kgs.some(k => k !== null)) return null
                  const sum = Math.round(kgs.reduce<number>((a, b) => a + (b || 0), 0) * 100) / 100
                  const ok = w !== null && Math.abs(sum - w) < 0.01 && kgs.every(k => k !== null)
                  return (
                    <div className={`mt-2 text-[11.5px] font-semibold ${ok ? 'text-[#17663D]' : 'text-[#7A4F00]'}`}>
                      Total {sum.toLocaleString('en-US')} kg{w !== null ? (ok ? ' = shipment weight ✓' : ` · shipment weight ${w.toLocaleString('en-US')} kg`) : ''}{kgs.some(k => k === null) ? ' · some POs have no KG yet (split stays even)' : ''}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-[#EADFD6] shrink-0">
          {err ? <span className="mr-auto text-[12px] text-[#A8231A] font-semibold">{err}</span>
            : manualEnabled && rec.seaair_id ? <span className="mr-auto text-[11.5px] text-[#6E5E70]">If the linked PIB is already audited, saving moves it back to Draft for re-audit.</span> : null}
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
