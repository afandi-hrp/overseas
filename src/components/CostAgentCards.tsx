// Tampilan KARTU halaman Cost Agent (2026-10-14, keputusan user): Voyages & Agency Invoices -- pola SAMA kartu Invoice Recap /
// Audit Courier & Sea & Air (token SeaAirAuditUi, garis warna status di kiri, container query supaya kartu memadat otomatis saat
// daftar berbagi lebar dgn panel samping). Murni tampilan: baris = hasil query daftar yang SAMA dgn mode List (view
// cost_agent_voyage_list_v / cost_agent_invoice_list_v), tanpa query tambahan.
import React from 'react'
import { Loader2, RotateCcw, Trash2, FileText, ShieldCheck, Check, X, Ship, MapPin, Navigation, Sparkles, Cloud, FileSpreadsheet, Pencil, Anchor } from 'lucide-react'
import { SA_CARD, SA_BTN_OUTLINE, Chip, Pill, PtBadge, type Tone } from './SeaAirAuditUi'
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
// Kartu voyage (2026-10-29, permintaan user: samakan dgn kartu Invoice Recap Courier -- CourierRecapGroupCard): nama kapal tebal ungu + bulan laporan kecil + pil (PT, Voy #seq,
// charter, tipe, Noon Report) | rute (kode pelabuhan, hijau = pertama, biru = terakhir) | pil berwarna Arrival / Departure (label lebar tetap) | status + source | Updated | tombol bulat "Open ›".
// Container query pada lebar KARTU: >= 1180px enam kolom + pembatas vertikal samar; lebih sempit dua kolom + pembatas horizontal. Data = baris view yang SAMA (tanpa query tambahan).
// Rute > 6 pelabuhan: bagian tengah diringkas "+n".
const MAX_ROUTE_NODES = 6
const routeNodes = (hops: string[]): { code: string; kind: 'first' | 'mid' | 'last' | 'more' }[] => {
  const kind = (i: number, n: number) => (i === 0 ? 'first' : i === n - 1 ? 'last' : 'mid') as 'first' | 'mid' | 'last'
  if (hops.length <= MAX_ROUTE_NODES) return hops.map((code, i) => ({ code, kind: kind(i, hops.length) }))
  const hidden = hops.length - 4
  return [
    { code: hops[0], kind: 'first' }, { code: hops[1], kind: 'mid' }, { code: `+${hidden}`, kind: 'more' },
    { code: hops[hops.length - 2], kind: 'mid' }, { code: hops[hops.length - 1], kind: 'last' },
  ]
}
// Source voyage: ikon + nada chip (AI ungu, API biru, Import hijau, Manual abu).
const SOURCE_ICON: Record<string, React.ElementType> = { ai: Sparkles, api: Cloud, import: FileSpreadsheet, manual: Pencil }
const SOURCE_TONE: Record<string, Tone> = { ai: 'purple', api: 'blue', import: 'green', manual: 'grey' }
const NODE_TEXT: Record<'first' | 'mid' | 'last' | 'more', string> = {
  first: 'text-[#17663D]', last: 'text-[#2F4FA8]', mid: 'text-[#3B1B3D]', more: 'text-[#8A7A8B]',
}

// Pembatas kolom lebih tegas (0.38; dulu 0.18) dan SETINGGI baris kartu: kolom diregangkan (items-stretch) dan isinya dipusatkan vertikal, jadi semua garis sama panjang.
const VSEP = 'border-[rgba(138,123,155,0.38)]'
const V_CENTER = '@min-[1180px]:flex @min-[1180px]:flex-col @min-[1180px]:justify-center'
const V_PILL_LABEL = 'w-[74px] shrink-0 text-left'

