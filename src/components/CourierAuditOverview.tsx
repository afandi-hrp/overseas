// Tab "Overview" jendela Open Audit Courier (2026-10-01) -- mengikuti jendela Open Audit PIB Sea & Air.
// MURNI tampilan dari kolom tersimpan (+ auto-calc yg sudah di-apply saat fetch). Kolom yang tidak
// diizinkan role tidak ditampilkan (`colOk`). Validasi = info saja, TIDAK pernah mengunci (keputusan
// user: ada kasus invoice freight memang tidak ditagihkan). Audit trail DIPINDAH ke tab sendiri
// (CourierAuditTrail.tsx, 2026-10-01).
import React, { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Circle } from 'lucide-react'
import { SA_LABEL, Chip, SectionCard } from './SeaAirAuditUi'
import { fmtRp, fmtValas, fmtDateShort, fmtPctShort, buildGoodsLines, parseLooseNumber, splitMoneyEvenly, companyFullName } from '../utils/SeaAirAuditHelpers'
import { computeCourierBuildUp, computeCourierDutyRows, courierDocNo, type CourierDocType } from '../utils/CourierAuditHelpers'
import { VALIDATION_TAB_LABEL, rowValidationPct, validationDotClass, courierShipmentInfo, type ValidationTabKey } from './CourierValidationWindow'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px]">
    <div className="text-[#6E5E70]">{label}</div>
    <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</div>
  </div>
)
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

