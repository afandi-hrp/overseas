// Tab "Documents & Tax" review invoice Cost Agent (2026-10-13, Prompt 3; ditulis ulang 2026-10-23 utk sql/072 "perbandingan dokumen").
// Data utama = `fn_cost_agent_get_invoice_documents(p_invoice_id)` (hanya baca; dihitung server saat dibaca): banner status keseluruhan, 6 tabel -- (1) Document completeness,
// (2) Invoice vs attachments, (3) Invoice vs tax invoice, (4) Dates, (5) Line comparison (inti), (6) Tax totals -- + daftar file & dokumen yang terbaca.
// "Add documents" = alur susulan lama (proxy multipart cost_agent {mode:'susulan', invoice_id, hint}); "Analyse again" = fn_cost_agent_start_redo -> webhook
// {mode:'redo_docs', invoice_id, job_id} TANPA file. Keduanya TIDAK mengubah invoice, baris, maupun statusnya -- hanya pembacaan/perbandingan dokumen. Selama ada file
// 'processing' tab membaca ulang tiap 5 dtk. Invoice lama (belum dianalisis) -> kartu "Not analysed yet"; FP belum ada -> "Waiting for tax invoice" (bukan error).
// Daftar `tax_checks` lama tetap di bagian paling bawah.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, AlertTriangle, CheckCircle2, XCircle, MinusCircle, X, RefreshCw, FilePlus2, ChevronRight } from 'lucide-react'
import { CostAgentFileDrop, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, SA_LABEL, SA_CARD } from './SeaAirAuditUi'
import type { Tone } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import { noteText, noteMsg } from '../utils/CostAgentNotes'
import {
  costAgentUpload, costAgentGetInvoiceDocuments, costAgentStartRedo, costAgentRedoDocs, fetchCostAgentJobSnapshot,
  fmtDate, fmtMoney, fmtNumber, fmtDateTimePort, DOC_TYPE_LABEL, TAX_STATUS_META,
  type CostAgentInvoiceHistory, type CostAgentDocCompare, type DocCmpLine, type DocCmpLineSide, type DocCmpPart, type DocCmpOrphan,
} from '../utils/CostAgentHelpers'

// ─── Tampilan status ──────────────────────────────────────────────────────────────────────────────────────────────
const OVERALL_META: Record<string, { label: string; tone: Tone }> = {
  not_analysed: { label: 'Not analysed', tone: 'grey' },
  incomplete: { label: 'Incomplete', tone: 'blue' },
  attention: { label: 'Attention', tone: 'red' },
  ok: { label: 'OK', tone: 'green' },
}
// Chip hasil bandingkan satu baris invoice dgn lampiran / faktur pajak.
const LINE_CHIP: Record<string, { label: string; tone: Tone }> = {
  match: { label: 'Match', tone: 'green' },
  match_group: { label: 'Match · section total', tone: 'green' },
  match_sum: { label: 'Match · sum of items', tone: 'green' },
  match_agg: { label: 'Match · combined in one row', tone: 'green' },
  diff: { label: 'Different', tone: 'red' },
  none: { label: 'Not in attachment', tone: 'amber' },
  not_in_fp: { label: 'Not in tax invoice', tone: 'grey' },
  pending: { label: 'Waiting for tax invoice', tone: 'blue' },
  not_required: { label: 'No VAT', tone: 'grey' },
  no_doc: { label: 'No attachment', tone: 'grey' },
}
const CMP_MARK = { ok: ['✔', 'text-[#17663D]'], diff: ['✘', 'text-[#A8231A]'], warn: ['⚠', 'text-[#B7791F]'], na: ['–', 'text-[#8A7A8B]'] } as Record<string, [string, string]>
const isMatchStatus = (s?: string | null) => !!s && s.startsWith('match')
const hasIssue = (l: DocCmpLine) => ['diff', 'none'].includes(l.attachment?.status || '') || ['diff', 'none'].includes(l.tax?.status || '')

function Mark({ status }: { status?: string | null }) {
  const [sym, cls] = CMP_MARK[status || 'na'] || CMP_MARK.na
  return <span className={`font-bold text-[14px] leading-none ${cls}`} aria-label={status || 'n/a'}>{sym}</span>
}
const cellVal = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? fmtNumber(v, 0) : String(v))
const partLabel = (p?: DocCmpPart | null) => (p ? `${DOC_TYPE_LABEL[p.doc_type as keyof typeof DOC_TYPE_LABEL] || p.doc_type || 'Document'}${p.doc_no ? ` · ${p.doc_no}` : ''}` : 'Document')

const TH = 'px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-2.5 py-2 text-[12.5px] text-[#3B1B3D] align-top'

