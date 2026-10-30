// Dialog "Map vessels / vendors to Ascend" (2026-10-30) di tab Vessels & Vendors: cari padanan SEMUA master aktif yang belum terpetakan ke master Ascend,
// lalu tampilkan hasilnya utk di-REVIEW dulu -- TIDAK ada yang disimpan sebelum user menekan Save. Yang disimpan = baris yang dicentang, sebagai
// Manual (source 'user', terkunci) ke cost_agent_finance_{vessel,supplier}_map lewat fn_cost_agent_finance_save_map. Alur pencarian sama dgn Auto-map di
// Finance mapping: candidatesForMaster -> fn_cost_agent_finance_pick (auto / ambiguous / none). Hanya baris 'auto' dicentang otomatis;
// 'ambiguous' harus dipilih user dari daftar kandidat, 'none' dilewati.
//  - vessel: sumber tabel cost_agent_vessels (semua PT; database Ascend per PT).
//  - supplier: sumber cost_agent_vendors (fn_cost_agent_list_vendors, ikut alias), dicari HANYA di AS_MJS (keputusan user), disimpan dgn PT MJS.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import { CostAgentModal } from '../../../components/CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY } from '../../../components/SeaAirAuditUi'
import { fetchCostAgentVessels } from '../../../utils/CostAgentHelpers'
import { ASCEND_DATABASES, ascendErrorText, candidatesForMaster, type AscendCandidate } from './ascendApi'
import { AUTO_CONCURRENCY, finListMap, finPick, finSaveMap, type FinKind, type FinVesselRow } from './financeApi'
import { hubListCompanies, hubListVendors } from './hubApi'
import { ErrorBox, TD, TH } from './hubUi'

export type ReviewKind = Extract<FinKind, 'vessel' | 'supplier'>

const SUPPLIER_DB = 'AS_MJS'
const SUPPLIER_COMPANY = 'MJS' // PT pemilik database AS_MJS; dicek ada di cost_agent_companies sebelum dipakai

type Decision = 'auto' | 'ambiguous' | 'none' | 'error'
interface VRow { ref_id: number; company_code: string; name: string; npwp?: string | null; aliases?: string[]; ascend_db: string }
interface Collected { rows: VRow[]; skipped: number }
interface ReviewRow {
  key: string
  row: VRow
  decision: Decision
  matches: AscendCandidate[]
  chosen: string // id kandidat terpilih ('' = belum)
  checked: boolean
  error?: string
}
type Phase = 'scanning' | 'review' | 'saving' | 'done'
type Filter = 'all' | 'auto' | 'ambiguous' | 'none'

const rowKey = (r: { ref_id: number; company_code: string }) => `${r.ref_id}|${r.company_code}`

// Semua baris list_map (status all, semua PT), per halaman 500: dipakai utk membuang yang sudah terpetakan & mengetahui ascend_db per PT.
async function allMapRows<K extends ReviewKind>(kind: K) {
  const out: (K extends 'vessel' ? FinVesselRow : { company_code: string; ascend_db: string | null; mapped: boolean; vendor_id: number })[] = []
  for (let off = 0; off < 10000; off += 500) {
    const r = await finListMap(kind, { company: null, status: 'all', limit: 500, offset: off })
    out.push(...(r.rows as any[]))
    if (out.length >= r.total || r.rows.length === 0) break
  }
  return out as any[]
}

// Vessel: SEMUA kapal aktif di cost_agent_vessels (bukan hanya yang dipakai invoice). Database Ascend per PT = ascend_db dari server (baris list_map);
// PT tanpa baris memakai "AS_<kode PT>" HANYA bila ada di ASCEND_DATABASES. Kapal tanpa PT dilewati.
async function collectVessels(): Promise<Collected> {
  const [vessels, mapRows] = await Promise.all([fetchCostAgentVessels(), allMapRows('vessel')])
  const mapped = new Set<string>(mapRows.filter(r => r.mapped).map(r => rowKey({ ref_id: r.vessel_id, company_code: r.company_code })))
  const dbOf = new Map<string, string>()
  for (const r of mapRows) if (r.ascend_db) dbOf.set(r.company_code, r.ascend_db)
  const known = new Set<string>(ASCEND_DATABASES)
  const rows: VRow[] = []
  let skipped = 0
  for (const v of vessels) {
    if (v.is_active === false) continue
    if (!v.company_code) { skipped++; continue }
    if (mapped.has(rowKey({ ref_id: v.id, company_code: v.company_code }))) continue
    const db = dbOf.get(v.company_code) ?? (known.has(`AS_${v.company_code}`) ? `AS_${v.company_code}` : '')
    if (!db) { skipped++; continue }
    rows.push({ ref_id: v.id, company_code: v.company_code, name: v.name, ascend_db: db })
  }
  return { rows, skipped }
}

