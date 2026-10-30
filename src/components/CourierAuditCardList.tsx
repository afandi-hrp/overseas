// Tampilan KARTU Audit Courier (2026-10-01) -- mengikuti Audit PIB Sea & Air (token SeaAirAuditUi).
// Murni tampilan: baris = `records` SharedDataTable (query lama, sudah ter-enrich auto-calc,
// kelengkapan & persen validasi), ringkasan = fetchCourierAuditSummary. Kolom yang tidak diizinkan
// role (getAllowedColumns 'courier_audit') TIDAK ditampilkan (`colOk`). Tabel lama tetap di mode List.
import React from 'react'
import { SA_CARD, Chip, Pill } from './SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  courierDocNo, courierRowKey, courierTotalDutyTax, courierTotalExpenses, isCourierDraft, courierDutyPartsTotal,
  type CourierAuditSummary, type CourierDocType, type CourierAuditTab, type CourierAuditTabKpi, type CourierDutyParts,
} from '../utils/CourierAuditHelpers'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'

// ─── Kartu KPI ────────────────────────────────────────────────────────────────
// Revisi 2026-10-15 (permintaan user, mockup "Courier Audit Revisi.html"): 4 kartu sama lebar -- Records | Customs value |
// Duties & taxes (+ "Rincian ▾" popover BM/PPN/PPh/Adm fee-SPTNP × PIB/CN/Total) | Outstanding Final Check (dulu "Not submitted
// to NAS"). Kartu "Validation incomplete" DIHAPUS. Angka ditulis lengkap (fmtRp) & mengikuti tab aktif + filter tanggal/company
// (`summary.byTab[tab]`). Duties & taxes = BM + PPN + PPh + Adm fee (CN) / SPTNP (PIB) -- rumus SAMA "Total Duty Tax" kartu.
const DUTY_ROWS: { key: keyof CourierDutyParts; label: string }[] = [
  { key: 'bm', label: 'BM' }, { key: 'ppn', label: 'PPN' }, { key: 'pph', label: 'PPh' }, { key: 'adm', label: 'Adm fee / SPTNP' },
]
const fmtNum = (v: number) => Math.round(v).toLocaleString('id-ID')

