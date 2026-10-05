// Tampilan KARTU Invoice Recap Sea & Air (2026-10-01) -- 5 kartu KPI + daftar shipment 4 kolom.
// Murni tampilan: baris = `records` SharedDataTable (query lama + enrichment % & issues).
import React, { useState } from 'react'
import { SA_CARD, SA_LABEL, Chip, PtBadge, type Tone } from './SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort } from '../utils/SeaAirAuditHelpers'
import {
  computeLandedCost, parsePoDetail, recapStatus, COST_GROUP_COLORS, COST_GROUP_LABELS, parsePoManual, poManualFor,
  type RecapSummary, type RecapIssue, type CostGroupKey,
} from '../utils/SeaAirRecapHelpers'

export const SeaAirRecapKpiCards: React.FC<{ summary: RecapSummary | null; loading: boolean }> = ({ summary, loading }) => {
  const v = (fn: (s: RecapSummary) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]') => (
    <div className={`${SA_CARD} px-4 py-3 min-w-0`}>
      <div className="text-[11.5px] font-semibold text-[#6E5E70]">{label}</div>
      <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
    </div>
  )
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {card('Shipments', v(s => s.total), v(s => `${s.fcl} FCL · ${s.lcl} LCL · ${s.air} AIR`))}
      {card('Landed cost', v(s => fmtRpShort(s.landedSum)), 'invoices only (excl. duty & tax)')}
      {card('Duty & tax', v(s => fmtRpShort(s.dutySum)), 'paid via Billing DJBC · not in landed cost')}
      {card('Needs attention', v(s => s.needsAttention), 'low score not yet confirmed', 'text-[#A8231A]')}
      {card('Not submitted to Finance', v(s => s.notSubmitted), v(s => fmtRpShort(s.notSubmittedLanded)), 'text-[#7A4F00]')}
    </div>
  )
}

// Bar kelompok biaya (tanpa duty & tax -- landed cost = invoice saja).
export const CostMixBar: React.FC<{ groups: Record<CostGroupKey, number>; total: number; height?: number }> = ({ groups, total, height = 6 }) => {
  const keys: CostGroupKey[] = ['ppjk', 'origin', 'local']
  const title = keys.map(k => `${COST_GROUP_LABELS[k]}: ${fmtRp(groups[k])}${total > 0 ? ` (${Math.round(groups[k] / total * 1000) / 10}%)` : ''}`).join('\n')
  return (
    <div className="w-full rounded-full overflow-hidden bg-[#F3EEEA] flex" style={{ height }} title={title}>
      {total > 0 && keys.map(k => groups[k] > 0 ? <div key={k} style={{ width: `${groups[k] / total * 100}%`, background: COST_GROUP_COLORS[k] }} /> : null)}
    </div>
  )
}

export const CostMixLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6E5E70]">
    <span className="text-[#8A7A8B]">Cost mix</span>
    {(['ppjk', 'origin', 'local'] as CostGroupKey[]).map(k => (
      <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COST_GROUP_COLORS[k] }} />{COST_GROUP_LABELS[k]}</span>
    ))}
  </div>
)

// Titik skor: hijau = 100% (tanpa angka), oranye/merah + % kalau < 100, abu = belum ada data.
export const ScoreDot: React.FC<{ label: string; pct: number | null | undefined; has: boolean }> = ({ label, pct, has }) => {
  if (!has || pct === null || pct === undefined) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-[#8A7A8B]" title="No data yet"><span className="w-2 h-2 rounded-full bg-[#CFC6CC]" />{label}</span>
  }
  const color = pct >= 100 ? 'bg-[#17663D]' : pct >= 60 ? 'bg-[#E0A526]' : 'bg-[#A8231A]'
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#3B1B3D]">
      <span className={`w-2 h-2 rounded-full ${color}`} />{label}{pct < 100 && <b className={pct >= 60 ? 'text-[#7A4F00]' : 'text-[#A8231A]'}>{pct}%</b>}
    </span>
  )
}

export const containerLabel = (rec: any) => {
  const type = String(rec.shipment_type || '').toUpperCase()
  const cnt = rec.container_count
  const ct = String(rec.container_type || '').trim()
  if (type === 'FCL' && (cnt || ct)) return `FCL · ${cnt || '?'} × ${ct || '—'}`
  return type || '—'
}

export const statusTone = (kind: string): Tone => (kind === 'submitted' ? 'green' : kind === 'issues' ? 'amber' : 'blue')

