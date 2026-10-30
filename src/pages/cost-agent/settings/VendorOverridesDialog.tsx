// Dialog "Vendor overrides" (tab Vendors, SQL 111, 2026-10-30): jenis biaya yang akun (AccountCode) / nama AP Note-nya KHUSUS untuk satu vendor
// (mis. Materai Pelindo I = 61050). Di pratinjau AP Note override ini menang atas akun hasil pemetaan PT dan akun standar jenis biaya.
// Baca langsung dari tabel cost_agent_vendor_item_overrides (RLS); simpan / hapus lewat RPC. Validasi UI: utils/CostAgentAccountMapLogic.ts (minimal satu dari kedua field).
import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CostAgentCombobox, CostAgentModal, type ComboOption } from '../../../components/CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentCostItems, type CostAgentCostItem } from '../../../utils/CostAgentHelpers'
import { OVERRIDE_DESC_MAX, OVERRIDE_GL_MAX, overrideFormError, overrideToForm, type OverrideForm, type VendorOverride } from '../../../utils/CostAgentAccountMapLogic'
import { deleteVendorOverride, listVendorOverrides, saveVendorOverride } from './accountMapApi'
import { ConfirmModal, ErrorBox, Field, ICON_BTN, ICON_BTN_DANGER, StateRow, TD, TH, useAsync, type HubCtx } from './hubUi'

const EMPTY: OverrideForm = { cost_item_id: null, gl_account: '', ap_description: '', note: '' }

export default function VendorOverridesDialog({ vendor, editable, toast, onClose }: {
  vendor: { id: number; name: string }; editable: boolean; toast: HubCtx['toast']; onClose: () => void
}) {
  const list = useAsync(() => listVendorOverrides(vendor.id), [vendor.id])
  const [items, setItems] = useState<CostAgentCostItem[]>([])
  useEffect(() => { fetchCostAgentCostItems().then(setItems).catch(() => setItems([])) }, [])
  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const opts: ComboOption[] = useMemo(() => items.filter(i => i.is_active !== false).map(i => ({ value: i.id, label: i.name, sub: i.code })), [items])

  const [form, setForm] = useState<{ editing: boolean; f: OverrideForm } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delFor, setDelFor] = useState<VendorOverride | null>(null)
  const [delErr, setDelErr] = useState<string | null>(null)
  const rows = list.data ?? []
  const set = <K extends keyof OverrideForm>(k: K, v: OverrideForm[K]) => setForm(s => (s ? { ...s, f: { ...s.f, [k]: v } } : s))

  const save = async () => {
    if (!form) return
    const err = overrideFormError(form.f)
    if (err) { setError(err); return }
    setBusy(true); setError(null)
    try { await saveVendorOverride(vendor.id, form.f); toast('Vendor override saved.'); setForm(null); list.reload() }
    catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!delFor) return
    setBusy(true); setDelErr(null)
    try { await deleteVendorOverride(vendor.id, delFor.cost_item_id); toast('Vendor override deleted.'); setDelFor(null); list.reload() }
    catch (e: any) { setDelErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <CostAgentModal maxWidth="max-w-4xl" z="z-[80]" title={`Vendor overrides — ${vendor.name}`}
      subtitle="Account code or AP Note description that applies to this vendor only. It wins over the company mapping and the cost item's default account."
      onClose={() => { if (!busy) onClose() }} footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Close</button>}>
      <div className="p-5 space-y-3" data-vendor-overrides>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-[#6E5E70] tabular-nums">{list.data ? `${rows.length} override${rows.length === 1 ? '' : 's'}` : ''}</span>
          {editable && !form && <button type="button" className={SA_BTN_PRIMARY} onClick={() => { setError(null); setForm({ editing: false, f: EMPTY }) }}><Plus size={13} /> Add override</button>}
        </div>

        {form && (
          <div className="rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-3 space-y-3" data-override-form>
            {error && <ErrorBox message={error} />}
            <Field label="Cost item" required>
              <CostAgentCombobox options={opts} value={form.f.cost_item_id} onChange={v => set('cost_item_id', v === null ? null : Number(v))} placeholder="Search cost item…" allowClear={false} disabled={form.editing} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Account code" helper="Ascend AccountCode, for example 61050">
                <input className={SA_INPUT} value={form.f.gl_account} maxLength={OVERRIDE_GL_MAX} onChange={e => set('gl_account', e.target.value)} />
              </Field>
              <Field label="AP Note description" hint={`${form.f.ap_description.trim().length}/${OVERRIDE_DESC_MAX}`} helper="Saved in capital letters">
                <input className={`${SA_INPUT} uppercase`} value={form.f.ap_description} maxLength={OVERRIDE_DESC_MAX} onChange={e => set('ap_description', e.target.value)} />
              </Field>
            </div>
            <Field label="Note"><input className={SA_INPUT} value={form.f.note} maxLength={300} onChange={e => set('note', e.target.value)} /></Field>
            <p className="text-[11.5px] text-[#6E5E70]">Fill at least one of Account code or AP Note description.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save override'}</button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[#EADFD6] overflow-x-auto max-h-[45vh] overflow-y-auto">
          <table className="min-w-full">
            <thead><tr>{['Cost item', 'Account code', 'AP Note description', 'Note', ''].map(h => <th key={h || 'a'} className={`${TH} sticky top-0`}>{h}</th>)}</tr></thead>
            <tbody>
              <StateRow colSpan={5} loading={list.loading} error={list.error} onRetry={list.reload} empty={rows.length === 0} emptyText="No overrides for this vendor" />
              {!list.loading && !list.error && rows.map(o => {
                const ci = byId.get(o.cost_item_id)
                return (
                  <tr key={o.id} className="border-t border-[#F3EEEA]" data-override-row={o.cost_item_id}>
                    <td className={TD}><div className="font-semibold">{ci?.name ?? `Cost item #${o.cost_item_id}`}</div>{ci && <div className="text-[11px] text-[#6E5E70]">{ci.code}</div>}</td>
                    <td className={`${TD} font-mono whitespace-nowrap`}>{o.gl_account || <span className="text-[#8A7A8B]">—</span>}</td>
                    <td className={TD}>{o.ap_description || <span className="text-[#8A7A8B]">—</span>}</td>
                    <td className={`${TD} max-w-[220px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]">{o.note || <span className="text-[#8A7A8B]">—</span>}</span></td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {editable && <button type="button" className={ICON_BTN} aria-label="Edit override" title="Edit" onClick={() => { setError(null); setForm({ editing: true, f: overrideToForm(o) }) }}><Pencil size={12} /></button>}
                      {editable && <button type="button" className={ICON_BTN_DANGER} aria-label="Delete override" title="Delete" onClick={() => { setDelErr(null); setDelFor(o) }}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {delFor && (
        <ConfirmModal title="Delete override" danger confirmLabel="Delete" busy={busy} error={delErr} onConfirm={remove} onClose={() => setDelFor(null)}>
          <p>Delete the override of <b>{byId.get(delFor.cost_item_id)?.name ?? `cost item #${delFor.cost_item_id}`}</b> for <b>{vendor.name}</b>? AP Notes then use the company mapping or the cost item's default account.</p>
        </ConfirmModal>
      )}
    </CostAgentModal>
  )
}
