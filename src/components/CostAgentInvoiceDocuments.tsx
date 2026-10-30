// Tab "Documents & Tax" review invoice Cost Agent (2026-10-13, Prompt 3; ditulis ulang 2026-10-23 utk sql/072; DIRINGKAS 2026-10-23 -- 7 panel panjang -> 1 layar utama).
// Data TETAP `fn_cost_agent_get_invoice_documents(p_invoice_id)` (hanya baca; dihitung server saat dibaca), hanya cara menampilkannya yang diringkas. PRINSIP: yang NORMAL
// (ok / match / na) diringkas jadi satu baris / hitungan, yang BERMASALAH (diff / warn / none / missing) tampil lengkap. Susunan:
//   1. Summary card (selalu terbuka): chip overall + 1 kalimat hasil + red flags + Add documents / Analyse again + baris chip kelengkapan dokumen (popover doc_no + tanggal).
//   2. Line comparison (selalu terbuka, inti): tabel padat No | Invoice line | Amount | Attachment | Tax invoice, chip kecil per sisi; refs hanya di drawer saat baris diklik;
//      toggle "Show only items to check" (default ON bila overall='attention'); footer "Not in invoice (n)" tertutup.
//   3. Accordion "Checks" (tertutup bawaan, badge hitungan): Header checks, Dates, Tax totals (+ pemeriksaan faktur pajak lama sbg sub-bagian). Terbuka otomatis HANYA bila ada item
//      bermasalah DAN overall='attention'. Isi default = hanya baris diff / warn; yang ok diringkas "{n} ... match" + tombol "Show all ...".
//   4. Accordion "Files (n)" (tertutup, paling bawah; terbuka sendiri selama ada file 'processing').
// "Add documents" = alur susulan (proxy multipart cost_agent {mode:'susulan', invoice_id, hint}); "Analyse again" = fn_cost_agent_start_redo -> webhook {mode:'redo_docs', invoice_id,
// job_id} TANPA file. Keduanya TIDAK mengubah invoice, baris, maupun statusnya. Invoice lama (belum dianalisis) -> kartu "Not analysed yet"; FP belum ada -> "Waiting" (bukan error).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, AlertTriangle, MinusCircle, X, RefreshCw, FilePlus2, ChevronRight, ChevronDown } from 'lucide-react'
import { CostAgentFileDrop, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, SA_LABEL, SA_CARD } from './SeaAirAuditUi'
import type { Tone } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import CostAgentLinkDocumentDialog from './CostAgentLinkDocumentDialog'
import { LineVatDialog } from './CostAgentLineDialogs'
import { canLinkLine, manualTipLines, needsVatDecision, vatPctText, type VatChoice } from '../utils/CostAgentLinkLogic'
import { defaultOnlyCheck, hasDiff, needsCheck, sideState, LUMP_SUM_LABEL, type SideKind } from '../utils/CostAgentDocLines'
import { coveredReasonText, docTypeLabel, pageText, rangesText } from '../utils/CostAgentDocCards'
import { noteText, noteMsg } from '../utils/CostAgentNotes'
import {
  costAgentUpload, costAgentGetInvoiceDocuments, costAgentStartRedo, costAgentRedoDocs, fetchCostAgentJobSnapshot,
  fmtDate, fmtMoney, fmtNumber, fmtDateTimePort, DOC_TYPE_LABEL, TAX_STATUS_META,
  type CostAgentInvoiceHistory, type CostAgentInvoiceLine, type CostAgentDocCompare, type DocCmpLine, type DocCmpLineSide, type DocCmpPart, type DocCmpOrphan, type DocCmpOrphanCovered,
  type DocCmpHeaderCheck, type DocCmpDateCheck, type DocCmpCompleteness,
} from '../utils/CostAgentHelpers'

// ─── Tampilan status ──────────────────────────────────────────────────────────────────────────────────────────────
const OVERALL_META: Record<string, { label: string; tone: Tone }> = {
  not_analysed: { label: 'Not analysed', tone: 'grey' },
  incomplete: { label: 'Incomplete', tone: 'blue' },
  attention: { label: 'Attention', tone: 'red' },
  ok: { label: 'OK', tone: 'green' },
}
// Chip hasil bandingkan satu baris invoice dgn lampiran / faktur pajak. match_* tetap "Match" (varian di tooltip).
const LINE_CHIP: Record<string, { label: string; tone: Tone; tip?: string }> = {
  match: { label: 'Match', tone: 'green' },
  match_group: { label: 'Match', tone: 'green', tip: 'Matches a section total' },
  match_sum: { label: 'Match', tone: 'green', tip: 'Matches the sum of several items' },
  match_agg: { label: 'Match', tone: 'green', tip: 'Combined in one row' },
  match_gross: { label: 'Match · incl. VAT', tone: 'green', tip: 'Matches the document including VAT' },
  manual: { label: 'Linked manually', tone: 'blue' }, // SQL 109
  diff: { label: 'Different', tone: 'red' },
  none: { label: 'Not in attachment', tone: 'amber' },
  not_in_fp: { label: 'Not in tax invoice', tone: 'grey' },
  pending: { label: 'Waiting', tone: 'blue', tip: 'Waiting for the tax invoice' },
  not_required: { label: 'No VAT', tone: 'grey' },
  no_doc: { label: 'No attachment', tone: 'grey' },
}
const CMP_MARK = { ok: ['✔', 'text-[#17663D]'], diff: ['✘', 'text-[#A8231A]'], warn: ['⚠', 'text-[#B7791F]'], na: ['–', 'text-[#8A7A8B]'] } as Record<string, [string, string]>
const hasIssue = (l: DocCmpLine) => ['diff', 'none'].includes(l.attachment?.status || '') || ['diff', 'none'].includes(l.tax?.status || '')
const isIssueStatus = (s?: string | null) => s === 'diff' || s === 'warn'

function Mark({ status }: { status?: string | null }) {
  const [sym, cls] = CMP_MARK[status || 'na'] || CMP_MARK.na
  return <span className={`font-bold text-[13px] leading-none ${cls}`} aria-label={status || 'n/a'}>{sym}</span>
}
const cellVal = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? fmtNumber(v, 0) : String(v))
const partLabel = (p?: DocCmpPart | null) => (p ? `${DOC_TYPE_LABEL[p.doc_type as keyof typeof DOC_TYPE_LABEL] || p.doc_type || 'Document'}${p.doc_no ? ` · ${p.doc_no}` : ''}` : 'Document')
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// TH sudah memuat text-left, jadi perataan lain WAJIB memakai tanda seru (!text-center) -- tanpa itu header kolom tengah tetap rata kiri dan tidak sejajar dengan isinya (2026-10-29).
const TH = 'px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6] sticky top-0 z-[1]'
const TD = 'px-2 py-1.5 text-[12px] text-[#3B1B3D] align-top'
const SCROLL = 'max-h-[22rem] overflow-y-auto' // tabel > ~12 baris scroll di dalam

