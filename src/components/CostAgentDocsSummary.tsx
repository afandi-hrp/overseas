// Tab "Documents & Tax" -- tampilan RINGKAS (Summary), disederhanakan di Tahap 3c (2026-10-28, SQL 092). Dari atas ke bawah, hanya empat hal
// (+ strip PERIODE di paling atas, 2026-10-29: periode invoice & periode voyage report dari gerbang server, periode lampiran = rentang tanggal dokumen lampiran):
//   1. baris status HANYA untuk keadaan khusus (memeriksa / gagal / dimatikan / membaca dokumen); pil "Ready to submit" & hitungan dokumen/catatan dihapus 2026-10-29 (duplikat);
//   2. tiga kartu dokumen SATU BARIS (urutan: Invoice, Tax invoice, Attachment): ikon, judul (+ jumlah), "Received <tanggal>" / "Not received", View (satu dokumen) / Upload / panah buka; rincian
//      per dokumen logis (jenis, nomor, halaman "p. 3–5", View ke file MILIK dokumen itu + #page=N; duplikat berlabel "Duplicate") TERTUTUP sampai panah diklik -- SQL 097, utils/CostAgentDocCards.ts;
//   3. "Must fix" -- hanya `blockers` (maks 5, lalu "Show all N"), tiap baris + "Go to line";
//   (+ tabel per baris Invoice / Attachment / Tax invoice di antara Must fix dan Notes)
//   4. "Notes" -- hanya `warnings`, accordion TERTUTUP, dikelompokkan (Tax invoice / Dates & voyage / Other); tidak pernah memblokir Submit.
// Semua rincian lain (tiga cek validasi + Accuracy, laporan 4 kolom + Print, tabel per baris, Header checks / Dates / Tax totals, Files, Add documents, Analyse again)
// ada di modal "Full comparison". Data dari RPC yang sama (get_invoice_documents / get_doc_gate); tidak ada aturan bisnis di sini.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronDown, ExternalLink, FilePlus2, FileText, Maximize2, Pencil, RefreshCw } from 'lucide-react'
import { CostAgentFileDrop, CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, Pill, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import CostAgentFullComparison from './CostAgentFullComparison'
import { DocLineComparison } from './CostAgentInvoiceDocuments'
import {
  costAgentGetInvoiceDocuments, costAgentUpload, fetchCostAgentJobSnapshot, fmtDate,
  type CostAgentDocCompare, type CostAgentInvoiceHistory, type DocCmpFile, type DocCmpPart,
} from '../utils/CostAgentHelpers'
import { PERIOD_SOURCE_TEXT, type DocGate, type GateItem } from '../utils/CostAgentGate'
import { groupNotes, noteRowCount, visibleBlockers, MUST_FIX_LIMIT, type NoteRow } from '../utils/CostAgentGateView'
import { attachmentDateRange, buildDocCards, cardCount, type CardKey } from '../utils/CostAgentDocCards'

// Urutan kartu: Invoice dulu, lalu Tax invoice, lalu lampiran (Attachment: termasuk Port note / PNBP).
const DOC_ROWS: { key: CardKey; title: string; upload: boolean }[] = [
  { key: 'invoice', title: 'Invoice', upload: false },
  { key: 'tax_invoice', title: 'Tax invoice', upload: true },
  { key: 'attachment', title: 'Attachment', upload: true },
]

const GoLine = ({ n, onGo, label }: { n: number; onGo: (n: number) => void; label?: string }) => (
  <button type="button" className="shrink-0 underline text-[11.5px] font-semibold hover:no-underline" onClick={() => onGo(n)}>{label ?? `Go to line ${n}`}</button>
)

export default function CostAgentDocsSummary({ data, gate, gateError, gateBusy, canUpload, canEditEvidence, actor, onRecheck, onChanged, onToast, onGoToLine, onSetPeriod }: {
  data: CostAgentInvoiceHistory
  gate: DocGate | null
  gateError: string | null
  gateBusy: boolean
  canUpload: boolean
  canEditEvidence: boolean // SQL 109: tombol "Link document…" + Yes / No "Amount includes VAT" (peran + status; server tetap menegakkan)
  actor: string | null
  onRecheck: () => void
  onChanged: () => Promise<void> | void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onGoToLine: (lineNo: number) => void
  onSetPeriod?: () => void
}) {
  const inv = data.invoice
  const [cmp, setCmp] = useState<CostAgentDocCompare | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [upload, setUpload] = useState(false)
  const [job, setJob] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({})
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try { setCmp(await costAgentGetInvoiceDocuments(inv.id)); setError(null) } catch (e: any) { setError(e.message || String(e)) } finally { if (!silent) setLoading(false) }
  }, [inv.id])
  useEffect(() => { load() }, [load])

  // File masih diproses / unggah susulan dilacak: baca ulang senyap tiap 5 dtk sampai selesai.
  const processing = (cmp?.files || []).some(f => f.analysis === 'processing' || f.status === 'processing')
  useEffect(() => {
    if (!processing && !job) return
    const iv = setInterval(async () => {
      try {
        if (job) {
          const snap = await fetchCostAgentJobSnapshot(job, [inv.id])
          if (snap.done) { setJob(null); await load(true); await onChangedRef.current(); onToast('Documents added — comparison updated') }
        } else await load(true)
      } catch { /* sementara */ }
    }, 5000)
    return () => clearInterval(iv)
  }, [processing, job, inv.id, load, onToast])

  const completeness = cmp?.completeness || []
  const cards = useMemo(() => buildDocCards(cmp, inv.files, inv.created_at), [cmp, inv.files, inv.created_at])
  const npwpChips = (cmp?.header_checks || []).filter(h => h.group === 'tax' && /npwp/i.test(h.field))
  // Faktur pajak = HANYA doc_type faktur_pajak (SQL 097; nota Pelindo = Port note di Attachment). `is_tax_equivalent` tidak dipakai lagi.
  const taxPart = (cmp?.parts || []).find(p => p.doc_type === 'faktur_pajak' && p.duplicate_of == null)

  // Strip periode: invoice & voyage report apa adanya dari gerbang (fn_cost_agent_get_doc_gate); lampiran = rentang tanggal dokumen lampiran (attachmentDateRange).
  const rangeText = (a: string | null | undefined, b: string | null | undefined): string | null => (a || b ? (a && b && a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`) : null)
  const invoicePeriod = rangeText(gate?.period?.from, gate?.period?.to)
  const voyagePeriod = rangeText(gate?.voyage?.arrived, gate?.voyage?.departed)
  const attRange = useMemo(() => attachmentDateRange(cmp?.parts), [cmp?.parts])
  const attachmentPeriod = rangeText(attRange?.from, attRange?.to)

  const blockers: GateItem[] = gate?.enabled ? (gate.blockers ?? []) : []
  const groups = useMemo(() => groupNotes(gate?.enabled ? gate.warnings : []), [gate])
  const notesN = noteRowCount(groups)
  const shown = visibleBlockers(blockers, showAll)

  return (
    <div className="space-y-3" data-docs-summary>
      {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}

      {/* 0. Periode (paling atas) + tombol */}
      <div className="flex items-center gap-x-2.5 gap-y-2 flex-wrap" data-period-strip>
        <PeriodItem label="Invoice period" value={invoicePeriod} loading={!gate} emptyText="Not set" emptyTone="red" data-period="invoice"
          title={gate?.period?.source ? PERIOD_SOURCE_TEXT[gate.period.source] : 'The period (arrival – departure) of the invoice'} onEdit={onSetPeriod} />
        <PeriodItem label="Attachment period" value={attachmentPeriod} loading={loading && !cmp} emptyText="not found" emptyTone="grey" data-period="attachment"
          title="Earliest – latest date of the attachment documents (port notes, PNBP, pre-invoices …)" />
        <PeriodItem label="Voyage report" value={voyagePeriod} loading={!gate} emptyText="not linked" emptyTone="grey" data-period="voyage"
          title="Arrival – departure of the linked voyage report" />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={`${SA_BTN_OUTLINE} !h-8 !px-2.5`} onClick={onRecheck} disabled={gateBusy} title="Check the documents again" data-recheck>
            <RefreshCw size={12} className={gateBusy ? 'animate-spin' : ''} /> Re-check
          </button>
          <button type="button" className={`${SA_BTN_OUTLINE} !h-8 !px-3`} onClick={() => setFull(true)} data-full-comparison-btn><Maximize2 size={12} /> Full comparison</button>
        </div>
      </div>

      {/* 1. Status: HANYA keadaan khusus (memeriksa / gagal / dimatikan / membaca dokumen). Verdict 'Ready to submit', hitungan dokumen & catatan dihapus 2026-10-29
          (permintaan user): duplikat kartu dokumen, bagian Notes, dan tombol Submit. Temuan penghalang tampil di 'Must fix'. */}
      {!gate || !gate.enabled || processing || !!job ? (
        <section className={`${SA_CARD} px-4 py-2.5 flex items-center gap-3 flex-wrap`} data-gate-status>
          {gateError && !gate ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#A8231A]" role="alert"><AlertTriangle size={14} /> Document check failed: {gateError}</span>
            : !gate ? <span className="inline-flex items-center gap-2 text-[12.5px] text-[#6E5E70]"><LoadingSpinner /> Checking documents…</span>
              : !gate.enabled ? <span className="text-[12.5px] text-[#8A7A8B]">The document check is switched off.</span> : null}
          {(processing || job) && <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#2F4FA8]"><LoadingSpinner /> Reading documents…</span>}
        </section>
      ) : null}

      {/* 2. Tiga chip dokumen */}
      <div className="@container">
        {loading && !cmp ? <div className="py-4 flex justify-center"><LoadingSpinner /></div> : (
          <div className="grid grid-cols-1 @min-[720px]:grid-cols-3 gap-2.5 items-start" data-docs-card>
            {DOC_ROWS.map(r => {
              const c = completeness.find(x => x.key === r.key)
              const docs = cards[r.key]
              const n = cardCount(docs)
              const present = c?.status === 'present' || n > 0
              const status = c?.status
              const first = docs.find(d => d.duplicateOf == null) ?? docs[0]
              const statusText = present ? (first?.received ? `Received ${fmtDate(first.received)}` : 'Received')
                : status === 'pending' ? 'Waiting' : status === 'not_required' ? 'Not required' : 'Not received'
              const statusCls = present ? 'text-[#17663D]' : status === 'pending' ? 'text-[#2F4FA8]' : status === 'not_required' ? 'text-[#8A7A8B]' : 'text-[#A8231A]'
              const hasFp = r.key === 'tax_invoice' && (!!taxPart || npwpChips.length > 0)
              const expandable = docs.length > 1 || hasFp // satu dokumen tanpa rincian tambahan cukup satu baris (View di baris itu)
              const open = !!openCards[r.key]
              return (
                <div key={r.key} className={`rounded-xl border px-3 py-2 min-w-0 ${present ? 'border-[#EADFD6] bg-white' : 'border-dashed border-[#E4D3E2] bg-[#FBF7F4]'}`} data-doc-row={r.key} data-doc-count={n}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ${present ? 'bg-[#F5EDF3] text-[#6B3470]' : 'bg-white text-[#A99AAB] border border-[#EADFD6]'}`}>{present ? <FileText size={14} /> : <FilePlus2 size={14} />}</span>
                    <div className="min-w-0 flex-1 truncate text-[12.5px]" title={`${r.title}${n > 1 ? ` · ${n}` : ''} — ${statusText}`}>
                      <b className="text-[#3B1B3D]">{r.title}</b>{n > 1 && <span className="text-[11px] font-semibold text-[#8A7A8B]"> · {n}</span>}
                      <span className={`ml-2 text-[11.5px] font-semibold ${statusCls}`}>{statusText}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {n === 1 && first?.url && <a href={first.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#EADFD6] bg-white text-[#6B3470] hover:bg-[#F5EDF3]" title="View the file" aria-label={`View ${r.title}`} data-doc-view><ExternalLink size={13} /></a>}
                      {r.upload && canUpload && <button type="button" className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#EADFD6] bg-white text-[#6B3470] hover:bg-[#F5EDF3]" onClick={() => setUpload(true)} title={`Upload ${r.title.toLowerCase()}`} aria-label={`Upload ${r.title}`}><FilePlus2 size={13} /></button>}
                      {expandable && <button type="button" className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#6E5E70] hover:bg-[#F5EDF3]" aria-expanded={open} aria-label={open ? `Hide ${r.title} details` : `Show ${r.title} details`} title={open ? 'Hide details' : 'Show details'} data-doc-toggle
                        onClick={() => setOpenCards(o => ({ ...o, [r.key]: !o[r.key] }))}><ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} /></button>}
                    </div>
                  </div>
                  {expandable && open && (
                    <div className="mt-2 pt-2 border-t border-[#F3EEEA]">
                      {docs.length > 0 && (
                        <ul className="space-y-1 max-h-44 overflow-y-auto" data-doc-entries>
                          {docs.map((d, i) => (
                            <li key={d.partId ?? `f${i}`} data-doc-entry data-dup={d.duplicateOf != null ? '1' : '0'} title={[d.fileName, d.pages].filter(Boolean).join(' · ') || undefined}
                              className={`flex items-center gap-1.5 min-w-0 text-[11.5px] ${d.duplicateOf != null ? 'text-[#8A7A8B]' : 'text-[#3B1B3D]'}`}>
                              <span className="shrink-0 font-semibold">{d.label}</span>
                              {d.docNo && <span className="min-w-0 truncate tabular-nums text-[#6E5E70]">{d.docNo}</span>}
                              {d.pages && <span className="shrink-0 tabular-nums text-[#8A7A8B]" data-doc-pages>{d.pages}</span>}
                              {d.duplicateOf != null && <Chip tone="grey" title="Same document as an earlier one (opens the original); not counted twice">Duplicate</Chip>}
                              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="ml-auto shrink-0 inline-flex items-center gap-0.5 font-semibold text-[#6B3470] hover:underline" title={d.duplicateOf != null ? 'Open the original document' : 'Open the file at this document'}><ExternalLink size={11} /> View</a>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {hasFp && (
                        <div className={`${docs.length > 0 ? 'mt-1.5 ' : ''}flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] text-[#6E5E70]`} data-fp-info>
                          {taxPart && <span><b className="tabular-nums text-[#3B1B3D]">{taxPart.doc_no || '—'}</b>{taxPart.doc_date && <> · {fmtDate(taxPart.doc_date)}</>}</span>}
                          {npwpChips.map((h, i) => <Chip key={i} tone={h.status === 'ok' ? 'green' : h.status === 'diff' ? 'red' : 'grey'}>{h.field} {h.status === 'ok' ? 'matches' : h.status === 'diff' ? 'differs' : 'n/a'}</Chip>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. Must fix */}
      {gate?.enabled && blockers.length > 0 && (
        <section className={`${SA_CARD} p-4`} data-must-fix>
          <div className="flex items-center gap-2 mb-2"><h3 className="text-[14px] font-bold text-[#3B1B3D]">Must fix</h3>{blockers.length > 0 && <Chip tone="red">{blockers.length}</Chip>}</div>
          {(
            <>
              <ul className="space-y-1.5" data-must-fix-list>
                {shown.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#A8231A]">
                    <span>•</span>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><b>{b.label}</b>{b.detail ? <span className="block text-[11.5px] font-normal opacity-90">{b.detail}</span> : null}</span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {b.line_no ? <GoLine n={b.line_no} onGo={onGoToLine} label="Go to line" /> : null}
                      {onSetPeriod && b.code === 'period_missing' ? <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2 !text-[11.5px]`} onClick={onSetPeriod}><Pencil size={11} /> Set period</button> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {blockers.length > MUST_FIX_LIMIT && (
                <button type="button" className="mt-2 text-[12px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAll(v => !v)} data-show-all>
                  {showAll ? 'Show fewer' : `Show all ${blockers.length}`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* Tabel per baris (Invoice vs Attachment vs Tax invoice) langsung di tab, bukan di popup */}
      <DocLineComparison cmp={cmp} evidence={{ canEdit: canEditEvidence, lines: data.lines, onChanged: async () => { await load(true); await onChangedRef.current() }, onToast }} />

      {/* 4. Notes (tertutup bawaan) */}
      {gate?.enabled && (
        <section className={`${SA_CARD} overflow-hidden`} data-notes>
          <button type="button" onClick={() => setNotesOpen(o => !o)} aria-expanded={notesOpen} className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-[#FBF7F4]">
            <ChevronDown size={14} className={`text-[#8A7A8B] transition-transform ${notesOpen ? '' : '-rotate-90'}`} />
            <span className="text-[14px] font-bold text-[#3B1B3D]">Notes</span>
            <Chip tone={notesN > 0 ? 'amber' : 'green'}>{notesN}</Chip>
            <span className="text-[11.5px] text-[#6E5E70]">do not block submit</span>
          </button>
          {notesOpen && (
            <div className="border-t border-[#EADFD6] px-4 py-3 space-y-3" data-notes-body>
              {groups.length === 0 && <p className="text-[12.5px] text-[#6E5E70] italic">No notes.</p>}
              {groups.map(g => (
                <div key={g.key} data-note-group={g.key}>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">{g.title}</div>
                  {g.hint && <p className="text-[11.5px] text-[#6E5E70] mb-1">{g.hint}</p>}
                  <ul className="space-y-0.5">
                    {g.rows.map(r => <Fragment key={r.key}><NoteRowView row={r} onGoToLine={onGoToLine} onSetPeriod={onSetPeriod} /></Fragment>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {full && <CostAgentFullComparison data={data} cmp={cmp} gate={gate} canUpload={canUpload} actor={actor} onClose={() => setFull(false)} onToast={onToast}
        onChanged={async () => { await load(true); await onChangedRef.current() }} />}
      {upload && <SupportingUpload invoiceId={inv.id} onClose={() => setUpload(false)} onSent={id => { setUpload(false); if (id) setJob(id); else { onToast('Documents sent. Reload in a moment to see the comparison.'); load(true) } load(true) }} />}
    </div>
  )
}

// Satu butir periode di strip puncak: ikon kalender + label + rentang tanggal (atau teks kosong berwarna). Hanya tampilan.
function PeriodItem({ label, value, loading, emptyText, emptyTone, title, onEdit, ...rest }: {
  label: string; value: string | null; loading: boolean; emptyText: string; emptyTone: 'red' | 'grey'; title?: string; onEdit?: () => void; 'data-period': string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white border border-[#EADFD6] text-[12px] whitespace-nowrap" title={title} data-period={rest['data-period']}>
      <CalendarDays size={13} className="text-[#9A8A9C] shrink-0" />
      <span className="text-[#6E5E70]">{label}</span>
      {loading ? <span className="text-[#8A7A8B]">…</span>
        : value ? <b className="text-[#3B1B3D] tabular-nums">{value}</b>
          : <span className={emptyTone === 'red' ? 'font-semibold text-[#A8231A]' : 'italic text-[#8A7A8B]'}>{emptyText}</span>}
      {onEdit && <button type="button" onClick={onEdit} className="p-0.5 rounded-md text-[#6E5E70] hover:bg-[#F6EFEA] hover:text-[#6B3470]" aria-label="Edit invoice period" title="Edit period (arrival – departure)"><Pencil size={11} /></button>}
    </span>
  )
}

// Satu baris Notes: judul (+ nomor baris sebagai tautan), bisa dibuka untuk melihat teks `detail` tiap temuan.
function NoteRowView({ row, onGoToLine, onSetPeriod }: { row: NoteRow; onGoToLine: (n: number) => void; onSetPeriod?: () => void }) {
  const [open, setOpen] = useState(false)
  const merged = row.key === 'line_not_in_fp'
  return (
    <li className="rounded-lg hover:bg-[#FBF7F4]" data-note-row={row.key}>
      <div className="flex items-start gap-1.5 px-1.5 py-1">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details'} className="mt-0.5 shrink-0 text-[#8A7A8B]">
          <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <div className="min-w-0 flex-1 text-[12.5px] text-[#7A4F00] [overflow-wrap:anywhere]">
          <button type="button" className="text-left font-semibold" onClick={() => setOpen(o => !o)}>{row.title}</button>
          {merged && row.lines.length > 0 && (
            <span className="text-[#7A4F00]"> ({row.lines.length === 1 ? 'line' : 'lines'}{' '}
              {row.lines.map((n, i) => <span key={n}>{i > 0 && ', '}<button type="button" className="underline hover:no-underline font-semibold" onClick={() => onGoToLine(n)} title={`Go to line ${n}`}>{n}</button></span>)})</span>
          )}
        </div>
        <span className="shrink-0 flex items-center gap-1.5">
          {!merged && row.lines.length === 1 && <GoLine n={row.lines[0]} onGo={onGoToLine} label="Go to line" />}
          {row.action === 'set_period' && onSetPeriod && <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2 !text-[11.5px]`} onClick={onSetPeriod}><Pencil size={11} /> Set period</button>}
        </span>
      </div>
      {open && (
        <ul className="ml-7 mr-2 mb-1.5 space-y-1 text-[11.5px] text-[#6E5E70]" data-note-details>
          {row.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{merged || row.items.length > 1 ? <b className="text-[#3B1B3D]">{it.label}</b> : null}{it.detail ? <span>{merged || row.items.length > 1 ? ' — ' : ''}{it.detail}</span> : null}</span>
              {(merged || row.items.length > 1) && it.line_no ? <GoLine n={it.line_no} onGo={onGoToLine} label="Go to line" /> : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Unggah dokumen susulan (faktur pajak / lampiran / PO / kwitansi): alur SAMA dengan tampilan Detailed (proxy cost_agent {mode:'susulan', invoice_id, hint}); invoice & statusnya tidak berubah.
function SupportingUpload({ invoiceId, onClose, onSent }: { invoiceId: number; onClose: () => void; onSent: (jobId: string | null) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    if (!files.length) { setError('Choose at least 1 file.'); return }
    setBusy(true); setError(null)
    try {
      const r = await costAgentUpload('cost_agent', files, { mode: 'susulan', invoice_id: invoiceId, hint: hint.trim() || null })
      const jobId = r?.job_id ?? r?.data?.job_id ?? null
      onSent(jobId ? String(jobId) : null)
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <CostAgentModal title="Add documents" subtitle="Tax invoice (Faktur Pajak), PO, receipt, attachments. The invoice and its status do not change." z="z-[88]" maxWidth="max-w-lg" onClose={() => { if (!busy) onClose() }}
      footer={<><button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={send} disabled={busy || !files.length}>{busy ? 'Sending…' : `Send ${files.length || ''} document${files.length === 1 ? '' : 's'}`}</button></>}>
      <div className="p-5 space-y-3">
        <CostAgentFileDrop files={files} onChange={setFiles} disabled={busy} />
        <div><FieldLabel>Note / hint</FieldLabel><input className={SA_INPUT} value={hint} onChange={e => setHint(e.target.value)} disabled={busy} placeholder="e.g. Faktur Pajak for this invoice" /></div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]" role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
