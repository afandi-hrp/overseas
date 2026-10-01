// Tab "Documents" jendela Open Invoice Recap Sea & Air (2026-10-01, DIBANGUN ULANG PENUH -- keputusan
// user). Kiri: Checklist (dokumen_checklist_seaair, baca saja -- sama dgn SeaAirChecklistModal).
// Kanan: Document validation. Data & cara simpan SAMA PERSIS dgn modal lama `SeaAirValidasiModal.tsx`
// (masih dipakai mode List):
// - load `dokumen_validasi_matriks_seaair` -> checks di-`relaxSeaAirDocChecks` (sama modal lama),
// - toggle status: PER BARIS utk INVOICE_FCL / EMKL / ACTUAL (toggleRowStatus), PER SEL utk
//   FAKTUR_PAJAK / PIB (toggleCheckStatus); VESSEL tanpa status. Toggle 2 arah: bukan Match -> Match,
//   Match -> Mismatch; selalu `manual: true`,
// - koreksi nilai dokumen (`values.doc`) -> `manual: true`, parsing angka sama modal lama,
// - DUTY: NDPBM + item (nilai pabean, %BM/%PPN/%PPh) + Actual (PIB), status toleransi Rp 3.000,
// - simpan: RPC `update_validasi_matriks_manual` (p_checks, p_duty_items, p_duty_aktual,
//   p_duty_ndpbm) + verifikasi panjang checks.
// KALAU modal lama diubah, WAJIB sinkron ke file ini juga.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Circle, ChevronDown, ChevronRight, Pencil, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LoadingState } from './LoadingState'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY, Chip, Pill } from './SeaAirAuditUi'
import { relaxSeaAirDocChecks, SEA_AIR_PIB_MATRIX_ROWS, toNum } from '../utils/SeaAirValidasiHelpers'