export default function CourierAuditOverview({ rec, docType, companyNames, colOk, validationTabs, canEdit, onOpenTab, cv }: {
  rec: any
  docType: CourierDocType
  companyNames: Record<string, string>
  colOk: (key: string) => boolean
  validationTabs: ValidationTabKey[]
  canEdit: boolean
  onOpenTab: (t: ValidationTabKey) => void
  cv?: any  // baris terbaru tabel_cost_validasi (Shipment Info, dipindah dari strip jendela 2026-10-01)
}) {
  const ship = courierShipmentInfo(cv)
  const build = computeCourierBuildUp(rec)
  const duty = computeCourierDutyRows(rec, docType)
  const lines = colOk('po_ori') ? buildGoodsLines(rec) : []
  const cur = colOk('kurs') ? String(rec.kurs || '').trim().toUpperCase() : ''
  const curLabel = cur && !/^[0-9.,\s]+$/.test(cur) ? cur : ''
  const ptName = companyFullName(companyNames, rec.impor_an)
  const pct = rowValidationPct(rec)

  // ── Goods per PO (sama aturan Sea & Air: 1 PO tanpa rincian = Item price; >1 PO = tab) ──
  const goodsRate = build.goodsIdr > 0 && Number(rec.item_price) > 0 ? build.goodsIdr / Number(rec.item_price) : (build.kursNdpbm || null)
  const noPerPoAmount = lines.length > 0 && lines.every(l => parseLooseNumber(l.amt) === null)
  const hasItemPrice = hasVal(rec.item_price) && colOk('item_price')
  const useItemPriceForSinglePo = noPerPoAmount && lines.length === 1 && hasItemPrice
  const canSplit = lines.length > 1 && hasItemPrice
  const defaultGoodsView: 'recorded' | 'even' = canSplit && noPerPoAmount ? 'even' : 'recorded'
  const [goodsView, setGoodsView] = useState<'recorded' | 'even'>(defaultGoodsView)
  useEffect(() => { setGoodsView(defaultGoodsView) }, [rec?.id, defaultGoodsView])
  const useEvenSplit = canSplit && goodsView === 'even'
  const evenValas = canSplit ? splitMoneyEvenly(Number(rec.item_price) || 0, lines.length, 2) : []
  const evenIdr = canSplit && hasVal(rec.item_price_idr) ? splitMoneyEvenly(Number(rec.item_price_idr) || 0, lines.length, 0) : []
  const showIdr = colOk('item_price_idr')

  const valueOk = colOk('total_nilai_pabean') && colOk('valas_dpp') && colOk('kurs_ndpbm')
  const dutyOk = colOk('total_pib_cn')
  const checks: { group: string; ok: boolean | null; label: string; hint?: string }[] = []
  if (valueOk) {
    checks.push({ group: 'Values', ok: build.cvCalcMatches, label: 'Customs value = Valas DPP × Kurs NDPBM', hint: build.cvCalcMatches ? undefined : `Valas DPP × Kurs NDPBM = ${fmtRp(Math.round(build.cvCalc))}` })
    if (colOk('cek_selisih')) checks.push({ group: 'Values', ok: build.differenceOk, label: 'Customs value = goods (Rp) + freight', hint: build.differenceOk ? undefined : `Check difference ${fmtRp(Math.round(build.difference))}` })
    if (colOk('bm')) checks.push({ group: 'Values', ok: duty.importValueMatches, label: 'Import value = customs value + BM', hint: duty.importValueMatches === null ? 'Import value not filled in' : undefined })
  }
  if (dutyOk) {
    checks.push({ group: 'Values', ok: duty.totalMatches, label: `Total ${docType} = BM + PPN + PPh${docType === 'CN' ? ' + admin penalty' : ''}`, hint: duty.totalMatches ? undefined : `Sum = ${fmtRp(duty.sum)}` })
    if (colOk('total_inv_duty')) checks.push({ group: 'Values', ok: duty.invoiceDutyMatches, label: `Invoice duty (PPJK) = Total ${docType}`, hint: duty.invoiceDutyMatches === null ? 'Invoice duty not filled in' : duty.invoiceDutyMatches ? undefined : `Invoice duty ${fmtRp(duty.invoiceDuty)}` })
  }
  validationTabs.forEach(t => checks.push({ group: 'Validation (info only)', ok: pct[t] === null ? null : pct[t]! >= 100, label: `${VALIDATION_TAB_LABEL[t]} ${pct[t] === null ? '— no data yet' : `${pct[t]}%`}` }))
  const passed = checks.filter(c => c.ok === true).length
  const counted = checks.filter(c => c.ok !== null).length
  const groups = Array.from(new Set(checks.map(c => c.group)))
  const hasSptnp = !!(rec.no_sptnp || rec.tgl_sptnp || rec.sptnp_total)
  const docNoKey = docType === 'CN' ? 'no_sppbmcp' : 'no_pib'

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
      {rec.reaudit_reason && (
        <div className="rounded-[14px] border border-[#D9C7DA] bg-[#F5EDF3] px-4 py-2 text-[12.5px] font-semibold text-[#5B2E8C]">
          ↻ {rec.reaudit_reason} — please re-audit{rec.reaudit_at ? ` (${fmtDateShort(rec.reaudit_at)})` : ''}.
        </div>
      )}
      {validationTabs.length > 0 && (
        <div className="rounded-[14px] border border-[#EADFD6] bg-white px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-[#3B1B3D] mr-1">Validation</span>
          {validationTabs.map(t => (
            <button key={t} type="button" onClick={() => onOpenTab(t)}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[#F3EEEA] hover:bg-[#EFE2EC] text-[12px] font-semibold text-[#3B1B3D]">
              <span className={`w-2 h-2 rounded-full ${validationDotClass(pct[t])}`} />
              {VALIDATION_TAB_LABEL[t]} {pct[t] === null ? '—' : `${pct[t]}%`}
            </button>
          ))}
          <span className="text-[11px] text-[#8A7A8B] ml-auto">Info only — an incomplete validation never blocks "Mark as audited" (e.g. no freight invoice billed).</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="flex flex-col gap-3 min-w-0">
          <SectionCard title="Document" bodyClassName="px-4 pb-3">
            {colOk(docNoKey) && <Fact label={docType === 'CN' ? 'SPPBMCP no.' : 'PIB no.'}>{courierDocNo(rec, docType) || '—'}</Fact>}
            {colOk('tgl_ppjk') && <Fact label="PPJK date">{fmtDateShort(rec.tgl_ppjk)}</Fact>}
            <Fact label="Document type">{docType}</Fact>
            {(colOk('via') || colOk('delivery_term')) && <Fact label="Via · delivery term">{colOk('via') ? (rec.via || '—') : '—'} · {colOk('delivery_term') ? (rec.delivery_term || '—') : '—'}</Fact>}
            {colOk('awb') && <Fact label="AWB">{rec.awb || '—'}</Fact>}
            {colOk('impor_an') && <Fact label="Importer">{ptName}{ptName !== String(rec.impor_an || '') && rec.impor_an ? <span className="text-[#8A7A8B] font-medium"> ({rec.impor_an})</span> : null}</Fact>}
            {colOk('vendor') && <Fact label="Supplier">{rec.vendor || '—'}</Fact>}
            {/* Shipment Info (tabel_cost_validasi) -- dulu strip di atas tab validasi. */}
            <Fact label="Courier · service">{ship.courier || '—'} · {ship.service || '—'}</Fact>
            <Fact label="Direction / type">{ship.direction || '—'}</Fact>
            <Fact label="Ship date">{ship.shipDate || '—'}</Fact>
            <Fact label="Origin / zone">{ship.origin || '—'}</Fact>
            <Fact label="Chargeable weight">{ship.chargeable || '—'}</Fact>
            {colOk('hs_code') && <Fact label="HS code">{rec.hs_code || '—'}</Fact>}
            {colOk('remarks') && <Fact label="Remarks">{rec.remarks || '—'}</Fact>}
            {colOk('marking') && <Fact label="Marking">{rec.marking || '—'}</Fact>}
            {colOk('doc_acceptance') && <Fact label="Doc Acceptance">{fmtDateShort(rec.doc_acceptance)}</Fact>}
            {colOk('tgl_submit_nas') && <Fact label="NAS Submit Date">{hasVal(rec.tgl_submit_nas) ? <Chip tone="green">{fmtDateShort(rec.tgl_submit_nas)}</Chip> : 'Not submitted yet'}</Fact>}
            {colOk('validasi_jalur') && <Fact label="Path validation">{rec.validasi_jalur || '—'}{colOk('catatan_jalur') && rec.catatan_jalur ? <span className="font-medium text-[#6E5E70]"> · {rec.catatan_jalur}</span> : null}</Fact>}
            {colOk('status_kelengkapan') && <Fact label="Completeness">{rec.status_kelengkapan || '—'}{colOk('pct_kelengkapan') && hasVal(rec.pct_kelengkapan) ? ` · ${rec.pct_kelengkapan}%` : ''}{colOk('dokumen_kurang') && hasVal(rec.dokumen_kurang) ? <span className="font-medium text-[#A8231A]"> · missing {rec.dokumen_kurang}</span> : null}</Fact>}
            {colOk('no_sptnp') && <Fact label="SPTNP">{hasSptnp ? `${rec.no_sptnp || '—'} · ${fmtDateShort(rec.tgl_sptnp)}${colOk('sptnp_total') ? ` · ${fmtRp(rec.sptnp_total)}` : ''}` : 'None'}</Fact>}
            {colOk('notes') && <Fact label="Notes"><span className="whitespace-pre-wrap font-medium">{rec.notes || '—'}</span></Fact>}
          </SectionCard>

          {colOk('po_ori') && (
            <SectionCard title="Goods per PO" bodyClassName="pb-2"
              right={colOk('item_price') ? <span className="tabular-nums">{curLabel ? `${curLabel} ` : ''}{fmtValas(rec.item_price)}{showIdr ? ` · ${fmtRp(rec.item_price_idr)}` : ''}</span> : undefined}>
              {canSplit && (
                <div className="px-4 pb-2">
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Amount per PO">
                    {([{ id: 'recorded', label: 'As recorded' }, { id: 'even', label: 'Split evenly' }] as const).map(t => (
                      <button key={t.id} type="button" role="tab" aria-selected={goodsView === t.id} onClick={() => setGoodsView(t.id)}
                        className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${goodsView === t.id ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>{t.label}</button>
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
                      {showIdr && <th className={`${SA_LABEL} text-right px-4 py-2`}>IDR</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-3 text-[#8A7A8B]">No PO recorded</td></tr>
                    ) : lines.map((l, i) => {
                      const amt = parseLooseNumber(l.amt)
                      const valas = useItemPriceForSinglePo ? fmtValas(rec.item_price)
                        : useEvenSplit ? fmtValas(evenValas[i])
                        : l.amt ? (amt !== null ? fmtValas(amt) : l.amt) : null
                      const idr = useItemPriceForSinglePo ? fmtRp(rec.item_price_idr)
                        : useEvenSplit ? (evenIdr.length ? `≈ ${fmtRp(evenIdr[i])}` : '—')
                        : amt !== null && goodsRate ? fmtRp(Math.round(amt * goodsRate)) : '—'
                      return (
                        <tr key={i} className="border-b border-[#F1E8E1] last:border-b-0">
                          <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{l.po || '—'}</td>
                          <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{colOk('vendor_inv_no') ? (l.inv || '—') : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#3B1B3D] whitespace-nowrap">
                            {useEvenSplit && <Chip tone="grey" className="mr-1.5" title="Item price divided evenly — estimate, not saved">≈ split evenly</Chip>}
                            {valas === null ? '—' : `${curLabel ? `${curLabel} ` : ''}${valas}`}
                          </td>
                          {showIdr && <td className="px-4 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap">{idr}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {useEvenSplit ? (
                <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-[#F3EEEA] text-[#6E5E70] text-[11.5px]">
                  Estimate — Item price divided evenly across the POs (not saved).{noPerPoAmount ? ` Amount per PO is not recorded.${canEdit ? ' Fill in the real amounts via Edit › Goods per PO.' : ''}` : ' The recorded amounts are in the "As recorded" tab.'}
                </div>
              ) : noPerPoAmount && lines.length > 1 && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-[#FFF1D6] text-[#7A4F00] text-[11.5px]">
                  Amount per PO is not recorded (PO Price Detail is empty).{canSplit ? ' See the "Split evenly" tab for an estimate.' : ''}
                </div>
              )}
              <div className="px-4 pt-2 text-[11.5px] text-[#6E5E70] flex flex-col gap-0.5">
                {colOk('item_price') && <div className="flex justify-between"><span>Item price (valas)</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtValas(rec.item_price)}</span></div>}
                {colOk('other_cost') && <div className="flex justify-between"><span>Other cost</span><span className="tabular-nums">{fmtValas(rec.other_cost)}</span></div>}
                {docType === 'CN' && colOk('kurs_bi') && <div className="flex justify-between"><span>Kurs BI</span><span className="tabular-nums">{fmtValas(rec.kurs_bi)}</span></div>}
                {showIdr && <div className="flex justify-between"><span>Item price (Rp) · {build.goodsRule}</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(rec.item_price_idr)}</span></div>}
              </div>
            </SectionCard>
          )}
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {valueOk && (
            <SectionCard title="Customs value (as recorded)" right={colOk('cek_selisih') ? <>Check difference <b className={`tabular-nums ${build.differenceOk ? 'text-[#3B1B3D]' : 'text-[#A8231A]'}`}>{fmtRp(Math.round(build.difference))}</b></> : undefined} bodyClassName="px-4 pb-3">
              {showIdr && (
                <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                  <span className="text-[#3B1B3D]">Goods value (Rp)</span>
                  <span className="font-semibold tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtRp(build.goodsIdr)}</span>
                </div>
              )}
              {colOk('total_inv_freight') && (
                <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                  <span className="text-[#3B1B3D]">Freight · total invoice freight{build.term ? ` (${build.term})` : ''}</span>
                  <span className="font-semibold tabular-nums text-[#6E5E70] whitespace-nowrap">{fmtRp(build.freight)}</span>
                </div>
              )}
              {colOk('cek_selisih') && (
                <div className="flex justify-between gap-3 py-1.5 text-[12.5px]">
                  <span className={build.differenceOk ? 'text-[#3B1B3D]' : 'text-[#A8231A] font-semibold'}>{build.differenceOk ? 'Rounding' : 'Check difference'}</span>
                  <span className={`font-semibold tabular-nums whitespace-nowrap ${build.differenceOk ? 'text-[#6E5E70]' : 'text-[#A8231A]'}`}>{fmtRp(Math.round(build.difference))}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 pt-2.5 mt-1 border-t border-[#EADFD6]">
                <div>
                  <div className="text-[13.5px] font-bold text-[#3B1B3D]">Total customs value</div>
                  <div className="text-[11px] text-[#8A7A8B]">{curLabel ? `${curLabel} ` : ''}{fmtValas(build.valasDpp)} (valas DPP) × {fmtValas(build.kursNdpbm)} (kurs NDPBM)</div>
                </div>
                <div className="text-[16px] font-bold tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtRp(build.cv)}</div>
              </div>
            </SectionCard>
          )}

          {dutyOk && (
            <SectionCard title={<>Duties &amp; taxes <span className="text-[11.5px] font-normal text-[#8A7A8B]">as on the {docType}</span></>}
              right={colOk('total_nilai_pabean_bm') ? <>Import value <b className="text-[#3B1B3D] tabular-nums">{fmtRp(duty.importValueStored ?? duty.importValueCalc)}</b></> : undefined} bodyClassName="pb-0">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                    <th className={`${SA_LABEL} text-left px-4 py-2`}>Item · rate</th>
                    <th className={`${SA_LABEL} text-right px-3 py-2`}>Calculated</th>
                    <th className={`${SA_LABEL} text-right px-3 py-2`}>Amount</th>
                    <th className={`${SA_LABEL} text-right px-4 py-2`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {duty.rows.filter(r => colOk(r.key === 'bm' ? 'bm' : r.key === 'ppn' ? 'ppn_nilai' : r.key === 'pph' ? 'pph_nilai' : 'sanksi_adm')).map(r => (
                    <tr key={r.key} className="border-b border-[#F1E8E1]">
                      <td className="px-4 py-2">
                        <div className="font-semibold text-[#3B1B3D]">{r.label}</div>
                        {r.key !== 'adm' && <div className="text-[11px] text-[#8A7A8B]">Rate {fmtPctShort(r.rate)}{r.key === 'bm' ? ' (BM ÷ customs value)' : r.status === 'derived' ? ' (calculated from the amount)' : ''}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap">{r.status === 'match' || r.status === 'differs' ? fmtRp(r.calculated) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap">{fmtRp(r.amount)}</td>
                      <td className="px-4 py-2 text-right">
                        {r.status === 'match' ? <Chip tone="green">Match</Chip>
                          : r.status === 'differs' ? <Chip tone="red">{(r.diff ?? 0) > 0 ? '+' : '−'}{fmtRp(Math.abs(r.diff ?? 0))}</Chip>
                          : r.status === 'derived' ? <Chip tone="grey" title="The rate is calculated from the amount (no separate rate recorded)">Derived</Chip>
                          : <Chip tone="grey">—</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-center gap-3 px-4 py-2.5 bg-[#FBF7F4] rounded-b-[14px]">
                <div>
                  <div className="text-[13px] font-bold text-[#3B1B3D]">Total {docType}</div>
                  <div className="text-[11px] text-[#8A7A8B]">BM + PPN + PPh{docType === 'CN' ? ' + admin penalty' : ''}{duty.totalMatches ? '' : ` = ${fmtRp(duty.sum)} (differs)`}{colOk('total_inv_duty') && duty.invoiceDuty !== null ? ` · invoice duty ${fmtRp(duty.invoiceDuty)}` : ''}</div>
                </div>
                <div className={`text-[16px] font-bold tabular-nums whitespace-nowrap ${duty.totalMatches ? 'text-[#3B1B3D]' : 'text-[#A8231A]'}`}>{fmtRp(rec.total_pib_cn)}</div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {checks.length > 0 && (
        <SectionCard title="Checks" right={<span><b className="text-[#3B1B3D]">{passed}</b> of {counted} checks passed</span>} bodyClassName="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {groups.map(g => (
            <div key={g}>
              <div className={`${SA_LABEL} pt-1 pb-0.5`}>{g}</div>
              {checks.filter(c => c.group === g).map((c, i) => <CheckRow key={i} ok={c.ok} label={c.label} hint={c.hint} />)}
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  )
}
