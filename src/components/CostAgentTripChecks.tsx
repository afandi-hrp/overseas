// Kartu "Trip dates & vessel" (SQL 112 / 112b, 2026-10-31) di bawah tabel "Per-line comparison" tab Documents & Tax: nama kapal, tanggal tiba (TA) dan tanggal berangkat (TD) dibandingkan antara
// voyage report, header invoice dan TIAP dokumen lampiran. Tiga kartu berdampingan (Vessel | Arrival | Departure; ditumpuk di bawah ~900px), satu baris rapat per sumber:
// [ikon status] [nama sumber + nomor dokumen] [nilai (+ selisih hari)] [pil halaman]. Halaman disusun dari ANGKA (bukan `location`), nama file hanya di tooltip, TANPA tautan / klik
// (pratinjau dokumen tetap lewat bagian Documents). Sumber "tidak ditemukan" digabung satu baris di dasar kartu. Status, acuan dan selisih hari dihitung SERVER; di sini hanya tampilan.
// Selisih trip tidak memblokir submit kecuali kodenya ada di setting gate_block_codes.
import { useState } from 'react'
import { AlertCircle, CalendarCheck, CalendarDays, CheckCircle2, Contrast, Dot, Info, Ship } from 'lucide-react'
import { Chip } from './SeaAirAuditUi'
import type { Tone } from './SeaAirAuditUi'
import type { DocCmpTripChecks, TripField, TripSource } from '../utils/CostAgentHelpers'
import {
  TRIP_AGREE_TEXT, TRIP_NOT_LINKED_NOTE, TRIP_ROW_LIMIT, gapOutOfTolerance, gapText, orderTripFields, tripFieldChip, tripFieldLabel, tripFileOrder, tripHasHidden, tripNotFoundLabel, tripPage,
  tripReferenceCaption, tripReferenceValue, tripRowIcon, tripRowOrder, tripSourceName, tripSummaryPills, tripToleranceText, tripValueText, tripVisible, tripVisibleCount, type TripIconKind,
} from '../utils/CostAgentTripLogic'

const ICON: Record<string, typeof Ship> = { vessel: Ship, arrival: CalendarCheck, departure: CalendarDays }
const ICON_BOX: Record<string, string> = { green: 'bg-[#EAF6EF] text-[#17663D]', red: 'bg-[#FDE7E4] text-[#A8231A]', amber: 'bg-[#FFF1D6] text-[#7A4F00]', grey: 'bg-[#F3EEEA] text-[#6E5E70]', blue: 'bg-[#EEF1FA] text-[#2F4FA8]' }
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3470] focus-visible:ring-offset-1 rounded'

function StatusIcon({ kind, label }: { kind: TripIconKind; label: string }) {
  const p = { size: 18, role: 'img', 'aria-label': label } as const
  return (
    <span title={label} className="inline-flex items-center justify-center" data-trip-icon={kind}>
      {kind === 'ok' ? <CheckCircle2 {...p} className="text-[#2E9E5E]" />
        : kind === 'diff' ? <AlertCircle {...p} className="text-[#A8231A]" />
          : kind === 'warn' ? <Contrast {...p} className="text-[#B7791F]" />
            : <Dot {...p} className="text-[#8A7A8B]" />}
    </span>
  )
}