// ── Salinan PERSIS formatter/parser modal lama ──
const fmtIDR = (val: any) => {
  if (val === null || val === undefined || val === '' || val === '—') return '—'
  if (typeof val === 'number') return 'Rp' + val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const s = String(val).trim()
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'Rp' + parseFloat(s).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return s
}
const fmtNum = (val: any) => {
  if (val === null || val === undefined || val === '' || val === '—') return '—'
  if (typeof val === 'number') return val.toLocaleString('en-US', { maximumFractionDigits: 4 })
  const s = String(val).trim()
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s).toLocaleString('en-US', { maximumFractionDigits: 4 })
  return s
}
const fmtForeign = (val: any) => {
  if (val === null || val === undefined || val === '' || val === '—') return '—'
  if (typeof val === 'number') return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const s = String(val).trim()
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return s
}
const parseIndoInput = (val: string) => {
  if (!val) return val
  const s = val.trim()
  if (/^-?[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$/.test(s) || /^-?[0-9]+(,[0-9]+)?$/.test(s)) {
    const num = parseFloat(s.replace(/\./g, '').replace(',', '.'))
    if (!isNaN(num)) return num
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  return val
}
const parseForeignInput = (val: string) => {
  if (!val) return val
  const s = val.trim()
  if (/^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/.test(s) || /^-?[0-9]+(\.[0-9]+)?$/.test(s)) {
    const num = parseFloat(s.replace(/,/g, ''))
    if (!isNaN(num)) return num
  }
  return val
}

// ── Struktur section -- SAMA dgn konstanta modal lama ──
type ValueKind = 'text' | 'idr' | 'foreign' | 'number'
type SectionDef = {
  key: string; label: string; sub: string
  toggle: 'row' | 'cell' | 'none'
  rows: { db: string; label: string; cols: string[] }[]
  kind: (row: string, col: string) => ValueKind
  noStatus?: (row: string) => boolean
}
const INVOICE_COLS = ['PPJK', 'Freight Origin', 'Freight Destination', 'Storage', 'Laporan Surveyor (opsional)', 'LOLO', 'Trucking']
const SECTIONS: SectionDef[] = [
  { key: 'INVOICE_FCL', label: 'Invoice', sub: 'Nama PT, vendor and amount read from each invoice', toggle: 'row',
    rows: ['Nama PT', 'Nama Vendor', 'Nominal'].map(r => ({ db: r, label: r, cols: INVOICE_COLS })),
    kind: row => (row === 'Nominal' ? 'idr' : 'text') },
  { key: 'FAKTUR_PAJAK', label: 'Faktur pajak', sub: 'Nominal on the invoice = nominal on the faktur pajak', toggle: 'cell',
    rows: ['Nama Vendor', 'Nama PT', 'Nominal', 'Nama Barang Kena Pajak'].map(r => ({ db: r, label: r, cols: INVOICE_COLS })),
    kind: row => (row === 'Nominal' ? 'idr' : 'text'), noStatus: row => row === 'Nama Barang Kena Pajak' },
  { key: 'PIB', label: 'PIB cross-check', sub: 'The same field must be identical on every document', toggle: 'cell',
    rows: SEA_AIR_PIB_MATRIX_ROWS.map(r => ({ db: r.dbRow, label: r.label, cols: r.required })),
    kind: (row, col) => (row === 'TOTAL DUTY (PIB No. 44)' ? 'idr' : row === 'TOTAL CIPL (PIB No. 23)' && col !== 'Bukti TF' ? 'foreign' : 'text') },
  { key: 'EMKL', label: 'PPJK ↔ PIB', sub: 'PPJK and importer on the PPJK invoice vs the PIB', toggle: 'row',
    rows: ['Nama PPJK', 'Nama Importir'].map(r => ({ db: r, label: r, cols: ['Invoice EMKL'] })), kind: () => 'text' },
  { key: 'ACTUAL', label: 'Freight & storage ↔ PIB', sub: 'Shipment data on the freight invoice, PIB and storage invoice', toggle: 'row',
    rows: ['AWB No', 'QTY', 'KG', 'CBM', 'Origin', 'Destination'].map(r => ({ db: r, label: r, cols: ['Inv. Freight', 'Inv. Storage'] })),
    kind: row => (row === 'KG' || row === 'CBM' || row === 'QTY' ? 'number' : 'text') },
  { key: 'VESSEL', label: 'Other · vessel name', sub: 'Vessel name on CIPL, PO and final invoice', toggle: 'none',
    rows: [{ db: 'Vessel Name', label: 'Vessel name', cols: ['CIPL', 'PO', 'Final Invoice'] }], kind: () => 'text' },
]

const fmtValue = (kind: ValueKind, v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  if (kind === 'idr') return fmtIDR(typeof v === 'number' ? v : toNum(v))
  if (kind === 'foreign') return fmtForeign(v)
  if (kind === 'number') return fmtNum(v)
  return String(v)
}
const parseValue = (kind: ValueKind, s: string) => (kind === 'foreign' || kind === 'number' ? parseForeignInput(s) : kind === 'idr' ? parseIndoInput(s) : s)
const aggMatch = (cs: any[]): boolean | null => {
  if (cs.length === 0 || cs.every(c => c.match === null || c.match === undefined)) return null
  if (cs.some(c => c.match === false)) return false
  return true
}
const MatchChip: React.FC<{ m: boolean | null; manual?: boolean; label?: string }> = ({ m, manual, label }) => (
  m === true ? <Chip tone="green"><CheckCircle2 size={11} />{label ?? 'Match'}{manual ? ' ✎' : ''}</Chip>
    : m === false ? <Chip tone="red"><XCircle size={11} />{label ?? 'Mismatch'}{manual ? ' ✎' : ''}</Chip>
    : <Chip tone="amber"><Circle size={11} />{label ?? 'Not checked'}{manual ? ' ✎' : ''}</Chip>
)

let itemSeq = 1
const newItem = () => ({ id: `item${itemSeq++}`, nilaiPabean: '', bmPct: '', ppnPct: '11', phPct: '' })
const keyOf = (c: any) => `${c.section}|${c.row}|${c.col}`

const REQUIRED_DOCS = [
  ['ada_po', 'PO'], ['ada_final_invoice', 'Final invoice'], ['ada_cipl', 'CIPL'], ['ada_bl', 'BL / AWB'],
  ['ada_pib', 'PIB'], ['ada_sppb', 'SPPB'], ['ada_billing_djbc', 'Billing DJBC'], ['ada_bpn', 'BPN'],
  ['ada_bt_vendor', 'BT Vendor'], ['ada_invoice_ppjk', 'Invoice PPJK'],
]
// 3 terakhir (surveyor & asuransi) hanya tampil kalau kolomnya ada di baris checklist.
const OPTIONAL_DOCS = [
  ['ada_form_e', 'Form E'], ['ada_e_coo', 'E-COO'], ['ada_form_ak', 'Form AK'], ['ada_sptnp', 'SPTNP'],
  ['ada_billing_sptnp', 'Billing SPTNP'], ['ada_bpn_sptnp', 'BPN SPTNP'],
  ['ada_invoice_surveyor', 'Invoice surveyor'], ['ada_laporan_surveyor', 'Surveyor report'], ['ada_insurance', 'Insurance'],
]
const ALWAYS_OPTIONAL = new Set(['ada_form_e', 'ada_e_coo', 'ada_form_ak', 'ada_sptnp', 'ada_billing_sptnp', 'ada_bpn_sptnp'])

export default function SeaAirRecapDocumentsTab({ seaairId, canEdit: canEditPage, isAdmin = false, locked = false, onChanged, onDirtyChange }: {
  seaairId: any
  canEdit: boolean
  isAdmin?: boolean   // bagian 2 (sql/031): accept / mismatch / koreksi nilai HANYA Admin
  locked?: boolean    // sudah Submit to Finance -> read-only
  onChanged: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  // canEdit = konfirmasi dokumen (Admin saja); canEditDuty = edit Duty (hak edit halaman biasa).
  const canEdit = canEditPage && isAdmin && !locked
  const canEditDuty = canEditPage && !locked
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState<any>(null)
  const [matriksId, setMatriksId] = useState<any>(null)
  const [checks, setChecks] = useState<any[]>([])
  const [snapshot, setSnapshot] = useState<Record<string, any>>({})
  const [ndpbm, setNdpbm] = useState('')
  const [items, setItems] = useState<any[]>([newItem()])
  const [dutyAktual, setDutyAktual] = useState({ bm: '', ppn: '', pph: '', total: '' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null)
  const [dutyEdit, setDutyEdit] = useState(false)
  const [showItems, setShowItems] = useState(false)

  const markDirty = () => setDirty(true)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  const showToast = (msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    setEditing(null)
    if (!seaairId) { setChecklist(null); setMatriksId(null); setChecks([]); setLoading(false); setDirty(false); return }
    const [cl, m] = await Promise.all([
      supabase.from('dokumen_checklist_seaair').select('*').eq('seaair_id', seaairId).limit(1).maybeSingle(),
      supabase.from('dokumen_validasi_matriks_seaair').select('*').eq('seaair_id', seaairId).limit(1).maybeSingle(),
    ])
    if (cl.error) console.error('[SeaAirRecap] checklist gagal', cl.error)
    if (m.error) console.error('[SeaAirRecap] matriks gagal', m.error)
    setChecklist(cl.data || null)
    const data: any = m.data
    if (data) {
      setMatriksId(data.id)
      const relaxed = relaxSeaAirDocChecks(Array.isArray(data.checks) ? data.checks.map((c: any) => ({ ...c, values: c.values ? { ...c.values } : c.values })) : [])
      setChecks(relaxed)
      // Section yg punya mismatch saat DIMUAT terbuka otomatis; TIDAK ikut menutup sendiri saat
      // mismatch-nya di-accept (supaya hasil review & Undo tetap terlihat).
      const initOpen: Record<string, boolean> = {}
      relaxed.forEach((c: any) => { if (c.match === false) initOpen[c.section] = true })
      setOpen(initOpen)
      const snap: Record<string, any> = {}
      relaxed.forEach((c: any) => { snap[keyOf(c)] = JSON.parse(JSON.stringify(c)) })
      setSnapshot(snap)
      const toStr = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v))
      setNdpbm(data.duty_ndpbm ? toStr(data.duty_ndpbm) : '')
      setItems(Array.isArray(data.duty_items) && data.duty_items.length > 0
        ? data.duty_items.map((it: any, idx: number) => ({
          id: `item${idx + 1}`,
          nilaiPabean: toStr(it.nilai_pabean),
          bmPct: it.bm_pct !== undefined && it.bm_pct !== null ? toStr(it.bm_pct) : '',
          ppnPct: it.ppn_pct !== undefined && it.ppn_pct !== null ? toStr(it.ppn_pct) : '11',
          phPct: it.pph_pct !== undefined && it.pph_pct !== null ? toStr(it.pph_pct) : '',
        }))
        : [newItem()])
      const a = data.duty_aktual
      setDutyAktual(a ? {
        bm: a.bm !== undefined && a.bm !== null ? toStr(a.bm) : '',
        ppn: a.ppn !== undefined && a.ppn !== null ? toStr(a.ppn) : '',
        pph: a.pph !== undefined && a.pph !== null ? toStr(a.pph) : '',
        total: a.total !== undefined && a.total !== null ? toStr(a.total) : '',
      } : { bm: '', ppn: '', pph: '', total: '' })
    } else {
      setMatriksId(null)
      setChecks([])
    }
    setDirty(false)
    setLoading(false)
  }, [seaairId])
  useEffect(() => { load() }, [load])

  // ── Aksi -- SALINAN logika modal lama ──
  const updateCheckValue = (section: string, row: string, col: string, newValue: any) => {
    setChecks(prev => prev.map(c => (c.section === section && c.row === row && c.col === col ? { ...c, values: { ...c.values, doc: newValue }, manual: true } : c)))
    markDirty()
  }
  const toggleCheckStatus = (section: string, row: string, col: string) => {
    setChecks(prev => prev.map(c => (c.section === section && c.row === row && c.col === col ? { ...c, match: c.match === true ? false : true, manual: true } : c)))
    markDirty()
  }
  const toggleRowStatus = (section: string, row: string) => {
    setChecks(prev => {
      const rowChecks = prev.filter(c => c.section === section && c.row === row)
      if (rowChecks.length === 0) return prev
      const current = aggMatch(rowChecks)
      const next = current === true ? false : true
      return prev.map(c => (c.section === section && c.row === row ? { ...c, match: next, manual: true } : c))
    })
    markDirty()
  }
  // Undo (khusus perubahan BELUM disimpan) -- kembalikan sel ke kondisi saat dimuat.
  const undoCells = (cs: any[]) => {
    const keys = new Set(cs.map(keyOf))
    setChecks(prev => prev.map(c => (keys.has(keyOf(c)) && snapshot[keyOf(c)] ? JSON.parse(JSON.stringify(snapshot[keyOf(c)])) : c)))
  }
  const isChanged = (c: any) => {
    const s = snapshot[keyOf(c)]
    if (!s) return false
    return s.match !== c.match || JSON.stringify(s.values?.doc ?? null) !== JSON.stringify(c.values?.doc ?? null) || !!s.manual !== !!c.manual
  }

  const save = async () => {
    if (!matriksId) { showToast('Matrix data not found, please reload.', 'error'); return }
    setSaving(true)
    const p_duty_items = items.map(it => ({ nilai_pabean: Number(it.nilaiPabean) || 0, bm_pct: Number(it.bmPct) || 0, ppn_pct: Number(it.ppnPct) || 0, pph_pct: Number(it.phPct) || 0 }))
    const p_duty_aktual = { bm: Number(dutyAktual.bm) || 0, ppn: Number(dutyAktual.ppn) || 0, pph: Number(dutyAktual.pph) || 0, total: Number(dutyAktual.total) || 0 }
    const p_duty_ndpbm = Number(ndpbm) || 0
    try {
      const { error } = await supabase.rpc('update_validasi_matriks_manual', { p_id: matriksId, p_checks: checks, p_duty_items, p_duty_aktual, p_duty_ndpbm })
      if (error) throw error
      const { data: verif, error: vErr } = await supabase.from('dokumen_validasi_matriks_seaair').select('checks').eq('id', matriksId).single()
      if (vErr) throw new Error('Changes were sent, but verification failed.')
      if (!(verif && Array.isArray(verif.checks) && verif.checks.length === checks.length)) throw new Error('Changes may not have been saved, please try again.')
      const snap: Record<string, any> = {}
      checks.forEach((c: any) => { snap[keyOf(c)] = JSON.parse(JSON.stringify(c)) })
      setSnapshot(snap)
      setDirty(false)
      setDutyEdit(false)
      showToast('Document validation saved.', 'success')
      onChanged()
    } catch (e: any) {
      console.error('[SeaAirRecap] simpan doc validation gagal', e)
      showToast('Failed to save: ' + (e?.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Statistik (sama formula globalStats modal lama) ──
  const stats = useMemo(() => {
    let match = 0, mismatch = 0, notChecked = 0, open_ = 0
    checks.forEach(c => {
      if (c.match === true) match++
      else if (c.match === false) { mismatch++; if (!c.manual) open_++ }
      else notChecked++
    })
    const total = match + mismatch
    return { match, mismatch, notChecked, openMismatch: open_, pct: total > 0 ? Math.round((match / total) * 100) : 0 }
  }, [checks])

  const dutyCalc = useMemo(() => {
    const nd = Number(ndpbm) || 0
    let bm = 0, ppn = 0, pph = 0
    items.forEach((it: any) => {
      const rp = (Number(it.nilaiPabean) || 0) * nd
      const b = rp * ((Number(it.bmPct) || 0) / 100)
      const basis = rp + b
      bm += b; ppn += basis * ((Number(it.ppnPct) || 0) / 100); pph += basis * ((Number(it.phPct) || 0) / 100)
    })
    return { bm, ppn, pph, total: bm + ppn + pph }
  }, [ndpbm, items])
  const dutyStatus = (actual: any, expected: number): boolean | null => {
    if (actual === null || actual === undefined || String(actual).trim() === '') return null
    return Math.abs(toNum(String(actual).trim()) - expected) <= 3000
  }

  if (loading) return <LoadingState fullHeight={false} />

  const pct = checklist ? Math.round(Number(checklist.pct_kelengkapan) || 0) : null
  const complete = checklist?.status_kelengkapan === 'LENGKAP' || pct === 100

  const sectionData = SECTIONS.map(sec => {
    const secChecks = checks.filter(c => c.section === sec.key)
    const rows = sec.rows.map(r => ({ ...r, cells: r.cols.map(col => secChecks.find(c => c.row === r.db && c.col === col)).filter(Boolean) as any[] }))
      .filter(r => r.cells.length > 0)
    const mismatch = secChecks.filter(c => c.match === false).length
    const match = secChecks.filter(c => c.match === true).length
    return { sec, rows, mismatch, match, total: match + mismatch }
  }).filter(s => s.rows.length > 0).sort((a, b) => b.mismatch - a.mismatch)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-3 items-start">
      {/* ── Checklist ── */}
      <div className={`${SA_CARD} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><h3 className="text-[14px] font-bold text-[#3B1B3D]">Checklist</h3>{checklist && <Pill tone={complete ? 'green' : 'red'}>{complete ? 'Complete' : 'Incomplete'}</Pill>}</div>
          <span className="text-[16px] font-bold text-[#3B1B3D]">{pct === null ? '—' : `${pct}%`}</span>
        </div>
        <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden mt-2"><div className={`h-full ${complete ? 'bg-[#17663D]' : 'bg-[#E0A526]'}`} style={{ width: `${pct || 0}%` }} /></div>
        {!checklist ? (
          <div className="text-[12px] text-[#6E5E70] mt-3">No checklist recorded for this shipment yet.</div>
        ) : (
          <>
            {checklist.dokumen_kurang && String(checklist.dokumen_kurang).trim() !== '-' && <div className="mt-2 rounded-lg bg-[#FDE7E4] text-[#A8231A] text-[12px] font-semibold px-3 py-1.5">Missing: {checklist.dokumen_kurang}</div>}
            <div className={`${SA_LABEL} mt-3 mb-1.5`}>Required</div>
            <div className="grid grid-cols-2 gap-1.5">
              {REQUIRED_DOCS.map(([k, label]) => (
                <div key={k} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[12px] ${checklist[k] ? 'border-[#D6EEDF] bg-[#F5FBF7] text-[#17663D]' : 'border-[#F4C3BC] bg-[#FFF6F4] text-[#A8231A]'}`}>
                  {checklist[k] ? <CheckCircle2 size={13} /> : <XCircle size={13} />}<span className="font-semibold text-[#3B1B3D]">{label}</span>
                </div>
              ))}
            </div>
            <div className={`${SA_LABEL} mt-3 mb-1.5`}>Optional</div>
            <div className="grid grid-cols-2 gap-1.5">
              {OPTIONAL_DOCS.filter(([k]) => ALWAYS_OPTIONAL.has(k) || Object.prototype.hasOwnProperty.call(checklist, k)).map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#EADFD6] text-[12px]">
                  <span className="text-[#3B1B3D]">{label}</span>{checklist[k] ? <CheckCircle2 size={13} className="text-[#17663D]" /> : <span className="text-[#B7A9B8]">–</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Document validation ── */}
      <div className="flex flex-col gap-3 min-w-0">
        {toast && <div className={`px-3 py-2 rounded-xl border text-[12.5px] font-semibold ${toast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{toast.msg}</div>}
        <div className={`${SA_CARD} px-4 py-3 flex flex-wrap items-center gap-3`}>
          <div className="mr-auto">
            <div className="text-[14px] font-bold text-[#3B1B3D]">Document validation</div>
            <div className="text-[11.5px] text-[#6E5E70]">AI compares the same field across documents{matriksId ? ` · ${stats.pct}% match` : ''}</div>
          </div>
          {([
            ['Match', stats.match, 'bg-[#EAF6EF] text-[#17663D]'],
            ['Mismatch', stats.mismatch, 'bg-[#FDE7E4] text-[#A8231A]'],
            ['Not checked', stats.notChecked, 'bg-[#F3EEEA] text-[#6E5E70]'],
          ] as const).map(([l, v, cls]) => (
            <div key={l} className={`min-w-[78px] px-3 py-1.5 rounded-xl text-center ${cls}`}><div className="text-[18px] font-bold leading-tight tabular-nums">{v}</div><div className="text-[10px] font-semibold">{l}</div></div>
          ))}
        </div>

        {canEditPage && !canEdit && matriksId && (
          <div className="rounded-xl border border-[#EADFD6] bg-white px-4 py-2 text-[11.5px] text-[#6E5E70]">
            {locked ? 'Locked — this shipment has been submitted to Finance. Ask an Admin to unlock it first.' : 'Accepting, marking or correcting document values can only be confirmed by an Admin. You can still edit the duty calculation.'}
          </div>
        )}
        {!matriksId ? (
          <div className={`${SA_CARD} px-4 py-5 text-[12.5px] text-[#6E5E70]`}>Document validation has not been run for this shipment yet.</div>
        ) : (
          <>
            {stats.openMismatch > 0 ? (
              <div className="rounded-[14px] border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-2 text-[12.5px] font-semibold text-[#A8231A]">{stats.openMismatch} mismatch{stats.openMismatch === 1 ? '' : 'es'} not yet confirmed — accept, correct the value, or keep as mismatch.</div>
            ) : stats.mismatch > 0 ? (
              <div className="rounded-[14px] border border-[#BFE3CD] bg-[#EAF6EF] px-4 py-2 text-[12.5px] font-semibold text-[#17663D]">✓ Mismatch reviewed manually</div>
            ) : null}

            {sectionData.map(({ sec, rows, mismatch, match, total }) => {
              const isOpen = !!open[sec.key]
              return (
                <div key={sec.key} className={`${SA_CARD} overflow-hidden`}>
                  <button type="button" onClick={() => setOpen(p => ({ ...p, [sec.key]: !isOpen }))} className="w-full flex flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FBF7F4]">
                    {mismatch > 0 ? <XCircle size={16} className="text-[#A8231A]" /> : <CheckCircle2 size={16} className="text-[#17663D]" />}
                    <div className="mr-auto min-w-0"><div className="text-[13px] font-bold text-[#3B1B3D]">{sec.label}</div><div className="text-[11px] text-[#6E5E70]">{sec.sub}</div></div>
                    {sec.toggle !== 'none' && <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{match} / {total} match</span>}
                    {sec.toggle !== 'none' && <Pill tone={mismatch > 0 ? 'red' : 'green'}>{mismatch > 0 ? `${mismatch} mismatch` : 'All match'}</Pill>}
                    <span className="text-[11.5px] text-[#6B3470] font-semibold flex items-center gap-1">{isOpen ? 'Hide' : `Show all ${rows.length} field${rows.length === 1 ? '' : 's'}`}{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#EADFD6] divide-y divide-[#F1E8E1]">
                      {rows.map(r => {
                        const rowAgg = aggMatch(r.cells)
                        const ref = r.cells.find((c: any) => c.values?.ref != null && String(c.values.ref).trim() !== '')?.values?.ref
                        const refKind = sec.kind(r.db, r.cols[0])
                        const rowChanged = r.cells.some(isChanged)
                        return (
                          <div key={r.db} className="px-4 py-2.5 grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] gap-3">
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#3B1B3D]">{r.label}</div>
                              {ref != null && <div className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]">Reference: {sec.key === 'PIB' && r.db === 'TOTAL CIPL (PIB No. 23)' ? fmtForeign(toNum(ref)) : fmtValue(refKind, ref)}</div>}
                              {sec.toggle === 'row' && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <MatchChip m={rowAgg} manual={r.cells.some((c: any) => c.manual)} />
                                  {canEdit && (rowAgg === true
                                    ? <button type="button" className="text-[11px] font-semibold text-[#A8231A] hover:underline" onClick={() => toggleRowStatus(sec.key, r.db)}>Mark mismatch</button>
                                    : <button type="button" className="text-[11px] font-semibold text-[#17663D] hover:underline" onClick={() => toggleRowStatus(sec.key, r.db)}>✓ Checked — accept</button>)}
                                  {canEdit && rowChanged && <button type="button" className="text-[11px] font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-0.5" onClick={() => undoCells(r.cells)}><RotateCcw size={10} />Undo</button>}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 min-w-0">
                              {r.cells.map((c: any) => {
                                const kind = sec.kind(r.db, c.col)
                                const k = keyOf(c)
                                const doc = c.values?.doc
                                // TOTAL CIPL × Bukti TF: nilai gabungan "+" ditotal & dibandingkan ke ref (tampilan, sama modal lama).
                                let cellMatch = c.match
                                let buktiSum: number | null = null
                                if (sec.key === 'PIB' && r.db === 'TOTAL CIPL (PIB No. 23)' && c.col === 'Bukti TF' && doc != null && String(doc) !== '') {
                                  buktiSum = String(doc).split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean).reduce((a, p) => a + toNum(p), 0)
                                  if (!c.manual && ref != null) cellMatch = Math.abs(buktiSum - toNum(ref)) <= 1
                                }
                                const showStatus = sec.toggle !== 'none' && !(sec.noStatus && sec.noStatus(r.db))
                                const changed = isChanged(c)
                                return (
                                  <div key={k} className={`flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cellMatch === false && showStatus ? 'border-[#F4C3BC] bg-[#FFF8F7]' : 'border-[#F1E8E1] bg-white'}`}>
                                    <span className="text-[11px] font-semibold text-[#6E5E70] w-[150px] shrink-0 truncate" title={c.col}>{c.col}</span>
                                    {editing?.key === k ? (
                                      <input
                                        autoFocus
                                        value={editing.value}
                                        onChange={e => setEditing({ key: k, value: e.target.value })}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') { const orig = doc === null || doc === undefined ? '' : String(doc); if (editing.value !== orig) updateCheckValue(c.section, c.row, c.col, parseValue(kind, editing.value)); setEditing(null) }
                                          if (e.key === 'Escape') setEditing(null)
                                        }}
                                        onBlur={() => { const orig = doc === null || doc === undefined ? '' : String(doc); if (editing.value !== orig) updateCheckValue(c.section, c.row, c.col, parseValue(kind, editing.value)); setEditing(null) }}
                                        className="flex-1 min-w-[160px] h-8 px-2 rounded-md border border-[#6B3470] text-[12px] focus:outline-none"
                                      />
                                    ) : (
                                      <span className="flex-1 min-w-0 text-[12px] text-[#3B1B3D] [overflow-wrap:anywhere]">
                                        {fmtValue(kind, doc)}
                                        {buktiSum !== null && <span className="text-[11px] text-[#6E5E70] italic"> · total {buktiSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                        {c.note && <span className="text-[11px] text-[#6E5E70]"> · {c.note}</span>}
                                      </span>
                                    )}
                                    {showStatus && <MatchChip m={cellMatch} manual={c.manual} />}
                                    {sec.toggle === 'none' && <Chip tone={doc != null && String(doc) !== '' ? 'blue' : 'grey'}>{doc != null && String(doc) !== '' ? 'Has data' : 'Empty'}</Chip>}
                                    {canEdit && editing?.key !== k && (
                                      <span className="flex items-center gap-2 text-[11px] font-semibold">
                                        {sec.toggle === 'cell' && showStatus && (c.match === true
                                          ? <button type="button" className="text-[#A8231A] hover:underline" onClick={() => toggleCheckStatus(c.section, c.row, c.col)}>Mark mismatch</button>
                                          : <button type="button" className="text-[#17663D] hover:underline" onClick={() => toggleCheckStatus(c.section, c.row, c.col)}>✓ Checked — accept</button>)}
                                        <button type="button" className="text-[#6B3470] hover:underline inline-flex items-center gap-0.5" title="AI read it wrong — correct the value on this document" onClick={() => setEditing({ key: k, value: doc === null || doc === undefined ? '' : String(doc) })}><Pencil size={10} />Correct</button>
                                        {changed && sec.toggle !== 'row' && <button type="button" className="text-[#6E5E70] hover:underline inline-flex items-center gap-0.5" onClick={() => undoCells([c])}><RotateCcw size={10} />Undo</button>}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* ── Duty ── */}
            <div className={`${SA_CARD} overflow-hidden`}>
              <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                  <div className="text-[13px] font-bold text-[#3B1B3D]">Duty</div>
                  <div className="text-[11px] text-[#6E5E70]">Expected from customs value × rate vs actual on the PIB (tolerance Rp 3.000)</div>
                </div>
                {canEditDuty && <button type="button" className={dutyEdit ? SA_BTN_PRIMARY : SA_BTN_OUTLINE} onClick={() => setDutyEdit(v => !v)}><Pencil size={12} /> {dutyEdit ? 'Editing duty' : 'Edit duty'}</button>}
              </div>
              <div className="px-4 pb-2 flex flex-wrap items-center gap-3 text-[12px]">
                <span className="text-[#6E5E70]">NDPBM</span>
                {dutyEdit ? <input type="number" value={ndpbm} onChange={e => { setNdpbm(e.target.value); markDirty() }} className="w-28 h-8 px-2 rounded-md border border-[#EADFD6] text-right" />
                  : <b className="text-[#3B1B3D] tabular-nums">{ndpbm ? fmtNum(ndpbm) : '—'}</b>}
                <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={() => setShowItems(v => !v)}>{showItems ? 'Hide' : 'Show'} customs items ({items.length})</button>
              </div>
              {showItems && (
                <div className="px-4 pb-3">
                  <table className="w-full text-[12px] border border-[#EADFD6] rounded-lg overflow-hidden">
                    <thead><tr className="bg-[#FBF7F4]">
                      <th className={`${SA_LABEL} px-2 py-1.5 text-left`}>No</th><th className={`${SA_LABEL} px-2 py-1.5 text-right`}>Customs value</th>
                      <th className={`${SA_LABEL} px-2 py-1.5 text-right`}>% BM</th><th className={`${SA_LABEL} px-2 py-1.5 text-right`}>% PPN</th><th className={`${SA_LABEL} px-2 py-1.5 text-right`}>% PPh</th>
                      {dutyEdit && <th />}
                    </tr></thead>
                    <tbody>
                      {items.map((it: any, i: number) => (
                        <tr key={it.id} className="border-t border-[#F1E8E1]">
                          <td className="px-2 py-1">{i + 1}</td>
                          {(['nilaiPabean', 'bmPct', 'ppnPct', 'phPct'] as const).map(f => (
                            <td key={f} className="px-2 py-1 text-right">
                              {dutyEdit ? <input type="number" value={it[f]} onChange={e => { const v = e.target.value; setItems(prev => prev.map(x => x.id === it.id ? { ...x, [f]: v } : x)); markDirty() }} className="w-24 h-7 px-1.5 rounded border border-[#EADFD6] text-right" />
                                : <span className="tabular-nums">{it[f] === '' ? '—' : fmtNum(it[f])}</span>}
                            </td>
                          ))}
                          {dutyEdit && <td className="px-2 py-1 text-center"><button type="button" aria-label="Delete item" onClick={() => { setItems(prev => prev.length > 1 ? prev.filter(x => x.id !== it.id) : prev); markDirty() }} className="text-[#A8231A]"><Trash2 size={12} /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dutyEdit && <button type="button" onClick={() => setItems(prev => [...prev, newItem()])} className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6B3470]"><Plus size={11} /> Add item</button>}
                </div>
              )}
              <table className="w-full text-[12.5px]">
                <thead><tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                  <th className={`${SA_LABEL} px-4 py-2 text-left`}>Item</th><th className={`${SA_LABEL} px-3 py-2 text-right`}>Actual (PIB)</th>
                  <th className={`${SA_LABEL} px-3 py-2 text-right`}>Expected (calculation)</th><th className={`${SA_LABEL} px-4 py-2 text-right`}>Status</th>
                </tr></thead>
                <tbody>
                  {([['bm', 'BM'], ['ppn', 'PPN'], ['pph', 'PPh'], ['total', 'Total duty']] as const).map(([k, label]) => {
                    const expected = (dutyCalc as any)[k] as number
                    const actual = (dutyAktual as any)[k]
                    return (
                      <tr key={k} className="border-b border-[#F1E8E1]">
                        <td className="px-4 py-2 font-semibold text-[#3B1B3D]">{label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {dutyEdit ? <input value={actual} onChange={e => { const v = e.target.value; setDutyAktual(p => ({ ...p, [k]: v })); markDirty() }} placeholder="Actual" className="w-32 h-8 px-2 rounded-md border border-[#EADFD6] text-right" />
                            : actual ? fmtIDR(toNum(actual)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70]">{fmtIDR(expected)}</td>
                        <td className="px-4 py-2 text-right"><MatchChip m={dutyStatus(actual, expected)} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-[#8A7A8B]">Vendor payments (goods) are not tracked yet.</div>
          </>
        )}

        {dirty && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 px-4 py-3 rounded-[14px] bg-white border border-[#E0A526] shadow-lg">
            <span className="text-[12.5px] font-bold text-[#7A4F00] mr-auto">Unsaved changes in document validation</span>
            <button type="button" className={SA_BTN_OUTLINE} disabled={saving} onClick={() => { if (window.confirm('Discard the unsaved changes?')) load() }}>Discard</button>
            <button type="button" className={SA_BTN_PRIMARY} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
