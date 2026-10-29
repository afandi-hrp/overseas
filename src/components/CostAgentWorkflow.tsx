// Alur kerja invoice Cost Agent (Tahap 2b, 2026-10-28, SQL 088): hook status alur, stepper (dua jalur PARALEL: validasi checker | approval 1 > 2 > ...),
// panel aksi checker (Validate saja; "Return to maker" dihapus 2026-10-29 atas permintaan user) dan dialog alasan (Void). Tombol aksi MENGIKUTI `me.can_*` dari fn_cost_agent_get_workflow;
// server tetap menegakkan (SoD:, TOTAL_CHANGED:, DOC_GATE:). Detail: docs/claude/cost-agent.md ("Roles, parallel validation and approval").
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, MinusCircle, ShieldCheck, UserCheck, XCircle } from 'lucide-react'
import { CostAgentModal } from './CostAgentUi'
import { Chip, SA_BTN_GREEN, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT, SA_LABEL, type Tone } from './SeaAirAuditUi'
import { fmtDateTimePort } from '../utils/CostAgentHelpers'
import { DOC_GATE_TOAST, isDocGateError } from '../utils/CostAgentGate'
import {
  costAgentCheckerValidate, costAgentGetWorkflow, isTotalChangedError, type Workflow, type WorkflowApproval,
} from '../utils/CostAgentWorkflow'

// ─── Hook ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Dimuat saat detail dibuka (bukan saat masih processing) dan SETIAP aksi (refresh dipanggil oleh reload modal).
export function useInvoiceWorkflow(invoiceId: number, status: string | undefined) {
  const [wf, setWf] = useState<Workflow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const refresh = useCallback(async () => {
    const my = ++seq.current
    try {
      const w = await costAgentGetWorkflow(invoiceId)
      if (my === seq.current) { setWf(w); setError(null) }
    } catch (e: any) { if (my === seq.current) setError(e?.message || String(e)) }
  }, [invoiceId])
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!status || status === 'processing') return
    const k = `${invoiceId}:${status}`
    if (started.current === k) return
    started.current = k
    refresh()
  }, [invoiceId, status, refresh])
  return { wf, error, refresh }
}

// ─── Stepper ────────────────────────────────────────────────────────────────────────────────────────────────────
type BoxState = { tone: Tone; label: string; icon: ReactNode }
const ICON = { ok: <CheckCircle2 size={15} />, bad: <XCircle size={15} />, wait: <Clock size={15} />, skip: <MinusCircle size={15} /> }
const approvalState = (d: string): BoxState =>
  d === 'approved' ? { tone: 'green', label: 'Approved', icon: ICON.ok } : d === 'rejected' ? { tone: 'red', label: 'Rejected', icon: ICON.bad }
    : d === 'skipped' ? { tone: 'grey', label: 'Skipped', icon: ICON.skip } : { tone: 'amber', label: 'Pending', icon: ICON.wait }
const validationState = (s: string | undefined): BoxState =>
  s === 'validated' ? { tone: 'green', label: 'Validated', icon: ICON.ok } : s === 'returned' ? { tone: 'red', label: 'Returned', icon: ICON.bad }
    : s === 'skipped' ? { tone: 'grey', label: 'Skipped', icon: ICON.skip } : s === 'pending' ? { tone: 'amber', label: 'Pending', icon: ICON.wait }
      : { tone: 'grey', label: 'Not required', icon: ICON.skip }

