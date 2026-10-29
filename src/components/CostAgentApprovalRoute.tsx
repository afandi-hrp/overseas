// Rute approval (Approval Matrix v2, 2026-10-28, SQL 090): "invoice ini akan melewati siapa saja". Dipakai kartu "Approval route" di detail invoice (sebelum Submit,
// fn_cost_agent_approval_preview) dan kartu "Simulate" di tab Approval Matrix (fn_cost_agent_simulate_matrix). Semua aturan dihitung DATABASE; komponen ini hanya menampilkan.
import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, GitBranch } from 'lucide-react'
import { Chip, SA_CARD } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import { fmtDate } from '../utils/CostAgentHelpers'
import { costAgentApprovalPreview, type ApprovalRoute } from '../utils/CostAgentWorkflow'

export function ApprovalRouteView({ route }: { route: ApprovalRoute }) {
  if (!route.matched) {
    return <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5" role="alert" data-route-unmatched>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span className="[overflow-wrap:anywhere]">{route.reason || 'No approval rule matches this invoice.'}</span></div>
  }
  return (
    <div className="space-y-2" data-route-steps>
      <ol className="space-y-1.5">
        {route.steps.map(s => (
          <li key={s.step} className="rounded-lg border border-[#EADFD6] px-3 py-2 text-[12.5px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#3B1B3D]">Step {s.step} · {s.label}</span>
              {s.mode === 'all' && <Chip tone="purple" title="Every listed person has to approve this step">All must approve</Chip>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {s.missing_emails || s.emails.length === 0
                ? <span className="text-[#A8231A] text-[11.5px]">No approver email — fix the Approval Matrix before submitting</span>
                : s.emails.map(e => <Chip key={e} tone="blue">{e}</Chip>)}
            </div>
            {s.substitutes.map((x, i) => (
              <div key={i} className="mt-1 text-[11.5px] text-[#6E5E70]">Substitute: <b className="text-[#3B1B3D]">{x.substitute}</b> for {x.for} until {fmtDate(x.until)}</div>
            ))}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[#6E5E70]">
        {route.validation && <span>Checker validation runs in parallel</span>}
        {route.director_forward && <span>The approver of the last step can forward to the Director</span>}
        {route.sod && <span>The person who submits cannot validate or approve</span>}
      </div>
    </div>
  )
}

// Hook pratinjau rute utk detail invoice (status verification / rejected): kartu lonceng peringatan di header memakainya (rute tidak cocok = peringatan + Submit nonaktif).
export function useApprovalRoute(invoiceId: number, refreshKey: string, enabled: boolean) {
  const [route, setRoute] = useState<ApprovalRoute | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) { setRoute(null); return }
    let alive = true
    costAgentApprovalPreview(invoiceId).then(r => { if (alive) { setRoute(r); setError(null) } }).catch(e => { if (alive) setError(e?.message || String(e)) })
    return () => { alive = false }
  }, [invoiceId, refreshKey, enabled])
  return { route, error }
}

// Kartu di detail invoice (status verification / rejected). (Sejak 2026-10-28 detail invoice memakai lonceng peringatan + useApprovalRoute; kartu ini tidak dipakai lagi di sana.) `onMatched` memberi tahu induk bila tidak ada aturan yang cocok (Submit dinonaktifkan).
export default function ApprovalRouteCard({ invoiceId, refreshKey, onMatched }: { invoiceId: number; refreshKey: string; onMatched: (ok: boolean, reason: string | null) => void }) {
  const [route, setRoute] = useState<ApprovalRoute | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    setError(null)
    costAgentApprovalPreview(invoiceId)
      .then(r => { if (alive) { setRoute(r); onMatched(r.matched, r.reason ?? null); if (!r.matched) setOpen(true) } })
      .catch(e => { if (alive) setError(e?.message || String(e)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, refreshKey])

  if (error) return <div className={`${SA_CARD} px-3 py-2 text-[12px] text-[#A8231A] shrink-0`} role="alert">Approval route: {error}</div>
  if (!route) return <div className={`${SA_CARD} px-3 py-2 text-[12px] text-[#6E5E70] flex items-center gap-2 shrink-0`}><LoadingSpinner /> Checking the approval route…</div>
  const summary = route.matched
    ? route.steps.map(s => `${s.label}${s.mode === 'all' ? ' (all)' : ''}`).join(' → ')
    : 'No matching approval rule'
  return (
    <section className={`${SA_CARD} px-3 py-2 shrink-0`} data-approval-route>
      <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <GitBranch size={14} className="text-[#6B3470] shrink-0" />
        <span className="text-[12.5px] font-bold text-[#3B1B3D] shrink-0">Approval route</span>
        <span className={`text-[12px] truncate min-w-0 flex-1 ${route.matched ? 'text-[#6E5E70]' : 'text-[#A8231A] font-semibold'}`}>{summary}{route.matched && route.validation ? ' · checker validation in parallel' : ''}</span>
        {open ? <ChevronUp size={14} className="shrink-0 text-[#8A7A8B]" /> : <ChevronDown size={14} className="shrink-0 text-[#8A7A8B]" />}
      </button>
      {open && <div className="mt-2"><ApprovalRouteView route={route} /></div>}
    </section>
  )
}
