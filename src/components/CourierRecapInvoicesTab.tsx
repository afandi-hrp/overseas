// Tab "Invoices" panel Validation Invoice Recap Courier (2026-10-05, keputusan user: tombol Open di kartu DIHAPUS,
// isinya pindah ke sini). Revisi 2026-10-08 (keputusan user, referensi invoice_recap_gabung_split.html):
// - Ringkasan "Total" (tabel 1 baris per invoice: Type | No. Invoice PPJK | Invoice PPJK Date | Amount, CN dalam kurung, Total = Grand
//   Total) + kolom BARU "Status" (Locked / Sent / Received / Paid) dan tombol Unlock (Admin) di baris invoice yang sudah di-Submit
//   (aturan Unlock TETAP: alasan min. 5 karakter, ditolak kalau Finance sudah menerima).
// - SATU rincian biaya gabungan (Freight + Duty dijumlah, Credit Note dalam kurung) menggantikan tab Freight/Duty & kartu per invoice
//   (judul invoice, nominal kanan, Submit to Finance per invoice, "Not submitted" per invoice dihapus -- submit lewat "Submit all to
//   Finance" di header panel; rincian per invoice tetap di List).
// - Split jadi 2 tab "Split per PO" | "Split per vessel" (bagi rata, 2 desimal, selisih ke baris terakhir) menggantikan tabel PO/vessel
//   per invoice & "Split per vessel" lama.
// - Audit trail ada di tab "Audit trail" panel; Edit TETAP lewat tabel List ("Edit in List").
import React, { useMemo, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, SectionCard } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort } from '../utils/SeaAirAuditHelpers'
import {
  invoiceKind, invoiceAmount, invoiceKindFullLabel, netCostTotals, splitEvenly, sumSplit, poVesselMap,
  type RecapGroup, type SplitLine,
} from '../utils/CourierRecapHelpers'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'
export const financeChips = (r: any) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {r.submit_date ? <Chip tone="blue" title="Submit Date">Sent {fmtDateShort(r.submit_date)}</Chip> : <Chip tone="grey">Not submitted</Chip>}
    {r.finance_received_at && <Chip tone="plum" title={r.finance_received_by ? `Received by ${r.finance_received_by}` : undefined}>Received {fmtDateShort(r.finance_received_at)}</Chip>}
    {r.tgl_lunas && <Chip tone="green" title={r.paid_reference ? `Ref ${r.paid_reference}` : undefined}>Paid {fmtDateShort(r.tgl_lunas)}</Chip>}
  </span>
)

// Kunci Submit to Finance (sql/038, 2026-10-02, sama Sea & Air): invoice yang sudah di-submit TERKUNCI (Edit di List
// & Delete nonaktif, DB menolak perubahan). Hanya Admin bisa Unlock dgn alasan (min. 5 karakter); ditolak kalau Finance
// sudah menerima.
const UnlockControl: React.FC<{ r: any; busy: boolean; onUnlock: (id: string, reason: string) => Promise<boolean> }> = ({ r, busy, onUnlock }) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  if (r.finance_received_at || r.tgl_lunas) {
    return <div className="text-[11px] text-[#8A7A8B]" title="Finance has already received or paid this invoice">Unlock unavailable — {r.tgl_lunas ? 'already paid' : 'received by Finance'}</div>
  }
  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className={`${SA_BTN_OUTLINE} h-7`} data-unlock={r.id}>
        <Unlock size={12} /> Unlock (Admin)
      </button>
    )
  }
  const ok = reason.trim().length >= 5
  return (
    <div className="w-[240px] max-w-full text-left">
      <textarea aria-label="Unlock reason" value={reason} onChange={e => setReason(e.target.value)} rows={2}
        placeholder="Reason for unlocking (min. 5 characters)"
        className="w-full rounded-lg border border-[#EADFD6] bg-white px-2.5 py-1.5 text-[12px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470]" />
      <div className="flex justify-end gap-2 mt-1">
        <button type="button" className={`${SA_BTN_OUTLINE} h-8`} onClick={() => { setOpen(false); setReason('') }}>Cancel</button>
        <button type="button" disabled={!ok || saving} className={`${SA_BTN_GREEN} h-8`}
          onClick={async () => { setSaving(true); const done = await onUnlock(String(r.id), reason.trim()); setSaving(false); if (done) { setOpen(false); setReason('') } }}>
          {saving ? 'Unlocking…' : 'Confirm unlock'}
        </button>
      </div>
    </div>
  )
}

