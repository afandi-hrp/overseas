// Tab "Vessel (Ascend)", "Supplier (Ascend)", "Expense Type (Ascend)" hub Cost Agent Settings (2026-10-27) -- master data Ascend (SQL Server)
// yang dibaca READ-ONLY lewat lean-api OData: browser -> /api/lean/odata/* (server/routes/lean.ts, X-Api-Key diisi server) -> lean-api /odata.
// Kolom TIDAK ditulis manual: daftar kolom dari $metadata lean-api, user boleh memilih kolom yang tampil (dikirim sbg $select).
// Setiap panggilan WAJIB membawa ?database= (13 database Ascend); pilihan terakhir diingat di localStorage.
import { useEffect, useMemo, useState } from 'react'
import { Columns3, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react'
import { FilterSearch } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE } from '../../../components/SeaAirAuditUi'
import { odata } from './ascendApi' // panggilan Ascend dipakai bersama tab Finance mapping & kartu invoice
import { fmtNumber } from '../../../utils/CostAgentHelpers'
import { FILTER_CTRL, HUB_PAGE_SIZE, HubFilterBar, Pager, StateRow, TD, TH, TableCard, useAsync, useDebounced, type HubCtx } from './hubUi'

const DATABASES = [
  'AS_WNS', 'AS_WNS_TEST', 'AS_MJS', 'AS_MJS_TSET', 'AS_AMT', 'AS_AMT_TEST', 'AS_IMI', 'AS_IMI_TEST', 'AS_GMI', 'AS_GMI_TEST', 'AS_TTP', 'AS_TTP_TEST', 'AS_GUN', 'AS_WSI',
]
const DB_KEY = 'ascend-odata-database'

interface Meta { entities: Record<string, { key: string[]; columns: { name: string; type: string }[] }> }
type Row = Record<string, unknown>

const metaCache = new Map<string, Promise<Meta>>()

function getMeta(database: string): Promise<Meta> {
  let p = metaCache.get(database)
  if (!p) {
    p = odata<Meta>('$metadata', { database })
    p.catch(() => metaCache.delete(database)) // jangan menyimpan kegagalan
    metaCache.set(database, p)
  }
  return p
}

const PREFERRED = /name|desc|code|alias|disabled|vessel|fleet|city|country|phone|email|type/i
function defaultColumns(cols: { name: string }[], key: string[]): string[] {
  const names = cols.map(c => c.name)
  const picked = [...key.filter(k => names.includes(k)), ...names.filter(n => !key.includes(n) && PREFERRED.test(n))]
  return (picked.length ? picked : names).slice(0, 8)
}

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className="text-[#8A7A8B]">—</span>
  if (typeof v === 'boolean') return v ? <Chip tone="green">Yes</Chip> : <Chip tone="grey">No</Chip>
  if (typeof v === 'number') return <span className="tabular-nums">{String(v)}</span>
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  const t = /^(\d{4}-\d{2}-\d{2})T00:00:00Z$/.exec(s)
  if (t) return <span className="whitespace-nowrap">{t[1]}</span>
  return <span title={s.length > 60 ? s : undefined}>{s.length > 60 ? s.slice(0, 60) + '…' : s}</span>
}

// Tab Vessel: entity set gabungan lean-api IC_InventoryUsers_Fleet (INNER JOIN IC_InventoryUserGroup_Fleet on FleetID, dikerjakan di SQL
// lean-api) dengan kolom tetap -- vessel tanpa fleet yang cocok TIDAK ikut.
const VESSEL_COLS = ['InventoryUserID', 'InventoryUserName', 'FleetName', 'Disabled', 'IsVessel']

// Database uji (AS_*_TEST; AS_MJS_TSET = penulisan asli di lean-api) disembunyikan di tab yang meminta noTest.
const TEST_DB = /_T(EST|SET)$/

// Tab Supplier: database dikunci ke AS_MJS (dropdown disabled) & kolom tetap 3.
const SUPPLIER_COLS = ['SupplierID', 'SupplierCode', 'SupplierName']

