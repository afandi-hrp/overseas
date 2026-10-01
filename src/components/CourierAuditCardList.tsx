// Tampilan KARTU Audit Courier (2026-10-01) -- mengikuti Audit PIB Sea & Air (token SeaAirAuditUi).
// Murni tampilan: baris = `records` SharedDataTable (query lama, sudah ter-enrich auto-calc,
// kelengkapan & persen validasi), ringkasan = fetchCourierAuditSummary. Kolom yang tidak diizinkan
// role (getAllowedColumns 'courier_audit') TIDAK ditampilkan (`colOk`). Tabel lama tetap di mode List.
import React, { useState } from 'react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, Chip, Pill, PtBadge } from './SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort, fmtPctShort, splitMulti, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  computeCourierDutyRows, courierDocNo, courierRowKey, isCourierDraft, type CourierAuditSummary, type CourierDocType,
} from '../utils/CourierAuditHelpers'
import { VALIDATION_TAB_LABEL, rowValidationPct, validationDotClass, validationDotLabel, type ValidationTabKey } from './CourierValidationWindow'

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

// Titik status validasi (sama aturan tombol Validation lama: hijau 100%, oranye <100%, abu belum ada).
export const ValidationDots: React.FC<{ rec: any; tabs: ValidationTabKey[]; onOpenTab?: (t: ValidationTabKey) => void }> = ({ rec, tabs, onOpenTab }) => {
  const pct = rowValidationPct(rec)
  if (tabs.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F3EEEA]">
      {tabs.map(t => (
        <button key={t} type="button" onClick={onOpenTab ? () => onOpenTab(t) : undefined} disabled={!onOpenTab}
          title={`${VALIDATION_TAB_LABEL[t]}: ${validationDotLabel(pct[t])}`} aria-label={`${VALIDATION_TAB_LABEL[t]}: ${validationDotLabel(pct[t])}`}
          className={`w-2.5 h-2.5 rounded-full ${validationDotClass(pct[t])} ${onOpenTab ? 'hover:ring-2 hover:ring-[#6B3470]/30' : ''}`} />
      ))}
    </span>
  )
}

