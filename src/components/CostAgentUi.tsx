// Komponen kecil modul Cost Agent (2026-10-13, fondasi Prompt 1) -- memakai token visual SeaAirAuditUi (sama Audit/Recap
// Sea & Air & Courier). Label/warna dari CostAgentHelpers (SATU sumber).
import React from 'react'
import { createPortal } from 'react-dom'
import { Anchor, X, AlertTriangle, UploadCloud, FileText, Search } from 'lucide-react'
import Greeting from './Greeting'
import { Chip, Pill, SA_CARD, SA_INPUT } from './SeaAirAuditUi'
import {
  INVOICE_STATUS_META, VOYAGE_STATUS_META, COMPARE_FLAG_META, matchLevelLabel, fmtPct, fmtFileSize,
  COST_AGENT_UPLOAD_TYPES, COST_AGENT_MAX_FILE_BYTES, COST_AGENT_MAX_FILES,
  type CostAgentInvoiceStatus, type CostAgentVoyageStatus, type CostAgentCompareFlag, type CostAgentMatchLevel,
} from '../utils/CostAgentHelpers'

// Chip status invoice / voyage (nilai DB apa adanya -> label Inggris).
export const StatusChip: React.FC<{ status: CostAgentInvoiceStatus | string | null | undefined; kind?: 'invoice' | 'voyage' }> = ({ status, kind = 'invoice' }) => {
  if (!status) return <Pill tone="grey">—</Pill>
  const meta = kind === 'voyage'
    ? VOYAGE_STATUS_META[status as CostAgentVoyageStatus]
    : INVOICE_STATUS_META[status as CostAgentInvoiceStatus]
  if (!meta) return <Pill tone="grey">{String(status)}</Pill>
  const hint = 'hint' in meta ? (meta as { hint?: string }).hint : undefined
  return <Pill tone={meta.tone} title={hint}>{meta.label}</Pill>
}

// Flag hasil compare baris invoice vs history (+/- % bila ada).
export const CompareFlagChip: React.FC<{ flag: CostAgentCompareFlag | null | undefined; diffPct?: number | null }> = ({ flag, diffPct }) => {
  if (!flag) return <Chip tone="grey">—</Chip>
  const meta = COMPARE_FLAG_META[flag]
  if (!meta) return <Chip tone="grey">{flag}</Chip>
  const showPct = (flag === 'naik' || flag === 'turun' || flag === 'sesuai') && diffPct !== null && diffPct !== undefined
  return (
    <Chip tone={meta.tone}>
      {flag === 'naik' ? '▲ ' : flag === 'turun' ? '▼ ' : ''}{meta.label}{showPct ? ` ${fmtPct(diffPct)}` : ''}
    </Chip>
  )
}

// Asal baris history acuan: kapal & pelabuhan sama / DWT terdekat / pelabuhan terdekat.
export const MatchLevelLabel: React.FC<{ level: CostAgentMatchLevel | null | undefined; dwtDiff?: number | null; distanceKm?: number | null }> = ({ level, dwtDiff, distanceKm }) => (
  <span className="text-[11px] font-semibold text-[#6E5E70] whitespace-nowrap">
    {matchLevelLabel(level, { dwt_diff: dwtDiff, distance_km: distanceKm })}
  </span>
)

// Header halaman modul Cost Agent (pola header wajib CLAUDE.md: kotak ikon ungu + judul + subjudul + Greeting).
export const CostAgentPageHeader: React.FC<{ title: string; subtitle: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <header className="px-3 pt-0 pb-1 shrink-0">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
          <Anchor size={17} />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-2xl text-[#5A305A] leading-none">{title}</h1>
          <p className="font-light text-sm text-[#5A305A]">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {right}
        <Greeting />
      </div>
    </div>
  </header>
)

// Kartu placeholder selama halaman belum dibangun (Prompt 2–4).
export const CostAgentComingSoon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`${SA_CARD} p-6 text-center`}>
    <p className="text-sm font-semibold text-[#3B1B3D]">This page is being prepared.</p>
    <p className="text-[12.5px] text-[#6E5E70] mt-1">{children}</p>
  </div>
)

// ─── Primitif bersama halaman Cost Agent (Prompt 2, 2026-10-13) ────────────────────────────────────────────────

