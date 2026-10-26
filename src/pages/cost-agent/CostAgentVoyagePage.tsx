// Voyages Cost Agent (/cost-agent/voyage) -- 2026-10-13, Prompt 2. Format "VOYAGE REPORT" bulanan per kapal.
// List (cost_agent_voyage_list_v, pagination server-side, pola BunkerPage) | Monthly Report (1 kapal + 1 bulan, layout
// laporan + Export Excel). Klik baris -> drawer detail. Tulis HANYA lewat RPC berguard (form / import) atau n8n (pull / AI).
// Edit = canEdit('cost_agent_voyage'); upload invoice per port call = canEdit('cost_agent_invoice'). Detail: docs/claude/cost-agent.md.
// 2026-10-14 (keputusan user): tampilan Card = DEFAULT (List tetap ada), klik kartu -> panel detail SAMPING (drawer `embedded`, pola
// panel Invoice Recap Courier: daftar 35% kiri, panel kanan; klik kartu lain = ganti isi). List / Monthly Report tetap drawer overlay.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Plus, FileSpreadsheet, CloudDownload, Sparkles, X, FileUp, Tags } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import PaginationFooter from '../../components/PaginationFooter'
import { LoadingTableRow } from '../../components/LoadingState'
import { CostAgentPageHeader, RouteBadges, FilterPanel, FilterSearch, FilterField, FilterSegment, FilterButton, FilterMenu, FILTER_SELECT, FILTER_SELECT_SM, FILTER_SELECT_VESSEL } from '../../components/CostAgentUi'
import { Chip, SA_CARD } from '../../components/SeaAirAuditUi'
import { CostAgentCardScroller, CostAgentVoyageCard } from '../../components/CostAgentCards'
import CostAgentVoyageForm from '../../components/CostAgentVoyageForm'
import CostAgentVoyageDrawer from '../../components/CostAgentVoyageDrawer'
import CostAgentUploadModal from '../../components/CostAgentUploadModal'
import CostAgentVoyageImportModal from '../../components/CostAgentVoyageImportModal'
import CostAgentNoonUploadModal from '../../components/CostAgentNoonUploadModal'
import CostAgentNoonLabelsModal from '../../components/CostAgentNoonLabelsModal'
import CostAgentVoyageMonthlyReport from '../../components/CostAgentVoyageMonthlyReport'
import { CostAgentVoyagePullModal, CostAgentVoyageAiModal } from '../../components/CostAgentVoyageSourceModals'
import {
  fetchCostAgentVoyageList, fetchCostAgentCompanies, fetchCostAgentVessels, fetchCostAgentPorts,
  fmtDateTimePort, fmtDateTimeCompact, tzAbbrev, fmtNumber, fmtReportMonth, currentMonth, routePorts, VOYAGE_STATUS_META, VOYAGE_SOURCE_LABEL,
  type CostAgentCompany, type CostAgentPort, type CostAgentVessel, type CostAgentVoyageListRow,
  type CostAgentVoyageStatus, type CostAgentVoyageSource,
} from '../../utils/CostAgentHelpers'

const TH = 'px-2.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-2.5 py-2 text-[12.5px] text-[#3B1B3D] align-top'
const COLS = 11

