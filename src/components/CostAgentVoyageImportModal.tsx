// Import Excel voyage Cost Agent (2026-10-13, Prompt 2). Template: public/templates/template_import_voyage.xlsx
// (sheet "Voyage": baris 1 = nama kolom sistem, baris 2 = judul -> dibuang, data mulai baris 3; 1 baris = 1 port call).
// Parse SheetJS -> groupFlatVoyageRows (CostAgentVoyageImport.ts, logika SAMA node n8n) -> preview -> RPC
// fn_cost_agent_upsert_voyages(rows, 'import') per 50 voyage. Error per voyage tidak menggagalkan voyage lain.
import { useRef, useState } from 'react'
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CostAgentModal } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_LABEL, Chip } from './SeaAirAuditUi'
import { groupFlatVoyageRows, toLocalTimestamp, type VoyageInput } from '../utils/CostAgentVoyageImport'
import { costAgentUpsertVoyages, fmtNumber, fmtReportMonth, type CostAgentUpsertVoyagesResult } from '../utils/CostAgentHelpers'

const BATCH = 50
let xlsxPromise: Promise<typeof import('xlsx')> | null = null
const loadXlsx = () => (xlsxPromise ??= import('xlsx'))

// Bulan laporan dari Excel bisa "2026-09-01" / "2026-09" / "1-Sep-26" -> "YYYY-MM-01" (server meng-cast ::date).
function normalizeReportMonth(v: string | null | undefined): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  const ts = toLocalTimestamp(s)
  return ts && /^\d{4}-\d{2}/.test(ts) ? `${ts.slice(0, 7)}-01` : s
}

