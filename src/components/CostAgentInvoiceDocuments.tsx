// Tab "Documents & Tax" review invoice Cost Agent (2026-10-13, Prompt 3). Dokumen susulan (faktur pajak, PO, kwitansi,
// lampiran) ke invoice yg SAMA -- proxy multipart X-Webhook-Type cost_agent, cost_agent_meta {mode:'susulan', invoice_id, hint};
// status invoice TIDAK berubah. Daftar dokumen (documents[], versi 2 / tabel cost_agent_invoice_documents) dipoll 5 dtk per
// job_id selama ada yg processing. Tabel itu BELUM ADA di sql/054 yg disalin -> fallback: info + daftar tax_checks saja.
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { CostAgentFileDrop, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_PRIMARY, SA_INPUT, SA_LABEL, SA_CARD } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import {
  costAgentUpload, fetchCostAgentDocumentsByJob, fmtDate, fmtMoney, fmtDateTimePort, DOC_TYPE_LABEL, TAX_STATUS_META,
  type CostAgentInvoiceHistory, type CostAgentInvoiceDocument,
} from '../utils/CostAgentHelpers'

const DOC_STATUS_TONE = { processing: 'blue', done: 'green', failed: 'red' } as const

export default function CostAgentInvoiceDocuments({ data, canUpload, onChanged }: {
  data: CostAgentInvoiceHistory
  canUpload: boolean
  onChanged: () => Promise<void> | void
}) {
  const inv = data.invoice
  const docs = data.documents
  const [files, setFiles] = useState<File[]>([])
  const [hint, setHint] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<{ id: string | null; docs: CostAgentInvoiceDocument[] | null; tracking: boolean } | null>(null)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  // Poll dokumen job susulan tiap 5 dtk selama ada yg processing; selesai -> muat ulang invoice.
  useEffect(() => {
    if (!job?.id || !job.tracking) return
    const iv = setInterval(async () => {
      const list = await fetchCostAgentDocumentsByJob(job.id!)
      if (list === null) { setJob(j => (j ? { ...j, tracking: false } : j)); return } // tabel belum ada
      setJob(j => (j ? { ...j, docs: list } : j))
      if (list.length && list.every(d => d.status !== 'processing')) {
        setJob(j => (j ? { ...j, tracking: false } : j))
        onChangedRef.current()
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [job?.id, job?.tracking])

  // Dokumen di data invoice yg masih processing (tanpa job lokal) -> muat ulang berkala.
  const anyProcessing = (docs || []).some(d => d.status === 'processing')
  useEffect(() => {
    if (!anyProcessing || job?.tracking) return
    const iv = setInterval(() => onChangedRef.current(), 5000)
    return () => clearInterval(iv)
  }, [anyProcessing, job?.tracking])

  const send = async () => {
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setSending(true); setError(null)
    try {
      const r = await costAgentUpload('cost_agent', files, { mode: 'susulan', invoice_id: inv.id, hint: hint.trim() || null })
      const jobId = r?.job_id ?? r?.data?.job_id ?? null
      setJob({ id: jobId ? String(jobId) : null, docs: null, tracking: !!jobId })
      setFiles([]); setHint('')
      onChanged()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSending(false)
    }
  }

  const docForTax = (taxId: number) => (docs || []).find(d => d.tax_check_id === taxId)
  const susulanNotes = (inv.check_notes || []).filter(n => n.type === 'susulan_mismatch')
  const poNumbers = inv.po_numbers || []

  return (
    <div className="p-4 space-y-4">
      {susulanNotes.map((n, i) => (
        <div key={i} className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {n.msg || n.message || 'A supporting document refers to another invoice number.'}
        </div>
      ))}

      {canUpload && (
        <section className={`${SA_CARD} p-4 space-y-3`}>
          <div>
            <h3 className="text-[14px] font-bold text-[#3B1B3D]">Upload supporting documents</h3>
            <p className="text-[12px] text-[#6E5E70]">Tax invoice (Faktur Pajak), PO, receipt, attachments — added to THIS invoice. The invoice status does not change.</p>
          </div>
          <CostAgentFileDrop files={files} onChange={setFiles} disabled={sending} />
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]"><FieldLabel>Note / hint</FieldLabel><input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} disabled={sending} placeholder="e.g. Faktur Pajak for this invoice" /></div>
            <button type="button" className={SA_BTN_PRIMARY} onClick={send} disabled={sending || !files.length}>{sending ? 'Sending…' : `Send ${files.length || ''} document${files.length === 1 ? '' : 's'}`}</button>
          </div>
          {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
          {job && (
            <div className="rounded-lg border border-[#C9D3F0] bg-[#EEF1FA] px-3 py-2 text-[12.5px] text-[#2F4FA8] flex items-start gap-2">
              {job.tracking ? <LoadingSpinner className="shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
              <span className="flex-1">
                {job.tracking ? 'AI is reading the documents…' : job.docs?.length ? 'Documents processed.' : 'Documents sent to the automation server. Refresh this invoice in a moment to see the result.'}
                {job.docs && job.docs.length > 0 && <span className="block mt-1">{job.docs.map(d => `${d.file_name || 'file'}: ${d.status}`).join(' · ')}</span>}
              </span>
              {!job.tracking && <button type="button" aria-label="Dismiss" onClick={() => setJob(null)}><X size={13} /></button>}
            </div>
          )}
        </section>
      )}

      <section>
        <div className={`${SA_LABEL} mb-1.5`}>PO numbers</div>
        {poNumbers.length ? <div className="flex flex-wrap gap-1.5">{poNumbers.map(p => <Chip key={p} tone="plum">{p}</Chip>)}</div>
          : <p className="text-[12px] text-[#8A7A8B] italic">{inv.po_numbers === undefined ? 'PO numbers need the updated database (v2).' : 'No PO number found yet.'}</p>}
      </section>

      <section>
        <div className={`${SA_LABEL} mb-1.5`}>Documents</div>
        {docs === undefined ? (
          <p className="text-[12px] text-[#8A7A8B] italic">Document tracking needs the updated database (table cost_agent_invoice_documents). Files of this invoice:</p>
        ) : docs.length === 0 ? <p className="text-[12px] text-[#8A7A8B] italic">No documents yet.</p> : (
          <div className="space-y-1.5">
            {docs.map(d => (
              <div key={d.id} className="rounded-lg border border-[#EADFD6] px-3 py-2 text-[12.5px]">
                <div className="flex items-center gap-2 flex-wrap">
                  {d.file_url ? <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-1">{d.file_name || 'File'} <ExternalLink size={11} /></a>
                    : <span className="font-semibold text-[#3B1B3D]">{d.file_name || 'File'}</span>}
                  <Chip tone="grey">{DOC_TYPE_LABEL[d.doc_type] || d.doc_type}</Chip>
                  <Chip tone={DOC_STATUS_TONE[d.status] || 'grey'}>{d.status === 'processing' ? 'Processing' : d.status === 'done' ? 'Done' : 'Failed'}</Chip>
                  {d.mode === 'susulan' && <Chip tone="purple">Supporting</Chip>}
                  <span className="ml-auto text-[11px] text-[#8A7A8B]">{d.uploaded_by || '—'} · {fmtDateTimePort(d.created_at, null)}</span>
                </div>
                {d.extracted?.summary && <p className="text-[12px] text-[#6E5E70] mt-1">{String(d.extracted.summary)}</p>}
                {d.status === 'failed' && d.error_message && <p className="text-[12px] text-[#A8231A] mt-1">{d.error_message}</p>}
              </div>
            ))}
          </div>
        )}
        {docs === undefined && (inv.files || []).length > 0 && (
          <ul className="mt-1 space-y-1">
            {inv.files.map((f, i) => <li key={i}>{f.file_url ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-[#6B3470] hover:underline inline-flex items-center gap-1">{f.file_name || `File ${i + 1}`} <ExternalLink size={11} /></a> : <span className="text-[12.5px]">{f.file_name}</span>}</li>)}
          </ul>
        )}
      </section>

      <section>
        <div className={`${SA_LABEL} mb-1.5`}>Tax invoice checks</div>
        {data.tax_checks.length === 0 ? <p className="text-[12px] text-[#8A7A8B] italic">No tax invoice checked yet.</p> : (
          <div className="space-y-2.5">
            {data.tax_checks.map(t => {
              const meta = TAX_STATUS_META[t.status]
              const doc = docForTax(t.id)
              const url = doc?.file_url || t.file_url
              return (
                <div key={t.id} className={`${SA_CARD} p-3`}>
                  <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                    <Chip tone={meta?.tone || 'grey'}>{meta?.label || t.status}</Chip>
                    <b className="text-[#3B1B3D]">{t.fp_number || 'No FP number'}</b>
                    <span className="text-[#6E5E70]">{fmtDate(t.fp_date)}</span>
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-[#6B3470] hover:underline inline-flex items-center gap-1 text-[12px]">{doc?.file_name || t.file_name || 'Document'} <ExternalLink size={11} /></a>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[12px]">
                    <div><div className={SA_LABEL}>Seller</div><div className="text-[#3B1B3D]">{t.seller_name || '—'}</div><div className="text-[#6E5E70] tabular-nums">{t.seller_npwp || ''}</div></div>
                    <div><div className={SA_LABEL}>Buyer</div><div className="text-[#3B1B3D]">{t.buyer_name || '—'}</div><div className="text-[#6E5E70] tabular-nums">{t.buyer_npwp || ''}</div></div>
                    <div><div className={SA_LABEL}>DPP</div><div className="text-[#3B1B3D] tabular-nums">{fmtMoney(t.dpp)}</div></div>
                    <div><div className={SA_LABEL}>VAT</div><div className="text-[#3B1B3D] tabular-nums">{fmtMoney(t.ppn)}</div></div>
                  </div>
                  {t.error_message && <p className="text-[12px] text-[#A8231A] mt-2">{t.error_message}</p>}
                  {(t.check_results || []).length > 0 && (
                    <table className="w-full mt-2 text-[12px]">
                      <thead><tr className="text-left">{['Field', 'Expected', 'Actual', ''].map(h => <th key={h} className={`${SA_LABEL} pb-1`}>{h}</th>)}</tr></thead>
                      <tbody>
                        {t.check_results.map((c, i) => (
                          <tr key={i} className="border-t border-[#F3EEEA]">
                            <td className="py-1 text-[#3B1B3D]">{c.field}</td>
                            <td className="py-1 text-[#6E5E70]">{String(c.expected ?? '—')}</td>
                            <td className="py-1 text-[#6E5E70]">{String(c.actual ?? '—')}</td>
                            <td className="py-1">{c.ok ? <Chip tone="green">OK</Chip> : <Chip tone="red">Mismatch</Chip>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
