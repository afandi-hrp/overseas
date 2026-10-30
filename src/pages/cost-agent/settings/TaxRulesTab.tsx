// Tab "Tax rules" hub Cost Agent Settings (2026-10-28, sql/084) -- aturan PPN (per jenis biaya, boleh per vendor) & PPh (per vendor, boleh dibatasi per
// jenis biaya). Kosong pada Cost item / Vendor / Company = berlaku untuk semua. Tarif ditampilkan PERSEN (11%) dan dikirim PECAHAN (0.11).
// Aturan disalin ke baris invoice saat invoice diverifikasi; mengubah aturan TIDAK mengubah invoice lama.
import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CostAgentCombobox, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { ConfirmModal, ErrorBox, Field, HubDrawer, HubFilterBar, HubToolbarEnd, ICON_BTN, ICON_BTN_DANGER, StateRow, TD, TH, TableCard, useAsync, type HubCtx } from './hubUi'
import { hubListCompanies, hubListCostItems, hubListVendors } from './hubApi'
import { fetchCostAgentPorts } from '../../../utils/CostAgentHelpers'
import { ALL_PORTS_LABEL, taxPortLabel } from '../../../utils/CostAgentAccountMapLogic'
import { fracToPct, pctToFrac, taxDeleteRule, taxListRules, taxSaveRule, type TaxRule } from './financeApi'

interface Form {
  cost_item_id: number | null; vendor_id: number | null; port_id: number | null; company_code: string
  ppn: '' | 'yes' | 'no'; ppn_pct: string; pph_type: string; pph_pct: string
  effective_from: string; is_active: boolean; note: string
}
const EMPTY: Form = { cost_item_id: null, vendor_id: null, port_id: null, company_code: '', ppn: '', ppn_pct: '', pph_type: '', pph_pct: '', effective_from: '', is_active: true, note: '' }

const toForm = (r: TaxRule): Form => ({
  cost_item_id: r.cost_item_id, vendor_id: r.vendor_id, port_id: r.port_id ?? null, company_code: r.company_code || '',
  ppn: r.ppn_applicable === null ? '' : r.ppn_applicable ? 'yes' : 'no', ppn_pct: r.ppn_applicable ? fracToPct(r.ppn_rate) : '',
  pph_type: r.pph_type || '', pph_pct: fracToPct(r.pph_rate),
  effective_from: r.effective_from && r.effective_from > '2000-01-01' ? r.effective_from : '', is_active: r.is_active, note: r.note || '',
})

const All = () => <span className="text-[#8A7A8B] italic">All</span>

