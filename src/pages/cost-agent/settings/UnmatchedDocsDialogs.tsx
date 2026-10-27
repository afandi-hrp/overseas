// Dialog aksi bagian "Documents without invoice" (Dashboard hub Cost Agent Settings, 2026-10-27): Attach to invoice… dan Dismiss.
// Error RPC (Inggris) ditampilkan apa adanya DI DALAM dialog; dialog tetap terbuka.
import React, { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { CostAgentModal } from '../../../components/CostAgentUi'
import { fmtDate, fmtMoney, INVOICE_STATUS_META, type CostAgentInvoiceStatus } from '../../../utils/CostAgentHelpers'
import {
  hubAttachUnmatchedDocs, hubDismissUnmatchedDocs, hubSearchInvoicesForAttach,
  type AttachSearchRow, type UnmatchedCandidate, type UnmatchedRow,
} from './hubApi'
import { ConfirmModal, Field, errBox, useDebounced } from './hubUi'

const SEARCH_MIN = 2

// Satu pilihan invoice (radio): Invoice no, Vendor, Vessel, Date, Total, Status.
type OptionInv = UnmatchedCandidate & { currency?: string | null }
const InvoiceOption: React.FC<{ inv: OptionInv; checked: boolean; onPick: () => void; name: string }> = ({ inv, checked, onPick, name }) => {
  const meta = inv.status ? INVOICE_STATUS_META[inv.status as CostAgentInvoiceStatus] : undefined
  return (
    <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-[12.5px] ${checked ? 'border-[#6B3470] bg-[#F5EDF3]' : 'border-[#EADFD6] bg-white hover:bg-[#FBF7F4]'}`} data-attach-option={inv.id}>
      <input type="radio" name={name} className="mt-0.5 w-4 h-4 accent-[#6B3470] shrink-0" checked={checked} onChange={onPick} />
      <span className="min-w-0 flex-1 grid grid-cols-2 @min-[560px]:grid-cols-[1.2fr_1.2fr_1fr_auto] gap-x-3 gap-y-0.5">
        <span className="min-w-0"><span className="block text-[10px] uppercase tracking-[0.06em] text-[#8A7A8B]">Invoice no</span><b className="[overflow-wrap:anywhere]">{inv.invoice_no || `#${inv.id}`}</b></span>
        <span className="min-w-0"><span className="block text-[10px] uppercase tracking-[0.06em] text-[#8A7A8B]">Vendor</span><span className="[overflow-wrap:anywhere]">{inv.vendor || '—'}</span></span>
        <span className="min-w-0"><span className="block text-[10px] uppercase tracking-[0.06em] text-[#8A7A8B]">Vessel</span><span className="[overflow-wrap:anywhere]">{inv.vessel || '—'}</span></span>
        <span className="min-w-0 text-right"><span className="block text-[10px] uppercase tracking-[0.06em] text-[#8A7A8B]">Total</span><span className="tabular-nums whitespace-nowrap">{fmtMoney(inv.grand_total)}</span></span>
        <span className="col-span-2 @min-[560px]:col-span-4 flex items-center gap-2 text-[11.5px] text-[#6E5E70]">
          <span>Date {fmtDate(inv.invoice_date)}</span>
          {inv.status && <Chip tone={meta?.tone || 'grey'}>{meta?.label || inv.status}</Chip>}
        </span>
      </span>
    </label>
  )
}

export function AttachDialog({ row, onClose, onAttached }: {
  row: UnmatchedRow
  onClose: () => void
  onAttached: (invoiceId: number, invoiceNo: string | null) => void
}) {
  const candidates = row.candidates || []
  const [selected, setSelected] = useState<OptionInv | null>(null)
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 300)
  const [results, setResults] = useState<AttachSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const s = ++seq.current
    if (dq.length < SEARCH_MIN) { setResults([]); setSearching(false); setSearchError(null); return }
    setSearching(true); setSearchError(null)
    hubSearchInvoicesForAttach(dq, 20)
      .then(r => { if (s === seq.current) setResults(r) })
      .catch((e: any) => { if (s === seq.current) { setResults([]); setSearchError(e?.message || String(e)) } })
      .finally(() => { if (s === seq.current) setSearching(false) })
  }, [dq])

  const attach = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      await hubAttachUnmatchedDocs(row.id, selected.id)
      onAttached(selected.id, selected.invoice_no)
    } catch (e: any) { setError(e?.message || String(e)); setBusy(false) }
  }

  return (
    <CostAgentModal maxWidth="max-w-3xl" z="z-[90]" title="Attach to invoice" subtitle={row.email?.subject || undefined} onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={attach} disabled={busy || !selected} data-attach-confirm>{busy ? 'Working…' : 'Attach'}</button>
      </>}>
      <div className="@container p-5 space-y-4 text-[13px] text-[#3B1B3D] overflow-y-auto">
        <p className="text-[12.5px] text-[#6E5E70]">The documents are read and compared with the invoice lines. The invoice itself is not changed.</p>

        {candidates.length > 0 && (
          <div className="space-y-1.5" data-attach-suggested>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8A7A8B]">Suggested invoices</div>
            {candidates.map(c => <InvoiceOption key={c.id} inv={c} name="attach-invoice" checked={selected?.id === c.id} onPick={() => setSelected(c)} />)}
          </div>
        )}

        <div className="space-y-1.5">
          <Field label="Search another invoice" hint={`(at least ${SEARCH_MIN} characters)`}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B]" />
              <input className={`${SA_INPUT} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no, vendor or vessel" disabled={busy} data-attach-search />
            </div>
          </Field>
          {searchError && <div className={errBox} role="alert">{searchError}</div>}
          {searching && <p className="text-[12px] text-[#6E5E70]">Searching…</p>}
          {!searching && !searchError && dq.length >= SEARCH_MIN && results.length === 0 && <p className="text-[12px] text-[#6E5E70] italic">No invoice found.</p>}
          {results.length > 0 && (
            <div className={`space-y-1.5 max-h-64 overflow-y-auto ${searching ? 'opacity-60' : ''}`} data-attach-results>
              {results.map(r => <InvoiceOption key={r.id} inv={r} name="attach-invoice" checked={selected?.id === r.id} onPick={() => setSelected(r)} />)}
            </div>
          )}
        </div>

        {error && <div className={errBox} role="alert" data-attach-error>{error}</div>}
      </div>
    </CostAgentModal>
  )
}

export function DismissDialog({ row, onClose, onDismissed }: { row: UnmatchedRow; onClose: () => void; onDismissed: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true); setError(null)
    try { await hubDismissUnmatchedDocs(row.id, note.trim() || null); onDismissed() }
    catch (e: any) { setError(e?.message || String(e)); setBusy(false) }
  }
  return (
    <ConfirmModal title="Dismiss documents" confirmLabel="Dismiss" busy={busy} error={error} onClose={onClose} onConfirm={go}>
      <p className="text-[12.5px] text-[#6E5E70]">Dismissed documents stay in the list under Dismissed. Nothing is deleted.</p>
      {row.email?.subject && <p className="text-[12.5px]"><b>Subject:</b> <span className="[overflow-wrap:anywhere]">{row.email.subject}</span></p>}
      <Field label="Why are these not needed?" hint="(optional)">
        <textarea className={`${SA_INPUT} h-24 py-2 resize-none`} maxLength={500} value={note} onChange={e => setNote(e.target.value)} disabled={busy} data-dismiss-note />
      </Field>
    </ConfirmModal>
  )
}