function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className={`${SA_CARD} overflow-hidden`}>
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.05em] text-[#6B3470]">{title}</h3>
          {hint && <p className="text-[11.5px] text-[#8A7A8B] mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 pb-3 text-[12px] text-[#8A7A8B] italic">{children}</p>

// ─── Komponen utama ───────────────────────────────────────────────────────────────────────────────────────────────
export default function CostAgentInvoiceDocuments({ data, canUpload, actor, onChanged, onToast }: {
  data: CostAgentInvoiceHistory
  canUpload: boolean
  actor?: string | null
  onChanged: () => Promise<void> | void
  onToast?: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const inv = data.invoice
  const [cmp, setCmp] = useState<CostAgentDocCompare | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [detail, setDetail] = useState<DocCmpLine | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [hint, setHint] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redoBusy, setRedoBusy] = useState(false)
  // Job yang sedang dilacak (susulan / analisis ulang): polling dokumen per job_id sampai tidak ada 'processing', lalu baca ulang perbandingan.
  const [job, setJob] = useState<{ id: string; kind: 'susulan' | 'redo' } | null>(null)
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged
  const toastRef = useRef(onToast); toastRef.current = onToast

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setCmp(await costAgentGetInvoiceDocuments(inv.id))
      setLoadError(null)
    } catch (e: any) {
      setLoadError(e.message || String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [inv.id])
  useEffect(() => { load() }, [load])

  // Selama ada file yg masih diproses (mis. dari upload lain) -> baca ulang senyap tiap 5 dtk.
  const anyProcessing = (cmp?.files || []).some(f => f.analysis === 'processing' || f.status === 'processing')
  useEffect(() => {
    if (!anyProcessing || job) return
    const iv = setInterval(() => load(true), 5000)
    return () => clearInterval(iv)
  }, [anyProcessing, job, load])

  useEffect(() => {
    if (!job) return
    let alive = true
    const iv = setInterval(async () => {
      try {
        const snap = await fetchCostAgentJobSnapshot(job.id, [inv.id])
        if (!alive) return
        if (snap.done) {
          setJob(null)
          await load(true)
          await onChangedRef.current()
          if (job.kind === 'susulan') toastRef.current?.('Documents added — comparison updated')
          else toastRef.current?.('Documents analysed again — comparison updated')
        }
      } catch (e) { console.warn('[CostAgent] pelacakan job dokumen gagal sementara', e) }
    }, 5000)
    return () => { alive = false; clearInterval(iv) }
  }, [job, inv.id, load])

  const sendSupporting = async () => {
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setSending(true); setError(null)
    try {
      const r = await costAgentUpload('cost_agent', files, { mode: 'susulan', invoice_id: inv.id, hint: hint.trim() || null })
      const jobId = r?.job_id ?? r?.data?.job_id ?? null
      setFiles([]); setHint(''); setShowUpload(false)
      if (jobId) setJob({ id: String(jobId), kind: 'susulan' })
      else { toastRef.current?.('Documents sent. Reload this tab in a moment to see the comparison.'); load(true) }
      load(true)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSending(false)
    }
  }

  const analyseAgain = async () => {
    setRedoBusy(true); setError(null)
    try {
      const r = await costAgentStartRedo(inv.id, actor ?? null)
      await costAgentRedoDocs(inv.id, String(r.job_id))
      toastRef.current?.('Documents are being analysed again — invoice data is not changed')
      setJob({ id: String(r.job_id), kind: 'redo' })
      load(true)
    } catch (e: any) {
      const msg = e.message || String(e)
      setError(msg); toastRef.current?.(msg, 'warn')
    } finally {
      setRedoBusy(false)
    }
  }

  const parts = cmp?.parts || []
  const partById = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts])
  const susulanNotes = (inv.check_notes || []).filter(n => n.type === 'susulan_mismatch')
  const overall = cmp?.summary?.overall || 'not_analysed'
  const analysed = !!cmp?.analysed && overall !== 'not_analysed'
  const meta = OVERALL_META[overall] || OVERALL_META.not_analysed
  const redFlags = cmp?.summary?.red_flags ?? 0
  const busyJob = !!job || redoBusy

  return (
    <div className="p-4 space-y-4" data-documents-tab>
      {susulanNotes.map((n, i) => (
        <div key={i} className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0"><span className="font-semibold">{noteText(n, inv)}</span>{noteMsg(n) && <span className="block text-[10.5px] text-[#8A7A8B]" data-note-msg>{noteMsg(n)}</span>}</span>
        </div>
      ))}

      {/* 0. Banner */}
      <div className={`${SA_CARD} px-4 py-3 flex items-center gap-3 flex-wrap`} data-doc-banner>
        <div className="flex items-center gap-2 min-w-0">
          <Chip tone={meta.tone} className="!text-[12px] !px-2.5 !py-1">{loading && !cmp ? 'Loading…' : meta.label}</Chip>
          {analysed && <span className={`text-[12.5px] font-semibold ${redFlags > 0 ? 'text-[#A8231A]' : 'text-[#6E5E70]'}`}>{redFlags} red flag{redFlags === 1 ? '' : 's'}</span>}
          {busyJob && <span className="inline-flex items-center gap-1.5 text-[12px] text-[#2F4FA8]"><LoadingSpinner className="shrink-0" /> Reading the documents…</span>}
        </div>
        {canUpload && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setShowUpload(v => !v)} disabled={sending || busyJob}><FilePlus2 size={13} /> Add documents</button>
            <button type="button" className={SA_BTN_OUTLINE} onClick={analyseAgain} disabled={busyJob || (cmp?.files || []).length === 0 && !loading}
              title="Read the stored documents again. The invoice, its lines and its status are not changed.">
              <RefreshCw size={13} className={redoBusy ? 'animate-spin' : ''} /> {redoBusy ? 'Starting…' : 'Analyse again'}
            </button>
          </div>
        )}
      </div>
      {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}

      {canUpload && showUpload && (
        <section className={`${SA_CARD} p-4 space-y-3`} data-add-documents>
          <div>
            <h3 className="text-[14px] font-bold text-[#3B1B3D]">Add documents</h3>
            <p className="text-[12px] text-[#6E5E70]">Tax invoice (Faktur Pajak), PO, receipt, attachments — added to THIS invoice. The invoice and its status do not change; only the comparison is updated.</p>
          </div>
          <CostAgentFileDrop files={files} onChange={setFiles} disabled={sending} />
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]"><FieldLabel>Note / hint</FieldLabel><input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} disabled={sending} placeholder="e.g. Faktur Pajak for this invoice" /></div>
            <button type="button" className={SA_BTN_PRIMARY} onClick={sendSupporting} disabled={sending || !files.length}>{sending ? 'Sending…' : `Send ${files.length || ''} document${files.length === 1 ? '' : 's'}`}</button>
          </div>
        </section>
      )}

      {loadError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{loadError}</div>}
      {loading && !cmp && <div className="py-6 flex justify-center"><LoadingSpinner /></div>}

      {cmp && !analysed && (
        <div className={`${SA_CARD} px-4 py-4 flex items-start gap-3`} data-not-analysed>
          <MinusCircle size={18} className="text-[#8A7A8B] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#3B1B3D]">Not analysed yet</p>
            <p className="text-[12.5px] text-[#6E5E70]">Documents of this invoice have not been read for comparison. The invoice lines and totals are shown as usual.</p>
            {canUpload && <button type="button" className={`${SA_BTN_OUTLINE} mt-2`} onClick={analyseAgain} disabled={busyJob}><RefreshCw size={13} className={redoBusy ? 'animate-spin' : ''} /> Analyse again</button>}
          </div>
        </div>
      )}

      {cmp && analysed && (
        <>
          <CompletenessTable cmp={cmp} />
          <HeaderChecksTable title="Invoice vs attachments" group="attachment" cmp={cmp} partById={partById} />
          <HeaderChecksTable title="Invoice vs tax invoice" group="tax" cmp={cmp} partById={partById} />
          <DatesTable cmp={cmp} />
          <LineComparison cmp={cmp} onlyDiff={onlyDiff} setOnlyDiff={setOnlyDiff} onOpen={setDetail} />
          <TaxTotals cmp={cmp} parts={parts} />
        </>
      )}

      {cmp && <FilesList cmp={cmp} partById={partById} />}

      {/* Pemeriksaan faktur pajak LAMA (tax_checks) tetap di bagian bawah */}
      {data.tax_checks.length > 0 && <LegacyTaxChecks data={data} />}

      {detail && <LineDrawer line={detail} partById={partById} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ─── 1. Document completeness ─────────────────────────────────────────────────────────────────────────────────────
function CompletenessTable({ cmp }: { cmp: CostAgentDocCompare }) {
  const rows = cmp.completeness || []
  return (
    <Section title="Document completeness" hint="Which documents are present for this invoice.">
      {rows.length === 0 ? <Empty>No completeness data.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]" data-doc-completeness>
            <thead><tr><th className={TH}>Document</th><th className={TH}>Status</th><th className={TH}>Document no.</th><th className={TH}>Note</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const docs = r.docs || []
                const status = r.status === 'present' ? <span className="inline-flex items-center gap-1 text-[#17663D] font-semibold"><CheckCircle2 size={14} /> Present</span>
                  : r.status === 'missing' ? <span className="inline-flex items-center gap-1 text-[#A8231A] font-semibold"><XCircle size={14} /> Missing</span>
                  : r.status === 'pending' ? <Chip tone="blue">Pending</Chip> : <Chip tone="grey">Not required</Chip>
                const note = r.key === 'tax_invoice' && r.status === 'pending' ? 'Waiting for tax invoice'
                  : r.key === 'tax_invoice' && r.status === 'not_required' ? 'Invoice has no VAT' : r.required && r.status === 'missing' ? 'Required' : ''
                return (
                  <tr key={r.key} className="border-t border-[#F3EEEA]">
                    <td className={`${TD} font-semibold`}>{r.label}</td>
                    <td className={TD}>{status}</td>
                    <td className={TD}>{docs.length ? docs.map((d, i) => <div key={i} className="tabular-nums">{d.doc_no || '—'}{d.doc_date && <span className="text-[#8A7A8B]"> · {fmtDate(d.doc_date)}</span>}</div>) : '—'}</td>
                    <td className={`${TD} text-[#6E5E70]`}>{note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ─── 2 & 3. Invoice vs attachments / tax invoice ──────────────────────────────────────────────────────────────────
function HeaderChecksTable({ title, group, cmp, partById }: { title: string; group: 'tax' | 'attachment'; cmp: CostAgentDocCompare; partById: Map<number, DocCmpPart> }) {
  const rows = (cmp.header_checks || []).filter(c => c.group === group)
  const order: (number | null)[] = []
  rows.forEach(r => { if (!order.includes(r.part_id)) order.push(r.part_id) })
  let n = 0
  return (
    <Section title={title} hint={group === 'tax' ? 'Header data of the invoice against each tax invoice (Faktur Pajak).' : 'Header data of the invoice against each attachment.'}>
      {rows.length === 0 ? <Empty>{group === 'tax' ? 'No tax invoice to compare yet.' : 'No attachment to compare.'}</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]" data-header-checks={group}>
            <thead><tr><th className={`${TH} w-10`}>No</th><th className={TH}>Field</th><th className={TH}>Invoice data</th><th className={TH}>Document data</th><th className={`${TH} text-center`}>Status</th><th className={TH}>Note</th></tr></thead>
            <tbody>
              {order.map(pid => {
                const p = pid != null ? partById.get(pid) : undefined
                return (
                  <React.Fragment key={String(pid)}>
                    <tr className="bg-[#F5EDF3]"><td colSpan={6} className="px-2.5 py-1.5 text-[11.5px] font-bold text-[#6B3470]">{partLabel(p)}{p?.doc_date && <span className="font-normal text-[#8A7A8B]"> · {fmtDate(p.doc_date)}</span>}</td></tr>
                    {rows.filter(r => r.part_id === pid).map((r, i) => (
                      <tr key={i} className="border-t border-[#F3EEEA]">
                        <td className={`${TD} text-[#8A7A8B] tabular-nums`}>{++n}</td>
                        <td className={`${TD} font-semibold`}>{r.field}</td>
                        <td className={`${TD} tabular-nums [overflow-wrap:anywhere]`}>{cellVal(r.invoice_value)}</td>
                        <td className={`${TD} tabular-nums [overflow-wrap:anywhere] ${r.status === 'diff' ? 'text-[#A8231A] font-semibold' : ''}`}>{cellVal(r.doc_value)}</td>
                        <td className={`${TD} text-center`}><Mark status={r.status} /></td>
                        <td className={`${TD} text-[#6E5E70] text-[12px]`}>{r.note || '—'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ─── 4. Dates ─────────────────────────────────────────────────────────────────────────────────────────────────────
function DatesTable({ cmp }: { cmp: CostAgentDocCompare }) {
  const rows = cmp.date_checks || []
  return (
    <Section title="Dates" hint="Dates in the documents against the voyage / invoice dates.">
      {rows.length === 0 ? <Empty>No date to compare.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]" data-date-checks>
            <thead><tr><th className={TH}>Source</th><th className={TH}>Label</th><th className={TH}>Date</th><th className={TH}>Compared to</th><th className={`${TH} text-right`}>Gap (days)</th><th className={`${TH} text-center`}>Status</th><th className={TH}>Note</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[#F3EEEA]">
                  <td className={TD}>{r.source || '—'}{r.doc_no && <div className="text-[11px] text-[#8A7A8B]">{r.doc_no}</div>}</td>
                  <td className={`${TD} font-semibold`}>{r.label}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{fmtDate(r.date)}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{fmtDate(r.compare_to)}</td>
                  <td className={`${TD} text-right tabular-nums ${r.status === 'diff' ? 'text-[#A8231A] font-semibold' : ''}`}>{r.gap_days ?? '—'}</td>
                  <td className={`${TD} text-center`}><Mark status={r.status} /></td>
                  <td className={`${TD} text-[#6E5E70] text-[12px]`}>{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// ─── 5. Line comparison ───────────────────────────────────────────────────────────────────────────────────────────
function SideCell({ side, kind }: { side: DocCmpLineSide | null; kind: 'attachment' | 'tax' }) {
  if (!side) return <span className="text-[#8A7A8B]">—</span>
  const chip = LINE_CHIP[side.status] || { label: side.status, tone: 'grey' as Tone }
  const label = side.status === 'match_sum' ? `Match · sum of ${(side.refs || []).length} items` : chip.label
  const refs = side.refs || []
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip tone={chip.tone}>{label}</Chip>
        {side.matched_amount != null && <span className="tabular-nums text-[12px] font-semibold">{fmtMoney(side.matched_amount)}</span>}
      </div>
      {side.status === 'diff' && side.diff != null && <div className="mt-0.5 text-[11.5px] font-bold text-[#A8231A] tabular-nums">Δ {side.diff > 0 ? '+' : ''}{fmtMoney(side.diff)}</div>}
      {refs.slice(0, 2).map((r, i) => (
        <div key={i} className="mt-0.5 text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]" data-ref-kind={kind}>
          {[DOC_TYPE_LABEL[r.doc_type as keyof typeof DOC_TYPE_LABEL] || r.doc_type, r.doc_no, r.description].filter(Boolean).join(' · ')}{r.amount != null && <b className="text-[#3B1B3D]"> · {fmtMoney(r.amount)}</b>}
        </div>
      ))}
      {refs.length > 2 && <div className="mt-0.5 text-[11px] text-[#8A7A8B]">+{refs.length - 2} more…</div>}
    </div>
  )
}

function LineComparison({ cmp, onlyDiff, setOnlyDiff, onOpen }: { cmp: CostAgentDocCompare; onlyDiff: boolean; setOnlyDiff: (v: boolean) => void; onOpen: (l: DocCmpLine) => void }) {
  const lines = cmp.lines || []
  const shown = onlyDiff ? lines.filter(hasIssue) : lines
  const orphans = cmp.orphans || { attachment: [], tax: [] }
  return (
    <Section title="Line comparison" hint="Each invoice line against the attachment and the tax invoice. Click a row for all references."
      right={
        <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer select-none">
          <input type="checkbox" className="accent-[#6B3470]" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} /> Show only differences
        </label>
      }>
      {lines.length === 0 ? <Empty>No invoice lines.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]" data-line-compare>
            <thead><tr><th className={`${TH} w-10`}>No</th><th className={TH}>Invoice line</th><th className={TH}>Attachment</th><th className={TH}>Tax invoice</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-[12.5px] text-[#8A7A8B] italic">No differences found.</td></tr>}
              {shown.map(l => {
                const diff = l.attachment?.status === 'diff' || l.tax?.status === 'diff'
                const none = !diff && (l.attachment?.status === 'none' || l.tax?.status === 'none')
                const clean = !diff && !none
                // Baris tanpa selisih (match / netral) dilipat gaya ringkas: hanya chip, tanpa daftar referensi.
                const compact = clean && [l.attachment?.status, l.tax?.status].every(s => !s || isMatchStatus(s) || ['not_required', 'no_doc', 'pending', 'not_in_fp'].includes(s))
                const overall = diff ? { label: 'Different', tone: 'red' as Tone } : none ? { label: 'Check', tone: 'amber' as Tone } : { label: 'OK', tone: 'green' as Tone }
                return (
                  <tr key={l.line_id} onClick={() => onOpen(l)} data-line-row={l.line_no} data-line-state={diff ? 'diff' : none ? 'none' : 'ok'}
                    className={`border-t border-[#F3EEEA] cursor-pointer hover:bg-[#FBF7F4] border-l-4 ${diff ? 'border-l-[#A8231A] bg-[#FFFAF9]' : none ? 'border-l-[#E0A526] bg-[#FFFDF6]' : 'border-l-transparent'}`}>
                    <td className={`${compact ? 'py-1.5' : 'py-2'} px-2.5 text-[12px] text-[#8A7A8B] tabular-nums align-top`}>{l.line_no}</td>
                    <td className={`${compact ? 'py-1.5' : 'py-2'} px-2.5 align-top min-w-[200px]`}>
                      <div className={`${compact ? 'text-[12px]' : 'text-[12.5px]'} font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]`}>{l.description || '—'}</div>
                      <div className="text-[11px] text-[#8A7A8B]">{l.cost_item || 'No cost item'} · <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(l.amount)}</b></div>
                    </td>
                    <td className={`${compact ? 'py-1.5' : 'py-2'} px-2.5 align-top`}>{compact ? <CompactChip side={l.attachment} /> : <SideCell side={l.attachment} kind="attachment" />}</td>
                    <td className={`${compact ? 'py-1.5' : 'py-2'} px-2.5 align-top`}>{compact ? <CompactChip side={l.tax} /> : <SideCell side={l.tax} kind="tax" />}</td>
                    <td className={`${compact ? 'py-1.5' : 'py-2'} px-2.5 align-top`}><span className="inline-flex items-center gap-1"><Chip tone={overall.tone}>{overall.label}</Chip><ChevronRight size={13} className="text-[#B9A9BA]" /></span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <OrphansFooter orphans={orphans} />
    </Section>
  )
}
function CompactChip({ side }: { side: DocCmpLineSide | null }) {
  if (!side) return <span className="text-[#8A7A8B]">—</span>
  const chip = LINE_CHIP[side.status] || { label: side.status, tone: 'grey' as Tone }
  return <Chip tone={chip.tone}>{side.status === 'match_sum' ? `Match · sum of ${(side.refs || []).length} items` : chip.label}</Chip>
}

function OrphansFooter({ orphans }: { orphans: { attachment: DocCmpOrphan[] | null; tax: DocCmpOrphan[] | null } }) {
  const att = orphans.attachment || [], tax = orphans.tax || []
  if (!att.length && !tax.length) return null
  const list = (title: string, items: DocCmpOrphan[]) => items.length > 0 && (
    <div className="min-w-0">
      <div className={`${SA_LABEL} mb-1`}>{title} ({items.length})</div>
      <ul className="space-y-0.5 text-[12px] text-[#3B1B3D]">
        {items.map((o, i) => (
          <li key={i} className="flex items-start gap-2"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{[DOC_TYPE_LABEL[o.doc_type as keyof typeof DOC_TYPE_LABEL] || o.doc_type, o.doc_no, o.description].filter(Boolean).join(' · ')}</span><b className="tabular-nums whitespace-nowrap">{fmtMoney(o.amount)}</b></li>
        ))}
      </ul>
    </div>
  )
  return (
    <div className="border-t border-[#EADFD6] bg-[#FBF7F4] px-4 py-3" data-orphans>
      <div className="text-[11.5px] font-bold text-[#6B3470] mb-1.5">Orphans <span className="font-normal text-[#8A7A8B]">— items in the documents that no invoice line uses</span></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{list('In attachments', att)}{list('In tax invoices', tax)}</div>
    </div>
  )
}

// Drawer detail satu baris: SEMUA referensi lampiran & faktur pajak.
function LineDrawer({ line, partById, onClose }: { line: DocCmpLine; partById: Map<number, DocCmpPart>; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const side = (title: string, s: DocCmpLineSide | null) => {
    const chip = s ? (LINE_CHIP[s.status] || { label: s.status, tone: 'grey' as Tone }) : null
    return (
      <div className="rounded-xl border border-[#EADFD6] p-3">
        <div className="flex items-center gap-2 flex-wrap"><span className="text-[12.5px] font-bold text-[#3B1B3D]">{title}</span>{chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
          {s?.matched_amount != null && <span className="tabular-nums text-[12px] font-semibold">{fmtMoney(s.matched_amount)}</span>}
          {s?.status === 'diff' && s.diff != null && <span className="text-[12px] font-bold text-[#A8231A] tabular-nums">Δ {s.diff > 0 ? '+' : ''}{fmtMoney(s.diff)}</span>}</div>
        {(s?.refs || []).length === 0 ? <p className="mt-1.5 text-[12px] text-[#8A7A8B] italic">No reference.</p> : (
          <ul className="mt-2 space-y-1.5">
            {(s?.refs || []).map((r, i) => {
              const p = partById.get(r.part_id)
              return (
                <li key={i} className="rounded-lg bg-[#FBF7F4] px-2.5 py-1.5 text-[12px]">
                  <div className="flex items-start gap-2"><span className="min-w-0 flex-1 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{r.description || '—'}</span><b className="tabular-nums whitespace-nowrap">{fmtMoney(r.amount)}</b></div>
                  <div className="text-[11px] text-[#8A7A8B]">{[partLabel(p) !== 'Document' ? partLabel(p) : [DOC_TYPE_LABEL[r.doc_type as keyof typeof DOC_TYPE_LABEL] || r.doc_type, r.doc_no].filter(Boolean).join(' · '), r.group_name, r.kind].filter(Boolean).join(' · ')}</div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }
  return createPortal(
    <div className="fixed inset-0 z-[88] bg-slate-900/40 backdrop-blur-[2px] flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="bg-white w-full max-w-[480px] h-full shadow-2xl flex flex-col" data-line-drawer>
        <div className="px-5 py-4 border-b border-[#EADFD6] flex items-start justify-between gap-3">
          <div className="min-w-0"><div className={SA_LABEL}>Line {line.line_no}</div><div className="text-[14px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{line.description || '—'}</div>
            <div className="text-[12px] text-[#6E5E70]">{line.cost_item || 'No cost item'} · <b className="tabular-nums text-[#3B1B3D]">{fmtMoney(line.amount)}</b></div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{side('Attachment', line.attachment)}{side('Tax invoice', line.tax)}</div>
      </aside>
    </div>,
    document.body,
  )
}

// ─── 6. Tax totals ────────────────────────────────────────────────────────────────────────────────────────────────
function TaxTotals({ cmp, parts }: { cmp: CostAgentDocCompare; parts: DocCmpPart[] }) {
  const t = cmp.tax_totals
  const fps = parts.filter(p => p.is_tax_equivalent)
  const stat = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-1.5 min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A7A8B]">{label}</div><div className="text-[13px] font-bold text-[#3B1B3D] tabular-nums">{value}</div></div>
  )
  return (
    <Section title="Tax totals" hint="Tax invoices (Faktur Pajak) against the invoice totals.">
      {!t && fps.length === 0 ? <Empty>No tax invoice to compare yet.</Empty> : (
        <div className="px-4 pb-4 space-y-3" data-tax-totals>
          {t && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {stat('Tax invoices', t.fp_count ?? 0)}{stat('Selling price', fmtMoney(t.selling_price))}{stat('Covered lines', fmtMoney(t.covered_lines))}
              {stat('DPP', fmtMoney(t.dpp))}{stat('VAT collected', fmtMoney(t.ppn_collected))}{stat('VAT not collected', fmtMoney(t.ppn_not_collected))}
            </div>
          )}
          {t && (t.checks || []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
              <table className="w-full min-w-[560px]"><thead><tr><th className={TH}>Check</th><th className={`${TH} text-right`}>Invoice</th><th className={`${TH} text-right`}>Document</th><th className={`${TH} text-right`}>Difference</th><th className={`${TH} text-center`}>Status</th><th className={TH}>Note</th></tr></thead>
                <tbody>{(t.checks || []).map((c, i) => (
                  <tr key={i} className="border-t border-[#F3EEEA]"><td className={`${TD} font-semibold`}>{c.label}</td><td className={`${TD} text-right tabular-nums`}>{cellVal(c.invoice_value)}</td><td className={`${TD} text-right tabular-nums`}>{cellVal(c.doc_value)}</td>
                    <td className={`${TD} text-right tabular-nums ${c.diff ? 'text-[#A8231A] font-semibold' : ''}`}>{c.diff != null ? fmtNumber(c.diff, 0) : '—'}</td><td className={`${TD} text-center`}><Mark status={c.status} /></td><td className={`${TD} text-[12px] text-[#6E5E70]`}>{c.note || '—'}</td></tr>
                ))}</tbody></table>
            </div>
          )}
          {t && (t.rate_checks || []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
              <table className="w-full min-w-[420px]"><thead><tr><th className={TH}>Tax invoice</th><th className={`${TH} text-right`}>Rate</th><th className={`${TH} text-center`}>Status</th><th className={TH}>Note</th></tr></thead>
                <tbody>{(t.rate_checks || []).map((c, i) => (
                  <tr key={i} className="border-t border-[#F3EEEA]"><td className={`${TD} font-semibold`}>{c.doc_no || '—'}</td><td className={`${TD} text-right tabular-nums`}>{c.rate_pct != null ? `${fmtNumber(c.rate_pct, 2)}%` : '—'}</td><td className={`${TD} text-center`}><Mark status={c.status} /></td><td className={`${TD} text-[12px] text-[#6E5E70]`}>{c.note || '—'}</td></tr>
                ))}</tbody></table>
            </div>
          )}
          {fps.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {fps.map(p => {
                const dup = p.duplicate_of != null
                const collected = Number(p.ppn || 0) > 0
                return (
                  <div key={p.id} className={`rounded-xl border p-3 ${dup ? 'border-[#EADFD6] bg-[#F6F1EE] opacity-70' : 'border-[#EADFD6] bg-white'}`} data-fp-card>
                    <div className="flex items-center gap-2 flex-wrap"><b className="text-[12.5px] text-[#3B1B3D] tabular-nums">{p.doc_no || 'No serial number'}</b><span className="text-[11.5px] text-[#6E5E70]">{fmtDate(p.doc_date)}</span>
                      <Chip tone={collected ? 'green' : 'grey'} className="ml-auto">{collected ? 'VAT collected' : 'VAT not collected'}</Chip></div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[12px]">
                      <div><div className={SA_LABEL}>Selling price</div><div className="tabular-nums">{fmtMoney(p.total_amount)}</div></div>
                      <div><div className={SA_LABEL}>DPP</div><div className="tabular-nums">{fmtMoney(p.dpp)}</div></div>
                      <div><div className={SA_LABEL}>VAT</div><div className="tabular-nums">{fmtMoney(p.ppn)}</div></div>
                    </div>
                    {dup && <p className="mt-1.5 text-[11px] text-[#8A7A8B]">Duplicate of #{p.duplicate_of} — not used in comparison</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ─── Daftar file & dokumen yang terbaca ───────────────────────────────────────────────────────────────────────────
const ANALYSIS_CHIP: Record<string, { label: string; tone: Tone }> = {
  analysed: { label: 'Analysed', tone: 'green' }, processing: { label: 'Processing', tone: 'blue' },
  failed: { label: 'Failed', tone: 'red' }, not_analysed: { label: 'Not analysed', tone: 'grey' },
}
function FilesList({ cmp, partById }: { cmp: CostAgentDocCompare; partById: Map<number, DocCmpPart> }) {
  const files = cmp.files || []
  const partsOf = (fileId: number) => (cmp.parts || []).filter(p => p.file_id === fileId)
  void partById
  return (
    <Section title="Files" hint="Files uploaded to this invoice and what was read from them.">
      {files.length === 0 ? <Empty>No files yet.</Empty> : (
        <div className="px-4 pb-4 space-y-2" data-doc-files>
          {files.map(f => {
            const a = ANALYSIS_CHIP[f.analysis] || { label: f.analysis, tone: 'grey' as Tone }
            const ps = partsOf(f.id)
            return (
              <div key={f.id} className="rounded-lg border border-[#EADFD6] px-3 py-2 text-[12.5px]">
                <div className="flex items-center gap-2 flex-wrap">
                  {f.file_url ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-1">{f.file_name || 'File'} <ExternalLink size={11} /></a>
                    : <span className="font-semibold text-[#3B1B3D]">{f.file_name || 'File'}</span>}
                  <Chip tone="grey">{DOC_TYPE_LABEL[f.doc_type as keyof typeof DOC_TYPE_LABEL] || f.doc_type}</Chip>
                  <Chip tone={a.tone}>{a.label}</Chip>
                  {f.mode === 'susulan' && <Chip tone="purple">Supporting</Chip>}
                  <span className="ml-auto text-[11px] text-[#8A7A8B]">{fmtDateTimePort(f.created_at, null)}</span>
                </div>
                {(f.analysis === 'failed' || f.status === 'failed') && (f.analysis_error) && <p className="text-[12px] text-[#A8231A] mt-1">{f.analysis_error}</p>}
                {ps.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {ps.map(p => {
                      const dup = p.duplicate_of != null
                      return (
                        <li key={p.id} className={`rounded-md px-2 py-1 text-[12px] ${dup ? 'bg-[#F3EEEA] text-[#8A7A8B]' : 'bg-[#FBF7F4] text-[#3B1B3D]'}`} data-part-row={dup ? 'duplicate' : 'ok'}>
                          <span className="font-semibold">{partLabel(p)}</span>
                          {p.doc_date && <span> · {fmtDate(p.doc_date)}</span>}
                          {p.issuer_name && <span> · {p.issuer_name}</span>}
                          {p.total_amount != null && <span className="tabular-nums"> · {fmtMoney(p.total_amount)}</span>}
                          {p.page_from != null && <span className="text-[#8A7A8B]"> · p.{p.page_from}{p.page_to && p.page_to !== p.page_from ? `–${p.page_to}` : ''}</span>}
                          {dup && <span className="block text-[11px]">Duplicate of #{p.duplicate_of} — not used in comparison</span>}
                          {!dup && p.summary && <span className="block text-[11px] text-[#6E5E70]">{p.summary}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ─── Pemeriksaan faktur pajak lama (tax_checks) ───────────────────────────────────────────────────────────────────
function LegacyTaxChecks({ data }: { data: CostAgentInvoiceHistory }) {
  const docs = data.documents || []
  const docForTax = (taxId: number) => docs.find(d => d.tax_check_id === taxId)
  return (
    <section>
      <div className={`${SA_LABEL} mb-1.5`}>Tax invoice checks</div>
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
    </section>
  )
}
