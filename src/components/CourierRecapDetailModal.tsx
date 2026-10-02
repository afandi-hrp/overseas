// Jendela "Open" Invoice Recap Courier per AWB (2026-10-02, keputusan user; pola jendela Open Invoice Recap
// Sea & Air). Tab Overview | Invoices (Freight / Duty / Credit Note) | Audit trail.
// - Credit Note TERPISAH + total akhir = Freight + Duty − Credit Note.
// - Breakdown per vessel: per invoice (tab Invoices) + ringkasan "Split per vessel" (Overview).
// - Edit TETAP lewat tabel List (tombol "Edit in List"); setelah disimpan, kartu ikut ter-update.
// - Submit to Finance per invoice + "Submit all" per AWB: tanpa syarat & tanpa kunci (keputusan user).
// - Tombol Validation = jendela validasi PIB/CN pasangan AWB (data SAMA dgn Audit Courier).
import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, ShieldCheck, ExternalLink, Pencil, History, Lock, Unlock } from 'lucide-react'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_GREEN, Chip, Pill, PtBadge, SectionCard } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import { courierDocNo, isCourierDraft } from '../utils/CourierAuditHelpers'
import {
  recapGroupStatus, splitPerVessel, poVesselPairs, invoiceKind, invoiceAmount, ppjkCode, fetchRecapCourierLog,
  INVOICE_KIND_LABEL, type RecapGroup, type InvoiceKind,
} from '../utils/CourierRecapHelpers'
import CourierAuditTrail from './CourierAuditTrail'
import { ValidationDots } from './CourierAuditCardList'
import type { ValidationTabKey } from './CourierValidationWindow'

type TabKey = 'overview' | 'invoices' | 'trail'

