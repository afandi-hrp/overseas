// Tampilan KARTU halaman Cost Agent (2026-10-14, keputusan user): Voyages & Agency Invoices -- pola SAMA kartu Invoice Recap /
// Audit Courier & Sea & Air (token SeaAirAuditUi, garis warna status di kiri, container query supaya kartu memadat otomatis saat
// daftar berbagi lebar dgn panel samping). Murni tampilan: baris = hasil query daftar yang SAMA dgn mode List (view
// cost_agent_voyage_list_v / cost_agent_invoice_list_v), tanpa query tambahan.
import React from 'react'
import { Loader2, RotateCcw, Trash2, FileText, ShieldCheck, Check, X, Ship, MapPin, Navigation } from 'lucide-react'
import { RouteBadges } from './CostAgentUi'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, Chip, PtBadge, type Tone } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  fmtDate, fmtMoney, fmtNumber, fmtReportMonth, fmtDateTimeCompact, fmtDateTimePort, tzAbbrev, routePorts,
  INVOICE_STATUS_META, VOYAGE_STATUS_META, VOYAGE_SOURCE_LABEL,
  type CostAgentInvoiceListRow, type CostAgentVoyageListRow,
} from '../utils/CostAgentHelpers'

const BORDER: Record<Tone, string> = {
  green: 'border-l-[#17663D]', amber: 'border-l-[#E0A526]', red: 'border-l-[#A8231A]', blue: 'border-l-[#2F4FA8]',
  grey: 'border-l-[#D9CFD6]', plum: 'border-l-[#6B3470]', purple: 'border-l-[#5B2E8C]',
}
// `shrink-0` WAJIB: kartu ada di kolom flex yg di-scroll -- tanpa ini kartu ikut MENYUSUT (flex-shrink default 1) saat daftar lebih
// tinggi dari layar lalu isinya terpotong overflow-hidden (laporan user 2026-10-14).
const cardCls = (tone: Tone, selected: boolean) =>
  `@container shrink-0 ${SA_CARD} border-l-4 ${BORDER[tone]} overflow-hidden cursor-pointer ${selected ? 'ring-2 ring-[#6B3470]' : 'hover:border-[#D9C7DA]'}`

// Kerangka daftar kartu: area scroll + status muat / error / kosong. Pagination di luar (PaginationFooter halaman).
export const CostAgentCardScroller: React.FC<{ loading: boolean; error: string | null; empty: React.ReactNode; count: number; header?: React.ReactNode; children: React.ReactNode }> = ({ loading, error, empty, count, header, children }) => (
  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5">
    {header}
    {loading ? <LoadingState /> : error ? <p className="px-2 py-6 text-center text-sm text-[#A8231A]">{error}</p>
      : count === 0 ? <p className="px-2 py-10 text-center text-sm text-[#6E5E70] italic">{empty}</p> : children}
  </div>
)

