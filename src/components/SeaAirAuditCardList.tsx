// Tampilan KARTU Audit PIB Sea & Air (2026-09-30) -- kartu KPI + daftar PIB 4 kolom.
// Murni tampilan: data baris = `records` SharedDataTable (query lama), info validasi/link =
// `fetchSeaAirAuditLinkInfo` (baca saja). Tabel lama (List) tetap ada lewat toggle List/Card.
import React, { useState } from 'react'
import { SA_CARD, SA_LABEL, Chip, PtBadge } from './SeaAirAuditUi'
import {
  fmtRp, fmtRpShort, fmtDateShort, fmtPctShort, formatNoAju, splitMulti, computeDutyRows, isSeaAirDraft,
  companyFullName, validationLabel, VALIDATION_META, type SeaAirAuditLinkInfo, type SeaAirAuditSummary,
} from '../utils/SeaAirAuditHelpers'

// ─── Kartu KPI ────────────────────────────────────────────────────────────────
export const SeaAirAuditKpiCards: React.FC<{ summary: SeaAirAuditSummary | null; loading: boolean }> = ({ summary, loading }) => {
  const v = (fn: (s: SeaAirAuditSummary) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]') => (
    <div className={`${SA_CARD} px-4 py-3 min-w-0`}>
      <div className="text-[11.5px] font-semibold text-[#6E5E70]">{label}</div>
      <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
    </div>
  )
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {card('PIB records', v(s => s.total), v(s => `${s.draft} draft · ${s.audited} audited`))}
      {card('Customs value', v(s => fmtRpShort(s.cvSum)), 'CIF value in rupiah')}
      {card('Duties & taxes (PIB)', v(s => fmtRpShort(s.dutySum)), v(s => `BM ${fmtRpShort(s.bmSum)} · PPN ${fmtRpShort(s.ppnSum)} · PPh ${fmtRpShort(s.pphSum)}`))}
      {card('Not validated yet', v(s => (s.notValidated === null ? '—' : s.notValidated)), 'draft PIB waiting for Invoice Recap validation', 'text-[#A8231A]')}
    </div>
  )
}

