// Kartu & tabel daftar Agency Invoices v2 (Tahap 3a, 2026-10-28, SQL 091). MURNI TAMPILAN: semua nilai (bucket status, stepper 4 tahap, jumlah temuan, tugas saya,
// lama menunggu) datang dari fn_cost_agent_invoice_cards -- jangan menghitung apa pun di klien. Popover "Needs attention" memuat fn_cost_agent_invoice_attention saat dibuka.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, BadgeCheck, CalendarDays, Check, ChevronDown, ChevronUp, CircleAlert, Clock, FileCheck2, Loader2, Navigation, RotateCcw, ShieldCheck, Trash2, Wallet, X } from 'lucide-react'
import { Chip, PtBadge, Pill, SA_BTN_OUTLINE, SA_CARD } from './SeaAirAuditUi'
import { fmtDate, fmtRupiah } from '../utils/CostAgentHelpers'
import {
  BUCKET_LABEL, costAgentInvoiceAttention, type AttentionItem, type CardStage, type InvoiceCard, type SortField, type SortLevel,
} from '../utils/CostAgentInvoiceCards'

// ─── Pill status ────────────────────────────────────────────────────────────────────────────────────────────────
const PILL: Record<string, string> = {
  verify: 'bg-[#FFF1D6] text-[#7A4F00]', returned: 'bg-[#FDE7EF] text-[#A8234F]', review: 'bg-[#EFE7F7] text-[#5B2E8C]',
  approved: 'bg-[#EEF1FA] text-[#2F4FA8]', journal: 'bg-[#EEF1FA] text-[#2F4FA8]', paid: 'bg-[#EAF6EF] text-[#17663D]',
  void: 'bg-[#F3EEEA] text-[#6E5E70]', processing: 'bg-[#E8F3FB] text-[#2F6FA8]', failed: 'bg-[#FDE7E4] text-[#A8231A]',
}
const EDGE: Record<string, string> = {
  verify: 'border-l-[#E0A526]', returned: 'border-l-[#D9608A]', review: 'border-l-[#5B2E8C]', approved: 'border-l-[#2F4FA8]', journal: 'border-l-[#2F4FA8]',
  paid: 'border-l-[#17663D]', void: 'border-l-[#D9CFD6]', processing: 'border-l-[#6FB1DB]', failed: 'border-l-[#A8231A]',
}
export const StatusPill = ({ bucket }: { bucket: string }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${PILL[bucket] || PILL.void}`}>{BUCKET_LABEL[bucket] || bucket}</span>
)
const VOY_TYPE: Record<string, string> = { L: 'Loading', D: 'Discharging', LD: 'Loading & discharging', O: 'Other activity', none: 'No voyage' }
const TASK_LABEL: Record<string, string> = { verify: 'Verify', validate: 'Validate', approve: 'Approve' }

// ─── Stepper 4 tahap (apa adanya dari item.stages) ──────────────────────────────────────────────────────────────
const STAGE_ICON: Record<string, React.ElementType> = { completed: FileCheck2, verified: ShieldCheck, approved: BadgeCheck, paid: Wallet }
const DOT: Record<string, string> = {
  done: 'bg-[#17663D] border-[#17663D] text-white', cur: 'bg-white border-[#6B3470] text-[#6B3470] ring-4 ring-[#6B3470]/15 animate-pulse',
  idle: 'bg-white border-[#DDD3DC] text-[#B9AEBB]', bad: 'bg-[#A8231A] border-[#A8231A] text-white',
}
// Stepper 4 tahap: ikon per tahap (dokumen / verifikasi / approval / bayar); done = centang hijau, bad = silang merah, cur = ikon plum berdenyut, idle = ikon abu.
export function StageStepper({ stages }: { stages: CardStage[] }) {
  return (
    <ol className="flex items-start w-full" data-stages>
      {stages.map((s, i) => {
        const Icon = STAGE_ICON[s.key] ?? Check
        return (
          <li key={s.key} className="flex-1 min-w-0 flex flex-col items-center relative" data-stage={s.key} data-cls={s.cls}>
            {i > 0 && <span aria-hidden className={`absolute top-[13px] right-1/2 w-full h-[3px] rounded-full ${stages[i - 1].cls === 'done' ? 'bg-[#17663D]' : 'bg-[#E9E1E8]'}`} />}
            <span className={`relative z-[1] w-[28px] h-[28px] rounded-full border-2 inline-flex items-center justify-center ${DOT[s.cls]}`}>
              {s.cls === 'done' ? <Check size={14} strokeWidth={3} /> : s.cls === 'bad' ? <X size={14} strokeWidth={3} /> : <Icon size={14} />}
            </span>
            <span className={`mt-1.5 text-[11px] font-bold leading-none ${s.cls === 'idle' ? 'text-[#A99AAB]' : s.cls === 'bad' ? 'text-[#A8231A]' : 'text-[#3B1B3D]'}`}>{s.label}</span>
            <span className={`text-[10.5px] leading-tight mt-0.5 text-center truncate max-w-full px-0.5 ${s.cls === 'bad' ? 'font-semibold text-[#A8231A]' : 'text-[#8A7A8B]'}`} title={s.sub}>{s.sub}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function StageDots({ stages }: { stages: CardStage[] }) {
  const c: Record<string, string> = { done: 'bg-[#17663D]', cur: 'bg-[#6B3470] animate-pulse', idle: 'bg-[#E0D7DF]', bad: 'bg-[#A8231A]' }
  return <span className="inline-flex items-center gap-1" data-stage-dots>{stages.map(s => <span key={s.key} className={`w-2.5 h-2.5 rounded-full ${c[s.cls]}`} title={`${s.label}: ${s.sub}`} />)}</span>
}

// ─── "Needs attention" ──────────────────────────────────────────────────────────────────────────────────────────
export function AttentionBadge({ card, onGo }: { card: InvoiceCard; onGo: (item: AttentionItem) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AttentionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - 360, window.innerWidth - 368)) })
  }, [open])
  useEffect(() => {
    if (!open) return
    let alive = true
    setItems(null); setError(null)
    costAgentInvoiceAttention(card.id).then(r => { if (alive) setItems(r) }).catch(e => { if (alive) setError(e?.message || String(e)) })
    const down = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true)
    return () => { alive = false; document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [open, card.id])

  if (!card.findings) return null
  const red = card.findings_red > 0
  return (
    <>
      <button ref={btn} type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o) }} aria-haspopup="dialog" aria-expanded={open} data-attention-badge
        title="Needs attention"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${red ? 'bg-[#FDE2E4] text-[#C0262D] hover:bg-[#FBD3D6]' : 'bg-[#FFF1D6] text-[#7A4F00] hover:bg-[#FFE6B3]'}`}>
        <span className={`inline-flex w-3.5 h-3.5 items-center justify-center rounded-full text-white text-[10px] leading-none ${red ? 'bg-[#E03040]' : 'bg-[#E0A526]'}`} aria-hidden="true">!</span> {card.findings} Need Attention
      </button>
      {open && pos && createPortal(
        <div ref={pop} role="dialog" aria-label="Needs attention" style={{ top: pos.top, left: pos.left }} onClick={e => e.stopPropagation()}
          className="fixed z-[95] w-[360px] max-w-[calc(100vw-16px)] max-h-[60vh] overflow-y-auto rounded-xl border border-[#EADFD6] bg-white shadow-2xl p-1.5" data-attention-popover>
          <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">Needs attention · {card.invoice_no || `#${card.id}`}</div>
          {error ? <p className="px-2.5 py-2 text-[12px] text-[#A8231A]">{error}</p>
            : items === null ? <div className="space-y-1.5 p-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-9 rounded-lg bg-[#F3EEEA] animate-pulse" />)}</div>
              : items.length === 0 ? <p className="px-2.5 py-3 text-[12px] text-[#6E5E70] italic">Nothing needs attention.</p>
                : items.map((it, i) => (
                  <button key={i} type="button" onClick={() => { setOpen(false); onGo(it) }}
                    className="w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-[#FBF7F4]">
                    <CircleAlert size={15} className={`mt-0.5 shrink-0 ${it.sev === 'red' ? 'text-[#A8231A]' : 'text-[#B7791F]'}`} />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-bold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{it.title}</span>
                      {it.detail && <span className="block text-[11.5px] text-[#6E5E70] [overflow-wrap:anywhere]">{it.detail}</span>}
                    </span>
                  </button>
                ))}
        </div>,
        document.body,
      )}
    </>
  )
}

