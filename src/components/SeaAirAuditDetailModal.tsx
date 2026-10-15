// Jendela "Open" Audit PIB Sea & Air (2026-09-30). Semua angka pembanding (calculated, rounding,
// checks) MURNI hitungan tampilan dari kolom tersimpan -- tidak ada yang ditulis balik ke DB.
// Aksi tulis HANYA status (Mark as audited / Reopen as draft) lewat RPC lama `update_seaair_row`
// (dipanggil parent), Edit & Delete memakai form/modal masing-masing.
// 2026-10-14 (permintaan user): tab Overview | Audit trail (audit trail dulu kartu di bawah), kartu "Customs value (as recorded)" ditukar
// dgn "Goods per PO" (kiri: Document + Customs value; kanan: Goods per PO + Duties & taxes), kartu Checks disembunyikan default (tombol).
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Info, Pencil, Trash2, RotateCcw, ExternalLink, CheckCircle2, XCircle, Circle, Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, StatusPill, SectionCard, type Tone } from './SeaAirAuditUi'
import {
  fmtRp, fmtValas, fmtDateShort, formatNoAju, buildGoodsLines, parseLooseNumber,
  computeCustomsBuildUp, computeDutyRows, isSeaAirDraft, companyFullName, fetchSeaAirAuditLog, fetchSeaAirAuditLinkInfo, markAuditedBlocker,
  VALIDATION_META, validationLabel, type SeaAirAuditLinkInfo, type SeaAirAuditLogEntry,
} from '../utils/SeaAirAuditHelpers'
import { poManualFor, type PoManualEntry } from '../utils/SeaAirRecapHelpers'
import { compareSeaAirDuty, fetchSeaAirDutyMatrix } from '../utils/SeaAirAuditHelpers'
import SeaAirDutyCompareTable from './SeaAirDutyCompareTable'
import SeaAirActivityTrail from './SeaAirActivityTrail'

// Audit trail: tampilan SAMA Invoice Recap (SeaAirActivityTrail, 2026-10-14) -- versi ringkas lama (mergeTrail ×N + Show all) dihapus.

