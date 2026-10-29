// Modal "AP Note preview" (2026-10-28, sql/085) -- isi AP Note dalam format Excel finance ("Format Paste APNote"), HANYA BACA: tidak mengubah data dan
// tidak memanggil Ascend. Error (merah) = memblokir pengiriman, warning (kuning) = peringatan. "Send to Ascend" sengaja nonaktif sampai endpoint AP Note ada.
import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Download, Send } from 'lucide-react'
import { CostAgentModal } from './CostAgentUi'
import { LoadingState } from './LoadingState'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_LABEL } from './SeaAirAuditUi'
import { finApnotePreview, fracToPct, type ApNotePreview } from '../pages/cost-agent/settings/financeApi'
import { downloadApNoteExcel } from '../utils/ApNoteExcel'
import { fmtNumber } from '../utils/CostAgentHelpers'

const rate = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : `${fracToPct(Number(v))}%`)
const rp = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : fmtNumber(v, 0))

export default function CostAgentApNotePreviewModal({ invoiceId, onClose, onGoToLine, onToast }: {
  invoiceId: number
  onClose: () => void
  onGoToLine?: (lineNo: number, lineId: number | null) => void // tutup modal -> tab Lines -> gulir ke baris itu
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [data, setData] = useState<ApNotePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const load = () => {
    setLoading(true)
    finApnotePreview(invoiceId).then(d => { setData(d); setError(null) }).catch(e => setError(e?.message || String(e))).finally(() => setLoading(false))
  }
  useEffect(load, [invoiceId])

  const download = async () => {
    if (!data) return
    setDownloading(true)
    try { const name = await downloadApNoteExcel(data); onToast(`${name} downloaded.`) }
    catch (e: any) { onToast(e?.message || String(e), 'warn') } finally { setDownloading(false) }
  }
  const goLine = (lineNo: number) => {
    const lineId = data?.rows.find(r => r._line_no === lineNo)?._line_id
    onGoToLine?.(lineNo, typeof lineId === 'number' ? lineId : null)
  }

  const h = data?.header
  const t = data?.totals
  const grandDiffers = !!t && t.invoice_grand_total !== null && Math.abs(t.invoice_grand_total - t.total_with_ppn) > 1 && Math.abs(t.invoice_grand_total - t.total_after_pph) > 1
  const errors = data?.issues.filter(i => i.level === 'error') ?? []
  const warnings = data?.issues.filter(i => i.level === 'warning') ?? []

  // Pemetaan jenis biaya SELALU per PT (sql/086): pesan RPC "... is not mapped to an Ascend expense type" ditampilkan dgn nama PT invoice.
  const issueText = (i: ApNotePreview['issues'][number]) =>
    i.code === 'expense_map' && h?.company_code ? i.message.replace(/ is not mapped to an Ascend expense type\s*$/, ` is not mapped for ${h.company_code}`) : i.message
  const issueRow = (i: ApNotePreview['issues'][number], tone: 'err' | 'warn', key: number) => (
    <li key={key} className="flex items-start gap-2">
      <span className={tone === 'err' ? 'text-[#A8231A]' : 'text-[#7A4F00]'}>•</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{issueText(i)}</span>
      {i.line_no !== undefined && onGoToLine && (
        <button type="button" className="shrink-0 underline text-[11.5px] font-semibold hover:no-underline" onClick={() => goLine(i.line_no as number)}>Go to line {i.line_no}</button>
      )}
    </li>
  )

  return (
    <CostAgentModal title="AP Note preview" subtitle="Read only — nothing is sent to Ascend." z="z-[85]" maxWidth="max-w-5xl" onClose={onClose}
      footer={
        <>
          {data && data.errors > 0 && <span className="mr-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#A8231A]"><AlertTriangle size={13} /> This file is incomplete</span>}
          <button type="button" className={SA_BTN_OUTLINE} onClick={download} disabled={!data || downloading}><Download size={13} /> {downloading ? 'Preparing…' : 'Download Excel'}</button>
          <button type="button" className={SA_BTN_PRIMARY} disabled title="Waiting for the Ascend AP Note endpoint"><Send size={13} /> Send to Ascend</button>
        </>
      }>
      <div className="p-4 space-y-4" data-apnote-preview>
        {loading && <LoadingState fullHeight={false} />}
        {error && !loading && (
          <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-center gap-3" role="alert">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{error}</span>
            <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} onClick={load}>Retry</button>
          </div>
        )}

        {data && h && t && (
          <>
            <section className={`${SA_CARD} p-4`}>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-[12.5px] text-[#3B1B3D]">
                {([
                  ['Company / Ascend DB', <>{h.company_code || '—'}{h.ascend_db && <Chip tone="plum" className="ml-1.5">{h.ascend_db}</Chip>}</>],
                  ['Supplier', h.supplier_code ? `${h.supplier_code}${h.supplier_name ? ` - ${h.supplier_name}` : ''}` : '—'],
                  ['Vessel', h.vessel_name || '—'],
                  ['Office', h.office || '—'],
                  ['ApNote type', h.note_type || '—'],
                  ['Reference (invoice no.)', h.reference || '—'],
                  ['FPNo', h.fp_no || '—'],
                  ['Remarks', h.remarks || '—'],
                ] as [string, ReactNode][]).map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className={SA_LABEL}>{k}</dt><dd className="mt-0.5 [overflow-wrap:anywhere]">{v}</dd></div>
                ))}
              </dl>
            </section>

            {data.errors === 0 ? (
              <div className="rounded-lg border border-[#BFE3CC] bg-[#EAF6EF] px-3 py-2 text-[12.5px] font-semibold text-[#17663D] flex items-center gap-1.5" data-apnote-ready><CheckCircle2 size={14} /> Ready</div>
            ) : (
              <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]" role="alert" data-apnote-errors>
                <div className="font-bold mb-1">{data.errors} error{data.errors === 1 ? '' : 's'} — sending is blocked until fixed</div>
                <ul className="space-y-1">{errors.map((i, n) => issueRow(i, 'err', n))}</ul>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00]" data-apnote-warnings>
                <div className="font-bold mb-1">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</div>
                <ul className="space-y-1">{warnings.map((i, n) => issueRow(i, 'warn', n))}</ul>
              </div>
            )}

            <section className="rounded-xl border border-[#EADFD6] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-[12.5px] text-[#3B1B3D]">
                  <thead>
                    <tr className="bg-[#FBF7F4] border-b border-[#EADFD6] text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70]">
                      <th className="px-2.5 py-2">Description</th><th className="px-2.5 py-2">Expense Type</th>
                      <th className="px-2.5 py-2 text-right">Qty</th><th className="px-2.5 py-2 text-right">Unit Price</th>
                      <th className="px-2.5 py-2 text-right">PPN Rate</th><th className="px-2.5 py-2 text-right">PPh Rate</th><th className="px-2.5 py-2">PPh Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6E5E70] italic">No cost lines.</td></tr>}
                    {data.rows.map((r, n) => (
                      <tr key={n} className="border-t border-[#F3EEEA] align-top">
                        <td className="px-2.5 py-1.5 [overflow-wrap:anywhere]">{r.Description || '—'}</td>
                        <td className="px-2.5 py-1.5">{r['Expense Type'] || <Chip tone="amber">Not mapped</Chip>}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{rp(r.Qty)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{rp(r['Unit Price'])}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{rate(r['PPN Rate'])}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{rate(r['PPh Rate'])}</td>
                        <td className="px-2.5 py-1.5">{r['PPh Type'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="text-[11.5px] text-[#6E5E70]">Account Code and Cost Centre are created when the AP Note is sent (taken from the Ascend expense type and vessel).</p>

            <section className={`${SA_CARD} p-4 ml-auto max-w-md`}>
              <dl className="space-y-1.5 text-[12.5px] text-[#3B1B3D]">
                {([['Subtotal', t.subtotal], ['PPN', t.ppn], ['PPh', t.pph], ['Total incl. PPN', t.total_with_ppn], ['Total after PPh', t.total_after_pph]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6"><dt className="text-[#6E5E70]">{k}</dt><dd className="tabular-nums font-semibold">{rp(v)}</dd></div>
                ))}
                <div className="flex justify-between gap-6 pt-1.5 border-t border-[#EADFD6]">
                  <dt className="text-[#6E5E70]">Invoice grand total</dt>
                  <dd className="tabular-nums font-bold flex items-center gap-1.5">
                    {grandDiffers && <Chip tone="amber" title="Differs from both Total incl. PPN and Total after PPh">Differs</Chip>}{rp(t.invoice_grand_total)}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </CostAgentModal>
  )
}
