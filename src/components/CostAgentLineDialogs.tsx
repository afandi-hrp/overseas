// Dialog baris invoice Cost Agent (Tahap 2b, 2026-10-28, SQL 088): "Split line" (maker saat verification/rejected; checker saat menunggu validasi) dan
// "Line tax" (checker; fn_cost_agent_override_line_tax). Split: jumlah semua bagian HARUS sama dengan nilai baris asal, jadi total invoice tidak berubah;
// bagian yang dibuat maker perlu di-Verify ulang, bagian yang dibuat checker tetap verified.
import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import CostAgentCostItemPicker from './CostAgentCostItemPicker'
import { fmtNumber, type CostAgentCostItem, type CostAgentInvoiceLine } from '../utils/CostAgentHelpers'
import { costAgentOverrideLineTax, costAgentSplitLine, type SplitPart } from '../utils/CostAgentWorkflow'
import { clampSplitInput, splitRoom } from '../utils/CostAgentSplit'
import { fracToPct, pctToFrac } from '../pages/cost-agent/settings/financeApi'

const err = 'rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] [overflow-wrap:anywhere]'
const num = (s: string): number => { const t = s.trim().replace(/,/g, ''); return t === '' ? NaN : Number(t) }

interface PartForm { description: string; amount: string; costItemId: number | null }

export function SplitLineDialog({ line, costItems, currency, actor, mode, onClose, onSaved }: {
  line: CostAgentInvoiceLine
  costItems: CostAgentCostItem[]
  currency: string
  actor: string | null
  mode: 'maker' | 'checker'
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [parts, setParts] = useState<PartForm[]>([
    { description: line.description_raw, amount: '', costItemId: null },
    { description: '', amount: '', costItemId: null },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = Number(line.amount)
  const sum = useMemo(() => parts.reduce((a, p) => a + (Number.isFinite(num(p.amount)) ? num(p.amount) : 0), 0), [parts])
  const equal = Math.abs(sum - target) < 0.005
  const complete = parts.length >= 2 && parts.length <= 20 && parts.every(p => p.description.trim() && Number.isFinite(num(p.amount)) && num(p.amount) !== 0)
  const set = (i: number, patch: Partial<PartForm>) => setParts(ps => ps.map((p, n) => (n === i ? { ...p, ...patch } : p)))
  // Nominal dikunci: satu bagian tidak bisa melebihi sisa nilai baris (nilai baris - bagian lain); mengurangi bagian lain otomatis melonggarkan sisanya.
  const setAmount = (i: number, raw: string) => setParts(ps => ps.map((p, n) => (n === i ? { ...p, amount: clampSplitInput(raw, target, ps.filter((_, k) => k !== i).map(x => x.amount)) } : p)))
  const left = splitRoom(target, parts.map(p => p.amount))

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const payload: SplitPart[] = parts.map(p => ({ description: p.description.trim(), amount: num(p.amount), ...(p.costItemId ? { cost_item_id: p.costItemId } : {}) }))
      await costAgentSplitLine(line.id, payload, actor)
      await onSaved()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <CostAgentModal title={`Split line ${line.line_no}`} z="z-[90]" maxWidth="max-w-3xl" onClose={() => { if (!busy) onClose() }}
      subtitle={mode === 'maker' ? 'The new lines must be verified again.' : 'The new lines stay verified but must be validated again. The invoice total does not change.'}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy || !equal || !complete} title={!equal ? 'The parts must add up to the original amount' : !complete ? 'Every part needs a description and an amount' : undefined}>{busy ? 'Saving…' : 'Save split'}</button>
      </>}>
      <div className="p-5 space-y-3" data-split-dialog>
        <div className="text-[12.5px] text-[#3B1B3D]"><span className="text-[#6E5E70]">Original line:</span> <b>{line.description_raw}</b> · <b className="tabular-nums">{fmtNumber(target, 2)} {currency}</b></div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px_220px_32px] gap-2 items-end rounded-xl border border-[#EADFD6] p-2.5">
              <div><FieldLabel required>Description</FieldLabel><input className={SA_INPUT} value={p.description} maxLength={500} onChange={e => set(i, { description: e.target.value })} disabled={busy} /></div>
              <div><FieldLabel required>Amount</FieldLabel><input className={`${SA_INPUT} tabular-nums text-right`} inputMode="decimal" value={p.amount} onChange={e => setAmount(i, e.target.value)} disabled={busy} /></div>
              <div><FieldLabel>Cost item <span className="normal-case tracking-normal font-normal">(optional)</span></FieldLabel>
                <CostAgentCostItemPicker items={costItems} value={p.costItemId} disabled={busy} onChange={id => set(i, { costItemId: id })} /></div>
              <button type="button" className="h-9 w-8 inline-flex items-center justify-center rounded-lg text-[#A8231A]/80 hover:bg-[#FDE7E4] disabled:opacity-30" aria-label={`Remove part ${i + 1}`}
                disabled={busy || parts.length <= 2} onClick={() => setParts(ps => ps.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => setParts(ps => [...ps, { description: '', amount: '', costItemId: null }])} disabled={busy || parts.length >= 20}><Plus size={13} /> Add part</button>
          <Chip tone={equal ? 'green' : 'amber'}>Parts total {fmtNumber(sum, 2)} of {fmtNumber(target, 2)}{left !== null && !equal ? ` · ${fmtNumber(left, 2)} left` : ''}</Chip>
        </div>
        {error && <div className={err} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

export function LineTaxDialog({ line, onClose, onSaved }: {
  line: CostAgentInvoiceLine
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [ppn, setPpn] = useState(fracToPct(line.ppn_rate))
  const [pphType, setPphType] = useState(line.pph_type || '')
  const [pph, setPph] = useState(fracToPct(line.pph_rate))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const ppnF = pctToFrac(ppn); const pphF = pctToFrac(pph)
    if (Number.isNaN(ppnF) || Number.isNaN(pphF) || (ppnF ?? 0) < 0 || (ppnF ?? 0) > 1 || (pphF ?? 0) < 0 || (pphF ?? 0) > 1) { setError('Rates must be percentages between 0 and 100.'); return }
    if (pphF !== null && !pphType.trim()) { setError('PPh type is required (for example PPH23).'); return }
    setBusy(true); setError(null)
    try {
      await costAgentOverrideLineTax(line.id, { ppn_rate: ppnF, pph_type: pphF === null ? null : pphType.trim().toUpperCase(), pph_rate: pphF }, reason.trim())
      await onSaved()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <CostAgentModal title={`Line ${line.line_no} tax`} z="z-[90]" maxWidth="max-w-md" onClose={() => { if (!busy) onClose() }}
      subtitle="Tax is calculated on the line amount before tax."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Save tax'}</button>
      </>}>
      <div className="p-5 space-y-3" data-line-tax-dialog>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>PPN rate (%)</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={ppn} placeholder="0" onChange={e => setPpn(e.target.value)} disabled={busy} /></div>
          <div />
          <div><FieldLabel>PPh type</FieldLabel><input className={SA_INPUT} value={pphType} maxLength={20} placeholder="PPH23" onChange={e => setPphType(e.target.value)} disabled={busy} /></div>
          <div><FieldLabel>PPh rate (%)</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={pph} placeholder="0" onChange={e => setPph(e.target.value)} disabled={busy} /></div>
        </div>
        <div><FieldLabel required>Reason</FieldLabel><textarea className={`${SA_INPUT} h-auto py-2`} rows={2} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} disabled={busy} /></div>
        {error && <div className={err} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
