// Form "Edit" / "Add manually" Audit Courier (2026-10-01) -- tampilan mengikuti form Audit PIB Sea & Air,
// menulis kolom yang SAMA dgn form lama (PIB_COLS/CN_COLS) LANGSUNG ke tabel_audit_pib / tabel_audit_cn
// (RLS courier_audit, sama EditModal lama). 7 kolom auto-calc (COURIER_AUDIT_CALC_FIELDS) dihitung
// otomatis lewat `computeCourierAuditCalc` (SATU sumber); mengetik di kolom itu = override manual
// permanen (`manual_override_fields`), bisa dikembalikan ke otomatis ("Auto"). Hanya field yang
// BERUBAH yang dikirim saat Edit. Kolom yang tidak diizinkan role (colOk) tidak tampil & tidak dikirim.
// Add manually = selalu Draft (status ARCHIVED, sama form lama); "Save & mark as audited" = simpan lalu
// jalankan aksi Mark as audited parent (RPC fn_undraft_* + Doc Acceptance otomatis). TIDAK ada kunci
// validasi (keputusan user).
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SA_INPUT, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, SA_CARD } from './SeaAirAuditUi'
import { fmtRp, fmtValas, parseLooseNumber, buildGoodsLines, goodsLinesToFields, companyFullName, splitMoneyEvenly, type GoodsLine } from '../utils/SeaAirAuditHelpers'
import { COURIER_AUDIT_CALC_FIELDS, computeCourierAuditCalc, courierTableOf, COURIER_STATUS_DRAFT, isCourierDraft, type CourierDocType } from '../utils/CourierAuditHelpers'

const COMMON_NUM = ['item_price', 'other_cost', 'valas_dpp', 'kurs_ndpbm', 'total_inv_freight', 'total_inv_duty', 'bm', 'ppn_nilai', 'pph_nilai', 'sptnp_total'] as const
const CALC = COURIER_AUDIT_CALC_FIELDS as readonly string[]
const CN_NUM = ['sanksi_adm', 'kurs_bi'] as const
const TEXT = ['awb', 'via', 'delivery_term', 'impor_an', 'vendor', 'hs_code', 'remarks', 'kurs', 'no_sptnp', 'notes', 'marking'] as const
const DATES = ['tgl_ppjk', 'tgl_sptnp', 'doc_acceptance', 'tgl_submit_nas'] as const
const TERM_OPTIONS = ['DAP', 'DDP', 'EXW', 'FOB', 'CFR', 'CIF']
const CURRENCY_OPTIONS = ['USD', 'EUR', 'SGD', 'CNY', 'JPY', 'AUD', 'GBP', 'IDR']

const toStr = (v: any) => (v === null || v === undefined ? '' : String(v))
const toNumOrNull = (v: any): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const x = Number(String(v).replace(/,/g, ''))
  return isNaN(x) ? null : x
}
const round2 = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : String(Math.round(Number(v) * 100) / 100))

