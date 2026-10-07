// Tab "Invoices" panel Validation Invoice Recap Courier (2026-10-05, keputusan user: tombol Open di kartu DIHAPUS,
// isinya pindah ke sini). Dulu = jendela Open (CourierRecapDetailModal, 2026-10-02) -- isi & aturan TETAP:
// - Total (2026-10-07: tabel 1 baris per invoice Jenis | No. Invoice PPJK | Invoice PPJK Date | Jumlah, CN dalam kurung,
//   Total = Grand Total) + Split per vessel (jumlah breakdown per vessel tiap invoice).
// - Invoice per jenis (Freight / Duty / Credit Note): nominal, NTPN/PO/remarks, chip Sent/Received/Paid,
//   Submit to Finance per invoice (tanpa syarat), kunci setelah submit + Unlock (Admin, alasan min. 5 karakter).
// - Audit trail DIPINDAH ke tab "Audit trail" panel Validation (2026-10-06, permintaan user).
// - Edit TETAP lewat tabel List (tombol "Edit in List" di header panel).
import React, { useMemo, useState } from 'react'
import { Send, Lock, Unlock } from 'lucide-react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, SectionCard } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort } from '../utils/SeaAirAuditHelpers'
import {
  splitPerVessel, poVesselPairs, invoiceKind, invoiceAmount, invoiceKindFullLabel,
  INVOICE_KIND_LABEL, type RecapGroup, type InvoiceKind,
} from '../utils/CourierRecapHelpers'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px]">
    <div className="text-[#6E5E70]">{label}</div>
    <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</div>
  </div>
)
export const financeChips = (r: any) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {r.submit_date ? <Chip tone="blue" title="Submit Date">Sent {fmtDateShort(r.submit_date)}</Chip> : <Chip tone="grey">Not submitted</Chip>}
    {r.finance_received_at && <Chip tone="plum" title={r.finance_received_by ? `Received by ${r.finance_received_by}` : undefined}>Received {fmtDateShort(r.finance_received_at)}</Chip>}
    {r.tgl_lunas && <Chip tone="green" title={r.paid_reference ? `Ref ${r.paid_reference}` : undefined}>Paid {fmtDateShort(r.tgl_lunas)}</Chip>}
  </span>
)

