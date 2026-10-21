// Tampilan KARTU Invoice Recap Sea & Air (2026-10-01) -- 5 kartu KPI + daftar shipment 4 kolom.
// Murni tampilan: baris = `records` SharedDataTable (query lama + enrichment % & issues).
import React, { useState } from 'react'
import { SA_CARD, SA_LABEL, Chip, Pill, PtBadge, type Tone } from './SeaAirAuditUi'
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
      {/* Landed cost & Duty & tax ditulis penuh dlm rupiah (2026-10-14, permintaan user; dulu ringkas "Rp 75,9M"). */}
      {card('Landed cost', v(s => fmtRp(s.landedSum)), 'invoices only (excl. duty & tax)')}
      {card('Duty & tax', v(s => fmtRp(s.dutySum)), 'paid via Billing DJBC · not in landed cost')}
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

const RecapRowCard: React.FC<{ rec: any; onOpen: (rec: any) => void; selected?: boolean; compact?: boolean }> = ({ rec, onOpen, selected = false, compact = false }) => {
  const [expanded, setExpanded] = useState(false)
  const issues: RecapIssue[] = rec.recap_issues || []
  const status = recapStatus(rec, issues)
  const pos = parsePoDetail(rec)
  const poManual = parsePoManual(rec)
  const partialOf = (po: string) => {
    const m = poManualFor(poManual, po)
    return m?.partial ? `◐ P${m.partial_no || ''}` : null
  }
  // Seluruh kartu bisa diklik (2026-10-13, permintaan user) = sama tombol Validation. Klik di tombol/tautan di dalam kartu (+N PO, Validation)
  // tidak ikut membuka; memilih/menyalin teks (mis. nomor AWB) juga tidak membuka kartu.
  const openFromCard = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    const sel = typeof window !== 'undefined' ? window.getSelection?.()?.toString() : ''
    if (sel) return
    onOpen(rec)
  }
  const lc = computeLandedCost(rec)
  const border = status.kind === 'submitted' ? 'border-l-[#17663D]' : status.kind === 'issues' ? 'border-l-[#E0A526]' : 'border-l-[#D9CFD6]'
  const has = rec.recap_has || {}
  // Kartu ringkas (panel terbuka, daftar di kiri): ATD/ATA kembali di-highlight (chip, 2026-10-15 susulan, permintaan user).
  const dateChip = (label: string, v: any, blue = false) => (
    <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md text-[10.5px] whitespace-nowrap ${v ? (blue ? 'bg-[#EEF1FA] text-[#2F4FA8]' : 'bg-[#F6EFEA] text-[#3B1B3D]') : 'bg-[#F6F3F4] text-[#8A7A8B]'}`}><b>{label}</b>{v ? fmtDateShort(v) : '—'}</span>
  )
  // Kartu lebar: tanggal sebagai teks biasa "ATD: 13 Jun 2026" (2026-10-15, permintaan user: ATD/ATA tidak di-highlight).
  const dateText = (label: string, v: any) => (
    <span className="whitespace-nowrap"><span className="text-[#8A7A8B]">{label}:</span> {v ? fmtDateShort(v) : '—'}</span>
  )

  // Mode RINGKAS (2026-10-12, gambar user): dipakai saat panel samping terbuka (daftar menyempit) -- 2 kolom, tidak memanjang ke bawah.
  // Kiri: jenis · PT + kontainer, AWB, supplier, status (Not submitted + Ready / N issues). Kanan: Uploaded · ATD · ATA, PO, Origin,
  // Landed cost, tombol. Tanpa Cost mix & titik skor (angkanya ada di header panel).
  if (compact) {
    const type = String(rec.shipment_type || '').toUpperCase()
    const cnt = rec.container_count
    const ct = String(rec.container_type || '').trim()
    const contChip = type === 'FCL' && (cnt || ct) ? `${cnt || '?'} × ${ct || '—'}` : null
    return (
      <div className={`@container ${SA_CARD} border-l-4 ${border} overflow-hidden cursor-pointer ${selected ? 'ring-2 ring-[#6B3470]' : 'hover:border-[#D9C7DA]'}`} data-recap-card={rec.id} data-compact aria-current={selected || undefined} onClick={openFromCard}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 px-3.5 py-3">
          <div className="min-w-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="grey">{[type || '—', rec.a_n].filter(Boolean).join(' · ')}</Chip>
              {contChip && <Chip tone="blue">{contChip}</Chip>}
              {rec.duplicate_of && <Chip tone="red" title="Another Invoice Recap row with the same BL / AWB already exists">Duplicate?</Chip>}
            </div>
            <div className="text-[15px] font-bold text-[#3B1B3D] truncate mt-1.5" title={rec.awb || ''}>{rec.awb || '—'}</div>
            <div className="text-[11.5px] font-semibold uppercase text-[#6E5E70] truncate" title={rec.vendor || ''}>{rec.vendor || '—'}</div>
            {/* Nomor PO di kolom kiri, tepat di bawah nama supplier (2026-10-12, permintaan user). */}
            <div className="flex items-start gap-1.5 mt-1.5 text-[11.5px] text-[#3B1B3D] min-w-0">
              {pos.length === 0 ? <span className="text-[#6E5E70]">No PO</span> : (
                <>
                  <div className="min-w-0">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p.po_no}>{p.po_no || '—'}{partialOf(p.po_no) && <span className="ml-1 text-[10px] font-bold text-[#6B3470]" title="Partial shipment of this PO">{partialOf(p.po_no)}</span>}</div>)}</div>
                  {pos.length > 1 && (
                    <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                      {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2.5">
              {status.kind === 'submitted'
                ? <Pill tone="green">{status.label}</Pill>
                : (
                  <>
                    <Pill tone="grey">Not submitted</Pill>
                    {issues.length > 0
                      ? <Chip tone="amber" title={issues.map(i => `• ${i.text}`).join(' ')}>⚠ {issues.length} issue{issues.length === 1 ? '' : 's'}</Chip>
                      : <Chip tone="blue">Ready</Chip>}
                  </>
                )}
            </div>
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="text-[11px] text-[#8A7A8B]">
              Uploaded {fmtDateShort(rec.created_at || rec.tgl)}
            </div>
            {/* ATD / ATA di bawah tanggal Uploaded (2026-10-12: posisi ATD/ATA & nomor PO ditukar, permintaan user). */}
            {/* ATD / ATA di-highlight (chip) di kartu ringkas saja (2026-10-15, permintaan user). */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5" data-card-atd-ata>
              {dateChip('ATD', rec.atd)}{dateChip('ATA', rec.ata, true)}
            </div>
            <div className="text-[11.5px] text-[#6E5E70] truncate mt-1.5" title={`${rec.origin || '—'} → ${rec.destination || '—'}`}>Origin: {rec.origin || '—'}</div>
            <div className={`${SA_LABEL} mt-2`}>Landed cost</div>
            <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(lc.landed)}</div>
            <button type="button" onClick={() => onOpen(rec)} aria-pressed={selected}
              className={`mt-2 self-start inline-flex items-center justify-center px-4 h-8 rounded-xl text-white text-xs font-semibold ${selected ? 'bg-[#3B1B3D]' : 'bg-[#6B3470] hover:bg-[#5A2A5E]'}`}>Validation</button>
          </div>
        </div>
      </div>
    )
  }

  // Susunan kartu lebar (2026-10-15, gambar user): 4 kolom -- [chip jenis + PT, AWB, Upload] | [vendor, rute, ATD/ATA & ETD/ETA teks biasa]
  // | [NO. PO] | [titik skor 1 baris] | [LANDED COST, status + Validation]. ATD/ATA TIDAK di-highlight lagi (teks biasa, permintaan user); Cost mix
  // bar dihapus dari kartu (rinciannya tetap di jendela Validation). Lebar kolom ikut lebar kartu (container query): @5xl = 14", @7xl = 24".
  return (
    <div className={`@container ${SA_CARD} border-l-4 ${border} overflow-hidden cursor-pointer ${selected ? 'ring-2 ring-[#6B3470]' : 'hover:border-[#D9C7DA]'}`} data-recap-card={rec.id} aria-current={selected || undefined} onClick={openFromCard}>
      {/* 2026-10-15 (permintaan user): titik skor = kolom SENDIRI di samping NO. PO, 1 baris sejajar (dulu di bawah nomor PO).
          Susulan: kolom NO. PO & skor `auto` (ikut isi -> nomor PO utuh di 14"); sisa lebar DIBAGI ke kolom AWB : vendor : landed cost
          (1fr : 2fr : 1fr) supaya di 24" tidak ada satu ruang kosong besar setelah vendor. */}
      {/* Susulan 2 (2026-10-15, permintaan user): kolom NO. PO & skor LEBAR TETAP (dulu `auto` -> posisi PO bergeser antar kartu bila ada /
          tidak ada "+N PO"); skor diberi jarak dari PO. Baris kolom 1 & 2 disejajarkan: chip | vendor, AWB | rute, Upload | ATD/ATA. */}
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-[minmax(160px,1fr)_minmax(0,2fr)_215px_275px_minmax(170px,1fr)] @7xl:grid-cols-[minmax(200px,1fr)_minmax(0,1.4fr)_minmax(240px,1fr)_minmax(300px,1fr)_minmax(200px,1fr)] gap-x-4 @7xl:gap-x-6 gap-y-3 px-4 py-3.5 items-start">
        {/* 1. Jenis + PT, AWB, tanggal upload */}
        <div className="min-w-0">
          {/* Chip jenis/kontainer & PT ber-highlight seperti semula (biru + badge PT ungu, 2026-10-15 susulan, permintaan user). */}
          <div className="flex flex-nowrap items-center gap-1.5 h-[22px] overflow-hidden">
            <Chip tone="blue">{containerLabel(rec)}</Chip>
            {rec.a_n && <PtBadge code={rec.a_n} />}
            {rec.duplicate_of && <Chip tone="red" title="Another Invoice Recap row with the same BL / AWB already exists">Duplicate?</Chip>}
          </div>
          <div className="text-[16px] font-bold text-[#3B1B3D] truncate mt-1.5 leading-[24px]" title={rec.awb || ''}>{rec.awb || '—'}</div>
          <div className="text-[11.5px] text-[#6E5E70] mt-0.5 leading-[18px]">Upload: {fmtDateShort(rec.created_at || rec.tgl)}</div>
        </div>

        {/* 2. Vendor, rute, tanggal */}
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#3B1B3D] uppercase truncate leading-[22px]" title={rec.vendor || ''}>{rec.vendor || '—'}</div>
          <div className="text-[11.5px] text-[#6E5E70] truncate mt-1.5 leading-[24px]" title={`${rec.origin || '—'} → ${rec.destination || '—'}`}>{rec.origin || '—'} → {rec.destination || '—'}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 leading-[18px] text-[11.5px] text-[#3B1B3D]" data-card-atd-ata>
            {dateText('ATD', rec.atd)}{dateText('ATA', rec.ata)}
          </div>
          {(rec.etd || rec.eta) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#3B1B3D]">
              {rec.etd && dateText('ETD', rec.etd)}{rec.eta && dateText('ETA', rec.eta)}
            </div>
          )}
        </div>

        {/* 3. NO. PO */}
        <div className="min-w-0">
          <div className={SA_LABEL}>No. PO</div>
          {pos.length === 0 ? <div className="text-[12.5px] text-[#6E5E70] mt-0.5">No PO</div> : (
            <div className="flex items-start gap-x-1.5 min-w-0 mt-0.5" data-card-po>
              <div className="min-w-0 text-[13px] font-normal text-[#3B1B3D]">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p.po_no}>{p.po_no || '—'}{partialOf(p.po_no) && <span className="ml-1 text-[10px] font-bold text-[#6B3470]" title="Partial shipment of this PO">{partialOf(p.po_no)}</span>}</div>)}</div>
              {pos.length > 1 && (
                <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0 mt-0.5 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                  {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 4. Status (Ready to submit / issues / Submitted) DI ATAS skor validasi -- 1 baris skor (kartu sempit < @5xl boleh turun baris).
            Rata tengah di kartu lebar supaya tetap terpisah dari NO. PO saat di-zoom out (2026-10-21, permintaan user). */}
        <div className="min-w-0 flex flex-col items-start gap-1.5" data-card-scores>
          <Chip tone={statusTone(status.kind)} title={issues.length ? issues.map(i => `• ${i.text}`).join('\n') : undefined}>{status.label}</Chip>
          <div className="flex flex-wrap @5xl:flex-nowrap items-center gap-x-2.5 gap-y-1 whitespace-nowrap">
            <ScoreDot label="Doc match" pct={rec.doc_validation_pct} has={!!has.doc} />
            <ScoreDot label="Cost" pct={rec.cost_validation_pct} has={!!has.cost} />
            <ScoreDot label="Doc complete" pct={rec.checklist_pct} has={!!has.checklist} />
          </div>
        </div>

        {/* 5. Landed cost + Validation */}
        <div className="min-w-0 flex flex-col @5xl:items-end gap-1">
          <div className={SA_LABEL}>Landed cost</div>
          <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(lc.landed)}</div>
          <div className="flex flex-wrap items-center @5xl:justify-end gap-1.5 mt-1">
            <button type="button" onClick={() => onOpen(rec)} aria-pressed={selected}
              className={`inline-flex items-center justify-center px-3.5 h-7 rounded-xl text-white text-xs font-semibold ${selected ? 'bg-[#3B1B3D]' : 'bg-[#6B3470] hover:bg-[#5A2A5E]'}`}>Validation</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// `selectedId` = kartu yang sedang terbuka di panel samping (diberi ring).
export const SeaAirRecapCardList: React.FC<{ rows: any[]; onOpen: (rec: any) => void; selectedId?: any; compact?: boolean }> = ({ rows, onOpen, selectedId = null, compact = false }) => (
  <div className="flex flex-col gap-2.5">
    {rows.map(rec => <RecapRowCard key={rec.id} rec={rec} onOpen={onOpen} compact={compact} selected={selectedId !== null && selectedId !== undefined && String(selectedId) === String(rec.id)} />)}
  </div>
)
