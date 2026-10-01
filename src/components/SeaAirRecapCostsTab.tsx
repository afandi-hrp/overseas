// Tab "Costs" jendela Open Invoice Recap Sea & Air (2026-10-01, opsi A = DIBANGUN ULANG sesuai
// desain). Data & cara simpan SAMA PERSIS dgn modal lama `ValidasiShipmentInvoiceLengkap.tsx`
// (masih dipakai mode List): baca `cost_validasi_seaair.checks` + `cost_validasi_catatan_seaair`,
// edit Expected/Actual -> status dihitung ulang (toleransi IDR 1.000, USD 1, KURS BI 1), simpan
// SELURUH `checks` lewat RPC `update_cost_validasi_manual`, review per segmen = upsert/hapus
// `cost_validasi_catatan_seaair` (Accept difference = MATCH, Ask vendor to revise = MISMATCH).
// Statistik = `computeSeaAirCostGlobalStats` (SATU sumber, sama badge % & modal lama).
// KALAU logika modal lama berubah, WAJIB disinkronkan ke file ini juga.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Info, Check, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { LoadingState } from './LoadingState'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY, Chip, Pill, type Tone } from './SeaAirAuditUi'
import { computeSeaAirCostGlobalStats, type SectionConfirmation } from '../utils/SeaAirCostValidasiHelpers'
import { COST_SECTIONS, isSummaryCostRow } from '../utils/SeaAirRecapHelpers'
import { computeDutyRows, fmtRp, fmtPctShort, fmtDateShort } from '../utils/SeaAirAuditHelpers'

type Catatan = { id: any; seaair_id: any; section: string; status_konfirmasi: SectionConfirmation; catatan: string | null; dikonfirmasi_oleh: string | null; dikonfirmasi_at: string | null }
type Draft = { status: SectionConfirmation; catatan: string }

// ── Salinan PERSIS helper modal lama ──
const selisihStatus = (exp: any, act: any, tolerance: number = 1000) => {
  if (exp == null || act == null || exp === '' || act === '') return { status: 'BELUM_LENGKAP', selisih: 0 }
  const e = Number(exp)
  const a = Number(act)
  const diff = a - e
  if (Math.abs(diff) <= tolerance) return { status: 'MATCH', selisih: diff }
  if (diff > tolerance) return { status: 'OVERCHARGE', selisih: diff }
  return { status: 'UNDERCHARGE', selisih: diff }
}
const fmtUSD = (n: any) => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtIDR = (val: any) => {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n)) return '—'
  return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}
const fmtAmount = (row: any, v: any) => (row.row === 'KURS BI' ? (v == null || v === '' ? '—' : Number(v).toLocaleString('id-ID')) : row.mata_uang === 'USD' ? fmtUSD(v) : fmtIDR(v))
const toleranceFor = (row: any) => (row.row === 'KURS BI' ? 1 : row.mata_uang === 'USD' ? 1 : 1000)

const EditableAmount: React.FC<{ editable: boolean; row: any; val: any; onSave: (v: string) => void }> = ({ editable, row, val, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState('')
  if (editing) {
    return (
      <input
        autoFocus
        value={temp}
        onChange={e => setTemp(e.target.value)}
        onBlur={() => { setEditing(false); onSave(temp) }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(temp) } else if (e.key === 'Escape') setEditing(false) }}
        className="w-32 h-8 px-2 rounded-lg border border-[#6B3470] text-right text-[12.5px] tabular-nums focus:outline-none"
      />
    )
  }
  return (
    <span
      onClick={() => { if (editable) { setTemp(val == null ? '' : String(val)); setEditing(true) } }}
      className={`inline-block min-w-[80px] text-right tabular-nums ${editable ? 'cursor-pointer px-2 py-1 rounded-md bg-white ring-1 ring-[#EADFD6] hover:ring-[#6B3470]/50' : ''}`}
    >
      {val != null && val !== '' ? fmtAmount(row, val) : editable ? <span className="italic text-[#8A7A8B]">Click to fill</span> : '—'}
    </span>
  )
}

const rowStatusChip = (status: string | null) => {
  if (status === 'MATCH') return <Chip tone="green">Match</Chip>
  if (status === 'OVERCHARGE') return <Chip tone="red">Overcharge</Chip>
  if (status === 'UNDERCHARGE') return <Chip tone="amber">Undercharge</Chip>
  return <Chip tone="grey">Incomplete</Chip>
}