const waitingCls = (c: InvoiceCard) => (c.current_step && c.current_step.waiting_days !== null && c.current_step.waiting_days >= c.current_step.reminder_after_days ? 'text-[#C2570C]' : 'text-[#6E5E70]')
const waitingText = (c: InvoiceCard) => (c.current_step && c.current_step.waiting_days !== null
  ? `Waiting ${c.current_step.waiting_days} day${c.current_step.waiting_days === 1 ? '' : 's'} for ${c.current_step.label}` : null)
const pphTitle = (c: InvoiceCard) => (c.amounts.pph && Number(c.amounts.pph) > 0 ? `PPh 23 − ${fmtRupiah(c.amounts.pph)}` : undefined)

interface RowActions {
  openId: number | null
  checkbox?: { checked: boolean; onChange: (v: boolean) => void }
  error?: string | null
  onOpen: () => void
  onOpenAt: (item: AttentionItem) => void
  onReprocess?: () => void
  reprocessing?: boolean
  onDelete?: () => void
  deleting?: boolean
  readOnly?: boolean // tanpa hak edit Agency Invoices -> tombol aksi berlabel "View"
}

// ─── Kartu ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Tampilan kartu mengikuti kartu Invoice Recap Courier (2026-10-29, permintaan user; CourierRecapCardList): judul tebal ungu + vendor kecil + pil PT |
// kapal & pelabuhan | pil berwarna (Voyage, Invoice date) | stepper 4 tahap | status + Needs attention | Grand total | tombol bulat "Open ›".
// Container query pada lebar KARTU: >= 1240px TUJUH kolom dengan pembatas vertikal samar (+ kolom hapus untuk Admin); lebih sempit 2 kolom dengan
// pembatas horizontal samar, stepper selebar kartu. Hanya tampilan -- semua nilai apa adanya dari fn_cost_agent_invoice_cards.
const SEP = 'border-[rgba(138,123,155,0.18)]'
const sepV = `@min-[1240px]:border-l @min-[1240px]:pl-4 ${SEP}`
const sepH = `border-t pt-2.5 @min-[1240px]:border-t-0 @min-[1240px]:pt-0 ${SEP}`
const PILL_LABEL = 'w-[84px] shrink-0 text-left'