// Modal standar (overlay CLAUDE.md, portal ke body supaya ikut di-blur lock screen).
export const CostAgentModal: React.FC<{
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode
  footer?: React.ReactNode; maxWidth?: string; z?: string
}> = ({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-3xl', z = 'z-[70]' }) => createPortal(
  <div className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm ${z} flex items-center justify-center p-4 max-[1600px]:p-2.5`}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[94vh] flex flex-col overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#EADFD6] shrink-0">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-[#3B1B3D] leading-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#6E5E70] mt-0.5">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70]"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex items-center justify-end gap-2 flex-wrap shrink-0">{footer}</div>}
    </div>
  </div>,
  document.body,
)

export const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean; hint?: React.ReactNode }> = ({ children, required, hint }) => (
  <label className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">
    {children}{required && <span className="text-[#A8231A]">*</span>}
    {hint && <span className="normal-case tracking-normal font-normal text-[#6E5E70] ml-1">{hint}</span>}
  </label>
)

// Rute pelabuhan "BLW → LSM → SAB" sbg badge.
export const RouteBadges: React.FC<{ route: string | null | undefined }> = ({ route }) => {
  const ports = (route || '').split('→').map(s => s.trim()).filter(Boolean)
  if (!ports.length) return <span className="text-[#8A7A8B]">—</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {ports.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-[#8A7A8B] text-[10px]">→</span>}
          <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold ${i === 0 ? 'bg-[#EAF6EF] text-[#17663D]' : 'bg-[#EEF1FA] text-[#2F4FA8]'}`}>{p}</span>
        </React.Fragment>
      ))}
    </span>
  )
}

