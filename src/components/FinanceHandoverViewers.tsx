// Viewer baca-saja Finance Handover (2026-10-01).
// - FAR Overseas: modal LAMA Memo / Documents / Cost (FarOverseasAir*Modal) dgn tab geser di atasnya
//   (prop `tabBar`) -> pindah memo · dokumen · cost tanpa menutup.
// - Sea & Air: dialog sendiri, tab Handover · Documents · Cost validation. Documents & Cost memakai tab
//   Invoice Recap dlm mode `financeView` (baca saja; dokumen PIB/SPPB/Billing DJBC/BPN/SPTNP, matriks
//   PIB, kartu Duty & segmen CUSTOM DISEMBUNYIKAN -- spek: Finance tidak melihat duty & tax).
//   "Earlier shipment" (tanpa data validasi) hanya tab Handover.
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import FarOverseasAirDetailModal from './FarOverseasAirDetailModal'
import FarOverseasAirDocumentsModal from './FarOverseasAirDocumentsModal'
import FarOverseasAirCostValidationModal from './FarOverseasAirCostValidationModal'
import SeaAirRecapDocumentsTab from './SeaAirRecapDocumentsTab'
import SeaAirRecapCostsTab from './SeaAirRecapCostsTab'
import { SA_CARD, SA_LABEL, Chip, PtBadge } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort, companyFullName, formatNoAju, computeSeaAirBalanceAsuransi } from '../utils/SeaAirAuditHelpers'
import { seaAirInvoiceSegments, seaAirPoList, type HandoverItem } from '../utils/FinanceHandoverHelpers'
import CourierValidationWindow from './CourierValidationWindow'
import { ChecklistModal, FINANCE_AUDIT_COLS, FINANCE_RECAP_COLS, splitFinanceColumns } from './SharedDataTable'
import { useAuth } from '../lib/AuthContext'
import { buildRecapGroup, courierAwbNorm, fetchRecapAuditLinks } from '../utils/CourierRecapHelpers'
import { enrichCourierValidationPct, mergeChecklistFields } from '../utils/CourierValidationPct'
import { courierDocNo, isCourierDraft, computeCourierAuditCalc, type CourierDocType } from '../utils/CourierAuditHelpers'

export type ViewerTab = 'main' | 'recap' | 'audit' | 'docs' | 'cost'

