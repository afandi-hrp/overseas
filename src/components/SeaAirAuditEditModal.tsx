// Form "Edit PIB" / "Add manually" Audit PIB Sea & Air (2026-09-30). Kolom yang ditulis SAMA
// dgn form/inline edit lama (SEA_AIR_AUDIT_COLS) lewat RPC lama `update_seaair_row` /
// `insert_seaair_row`. Hitungan "Reference"/"AUTO" di form ini HANYA pembanding -- nilai yang
// disimpan tetap yang diketik (tombol "Use" menyalin hasil hitungan kalau user mau).
// Balance & Asuransi dihitung otomatis (computeSeaAirBalanceAsuransi, rumus sama tabel lama).
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SA_INPUT, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, SA_CARD } from './SeaAirAuditUi'
import {
  fmtRp, fmtValas, fmtPctShort, parseLooseNumber, buildGoodsLines, goodsLinesToFields, computeSeaAirBalanceAsuransi,
  normPct, companyFullName, splitMoneyEvenly, SEA_AIR_STATUS_DRAFT, SEA_AIR_STATUS_AUDITED, type GoodsLine,
  fetchSeaAirAuditLinkInfo, markAuditedBlocker,
} from '../utils/SeaAirAuditHelpers'

const NUM_FIELDS = [
  'item_price', 'other_cost', 'item_price_idr', 'valas_dpp', 'kurs_ndpbm', 'total_inv_freight',
  'total_nilai_pabean', 'total_nilai_pabean_bm', 'bm', 'ppn_pct', 'ppn_nilai', 'pph_pct', 'pph_nilai',
  'total_pib', 'sptnp_total',
] as const
const TEXT_FIELDS = [
  'no_aju', 'awb', 'via', 'delivery_term', 'impor_an', 'vendor', 'hs_code', 'jenis_dokumen', 'remarks',
  'kurs', 'no_sptnp', 'notes',
] as const
const DATE_FIELDS = ['tgl_ppjk', 'tgl_sptnp'] as const

const VIA_OPTIONS = ['SEA', 'AIR']
const TERM_OPTIONS = ['FOB', 'CFR', 'CIF', 'EXW', 'FCA']
const CURRENCY_OPTIONS = ['USD', 'EUR', 'SGD', 'CNY', 'JPY', 'AUD', 'GBP', 'IDR']
const TERM_HINT: Record<string, string> = {
  FOB: 'FOB: freight and insurance are added to the goods price',
  FCA: 'FCA: freight and insurance are added to the goods price',
  EXW: 'EXW: origin costs, freight and insurance are added',
  CFR: 'CFR: freight is in the price, insurance is added',
  CIF: 'CIF: freight and insurance are already in the price',
}

const toFormStr = (v: any) => (v === null || v === undefined ? '' : String(v))
const toNumOrNull = (v: any): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, hint, className = '', children }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="text-[11.5px] font-semibold text-[#3B1B3D]">{label}</span>
    {children}
    {hint && <span className="text-[10.5px] text-[#8A7A8B]">{hint}</span>}
  </label>
)

