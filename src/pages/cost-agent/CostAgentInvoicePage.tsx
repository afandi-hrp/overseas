// Agency Invoices Cost Agent (/cost-agent/invoice/:id?) -- 2026-10-13, Prompt 3. 1 route dgn :id opsional (pola FAR): :id =
// invoice yg dibuka di review modal (buka/tutup = ganti URL tanpa remount halaman; query string daftar IKUT DIPERTAHANKAN).
// `?upload=1&call=<voyage_call_id>` (dari drawer Voyage) membuka upload dgn port call terisi. Tulis HANYA lewat RPC berguard / n8n.
// DAFTAR v2 (Tahap 3a, 2026-10-28, SQL 091): kartu + stepper 4 tahap (Completed | Verified | Approved | Paid), filter & urut berlevel, "My tasks", popover
// "Needs attention". Satu halaman kartu = SATU panggilan fn_cost_agent_invoice_cards (pencarian, filter, urut, halaman, jumlah per status dikerjakan database);
// klien TIDAK menghitung status / stepper / temuan. State daftar ada di query string URL (?q=&co=&st=&my=1&void=1&p=&size=&f=&s=) -> tautan bisa dibagikan, Back bekerja.
// Tetap dari versi lama: Upload (pelacak hasil), Create AP Note / PV (multi-pilih bucket "Waiting for payment"), Reprocess (failed), hapus Admin (masa uji coba),
// polling 5 dtk selama ada invoice processing, muat ulang saat event approval berubah. Detail: docs/claude/cost-agent.md ("Invoice list v2").
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RefreshCw, UploadCloud, X, Wallet, ListChecks, Trash2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import PaginationFooter from '../../components/PaginationFooter'
import CostAgentMyRoles from '../../components/CostAgentMyRoles'
import { CostAgentPageHeader, CostAgentModal, FilterPanel, FilterSearch, FilterField, FilterButton, FilterSegment, FILTER_SELECT, FILTER_SELECT_WIDE } from '../../components/CostAgentUi'
import { SA_BTN_OUTLINE, SA_INPUT } from '../../components/SeaAirAuditUi'
import { CardSkeleton, InvoiceCardV2, InvoiceTableV2 } from '../../components/CostAgentInvoiceCardsV2'
import CostAgentInvoiceFilterPanel from '../../components/CostAgentInvoiceFilterPanel'
import CostAgentUploadModal from '../../components/CostAgentUploadModal'
import { useCostAgentUploadTracker } from '../../components/CostAgentUploadResultDialog'
import CostAgentInvoiceReviewModal from '../../components/CostAgentInvoiceReviewModal'
import CostAgentPaymentModal from '../../components/CostAgentPaymentModal'
import {
  costAgentUpload, fetchCostAgentCompanies, fetchCostAgentVendors, fetchCostAgentVessels, fetchCostAgentPorts, fetchCostAgentCostItems,
  fetchCostAgentInvoiceErrors, INVOICE_STATUS_META, COST_AGENT_APPROVALS_CHANGED_EVENT, canDeleteInvoice, costAgentDeleteInvoice,
  type CostAgentInvoiceStatus, type CostAgentCompany, type CostAgentVendor, type CostAgentVessel, type CostAgentPort, type CostAgentCostItem,
} from '../../utils/CostAgentHelpers'
import {
  DEFAULT_SORT_DIR, PAGE_SIZES, STATUS_OPTIONS, costAgentInvoiceCards, parseListState, toCardParams, writeListState,
  type AttentionItem, type InvoiceCard, type InvoiceCardsResult, type ListState, type SortField,
} from '../../utils/CostAgentInvoiceCards'

const VIEW_KEY = 'beehive_cost_agent_invoice_view'
type View = 'card' | 'list'
const GO_TAB = { docs: 'documents', lines: 'lines', workflow: 'approval' } as const

