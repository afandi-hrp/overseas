// Settings > "User roles" (Tahap 3c, 2026-10-28, SQL 092): siapa yang boleh bertindak sebagai Maker / Checker / Approver / AP Note / Treasury.
// Data lewat fn_cost_agent_list_user_roles / fn_cost_agent_save_user_roles (satu panggilan per baris, seluruh daftar peran baris itu). Hak ubah = hak editor Settings (ctx.editable);
// tanpa hak ubah tabel hanya baca. Pesan error database ditampilkan apa adanya. Daftar user untuk "Add user" = profiles (sumber yang sama dengan Kelola Role & Akses,
// RLS tetap berlaku); bila tidak terbaca, input email biasa. Aturan siapa-boleh-apa TIDAK dihitung di klien.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fetchAppUserEmails } from '../../../utils/CostAgentHelpers'
import { costAgentListUserRoles, costAgentSaveSetting, costAgentSaveUserRoles, resetMyRolesCache } from '../../../utils/CostAgentWorkflow'
import {
  ROLE_KEYS, ROLE_LABEL, checksFromRoles, coverageItems, emptyChecks, isValidEmail, noOneSentence, rolesFromChecks, sameChecks,
  type RoleChecks, type RoleKey, type UserRolesRow,
} from '../../../utils/CostAgentRolesLogic'
import { ConfirmModal, ErrorBox, SectionTitle, TD, TH, useAsync, type HubCtx } from './hubUi'

interface Row { email: string; checks: RoleChecks; saved: RoleChecks; note: string; savedNote: string; isNew: boolean; busy: boolean; updated_by: string | null }
const fromServer = (u: UserRolesRow): Row => ({
  email: u.email, checks: checksFromRoles(u.roles), saved: checksFromRoles(u.roles), note: u.note ?? '', savedNote: u.note ?? '', isNew: false, busy: false, updated_by: u.updated_by,
})
const isDirty = (r: Row) => !sameChecks(r.checks, r.saved) || r.note.trim() !== r.savedNote.trim()

