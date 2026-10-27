// Komponen & hook BERSAMA tab hub "Cost Agent Settings" (2026-10-26): drawer Add/Edit, input chip, dialog konfirmasi / merge, accordion
// "Recent changes", state daftar (loading / error+Retry / kosong), pagination 50 baris, badge office. Memakai token visual halaman Cost Agent
// (SeaAirAuditUi / CostAgentUi) -- jangan menambah library baru.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_CARD, SA_INPUT, type Tone } from '../../../components/SeaAirAuditUi'
import { CostAgentCombobox, CostAgentModal, type ComboOption } from '../../../components/CostAgentUi'
import { LoadingTableRow, LoadingState } from '../../../components/LoadingState'
import PaginationFooter from '../../../components/PaginationFooter'
import { fmtDateTimePort } from '../../../utils/CostAgentHelpers'
import { hubMasterLog, sumMoved, OFFICE_LABEL, type HubLogRow, type HubMergeResult, type Office } from './hubApi'

export const HUB_PAGE_SIZE = 50
export const TH = 'px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6]'
export const TD = 'px-2.5 py-1.5 text-[12.5px] text-[#3B1B3D] align-top'

// Konteks dari shell: hak ubah, toast, parameter URL (preset filter dari tautan Dashboard) dan pindah tab.
export interface HubCtx {
  editable: boolean
  toast: (msg: React.ReactNode, tone?: 'ok' | 'warn' | 'err') => void
  params: URLSearchParams
  goTab: (tab: string, extra?: Record<string, string>) => void
  // Bagian "Documents without invoice" (Dashboard) melapor jumlah pending -> badge di label tab Dashboard.
  setPendingDocs: (n: number) => void
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// Muat data async dgn penjaga urutan (respons lama tidak menimpa yang baru). `deps` = filter/halaman; reload() = muat ulang.
export function useAsync<R>(load: () => Promise<R>, deps: unknown[]) {
  const [data, setData] = useState<R | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => {
    const s = ++seq.current
    setLoading(true)
    loadRef.current()
      .then(r => { if (s === seq.current) { setData(r); setError(null) } })
      .catch((e: any) => { if (s === seq.current) setError(e?.message || String(e)) })
      .finally(() => { if (s === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, loading, error, reload: () => setTick(t => t + 1) }
}

// Pilihan baris (checkbox) -- dikosongkan oleh tab saat filter / halaman / data berubah.
export function useSelection() {
  const [sel, setSel] = useState<Set<number>>(new Set())
  return {
    sel,
    has: (id: number) => sel.has(id),
    toggle: (id: number) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }),
    setAll: (ids: number[], on: boolean) => setSel(on ? new Set(ids) : new Set()),
    clear: () => setSel(new Set()),
  }
}

export const errBox = 'rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]'

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={`${errBox} flex items-center gap-3`}>
      <AlertTriangle size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{message}</span>
      {onRetry && <button type="button" className={`${SA_BTN_OUTLINE} h-7 px-2.5`} onClick={onRetry}><RefreshCw size={12} /> Retry</button>}
    </div>
  )
}

