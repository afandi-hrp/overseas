// Tab "Vessels" hub Cost Agent Settings (2026-10-26, sql/079) -- master kapal + OWNER OFFICE (Medan / Jakarta; menentukan jalur approval). RPC:
// fn_cost_agent_list_vessels / save_vessel / set_vessels_office / merge_vessels / delete_vessel (delete = sql/076-077). Ubah hanya bila ctx.editable.
// Saran office (office_hint) dari sumber voyage: Noon Report = Jakarta, SOF / Time Sheet = Medan -- dihitung server, di sini hanya ditampilkan.
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, GitMerge, Plus, Sparkles, Link2 } from 'lucide-react'
import AscendReviewModal from './AscendReviewModal'
import AscendMapBadge from './AscendMapBadge'
import { finMappedIndex } from './financeApi'
import { FilterSearch, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentCompanies, fetchCostAgentVessels, fmtNumber, type CostAgentCompany, type CostAgentVessel } from '../../../utils/CostAgentHelpers'
import {
  hubListVessels, hubSaveVessel, hubSetVesselsOffice, hubMergeVessels, hubDeleteVessel, numOrNull, OFFICE_LABEL, OFFICE_OPTIONS, type HubVessel, type Office,
} from './hubApi'
import {
  BulkBar, ChipInput, ChipList, ConfirmModal, errBox, Field, FILTER_CTRL, HUB_PAGE_SIZE, HubDrawer, HubFilterBar, isDuplicateError, MergeModal, OfficeBadge, Pager,
  RecentChanges, StateRow, TD, TH, TableCard, useAsync, useDebounced, useSelection, type HubCtx,
} from './hubUi'
import { ActiveStatus, FILTER_SEARCH, HIDE_LG, HIDE_XL, HubToolbarEnd, ICON_BTN, ICON_BTN_DANGER, ResetButton, UsedBy } from './hubUi'

const PREFIXES = ['MV', 'MT', 'TB', 'LPGC', 'LNGC', 'SV', 'BG', 'KM', 'SPOB', 'OB', 'AHTS', 'TK', 'KMP']
const MISSING_VALUES = ['dwt', 'company', 'type', 'office']
const isUnused = (v: HubVessel) => !v.invoices_count && !v.voyages_count && !v.history_count
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNumber(v, 2))

interface Form {
  name: string; prefix: string; vessel_type: string; dwt: string; gt: string; hp: string; year_built: string
  company_code: string; office: string; short_code: string; aliases: string[]; is_active: boolean
}
const blankForm = (): Form => ({ name: '', prefix: '', vessel_type: '', dwt: '', gt: '', hp: '', year_built: '', company_code: '', office: '', short_code: '', aliases: [], is_active: true })
const toForm = (v: HubVessel): Form => ({
  name: v.name, prefix: v.prefix || '', vessel_type: v.vessel_type || '', dwt: v.dwt == null ? '' : String(v.dwt), gt: v.gt == null ? '' : String(v.gt), hp: v.hp == null ? '' : String(v.hp),
  year_built: v.year_built == null ? '' : String(v.year_built), company_code: v.company_code || '', office: v.office || '', short_code: v.short_code || '', aliases: v.aliases || [], is_active: v.is_active,
})

