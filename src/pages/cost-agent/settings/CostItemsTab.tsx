// Tab "Cost Items" hub Cost Agent Settings (2026-10-26, sql/076-077) -- jenis biaya, keyword, alias hasil belajar, uji klasifikasi, re-classify invoice terbuka.
// RPC: fn_cost_agent_list_cost_items / save_cost_item / rename_category / test_classify / list_aliases / update_alias / delete_alias / reclassify_open_lines.
// Panel "Test description" tersedia utk read-only; semua tombol ubah hanya bila ctx.editable. Daftar tidak berhalaman di server (jumlah jenis biaya kecil):
// dimuat sekali (limit 500) lalu dipecah 50 baris/halaman di klien.
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Lock, Library, RefreshCw, FlaskConical, AlertTriangle } from 'lucide-react'
import { CostAgentCombobox, FilterSearch, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentCostItems, fetchCostAgentVendors, fmtNumber, type CostAgentCostItem, type CostAgentVendor } from '../../../utils/CostAgentHelpers'
import { hubListCostItems, hubSaveCostItem, hubTestClassify, numOrNull, type HubCostItem, type HubKeywordWarning } from './hubApi'
import {
  ChipInput, ChipList, ErrorBox, errBox, Field, FILTER_CTRL, HUB_PAGE_SIZE, HubDrawer, HubFilterBar, Pager, RecentChanges, StateRow, TD, TH, TableCard, useAsync, useDebounced, type HubCtx,
} from './hubUi'
import { AliasesDialog, ReclassifyDialog, RenameCategoryDialog } from './CostItemDialogs'

const METHOD_LABEL: Record<string, string> = {
  alias_vendor: 'Learned alias (vendor)', alias: 'Learned alias', alias_pattern: 'Learned alias (pattern)', keyword: 'Keyword', keyword_synonym: 'Keyword (synonym)', history: 'Similar history', none: 'No match',
}
const WARN_KIND: Record<string, string> = { same: 'same keyword', overlap: 'overlapping phrase' }

interface Form { code: string; name: string; category: string; gl_account: string; priority: string; keywords: string[]; is_active: boolean }
const toForm = (i: HubCostItem): Form => ({ code: i.code, name: i.name, category: i.category || '', gl_account: i.gl_account || '', priority: i.priority == null ? '' : String(i.priority), keywords: i.keywords || [], is_active: i.is_active })

