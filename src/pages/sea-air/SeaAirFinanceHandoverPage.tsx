// Finance Handover Sea & Air (/sea-air/finance, page_key `sea_air_finance`, 2026-10-01).
// Spek V167: setelah "Submit to Finance" di Invoice Recap -> 1 handover per BL/AWB, dibayar ke PPJK
// (`emkl_vendor`), berisi semua invoice pengiriman (landed cost = invoice saja), TANPA duty & tax
// (dibayar via Billing DJBC). Alur Sent -> Received -> Paid lewat RPC sql/034
// (fn_seaair_finance_accept / _mark_paid / _undo, guard has_edit_access('sea_air_finance')).
// Baca: rekapan_seaair yg sudah submit (policy SELECT tambahan utk page_key ini, sql/034 bagian C).
// Tampilan memakai token Audit PIB / Invoice Recap (`SeaAirAuditUi.tsx`).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search, Undo2, Wallet, X } from 'lucide-react'
import Greeting from '../../components/Greeting'
import { LoadingState } from '../../components/LoadingState'
import { useAuth } from '../../lib/AuthContext'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_BTN_GREEN, SA_INPUT, Chip, Pill, PtBadge, type Tone } from '../../components/SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort, fetchCompanyNameMap, companyFullName } from '../../utils/SeaAirAuditHelpers'
import { RECAP_SEGMENTS, todayLocalIso } from '../../utils/SeaAirRecapHelpers'
import {
  financeStage, FINANCE_STAGE_LABEL, probeFinanceColumns, fetchFinanceRows, financeAmount, matchesFinanceSearch,
  financeAccept, financeMarkPaid, financeUndo, type FinanceStage, type FinanceTab,
} from '../../utils/SeaAirFinanceHelpers'

const PAGE_SIZE = 20
const STAGE_TONE: Record<FinanceStage, Tone> = { waiting: 'amber', received: 'blue', paid: 'green' }
const BORDER: Record<FinanceStage, string> = { waiting: 'border-l-[#E0A526]', received: 'border-l-[#3B6FB6]', paid: 'border-l-[#17663D]' }

// timestamptz -> tanggal LOKAL (bukan potongan string UTC) lalu format "01 Oct 2026".
const fmtTs = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return fmtDateShort(v)
  return fmtDateShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
}

