// Dialog tab "Cost Items" hub Cost Agent Settings (2026-10-26): Learned aliases, Re-classify open invoices, Rename category. RPC sql/076-077
// (fn_cost_agent_list_aliases / update_alias / delete_alias / reclassify_open_lines / rename_category). Bentuk baris hasil dibaca TOLERAN
// (nama field bisa beda) -- RPC ini belum terbaca di DB production saat dibuat; error RPC ditampilkan apa adanya.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, MoveRight } from 'lucide-react'
import { CostAgentCombobox, CostAgentModal, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fmtDateTimePort, fmtNumber, type CostAgentCostItem } from '../../../utils/CostAgentHelpers'
import { hubListAliases, hubUpdateAlias, hubDeleteAlias, hubReclassify, hubRenameCategory } from './hubApi'
import { ConfirmModal, ErrorBox, Field, StateRow, TD, TH, useAsync, useDebounced, type HubCtx } from './hubUi'

const pick = (o: Record<string, any> | null | undefined, ...keys: string[]) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null }

// ─── Learned aliases ────────────────────────────────────────────────────────────────────────────────────────
export function AliasesDialog({ costItemId, title, items, editable, toast, onClose, onChanged }: {
  costItemId: number | null; title: string; items: CostAgentCostItem[]; editable: boolean; toast: HubCtx['toast']; onClose: () => void; onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const { data, loading, error, reload } = useAsync(() => hubListAliases(costItemId, q || null, 100), [costItemId, q])
  const rows = data?.rows || []
  const [moveFor, setMoveFor] = useState<Record<string, any> | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [delFor, setDelFor] = useState<Record<string, any> | null>(null)
  const [busy, setBusy] = useState(false)
  const [dlgError, setDlgError] = useState<string | null>(null)
  const opts: ComboOption[] = useMemo(() => items.filter(i => i.is_active !== false).map(i => ({ value: i.id, label: `${i.code} · ${i.name}`, keywords: (i.keywords || []).join(' ') })), [items])

  const move = async () => {
    if (!moveFor || target === null) return
    setBusy(true); setDlgError(null)
    try { await hubUpdateAlias(Number(moveFor.id), target); toast('Alias moved.'); setMoveFor(null); setTarget(null); reload(); onChanged() }
    catch (e: any) { setDlgError(e.message || String(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!delFor) return
    setBusy(true); setDlgError(null)
    try { await hubDeleteAlias(Number(delFor.id)); toast('Alias deleted.'); setDelFor(null); reload(); onChanged() }
    catch (e: any) { setDlgError(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <CostAgentModal maxWidth="max-w-4xl" z="z-[80]" title={`Learned aliases${title ? ` — ${title}` : ''}`} subtitle="Aliases are learned when a reviewer verifies a line. Fix wrong ones here." onClose={onClose}
      footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose}>Close</button>}>
      <div className="p-5 space-y-3" data-aliases-dialog>
        <input className={SA_INPUT} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search alias text…" aria-label="Search aliases" />
        <div className="rounded-lg border border-[#EADFD6] overflow-x-auto max-h-[50vh] overflow-y-auto">
          <table className="min-w-full">
            <thead><tr>{['Alias text', 'Vendor', 'Cost item', 'Created by', 'Created at', ''].map(h => <th key={h || 'a'} className={`${TH} sticky top-0 ${h ? 'z-10' : 'right-0 z-20 w-px'}`}>{h}</th>)}</tr></thead>
            <tbody>
              <StateRow colSpan={6} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No learned aliases" />
              {!loading && !error && rows.map((r, i) => {
                const code = pick(r, 'cost_item_code', 'code'), name = pick(r, 'cost_item_name', 'name')
                return (
                  <tr key={r.id ?? i} className="border-t border-[#F3EEEA]">
                    <td className={`${TD} font-semibold [overflow-wrap:anywhere]`}>{pick(r, 'alias_text', 'alias_norm', 'alias') ?? '—'}</td>
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{pick(r, 'vendor_name', 'vendor') ?? <span className="text-[#8A7A8B]">All vendors</span>}</td>
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{code ? <><b className="font-mono text-[11.5px]">{code}</b> <span className="text-[#6E5E70]">{name}</span></> : '—'}</td>
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{pick(r, 'created_by') ?? '—'}</td>
                    <td className={`${TD} whitespace-nowrap`}>{fmtDateTimePort(pick(r, 'created_at'), null, false)}</td>
                    <td className={`${TD} whitespace-nowrap sticky right-0 bg-white shadow-[-6px_0_6px_-6px_rgba(59,27,61,0.18)]`}>
                      {editable && (
                        <div className="flex gap-1">
                          <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2 whitespace-nowrap`} onClick={() => { setMoveFor(r); setTarget(null); setDlgError(null) }}><MoveRight size={12} /> Move to…</button>
                          <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2 text-[#A8231A]`} aria-label="Delete alias" onClick={() => { setDelFor(r); setDlgError(null) }}><Trash2 size={12} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data && <p className="text-[11.5px] text-[#6E5E70]">Showing {rows.length}{data.total != null ? ` of ${fmtNumber(data.total, 0)}` : ''} aliases{(data.total ?? rows.length) > rows.length ? ' — refine the search to see more.' : '.'}</p>}
      </div>

      {moveFor && (
        <ConfirmModal title="Move alias" confirmLabel="Move" maxWidth="max-w-2xl" bodyClassName="min-h-[min(420px,60vh)]" busy={busy} error={dlgError} onClose={() => setMoveFor(null)} onConfirm={move} disabled={target === null}>
          <p className="[overflow-wrap:anywhere]">Move alias <b>{pick(moveFor, 'alias_text', 'alias_norm', 'alias')}</b> to another cost item.</p>
          <Field label="Cost item" required><CostAgentCombobox options={opts} value={target} onChange={v => setTarget(v === null ? null : Number(v))} placeholder="Search cost item…" allowClear={false} wrapLabels /></Field>
        </ConfirmModal>
      )}
      {delFor && (
        <ConfirmModal title="Delete alias" confirmLabel="Delete" danger busy={busy} error={dlgError} onClose={() => setDelFor(null)} onConfirm={remove}>
          <p>Delete the learned alias <b>{pick(delFor, 'alias_text', 'alias_norm', 'alias')}</b>? Lines with this text will be classified by keywords again.</p>
        </ConfirmModal>
      )}
    </CostAgentModal>
  )
}

// ─── Re-classify open invoices ───────────────────────────────────────────────────────────────────────────────
interface Scan { changed: number; invoices: number; changes: Record<string, any>[] }
const BATCH = 200, MAX_ROUNDS = 50, MAX_ROWS = 100

// Loop batch (p_after_line_id = last_line_id) selama has_more, maks 50 putaran. Pratinjau (apply=false) menjumlahkan `changed` & mengumpulkan `changes` (maks 100 baris).
async function scan(costItemId: number | null, apply: boolean, onProgress: (round: number) => void): Promise<Scan> {
  let after: number | null = null, changed = 0, round = 0, inv = 0
  const changes: Record<string, any>[] = [], invKeys = new Set<string>()
  for (; round < MAX_ROUNDS;) {
    const r = await hubReclassify(costItemId, apply, BATCH, after)
    round++; onProgress(round)
    changed += Number(r.changed) || 0
    inv += Number(r.invoices) || 0
    ;(r.changes || []).forEach(c => { invKeys.add(String(pick(c, 'invoice_id', 'invoice_no') ?? '')); if (changes.length < MAX_ROWS) changes.push(c) })
    if (!r.has_more || r.last_line_id == null) break
    after = Number(r.last_line_id)
  }
  return { changed, invoices: inv || invKeys.size, changes }
}

export function ReclassifyDialog({ costItemId, label, editable, toast, onClose, onApplied }: {
  costItemId: number | null; label: string; editable: boolean; toast: HubCtx['toast']; onClose: () => void; onApplied: () => void
}) {
  const [preview, setPreview] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'preview' | 'idle' | 'apply'>('preview')
  const [round, setRound] = useState(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const runPreview = () => {
    setPhase('preview'); setError(null); setRound(0)
    scan(costItemId, false, r => alive.current && setRound(r))
      .then(s => { if (alive.current) { setPreview(s); setPhase('idle') } })
      .catch(e => { if (alive.current) { setError(e.message || String(e)); setPhase('idle') } })
  }
  useEffect(() => { runPreview() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const apply = async () => {
    setPhase('apply'); setError(null); setRound(0)
    try {
      const s = await scan(costItemId, true, r => alive.current && setRound(r))
      toast(`${s.changed} lines in ${s.invoices} invoices updated`)
      onApplied(); onClose()
    } catch (e: any) { if (alive.current) { setError(e.message || String(e)); setPhase('idle') } }
  }
  const busy = phase !== 'idle'

  return (
    <CostAgentModal maxWidth="max-w-4xl" z="z-[80]" title="Re-classify open invoices" subtitle={label ? `Cost item: ${label}` : 'All cost items'} onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Close</button>
        {editable && <button type="button" className={SA_BTN_PRIMARY} onClick={apply} disabled={busy || !preview || preview.changed === 0}>{phase === 'apply' ? `Applying… (batch ${round})` : 'Apply'}</button>}
      </>}>
      <div className="p-5 space-y-3" data-reclassify-dialog>
        <p className="text-[12.5px] text-[#3B1B3D]">Applies the current keywords and aliases again to lines of invoices in Verification or Rejected status that are not yet verified and not chosen manually. Submitted, approved and paid invoices are never touched.</p>
        {error && <ErrorBox message={error} onRetry={runPreview} />}
        {phase === 'preview' && <p className="text-[12.5px] text-[#2F4FA8]" role="status">Checking open invoices… (batch {round || 1})</p>}
        {preview && phase !== 'preview' && (preview.changed === 0
          ? <p className="rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-3 text-[13px] font-semibold text-[#17663D]">Nothing to change</p>
          : (
            <>
              <p className="text-[13px] font-semibold text-[#3B1B3D]">{fmtNumber(preview.changed, 0)} lines would change</p>
              <div className="rounded-lg border border-[#EADFD6] overflow-x-auto max-h-[45vh] overflow-y-auto">
                <table className="min-w-full">
                  <thead><tr>{['Invoice no', 'Line', 'Description', 'From → To', 'Method'].map(h => <th key={h} className={`${TH} sticky top-0`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {preview.changes.map((c, i) => (
                      <tr key={i} className="border-t border-[#F3EEEA]">
                        <td className={`${TD} whitespace-nowrap`}>{pick(c, 'invoice_no') ?? '—'}</td>
                        <td className={`${TD} tabular-nums`}>{pick(c, 'line_no', 'line_id') ?? '—'}</td>
                        <td className={`${TD} max-w-[320px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]">{pick(c, 'description', 'description_raw') ?? '—'}</span></td>
                        <td className={`${TD} whitespace-nowrap`}><span className="text-[#6E5E70]">{pick(c, 'from_code', 'from', 'old_code', 'old_cost_item_code') ?? 'Not mapped'}</span> → <b>{pick(c, 'to_code', 'to', 'new_code', 'new_cost_item_code') ?? '—'}</b></td>
                        <td className={TD}>{pick(c, 'method') ? <Chip tone="grey">{pick(c, 'method')}</Chip> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.changed > preview.changes.length && <p className="text-[11.5px] text-[#6E5E70]">Showing the first {preview.changes.length} changes.</p>}
            </>
          ))}
      </div>
    </CostAgentModal>
  )
}

// ─── Rename category ────────────────────────────────────────────────────────────────────────────────────────
export function RenameCategoryDialog({ category, toast, onClose, onDone }: { category: string; toast: HubCtx['toast']; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(category)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = name.trim().toUpperCase()
  const go = async () => {
    setBusy(true); setError(null)
    try { await hubRenameCategory(category, next); toast(`Category renamed to ${next}.`); onDone() } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <ConfirmModal title="Rename category" confirmLabel="Rename" busy={busy} error={error} onClose={onClose} onConfirm={go} disabled={!next || next === category}>
      <p>All cost items in <b>{category}</b> move to the new category name.</p>
      <Field label="New name" required><input className={`${SA_INPUT} uppercase`} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && next && next !== category) go() }} autoFocus /></Field>
    </ConfirmModal>
  )
}