export default function CostAgentInvoicePage() {
  const { canEdit, user, isAdmin } = useAuth()
  const canEditInvoice = canEdit('cost_agent_invoice')
  // Ponsel (< 640px): placeholder pencarian dipendekkan supaya tidak terpotong.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)'); const h = () => setNarrow(mq.matches)
    mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
  }, [])
  const canPay = canEdit('cost_agent_payment')
  const actor = user?.email ?? null
  const { id: idParam } = useParams()
  const openId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { document.title = 'Agency Invoices · BeeHive' }, [])

  // ── Master (dropdown review, upload & filter) ──
  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  const [vendors, setVendors] = useState<CostAgentVendor[]>([])
  const [vessels, setVessels] = useState<CostAgentVessel[]>([])
  const [ports, setPorts] = useState<CostAgentPort[]>([])
  const [costItems, setCostItems] = useState<CostAgentCostItem[]>([])
  const [masterError, setMasterError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCostAgentCompanies(), fetchCostAgentVendors(), fetchCostAgentVessels(), fetchCostAgentPorts(), fetchCostAgentCostItems()])
      .then(([c, vd, vs, p, ci]) => { if (!cancelled) { setCompanies(c); setVendors(vd); setVessels(vs); setPorts(p); setCostItems(ci) } })
      .catch(e => { if (!cancelled) setMasterError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [])

  // ── Upload dari drawer Voyage: ?upload=1&call=<id> -> buka sekali lalu hapus param ──
  const [upload, setUpload] = useState<{ callId: number | null } | null>(null)
  useEffect(() => {
    if (searchParams.get('upload') !== '1') return
    const call = searchParams.get('call')
    if (canEditInvoice) setUpload({ callId: call && /^\d+$/.test(call) ? Number(call) : null })
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('upload'); n.delete('call'); return n }, { replace: true })
  }, [searchParams, setSearchParams, canEditInvoice])

  // ── State daftar = query string URL ──
  const st = useMemo(() => parseListState(searchParams), [searchParams])
  const update = useCallback((patch: Partial<ListState>, replace = false) => {
    setSearchParams(prev => writeListState(prev, { ...parseListState(prev), page: 1, ...patch }), { replace })
  }, [setSearchParams])
  const resetAll = () => setSearchParams(prev => writeListState(prev, { q: '', co: '', st: 'all', my: false, showVoid: false, page: 1, size: parseListState(prev).size, rules: [], sorts: [] }))

  const [text, setText] = useState(st.q)
  useEffect(() => { setText(st.q) }, [st.q]) // Back / tautan -> kotak cari
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== st.q.trim()) update({ q: text }, true) }, 300)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'card' } catch { return 'card' } })
  const changeView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null)
  const showToast = useCallback((msg: string, tone: 'ok' | 'warn' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 5000) }, [])

  // ── Data ──
  const [data, setData] = useState<InvoiceCardsResult | null>(null)
  const [errors, setErrors] = useState<Record<number, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [payIds, setPayIds] = useState<number[] | null>(null)
  const seqRef = useRef(0)
  const paramsRef = useRef(toCardParams(st))
  paramsRef.current = toCardParams(st)
  const paramsKey = JSON.stringify(paramsRef.current)

  const fetchList = useCallback(async (silent = false) => {
    const seq = ++seqRef.current
    if (!silent) setLoading(true)
    try {
      const r = await costAgentInvoiceCards(paramsRef.current)
      if (seq !== seqRef.current) return
      // Halaman di luar jangkauan (mis. filter menyempit): kembali ke halaman terakhir.
      if (r.items.length === 0 && r.total > 0 && (paramsRef.current.offset ?? 0) > 0) { update({ page: Math.max(1, Math.ceil(r.total / (paramsRef.current.limit ?? 20))) }, true); return }
      setData(r); setListError(null)
      const failedIds = r.items.filter(x => x.bucket === 'failed').map(x => x.id)
      if (failedIds.length) fetchCostAgentInvoiceErrors(failedIds).then(e => { if (seq === seqRef.current) setErrors(e) }).catch(() => { /* teks default */ })
    } catch (e: any) {
      if (seq === seqRef.current && !silent) { const m = e.message || String(e); setListError(m); showToast(m, 'warn') }
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [update, showToast])
  useEffect(() => { setSelected([]); fetchList() }, [paramsKey, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  // Muat ulang senyap: event approval berubah, tab browser aktif lagi, dan polling 5 dtk selama ada invoice processing.
  useEffect(() => {
    const h = () => fetchList(true)
    const vis = () => { if (document.visibilityState === 'visible') fetchList(true) }
    window.addEventListener(COST_AGENT_APPROVALS_CHANGED_EVENT, h)
    document.addEventListener('visibilitychange', vis)
    return () => { window.removeEventListener(COST_AGENT_APPROVALS_CHANGED_EVENT, h); document.removeEventListener('visibilitychange', vis) }
  }, [fetchList])
  const items: InvoiceCard[] = data?.items ?? []
  const needPoll = items.some(r => r.bucket === 'processing')
  useEffect(() => {
    if (!needPoll) return
    const iv = setInterval(() => fetchList(true), 5000)
    return () => clearInterval(iv)
  }, [needPoll, fetchList])

  // ── Aksi lama: reprocess, hapus (Admin, masa uji coba) ──
  const [reprocessing, setReprocessing] = useState<number | null>(null)
  const reprocess = async (id: number) => {
    setReprocessing(id)
    try { await costAgentUpload('cost_agent', [], { reprocess_invoice_id: id }); showToast(`Invoice #${id} sent for reprocessing.`); refresh() }
    catch (e: any) { showToast(e.message || String(e), 'warn') } finally { setReprocessing(null) }
  }
  const canDelete = isAdmin && canEditInvoice
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; invoice_no: string | null; status: string } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteInvoice = (r: { id: number; invoice_no: string | null; status: string }) => { setConfirmDelete(r); setDeleteReason(''); setDeleteError(null) }
  const doDelete = async () => {
    const r = confirmDelete
    if (!r) return
    setDeleting(r.id); setDeleteError(null)
    try {
      await costAgentDeleteInvoice(r.id, deleteReason.trim() || 'Hapus data uji coba')
      setConfirmDelete(null); showToast(`Invoice ${r.invoice_no || '#' + r.id} deleted.`)
      if (openId === r.id) closeInvoice()
      fetchList(true)
    } catch (e: any) { setDeleteError(e.message || String(e)) } finally { setDeleting(null) }
  }

  // ── Buka / tutup detail: query string daftar dipertahankan ──
  const [openAt, setOpenAt] = useState<{ id: number; tab: 'documents' | 'lines' | 'approval'; lines: number[] } | null>(null)
  const openInvoice = useCallback((id: number) => { setOpenAt(null); navigate(`/cost-agent/invoice/${id}${location.search}`) }, [navigate, location.search])
  const openFinding = (c: InvoiceCard, it: AttentionItem) => { setOpenAt({ id: c.id, tab: GO_TAB[it.go] ?? 'lines', lines: it.lines ?? [] }); navigate(`/cost-agent/invoice/${c.id}${location.search}`) }
  const closeInvoice = useCallback(() => { setOpenAt(null); navigate(`/cost-agent/invoice${location.search}`) }, [navigate, location.search])
  const uploadTracker = useCostAgentUploadTracker({ onToast: showToast, onOpenInvoice: openInvoice, onRefresh: () => fetchList(true) })

  // ── Turunan tampilan ──
  const counts = data?.status_counts ?? {}
  const allCount = Object.entries(counts).reduce((a, [k, n]) => a + (k === 'void' && !st.showVoid ? 0 : Number(n || 0)), 0)
  const voidHidden = st.st === 'all' && !st.showVoid ? Number(counts.void ?? 0) : 0
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / st.size))
  const selectable = st.st === 'approved' && canPay
  const sortBy = (f: SortField) => {
    const cur = st.sorts[0] ?? { f: 'date' as SortField, dir: 'desc' as const }
    const dir = cur.f === f ? (cur.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_SORT_DIR[f]
    update({ sorts: [{ f, dir }, ...st.sorts.filter(s => s.f !== f)] })
  }
  const actionsFor = (c: InvoiceCard) => ({
    openId,
    checkbox: selectable ? { checked: selected.includes(c.id), onChange: (v: boolean) => setSelected(p => (v ? [...p, c.id] : p.filter(x => x !== c.id))) } : undefined,
    error: errors[c.id],
    onOpen: () => openInvoice(c.id),
    readOnly: !canEditInvoice,
    onOpenAt: (it: AttentionItem) => openFinding(c, it),
    onReprocess: canEditInvoice ? () => reprocess(c.id) : undefined,
    reprocessing: reprocessing === c.id,
    onDelete: canDelete && canDeleteInvoice(c.status) ? () => deleteInvoice({ id: c.id, invoice_no: c.invoice_no, status: c.status }) : undefined,
    deleting: deleting === c.id,
  })
  const initialLoad = loading && !data

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm z-[9999] min-w-[300px]">
          <span className={toast.tone === 'warn' ? 'text-amber-400' : 'text-emerald-400'}>{toast.tone === 'warn' ? '⚠️' : '✅'}</span>
          <span className="leading-tight max-w-[400px] [overflow-wrap:anywhere]">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
        <CostAgentPageHeader title="Agency Invoices" right={<CostAgentMyRoles />} />

        <main className="px-3 pt-2 pb-0 flex-1 flex flex-col overflow-hidden gap-3 min-h-0">
          {masterError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] shrink-0">Failed to load master data: {masterError}</div>}

          <FilterPanel>
            <FilterSearch value={text} onChange={setText} placeholder={narrow ? 'Search invoices' : 'Search invoice no / vendor / vessel / port / voy…'} />
            <FilterField label="Company">
              <select aria-label="Company" className={FILTER_SELECT} value={st.co} onChange={e => update({ co: e.target.value })}>
                <option value="">All PT</option>
                {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select aria-label="Status" className={FILTER_SELECT_WIDE} value={st.st} onChange={e => update({ st: e.target.value })}>
                <option value="all">All ({allCount})</option>
                {STATUS_OPTIONS.filter(o => Number(counts[o.value as keyof typeof counts] ?? 0) > 0 || o.value === st.st).map(o => (
                  <option key={o.value} value={o.value}>{o.label} ({Number(counts[o.value as keyof typeof counts] ?? 0)})</option>
                ))}
              </select>
            </FilterField>
            {voidHidden > 0 && (
              <button type="button" className="text-[11.5px] font-semibold text-[#6E5E70] hover:text-[#6B3470] hover:underline shrink-0 whitespace-nowrap" onClick={() => update({ st: 'void' })} data-void-hidden>{voidHidden} void hidden</button>
            )}
            <FilterButton icon={ListChecks} label="My tasks" short="Mine" active={st.my} title="Invoices waiting for you" onClick={() => update({ my: !st.my })}>
              {(data?.my_count ?? 0) > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#5B2E8C] text-white text-[10.5px] flex items-center justify-center tabular-nums" data-my-count>{data!.my_count}</span>}
            </FilterButton>
            <CostAgentInvoiceFilterPanel rules={st.rules} sorts={st.sorts} showVoid={st.showVoid} vendors={vendors} vessels={vessels} ports={ports}
              onApply={(rules, sorts, showVoid) => update({ rules, sorts, showVoid })}
              onReset={() => update({ rules: [], sorts: [], showVoid: false })} />
            {needPoll && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2F4FA8] shrink-0" title="AI is processing — the list refreshes automatically"><Loader2 size={13} className="animate-spin" /><span className="hidden @min-[1650px]:inline">AI processing</span></span>}
            <FilterSegment value={view} onChange={changeView} options={[{ value: 'card', label: 'Card' }, { value: 'list', label: 'List' }]} />
            <FilterButton icon={RefreshCw} label="Refresh" labelFrom={1650} onClick={refresh} disabled={loading} spin={loading} />
            {selectable && (
              <FilterButton icon={Wallet} label={`Create AP Note / PV${selected.length ? ` (${selected.length})` : ''}`} short={`AP/PV${selected.length ? ` (${selected.length})` : ''}`}
                variant="primary" disabled={!selected.length} title="Select invoices first" onClick={() => setPayIds(selected)} />
            )}
            {canEditInvoice && <FilterButton icon={UploadCloud} label="Upload invoice" short="Upload" variant="primary" onClick={() => setUpload({ callId: null })} />}
          </FilterPanel>

          <div className="rounded-[14px] border border-[#EADFD6] bg-[#FBF7F4] flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className={`flex-1 min-h-0 overflow-auto ${view === 'card' ? 'p-2.5 flex flex-col gap-2.5' : ''}`}>
              {initialLoad || (loading && view === 'card') ? <CardSkeleton n={Math.min(6, st.size)} />
                : listError && !data ? (
                  <div className="m-3 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-center gap-3" role="alert">
                    <AlertTriangle size={14} className="shrink-0" /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{listError}</span>
                    <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2.5`} onClick={refresh}><RotateCcw size={12} /> Retry</button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-2 py-12 text-center text-sm text-[#6E5E70]">
                    <p className="italic">No invoices match these filters</p>
                    <button type="button" className={`${SA_BTN_OUTLINE} mt-3`} onClick={resetAll}>Reset</button>
                  </div>
                ) : view === 'card' ? (
                  <>
                    {selectable && (
                      <label className="flex items-center gap-2 px-1 text-[12px] font-semibold text-[#3B1B3D] shrink-0">
                        <input type="checkbox" aria-label="Select all" className="w-4 h-4 accent-[#6B3470]" checked={items.length > 0 && selected.length === items.length}
                          onChange={e => setSelected(e.target.checked ? items.map(r => r.id) : [])} />
                        Select all on this page{selected.length ? ` · ${selected.length} selected` : ''}
                      </label>
                    )}
                    {items.map(c => <React.Fragment key={c.id}><InvoiceCardV2 c={c} a={actionsFor(c)} /></React.Fragment>)}
                  </>
                ) : (
                  <div className={loading ? 'opacity-60' : ''}>
                    <InvoiceTableV2 rows={items} sorts={st.sorts} onSort={sortBy} makeActions={actionsFor} selectable={selectable}
                      allChecked={items.length > 0 && selected.length === items.length} onCheckAll={v => setSelected(v ? items.map(r => r.id) : [])} />
                  </div>
                )}
            </div>
            <PaginationFooter start={(st.page - 1) * st.size + 1} end={Math.min(st.page * st.size, total)} total={total} unit="invoices"
              page={st.page} totalPages={totalPages} onPage={p => update({ page: p })} pageSize={st.size} pageSizeOptions={PAGE_SIZES} onPageSize={n => update({ size: n })} />
          </div>
        </main>
      </div>

      {upload && (
        <CostAgentUploadModal presetCallId={upload.callId}
          onClose={() => setUpload(null)}
          onSent={() => { update({ st: 'all' }); refresh() }}
          onJob={job => { uploadTracker.track(job); update({ st: 'all' }); refresh() }} />
      )}
      {uploadTracker.dialog}
      {openId !== null && (
        // key per invoice -- state modal bersih saat pindah invoice (mis. link "Duplicate of #id").
        <React.Fragment key={openId}><CostAgentInvoiceReviewModal invoiceId={openId} companies={companies} vendors={vendors} vessels={vessels} ports={ports}
          costItems={costItems} canEdit={canEditInvoice} canPay={canPay} actor={actor} onClose={closeInvoice} onChanged={() => fetchList(true)}
          onToast={showToast}
          initialTab={openAt?.id === openId ? openAt.tab : undefined} focusLines={openAt?.id === openId ? openAt.lines : undefined} /></React.Fragment>
      )}
      {confirmDelete && (
        <CostAgentModal z="z-[85]" maxWidth="max-w-md" onClose={() => { if (deleting === null) setConfirmDelete(null) }}
          title="Delete invoice?" subtitle={<>{confirmDelete.invoice_no || `#${confirmDelete.id}`} · {INVOICE_STATUS_META[confirmDelete.status as CostAgentInvoiceStatus]?.label || confirmDelete.status}</>}
          footer={<>
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setConfirmDelete(null)} disabled={deleting !== null}>Cancel</button>
            <button type="button" onClick={doDelete} disabled={deleting !== null}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#A8231A] hover:bg-[#8C1D15] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {deleting !== null ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} {deleting !== null ? 'Deleting…' : 'Delete invoice'}
            </button>
          </>}>
          <div className="p-5 space-y-3 text-[12.5px] text-[#3B1B3D]">
            <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[#A8231A] flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Its cost lines, documents, approvals and the cost history from this invoice are deleted too. Files in Google Drive are kept. <b>This cannot be undone.</b></span>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">Reason <span className="normal-case tracking-normal font-normal text-[#6E5E70]">optional</span></label>
              <input className={SA_INPUT} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="e.g. trial data" disabled={deleting !== null} />
            </div>
            {deleteError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[#A8231A]">{deleteError}</div>}
          </div>
        </CostAgentModal>
      )}
      {payIds && (
        <CostAgentPaymentModal invoiceIds={payIds} actor={actor} onClose={() => { setPayIds(null); setSelected([]) }} onDone={() => fetchList(true)} />
      )}
    </>
  )
}

