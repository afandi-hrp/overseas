// Modal "Full comparison" tab Documents & Tax (Tahap 3c, 2026-10-28): SEMUA rincian yang sebelumnya bertumpuk di tab -- Period check, tampilan lama
// (TANPA tabel per baris -- tabel itu kini langsung di tab; accordion Header checks / Dates / Tax totals + Files + Add documents + Analyse again), tiga cek validasi dengan Accuracy,
// dan laporan validasi 4 kolom + Print. Murni tampilan dari data yang sudah ada (fn_cost_agent_get_invoice_documents / get_doc_gate); tidak ada aturan baru.
import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_CARD, SA_LABEL } from './SeaAirAuditUi'
import CostAgentInvoiceDocuments from './CostAgentInvoiceDocuments'
import { PeriodCheckCard } from './CostAgentDocGate'
import { DocValidationReport, DocValidationTable, buildDocChecks, useEscClose, type CheckBlock, type CheckRow } from './CostAgentValidationReports'
import type { CostAgentDocCompare, CostAgentInvoiceHistory } from '../utils/CostAgentHelpers'
import type { DocGate } from '../utils/CostAgentGate'

const STATE_CHIP = {
  ok: { tone: 'green' as const, label: 'OK' }, review: { tone: 'amber' as const, label: 'Needs review' },
  mismatch: { tone: 'red' as const, label: 'Mismatch' }, na: { tone: 'grey' as const, label: 'N/A' },
}
const ROW_CHIP = { ok: { tone: 'green' as const, label: 'OK' }, mismatch: { tone: 'red' as const, label: 'Mismatch' }, attention: { tone: 'amber' as const, label: 'Check' }, neutral: { tone: 'grey' as const, label: 'n/a' } }

function Progress({ pct }: { pct: number | null }) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]" aria-label={pct === null ? 'No accuracy' : `Accuracy ${pct}%`}>
      <div className="h-1.5 flex-1 rounded-full bg-[#EDE5EC] overflow-hidden"><div className="h-full rounded-full bg-[#6B3470]" style={{ width: `${pct ?? 0}%` }} /></div>
      <span className="text-[11.5px] font-bold tabular-nums text-[#6B3470] w-9 text-right">{pct === null ? '—' : `${pct}%`}</span>
    </div>
  )
}

