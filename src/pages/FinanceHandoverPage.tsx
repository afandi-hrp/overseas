// Finance Handover gabungan FAR Overseas + Sea & Air + Courier (Courier: 2026-10-02, sql/037) (/finance-handover, 2026-10-01) -- spek user
// "Finance Handover" (BeeHive). Pengganti tanda terima kertas: Exim menyerahkan, Finance menerima
// (Receive: nama + tanggal) lalu mencatat pembayaran (Mark paid: tanggal transfer + referensi bank
// opsional). TANPA upload bukti transfer & TANPA Undo (keputusan user). Font app (Sora).
// Hak akses: sumber FAR tampil kalau punya akses `far_overseas_finance`, Sea & Air kalau
// `sea_air_finance`; bisa Receive/Mark paid = hak EDIT page_key sumber itu ("Finance"). Selain itu
// view only (tidak ada switch "View as" -- itu hanya di prototipe).
// Aturan: tidak pernah menampilkan angka/dokumen duty & tax; nama penerima pembayaran selalu lengkap
// (Sea & Air dari master vendor, kode tampil + tanda kalau nama lengkap belum diisi).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import Greeting from '../components/Greeting'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../lib/AuthContext'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_BTN_GREEN, SA_INPUT, Chip, Pill, PtBadge } from '../components/SeaAirAuditUi'
import { FarHandoverViewer, SeaAirHandoverViewer, CourierHandoverViewer, type ViewerTab } from '../components/FinanceHandoverViewers'
import { fmtRp, fmtDateShort, fetchCompanyNameMap, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  fetchFarHandovers, fetchSeaAirHandovers, fetchCourierHandovers, probeSeaAirFinanceColumns, probeCourierFinanceColumns, sortHandovers, matchesHandoverSearch, isOverdue,
  receiveHandover, markHandoverPaid, todayIso, type HandoverItem, type HandoverSource, type HandoverStage,
} from '../utils/FinanceHandoverHelpers'

type StageTab = HandoverStage | 'all'
type SourceTab = 'all' | HandoverSource
const PAGE_SIZE = 25
const PAGE_KEY: Record<HandoverSource, string> = { far: 'far_overseas_finance', seaair: 'sea_air_finance', courier: 'courier_finance' }
const ROW_BG: Record<HandoverStage, string> = { waiting: 'bg-[#FFFBF2]', received: 'bg-white', paid: 'bg-[#F5FBF7]' }

