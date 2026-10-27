// Bagian "Documents without invoice" di tab Dashboard hub Cost Agent Settings (2026-10-27) -- tepat di atas "Pipeline".
// Faktur pajak / lampiran yang masuk lewat email tanpa invoice: dilampirkan otomatis bila yakin, sisanya menunggu di sini.
// Baca = akses halaman; Attach / Dismiss hanya bila ctx.editable (server juga menolak lewat guard RPC). Dialog di UnmatchedDocsDialogs.tsx.
// Data: fn_cost_agent_list_unmatched_docs(status, 100). pending_count dilaporkan ke shell (ctx.setPendingDocs) utk badge tab Dashboard.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Paperclip, RefreshCw } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD } from '../../../components/SeaAirAuditUi'
import { LoadingState } from '../../../components/LoadingState'
import { fmtDate, fmtDateTimePort, fmtMoney, notifyCostAgentApprovalsChanged } from '../../../utils/CostAgentHelpers'
import { hubListUnmatchedDocs, type UnmatchedDocument, type UnmatchedFilter, type UnmatchedRow } from './hubApi'
import { ErrorBox, ICON_BTN, SectionTitle, TD, TH, useAsync, type HubCtx } from './hubUi'
import { AttachDialog, DismissDialog } from './UnmatchedDocsDialogs'

const STATUS_CHIPS: { key: UnmatchedFilter; label: string }[] = [
  { key: 'pending', label: 'Waiting' }, { key: 'attached', label: 'Attached' }, { key: 'dismissed', label: 'Dismissed' }, { key: 'all', label: 'All' },
]
const REASON_LABEL: Record<string, string> = {
  subject_number_not_found: 'Invoice number in the subject was not found',
  ambiguous: 'More than one invoice fits',
  not_identified: 'Could not tell which invoice it belongs to',
}
const DOC_TYPE_LABEL: Record<string, string> = {
  faktur_pajak: 'Tax invoice', nota_pelabuhan: 'Port note', pranota: 'Pre-invoice', pnbp: 'PNBP', kwitansi: 'Receipt',
  vendor_statement: 'Vendor statement', surat: 'Letter', po: 'PO', lainnya: 'Other', invoice: 'Invoice',
}
const FILES_SHOWN = 2

// URL file berasal dari email (tidak tepercaya): hanya http(s) yang dijadikan tautan.
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null)

function docTooltip(d: UnmatchedDocument): string {
  const parts = [
    d.doc_date ? `Date: ${fmtDate(d.doc_date)}` : '',
    d.issuer_name ? `Issuer: ${d.issuer_name}` : '',
    d.total_amount != null && d.total_amount !== '' ? `Total: ${fmtMoney(d.total_amount)}` : '',
    d.invoice_ref ? `Invoice ref: ${d.invoice_ref}` : '',
  ].filter(Boolean)
  return parts.join('\n') || 'No further details'
}

