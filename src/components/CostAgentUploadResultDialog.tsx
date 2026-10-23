// Pelacak hasil upload invoice keagenan (2026-10-23, sql/071-072). Setelah n8n membalas {job_id, invoice_id}, hook ini polling tiap 5 dtk (maks 10 menit) ke
// cost_agent_invoice_documents (job_id) + status invoice-nya sampai TIDAK ada dokumen 'processing' dan TIDAK ada invoice 'processing'. Hasil:
//  - 1 invoice  -> toast "Invoice ready for review" + invoice dibuka;
//  - >1 invoice -> toast "N invoices detected from this upload" + dialog kecil (nomor invoice / vendor / total / status, link ke masing2);
//  - ada yang gagal -> error_message ditampilkan (dialog / toast peringatan).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CostAgentModal, StatusChip } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY } from './SeaAirAuditUi'
import { fetchCostAgentJobSnapshot, fmtMoney, type CostAgentInvoiceStatus } from '../utils/CostAgentHelpers'

const POLL_MS = 5000
const MAX_MS = 10 * 60 * 1000

type TrackedJob = { jobId: string; invoiceIds: number[]; startedAt: number }
export type DetectedInvoice = { id: number; invoice_no: string | null; vendor_name: string | null; grand_total: number | null; status: CostAgentInvoiceStatus; error?: string | null }
type ResultState = { invoices: DetectedInvoice[]; errors: string[] }

export function useCostAgentUploadTracker({ onToast, onOpenInvoice, onRefresh }: {
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onOpenInvoice: (id: number) => void
  onRefresh: () => void
}) {
  const [jobs, setJobs] = useState<TrackedJob[]>([])
  const [result, setResult] = useState<ResultState | null>(null)
  const cb = useRef({ onToast, onOpenInvoice, onRefresh })
  cb.current = { onToast, onOpenInvoice, onRefresh }
  const busy = useRef(false)

  const track = useCallback((job: { jobId: string; invoiceId: number | null }) => {
    setJobs(prev => (prev.some(j => j.jobId === job.jobId) ? prev : [...prev, { jobId: job.jobId, invoiceIds: job.invoiceId != null ? [job.invoiceId] : [], startedAt: Date.now() }]))
    cb.current.onToast('Documents received — reading…')
  }, [])

  const finish = useCallback(async (job: TrackedJob, ids: number[], docErrors: string[]) => {
    let rows: DetectedInvoice[] = []
    if (ids.length) {
      const { data } = await supabase.from('cost_agent_invoice_list_v').select('id, invoice_no, vendor_name, grand_total, status, error_message').in('id', ids)
      rows = (data || []).map((r: any) => ({ id: Number(r.id), invoice_no: r.invoice_no ?? null, vendor_name: r.vendor_name ?? null, grand_total: r.grand_total ?? null, status: r.status, error: r.error_message ?? null }))
        .sort((a, b) => a.id - b.id)
    }
    const errors = [...docErrors, ...rows.filter(r => r.status === 'failed' && r.error).map(r => String(r.error))]
    cb.current.onRefresh()
    if (rows.length > 1) {
      cb.current.onToast(`${rows.length} invoices detected from this upload`, errors.length ? 'warn' : 'ok')
      setResult({ invoices: rows, errors })
    } else if (rows.length === 1 && rows[0].status !== 'failed' && !errors.length) {
      cb.current.onToast('Invoice ready for review')
      cb.current.onOpenInvoice(rows[0].id)
    } else {
      cb.current.onToast(errors[0] || 'The documents could not be read.', 'warn')
      if (rows.length || errors.length) setResult({ invoices: rows, errors })
    }
    setJobs(prev => prev.filter(j => j.jobId !== job.jobId))
  }, [])

  useEffect(() => {
    if (!jobs.length) return
    const iv = setInterval(async () => {
      if (busy.current) return
      busy.current = true
      try {
        for (const job of jobs) {
          if (Date.now() - job.startedAt > MAX_MS) {
            cb.current.onToast('Still reading — check the invoice list again in a few minutes.', 'warn')
            setJobs(prev => prev.filter(j => j.jobId !== job.jobId))
            continue
          }
          try {
            const snap = await fetchCostAgentJobSnapshot(job.jobId, job.invoiceIds)
            if (snap.invoiceIds.length !== job.invoiceIds.length) job.invoiceIds = snap.invoiceIds
            if (snap.done) {
              const docErrors = snap.docs.filter(d => d.status === 'failed' && d.error_message).map(d => `${d.file_name || 'File'}: ${d.error_message}`)
              await finish(job, snap.invoiceIds, docErrors)
            }
          } catch (e) { console.warn('[CostAgent] pelacakan upload gagal sementara', e) }
        }
      } finally { busy.current = false }
    }, POLL_MS)
    return () => clearInterval(iv)
  }, [jobs, finish])

  const dialog = result ? (
    <CostAgentUploadResultDialog result={result} onClose={() => setResult(null)} onOpen={id => { setResult(null); cb.current.onOpenInvoice(id) }} />
  ) : null
  return { track, dialog, tracking: jobs.length > 0 }
}

function CostAgentUploadResultDialog({ result, onClose, onOpen }: { result: ResultState; onClose: () => void; onOpen: (id: number) => void }) {
  const n = result.invoices.length
  return (
    <CostAgentModal z="z-[75]" maxWidth="max-w-xl" onClose={onClose}
      title={n > 1 ? `${n} invoices detected from this upload` : 'Upload result'}
      subtitle={n > 1 ? 'The system split the documents into separate invoices. Open each one to review it.' : undefined}
      footer={<button type="button" className={SA_BTN_PRIMARY} onClick={onClose}>Close</button>}>
      <div className="p-5 space-y-3" data-upload-result>
        {n > 0 && (
          <div className="rounded-lg border border-[#EADFD6] overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-[#FBF7F4]"><tr className="text-left">{['Invoice no.', 'Vendor', 'Total', 'Status', ''].map(h => <th key={h} className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {result.invoices.map(r => (
                  <tr key={r.id} className="border-t border-[#F3EEEA] text-[#3B1B3D]">
                    <td className="px-2.5 py-2 font-semibold">{r.invoice_no || `#${r.id}`}</td>
                    <td className="px-2.5 py-2">{r.vendor_name || '—'}</td>
                    <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{fmtMoney(r.grand_total)}</td>
                    <td className="px-2.5 py-2"><StatusChip status={r.status} /></td>
                    <td className="px-2.5 py-2 text-right"><button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} onClick={() => onOpen(r.id)}>Open <ExternalLink size={11} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.errors.length > 0 && (
          <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">
            <p className="font-bold mb-0.5 flex items-center gap-1.5"><AlertTriangle size={13} /> Some documents could not be read</p>
            <ul className="list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