function Timeline({ it }: { it: HandoverItem }) {
  const steps = [
    { label: 'Sent', date: it.sentDate, who: null as string | null },
    { label: 'Received', date: it.receivedDate, who: it.receivedBy },
    { label: 'Paid', date: it.paidDate, who: null },
  ]
  return (
    <div className="flex items-start" aria-label="Handover progress">
      {steps.map((s, i) => {
        const done = !!s.date
        return (
          <div key={s.label} className="flex-1 min-w-[68px]">
            <div className="flex items-center">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${done ? 'bg-[#17663D]' : 'bg-[#D9CFD6]'}`} />
              {i < steps.length - 1 && <span className={`h-0.5 flex-1 ${steps[i + 1].date ? 'bg-[#17663D]' : 'bg-[#EADFD6]'}`} />}
            </div>
            <div className="text-[10.5px] font-bold text-[#3B1B3D] mt-1">{s.label}</div>
            <div className="text-[10px] text-[#6E5E70] truncate" title={done && s.who ? `${fmtDateShort(s.date)} · ${s.who}` : undefined}>
              {done ? `${fmtDateShort(s.date)}${s.who ? ` · ${s.who}` : ''}` : 'Pending'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[15px] font-bold text-[#3B1B3D]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function FinanceHandoverPage() {
  const navigate = useNavigate()
  const { canEdit, isAdmin, allowedPageKeys, profile, user } = useAuth()
  const canSee = (s: HandoverSource) => isAdmin || allowedPageKeys.has(PAGE_KEY[s])
  const canAct = (s: HandoverSource) => canSee(s) && canEdit(PAGE_KEY[s])
  const seeFar = canSee('far')
  const seeSea = canSee('seaair')
  const seeCourier = canSee('courier')
  const isFinance = (seeFar && canAct('far')) || (seeSea && canAct('seaair')) || (seeCourier && canAct('courier'))

  const [items, setItems] = useState<HandoverItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [seaCols, setSeaCols] = useState(true)
  const [courierCols, setCourierCols] = useState(true)
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<StageTab>('all')
  const [source, setSource] = useState<SourceTab>('all')
  const [search, setSearch] = useState('')
  const [pt, setPt] = useState('All')
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [receiveFor, setReceiveFor] = useState<HandoverItem | null>(null)
  const [recvName, setRecvName] = useState('')
  const [recvDate, setRecvDate] = useState('')
  const [payFor, setPayFor] = useState<HandoverItem | null>(null)
  const [payDate, setPayDate] = useState('')
  const [payRef, setPayRef] = useState('')
  const [dialogErr, setDialogErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState<{ it: HandoverItem; tab: ViewerTab } | null>(null)

  useEffect(() => { document.title = 'Finance Handover · BeeHive' }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoadError(null)
    const [far, sea, cou] = await Promise.all([
      seeFar ? fetchFarHandovers() : Promise.resolve([]),
      seeSea ? fetchSeaAirHandovers() : Promise.resolve([]),
      seeCourier ? fetchCourierHandovers() : Promise.resolve([]),
    ])
    const errs: string[] = []
    if (far === null) errs.push('FAR Overseas')
    if (sea === null) errs.push('Sea & Air')
    if (cou === null) errs.push('Courier')
    if (errs.length) setLoadError(`Failed to load ${errs.join(' and ')} handovers.`)
    if (seeSea && sea && sea.length > 0) setSeaCols(await probeSeaAirFinanceColumns(sea[0].raw))
    if (seeCourier && cou && cou.length > 0) setCourierCols(await probeCourierFinanceColumns(cou[0].raw))
    setItems(sortHandovers([...(far || []), ...(sea || []), ...(cou || [])]))
  }, [seeFar, seeSea, seeCourier])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    let cancelled = false
    fetchCompanyNameMap().then(m => { if (!cancelled) setCompanyNames(m) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { setPage(1) }, [stage, source, search, pt])

  const today = todayIso()
  const scoped = useMemo(() => (items || []).filter(it => (source === 'all' || it.source === source) && (pt === 'All' || it.pt === pt) && matchesHandoverSearch(it, search)), [items, source, pt, search])
  const tiles = useMemo(() => {
    const t: Record<StageTab, { n: number; sum: number }> = { waiting: { n: 0, sum: 0 }, received: { n: 0, sum: 0 }, paid: { n: 0, sum: 0 }, all: { n: 0, sum: 0 } }
    scoped.forEach(it => { t[it.stage].n++; t[it.stage].sum += it.amountIdr; t.all.n++; t.all.sum += it.amountIdr })
    return t
  }, [scoped])
  const overdueReceived = useMemo(() => scoped.filter(it => it.stage === 'received' && isOverdue(it, today)).length, [scoped, today])
  const shown = useMemo(() => (stage === 'all' ? scoped : scoped.filter(it => it.stage === stage)), [scoped, stage])
  const ptOptions = useMemo(() => Array.from(new Set((items || []).filter(it => source === 'all' || it.source === source).map(it => it.pt).filter(Boolean))).sort(), [items, source])
  const totalAll = (items || []).filter(it => source === 'all' || it.source === source).length
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const pageItems = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const actionsEnabled = (it: HandoverItem) => canAct(it.source) && (it.source === 'far' || (it.source === 'seaair' ? seaCols : courierCols))
  const openReceive = (it: HandoverItem) => { setReceiveFor(it); setRecvName(profile?.nama || user?.email || ''); setRecvDate(today); setDialogErr(null) }
  const openPay = (it: HandoverItem) => { setPayFor(it); setPayDate(today); setPayRef(''); setDialogErr(null) }
  const submitReceive = async () => {
    if (!receiveFor) return
    if (!recvName.trim() || !recvDate) { setDialogErr('Fill in the receiver name and date.'); return }
    setBusy(true)
    const { error } = await receiveHandover(receiveFor, recvName.trim(), recvDate)
    setBusy(false)
    if (error) { setDialogErr(error.message || 'Failed to receive.'); return }
    showToast(`${receiveFor.ref} received.`)
    setReceiveFor(null)
    load()
  }
  const submitPay = async () => {
    if (!payFor) return
    if (!payDate) { setDialogErr('Fill in the transfer date.'); return }
    setBusy(true)
    const { error } = await markHandoverPaid(payFor, payDate, payRef.trim() || null)
    setBusy(false)
    if (error) { setDialogErr(error.message || 'Failed to mark as paid.'); return }
    showToast(`${payFor.ref} marked as paid.`)
    setPayFor(null)
    load()
  }

  const payeeKind = (it: HandoverItem) => (it.source === 'far' ? 'forwarder' : 'PPJK')
  const SOURCES: { key: SourceTab; label: string; show: boolean }[] = [
    { key: 'all', label: 'All sources', show: [seeFar, seeSea, seeCourier].filter(Boolean).length > 1 },
    { key: 'far', label: 'FAR Overseas', show: seeFar },
    { key: 'seaair', label: 'Sea & Air', show: seeSea },
    { key: 'courier', label: 'Courier', show: seeCourier },
  ]
  const TILES: { key: StageTab; label: string; note: React.ReactNode; tone: string }[] = [
    { key: 'waiting', label: 'Waiting for Finance', note: 'Receive to confirm the documents arrived', tone: 'text-[#7A4F00]' },
    { key: 'received', label: 'Received · unpaid', note: overdueReceived > 0 ? <span className="text-[#A8231A] font-bold">{overdueReceived} overdue</span> : 'Record the transfer to mark paid', tone: overdueReceived > 0 ? 'text-[#A8231A]' : 'text-[#3B1B3D]' },
    { key: 'paid', label: 'Paid', note: 'Transfer recorded', tone: 'text-[#17663D]' },
    { key: 'all', label: 'All handovers', note: [seeFar && 'FAR Overseas', seeSea && 'Sea & Air', seeCourier && 'Courier'].filter(Boolean).join(' + '), tone: 'text-[#3B1B3D]' },
  ]

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#8E4F93]">Finance</div>
            <h1 className="font-bold text-2xl text-[#3B1B3D] leading-tight">Finance Handover</h1>
            <p className="text-[#6E5E70] text-[12.5px] mt-0.5">
              {isFinance
                ? 'Viewing as Finance — receive each handover, then record the transfer to mark it paid.'
                : 'Items arrive here automatically when a FAR memo is fully approved, or a Sea & Air shipment / Courier invoice is submitted. Only Finance can receive or pay.'}
            </p>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col gap-3 px-3 pt-2 pb-2">
        {seeSea && !seaCols && (
          <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2.5 text-[12.5px] text-[#7A4F00] shrink-0">
            Sea &amp; Air Finance Handover database update (<b>sql/034 + sql/035</b>) is not installed — Sea &amp; Air items are read-only.
          </div>
        )}

        {seeCourier && !courierCols && (
          <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2.5 text-[12.5px] text-[#7A4F00] shrink-0">
            Courier Finance Handover database update (<b>sql/037</b>) is not installed — Courier items are read-only.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0" role="tablist" aria-label="Status">
          {TILES.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={stage === t.key} onClick={() => setStage(t.key)}
              className={`${SA_CARD} text-left px-4 py-3 transition-colors ${stage === t.key ? 'ring-2 ring-[#6B3470] border-transparent' : 'hover:border-[#6B3470]/40'}`}>
              <div className="text-[11.5px] text-[#6E5E70]">{t.label}</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-[22px] font-bold tabular-nums leading-tight ${t.tone}`}>{items === null ? '…' : tiles[t.key].n}</span>
                <span className="text-[12.5px] font-semibold text-[#3B1B3D] tabular-nums">{items === null ? '' : fmtRp(tiles[t.key].sum)}</span>
              </div>
              <div className="text-[11px] text-[#6E5E70]">{t.note}</div>
            </button>
          ))}
        </div>

        <div className={`${SA_CARD} px-3 py-2.5 flex flex-wrap items-center gap-2.5 shrink-0`}>
          <div className="inline-flex p-0.5 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Source">
            {SOURCES.filter(s => s.show).map(s => (
              <button key={s.key} type="button" role="tab" aria-selected={source === s.key} onClick={() => { setSource(s.key); setPt('All') }}
                className={`px-3 h-8 rounded-lg text-[12px] font-bold ${source === s.key ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D] hover:bg-white'}`}>{s.label}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memo no., BL / AWB, invoice, vendor, PT" aria-label="Search" className={`${SA_INPUT} pl-8`} />
          </div>
          <label className="flex items-center gap-2">
            <span className={SA_LABEL}>PT</span>
            <select value={pt} onChange={e => setPt(e.target.value)} aria-label="PT" className={`${SA_INPUT} w-auto max-w-[160px]`}>
              <option value="All">All PT</option>
              {ptOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        {toast && (
          <div className={`px-3 py-2 rounded-xl border text-[12.5px] font-semibold shrink-0 ${toast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{toast.msg}</div>
        )}
        {loadError && <div className="px-3 py-2 rounded-xl border bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A] text-[12.5px] font-semibold shrink-0">{loadError}</div>}

        <div className="text-[12px] font-semibold text-[#6E5E70] shrink-0">
          {items === null ? 'Loading…' : `${shown.length} of ${totalAll} handovers · ${fmtRp(shown.reduce((a, it) => a + it.amountIdr, 0))}`}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5">
          {items === null ? <LoadingState /> : pageItems.length === 0 ? (
            <div className={`${SA_CARD} px-4 py-10 text-center text-[12.5px] text-[#6E5E70]`}>Nothing here for this filter.</div>
          ) : pageItems.map(it => {
            const overdue = isOverdue(it, today)
            const act = actionsEnabled(it)
            const lockedViews = act && it.stage === 'waiting'
            const viewBtn = (tab: ViewerTab, label: string) => (
              <button type="button" className="px-2.5 h-8 rounded-lg bg-[#F5EDF3] hover:bg-[#EFE2EC] text-[#3B1B3D] text-[11.5px] font-bold" onClick={() => setViewer({ it, tab })}>{label}</button>
            )
            return (
              <div key={it.key} className={`rounded-[14px] border border-[#EADFD6] ${ROW_BG[it.stage]} grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.3fr)_170px_minmax(0,1.3fr)_auto] gap-x-4 gap-y-3 px-4 py-3 items-center`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={it.source === 'far' ? 'plum' : it.source === 'courier' ? 'amber' : 'blue'}>{it.source === 'far' ? 'FAR Overseas' : it.source === 'courier' ? 'Courier' : 'Sea & Air'}</Chip>
                    {it.pt && <PtBadge code={it.pt} title={companyFullName(companyNames, it.pt)} />}
                    {it.urgent && <Chip tone="red" title="May be paid before the goods are received">Urgent</Chip>}
                  </div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8A7A8B] mt-1">{it.refLabel}</div>
                  <div className="text-[14px] font-bold text-[#3B1B3D] truncate" title={it.ref}>{it.ref}</div>
                  <div className="text-[11px] text-[#6E5E70] truncate" title={it.sub}>{it.sub || '—'}</div>
                </div>
                <div className="min-w-0">
                  <div className={SA_LABEL}>Payable to</div>
                  <div className="text-[12.5px] font-bold text-[#3B1B3D] truncate uppercase" title={it.payee}>{it.payee}</div>
                  {it.payeeIsCode && <div className="text-[10.5px] text-[#7A4F00]" title={`Fill in the full legal name in Settings › ${it.source === 'courier' ? 'Courier' : 'Sea & Air'} Vendors`}>Full PPJK name not set (code shown)</div>}
                  <div className="text-[11px] text-[#6E5E70] truncate" title={it.payeeLine}>{it.payeeLine}</div>
                </div>
                <div className="xl:text-right min-w-0">
                  <div className="text-[15px] font-bold text-[#3B1B3D] tabular-nums">{it.amountOriginal || fmtRp(it.amountIdr)}</div>
                  {it.amountOriginal && <div className="text-[10.5px] text-[#6E5E70] tabular-nums">≈ {fmtRp(it.amountIdr)}</div>}
                  <div className={`text-[11px] font-semibold ${it.stage === 'paid' ? 'text-[#17663D]' : overdue ? 'text-[#A8231A]' : 'text-[#3B1B3D]'}`}>
                    {it.stage === 'paid' ? `Paid ${fmtDateShort(it.paidDate)}`
                      : it.dueDate ? `${overdue ? 'Overdue · due' : 'Due'} ${fmtDateShort(it.dueDate)}${it.topLabel ? ` · ${it.topLabel}` : ''}` : 'Due —'}
                  </div>
                </div>
                <Timeline it={it} />
                <div className="flex flex-col items-start xl:items-end gap-1.5 min-w-[150px]">
                  {it.stage === 'paid'
                    ? <Pill tone="green" title={it.paidReference ? `Bank reference ${it.paidReference}` : undefined}>✓ Paid{it.paidReference ? ` · ${it.paidReference}` : ''}</Pill>
                    : !act && <Pill tone={it.stage === 'waiting' ? 'amber' : overdue ? 'red' : 'grey'}>{it.stage === 'waiting' ? 'Waiting for Finance' : overdue ? 'Unpaid · overdue' : 'Unpaid'}</Pill>}
                  <div className="flex flex-wrap xl:justify-end gap-1.5">
                    {act && it.stage === 'waiting' && <button type="button" className={`${SA_BTN_PRIMARY} h-8`} onClick={() => openReceive(it)}>Accept</button>}
                    {act && it.stage === 'received' && <button type="button" className={`${SA_BTN_GREEN} h-8`} onClick={() => openPay(it)}>Mark paid</button>}
                    {lockedViews ? (
                      <span className="px-2.5 h-8 inline-flex items-center rounded-lg bg-[#F3EEEA] text-[#8A7A8B] text-[11.5px] font-bold" title="Accept the handover first to open its memo, documents and cost validation">Accept to view</span>
                    ) : it.source === 'far' ? (
                      <>{viewBtn('main', 'Memo')}{viewBtn('docs', 'Docs')}{viewBtn('cost', 'Cost')}</>
                    ) : it.source === 'courier' ? (
                      <>{viewBtn('main', 'Invoice')}{viewBtn('audit', 'Audit')}{viewBtn('docs', 'Docs')}{viewBtn('cost', 'Cost')}</>
                    ) : it.earlier ? (
                      <>{viewBtn('main', 'Handover')}{it.raw?.seaair_id ? viewBtn('audit', 'Audit') : null}</>
                    ) : (
                      <>{viewBtn('main', 'Handover')}{viewBtn('audit', 'Audit')}{viewBtn('docs', 'Docs')}{viewBtn('cost', 'Cost')}</>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {shown.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 text-[12px] text-[#6E5E70] shrink-0">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shown.length)} of {shown.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40"><ChevronLeft size={15} /></button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </main>

      {receiveFor && (
        <Dialog title="Receive handover" onClose={() => setReceiveFor(null)}>
          <div className="text-[13px] font-bold text-[#3B1B3D]">{receiveFor.ref}</div>
          <div className="text-[12px] text-[#6E5E70] mb-3">Payable to {receiveFor.payee} ({payeeKind(receiveFor)}) · {receiveFor.amountOriginal ? `${receiveFor.amountOriginal} (≈ ${fmtRp(receiveFor.amountIdr)})` : fmtRp(receiveFor.amountIdr)}</div>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Received by</span>
            <input value={recvName} onChange={e => setRecvName(e.target.value)} placeholder="Name" className={SA_INPUT} />
          </label>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Received date</span>
            <input type="date" value={recvDate} onChange={e => setRecvDate(e.target.value)} className={SA_INPUT} />
          </label>
          {dialogErr && <div className="mb-3 text-[12px] font-semibold text-[#A8231A]">{dialogErr}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setReceiveFor(null)}>Cancel</button>
            <button type="button" className={SA_BTN_PRIMARY} disabled={busy} onClick={submitReceive}>{busy ? 'Saving…' : 'Confirm'}</button>
          </div>
        </Dialog>
      )}
      {payFor && (
        <Dialog title="Mark as paid" onClose={() => setPayFor(null)}>
          <div className="text-[13px] font-bold text-[#3B1B3D]">{payFor.ref}</div>
          <div className="text-[12px] text-[#6E5E70] mb-3">Payable to {payFor.payee} ({payeeKind(payFor)}) · {payFor.amountOriginal ? `${payFor.amountOriginal} (≈ ${fmtRp(payFor.amountIdr)})` : fmtRp(payFor.amountIdr)}</div>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Transfer date</span>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={SA_INPUT} />
          </label>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Bank reference (optional)</span>
            <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. transfer reference no." className={SA_INPUT} />
          </label>
          {dialogErr && <div className="mb-3 text-[12px] font-semibold text-[#A8231A]">{dialogErr}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setPayFor(null)}>Cancel</button>
            <button type="button" className={SA_BTN_GREEN} disabled={busy} onClick={submitPay}>{busy ? 'Saving…' : 'Confirm'}</button>
          </div>
        </Dialog>
      )}

      {viewer && viewer.it.source === 'far' && (
        <FarHandoverViewer item={viewer.it} initialTab={viewer.tab} onClose={() => setViewer(null)} onChanged={load}
          onOpenEdit={rec => navigate(`/direct-loading/${rec.id}`)} />
      )}
      {viewer && viewer.it.source === 'courier' && (
        <CourierHandoverViewer item={viewer.it} initialTab={viewer.tab} companyNames={companyNames} onClose={() => setViewer(null)} />
      )}
      {viewer && viewer.it.source === 'seaair' && (
        <SeaAirHandoverViewer item={viewer.it} initialTab={viewer.tab} companyNames={companyNames} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}
