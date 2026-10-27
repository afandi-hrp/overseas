// Tab "History" hub Cost Agent Settings (2026-10-26) -- melihat baris cost history yang dipakai pembanding dan MENONAKTIFKAN yang salah (mis. salah input)
// tanpa menghapusnya. fn_cost_agent_browse_history (filter + 50 baris/halaman) & fn_cost_agent_set_history_active (aksi massal, wajib alasan >= 5 karakter
// saat menonaktifkan; server membandingkan ulang invoice terbuka yang terdampak). Tidak ada edit isi baris / hapus di tab ini.
import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { CostAgentCombobox, FilterSearch, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_INPUT } from '../../../components/SeaAirAuditUi'
import {
  fetchCostAgentVessels, fetchCostAgentVendors, fetchCostAgentPorts, fetchCostAgentCostItems, fetchCostAgentCompanies,
  fmtDate, fmtMoney, fmtNumber, parseQtyInput,
  type CostAgentVessel, type CostAgentVendor, type CostAgentPort, type CostAgentCostItem, type CostAgentCompany,
} from '../../../utils/CostAgentHelpers'
import { hubBrowseHistory, hubSetHistoryActive, HubRpcError, type HubHistoryRow } from './hubApi'
import {
  BulkBar, ConfirmModal, FILTER_CTRL, HUB_PAGE_SIZE, HubFilterBar, Pager, RecentChanges, StateRow, TD, TH, TableCard, useAsync, useDebounced, useSelection, type HubCtx,
} from './hubUi'
import { ActiveStatus, FILTER_SEARCH, HIDE_LG, HubToolbarEnd, ResetButton } from './hubUi'

const MIN_REASON = 5

