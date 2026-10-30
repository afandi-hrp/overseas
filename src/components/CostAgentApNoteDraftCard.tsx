// Kartu "AP Note draft" di tab Payments (sql/104). Invoice berstatus approved + user boleh edit pembayaran -> draft terbentuk OTOMATIS saat tab dibuka.
// Edit: FPNo, Remarks, deskripsi / qty / harga satuan per baris, Rebuild dari invoice. CRUD murni supabase-js (RLS). "Post to Ascend" nonaktif (endpoint menyusul).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Send, Square, Wand2 } from 'lucide-react'
import CostAgentCoaPicker from './CostAgentCoaPicker'
import CostAgentApNotePreviewModal from './CostAgentApNotePreviewModal'
import { LoadingState } from './LoadingState'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_LABEL } from './SeaAirAuditUi'
import { Link2 } from 'lucide-react'
import MapToAscendDialog, { type MapTarget } from '../pages/cost-agent/settings/MapToAscendDialog'
import { autoMapAll, finCheck, finListMap, fracToPct, type AutoItem, type FinCheck } from '../pages/cost-agent/settings/financeApi'
import { fmtNumber } from '../utils/CostAgentHelpers'
import {
  apNoteDraftTotals, createApNoteDraft, effectiveApNoteIssues, fetchApNoteDraft, rebuildApNoteDraft,
  syncApNoteDraftMapping, updateApNoteDraftHeader, updateApNoteDraftLine, type ApNoteDraftFull, type ApNoteDraftLine,
} from '../utils/CostAgentApNoteDraft'

