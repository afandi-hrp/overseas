// Detail kartu AWB Finance Handover Courier (2026-10-06, keputusan user; referensi tampilan finance_handover_courier.html --
// gaya/warna/font tetap aplikasi). Dibuka tombol "Open" di kartu (expand/collapse DI DALAM kartu, bukan popup & tidak
// pindah menu), SEMUA baca saja -- Finance hanya bisa Accept / Mark paid di kartu.
// Revisi 2026-10-15 (permintaan user): isi kartu = Invoices saja; Cost Validation & Doc Validation BUKAN tab lagi melainkan 2
// tombol POP-UP sebaris "View only" & Print (label = % + titik: hijau 100%, oranye < 100%, abu belum ada data). Pop-up Doc
// Validation = komponen Doc Validation TERPADU (ValidasiModal variant unified, canEdit=false) -- SAMA & sinkron dgn Audit Courier
// dan Invoice Recap Details, dengan `financeView` = TETAP dibatasi FINANCE_DOC_MATRIX (keputusan user 2026-10-15). Prop `tab` kini = pop-up yang terbuka ('invoices' = tidak ada).
// Tab Checklist DIHAPUS 2026-10-06 (permintaan user: Finance tidak butuh). Isi memakai komponen YANG SAMA dgn Courier
// (tanpa formula baru):
// - Cost Validation = isi jendela Details Invoice Recap (CostValidationModalLegacy embedded `financeView`: header ringkasan
//   gaya jendela Open Audit, tanpa tombol aksi, Catatan Perubahan Manual tetap tampil).
// - Doc Validation = ValidasiModal embedded variant unified financeView (List | Columns, Show only mismatches; baca saja;
//   hanya tabel Invoice Freight & Duty + NPWP seperti sebelumnya).
// Kedua pop-up dipasang sekaligus saat kartu dibuka (tersembunyi bila tidak dibuka) supaya % & titik di tombol langsung akurat.
// Print: tombol di baris kartu = kartu ini + Invoices (`#finance-courier-print-area`); tombol Print di pop-up = isi pop-up itu
// (`#finance-courier-popup-print-area`, kartu tidak ikut tercetak) -- aturan di index.css.
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import ValidasiModal from './ValidasiModal'
import CostValidationModalLegacy from './CostValidationModalLegacy'
import { VW_CARD } from './validationWindowStyles'
import { validationDotClass, validationDotLabel } from './CourierValidationWindow'
import { computeCourierAuditCalc, courierDocNo, type CourierDocType } from '../utils/CourierAuditHelpers'
import type { HandoverItem } from '../utils/FinanceHandoverHelpers'
import { useCourierDutyRaw, courierTotalBreakdown } from '../utils/CourierTotalBreakdown'
import { CourierTotalSummary } from './CourierRecapInvoicesTab'

export type CourierDetailTab = 'invoices' | 'cost' | 'doc'
type DetailValidationTab = Exclude<CourierDetailTab, 'invoices'>
export const COURIER_DETAIL_TABS: CourierDetailTab[] = ['invoices', 'cost', 'doc']
export const COURIER_DETAIL_TAB_LABEL: Record<CourierDetailTab, string> = {
  invoices: 'Invoices', cost: 'Cost Validation', doc: 'Doc Validation',
}

const noop = () => {}

const allCols = () => true

// Revisi 2026-10-12 (keputusan user): tampilan SAMA dgn tabel "Total" tab Invoices panel Validation Invoice Recap Courier
// (`CourierTotalSummary`: Invoice · No. Invoice · Invoice PPJK Date · Amount · Status · Tgl Submit + Grand Total). Handover hanya berisi
// invoice yang SUDAH dikirim ke Finance -> angka TIDAK berubah (rumus lama), hanya label; "Needs check" tampil sebagai info saja;
// tanpa tombol Unlock (Finance baca saja). BM · PPN · PPh dijabarkan (sama Invoice Recap yang sudah Locked, keputusan user 2026-10-12).
export function CourierInvoicesTable({ item }: { item: HandoverItem }) {
  const group = item.courier?.group || null
  const raw = useCourierDutyRaw(group?.audit ?? null, !!group && group.byKind.duty.length > 0)
  const bd = useMemo(() => (group ? courierTotalBreakdown(group, raw, group.audit) : null), [group, raw])
  if (!group || !bd) return null
  return <CourierTotalSummary g={group} bd={bd} colOk={allCols} />
}