const TONE_CLS: Record<Tone, string> = {
  green: 'bg-[#EAF6EF] text-[#17663D]', red: 'bg-[#FDE7E4] text-[#A8231A]', blue: 'bg-[#EEF1FA] text-[#2F4FA8]', grey: 'bg-[#F3EEEA] text-[#6E5E70]',
  amber: 'bg-[#FFF1D6] text-[#7A4F00]', purple: 'bg-[#EFE7F7] text-[#5B2E8C]', plum: 'bg-[#F5EDF3] text-[#6B3470]',
}

// Accordion kartu putih: judul ungu + status (hitungan) di header; isi dirender hanya saat terbuka.
function Accordion({ id, title, status, open, onToggle, children }: { id: string; title: string; status: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={`${SA_CARD} overflow-hidden`} data-accordion={id} data-open={open ? 'true' : 'false'}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-[#FBF7F4] transition-colors">
        <ChevronDown size={14} className={`text-[#8A7A8B] shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#6B3470]">{title}</span>
        <span className="text-[12px] font-semibold">{status}</span>
      </button>
      {open && <div className="border-t border-[#EADFD6]">{children}</div>}
    </section>
  )
}
// Teks status header accordion: "— {n} to check" (merah) / "— {okText}" (hijau).
const checkStatus = (n: number, okText: string, tone: Tone = 'red') =>
  n > 0 ? <span className={tone === 'amber' ? 'text-[#B7791F]' : 'text-[#A8231A]'}>— {n} to check</span> : <span className="text-[#17663D]">— {okText}</span>
const Note = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-2.5 text-[12px] text-[#6E5E70]">{children}</p>

// ─── Komponen utama ───────────────────────────────────────────────────────────────────────────────────────────────
export default function CostAgentInvoiceDocuments({ data, canUpload, actor, onChanged, onToast, showLines = true }: {
  data: CostAgentInvoiceHistory
  canUpload: boolean
  actor?: string | null
  onChanged: () => Promise<void> | void
  onToast?: (msg: string, tone?: 'ok' | 'warn') => void
  showLines?: boolean // false = tabel per baris tidak ditampilkan di sini (dipasang langsung di tab Documents & Tax)
}) {
  const inv = data.invoice
  const [cmp, setCmp] = useState<CostAgentDocCompare | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openMap, setOpenMap] = useState<Record<string, boolean | undefined>>({})
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
  const attention = overall === 'attention'
  const busyJob = !!job || redoBusy
  const lines = cmp?.lines || []

  // Hitungan masalah per kelompok (utk badge accordion & auto-buka).
  const headerChecks = cmp?.header_checks || []
  const headerIssues = headerChecks.filter(c => isIssueStatus(c.status)).length
  const dateChecks = cmp?.date_checks || []
  const dateIssues = dateChecks.filter(c => isIssueStatus(c.status)).length
  const tt = cmp?.tax_totals || null
  const taxCheckIssues = (tt?.checks || []).filter(c => isIssueStatus(c.status)).length + (tt?.rate_checks || []).filter(c => isIssueStatus(c.status)).length
  const legacyIssues = data.tax_checks.filter(t => t.status === 'mismatch' || t.status === 'error').length
  const taxIssues = taxCheckIssues + legacyIssues
  const fileFailed = (cmp?.files || []).filter(f => f.analysis === 'failed' || f.status === 'failed').length
  const fileProcessing = (cmp?.files || []).filter(f => f.analysis === 'processing' || f.status === 'processing').length

  const isOpen = (k: string, autoOpen: boolean) => openMap[k] ?? autoOpen
  const toggle = (k: string, autoOpen: boolean) => setOpenMap(m => ({ ...m, [k]: !(m[k] ?? autoOpen) }))

  return (
    <div className="p-3 space-y-3" data-documents-tab>
      {susulanNotes.map((n, i) => (
        <div key={i} className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0"><span className="font-semibold">{noteText(n, inv)}</span>{noteMsg(n) && <span className="block text-[10.5px] text-[#8A7A8B]" data-note-msg>{noteMsg(n)}</span>}</span>
        </div>
      ))}

      <SummaryCard cmp={cmp} loading={loading} analysed={analysed} overall={overall} lines={lines} busyJob={busyJob} redoBusy={redoBusy} canUpload={canUpload} sending={sending}
        hasFiles={(cmp?.files || []).length > 0} onToggleUpload={() => setShowUpload(v => !v)} onAnalyse={analyseAgain} />
      {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}

      {canUpload && showUpload && (
        <section className={`${SA_CARD} p-3 space-y-3`} data-add-documents>
          <div>
            <h3 className="text-[13px] font-bold text-[#3B1B3D]">Add documents</h3>
            <p className="text-[11.5px] text-[#6E5E70]">Tax invoice (Faktur Pajak), PO, receipt, attachments. The invoice and its status do not change.</p>
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

      {/* Invoice lama: hanya kartu "Not analysed yet" (panel lain disembunyikan). Pemeriksaan faktur pajak lama tetap bisa dibuka bila ada (jangan hilangkan data). */}
      {cmp && !analysed && data.tax_checks.length > 0 && (
        <Accordion id="tax" title="Tax totals" status={checkStatus(legacyIssues, 'all match')} open={isOpen('tax', false)} onToggle={() => toggle('tax', false)}>
          <LegacyTaxChecks data={data} />
        </Accordion>
      )}

      {cmp && analysed && (
        <>
          {showLines && <DocLineComparison cmp={cmp} />}

          <div className="space-y-2" data-checks-group>
            <Accordion id="header" title="Header checks" status={headerChecks.length === 0 ? <span className="text-[#8A7A8B]">— no data</span> : checkStatus(headerIssues, 'all match')}
              open={isOpen('header', false)} onToggle={() => toggle('header', false)}>
              <HeaderChecks checks={headerChecks} partById={partById} />
            </Accordion>
            <Accordion id="dates" title="Dates" status={dateChecks.length === 0 ? <span className="text-[#8A7A8B]">— no data</span> : checkStatus(dateIssues, 'all consistent')}
              open={isOpen('dates', false)} onToggle={() => toggle('dates', false)}>
              <DatesChecks checks={dateChecks} />
            </Accordion>
            <Accordion id="tax" title="Tax totals" status={!tt && parts.filter(p => p.doc_type === 'faktur_pajak').length === 0 && data.tax_checks.length === 0 ? <span className="text-[#8A7A8B]">— no tax invoice yet</span> : checkStatus(taxIssues, 'all match')}
              open={isOpen('tax', false)} onToggle={() => toggle('tax', false)}>
              <TaxTotals cmp={cmp} parts={parts} data={data} />
            </Accordion>
          </div>
        </>
      )}

      {cmp && analysed && (
        <Accordion id="files" title={`Files (${(cmp.files || []).length})`}
          status={<>{fileFailed > 0 && <Chip tone="red" className="mr-1">{fileFailed} failed</Chip>}{fileProcessing > 0 && <Chip tone="blue">{fileProcessing} processing</Chip>}</>}
          open={isOpen('files', anyProcessing)} onToggle={() => toggle('files', anyProcessing)}>
          <FilesList cmp={cmp} canUpload={canUpload} busy={busyJob} onAnalyse={analyseAgain} />
        </Accordion>
      )}

    </div>
  )
}

// ─── 1. Summary card ──────────────────────────────────────────────────────────────────────────────────────────────
// Hitungan baris untuk ringkasan: "differences" = baris dengan sel Diff (merah); "to check" = sisanya yang punya sel Missing (kuning) yang diharapkan. Baris netral tidak dihitung.
const lineCounts = (lines: DocCmpLine[]) => ({ diffs: lines.filter(hasDiff).length, check: lines.filter(l => needsCheck(l) && !hasDiff(l)).length })
function resultSentence(overall: string, lines: DocCmpLine[], completeness: DocCmpCompleteness[]): string {
  if (overall === 'ok') return 'All lines match the attachments and tax invoice.'
  if (overall === 'attention') {
    const { diffs, check } = lineCounts(lines)
    const bits = [diffs > 0 && plural(diffs, 'difference'), check > 0 && `${check} to check`].filter(Boolean)
    return bits.length ? `${bits.join(' · ')}.` : 'Some document checks need attention.'
  }
  if (overall === 'incomplete') {
    const pending = completeness.filter(c => c.status === 'pending').map(c => c.label.toLowerCase())
    const missing = completeness.filter(c => c.status === 'missing').map(c => c.label.toLowerCase())
    const bits = [pending.length > 0 && `Waiting for ${pending.join(', ')}`, missing.length > 0 && `Missing ${missing.join(', ')}`].filter(Boolean)
    return bits.length ? `${bits.join(' · ')}.` : 'Some documents are incomplete.'
  }
  return ''
}

function CompletenessChip({ row }: { key?: React.Key; row: DocCmpCompleteness }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const docs = row.docs || []
  const st = row.status === 'present' ? { tone: 'green' as Tone, text: `✔${docs.length > 1 ? ` ${docs.length}` : ''}` }
    : row.status === 'missing' ? (row.required ? { tone: 'red' as Tone, text: '✘' } : { tone: 'grey' as Tone, text: '–' })
    : row.status === 'pending' ? { tone: 'blue' as Tone, text: 'Pending' } : { tone: 'grey' as Tone, text: 'Not required' }
  const tip = docs.length ? docs.map(d => `${d.doc_no || '—'}${d.doc_date ? ` · ${fmtDate(d.doc_date)}` : ''}`).join('\n')
    : row.status === 'pending' ? 'Waiting for the document' : row.status === 'not_required' ? 'Not required for this invoice' : row.status === 'missing' ? 'Missing' : ''
  return (
    <span ref={ref} className="relative inline-block" data-completeness-chip={row.key}>
      <button type="button" onClick={() => setOpen(o => !o)} title={tip} aria-expanded={open}
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold ${TONE_CLS[st.tone]} hover:brightness-95`}>
        {row.label} <span className={row.status === 'present' ? 'text-[#17663D]' : row.status === 'missing' && row.required ? 'text-[#A8231A]' : ''}>{st.text}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 min-w-[180px] max-w-[280px] rounded-lg border border-[#EADFD6] bg-white shadow-xl p-2 text-[11.5px] text-[#3B1B3D]">
          {docs.length === 0 ? <span className="text-[#6E5E70]">{tip || '—'}</span> : docs.map((d, i) => (
            <div key={i} className="tabular-nums [overflow-wrap:anywhere]"><b>{d.doc_no || '—'}</b>{d.doc_date && <span className="text-[#8A7A8B]"> · {fmtDate(d.doc_date)}</span>}</div>
          ))}
        </div>
      )}
    </span>
  )
}