// ─── Voyage ──────────────────────────────────────────────────────────────────────────────────────────────────
export const CostAgentVoyageCard: React.FC<{ r: CostAgentVoyageListRow; tzByCode: Map<string, string>; selected: boolean; onOpen: () => void }> = ({ r, tzByCode, selected, onOpen }) => {
  const st = VOYAGE_STATUS_META[r.status]
  const hops = routePorts(r.route)
  const tzFirst = tzByCode.get(hops[0]), tzLast = tzByCode.get(hops[hops.length - 1])
  return (
    <div className={cardCls(st?.tone || 'grey', selected)} onClick={onOpen} data-voyage-card={r.id} aria-current={selected || undefined}>
      <div className={`grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_150px] gap-x-4 gap-y-2.5 px-3.5 py-3 items-start ${r.status === 'draft' ? 'bg-[#FFFDF6]' : ''}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {r.company_code && <PtBadge code={r.company_code} />}
            <span className="text-[11px] font-semibold text-[#6E5E70]">{fmtReportMonth(r.report_month)}</span>
            {r.input_source === 'noon_report' && <Chip tone="blue" title="Created from a Noon Report">Noon Report</Chip>}
          </div>
          <div className="mt-1 text-[14px] font-bold text-[#3B1B3D] truncate" title={r.vessel_name}>{r.vessel_name}</div>
          <div className="text-[12px] text-[#6E5E70]">
            <b className="text-[#3B1B3D]">Voy {r.voyage_no}</b>{r.seq_in_report != null ? <span className="text-[#8A7A8B]"> #{r.seq_in_report}</span> : null}
            {r.charter_type ? ` · ${r.charter_type}` : ''}{r.vessel_type ? ` · ${r.vessel_type}` : ''}
          </div>
        </div>
        <div className="min-w-0 text-[12px]">
          <div className={SA_LABEL}>Route</div>
          <div className="mt-0.5 overflow-hidden"><RouteBadges route={r.route} /></div>
          <div className="mt-1.5 grid grid-cols-[62px_1fr] gap-x-2 gap-y-0.5 tabular-nums">
            <span className="text-[#8A7A8B]">Arrival</span>
            <span className="text-[#3B1B3D] truncate" title={fmtDateTimePort(r.first_arrival, tzFirst)}>{fmtDateTimeCompact(r.first_arrival, tzFirst)}{r.first_arrival && <span className="ml-1 text-[10.5px] text-[#8A7A8B]">{tzAbbrev(tzFirst)}</span>}</span>
            <span className="text-[#8A7A8B]">Departure</span>
            <span className="text-[#3B1B3D] truncate" title={fmtDateTimePort(r.last_departure, tzLast)}>{fmtDateTimeCompact(r.last_departure, tzLast)}{r.last_departure && <span className="ml-1 text-[10.5px] text-[#8A7A8B]">{tzAbbrev(tzLast)}</span>}</span>
          </div>
        </div>
        <div className="min-w-0 text-[12px] grid grid-cols-[70px_1fr] gap-x-2 gap-y-1 tabular-nums">
          <span className="text-[#8A7A8B]">Cargo</span>
          <span className="font-semibold text-[#3B1B3D] truncate">{r.cargo_total != null ? `${fmtNumber(r.cargo_total, 3)} ${r.cargo_unit || ''}` : '—'}</span>
          <span className="text-[#8A7A8B]">Invoices</span>
          <span className="font-semibold text-[#3B1B3D]">{r.invoice_count || 0}</span>
          <span className="text-[#8A7A8B]">Next ETA</span>
          <span className="text-[#3B1B3D] truncate" title={r.next_port_code ? fmtDateTimePort(r.next_eta_at, tzByCode.get(r.next_port_code)) : undefined}>
            {r.next_port_code ? <><b>{r.next_port_code}</b> · {fmtDateTimeCompact(r.next_eta_at, tzByCode.get(r.next_port_code))}</> : '—'}
          </span>
        </div>
        <div className="flex @5xl:flex-col items-center @5xl:items-end gap-1.5 flex-wrap">
          <Chip tone={st?.tone || 'grey'} title={r.status === 'draft' ? 'Draft — needs review' : st?.hint}>{st?.label || r.status}</Chip>
          <span className={`text-[10.5px] font-semibold ${r.source === 'api' ? 'text-[#2F4FA8]' : r.source === 'ai' ? 'text-[#5B2E8C]' : 'text-[#8A7A8B]'}`} title="Source">{VOYAGE_SOURCE_LABEL[r.source] || r.source}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Agency invoice ──────────────────────────────────────────────────────────────────────────────────────────
// Progres invoice (2026-10-20, permintaan user): 4 pil Completed -> Verified -> Approved -> Paid, hijau bila tahap sudah dilewati.
// Completed = AI selesai membaca (bukan processing/failed/cancelled); Verified = semua baris terverifikasi (verification dgn 0 baris
// belum verif, atau sudah lewat); Approved = approved/journal/paid; Paid = paid.
export const invoiceProgress = (r: Pick<CostAgentInvoiceListRow, 'status' | 'line_count' | 'unverified_count'>) => {
  const completed = !['processing', 'failed', 'cancelled'].includes(r.status)
  const approved = ['approved', 'journal', 'paid'].includes(r.status)
  const verified = approved || r.status === 'waiting_approval' || (r.status === 'verification' && r.line_count > 0 && r.unverified_count === 0)
  return [
    { key: 'completed', label: 'Completed', done: completed },
    { key: 'verified', label: 'Verified', done: verified },
    { key: 'approved', label: 'Approved', done: approved },
    { key: 'paid', label: 'Paid', done: r.status === 'paid' },
  ]
}

// Garis progres (pola Timeline kartu Finance Handover, dipercantik 2026-10-20): simpul bulat (selesai = hijau + centang, tahap berjalan = bercincin
// sesuai nada status, belum = abu), konektor tebal membulat, label + keterangan kecil di bawahnya.
type StepTone = 'amber' | 'purple' | 'red' | 'blue'
const STEP_NOW: Record<StepTone, string> = {
  amber: 'border-[#E0A526] bg-[#FFF1D6] text-[#B7791F]', purple: 'border-[#5B2E8C] bg-[#EFE7F7] text-[#5B2E8C]',
  red: 'border-[#A8231A] bg-[#FDE7E4] text-[#A8231A]', blue: 'border-[#2F4FA8] bg-[#EEF1FA] text-[#2F4FA8]',
}
const InvoiceStepper: React.FC<{ r: CostAgentInvoiceListRow }> = ({ r }) => {
  const steps = invoiceProgress(r)
  const cur = r.status === 'cancelled' ? -1 : steps.findIndex(s => !s.done)
  const curTone: StepTone = r.status === 'failed' || r.status === 'rejected' ? 'red' : r.status === 'processing' ? 'blue' : r.status === 'waiting_approval' ? 'purple' : 'amber'
  const note = (key: string, done: boolean): { text: string; cls: string } => {
    if (done) return { text: 'Done', cls: 'text-[#17663D]' }
    if (key === 'completed') return r.status === 'failed' ? { text: 'Failed', cls: 'text-[#A8231A] font-semibold' } : { text: r.status === 'processing' ? 'AI reading…' : 'Pending', cls: r.status === 'processing' ? 'text-[#2F4FA8] font-semibold' : 'text-[#8A7A8B]' }
    if (key === 'verified' && r.status === 'verification' && r.unverified_count > 0) return { text: `${r.unverified_count} to verify`, cls: 'text-[#7A4F00] font-semibold' }
    if (key === 'approved') {
      if (r.status === 'waiting_approval') return { text: 'Waiting', cls: 'text-[#5B2E8C] font-semibold' }
      if (r.status === 'rejected') return { text: 'Rejected', cls: 'text-[#A8231A] font-semibold' }
    }
    return { text: 'Pending', cls: 'text-[#A89AA9]' }
  }
  return (
    <div className="flex items-start" aria-label="Invoice progress" data-invoice-progress>
      {steps.map((s, i) => {
        const n = note(s.key, s.done)
        const now = i === cur
        return (
          <div key={s.key} className="flex-1 min-w-[68px]">
            <div className="flex items-center">
              <span className={`w-[22px] h-[22px] rounded-full shrink-0 inline-flex items-center justify-center border-2 ${s.done ? 'bg-[#17663D] border-[#17663D] text-white shadow-sm' : now ? `${STEP_NOW[curTone]} ring-4 ring-black/[0.04]` : 'bg-white border-[#E4DCD6] text-[#C9BEC8]'}`}>
                {s.done ? <Check size={12} strokeWidth={3.5} />
                  : now ? (curTone === 'red' ? <X size={11} strokeWidth={3.5} /> : curTone === 'blue' ? <Loader2 size={11} className="animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />)
                  : null}
              </span>
              {i < steps.length - 1 && <span className={`h-[3px] flex-1 mx-1 rounded-full ${steps[i + 1].done ? 'bg-[#17663D]' : s.done ? 'bg-gradient-to-r from-[#17663D] to-[#EADFD6]' : 'bg-[#EADFD6]'}`} />}
            </div>
            <div className={`text-[11px] mt-1.5 leading-none ${s.done || now ? 'font-bold text-[#3B1B3D]' : 'font-semibold text-[#8A7A8B]'}`}>{s.label}</div>
            <div className={`text-[10px] mt-0.5 truncate ${n.cls}`}>{n.text}</div>
          </div>
        )
      })}
    </div>
  )
}

export const CostAgentInvoiceCard: React.FC<{
  r: CostAgentInvoiceListRow
  selected: boolean // invoice yg sedang dibuka di modal
  onOpen: () => void
  checkbox?: { checked: boolean; onChange: (v: boolean) => void } // tab Approved + hak payment
  error?: string | null // error_message invoice failed
  onReprocess?: () => void
  reprocessing?: boolean
  onDelete?: () => void // Admin, masa uji coba
  deleting?: boolean
  mine?: boolean // invoice ini menunggu persetujuan user yg login (tab My Approvals) -> chip "Your approval" + tombol "Decide"
}> = ({ r, selected, onOpen, checkbox, error, onReprocess, reprocessing, onDelete, deleting, mine = false }) => {
  const st = INVOICE_STATUS_META[r.status]
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  // 2026-10-20 (permintaan user: ringkas, tidak tinggi): Vessel / Port / Voyage / Description TIDAK ditampilkan di kartu (ada di modal). Susunan 2 baris:
  // kiri = PT · vendor · no invoice + tanggal/dokumen/PO; tengah = garis progres (pola Finance Handover); kanan = chip status/alert + Cost lines,
  // Grand total, tombol. Layar sempit: ditumpuk.
  return (
    <div className={cardCls(st?.tone || 'grey', selected)} onClick={onOpen} data-invoice-card={r.id} aria-current={selected || undefined}>
      <div className="grid grid-cols-1 @3xl:grid-cols-2 @5xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_auto] gap-x-6 gap-y-3 px-4 py-3 items-center">
        {/* 1. Identitas */}
        <div className="min-w-0 flex gap-2.5">
          {checkbox && (
            <input type="checkbox" aria-label={`Select invoice ${r.invoice_no || r.id}`} className="mt-1 w-4 h-4 accent-[#6B3470] shrink-0" checked={checkbox.checked}
              onClick={stop} onChange={e => checkbox.onChange(e.target.checked)} />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {r.company_code && <PtBadge code={r.company_code} />}
              <span className="text-[15px] font-bold text-[#3B1B3D] truncate" title={r.vendor_name || undefined}>{r.vendor_name || <span className="text-[#8A7A8B] font-normal">Unknown vendor</span>}</span>
              <span className="text-[11.5px] font-semibold text-[#6E5E70] px-2 py-0.5 rounded-md bg-[#F3EEEA] whitespace-nowrap">{r.invoice_no || `#${r.id}`}</span>
            </div>
            {/* Vessel / Port / Voyage di-highlight (permintaan user 2026-10-20): 3 pil kecil -- vessel plum, port biru, voyage hijau (palet RouteBadges). */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-invoice-ship>
              <span className="inline-flex items-center gap-1 max-w-[240px] px-2 py-0.5 rounded-md bg-[#F5EDF3] text-[#3B1B3D] text-[12px] font-bold" title={r.vessel_name ? `Vessel: ${r.vessel_name}` : 'Vessel'}>
                <Ship size={12} className="shrink-0 text-[#6B3470]" /><span className="truncate">{r.vessel_name || '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 max-w-[260px] px-2 py-0.5 rounded-md bg-[#EEF1FA] text-[#2F4FA8] text-[12px] font-bold" title={r.port_name ? `Port: ${r.port_code} — ${r.port_name}` : 'Port'}>
                <MapPin size={12} className="shrink-0" /><span className="truncate">{r.port_code ? `${r.port_code}${r.port_name ? ` — ${r.port_name}` : ''}` : '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EAF6EF] text-[#17663D] text-[12px] font-bold whitespace-nowrap" title="Voyage">
                <Navigation size={11} className="shrink-0" />Voy {r.voyage_no || '—'}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11.5px] text-[#8A7A8B]">
              <span className="whitespace-nowrap">Invoice date {fmtDate(r.invoice_date)}</span>
              {r.service_date && <span className="whitespace-nowrap">Service date {fmtDate(r.service_date)}</span>}
              {(r.documents_processing ?? 0) > 0
                ? <span className="inline-flex items-center gap-1 text-[#2F4FA8]" title="Documents being processed"><Loader2 size={11} className="animate-spin" />{r.document_count ?? ''} docs</span>
                : r.document_count != null ? <span className="inline-flex items-center gap-1 text-[#8A7A8B]" title="Documents"><FileText size={11} />{r.document_count} doc{r.document_count === 1 ? '' : 's'}</span> : null}
              {r.po_numbers?.length ? <span className="text-[#8A7A8B] truncate max-w-[200px]" title={r.po_numbers.join(', ')} data-invoice-po>PO {r.po_numbers.slice(0, 2).join(', ')}{r.po_numbers.length > 2 ? ` +${r.po_numbers.length - 2}` : ''}</span> : null}
            </div>
            {r.status === 'failed' && (
              <div className="mt-1.5 flex items-start gap-2 flex-wrap">
                <span className="text-[11.5px] text-[#A8231A] [overflow-wrap:anywhere]">{error || 'AI processing failed.'}</span>
                {onReprocess && (
                  <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} disabled={reprocessing} onClick={e => { stop(e); onReprocess() }}>
                    <RotateCcw size={12} /> {reprocessing ? 'Sending…' : 'Reprocess'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. Garis progres */}
        <div className="min-w-0"><InvoiceStepper r={r} /></div>

        {/* 3. Chip status / alert, lalu Cost lines + Grand total + aksi */}
        <div className="min-w-0 flex flex-col @5xl:items-end gap-1.5 @3xl:col-span-2 @5xl:col-span-1">
          {(r.duplicate_of || mine) && (
            <div className="flex flex-wrap items-center gap-1.5 @5xl:justify-end">
              {r.duplicate_of && <Chip tone="red">Duplicate of #{r.duplicate_of}</Chip>}
              {mine && <Chip tone="purple" title="This invoice is waiting for your approval"><ShieldCheck size={10} /> Your approval</Chip>}
            </div>
          )}
          <div className="flex items-center gap-4 @5xl:justify-end">
            <div className="text-[18px] leading-tight font-bold text-[#3B1B3D] tabular-nums whitespace-nowrap" title="Grand total">{fmtMoney(r.grand_total, r.currency)}</div>
            <button type="button" onClick={e => { stop(e); onOpen() }} aria-pressed={selected} title="Open the invoice review" data-invoice-review
              className={`inline-flex items-center justify-center px-4 h-8 rounded-xl text-xs font-semibold text-white transition-colors ${selected ? 'bg-[#3B1B3D]' : 'bg-[#6B3470] hover:bg-[#5A2A5E]'}`}>
              {mine ? 'Decide' : 'Review'}
            </button>
            {/* Hapus = paling ujung kanan (permintaan user 2026-10-20). */}
            {onDelete && (
              <button type="button" aria-label={`Delete invoice ${r.invoice_no || r.id}`} title="Delete (Admin, trial data)" disabled={deleting}
                onClick={e => { stop(e); onDelete() }}
                className="w-8 h-8 -ml-2 inline-flex items-center justify-center rounded-xl text-[#8A7A8B] hover:text-[#A8231A] hover:bg-[#FDE7E4] transition-colors disabled:opacity-50">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}