export default function CostAgentVoyagePage() {
  const { canEdit, user } = useAuth()
  const canEditVoyage = canEdit('cost_agent_voyage')
  const canUploadInvoice = canEdit('cost_agent_invoice')
  const actor = user?.email ?? null

  useEffect(() => { document.title = 'Voyages · BeeHive' }, [])

  // ── Master ──
  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  const [vessels, setVessels] = useState<CostAgentVessel[]>([])
  const [ports, setPorts] = useState<CostAgentPort[]>([])
  const [masterError, setMasterError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCostAgentCompanies(), fetchCostAgentVessels(), fetchCostAgentPorts()])
      .then(([c, v, p]) => { if (!cancelled) { setCompanies(c); setVessels(v); setPorts(p) } })
      .catch(e => { if (!cancelled) setMasterError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [])
  const tzByCode = useMemo(() => new Map(ports.map(p => [p.code, p.tz])), [ports])

  // ── Filter ──
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t) }, [search])
  const [company, setCompany] = useState('')
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [month, setMonth] = useState(currentMonth())
  const [status, setStatus] = useState<'' | CostAgentVoyageStatus>('')
  const [source, setSource] = useState<'' | CostAgentVoyageSource>('')
  // Input (2026-10-22): '' = semua | noon_report = dari Noon Report Excel | documents = dokumen SOF/Time Sheet & manual (input_source NULL).
  const [inputSrc, setInputSrc] = useState<'' | 'noon_report' | 'documents'>('')
  const [view, setView] = useState<'card' | 'list' | 'monthly'>('card')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [debounced, company, vesselId, month, status, source, inputSrc, pageSize])
  const vesselOptions = useMemo(() => vessels.filter(v => !company || v.company_code === company), [vessels, company])

  // ── Data ──
  const [rows, setRows] = useState<CostAgentVoyageListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const seqRef = useRef(0)
  const fetchList = useCallback(async () => {
    const seq = ++seqRef.current
    setLoading(true)
    try {
      const r = await fetchCostAgentVoyageList({
        page, pageSize, search: debounced,
        eq: { company_code: company, vessel_id: vesselId, report_month: month ? `${month}-01` : null, status, source, input_source: inputSrc === 'noon_report' ? 'noon_report' : null },
        isNull: inputSrc === 'documents' ? ['input_source'] : undefined,
        orderBy: 'report_month', ascending: false,
      })
      if (seq !== seqRef.current) return
      setRows(r.rows); setTotal(r.count); setListError(null)
    } catch (e: any) {
      if (seq === seqRef.current) { setRows([]); setTotal(0); setListError(e.message || String(e)) }
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [page, pageSize, debounced, company, vesselId, month, status, source, inputSrc])
  useEffect(() => { if (view !== 'monthly') fetchList() }, [fetchList, view, reloadKey])
  const refresh = () => setReloadKey(k => k + 1)

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null)
  const showToast = (msg: string, tone: 'ok' | 'warn' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 5000) }

  // ── Modal / drawer ──
  const [drawerId, setDrawerId] = useState<number | null>(null)
  // Ganti tampilan menutup panel/drawer (panel samping hanya milik tampilan Card).
  const changeView = (v: 'card' | 'list' | 'monthly') => { setView(v); setDrawerId(null) }
  const [form, setForm] = useState<{ id: number | null } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showPull, setShowPull] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showNoon, setShowNoon] = useState(false)
  const [showNoonLabels, setShowNoonLabels] = useState(false) // label hasil belajar AI Noon Report (sql/078)
  // Upload invoice per port call LANGSUNG dari halaman ini (2026-10-14) -- form & proxy n8n SAMA halaman Agency Invoices.
  const [upload, setUpload] = useState<{ callId: number; company: string } | null>(null)
  // Hapus voyage dari drawer (sql/073): tutup panel, toast, muat ulang daftar.
  const onVoyageDeleted = (msg: string) => { setDrawerId(null); showToast(msg); refresh() }
  const openUpload = (callId: number, companyCode: string | null) => setUpload({ callId, company: companyCode || company || '' })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize + 1
  const selectedVessel = vesselId ? vessels.find(v => v.id === vesselId) : null

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
        <CostAgentPageHeader title="Voyages" />

        <main className="px-3 pt-2 pb-0 flex-1 flex flex-col overflow-hidden gap-3 min-h-0">
          {masterError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] shrink-0">Failed to load master data: {masterError}</div>}

          {/* Filter 1 baris di laptop 14" & monitor 24" (FilterPanel); aksi halaman di ujung kanan panel. Panel paling padat ->
              label field mulai 1750px, label tombol sekunder mulai 2000px (diuji 1150–2100px). */}
          <FilterPanel>
            <FilterSearch value={search} onChange={setSearch} placeholder="Search vessel / voy / port…" />
            <FilterField label="Company" labelFrom={1750}>
              <select aria-label="Company" className={FILTER_SELECT} value={company} onChange={e => { setCompany(e.target.value); setVesselId(null) }}>
                <option value="">All PT</option>
                {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </FilterField>
            <FilterField label="Vessel" labelFrom={1750}>
              <select aria-label="Vessel" className={FILTER_SELECT_VESSEL} value={vesselId ?? ''} onChange={e => setVesselId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All vessels</option>
                {vesselOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Month" labelFrom={1750}>
              <input aria-label="Report month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-[118px] text-[12px] font-bold bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
              {month && <button type="button" title="All months" aria-label="Clear month" onClick={() => setMonth('')} className="text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>}
            </FilterField>
            <FilterField label="Status" labelFrom={1750}>
              <select aria-label="Status" className={FILTER_SELECT_SM} value={status} onChange={e => setStatus(e.target.value as any)}>
                <option value="">All status</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="closed">Closed</option>
              </select>
            </FilterField>
            <FilterField label="Source" labelFrom={2000}>
              <select aria-label="Source" className={FILTER_SELECT_SM} value={source} onChange={e => setSource(e.target.value as any)}>
                <option value="">All source</option>
                {(Object.keys(VOYAGE_SOURCE_LABEL) as CostAgentVoyageSource[]).map(s => <option key={s} value={s}>{VOYAGE_SOURCE_LABEL[s]}</option>)}
              </select>
            </FilterField>
            <FilterField label="Input" labelFrom={2000}>
              <select aria-label="Input source" title="Input source" className={FILTER_SELECT_SM} value={inputSrc} onChange={e => setInputSrc(e.target.value as any)}>
                <option value="">All input</option>
                <option value="noon_report">Noon Report</option>
                <option value="documents">Docs &amp; manual</option>
              </select>
            </FilterField>
            <FilterSegment value={view} onChange={changeView} options={[{ value: 'card', label: 'Card' }, { value: 'list', label: 'List' }, { value: 'monthly', label: 'Monthly Report', short: 'Report' }]} />
            <FilterButton icon={RefreshCw} label="Refresh" labelFrom={2000} onClick={refresh} disabled={loading && view !== 'monthly'} spin={loading && view !== 'monthly'} />
            {canEditVoyage && (
              <>
                {/* Aksi sekunder (2026-10-23): panel >= 2000px = tombol terpisah; di bawahnya digabung jadi satu menu "Actions" supaya
                    baris filter tetap 1 baris dan "New voyage" tidak terpotong (laptop 14"). */}
                <div className="hidden @min-[2000px]:contents">
                  <FilterButton icon={CloudDownload} label="Pull" labelFrom={2000} title="Pull voyages from the source system" onClick={() => setShowPull(true)} />
                  <FilterButton icon={Sparkles} label="Read report (AI)" labelFrom={2000} title="Read a Voyage Report (PDF/photo) with AI" onClick={() => setShowAi(true)} />
                  <FilterButton icon={FileUp} label="Upload Noon Report" labelFrom={2000} title="Upload a Noon Report Excel (.xlsx / .xlsm)" onClick={() => setShowNoon(true)} />
                  <FilterButton icon={Tags} label="Noon Report labels" labelFrom={2000} title="Review, turn off or add the labels used to read Noon Reports" onClick={() => setShowNoonLabels(true)} />
                  <FilterButton icon={FileSpreadsheet} label="Import Excel" labelFrom={2000} onClick={() => setShowImport(true)} />
                </div>
                <div className="@min-[2000px]:hidden shrink-0">
                  <FilterMenu label="Actions" items={[
                    { icon: CloudDownload, label: 'Pull from source system', onClick: () => setShowPull(true) },
                    { icon: Sparkles, label: 'Read report (AI)', title: 'Read a Voyage Report (PDF/photo) with AI', onClick: () => setShowAi(true) },
                    { icon: FileUp, label: 'Upload Noon Report', title: 'Upload a Noon Report Excel (.xlsx / .xlsm)', onClick: () => setShowNoon(true) },
                    { icon: Tags, label: 'Noon Report labels', title: 'Review, turn off or add the labels used to read Noon Reports', onClick: () => setShowNoonLabels(true) },
                    { icon: FileSpreadsheet, label: 'Import Excel', onClick: () => setShowImport(true) },
                  ]} />
                </div>
                <FilterButton icon={Plus} label="New voyage" short="New" variant="primary" onClick={() => setForm({ id: null })} />
              </>
            )}
          </FilterPanel>

          {view === 'monthly' ? (
            <CostAgentVoyageMonthlyReport vesselId={vesselId} vesselName={selectedVessel?.name || ''} month={month} ports={ports} reloadKey={reloadKey} onOpen={setDrawerId} />
          ) : view === 'card' ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
              <div className={`rounded-[14px] border border-[#EADFD6] bg-[#FBF7F4] flex flex-col min-h-0 overflow-hidden ${drawerId !== null ? 'lg:w-[35%] lg:min-w-[380px] lg:max-w-[720px] lg:shrink-0 max-lg:min-h-[420px]' : 'flex-1'}`}>
                <CostAgentCardScroller loading={loading} error={listError} count={rows.length}
                  empty={<>No voyages{month ? ` for ${fmtReportMonth(`${month}-01`)}` : ''}.{canEditVoyage ? ' Click "New voyage" or "Import Excel" to add one.' : ''}</>}>
                  {rows.map(r => <CostAgentVoyageCard key={r.id} r={r} tzByCode={tzByCode} selected={drawerId === r.id} onOpen={() => setDrawerId(r.id)} />)}
                </CostAgentCardScroller>
                <PaginationFooter start={start} end={Math.min(page * pageSize, total)} total={total} unit="voyages" page={page} totalPages={totalPages}
                  onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
              </div>
              {drawerId !== null && (
                <div key={drawerId} className="lg:flex-1 min-w-0 min-h-0 flex flex-col max-lg:min-h-[640px]">
                  <CostAgentVoyageDrawer embedded voyageId={drawerId} ports={ports} reloadKey={reloadKey} canEdit={canEditVoyage} canUploadInvoice={canUploadInvoice}
                    onClose={() => setDrawerId(null)} onEdit={id => setForm({ id })} onUploadInvoice={openUpload} onDeleted={canEditVoyage ? onVoyageDeleted : undefined} />
                </div>
              )}
            </div>
          ) : (
            <div className={`${SA_CARD} flex-1 min-h-0 flex flex-col overflow-hidden`}>
              <div className="overflow-auto flex-1 min-h-0">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      {['Month', 'Vessel', 'Voy', 'Charter', 'Route', 'Arrival', 'Departure', 'Cargo Total', 'Inv.', 'Next ETA', 'Status'].map(h => (
                        <th key={h} className={`${TH} ${['Cargo Total', 'Inv.'].includes(h) ? 'text-right' : ''}`} title={h === 'Inv.' ? 'Invoices' : undefined}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? <LoadingTableRow colSpan={COLS} /> : listError ? (
                      <tr><td colSpan={COLS} className="px-4 py-8 text-center text-sm text-[#A8231A]">{listError}</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={COLS} className="px-4 py-10 text-center text-sm text-[#6E5E70] italic">
                        No voyages{month ? ` for ${fmtReportMonth(`${month}-01`)}` : ''}.{canEditVoyage ? ' Click "New voyage" or "Import Excel" to add one.' : ''}
                      </td></tr>
                    ) : rows.map(r => {
                      const hops = routePorts(r.route)
                      const st = VOYAGE_STATUS_META[r.status]
                      return (
                        <tr key={r.id} onClick={() => setDrawerId(r.id)} className={`border-b border-[#F3EEEA] cursor-pointer hover:bg-[#FBF7F4] ${r.status === 'draft' ? 'bg-[#FFFBF0]' : ''}`}>
                          <td className={`${TD} whitespace-nowrap`}>{fmtReportMonth(r.report_month)}</td>
                          <td className={TD}>
                            <div className="font-semibold whitespace-nowrap">{r.vessel_name}</div>
                            {r.vessel_type && <div className="text-[11px] text-[#6E5E70] whitespace-nowrap">{r.vessel_type}</div>}
                            {r.input_source === 'noon_report' && <div className="mt-0.5"><Chip tone="blue" title="Created from a Noon Report">Noon Report</Chip></div>}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <span className="font-semibold">{r.voyage_no}</span>
                            {r.seq_in_report != null && <span className="ml-1 text-[10.5px] text-[#8A7A8B]" title="Seq in report">#{r.seq_in_report}</span>}
                          </td>
                          <td className={TD}>{r.charter_type || '—'}</td>
                          <td className={TD}><RouteBadges route={r.route} /></td>
                          <td className={`${TD} whitespace-nowrap tabular-nums`} title={fmtDateTimePort(r.first_arrival, tzByCode.get(hops[0]))}>
                            {fmtDateTimeCompact(r.first_arrival, tzByCode.get(hops[0]))}{r.first_arrival && <span className="ml-1 text-[10.5px] text-[#8A7A8B]">{tzAbbrev(tzByCode.get(hops[0]))}</span>}
                          </td>
                          <td className={`${TD} whitespace-nowrap tabular-nums`} title={fmtDateTimePort(r.last_departure, tzByCode.get(hops[hops.length - 1]))}>
                            {fmtDateTimeCompact(r.last_departure, tzByCode.get(hops[hops.length - 1]))}{r.last_departure && <span className="ml-1 text-[10.5px] text-[#8A7A8B]">{tzAbbrev(tzByCode.get(hops[hops.length - 1]))}</span>}
                          </td>
                          <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>{r.cargo_total != null ? `${fmtNumber(r.cargo_total, 3)} ${r.cargo_unit || ''}` : '—'}</td>
                          <td className={`${TD} text-right tabular-nums`}>{r.invoice_count || 0}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums`} title={r.next_port_code ? fmtDateTimePort(r.next_eta_at, tzByCode.get(r.next_port_code)) : undefined}>
                            {r.next_port_code ? <><b className="font-semibold">{r.next_port_code}</b> · {fmtDateTimeCompact(r.next_eta_at, tzByCode.get(r.next_port_code))}</> : '—'}
                          </td>
                          <td className={TD}>
                            <div className="flex flex-col items-start gap-1">
                              <Chip tone={st?.tone || 'grey'} title={r.status === 'draft' ? 'Draft — needs review' : st?.hint}>{st?.label || r.status}</Chip>
                              <span className={`text-[10.5px] font-semibold ${r.source === 'api' ? 'text-[#2F4FA8]' : r.source === 'ai' ? 'text-[#5B2E8C]' : 'text-[#8A7A8B]'}`} title="Source">{VOYAGE_SOURCE_LABEL[r.source] || r.source}</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationFooter start={start} end={Math.min(page * pageSize, total)} total={total} unit="voyages" page={page} totalPages={totalPages}
                onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
            </div>
          )}
        </main>
      </div>

      {drawerId !== null && view !== 'card' && (
        <CostAgentVoyageDrawer voyageId={drawerId} ports={ports} reloadKey={reloadKey} canEdit={canEditVoyage} canUploadInvoice={canUploadInvoice}
          onClose={() => setDrawerId(null)} onEdit={id => setForm({ id })} onUploadInvoice={openUpload} onDeleted={canEditVoyage ? onVoyageDeleted : undefined} />
      )}
      {upload && (
        <CostAgentUploadModal companies={companies} defaultCompany={upload.company} presetCallId={upload.callId}
          onClose={() => setUpload(null)}
          onSent={ids => { showToast(`${ids.length || 'The'} invoice${ids.length === 1 ? '' : 's'} sent to AI — see Agency Invoices (Processing).`); refresh() }} />
      )}
      {form && (
        <CostAgentVoyageForm voyageId={form.id} vessels={vessels} ports={ports} companies={companies} actor={actor}
          onClose={() => setForm(null)}
          onSaved={(id, msg) => { setForm(null); showToast(msg, msg.includes('warning') ? 'warn' : 'ok'); refresh(); if (drawerId !== null || form.id === null) setDrawerId(id) }} />
      )}
      {showImport && (
        <CostAgentVoyageImportModal actor={actor} onClose={() => setShowImport(false)} onImported={n => { showToast(`${n} voyage${n === 1 ? '' : 's'} imported.`); refresh() }} />
      )}
      {showNoon && (
        <CostAgentNoonUploadModal companies={companies} defaultCompany={company} onClose={() => setShowNoon(false)} onReviewLabels={() => setShowNoonLabels(true)}
          onDone={() => { setStatus('draft'); setMonth(''); setView(v => (v === 'monthly' ? 'card' : v)); refresh() }} />
      )}
      {showNoonLabels && <CostAgentNoonLabelsModal onClose={() => setShowNoonLabels(false)} onToast={showToast} />}
      {showPull && <CostAgentVoyagePullModal vessels={vessels} onClose={() => setShowPull(false)} onDone={refresh} />}
      {showAi && (
        <CostAgentVoyageAiModal companies={companies} defaultCompany={company} onClose={() => setShowAi(false)}
          onDone={() => { setStatus('draft'); setMonth(''); setView(v => (v === 'monthly' ? 'card' : v)); refresh() }} />
      )}
    </>
  )
}