export default function TaxRulesTab({ ctx }: { ctx: HubCtx }) {
  const rules = useAsync(taxListRules, [])
  const costItems = useAsync(() => hubListCostItems({ active: true, limit: 500, offset: 0 }), [])
  const vendors = useAsync(() => hubListVendors({ active: true, limit: 500, offset: 0 }), [])
  const companies = useAsync(() => hubListCompanies().then(r => r.rows.filter(c => c.is_active)), [])
  const ports = useAsync(() => fetchCostAgentPorts(), [])
  const [drawer, setDrawer] = useState<{ id: number | null; init: Form } | null>(null)
  const [delFor, setDelFor] = useState<TaxRule | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delErr, setDelErr] = useState<string | null>(null)

  const itemOpts: ComboOption[] = useMemo(() => (costItems.data?.rows ?? []).map(i => ({ value: i.id, label: i.name, sub: i.code })), [costItems.data])
  const vendorOpts: ComboOption[] = useMemo(() => (vendors.data?.rows ?? []).map(v => ({ value: v.id, label: v.name, sub: v.npwp || undefined })), [vendors.data])
  const portOpts: ComboOption[] = useMemo(() => (ports.data ?? []).map(p => ({ value: p.id, label: p.name, sub: p.code })), [ports.data])
  const list = rules.data ?? []

  const runDelete = async () => {
    if (!delFor) return
    setDelBusy(true); setDelErr(null)
    try { await taxDeleteRule(delFor.id); ctx.toast('Tax rule deleted.'); setDelFor(null); rules.reload() }
    catch (e: any) { setDelErr(e?.message || String(e)); ctx.toast(e?.message || String(e), 'err') } finally { setDelBusy(false) }
  }

  return (
    <div className="space-y-3" data-tax-rules>
      <HubFilterBar>
        <p className="text-[12px] text-[#6E5E70] min-w-0 flex-1">Rules are copied to invoice lines when an invoice is verified; changing a rule does not change old invoices.</p>
        <HubToolbarEnd count={rules.data ? `${list.length} rules` : ''} viewOnly={!ctx.editable}>
          {ctx.editable && <button type="button" className={SA_BTN_PRIMARY} onClick={() => setDrawer({ id: null, init: EMPTY })}><Plus size={13} /> Add rule</button>}
        </HubToolbarEnd>
      </HubFilterBar>

      <TableCard>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={TH}>Cost item</th><th className={TH}>Vendor</th><th className={TH}>Port</th><th className={TH}>Company</th><th className={TH}>PPN</th><th className={TH}>PPh</th>
              <th className={TH}>Effective from</th><th className={TH}>Active</th><th className={TH}>Note</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            <StateRow colSpan={10} loading={rules.loading} error={rules.error} onRetry={rules.reload} empty={list.length === 0} emptyText="No tax rules yet" />
            {!rules.loading && !rules.error && list.map(r => (
              <tr key={r.id} className={`border-t border-[#F3EEEA] ${r.is_active ? '' : 'opacity-60 bg-[#FAF8F7]'}`} data-tax-rule={r.id}>
                <td className={TD}>{r.cost_item_name || <All />}</td>
                <td className={TD}>{r.vendor_name || <All />}</td>
                <td className={TD} data-tax-port>{r.port_name ? taxPortLabel(r) : <span className="text-[#8A7A8B] italic">{ALL_PORTS_LABEL}</span>}</td>
                <td className={`${TD} font-mono font-bold`}>{r.company_code || <All />}</td>
                <td className={`${TD} whitespace-nowrap`}>{r.ppn_applicable === null ? <span className="text-[#8A7A8B]">—</span> : r.ppn_applicable ? <Chip tone="green">Yes · {fracToPct(r.ppn_rate)}%</Chip> : <Chip tone="grey">No</Chip>}</td>
                <td className={`${TD} whitespace-nowrap`}>{r.pph_rate === null ? <span className="text-[#8A7A8B]">—</span> : <Chip tone="blue">{r.pph_type} · {fracToPct(r.pph_rate)}%</Chip>}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.effective_from && r.effective_from > '2000-01-01' ? r.effective_from : <span className="text-[#8A7A8B]">always</span>}</td>
                <td className={TD}>{r.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="grey">Inactive</Chip>}</td>
                <td className={`${TD} max-w-[240px] truncate`} title={r.note || undefined}>{r.note || <span className="text-[#8A7A8B]">—</span>}</td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  {ctx.editable && <button type="button" className={ICON_BTN} aria-label="Edit rule" title="Edit" onClick={() => setDrawer({ id: r.id, init: toForm(r) })}><Pencil size={12} /></button>}
                  {ctx.editable && <button type="button" className={ICON_BTN_DANGER} aria-label="Delete rule" title="Delete" onClick={() => { setDelErr(null); setDelFor(r) }}><Trash2 size={12} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {drawer && <RuleDrawer id={drawer.id} init={drawer.init} itemOpts={itemOpts} vendorOpts={vendorOpts} portOpts={portOpts} companies={(companies.data ?? []).map(c => c.code)}
        onClose={() => setDrawer(null)} onSaved={() => { ctx.toast(drawer.id ? 'Tax rule saved.' : 'Tax rule added.'); setDrawer(null); rules.reload() }} />}
      {delFor && (
        <ConfirmModal title="Delete tax rule" danger confirmLabel="Delete" busy={delBusy} error={delErr} onConfirm={runDelete} onClose={() => setDelFor(null)}>
          <p>Delete this rule ({delFor.cost_item_name || 'all cost items'} · {delFor.vendor_name || 'all vendors'} · {taxPortLabel(delFor).toLowerCase()} · {delFor.company_code || 'all companies'})? Existing invoices keep the tax already copied to their lines.</p>
        </ConfirmModal>
      )}
    </div>
  )
}

function RuleDrawer({ id, init, itemOpts, vendorOpts, portOpts, companies, onClose, onSaved }: {
  id: number | null; init: Form; itemOpts: ComboOption[]; vendorOpts: ComboOption[]; portOpts: ComboOption[]; companies: string[]; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Form>(init)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(s => ({ ...s, [k]: v }))

  const save = async () => {
    const ppnFrac = pctToFrac(f.ppn_pct); const pphFrac = pctToFrac(f.pph_pct)
    if (Number.isNaN(ppnFrac) || Number.isNaN(pphFrac) || (ppnFrac ?? 0) < 0 || (ppnFrac ?? 0) > 1 || (pphFrac ?? 0) < 0 || (pphFrac ?? 0) > 1) { setError('Rates must be percentages between 0 and 100.'); return }
    if (f.ppn === '' && pphFrac === null) { setError('Fill PPN (yes/no) or a PPh rate.'); return }
    if (pphFrac !== null && !f.pph_type.trim()) { setError('PPh type is required (for example PPH23).'); return }
    setBusy(true); setError(null)
    try {
      await taxSaveRule(id, {
        cost_item_id: f.cost_item_id, vendor_id: f.vendor_id, port_id: f.port_id, company_code: f.company_code || null,
        ppn_applicable: f.ppn === '' ? null : f.ppn === 'yes', ppn_rate: f.ppn === 'yes' ? ppnFrac : null,
        pph_type: pphFrac === null ? null : f.pph_type.trim().toUpperCase(), pph_rate: pphFrac,
        effective_from: f.effective_from || null, is_active: f.is_active, note: f.note.trim() || null,
      })
      onSaved()
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <HubDrawer title={id ? 'Edit tax rule' : 'Add tax rule'} subtitle="Leave a field empty to apply the rule to all." onClose={onClose} busy={busy}
      footer={<><button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      {error && <ErrorBox message={error} />}
      <Field label="Cost item" helper="Leave empty to apply to all cost items"><CostAgentCombobox options={itemOpts} value={f.cost_item_id} onChange={v => set('cost_item_id', v === null ? null : Number(v))} placeholder="All cost items" /></Field>
      <Field label="Vendor" helper="Leave Vendor empty to apply to all vendors"><CostAgentCombobox options={vendorOpts} value={f.vendor_id} onChange={v => set('vendor_id', v === null ? null : Number(v))} placeholder="All vendors" /></Field>
      <Field label="Port" helper="Leave empty to apply to all ports. The most specific rule wins (vendor + cost item + port); the server chooses."><CostAgentCombobox options={portOpts} value={f.port_id} onChange={v => set('port_id', v === null ? null : Number(v))} placeholder="All ports" /></Field>
      <Field label="Company">
        <select className={SA_INPUT} value={f.company_code} onChange={e => set('company_code', e.target.value)}>
          <option value="">All companies</option>{companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="PPN" helper="Empty = this rule does not decide PPN">
          <select className={SA_INPUT} value={f.ppn} onChange={e => set('ppn', e.target.value as Form['ppn'])}>
            <option value="">Not set</option><option value="yes">Applicable</option><option value="no">Not applicable</option>
          </select>
        </Field>
        <Field label="PPN rate (%)" helper="Empty = default (11%)"><input className={SA_INPUT} inputMode="decimal" value={f.ppn_pct} disabled={f.ppn !== 'yes'} placeholder="11" onChange={e => set('ppn_pct', e.target.value)} /></Field>
        <Field label="PPh type" helper="For example PPH23"><input className={SA_INPUT} value={f.pph_type} maxLength={20} placeholder="PPH23" onChange={e => set('pph_type', e.target.value)} /></Field>
        <Field label="PPh rate (%)"><input className={SA_INPUT} inputMode="decimal" value={f.pph_pct} placeholder="2" onChange={e => set('pph_pct', e.target.value)} /></Field>
      </div>
      <Field label="Effective from" helper="Empty = always in effect"><input type="date" className={SA_INPUT} value={f.effective_from} onChange={e => set('effective_from', e.target.value)} /></Field>
      <Field label="Note"><input className={SA_INPUT} value={f.note} maxLength={300} onChange={e => set('note', e.target.value)} /></Field>
      <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#3B1B3D]"><input type="checkbox" className="accent-[#6B3470]" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> Active</label>
    </HubDrawer>
  )
}
