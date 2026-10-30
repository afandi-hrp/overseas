// Pemilih COA (AC_Accounts Ascend) untuk satu baris draft AP Note: cari kode / nama akun -> klik baris = pilih. Hanya baca ke Ascend lewat proxy lean
// (kolom aman saja, server/leanPolicy.ts). Penyimpanan ke draft dilakukan pemanggil (onPick).
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { CostAgentModal } from './CostAgentUi'
import { LoadingState } from './LoadingState'
import { SA_BTN_OUTLINE, SA_INPUT } from './SeaAirAuditUi'
import { ascendErrorText, searchAccounts, type AscendAccount } from '../pages/cost-agent/settings/ascendApi'
import { useDebounced } from '../pages/cost-agent/settings/hubUi'

export default function CostAgentCoaPicker({ database, title, current, onPick, onClose }: {
  database: string
  title: string // mis. 'Line 3 · Administrasi Nota'
  current: { id: number | null; code: string | null; name: string | null }
  onPick: (a: AscendAccount) => void
  onClose: () => void
}) {
  const [term, setTerm] = useState('')
  const q = useDebounced(term, 350)
  const [rows, setRows] = useState<AscendAccount[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const my = ++seq.current
    setLoading(true); setError(null)
    searchAccounts(database, q)
      .then(r => { if (my === seq.current) setRows(r) })
      .catch(e => { if (my === seq.current) { setRows(null); setError(ascendErrorText(e)) } })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [database, q, tick])

  return (
    <CostAgentModal title="Select COA" subtitle={`${title} · ${database}`} z="z-[90]" maxWidth="max-w-2xl" onClose={onClose}
      footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose}>Cancel</button>}>
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B]" />
          <input autoFocus className={`${SA_INPUT} pl-8`} placeholder="Search account code or name…" value={term} onChange={e => setTerm(e.target.value)} />
        </div>
        {current.id !== null && <p className="text-[12px] text-[#6E5E70]">Current: <b className="text-[#3B1B3D]">{[current.code, current.name].filter(Boolean).join(' - ')}</b></p>}
        {loading && <LoadingState fullHeight={false} />}
        {error && !loading && (
          <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-center gap-3" role="alert">
            <span className="min-w-0 flex-1">{error}</span><button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} onClick={() => setTick(t => t + 1)}>Retry</button>
          </div>
        )}
        {!loading && !error && rows && (
          <div className="rounded-xl border border-[#EADFD6] overflow-hidden max-h-[50vh] overflow-y-auto">
            {rows.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-[#6E5E70] italic">No active account found.</p>}
            {rows.map(a => (
              <button key={a.id} type="button" onClick={() => onPick(a)}
                className={`w-full text-left grid grid-cols-[140px_1fr] gap-3 px-3 py-2 border-t border-[#F3EEEA] first:border-t-0 text-[12.5px] hover:bg-[#F6EFF7] ${a.id === current.id ? 'bg-[#EFE3F0]' : ''}`}>
                <span className="font-semibold tabular-nums text-[#5A305A]">{a.code || '—'}</span>
                <span className="text-[#3B1B3D] [overflow-wrap:anywhere]">{a.name || '—'}</span>
              </button>
            ))}
          </div>
        )}
        {!loading && rows && rows.length >= 50 && <p className="text-[11.5px] text-[#6E5E70]">Showing the first 50 — refine your search to narrow down.</p>}
      </div>
    </CostAgentModal>
  )
}
