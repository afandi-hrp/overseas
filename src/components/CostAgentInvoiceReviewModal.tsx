// Review invoice keagenan Cost Agent (2026-10-13, Prompt 3) -- SATU panggilan fn_cost_agent_get_invoice_history.
// Header (vendor/kapal/pelabuhan/voyage + port call, nominal, check_notes) + koreksi header (status verification/rejected ->
// fn_cost_agent_update_invoice_header lalu muat ulang) | split view: viewer file (Google Drive /preview) + tabel baris & history |
// tab Documents & Tax (susulan) | tab Timeline. Aksi: Submit for approval (verification/rejected, semua baris verified &
// -- sql/065 -- semua baris punya cost item).
// Tab Approval (Prompt 4: ladder + Approve/Reject) & Payments (Prompt 5: AP Note/PV, Resend, Mark as paid).
// sql/057: koreksi header -> combobox vendor cari server (ilike, 20) + "+ Add vendor" (fn_cost_agent_add_vendor) & teks asli
// invoice (*_name_raw) di bawah Vendor/Vessel/Port; cache hasil Browse history per filter selama modal terbuka.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, Pencil, Send, CheckCircle2, Maximize2, Minimize2, AlertTriangle, RotateCcw, PanelLeftClose, PanelLeftOpen, FileText, Wallet, ShieldCheck, Trash2, Plus, ChevronDown, ChevronUp, Ban } from 'lucide-react'
import { StatusChip, CostAgentCombobox, CostAgentModal, FieldLabel, type ComboOption } from './CostAgentUi'
import { Chip, PtBadge, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_BTN_GREEN, SA_INPUT, SA_LABEL, SA_CARD } from './SeaAirAuditUi'
import { LoadingState, LoadingSpinner } from './LoadingState'
import CostAgentInvoiceLines from './CostAgentInvoiceLines'
import { noteText, noteMsg } from '../utils/CostAgentNotes'
import CostAgentApprovalPanel from './CostAgentApprovalPanel'
import CostAgentPaymentsPanel from './CostAgentPaymentsPanel'
import CostAgentFinanceMappingCard from './CostAgentFinanceMappingCard'
import { DocGateBanner, InvoicePeriod, useInvoiceGate, verifyBlockReason } from './CostAgentDocGate'
import { DOC_GATE_TOAST, isDocGateError } from '../utils/CostAgentGate'
import { CheckerPanel, ReasonDialog, WorkflowStepper, useInvoiceWorkflow } from './CostAgentWorkflow'
import { ApprovalRouteView, useApprovalRoute } from './CostAgentApprovalRoute'
import CostAgentDocsSummary from './CostAgentDocsSummary'
import { useLineVerifyReasons } from './CostAgentVerifyReasons'
import { costAgentVoidInvoice, getMyRoles, getReminderAfterDays, isSodError } from '../utils/CostAgentWorkflow'
import { canSeePaymentsTab, type MyRoles } from '../utils/CostAgentRolesLogic'
import { submitBlockReason } from '../utils/CostAgentGateView'
import CostAgentPaymentModal from './CostAgentPaymentModal'
import type { HistoryCache } from './CostAgentHistoryBrowser'
import {
  costAgentGetInvoiceHistory, costAgentUpdateInvoiceHeader, costAgentUpdateInvoiceAmounts, costAgentSubmitForApproval, costAgentUpload,
  costAgentAddVendor, searchCostAgentVendors, formatNpwp, costAgentSetInvoiceDescription, COST_AGENT_DESCRIPTION_MAX,
  fetchCostAgentCallOptions, callOptionLabel, drivePreviewUrl, isInvoiceEditable, canUploadSupporting,
  fmtMoney, fmtDate, fmtDateTimePort, fmtDateTimeCompact, tzAbbrev, fmtNumber, canDeleteInvoice, activeApprovalStep, isApproverOf, notifyCostAgentApprovalsChanged,
  type CostAgentInvoiceHistory, type CostAgentCompany, type CostAgentVendor, type CostAgentVessel, type CostAgentPort,
  type CostAgentCostItem, type CostAgentCallOption,
} from '../utils/CostAgentHelpers'

type Tab = 'lines' | 'documents' | 'approval' | 'payments' | 'timeline'

