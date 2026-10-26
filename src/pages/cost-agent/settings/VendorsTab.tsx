// Tab "Vendors" hub Cost Agent Settings (2026-10-26, sql/079) -- master vendor: fn_cost_agent_list_vendors / save_vendor / merge_vendors / delete_vendor.
// Ubah hanya bila ctx.editable. NPWP 15 atau 16 digit (server juga memeriksa); duplikat nama / alias / NPWP ditolak server (pesan tampil inline di drawer).
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, GitMerge, Plus } from 'lucide-react'
import { FilterSearch, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentVendors, fmtNumber, type CostAgentVendor } from '../../../utils/CostAgentHelpers'
import { hubListVendors, hubSaveVendor, hubMergeVendors, hubDeleteVendor, npwpError, type HubVendor } from './hubApi'
import {
  ChipInput, ChipList, ConfirmModal, errBox, Field, FILTER_CTRL, HUB_PAGE_SIZE, HubDrawer, HubFilterBar, MergeModal, Pager, RecentChanges, StateRow, TD, TH, TableCard,
  isInUseError, useAsync, useDebounced, type HubCtx,
} from './hubUi'

const isUnused = (v: HubVendor) => !v.invoices_count && !v.history_count && !v.rules_count && !v.alias_count
interface Form { name: string; npwp: string; aliases: string[]; is_active: boolean }

