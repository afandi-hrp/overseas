// Drawer kanan "Browse history" (2026-10-13, sql/057) -- dipakai HANYA di modal review invoice (CostAgentInvoiceLines).
// Cari history biaya lewat fn_cost_agent_search_history (20 baris/halaman, "Load more" offset += 20, TIDAK ambil semua).
// Filter awal: cost item baris + port/vessel/vendor header invoice + description = teks baris; bisa dihapus/diubah (chips +
// select master), q debounce 400 ms, rentang tanggal. Minimal 1 filter utama (cost item/port/vessel/vendor) -- syarat RPC.
// Hasil di-cache per filter (cache milik modal review, hidup selama modal terbuka). "Use as comparison" ->
// fn_cost_agent_set_line_reference (hanya status verification/rejected & canEdit('cost_agent_invoice') = prop `editable`).
// sql/058 (compare v2): badge = `line_match` dari server (bukan dihitung dari angka), ref_date = tgl invoice (service_date, fallback
// invoice_date) -> days_diff per baris, toggle Sort: Best match (similarity) | Newest (date).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Pin, AlertTriangle } from 'lucide-react'
import { CostAgentCombobox, FieldLabel, type ComboOption } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import { LoadingState, LoadingSpinner } from './LoadingState'
import {
  costAgentSearchHistory, hasHistoryMainFilter, fmtMoney, fmtNumber, fmtPct, fmtDate, daysDiffLabel,
  type CostAgentHistoryFilter, type CostAgentHistorySearchRow, type CostAgentInvoiceLine, type CostAgentCostItem,
  type CostAgentPort, type CostAgentVessel, type CostAgentVendor, type CostAgentLineMatch,
} from '../utils/CostAgentHelpers'

const PAGE = 20

// Badge kecocokan teks baris (sql/058): dari `line_match` server -- same_line hijau, similar biru, different_line oranye, no_text
// tanpa badge. Persen similarity hanya di tooltip.
export function LineMatchBadge({ match, similarity }: { match: CostAgentLineMatch | null | undefined; similarity?: number | null }) {
  if (!match || match === 'no_text') return null
  const pct = similarity !== null && similarity !== undefined && !isNaN(Number(similarity)) ? ` · text similarity ${Math.round(Number(similarity) * 100)}%` : ''
  if (match === 'same_line') return <Chip tone="green" title={`Same line text as this invoice line${pct}`}>Same line</Chip>
  if (match === 'similar') return <Chip tone="blue" title={`Similar line text${pct}`}>Similar line</Chip>
  return <Chip tone="amber" className="!bg-[#FDEBD9] !text-[#9A4A12]" title={`Different service/wording than this invoice line — check manually${pct}`}>Different line</Chip>
}

export const ChosenByUserLabel = () => (
  <span className="text-[11px] font-semibold text-[#6B3470] whitespace-nowrap inline-flex items-center gap-0.5"><Pin size={11} /> Chosen by user</span>
)

export type HistoryCache = Map<string, { rows: CostAgentHistorySearchRow[]; hasMore: boolean; sort?: string }>

const filterKey = (f: CostAgentHistoryFilter) =>
  JSON.stringify(['cost_item_id', 'port_id', 'vessel_id', 'vendor_id', 'q', 'date_from', 'date_to', 'description', 'ref_date', 'sort'].map(k => (f as any)[k] ?? null))

