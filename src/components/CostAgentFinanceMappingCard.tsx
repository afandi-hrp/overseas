// Kartu "Finance mapping" di tab Payments detail invoice Cost Agent (2026-10-28, sql/084) -- INFORMASI saja: apakah supplier, kapal dan tiap jenis biaya
// invoice ini sudah dipetakan ke master Ascend (fn_cost_agent_finance_check). TIDAK memblokir verifikasi / approval; pengiriman AP Note dibahas di tahap
// berikutnya. "Resolve": pemetaan otomatis hanya untuk item invoice ini, sisanya dibuka satu per satu di dialog "Map to Ascend" (Skip = lewati).
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Wand2, Square, FileSpreadsheet } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_LABEL } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import CostAgentApNotePreviewModal from './CostAgentApNotePreviewModal'
import MapToAscendDialog, { type MapTarget } from '../pages/cost-agent/settings/MapToAscendDialog'
import { autoMapAll, finCheck, finListMap, type AutoItem, type FinCheck } from '../pages/cost-agent/settings/financeApi'

const Status = ({ ok, text }: { ok: boolean; text?: string }) => <Chip tone={ok ? 'green' : 'amber'}>{text ?? (ok ? 'Mapped' : 'Missing')}</Chip>

export default function CostAgentFinanceMappingCard({ invoiceId, vendorName, vendorNpwp, vesselName, canEdit, onGoToLine, onToast }: {
  invoiceId: number
  vendorName: string | null
  vendorNpwp: string | null
  vesselName: string | null
  canEdit: boolean
  onGoToLine?: (lineNo: number, lineId: number | null) => void // dari modal AP Note preview
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [chk, setChk] = useState<FinCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null)
  const [queue, setQueue] = useState<MapTarget[]>([])
  const [queueTotal, setQueueTotal] = useState(0)
  const stopRef = useRef(false)
  const [showPreview, setShowPreview] = useState(false)
  const aliases = useRef<Map<number, string>>(new Map()) // AP Note name per jenis biaya (dipakai utk pencarian di Ascend)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try { setChk(await finCheck(invoiceId)); setError(null) }
    catch (e: any) { setError(e?.message || String(e)) }
    finally { setLoading(false) }
  }, [invoiceId])
  useEffect(() => { load() }, [load])

  const missingSupplier = chk?.supplier.status === 'missing'
  const missingVessel = chk?.vessel.status === 'missing'
  const missingItems = chk?.items.filter(i => i.status === 'missing') ?? []
  const canResolve = canEdit && !!chk?.ascend_db && (missingSupplier || missingVessel || missingItems.length > 0)

  // Target dialog utk semua yang masih Missing (dari hasil cek terbaru).
  const targetsOf = (c: FinCheck): MapTarget[] => {
    const alias = (id: number) => aliases.current.get(id) ?? null
    const t: MapTarget[] = []
    if (c.supplier.status === 'missing' && c.supplier.vendor_id && c.company_code) t.push({ kind: 'supplier', refId: c.supplier.vendor_id, company: c.company_code, label: vendorName || 'Vendor', npwp: vendorNpwp })
    if (c.vessel.status === 'missing' && c.vessel.vessel_id && c.company_code) t.push({ kind: 'vessel', refId: c.vessel.vessel_id, company: c.company_code, label: vesselName || 'Vessel' })
    c.items.filter(i => i.status === 'missing').forEach(i => t.push({ kind: 'expense', refId: i.cost_item_id, company: c.company_code as string, label: i.name, alias: alias(i.cost_item_id) }))
    return t
  }

  const resolve = async () => {
    if (!chk?.ascend_db) return
    const db = chk.ascend_db
    stopRef.current = false
    try {
      // Satu panggilan: AP Note name semua jenis biaya (pencarian jenis biaya memakai alias lebih dulu, lalu nama).
      const ex = await finListMap('expense', { limit: 500 })
      aliases.current = new Map(ex.rows.filter(r => r.finance_alias).map(r => [r.cost_item_id, r.finance_alias as string]))
    } catch { /* tanpa alias: pencarian memakai nama jenis biaya */ }
    const items: AutoItem[] = targetsOf(chk).map(t => ({ kind: t.kind, refId: t.refId, company: t.company, database: db, name: t.label, npwp: t.npwp, alias: t.alias }))
    setAuto({ done: 0, total: items.length })
    try {
      const sum = await autoMapAll(items, (done, total) => setAuto({ done, total }), () => stopRef.current)
      if (sum.failed && sum.firstError) onToast(sum.firstError, 'warn')
      else onToast(`${sum.mapped} mapped automatically, ${sum.needChoice} need your choice.`, sum.needChoice ? 'warn' : 'ok')
      const fresh = await finCheck(invoiceId)
      setChk(fresh); setError(null)
      if (!stopRef.current) { const rest = targetsOf(fresh); setQueue(rest); setQueueTotal(rest.length) }
    } catch (e: any) { onToast(e?.message || String(e), 'warn') } finally { setAuto(null) }
  }

  const current = queue[0]
  const next = () => { setQueue(q => q.slice(1)); if (queue.length <= 1) load(true) }

  if (loading) return <div className={`${SA_CARD} p-4 flex items-center gap-2 text-[12.5px] text-[#6E5E70]`}><LoadingSpinner /> Checking Finance mapping…</div>
  if (error || !chk) return (
    <div className={`${SA_CARD} p-4 flex items-center gap-3 text-[12.5px] text-[#A8231A]`} role="alert">
      <AlertTriangle size={14} /> <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">Finance mapping: {error || 'no data'}</span>
      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} onClick={() => load()}>Retry</button>
    </div>
  )

  const supOk = chk.supplier.status === 'mapped'
  const vesOk = chk.vessel.status === 'mapped'
  const itemsMapped = chk.items.filter(i => i.status === 'mapped').length
  const totalN = 2 + chk.items.length
  const mappedN = (supOk ? 1 : 0) + (vesOk ? 1 : 0) + itemsMapped
  const pct = totalN > 0 ? Math.round((mappedN / totalN) * 100) : 0
  const missingN = totalN - mappedN
  // Tile Supplier / Vessel: status + nama Ascend (atau penjelasan bila belum bisa dipetakan).
  const tile = (label: string, ok: boolean, none: string | null, name: string | null) => (
    <div className={`rounded-xl border px-3 py-2.5 min-w-0 ${none ? 'border-[#F2D58A] bg-[#FFFDF6]' : ok ? 'border-[#EADFD6] bg-white' : 'border-l-4 border-[#EADFD6] border-l-[#E0A526] bg-[#FFFDF6]'}`} data-fin-tile={label.toLowerCase()}>
      <div className="flex items-center gap-2">
        <span className={SA_LABEL}>{label}</span>
        {none ? <Chip tone="amber">{none}</Chip> : <Status ok={ok} />}
      </div>
      <div className={`mt-1 text-[12.5px] [overflow-wrap:anywhere] ${ok ? 'font-semibold text-[#3B1B3D]' : 'text-[#8A7A8B] italic'}`}>{ok && name ? name : none ? '—' : 'Not mapped to Ascend yet'}</div>
    </div>
  )
  return (
    <section className={`${SA_CARD} p-4 space-y-3 @container`} data-finance-mapping-card>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold text-[#3B1B3D]">Finance mapping</h3>
        {chk.ascend_db ? <Chip tone="plum">{chk.ascend_db}</Chip> : <Chip tone="amber">No Ascend database</Chip>}
        <span className="ml-auto flex items-center gap-2">
          <span className={SA_LABEL}>Ready for AP Note</span>
          {chk.ready ? <Chip tone="green"><CheckCircle2 size={11} /> Yes</Chip> : <Chip tone="amber">No</Chip>}
        </span>
      </div>

      <div className="flex items-center gap-3" data-fin-progress>
        <div className="h-1.5 flex-1 rounded-full bg-[#EDE5EC] overflow-hidden"><div className={`h-full rounded-full ${missingN === 0 ? 'bg-[#2F9E63]' : 'bg-[#6B3470]'}`} style={{ width: `${pct}%` }} /></div>
        <span className="text-[12px] font-semibold tabular-nums text-[#3B1B3D] whitespace-nowrap">{mappedN} of {totalN} mapped</span>
      </div>

      <div className="grid grid-cols-1 @min-[560px]:grid-cols-2 gap-2.5">
        {tile('Supplier', supOk, chk.supplier.status === 'no_vendor' ? 'No vendor on invoice' : null, [chk.supplier.supplier_code, chk.supplier.supplier_name].filter(Boolean).join(' - '))}
        {tile('Vessel', vesOk, chk.vessel.status === 'no_vessel' ? 'No vessel on invoice' : null, [chk.vessel.vessel_code, chk.vessel.vessel_name].filter(Boolean).join(' - '))}
      </div>

      <div className="rounded-xl border border-[#EADFD6] overflow-hidden" data-fin-items>
        <div className="flex items-center gap-2 px-3 py-2 bg-[#FBF7F4] border-b border-[#EADFD6]">
          <span className={SA_LABEL}>Cost items</span>
          <span className="text-[11.5px] text-[#6E5E70] tabular-nums">{chk.items.length}</span>
          {chk.items.length - itemsMapped > 0 && <Chip tone="amber">{chk.items.length - itemsMapped} missing</Chip>}
          {chk.items.length > 0 && chk.items.length === itemsMapped && <Chip tone="green">all mapped</Chip>}
        </div>
        {chk.items.length === 0 && <p className="px-3 py-3 text-[12.5px] text-[#6E5E70] italic">No lines with a cost item</p>}
        {chk.items.length > 0 && (
          <div className="max-h-[22rem] overflow-y-auto">
            <div className="hidden @min-[620px]:grid grid-cols-[88px_minmax(0,1.1fr)_64px_minmax(0,1fr)] gap-x-3 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] border-b border-[#F3EEEA]">
              <span>Status</span><span>Cost item</span><span className="text-right">Lines</span><span>Ascend expense type</span>
            </div>
            {chk.items.map(i => {
              const ok = i.status === 'mapped'
              const asc = ok && i.expense_type_desc ? `${i.expense_type_desc}${i.account_name ? ` (${i.account_name})` : ''}` : null
              return (
                <div key={i.cost_item_id} data-fin-item={i.status}
                  className={`grid grid-cols-[88px_minmax(0,1fr)_auto] @min-[620px]:grid-cols-[88px_minmax(0,1.1fr)_64px_minmax(0,1fr)] gap-x-3 gap-y-0.5 items-center px-3 py-2 border-t border-[#F3EEEA] first:border-t-0 border-l-4 ${ok ? 'border-l-transparent odd:bg-white even:bg-[#FCFAF8]' : 'border-l-[#E0A526] bg-[#FFFDF6]'}`}>
                  <span><Status ok={ok} /></span>
                  <span className="text-[12.5px] font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{i.name}</span>
                  <span className="text-[11.5px] text-[#6E5E70] tabular-nums text-right whitespace-nowrap">{i.lines} line{i.lines === 1 ? '' : 's'}</span>
                  <span className={`col-span-3 @min-[620px]:col-span-1 text-[12px] [overflow-wrap:anywhere] ${asc ? 'text-[#3B1B3D]' : 'text-[#B9A9BA] italic'}`}>{asc ?? (ok ? '—' : 'Not mapped yet')}</span>
                </div>
              )
            })}
          </div>
        )}
        {chk.lines_without_cost_item > 0 && (
          <div className="px-3 py-2 border-t border-[#F3EEEA] bg-[#FFFDF6]"><Chip tone="amber">{chk.lines_without_cost_item} line{chk.lines_without_cost_item === 1 ? '' : 's'} without cost item</Chip></div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <p className="text-[11.5px] text-[#6E5E70] flex-1 min-w-[200px]">Information only — this does not block verification or approval.</p>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => setShowPreview(true)} disabled={!!auto}><FileSpreadsheet size={13} /> Preview AP Note</button>
        {auto ? (
          <>
            <span className="text-[12px] font-semibold text-[#5A305A] tabular-nums" role="status">Resolving {auto.done}/{auto.total}</span>
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => { stopRef.current = true }}><Square size={12} /> Stop</button>
          </>
        ) : (
          <button type="button" className={SA_BTN_PRIMARY} onClick={resolve} disabled={!canResolve}
            title={!canEdit ? 'You have no edit access' : !chk.ascend_db ? 'The invoice has no company / Ascend database' : canResolve ? undefined : 'Nothing to resolve'}><Wand2 size={13} /> Resolve</button>
        )}
      </div>

      {showPreview && <CostAgentApNotePreviewModal invoiceId={invoiceId} onToast={onToast} onClose={() => setShowPreview(false)} onGoToLine={onGoToLine ? (n, id) => { setShowPreview(false); onGoToLine(n, id) } : undefined} />}

      {current && chk.ascend_db && (
        <MapToAscendDialog target={current} database={chk.ascend_db} progress={`Item ${queueTotal - queue.length + 1} of ${queueTotal}`}
          toast={(m, tone) => onToast(m, tone === 'ok' ? 'ok' : 'warn')} onClose={next} onSaved={next} />
      )}
    </section>
  )
}