export default function UnmatchedDocsSection({ ctx }: { ctx: HubCtx }) {
  const [status, setStatus] = useState<UnmatchedFilter>('pending')
  const { data, loading, error, reload } = useAsync(() => hubListUnmatchedDocs(status, 100), [status])
  const [attachRow, setAttachRow] = useState<UnmatchedRow | null>(null)
  const [dismissRow, setDismissRow] = useState<UnmatchedRow | null>(null)

  // Badge tab Dashboard ikut jumlah pending terbaru (hanya setelah RPC berhasil dimuat).
  const pending = data?.pending_count
  const { setPendingDocs } = ctx
  useEffect(() => { if (pending !== undefined) setPendingDocs(pending) }, [pending, setPendingDocs])

  const rows = data?.rows || []

  const attached = (invoiceId: number, invoiceNo: string | null) => {
    setAttachRow(null)
    ctx.toast(<>Documents attached to invoice <Link to={`/cost-agent/invoice/${invoiceId}`} className="font-bold underline">{invoiceNo || `#${invoiceId}`}</Link></>)
    notifyCostAgentApprovalsChanged() // daftar Agency Invoices yang terbuka memuat ulang (tidak ada cache query terpisah)
    reload()
  }

  return (
    <section className={`${SA_CARD} p-4`} data-unmatched-docs>
      <SectionTitle
        hint={<>Tax invoices and attachments that arrived by email without an invoice. The system attaches them automatically when it is sure which invoice they belong to; the rest wait here.{' '}
          <span className="text-[#8A7A8B]">Tip: put the invoice number in the email subject (for example: Susulan 8310003433) so it attaches by itself.</span></>}
        right={(
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex p-0.5 rounded-lg bg-[#F5EDF3]" role="tablist" aria-label="Status">
              {STATUS_CHIPS.map(c => (
                <button key={c.key} type="button" role="tab" aria-selected={status === c.key} onClick={() => setStatus(c.key)}
                  className={`px-2.5 h-6 rounded-md text-[11px] font-bold ${status === c.key ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D]'}`}>{c.label}</button>
              ))}
            </div>
            <button type="button" className={ICON_BTN} onClick={reload} disabled={loading} aria-label="Refresh documents" title="Refresh"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        )}>
        <Paperclip size={14} className="text-[#6B3470]" /> Documents without invoice
        {pending ? <span className="px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10.5px] font-bold tabular-nums">{pending}</span> : null}
      </SectionTitle>

      {error ? <ErrorBox message={error} onRetry={reload} />
        : loading && !data ? <LoadingState fullHeight={false} />
        : rows.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-[#F3FAF6] border border-[#CFE8DA] px-3 py-2 text-[12.5px] text-[#17663D]" data-unmatched-empty>
            <CheckCircle2 size={15} className="shrink-0" />
            {status === 'pending' ? 'Nothing waiting. Supporting documents sent by email are attached automatically.' : 'No documents in this list.'}
          </p>
        ) : (
          <div className={`overflow-x-auto rounded-lg border border-[#EADFD6] ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full" data-unmatched-table>
              <thead><tr>{['Received', 'From', 'Subject', 'Files', 'Documents', 'Why it is waiting', 'Actions'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => {
                  const files = r.files || []
                  const docs = r.documents || []
                  const handledInvoice = r.attached_invoice_id != null
                    ? ((r.candidates || []).find(c => c.id === r.attached_invoice_id)?.invoice_no || `#${r.attached_invoice_id}`) : null
                  return (
                    <tr key={r.id} className="border-t border-[#F3EEEA]" data-unmatched-row={r.id}>
                      <td className={`${TD} whitespace-nowrap`}>{fmtDateTimePort(r.created_at, null, false)}</td>
                      <td className={`${TD} max-w-[200px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]" title={r.email?.sender || ''}>{r.email?.sender || '—'}</span></td>
                      <td className={`${TD} max-w-[260px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]" title={r.email?.subject || ''}>{r.email?.subject || '—'}</span></td>
                      <td className={`${TD} max-w-[220px]`}>
                        {files.length === 0 ? '—' : (
                          <div className="flex flex-col gap-0.5">
                            {files.slice(0, FILES_SHOWN).map((f, i) => {
                              const url = safeUrl(f.file_url)
                              const name = f.file_name || `File ${i + 1}`
                              return url
                                ? <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-[#6B3470] hover:underline" title={name}>{name}</a>
                                : <span key={i} className="truncate" title={name}>{name}</span>
                            })}
                            {files.length > FILES_SHOWN && (
                              <span className="text-[11px] text-[#6E5E70]" title={files.slice(FILES_SHOWN).map(f => f.file_name || '').filter(Boolean).join('\n')}>+{files.length - FILES_SHOWN}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${TD} max-w-[280px]`}>
                        {docs.length === 0 ? '—' : (
                          <div className="flex flex-wrap gap-1">
                            {docs.map((d, i) => (
                              <Chip key={i} tone="plum" title={docTooltip(d)}>{(d.doc_type && DOC_TYPE_LABEL[d.doc_type]) || d.doc_type || 'Document'}{d.doc_no ? ` ${d.doc_no}` : ''}</Chip>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={`${TD} max-w-[200px]`}>{r.reason ? (REASON_LABEL[r.reason] || r.reason) : '—'}</td>
                      <td className={`${TD} min-w-[150px]`}>
                        {r.status === 'pending' ? (
                          ctx.editable ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button type="button" className={`${SA_BTN_PRIMARY} h-7 px-2.5`} onClick={() => setAttachRow(r)} data-unmatched-attach>Attach to invoice…</button>
                              <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} onClick={() => setDismissRow(r)} data-unmatched-dismiss>Dismiss</button>
                            </div>
                          ) : <span className="text-[#8A7A8B]">—</span>
                        ) : (
                          <div className="text-[12px] space-y-0.5" data-unmatched-handled>
                            <div className="font-semibold">
                              {r.status === 'attached'
                                ? <>Attached to <Link to={`/cost-agent/invoice/${r.attached_invoice_id}`} className="text-[#6B3470] hover:underline">{handledInvoice}</Link></>
                                : 'Dismissed'}
                            </div>
                            <div className="text-[#6E5E70]">by {r.handled_by || '—'} on {fmtDateTimePort(r.handled_at, null, false)}</div>
                            {r.note && <div className="text-[#3B1B3D] [overflow-wrap:anywhere]">{r.note}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {attachRow && <AttachDialog row={attachRow} onClose={() => setAttachRow(null)} onAttached={attached} />}
      {dismissRow && <DismissDialog row={dismissRow} onClose={() => setDismissRow(null)} onDismissed={() => { setDismissRow(null); ctx.toast('Documents dismissed'); reload() }} />}
    </section>
  )
}
