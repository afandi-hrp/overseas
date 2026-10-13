// Panel approval review invoice Cost Agent (2026-10-13, Prompt 4). Ladder step per round (approved/pending/rejected/skipped,
// oleh siapa, kapan, catatan). Tombol Approve / Reject HANYA bila user = approver step aktif (email login ada di
// approver_emails) DAN canEdit('cost_agent_invoice') -- server mengecek ulang (fn_cost_agent_decide_approval). Reject wajib
// catatan. Ringkasan sebelum memutuskan: jumlah baris higher / new + total selisih vs history.
import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, MinusCircle, AlertTriangle } from 'lucide-react'
import { Chip, SA_BTN_GREEN, SA_BTN_OUTLINE, SA_CARD, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import {
  costAgentDecideApproval, activeApprovalStep, isApproverOf, fmtMoney, fmtDateTimePort,
  type CostAgentInvoiceHistory, type CostAgentApproval,
} from '../utils/CostAgentHelpers'

const DECISION = {
  approved: { icon: CheckCircle2, tone: 'green', label: 'Approved' },
  rejected: { icon: XCircle, tone: 'red', label: 'Rejected' },
  pending: { icon: Clock, tone: 'amber', label: 'Pending' },
  skipped: { icon: MinusCircle, tone: 'grey', label: 'Skipped' },
} as const

export default function CostAgentApprovalPanel({ data, email, canEdit, actor, onDecided }: {
  data: CostAgentInvoiceHistory
  email: string | null
  canEdit: boolean
  actor: string | null
  onDecided: (result: any, decision: 'approved' | 'rejected') => Promise<void> | void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inv = data.invoice

  const rounds = useMemo(() => {
    const m = new Map<number, CostAgentApproval[]>()
    data.approvals.forEach(a => m.set(a.round_no, [...(m.get(a.round_no) || []), a]))
    return [...m.entries()].sort(([a], [b]) => b - a).map(([round, steps]) => ({ round, steps: steps.sort((x, y) => x.step_no - y.step_no) }))
  }, [data.approvals])
  const active = inv.status === 'waiting_approval' ? activeApprovalStep(data.approvals) : null
  const iAmApprover = isApproverOf(active, email)
  const canDecide = !!active && iAmApprover && canEdit

  // Ringkasan: baris naik / baru + total selisih vs acuan history (compare_ref_amount).
  const summary = useMemo(() => {
    const higher = data.lines.filter(l => l.compare_flag === 'naik').length
    const fresh = data.lines.filter(l => l.compare_flag === 'item_baru' || l.compare_flag === 'tanpa_history').length
    const diff = data.lines.reduce((s, l) => (l.compare_ref_amount !== null && l.compare_ref_amount !== undefined ? s + Number(l.amount || 0) - Number(l.compare_ref_amount) : s), 0)
    return { higher, fresh, diff }
  }, [data.lines])

  const decide = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !note.trim()) { setError('A note is required to reject.'); return }
    if (!window.confirm(decision === 'approved' ? `Approve step ${active?.step_no} (${active?.approver_label})?` : 'Reject this invoice? It goes back to the uploader for correction.')) return
    setBusy(decision); setError(null)
    try {
      const r = await costAgentDecideApproval(inv.id, decision, note.trim() || null, actor)
      setNote('')
      await onDecided(r, decision)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {inv.status === 'waiting_approval' && (
        <section className={`${SA_CARD} p-4 space-y-3`}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-[#3B1B3D]">Decision</h3>
            {active && <Chip tone="amber">Active: step {active.step_no} · {active.approver_label}</Chip>}
          </div>
          <div className="grid grid-cols-3 gap-3 text-[12.5px]">
            <div><div className={SA_LABEL}>Higher than history</div><div className={`font-bold ${summary.higher ? 'text-[#A8231A]' : 'text-[#3B1B3D]'}`}>{summary.higher} line{summary.higher === 1 ? '' : 's'}</div></div>
            <div><div className={SA_LABEL}>New / no history</div><div className={`font-bold ${summary.fresh ? 'text-[#7A4F00]' : 'text-[#3B1B3D]'}`}>{summary.fresh} line{summary.fresh === 1 ? '' : 's'}</div></div>
            <div><div className={SA_LABEL}>Total diff vs history</div><div className={`font-bold tabular-nums ${summary.diff > 0 ? 'text-[#A8231A]' : summary.diff < 0 ? 'text-[#2F4FA8]' : 'text-[#3B1B3D]'}`}>{summary.diff > 0 ? '+' : ''}{fmtMoney(summary.diff, inv.currency)}</div></div>
          </div>
          {canDecide ? (
            <>
              <div>
                <label className={`${SA_LABEL} block mb-1`}>Note <span className="normal-case tracking-normal font-normal">(required to reject)</span></label>
                <textarea className={`${SA_INPUT} h-auto py-2`} rows={2} value={note} onChange={e => setNote(e.target.value)} disabled={!!busy} />
              </div>
              {error && <p className="text-[12.5px] text-[#A8231A] flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" className={`${SA_BTN_OUTLINE} text-[#A8231A]`} disabled={!!busy} onClick={() => decide('rejected')}><XCircle size={13} /> {busy === 'rejected' ? 'Rejecting…' : 'Reject'}</button>
                <button type="button" className={SA_BTN_GREEN} disabled={!!busy} onClick={() => decide('approved')}><CheckCircle2 size={13} /> {busy === 'approved' ? 'Approving…' : 'Approve'}</button>
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-[#6E5E70]">
              {!active ? 'No pending step.' : !iAmApprover ? `Waiting for ${(active.approver_emails || []).join(', ') || active.approver_label}.` : 'You are the approver of this step but do not have edit access to Agency Invoices.'}
            </p>
          )}
        </section>
      )}

      {rounds.length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">Not submitted for approval yet.</p> : rounds.map(({ round, steps }, idx) => (
        <section key={round} className={idx === 0 ? '' : 'opacity-70'}>
          <div className={`${SA_LABEL} mb-1.5`}>Round {round}{idx === 0 ? ' (latest)' : ''}</div>
          <ol className="relative border-l-2 border-[#EADFD6] ml-2 space-y-2.5">
            {steps.map(s => {
              const d = DECISION[s.decision] || DECISION.pending
              const Icon = d.icon
              const isActive = active?.id === s.id
              return (
                <li key={s.id} className="pl-4 relative">
                  <span className={`absolute -left-[11px] top-0.5 bg-white rounded-full ${isActive ? 'ring-2 ring-[#F2D58A]' : ''}`}><Icon size={20} className={d.tone === 'green' ? 'text-[#17663D]' : d.tone === 'red' ? 'text-[#A8231A]' : d.tone === 'amber' ? 'text-[#B7791F]' : 'text-[#8A7A8B]'} /></span>
                  <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                    <b className="text-[#3B1B3D]">Step {s.step_no} · {s.approver_label}</b>
                    <Chip tone={d.tone}>{d.label}</Chip>
                    {s.decided_by && <span className="text-[#6E5E70]">{s.decided_by} · {fmtDateTimePort(s.decided_at, null)}</span>}
                  </div>
                  <div className="text-[11.5px] text-[#6E5E70]">{(s.approver_emails || []).join(', ') || 'No approver email'}</div>
                  {s.note && <p className="text-[12.5px] text-[#3B1B3D] mt-0.5 whitespace-pre-wrap">“{s.note}”</p>}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
