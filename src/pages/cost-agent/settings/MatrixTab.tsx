// Tab "Approval Matrix" hub Cost Agent Settings -- ISI HALAMAN LAMA (/cost-agent/approval-matrix, Prompt 4 2026-10-13) dipindah apa adanya ke sini,
// dengan SATU tambahan (2026-10-26, sql/079): kolom/field OFFICE (Medan / Jakarta; kosong = berlaku utk semua office). CRUD langsung tabel
// cost_agent_approval_matrix (RLS: baca has_page_access, tulis has_edit_access('cost_agent_approval_matrix')); edit hanya bila ctx.editable.
// Aturan paling spesifik per step menang (dihitung SERVER, jangan diimplementasi ulang): vendor > office > PT > umum. Aturan khusus office yg
// aktif + kapal invoice belum punya office => pengajuan approval ditolak server.
// Approval Matrix v2 (2026-10-28, sql/090): aturan dikelompokkan per (PT, office, vendor, rentang) dgn langkah berurutan + tombol naik/turun (fn_cost_agent_reorder_matrix),
// field "Level name" (approver_label) & "Mode" (any / all -- kolom approval_mode), kartu Simulate (fn_cost_agent_simulate_matrix) dan kartu Substitutes (delegasi).
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Copy, Trash2, AlertTriangle, FlaskConical, X, EyeOff, ArrowUp, ArrowDown, UserRoundCog } from 'lucide-react'
import { useAuth } from '../../../lib/AuthContext'
import { LoadingState } from '../../../components/LoadingState'
import { CostAgentModal, CostAgentCombobox, FieldLabel, FilterPanel, FilterField, FilterButton, FILTER_SELECT, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, PtBadge, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT, SA_LABEL } from '../../../components/SeaAirAuditUi'
import {
  fetchCostAgentApprovalMatrix, saveCostAgentMatrixRule, deleteCostAgentMatrixRule, fetchCostAgentCompanies, fetchCostAgentVendors,
  fetchAppUserEmails, matrixCoverageGaps, fmtShortAmount, fmtRupiah, fmtDate, parseQtyInput,
  type CostAgentApprovalMatrixRow, type CostAgentCompany, type CostAgentVendor, type CostAgentMatrixInput,
} from '../../../utils/CostAgentHelpers'
import {
  costAgentDeleteDelegation, costAgentListDelegations, costAgentReorderMatrix, costAgentSaveDelegation, costAgentSimulateMatrix,
  type ApprovalRoute, type Delegation,
} from '../../../utils/CostAgentWorkflow'
import { ApprovalRouteView } from '../../../components/CostAgentApprovalRoute'
import { OFFICE_LABEL, OFFICE_OPTIONS } from './hubApi'
import { ErrorBox, OfficeBadge, useAsync, type HubCtx } from './hubUi'
import { ActiveStatus, ICON_BTN, ICON_BTN_DANGER } from './hubUi'

const TH = 'px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-3 py-2 text-[12.5px] text-[#3B1B3D] align-top'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OFFICE_HELP = 'Rules for a specific office win over general rules. Leave Office empty on a rule to apply it to every office.'