// Baris status tabel: loading / error (+Retry) / kosong. Tab menampilkan baris data hanya bila `showRows` true.
export function StateRow({ colSpan, loading, error, onRetry, empty, emptyText }: {
  colSpan: number; loading: boolean; error: string | null; onRetry: () => void; empty: boolean; emptyText: string
}) {
  if (loading) return <LoadingTableRow colSpan={colSpan} />
  if (error) return <tr><td colSpan={colSpan} className="p-3"><ErrorBox message={error} onRetry={onRetry} /></td></tr>
  if (empty) return <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-[#6E5E70] italic">{emptyText}</td></tr>
  return null
}

export function HubFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
// Kotak select / input kecil di bar filter.
export const FILTER_CTRL = 'h-9 rounded-xl border border-[#EADFD6] bg-white px-2.5 text-xs font-bold text-[#3B1B3D] focus:outline-none focus:border-[#6B3470]'
// Pembungkus kolom pencarian: melebar mengisi sisa baris (min 180px, maks 320px) -- BUKAN lebar tetap, supaya bar tetap rapi di semua monitor.
export const FILTER_SEARCH = 'flex flex-1 min-w-[180px] max-w-[320px]'

// Ujung kanan toolbar: jumlah data + (View only) + tombol utama dalam SATU kelompok, supaya saat bar membungkus
// kelompok ini pindah utuh ke baris berikutnya (bukan terpecah acak).
export function HubToolbarEnd({ count, viewOnly, children }: { count?: string; viewOnly?: boolean; children?: React.ReactNode }) {
  return (
    <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
      {(count || viewOnly) && (
        <span className="text-[12px] text-[#6E5E70] tabular-nums whitespace-nowrap">
          {count}{viewOnly && <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-[#F3EEEA] text-[10.5px] font-bold text-[#6E5E70]">View only</span>}
        </span>
      )}
      {children}
    </div>
  )
}
// Tombol "Reset" tanpa border (ghost) -- tidak menyaingi tombol utama.
export function ResetButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="h-9 px-2.5 rounded-xl text-xs font-semibold text-[#6E5E70] hover:text-[#6B3470] hover:bg-[#F5EDF3]">Reset</button>
}

// Kartu tabel: `@container` supaya kolom sekunder bisa disembunyikan menurut LEBAR KARTU (HIDE_* di bawah), bukan lebar layar; baris menyala saat disorot.
export function TableCard({ children }: { children: React.ReactNode }) {
  return <section className={`${SA_CARD} overflow-hidden @container`}><div className="overflow-x-auto [&_tbody_tr:hover]:bg-[#FBF7F4]">{children}</div></section>
}
// Kolom sekunder: tampil mulai lebar kartu tertentu (pasangkan di <th> DAN <td>). Datanya tetap ada di drawer Edit.
export const HIDE_LG = 'hidden @min-[1000px]:table-cell'
export const HIDE_XL = 'hidden @min-[1250px]:table-cell'

// Tombol ikon di baris tabel: tanpa border (ghost), terang saat disorot. Dipakai sbg `className={ICON_BTN}` pada <button> yang sudah ada.
export const ICON_BTN = 'inline-flex items-center justify-center gap-1 h-7 min-w-7 px-1.5 rounded-lg text-[11.5px] font-semibold text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[#6E5E70] disabled:cursor-not-allowed'
export const ICON_BTN_DANGER = 'inline-flex items-center justify-center gap-1 h-7 min-w-7 px-1.5 rounded-lg text-[11.5px] font-semibold text-[#A8231A]/80 hover:bg-[#FDE7E4] hover:text-[#A8231A] transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed'

// Status Active / Inactive sebagai titik kecil + teks (pengganti chip hijau di tiap baris -- jauh lebih tenang).
export function ActiveStatus({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${active ? 'text-[#17663D]' : 'text-[#8A7A8B]'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#2F9E63]' : 'bg-[#C9BFCB]'}`} />{active ? 'Active' : 'Inactive'}
    </span>
  )
}

// "Used by": hanya hitungan yang > 0, ringkas ("12 invoices · 40 history"); semua nol = "Not used" (tanda aman dihapus). Tooltip memuat rincian lengkap.
export function UsedBy({ items }: { items: { n: number | null | undefined; label: string; short?: string }[] }) {
  const used = items.filter(i => (Number(i.n) || 0) > 0)
  const full = items.map(i => `${Number(i.n) || 0} ${i.label}`).join('\n')
  if (used.length === 0) return <span className="text-[11.5px] text-[#8A7A8B]" title={full}>Not used</span>
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] text-[#6E5E70]" title={full}>
      {used.map(i => <span key={i.label} className="whitespace-nowrap"><b className="text-[#3B1B3D] tabular-nums">{Number(i.n).toLocaleString('id-ID')}</b> {i.short || i.label}</span>)}
    </span>
  )
}

// Judul bagian (kartu): kalimat biasa, tebal, + keterangan kecil opsional. SATU gaya utk Dashboard, Approval Matrix, Recent changes.
export function SectionTitle({ children, hint, right }: { children: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold text-[#3B1B3D] leading-tight inline-flex items-center gap-1.5">{children}</h3>
        {hint && <p className="text-[12px] text-[#6E5E70] mt-0.5">{hint}</p>}
      </div>
      {right}
    </div>
  )
}

// Deretan angka ringkas (Dashboard): garis tipis antar sel (gap-px di atas latar garis), tanpa kotak ber-border satu per satu.
// Sel bisa bernada (red / amber) dan bisa menjadi tombol (onClick). Responsif lewat kelas `cols` (container query).
export interface StatCell { key: string; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'red' | 'amber' | 'plain'; dim?: boolean; dot?: string; onClick?: () => void; title?: string }
export function StatGrid({ cells, cols, attr = 'data-attention' }: { cells: StatCell[]; cols: string; attr?: string }) {
  return (
    <div className={`grid ${cols} gap-px bg-[#EADFD6] rounded-xl overflow-hidden border border-[#EADFD6]`}>
      {cells.map(c => {
        const bg = c.tone === 'red' ? 'bg-[#FDF0EE]' : c.tone === 'amber' ? 'bg-[#FFF8E6]' : 'bg-white'
        const num = c.tone === 'red' ? 'text-[#A8231A]' : c.tone === 'amber' ? 'text-[#7A4F00]' : 'text-[#3B1B3D]'
        const inner = (
          <>
            <div className={`text-[20px] font-bold leading-none tabular-nums ${num}`}>{c.value}</div>
            <div className="mt-1.5 text-[11.5px] font-semibold text-[#6E5E70] leading-tight inline-flex items-center gap-1.5">
              {c.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />}{c.label}
            </div>
            {c.sub && <div className="mt-0.5 text-[10.5px] text-[#8A7A8B] tabular-nums">{c.sub}</div>}
          </>
        )
        const cls = `${bg} px-3 py-2.5 text-left ${c.dim ? 'opacity-55' : ''}`
        return c.onClick
          ? <button key={c.key} type="button" onClick={c.onClick} title={c.title} {...{ [attr]: c.key }} className={`${cls} hover:brightness-95 cursor-pointer`}>{inner}</button>
          : <div key={c.key} className={cls} title={c.title} {...{ [attr]: c.key }}>{inner}</div>
      })}
    </div>
  )
}

export function Pager({ total, page, onPage, loading }: { total: number; page: number; onPage: (p: number) => void; loading?: boolean }) {
  const totalPages = Math.max(1, Math.ceil(total / HUB_PAGE_SIZE))
  return (
    <div className={loading ? 'opacity-60' : ''}>
      <PaginationFooter start={total === 0 ? 0 : (page - 1) * HUB_PAGE_SIZE + 1} end={Math.min(page * HUB_PAGE_SIZE, total)} total={total} unit="rows" page={page} totalPages={totalPages} onPage={onPage} />
    </div>
  )
}

export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[#C9B5E0] bg-[#EFE7F7] px-3 py-2 text-[12.5px] font-semibold text-[#5B2E8C]" data-bulk-bar>
      <span>{count} selected</span>
      {children}
      <button type="button" className="ml-auto text-[12px] underline hover:no-underline" onClick={onClear}>Clear selection</button>
    </div>
  )
}

export function OfficeBadge({ office }: { office: Office | string | null | undefined }) {
  if (office === 'MEDAN') return <Chip tone="blue">{OFFICE_LABEL.MEDAN}</Chip>
  if (office === 'JAKARTA') return <Chip tone="purple">{OFFICE_LABEL.JAKARTA}</Chip>
  return <Chip tone="amber">{OFFICE_LABEL.NONE}</Chip>
}

// Daftar alias / keyword sebagai chip kecil ("+n" bila banyak; tooltip = semua).
export function ChipList({ items, max = 3, tone = 'grey' }: { items: string[] | null | undefined; max?: number; tone?: Tone }) {
  const list = (items || []).filter(Boolean)
  if (list.length === 0) return <span className="text-[#8A7A8B]">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1" title={list.join(', ')}>
      {list.slice(0, max).map(a => <Chip key={a} tone={tone}>{a}</Chip>)}
      {list.length > max && <Chip tone="grey">+{list.length - max}</Chip>}
    </span>
  )
}

// Drawer Add/Edit (panel kanan). Menutup lewat tombol X / Esc / klik latar -- tidak saat `busy`.
export function HubDrawer({ title, subtitle, onClose, busy = false, footer, children, z = 'z-[75]' }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; busy?: boolean; footer?: React.ReactNode; children: React.ReactNode; z?: string
}) {
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) closeRef.current() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [busy])
  return createPortal(
    <div className={`fixed inset-0 ${z} bg-slate-900/40 backdrop-blur-[2px] flex justify-end`} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <aside className="bg-white w-full max-w-[520px] h-full shadow-2xl flex flex-col" data-hub-drawer>
        <div className="px-5 py-4 border-b border-[#EADFD6] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-[#3B1B3D] leading-tight">{title}</h2>
            {subtitle && <p className="text-[12px] text-[#6E5E70] mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F6EFEA] text-[#6E5E70] disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex items-center justify-end gap-2 flex-wrap shrink-0">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}

export function Field({ label, required, hint, helper, children, className = '' }: {
  label: React.ReactNode; required?: boolean; hint?: React.ReactNode; helper?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">
        {label}{required && <span className="text-[#A8231A]">*</span>}
        {hint && <span className="normal-case tracking-normal font-normal text-[#6E5E70] ml-1">{hint}</span>}
      </label>
      {children}
      {helper && <p className="mt-1 text-[11px] text-[#6E5E70]">{helper}</p>}
    </div>
  )
}

// Input chip: Enter / koma menambah, X menghapus; teks yang masih diketik ikut ditambahkan saat blur.
export function ChipInput({ values, onChange, placeholder, normalize, disabled }: {
  values: string[]; onChange: (v: string[]) => void; placeholder?: string; normalize?: (s: string) => string; disabled?: boolean
}) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const norm = normalize || ((s: string) => s.trim())
    const list = raw.split(',').map(s => norm(s)).filter(Boolean)
    if (list.length) onChange([...new Set([...values, ...list])])
    setText('')
  }
  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EEF1FA] text-[#2F4FA8] text-[11.5px] font-semibold">
              {v}{!disabled && <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}><X size={11} /></button>}
            </span>
          ))}
        </div>
      )}
      <input className={SA_INPUT} value={text} disabled={disabled} placeholder={placeholder || 'Type and press Enter'} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && text.trim()) { e.preventDefault(); add(text) } }}
        onBlur={() => { if (text.trim()) add(text) }} />
    </div>
  )
}