// Supplier: semua vendor aktif yang belum punya pemetaan di PT mana pun; satu baris per vendor, dicari di AS_MJS.
async function collectVendors(): Promise<Collected> {
  const companies = await hubListCompanies()
  if (!companies.rows.some(c => c.code === SUPPLIER_COMPANY)) throw new Error(`Company ${SUPPLIER_COMPANY} (Ascend database ${SUPPLIER_DB}) is not in the Companies master.`)
  const vendors: Awaited<ReturnType<typeof hubListVendors>>['rows'] = []
  for (let off = 0; off < 5000; off += 500) {
    const r = await hubListVendors({ active: true, limit: 500, offset: off })
    vendors.push(...r.rows)
    if (vendors.length >= r.total || r.rows.length === 0) break
  }
  const mapped = new Set<number>((await allMapRows('supplier')).filter(r => r.mapped).map(r => r.vendor_id))
  const rows: VRow[] = vendors.filter(v => v.is_active && !mapped.has(v.id))
    .map(v => ({ ref_id: v.id, company_code: SUPPLIER_COMPANY, name: v.name, npwp: v.npwp, aliases: v.aliases ?? [], ascend_db: SUPPLIER_DB }))
  return { rows, skipped: 0 }
}

const COPY: Record<ReviewKind, { noun: string; nounPl: string; title: string; ascend: string }> = {
  vessel: { noun: 'vessel', nounPl: 'vessels', title: 'Map vessels to Ascend', ascend: 'Ascend vessel' },
  supplier: { noun: 'vendor', nounPl: 'vendors', title: 'Map vendors to Ascend', ascend: 'Ascend supplier' },
}

