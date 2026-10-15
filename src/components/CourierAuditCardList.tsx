// Tampilan KARTU Audit Courier (2026-10-01) -- mengikuti Audit PIB Sea & Air (token SeaAirAuditUi).
// Murni tampilan: baris = `records` SharedDataTable (query lama, sudah ter-enrich auto-calc,
// kelengkapan & persen validasi), ringkasan = fetchCourierAuditSummary. Kolom yang tidak diizinkan
// role (getAllowedColumns 'courier_audit') TIDAK ditampilkan (`colOk`). Tabel lama tetap di mode List.
import React from 'react'
import { SA_CARD, SA_LABEL, Chip, Pill, PtBadge } from './SeaAirAuditUi'
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
        ? card('Customs value', v(k => fmtRp(k.cv.PIB + k.cv.CN)), v(k => split(k.cv.PIB, k.cv.CN)))
        : card('Customs value', '—', hidden)}
      {colOk('total_pib_cn')
        ? card(
          <>Duties &amp; taxes
            {k && <button type="button" data-duty-breakdown-btn aria-expanded={dutyOpen} onClick={() => setDutyOpen(o => !o)}
              className="text-[11px] font-semibold text-[#6B3470] hover:underline">{dutyOpen ? 'Tutup ▴' : 'Rincian ▾'}</button>}
          </>,
          v(k => fmtRp(courierDutyPartsTotal(k.duty.PIB) + courierDutyPartsTotal(k.duty.CN))),
          v(k => split(courierDutyPartsTotal(k.duty.PIB), courierDutyPartsTotal(k.duty.CN))),
          'text-[#3B1B3D]',
          dutyOpen && k ? <DutyBreakdownPopover k={k} onClose={closeDuty} /> : null)
        : card('Duties & taxes', '—', hidden)}
      {colOk('tgl_submit_nas')
        ? card('Outstanding Final Check', v(k => k.nas), v(k => `${k.nasDraft} draft · ${k.nasPib} PIB · ${k.nasCn} CN`), 'text-[#7A4F00]')
        : card('Outstanding Final Check', '—', hidden)}
    </div>
  )
}

