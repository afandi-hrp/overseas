// Tabel baris biaya invoice + sub-baris history acuan (2026-10-13, Prompt 3). Data dari fn_cost_agent_get_invoice_history
// (maks 2 history per baris: same_vessel_port -> nearest_dwt -> nearest_port). Aksi (hanya status verification/rejected &
// canEdit('cost_agent_invoice')): ganti cost item / centang Verified / "Use as reference" / remark -> fn_cost_agent_verify_line
// (p_learn_alias true saat memilih/verifikasi cost item -> server belajar alias deskripsi vendor); "Add as new cost item" ->
// fn_cost_agent_add_cost_item lalu verify_line(id baru). Setiap perubahan -> parent memuat ulang (flag compare dihitung server).
import React, { useMemo, useState } from 'react'
import { Plus, CheckCheck, AlertTriangle } from 'lucide-react'
import { CompareFlagChip, MatchLevelLabel, CostAgentModal, FieldLabel } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import {
  costAgentVerifyLine, costAgentAddCostItem, fmtMoney, fmtNumber, fmtPct, fmtDate, COMPARE_FLAG_META,
  type CostAgentInvoiceLine, type CostAgentCostItem, type CostAgentCompareFlag,
} from '../utils/CostAgentHelpers'

const TH = 'px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
const TD = 'px-2 py-1.5 text-[12.5px] text-[#3B1B3D] align-top'
const CATEGORIES = ['PORT', 'AGENCY', 'CREW', 'DOCUMENT', 'WATER', 'ADMIN', 'TAX', 'OTHER']

