// Gerbang kelengkapan dokumen di detail invoice Cost Agent (Tahap 2a, 2026-10-28, SQL 087): hook status gerbang, banner (tab Cost lines & Documents & Tax),
// kartu "Period check" dan penyunting periode invoice di header. Server tetap menegakkan gerbang (error "DOC_GATE:"); komponen ini hanya menampilkan & mencegah
// klik yang pasti ditolak. Detail aturan: docs/claude/cost-agent.md ("Document gate and auto-verify").
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, Pencil, RefreshCw } from 'lucide-react'
import { gatePill } from '../utils/CostAgentGateView'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import { fmtDate } from '../utils/CostAgentHelpers'
import { isAccessDeniedError } from '../utils/CostAgentRolesLogic'
import {
  PERIOD_SOURCE_TEXT, costAgentGetDocGate, costAgentRunChecks, costAgentSetInvoicePeriod, isDocumentsBlocker,
  type DocGate, type GateItem,
} from '../utils/CostAgentGate'

// ─── Hook ───────────────────────────────────────────────────────────────────────────────────────────────────────
// run(true)  = fn_cost_agent_run_checks (auto-verify + gerbang; butuh hak edit & status verification/rejected) -> dipanggil SEKALI saat detail dibuka,
//              lewat "Re-check", setelah dokumen susulan selesai dan setelah periode / header diubah.
// run(false) = fn_cost_agent_get_doc_gate (hanya baca) -> setelah aksi baris (Verify / Unverify dll). JANGAN menjalankan auto-verify di sini:
//              baris yang baru di-Unverify maker akan langsung diverifikasi ulang oleh sistem.
export function useInvoiceGate({ invoiceId, status, canEdit, onToast, onLinesChanged }: {
  invoiceId: number
  status: string | undefined
  canEdit: boolean
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
  onLinesChanged: () => Promise<void> | void
}) {
  const [gate, setGate] = useState<DocGate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef<number | null>(null)
  const seq = useRef(0)
  const cb = useRef({ onToast, onLinesChanged }); cb.current = { onToast, onLinesChanged }
  const fullAllowed = canEdit && (status === 'verification' || status === 'rejected')

  const run = useCallback(async (full: boolean) => {
    const my = ++seq.current
    setBusy(true)
    try {
      let done = false
      if (full && fullAllowed) {
        // run_checks (auto-verify) hanya boleh Maker. Saat dibuka, peran belum tentu sudah termuat (alur kerja dibaca terpisah), jadi bila server menolak
        // karena peran (Checker / Approver membuka invoice berstatus verification) jatuh ke pembacaan gerbang tanpa auto-verify -- bukan error.
        try {
          const r = await costAgentRunChecks(invoiceId)
          if (my !== seq.current) return
          setGate(r.gate)
          const n = r.auto_verify?.verified ?? 0
          if (n > 0) { cb.current.onToast(`${n} line${n === 1 ? '' : 's'} auto-verified`); await cb.current.onLinesChanged() }
          done = true
        } catch (e) { if (!isAccessDeniedError(e)) throw e }
      }
      if (!done) {
        const g = await costAgentGetDocGate(invoiceId)
        if (my !== seq.current) return
        setGate(g)
      }
      setError(null)
    } catch (e: any) {
      if (my === seq.current) setError(e?.message || String(e))
    } finally {
      if (my === seq.current) setBusy(false)
    }
  }, [invoiceId, fullAllowed])

  useEffect(() => {
    if (!status || status === 'processing' || started.current === invoiceId) return
    started.current = invoiceId
    run(true)
  }, [invoiceId, status, run])

  return { gate, error, busy, loaded: gate !== null, recheck: () => run(true), refresh: () => run(false) }
}

// Alasan Verify dinonaktifkan (tooltip) -- null bila boleh / gerbang belum diketahui (server tetap menolak).
export const verifyBlockReason = (gate: DocGate | null): string | null =>
  gate && gate.enabled && (gate.blockers ?? []).length > 0 ? `Fix this first: ${gate.blockers[0]?.label ?? 'see the bell'}` : null

