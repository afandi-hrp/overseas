// Mode "Monthly Report" voyage Cost Agent (2026-10-13, Prompt 2) -- 1 kapal + 1 bulan ditampilkan PERSIS layout laporan
// "VOYAGE REPORT": NO URUT | NO VOY | LOAD (port + Arrival/Berthed/Commenced/Completed/Departure) | DISCHARGE (1 baris per
// pelabuhan bongkar) | CARGO per produk, + total cargo bulan itu + ETA berikutnya. Export Excel layout sama (SheetJS).
// Waktu = jam lokal pelabuhan (LT). Data: cost_agent_voyage_list_v (filter kapal+bulan) + fn_cost_agent_get_voyage per voyage.
import { useEffect, useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import { SA_BTN_OUTLINE, SA_CARD } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import {
  fetchCostAgentVoyageList, costAgentGetVoyage, fmtDateTimePort, fmtNumber, fmtReportMonth, isDischargeActivity, tzAbbrev,
  type CostAgentVoyageDetail, type CostAgentVoyageCall, type CostAgentPort,
} from '../utils/CostAgentHelpers'

let xlsxPromise: Promise<typeof import('xlsx')> | null = null
const loadXlsx = () => (xlsxPromise ??= import('xlsx'))

const T_KEYS = ['arrived_at', 'berthed_at', 'commenced_at', 'completed_at', 'departed_at'] as const
const T_LABELS = ['Arrival', 'Berthed', 'Commenced', 'Completed', 'Departure']

type ReportRow = { v: CostAgentVoyageDetail; load: CostAgentVoyageCall | null; dis: CostAgentVoyageCall | null; first: boolean; span: number }

const lt = (c: CostAgentVoyageCall | null, k: typeof T_KEYS[number]) => (c && c[k] ? fmtDateTimePort(c[k], c.port_tz, false) : '')

export default function CostAgentVoyageMonthlyReport({ vesselId, vesselName, month, ports, reloadKey, onOpen }: {
  vesselId: number | null
  vesselName: string
  month: string // YYYY-MM
  ports: CostAgentPort[]
  reloadKey: number
  onOpen: (id: number) => void
}) {
  const [voyages, setVoyages] = useState<CostAgentVoyageDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vesselId || !month) { setVoyages([]); return }
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      const { rows } = await fetchCostAgentVoyageList({
        page: 1, pageSize: 200, eq: { vessel_id: vesselId, report_month: `${month}-01` }, orderBy: 'seq_in_report', ascending: true,
      })
      const details = await Promise.all(rows.map(r => costAgentGetVoyage(r.id)))
      if (cancelled) return
      const list = details.filter((d): d is CostAgentVoyageDetail => !!d)
      list.sort((a, b) => (a.seq_in_report ?? 9999) - (b.seq_in_report ?? 9999) || String(a.voyage_no).localeCompare(String(b.voyage_no), undefined, { numeric: true }))
      setVoyages(list)
    })().catch(e => { if (!cancelled) setError(e.message || String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vesselId, month, reloadKey])

  // Kolom cargo = semua produk bulan itu (urutan kemunculan), satuan per produk.
  const products = useMemo(() => {
    const m = new Map<string, string>()
    voyages.forEach(v => v.cargo.forEach(g => { if (!m.has(g.product)) m.set(g.product, g.unit) }))
    return [...m.entries()].map(([product, unit]) => ({ product, unit }))
  }, [voyages])
  const cargoOf = (v: CostAgentVoyageDetail, product: string) => {
    const items = v.cargo.filter(g => g.product === product)
    return items.length ? items.reduce((a, g) => a + Number(g.qty || 0), 0) : null
  }
  const totals = products.map(p => voyages.reduce((a, v) => a + (cargoOf(v, p.product) || 0), 0))

  const rows: ReportRow[] = useMemo(() => voyages.flatMap(v => {
    const loads = v.calls.filter(c => !isDischargeActivity(c.activity))
    const dis = v.calls.filter(c => isDischargeActivity(c.activity))
    const span = Math.max(loads.length, dis.length, 1)
    return Array.from({ length: span }, (_, i) => ({ v, load: loads[i] || null, dis: dis[i] || null, first: i === 0, span }))
  }), [voyages])

  // ETA berikutnya = voyage terakhir yg punya next_eta_at.
  const nextEta = [...voyages].reverse().find(v => v.next_eta_at)
  const nextEtaTz = nextEta?.next_port_id ? ports.find(p => p.id === nextEta.next_port_id)?.tz : null

  const exportExcel = async () => {
    const XLSX = await loadXlsx()
    const head1 = ['NO URUT', 'NO VOY', 'LOAD', '', '', '', '', '', 'DISCHARGE', '', '', '', '', '', ...(products.length ? ['CARGO', ...Array(products.length - 1).fill('')] : [])]
    const head2 = ['', '', 'Port', ...T_LABELS, 'Port', ...T_LABELS, ...products.map(p => `${p.product} (${p.unit})`)]
    const aoa: (string | number)[][] = [
      ['VOYAGE REPORT'],
      [`Vessel: ${vesselName}`],
      [`Month: ${fmtReportMonth(`${month}-01`)} · times in port local time (LT)`],
      [],
      head1, head2,
    ]
    const merges: any[] = [
      { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } }, { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
      { s: { r: 4, c: 2 }, e: { r: 4, c: 7 } }, { s: { r: 4, c: 8 }, e: { r: 4, c: 13 } },
    ]
    if (products.length > 1) merges.push({ s: { r: 4, c: 14 }, e: { r: 4, c: 13 + products.length } })
    rows.forEach(r => {
      const rowIdx = aoa.length
      aoa.push([
        r.first ? (r.v.seq_in_report ?? '') : '', r.first ? r.v.voyage_no : '',
        r.load?.port_code || '', ...T_KEYS.map(k => lt(r.load, k)),
        r.dis?.port_code || '', ...T_KEYS.map(k => lt(r.dis, k)),
        ...products.map(p => (r.first ? (cargoOf(r.v, p.product) ?? '') : '')),
      ])
      if (r.first && r.span > 1) {
        [0, 1, ...products.map((_, i) => 14 + i)].forEach(c => merges.push({ s: { r: rowIdx, c }, e: { r: rowIdx + r.span - 1, c } }))
      }
    })
    aoa.push(['TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', '', ...totals])
    if (nextEta) aoa.push([], [`ETA ${nextEta.next_port_code || ''}: ${fmtDateTimePort(nextEta.next_eta_at, nextEtaTz)}`])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = merges
    ws['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 8 }, ...Array(5).fill({ wch: 17 }), { wch: 8 }, ...Array(5).fill({ wch: 17 }), ...products.map(() => ({ wch: 16 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Voyage Report')
    XLSX.writeFile(wb, `Voyage Report ${vesselName.replace(/[\\/:*?"<>|.]+/g, ' ').trim()} ${month}.xlsx`)
  }

  if (!vesselId || !month) {
    return <div className={`${SA_CARD} p-8 text-center text-sm text-[#6E5E70]`}>Select a <b>vessel</b> and a <b>report month</b> in the filters to see the monthly Voyage Report.</div>
  }

  const th = 'px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#6E5E70] border border-[#EADFD6] bg-[#FBF7F4] whitespace-nowrap'
  const td = 'px-2 py-1.5 text-[12px] text-[#3B1B3D] border border-[#EADFD6] whitespace-nowrap tabular-nums'

  return (
    <div className={`${SA_CARD} flex flex-col min-h-0 flex-1 overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EADFD6] shrink-0 flex-wrap">
        <div>
          <div className="text-[14px] font-bold text-[#3B1B3D]">VOYAGE REPORT · {vesselName}</div>
          <div className="text-[12px] text-[#6E5E70]">{fmtReportMonth(`${month}-01`)} · times in port local time (LT)</div>
        </div>
        <button type="button" className={SA_BTN_OUTLINE} onClick={exportExcel} disabled={loading || !voyages.length}><FileDown size={13} /> Export Excel</button>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        {loading ? <LoadingState fullHeight={false} /> : error ? (
          <p className="p-4 text-sm text-[#A8231A]">{error}</p>
        ) : !voyages.length ? (
          <p className="p-8 text-center text-sm text-[#6E5E70] italic">No voyages for this vessel and month.</p>
        ) : (
          <table className="border-collapse min-w-full">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className={th} rowSpan={2}>No Urut</th>
                <th className={th} rowSpan={2}>No Voy</th>
                <th className={th} colSpan={6}>Load</th>
                <th className={th} colSpan={6}>Discharge</th>
                {products.length > 0 && <th className={th} colSpan={products.length}>Cargo</th>}
              </tr>
              <tr>
                <th className={th}>Port</th>{T_LABELS.map(l => <th key={'l' + l} className={th}>{l}</th>)}
                <th className={th}>Port</th>{T_LABELS.map(l => <th key={'d' + l} className={th}>{l}</th>)}
                {products.map(p => <th key={p.product} className={th}>{p.product} <span className="normal-case">({p.unit})</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-[#FBF7F4]">
                  {r.first && <td className={`${td} text-center align-top`} rowSpan={r.span}>{r.v.seq_in_report ?? '—'}</td>}
                  {r.first && (
                    <td className={`${td} text-center align-top`} rowSpan={r.span}>
                      <button type="button" className="font-bold text-[#6B3470] hover:underline" onClick={() => onOpen(r.v.id)}>{r.v.voyage_no}</button>
                    </td>
                  )}
                  <td className={`${td} font-semibold`} title={r.load ? `${r.load.port_name} · ${tzAbbrev(r.load.port_tz)}` : undefined}>{r.load?.port_code || ''}</td>
                  {T_KEYS.map(k => <td key={'l' + k} className={td}>{lt(r.load, k)}</td>)}
                  <td className={`${td} font-semibold`} title={r.dis ? `${r.dis.port_name} · ${tzAbbrev(r.dis.port_tz)}` : undefined}>{r.dis?.port_code || ''}</td>
                  {T_KEYS.map(k => <td key={'d' + k} className={td}>{lt(r.dis, k)}</td>)}
                  {r.first && products.map(p => <td key={p.product} className={`${td} text-right align-top`} rowSpan={r.span}>{fmtNumber(cargoOf(r.v, p.product), 3)}</td>)}
                </tr>
              ))}
              <tr className="bg-[#F5EDF3]">
                <td className={`${td} font-bold`} colSpan={14}>TOTAL {fmtReportMonth(`${month}-01`).toUpperCase()}</td>
                {totals.map((t, i) => <td key={i} className={`${td} text-right font-bold`}>{fmtNumber(t, 3)}</td>)}
              </tr>
            </tbody>
          </table>
        )}
      </div>
      {nextEta && !loading && (
        <div className="px-4 py-2 border-t border-[#EADFD6] text-[12.5px] text-[#3B1B3D] shrink-0">
          ETA <b>{nextEta.next_port_code}</b>: {fmtDateTimePort(nextEta.next_eta_at, nextEtaTz)}
        </div>
      )}
    </div>
  )
}

