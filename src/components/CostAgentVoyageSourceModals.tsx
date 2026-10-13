// Ambil voyage dari luar (2026-10-13, Prompt 2):
// - Pull from source system: POST /api/n8n-proxy-json (X-Webhook-Type cost_agent_voyage_pull) {date_from, date_to, vessel_name}
//   -> respons {saved, errors[]} (n8n yg menyimpan voyage source='api').
// - Read Voyage Report (AI): upload PDF/foto laporan via proxy multipart (X-Webhook-Type cost_agent_voyage,
//   cost_agent_meta {company_code, hint}) -> voyage tersimpan sbg DRAFT; ai.cargo_total_match=false -> peringatan.
// Bentuk respons n8n dibaca longgar (field opsional) -- kontrak final di workflow n8n.
import { useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import { costAgentJsonAction, costAgentUpload, type CostAgentCompany, type CostAgentVessel } from '../utils/CostAgentHelpers'

const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const errorsOf = (r: any): string[] =>
  (Array.isArray(r?.errors) ? r.errors : []).map((e: any) => (typeof e === 'string' ? e : [e?.vessel, e?.voyage_no ? `Voy ${e.voyage_no}` : null, e?.error || e?.message].filter(Boolean).join(' · ')))

export function CostAgentVoyagePullModal({ vessels, onClose, onDone }: {
  vessels: CostAgentVessel[]
  onClose: () => void
  onDone: () => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [vesselName, setVesselName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ saved: number; errors: string[] } | null>(null)

  const run = async () => {
    if (!from || !to) { setError('Date from and date to are required.'); return }
    if (to < from) { setError('Date to must be on or after date from.'); return }
    setBusy(true); setError(null)
    try {
      const r = await costAgentJsonAction('cost_agent_voyage_pull', { date_from: from, date_to: to, vessel_name: vesselName || null })
      setResult({ saved: Number(r?.saved ?? r?.data?.saved ?? 0), errors: errorsOf(r?.errors ? r : r?.data) })
      onDone()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CostAgentModal maxWidth="max-w-lg" onClose={() => { if (!busy) onClose() }} title="Pull voyages from source system"
      subtitle="Voyages are fetched by the automation server and saved with source API."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</button>
        {!result && <button type="button" className={SA_BTN_PRIMARY} onClick={run} disabled={busy}>{busy ? 'Pulling…' : 'Pull voyages'}</button>}
      </>}>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel required>Date from</FieldLabel><input type="date" className={SA_INPUT} value={from} onChange={e => setFrom(e.target.value)} disabled={busy || !!result} /></div>
          <div><FieldLabel required>Date to</FieldLabel><input type="date" className={SA_INPUT} value={to} onChange={e => setTo(e.target.value)} disabled={busy || !!result} /></div>
        </div>
        <div>
          <FieldLabel>Vessel</FieldLabel>
          <select className={SA_INPUT} value={vesselName} onChange={e => setVesselName(e.target.value)} disabled={busy || !!result}>
            <option value="">All vessels</option>
            {vessels.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
        </div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17663D]"><CheckCircle2 size={16} /> {result.saved} voyage{result.saved === 1 ? '' : 's'} saved.</div>
            {result.errors.length > 0 && (
              <ul className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A] list-disc pl-7 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}

export function CostAgentVoyageAiModal({ companies, defaultCompany, onClose, onDone }: {
  companies: CostAgentCompany[]
  defaultCompany: string
  onClose: () => void
  onDone: (voyageIds: number[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [company, setCompany] = useState(defaultCompany)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ voyages: { id: number | null; label: string }[]; cargoMismatch: boolean; message?: string } | null>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const ok = Array.from(list).filter(f => ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(f.type))
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + '_' + f.size))
      return [...prev, ...ok.filter(f => !seen.has(f.name + '_' + f.size))]
    })
  }

  const run = async () => {
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setBusy(true); setError(null)
    try {
      const r = await costAgentUpload('cost_agent_voyage', files, { company_code: company || null, hint: hint.trim() || null })
      const list: any[] = Array.isArray(r?.voyages) ? r.voyages : Array.isArray(r?.data?.voyages) ? r.data.voyages : []
      const voyages = list.map(v => ({
        id: v?.voyage_id != null ? Number(v.voyage_id) : v?.id != null ? Number(v.id) : null,
        label: [v?.vessel_name || v?.vessel, v?.voyage_no ? `Voy ${v.voyage_no}` : null].filter(Boolean).join(' · ') || 'Voyage',
      }))
      const ai = r?.ai ?? r?.data?.ai
      setResult({ voyages, cargoMismatch: ai?.cargo_total_match === false, message: r?.pesan || r?.message })
      onDone(voyages.map(v => v.id).filter((x): x is number => x !== null))
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CostAgentModal maxWidth="max-w-xl" onClose={() => { if (!busy) onClose() }} title="Read Voyage Report (AI)"
      subtitle="Upload the monthly Voyage Report (PDF/photo). Voyages read by AI are saved as DRAFT for you to check and confirm."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</button>
        {!result && <button type="button" className={SA_BTN_PRIMARY} onClick={run} disabled={busy || !files.length}>{busy ? 'AI is reading the report…' : <><Sparkles size={13} /> Read with AI</>}</button>}
      </>}>
      <div className="p-5 space-y-3">
        {!result && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Company</FieldLabel>
                <select className={SA_INPUT} value={company} onChange={e => setCompany(e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Hint</FieldLabel>
                <input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} placeholder="e.g. MT. EXPO, Sep 2026" disabled={busy} />
              </div>
            </div>
            <div onClick={() => !busy && inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer border-[#EADFD6] bg-[#FBF7F4] hover:border-[#6B3470]/40">
              <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              <UploadCloud size={24} className="mx-auto text-[#6B3470] mb-1.5" />
              <p className="text-sm font-semibold text-[#3B1B3D]">Click or drag & drop (PDF, JPG, PNG)</p>
            </div>
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={f.name + i} className="flex items-center gap-2 rounded-lg border border-[#EADFD6] px-3 py-1.5 text-[12px]">
                    <FileText size={14} className="text-[#A8231A]" />
                    <span className="truncate flex-1 text-[#3B1B3D]">{f.name}</span>
                    <span className="text-[#8A7A8B]">{fileSize(f.size)}</span>
                    <button type="button" aria-label="Remove file" disabled={busy} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17663D]"><CheckCircle2 size={16} /> {result.voyages.length ? `${result.voyages.length} draft voyage${result.voyages.length > 1 ? 's' : ''} saved.` : (result.message || 'Report sent to the automation server.')}</div>
            {result.cargoMismatch && (
              <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Cargo total differs from report — check the cargo of each draft before confirming.
              </div>
            )}
            {result.voyages.length > 0 && <ul className="list-disc pl-5 text-[12.5px] text-[#3B1B3D]">{result.voyages.map((v, i) => <li key={i}>{v.label}</li>)}</ul>}
            <p className="text-[12px] text-[#6E5E70]">The list now shows Draft voyages — open each one, check it, then click <b>Confirm</b>.</p>
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