export default function MatrixTab({ ctx }: { ctx: HubCtx }) {
  const { user } = useAuth()
  const editable = ctx.editable

  const [rules, setRules] = useState<CostAgentApprovalMatrixRow[]>([])
  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  const [vendors, setVendors] = useState<CostAgentVendor[]>([])
  const [userEmails, setUserEmails] = useState<{ email: string; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [companyFilter, setCompanyFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState<{ id: number | null; init: CostAgentMatrixInput } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchCostAgentApprovalMatrix(), fetchCostAgentCompanies(), fetchCostAgentVendors(), fetchAppUserEmails()])
      .then(([r, c, v, u]) => { if (!cancelled) { setRules(r); setCompanies(c); setVendors(v); setUserEmails(u); setError(null) } })
      .catch(e => { if (!cancelled) setError(e.message || String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  const vendorName = (id: number | null) => (id === null ? 'All vendors' : vendors.find(v => v.id === id)?.name || `Vendor #${id}`)
  const shown = rules.filter(r => (showInactive || r.is_active) && (!companyFilter || r.company_code === companyFilter || r.company_code === null))

  // Kelompok = SATU aturan (PT, office, vendor, rentang nilai) -> langkah berurutan. Nonaktif ikut tampil bila "Show inactive".
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; company: string | null; office: string | null; vendor: number | null; min: number; max: number | null; steps: CostAgentApprovalMatrixRow[] }>()
    shown.forEach(r => {
      const k = `${r.company_code ?? '*'}|${r.office ?? '*'}|${r.vendor_id ?? '*'}|${r.min_amount}|${r.max_amount ?? '∞'}`
      if (!m.has(k)) m.set(k, { key: k, company: r.company_code, office: r.office ?? null, vendor: r.vendor_id, min: Number(r.min_amount), max: r.max_amount === null ? null : Number(r.max_amount), steps: [] })
      m.get(k)!.steps.push(r)
    })
    return [...m.values()].map(l => ({ ...l, steps: l.steps.sort((a, b) => a.step_no - b.step_no || a.id - b.id) }))
      .sort((a, b) => (a.company ?? '').localeCompare(b.company ?? '') || (a.office ?? '').localeCompare(b.office ?? '') || (a.vendor ?? 0) - (b.vendor ?? 0) || a.min - b.min)
  }, [shown])

  // Celah nominal per (PT, Office) (aturan umum tanpa vendor). Aturan TANPA office ikut menutup semua office. Bila belum ada aturan ber-office,
  // cukup cek per PT. (PT, Office) dgn celah SAMA digabung 1 baris (ringkas di laptop 14").
  const hasOfficeRules = rules.some(r => r.is_active && r.office)
  const gaps = useMemo(() => {
    const codes = companyFilter ? [companyFilter] : companies.map(c => c.code)
    const offices: (string | null)[] = hasOfficeRules ? OFFICE_OPTIONS.map(o => o.value) : [null]
    const groups = new Map<string, string[]>()
    codes.forEach(code => offices.forEach(office => {
      const g = matrixCoverageGaps(rules, code, office)
      if (!g.length) return
      const text = g.map(x => `${fmtRupiah(x.from)} – ${x.to === null ? 'no limit' : fmtRupiah(x.to)}`).join(', ')
      groups.set(text, [...(groups.get(text) || []), office ? `${code} · ${OFFICE_LABEL[office]}` : code])
    }))
    return [...groups.entries()].map(([text, codes]) => ({ text, codes }))
  }, [rules, companies, companyFilter, hasOfficeRules])
  const noActiveRule = !rules.some(r => r.is_active)

  // Naik / turun satu langkah: kirim urutan id baru dari SATU aturan -> step_no 1..n dihitung database.
  const move = async (g: { steps: CostAgentApprovalMatrixRow[] }, idx: number, dir: -1 | 1) => {
    const ids = g.steps.map(x => x.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    try { await costAgentReorderMatrix(ids); ctx.toast('Order saved.'); setReloadKey(k => k + 1) } catch (e: any) { ctx.toast(e.message || String(e), 'err') }
  }

  const remove = async (r: CostAgentApprovalMatrixRow) => {
    if (!window.confirm(`Delete rule "${r.name}" (step ${r.step_no})?`)) return
    try { await deleteCostAgentMatrixRule(r.id); ctx.toast('Rule deleted.'); setReloadKey(k => k + 1) } catch (e: any) { ctx.toast(e.message || String(e), 'err') }
  }
  const blank = (): CostAgentMatrixInput => ({
    name: '', company_code: companyFilter || null, vendor_id: null, office: null, min_amount: 0, max_amount: null, step_no: 1,
    approver_label: '', approver_emails: [], approver_role: null, approval_mode: 'any', is_active: true, created_by: user?.email ?? null,
  })
  const toInput = (r: CostAgentApprovalMatrixRow): CostAgentMatrixInput => ({
    name: r.name, company_code: r.company_code, vendor_id: r.vendor_id, office: r.office ?? null, min_amount: Number(r.min_amount), max_amount: r.max_amount === null ? null : Number(r.max_amount),
    step_no: r.step_no, approver_label: r.approver_label, approver_emails: r.approver_emails || [], approver_role: r.approver_role, approval_mode: r.approval_mode ?? 'any', is_active: r.is_active, created_by: r.created_by ?? null,
  })

  return (
    <div className="space-y-3">
      {/* Filter 1 baris (FilterPanel); Add rule di ujung kanan panel. */}
      <FilterPanel>
        <FilterField label="Company">
          <select aria-label="Company" className={FILTER_SELECT} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="">All PT</option>
            {companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </FilterField>
        <FilterButton icon={EyeOff} label="Show inactive" short="Inactive" active={showInactive} onClick={() => setShowInactive(v => !v)} />
        <span className="flex-1 min-w-0 truncate text-[12px] text-[#6E5E70]">
          {rules.length} rule{rules.length === 1 ? '' : 's'}{!editable ? ' · View only — no edit access to the approval matrix' : ''}
        </span>
        {editable && <FilterButton icon={Plus} label="Add rule" short="Add" variant="primary" onClick={() => setForm({ id: null, init: blank() })} />}
      </FilterPanel>

      {loading ? <LoadingState fullHeight={false} /> : error ? <ErrorBox message={error} onRetry={() => setReloadKey(k => k + 1)} /> : (
        // Kolom Simulate di kanan mulai lebar area 1100px (container query, BUKAN breakpoint layar).
        <div className="@container"><div className="grid grid-cols-1 @min-[1100px]:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
          <div className="space-y-3 min-w-0">
            {noActiveRule ? (
              <div className="rounded-xl border border-[#F2D58A] bg-[#FFF8E6] px-4 py-2.5 text-[12.5px] text-[#7A4F00] flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span><b>No active rule yet</b> — submitting any invoice for approval will fail. Add one rule per step (step 1, step 2, …) for each company / amount range.</span>
              </div>
            ) : gaps.length > 0 && (
              <div className="rounded-xl border border-[#F2D58A] bg-[#FFF8E6] px-4 py-2.5 text-[12.5px] text-[#7A4F00]">
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} /> Amounts not covered by an active rule — submitting such invoices will fail</p>
                <ul className="mt-1 space-y-0.5">
                  {gaps.map(g => <li key={g.text}><b>{g.codes.join(', ')}</b>: {g.text}</li>)}
                </ul>
                <p className="text-[11px] mt-1 opacity-80">Vendor-specific rules are not counted (they only apply to that vendor). Rules without an office also cover every office.</p>
              </div>
            )}

            {groups.length === 0 && <section className={`${SA_CARD} px-4 py-8 text-center text-sm text-[#6E5E70] italic`}>No rules{editable ? ' — click "Add".' : '.'}</section>}
            {groups.map(g => (
              <section key={g.key} className={`${SA_CARD} overflow-hidden @container`} data-rule-group>
                <div className="px-4 py-2.5 border-b border-[#F3EEEA] bg-[#FBF7F4] flex items-center gap-2 flex-wrap text-[12.5px]">
                  {g.company ? <PtBadge code={g.company} /> : <Chip tone="grey">All PT</Chip>}
                  {g.office ? <OfficeBadge office={g.office} /> : <Chip tone="grey">All offices</Chip>}
                  {g.vendor !== null && <Chip tone="purple">{vendorName(g.vendor)}</Chip>}
                  <span className="font-semibold text-[#3B1B3D] tabular-nums">{g.max === null ? (g.min > 0 ? `≥ ${fmtShortAmount(g.min)}` : 'Any amount') : `${fmtShortAmount(g.min)} – ${fmtShortAmount(g.max)}`}</span>
                  <span className="text-[#8A7A8B] text-[11.5px]">{g.steps.length} step{g.steps.length === 1 ? '' : 's'}</span>
                </div>
                <div className="overflow-x-auto [&_tbody_tr:hover]:bg-[#FBF7F4]">
                  <table className="min-w-full">
                    <thead><tr>{['Step', 'Level name', 'Mode', 'Approver emails', 'Active', ''].map(h => <th key={h || 'a'} className={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {g.steps.map((r, idx) => (
                        <tr key={r.id} className={`border-b border-[#F3EEEA] last:border-b-0 ${r.is_active ? '' : 'opacity-50'}`} data-matrix-step={r.id}>
                          <td className={`${TD} text-center font-bold tabular-nums`}>{r.step_no}</td>
                          <td className={`${TD} min-w-[170px]`}><div className="font-semibold">{r.approver_label}</div><div className="text-[11px] text-[#8A7A8B]">{r.name}{r.approver_role ? ` · ${r.approver_role}` : ''}</div></td>
                          <td className={TD}>{r.approval_mode === 'all' ? <Chip tone="purple" title="Every listed person has to approve this step">All must approve</Chip> : <Chip tone="grey" title="Any one of the listed people can approve">Any one</Chip>}</td>
                          <td className={`${TD} min-w-[200px]`}><div className="flex flex-wrap gap-1">{(r.approver_emails || []).map(e => <Chip key={e} tone="blue">{e}</Chip>)}</div></td>
                          <td className={TD}><ActiveStatus active={r.is_active} /></td>
                          <td className={`${TD} whitespace-nowrap`}>
                            {editable && (
                              <div className="flex gap-1">
                                <button type="button" aria-label="Move step up" title="Move up" className={ICON_BTN} disabled={idx === 0} onClick={() => move(g, idx, -1)}><ArrowUp size={12} /></button>
                                <button type="button" aria-label="Move step down" title="Move down" className={ICON_BTN} disabled={idx === g.steps.length - 1} onClick={() => move(g, idx, 1)}><ArrowDown size={12} /></button>
                                <button type="button" aria-label="Edit rule" title="Edit" className={ICON_BTN} onClick={() => setForm({ id: r.id, init: toInput(r) })}><Pencil size={12} /></button>
                                <button type="button" aria-label="Duplicate rule" title="Duplicate" className={ICON_BTN} onClick={() => setForm({ id: null, init: { ...toInput(r), name: `${r.name} (copy)`, created_by: user?.email ?? null } })}><Copy size={12} /></button>
                                <button type="button" aria-label="Delete rule" title="Delete" className={ICON_BTN_DANGER} onClick={() => remove(r)}><Trash2 size={12} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-3 min-w-0">
            <SimulatePanel companies={companies} vendors={vendors} />
            <DelegationsCard master={editable} myEmail={user?.email ?? ''} userEmails={userEmails} toast={ctx.toast} />
          </div>
        </div></div>
      )}

      {form && (
        <RuleModal id={form.id} init={form.init} companies={companies} vendors={vendors} userEmails={userEmails}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); ctx.toast('Rule saved.'); setReloadKey(k => k + 1) }} />
      )}
    </div>
  )
}

function SimulatePanel({ companies, vendors }: { companies: CostAgentCompany[]; vendors: CostAgentVendor[] }) {
  const [company, setCompany] = useState('')
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [office, setOffice] = useState('')
  const [amount, setAmount] = useState('')
  const [route, setRoute] = useState<ApprovalRoute | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name })), [vendors])

  const run = async () => {
    const n = parseQtyInput(amount)
    if (n === null) { setError('Enter a valid amount.'); return }
    setBusy(true); setError(null)
    try { setRoute(await costAgentSimulateMatrix(company || null, vendorId, n, office || null)) } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <aside className={`${SA_CARD} p-4 space-y-3`} data-simulate>
      <h3 className="text-[14px] font-bold text-[#3B1B3D] flex items-center gap-1.5"><FlaskConical size={15} /> Simulate</h3>
      <p className="text-[12px] text-[#6E5E70]">Shows the approval steps an invoice would get when submitted (level, mode, approvers and active substitutes).</p>
      <div><FieldLabel>Company</FieldLabel><select className={SA_INPUT} value={company} onChange={e => setCompany(e.target.value)}><option value="">—</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
      <div><FieldLabel>Vendor</FieldLabel><CostAgentCombobox options={vendorOpts} value={vendorId} onChange={v => setVendorId(v === null ? null : Number(v))} placeholder="Any vendor" /></div>
      <div>
        <FieldLabel>Office</FieldLabel>
        <select className={SA_INPUT} value={office} onChange={e => setOffice(e.target.value)} aria-label="Office">
          <option value="">None</option>
          {OFFICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[#6E5E70]">{OFFICE_HELP}</p>
      </div>
      <div><FieldLabel>Amount (grand total)</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 75.000.000" onKeyDown={e => { if (e.key === 'Enter') run() }} /></div>
      <button type="button" className={`${SA_BTN_PRIMARY} w-full`} onClick={run} disabled={busy}>{busy ? 'Checking…' : 'Simulate'}</button>
      {error && <p className="text-[12px] text-[#A8231A]">{error}</p>}
      {route && <ApprovalRouteView route={route} />}
    </aside>
  )
}

// Kartu "Substitutes" (pengganti approver): daftar fn_cost_agent_list_delegations + Add / Delete. Master (hak edit matriks) melihat & mengelola semua;
// approver biasa hanya miliknya (dari/ke dirinya) dan hanya boleh menunjuk pengganti untuk dirinya sendiri -- diputuskan database.
function DelegationsCard({ master, myEmail, userEmails, toast }: { master: boolean; myEmail: string; userEmails: { email: string; name: string | null }[]; toast: HubCtx['toast'] }) {
  const list = useAsync(() => costAgentListDelegations(false), [])
  const [dlg, setDlg] = useState(false)
  const rows: Delegation[] = list.data ?? []
  const remove = async (d: Delegation) => {
    if (!window.confirm(`Remove the substitute ${d.to} for ${d.from}?`)) return
    try { await costAgentDeleteDelegation(d.id); toast('Substitute removed.'); list.reload() } catch (e: any) { toast(e.message || String(e), 'err') }
  }
  return (
    <aside className={`${SA_CARD} p-4 space-y-3`} data-delegations>
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-bold text-[#3B1B3D] flex items-center gap-1.5"><UserRoundCog size={15} /> Substitutes</h3>
        <button type="button" className={`${SA_BTN_OUTLINE} !h-7 !px-2.5 ml-auto`} onClick={() => setDlg(true)}><Plus size={12} /> Add</button>
      </div>
      <p className="text-[12px] text-[#6E5E70]">While a substitute is valid, that person can approve on behalf of the approver.{master ? '' : ' You can only set a substitute for yourself.'}</p>
      {list.error && <p className="text-[12px] text-[#A8231A]">{list.error}</p>}
      {!list.error && rows.length === 0 && <p className="text-[12.5px] text-[#6E5E70] italic">{list.loading ? 'Loading…' : 'No substitutes.'}</p>}
      <ul className="space-y-1.5">
        {rows.map(d => (
          <li key={d.id} className="rounded-lg border border-[#EADFD6] px-3 py-2 text-[12.5px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{d.to}</span>
              <span className="text-[#8A7A8B]">for</span>
              <span className="[overflow-wrap:anywhere]">{d.from}</span>
              {d.active_now && <Chip tone="green">Active now</Chip>}
              {(master || d.from.toLowerCase() === myEmail.toLowerCase()) && (
                <button type="button" className={`${ICON_BTN_DANGER} ml-auto`} aria-label="Delete substitute" title="Delete" onClick={() => remove(d)}><Trash2 size={12} /></button>
              )}
            </div>
            <div className="text-[11.5px] text-[#6E5E70]">{fmtDate(d.valid_from)} – {fmtDate(d.valid_to)}{d.reason ? ` · ${d.reason}` : ''}</div>
          </li>
        ))}
      </ul>
      {dlg && <DelegationModal master={master} myEmail={myEmail} userEmails={userEmails} onClose={() => setDlg(false)} onSaved={() => { setDlg(false); toast('Substitute saved.'); list.reload() }} />}
    </aside>
  )
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function DelegationModal({ master, myEmail, userEmails, onClose, onSaved }: {
  master: boolean; myEmail: string; userEmails: { email: string; name: string | null }[]; onClose: () => void; onSaved: () => void
}) {
  const today = new Date()
  const [from, setFrom] = useState(myEmail)
  const [to, setTo] = useState('')
  const [validFrom, setValidFrom] = useState(isoDay(today))
  const [validTo, setValidTo] = useState(isoDay(new Date(today.getTime() + 7 * 86400000)))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const f = from.trim().toLowerCase(); const t = to.trim().toLowerCase()
    if (!EMAIL_RE.test(f) || !EMAIL_RE.test(t)) return setError('Enter valid email addresses.')
    if (f === t) return setError('The substitute must be a different person.')
    if (!validFrom || !validTo) return setError('Valid from and valid to are required.')
    if (validTo < validFrom) return setError('Valid to cannot be earlier than valid from.')
    if ((new Date(validTo).getTime() - new Date(validFrom).getTime()) / 86400000 > 366) return setError('A substitute can be set for at most one year.')
    setBusy(true); setError(null)
    try { await costAgentSaveDelegation(null, f, t, validFrom, validTo, reason.trim() || null); onSaved() } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <CostAgentModal maxWidth="max-w-md" z="z-[90]" onClose={() => { if (!busy) onClose() }} title="Add substitute" subtitle="The substitute can approve on behalf of the approver during this period."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="p-5 space-y-3">
        <datalist id="delegation-emails">{userEmails.map(u => <option key={u.email} value={u.email}>{u.name || ''}</option>)}</datalist>
        <div><FieldLabel required>Approver (from)</FieldLabel><input className={SA_INPUT} value={from} onChange={e => setFrom(e.target.value)} disabled={!master || busy} list="delegation-emails" /></div>
        <div><FieldLabel required>Substitute</FieldLabel><input className={SA_INPUT} value={to} onChange={e => setTo(e.target.value)} disabled={busy} list="delegation-emails" placeholder="name@company.com" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel required>Valid from</FieldLabel><input type="date" className={SA_INPUT} value={validFrom} onChange={e => setValidFrom(e.target.value)} disabled={busy} /></div>
          <div><FieldLabel required>Valid to</FieldLabel><input type="date" className={SA_INPUT} value={validTo} min={validFrom} onChange={e => setValidTo(e.target.value)} disabled={busy} /></div>
        </div>
        <div><FieldLabel>Reason</FieldLabel><input className={SA_INPUT} value={reason} maxLength={200} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="e.g. Annual leave" /></div>
        {error && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] [overflow-wrap:anywhere]" role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

function RuleModal({ id, init, companies, vendors, userEmails, onClose, onSaved }: {
  id: number | null; init: CostAgentMatrixInput; companies: CostAgentCompany[]; vendors: CostAgentVendor[]
  userEmails: { email: string; name: string | null }[]; onClose: () => void; onSaved: () => void
}) {
  const [v, setV] = useState<CostAgentMatrixInput>(init)
  const [minStr, setMinStr] = useState(String(init.min_amount ?? 0))
  const [maxStr, setMaxStr] = useState(init.max_amount === null ? '' : String(init.max_amount))
  const [emailInput, setEmailInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof CostAgentMatrixInput>(k: K, val: CostAgentMatrixInput[K]) => setV(p => ({ ...p, [k]: val }))
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(x => ({ value: x.id, label: x.name })), [vendors])
  const suggestions = useMemo(() => {
    const q = emailInput.trim().toLowerCase()
    if (!q) return []
    return userEmails.filter(u => !v.approver_emails.includes(u.email) && `${u.email} ${u.name || ''}`.toLowerCase().includes(q)).slice(0, 6)
  }, [emailInput, userEmails, v.approver_emails])

  const addEmail = (raw: string) => {
    const list = raw.split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    const bad = list.filter(e => !EMAIL_RE.test(e))
    if (bad.length) { setError(`Not a valid email: ${bad.join(', ')}`); return }
    setError(null)
    setV(p => ({ ...p, approver_emails: [...new Set([...p.approver_emails, ...list])] }))
    setEmailInput('')
  }

  const save = async () => {
    const min = parseQtyInput(minStr)
    const max = maxStr.trim() === '' ? null : parseQtyInput(maxStr)
    if (!v.name.trim()) return setError('Rule name is required.')
    if (!v.approver_label.trim()) return setError('Level name is required.')
    if (min === null || min < 0) return setError('Min amount must be a number ≥ 0.')
    if (maxStr.trim() !== '' && max === null) return setError('Max amount must be a number (or empty for no limit).')
    if (max !== null && max < min) return setError('Max must be greater than or equal to min.')
    if (!Number.isInteger(v.step_no) || v.step_no < 1 || v.step_no > 10) return setError('Step must be between 1 and 10.')
    if (emailInput.trim()) return setError('Press Enter to add the typed email first.')
    if (!v.approver_emails.length) return setError('Add at least 1 approver email.')
    setBusy(true); setError(null)
    try {
      await saveCostAgentMatrixRule(id, { ...v, office: v.office ?? null, name: v.name.trim(), approver_label: v.approver_label.trim(), approver_role: v.approver_role?.trim() || null, min_amount: min, max_amount: max })
      onSaved()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <CostAgentModal maxWidth="max-w-2xl" onClose={() => { if (!busy) onClose() }} title={id === null ? 'Add approval rule' : 'Edit approval rule'}
      subtitle="Most specific rule per step wins: vendor > office > company > general."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save rule'}</button>
      </>}>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><FieldLabel required>Rule name</FieldLabel><input className={SA_INPUT} value={v.name} onChange={e => set('name', e.target.value)} placeholder="e.g. WNS < 50M - Step 1 Supervisor" /></div>
        <div><FieldLabel hint="empty = all">Company</FieldLabel>
          <select className={SA_INPUT} value={v.company_code ?? ''} onChange={e => set('company_code', e.target.value || null)}><option value="">All companies</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
        </div>
        <div><FieldLabel hint="empty = all">Vendor</FieldLabel><CostAgentCombobox options={vendorOpts} value={v.vendor_id} onChange={x => set('vendor_id', x === null ? null : Number(x))} placeholder="All vendors" /></div>
        <div className="sm:col-span-2">
          <FieldLabel hint="owner office of the vessel">Office</FieldLabel>
          <select className={SA_INPUT} value={v.office ?? ''} onChange={e => set('office', (e.target.value || null) as CostAgentMatrixInput['office'])} aria-label="Office">
            <option value="">All offices</option>
            {OFFICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[#6E5E70]">{OFFICE_HELP}</p>
        </div>
        <div><FieldLabel required>Min amount</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={minStr} onChange={e => setMinStr(e.target.value)} /></div>
        <div><FieldLabel hint="empty = no limit">Max amount</FieldLabel><input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={maxStr} onChange={e => setMaxStr(e.target.value)} /></div>
        <div><FieldLabel required>Step</FieldLabel><input className={SA_INPUT} type="number" min={1} max={10} value={v.step_no} onChange={e => set('step_no', Number(e.target.value))} /></div>
        <div><FieldLabel required>Level name</FieldLabel><input className={SA_INPUT} value={v.approver_label} onChange={e => set('approver_label', e.target.value)} placeholder="e.g. Finance Supervisor" /></div>
        <div className="sm:col-span-2">
          <FieldLabel required hint="Enter to add">Approver emails</FieldLabel>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {v.approver_emails.map(e => (
              <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EEF1FA] text-[#2F4FA8] text-[11.5px] font-semibold">
                {e}<button type="button" aria-label={`Remove ${e}`} onClick={() => set('approver_emails', v.approver_emails.filter(x => x !== e))}><X size={11} /></button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input className={SA_INPUT} value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="name@company.com"
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) { e.preventDefault(); addEmail(emailInput) } }} />
            {suggestions.length > 0 && (
              <div className="absolute z-[90] mt-1 w-full bg-white border border-[#EADFD6] rounded-lg shadow-xl">
                {suggestions.map(u => (
                  <button key={u.email} type="button" onMouseDown={e => { e.preventDefault(); addEmail(u.email) }} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#FBF7F4]">
                    <span className="font-medium text-[#3B1B3D]">{u.email}</span>{u.name && <span className="text-[#6E5E70]"> · {u.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <FieldLabel required>Mode</FieldLabel>
          <select className={SA_INPUT} value={v.approval_mode ?? 'any'} onChange={e => set('approval_mode', e.target.value as 'any' | 'all')} aria-label="Approval mode">
            <option value="any">Any one of the list</option>
            <option value="all">All must approve</option>
          </select>
          <p className="mt-1 text-[11px] text-[#6E5E70]">All must approve: every listed person has to approve this step.</p>
        </div>
        <div><FieldLabel>Role (optional)</FieldLabel><input className={SA_INPUT} value={v.approver_role ?? ''} onChange={e => set('approver_role', e.target.value)} /></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D] h-9"><input type="checkbox" checked={v.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-[#17663D]" /> Active</label></div>
        {error && <div className="sm:col-span-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
        <p className={`sm:col-span-2 ${SA_LABEL} normal-case tracking-normal font-normal`}>Each step of the same company / vendor / range needs its own rule (step 1, step 2, …). Use the arrows on the Approval Matrix to change the order.</p>
      </div>
    </CostAgentModal>
  )
}
