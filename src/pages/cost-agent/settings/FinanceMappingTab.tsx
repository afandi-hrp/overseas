// Tab "Finance mapping" hub Cost Agent Settings (2026-10-28, sql/084) -- memetakan master kita (supplier/vendor, kapal, jenis biaya) ke master Ascend
// supaya AP Note nanti bisa dibuat. Urutan: Supabase dulu (fn_cost_agent_finance_list_map) -> Ascend (read-only, lewat proxy lean-api) -> simpan hasilnya.
// "Auto-map missing" hanya menyimpan bila TEPAT SATU kandidat yakin (fn_cost_agent_finance_pick = 'auto'); pilihan user terkunci (Manual).
// Nama database Ascend datang dari server (kolom ascend_db), tidak dihitung di frontend. Jenis biaya SELALU per PT (ID expense type berbeda di tiap database Ascend, sql/086). Detail: docs/claude/cost-agent.md.
import { useEffect, useRef, useState } from 'react'
import { Lock, Link2, Trash2, Wand2, Square, Layers } from 'lucide-react'
import PaginationFooter from '../../../components/PaginationFooter'
import { FilterSearch } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { ConfirmModal, FILTER_CTRL, HubFilterBar, HubToolbarEnd, ICON_BTN, ICON_BTN_DANGER, StateRow, TD, TH, TableCard, useAsync, useDebounced, type HubCtx } from './hubUi'
import { hubListCompanies } from './hubApi'
import {
  FIN_PAGE_SIZE, autoMapAll, finDeleteMap, finListMap, finSetAlias,
  type AutoItem, type AutoSummary, type FinExpenseRow, type FinKind, type FinList, type FinSupplierRow, type FinVesselRow,
} from './financeApi'
import MapToAscendDialog, { type MapTarget } from './MapToAscendDialog'

const KINDS: { key: FinKind; label: string; noun: string }[] = [
  { key: 'supplier', label: 'Suppliers', noun: 'suppliers' },
  { key: 'vessel', label: 'Vessels', noun: 'vessels' },
  { key: 'expense', label: 'Cost items', noun: 'cost items' },
]

function SourceChip({ mapped, source }: { mapped: boolean; source: string | null }) {
  if (!mapped) return <Chip tone="amber">Missing</Chip>
  return source === 'user' ? <Chip tone="plum"><Lock size={10} className="mr-1" />Manual</Chip> : <Chip tone="blue">Auto</Chip>
}

const joinCodeName = (code: string | null, name: string | null) => [code, name].filter(Boolean).join(' - ') || '—'