export default function CostItemsTab({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [active, setActive] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [logKey, setLogKey] = useState(0)
  const [masterKey, setMasterKey] = useState(0)
  const [allItems, setAllItems] = useState<CostAgentCostItem[]>([])
  const [vendors, setVendors] = useState<CostAgentVendor[]>([])
  useEffect(() => { fetchCostAgentCostItems().then(setAllItems).catch(() => setAllItems([])) }, [masterKey])
  useEffect(() => { fetchCostAgentVendors().then(setVendors).catch(() => setVendors([])) }, [])

  const filterKey = [q, active, category].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  const { data, loading, error, reload } = useAsync(() => hubListCostItems({ q, active: active === '' ? '' : active === 'true', category, limit: 500, offset: 0 }), [filterKey])
  const all = data?.rows || []
  const rows = all.slice((page - 1) * HUB_PAGE_SIZE, page * HUB_PAGE_SIZE)
  const refresh = () => { reload(); setMasterKey(k => k + 1); setLogKey(k => k + 1) }
  const categories = data?.categories || []

  const [drawer, setDrawer] = useState<{ id: number | null; init: Form; system: boolean } | null>(null)
  const [aliasFor, setAliasFor] = useState<{ id: number | null; title: string } | null>(null)
  const [reclassFor, setReclassFor] = useState<{ id: number | null; label: string } | null>(null)
  const [renameFor, setRenameFor] = useState<string | null>(null)
  const catOpts = useMemo(() => [...new Set([...categories.map(c => c.category), ...allItems.map(i => i.category)].filter(Boolean))].sort(), [categories, allItems])

  return (
    <div className="space-y-3" data-hub-cost-items>
      <TestPanel vendors={vendors} />

      <HubFilterBar>
        <div className="w-[260px] flex"><FilterSearch value={search} onChange={setSearch} placeholder="Code / name / keyword…" /></div>
        <select aria-label="Status" className={FILTER_CTRL} value={active} onChange={e => setActive(e.target.value)}>
          <option value="">All status</option><option value="true">Active</option><option value="false">Inactive</option>
        </select>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setSearch(''); setActive(''); setCategory('') }}>Reset</button>
        <span className="ml-auto text-[12px] text-[#6E5E70]">{data ? `${fmtNumber(all.length, 0)} cost items` : ''}{!ctx.editable ? ' · View only' : ''}</span>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => setAliasFor({ id: null, title: 'all cost items' })}><Library size={13} /> Learned aliases</button>
        {ctx.editable && <button type="button" className={SA_BTN_OUTLINE} onClick={() => setReclassFor({ id: null, label: '' })}><RefreshCw size={13} /> Re-classify open invoices…</button>}
        {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => setDrawer({ id: null, init: { code: '', name: '', category: '', gl_account: '', priority: '500', keywords: [], is_active: true }, system: false })}><Plus size={13} /> Add cost item</button>}
      </HubFilterBar>

      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" data-categories>
          <button type="button" onClick={() => setCategory('')} aria-pressed={category === ''}
            className={`px-2.5 h-7 rounded-lg text-xs font-bold border ${category === '' ? 'bg-[#3B1B3D] text-white border-[#3B1B3D]' : 'bg-white text-[#3B1B3D] border-[#EADFD6] hover:bg-[#FBF7F4]'}`}>All</button>
          {categories.map(c => (
            <span key={c.category} className={`inline-flex items-center rounded-lg border ${category === c.category ? 'bg-[#EFE7F7] border-[#C9B5E0]' : 'bg-white border-[#EADFD6]'}`}>
              <button type="button" onClick={() => setCategory(category === c.category ? '' : c.category)} aria-pressed={category === c.category}
                className="px-2.5 h-7 text-xs font-bold text-[#3B1B3D] hover:bg-[#FBF7F4] rounded-l-lg">{c.category || '(none)'} <span className="text-[#6E5E70] tabular-nums">{c.count}</span></button>
              {ctx.editable && c.category && <button type="button" aria-label={`Rename category ${c.category}`} title="Rename category" onClick={() => setRenameFor(c.category)} className="px-1.5 h-7 text-[#8A7A8B] hover:text-[#6B3470] border-l border-[#EADFD6]"><Pencil size={11} /></button>}
            </span>
          ))}
        </div>
      )}

      <TableCard>
        <table className="min-w-full">
          <thead><tr>{['Code', 'Name', 'Category', 'GL account', 'Priority', 'Keywords', 'Used by', 'Active', ''].map((h, i) => <th key={h || 'a'} className={`${TH} ${i === 4 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            <StateRow colSpan={9} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No cost items match the filter" />
            {!loading && !error && rows.map(i => (
              <tr key={i.id} className={`border-t border-[#F3EEEA] ${i.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-cost-item-row={i.id}>
                <td className={`${TD} font-mono text-[11.5px] font-bold whitespace-nowrap`}>
                  {i.code}{i.is_system && <span className="ml-1 inline-block align-middle text-[#8A7A8B]" title="Used by the system — cannot be deactivated"><Lock size={11} /></span>}
                </td>
                <td className={`${TD} font-semibold min-w-[160px]`}>{i.name}</td>
                <td className={TD}>{i.category ? <Chip tone="plum">{i.category}</Chip> : '—'}</td>
                <td className={`${TD} whitespace-nowrap`}>{i.gl_account || '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{i.priority ?? '—'}</td>
                <td className={TD}><ChipList items={i.keywords} max={4} tone="blue" /></td>
                <td className={`${TD} text-[11.5px] text-[#6E5E70] min-w-[200px]`}>{i.lines_count ?? 0} lines · {i.history_count ?? 0} history · {i.alias_count ?? 0} aliases</td>
                <td className={TD}>{i.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="grey">Inactive</Chip>}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <div className="flex gap-1">
                    {ctx.editable && <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Edit" aria-label={`Edit ${i.code}`} onClick={() => setDrawer({ id: i.id, init: toForm(i), system: !!i.is_system })}><Pencil size={12} /></button>}
                    <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2`} title="Learned aliases" onClick={() => setAliasFor({ id: i.id, title: `${i.code} ${i.name}` })}><Library size={12} /> Aliases</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={all.length} page={page} onPage={setPage} loading={loading} />
      </TableCard>

      <RecentChanges entities={['cost_item', 'category', 'alias']} reloadKey={logKey} />

      {drawer && <CostItemDrawer id={drawer.id} init={drawer.init} system={drawer.system} categories={catOpts} onClose={() => setDrawer(null)}
        onSaved={() => { ctx.toast(drawer.id === null ? 'Cost item added.' : 'Cost item saved.'); refresh() }} onClosedAfterSave={() => setDrawer(null)}
        onPreview={(id, label) => { setDrawer(null); setReclassFor({ id, label }) }} />}
      {aliasFor && <AliasesDialog costItemId={aliasFor.id} title={aliasFor.title} items={allItems} editable={ctx.editable} toast={ctx.toast} onClose={() => setAliasFor(null)} onChanged={() => { setLogKey(k => k + 1); reload() }} />}
      {reclassFor && <ReclassifyDialog costItemId={reclassFor.id} label={reclassFor.label} editable={ctx.editable} toast={ctx.toast} onClose={() => setReclassFor(null)} onApplied={() => setLogKey(k => k + 1)} />}
      {renameFor && <RenameCategoryDialog category={renameFor} toast={ctx.toast} onClose={() => setRenameFor(null)} onDone={() => { setRenameFor(null); setCategory(''); refresh() }} />}
    </div>
  )
}

// Panel "Test description": uji klasifikasi satu deskripsi baris invoice (+ vendor opsional). Tersedia utk read-only.
function TestPanel({ vendors }: { vendors: CostAgentVendor[] }) {
  const [desc, setDesc] = useState('')
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof hubTestClassify>> | null>(null)
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name })), [vendors])
  const run = async () => {
    if (!desc.trim()) { setError('Enter a description to test.'); return }
    setBusy(true); setError(null)
    try { setRes(await hubTestClassify(desc.trim(), vendorId)) } catch (e: any) { setError(e.message || String(e)); setRes(null) } finally { setBusy(false) }
  }
  const r = res?.result || null
  const method = r ? String(r.method ?? 'none') : null
  const code = r ? (r.code ?? r.cost_item_code ?? null) : null
  const name = r ? (r.name ?? r.cost_item_name ?? null) : null
  return (
    <section className={`${SA_CARD} p-4 space-y-2.5`} data-test-panel>
      <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#6B3470] flex items-center gap-1.5"><FlaskConical size={14} /> Test description</h3>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[260px]"><Field label="Invoice line description"><input className={SA_INPUT} value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. JASA PANDU SANDAR" onKeyDown={e => { if (e.key === 'Enter') run() }} /></Field></div>
        <div className="w-[240px]"><Field label="Vendor" hint="optional"><CostAgentCombobox options={vendorOpts} value={vendorId} onChange={v => setVendorId(v === null ? null : Number(v))} placeholder="Any vendor" /></Field></div>
        <button type="button" className={SA_BTN_PRIMARY} onClick={run} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button>
      </div>
      {error && <ErrorBox message={error} />}
      {res && (
        <div className="space-y-1.5" data-test-result>
          <p className="text-[13px] font-semibold text-[#3B1B3D]">
            {code ? <>→ <span className="font-mono">{code}</span> · {name}</> : <span className="text-[#6E5E70]">No cost item found</span>}
            {method && <span className="ml-2 align-middle"><Chip tone={method === 'none' ? 'grey' : 'green'}>{METHOD_LABEL[method] || method}</Chip></span>}
          </p>
          {res.normalized && <p className="text-[11.5px] text-[#6E5E70]">Normalized: <span className="font-mono">{res.normalized}</span></p>}
          {(res.candidates || []).length > 0 && (
            <div className="rounded-lg border border-[#EADFD6] overflow-x-auto">
              <table className="min-w-full">
                <thead><tr>{['Code', 'Name', 'Priority', 'Matched keywords'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {(res.candidates || []).map((c, i) => (
                    <tr key={i} className="border-t border-[#F3EEEA]">
                      <td className={`${TD} font-mono text-[11.5px] font-bold`}>{c.code ?? c.cost_item_code ?? '—'}</td>
                      <td className={TD}>{c.name ?? c.cost_item_name ?? '—'}</td>
                      <td className={`${TD} tabular-nums`}>{c.priority ?? '—'}</td>
                      <td className={TD}><ChipList items={Array.isArray(c.matched_keywords) ? c.matched_keywords : []} max={6} tone="blue" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function CostItemDrawer({ id, init, system, categories, onClose, onSaved, onClosedAfterSave, onPreview }: {
  id: number | null; init: Form; system: boolean; categories: string[]; onClose: () => void; onSaved: () => void; onClosedAfterSave: () => void
  onPreview: (id: number, label: string) => void
}) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ item: HubCostItem; warnings: HubKeywordWarning[] } | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const pr = numOrNull(f.priority)
    if (id === null && !/^[A-Z0-9_]+$/.test(f.code)) return setError('Code is required: capital letters A-Z, digits and underscore only.')
    if (!f.name.trim()) return setError('Name is required.')
    if (pr !== null && (Number.isNaN(pr) || !Number.isInteger(pr) || pr < 1 || pr > 999)) return setError('Priority must be a whole number between 1 and 999.')
    setBusy(true); setError(null)
    try {
      const r = await hubSaveCostItem(id, {
        ...(id === null ? { code: f.code } : {}), name: f.name.trim(), category: f.category.trim().toUpperCase() || null, gl_account: f.gl_account.trim() || null,
        priority: pr, keywords: f.keywords, is_active: system ? true : f.is_active,
      })
      onSaved()
      const w = (r?.warnings || []).filter(Boolean)
      if (w.length === 0) { onClosedAfterSave(); return }
      setSaved({ item: r.item, warnings: w }); setBusy(false) // drawer tetap terbuka utk menampilkan peringatan keyword
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <HubDrawer title={id === null ? 'Add cost item' : 'Edit cost item'} onClose={saved ? onClosedAfterSave : onClose} busy={busy}
      footer={saved
        ? <>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => onPreview(saved.item?.id ?? id ?? 0, `${saved.item?.code ?? f.code} ${saved.item?.name ?? f.name}`)} disabled={!(saved.item?.id ?? id)}>Preview re-classify</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={onClosedAfterSave}>Done</button>
        </>
        : <>
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save cost item'}</button>
        </>}>
      {saved && (
        <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#7A4F00] space-y-1" role="alert" data-keyword-warnings>
          <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} /> Saved — check these keywords</p>
          <ul className="list-disc pl-5">
            {saved.warnings.map((w, i) => <li key={i}>Keyword <b>{w.keyword}</b> is also used by <b>{w.other_code}</b> ({WARN_KIND[w.kind || ''] || w.kind || 'overlap'})</li>)}
          </ul>
        </div>
      )}
      {error && <div className={errBox} role="alert">{error}</div>}
      <fieldset disabled={!!saved || busy} className="space-y-3 border-0 p-0 m-0 min-w-0">
        <Field label="Code" required={id === null} helper={id === null ? 'Capital letters A-Z, digits and underscore.' : 'The code of a cost item cannot be changed'}>
          <input className={`${SA_INPUT} font-mono uppercase`} value={f.code} readOnly={id !== null} disabled={id !== null} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
        </Field>
        <Field label="Name" required><input className={SA_INPUT} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Category">
          <input className={`${SA_INPUT} uppercase`} list="hub-cost-categories" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Choose or type a new category" />
          <datalist id="hub-cost-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GL account"><input className={SA_INPUT} value={f.gl_account} onChange={e => set('gl_account', e.target.value)} /></Field>
          <Field label="Priority" hint="1-999" helper="Lower number is checked first"><input className={`${SA_INPUT} tabular-nums`} inputMode="numeric" value={f.priority} onChange={e => set('priority', e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        <Field label="Keywords" helper="Words or phrases on the invoice line that identify this cost. Case and punctuation are ignored. A phrase of 3+ words wins over a single word.">
          <ChipInput values={f.keywords} onChange={v => set('keywords', v)} normalize={s => s.trim()} />
        </Field>
        <label className={`flex items-center gap-2 text-[12.5px] font-semibold ${system ? 'text-[#8A7A8B]' : 'text-[#3B1B3D]'}`} title={system ? 'Used by the system — cannot be deactivated' : undefined}>
          <input type="checkbox" className="w-4 h-4 accent-[#17663D]" checked={system ? true : f.is_active} disabled={system} onChange={e => set('is_active', e.target.checked)} /> Active
          {system && <Lock size={12} />}
        </label>
      </fieldset>
    </HubDrawer>
  )
}