export default function AscendReviewModal({ kind, onClose, onSaved, toast }: {
  kind: ReviewKind
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, tone?: 'ok' | 'warn' | 'err') => void
}) {
  const copy = COPY[kind]
  const [phase, setPhase] = useState<Phase>('scanning')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [items, setItems] = useState<ReviewRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [summary, setSummary] = useState<{ saved: number; locked: number; failed: number; firstError: string | null } | null>(null)
  const stopRef = useRef(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return // StrictMode memanggil effect dua kali
    startedRef.current = true
    ;(async () => {
      try {
        const found = await (kind === 'vessel' ? collectVessels() : collectVendors())
        const todo = found.rows
        setSkipped(found.skipped)
        setProgress({ done: 0, total: todo.length })
        const result: ReviewRow[] = []
        let next = 0
        let done = 0
        const worker = async () => {
          while (!stopRef.current) {
            const i = next++
            if (i >= todo.length) return
            const r = todo[i]
            let item: ReviewRow
            try {
              const cands = await candidatesForMaster(kind, r.ascend_db, { name: r.name, npwp: r.npwp, aliases: r.aliases })
              if (cands.length === 0) item = { key: rowKey(r), row: r, decision: 'none', matches: [], chosen: '', checked: false }
              else {
                const p = await finPick(kind, r.ref_id, cands)
                const matches = p.decision === 'auto' && p.match ? [p.match] : p.matches?.length ? p.matches : p.decision === 'none' ? [] : cands
                if (p.decision === 'auto' && p.match) item = { key: rowKey(r), row: r, decision: 'auto', matches, chosen: String(p.match.id), checked: true }
                else item = { key: rowKey(r), row: r, decision: matches.length ? 'ambiguous' : 'none', matches, chosen: '', checked: false }
              }
            } catch (e: any) {
              item = { key: rowKey(r), row: r, decision: 'error', matches: [], chosen: '', checked: false, error: ascendErrorText(e) }
            }
            result.push(item)
            setProgress({ done: ++done, total: todo.length })
          }
        }
        await Promise.all(Array.from({ length: Math.min(AUTO_CONCURRENCY, todo.length) }, worker))
        const order: Record<Decision, number> = { auto: 0, ambiguous: 1, none: 2, error: 3 }
        result.sort((a, b) => order[a.decision] - order[b.decision] || a.row.company_code.localeCompare(b.row.company_code) || a.row.name.localeCompare(b.row.name))
        setItems(result)
        setPhase('review')
      } catch (e: any) {
        setError(e?.message || String(e)); setPhase('review')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (key: string, p: Partial<ReviewRow>) => setItems(list => list.map(x => (x.key === key ? { ...x, ...p } : x)))
  const counts = useMemo(() => ({
    auto: items.filter(x => x.decision === 'auto').length,
    ambiguous: items.filter(x => x.decision === 'ambiguous').length,
    none: items.filter(x => x.decision === 'none' || x.decision === 'error').length,
  }), [items])
  const shown = items.filter(x => filter === 'all' || (filter === 'none' ? x.decision === 'none' || x.decision === 'error' : x.decision === filter))
  const toSave = items.filter(x => x.checked && x.chosen)

  const save = async () => {
    setPhase('saving')
    const sum = { saved: 0, locked: 0, failed: 0, firstError: null as string | null }
    let next = 0
    let done = 0
    setProgress({ done: 0, total: toSave.length })
    const worker = async () => {
      for (;;) {
        const i = next++
        if (i >= toSave.length) return
        const it = toSave[i]
        const cand = it.matches.find(m => String(m.id) === it.chosen)
        try {
          if (!cand) throw new Error('Candidate not found')
          const r = await finSaveMap(kind, it.row.ref_id, it.row.company_code, cand, 'user')
          if (r.saved) sum.saved++
          else if (r.reason === 'locked') sum.locked++
          else sum.failed++
        } catch (e: any) {
          sum.failed++
          if (!sum.firstError) sum.firstError = e?.message || String(e)
        }
        setProgress({ done: ++done, total: toSave.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(AUTO_CONCURRENCY, toSave.length) }, worker))
    setSummary(sum); setPhase('done')
    toast(`${sum.saved} ${copy.noun} mapping${sum.saved === 1 ? '' : 's'} saved${sum.locked ? `, ${sum.locked} already manual` : ''}${sum.failed ? `, ${sum.failed} failed` : ''}.`, sum.failed ? 'warn' : 'ok')
    if (sum.saved) onSaved()
  }

  const busy = phase === 'saving'
  const close = () => { stopRef.current = true; if (!busy) onClose() }
  const cand = (c: AscendCandidate) => [c.code, c.name].filter(Boolean).join(' - ') + (c.fleet ? ` (${c.fleet})` : '') + (c.npwp ? ` · ${c.npwp}` : '')

  const footer = phase === 'scanning' ? (
    <><span className="mr-auto text-[12px] text-[#6E5E70] tabular-nums" role="status">Searching Ascend {progress.done}/{progress.total || '…'}</span>
      <button type="button" className={SA_BTN_OUTLINE} onClick={() => { stopRef.current = true }}><Square size={12} /> Stop</button></>
  ) : phase === 'saving' ? (
    <span className="mr-auto text-[12px] text-[#6E5E70] tabular-nums" role="status">Saving {progress.done}/{progress.total}…</span>
  ) : phase === 'done' ? (
    <button type="button" className={SA_BTN_PRIMARY} onClick={onClose}>Close</button>
  ) : (
    <>
      <span className="mr-auto text-[12px] text-[#6E5E70]">{toSave.length} selected</span>
      <button type="button" className={SA_BTN_OUTLINE} onClick={onClose}>Cancel</button>
      <button type="button" className={SA_BTN_PRIMARY} disabled={toSave.length === 0} onClick={save}>Save {toSave.length} mapping{toSave.length === 1 ? '' : 's'}</button>
    </>
  )

  const cols = kind === 'supplier' ? 5 : 5
  return (
    <CostAgentModal title={copy.title} z="z-[85]" maxWidth="max-w-5xl" onClose={close}
      subtitle={`Review the matches first. Nothing is saved until you press Save; saved mappings are Manual (locked).${kind === 'supplier' ? ` Vendors are searched in ${SUPPLIER_DB} only.` : ''}`}
      footer={<div className="flex items-center gap-2 w-full">{footer}</div>}>
      <div className="p-4 space-y-3" data-ascend-review={kind}>
        {error && <ErrorBox message={error} />}
        {phase === 'scanning' && <p className="text-sm text-[#6E5E70]">{progress.total ? `Searching Ascend for ${copy.nounPl} that are not mapped yet…` : `Loading ${copy.nounPl} that are not mapped yet…`}</p>}
        {(phase === 'review' || phase === 'saving') && !error && (
          <>
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              {([['all', `All ${items.length}`], ['auto', `Match ${counts.auto}`], ['ambiguous', `Choose ${counts.ambiguous}`], ['none', `No match ${counts.none}`]] as [Filter, string][]).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                  className={`h-7 px-2.5 rounded-lg font-semibold ${filter === k ? 'bg-[#6B3470] text-white' : 'border border-[#EADFD6] text-[#6E5E70] hover:bg-[#F5EDF3]'}`}>{label}</button>
              ))}
              {skipped > 0 && <span className="text-[#8A6A00]">{skipped} {skipped === 1 ? copy.noun : copy.nounPl} skipped: no company or no Ascend database</span>}
              <span className="ml-auto flex gap-2">
                <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} disabled={busy} onClick={() => setItems(l => l.map(x => (x.decision === 'auto' ? { ...x, checked: true } : x)))}>Select all matches</button>
                <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} disabled={busy} onClick={() => setItems(l => l.map(x => ({ ...x, checked: false })))}>Clear</button>
              </span>
            </div>
            <div className="rounded-xl border border-[#EADFD6] overflow-hidden">
              <div className="max-h-[55vh] overflow-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10"><tr>
                    <th className={`${TH} w-8`} /><th className={TH}>{kind === 'supplier' ? 'Vendor' : 'Vessel'}</th><th className={TH}>{kind === 'supplier' ? 'NPWP' : 'PT'}</th><th className={TH}>{copy.ascend}</th><th className={TH}>Result</th>
                  </tr></thead>
                  <tbody>
                    {shown.length === 0 && <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">{items.length === 0 ? `All ${copy.nounPl} are already mapped.` : 'No rows in this filter.'}</td></tr>}
                    {shown.map(x => (
                      <tr key={x.key} className="border-t border-[#F3EEEA]">
                        <td className={TD}><input type="checkbox" className="accent-[#6B3470]" aria-label={`Select ${x.row.name}`} checked={x.checked} disabled={busy || !x.chosen}
                          onChange={e => patch(x.key, { checked: e.target.checked })} /></td>
                        <td className={`${TD} font-semibold`}>{x.row.name}</td>
                        <td className={`${TD} ${kind === 'supplier' ? 'tabular-nums' : 'font-mono'}`}>{kind === 'supplier' ? (x.row.npwp || '—') : x.row.company_code}</td>
                        <td className={TD}>
                          {x.decision === 'auto' && <span>{cand(x.matches[0])}</span>}
                          {x.decision === 'ambiguous' && (
                            <select aria-label={`${copy.ascend} for ${x.row.name}`} className="h-8 max-w-[360px] rounded-lg border border-[#EADFD6] bg-white px-2 text-[12.5px]" value={x.chosen} disabled={busy}
                              onChange={e => patch(x.key, { chosen: e.target.value, checked: !!e.target.value })}>
                              <option value="">Choose…</option>
                              {x.matches.map(m => <option key={String(m.id)} value={String(m.id)}>{cand(m)}</option>)}
                            </select>
                          )}
                          {(x.decision === 'none' || x.decision === 'error') && <span className="text-[#8A7A8B]">—</span>}
                        </td>
                        <td className={TD}>
                          {x.decision === 'auto' && <Chip tone="green">Match</Chip>}
                          {x.decision === 'ambiguous' && <Chip tone="amber">{x.matches.length} candidates</Chip>}
                          {x.decision === 'none' && <Chip tone="grey">No match</Chip>}
                          {x.decision === 'error' && <span className="text-[12px] text-red-700">{x.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11.5px] text-[#6E5E70]">Rows with several candidates need your choice; rows without a match can be mapped one by one from the Finance mapping tab.</p>
          </>
        )}
        {phase === 'done' && summary && (
          <div className="space-y-2 text-sm text-[#3B1B3D]">
            <p><b>{summary.saved}</b> mapping{summary.saved === 1 ? '' : 's'} saved{summary.locked ? `, ${summary.locked} skipped (already Manual)` : ''}{summary.failed ? `, ${summary.failed} failed` : ''}.</p>
            {summary.firstError && <ErrorBox message={summary.firstError} />}
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