export default function VendorsTab({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [active, setActive] = useState('')
  const [missing, setMissing] = useState(() => (ctx.params.get('missing') === 'npwp' ? 'npwp' : ''))
  const [page, setPage] = useState(1)
  const [masterKey, setMasterKey] = useState(0)
  const [logKey, setLogKey] = useState(0)
  const [all, setAll] = useState<CostAgentVendor[]>([])
  useEffect(() => { fetchCostAgentVendors().then(setAll).catch(() => setAll([])) }, [masterKey])
  const mergeOpts: ComboOption[] = useMemo(() => all.map(v => ({ value: v.id, label: v.name, sub: v.npwp || undefined })), [all])

  const filterKey = [q, active, missing].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  const { data, loading, error, reload } = useAsync(() => hubListVendors({
    q, active: active === '' ? '' : active === 'true', missing, limit: HUB_PAGE_SIZE, offset: (page - 1) * HUB_PAGE_SIZE,
  }), [filterKey, page])
  const rows = data?.rows || []
  const refresh = () => { reload(); setMasterKey(k => k + 1); setLogKey(k => k + 1) }

  const [drawer, setDrawer] = useState<{ id: number | null; init: Form } | null>(null)
  const [mergeFor, setMergeFor] = useState<HubVendor | null>(null)
  const [delFor, setDelFor] = useState<HubVendor | null>(null)
  const [busy, setBusy] = useState(false)
  const runDelete = async () => {
    if (!delFor) return
    setBusy(true)
    try { await hubDeleteVendor(delFor.id); ctx.toast(`Vendor ${delFor.name} deleted.`); setDelFor(null); refresh() }
    catch (e: any) { setDelFor(null); ctx.toast(e.message || String(e), 'err'); if (isInUseError(e)) refresh() } finally { setBusy(false) }
  }
  const COLS = 6

  return (
    <div className="space-y-3" data-hub-vendors>
      <HubFilterBar>
        <div className="w-[260px] flex"><FilterSearch value={search} onChange={setSearch} placeholder="Name / alias / NPWP (min. 6 digits)…" /></div>
        <select aria-label="Status" className={FILTER_CTRL} value={active} onChange={e => setActive(e.target.value)}>
          <option value="">All status</option><option value="true">Active</option><option value="false">Inactive</option>
        </select>
        <select aria-label="Missing data" className={FILTER_CTRL} value={missing} onChange={e => setMissing(e.target.value)}>
          <option value="">Missing data: any</option><option value="npwp">Missing NPWP</option>
        </select>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setSearch(''); setActive(''); setMissing('') }}>Reset</button>
        <span className="ml-auto text-[12px] text-[#6E5E70]">{data ? `${fmtNumber(data.total, 0)} vendors` : ''}{!ctx.editable ? ' · View only' : ''}</span>
        {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => setDrawer({ id: null, init: { name: '', npwp: '', aliases: [], is_active: true } })}><Plus size={13} /> Add vendor</button>}
      </HubFilterBar>

      <TableCard>
        <table className="min-w-full">
          <thead><tr>{['Name', 'NPWP', 'Aliases', 'Used by', 'Status', ''].map(h => <th key={h || 'actions'} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            <StateRow colSpan={COLS} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No vendors match the filter" />
            {!loading && !error && rows.map(v => (
              <tr key={v.id} className={`border-t border-[#F3EEEA] ${v.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-vendor-row={v.id}>
                <td className={`${TD} font-semibold min-w-[200px]`}>{v.name}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{v.npwp ? v.npwp : <Chip tone="amber">No NPWP</Chip>}</td>
                <td className={TD}><ChipList items={v.aliases} /></td>
                <td className={`${TD} text-[11.5px] text-[#6E5E70] min-w-[220px]`}>{v.invoices_count} invoices · {v.history_count} history rows · {v.rules_count} approval rules · {v.alias_count} learned aliases</td>
                <td className={TD}>{v.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="grey">Inactive</Chip>}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {ctx.editable && (
                    <div className="flex gap-1">
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Edit" aria-label={`Edit ${v.name}`} onClick={() => setDrawer({ id: v.id, init: { name: v.name, npwp: v.npwp || '', aliases: v.aliases || [], is_active: v.is_active } })}><Pencil size={12} /></button>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Merge into…" aria-label={`Merge ${v.name}`} onClick={() => setMergeFor(v)}><GitMerge size={12} /></button>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2 text-[#A8231A]`} aria-label={`Delete ${v.name}`} disabled={!isUnused(v)}
                        title={isUnused(v) ? 'Delete' : 'In use — deactivate or merge it'} onClick={() => setDelFor(v)}><Trash2 size={12} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={data?.total ?? 0} page={page} onPage={setPage} loading={loading} />
      </TableCard>

      <RecentChanges entities={['vendor']} reloadKey={logKey} />

      {drawer && <VendorDrawer id={drawer.id} init={drawer.init} onClose={() => setDrawer(null)}
        onSaved={() => { setDrawer(null); ctx.toast(drawer.id === null ? 'Vendor added.' : 'Vendor saved.'); refresh() }} />}
      {mergeFor && <MergeModal source={{ id: mergeFor.id, name: mergeFor.name }} options={mergeOpts} run={hubMergeVendors} toast={ctx.toast}
        describe={(a, b) => `All invoices, history rows, approval rules and learned aliases of ${a} move to ${b}. The name of ${a} becomes an alias of ${b}, an empty NPWP of ${b} is filled from ${a}, and ${a} is deleted. This cannot be undone.`}
        onClose={() => setMergeFor(null)} onDone={() => { setMergeFor(null); refresh() }} />}
      {delFor && <ConfirmModal title="Delete vendor" confirmLabel="Delete" danger busy={busy} onClose={() => setDelFor(null)} onConfirm={runDelete}>
        <p>Delete <b>{delFor.name}</b>? It is not used by any invoice, history row, approval rule or learned alias. This cannot be undone.</p>
      </ConfirmModal>}
    </div>
  )
}

function VendorDrawer({ id, init, onClose, onSaved }: { id: number | null; init: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const npwpErr = npwpError(f.npwp)
  const save = async () => {
    if (!f.name.trim()) return setError('Vendor name is required.')
    if (npwpErr) return setError(npwpErr)
    setBusy(true); setError(null)
    try {
      await hubSaveVendor(id, { name: f.name.trim().toUpperCase(), npwp: f.npwp.trim() || null, aliases: f.aliases, is_active: f.is_active })
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <HubDrawer title={id === null ? 'Add vendor' : 'Edit vendor'} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save vendor'}</button>
      </>}>
      {error && <div className={errBox} role="alert">{error}</div>}
      <Field label="Name" required><input className={`${SA_INPUT} uppercase`} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="NPWP" hint="15 or 16 digits" helper="Used to match the vendor on tax invoices">
        <input className={`${SA_INPUT} tabular-nums ${npwpErr ? 'border-[#A8231A]' : ''}`} value={f.npwp} onChange={e => set('npwp', e.target.value)} placeholder="e.g. 01.234.567.8-901.000" />
        {npwpErr && <p className="mt-1 text-[11px] text-[#A8231A]">{npwpErr}</p>}
      </Field>
      <Field label="Aliases" helper="Other names seen on invoices. Legal forms like PT and CV are ignored when matching.">
        <ChipInput values={f.aliases} onChange={v => set('aliases', v)} normalize={s => s.trim().toUpperCase()} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="w-4 h-4 accent-[#17663D]" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
    </HubDrawer>
  )
}
