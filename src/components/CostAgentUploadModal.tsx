// Upload invoice keagenan (2026-10-13, Prompt 3; direvisi 2026-10-23 sql/071-072). SATU request multipart berisi SEMUA file (invoice + lampiran + faktur pajak,
// boleh digabung dalam satu atau beberapa file): n8n mendeteksi 1 atau BANYAK invoice & memecahnya otomatis, dan PT (company) ditentukan dari master kapal --
// jadi TIDAK ada lagi pilihan Single/Batch maupun Company. Proxy X-Webhook-Type cost_agent, cost_agent_meta {voyage_call_id?, hint?} (uploaded_by diisi server).
// Balasan n8n {job_id, invoice_id, mode}: halaman pemanggil melacak job-nya (`onJob`, polling 5 dtk) -- lihat CostAgentInvoicePage / CostAgentUploadResultDialog.
// Pemanggil lama (halaman Voyages) cukup memakai `onSent(invoiceIds)`; prop `companies`/`defaultCompany` dipertahankan (opsional, DIABAIKAN) agar pemanggil itu tetap kompatibel.
import { useEffect, useMemo, useState } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { CostAgentModal, CostAgentCombobox, CostAgentFileDrop, FieldLabel, type ComboOption } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import {
  costAgentUpload, fetchCostAgentCallOptions, callOptionLabel, fmtDateTimePort,
  type CostAgentCompany, type CostAgentCallOption,
} from '../utils/CostAgentHelpers'

export type CostAgentUploadJob = { jobId: string; invoiceId: number | null }

export default function CostAgentUploadModal({ presetCallId, onClose, onSent, onJob }: {
  companies?: CostAgentCompany[] // tidak dipakai lagi (PT otomatis dari master kapal) -- dipertahankan utk kompatibilitas pemanggil lama
  defaultCompany?: string // idem
  presetCallId: number | null
  onClose: () => void
  onSent: (invoiceIds: number[]) => void
  // Ada = pemanggil melacak hasil job (polling) dan `onSent` TIDAK dipanggil.
  onJob?: (job: CostAgentUploadJob) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [callId, setCallId] = useState<number | null>(presetCallId)
  const [hint, setHint] = useState('')
  const [calls, setCalls] = useState<CostAgentCallOption[]>([])
  const [callsError, setCallsError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Port call terbaru (+ port call preset dari drawer voyage bila tidak ada di daftar).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const recent = await fetchCostAgentCallOptions({ limit: 400 })
      let list = recent
      if (presetCallId && !recent.some(c => c.id === presetCallId)) {
        const extra = await fetchCostAgentCallOptions({ ids: [presetCallId] })
        list = [...extra, ...recent]
      }
      if (cancelled) return
      setCalls(list)
    })().catch(e => { if (!cancelled) setCallsError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [presetCallId])

  const callOptions: ComboOption[] = useMemo(() => calls.map(c => ({
    value: c.id, label: callOptionLabel(c),
    sub: `${c.port_name} · ${fmtDateTimePort(c.arrived_at, c.port_tz)} → ${fmtDateTimePort(c.departed_at, c.port_tz)}`,
    keywords: `${c.vessel_name} ${c.voyage_no} ${c.port_code} ${c.port_name}`,
  })), [calls])

  const send = async () => {
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setError(null); setSending(true)
    try {
      // Tanpa company_code / mode utk invoice baru (sistem mendeteksi jumlah invoice & PT dari kapal).
      const r = await costAgentUpload('cost_agent', files, { voyage_call_id: callId, hint: hint.trim() || null })
      const jobId = r?.job_id ?? r?.data?.job_id ?? null
      const invoiceRaw = r?.invoice_id ?? r?.data?.invoice_id ?? null
      const invoiceId = invoiceRaw != null ? Number(invoiceRaw) : null
      if (onJob && jobId) onJob({ jobId: String(jobId), invoiceId })
      else onSent(invoiceId !== null ? [invoiceId] : [])
      onClose()
    } catch (e: any) {
      setError(e.message || String(e))
      setSending(false)
    }
  }

  return (
    <CostAgentModal maxWidth="max-w-2xl" onClose={() => { if (!sending) onClose() }} title="Upload agency invoice"
      subtitle="AI reads the documents, detects the invoices, matches the voyage and compares each cost line with history."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={sending}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={send} disabled={sending || !files.length}>
          {sending ? 'Sending…' : <><Sparkles size={13} /> Process with AI</>}
        </button>
      </>}>
      <div className="p-5 space-y-4">
        <p className="text-[12.5px] text-[#6E5E70]" data-upload-help>
          Upload everything you have. The system detects how many invoices there are and the company from the vessel.
        </p>
        <CostAgentFileDrop files={files} onChange={setFiles} disabled={sending}
          hint="Invoices, attachments and tax invoices (Faktur Pajak) can be mixed in one or several files." />
        <div className="grid grid-cols-1 gap-3">
          <div>
            <FieldLabel hint="optional — AI matches it otherwise">Voyage port call</FieldLabel>
            <CostAgentCombobox options={callOptions} value={callId} onChange={v => setCallId(v === null ? null : Number(v))} placeholder="Vessel / voy / port…" disabled={sending} />
            {callsError && <p className="text-[11px] text-[#A8231A] mt-1">Could not load port calls: {callsError}</p>}
          </div>
          <div>
            <FieldLabel hint="optional">Note / hint</FieldLabel>
            <input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} disabled={sending} placeholder="e.g. agency fee Lhokseumawe, voy 5" />
          </div>
        </div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</div>}
      </div>
    </CostAgentModal>
  )
}
