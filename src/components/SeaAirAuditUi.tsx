// Token visual & komponen kecil Audit PIB Sea & Air (2026-09-30, spek "BeeHive AI · Audit PIB").
// KHUSUS halaman/modal Audit PIB (kartu, Open, Edit) -- font TETAP Sora bawaan app (keputusan user),
// warna mengikuti spek: plum #3B1B3D, primer #6B3470, garis #EADFD6, teks samar #6E5E70.
import React from 'react'
import { VALIDATION_META, validationLabel, type SeaAirAuditLinkInfo } from '../utils/SeaAirAuditHelpers'

export const SA = {
  plum: '#3B1B3D',
  primary: '#6B3470',
  border: '#EADFD6',
  muted: '#6E5E70',
  label: '#8A7A8B',
  warm: '#FBF7F4',
  warm2: '#F6EFEA',
}

// Kelas Tailwind yang dipakai berulang
export const SA_CARD = 'bg-white rounded-[14px] border border-[#EADFD6] shadow-[0_1px_2px_rgba(59,27,61,0.04)]'
export const SA_LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]'
export const SA_TEXT = 'text-[#3B1B3D]'
export const SA_MUTED = 'text-[#6E5E70]'
export const SA_BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const SA_BTN_OUTLINE = 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-white border border-[#EADFD6] hover:border-[#6B3470]/40 hover:bg-[#FBF7F4] text-[#3B1B3D] text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const SA_BTN_GREEN = 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#17663D] hover:bg-[#12532F] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const SA_INPUT = 'w-full h-9 px-3 rounded-lg border border-[#EADFD6] bg-white text-[13px] text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 disabled:bg-[#F6EFEA] disabled:text-[#6E5E70]'

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey' | 'plum' | 'purple'
const TONE: Record<Tone, string> = {
  green: 'bg-[#EAF6EF] text-[#17663D]',
  amber: 'bg-[#FFF1D6] text-[#7A4F00]',
  red: 'bg-[#FDE7E4] text-[#A8231A]',
  blue: 'bg-[#EEF1FA] text-[#2F4FA8]',
  grey: 'bg-[#F3EEEA] text-[#6E5E70]',
  plum: 'bg-[#F5EDF3] text-[#6B3470]',
  purple: 'bg-[#EFE7F7] text-[#5B2E8C]',
}

export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; title?: string }> = ({ tone = 'grey', children, className = '', title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap ${TONE[tone]} ${className}`}>{children}</span>
)

export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode; title?: string }> = ({ tone = 'grey', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONE[tone]}`}>{children}</span>
)

export const StatusPill: React.FC<{ draft: boolean }> = ({ draft }) => (
  <Pill tone={draft ? 'amber' : 'green'}>{draft ? 'Draft' : 'Audited'}</Pill>
)

export const PtBadge: React.FC<{ code: any; title?: string }> = ({ code, title }) => (
  <span title={title} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#3B1B3D] text-white text-[10.5px] font-bold tracking-wide shrink-0">{String(code || '—')}</span>
)

export const ValidationPill: React.FC<{ info?: SeaAirAuditLinkInfo | null }> = ({ info }) => {
  const tone: Tone = !info ? 'grey' : VALIDATION_META[info.validation].tone
  const title = info?.validation === 'differences' ? `Fields: ${info.diffFields.join(', ')}` : info ? VALIDATION_META[info.validation].sub : undefined
  return <Pill tone={tone} title={title}>{validationLabel(info)}</Pill>
}

export const SectionCard: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }> = ({ title, right, children, className = '', bodyClassName = 'p-4' }) => (
  <div className={`${SA_CARD} ${className}`}>
    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
      <h3 className="text-[14px] font-bold text-[#3B1B3D]">{title}</h3>
      {right && <div className="text-[11.5px] text-[#6E5E70] text-right">{right}</div>}
    </div>
    <div className={bodyClassName}>{children}</div>
  </div>
)
