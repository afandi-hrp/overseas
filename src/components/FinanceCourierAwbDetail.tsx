// Detail kartu AWB Finance Handover Courier (2026-10-06, keputusan user; referensi tampilan finance_handover_courier.html --
// gaya/warna/font tetap aplikasi). Dibuka tombol "Open" di kartu (expand/collapse DI DALAM kartu, bukan popup & tidak
// pindah menu), SEMUA baca saja -- Finance hanya bisa Accept / Mark paid di kartu.
// Tab: Invoices · Cost Validation · Doc Validation (label = % + titik: hijau 100%, oranye < 100%, abu belum ada data).
// Tab Checklist DIHAPUS 2026-10-06 (permintaan user: Finance tidak butuh). Isi memakai komponen YANG SAMA dgn Courier
// (tanpa formula baru):
// - Cost Validation = isi jendela Details Invoice Recap (CostValidationModalLegacy embedded `financeView`: header ringkasan
//   gaya jendela Open Audit, tanpa tombol aksi, Catatan Perubahan Manual tetap tampil).
// - Doc Validation = ValidasiModal embedded `financeView` (tampilan jendela Open Audit Courier, hanya 3 tabel: Invoice
//   Freight & Invoice Duty, SPPBMCP [jalur CN], NPWP table; tanpa Checked — accept / Mark mismatch / Correct / Recompute).
// Kedua tab validasi dipasang sekaligus saat kartu dibuka (tab lain `hidden`) supaya % & titik di label langsung akurat.
// Print: hanya kartu ini (info kartu + tab aktif) -- area cetak `#finance-courier-print-area` (index.css), tombol/tab bar
// `print:hidden`, keterangan cetak dirender halaman.
import React, { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import ValidasiModal from './ValidasiModal'
import CostValidationModalLegacy from './CostValidationModalLegacy'
import { VW_CARD } from './validationWindowStyles'
import { validationDotClass, validationDotLabel } from './CourierValidationWindow'
import { computeCourierAuditCalc, type CourierDocType } from '../utils/CourierAuditHelpers'
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

  const noAudit = (
    <div className={`${VW_CARD} px-4 py-3 text-[12.5px] text-[#7A4F00] bg-[#FFF8EA] border-[#F3D9A4]`}>
      No PIB / CN for this AWB was found in Audit Courier — Cost Validation and Doc Validation are not available.
    </div>
  )

  return (
    <div className="border-t border-[#EADFD6] bg-[#FFFDFB] px-4 pb-4" data-courier-detail={item.key}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[#EADFD6] mb-3 print:hidden" role="tablist" aria-label="Handover details">
        {COURIER_DETAIL_TABS.map(t => {
          const p = t === 'invoices' ? undefined : pct[t]
          const label = t === 'invoices' ? COURIER_DETAIL_TAB_LABEL[t]
            : `${COURIER_DETAIL_TAB_LABEL[t]} ${p === undefined ? '…' : p === null ? '–' : `${p}%`}`
          return (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)}
              title={t !== 'invoices' && p !== undefined ? `${COURIER_DETAIL_TAB_LABEL[t]}: ${validationDotLabel(p)}` : undefined}
              className={`inline-flex items-center gap-1.5 py-2.5 text-[12.5px] border-b-2 -mb-px ${tab === t ? 'border-[#6B3470] text-[#3B1B3D] font-bold' : 'border-transparent text-[#6E5E70] font-semibold hover:text-[#3B1B3D]'}`}>
              {t !== 'invoices' && <span className={`w-2 h-2 rounded-full shrink-0 ${validationDotClass(p ?? null)}`} data-tab-dot={p === undefined || p === null ? 'none' : p >= 100 ? 'ok' : 'warn'} />}
              {label}
            </button>
          )
        })}
        <span className="ml-auto text-[11px] font-bold text-[#8A7A8B] bg-[#F3EEEA] px-2 py-0.5 rounded-md">View only</span>
        <button type="button" onClick={onPrint} aria-label={`Print ${COURIER_DETAIL_TAB_LABEL[tab]}`}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-[#EADFD6] bg-white hover:bg-[#FBF7F4] text-[#3B1B3D] text-[12px] font-bold">
          <Printer size={14} /> Print
        </button>
      </div>

      {tab === 'invoices' && <CourierInvoicesTable item={item} />}

      {!rec ? (tab !== 'invoices' && noAudit) : (
        <>
          <div className={tab === 'cost' ? '' : 'hidden'} role="tabpanel">
            <div className="rounded-[14px] border border-[#EADFD6] overflow-hidden">
              <CostValidationModalLegacy awb={rec.awb} jenisDokumen={docType} docId={rec.id} rawRecord={rec} onClose={noop}
                canEdit={false} embedded financeView onPctChange={setPctOf.cost} />
            </div>
          </div>
          <div className={tab === 'doc' ? '' : 'hidden'} role="tabpanel">
            <ValidasiModal record={rec} mainTab="courier" subTab="courier_audit" onClose={noop} canEdit={false} embedded financeView
              onPctChange={setPctOf.doc} />
          </div>
        </>
      )}
    </div>
  )
}