export default function CostAgentHistoryBrowser({ line, currency, invoice, costItems, ports, vessels, vendors, cache, editable, onUse, onClose }: {
  line: CostAgentInvoiceLine
  currency: string
  invoice: { port_id: number | null; vessel_id: number | null; vendor_id: number | null; service_date?: string | null; invoice_date?: string | null }
  costItems: CostAgentCostItem[]
  ports: CostAgentPort[]
  vessels: CostAgentVessel[]
  vendors: CostAgentVendor[]
  cache: HistoryCache
  editable: boolean
  onUse: (historyId: number) => Promise<void>
  onClose: () => void
}) {
  const [costItemId, setCostItemId] = useState<number | null>(line.cost_item_id)
  const [portId, setPortId] = useState<number | null>(invoice.port_id)
  const [vesselId, setVesselId] = useState<number | null>(invoice.vessel_id)
  const [vendorId, setVendorId] = useState<number | null>(invoice.vendor_id)
  const [description, setDescription] = useState<string | null>(line.description_raw || null)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<'similarity' | 'date'>('similarity') // Best match (default) | Newest
  const refDate = String(invoice.service_date || invoice.invoice_date || '').slice(0, 10) || null
  const [rows, setRows] = useState<CostAgentHistorySearchRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  // Urutan yang BENAR-BENAR dipakai server (sql/058: Best match hanya bila filter teks baris ada; tanpa itu urut tanggal).
  const [serverSort, setServerSort] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [using, setUsing] = useState<number | null>(null)
  const seq = useRef(0)

  // Debounce 400 ms utk teks cari.
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 400); return () => clearTimeout(t) }, [qInput])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const filter: CostAgentHistoryFilter = useMemo(() => ({
    cost_item_id: costItemId, port_id: portId, vessel_id: vesselId, vendor_id: vendorId,
    q: q || null, date_from: dateFrom || null, date_to: dateTo || null, description, ref_date: refDate, sort,
  }), [costItemId, portId, vesselId, vendorId, q, dateFrom, dateTo, description, refDate, sort])
  const canSearch = hasHistoryMainFilter(filter)

  const search = async (force = false) => {
    if (!canSearch) { setRows([]); setHasMore(false); return }
    const key = filterKey(filter)
    const hit = !force && cache.get(key)
    if (hit) { setRows(hit.rows); setHasMore(hit.hasMore); setServerSort(hit.sort); setError(null); return }
    const my = ++seq.current
    setLoading(true); setError(null)
    try {
      const r = await costAgentSearchHistory(filter, PAGE, 0)
      if (my !== seq.current) return
      const list = r?.rows || []
      cache.set(key, { rows: list, hasMore: !!r?.has_more, sort: r?.sort })
      setRows(list); setHasMore(!!r?.has_more); setServerSort(r?.sort)
    } catch (e: any) {
      if (my === seq.current) { setError(e.message || String(e)); setRows([]); setHasMore(false) }
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }
  // Cari otomatis saat filter berubah (q sudah di-debounce).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search() }, [filter])

  const loadMore = async () => {
    const key = filterKey(filter)
    const my = seq.current
    setLoadingMore(true); setError(null)
    try {
      const r = await costAgentSearchHistory(filter, PAGE, rows.length)
      if (my !== seq.current) return
      const next = [...rows, ...(r?.rows || [])]
      cache.set(key, { rows: next, hasMore: !!r?.has_more, sort: r?.sort ?? serverSort })
      setRows(next); setHasMore(!!r?.has_more)
    } catch (e: any) { setError(e.message || String(e)) } finally { setLoadingMore(false) }
  }

  const use = async (h: CostAgentHistorySearchRow) => {
    setUsing(h.history_id); setError(null)
    try { await onUse(h.history_id) } catch (e: any) { setError(e.message || String(e)); setUsing(null) }
  }

  const costItem = costItems.find(c => c.id === costItemId)
  const portOpts: ComboOption[] = useMemo(() => ports.map(p => ({ value: p.id, label: `${p.code} — ${p.name}`, keywords: (p.aliases || []).join(' ') })), [ports])
  const vesselOpts: ComboOption[] = useMemo(() => vessels.map(v => ({ value: v.id, label: v.name, sub: v.dwt ? `DWT ${fmtNumber(v.dwt, 0)}` : undefined })), [vessels])
  const vendorOpts: ComboOption[] = useMemo(() => vendors.map(v => ({ value: v.id, label: v.name, sub: v.npwp || undefined })), [vendors])
  const lineAmount = Number(line.amount || 0)

  const chips: { key: string; label: string; clear: () => void }[] = [
    costItemId !== null && { key: 'ci', label: `Cost item: ${costItem ? costItem.code : '#' + costItemId}`, clear: () => setCostItemId(null) },
    portId !== null && { key: 'po', label: `Port: ${ports.find(p => p.id === portId)?.code || '#' + portId}`, clear: () => setPortId(null) },
    vesselId !== null && { key: 've', label: `Vessel: ${vessels.find(v => v.id === vesselId)?.name || '#' + vesselId}`, clear: () => setVesselId(null) },
    vendorId !== null && { key: 'vd', label: `Vendor: ${vendors.find(v => v.id === vendorId)?.name || '#' + vendorId}`, clear: () => setVendorId(null) },
    description && { key: 'ds', label: `Line text: ${description.length > 40 ? description.slice(0, 40) + '…' : description}`, clear: () => setDescription(null) },
  ].filter(Boolean) as any

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/30 flex justify-end" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white shadow-2xl h-full w-[min(1560px,98vw)] flex flex-col overflow-hidden rounded-l-2xl">
        <div className="px-5 pt-3 pb-2.5 border-b border-[#EADFD6] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-[#3B1B3D] leading-tight">Browse history</h2>
              <p className="text-[12px] text-[#6E5E70] mt-0.5 truncate">Line {line.line_no}: <i>{line.description_raw}</i> · {fmtMoney(line.amount, currency)}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
          </div>

          {/* Filter */}
          <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <FieldLabel>Cost item</FieldLabel>
              <select className={`${SA_INPUT} h-8 text-[12px]`} value={costItemId ?? ''} onChange={e => setCostItemId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any cost item</option>
                {costItems.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div><FieldLabel>Port</FieldLabel><CostAgentCombobox options={portOpts} value={portId} onChange={v => setPortId(v === null ? null : Number(v))} placeholder="Any port" /></div>
            <div><FieldLabel>Vessel</FieldLabel><CostAgentCombobox options={vesselOpts} value={vesselId} onChange={v => setVesselId(v === null ? null : Number(v))} placeholder="Any vessel" /></div>
            <div><FieldLabel>Vendor</FieldLabel><CostAgentCombobox options={vendorOpts} value={vendorId} onChange={v => setVendorId(v === null ? null : Number(v))} placeholder="Any vendor" /></div>
            <div className="col-span-2">
              <FieldLabel>Search text</FieldLabel>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B]" />
                <input className={`${SA_INPUT} h-8 text-[12px] pl-7`} value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Line text, invoice no, voyage…" />
              </div>
            </div>
            <div><FieldLabel>Date from</FieldLabel><input type="date" className={`${SA_INPUT} h-8 text-[12px]`} value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><FieldLabel>Date to</FieldLabel><input type="date" className={`${SA_INPUT} h-8 text-[12px]`} value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} /></div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {chips.map(c => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-[#F5EDF3] text-[#6B3470] text-[11.5px] font-semibold pl-2.5 pr-1 py-0.5">
                {c.label}<button type="button" aria-label="Remove filter" onClick={c.clear} className="p-0.5 rounded-full hover:bg-white/70"><X size={11} /></button>
              </span>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3]" role="tablist" aria-label="Sort">
                <span className="pl-1.5 pr-0.5 text-[11px] font-semibold text-[#6E5E70]">Sort:</span>
                {([['similarity', 'Best match'], ['date', 'Newest']] as const).map(([v, label]) => (
                  <button key={v} type="button" role="tab" aria-selected={sort === v} onClick={() => setSort(v)}
                    className={`px-2.5 h-7 rounded-lg text-xs font-bold whitespace-nowrap ${sort === v ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>{label}</button>
                ))}
              </div>
              {sort === 'similarity' && serverSort === 'date' && (
                <span className="text-[11px] text-[#7A4F00]" title="Best match needs the line text filter (chip “Line text”)">Sorted by date — no line text</span>
              )}
              {!canSearch && <span className="text-[11.5px] text-[#7A4F00] inline-flex items-center gap-1"><AlertTriangle size={12} /> Pick at least a cost item, port, vessel or vendor.</span>}
              <button type="button" className={SA_BTN_PRIMARY} disabled={!canSearch || loading} onClick={() => search(true)}><Search size={13} /> Search</button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {error && <div className="mx-4 mt-3 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-1.5 text-[12px] text-[#A8231A] flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
          {loading ? <LoadingState /> : !canSearch ? (
            <p className="p-6 text-center text-[12.5px] text-[#6E5E70] italic">Add a cost item, port, vessel or vendor filter to search the history.</p>
          ) : rows.length === 0 && !error ? (
            <p className="p-6 text-center text-[12.5px] text-[#6E5E70] italic">No history found for these filters.</p>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {['Date', 'Line', 'Vessel', 'Port', 'Vendor', 'Amount', 'Δ vs current', 'Match', 'Source', ''].map((h, i) => (
                    <th key={i} className={`px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6] ${h === 'Amount' || h === 'Δ vs current' ? 'text-right' : ''} ${i === 9 ? 'sticky right-0 z-20' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(h => {
                  const diff = lineAmount - Number(h.amount || 0)
                  const pct = h.amount ? (diff / Math.abs(Number(h.amount))) * 100 : null
                  const current = line.ref_history_id === h.history_id
                  const similar = h.line_match === 'same_line' || h.line_match === 'similar'
                  const TD = 'px-2 py-1.5 text-[12px] text-[#3B1B3D] align-top'
                  const rowBg = current ? 'bg-[#F5EDF3]' : similar ? 'bg-[#F2FAF5]' : 'bg-white'
                  return (
                    <tr key={h.history_id} className={`border-t border-[#F3EEEA] ${rowBg}`}>
                      <td className={`${TD} whitespace-nowrap`}>{fmtDate(h.service_date)}{daysDiffLabel(h.days_diff) && <div className="text-[10.5px] text-[#8A7A8B]">{daysDiffLabel(h.days_diff)}</div>}</td>
                      <td className={`${TD} w-full max-w-0`}>
                        <div className="truncate" title={h.description_raw || undefined}>{h.description_raw || '—'}</div>
                        <div className="text-[11px] text-[#8A7A8B] truncate" title={h.invoice_description || undefined}>
                          {[h.invoice_description, h.invoice_no, h.voyage_no ? `Voy ${h.voyage_no}` : null, h.cost_item_code].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{h.vessel_name || '—'}{h.vessel_dwt ? <div className="text-[11px] text-[#8A7A8B]">DWT {fmtNumber(h.vessel_dwt, 0)}</div> : null}</td>
                      <td className={`${TD} whitespace-nowrap`} title={h.port_name || undefined}>{h.port_code || '—'}</td>
                      <td className={`${TD} max-w-[180px] truncate`} title={h.vendor_name || undefined}>{h.vendor_name || '—'}</td>
                      <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                        <div className="font-semibold">{fmtMoney(h.amount, currency)}</div>
                        {(h.qty != null || h.unit_price != null) && <div className="text-[11px] text-[#8A7A8B]">{fmtNumber(h.qty, 3)} × {fmtNumber(h.unit_price)}</div>}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap tabular-nums ${diff > 0 ? 'text-[#A8231A]' : diff < 0 ? 'text-[#2F4FA8]' : 'text-[#6E5E70]'}`}>
                        <div>{diff > 0 ? '+' : ''}{fmtMoney(diff, currency)}</div>
                        {pct !== null && <div className="text-[11px]">{fmtPct(pct)}</div>}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}><LineMatchBadge match={h.line_match} similarity={h.similarity} /></td>
                      <td className={`${TD} whitespace-nowrap text-[11.5px] text-[#6E5E70]`}>{h.source === 'import' ? 'Import' : h.source === 'app' ? 'App' : h.source || '—'}</td>
                      <td className={`${TD} whitespace-nowrap text-right sticky right-0 ${rowBg} shadow-[-6px_0_6px_-6px_rgba(59,27,61,0.18)]`}>
                        {current ? <ChosenByUserLabel /> : editable && (
                          <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5 text-[11.5px]`} disabled={using !== null} onClick={() => use(h)}>
                            {using === h.history_id ? <LoadingSpinner /> : null} Use as comparison
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!loading && hasMore && (
            <div className="p-3 text-center">
              <button type="button" className={SA_BTN_OUTLINE} disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </div>
        <div className="px-5 py-2 border-t border-[#EADFD6] bg-[#FBF7F4] text-[11.5px] text-[#6E5E70] shrink-0 flex items-center gap-3 flex-wrap">
          <span>{rows.length} row{rows.length === 1 ? '' : 's'} shown{hasMore ? ' · more available' : ''}</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#F2FAF5] border border-[#CFE9D9]" /> same / similar line text</span>
          {!editable && <span className="ml-auto italic">Read only — comparison can be changed while the invoice is in Verification / Rejected.</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