function Stepper({ rec }: { rec: any }) {
  const steps = [
    { label: 'Sent', date: fmtDateShort(rec.tgl_submit_finance), done: true },
    { label: 'Received', date: fmtTs(rec.finance_received_at), done: !!rec.finance_received_at },
    { label: 'Paid', date: fmtDateShort(rec.paid_date), done: !!rec.paid_date },
  ]
  return (
    <div className="flex items-start gap-1" aria-label="Handover progress">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className={`mt-[7px] h-0.5 w-5 ${s.done ? 'bg-[#17663D]' : 'bg-[#EADFD6]'}`} />}
          <div className="text-center min-w-[58px]">
            <span className={`mx-auto block w-4 h-4 rounded-full ${s.done ? 'bg-[#17663D]' : 'border-2 border-[#EADFD6] bg-white'}`} />
            <div className="text-[10.5px] font-bold text-[#3B1B3D] mt-0.5">{s.label}</div>
            <div className="text-[10px] text-[#6E5E70] whitespace-nowrap">{s.done ? s.date : '—'}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-bold text-[#3B1B3D]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function SeaAirFinanceHandoverPage() {
  const navigate = useNavigate()
  const { canEdit, isAdmin, allowedPageKeys } = useAuth()
  const canEditFinance = canEdit('sea_air_finance')
  const canOpenRecap = isAdmin || allowedPageKeys.has('sea_air_rekapan')

  const [rows, setRows] = useState<any[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [hasCols, setHasCols] = useState(true)
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<FinanceTab>('waiting')
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('All')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [payFor, setPayFor] = useState<any | null>(null)
  const [payDate, setPayDate] = useState('')
  const [payRef, setPayRef] = useState('')
  const [undoFor, setUndoFor] = useState<any | null>(null)
  const [undoReason, setUndoReason] = useState('')

  useEffect(() => { document.title = 'Finance Handover · BeeHive' }, [])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoadError(false)
    const data = await fetchFinanceRows()
    if (data === null) { setLoadError(true); setRows([]); return }
    setRows(data)
    setHasCols(await probeFinanceColumns(data[0]))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    let cancelled = false
    fetchCompanyNameMap().then(m => { if (!cancelled) setCompanyNames(m) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { setPage(1) }, [tab, search, company])

  const companies = useMemo(() => Array.from(new Set((rows || []).map(r => String(r.a_n || '').trim()).filter(Boolean))).sort(), [rows])
  const base = useMemo(() => (rows || []).filter(r => (company === 'All' || String(r.a_n || '').trim() === company) && matchesFinanceSearch(r, search)), [rows, company, search])
  const boxes = useMemo(() => {
    const out: Record<FinanceTab, { n: number; sum: number }> = { waiting: { n: 0, sum: 0 }, received: { n: 0, sum: 0 }, paid: { n: 0, sum: 0 }, all: { n: 0, sum: 0 } }
    base.forEach(r => {
      const amt = financeAmount(r)
      const st = financeStage(r)
      out[st].n++; out[st].sum += amt
      out.all.n++; out.all.sum += amt
    })
    return out
  }, [base])
  const filtered = useMemo(() => (tab === 'all' ? base : base.filter(r => financeStage(r) === tab)), [base, tab])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const run = async (id: any, fn: () => Promise<{ error: any }>, okMsg: string) => {
    setBusyId(String(id))
    const { error } = await fn()
    setBusyId(null)
    if (error) { showToast(error.message || 'Failed to update', 'error'); return false }
    showToast(okMsg, 'success')
    await load()
    return true
  }

  const handleReceive = (rec: any) => {
    if (!window.confirm(`Receive ${rec.awb || 'this shipment'} for payment?\nAmount: ${fmtRp(financeAmount(rec))} · payable to ${rec.emkl_vendor || 'the PPJK'}`)) return
    run(rec.id, () => financeAccept(rec.id), 'Received by Finance')
  }
  const openPay = (rec: any) => { setPayFor(rec); setPayDate(todayLocalIso()); setPayRef('') }
  const submitPay = async () => {
    if (!payFor || !payDate || payRef.trim().length < 3) return
    const ok = await run(payFor.id, () => financeMarkPaid(payFor.id, payDate, payRef.trim()), 'Marked as paid')
    if (ok) setPayFor(null)
  }
  const openUndo = (rec: any) => { setUndoFor(rec); setUndoReason('') }
  const submitUndo = async () => {
    if (!undoFor || undoReason.trim().length < 5) return
    const ok = await run(undoFor.id, () => financeUndo(undoFor.id, undoReason.trim()), 'Last Finance step undone')
    if (ok) setUndoFor(null)
  }

  const TABS: { key: FinanceTab; label: string }[] = [
    { key: 'waiting', label: FINANCE_STAGE_LABEL.waiting },
    { key: 'received', label: FINANCE_STAGE_LABEL.received },
    { key: 'paid', label: FINANCE_STAGE_LABEL.paid },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0"><Wallet size={17} /></div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#8E4F93]">Sea &amp; Air</div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Finance Handover</h1>
              <p className="text-[#5A305A] font-light text-sm mt-0.5">One handover per BL / AWB · payable to the PPJK · excludes duty &amp; tax (paid via Billing DJBC)</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col gap-3 px-3 pt-2 pb-2">
        {!hasCols && (
          <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2.5 text-[12.5px] text-[#7A4F00]">
            The Finance Handover database update (<b>sql/034</b>) has not been installed yet — the list is read-only until it is run.
          </div>
        )}

        {/* Kotak status = tab */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0" role="tablist">
          {TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`${SA_CARD} text-left px-4 py-3 transition-colors ${tab === t.key ? 'ring-2 ring-[#6B3470] border-transparent' : 'hover:border-[#6B3470]/40'}`}>
              <div className={SA_LABEL}>{t.label}</div>
              <div className="text-[22px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{rows === null ? '…' : boxes[t.key].n}</div>
              <div className="text-[11.5px] text-[#6E5E70] tabular-nums">{rows === null ? '' : fmtRpShort(boxes[t.key].sum)}</div>
            </button>
          ))}
        </div>

        {/* Filter */}
        <div className={`${SA_CARD} px-4 py-3 flex flex-wrap items-center gap-3 shrink-0`}>
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search BL / AWB, invoice, PPJK, supplier, payment ref…" aria-label="Search" className={`${SA_INPUT} pl-8`} />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[#6E5E70]">
            <span className={SA_LABEL}>Company</span>
            <select value={company} onChange={e => setCompany(e.target.value)} className={`${SA_INPUT} w-auto max-w-[160px]`}>
              <option value="All">All</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setRows(null); load() }} aria-label="Refresh" className={`${SA_BTN_OUTLINE} ml-auto`}><RefreshCw size={13} /> Refresh</button>
        </div>

        {toast && (
          <div className={`px-3 py-2 rounded-xl border text-[12.5px] font-semibold shrink-0 ${toast.type === 'success' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{toast.msg}</div>
        )}

        {/* Daftar */}
        <div className={`${SA_CARD} flex-1 min-h-0 flex flex-col overflow-hidden`}>
          <div className="px-4 py-2.5 border-b border-[#EADFD6] text-[12px] text-[#6E5E70] shrink-0">
            {rows === null ? 'Loading…' : `${filtered.length} shipment${filtered.length === 1 ? '' : 's'} · ${fmtRp(filtered.reduce((a, r) => a + financeAmount(r), 0))}`}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-3 flex flex-col gap-2.5">
            {rows === null ? <LoadingState /> : loadError ? (
              <div className="text-center text-[12.5px] text-[#A8231A] py-10">Failed to load shipments. Check your access (Finance Handover / Invoice Recap) and try Refresh.</div>
            ) : pageRows.length === 0 ? (
              <div className="text-center text-[12.5px] text-[#6E5E70] py-10">No shipments in this list.</div>
            ) : pageRows.map(rec => {
              const st = financeStage(rec)
              const amount = financeAmount(rec)
              const isOpen = !!expanded[String(rec.id)]
              const busy = busyId === String(rec.id)
              const invoices = RECAP_SEGMENTS.filter(s => rec[s.costCol] !== null && rec[s.costCol] !== undefined && rec[s.costCol] !== '')
              return (
                <div key={rec.id} className={`${SA_CARD} border-l-4 ${BORDER[st]}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_200px_230px_auto] gap-x-5 gap-y-3 px-4 py-3.5 items-center">
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-[#3B1B3D] truncate" title={rec.awb || ''}>{rec.awb || '—'}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {rec.shipment_type && <Chip tone="blue">{rec.shipment_type}</Chip>}
                        {rec.a_n && <PtBadge code={rec.a_n} title={companyFullName(companyNames, rec.a_n)} />}
                        <Pill tone={STAGE_TONE[st]}>{FINANCE_STAGE_LABEL[st]}</Pill>
                      </div>
                      <div className="text-[11px] text-[#8A7A8B] mt-1">Invoice {rec.no_invoice || '—'} · Supplier {rec.vendor || '—'}</div>
                    </div>
                    <div className="min-w-0">
                      <div className={SA_LABEL}>Payable to (PPJK)</div>
                      <div className="text-[13px] font-bold text-[#3B1B3D] truncate" title={rec.emkl_vendor || ''}>{rec.emkl_vendor || '—'}</div>
                      <div className="text-[11px] text-[#6E5E70]">{invoices.length} invoice{invoices.length === 1 ? '' : 's'} reimbursed via PPJK</div>
                      {st === 'paid' && <div className="text-[11px] text-[#17663D] font-semibold truncate" title={rec.paid_reference || ''}>Ref {rec.paid_reference || '—'}</div>}
                    </div>
                    <div className="xl:text-right min-w-0">
                      <div className={SA_LABEL}>Amount</div>
                      <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(amount)}</div>
                      <div className="text-[10.5px] text-[#8A7A8B]">excl. duty &amp; tax</div>
                    </div>
                    <Stepper rec={rec} />
                    <div className="flex flex-wrap xl:flex-col items-stretch gap-1.5 xl:min-w-[130px]">
                      {canEditFinance && hasCols && st === 'waiting' && (
                        <button type="button" className={SA_BTN_PRIMARY} disabled={busy} onClick={() => handleReceive(rec)}>{busy ? 'Saving…' : 'Receive'}</button>
                      )}
                      {canEditFinance && hasCols && st === 'received' && (
                        <button type="button" className={SA_BTN_GREEN} disabled={busy} onClick={() => openPay(rec)}>Mark paid</button>
                      )}
                      {canEditFinance && hasCols && st !== 'waiting' && (
                        <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={() => openUndo(rec)} title="Undo the last Finance step (reason required)"><Undo2 size={13} /> Undo</button>
                      )}
                      <button type="button" className={SA_BTN_OUTLINE} onClick={() => setExpanded(p => ({ ...p, [String(rec.id)]: !isOpen }))} aria-expanded={isOpen}>
                        <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /> {isOpen ? 'Hide' : 'Details'}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[#EADFD6] px-4 py-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
                      <div>
                        <div className={`${SA_LABEL} mb-1.5`}>Invoices in this handover</div>
                        {invoices.length === 0 ? (
                          <div className="text-[12px] text-[#6E5E70]">No per-invoice amounts recorded — amount taken from Total invoice ({fmtRp(rec.total_invoice)}).</div>
                        ) : (
                          <table className="w-full text-[12.5px]">
                            <tbody>
                              {invoices.map(s => (
                                <tr key={s.key} className="border-b border-[#F1E8E1] last:border-b-0">
                                  <td className="py-1.5 pr-3 font-semibold text-[#3B1B3D]">{s.label}</td>
                                  <td className="py-1.5 pr-3 text-[#6E5E70] [overflow-wrap:anywhere]">{rec[s.vendorCol] || (s.key === 'fd' ? rec.freight_vendor : '') || '—'}</td>
                                  <td className="py-1.5 text-right tabular-nums text-[#3B1B3D]">{fmtRp(rec[s.costCol])}</td>
                                </tr>
                              ))}
                              <tr><td className="pt-2 font-bold text-[#3B1B3D]" colSpan={2}>Total</td><td className="pt-2 text-right font-bold tabular-nums text-[#3B1B3D]">{fmtRp(amount)}</td></tr>
                            </tbody>
                          </table>
                        )}
                        <div className="text-[11px] text-[#8A7A8B] mt-2">Duty &amp; tax {fmtRp(rec.duty_total)} is not part of this handover (paid via Billing DJBC).</div>
                      </div>
                      <div className="flex flex-col gap-1.5 text-[12px]">
                        <div className={SA_LABEL}>History</div>
                        <div><span className="text-[#6E5E70]">Sent:</span> <b className="text-[#3B1B3D]">{fmtDateShort(rec.tgl_submit_finance)}</b></div>
                        <div><span className="text-[#6E5E70]">Received:</span> <b className="text-[#3B1B3D]">{rec.finance_received_at ? `${fmtTs(rec.finance_received_at)} · ${rec.finance_received_by || '—'}` : '—'}</b></div>
                        <div><span className="text-[#6E5E70]">Paid:</span> <b className="text-[#3B1B3D]">{rec.paid_date ? `${fmtDateShort(rec.paid_date)} · ref ${rec.paid_reference || '—'} · ${rec.paid_by || '—'}` : '—'}</b></div>
                        {canOpenRecap && (
                          <button type="button" className="self-start mt-1 text-[12px] font-semibold text-[#6B3470] hover:underline" onClick={() => navigate(`/sea-air/rekapan?q=${encodeURIComponent(rec.awb || '')}`)}>Open in Invoice Recap →</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-[#EADFD6] text-[12px] text-[#6E5E70] shrink-0">
            <span>{filtered.length === 0 ? 'Showing 0' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-[#F6EFEA] disabled:opacity-40"><ChevronLeft size={15} /></button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-[#F6EFEA] disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>
      </main>

      {payFor && (
        <Dialog title={`Mark paid · ${payFor.awb || ''}`} onClose={() => setPayFor(null)}>
          <div className="text-[12.5px] text-[#6E5E70] mb-3">{fmtRp(financeAmount(payFor))} to {payFor.emkl_vendor || 'the PPJK'}</div>
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Payment date</span>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={SA_INPUT} />
          </label>
          <label className="flex flex-col gap-1 mb-4">
            <span className="text-[11.5px] font-semibold text-[#3B1B3D]">Payment reference</span>
            <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Bank transfer reference (min. 3 characters)" className={SA_INPUT} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setPayFor(null)}>Cancel</button>
            <button type="button" className={SA_BTN_GREEN} disabled={!payDate || payRef.trim().length < 3 || busyId === String(payFor.id)} onClick={submitPay}>{busyId === String(payFor.id) ? 'Saving…' : 'Mark paid'}</button>
          </div>
        </Dialog>
      )}
      {undoFor && (
        <Dialog title={`Undo · ${undoFor.awb || ''}`} onClose={() => setUndoFor(null)}>
          <div className="text-[12.5px] text-[#6E5E70] mb-3">
            {financeStage(undoFor) === 'paid' ? 'The payment record will be removed (back to Received · unpaid).' : 'The receipt will be removed (back to Waiting for Finance).'} Recorded in the audit trail.
          </div>
          <textarea value={undoReason} onChange={e => setUndoReason(e.target.value)} rows={3} placeholder="Reason (required, min. 5 characters)" aria-label="Undo reason" className={`${SA_INPUT} h-auto py-2 mb-4`} />
          <div className="flex justify-end gap-2">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setUndoFor(null)}>Cancel</button>
            <button type="button" className={SA_BTN_PRIMARY} disabled={undoReason.trim().length < 5 || busyId === String(undoFor.id)} onClick={submitUndo}>{busyId === String(undoFor.id) ? 'Saving…' : 'Undo'}</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