export default function CostAgentInvoiceLines({ lines, currency, costItems, editable, actor, onChanged, toolbarLeft }: {
  lines: CostAgentInvoiceLine[]
  currency: string
  costItems: CostAgentCostItem[]
  editable: boolean
  actor: string | null
  onChanged: () => Promise<void> | void
  toolbarLeft?: React.ReactNode // mis. tombol Show/Hide file dari modal review (hemat 1 baris di laptop 14")
}) {
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remarks, setRemarks] = useState<Record<number, string>>({})
  const [addFor, setAddFor] = useState<CostAgentInvoiceLine | null>(null)

  const items = useMemo(() => costItems.filter(c => c.is_active !== false), [costItems])
  const itemsByCat = useMemo(() => {
    const m = new Map<string, CostAgentCostItem[]>()
    items.forEach(c => { const k = c.category || 'OTHER'; m.set(k, [...(m.get(k) || []), c]) })
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const run = async (key: number | 'all', fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); await onChanged() } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(null) }
  }
  const verify = (l: CostAgentInvoiceLine, patch: { costItemId?: number | null; isVerified?: boolean; includeInHistory?: boolean; remark?: string | null; learnAlias?: boolean }) =>
    costAgentVerifyLine({
      lineId: l.id,
      costItemId: patch.costItemId !== undefined ? patch.costItemId : l.cost_item_id,
      isVerified: patch.isVerified ?? l.is_verified,
      includeInHistory: patch.includeInHistory ?? l.include_in_history,
      remark: patch.remark ?? null,
      learnAlias: patch.learnAlias ?? false,
      actor,
    })

  const matching = lines.filter(l => l.compare_flag === 'sesuai' && !l.is_verified && l.cost_item_id)
  const verifyAllMatching = () => run('all', async () => {
    for (const l of matching) await verify(l, { isVerified: true, learnAlias: true })
  })

  // Footer: jumlah & total per flag.
  const byFlag = useMemo(() => {
    const m = new Map<string, { n: number; amount: number }>()
    lines.forEach(l => { const k = l.compare_flag || 'none'; const cur = m.get(k) || { n: 0, amount: 0 }; m.set(k, { n: cur.n + 1, amount: cur.amount + Number(l.amount || 0) }) })
    return [...m.entries()]
  }, [lines])
  const unverified = lines.filter(l => !l.is_verified).length

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
        <div className="text-[12.5px] text-[#3B1B3D] flex items-center gap-3">{toolbarLeft}<span><b>{lines.length}</b> line{lines.length === 1 ? '' : 's'} · <span className={unverified ? 'text-[#7A4F00] font-semibold' : 'text-[#17663D] font-semibold'}>{unverified ? `${unverified} not verified` : 'all verified'}</span></span></div>
        {editable && (
          <button type="button" className={SA_BTN_OUTLINE} disabled={!matching.length || busy !== null} onClick={verifyAllMatching}
            title="Verify every line whose amount is in line with history">
            <CheckCheck size={13} /> {busy === 'all' ? 'Verifying…' : `Verify all matching (${matching.length})`}
          </button>
        )}
      </div>
      {error && <div className="mx-3 mt-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-1.5 text-[12px] text-[#A8231A] flex items-start gap-1.5 shrink-0"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={TH}>No</th><th className={TH}>Description</th><th className={TH}>Cost item</th>
              <th className={`${TH} text-right`} title="Amount (qty × price below)">Amount</th><th className={TH}>Compare</th>
              <th className={TH}>Remark</th><th className={`${TH} text-center`} title="Use as cost reference after approval">Ref</th><th className={`${TH} text-center`}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No cost lines.</td></tr>}
            {lines.map(l => {
              const rowBusy = busy === l.id || busy === 'all'
              const newItem = !l.cost_item_id || l.compare_flag === 'item_baru'
              const remarkVal = remarks[l.id] ?? (l.remark || '')
              return (
                <React.Fragment key={l.id}>
                  <tr className={`border-t border-[#F3EEEA] ${l.compare_flag === 'naik' ? 'bg-[#FFF6F4]' : newItem ? 'bg-[#FFFBF0]' : ''} ${rowBusy ? 'opacity-60' : ''}`}>
                    <td className={`${TD} tabular-nums`}>{l.line_no}</td>
                    <td className={`${TD} min-w-[170px]`}>{l.description_raw}</td>
                    <td className={`${TD} min-w-[170px] max-w-[240px]`}>
                      {editable ? (
                        <select className={`${SA_INPUT} h-8 text-[12px] pr-6`} value={l.cost_item_id ?? ''} disabled={rowBusy}
                          onChange={e => run(l.id, () => verify(l, { costItemId: e.target.value ? Number(e.target.value) : null, learnAlias: !!e.target.value }))}>
                          <option value="">— not mapped —</option>
                          {itemsByCat.map(([cat, list]) => (
                            <optgroup key={cat} label={cat}>{list.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</optgroup>
                          ))}
                        </select>
                      ) : (
                        <span>{l.cost_item_code ? `${l.cost_item_code} — ${l.cost_item_name}` : '—'}</span>
                      )}
                      {newItem && (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-[#7A4F00]">Not in cost master yet</span>
                          {editable && <button type="button" className="text-[11px] font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-0.5" onClick={() => setAddFor(l)}><Plus size={11} /> Add as new cost item</button>}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                      <div className="font-semibold">{fmtMoney(l.amount, currency)}</div>
                      {(l.qty != null || l.unit_price != null) && <div className="text-[11px] text-[#8A7A8B]">{fmtNumber(l.qty, 3)}{l.unit ? ` ${l.unit}` : ''} × {fmtNumber(l.unit_price)}</div>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}><CompareFlagChip flag={l.compare_flag} diffPct={l.compare_diff_pct} /></td>
                    <td className={`${TD} min-w-[120px]`}>
                      {editable ? (
                        <input className={`${SA_INPUT} h-8 text-[12px]`} value={remarkVal} disabled={rowBusy} placeholder="—"
                          onChange={e => setRemarks(p => ({ ...p, [l.id]: e.target.value }))}
                          onBlur={() => { const v = remarkVal.trim(); if (v && v !== (l.remark || '')) run(l.id, () => verify(l, { remark: v })) }} />
                      ) : <span className="text-[#6E5E70]">{l.remark || '—'}</span>}
                    </td>
                    <td className={`${TD} text-center`}>
                      <input type="checkbox" aria-label="Use as reference" checked={l.include_in_history} disabled={!editable || rowBusy}
                        onChange={() => run(l.id, () => verify(l, { includeInHistory: !l.include_in_history }))} className="w-4 h-4 accent-[#6B3470]" />
                    </td>
                    <td className={`${TD} text-center`}>
                      <input type="checkbox" aria-label="Verified" checked={l.is_verified} disabled={!editable || rowBusy}
                        title={l.verified_by ? `By ${l.verified_by}` : undefined}
                        onChange={() => run(l.id, () => verify(l, { isVerified: !l.is_verified, learnAlias: !l.is_verified && !!l.cost_item_id }))} className="w-4 h-4 accent-[#17663D]" />
                    </td>
                  </tr>
                  {(l.history || []).map((h, i) => {
                    const diff = Number(l.amount || 0) - Number(h.amount || 0)
                    const pct = h.amount ? (diff / Math.abs(Number(h.amount))) * 100 : null
                    return (
                      <tr key={`${l.id}-h${i}`} className="bg-[#FCFAF8]">
                        <td className={`${TD} py-1`} />
                        {/* 1 baris (laptop 14"): max-w-0 = sel tidak melebarkan kolom, teks dipotong "…", lengkap di tooltip. */}
                        <td className={`${TD} py-1 text-[11.5px] max-w-0`} colSpan={2}
                          title={`${fmtDate(h.service_date)} · ${h.invoice_no || '—'}${h.voyage_no ? ` · Voy ${h.voyage_no}` : ''} · ${h.vessel_name || '—'}${h.vessel_dwt ? ` (DWT ${fmtNumber(h.vessel_dwt, 0)})` : ''} · ${h.port_code || '—'} · ${h.vendor_name || '—'}`}>
                          <div className="flex items-center gap-2 pl-3 border-l-2 border-[#EADFD6] min-w-0">
                            <span className="shrink-0"><MatchLevelLabel level={h.match_level} dwtDiff={h.dwt_diff} distanceKm={h.distance_km} /></span>
                            <span className="text-[#6E5E70] truncate min-w-0">
                              {fmtDate(h.service_date)} · {h.invoice_no || '—'}{h.voyage_no ? ` · Voy ${h.voyage_no}` : ''} · {h.vessel_name || '—'}{h.vessel_dwt ? ` (DWT ${fmtNumber(h.vessel_dwt, 0)})` : ''} · {h.port_code || '—'} · {h.vendor_name || '—'}
                            </span>
                          </div>
                        </td>
                        <td className={`${TD} py-1 text-right tabular-nums text-[11.5px] text-[#6E5E70] whitespace-nowrap`}>{fmtMoney(h.amount, currency)}</td>
                        <td className={`${TD} py-1 text-[11.5px] whitespace-nowrap tabular-nums ${diff > 0 ? 'text-[#A8231A]' : diff < 0 ? 'text-[#2F4FA8]' : 'text-[#6E5E70]'}`} colSpan={4}>
                          Δ {diff > 0 ? '+' : ''}{fmtMoney(diff, currency)}{pct !== null ? ` (${fmtPct(pct)})` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {byFlag.length > 0 && (
        <div className="px-3 py-2 border-t border-[#EADFD6] bg-[#FBF7F4] flex flex-wrap gap-x-4 gap-y-1 text-[12px] shrink-0">
          {byFlag.map(([k, v]) => (
            <span key={k} className="text-[#3B1B3D]">
              {COMPARE_FLAG_META[k as CostAgentCompareFlag]?.label || 'Not compared'}: <b className="tabular-nums">{v.n}</b> · <span className="tabular-nums">{fmtMoney(v.amount, currency)}</span>
            </span>
          ))}
        </div>
      )}
      {addFor && <AddCostItemModal line={addFor} actor={actor} onClose={() => setAddFor(null)} onAdded={async id => {
        const l = addFor
        setAddFor(null)
        await run(l.id, () => verify(l, { costItemId: id, isVerified: true, learnAlias: true }))
      }} />}
    </div>
  )
}

function AddCostItemModal({ line, actor, onClose, onAdded }: {
  line: CostAgentInvoiceLine; actor: string | null; onClose: () => void; onAdded: (id: number) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState(line.description_raw.slice(0, 80))
  const [category, setCategory] = useState('PORT')
  const [gl, setGl] = useState('')
  const [keywords, setKeywords] = useState(line.description_raw.toUpperCase().slice(0, 60))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!code.trim() || !name.trim()) { setError('Code and name are required.'); return }
    setBusy(true); setError(null)
    try {
      const id = await costAgentAddCostItem({
        code: code.trim(), name: name.trim(), category, glAccount: gl.trim() || null,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), actor,
      })
      onAdded(Number(id))
    } catch (e: any) {
      setError(e.message || String(e)); setBusy(false)
    }
  }

  return (
    <CostAgentModal z="z-[80]" maxWidth="max-w-lg" onClose={() => { if (!busy) onClose() }} title="Add new cost item"
      subtitle={<>From line: <i>{line.description_raw}</i></>}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add & use for this line'}</button>
      </>}>
      <div className="p-5 grid grid-cols-2 gap-3">
        <div><FieldLabel required hint="e.g. PORT_CLEARANCE">Code</FieldLabel><input className={SA_INPUT} value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></div>
        <div>
          <FieldLabel>Category</FieldLabel>
          <select className={SA_INPUT} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div className="col-span-2"><FieldLabel required>Name</FieldLabel><input className={SA_INPUT} value={name} onChange={e => setName(e.target.value)} /></div>
        <div><FieldLabel>GL account</FieldLabel><input className={SA_INPUT} value={gl} onChange={e => setGl(e.target.value)} placeholder="e.g. 61050" /></div>
        <div><FieldLabel hint="comma separated">Keywords</FieldLabel><input className={SA_INPUT} value={keywords} onChange={e => setKeywords(e.target.value)} /></div>
        {error && <div className="col-span-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
