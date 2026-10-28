// Tab "Approval Matrix" hub Cost Agent Settings -- ISI HALAMAN LAMA (/cost-agent/approval-matrix, Prompt 4 2026-10-13) dipindah apa adanya ke sini,
// dengan SATU tambahan (2026-10-26, sql/079): kolom/field OFFICE (Medan / Jakarta; kosong = berlaku utk semua office). CRUD langsung tabel
// cost_agent_approval_matrix (RLS: baca has_page_access, tulis has_edit_access('cost_agent_approval_matrix')); edit hanya bila ctx.editable.
// Aturan paling spesifik per step menang (dihitung SERVER, jangan diimplementasi ulang): vendor > office > PT > umum. Aturan khusus office yg
// aktif + kapal invoice belum punya office => pengajuan approval ditolak server.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Copy, Trash2, AlertTriangle, FlaskConical, X, EyeOff } from 'lucide-react'
import { useAuth } from '../../../lib/AuthContext'
import { LoadingState } from '../../../components/LoadingState'
import { CostAgentModal, CostAgentCombobox, FieldLabel, FilterPanel, FilterField, FilterButton, FILTER_SELECT, type ComboOption } from '../../../components/CostAgentUi'
import { Chip, PtBadge, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT, SA_LABEL } from '../../../components/SeaAirAuditUi'
import {
  fetchCostAgentApprovalMatrix, saveCostAgentMatrixRule, deleteCostAgentMatrixRule, fetchCostAgentCompanies, fetchCostAgentVendors,
  fetchAppUserEmails, costAgentMatrixFor, matrixCoverageGaps, fmtShortAmount, fmtRupiah, parseQtyInput,
  type CostAgentApprovalMatrixRow, type CostAgentCompany, type CostAgentVendor, type CostAgentMatrixStep, type CostAgentMatrixInput,
} from '../../../utils/CostAgentHelpers'
import { OFFICE_LABEL, OFFICE_OPTIONS } from './hubApi'
import { ErrorBox, OfficeBadge, type HubCtx } from './hubUi'
import { ActiveStatus, HIDE_LG, HIDE_XL, ICON_BTN, ICON_BTN_DANGER } from './hubUi'

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

  // Ladder: kelompok (PT, office, vendor, rentang) -> step berurutan.
  const ladders = useMemo(() => {
    const m = new Map<string, { company: string | null; office: string | null; vendor: number | null; min: number; max: number | null; steps: CostAgentApprovalMatrixRow[] }>()
    shown.filter(r => r.is_active).forEach(r => {
      const k = `${r.company_code ?? '*'}|${r.office ?? '*'}|${r.vendor_id ?? '*'}|${r.min_amount}|${r.max_amount ?? '∞'}`
      if (!m.has(k)) m.set(k, { company: r.company_code, office: r.office ?? null, vendor: r.vendor_id, min: Number(r.min_amount), max: r.max_amount === null ? null : Number(r.max_amount), steps: [] })
      m.get(k)!.steps.push(r)
    })
    return [...m.values()].map(l => ({ ...l, steps: l.steps.sort((a, b) => a.step_no - b.step_no) }))
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

  const remove = async (r: CostAgentApprovalMatrixRow) => {
    if (!window.confirm(`Delete rule "${r.name}" (step ${r.step_no})?`)) return
    try { await deleteCostAgentMatrixRule(r.id); ctx.toast('Rule deleted.'); setReloadKey(k => k + 1) } catch (e: any) { ctx.toast(e.message || String(e), 'err') }
  }
  const blank = (): CostAgentMatrixInput => ({
    name: '', company_code: companyFilter || null, vendor_id: null, office: null, min_amount: 0, max_amount: null, step_no: 1,
    approver_label: '', approver_emails: [], approver_role: null, is_active: true, created_by: user?.email ?? null,
  })
  const toInput = (r: CostAgentApprovalMatrixRow): CostAgentMatrixInput => ({
    name: r.name, company_code: r.company_code, vendor_id: r.vendor_id, office: r.office ?? null, min_amount: Number(r.min_amount), max_amount: r.max_amount === null ? null : Number(r.max_amount),
    step_no: r.step_no, approver_label: r.approver_label, approver_emails: r.approver_emails || [], approver_role: r.approver_role, is_active: r.is_active, created_by: r.created_by ?? null,
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

            <section className={`${SA_CARD} p-4`}>
              <h3 className="text-[14px] font-bold text-[#3B1B3D] mb-2">Ladder</h3>
              {ladders.length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">No active rules.</p> : (
                <ul className="space-y-1.5">
                  {ladders.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 flex-wrap text-[12.5px]">
                      {l.company ? <PtBadge code={l.company} /> : <Chip tone="grey">All PT</Chip>}
                      {l.office ? <OfficeBadge office={l.office} /> : <Chip tone="grey">All offices</Chip>}
                      {l.vendor !== null && <Chip tone="purple">{vendorName(l.vendor)}</Chip>}
                      <span className="font-semibold text-[#3B1B3D] tabular-nums">{l.max === null ? (l.min > 0 ? `> ${fmtShortAmount(l.min)}` : 'Any amount') : `${fmtShortAmount(l.min)} – ${fmtShortAmount(l.max)}`}</span>
                      <span className="text-[#8A7A8B]">:</span>
                      <span className="text-[#3B1B3D]">{l.steps.map(s => `Step ${s.step_no} ${s.approver_label}`).join(' → ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${SA_CARD} overflow-hidden @container`}>
              <div className="overflow-x-auto [&_tbody_tr:hover]:bg-[#FBF7F4]">
                <table className="min-w-full">
                  <thead><tr>{['Rule name', 'Company', 'Office', 'Vendor', 'Min', 'Max', 'Step', 'Approver', 'Approver emails', 'Role', 'Active', ''].map((h, i) => <th key={h || 'a'} className={`${TH} ${i === 9 ? HIDE_XL : i === 7 ? HIDE_LG : ''}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.length === 0 && <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No rules{editable ? ' — click "Add rule".' : '.'}</td></tr>}
                    {shown.map(r => (
                      <tr key={r.id} className={`border-b border-[#F3EEEA] ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className={`${TD} font-semibold min-w-[160px]`}>{r.name}</td>
                        <td className={TD}>{r.company_code || <span className="text-[#8A7A8B]">All</span>}</td>
                        <td className={TD}>{r.office ? <OfficeBadge office={r.office} /> : <span className="text-[#8A7A8B]">All</span>}</td>
                        <td className={`${TD} min-w-[140px]`}>{r.vendor_id === null ? <span className="text-[#8A7A8B]">All</span> : vendorName(r.vendor_id)}</td>
                        <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmtRupiah(r.min_amount)}</td>
                        <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{r.max_amount === null ? <span className="text-[#8A7A8B]">No limit</span> : fmtRupiah(r.max_amount)}</td>
                        <td className={`${TD} text-center`}>{r.step_no}</td>
                        <td className={`${TD} ${HIDE_LG}`}>{r.approver_label}</td>
                        <td className={`${TD} min-w-[200px]`}><div className="flex flex-wrap gap-1">{(r.approver_emails || []).map(e => <Chip key={e} tone="blue">{e}</Chip>)}</div></td>
                        <td className={`${TD} ${HIDE_XL}`}>{r.approver_role || '—'}</td>
                        <td className={TD}><ActiveStatus active={r.is_active} /></td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {editable && (
                            <div className="flex gap-1">
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
          </div>

          <SimulatePanel companies={companies} vendors={vendors} />
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
  const [steps, setSteps] = useState<CostAgentMatrixStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name })), [vendors])

  const run = async () => {
    const n = parseQtyInput(amount)
    if (n === null) { setError('Enter a valid amount.'); return }
    setBusy(true); setError(null)
    try { setSteps(await costAgentMatrixFor(company || null, vendorId, n, office || null)) } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <aside className={`${SA_CARD} p-4 space-y-3 @min-[1100px]:sticky @min-[1100px]:top-2`}>
      <h3 className="text-[14px] font-bold text-[#3B1B3D] flex items-center gap-1.5"><FlaskConical size={15} /> Simulate</h3>
      <p className="text-[12px] text-[#6E5E70]">Shows the approval steps an invoice would get when submitted.</p>
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
      {steps && (steps.length === 0 ? (
        <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">No matching rule — submitting this invoice would fail.</div>
      ) : (
        <ol className="space-y-1.5">
          {steps.map(s => (
            <li key={s.step_no} className="rounded-lg border border-[#EADFD6] px-3 py-2 text-[12.5px]">
              <div className="font-semibold text-[#3B1B3D]">Step {s.step_no} · {s.approver_label}</div>
              <div className="text-[#6E5E70] text-[11.5px]">{(s.approver_emails || []).join(', ') || <span className="text-[#A8231A]">No approver email — any editor could approve</span>}</div>
            </li>
          ))}
        </ol>
      ))}
    </aside>
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
    if (!v.approver_label.trim()) return setError('Approver label is required.')
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
        <div><FieldLabel required>Approver label</FieldLabel><input className={SA_INPUT} value={v.approver_label} onChange={e => set('approver_label', e.target.value)} placeholder="e.g. Finance Supervisor" /></div>
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
        <div><FieldLabel>Role (optional)</FieldLabel><input className={SA_INPUT} value={v.approver_role ?? ''} onChange={e => set('approver_role', e.target.value)} /></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D] h-9"><input type="checkbox" checked={v.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-[#17663D]" /> Active</label></div>
        {error && <div className="sm:col-span-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
        <p className={`sm:col-span-2 ${SA_LABEL} normal-case tracking-normal font-normal`}>Each step of the same company / vendor / range needs its own rule (step 1, step 2, …).</p>
      </div>
    </CostAgentModal>
  )
}