// Angka biaya: 2 desimal hanya kalau perlu (mis. "Rp 33.194,67" / "Rp 2.191.462").
const fmtRp2 = (n: number) => `Rp ${n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const fmtCn = (n: number) => `(${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })})`

const Line: React.FC<{ label: React.ReactNode; value: React.ReactNode; sub?: string; strong?: boolean; k?: string }> = ({ label, value, sub, strong, k }) => (
  <div className={`flex justify-between gap-3 py-1 text-[12.5px] ${strong ? 'pt-2 mt-1 border-t border-[#EADFD6]' : 'border-b border-dashed border-[#F1E8E1]'}`} data-detail-line={k}>
    <span className={strong ? 'font-semibold text-[#3B1B3D]' : 'text-[#6E5E70]'}>{label}{sub && <span className="block text-[10.5px] font-normal text-[#8A7A8B]">{sub}</span>}</span>
    <span className={`tabular-nums whitespace-nowrap font-semibold ${strong ? 'text-[15px] font-bold text-[#3B1B3D]' : 'text-[#3B1B3D]'}`}>{value}</span>
  </div>
)

export default function CourierRecapInvoicesTab({
  g, colOk, busy, isAdmin = false, onUnlock, onEditInList, canEdit,
}: {
  g: RecapGroup
  colOk: (k: string) => boolean
  canEdit: boolean
  busy: boolean
  onSubmit?: (ids: string[]) => void
  isAdmin?: boolean
  onUnlock?: (id: string, reason: string) => Promise<boolean>
  onEditInList?: () => void
}) {
  const amountOk = colOk('total_amount')
  const [splitTab, setSplitTab] = useState<'po' | 'vessel'>('po')

  // Urut baris ringkasan Total: Freight · Duty · Credit Note Freight · Credit Note Duty.
  const totalRows = useMemo(() => {
    const order: Record<string, number> = { 'Freight': 0, 'Duty': 1, 'Credit Note Freight': 2, 'Credit Note Duty': 3 }
    return [...g.rows].sort((a, b) => order[invoiceKindFullLabel(a)] - order[invoiceKindFullLabel(b)])
  }, [g.rows])

  // ── Rincian gabungan: Freight + Duty dijumlah (kotor); Credit Note terpisah (dalam kurung); Total amount = Grand Total ──
  const detail = useMemo(() => {
    const plain = g.rows.filter(r => invoiceKind(r) !== 'cn')
    const sum = (key: string) => plain.reduce((s, r) => s + (Number(r[key]) || 0), 0)
    const cnOf = (label: string) => g.rows.filter(r => invoiceKindFullLabel(r) === label)
    return {
      adm: sum('courier_adm_fee'), freight: sum('total_freight'), duty: sum('total_duty_tax'), bm: sum('bm'), ppn: sum('ppn'), pph: sum('pph'),
      cnFreight: cnOf('Credit Note Freight').reduce((s, r) => s + invoiceAmount(r), 0), cnFreightN: cnOf('Credit Note Freight').length,
      cnDuty: cnOf('Credit Note Duty').reduce((s, r) => s + invoiceAmount(r), 0), cnDutyN: cnOf('Credit Note Duty').length,
    }
  }, [g.rows])

  // Field yg ada di Freight & Duty: nilai sama (atau hanya satu sisi) -> tampil sekali; beda -> keduanya berlabel Freight / Duty.
  const pairFact = (label: string, key: string, fmt: (v: any) => string = v => String(v), sep = ', ') => {
    if (!colOk(key)) return null
    const vals = (rows: any[]) => Array.from(new Set(rows.map(r => r[key]).filter(hasVal).map(v => fmt(v))))
    const f = vals(g.byKind.freight), d = vals(g.byKind.duty)
    const jf = f.join(sep), jd = d.join(sep)
    let body: React.ReactNode
    if (!jf && !jd) body = '—'
    else if (!jf || !jd || jf === jd) body = jf || jd
    else body = (
      <span className="flex flex-col items-end gap-0.5" data-pair-different>
        <span><span className="text-[10.5px] font-normal text-[#8A7A8B] mr-1.5">Freight</span>{jf}</span>
        <span><span className="text-[10.5px] font-normal text-[#8A7A8B] mr-1.5">Duty</span>{jd}</span>
      </span>
    )
    return (
      <div className="flex justify-between gap-3 py-1 text-[12.5px] border-b border-dashed border-[#F1E8E1]" data-detail-fact={key}>
        <span className="text-[#6E5E70] shrink-0">{label}</span>
        <span className="font-semibold text-[#3B1B3D] text-right [overflow-wrap:anywhere]">{body}</span>
      </div>
    )
  }

  // ── Split per PO / per vessel: total gabungan AWB (sudah dikurangi credit note) dibagi rata ──
  const net = useMemo(() => netCostTotals(g.rows), [g.rows])
  const pos = g.pos
  const vessels = g.vessels
  const pv = useMemo(() => poVesselMap(g.rows), [g.rows])
  const poLines: SplitLine[] = useMemo(() => splitEvenly(net, pos.map(p => ({ key: p, po: p, vessel: (pv.map[p] || []).join(' + ') }))), [net, pos, pv])
  const vesselLines: SplitLine[] = useMemo(() => splitEvenly(net, vessels.map(v => ({ key: v, vessel: v }))), [net, vessels])
  const showPoVessel = !pv.ambiguous
  const th = `${SA_LABEL} px-3 py-2 text-right`
  const splitTable = (lines: SplitLine[], by: 'po' | 'vessel') => {
    const tot = sumSplit(lines)
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[640px]" data-split-table={by}>
          <thead>
            <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
              {by === 'po' ? <th className={`${SA_LABEL} text-left px-4 py-2`}>PO</th> : <th className={`${SA_LABEL} text-left px-4 py-2`}>Vessel</th>}
              {by === 'po' && showPoVessel && <th className={`${SA_LABEL} text-left px-3 py-2`}>Vessel</th>}
              <th className={th}>Courier</th><th className={th}>Freight</th><th className={th}>Duty</th><th className={th}>BM</th><th className={th}>PPN+PPh</th>
              <th className={`${th} bg-[#FFF3F1]`}>Total Incl. PPN+PPh</th><th className={`${th} bg-[#FFF3F1] pr-4`}>Total Excl. PPN+PPh</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.key} className="border-b border-[#F1E8E1]" data-split-row={l.key}>
                <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{by === 'po' ? l.po : l.vessel}</td>
                {by === 'po' && showPoVessel && <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{l.vessel || '—'}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{fmtRp2(l.courier)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRp2(l.freight)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRp2(l.duty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRp2(l.bm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtRp2(l.ppnpph)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold bg-[#FFF8F7]">{fmtRp2(l.incl)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-bold bg-[#FFF8F7]">{fmtRp2(l.excl)}</td>
              </tr>
            ))}
            <tr className="bg-[#FBF7F4] font-bold" data-split-total={by}>
              <td className="px-4 py-2.5 text-[#3B1B3D]" colSpan={by === 'po' && showPoVessel ? 2 : 1}>Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp2(tot.courier)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp2(tot.freight)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp2(tot.duty)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp2(tot.bm)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp2(tot.ppnpph)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#3B1B3D]" data-split-incl-total>{fmtRp2(tot.incl)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtRp2(tot.excl)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Ringkasan Total (2026-10-07) + kolom Status & Unlock (Admin) (2026-10-08). */}
      {amountOk && (
        <SectionCard title="Total" right={`${g.submitted}/${g.rows.length} submitted · ${g.paid} paid`} bodyClassName="pb-1">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[560px]" data-recap-total-table>
              <thead>
                <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                  <th className={`${SA_LABEL} text-left px-4 py-2`}>Type</th>
                  <th className={`${SA_LABEL} text-left px-3 py-2`}>No. Invoice PPJK</th>
                  <th className={`${SA_LABEL} text-left px-3 py-2`}>Invoice PPJK Date</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Amount</th>
                  <th className={`${SA_LABEL} text-left px-4 py-2`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {totalRows.map(r => (
                  <tr key={r.id} className="border-b border-[#F1E8E1] align-top" data-total-row data-recap-invoice={r.id}>
                    <td className="px-4 py-2 font-semibold text-[#3B1B3D] whitespace-nowrap">{invoiceKindFullLabel(r)}</td>
                    <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{r.no_invoice || '—'}</td>
                    <td className="px-3 py-2 text-[#3B1B3D] whitespace-nowrap">{colOk('tgl_invoice') && hasVal(r.tgl_invoice) ? fmtDateShort(r.tgl_invoice) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap">
                      {invoiceKind(r) === 'cn' ? fmtCn(invoiceAmount(r)) : fmtRp(invoiceAmount(r))}
                    </td>
                    <td className="px-4 py-2" data-invoice-status={r.id}
                      title={!r.submit_date && r.submit_unlock_reason ? `Last unlock: ${r.submit_unlocked_by || 'Admin'}${r.submit_unlocked_at ? ` · ${fmtDateShort(r.submit_unlocked_at)}` : ''} — ${r.submit_unlock_reason}` : undefined}>
                      <div className="flex flex-col items-start gap-1">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {r.submit_date && <Chip tone="grey" title="Submitted to Finance — editing & deleting are locked"><Lock size={11} className="inline -mt-0.5" /> Locked</Chip>}
                          {financeChips(r)}
                        </span>
                        {r.submit_date && isAdmin && onUnlock && <UnlockControl r={r} busy={busy} onUnlock={onUnlock} />}
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FBF7F4]">
                  <td colSpan={3} className="px-4 py-2.5 text-[13.5px] font-bold text-[#3B1B3D]">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[16px] font-bold text-[#3B1B3D] whitespace-nowrap" data-recap-grand-total>{fmtRp(g.finalTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Rincian biaya gabungan (Freight + Duty). Total amount = Courier adm fee + Total freight + Total duty tax − Credit note = Grand Total. */}
      <SectionCard title="Cost breakdown (Freight + Duty combined)" right="No separate Freight / Duty tabs" bodyClassName="px-4 pb-3" className="" >
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-8" data-cost-breakdown>
          <div>
            {amountOk ? (
              <>
                {colOk('courier_adm_fee') && <Line k="adm" label="Courier adm fee" value={fmtRp(detail.adm)} />}
                {colOk('total_freight') && <Line k="freight" label="Total freight" value={fmtRp(detail.freight)} />}
                {detail.cnFreightN > 0 && <Line k="cn_freight" label="Credit note freight" value={fmtCn(detail.cnFreight)} />}
                {colOk('total_duty_tax') && <Line k="duty" label="Total duty tax" value={fmtRp(detail.duty)} />}
                {detail.cnDutyN > 0 && <Line k="cn_duty" label="Credit note duty" value={fmtCn(detail.cnDuty)} />}
                {colOk('bm') && <Line k="bm" label="BM" value={fmtRp(detail.bm)} />}
                {colOk('ppn') && <Line k="ppn" label="PPN" value={fmtRp(detail.ppn)} />}
                {colOk('pph') && <Line k="pph" label="PPh" value={fmtRp(detail.pph)} />}
                <Line k="total" strong label="Total amount" sub="Courier adm + Freight + Duty tax − Credit note" value={<span data-detail-total>{fmtRp(g.finalTotal)}</span>} />
              </>
            ) : <div className="text-[12px] text-[#8A7A8B] py-2">Amounts hidden for your role</div>}
          </div>
          <div>
            {pairFact('NTPN', 'ntpn')}
            {pairFact('FP report date', 'tgl_lapor_fp', v => fmtDateShort(v) || String(v))}
            {pairFact('PO PT IMI', 'po_pt_imi', v => String(v), ' + ')}
            {pairFact('PO Non IMI', 'po_shipping', v => String(v), ' + ')}
            {pairFact('Remarks', 'notes')}
            {pairFact('Internal remarks', 'keterangan')}
          </div>
        </div>
      </SectionCard>

      {amountOk && (
        <SectionCard
          title={(
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Split">
              {([['po', 'Split per PO'], ['vessel', 'Split per vessel']] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={splitTab === k} onClick={() => setSplitTab(k)}
                  className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${splitTab === k ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>{label}</button>
              ))}
            </div>
          )}
          right={`credit notes subtracted · split evenly across ${splitTab === 'po' ? pos.length : vessels.length} ${splitTab === 'po' ? 'PO' : 'vessel'}${(splitTab === 'po' ? pos.length : vessels.length) === 1 ? '' : 's'} · rounding difference in the last row`}
          bodyClassName="pb-1">
          {splitTab === 'po'
            ? (pos.length === 0 ? <div className="px-4 pb-3 text-[12.5px] text-[#6E5E70]" data-split-empty>No PO recorded for this AWB.</div> : splitTable(poLines, 'po'))
            : (vessels.length === 0 ? <div className="px-4 pb-3 text-[12.5px] text-[#6E5E70]" data-split-empty>No vessel recorded for this AWB.</div> : splitTable(vesselLines, 'vessel'))}
          <div className="px-4 py-2 text-[11px] text-[#8A7A8B]">Total Incl. PPN+PPh = Courier + Freight + Duty · Total Excl. PPN+PPh = Courier + Freight + BM</div>
        </SectionCard>
      )}

      {canEdit && onEditInList && <div className="text-[11.5px] text-[#8A7A8B]">To change invoice values, use <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={onEditInList}>Edit in List</button> — the cards update after saving.</div>}
    </div>
  )
}
