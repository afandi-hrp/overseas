// Setting `gate_block_codes` (grup "Documents & auto-verify") sebagai daftar centang, bukan JSON mentah (Tahap 3c, 2026-10-28, SQL 092).
// Hanya kode yang dicentang yang MEMBLOKIR Verify / Submit / Validate (server: fn_cost_agent_doc_gate); temuan lain tampil sebagai Notes. Simpan lewat fn_cost_agent_save_setting
// dengan array kode yang dicentang (urutan daftar; `not_analysed` terkunci dan selalu ikut). Kode di luar daftar -> baris "Other: <kode>" yang tetap bisa diubah.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY } from '../../../components/SeaAirAuditUi'
import { fmtDateTimePort } from '../../../utils/CostAgentHelpers'
import { costAgentSaveSetting, type CostAgentSetting } from '../../../utils/CostAgentWorkflow'
import { GATE_CODE_GROUPS, gateCodesToSave, otherGateCodes, toggleGateCode } from '../../../utils/CostAgentRolesLogic'
import { ErrorBox, type HubCtx } from './hubUi'

const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b)

export default function GateCodesRow({ s, editable, toast, onSaved }: { s: CostAgentSetting; editable: boolean; toast: HubCtx['toast']; onSaved: (key: string, value: unknown) => void }) {
  const server = gateCodesToSave(s.value)
  const [draft, setDraft] = useState<string[]>(server)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(gateCodesToSave(s.value)); setError(null) }, [s.value]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(draft, server)
  const others = otherGateCodes(draft)

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const r = await costAgentSaveSetting(s.key, draft)
      onSaved(s.key, r.value)
      toast('What blocks submit? saved.')
    } catch (e: any) { setError(e?.message || String(e)); toast(e?.message || String(e), 'err') } finally { setBusy(false) }
  }
  const box = (code: string, label: string, locked = false) => (
    <label key={code} className={`flex items-start gap-2 py-1 text-[12.5px] text-[#3B1B3D] ${locked || !editable ? '' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#6B3470] disabled:opacity-60" checked={draft.includes(code)} disabled={locked || !editable || busy}
        onChange={e => setDraft(d => toggleGateCode(d, code, e.target.checked))} data-gate-code={code} />
      <span className="min-w-0"><span className="[overflow-wrap:anywhere]">{label}</span> <span className="font-mono text-[10.5px] text-[#8A7A8B]">{code}</span>
        {locked && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-[#6E5E70]" title="Always blocks"><Lock size={10} /> always blocks</span>}</span>
    </label>
  )

  return (
    <div className="px-4 py-3 border-t border-[#F3EEEA] first:border-t-0" data-setting={s.key} data-gate-codes>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-[220px] flex-1">
          <div className="text-[13px] font-semibold text-[#3B1B3D]">What blocks submit?</div>
          <div className="text-[11px] font-mono text-[#8A7A8B]">{s.key}</div>
          <p className="mt-1 text-[11.5px] text-[#6E5E70]">Checked items stop the maker from verifying or submitting. Unchecked items only show as notes.</p>
        </div>
        {editable && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
            {dirty && !busy && <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setDraft(server); setError(null) }}>Reset</button>}
          </div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 @min-[900px]:grid-cols-3 gap-x-6 gap-y-2">
        {GATE_CODE_GROUPS.map(g => (
          <div key={g.title} className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-0.5">{g.title}</div>
            {g.codes.map(c => box(c.code, c.label, c.locked))}
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <div className="mt-2" data-gate-other>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-0.5">Other</div>
          {others.map(c => box(c, `Other: ${c}`))}
        </div>
      )}
      <div className="mt-1 text-[10.5px] text-[#8A7A8B]">{s.updated_at ? `Updated ${fmtDateTimePort(s.updated_at, null)}` : ''}</div>
      {error && <div className="mt-1.5"><ErrorBox message={error} /></div>}
    </div>
  )
}
