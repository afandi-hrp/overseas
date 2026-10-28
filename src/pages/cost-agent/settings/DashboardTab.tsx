// Tab "Dashboard" hub Cost Agent Settings (2026-10-26) -- fn_cost_agent_dashboard(p_filter {office, company_code, months}). READ-ONLY (tanpa tombol ubah).
// Bagian: Needs attention | Documents without invoice (UnmatchedDocsSection, bisa mengubah: Attach / Dismiss) | Pipeline | Monthly trend | Cost vs history | Top 8 | Waiting for approval | Failed processing | Master data health.
// Halaman Agency Invoices tidak punya filter status lewat URL -> kartu "Needs attention" hanya angka (satu-satunya tautan: "Vessel office not set" ->
// tab Vessels ?missing=office). Baris invoice menaut ke /cost-agent/invoice/:id (route yang sudah ada). Grafik = batang CSS (belum ada library chart).
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_CARD } from '../../../components/SeaAirAuditUi'
import { LoadingState } from '../../../components/LoadingState'
import {
  fetchCostAgentCompanies, fmtMoney, fmtNumber, fmtPct, fmtShortAmount, fmtDateTimePort,
  type CostAgentCompany, type CostAgentInvoiceStatus,
} from '../../../utils/CostAgentHelpers'
import { hubDashboard, OFFICE_LABEL } from './hubApi'
import { ErrorBox, FILTER_CTRL, OfficeBadge, SectionTitle, StatGrid, TD, TH, useAsync, type HubCtx, type StatCell } from './hubUi'
import UnmatchedDocsSection from './UnmatchedDocsSection'

const ATTENTION: { key: string; label: string; tone?: 'red' | 'amber' }[] = [
  { key: 'failed_invoices', label: 'Failed invoices' },
  { key: 'processing_stuck', label: 'Stuck in processing > 30 min' },
  { key: 'failed_documents', label: 'Failed documents' },
  { key: 'in_verification', label: 'In verification' },
  { key: 'waiting_approval', label: 'Waiting for approval' },
  { key: 'waiting_over_3d', label: 'Waiting > 3 days', tone: 'red' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'unmapped_lines', label: 'Lines without cost item' },
  { key: 'voyage_unmatched', label: 'Voyage not matched' },
  { key: 'office_missing', label: 'Vessel office not set', tone: 'amber' },
]
const PIPELINE: { status: CostAgentInvoiceStatus; label: string }[] = [
  { status: 'processing', label: 'Processing' }, { status: 'failed', label: 'Failed' }, { status: 'verification', label: 'Verification' },
  { status: 'waiting_approval', label: 'Waiting approval' }, { status: 'rejected', label: 'Rejected' }, { status: 'approved', label: 'Approved' },
  { status: 'journal', label: 'Journal' }, { status: 'paid', label: 'Paid' }, { status: 'cancelled', label: 'Cancelled' },
]
const FLAGS: { key: string; label: string; color: string }[] = [
  { key: 'sesuai', label: 'As expected', color: '#2F9E63' }, { key: 'naik', label: 'Higher', color: '#D9483B' }, { key: 'turun', label: 'Lower', color: '#3F6FD1' },
  { key: 'tanpa_history', label: 'No history', color: '#A99AAB' }, { key: 'item_baru', label: 'New item', color: '#8E5CC7' }, { key: 'none', label: 'Not compared', color: '#DDD3DD' },
]
const SERIES: { key: string; label: string; color: string }[] = [
  { key: 'MEDAN', label: 'Medan', color: '#6B3470' }, { key: 'JAKARTA', label: 'Jakarta', color: '#3F6FD1' }, { key: 'NONE', label: 'Not set', color: '#CBBFCB' },
]
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MON[Number(mm) - 1] || mm} ${String(y).slice(2)}` }

function Section({ title, hint, right, children, className = '' }: { title: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${SA_CARD} p-4 ${className}`}>
      <SectionTitle hint={hint} right={right}>{title}</SectionTitle>
      {children}
    </section>
  )
}
// Warna titik status Pipeline (selaras nada INVOICE_STATUS_META).
const PIPE_DOT: Record<CostAgentInvoiceStatus, string> = {
  processing: '#3F6FD1', failed: '#D9483B', verification: '#D9A441', waiting_approval: '#8E5CC7', rejected: '#D9483B',
  approved: '#2F9E63', journal: '#6B3470', paid: '#17663D', cancelled: '#A99AAB',
}
const InvLink = ({ id, no }: { id: number; no: string | null }) => (
  <Link to={`/cost-agent/invoice/${id}`} className="font-semibold text-[#6B3470] hover:underline">{no || `#${id}`}</Link>
)

