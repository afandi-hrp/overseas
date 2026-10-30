// Kartu "AP Note draft" di tab Payments (sql/104). Invoice berstatus approved + user boleh edit pembayaran -> draft terbentuk OTOMATIS saat tab dibuka.
// Edit: FPNo, Remarks, deskripsi / qty / harga satuan per baris, hapus baris, Rebuild dari invoice. CRUD murni supabase-js (RLS). "Post to Ascend" nonaktif (endpoint menyusul).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Send, Trash2 } from 'lucide-react'
import { LoadingState } from './LoadingState'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_LABEL } from './SeaAirAuditUi'
import { fracToPct } from '../pages/cost-agent/settings/financeApi'
import { fmtNumber } from '../utils/CostAgentHelpers'
import {
  apNoteDraftTotals, createApNoteDraft, deleteApNoteDraftLine, fetchApNoteDraft, rebuildApNoteDraft,
  updateApNoteDraftHeader, updateApNoteDraftLine, type ApNoteDraftFull, type ApNoteDraftLine,
} from '../utils/CostAgentApNoteDraft'

type Issue = ApNoteDraftFull['draft']['issues'][number]
type FieldKey = 'company' | 'supplier' | 'vessel' | 'note_type' | 'reference' | 'fp_no' | 'remarks' | 'description' | 'expense_type' | 'unit_price' | 'tax' | 'row'
// Isu dari RPC pratinjau (code + message + line_no) dipetakan ke field penyebabnya lewat teks pesan; tanpa kecocokan -> daftar "Other".
function issueField(i: Issue): FieldKey | null {
  const m = i.message.toLowerCase()
  if (i.line_no !== undefined) {
    if (m.includes('ap note name')) return 'description'
    if (m.includes('expense type') || m.includes('not mapped')) return 'expense_type'
    if (m.includes('tax') || m.includes('ppn') || m.includes('pph')) return 'tax'
    if (m.includes('amount') || m.includes('zero') || m.includes('negative')) return 'unit_price'
    return 'row'
  }
  if (m.includes('grand total')) return null
  if (m.includes('vessel')) return 'vessel'
  if (m.includes('supplier') || m.includes('vendor')) return 'supplier'
  if (m.includes('office') || m.includes('apnote type') || m.includes('note type')) return 'note_type'
  if (m.includes('fpno') || m.includes('faktur')) return 'fp_no'
  if (m.includes('remarks')) return 'remarks'
  if (m.includes('company')) return 'company'
  if (m.includes('invoice number') || m.includes('reference') || m.includes('date')) return 'reference'
  return null
}
type Mark = { level: 'error' | 'warning'; msgs: string[] }
const MARK = { error: 'bg-[#FDE7E4] ring-1 ring-inset ring-[#E8A29A]', warning: 'bg-[#FFF8E6] ring-1 ring-inset ring-[#E8C766]' }
const rp = (v: number) => fmtNumber(v, 0)
const pct = (v: number | null) => (v === null ? '—' : `${fracToPct(v)}%`)
const STATUS_TONE: Record<string, 'grey' | 'plum' | 'green' | 'red' | 'amber'> = { draft: 'amber', posting: 'plum', posted: 'green', failed: 'red', cancelled: 'grey' }
const INPUT = 'w-full h-8 px-2 rounded-md border border-[#EADFD6] bg-white text-[12.5px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] disabled:bg-[#F6EFEA] disabled:text-[#6E5E70]'