// Strip info header (Vessel / Port / Voyage / Description) bisa dilipat -- pola "Shipment Info" panel Validation Courier. Pilihan disimpan
// per browser; default terlipat bila tinggi jendela < 900px (laptop 14").
const INFO_KEY = 'beehive_cost_agent_invoice_info_open'
const initialInfoOpen = (): boolean => {
  try {
    const v = window.localStorage.getItem(INFO_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* storage tidak tersedia */ }
  return typeof window !== 'undefined' && window.innerHeight >= 900
}
// Titik status kecil di tab (hanya tampilan, dihitung dari data yg sudah ada).
const DOT_CLS = { ok: 'bg-[#17663D]', warn: 'bg-[#E0A526]', bad: 'bg-[#A8231A]' }
type Dot = keyof typeof DOT_CLS | null

export default function CostAgentInvoiceReviewModal({ invoiceId, companies, vendors, vessels, ports, costItems, canEdit, canPay, actor, onClose, onChanged, onToast, onDelete, initialTab, focusLines }: {
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
  // Dari popover "Needs attention" daftar (Tahap 3a): buka langsung di tab ini, dan sorot baris bernomor ini di tab Cost lines.
  initialTab?: Tab
  focusLines?: number[]
}) {
  const [data, setData] = useState<CostAgentInvoiceHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('lines')
  const [fileIdx, setFileIdx] = useState(0)
  const [showViewer, setShowViewer] = useState(false) // 2026-10-16 (permintaan user): file invoice default tersembunyi
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editHeader, setEditHeader] = useState(false)
  const [showPay, setShowPay] = useState(false)
  // Viewer file layar penuh DI HALAMAN INI (2026-10-14, permintaan user: jangan buka tab baru).
  const [fullView, setFullView] = useState(false)
  const [infoOpen, setInfoOpen] = useState<boolean>(initialInfoOpen)
  const toggleInfo = () => setInfoOpen(v => {
    const next = !v
    try { window.localStorage.setItem(INFO_KEY, next ? '1' : '0') } catch { /* abaikan */ }
    return next
  })
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const historyCache = useRef<HistoryCache>(new Map()) // hasil Browse history per filter (hidup selama modal terbuka)

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
    if (initialTab) setTab(initialTab)
    else if (st === 'waiting_approval') setTab('approval')
    else if (st === 'approved' || st === 'journal' || st === 'paid') setTab('payments')
  }, [data])
  // reloadData = muat ulang data saja. reload = data + gerbang dokumen (BACA SAJA, tanpa auto-verify: baris yang baru di-Unverify tidak boleh langsung diverifikasi ulang sistem).
  const gateRefreshRef = useRef<() => void>(() => {})
  const wfRefreshRef = useRef<() => void>(() => {}) // status alur kerja (sql/088) ikut dimuat ulang tiap aksi
  const reloadData = useCallback(async () => { await load(true); onChangedRef.current() }, [load])
  const reload = useCallback(async () => { await reloadData(); gateRefreshRef.current(); wfRefreshRef.current() }, [reloadData])
  // Sorot baris yang ditunjuk temuan (sekali, setelah tab Cost lines tampil): gulir ke tengah + cincin ungu 2,5 dtk.
  const focusDone = useRef(false)
  useEffect(() => {
    if (focusDone.current || !data || tab !== 'lines' || !focusLines?.length) return
    const ln = data.lines.find(l => focusLines.includes(l.line_no))
    if (!ln) return
    focusDone.current = true
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-line-id="${ln.id}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('ring-2', 'ring-[#6B3470]')
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#6B3470]'), 2500)
    }, 350)
    return () => clearTimeout(t)
  }, [data, tab, focusLines])

  // Invoice masih diproses AI -> muat ulang tiap 5 dtk sampai status berubah.
  const status = data?.invoice.status
  useEffect(() => {
    if (status !== 'processing') return
    const iv = setInterval(() => reload(), 5000)
    return () => clearInterval(iv)
  }, [status, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (fullView) setFullView(false); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, fullView])

  const inv = data?.invoice
  // Alur kerja (sql/088): tombol aksi MENGIKUTI workflow.me.can_* (role + SoD dihitung server). Sebelum termuat / status lain dipakai hak edit lama.
  const workflow = useInvoiceWorkflow(invoiceId, inv?.status)
  const wf = workflow.wf
  wfRefreshRef.current = workflow.refresh
  const makerCan = !!inv && (wf && isInvoiceEditable(inv.status) ? wf.me.can_verify : canEdit)
  const checkerMode = !!inv && inv.status === 'waiting_approval' && !!wf?.me.can_validate
  const editable = !!inv && makerCan && isInvoiceEditable(inv.status)
  // Koreksi header (sql/058 update): verification / rejected / failed. Baris tetap hanya verification/rejected (`editable`).
  const headerEditable = !!inv && makerCan && (isInvoiceEditable(inv.status) || inv.status === 'failed')
  // Gerbang kelengkapan dokumen (sql/087): run_checks SEKALI saat dibuka; selanjutnya baca saja kecuali Re-check / dokumen susulan / periode / header.
  const gate = useInvoiceGate({ invoiceId, status: inv?.status, canEdit: makerCan, onToast, onLinesChanged: reloadData })
  gateRefreshRef.current = gate.refresh
  const gateActive = !!inv && (inv.status === 'verification' || inv.status === 'rejected' || (inv.status === 'waiting_approval' && wf?.validation?.status === 'pending'))
  const gateBlock = gateActive && inv?.status !== 'waiting_approval' ? verifyBlockReason(gate.gate) : null
  const gateIncomplete = gateActive && inv?.status !== 'waiting_approval' && !!gate.gate && gate.gate.enabled && gate.gate.blockers.length > 0
  // Approval Matrix v2 (sql/090): pratinjau rute sebelum Submit; tanpa aturan yang cocok -> Submit nonaktif (alasan dari database).
  const routeState = useApprovalRoute(invoiceId, [inv?.company_code, inv?.vendor_id, inv?.vessel_id, inv?.grand_total, inv?.lines_total, data?.lines.length].join('|'), editable || inv?.status === 'verification' || inv?.status === 'rejected')
  const routeBlock = routeState.route && !routeState.route.matched ? (routeState.route.reason || 'No approval rule matches this invoice') : null
  // SATU alasan Submit nonaktif (yang pertama berlaku): SoD/peran dari server -> PT -> jenis biaya -> verifikasi -> gerbang dokumen -> rute approval.
  const submitReason = submitBlockReason({ blockedReason: wf?.me.blocked_reason ?? null, companyMissing: !!inv && !inv.company_code, unmapped: (data?.lines || []).filter(l => !l.cost_item_id).length, unverified: (data?.lines || []).filter(l => !l.is_verified).length, gateFirst: gateIncomplete ? (gate.gate?.blockers[0]?.label ?? 'see Documents & Tax') : null, routeBlock })
  // Lonceng peringatan di header: catatan header + dokumen belum lengkap (gerbang) + rute approval tidak cocok -- tidak lagi memakan ruang di tab Cost lines.
  const gateBlockers = gateActive && gate.gate && gate.gate.enabled ? gate.gate.blockers.length : 0
  const bellCount = (inv?.check_notes || []).filter(n => n.type !== 'susulan_mismatch').length + gateBlockers + (routeBlock ? 1 : 0)
  // Alasan "kenapa belum auto-verified" (RPC hanya baca): sekali saat dibuka (verification / rejected) + ulang bila baris / gerbang dokumen berubah. Tanpa polling; gagal = diam.
  const reasonsSig = (data?.lines || []).map(l => `${l.id}:${l.is_verified ? 1 : 0}:${l.cost_item_id ?? ''}:${l.amount}:${l.compare_flag ?? ''}:${l.compare_ref_amount ?? ''}:${l.compare_check ? 1 : 0}`).join('|') + `#${gate.gate?.complete ?? ''}:${gate.gate?.blockers.length ?? ''}`
  const verifyReasons = useLineVerifyReasons(invoiceId, !!inv && (inv.status === 'verification' || inv.status === 'rejected'), reasonsSig)
  // Tab Payments tidak tampil untuk Maker / Approver (permintaan user 2026-10-29). Peran dibaca sekali dari cache sesi; gagal baca = tab tetap tampil.
  const [myRoles, setMyRoles] = useState<MyRoles | null>(null)
  useEffect(() => { let alive = true; getMyRoles().then(r => { if (alive) setMyRoles(r) }).catch(() => { /* tab tetap tampil */ }); return () => { alive = false } }, [])
  const showPayments = canSeePaymentsTab(myRoles)
  useEffect(() => { if (!showPayments && tab === 'payments') setTab(inv?.status === 'waiting_approval' ? 'approval' : 'lines') }, [showPayments, tab, inv?.status])
  const [reminderDays, setReminderDays] = useState(3)
  useEffect(() => { getReminderAfterDays().then(setReminderDays) }, [])
  const [voidDlg, setVoidDlg] = useState(false)
  const [voidBusy, setVoidBusy] = useState(false)
  const [voidErr, setVoidErr] = useState<string | null>(null)
  const canVoid = !!inv && ['failed', 'verification', 'rejected', 'waiting_approval'].includes(inv.status) && (canEdit || !!wf?.me.can_verify)
  const doVoid = async (reason: string) => {
    if (!inv) return
    setVoidBusy(true); setVoidErr(null)
    try { await costAgentVoidInvoice(inv.id, reason, actor); setVoidDlg(false); await reload(); notifyCostAgentApprovalsChanged(); onToast('Invoice voided.', 'warn') }
    catch (e: any) { if (isSodError(e)) onToast(e.message, 'warn'); setVoidErr(e?.message || String(e)) } finally { setVoidBusy(false) }
  }
  const [periodOpen, setPeriodOpen] = useState(false)
  const goToLine = (lineNo: number) => {
    const id = data?.lines.find(l => l.line_no === lineNo)?.id
    setTab('lines')
    if (id !== undefined) setTimeout(() => document.querySelector(`[data-line-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
  }
  const files = useMemo(() => {
    if (!inv) return [] as { name: string; url: string | null }[]
    const list = (inv.files || []).map((f, i) => ({ name: f.file_name || `File ${i + 1}`, url: f.file_url || null }))
    return list.length ? list : inv.file_url ? [{ name: inv.file_name || 'Invoice', url: inv.file_url }] : []
  }, [inv])
  const current = files[Math.min(fileIdx, Math.max(0, files.length - 1))]
  const preview = drivePreviewUrl(current?.url)
  const unverified = (data?.lines || []).filter(l => !l.is_verified).length
  // sql/065: submit_for_approval menolak baris tanpa jenis biaya (cost_item_id null) -> tombol dinonaktifkan lebih dulu.
  const unmapped = (data?.lines || []).filter(l => !l.cost_item_id).length
  // check_notes -> field header (2026-10-16): alert tampil langsung di bubble field terkait. susulan_mismatch tetap di tab Documents.
  const allNotes = (inv?.check_notes || []).filter(n => n.type !== 'susulan_mismatch')
  const notesFor = (field: NoteField) => allNotes.filter(n => noteField(n.type) === field)
  const fixHeader = headerEditable && !editHeader ? () => setEditHeader(true) : undefined
  // 2026-10-23 (sql/071): lines_total = jumlah SEMUA baris termasuk materai; subtotal = biaya TANPA materai. Cocok bila lines_total = subtotal
  // (data lama, materai belum jadi baris) ATAU subtotal + materai. Toleransi Rp 1 per baris (sen dibuang di database).
  const linesMismatch = !!inv && inv.lines_total != null && inv.subtotal != null && (() => {
    const lt = Number(inv.lines_total), st = Number(inv.subtotal), mt = Number(inv.materai || 0)
    const tol = Math.max(1, (data?.lines.length || 0))
    return Math.abs(lt - st) > tol && Math.abs(lt - (st + mt)) > tol
  })()
  // PT kosong (tak bisa ditentukan dari kapal -> catatan company_unknown): Submit nonaktif sampai dipilih di Correct header.
  const companyMissing = !!inv && !inv.company_code
  const call = inv?.voyage_call as any
  const callTz = call?.port_id ? ports.find(p => p.id === call.port_id)?.tz : null
  const activeStep = inv?.status === 'waiting_approval' ? activeApprovalStep(data?.approvals || []) : null
  const iAmApprover = isApproverOf(activeStep, actor)
  const hasActivePayment = (data?.payments || []).some(p => ['draft', 'submitted', 'posted', 'paid'].includes(p.status))
  // Titik status di tab (tampilan saja).
  const tabDot: Record<Tab, Dot> = {
    lines: !data || data.lines.length === 0 ? null : unverified > 0 || unmapped > 0 ? 'warn' : 'ok',
    documents: null,
    approval: !inv ? null : ['approved', 'journal', 'paid'].includes(inv.status) ? 'ok' : inv.status === 'waiting_approval' ? 'warn' : inv.status === 'rejected' ? 'bad' : null,
    payments: !inv ? null : inv.status === 'paid' ? 'ok' : (data?.payments.length ? 'warn' : null),
    timeline: null,
  }

  const submit = async () => {
    if (!inv || submitReason) return
    if (!window.confirm(`Submit invoice ${inv.invoice_no || '#' + inv.id} for approval?`)) return
    setBusy(true); setActionError(null)
    try { await costAgentSubmitForApproval(inv.id, actor); await reload(); notifyCostAgentApprovalsChanged(); onToast('Submitted for approval.'); setTab('approval') } catch (e: any) {
      if (isDocGateError(e)) { onToast(DOC_GATE_TOAST, 'warn'); gate.refresh(); setTab('lines') } // teks mentah server panjang: cukup toast + muat ulang gerbang
      else setActionError(e.message || String(e))
    } finally { setBusy(false) }
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
          {/* Header (2026-10-20, permintaan user): kiri judul, kanan = tombol alert (jumlah catatan) + pensil Correct header + Delete + tutup;
              baris pil Vessel / Port / Voyage / Description di bawahnya. Nominal (Subtotal/VAT/WHT/Stamp) pindah ke footer. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {inv?.company_code && <PtBadge code={inv.company_code} />}
                <h2 className="text-[18px] font-bold text-[#3B1B3D]">{title}</h2>
                {inv && <span className="text-[12px] font-semibold text-[#6E5E70] px-2 py-0.5 rounded-md bg-[#F3EEEA]">{inv.invoice_no || `#${inv.id}`}</span>}
                {inv && <StatusChip status={inv.status} />}
                {inv?.duplicate_of && <Link to={`/cost-agent/invoice/${inv.duplicate_of}`}><Chip tone="red">Duplicate of #{inv.duplicate_of}</Chip></Link>}
              </div>
              {inv && <div className="text-[12px] text-[#6E5E70] mt-0.5 flex items-center gap-x-1.5 flex-wrap">
                <span>Invoice date {fmtDate(inv.invoice_date)} · Service date {fmtDate(inv.service_date)} · Uploaded by {inv.uploaded_by || '—'}</span>
                <span className="text-[#C9BFCB]">·</span>
                <InvoicePeriod invoiceId={inv.id} gate={gate.gate} canChange={headerEditable} actor={actor} open={periodOpen} onOpenChange={setPeriodOpen} onToast={onToast}
                  onSaved={async () => { await gate.recheck(); await reloadData() }} />
              </div>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ringkasan verifikasi baris (2026-10-23, permintaan user: pindah dari toolbar Cost lines ke header; tombol Submit tidak lagi
                  memuat alert). "10/12 not verified" = baris belum diverifikasi / total baris; chip "N without cost item" ikut pindah. */}
              {inv && data && data.lines.length > 0 && (
                <span className="inline-flex items-center gap-1.5 flex-wrap" data-lines-summary>
                  <Chip tone={unverified ? 'amber' : 'green'} title={`${unverified} of ${data.lines.length} cost lines not verified`}>
                    {unverified ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}{unverified ? `${unverified}/${data.lines.length} not verified` : 'all verified'}
                  </Chip>
                  {unmapped > 0 && <span data-unmapped-count><Chip tone="red">{unmapped} without cost item</Chip></span>}
                </span>
              )}
              {inv && bellCount > 0 && (
                <AlertsButton notes={allNotes} inv={inv} onFix={fixHeader} count={bellCount}
                  extra={close => (
                    <>
                      {gateActive && (!!gate.error || (gate.gate && (gate.gate.blockers.length > 0 || gate.gate.warnings.length > 0))) && (
                        <div data-bell-documents>
                          <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">Documents</div>
                          <DocGateBanner gate={gate.gate} error={gate.error} busy={gate.busy} onRecheck={gate.recheck} onGoToLine={n => { close(); goToLine(n) }}
                            onOpenDocs={() => { close(); setTab('documents') }} onSetPeriod={headerEditable ? () => { close(); setPeriodOpen(true) } : undefined} />
                        </div>
                      )}
                      {editable && routeState.route && (
                        <div data-bell-route>
                          <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">Approval route</div>
                          <ApprovalRouteView route={routeState.route} />
                        </div>
                      )}
                    </>
                  )} />
              )}
              {headerEditable && !editHeader && (
                <button type="button" className={`${SA_BTN_OUTLINE} !px-2.5`} onClick={() => setEditHeader(true)} aria-label="Correct header" title="Correct header (vendor, vessel, port call, company)"><Pencil size={13} /></button>
              )}
              {onDelete && inv && canDeleteInvoice(inv.status) && (
                <button type="button" className={`${SA_BTN_OUTLINE} text-[#A8231A] hover:border-[#F4C3BC] hover:bg-[#FDE7E4]`} title="Delete this invoice (Admin, trial data)"
                  onClick={() => onDelete({ id: inv.id, invoice_no: inv.invoice_no, status: inv.status })}><Trash2 size={13} /> Delete</button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className={`${SA_BTN_OUTLINE} !px-2.5`}><X size={15} /></button>
            </div>
          </div>

          {inv && (
            <>
              {inv.status === 'failed' && (
                <div className="mt-2.5 rounded-md border border-[#F4C3BC] bg-[#FDE7E4] px-2.5 py-1.5 text-[12px] text-[#A8231A] flex items-center gap-2 flex-wrap">
                  <AlertTriangle size={12} /> <span className="flex-1">AI processing failed: {inv.error_message || 'unknown error'}</span>
                  {canEdit && <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={reprocess}><RotateCcw size={13} /> Reprocess</button>}
                </div>
              )}
              {inv.status === 'processing' && (
                <div className="mt-2.5 rounded-md border border-[#C9D3F0] bg-[#EEF1FA] px-2.5 py-1.5 text-[12px] text-[#2F4FA8] flex items-center gap-2"><LoadingSpinner /> AI is reading this invoice — this window refreshes automatically.</div>
              )}
              {editHeader && <HeaderEditor data={data!} companies={companies} vendors={vendors} vessels={vessels} ports={ports} actor={actor} onToast={onToast}
                onCancel={() => setEditHeader(false)} onSaved={async () => { setEditHeader(false); await reload() }} />}
            </>
          )}

          <div className="flex items-end gap-1.5 mt-2 overflow-x-auto" role="tablist">
            {([['lines', `Cost lines${data ? ` (${data.lines.length})` : ''}`], ['documents', `Documents & Tax${data?.tax_checks.length ? ` (${data.tax_checks.length})` : ''}`],
              ['approval', `Approval${iAmApprover ? ' •' : ''}`], ['payments', `Payments${data?.payments.length ? ` (${data.payments.length})` : ''}`], ['timeline', 'Timeline']] as [Tab, string][]).filter(([k]) => k !== 'payments' || showPayments).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`shrink-0 flex items-center gap-1.5 px-3 pt-1.5 pb-1.5 rounded-t-lg text-[12.5px] font-semibold border-b-[3px] transition-colors ${tab === k ? 'bg-[#F5EDF3] text-[#6B3470] border-[#6B3470] font-bold' : 'bg-[#F3EEEA] text-[#3B1B3D] border-transparent opacity-80 hover:opacity-100'}`}>
                {tabDot[k] && <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLS[tabDot[k]!]}`} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Strip info (2026-10-20, permintaan user "cantikkan" -- pola Shipment Info panel Validation Courier): latar ungu muda, sel berlabel. */}
        {inv && (
          <InfoStrip inv={inv} open={infoOpen} onToggle={toggleInfo} vesselWarn={notesFor('vessel').length > 0} portWarn={notesFor('port').length > 0}
            voyageWarn={notesFor('voyage').length > 0} call={call} callTz={callTz}
            description={<InvoiceDescription inv={inv} editable={headerEditable} actor={actor} onSaved={reload} onToast={onToast} />} />
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden bg-[#FBF7F4]">
          {loading ? <LoadingState /> : error ? <p className="p-5 text-sm text-[#A8231A]">{error}</p> : !data ? null : tab === 'lines' ? (
            <div className="h-full p-2.5 min-h-0 flex flex-col gap-2">
              <div className={`${SA_CARD} flex-1 flex min-h-0 overflow-hidden`}>
              {showViewer && (
                <div className="w-[33%] max-w-[600px] min-w-[280px] border-r border-[#EADFD6] flex flex-col min-h-0 max-lg:hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
                    {files.length === 0 ? <span className="text-[12px] text-[#8A7A8B]">No file</span> : files.map((f, i) => (
                      <button key={i} type="button" onClick={() => setFileIdx(i)} title={f.name}
                        className={`px-2 py-1 rounded-md text-[11.5px] font-semibold max-w-[180px] truncate ${i === fileIdx ? 'bg-[#F5EDF3] text-[#6B3470]' : 'text-[#6E5E70] hover:bg-[#FBF7F4]'}`}><FileText size={11} className="inline mr-1 -mt-0.5" />{f.name}</button>
                    ))}
                    {current?.url && <button type="button" onClick={() => setFullView(true)} className="ml-auto text-[11.5px] text-[#6B3470] hover:underline inline-flex items-center gap-1">Full screen <Maximize2 size={11} /></button>}
                  </div>
                  <div className="flex-1 min-h-0 bg-[#F6EFEA] relative">
                    {preview ? <FilePreviewFrame src={preview} drive onFullScreen={() => setFullView(true)} />
                      : <div className="h-full flex items-center justify-center text-[12.5px] text-[#6E5E70] p-4 text-center">{current?.url ? 'Preview is only available for Google Drive files — use "Full screen".' : 'No file stored for this invoice yet.'}</div>}
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <div className="flex-1 min-h-0">
                  <CostAgentInvoiceLines variant="summary" lines={data.lines} currency={data.invoice.currency} costItems={costItems} editable={editable} actor={actor} onChanged={reload} onToast={onToast}
                    invoice={data.invoice} ports={ports} vessels={vessels} vendors={vendors} historyCache={historyCache.current}
                    verifyBlock={gateBlock} onGateBlocked={gate.refresh} checkerMode={checkerMode} verifyReasons={verifyReasons}
                    toolbarLeft={
                      <button type="button" className="text-[11.5px] text-[#6E5E70] hover:text-[#6B3470] inline-flex items-center gap-1 max-lg:hidden" onClick={() => setShowViewer(v => !v)}
                        title={showViewer ? 'Hide the invoice file' : 'Show the invoice file'}>
                        {showViewer ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}<span>{showViewer ? 'Hide file' : 'Show file'}</span>
                      </button>
                    } />
                </div>
              </div>
            </div></div>
          ) : tab === 'approval' ? (
            <div className="h-full overflow-y-auto">
              {wf && !['processing', 'failed', 'verification'].includes(data.invoice.status) && (
                <div className="px-4 pt-4 space-y-4">
                  <WorkflowStepper wf={wf} reminderDays={reminderDays} />
                  <CheckerPanel invoiceId={data.invoice.id} wf={wf} actor={actor} onToast={onToast} onGateBlocked={() => { gate.refresh(); setTab('lines') }}
                    onDone={async msg => { await reload(); notifyCostAgentApprovalsChanged(); onToast(msg) }} />
                </div>
              )}
              <CostAgentApprovalPanel data={data} email={actor} canEdit={canEdit} actor={actor} workflow={wf} onToast={onToast} routePreview={routeState.route} onDecided={async (r, decision) => {
                await reload(); notifyCostAgentApprovalsChanged()
                if (decision === 'rejected') onToast('Invoice rejected.', 'warn')
                else if (r?.status === 'approved') onToast(`Invoice approved — ${r.history_rows ?? 0} line${r.history_rows === 1 ? '' : 's'} saved as cost reference.`)
                else if (r?.forwarded) onToast('Forwarded — the Director gets the final approval.')
                else if (r?.votes !== undefined && r?.of) onToast(`${r.votes} of ${r.of} approved — waiting for the others.`)
                else if (r?.waiting_for === 'checker') onToast('All approvals done — waiting for checker validation.')
                else onToast('Step approved — waiting for the next approver.')
              }} />
            </div>
          ) : tab === 'payments' ? (
            <div className="h-full overflow-y-auto">
              <div className="px-4 pt-4 -mb-2">
                <CostAgentFinanceMappingCard invoiceId={data.invoice.id} vendorName={data.invoice.vendor_name}
                  vendorNpwp={vendors.find(v => v.id === data.invoice.vendor_id)?.npwp ?? null} vesselName={data.invoice.vessel_name}
                  canEdit={canEdit} onToast={onToast}
                  onGoToLine={(_n, lineId) => {
                    setTab('lines')
                    if (lineId !== null) setTimeout(() => document.querySelector(`[data-line-id="${lineId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
                  }} />
              </div>
              <CostAgentPaymentsPanel data={data} canPay={canPay} actor={actor} onCreate={() => setShowPay(true)}
                onChanged={async msg => { await reload(); if (msg) onToast(msg) }} />
            </div>
          ) : tab === 'documents' ? (
            <div className="h-full overflow-y-auto">
              <div className="p-3">
                <CostAgentDocsSummary data={data} gate={gate.gate} gateError={gate.error} gateBusy={gate.busy} onRecheck={gate.recheck} actor={actor}
                  canUpload={makerCan && canUploadSupporting(data.invoice.status)}
                  onChanged={async () => { await reloadData(); await gate.recheck() }} onToast={onToast}
                  onGoToLine={goToLine} onSetPeriod={headerEditable ? () => setPeriodOpen(true) : undefined} />
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-3"><div className={`${SA_CARD} p-5`}>
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
            </div></div>
          )}
        </div>

        {/* Footer aksi */}
        {inv && (
          <div className="px-5 py-2.5 border-t border-[#EADFD6] bg-[#FBF7F4] flex items-center gap-3 flex-wrap shrink-0">
            <AmountsBar inv={inv} editable={headerEditable} bad={linesMismatch} warn={notesFor('total').length > 0} actor={actor} onSaved={reload} onToast={onToast} />
            {actionError && <span className="text-[12.5px] text-[#A8231A] flex items-center gap-1.5"><AlertTriangle size={13} /> {actionError}</span>}
            {inv.status === 'waiting_approval' && (
              <span className="text-[12.5px] text-[#5B2E8C]">Waiting for approval{activeStep ? ` — step ${activeStep.step_no}: ${activeStep.approver_label}` : ''}.</span>
            )}
            {inv.status === 'paid' && <span className="text-[12.5px] text-[#17663D]">Paid {fmtDate(inv.paid_at)}{inv.paid_ref ? ` · ref ${inv.paid_ref}` : ''}</span>}
            <div className="ml-auto flex items-center gap-2">
              {inv.status === 'waiting_approval' && (wf ? (wf.me.can_approve || wf.me.can_validate) : iAmApprover && canEdit) && tab !== 'approval' && (
                <button type="button" className={SA_BTN_GREEN} onClick={() => setTab('approval')}><ShieldCheck size={13} /> Review &amp; decide</button>
              )}
              {inv.status === 'approved' && canPay && showPayments && !hasActivePayment && (
                <button type="button" className={SA_BTN_GREEN} onClick={() => setShowPay(true)}><Wallet size={13} /> Create AP Note / PV</button>
              )}
              {inv.status === 'journal' && canPay && showPayments && tab !== 'payments' && (
                <button type="button" className={SA_BTN_OUTLINE} onClick={() => setTab('payments')}><Wallet size={13} /> Mark as paid</button>
              )}
              {editable && submitReason && (
                <span className="text-[12px] font-semibold text-[#7A4F00] inline-flex items-center gap-1.5 max-w-[360px] max-md:max-w-full" data-submit-reason title={submitReason}>
                  <AlertTriangle size={13} className="shrink-0" /><span className="truncate">{submitReason}</span>
                </span>
              )}
              {editable && !submitReason && routeState.route?.matched && (
                <span className="text-[11.5px] text-[#6E5E70] max-w-[300px] truncate max-md:hidden" title={routeState.route.steps.map(s => `${s.label}${s.mode === 'all' ? ' (all must approve)' : ''}`).join(' → ')} data-route-summary>
                  Route: {routeState.route.steps.map(s => s.label).join(' → ')}
                </span>
              )}
              {editable && (
                // 2026-10-23 (permintaan user): tombol TANPA alert (ringkasan "N/M not verified" ada di header). Belum siap = abu (nonaktif,
                // alasan di tooltip); siap = hijau pekat. (2026-10-16: dulu kotak kuning dgn chip alasan di dalam tombol.)
                <button type="button" disabled={busy || !!submitReason} onClick={submit} data-submit-approval
                  title={submitReason ?? undefined}
                  className={submitReason
                    ? 'inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-[#D9D1CB] bg-[#EDE8E4] text-[#8A7A8B] text-[13px] font-bold cursor-not-allowed'
                    : 'inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#17663D] hover:bg-[#12532F] text-white text-[13px] font-bold shadow-md ring-2 ring-[#17663D]/20 disabled:opacity-60'}>
                  <Send size={15} /> {busy ? 'Submitting…' : 'Submit for approval'}
                </button>
              )}
              {canVoid && (
                <button type="button" className={`${SA_BTN_OUTLINE} text-[#A8231A] hover:border-[#F4C3BC] hover:bg-[#FDE7E4]`} onClick={() => { setVoidErr(null); setVoidDlg(true) }} data-void-invoice title="Cancel this invoice (a reason is required)"><Ban size={13} /> Void invoice</button>
              )}
              <button type="button" className={SA_BTN_PRIMARY} onClick={onClose}>Close</button>
            </div>
          </div>
        )}
        {voidDlg && <ReasonDialog title="Void invoice" label="Reason" confirmLabel="Void invoice" danger busy={voidBusy} error={voidErr} onConfirm={doVoid} onClose={() => setVoidDlg(false)}
          notice="The invoice is cancelled and leaves the approval flow. This cannot be undone." />}
      </div>
      {fullView && current?.url && createPortal(
        <div className="fixed inset-0 z-[85] bg-slate-900/70 backdrop-blur-sm flex flex-col p-3 max-[1600px]:p-2" data-file-fullscreen
          onMouseDown={e => { if (e.target === e.currentTarget) setFullView(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
              {files.map((f, i) => (
                <button key={i} type="button" onClick={() => setFileIdx(i)} title={f.name}
                  className={`px-2 py-1 rounded-md text-[12px] font-semibold max-w-[260px] truncate ${i === fileIdx ? 'bg-[#F5EDF3] text-[#6B3470]' : 'text-[#6E5E70] hover:bg-[#FBF7F4]'}`}><FileText size={12} className="inline mr-1 -mt-0.5" />{f.name}</button>
              ))}
              <button type="button" onClick={() => setFullView(false)} aria-label="Close full screen" title="Close (Esc)"
                className="ml-auto p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 bg-[#F6EFEA] relative">
              <FilePreviewFrame src={preview || current.url} drive={!!preview} exit onFullScreen={() => setFullView(false)} />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {showPay && inv && (
        <CostAgentPaymentModal invoiceIds={[inv.id]} actor={actor} onClose={() => { setShowPay(false); setTab('payments') }} onDone={() => { reload() }} />
      )}
    </div>,
    document.body,
  )
}

// Koreksi header (vendor / kapal / pelabuhan / port call / company) -> fn_cost_agent_update_invoice_header.
// ─── Header bubble & catatan per field (2026-10-16) ─────────────────────────────────────────────────────────────
type NoteField = 'title' | 'vessel' | 'port' | 'voyage' | 'total' | 'other'
const NOTE_FIELD: Record<string, NoteField> = {
  vendor_unknown: 'title', duplicate: 'title', vessel_unknown: 'vessel', vessel_fuzzy: 'vessel', port_unknown: 'port',
  voyage_unmatched: 'voyage', total_mismatch: 'total', grand_mismatch: 'total',
}
const noteField = (type: string | undefined): NoteField => NOTE_FIELD[type || ''] || 'other'
// Catatan yg bisa dibereskan lewat Correct header (vendor/kapal/pelabuhan/voyage).
const FIXABLE_NOTES = new Set(['vendor_unknown', 'vessel_unknown', 'vessel_fuzzy', 'port_unknown', 'voyage_unmatched', 'company_unknown'])

function InfoBubble({ label, children, warn, title, money, bad, small, action, muted }: {
  label: string; children: React.ReactNode; warn?: boolean; title?: string; money?: boolean; bad?: boolean; small?: boolean; action?: React.ReactNode; muted?: boolean
}) {
  // v2 (2026-10-16, permintaan user): label polos di atas, bubble (pill) HANYA membungkus isian.
  warn = warn || bad
  return (
    <div className="min-w-0" title={title} data-bubble={label}>
      <div className={`${SA_LABEL} mb-0.5 pl-1`}>{label}</div>
      <div className={`inline-block max-w-full rounded-full border ${small ? 'px-2.5 text-[11.5px]' : 'px-3'} py-0.5 whitespace-nowrap leading-snug ${warn ? 'border-[#F2D58A] bg-[#FFFBF0]' : 'border-[#EADFD6] bg-[#FBF7F4]'} ${money ? 'tabular-nums' : 'font-medium'} ${bad ? 'text-[#A8231A] font-semibold' : muted ? 'text-[#8A7A8B]' : 'text-[#3B1B3D]'}`} data-bubble-value>{children}{action}</div>
    </div>
  )
}

// Sel strip info (pola InfoCell panel Validation Courier). `warn` = ada catatan check_notes untuk field ini.
function InfoCell({ label, children, warn, title, extra, className = '', ...rest }: {
  label: string; children: React.ReactNode; warn?: boolean; title?: string; extra?: React.ReactNode; className?: string
} & Record<`data-${string}`, string | undefined>) {
  return (
    <div className={`min-w-0 px-2.5 py-1.5 ${warn ? 'bg-[#FFFBF0]' : 'bg-[#FCF8FB]'} ${className}`} title={title} data-cell={label} {...rest}>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-none">{label}</p>
        {warn && <AlertTriangle size={10} className="text-[#B7791F]" />}
        {extra}
      </div>
      <div className="text-[12px] font-semibold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{children}</div>
    </div>
  )
}

// Strip info di bawah header modal: Vessel / Port / Voyage · port call / Description. Bisa dilipat jadi 1 baris ringkas.
function InfoStrip({ inv, open, onToggle, vesselWarn, portWarn, voyageWarn, call, callTz, description }: {
  inv: CostAgentInvoiceHistory['invoice']; open: boolean; onToggle: () => void; vesselWarn: boolean; portWarn: boolean; voyageWarn: boolean
  call: any; callTz: string | null | undefined; description: React.ReactNode
}) {
  const bad = (t: string) => <span className="text-[#A8231A]">{t}</span>
  const vessel = inv.vessel_name || bad(`${inv.vessel_name_raw || '—'} (unmatched)`)
  const port = inv.port_code ? `${inv.port_code} — ${inv.port_name}` : bad(`${inv.port_name_raw || '—'} (unmatched)`)
  const voyage = inv.voyage ? `Voy ${(inv.voyage as any).voyage_no}` : bad(inv.voyage_no_raw ? `Voy ${inv.voyage_no_raw} (unmatched)` : 'Not matched')
  const callText = call ? `${fmtDateTimeCompact(call.arrived_at, callTz)} → ${fmtDateTimeCompact(call.departed_at, callTz)} ${tzAbbrev(callTz)}` : null
  const callTitle = call ? `${fmtDateTimePort(call.arrived_at, callTz)} → ${fmtDateTimePort(call.departed_at, callTz)}` : undefined
  return (
    <div className="shrink-0 px-3 py-2 bg-[#F5EDF3] border-b border-[#D9C7DA] @container" data-header-info>
      {!open ? (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11.5px]" data-info-collapsed>
          <span className="min-w-0"><span className="text-[#8A7A8B]">Vessel </span><b className="text-[#3B1B3D]">{vessel}</b></span>
          <span className="min-w-0"><span className="text-[#8A7A8B]">Port </span><b className="text-[#3B1B3D]">{port}</b></span>
          <span className="min-w-0"><span className="text-[#8A7A8B]">Voyage </span><b className="text-[#3B1B3D]">{voyage}</b></span>
          <button type="button" onClick={onToggle} className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6B3470] hover:underline shrink-0">
            Show all info <ChevronDown size={13} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-1">
            <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B3470] hover:underline">
              Hide info <ChevronUp size={13} />
            </button>
          </div>
          <div className="rounded-[12px] border border-[#D9C7DA] overflow-hidden">
            <div className="grid grid-cols-2 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-px bg-[#E4D3E2]" data-header-bubbles>
              <InfoCell label="Vessel" warn={vesselWarn}
                title={[inv.vessel_name || inv.vessel_name_raw, inv.vessel_type, inv.vessel_dwt ? `DWT ${fmtNumber(inv.vessel_dwt, 0)}` : null].filter(Boolean).join(' · ')}>
                {vessel}{inv.vessel_dwt ? <span className="text-[#6E5E70] font-normal"> · DWT {fmtNumber(inv.vessel_dwt, 0)}</span> : null}
              </InfoCell>
              <InfoCell label="Port" warn={portWarn} title={inv.port_name || inv.port_name_raw || undefined}>{port}</InfoCell>
              <InfoCell label="Voyage · port call" warn={voyageWarn} title={callTitle} className="col-span-2 @4xl:col-span-1">
                {voyage}{callText && <span className="text-[#6E5E70] font-normal"> · {callText}</span>}
              </InfoCell>
              {description}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GrandTotal({ value }: { value: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap" data-grand-total>
      <span className={SA_LABEL}>Grand total</span>
      <span className="text-[16px] font-bold text-[#3B1B3D] tabular-nums">{value}</span>
    </span>
  )
}

// Tombol alert (2026-10-20): ikon peringatan + jumlah catatan di samping tombol edit header; klik -> daftar catatan (+ Fix).
function AlertsButton({ notes, inv, onFix, count, extra }: {
  notes: CostAgentInvoiceHistory['invoice']['check_notes']; inv: CostAgentInvoiceHistory['invoice']; onFix?: () => void
  count?: number // total peringatan di lencana (catatan header + dokumen + rute); bawaan = jumlah catatan
  extra?: (close: () => void) => React.ReactNode // bagian tambahan (Documents, Approval route)
}) {
  const total = count ?? notes.length
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref} data-header-alerts>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label={`${total} alert${total === 1 ? '' : 's'}`} aria-expanded={open}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#F2D58A] bg-[#FFF3CF] text-[#7A4F00] hover:bg-[#FFE9A8]">
        <AlertTriangle size={16} />
        <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#A8231A] text-white text-[10px] font-bold inline-flex items-center justify-center">{total}</span>
      </button>
      {open && (
        <div className={`absolute right-0 top-full mt-1.5 z-[90] ${extra ? 'w-[min(620px,92vw)]' : 'w-[min(440px,86vw)]'} max-h-[72vh] overflow-y-auto rounded-xl border border-[#F2D58A] bg-white shadow-xl p-2 flex flex-col gap-2`}>
          {notes.map((n, i) => {
            const fixable = !!onFix && FIXABLE_NOTES.has(n.type || '')
            return (
              <div key={i} className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-2.5 py-1.5 text-[12px] text-[#7A4F00] flex items-start gap-1.5" data-check-note={n.type || ''}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="font-semibold">{noteText(n, inv)}</span>
                  {noteMsg(n) && <span className="block text-[10.5px] font-normal text-[#8A7A8B]" data-note-msg>{noteMsg(n)}</span>}
                </span>
                {fixable && (
                  <button type="button" onClick={() => { setOpen(false); onFix?.() }} className="shrink-0 ml-2 font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-0.5"><Pencil size={11} /> Fix</button>
                )}
              </div>
            )
          })}
          {extra?.(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// Footer nominal (2026-10-23, sql/071): urutan Cost lines (incl. stamp duty) = lines_total | VAT = ppn | VAT not collected = ppn_not_collected (abu-abu, hanya bila > 0,
// "Already deducted from VAT") | WHT = pph | Grand total. Bea materai BUKAN lagi kelompok pajak: ia baris biasa (cost item MATERAI) dan sudah ada di Cost lines.
// Pensil -> VAT & WHT bisa diubah (fn_cost_agent_update_invoice_amounts, sql/069; subtotal & materai dikirim apa adanya); Grand total = subtotal + VAT + materai - WHT
// (dihitung server, pratinjau live saat edit). Semua nominal rupiah bulat tanpa desimal.
function AmountsBar({ inv, editable, bad, warn, actor, onSaved, onToast }: {
  inv: CostAgentInvoiceHistory['invoice']; editable: boolean; bad: boolean; warn: boolean; actor: string | null
  onSaved: () => Promise<void> | void; onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ ppn: '', pph: '' })
  const start = () => {
    const v = (n: number | null) => (n == null ? '' : String(Math.trunc(Number(n))))
    setF({ ppn: v(inv.ppn), pph: v(inv.pph) }); setError(null); setEditing(true)
  }
  const num = (t: string) => (t.trim() === '' ? 0 : Number(t))
  const subtotalFixed = inv.subtotal == null ? null : Number(inv.subtotal)
  const materaiFixed = Number(inv.materai || 0)
  const valid = subtotalFixed != null && Number.isFinite(subtotalFixed) && [f.ppn, f.pph].every(t => Number.isFinite(num(t)) && num(t) >= 0)
  const preview = (subtotalFixed ?? 0) + num(f.ppn) + materaiFixed - num(f.pph)
  const save = async () => {
    if (!valid) { setError('Amounts cannot be negative.'); return }
    setBusy(true); setError(null)
    try {
      await costAgentUpdateInvoiceAmounts({ invoiceId: inv.id, subtotal: subtotalFixed as number, ppn: num(f.ppn), pph: num(f.pph), materai: materaiFixed, actor })
      setEditing(false); await onSaved(); onToast('Amounts saved.')
    } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(false) }
  }
  const linesBubble = (
    <InfoBubble label="Cost lines (incl. stamp duty)" money small warn={warn} bad={bad}
      title={bad ? `Cost lines total ${fmtMoney(inv.lines_total)} differs from the subtotal (+ stamp duty)` : 'Sum of all cost lines, including stamp duty'}>{fmtMoney(inv.lines_total)}</InfoBubble>
  )
  if (editing) {
    const fields: [keyof typeof f, string][] = [['ppn', 'VAT'], ['pph', 'WHT']]
    return (
      <div className="flex flex-wrap items-end gap-2" data-amounts-edit>
        {linesBubble}
        {fields.map(([k, label]) => (
          <div key={k}>
            <div className={`${SA_LABEL} mb-0.5 pl-1`}>{label}</div>
            <input type="number" min={0} step={1} inputMode="numeric" className={`${SA_INPUT} w-[130px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} value={f[k]} disabled={busy} aria-label={label}
              onChange={e => setF(p => ({ ...p, [k]: e.target.value.includes('.') ? e.target.value.split('.')[0] : e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setEditing(false) } }} />
          </div>
        ))}
        <GrandTotal value={fmtMoney(valid ? preview : null)} />
        <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} disabled={busy || !valid} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {error && <span className="basis-full text-[12px] text-[#A8231A]">{error}</span>}
      </div>
    )
  }
  const notCollected = Number(inv.ppn_not_collected || 0)
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5" data-header-amounts>
      {linesBubble}
      <InfoBubble label="VAT" money small>{fmtMoney(inv.ppn)}</InfoBubble>
      {notCollected > 0 && (
        <InfoBubble label="VAT not collected" money small muted title="Already deducted from VAT">{fmtMoney(notCollected)}</InfoBubble>
      )}
      <InfoBubble label="WHT" money small>{fmtMoney(inv.pph)}</InfoBubble>
      {editable && (
        <button type="button" onClick={start} aria-label="Edit amounts" title="Edit VAT / WHT" className="mb-0.5 p-1.5 rounded-lg text-[#6B3470] hover:bg-[#F5EDF3]"><Pencil size={13} /></button>
      )}
      <GrandTotal value={fmtMoney(inv.grand_total)} />
    </div>
  )
}

function HeaderEditor({ data, companies, vendors, vessels, ports, actor, onToast, onCancel, onSaved }: {
  data: CostAgentInvoiceHistory; companies: CostAgentCompany[]; vendors: CostAgentVendor[]; vessels: CostAgentVessel[]
  ports: CostAgentPort[]; actor: string | null; onToast: (msg: string, tone?: 'ok' | 'warn') => void; onCancel: () => void; onSaved: () => void
}) {
  const inv = data.invoice
  const [vendor, setVendor] = useState<{ id: number; name: string } | null>(inv.vendor_id ? { id: inv.vendor_id, name: inv.vendor_name || `#${inv.vendor_id}` } : null)
  const vendorId = vendor?.id ?? null
  // Vendor yang SUDAH ada di database (invoice sudah ter-match) tidak boleh diganti; belum ter-match -> hanya boleh "+ Add vendor" (2026-10-20,
  // permintaan user). Pembatasan di UI saja -- RPC koreksi header tetap menerima vendorId.
  const vendorLocked = !!inv.vendor_id
  const [vesselId, setVesselId] = useState<number | null>(inv.vessel_id)
  const [portId, setPortId] = useState<number | null>(inv.port_id)
  const [callId, setCallId] = useState<number | null>(inv.voyage_call_id)
  const [company, setCompany] = useState(inv.company_code || '')
  // company_unknown (sql/071): PT tak bisa ditentukan dari kapal -> dropdown Company di-highlight kuning sampai dipilih.
  const companyUnknown = !company && (inv.check_notes || []).some(n => n.type === 'company_unknown')
  const [description, setDescription] = useState(inv.description || '')
  const [calls, setCalls] = useState<CostAgentCallOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCostAgentCallOptions({ vesselId, limit: 1000 }).then(list => { if (!cancelled) setCalls(list) }).catch(() => { if (!cancelled) setCalls([]) })
    return () => { cancelled = true }
  }, [vesselId])

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
      // Keterangan (dulu pensil inline di header): hanya bila berubah & tidak kosong (kosong = biarkan; "Reset to auto" ada di header).
      const descNew = description.trim()
      if (descNew && descNew !== (inv.description || '').trim()) await costAgentSetInvoiceDescription(inv.id, descNew, actor)
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <div className="mt-3 rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-3">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
        <div>
          <FieldLabel hint={vendorLocked ? 'already in database' : 'new vendors only'}>Vendor</FieldLabel>
          {vendorLocked
            ? <div className={`${SA_INPUT} flex items-center bg-[#F6EFEA] text-[#6E5E70] cursor-not-allowed`} title="This vendor is already in the database and cannot be changed" aria-readonly="true"><span className="truncate">{vendor?.name}</span></div>
            : <VendorCombobox addOnly value={vendor} onChange={setVendor} rawName={inv.vendor_name_raw} knownVendors={vendors} actor={actor} onToast={onToast} />}
          <AsWritten raw={inv.vendor_name_raw} />
        </div>
        <div><FieldLabel>Vessel</FieldLabel><CostAgentCombobox options={vesselOpts} value={vesselId} onChange={v => { setVesselId(v === null ? null : Number(v)); setCallId(null) }} placeholder={inv.vessel_name_raw || 'Vessel…'} /><AsWritten raw={inv.vessel_name_raw} /></div>
        <div className="md:col-span-2"><FieldLabel hint="sets the port">Voyage port call</FieldLabel><CostAgentCombobox options={callOpts} value={callId} onChange={pickCall} placeholder={vesselId ? 'Port call of this vessel…' : 'Pick a vessel first'} disabled={!vesselId} /></div>
        <div><FieldLabel>Port</FieldLabel><CostAgentCombobox options={portOpts} value={portId} onChange={v => setPortId(v === null ? null : Number(v))} placeholder={inv.port_name_raw || 'Port…'} /><AsWritten raw={inv.port_name_raw} /></div>
        <div>
          <FieldLabel hint={companyUnknown ? 'required' : undefined}>Company</FieldLabel>
          <select className={`${SA_INPUT} ${companyUnknown ? '!border-[#E0B84F] !bg-[#FFF6DD] ring-2 ring-[#F2D58A]' : ''}`} value={company} onChange={e => setCompany(e.target.value)} data-company-unknown={companyUnknown ? 'true' : undefined}>
            <option value="">—</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="md:col-span-4">
          <FieldLabel hint={`${description.length}/${COST_AGENT_DESCRIPTION_MAX}`}>Description</FieldLabel>
          <input className={`${SA_INPUT} uppercase`} value={description} maxLength={COST_AGENT_DESCRIPTION_MAX} onChange={e => setDescription(e.target.value)} aria-label="Invoice description" />
        </div>
        <div className="md:col-span-5 flex items-end justify-end gap-2">
          {error && <span className="text-[12px] text-[#A8231A] mr-auto">{error}</span>}
          <button type="button" className={SA_BTN_OUTLINE} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save header'}</button>
        </div>
      </div>
    </div>
  )
}

// Teks asli di invoice (hasil baca AI) di bawah field koreksi header.
function AsWritten({ raw }: { raw: string | null | undefined }) {
  if (!raw) return null
  return <div className="mt-0.5 text-[11px] text-[#8A7A8B] truncate" title={raw}>As written on invoice: <span className="text-[#6E5E70]">{raw}</span></div>
}

// Combobox vendor: cari cost_agent_vendors di server (name ilike, maks 20); tidak ketemu -> "+ Add vendor "<teks>"".
function VendorCombobox({ value, onChange, rawName, knownVendors, actor, onToast, addOnly = false }: {
  addOnly?: boolean // true: TANPA memilih vendor yang sudah ada -- hanya "+ Add vendor" (server mengembalikan id lama bila nama/alias/NPWP sudah ada)
  value: { id: number; name: string } | null
  onChange: (v: { id: number; name: string } | null) => void
  rawName: string | null
  knownVendors: CostAgentVendor[]
  actor: string | null
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CostAgentVendor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null) // teks yg diketik saat klik "+ Add vendor"
  const seq = useRef(0)

  useEffect(() => {
    if (!open || addOnly) return
    const my = ++seq.current
    const t = setTimeout(async () => {
      setLoading(true); setError(null)
      try { const r = await searchCostAgentVendors(q, 20); if (my === seq.current) setResults(r) }
      catch (e: any) { if (my === seq.current) { setResults([]); setError(e.message || String(e)) } }
      finally { if (my === seq.current) setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, addOnly])

  const term = q.trim()
  const exact = !!term && results.some(v => v.name.trim().toLowerCase() === term.toLowerCase())

  return (
    <div className="relative">
      <div className="relative">
        <input className={`${SA_INPUT} pr-7`} value={open ? q : value?.name || ''} placeholder={value?.name || rawName || 'Vendor…'}
          onFocus={() => { setQ(''); setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQ(e.target.value); setOpen(true) }} />
        {value && (
          <button type="button" tabIndex={-1} aria-label="Clear" onMouseDown={e => { e.preventDefault(); onChange(null) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>
        )}
      </div>
      {open && (
        <div className="absolute z-[90] mt-1 w-full min-w-[240px] max-h-64 overflow-y-auto bg-white border border-[#EADFD6] rounded-lg shadow-xl">
          {addOnly ? (!term && <div className="px-3 py-2 text-[12px] text-[#8A7A8B]">Type the new vendor's name, then choose “+ Add vendor”.</div>)
            : loading && results.length === 0 ? <div className="px-3 py-2"><LoadingSpinner /></div>
            : error ? <div className="px-3 py-2 text-[12px] text-[#A8231A]">{error}</div>
            : results.length === 0 ? <div className="px-3 py-2 text-[12px] text-[#8A7A8B]">No vendor found</div>
            : results.map(v => (
              <button type="button" key={v.id} onMouseDown={e => { e.preventDefault(); onChange({ id: v.id, name: v.name }); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#FBF7F4] ${v.id === value?.id ? 'bg-[#F5EDF3]' : ''}`}>
                <span className="block text-[#3B1B3D] font-medium truncate">{v.name}</span>
                {v.npwp && <span className="block text-[11px] text-[#6E5E70] truncate">{v.npwp}</span>}
              </button>
            ))}
          {term && (addOnly || (!exact && !loading)) && (
            <button type="button" onMouseDown={e => { e.preventDefault(); setAdding(term); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-[#6B3470] hover:bg-[#F5EDF3] border-t border-[#F3EEEA] inline-flex items-center gap-1">
              <Plus size={12} /> Add vendor "{term}"
            </button>
          )}
        </div>
      )}
      {adding !== null && (
        <AddVendorModal rawName={rawName} typed={adding} actor={actor} onClose={() => setAdding(null)}
          onAdded={(id, name) => {
            const known = knownVendors.find(v => v.id === id) || results.find(v => v.id === id)
            setAdding(null)
            onChange({ id, name: known?.name || name })
            onToast(known ? 'Vendor already exists, selected' : 'Vendor added and selected.')
          }} />
      )}
    </div>
  )
}

// Vendor baru -> fn_cost_agent_add_vendor (nama/alias/NPWP sudah ada -> server mengembalikan id lama).
function AddVendorModal({ rawName, typed, actor, onClose, onAdded }: {
  rawName: string | null; typed: string; actor: string | null; onClose: () => void; onAdded: (id: number, name: string) => void
}) {
  const [name, setName] = useState(rawName || typed)
  const [npwp, setNpwp] = useState('')
  const [aliases, setAliases] = useState<string[]>(rawName ? [rawName] : [])
  const [aliasInput, setAliasInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addAlias = (v: string) => {
    const t = v.trim()
    if (t && !aliases.some(a => a.toLowerCase() === t.toLowerCase())) setAliases(p => [...p, t])
    setAliasInput('')
  }
  const npwpDigits = npwp.replace(/\D/g, '')

  const save = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    if (npwpDigits && npwpDigits.length !== 15) { setError('NPWP must be 15 digits (00.000.000.0-000.000).'); return }
    const allAliases = aliasInput.trim() ? [...aliases, aliasInput.trim()] : aliases
    setBusy(true); setError(null)
    try {
      const id = await costAgentAddVendor({ name: name.trim(), npwp: npwpDigits ? npwp : null, aliases: allAliases, actor })
      onAdded(Number(id), name.trim())
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <CostAgentModal z="z-[80]" maxWidth="max-w-lg" onClose={() => { if (!busy) onClose() }} title="Add vendor"
      subtitle={rawName ? <>As written on invoice: <i>{rawName}</i></> : undefined}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add & select'}</button>
      </>}>
      <div className="p-5 grid grid-cols-1 gap-3">
        <div><FieldLabel required>Name</FieldLabel><input className={SA_INPUT} value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div>
          <FieldLabel hint="optional">NPWP</FieldLabel>
          <input className={SA_INPUT} value={npwp} inputMode="numeric" placeholder="00.000.000.0-000.000" onChange={e => setNpwp(formatNpwp(e.target.value))} />
        </div>
        <div>
          <FieldLabel hint="Enter or comma to add">Aliases</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#EADFD6] bg-white px-2 py-1.5 min-h-9">
            {aliases.map(a => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-[#F5EDF3] text-[#6B3470] text-[11.5px] font-semibold pl-2.5 pr-1 py-0.5">
                {a}<button type="button" aria-label={`Remove ${a}`} onClick={() => setAliases(p => p.filter(x => x !== a))} className="p-0.5 rounded-full hover:bg-white/70"><X size={11} /></button>
              </span>
            ))}
            <input className="flex-1 min-w-[120px] text-[13px] text-[#3B1B3D] focus:outline-none bg-transparent" value={aliasInput} placeholder={aliases.length ? '' : 'Other names on invoices…'}
              onChange={e => { const v = e.target.value; if (v.includes(',')) v.split(',').forEach(addAlias); else setAliasInput(v) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addAlias(aliasInput) }
                else if (e.key === 'Backspace' && !aliasInput && aliases.length) setAliases(p => p.slice(0, -1))
              }}
              onBlur={() => { if (aliasInput.trim()) addAlias(aliasInput) }} />
          </div>
        </div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

// Iframe file invoice. Google Drive /preview: `sandbox` TANPA allow-popups + tombol kita menutupi ikon pop-out Drive di kanan atas ->
// file tidak pernah terbuka di tab baru (permintaan user 2026-10-14). File non-Drive (PDF langsung) TIDAK di-sandbox: viewer PDF
// bawaan Chrome menolak tampil di iframe ber-sandbox.
function FilePreviewFrame({ src, drive, exit = false, onFullScreen }: { src: string; drive: boolean; exit?: boolean; onFullScreen?: () => void }) {
  return (
    <>
      {drive
        ? <iframe title="Invoice file" src={src} className="w-full h-full border-0" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-forms" />
        : <iframe title="Invoice file" src={src} className="w-full h-full border-0" />}
      {drive && (
        <button type="button" onClick={onFullScreen} title={exit ? 'Exit full screen' : 'Full screen'} aria-label={exit ? 'Exit full screen' : 'Full screen'}
          className="absolute top-2 right-2 w-12 h-12 rounded-md inline-flex items-center justify-center bg-[#3B1B3D]/85 hover:bg-[#3B1B3D] text-white">
          {exit ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}
    </>
  )
}

// Keterangan invoice (sql/064): tampil di header (lebar penuh, di bawah Vessel/Port), badge Auto / Edited. TANPA pensil inline (2026-10-20,
// permintaan user): mengubah keterangan lewat "Correct header" (HeaderEditor -> fn_cost_agent_set_invoice_description). "Reset to auto"
// (hanya bila Edited) = RPC dgn '' tetap di sini. Hanya status verification/rejected/failed & canEdit (`editable` = headerEditable modal).
function InvoiceDescription({ inv, editable, actor, onSaved, onToast }: {
  inv: CostAgentInvoiceHistory['invoice']; editable: boolean; actor: string | null; onSaved: () => Promise<void> | void; onToast: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const auto = inv.description_auto !== false
  const resetToAuto = async () => {
    setBusy(true); setError(null)
    try {
      await costAgentSetInvoiceDescription(inv.id, '', actor)
      await onSaved()
      onToast('Description reset to automatic.')
    } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(false) }
  }
  return (
    // 2026-10-20 (permintaan user "cantikkan"): jadi sel strip info (InfoCell) -- label + badge Auto/Edited di atas, isi di bawah.
    <InfoCell label="Description" className="col-span-2 @4xl:col-span-1" data-invoice-description="true"
      extra={<>
        <span className={`px-1.5 py-[1px] rounded text-[10px] font-bold normal-case tracking-normal leading-none ${auto ? 'bg-[#EEF1FA] text-[#2F4FA8]' : 'bg-[#F5EDF3] text-[#6B3470]'}`} data-description-badge>{auto ? 'Auto' : 'Edited'}</span>
        {editable && !auto && (
          <button type="button" disabled={busy} className="ml-auto text-[11px] font-semibold text-[#6B3470] hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
            onClick={resetToAuto}><RotateCcw size={10} /> Reset to auto</button>
        )}
      </>}>
      {inv.description || <span className="text-[#8A7A8B] font-normal">—</span>}
      {error && <div className="text-[11.5px] text-[#A8231A] font-normal">{error}</div>}
    </InfoCell>
  )
}
