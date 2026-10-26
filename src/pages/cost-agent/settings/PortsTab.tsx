// Tab "Ports" hub Cost Agent Settings (2026-10-26, sql/079) -- master pelabuhan: fn_cost_agent_list_ports / save_port / set_ports_verified / merge_ports / delete_port.
// Kode pelabuhan hanya bisa ditentukan saat Add (singkatan Accurate, 2-10 huruf/angka) -- read-only saat Edit. Ubah hanya bila ctx.editable.
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, GitMerge, Plus, BadgeCheck } from 'lucide-react'
import { FilterSearch, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentPorts, fmtNumber, type CostAgentPort } from '../../../utils/CostAgentHelpers'
import { hubListPorts, hubSavePort, hubSetPortsVerified, hubMergePorts, hubDeletePort, numOrNull, PORT_TZ, tzShort, type HubPort } from './hubApi'
import {
  BulkBar, ChipInput, ChipList, ConfirmModal, errBox, Field, FILTER_CTRL, HUB_PAGE_SIZE, HubDrawer, HubFilterBar, MergeModal, Pager, RecentChanges, StateRow, TD, TH, TableCard,
  isInUseError, useAsync, useDebounced, useSelection, type HubCtx,
} from './hubUi'

const isUnused = (p: HubPort) => !p.invoices_count && !p.history_count && !p.calls_count
const coord = (v: number | null) => (v === null || v === undefined ? '—' : Number(v).toFixed(4))
interface Form { code: string; name: string; province: string; lat: string; lon: string; tz: string; aliases: string[]; is_verified: boolean; notes: string }

