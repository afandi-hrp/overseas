// Agency Invoices Cost Agent (/cost-agent/invoice/:id?) -- 2026-10-13, Prompt 3. 1 route dgn :id opsional (pola FAR): :id =
// invoice yg dibuka di review modal (buka/tutup = ganti URL tanpa remount halaman). `?upload=1&call=<voyage_call_id>` (dari
// drawer Voyage) membuka upload dgn port call terisi. Daftar = cost_agent_invoice_list_v (pagination server-side), tab status
// + jumlah, polling 5 dtk HANYA selama ada baris processing / dokumen processing (pola Bunker). Failed -> error + Reprocess
// (proxy cost_agent tanpa file, cost_agent_meta {reprocess_invoice_id}). Tulis HANYA lewat RPC berguard / n8n.
// Prompt 4: tab "My Approvals" (invoice waiting_approval yg step aktifnya memuat email user). Prompt 5: tab Approved bisa
// multi-select -> "Create AP Note / PV" (antrean, 1 request per invoice) bila canEdit('cost_agent_payment').
// 2026-10-14 (keputusan user): tampilan Card = DEFAULT (List tetap ada, toggle Card | List); klik kartu tetap membuka modal review
// besar (viewer file + tabel baris terlalu lebar utk panel samping). Kartu = data & aksi SAMA baris List (checkbox Approved, hapus
// Admin, Reprocess, chip flags).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RefreshCw, UploadCloud, X, RotateCcw, FileText, Loader2, Wallet, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import PaginationFooter from '../../components/PaginationFooter'
import { LoadingTableRow } from '../../components/LoadingState'
import { CostAgentPageHeader, CostAgentModal, StatusChip, FilterPanel, FilterSearch, FilterField, FilterButton, FilterSegment, FILTER_SELECT, FILTER_SELECT_WIDE } from '../../components/CostAgentUi'
import { CostAgentCardScroller, CostAgentInvoiceCard } from '../../components/CostAgentCards'
import { Chip, SA_BTN_OUTLINE, SA_CARD, SA_INPUT } from '../../components/SeaAirAuditUi'
import CostAgentUploadModal from '../../components/CostAgentUploadModal'
import CostAgentInvoiceReviewModal from '../../components/CostAgentInvoiceReviewModal'
import CostAgentPaymentModal from '../../components/CostAgentPaymentModal'
import {
  fetchCostAgentInvoiceList, fetchCostAgentInvoiceStatusCounts, fetchCostAgentInvoiceErrors, costAgentUpload,
  fetchCostAgentCompanies, fetchCostAgentVendors, fetchCostAgentVessels, fetchCostAgentPorts, fetchCostAgentCostItems,
  fmtDate, fmtMoney, INVOICE_STATUS_ORDER, INVOICE_STATUS_META, TAX_STATUS_META, fetchMyApprovalInvoiceIds,
  COST_AGENT_APPROVALS_CHANGED_EVENT, canDeleteInvoice, costAgentDeleteInvoice,
  type CostAgentInvoiceListRow, type CostAgentInvoiceStatus, type CostAgentCompany, type CostAgentVendor,
  type CostAgentVessel, type CostAgentPort, type CostAgentCostItem,
} from '../../utils/CostAgentHelpers'

const TH = 'px-2.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-2.5 py-2 text-[12.5px] text-[#3B1B3D] align-top'
const COLS = 11

