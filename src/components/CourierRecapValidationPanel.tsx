// Panel Validation SAMPING Invoice Recap Courier (2026-10-05, keputusan user; prototipe "Validation Side Panel" --
// hanya tata letak, warna/font tetap gaya app). Menggantikan jendela Open & jendela Validation di mode Card:
// - Tampil di kanan daftar kartu (layar sempit: di bawah). Klik Validation kartu lain -> isi panel berganti.
// - Header: AWB/PIB-CN, Submit all to Finance, View in Audit, Edit in List, tutup.
// - Tab Checklist | Doc Validation | Cost Validation | Invoices. Kartu tanpa pasangan Audit -> hanya Invoices.
// - Shipment Info (2 baris, SAMA di semua tab): AWB, No. Invoice Freight, No. Invoice Duty, Vendor, Jalur, No. PIB /
//   Courier, Service, Direction/Type, Origin/Zone, Ship Date, Chargeable Weight ("—" kalau kosong).
// - Checklist = ChecklistModal embedded (SAMA, termasuk Upload additional doc & catatan) + "Document review"
//   (riwayat centang dokumen, tabel courier_checklist_doc_log sql/041).
// - Doc Validation = ValidasiModal variant summary (Mismatch + Accept bercatatan); Cost Validation =
//   CourierCostSummary (Over/Undercharge + Accept per baris). Tombol Details = jendela penuh tabel lama
//   (ValidasiModalLegacy: Recompute & Edit / CostValidationModalLegacy: Edit) -- logika simpan SAMA mode List.
// - Validasi bisa diubah hanya selama PIB/CN Draft (aturan SAMA Audit Courier).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, ExternalLink, Pencil, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, Pill, PtBadge } from './SeaAirAuditUi'
import { fmtRp, companyFullName } from '../utils/SeaAirAuditHelpers'
import { courierDocNo, isCourierDraft, type CourierDocType } from '../utils/CourierAuditHelpers'
import { recapGroupStatus, ppjkCode, type RecapGroup, type RecapAuditLink } from '../utils/CourierRecapHelpers'
import { courierShipmentInfo, fmtCourierDate, validationDotClass, validationDotLabel, rowValidationPct, type ValidationTabKey } from './CourierValidationWindow'
import ValidasiModal from './ValidasiModal'
import ValidasiModalLegacy from './ValidasiModalLegacy'
import CostValidationModalLegacy from './CostValidationModalLegacy'
import CourierCostSummary from './CourierCostSummary'
import CourierRecapInvoicesTab from './CourierRecapInvoicesTab'

export type RecapPanelTab = ValidationTabKey | 'invoices'

const hasVal = (v: any) => {
  if (v === null || v === undefined) return false
  const t = String(v).trim()
  return t !== '' && t !== '-' && t !== '—'
}
const dash = (v: any) => (hasVal(v) ? String(v) : '—')
const joinNos = (rows: any[]) => Array.from(new Set(rows.map(r => r.no_invoice).filter(hasVal).map(String))).join(', ')

// ─── Document review: riwayat centang dokumen Checklist (sql/041) ─────────────
type DocLogRow = { id: string; doc_key: string; action: 'ADDED' | 'REMOVED'; changed_by: string | null; created_at: string }
const fmtDay = (iso: string) => fmtCourierDate(iso).replace(/^(\d{2})-([A-Za-z]{3})[a-z]*-(\d{4})$/, '$1 $2 $3')