// ─── Banner ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function DocGateBanner({ gate, error, busy, onRecheck, onGoToLine, onOpenDocs, onSetPeriod, maxItems, className = '' }: {
  gate: DocGate | null
  error: string | null
  busy: boolean
  onRecheck: () => void
  onGoToLine: (lineNo: number) => void
  onOpenDocs?: () => void // dari tab Cost lines -> Documents & Tax (disembunyikan di tab Documents sendiri)
  onSetPeriod?: () => void
  maxItems?: number // tab Documents & Tax (Summary): blocker teratas saja + "and n more"
  className?: string
}) {
  const [showWarn, setShowWarn] = useState(false)
  const recheckBtn = (
    <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2.5 shrink-0`} onClick={onRecheck} disabled={busy} title="Check the documents again">
      <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Re-check
    </button>
  )

  if (!gate && !error) {
    return <div className={`rounded-lg border border-[#EADFD6] bg-white px-3 py-2 flex items-center gap-2 text-[12px] text-[#6E5E70] ${className}`} data-doc-gate="loading"><LoadingSpinner /> Checking documents…</div>
  }
  if (!gate) {
    return (
      <div className={`rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-1.5 text-[12px] text-[#A8231A] flex items-center gap-2 ${className}`} role="alert" data-doc-gate="error">
        <AlertTriangle size={13} /> <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">Document check failed: {error}</span>{recheckBtn}
      </div>
    )
  }
  if (!gate.enabled) return null

  const warnings = gate.warnings ?? []
  const warnList = showWarn && warnings.length > 0 && (
    <ul className="mt-1.5 space-y-1 text-[12px] text-[#7A4F00]" data-doc-gate-warnings>
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2">
          <span>•</span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><b>{w.label}</b>{w.detail ? <span className="text-[11.5px]"> — {w.detail}</span> : null}</span>
          {w.line_no ? <button type="button" className="shrink-0 underline text-[11.5px] font-semibold hover:no-underline" onClick={() => onGoToLine(w.line_no as number)}>Line {w.line_no}</button> : null}
        </li>
      ))}
    </ul>
  )
  const warnToggle = warnings.length > 0 && (
    <button type="button" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#7A4F00] hover:underline" onClick={() => setShowWarn(v => !v)}>
      {warnings.length} note{warnings.length === 1 ? '' : 's'} {showWarn ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  )

  const pill = gatePill(gate)
  if (!pill || pill.blockers === 0) {
    return (
      <div className={`rounded-lg border border-[#BFE3CC] bg-[#EAF6EF] px-3 py-1.5 ${className}`} data-doc-gate="complete">
        <div className="flex items-center gap-3 flex-wrap text-[12.5px] font-semibold text-[#17663D]">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} /> {pill?.text ?? 'Ready to submit'}</span>
          {warnToggle}
          <span className="ml-auto">{recheckBtn}</span>
        </div>
        {warnList}
      </div>
    )
  }

  const blockers = gate.blockers ?? []
  return (
    <div className={`rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 ${className}`} role="alert" data-doc-gate="incomplete">
      <div className="flex items-center gap-3 flex-wrap text-[12.5px] font-bold text-[#A8231A]">
        <span className="inline-flex items-center gap-1.5"><AlertTriangle size={14} /> {pill.text}</span>
        {warnToggle}
        <span className="ml-auto">{recheckBtn}</span>
      </div>
      <ul className="mt-1.5 space-y-1.5 text-[#A8231A]" data-doc-gate-blockers>
        {(maxItems ? blockers.slice(0, maxItems) : blockers).map((b: GateItem, i: number) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px]">
            <span>•</span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <b>{b.label}</b>
              {b.detail ? <span className="block text-[11.5px] font-normal opacity-90">{b.detail}</span> : null}
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              {b.line_no ? <button type="button" className="underline text-[11.5px] font-semibold hover:no-underline" onClick={() => onGoToLine(b.line_no as number)}>Go to line {b.line_no}</button> : null}
              {onOpenDocs && isDocumentsBlocker(b.code) ? <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2 !text-[11.5px]`} onClick={onOpenDocs}><FileText size={11} /> Open Documents &amp; Tax</button> : null}
              {onSetPeriod && b.code === 'period_missing' ? <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2 !text-[11.5px]`} onClick={onSetPeriod}><Pencil size={11} /> Set period</button> : null}
            </span>
          </li>
        ))}
      </ul>
      {maxItems && blockers.length > maxItems && <p className="mt-1.5 text-[12px] font-semibold text-[#A8231A]" data-more-blockers>and {blockers.length - maxItems} more</p>}
      {warnList}
    </div>
  )
}

