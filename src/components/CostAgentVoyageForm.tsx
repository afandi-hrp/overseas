// Form Voyage Cost Agent (2026-10-13, Prompt 2) -- create & edit, format "VOYAGE REPORT" bulanan per kapal:
// 1 voyage = pelabuhan MUAT + 1..n BONGKAR berurutan (port calls), waktu jam lokal pelabuhan (LT), cargo per produk.
// Simpan = RPC fn_cost_agent_save_voyage (guard has_edit_access('cost_agent_voyage')); waktu dikirim "YYYY-MM-DD HH:mm"
// TANPA offset (server mengonversi pakai ports.tz). Port call disimpan per `seq` -- id port call lama dipertahankan bila
// seq sama, jadi port call yg SUDAH punya invoice tidak boleh dihapus / berpindah urutan (tombol dinonaktifkan).
import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CostAgentModal, CostAgentCombobox, FieldLabel, type ComboOption } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_BTN_GREEN, SA_INPUT, SA_CARD, Chip } from './SeaAirAuditUi'
import { LoadingState } from './LoadingState'
import { validateCallTimes } from '../utils/CostAgentVoyageImport'
import {
  costAgentGetVoyage, costAgentSaveVoyage, toPortLocalInput, fromLocalInput, tzAbbrev, diffLocalHours, fmtHours, fmtNumber,
  parseQtyInput, monthToReportMonth, reportMonthToMonth, currentMonth, isDischargeActivity,
  ACTIVITY_LABEL, COST_AGENT_ACTIVITIES, COST_AGENT_PRODUCTS, COST_AGENT_CARGO_UNITS, COST_AGENT_CHARTER_TYPES,
  VOYAGE_SOURCE_LABEL,
  type CostAgentActivity, type CostAgentCompany, type CostAgentPort, type CostAgentVessel, type CostAgentVoyagePayload,
  type CostAgentVoyageStatus, type CostAgentVoyageSource, type CostAgentVoyageWarning,
} from '../utils/CostAgentHelpers'

const TIME_FIELDS = [
  { key: 'arrived_at', label: 'Arrival' },
  { key: 'berthed_at', label: 'Berthed' },
  { key: 'commenced_at', label: 'Commenced' },
  { key: 'completed_at', label: 'Completed' },
  { key: 'departed_at', label: 'Departure' },
] as const
type TimeKey = typeof TIME_FIELDS[number]['key']

type CallRow = {
  key: string
  id?: number // id port call tersimpan
  origSeq?: number
  port_id: number | null
  activity: CostAgentActivity
  invoiceCount: number
} & Record<TimeKey, string>
type CargoRow = { key: string; product: string; qty: string; unit: string; callKey: string }

let keySeq = 0
const newKey = () => `k${++keySeq}`
const emptyCall = (activity: CostAgentActivity): CallRow => ({
  key: newKey(), port_id: null, activity, invoiceCount: 0,
  arrived_at: '', berthed_at: '', commenced_at: '', completed_at: '', departed_at: '',
})

