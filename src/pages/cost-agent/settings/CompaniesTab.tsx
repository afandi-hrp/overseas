// Tab "Companies" hub Cost Agent Settings (2026-10-26, sql/079) -- master PT (6 PT): fn_cost_agent_list_companies / save_company(p_code, p_data).
// Kode PT tetap (tidak bisa diubah); TIDAK ada merge / hapus -- PT hanya dinonaktifkan. Ubah hanya bila ctx.editable.
import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fmtNumber } from '../../../utils/CostAgentHelpers'
import { hubListCompanies, hubSaveCompany, npwpError, type HubCompany } from './hubApi'
import { errBox, Field, HubDrawer, HubFilterBar, RecentChanges, StateRow, TD, TH, TableCard, useAsync, type HubCtx } from './hubUi'
import { ActiveStatus, HubToolbarEnd, ICON_BTN, UsedBy } from './hubUi'

interface Form { code: string; name: string; npwp: string; is_active: boolean }

export default function CompaniesTab({ ctx }: { ctx: HubCtx }) {
  const { data, loading, error, reload } = useAsync(() => hubListCompanies(), [])
  const rows = data?.rows || []
  const [logKey, setLogKey] = useState(0)
  const [drawer, setDrawer] = useState<{ isNew: boolean; init: Form } | null>(null)

  return (
    <div className="space-y-3" data-hub-companies>
      <HubFilterBar>
        <HubToolbarEnd count={rows.length ? `${fmtNumber(rows.length, 0)} companies` : ''} viewOnly={!ctx.editable}>
          {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => setDrawer({ isNew: true, init: { code: '', name: '', npwp: '', is_active: true } })}><Plus size={13} /> Add company</button>}
        </HubToolbarEnd>
      </HubFilterBar>

      <TableCard>
        <table className="min-w-full">
          <thead><tr>{['Code', 'Name', 'NPWP', 'Active', 'Used by', ''].map(h => <th key={h || 'actions'} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            <StateRow colSpan={6} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No companies yet" />
            {!loading && !error && rows.map((c: HubCompany) => (
              <tr key={c.code} className={`border-t border-[#F3EEEA] ${c.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-company-row={c.code}>
                <td className={`${TD} font-mono text-[12px] font-bold`}>{c.code}</td>
                <td className={`${TD} font-semibold min-w-[200px]`}>{c.name || '—'}</td>
                <td className={`${TD} tabular-nums whitespace-nowrap`}>{c.npwp ? c.npwp : <Chip tone="amber">No NPWP</Chip>}</td>
                <td className={TD}><ActiveStatus active={c.is_active} /></td>
                <td className={`${TD} min-w-[150px]`}><UsedBy items={[{ n: c.vessels_count, label: 'vessels' }, { n: c.invoices_count, label: 'invoices' }, { n: c.rules_count, label: 'approval rules', short: 'rules' }]} /></td>
                <td className={`${TD} whitespace-nowrap`}>
                  {ctx.editable && <button type="button" className={ICON_BTN} title="Edit" aria-label={`Edit ${c.code}`}
                    onClick={() => setDrawer({ isNew: false, init: { code: c.code, name: c.name || '', npwp: c.npwp || '', is_active: c.is_active } })}><Pencil size={12} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <RecentChanges entities={['company']} reloadKey={logKey} />

      {drawer && <CompanyDrawer isNew={drawer.isNew} init={drawer.init} onClose={() => setDrawer(null)}
        onSaved={() => { setDrawer(null); ctx.toast(drawer.isNew ? 'Company added.' : 'Company saved.'); setLogKey(k => k + 1); reload() }} />}
    </div>
  )
}

function CompanyDrawer({ isNew, init, onClose, onSaved }: { isNew: boolean; init: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const npwpErr = npwpError(f.npwp)
  const save = async () => {
    if (!/^[A-Z0-9]{2,6}$/.test(f.code)) return setError('Company code must be 2-6 letters or digits.')
    if (!f.name.trim()) return setError('Company name is required.')
    if (npwpErr) return setError(npwpErr)
    setBusy(true); setError(null)
    try { await hubSaveCompany(f.code, { name: f.name.trim(), npwp: f.npwp.trim() || null, is_active: f.is_active }); onSaved() }
    catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <HubDrawer title={isNew ? 'Add company' : 'Edit company'} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save company'}</button>
      </>}>
      {error && <div className={errBox} role="alert">{error}</div>}
      <Field label="Code" required={isNew} helper={isNew ? '2-6 letters or digits. The code cannot be changed later.' : 'The code of a company cannot be changed'}>
        <input className={`${SA_INPUT} font-mono uppercase`} value={f.code} readOnly={!isNew} disabled={!isNew} maxLength={6} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      </Field>
      <Field label="Name" required><input className={SA_INPUT} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="NPWP" hint="15 or 16 digits" helper="Used to check the buyer on tax invoices">
        <input className={`${SA_INPUT} tabular-nums ${npwpErr ? 'border-[#A8231A]' : ''}`} value={f.npwp} onChange={e => set('npwp', e.target.value)} />
        {npwpErr && <p className="mt-1 text-[11px] text-[#A8231A]">{npwpErr}</p>}
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="w-4 h-4 accent-[#17663D]" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
      <p className="text-[11.5px] text-[#6E5E70]">Companies cannot be merged or deleted — deactivate a company instead.</p>
    </HubDrawer>
  )
}
