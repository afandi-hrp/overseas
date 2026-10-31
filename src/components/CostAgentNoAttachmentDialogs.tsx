// Dialog "No attachment for this vendor" (SQL 112, 2026-10-31): maker / checker mengonfirmasi bahwa vendor + jenis biaya sebuah baris memang tidak pernah mengirim lampiran, dan
// dialog kecil untuk mencabut konfirmasi itu (juga dipakai di Settings > Vendors > "Vendors without attachments"). Siapa yang boleh = keputusan server (can_confirm_none, revoke);
// pesan error RPC ditampilkan apa adanya. Tidak ada yang disimpan di browser.
import { useState } from 'react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import { costAgentConfirmNoAttachment, costAgentRevokeNoAttachment, type DocCmpLine, type NoAttachConfirmResult } from '../utils/CostAgentHelpers'
import { CONFIRM_TITLE, NO_ATT_NOTE_MAX, confirmBody, noteError, reasonError } from '../utils/CostAgentNoAttachLogic'

const ERR = 'rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] [overflow-wrap:anywhere]'

export function ConfirmNoAttachmentDialog({ line, vendorName, onClose, onDone }: {
  line: Pick<DocCmpLine, 'line_id' | 'line_no' | 'cost_item'>; vendorName: string | null | undefined; onClose: () => void; onDone: (r: NoAttachConfirmResult) => void | Promise<void>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const e = noteError(note)
    if (e) { setError(e); return }
    setBusy(true); setError(null)
    try { await onDone(await costAgentConfirmNoAttachment(line.line_id, note.trim())) }
    catch (x: any) { setError(x?.message || String(x)); setBusy(false) }
  }
  return (
    <CostAgentModal z="z-[90]" maxWidth="max-w-lg" title={CONFIRM_TITLE} onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy} data-confirm-none>{busy ? 'Saving…' : 'Confirm'}</button>
      </>}>
      <div className="p-5 space-y-3 text-[13px] text-[#3B1B3D]" data-no-attachment-dialog>
        <p className="[overflow-wrap:anywhere]">{confirmBody(vendorName, line.cost_item)}</p>
        <div>
          <FieldLabel required hint={`${note.trim().length}/${NO_ATT_NOTE_MAX}`}>Note (why is there no attachment?)</FieldLabel>
          <textarea className={`${SA_INPUT} !h-auto py-1.5 leading-snug resize-y`} rows={3} maxLength={NO_ATT_NOTE_MAX} value={note} autoFocus disabled={busy} onChange={e => setNote(e.target.value)} />
        </div>
        {error && <div className={ERR} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

export function RevokeNoAttachmentDialog({ ruleId, what, onClose, onDone }: {
  ruleId: number; what?: string | null; onClose: () => void; onDone: () => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const e = reasonError(reason)
    if (e) { setError(e); return }
    setBusy(true); setError(null)
    try { await costAgentRevokeNoAttachment(ruleId, reason.trim()); await onDone() }
    catch (x: any) { setError(x?.message || String(x)); setBusy(false) }
  }
  return (
    <CostAgentModal z="z-[90]" maxWidth="max-w-md" title="Revoke confirmation" onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#A8231A] hover:bg-[#8A1C14] text-white text-xs font-semibold disabled:opacity-50" onClick={save} disabled={busy} data-revoke-none>{busy ? 'Working…' : 'Revoke'}</button>
      </>}>
      <div className="p-5 space-y-3 text-[13px] text-[#3B1B3D]" data-revoke-dialog>
        <p className="[overflow-wrap:anywhere]">{what ? <>Stop treating <b>{what}</b> as "no attachment"? </> : null}Later invoices will be checked for an attachment as usual.</p>
        <div>
          <FieldLabel required hint={`${reason.trim().length}/${NO_ATT_NOTE_MAX}`}>Reason</FieldLabel>
          <textarea className={`${SA_INPUT} !h-auto py-1.5 leading-snug resize-y`} rows={3} maxLength={NO_ATT_NOTE_MAX} value={reason} autoFocus disabled={busy} onChange={e => setReason(e.target.value)} />
        </div>
        {error && <div className={ERR} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