type Issue = ApNoteDraftFull['draft']['issues'][number]
type FieldKey = 'company' | 'supplier' | 'vessel' | 'note_type' | 'reference' | 'fp_no' | 'remarks' | 'description' | 'coa' | 'unit_price' | 'tax' | 'row'
// Isu dari RPC pratinjau (code + message + line_no) dipetakan ke field penyebabnya lewat teks pesan; tanpa kecocokan -> daftar "Other".
function issueField(i: Issue): FieldKey | null {
  const m = i.message.toLowerCase()
  if (i.line_no !== undefined) {
    if (m.includes('coa')) return 'coa'
    if (m.includes('ap note name')) return 'description'
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

export default function CostAgentApNoteDraftCard({ invoiceId, invoiceStatus, canEdit, actor, vendorName, vendorNpwp, vesselName, invoiceLines, onToast }: {
  invoiceId: number
  vendorName: string | null
  vendorNpwp: string | null
  vesselName: string | null
  invoiceLines: { id: number; cost_item_id: number | null }[] // baris invoice (modal) -> cost_item_id per baris draft
  invoiceStatus: string
  canEdit: boolean // canEdit('cost_agent_payment')
  actor: string | null
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [full, setFull] = useState<ApNoteDraftFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const costItemRef = useRef<Map<number, number | null>>(new Map())
  costItemRef.current = new Map(invoiceLines.map(l => [l.id, l.cost_item_id]))
  const syncedFor = useRef<number | null>(null)
  const autoTried = useRef<number | null>(null) // auto-create hanya SEKALI per invoice (hindari loop bila gagal)
  // Antrean dialog "Map to Ascend": 1 item (klik sel merah) atau banyak (Resolve). Selesai/Skip semua -> draft disinkronkan.
  const [queue, setQueue] = useState<MapTarget[]>([])
  const [queueTotal, setQueueTotal] = useState(0)
  const [mapDb, setMapDb] = useState<string | null>(null)
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [coaFor, setCoaFor] = useState<ApNoteDraftLine | null>(null)
  const stopRef = useRef(false)
  const aliasRef = useRef<Map<number, string>>(new Map())
  const [dirty, setDirty] = useState(false) // ada mapping tersimpan selama antrean berjalan -> sinkron saat antrean habis

  // Perbaiki mapping langsung dari sel merah: cek Finance mapping terbaru -> buka dialog "Map to Ascend" utk SATU target.
  const openMap = async (kind: 'supplier' | 'vessel' | 'expense', lineNo?: number, issueMsgs?: string[]) => {
    setBusy(true); setError(null)
    try {
      const c: FinCheck = await finCheck(invoiceId)
      if (!c.ascend_db || !c.company_code) throw new Error('The invoice has no company / Ascend database.')
      // Sudah terpetakan (isu di draft hanya snapshot lama) -> tidak perlu dialog, cukup sinkronkan draft.
      const nameKey = issueMsgs?.map(m => /cost item "(.+?)"/i.exec(m)?.[1]).find(Boolean)?.toLowerCase()
      const alreadyMapped = kind === 'supplier' ? c.supplier.status === 'mapped' : kind === 'vessel' ? c.vessel.status === 'mapped'
        : c.items.some(i => i.name.toLowerCase() === nameKey && i.status === 'mapped')
      if (alreadyMapped) { await syncDraft(); return }
      let target: MapTarget | null = null
      if (kind === 'supplier' && c.supplier.vendor_id) target = { kind, refId: c.supplier.vendor_id, company: c.company_code, label: vendorName || 'Vendor', npwp: vendorNpwp }
      else if (kind === 'vessel' && c.vessel.vessel_id) target = { kind, refId: c.vessel.vessel_id, company: c.company_code, label: vesselName || 'Vessel' }
      else if (kind === 'expense') {
        // nama jenis biaya diambil dari pesan isu baris itu ('cost item "X" is not mapped ...'), lalu dicocokkan ke hasil cek
        const name = issueMsgs?.map(m => /cost item "(.+?)"/i.exec(m)?.[1]).find(Boolean)?.toLowerCase()
        const item = c.items.find(i => i.name.toLowerCase() === name) ?? c.items.find(i => i.status === 'missing' && (lines.find(l => l.line_no === lineNo)?.description ?? '').toLowerCase().startsWith(i.name.toLowerCase()))
        if (item) {
          let alias: string | null = null
          try { alias = (await finListMap('expense', { limit: 500 })).rows.find(r => r.cost_item_id === item.cost_item_id)?.finance_alias ?? null } catch { /* tanpa alias */ }
          target = { kind, refId: item.cost_item_id, company: c.company_code, label: item.name, alias }
        }
      }
      if (!target) throw new Error('Could not find the item to map — use the Finance mapping card above.')
      setMapDb(c.ascend_db); setQueue([target]); setQueueTotal(1); setDirty(false)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const syncDraft = async () => {
    setBusy(true)
    try { setFull(await syncApNoteDraftMapping(full!.draft.id, invoiceId, actor, costItemRef.current)); onToast('Mapping saved — draft updated.') }
    catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const nextInQueue = (saved: boolean) => {
    const d2 = dirty || saved
    setDirty(d2)
    if (queue.length <= 1) { setQueue([]); if (d2) { setDirty(false); void syncDraft() } } else setQueue(q => q.slice(1))
  }
  // Resolve: map otomatis semua yang masih Missing, sisanya dibuka satu per satu di dialog (Cancel = lewati).
  const resolve = async () => {
    setError(null); stopRef.current = false
    try {
      const c = await finCheck(invoiceId)
      if (!c.ascend_db || !c.company_code) throw new Error('The invoice has no company / Ascend database.')
      const db = c.ascend_db, company = c.company_code
      try { aliasRef.current = new Map((await finListMap('expense', { limit: 500 })).rows.filter(r => r.finance_alias).map(r => [r.cost_item_id, r.finance_alias as string])) } catch { /* tanpa alias */ }
      const targetsOf = (x: FinCheck): MapTarget[] => {
        const t: MapTarget[] = []
        if (x.supplier.status === 'missing' && x.supplier.vendor_id) t.push({ kind: 'supplier', refId: x.supplier.vendor_id, company, label: vendorName || 'Vendor', npwp: vendorNpwp })
        if (x.vessel.status === 'missing' && x.vessel.vessel_id) t.push({ kind: 'vessel', refId: x.vessel.vessel_id, company, label: vesselName || 'Vessel' })
        x.items.filter(i => i.status === 'missing').forEach(i => t.push({ kind: 'expense', refId: i.cost_item_id, company, label: i.name, alias: aliasRef.current.get(i.cost_item_id) ?? null }))
        return t
      }
      const items: AutoItem[] = targetsOf(c).map(t => ({ kind: t.kind, refId: t.refId, company: t.company, database: db, name: t.label, npwp: t.npwp, alias: t.alias }))
      if (!items.length) { onToast('Nothing to resolve.'); return }
      setAuto({ done: 0, total: items.length })
      const sum = await autoMapAll(items, (done, total) => setAuto({ done, total }), () => stopRef.current)
      if (sum.failed && sum.firstError) onToast(sum.firstError, 'warn')
      else onToast(`${sum.mapped} mapped automatically, ${sum.needChoice} need your choice.`, sum.needChoice ? 'warn' : 'ok')
      const rest = stopRef.current ? [] : targetsOf(await finCheck(invoiceId))
      setMapDb(db); setDirty(sum.mapped > 0); setQueueTotal(rest.length); setQueue(rest)
      if (!rest.length && sum.mapped > 0) { setDirty(false); await syncDraft() }
    } catch (e: any) { setError(e?.message || String(e)) } finally { setAuto(null) }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let f = await fetchApNoteDraft(invoiceId)
      if (!f && canEdit && invoiceStatus === 'approved' && autoTried.current !== invoiceId) {
        autoTried.current = invoiceId
        f = await createApNoteDraft(invoiceId, actor, costItemRef.current)
      }
      // Isu draft = snapshot saat dibangun; mapping bisa berubah sesudahnya -> sinkron diam-diam sekali saat tab dibuka (edit manual tidak ditimpa).
      if (f && canEdit && (f.draft.status === 'draft' || f.draft.status === 'failed') && syncedFor.current !== invoiceId) {
        syncedFor.current = invoiceId
        try { f = (await syncApNoteDraftMapping(f.draft.id, invoiceId, actor, costItemRef.current)) ?? f } catch { /* tampilkan snapshot lama */ }
      }
      setFull(f)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }, [invoiceId, invoiceStatus, canEdit, actor])
  useEffect(() => { void load() }, [load])

  // Master Ascend yang dipakai vessel / supplier (dari cek Finance mapping); dimuat ulang setiap draft berubah (mis. setelah Map / sinkron).
  const [chk, setChk] = useState<FinCheck | null>(null)
  const draftStamp = full ? `${full.draft.id}|${full.draft.updated_at}` : null
  useEffect(() => { if (draftStamp) finCheck(invoiceId).then(setChk).catch(() => setChk(null)) }, [invoiceId, draftStamp])

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true); setError(null)
    try { await fn(); if (okMsg) onToast(okMsg) } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const rebuild = () => {
    if (!full || !window.confirm('Rebuild the draft from the invoice? Manual edits to this draft will be replaced.')) return
    void run(async () => setFull(await rebuildApNoteDraft(full.draft.id, invoiceId, actor, costItemRef.current)), 'Draft rebuilt from invoice.')
  }
  const saveHeader = (patch: { fp_no?: string | null; remarks?: string | null }) =>
    run(async () => { await updateApNoteDraftHeader(full!.draft.id, patch, actor); setFull(f => f && { ...f, draft: { ...f.draft, ...patch } }) })
  const saveLine = (l: ApNoteDraftLine, patch: Partial<Pick<ApNoteDraftLine, 'description' | 'qty' | 'unit_price' | 'account_id' | 'account_code' | 'account_name'>>) =>
    run(async () => { await updateApNoteDraftLine(l.id, patch); setFull(f => f && { ...f, lines: f.lines.map(x => x.id === l.id ? { ...x, ...patch } : x) }) })

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
  // Expense type tidak dipakai lagi (diganti COA per baris): isu expense type dibuang, isu "COA belum dipilih" dihitung dari baris.
  const eff = effectiveApNoteIssues(d, lines)
  const errors = eff.issues.filter(i => i.level === 'error')
  const warnings = eff.issues.filter(i => i.level === 'warning')
  const hMarks: Partial<Record<FieldKey, Mark>> = {}
  const lMarks: Record<number, Partial<Record<FieldKey, Mark>>> = {}
  const other: Issue[] = []
  const put = (bag: Partial<Record<FieldKey, Mark>>, f: FieldKey, i: Issue) => {
    const cur = bag[f]
    if (!cur) bag[f] = { level: i.level, msgs: [i.message] }
    else { cur.msgs.push(i.message); if (i.level === 'error') cur.level = 'error' }
  }
  for (const i of eff.issues) {
    const f = issueField(i)
    if (!f) { other.push(i); continue }
    if (i.line_no !== undefined) put((lMarks[i.line_no] ??= {}), f, i)
    else put(hMarks, f, i)
  }
  const cls = (m?: Mark) => (m ? MARK[m.level] : '')
  const tip = (m?: Mark) => m?.msgs.join('\n')
  const mapBtn = (f: FieldKey, onClick: () => void, m: Mark | undefined = hMarks[f]) => (canEdit && !busy && m?.level === 'error' && (f === 'supplier' || f === 'vessel') && m.msgs.some(x => /not mapped/i.test(x))
    ? <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6B3470] underline hover:no-underline" onClick={onClick}><Link2 size={11} /> Map to Ascend</button> : null)
  const ascendInfo = (f: FieldKey) => {
    const name = !chk ? null : f === 'vessel' ? (chk.vessel.status === 'mapped' ? [chk.vessel.vessel_code, chk.vessel.vessel_name].filter(Boolean).join(' - ') : null)
      : f === 'supplier' ? (chk.supplier.status === 'mapped' ? [chk.supplier.supplier_code, chk.supplier.supplier_name].filter(Boolean).join(' - ') : null) : null
    return name ? <div className="mt-0.5 text-[11.5px] font-semibold text-[#17663D] flex items-center gap-1 wrap-anywhere" title="Mapped to this Ascend master"><Link2 size={11} className="shrink-0" /> Ascend: {name}</div> : null
  }
  const hNote = (f: FieldKey) => hMarks[f] && <div className={`mt-0.5 text-[11px] leading-tight ${hMarks[f]!.level === 'error' ? 'text-[#A8231A]' : 'text-[#7A4F00]'}`}>{hMarks[f]!.msgs[0]}</div>
  const postable = d.status === 'draft' && eff.errors === 0 && lines.length > 0

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
          <div key={k} className={`min-w-0 rounded-md px-2 py-1 -mx-2 -my-1 ${cls(hMarks[f])}`} title={tip(hMarks[f])}><dt className={SA_LABEL}>{k}</dt><dd className="mt-0.5 wrap-anywhere">{v}</dd>{hNote(f)}{ascendInfo(f)}{mapBtn(f, () => openMap(f as 'supplier' | 'vessel', undefined, hMarks[f]?.msgs))}</div>
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
              <th className="px-2.5 py-2 w-8">#</th><th className="px-2.5 py-2">Description</th><th className="px-2.5 py-2">COA</th>
              <th className="px-2.5 py-2 text-right w-20">Qty</th><th className="px-2.5 py-2 text-right w-32">Unit price</th>
              <th className="px-2.5 py-2 text-right">PPN</th><th className="px-2.5 py-2 text-right">PPh</th><th className="px-2.5 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-[#6E5E70] italic">No lines in this draft.</td></tr>}
            {lines.map(l => {
              const lm = (l.line_no !== null && lMarks[l.line_no]) || {}
              return (
              <tr key={l.id} className="border-t border-[#F3EEEA] align-middle">
                <td className={`px-2.5 py-1.5 text-[#8A7A8B] ${cls(lm.row)}`} title={tip(lm.row)}>{l.line_no ?? '—'}</td>
                <td className="px-2 py-1"><input className={`${INPUT} ${cls(lm.description)}`} title={tip(lm.description)} defaultValue={l.description ?? ''} disabled={!editable}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (l.description ?? '')) void saveLine(l, { description: v }) }} /></td>
                <td className={`px-2 py-1 ${cls(lm.coa)}`} title={tip(lm.coa)}>
                  <button type="button" disabled={!editable || !d.ascend_db} onClick={() => setCoaFor(l)} data-coa-cell
                    className={`w-full text-left rounded-md px-2 py-1 text-[12.5px] disabled:cursor-default ${l.account_id ? 'text-[#3B1B3D] hover:bg-[#F6EFF7]' : 'font-semibold text-[#A8231A] underline hover:no-underline'}`}>
                    {l.account_id ? <><span className="font-semibold tabular-nums text-[#5A305A]">{l.account_code}</span> <span className="text-[#6E5E70]">{l.account_name}</span></> : 'Select COA'}
                  </button>
                </td>
                <td className="px-2 py-1"><input className={`${INPUT} text-right`} inputMode="decimal" defaultValue={String(l.qty)} disabled={!editable}
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0 && v !== Number(l.qty)) void saveLine(l, { qty: v }); else e.target.value = String(l.qty) }} /></td>
                <td className="px-2 py-1"><input className={`${INPUT} text-right ${cls(lm.unit_price)}`} title={tip(lm.unit_price)} inputMode="decimal" defaultValue={String(l.unit_price)} disabled={!editable}
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v !== Number(l.unit_price)) void saveLine(l, { unit_price: v }); else e.target.value = String(l.unit_price) }} /></td>
                <td className={`px-2.5 py-1.5 text-right tabular-nums ${cls(lm.tax)}`} title={tip(lm.tax)}>{pct(l.ppn_rate)}</td>
                <td className={`px-2.5 py-1.5 text-right tabular-nums ${cls(lm.tax)}`} title={tip(lm.tax)}>{pct(l.pph_rate)}{l.pph_type ? <span className="text-[#8A7A8B]"> · {l.pph_type}</span> : null}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{rp(Number(l.qty) * Number(l.unit_price))}</td>
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
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => setShowPreview(true)} disabled={!!auto}><FileSpreadsheet size={13} /> Preview / Excel</button>
        {canEdit && (d.status === 'draft' || d.status === 'failed') && (auto ? (
          <>
            <span className="text-[12px] font-semibold text-[#5A305A] tabular-nums" role="status">Resolving {auto.done}/{auto.total}</span>
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => { stopRef.current = true }}><Square size={12} /> Stop</button>
          </>
        ) : (
          <button type="button" className={SA_BTN_OUTLINE} onClick={resolve} disabled={busy || errors.length === 0} title={errors.length === 0 ? 'Nothing to resolve' : 'Auto-map everything still missing'}><Wand2 size={13} /> Resolve mapping</button>
        ))}
        {canEdit && (d.status === 'draft' || d.status === 'failed') && (
          <button type="button" className={SA_BTN_OUTLINE} onClick={rebuild} disabled={busy}><RefreshCw size={13} /> Rebuild from invoice</button>
        )}
        <button type="button" className={SA_BTN_PRIMARY} disabled title={postable ? 'Waiting for the Ascend AP Note endpoint' : 'Fix the errors first'}><Send size={13} /> Post to Ascend</button>
      </div>
      {queue[0] && mapDb && (
        <MapToAscendDialog target={queue[0]} database={mapDb} progress={queueTotal > 1 ? `Item ${queueTotal - queue.length + 1} of ${queueTotal}` : undefined}
          toast={(m, tone) => onToast(m, tone === 'ok' ? 'ok' : 'warn')} onClose={() => nextInQueue(false)} onSaved={() => nextInQueue(true)} />
      )}
      {coaFor && d.ascend_db && (
        <CostAgentCoaPicker database={d.ascend_db} title={`Line ${coaFor.line_no ?? ''} · ${coaFor.description ?? ''}`} current={{ id: coaFor.account_id, code: coaFor.account_code, name: coaFor.account_name }}
          onClose={() => setCoaFor(null)}
          onPick={a => { const l = coaFor; setCoaFor(null); void saveLine(l, { account_id: a.id, account_code: a.code, account_name: a.name }) }} />
      )}
      {showPreview && <CostAgentApNotePreviewModal invoiceId={invoiceId} onToast={onToast} onClose={() => setShowPreview(false)} />}
    </section>
  )
}
