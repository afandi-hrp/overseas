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
import { FINANCE_AUDIT_COLS, FINANCE_RECAP_COLS, splitFinanceColumns } from './SharedDataTable'
import { useAuth } from '../lib/AuthContext'

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

// ── Courier: viewer jendela (CourierHandoverViewer, 2026-10-02) DIHAPUS 2026-10-06 -- diganti detail DI DALAM kartu AWB
// (FinanceCourierAwbDetail.tsx, keputusan user). Riwayat: git history.
