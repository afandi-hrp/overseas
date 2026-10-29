// Panel "Filter" daftar Agency Invoices v2 (Tahap 3a, 2026-10-28): filter berlevel (IF / AND ... semua kondisi harus cocok) + urut berlevel (SORT BY / THEN BY).
// Draft di dalam panel; "Apply" mengirim ke induk (-> query string URL), "Reset" mengosongkan. Satu field hanya boleh sekali (server memakai satu nilai per field).
// Nilai nominal diketik dengan pemisah ribuan (id-ID) dan dikirim angka murni.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ListFilter, Plus, Trash2 } from 'lucide-react'
import { CostAgentCombobox, FilterButton, type ComboOption } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, SA_LABEL } from './SeaAirAuditUi'
import {
  DEFAULT_SORT_DIR, RULE_ENUMS, RULE_FIELDS, SORT_FIELDS, type FilterRule, type RuleField, type SortField, type SortLevel,
} from '../utils/CostAgentInvoiceCards'

const SEL = `${SA_INPUT} !h-9`
const groupDigits = (digits: string) => (digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '')

export default function CostAgentInvoiceFilterPanel({ rules, sorts, showVoid, vendors, vessels, ports, onApply, onReset }: {
  rules: FilterRule[]
  sorts: SortLevel[]
  showVoid: boolean
  vendors: { id: number; name: string }[]
  vessels: { id: number; name: string }[]
  ports: { id: number; name: string; code?: string | null }[]
  onApply: (rules: FilterRule[], sorts: SortLevel[], showVoid: boolean) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [dRules, setDRules] = useState<FilterRule[]>(rules)
  const [dSorts, setDSorts] = useState<SortLevel[]>(sorts)
  const [dVoid, setDVoid] = useState(showVoid)
  const wrap = useRef<HTMLDivElement>(null)

  // Draft diisi ulang dari state aktif setiap panel dibuka.
  useEffect(() => { if (open) { setDRules(rules); setDSorts(sorts); setDVoid(showVoid) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const opts = useMemo<Record<string, ComboOption[]>>(() => ({
    vendor: vendors.map(v => ({ value: v.id, label: v.name })),
    vessel: vessels.map(v => ({ value: v.id, label: v.name })),
    port: ports.map(p => ({ value: p.id, label: p.code ? `${p.code} — ${p.name}` : p.name })),
  }), [vendors, vessels, ports])

  const usedR = new Set(dRules.map(r => r.f))
  const usedS = new Set(dSorts.map(s => s.f))
  const activeCount = rules.length + sorts.length + (showVoid ? 1 : 0)
  const setRule = (i: number, patch: Partial<FilterRule>) => setDRules(rs => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  const freeRule = RULE_FIELDS.find(f => !usedR.has(f.value))
  const freeSort = SORT_FIELDS.find(f => !usedS.has(f.value))

  const apply = () => {
    onApply(dRules.filter(r => r.v !== ''), dSorts, dVoid)
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <FilterButton icon={ListFilter} label="Filter" short="Filter" active={open || activeCount > 0} onClick={() => setOpen(o => !o)} title="Filter and sort the list">
        {activeCount > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6B3470] text-white text-[10.5px] flex items-center justify-center tabular-nums" data-filter-badge>{activeCount}</span>}
      </FilterButton>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-[620px] max-w-[92vw] max-h-[72vh] overflow-y-auto rounded-2xl border border-[#EADFD6] bg-white shadow-2xl p-4 space-y-4" role="dialog" aria-label="Filter and sort" data-filter-panel>
          <section>
            <div className={`${SA_LABEL} mb-2`}>Filter · all conditions must match</div>
            <div className="space-y-2">
              {dRules.length === 0 && <p className="text-[12px] text-[#8A7A8B] italic">No conditions.</p>}
              {dRules.map((r, i) => {
                const def = RULE_FIELDS.find(f => f.value === r.f)!
                return (
                  <div key={r.f} className="grid grid-cols-[34px_170px_minmax(0,1fr)_32px] items-center gap-2">
                    <span className="text-[10.5px] font-bold text-[#6B3470] text-right">{i === 0 ? 'IF' : 'AND'}</span>
                    <select className={SEL} value={r.f} aria-label="Field" onChange={e => setRule(i, { f: e.target.value as RuleField, v: '' })}>
                      {RULE_FIELDS.filter(f => f.value === r.f || !usedR.has(f.value)).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <div className="min-w-0">
                      {def.kind === 'master' && <CostAgentCombobox options={opts[r.f] ?? []} value={r.v ? Number(r.v) : null} allowClear={false} placeholder={`Choose ${def.label.toLowerCase()}`} onChange={v => setRule(i, { v: v === null ? '' : String(v) })} />}
                      {def.kind === 'enum' && (
                        <select className={SEL} value={r.v} aria-label="Value" onChange={e => setRule(i, { v: e.target.value })}>
                          <option value="">Choose…</option>
                          {(RULE_ENUMS[r.f] ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                      {def.kind === 'date' && <input type="date" className={SEL} value={r.v} aria-label={def.label} onChange={e => setRule(i, { v: e.target.value })} />}
                      {def.kind === 'amount' && <input className={`${SEL} text-right tabular-nums`} inputMode="numeric" value={groupDigits(r.v)} placeholder="0" aria-label={def.label}
                        onChange={e => setRule(i, { v: e.target.value.replace(/[^0-9]/g, '').slice(0, 15) })} />}
                    </div>
                    <button type="button" className="h-9 w-8 inline-flex items-center justify-center rounded-lg text-[#A8231A]/80 hover:bg-[#FDE7E4]" aria-label="Remove condition" onClick={() => setDRules(rs => rs.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
            <button type="button" className={`${SA_BTN_OUTLINE} mt-2`} disabled={!freeRule} onClick={() => freeRule && setDRules(rs => [...rs, { f: freeRule.value, v: '' }])}><Plus size={13} /> Add condition</button>
          </section>

          <section>
            <div className={`${SA_LABEL} mb-2`}>Sort · multi-level</div>
            <div className="space-y-2">
              {dSorts.length === 0 && <p className="text-[12px] text-[#8A7A8B] italic">Default: newest invoice date first.</p>}
              {dSorts.map((s, i) => {
                const def = SORT_FIELDS.find(f => f.value === s.f)!
                return (
                  <div key={s.f} className="grid grid-cols-[64px_170px_minmax(0,1fr)_32px] items-center gap-2">
                    <span className="text-[10.5px] font-bold text-[#6B3470] text-right">{i === 0 ? 'SORT BY' : 'THEN BY'}</span>
                    <select className={SEL} value={s.f} aria-label="Sort field" onChange={e => { const f = e.target.value as SortField; setDSorts(ss => ss.map((x, n) => (n === i ? { f, dir: DEFAULT_SORT_DIR[f] } : x))) }}>
                      {SORT_FIELDS.filter(f => f.value === s.f || !usedS.has(f.value)).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select className={SEL} value={s.dir} aria-label="Direction" onChange={e => setDSorts(ss => ss.map((x, n) => (n === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}>
                      <option value="desc">{def.desc}</option><option value="asc">{def.asc}</option>
                    </select>
                    <button type="button" className="h-9 w-8 inline-flex items-center justify-center rounded-lg text-[#A8231A]/80 hover:bg-[#FDE7E4]" aria-label="Remove sort level" onClick={() => setDSorts(ss => ss.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
            <button type="button" className={`${SA_BTN_OUTLINE} mt-2`} disabled={!freeSort} onClick={() => freeSort && setDSorts(ss => [...ss, { f: freeSort.value, dir: DEFAULT_SORT_DIR[freeSort.value] }])}><Plus size={13} /> Add level</button>
          </section>

          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D]">
            <input type="checkbox" className="w-4 h-4 accent-[#6B3470]" checked={dVoid} onChange={e => setDVoid(e.target.checked)} /> Show void invoices in “All”
          </label>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#F3EEEA]">
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setDRules([]); setDSorts([]); setDVoid(false); onReset(); setOpen(false) }}>Reset</button>
            <button type="button" className={SA_BTN_PRIMARY} onClick={apply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
