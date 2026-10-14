// Drawer detail voyage Cost Agent (2026-10-13, Prompt 2) -- fn_cost_agent_get_voyage: timeline pelabuhan (jam lokal
// pelabuhan + handling/port stay), cargo, invoice per port call (link ke /cost-agent/invoice/:id) + tombol upload invoice
// utk port call itu (membuka upload halaman invoice dgn voyage_call_id terisi -- dibangun Prompt 3).
// `embedded` (2026-10-14, tampilan Card): isi SAMA, dirender sbg PANEL SAMPING di kanan daftar kartu (pola panel Invoice Recap
// Courier) tanpa overlay/portal; klik kartu lain = ganti isi. Mode List / Monthly Report tetap drawer overlay.
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X, Pencil, UploadCloud, CheckCircle2, Ship } from 'lucide-react'
import { StatusChip } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_LABEL } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  costAgentGetVoyage, fmtDateTimePort, fmtHours, fmtNumber, fmtMoney, fmtReportMonth, ACTIVITY_LABEL, VOYAGE_SOURCE_LABEL,
  type CostAgentPort, type CostAgentVoyageDetail,
} from '../utils/CostAgentHelpers'

const TIMES = [
  ['arrived_at', 'Arrival'], ['berthed_at', 'Berthed'], ['commenced_at', 'Commenced'], ['completed_at', 'Completed'], ['departed_at', 'Departure'],
] as const

export default function CostAgentVoyageDrawer({ voyageId, ports, reloadKey, canEdit, canUploadInvoice, onClose, onEdit, embedded = false }: {
  embedded?: boolean
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-5">
          {loading ? <LoadingState fullHeight={false} /> : error ? (
            <p className="text-sm text-[#A8231A]">{error}</p>
          ) : !data ? (
            <p className="text-sm text-[#6E5E70]">Voyage not found.</p>
          ) : (
            <>
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
                      <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-0.5 mt-1.5 text-[12px]">
                        {TIMES.map(([k, label]) => (
                          <React.Fragment key={k}>
                            <dt className="text-[#8A7A8B]">{label}</dt>
                            <dd className="text-[#3B1B3D] tabular-nums">{fmtDateTimePort(c[k], c.port_tz)}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                      <div className="text-[11.5px] text-[#6E5E70] mt-1">Handling <b className="text-[#3B1B3D]">{fmtHours(c.handling_hours)}</b> · Port stay <b className="text-[#3B1B3D]">{fmtHours(c.port_stay_hours)}</b></div>
                      <div className="mt-2 space-y-1">
                        {(c.invoices || []).map(inv => (
                          <Link key={inv.id} to={`/cost-agent/invoice/${inv.id}`} className="flex items-center gap-2 text-[12px] rounded-md border border-[#EADFD6] px-2 py-1 hover:bg-[#FBF7F4]">
                            <StatusChip status={inv.status} />
                            <span className="font-semibold text-[#3B1B3D] truncate">{inv.invoice_no || `#${inv.id}`}</span>
                            <span className="text-[#6E5E70] truncate">{inv.vendor_name || ''}</span>
                            <span className="ml-auto tabular-nums text-[#3B1B3D]">{fmtMoney(inv.grand_total)}</span>
                          </Link>
                        ))}
                        {canUploadInvoice && (
                          <Link to={`/cost-agent/invoice?upload=1&call=${c.id}`} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6B3470] hover:underline">
                            <UploadCloud size={12} /> Upload invoice for this port call
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-2">Cargo</h3>
                {data.cargo.length === 0 ? <p className="text-[12px] text-[#8A7A8B] italic">No cargo.</p> : (
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
            </>
          )}
        </div>

        {data && canEdit && (
          <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex justify-end gap-2 shrink-0">
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