export default function UserRolesCard({ ctx, onStrictChanged }: { ctx: HubCtx; onStrictChanged: (v: boolean) => void }) {
  const list = useAsync(costAgentListUserRoles, [])
  const [rows, setRows] = useState<Row[]>([])
  const [strict, setStrict] = useState<boolean | null>(null)
  const [strictBusy, setStrictBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [appUsers, setAppUsers] = useState<{ email: string; name: string | null }[] | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)

  // Muat ulang dari server TIDAK menimpa baris yang sedang diubah / sedang disimpan / baru ditambah (belum disimpan).
  useEffect(() => {
    const d = list.data
    if (!d) return
    setStrict(d.roles_strict)
    setRows(prev => {
      const keep = new Map(prev.filter(r => r.isNew || r.busy || isDirty(r)).map(r => [r.email, r]))
      const server = d.users.map(u => keep.get(u.email) ?? fromServer(u))
      const serverEmails = new Set(d.users.map(u => u.email))
      const extra = prev.filter(r => r.isNew && !serverEmails.has(r.email))
      return [...server, ...extra].sort((a, b) => a.email.localeCompare(b.email))
    })
  }, [list.data])

  useEffect(() => {
    if (!adding || appUsers !== null) return
    fetchAppUserEmails().then(setAppUsers).catch(() => setAppUsers([]))
  }, [adding, appUsers])
  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])

  const patch = (email: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r.email === email ? { ...r, ...p } : r)))
  const toggle = (email: string, k: RoleKey, on: boolean) => setRows(rs => rs.map(r => (r.email === email ? { ...r, checks: { ...r.checks, [k]: on } } : r)))

  const save = async (r: Row) => {
    const roles = rolesFromChecks(r.checks)
    patch(r.email, { busy: true })
    try {
      const res = await costAgentSaveUserRoles(r.email, roles, r.note.trim() || null)
      resetMyRolesCache()
      if (roles.length === 0) setRows(rs => rs.filter(x => x.email !== r.email))
      else setRows(rs => rs.map(x => (x.email === r.email ? { ...x, email: res.email || x.email, saved: checksFromRoles(res.roles), checks: checksFromRoles(res.roles), savedNote: r.note.trim(), note: r.note.trim(), isNew: false, busy: false } : x)))
      ctx.toast(roles.length === 0 ? `${r.email} removed from the list.` : `Roles saved for ${r.email}.`)
      list.reload()
    } catch (e: any) {
      patch(r.email, { busy: false })
      ctx.toast(e?.message || String(e), 'err')
    }
  }
  const askRemove = (r: Row) => {
    if (r.isNew) { setRows(rs => rs.filter(x => x.email !== r.email)); return }
    setRemoving(r.email); setRemoveError(null)
  }
  const doRemove = async () => {
    const r = rows.find(x => x.email === removing)
    if (!r) { setRemoving(null); return }
    patch(r.email, { busy: true }); setRemoveError(null)
    try {
      await costAgentSaveUserRoles(r.email, [], null)
      resetMyRolesCache()
      setRows(rs => rs.filter(x => x.email !== r.email)); setRemoving(null)
      ctx.toast(`${r.email} removed from the list.`)
      list.reload()
    } catch (e: any) { patch(r.email, { busy: false }); setRemoveError(e?.message || String(e)) }
  }

  const addUser = () => {
    const email = newEmail.trim().toLowerCase()
    if (!isValidEmail(email)) { setAddError('Enter a valid email address'); return }
    if (rows.some(r => r.email === email)) { setAddError('This user is already in the list.'); return }
    setRows(rs => [...rs, { email, checks: emptyChecks(), saved: emptyChecks(), note: '', savedNote: '', isNew: true, busy: false, updated_by: null }].sort((a, b) => a.email.localeCompare(b.email)))
    setNewEmail(''); setAddError(null); setAdding(false)
  }

  const coverage = coverageItems(list.data?.coverage)
  const zero = coverage.filter(c => c.warn)
  const toggleStrict = async () => {
    const next = !strict
    if (next && !window.confirm(`Turn on "Enforce roles"? Only users listed here can act in each role.${zero.length ? `\n\nNo one is set as ${zero.map(z => z.label).join(', ')} yet; nobody could act in ${zero.length === 1 ? 'that role' : 'those roles'}.` : ''}`)) return
    setStrictBusy(true)
    try {
      const r = await costAgentSaveSetting('roles_strict', next)
      setStrict(r.value === true); onStrictChanged(r.value === true); resetMyRolesCache()
      ctx.toast(`Enforce roles ${r.value === true ? 'turned on' : 'turned off'}.`)
    } catch (e: any) { ctx.toast(e?.message || String(e), 'err') } finally { setStrictBusy(false) }
  }

  return (
    <div className="px-4 pb-3 border-b border-[#F3EEEA]" data-user-roles>
      <SectionTitle hint="Who can act as Maker, Checker, Approver, AP Note or Treasury on Agency Invoices."
        right={ctx.editable && !adding ? <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setAdding(true); setAddError(null) }} data-add-role-user><Plus size={13} /> Add user</button> : undefined}>
        User roles
      </SectionTitle>

      {list.error && <div className="mb-2"><ErrorBox message={list.error} onRetry={list.reload} /></div>}

      {list.data && (
        <div className="mb-2.5" data-roles-coverage>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12.5px] text-[#3B1B3D]">
            {coverage.map((c, i) => (
              <span key={c.key} className={`inline-flex items-center gap-1 ${c.warn ? 'text-[#7A4F00] font-semibold' : ''}`} title={c.help ?? undefined} data-coverage={c.key}>
                {i > 0 && <span className="text-[#C9BFCB] mr-2">·</span>}
                {c.warn && <AlertTriangle size={12} className="text-[#B7791F]" />}{c.label} <b className="tabular-nums">{c.count}</b>
              </span>
            ))}
          </div>
          {zero.length > 0 && <p className="mt-1 text-[11.5px] text-[#7A4F00]" data-coverage-help>{noOneSentence(coverage)}</p>}
        </div>
      )}

      {adding && ctx.editable && (
        <div className="mb-2.5 flex items-center gap-2 flex-wrap rounded-xl border border-[#EADFD6] bg-[#FBF7F4] px-3 py-2" data-add-role-form>
          <input ref={addRef} className={`${SA_INPUT} !w-72 !h-8`} type="email" list="cost-agent-app-users" value={newEmail} placeholder="Pick an app user or type an email"
            onChange={e => { setNewEmail(e.target.value); setAddError(null) }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUser() } }} aria-label="User email" />
          <datalist id="cost-agent-app-users">{(appUsers ?? []).map(u => <option key={u.email} value={u.email}>{u.name ?? ''}</option>)}</datalist>
          <button type="button" className={SA_BTN_PRIMARY} onClick={addUser} disabled={!newEmail.trim()}>Add</button>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setAdding(false); setNewEmail(''); setAddError(null) }}><X size={13} /> Cancel</button>
          {addError && <span className="text-[12px] text-[#A8231A]" role="alert">{addError}</span>}
          <span className="basis-full text-[11px] text-[#6E5E70]">Then tick the roles and press Save on the new row.</span>
        </div>
      )}

      <div className={`${SA_CARD} overflow-x-auto`}>
        <table className="min-w-full" data-user-roles-table>
          <thead>
            <tr>
              <th className={TH}>User</th>
              {ROLE_KEYS.map(k => <th key={k} className={`${TH} text-center`}>{ROLE_LABEL[k]}</th>)}
              <th className={TH}>Note</th>
              <th className={`${TH} text-right`}>{ctx.editable ? 'Action' : ''}</th>
            </tr>
          </thead>
          <tbody>
            {list.loading && !list.data && <tr><td colSpan={ROLE_KEYS.length + 3} className="px-4 py-6 text-center text-sm text-[#6E5E70]">Loading user roles…</td></tr>}
            {list.data && rows.length === 0 && <tr><td colSpan={ROLE_KEYS.length + 3} className="px-4 py-6 text-center text-sm text-[#6E5E70] italic">No users yet.{ctx.editable ? ' Press "Add user".' : ''}</td></tr>}
            {rows.map(r => {
              const dirty = isDirty(r)
              const canSave = ctx.editable && !r.busy && (r.isNew ? rolesFromChecks(r.checks).length > 0 : dirty)
              return (
                <tr key={r.email} className="border-t border-[#F3EEEA]" data-role-row={r.email}>
                  <td className={`${TD} min-w-[200px] [overflow-wrap:anywhere]`}>
                    <span className="font-semibold">{r.email}</span>
                    {r.isNew && <Chip tone="amber" className="ml-1.5">not saved</Chip>}
                  </td>
                  {ROLE_KEYS.map(k => (
                    <td key={k} className={`${TD} text-center`}>
                      <input type="checkbox" className="w-4 h-4 accent-[#6B3470] disabled:opacity-50" checked={r.checks[k]} disabled={!ctx.editable || r.busy}
                        onChange={e => toggle(r.email, k, e.target.checked)} aria-label={`${ROLE_LABEL[k]} for ${r.email}`} data-role-check={k} />
                    </td>
                  ))}
                  <td className={TD}>
                    <input className={`${SA_INPUT} !h-8 !w-44`} value={r.note} maxLength={200} disabled={!ctx.editable || r.busy} placeholder="Note"
                      onChange={e => patch(r.email, { note: e.target.value })} aria-label={`Note for ${r.email}`} />
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {ctx.editable && (
                      <span className="inline-flex items-center gap-1.5">
                        <button type="button" className={`${SA_BTN_PRIMARY} !h-8`} onClick={() => save(r)} disabled={!canSave} data-role-save>{r.busy ? 'Saving…' : 'Save'}</button>
                        <button type="button" className={`${SA_BTN_OUTLINE} !h-8 text-[#A8231A] hover:border-[#F4C3BC] hover:bg-[#FDE7E4]`} onClick={() => askRemove(r)} disabled={r.busy} data-role-remove><Trash2 size={13} /> Remove</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 space-y-1.5 text-[12px] text-[#6E5E70]" data-roles-help>
        <p>Everyone you add here also needs View access to Agency Invoices in Role &amp; Access (one time). Edit access per feature is no longer needed.</p>
        <p>While &lsquo;Enforce roles&rsquo; (roles_strict) is off, anyone who can edit Agency Invoices can act in every role. Turn it on once every role has at least one user.</p>
        <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]">
          <button type="button" role="switch" aria-checked={strict === true} aria-label="Enforce roles" disabled={!ctx.editable || strictBusy || strict === null} onClick={toggleStrict} data-roles-strict
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${strict ? 'bg-[#6B3470]' : 'bg-[#D9CFD6]'}`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${strict ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
          Enforce roles <span className="font-mono font-normal text-[11px] text-[#8A7A8B]">roles_strict</span>
          <span className={strict ? 'text-[#17663D]' : 'text-[#8A7A8B] font-normal'}>{strict === null ? '' : strict ? 'On' : 'Off'}</span>
        </label>
      </div>

      {removing && (
        <ConfirmModal title="Remove user from the list?" confirmLabel="Remove" danger busy={rows.find(r => r.email === removing)?.busy} error={removeError}
          onClose={() => setRemoving(null)} onConfirm={doRemove}>
          <p><b>{removing}</b> will lose every role. {strict ? 'Enforce roles is on, so this user will only be able to view Agency Invoices.' : 'This user can still act if they have edit access to Agency Invoices (Enforce roles is off).'}</p>
        </ConfirmModal>
      )}
    </div>
  )
}
