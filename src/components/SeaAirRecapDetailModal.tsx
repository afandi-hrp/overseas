// Jendela "Open" Invoice Recap Sea & Air (2026-10-01). Tab Overview | Costs | Documents | Audit trail.
// - Overview: murni tampilan dari baris rekapan_seaair (+ baris Audit PIB terkait utk delivery term).
// - Costs: SeaAirRecapCostsTab (dibangun ulang, simpan = cara lama).
// - Documents: SeaAirRecapDocumentsTab (DIBANGUN ULANG PENUH, simpan = RPC modal lama).
// - Submit to Finance: isi `tgl_submit_finance` = tanggal hari ini (keputusan user, tanpa input manual).
// - Bagian 2 (sql/031): Submit HANYA kalau 0 issue (tanpa "submit anyway"); setelah submit baris
//   TERKUNCI (Edit/Delete/review nonaktif, DB menolak juga) -- hanya Admin yg bisa Unlock dgn alasan
//   (RPC fn_seaair_unlock_submit, tercatat di audit trail). "Move PIB to Audited" juga butuh 0 issue.
// Hak akses tab = page_key modal lama: Costs = sea_air_cost_validation, Documents = sea_air_dokumen_validation
// (+ checklist sea_air_checklist_validation). Tab Costs/Documents yg sudah dibuka TETAP terpasang
// (disembunyikan) supaya perubahan belum disimpan tidak hilang saat pindah tab; tutup jendela saat
// masih ada perubahan -> konfirmasi.
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, MoreHorizontal, Pencil, Send, ChevronDown, ChevronRight, Lock, Unlock, PlusCircle, Trash2, History, FileInput } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, Pill, PtBadge, type Tone } from './SeaAirAuditUi'
import SeaAirRecapCostsTab from './SeaAirRecapCostsTab'
import SeaAirRecapDocumentsTab from './SeaAirRecapDocumentsTab'
import { CostMixBar, containerLabel } from './SeaAirRecapCardList'
import { fmtRp, fmtDateShort, fmtValas, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  computeLandedCost, parsePoDetail, recapStatus, fetchRecapLog, todayLocalIso, isRecapLocked,
  parsePoManual, poManualFor, RECAP_SEGMENTS, COST_GROUP_COLORS, COST_GROUP_LABELS,
  type RecapIssue, type RecapLogEntry, type CostGroupKey, type PoManualEntry,
} from '../utils/SeaAirRecapHelpers'

type TabKey = 'overview' | 'costs' | 'documents' | 'trail'

const scoreTone = (pct: number | null | undefined, has: boolean): Tone => (!has || pct == null ? 'grey' : pct >= 100 ? 'green' : pct >= 60 ? 'amber' : 'red')

const toN = (v: any): number | null => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))

// Sel PO di tabel Split per PO (2026-10-06, gambar user): nomor PO tebal, kapal ungu, chip "◐ Partial N · USD x this
// shipment" dari po_manual. KG pindah ke kolom "KG · Share".
const PoCell: React.FC<{ po: { po_no: string; vessel: string }; m: PoManualEntry | null }> = ({ po, m }) => {
  const valas = toN(m?.valas)
  return (
    <div className="min-w-0">
      <div className="font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{po.po_no || '—'}</div>
      <div className="text-[11px] font-semibold uppercase text-[#8E4F93] [overflow-wrap:anywhere]">{po.vessel || '—'}</div>
      {m?.partial && (
        <span className="mt-1 inline-flex items-center gap-1 px-2 py-[1px] rounded-md bg-[#FFF1D6] text-[#7A4F00] text-[10.5px] font-semibold" title="Partial shipment of this PO">
          ◐ Partial{m.partial_no ? ` ${m.partial_no}` : ''}{valas != null ? ` · ${`${m?.currency || ''} ${fmtValas(valas)}`.trim()} this shipment` : ''}
        </span>
      )}
    </div>
  )
}