export default function CostAgentInvoicePage() {
  const { canEdit, user, isAdmin } = useAuth()
  const canEditInvoice = canEdit('cost_agent_invoice')
  const canPay = canEdit('cost_agent_payment')
  const actor = user?.email ?? null
  const { id: idParam } = useParams()
  const openId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => { document.title = 'Agency Invoices · BeeHive' }, [])

  // ── Master (dropdown review & upload) ──
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

  // ── Filter ──
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t) }, [search])
  const [company, setCompany] = useState('')
  const [statusTab, setStatusTab] = useState<'all' | 'mine' | CostAgentInvoiceStatus>('all')
  const [view, setView] = useState<'card' | 'list'>('card')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [debounced, company, statusTab, pageSize])

  // ── Data ──
  const [rows, setRows] = useState<CostAgentInvoiceListRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<number, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [myIds, setMyIds] = useState<number[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [payIds, setPayIds] = useState<number[] | null>(null)
  useEffect(() => { setSelected([]) }, [statusTab, page, pageSize, debounced, company])
  const seqRef = useRef(0)
  const fetchList = useCallback(async (silent = false) => {
    const seq = ++seqRef.current
    if (!silent) setLoading(true)
    try {
      // My Approvals: id invoice yg step aktifnya memuat email user (dihitung tiap refresh).
      const mine = await fetchMyApprovalInvoiceIds(actor).catch(() => [] as number[])
      const [r, c] = await Promise.all([
        statusTab === 'mine' && mine.length === 0
          ? Promise.resolve({ rows: [] as CostAgentInvoiceListRow[], count: 0 })
          : fetchCostAgentInvoiceList({
            page, pageSize, search: debounced,
            eq: { company_code: company, status: statusTab === 'all' || statusTab === 'mine' ? null : statusTab, id: statusTab === 'mine' ? mine : null },
            orderBy: 'created_at', ascending: false,
          }),
        fetchCostAgentInvoiceStatusCounts({ company, search: debounced }),
      ])
      if (seq !== seqRef.current) return
      setMyIds(mine)
      setRows(r.rows); setTotal(r.count); setCounts(c); setListError(null)
      const failedIds = r.rows.filter(x => x.status === 'failed').map(x => x.id)
      setErrors(failedIds.length ? await fetchCostAgentInvoiceErrors(failedIds) : {})
    } catch (e: any) {
      if (seq === seqRef.current && !silent) { setRows([]); setTotal(0); setListError(e.message || String(e)) }
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [page, pageSize, debounced, company, statusTab, actor])
  useEffect(() => { fetchList() }, [fetchList, reloadKey])
  // Keputusan / submit approval di modal -> segarkan (tab My Approvals & badge).
  useEffect(() => {
    const h = () => fetchList(true)
    window.addEventListener(COST_AGENT_APPROVALS_CHANGED_EVENT, h)
    return () => window.removeEventListener(COST_AGENT_APPROVALS_CHANGED_EVENT, h)
  }, [fetchList])
  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  // Polling 5 dtk HANYA selama ada invoice processing / dokumen processing (berhenti otomatis).
  const needPoll = rows.some(r => r.status === 'processing' || (r.documents_processing ?? 0) > 0)
  useEffect(() => {
    if (!needPoll) return
    const iv = setInterval(() => fetchList(true), 5000)
    return () => clearInterval(iv)
  }, [needPoll, fetchList])

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null)
  const showToast = (msg: string, tone: 'ok' | 'warn' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 5000) }

  const [reprocessing, setReprocessing] = useState<number | null>(null)
  // Hapus invoice (masa uji coba, sql/056): Admin saja, status journal/paid tidak bisa. Anak invoice ikut terhapus.
  const canDelete = isAdmin && canEditInvoice
  const [deleting, setDeleting] = useState<number | null>(null)
  // Konfirmasi lewat modal (bukan window.confirm); error RPC tampil di dalam modal.
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
      setConfirmDelete(null)
      showToast(`Invoice ${r.invoice_no || '#' + r.id} deleted.`)
      if (openId === r.id) closeInvoice()
      fetchList(true)
    } catch (e: any) {
      setDeleteError(e.message || String(e))
    } finally {
      setDeleting(null)
    }
  }

  const reprocess = async (id: number) => {
    setReprocessing(id)
    try {
      await costAgentUpload('cost_agent', [], { reprocess_invoice_id: id })
      showToast(`Invoice #${id} sent for reprocessing.`)
      refresh()
    } catch (e: any) {
      showToast(e.message || String(e), 'warn')
    } finally {
      setReprocessing(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const selectable = statusTab === 'approved' && canPay
  const cols = COLS + (selectable ? 1 : 0)
  const allCount = useMemo(() => Object.values(counts).reduce<number>((a, b) => a + Number(b || 0), 0), [counts])
  const openInvoice = (id: number) => navigate(`/cost-agent/invoice/${id}`)
  const closeInvoice = useCallback(() => navigate('/cost-agent/invoice'), [navigate])

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm z-[9999] min-w-[300px]">
          <span className={toast.tone === 'warn' ? 'text-amber-400' : 'text-emerald-400'}>{toast.tone === 'warn' ? '⚠️' : '✅'}</span>
          <span className="leading-tight max-w-[400px]">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-white"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
        <CostAgentPageHeader title="Agency Invoices" subtitle="Agency invoices read by AI — verify against cost history, approve and pay." />

        <main className="px-3 pt-2 pb-0 flex-1 flex flex-col overflow-hidden gap-3 min-h-0">
          {masterError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] shrink-0">Failed to load master data: {masterError}</div>}

          {/* Filter 1 baris di laptop 14" (FilterPanel). Status = select ber-jumlah (10 tab tidak muat 1 baris), My Approvals =
              toggle; aksi halaman (Create AP/PV, Upload) di ujung kanan panel. */}
          <FilterPanel>
            <FilterSearch value={search} onChange={setSearch} placeholder="Search invoice no / vendor / vessel / port / voy…" />
            <FilterField label="Status">
              <select aria-label="Status" className={FILTER_SELECT_WIDE} value={statusTab} onChange={e => setStatusTab(e.target.value as any)}>
                <option value="all">All ({allCount})</option>
                <option value="mine">My Approvals ({myIds?.length ?? 0})</option>
                {INVOICE_STATUS_ORDER.map(st => <option key={st} value={st}>{INVOICE_STATUS_META[st].label} ({counts[st] ?? 0})</option>)}
              </select>
            </FilterField>
            <FilterField label="Company">
              <select aria-label="Company" className={FILTER_SELECT} value={company} onChange={e => setCompany(e.target.value)}>
                <option value="">All PT</option>
                {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </FilterField>
            <FilterButton icon={ShieldCheck} label="My Approvals" short="Mine" active={statusTab === 'mine'}
              title="Invoices waiting for your approval" onClick={() => setStatusTab(t => (t === 'mine' ? 'all' : 'mine'))}>
              {(myIds?.length ?? 0) > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#5B2E8C] text-white text-[10.5px] flex items-center justify-center">{myIds!.length}</span>}
            </FilterButton>
            {needPoll && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2F4FA8] shrink-0" title="AI is processing — the list refreshes automatically"><Loader2 size={13} className="animate-spin" /><span className="hidden @min-[1650px]:inline">AI processing</span></span>}
            <FilterSegment value={view} onChange={setView} options={[{ value: 'card', label: 'Card' }, { value: 'list', label: 'List' }]} />
            <FilterButton icon={RefreshCw} label="Refresh" labelFrom={1650} onClick={refresh} disabled={loading} spin={loading} />
            {statusTab === 'approved' && canPay && (
              <FilterButton icon={Wallet} label={`Create AP Note / PV${selected.length ? ` (${selected.length})` : ''}`} short={`AP/PV${selected.length ? ` (${selected.length})` : ''}`}
                variant="primary" disabled={!selected.length} title="Select approved invoices first" onClick={() => setPayIds(selected)} />
            )}
            {canEditInvoice && <FilterButton icon={UploadCloud} label="Upload invoice" short="Upload" variant="primary" onClick={() => setUpload({ callId: null })} />}
          </FilterPanel>

          {view === 'card' ? (
            <div className="rounded-[14px] border border-[#EADFD6] bg-[#FBF7F4] flex-1 min-h-0 flex flex-col overflow-hidden">
              <CostAgentCardScroller loading={loading} error={listError} count={rows.length}
                empty={statusTab === 'mine' ? 'Nothing waiting for your approval.' : `No invoices.${canEditInvoice ? ' Click "Upload invoice" to add one.' : ''}`}
                header={selectable && rows.length > 0 && !loading ? (
                  <label className="flex items-center gap-2 px-1 text-[12px] font-semibold text-[#3B1B3D] shrink-0">
                    <input type="checkbox" aria-label="Select all" className="w-4 h-4 accent-[#6B3470]" checked={rows.length > 0 && selected.length === rows.length}
                      onChange={e => setSelected(e.target.checked ? rows.map(r => r.id) : [])} />
                    Select all on this page{selected.length ? ` · ${selected.length} selected` : ''}
                  </label>
                ) : undefined}>
                {rows.map(r => (
                  <CostAgentInvoiceCard key={r.id} r={r} selected={r.id === openId} onOpen={() => openInvoice(r.id)}
                    checkbox={selectable ? { checked: selected.includes(r.id), onChange: v => setSelected(p => (v ? [...p, r.id] : p.filter(x => x !== r.id))) } : undefined}
                    error={errors[r.id]} onReprocess={canEditInvoice ? () => reprocess(r.id) : undefined} reprocessing={reprocessing === r.id}
                    onDelete={canDelete && canDeleteInvoice(r.status) ? () => deleteInvoice(r) : undefined} deleting={deleting === r.id} />
                ))}
              </CostAgentCardScroller>
              <PaginationFooter start={(page - 1) * pageSize + 1} end={Math.min(page * pageSize, total)} total={total} unit="invoices"
                page={page} totalPages={totalPages} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
            </div>
          ) : (
          <div className={`${SA_CARD} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="min-w-full">
                <thead className="sticky top-0 z-20">
                  <tr>
                    {selectable && (
                      <th className={`${TH} w-8`}>
                        <input type="checkbox" aria-label="Select all" className="accent-[#6B3470]" checked={rows.length > 0 && selected.length === rows.length}
                          onChange={e => setSelected(e.target.checked ? rows.map(r => r.id) : [])} />
                      </th>
                    )}
                    {['Date', 'Vendor', 'Invoice No', 'Vessel', 'Port', 'Voyage', 'Total', 'Flags', 'PO', 'Docs', 'Status'].map(h => (
                      <th key={h} className={`${TH} ${h === 'Total' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <LoadingTableRow colSpan={cols} /> : listError ? (
                    <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-[#A8231A]">{listError}</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm text-[#6E5E70] italic">{statusTab === 'mine' ? 'Nothing waiting for your approval.' : `No invoices.${canEditInvoice ? ' Click "Upload invoice" to add one.' : ''}`}</td></tr>
                  ) : rows.map(r => {
                    const tax = r.tax_status ? TAX_STATUS_META[r.tax_status] : null
                    return (
                      <tr key={r.id} onClick={() => openInvoice(r.id)} className={`border-b border-[#F3EEEA] cursor-pointer hover:bg-[#FBF7F4] ${r.id === openId ? 'bg-[#F5EDF3]' : ''}`}>
                        {selectable && (
                          <td className={TD} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select invoice ${r.invoice_no || r.id}`} className="accent-[#6B3470]" checked={selected.includes(r.id)}
                              onChange={e => setSelected(p => (e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id)))} />
                          </td>
                        )}
                        <td className={`${TD} whitespace-nowrap`}>{fmtDate(r.invoice_date)}</td>
                        <td className={`${TD} font-semibold min-w-[160px]`}>{r.vendor_name || <span className="text-[#8A7A8B] font-normal">—</span>}</td>
                        <td className={`${TD} whitespace-nowrap max-w-[260px]`}>
                          {r.invoice_no || <span className="text-[#8A7A8B]">#{r.id}</span>}
                          {r.description && <div className="text-[11px] text-[#8A7A8B] truncate" title={r.description} data-invoice-desc>{r.description}</div>}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>{r.vessel_name || '—'}</td>
                        <td className={`${TD} whitespace-nowrap`} title={r.port_name || undefined}>{r.port_code || '—'}</td>
                        <td className={`${TD} whitespace-nowrap`}>{r.voyage_no ? `Voy ${r.voyage_no}` : '—'}</td>
                        <td className={`${TD} text-right whitespace-nowrap tabular-nums font-semibold`}>{fmtMoney(r.grand_total, r.currency)}</td>
                        <td className={TD}>
                          <div className="flex flex-wrap gap-1">
                            {r.naik_count > 0 && <Chip tone="red">▲ {r.naik_count} higher</Chip>}
                            {r.baru_count > 0 && <Chip tone="amber">{r.baru_count} new item{r.baru_count > 1 ? 's' : ''}</Chip>}
                            {r.duplicate_of && <Chip tone="red">Duplicate of #{r.duplicate_of}</Chip>}
                            <Chip tone={tax?.tone || 'grey'}>Tax: {tax ? tax.label.toLowerCase() : '—'}</Chip>
                            {r.status === 'verification' && r.unverified_count > 0 && <Chip tone="grey">{r.unverified_count} to verify</Chip>}
                          </div>
                          {r.status === 'failed' && (
                            <div className="mt-1.5 flex items-start gap-2">
                              <span className="text-[11.5px] text-[#A8231A] max-w-[280px]">{errors[r.id] || 'AI processing failed.'}</span>
                              {canEditInvoice && (
                                <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} disabled={reprocessing === r.id}
                                  onClick={e => { e.stopPropagation(); reprocess(r.id) }}><RotateCcw size={12} /> {reprocessing === r.id ? 'Sending…' : 'Reprocess'}</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={TD}>
                          {r.po_numbers?.length ? <div className="flex flex-wrap gap-1">{r.po_numbers.slice(0, 3).map(p => <Chip key={p} tone="plum">{p}</Chip>)}{r.po_numbers.length > 3 && <Chip tone="grey">+{r.po_numbers.length - 3}</Chip>}</div> : <span className="text-[#8A7A8B]">—</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {(r.documents_processing ?? 0) > 0 ? <span className="inline-flex items-center gap-1 text-[#2F4FA8]" title="Documents being processed"><Loader2 size={13} className="animate-spin" /> {r.document_count ?? ''}</span>
                            : r.document_count != null ? <span className="inline-flex items-center gap-1 text-[#6E5E70]"><FileText size={13} /> {r.document_count}</span> : <span className="text-[#8A7A8B]">—</span>}
                        </td>
                        <td className={TD}>
                          <div className="flex items-center gap-1.5">
                            <StatusChip status={r.status} />
                            {canDelete && canDeleteInvoice(r.status) && (
                              <button type="button" aria-label={`Delete invoice ${r.invoice_no || r.id}`} title="Delete (Admin, trial data)" disabled={deleting === r.id}
                                onClick={e => { e.stopPropagation(); deleteInvoice(r) }}
                                className="ml-auto p-1.5 rounded-lg text-[#8A7A8B] hover:text-[#A8231A] hover:bg-[#FDE7E4] disabled:opacity-50">
                                {deleting === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <PaginationFooter start={(page - 1) * pageSize + 1} end={Math.min(page * pageSize, total)} total={total} unit="invoices"
              page={page} totalPages={totalPages} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          </div>
          )}
        </main>
      </div>

      {upload && (
        <CostAgentUploadModal companies={companies} defaultCompany={company} presetCallId={upload.callId}
          onClose={() => setUpload(null)}
          onSent={ids => { showToast(`${ids.length || 'The'} invoice${ids.length === 1 ? '' : 's'} sent to AI — shown as Processing.`); setStatusTab('all'); refresh() }} />
      )}
      {openId !== null && (
        // key per invoice -- state modal bersih saat pindah invoice (mis. link "Duplicate of #id").
        <React.Fragment key={openId}><CostAgentInvoiceReviewModal invoiceId={openId} companies={companies} vendors={vendors} vessels={vessels} ports={ports}
          costItems={costItems} canEdit={canEditInvoice} canPay={canPay} actor={actor} onClose={closeInvoice} onChanged={() => fetchList(true)}
          onToast={showToast} onDelete={canDelete ? deleteInvoice : undefined} /></React.Fragment>
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