// Combobox ringan dgn pencarian (kapal / pelabuhan). `keywords` ikut dicari (kode, alias).
export type ComboOption = { value: number | string; label: string; sub?: string; keywords?: string; warn?: string }
export function CostAgentCombobox({ options, value, onChange, placeholder = 'Search…', disabled = false, allowClear = true, className = '' }: {
  options: ComboOption[]; value: number | string | null | undefined; onChange: (v: number | string | null) => void
  placeholder?: string; disabled?: boolean; allowClear?: boolean; className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const selected = options.find(o => String(o.value) === String(value ?? ''))
  const term = q.trim().toLowerCase()
  const shown = (term
    ? options.filter(o => `${o.label} ${o.sub || ''} ${o.keywords || ''}`.toLowerCase().includes(term))
    : options).slice(0, 80)
  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          className={`${SA_INPUT} pr-7`}
          disabled={disabled}
          value={open ? q : selected ? selected.label : ''}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => { setQ(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          title={selected?.warn}
        />
        {selected?.warn && !open && <AlertTriangle size={13} className="absolute right-7 top-1/2 -translate-y-1/2 text-[#B7791F]" />}
        {allowClear && selected && !disabled && (
          <button type="button" tabIndex={-1} aria-label="Clear" onMouseDown={e => { e.preventDefault(); onChange(null) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>
        )}
      </div>
      {open && !disabled && (
        <div className="absolute z-[90] mt-1 w-full min-w-[220px] max-h-64 overflow-y-auto bg-white border border-[#EADFD6] rounded-lg shadow-xl">
          {shown.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-[#8A7A8B]">No match</div>
          ) : shown.map(o => (
            <button type="button" key={String(o.value)}
              onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#FBF7F4] flex items-start gap-1.5 ${String(o.value) === String(value ?? '') ? 'bg-[#F5EDF3]' : ''}`}>
              {o.warn && <span title={o.warn}><AlertTriangle size={12} className="text-[#B7791F] mt-0.5 shrink-0" /></span>}
              <span className="min-w-0">
                <span className="block text-[#3B1B3D] font-medium truncate">{o.label}</span>
                {o.sub && <span className="block text-[11px] text-[#6E5E70] truncate">{o.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Pemilih file upload (PDF/JPG/PNG, maks 50 MB/file & 30 file -- selaras server.ts). Duplikat (nama+ukuran) dibuang.
export function CostAgentFileDrop({ files, onChange, disabled = false, hint }: {
  files: File[]; onChange: (files: File[]) => void; disabled?: boolean; hint?: React.ReactNode
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [rejected, setRejected] = React.useState<string[]>([])
  const add = (list: FileList | null) => {
    if (!list) return
    const bad: string[] = []
    const ok = Array.from(list).filter(f => {
      if (!COST_AGENT_UPLOAD_TYPES.includes(f.type)) { bad.push(`${f.name}: only PDF, JPG or PNG`); return false }
      if (f.size > COST_AGENT_MAX_FILE_BYTES) { bad.push(`${f.name}: larger than 50 MB`); return false }
      return true
    })
    const seen = new Set(files.map(f => f.name + '_' + f.size))
    const next = [...files, ...ok.filter(f => !seen.has(f.name + '_' + f.size))]
    if (next.length > COST_AGENT_MAX_FILES) bad.push(`Maximum ${COST_AGENT_MAX_FILES} files per upload`)
    setRejected(bad)
    onChange(next.slice(0, COST_AGENT_MAX_FILES))
  }
  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) add(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-2xl p-5 text-center transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${dragging ? 'border-[#6B3470] bg-[#F5EDF3]' : 'border-[#EADFD6] bg-[#FBF7F4] hover:border-[#6B3470]/40'}`}>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
        <UploadCloud size={24} className="mx-auto text-[#6B3470] mb-1.5" />
        <p className="text-sm font-semibold text-[#3B1B3D]">{files.length ? 'Click to add more files' : 'Click or drag & drop files (PDF, JPG, PNG)'}</p>
        {hint && <p className="text-[12px] text-[#6E5E70] mt-0.5">{hint}</p>}
      </div>
      {rejected.length > 0 && <ul className="mt-2 text-[11.5px] text-[#A8231A] list-disc pl-5">{rejected.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <div key={f.name + i} className="flex items-center gap-2 rounded-lg border border-[#EADFD6] px-3 py-1.5 text-[12px]">
              <FileText size={14} className="text-[#A8231A] shrink-0" />
              <span className="truncate flex-1 text-[#3B1B3D]">{f.name}</span>
              <span className="text-[#8A7A8B] shrink-0">{fmtFileSize(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-[#8A7A8B] hover:text-[#A8231A]"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Panel filter 1 baris (2026-10-13, laporan user: laptop 14" berantakan) ─────────────────────────────────────
// Pola SAMA panel Invoice Recap Sea & Air (bunker-courier-seaair.md "Panel filter … 1 baris di laptop 14""): wrapper =
// @container, baris dalam flex-wrap yg menjadi nowrap mulai lebar panel 1150px; Search yg menyusut (min 120px); label kecil
// & teks tombol sekunder disembunyikan di panel sempit (container query, BUKAN breakpoint layar). Tombol aksi halaman
// (Upload / New / Add) di UJUNG KANAN panel, bukan di header (header = judul + Greeting saja).
export const FilterPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="@container bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5 shrink-0">
    <div className="flex flex-wrap @min-[1150px]:flex-nowrap items-center gap-2">{children}</div>
  </div>
)

export function FilterSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[120px]">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
      <input type="text" placeholder={placeholder} title={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-xl pl-8 pr-8 text-[13px] bg-[#FBF7F4] border border-[#EADFD6] text-[#3B1B3D] placeholder:text-[#8A7A8B] focus:outline-none focus:border-[#6B3470] focus:bg-white" />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#3B1B3D]"><X size={14} /></button>}
    </div>
  )
}

// Kotak berlabel (label kecil hanya tampil di panel >= `labelFrom`, default 1450px; tooltip = label). Panel padat (Voyages)
// memakai 1750 supaya isi tidak melebihi panel (2026-10-13: di monitor 24" tombol New voyage terpotong).
export const FilterField: React.FC<{ label: string; labelFrom?: 1450 | 1750; children: React.ReactNode }> = ({ label, labelFrom = 1450, children }) => (
  <div className="flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-xl border border-[#EADFD6] bg-white shrink-0" title={label}>
    <span className={`${labelFrom === 1750 ? 'hidden @min-[1750px]:inline' : 'hidden @min-[1450px]:inline'} text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]`}>{label}</span>
    {children}
  </div>
)
// Kelas select di dalam FilterField (lebar dibatasi di panel sempit).
export const FILTER_SELECT = 'border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer max-w-[96px] @min-[1500px]:max-w-[150px]'
export const FILTER_SELECT_WIDE = 'border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer max-w-[120px] @min-[1500px]:max-w-[190px]'

export function FilterSegment<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; short?: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] shrink-0" role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} title={o.label}
          className={`px-2.5 @min-[1500px]:px-3 h-7 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${value === o.value ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}>
          {o.short ? <><span className="@min-[1500px]:hidden">{o.short}</span><span className="hidden @min-[1500px]:inline">{o.label}</span></> : o.label}
        </button>
      ))}
    </div>
  )
}

// Tombol di panel filter. `label` tampil penuh mulai lebar panel `labelFrom` (ikon saja di bawahnya; tooltip = label);
// `short` = teks pendek di panel sempit (mis. "+ New").
export function FilterButton({ icon: Icon, label, short, onClick, variant = 'outline', labelFrom = 1450, disabled, title, spin, active, children }: {
  icon: React.ElementType; label: string; short?: string; onClick: () => void; variant?: 'outline' | 'primary'
  labelFrom?: 0 | 1450 | 1650 | 2000; disabled?: boolean; title?: string; spin?: boolean; active?: boolean; children?: React.ReactNode
}) {
  const base = variant === 'primary'
    ? 'bg-[#6B3470] hover:bg-[#5A2A5E] text-white border border-[#6B3470] shadow-sm'
    : active ? 'bg-[#EFE7F7] border border-[#C9B5E0] text-[#5B2E8C]' : 'bg-white border border-[#EADFD6] text-[#3B1B3D] hover:bg-[#FBF7F4]'
  const full = labelFrom === 0 ? 'inline' : labelFrom === 1450 ? 'hidden @min-[1450px]:inline' : labelFrom === 1650 ? 'hidden @min-[1650px]:inline' : 'hidden @min-[2000px]:inline'
  const shortCls = labelFrom === 0 ? 'hidden' : labelFrom === 1450 ? '@min-[1450px]:hidden' : labelFrom === 1650 ? '@min-[1650px]:hidden' : '@min-[2000px]:hidden'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title || label} aria-label={label} aria-pressed={active}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${base}`}>
      <Icon size={14} className={spin ? 'animate-spin' : ''} />
      <span className={full}>{label}</span>
      {short && <span className={shortCls}>{short}</span>}
      {children}
    </button>
  )
}
