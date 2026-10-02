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
import { fmtRp, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import { seaAirInvoiceSegments, seaAirPoList, type HandoverItem } from '../utils/FinanceHandoverHelpers'
import CourierValidationWindow from './CourierValidationWindow'
import { ChecklistModal } from './SharedDataTable'
import { buildRecapGroup, courierAwbNorm, fetchRecapAuditLinks } from '../utils/CourierRecapHelpers'
import { enrichCourierValidationPct } from '../utils/CourierValidationPct'
import { courierDocNo, isCourierDraft, type CourierDocType } from '../utils/CourierAuditHelpers'

export type ViewerTab = 'main' | 'docs' | 'cost'

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
  const [tab, setTab] = useState<ViewerTab>(item.earlier ? 'main' : initialTab)
  const [visited, setVisited] = useState<Record<string, boolean>>({ [item.earlier ? 'main' : initialTab]: true })
  const [deliveryTerm, setDeliveryTerm] = useState<string | null>(null)

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
  const tabs: { key: ViewerTab; label: string }[] = item.earlier
    ? [{ key: 'main', label: 'Handover' }]
    : [{ key: 'main', label: 'Handover' }, { key: 'docs', label: 'Documents' }, { key: 'cost', label: 'Cost validation' }]
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

// ── Courier (2026-10-02): invoice + validasi PIB/CN pasangannya, BACA SAJA (keputusan user: Finance melihat Checklist,
// Doc validation & Cost validation tanpa bisa mengubah). Memakai jendela Validation yang SAMA Audit Courier
// (CourierValidationWindow + ChecklistModal/ValidasiModal/CostValidationModal) dgn editAccess semua false.
// Tab Overview = rincian invoice & serah terima. Pasangan Audit dicari SAMA Invoice Recap (pib_id/cn_id, cadangan AWB).
// Butuh policy baca Finance (sql/039) -- tanpa itu tab validasi kosong.
const courierInvoiceFacts = (item: HandoverItem, companyNames: Record<string, string>, auditNote: React.ReactNode) => {
  const r = item.raw
  const fact = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px] border-t border-[#F1E8E1] first:border-t-0">
      <div className="text-[#6E5E70]">{label}</div>
      <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{value || '—'}</div>
    </div>
  )
  const amt = (label: string, v: any) => (v === null || v === undefined || v === '' ? null : (
    <div className="flex justify-between gap-3 py-1.5 text-[12.5px] border-t border-[#F1E8E1] first:border-t-0"><span className="text-[#6E5E70]">{label}</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(v)}</span></div>
  ))
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px] text-[#6E5E70]">
        Payable to <b className="text-[#3B1B3D]">{item.payee}</b> · {fmtRp(item.amountIdr)}{item.dueDate ? ` · Due ${fmtDateShort(item.dueDate)}` : ''}{item.topLabel ? ` · ${item.topLabel}` : ''}
        {r.an && <> · <PtBadge code={r.an} title={companyFullName(companyNames, r.an)} /></>}
      </div>
      {auditNote}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`${SA_CARD} px-4 py-3`}>
          <div className={`${SA_LABEL} mb-1`}>Invoice</div>
          {fact('Invoice type', r.invoice_type)}
          {fact('PPJK', r.ppjk)}
          {fact('Vendor', r.vendor)}
          {fact('AWB', r.awb)}
          {fact('Origin', r.origin)}
          {fact('Email received', fmtDateShort(r.tgl_terima_email))}
          {fact('PO PT IMI', r.po_pt_imi)}
          {fact('PO Non IMI', r.po_shipping)}
          {fact('Vessel', r.vessel)}
          {fact('Remarks', r.notes)}
        </div>
        <div className={`${SA_CARD} px-4 py-3`}>
          <div className={`${SA_LABEL} mb-1`}>Amount</div>
          {amt('Courier adm fee', r.courier_adm_fee)}
          {amt('Total freight', r.total_freight)}
          {amt('Total duty tax', r.total_duty_tax)}
          {amt('Total amount', r.total_amount)}
          <div className={`${SA_LABEL} mt-3 mb-1`}>Handover</div>
          {fact('Submitted', fmtDateShort(r.submit_date))}
          {fact('Received', r.finance_received_at ? `${fmtDateShort(r.finance_received_at)}${r.finance_received_by ? ` · ${r.finance_received_by}` : ''}` : '')}
          {fact('Paid', r.tgl_lunas ? `${fmtDateShort(r.tgl_lunas)}${r.paid_reference ? ` · ${r.paid_reference}` : ''}` : '')}
        </div>
      </div>
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
  const [audit, setAudit] = useState<{ rec: any; docType: CourierDocType } | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const g = buildRecapGroup(courierAwbNorm(r.awb) || `ID:${r.id}`, [r])
        await fetchRecapAuditLinks([g])
        const rec = g.audit?.rec || null
        if (rec) await enrichCourierValidationPct([rec])
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
            ))}
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
      initialTab={initialTab === 'docs' ? 'checklist' : initialTab === 'cost' ? 'cost' : 'overview'}
      title={<span className="flex items-center gap-2 flex-wrap">{item.ref}<Chip tone="amber">Courier</Chip><span className="text-[11px] font-semibold text-[#8A7A8B]">View only</span></span>}
      subtitle={[r.invoice_type, r.awb ? `AWB ${r.awb}` : '', `${audit.docType} ${docNo || ''}`.trim(), isCourierDraft(rec) ? 'Draft' : 'Audited'].filter(Boolean).join(' · ')}
      overview={courierInvoiceFacts(item, companyNames, null)}
      onClose={onClose}
    />,
    document.body
  )
}