function SummaryCard({ cmp, loading, analysed, overall, lines, busyJob, redoBusy, canUpload, sending, hasFiles, onToggleUpload, onAnalyse }: {
  cmp: CostAgentDocCompare | null; loading: boolean; analysed: boolean; overall: string; lines: DocCmpLine[]; busyJob: boolean; redoBusy: boolean
  canUpload: boolean; sending: boolean; hasFiles: boolean; onToggleUpload: () => void; onAnalyse: () => void
}) {
  const baseMeta = OVERALL_META[overall] || OVERALL_META.not_analysed
  const { diffs, check } = lineCounts(lines)
  const meta = overall === 'attention' && diffs === 0 ? { ...baseMeta, tone: 'amber' as Tone } : baseMeta // kuning bila tidak ada Diff (jangan merah utk peringatan)
  const buttons = canUpload && (
    <div className="ml-auto flex items-center gap-2 flex-wrap">
      <button type="button" className={SA_BTN_OUTLINE} onClick={onToggleUpload} disabled={sending || busyJob}><FilePlus2 size={13} /> Add documents</button>
      <button type="button" className={SA_BTN_OUTLINE} onClick={onAnalyse} disabled={busyJob || (!hasFiles && !loading)}
        title="Read the stored documents again. The invoice, its lines and its status are not changed.">
        <RefreshCw size={13} className={redoBusy ? 'animate-spin' : ''} /> {redoBusy ? 'Starting…' : 'Analyse again'}
      </button>
    </div>
  )
  // Invoice lama (belum dibaca dokumennya): hanya kartu ini + Analyse again.
  if (cmp && !analysed) {
    return (
      <div className={`${SA_CARD} px-4 py-3 flex items-start gap-3 flex-wrap`} data-doc-summary data-not-analysed>
        <MinusCircle size={18} className="text-[#8A7A8B] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-[#3B1B3D]">Not analysed yet — documents of this invoice have not been read for comparison</p>
          {busyJob && <span className="inline-flex items-center gap-1.5 text-[12px] text-[#2F4FA8] mt-1"><LoadingSpinner className="shrink-0" /> Reading the documents…</span>}
        </div>
        {buttons}
      </div>
    )
  }
  const sentence = analysed ? resultSentence(overall, lines, cmp?.completeness || []) : ''
  const completeness = cmp?.completeness || []
  return (
    <div className={`${SA_CARD} px-4 py-3 space-y-2`} data-doc-summary>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone={meta.tone} className="!text-[12px] !px-2.5 !py-1">{loading && !cmp ? 'Loading…' : meta.label}</Chip>
        {sentence && <span className="text-[12.5px] font-semibold text-[#3B1B3D] min-w-0">{sentence}</span>}
        {analysed && diffs > 0 && <Chip tone="red">{plural(diffs, 'difference')}</Chip>}
        {analysed && check > 0 && <Chip tone="amber">{check} to check</Chip>}
        {busyJob && <span className="inline-flex items-center gap-1.5 text-[12px] text-[#2F4FA8]"><LoadingSpinner className="shrink-0" /> Reading the documents…</span>}
        {buttons}
      </div>
      {completeness.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" data-doc-completeness>
          {completeness.map(c => <CompletenessChip key={c.key} row={c} />)}
        </div>
      )}
    </div>
  )
}

