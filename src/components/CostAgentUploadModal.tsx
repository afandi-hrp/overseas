// Upload invoice keagenan (2026-10-13, Prompt 3; turunan BunkerUploadModal). Satu upload = SATU invoice, boleh beberapa file
// (invoice + faktur pajak + lampiran) -> file_0..n. Mode Batch = tiap file 1 invoice (request berurutan, 1 per invoice).
// Kirim proxy multipart X-Webhook-Type cost_agent, cost_agent_meta {company_code, voyage_call_id, hint} (uploaded_by diisi
// server). Respons n8n {job_id, invoice_id, mode:'invoice'} -> invoice langsung tampil di daftar sbg Processing.
import { useEffect, useMemo, useState } from 'react'
import { Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CostAgentModal, CostAgentCombobox, CostAgentFileDrop, FieldLabel, type ComboOption } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import {
  costAgentUpload, fetchCostAgentCallOptions, callOptionLabel, fmtDateTimePort,
  type CostAgentCompany, type CostAgentCallOption,
} from '../utils/CostAgentHelpers'

type SendResult = { name: string; ok: boolean; invoiceId?: number | null; error?: string }

export default function CostAgentUploadModal({ companies, defaultCompany, presetCallId, onClose, onSent }: {
  companies: CostAgentCompany[]
  defaultCompany: string
  presetCallId: number | null
  onClose: () => void
  onSent: (invoiceIds: number[]) => void
}) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [files, setFiles] = useState<File[]>([])
  const [company, setCompany] = useState(defaultCompany)
  const [callId, setCallId] = useState<number | null>(presetCallId)
  const [hint, setHint] = useState('')
  const [calls, setCalls] = useState<CostAgentCallOption[]>([])
  const [callsError, setCallsError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SendResult[] | null>(null)

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
      const preset = list.find(c => c.id === presetCallId)
      if (preset?.company_code) setCompany(prev => prev || preset.company_code!)
    })().catch(e => { if (!cancelled) setCallsError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [presetCallId])

  const callOptions: ComboOption[] = useMemo(() => calls
    .filter(c => !company || !c.company_code || c.company_code === company || c.id === callId)
    .map(c => ({
      value: c.id, label: callOptionLabel(c),
      sub: `${c.port_name} · ${fmtDateTimePort(c.arrived_at, c.port_tz)} → ${fmtDateTimePort(c.departed_at, c.port_tz)}`,
      keywords: `${c.vessel_name} ${c.voyage_no} ${c.port_code} ${c.port_name}`,
    })), [calls, company, callId])

  const send = async () => {
    if (!company) { setError('Company is required.'); return }
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setError(null); setSending(true); setProgress(0)
    const meta = { company_code: company, voyage_call_id: callId, hint: hint.trim() || null }
    const groups: File[][] = mode === 'batch' ? files.map(f => [f]) : [files]
    const out: SendResult[] = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const name = g.length === 1 ? g[0].name : `${g.length} files`
      try {
        const r = await costAgentUpload('cost_agent', g, meta)
        const invoiceId = r?.invoice_id ?? r?.data?.invoice_id ?? null
        out.push({ name, ok: true, invoiceId: invoiceId != null ? Number(invoiceId) : null })
      } catch (e: any) {
        out.push({ name, ok: false, error: e.message || String(e) })
      }
      setProgress(i + 1)
    }
    setSending(false)
    setResults(out)
    const ok = out.filter(r => r.ok)
    if (ok.length) onSent(ok.map(r => r.invoiceId).filter((x): x is number => x !== null))
  }

  const failed = results?.filter(r => !r.ok) || []
  const groupsCount = mode === 'batch' ? files.length : (files.length ? 1 : 0)

  return (
    <CostAgentModal maxWidth="max-w-2xl" onClose={() => { if (!sending) onClose() }} title="Upload agency invoice"
      subtitle="AI reads the invoice, matches the voyage and compares each cost line with history."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={sending}>{results ? 'Close' : 'Cancel'}</button>
        {!results && (
          <button type="button" className={SA_BTN_PRIMARY} onClick={send} disabled={sending || !files.length}>
            {sending ? `Sending… ${progress}/${groupsCount}` : <><Sparkles size={13} /> Process {groupsCount > 1 ? `${groupsCount} invoices` : 'invoice'} with AI</>}
          </button>
        )}
      </>}>
      <div className="p-5 space-y-4">
        {results ? (
          <div className="space-y-2">
            {results.some(r => r.ok) && (
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17663D]"><CheckCircle2 size={16} />
                {results.filter(r => r.ok).length} invoice{results.filter(r => r.ok).length > 1 ? 's' : ''} sent — shown in the list as Processing (AI).
              </div>
            )}
            {failed.length > 0 && (
              <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">
                <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle size={13} /> {failed.length} failed to send:</p>
                <ul className="list-disc pl-5">{failed.map((r, i) => <li key={i}>{r.name}: {r.error}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 w-fit" role="tablist">
              {(['single', 'batch'] as const).map(m => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={sending}
                  className={`px-3 h-[28px] rounded-full text-xs font-semibold ${mode === m ? 'bg-[#5A305A] text-white' : 'text-[#5A305A] hover:bg-slate-50'}`}>
                  {m === 'single' ? 'One invoice' : 'Batch (1 file = 1 invoice)'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel required>Company</FieldLabel>
                <select className={SA_INPUT} value={company} onChange={e => setCompany(e.target.value)} disabled={sending}>
                  <option value="">—</option>
                  {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel hint="optional — AI matches it otherwise">Voyage port call</FieldLabel>
                <CostAgentCombobox options={callOptions} value={callId} onChange={v => setCallId(v === null ? null : Number(v))} placeholder="Vessel / voy / port…" disabled={sending} />
                {callsError && <p className="text-[11px] text-[#A8231A] mt-1">Could not load port calls: {callsError}</p>}
              </div>
              <div className="sm:col-span-3">
                <FieldLabel>Note / hint</FieldLabel>
                <input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} disabled={sending} placeholder="e.g. agency fee Lhokseumawe, voy 5" />
              </div>
            </div>
            <CostAgentFileDrop files={files} onChange={setFiles} disabled={sending}
              hint={mode === 'single' ? 'All files belong to ONE invoice (invoice, tax invoice, PO, attachments).' : 'Each file is sent as a separate invoice.'} />
            {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
          </>
        )}
      </div>
    </CostAgentModal>
  )
}
