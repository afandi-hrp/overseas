// Panel PREVIEW kanan Audit Courier mode Card (2026-10-13, permintaan user, referensi audit_preview_v2.html) --
// MENGGANTIKAN jendela Open (CourierValidationWindow + CourierAuditOverview) di Audit Courier. Klik Open / kartu: daftar kartu
// menyempit ke kiri, detail tampil di panel ini; klik kartu lain = ganti isi; tutup lewat ✕ / Esc.
// - Header: badge jalur + No. AWB + Edit / Mark as audited (Move back to Draft) / Delete / Print / ✕.
// - Tab: Overview | Audit trail (tab Documents & Costs DIHAPUS).
// - Overview: 1 PO & Vendor, 2 Shipment, 3 Customs Value & Duties, 4 Completeness & Validation. Baris Checklist / Cost Validation /
//   Doc Validation di Section 4 membuka POPUP masing-masing (komponen embedded LAMA: ChecklistModal / CostValidationModal /
//   ValidasiModal `variant="unified"` sejak 2026-10-15 -- komponen Doc Validation yang SAMA Invoice Recap Details & Finance); Check difference hanya info. Tutup popup (✕ / Esc / klik luar) kembali ke preview.
// MURNI tampilan dari kolom tersimpan (+ auto-calc yg sudah di-apply saat fetch); kolom yang tidak diizinkan role tidak tampil
// (`colOk`). Validasi = info saja, TIDAK pernah mengunci Mark as audited.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Printer, ChevronRight } from 'lucide-react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip } from './SeaAirAuditUi'
import { fmtRp, fmtValas, fmtDateShort, fmtPctShort, buildGoodsLines, splitMoneyEvenly, companyFullName } from '../utils/SeaAirAuditHelpers'
import {
  computeCourierBuildUp, computeCourierDutyRows, courierAdmOrSptnp, courierDocNo, courierPoAmount, courierPoRate, type CourierDocType,
} from '../utils/CourierAuditHelpers'
import { VALIDATION_TAB_LABEL, rowValidationPct, validationDotClass, type ValidationTabKey } from './CourierValidationWindow'
import ValidasiModal from './ValidasiModal'
// Cost Validation = komponen SAMA Invoice Recap & Finance (CostValidationModalLegacy, revisi 2026-10-15).
import CostValidationModal from './CostValidationModalLegacy'
import CourierAuditTrail from './CourierAuditTrail'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-' && String(v).trim() !== '—'