const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, hint, className = '', children }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="text-[11.5px] font-semibold text-[#3B1B3D]">{label}</span>
    {children}
    {hint && <span className="text-[10.5px] text-[#8A7A8B]">{hint}</span>}
  </label>
)
const Section: React.FC<{ n: number; title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ n, title, right, children }) => (
  <div className={`${SA_CARD} p-4`}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-[14px] font-bold text-[#3B1B3D]">{n} · {title}</h3>
      {right}
    </div>
    {children}
  </div>
)

export default function CourierAuditEditModal({
  record, docType: docTypeProp, companyNames, importAnOptions, colOk, canMarkAudited, onClose, onSaved, onMarkAudited,
}: {
  record: any | null            // null = Add manually
  docType: CourierDocType        // jenis dokumen baris yg diedit / default saat Add
  companyNames: Record<string, string>
  importAnOptions: string[]
  colOk: (key: string) => boolean
  canMarkAudited: boolean
  onClose: () => void
  onSaved: (id: string | number, docType: CourierDocType) => void
  onMarkAudited: (rec: { id: string | number; jenis_dokumen: CourierDocType }) => Promise<boolean>
}) {
  const isCreate = !record
  const original = record || {}
  const [docType, setDocType] = useState<CourierDocType>(docTypeProp)
  const draft = isCreate || isCourierDraft(original)
  const numFields = useMemo(() => [...COMMON_NUM, ...(docType === 'CN' ? CN_NUM : [])], [docType])
  const docNoKey = docType === 'CN' ? 'no_sppbmcp' : 'no_pib'

  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {}
    ;[...COMMON_NUM, ...CN_NUM, ...CALC, ...TEXT, 'no_pib', 'no_sppbmcp'].forEach(k => { f[k] = toStr(original[k]) })
    DATES.forEach(k => { f[k] = original[k] ? String(original[k]).substring(0, 10) : '' })
    if (isCreate) f.kurs = 'USD'
    return f
  })
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set<string>(Array.isArray(original.manual_override_fields) ? original.manual_override_fields : []))
  const [lines, setLines] = useState<GoodsLine[]>(() => {
    const l = buildGoodsLines(original)
    return l.length > 0 ? l : [{ po: '', inv: '', amt: '' }]
  })
  const [hasSptnp, setHasSptnp] = useState<boolean>(() => !!(original.no_sptnp || original.tgl_sptnp || original.sptnp_total))
  const [saving, setSaving] = useState<'save' | 'audited' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setManual = (k: string, v: string) => { set(k, v); setOverrides(p => (p.has(k) ? p : new Set(p).add(k))) }
  const resetAuto = (k: string) => setOverrides(p => { const nx = new Set(p); nx.delete(k); return nx })

  // Nilai efektif = isian form + hasil auto-calc utk kolom yg TIDAK di-override (fungsi sama tabel lama).
  const calc = useMemo(() => computeCourierAuditCalc(form, docType, overrides), [form, docType, overrides])
  const eff = (k: string): string => (CALC.includes(k) && !overrides.has(k) ? toStr(calc[k]) : form[k])
  const nEff = (k: string) => toNumOrNull(eff(k)) ?? 0

  const cur = (form.kurs || '').toUpperCase()
  const curOptions = cur && !CURRENCY_OPTIONS.includes(cur) ? [...CURRENCY_OPTIONS, cur] : CURRENCY_OPTIONS
  const importerOptions = Array.from(new Set([...importAnOptions.filter(o => o && o !== 'All'), ...(form.impor_an ? [form.impor_an] : [])]))
  const linesSum = lines.reduce((s, l) => s + (parseLooseNumber(l.amt) ?? 0), 0)

  const handleSplitEvenly = () => {
    const total = toNumOrNull(form.item_price) ?? 0
    if (!(total > 0) || lines.length === 0) return
    if (lines.some(l => (l.amt || '').trim() !== '') && !window.confirm('Replace the current PO amounts with Item price (valas) split evenly?')) return
    const parts = splitMoneyEvenly(total, lines.length, 2)
    setLines(prev => prev.map((l, i) => ({ ...l, amt: String(parts[i]) })))
  }

  const numInput = (k: string, extra = '') => (
    <input type="number" step="any" aria-label={k} value={form[k]} onChange={e => set(k, e.target.value)} className={`${SA_INPUT} text-right tabular-nums ${extra}`} />
  )
  // Kolom auto-calc: tampil nilai otomatis; mengetik = manual (biru). PPN/PPh % ditampilkan dlm persen
  // (DB menyimpan pecahan 0,11 -- konversi di sini saja).
  const autoInput = (k: string, opts: { pct?: boolean } = {}) => {
    const manual = overrides.has(k)
    const raw = eff(k)
    const shown = raw === '' ? '' : opts.pct ? round2(Number(raw) * 100) : round2(raw)
    return (
      <div className="flex items-center gap-1.5">
        <input type="number" step="any" aria-label={k} value={manual ? (opts.pct ? (form[k] === '' ? '' : round2(Number(form[k]) * 100)) : form[k]) : shown}
          onChange={e => setManual(k, opts.pct ? (e.target.value === '' ? '' : String(Number(e.target.value) / 100)) : e.target.value)}
          className={`${SA_INPUT} text-right tabular-nums ${manual ? 'border-[#2F4FA8] bg-[#EEF1FA]' : 'bg-[#FBF7F4]'}`} />
        {manual
          ? <button type="button" title="Back to automatic calculation" onClick={() => resetAuto(k)} className="shrink-0 inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-[#C8D2EF] bg-white text-[10.5px] font-bold text-[#2F4FA8]"><RotateCcw size={11} />Manual</button>
          : <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#EEF1FA] text-[#2F4FA8] text-[10px] font-bold">AUTO</span>}
      </div>
    )
  }

  const save = async (mode: 'save' | 'audited') => {
    setErr(null)
    if (isCreate && (!form.awb.trim() || !form.tgl_ppjk)) { setErr('AWB and PPJK date are required.'); return }
    const next: Record<string, any> = {}
    for (const k of [...numFields, ...CALC]) {
      const v = eff(k)
      if (v !== '' && toNumOrNull(v) === null) { setErr(`"${k}" must be a number.`); return }
      next[k] = toNumOrNull(v)
    }
    ;[...TEXT, docNoKey].forEach(k => { const v = (form[k] || '').trim(); next[k] = v === '' ? null : v })
    DATES.forEach(k => { next[k] = form[k] || null })
    if (!hasSptnp) { next.no_sptnp = null; next.tgl_sptnp = null; next.sptnp_total = null }
    // Kolom yg tidak diizinkan role: tidak tampil -> tidak dikirim.
    Object.keys(next).forEach(k => { if (!colOk(k)) delete next[k] })
    const goods = colOk('po_ori') ? goodsLinesToFields(lines, original) : {}
    const ovArr = Array.from(overrides).filter((f: string) => CALC.includes(f))

    let payload: Record<string, any> = {}
    if (isCreate) {
      Object.entries(next).forEach(([k, v]) => { if (v !== null) payload[k] = v })
      Object.entries(goods).forEach(([k, v]) => { if (v !== null) payload[k] = v })
      payload.status = COURIER_STATUS_DRAFT
      payload.jenis_dokumen = docType
      if (ovArr.length) payload.manual_override_fields = ovArr
    } else {
      const same = (k: string, v: any) => {
        const o = original[k]
        if ((DATES as readonly string[]).includes(k)) return (o ? String(o).substring(0, 10) : null) === v
        if ([...numFields, ...CALC].includes(k)) {
          const on = toNumOrNull(o)
          return on === v || (on !== null && v !== null && Math.abs(on - v) < 0.005)
        }
        return ((o === null || o === undefined || String(o).trim() === '') ? null : String(o).trim()) === v
      }
      Object.entries(next).forEach(([k, v]) => { if (!same(k, v)) payload[k] = v })
      Object.assign(payload, goods)
      const before = Array.isArray(original.manual_override_fields) ? [...original.manual_override_fields].sort() : []
      if (JSON.stringify([...ovArr].sort()) !== JSON.stringify(before)) payload.manual_override_fields = ovArr
    }

    setSaving(mode)
    try {
      let id: string | number = original.id
      if (isCreate) {
        const { data, error } = await supabase.from(courierTableOf(docType)).insert(payload).select('id').single()
        if (error) throw error
        id = data?.id
      } else if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from(courierTableOf(docType)).update(payload).eq('id', original.id)
        if (error) throw error
      }
      if (mode === 'audited' && id !== undefined && id !== null) {
        const ok = await onMarkAudited({ id, jenis_dokumen: docType })
        if (!ok) { setSaving(null); setErr('Saved, but marking as audited failed — see the message shown.'); return }
      }
      onSaved(id, docType)
    } catch (e: any) {
      console.error('[CourierAudit] simpan gagal', e)
      setErr(e?.message || 'Failed to save')
      setSaving(null)
    }
  }

  const cv = nEff('total_nilai_pabean')
  const diff = nEff('cek_selisih')
  const dutyTotal = nEff('total_pib_cn')
  const invDuty = toNumOrNull(form.total_inv_duty)

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <h2 className="text-[17px] font-bold text-[#3B1B3D]">{isCreate ? 'Add PIB / CN manually' : `Edit ${docType}`}</h2>
          <button type="button" onClick={onClose} disabled={!!saving} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-w-0 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
            <Section n={1} title="Document">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Document type" hint={isCreate ? 'PIB or CN (SPPBMCP)' : 'Cannot be changed'}>
                  <div className="inline-flex gap-1 p-1 rounded-xl bg-[#F5EDF3] w-fit">
                    {(['PIB', 'CN'] as const).map(t => (
                      <button key={t} type="button" disabled={!isCreate} onClick={() => setDocType(t)}
                        className={`px-3 h-8 rounded-lg text-xs font-bold ${docType === t ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white disabled:hover:bg-transparent'} disabled:cursor-not-allowed`}>{t}</button>
                    ))}
                  </div>
                </Field>
                {colOk(docNoKey) && <Field label={docType === 'CN' ? 'SPPBMCP no.' : 'PIB no.'}><input aria-label={docNoKey} value={form[docNoKey]} onChange={e => set(docNoKey, e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('tgl_ppjk') && <Field label={`PPJK date${isCreate ? ' *' : ''}`}><input type="date" aria-label="tgl_ppjk" value={form.tgl_ppjk} onChange={e => set('tgl_ppjk', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('awb') && <Field label={`AWB${isCreate ? ' *' : ''}`}><input aria-label="awb" value={form.awb} onChange={e => set('awb', e.target.value)} className={SA_INPUT} /></Field>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                {colOk('via') && <Field label="Via"><input aria-label="via" value={form.via} onChange={e => set('via', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('delivery_term') && (
                  <Field label="Delivery term">
                    <input aria-label="delivery_term" list="courier-term-options" value={form.delivery_term} onChange={e => set('delivery_term', e.target.value)} className={SA_INPUT} />
                    <datalist id="courier-term-options">{TERM_OPTIONS.map(o => <option key={o} value={o} />)}</datalist>
                  </Field>
                )}
                {colOk('impor_an') && (
                  <Field label="Importer (A/N)">
                    <select aria-label="impor_an" value={form.impor_an} onChange={e => set('impor_an', e.target.value)} className={SA_INPUT}>
                      <option value="">—</option>
                      {importerOptions.map(o => <option key={o} value={o}>{companyFullName(companyNames, o) !== o ? `${o} — ${companyFullName(companyNames, o)}` : o}</option>)}
                    </select>
                  </Field>
                )}
                {colOk('vendor') && <Field label="Supplier"><input aria-label="vendor" value={form.vendor} onChange={e => set('vendor', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('hs_code') && <Field label="HS code"><input aria-label="hs_code" value={form.hs_code} onChange={e => set('hs_code', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('marking') && <Field label="Marking"><input aria-label="marking" value={form.marking} onChange={e => set('marking', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('remarks') && <Field label="Remarks" className="md:col-span-2"><input aria-label="remarks" value={form.remarks} onChange={e => set('remarks', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('doc_acceptance') && <Field label="Doc Acceptance" hint="Filled automatically on Mark as audited when empty"><input type="date" aria-label="doc_acceptance" value={form.doc_acceptance} onChange={e => set('doc_acceptance', e.target.value)} className={SA_INPUT} /></Field>}
                {colOk('tgl_submit_nas') && <Field label="NAS Submit Date"><input type="date" aria-label="tgl_submit_nas" value={form.tgl_submit_nas} onChange={e => set('tgl_submit_nas', e.target.value)} className={SA_INPUT} /></Field>}
              </div>
            </Section>

            {colOk('po_ori') && (
              <Section n={2} title="Goods per PO" right={colOk('kurs') ? (
                <label className="flex items-center gap-2 text-[11.5px] font-semibold text-[#3B1B3D]">
                  Currency
                  <select aria-label="kurs" value={cur} onChange={e => set('kurs', e.target.value)} className={`${SA_INPUT} w-auto h-8`}>
                    <option value="">—</option>
                    {curOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ) : undefined}>
                <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_150px_32px] gap-2 items-center">
                  <span /><span className={SA_LABEL}>No. PO</span><span className={SA_LABEL}>Vendor invoice no.</span><span className={`${SA_LABEL} text-right`}>Amount (valas)</span><span />
                  {lines.map((l, i) => (
                    <React.Fragment key={i}>
                      <span className="text-[12px] text-[#8A7A8B] text-center">{i + 1}</span>
                      <input aria-label={`PO ${i + 1}`} value={l.po} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, po: e.target.value } : x))} className={SA_INPUT} />
                      <input aria-label={`Invoice ${i + 1}`} value={l.inv} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, inv: e.target.value } : x))} className={SA_INPUT} disabled={!colOk('vendor_inv_no')} />
                      <input aria-label={`Amount ${i + 1}`} value={l.amt} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, amt: e.target.value } : x))} className={`${SA_INPUT} text-right tabular-nums`} disabled={!colOk('po_harga_detail')} />
                      <button type="button" title="Remove line" disabled={lines.length <= 1} onClick={() => setLines(prev => prev.filter((_, j) => j !== i))} className="h-8 w-8 rounded-lg bg-[#FDE7E4] text-[#A8231A] text-sm font-bold disabled:opacity-30">×</button>
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLines(prev => [...prev, { po: '', inv: '', amt: '' }])} className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-dashed border-[#C9A9C8] text-[#6B3470] text-xs font-semibold hover:bg-[#F5EDF3]"><Plus size={12} /> Add PO</button>
                    {colOk('po_harga_detail') && colOk('item_price') && (
                      <button type="button" onClick={handleSplitEvenly} disabled={!((toNumOrNull(form.item_price) ?? 0) > 0)} title="Fill Amount (valas) of every PO line with Item price (valas) divided evenly"
                        className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white text-[#3B1B3D] text-xs font-semibold hover:bg-[#F5EDF3] disabled:opacity-40 disabled:cursor-not-allowed">Split evenly</button>
                    )}
                  </div>
                  <span className="text-[12px] font-bold text-[#3B1B3D] tabular-nums">Goods total {cur ? `${cur} ` : ''}{fmtValas(linesSum)}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  {colOk('item_price') && <Field label={`Item price (valas${cur ? ` · ${cur}` : ''})`}>{numInput('item_price')}</Field>}
                  {colOk('other_cost') && <Field label="Other cost">{numInput('other_cost')}</Field>}
                  {docType === 'CN' && colOk('kurs_bi') && <Field label="Kurs BI (Rp)">{numInput('kurs_bi')}</Field>}
                  {colOk('item_price_idr') && <Field label="Item price (Rp)" hint={cur === 'USD' ? '(Item price + other cost) × Kurs NDPBM' : 'Item price × Kurs BI'}>{autoInput('item_price_idr')}</Field>}
                </div>
              </Section>
            )}

            <Section n={3} title="Customs value">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {colOk('valas_dpp') && <Field label="Valas DPP">{numInput('valas_dpp')}</Field>}
                {colOk('kurs_ndpbm') && <Field label="Kurs NDPBM">{numInput('kurs_ndpbm')}</Field>}
                {colOk('total_inv_freight') && <Field label="Total invoice freight (Rp)">{numInput('total_inv_freight')}</Field>}
                {colOk('total_nilai_pabean') && <Field label="Total customs value (Rp)" hint="Valas DPP × Kurs NDPBM">{autoInput('total_nilai_pabean')}</Field>}
                {colOk('total_nilai_pabean_bm') && <Field label="Import value (Rp)" hint="Customs value + BM">{autoInput('total_nilai_pabean_bm')}</Field>}
                {colOk('cek_selisih') && <Field label="Check difference (Rp)" hint="Customs value − (goods Rp + freight)">{autoInput('cek_selisih')}</Field>}
              </div>
            </Section>

            <Section n={4} title={<>Duties &amp; taxes <span className="text-[11.5px] font-normal text-[#8A7A8B]">— as on the {docType}</span></>}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {colOk('bm') && <Field label="BM (Rp)">{numInput('bm')}</Field>}
                {colOk('ppn_nilai') && <Field label="PPN (Rp)">{numInput('ppn_nilai')}</Field>}
                {colOk('ppn_pct') && <Field label="PPN (%)" hint="PPN ÷ import value">{autoInput('ppn_pct', { pct: true })}</Field>}
                {colOk('pph_nilai') && <Field label="PPh (Rp)">{numInput('pph_nilai')}</Field>}
                {colOk('pph_pct') && <Field label="PPh (%)" hint="PPh ÷ import value">{autoInput('pph_pct', { pct: true })}</Field>}
                {docType === 'CN' && colOk('sanksi_adm') && <Field label="Admin penalty (Rp)" hint="CN only — included in Total CN">{numInput('sanksi_adm')}</Field>}
                {colOk('total_pib_cn') && <Field label={`Total ${docType} (Rp)`} hint={`BM + PPN + PPh${docType === 'CN' ? ' + admin penalty' : ''}`}>{autoInput('total_pib_cn')}</Field>}
                {colOk('total_inv_duty') && <Field label="Total invoice duty (Rp)" hint="From the PPJK duty invoice">{numInput('total_inv_duty')}</Field>}
              </div>
            </Section>

            <Section n={5} title="SPTNP & notes" right={colOk('no_sptnp') ? (
              <label className="flex items-center gap-2 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer">
                <input type="checkbox" checked={hasSptnp} onChange={e => setHasSptnp(e.target.checked)} className="accent-[#6B3470] w-4 h-4" /> Has an SPTNP
              </label>
            ) : undefined}>
              {hasSptnp && colOk('no_sptnp') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <Field label="No. SPTNP"><input aria-label="no_sptnp" value={form.no_sptnp} onChange={e => set('no_sptnp', e.target.value)} className={SA_INPUT} /></Field>
                  {colOk('tgl_sptnp') && <Field label="SPTNP date"><input type="date" aria-label="tgl_sptnp" value={form.tgl_sptnp} onChange={e => set('tgl_sptnp', e.target.value)} className={SA_INPUT} /></Field>}
                  {colOk('sptnp_total') && <Field label="SPTNP total (Rp)">{numInput('sptnp_total')}</Field>}
                </div>
              )}
              {colOk('notes') && <Field label="Notes"><textarea aria-label="notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${SA_INPUT} h-auto py-2 resize-y`} /></Field>}
            </Section>
          </div>

          {/* Live check */}
          <div className="lg:w-[290px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#EADFD6] bg-white p-4 overflow-y-auto">
            <div className={`${SA_LABEL} mb-2`}>Live check</div>
            <div className="rounded-xl bg-[#F5EDF3] px-3 py-2.5 text-[12px] font-semibold text-[#6B3470] mb-3">
              Blue fields were typed manually and are no longer calculated automatically.
            </div>
            {([
              ['Goods (Rp)', 'item_price_idr', fmtRp(nEff('item_price_idr'))],
              ['Customs value', 'total_nilai_pabean', fmtRp(cv)],
              ['Import value', 'total_nilai_pabean_bm', fmtRp(nEff('total_nilai_pabean_bm'))],
              ['Check difference', 'cek_selisih', fmtRp(Math.round(diff))],
            ] as const).filter(([, k]) => colOk(k)).map(([label, , v]) => (
              <div key={label} className="flex justify-between gap-2 py-1 text-[12.5px]">
                <span className="text-[#6E5E70]">{label}</span><span className="font-semibold tabular-nums text-[#3B1B3D]">{v}</span>
              </div>
            ))}
            {colOk('total_pib_cn') && (
              <div className="flex justify-between gap-2 pt-2 mt-1 border-t border-[#EADFD6] text-[13px]">
                <span className="font-bold text-[#3B1B3D]">Total {docType}</span><span className="font-bold tabular-nums text-[#3B1B3D]">{fmtRp(dutyTotal)}</span>
              </div>
            )}
            {colOk('cek_selisih') && Math.abs(diff) > 1000 && <div className="mt-2 text-[11px] text-[#A8231A]">Customs value differs from goods + freight by {fmtRp(Math.round(diff))}.</div>}
            {colOk('total_inv_duty') && colOk('total_pib_cn') && invDuty !== null && Math.abs(invDuty - dutyTotal) > 1000 && (
              <div className="mt-1 text-[11px] text-[#A8231A]">Invoice duty ({fmtRp(invDuty)}) differs from Total {docType}.</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-[#EADFD6] shrink-0">
          {err && <span className="mr-auto text-[12px] text-[#A8231A] font-semibold">{err}</span>}
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={!!saving}>Cancel</button>
          <button type="button" className={draft ? `${SA_BTN_OUTLINE} border-[#6B3470]/50 text-[#6B3470]` : SA_BTN_GREEN} onClick={() => save('save')} disabled={!!saving}>
            {saving === 'save' ? 'Saving…' : draft ? 'Save as draft' : 'Save changes'}
          </button>
          {draft && canMarkAudited && (
            <button type="button" className={SA_BTN_GREEN} onClick={() => save('audited')} disabled={!!saving}>
              {saving === 'audited' ? 'Saving…' : 'Save & mark as audited'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