const RecapRowCard: React.FC<{ rec: any; onOpen: (rec: any) => void }> = ({ rec, onOpen }) => {
  const [expanded, setExpanded] = useState(false)
  const issues: RecapIssue[] = rec.recap_issues || []
  const status = recapStatus(rec, issues)
  const pos = parsePoDetail(rec)
  const poManual = parsePoManual(rec)
  const partialOf = (po: string) => {
    const m = poManualFor(poManual, po)
    return m?.partial ? `◐ P${m.partial_no || ''}` : null
  }
  const lc = computeLandedCost(rec)
  const border = status.kind === 'submitted' ? 'border-l-[#17663D]' : status.kind === 'issues' ? 'border-l-[#E0A526]' : 'border-l-[#D9CFD6]'
  const has = rec.recap_has || {}
  const dateChip = (label: string, v: any, blue = false) => v ? (
    <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md text-[10.5px] whitespace-nowrap ${blue ? 'bg-[#EEF1FA] text-[#2F4FA8]' : 'bg-[#F6EFEA] text-[#3B1B3D]'}`}><b>{label}</b>{fmtDateShort(v)}</span>
  ) : null

  return (
    <div className={`@container ${SA_CARD} border-l-4 ${border} overflow-hidden`}>
      {/* Susunan 2026-10-05 (gambar user): supplier = judul + chip rute; baris 2 = PO + tanggal.
          Lebar kolom ikut LEBAR KARTU (container query): @5xl = laptop 14" (ringkas), @7xl = monitor 24" (lega). */}
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-[180px_minmax(0,1fr)_200px_180px] @7xl:grid-cols-[220px_minmax(0,1fr)_250px_220px] gap-x-4 @7xl:gap-x-6 gap-y-3 px-4 py-3.5 items-center">
        {/* 1. Identitas */}
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-[#3B1B3D] truncate" title={rec.awb || ''}>{rec.awb || '—'}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <Chip tone="blue">{containerLabel(rec)}</Chip>
            {rec.a_n && <PtBadge code={rec.a_n} />}
            {rec.duplicate_of && <Chip tone="red" title="Another Invoice Recap row with the same BL / AWB already exists">Duplicate?</Chip>}
          </div>
          <div className="text-[11px] text-[#8A7A8B] mt-1">Uploaded {fmtDateShort(rec.created_at || rec.tgl)}</div>
        </div>

        {/* 2. Supplier + rute, lalu PO + tanggal */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            <span className="text-[13px] font-bold text-[#3B1B3D] uppercase truncate max-w-full" title={rec.vendor || ''}>{rec.vendor || '—'}</span>
            <span className="inline-flex items-center px-2.5 py-[2px] rounded-full bg-[#EFE8EC] text-[#3B1B3D] text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap max-w-full truncate"
              title={`${rec.origin || '—'} → ${rec.destination || '—'}`}>
              {rec.origin || '—'} <span className="mx-1 text-[#8A7A8B]">→</span> {rec.destination || '—'}
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 mt-1.5 text-[11px] text-[#6E5E70] min-w-0">
            {pos.length === 0 ? <span>No PO</span> : (
              <div className="flex items-start gap-1.5 min-w-0">
                <div className="min-w-0">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p.po_no}>{p.po_no || '—'}{partialOf(p.po_no) && <span className="ml-1 text-[10px] font-bold text-[#6B3470]" title="Partial shipment of this PO">{partialOf(p.po_no)}</span>}</div>)}</div>
                {pos.length > 1 && (
                  <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                    {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                  </button>
                )}
              </div>
            )}
            {dateChip('ETD', rec.etd)}{dateChip('ETA', rec.eta)}{dateChip('ATA', rec.ata, true)}
          </div>
        </div>

        {/* 3. Status */}
        <div className="min-w-0 flex flex-col gap-1.5 items-start">
          <Chip tone={statusTone(status.kind)} title={issues.length ? issues.map(i => `• ${i.text}`).join('\n') : undefined}>{status.label}</Chip>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            <ScoreDot label="Doc match" pct={rec.doc_validation_pct} has={!!has.doc} />
            <ScoreDot label="Cost" pct={rec.cost_validation_pct} has={!!has.cost} />
            <ScoreDot label="Doc complete" pct={rec.checklist_pct} has={!!has.checklist} />
          </div>
        </div>

        {/* 4. Biaya */}
        <div className="min-w-0 flex flex-col @5xl:items-end gap-1.5">
          <div className={SA_LABEL}>Landed cost</div>
          <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(lc.landed)}</div>
          <div className="w-full max-w-[200px]"><CostMixBar groups={lc.groups} total={lc.groups.ppjk + lc.groups.origin + lc.groups.local} /></div>
          <button type="button" onClick={() => onOpen(rec)} className="inline-flex items-center justify-center px-4 h-8 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold">Open</button>
        </div>
      </div>
    </div>
  )
}

export const SeaAirRecapCardList: React.FC<{ rows: any[]; onOpen: (rec: any) => void }> = ({ rows, onOpen }) => (
  <div className="flex flex-col gap-2.5">
    {rows.map(rec => <RecapRowCard key={rec.id} rec={rec} onOpen={onOpen} />)}
  </div>
)