// ─── Potongan kecil ───────────────────────────────────────────────────────────
const NumBadge: React.FC<{ n: number }> = ({ n }) => (
  <i className="w-5 h-5 rounded-md bg-[#6B3470] text-white text-[10.5px] font-bold not-italic grid place-items-center shrink-0">{n}</i>
)
const PreviewSection: React.FC<{ n: number; title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ n, title, right, children, className = '' }) => (
  <div className={`${SA_CARD} overflow-hidden min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[#F3ECE6]">
      <h3 className="text-[13px] font-bold text-[#3B1B3D] flex items-center gap-2"><NumBadge n={n} />{title}</h3>
      {right && <div className="text-[11px] text-[#6E5E70] text-right">{right}</div>}
    </div>
    {children}
  </div>
)
// Baris "label ........ nilai" (nilai rata kanan).
const LRow: React.FC<{ label: React.ReactNode; children: React.ReactNode; strong?: boolean; tone?: 'plain' | 'total' | 'hl' }> = ({ label, children, strong, tone = 'plain' }) => (
  <div className={`flex items-baseline justify-between gap-3 px-3.5 py-2 border-b border-[#F6F0EB] last:border-b-0 text-[12.5px] ${tone === 'total' ? 'bg-[#FBF7F4]' : ''}`}>
    <span className={`${tone === 'total' ? 'font-bold text-[#3B1B3D] text-[13px]' : 'text-[#6E5E70]'} min-w-0`}>{label}</span>
    <span className={`${strong || tone !== 'plain' ? 'font-bold' : 'font-medium'} ${tone === 'hl' ? 'text-[#3B1B3D]' : 'text-[#3B1B3D]'} text-right [overflow-wrap:anywhere] tabular-nums`}>{children}</span>
  </div>
)
const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-[#FBF7F4] px-3.5 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#6B3470]">{children}</div>
)
const Dash = () => <span className="text-[#B3A6AE] font-normal">—</span>
const signedRp = (v: number) => `${v < 0 ? '−' : ''}${fmtRp(Math.abs(v))}`

const pctTone = (pct: number | null) =>
  pct === null ? 'bg-[#F3EEEA] text-[#6E5E70]' : pct >= 100 ? 'bg-[#EAF6EF] text-[#17663D]' : 'bg-[#FFF1D6] text-[#7A4F00]'

type PopupKey = ValidationTabKey

// ─── Popup (modal) validasi ───────────────────────────────────────────────────
// Lebar (2026-10-15, permintaan user): Cost Validation ±920px, Doc Validation ±1460px / 95vw -- SAMA Invoice Recap & Finance.
const POPUP_WIDTH: Record<'checklist' | 'cost' | 'doc', string> = { checklist: 'max-w-[760px]', cost: 'max-w-[920px]', doc: 'max-w-[min(1460px,95vw)]' }
const ValidationPopup: React.FC<{ title: string; subtitle: string; size: 'checklist' | 'cost' | 'doc'; onRequestClose: () => void; children: React.ReactNode }> = ({ title, subtitle, size, onRequestClose, children }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-3 max-[1600px]:p-2.5 print:hidden" role="dialog" aria-modal="true" aria-label={title}
    onMouseDown={e => { if (e.target === e.currentTarget) onRequestClose() }}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${POPUP_WIDTH[size]} max-h-full flex flex-col overflow-hidden`}>
      <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-3.5 border-b border-[#EADFD6]">
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-[#3B1B3D] leading-tight [overflow-wrap:anywhere]">{title}</h2>
          <div className="text-[12px] text-[#6E5E70] mt-0.5">{subtitle}</div>
        </div>
        <button type="button" onClick={onRequestClose} title="Close (Esc)" aria-label="Close" className="w-9 h-9 shrink-0 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70] transition-colors">
          <X size={18} />
        </button>
      </div>
      {/* Cost Validation punya area scroll & padding sendiri (komponen embedded) -> tanpa padding/scroll ganda. */}
      <div className={size === 'cost' ? 'flex-1 min-h-0 flex flex-col cvw-fill' : 'flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 cvw-fill'}>{children}</div>
    </div>
  </div>
)

// ─── Panel preview ────────────────────────────────────────────────────────────
export default function CourierAuditPreview({
  rec, docType, companyNames, colOk, validationTabs, access, editAccess, mainTab, subTab,
  canEditAudit, canDelete, busy, escDisabled = false,
  renderChecklist, onClose, onEdit, onSetStatus, onDelete, onValidationChanged,
}: {
  rec: any
  docType: CourierDocType
  companyNames: Record<string, string>
  colOk: (key: string) => boolean
  validationTabs: ValidationTabKey[]
  access: Record<ValidationTabKey, boolean>
  editAccess: Record<ValidationTabKey, boolean>
  mainTab: string
  subTab?: string
  canEditAudit: boolean
  canDelete: boolean
  busy: boolean
  // true selama jendela lain (Edit / Delete) terbuka di atas panel -> Esc tidak menutup panel.
  escDisabled?: boolean
  renderChecklist: (api: { onPctChange: (pct: number | null) => void; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }) => React.ReactNode
  onClose: () => void
  onEdit: () => void
  onSetStatus: (target: 'audited' | 'draft') => void
  onDelete: () => void
  // Dipanggil saat popup validasi ditutup (data bisa berubah): induk membaca ulang baris itu tanpa reload tabel.
  onValidationChanged: () => void
}) {
  const draft = rec?.status === 'ARCHIVED'
  const [tab, setTab] = useState<'overview' | 'trail'>('overview')
  const [popup, setPopup] = useState<PopupKey | null>(null)
  const [pct, setPct] = useState<Record<ValidationTabKey, number | null>>(() => rowValidationPct(rec))
  const [dirty, setDirty] = useState<Record<ValidationTabKey, boolean>>({ checklist: false, doc: false, cost: false })
  const [checklistVersion, setChecklistVersion] = useState(0)

  // % persen per tab: nilai live dari popup (onPctChange) menimpa nilai baris; baris dibaca ulang (rec baru) -> ikut baris
  // KECUALI tab itu sedang punya nilai live dari popup yang sudah dibuka.
  const livePct = useRef<Partial<Record<ValidationTabKey, boolean>>>({})
  useEffect(() => {
    const fromRow = rowValidationPct(rec)
    setPct(prev => ({
      checklist: livePct.current.checklist ? prev.checklist : fromRow.checklist,
      doc: livePct.current.doc ? prev.doc : fromRow.doc,
      cost: livePct.current.cost ? prev.cost : fromRow.cost,
    }))
  }, [rec])

  const setTabPct = useCallback((key: ValidationTabKey) => (value: number | null) => {
    livePct.current[key] = true
    setPct(prev => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }, [])
  const onChecklistPct = useMemo(() => setTabPct('checklist'), [setTabPct])
  const onDocPct = useMemo(() => setTabPct('doc'), [setTabPct])
  const onCostPct = useMemo(() => setTabPct('cost'), [setTabPct])
  const setDirtyOf = useCallback((key: ValidationTabKey) => (d: boolean) => setDirty(p => (p[key] === d ? p : { ...p, [key]: d })), [])
  const onChecklistDirty = useMemo(() => setDirtyOf('checklist'), [setDirtyOf])
  const onDocDirty = useMemo(() => setDirtyOf('doc'), [setDirtyOf])
  const onCostDirty = useMemo(() => setDirtyOf('cost'), [setDirtyOf])
  const onChecklistSaved = useCallback(() => setChecklistVersion(v => v + 1), [])

  const closePopup = useCallback(() => {
    if (popup && dirty[popup] && !window.confirm('You have unsaved changes. Close and discard them?')) return
    // Perubahan yang dibuang tidak ada di DB -> nilai live dibuang, kembali ke nilai baris yang dibaca ulang.
    if (popup && dirty[popup]) livePct.current[popup] = false
    setDirty(p => ({ ...p, checklist: false, doc: false, cost: false }))
    setPopup(null)
    onValidationChanged()
  }, [popup, dirty, onValidationChanged])

  // Esc: popup terbuka -> tutup popup; selain itu tutup panel (kecuali jendela Edit/Delete sedang terbuka).
  const escRef = useRef<() => void>(() => {})
  escRef.current = () => { if (popup) closePopup(); else if (!escDisabled) onClose() }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') escRef.current() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Angka tampilan ──
  const build = computeCourierBuildUp(rec)
  const duty = computeCourierDutyRows(rec, docType)
  const rate = (k: 'bm' | 'ppn' | 'pph') => fmtPctShort(duty.rows.find(r => r.key === k)?.rate ?? null)
  const lines = colOk('po_ori') ? buildGoodsLines(rec) : []
  const cur = colOk('kurs') ? String(rec.kurs || '').trim().toUpperCase() : ''
  const curLabel = cur && !/^[0-9.,\s]+$/.test(cur) ? cur : ''
  const showIdr = colOk('item_price_idr')
  // Nilai per PO = detail `po_harga_detail` ("2608/0013/IMI = USD 700" -> 700) x Kurs NDPBM (USD) / Kurs BI (selain USD, CN);
  // aturan kurs SAMA kolom Item Price (Rp) -> jumlah Rp per PO = Total Item Price.
  const goodsRate = courierPoRate(rec)
  const noPerPoAmount = lines.length > 0 && lines.every(l => courierPoAmount(l.amt) === null)
  const hasItemPrice = hasVal(rec.item_price) && colOk('item_price')
  const useItemPriceForSinglePo = noPerPoAmount && lines.length === 1 && hasItemPrice
  const canSplit = lines.length > 1 && hasItemPrice
  const defaultGoodsView: 'recorded' | 'even' = canSplit && noPerPoAmount ? 'even' : 'recorded'
  const [goodsView, setGoodsView] = useState<'recorded' | 'even'>(defaultGoodsView)
  useEffect(() => { setGoodsView(defaultGoodsView) }, [rec?.id, defaultGoodsView])
  const useEvenSplit = canSplit && goodsView === 'even'
  const evenValas = canSplit ? splitMoneyEvenly(Number(rec.item_price) || 0, lines.length, 2) : []
  const evenIdr = canSplit && hasVal(rec.item_price_idr) ? splitMoneyEvenly(Number(rec.item_price_idr) || 0, lines.length, 0) : []
  const itemTotalValas = hasVal(rec.item_price) || hasVal(rec.other_cost) ? (Number(rec.item_price) || 0) + (Number(rec.other_cost) || 0) : null

  const docNoKey = docType === 'CN' ? 'no_sppbmcp' : 'no_pib'
  const docNo = courierDocNo(rec, docType)
  const hsCodes = colOk('hs_code') && hasVal(rec.hs_code) ? String(rec.hs_code).split(/[\s,;+]+/).map(s => s.trim()).filter(Boolean) : []
  const ptName = companyFullName(companyNames, rec.impor_an)
  const missingDocs = colOk('dokumen_kurang') && hasVal(rec.dokumen_kurang) && pct.checklist !== null && pct.checklist < 100 ? String(rec.dokumen_kurang) : ''
  const diffRounded = Math.round(build.difference)

  const awbText = colOk('awb') && hasVal(rec.awb) ? String(rec.awb) : '—'
  const tabBtn = (active: boolean) =>
    `relative shrink-0 px-1 pt-1.5 pb-2 text-[12.5px] font-semibold border-b-2 transition-colors ${active ? 'border-[#6B3470] text-[#3B1B3D]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'}`

  const validationRow = (key: ValidationTabKey) => {
    const p = pct[key]
    return (
      <button key={key} type="button" onClick={() => setPopup(key)} data-validation-row={key}
        className="w-full flex items-start justify-between gap-3 px-3.5 py-3 border-b border-[#F6F0EB] text-left hover:bg-[#FBF6F9] focus-visible:outline-2 focus-visible:outline-[#6B3470] focus-visible:-outline-offset-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]">
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${validationDotClass(p)}`} />{VALIDATION_TAB_LABEL[key]}
          </div>
          {key === 'checklist' && missingDocs && (
            <div className="mt-1 ml-[15px] text-[11px] leading-snug text-[#A8231A] [overflow-wrap:anywhere]">Missing: {missingDocs}</div>
          )}
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-bold tabular-nums whitespace-nowrap ${pctTone(p)}`}>{p === null ? '—' : `${fmtValas(p)}%`}</span>
          <span className="text-[11px] font-semibold text-[#6B3470] inline-flex items-center whitespace-nowrap">View<ChevronRight size={12} /></span>
        </span>
      </button>
    )
  }

  const showValidationCard = validationTabs.length > 0 || colOk('cek_selisih')
  const popupTitle = popup ? `${VALIDATION_TAB_LABEL[popup]} · ${awbText}` : ''
  const popupSubtitle = popup === 'checklist' ? 'Document completeness' : popup === 'doc' ? 'The same field compared across the documents' : 'Invoice vs rate sheet'

  return (
    <>
      <div id="courier-audit-preview-print-area" className={`${SA_CARD} shadow-[0_6px_30px_rgba(59,27,61,0.10)] flex flex-col flex-1 min-h-0 overflow-hidden print:shadow-none print:border-0`} data-courier-preview={`${docType}-${rec.id}`}>
        {/* Header */}
        <div className="shrink-0 px-4 pt-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Chip tone={docType === 'CN' ? 'purple' : 'blue'} className="!text-[12px] !px-2.5 !py-1">{docType}</Chip>
            <h2 className="text-[17px] font-bold text-[#3B1B3D] leading-tight [overflow-wrap:anywhere]">{awbText}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 justify-end print:hidden">
            {canEditAudit && (
              <>
                <button type="button" onClick={onEdit} className={SA_BTN_OUTLINE}>Edit</button>
                {draft ? (
                  <button type="button" disabled={busy} onClick={() => onSetStatus('audited')} className={SA_BTN_GREEN}>{busy ? 'Saving…' : 'Mark as audited'}</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => onSetStatus('draft')} className={SA_BTN_OUTLINE}>{busy ? 'Saving…' : 'Move back to Draft'}</button>
                )}
                {canDelete && (
                  <button type="button" title="Delete this draft" onClick={onDelete}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl border border-[#F4C3BC] bg-white text-[#A8231A] text-xs font-semibold hover:bg-[#FDE7E4] transition-colors">Delete</button>
                )}
              </>
            )}
            <button type="button" onClick={() => window.print()} title="Print this preview" className={SA_BTN_OUTLINE}>
              <Printer size={14} /> Print
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close preview" className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F6EFEA] rounded-xl text-[#6E5E70] transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab */}
        <div className="shrink-0 flex items-end gap-5 px-4 mt-2 border-b border-[#EADFD6] print:hidden" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')} className={tabBtn(tab === 'overview')}>Overview</button>
          <button type="button" role="tab" aria-selected={tab === 'trail'} onClick={() => setTab('trail')} className={tabBtn(tab === 'trail')}>Audit trail</button>
        </div>

        {tab === 'trail' ? (
          <div className="flex-1 min-h-0 flex flex-col cvw-fill" role="tabpanel"><CourierAuditTrail rec={rec} docType={docType} /></div>
        ) : (
          <div className="@container flex-1 min-h-0 overflow-y-auto bg-[#FDFBFA] p-3.5 flex flex-col gap-3 cvw-fill" role="tabpanel">
            {rec.reaudit_reason && (
              <div className="rounded-xl border border-[#D9C7DA] bg-[#F5EDF3] px-3.5 py-2 text-[12.5px] font-semibold text-[#5B2E8C]">
                ↻ {rec.reaudit_reason} — please re-audit{rec.reaudit_at ? ` (${fmtDateShort(rec.reaudit_at)})` : ''}.
              </div>
            )}

            {/* Grid 2x2 SIMETRIS (revisi 2026-10-13, laporan user): kolom SAMA utk kedua baris (batas kiri/kanan sejajar), kartu satu baris sama
                tinggi (stretch): 1 | 2 di atas, 3 | 4 di bawah. Layar sempit: 1 kolom urutan 1-2-3-4. */}
            <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-3">
              <PreviewSection n={1} title="PO & Vendor"
                right={<>
                  {colOk('po_ori') ? `${lines.length} PO` : ''}{curLabel ? ` · ${curLabel}` : ''}
                  {canSplit && (
                    <span className="ml-2 inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F5EDF3] align-middle" role="tablist" aria-label="Amount per PO">
                      {([{ id: 'recorded', label: 'As recorded' }, { id: 'even', label: 'Split evenly' }] as const).map(t => (
                        <button key={t.id} type="button" role="tab" aria-selected={goodsView === t.id} onClick={() => setGoodsView(t.id)}
                          className={`px-2 h-6 rounded-md text-[10.5px] font-bold transition-colors ${goodsView === t.id ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D] hover:bg-white'}`}>{t.label}</button>
                      ))}
                    </span>
                  )}
                </>}>
                <div className="grid grid-cols-1 @md:grid-cols-2 border-b border-[#F3ECE6]">
                  <div className="px-3.5 py-2.5 min-w-0">
                    <div className={SA_LABEL}>Vendor</div>
                    <div className="text-[12.5px] font-medium text-[#3B1B3D] mt-0.5 [overflow-wrap:anywhere]">{colOk('vendor') && hasVal(rec.vendor) ? rec.vendor : <Dash />}</div>
                  </div>
                  <div className="px-3.5 py-2.5 min-w-0 @md:border-l border-[#F6F0EB]">
                    <div className={SA_LABEL}>Remarks</div>
                    <div className="text-[12.5px] font-medium text-[#3B1B3D] mt-0.5 [overflow-wrap:anywhere]">{colOk('remarks') && hasVal(rec.remarks) ? rec.remarks : <Dash />}</div>
                  </div>
                </div>
                {colOk('po_ori') && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px] min-w-[420px]">
                      <thead>
                        <tr className="bg-[#FBF7F4]">
                          <th className={`${SA_LABEL} text-left px-3.5 py-2`}>PO ORI</th>
                          <th className={`${SA_LABEL} text-left px-3 py-2`}>Vendor Inv No</th>
                          <th className={`${SA_LABEL} text-right px-3.5 py-2`}>Item Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr><td colSpan={3} className="px-3.5 py-3 text-[#8A7A8B] border-t border-[#F3ECE6]">No PO recorded</td></tr>
                        ) : lines.map((l, i) => {
                          const amt = courierPoAmount(l.amt)
                          const valas = useItemPriceForSinglePo ? fmtValas(rec.item_price)
                            : useEvenSplit ? fmtValas(evenValas[i])
                            : l.amt ? (amt !== null ? fmtValas(amt) : l.amt) : null
                          const idr = useItemPriceForSinglePo ? fmtRp(rec.item_price_idr)
                            : useEvenSplit ? (evenIdr.length ? `≈ ${fmtRp(evenIdr[i])}` : '—')
                            : amt !== null && goodsRate ? fmtRp(Math.round(amt * goodsRate)) : '—'
                          return (
                            <tr key={i} className="border-t border-[#F3ECE6]">
                              <td className="px-3.5 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{l.po || '—'}</td>
                              <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{colOk('vendor_inv_no') ? (l.inv || '—') : '—'}</td>
                              <td className="px-3.5 py-2 text-right tabular-nums whitespace-nowrap text-[#3B1B3D]">
                                {useEvenSplit && <Chip tone="grey" className="mr-1.5" title="Item price divided evenly — estimate, not saved">≈ split evenly</Chip>}
                                {valas === null ? '—' : `${curLabel ? `${curLabel} ` : ''}${valas}`}
                                {showIdr && <div className="text-[10.5px] text-[#6E5E70]">{idr}</div>}
                              </td>
                            </tr>
                          )
                        })}
                        {colOk('other_cost') && (
                          <tr className="border-t border-[#F3ECE6]">
                            <td colSpan={2} className="px-3.5 py-2 text-[#3B1B3D]">Other cost</td>
                            <td className="px-3.5 py-2 text-right tabular-nums whitespace-nowrap">{hasVal(rec.other_cost) ? `${curLabel ? `${curLabel} ` : ''}${fmtValas(rec.other_cost)}` : '—'}</td>
                          </tr>
                        )}
                        {colOk('item_price') && (
                          <tr className="border-t border-[#F3ECE6] bg-[#FBF7F4] font-bold">
                            <td colSpan={2} className="px-3.5 py-2 text-[#3B1B3D]">Total Item Price</td>
                            <td className="px-3.5 py-2 text-right tabular-nums whitespace-nowrap text-[#3B1B3D]">
                              {itemTotalValas === null ? '—' : `${curLabel ? `${curLabel} ` : ''}${fmtValas(itemTotalValas)}`}
                              {showIdr && <div className="text-[10.5px] font-semibold">{fmtRp(rec.item_price_idr)}</div>}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {useEvenSplit && (
                  <div className="mx-3.5 my-2 px-3 py-2 rounded-lg bg-[#F3EEEA] text-[#6E5E70] text-[11.5px]">
                    Estimate — Item price divided evenly across the POs (not saved).{noPerPoAmount ? ` Amount per PO is not recorded.${canEditAudit ? ' Fill in the real amounts via Edit › Goods per PO.' : ''}` : ' The recorded amounts are in the "As recorded" tab.'}
                  </div>
                )}
              </PreviewSection>

              <PreviewSection n={2} title="Shipment">
                {colOk('impor_an') && <LRow label="A/N">{hasVal(rec.impor_an) ? <>{ptName}{ptName !== String(rec.impor_an || '') && !ptName.includes(`(${rec.impor_an})`) ? <span className="text-[#8A7A8B] font-medium"> ({rec.impor_an})</span> : null}</> : <Dash />}</LRow>}
                {colOk('via') && <LRow label="Via">{hasVal(rec.via) ? String(rec.via).toUpperCase() : <Dash />}</LRow>}
                {colOk('delivery_term') && <LRow label="Delivery Term">{hasVal(rec.delivery_term) ? rec.delivery_term : <Dash />}</LRow>}
                {colOk(docNoKey) && <LRow label={`No. ${docType === 'CN' ? 'SPPBMCP' : 'PIB'}`}>{docNo ? docNo : <Dash />}</LRow>}
                {colOk('tgl_ppjk') && <LRow label="PPJK Date">{hasVal(rec.tgl_ppjk) ? fmtDateShort(rec.tgl_ppjk) : <Dash />}</LRow>}
                {colOk('no_sptnp') && <LRow label="No. SPTNP">{hasVal(rec.no_sptnp) ? rec.no_sptnp : <span className="text-[#B3A6AE] font-normal">None</span>}</LRow>}
                {colOk('tgl_sptnp') && <LRow label="SPTNP Date">{hasVal(rec.tgl_sptnp) ? fmtDateShort(rec.tgl_sptnp) : <Dash />}</LRow>}
                {colOk('hs_code') && (
                  <LRow label="HS Code">
                    {hsCodes.length === 0 ? <Dash /> : (
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {hsCodes.map((h, i) => <span key={i} className="font-mono text-[11.5px] bg-[#F3E8EF] text-[#3B1B3D] px-1.5 py-0.5 rounded-md">{h}</span>)}
                      </span>
                    )}
                  </LRow>
                )}
              </PreviewSection>

              <PreviewSection n={3} title="Customs Value & Duties" right={`As on the ${docType}`}>
                {(colOk('total_inv_freight') || colOk('total_inv_duty')) && (
                  <>
                    <GroupLabel>Invoice PPJK</GroupLabel>
                    {colOk('total_inv_freight') && <LRow label="Total Inv Freight">{hasVal(rec.total_inv_freight) ? fmtRp(rec.total_inv_freight) : <Dash />}</LRow>}
                    {colOk('total_inv_duty') && <LRow label="Total Inv Duty">{hasVal(rec.total_inv_duty) ? fmtRp(rec.total_inv_duty) : <Dash />}</LRow>}
                  </>
                )}
                {(colOk('valas_dpp') || colOk('kurs_ndpbm') || colOk('total_nilai_pabean')) && (
                  <>
                    <GroupLabel>Customs Value</GroupLabel>
                    {colOk('valas_dpp') && <LRow label="Valas DPP">{hasVal(rec.valas_dpp) ? `${curLabel && docType !== 'CN' ? `${curLabel} ` : ''}${fmtValas(rec.valas_dpp)}` : <Dash />}</LRow>}
                    {colOk('kurs_ndpbm') && <LRow label="Kurs NDPBM">{hasVal(rec.kurs_ndpbm) ? fmtValas(rec.kurs_ndpbm) : <Dash />}</LRow>}
                    {colOk('total_nilai_pabean') && <LRow label="Total Customs Value" tone="hl">{fmtRp(build.cv)}</LRow>}
                  </>
                )}
                {(colOk('bm') || colOk('ppn_nilai') || colOk('pph_nilai') || colOk('total_pib_cn')) && (
                  <>
                    <GroupLabel>Duties &amp; Taxes</GroupLabel>
                    {colOk('bm') && <LRow label={<>BM <small className="text-[10.5px] text-[#8A7A8B] ml-1">{rate('bm')}</small></>}>{fmtRp(rec.bm)}</LRow>}
                    {colOk('ppn_nilai') && <LRow label={<>PPN <small className="text-[10.5px] text-[#8A7A8B] ml-1">{rate('ppn')}</small></>}>{fmtRp(rec.ppn_nilai)}</LRow>}
                    {colOk('pph_nilai') && <LRow label={<>PPh <small className="text-[10.5px] text-[#8A7A8B] ml-1">{rate('pph')}</small></>}>{fmtRp(rec.pph_nilai)}</LRow>}
                    {colOk(docType === 'CN' ? 'sanksi_adm' : 'sptnp_total') && <LRow label="Admin penalty / SPTNP Total">{fmtRp(courierAdmOrSptnp(rec, docType))}</LRow>}
                    {colOk('total_pib_cn') && <LRow label={`Total ${docType}`} tone="total">{fmtRp(rec.total_pib_cn)}</LRow>}
                  </>
                )}
              </PreviewSection>

              {showValidationCard && (
                <PreviewSection n={4} title="Completeness & Validation">
                  {(['checklist', 'cost', 'doc'] as ValidationTabKey[]).filter(k => validationTabs.includes(k)).map(validationRow)}
                  {colOk('cek_selisih') && (
                    <div className="flex items-start justify-between gap-3 px-3.5 py-3" data-check-difference>
                      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]">
                        <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${diffRounded !== 0 ? 'bg-[#A8231A]' : 'bg-emerald-500'}`} />Check difference
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-bold tabular-nums whitespace-nowrap ${diffRounded !== 0 ? 'bg-[#FDE7E4] text-[#A8231A]' : 'bg-[#EAF6EF] text-[#17663D]'}`}>
                        {diffRounded !== 0 ? signedRp(diffRounded) : 'Rp 0'}
                      </span>
                    </div>
                  )}
                </PreviewSection>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Popup validasi -- komponen embedded LAMA (data, simpan & hak edit SAMA). Dipasang hanya selama popup terbuka. */}
      {popup && (
        <ValidationPopup title={popupTitle} subtitle={popupSubtitle} size={popup} onRequestClose={closePopup}>
          {popup === 'checklist' && access.checklist && renderChecklist({ onPctChange: onChecklistPct, onSaved: onChecklistSaved, onDirtyChange: onChecklistDirty })}
          {popup === 'doc' && access.doc && (
            <ValidasiModal record={rec} mainTab={mainTab} subTab={subTab} onClose={closePopup} canEdit={editAccess.doc} embedded variant="unified"
              onPctChange={onDocPct} onDirtyChange={onDocDirty} checklistVersion={checklistVersion} />
          )}
          {popup === 'cost' && access.cost && (
            <CostValidationModal awb={rec.awb} jenisDokumen={docType} docId={rec.id} rawRecord={rec} onClose={closePopup} canEdit={editAccess.cost} embedded
              onPctChange={onCostPct} onDirtyChange={onCostDirty} />
          )}
        </ValidationPopup>
      )}
    </>
  )
}
