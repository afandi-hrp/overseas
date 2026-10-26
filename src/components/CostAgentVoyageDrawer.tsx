// Drawer detail voyage Cost Agent (2026-10-13, Prompt 2) -- fn_cost_agent_get_voyage: timeline pelabuhan (jam lokal
// pelabuhan + handling/port stay), cargo, invoice per port call (link ke /cost-agent/invoice/:id) + tombol upload invoice
// utk port call itu (membuka upload halaman invoice dgn voyage_call_id terisi -- dibangun Prompt 3).
// `embedded` (2026-10-14, tampilan Card): isi SAMA, dirender sbg PANEL SAMPING di kanan daftar kartu (pola panel Invoice Recap
// Courier) tanpa overlay/portal; klik kartu lain = ganti isi. Mode List / Monthly Report tetap drawer overlay.
// `onUploadInvoice` (2026-10-14, permintaan user): "Upload invoice for this port call" membuka form upload DI HALAMAN INI (dulu pindah
// ke Agency Invoices lewat ?upload=1&call=). Tanpa prop ini tetap link lama.
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, Pencil, UploadCloud, CheckCircle2, Ship, AlertTriangle, Trash2, Sparkles } from 'lucide-react'
import { StatusChip } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_LABEL } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  costAgentGetVoyage, costAgentDeleteVoyage, fmtDateTimePort, fmtHours, fmtNumber, fmtMoney, fmtReportMonth, fmtDate, isNoonReportVoyage, isAiReviewWarning, ACTIVITY_LABEL, VOYAGE_SOURCE_LABEL,
  type CostAgentPort, type CostAgentVoyageDetail, type CostAgentNoonDay,
} from '../utils/CostAgentHelpers'

const TIMES = [
  ['arrived_at', 'Arrival'], ['berthed_at', 'Berthed'], ['commenced_at', 'Commenced'], ['completed_at', 'Completed'], ['departed_at', 'Departure'],
] as const

// Bahan bakar Noon Report: label kolom -> akhiran field (rob_/cons_/recv_ + akhiran). Urutan kolom sesuai permintaan user.
const NOON_FUELS = [['LSFO', 'lsfo'], ['LSMGO', 'lsmgo'], ['MDO', 'mdo'], ['HSFO', 'hsfo'], ['FW', 'fw']] as const
const NOON_GROUPS = [['ROB', 'rob'], ['Consumption', 'cons'], ['Received', 'recv']] as const
const noonNum = (d: CostAgentNoonDay, pre: string, k: string): number | null => {
  const v = (d as any)[`${pre}_${k}`]
  return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
}
const NOON_TH = 'px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4]'