export default function FinanceCourierAwbDetail({ item, tab, onTab, onPrint }: {
  item: HandoverItem
  tab: CourierDetailTab
  onTab: (t: CourierDetailTab) => void
  onPrint: () => void
}) {
  const link = item.courier?.group.audit || null
  const docType = (link?.docType || 'PIB') as CourierDocType
  // Baris PIB/CN pasangan + auto-calc SAMA layar Audit (salinan; data kartu tidak diubah).
  const rec = useMemo(() => {
    if (!link) return null
    const r = { ...link.rec, jenis_dokumen: link.docType }
    return Object.assign(r, computeCourierAuditCalc(r, link.docType, r.manual_override_fields))
  }, [link])

  // undefined = sedang dimuat, null = belum ada data.
  const [pct, setPct] = useState<Record<DetailValidationTab, number | null | undefined>>({ cost: undefined, doc: undefined })
  const setPctOf = useMemo(() => {
    const mk = (k: DetailValidationTab) => (v: number | null) => setPct(p => (p[k] === v ? p : { ...p, [k]: v }))
    return { cost: mk('cost'), doc: mk('doc') }
  }, [])
  useEffect(() => { if (!rec) setPct({ cost: null, doc: null }) }, [rec])

  const popup: DetailValidationTab | null = tab === 'invoices' ? null : tab
  const closePopup = () => onTab('invoices')
  // Esc menutup pop-up.
  useEffect(() => {
    if (!popup) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onTab('invoices') }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [popup, onTab])

  const popupTitle = (k: DetailValidationTab) =>
    `${COURIER_DETAIL_TAB_LABEL[k]} · ${docType}${rec && courierDocNo(rec, docType) ? ` ${courierDocNo(rec, docType)}` : ''} · ${item.ref}`

  // Pop-up validasi (portal ke body). Tetap terpasang selama kartu terbuka -- disembunyikan bila bukan yang aktif.
  const popupShell = (k: DetailValidationTab, body: React.ReactNode) => createPortal(
    <div className={popup === k ? 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-3 max-[1600px]:p-2.5' : 'hidden'}
      id={popup === k ? 'finance-courier-popup-print-area' : undefined} role="dialog" aria-modal="true" aria-label={popupTitle(k)} aria-hidden={popup !== k}
      data-finance-popup={k} onMouseDown={e => { if (e.target === e.currentTarget) closePopup() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] h-[92vh] max-[1600px]:h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-3.5 border-b border-[#EADFD6]">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-[#3B1B3D] leading-tight [overflow-wrap:anywhere]">{popupTitle(k)}</h2>
            <div className="text-[12px] text-[#6E5E70] mt-0.5">Finance Handover · Courier · view only{k === 'doc' ? ' · same record as Audit & Invoice Recap' : ''}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <span className="text-[11px] font-bold text-[#8A7A8B] bg-[#F3EEEA] px-2 py-0.5 rounded-md">View only</span>
            <button type="button" onClick={onPrint} aria-label={`Print ${COURIER_DETAIL_TAB_LABEL[k]}`}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white hover:bg-[#FBF7F4] text-[#3B1B3D] text-[12px] font-bold">
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={closePopup} title="Close (Esc)" aria-label="Close" className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70]">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 cvw-fill">{body}</div>
      </div>
    </div>,
    document.body,
  )

  const noAudit = (
    <div className={`${VW_CARD} px-4 py-3 text-[12.5px] text-[#7A4F00] bg-[#FFF8EA] border-[#F3D9A4]`}>
      No PIB / CN for this AWB was found in Audit Courier — Cost Validation and Doc Validation are not available.
    </div>
  )

  return (
    <div className="border-t border-[#EADFD6] bg-[#FFFDFB] px-4 pb-4" data-courier-detail={item.key}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[#EADFD6] mb-3 py-2 print:hidden" aria-label="Handover details">
        <span className="inline-flex items-center py-1 text-[12.5px] font-bold text-[#3B1B3D] mr-auto">{COURIER_DETAIL_TAB_LABEL.invoices}</span>
        {rec && (['cost', 'doc'] as DetailValidationTab[]).map(k => {
          const p = pct[k]
          return (
            <button key={k} type="button" aria-haspopup="dialog" aria-expanded={popup === k} onClick={() => onTab(k)} data-finance-popup-btn={k}
              title={p !== undefined ? `${COURIER_DETAIL_TAB_LABEL[k]}: ${validationDotLabel(p)}` : undefined}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white hover:bg-[#FBF7F4] hover:border-[#6B3470]/40 text-[#3B1B3D] text-[12px] font-bold">
              <span className={`w-2 h-2 rounded-full shrink-0 ${validationDotClass(p ?? null)}`} data-tab-dot={p === undefined || p === null ? 'none' : p >= 100 ? 'ok' : 'warn'} />
              {COURIER_DETAIL_TAB_LABEL[k]} <span className="font-semibold text-[#6E5E70]">{p === undefined ? '…' : p === null ? '–' : `${p}%`}</span>
            </button>
          )
        })}
        <span className="text-[11px] font-bold text-[#8A7A8B] bg-[#F3EEEA] px-2 py-0.5 rounded-md">View only</span>
        <button type="button" onClick={onPrint} aria-label="Print invoices"
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white hover:bg-[#FBF7F4] text-[#3B1B3D] text-[12px] font-bold">
          <Printer size={14} /> Print
        </button>
      </div>

      <CourierInvoicesTable item={item} />
      {!rec && <div className="mt-3">{noAudit}</div>}

      {rec && popupShell('cost', (
        <div className="rounded-[14px] border border-[#EADFD6] overflow-hidden bg-white">
          <CostValidationModalLegacy awb={rec.awb} jenisDokumen={docType} docId={rec.id} rawRecord={rec} onClose={noop}
            canEdit={false} embedded financeView onPctChange={setPctOf.cost} />
        </div>
      ))}
      {rec && popupShell('doc', (
        <ValidasiModal record={rec} mainTab="courier" subTab="courier_audit" onClose={noop} canEdit={false} embedded variant="unified" financeView
          onPctChange={setPctOf.doc} />
      ))}
    </div>
  )
}