// Bagi `total` ke tiap baris sesuai bobot -- dibulatkan ke rupiah, jumlahnya PERSIS total (selisih pembulatan ke baris terakhir).
const allocate = (total: number | null, weights: number[]): (number | null)[] => {
  if (total == null) return weights.map(() => null)
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0) return weights.map(() => null)
  const parts = weights.map(w => Math.round((total * w) / sumW))
  const rest = Math.round(total - parts.reduce((a, b) => a + b, 0))
  if (parts.length) parts[parts.length - 1] += rest
  return parts
}
const fmtPct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`

// ── Audit trail tab (2026-10-06, permintaan user: dipercantik) ──────────────────────────────────────────────
// Per hari; entri di menit yg sama oleh user yg sama dgn aksi sama digabung jadi 1 baris + chip modul (mis. hapus
// shipment = Invoice Recap + Audit PIB + Document/Cost validation sekaligus). Deskripsi generik trigger
// ("Edit data SEAAIR-... AWB: ...") disembunyikan; catatan format app "X — Lama: a → Baru: b" ditampilkan rapi.
const TRAIL_VERB: Record<string, { label: string; icon: React.ReactNode; tone: string; dot: string }> = {
  created: { label: 'Created', icon: <PlusCircle size={13} />, tone: 'text-[#17663D] bg-[#EAF6EF]', dot: 'bg-[#17663D]' },
  updated: { label: 'Updated', icon: <Pencil size={12} />, tone: 'text-[#6B3470] bg-[#F5EDF3]', dot: 'bg-[#6B3470]' },
  deleted: { label: 'Deleted', icon: <Trash2 size={12} />, tone: 'text-[#A8231A] bg-[#FDE7E4]', dot: 'bg-[#A8231A]' },
  recorded: { label: 'Recorded', icon: <FileInput size={12} />, tone: 'text-[#6E5E70] bg-[#F3EEEA]', dot: 'bg-[#8A7A8B]' },
  changed: { label: 'Changed', icon: <History size={12} />, tone: 'text-[#6E5E70] bg-[#F3EEEA]', dot: 'bg-[#8A7A8B]' },
}
const ENTITY_TONE: Record<string, string> = {
  'Invoice Recap': 'bg-[#EEF1FA] text-[#2F4FA8]', 'Audit PIB': 'bg-[#F5EDF3] text-[#6B3470]',
  'Document validation': 'bg-[#FFF1D6] text-[#7A4F00]', 'Cost validation': 'bg-[#EAF6EF] text-[#17663D]',
}
const GENERIC_DETAIL = /^(edit|hapus|tambah|input|insert|update|delete)\s+data\b/i
const parseChange = (d: string) => {
  const m = String(d || '').match(/^(.*?)\s+—\s+Lama:\s*([\s\S]*?)\s+→\s+Baru:\s*([\s\S]*)$/)
  return m ? { field: m[1].trim(), from: m[2].trim(), to: m[3].trim() } : null
}
const localDay = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const localTime = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
type TrailCluster = { key: string; day: string; time: string; who: string; verb: string; entities: string[]; details: string[]; count: number }
const clusterTrail = (log: RecapLogEntry[]): TrailCluster[] => {
  const out: TrailCluster[] = []
  log.forEach(e => {
    const verb = e.verb || 'changed'
    const day = localDay(e.at), time = localTime(e.at)
    const key = `${day} ${time}|${e.who}|${verb}`
    const detail = e.detail && !GENERIC_DETAIL.test(e.detail) ? e.detail : ''
    const last = out[out.length - 1]
    if (last && last.key === key) {
      if (e.entity && !last.entities.includes(e.entity)) last.entities.push(e.entity)
      else last.count++
      if (detail && !last.details.includes(detail)) last.details.push(detail)
    } else {
      out.push({ key, day, time, who: e.who, verb, entities: e.entity ? [e.entity] : [], details: detail ? [detail] : [], count: 1 })
    }
  })
  return out
}
const TRAIL_PREVIEW = 12

const RecapAuditTrail: React.FC<{ log: RecapLogEntry[] | null }> = ({ log }) => {
  const [all, setAll] = useState(false)
  if (log === null) return <div className={`${SA_CARD} px-4 py-3 text-[12px] text-[#8A7A8B]`}>Loading…</div>
  const clusters = clusterTrail(log)
  if (clusters.length === 0) return <div className={`${SA_CARD} px-4 py-3 text-[12px] text-[#8A7A8B]`}>No activity recorded</div>
  const shown = all ? clusters : clusters.slice(0, TRAIL_PREVIEW)
  const days: { day: string; items: TrailCluster[] }[] = []
  shown.forEach(c => { const d = days[days.length - 1]; if (d && d.day === c.day) d.items.push(c); else days.push({ day: c.day, items: [c] }) })
  return (
    <div className={`${SA_CARD} px-4 py-3`} data-recap-trail>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13px] font-bold text-[#3B1B3D]">Activity</span>
        <span className="text-[11px] text-[#8A7A8B]">{log.length} entr{log.length === 1 ? 'y' : 'ies'} · {clusters.length} event{clusters.length === 1 ? '' : 's'}</span>
      </div>
      {days.map(d => (
        <div key={d.day} className="mt-2">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">{d.day ? fmtDateShort(d.day) : 'Unknown date'}</div>
          <div className="relative pl-5">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-[#EADFD6]" aria-hidden="true" />
            {d.items.map((c, i) => {
              const v = TRAIL_VERB[c.verb] || TRAIL_VERB.changed
              return (
                <div key={i} className="relative py-1.5" data-trail-event>
                  <span className={`absolute -left-[17px] top-[11px] w-2.5 h-2.5 rounded-full ring-2 ring-white ${v.dot}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="tabular-nums text-[#6E5E70] w-[38px] shrink-0">{c.time}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md text-[11px] font-bold ${v.tone}`}>{v.icon}{v.label}</span>
                    {c.entities.map(en => <span key={en} className={`px-1.5 py-[1px] rounded-md text-[10.5px] font-semibold ${ENTITY_TONE[en] || 'bg-[#F3EEEA] text-[#6E5E70]'}`}>{en}</span>)}
                    {c.count > 1 && <span className="px-1.5 py-[1px] rounded-md text-[10.5px] font-bold bg-[#F3EEEA] text-[#6E5E70]" title={`${c.count} entries`}>×{c.count}</span>}
                    <span className="text-[#6E5E70] truncate">· {c.who}</span>
                  </div>
                  {c.details.map((dt, j) => {
                    const ch = parseChange(dt)
                    return ch ? (
                      <div key={j} className="ml-[46px] mt-0.5 text-[11.5px] text-[#3B1B3D] [overflow-wrap:anywhere]">
                        <span className="font-semibold">{ch.field}</span>: <span className="line-through text-[#8A7A8B]">{ch.from || '—'}</span> → <span className="font-semibold">{ch.to || '—'}</span>
                      </div>
                    ) : (
                      <div key={j} className="ml-[46px] mt-0.5 text-[11.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{dt}</div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {clusters.length > TRAIL_PREVIEW && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-2 text-[12px] font-semibold text-[#6B3470] hover:underline">
          {all ? 'Show less' : `Show all (${clusters.length - TRAIL_PREVIEW} more)`}
        </button>
      )}
    </div>
  )
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8A7A8B]">{label}</div>
    <div className="text-[13px] font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</div>
  </div>
)

export default function SeaAirRecapDetailModal({
  rec, companyNames, canEdit, canSeeCosts, canEditCosts, canSeeDocs, canEditDocs, isAdmin = false, onUnlock, onClose, onEdit, onSubmit, onToggleDraft, onDelete, onChanged,
}: {
  rec: any
  companyNames: Record<string, string>
  canEdit: boolean          // edit Invoice Recap (sea_air_rekapan): Edit shipment, Submit, Draft, Delete
  canSeeCosts: boolean      // sea_air_cost_validation (lihat)
  canEditCosts: boolean     // sea_air_cost_validation (edit)
  canSeeDocs: boolean       // sea_air_dokumen_validation / sea_air_checklist_validation (lihat)
  canEditDocs: boolean      // sea_air_dokumen_validation (edit)
  isAdmin?: boolean         // konfirmasi review & Unlock submit (bagian 2)
  onUnlock?: (rec: any, reason: string) => Promise<boolean>
  onClose: () => void
  onEdit: (rec: any) => void
  onSubmit: (rec: any, dateIso: string) => Promise<boolean>
  onToggleDraft: (rec: any) => void
  onDelete: (rec: any) => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [visited, setVisited] = useState<Record<string, boolean>>({ overview: true })
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [auditRow, setAuditRow] = useState<any>(null)
  const [log, setLog] = useState<RecapLogEntry[] | null>(null)
  const [byVendorOpen, setByVendorOpen] = useState(false)
  const [splitView, setSplitView] = useState<'summary' | 'invoice'>('summary')
  const [splitBasis, setSplitBasis] = useState<'even' | 'kg' | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const seaairId = rec.seaair_id || null
  const issues: RecapIssue[] = rec.recap_issues || []
  const status = recapStatus(rec, issues)
  const lc = computeLandedCost(rec)
  const pos = parsePoDetail(rec)
  const has = rec.recap_has || {}
  const submitted = status.kind === 'submitted'
  const locked = isRecapLocked(rec)
  const poManual = parsePoManual(rec)
  const poKgs = pos.map(p => toN(poManualFor(poManual, p.po_no)?.kg))
  const kgTotal = poKgs.reduce<number>((a, b) => a + (b || 0), 0)
  // Split per PO (2026-10-06, gambar user): By KG (total × KG PO ÷ total KG) | Evenly (total ÷ jumlah PO). By KG hanya
  // bisa dipilih kalau SEMUA PO punya KG (Edit shipment). Nilai dibagi di browser, jumlahnya selalu persis total.
  const allKg = pos.length > 0 && poKgs.every(k => k != null && k > 0)
  const basis: 'even' | 'kg' = allKg ? (splitBasis ?? 'kg') : 'even'
  const weights = pos.map((_, i) => (basis === 'kg' ? (poKgs[i] || 0) : 1))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const share = (i: number) => (weightSum > 0 ? weights[i] / weightSum : 0)
  // Submit: wajib 0 issue & terhubung ke Audit PIB (DB menolak juga -- trigger sql/031 bagian E).
  const submitBlocker = !seaairId ? 'Not linked to an Audit PIB record' : issues.length > 0 ? `${issues.length} open issue${issues.length === 1 ? '' : 's'} must be confirmed by an Admin first` : null
  const anyDirty = Object.values(dirtyTabs).some(Boolean)

  const onCostsDirty = useCallback((d: boolean) => setDirtyTabs(p => (p.costs === d ? p : { ...p, costs: d })), [])
  const onDocsDirty = useCallback((d: boolean) => setDirtyTabs(p => (p.documents === d ? p : { ...p, documents: d })), [])
  const goTab = (t: TabKey) => { setTab(t); setVisited(p => ({ ...p, [t]: true })) }
  const requestClose = () => {
    if (anyDirty && !window.confirm('There are unsaved changes in Costs or Documents. Close anyway?')) return
    onClose()
  }

  useEffect(() => {
    let cancelled = false
    setAuditRow(null)
    if (!seaairId) return
    supabase.from('tabel_audit_seaair').select('*').eq('id', seaairId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) console.error('[SeaAirRecap] audit row gagal', error)
      setAuditRow(data || null)
    })
    return () => { cancelled = true }
  }, [seaairId, rec.id])

  useEffect(() => {
    if (tab !== 'trail') return
    let cancelled = false
    setLog(null)
    fetchRecapLog(rec).then(e => { if (!cancelled) setLog(e) })
    return () => { cancelled = true }
  }, [tab, rec.id, rec.awb])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, anyDirty])

  const handleSubmit = async () => {
    if (submitBlocker) return
    const today = todayLocalIso()
    if (!window.confirm(`Submit this shipment to Finance?\nDate recorded: ${fmtDateShort(today)}\n\nAfter submitting, the shipment is locked. Only an Admin can unlock it.`)) return
    setSubmitting(true)
    await onSubmit(rec, today)
    setSubmitting(false)
  }

  const handleUnlock = async () => {
    if (!onUnlock || unlockReason.trim().length < 5) return
    setUnlocking(true)
    const ok = await onUnlock(rec, unlockReason.trim())
    setUnlocking(false)
    if (ok) { setUnlockOpen(false); setUnlockReason('') }
  }

  const costIssues = issues.filter(i => i.kind === 'cost').length
  const docIssues = issues.filter(i => i.kind !== 'cost').length
  const ptName = companyFullName(companyNames, rec.a_n)
  const deliveryTerm = auditRow?.delivery_term || null
  const cbm = rec.cbm ?? auditRow?.cbm ?? null
  const groupTotal = lc.groups.ppjk + lc.groups.origin + lc.groups.local

  // Nilai per PO per kolom (alokasi bilangan bulat, jumlah = total).
  const splitCols: Record<string, (number | null)[]> = {
    ppjk: allocate(lc.groups.ppjk, weights),
    origin: allocate(lc.groups.origin, weights),
    local: allocate(lc.groups.local, weights),
    duty: allocate(toN(rec.duty_total), weights),
    ...Object.fromEntries(RECAP_SEGMENTS.map(sg => [sg.key, allocate(toN(rec[sg.costCol]), weights)])),
  }
  const rowTotal = (i: number, keys: string[]) => {
    const vals = keys.map(k => splitCols[k][i]).filter(v => v != null) as number[]
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    ...(canSeeCosts ? [{ key: 'costs' as TabKey, label: 'Costs', badge: costIssues || undefined }] : []),
    ...(canSeeDocs ? [{ key: 'documents' as TabKey, label: 'Documents', badge: docIssues || undefined }] : []),
    { key: 'trail', label: 'Audit trail' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5 max-[1600px]:p-2.5" onMouseDown={e => { if (e.target === e.currentTarget) requestClose() }}>
      {/* Ukuran (2026-10-06, permintaan user): layar <=1600px (laptop 14", zoom 90%) = hampir penuh layar; monitor besar
          (24") dilebarkan dari 1180px ke 1560px. */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1560px] h-[94vh] max-[1600px]:max-w-none max-[1600px]:h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-[#EADFD6] shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{rec.awb || '—'}</h2>
                <Chip tone="blue">{containerLabel(rec)}</Chip>
                {rec.a_n && <PtBadge code={rec.a_n} title={ptName} />}
                {rec.duplicate_of && <Chip tone="red" title="Another Invoice Recap row with the same BL / AWB already exists">Possible duplicate upload</Chip>}
                {locked && <Chip tone="grey" title="Submitted to Finance — read-only"><Lock size={10} /> Locked</Chip>}
              </div>
              <div className="text-[12px] text-[#6E5E70] mt-0.5">{rec.origin || '—'} → {rec.destination || '—'}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="text-right mr-2">
                <div className={SA_LABEL}>Landed cost</div>
                <div className="text-[20px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(lc.landed)}</div>
              </div>
              {canEdit && <button type="button" className={`${SA_BTN_OUTLINE} disabled:opacity-50 disabled:cursor-not-allowed`} onClick={() => onEdit(rec)} disabled={locked} title={locked ? 'Locked — submitted to Finance. Ask an Admin to unlock it first.' : undefined}><Pencil size={13} /> Edit</button>}
              {canEdit && !submitted && (
                <button type="button" onClick={handleSubmit} disabled={submitting || !!submitBlocker}
                  title={submitBlocker ? `${submitBlocker}${issues.length ? '\n' + issues.map(i => `• ${i.text}`).join('\n') : ''}` : undefined}
                  className={submitBlocker ? 'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#B9A9BA] text-white text-xs font-semibold cursor-not-allowed' : SA_BTN_GREEN}>
                  <Send size={13} /> {submitting ? 'Submitting…' : issues.length ? `Submit to Finance · ${issues.length} to fix` : 'Submit to Finance'}
                </button>
              )}
              {submitted && <Pill tone="green">{status.label}</Pill>}
              {canEdit && (
                <div className="relative">
                  <button type="button" aria-label="More actions" onClick={() => setMenuOpen(v => !v)} className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[#EADFD6] text-[#3B1B3D] hover:bg-[#F6EFEA]"><MoreHorizontal size={16} /></button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-1 w-56 rounded-xl border border-[#EADFD6] bg-white shadow-lg z-10 py-1 text-[12.5px]">
                      {seaairId && (() => {
                        // Keputusan user: PIB baru boleh Audited kalau Recap sudah bisa Submit to Finance (0 issue).
                        const toAudited = rec.audit_status === 'ARCHIVED'
                        const blocked = toAudited && issues.length > 0
                        return (
                          <button type="button" disabled={blocked}
                            title={blocked ? `${issues.length} open issue${issues.length === 1 ? '' : 's'} must be confirmed by an Admin first` : undefined}
                            className="w-full text-left px-3 py-2 hover:bg-[#F6EFEA] text-[#3B1B3D] disabled:text-[#B7A9B8] disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            onClick={() => { setMenuOpen(false); onToggleDraft(rec) }}>
                            {toAudited ? 'Move PIB to Audited (Audit PIB)' : 'Move PIB back to Draft (Audit PIB)'}
                            {blocked && <div className="text-[10.5px]">Fix the open issues first</div>}
                          </button>
                        )
                      })()}
                      <button type="button" disabled={locked} title={locked ? 'Locked — submitted to Finance' : undefined}
                        className="w-full text-left px-3 py-2 hover:bg-[#FDE7E4] text-[#A8231A] disabled:text-[#D9B3AE] disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        onClick={() => { setMenuOpen(false); onDelete(rec) }}>Delete shipment</button>
                    </div>
                  )}
                </div>
              )}
              <button type="button" onClick={requestClose} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2 mt-3">
            <div className="flex items-center gap-1" role="tablist">
              {tabs.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => goTab(t.key)}
                  className={`px-3 pb-2 pt-1 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === t.key ? 'border-[#6B3470] text-[#3B1B3D]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'}`}>
                  {t.label}
                  {t.badge ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#E0A526] text-white text-[10px] font-bold flex items-center justify-center">{t.badge}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pb-2">
              <Pill tone={scoreTone(rec.doc_validation_pct, !!has.doc)}>Doc match {has.doc ? `${rec.doc_validation_pct}%` : '—'}</Pill>
              <Pill tone={scoreTone(rec.cost_validation_pct, !!has.cost)}>Cost accuracy {has.cost ? `${rec.cost_validation_pct}%` : '—'}</Pill>
              <Pill tone={scoreTone(rec.checklist_pct, !!has.checklist)}>Doc complete {has.checklist ? `${rec.checklist_pct}%` : '—'}</Pill>
            </div>
          </div>
        </div>

        {/* Body -- `[&>*]:shrink-0`: kartu ber-`overflow-hidden` (mis. Split per PO) di kolom flex yang
            di-scroll boleh menyusut sampai tinggal header saat "By vendor" dibuka (laporan user 2026-10-05);
            anak-anak dilarang menyusut supaya tinggi penuh & area ini yang di-scroll. */}
        <div className="flex-1 overflow-y-auto bg-[#F6EFEA] p-4 flex flex-col gap-3 [&>*]:shrink-0">
          {submitted ? (
            <div className="rounded-[14px] border border-[#BFE3CD] bg-[#EAF6EF] px-4 py-2.5 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] font-semibold text-[#17663D] mr-auto inline-flex items-center gap-1.5 flex-wrap"><Lock size={13} /> Submitted to Finance · {fmtDateShort(rec.tgl_submit_finance)} — locked, read-only
                  {rec.finance_received_at && <span className="font-normal">· Received by Finance{rec.finance_received_by ? ` (${rec.finance_received_by})` : ''}</span>}
                  {rec.paid_date && <span className="font-normal">· Paid {fmtDateShort(rec.paid_date)}{rec.paid_reference ? ` · ref ${rec.paid_reference}` : ''}</span>}
                </span>
                {isAdmin && canEdit && onUnlock && !unlockOpen && rec.finance_received_at && (
                  <span className="text-[11.5px] text-[#6E5E70]" title="Ask Finance to undo the receipt (Finance Handover › Undo) before unlocking.">Unlock unavailable — Finance has received it</span>
                )}
                {isAdmin && canEdit && onUnlock && !unlockOpen && !rec.finance_received_at && (
                  <button type="button" className={SA_BTN_OUTLINE} onClick={() => setUnlockOpen(true)}><Unlock size={13} /> Unlock (Admin)</button>
                )}
              </div>
              {unlockOpen && (
                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <textarea value={unlockReason} onChange={e => setUnlockReason(e.target.value)} rows={2} autoFocus
                    placeholder="Reason for unlocking (required, min. 5 characters) — recorded in the audit trail"
                    className="flex-1 px-3 py-2 rounded-xl border border-[#EADFD6] bg-white text-[12.5px] focus:outline-none focus:border-[#6B3470]" />
                  <div className="flex gap-2">
                    <button type="button" className={SA_BTN_OUTLINE} disabled={unlocking} onClick={() => { setUnlockOpen(false); setUnlockReason('') }}>Cancel</button>
                    <button type="button" className={SA_BTN_GREEN} disabled={unlocking || unlockReason.trim().length < 5} onClick={handleUnlock}>{unlocking ? 'Unlocking…' : 'Unlock'}</button>
                  </div>
                </div>
              )}
            </div>
          ) : issues.length > 0 ? (
            <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-[12.5px] font-bold text-[#7A4F00]">Before submitting to Finance</span>
              <ul className="flex flex-wrap gap-x-5 gap-y-0.5 text-[12px] text-[#7A4F00]">
                {issues.map((i, k) => <li key={k}>• {i.text}</li>)}
              </ul>
            </div>
          ) : null}
          {!submitted && rec.submit_unlocked_at && (
            <div className="rounded-[14px] border border-[#EADFD6] bg-white px-4 py-2 text-[12px] text-[#6E5E70]">
              <Unlock size={12} className="inline mr-1 -mt-0.5" />Unlocked by Admin{rec.submit_unlocked_by ? ` (${rec.submit_unlocked_by})` : ''} · {fmtDateShort(rec.submit_unlocked_at)}{rec.submit_unlock_reason ? ` — ${rec.submit_unlock_reason}` : ''}
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className={`${SA_CARD} p-4`}>
                  <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-3">Shipment</h3>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <Field label="Company">{ptName}</Field>
                    <Field label="Supplier">{rec.vendor || '—'}</Field>
                    <Field label="Invoice no">{rec.no_invoice || '—'}</Field>
                    <Field label="Recap date">{fmtDateShort(rec.tgl)}</Field>
                    <Field label="Delivery term">{deliveryTerm || '—'}</Field>
                    <Field label="Weight / volume">{rec.weight_kg != null && rec.weight_kg !== '' ? `${fmtValas(rec.weight_kg)} kg` : '—'} · {cbm != null && cbm !== '' ? `${fmtValas(Math.round(Number(cbm) * 100) / 100)} m³` : '—'}</Field>
                    <Field label="ETD → ETA">{fmtDateShort(rec.etd)} → {fmtDateShort(rec.eta)}</Field>
                    <Field label="ATD → ATA">{fmtDateShort(rec.atd)} → {fmtDateShort(rec.ata)}</Field>
                    <Field label="Containers">{rec.container_count || rec.container_type ? `${rec.container_count || '?'} × ${rec.container_type || '—'}` : '—'}</Field>
                  </div>
                  {rec.notes && (
                    <div className="mt-3 rounded-xl bg-[#FFF8EA] border border-[#F3D9A4] px-3 py-2 text-[12px] text-[#7A4F00] whitespace-pre-wrap"><b>AI note</b> · {rec.notes}</div>
                  )}
                </div>

                <div className={`${SA_CARD} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[14px] font-bold text-[#3B1B3D]">Landed cost</h3>
                    <span className="text-[18px] font-bold text-[#3B1B3D] tabular-nums">{fmtRp(lc.landed)}</span>
                  </div>
                  <CostMixBar groups={lc.groups} total={groupTotal} height={14} />
                  <div className="mt-3 flex flex-col gap-1.5">
                    {(['ppjk', 'origin', 'local'] as CostGroupKey[]).map(k => (
                      <div key={k} className="grid grid-cols-[14px_minmax(0,1fr)_56px_minmax(0,140px)] items-center gap-2 text-[12.5px]">
                        <span className="w-3 h-3 rounded-sm" style={{ background: COST_GROUP_COLORS[k] }} />
                        <span className="text-[#3B1B3D]">{COST_GROUP_LABELS[k]}</span>
                        <span className="text-right text-[#6E5E70] tabular-nums">{groupTotal > 0 ? `${(Math.round(lc.groups[k] / groupTotal * 1000) / 10).toLocaleString('id-ID')}%` : '—'}</span>
                        <span className="text-right font-semibold text-[#3B1B3D] tabular-nums">{fmtRp(lc.groups[k])}</span>
                      </div>
                    ))}
                    {lc.usedTotalInvoiceFallback && <div className="text-[11px] text-[#8A7A8B]">No per-invoice amounts recorded — landed cost taken from Total invoice.</div>}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#EADFD6] flex flex-col gap-1 text-[12px]">
                    <div className="flex justify-between gap-2"><span className="flex items-center gap-2 text-[#6E5E70]"><span className="w-3 h-3 rounded-sm" style={{ background: COST_GROUP_COLORS.duty }} />Duty &amp; tax (not in landed cost)</span><b className="text-[#3B1B3D] tabular-nums">{fmtRp(rec.duty_total)}</b></div>
                    <div className="flex justify-between gap-2 text-[#6E5E70] pl-5"><span>BM · PPN · PPh</span><span className="tabular-nums">{fmtRp(rec.bm)} · {fmtRp(rec.ppn)} · {fmtRp(rec.pph)}</span></div>
                    <div className="flex justify-between gap-2 text-[#6E5E70]"><span>Total invoice (recorded)</span><span className="tabular-nums">{fmtRp(lc.totalInvoice)}</span></div>
                    <div className="flex justify-between gap-2 text-[#6E5E70]"><span>Grand total (recorded)</span><span className="tabular-nums">{fmtRp(lc.grandTotal)}</span></div>
                  </div>
                  <button type="button" onClick={() => setByVendorOpen(v => !v)} className="mt-2 text-[12px] font-semibold text-[#6B3470] flex items-center gap-1 hover:underline">
                    {byVendorOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} By vendor ({RECAP_SEGMENTS.filter(s => rec[s.costCol] != null && rec[s.costCol] !== '').length})
                  </button>
                  {byVendorOpen && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {RECAP_SEGMENTS.filter(s => rec[s.costCol] != null && rec[s.costCol] !== '').map(s => (
                        <div key={s.key} className="grid grid-cols-[10px_minmax(0,1fr)_minmax(0,140px)] gap-2 items-start text-[12px]">
                          <span className="w-2.5 h-2.5 rounded-sm mt-1" style={{ background: COST_GROUP_COLORS[s.group] }} />
                          <div className="min-w-0"><div className="font-semibold text-[#3B1B3D]">{s.label}</div><div className="text-[11px] text-[#6E5E70] truncate" title={rec[s.vendorCol] || ''}>{rec[s.vendorCol] || '—'}</div></div>
                          <span className="text-right font-semibold text-[#3B1B3D] tabular-nums">{fmtRp(rec[s.costCol])}</span>
                        </div>
                      ))}
                      <div className="grid grid-cols-[10px_minmax(0,1fr)_minmax(0,140px)] gap-2 items-start text-[12px]">
                        <span className="w-2.5 h-2.5 rounded-sm mt-1" style={{ background: COST_GROUP_COLORS.duty }} />
                        <div><div className="font-semibold text-[#3B1B3D]">Duty &amp; tax (BM · PPN · PPh)</div><div className="text-[11px] text-[#6E5E70]">Bea Cukai · PIB · not in landed cost</div></div>
                        <span className="text-right font-semibold text-[#3B1B3D] tabular-nums">{fmtRp(rec.duty_total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`${SA_CARD} overflow-hidden`} data-split-per-po>
                <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="text-[14px] font-bold text-[#3B1B3D]">Split per PO</h3>
                    <span className="text-[11.5px] text-[#8A7A8B]">
                      {pos.length} PO{pos.length === 1 ? '' : 's'} · {basis === 'kg' ? `Share = total × PO KG ÷ ${fmtValas(kgTotal)} kg` : `Share = total ÷ ${pos.length} PO${pos.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex p-0.5 rounded-xl bg-[#F5EDF3]">
                      {(['summary', 'invoice'] as const).map(v => (
                        <button key={v} type="button" onClick={() => setSplitView(v)} className={`px-3 h-7 rounded-lg text-xs font-bold ${splitView === v ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D] hover:bg-white'}`}>{v === 'summary' ? 'Summary' : 'Per invoice'}</button>
                      ))}
                    </div>
                    <div className="inline-flex p-0.5 rounded-xl bg-[#F5EDF3]">
                      {(['kg', 'even'] as const).map(v => (
                        <button key={v} type="button" disabled={v === 'kg' && !allKg} onClick={() => setSplitBasis(v)}
                          title={v === 'kg' && !allKg ? 'Fill in KG for every PO in Edit shipment to split by weight' : undefined}
                          className={`px-3 h-7 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${basis === v ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D] hover:bg-white'}`}>{v === 'kg' ? 'By KG' : 'Evenly'}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {pos.length === 0 ? (
                  <div className="px-4 pb-4 text-[12.5px] text-[#6E5E70]">No PO recorded for this shipment.</div>
                ) : (
                  <div className="overflow-x-auto">
                    {splitView === 'summary' ? (
                      <table className="w-full text-[12.5px] min-w-[820px]">
                        <thead>
                          <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                            <th className={`${SA_LABEL} text-left px-4 py-2`}>PO · vessel</th>
                            <th className={`${SA_LABEL} text-right px-3 py-2`}>KG · share</th>
                            {(['ppjk', 'origin', 'local'] as CostGroupKey[]).map(k => (
                              <th key={k} className={`${SA_LABEL} text-right px-3 py-2`}><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: COST_GROUP_COLORS[k] }} />{COST_GROUP_LABELS[k]}</span></th>
                            ))}
                            <th className={`${SA_LABEL} text-right px-3 py-2`}><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: COST_GROUP_COLORS.duty }} />Duty &amp; tax</span></th>
                            <th className={`${SA_LABEL} text-right px-4 py-2`}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pos.map((p, i) => (
                            <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0 align-top">
                              <td className="px-4 py-2.5"><PoCell po={p} m={poManualFor(poManual, p.po_no)} /></td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                <div className="text-[#3B1B3D]">{poKgs[i] != null ? `${fmtValas(poKgs[i])} kg` : '—'}</div>
                                <div className="text-[11px] text-[#8A7A8B]">{fmtPct(share(i))}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp(splitCols.ppjk[i])}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp(splitCols.origin[i])}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp(splitCols.local[i])}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums" title={`BM ${fmtRp(allocate(toN(rec.bm), weights)[i])} · PPN ${fmtRp(allocate(toN(rec.ppn), weights)[i])} · PPh ${fmtRp(allocate(toN(rec.pph), weights)[i])}`}>{fmtRp(splitCols.duty[i])}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#3B1B3D]">{fmtRp(rowTotal(i, ['ppjk', 'origin', 'local', 'duty']))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-[12px] min-w-[1040px]">
                        <thead>
                          <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                            <th className={`${SA_LABEL} text-left px-4 py-2`}>PO · vessel</th>
                            <th className={`${SA_LABEL} text-right px-2 py-2`}>KG · share</th>
                            {RECAP_SEGMENTS.map(sg => (
                              <th key={sg.key} className="text-right px-2 py-2 align-bottom">
                                <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#8A7A8B]">{sg.label}</div>
                                <div className="text-[10.5px] text-[#6E5E70] normal-case line-clamp-2" title={rec[sg.vendorCol] || ''}>{rec[sg.vendorCol] || '—'}</div>
                              </th>
                            ))}
                            <th className={`${SA_LABEL} text-right px-2 py-2`}>Duty &amp; tax</th>
                            <th className={`${SA_LABEL} text-right px-4 py-2`}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pos.map((p, i) => (
                            <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0 align-top">
                              <td className="px-4 py-2.5"><PoCell po={p} m={poManualFor(poManual, p.po_no)} /></td>
                              <td className="px-2 py-2.5 text-right tabular-nums">
                                <div className="text-[#3B1B3D]">{poKgs[i] != null ? `${fmtValas(poKgs[i])} kg` : '—'}</div>
                                <div className="text-[11px] text-[#8A7A8B]">{fmtPct(share(i))}</div>
                              </td>
                              {RECAP_SEGMENTS.map(sg => <td key={sg.key} className="px-2 py-2.5 text-right tabular-nums">{fmtRp(splitCols[sg.key][i])}</td>)}
                              <td className="px-2 py-2.5 text-right tabular-nums">{fmtRp(splitCols.duty[i])}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#3B1B3D]">{fmtRp(rowTotal(i, [...RECAP_SEGMENTS.map(sg => sg.key), 'duty']))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab Costs & Documents: dipasang sekali dibuka lalu TETAP terpasang (hidden) supaya
              perubahan belum disimpan tidak hilang saat pindah tab. */}
          {canSeeCosts && visited.costs && (
            <div className={tab === 'costs' ? '' : 'hidden'}>
              <SeaAirRecapCostsTab seaairId={rec.seaair_id || rec.id} active={tab === 'costs'} canEdit={canEditCosts} isAdmin={isAdmin} locked={locked} auditRow={auditRow} onChanged={onChanged} onDirtyChange={onCostsDirty} />
            </div>
          )}

          {canSeeDocs && visited.documents && (
            <div className={tab === 'documents' ? '' : 'hidden'}>
              <SeaAirRecapDocumentsTab seaairId={rec.seaair_id || rec.id} origin={rec.origin} canEdit={canEditDocs} isAdmin={isAdmin} locked={locked} onChanged={onChanged} onDirtyChange={onDocsDirty} />
            </div>
          )}

          {tab === 'trail' && <RecapAuditTrail log={log} />}

          {!seaairId && tab !== 'overview' && tab !== 'trail' && (
            <div className="text-[11.5px] text-[#8A7A8B]">This Invoice Recap row is not linked to an Audit PIB record (seaair_id is empty).</div>
          )}
          <div className="h-1" />
        </div>
      </div>
    </div>,
    document.body
  )
}