const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-'
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px]">
    <div className="text-[#6E5E70]">{label}</div>
    <div className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{children}</div>
  </div>
)
const financeChips = (r: any) => (
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

export default function CourierRecapDetailModal({
  g, companyNames, colOk, canEdit, validationTabs, busy, onClose, onSubmit, onValidation, onViewInAudit, onEditInList,
  isAdmin = false, onUnlock,
}: {
  g: RecapGroup
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  canEdit: boolean
  validationTabs: ValidationTabKey[]
  busy: boolean
  onClose: () => void
  onSubmit: (ids: string[]) => void
  onValidation: (tab?: ValidationTabKey) => void
  onViewInAudit: () => void
  onEditInList: () => void
  isAdmin?: boolean
  onUnlock?: (id: string, reason: string) => Promise<boolean>
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const kinds = (['freight', 'duty', 'cn'] as InvoiceKind[]).filter(k => g.byKind[k].length > 0)
  const [kind, setKind] = useState<InvoiceKind>(kinds[0] || 'freight')
  const status = recapGroupStatus(g)
  const audit = g.audit
  const unsubmitted = g.rows.filter(r => !r.submit_date)
  const amountOk = colOk('total_amount')
  const split = useMemo(() => splitPerVessel(g.rows), [g.rows])
  const ppjks = Array.from(new Set(g.ppjks.map(ppjkCode).filter(Boolean)))
  const loader = useMemo(() => () => fetchRecapCourierLog(g), [g])

  const tabs: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'invoices', label: `Invoices (${g.rows.length})` },
    { key: 'trail', label: 'Audit trail', icon: <History size={13} /> },
  ]

  const totalLine = (label: string, value: number, opts: { sub?: string; neg?: boolean; bold?: boolean } = {}) => (
    <div className={`flex justify-between gap-3 py-1.5 text-[12.5px] ${opts.bold ? 'pt-2.5 mt-1 border-t border-[#EADFD6]' : ''}`}>
      <span className={opts.bold ? 'text-[13.5px] font-bold text-[#3B1B3D]' : 'text-[#3B1B3D]'}>{label}{opts.sub && <span className="text-[11px] text-[#8A7A8B] font-normal"> · {opts.sub}</span>}</span>
      <span className={`tabular-nums whitespace-nowrap ${opts.bold ? 'text-[16px] font-bold text-[#3B1B3D]' : opts.neg ? 'font-semibold text-[#A8231A]' : 'font-semibold text-[#3B1B3D]'}`}>{opts.neg ? '− ' : ''}{fmtRp(value)}</span>
    </div>
  )

  const invoiceCard = (r: any) => {
    const pairs = poVesselPairs(r)
    const k = invoiceKind(r)
    const amt = (key: string, label: string) => colOk(key) && hasVal(r[key]) ? (
      <div className="flex justify-between gap-3 py-1 text-[12.5px]"><span className="text-[#6E5E70]">{label}</span><span className="tabular-nums font-semibold text-[#3B1B3D]">{fmtRp(r[key])}</span></div>
    ) : null
    return (
      <div key={r.id} className={`${SA_CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={k === 'freight' ? 'blue' : k === 'duty' ? 'amber' : 'purple'}>{r.invoice_type || INVOICE_KIND_LABEL[k]}</Chip>
              <span className="text-[14px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{r.no_invoice || 'No invoice no.'}</span>
            </div>
            <div className="text-[11.5px] text-[#6E5E70] mt-0.5">
              {[r.ppjk, colOk('vendor') ? r.vendor : '', r.tgl_terima_email ? `email ${fmtDateShort(r.tgl_terima_email)}` : ''].filter(Boolean).join(' · ')}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 px-4 pb-3 border-t border-[#F1E8E1] pt-2">
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

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1180px] h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-[#EADFD6] shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A7A8B]">AWB</div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] font-bold text-[#3B1B3D] [overflow-wrap:anywhere]">{g.awb}</h2>
                {ppjks.map(p => <Chip key={p} tone="grey">{p}</Chip>)}
                {colOk('an') && g.an && <PtBadge code={g.an} title={companyFullName(companyNames, g.an)} />}
                <Pill tone={status.tone}>{status.label}</Pill>
                {g.rows.length > 0 && g.rows.every(r => r.submit_date) && <Chip tone="grey" title="All invoices submitted to Finance — locked"><Lock size={11} className="inline -mt-0.5" /> Locked</Chip>}
              </div>
              <div className="text-[12px] text-[#6E5E70] mt-0.5">{[colOk('origin') ? g.origin : '', colOk('weight_kg') && g.weight !== null ? `${g.weight.toLocaleString('id-ID')} kg` : ''].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {amountOk && (
                <div className="text-right mr-2">
                  <div className={SA_LABEL}>Total{g.cn > 0 ? ' (− credit note)' : ''}</div>
                  <div className="text-[20px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(g.finalTotal)}</div>
                </div>
              )}
              {audit && validationTabs.length > 0 && <button type="button" className={SA_BTN_OUTLINE} onClick={() => onValidation()}><ShieldCheck size={13} /> Validation</button>}
              {!g.key.startsWith('ID:') && <button type="button" className={SA_BTN_OUTLINE} onClick={onViewInAudit}><ExternalLink size={13} /> View in Audit</button>}
              {canEdit && <button type="button" className={SA_BTN_OUTLINE} onClick={onEditInList} title="Edit the invoices of this AWB in the List view"><Pencil size={13} /> Edit in List</button>}
              {canEdit && unsubmitted.length > 0 && (
                <button type="button" disabled={busy} className={SA_BTN_GREEN} onClick={() => onSubmit(unsubmitted.map(r => String(r.id)))}>
                  <Send size={13} /> {busy ? 'Submitting…' : unsubmitted.length === g.rows.length ? 'Submit all to Finance' : `Submit all (${unsubmitted.length} left)`}
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" title="Close" className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA]"><X size={18} /></button>
            </div>
          </div>
          <div className="flex items-end gap-1 mt-3" role="tablist">
            {tabs.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`px-3 pb-2 pt-1 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === t.key ? 'border-[#6B3470] text-[#3B1B3D]' : 'border-transparent text-[#6E5E70] hover:text-[#3B1B3D]'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Isi */}
        {tab === 'trail' ? (
          <div className="flex-1 min-h-0 flex flex-col"><CourierAuditTrail loader={loader} loadKey={g.key + ':' + g.rows.length} /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto bg-[#FBF7F4] p-4 flex flex-col gap-3">
            {audit?.rec.reaudit_reason && (
              <div className="rounded-[14px] border border-[#D9C7DA] bg-[#F5EDF3] px-4 py-2 text-[12.5px] font-semibold text-[#5B2E8C]">↻ {audit.rec.reaudit_reason} — the {audit.docType} went back to Draft for re-audit.</div>
            )}

            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <SectionCard title="Shipment" bodyClassName="px-4 pb-3">
                    <Fact label="AWB">{g.awbRaw || '—'}</Fact>
                    <Fact label="PPJK">{g.ppjks.join(', ') || '—'}</Fact>
                    {colOk('an') && <Fact label="Company">{companyFullName(companyNames, g.an) || '—'}</Fact>}
                    {colOk('origin') && <Fact label="Origin">{g.origin || '—'}</Fact>}
                    {colOk('weight_kg') && <Fact label="Weight">{g.weight !== null ? `${g.weight.toLocaleString('id-ID')} kg` : '—'}</Fact>}
                    <Fact label="Email received">{g.firstEmail && g.lastEmail && g.firstEmail !== g.lastEmail ? `${fmtDateShort(g.firstEmail)} – ${fmtDateShort(g.lastEmail)}` : fmtDateShort(g.firstEmail)}</Fact>
                    {colOk('po_pt_imi') && <Fact label="PO">{g.pos.length ? g.pos.join(', ') : '—'}</Fact>}
                    {colOk('vessel') && <Fact label="Vessel">{g.vessels.length ? g.vessels.join(' + ') : '—'}</Fact>}
                  </SectionCard>

                  <div className="flex flex-col gap-3 min-w-0">
                    <SectionCard title="Audit (PIB / CN)" bodyClassName="px-4 pb-3">
                      {audit ? (
                        <>
                          <Fact label={audit.docType === 'CN' ? 'SPPBMCP no.' : 'PIB no.'}>{courierDocNo(audit.rec, audit.docType) || '—'}</Fact>
                          <Fact label="Status">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Chip tone={isCourierDraft(audit.rec) ? 'amber' : 'green'}>{isCourierDraft(audit.rec) ? 'Draft' : 'Audited'}</Chip>
                              {audit.rec.reaudit_reason && <Chip tone="purple" title={audit.rec.reaudit_reason}>↻ Re-audit</Chip>}
                            </span>
                          </Fact>
                          <Fact label="Validation">
                            <span className="inline-flex items-center gap-2">
                              <ValidationDots rec={audit.rec} tabs={validationTabs} onOpenTab={t => onValidation(t)} />
                              <span className="text-[11px] text-[#8A7A8B] font-normal">{isCourierDraft(audit.rec) ? 'editable while Draft' : 'view only (Audited)'}</span>
                            </span>
                          </Fact>
                          <Fact label="Matched by">{audit.by === 'id' ? 'Linked record' : 'Same AWB'}</Fact>
                        </>
                      ) : (
                        <div className="text-[12.5px] text-[#6E5E70] py-1">
                          {g.key.startsWith('ID:') ? 'This invoice has no AWB, so it cannot be matched to Audit Courier.' : 'No PIB / CN with this AWB was found in Audit Courier (it may have been deleted, or the AWB is written differently).'}
                        </div>
                      )}
                    </SectionCard>

                    {amountOk && (
                      <SectionCard title="Total" bodyClassName="px-4 pb-3">
                        {g.byKind.freight.length > 0 && totalLine('Freight', g.freight, { sub: `${g.byKind.freight.length} invoice${g.byKind.freight.length === 1 ? '' : 's'}` })}
                        {g.byKind.duty.length > 0 && totalLine('Duty', g.duty, { sub: `${g.byKind.duty.length} invoice${g.byKind.duty.length === 1 ? '' : 's'}` })}
                        {g.cn > 0 && totalLine('Freight + Duty', g.charges)}
                        {g.byKind.cn.length > 0 && totalLine('Credit Note', g.cn, { neg: true, sub: `${g.byKind.cn.length} credit note${g.byKind.cn.length === 1 ? '' : 's'}` })}
                        {totalLine(g.cn > 0 ? 'Total (Freight + Duty − Credit Note)' : 'Total', g.finalTotal, { bold: true })}
                      </SectionCard>
                    )}
                  </div>
                </div>

                {colOk('vessel') && split.length > 0 && (
                  <SectionCard title="Split per vessel" right="sum of the per-vessel breakdown of every invoice · credit notes subtracted" bodyClassName="pb-1">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px] min-w-[560px]">
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

                <SectionCard title="Finance" right={`${g.submitted}/${g.rows.length} submitted · ${g.paid} paid`} bodyClassName="px-4 pb-3">
                  {g.rows.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-t border-[#F1E8E1] first:border-t-0 text-[12.5px]">
                      <span className="font-semibold text-[#3B1B3D]">{r.invoice_type || 'Invoice'} · {r.no_invoice || '—'}</span>
                      {financeChips(r)}
                    </div>
                  ))}
                </SectionCard>
              </>
            )}

            {tab === 'invoices' && (
              <>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] self-start" role="tablist" aria-label="Invoice type">
                  {kinds.map(k => (
                    <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                      className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${kind === k ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>
                      {INVOICE_KIND_LABEL[k]} ({g.byKind[k].length})
                    </button>
                  ))}
                </div>
                {g.byKind[kind].map(invoiceCard)}
                {canEdit && <div className="text-[11.5px] text-[#8A7A8B]">To change invoice values, use <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={onEditInList}>Edit in List</button> — the cards update after saving.</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

