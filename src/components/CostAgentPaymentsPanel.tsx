// Tab "Payments" review invoice Cost Agent (2026-10-13, Prompt 5): daftar payments[] (AP Note / PV, doc no, status, waktu,
// respons bila gagal) + "Resend" (status failed / submitted = belum terposting) -> proxy JSON cost_agent_payment {request_id}.
// "Mark as paid" (status journal & canEdit('cost_agent_payment')): tanggal bayar + referensi bank -> fn_cost_agent_mark_paid.
// TANPA upload bukti bayar (keputusan owner). Semua aksi tulis butuh canEdit('cost_agent_payment').
import { useState } from 'react'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_GREEN, SA_CARD, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import {
  costAgentJsonAction, costAgentMarkPaid, fmtMoney, fmtDate, fmtDateTimePort, PAYMENT_STATUS_META,
  type CostAgentInvoiceHistory,
} from '../utils/CostAgentHelpers'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CostAgentPaymentsPanel({ data, canPay, actor, onChanged }: {
  data: CostAgentInvoiceHistory
  canPay: boolean
  actor: string | null
  onChanged: (msg?: string) => Promise<void> | void
}) {
  const inv = data.invoice
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paidAt, setPaidAt] = useState(todayIso())
  const [paidRef, setPaidRef] = useState('')
  const [paying, setPaying] = useState(false)

  const resend = async (requestId: number) => {
    setBusyId(requestId); setError(null)
    try {
      await costAgentJsonAction('cost_agent_payment', { request_id: requestId })
      await onChanged(`Request #${requestId} sent to Finance again.`)
    } catch (e: any) { setError(e.message || String(e)) } finally { setBusyId(null) }
  }
  const markPaid = async () => {
    if (!paidAt) { setError('Paid date is required.'); return }
    if (paidRef.trim().length < 3) { setError('Bank reference is required.'); return }
    if (!window.confirm(`Mark invoice ${inv.invoice_no || '#' + inv.id} as paid on ${fmtDate(paidAt)}?`)) return
    setPaying(true); setError(null)
    try {
      await costAgentMarkPaid(inv.id, paidAt, paidRef.trim(), actor)
      setPaidRef('')
      await onChanged('Invoice marked as paid.')
    } catch (e: any) { setError(e.message || String(e)) } finally { setPaying(false) }
  }

  return (
    <div className="p-4 space-y-4">
      {canPay && inv.status === 'journal' && (
        <section className={`${SA_CARD} p-4 space-y-3`}>
          <h3 className="text-[14px] font-bold text-[#3B1B3D]">Mark as paid</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
            <div><FieldLabel required>Paid date</FieldLabel><input type="date" className={SA_INPUT} value={paidAt} max={todayIso()} onChange={e => setPaidAt(e.target.value)} disabled={paying} /></div>
            <div><FieldLabel required>Bank reference</FieldLabel><input className={SA_INPUT} value={paidRef} onChange={e => setPaidRef(e.target.value)} placeholder="Transfer / bank statement reference" disabled={paying} /></div>
            <button type="button" className={SA_BTN_GREEN} onClick={markPaid} disabled={paying}>{paying ? 'Saving…' : 'Mark as paid'}</button>
          </div>
        </section>
      )}

      {inv.status === 'paid' && (
        <div className="rounded-lg border border-[#BFE3CC] bg-[#EAF6EF] px-3 py-2 text-[12.5px] text-[#17663D]">Paid on {fmtDate(inv.paid_at)}{inv.paid_ref ? ` · ref ${inv.paid_ref}` : ''}.</div>
      )}
      {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}

      <section>
        <div className={`${SA_LABEL} mb-1.5`}>Payment documents</div>
        {data.payments.length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">No AP Note / PV yet.</p> : (
          <div className="space-y-2">
            {data.payments.map(p => {
              const meta = PAYMENT_STATUS_META[p.status]
              const canResend = canPay && (p.status === 'failed' || p.status === 'submitted')
              return (
                <div key={p.id} className={`${SA_CARD} p-3`}>
                  <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                    <Chip tone="plum">{p.doc_type === 'PV' ? 'PV' : 'AP Note'}</Chip>
                    <b className="text-[#3B1B3D]">{p.doc_no || `Request #${p.id}`}</b>
                    <Chip tone={meta?.tone || 'grey'}>{meta?.label || p.status}</Chip>
                    <span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtMoney(p.amount)}</span>
                    {p.pph_amount ? <span className="text-[#6E5E70]">WHT {fmtMoney(p.pph_amount)}</span> : null}
                    <span className="ml-auto text-[11.5px] text-[#8A7A8B]">{p.created_by || '—'} · {fmtDateTimePort(p.created_at, null)}{p.posted_at ? ` · posted ${fmtDateTimePort(p.posted_at, null)}` : ''}</span>
                    {canResend && <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} disabled={busyId === p.id} onClick={() => resend(p.id)}><RotateCcw size={12} /> {busyId === p.id ? 'Sending…' : 'Resend'}</button>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[12px]">
                    <div><div className={SA_LABEL}>Due date</div>{fmtDate(p.due_date)}</div>
                    <div><div className={SA_LABEL}>Bank</div>{p.bank_name || '—'}</div>
                    <div className="md:col-span-2"><div className={SA_LABEL}>Account</div>{[p.bank_account_name, p.bank_account_no].filter(Boolean).join(' · ') || '—'}</div>
                    {p.description && <div className="col-span-2 md:col-span-4"><div className={SA_LABEL}>Description</div>{p.description}</div>}
                  </div>
                  {p.status === 'failed' && p.response != null && (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-[#FDE7E4] text-[#A8231A] text-[11px] p-2 whitespace-pre-wrap break-words">{typeof p.response === 'string' ? p.response : JSON.stringify(p.response, null, 2)}</pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