const Segmented: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const opts = value && !options.includes(value.toUpperCase()) ? [...options, value] : options
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[#F5EDF3]">
      {opts.map(o => {
        const active = (value || '').toUpperCase() === o.toUpperCase()
        return (
          <button key={o} type="button" onClick={() => onChange(active ? '' : o)}
            className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

const Section: React.FC<{ n: number; title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ n, title, right, children }) => (
  <div className={`${SA_CARD} p-4`}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-[14px] font-bold text-[#3B1B3D]">{n} · {title}</h3>
      {right}
    </div>
    {children}
  </div>
)

const RefLine: React.FC<{ label: string; value: number | null; onUse?: () => void; tag?: string }> = ({ label, value, onUse, tag = 'AUTO' }) => (
  <div className="flex items-center justify-between gap-3 mt-2 px-3 py-2 rounded-lg bg-[#FBF7F4] text-[12px]">
    <span className="flex items-center gap-2 min-w-0">
      <span className="px-1.5 py-0.5 rounded bg-[#EEF1FA] text-[#2F4FA8] text-[10px] font-bold shrink-0">{tag}</span>
      <span className="text-[#6E5E70] truncate">{label}</span>
    </span>
    <span className="flex items-center gap-2 shrink-0">
      <b className="tabular-nums text-[#3B1B3D]">{value === null ? '—' : fmtRp(Math.round(value * 100) / 100)}</b>
      {onUse && value !== null && (
        <button type="button" onClick={onUse} className="px-2 h-6 rounded-md border border-[#EADFD6] bg-white text-[10.5px] font-semibold text-[#6B3470] hover:bg-[#F5EDF3]">Use</button>
      )}
    </span>
  </div>
)

export default function SeaAirAuditEditModal({
  record, companyNames, importAnOptions, onClose, onSaved,
}: {
  record: any | null // null = Add manually
  companyNames: Record<string, string>
  importAnOptions: string[]
  onClose: () => void
  onSaved: (id?: string | number) => void
}) {
  const isCreate = !record
  const original = record || {}
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {}
    ;[...NUM_FIELDS, ...TEXT_FIELDS].forEach(k => { f[k] = toFormStr(original[k]) })
    DATE_FIELDS.forEach(k => { f[k] = original[k] ? String(original[k]).substring(0, 10) : '' })
    if (isCreate) { f.ppn_pct = '11'; f.pph_pct = '2.5'; f.kurs = 'USD' }
    return f
  })
  const [lines, setLines] = useState<GoodsLine[]>(() => {
    const l = buildGoodsLines(original)
    return l.length > 0 ? l : [{ po: '', inv: '', amt: '' }]
  })
  const [hasSptnp, setHasSptnp] = useState<boolean>(() => !!(original.no_sptnp || original.tgl_sptnp || original.sptnp_total))
  const [saving, setSaving] = useState<'draft' | 'audited' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Gerbang "Save & mark as audited" (sql/031) -- sama aturan tombol Mark as audited di jendela Open.
  // Input manual baru belum terhubung ke Invoice Recap -> selalu Draft dulu.
  const [auditBlocker, setAuditBlocker] = useState<string | null>(isCreate ? 'Not linked to an Invoice Recap shipment' : 'Checking Invoice Recap…')
  useEffect(() => {
    if (isCreate || !record?.id) return
    let cancelled = false
    fetchSeaAirAuditLinkInfo([record.id]).then(m => { if (!cancelled) setAuditBlocker(markAuditedBlocker(m[String(record.id)])) })
    return () => { cancelled = true }
  }, [isCreate, record?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))
  const n = (k: string) => toNumOrNull(form[k]) ?? 0

  // ── Hitungan tampilan (live) ──
  const live = useMemo(() => {
    const cv = n('total_nilai_pabean')
    const bm = n('bm')
    const importValue = cv + bm
    const { balance, asuransi } = computeSeaAirBalanceAsuransi({
      valas_dpp: form.valas_dpp, kurs_ndpbm: form.kurs_ndpbm, total_inv_freight: form.total_inv_freight,
      item_price_idr: form.item_price_idr, delivery_term: form.delivery_term,
    })
    const ppnRate = normPct(form.ppn_pct)
    const pphRate = normPct(form.pph_pct)
    const cvCalc = n('valas_dpp') * n('kurs_ndpbm')
    const linesSum = lines.reduce((s, l) => s + (parseLooseNumber(l.amt) ?? 0), 0)
    return {
      cv, bm, importValue, balance, asuransi, cvCalc, linesSum,
      bmRate: cv > 0 ? Math.round((bm / cv) * 10000) / 100 : null,
      ppnRate, pphRate,
      ppnRef: ppnRate === null ? null : Math.round(importValue * ppnRate / 100),
      pphRef: pphRate === null ? null : Math.round(importValue * pphRate / 100),
      dutySum: bm + n('ppn_nilai') + n('pph_nilai'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, lines])

  const handleSplitEvenly = () => {
    const total = n('item_price')
    if (!(total > 0) || lines.length === 0) return
    const hasAmounts = lines.some(l => (l.amt || '').trim() !== '')
    if (hasAmounts && !window.confirm('Replace the current PO amounts with Item price (valas) split evenly?')) return
    const parts = splitMoneyEvenly(total, lines.length, 2)
    setLines(prev => prev.map((l, i) => ({ ...l, amt: String(parts[i]) })))
  }

  const cur = (form.kurs || '').toUpperCase()
  const curOptions = cur && !CURRENCY_OPTIONS.includes(cur) ? [...CURRENCY_OPTIONS, cur] : CURRENCY_OPTIONS
  const importerOptions = Array.from(new Set([...importAnOptions.filter(o => o && o !== 'All'), ...(form.impor_an ? [form.impor_an] : [])]))
  const termKey = (form.delivery_term || '').toUpperCase().trim()

  const handleSave = async (mode: 'draft' | 'audited') => {
    setErr(null)
    if (isCreate && (!form.no_aju.trim() || !form.tgl_ppjk || !form.awb.trim())) {
      setErr('PIB no., PIB date and BL / AWB are required.')
      return
    }
    const next: Record<string, any> = {}
    for (const k of NUM_FIELDS) {
      const raw = form[k]
      if (raw !== '' && toNumOrNull(raw) === null) { setErr(`"${k}" must be a number.`); return }
      next[k] = toNumOrNull(raw)
    }
    TEXT_FIELDS.forEach(k => { const v = (form[k] || '').trim(); next[k] = v === '' ? null : v })
    DATE_FIELDS.forEach(k => { next[k] = form[k] || null })
    if (!hasSptnp) { next.no_sptnp = null; next.tgl_sptnp = null; next.sptnp_total = null }
    next.status = mode === 'audited' ? SEA_AIR_STATUS_AUDITED : SEA_AIR_STATUS_DRAFT

    // Kolom goods: hanya yang berubah (lihat goodsLinesToFields)
    const goods = goodsLinesToFields(lines, original)

    let payload: Record<string, any> = {}
    if (isCreate) {
      Object.entries(next).forEach(([k, v]) => { if (v !== null) payload[k] = v })
      Object.entries(goods).forEach(([k, v]) => { if (v !== null) payload[k] = v })
    } else {
      const same = (k: string, v: any) => {
        const o = original[k]
        if ((NUM_FIELDS as readonly string[]).includes(k)) return toNumOrNull(o) === v
        if ((DATE_FIELDS as readonly string[]).includes(k)) return (o ? String(o).substring(0, 10) : null) === v
        return ((o === null || o === undefined || String(o).trim() === '') ? null : String(o).trim()) === v
      }
      Object.entries(next).forEach(([k, v]) => { if (!same(k, v)) payload[k] = v })
      Object.assign(payload, goods)
    }

    // Balance & Asuransi -- rumus sama tabel lama, dihitung dari gabungan data lama + perubahan.
    const merged = { ...original, ...next }
    const { balance, asuransi } = computeSeaAirBalanceAsuransi(merged)
    if (isCreate || Number(original.balance) !== balance || Number(original.asuransi) !== asuransi) {
      payload.balance = balance
      payload.asuransi = asuransi
    }

    if (!isCreate && Object.keys(payload).length === 0) { onClose(); return }

    setSaving(mode)
    try {
      if (isCreate) {
        const { error } = await supabase.rpc('insert_seaair_row', { p_data: payload })
        if (error) throw error
        onSaved()
      } else {
        const { error } = await supabase.rpc('update_seaair_row', { p_id: record.id, p_updates: payload })
        if (error) throw error
        onSaved(record.id)
      }
    } catch (e: any) {
      console.error('[SeaAirAudit] simpan gagal', e)
      setErr(e?.message || 'Failed to save')
      setSaving(null)
    }
  }

  const numInput = (k: string, extra: string = '') => (
    <input type="number" step="any" value={form[k]} onChange={e => set(k, e.target.value)} className={`${SA_INPUT} text-right tabular-nums ${extra}`} />
  )

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <h2 className="text-[17px] font-bold text-[#3B1B3D]">{isCreate ? 'Add PIB manually' : 'Edit PIB'}</h2>
          <button type="button" onClick={onClose} disabled={!!saving} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Form */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
            <Section n={1} title="Document">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="PIB no. *"><input value={form.no_aju} onChange={e => set('no_aju', e.target.value)} className={SA_INPUT} /></Field>
                <Field label="PIB date *"><input type="date" value={form.tgl_ppjk} onChange={e => set('tgl_ppjk', e.target.value)} className={SA_INPUT} /></Field>
                <Field label="BL / AWB *"><input value={form.awb} onChange={e => set('awb', e.target.value)} className={SA_INPUT} /></Field>
              </div>
              <div className="flex flex-wrap items-end gap-4 mt-3">
                <Field label="Via"><Segmented value={form.via} options={VIA_OPTIONS} onChange={v => set('via', v)} /></Field>
                <Field label="Delivery term"><Segmented value={form.delivery_term} options={TERM_OPTIONS} onChange={v => set('delivery_term', v)} /></Field>
                {TERM_HINT[termKey] && <span className="text-[11px] text-[#8A7A8B] pb-2">{TERM_HINT[termKey]}</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <Field label="Importer">
                  <select value={form.impor_an} onChange={e => set('impor_an', e.target.value)} className={SA_INPUT}>
                    <option value="">—</option>
                    {importerOptions.map(o => (
                      <option key={o} value={o}>{companyFullName(companyNames, o) !== o ? `${o} — ${companyFullName(companyNames, o)}` : o}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Supplier"><input value={form.vendor} onChange={e => set('vendor', e.target.value)} className={SA_INPUT} /></Field>
                <Field label="HS code"><input value={form.hs_code} onChange={e => set('hs_code', e.target.value)} className={SA_INPUT} /></Field>
                <Field label="Document type"><input value={form.jenis_dokumen} onChange={e => set('jenis_dokumen', e.target.value)} className={SA_INPUT} /></Field>
                <Field label="Remarks" className="md:col-span-2"><input value={form.remarks} onChange={e => set('remarks', e.target.value)} className={SA_INPUT} /></Field>
              </div>
            </Section>

            <Section n={2} title="Goods per PO" right={
              <label className="flex items-center gap-2 text-[11.5px] font-semibold text-[#3B1B3D]">
                Currency
                <select value={cur} onChange={e => set('kurs', e.target.value)} className={`${SA_INPUT} w-auto h-8`}>
                  <option value="">—</option>
                  {curOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            }>
              <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_150px_32px] gap-2 items-center">
                <span />
                <span className={SA_LABEL}>No. PO</span>
                <span className={SA_LABEL}>Vendor invoice no.</span>
                <span className={`${SA_LABEL} text-right`}>Amount (valas)</span>
                <span />
                {lines.map((l, i) => (
                  <React.Fragment key={i}>
                    <span className="text-[12px] text-[#8A7A8B] text-center">{i + 1}</span>
                    <input value={l.po} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, po: e.target.value } : x))} className={SA_INPUT} />
                    <input value={l.inv} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, inv: e.target.value } : x))} className={SA_INPUT} />
                    <input value={l.amt} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, amt: e.target.value } : x))} className={`${SA_INPUT} text-right tabular-nums`} />
                    <button type="button" title="Remove line" disabled={lines.length <= 1}
                      onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                      className="h-8 w-8 rounded-lg bg-[#FDE7E4] text-[#A8231A] text-sm font-bold disabled:opacity-30">×</button>
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setLines(prev => [...prev, { po: '', inv: '', amt: '' }])}
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-dashed border-[#C9A9C8] text-[#6B3470] text-xs font-semibold hover:bg-[#F5EDF3]">
                    <Plus size={12} /> Add PO
                  </button>
                  {/* Split evenly (keputusan user 2026-09-30): user yg memutuskan -- mengisi Amount
                      (valas) tiap PO = Item price (valas) dibagi rata; baru tersimpan kalau di-Save. */}
                  <button type="button" onClick={handleSplitEvenly} disabled={!(n('item_price') > 0) || lines.length === 0}
                    title="Fill Amount (valas) of every PO line with Item price (valas) divided evenly"
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white text-[#3B1B3D] text-xs font-semibold hover:bg-[#F5EDF3] disabled:opacity-40 disabled:cursor-not-allowed">
                    Split evenly
                  </button>
                </div>
                <span className="text-[12px] font-bold text-[#3B1B3D] tabular-nums">Goods total {cur ? `${cur} ` : ''}{fmtValas(live.linesSum)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <Field label={`Item price (valas${cur ? ` · ${cur}` : ''})`}>{numInput('item_price')}</Field>
                <Field label="Other cost">{numInput('other_cost')}</Field>
                <Field label="Item price (Rp)">{numInput('item_price_idr')}</Field>
              </div>
            </Section>

            <Section n={3} title="Customs value">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Valas DPP (CIF)">{numInput('valas_dpp')}</Field>
                <Field label="Kurs NDPBM">{numInput('kurs_ndpbm')}</Field>
                <Field label="Freight (Rp)" hint={termKey === 'CFR' || termKey === 'CIF' ? `${termKey} — usually already in the goods price` : 'Total invoice freight'}>{numInput('total_inv_freight')}</Field>
                <Field label="Insurance (Rp)" hint={termKey === 'CIF' ? 'CIF — 0' : 'AUTO · 0,5% × (freight + goods Rp)'}>
                  <div className={`${SA_INPUT} flex items-center justify-end bg-[#F6EFEA] tabular-nums font-semibold`}>{fmtRp(live.asuransi)}</div>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="Customs value (Rp)">{numInput('total_nilai_pabean')}</Field>
                <Field label="Import value (Rp)" hint="Customs value + BM">{numInput('total_nilai_pabean_bm')}</Field>
              </div>
              <RefLine label={`Customs value = ${fmtValas(n('valas_dpp'))} × ${fmtValas(n('kurs_ndpbm'))}`} value={live.cvCalc || null} onUse={() => set('total_nilai_pabean', String(Math.round(live.cvCalc * 100) / 100))} />
              <RefLine label="Import value = customs value + BM" value={live.importValue || null} onUse={() => set('total_nilai_pabean_bm', String(live.importValue))} />
            </Section>

            <Section n={4} title={<>Duties &amp; taxes <span className="text-[11.5px] font-normal text-[#8A7A8B]">— recorded as on the PIB (checked in Invoice Recap)</span></>}>
              <div className="grid grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center">
                <span className={SA_LABEL}>Item</span>
                <span className={SA_LABEL}>Rate %</span>
                <span className={`${SA_LABEL} text-right`}>Reference</span>
                <span className={`${SA_LABEL} text-right`}>Amount on PIB</span>

                <span className="text-[12.5px] font-semibold text-[#3B1B3D]">Bea masuk (BM)</span>
                <div title="No BM rate column — derived from BM ÷ customs value" className={`${SA_INPUT} flex items-center justify-end bg-[#F6EFEA] tabular-nums`}>{fmtPctShort(live.bmRate)}</div>
                <span className="text-right text-[12px] text-[#8A7A8B]">derived</span>
                {numInput('bm')}

                <span className="text-[12.5px] font-semibold text-[#3B1B3D]">PPN impor</span>
                {numInput('ppn_pct')}
                <span className="text-right text-[12px] text-[#6E5E70] tabular-nums">{live.ppnRef === null ? '—' : fmtRp(live.ppnRef)}</span>
                {numInput('ppn_nilai')}

                <span className="text-[12.5px] font-semibold text-[#3B1B3D]">PPh 22 impor</span>
                {numInput('pph_pct')}
                <span className="text-right text-[12px] text-[#6E5E70] tabular-nums">{live.pphRef === null ? '—' : fmtRp(live.pphRef)}</span>
                {numInput('pph_nilai')}

                <span className="text-[12.5px] font-bold text-[#3B1B3D]">Total PIB</span>
                <span />
                <span className="text-right text-[12px] text-[#6E5E70] tabular-nums">{fmtRp(live.dutySum)}</span>
                {numInput('total_pib', 'font-semibold')}
              </div>
              <RefLine tag="SUM" label="Total PIB = BM + PPN + PPh" value={live.dutySum} onUse={() => set('total_pib', String(live.dutySum))} />
            </Section>

            <Section n={5} title="SPTNP & notes" right={
              <label className="flex items-center gap-2 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer">
                <input type="checkbox" checked={hasSptnp} onChange={e => setHasSptnp(e.target.checked)} className="accent-[#6B3470] w-4 h-4" />
                This PIB has an SPTNP
              </label>
            }>
              {hasSptnp && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <Field label="No. SPTNP"><input value={form.no_sptnp} onChange={e => set('no_sptnp', e.target.value)} className={SA_INPUT} /></Field>
                  <Field label="SPTNP date"><input type="date" value={form.tgl_sptnp} onChange={e => set('tgl_sptnp', e.target.value)} className={SA_INPUT} /></Field>
                  <Field label="SPTNP total (Rp)">{numInput('sptnp_total')}</Field>
                </div>
              )}
              <Field label="Notes">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${SA_INPUT} h-auto py-2 resize-y`} />
              </Field>
            </Section>
          </div>

          {/* Live check */}
          <div className="lg:w-[290px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#EADFD6] bg-white p-4 overflow-y-auto">
            <div className={`${SA_LABEL} mb-2`}>Live check</div>
            <div className="rounded-xl bg-[#F5EDF3] px-3 py-2.5 text-[12.5px] font-semibold text-[#6B3470] mb-3">
              Recorded as on the PIB — validation runs in Invoice Recap
            </div>
            {[
              ['Goods (Rp)', fmtRp(n('item_price_idr'))],
              ['Customs value', fmtRp(live.cv)],
              ['Insurance', fmtRp(live.asuransi)],
              ['Balance', fmtRp(live.balance)],
              ['Import value', fmtRp(n('total_nilai_pabean_bm') || live.importValue)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 py-1 text-[12.5px]">
                <span className="text-[#6E5E70]">{k}</span><span className="font-semibold tabular-nums text-[#3B1B3D]">{v}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 pt-2 mt-1 border-t border-[#EADFD6] text-[13px]">
              <span className="font-bold text-[#3B1B3D]">Total PIB</span><span className="font-bold tabular-nums text-[#3B1B3D]">{fmtRp(n('total_pib'))}</span>
            </div>
            {Math.abs(n('total_pib') - live.dutySum) > 1000 && (
              <div className="mt-2 text-[11px] text-[#A8231A]">Total PIB differs from BM + PPN + PPh ({fmtRp(live.dutySum)}).</div>
            )}
            {live.cvCalc > 0 && Math.abs(live.cv - live.cvCalc) > 1000 && (
              <div className="mt-1 text-[11px] text-[#A8231A]">Customs value differs from Valas DPP × Kurs NDPBM ({fmtRp(Math.round(live.cvCalc))}).</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-[#EADFD6] shrink-0">
          {err ? <span className="mr-auto text-[12px] text-[#A8231A] font-semibold">{err}</span>
            : auditBlocker ? <span className="mr-auto text-[11.5px] text-[#7A4F00]">Mark as audited locked: {auditBlocker}</span> : null}
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={!!saving}>Cancel</button>
          <button type="button" className={`${SA_BTN_OUTLINE} border-[#6B3470]/50 text-[#6B3470]`} onClick={() => handleSave('draft')} disabled={!!saving}>
            {saving === 'draft' ? 'Saving…' : 'Save as draft'}
          </button>
          <button type="button" className={SA_BTN_GREEN} onClick={() => handleSave('audited')} disabled={!!saving || !!auditBlocker}
            title={auditBlocker ? `${auditBlocker} — the PIB can be marked as audited once Invoice Recap is ready to submit.` : undefined}>
            {saving === 'audited' ? 'Saving…' : 'Save & mark as audited'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