function CheckBlockView({ b, onlyBad }: { b: CheckBlock; onlyBad: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null)
  const isOpen = open ?? b.state !== 'ok'
  const rows = onlyBad ? b.rows.filter(r => r.state === 'mismatch' || r.state === 'attention') : b.rows
  const st = STATE_CHIP[b.state]
  return (
    <div className="rounded-xl border border-[#EADFD6] overflow-hidden" data-check-block={b.key}>
      <button type="button" className="w-full flex items-center gap-3 flex-wrap px-3 py-2.5 text-left bg-[#FBF7F4] hover:bg-[#F8F1EE]" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
        <span className="text-[12.5px] font-bold text-[#3B1B3D]">{b.title}</span>
        <Chip tone={st.tone}>{st.label}</Chip>
        <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{b.ok} of {b.checked} OK</span>
        <span className="ml-auto"><Progress pct={b.accuracy} /></span>
      </button>
      {isOpen && (
        <div className="max-h-60 overflow-y-auto">
          {rows.length === 0 ? <p className="px-3 py-3 text-[12px] text-[#6E5E70] italic">{onlyBad ? 'No mismatches.' : 'Nothing to check.'}</p> : (
            <table className="min-w-full">
              <tbody>
                {rows.map((r: CheckRow, i) => (
                  <tr key={i} className="border-t border-[#F3EEEA] first:border-t-0">
                    <td className="px-3 py-1.5 text-[12px] text-[#3B1B3D] min-w-[180px] [overflow-wrap:anywhere]">{r.label}</td>
                    <td className="px-2 py-1.5 text-[11.5px] text-[#6E5E70] tabular-nums text-right whitespace-nowrap">{r.invoice ?? ''}</td>
                    <td className="px-2 py-1.5 text-[11.5px] text-[#6E5E70] tabular-nums text-right whitespace-nowrap">{r.other ?? ''}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><Chip tone={ROW_CHIP[r.state].tone}>{ROW_CHIP[r.state].label}</Chip>{r.note && <span className="ml-1.5 text-[11px] text-[#8A7A8B]">{r.note}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function CostAgentFullComparison({ data, cmp, gate, canUpload, actor, onChanged, onToast, onClose }: {
  data: CostAgentInvoiceHistory
  cmp: CostAgentDocCompare | null
  gate: DocGate | null
  canUpload: boolean
  actor: string | null
  onChanged: () => Promise<void> | void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onClose: () => void
}) {
  const inv = data.invoice
  const [report, setReport] = useState(false)
  const [onlyBad, setOnlyBad] = useState(false)
  useEscClose(!report, onClose)
  const analysed = !!cmp?.analysed
  const blocks = useMemo(() => buildDocChecks(cmp, inv, data.lines), [cmp, inv, data.lines])
  const totals = useMemo(() => {
    const ok = blocks.reduce((a, b) => a + b.ok, 0); const checked = blocks.reduce((a, b) => a + b.checked, 0)
    return { pct: checked > 0 ? Math.round((ok / checked) * 100) : null }
  }, [blocks])

  return createPortal(
    <div className="fixed inset-0 z-[86] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Full comparison" className="bg-white rounded-2xl shadow-2xl w-full max-w-[1180px] max-h-[92vh] flex flex-col overflow-hidden" data-full-comparison>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[#3B1B3D] leading-tight">Full comparison</h2>
            <p className="text-[12px] text-[#6E5E70] mt-0.5">Invoice {inv.invoice_no || `#${inv.id}`} · {inv.vendor_name || inv.vendor_name_raw || ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-[#FBF7F4]">
          <div className="p-3 space-y-3">
            <PeriodCheckCard gate={gate} />
          </div>
          <CostAgentInvoiceDocuments data={data} canUpload={canUpload} actor={actor} onChanged={onChanged} onToast={onToast} showLines={false} />
          <div className="p-3 pt-0 space-y-3">
            <section className={`${SA_CARD} p-4 space-y-3`} data-doc-validation>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-[14px] font-bold text-[#3B1B3D]">Validation checks</h3>
                <span className="inline-flex items-center gap-2"><span className={SA_LABEL}>Accuracy</span><Progress pct={totals.pct} /></span>
                <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="accent-[#6B3470]" checked={onlyBad} onChange={e => setOnlyBad(e.target.checked)} /> Mismatches only</label>
              </div>
              {!analysed && cmp && <p className="rounded-lg border border-[#C9D3F0] bg-[#EEF1FA] px-3 py-2 text-[12px] text-[#2F4FA8]">The documents have not been read yet. Only the master-data check is available.</p>}
              <div className="space-y-2">{blocks.filter(b => analysed || b.key === 'c2').map(b => <React.Fragment key={b.key}><CheckBlockView b={b} onlyBad={onlyBad} /></React.Fragment>)}</div>
            </section>
            <section className={`${SA_CARD} p-4 space-y-3`} data-doc-validation-report-card>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-[14px] font-bold text-[#3B1B3D]">Validation report</h3>
                <button type="button" className={`${SA_BTN_OUTLINE} ml-auto !h-7 !px-2.5`} onClick={() => setReport(true)}><Printer size={12} /> Print</button>
              </div>
              <DocValidationTable cmp={cmp} inv={inv} />
            </section>
          </div>
        </div>
      </div>
      {report && <DocValidationReport cmp={cmp} inv={inv} onClose={() => setReport(false)} />}
    </div>,
    document.body,
  )
}