// ─── Baris kartu PIB / CN ─────────────────────────────────────────────────────
const CourierAuditRowCard: React.FC<{
  rec: any
  docType: CourierDocType
  companyNames: Record<string, string>
  colOk: (key: string) => boolean
  validationTabs: ValidationTabKey[]
  onOpen: (rec: any, tab?: 'overview' | ValidationTabKey) => void
}> = ({ rec, docType, companyNames, colOk, validationTabs, onOpen }) => {
  const [expanded, setExpanded] = useState(false)
  const draft = isCourierDraft(rec)
  const pos = colOk('po_ori') ? splitMulti(rec.po_ori) : []
  const duty = computeCourierDutyRows(rec, docType)
  const rate = (k: 'bm' | 'ppn' | 'pph') => fmtPctShort(duty.rows.find(r => r.key === k)?.rate ?? null)
  const nasDone = colOk('tgl_submit_nas') && hasVal(rec.tgl_submit_nas)
  const borderColor = draft ? 'border-l-[#E0A526]' : nasDone ? 'border-l-[#17663D]' : 'border-l-[#6B3470]'
  const via = colOk('via') ? String(rec.via || '').toUpperCase() : ''
  const term = colOk('delivery_term') ? String(rec.delivery_term || '').trim() : ''
  const docNoKey = docType === 'CN' ? 'no_sppbmcp' : 'no_pib'
  const docNo = colOk(docNoKey) ? courierDocNo(rec, docType) : ''
  const adm = docType === 'CN' && colOk('sanksi_adm') ? Number(rec.sanksi_adm) || 0 : 0
  const rateOk = colOk('bm') && colOk('total_nilai_pabean')

  return (
    <div className={`${SA_CARD} border-l-4 ${borderColor} overflow-hidden ${nasDone ? 'bg-[#F7FBF8]' : ''}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_minmax(0,1fr)_230px_240px] gap-x-5 gap-y-3 px-4 py-3.5 items-center">
        {/* 1. Dokumen */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-[#8A7A8B] font-medium">
            <Chip tone={docType === 'CN' ? 'purple' : 'blue'}>{docType}</Chip>
            {colOk('tgl_ppjk') && <span>{fmtDateShort(rec.tgl_ppjk)}</span>}
          </div>
          <div className="text-[13.5px] font-bold text-[#3B1B3D] truncate tabular-nums mt-0.5" title={docNo}>{docNo || <span className="text-[#8A7A8B] font-semibold">No {docType === 'CN' ? 'SPPBMCP' : 'PIB'} no.</span>}</div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {via && <Chip tone="grey">{via}</Chip>}
            {term && <Chip tone="plum">{term}</Chip>}
            {colOk('awb') && <span className="text-[11px] text-[#6E5E70] truncate" title={rec.awb || ''}>{rec.awb || '—'}</span>}
          </div>
        </div>

        {/* 2. PT + supplier + PO */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {colOk('impor_an') && <PtBadge code={rec.impor_an} title={companyFullName(companyNames, rec.impor_an)} />}
            {colOk('vendor') && <span className="text-[13px] font-bold text-[#3B1B3D] truncate" title={rec.vendor || ''}>{rec.vendor || '—'}</span>}
          </div>
          {colOk('po_ori') && (
            <div className="mt-1 text-[11.5px] text-[#6E5E70] min-w-0">
              {pos.length === 0 ? <span>No PO</span> : (
                <div className="flex items-start gap-1.5 min-w-0">
                  <div className="min-w-0">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p}>{p}</div>)}</div>
                  {pos.length > 1 && (
                    <button type="button" onClick={() => setExpanded(v => !v)}
                      className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                      {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {(nasDone || (colOk('doc_acceptance') && hasVal(rec.doc_acceptance))) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {colOk('doc_acceptance') && hasVal(rec.doc_acceptance) && <Chip tone="grey" title="Doc Acceptance">Accepted {fmtDateShort(rec.doc_acceptance)}</Chip>}
              {nasDone && <Chip tone="green" title="NAS Submit Date">NAS submitted {fmtDateShort(rec.tgl_submit_nas)}</Chip>}
            </div>
          )}
        </div>

        {/* 3. Duty & tax */}
        <div className="lg:text-right min-w-0">
          {colOk('total_pib_cn') ? (
            <>
              <div className={SA_LABEL}>Duty &amp; tax</div>
              <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(rec.total_pib_cn)}</div>
              {rateOk && (
                <div className="text-[11px] text-[#6E5E70] tabular-nums">
                  BM <b className="text-[#3B1B3D]">{rate('bm')}</b> · PPN <b className="text-[#3B1B3D]">{rate('ppn')}</b> · PPh <b className="text-[#3B1B3D]">{rate('pph')}</b>
                </div>
              )}
              {adm > 0 && <div className="text-[11px] text-[#7A4F00] tabular-nums">incl. admin penalty {fmtRp(adm)}</div>}
            </>
          ) : <div className="text-[11px] text-[#8A7A8B]">Duty &amp; tax hidden for your role</div>}
        </div>

        {/* 4. Status */}
        <div className="flex flex-col lg:items-end gap-1.5 min-w-0">
          <div className="flex flex-wrap lg:justify-end items-center gap-1.5">
            <Pill tone={draft ? 'amber' : 'green'}>{draft ? 'Draft' : 'Audited'}</Pill>
            <ValidationDots rec={rec} tabs={validationTabs} onOpenTab={t => onOpen(rec, t)} />
          </div>
          <button type="button" onClick={() => onOpen(rec)} className={`${SA_BTN_OUTLINE} h-8 px-4`}>Open</button>
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
  onOpen: (rec: any, tab?: 'overview' | ValidationTabKey) => void
}> = ({ rows, docTypeOf, companyNames, colOk, validationTabs, onOpen }) => (
  <div className="flex flex-col gap-2.5">
    {rows.map(rec => {
      const t = docTypeOf(rec)
      return <CourierAuditRowCard key={courierRowKey(rec, t)} rec={rec} docType={t} companyNames={companyNames} colOk={colOk} validationTabs={validationTabs} onOpen={onOpen} />
    })}
  </div>
)