function AscendTable({ ctx, entity, label, noun, fixedCols, noTest, fixedDb }: { ctx: HubCtx; entity: string; label: string; noun: string; fixedCols?: string[]; noTest?: boolean; fixedDb?: string }) {
  const dbs = useMemo(() => (fixedDb ? [fixedDb] : noTest ? DATABASES.filter(d => !TEST_DB.test(d)) : DATABASES), [noTest, fixedDb])
  const [database, setDatabase] = useState(() => {
    if (fixedDb) return fixedDb
    try { const v = localStorage.getItem(DB_KEY); return v && dbs.includes(v) ? v : dbs[0] } catch { return dbs[0] }
  })
  useEffect(() => { if (fixedDb) return; try { localStorage.setItem(DB_KEY, database) } catch { /* private mode */ } }, [database, fixedDb])
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [status, setStatus] = useState<'' | 'active' | 'disabled'>('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [picked, setPicked] = useState<string[] | null>(null) // null = kolom default
  const [pickerOpen, setPickerOpen] = useState(false)

  const meta = useAsync(() => getMeta(database), [database])
  const ent = meta.data?.entities[entity]
  const allCols = ent?.columns ?? []
  const hasDisabled = allCols.some(c => c.name === 'Disabled')
  // Kolom tetap yang tidak ada di metadata entity dibuang (hindari $select error); sebelum meta termuat tetap daftar penuh.
  const cols = useMemo(() => (fixedCols ? (allCols.length ? fixedCols.filter(c => allCols.some(a => a.name === c)) : fixedCols) : picked ?? defaultColumns(allCols, ent?.key ?? [])), [fixedCols, picked, allCols, ent])
  const colsKey = cols.join(',')

  const filterKey = [database, q, status, sort?.col, sort?.dir, colsKey].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  useEffect(() => { setPicked(null); setSort(null); setStatus('') }, [database])

  const list = useAsync<{ rows: Row[]; total: number } | null>(async () => {
    if (!ent || cols.length === 0) return null
    const params: Record<string, string> = {
      database, $select: colsKey, $top: String(HUB_PAGE_SIZE), $skip: String((page - 1) * HUB_PAGE_SIZE), $count: 'true',
    }
    if (q) params.$search = q
    if (hasDisabled && status) params.$filter = `Disabled eq ${status === 'disabled'}`
    if (sort) params.$orderby = `${sort.col} ${sort.dir}`
    const r = await odata<{ value: Row[]; '@odata.count'?: number }>(entity, params)
    return { rows: r.value, total: r['@odata.count'] ?? r.value.length }
  }, [filterKey, page, !!ent])

  const rows = list.data?.rows ?? []
  const loading = meta.loading || list.loading
  const error = meta.error || list.error
  const reload = () => { metaCache.delete(database); meta.reload(); list.reload() }
  const nextSort = (col: string) => setSort(s => (!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null))
  const toggleCol = (name: string) => setPicked(cols.includes(name) ? cols.filter(c => c !== name) : allCols.map(c => c.name).filter(c => c === name || cols.includes(c)))

  return (
    <div className="space-y-3" data-ascend-tab={entity}>
      <HubFilterBar>
        <select aria-label="Database" className={`${FILTER_CTRL}${fixedDb ? ' opacity-70 cursor-not-allowed' : ''}`} value={database} disabled={!!fixedDb} onChange={e => setDatabase(e.target.value)}>
          {dbs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="w-[260px] flex"><FilterSearch value={search} onChange={setSearch} placeholder={`Search ${noun}…`} /></div>
        {hasDisabled && (
          <select aria-label="Status" className={FILTER_CTRL} value={status} onChange={e => setStatus(e.target.value as '' | 'active' | 'disabled')}>
            <option value="">All</option><option value="active">Active</option><option value="disabled">Disabled</option>
          </select>
        )}
        {!fixedCols && <div className="relative">
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => setPickerOpen(o => !o)} disabled={allCols.length === 0}><Columns3 size={13} /> Columns ({cols.length})</button>
          {pickerOpen && (
            <div className="absolute z-30 mt-1 w-64 max-h-72 overflow-y-auto rounded-xl border border-[#EADFD6] bg-white shadow-xl p-2 text-[12.5px] text-[#3B1B3D]">
              <button type="button" className="mb-1 text-[12px] underline" onClick={() => setPicked(null)}>Reset to default</button>
              {allCols.map(c => (
                <label key={c.name} className="flex items-center gap-2 px-1 py-0.5 hover:bg-[#FBF7F4] rounded">
                  <input type="checkbox" className="accent-[#6B3470]" checked={cols.includes(c.name)} disabled={cols.length === 1 && cols.includes(c.name)} onChange={() => toggleCol(c.name)} />
                  <span className="truncate" title={c.name}>{c.name}</span><span className="ml-auto text-[10.5px] text-[#8A7A8B]">{c.type}</span>
                </label>
              ))}
            </div>
          )}
        </div>}
        <button type="button" className={SA_BTN_OUTLINE} onClick={reload} disabled={loading} title="Reload data from Ascend"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setSearch(''); setStatus(''); setSort(null) }}>Reset</button>
        <span className="ml-auto text-[12px] text-[#6E5E70]">{list.data ? `${fmtNumber(list.data.total, 0)} ${noun}` : ''} · {label} · read only</span>
      </HubFilterBar>

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} className={`${TH} cursor-pointer select-none`} onClick={() => nextSort(c)} aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <span className="inline-flex items-center gap-1">{c}{sort?.col === c && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={Math.max(cols.length, 1)} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText={`No ${noun} match the filter`} />
            {!loading && !error && rows.map((r, i) => (
              <tr key={i} className="border-t border-[#F3EEEA]">
                {cols.map(c => <td key={c} className={TD}><Cell v={r[c]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={list.data?.total ?? 0} page={page} onPage={setPage} loading={loading} />
      </TableCard>
    </div>
  )
}

export function VesselAscendTab({ ctx }: { ctx: HubCtx }) { return <AscendTable ctx={ctx} entity="IC_InventoryUsers_Fleet" label="IC_InventoryUsers + Fleet" noun="vessels / inventory users" fixedCols={VESSEL_COLS} noTest /> }
export function SupplierAscendTab({ ctx }: { ctx: HubCtx }) { return <AscendTable ctx={ctx} entity="AP_Suppliers" label="AP_Suppliers" noun="suppliers" fixedCols={SUPPLIER_COLS} fixedDb="AS_MJS" /> }
export function ExpenseTypeAscendTab({ ctx }: { ctx: HubCtx }) { return <AscendTable ctx={ctx} entity="FI_ExpenseTypes_Account" label="FI_ExpenseTypes + AC_Accounts" noun="expense types" fixedCols={['ExpenseTypeID', 'ExpenseTypeDescription', 'AccountName', 'Disabled']} /> }