export function InvoiceCardV2({ c, a }: { c: InvoiceCard; a: RowActions }) {
  const wait = waitingText(c)
  const voy = c.voyage
  const hasDelete = !!a.onDelete
  const quiet = c.findings === 0 && !['void', 'failed', 'processing'].includes(c.bucket) // tidak ada temuan -> centang hijau seperti kartu Courier
  const grid = hasDelete
    ? `@min-[1240px]:grid-cols-[minmax(170px,1.3fr)_minmax(120px,0.9fr)_minmax(190px,0.9fr)_minmax(250px,1.2fr)_minmax(120px,0.8fr)_120px_100px_36px]`
    : `@min-[1240px]:grid-cols-[minmax(170px,1.3fr)_minmax(120px,0.9fr)_minmax(190px,0.9fr)_minmax(250px,1.2fr)_minmax(120px,0.8fr)_120px_100px]`
  return (
    <div className={`@container relative shrink-0 ${SA_CARD} border-l-4 ${EDGE[c.bucket] || EDGE.void} overflow-hidden cursor-pointer ${a.openId === c.id ? 'ring-2 ring-[#6B3470]' : 'hover:border-[#D9C7DA] hover:shadow-md'} transition-shadow ${c.bucket === 'void' ? 'opacity-75' : ''}`}
      onClick={a.onOpen} data-invoice-card={c.id} aria-current={a.openId === c.id || undefined}>
      <div className={`grid grid-cols-2 gap-x-3.5 gap-y-2.5 px-3.5 py-3 items-start ${grid} @min-[1240px]:gap-x-4 @min-[1240px]:px-4 @min-[1240px]:py-3.5 @min-[1240px]:items-center`}>
        {/* 1. Judul (no. invoice), vendor, pil PT */}
        <div className={`min-w-0 flex items-start gap-2.5 ${hasDelete ? 'pr-8' : ''} @min-[1240px]:pr-0 @min-[1240px]:[grid-column:1] @min-[1240px]:[grid-row:1]`}>
          {a.checkbox && (
            <input type="checkbox" aria-label={`Select invoice ${c.invoice_no || c.id}`} className="mt-1 w-4 h-4 accent-[#6B3470] shrink-0" checked={a.checkbox.checked}
              onClick={e => e.stopPropagation()} onChange={e => a.checkbox!.onChange(e.target.checked)} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] @min-[1240px]:text-[15px] font-extrabold text-[#3B2260] tabular-nums leading-tight [overflow-wrap:anywhere]">{c.invoice_no || <span className="text-[#8A7A8B]">#{c.id}</span>}</span>
              {c.duplicate_of && <span className="inline-flex text-[#B7791F]" title={`Possible duplicate: same vendor and invoice number as #${c.duplicate_of}`} aria-label="Possible duplicate" data-duplicate><AlertTriangle size={14} /></span>}
            </div>
            <div className="text-[11.5px] text-[#8A7A8B] mt-0.5 mb-1.5 line-clamp-2" title={c.vendor.name || undefined}>{c.vendor.name || 'Unknown vendor'}</div>
            <div className="flex flex-wrap items-center gap-1.5">{c.company && <Pill tone="grey">{c.company}</Pill>}</div>
          </div>
        </div>

        {/* 2. Kapal & pelabuhan (susunan sama kolom PO & Origin di kartu Courier) */}
        <div className={`min-w-0 ${sepV} @min-[1240px]:[grid-column:2] @min-[1240px]:[grid-row:1]`}>
          <div className="text-[12.5px] font-medium text-[#4A3A5C] truncate" title={c.vessel.name || undefined}>{c.vessel.name || <span className="text-[#6E5E70]">No vessel</span>}</div>
          <div className="text-[11px] text-[#8A7A8B] mt-1.5 truncate" title={c.port.name || undefined}>Port <span className="font-medium text-[#4A3A5C]">{[c.port.code, c.port.name].filter(Boolean).join(' · ') || '—'}</span></div>
        </div>

        {/* 3. Pil berwarna: Voyage + Invoice date (label lebar tetap supaya rata antar kartu) */}
        <div className={`min-w-0 ${sepV} ${sepH} @min-[1240px]:[grid-column:3] @min-[1240px]:[grid-row:1]`}>
          <div className="flex flex-col items-start gap-1.5" data-invoice-pills>
            <Pill tone={voy ? 'green' : 'grey'} className={`@min-[1240px]:w-full`} title={voy ? VOY_TYPE[voy.type] || 'Voyage' : 'Not linked to a voyage'}>
              <span className={PILL_LABEL}>Voyage</span><Navigation size={11} className="shrink-0" />{voy ? `VOY ${voy.no || voy.id}` : 'No voyage'}
            </Pill>
            <Pill tone="blue" className={`@min-[1240px]:w-full`} title="Invoice date">
              <span className={PILL_LABEL}>Invoice date</span><CalendarDays size={11} className="shrink-0" /><span className="tabular-nums">{fmtDate(c.invoice_date)}</span>
            </Pill>
          </div>
        </div>

        {/* 5. Status + Needs attention (di layar sempit tampil di samping pil, sebelum stepper) */}
        <div className={`min-w-0 ${sepH} @min-[1240px]:[grid-column:5] @min-[1240px]:[grid-row:1]`}>
          <div className="flex flex-col items-start gap-1.5" onClick={e => e.stopPropagation()}>
            <StatusPill bucket={c.bucket} />
            <AttentionBadge card={c} onGo={a.onOpenAt} />
            {quiet && <span title="Nothing needs attention" data-no-findings className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-[#D5F5E6] text-[#0D8A5F]"><Check size={17} strokeWidth={3} aria-hidden="true" /></span>}
          </div>
        </div>

        {/* 4. Stepper 4 tahap (+ lama menunggu, error) */}
        <div className={`min-w-0 col-span-2 @min-[1240px]:col-span-1 space-y-2 ${sepV} ${sepH} @min-[1240px]:[grid-column:4] @min-[1240px]:[grid-row:1]`}>
          <StageStepper stages={c.stages} />
          {(wait || c.bucket === 'failed') && (
            <div className="flex items-center justify-center gap-3 flex-wrap" onClick={e => e.stopPropagation()}>
              {wait && <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${waitingCls(c)}`} data-waiting><Clock size={12} />{wait}</span>}
              {c.bucket === 'failed' && (
                <>
                  <span className="text-[11.5px] text-[#A8231A] max-w-[300px] [overflow-wrap:anywhere]">{a.error || 'AI processing failed.'}</span>
                  {a.onReprocess && <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2`} disabled={a.reprocessing} onClick={a.onReprocess}><RotateCcw size={12} /> {a.reprocessing ? 'Sending…' : 'Reprocess'}</button>}
                </>
              )}
            </div>
          )}
        </div>

        {/* 6. Grand total */}
        <div className={`min-w-0 ${sepH} @min-[1240px]:[grid-column:6] @min-[1240px]:[grid-row:1]`}>
          <div className="text-[11px] text-[#8A7A8B]">Grand total</div>
          <div className="text-[17px] @min-[1240px]:text-[18px] font-extrabold text-[#3B2260] tabular-nums leading-tight whitespace-nowrap" title={pphTitle(c)} data-invoice-amount>{c.amounts.grand_total === null ? '—' : fmtRupiah(c.amounts.grand_total)}</div>
        </div>

        {/* 7. Tombol aksi: label mengikuti tugas saya (Verify / Validate / Approve); tanpa tugas = Review (View bila read-only). Klik = buka detail, sama dgn klik kartu. */}
        <div className={`min-w-0 flex @min-[1240px]:justify-end @min-[1240px]:[grid-column:7] @min-[1240px]:[grid-row:1]`}>
          <button type="button" onClick={e => { e.stopPropagation(); a.onOpen() }} data-card-action
            className={`inline-flex items-center justify-center px-4 h-9 rounded-full border-[1.5px] border-[#6B3470] text-[13px] font-bold whitespace-nowrap transition-colors ${c.task.kinds.length > 0 ? 'bg-[#6B3470] text-white hover:bg-[#5A305A] shadow-sm' : 'bg-transparent text-[#6B3470] hover:bg-[#F5EDF3]'}`}>
            {c.task.kinds.length > 0 ? TASK_LABEL[c.task.kinds[0]] : a.readOnly ? 'View' : 'Review'} ›
          </button>
        </div>

        {/* 8. Hapus: ujung kanan kartu (Admin, masa uji coba) */}
        {a.onDelete && (
          <div className={`absolute top-2.5 right-2.5 @min-[1240px]:static @min-[1240px]:[grid-column:8] @min-[1240px]:[grid-row:1] @min-[1240px]:flex @min-[1240px]:justify-end`} onClick={e => e.stopPropagation()}>
            <button type="button" aria-label={`Delete invoice ${c.invoice_no || c.id}`} title="Delete (Admin, trial data)" disabled={a.deleting} onClick={a.onDelete}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#9A8A9C] hover:text-[#A8231A] hover:bg-[#FDE7E4] disabled:opacity-50 transition-colors">
              {a.deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function CardSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading invoices" data-skeleton>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`${SA_CARD} border-l-4 border-l-[#EADFD6] px-4 py-3.5 animate-pulse`}>
          <div className="flex items-center gap-2"><div className="h-4 w-40 rounded bg-[#F0E8EF]" /><div className="h-4 w-32 rounded bg-[#F3EEEA]" /><div className="h-5 w-16 rounded-full bg-[#F3EEEA]" /></div>
          <div className="mt-2 h-3 w-72 rounded bg-[#F3EEEA]" />
          <div className="mt-4 grid grid-cols-4 gap-6">{[0, 1, 2, 3].map(k => <div key={k} className="flex flex-col items-center gap-1"><div className="h-5 w-5 rounded-full bg-[#EDE5EC]" /><div className="h-2.5 w-14 rounded bg-[#F3EEEA]" /></div>)}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Tabel (List) ───────────────────────────────────────────────────────────────────────────────────────────────
const TH = 'px-2.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-2.5 py-2 text-[12.5px] text-[#3B1B3D] align-middle'

export function InvoiceTableV2({ rows, sorts, onSort, makeActions, selectable, allChecked, onCheckAll }: {
  rows: InvoiceCard[]
  sorts: SortLevel[]
  onSort: (f: SortField) => void
  makeActions: (c: InvoiceCard) => RowActions
  selectable: boolean
  allChecked: boolean
  onCheckAll: (v: boolean) => void
}) {
  const first = sorts[0] ?? { f: 'date' as SortField, dir: 'desc' as const }
  const head = (label: string, f?: SortField, right?: boolean) => (
    <th key={label} className={`${TH} ${right ? 'text-right' : ''} ${f ? 'cursor-pointer select-none hover:text-[#6B3470]' : ''}`} onClick={f ? () => onSort(f) : undefined}
      aria-sort={f && first.f === f ? (first.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <span className="inline-flex items-center gap-1">{label}{f && first.f === f && (first.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
    </th>
  )
  return (
    <table className="min-w-full" data-invoice-table>
      <thead className="sticky top-0 z-20">
        <tr>
          {selectable && <th className={`${TH} w-8`}><input type="checkbox" aria-label="Select all" className="accent-[#6B3470]" checked={allChecked} onChange={e => onCheckAll(e.target.checked)} /></th>}
          {head('Invoice')}{head('Vendor', 'vendor')}{head('Vessel', 'vessel')}{head('Port', 'port')}{head('VOY')}{head('Date', 'date')}{head('Amount', 'pay', true)}{head('Status', 'status')}{head('Progress')}{head('Findings')}
        </tr>
      </thead>
      <tbody>
        {rows.map(c => {
          const a = makeActions(c)
          return (
            <tr key={c.id} onClick={a.onOpen} className={`border-b border-[#F3EEEA] cursor-pointer hover:bg-[#FBF7F4] ${a.openId === c.id ? 'bg-[#F5EDF3]' : ''} ${c.bucket === 'void' ? 'opacity-70' : ''}`} data-invoice-row={c.id}>
              {selectable && <td className={TD} onClick={e => e.stopPropagation()}>{a.checkbox && <input type="checkbox" aria-label={`Select invoice ${c.invoice_no || c.id}`} className="accent-[#6B3470]" checked={a.checkbox.checked} onChange={e => a.checkbox!.onChange(e.target.checked)} />}</td>}
              <td className={`${TD} whitespace-nowrap font-bold`}>
                <div className="flex items-center gap-1.5">{c.company && <PtBadge code={c.company} />}{c.invoice_no || <span className="text-[#8A7A8B]">#{c.id}</span>}{c.duplicate_of && <Chip tone="amber">Dup?</Chip>}</div>
                {c.task.kinds.length > 0 && <div className="text-[10.5px] font-bold text-[#6B3470]">Your turn: {c.task.kinds.map(k => TASK_LABEL[k]).join(' / ')}{c.task.acting_for ? ` · for ${c.task.acting_for}` : ''}</div>}
              </td>
              <td className={`${TD} min-w-[150px] font-semibold`}>{c.vendor.name || <span className="text-[#8A7A8B] font-normal">—</span>}</td>
              <td className={`${TD} whitespace-nowrap`}>{c.vessel.name || '—'}</td>
              <td className={`${TD} whitespace-nowrap`} title={c.port.name || undefined}>{c.port.code || c.port.name || '—'}</td>
              <td className={`${TD} whitespace-nowrap`}>{c.voyage ? <span className="inline-flex items-center gap-1 text-[#17663D] font-semibold" title={VOY_TYPE[c.voyage.type]}><Check size={11} strokeWidth={3} />{c.voyage.no || c.voyage.id}</span> : <span className="text-[#8A7A8B]">No voyage</span>}</td>
              <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(c.invoice_date)}</td>
              <td className={`${TD} whitespace-nowrap tabular-nums text-right font-semibold`} title={pphTitle(c)}>{c.amounts.grand_total === null ? '—' : fmtRupiah(c.amounts.grand_total)}</td>
              <td className={TD}><StatusPill bucket={c.bucket} />{waitingText(c) && <div className={`text-[10.5px] font-semibold mt-0.5 ${waitingCls(c)}`}>{waitingText(c)}</div>}</td>
              <td className={TD}><StageDots stages={c.stages} /></td>
              <td className={TD} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  {c.findings ? <AttentionBadge card={c} onGo={a.onOpenAt} /> : <span className="text-[#C9BFCB]">—</span>}
                  {c.bucket === 'failed' && a.onReprocess && <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2`} disabled={a.reprocessing} onClick={a.onReprocess}><RotateCcw size={12} /></button>}
                  {a.onDelete && <button type="button" aria-label="Delete invoice" title="Delete (Admin, trial data)" disabled={a.deleting} onClick={a.onDelete} className="p-1.5 rounded-lg text-[#8A7A8B] hover:text-[#A8231A] hover:bg-[#FDE7E4] disabled:opacity-50"><Trash2 size={13} /></button>}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