// ─── Kartu "Period check" (tab Documents & Tax) ─────────────────────────────────────────────────────────────────
export function PeriodCheckCard({ gate }: { gate: DocGate | null }) {
  const p = gate?.period
  const v = gate?.voyage
  const invoicePeriod = p && (p.from || p.to) ? `${fmtDate(p.from)} – ${fmtDate(p.to)}` : null
  const voyagePeriod = v && (v.arrived || v.departed) ? `${fmtDate(v.arrived)} – ${fmtDate(v.departed)}` : null
  return (
    <section className={`${SA_CARD} px-4 py-3`} data-period-check>
      <div className={`${SA_LABEL} mb-1.5`}>Period check</div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[12.5px] text-[#3B1B3D]">
        <div><dt className="text-[11px] text-[#6E5E70]">Invoice period</dt>
          <dd className="font-semibold" title={p?.source ? PERIOD_SOURCE_TEXT[p.source] : undefined}>{invoicePeriod ?? <span className="text-[#A8231A]">Not set</span>}</dd></div>
        <div><dt className="text-[11px] text-[#6E5E70]">Voyage report period</dt>
          <dd className="font-semibold">{voyagePeriod ?? <span className="text-[#8A7A8B] font-normal italic">not linked</span>}</dd></div>
        <div><dt className="text-[11px] text-[#6E5E70]">Tolerance</dt>
          <dd className="font-semibold">{gate?.tolerance_days != null ? `± ${gate.tolerance_days} day${gate.tolerance_days === 1 ? '' : 's'}` : '—'}</dd></div>
      </dl>
    </section>
  )
}

// ─── Periode invoice di header (tampil + pensil) ────────────────────────────────────────────────────────────────
export function InvoicePeriod({ invoiceId, gate, canChange, actor, open, onOpenChange, onSaved, onToast }: {
  invoiceId: number
  gate: DocGate | null
  canChange: boolean // canEdit && status verification / rejected / failed
  actor: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void> | void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const p = gate?.period
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setFrom(p?.from ?? ''); setTo(p?.to ?? ''); setError(null) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (clear: boolean) => {
    const f = clear ? null : from || null
    const t = clear ? null : to || null
    if ((f === null) !== (t === null)) { setError('Fill both dates (arrival and departure), or use Clear.'); return }
    if (f && t && t < f) { setError('Departure cannot be earlier than arrival.'); return }
    setBusy(true); setError(null)
    try {
      await costAgentSetInvoicePeriod(invoiceId, f, t, actor)
      onOpenChange(false)
      onToast(clear ? 'Period cleared.' : 'Period saved.')
      await onSaved()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }

  const has = !!p && (!!p.from || !!p.to)
  const pencil = canChange && (
    <button type="button" className="p-1 rounded-md text-[#6E5E70] hover:bg-[#F6EFEA] hover:text-[#6B3470]" aria-label="Edit invoice period" title="Edit period (arrival – departure)" onClick={() => onOpenChange(!open)}>
      <Pencil size={12} />
    </button>
  )
  if (!gate) return null
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" data-invoice-period>
      {has
        ? <span title={p?.source ? PERIOD_SOURCE_TEXT[p.source] : undefined}>Period: <b className="text-[#3B1B3D]">{fmtDate(p?.from)} - {fmtDate(p?.to)}</b></span>
        : <span title="The gate needs the invoice period (arrival – departure)"><Chip tone="amber">Period: not set</Chip></span>}
      {pencil}
      {open && canChange && (
        <span className="inline-flex items-center gap-1.5 flex-wrap ml-1 px-2 py-1 rounded-lg bg-white border border-[#EADFD6]">
          <label className="inline-flex items-center gap-1 text-[11px] text-[#6E5E70]">Arrival <input type="date" className={`${SA_INPUT} !h-7 !w-[140px] !px-2 !text-[12px]`} value={from} onChange={e => setFrom(e.target.value)} disabled={busy} /></label>
          <label className="inline-flex items-center gap-1 text-[11px] text-[#6E5E70]">Departure <input type="date" className={`${SA_INPUT} !h-7 !w-[140px] !px-2 !text-[12px]`} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} disabled={busy} /></label>
          <button type="button" className={`${SA_BTN_PRIMARY} !h-7 !px-3`} onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2.5`} onClick={() => save(true)} disabled={busy || !has} title="Remove the saved period">Clear</button>
          <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2.5`} onClick={() => onOpenChange(false)} disabled={busy}>Cancel</button>
          {error && <span className="text-[11.5px] text-[#A8231A] [overflow-wrap:anywhere]">{error}</span>}
        </span>
      )}
    </span>
  )
}