// Kunci Submit to Finance (sql/038, 2026-10-02, sama Sea & Air): invoice yang sudah di-submit TERKUNCI (Edit di List
// & Delete nonaktif, DB menolak perubahan). Hanya Admin bisa Unlock dgn alasan (min. 5 karakter); ditolak kalau Finance
// sudah menerima. Info unlock terakhir tampil di kartu invoice.
const UnlockControl: React.FC<{ r: any; busy: boolean; onUnlock: (id: string, reason: string) => Promise<boolean> }> = ({ r, busy, onUnlock }) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  if (r.finance_received_at || r.tgl_lunas) {
    return <div className="text-[11px] text-[#8A7A8B] mt-1" title="Finance has already received or paid this invoice">Unlock unavailable — {r.tgl_lunas ? 'already paid' : 'received by Finance'}</div>
  }
  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className={`${SA_BTN_OUTLINE} h-8 mt-1`}>
        <Unlock size={12} /> Unlock (Admin)
      </button>
    )
  }
  const ok = reason.trim().length >= 5
  return (
    <div className="mt-1.5 w-[260px] max-w-full text-left">
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

export default function CourierRecapInvoicesTab({
  g, colOk, canEdit, busy, onSubmit, isAdmin = false, onUnlock, onEditInList,
}: {
  g: RecapGroup
  colOk: (k: string) => boolean
  canEdit: boolean
  busy: boolean
  onSubmit: (ids: string[]) => void
  isAdmin?: boolean
  onUnlock?: (id: string, reason: string) => Promise<boolean>
  onEditInList?: () => void
}) {
  const kinds = (['freight', 'duty', 'cn'] as InvoiceKind[]).filter(k => g.byKind[k].length > 0)
  const [kind, setKind] = useState<InvoiceKind>(kinds[0] || 'freight')
  const amountOk = colOk('total_amount')
  const split = useMemo(() => splitPerVessel(g.rows), [g.rows])
  const activeKind = kinds.includes(kind) ? kind : (kinds[0] || 'freight')
  // Urutan baris ringkasan Total: Freight · Duty · Credit Note Freight · Credit Note Duty (dalam jenis: urutan masuk).
  const totalRows = useMemo(() => {
    const order: Record<string, number> = { 'Freight': 0, 'Duty': 1, 'Credit Note Freight': 2, 'Credit Note Duty': 3 }
    return [...g.rows].sort((a, b) => order[invoiceKindFullLabel(a)] - order[invoiceKindFullLabel(b)])
  }, [g.rows])

  const invoiceCard = (r: any) => {
    const pairs = poVesselPairs(r)
    const k = invoiceKind(r)
    const amt = (key: string, label: string) => colOk(key) && hasVal(r[key]) ? (
      <div className="flex justify-between gap-3 py-1 text-[12.5px]"><span className="text-[#6E5E70]">{label}</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(r[key])}</span></div>
    ) : null
    return (
      <div key={r.id} className={`${SA_CARD} overflow-hidden`} data-recap-invoice={r.id}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={k === 'freight' ? 'blue' : k === 'duty' ? 'amber' : 'purple'}>{r.invoice_type || INVOICE_KIND_LABEL[k]}</Chip>
              <span className="text-[14px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{r.no_invoice || 'No invoice no.'}</span>
            </div>
            {/* 2026-10-07 (keputusan user): tanggal email diganti Invoice PPJK Date (`tgl_invoice`). */}
            <div className="text-[11.5px] text-[#6E5E70] mt-0.5" data-invoice-ppjk-date>
              {[r.ppjk, colOk('vendor') ? r.vendor : '', colOk('tgl_invoice') ? `Invoice PPJK Date ${hasVal(r.tgl_invoice) ? fmtDateShort(r.tgl_invoice) : '—'}` : ''].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1.5">{financeChips(r)}</div>
          </div>
          <div className="text-right">
            {amountOk && <div className={`text-[18px] font-bold tabular-nums ${k === 'cn' ? 'text-[#A8231A]' : 'text-[#3B1B3D]'}`}>{k === 'cn' ? '− ' : ''}{fmtRp(invoiceAmount(r))}</div>}
            {canEdit && !r.submit_date && (
              <button type="button" disabled={busy} onClick={() => onSubmit([String(r.id)])} className={`${SA_BTN_GREEN} h-8 mt-1`}><Send size={12} /> Submit to Finance</button>
            )}
            {r.submit_date && (
              <div className="flex flex-col items-end">
                <Chip tone="grey" title="Submitted to Finance — editing & deleting are locked"><Lock size={11} className="inline -mt-0.5" /> Locked</Chip>
                {isAdmin && onUnlock && <UnlockControl r={r} busy={busy} onUnlock={onUnlock} />}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 px-4 pb-3 border-t border-[#F1E8E1] pt-2">
          <div>
            {amt('courier_adm_fee', 'Courier adm fee')}
            {amt('total_freight', 'Total freight')}
            {amt('total_duty_tax', 'Total duty tax')}
            {amt('bm', 'BM')}
            {amt('ppn', 'PPN')}
            {amt('pph', 'PPh')}
            {amt('total_amount', 'Total amount')}
          </div>
          <div>
            {colOk('ntpn') && <Fact label="NTPN">{r.ntpn || '—'}</Fact>}
            {colOk('tgl_lapor_fp') && <Fact label="FP report date">{fmtDateShort(r.tgl_lapor_fp)}</Fact>}
            {colOk('po_pt_imi') && <Fact label="PO PT IMI">{r.po_pt_imi || '—'}</Fact>}
            {colOk('po_shipping') && <Fact label="PO Non IMI">{r.po_shipping || '—'}</Fact>}
            {colOk('notes') && <Fact label="Remarks">{r.notes || '—'}</Fact>}
            {colOk('keterangan') && <Fact label="Internal remarks">{r.keterangan || '—'}</Fact>}
            {r.paid_reference && <Fact label="Payment reference">{r.paid_reference}</Fact>}
            {!r.submit_date && r.submit_unlock_reason && (
              <Fact label="Last unlock">{`${r.submit_unlocked_by || 'Admin'}${r.submit_unlocked_at ? ` · ${fmtDateShort(r.submit_unlocked_at)}` : ''} — ${r.submit_unlock_reason}`}</Fact>
            )}
          </div>
        </div>
        {colOk('vessel') && pairs.length > 0 && (
          <div className="border-t border-[#F1E8E1] overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead>
                <tr className="bg-[#FBF7F4]">
                  <th className={`${SA_LABEL} text-left px-4 py-1.5`}>PO</th>
                  <th className={`${SA_LABEL} text-left px-3 py-1.5`}>Vessel</th>
                  {colOk('breakdown_courier_adm_vessel') && <th className={`${SA_LABEL} text-right px-3 py-1.5`}>Adm / vessel</th>}
                  {colOk('breakdown_freight_vessel') && <th className={`${SA_LABEL} text-right px-3 py-1.5`}>Freight / vessel</th>}
                  {colOk('breakdown_duty_vessel') && <th className={`${SA_LABEL} text-right px-3 py-1.5`}>Duty / vessel</th>}
                  {colOk('breakdown_bm_vessel') && <th className={`${SA_LABEL} text-right px-3 py-1.5`}>BM / vessel</th>}
                  {colOk('breakdown_ppnpph_vessel') && <th className={`${SA_LABEL} text-right px-4 py-1.5`}>PPN+PPh / vessel</th>}
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i} className="border-t border-[#F1E8E1]">
                    <td className="px-4 py-1.5 text-[#3B1B3D] [overflow-wrap:anywhere]">{p.po || '—'}</td>
                    <td className="px-3 py-1.5 text-[#3B1B3D] [overflow-wrap:anywhere]">{p.vessel || '—'}</td>
                    {colOk('breakdown_courier_adm_vessel') && <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(r.breakdown_courier_adm_vessel)}</td>}
                    {colOk('breakdown_freight_vessel') && <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(r.breakdown_freight_vessel)}</td>}
                    {colOk('breakdown_duty_vessel') && <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(r.breakdown_duty_vessel)}</td>}
                    {colOk('breakdown_bm_vessel') && <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(r.breakdown_bm_vessel)}</td>}
                    {colOk('breakdown_ppnpph_vessel') && <td className="px-4 py-1.5 text-right tabular-nums">{fmtRp(r.breakdown_ppnpph_vessel)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Ringkasan Total (2026-10-07, keputusan user): 1 baris per invoice -- Jenis | No. Invoice PPJK | Invoice PPJK Date |
          Jumlah (Freight, Duty, Credit Note Freight, Credit Note Duty); CN dalam kurung & langsung mengurangi; Total = Grand
          Total AWB (g.finalTotal, SAMA kartu). Tanggal kosong = "—". */}
      {amountOk && (
        <SectionCard title="Total" right={`${g.submitted}/${g.rows.length} submitted · ${g.paid} paid`} bodyClassName="pb-1">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[460px]" data-recap-total-table>
              <thead>
                <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                  <th className={`${SA_LABEL} text-left px-4 py-2`}>Type</th>
                  <th className={`${SA_LABEL} text-left px-3 py-2`}>No. Invoice PPJK</th>
                  <th className={`${SA_LABEL} text-left px-3 py-2`}>Invoice PPJK Date</th>
                  <th className={`${SA_LABEL} text-right px-4 py-2`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {totalRows.map(r => (
                  <tr key={r.id} className="border-b border-[#F1E8E1]" data-total-row>
                    <td className="px-4 py-2 font-semibold text-[#3B1B3D] whitespace-nowrap">{invoiceKindFullLabel(r)}</td>
                    <td className="px-3 py-2 text-[#3B1B3D] [overflow-wrap:anywhere]">{r.no_invoice || '—'}</td>
                    <td className="px-3 py-2 text-[#3B1B3D] whitespace-nowrap">{colOk('tgl_invoice') && hasVal(r.tgl_invoice) ? fmtDateShort(r.tgl_invoice) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#3B1B3D] whitespace-nowrap">
                      {invoiceKind(r) === 'cn' ? `(${invoiceAmount(r).toLocaleString('id-ID')})` : fmtRp(invoiceAmount(r))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FBF7F4]">
                  <td colSpan={3} className="px-4 py-2.5 text-[13.5px] font-bold text-[#3B1B3D]">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[16px] font-bold text-[#3B1B3D] whitespace-nowrap" data-recap-grand-total>{fmtRp(g.finalTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {kinds.length > 0 && (
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] self-start" role="tablist" aria-label="Invoice type">
          {kinds.map(k => (
            <button key={k} type="button" role="tab" aria-selected={activeKind === k} onClick={() => setKind(k)}
              className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${activeKind === k ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>
              {INVOICE_KIND_LABEL[k]} ({g.byKind[k].length})
            </button>
          ))}
        </div>
      )}
      {g.byKind[activeKind].map(invoiceCard)}
      {canEdit && onEditInList && <div className="text-[11.5px] text-[#8A7A8B]">To change invoice values, use <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={onEditInList}>Edit in List</button> — the cards update after saving.</div>}

      {colOk('vessel') && split.length > 0 && (
        <SectionCard title="Split per vessel" right="credit notes subtracted" bodyClassName="pb-1">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[520px]">
              <thead>
                <tr className="bg-[#FBF7F4] border-y border-[#EADFD6]">
                  <th className={`${SA_LABEL} text-left px-4 py-2`}>Vessel</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Courier adm</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Freight</th>
                  <th className={`${SA_LABEL} text-right px-3 py-2`}>Duty</th>
                  <th className={`${SA_LABEL} text-right px-4 py-2`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {split.map(v => (
                  <tr key={v.vessel} className="border-b border-[#F1E8E1] last:border-b-0">
                    <td className="px-4 py-2 font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{v.vessel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(v.adm)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(v.freight)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRp(v.duty)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-[#3B1B3D]">{fmtRp(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

    </div>
  )
}
