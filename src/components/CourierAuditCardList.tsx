// Tampilan KARTU Audit Courier (2026-10-01) -- mengikuti Audit PIB Sea & Air (token SeaAirAuditUi).
// Murni tampilan: baris = `records` SharedDataTable (query lama, sudah ter-enrich auto-calc,
// kelengkapan & persen validasi), ringkasan = fetchCourierAuditSummary. Kolom yang tidak diizinkan
// role (getAllowedColumns 'courier_audit') TIDAK ditampilkan (`colOk`). Tabel lama tetap di mode List.
import React, { useEffect, useMemo, useState } from 'react'
import { SA_CARD, SA_LABEL, Chip, Pill, PtBadge } from './SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  courierDocNo, courierRowKey, courierTotalDutyTax, courierTotalExpenses, fetchCourierCardExtras, isCourierDraft,
  type CourierAuditSummary, type CourierCardExtra, type CourierDocType,
} from '../utils/CourierAuditHelpers'
import type { ValidationTabKey } from './CourierValidationWindow'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'

// ─── Kartu KPI ────────────────────────────────────────────────────────────────
export const CourierAuditKpiCards: React.FC<{
  summary: CourierAuditSummary | null
  loading: boolean
  validationIncomplete: number | null
  colOk: (key: string) => boolean
}> = ({ summary, loading, validationIncomplete, colOk }) => {
  const v = (fn: (s: CourierAuditSummary) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]') => (
    <div className={`${SA_CARD} px-4 py-3 min-w-0`}>
      <div className="text-[11.5px] font-semibold text-[#6E5E70]">{label}</div>
      <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
    </div>
  )
  const hidden = 'Hidden for your role'
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {card('Records', v(s => s.total), v(s => `${s.draft} draft · ${s.pib} PIB · ${s.cn} CN`))}
      {colOk('total_nilai_pabean')
        ? card('Customs value', v(s => fmtRpShort(s.cvSum)), 'total customs value in rupiah')
        : card('Customs value', '—', hidden)}
      {colOk('total_pib_cn')
        ? card('Duties & taxes', v(s => fmtRpShort(s.dutySum)), v(s => `BM ${fmtRpShort(s.bmSum)} · PPN ${fmtRpShort(s.ppnSum)} · PPh ${fmtRpShort(s.pphSum)}${s.admSum ? ` · Adm ${fmtRpShort(s.admSum)}` : ''}`))
        : card('Duties & taxes', '—', hidden)}
      {colOk('tgl_submit_nas')
        ? card('Not submitted to NAS', v(s => s.nasEmpty), v(s => `${s.nasEmptyDraft} draft · ${s.nasEmptyPib} PIB · ${s.nasEmptyCn} CN`), 'text-[#7A4F00]')
        : card('Not submitted to NAS', '—', hidden)}
      {card('Validation incomplete', validationIncomplete === null ? (loading ? '…' : '—') : validationIncomplete, 'draft · checklist / doc / cost below 100% (info only)', 'text-[#A8231A]')}
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
  validationTabs: ValidationTabKey[]
  extra?: CourierCardExtra
  selected: boolean
  onOpen?: (rec: any) => void
}> = ({ rec, docType, companyNames, colOk, validationTabs, extra, selected, onOpen }) => {
  const draft = isCourierDraft(rec)
  const nasDone = colOk('tgl_submit_nas') && hasVal(rec.tgl_submit_nas)
  const borderColor = draft ? 'border-l-[#E0A526]' : nasDone ? 'border-l-[#17663D]' : 'border-l-[#6B3470]'
  const term = colOk('delivery_term') ? String(rec.delivery_term || '').trim() : ''
  // No. PIB hanya utk jalur PIB; jalur CN barisnya DIKOSONGKAN (tanpa teks "No SPPBMCP no.").
  const pibNo = docType === 'PIB' && colOk('no_pib') ? courierDocNo(rec, 'PIB') : ''
  const showExpenses = colOk('total_inv_freight') || colOk('total_inv_duty')
  const showDutyTax = colOk('total_pib_cn')
  const showFinalCheck = validationTabs.includes('doc')
  const loadingExtra = extra === undefined // belum selesai dibaca -> "…" (bukan angka tanpa Credit Note)

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
            {showExpenses ? (loadingExtra ? '…' : fmtRp(courierTotalExpenses(rec, extra))) : <Hidden />}
          </KpiBlock>
          <KpiBlock label="Total Duty Tax">
            {showDutyTax ? fmtRp(courierTotalDutyTax(rec, docType)) : <Hidden />}
          </KpiBlock>
          <KpiBlock label="Final Check" small>
            {showFinalCheck ? (loadingExtra ? '…' : extra?.finalCheckDate ? fmtDateShort(extra.finalCheckDate) : '—') : <Hidden />}
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
  validationTabs: ValidationTabKey[]
  // Kartu yang sedang tampil di panel preview (kunci `${jenis}-${id}`) & klik kartu / tombol Open.
  selectedKey?: string | null
  onOpen: (rec: any) => void
  // Naik = baca ulang Credit Note & Final Check (mis. setelah popup validasi ditutup).
  extrasNonce?: number
  // Reorder Mode mode Card (2026-10-02): bungkus tiap kartu (grip drag + nomor posisi). Tanpa prop = tampilan biasa.
  // Saat Reorder Mode, kartu TIDAK bisa dibuka (tanpa tombol Open) -- hanya diseret.
  wrapCard?: (rec: any, index: number, card: React.ReactNode) => React.ReactNode
}> = ({ rows, docTypeOf, companyNames, colOk, validationTabs, selectedKey = null, onOpen, extrasNonce = 0, wrapCard }) => {
  // Credit Note & Final Check Date dibaca berkelompok utk baris yang tampil (2 query per 50 baris); kunci string supaya
  // render ulang induk (identitas `rows` baru) TIDAK memicu baca ulang.
  const rowsKey = useMemo(() => rows.map(r => courierRowKey(r, docTypeOf(r))).join(','), [rows, docTypeOf])
  const [extras, setExtras] = useState<Record<string, CourierCardExtra>>({})
  useEffect(() => {
    let cancelled = false
    fetchCourierCardExtras(rows, docTypeOf)
      .then(m => { if (!cancelled) setExtras(m) })
      .catch(e => console.error('[CourierAudit] angka kartu gagal', e))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, extrasNonce])

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((rec, index) => {
        const t = docTypeOf(rec)
        const key = courierRowKey(rec, t)
        const extra = extras[key] // undefined = belum dibaca (…)
        const card = (
          <CourierAuditRowCard rec={rec} docType={t} companyNames={companyNames} colOk={colOk} validationTabs={validationTabs}
            extra={extra} selected={selectedKey === key} onOpen={wrapCard ? undefined : onOpen} />
        )
        return <React.Fragment key={key}>{wrapCard ? wrapCard(rec, index, card) : card}</React.Fragment>
      })}
    </div>
  )
}