export default function PortsTab({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [verified, setVerified] = useState(() => { const v = ctx.params.get('verified'); return v === 'true' || v === 'false' ? v : '' })
  const [province, setProvince] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [masterKey, setMasterKey] = useState(0)
  const [logKey, setLogKey] = useState(0)
  const selection = useSelection()
  const [all, setAll] = useState<CostAgentPort[]>([])
  useEffect(() => { fetchCostAgentPorts().then(setAll).catch(() => setAll([])) }, [masterKey])
  const mergeOpts: ComboOption[] = useMemo(() => all.map(p => ({ value: p.id, label: `${p.code} · ${p.name}`, sub: p.province || undefined, keywords: (p.aliases || []).join(' ') })), [all])

  const filterKey = [q, verified, province, source].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  const { data, loading, error, reload } = useAsync(() => hubListPorts({
    q, verified: verified === '' ? '' : verified === 'true', province, source, limit: HUB_PAGE_SIZE, offset: (page - 1) * HUB_PAGE_SIZE,
  }), [filterKey, page])
  const rows = data?.rows || []
  useEffect(() => { selection.clear() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data])
  const refresh = () => { reload(); setMasterKey(k => k + 1); setLogKey(k => k + 1) }
  const ids = rows.map(r => r.id)
  const allOn = ids.length > 0 && ids.every(id => selection.has(id))
  const selIds = [...selection.sel]

  const [drawer, setDrawer] = useState<{ id: number | null; init: Form } | null>(null)
  const [mergeFor, setMergeFor] = useState<HubPort | null>(null)
  const [delFor, setDelFor] = useState<HubPort | null>(null)
  const [busy, setBusy] = useState(false)
  const bulkVerify = async (v: boolean) => {
    setBusy(true)
    try { const r = await hubSetPortsVerified(selIds, v); ctx.toast(`${r.updated} ports updated`); selection.clear(); refresh() }
    catch (e: any) { ctx.toast(e.message || String(e), 'err') } finally { setBusy(false) }
  }
  const runDelete = async () => {
    if (!delFor) return
    setBusy(true)
    try { await hubDeletePort(delFor.id); ctx.toast(`Port ${delFor.code} deleted.`); setDelFor(null); refresh() }
    catch (e: any) { setDelFor(null); ctx.toast(e.message || String(e), 'err'); if (isInUseError(e)) refresh() } finally { setBusy(false) }
  }
  const COLS = 8 + (ctx.editable ? 2 : 0)
  const toForm = (p: HubPort): Form => ({ code: p.code, name: p.name, province: p.province || '', lat: p.lat == null ? '' : String(p.lat), lon: p.lon == null ? '' : String(p.lon), tz: p.tz || 'Asia/Jakarta', aliases: p.aliases || [], is_verified: p.is_verified, notes: p.notes || '' })

  return (
    <div className="space-y-3" data-hub-ports>
      <HubFilterBar>
        <div className="w-[240px] flex"><FilterSearch value={search} onChange={setSearch} placeholder="Code / name / alias…" /></div>
        <select aria-label="Verified" className={FILTER_CTRL} value={verified} onChange={e => setVerified(e.target.value)}>
          <option value="">All</option><option value="true">Verified</option><option value="false">Not verified</option>
        </select>
        <select aria-label="Province" className={FILTER_CTRL} value={province} onChange={e => setProvince(e.target.value)}>
          <option value="">All provinces</option>{(data?.provinces || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select aria-label="Source" className={FILTER_CTRL} value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All sources</option>{(data?.sources || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setSearch(''); setVerified(''); setProvince(''); setSource('') }}>Reset</button>
        <span className="ml-auto text-[12px] text-[#6E5E70]">{data ? `${fmtNumber(data.total, 0)} ports` : ''}{!ctx.editable ? ' · View only' : ''}</span>
        {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => setDrawer({ id: null, init: { code: '', name: '', province: '', lat: '', lon: '', tz: 'Asia/Jakarta', aliases: [], is_verified: false, notes: '' } })}><Plus size={13} /> Add port</button>}
      </HubFilterBar>

      {ctx.editable && (
        <BulkBar count={selIds.length} onClear={selection.clear}>
          <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={() => bulkVerify(true)}><BadgeCheck size={13} /> Mark as verified</button>
          <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={() => bulkVerify(false)}>Mark as not verified</button>
        </BulkBar>
      )}

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              {ctx.editable && <th className={`${TH} w-8`}><input type="checkbox" aria-label="Select all on this page" className="accent-[#6B3470]" checked={allOn} onChange={e => selection.setAll(ids, e.target.checked)} disabled={ids.length === 0} /></th>}
              {['Code', 'Name', 'Province', 'Time zone', 'Lat / Lon', 'Verified', 'Aliases', 'Used by'].map(h => <th key={h} className={TH}>{h}</th>)}
              {ctx.editable && <th className={TH}></th>}
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={COLS} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No ports match the filter" />
            {!loading && !error && rows.map(p => (
              <tr key={p.id} className="border-t border-[#F3EEEA]" data-port-row={p.id}>
                {ctx.editable && <td className={TD}><input type="checkbox" aria-label={`Select ${p.code}`} className="accent-[#6B3470]" checked={selection.has(p.id)} onChange={() => selection.toggle(p.id)} /></td>}
                <td className={`${TD} font-mono text-[11.5px] font-bold whitespace-nowrap`}>{p.code}</td>
                <td className={`${TD} font-semibold min-w-[160px]`}>{p.name}</td>
                <td className={TD}>{p.province || '—'}</td>
                <td className={TD}>{tzShort(p.tz)}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums text-[11.5px]`}>{coord(p.lat)} / {coord(p.lon)}</td>
                <td className={TD}>{p.is_verified ? <Chip tone="green">Verified</Chip> : <Chip tone="amber">Not verified</Chip>}</td>
                <td className={TD}><ChipList items={p.aliases} /></td>
                <td className={`${TD} text-[11.5px] text-[#6E5E70] min-w-[200px]`}>{p.invoices_count} invoices · {p.history_count} history rows · {p.calls_count} voyage calls</td>
                {ctx.editable && (
                  <td className={`${TD} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Edit" aria-label={`Edit ${p.code}`} onClick={() => setDrawer({ id: p.id, init: toForm(p) })}><Pencil size={12} /></button>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Merge into…" aria-label={`Merge ${p.code}`} onClick={() => setMergeFor(p)}><GitMerge size={12} /></button>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2 text-[#A8231A]`} aria-label={`Delete ${p.code}`} disabled={!isUnused(p)}
                        title={isUnused(p) ? 'Delete' : 'In use — deactivate or merge it'} onClick={() => setDelFor(p)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={data?.total ?? 0} page={page} onPage={setPage} loading={loading} />
      </TableCard>

      <RecentChanges entities={['port']} reloadKey={logKey} />

      {drawer && <PortDrawer id={drawer.id} init={drawer.init} onClose={() => setDrawer(null)}
        onSaved={() => { setDrawer(null); ctx.toast(drawer.id === null ? 'Port added.' : 'Port saved.'); refresh() }} />}
      {mergeFor && <MergeModal source={{ id: mergeFor.id, name: `${mergeFor.code} ${mergeFor.name}` }} options={mergeOpts} run={hubMergePorts} toast={ctx.toast}
        describe={(a, b) => `All invoices, voyage calls and history rows of ${a} move to ${b}. The name of ${a} becomes an alias of ${b}, empty fields of ${b} are filled from ${a}, and ${a} is deleted. This cannot be undone.`}
        onClose={() => setMergeFor(null)} onDone={() => { setMergeFor(null); refresh() }} />}
      {delFor && <ConfirmModal title="Delete port" confirmLabel="Delete" danger busy={busy} onClose={() => setDelFor(null)} onConfirm={runDelete}>
        <p>Delete <b>{delFor.code} {delFor.name}</b>? It is not used by any invoice, voyage call or history row. This cannot be undone.</p>
      </ConfirmModal>}
    </div>
  )
}

function PortDrawer({ id, init, onClose, onSaved }: { id: number | null; init: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const save = async () => {
    const lat = numOrNull(f.lat), lon = numOrNull(f.lon)
    if (id === null && !/^[A-Z0-9]{2,10}$/.test(f.code)) return setError('Port code must be 2-10 letters or digits (use the Accurate abbreviation).')
    if (!f.name.trim()) return setError('Port name is required.')
    if (lat !== null && (Number.isNaN(lat) || lat < -15 || lat > 10)) return setError('Latitude must be a number between -15 and 10 (Indonesia).')
    if (lon !== null && (Number.isNaN(lon) || lon < 90 || lon > 145)) return setError('Longitude must be a number between 90 and 145 (Indonesia).')
    setBusy(true); setError(null)
    try {
      await hubSavePort(id, {
        ...(id === null ? { code: f.code } : {}), name: f.name.trim().toUpperCase(), province: f.province.trim() || null, lat, lon, tz: f.tz,
        aliases: f.aliases, is_verified: f.is_verified, notes: f.notes.trim() || null,
      })
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <HubDrawer title={id === null ? 'Add port' : 'Edit port'} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save port'}</button>
      </>}>
      {error && <div className={errBox} role="alert">{error}</div>}
      <Field label="Code" required={id === null} helper={id === null ? 'Use the Accurate abbreviation' : 'The code of a port cannot be changed'}>
        <input className={`${SA_INPUT} font-mono uppercase`} value={f.code} readOnly={id !== null} disabled={id !== null} maxLength={10}
          onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      </Field>
      <Field label="Name" required><input className={`${SA_INPUT} uppercase`} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Province"><input className={SA_INPUT} value={f.province} onChange={e => set('province', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" hint="optional"><input className={`${SA_INPUT} tabular-nums`} inputMode="decimal" value={f.lat} onChange={e => set('lat', e.target.value)} placeholder="-6.1000" /></Field>
        <Field label="Longitude" hint="optional"><input className={`${SA_INPUT} tabular-nums`} inputMode="decimal" value={f.lon} onChange={e => set('lon', e.target.value)} placeholder="106.8000" /></Field>
      </div>
      <Field label="Time zone">
        <select className={SA_INPUT} value={f.tz} onChange={e => set('tz', e.target.value)}>
          {PORT_TZ.map(t => <option key={t.value} value={t.value}>{t.label} = {t.value}</option>)}
        </select>
      </Field>
      <Field label="Aliases" helper="Other spellings seen on invoices."><ChipInput values={f.aliases} onChange={v => set('aliases', v)} normalize={s => s.trim().toUpperCase()} /></Field>
      <Field label="Notes"><textarea className={`${SA_INPUT} h-20 py-2`} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="w-4 h-4 accent-[#17663D]" checked={f.is_verified} onChange={e => set('is_verified', e.target.checked)} /> Verified</label>
    </HubDrawer>
  )
}
