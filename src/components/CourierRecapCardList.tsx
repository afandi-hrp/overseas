// Tampilan KARTU Invoice Recap Courier (2026-10-02) -- 1 kartu = 1 AWB (invoice Freight / Duty / Credit Note
// digabung), pola kartu Invoice Recap Sea & Air (token SeaAirAuditUi). Data diambil SENDIRI per halaman AWB
// (fetchCourierRecapPage: RPC sql/037 opsi B, fallback di browser) -- BUKAN `records` tabel List.
// Kolom yang tidak diizinkan role (getAllowedColumns 'courier_rekapan') TIDAK ditampilkan (`colOk`).
// 2026-10-05 (keputusan user): panel Validation samping (CourierRecapValidationPanel) di kanan daftar; kartu tanpa pasangan Audit -> panel tab
// Invoices. Kartu memakai container query (@container) supaya otomatis ringkas saat lebarnya berbagi dgn panel.
// 2026-10-27 (revisi tampilan user, prototype Invoice_Recap_Prototype_revisi.html): 5 KPI ber-ikon (+ rincian show/hide per courier / per PPJK) dan
// kartu AWB disusun ulang (AWB+PT+Audit | PO+Origin | pil invoice | Submit+Due | Need Attention | Total Expenses + Open ›).
// 2026-10-28: isi pil invoice = 🧾 Invoice PPJK Date · 🏛️ FP Report Date (bukan lagi Email Received).
// Warna kartu submitted = kuning baris submitted versi List (#FFF5C5). Logika bisnis, data, filter, search, paginasi & versi List TIDAK berubah.
import React, { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, Clock, FileText, Landmark, Plane, Receipt, Wallet } from 'lucide-react'
import PaginationFooter from './PaginationFooter'
import { SA_CARD, Pill } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import { todayLocalIso } from '../utils/SeaAirRecapHelpers'
import { courierDocNo, isCourierDraft } from '../utils/CourierAuditHelpers'
import {
  fetchCourierRecapPage, fetchRecapAuditLinks, fetchCourierRecapAttentionGroups, fetchCourierRecapKpiGroups, recapGroupDue, recapAwbHeading, recapInvoicePills,
  INVOICE_KIND_LABEL, COURIER_DUE_DAYS,
  type RecapFilters, type RecapGroup, type RecapSummaryCourier, type RecapKpiFilter,
} from '../utils/CourierRecapHelpers'
import { rowValidationPct } from '../utils/CourierValidationPct'
import { attachCourierGrandTotals } from '../utils/CourierTotalBreakdown'
import { LoadingState, UpdatingBadge } from './LoadingState'
import type { ValidationTabKey } from './CourierValidationWindow'
import type { RecapPanelTab } from './CourierRecapValidationPanel'