export default function VesselsTab({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [company, setCompany] = useState('')
  const [office, setOffice] = useState('')
  const [active, setActive] = useState('')
  const [missing, setMissing] = useState(() => { const m = (ctx.params.get('missing') || '').toLowerCase(); return MISSING_VALUES.includes(m) ? m : '' })
  const [page, setPage] = useState(1)
  const [masterKey, setMasterKey] = useState(0)
  const [logKey, setLogKey] = useState(0)
  const selection = useSelection()

  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  const [allVessels, setAllVessels] = useState<CostAgentVessel[]>([])
  useEffect(() => { fetchCostAgentCompanies().then(setCompanies).catch(() => setCompanies([])) }, [])
  useEffect(() => { fetchCostAgentVessels().then(setAllVessels).catch(() => setAllVessels([])) }, [masterKey])
  const mergeOpts: ComboOption[] = useMemo(() => allVessels.map(v => ({ value: v.id, label: v.name, sub: [v.vessel_type, v.company_code].filter(Boolean).join(' · ') })), [allVessels])
  const typeSuggestions = useMemo(() => [...new Set(allVessels.map(v => v.vessel_type).filter((t): t is string => !!t))].sort(), [allVessels])

  const filterKey = [q, company, office, active, missing].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  const { data, loading, error, reload } = useAsync(() => hubListVessels({
    q, company_code: company, office, active: active === '' ? '' : active === 'true', missing, limit: HUB_PAGE_SIZE, offset: (page - 1) * HUB_PAGE_SIZE,
  }), [filterKey, page])
  const rows = data?.rows || []
  useEffect(() => { selection.clear() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data])
  const refresh = () => { reload(); setMasterKey(k => k + 1); setLogKey(k => k + 1) }

  const ids = rows.map(r => r.id)
  const allOn = ids.length > 0 && ids.every(id => selection.has(id))
  const selRows = rows.filter(r => selection.has(r.id))
  const suggestable = selRows.filter(r => !r.office && r.office_hint)

  // ── Aksi ──
  const [drawer, setDrawer] = useState<{ id: number | null; init: Form } | null>(null)
  const [mergeFor, setMergeFor] = useState<HubVessel | null>(null)
  const [delFor, setDelFor] = useState<HubVessel | null>(null)
  const [bulkOffice, setBulkOffice] = useState<'MEDAN' | 'JAKARTA' | 'CLEAR' | null>(null)
  const [applyHints, setApplyHints] = useState(false)
  const [ascendMapOpen, setAscendMapOpen] = useState(false)
  const ascendIdx = useAsync(() => finMappedIndex('vessel'), [])
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const setOneOffice = async (v: HubVessel, off: Office) => {
    try { const r = await hubSetVesselsOffice([v.id], off); ctx.toast(`${r.updated} vessels updated`); refresh() } catch (e: any) { ctx.toast(e.message || String(e), 'err') }
  }
  const runBulkOffice = async () => {
    if (!bulkOffice) return
    setBusy(true); setDialogError(null)
    try {
      const r = await hubSetVesselsOffice(selRows.map(v => v.id), bulkOffice === 'CLEAR' ? null : bulkOffice)
      ctx.toast(`${r.updated} vessels updated`); setBulkOffice(null); selection.clear(); refresh()
    } catch (e: any) { setDialogError(e.message || String(e)) } finally { setBusy(false) }
  }
  const hintGroups = (['JAKARTA', 'MEDAN'] as Office[]).map(o => ({ office: o, ids: suggestable.filter(v => v.office_hint === o).map(v => v.id) })).filter(g => g.ids.length > 0)
  const runApplyHints = async () => {
    setBusy(true); setDialogError(null)
    try {
      let updated = 0
      for (const g of hintGroups) updated += (await hubSetVesselsOffice(g.ids, g.office)).updated
      ctx.toast(`${updated} vessels updated`); setApplyHints(false); selection.clear(); refresh()
    } catch (e: any) { setDialogError(e.message || String(e)); refresh() } finally { setBusy(false) }
  }
  const runDelete = async () => {
    if (!delFor) return
    setBusy(true); setDialogError(null)
    try { await hubDeleteVessel(delFor.id); ctx.toast(`Vessel ${delFor.name} deleted.`); setDelFor(null); refresh() }
    catch (e: any) { setDelFor(null); ctx.toast(e.message || String(e), 'err') } finally { setBusy(false) }
  }

  const COLS = 12 + (ctx.editable ? 2 : 0)
  const reset = () => { setSearch(''); setCompany(''); setOffice(''); setActive(''); setMissing('') }

  return (
    <div className="space-y-3" data-hub-vessels>
      <HubFilterBar>
        <div className={FILTER_SEARCH}><FilterSearch value={search} onChange={setSearch} placeholder="Name / short code / alias…" /></div>
        <select aria-label="Company" className={FILTER_CTRL} value={company} onChange={e => setCompany(e.target.value)}>
          <option value="">All PT</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <select aria-label="Office" className={FILTER_CTRL} value={office} onChange={e => setOffice(e.target.value)}>
          <option value="">All offices</option><option value="MEDAN">Medan</option><option value="JAKARTA">Jakarta</option><option value="NONE">Not set</option>
        </select>
        <select aria-label="Status" className={FILTER_CTRL} value={active} onChange={e => setActive(e.target.value)}>
          <option value="">All status</option><option value="true">Active</option><option value="false">Inactive</option>
        </select>
        <select aria-label="Missing data" className={FILTER_CTRL} value={missing} onChange={e => setMissing(e.target.value)}>
          <option value="">Missing data: any</option><option value="dwt">Missing DWT</option><option value="company">Missing company</option><option value="type">Missing type</option><option value="office">Missing office</option>
        </select>
        <ResetButton onClick={reset} />
        <HubToolbarEnd count={data ? `${fmtNumber(data.total, 0)} vessels` : ''} viewOnly={!ctx.editable}>
          {ctx.editable && <button type="button" className={SA_BTN_OUTLINE} onClick={() => setAscendMapOpen(true)} title="Find Ascend vessels for every unmapped vessel (all companies) and review before saving"><Link2 size={13} /> Map to Ascend</button>}
          {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => { setDrawer({ id: null, init: blankForm() }); setDialogError(null) }}><Plus size={13} /> Add vessel</button>}
        </HubToolbarEnd>
      </HubFilterBar>

      {ascendMapOpen && <AscendReviewModal kind="vessel" onClose={() => setAscendMapOpen(false)} onSaved={() => ascendIdx.reload()} toast={ctx.toast} />}

      {ctx.editable && (
        <BulkBar count={selRows.length} onClear={selection.clear}>
          <select aria-label="Set owner office" className={FILTER_CTRL} value="" onChange={e => { if (e.target.value) { setBulkOffice(e.target.value as 'MEDAN' | 'JAKARTA' | 'CLEAR'); setDialogError(null) } }}>
            <option value="">Set owner office…</option><option value="MEDAN">Medan</option><option value="JAKARTA">Jakarta</option><option value="CLEAR">Clear (not set)</option>
          </select>
          <button type="button" className={SA_BTN_OUTLINE} disabled={suggestable.length === 0} onClick={() => { setApplyHints(true); setDialogError(null) }}
            title="Fill the owner office of the selected vessels from the suggestions (only vessels without an office)"><Sparkles size={13} /> Apply suggestions on this page{suggestable.length ? ` (${suggestable.length})` : ''}</button>
        </BulkBar>
      )}

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              {ctx.editable && <th className={`${TH} w-8`}><input type="checkbox" aria-label="Select all on this page" className="accent-[#6B3470]" checked={allOn} onChange={e => selection.setAll(ids, e.target.checked)} disabled={ids.length === 0} /></th>}
              {['Name', 'Type', 'DWT', 'GT', 'HP', 'Company', 'Office', 'Short code', 'Aliases', 'Used by', 'Status', 'Ascend'].map((h, i) => <th key={h} className={`${TH} ${i >= 2 && i <= 4 ? 'text-right' : ''} ${i === 3 || i === 4 || i === 8 ? HIDE_XL : i === 7 ? HIDE_LG : ''}`}>{h}</th>)}
              {ctx.editable && <th className={TH}></th>}
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={COLS} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No vessels match the filter" />
            {!loading && !error && rows.map(v => {
              const noDwt = (v.missing || []).includes('dwt')
              return (
                <tr key={v.id} className={`border-t border-[#F3EEEA] ${v.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-vessel-row={v.id}>
                  {ctx.editable && <td className={TD}><input type="checkbox" aria-label={`Select ${v.name}`} className="accent-[#6B3470]" checked={selection.has(v.id)} onChange={() => selection.toggle(v.id)} /></td>}
                  <td className={`${TD} min-w-[170px]`}>
                    <span className="font-semibold">{v.name}</span>
                    {noDwt && <span className="ml-1.5 align-middle"><Chip tone="amber" title="History comparison by nearest DWT needs the DWT">No DWT</Chip></span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{v.vessel_type || '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{num(v.dwt)}</td>
                  <td className={`${TD} text-right tabular-nums ${HIDE_XL}`}>{num(v.gt)}</td>
                  <td className={`${TD} text-right tabular-nums ${HIDE_XL}`}>{num(v.hp)}</td>
                  <td className={TD}>{v.company_code || <span className="text-[#8A7A8B]">—</span>}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <OfficeBadge office={v.office} />
                      {!v.office && v.office_hint && (ctx.editable
                        ? <button type="button" onClick={() => setOneOffice(v, v.office_hint as Office)} data-office-hint
                            title="Suggested from voyage reports: Noon Report = Jakarta, SOF / Time Sheet = Medan. Click to apply."
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#F3EEEA] text-[#6E5E70] hover:bg-[#EADFD6]">Suggested: {OFFICE_LABEL[v.office_hint]}</button>
                        : <Chip tone="grey" title="Suggested from voyage reports: Noon Report = Jakarta, SOF / Time Sheet = Medan.">Suggested: {OFFICE_LABEL[v.office_hint]}</Chip>)}
                    </span>
                  </td>
                  <td className={`${TD} font-mono text-[11.5px] ${HIDE_LG}`}>{v.short_code || '—'}</td>
                  <td className={`${TD} ${HIDE_XL}`}><ChipList items={v.aliases} /></td>
                  <td className={`${TD} min-w-[140px]`}><UsedBy items={[{ n: v.invoices_count, label: 'invoices' }, { n: v.voyages_count, label: 'voyages' }, { n: v.history_count, label: 'history rows', short: 'history' }]} /></td>
                  <td className={TD}><ActiveStatus active={v.is_active} /></td>
                  <td className={TD}><AscendMapBadge infos={ascendIdx.data?.get(v.id)} loading={ascendIdx.loading && !ascendIdx.data} failed={!!ascendIdx.error} /></td>
                  {ctx.editable && (
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex gap-1">
                        <button type="button" className={ICON_BTN} title="Edit" aria-label={`Edit ${v.name}`} onClick={() => { setDrawer({ id: v.id, init: toForm(v) }); setDialogError(null) }}><Pencil size={12} /></button>
                        <button type="button" className={ICON_BTN} title="Merge into…" aria-label={`Merge ${v.name}`} onClick={() => setMergeFor(v)}><GitMerge size={12} /></button>
                        <button type="button" className={ICON_BTN_DANGER} aria-label={`Delete ${v.name}`} disabled={!isUnused(v)}
                          title={isUnused(v) ? 'Delete' : 'In use — deactivate or merge it'} onClick={() => { setDelFor(v); setDialogError(null) }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pager total={data?.total ?? 0} page={page} onPage={setPage} loading={loading} />
      </TableCard>

      <RecentChanges entities={['vessel']} reloadKey={logKey} />

      {drawer && <VesselDrawer id={drawer.id} init={drawer.init} companies={companies} typeSuggestions={typeSuggestions} onClose={() => setDrawer(null)}
        onSaved={() => { setDrawer(null); ctx.toast(drawer.id === null ? 'Vessel added.' : 'Vessel saved.'); refresh() }} />}

      {mergeFor && <MergeModal source={{ id: mergeFor.id, name: mergeFor.name }} options={mergeOpts} run={hubMergeVessels} toast={ctx.toast}
        describe={(a, b) => `All invoices, voyages and history rows of ${a} move to ${b}. The name of ${a} becomes an alias of ${b}, empty fields of ${b} (including Owner office) are filled from ${a}, and ${a} is deleted. This cannot be undone.`}
        onClose={() => setMergeFor(null)} onDone={() => { setMergeFor(null); refresh() }} />}

      {delFor && <ConfirmModal title="Delete vessel" confirmLabel="Delete" danger busy={busy} error={dialogError} onClose={() => setDelFor(null)} onConfirm={runDelete}>
        <p>Delete <b>{delFor.name}</b>? It is not used by any invoice, voyage or history row. This cannot be undone.</p>
      </ConfirmModal>}

      {bulkOffice && <ConfirmModal title="Set owner office" confirmLabel="Apply" busy={busy} error={dialogError} onClose={() => setBulkOffice(null)} onConfirm={runBulkOffice}>
        <p>{bulkOffice === 'CLEAR' ? `Clear the owner office of ${selRows.length} vessels?` : `Set the owner office of ${selRows.length} vessels to ${OFFICE_LABEL[bulkOffice]}?`}</p>
        <p className="text-[12px] text-[#6E5E70]">Decides which approval route applies to invoices of these vessels.</p>
      </ConfirmModal>}

      {applyHints && <ConfirmModal title="Apply suggestions" confirmLabel="Apply" busy={busy} error={dialogError} onClose={() => setApplyHints(false)} onConfirm={runApplyHints}>
        <p>{hintGroups.map(g => `${g.ids.length} vessels to ${OFFICE_LABEL[g.office]}`).join(', ')}.</p>
        <p className="text-[12px] text-[#6E5E70]">Suggested from voyage reports: Noon Report = Jakarta, SOF / Time Sheet = Medan. Only selected vessels without an owner office are changed.</p>
      </ConfirmModal>}
    </div>
  )
}

function VesselDrawer({ id, init, companies, typeSuggestions, onClose, onSaved }: {
  id: number | null; init: Form; companies: CostAgentCompany[]; typeSuggestions: string[]; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const dwt = numOrNull(f.dwt), gt = numOrNull(f.gt), hp = numOrNull(f.hp), year = numOrNull(f.year_built)
    if (!f.name.trim()) return setError('Vessel name is required.')
    for (const [label, v] of [['DWT', dwt], ['GT', gt], ['HP', hp]] as const) if (v !== null && (Number.isNaN(v) || v < 0)) return setError(`${label} must be a number ≥ 0.`)
    if (year !== null && (Number.isNaN(year) || !Number.isInteger(year) || year < 1900)) return setError('Year built is not valid.')
    if (f.short_code && !/^[A-Z0-9]{1,12}$/.test(f.short_code)) return setError('Short code must be 1-12 letters or digits.')
    setBusy(true); setError(null)
    try {
      await hubSaveVessel(id, {
        name: f.name.trim().toUpperCase(), prefix: f.prefix || null, vessel_type: f.vessel_type.trim() || null, dwt, gt, hp, year_built: year,
        company_code: f.company_code || null, office: f.office || null, short_code: f.short_code || null, aliases: f.aliases, is_active: f.is_active,
      })
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) /* duplikat 23505: pesan server tampil inline di atas form */ }
  }

  return (
    <HubDrawer title={id === null ? 'Add vessel' : 'Edit vessel'} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save vessel'}</button>
      </>}>
      {error && <div className={errBox} role="alert" data-form-error={isDuplicateError({ message: error }) ? 'duplicate' : 'error'}>{error}</div>}
      <Field label="Name" required><input className={`${SA_INPUT} uppercase`} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. MV. BARITO SATU" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prefix"><select className={SA_INPUT} value={f.prefix} onChange={e => set('prefix', e.target.value)}><option value="">Auto</option>{PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Type">
          <input className={SA_INPUT} list="hub-vessel-types" value={f.vessel_type} onChange={e => set('vessel_type', e.target.value)} placeholder="e.g. TANKER" />
          <datalist id="hub-vessel-types">{typeSuggestions.map(t => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="DWT"><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={f.dwt} onChange={e => set('dwt', e.target.value)} /></Field>
        <Field label="GT"><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={f.gt} onChange={e => set('gt', e.target.value)} /></Field>
        <Field label="HP"><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={f.hp} onChange={e => set('hp', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year built"><input className={`${SA_INPUT} tabular-nums`} inputMode="numeric" maxLength={4} value={f.year_built} onChange={e => set('year_built', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Company"><select className={SA_INPUT} value={f.company_code} onChange={e => set('company_code', e.target.value)}><option value="">—</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></Field>
      </div>
      <Field label="Owner office" helper="Decides which approval route applies to invoices of this vessel.">
        <select className={SA_INPUT} value={f.office} onChange={e => set('office', e.target.value)} aria-label="Owner office">
          <option value="">Not set</option>{OFFICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Short code" hint="max 12 letters or digits"><input className={`${SA_INPUT} font-mono uppercase`} maxLength={12} value={f.short_code} onChange={e => set('short_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>
      <Field label="Aliases" helper="Other spellings seen on invoices. The prefix (MV./MT.) is ignored when matching.">
        <ChipInput values={f.aliases} onChange={v => set('aliases', v)} normalize={s => s.trim().toUpperCase()} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="w-4 h-4 accent-[#17663D]" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
    </HubDrawer>
  )
}
