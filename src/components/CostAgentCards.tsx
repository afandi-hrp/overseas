// Tampilan KARTU halaman Cost Agent (2026-10-14, keputusan user): Voyages & Agency Invoices -- pola SAMA kartu Invoice Recap /
// Audit Courier & Sea & Air (token SeaAirAuditUi, garis warna status di kiri, container query supaya kartu memadat otomatis saat
// daftar berbagi lebar dgn panel samping). Murni tampilan: baris = hasil query daftar yang SAMA dgn mode List (view
// cost_agent_voyage_list_v / cost_agent_invoice_list_v), tanpa query tambahan.
import React from 'react'
import { Loader2, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { RouteBadges, StatusChip } from './CostAgentUi'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, Chip, PtBadge, type Tone } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  fmtDate, fmtMoney, fmtNumber, fmtReportMonth, fmtDateTimeCompact, fmtDateTimePort, tzAbbrev, routePorts,
  INVOICE_STATUS_META, VOYAGE_STATUS_META, VOYAGE_SOURCE_LABEL, TAX_STATUS_META,
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
}> = ({ r, selected, onOpen, checkbox, error, onReprocess, reprocessing, onDelete, deleting }) => {
  const st = INVOICE_STATUS_META[r.status]
  const tax = r.tax_status ? TAX_STATUS_META[r.tax_status] : null
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div className={cardCls(st?.tone || 'grey', selected)} onClick={onOpen} data-invoice-card={r.id} aria-current={selected || undefined}>
      <div className="grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_190px] gap-x-4 gap-y-2.5 px-3.5 py-3 items-start">
        <div className="min-w-0 flex gap-2.5">
          {checkbox && (
            <input type="checkbox" aria-label={`Select invoice ${r.invoice_no || r.id}`} className="mt-1 w-4 h-4 accent-[#6B3470] shrink-0" checked={checkbox.checked}
              onClick={stop} onChange={e => checkbox.onChange(e.target.checked)} />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {r.company_code && <PtBadge code={r.company_code} />}
              <span className="text-[11px] font-semibold text-[#6E5E70]">{fmtDate(r.invoice_date)}</span>
            </div>
            <div className="mt-1 text-[14px] font-bold text-[#3B1B3D] truncate" title={r.vendor_name || undefined}>{r.vendor_name || <span className="text-[#8A7A8B] font-normal">Unknown vendor</span>}</div>
            <div className="text-[12px] text-[#6E5E70] truncate">{r.invoice_no || `#${r.id}`}</div>
          </div>
        </div>
        <div className="min-w-0 text-[12px] grid grid-cols-[52px_1fr] gap-x-2 gap-y-1">
          <span className="text-[#8A7A8B]">Vessel</span>
          <span className="font-semibold text-[#3B1B3D] truncate" title={r.vessel_name || undefined}>{r.vessel_name || '—'}{r.voyage_no ? <span className="font-normal text-[#6E5E70]"> · Voy {r.voyage_no}</span> : null}</span>
          <span className="text-[#8A7A8B]">Port</span>
          <span className="text-[#3B1B3D] truncate" title={r.port_name || undefined}>{r.port_code ? `${r.port_code}${r.port_name ? ` — ${r.port_name}` : ''}` : '—'}</span>
          <span className="text-[#8A7A8B]">Docs</span>
          <span className="text-[#6E5E70] inline-flex items-center gap-1">
            {(r.documents_processing ?? 0) > 0 ? <><Loader2 size={12} className="animate-spin text-[#2F4FA8]" /> processing</>
              : r.document_count != null ? <><FileText size={12} /> {r.document_count}</> : '—'}
            {r.po_numbers?.length ? <span className="ml-1 inline-flex flex-wrap gap-1">{r.po_numbers.slice(0, 2).map(p => <Chip key={p} tone="plum">{p}</Chip>)}{r.po_numbers.length > 2 && <Chip tone="grey">+{r.po_numbers.length - 2}</Chip>}</span> : null}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1">
            {r.naik_count > 0 && <Chip tone="red">▲ {r.naik_count} higher</Chip>}
            {r.baru_count > 0 && <Chip tone="amber">{r.baru_count} new item{r.baru_count > 1 ? 's' : ''}</Chip>}
            {r.duplicate_of && <Chip tone="red">Duplicate of #{r.duplicate_of}</Chip>}
            <Chip tone={tax?.tone || 'grey'}>Tax: {tax ? tax.label.toLowerCase() : '—'}</Chip>
            {r.status === 'verification' && r.unverified_count > 0 && <Chip tone="grey">{r.unverified_count} to verify</Chip>}
          </div>
          <div className="mt-1 text-[11px] text-[#8A7A8B]">{r.line_count} line{r.line_count === 1 ? '' : 's'}</div>
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
        <div className="flex @5xl:flex-col items-center @5xl:items-end justify-between gap-1.5 flex-wrap">
          <div className="@5xl:text-right">
            <div className={SA_LABEL}>Grand total</div>
            <div className="text-[16px] leading-tight font-bold text-[#3B1B3D] tabular-nums">{fmtMoney(r.grand_total, r.currency)}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusChip status={r.status} />
            {onDelete && (
              <button type="button" aria-label={`Delete invoice ${r.invoice_no || r.id}`} title="Delete (Admin, trial data)" disabled={deleting}
                onClick={e => { stop(e); onDelete() }}
                className="p-1.5 rounded-lg text-[#8A7A8B] hover:text-[#A8231A] hover:bg-[#FDE7E4] disabled:opacity-50">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