// ─── 2. Line comparison ───────────────────────────────────────────────────────────────────────────────────────────
// Angka dokumen pada satu sisi (lampiran / faktur pajak): `matched_amount`; cadangan = nilai invoice − selisih (`diff` = invoice − dokumen). null bila tak ada (Not in …, Waiting, No VAT).
const docAmountOf = (side: DocCmpLineSide | null, invoiceAmount: number | null): number | null => {
  if (!side) return null
  if (side.matched_amount != null) return Number(side.matched_amount)
  if (side.status === 'match_gross') return invoiceAmount // nominal baris itu sendiri (sudah termasuk PPN)
  if (side.diff != null && invoiceAmount != null) return Number(invoiceAmount) - Number(side.diff)
  return null
}
// Sel perbandingan (Tahap 3c, 2026-10-28): SATU chip per sisi -- OK / Diff (+selisih) / Missing / n/a. Nominal dokumen & rujukan (nomor dokumen) hanya di tooltip dan di drawer baris.
// Selisih = nilai invoice - nilai dokumen (kontrak server). Tidak ada aturan baru: status dibaca apa adanya dari fn_cost_agent_get_invoice_documents.
function SideChip({ side, kind, expect, invoiceAmount, partById }: { side: DocCmpLineSide | null; kind: SideKind; expect?: DocCmpLine['expect']; invoiceAmount: number | null; partById: Map<number, DocCmpPart> }) {
  if (!side) return <Chip tone="grey" title="No comparison">n/a</Chip>
  const v = sideState(side, kind, expect) // Missing -> n/a netral bila dokumen itu tidak diharapkan (expect, SQL 093)
  const meta = LINE_CHIP[side.status]
  const amount = docAmountOf(side, invoiceAmount)
  const refs = (side.refs || []).map(r => { const p = partById.get(r.part_id); return partLabel(p) !== 'Document' ? partLabel(p) : [DOC_TYPE_LABEL[r.doc_type as keyof typeof DOC_TYPE_LABEL] || r.doc_type, r.doc_no].filter(Boolean).join(' · ') }).filter(Boolean)
  const lump = kind === 'tax' && side.status === 'match_agg' // FP lumpsum (SQL 097): label & tooltip dari server (tax.note), tanpa teks 'Combined in one row'
  const tip = (lump ? [v.tip, amount != null ? `Document amount: ${fmtMoney(amount)}` : null, ...Array.from(new Set(refs))] : [v.tip, meta?.label, meta?.tip, side.status === 'match_gross' ? side.note : null, amount != null ? `Document amount: ${fmtMoney(amount)}` : null, ...Array.from(new Set(refs))]).filter(Boolean).join('\n')
  const title = side.status === 'manual' ? [v.tip, amount != null ? `Document amount: ${fmtMoney(amount)}` : null, ...Array.from(new Set(refs))].filter(Boolean).join('\n') : tip
  const chip = <Chip tone={v.tone} title={title || undefined} className={lump ? '!whitespace-normal text-center leading-tight' : ''}>{v.label}</Chip>
  // Tautan manual: selisih (diff) tetap terlihat di bawah chip bila tidak 0.
  return v.sub ? <span className="inline-flex flex-col items-center gap-0.5" data-manual-chip>{chip}<span className="text-[10.5px] font-semibold text-[#A8231A] tabular-nums" data-manual-diff>{v.sub}</span></span> : chip
}

// Tabel per baris yang berdiri sendiri (Tahap 3c, 2026-10-28): dipasang langsung di tab Documents & Tax (bukan di popup). Menyimpan sendiri filter "Show only items to check"
// (otomatis ON bila overall='attention') dan drawer rujukan per baris. Data = cmp dari fn_cost_agent_get_invoice_documents.
// Hak ubah bukti baris (SQL 108/109): evidence.canEdit dihitung dari peran + status (canEditLineEvidence); tanpa evidence / canEdit=false = tidak ada tombol (Approver hanya melihat).
export interface LineEvidenceCtx {
  canEdit: boolean
  lines: CostAgentInvoiceLine[] // baris invoice: penanda amount_includes_vat dibaca dari sini
  onChanged: () => Promise<void> | void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}
export function DocLineComparison({ cmp, evidence }: { cmp: CostAgentDocCompare | null; evidence?: LineEvidenceCtx }) {
  const [onlyCheck, setOnlyCheck] = useState<boolean | null>(null)
  const [detail, setDetail] = useState<DocCmpLine | null>(null)
  const [linkFor, setLinkFor] = useState<DocCmpLine | null>(null)
  const [vatFor, setVatFor] = useState<{ line: CostAgentInvoiceLine; preset: VatChoice } | null>(null)
  const parts = cmp?.parts || []
  const partById = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts])
  const lines = cmp?.lines || []
  if (!cmp || !cmp.analysed || lines.length === 0) return null
  return (
    <>
      <LineComparison lines={lines} orphans={cmp.orphans} onlyCheck={onlyCheck ?? defaultOnlyCheck(lines)} setOnlyCheck={setOnlyCheck} onOpen={setDetail} partById={partById}
        evidence={evidence} onLink={setLinkFor} onVat={(l, preset) => { const full = evidence?.lines.find(x => x.id === l.line_id); if (full) setVatFor({ line: full, preset }) }} />
      {detail && <LineDrawer line={detail} partById={partById} onClose={() => setDetail(null)} />}
      {linkFor && evidence && <CostAgentLinkDocumentDialog line={linkFor} onClose={() => setLinkFor(null)} onChanged={evidence.onChanged} onToast={evidence.onToast} />}
      {vatFor && evidence && <LineVatDialog line={vatFor.line} preset={vatFor.preset} onClose={() => setVatFor(null)}
        onSaved={async () => { setVatFor(null); await evidence.onChanged(); evidence.onToast('VAT setting saved.') }} />}
    </>
  )
}