export default function HistoryTab({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [portId, setPortId] = useState<number | null>(null)
  const [itemId, setItemId] = useState<number | null>(null)
  const [company, setCompany] = useState('')
  const [active, setActive] = useState<'true' | 'false' | ''>('true') // default Active
  const [source, setSource] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minAmt, setMinAmt] = useState('')
  const [maxAmt, setMaxAmt] = useState('')
  const dMin = useDebounced(minAmt, 400), dMax = useDebounced(maxAmt, 400)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false) // baris filter tambahan (company, status, source, tanggal, nominal)
  const [logKey, setLogKey] = useState(0)
  const selection = useSelection()
  const [dialog, setDialog] = useState<'deactivate' | 'activate' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const [vessels, setVessels] = useState<CostAgentVessel[]>([])
  const [vendors, setVendors] = useState<CostAgentVendor[]>([])
  const [ports, setPorts] = useState<CostAgentPort[]>([])
  const [items, setItems] = useState<CostAgentCostItem[]>([])
  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  useEffect(() => {
    Promise.all([fetchCostAgentVessels(), fetchCostAgentVendors(), fetchCostAgentPorts(), fetchCostAgentCostItems(), fetchCostAgentCompanies()])
      .then(([v, vd, p, i, c]) => { setVessels(v); setVendors(vd); setPorts(p); setItems(i); setCompanies(c) })
      .catch(e => ctx.toast(e.message || String(e), 'err'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const vesselOpts: ComboOption[] = useMemo(() => vessels.map(v => ({ value: v.id, label: v.name })), [vessels])
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name })), [vendors])
  const portOpts: ComboOption[] = useMemo(() => ports.map(p => ({ value: p.id, label: `${p.code} · ${p.name}`, keywords: (p.aliases || []).join(' ') })), [ports])
  const itemOpts: ComboOption[] = useMemo(() => items.map(i => ({ value: i.id, label: `${i.code} · ${i.name}`, keywords: (i.keywords || []).join(' ') })), [items])

  const filterKey = [q, vesselId, vendorId, portId, itemId, company, active, source, from, to, dMin, dMax].join('|')
  useEffect(() => { setPage(1) }, [filterKey])
  const minN = dMin.trim() ? parseQtyInput(dMin) : null, maxN = dMax.trim() ? parseQtyInput(dMax) : null
  const { data, loading, error, reload } = useAsync(() => hubBrowseHistory({
    q, vessel_id: vesselId, vendor_id: vendorId, port_id: portId, cost_item_id: itemId, company_code: company,
    active: active === '' ? '' : active === 'true', source, from, to, min_amount: minN, max_amount: maxN, limit: HUB_PAGE_SIZE, offset: (page - 1) * HUB_PAGE_SIZE,
  }), [filterKey, page])
  const rows = data?.rows || []
  useEffect(() => { selection.clear() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data])

  const ids = rows.map(r => r.id)
  const allOn = ids.length > 0 && ids.every(id => selection.has(id))
  const selIds = [...selection.sel]

  const openDialog = (d: 'deactivate' | 'activate') => { setDialog(d); setReason(''); setDialogError(null) }
  const run = async () => {
    if (dialog === 'deactivate' && reason.trim().length < MIN_REASON) { setDialogError(`Enter a reason (at least ${MIN_REASON} characters).`); return }
    setBusy(true); setDialogError(null)
    try {
      const r = await hubSetHistoryActive(selIds, dialog === 'activate', dialog === 'deactivate' ? reason.trim() : null)
      ctx.toast(`${r.updated} rows updated, ${r.invoices_recompared} open invoices compared again`)
      setDialog(null); selection.clear(); setLogKey(k => k + 1); reload()
    } catch (e: any) { setDialogError(e instanceof HubRpcError ? e.message : e.message || String(e)) } finally { setBusy(false) }
  }

  // Filter tambahan yang menyimpang dari bawaan (status bawaan = Active) -> badge di tombol "More filters".
  const moreCount = [company, source, from, to, minAmt, maxAmt].filter(v => v !== '').length + (active !== 'true' ? 1 : 0)
  const reset = () => {
    setSearch(''); setVesselId(null); setVendorId(null); setPortId(null); setItemId(null); setCompany(''); setActive('true'); setSource(''); setFrom(''); setTo(''); setMinAmt(''); setMaxAmt('')
  }
  const COLS = 10 + (ctx.editable ? 1 : 0)

  return (
    <div className="space-y-3" data-hub-history>
      <HubFilterBar>
        <div className={FILTER_SEARCH}><FilterSearch value={search} onChange={setSearch} placeholder="Description / invoice no / voyage…" /></div>
        <CostAgentCombobox className="w-[170px]" options={vesselOpts} value={vesselId} onChange={v => setVesselId(v === null ? null : Number(v))} placeholder="Vessel" />
        <CostAgentCombobox className="w-[170px]" options={vendorOpts} value={vendorId} onChange={v => setVendorId(v === null ? null : Number(v))} placeholder="Vendor" />
        <CostAgentCombobox className="w-[160px]" options={portOpts} value={portId} onChange={v => setPortId(v === null ? null : Number(v))} placeholder="Port" />
        <CostAgentCombobox className="w-[190px]" options={itemOpts} value={itemId} onChange={v => setItemId(v === null ? null : Number(v))} placeholder="Cost item" />
        <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} data-more-filters
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors ${more || moreCount > 0 ? 'border-[#6B3470]/40 bg-[#F5EDF3] text-[#5A305A]' : 'border-[#EADFD6] bg-white text-[#3B1B3D] hover:bg-[#FBF7F4]'}`}>
          <SlidersHorizontal size={13} /> More filters
          {moreCount > 0 && <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-[#6B3470] text-white text-[10.5px] font-bold tabular-nums">{moreCount}</span>}
        </button>
        <ResetButton onClick={reset} />
        <HubToolbarEnd count={data ? `${fmtNumber(data.total, 0)} rows · IDR ${fmtNumber(data.total_amount, 0)}` : ''} viewOnly={!ctx.editable} />
        {more && (
          <div className="basis-full flex flex-wrap items-center gap-2 pt-2 mt-0.5 border-t border-[#F3EEEA]" data-more-filters-row>
            <select aria-label="Company" className={FILTER_CTRL} value={company} onChange={e => setCompany(e.target.value)}>
              <option value="">All PT</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <select aria-label="Status" className={FILTER_CTRL} value={active} onChange={e => setActive(e.target.value as 'true' | 'false' | '')}>
              <option value="true">Active</option><option value="false">Inactive</option><option value="">All status</option>
            </select>
            <select aria-label="Source" className={FILTER_CTRL} value={source} onChange={e => setSource(e.target.value)}>
              <option value="">All sources</option>{(data?.sources || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">From<input type="date" aria-label="From date" className={FILTER_CTRL} value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">To<input type="date" aria-label="To date" className={FILTER_CTRL} value={to} onChange={e => setTo(e.target.value)} /></label>
            <input aria-label="Min amount" inputMode="decimal" className={`${FILTER_CTRL} w-[120px] text-right`} placeholder="Min amount" value={minAmt} onChange={e => setMinAmt(e.target.value)} />
            <input aria-label="Max amount" inputMode="decimal" className={`${FILTER_CTRL} w-[120px] text-right`} placeholder="Max amount" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} />
          </div>
        )}
      </HubFilterBar>



      {ctx.editable && (
        <BulkBar count={selIds.length} onClear={selection.clear}>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => openDialog('deactivate')}>Deactivate selected</button>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => openDialog('activate')}>Activate selected</button>
        </BulkBar>
      )}

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              {ctx.editable && <th className={`${TH} w-8`}><input type="checkbox" aria-label="Select all on this page" className="accent-[#6B3470]" checked={allOn} onChange={e => selection.setAll(ids, e.target.checked)} disabled={ids.length === 0} /></th>}
              {['Date', 'Invoice / voyage', 'Vessel / port', 'Vendor', 'Cost item', 'Description', 'Qty', 'Unit price', 'Amount', 'Status'].map((h, i) =>
                <th key={h} className={`${TH} ${i >= 6 && i <= 8 ? 'text-right' : ''} ${i === 6 ? HIDE_LG : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={COLS} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No history rows match the filter" />
            {!loading && !error && rows.map((r: HubHistoryRow) => (
              <tr key={r.id} className={`border-t border-[#F3EEEA] ${r.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-history-row={r.id}>
                {ctx.editable && <td className={TD}><input type="checkbox" aria-label={`Select row ${r.id}`} className="accent-[#6B3470]" checked={selection.has(r.id)} onChange={() => selection.toggle(r.id)} /></td>}
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDate(r.service_date || r.invoice_date)}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <div className="font-semibold">{r.invoice_no || '—'}</div>
                  {r.voyage_no && <div className="text-[11px] text-[#6E5E70]">Voy {r.voyage_no}</div>}
                </td>
                <td className={TD}>
                  <div>{r.vessel_name || '—'}</div>
                  {r.port_code && <div className="text-[11px] text-[#6E5E70]" title={r.port_name || ''}>{r.port_code}</div>}
                </td>
                <td className={TD}>{r.vendor_name || '—'}</td>
                <td className={`${TD} whitespace-nowrap`} title={r.cost_item_name || ''}>{r.cost_item_code ? <span className="font-mono text-[11.5px]">{r.cost_item_code}</span> : <span className="text-[#8A7A8B]">—</span>}</td>
                <td className={`${TD} min-w-[180px] max-w-[320px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]" title={r.description_raw || ''}>{r.description_raw || '—'}</span></td>
                <td className={`${TD} text-right tabular-nums ${HIDE_LG}`}>{fmtNumber(r.qty, 2)}</td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmtMoney(r.unit_price)}</td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold`}>{fmtMoney(r.amount)}</td>
                <td className={TD}>
                  <ActiveStatus active={r.is_active} />
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[#6E5E70]">
                    {r.source && <span>{r.source}</span>}
                    {r.used_by_lines > 0 && <span className="font-semibold text-[#2F4FA8]" title="Invoice lines that use this row as reference">Used by {r.used_by_lines}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={data?.total ?? 0} page={page} onPage={setPage} loading={loading} />
      </TableCard>

      <RecentChanges entities={['history']} reloadKey={logKey} />

      {dialog === 'deactivate' && (
        <ConfirmModal title="Deactivate history rows" confirmLabel="Deactivate" danger busy={busy} error={dialogError} onClose={() => setDialog(null)} onConfirm={run} disabled={reason.trim().length < MIN_REASON}>
          <p>Deactivated rows are ignored by cost comparison. Open invoices that used them are compared again. Nothing is deleted.</p>
          <p className="text-[12px] text-[#6E5E70]">{selIds.length} rows selected.</p>
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">Reason <span className="text-[#A8231A]">*</span> <span className="normal-case tracking-normal font-normal">(min {MIN_REASON} characters)</span></label>
            <textarea className={`${SA_INPUT} h-20 py-2`} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Wrong amount typed in the source invoice" />
          </div>
        </ConfirmModal>
      )}
      {dialog === 'activate' && (
        <ConfirmModal title="Activate history rows" confirmLabel="Activate" busy={busy} error={dialogError} onClose={() => setDialog(null)} onConfirm={run}>
          <p>The selected rows are used by cost comparison again. Open invoices that may use them are compared again.</p>
          <p className="text-[12px] text-[#6E5E70]">{selIds.length} rows selected.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