function StepBox({ title, state, who, at, note, active, sub, extra }: { title: string; state: BoxState; who?: string | null; at?: string | null; note?: string | null; active?: boolean; sub?: string; extra?: ReactNode }) {
  const border = state.tone === 'green' ? 'border-[#BFE3CC] bg-[#F4FBF7]' : state.tone === 'red' ? 'border-[#F4C3BC] bg-[#FEF3F1]' : state.tone === 'amber' ? 'border-[#F2D58A] bg-[#FFFBF0]' : 'border-[#EADFD6] bg-[#FBF7F4]'
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[150px] max-w-[230px] ${border} ${active ? 'ring-2 ring-[#F2D58A]' : ''}`} data-step={title}>
      <div className="text-[11.5px] font-bold text-[#3B1B3D] leading-tight">{title}</div>
      {sub && <div className="text-[10.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{sub}</div>}
      <div className="mt-1"><Chip tone={state.tone}>{state.icon}{state.label}</Chip></div>
      {(who || at) && <div className="mt-1 text-[10.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{who}{who && at ? ' · ' : ''}{at ? fmtDateTimePort(at, null) : ''}</div>}
      {note && <div className="mt-0.5 text-[11px] text-[#3B1B3D] italic [overflow-wrap:anywhere]">“{note}”</div>}
      {extra}
    </div>
  )
}
const Arrow = () => <ArrowRight size={14} className="text-[#B9A9BA] shrink-0" aria-hidden />

// Langkah mode 'all': "n of N approved" + chip per email (hijau = sudah setuju; ikon pengganti bila disetujui oleh pengganti).
function AllVotes({ a }: { a: WorkflowApproval }) {
  const votes = a.votes ?? []
  const done = new Map(votes.filter(v => v.decision === 'approved').map(v => [v.for, v]))
  const total = a.emails.length
  const n = a.decision === 'approved' ? total : a.emails.filter(e => done.has(e.toLowerCase())).length
  return (
    <div className="mt-1.5 space-y-1" data-all-votes>
      <div className="text-[10.5px] font-semibold text-[#5B2E8C]">{n} of {total} approved</div>
      <div className="flex flex-wrap gap-1">
        {a.emails.map(e => {
          const v = done.get(e.toLowerCase())
          const bySub = !!v && v.by !== v.for
          return <Chip key={e} tone={v ? 'green' : 'grey'} title={v ? (bySub ? 'Approved by substitute ' + v.by : 'Approved') : 'Waiting'}>{v ? (bySub ? <UserCheck size={10} /> : <CheckCircle2 size={10} />) : null}{e}</Chip>
        })}
      </div>
    </div>
  )
}

export function WorkflowStepper({ wf, reminderDays = 3 }: { wf: Workflow; reminderDays?: number }) {
  const submitted = !!wf.submitted_at
  const makerState: BoxState = submitted ? { tone: 'green', label: 'Submitted', icon: ICON.ok } : { tone: 'amber', label: 'In progress', icon: ICON.wait }
  const approved = ['approved', 'journal', 'paid'].includes(wf.status)
  const doneState: BoxState = approved ? { tone: 'green', label: 'Approved', icon: ICON.ok } : wf.status === 'cancelled' ? { tone: 'grey', label: 'Voided', icon: ICON.skip }
    : wf.status === 'rejected' ? { tone: 'red', label: 'Returned', icon: ICON.bad } : { tone: 'grey', label: 'Waiting', icon: ICON.wait }
  const allApprovalsDone = wf.approvals.length > 0 && wf.approvals.every(a => a.decision === 'approved')
  const validated = wf.validation?.status === 'validated'
  let banner: string | null = null
  if (wf.status === 'waiting_approval') {
    if (allApprovalsDone && wf.validation?.status === 'pending') banner = 'All approvals done - waiting for checker validation'
    else if (validated && wf.approvals.some(a => a.decision === 'pending')) banner = 'Validated - waiting for approvals'
  }
  return (
    <section className={`${SA_CARD} p-4`} data-workflow-stepper>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">Workflow</h3>
        {wf.round ? <Chip tone="grey">Round {wf.round}</Chip> : null}
        {banner && <span className="inline-flex items-center gap-1.5 rounded-md border border-[#C9D3F0] bg-[#EEF1FA] px-2 py-0.5 text-[11.5px] font-semibold text-[#2F4FA8]" data-workflow-banner><Clock size={12} /> {banner}</span>}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <StepBox title="Maker" sub="Verify + Submit" state={makerState} who={wf.submitted_by} at={wf.submitted_at} />
        <Arrow />
        {/* Dua jalur sejajar (paralel), bukan berurutan */}
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-[#D9C7DA] p-2" data-workflow-lanes>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${SA_LABEL} w-[74px] shrink-0`}>Checker</span>
            <StepBox title="Checker validation" state={validationState(wf.validation?.status)} who={wf.validation?.by} at={wf.validation?.at} note={wf.validation?.note}
              active={wf.status === 'waiting_approval' && wf.validation?.status === 'pending'} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${SA_LABEL} w-[74px] shrink-0`}>Approvals</span>
            {wf.approvals.length === 0 ? <span className="text-[12px] text-[#8A7A8B] italic">Not submitted yet</span> : wf.approvals.map((a, i) => (
              <span key={a.step} className="inline-flex items-center gap-2">
                {i > 0 && <Arrow />}
                {(() => {
                  const isCur = wf.current_step?.step === a.step && wf.status === 'waiting_approval'
                  const days = isCur ? wf.current_step?.waiting_days ?? null : null
                  const late = days !== null && days >= reminderDays
                  return (
                    <StepBox title={'Approval ' + a.step} sub={a.label} state={approvalState(a.decision)} who={a.decided_by} at={a.decided_at} note={a.note} active={isCur}
                      extra={<>
                        {a.is_director && <div className="mt-1"><Chip tone="purple">Director</Chip></div>}
                        {a.mode === 'all' && <AllVotes a={a} />}
                        {isCur && days !== null && <div className={'mt-1 text-[10.5px] font-semibold ' + (late ? 'text-[#C2570C]' : 'text-[#6E5E70]')} data-waiting-days>waiting {days} day{days === 1 ? '' : 's'}</div>}
                      </>} />
                  )
                })()}
              </span>
            ))}
          </div>
        </div>
        <Arrow />
        <StepBox title="Approved" state={doneState} at={wf.approved_at} />
      </div>
    </section>
  )
}

// ─── Dialog alasan (Return to maker / Void invoice) ─────────────────────────────────────────────────────────────
export function ReasonDialog({ title, notice, label, confirmLabel, danger, initial = '', required = true, busy, error, onConfirm, onClose }: {
  title: string; notice?: string; label: string; confirmLabel: string; danger?: boolean; initial?: string; required?: boolean
  busy: boolean; error: string | null; onConfirm: (reason: string) => void; onClose: () => void
}) {
  const [reason, setReason] = useState(initial)
  return (
    <CostAgentModal title={title} z="z-[90]" maxWidth="max-w-md" onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" disabled={busy || (required && !reason.trim())} onClick={() => onConfirm(reason.trim())}
          className={danger ? 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#A8231A] hover:bg-[#8A1C14] text-white text-xs font-semibold disabled:opacity-50' : SA_BTN_PRIMARY}>{busy ? 'Working…' : confirmLabel}</button>
      </>}>
      <div className="p-5 space-y-3 text-[13px] text-[#3B1B3D]">
        {notice && <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {notice}</div>}
        <div>
          <label className={`${SA_LABEL} block mb-1`}>{label} {required ? <span className="text-[#A8231A]">*</span> : <span className="normal-case tracking-normal font-normal">(optional)</span>}</label>
          <textarea className={`${SA_INPUT} h-auto py-2`} rows={3} value={reason} maxLength={500} autoFocus onChange={e => setReason(e.target.value)} disabled={busy} />
        </div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] [overflow-wrap:anywhere]" role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

// ─── Panel checker (tab Approval) ───────────────────────────────────────────────────────────────────────────────
export function CheckerPanel({ invoiceId, wf, actor, onDone, onToast, onGateBlocked }: {
  invoiceId: number
  wf: Workflow
  actor: string | null
  onDone: (msg: string) => Promise<void> | void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onGateBlocked?: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'validate' | null>(null)
  const pending = wf.status === 'waiting_approval' && wf.validation?.status === 'pending'
  if (!pending) return null
  const can = wf.me.can_validate

  const validate = async () => {
    if (!window.confirm('Validate this invoice? Approval still follows the approval steps.')) return
    setBusy('validate')
    try {
      const r = await costAgentCheckerValidate(invoiceId, note.trim() || null, actor)
      setNote('')
      await onDone(r.status === 'approved' ? 'Validated — invoice approved.' : 'Validated.')
    } catch (e: any) {
      if (isTotalChangedError(e)) onToast('The total changed after submit, so this invoice cannot be validated. An approver can reject it to send it back to the maker.', 'warn')
      else if (isDocGateError(e)) { onToast(DOC_GATE_TOAST, 'warn'); onGateBlocked?.() }
      else onToast(e?.message || String(e), 'warn') // SoD: dan error lain: pesan server apa adanya
    } finally { setBusy(null) }
  }

  return (
    <section className={`${SA_CARD} p-4 space-y-3`} data-checker-panel>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">Checker validation</h3>
        <Chip tone="amber">Pending</Chip>
      </div>
      {can ? (
        <>
          <p className="text-[12.5px] text-[#6E5E70]">Check the cost lines (you can change a cost item, split a line or adjust tax on the Cost lines tab), then validate the invoice.</p>
          <div>
            <label className={`${SA_LABEL} block mb-1`}>Note <span className="normal-case tracking-normal font-normal">(optional)</span></label>
            <textarea className={`${SA_INPUT} h-auto py-2`} rows={2} value={note} maxLength={500} onChange={e => setNote(e.target.value)} disabled={!!busy} />
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <button type="button" className={SA_BTN_GREEN} disabled={!!busy} onClick={validate}><ShieldCheck size={13} /> {busy === 'validate' ? 'Validating…' : 'Validate'}</button>
          </div>
        </>
      ) : (
        <p className="text-[12.5px] text-[#6E5E70]" title={wf.me.blocked_reason ?? undefined}>
          {wf.me.blocked_reason ?? 'Waiting for a checker to validate this invoice.'}
        </p>
      )}
    </section>
  )
}

