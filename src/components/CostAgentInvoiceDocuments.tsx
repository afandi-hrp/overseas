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
import { noteText, noteMsg } from '../utils/CostAgentNotes'
import {
  costAgentUpload, costAgentGetInvoiceDocuments, costAgentStartRedo, costAgentRedoDocs, fetchCostAgentJobSnapshot,
  fmtDate, fmtMoney, fmtNumber, fmtDateTimePort, DOC_TYPE_LABEL, TAX_STATUS_META,
  type CostAgentInvoiceHistory, type CostAgentDocCompare, type DocCmpLine, type DocCmpLineSide, type DocCmpPart, type DocCmpOrphan,
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
  const [onlyCheck, setOnlyCheck] = useState<boolean | null>(null) // null = otomatis (ON bila overall='attention')
  const [openMap, setOpenMap] = useState<Record<string, boolean | undefined>>({})
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
          <LineComparison lines={lines} orphans={cmp.orphans} onlyCheck={onlyCheck ?? attention} setOnlyCheck={setOnlyCheck} onOpen={setDetail} />

          <div className="space-y-2" data-checks-group>
            <Accordion id="header" title="Header checks" status={headerChecks.length === 0 ? <span className="text-[#8A7A8B]">— no data</span> : checkStatus(headerIssues, 'all match')}
              open={isOpen('header', attention && headerIssues > 0)} onToggle={() => toggle('header', attention && headerIssues > 0)}>
              <HeaderChecks checks={headerChecks} partById={partById} />
            </Accordion>
            <Accordion id="dates" title="Dates" status={dateChecks.length === 0 ? <span className="text-[#8A7A8B]">— no data</span> : checkStatus(dateIssues, 'all consistent')}
              open={isOpen('dates', attention && dateIssues > 0)} onToggle={() => toggle('dates', attention && dateIssues > 0)}>
              <DatesChecks checks={dateChecks} />
            </Accordion>
            <Accordion id="tax" title="Tax totals" status={!tt && parts.filter(p => p.is_tax_equivalent).length === 0 && data.tax_checks.length === 0 ? <span className="text-[#8A7A8B]">— no tax invoice yet</span> : checkStatus(taxIssues, 'all match')}
              open={isOpen('tax', attention && taxIssues > 0)} onToggle={() => toggle('tax', attention && taxIssues > 0)}>
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

      {detail && <LineDrawer line={detail} partById={partById} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ─── 1. Summary card ──────────────────────────────────────────────────────────────────────────────────────────────
function resultSentence(overall: string, lines: DocCmpLine[], completeness: DocCmpCompleteness[]): string {
  if (overall === 'ok') return 'All lines match the attachments and tax invoice.'
  if (overall === 'attention') {
    let d = 0, x = 0
    lines.forEach(l => {
      if (l.attachment?.status === 'diff' || l.tax?.status === 'diff') d++
      else if (l.attachment?.status === 'none' || l.tax?.status === 'none') x++
    })
    const n = d + x
    if (n === 0) return 'Some document checks need attention.'
    const bits = [d > 0 && `${d} different amount${d === 1 ? '' : 's'}`, x > 0 && `${x} not found`].filter(Boolean)
    return `${n} need${n === 1 ? 's' : ''} checking: ${bits.join(', ')}.`
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
  const meta = OVERALL_META[overall] || OVERALL_META.not_analysed
  const redFlags = cmp?.summary?.red_flags ?? 0
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
        {analysed && redFlags > 0 && <Chip tone="red">{plural(redFlags, 'red flag')}</Chip>}
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
  if (side.diff != null && invoiceAmount != null) return Number(invoiceAmount) - Number(side.diff)
  return null
}
// Sel perbandingan (2026-10-23, permintaan user): chip status + ANGKA DARI DOKUMENNYA (bukan selisih, yang membingungkan). Selisih hanya di tooltip & drawer.
function SideChip({ side, invoiceAmount }: { side: DocCmpLineSide | null; invoiceAmount: number | null }) {
  if (!side) return <span className="text-[#8A7A8B]">—</span>
  const chip = LINE_CHIP[side.status] || { label: side.status, tone: 'grey' as Tone }
  const tip = side.status === 'match_sum' ? `Matches the sum of ${(side.refs || []).length} items` : chip.tip
  const amount = docAmountOf(side, invoiceAmount)
  const diffTip = side.status === 'diff' && side.diff != null ? `Difference vs invoice: ${fmtNumber(side.diff, 0)}` : undefined
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <Chip tone={chip.tone} title={tip}>{chip.label}</Chip>
      {amount != null && <span className={`text-[12px] tabular-nums whitespace-nowrap ${side.status === 'diff' ? 'font-bold text-[#A8231A]' : 'font-semibold text-[#3B1B3D]'}`} title={diffTip} data-doc-amount>{fmtMoney(amount)}</span>}
    </span>
  )
}

function LineComparison({ lines, orphans, onlyCheck, setOnlyCheck, onOpen }: {
  lines: DocCmpLine[]; orphans: { attachment: DocCmpOrphan[] | null; tax: DocCmpOrphan[] | null } | null
  onlyCheck: boolean; setOnlyCheck: (v: boolean) => void; onOpen: (l: DocCmpLine) => void
}) {
  const shown = onlyCheck ? lines.filter(hasIssue) : lines
  const hidden = lines.length - shown.length
  const att = orphans?.attachment || [], tax = orphans?.tax || []
  const orphanN = att.length + tax.length
  const [orphanOpen, setOrphanOpen] = useState(false)
  return (
    <section className={`${SA_CARD} overflow-hidden`} data-line-compare-card>
      <div className="px-4 pt-2.5 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#6B3470]">Line comparison</h3>
        <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer select-none">
          <input type="checkbox" className="accent-[#6B3470]" checked={onlyCheck} onChange={e => setOnlyCheck(e.target.checked)} data-only-check /> Show only items to check
        </label>
      </div>
      {lines.length === 0 ? <p className="px-4 pb-3 text-[12px] text-[#8A7A8B] italic">No invoice lines.</p> : (
        <div className={`${SCROLL} border-t border-[#EADFD6]`}>
          <table className="w-full min-w-[640px]" data-line-compare>
            <thead><tr><th className={`${TH} w-9`}>No</th><th className={TH}>Invoice line</th><th className={`${TH} text-right`}>Amount</th><th className={TH}>Attachment</th><th className={TH}>Tax invoice</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-[12px] text-[#17663D] font-semibold">Nothing to check — all lines match.</td></tr>}
              {shown.map(l => {
                const diff = l.attachment?.status === 'diff' || l.tax?.status === 'diff'
                const none = !diff && (l.attachment?.status === 'none' || l.tax?.status === 'none')
                return (
                  <tr key={l.line_id} onClick={() => onOpen(l)} data-line-row={l.line_no} data-line-state={diff ? 'diff' : none ? 'none' : 'ok'}
                    className={`border-t border-[#F3EEEA] cursor-pointer hover:bg-[#FBF7F4] border-l-4 ${diff ? 'border-l-[#A8231A] bg-[#FFFAF9]' : none ? 'border-l-[#E0A526] bg-[#FFFDF6]' : 'border-l-transparent'}`}>
                    <td className={`${TD} text-[#8A7A8B] tabular-nums`}>{l.line_no}</td>
                    <td className={`${TD} min-w-[200px]`}>
                      <div className="font-semibold [overflow-wrap:anywhere]">{l.description || '—'}</div>
                      <div className="text-[10.5px] text-[#8A7A8B]">{l.cost_item || 'No cost item'}</div>
                    </td>
                    <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold`}>{fmtMoney(l.amount)}</td>
                    <td className={TD}><SideChip side={l.attachment} invoiceAmount={l.amount} /></td>
                    <td className={TD}><span className="inline-flex items-center gap-1"><SideChip side={l.tax} invoiceAmount={l.amount} /><ChevronRight size={12} className="text-[#B9A9BA]" /></span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {onlyCheck && hidden > 0 && <div className="px-4 py-1.5 border-t border-[#F3EEEA] bg-[#FBF7F4] text-[11.5px] text-[#6E5E70]" data-hidden-lines>{plural(hidden, 'matching line')} hidden</div>}
      {orphanN > 0 && (
        <div className="border-t border-[#EADFD6] bg-[#FBF7F4]" data-orphans>
          <button type="button" onClick={() => setOrphanOpen(v => !v)} aria-expanded={orphanOpen} className="w-full px-4 py-1.5 flex items-center gap-1.5 text-left text-[12px] font-semibold text-[#6B3470] hover:underline">
            <ChevronDown size={13} className={`transition-transform ${orphanOpen ? '' : '-rotate-90'}`} /> Not in invoice ({orphanN})
          </button>
          {orphanOpen && <OrphanLists att={att} tax={tax} />}
        </div>
      )}
    </section>
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
    const chip = s ? (LINE_CHIP[s.status] || { label: s.status, tone: 'grey' as Tone }) : null
    return (
      <div className="rounded-xl border border-[#EADFD6] p-3">
        <div className="flex items-center gap-2 flex-wrap"><span className="text-[12.5px] font-bold text-[#3B1B3D]">{title}</span>{chip && <Chip tone={chip.tone} title={chip.tip}>{chip.label}</Chip>}
          {s?.matched_amount != null && <span className="tabular-nums text-[12px] font-semibold">{fmtMoney(s.matched_amount)}</span>}
          {s?.status === 'diff' && s.diff != null && <span className="text-[11.5px] font-semibold text-[#A8231A] tabular-nums">Difference vs invoice: {fmtNumber(s.diff, 0)}</span>}</div>
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
            <thead><tr><th className={`${TH} w-9`}>No</th><th className={TH}>Field</th><th className={TH}>Invoice data</th><th className={TH}>Document data</th><th className={`${TH} text-center`}>Status</th></tr></thead>
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
            <thead><tr><th className={TH}>Source</th><th className={TH}>Label</th><th className={TH}>Date</th><th className={TH}>Compared to</th><th className={`${TH} text-right`}>Gap</th><th className={`${TH} text-center`}>Status</th></tr></thead>
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
  const fps = parts.filter(p => p.is_tax_equivalent)
  const checks = t?.checks || [], rates = t?.rate_checks || []
  const failed = [...checks.filter(c => isIssueStatus(c.status)).map(c => ({ kind: 'check' as const, c })), ...rates.filter(c => isIssueStatus(c.status)).map(c => ({ kind: 'rate' as const, c }))]
  const passed = checks.length + rates.length - failed.length
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
                <div className="mt-1 text-[11.5px] text-[#6E5E70]">Selling price <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(p.total_amount)}</b>{collected && <> · VAT <b className="text-[#3B1B3D] tabular-nums">{fmtMoney(p.ppn)}</b></>}</div>
                {dup && <p className="mt-1 text-[11px] text-[#8A7A8B]">Duplicate of #{p.duplicate_of} — not used in comparison</p>}
              </div>
            )
          })}
        </div>
      )}
      {failed.length > 0 && (
        <div className={`${SCROLL} rounded-lg border border-[#EADFD6]`}>
          <table className="w-full min-w-[520px]">
            <thead><tr><th className={TH}>Check</th><th className={`${TH} text-right`}>Invoice</th><th className={`${TH} text-right`}>Document</th><th className={`${TH} text-right`}>Difference</th><th className={`${TH} text-center`}>Status</th></tr></thead>
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
            {dups.map(p => <div key={p.id} className="mt-0.5 text-[11px] text-[#8A7A8B]" data-part-row="duplicate">{partLabel(p)} — Duplicate of #{p.duplicate_of} — not used in comparison</div>)}
          </div>
        )
      })}
    </div>
  )
}