export default function CostAgentVoyageImportModal({ actor, onClose, onImported }: {
  actor: string | null
  onClose: () => void
  onImported: (saved: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [voyages, setVoyages] = useState<VoyageInput[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<CostAgentUpsertVoyagesResult | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setParseError(null); setResult(null); setVoyages([]); setProblems([])
    if (!/\.(xlsx|xls)$/i.test(f.name)) { setParseError('Use an Excel file (.xlsx / .xls).'); return }
    setFileName(f.name)
    try {
      const XLSX = await loadXlsx()
      const wb = XLSX.read(await f.arrayBuffer())
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'voyage') || wb.SheetNames[0]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { range: 0, raw: false, defval: '' }).slice(1)
      const g = groupFlatVoyageRows(rows)
      setVoyages(g.voyages.map(v => ({ ...v, report_month: normalizeReportMonth(v.report_month) })))
      setProblems(g.problems)
      if (!g.voyages.length) setParseError('No voyage rows found. Check that the data starts on row 3 of the "Voyage" sheet.')
    } catch (e: any) {
      setParseError(`Could not read the file: ${e.message || e}`)
    }
  }

  const doImport = async () => {
    if (!voyages.length || importing) return
    setImporting(true); setProgress(0)
    const total: CostAgentUpsertVoyagesResult = { saved: 0, voyages: [], errors: [] }
    try {
      for (let i = 0; i < voyages.length; i += BATCH) {
        const chunk = voyages.slice(i, i + BATCH)
        try {
          const r = await costAgentUpsertVoyages(chunk, actor)
          total.saved += r.saved || 0
          total.voyages.push(...(r.voyages || []))
          total.errors.push(...(r.errors || []))
        } catch (e: any) {
          chunk.forEach(v => total.errors.push({ voyage_no: v.voyage_no, vessel: v.vessel_name ?? null, external_ref: v.external_ref ?? null, error: e.message || String(e) }))
        }
        setProgress(Math.min(voyages.length, i + BATCH))
      }
    } finally {
      setImporting(false)
      setResult(total)
      if (total.saved > 0) onImported(total.saved)
    }
  }

  const footer = (
    <>
      <a href="/templates/template_import_voyage.xlsx" download className={SA_BTN_OUTLINE}><Download size={13} /> Download Template</a>
      <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={importing}>{result ? 'Close' : 'Cancel'}</button>
      {!result && (
        <button type="button" className={SA_BTN_PRIMARY} onClick={doImport} disabled={!voyages.length || importing}>
          {importing ? `Importing… ${progress}/${voyages.length}` : `Import ${voyages.length || ''} voyage${voyages.length === 1 ? '' : 's'}`}
        </button>
      )}
    </>
  )

  return (
    <CostAgentModal maxWidth="max-w-4xl" onClose={() => { if (!importing) onClose() }} title="Import voyages from Excel"
      subtitle="1 row = 1 port call. Rows with the same Vessel + Voy No + Report Month become one voyage." footer={footer}>
      <div className="p-5 space-y-4">
        <div onClick={() => !importing && inputRef.current?.click()}
          className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer border-[#EADFD6] bg-[#FBF7F4] hover:border-[#6B3470]/40">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          <FileSpreadsheet size={26} className="mx-auto text-[#6B3470] mb-2" />
          <p className="text-sm font-semibold text-[#3B1B3D]">{fileName || 'Click to choose an Excel file'}</p>
          <p className="text-[12px] text-[#6E5E70] mt-0.5">Use the template — times in port local time (LT), cargo as columns cargo_&lt;PRODUCT&gt;.</p>
        </div>

        {parseError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{parseError}</div>}

        {problems.length > 0 && (
          <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#7A4F00]">
            <p className="font-bold flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {problems.length} row problem{problems.length > 1 ? 's' : ''} (skipped)</p>
            <ul className="list-disc pl-5 max-h-28 overflow-y-auto">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17663D]"><CheckCircle2 size={16} /> {result.saved} voyage{result.saved === 1 ? '' : 's'} saved.</div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A]">
                <p className="font-bold mb-1">{result.errors.length} voyage{result.errors.length > 1 ? 's' : ''} failed:</p>
                <ul className="list-disc pl-5 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>{[e.vessel, e.voyage_no ? `Voy ${e.voyage_no}` : null].filter(Boolean).join(' · ')}: {e.error}</li>)}
                </ul>
              </div>
            )}
            {result.voyages.some(v => v.warnings?.length) && (
              <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#7A4F00]">
                <p className="font-bold mb-1">Time order warnings:</p>
                <ul className="list-disc pl-5 max-h-32 overflow-y-auto">
                  {result.voyages.filter(v => v.warnings?.length).map(v => <li key={v.voyage_id}>Voy {v.voyage_no}: {v.warnings!.map(w => `#${w.seq} ${w.field}`).join(', ')}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {voyages.length > 0 && !result && (
          <div>
            <div className={`${SA_LABEL} mb-1.5`}>Preview · {voyages.length} voyage{voyages.length > 1 ? 's' : ''}</div>
            <div className="border border-[#EADFD6] rounded-xl overflow-hidden max-h-[360px] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-[#FBF7F4] sticky top-0">
                  <tr className="text-left">
                    {['Vessel', 'Voy', 'Month', 'Route', 'Ports', 'Cargo'].map(h => <th key={h} className={`${SA_LABEL} px-3 py-2`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {voyages.map((v, i) => (
                    <tr key={i} className="border-t border-[#F3EEEA] align-top">
                      <td className="px-3 py-1.5 font-semibold text-[#3B1B3D]">{v.vessel_name}</td>
                      <td className="px-3 py-1.5">{v.voyage_no}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtReportMonth(v.report_month)}</td>
                      <td className="px-3 py-1.5 text-[#3B1B3D]">{v.calls.map(c => c.port).join(' → ')}</td>
                      <td className="px-3 py-1.5"><Chip tone="grey">{v.calls.length}</Chip></td>
                      <td className="px-3 py-1.5 text-[#6E5E70]">{v.cargo.length ? v.cargo.map(g => `${g.product} ${fmtNumber(g.qty, 3)} ${g.unit || 'L15'}`).join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