export function ConfirmModal({ title, children, confirmLabel = 'Confirm', danger = false, busy = false, error, onConfirm, onClose, disabled = false }: {
  title: string; children: React.ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; error?: string | null
  onConfirm: () => void; onClose: () => void; disabled?: boolean
}) {
  return (
    <CostAgentModal maxWidth="max-w-md" z="z-[90]" title={title} onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={danger ? 'inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#A8231A] hover:bg-[#8A1C14] text-white text-xs font-semibold disabled:opacity-50' : SA_BTN_PRIMARY}
          onClick={onConfirm} disabled={busy || disabled}>{busy ? 'Working…' : confirmLabel}</button>
      </>}>
      <div className="p-5 space-y-3 text-[13px] text-[#3B1B3D]">
        {children}
        {error && <div className={errBox} role="alert">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

// "Merge into…": pilih tujuan (selain dirinya), centang "I understand" -> p_keep = tujuan, p_remove = asal.
export function MergeModal({ source, options, describe, run, onClose, onDone, toast }: {
  source: { id: number; name: string }
  options: ComboOption[]
  describe: (a: string, b: string) => string
  run: (keep: number, remove: number) => Promise<HubMergeResult>
  onClose: () => void
  onDone: () => void
  toast: HubCtx['toast']
}) {
  const [target, setTarget] = useState<number | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opts = useMemo(() => options.filter(o => Number(o.value) !== source.id), [options, source.id])
  const targetName = opts.find(o => Number(o.value) === target)?.label
  const go = async () => {
    if (target === null) return
    setBusy(true); setError(null)
    try {
      const r = await run(target, source.id)
      toast(`${sumMoved(r.moved)} records moved, ${r.invoices_recompared ?? 0} open invoices compared again`)
      onDone()
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }
  return (
    <ConfirmModal title={`Merge “${source.name}” into…`} confirmLabel="Merge" danger busy={busy} error={error} onClose={onClose} onConfirm={go} disabled={target === null || !ack}>
      <Field label="Merge into" required>
        <CostAgentCombobox options={opts} value={target} onChange={v => { setTarget(v === null ? null : Number(v)); setAck(false) }} placeholder="Search destination…" allowClear />
      </Field>
      {targetName && <p className="rounded-lg bg-[#FBF7F4] border border-[#EADFD6] px-3 py-2 text-[12.5px]">{describe(source.name, targetName)}</p>}
      <label className="flex items-start gap-2 text-[12.5px] font-semibold">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#A8231A]" checked={ack} onChange={e => setAck(e.target.checked)} disabled={target === null} /> I understand
      </label>
    </ConfirmModal>
  )
}

const LOG_TONE: Record<string, Tone> = { create: 'green', update: 'blue', merge: 'purple', delete: 'red', activate: 'green', deactivate: 'amber', rename: 'purple', reclassify: 'purple' }

// Accordion tertutup "Recent changes" di bawah tiap tab: fn_cost_agent_list_master_log(p_entity, 20). Beberapa entitas digabung & diurutkan.
export function RecentChanges({ entities, reloadKey }: { entities: string[]; reloadKey: number }) {
  const [open, setOpen] = useState(false)
  const key = entities.join('|')
  const { data, loading, error, reload } = useAsync<HubLogRow[]>(async () => {
    if (!open) return []
    const all = (await Promise.all(entities.map(e => hubMasterLog(e, 20)))).flat()
    return all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20)
  }, [open, key, reloadKey])
  return (
    <section className={`${SA_CARD} overflow-hidden`} data-recent-changes>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-[#FBF7F4]">
        <ChevronDown size={14} className={`text-[#8A7A8B] transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-[13px] font-bold text-[#3B1B3D]">Recent changes</span>
      </button>
      {open && (
        <div className="border-t border-[#EADFD6]">
          {loading ? <LoadingState fullHeight={false} /> : error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : (data || []).length === 0
            ? <p className="px-4 py-3 text-[12.5px] text-[#6E5E70] italic">No changes recorded yet.</p>
            : (
              <ul className="divide-y divide-[#F3EEEA] max-h-72 overflow-y-auto">
                {(data || []).map(l => (
                  <li key={l.id} className="px-4 py-1.5 text-[12px] flex items-start gap-2">
                    <Chip tone={LOG_TONE[l.action] || 'grey'}>{l.action}</Chip>
                    <span className="min-w-0 flex-1 text-[#3B1B3D] [overflow-wrap:anywhere]">{l.summary || `${l.entity} #${l.entity_id ?? ''}`}</span>
                    <span className="text-[11px] text-[#8A7A8B] whitespace-nowrap">{l.actor || 'system'} · {fmtDateTimePort(l.created_at, null, false)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </section>
  )
}

// Kesalahan RPC: 23503 ("is already used") -> toast merah apa adanya; selain itu dikembalikan utk ditampilkan inline.
export function isInUseError(e: any): boolean { return e?.code === '23503' }
export function isDuplicateError(e: any): boolean { return e?.code === '23505' || /already uses/i.test(String(e?.message || '')) }
