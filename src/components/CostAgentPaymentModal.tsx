// Pembayaran AP Note / PV Cost Agent (2026-10-13, Prompt 5; fitur cost_agent_payment, pola Finance Handover). Dibuka dari
// review invoice status approved, atau multi-select tab Approved (antrean: 1 request per invoice, satu per satu).
// "Send to Finance": 1) fn_cost_agent_create_payment_request(invoice, AP_NOTE|PV, data) -> request_id (status submitted)
// 2) POST /api/n8n-proxy-json (cost_agent_payment) {request_id} -> n8n memposting ke sistem finance lalu
// fn_cost_agent_mark_payment_posted -> invoice "Journal (AP/PV)" + doc_no. Langkah 2 gagal -> request tetap ada, kirim ulang
// lewat tab Payments ("Resend"). Akun GL AP/VAT/WHT dari CostAgentHelpers (default kosong, isi lewat cost_agent_settings).
import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle, CheckCircle2, RotateCcw, Send } from 'lucide-react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  costAgentGetInvoiceHistory, costAgentCreatePaymentRequest, costAgentJsonAction, fetchCostAgentGlAccounts,
  loadVendorBank, saveVendorBank, parseQtyInput, fmtMoney, fmtDate, fmtNumber, TAX_STATUS_META, COST_AGENT_GL_DEFAULTS,
  type CostAgentInvoiceHistory, type CostAgentGlAccounts, type CostAgentJournalLine, type CostAgentPaymentDocType,
} from '../utils/CostAgentHelpers'

type Row = CostAgentJournalLine & { key: string }
let k = 0
const nk = () => `j${++k}`
const round2 = (n: number) => Math.round(n * 100) / 100

// Jurnal default: debit per baris invoice + stamp duty (bila belum ada baris MATERAI) + VAT in; kredit WHT payable + AP vendor.
function defaultJournal(d: CostAgentInvoiceHistory, gl: CostAgentGlAccounts, amount: number, wht: number, desc: string): Row[] {
  const inv = d.invoice
  const rows: Row[] = d.lines.map(l => ({ key: nk(), gl_account: l.gl_account || '', description: l.description_raw, debit: Number(l.amount || 0), credit: 0 }))
  const materai = Number(inv.materai || 0)
  if (materai > 0 && !d.lines.some(l => l.cost_item_code === 'MATERAI')) rows.push({ key: nk(), gl_account: gl.stamp_duty, description: 'Stamp duty (materai)', debit: materai, credit: 0 })
  const ppn = Number(inv.ppn || 0)
  if (ppn > 0) rows.push({ key: nk(), gl_account: gl.vat_in, description: 'VAT in', debit: ppn, credit: 0 })
  if (wht > 0) rows.push({ key: nk(), gl_account: gl.wht_payable, description: 'WHT payable', debit: 0, credit: wht })
  rows.push({ key: nk(), gl_account: gl.ap_vendor, description: `AP ${inv.vendor_name || ''} — ${desc}`.slice(0, 200), debit: 0, credit: amount })
  return rows
}

export default function CostAgentPaymentModal({ invoiceIds, actor, onClose, onDone }: {
  invoiceIds: number[]
  actor: string | null
  onClose: () => void
  onDone: () => void // segarkan daftar / review
}) {
  const [idx, setIdx] = useState(0)
  const [gl, setGl] = useState<CostAgentGlAccounts | null>(null)
  const [results, setResults] = useState<Record<number, string>>({})
  useEffect(() => { fetchCostAgentGlAccounts().then(setGl).catch(() => setGl({ ...COST_AGENT_GL_DEFAULTS })) }, [])
  const id = invoiceIds[idx]

  return (
    <CostAgentModal maxWidth="max-w-5xl" z="z-[80]" onClose={onClose}
      title={<span className="flex items-center gap-2">Create AP Note / PV {invoiceIds.length > 1 && <Chip tone="plum">Invoice {idx + 1} of {invoiceIds.length}</Chip>}</span>}
      subtitle="The request is posted to the finance system by the automation server.">
      {!gl ? <LoadingState fullHeight={false} /> : (
        <React.Fragment key={id}><PaymentForm invoiceId={id} gl={gl} actor={actor} sentMessage={results[id]}
          hasNext={idx < invoiceIds.length - 1}
          onNext={() => setIdx(i => i + 1)}
          onClose={onClose}
          onSent={msg => { setResults(r => ({ ...r, [id]: msg })); onDone() }} /></React.Fragment>
      )}
    </CostAgentModal>
  )
}