// Alias nama biaya di Deskripsi AP Note: simpan saat keluar dari kolom bila berubah. Kosong = pakai nama jenis biaya.
function AliasCell({ row, editable, toast }: { row: FinExpenseRow; editable: boolean; toast: HubCtx['toast'] }) {
  const [val, setVal] = useState(row.finance_alias || '')
  const saved = useRef(row.finance_alias || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVal(row.finance_alias || ''); saved.current = row.finance_alias || '' }, [row.finance_alias])
  const commit = async () => {
    if (val.trim().toUpperCase() === saved.current.toUpperCase()) return
    setBusy(true)
    try {
      const r = await finSetAlias(row.cost_item_id, val)
      saved.current = r.finance_alias || ''; setVal(saved.current)
      toast('AP Note name saved.')
    } catch (e: any) { setVal(saved.current); toast(e?.message || String(e), 'err') } finally { setBusy(false) }
  }
  return (
    <input className={`${SA_INPUT} h-8 min-w-[160px]`} value={val} disabled={!editable || busy} placeholder={row.name.toUpperCase()} maxLength={100}
      aria-label={`AP Note name for ${row.name}`} onChange={e => setVal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

type AnyRow = FinSupplierRow | FinVesselRow | FinExpenseRow
interface AutoRound { label: string; sum: AutoSummary | null; note?: string }

const COMPANY_KEY = 'finance-mapping-company'
const savedCompany = (): string => { try { return localStorage.getItem(COMPANY_KEY) || '' } catch { return '' } }

export default function FinanceMappingTab({ ctx }: { ctx: HubCtx }) {
  const [kind, setKind] = useState<FinKind>('supplier')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'all' | 'mapped' | 'missing'>('all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<MapTarget | null>(null)
  const [dialogDb, setDialogDb] = useState('')
  const [removing, setRemoving] = useState<{ id: number; label: string } | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [auto, setAuto] = useState<{ done: number; total: number; label: string } | null>(null)
  // Hasil Auto-map terakhir: satu entri per putaran (label kosong = putaran tunggal; kode PT bila "Auto-map all companies").
  const [autoResults, setAutoResults] = useState<AutoRound[]>([])
  const stopRef = useRef(false)

  const companies = useAsync(() => hubListCompanies().then(r => r.rows.filter(c => c.is_active)), [])
  const scopeCompany = company
  const codes = (companies.data ?? []).map(c => c.code)
  // Jenis biaya WAJIB per PT: tanpa pilihan "All companies"; bawaan = PT terakhir yang dipakai, kalau tidak ada = PT pertama.
  useEffect(() => {
    if (kind !== 'expense' || company || codes.length === 0) return
    setCompany(codes.includes(savedCompany()) ? savedCompany() : codes[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, company, codes.join(',')])
  useEffect(() => { if (company) try { localStorage.setItem(COMPANY_KEY, company) } catch { /* private mode */ } }, [company])

  const filterKey = [kind, scopeCompany, status, q].join('|')
  useEffect(() => { setPage(1); setAutoResults([]) }, [filterKey])
  const list = useAsync(() => (kind === 'expense' && !scopeCompany
    ? Promise.resolve({ total: 0, rows: [] } as FinList<FinKind>) // menunggu PT bawaan terpilih
    : finListMap(kind, { company: scopeCompany, q, status, offset: (page - 1) * FIN_PAGE_SIZE })), [filterKey, page])
  const rows = (list.data?.rows ?? []) as AnyRow[]
  const total = list.data?.total ?? 0
  const noun = KINDS.find(k => k.key === kind)!.noun
  const reloadAll = () => list.reload()

  const openMap = (r: AnyRow) => {
    if (kind === 'supplier') { const x = r as FinSupplierRow; if (!x.ascend_db) { ctx.toast(`Company ${x.company_code} has no Ascend database.`, 'err'); return } setDialogDb(x.ascend_db); setDialog({ kind, refId: x.vendor_id, company: x.company_code, label: x.vendor_name, npwp: x.vendor_npwp }) }
    else if (kind === 'vessel') { const x = r as FinVesselRow; if (!x.ascend_db) { ctx.toast(`Company ${x.company_code} has no Ascend database.`, 'err'); return } setDialogDb(x.ascend_db); setDialog({ kind, refId: x.vessel_id, company: x.company_code, label: x.vessel_name_master }) }
    else {
      const x = r as FinExpenseRow
      if (!x.ascend_db) { ctx.toast('No Ascend database is known for this company.', 'err'); return }
      setDialogDb(x.ascend_db); setDialog({ kind, refId: x.cost_item_id, company: x.company_code, label: x.name, alias: x.finance_alias })
    }
  }

  const runRemove = async () => {
    if (!removing) return
    setRemoveBusy(true); setRemoveErr(null)
    try { await finDeleteMap(kind, removing.id); ctx.toast('Mapping removed.'); setRemoving(null); reloadAll() }
    catch (e: any) { setRemoveErr(e?.message || String(e)); ctx.toast(e?.message || String(e), 'err') } finally { setRemoveBusy(false) }
  }

  // Semua baris Missing pada satu filter (bukan hanya halaman yang tampil).
  const collectMissing = async (k: FinKind, co: string, text: string): Promise<AnyRow[]> => {
    const missing: AnyRow[] = []
    for (let off = 0; off < 2000; off += 500) {
      const r = await finListMap(k, { company: co, q: text, status: 'missing', limit: 500, offset: off })
      missing.push(...(r.rows as AnyRow[]))
      if (missing.length >= r.total || r.rows.length === 0) break
    }
    return missing
  }
  const buildItems = (k: FinKind, missing: AnyRow[]) => {
    const items: AutoItem[] = []
    let skipped = 0
    for (const r of missing) {
      if (k === 'supplier') { const x = r as FinSupplierRow; if (x.ascend_db) items.push({ kind: k, refId: x.vendor_id, company: x.company_code, database: x.ascend_db, name: x.vendor_name, npwp: x.vendor_npwp }); else skipped++ }
      else if (k === 'vessel') { const x = r as FinVesselRow; if (x.ascend_db) items.push({ kind: k, refId: x.vessel_id, company: x.company_code, database: x.ascend_db, name: x.vessel_name_master }); else skipped++ }
      else { const x = r as FinExpenseRow; if (x.ascend_db) items.push({ kind: k, refId: x.cost_item_id, company: x.company_code, database: x.ascend_db, name: x.name, alias: x.finance_alias }); else skipped++ }
    }
    return { items, skipped }
  }
  // Satu putaran Auto-map: cari ke Ascend (maks 3 bersamaan), simpan hanya yang 'auto'; pilihan manual (gembok) tidak ditimpa.
  const autoRound = async (k: FinKind, co: string, text: string, label: string): Promise<AutoRound> => {
    const { items, skipped } = buildItems(k, await collectMissing(k, co, text))
    if (items.length === 0) return { label, sum: null, note: skipped ? 'no Ascend database for these rows' : 'nothing is missing' }
    setAuto({ done: 0, total: items.length, label })
    return { label, sum: await autoMapAll(items, (done, tot) => setAuto({ done, total: tot, label }), () => stopRef.current) }
  }
  const sumText = (x: AutoSummary) => `${x.mapped} mapped automatically, ${x.needChoice} need your choice${x.failed ? `, ${x.failed} failed` : ''}`

  const runAuto = async () => {
    stopRef.current = false; setAutoResults([]); setAuto({ done: 0, total: 0, label: '' })
    try {
      const r = await autoRound(kind, scopeCompany, q, '')
      setAutoResults([r])
      if (!r.sum) ctx.toast(r.note === 'nothing is missing' ? 'Nothing is missing for this filter.' : 'No Ascend database is known for the missing rows.', r.note === 'nothing is missing' ? 'ok' : 'warn')
      else ctx.toast(r.sum.failed && !r.sum.mapped ? `${sumText(r.sum)}. ${r.sum.firstError ?? ''}` : `${sumText(r.sum)}.`, r.sum.failed ? 'warn' : 'ok')
      reloadAll()
    } catch (e: any) { ctx.toast(e?.message || String(e), 'err') } finally { setAuto(null) }
  }

  // Cost items: setiap PT berurutan (database tiap PT berbeda); teks cari diabaikan supaya semua jenis biaya yang Missing ikut.
  const runAutoAll = async () => {
    stopRef.current = false; setAutoResults([]); setAuto({ done: 0, total: 0, label: '' })
    const results: AutoRound[] = []
    try {
      for (let n = 0; n < codes.length && !stopRef.current; n++) {
        const r = await autoRound('expense', codes[n], '', `${codes[n]} (${n + 1}/${codes.length})`)
        results.push({ ...r, label: codes[n] })
        setAutoResults([...results])
      }
      const mapped = results.reduce((a, r) => a + (r.sum?.mapped ?? 0), 0)
      const need = results.reduce((a, r) => a + (r.sum?.needChoice ?? 0), 0)
      const failed = results.reduce((a, r) => a + (r.sum?.failed ?? 0), 0)
      ctx.toast(`${stopRef.current ? 'Stopped. ' : ''}All companies: ${mapped} mapped automatically, ${need} need your choice${failed ? `, ${failed} failed` : ''}.`, failed ? 'warn' : 'ok')
      reloadAll()
    } catch (e: any) { ctx.toast(e?.message || String(e), 'err') } finally { setAuto(null) }
  }

  const cols = 6
  return (
    <div className="space-y-3" data-finance-mapping>
      <HubFilterBar>
        <div className="inline-flex rounded-xl border border-[#EADFD6] bg-white p-0.5" role="group" aria-label="Mapping type">
          {KINDS.map(k => (
            <button key={k.key} type="button" aria-pressed={kind === k.key} disabled={!!auto}
              onClick={() => { setKind(k.key); setSearch(''); setStatus('all') }}
              className={`h-8 px-3 rounded-[10px] text-xs font-semibold transition-colors ${kind === k.key ? 'bg-[#6B3470] text-white' : 'text-[#6E5E70] hover:bg-[#F5EDF3]'}`}>{k.label}</button>
          ))}
        </div>
        <select aria-label="Company" className={FILTER_CTRL} value={company} onChange={e => setCompany(e.target.value)}>
          {kind !== 'expense' && <option value="">All companies</option>}
          {(companies.data ?? []).map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <select aria-label="Status" className={FILTER_CTRL} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
          <option value="all">All</option><option value="mapped">Mapped</option><option value="missing">Missing</option>
        </select>
        <div className="w-[240px] flex"><FilterSearch value={search} onChange={setSearch} placeholder={`Search ${noun}…`} /></div>
        {kind === 'expense' && !list.loading && (rows[0] as FinExpenseRow | undefined)?.ascend_db && (
          <span className="text-[11.5px] text-[#6E5E70]">Ascend database: <span className="font-mono font-semibold text-[#3B1B3D]">{(rows[0] as FinExpenseRow).ascend_db}</span></span>
        )}
        <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setSearch(''); setStatus('all'); if (kind !== 'expense') setCompany('') }}>Reset</button>
        <HubToolbarEnd count={list.data ? `${total.toLocaleString('en-US')} ${noun}` : ''} viewOnly={!ctx.editable}>
          {auto ? (
            <>
              <span className="text-[12px] font-semibold text-[#5A305A] tabular-nums" role="status">Auto-mapping {auto.label ? `${auto.label} ` : ''}{auto.done}/{auto.total || '…'}</span>
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => { stopRef.current = true }}><Square size={12} /> Stop</button>
            </>
          ) : (
            <button type="button" className={SA_BTN_PRIMARY} disabled={!ctx.editable || list.loading} onClick={runAuto}
              title={ctx.editable ? 'Search Ascend for every Missing row in this filter and save the unambiguous matches' : 'You have no edit access'}><Wand2 size={13} /> Auto-map missing</button>
          )}
          {!auto && kind === 'expense' && (
            <button type="button" className={SA_BTN_OUTLINE} disabled={!ctx.editable || codes.length === 0} onClick={runAutoAll}
              title={ctx.editable ? 'Run Auto-map for every company, one after another (each company has its own Ascend database)' : 'You have no edit access'}><Layers size={13} /> Auto-map all companies</button>
          )}
        </HubToolbarEnd>
      </HubFilterBar>

      {autoResults.length > 0 && (
        <div className="rounded-lg border border-[#EADFD6] bg-white px-3 py-2 text-[12.5px] text-[#3B1B3D] space-y-0.5" role="status" data-auto-summary>
          {autoResults.map((r, i) => (
            <div key={i}>
              {r.label && <b className="font-mono mr-1">{r.label}:</b>}
              {r.sum ? <>
                {r.sum.stopped && <b>Stopped. </b>}
                <b>{r.sum.mapped}</b> mapped, <b>{r.sum.needChoice}</b> need your choice
                {r.sum.locked > 0 && <>, {r.sum.locked} skipped (manual mapping is locked)</>}
                {r.sum.failed > 0 && <>, <span className="text-[#A8231A]">{r.sum.failed} failed{r.sum.firstError ? ` (${r.sum.firstError})` : ''}</span></>}.
              </> : <span className="text-[#6E5E70]">{r.note}.</span>}
            </div>
          ))}
        </div>
      )}

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              {kind === 'supplier' && <><th className={TH}>Vendor</th><th className={TH}>Company</th><th className={TH}>Ascend DB</th><th className={TH}>Ascend supplier</th></>}
              {kind === 'vessel' && <><th className={TH}>Vessel</th><th className={TH}>Company</th><th className={TH}>Ascend DB</th><th className={TH}>Ascend vessel</th></>}
              {kind === 'expense' && <><th className={TH}>Cost item</th><th className={TH}>AP Note name</th><th className={TH}>Ascend expense type</th><th className={TH}>Mapped in</th></>}
              <th className={TH}>Source</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={cols} loading={list.loading} error={list.error} onRetry={list.reload} empty={rows.length === 0} emptyText={`No ${noun} match the filter`} />
            {!list.loading && !list.error && rows.map(r => {
              const label = kind === 'supplier' ? (r as FinSupplierRow).vendor_name : kind === 'vessel' ? (r as FinVesselRow).vessel_name_master : (r as FinExpenseRow).name
              return (
                <tr key={`${kind}-${r.map_id ?? 'x'}-${kind === 'supplier' ? `${(r as FinSupplierRow).vendor_id}-${(r as FinSupplierRow).company_code}` : kind === 'vessel' ? `${(r as FinVesselRow).vessel_id}-${(r as FinVesselRow).company_code}` : (r as FinExpenseRow).cost_item_id}`}
                  className="border-t border-[#F3EEEA]" data-fin-row={r.mapped ? 'mapped' : 'missing'}>
                  {kind === 'supplier' && (() => { const x = r as FinSupplierRow; return <>
                    <td className={TD}><div className="font-semibold">{x.vendor_name}</div>{x.vendor_npwp && <div className="text-[11px] text-[#6E5E70] tabular-nums">{x.vendor_npwp}</div>}</td>
                    <td className={`${TD} font-mono font-bold`}>{x.company_code}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{x.ascend_db || '—'}</td>
                    <td className={TD}>{x.mapped ? joinCodeName(x.supplier_code, x.supplier_name) : <span className="text-[#8A7A8B]">—</span>}</td>
                  </> })()}
                  {kind === 'vessel' && (() => { const x = r as FinVesselRow; return <>
                    <td className={`${TD} font-semibold`}>{x.vessel_name_master}</td>
                    <td className={`${TD} font-mono font-bold`}>{x.company_code}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{x.ascend_db || '—'}</td>
                    <td className={TD}>{x.mapped ? joinCodeName(x.vessel_code, x.vessel_name) : <span className="text-[#8A7A8B]">—</span>}</td>
                  </> })()}
                  {kind === 'expense' && (() => { const x = r as FinExpenseRow; return <>
                    <td className={TD}><div className="font-semibold">{x.name}</div><div className="text-[11px] text-[#6E5E70]">{x.code}{x.category ? ` · ${x.category}` : ''}</div></td>
                    <td className={TD}><AliasCell row={x} editable={ctx.editable} toast={ctx.toast} /></td>
                    <td className={TD}>{x.mapped ? <><div>{x.expense_type_desc || '—'}</div><div className="text-[11px] text-[#6E5E70]">{x.account_name || ''}</div></> : <span className="text-[#8A7A8B]">—</span>}</td>
                    <td className={TD}>{(x.mapped_in ?? []).length === 0 ? <span className="text-[#8A7A8B]">—</span> : <span className="inline-flex flex-wrap gap-1">{(x.mapped_in ?? []).map(c => <Chip key={c} tone={c === x.company_code ? 'plum' : 'grey'}>{c}</Chip>)}</span>}</td>
                  </> })()}
                  <td className={`${TD} whitespace-nowrap`}><SourceChip mapped={r.mapped} source={r.source} /></td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {ctx.editable && <button type="button" className={ICON_BTN} onClick={() => openMap(r)} disabled={!!auto} aria-label={`${r.mapped ? 'Change' : 'Map'} ${label}`}><Link2 size={12} /> {r.mapped ? 'Change' : 'Map'}</button>}
                    {ctx.editable && r.mapped && r.map_id !== null && <button type="button" className={ICON_BTN_DANGER} onClick={() => { setRemoveErr(null); setRemoving({ id: r.map_id as number, label }) }} disabled={!!auto} aria-label={`Remove mapping of ${label}`}><Trash2 size={12} /> Remove</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <PaginationFooter start={total === 0 ? 0 : (page - 1) * FIN_PAGE_SIZE + 1} end={Math.min(page * FIN_PAGE_SIZE, total)} total={total} unit="rows"
          page={page} totalPages={Math.max(1, Math.ceil(total / FIN_PAGE_SIZE))} onPage={setPage} />
      </TableCard>

      {dialog && <MapToAscendDialog target={dialog} database={dialogDb} toast={ctx.toast}
        onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reloadAll() }} />}
      {removing && (
        <ConfirmModal title="Remove mapping" danger confirmLabel="Remove" busy={removeBusy} error={removeErr} onConfirm={runRemove} onClose={() => setRemoving(null)}>
          <p>Remove the Ascend mapping of <b>{removing.label}</b>? Invoices that use it will show it as Missing until it is mapped again.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
