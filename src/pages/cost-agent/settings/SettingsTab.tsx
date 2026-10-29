// Tab "Settings" hub Cost Agent Settings (Tahap 2b, 2026-10-28, SQL 088) -- fn_cost_agent_list_settings (dikelompokkan per `group`) + fn_cost_agent_save_setting.
// Key TIDAK bisa ditambah / dihapus dari UI; tipe nilai harus sama dengan nilai lama (boolean = switch, number >= 0, array = daftar teks, string, object = JSON /
// apnote_type_by_office MEDAN & JAKARTA). Hak ubah = hak master (cost_agent_approval_matrix); pesan server ditampilkan apa adanya. Perubahan tercatat di master log.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { fmtDateTimePort } from '../../../utils/CostAgentHelpers'
import { costAgentListSettings, costAgentSaveSetting, type CostAgentSetting } from '../../../utils/CostAgentWorkflow'
import { ChipInput, ErrorBox, RecentChanges, SectionTitle, useAsync, type HubCtx } from './hubUi'
import { SA_CARD } from '../../../components/SeaAirAuditUi'
import UserRolesCard from './UserRolesCard'
import GateCodesRow from './GateCodesRow'

const GROUP_ORDER = ['Roles & workflow', 'Approval reminders & Director', 'Documents & auto-verify', 'Finance / AP Note', 'Documents', 'Comparison & general']
const NOTES: Record<string, string> = {
  roles_strict: 'Turn on only after every role has at least one user in User roles above, otherwise nobody can act in that role.',
  sod_enforced: 'Segregation of duties: the person who submitted an invoice cannot validate or approve it, and a checker cannot also approve.',
  validation_required: 'Submitting an invoice also opens a checker validation that runs in parallel with the approval steps.',
  director_emails: 'People who receive the final approval when an approver of the last step uses "Forward to Director".',
  checker_emails: 'People who are reminded when a checker validation is waiting.',
  reminder_after_days: 'Days an approval step waits before it turns orange and a reminder is sent.',
}
const humanize = (k: string) => k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
const OFFICES = ['MEDAN', 'JAKARTA']
// Daftar email (sql/090): format divalidasi juga di klien; server menolak email yang tidak valid.
const EMAIL_KEYS = new Set(['director_emails', 'checker_emails'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function SettingRow({ s, editable, onSaved, toast }: { s: CostAgentSetting; editable: boolean; onSaved: (key: string, value: unknown) => void; toast: HubCtx['toast'] }) {
  const isOffice = s.type === 'object' && s.value !== null && typeof s.value === 'object' && Object.keys(s.value as object).every(k => OFFICES.includes(k))
  const toDraft = (v: unknown): unknown => (s.type === 'number' ? String(v ?? '') : s.type === 'object' && !isOffice ? JSON.stringify(v, null, 2) : v)
  const [draft, setDraft] = useState<any>(() => toDraft(s.value))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(toDraft(s.value)); setError(null) }, [s.value]) // eslint-disable-line react-hooks/exhaustive-deps

  const parse = (): { ok: boolean; value?: unknown; msg?: string } => {
    if (s.type === 'number') {
      const t = String(draft).trim().replace(',', '.')
      const n = Number(t)
      if (t === '' || !Number.isFinite(n) || n < 0) return { ok: false, msg: 'Enter a number that is 0 or more.' }
      return { ok: true, value: n }
    }
    if (s.type === 'object' && !isOffice) {
      try { const v = JSON.parse(String(draft)); if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(); return { ok: true, value: v } }
      catch { return { ok: false, msg: 'Enter a valid JSON object.' } }
    }
    if (s.type === 'array' && EMAIL_KEYS.has(s.key)) {
      const bad = ((draft as string[]) ?? []).filter(e => !EMAIL_RE.test(e))
      if (bad.length) return { ok: false, msg: `Not a valid email: ${bad.join(', ')}` }
    }
    return { ok: true, value: draft }
  }
  const save = async (valueOverride?: unknown) => {
    const p = valueOverride !== undefined ? { ok: true, value: valueOverride } : parse()
    if (!p.ok) { setError(p.msg ?? 'Invalid value.'); return }
    if (s.key === 'roles_strict' && p.value === true && !window.confirm('Turn on strict roles? Only users listed in User roles above will be able to act as Maker / Checker / Approver / AP Note / Treasury. Add them first.')) return
    setBusy(true); setError(null)
    try {
      const r = await costAgentSaveSetting(s.key, p.value)
      onSaved(s.key, r.value)
      toast(`${humanize(s.key)} saved.`)
    } catch (e: any) { setError(e?.message || String(e)); toast(e?.message || String(e), 'err') } finally { setBusy(false) }
  }
  const dirty = !same(s.type === 'number' || (s.type === 'object' && !isOffice) ? toDraft(s.value) : s.value, draft)

  let editor: ReactNode
  if (s.type === 'boolean') {
    const on = draft === true
    editor = (
      <button type="button" role="switch" aria-checked={on} aria-label={humanize(s.key)} disabled={!editable || busy} onClick={() => save(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#6B3470]' : 'bg-[#D9CFD6]'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    )
  } else if (s.type === 'array') {
    editor = <div className="min-w-[260px] max-w-[420px]"><ChipInput values={(draft as string[]) ?? []} onChange={v => setDraft(v)} disabled={!editable || busy} normalize={EMAIL_KEYS.has(s.key) ? (x: string) => x.trim().toLowerCase() : undefined} placeholder={EMAIL_KEYS.has(s.key) ? 'name@company.com, press Enter' : 'Type a value and press Enter'} /></div>
  } else if (s.type === 'number') {
    editor = <input className={`${SA_INPUT} !w-28 text-right tabular-nums`} inputMode="decimal" value={draft} onChange={e => setDraft(e.target.value)} disabled={!editable || busy} aria-label={humanize(s.key)} />
  } else if (isOffice) {
    editor = (
      <div className="flex items-center gap-2 flex-wrap">
        {OFFICES.map(o => (
          <label key={o} className="inline-flex items-center gap-1.5 text-[11.5px] text-[#6E5E70]">{o}
            <input className={`${SA_INPUT} !w-24`} value={(draft as Record<string, string>)?.[o] ?? ''} maxLength={10} disabled={!editable || busy}
              onChange={e => setDraft({ ...(draft as object), [o]: e.target.value.toUpperCase() })} /></label>
        ))}
      </div>
    )
  } else if (s.type === 'object') {
    editor = <textarea className={`${SA_INPUT} h-auto py-2 font-mono text-[12px] min-w-[260px]`} rows={4} value={draft} onChange={e => setDraft(e.target.value)} disabled={!editable || busy} spellCheck={false} />
  } else {
    editor = <input className={`${SA_INPUT} !w-64`} value={draft ?? ''} onChange={e => setDraft(e.target.value)} disabled={!editable || busy} aria-label={humanize(s.key)} />
  }

  return (
    <div className="px-4 py-3 border-t border-[#F3EEEA] first:border-t-0" data-setting={s.key}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-[220px] flex-1">
          <div className="text-[13px] font-semibold text-[#3B1B3D]">{humanize(s.key)}</div>
          <div className="text-[11px] font-mono text-[#8A7A8B]">{s.key}</div>
          {NOTES[s.key] && <p className={`mt-1 text-[11.5px] ${s.key === 'roles_strict' ? 'text-[#7A4F00] font-semibold' : 'text-[#6E5E70]'}`}>{NOTES[s.key]}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {editor}
          {s.type !== 'boolean' && editable && (
            <button type="button" className={SA_BTN_PRIMARY} onClick={() => save()} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
          )}
          {s.type !== 'boolean' && editable && dirty && !busy && <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setDraft(toDraft(s.value)); setError(null) }}>Reset</button>}
        </div>
      </div>
      <div className="mt-1 text-[10.5px] text-[#8A7A8B]">{s.updated_at ? `Updated ${fmtDateTimePort(s.updated_at, null)}` : ''}</div>
      {error && <div className="mt-1.5"><ErrorBox message={error} /></div>}
    </div>
  )
}

export default function SettingsTab({ ctx }: { ctx: HubCtx }) {
  const list = useAsync(costAgentListSettings, [])
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [logKey, setLogKey] = useState(0)
  const rows = useMemo(() => (list.data ?? []).map(s => (s.key in overrides ? { ...s, value: overrides[s.key], updated_at: new Date().toISOString() } : s)), [list.data, overrides])
  const saved = (k: string, v: unknown) => { setOverrides(o => ({ ...o, [k]: v })); setLogKey(n => n + 1) }
  const groups = useMemo(() => {
    const ix = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i }
    const names: string[] = Array.from(new Set<string>(rows.map(r => r.group as string))).sort((a: string, b: string) => ix(a) - ix(b))
    return names.map(g => ({ name: g, items: rows.filter(r => r.group === g && r.key !== 'roles_strict') })) // roles_strict: switch ada di kartu User roles
  }, [rows])

  return (
    <div className="space-y-4" data-cost-agent-settings>
      <p className="text-[12px] text-[#6E5E70]">Rules for the document gate, auto-verify, roles and AP Note. Settings cannot be added or removed here; a value must keep its type.{!ctx.editable && ' You have view access only.'}</p>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <p className="text-sm text-[#6E5E70]">Loading settings…</p> : groups.map(g => (
        <section key={g.name} className={`${SA_CARD} overflow-hidden @container`}>
          <div className="px-4 pt-3 pb-1"><SectionTitle>{g.name} <Chip tone="grey">{g.items.length}</Chip></SectionTitle></div>
          {g.name === 'Roles & workflow' && <UserRolesCard ctx={ctx} onStrictChanged={v => saved('roles_strict', v)} />}
          {g.items.map(s => <Fragment key={s.key}>{s.key === 'gate_block_codes'
            ? <GateCodesRow s={s} editable={ctx.editable} toast={ctx.toast} onSaved={saved} />
            : <SettingRow s={s} editable={ctx.editable} toast={ctx.toast} onSaved={saved} />}</Fragment>)}
        </section>
      ))}
      <RecentChanges entities={['setting']} reloadKey={logKey} />
    </div>
  )
}