const fmtDateTime = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return `${fmtDateShort(v)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px]">
    <div className="text-[#6E5E70]">{label}</div>
    <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</div>
  </div>
)

// Nomor PO + chip Partial dari Invoice Recap (rekapan_seaair.po_manual, sql/031).
const PoWithPartial: React.FC<{ po: string; map: Record<string, PoManualEntry> }> = ({ po, map }) => {
  const m = poManualFor(map, po)
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {po || '—'}
      {m?.partial && <Chip tone="amber" title="Partial shipment of this PO (entered in Invoice Recap)">◐ Partial{m.partial_no ? ` ${m.partial_no}` : ''}{m.valas != null ? ` · ${m.currency || ''} ${fmtValas(m.valas)}` : ''}</Chip>}
    </span>
  )
}

const CheckRow: React.FC<{ ok: boolean | null; label: string; hint?: string }> = ({ ok, label, hint }) => (
  <div className="flex items-start gap-2 py-1.5 text-[12.5px]">
    {ok === true ? <CheckCircle2 size={15} className="text-[#17663D] shrink-0 mt-[1px]" />
      : ok === false ? <XCircle size={15} className="text-[#A8231A] shrink-0 mt-[1px]" />
      : <Circle size={15} className="text-[#B7A9B8] shrink-0 mt-[1px]" />}
    <div className="min-w-0">
      <div className="text-[#3B1B3D] font-medium">{label}</div>
      {hint && <div className="text-[11px] text-[#8A7A8B]">{hint}</div>}
    </div>
  </div>
)

export default function SeaAirAuditDetailModal({
  rec, info: infoProp, companyNames, canEdit, onClose, onEdit, onDelete, onSetStatus, onOpenRecap, onReread, variant = 'modal', onToggleVariant,
}: {
  rec: any
  info?: SeaAirAuditLinkInfo
  companyNames: Record<string, string>
  canEdit: boolean
  onClose: () => void
  onEdit: (rec: any) => void
  onDelete: (rec: any) => void
  onSetStatus: (rec: any, status: 'ARCHIVED' | 'LENGKAP') => Promise<boolean>
  onOpenRecap: (rec: any) => void
  onReread: (rec: any) => Promise<boolean>
  // 'panel' = dirender di dalam halaman (panel kanan daftar kartu, 2026-10-13, sama Invoice Recap); 'modal' = jendela penuh (portal).
  // `onToggleVariant` = tombol Expand (panel -> modal) / Collapse (modal -> panel).
  variant?: 'modal' | 'panel'
  onToggleVariant?: () => void
}) {
  const isPanel = variant === 'panel'
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'overview' | 'trail'>('overview')
  const [showChecks, setShowChecks] = useState(false)
  const checksRef = useRef<HTMLDivElement>(null)
  // Checks dibuka -> gulir area isi ke kartu Checks (isi langsung terlihat).
  useEffect(() => {
    if (!showChecks) return
    const t = setTimeout(() => checksRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 30)
    return () => clearTimeout(t)
  }, [showChecks])
  const [log, setLog] = useState<SeaAirAuditLogEntry[] | null>(null)
  // Info validasi dari parent (baris di halaman aktif); kalau tidak ada (mis. baris pindah tab
  // setelah ubah status) diambil sendiri.
  const [ownInfo, setOwnInfo] = useState<SeaAirAuditLinkInfo | undefined>(undefined)
  const info = infoProp ?? ownInfo
  useEffect(() => {
    if (infoProp || !rec?.id) return
    let cancelled = false
    fetchSeaAirAuditLinkInfo([rec.id]).then(m => { if (!cancelled) setOwnInfo(m[String(rec.id)]) })
    return () => { cancelled = true }
  }, [infoProp, rec?.id])
  const draft = isSeaAirDraft(rec)
  const build = computeCustomsBuildUp(rec)
  const duty = computeDutyRows(rec)
  // Kartu "Duties & taxes" = rumus & data tab Documents › Duty Invoice Recap (2026-10-05, permintaan user).
  const [dutyMatrix, setDutyMatrix] = useState<any | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setDutyMatrix(undefined)
    fetchSeaAirDutyMatrix(rec?.id).then(m => { if (!cancelled) setDutyMatrix(m) })
    return () => { cancelled = true }
  }, [rec?.id])
  const dutyCmp = compareSeaAirDuty(dutyMatrix ?? null, rec)
  const lines = buildGoodsLines(rec)
  const cur = String(rec.kurs || '').trim()
  const curLabel = cur && !/^[0-9.,\s]+$/.test(cur) ? cur.toUpperCase() : ''
  const ptName = companyFullName(companyNames, rec.impor_an)

  useEffect(() => {
    let cancelled = false
    setLog(null)
    fetchSeaAirAuditLog(rec).then(entries => { if (!cancelled) setLog(entries) })
    return () => { cancelled = true }
  }, [rec?.id, rec?.awb, rec?.no_aju, rec?.created_at])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setStatus = async (status: 'ARCHIVED' | 'LENGKAP') => {
    setBusy(true)
    await onSetStatus(rec, status)
    setBusy(false)
  }

  // Gerbang "Mark as audited" (sql/031): issue Invoice Recap harus 0 (dikonfirmasi Admin).
  const auditBlocker = markAuditedBlocker(info)
  const reread = async () => {
    if (!window.confirm('Replace the edited PIB values with the values read by AI from the uploaded documents?\nNotes are kept. This is recorded in the audit trail.')) return
    setBusy(true)
    await onReread(rec)
    setBusy(false)
  }
  const poManualMap = info?.recapPoManual || {}

  // ── Kotak validasi ──
  const vState = info?.validation
  const vTone: Tone = vState ? VALIDATION_META[vState].tone : 'grey'
  const vBox: Record<string, string> = {
    green: 'bg-[#EAF6EF] border-[#BFE3CD]',
    red: 'bg-[#FDE7E4] border-[#F4C3BC]',
    grey: 'bg-[#F6F1EE] border-[#EADFD6]',
  }
  const vIcon = vTone === 'green' ? <Check size={18} /> : vTone === 'red' ? <AlertTriangle size={17} /> : <Info size={17} />
  const vIconBg = vTone === 'green' ? 'bg-[#17663D] text-white' : vTone === 'red' ? 'bg-[#A8231A] text-white' : 'bg-[#D9CFD6] text-[#3B1B3D]'
  const vTitleColor = vTone === 'green' ? 'text-[#17663D]' : vTone === 'red' ? 'text-[#A8231A]' : 'text-[#3B1B3D]'

  // ── Goods per PO ──
  const lineRate = build.goodsRate ?? (build.kursNdpbm || null)
  const goodsLineTotal = lines.reduce((s, l) => s + (parseLooseNumber(l.amt) ?? 0), 0)
  // Kolom Valas per PO dibaca dari `po_harga_detail` (PO Price Detail). Kalau kolom itu kosong,
  // tidak ada nilai per PO di DB (hanya total `item_price`/`item_price_idr`).
  const noPerPoAmount = lines.length > 0 && lines.every(l => parseLooseNumber(l.amt) === null)
  const hasItemPrice = rec.item_price !== null && rec.item_price !== undefined && rec.item_price !== ''
  const useItemPriceForSinglePo = noPerPoAmount && lines.length === 1 && hasItemPrice
  // >1 PO: nilai per PO = PO Price Detail APA ADANYA. Tab "As recorded | Split evenly" (estimasi bagi
  // rata, 2026-09-30) DIHAPUS 2026-10-05 atas permintaan user -- isi nilai asli lewat Edit › Goods per PO
  // (tombol "Split evenly" di form Edit tetap ada & benar-benar menyimpan).

  // ── Checks ──
  const checks: { group: string; ok: boolean | null; label: string; hint?: string }[] = [
    { group: 'Customs value', ok: build.cvCalcMatches, label: 'Customs value = Valas DPP × Kurs NDPBM', hint: build.cvCalcMatches ? undefined : `Valas DPP × Kurs NDPBM = ${fmtRp(Math.round(build.cvCalc))}` },
    { group: 'Customs value', ok: build.isRounding, label: 'Customs value = goods + freight + insurance', hint: build.isRounding ? undefined : `Unexplained balance ${fmtRp(Math.round(build.residual))}` },
    { group: 'Customs value', ok: duty.importValueMatches, label: 'Import value = customs value + BM', hint: duty.importValueMatches === false ? `Customs value + BM = ${fmtRp(duty.importValueCalc)}` : duty.importValueMatches === null ? 'Import value not filled in' : undefined },
    { group: 'Customs value', ok: duty.totalMatches, label: 'Total PIB = BM + PPN + PPh', hint: duty.totalMatches ? undefined : `BM + PPN + PPh = ${fmtRp(duty.sumOnPib)}` },
    { group: 'Links & validation', ok: info ? info.rekapanId !== null : null, label: 'Linked to Invoice Recap (same shipment)' },
    { group: 'Links & validation', ok: info ? info.validation === 'validated' : null, label: 'Validated in Invoice Recap (Doc Validation · PIB matrix)', hint: info?.validation === 'differences' ? `Differences: ${info.diffFields.join(', ')}` : undefined },
  ]
  const passed = checks.filter(c => c.ok === true).length
  const counted = checks.filter(c => c.ok !== null).length

  const freightLabel = build.isCif || build.term.startsWith('CFR') || build.term.startsWith('C&F')
    ? `Freight · ${build.term || '—'}${build.freight === 0 ? ' — already in the goods price' : ''}`
    : `Freight · ${build.term || '—'} — total invoice freight`
  const insuranceLabel = build.isCif ? 'Insurance · CIF — included in the price' : 'Insurance · 0,5% × (freight + goods value)'

  const hasSptnp = !!(rec.no_sptnp || rec.tgl_sptnp || rec.sptnp_total)

  // Tombol header ringkas di panel; label Edit / Re-read disembunyikan bila panel sempit (container < @5xl, mis. laptop 14").
  const btnSm = isPanel ? ' !h-8 !px-2.5' : ''
  const btnLabel = isPanel ? 'hidden @5xl:inline' : ''

  const content = (
      <div className={isPanel
        ? '@container bg-white rounded-2xl shadow-sm border border-[#EADFD6] w-full flex-1 min-h-0 flex flex-col overflow-hidden'
        : '@container bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden'} data-audit-detail={variant}>
        {/* Header. Panel (2026-10-15, permintaan user: di laptop 14" tombol header memakan tempat sampai isi tidak terlihat): ringkas --
            padding/judul lebih kecil, tombol h-8, Edit & Re-read jadi ikon saja bila panel sempit (< @5xl), aksi rata kanan. */}
        {/* Panel: SELALU 1 baris (2026-10-15, laporan user 14") -- tanpa wrap; aksi `shrink-0`, Mark as audited/Edit/Re-read ikon saja
            bila panel < @5xl; nomor PIB dipotong "…" hanya bila tetap tidak muat. Jendela penuh tetap boleh wrap. */}
        <div className={`flex items-start justify-between border-b border-[#EADFD6] shrink-0 ${isPanel ? 'flex-nowrap gap-x-3 px-4 py-2.5' : 'flex-wrap gap-3 px-5 py-4'}`}>
          <div className={isPanel ? 'min-w-0 flex-1' : 'min-w-[min(340px,100%)] flex-1'}>
            {/* Nomor PIB + chip Draft/Audited SELALU 1 baris (2026-10-15, laporan user: di 14" chip Draft turun ke bawah) -- nomor
                dipotong "…" bila benar-benar tidak muat (title = nomor lengkap); chip re-audit / duplikat di baris berikutnya bila ada. */}
            <div className="flex items-center gap-2 min-w-0">
              <h2 className={`${isPanel ? 'text-[16px]' : 'text-[18px]'} font-bold text-[#3B1B3D] tabular-nums truncate min-w-0`} title={formatNoAju(rec.no_aju) || undefined}>{formatNoAju(rec.no_aju) || '—'}</h2>
              <span className="shrink-0"><StatusPill draft={draft} /></span>
            </div>
            {((draft && rec.reaudit_reason) || rec.duplicate_of) && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {draft && rec.reaudit_reason && <Chip tone="purple" title={rec.reaudit_reason}>↻ Changed in Invoice Recap — please re-audit</Chip>}
                {rec.duplicate_of && <Chip tone="red" title="Another PIB with the same BL / AWB already exists">Possible duplicate upload</Chip>}
              </div>
            )}
            {/* Baris "tgl PPJK · via · term · PT" di bawah nomor PIB DIHAPUS 2026-10-15 (permintaan user) -- isinya ada di kartu Document. */}
          </div>
          <div className={`flex items-center justify-end ${isPanel ? 'flex-nowrap shrink-0 gap-1.5' : 'flex-wrap gap-2'}`}>
            <div className={`text-right ${isPanel ? 'mr-1' : 'mr-2'}`}>
              <div className={SA_LABEL}>Total PIB</div>
              <div className={`${isPanel ? 'text-[17px]' : 'text-[20px]'} font-bold text-[#3B1B3D] tabular-nums leading-tight whitespace-nowrap`}>{fmtRp(rec.total_pib)}</div>
            </div>
            {canEdit && draft && (
              <button type="button" className={`${SA_BTN_OUTLINE}${btnSm}`} onClick={() => onEdit(rec)} title="Edit" aria-label="Edit"><Pencil size={13} /> <span className={btnLabel}>Edit</span></button>
            )}
            {canEdit && draft && rec.ai_snapshot_at && (
              <button type="button" className={`${SA_BTN_OUTLINE}${btnSm}`} disabled={busy} onClick={reread} aria-label="Re-read from AI" title={`Re-read from AI — restore the PIB values read by AI (${fmtDateShort(rec.ai_snapshot_at)})`}>
                <RotateCcw size={13} /> <span className={btnLabel}>Re-read from AI</span>
              </button>
            )}
            {canEdit && draft && (
              <button type="button" className={`${SA_BTN_GREEN}${btnSm}`} disabled={busy || !!auditBlocker} onClick={() => setStatus('LENGKAP')}
                aria-label="Mark as audited" title={auditBlocker ? `${auditBlocker} — the PIB can be marked as audited once Invoice Recap is ready to submit.` : 'Mark as audited'}>
                {isPanel && <CheckCircle2 size={14} className="@5xl:hidden" />}<span className={btnLabel}>{busy ? 'Saving…' : 'Mark as audited'}</span>
              </button>
            )}
            {canEdit && !draft && (
              <button type="button" className={`${SA_BTN_OUTLINE}${btnSm}`} disabled={busy} onClick={() => setStatus('ARCHIVED')}>
                <RotateCcw size={13} /> {busy ? 'Saving…' : 'Reopen as draft'}
              </button>
            )}
            {canEdit && draft && (
              <button type="button" title="Delete this draft PIB" onClick={() => onDelete(rec)}
                className={`inline-flex items-center justify-center ${isPanel ? 'h-8 w-8' : 'h-9 w-9'} rounded-xl border border-[#F4C3BC] text-[#A8231A] hover:bg-[#FDE7E4] transition-colors`}>
                <Trash2 size={14} />
              </button>
            )}
            {onToggleVariant && (
              <button type="button" onClick={onToggleVariant} aria-label={isPanel ? 'Expand to full window' : 'Collapse to side panel'} title={isPanel ? 'Expand to full window' : 'Collapse to side panel'}
                className={`inline-flex items-center justify-center ${isPanel ? 'h-8 w-8' : 'h-9 w-9'} rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]`} data-variant-toggle>
                {isPanel ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className={`inline-flex items-center justify-center ${isPanel ? 'h-8 w-8' : 'h-9 w-9'} rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]`}>
              <X size={18} />
            </button>
          </div>
        </div>
        {/* Tab Overview | Audit trail (2026-10-14, permintaan user). Warna ungu muda SAMA tab Invoice Recap Sea & Air (2026-10-15, permintaan user). */}
        <div className={`flex items-end gap-1.5 border-b border-[#EADFD6] shrink-0 ${isPanel ? 'px-4 pt-1.5' : 'px-5 pt-2'}`} role="tablist">
          {([['overview', 'Overview'], ['trail', `Audit trail${log && log.length ? ` (${log.length})` : ''}`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`shrink-0 px-3 ${isPanel ? 'pt-1 pb-1' : 'pt-1.5 pb-1.5'} rounded-t-lg text-[12.5px] font-semibold border-b-[3px] transition-colors ${tab === k ? 'bg-white text-[#3B1B3D] border-[#6B3470] font-bold' : 'bg-[#F5EDF3] text-[#5A305A] border-transparent hover:bg-[#EADBE7]'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={`flex-1 overflow-y-auto bg-[#FBF7F4] flex flex-col ${isPanel ? 'p-3 gap-2.5' : 'p-4 gap-3'}`}>
          {tab === 'overview' && <>
          {draft && rec.reaudit_reason && (
            <div className="rounded-[14px] border border-[#D9C2EA] bg-[#F3ECF9] px-4 py-2.5 text-[12.5px] text-[#5B2E8C]">
              <b>↻ Changed in Invoice Recap — please re-audit.</b> {rec.reaudit_reason}{rec.reaudit_at ? ` · ${fmtDateTime(rec.reaudit_at)}` : ''}
            </div>
          )}
          {draft && canEdit && auditBlocker && (
            <div className="rounded-[14px] border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2.5 text-[12.5px] text-[#7A4F00]">
              <b>Mark as audited is locked:</b> {auditBlocker} — the PIB can be marked as audited once Invoice Recap is ready to submit to Finance.
              {info?.recapIssues?.length ? <div className="mt-0.5 text-[12px]">{info.recapIssues.map(i => `• ${i.text}`).join('  ')}</div> : null}
            </div>
          )}
          {/* Validasi */}
          <div className={`rounded-[14px] border px-4 py-3 flex flex-wrap items-center gap-3 ${vBox[vTone] || vBox.grey}`}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${vIconBg}`}>{vIcon}</span>
            <div className="flex-1 min-w-[220px]">
              <div className={`text-[14px] font-bold ${vTitleColor}`}>{validationLabel(info)}</div>
              <div className="text-[11.5px] text-[#6E5E70]">
                {vState ? VALIDATION_META[vState].sub : 'Checking Invoice Recap…'}
                {rec.awb ? ` · BL ${rec.awb}` : ''}
              </div>
              {info?.validation === 'differences' && (
                <div className="text-[11.5px] text-[#A8231A] mt-0.5">Fields: {info.diffFields.join(', ')}</div>
              )}
              <div className="text-[11px] text-[#8A7A8B] mt-0.5">Audit only records the PIB — customs value and BM / PPN / PPh are checked in Invoice Recap › Doc Validation.</div>
            </div>
            {(info?.rekapanId !== null && info?.rekapanId !== undefined) || rec.awb ? (
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => onOpenRecap(rec)}>
                Open in Invoice Recap <ExternalLink size={12} />
              </button>
            ) : null}
          </div>

          {/* Susunan Overview (revisi 2026-10-15, sketsa user): kiri Document (setinggi 2 panel kanan), kanan Customs value di atas
              Duty Tax, lalu Goods per PO lebar penuh di bawah. Panel sempit (< @3xl) = 1 kolom berurutan. Judul "Customs value (as recorded)"
              -> "Customs value", "Duties & taxes" -> "Duty Tax" (subjudul, Import value & keterangan rumus/NDPBM dihapus). */}
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3">
              <SectionCard title="Document" bodyClassName="px-4 pb-3">
                <Fact label="PIB no.">{formatNoAju(rec.no_aju) || '—'}</Fact>
                <Fact label="PIB date">{fmtDateShort(rec.tgl_ppjk)}</Fact>
                <Fact label="Via · delivery term">{rec.via || '—'} · {rec.delivery_term || '—'}</Fact>
                <Fact label="BL / AWB">{rec.awb || '—'}</Fact>
                <Fact label="Importer">{ptName}{ptName !== String(rec.impor_an || '') && rec.impor_an ? <span className="text-[#8A7A8B] font-medium"> ({rec.impor_an})</span> : null}</Fact>
                <Fact label="Supplier">{rec.vendor || '—'}</Fact>
                <Fact label="HS code">{rec.hs_code || '—'}</Fact>
                <Fact label="Document type">{rec.jenis_dokumen || '—'}</Fact>
                <Fact label="Remarks">{rec.remarks || '—'}</Fact>
                <Fact label="SPTNP">
                  {hasSptnp ? `${rec.no_sptnp || '—'} · ${fmtDateShort(rec.tgl_sptnp)} · ${fmtRp(rec.sptnp_total)}` : 'None'}
                </Fact>
                <Fact label="Notes"><span className="whitespace-pre-wrap font-medium">{rec.notes || '—'}</span></Fact>
              </SectionCard>

          <div className="flex flex-col gap-3 min-w-0">
            <SectionCard title="Customs value" right={<>Balance <b className="text-[#3B1B3D] tabular-nums">{fmtRp(build.balance)}</b></>} bodyClassName="px-4 pb-3">
              <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="text-[#3B1B3D]">Goods value{build.goodsRate ? <> ({curLabel ? `${curLabel} ` : ''}{fmtValas(build.goodsValas)} × <b className="font-bold" data-goods-rate>{fmtValas(Math.round(build.goodsRate * 100) / 100)}</b>)</> : ''}</span>
                <span className="font-semibold tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtRp(build.goodsIdr)}</span>
              </div>
              <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="text-[#3B1B3D]">{freightLabel}</span>
                <span className="font-semibold tabular-nums text-[#6E5E70] whitespace-nowrap">{fmtRp(build.freight)}</span>
              </div>
              <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="text-[#3B1B3D]">{insuranceLabel}</span>
                <span className="font-semibold tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtRp(build.insurance)}</span>
              </div>
              <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                <span className={build.isRounding ? 'text-[#3B1B3D]' : 'text-[#A8231A] font-semibold'}>{build.isRounding ? 'Rounding' : 'Unexplained balance'}</span>
                <span className={`font-semibold tabular-nums whitespace-nowrap ${build.isRounding ? 'text-[#6E5E70]' : 'text-[#A8231A]'}`}>{fmtRp(Math.round(build.residual * 100) / 100)}</span>
              </div>
              <div className="flex justify-between gap-3 pt-2.5 mt-1 border-t border-[#EADFD6]">
                <div>
                  <div className="text-[13.5px] font-bold text-[#3B1B3D]">Customs value (CIF)</div>
                  <div className="text-[11px] text-[#8A7A8B]">{curLabel ? `${curLabel} ` : ''}{fmtValas(build.valasDpp)} (valas DPP) × {fmtValas(build.kursNdpbm)} (kurs NDPBM)</div>
                </div>
                <div className="text-[16px] font-bold tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtRp(build.cv)}</div>
              </div>
            </SectionCard>
            <SectionCard title="Duty Tax" bodyClassName="pb-0">
              <SeaAirDutyCompareTable cmp={dutyCmp} loading={dutyMatrix === undefined} hideIntro />
            </SectionCard>
          </div>
          </div>

              <SectionCard
                title="Goods per PO"
                right={<span className="tabular-nums">{curLabel ? `${curLabel} ` : ''}{fmtValas(rec.item_price)} · {fmtRp(rec.item_price_idr)}</span>}
                bodyClassName="pb-2"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] min-w-[440px]">
                    <thead>
                      <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                        <th className={`${SA_LABEL} text-left px-4 py-2`}>PO</th>
                        <th className={`${SA_LABEL} text-left px-3 py-2`}>Vendor invoice</th>
                        <th className={`${SA_LABEL} text-right px-3 py-2`}>Valas</th>
                        <th className={`${SA_LABEL} text-right px-4 py-2`}>IDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-3 text-[#8A7A8B]">No PO recorded</td></tr>
                      ) : lines.map((l, i) => {
                        const amt = parseLooseNumber(l.amt)
                        // PO Price Detail kosong & cuma 1 PO -> nilai PO = total barang (Item price
                        // valas/Rp), pasti benar krn tidak ada PO lain. >1 PO -> PO Price Detail apa adanya.
                        if (useItemPriceForSinglePo) {
                          return (
                            <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0">
                              <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]"><PoWithPartial po={l.po} map={poManualMap} /></td>
                              <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{l.inv || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#3B1B3D] whitespace-nowrap" title="From Item price (valas) — only one PO on this PIB">{curLabel ? `${curLabel} ` : ''}{fmtValas(rec.item_price)}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap" title="From Item price (Rp)">{fmtRp(rec.item_price_idr)}</td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0">
                            <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]"><PoWithPartial po={l.po} map={poManualMap} /></td>
                            <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{l.inv || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#3B1B3D] whitespace-nowrap">{l.amt ? `${curLabel ? `${curLabel} ` : ''}${amt !== null ? fmtValas(amt) : l.amt}` : '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap">{amt !== null && lineRate ? fmtRp(Math.round(amt * lineRate)) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {noPerPoAmount && lines.length > 1 && (
                  <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-[#FFF1D6] text-[#7A4F00] text-[11.5px]">
                    Amount per PO is not recorded (PO Price Detail is empty) — only the total below is available.
                    {canEdit && draft ? ' Fill in the real amounts via Edit › Goods per PO.' : ''}
                  </div>
                )}
                <div className="px-4 pt-2 text-[11.5px] text-[#6E5E70] flex flex-col gap-0.5">
                  {lines.length > 1 && !noPerPoAmount && <div className="flex justify-between"><span>Sum of PO lines</span><span className="tabular-nums">{curLabel ? `${curLabel} ` : ''}{fmtValas(goodsLineTotal)}</span></div>}
                  <div className="flex justify-between"><span>Item price (valas)</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtValas(rec.item_price)}</span></div>
                  <div className="flex justify-between"><span>Other cost</span><span className="tabular-nums">{fmtValas(rec.other_cost)}</span></div>
                  <div className="flex justify-between"><span>Item price (Rp)</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(rec.item_price_idr)}</span></div>
                </div>
              </SectionCard>

          {/* Checks -- disembunyikan default (2026-10-14). 2026-10-15 (permintaan user): bar SELEBAR PANEL; dibuka -> isi tampil langsung di
              bawah bar dalam kartu yang sama & area isi di-scroll ke kartu ini (tidak perlu scroll manual). */}
          <div ref={checksRef} className="shrink-0 bg-white rounded-[14px] border border-[#EADFD6] shadow-[0_1px_2px_rgba(59,27,61,0.04)] overflow-hidden" data-checks-card>
            <button type="button" onClick={() => setShowChecks(v => !v)} aria-expanded={showChecks} data-toggle-checks
              className="w-full flex items-center gap-2 px-4 h-10 text-left text-[12.5px] font-semibold text-[#3B1B3D] hover:bg-[#FBF7F4]">
              {showChecks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{showChecks ? 'Hide checks' : 'Show checks'}</span>
              <span className="ml-auto text-[#6E5E70] font-normal"><b className="tabular-nums text-[#3B1B3D]">{passed}</b> of {counted} checks passed</span>
            </button>
            {showChecks && (
              <div className="px-4 pb-3 pt-1 border-t border-[#F1E8E1] grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {['Customs value', 'Links & validation'].map(g => (
                  <div key={g}>
                    <div className={`${SA_LABEL} pt-2 pb-0.5`}>{g}</div>
                    {checks.filter(c => c.group === g).map((c, i) => <CheckRow key={i} ok={c.ok} label={c.label} hint={c.hint} />)}
                  </div>
                ))}
              </div>
            )}
          </div>

          </>}
          {/* Audit trail -- tab sendiri; tampilan SAMA tab Audit trail Invoice Recap (SeaAirActivityTrail, 2026-10-14, permintaan user).
              Entri Audit PIB = verb dari `what` (Created/Updated/Deleted/Recorded), tanpa chip modul (semua dari tabel PIB ini). */}
          {tab === 'trail' && <SeaAirActivityTrail log={log ? log.map(e => ({ ...e, verb: String(e.what || '').toLowerCase() })) : null} />}
        </div>
      </div>
  )
  if (isPanel) return content
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      {content}
    </div>,
    document.body
  )
}