function PaymentForm({ invoiceId, gl, actor, sentMessage, hasNext, onNext, onClose, onSent }: {
  invoiceId: number; gl: CostAgentGlAccounts; actor: string | null; sentMessage?: string; hasNext: boolean
  onNext: () => void; onClose: () => void; onSent: (msg: string) => void
}) {
  const [data, setData] = useState<CostAgentInvoiceHistory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [docType, setDocType] = useState<CostAgentPaymentDocType>('AP_NOTE')
  const [whtStr, setWhtStr] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [reason, setReason] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [bank, setBank] = useState({ bank_name: '', bank_account_name: '', bank_account_no: '' })
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [journalTouched, setJournalTouched] = useState(false)
  const [taxAck, setTaxAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ requestId: number; ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    costAgentGetInvoiceHistory(invoiceId).then(d => {
      if (cancelled) return
      if (!d) { setLoadError('Invoice not found.'); return }
      setData(d)
      const inv = d.invoice
      const wht = Number(inv.pph || 0)
      const amount = Number(inv.grand_total ?? inv.lines_total ?? 0)
      setWhtStr(String(wht)); setAmountStr(String(amount))
      const voy = (inv.voyage as any)?.voyage_no || inv.voyage_no_raw || '-'
      const desc = `Agency cost ${inv.vessel_name || inv.vessel_name_raw || '-'} voy ${voy} at ${inv.port_name || inv.port_code || inv.port_name_raw || '-'} - ${inv.invoice_no || '#' + inv.id}`
      setDescription(desc)
      const b = loadVendorBank(inv.vendor_id ?? inv.vendor_name)
      if (b) setBank(b)
      setRows(defaultJournal(d, gl, amount, wht, desc))
    }).catch(e => { if (!cancelled) setLoadError(e.message || String(e)) })
    return () => { cancelled = true }
  }, [invoiceId, gl])

  const inv = data?.invoice
  const amount = parseQtyInput(amountStr)
  const wht = parseQtyInput(whtStr) ?? 0
  const amountChanged = !!inv && amount !== null && Math.abs(amount - Number(inv.grand_total ?? inv.lines_total ?? 0)) > 0.005
  // Jurnal otomatis ikut nominal & WHT selama belum diedit manual.
  useEffect(() => {
    if (!data || journalTouched || amount === null) return
    setRows(defaultJournal(data, gl, amount, wht, description))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, wht])

  const totals = useMemo(() => rows.reduce((t, r) => ({ d: t.d + Number(r.debit || 0), c: t.c + Number(r.credit || 0) }), { d: 0, c: 0 }), [rows])
  const balanced = Math.abs(round2(totals.d - totals.c)) < 0.01
  const lastTax = data?.tax_checks?.[0] || null
  const taxOk = lastTax?.status === 'match'
  const activePayment = data?.payments.find(p => ['draft', 'submitted', 'posted', 'paid'].includes(p.status))

  const editRow = (key: string, patch: Partial<Row>) => { setRows(p => p.map(r => (r.key === key ? { ...r, ...patch } : r))); setJournalTouched(true) }

  const validate = (): string | null => {
    if (!inv) return 'Invoice not loaded.'
    if (inv.status !== 'approved') return `Invoice status is ${inv.status} — only approved invoices can be paid.`
    if (activePayment) return `This invoice already has an active payment document (#${activePayment.id}).`
    if (amount === null || amount <= 0) return 'Amount to pay must be greater than 0.'
    if (amountChanged && reason.trim().length < 5) return 'Give a reason (min. 5 characters) for changing the amount to pay.'
    if (!dueDate) return 'Due date is required.'
    if (docType === 'PV' && !bank.bank_account_no.trim()) return 'Vendor bank account is required for a PV.'
    if (!rows.length) return 'Journal lines are empty.'
    const noGl = rows.findIndex(r => !r.gl_account.trim())
    if (noGl >= 0) return `Journal line ${noGl + 1}: GL account is required.`
    if (!balanced) return `Journal is not balanced: debit ${fmtMoney(totals.d)} vs credit ${fmtMoney(totals.c)}.`
    if (!taxOk && !taxAck) return 'Confirm that you want to continue without a matching tax invoice.'
    return null
  }

  const send = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setBusy(true); setError(null)
    const desc = amountChanged ? `${description} (Amount adjusted: ${reason.trim()})` : description
    let requestId: number
    try {
      requestId = Number(await costAgentCreatePaymentRequest(inv!.id, docType, {
        amount, pph_amount: wht, due_date: dueDate, ...bank, description: desc, amount_reason: amountChanged ? reason.trim() : null,
        journal_lines: rows.map(r => ({ gl_account: r.gl_account.trim(), description: r.description, debit: round2(Number(r.debit || 0)), credit: round2(Number(r.credit || 0)) })),
      }, actor))
    } catch (e: any) {
      setError(e.message || String(e)); setBusy(false); return
    }
    saveVendorBank(inv!.vendor_id ?? inv!.vendor_name, bank)
    try {
      const r = await costAgentJsonAction('cost_agent_payment', { request_id: requestId })
      const docNo = r?.doc_no ?? r?.data?.doc_no
      const msg = `${docType === 'PV' ? 'PV' : 'AP Note'} request #${requestId} sent to Finance${docNo ? ` — doc no ${docNo}` : ''}.`
      setSent({ requestId, ok: true, msg }); onSent(msg)
    } catch (e: any) {
      const msg = `Request #${requestId} was created, but sending it to the finance system failed: ${e.message || e}. Use "Resend" in the Payments tab.`
      setSent({ requestId, ok: false, msg }); onSent(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="p-5 text-sm text-[#A8231A]">{loadError}</p>
  if (!data || !inv) return <LoadingState fullHeight={false} />

  const done = sent || sentMessage
  return (
    <div className="flex flex-col">
      <div className="p-5 space-y-4">
        {done ? (
          <div className={`rounded-lg border px-3 py-2 text-[12.5px] flex items-start gap-1.5 ${sent?.ok === false ? 'border-[#F2D58A] bg-[#FFF8E6] text-[#7A4F00]' : 'border-[#BFE3CC] bg-[#EAF6EF] text-[#17663D]'}`}>
            {sent?.ok === false ? <AlertTriangle size={14} className="mt-0.5" /> : <CheckCircle2 size={14} className="mt-0.5" />} {sent?.msg || sentMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
              <div><div className={SA_LABEL}>Vendor</div><div className="font-semibold text-[#3B1B3D]">{inv.vendor_name || inv.vendor_name_raw || '—'}</div></div>
              <div><div className={SA_LABEL}>Invoice</div><div className="font-semibold text-[#3B1B3D]">{inv.invoice_no || `#${inv.id}`} · {fmtDate(inv.invoice_date)}</div></div>
              <div><div className={SA_LABEL}>Vessel · Voyage</div><div className="text-[#3B1B3D]">{inv.vessel_name || '—'} · {(inv.voyage as any)?.voyage_no ? `Voy ${(inv.voyage as any).voyage_no}` : '—'}</div></div>
              <div><div className={SA_LABEL}>Port</div><div className="text-[#3B1B3D]">{inv.port_code ? `${inv.port_code} — ${inv.port_name}` : '—'}</div></div>
              <div><div className={SA_LABEL}>Subtotal</div><div className="tabular-nums">{fmtMoney(inv.subtotal, inv.currency)}</div></div>
              <div><div className={SA_LABEL}>VAT</div><div className="tabular-nums">{fmtMoney(inv.ppn, inv.currency)}</div></div>
              <div><div className={SA_LABEL}>Stamp duty</div><div className="tabular-nums">{fmtMoney(inv.materai, inv.currency)}</div></div>
              <div><div className={SA_LABEL}>Grand total</div><div className="font-bold tabular-nums">{fmtMoney(inv.grand_total, inv.currency)}</div></div>
            </div>

            {activePayment && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">This invoice already has an active payment document #{activePayment.id} ({activePayment.status}).</div>}
            {!taxOk && (
              <label className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span className="flex-1">{lastTax ? `Latest tax invoice check: ${TAX_STATUS_META[lastTax.status]?.label || lastTax.status}.` : 'No tax invoice (Faktur Pajak) has been checked for this invoice.'}</span>
                <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap"><input type="checkbox" checked={taxAck} onChange={e => setTaxAck(e.target.checked)} className="accent-[#B7791F]" /> Continue anyway</span>
              </label>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <FieldLabel required>Document type</FieldLabel>
                <div className="flex rounded-lg border border-[#EADFD6] p-0.5 bg-white">
                  {(['AP_NOTE', 'PV'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setDocType(t)} className={`flex-1 h-8 rounded-md text-xs font-semibold ${docType === t ? 'bg-[#6B3470] text-white' : 'text-[#3B1B3D]'}`}>{t === 'AP_NOTE' ? 'AP Note' : 'PV'}</button>
                  ))}
                </div>
              </div>
              <div><FieldLabel>WHT (PPh)</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={whtStr} onChange={e => setWhtStr(e.target.value)} /></div>
              <div><FieldLabel required>Amount to pay</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums ${amountChanged ? 'border-[#F2D58A]' : ''}`} inputMode="decimal" value={amountStr} onChange={e => setAmountStr(e.target.value)} /></div>
              <div><FieldLabel required>Due date</FieldLabel><input className={SA_INPUT} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              {amountChanged && <div className="sm:col-span-2 lg:col-span-4"><FieldLabel required hint={`differs from grand total ${fmtMoney(inv.grand_total, inv.currency)}`}>Reason for changed amount</FieldLabel><input className={SA_INPUT} value={reason} onChange={e => setReason(e.target.value)} /></div>}
              <div><FieldLabel required={docType === 'PV'}>Bank</FieldLabel><input className={SA_INPUT} value={bank.bank_name} onChange={e => setBank(b => ({ ...b, bank_name: e.target.value }))} /></div>
              <div><FieldLabel required={docType === 'PV'}>Account name</FieldLabel><input className={SA_INPUT} value={bank.bank_account_name} onChange={e => setBank(b => ({ ...b, bank_account_name: e.target.value }))} /></div>
              <div className="lg:col-span-2"><FieldLabel required={docType === 'PV'} hint="last used for this vendor is suggested">Account no</FieldLabel><input className={`${SA_INPUT} tabular-nums`} value={bank.bank_account_no} onChange={e => setBank(b => ({ ...b, bank_account_no: e.target.value }))} /></div>
              <div className="sm:col-span-2 lg:col-span-4"><FieldLabel>Description</FieldLabel><input className={SA_INPUT} value={description} onChange={e => setDescription(e.target.value)} /></div>
            </div>

            <section>
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className={SA_LABEL}>Journal lines</div>
                <div className="flex gap-2">
                  <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} onClick={() => { setRows(defaultJournal(data, gl, amount ?? 0, wht, description)); setJournalTouched(false) }}><RotateCcw size={12} /> Reset</button>
                  <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} onClick={() => { setRows(p => [...p, { key: nk(), gl_account: '', description: '', debit: 0, credit: 0 }]); setJournalTouched(true) }}><Plus size={12} /> Line</button>
                </div>
              </div>
              {(!gl.ap_vendor || !gl.vat_in || !gl.wht_payable) && (
                <p className="text-[11.5px] text-[#7A4F00] mb-1.5">Default GL accounts for AP / VAT in / WHT are not configured yet — fill them in manually (ask Finance).</p>
              )}
              <div className="border border-[#EADFD6] rounded-xl overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[#FBF7F4]"><tr>{['GL account', 'Description', 'Debit', 'Credit', ''].map(h => <th key={h} className={`${SA_LABEL} px-2 py-1.5 text-left`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} className="border-t border-[#F3EEEA]">
                        <td className="px-2 py-1 w-[130px]"><input aria-label="GL account" className={`${SA_INPUT} h-8 ${!r.gl_account.trim() ? 'border-[#F4C3BC]' : ''}`} value={r.gl_account} onChange={e => editRow(r.key, { gl_account: e.target.value })} /></td>
                        <td className="px-2 py-1"><input aria-label="Description" className={`${SA_INPUT} h-8`} value={r.description} onChange={e => editRow(r.key, { description: e.target.value })} /></td>
                        <td className="px-2 py-1 w-[150px]"><input aria-label="Debit" className={`${SA_INPUT} h-8 text-right tabular-nums`} inputMode="decimal" value={r.debit ? String(r.debit) : ''} onChange={e => editRow(r.key, { debit: parseQtyInput(e.target.value) ?? 0 })} /></td>
                        <td className="px-2 py-1 w-[150px]"><input aria-label="Credit" className={`${SA_INPUT} h-8 text-right tabular-nums`} inputMode="decimal" value={r.credit ? String(r.credit) : ''} onChange={e => editRow(r.key, { credit: parseQtyInput(e.target.value) ?? 0 })} /></td>
                        <td className="px-2 py-1 w-[40px]"><button type="button" aria-label="Remove line" className="text-[#8A7A8B] hover:text-[#A8231A]" onClick={() => { setRows(p => p.filter(x => x.key !== r.key)); setJournalTouched(true) }}><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                    <tr className={`border-t-2 border-[#EADFD6] font-bold ${balanced ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>
                      <td className="px-2 py-1.5" colSpan={2}>{balanced ? 'Balanced' : `Not balanced (diff ${fmtNumber(round2(totals.d - totals.c))})`}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(totals.d)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(totals.c)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
          </>
        )}
      </div>
      <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex justify-end gap-2 sticky bottom-0">
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>{done ? 'Close' : 'Cancel'}</button>
        {hasNext && <button type="button" className={SA_BTN_OUTLINE} onClick={onNext} disabled={busy}>{done ? 'Next invoice' : 'Skip'}</button>}
        {!done && <button type="button" className={SA_BTN_PRIMARY} onClick={send} disabled={busy || !!activePayment || inv.status !== 'approved'}><Send size={13} /> {busy ? 'Sending…' : 'Send to Finance'}</button>}
      </div>
    </div>
  )
}