function LineComparison({ lines, orphans, onlyCheck, setOnlyCheck, onOpen, partById, evidence, onLink, onVat }: {
  evidence?: LineEvidenceCtx; onLink: (l: DocCmpLine) => void; onVat: (l: DocCmpLine, preset: VatChoice) => void
  lines: DocCmpLine[]; orphans: { attachment: DocCmpOrphan[] | null; tax: DocCmpOrphan[] | null; attachment_covered?: DocCmpOrphanCovered[] | null } | null
  onlyCheck: boolean; setOnlyCheck: (v: boolean) => void; onOpen: (l: DocCmpLine) => void; partById: Map<number, DocCmpPart>
}) {
  const shown = onlyCheck ? lines.filter(needsCheck) : lines
  const hidden = lines.length - shown.length
  const att = orphans?.attachment || [], tax = orphans?.tax || []
  const orphanN = att.length + tax.length
  const covered = orphans?.attachment_covered || [] // SQL 098: bukti ganda dari baris yang sudah cocok (netral, bukan orphan)
  const [orphanOpen, setOrphanOpen] = useState(false)
  const [coveredOpen, setCoveredOpen] = useState(false)
  const issues = lines.filter(needsCheck).length
  const anyDiff = lines.some(hasDiff)
  return (
    <section className={`${SA_CARD} overflow-hidden`} data-line-compare-card>
      <div className="px-4 py-2.5 flex items-center gap-2.5 flex-wrap">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">Per-line comparison</h3>
        <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{plural(lines.length, 'line')}</span>
        {issues > 0 ? <Chip tone={anyDiff ? 'red' : 'amber'}>{issues} to check</Chip> : <Chip tone="green">all match</Chip>}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer select-none">
          <input type="checkbox" className="accent-[#6B3470]" checked={onlyCheck} onChange={e => setOnlyCheck(e.target.checked)} data-only-check /> Show only items to check
        </label>
      </div>
      <div className="max-h-[26rem] overflow-auto border-t border-[#EADFD6]">
        <table className="w-full min-w-[640px] table-fixed" data-line-compare>
          <colgroup><col className="w-[48px]" /><col className="w-[38%]" /><col className="w-[17%]" /><col className="w-[15%]" /><col className="w-[24%]" /><col className="w-[28px]" /></colgroup>
          <thead><tr>
            <th className={`${TH} !text-center`}>Line</th><th className={TH}>Description</th><th className={`${TH} text-right pr-[10%]`}>Invoice</th>
            <th className={`${TH} !text-center`}>Attachment</th><th className={`${TH} !text-center`}>Tax invoice</th><th className={TH} aria-label="Details" />
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-[12px] text-[#17663D] font-semibold">Nothing to check — all lines match.</td></tr>}
            {shown.map(l => {
              const diff = hasDiff(l)
              const none = !diff && needsCheck(l)
              const cell = 'px-2 py-2 align-middle text-[12px] text-[#3B1B3D]'
              const vatDecision = !!evidence && needsVatDecision(l.includes_vat_hint, evidence.lines.find(x => x.id === l.line_id)?.amount_includes_vat)
              return (
                <tr key={l.line_id} onClick={() => onOpen(l)} data-line-row={l.line_no} data-line-state={diff ? 'diff' : none ? 'none' : 'ok'} title="Click for the document references"
                  className={`border-t border-[#F3EEEA] cursor-pointer hover:bg-[#F8F1EE] border-l-4 ${diff ? 'border-l-[#A8231A] bg-[#FFFAF9]' : none ? 'border-l-[#E0A526] bg-[#FFFDF6]' : 'border-l-transparent odd:bg-white even:bg-[#FCFAF8]'}`}>
                  <td className={`${cell} text-center text-[#8A7A8B] tabular-nums`}>{l.line_no}</td>
                  <td className={`${cell} min-w-0`}>
                    <span className="font-semibold [overflow-wrap:anywhere]">{l.description || '—'}</span>
                    {l.cost_item && <span className="ml-2 align-middle inline-block rounded bg-[#F3EEEA] px-1.5 py-px font-mono text-[10px] text-[#6E5E70] whitespace-nowrap">{l.cost_item}</span>}
                    {evidence && (vatDecision || (evidence.canEdit && canLinkLine(l))) && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                        {vatDecision && (
                          // Ringkas satu baris (2026-10-30, permintaan user): kalimat panjang pindah ke tooltip.
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#FFF1D6] pl-2 pr-1 py-0.5 text-[11px] font-semibold text-[#7A4F00]" data-vat-hint={l.line_no}
                            title={`Matches the documents as price + VAT${vatPctText(l.vat_rate) ? ` (${vatPctText(l.vat_rate)})` : ''}: confirm whether the amount includes VAT`}>
                            <AlertTriangle size={11} className="shrink-0" /> Includes VAT{vatPctText(l.vat_rate) ? ` ${vatPctText(l.vat_rate)}` : ''}?
                            {evidence.canEdit && <>
                              <button type="button" className="h-5 px-2 rounded-full border border-[#E0A526] bg-white text-[10.5px] font-bold hover:bg-[#FFF8E6]" data-vat-yes onClick={() => onVat(l, 'yes')}>Yes</button>
                              <button type="button" className="h-5 px-2 rounded-full border border-[#E0A526] bg-white text-[10.5px] font-bold hover:bg-[#FFF8E6]" data-vat-no onClick={() => onVat(l, 'no')}>No</button>
                            </>}
                          </span>
                        )}
                        {evidence.canEdit && canLinkLine(l) && (
                          <button type="button" data-link-document={l.line_no} onClick={() => onLink(l)} className="h-6 px-2 rounded-full border border-[#E4D3E2] bg-[#F5EDF3] text-[11px] font-semibold text-[#6B3470] hover:bg-[#EFE2EC] hover:border-[#C9A9C4]">Link document…</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`${cell} text-right tabular-nums whitespace-nowrap font-semibold pr-[10%]`}>{fmtMoney(l.amount)}</td>
                  <td className={`${cell} text-center`}><SideChip side={l.attachment} kind="attachment" expect={l.expect} invoiceAmount={l.amount} partById={partById} /></td>
                  <td className={`${cell} text-center`}><SideChip side={l.tax} kind="tax" expect={l.expect} invoiceAmount={l.amount} partById={partById} /></td>
                  <td className={`${cell} text-[#B9A9BA]`}><ChevronRight size={13} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {onlyCheck && hidden > 0 && <div className="px-4 py-1.5 border-t border-[#F3EEEA] bg-[#FBF7F4] text-[11.5px] text-[#6E5E70]" data-hidden-lines>{plural(hidden, 'matching line')} hidden</div>}
      {orphanN > 0 && (
        <div className="border-t border-[#EADFD6] bg-[#FBF7F4]" data-orphans>
          <button type="button" onClick={() => setOrphanOpen(v => !v)} aria-expanded={orphanOpen} className="w-full px-4 py-1.5 flex items-center gap-1.5 text-left text-[12px] font-semibold text-[#6B3470] hover:underline">
            <ChevronDown size={13} className={`transition-transform ${orphanOpen ? '' : '-rotate-90'}`} /> Not in invoice ({orphanN})
          </button>
          {orphanOpen && <OrphanLists att={att} tax={tax} />}
        </div>
      )}
      {covered.length > 0 && (
        <div className="border-t border-[#EADFD6] bg-white" data-orphans-covered>
          <button type="button" onClick={() => setCoveredOpen(v => !v)} aria-expanded={coveredOpen} className="w-full px-4 py-1.5 flex items-center gap-1.5 text-left text-[12px] font-semibold text-[#6E5E70] hover:underline">
            <ChevronDown size={13} className={`transition-transform ${coveredOpen ? '' : '-rotate-90'}`} /> Also supports an invoice line ({covered.length})
          </button>
          {coveredOpen && <CoveredList items={covered} />}
        </div>
      )}
    </section>
  )
}

// Item lampiran yang HANYA bukti ganda baris invoice yang sudah cocok (SQL 098): jenis · nomor · uraian · nominal + keterangan kecil dari `reason`. Warna netral.
function CoveredList({ items }: { items: DocCmpOrphanCovered[] }) {
  return (
    <ul className="px-4 pb-3 space-y-1 text-[12px] text-[#3B1B3D] max-h-[14rem] overflow-y-auto" data-covered-list>
      {items.map((o, i) => (
        <li key={`${o.item_id ?? o.part_id}-${i}`} className="min-w-0" data-covered-reason={o.reason ?? ''}>
          <div className="flex items-start gap-2"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{[DOC_TYPE_LABEL[o.doc_type as keyof typeof DOC_TYPE_LABEL] || o.doc_type, o.doc_no, o.description].filter(Boolean).join(' · ')}</span><b className="tabular-nums whitespace-nowrap">{fmtMoney(o.amount)}</b></div>
          {coveredReasonText(o.reason) && <div className="text-[11px] text-[#8A7A8B]">{coveredReasonText(o.reason)}</div>}
        </li>
      ))}
    </ul>
  )
}

function OrphanLists({ att, tax }: { att: DocCmpOrphan[]; tax: DocCmpOrphan[] }) {
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
  return <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[14rem] overflow-y-auto">{list('In attachments', att)}{list('In tax invoices', tax)}</div>
}

// Drawer detail satu baris: SEMUA referensi lampiran & faktur pajak (doc_type · doc_no · description · amount per ref).
function LineDrawer({ line, partById, onClose }: { line: DocCmpLine; partById: Map<number, DocCmpPart>; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const side = (title: string, s: DocCmpLineSide | null) => {
    const lump = title === 'Tax invoice' && s?.status === 'match_agg'
    const chip = s ? (lump ? { label: LUMP_SUM_LABEL, tone: 'green' as Tone, tip: s.note ?? undefined } : (LINE_CHIP[s.status] || { label: s.status, tone: 'grey' as Tone })) : null
    const gross = s?.status === 'match_gross'
    const shownAmount = s?.matched_amount ?? (gross ? line.amount : null) // match_gross: nominal baris itu sendiri, bukan jumlah refs
    return (
      <div className="rounded-xl border border-[#EADFD6] p-3">
        <div className="flex items-center gap-2 flex-wrap"><span className="text-[12.5px] font-bold text-[#3B1B3D]">{title}</span>{chip && <Chip tone={chip.tone} title={chip.tip}>{chip.label}</Chip>}
          {shownAmount != null && <span className="tabular-nums text-[12px] font-semibold">{fmtMoney(shownAmount)}</span>}
          {s?.status === 'diff' && s.diff != null && <span className="text-[11.5px] font-semibold text-[#A8231A] tabular-nums">Difference vs invoice: {fmtNumber(s.diff, 0)}</span>}</div>
        {s?.status === 'manual' && (
          <div className="mt-1.5 rounded-lg bg-[#EEF1FA] px-2.5 py-1.5 text-[12px] text-[#2F4FA8] [overflow-wrap:anywhere]" data-manual-info>
            {manualTipLines(s.manual, a => fmtDateTimePort(a, null)).map((t, i) => <div key={i}>{t}</div>)}
            {s.note && <div className="text-[11px] opacity-80">{s.note}</div>}
          </div>
        )}
        {(gross || lump) && (s?.note || s?.base != null) && (
          <p className="mt-1.5 text-[12px] text-[#6E5E70] [overflow-wrap:anywhere]" data-side-note>
            {s?.note}{s?.base != null && <span className="block text-[11px] text-[#8A7A8B]">Before VAT: <b className="tabular-nums text-[#3B1B3D]">{fmtMoney(s.base)}</b></span>}
          </p>
        )}
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

// ─── 3a. Header checks (Invoice vs attachments + Invoice vs tax invoice) ───────────────────────────────────────────
function HeaderChecks({ checks, partById }: { checks: DocCmpHeaderCheck[]; partById: Map<number, DocCmpPart> }) {
  const [showAll, setShowAll] = useState(false)
  const okN = checks.filter(c => c.status === 'ok').length
  const rows = showAll ? checks : checks.filter(c => isIssueStatus(c.status))
  if (checks.length === 0) return <Note>No header data to compare.</Note>
  // Kelompokkan per dokumen (part_id): doc_type + doc_no; kelompok attachment / tax dibedakan label kecil.
  const order: string[] = []
  const keyOf = (c: DocCmpHeaderCheck) => `${c.group}:${c.part_id ?? 'none'}`
  rows.forEach(r => { if (!order.includes(keyOf(r))) order.push(keyOf(r)) })
  let n = 0
  return (
    <div data-header-checks>
      {rows.length === 0 ? <Note>All consistent — {plural(okN, 'field')} match.</Note> : (
        <div className={SCROLL}>
          <table className="w-full min-w-[560px]">
            <thead><tr><th className={`${TH} w-9`}>No</th><th className={TH}>Field</th><th className={TH}>Invoice data</th><th className={TH}>Document data</th><th className={`${TH} !text-center`}>Status</th></tr></thead>
            <tbody>
              {order.map(k => {
                const first = rows.find(r => keyOf(r) === k)!
                const p = first.part_id != null ? partById.get(first.part_id) : undefined
                return (
                  <React.Fragment key={k}>
                    <tr className="bg-[#F5EDF3]"><td colSpan={5} className="px-2 py-1 text-[11px] font-bold text-[#6B3470]">{partLabel(p)} <span className="font-normal text-[#8A7A8B]">· {first.group === 'tax' ? 'tax invoice' : 'attachment'}{p?.doc_date ? ` · ${fmtDate(p.doc_date)}` : ''}</span></td></tr>
                    {rows.filter(r => keyOf(r) === k).map((r, i) => (
                      <tr key={i} className="border-t border-[#F3EEEA]" title={r.note || undefined}>
                        <td className={`${TD} text-[#8A7A8B] tabular-nums`}>{++n}</td>
                        <td className={`${TD} font-semibold`}>{r.field}{r.note && <div className="text-[10.5px] font-normal text-[#8A7A8B]">{r.note}</div>}</td>
                        <td className={`${TD} tabular-nums [overflow-wrap:anywhere]`}>{cellVal(r.invoice_value)}</td>
                        <td className={`${TD} tabular-nums [overflow-wrap:anywhere] ${r.status === 'diff' ? 'text-[#A8231A] font-semibold' : ''}`}>{cellVal(r.doc_value)}</td>
                        <td className={`${TD} text-center`}><Mark status={r.status} /></td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-1.5 border-t border-[#F3EEEA] bg-[#FBF7F4] flex items-center gap-3 text-[11.5px] text-[#6E5E70]">
        {!showAll && rows.length > 0 && okN > 0 && <span>{plural(okN, 'field')} match</span>}
        {checks.length > rows.length || showAll ? (
          <button type="button" className="font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show only fields to check' : 'Show all fields'}</button>
        ) : null}
      </div>
    </div>
  )
}

// ─── 3b. Dates ────────────────────────────────────────────────────────────────────────────────────────────────────
function DatesChecks({ checks }: { checks: DocCmpDateCheck[] }) {
  const [showAll, setShowAll] = useState(false)
  if (checks.length === 0) return <Note>No date to compare.</Note>
  const okN = checks.filter(c => c.status === 'ok').length
  const rows = showAll ? checks : checks.filter(c => isIssueStatus(c.status))
  return (
    <div data-date-checks>
      {rows.length === 0 ? <Note>All consistent — {plural(okN, 'date')} consistent.</Note> : (
        <div className={SCROLL}>
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={TH}>Source</th><th className={TH}>Label</th><th className={TH}>Date</th><th className={TH}>Compared to</th><th className={`${TH} text-right`}>Gap</th><th className={`${TH} !text-center`}>Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[#F3EEEA]" title={r.note || undefined}>
                  <td className={TD}>{r.source || '—'}{r.doc_no && <div className="text-[10.5px] text-[#8A7A8B]">{r.doc_no}</div>}</td>
                  <td className={`${TD} font-semibold`}>{r.label}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{fmtDate(r.date)}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{fmtDate(r.compare_to)}</td>
                  <td className={`${TD} text-right tabular-nums ${r.status === 'diff' ? 'text-[#A8231A] font-semibold' : ''}`}>{r.gap_days != null ? `${r.gap_days} d` : '—'}</td>
                  <td className={`${TD} text-center`}><Mark status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-1.5 border-t border-[#F3EEEA] bg-[#FBF7F4] flex items-center gap-3 text-[11.5px] text-[#6E5E70]">
        {!showAll && rows.length > 0 && okN > 0 && <span>{plural(okN, 'date')} consistent</span>}
        {checks.length > rows.length || showAll ? (
          <button type="button" className="font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show only dates to check' : 'Show all dates'}</button>
        ) : null}
      </div>
    </div>
  )
}

// ─── 3c. Tax totals (+ 3d pemeriksaan faktur pajak lama sbg sub-bagian) ──────────────────────────────────────────
function TaxTotals({ cmp, parts, data }: { cmp: CostAgentDocCompare; parts: DocCmpPart[]; data: CostAgentInvoiceHistory }) {
  const t = cmp.tax_totals
  const fps = parts.filter(p => p.doc_type === 'faktur_pajak') // SQL 097: hanya dokumen resmi (e-Faktur / Coretax); nota Pelindo = lampiran (Port note)
  // FP lumpsum: baris invoice yang tercakup = baris ber-`tax.status = match_agg` (daftar singkat; nomor dari status baris, bukan dihitung ulang)
  const covered = (cmp.lines || []).filter(l => l.tax?.status === 'match_agg').map(l => l.line_no)
  const checks = t?.checks || [], rates = t?.rate_checks || []
  const failed = [...checks.filter(c => isIssueStatus(c.status)).map(c => ({ kind: 'check' as const, c })), ...rates.filter(c => isIssueStatus(c.status)).map(c => ({ kind: 'rate' as const, c }))]
  const passed = checks.length + rates.length - failed.length
  // Pemeriksaan OK yang tanpa nilai invoice tapi punya note = informasi, bukan error (mis. "VAT is included in the invoice lines (matched including VAT)").
  const infoNotes = checks.filter(c => !isIssueStatus(c.status) && c.invoice_value == null && !!c.note)
  if (!t && fps.length === 0 && data.tax_checks.length === 0) return <Note>No tax invoice to compare yet.</Note>
  return (
    <div className="p-3 space-y-2.5" data-tax-totals>
      {fps.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {fps.map(p => {
            const dup = p.duplicate_of != null
            const collected = Number(p.ppn || 0) > 0
            return (
              <div key={p.id} className={`rounded-lg border px-3 py-2 text-[12px] ${dup ? 'border-[#EADFD6] bg-[#F6F1EE] opacity-70' : 'border-[#EADFD6] bg-white'}`} data-fp-card>
                <div className="flex items-center gap-2 flex-wrap"><b className="text-[#3B1B3D] tabular-nums">{p.doc_no || 'No serial number'}</b><span className="text-[#6E5E70]">{fmtDate(p.doc_date)}</span>
                  <Chip tone={collected ? 'green' : 'grey'} className="ml-auto">{collected ? 'VAT collected' : 'VAT not collected'}</Chip></div>
                <div className="mt-1 text-[11.5px] text-[#6E5E70]">Selling price <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(p.total_amount)}</b>{collected && <> · VAT <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(p.ppn)}</b></>}{Number(p.stamp_duty || 0) > 0 && <> · Stamp duty <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(p.stamp_duty)}</b></>}</div>
                {pageText(p.page_from, p.page_to) && <div className="mt-0.5 text-[11px] text-[#8A7A8B]">{p.file_name ? `${p.file_name} · ` : ''}{pageText(p.page_from, p.page_to)}</div>}
                {dup && <p className="mt-1 text-[11px] text-[#8A7A8B]">Duplicate of #{p.duplicate_of} — not used in comparison</p>}
              </div>
            )
          })}
        </div>
      )}
      {covered.length > 0 && (
        <p className="text-[12px] text-[#17663D] font-semibold" data-lump-covered>Covered by the lump-sum tax invoice: {plural(covered.length, 'line')} <span className="font-normal text-[#6E5E70]">({rangesText(covered)})</span></p>
      )}
      {failed.length > 0 && (
        <div className={`${SCROLL} rounded-lg border border-[#EADFD6]`}>
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={TH}>Check</th><th className={`${TH} text-right`}>Invoice</th><th className={`${TH} text-right`}>Document</th><th className={`${TH} text-right`}>Difference</th><th className={`${TH} !text-center`}>Status</th></tr></thead>
            <tbody>
              {failed.map((f, i) => f.kind === 'check' ? (
                <tr key={i} className="border-t border-[#F3EEEA]" title={f.c.note || undefined}>
                  <td className={`${TD} font-semibold`}>{f.c.label}{f.c.note && <div className="text-[10.5px] font-normal text-[#8A7A8B]">{f.c.note}</div>}</td>
                  <td className={`${TD} text-right tabular-nums`}>{cellVal(f.c.invoice_value)}</td><td className={`${TD} text-right tabular-nums`}>{cellVal(f.c.doc_value)}</td>
                  <td className={`${TD} text-right tabular-nums ${f.c.diff ? 'text-[#A8231A] font-semibold' : ''}`}>{f.c.diff != null ? fmtNumber(f.c.diff, 0) : '—'}</td><td className={`${TD} text-center`}><Mark status={f.c.status} /></td>
                </tr>
              ) : (
                <tr key={i} className="border-t border-[#F3EEEA]" title={f.c.note || undefined}>
                  <td className={`${TD} font-semibold`}>VAT rate · {f.c.doc_no || '—'}{f.c.note && <div className="text-[10.5px] font-normal text-[#8A7A8B]">{f.c.note}</div>}</td>
                  <td className={`${TD} text-right tabular-nums`} colSpan={3}>{f.c.rate_pct != null ? `${fmtNumber(f.c.rate_pct, 2)}%` : '—'}</td><td className={`${TD} text-center`}><Mark status={f.c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {failed.length === 0 && passed > 0 && <p className="text-[12px] text-[#6E5E70]">{plural(passed, 'check')} passed.</p>}
      {failed.length > 0 && passed > 0 && <p className="text-[11.5px] text-[#6E5E70]">{plural(passed, 'check')} passed.</p>}
      {infoNotes.length > 0 && (
        <ul className="space-y-0.5 text-[11.5px] text-[#6E5E70]" data-tax-info-notes>
          {infoNotes.map((c, i) => <li key={i} className="flex items-start gap-1.5"><Mark status={c.status} /><span className="min-w-0 [overflow-wrap:anywhere]"><b className="text-[#3B1B3D]">{c.label}</b> — {c.note}</span></li>)}
        </ul>
      )}
      {data.tax_checks.length > 0 && <LegacyTaxChecks data={data} />}
    </div>
  )
}

// Pemeriksaan faktur pajak LAMA (tax_checks) -- sub-bagian di bawah Tax totals.
function LegacyTaxChecks({ data }: { data: CostAgentInvoiceHistory }) {
  const docs = data.documents || []
  const docForTax = (taxId: number) => docs.find(d => d.tax_check_id === taxId)
  return (
    <div className="p-3 pt-2 space-y-2" data-legacy-tax-checks>
      <div className={SA_LABEL}>Tax invoice checks</div>
      {data.tax_checks.map(t => {
        const meta = TAX_STATUS_META[t.status]
        const doc = docForTax(t.id)
        const url = doc?.file_url || t.file_url
        const bad = (t.check_results || []).filter(c => !c.ok)
        return (
          <div key={t.id} className="rounded-lg border border-[#EADFD6] px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <Chip tone={meta?.tone || 'grey'}>{meta?.label || t.status}</Chip>
              <b className="text-[#3B1B3D]">{t.fp_number || 'No FP number'}</b>
              <span className="text-[#6E5E70]">{fmtDate(t.fp_date)}</span>
              <span className="text-[#6E5E70] tabular-nums">DPP {fmtMoney(t.dpp)} · VAT {fmtMoney(t.ppn)}</span>
              {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-[#6B3470] hover:underline inline-flex items-center gap-1 text-[11.5px]">{doc?.file_name || t.file_name || 'Document'} <ExternalLink size={11} /></a>}
            </div>
            {t.error_message && <p className="text-[11.5px] text-[#A8231A] mt-1">{t.error_message}</p>}
            {bad.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11.5px]">
                {bad.map((c, i) => <li key={i} className="text-[#A8231A]"><b>{c.field}</b>: expected {String(c.expected ?? '—')}, actual {String(c.actual ?? '—')}</li>)}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── 4. Files ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ANALYSIS_CHIP: Record<string, { label: string; tone: Tone }> = {
  analysed: { label: 'Analysed', tone: 'green' }, processing: { label: 'Processing', tone: 'blue' },
  failed: { label: 'Failed', tone: 'red' }, not_analysed: { label: 'Not analysed', tone: 'grey' },
}
function FilesList({ cmp, canUpload, busy, onAnalyse }: { cmp: CostAgentDocCompare; canUpload: boolean; busy: boolean; onAnalyse: () => void }) {
  const files = cmp.files || []
  const dupsOf = (fileId: number) => (cmp.parts || []).filter(p => p.file_id === fileId && p.duplicate_of != null)
  // Dokumen logis di dalam file (file campuran): jenis, nomor & halaman; duplikat tidak ikut (ditampilkan terpisah di bawah).
  const docsIn = (fileId: number) => (cmp.parts || []).filter(p => p.file_id === fileId && p.duplicate_of == null).sort((a, b) => (a.page_from ?? 0) - (b.page_from ?? 0))
  if (files.length === 0) return <Note>No files yet.</Note>
  return (
    <div className={`${SCROLL} divide-y divide-[#F3EEEA]`} data-doc-files>
      {files.map(f => {
        const a = ANALYSIS_CHIP[f.analysis] || { label: f.analysis, tone: 'grey' as Tone }
        const failed = f.analysis === 'failed' || f.status === 'failed'
        const dups = dupsOf(f.id)
        return (
          <div key={f.id} className="px-4 py-1.5 text-[12px]" data-file-row>
            <div className="flex items-center gap-2 min-w-0">
              {f.file_url ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-1 min-w-0"><span className="truncate">{f.file_name || 'File'}</span><ExternalLink size={11} className="shrink-0" /></a>
                : <span className="font-semibold text-[#3B1B3D] truncate min-w-0">{f.file_name || 'File'}</span>}
              <span className="text-[11px] text-[#6E5E70] whitespace-nowrap">{DOC_TYPE_LABEL[f.doc_type as keyof typeof DOC_TYPE_LABEL] || f.doc_type}</span>
              <Chip tone={a.tone}>{a.label}</Chip>
              <span className="ml-auto text-[11px] text-[#8A7A8B] whitespace-nowrap">{fmtDateTimePort(f.created_at, null)}</span>
            </div>
            {failed && (
              <div className="mt-0.5 flex items-start gap-2 text-[11.5px] text-[#A8231A]">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{f.analysis_error || 'Analysis failed.'}</span>
                {canUpload && <button type="button" className={`${SA_BTN_OUTLINE} h-6 px-2 shrink-0`} onClick={onAnalyse} disabled={busy}><RefreshCw size={11} /> Analyse again</button>}
              </div>
            )}
            {docsIn(f.id).length > 0 && <div className="mt-0.5 text-[11px] text-[#6E5E70]" data-file-docs>{docsIn(f.id).map(p => `${docTypeLabel(p.doc_type)}${p.doc_no ? ` ${p.doc_no}` : ''}${pageText(p.page_from, p.page_to) ? ` (${pageText(p.page_from, p.page_to)})` : ''}`).join(' · ')}</div>}
            {dups.map(p => <div key={p.id} className="mt-0.5 text-[11px] text-[#8A7A8B]" data-part-row="duplicate">{partLabel(p)} — Duplicate of #{p.duplicate_of} — not used in comparison</div>)}
          </div>
        )
      })}
    </div>
  )
}