// ─── Baris kartu PIB / CN ─────────────────────────────────────────────────────
// Revisi 2026-10-13 (permintaan user, referensi audit_preview_v2.html): kiri = jalur + tgl PPJK, No. PIB (HANYA PIB), chip PT +
// delivery term + AWB; tengah = vendor; kanan = Total Expenses / Total Duty Tax / Final Check; paling kanan = status + tombol Open
// (titik-titik validasi & daftar PO dihapus dari kartu; PO tetap bisa dicari lewat Search). Tata letak pakai container query:
// kartu lebar = 1 baris 4 blok, kartu sempit (daftar menyempit saat panel preview terbuka) = ditumpuk.
const KpiBlock: React.FC<{ label: string; children: React.ReactNode; small?: boolean }> = ({ label, children, small }) => (
  <div className="min-w-0">
    <div className={SA_LABEL}>{label}</div>
    <div className={`${small ? 'text-[13px] font-semibold' : 'text-[15px] font-bold'} text-[#3B1B3D] tabular-nums leading-tight mt-0.5 whitespace-nowrap`}>{children}</div>
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

  return (
    <div
      className={`${SA_CARD} border-l-4 ${borderColor} overflow-hidden @container ${onOpen ? 'cursor-pointer' : ''} ${nasDone ? 'bg-[#F7FBF8]' : ''} ${selected ? 'ring-2 ring-[#6B3470] border-[#6B3470]' : onOpen ? 'hover:border-[#D9C7DA]' : ''}`}
      data-courier-card={`${docType}-${rec.id}`}
      onClick={onOpen ? () => onOpen(rec) : undefined}
    >
      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,285px)_minmax(0,1fr)_auto_auto] gap-x-5 gap-y-2.5 px-4 py-3.5 items-center">
        {/* 1. Jalur + tgl PPJK, No. PIB (khusus PIB), PT · delivery term · AWB */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-[#8A7A8B] font-medium">
            <Chip tone={docType === 'CN' ? 'purple' : 'blue'}>{docType}</Chip>
            {colOk('tgl_ppjk') && <span>{fmtDateShort(rec.tgl_ppjk)}</span>}
          </div>
          {docType === 'PIB' && colOk('no_pib') && (
            <div className="text-[13.5px] font-bold text-[#3B1B3D] truncate tabular-nums mt-0.5" title={pibNo}>
              {pibNo || <span className="text-[#8A7A8B] font-semibold">No PIB no.</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1 min-w-0">
            {colOk('impor_an') && rec.impor_an && <PtBadge code={rec.impor_an} title={companyFullName(companyNames, rec.impor_an)} />}
            {term && <Chip tone="plum">{term}</Chip>}
            {colOk('awb') && <span className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]" title={rec.awb || ''}>{rec.awb || '—'}</span>}
          </div>
        </div>

        {/* 2. Vendor (+ chip Accepted / NAS submitted bila ada) */}
        <div className="min-w-0">
          {colOk('vendor') && <div className="text-[13px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]" title={rec.vendor || ''}>{rec.vendor || '—'}</div>}
          {(nasDone || (colOk('doc_acceptance') && hasVal(rec.doc_acceptance))) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {colOk('doc_acceptance') && hasVal(rec.doc_acceptance) && <Chip tone="grey" title="Doc Acceptance">Accepted {fmtDateShort(rec.doc_acceptance)}</Chip>}
              {nasDone && <Chip tone="green" title="NAS Submit Date">NAS submitted {fmtDateShort(rec.tgl_submit_nas)}</Chip>}
            </div>
          )}
        </div>

        {/* 3. Total Expenses · Total Duty Tax · Final Check */}
        <div className="flex flex-wrap @4xl:flex-nowrap gap-x-[18px] gap-y-1.5 @4xl:text-right min-w-0">
          <KpiBlock label="Total Expenses">
            {showExpenses ? fmtRp(courierTotalExpenses(rec)) : <Hidden />}
          </KpiBlock>
          <KpiBlock label="Total Duty Tax">
            {showDutyTax ? fmtRp(courierTotalDutyTax(rec, docType)) : <Hidden />}
          </KpiBlock>
          <KpiBlock label="Final Check" small>
            {showFinalCheck ? (hasVal(rec.tgl_submit_nas) ? fmtDateShort(rec.tgl_submit_nas) : '—') : <Hidden />}
          </KpiBlock>
        </div>

        {/* 4. Status + Open (kartu sempit: 1 baris, status kiri & Open kanan) */}
        <div className="flex @4xl:flex-col items-center @4xl:items-end justify-between gap-1.5 min-w-0">
          <div className="flex flex-col items-start @4xl:items-end gap-1.5 min-w-0">
            <Pill tone={draft ? 'amber' : 'green'}>{draft ? 'Draft' : 'Audited'}</Pill>
            {/* Re-audit otomatis (sql/037): Invoice Recap diedit setelah Audited -> kembali Draft + alasan. */}
            {rec.reaudit_reason && <Chip tone="purple" title={rec.reaudit_reason}>↻ Changed in Invoice Recap — please re-audit</Chip>}
          </div>
          {onOpen && (
            <button type="button" onClick={e => { e.stopPropagation(); onOpen(rec) }}
              className={`inline-flex items-center justify-center px-4 h-8 rounded-xl border text-xs font-semibold transition-colors ${selected ? 'bg-[#3B1B3D] border-[#3B1B3D] text-white' : 'bg-white border-[#EADFD6] hover:border-[#6B3470]/40 hover:bg-[#FBF7F4] text-[#3B1B3D]'}`}>
              {selected ? 'Opened' : 'Open'}
            </button>
          )}
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
