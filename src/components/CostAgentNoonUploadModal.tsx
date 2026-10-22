// Upload Noon Report (2026-10-22). Excel Noon Report (Jakarta) dibaca KODE di n8n (bukan AI): proxy multipart X-Webhook-Type
// cost_agent_noon, file_0.. + cost_agent_meta {company_code?} (uploaded_by diisi server). Voyage tersimpan DRAFT (input_source
// 'noon_report'), semua jam & cargo kosong. Hasil: ringkasan, tabel port call, warnings (kuning), errors (merah), notes, dan
// "Skipped days" (collapsible). Teks dari server (Indonesia) ditampilkan APA ADANYA -- jangan diterjemahkan.
import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import {
  costAgentUpload, fmtDate, fmtFileSize, ACTIVITY_LABEL, VOYAGE_STATUS_META,
  type CostAgentCompany, type CostAgentNoonUploadResult, type CostAgentActivity, type CostAgentVoyageStatus,
} from '../utils/CostAgentHelpers'

const NOON_EXT = /\.(xlsx|xlsm)$/i
const MAX_FILE_BYTES = 50 * 1024 * 1024
const textOf = (x: unknown): string => (typeof x === 'string' ? x : (x as any)?.msg || (x as any)?.message || '')
const errorLine = (e: any): string => (typeof e === 'string' ? e
  : [e?.voyage_no ? `Voy ${e.voyage_no}` : null, e?.doc_no, e?.port, e?.error || e?.message].filter(Boolean).join(' · '))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function CostAgentNoonUploadModal({ companies, defaultCompany, onClose, onDone }: {
  companies: CostAgentCompany[]
  defaultCompany: string
  onClose: () => void
  onDone: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sendingRef = useRef(false)
  const [files, setFiles] = useState<File[]>([])
  const [company, setCompany] = useState(defaultCompany)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string[]>([])
  const [result, setResult] = useState<CostAgentNoonUploadResult | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const bad: string[] = []
    const ok = Array.from(list).filter(f => {
      if (!NOON_EXT.test(f.name)) { bad.push(`${f.name}: only .xlsx / .xlsm files are accepted`); return false }
      if (f.size > MAX_FILE_BYTES) { bad.push(`${f.name}: larger than 50 MB`); return false }
      return true
    })
    setRejected(bad)
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + '_' + f.size))
      return [...prev, ...ok.filter(f => !seen.has(f.name + '_' + f.size))]
    })
  }

  const run = async () => {
    if (sendingRef.current) return // cegah klik ganda
    if (!files.length) { setError('Choose at least 1 file.'); return }
    sendingRef.current = true
    setBusy(true); setError(null)
    try {
      const r: CostAgentNoonUploadResult = await costAgentUpload('cost_agent_noon', files, company ? { company_code: company } : {})
      if (r?.ok === false) throw new Error(textOf((r as any).error) || 'The Noon Report could not be processed.')
      setResult(r)
      if (Number(r?.saved ?? 0) > 0) onDone()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  const saved = Number(result?.saved ?? 0)
  const daysSaved = Number(result?.days_saved ?? result?.ai?.summary?.saved_days ?? 0)
  const skippedList = (result?.ai?.skipped || []).filter(s => s && (s.date || s.reason))
  const skippedDays = Number(result?.skipped_days ?? result?.ai?.summary?.skipped_days ?? skippedList.length)
  const warnings = [
    ...(result?.voyages || []).flatMap(v => (v.warnings || []).map(w => ({
      w: textOf(w), ctx: [v.vessel_name, v.voyage_no ? `Voy ${v.voyage_no}` : null].filter(Boolean).join(' · '),
    }))),
    ...(result?.ai?.warnings || []).map(w => ({ w: textOf(w), ctx: '' })),
  ].filter(x => x.w)
  const errors = (result?.errors || []).map(errorLine).filter(Boolean)
  const notes = (result?.notes || []).map(textOf).filter(Boolean)

  return (
    <CostAgentModal maxWidth="max-w-3xl" onClose={() => { if (!busy) onClose() }} title="Upload Noon Report"
      subtitle="Noon Report Excel (.xlsx / .xlsm). Loading and discharge days are saved as DRAFT voyages for you to check and confirm."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</button>
        {!result && (
          <button type="button" className={SA_BTN_PRIMARY} onClick={run} disabled={busy || !files.length}>
            {busy ? 'Reading Noon Report…' : <><UploadCloud size={13} /> Upload</>}
          </button>
        )}
      </>}>
      <div className="p-5 space-y-3">
        {busy && (
          <div className="rounded-2xl border border-[#EADFD6] bg-[#FBF7F4] px-5 py-6 text-center" role="status" aria-live="polite" data-noon-wait>
            <div className="mx-auto w-12 h-12 rounded-full bg-[#5A305A] text-white flex items-center justify-center shadow-sm"><FileSpreadsheet size={22} className="animate-pulse" /></div>
            <p className="mt-3 text-sm font-bold text-[#3B1B3D]">Reading the Noon Report…</p>
            <p className="text-[11.5px] text-[#6E5E70] mt-0.5">{plural(files.length, 'file')} · please keep this window open</p>
            <div className="mt-4 h-1.5 rounded-full bg-[#EADFD6] overflow-hidden"><div className="h-full w-2/5 rounded-full bg-[#6B3470]" style={{ animation: 'ca-indeterminate 1.4s ease-in-out infinite' }} /></div>
          </div>
        )}

        {!result && !busy && (
          <>
            <div className="w-1/2 min-w-[180px]">
              <FieldLabel hint="optional">Company</FieldLabel>
              <select className={SA_INPUT} value={company} onChange={e => setCompany(e.target.value)}>
                <option value="">—</option>
                {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer border-[#EADFD6] bg-[#FBF7F4] hover:border-[#6B3470]/40">
              <input ref={inputRef} type="file" multiple accept=".xlsx,.xlsm" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              <UploadCloud size={24} className="mx-auto text-[#6B3470] mb-1.5" />
              <p className="text-sm font-semibold text-[#3B1B3D]">Click or drag &amp; drop (.xlsx, .xlsm)</p>
            </div>
            {rejected.length > 0 && (
              <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A]">
                <p className="font-bold mb-0.5">Not added:</p>
                <ul className="list-disc pl-5">{rejected.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={f.name + i} className="flex items-center gap-2 rounded-lg border border-[#EADFD6] px-3 py-1.5 text-[12px]">
                    <FileSpreadsheet size={14} className="text-[#17663D]" />
                    <span className="truncate flex-1 text-[#3B1B3D]">{f.name}</span>
                    <span className="text-[#8A7A8B]">{fmtFileSize(f.size)}</span>
                    <button type="button" aria-label="Remove file" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}

        {result && (
          <div className="space-y-3">
            {saved > 0 ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17663D]">
                <CheckCircle2 size={16} /> {plural(saved, 'port call')}, {plural(daysSaved, 'day')} saved, {plural(skippedDays, 'day')} skipped.
              </div>
            ) : (
              <div className="rounded-lg border border-[#C9D6F2] bg-[#EEF3FD] px-3 py-2 text-[12.5px] text-[#2F4FA8] flex items-start gap-1.5">
                <Info size={14} className="mt-0.5 shrink-0" /> No loading/discharge days found in this file.
              </div>
            )}

            {saved > 0 && (result.voyages || []).length > 0 && (
              <div className="rounded-lg border border-[#EADFD6] overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#FBF7F4]">
                    <tr className="text-left">
                      {['Vessel', 'Voy', 'Port call', 'Activity', 'Days', 'Status'].map(h => (
                        <th key={h} className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.voyages || []).map((v, i) => (
                      <tr key={i} className="border-t border-[#F3EEEA] text-[#3B1B3D]">
                        <td className="px-2.5 py-1.5 font-semibold">{v.vessel_name || '—'}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{v.voyage_no || '—'}{v.created_voyage && <span className="ml-1.5"><Chip tone="green">New voyage</Chip></span>}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{v.seq != null ? `#${v.seq}` : '—'}</td>
                        <td className="px-2.5 py-1.5">{v.activity ? (ACTIVITY_LABEL[v.activity as CostAgentActivity] || v.activity) : '—'}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{v.days ?? '—'}</td>
                        <td className="px-2.5 py-1.5">{v.status ? (VOYAGE_STATUS_META[v.status as CostAgentVoyageStatus]?.label || v.status) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#7A4F00]">
                <p className="font-bold mb-0.5 flex items-center gap-1.5"><AlertTriangle size={13} /> Warnings ({warnings.length})</p>
                <ul className="list-disc pl-5 max-h-40 overflow-y-auto">{warnings.map((x, i) => <li key={i}>{x.ctx ? `${x.ctx}: ` : ''}{x.w}</li>)}</ul>
              </div>
            )}
            {errors.length > 0 && (
              <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A]">
                <p className="font-bold mb-0.5 flex items-center gap-1.5"><AlertTriangle size={13} /> Errors ({errors.length})</p>
                <ul className="list-disc pl-5 max-h-40 overflow-y-auto">{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {notes.length > 0 && (
              <div className="rounded-lg border border-[#C9D6F2] bg-[#EEF3FD] px-3 py-2 text-[12px] text-[#2F4FA8]">
                <p className="font-bold mb-0.5 flex items-center gap-1.5"><Info size={13} /> Notes</p>
                <ul className="list-disc pl-5 max-h-40 overflow-y-auto">{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {skippedList.length > 0 && (
              <div className="rounded-lg border border-[#EADFD6]">
                <button type="button" onClick={() => setShowSkipped(v => !v)} aria-expanded={showSkipped}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-[#3B1B3D] hover:bg-[#FBF7F4]">
                  {showSkipped ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Skipped days ({skippedList.length})
                </button>
                {showSkipped && (
                  <ul className="border-t border-[#F3EEEA] px-3 py-2 text-[12px] text-[#3B1B3D] space-y-0.5 max-h-48 overflow-y-auto">
                    {skippedList.map((s, i) => <li key={i}><b className="tabular-nums">{s.date ? fmtDate(s.date) : '—'}</b> — {s.reason || '—'}</li>)}
                  </ul>
                )}
              </div>
            )}
            {saved > 0 && <p className="text-[12px] text-[#6E5E70]">The list now shows Draft voyages — open each one, check it, then click <b>Confirm</b>.</p>}
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