function SourceRow({ f, s, tol, fileOrder }: { key?: number; f: TripField; s: TripSource; tol: number; fileOrder: Map<string, number> }) {
  const n = tripSourceName(s)
  const icon = tripRowIcon(s, f.status)
  const gap = gapText(s.gap_days)
  const bad = s.status === 'diff'
  const ref = s.status === 'ref'
  const page = tripPage(s, fileOrder) // pil statis: tanpa tautan / klik
  const notFound = tripNotFoundLabel(s) // sumber tanpa nilai tetap jadi baris: nilai abu "Not found" / "Not linked"
  const value = notFound ?? tripValueText(f.key, s.value)
  const vesselBad = bad && f.key === 'vessel'
  return (
    <li className={`grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-x-2 px-3 min-h-[44px] py-1.5 border-t border-[#F3EEEA] first:border-t-0 border-l-[3px] ${ref ? 'border-l-[#6B3470] bg-[#F5EDF3]/60' : 'border-l-transparent'}`}
      data-trip-source={s.kind} data-trip-source-status={s.status}>
      <StatusIcon kind={icon.kind} label={icon.label} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-[12px] font-bold text-[#3B1B3D]" title={n.name}>{n.name}</span>
          {ref && <span className="shrink-0 rounded px-1 py-px text-[9.5px] font-bold uppercase tracking-wide bg-[#EFE2EC] text-[#6B3470]" data-trip-ref-tag>Ref</span>}
          {bad && <Chip tone="red" className="shrink-0 !py-px">Different</Chip>}
          {s.manual && <Chip tone="purple" className="shrink-0 !py-px" title="This value was entered by hand">Entered manually</Chip>}
        </div>
        {n.sub && <div className="truncate text-[10.5px] text-[#6E5E70] tabular-nums" title={n.sub}>{n.sub}</div>}
      </div>
      <div className="text-right whitespace-nowrap min-w-0">
        <span className={`text-[12.5px] font-semibold tabular-nums ${notFound || value === '—' ? 'text-[#8A7A8B] font-normal italic' : bad ? 'text-[#A8231A]' : 'text-[#3B1B3D]'} ${vesselBad ? 'inline-block max-w-[11rem] truncate align-bottom rounded bg-[#FDE7E4] px-1.5' : ''}`} title={vesselBad ? value : undefined}>{value}</span>
        {gap && <span className={`ml-1.5 text-[10.5px] font-semibold tabular-nums ${gapOutOfTolerance(s.gap_days, tol) ? 'text-[#A8231A]' : 'text-[#6E5E70]'}`} title="Difference to the reference">{gap}</span>}
      </div>
      <div className="justify-self-end">
        {page && (
          <span title={page.tip} data-trip-page={page.exact ? 'exact' : 'approx'}
            className={`inline-flex items-center rounded-md px-1.5 py-px text-[10.5px] font-semibold tabular-nums whitespace-nowrap cursor-default select-text ${page.exact ? 'bg-[#F3EEEA] text-[#3B1B3D] border border-[#E4D9D0]' : 'border border-dashed border-[#CFC3CF] text-[#6E5E70] bg-transparent opacity-80'}`}>
            {page.text}
          </span>
        )}
      </div>
    </li>
  )
}

function FieldCard({ f, tol, fileOrder, rowOrder, showAll }: { key?: string; f: TripField; tol: number; fileOrder: Map<string, number>; rowOrder: Map<string, number>; showAll: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const chip = tripFieldChip(f)
  const Icon = ICON[f.key] ?? CalendarDays
  const { shown: rows, hidden } = tripVisible(f, rowOrder, showAll)
  const matchN = f.sources.filter(x => x.status === 'ok' || x.status === 'ref').length
  const visible = tripVisibleCount(rows.length, expanded)
  const hiddenN = rows.length - visible // baris yang dilipat oleh "Show N more"
  const refValue = tripReferenceValue(f)
  return (
    <div className="min-w-0 rounded-2xl border border-[#EADFD6] bg-white shadow-[0_1px_2px_rgba(59,27,61,0.06)] overflow-hidden" data-trip-field={f.key} data-trip-status={f.status}>
      <div className="px-3 pt-3 pb-2.5 border-b border-[#EADFD6] bg-[#FBF7F4]">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 ${ICON_BOX[chip.tone] ?? ICON_BOX.grey}`} aria-hidden><Icon size={14} /></span>
          <span className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#6E5E70]">{tripFieldLabel(f)}</span>
          <Chip tone={chip.tone as Tone} className={`ml-auto shrink-0 ${chip.faint ? 'opacity-70' : ''}`}>{chip.label}</Chip>
        </div>
        <div className={`mt-2 text-[18px] leading-tight font-bold tabular-nums [overflow-wrap:anywhere] ${refValue === '—' ? 'text-[#8A7A8B]' : 'text-[#3B1B3D]'}`} data-trip-reference>{refValue}</div>
        <div className="text-[11px] text-[#6E5E70]">{tripReferenceCaption(f)}</div>
      </div>
      {rows.length > 0 && <ul>{rows.slice(0, visible).map((s, i) => <SourceRow key={i} f={f} s={s} tol={tol} fileOrder={fileOrder} />)}</ul>}
      {rows.length > TRIP_ROW_LIMIT && (
        <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} data-trip-more
          className={`w-full px-3 py-1.5 border-t border-[#F3EEEA] text-left text-[11.5px] font-semibold text-[#6B3470] hover:underline ${FOCUS}`}>
          {expanded ? 'Show fewer' : `Show ${hiddenN} more`}
        </button>
      )}
      {rows.length === 0 && (f.sources.length === 0
        ? <p className="px-3 py-3 text-[12px] italic text-[#8A7A8B]">No source found.</p>
        : <p className="px-3 py-2.5 text-[12px] font-semibold text-[#17663D] inline-flex items-center gap-1.5" data-trip-all-match><CheckCircle2 size={13} aria-hidden /> All {matchN} source{matchN === 1 ? '' : 's'} match</p>)}
      {rows.length > 0 && hidden > 0 && <p className="px-3 py-1.5 border-t border-[#F3EEEA] bg-[#FBF7F4] text-[11px] text-[#6E5E70]" data-trip-hidden>{hidden} matching source{hidden === 1 ? '' : 's'} hidden</p>}
    </div>
  )
}

export default function CostAgentTripChecks({ trip }: { trip: DocCmpTripChecks | null | undefined }) {
  const [showAll, setShowAll] = useState(false) // hook SEBELUM return dini (aturan hooks)
  if (!trip || !Array.isArray(trip.fields) || trip.fields.length === 0) return null // invoice lama / SQL 112 belum terpasang: kartu tidak tampil
  const pills = tripSummaryPills(trip.summary)
  const fields = orderTripFields(trip.fields)
  const fileOrder = tripFileOrder(fields)
  const rowOrder = tripRowOrder(fields) // urutan baris SAMA di ketiga kartu
  const canToggle = showAll || tripHasHidden(fields, rowOrder)
  return (
    <section className="@container space-y-2.5" data-trip-card>
      <div className="flex items-center gap-2 flex-wrap px-1">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">Trip dates &amp; vessel</h3>
        {pills.length === 0
          ? <Chip tone="green">{TRIP_AGREE_TEXT}</Chip>
          : pills.map(p => <Chip key={p.text} tone={p.tone as Tone}>{p.text}</Chip>)}
        <span className="ml-auto flex items-center gap-3">
          {canToggle && <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} data-trip-toggle className={`text-[12px] font-semibold text-[#6B3470] hover:underline ${FOCUS}`}>{showAll ? 'Show only differences' : 'Show all sources'}</button>}
          <span className="text-[11.5px] text-[#6E5E70]" data-trip-tolerance>{tripToleranceText(trip.tolerance_days)}</span>
        </span>
      </div>
      {!trip.voyage_linked && (
        <p className="px-1 flex items-center gap-1.5 text-[11.5px] text-[#6E5E70]" data-trip-not-linked><Info size={13} className="shrink-0 text-[#8A7A8B]" aria-hidden /> {TRIP_NOT_LINKED_NOTE}</p>
      )}
      <div className="grid grid-cols-1 @min-[900px]:grid-cols-3 gap-3 items-start" data-trip-columns>
        {fields.map(f => <FieldCard key={f.key} f={f} tol={trip.tolerance_days} fileOrder={fileOrder} rowOrder={rowOrder} showAll={showAll} />)}
      </div>
    </section>
  )
}