export default function DashboardTab({ ctx }: { ctx: HubCtx }) {
  const [office, setOffice] = useState('')
  const [company, setCompany] = useState('')
  const [months, setMonths] = useState(6)
  const [companies, setCompanies] = useState<CostAgentCompany[]>([])
  const [metric, setMetric] = useState<'amount' | 'invoices'>('amount')
  useEffect(() => { fetchCostAgentCompanies().then(setCompanies).catch(() => setCompanies([])) }, [])

  const { data: d, loading, error, reload } = useAsync(() => hubDashboard({ office, company_code: company, months: months === 6 ? '' : months }), [office, company, months])

  // Tren per bulan x office.
  const trend = useMemo(() => {
    const byMonth = new Map<string, Record<string, { total: number; invoices: number }>>()
    ;(d?.trend || []).forEach(t => {
      const m = byMonth.get(t.month) || {}
      m[t.office] = { total: Number(t.total) || 0, invoices: Number(t.invoices) || 0 }
      byMonth.set(t.month, m)
    })
    const rows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => {
      const val = (k: string) => (metric === 'amount' ? v[k]?.total : v[k]?.invoices) || 0
      return { month, v, val, sum: SERIES.reduce((a, s) => a + val(s.key), 0) }
    })
    return { rows, max: Math.max(1, ...rows.map(r => r.sum)) }
  }, [d, metric])

  const flags = d?.compare?.flags || {}
  const flagTotal = FLAGS.reduce((a, f) => a + (Number(flags[f.key]) || 0), 0)
  const statusMap = new Map<string, { status: string; count: number; total: number }>((d?.status || []).map(s => [s.status, s] as [string, { status: string; count: number; total: number }]))
  const att = d?.attention || {}
  const health = d?.master_health || {}

  const attentionCells: StatCell[] = ATTENTION.map(a => {
    const n = Number(att[a.key]) || 0
    const link = a.key === 'office_missing' && n > 0
    return {
      key: a.key, label: a.label, value: fmtNumber(n, 0), dim: n === 0, tone: n > 0 ? a.tone : undefined,
      onClick: link ? () => ctx.goTab('vessels', { missing: 'office' }) : undefined, title: link ? 'Open Vessels without owner office' : undefined,
    }
  })
  const pipelineCells: StatCell[] = PIPELINE.map(p => {
    const st = statusMap.get(p.status)
    return { key: p.status, label: p.label, value: fmtNumber(st?.count ?? 0, 0), sub: fmtMoney(st?.total ?? 0), dim: !st?.count, dot: PIPE_DOT[p.status] }
  })

  const healthLinks: { key: string; label: string; tab: string; extra?: Record<string, string>; red?: boolean }[] = [
    { key: 'vessels_no_office', label: 'Vessels without owner office', tab: 'vessels', extra: { missing: 'office' } },
    { key: 'vessels_no_dwt', label: 'Vessels without DWT', tab: 'vessels', extra: { missing: 'dwt' } },
    { key: 'vessels_no_company', label: 'Vessels without company', tab: 'vessels', extra: { missing: 'company' } },
    { key: 'ports_unverified', label: 'Ports not verified', tab: 'ports', extra: { verified: 'false' } },
    { key: 'vendors_no_npwp', label: 'Vendors without NPWP', tab: 'vendors', extra: { missing: 'npwp' } },
    { key: 'matrix_without_email', label: 'Approval rules without approver email', tab: 'matrix', red: true },
  ]

  return (
    <div className="space-y-3 @container" data-hub-dashboard>
      <div className="@container bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Office
          <select aria-label="Office" className={FILTER_CTRL} value={office} onChange={e => setOffice(e.target.value)}>
            <option value="">All</option><option value="MEDAN">Medan</option><option value="JAKARTA">Jakarta</option><option value="NONE">Not set</option>
          </select></label>
        <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Company
          <select aria-label="Company" className={FILTER_CTRL} value={company} onChange={e => setCompany(e.target.value)}>
            <option value="">All PT</option>{companies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select></label>
        <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Period
          <select aria-label="Period" className={FILTER_CTRL} value={months} onChange={e => setMonths(Number(e.target.value))}>
            {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m} months</option>)}
          </select></label>
        <span className="ml-auto text-[12px] text-[#6E5E70]">{d?.generated_at ? `Updated ${fmtDateTimePort(d.generated_at, null, false)}` : ''}</span>
        <button type="button" className={SA_BTN_OUTLINE} onClick={reload} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>

      {loading && !d ? <LoadingState fullHeight={false} /> : error ? <ErrorBox message={error} onRetry={reload} /> : d && (
        <div className={loading ? 'opacity-60 transition-opacity space-y-3' : 'space-y-3'}>
          <Section title="Needs attention" hint="Open work that needs a person. Dimmed tiles are clear.">
            <StatGrid cols="grid-cols-2 @min-[700px]:grid-cols-5" cells={attentionCells} />
          </Section>

          <UnmatchedDocsSection ctx={ctx} />

          <Section title="Pipeline" hint="Agency invoices by status, with the total amount in each.">
            <StatGrid cols="grid-cols-3 @min-[900px]:grid-cols-9" attr="data-pipeline" cells={pipelineCells} />
          </Section>

          <div className="grid grid-cols-1 @min-[1100px]:grid-cols-2 gap-3">
            <Section title="Monthly trend" right={(
              <div className="inline-flex p-0.5 rounded-lg bg-[#F5EDF3]" role="tablist">
                {(['amount', 'invoices'] as const).map(m => (
                  <button key={m} type="button" role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
                    className={`px-2.5 h-6 rounded-md text-[11px] font-bold ${metric === m ? 'bg-[#3B1B3D] text-white' : 'text-[#3B1B3D]'}`}>{m === 'amount' ? 'Amount' : 'Invoices'}</button>
                ))}
              </div>
            )}>
              {trend.rows.length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">No invoices in this period.</p> : (
                <>
                  <div className="flex items-end gap-2 h-44 pt-5" data-trend>
                    {trend.rows.map(r => (
                      <div key={r.month} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end"
                        title={`${monthLabel(r.month)} — ${SERIES.map(s => `${s.label}: ${metric === 'amount' ? fmtMoney(r.val(s.key)) : fmtNumber(r.val(s.key), 0)}`).join(' · ')}`}>
                        <span className="text-[10px] text-[#6E5E70] tabular-nums mb-0.5">{metric === 'amount' ? fmtShortAmount(r.sum) : fmtNumber(r.sum, 0)}</span>
                        <div className="w-full max-w-[44px] flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: `${Math.max(2, (r.sum / trend.max) * 100)}%` }}>
                          {SERIES.map(s => r.val(s.key) > 0 && <div key={s.key} style={{ height: `${(r.val(s.key) / r.sum) * 100}%`, background: s.color }} />)}
                        </div>
                        <span className="mt-1 text-[10.5px] text-[#3B1B3D] font-semibold whitespace-nowrap">{monthLabel(r.month)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-[#6E5E70]">
                    {SERIES.map(s => <span key={s.key} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
                  </div>
                </>
              )}
            </Section>

            <Section title="Cost vs history">
              {flagTotal === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">No invoice lines in this period.</p> : (
                <>
                  <div className="flex h-5 rounded-md overflow-hidden bg-[#F3EEEA]" data-compare-bar>
                    {FLAGS.map(f => (Number(flags[f.key]) || 0) > 0 && <div key={f.key} style={{ width: `${(Number(flags[f.key]) / flagTotal) * 100}%`, background: f.color }} title={`${f.label}: ${flags[f.key]}`} />)}
                  </div>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                    {FLAGS.map(f => (
                      <li key={f.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: f.color }} />
                        <span className="text-[#3B1B3D]">{f.label}</span><span className="ml-auto tabular-nums font-semibold">{fmtNumber(flags[f.key] ?? 0, 0)}</span>
                        <span className="text-[#8A7A8B] tabular-nums w-10 text-right">{flagTotal ? `${Math.round(((Number(flags[f.key]) || 0) / flagTotal) * 100)}%` : ''}</span></li>
                    ))}
                  </ul>
                </>
              )}
              {(d.compare?.top_naik || []).length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-[#EADFD6]">
                  <table className="min-w-full" data-top-naik>
                    <thead><tr>{['Invoice', 'Description', 'Amount', 'History ref', '% higher'].map((h, i) => <th key={h} className={`${TH} ${i >= 2 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(d.compare?.top_naik || []).map((r, i) => (
                        <tr key={i} className="border-t border-[#F3EEEA]">
                          <td className={TD}><InvLink id={r.invoice_id} no={r.invoice_no} /></td>
                          <td className={`${TD} max-w-[220px] truncate`} title={r.description_raw || ''}>{r.description_raw || '—'}</td>
                          <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmtMoney(r.amount)}</td>
                          <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmtMoney(r.ref_amount)}</td>
                          <td className={`${TD} text-right tabular-nums text-[#A8231A] font-semibold`}>{fmtPct(r.compare_diff_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <Section title="Top 8">
            <div className="grid grid-cols-1 @min-[1100px]:grid-cols-3 gap-3">
              <MiniTable title="Cost items" head={['Item', 'Lines', 'Total']} rows={(d.top_cost_items || []).map(r => [<span key="a" title={r.name}><b className="font-mono text-[11.5px]">{r.code}</b> <span className="text-[#6E5E70]">{r.name}</span></span>, fmtNumber(r.lines, 0), fmtMoney(r.total)])} />
              <MiniTable title="Vendors" head={['Vendor', 'Invoices', 'Total']} rows={(d.top_vendors || []).map(r => [<span key="a" className="font-semibold">{r.name}</span>, fmtNumber(r.invoices, 0), fmtMoney(r.total)])} />
              <MiniTable title="Vessels" head={['Vessel', 'Invoices', 'Total']} rows={(d.top_vessels || []).map(r => [<span key="a" className="inline-flex items-center gap-1.5 flex-wrap"><b>{r.name}</b><OfficeBadge office={r.office} /></span>, fmtNumber(r.invoices, 0), fmtMoney(r.total)])} />
            </div>
          </Section>

          <Section title="Waiting for approval">
            {(d.waiting_list || []).length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">Nothing is waiting for approval.</p> : (
              <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
                <table className="min-w-full" data-waiting-list>
                  <thead><tr>{['Invoice no', 'Vendor', 'Vessel', 'Office', 'Total', 'Waiting', 'Pending step'].map((h, i) => <th key={h} className={`${TH} ${h === 'Total' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(d.waiting_list || []).map(r => (
                      <tr key={r.id} className="border-t border-[#F3EEEA]">
                        <td className={TD}><InvLink id={r.id} no={r.invoice_no} /></td>
                        <td className={TD}>{r.vendor_name || '—'}</td>
                        <td className={TD}>{r.vessel_name || '—'}</td>
                        <td className={TD}><OfficeBadge office={r.office} /></td>
                        <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{fmtMoney(r.total)}</td>
                        <td className={TD}><Chip tone={(r.age_days ?? 0) > 3 ? 'red' : 'grey'}>Waiting {r.age_days ?? 0}d</Chip></td>
                        <td className={TD}>{r.pending_step != null ? `Step ${r.pending_step} ${r.pending_approver || ''}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Failed processing">
            {(d.failed_list || []).length === 0 ? <p className="text-[12.5px] text-[#6E5E70] italic">No failed invoices or documents.</p> : (
              <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
                <table className="min-w-full" data-failed-list>
                  <thead><tr>{['Kind', 'Invoice no', 'File', 'Error', 'At'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(d.failed_list || []).map((r, i) => (
                      <tr key={i} className="border-t border-[#F3EEEA]">
                        <td className={TD}><Chip tone={r.kind === 'invoice' ? 'red' : 'amber'}>{r.kind === 'invoice' ? 'Invoice' : 'Document'}</Chip></td>
                        <td className={TD}><InvLink id={r.invoice_id} no={r.invoice_no} /></td>
                        <td className={`${TD} max-w-[200px] truncate`} title={r.file_name || ''}>{r.file_name || '—'}</td>
                        <td className={`${TD} max-w-[420px]`}><span className="line-clamp-2 [overflow-wrap:anywhere]" title={r.error || ''}>{r.error || '—'}</span></td>
                        <td className={`${TD} whitespace-nowrap`}>{fmtDateTimePort(r.at, null, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Master data health">
            <ul className="grid grid-cols-1 @min-[900px]:grid-cols-2 gap-1.5" data-master-health>
              {healthLinks.map(h => {
                const n = Number(health[h.key]) || 0
                return (
                  <li key={h.key}>
                    <button type="button" onClick={() => ctx.goTab(h.tab, h.extra)}
                      className={`w-full flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[12.5px] hover:bg-[#FBF7F4] ${h.red && n > 0 ? 'border-[#F4C3BC] bg-[#FDE7E4]' : 'border-[#EADFD6] bg-white'} ${n === 0 ? 'opacity-60' : ''}`}>
                      <span className="min-w-0 flex-1 text-[#3B1B3D]">{h.label}</span>
                      <b className={`tabular-nums ${h.red && n > 0 ? 'text-[#A8231A]' : 'text-[#3B1B3D]'}`}>{fmtNumber(n, 0)}</b>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px] text-[#6E5E70]">
              <span>Active vessels <b className="text-[#3B1B3D] tabular-nums">{fmtNumber(health.vessels_active ?? 0, 0)}</b></span>
              <span>History rows <b className="text-[#3B1B3D] tabular-nums">{fmtNumber(health.history_rows ?? 0, 0)}</b></span>
              <span>Approval rules <b className="text-[#3B1B3D] tabular-nums">{fmtNumber(health.matrix_rules ?? 0, 0)}</b></span>
              <span className="text-[#8A7A8B]">Period filter: {d.filter?.office ? OFFICE_LABEL[d.filter.office] : 'all offices'}{d.filter?.company_code ? ` · ${d.filter.company_code}` : ''} · from {d.filter?.from ?? '—'}</span>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function MiniTable({ title, head, rows }: { title: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8A7A8B] mb-1">{title}</div>
      <div className="rounded-lg border border-[#EADFD6] overflow-x-auto">
        <table className="min-w-full">
          <thead><tr>{head.map((h, i) => <th key={h} className={`${TH} ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={head.length} className="px-3 py-4 text-center text-[12px] text-[#8A7A8B] italic">No data</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[#F3EEEA]">{r.map((c, j) => <td key={j} className={`${TD} ${j > 0 ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