export const CostAgentVoyageCard: React.FC<{ r: CostAgentVoyageListRow; tzByCode: Map<string, string>; selected: boolean; onOpen: () => void }> = ({ r, tzByCode, selected, onOpen }) => {
  const st = VOYAGE_STATUS_META[r.status]
  const hops = routePorts(r.route)
  const nodes = routeNodes(hops)
  const tzFirst = tzByCode.get(hops[0]), tzLast = tzByCode.get(hops[hops.length - 1])
  const noon = r.input_source === 'noon_report'
  const draft = r.status === 'draft'
  const SrcIcon = SOURCE_ICON[r.source] || Pencil
  const sepV = `@min-[1180px]:border-l @min-[1180px]:pl-4 ${V_CENTER} ${VSEP}`
  const sepH = `border-t pt-2.5 @min-[1180px]:border-t-0 @min-[1180px]:pt-0 ${VSEP}`
  return (
    <div className={`${cardCls(st?.tone || 'grey', selected)} group`} onClick={onOpen} data-voyage-card={r.id} aria-current={selected || undefined}>
      <div className={`grid grid-cols-2 gap-x-3.5 gap-y-2.5 px-3.5 py-3 items-start @min-[1180px]:grid-cols-[minmax(200px,1.4fr)_minmax(150px,0.8fr)_minmax(260px,1fr)_minmax(130px,0.6fr)_minmax(110px,0.5fr)_100px] @min-[1180px]:gap-x-4 @min-[1180px]:px-4 @min-[1180px]:py-3.5 @min-[1180px]:items-stretch ${draft ? 'bg-[#FFFDF6]' : ''}`}>
        {/* 1. Nama kapal, bulan laporan, pil PT / Voy / charter / tipe / Noon Report */}
        <div className={`min-w-0 ${V_CENTER}`}>
          <div className="text-[14px] @min-[1180px]:text-[15px] font-extrabold text-[#3B2260] leading-tight truncate" title={r.vessel_name}>{r.vessel_name}</div>
          <div className="text-[11.5px] text-[#8A7A8B] mt-0.5 mb-1.5">{fmtReportMonth(r.report_month)}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {r.company_code && <Pill tone="grey">{r.company_code}</Pill>}
            <Pill tone="green" title="Voyage number"><Navigation size={11} className="shrink-0" />Voy {r.voyage_no}{r.seq_in_report != null && <span className="opacity-70" title="Sequence in the monthly report">#{r.seq_in_report}</span>}</Pill>
            {r.charter_type && <Pill tone="plum" title="Charter type">{r.charter_type}</Pill>}
            {r.vessel_type && <Pill tone="amber" title="Vessel type"><Anchor size={11} className="shrink-0" aria-hidden />{r.vessel_type}</Pill>}
            {noon && <Pill tone="blue" title="Created from a Noon Report">Noon Report</Pill>}
          </div>
        </div>

        {/* 2. Rute: kode pelabuhan berurutan (hijau = pertama, biru = terakhir), gaya kolom PO · Origin di kartu Courier */}
        {/* Route di TENGAH antara dua pembatas (2026-10-30, permintaan user): padding kiri-kanan sama, teks & node dipusatkan (>= 1180px). */}
        <div className={`min-w-0 @min-[1180px]:border-l @min-[1180px]:px-2 @min-[1180px]:items-center @min-[1180px]:text-center ${V_CENTER} ${VSEP}`} data-voyage-route>
          {/* Sebaris: "Route: BLW › LSM › KRR" (2026-10-30, permintaan user: label tidak di atas) */}
          <div className="flex flex-wrap items-baseline @min-[1180px]:justify-center gap-x-1.5 gap-y-0.5" title={r.route || undefined}>
            <span className="text-[11px] text-[#8A7A8B]">Route:</span>
            {nodes.length === 0 ? <span className="text-[12.5px] text-[#8A7A8B]">—</span> : (
              <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12.5px] font-bold">
                {nodes.map((n, k) => (
                  <React.Fragment key={k}>
                    {k > 0 && <span className="text-[#B9A9BA] font-normal" aria-hidden>›</span>}
                    <span className={NODE_TEXT[n.kind]}>{n.code}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* 3. Pil Arrival / Departure (label lebar tetap supaya rata antar kartu); zona waktu pelabuhan pertama / terakhir */}
        <div className={`min-w-0 ${sepV} ${sepH}`} data-voyage-times>
          <div className="flex flex-col items-start gap-1.5">
            <Pill tone="green" className="@min-[1180px]:w-full" title={fmtDateTimePort(r.first_arrival, tzFirst)}>
              <span className={V_PILL_LABEL}>Arrival</span>
              <span className="tabular-nums truncate">{r.first_arrival ? fmtDateTimeCompact(r.first_arrival, tzFirst) : '—'}</span>{r.first_arrival && <span className="text-[10px] font-normal opacity-70">{tzAbbrev(tzFirst)}</span>}
            </Pill>
            <Pill tone="blue" className="@min-[1180px]:w-full" title={fmtDateTimePort(r.last_departure, tzLast)}>
              <span className={V_PILL_LABEL}>Departure</span>
              <span className="tabular-nums truncate">{r.last_departure ? fmtDateTimeCompact(r.last_departure, tzLast) : '—'}</span>{r.last_departure && <span className="text-[10px] font-normal opacity-70">{tzAbbrev(tzLast)}</span>}
            </Pill>
          </div>
        </div>

        {/* 4. Status (+ titik utk Draft) dan source berikon */}
        <div className={`min-w-0 ${sepV} ${sepH}`}>
          <div className="flex flex-col items-start gap-1.5">
            <Pill tone={st?.tone || 'grey'} title={draft ? 'Draft — needs review' : st?.hint}>
              {draft && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}{st?.label || r.status}
            </Pill>
            <Pill tone={SOURCE_TONE[r.source] || 'grey'} title="Source of this voyage"><SrcIcon size={11} className="shrink-0" aria-hidden />{VOYAGE_SOURCE_LABEL[r.source] || r.source}</Pill>
          </div>
        </div>

        {/* 5. Terakhir diperbarui (slot "Total Expenses" kartu Courier) */}
        <div className={`min-w-0 ${sepH} ${V_CENTER}`}>
          <div className="text-[11px] text-[#8A7A8B]">Updated</div>
          <div className="text-[14px] @min-[1180px]:text-[15px] font-extrabold text-[#3B2260] tabular-nums leading-tight whitespace-nowrap" title={`Last updated ${fmtDate(r.updated_at)}`}>{fmtDate(r.updated_at)}</div>
        </div>

        {/* 6. Open › / Opened ✓ */}
        <div className="min-w-0 flex @min-[1180px]:justify-end @min-[1180px]:items-center">
          <button type="button" aria-pressed={selected} data-open-card onClick={e => { e.stopPropagation(); onOpen() }}
            className={`inline-flex items-center justify-center px-4 h-9 rounded-full border-[1.5px] border-[#6B3470] text-[13px] font-bold whitespace-nowrap transition-colors ${selected ? 'bg-[#F5EDF3] text-[#4A3A5C]' : 'bg-transparent text-[#6B3470] hover:bg-[#F5EDF3]'}`}>
            {selected ? 'Opened ✓' : 'Open ›'}
          </button>
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
          // Langkah TERAKHIR selebar isinya (titik + label), bukan slot flex-1: dulu slot kosong ±seperempat kolom di kanan titik "Paid" = jarak ke nominal terlalu lebar.
          <div key={s.key} className={i === steps.length - 1 ? 'shrink-0 min-w-[68px]' : 'flex-1 min-w-[68px]'}>
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
      {/* 3 KOLOM (2026-10-23, permintaan user): Identitas | Garis progres | Nominal + aksi. Kolom kanan LEBAR TETAP (dulu `auto` -> lebarnya mengikuti isi, mis. "—" saat AI masih
          membaca vs "Rp 15.803.330", sehingga garis progres tiap kartu mulai di posisi berbeda). >= 896px (laptop 14" ikut) 3 kolom; di bawahnya ditumpuk. */}
      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_264px] @7xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)_264px] gap-x-5 gap-y-3 px-5 py-3.5 items-center" data-invoice-card-grid>
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
            {/* 2026-10-23 (permintaan user): chip & keterangan di bawahnya SATU grid -> Vessel sejajar Invoice date, Port sejajar Service date,
                Voy sejajar jumlah dokumen (kolom sama, rata kiri). Lebar kolom = yang terlebar di antara chip & teksnya. */}
            <div className="mt-1.5 grid grid-cols-[repeat(3,minmax(0,auto))_minmax(0,auto)] justify-start items-center gap-x-3 gap-y-0.5" data-invoice-ship>
              <span className="inline-flex items-center gap-1 max-w-[240px] w-fit min-w-0 px-2 py-0.5 rounded-md bg-[#F5EDF3] text-[#3B1B3D] text-[12px] font-bold" title={r.vessel_name ? `Vessel: ${r.vessel_name}` : 'Vessel'}>
                <Ship size={12} className="shrink-0 text-[#6B3470]" /><span className="truncate">{r.vessel_name || '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 max-w-[260px] w-fit min-w-0 px-2 py-0.5 rounded-md bg-[#EEF1FA] text-[#2F4FA8] text-[12px] font-bold" title={r.port_name ? `Port: ${r.port_code} — ${r.port_name}` : 'Port'}>
                <MapPin size={12} className="shrink-0" /><span className="truncate">{r.port_code ? `${r.port_code}${r.port_name ? ` — ${r.port_name}` : ''}` : '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md bg-[#EAF6EF] text-[#17663D] text-[12px] font-bold whitespace-nowrap" title="Voyage">
                <Navigation size={11} className="shrink-0" />Voy {r.voyage_no || '—'}
              </span>
              <span aria-hidden />
              <span className="text-[11.5px] text-[#8A7A8B] truncate">Invoice date {fmtDate(r.invoice_date)}</span>
              <span className="text-[11.5px] text-[#8A7A8B] truncate">{r.service_date ? `Service date ${fmtDate(r.service_date)}` : ''}</span>
              {(r.documents_processing ?? 0) > 0
                ? <span className="inline-flex items-center gap-1 min-w-0 overflow-hidden text-[11.5px] text-[#2F4FA8] whitespace-nowrap" title="Documents being processed"><Loader2 size={11} className="animate-spin" />{r.document_count ?? ''} docs</span>
                : r.document_count != null ? <span className="inline-flex items-center gap-1 min-w-0 overflow-hidden text-[11.5px] text-[#8A7A8B] whitespace-nowrap" title="Documents"><FileText size={11} />{r.document_count} doc{r.document_count === 1 ? '' : 's'}</span> : <span aria-hidden />}
              {r.po_numbers?.length ? <span className="text-[11.5px] text-[#8A7A8B] truncate max-w-[200px]" title={r.po_numbers.join(', ')} data-invoice-po>PO {r.po_numbers.slice(0, 2).join(', ')}{r.po_numbers.length > 2 ? ` +${r.po_numbers.length - 2}` : ''}</span> : null}
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

        {/* 2. Garis progres -- layar lebar (>= 1280px): identitas lebar tetap 520px | progres mengisi sisanya | nominal 264px -> jarak identitas->progres dan progres->nominal sama kecil (tanpa ruang kosong besar di monitor 24"). */}
        <div className="min-w-0 w-full"><InvoiceStepper r={r} /></div>

        {/* 3. Chip status / alert, lalu Cost lines + Grand total + aksi */}
        <div className="min-w-0 flex flex-col @4xl:items-end gap-1.5">
          {(r.duplicate_of || mine) && (
            <div className="flex flex-wrap items-center gap-1.5 @4xl:justify-end">
              {r.duplicate_of && <Chip tone="red">Duplicate of #{r.duplicate_of}</Chip>}
              {mine && <Chip tone="purple" title="This invoice is waiting for your approval"><ShieldCheck size={10} /> Your approval</Chip>}
            </div>
          )}
          <div className="flex items-center justify-between @4xl:justify-end gap-3 @4xl:w-full">
            <div className="text-[18px] leading-tight font-bold text-[#3B1B3D] tabular-nums whitespace-nowrap @4xl:flex-1 @4xl:text-right" title="Grand total">{fmtMoney(r.grand_total, r.currency)}</div>
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
            {/* Tanpa tombol hapus (bukan Admin): ruangnya tetap dicadangkan supaya tombol Review lurus antar kartu. */}
            {!onDelete && <span aria-hidden className="hidden @4xl:block w-8 h-8 -ml-2 shrink-0" />}
          </div>
        </div>
      </div>
    </div>
  )
}