// ─── Baris kartu PIB ──────────────────────────────────────────────────────────
const SeaAirAuditRowCard: React.FC<{
  rec: any
  info?: SeaAirAuditLinkInfo
  companyNames: Record<string, string>
  onOpen: (rec: any) => void
}> = ({ rec, info, companyNames, onOpen }) => {
  const [expanded, setExpanded] = useState(false)
  const draft = isSeaAirDraft(rec)
  const pos = splitMulti(rec.po_ori)
  const duty = computeDutyRows(rec)
  const rate = (k: 'bm' | 'ppn' | 'pph') => fmtPctShort(duty.rows.find(r => r.key === k)?.rate ?? null)
  const hasDiff = info?.validation === 'differences'
  const borderColor = !draft ? 'border-l-[#17663D]' : hasDiff ? 'border-l-[#A8231A]' : 'border-l-[#E0A526]'
  const via = String(rec.via || '').toUpperCase()
  const term = String(rec.delivery_term || '').trim()
  // Chip "Waiting for SPPB" (pengganti banner kuning spek): Draft yg checklist dokumen bea cukai-nya
  // di Invoice Recap belum lengkap (PIB/SPPB/Billing DJBC/BPN).
  const waitingDocs = draft && info?.missingDocs && info.missingDocs.length > 0 ? info.missingDocs : null
  const reaudit = draft && !!rec.reaudit_reason

  return (
    <div className={`@container ${SA_CARD} border-l-4 ${borderColor} overflow-hidden`}>
      {/* Susunan 2026-10-05 (gambar user): 5 kolom -- PIB | PT+supplier+PO | validasi | duty | status+Open.
          Lebar kolom ikut LEBAR KARTU (container query): @5xl = laptop 14" (ringkas), @7xl = monitor 24" (lega). */}
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-[215px_minmax(0,1fr)_185px_165px_92px] @7xl:grid-cols-[260px_minmax(0,1fr)_230px_200px_110px] gap-x-4 @7xl:gap-x-6 gap-y-3 px-4 py-3.5 items-center">
        {/* 1. PIB */}
        <div className="min-w-0">
          <div className="text-[11px] text-[#8A7A8B] font-medium">PIB · {fmtDateShort(rec.tgl_ppjk)}</div>
          <div className="text-[13.5px] font-bold text-[#3B1B3D] truncate tabular-nums" title={formatNoAju(rec.no_aju) || ''}>{formatNoAju(rec.no_aju) || '—'}</div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {via && <Chip tone="blue">{via}</Chip>}
            {term && <Chip tone="plum">{term}</Chip>}
            <span className="text-[11px] text-[#6E5E70] truncate" title={rec.awb || ''}>{rec.awb || '—'}</span>
          </div>
        </div>

        {/* 2. PT + supplier + PO */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <PtBadge code={rec.impor_an} title={companyFullName(companyNames, rec.impor_an)} />
            <span className="text-[13px] font-bold text-[#3B1B3D] truncate" title={rec.vendor || ''}>{rec.vendor || '—'}</span>
          </div>
          <div className="mt-1 text-[11.5px] text-[#6E5E70] min-w-0">
            {pos.length === 0 ? (
              <span>No PO</span>
            ) : (
              <div className="flex items-start gap-1.5 min-w-0">
                <div className="min-w-0">
                  {(expanded ? pos : pos.slice(0, 1)).map((p, i) => (
                    <div key={i} className="truncate" title={p}>{p}</div>
                  ))}
                </div>
                {pos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]"
                  >
                    {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Validasi Invoice Recap + field yang beda */}
        <div className="min-w-0 flex flex-col items-start gap-1.5">
          <Chip tone={info ? VALIDATION_META[info.validation].tone : 'grey'} title={info ? (hasDiff ? `Fields: ${info.diffFields.join(', ')}` : VALIDATION_META[info.validation].sub) : undefined}>{validationLabel(info)}</Chip>
          {(hasDiff || waitingDocs || reaudit || rec.duplicate_of) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {hasDiff && <Chip tone="amber" title={info!.diffFields.join(', ')}>{info!.diffFields.slice(0, 2).join(', ')}{info!.diffFields.length > 2 ? ` +${info!.diffFields.length - 2}` : ''}</Chip>}
              {reaudit && <Chip tone="purple" title={rec.reaudit_reason}>↻ re-audit</Chip>}
              {rec.duplicate_of && <Chip tone="red" title="Another PIB with the same BL / AWB already exists">Possible duplicate</Chip>}
              {waitingDocs && <Chip tone="amber" title="Customs documents still missing in the Invoice Recap checklist">Waiting for {waitingDocs.join(', ')}</Chip>}
            </div>
          )}
        </div>

        {/* 3. Duty & tax */}
        <div className="@5xl:text-right min-w-0">
          <div className={SA_LABEL}>Duty &amp; tax</div>
          <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(rec.total_pib)}</div>
          <div className="text-[11px] text-[#6E5E70] tabular-nums">
            BM <b className="text-[#3B1B3D]">{rate('bm')}</b> · PPN <b className="text-[#3B1B3D]">{rate('ppn')}</b> · PPh <b className="text-[#3B1B3D]">{rate('pph')}</b>
          </div>
        </div>

        {/* 5. Status + Open */}
        <div className="flex flex-col @5xl:items-end gap-1.5 min-w-0">
          <Chip tone={draft ? 'amber' : 'green'}>{draft ? 'Draft' : 'Audited'}</Chip>
          <button type="button" onClick={() => onOpen(rec)} className="inline-flex items-center justify-center px-4 h-8 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold">Open</button>
        </div>
      </div>
    </div>
  )
}

export const SeaAirAuditCardList: React.FC<{
  rows: any[]
  linkInfo: Record<string, SeaAirAuditLinkInfo>
  companyNames: Record<string, string>
  onOpen: (rec: any) => void
}> = ({ rows, linkInfo, companyNames, onOpen }) => (
  <div className="flex flex-col gap-2.5">
    {rows.map(rec => (
      <SeaAirAuditRowCard key={rec.id} rec={rec} info={linkInfo[String(rec.id)]} companyNames={companyNames} onOpen={onOpen} />
    ))}
  </div>
)
