// Dialog "Choose account" (Account mapping, SQL 111, 2026-10-30): cari akun di database Ascend PT baris itu (AC_Accounts, hanya yang aktif, maks 50) lalu pilih satu
// -> fn_cost_agent_account_map_save(..., 'user') = Manual / terkunci (tidak ditimpa Auto-map). Pencarian lewat proxy lean-api yang sama dgn Finance mapping.
import { useEffect, useRef, useState } from 'react'
import { Lock, Search } from 'lucide-react'
import { CostAgentModal } from '../../../components/CostAgentUi'
import { LoadingState } from '../../../components/LoadingState'
import { Chip, SA_BTN_OUTLINE, SA_INPUT } from '../../../components/SeaAirAuditUi'
import type { AccountMapRow, AscendAccount } from '../../../utils/CostAgentAccountMapLogic'
import { ascendErrorText } from './ascendApi'
import { accountMapSave, searchAscendAccounts } from './accountMapApi'
import { ErrorBox, TD, TH, useDebounced } from './hubUi'

export default function ChooseAccountDialog({ row, database, onClose, onSaved, toast }: {
  row: AccountMapRow
  database: string // database Ascend dari server (kolom ascend_db)
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, tone?: 'ok' | 'warn' | 'err') => void
}) {
  const [term, setTerm] = useState(row.gl_account || '')
  const q = useDebounced(term, 400)
  const [rows, setRows] = useState<AscendAccount[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const my = ++seq.current
    setLoading(true); setError(null)
    searchAscendAccounts(database, q)
      .then(list => { if (my === seq.current) setRows(list) })
      .catch(e => { if (my === seq.current) { setRows(null); setError(ascendErrorText(e)) } })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [database, q, tick])

  const choose = async (a: AscendAccount) => {
    setSavingId(a.id); setSaveError(null)
    try {
      const r = await accountMapSave(row.cost_item_id, row.company_code, a)
      if (!r.saved) { setSaveError('The mapping was not saved.'); return }
      toast('Account mapping saved.')
      onSaved()
    } catch (e: any) {
      setSaveError(e?.message || String(e)); toast(e?.message || String(e), 'err')
    } finally { setSavingId(null) }
  }

  return (
    <CostAgentModal title="Choose account" z="z-[85]" maxWidth="max-w-3xl" onClose={() => { if (savingId === null) onClose() }}
      subtitle={<>Ascend account for <b>{row.name}</b>{` · ${row.company_code}`}{row.gl_account ? <> · default account <b>{row.gl_account}</b></> : null}</>}
      footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={savingId !== null}>Cancel</button>}>
      <div className="p-4 space-y-3" data-choose-account>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
            <input className={`${SA_INPUT} pl-8`} value={term} onChange={e => setTerm(e.target.value)} autoFocus placeholder="Account code or name" aria-label="Search Ascend accounts" />
          </div>
          <Chip tone="plum">{database}</Chip>
        </div>

        {error && <ErrorBox message={error} onRetry={() => setTick(t => t + 1)} />}
        {saveError && <ErrorBox message={saveError} />}

        <div className="rounded-xl border border-[#EADFD6] overflow-hidden">
          <div className="max-h-[48vh] overflow-auto">
            <table className="min-w-full">
              <thead className="sticky top-0"><tr><th className={TH}>Account code</th><th className={TH}>Account name</th><th className={TH} /></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={3}><LoadingState fullHeight={false} /></td></tr>}
                {!loading && !error && rows?.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No active Ascend accounts match “{q.trim()}”.</td></tr>}
                {!loading && !error && rows?.map(a => (
                  <tr key={a.id} className="border-t border-[#F3EEEA] hover:bg-[#FBF7F4]">
                    <td className={`${TD} font-mono font-semibold whitespace-nowrap`}>{a.code}</td>
                    <td className={TD}>{a.name || '—'}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} disabled={savingId !== null} onClick={() => choose(a)}>
                        {savingId === a.id ? 'Saving…' : <><Lock size={11} /> Select</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11.5px] text-[#6E5E70]">Only active accounts are listed (at most 50). Your choice is saved as <b>Manual</b> (locked): Auto-map will not overwrite it.</p>
      </div>
    </CostAgentModal>
  )
}
