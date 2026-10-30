// Dialog "Link document…" (SQL 109, 2026-10-30): user menautkan SENDIRI sebuah baris invoice ke item lampiran / faktur pajak bila sistem tidak menemukan pasangannya.
// Kandidat diurutkan SERVER dari yang paling dekat (nominal, nominal + PPN, kemiripan uraian) -- urutan TIDAK diubah di sini. Tautan tidak mengubah nominal baris; selisih tetap terlihat.
// Satu sisi per simpan (maks. 20 item), alasan wajib. Pesan error server ditampilkan apa adanya. Tidak ada yang disimpan di browser.
import { useEffect, useMemo, useState } from 'react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import { fmtDate, fmtMoney, fmtNumber, DOC_TYPE_LABEL, type DocCmpLine } from '../utils/CostAgentHelpers'
import { costAgentLineLinkCandidates, costAgentLinkLineItems, costAgentUnlinkLineItems } from '../utils/CostAgentWorkflow'
import {
  MAX_LINK_ITEMS, defaultLinkSide, initialSelection, itemsOfSide, linkFormError, nearGap, toggleItem, unlinkFormError, vatPctText,
  type EvidenceSide, type LinkCandidates, type LinkSelection,
} from '../utils/CostAgentLinkLogic'

const err = 'rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] [overflow-wrap:anywhere]'
const SIDE_LABEL: Record<EvidenceSide, string> = { attachment: 'Attachments', tax: 'Tax invoice' }
const signedMoney = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n === 0 ? '0' : `${n > 0 ? '+' : '−'}${fmtNumber(Math.abs(n), 0)}`)