const DutyBreakdownPopover: React.FC<{ k: CourierAuditTabKpi; onClose: () => void }> = ({ k, onClose }) => {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || t.closest?.('[data-duty-breakdown-btn]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  const totP = courierDutyPartsTotal(k.duty.PIB), totC = courierDutyPartsTotal(k.duty.CN)
  const TH = 'px-2 py-1 text-[10.5px] font-semibold text-[#8A7A8B] text-right border-b border-[#EADFD6]'
  const TD = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap border-b border-dashed border-[#EADFD6]'
  return (
    <div ref={ref} role="dialog" aria-label="Duties & taxes breakdown" data-duty-breakdown
      className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(420px,calc(100vw-48px))] bg-white border border-[#EADFD6] rounded-xl shadow-[0_12px_30px_rgba(60,20,40,0.18)] px-3 py-2.5">
      <table className="w-full border-collapse text-[12px] text-[#3B1B3D]">
        <thead><tr><th className={`${TH} text-left`}>Komponen</th><th className={TH}>PIB</th><th className={TH}>CN</th><th className={TH}>Total</th></tr></thead>
        <tbody>
          {DUTY_ROWS.map(r => (
            <tr key={r.key}>
              <td className={`${TD} !text-left`}>{r.label}</td>
              <td className={TD}>{fmtNum(k.duty.PIB[r.key])}</td>
              <td className={TD}>{fmtNum(k.duty.CN[r.key])}</td>
              <td className={TD}>{fmtNum(k.duty.PIB[r.key] + k.duty.CN[r.key])}</td>
            </tr>
          ))}
          <tr className="font-extrabold">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(totP)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(totC)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(totP + totC)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export const CourierAuditKpiCards: React.FC<{
  summary: CourierAuditSummary | null
  loading: boolean
  tab: CourierAuditTab
  colOk: (key: string) => boolean
}> = ({ summary, loading, tab, colOk }) => {
  const [dutyOpen, setDutyOpen] = React.useState(false)
  const closeDuty = React.useCallback(() => setDutyOpen(false), [])
  const k = summary ? summary.byTab[tab] : null
  const v = (fn: (k: CourierAuditTabKpi) => React.ReactNode) => (k ? fn(k) : loading ? '…' : '—')
  // Revisi 2026-10-23 (permintaan user): kartu Customs value, Duties & taxes & Total Importase / Total PO = TOTAL seluruh tab Draft + PIB + CN
  // (TIDAK berubah saat pindah tab; hanya mengikuti filter search / PPJK date / company, sama dgn `summary`). Records tetap per tab.
  const all: CourierAuditTabKpi | null = summary ? (() => {
    const a: CourierAuditTabKpi = { records: 0, recDraft: 0, recPib: 0, recCn: 0, cv: { PIB: 0, CN: 0 },
      duty: { PIB: { bm: 0, ppn: 0, pph: 0, adm: 0 }, CN: { bm: 0, ppn: 0, pph: 0, adm: 0 } }, nas: 0, nasDraft: 0, nasPib: 0, nasCn: 0 }
    ;(['archive', 'pib', 'cn'] as CourierAuditTab[]).forEach(t => {
      const x = summary.byTab[t]
      a.records += x.records; a.recDraft += x.recDraft; a.recPib += x.recPib; a.recCn += x.recCn
      a.cv.PIB += x.cv.PIB; a.cv.CN += x.cv.CN
      ;(['PIB', 'CN'] as const).forEach(j => (['bm', 'ppn', 'pph', 'adm'] as const).forEach(c => { a.duty[j][c] += x.duty[j][c] }))
    })
    return a
  })() : null
  const va = (fn: (k: CourierAuditTabKpi) => React.ReactNode) => (all ? fn(all) : loading ? '…' : '—')
  const card = (label: React.ReactNode, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]', extra?: React.ReactNode) => (
    <div className={`${SA_CARD} relative px-4 py-3 min-w-0`}>
      <div className="text-[11.5px] font-semibold text-[#6E5E70] flex items-center gap-2">{label}</div>
      <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
      {extra}
    </div>
  )
  const hidden = 'Hidden for your role'
  const split = (pib: number, cn: number) => <>PIB <b className="text-[#6E5E70]">{fmtRp(pib)}</b> | CN <b className="text-[#6E5E70]">{fmtRp(cn)}</b></>
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-courier-kpi>
      {card('Records', v(k => k.records), v(k => `${k.recDraft} draft · ${k.recPib} PIB · ${k.recCn} CN`))}
      {colOk('total_nilai_pabean')
        ? card('Customs value', va(k => fmtRp(k.cv.PIB + k.cv.CN)), va(k => split(k.cv.PIB, k.cv.CN)))
        : card('Customs value', '—', hidden)}
      {colOk('total_pib_cn')
        ? card(
          <>Duties &amp; taxes
            {all && <button type="button" data-duty-breakdown-btn aria-expanded={dutyOpen} onClick={() => setDutyOpen(o => !o)}
              className="text-[11px] font-semibold text-[#6B3470] hover:underline">{dutyOpen ? 'Tutup ▴' : 'Rincian ▾'}</button>}
          </>,
          va(k => fmtRp(courierDutyPartsTotal(k.duty.PIB) + courierDutyPartsTotal(k.duty.CN))),
          va(k => split(courierDutyPartsTotal(k.duty.PIB), courierDutyPartsTotal(k.duty.CN))),
          'text-[#3B1B3D]',
          dutyOpen && all ? <DutyBreakdownPopover k={all} onClose={closeDuty} /> : null)
        : card('Duties & taxes', '—', hidden)}
      {/* Total AWB / Total PO distinct (seluruh Draft + PIB + CN); baris kecil = rincian jumlah AWB per status */}
      {card('Total Importase / Total PO', va(k => `${k.records} / ${colOk('po_ori') && summary ? summary.poCount : '—'}`), va(k => `${k.recDraft} draft · ${k.recPib} PIB · ${k.recCn} CN`), 'text-[#7A4F00]')}
    </div>
  )
}

// ─── Baris kartu PIB / CN ─────────────────────────────────────────────────────
// Revisi 2026-10-30 (permintaan user): tampilan kartu mengikuti kartu Invoice Recap Courier (CourierRecapCardList) -- AWB tebal ungu + vendor + pil PT/jalur/term,
// pembatas vertikal samar, angka besar ungu, pil status; TANPA tombol Open (seluruh kartu bisa diklik). Isi data & sumber angka TIDAK berubah (revisi 2026-10-13):
// [AWB / vendor / pil PT · jalur · term] | [No. PIB (PIB) + tgl PPJK] | Total Expenses | Total Duty Tax | Final Check | [pil status].
// Lebar kartu >= 1000px: 6 kolom; lebih sempit (panel preview terbuka): 2 kolom 3 baris, pembatas jadi horizontal.
const SEP = 'border-[rgba(138,123,155,0.18)]'
const KpiBlock: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <div className="text-[11px] text-[#8A7A8B]">{label}</div>
    <div className="text-[16px] @min-[1000px]:text-[17px] font-extrabold text-[#3B2260] tabular-nums leading-tight whitespace-nowrap mt-0.5">{children}</div>
  </div>
)
const Hidden = () => <span className="text-[#8A7A8B] font-normal">—</span>

const CourierAuditRowCard: React.FC<{
  rec: any
  docType: CourierDocType
  companyNames: Record<string, string>
  colOk: (key: string) => boolean
  selected: boolean
  onOpen?: (rec: any) => void
}> = ({ rec, docType, companyNames, colOk, selected, onOpen }) => {
  const draft = isCourierDraft(rec)
  const nasDone = colOk('tgl_submit_nas') && hasVal(rec.tgl_submit_nas)
  const borderColor = draft ? 'border-l-[#E0A526]' : nasDone ? 'border-l-[#17663D]' : 'border-l-[#6B3470]'
  const term = colOk('delivery_term') ? String(rec.delivery_term || '').trim() : ''
  // No. PIB hanya utk jalur PIB; jalur CN barisnya DIKOSONGKAN (tanpa teks "No SPPBMCP no.").
  const pibNo = docType === 'PIB' && colOk('no_pib') ? courierDocNo(rec, 'PIB') : ''
  // Total Expenses butuh KEDUA kolom (menjumlah kolom yang disembunyikan = membocorkan nilainya).
  const showExpenses = colOk('total_inv_freight') && colOk('total_inv_duty')
  const showDutyTax = colOk('total_pib_cn')
  // Final Check = NAS Submit Date (tgl_submit_nas, kolom tab Draft/PIB/CN versi List; revisi user 2026-10-13).
  const showFinalCheck = colOk('tgl_submit_nas')
  const acceptedShown = colOk('doc_acceptance') && hasVal(rec.doc_acceptance)
  const heading = colOk('awb') ? (rec.awb || '—') : (pibNo || docType)
  const vendor = colOk('vendor') ? String(rec.vendor || '').trim() : ''
  const pibLine = docType === 'PIB' && colOk('no_pib')

  // Seluruh kartu bisa diklik = buka panel preview. Klik di tombol/tautan di dalam kartu & memilih/menyalin teks (mis. nomor AWB) tidak membuka.
  const onCardClick = (e: React.MouseEvent) => {
    if (!onOpen) return
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return
    onOpen(rec)
  }
  const onCardKey = (e: React.KeyboardEvent) => {
    if (!onOpen || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onOpen(rec)
  }
  const sepV = `@min-[1000px]:border-l @min-[1000px]:pl-4 ${SEP}` // pembatas vertikal (layout lebar)
  const sepH = `border-t pt-2.5 @min-[1000px]:border-t-0 @min-[1000px]:pt-0 ${SEP}` // pembatas horizontal (layout ringkas)
  const reset = `@min-[1000px]:[grid-area:auto]`

  return (
    <div
      className={`${SA_CARD} border-l-4 ${borderColor} overflow-hidden @container ${onOpen ? 'cursor-pointer' : ''} ${nasDone ? 'bg-[#F7FBF8]' : ''} ${selected ? 'ring-2 ring-[#6B3470] border-[#6B3470]' : onOpen ? 'hover:shadow-[0_2px_8px_rgba(59,27,61,0.12)]' : ''}`}
      data-courier-card={`${docType}-${rec.id}`}
      role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} aria-pressed={onOpen ? selected : undefined}
      onClick={onCardClick} onKeyDown={onCardKey}
    >
      <div className={`grid grid-cols-2 gap-x-3.5 gap-y-2.5 px-3.5 py-3 items-start @min-[1000px]:grid-cols-[minmax(190px,1.5fr)_minmax(140px,1fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(100px,0.6fr)_minmax(120px,0.8fr)] @min-[1000px]:gap-x-4 @min-[1000px]:px-4 @min-[1000px]:py-3.5 @min-[1000px]:items-center`}>
        {/* a1. AWB, vendor, pil PT + jalur + delivery term */}
        <div className={`min-w-0 col-start-1 row-start-1 ${reset}`}>
          <div className="text-[14px] @min-[1000px]:text-[15px] font-extrabold text-[#3B2260] tabular-nums leading-tight [overflow-wrap:anywhere]" title={rec.awb || ''}>{heading}</div>
          {vendor && <div className="text-[11px] text-[#8A7A8B] mt-0.5 mb-1.5 line-clamp-2" title={vendor}>{vendor}</div>}
          <div className={`flex flex-wrap items-center gap-1.5 ${vendor ? '' : 'mt-1.5'}`}>
            {colOk('impor_an') && rec.impor_an && <Pill tone="grey" title={companyFullName(companyNames, rec.impor_an)}>{rec.impor_an}</Pill>}
            <Pill tone={docType === 'PIB' ? 'purple' : 'grey'} title={docType === 'CN' ? 'Jalur CN' : 'Jalur PIB'}>{docType}</Pill>
            {term && <Pill tone="plum" title="Delivery term">{term}</Pill>}
          </div>
        </div>

        {/* a2. No. PIB (khusus PIB) + tgl PPJK */}
        <div className={`min-w-0 col-start-1 row-start-2 ${sepV} ${sepH} ${reset}`}>
          {pibLine && (
            <div className="text-[12.5px] font-medium text-[#4A3A5C] truncate tabular-nums" title={pibNo}>
              {pibNo || <span className="text-[#8A7A8B]">No PIB no.</span>}
            </div>
          )}
          {colOk('tgl_ppjk') && <div className={`text-[11px] text-[#8A7A8B] truncate ${pibLine ? 'mt-1.5' : ''}`}>PPJK <span className="font-medium text-[#4A3A5C]">{fmtDateShort(rec.tgl_ppjk)}</span></div>}
        </div>

        {/* a3. Total Expenses */}
        <KpiBlock label="Total Expenses" className={`col-start-2 row-start-2 ${sepV} ${sepH} ${reset}`}>
          {showExpenses ? fmtRp(courierTotalExpenses(rec)) : <Hidden />}
        </KpiBlock>

        {/* a4. Total Duty Tax */}
        <KpiBlock label="Total Duty Tax" className={`col-start-1 row-start-3 ${sepV} ${sepH} ${reset}`}>
          {showDutyTax ? fmtRp(courierTotalDutyTax(rec, docType)) : <Hidden />}
        </KpiBlock>

        {/* a5. Final Check (NAS Submit Date) */}
        <KpiBlock label="Final Check" className={`col-start-2 row-start-3 ${sepV} ${sepH} ${reset}`}>
          {showFinalCheck ? (hasVal(rec.tgl_submit_nas) ? fmtDateShort(rec.tgl_submit_nas) : '—') : <Hidden />}
        </KpiBlock>

        {/* a6. Status (kanan atas di layout ringkas): Draft / Audited, Accepted <tgl> (Doc Acceptance), re-audit otomatis (sql/037). Tanpa tombol Open. */}
        <div className={`min-w-0 col-start-2 row-start-1 flex flex-col items-end gap-1.5 @min-[1000px]:items-start ${sepV} ${reset}`} data-courier-card-status>
          {draft ? <Pill tone="amber">Draft</Pill> : <Pill tone="green">Audited</Pill>}
          {acceptedShown && <Pill tone="grey" title="Doc Acceptance">Accepted {fmtDateShort(rec.doc_acceptance)}</Pill>}
          {rec.reaudit_reason && <Chip tone="purple" title={rec.reaudit_reason} className="!whitespace-normal">↻ Changed in Invoice Recap — please re-audit</Chip>}
        </div>
      </div>
    </div>
  )
}

export const CourierAuditCardList: React.FC<{
  rows: any[]
  docTypeOf: (rec: any) => CourierDocType
  companyNames: Record<string, string>
  colOk: (key: string) => boolean
  // Kartu yang sedang tampil di panel preview (kunci `${jenis}-${id}`) & klik kartu / tombol Open.
  selectedKey?: string | null
  onOpen: (rec: any) => void
  // Reorder Mode mode Card (2026-10-02): bungkus tiap kartu (grip drag + nomor posisi). Tanpa prop = tampilan biasa.
  // Saat Reorder Mode, kartu TIDAK bisa dibuka (tanpa tombol Open) -- hanya diseret.
  wrapCard?: (rec: any, index: number, card: React.ReactNode) => React.ReactNode
}> = ({ rows, docTypeOf, companyNames, colOk, selectedKey = null, onOpen, wrapCard }) => {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((rec, index) => {
        const t = docTypeOf(rec)
        const key = courierRowKey(rec, t)
        const card = (
          <CourierAuditRowCard rec={rec} docType={t} companyNames={companyNames} colOk={colOk}
            selected={selectedKey === key} onOpen={wrapCard ? undefined : onOpen} />
        )
        return <React.Fragment key={key}>{wrapCard ? wrapCard(rec, index, card) : card}</React.Fragment>
      })}
    </div>
  )
}