export default function CostAgentApNoteDraftCard({ invoiceId, invoiceStatus, canEdit, actor, onToast }: {
  invoiceId: number
  invoiceStatus: string
  canEdit: boolean // canEdit('cost_agent_payment')
  actor: string | null
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [full, setFull] = useState<ApNoteDraftFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoTried = useRef<number | null>(null) // auto-create hanya SEKALI per invoice (hindari loop bila gagal)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let f = await fetchApNoteDraft(invoiceId)
      if (!f && canEdit && invoiceStatus === 'approved' && autoTried.current !== invoiceId) {
        autoTried.current = invoiceId
        f = await createApNoteDraft(invoiceId, actor)
      }
      setFull(f)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }, [invoiceId, invoiceStatus, canEdit, actor])
  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true); setError(null)
    try { await fn(); if (okMsg) onToast(okMsg) } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const rebuild = () => {
    if (!full || !window.confirm('Rebuild the draft from the invoice? Manual edits to this draft will be replaced.')) return
    void run(async () => setFull(await rebuildApNoteDraft(full.draft.id, invoiceId, actor)), 'Draft rebuilt from invoice.')
  }
  const saveHeader = (patch: { fp_no?: string | null; remarks?: string | null }) =>
    run(async () => { await updateApNoteDraftHeader(full!.draft.id, patch, actor); setFull(f => f && { ...f, draft: { ...f.draft, ...patch } }) })
  const saveLine = (l: ApNoteDraftLine, patch: Partial<Pick<ApNoteDraftLine, 'description' | 'qty' | 'unit_price'>>) =>
    run(async () => { await updateApNoteDraftLine(l.id, patch); setFull(f => f && { ...f, lines: f.lines.map(x => x.id === l.id ? { ...x, ...patch } : x) }) })
  const removeLine = (l: ApNoteDraftLine) => {
    if (!window.confirm(`Remove line ${l.line_no ?? ''} from this draft? (The invoice itself is not changed.)`)) return
    void run(async () => { await deleteApNoteDraftLine(l.id); setFull(f => f && { ...f, lines: f.lines.filter(x => x.id !== l.id) }) })
  }

  if (loading && !full) return <div className={`${SA_CARD} p-4`}><LoadingState fullHeight={false} /></div>
  if (!full) {
    return (
      <div className={`${SA_CARD} p-4 text-[12.5px] text-[#6E5E70]`}>
        <b className="text-[#3B1B3D]">AP Note draft</b> — {invoiceStatus === 'approved' ? (canEdit ? 'could not be created yet.' : 'not created yet.') : 'created automatically once the invoice is approved.'}
        {error && <span className="ml-2 text-[#A8231A]">{error}</span>}
        {canEdit && invoiceStatus === 'approved' && <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5 ml-3`} onClick={() => { autoTried.current = null; void load() }}>Retry</button>}
      </div>
    )
  }

  const { draft: d, lines } = full
  const editable = canEdit && (d.status === 'draft' || d.status === 'failed') && !busy
  const t = apNoteDraftTotals(lines)
  const errors = d.issues.filter(i => i.level === 'error')
  const warnings = d.issues.filter(i => i.level === 'warning')
  const hMarks: Partial<Record<FieldKey, Mark>> = {}
  const lMarks: Record<number, Partial<Record<FieldKey, Mark>>> = {}
  const other: Issue[] = []
  const put = (bag: Partial<Record<FieldKey, Mark>>, f: FieldKey, i: Issue) => {
    const cur = bag[f]
    if (!cur) bag[f] = { level: i.level, msgs: [i.message] }
    else { cur.msgs.push(i.message); if (i.level === 'error') cur.level = 'error' }
  }
  for (const i of d.issues) {
    const f = issueField(i)
    if (!f) { other.push(i); continue }
    if (i.line_no !== undefined) put((lMarks[i.line_no] ??= {}), f, i)
    else put(hMarks, f, i)
  }
  const cls = (m?: Mark) => (m ? MARK[m.level] : '')
  const tip = (m?: Mark) => m?.msgs.join('\n')
  const hNote = (f: FieldKey) => hMarks[f] && <div className={`mt-0.5 text-[11px] leading-tight ${hMarks[f]!.level === 'error' ? 'text-[#A8231A]' : 'text-[#7A4F00]'}`}>{hMarks[f]!.msgs[0]}</div>
  const postable = d.status === 'draft' && d.errors === 0 && lines.length > 0

  return (
    <section className={`${SA_CARD} p-4 space-y-3`} data-apnote-draft>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">AP Note draft</h3>
        <Chip tone={STATUS_TONE[d.status] || 'grey'}>{d.status[0].toUpperCase() + d.status.slice(1)}</Chip>
        {d.ascend_number && <b className="text-[12.5px] text-[#17663D]">{d.ascend_number}</b>}
        <span className="ml-auto text-[11.5px] text-[#8A7A8B]">built {new Date(d.built_at).toLocaleString('en-GB')} · {d.updated_by || d.created_by || '—'}</span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2 text-[12.5px] text-[#3B1B3D]">
        {([['company', 'Company / DB', [d.company_code, d.ascend_db].filter(Boolean).join(' · ') || '—'], ['supplier', 'Supplier', d.supplier_code ? `${d.supplier_code}${d.supplier_name ? ` - ${d.supplier_name}` : ''}` : '—'],
          ['vessel', 'Vessel', d.vessel_name || '—'], ['note_type', 'ApNote type / Office', [d.note_type, d.office].filter(Boolean).join(' · ') || '—'], ['reference', 'Reference', d.reference || '—']] as [FieldKey, string, string][]).map(([f, k, v]) => (
          <div key={k} className={`min-w-0 rounded-md px-2 py-1 -mx-2 -my-1 ${cls(hMarks[f])}`} title={tip(hMarks[f])}><dt className={SA_LABEL}>{k}</dt><dd className="mt-0.5 wrap-anywhere">{v}</dd>{hNote(f)}</div>
        ))}
        <div><dt className={SA_LABEL}>FPNo</dt>
          <input className={`${INPUT} ${cls(hMarks.fp_no)}`} title={tip(hMarks.fp_no)} defaultValue={d.fp_no ?? ''} disabled={!editable} key={`fp${d.built_at}`}
            onBlur={e => { const v = e.target.value.trim() || null; if (v !== (d.fp_no || null)) void saveHeader({ fp_no: v }) }} />{hNote('fp_no')}</div>
        <div className="sm:col-span-2"><dt className={SA_LABEL}>Remarks</dt>
          <input className={`${INPUT} ${cls(hMarks.remarks)}`} title={tip(hMarks.remarks)} defaultValue={d.remarks ?? ''} disabled={!editable} key={`rm${d.built_at}`}
            onBlur={e => { const v = e.target.value.trim() || null; if (v !== (d.remarks || null)) void saveHeader({ remarks: v }) }} />{hNote('remarks')}</div>
      </dl>

      <div className="rounded-xl border border-[#EADFD6] overflow-x-auto">
        <table className="min-w-full text-[12.5px] text-[#3B1B3D]">
          <thead>
            <tr className="bg-[#FBF7F4] border-b border-[#EADFD6] text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70]">
              <th className="px-2.5 py-2 w-8">#</th><th className="px-2.5 py-2">Description</th><th className="px-2.5 py-2">Expense type</th>
              <th className="px-2.5 py-2 text-right w-20">Qty</th><th className="px-2.5 py-2 text-right w-32">Unit price</th>
              <th className="px-2.5 py-2 text-right">PPN</th><th className="px-2.5 py-2 text-right">PPh</th><th className="px-2.5 py-2 text-right">Amount</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-[#6E5E70] italic">No lines in this draft.</td></tr>}
            {lines.map(l => {
              const lm = (l.line_no !== null && lMarks[l.line_no]) || {}
              return (
              <tr key={l.id} className="border-t border-[#F3EEEA] align-middle">
                <td className={`px-2.5 py-1.5 text-[#8A7A8B] ${cls(lm.row)}`} title={tip(lm.row)}>{l.line_no ?? '—'}</td>
                <td className="px-2 py-1"><input className={`${INPUT} ${cls(lm.description)}`} title={tip(lm.description)} defaultValue={l.description ?? ''} disabled={!editable}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (l.description ?? '')) void saveLine(l, { description: v }) }} /></td>
                <td className={`px-2.5 py-1.5 ${cls(lm.expense_type)}`} title={tip(lm.expense_type)}>{l.expense_type || <Chip tone="amber">Not mapped</Chip>}</td>
                <td className="px-2 py-1"><input className={`${INPUT} text-right`} inputMode="decimal" defaultValue={String(l.qty)} disabled={!editable}
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0 && v !== Number(l.qty)) void saveLine(l, { qty: v }); else e.target.value = String(l.qty) }} /></td>
                <td className="px-2 py-1"><input className={`${INPUT} text-right ${cls(lm.unit_price)}`} title={tip(lm.unit_price)} inputMode="decimal" defaultValue={String(l.unit_price)} disabled={!editable}
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v !== Number(l.unit_price)) void saveLine(l, { unit_price: v }); else e.target.value = String(l.unit_price) }} /></td>
                <td className={`px-2.5 py-1.5 text-right tabular-nums ${cls(lm.tax)}`} title={tip(lm.tax)}>{pct(l.ppn_rate)}</td>
                <td className={`px-2.5 py-1.5 text-right tabular-nums ${cls(lm.tax)}`} title={tip(lm.tax)}>{pct(l.pph_rate)}{l.pph_type ? <span className="text-[#8A7A8B]"> · {l.pph_type}</span> : null}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{rp(Number(l.qty) * Number(l.unit_price))}</td>
                <td className="px-1">{editable && <button type="button" title="Remove line" className="p-1 text-[#A8231A] hover:bg-[#FDE7E4] rounded" onClick={() => removeLine(l)}><Trash2 size={13} /></button>}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 items-start justify-between">
        <div className="space-y-2 min-w-0 flex-1 basis-72">
          {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-start gap-1.5" role="alert"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
          {d.post_error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">Last post failed: {d.post_error}</div>}
          {errors.length === 0 ? (
            <div className="rounded-lg border border-[#BFE3CC] bg-[#EAF6EF] px-3 py-2 text-[12.5px] font-semibold text-[#17663D] flex items-center gap-1.5"><CheckCircle2 size={14} /> Ready to post</div>
          ) : (
            <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">
              <div className="font-bold">{errors.length} error{errors.length === 1 ? '' : 's'} — red cells above; fix the mapping / invoice, then Rebuild</div>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00]">
              <div className="font-bold">{warnings.length} warning{warnings.length === 1 ? '' : 's'} — yellow cells above (hover for details)</div>
            </div>
          )}
          {other.length > 0 && (
            <div className="rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-2 text-[12.5px] text-[#3B1B3D]">
              <div className="font-bold mb-1">Other</div>
              <ul className="space-y-0.5">{other.map((i, n) => <li key={n} className={i.level === 'error' ? 'text-[#A8231A]' : 'text-[#7A4F00]'}>• {i.message}</li>)}</ul>
            </div>
          )}
        </div>
        <dl className="space-y-1 text-[12.5px] text-[#3B1B3D] w-64 shrink-0">
          {([['Subtotal', t.subtotal], ['PPN', t.ppn], ['PPh', t.pph], ['Total incl. PPN', t.totalWithPpn]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-[#6E5E70]">{k}</dt><dd className="tabular-nums font-semibold">{rp(v)}</dd></div>
          ))}
          <div className="flex justify-between gap-4 pt-1 border-t border-[#EADFD6]"><dt className="text-[#6E5E70]">Total after PPh</dt><dd className="tabular-nums font-bold">{rp(t.totalAfterPph)}</dd></div>
        </dl>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {canEdit && (d.status === 'draft' || d.status === 'failed') && (
          <button type="button" className={SA_BTN_OUTLINE} onClick={rebuild} disabled={busy}><RefreshCw size={13} /> Rebuild from invoice</button>
        )}
        <button type="button" className={SA_BTN_PRIMARY} disabled title={postable ? 'Waiting for the Ascend AP Note endpoint' : 'Fix the errors first'}><Send size={13} /> Post to Ascend</button>
      </div>
    </section>
  )
}
