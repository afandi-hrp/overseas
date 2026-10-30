// Tab "Account mapping" hub Cost Agent Settings (SQL 110/110b/111, 2026-10-30) -- memetakan jenis biaya (cost item) ke AKUN Ascend (AC_Accounts) PER PT.
// Cocok bila AccountCode Ascend = gl_account jenis biaya. Urutan: Supabase dulu (fn_cost_agent_account_map_list) -> Ascend READ-ONLY lewat proxy lean-api yang sudah ada
// -> simpan hasilnya. "Auto-map" menarik SEMUA akun database PT lalu menyerahkannya ke server (fn_cost_agent_account_map_autofill); server yang mencocokkan, UI tidak menebak
// akun bila kode tidak ada / ganda. Pilihan manual = Manual (terkunci), tidak ditimpa Auto-map. Logika murni + tes: utils/CostAgentAccountMapLogic.ts.
import { useEffect, useRef, useState } from 'react'
import { Link2, Lock, Square, Trash2, Wand2 } from 'lucide-react'
import PaginationFooter from '../../../components/PaginationFooter'
import { FilterSearch } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD } from '../../../components/SeaAirAuditUi'
import {
  ACCOUNT_STATUS_CHIPS, accountBadges, autofillLists, autofillSummary,
  type AccountMapRow, type AccountMapStatus, type AutofillResult,
} from '../../../utils/CostAgentAccountMapLogic'
import { ascendErrorText } from './ascendApi'
import { ACCOUNT_MAP_PAGE_SIZE, accountMapAutofill, accountMapDelete, accountMapList, fetchAllAscendAccounts } from './accountMapApi'
import ChooseAccountDialog from './ChooseAccountDialog'
import { hubListCompanies } from './hubApi'
import {
  ConfirmModal, FILTER_CTRL, FILTER_SEARCH, HubFilterBar, HubToolbarEnd, ICON_BTN, ICON_BTN_DANGER, ResetButton, StateRow, TD, TH, TableCard, useAsync, useDebounced, type HubCtx,
} from './hubUi'

const NONE = <span className="text-[#8A7A8B]">—</span>

function RowBadges({ r }: { r: AccountMapRow }) {
  if (!r.mapped) return r.gl_account ? <Chip tone="amber">Missing</Chip> : <Chip tone="grey">No account code</Chip>
  const badges = accountBadges(r)
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badges.map(b => (
        <Chip key={b.key} tone={b.tone}>{b.locked && <Lock size={10} className="mr-1" aria-label="Locked" />}{b.label}</Chip>
      ))}
    </span>
  )
}