// ─── KPI ──────────────────────────────────────────────────────────────────────
// 2026-10-27 (revisi user): 5 kartu ber-ikon di kiri -- Total Shipments (AWB) | Total Invoice Documents | Pending Submission | Submitted to Finance |
// Total Invoice Amount (Incl. CN). Kartu 1 & 5 punya tombol show/hide rincian (per courier / per PPJK): tertutup sampai diklik, tutup lagi saat
// tombol diklik lagi / klik di luar / Esc, hanya SATU terbuka; angkanya dari ringkasan RPC yang SAMA dgn angka utama (sql/081) -> ikut filter
// aktif & totalnya = angka utama. Rumus angka utama TIDAK berubah. Klik kartu = filter KPI (2026-10-07): "Total Invoice Amount" = semua invoice,
// "Pending Submission" = belum Submit, "Submitted to Finance" = sudah Submit (unpaid + paid); AWB & Total Invoice Documents tidak bisa diklik.
const idr = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('id-ID')}`
const TH_POP = 'px-1.5 py-2 text-right first:text-left text-[11.5px] font-medium text-[#8A7A8B] border-b border-[#EEE6F5] whitespace-nowrap'
const TD_POP = 'px-1.5 py-2 text-right first:text-left text-[12.5px] text-[#3B1B3D] tabular-nums border-b border-dashed border-[#EEE6F5] whitespace-nowrap'
const TT_POP = 'font-extrabold text-[#3B1B3D] !border-b-0'

export const CourierRecapKpiCards: React.FC<{ summary: RecapSummaryCourier | null; loading: boolean; colOk: (k: string) => boolean; kpi?: RecapKpiFilter; onKpi?: (k: RecapKpiFilter) => void }> = ({ summary, loading, colOk, kpi = null, onKpi }) => {
  const v = (fn: (s: RecapSummaryCourier) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const [pop, setPop] = useState<null | 'courier' | 'ppjk'>(null)
  // Rincian tertutup saat klik di luar (tombol toggle & isi rincian dikecualikan) atau Esc.
  useEffect(() => {
    if (!pop) return
    const down = (e: MouseEvent) => { const t = e.target as Element | null; if (t && t.closest('[data-kpi-pop],[data-kpi-toggle]')) return; setPop(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [pop])

  const amountOk = colOk('total_amount')
  const byCourier = summary?.by_courier
  const byPpjk = summary?.by_ppjk

  const card = (o: {
    icon: React.ReactNode; tint: string; label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string; subClass?: string
    filterKey?: Exclude<RecapKpiFilter, null>; toggle?: { which: 'courier' | 'ppjk'; show: string; hide: string }
  }) => {
    const active = !!o.filterKey && kpi === o.filterKey
    const body = (
      <>
        <div className="text-[12px] font-semibold text-[#4A3A5C] leading-tight">{o.label}</div>
        <div className={`text-[22px] @min-[270px]:text-[24px] leading-tight font-extrabold mt-0.5 tabular-nums whitespace-nowrap ${o.valueClass || 'text-[#3B2260]'}`}>{o.value}</div>
        {o.sub && <div className={`text-[11px] leading-tight mt-0.5 ${o.subClass || 'text-[#8A7A8B]'}`}>{o.sub}</div>}
      </>
    )
    const open = !!o.toggle && pop === o.toggle.which
    return (
      <div className={`${SA_CARD} p-3.5 min-w-0 flex items-start gap-3 @container ${active ? 'ring-2 ring-[#6B3470] border-transparent' : ''}`}>
        <div className="w-9 h-9 @min-[230px]:w-[42px] @min-[230px]:h-[42px] rounded-xl flex items-center justify-center shrink-0 text-[#4A2A6B]" style={{ background: o.tint }} aria-hidden="true">{o.icon}</div>
        <div className="min-w-0 flex-1">
          {o.filterKey && onKpi ? (
            <button type="button" aria-pressed={active} data-kpi={o.filterKey} onClick={() => onKpi(active ? null : o.filterKey!)}
              title={active ? 'Click again to show all data' : 'Click to filter'} className="block w-full text-left hover:opacity-80 transition-opacity">{body}</button>
          ) : <div>{body}</div>}
          {o.toggle && (
            <button type="button" data-kpi-toggle={o.toggle.which} aria-expanded={open} onClick={() => setPop(open ? null : o.toggle!.which)}
              className="mt-1.5 inline-flex items-center min-h-7 px-2.5 rounded-lg bg-[#F3EEFA] hover:bg-[#EAE0F7] text-[#4A2A6B] text-[11px] font-semibold transition-colors">{open ? o.toggle.hide : o.toggle.show}</button>
          )}
        </div>
      </div>
    )
  }

  const courierTotalAwb = summary?.awb ?? 0
  const courierTotalDocs = summary?.invoices_excl_cn ?? 0
  const ppjkSum = (f: (r: NonNullable<typeof byPpjk>[number]) => number) => (byPpjk || []).reduce((s, r) => s + f(r), 0)

  return (
    <div className="relative @container">
      <div className="grid grid-cols-2 @min-[720px]:grid-cols-3 @min-[1180px]:grid-cols-5 gap-3">
        {card({
          icon: <Plane size={20} />, tint: '#DBEAFE', label: 'Total Shipments (AWB)', value: v(s => s.awb), sub: 'Unique shipments',
          toggle: byCourier && byCourier.length > 0 ? { which: 'courier', show: 'Show per courier ▾', hide: 'Hide per courier ▴' } : undefined,
        })}
        {card({ icon: <FileText size={20} />, tint: '#EDE9FE', label: 'Total Invoice Documents', value: v(s => (s.invoices_excl_cn === undefined ? '—' : s.invoices_excl_cn)), sub: 'Freight & duty (excl. credit notes)' })}
        {card({ icon: <Clock size={20} />, tint: '#FEF3C7', label: 'Pending Submission', value: v(s => s.not_submitted), sub: 'Not yet submitted to Finance', valueClass: 'text-[#7A4F00]', filterKey: 'not_submitted' })}
        {card({
          icon: <CheckCircle2 size={20} />, tint: '#D1FAE5', label: 'Submitted to Finance', value: v(s => s.submitted_unpaid + s.paid),
          sub: v(s => `Unpaid: ${s.submitted_unpaid} | Paid: ${s.paid}`), subClass: 'text-[#0D8A5F]', valueClass: 'text-[#2F4FA8]', filterKey: 'submitted',
        })}
        {amountOk
          ? card({
            icon: <Wallet size={20} />, tint: '#F3E8FF', label: 'Total Invoice Amount (Incl. CN)', value: v(s => fmtRp(s.charges - s.credit_notes)),
            sub: v(s => `incl. credit notes (−${fmtRp(s.credit_notes)})`), valueClass: 'text-[#3B2260] !text-[19px] @min-[270px]:!text-[20px]', filterKey: 'all',
            toggle: byPpjk && byPpjk.length > 0 ? { which: 'ppjk', show: 'Show per PPJK ▾', hide: 'Hide per PPJK ▴' } : undefined,
          })
          : card({ icon: <Wallet size={20} />, tint: '#F3E8FF', label: 'Total Invoice Amount (Incl. CN)', value: '—', sub: 'Hidden for your role', filterKey: 'all' })}
      </div>

      {pop === 'courier' && byCourier && (
        <div data-kpi-pop="courier" className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(420px,100%)] bg-white rounded-[14px] border border-[#EADFD6] shadow-[0_12px_32px_rgba(60,30,90,0.25)] px-3.5 py-2">
          <table className="w-full border-collapse">
            <thead><tr><th className={TH_POP}>Kurir</th><th className={TH_POP}>AWB</th><th className={TH_POP}>Invoice Docs</th></tr></thead>
            <tbody>
              {byCourier.map(r => <tr key={r.courier}><td className={TD_POP}>{r.courier}</td><td className={TD_POP}>{idr(r.awb)}</td><td className={TD_POP}>{idr(r.docs)}</td></tr>)}
              <tr><td className={`${TD_POP} ${TT_POP}`}>Total</td><td className={`${TD_POP} ${TT_POP}`}>{idr(courierTotalAwb)}</td><td className={`${TD_POP} ${TT_POP}`}>{idr(courierTotalDocs)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {pop === 'ppjk' && byPpjk && (
        <div data-kpi-pop="ppjk" className="absolute right-0 top-[calc(100%+6px)] z-30 w-[min(640px,100%)] bg-white rounded-[14px] border border-[#EADFD6] shadow-[0_12px_32px_rgba(60,30,90,0.25)] px-3.5 py-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>{['PPJK', 'Courier Adm Fee', 'Total Duty Tax', 'Total Freight', 'Credit Note', 'Total Amount'].map(h => <th key={h} className={TH_POP}>{h}</th>)}</tr></thead>
              <tbody>
                {byPpjk.map(r => (
                  <tr key={r.ppjk}><td className={TD_POP}>{r.ppjk}</td><td className={TD_POP}>{idr(r.adm)}</td><td className={TD_POP}>{idr(r.duty)}</td><td className={TD_POP}>{idr(r.freight)}</td><td className={TD_POP}>{idr(r.credit_note)}</td><td className={TD_POP}>{idr(r.total)}</td></tr>
                ))}
                <tr>
                  <td className={`${TD_POP} ${TT_POP}`}>Total</td>
                  <td className={`${TD_POP} ${TT_POP}`}>{idr(ppjkSum(r => r.adm))}</td><td className={`${TD_POP} ${TT_POP}`}>{idr(ppjkSum(r => r.duty))}</td><td className={`${TD_POP} ${TT_POP}`}>{idr(ppjkSum(r => r.freight))}</td>
                  <td className={`${TD_POP} ${TT_POP}`}>{idr(ppjkSum(r => r.credit_note))}</td><td className={`${TD_POP} ${TT_POP}`}>{idr(ppjkSum(r => r.total))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-[#8A7A8B] py-1.5">Total Amount = Courier Adm Fee + Total Duty Tax + Total Freight (minus Credit Note)</div>
        </div>
      )}
    </div>
  )
}

// ─── Kartu 1 AWB ──────────────────────────────────────────────────────────────
// Susunan (revisi 2026-10-27): [AWB / vendor / pil PT + pil Audit] | [PO · Origin] | [pil invoice + Email Received] | [Submit · Due] | [Status] | [Total Expenses] | [Open ›].
// Lebar kartu >= 1180px: 7 kolom, pembatas VERTIKAL samar; lebih sempit (mis. saat panel samping terbuka): 2 kolom 4 baris, pembatas jadi HORIZONTAL samar.
const SEP = 'border-[rgba(138,123,155,0.18)]'
const DuePill: React.FC<{ g: RecapGroup }> = ({ g }) => {
  const d = recapGroupDue(g, todayLocalIso())
  if (d.allPaid) return null
  const title = d.perInvoice.map(p => `${INVOICE_KIND_LABEL[p.kind]} ${p.no}: ${p.due ? `due ${fmtDateShort(p.due)}` : 'no Invoice PPJK Date yet'}${p.paid ? ' (paid)' : ''}`).join('\n')
  if (!d.due) return <Pill tone="grey" title={`Invoice PPJK Date not available yet — due date = earliest Invoice PPJK Date + ${COURIER_DUE_DAYS} days\n${title}`}>Due —</Pill>
  return <Pill tone={d.overdue ? 'red' : 'grey'} title={title}>{d.overdue ? 'Overdue · ' : 'Due '}{fmtDateShort(d.due)}</Pill>
}
// Pil Submit: Not Submitted / Submitted · [tanggal terakhir Submit] (sebagian: "k/n submitted"; ada yang Paid: "· k/n paid"; semua Paid: "Paid").
function submitPill(g: RecapGroup): { label: string; tone: 'green' | 'amber' | 'grey' } {
  const n = g.rows.length
  if (n > 0 && g.paid === n) return { label: 'Paid', tone: 'green' }
  const last = g.rows.map(r => r.submit_date).filter(Boolean).map(String).sort().pop()
  if (n > 0 && g.submitted === n) return { label: `Submitted · ${fmtDateShort(last)}${g.paid > 0 ? ` · ${g.paid}/${n} paid` : ''}`, tone: 'green' }
  if (g.submitted > 0) return { label: `${g.submitted}/${n} submitted · ${fmtDateShort(last)}`, tone: 'amber' }
  return { label: 'Not Submitted', tone: 'amber' }
}
const INVOICE_PILL_TONE = { 'Freight': 'blue', 'Duty': 'amber', 'Credit Note Freight': 'grey', 'Credit Note Duty': 'grey' } as const

export const CourierRecapGroupCard: React.FC<{
  g: RecapGroup
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  validationTabs: ValidationTabKey[]
  selected?: boolean
  onValidation: (g: RecapGroup, tab?: RecapPanelTab) => void
  onClose?: () => void // tak dipakai lagi (tombol Opened ✓ dihapus 2026-10-30); panel ditutup lewat ✕ di panel
}> = ({ g, companyNames, colOk, validationTabs, selected = false, onValidation }) => {
  const [expanded, setExpanded] = useState(false)
  // Sama dgn baris Grand Total tabel Total di panel; `syncedTotal` kosong (belum/gagal dihitung) -> rumus lama.
  const grand = g.syncedTotal ? g.syncedTotal.grand : g.finalTotal
  const cnTotal = g.syncedTotal ? g.syncedTotal.cn : g.cn
  const audit = g.audit
  const draft = audit ? isCourierDraft(audit.rec) : false
  const pos = colOk('po_pt_imi') ? g.pos : []
  const vendor = colOk('vendor') ? (g.rows.map(r => r.vendor).find(v => v && String(v).trim()) || '') : ''
  const submitted = g.submitted > 0 // ada Submit Date -> kartu kuning (sama baris submitted versi List)
  const sub = submitPill(g)
  const pills = recapInvoicePills(g)
  // Layout ringkas (2026-10-30, permintaan user: jarak Freight/Duty terlalu lebar): lebar label = label TERPANJANG di kartu ini (bukan tetap 108px),
  // supaya kolom tanggal antar pil tetap sejajar tapi rapat. Layout lebar tetap 108px (simetris antar kartu).
  const labelW = Math.ceil(Math.max(0, ...pills.map(p => p.label.length)) * 6.2)

  // Need Attention: Cost Validation ATAU Doc Validation belum 100% (Checklist tidak dihitung; aturan SAMA kunci Submit/Paid Date:
  // tanpa pasangan PIB/CN di Audit = belum tervalidasi). Hanya untuk role yang boleh melihat tab Doc / Cost Validation.
  const valTabs = validationTabs.filter((t): t is Exclude<ValidationTabKey, 'checklist'> => t !== 'checklist')
  const pct = audit ? rowValidationPct(audit.rec) : null
  const needAttention = valTabs.length > 0 && (!audit || valTabs.some(t => pct![t] === null || (pct![t] as number) < 100))
  const attentionTitle = !audit ? 'No PIB / CN with this AWB in Audit yet — cannot be validated'
    : `Cost Validation ${pct!.cost ?? 0}% · Doc Validation ${pct!.doc ?? 0}% (Checklist not counted)`

  const cardCls = submitted
    ? 'bg-[#FFF5C5] border border-[#F0DC8C] border-l-[5px] border-l-[#E0A21A] rounded-[14px] shadow-[0_1px_2px_rgba(59,27,61,0.04)]'
    : SA_CARD
  const sepV = `@min-[1180px]:border-l @min-[1180px]:pl-4 ${SEP}` // pembatas vertikal (layout lebar)
  const sepH = `border-t pt-2.5 @min-[1180px]:border-t-0 @min-[1180px]:pt-0 ${SEP}` // pembatas horizontal (layout ringkas)

  // Seluruh kartu bisa diklik = buka panel Validation di kanan (2026-10-30, permintaan user; tombol "Open ›/Opened ✓" dihapus). Klik di tombol/tautan di dalam kartu
  // (+N PO) & memilih/menyalin teks tidak membuka; kartu yang sudah terbuka tidak menutup saat diklik (tutup lewat ✕ di panel).
  const openCard = () => { if (!selected) onValidation(g, audit && validationTabs.length > 0 ? undefined : 'invoices') }
  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return
    openCard()
  }
  const onCardKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    openCard()
  }
  // Pil Submit + Due: kolom sendiri di layout lebar; di layout ringkas pindah ke samping centang status (kanan atas).
  const submitDue = (
    <div className="flex flex-col items-start gap-1.5">
      <Pill tone={sub.tone}>{sub.label}</Pill>
      <DuePill g={g} />
    </div>
  )

  return (
    <div className={`${cardCls} overflow-hidden @container cursor-pointer ${selected ? 'ring-2 ring-[#6B3470]' : 'hover:shadow-[0_2px_8px_rgba(59,27,61,0.12)]'}`} data-recap-card={g.key} data-submitted={submitted ? '1' : undefined}
      role="button" tabIndex={0} aria-pressed={selected} onClick={onCardClick} onKeyDown={onCardKey}>
      <div className={`grid grid-cols-2 gap-x-3.5 gap-y-2.5 px-3.5 py-3 items-start @min-[1180px]:grid-cols-[minmax(150px,1.3fr)_minmax(100px,1fr)_346px_minmax(110px,0.9fr)_130px_minmax(140px,0.8fr)] @min-[1180px]:gap-x-4 @min-[1180px]:px-4 @min-[1180px]:py-3.5 @min-[1180px]:items-center`}>
        {/* a1. AWB, Vendor, pil PT + pil Audit (hanya satu pil Audit) */}
        <div className="min-w-0 col-start-1 row-start-1 @min-[1180px]:[grid-area:auto]">
          <div className="text-[14px] @min-[1180px]:text-[15px] font-extrabold text-[#3B2260] tabular-nums leading-tight [overflow-wrap:anywhere]" title={g.awbRaw}>{recapAwbHeading(g)}</div>
          {vendor && <div className="text-[11px] text-[#8A7A8B] mt-0.5 mb-1.5 line-clamp-2" title={vendor}>{vendor}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            {colOk('an') && g.an && <Pill tone="grey" title={companyFullName(companyNames, g.an)}>{g.an}</Pill>}
            {audit ? (
              <>
                <Pill tone={audit.docType === 'PIB' ? 'purple' : 'grey'} title={`${audit.docType} ${courierDocNo(audit.rec, audit.docType) || ''}`.trim()}>{audit.docType}{draft ? ' - Draft' : ''}</Pill>
                {audit.rec.reaudit_reason && <Pill tone="purple" title={audit.rec.reaudit_reason}>↻ Re-audit</Pill>}
              </>
            ) : g.key.startsWith('ID:') ? (
              <Pill tone="grey">No AWB</Pill>
            ) : (
              <Pill tone="red" title="No PIB / CN with this AWB was found in Audit Courier">Not Found in Audit</Pill>
            )}
          </div>
        </div>

        {/* a2. PO & Origin */}
        <div className={`min-w-0 col-start-1 row-start-2 ${sepV} ${sepH} @min-[1180px]:[grid-area:auto]`}>
          {colOk('po_pt_imi') && (
            <div className="text-[12.5px] font-medium text-[#4A3A5C] min-w-0">
              {pos.length === 0 ? <span className="text-[#6E5E70]">No PO</span> : (
                <div className="flex items-start gap-1.5 min-w-0">
                  <div className="min-w-0">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p}>{p}</div>)}</div>
                  {pos.length > 1 && (
                    <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                      {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {colOk('origin') && <div className="text-[11px] text-[#8A7A8B] mt-1.5 truncate">Origin <span className="font-medium text-[#4A3A5C]">{g.origin || '—'}</span></div>}
        </div>

        {/* a3. Pil invoice (satu per jenis dokumen) + "🧾 Invoice PPJK Date · 🏛️ FP Report Date" di dalam pil (beberapa dokumen: dipisah " | "); tidak boleh terpotong ke baris baru */}
        <div className={`min-w-0 col-start-1 col-span-2 row-start-3 ${sepV} ${sepH} @min-[1180px]:[grid-area:auto]`}>
          <div className="flex flex-col items-start gap-1.5" data-invoice-pills style={{ '--lw': `${labelW}px` } as React.CSSProperties}>
            {/* Simetris antar kartu: label lebar tetap + dua blok tanggal lebar tetap, pil melebar penuh kolom (kolom grid berlebar tetap).
                Beberapa dokumen sejenis (mis. 2 Credit Note Duty) = satu pil per pasangan, label diulang, bukan satu pil panjang. */}
            {pills.flatMap(p => (p.pairs.length ? p.pairs : [null]).map((x, i) => (
              <Pill key={`${p.label}-${i}`} tone={INVOICE_PILL_TONE[p.label]} className="@min-[1180px]:w-full"
                title={x ? `Invoice PPJK Date: ${x.invoice ? fmtDateShort(x.invoice) : '—'} · FP Report Date: ${x.fp ? fmtDateShort(x.fp) : '—'}` : 'Invoice PPJK Date and FP Report Date not available yet'}>
                <span className="w-[var(--lw)] @min-[1180px]:w-[108px] shrink-0 text-left">{p.label}</span>
                {x && (
                  <>
                    <span className="inline-flex items-center gap-1 w-[80px] @min-[1180px]:w-[90px] shrink-0 tabular-nums"><Receipt size={11} className="shrink-0" aria-label="Invoice PPJK Date" /> {x.invoice ? fmtDateShort(x.invoice) : '—'}</span>
                    <span className="opacity-60" aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 w-[80px] @min-[1180px]:w-[90px] shrink-0 tabular-nums"><Landmark size={11} className="shrink-0" aria-label="FP Report Date" /> {x.fp ? fmtDateShort(x.fp) : '—'}</span>
                  </>
                )}
              </Pill>
            )))}
          </div>
        </div>

        {/* a4. Submit & Due */}
        <div className={`min-w-0 hidden @min-[1180px]:block ${sepV}`}>
          {submitDue}
        </div>

        {/* a5. Status: ! Need Attention / centang hijau. Layout ringkas: kanan atas, pil Submit + Due ditaruh di SAMPING-nya (2026-10-30, permintaan user). */}
        <div className={`min-w-0 col-start-2 row-start-1 flex items-start justify-between gap-2.5 @min-[1180px]:justify-start @min-[1180px]:[grid-area:auto]`}>
          <div className="min-w-0 @min-[1180px]:hidden" data-submit-due-compact>{submitDue}</div>
          {valTabs.length > 0 && (needAttention ? (
            <span title={attentionTitle} data-need-attention className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#FDE2E4] text-[#C0262D] text-[11px] font-bold whitespace-nowrap">
              <span className="inline-flex w-3.5 h-3.5 items-center justify-center rounded-full bg-[#E03040] text-white text-[10px] leading-none" aria-hidden="true">!</span> Need Attention
            </span>
          ) : (
            <span title={attentionTitle} data-validation-ok className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-[#D5F5E6] text-[#0D8A5F]"><Check size={17} strokeWidth={3} aria-hidden="true" /></span>
          ))}
        </div>

        {/* a6. Total Expenses */}
        <div className={`min-w-0 col-start-2 row-start-2 ${sepH} @min-[1180px]:[grid-area:auto]`}>
          {colOk('total_amount') ? (
            <>
              <div className="text-[11px] text-[#8A7A8B]">Total Expenses</div>
              <div className="text-[17px] @min-[1180px]:text-[18px] font-extrabold text-[#3B2260] tabular-nums leading-tight whitespace-nowrap" data-card-grand-total>{fmtRp(grand)}</div>
              {cnTotal > 0 && <div className="text-[11px] text-[#6E5E70] tabular-nums whitespace-nowrap">{fmtRp(grand + cnTotal)} − {fmtRp(cnTotal)} CN</div>}
            </>
          ) : <div className="text-[11px] text-[#8A7A8B]">Amounts hidden for your role</div>}
        </div>

      </div>
    </div>
  )
}

// ─── Daftar kartu + pagination per AWB ────────────────────────────────────────
// Default 10 kartu/halaman + pilihan Rows per page (2026-10-02, permintaan user; dulu tetap 12).
export const COURIER_RECAP_PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const CourierRecapCardView: React.FC<{
  filters: RecapFilters
  nonce: number
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  validationTabs: ValidationTabKey[]
  enrichAudit: (recs: any[]) => Promise<void>
  onValidation: (g: RecapGroup, tab?: RecapPanelTab) => void
  // (Tombol "Opened ✓" dihapus 2026-10-30: kartu diklik = buka panel; tutup lewat ✕ di panel, konfirmasi perubahan belum tersimpan tetap berlaku.)
  onClosePanel?: () => void
  onLoaded?: (groups: RecapGroup[]) => void
  // Panel Validation samping (2026-10-05) -- null = daftar lebar penuh.
  selectedKey?: string | null
  panel?: React.ReactNode
  // "Needs attention" (2026-10-02): hanya AWB yang perlu perhatian (recapGroupNeedsAttention), dihitung di browser.
  attentionOnly?: boolean
  // Filter KPI (2026-10-07): AWB dgn minimal 1 invoice berstatus itu (isi kartu tetap lengkap), dihitung di browser.
  kpiFilter?: RecapKpiFilter
}> = ({ filters, nonce, companyNames, colOk, validationTabs, enrichAudit, onValidation, onClosePanel, onLoaded, attentionOnly = false, kpiFilter = null, selectedKey = null, panel = null }) => {
  const [pageSize, setPageSize] = useState(COURIER_RECAP_PAGE_SIZE)
  const kpiStatus = kpiFilter === 'not_submitted' || kpiFilter === 'submitted' || kpiFilter === 'submitted_unpaid' ? kpiFilter : null
  const filterKey = JSON.stringify(filters) + (attentionOnly ? ':attention' : '') + (kpiStatus ? `:kpi-${kpiStatus}` : '') + ':' + pageSize
  const [page, setPage] = useState(1)
  const [groups, setGroups] = useState<RecapGroup[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const prevFilterKey = useRef(filterKey)

  useEffect(() => {
    // Filter berubah -> kembali ke halaman 1 (fetch jalan dari effect page).
    if (prevFilterKey.current !== filterKey) { prevFilterKey.current = filterKey; if (page !== 1) { setPage(1); return } }
    const my = ++seq.current
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        let res: { total: number; groups: RecapGroup[]; fallback: boolean }
        if (attentionOnly) {
          const all = await fetchCourierRecapAttentionGroups(filters, validationTabs, enrichAudit)
          res = { total: all.length, groups: all.slice((page - 1) * pageSize, page * pageSize), fallback: false }
        } else if (kpiStatus) {
          const all = await fetchCourierRecapKpiGroups(filters, kpiStatus)
          res = { total: all.length, groups: all.slice((page - 1) * pageSize, page * pageSize), fallback: false }
          await fetchRecapAuditLinks(res.groups)
          // Grand Total kartu = baris Grand Total tabel Total panel (2026-10-12); paralel dgn enrich (hanya butuh g.audit).
          await Promise.all([enrichAudit(res.groups.map(g => g.audit?.rec).filter(Boolean)), attachCourierGrandTotals(res.groups)])
        } else {
          res = await fetchCourierRecapPage(filters, (page - 1) * pageSize, pageSize)
          await fetchRecapAuditLinks(res.groups)
          await Promise.all([enrichAudit(res.groups.map(g => g.audit?.rec).filter(Boolean)), attachCourierGrandTotals(res.groups)])
        }
        if (attentionOnly) await attachCourierGrandTotals(res.groups)
        if (my !== seq.current) return
        setGroups(res.groups)
        setTotal(res.total)
        onLoaded?.(res.groups)
      } catch (e: any) {
        console.error('[CourierRecap] gagal memuat kartu', e)
        if (my === seq.current) setError(e?.message || 'Failed to load')
      } finally {
        if (my === seq.current) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, nonce])

  // Memuat ulang (ganti halaman / jumlah baris / filter) selagi daftar lama masih tampil -> badge "Updating…" kuning melayang.
  const updating = loading && groups !== null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const list = (
    <div className={panel ? 'flex flex-col min-h-0 lg:w-[35%] lg:min-w-[380px] lg:max-w-[720px] lg:shrink-0 max-lg:min-h-[420px]' : 'flex-1 min-h-0 flex flex-col'}>
      {/* Pembungkus `relative` TIDAK ikut scroll: badge "Updating data…" melayang tetap di atas daftar walau daftar digulir (2026-10-09, permintaan user). */}
      <div className="flex-1 min-h-0 relative flex flex-col">
      {updating && <UpdatingBadge />}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {groups === null && loading ? <LoadingState /> : error ? (
          <div className="text-center py-16 text-[#A8231A] text-[13px]">Failed to load Invoice Recap: {error}</div>
        ) : (groups || []).length === 0 ? (
          <div className="text-center py-20 text-[#6E5E70] text-[13px]">{attentionOnly ? 'No AWB needs attention — every open invoice has 100% validation.' : kpiStatus === 'not_submitted' ? 'No AWB with invoices not yet submitted to Finance.' : kpiStatus === 'submitted' ? 'No AWB with invoices submitted to Finance.' : kpiStatus === 'submitted_unpaid' ? 'No AWB with submitted, unpaid invoices.' : 'No AWB matches the current filters.'}</div>
        ) : (
          <>
            {/* Baris "N AWB · newest email received first" DIHAPUS 2026-10-02 (permintaan user) -- jumlah ada di footer. */}
            <div className="flex flex-col gap-2.5" aria-busy={updating}>
              {(groups || []).map(g => (
                <CourierRecapGroupCard key={g.key} g={g} companyNames={companyNames} colOk={colOk} validationTabs={validationTabs} selected={selectedKey === g.key} onValidation={onValidation} onClose={onClosePanel} />
              ))}
            </div>
          </>
        )}
      </div>
      </div>
      {total > 0 && (
        <PaginationFooter start={start} end={end} total={total} unit="AWB" page={page} totalPages={pages} onPage={setPage}
          pageSize={pageSize} onPageSize={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
      )}
    </div>
  )
  if (!panel) return list
  // 2 kolom: daftar kiri, panel kanan (layar sempit: ditumpuk, panel di bawah daftar).
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row max-lg:overflow-y-auto">
      {list}
      <div className="lg:flex-1 min-w-0 min-h-0 flex flex-col p-2.5 lg:pl-0 max-lg:min-h-[640px]">{panel}</div>
    </div>
  )
}