// "Daily Noon Report" (2026-10-22): data harian jam 12.00 dari `noon` (fn_cost_agent_get_voyage); null = "—"; angka maks. 3 desimal.
function DailyNoonReport({ days }: { days: CostAgentNoonDay[] }) {
  const totals = NOON_FUELS.map(([, k]) => {
    const vals = days.map(d => noonNum(d, 'cons', k)).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  })
  return (
    <section data-daily-noon>
      <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-2">Daily Noon Report</h3>
      <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
        <table className="min-w-full text-[12px]">
          <thead>
            <tr>
              <th className={`${NOON_TH} text-left`} rowSpan={2}>Date</th>
              <th className={`${NOON_TH} text-left`} rowSpan={2}>Doc No</th>
              <th className={`${NOON_TH} text-left`} rowSpan={2}>Location</th>
              {NOON_GROUPS.map(([g]) => <th key={g} colSpan={NOON_FUELS.length} className={`${NOON_TH} text-center border-l border-[#EADFD6]`}>{g}</th>)}
              <th className={`${NOON_TH} text-left border-l border-[#EADFD6]`} rowSpan={2}>Weather</th>
              <th className={`${NOON_TH} text-center`} rowSpan={2} title="Warnings">⚠</th>
            </tr>
            <tr>
              {NOON_GROUPS.flatMap(([g]) => NOON_FUELS.map(([f], i) => (
                <th key={g + f} className={`${NOON_TH} text-right ${i === 0 ? 'border-l border-[#EADFD6]' : ''}`}>{f}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const warns = (d.warnings || []).filter(Boolean)
              const aiWarns = warns.filter(isAiReviewWarning), plainWarns = warns.filter(w => !isAiReviewWarning(w))
              return (
                <tr key={`${d.report_date}-${d.doc_no}-${i}`} className="border-t border-[#F3EEEA] text-[#3B1B3D] align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums font-semibold">{fmtDate(d.report_date)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{d.doc_no || '—'}</td>
                  <td className="px-2 py-1.5 min-w-[150px]">
                    <div>{d.location || '—'}</div>
                    {d.partner && <div className="text-[11px] text-[#6E5E70]">STS with {d.partner}</div>}
                  </td>
                  {NOON_GROUPS.flatMap(([g, pre]) => NOON_FUELS.map(([f, k], j) => (
                    <td key={g + f} className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${j === 0 ? 'border-l border-[#F3EEEA]' : ''}`}>{fmtNumber(noonNum(d, pre, k), 3)}</td>
                  )))}
                  <td className="px-2 py-1.5 border-l border-[#F3EEEA] min-w-[130px]">{d.weather || '—'}</td>
                  <td className="px-2 py-1.5 text-center">
                    {/* "Review AI (hanya peringatan)" = ikon AI review terpisah; teks peringatan tetap apa adanya. */}
                    <span className="inline-flex items-center justify-center gap-1">
                      {plainWarns.length > 0 && <span className="inline-flex text-[#B7791F] cursor-help" title={plainWarns.join('\n')} aria-label={`${plainWarns.length} warning(s): ${plainWarns.join('; ')}`}><AlertTriangle size={14} /></span>}
                      {aiWarns.length > 0 && <span className="inline-flex text-[#5B2E8C] cursor-help" title={aiWarns.join('\n')} aria-label={`AI review: ${aiWarns.join('; ')}`} data-ai-review><Sparkles size={14} /></span>}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#EADFD6] bg-[#FBF7F4] font-bold text-[#3B1B3D]">
              <td className="px-2 py-1.5" colSpan={3}>Total consumption</td>
              {NOON_GROUPS.flatMap(([g, pre]) => NOON_FUELS.map(([f], j) => (
                <td key={g + f} className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${j === 0 ? 'border-l border-[#EADFD6]' : ''}`}>
                  {pre === 'cons' ? fmtNumber(totals[j], 3) : ''}
                </td>
              )))}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default function CostAgentVoyageDrawer({ voyageId, ports, reloadKey, canEdit, canUploadInvoice, onClose, onEdit, embedded = false, onUploadInvoice, onDeleted }: {
  embedded?: boolean
  onDeleted?: (message: string) => void // ada = tombol Delete tampil (hak edit voyage)
  onUploadInvoice?: (callId: number, companyCode: string | null) => void
  voyageId: number
  ports: CostAgentPort[]
  reloadKey: number
  canEdit: boolean
  canUploadInvoice: boolean
  onClose: () => void
  onEdit: (id: number) => void
}) {
  const [data, setData] = useState<CostAgentVoyageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDeleteError(null)
    setError(null)
    costAgentGetVoyage(voyageId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [voyageId, reloadKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Hapus voyage (2026-10-23): konfirmasi -> fn_cost_agent_delete_voyage (sql/073). Server menolak bila ada invoice terkait / status closed.
  const hasInvoices = !!data?.calls.some(c => (c.invoices || []).length > 0)
  const deleteVoyage = async () => {
    if (!data || !onDeleted) return
    const label = `${data.vessel_name} · Voy ${data.voyage_no}`
    const noonCount = (data.noon || []).length
    if (!window.confirm(`Delete voyage ${label}?\n\nThis also removes its ${data.calls.length} port call${data.calls.length === 1 ? '' : 's'}${data.cargo.length ? `, ${data.cargo.length} cargo line${data.cargo.length === 1 ? '' : 's'}` : ''}${noonCount ? ` and ${noonCount} noon report day${noonCount === 1 ? '' : 's'}` : ''}. This cannot be undone.`)) return
    setDeleting(true); setDeleteError(null)
    try {
      await costAgentDeleteVoyage(data.id)
      onDeleted(`Voyage ${label} deleted.`)
    } catch (e: any) {
      setDeleteError(e.message || String(e))
    } finally {
      setDeleting(false)
    }
  }
  const isNoon = isNoonReportVoyage(data)
  const noonDays = data?.noon || []
  const nextTz = data?.next_port_id ? ports.find(p => p.id === data.next_port_id)?.tz : null
  const cargoByUnit = new Map<string, number>()
  data?.cargo.forEach(g => cargoByUnit.set(g.unit, (cargoByUnit.get(g.unit) || 0) + Number(g.qty || 0)))

  const panel = (
      <aside className={embedded ? 'bg-white rounded-2xl border border-[#EADFD6] shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden' : 'bg-white w-full max-w-[560px] h-full shadow-2xl flex flex-col'} data-voyage-panel={embedded ? voyageId : undefined}>
        <div className="px-5 py-4 border-b border-[#EADFD6] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Ship size={16} className="text-[#6B3470]" />
              <h2 className="text-[17px] font-bold text-[#3B1B3D]">{data ? `${data.vessel_name} · Voy ${data.voyage_no}` : 'Voyage'}</h2>
              {data && <StatusChip kind="voyage" status={data.status} />}
              {data && <Chip tone={data.source === 'api' ? 'blue' : 'grey'}>{VOYAGE_SOURCE_LABEL[data.source]}</Chip>}
            </div>
            {data && (
              <p className="text-[12px] text-[#6E5E70] mt-0.5">
                {[data.vessel_type, data.vessel_dwt ? `DWT ${fmtNumber(data.vessel_dwt, 0)}` : null, data.company_code].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-5 @container">
          {loading ? <LoadingState fullHeight={false} /> : error ? (
            <p className="text-sm text-[#A8231A]">{error}</p>
          ) : !data ? (
            <p className="text-sm text-[#6E5E70]">Voyage not found.</p>
          ) : (
            <>
              {isNoon && (
                <div className="rounded-lg border border-[#C9D6F2] bg-[#EEF3FD] px-3 py-2 text-[12px] text-[#2F4FA8]" data-noon-banner>
                  Created from Noon Report. Arrival/berth/commence/complete/departure times and cargo are not available from this source — fill them in manually if needed.
                </div>
              )}
              {data.status === 'draft' && (
                <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#7A4F00]">
                  Draft — check the data (e.g. read by AI or imported), then open Edit and click <b>Confirm</b>.
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                <div><div className={SA_LABEL}>Report month</div><div className="text-[#3B1B3D] font-medium">{fmtReportMonth(data.report_month)}</div></div>
                <div><div className={SA_LABEL}>Seq in report</div><div className="text-[#3B1B3D] font-medium">{data.seq_in_report ?? '—'}</div></div>
                <div><div className={SA_LABEL}>Charter</div><div className="text-[#3B1B3D] font-medium">{data.charter_type || '—'}</div></div>
                <div><div className={SA_LABEL}>Next ETA</div><div className="text-[#3B1B3D] font-medium">{data.next_port_code ? `${data.next_port_code} · ${fmtDateTimePort(data.next_eta_at, nextTz)}` : '—'}</div></div>
                {data.remarks && <div className="col-span-2"><div className={SA_LABEL}>Remarks</div><div className="text-[#3B1B3D] whitespace-pre-wrap">{data.remarks}</div></div>}
              </div>

              <section>
                <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-2">Port calls</h3>
                <ol className="relative border-l-2 border-[#EADFD6] ml-2 space-y-4">
                  {data.calls.map(c => (
                    <li key={c.id} className="pl-4 relative">
                      <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${c.activity === 'muat' ? 'bg-[#17663D]' : 'bg-[#2F4FA8]'}`} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#3B1B3D] text-[13px]">#{c.seq} {c.port_code}</span>
                        <span className="text-[12px] text-[#6E5E70]">{c.port_name}</span>
                        <Chip tone={c.activity === 'muat' ? 'green' : 'blue'}>{ACTIVITY_LABEL[c.activity] || c.activity}</Chip>
                      </div>
                      {c.remarks && <p className="mt-0.5 text-[11.5px] text-[#6E5E70] whitespace-pre-wrap" data-call-remarks>{c.remarks}</p>}
                      {/* 2026-10-16 (permintaan user): port call = 3 kolom (container query panel >= 720px; di bawahnya bertumpuk):
                          jam (Arrival…Departure + Handling/Port stay) | invoice ter-match | tombol Upload invoice (dulu link teks di bawah). */}
                      <div className="mt-1.5 grid gap-x-4 gap-y-2 @min-[720px]:grid-cols-[auto_minmax(0,1fr)_auto]" data-port-call-cols>
                        <div className="min-w-0">
                          <dl className="grid grid-cols-[90px_auto] gap-x-2 gap-y-0.5 text-[12px]">
                            {TIMES.map(([k, label]) => (
                              <React.Fragment key={k}>
                                <dt className="text-[#8A7A8B]">{label}</dt>
                                <dd className="text-[#3B1B3D] tabular-nums whitespace-nowrap">{fmtDateTimePort(c[k], c.port_tz)}</dd>
                              </React.Fragment>
                            ))}
                          </dl>
                          <div className="text-[11.5px] text-[#6E5E70] mt-1">Handling <b className="text-[#3B1B3D]">{fmtHours(c.handling_hours)}</b> · Port stay <b className="text-[#3B1B3D]">{fmtHours(c.port_stay_hours)}</b></div>
                        </div>
                        <div className="min-w-0 @min-[720px]:border-l @min-[720px]:border-[#EADFD6] @min-[720px]:pl-4" data-port-call-invoices>
                          <div className={`${SA_LABEL} mb-1`}>Matched invoices{(c.invoices || []).length ? ` (${(c.invoices || []).length})` : ''}</div>
                          {(c.invoices || []).length === 0 ? (
                            <p className="text-[12px] text-[#8A7A8B] italic">No invoice matched to this port call yet.</p>
                          ) : (
                            <div className="space-y-1">
                              {(c.invoices || []).map(inv => (
                                <Link key={inv.id} to={`/cost-agent/invoice/${inv.id}`} className="block text-[12px] rounded-lg border border-[#EADFD6] px-2.5 py-1.5 hover:bg-[#FBF7F4] min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <StatusChip status={inv.status} />
                                    <span className="ml-auto tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap">{fmtMoney(inv.grand_total)}</span>
                                  </div>
                                  <div className="mt-0.5 font-semibold text-[#3B1B3D] truncate" title={inv.invoice_no || undefined}>{inv.invoice_no || `#${inv.id}`}</div>
                                  {inv.vendor_name && <div className="text-[11px] text-[#6E5E70] truncate" title={inv.vendor_name}>{inv.vendor_name}</div>}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                        {canUploadInvoice && (
                          // Tombol di TENGAH kolom (vertikal & horizontal) saat 3 kolom; bertumpuk = rata kiri.
                          <div className="flex items-start @min-[720px]:items-center @min-[720px]:justify-center @min-[720px]:min-w-[180px] @min-[720px]:border-l @min-[720px]:border-[#EADFD6] @min-[720px]:pl-4" data-port-call-upload>
                            {onUploadInvoice ? (
                              <button type="button" onClick={() => onUploadInvoice(c.id, data.company_code)} className={`${SA_BTN_PRIMARY} whitespace-nowrap`}>
                                <UploadCloud size={14} /> Upload invoice
                              </button>
                            ) : (
                              <Link to={`/cost-agent/invoice?upload=1&call=${c.id}`} className={`${SA_BTN_PRIMARY} whitespace-nowrap`}>
                                <UploadCloud size={14} /> Upload invoice
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-2">Cargo</h3>
                {data.cargo.length === 0 ? <p className="text-[12px] text-[#8A7A8B] italic">{isNoon ? 'Cargo is not available in noon reports.' : 'No cargo.'}</p> : (
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="text-left"><th className={`${SA_LABEL} pb-1`}>Product</th><th className={`${SA_LABEL} pb-1`}>Discharge</th><th className={`${SA_LABEL} pb-1 text-right`}>Qty</th></tr></thead>
                    <tbody>
                      {data.cargo.map(g => (
                        <tr key={g.id} className="border-t border-[#F3EEEA]">
                          <td className="py-1 font-semibold text-[#3B1B3D]">{g.product}</td>
                          <td className="py-1 text-[#6E5E70]">{g.call_id ? data.calls.find(c => c.id === g.call_id)?.port_code || '—' : '—'}</td>
                          <td className="py-1 text-right tabular-nums text-[#3B1B3D]">{fmtNumber(g.qty, 3)} {g.unit}</td>
                        </tr>
                      ))}
                      {[...cargoByUnit.entries()].map(([u, n]) => (
                        <tr key={u} className="border-t-2 border-[#EADFD6]"><td className="py-1 font-bold text-[#3B1B3D]" colSpan={2}>Total {u}</td><td className="py-1 text-right font-bold tabular-nums">{fmtNumber(n, 3)} {u}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {noonDays.length > 0 && <DailyNoonReport days={noonDays} />}
            </>
          )}
        </div>

        {data && canEdit && (
          <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex items-center justify-end gap-2 shrink-0">
            {deleteError && <span className="mr-auto text-[12px] text-[#A8231A] flex items-center gap-1.5 min-w-0"><AlertTriangle size={13} className="shrink-0" /> <span className="truncate" title={deleteError}>{deleteError}</span></span>}
            {onDeleted && (
              <button type="button" className={`${SA_BTN_OUTLINE} text-[#A8231A] hover:border-[#F4C3BC] hover:bg-[#FDE7E4] ${deleteError ? '' : 'mr-auto'}`} disabled={deleting || hasInvoices || data.status === 'closed'}
                title={data.status === 'closed' ? 'A closed voyage cannot be deleted' : hasInvoices ? 'This voyage has invoices — delete or move them first' : 'Delete this voyage (port calls, cargo and noon days are removed too)'}
                onClick={deleteVoyage} data-delete-voyage>
                <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            {data.status === 'draft' ? (
              <button type="button" className={SA_BTN_PRIMARY} onClick={() => onEdit(data.id)}><CheckCircle2 size={13} /> Review &amp; Confirm</button>
            ) : (
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => onEdit(data.id)}><Pencil size={13} /> Edit</button>
            )}
          </div>
        )}
      </aside>
  )
  if (embedded) return panel
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px] flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      {panel}
    </div>,
    document.body,
  )
}