export const CourierDocumentReview: React.FC<{ rec: any; docType: CourierDocType; labels: Record<string, string>; reloadKey: number }> = ({ rec, docType, labels, reloadKey }) => {
  const [log, setLog] = useState<DocLogRow[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [checklist, setChecklist] = useState<any>(null)
  useEffect(() => {
    let alive = true
    const idCol = docType === 'CN' ? 'cn_id' : 'pib_id'
    ;(async () => {
      const [{ data, error }, { data: cl }] = await Promise.all([
        supabase.from('courier_checklist_doc_log').select('id, doc_key, action, changed_by, created_at').eq(idCol, rec.id).order('created_at', { ascending: false }),
        supabase.from('dokumen_checklist').select('*').eq(idCol, rec.id).maybeSingle(),
      ])
      if (!alive) return
      if (error) { console.warn('[DocumentReview] riwayat tidak terbaca (sql/041?)', error.message); setMissing(true); setLog([]) }
      else { setMissing(false); setLog((data || []) as DocLogRow[]) }
      setChecklist(cl || null)
    })()
    return () => { alive = false }
  }, [rec.id, docType, reloadKey])

  const groups = useMemo(() => {
    const out: { key: string; day: string; action: 'ADDED' | 'REMOVED'; by: string; docs: string[] }[] = []
    ;(log || []).forEach(l => {
      const day = fmtDay(l.created_at)
      const by = l.changed_by || 'n8n (upload)'
      const key = `${day}|${l.action}|${by}`
      const last = out[out.length - 1]
      const label = labels[l.doc_key] || l.doc_key
      if (last && last.key === key) { if (!last.docs.includes(label)) last.docs.push(label) }
      else out.push({ key, day, action: l.action, by, docs: [label] })
    })
    return out
  }, [log, labels])

  // Dokumen yang sudah tercentang tapi belum punya catatan ADDED (dicentang sebelum riwayat mulai dicatat).
  const earlier = useMemo(() => {
    if (!checklist || !log) return []
    const logged = new Set(log.filter(l => l.action === 'ADDED').map(l => l.doc_key))
    return Object.keys(labels).filter(k => checklist[k] === true && !logged.has(k)).map(k => labels[k])
  }, [checklist, log, labels])

  return (
    <div className="bg-white rounded-[14px] border border-[#EADFD6] px-4 py-3" data-document-review>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-2">Document review</div>
      {log === null ? <div className="text-[12px] text-[#8A7A8B]">Loading…</div> : (
        <div className="flex flex-col gap-2">
          {missing && <div className="text-[11.5px] text-[#8A7A8B]">Document history is not available yet.</div>}
          {groups.map(gp => (
            <div key={gp.key} className="flex gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${gp.action === 'ADDED' ? 'bg-[#6B3470]' : 'bg-[#B7A9B8]'}`} />
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold text-[#3B1B3D]">{gp.day}</div>
                <div className="text-[11.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{[...gp.docs].reverse().join(', ')} {gp.action === 'ADDED' ? 'added' : 'removed'} · {gp.by}</div>
              </div>
            </div>
          ))}
          {earlier.length > 0 && (
            <div className="flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-[#D9CFD6]" />
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold text-[#3B1B3D]">{checklist?.created_at ? `${fmtDay(checklist.created_at)} or earlier` : 'Earlier'}</div>
                <div className="text-[11.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{earlier.join(', ')} — checked before document history was recorded</div>
              </div>
            </div>
          )}
          {!missing && groups.length === 0 && earlier.length === 0 && <div className="text-[11.5px] text-[#8A7A8B]">No documents checked yet.</div>}
        </div>
      )}
    </div>
  )
}

// ─── Jendela penuh "Details" (tabel lama) ─────────────────────────────────────
const DetailsWindow: React.FC<{ title: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => createPortal(
  <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5 max-[1600px]:p-2.5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="bg-white w-full max-w-[1320px] h-[94vh] max-[1600px]:max-w-none max-[1600px]:h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-label="Details">
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EADFD6]">
        <h2 className="text-[16px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close details" title="Close" className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70]"><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col cvw-fill">{children}</div>
    </div>
  </div>,
  document.body,
)

const InfoCell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 bg-white px-2.5 py-1.5">
    <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-none mb-1">{label}</p>
    <div className="text-[12px] font-semibold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{children}</div>
  </div>
)

export default function CourierRecapValidationPanel({
  g, initialTab, companyNames, colOk, access, canEditValidation, canEditRecap, isAdmin, busy, checklistLabels,
  renderChecklist, onClose, onSubmit, onUnlock, onViewInAudit, onEditInList, onChanged, onDirtyChange,
}: {
  g: RecapGroup
  initialTab?: RecapPanelTab
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  access: Record<ValidationTabKey, boolean>
  // Hak edit per page_key validasi (TANPA syarat Draft -- syarat Draft diterapkan di sini).
  canEditValidation: Record<ValidationTabKey, boolean>
  canEditRecap: boolean
  isAdmin: boolean
  busy: boolean
  checklistLabels: Record<string, string>
  renderChecklist: (api: { rec: any; canEdit: boolean; onPctChange: (pct: number | null) => void; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }) => React.ReactNode
  onClose: () => void
  onSubmit: (ids: string[]) => void
  onUnlock: (id: string, reason: string) => Promise<boolean>
  onViewInAudit: () => void
  onEditInList: () => void
  onChanged: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  // Pasangan Audit dibekukan selama panel ini hidup (panel di-remount per AWB) -> data kartu yang di-refresh tidak
  // memicu baca ulang validasi.
  const [audit] = useState<RecapAuditLink | null>(() => g.audit || null)
  const rec = audit?.rec || null
  const docType = (audit?.docType || 'PIB') as CourierDocType
  const draft = rec ? isCourierDraft(rec) : false
  const tabs: RecapPanelTab[] = [
    ...(rec ? (['checklist', 'doc', 'cost'] as ValidationTabKey[]).filter(t => access[t]) : []),
    'invoices',
  ]
  const [tab, setTab] = useState<RecapPanelTab>(() => (initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]))
  const [visited, setVisited] = useState<Record<string, boolean>>(() => ({ [tab]: true }))
  const goTab = (t: RecapPanelTab) => { setTab(t); setVisited(v => (v[t] ? v : { ...v, [t]: true })) }
  useEffect(() => { if (initialTab && tabs.includes(initialTab)) goTab(initialTab) }, [initialTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const [pct, setPct] = useState<Record<ValidationTabKey, number | null>>(() => (rec ? rowValidationPct(rec) : { checklist: null, doc: null, cost: null }))
  const setPctOf = useCallback((k: ValidationTabKey) => (v: number | null) => setPct(p => (p[k] === v ? p : { ...p, [k]: v })), [])
  const onChecklistPct = useMemo(() => setPctOf('checklist'), [setPctOf])
  const onDocPct = useMemo(() => setPctOf('doc'), [setPctOf])
  const onCostPct = useMemo(() => setPctOf('cost'), [setPctOf])

  // Naik saat Checklist disimpan / upload susulan selesai / Details ditutup -> ringkasan & riwayat dibaca ulang.
  const [reloadKey, setReloadKey] = useState(0)
  const bump = useCallback(() => { setReloadKey(k => k + 1); onChanged() }, [onChanged])
  const [checklistDirty, setChecklistDirty] = useState(false)
  useEffect(() => { onDirtyChange?.(checklistDirty) }, [checklistDirty, onDirtyChange])
  const [details, setDetails] = useState<'doc' | 'cost' | null>(null)
  const closeDetails = () => { setDetails(null); bump() }

  // Shipment Info baris 2 dari tabel_cost_validasi (SAMA jendela Validation).
  const [cv, setCv] = useState<any>(null)
  useEffect(() => {
    if (!rec) return
    let alive = true
    supabase.from('tabel_cost_validasi')
      .select('cv_courier, cv_direction, cv_shipment_type, cv_ship_date, cv_origin_country_code, cv_zone, cv_chargeable_kg, cv_service_type, created_at')
      .eq(docType === 'CN' ? 'cn_id' : 'pib_id', rec.id)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setCv(data && data.length > 0 ? data[0] : null) })
    return () => { alive = false }
  }, [rec?.id, docType, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const info = courierShipmentInfo(cv)

  const status = recapGroupStatus(g)
  const unsubmitted = g.rows.filter(r => !r.submit_date)
  const ppjks = Array.from(new Set(g.ppjks.map(ppjkCode).filter(Boolean)))
  const vendor = rec?.vendor || g.rows.map(r => r.vendor).find(hasVal)
  const editOf = (t: ValidationTabKey) => draft && canEditValidation[t]
  const tabLabel: Record<RecapPanelTab, string> = { checklist: 'Checklist', doc: 'Doc Validation', cost: 'Cost Validation', invoices: `Invoices (${g.rows.length})` }

  return (
    <div className="bg-white rounded-2xl border border-[#EADFD6] shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden" data-recap-panel={g.key}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 border-b border-[#EADFD6]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F5EDF3] text-[#6B3470] flex items-center justify-center shrink-0"><ShieldCheck size={16} /></div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-[#3B1B3D] leading-tight [overflow-wrap:anywhere]">
                {rec ? `Validation · ${docType} ${courierDocNo(rec, docType) || ''}`.trim() : `AWB ${g.awb}`}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{g.awbRaw || g.awb}</span>
                {ppjks.map(p => <Chip key={p} tone="grey">{p}</Chip>)}
                {colOk('an') && g.an && <PtBadge code={g.an} title={companyFullName(companyNames, g.an)} />}
                <Pill tone={status.tone}>{status.label}</Pill>
                {rec && <Chip tone={draft ? 'amber' : 'green'}>{docType} · {draft ? 'Draft' : 'Audited — view only'}</Chip>}
                {!rec && <Chip tone={g.key.startsWith('ID:') ? 'grey' : 'red'}>{g.key.startsWith('ID:') ? 'No AWB' : 'Not found in Audit'}</Chip>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {colOk('total_amount') && <div className="text-right mr-1"><div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">Total</div><div className="text-[15px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(g.finalTotal)}</div></div>}
            <button type="button" onClick={onClose} aria-label="Close panel" title="Close" className="w-8 h-8 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70]"><X size={17} /></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {canEditRecap && unsubmitted.length > 0 && (
            <button type="button" disabled={busy} className={`${SA_BTN_GREEN} h-8`} onClick={() => onSubmit(unsubmitted.map(r => String(r.id)))}>
              <Send size={12} /> {busy ? 'Submitting…' : unsubmitted.length === g.rows.length ? 'Submit all to Finance' : `Submit all (${unsubmitted.length} left)`}
            </button>
          )}
          {!g.key.startsWith('ID:') && <button type="button" className={`${SA_BTN_OUTLINE} h-8`} onClick={onViewInAudit}><ExternalLink size={12} /> View in Audit</button>}
          {canEditRecap && <button type="button" className={`${SA_BTN_OUTLINE} h-8`} onClick={onEditInList} title="Edit the invoices of this AWB in the List view"><Pencil size={12} /> Edit in List</button>}
        </div>
        <div className="flex items-end gap-1 mt-2 overflow-x-auto" role="tablist">
          {tabs.map(t => {
            const dot = t === 'invoices' ? undefined : pct[t]
            return (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => goTab(t)}
                title={dot !== undefined ? `${tabLabel[t]}: ${validationDotLabel(dot)}` : undefined}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 pt-1 pb-2 text-[12.5px] font-semibold border-b-2 transition-colors ${tab === t ? 'border-[#6B3470] text-[#3B1B3D]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'}`}>
                {dot !== undefined && <span className={`w-2 h-2 rounded-full shrink-0 ${validationDotClass(dot)}`} />}
                {tabLabel[t]}{dot !== undefined && dot !== null ? ` ${dot}%` : ''}
                {t === 'checklist' && checklistDirty && <span className="w-1.5 h-1.5 rounded-full bg-[#E0A526]" title="Unsaved changes" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] @container">
        {/* Shipment Info -- SAMA di semua tab */}
        <div className="px-3 pt-3">
          <div className="rounded-[12px] border border-[#EADFD6] overflow-hidden" data-shipment-info>
            <div className="grid grid-cols-2 @lg:grid-cols-3 @4xl:grid-cols-6 gap-px bg-[#EADFD6]">
              <InfoCell label="AWB">{dash(rec?.awb || g.awbRaw || g.awb)}</InfoCell>
              <InfoCell label="No. Invoice Freight">{dash(joinNos(g.byKind.freight))}</InfoCell>
              <InfoCell label="No. Invoice Duty">{dash(joinNos(g.byKind.duty))}</InfoCell>
              <InfoCell label="Vendor">{dash(vendor)}</InfoCell>
              <InfoCell label="Jalur">{rec ? docType : '—'}</InfoCell>
              <InfoCell label={docType === 'CN' && rec ? 'No. SPPBMCP' : 'No. PIB'}>{dash(rec ? courierDocNo(rec, docType) : '')}</InfoCell>
              <InfoCell label="Courier">{dash(info.courier)}</InfoCell>
              <InfoCell label="Service">{dash(info.service)}</InfoCell>
              <InfoCell label="Direction / Type">{dash(info.direction)}</InfoCell>
              <InfoCell label="Origin / Zone">{dash(info.origin)}</InfoCell>
              <InfoCell label="Ship Date">{dash(info.shipDate)}</InfoCell>
              <InfoCell label="Chargeable Weight">{dash(info.chargeable)}</InfoCell>
            </div>
          </div>
        </div>

        <div className="p-3">
          {rec && access.checklist && visited.checklist && (
            <div className={tab === 'checklist' ? 'flex flex-col gap-3' : 'hidden'} role="tabpanel">
              {renderChecklist({ rec, canEdit: editOf('checklist'), onPctChange: onChecklistPct, onSaved: bump, onDirtyChange: setChecklistDirty })}
              <CourierDocumentReview rec={rec} docType={docType} labels={checklistLabels} reloadKey={reloadKey} />
            </div>
          )}
          {rec && access.doc && visited.doc && (
            <div className={tab === 'doc' ? '' : 'hidden'} role="tabpanel">
              <ValidasiModal record={rec} mainTab="courier" subTab="courier_audit" onClose={onClose} canEdit={editOf('doc')} embedded
                variant="summary" reloadKey={reloadKey} onPctChange={onDocPct} onChanged={onChanged} onOpenDetails={() => setDetails('doc')} />
            </div>
          )}
          {rec && access.cost && visited.cost && (
            <div className={tab === 'cost' ? '' : 'hidden'} role="tabpanel">
              <CourierCostSummary docType={docType} auditId={rec.id} canEdit={editOf('cost')} reloadKey={reloadKey}
                onPctChange={onCostPct} onChanged={onChanged} onOpenDetails={() => setDetails('cost')} />
            </div>
          )}
          {tab === 'invoices' && (
            <div role="tabpanel">
              <CourierRecapInvoicesTab g={g} colOk={colOk} canEdit={canEditRecap} busy={busy} onSubmit={onSubmit} isAdmin={isAdmin} onUnlock={onUnlock} onEditInList={onEditInList} />
            </div>
          )}
        </div>
      </div>

      {rec && details === 'doc' && (
        <DetailsWindow title={`Doc Validation · ${docType} ${courierDocNo(rec, docType) || ''} · ${rec.awb || ''}`} onClose={closeDetails}>
          <ValidasiModalLegacy record={rec} mainTab="courier" subTab="courier_audit" onClose={closeDetails} canEdit={editOf('doc')} embedded />
        </DetailsWindow>
      )}
      {rec && details === 'cost' && (
        <DetailsWindow title={`Cost Validation · ${docType} ${courierDocNo(rec, docType) || ''} · ${rec.awb || ''}`} onClose={closeDetails}>
          <CostValidationModalLegacy awb={rec.awb} jenisDokumen={docType} docId={rec.id} rawRecord={rec} onClose={closeDetails} canEdit={editOf('cost')} embedded />
        </DetailsWindow>
      )}
    </div>
  )
}
