// Dialog "Map to Ascend" (2026-10-28): cari kandidat di database Ascend baris itu, pilih satu -> fn_cost_agent_finance_save_map(..., 'user') (terkunci).
// Dipakai tab Finance mapping (Settings) dan kartu Finance mapping (detail invoice). Hanya kolom yang perlu ditampilkan (kode, nama, NPWP /
// deskripsi, nama akun); kolom bank/rekening/alamat tidak pernah diminta (lihat ascendApi.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Search } from 'lucide-react'
import { CostAgentModal } from '../../../components/CostAgentUi'
import { LoadingState } from '../../../components/LoadingState'
import { Chip, SA_BTN_OUTLINE, SA_INPUT } from '../../../components/SeaAirAuditUi'
import { ascendErrorText, candidatesForMaster, searchAscend, stripVesselPrefix, type AscendCandidate, type AscendKind } from './ascendApi'
import { finSaveMap } from './financeApi'
import { ErrorBox, TD, TH, useDebounced } from './hubUi'

export interface MapTarget {
  kind: AscendKind
  refId: number
  company: string // PT (ID di Ascend berbeda per database, termasuk expense type)
  label: string // nama di master kita
  npwp?: string | null
  alias?: string | null
}

const KIND_TITLE: Record<AscendKind, string> = { supplier: 'supplier', vessel: 'vessel', expense: 'expense type' }

// Isi awal kotak cari (hanya tampilan). Selama belum diubah user, pencarian memakai data master (NPWP + kata khas / nama kapal / alias lalu nama biaya).
function initialTerm(t: MapTarget): string {
  if (t.kind === 'vessel') return stripVesselPrefix(t.label)
  return t.alias || t.label
}

export default function MapToAscendDialog({ target, database, progress, onClose, onSaved, toast }: {
  target: MapTarget
  database: string // database Ascend dari server (kolom "Ascend DB")
  progress?: string // mis. "Item 2 of 3" saat dibuka berurutan dari kartu invoice (Cancel = lewati)
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, tone?: 'ok' | 'warn' | 'err') => void
}) {
  const db = database
  const initial = useMemo(() => initialTerm(target), [target])
  const [term, setTerm] = useState(initial)
  const q = useDebounced(term, 400)
  const [rows, setRows] = useState<AscendCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const seq = useRef(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const my = ++seq.current
    setLoading(true); setError(null)
    // Belum diubah user -> cari dari data master (hasil digabung); sudah diubah -> cari sesuai ketikan.
    const run = q === initial
      ? candidatesForMaster(target.kind, db, { name: target.label, npwp: target.npwp, alias: target.alias })
      : searchAscend(target.kind, db, q)
    run
      .then(list => { if (my === seq.current) setRows(list) })
      .catch(e => { if (my === seq.current) { setRows(null); setError(ascendErrorText(e)) } })
      .finally(() => { if (my === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.label, db, q, tick])

  const choose = async (c: AscendCandidate) => {
    setSavingId(String(c.id)); setSaveError(null)
    try {
      const r = await finSaveMap(target.kind, target.refId, target.company, c, 'user')
      if (!r.saved) { setSaveError('The mapping was not saved.'); return }
      toast('Mapping saved.')
      onSaved()
    } catch (e: any) {
      setSaveError(e?.message || String(e)); toast(e?.message || String(e), 'err')
    } finally { setSavingId(null) }
  }

  const cols = target.kind === 'supplier' ? ['Code', 'Name', 'NPWP'] : target.kind === 'vessel' ? ['Code', 'Name', 'Fleet'] : ['Description', 'Account name']
  return (
    <CostAgentModal title="Map to Ascend" z="z-[85]" maxWidth="max-w-3xl" onClose={() => { if (!savingId) onClose() }}
      subtitle={<>{progress ? <b>{progress} · </b> : null}Ascend {KIND_TITLE[target.kind]} for <b>{target.label}</b>{` · ${target.company}`}</>}
      footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={!!savingId}>{progress ? 'Skip' : 'Cancel'}</button>}>
      <div className="p-4 space-y-3" data-map-dialog>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
            <input className={`${SA_INPUT} pl-8`} value={term} onChange={e => setTerm(e.target.value)} autoFocus
              placeholder={target.kind === 'supplier' ? 'NPWP or supplier name' : target.kind === 'vessel' ? 'Vessel name' : 'Expense type description'} />
          </div>
          <Chip tone="plum">{db}</Chip>
        </div>

        {error && <ErrorBox message={error} onRetry={() => setTick(t => t + 1)} />}
        {saveError && <ErrorBox message={saveError} />}

        <div className="rounded-xl border border-[#EADFD6] overflow-hidden">
          <div className="max-h-[48vh] overflow-auto">
            <table className="min-w-full">
              <thead className="sticky top-0"><tr>{cols.map(c => <th key={c} className={TH}>{c}</th>)}<th className={TH} /></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={cols.length + 1}><LoadingState fullHeight={false} /></td></tr>}
                {!loading && !error && rows?.length === 0 && <tr><td colSpan={cols.length + 1} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No active Ascend records match “{q.trim()}”.</td></tr>}
                {!loading && !error && rows?.map(c => (
                  <tr key={String(c.id)} className="border-t border-[#F3EEEA] hover:bg-[#FBF7F4]">
                    {target.kind === 'supplier' && <><td className={`${TD} font-mono`}>{c.code || '—'}</td><td className={`${TD} font-semibold`}>{c.name || '—'}</td><td className={`${TD} tabular-nums`}>{c.npwp || '—'}</td></>}
                    {target.kind === 'vessel' && <><td className={`${TD} font-mono`}>{c.code || '—'}</td><td className={`${TD} font-semibold`}>{c.name || '—'}{c.is_vessel === false && <Chip tone="amber">Not a vessel</Chip>}</td><td className={TD}>{c.fleet || '—'}</td></>}
                    {target.kind === 'expense' && <><td className={`${TD} font-semibold`}>{c.description || '—'}</td><td className={TD}>{c.account_name || '—'}</td></>}
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} disabled={!!savingId} onClick={() => choose(c)}>
                        {savingId === String(c.id) ? 'Saving…' : <><Lock size={11} /> Select</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11.5px] text-[#6E5E70]">Your choice is saved as <b>Manual</b> (locked): Auto-map will not overwrite it.</p>
      </div>
    </CostAgentModal>
  )
}