function AutofillPanel({ r, ascendTotal }: { r: AutofillResult; ascendTotal: number | null }) {
  const lists = autofillLists(r)
  return (
    <section className={`${SA_CARD} p-4 space-y-3`} role="status" data-autofill-result>
      <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#6B3470]">Auto-map result · {r.company}</h3>
      <dl className="grid grid-cols-2 @min-[700px]:grid-cols-3 gap-x-6 gap-y-2 text-[12.5px] text-[#3B1B3D]">
        {autofillSummary(r).map(s => (
          <div key={s.label}><dt className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8A7A8B]">{s.label}</dt><dd className="font-bold tabular-nums">{s.value.toLocaleString('en-US')}</dd></div>
        ))}
      </dl>
      {ascendTotal !== null && ascendTotal !== r.accounts_received && (
        <p className="text-[11.5px] text-[#6E5E70]">Ascend reported {ascendTotal.toLocaleString('en-US')} accounts; {r.accounts_received.toLocaleString('en-US')} had both an id and a code.</p>
      )}
      <div className="grid gap-3 @min-[900px]:grid-cols-3">
        {lists.map(l => (
          <div key={l.key} className="rounded-lg border border-[#EADFD6] p-2.5 min-w-0" data-autofill-list={l.key}>
            <div className="text-[12px] font-bold text-[#3B1B3D]">{l.title} <span className="font-normal text-[#6E5E70] tabular-nums">({l.rows.length})</span></div>
            <p className="text-[11px] text-[#6E5E70] mb-1.5">{l.hint}</p>
            {l.rows.length === 0 ? <p className="text-[12px] text-[#8A7A8B] italic">None</p> : (
              <ul className="max-h-40 overflow-y-auto space-y-0.5 text-[12px]">
                {l.rows.map(x => (
                  <li key={`${x.cost_item_id}`} className="flex items-baseline gap-2">
                    <span className="font-mono font-semibold text-[11.5px]">{x.code}</span>
                    <span className="text-[#6E5E70]">account {x.gl_account}{x.candidates ? ` · ${x.candidates} candidates` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {r.vendor_override_not_in_ascend.length > 0 && (
        <div className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] p-2.5 text-[12px] text-[#7A4F00]" data-autofill-list="vendor_override_not_in_ascend">
          <div className="font-bold">Vendor overrides with an account that is not in Ascend ({r.vendor_override_not_in_ascend.length})</div>
          <ul className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
            {r.vendor_override_not_in_ascend.map((o, i) => <li key={i}>Vendor #{o.vendor_id} · cost item #{o.cost_item_id} · account <b className="font-mono">{o.gl_account}</b></li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

export default function AccountMappingTab({ ctx }: { ctx: HubCtx }) {
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<AccountMapStatus>('all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pick, setPick] = useState<AccountMapRow | null>(null)
  const [removing, setRemoving] = useState<AccountMapRow | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [auto, setAuto] = useState<{ phase: 'load' | 'save'; loaded: number; total: number | null } | null>(null)
  const [result, setResult] = useState<{ r: AutofillResult; ascendTotal: number | null } | null>(null)
  const stopRef = useRef(false)

  const companies = useAsync(() => hubListCompanies().then(r => r.rows.filter(c => c.is_active)), [])
  const codes = (companies.data ?? []).map(c => c.code)
  // PT wajib (database Ascend berbeda per PT): bawaan = PT pertama.
  useEffect(() => { if (!company && codes.length > 0) setCompany(codes[0]) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [codes.join(','), company])

  const filterKey = [company, status, q].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  useEffect(() => { setResult(null) }, [company])
  const list = useAsync(() => (company
    ? accountMapList({ company, q, status, offset: (page - 1) * ACCOUNT_MAP_PAGE_SIZE })
    : Promise.resolve({ total: 0, rows: [] as AccountMapRow[] })), [filterKey, page])
  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const db = rows.find(r => r.ascend_db)?.ascend_db ?? null

  const runRemove = async () => {
    if (!removing) return
    setRemoveBusy(true); setRemoveErr(null)
    try { await accountMapDelete(removing.cost_item_id, removing.company_code); ctx.toast('Account mapping removed.'); setRemoving(null); list.reload() }
    catch (e: any) { setRemoveErr(e?.message || String(e)); ctx.toast(e?.message || String(e), 'err') } finally { setRemoveBusy(false) }
  }

  // Nama database Ascend datang dari server (ascend_db) -- bila filter saat ini tidak menampilkan baris, minta satu baris tanpa filter.
  const resolveDb = async (): Promise<string | null> => db ?? (await accountMapList({ company, limit: 1 })).rows.find(r => r.ascend_db)?.ascend_db ?? null

  const runAuto = async () => {
    stopRef.current = false; setResult(null); setAuto({ phase: 'load', loaded: 0, total: null })
    try {
      const database = await resolveDb()
      if (!database) { ctx.toast(`No Ascend database is known for ${company}.`, 'err'); return }
      const got = await fetchAllAscendAccounts(database, (loaded, tot) => setAuto({ phase: 'load', loaded, total: tot }), () => stopRef.current)
      if (got.stopped) { ctx.toast('Stopped. Nothing was saved.', 'warn'); return }
      if (got.accounts.length === 0) { ctx.toast(`Ascend returned no accounts for ${database}.`, 'warn'); return }
      setAuto({ phase: 'save', loaded: got.accounts.length, total: got.total })
      const r = await accountMapAutofill(company, got.accounts)
      setResult({ r, ascendTotal: got.total })
      ctx.toast(`${r.mapped_new} newly mapped, ${r.updated} updated, ${r.not_in_ascend.length} not in Ascend.`, r.not_in_ascend.length || r.ambiguous.length ? 'warn' : 'ok')
      list.reload()
    } catch (e: any) { ctx.toast(ascendErrorText(e), 'err') } finally { setAuto(null) }
  }

  const cols = 5
  return (
    <div className="space-y-3" data-account-mapping>
      <HubFilterBar>
        <select aria-label="Company" className={FILTER_CTRL} value={company} disabled={!!auto} onChange={e => setCompany(e.target.value)}>
          {codes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="inline-flex flex-wrap rounded-xl border border-[#EADFD6] bg-white p-0.5" role="group" aria-label="Status">
          {ACCOUNT_STATUS_CHIPS.map(c => (
            <button key={c.key} type="button" aria-pressed={status === c.key} onClick={() => setStatus(c.key)}
              className={`h-8 px-3 rounded-[10px] text-xs font-semibold transition-colors ${status === c.key ? 'bg-[#6B3470] text-white' : 'text-[#6E5E70] hover:bg-[#F5EDF3]'}`}>{c.label}</button>
          ))}
        </div>
        <div className={FILTER_SEARCH}><FilterSearch value={search} onChange={setSearch} placeholder="Search cost items or accounts…" /></div>
        {db && <span className="text-[11.5px] text-[#6E5E70]">Ascend database: <span className="font-mono font-semibold text-[#3B1B3D]">{db}</span></span>}
        <ResetButton onClick={() => { setSearch(''); setStatus('all') }} />
        <HubToolbarEnd count={list.data ? `${total.toLocaleString('en-US')} cost items` : ''} viewOnly={!ctx.editable}>
          {auto ? (
            <>
              <span className="text-[12px] font-semibold text-[#5A305A] tabular-nums" role="status">
                {auto.phase === 'load' ? `Loading Ascend accounts ${auto.loaded.toLocaleString('en-US')}${auto.total !== null ? `/${auto.total.toLocaleString('en-US')}` : ''}…` : `Mapping ${auto.loaded.toLocaleString('en-US')} accounts…`}
              </span>
              {auto.phase === 'load' && <button type="button" className={SA_BTN_OUTLINE} onClick={() => { stopRef.current = true }}><Square size={12} /> Stop</button>}
            </>
          ) : (
            <button type="button" className={SA_BTN_PRIMARY} disabled={!ctx.editable || !company || list.loading} onClick={runAuto}
              title={ctx.editable ? 'Load every account of this company’s Ascend database and map cost items whose account code matches' : 'You have no edit access'}><Wand2 size={13} /> Auto-map</button>
          )}
        </HubToolbarEnd>
      </HubFilterBar>

      {result && <AutofillPanel r={result.r} ascendTotal={result.ascendTotal} />}

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr><th className={TH}>Cost item</th><th className={TH}>Default account</th><th className={TH}>Ascend account</th><th className={TH}>Status</th><th className={TH} /></tr>
          </thead>
          <tbody>
            <StateRow colSpan={cols} loading={list.loading} error={list.error} onRetry={list.reload} empty={rows.length === 0} emptyText="No cost items match the filter" />
            {!list.loading && !list.error && rows.map(r => (
              <tr key={r.cost_item_id} className="border-t border-[#F3EEEA]" data-account-row={r.mapped ? 'mapped' : 'missing'}>
                <td className={`${TD} min-w-[200px]`}>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[11px] text-[#6E5E70]">{r.code}{r.category ? ` · ${r.category}` : ''}</div>
                  {r.ap_description && <div className="text-[11px] text-[#6E5E70]">AP Note: {r.ap_description}</div>}
                </td>
                <td className={`${TD} whitespace-nowrap font-mono`}>{r.gl_account || NONE}</td>
                <td className={TD}>{r.mapped ? <><span className="font-mono font-semibold">{r.account_code}</span>{r.account_name && <span className="text-[#6E5E70]"> - {r.account_name}</span>}</> : NONE}</td>
                <td className={TD}><RowBadges r={r} /></td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  {ctx.editable && (
                    <button type="button" className={ICON_BTN} disabled={!!auto || !r.ascend_db} onClick={() => setPick(r)} aria-label={`${r.mapped ? 'Change' : 'Choose'} account for ${r.name}`}
                      title={r.ascend_db ? undefined : 'No Ascend database is known for this company'}><Link2 size={12} /> {r.mapped ? 'Change' : 'Choose account'}</button>
                  )}
                  {ctx.editable && r.mapped && (
                    <button type="button" className={ICON_BTN_DANGER} disabled={!!auto} onClick={() => { setRemoveErr(null); setRemoving(r) }} aria-label={`Remove account mapping of ${r.name}`}><Trash2 size={12} /> Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationFooter start={total === 0 ? 0 : (page - 1) * ACCOUNT_MAP_PAGE_SIZE + 1} end={Math.min(page * ACCOUNT_MAP_PAGE_SIZE, total)} total={total} unit="rows"
          page={page} totalPages={Math.max(1, Math.ceil(total / ACCOUNT_MAP_PAGE_SIZE))} onPage={setPage} />
      </TableCard>

      {pick && pick.ascend_db && <ChooseAccountDialog row={pick} database={pick.ascend_db} toast={ctx.toast} onClose={() => setPick(null)} onSaved={() => { setPick(null); list.reload() }} />}
      {removing && (
        <ConfirmModal title="Remove account mapping" danger confirmLabel="Remove" busy={removeBusy} error={removeErr} onConfirm={runRemove} onClose={() => setRemoving(null)}>
          <p>Remove the Ascend account of <b>{removing.name}</b> for <b>{removing.company_code}</b>? AP Notes then use the cost item's default account ({removing.gl_account || 'none'}) until it is mapped again.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