export default function CostAgentLinkDocumentDialog({ line, onClose, onChanged, onToast }: {
  line: DocCmpLine
  onClose: () => void
  onChanged: () => Promise<void> | void // muat ulang data dokumen + baris (status baris, "Not in invoice", total pajak ikut berubah)
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [cand, setCand] = useState<LinkCandidates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [side, setSide] = useState<EvidenceSide>(() => defaultLinkSide(line))
  const [sel, setSel] = useState<LinkSelection>({ side: defaultLinkSide(line), ids: [] })
  const [includesVat, setIncludesVat] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    costAgentLineLinkCandidates(line.line_id)
      .then(c => {
        if (!alive) return
        setCand(c)
        const cur = c.current?.[side] ?? null
        setSel(initialSelection(cur, side)); setIncludesVat(cur?.manual?.incl === true)
      })
      .catch(e => { if (alive) setLoadError(e?.message || String(e)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kandidat dibaca SEKALI per dialog; pindah sisi ditangani switchSide
  }, [line.line_id])

  const current = cand?.current?.[side] ?? null
  const linked = current?.status === 'manual'
  const rows = useMemo(() => itemsOfSide(cand?.items, side), [cand, side])
  const vatPct = vatPctText(cand?.line.vat_rate_used)
  const selectionError = linkFormError(sel, reason)

  const switchSide = (s: EvidenceSide) => {
    if (busy || s === side) return
    const cur = cand?.current?.[s] ?? null
    setSide(s); setSel(initialSelection(cur, s)); setIncludesVat(cur?.manual?.incl === true); setError(null)
  }

  const save = async () => {
    if (selectionError) { setError(selectionError); return }
    setBusy(true); setError(null)
    try {
      const r = await costAgentLinkLineItems(line.line_id, sel.side, sel.ids, reason.trim(), includesVat)
      await onChanged()
      onToast('Document linked.')
      if (r.validation_reset) onToast('The checker validation of this line was cleared because its evidence changed', 'warn')
      onClose()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const unlink = async () => {
    const m = unlinkFormError(reason)
    if (m) { setError(m); return }
    setBusy(true); setError(null)
    try {
      const r = await costAgentUnlinkLineItems(line.line_id, side, reason.trim())
      await onChanged()
      onToast(r.unlinked > 0 ? 'Link removed.' : 'There was no manual link to remove.')
      onClose()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <CostAgentModal title={`Link document · line ${line.line_no}`} z="z-[90]" maxWidth="max-w-4xl" onClose={() => { if (!busy) onClose() }}
      subtitle="Choose the document item(s) that belong to this line. The line amount does not change; the difference stays visible."
      footer={<>
        {linked && <button type="button" className={`${SA_BTN_OUTLINE} mr-auto text-[#A8231A]`} onClick={unlink} disabled={busy || !reason.trim()} data-unlink title={!reason.trim() ? 'Write the reason first' : undefined}>Remove link</button>}
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy || !cand || !!selectionError} title={selectionError ?? undefined} data-save-link>{busy ? 'Saving…' : 'Save link'}</button>
      </>}>
      <div className="p-5 space-y-3" data-link-dialog>
        {loadError && <div className={err} role="alert">{loadError}</div>}
        {!cand && !loadError && <LoadingState fullHeight={false} />}
        {cand && (
          <>
            <div className="text-[12.5px] text-[#3B1B3D] [overflow-wrap:anywhere]">
              <span className="text-[#6E5E70]">Line {cand.line.line_no}:</span> <b>{cand.line.description || '—'}</b> · <b className="tabular-nums">{fmtMoney(cand.line.amount)}</b>
            </div>
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Document side">
              {(['attachment', 'tax'] as EvidenceSide[]).map(s => (
                <button key={s} type="button" role="tab" aria-selected={side === s} data-link-side={s} onClick={() => switchSide(s)} disabled={busy}
                  className={`h-8 px-3 rounded-full text-[12px] font-bold border ${side === s ? 'bg-[#6B3470] text-white border-[#6B3470]' : 'bg-white text-[#6E5E70] border-[#E4D3E2] hover:bg-[#F5EDF3]'}`}>
                  {SIDE_LABEL[s]} <span className="font-normal opacity-80">({itemsOfSide(cand.items, s).length})</span>
                  {cand.current?.[s]?.status === 'manual' && <span className="ml-1.5 text-[10.5px] font-bold">· linked</span>}
                </button>
              ))}
              <span className="ml-auto text-[11.5px] text-[#6E5E70] tabular-nums">{sel.ids.length} of {MAX_LINK_ITEMS} selected</span>
            </div>
            <div className="rounded-xl border border-[#EADFD6] overflow-auto max-h-[22rem]">
              <table className="w-full min-w-[720px] text-[12px]" data-link-items>
                <thead className="sticky top-0 bg-[#F5EDF3] z-10">
                  <tr className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B3470]">
                    <th className="w-9 px-2 py-2" aria-label="Select" /><th className="px-2 py-2 text-left">Document</th><th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-right">Gap</th><th className="px-2 py-2 text-right">Gap incl. VAT</th><th className="px-2 py-2 text-right">Similarity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-[#8A7A8B]">No {SIDE_LABEL[side].toLowerCase()} items to choose from.</td></tr>}
                  {rows.map(i => {
                    const on = sel.side === side && sel.ids.includes(i.item_id)
                    const doc = [DOC_TYPE_LABEL[i.doc_type as keyof typeof DOC_TYPE_LABEL] || i.doc_type, i.doc_no].filter(Boolean).join(' · ') || 'Document'
                    return (
                      <tr key={i.item_id} data-link-item={i.item_id} className={`border-t border-[#F3EEEA] cursor-pointer ${on ? 'bg-[#F5EDF3]' : 'hover:bg-[#FBF7F4]'}`} onClick={() => { if (!busy) setSel(s => toggleItem(s, side, i.item_id)) }}>
                        <td className="px-2 py-2 text-center"><input type="checkbox" className="accent-[#6B3470]" checked={on} disabled={busy || (!on && sel.side === side && sel.ids.length >= MAX_LINK_ITEMS)} onChange={() => setSel(s => toggleItem(s, side, i.item_id))} onClick={e => e.stopPropagation()} aria-label={`Select ${doc}`} /></td>
                        <td className="px-2 py-2 align-top">
                          <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{doc}</div>
                          <div className="text-[11px] text-[#8A7A8B]">{[i.doc_date ? fmtDate(i.doc_date) : null, i.group_name, i.kind].filter(Boolean).join(' · ')}</div>
                          <div className="mt-0.5 flex gap-1 flex-wrap">
                            {i.linked_manually && <Chip tone="blue">Linked to this line</Chip>}
                            {i.matched_line_no != null && <Chip tone="grey" title="You can still select it">Already used by line {i.matched_line_no}</Chip>}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top text-[#3B1B3D] [overflow-wrap:anywhere]">{i.description || '—'}</td>
                        <td className="px-2 py-2 align-top text-right tabular-nums whitespace-nowrap font-semibold">{fmtMoney(i.amount)}</td>
                        <td className="px-2 py-2 align-top text-right tabular-nums whitespace-nowrap text-[#6E5E70]">{signedMoney(i.gap)}</td>
                        <td className={`px-2 py-2 align-top text-right tabular-nums whitespace-nowrap font-semibold ${nearGap(i.gap_with_vat) ? 'text-[#17663D]' : 'text-[#6E5E70]'}`} data-near={nearGap(i.gap_with_vat) ? 'true' : 'false'}>{signedMoney(i.gap_with_vat)}</td>
                        <td className="px-2 py-2 align-top text-right tabular-nums text-[#6E5E70]">{i.similarity == null ? '—' : fmtNumber(Number(i.similarity), 2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D] cursor-pointer select-none">
              <input type="checkbox" className="accent-[#6B3470]" checked={includesVat} onChange={e => setIncludesVat(e.target.checked)} disabled={busy} data-incl-vat />
              Amount includes VAT (item + {vatPct || 'VAT'})
            </label>
            <div><FieldLabel required>Reason</FieldLabel><textarea className={`${SA_INPUT} h-auto py-2`} rows={2} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} disabled={busy} data-link-reason /></div>
          </>
        )}
        {error && <div className={err} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