export function ViewerTabBar({ tabs, active, onSelect }: { tabs: { key: ViewerTab; label: string }[]; active: ViewerTab; onSelect: (t: ViewerTab) => void }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#EADFD6] bg-white shrink-0 print:hidden" role="tablist">
      {tabs.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} onClick={() => onSelect(t.key)}
          className={`px-3.5 h-8 rounded-lg text-[12.5px] font-bold ${active === t.key ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D] hover:bg-[#F5EDF3]'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── FAR Overseas ─────────────────────────────────────────────────────────────
export function FarHandoverViewer({ item, initialTab, onClose, onChanged, onOpenEdit }: {
  item: HandoverItem
  initialTab: ViewerTab
  onClose: () => void
  onChanged?: () => void
  onOpenEdit?: (rec: any) => void
}) {
  const [tab, setTab] = useState<ViewerTab>(initialTab)
  const bar = <ViewerTabBar active={tab} onSelect={setTab} tabs={[{ key: 'main', label: 'Memo' }, { key: 'docs', label: 'Documents' }, { key: 'cost', label: 'Cost validation' }]} />
  const rec = item.raw
  if (tab === 'docs') return <FarOverseasAirDocumentsModal record={rec} onClose={onClose} tabBar={bar} />
  if (tab === 'cost') return <FarOverseasAirCostValidationModal farOverseasId={rec.id} approvalStatus={rec.approval_status} onClose={onClose} onChanged={onChanged} tabBar={bar} />
  return <FarOverseasAirDetailModal record={rec} onClose={onClose} onChanged={onChanged} onOpenEdit={onOpenEdit} tabBar={bar} />
}

// ── Sea & Air ────────────────────────────────────────────────────────────────
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-1.5 border-b border-[#F1E8E1] last:border-b-0 text-[12.5px]">
    <span className="text-[#6E5E70]">{label}</span>
    <span className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</span>
  </div>
)

export function SeaAirHandoverViewer({ item, initialTab, companyNames, onClose }: {
  item: HandoverItem
  initialTab: ViewerTab
  companyNames: Record<string, string>
  onClose: () => void
}) {
  const rec = item.raw
  const { getAllowedColumns } = useAuth()
  const cols = splitFinanceColumns(getAllowedColumns('sea_air_finance'))
  const hasAudit = !!rec.seaair_id
  const startTab: ViewerTab = initialTab === 'audit' ? (hasAudit ? 'audit' : 'main') : initialTab === 'recap' ? 'recap' : item.earlier ? 'main' : initialTab
  const [tab, setTab] = useState<ViewerTab>(startTab)
  const [visited, setVisited] = useState<Record<string, boolean>>({ [startTab]: true })
  const [deliveryTerm, setDeliveryTerm] = useState<string | null>(null)
  const [auditRow, setAuditRow] = useState<any | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    if (!hasAudit || !visited.audit || auditRow !== undefined) return
    supabase.from('tabel_audit_seaair').select('*').eq('id', rec.seaair_id).maybeSingle().then(({ data }) => {
      if (cancelled) return
      setAuditRow(data ? { ...data, ...computeSeaAirBalanceAsuransi(data) } : null)
    })
    return () => { cancelled = true }
  }, [hasAudit, visited.audit, auditRow, rec.seaair_id])

  useEffect(() => {
    let cancelled = false
    if (!rec.seaair_id) return
    supabase.from('tabel_audit_seaair').select('delivery_term').eq('id', rec.seaair_id).maybeSingle().then(({ data }) => {
      if (!cancelled) setDeliveryTerm(data?.delivery_term || null)
    })
    return () => { cancelled = true }
  }, [rec.seaair_id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const go = (t: ViewerTab) => { setTab(t); setVisited(p => ({ ...p, [t]: true })) }
  const tabs: { key: ViewerTab; label: string }[] = [
    { key: 'main', label: 'Handover' },
    { key: 'recap', label: 'Invoice Recap' },
    ...(hasAudit ? [{ key: 'audit' as ViewerTab, label: 'Audit PIB' }] : []),
    ...(item.earlier ? [] : [{ key: 'docs' as ViewerTab, label: 'Documents' }, { key: 'cost' as ViewerTab, label: 'Cost validation' }]),
  ]
  const invoices = seaAirInvoiceSegments(rec)
  const pos = seaAirPoList(rec)
  const ptName = companyFullName(companyNames, rec.a_n)

  return createPortal(
    <div className="fixed inset-0 z-[75] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#FBF7F4] rounded-2xl shadow-2xl w-full max-w-[1100px] h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 bg-white border-b border-[#EADFD6] shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Chip tone="blue">Sea &amp; Air</Chip>
              {rec.a_n && <PtBadge code={rec.a_n} title={ptName} />}
              <span className="text-[11px] text-[#8A7A8B]">View only</span>
            </div>
            <h2 className="text-[18px] font-bold text-[#3B1B3D] mt-1 [overflow-wrap:anywhere]">{item.ref}</h2>
            <div className="text-[12px] text-[#6E5E70]">
              Payable to <b className="text-[#3B1B3D]">{item.payee}</b> · {fmtRp(item.amountIdr)}{item.dueDate ? ` · Due ${fmtDateShort(item.dueDate)}` : ''}{item.topLabel ? ` · ${item.topLabel}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
        </div>
        <ViewerTabBar tabs={tabs} active={tab} onSelect={go} />
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {tab === 'main' && (
            <>
              {item.earlier && (
                <div className="rounded-[14px] border border-[#EADFD6] bg-white px-4 py-2.5 text-[12.5px] text-[#6E5E70]">Earlier shipment — only the handover summary is kept here.</div>
              )}
              <div className={`${SA_CARD} px-4 py-2`}>
                <Fact label="PT">{ptName || rec.a_n || '—'}</Fact>
                <Fact label="Supplier">{rec.vendor || '—'}</Fact>
                <Fact label="Route">{rec.origin || '—'} → {rec.destination || '—'}</Fact>
                <Fact label="Shipment">{[String(rec.shipment_type || '').toUpperCase() || null, deliveryTerm].filter(Boolean).join(' · ') || '—'}</Fact>
                <Fact label="PO">{pos.length ? pos.join(', ') : '—'}</Fact>
                <Fact label="Supplier invoice">{rec.no_invoice || '—'}</Fact>
              </div>
              <div className={`${SA_CARD} overflow-hidden`}>
                <div className="px-4 pt-3 pb-2">
                  <span className="text-[13.5px] font-bold text-[#3B1B3D]">Invoices in this handover</span>
                  <span className="text-[11.5px] text-[#6E5E70] ml-2">paid to {item.payee} (PPJK — all invoices reimbursed via PPJK · excl. duty &amp; tax)</span>
                </div>
                {invoices.length === 0 ? (
                  <div className="px-4 pb-3 text-[12.5px] text-[#6E5E70]">No per-invoice amounts recorded — total taken from the recorded total invoice.</div>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {invoices.map(s => (
                        <tr key={s.key} className="border-t border-[#F1E8E1]">
                          <td className="px-4 py-2 font-semibold text-[#3B1B3D]">{s.label}</td>
                          <td className="px-3 py-2 text-[#6E5E70] [overflow-wrap:anywhere]">{rec[s.vendorCol] || (s.key === 'fd' ? rec.freight_vendor : '') || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(rec[s.costCol])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#EADFD6] bg-[#FBF7F4]">
                  <span className={SA_LABEL}>Total payable</span>
                  <span className="text-[14px] font-bold tabular-nums text-[#3B1B3D]">{fmtRp(item.amountIdr)}</span>
                </div>
              </div>
            </>
          )}
          {hasAudit && tab === 'audit' && (
            auditRow === undefined ? <div className="text-[12.5px] text-[#6E5E70] py-6 text-center">Loading Audit PIB…</div>
              : auditRow === null ? <div className="text-[12.5px] text-[#6E5E70] py-6 text-center">The Audit PIB record of this shipment could not be read.</div>
              : <FinanceAuditFields title="Audit PIB" cols={FINANCE_AUDIT_COLS.seaair} rec={auditRow} allowed={cols.audit} />
          )}
          {tab === 'recap' && (
            <FinanceAuditFields kind="recap" title="Invoice Recap" cols={FINANCE_RECAP_COLS.seaair} allowed={cols.recap}
              rec={{ ...rec, po_no: pos.join(', '), vessel: seaAirVessels(rec) }} />
          )}
          {!item.earlier && visited.docs && (
            <div className={tab === 'docs' ? '' : 'hidden'}>
              <SeaAirRecapDocumentsTab seaairId={rec.seaair_id} canEdit={false} financeView onChanged={() => {}} />
            </div>
          )}
          {!item.earlier && visited.cost && (
            <div className={tab === 'cost' ? '' : 'hidden'}>
              <SeaAirRecapCostsTab seaairId={rec.seaair_id} canEdit={false} financeView auditRow={null} onChanged={() => {}} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Tab "Audit" (2026-10-02, keputusan user): kolom baris Audit (PIB/CN Courier atau Audit PIB Sea & Air) pasangan
// handover, BACA SAJA. Kolom yang tampil dipilih Admin PER ROLE di Kelola Role & Akses (page_key Finance
// `courier_finance` / `sea_air_finance`, fitur "Kolom per role"); NULL = semua kolom. Hanya baris pasangan handover.
// Vessel Sea & Air ada di po_detail (bukan kolom tersendiri) -- digabung unik utk kolom "Vessel" Invoice Recap.
const seaAirVessels = (rec: any): string => {
  let arr: any[] = []
  try { arr = typeof rec?.po_detail === 'string' ? JSON.parse(rec.po_detail) : (Array.isArray(rec?.po_detail) ? rec.po_detail : []) } catch { arr = [] }
  return Array.from(new Set(arr.map((d: any) => String(d?.vessel || '').trim()).filter(Boolean))).join(' + ')
}

const auditValue = (c: { key: string; type?: string }, v: any): string => {
  if (v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-') return '—'
  const t = c.type || ''
  if (t === 'pct') { const n = Number(v); if (isNaN(n)) return String(v); return `${(Math.abs(n) <= 1 ? n * 100 : n).toLocaleString('id-ID', { maximumFractionDigits: 2 })} %` }
  if (t.startsWith('num')) { const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString('id-ID', { maximumFractionDigits: 2 }) }
  if (t.startsWith('date')) return fmtDateShort(v) || String(v)
  if (t === 'no_aju_format') return String(formatNoAju(v) ?? v)
  if (c.key === 'ppjk') return String(v).replace(/^\s*OWN\s+/i, '')
  return String(v)
}
export function FinanceAuditFields({ title, cols, rec, allowed, kind = 'audit' }: {
  title: string
  cols: { key: string; label: string; type?: string }[]
  rec: any
  allowed: Set<string> | null
  kind?: 'audit' | 'recap'
}) {
  const shown = cols.filter(c => !allowed || allowed.has(c.key))
  return (
    <div className={`${SA_CARD} px-4 py-3`} data-finance-fields={kind} {...(kind === 'audit' ? { 'data-finance-audit': '' } : {})}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className={SA_LABEL}>{title}</div>
        <div className="text-[11px] text-[#8A7A8B]">View only · {shown.length} column{shown.length === 1 ? '' : 's'}{allowed ? ' chosen by Admin for your role' : ''}</div>
      </div>
      {shown.length === 0 ? (
        <div className="text-[12.5px] text-[#6E5E70] py-2">No {kind === 'audit' ? 'Audit' : 'Invoice Recap'} columns are enabled for your role — ask an Admin (Settings › Kelola Role &amp; Akses › Columns).</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {shown.map(c => (
            <div key={c.key} className="grid grid-cols-[170px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px] border-t border-[#F1E8E1]">
              <div className="text-[#6E5E70]">{c.label}</div>
              <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere] tabular-nums">{auditValue(c, rec?.[c.key])}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Courier (2026-10-02): invoice + validasi PIB/CN pasangannya, BACA SAJA (keputusan user: Finance melihat Checklist,
// Doc validation & Cost validation tanpa bisa mengubah). Memakai jendela Validation yang SAMA Audit Courier
// (CourierValidationWindow + ChecklistModal/ValidasiModal/CostValidationModal) dgn editAccess semua false.
// Tab Overview = rincian invoice & serah terima. Pasangan Audit dicari SAMA Invoice Recap (pib_id/cn_id, cadangan AWB).
// Butuh policy baca Finance (sql/039) -- tanpa itu tab validasi kosong.
const courierInvoiceFacts = (item: HandoverItem, companyNames: Record<string, string>, auditNote: React.ReactNode, recapAllowed: Set<string> | null) => {
  const r = item.raw
  const fact = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px] border-t border-[#F1E8E1]">
      <div className="text-[#6E5E70]">{label}</div>
      <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{value || '—'}</div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px] text-[#6E5E70]">
        Payable to <b className="text-[#3B1B3D]">{item.payee}</b> · {fmtRp(item.amountIdr)}{item.dueDate ? ` · Due ${fmtDateShort(item.dueDate)}` : ''}{item.topLabel ? ` · ${item.topLabel}` : ''}
        {r.an && <> · <PtBadge code={r.an} title={companyFullName(companyNames, r.an)} /></>}
      </div>
      {auditNote}
      <div className={`${SA_CARD} px-4 py-3`}>
        <div className={`${SA_LABEL} mb-1`}>Handover</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
          {fact('Submitted', fmtDateShort(r.submit_date))}
          {fact('Received', r.finance_received_at ? `${fmtDateShort(r.finance_received_at)}${r.finance_received_by ? ` · ${r.finance_received_by}` : ''}` : '')}
          {fact('Paid', r.tgl_lunas ? `${fmtDateShort(r.tgl_lunas)}${r.paid_reference ? ` · ${r.paid_reference}` : ''}` : '')}
        </div>
      </div>
      {/* Kolom Invoice Recap yang tampil = pilihan Admin per role (page_key courier_finance, kolom "Invoice Recap · …"). */}
      <FinanceAuditFields kind="recap" title="Invoice Recap" cols={FINANCE_RECAP_COLS.courier} rec={r} allowed={recapAllowed} />
    </div>
  )
}

const COURIER_VIEW_ACCESS = { checklist: true, doc: true, cost: true }
const COURIER_NO_EDIT = { checklist: false, doc: false, cost: false }

export function CourierHandoverViewer({ item, initialTab = 'main', companyNames, onClose }: {
  item: HandoverItem
  initialTab?: ViewerTab
  companyNames: Record<string, string>
  onClose: () => void
}) {
  const r = item.raw
  const { getAllowedColumns } = useAuth()
  const cols = splitFinanceColumns(getAllowedColumns('courier_finance'))
  const [audit, setAudit] = useState<{ rec: any; docType: CourierDocType } | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const g = buildRecapGroup(courierAwbNorm(r.awb) || `ID:${r.id}`, [r])
        await fetchRecapAuditLinks([g])
        const rec = g.audit?.rec || null
        if (rec) {
          // Nilai SAMA layar Audit: auto-calc 7 kolom + kolom kelengkapan dari dokumen_checklist.
          Object.assign(rec, computeCourierAuditCalc(rec, g.audit!.docType, rec.manual_override_fields))
          await mergeChecklistFields([rec], ['status_kelengkapan', 'dokumen_kurang'])
          await enrichCourierValidationPct([rec])
        }
        if (!cancelled) setAudit(rec ? { rec, docType: g.audit!.docType } : null)
      } catch (e) {
        console.error('[FinanceHandover] pasangan Audit Courier gagal', e)
        if (!cancelled) setAudit(null)
      }
    })()
    return () => { cancelled = true }
  }, [r])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (audit === undefined) {
    return createPortal(
      <div className="fixed inset-0 z-[75] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3">
        <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 text-[13px] text-[#6E5E70]">Loading invoice…</div>
      </div>,
      document.body
    )
  }

  // Tanpa pasangan PIB/CN (mis. data tambah manual): hanya rincian invoice.
  if (!audit) {
    return createPortal(
      <div className="fixed inset-0 z-[75] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="bg-[#FBF7F4] rounded-2xl shadow-2xl w-full max-w-[860px] max-h-[92vh] flex flex-col overflow-hidden">
          <div className="px-5 pt-4 pb-3 bg-white border-b border-[#EADFD6] shrink-0 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap"><Chip tone="amber">Courier</Chip><span className="text-[11px] text-[#8A7A8B]">View only</span></div>
              <h2 className="text-[18px] font-bold text-[#3B1B3D] mt-1 [overflow-wrap:anywhere]">{item.ref}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {courierInvoiceFacts(item, companyNames, (
              <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2 text-[12.5px] text-[#7A4F00]">
                No PIB / CN for this AWB was found in Audit Courier — Checklist, Doc validation & Cost validation are not available.
              </div>
            ), cols.recap)}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  const rec = audit.rec
  const docNo = courierDocNo(rec, audit.docType)
  return createPortal(
    <CourierValidationWindow
      record={rec}
      mainTab="courier"
      subTab="courier_audit"
      jenisDokumen={audit.docType}
      access={COURIER_VIEW_ACCESS}
      editAccess={COURIER_NO_EDIT}
      renderChecklist={({ onPctChange, onSaved, onDirtyChange }) => (
        <ChecklistModal record={rec} tab={{ id: 'courier_audit' }} embedded canEdit={false} onClose={onClose} onSaved={onSaved} onPctChange={onPctChange} onDirtyChange={onDirtyChange} />
      )}
      initialTab={initialTab === 'docs' ? 'checklist' : initialTab === 'cost' ? 'cost' : initialTab === 'audit' ? 'extra' : 'overview'}
      title={<span className="flex items-center gap-2 flex-wrap">{item.ref}<Chip tone="amber">Courier</Chip><span className="text-[11px] font-semibold text-[#8A7A8B]">View only</span></span>}
      subtitle={[r.invoice_type, r.awb ? `AWB ${r.awb}` : '', `${audit.docType} ${docNo || ''}`.trim(), isCourierDraft(rec) ? 'Draft' : 'Audited'].filter(Boolean).join(' · ')}
      overview={<div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4">{courierInvoiceFacts(item, companyNames, null, cols.recap)}</div>}
      extraTab={{
        label: `Audit ${audit.docType}`,
        content: <FinanceAuditFields title={`Audit ${audit.docType} ${docNo || ''}`.trim()} cols={audit.docType === 'CN' ? FINANCE_AUDIT_COLS.courierCn : FINANCE_AUDIT_COLS.courierPib} rec={rec} allowed={cols.audit} />,
      }}
      onClose={onClose}
    />,
    document.body
  )
}
