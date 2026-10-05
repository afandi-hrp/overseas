// Tabel duty Expected vs Actual (2026-10-05, permintaan user) -- tampilan & rumus SAMA kartu "Duty" tab
// Documents Invoice Recap Sea & Air (`compareSeaAirDuty`, SeaAirAuditHelpers.ts). Dipakai kartu "Duty & tax
// (PIB)" tab Costs Invoice Recap & kartu "Duties & taxes" jendela Open Audit PIB (baca saja; edit duty
// tetap di tab Documents › Edit duty).
import React from 'react'
import { CheckCircle2, XCircle, Circle } from 'lucide-react'
import { SA_LABEL, Chip } from './SeaAirAuditUi'
import { SEA_AIR_DUTY_TOLERANCE, type SeaAirDutyCompare } from '../utils/SeaAirAuditHelpers'

// SAMA format tab Documents ("Rp4.681.000,00").
const fmtIDR = (v: number | null) => (v === null ? '—' : 'Rp' + v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export const SeaAirDutyStatusChip: React.FC<{ m: boolean | null; emptyLabel?: string }> = ({ m, emptyLabel = 'Not checked' }) => (
  m === true ? <Chip tone="green"><CheckCircle2 size={11} />Match</Chip>
    : m === false ? <Chip tone="red"><XCircle size={11} />Mismatch</Chip>
    : <Chip tone="amber"><Circle size={11} />{emptyLabel}</Chip>
)

export default function SeaAirDutyCompareTable({ cmp, loading }: { cmp: SeaAirDutyCompare | null; loading?: boolean }) {
  return (
    <>
      <div className="px-4 pb-2 text-[11.5px] text-[#6E5E70] flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>Expected from customs value × rate vs actual on the PIB (tolerance Rp {SEA_AIR_DUTY_TOLERANCE.toLocaleString('id-ID')})</span>
        {cmp?.ndpbm != null && <span>NDPBM <b className="text-[#3B1B3D] tabular-nums">{cmp.ndpbm.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b> · {cmp.itemCount} customs item{cmp.itemCount === 1 ? '' : 's'}</span>}
      </div>
      {loading ? (
        <div className="px-4 pb-3 text-[12px] text-[#8A7A8B]">Loading…</div>
      ) : (
        <>
          {cmp && !cmp.hasCalc && (
            <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-[#FFF1D6] text-[#7A4F00] text-[11.5px]">
              {cmp.hasMatrix ? 'NDPBM / customs items are not filled in yet' : 'No document validation for this shipment yet'} — fill them in Invoice Recap › Documents › Edit duty to calculate the expected duty.
            </div>
          )}
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                <th className={`${SA_LABEL} text-left px-4 py-2`}>Item</th>
                <th className={`${SA_LABEL} text-right px-3 py-2`}>Actual (PIB)</th>
                <th className={`${SA_LABEL} text-right px-3 py-2`}>Expected (calculation)</th>
                <th className={`${SA_LABEL} text-right px-4 py-2`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(cmp?.rows || []).map(r => (
                <tr key={r.key} className={`border-b border-[#F1E8E1] last:border-b-0 ${r.key === 'total' ? 'bg-[#FBF7F4]' : ''}`}>
                  <td className="px-4 py-2">
                    <div className={`text-[#3B1B3D] ${r.key === 'total' ? 'font-bold' : 'font-semibold'}`}>{r.label}</div>
                    {r.rateText && <div className="text-[11px] text-[#8A7A8B]">{r.rateText}</div>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums text-[#3B1B3D] whitespace-nowrap ${r.key === 'total' ? 'font-bold' : 'font-semibold'}`}>{fmtIDR(r.actual)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#6E5E70] whitespace-nowrap">{fmtIDR(r.expected)}</td>
                  <td className="px-4 py-2 text-right"><SeaAirDutyStatusChip m={r.status} emptyLabel={r.expected === null ? 'Not calculated' : 'Not checked'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
