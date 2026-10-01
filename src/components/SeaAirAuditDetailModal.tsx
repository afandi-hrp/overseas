// Jendela "Open" Audit PIB Sea & Air (2026-09-30). Semua angka pembanding (calculated, rounding,
// checks) MURNI hitungan tampilan dari kolom tersimpan -- tidak ada yang ditulis balik ke DB.
// Aksi tulis HANYA status (Mark as audited / Reopen as draft) lewat RPC lama `update_seaair_row`
// (dipanggil parent), Edit & Delete memakai form/modal masing-masing.
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Info, Pencil, Trash2, RotateCcw, ExternalLink, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, StatusPill, SectionCard, type Tone } from './SeaAirAuditUi'
import {
  fmtRp, fmtValas, fmtDateShort, fmtPctShort, formatNoAju, buildGoodsLines, parseLooseNumber, splitMoneyEvenly,
  computeCustomsBuildUp, computeDutyRows, isSeaAirDraft, companyFullName, fetchSeaAirAuditLog, fetchSeaAirAuditLinkInfo, markAuditedBlocker,
  VALIDATION_META, validationLabel, type SeaAirAuditLinkInfo, type SeaAirAuditLogEntry,
} from '../utils/SeaAirAuditHelpers'
import { poManualFor, type PoManualEntry } from '../utils/SeaAirRecapHelpers'

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
  rec, info: infoProp, companyNames, canEdit, onClose, onEdit, onDelete, onSetStatus, onOpenRecap, onReread,
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
}) {
  const [busy, setBusy] = useState(false)
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
  const hasItemPriceIdr = rec.item_price_idr !== null && rec.item_price_idr !== undefined && rec.item_price_idr !== ''
  const useItemPriceForSinglePo = noPerPoAmount && lines.length === 1 && hasItemPrice
  // >1 PO: 2 tab (keputusan user 2026-09-30) -- "As recorded" (po_harga_detail apa adanya) &
  // "Split evenly" (Item price dibagi rata, HANYA tampilan, chip "≈ split evenly", TIDAK disimpan).
  // Tab awal: Split evenly kalau PO Price Detail kosong, selain itu As recorded.
  const canSplit = lines.length > 1 && hasItemPrice
  const defaultGoodsView: 'recorded' | 'even' = canSplit && noPerPoAmount ? 'even' : 'recorded'
  const [goodsView, setGoodsView] = useState<'recorded' | 'even'>(defaultGoodsView)
  useEffect(() => { setGoodsView(defaultGoodsView) }, [rec?.id, defaultGoodsView])
  const useEvenSplit = canSplit && goodsView === 'even'
  const evenValas = canSplit ? splitMoneyEvenly(Number(rec.item_price) || 0, lines.length, 2) : []
  const evenIdr = canSplit && hasItemPriceIdr ? splitMoneyEvenly(Number(rec.item_price_idr) || 0, lines.length, 0) : []

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

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-[#EADFD6] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-bold text-[#3B1B3D] tabular-nums [overflow-wrap:anywhere]">{formatNoAju(rec.no_aju) || '—'}</h2>
              <StatusPill draft={draft} />
              {draft && rec.reaudit_reason && <Chip tone="purple" title={rec.reaudit_reason}>↻ Changed in Invoice Recap — please re-audit</Chip>}
              {rec.duplicate_of && <Chip tone="red" title="Another PIB with the same BL / AWB already exists">Possible duplicate upload</Chip>}
            </div>
            <div className="text-[12px] text-[#6E5E70] mt-0.5">
              {fmtDateShort(rec.tgl_ppjk)} · {rec.via || '—'} · {rec.delivery_term || '—'} · {ptName}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="text-right mr-2">
              <div className={SA_LABEL}>Total PIB</div>
              <div className="text-[20px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(rec.total_pib)}</div>
            </div>
            {canEdit && draft && (
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => onEdit(rec)}><Pencil size={13} /> Edit</button>
            )}
            {canEdit && draft && rec.ai_snapshot_at && (
              <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={reread} title={`Restore the PIB values read by AI (${fmtDateShort(rec.ai_snapshot_at)})`}>
                <RotateCcw size={13} /> Re-read from AI
              </button>
            )}
            {canEdit && draft && (
              <button type="button" className={SA_BTN_GREEN} disabled={busy || !!auditBlocker} onClick={() => setStatus('LENGKAP')}
                title={auditBlocker ? `${auditBlocker} — the PIB can be marked as audited once Invoice Recap is ready to submit.` : undefined}>
                {busy ? 'Saving…' : 'Mark as audited'}
              </button>
            )}
            {canEdit && !draft && (
              <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={() => setStatus('ARCHIVED')}>
                <RotateCcw size={13} /> {busy ? 'Saving…' : 'Reopen as draft'}
              </button>
            )}
            {canEdit && draft && (
              <button type="button" title="Delete this draft PIB" onClick={() => onDelete(rec)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[#F4C3BC] text-[#A8231A] hover:bg-[#FDE7E4] transition-colors">
                <Trash2 size={14} />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Kiri */}
            <div className="flex flex-col gap-3 min-w-0">
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

              <SectionCard
                title="Goods per PO"
                right={<span className="tabular-nums">{curLabel ? `${curLabel} ` : ''}{fmtValas(rec.item_price)} · {fmtRp(rec.item_price_idr)}</span>}
                bodyClassName="pb-2"
              >
                {canSplit && (
                  <div className="px-4 pb-2">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Amount per PO">
                      {([
                        { id: 'recorded', label: 'As recorded' },
                        { id: 'even', label: 'Split evenly' },
                      ] as const).map(t => (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={goodsView === t.id}
                          onClick={() => setGoodsView(t.id)}
                          className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${goodsView === t.id ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                        // valas/Rp), pasti benar krn tidak ada PO lain. >1 PO -> ikut tab aktif.
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
                        if (useEvenSplit) {
                          const tip = `Item price divided evenly across ${lines.length} POs — estimate, not saved`
                          return (
                            <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0">
                              <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]"><PoWithPartial po={l.po} map={poManualMap} /></td>
                              <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{l.inv || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap" title={tip}>
                                <span className="inline-flex items-center gap-1.5 justify-end">
                                  <Chip tone="grey" title={tip}>≈ split evenly</Chip>
                                  {curLabel ? `${curLabel} ` : ''}{fmtValas(evenValas[i])}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-[#8A7A8B] whitespace-nowrap" title={tip}>{evenIdr.length ? `≈ ${fmtRp(evenIdr[i])}` : '—'}</td>
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
                {useEvenSplit ? (
                  <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-[#F3EEEA] text-[#6E5E70] text-[11.5px]">
                    Estimate — Item price divided evenly across the POs (not saved).
                    {noPerPoAmount
                      ? ` Amount per PO is not recorded.${canEdit && draft ? ' Fill in the real amounts via Edit › Goods per PO.' : ''}`
                      : ' The recorded amounts are in the "As recorded" tab.'}
                  </div>
                ) : noPerPoAmount && lines.length > 1 && (
                  <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-[#FFF1D6] text-[#7A4F00] text-[11.5px]">
                    Amount per PO is not recorded (PO Price Detail is empty).
                    {canSplit ? ' See the "Split evenly" tab for an estimate.' : ' Only the total below is available.'}
                    {canEdit && draft ? ' Fill in the real amounts via Edit › Goods per PO.' : ''}
                  </div>
                )}
                <div className="px-4 pt-2 text-[11.5px] text-[#6E5E70] flex flex-col gap-0.5">
                  {lines.length > 1 && !noPerPoAmount && !useEvenSplit && <div className="flex justify-between"><span>Sum of PO lines</span><span className="tabular-nums">{curLabel ? `${curLabel} ` : ''}{fmtValas(goodsLineTotal)}</span></div>}
                  <div className="flex justify-between"><span>Item price (valas)</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtValas(rec.item_price)}</span></div>
                  <div className="flex justify-between"><span>Other cost</span><span className="tabular-nums">{fmtValas(rec.other_cost)}</span></div>
                  <div className="flex justify-between"><span>Item price (Rp)</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(rec.item_price_idr)}</span></div>
                </div>
              </SectionCard>
            </div>

            {/* Kanan */}
            <div className="flex flex-col gap-3 min-w-0">
              <SectionCard title="Customs value (as recorded)" right={<>Balance <b className="text-[#3B1B3D] tabular-nums">{fmtRp(build.balance)}</b></>} bodyClassName="px-4 pb-3">
                <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                  <span className="text-[#3B1B3D]">Goods value{build.goodsRate ? ` (${curLabel ? `${curLabel} ` : ''}${fmtValas(build.goodsValas)} × ${fmtValas(Math.round(build.goodsRate * 100) / 100)})` : ''}</span>
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

              <SectionCard
                title={<>Duties &amp; taxes <span className="text-[11.5px] font-normal text-[#8A7A8B]">rate &amp; amount as on the PIB</span></>}
                right={<>Import value <b className="text-[#3B1B3D] tabular-nums">{fmtRp(duty.importValueStored ?? duty.importValueCalc)}</b></>}
                bodyClassName="pb-0"
              >
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                      <th className={`${SA_LABEL} text-left px-4 py-2`}>Item · rate</th>
                      <th className={`${SA_LABEL} text-right px-3 py-2`}>Calculated</th>
                      <th className={`${SA_LABEL} text-right px-3 py-2`}>Amount on PIB</th>
                      <th className={`${SA_LABEL} text-right px-4 py-2`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duty.rows.map(r => (
                      <tr key={r.key} className="border-b border-[#F1E8E1]">
                        <td className="px-4 py-2">
                          <div className="font-semibold text-[#3B1B3D]">{r.label}</div>
                          <div className="text-[11px] text-[#8A7A8B]">Rate {fmtPctShort(r.rate)}{r.key === 'bm' ? ' (BM ÷ customs value)' : ''}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap">{r.status === 'derived' || r.calculated === null ? '—' : fmtRp(r.calculated)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap">{fmtRp(r.onPib)}</td>
                        <td className="px-4 py-2 text-right">
                          {r.status === 'match' ? <Chip tone="green">Match</Chip>
                            : r.status === 'differs' ? <Chip tone="red">{(r.diff ?? 0) > 0 ? '+' : '−'}{fmtRp(Math.abs(r.diff ?? 0))}</Chip>
                            : r.status === 'derived' ? <Chip tone="grey" title="No BM rate is stored — the rate is derived from BM ÷ customs value">Derived</Chip>
                            : <Chip tone="grey">No rate</Chip>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center gap-3 px-4 py-2.5 bg-[#FBF7F4] rounded-b-[14px]">
                  <div>
                    <div className="text-[13px] font-bold text-[#3B1B3D]">Total PIB</div>
                    <div className="text-[11px] text-[#8A7A8B]">BM + PPN + PPh{duty.totalMatches ? '' : ` = ${fmtRp(duty.sumOnPib)} (differs)`}</div>
                  </div>
                  <div className={`text-[16px] font-bold tabular-nums whitespace-nowrap ${duty.totalMatches ? 'text-[#3B1B3D]' : 'text-[#A8231A]'}`}>{fmtRp(rec.total_pib)}</div>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Checks */}
          <SectionCard title="Checks" right={<span><b className="text-[#3B1B3D]">{passed}</b> of {counted} checks passed</span>} bodyClassName="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {['Customs value', 'Links & validation'].map(g => (
              <div key={g}>
                <div className={`${SA_LABEL} pt-1 pb-0.5`}>{g}</div>
                {checks.filter(c => c.group === g).map((c, i) => <CheckRow key={i} ok={c.ok} label={c.label} hint={c.hint} />)}
              </div>
            ))}
          </SectionCard>

          {/* Audit trail */}
          <div className={`${SA_CARD}`}>
            <div className="px-4 pt-3.5 pb-2 text-[14px] font-bold text-[#3B1B3D]">Audit trail</div>
            <div className="px-4 pb-3">
              {log === null ? (
                <div className="text-[12px] text-[#8A7A8B] py-1">Loading…</div>
              ) : log.length === 0 ? (
                <div className="text-[12px] text-[#8A7A8B] py-1">No activity recorded</div>
              ) : log.map((e, i) => (
                <div key={i} className="grid grid-cols-[130px_110px_minmax(0,1fr)] gap-3 py-1.5 text-[12px] border-t border-[#F1E8E1] first:border-t-0">
                  <span className="text-[#6E5E70] tabular-nums">{fmtDateTime(e.at)}</span>
                  <span className="font-semibold text-[#3B1B3D] truncate" title={e.who}>{e.who}</span>
                  <span className="text-[#3B1B3D] [overflow-wrap:anywhere]"><b>{e.what}</b>{e.detail ? ` — ${e.detail}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