export default function CostAgentVoyageForm({ voyageId, vessels, ports, companies, actor, onClose, onSaved }: {
  voyageId: number | null // null = voyage baru
  vessels: CostAgentVessel[]
  ports: CostAgentPort[]
  companies: CostAgentCompany[]
  actor: string | null
  onClose: () => void
  onSaved: (voyageId: number, message: string) => void
}) {
  const [loading, setLoading] = useState(voyageId !== null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<CostAgentVoyageStatus | null>(null)
  const [source, setSource] = useState<CostAgentVoyageSource>('manual')
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [companyCode, setCompanyCode] = useState<string>('')
  const [voyageNo, setVoyageNo] = useState('')
  const [seqInReport, setSeqInReport] = useState('')
  const [charterType, setCharterType] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [nextPortId, setNextPortId] = useState<number | null>(null)
  const [nextEta, setNextEta] = useState('')
  const [remarks, setRemarks] = useState('')
  const [calls, setCalls] = useState<CallRow[]>([emptyCall('muat')])
  const [cargo, setCargo] = useState<CargoRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedWarnings, setSavedWarnings] = useState<{ id: number; warnings: CostAgentVoyageWarning[] } | null>(null)
  const [dirty, setDirty] = useState(false)

  const portById = useMemo(() => new Map(ports.map(p => [p.id, p])), [ports])
  const vesselById = useMemo(() => new Map(vessels.map(v => [v.id, v])), [vessels])

  // Voyage dari aplikasi sumber (API): field dari sumber read-only kecuali Remarks.
  const lockedSource = source === 'api'

  useEffect(() => {
    if (voyageId === null) return
    let cancelled = false
    setLoading(true)
    costAgentGetVoyage(voyageId).then(v => {
      if (cancelled) return
      if (!v) { setLoadError('Voyage not found.'); return }
      setStatus(v.status)
      setSource(v.source)
      setVesselId(v.vessel_id)
      setCompanyCode(v.company_code || '')
      setVoyageNo(v.voyage_no || '')
      setSeqInReport(v.seq_in_report != null ? String(v.seq_in_report) : '')
      setCharterType(v.charter_type || '')
      setMonth(reportMonthToMonth(v.report_month))
      setNextPortId(v.next_port_id ?? null)
      const nextTz = v.next_port_id ? portById.get(v.next_port_id)?.tz : null
      setNextEta(toPortLocalInput(v.next_eta_at, nextTz))
      setRemarks(v.remarks || '')
      const rows: CallRow[] = (v.calls || []).map(c => ({
        key: newKey(), id: c.id, origSeq: c.seq, port_id: c.port_id, activity: c.activity,
        invoiceCount: (c.invoices || []).length,
        arrived_at: toPortLocalInput(c.arrived_at, c.port_tz), berthed_at: toPortLocalInput(c.berthed_at, c.port_tz),
        commenced_at: toPortLocalInput(c.commenced_at, c.port_tz), completed_at: toPortLocalInput(c.completed_at, c.port_tz),
        departed_at: toPortLocalInput(c.departed_at, c.port_tz),
      }))
      setCalls(rows.length ? rows : [emptyCall('muat')])
      setCargo((v.cargo || []).map(g => ({
        key: newKey(), product: g.product, qty: g.qty != null ? String(g.qty) : '', unit: g.unit || 'L15',
        callKey: g.call_id ? (rows.find(r => r.id === g.call_id)?.key || '') : '',
      })))
    }).catch(e => { if (!cancelled) setLoadError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [voyageId, portById])

  const touch = () => setDirty(true)
  const requestClose = () => {
    if (dirty && !savedWarnings && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }

  // ── Opsi combobox ──
  const vesselOptions: ComboOption[] = useMemo(() => vessels.filter(v => v.is_active !== false || v.id === vesselId).map(v => ({
    value: v.id, label: v.name,
    sub: [v.vessel_type, v.dwt ? `DWT ${fmtNumber(v.dwt, 0)}` : null, v.company_code].filter(Boolean).join(' · '),
    keywords: v.short_code || '',
  })), [vessels, vesselId])
  const portOptions: ComboOption[] = useMemo(() => ports.map(p => ({
    value: p.id, label: `${p.code} — ${p.name}`, sub: `${tzAbbrev(p.tz)}${p.aliases?.length ? ` · ${p.aliases.slice(0, 4).join(', ')}` : ''}`,
    keywords: (p.aliases || []).join(' '), warn: p.is_verified ? undefined : 'Port not verified yet — name/coordinates need checking',
  })), [ports])

  const onVesselChange = (v: number | string | null) => {
    const id = v === null ? null : Number(v)
    setVesselId(id)
    const vs = id ? vesselById.get(id) : null
    if (vs?.company_code) setCompanyCode(vs.company_code) // company default dari kapal
    touch()
  }

  // ── Port calls ──
  const updateCall = (key: string, patch: Partial<CallRow>) => { setCalls(prev => prev.map(c => (c.key === key ? { ...c, ...patch } : c))); touch() }
  // Port call yg punya invoice harus TETAP di posisi (seq) aslinya -- server menyimpan per seq.
  const keepsInvoicedSeq = (next: CallRow[]) => next.every((c, i) => !c.invoiceCount || c.origSeq === i + 1)
    && calls.filter(c => c.invoiceCount).every(c => next.some(n => n.key === c.key))
  const moveCall = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= calls.length) return null
    const next = [...calls]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  }
  const removeCall = (idx: number) => calls.filter((_, i) => i !== idx)
  const applyCalls = (next: CallRow[] | null) => {
    if (!next) return
    setCalls(next)
    setCargo(prev => prev.map(g => (next.some(c => c.key === g.callKey) ? g : { ...g, callKey: '' })))
    touch()
  }

  // ── Cargo ──
  const updateCargo = (key: string, patch: Partial<CargoRow>) => { setCargo(prev => prev.map(g => (g.key === key ? { ...g, ...patch } : g))); touch() }
  const cargoTotals = useMemo(() => {
    const m = new Map<string, number>()
    cargo.forEach(g => { const n = parseQtyInput(g.qty); if (n !== null && g.product.trim()) m.set(g.unit || 'L15', (m.get(g.unit || 'L15') || 0) + n) })
    return [...m.entries()]
  }, [cargo])
  const dischargeCalls = calls.map((c, i) => ({ c, i })).filter(({ c }) => isDischargeActivity(c.activity))

  // ── Simpan ──
  const validate = (): string | null => {
    if (!vesselId) return 'Vessel is required.'
    if (!voyageNo.trim()) return 'Voyage No is required.'
    if (!calls.length) return 'At least 1 port call is required.'
    const noPort = calls.findIndex(c => !c.port_id)
    if (noPort >= 0) return `Port call #${noPort + 1}: port is required.`
    const badQty = cargo.find(g => g.product.trim() && parseQtyInput(g.qty) === null)
    if (badQty) return `Cargo ${badQty.product}: quantity is not a valid number.`
    return null
  }

  const save = async (confirm: boolean) => {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setSaving(true)
    const nextPort = nextPortId ? portById.get(nextPortId) : null
    const payload: CostAgentVoyagePayload = {
      id: voyageId,
      vessel_id: vesselId!,
      company_code: companyCode || null,
      voyage_no: voyageNo.trim(),
      seq_in_report: seqInReport.trim() ? Number(seqInReport) : null,
      charter_type: charterType.trim() || null,
      report_month: monthToReportMonth(month),
      next_port: nextPort ? nextPort.code : null,
      next_eta_at: nextPort ? fromLocalInput(nextEta) : null,
      status: confirm ? 'confirmed' : (status ?? undefined),
      remarks: remarks.trim() || null,
      calls: calls.map((c, i) => ({
        seq: i + 1, port_id: c.port_id!, activity: c.activity,
        arrived_at: fromLocalInput(c.arrived_at), berthed_at: fromLocalInput(c.berthed_at), commenced_at: fromLocalInput(c.commenced_at),
        completed_at: fromLocalInput(c.completed_at), departed_at: fromLocalInput(c.departed_at),
      })),
      cargo: cargo.filter(g => g.product.trim() && parseQtyInput(g.qty) !== null).map(g => {
        const idx = calls.findIndex(c => c.key === g.callKey)
        return { product: g.product.trim().toUpperCase(), qty: parseQtyInput(g.qty)!, unit: g.unit || 'L15', call_seq: idx >= 0 ? idx + 1 : null }
      }),
    }
    try {
      const res = await costAgentSaveVoyage(payload, actor)
      setDirty(false)
      const msg = confirm ? 'Voyage confirmed.' : voyageId ? 'Voyage saved.' : 'Voyage created.'
      if (res.warnings?.length) {
        setSavedWarnings({ id: res.voyage_id, warnings: res.warnings })
        if (confirm) setStatus('confirmed')
      } else {
        onSaved(res.voyage_id, msg)
      }
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const vessel = vesselId ? vesselById.get(vesselId) : null
  const nextTz = nextPortId ? portById.get(nextPortId)?.tz : null

  const footer = savedWarnings ? (
    <button type="button" className={SA_BTN_PRIMARY} onClick={() => onSaved(savedWarnings.id, 'Voyage saved with warnings.')}>Close</button>
  ) : (
    <>
      <button type="button" className={SA_BTN_OUTLINE} onClick={requestClose} disabled={saving}>Cancel</button>
      {status === 'draft' && (
        <button type="button" className={SA_BTN_GREEN} onClick={() => save(true)} disabled={saving || loading || !!loadError}>
          <CheckCircle2 size={13} /> {saving ? 'Saving…' : 'Confirm'}
        </button>
      )}
      <button type="button" className={SA_BTN_PRIMARY} onClick={() => save(false)} disabled={saving || loading || !!loadError}>
        {saving ? 'Saving…' : voyageId ? 'Save changes' : 'Create voyage'}
      </button>
    </>
  )

  return (
    <CostAgentModal
      maxWidth="max-w-6xl"
      onClose={requestClose}
      title={<span className="flex items-center gap-2 flex-wrap">
        {voyageId ? 'Edit voyage' : 'New voyage'}
        {status === 'draft' && <Chip tone="amber">Draft — needs review</Chip>}
        {voyageId && <Chip tone={source === 'api' ? 'blue' : 'grey'}>{VOYAGE_SOURCE_LABEL[source]}</Chip>}
      </span>}
      subtitle="Voyage Report format: 1 load port + discharge ports in order. Times are port local time (LT)."
      footer={footer}
    >
      {loading ? <LoadingState fullHeight={false} /> : loadError ? (
        <div className="p-5 text-sm text-[#A8231A]">{loadError}</div>
      ) : savedWarnings ? (
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#17663D] font-semibold text-sm"><CheckCircle2 size={18} /> Voyage saved.</div>
          <div className="rounded-xl border border-[#F2D58A] bg-[#FFF8E6] p-4">
            <p className="text-[12.5px] font-bold text-[#7A4F00] mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Time order warnings (not blocking)</p>
            <ul className="text-[12.5px] text-[#7A4F00] list-disc pl-5 space-y-0.5">
              {savedWarnings.warnings.map((w, i) => {
                const label = TIME_FIELDS.find(t => t.key === w.field)?.label || w.field
                return <li key={i}>Port call #{w.seq} · {label}: {w.msg}</li>
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {lockedSource && (
            <div className="rounded-lg border border-[#C9D3F0] bg-[#EEF1FA] px-3 py-2 text-[12px] text-[#2F4FA8]">
              This voyage comes from the source system (API). Only Remarks can be edited here.
            </div>
          )}

          {/* Header */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <FieldLabel required hint={vessel ? [vessel.vessel_type, vessel.dwt ? `DWT ${fmtNumber(vessel.dwt, 0)}` : null].filter(Boolean).join(' · ') : undefined}>Vessel</FieldLabel>
              <CostAgentCombobox options={vesselOptions} value={vesselId} onChange={onVesselChange} placeholder="Search vessel…" disabled={lockedSource} />
            </div>
            <div>
              <FieldLabel>Company</FieldLabel>
              <select className={SA_INPUT} value={companyCode} disabled={lockedSource} onChange={e => { setCompanyCode(e.target.value); touch() }}>
                <option value="">—</option>
                {companies.map(c => <option key={c.code} value={c.code}>{c.code}{c.name && c.name !== c.code ? ` — ${c.name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel required>Voyage No</FieldLabel>
              <input className={SA_INPUT} value={voyageNo} disabled={lockedSource} onChange={e => { setVoyageNo(e.target.value); touch() }} placeholder="e.g. 5" />
            </div>
            <div>
              <FieldLabel>Seq in Report</FieldLabel>
              <input className={SA_INPUT} type="number" min={1} value={seqInReport} disabled={lockedSource} onChange={e => { setSeqInReport(e.target.value); touch() }} />
            </div>
            <div>
              <FieldLabel>Charter Type</FieldLabel>
              <input className={SA_INPUT} list="ca-charter-types" value={charterType} disabled={lockedSource} onChange={e => { setCharterType(e.target.value); touch() }} placeholder="COA / TC / SPOT" />
              <datalist id="ca-charter-types">{COST_AGENT_CHARTER_TYPES.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <FieldLabel>Report Month</FieldLabel>
              <input className={SA_INPUT} type="month" value={month} disabled={lockedSource} onChange={e => { setMonth(e.target.value); touch() }} />
            </div>
            <div />
            <div className="sm:col-span-2">
              <FieldLabel>Next Port</FieldLabel>
              <CostAgentCombobox options={portOptions} value={nextPortId} onChange={v => { setNextPortId(v === null ? null : Number(v)); touch() }} placeholder="Optional" disabled={lockedSource} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel hint={nextPortId ? tzAbbrev(nextTz) : undefined}>Next ETA</FieldLabel>
              <input className={SA_INPUT} type="datetime-local" value={nextEta} disabled={lockedSource || !nextPortId} onChange={e => { setNextEta(e.target.value); touch() }} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <FieldLabel>Remarks</FieldLabel>
              <textarea className={`${SA_INPUT} h-auto py-2`} rows={2} value={remarks} onChange={e => { setRemarks(e.target.value); touch() }} />
            </div>
          </section>

          {/* Port calls */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[14px] font-bold text-[#3B1B3D]">Port calls <span className="text-[#6E5E70] font-normal text-[12px]">({calls.length})</span></h3>
              {!lockedSource && (
                <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setCalls(prev => [...prev, emptyCall('bongkar')]); touch() }}>
                  <Plus size={13} /> Add discharge port
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              {calls.map((c, idx) => {
                const port = c.port_id ? portById.get(c.port_id) : null
                const zone = tzAbbrev(port?.tz)
                const warns = validateCallTimes({ seq: idx + 1, port: '', activity: c.activity, ...c })
                const handling = diffLocalHours(c.commenced_at, c.completed_at)
                const stay = diffLocalHours(c.arrived_at, c.departed_at)
                const up = moveCall(idx, -1), down = moveCall(idx, 1), removed = removeCall(idx)
                const invoicedTip = 'This port call already has invoices — it cannot be removed or moved.'
                const canUp = !!up && keepsInvoicedSeq(up)
                const canDown = !!down && keepsInvoicedSeq(down)
                const canRemove = calls.length > 1 && keepsInvoicedSeq(removed)
                return (
                  <div key={c.key} className={`${SA_CARD} p-3`}>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-8 h-9 rounded-lg bg-[#F5EDF3] text-[#6B3470] font-bold text-sm flex items-center justify-center shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-[220px]">
                        <FieldLabel required>Port</FieldLabel>
                        <CostAgentCombobox options={portOptions} value={c.port_id} onChange={v => updateCall(c.key, { port_id: v === null ? null : Number(v) })} placeholder="Code / name / alias…" disabled={lockedSource} allowClear={false} />
                      </div>
                      <div className="w-[170px]">
                        <FieldLabel>Activity</FieldLabel>
                        <select className={SA_INPUT} value={c.activity} disabled={lockedSource} onChange={e => updateCall(c.key, { activity: e.target.value as CostAgentActivity })}>
                          {COST_AGENT_ACTIVITIES.map(a => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}
                        </select>
                      </div>
                      <div className="text-[11.5px] text-[#6E5E70] leading-tight min-w-[120px]">
                        <div>Handling: <b className="text-[#3B1B3D]">{fmtHours(handling)}</b></div>
                        <div>Port stay: <b className="text-[#3B1B3D]">{fmtHours(stay)}</b></div>
                      </div>
                      {c.invoiceCount > 0 && <Chip tone="purple">{c.invoiceCount} invoice{c.invoiceCount > 1 ? 's' : ''}</Chip>}
                      {!lockedSource && (
                        <div className="flex items-center gap-1 ml-auto">
                          <button type="button" className={`${SA_BTN_OUTLINE} px-2`} aria-label="Move up" disabled={!canUp} title={up && !canUp ? invoicedTip : 'Move up'} onClick={() => applyCalls(up)}><ArrowUp size={13} /></button>
                          <button type="button" className={`${SA_BTN_OUTLINE} px-2`} aria-label="Move down" disabled={!canDown} title={down && !canDown ? invoicedTip : 'Move down'} onClick={() => applyCalls(down)}><ArrowDown size={13} /></button>
                          <button type="button" className={`${SA_BTN_OUTLINE} px-2 text-[#A8231A]`} aria-label="Remove port call" disabled={!canRemove}
                            title={!canRemove && calls.length > 1 ? invoicedTip : 'Remove'} onClick={() => applyCalls(removed)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2.5">
                      {TIME_FIELDS.map(t => (
                        <div key={t.key}>
                          <FieldLabel hint={zone}>{t.label}</FieldLabel>
                          <input className={SA_INPUT} type="datetime-local" value={c[t.key]} disabled={lockedSource} onChange={e => updateCall(c.key, { [t.key]: e.target.value } as Partial<CallRow>)} />
                        </div>
                      ))}
                    </div>
                    {warns.length > 0 && (
                      <div className="mt-2 rounded-md bg-[#FFF8E6] border border-[#F2D58A] px-2.5 py-1.5 text-[11.5px] text-[#7A4F00] flex items-start gap-1.5">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {warns.join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Cargo */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[14px] font-bold text-[#3B1B3D]">Cargo</h3>
              {!lockedSource && (
                <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setCargo(prev => [...prev, { key: newKey(), product: '', qty: '', unit: 'L15', callKey: '' }]); touch() }}>
                  <Plus size={13} /> Add product
                </button>
              )}
            </div>
            {cargo.length === 0 ? (
              <p className="text-[12px] text-[#8A7A8B] italic">No cargo yet.</p>
            ) : (
              <div className="space-y-2">
                <datalist id="ca-products">{COST_AGENT_PRODUCTS.map(p => <option key={p} value={p} />)}</datalist>
                {cargo.map(g => (
                  <div key={g.key} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_110px_1.4fr_auto] gap-2 items-end">
                    <div>
                      <FieldLabel>Product</FieldLabel>
                      <input className={SA_INPUT} list="ca-products" value={g.product} disabled={lockedSource} onChange={e => updateCargo(g.key, { product: e.target.value })} />
                    </div>
                    <div>
                      <FieldLabel>Qty</FieldLabel>
                      <input className={`${SA_INPUT} text-right tabular-nums`} inputMode="decimal" value={g.qty} disabled={lockedSource} onChange={e => updateCargo(g.key, { qty: e.target.value })}
                        title={parseQtyInput(g.qty) !== null ? fmtNumber(parseQtyInput(g.qty), 3) : undefined} />
                    </div>
                    <div>
                      <FieldLabel>Unit</FieldLabel>
                      <select className={SA_INPUT} value={g.unit} disabled={lockedSource} onChange={e => updateCargo(g.key, { unit: e.target.value })}>
                        {COST_AGENT_CARGO_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Discharge port</FieldLabel>
                      <select className={SA_INPUT} value={g.callKey} disabled={lockedSource} onChange={e => updateCargo(g.key, { callKey: e.target.value })}>
                        <option value="">—</option>
                        {dischargeCalls.map(({ c, i }) => <option key={c.key} value={c.key}>#{i + 1} {c.port_id ? portById.get(c.port_id)?.code : '(no port)'}</option>)}
                      </select>
                    </div>
                    {!lockedSource && (
                      <button type="button" className={`${SA_BTN_OUTLINE} px-2 text-[#A8231A]`} aria-label="Remove product" onClick={() => { setCargo(prev => prev.filter(x => x.key !== g.key)); touch() }}><Trash2 size={13} /></button>
                    )}
                  </div>
                ))}
                {cargoTotals.length > 0 && (
                  <div className="text-[12px] text-[#3B1B3D] pt-1">
                    Total: {cargoTotals.map(([u, n]) => <b key={u} className="mr-3 tabular-nums">{fmtNumber(n, 3)} {u}</b>)}
                  </div>
                )}
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A] flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </CostAgentModal>
  )
}