export default function SeaAirRecapCostsTab({ seaairId, canEdit: canEditPage, isAdmin = false, locked = false, financeView = false, auditRow, onChanged, onDirtyChange }: {
  seaairId: any
  canEdit: boolean
  financeView?: boolean  // Finance Handover: baca saja, tanpa segmen CUSTOM & kartu Duty & tax
  isAdmin?: boolean   // bagian 2 (sql/031): review & edit nominal HANYA Admin
  locked?: boolean    // sudah Submit to Finance -> read-only
  auditRow: any | null
  onChanged: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { user, profile } = useAuth()
  // Keputusan user (bagian 2): konfirmasi cost (review per segmen & edit nominal) HANYA Admin, dan
  // tidak bisa sama sekali setelah Submit to Finance. Ditegakkan juga di DB (trigger sql/031 bagian J).
  const canEdit = canEditPage && isAdmin && !locked && !financeView
  const [checks, setChecks] = useState<any[]>([])
  const [costValidasiId, setCostValidasiId] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isEditMode, setIsEditMode] = useState(false)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [catatanMap, setCatatanMap] = useState<Record<string, Catatan>>({})
  const [catatanDraft, setCatatanDraft] = useState<Record<string, Draft>>({})
  const [catatanSaving, setCatatanSaving] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [reviewOpen, setReviewOpen] = useState<Record<string, boolean>>({})
  const [jalurMerah, setJalurMerah] = useState(false)

  useEffect(() => { onDirtyChange?.(hasUnsaved) }, [hasUnsaved, onDirtyChange])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    if (!seaairId) { setLoading(false); setLoadError('This shipment is not linked to a cost validation record.'); return }
    setLoading(true)
    setLoadError('')
    try {
      const [validasiRes, catatanRes] = await Promise.all([
        supabase.from('cost_validasi_seaair').select('*').eq('seaair_id', seaairId).maybeSingle(),
        supabase.from('cost_validasi_catatan_seaair').select('*').eq('seaair_id', seaairId),
      ])
      if (catatanRes.error) console.error('[SeaAirRecap] catatan gagal', catatanRes.error)
      else {
        const map: Record<string, Catatan> = {}
        ;(catatanRes.data || []).forEach((c: any) => { map[c.section] = c })
        setCatatanMap(map)
      }
      if (validasiRes.error) {
        setLoadError('Failed to load cost validation: ' + validasiRes.error.message)
      } else if (!validasiRes.data) {
        setLoadError('Cost validation is not available for this shipment yet.')
        setChecks([])
      } else {
        setCostValidasiId(validasiRes.data.id)
        const loaded: any[] = Array.isArray(validasiRes.data.checks) ? [...validasiRes.data.checks] : []
        // Sisipkan baris SURVEYOR yg hilang -- SALINAN PERSIS modal lama.
        if (loaded.some((c: any) => c.section === 'SURVEYOR')) {
          if (!loaded.some((c: any) => c.section === 'SURVEYOR' && c.row === 'KURS BI')) {
            const existing = loaded.find((c: any) => c.section === 'SURVEYOR' && c.row === 'SURVEYOR')
            const vendor = existing ? existing.vendor_name : undefined
            loaded.push({ section: 'SURVEYOR', row: 'KURS BI', vendor_name: vendor, expected: null, actual: null, mata_uang: 'IDR', selisih: null, status: 'BELUM_LENGKAP', manual: false })
            loaded.push({ section: 'SURVEYOR', row: 'NILAI RUPIAH', vendor_name: vendor, expected: null, actual: null, mata_uang: 'IDR', selisih: null, status: 'BELUM_LENGKAP', manual: false })
          }
        }
        setChecks(loaded)
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load cost validation')
    } finally {
      setHasUnsaved(false)
      setLoading(false)
    }
  }, [seaairId])

  useEffect(() => { load() }, [load])

  // SALINAN PERSIS updateCheck modal lama.
  const updateCheck = (section: string, rowName: string, vendor_name: string | undefined, field: string, val: string) => {
    setChecks(prev => prev.map(c => {
      if (c.section === section && c.row === rowName && c.vendor_name === vendor_name) {
        if (field === 'expected_alt.nilai') {
          setHasUnsaved(true)
          return { ...c, expected_alt: { ...(c.expected_alt || {}), nilai: val === '' ? null : val }, manual: true }
        }
        const next = { ...c, [field]: val === '' ? null : val, manual: true }
        let tol = next.mata_uang === 'USD' ? 1 : 1000
        if (next.row === 'KURS BI') tol = 1
        const { status, selisih } = selisihStatus(next.expected, next.actual, tol)
        next.status = status
        next.selisih = selisih
        setHasUnsaved(true)
        return next
      }
      return c
    }))
  }

  const handleSave = async () => {
    if (!costValidasiId) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('update_cost_validasi_manual', { p_id: costValidasiId, p_checks: checks })
      if (error) throw error
      const { data: verify } = await supabase.from('cost_validasi_seaair').select('id').eq('id', costValidasiId).maybeSingle()
      if (!verify) throw new Error('Verification failed')
      showToast('Cost validation saved.', 'success')
      setHasUnsaved(false)
      setIsEditMode(false)
      onChanged()
    } catch (e: any) {
      console.error('[SeaAirRecap] simpan cost gagal', e)
      showToast('Failed to save: ' + (e?.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const getDraft = (section: string): Draft => {
    if (catatanDraft[section]) return catatanDraft[section]
    const ex = catatanMap[section]
    if (ex) return { status: ex.status_konfirmasi, catatan: ex.catatan || '' }
    return { status: 'MATCH', catatan: '' }
  }

  // SALINAN modal lama handleSaveConfirmation (upsert by seaair_id+section).
  const saveReview = async (section: string) => {
    const draft = getDraft(section)
    if (draft.status === 'MISMATCH' && !draft.catatan.trim()) { showToast('A note is required when asking the vendor to revise.', 'error'); return }
    setCatatanSaving(p => ({ ...p, [section]: true }))
    const { data, error } = await supabase
      .from('cost_validasi_catatan_seaair')
      .upsert({
        seaair_id: seaairId,
        section,
        status_konfirmasi: draft.status,
        catatan: draft.catatan.trim() || null,
        dikonfirmasi_oleh: profile?.nama || user?.email || null,
        dikonfirmasi_at: new Date().toISOString(),
      }, { onConflict: 'seaair_id,section' })
      .select()
      .single()
    setCatatanSaving(p => ({ ...p, [section]: false }))
    if (error) { showToast('Failed to save review: ' + error.message, 'error'); return }
    setCatatanMap(p => ({ ...p, [section]: data }))
    setCatatanDraft(p => { const n = { ...p }; delete n[section]; return n })
    setReviewOpen(p => ({ ...p, [section]: false }))
    setOpen(p => ({ ...p, [section]: true })) // tetap terbuka supaya baris "Reviewed … / Undo" terlihat
    showToast('Review saved.', 'success')
    onChanged()
  }

  // SALINAN modal lama handleDeleteConfirmation (hapus baris catatan).
  const undoReview = async (section: string) => {
    const row = catatanMap[section]
    if (!row) return
    setCatatanSaving(p => ({ ...p, [section]: true }))
    const { error } = await supabase.from('cost_validasi_catatan_seaair').delete().eq('id', row.id)
    setCatatanSaving(p => ({ ...p, [section]: false }))
    if (error) { showToast('Failed to undo review: ' + error.message, 'error'); return }
    setCatatanMap(p => { const n = { ...p }; delete n[section]; return n })
    setCatatanDraft(p => { const n = { ...p }; delete n[section]; return n })
    setOpen(p => ({ ...p, [section]: true }))
    showToast('Review removed.', 'success')
    onChanged()
  }

  const confirmationBySection = useMemo(() => {
    const m = new Map<string, SectionConfirmation>()
    ;(Object.values(catatanMap) as Catatan[]).forEach(c => m.set(c.section, c.status_konfirmasi))
    return m
  }, [catatanMap])
  // Mode Finance: segmen CUSTOM (bea cukai) tidak ditampilkan & tidak dihitung.
  const statChecks = useMemo(() => (financeView ? checks.filter(c => String(c.section || '').trim().toUpperCase() !== 'CUSTOM') : checks), [checks, financeView])
  const stats = useMemo(() => computeSeaAirCostGlobalStats(statChecks, confirmationBySection), [statChecks, confirmationBySection])
  // Sisa baris (bukan match/over/under, segmen belum dikonfirmasi): expected kosong = "Not validated"
  // (tidak ada tarif kontrak), selain itu "Incomplete" (actual belum ada).
  const { notValidated, incomplete } = useMemo(() => {
    let nv = 0, inc = 0
    statChecks.filter((c: any) => c.section !== 'SURVEYOR' && !confirmationBySection.has(c.section)).forEach((c: any) => {
      if (c.status === 'MATCH' || c.status === 'OVERCHARGE' || c.status === 'UNDERCHARGE') return
      if (c.expected == null || c.expected === '') nv++; else inc++
    })
    return { notValidated: nv, incomplete: inc }
  }, [statChecks, confirmationBySection])

  const rowsFor = (section: string) => checks.filter(c => String(c.section || '').trim().toUpperCase() === section)
  // "3 of 4 invoices match the contract rate" (spek Finance): per segmen yg punya baris (selain CUSTOM &
  // SURVEYOR), match = semua baris detail MATCH atau segmen sudah direview "accept difference".
  const invoiceSummary = (() => {
    const secs = COST_SECTIONS.filter(sec => sec.key !== 'CUSTOM' && !sec.optional)
      .map(sec => ({ sec, rows: rowsFor(sec.key).filter(r => !isSummaryCostRow(r)) })).filter(x => x.rows.length > 0)
    if (secs.length === 0) return ''
    const ok = secs.filter(x => confirmationBySection.get(x.sec.key) === 'MATCH' || x.rows.every(r => r.status === 'MATCH')).length
    return `${ok} of ${secs.length} invoice${secs.length === 1 ? '' : 's'} match the contract rate`
  })()

  if (loading) return <LoadingState fullHeight={false} />

  const duty = auditRow ? computeDutyRows(auditRow) : null
  const hasSptnp = !!(auditRow && (auditRow.no_sptnp || auditRow.tgl_sptnp || auditRow.sptnp_total))
  const accColor = stats.pct >= 90 ? 'bg-[#17663D]' : stats.pct >= 60 ? 'bg-[#E0A526]' : 'bg-[#A8231A]'

  return (
    <div className="flex flex-col gap-3">
      {toast && (
        <div className={`px-3 py-2 rounded-xl border text-[12.5px] font-semibold ${toast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{toast.msg}</div>
      )}

      {/* Ringkasan */}
      <div className={`${SA_CARD} px-4 py-3 flex flex-wrap items-center gap-4`}>
        <div className="mr-auto">
          <div className="text-[14px] font-bold text-[#3B1B3D]">Cost validation</div>
          <div className="text-[11.5px] text-[#6E5E70]">{financeView && invoiceSummary ? invoiceSummary : 'Each invoice line vs. the contract rate'}</div>
        </div>
        {([
          ['Match', stats.match, 'bg-[#EAF6EF] text-[#17663D]'],
          ['Over', stats.overcharge, 'bg-[#FDE7E4] text-[#A8231A]'],
          ['Under', stats.undercharge, 'bg-[#FFF1D6] text-[#7A4F00]'],
          ['Not validated', notValidated, 'bg-[#F3EEEA] text-[#6E5E70]'],
          ['Incomplete', incomplete, 'bg-[#F3EEEA] text-[#6E5E70]'],
        ] as const).map(([label, value, cls]) => (
          <div key={label} className={`min-w-[78px] px-3 py-1.5 rounded-xl text-center ${cls}`}>
            <div className="text-[18px] font-bold leading-tight tabular-nums">{value}</div>
            <div className="text-[10px] font-semibold">{label}</div>
          </div>
        ))}
        <div className="min-w-[150px]">
          <div className="flex justify-between text-[11px] text-[#6E5E70] mb-1"><span>Accuracy</span><b className="text-[#3B1B3D]">{stats.pct}%</b></div>
          <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden"><div className={`h-full ${accColor}`} style={{ width: `${stats.pct}%` }} /></div>
        </div>
        {canEdit && !loadError && (
          <button type="button" className={isEditMode ? SA_BTN_PRIMARY : SA_BTN_OUTLINE} onClick={() => setIsEditMode(v => !v)}>
            <Pencil size={13} /> {isEditMode ? 'Editing amounts' : 'Edit amounts'}
          </button>
        )}
      </div>
      {canEditPage && !canEdit && !loadError && (
        <div className="rounded-xl border border-[#EADFD6] bg-white px-4 py-2 text-[11.5px] text-[#6E5E70]">
          {locked ? 'Locked — this shipment has been submitted to Finance. Ask an Admin to unlock it first.' : 'Cost reviews and amount corrections can only be confirmed by an Admin.'}
        </div>
      )}

      {loadError ? (
        <div className={`${SA_CARD} px-4 py-6 text-center text-[12.5px] text-[#6E5E70]`}>{loadError}</div>
      ) : COST_SECTIONS.filter(sec => !financeView || sec.key !== 'CUSTOM').map(sec => {
        const rawRows = rowsFor(sec.key)
        if (rawRows.length === 0) return null
        // Jalur Merah (EMKL) -- SALINAN logika displayRows modal lama.
        const hasJalurOption = sec.key === 'EMKL' && rawRows.some(r => r.expected_alt?.nilai != null)
        const rows = rawRows.map(row => {
          if (sec.key === 'EMKL' && jalurMerah && row.expected_alt?.nilai != null) {
            const expAlt = row.expected_alt.nilai
            const sel = row.actual != null ? Number(row.actual) - Number(expAlt) : null
            let st = 'BELUM_LENGKAP'
            if (row.actual != null && expAlt != null && row.actual !== '' && expAlt !== '') {
              const tol = row.mata_uang === 'USD' ? 1 : 1000
              if (Math.abs(sel as number) <= tol) st = 'MATCH'
              else if ((sel as number) > tol) st = 'OVERCHARGE'
              else st = 'UNDERCHARGE'
            }
            return { ...row, expected: expAlt, selisih: sel, status: st, isAlt: true }
          }
          return row
        })
        const detail = rows.filter(r => !isSummaryCostRow(r))
        const hasOver = detail.some(r => r.status === 'OVERCHARGE')
        const hasUnder = detail.some(r => r.status === 'UNDERCHARGE')
        const hasIssue = hasOver || hasUnder
        const anyIncomplete = detail.some(r => r.status !== 'MATCH' && r.status !== 'OVERCHARGE' && r.status !== 'UNDERCHARGE')
        const conf = catatanMap[sec.key] || null
        const vendor = rows.find(r => r.vendor_name)?.vendor_name || ''
        const totalRow = rows.find(r => String(r.row || '').toUpperCase() === 'TOTAL') || rows.find(r => String(r.row || '').toUpperCase() === 'TOTAL KESELURUHAN')
        const amount = totalRow && totalRow.actual != null && totalRow.actual !== '' ? Number(totalRow.actual) : detail.reduce((s, r) => s + (Number(r.actual) || 0), 0)
        const amountRow = totalRow || detail[0] || {}
        const overSum = detail.filter(r => r.status === 'OVERCHARGE').reduce((s, r) => s + (Number(r.selisih) || 0), 0)
        let pill: { tone: Tone; text: string }
        if (sec.confirmable && conf) pill = conf.status_konfirmasi === 'MATCH' ? { tone: 'green', text: 'Reviewed · accepted' } : { tone: 'red', text: 'Reviewed · ask vendor' }
        else if (hasOver && hasUnder) pill = { tone: 'amber', text: 'Needs review' }
        else if (hasOver) pill = { tone: 'red', text: 'Overcharge' }
        else if (hasUnder) pill = { tone: 'amber', text: 'Undercharge' }
        else if (anyIncomplete) pill = { tone: 'grey', text: 'Incomplete' }
        else pill = { tone: 'green', text: 'Match' }
        const isOpen = open[sec.key] ?? (hasIssue && !conf)
        const draft = getDraft(sec.key)
        const showReviewForm = sec.confirmable && canEdit && (reviewOpen[sec.key] || (hasIssue && !conf))

        return (
          <div key={sec.key} className={`${SA_CARD} overflow-hidden`}>
            <button type="button" onClick={() => setOpen(p => ({ ...p, [sec.key]: !isOpen }))} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-[#FBF7F4]">
              {isOpen ? <ChevronDown size={15} className="text-[#6E5E70]" /> : <ChevronRight size={15} className="text-[#6E5E70]" />}
              <div className="mr-auto min-w-0">
                <div className="text-[13.5px] font-bold text-[#3B1B3D]">{sec.label}</div>
                <div className="text-[11.5px] text-[#6E5E70] truncate">{vendor || '—'}</div>
              </div>
              {overSum > 0 && <span className="text-[12px] font-bold text-[#A8231A] tabular-nums">+{fmtAmount(amountRow, overSum).replace(/^Rp /, '')} over</span>}
              <span className="text-[14px] font-bold text-[#3B1B3D] tabular-nums">{fmtAmount(amountRow, amount)}</span>
              <Pill tone={pill.tone}>{pill.text}</Pill>
            </button>

            {isOpen && (
              <div className="border-t border-[#EADFD6]">
                {(sec.key === 'FREIGHT_ORIGIN' || sec.key === 'FREIGHT_DESTINATION') && (
                  // Quotation freight per BL (keputusan user bagian 2): BARU tombolnya. Pembacaan
                  // quotation oleh AI (n8n) menyusul -- belum ada tabel/endpoint, jadi klik = info saja.
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2">
                    <span className="text-[11px] text-[#8A7A8B]">Freight is validated against the quotation for this BL.</span>
                    {canEditPage && !locked && (
                      <button type="button" className="text-[12px] font-semibold text-[#6B3470] hover:underline"
                        onClick={() => window.alert('Quotation upload is coming soon — AI reading of freight quotations per BL is not connected yet.')}>
                        + Add quotation
                      </button>
                    )}
                  </div>
                )}
                {hasJalurOption && (
                  <div className="flex items-center justify-end gap-2 px-4 pt-2">
                    <span className="text-[11px] text-[#8A7A8B]">Customs lane (Jalur Merah rarely used)</span>
                    <div className="inline-flex p-0.5 rounded-lg bg-[#F5EDF3]">
                      <button type="button" onClick={() => setJalurMerah(false)} className={`px-2.5 h-7 rounded-md text-[11px] font-bold ${!jalurMerah ? 'bg-white text-[#17663D] shadow-sm' : 'text-[#6E5E70]'}`}>Green line</button>
                      <button type="button" onClick={() => setJalurMerah(true)} className={`px-2.5 h-7 rounded-md text-[11px] font-bold ${jalurMerah ? 'bg-white text-[#A8231A] shadow-sm' : 'text-[#6E5E70]'}`}>Red line</button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[640px]">
                    <thead>
                      <tr className="bg-[#FBF7F4] border-b border-[#EADFD6]">
                        <th className={`${SA_LABEL} text-left px-4 py-2`}>Item</th>
                        <th className={`${SA_LABEL} text-right px-3 py-2`}>Expected{jalurMerah && hasJalurOption ? ' (red line)' : ''}</th>
                        <th className={`${SA_LABEL} text-right px-3 py-2`}>Actual</th>
                        <th className={`${SA_LABEL} text-right px-3 py-2`}>Difference</th>
                        <th className={`${SA_LABEL} text-right px-4 py-2`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const summary = isSummaryCostRow(row)
                        const text = String(row.row || '')
                        const m = text.match(/^(.*?)\s*(\(.*?\))$/)
                        const tol = toleranceFor(row)
                        const diffBad = row.selisih != null && row.selisih !== '' && Math.abs(Number(row.selisih)) > tol
                        return (
                          <tr key={i} className={`border-b border-[#F1E8E1] last:border-b-0 ${summary ? 'bg-[#FBF7F4]' : ''}`}>
                            <td className="px-4 py-2 align-top">
                              <div className={`flex items-center gap-1.5 ${summary ? 'font-bold' : 'font-semibold'} text-[#3B1B3D]`}>
                                {m ? m[1] : text}
                                {row.manual && !summary && <Pencil size={11} className="text-[#E0A526]" aria-label="Edited manually" />}
                              </div>
                              {m && <div className="text-[11px] text-[#6E5E70]">{m[2]}</div>}
                              {!m && row.vendor_name && !summary && <div className="text-[11px] text-[#6E5E70]">{row.vendor_name}</div>}
                              {row.catatan && <div className="text-[11px] text-[#8A7A8B] mt-0.5 flex items-start gap-1"><Info size={11} className="mt-[2px] shrink-0" />{row.catatan}</div>}
                            </td>
                            <td className={`px-3 py-2 text-right align-top ${row.isAlt ? 'text-[#A8231A]' : 'text-[#6E5E70]'}`}>
                              <EditableAmount editable={isEditMode && canEdit} row={row} val={row.expected} onSave={v => updateCheck(row.section, row.row, row.vendor_name, row.isAlt ? 'expected_alt.nilai' : 'expected', v)} />
                            </td>
                            <td className={`px-3 py-2 text-right align-top ${summary ? 'font-bold' : 'font-semibold'} text-[#3B1B3D]`}>
                              <EditableAmount editable={isEditMode && canEdit} row={row} val={row.actual} onSave={v => updateCheck(row.section, row.row, row.vendor_name, 'actual', v)} />
                            </td>
                            <td className={`px-3 py-2 text-right align-top tabular-nums ${diffBad ? 'text-[#A8231A] font-bold' : 'text-[#17663D]'}`}>
                              {row.selisih != null && row.selisih !== '' ? `${Number(row.selisih) > 0 ? '+' : ''}${fmtAmount(row, row.selisih)}` : '—'}
                            </td>
                            <td className="px-4 py-2 text-right align-top">{summary ? null : rowStatusChip(row.status)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Review (konfirmasi manual per segmen) */}
                {sec.confirmable && (
                  <div className="px-4 py-3 border-t border-[#EADFD6] bg-[#FFFCFA]">
                    {conf && !reviewOpen[sec.key] ? (
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className={`font-bold ${conf.status_konfirmasi === 'MATCH' ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>
                          {conf.status_konfirmasi === 'MATCH' ? '✓ Reviewed — difference accepted' : '↺ Reviewed — vendor asked to revise'}
                        </span>
                        <span className="text-[#6E5E70]">by {conf.dikonfirmasi_oleh || '—'}{conf.dikonfirmasi_at ? ` · ${fmtDateShort(conf.dikonfirmasi_at)}` : ''}</span>
                        {conf.catatan && <span className="text-[#3B1B3D] whitespace-pre-wrap">· {conf.catatan}</span>}
                        {canEdit && (
                          <span className="ml-auto flex items-center gap-2">
                            <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={() => setReviewOpen(p => ({ ...p, [sec.key]: true }))}>Change</button>
                            <button type="button" disabled={!!catatanSaving[sec.key]} className="text-[#A8231A] font-semibold hover:underline disabled:opacity-50" onClick={() => undoReview(sec.key)}>Undo</button>
                          </span>
                        )}
                      </div>
                    ) : showReviewForm ? (
                      <div className="flex flex-col md:flex-row md:items-start gap-2">
                        <span className="text-[12px] font-bold text-[#3B1B3D] md:pt-2 shrink-0">Your review</span>
                        <div className="inline-flex p-0.5 rounded-xl border border-[#EADFD6] bg-white shrink-0 h-fit">
                          <button type="button" onClick={() => setCatatanDraft(p => ({ ...p, [sec.key]: { ...draft, status: 'MATCH' } }))}
                            className={`px-3 h-8 rounded-lg text-[11.5px] font-bold flex items-center gap-1 ${draft.status === 'MATCH' ? 'bg-[#17663D] text-white' : 'text-[#3B1B3D] hover:bg-[#F6EFEA]'}`}>
                            <Check size={12} /> Accept difference
                          </button>
                          <button type="button" onClick={() => setCatatanDraft(p => ({ ...p, [sec.key]: { ...draft, status: 'MISMATCH' } }))}
                            className={`px-3 h-8 rounded-lg text-[11.5px] font-bold flex items-center gap-1 ${draft.status === 'MISMATCH' ? 'bg-[#A8231A] text-white' : 'text-[#3B1B3D] hover:bg-[#F6EFEA]'}`}>
                            <RotateCcw size={12} /> Ask vendor to revise
                          </button>
                        </div>
                        <input
                          value={draft.catatan}
                          onChange={e => setCatatanDraft(p => ({ ...p, [sec.key]: { ...draft, catatan: e.target.value } }))}
                          placeholder={draft.status === 'MISMATCH' ? 'Note required (what should the vendor revise?)' : 'Note (e.g. agreed with vendor / claim the difference)'}
                          className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[#EADFD6] text-[12.5px] focus:outline-none focus:border-[#6B3470]"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          {reviewOpen[sec.key] && (
                            <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setReviewOpen(p => ({ ...p, [sec.key]: false })); setCatatanDraft(p => { const n = { ...p }; delete n[sec.key]; return n }) }}>Cancel</button>
                          )}
                          <button type="button" className={SA_BTN_PRIMARY} disabled={!!catatanSaving[sec.key] || (draft.status === 'MISMATCH' && !draft.catatan.trim())} onClick={() => saveReview(sec.key)}>
                            {catatanSaving[sec.key] ? 'Saving…' : 'Save review'}
                          </button>
                        </div>
                      </div>
                    ) : canEdit ? (
                      <button type="button" className="text-[12px] font-semibold text-[#6B3470] hover:underline" onClick={() => setReviewOpen(p => ({ ...p, [sec.key]: true }))}>+ Add review</button>
                    ) : (
                      <span className="text-[12px] text-[#8A7A8B]">Not reviewed</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Duty & tax (PIB) -- disembunyikan di mode Finance */}
      {!financeView && (<>
      <div className={`${SA_CARD} overflow-hidden`}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-bold text-[#3B1B3D]">Duty &amp; tax (PIB)</div>
            <div className="text-[11.5px] text-[#6E5E70]">Not part of the landed cost · paid via Billing DJBC</div>
          </div>
          {duty && <span className="text-[12px] text-[#6E5E70]">Import value <b className="text-[#3B1B3D] tabular-nums">{fmtRp(duty.importValueStored ?? duty.importValueCalc)}</b></span>}
        </div>
        {!duty ? (
          <div className="px-4 pb-4 text-[12.5px] text-[#6E5E70]">No PIB linked to this shipment yet.</div>
        ) : (
          <>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                  <th className={`${SA_LABEL} text-left px-4 py-2`}>Item · rate</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Expected (calculation)</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Actual (PIB)</th>
                  <th className={`${SA_LABEL} text-right px-4 py-2`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {duty.rows.map(r => (
                  <tr key={r.key} className="border-b border-[#F1E8E1]">
                    <td className="px-4 py-2"><div className="font-semibold text-[#3B1B3D]">{r.label}</div><div className="text-[11px] text-[#8A7A8B]">Rate {fmtPctShort(r.rate)}{r.key === 'bm' ? ' (BM ÷ customs value)' : ''}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70]">{r.status === 'derived' || r.calculated === null ? '—' : fmtRp(r.calculated)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(r.onPib)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.status === 'match' ? <Chip tone="green">Match</Chip> : r.status === 'differs' ? <Chip tone="red">{(r.diff ?? 0) > 0 ? '+' : '−'}{fmtRp(Math.abs(r.diff ?? 0))}</Chip> : <Chip tone="grey">{r.status === 'derived' ? 'Derived' : 'No rate'}</Chip>}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FBF7F4]">
                  <td className="px-4 py-2 font-bold text-[#3B1B3D]">Total PIB</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70]">{fmtRp(duty.sumOnPib)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-[#3B1B3D]">{fmtRp(auditRow.total_pib)}</td>
                  <td className="px-4 py-2 text-right">{duty.totalMatches ? <Chip tone="green">Match</Chip> : <Chip tone="red">Differs</Chip>}</td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-2.5 text-[12px] text-[#6E5E70]">
              SPTNP: {hasSptnp ? <b className="text-[#3B1B3D]">{auditRow.no_sptnp || '—'} · {fmtDateShort(auditRow.tgl_sptnp)} · {fmtRp(auditRow.sptnp_total)}</b> : 'None'}
            </div>
          </>
        )}
      </div>
      </>)}

      {/* Bar simpan perubahan Expected/Actual */}
      {hasUnsaved && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 px-4 py-3 rounded-[14px] bg-white border border-[#E0A526] shadow-lg">
          <span className="text-[12.5px] font-bold text-[#7A4F00] mr-auto">Unsaved changes in cost validation</span>
          <button type="button" className={SA_BTN_OUTLINE} disabled={saving} onClick={() => { if (window.confirm('Discard the unsaved changes?')) { setIsEditMode(false); load() } }}>Discard</button>
          <button type="button" className={SA_BTN_PRIMARY} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}
    </div>
  )
}
