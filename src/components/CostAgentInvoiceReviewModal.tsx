// Review invoice keagenan Cost Agent (2026-10-13, Prompt 3) -- SATU panggilan fn_cost_agent_get_invoice_history.
// Header (vendor/kapal/pelabuhan/voyage + port call, nominal, check_notes) + koreksi header (status verification/rejected ->
// fn_cost_agent_update_invoice_header lalu muat ulang) | split view: viewer file (Google Drive /preview) + tabel baris & history |
// tab Documents & Tax (susulan) | tab Timeline. Aksi: Submit for approval (verification/rejected, semua baris verified).
// Tab Approval (Prompt 4: ladder + Approve/Reject) & Payments (Prompt 5: AP Note/PV, Resend, Mark as paid).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, Pencil, Send, ExternalLink, AlertTriangle, RotateCcw, PanelLeftClose, PanelLeftOpen, FileText, Wallet, ShieldCheck, Trash2 } from 'lucide-react'
import { StatusChip, CostAgentCombobox, FieldLabel, type ComboOption } from './CostAgentUi'
import { Chip, PtBadge, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_BTN_GREEN, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import { LoadingState, LoadingSpinner } from './LoadingState'
import CostAgentInvoiceLines from './CostAgentInvoiceLines'
import CostAgentInvoiceDocuments from './CostAgentInvoiceDocuments'
import CostAgentApprovalPanel from './CostAgentApprovalPanel'
import CostAgentPaymentsPanel from './CostAgentPaymentsPanel'
import CostAgentPaymentModal from './CostAgentPaymentModal'
import {
  costAgentGetInvoiceHistory, costAgentUpdateInvoiceHeader, costAgentSubmitForApproval, costAgentUpload,
  fetchCostAgentCallOptions, callOptionLabel, drivePreviewUrl, isInvoiceEditable, canUploadSupporting,
  fmtMoney, fmtDate, fmtDateTimePort, fmtDateTimeCompact, tzAbbrev, fmtNumber, CHECK_NOTE_LABEL, canDeleteInvoice, activeApprovalStep, isApproverOf, notifyCostAgentApprovalsChanged,
  type CostAgentInvoiceHistory, type CostAgentCompany, type CostAgentVendor, type CostAgentVessel, type CostAgentPort,
  type CostAgentCostItem, type CostAgentCallOption,
} from '../utils/CostAgentHelpers'

type Tab = 'lines' | 'documents' | 'approval' | 'payments' | 'timeline'

export default function CostAgentInvoiceReviewModal({ invoiceId, companies, vendors, vessels, ports, costItems, canEdit, canPay, actor, onClose, onChanged, onToast, onDelete }: {
  invoiceId: number
  companies: CostAgentCompany[]
  vendors: CostAgentVendor[]
  vessels: CostAgentVessel[]
  ports: CostAgentPort[]
  costItems: CostAgentCostItem[]
  canEdit: boolean
  canPay: boolean // canEdit('cost_agent_payment')
  actor: string | null // email user login (juga dipakai mencocokkan approver)
  onClose: () => void
  onChanged: () => void // segarkan daftar
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onDelete?: (inv: { id: number; invoice_no: string | null; status: string }) => void // Admin, masa uji coba (sql/056)
}) {
  const [data, setData] = useState<CostAgentInvoiceHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('lines')
  const [fileIdx, setFileIdx] = useState(0)
  const [showViewer, setShowViewer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editHeader, setEditHeader] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const d = await costAgentGetInvoiceHistory(invoiceId)
      setData(d); setError(d ? null : 'Invoice not found.')
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [invoiceId])
  useEffect(() => { load() }, [load])
  // Tab awal sesuai status (sekali): menunggu approval -> Approval, approved/journal/paid -> Payments.
  const initialTabSet = useRef(false)
  useEffect(() => {
    if (!data || initialTabSet.current) return
    initialTabSet.current = true
    const st = data.invoice.status
    if (st === 'waiting_approval') setTab('approval')
    else if (st === 'approved' || st === 'journal' || st === 'paid') setTab('payments')
  }, [data])
  const reload = useCallback(async () => { await load(true); onChangedRef.current() }, [load])

  // Invoice masih diproses AI -> muat ulang tiap 5 dtk sampai status berubah.
  const status = data?.invoice.status
  useEffect(() => {
    if (status !== 'processing') return
    const iv = setInterval(() => reload(), 5000)
    return () => clearInterval(iv)
  }, [status, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const inv = data?.invoice
  const editable = !!inv && canEdit && isInvoiceEditable(inv.status)
  const files = useMemo(() => {
    if (!inv) return [] as { name: string; url: string | null }[]
    const list = (inv.files || []).map((f, i) => ({ name: f.file_name || `File ${i + 1}`, url: f.file_url || null }))
    return list.length ? list : inv.file_url ? [{ name: inv.file_name || 'Invoice', url: inv.file_url }] : []
  }, [inv])
  const current = files[Math.min(fileIdx, Math.max(0, files.length - 1))]
  const preview = drivePreviewUrl(current?.url)
  const unverified = (data?.lines || []).filter(l => !l.is_verified).length
  const call = inv?.voyage_call as any
  const callTz = call?.port_id ? ports.find(p => p.id === call.port_id)?.tz : null
  const activeStep = inv?.status === 'waiting_approval' ? activeApprovalStep(data?.approvals || []) : null
  const iAmApprover = isApproverOf(activeStep, actor)
  const hasActivePayment = (data?.payments || []).some(p => ['draft', 'submitted', 'posted', 'paid'].includes(p.status))

  const submit = async () => {
    if (!inv || unverified > 0) return
    if (!window.confirm(`Submit invoice ${inv.invoice_no || '#' + inv.id} for approval?`)) return
    setBusy(true); setActionError(null)
    try { await costAgentSubmitForApproval(inv.id, actor); await reload(); notifyCostAgentApprovalsChanged(); onToast('Submitted for approval.'); setTab('approval') } catch (e: any) { setActionError(e.message || String(e)) } finally { setBusy(false) }
  }
  const reprocess = async () => {
    if (!inv) return
    setBusy(true); setActionError(null)
    try { await costAgentUpload('cost_agent', [], { reprocess_invoice_id: inv.id }); await reload() } catch (e: any) { setActionError(e.message || String(e)) } finally { setBusy(false) }
  }

  const title = inv ? (inv.vendor_name || inv.vendor_name_raw || 'Unknown vendor') : 'Invoice'

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 max-[1600px]:p-2" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1560px] h-[94vh] max-[1600px]:max-w-none max-[1600px]:h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-3 pb-0 border-b border-[#EADFD6] shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-bold text-[#3B1B3D]">{title}</h2>
                {inv && <span className="text-[14px] font-semibold text-[#6E5E70]">{inv.invoice_no || `#${inv.id}`}</span>}
                {inv && <StatusChip status={inv.status} />}
                {inv?.company_code && <PtBadge code={inv.company_code} />}
                {inv?.duplicate_of && <Link to={`/cost-agent/invoice/${inv.duplicate_of}`}><Chip tone="red">Duplicate of #{inv.duplicate_of}</Chip></Link>}
              </div>
              {inv && <div className="text-[12px] text-[#6E5E70] mt-0.5">Invoice date {fmtDate(inv.invoice_date)} · Service date {fmtDate(inv.service_date)} · Uploaded by {inv.uploaded_by || '—'}</div>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {editable && !editHeader && <button type="button" className={SA_BTN_OUTLINE} onClick={() => setEditHeader(true)}><Pencil size={13} /> Correct header</button>}
              {onDelete && inv && canDeleteInvoice(inv.status) && (
                <button type="button" className={`${SA_BTN_OUTLINE} text-[#A8231A] hover:border-[#F4C3BC] hover:bg-[#FDE7E4]`} title="Delete this invoice (Admin, trial data)"
                  onClick={() => onDelete({ id: inv.id, invoice_no: inv.invoice_no, status: inv.status })}><Trash2 size={13} /> Delete</button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
            </div>
          </div>

          {inv && (
            <>
              {/* Strip info ringkas (2026-10-13, laptop 14"): label kecil di atas nilai, item tidak pecah baris, Grand total di kanan.
                  Dulu grid breakpoint layar (md/xl) -> 3 baris & memakan separuh tinggi modal. */}
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mt-2.5 text-[12.5px]">
                <div className="min-w-0 max-w-[340px]" title={[inv.vessel_name || inv.vessel_name_raw, inv.vessel_type, inv.vessel_dwt ? `DWT ${fmtNumber(inv.vessel_dwt, 0)}` : null].filter(Boolean).join(' · ')}>
                  <div className={SA_LABEL}>Vessel</div>
                  <div className="text-[#3B1B3D] font-medium truncate">{inv.vessel_name || <span className="text-[#A8231A]">{inv.vessel_name_raw || '—'} (unmatched)</span>}{inv.vessel_dwt ? <span className="text-[#6E5E70] font-normal"> · DWT {fmtNumber(inv.vessel_dwt, 0)}</span> : null}</div>
                </div>
                <div className="whitespace-nowrap" title={inv.port_name || inv.port_name_raw || undefined}><div className={SA_LABEL}>Port</div><div className="text-[#3B1B3D] font-medium">{inv.port_code ? `${inv.port_code} — ${inv.port_name}` : <span className="text-[#A8231A]">{inv.port_name_raw || '—'} (unmatched)</span>}</div></div>
                <div className="whitespace-nowrap" title={call ? `${fmtDateTimePort(call.arrived_at, callTz)} → ${fmtDateTimePort(call.departed_at, callTz)}` : undefined}>
                  <div className={SA_LABEL}>Voyage · port call</div>
                  <div className="text-[#3B1B3D] font-medium">
                    {inv.voyage ? `Voy ${(inv.voyage as any).voyage_no}` : <span className="text-[#A8231A]">{inv.voyage_no_raw ? `Voy ${inv.voyage_no_raw} (unmatched)` : 'Not matched'}</span>}
                    {call && <span className="text-[#6E5E70] font-normal"> · {fmtDateTimeCompact(call.arrived_at, callTz)} → {fmtDateTimeCompact(call.departed_at, callTz)} {tzAbbrev(callTz)}</span>}
                  </div>
                </div>
                <div className="whitespace-nowrap"><div className={SA_LABEL}>Subtotal</div><div className="tabular-nums">{fmtMoney(inv.subtotal, inv.currency)}</div></div>
                <div className="whitespace-nowrap"><div className={SA_LABEL}>VAT · WHT</div><div className="tabular-nums">{fmtMoney(inv.ppn, inv.currency)} · {fmtMoney(inv.pph, inv.currency)}</div></div>
                <div className="whitespace-nowrap"><div className={SA_LABEL}>Stamp</div><div className="tabular-nums">{fmtMoney(inv.materai, inv.currency)}</div></div>
                <div className="whitespace-nowrap"><div className={SA_LABEL}>Lines total</div><div className={`tabular-nums ${inv.lines_total != null && inv.subtotal != null && Math.abs(Number(inv.lines_total) - Number(inv.subtotal)) > 1 ? 'text-[#A8231A] font-semibold' : ''}`}>{fmtMoney(inv.lines_total, inv.currency)}</div></div>
                <div className="whitespace-nowrap ml-auto text-right"><div className={SA_LABEL}>Grand total</div><div className="text-[17px] leading-tight font-bold text-[#3B1B3D] tabular-nums">{fmtMoney(inv.grand_total, inv.currency)}</div></div>
              </div>
              {(inv.check_notes || []).filter(n => n.type !== 'susulan_mismatch').length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inv.check_notes.filter(n => n.type !== 'susulan_mismatch').map((n, i) => (
                    <div key={i} className="rounded-md border border-[#F2D58A] bg-[#FFF8E6] px-2 py-0.5 text-[11.5px] text-[#7A4F00] flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /><span><b>{CHECK_NOTE_LABEL[n.type || ''] || n.type || 'Note'}:</b> {n.msg || n.message || ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {inv.status === 'failed' && (
                <div className="mt-2.5 rounded-md border border-[#F4C3BC] bg-[#FDE7E4] px-2.5 py-1.5 text-[12px] text-[#A8231A] flex items-center gap-2 flex-wrap">
                  <AlertTriangle size={12} /> <span className="flex-1">AI processing failed: {inv.error_message || 'unknown error'}</span>
                  {canEdit && <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={reprocess}><RotateCcw size={13} /> Reprocess</button>}
                </div>
              )}
              {inv.status === 'processing' && (
                <div className="mt-2.5 rounded-md border border-[#C9D3F0] bg-[#EEF1FA] px-2.5 py-1.5 text-[12px] text-[#2F4FA8] flex items-center gap-2"><LoadingSpinner /> AI is reading this invoice — this window refreshes automatically.</div>
              )}
              {editHeader && <HeaderEditor data={data!} companies={companies} vendors={vendors} vessels={vessels} ports={ports} actor={actor}
                onCancel={() => setEditHeader(false)} onSaved={async () => { setEditHeader(false); await reload() }} />}
            </>
          )}

          <div className="flex gap-1 mt-2" role="tablist">
            {([['lines', `Cost lines${data ? ` (${data.lines.length})` : ''}`], ['documents', `Documents & Tax${data?.tax_checks.length ? ` (${data.tax_checks.length})` : ''}`],
              ['approval', `Approval${iAmApprover ? ' •' : ''}`], ['payments', `Payments${data?.payments.length ? ` (${data.payments.length})` : ''}`], ['timeline', 'Timeline']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-3.5 py-1.5 text-[12.5px] font-semibold border-b-2 -mb-px ${tab === k ? 'border-[#6B3470] text-[#6B3470]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'}`}>{label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? <LoadingState /> : error ? <p className="p-5 text-sm text-[#A8231A]">{error}</p> : !data ? null : tab === 'lines' ? (
            <div className="h-full flex min-h-0">
              {showViewer && (
                <div className="w-[36%] max-w-[640px] min-w-[280px] border-r border-[#EADFD6] flex flex-col min-h-0 max-lg:hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
                    {files.length === 0 ? <span className="text-[12px] text-[#8A7A8B]">No file</span> : files.map((f, i) => (
                      <button key={i} type="button" onClick={() => setFileIdx(i)} title={f.name}
                        className={`px-2 py-1 rounded-md text-[11.5px] font-semibold max-w-[180px] truncate ${i === fileIdx ? 'bg-[#F5EDF3] text-[#6B3470]' : 'text-[#6E5E70] hover:bg-[#FBF7F4]'}`}><FileText size={11} className="inline mr-1 -mt-0.5" />{f.name}</button>
                    ))}
                    {current?.url && <a href={current.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-[11.5px] text-[#6B3470] hover:underline inline-flex items-center gap-1">Open <ExternalLink size={11} /></a>}
                  </div>
                  <div className="flex-1 min-h-0 bg-[#F6EFEA]">
                    {preview ? <iframe title="Invoice file" src={preview} className="w-full h-full border-0" allow="autoplay" />
                      : <div className="h-full flex items-center justify-center text-[12.5px] text-[#6E5E70] p-4 text-center">{current?.url ? 'Preview is only available for Google Drive files — use "Open".' : 'No file stored for this invoice yet.'}</div>}
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <div className="flex-1 min-h-0">
                  <CostAgentInvoiceLines lines={data.lines} currency={data.invoice.currency} costItems={costItems} editable={editable} actor={actor} onChanged={reload}
                    toolbarLeft={
                      <button type="button" className="text-[11.5px] text-[#6E5E70] hover:text-[#6B3470] inline-flex items-center gap-1 max-lg:hidden" onClick={() => setShowViewer(v => !v)}
                        title={showViewer ? 'Hide the invoice file' : 'Show the invoice file'}>
                        {showViewer ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}<span>{showViewer ? 'Hide file' : 'Show file'}</span>
                      </button>
                    } />
                </div>
              </div>
            </div>
          ) : tab === 'approval' ? (
            <div className="h-full overflow-y-auto">
              <CostAgentApprovalPanel data={data} email={actor} canEdit={canEdit} actor={actor} onDecided={async (r, decision) => {
                await reload(); notifyCostAgentApprovalsChanged()
                if (decision === 'rejected') onToast('Invoice rejected.', 'warn')
                else if (r?.status === 'approved') onToast(`Invoice approved — ${r.history_rows ?? 0} line${r.history_rows === 1 ? '' : 's'} saved as cost reference.`)
                else onToast('Step approved — waiting for the next approver.')
              }} />
            </div>
          ) : tab === 'payments' ? (
            <div className="h-full overflow-y-auto">
              <CostAgentPaymentsPanel data={data} canPay={canPay} actor={actor} onCreate={() => setShowPay(true)}
                onChanged={async msg => { await reload(); if (msg) onToast(msg) }} />
            </div>
          ) : tab === 'documents' ? (
            <div className="h-full overflow-y-auto"><CostAgentInvoiceDocuments data={data} canUpload={canEdit && canUploadSupporting(data.invoice.status)} onChanged={reload} /></div>
          ) : (
            <div className="h-full overflow-y-auto p-5">
              {data.timeline.length === 0 ? <p className="text-sm text-[#6E5E70] italic">No status history.</p> : (
                <ol className="relative border-l-2 border-[#EADFD6] ml-2 space-y-3">
                  {data.timeline.map(t => (
                    <li key={t.id} className="pl-4 relative">
                      <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-[#6B3470] border-2 border-white" />
                      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                        {t.from_status && t.from_status !== t.to_status && <><StatusChip status={t.from_status} /><span className="text-[#8A7A8B]">→</span></>}
                        <StatusChip status={t.to_status} />
                        <span className="text-[#6E5E70]">{fmtDateTimePort(t.created_at, null)} · {t.actor || '—'}</span>
                      </div>
                      {t.note && <p className="text-[12.5px] text-[#3B1B3D] mt-0.5">{t.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {/* Footer aksi */}
        {inv && (
          <div className="px-5 py-2.5 border-t border-[#EADFD6] bg-[#FBF7F4] flex items-center gap-3 flex-wrap shrink-0">
            {actionError && <span className="text-[12.5px] text-[#A8231A] flex items-center gap-1.5"><AlertTriangle size={13} /> {actionError}</span>}
            {inv.status === 'waiting_approval' && (
              <span className="text-[12.5px] text-[#5B2E8C]">Waiting for approval{activeStep ? ` — step ${activeStep.step_no}: ${activeStep.approver_label}` : ''}.</span>
            )}
            {inv.status === 'paid' && <span className="text-[12.5px] text-[#17663D]">Paid {fmtDate(inv.paid_at)}{inv.paid_ref ? ` · ref ${inv.paid_ref}` : ''}</span>}
            <div className="ml-auto flex items-center gap-2">
              {inv.status === 'waiting_approval' && iAmApprover && canEdit && tab !== 'approval' && (
                <button type="button" className={SA_BTN_GREEN} onClick={() => setTab('approval')}><ShieldCheck size={13} /> Review &amp; decide</button>
              )}
              {inv.status === 'approved' && canPay && !hasActivePayment && (
                <button type="button" className={SA_BTN_GREEN} onClick={() => setShowPay(true)}><Wallet size={13} /> Create AP Note / PV</button>
              )}
              {inv.status === 'journal' && canPay && tab !== 'payments' && (
                <button type="button" className={SA_BTN_OUTLINE} onClick={() => setTab('payments')}><Wallet size={13} /> Mark as paid</button>
              )}
              {editable && (
                <button type="button" className={unverified ? SA_BTN_OUTLINE : SA_BTN_GREEN} disabled={busy || unverified > 0} onClick={submit}
                  title={unverified ? 'Verify every cost line first' : undefined}>
                  <Send size={13} /> {busy ? 'Submitting…' : 'Submit for approval'}{unverified ? ` · ${unverified} not verified` : ''}
                </button>
              )}
              <button type="button" className={SA_BTN_PRIMARY} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
      {showPay && inv && (
        <CostAgentPaymentModal invoiceIds={[inv.id]} actor={actor} onClose={() => { setShowPay(false); setTab('payments') }} onDone={() => { reload() }} />
      )}
    </div>,
    document.body,
  )
}

// Koreksi header (vendor / kapal / pelabuhan / port call / company) -> fn_cost_agent_update_invoice_header.
function HeaderEditor({ data, companies, vendors, vessels, ports, actor, onCancel, onSaved }: {
  data: CostAgentInvoiceHistory; companies: CostAgentCompany[]; vendors: CostAgentVendor[]; vessels: CostAgentVessel[]
  ports: CostAgentPort[]; actor: string | null; onCancel: () => void; onSaved: () => void
}) {
  const inv = data.invoice
  const [vendorId, setVendorId] = useState<number | null>(inv.vendor_id)
  const [vesselId, setVesselId] = useState<number | null>(inv.vessel_id)
  const [portId, setPortId] = useState<number | null>(inv.port_id)
  const [callId, setCallId] = useState<number | null>(inv.voyage_call_id)
  const [company, setCompany] = useState(inv.company_code || '')
  const [calls, setCalls] = useState<CostAgentCallOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCostAgentCallOptions({ vesselId, limit: 1000 }).then(list => { if (!cancelled) setCalls(list) }).catch(() => { if (!cancelled) setCalls([]) })
    return () => { cancelled = true }
  }, [vesselId])

  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name, sub: v.npwp || undefined })), [vendors])
  const vesselOpts: ComboOption[] = useMemo(() => vessels.map(v => ({ value: v.id, label: v.name, sub: [v.vessel_type, v.dwt ? `DWT ${fmtNumber(v.dwt, 0)}` : null].filter(Boolean).join(' · ') })), [vessels])
  const portOpts: ComboOption[] = useMemo(() => ports.map(p => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: (p.aliases || []).join(' '), warn: p.is_verified ? undefined : 'Port not verified yet' })), [ports])
  const callOpts: ComboOption[] = useMemo(() => calls.map(c => ({ value: c.id, label: callOptionLabel(c), sub: `${fmtDateTimePort(c.arrived_at, c.port_tz)} → ${fmtDateTimePort(c.departed_at, c.port_tz)}`, keywords: `${c.port_name}` })), [calls])

  const pickCall = (v: number | string | null) => {
    const id = v === null ? null : Number(v)
    setCallId(id)
    const c = calls.find(x => x.id === id)
    if (c) { setPortId(c.port_id); if (!company && c.company_code) setCompany(c.company_code) } // pelabuhan ikut port call
  }

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await costAgentUpdateInvoiceHeader({ invoiceId: inv.id, vendorId, vesselId, portId, voyageCallId: callId, companyCode: company || null, actor })
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <div className="mt-3 rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-3">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
        <div><FieldLabel>Vendor</FieldLabel><CostAgentCombobox options={vendorOpts} value={vendorId} onChange={v => setVendorId(v === null ? null : Number(v))} placeholder={inv.vendor_name_raw || 'Vendor…'} /></div>
        <div><FieldLabel>Vessel</FieldLabel><CostAgentCombobox options={vesselOpts} value={vesselId} onChange={v => { setVesselId(v === null ? null : Number(v)); setCallId(null) }} placeholder={inv.vessel_name_raw || 'Vessel…'} /></div>
        <div className="md:col-span-2"><FieldLabel hint="sets the port">Voyage port call</FieldLabel><CostAgentCombobox options={callOpts} value={callId} onChange={pickCall} placeholder={vesselId ? 'Port call of this vessel…' : 'Pick a vessel first'} disabled={!vesselId} /></div>
        <div><FieldLabel>Port</FieldLabel><CostAgentCombobox options={portOpts} value={portId} onChange={v => setPortId(v === null ? null : Number(v))} placeholder={inv.port_name_raw || 'Port…'} /></div>
        <div>
          <FieldLabel>Company</FieldLabel>
          <select className={SA_INPUT} value={company} onChange={e => setCompany(e.target.value)}>
            <option value="">—</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="md:col-span-4 flex items-end justify-end gap-2">
          {error && <span className="text-[12px] text-[#A8231A] mr-auto">{error}</span>}
          <button type="button" className={SA_BTN_OUTLINE} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save header'}</button>
        </div>
      </div>
    </div>
  )
}
