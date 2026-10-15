// Pilih Cost item yang BISA DIKETIK (2026-10-15, permintaan user; menggantikan <select> kolom Cost item tabel baris Agency
// Invoices). Ketik -> cari di code / nama / kategori / keyword (alias); hasil tetap dikelompokkan per kategori seperti dulu,
// "— not mapped —" di atas. Keyboard: ↑/↓ pindah, Enter pilih, Esc tutup (tidak ikut menutup modal review). Daftar = portal
// `fixed` di bawah/atas input supaya tidak terpotong area scroll tabel; tertutup saat klik di luar, scroll luar, atau resize.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import type { CostAgentCostItem } from '../utils/CostAgentHelpers'

type Opt = { id: number | null; label: string; sub?: string; cat?: string }

const label = (c: CostAgentCostItem) => `${c.code} — ${c.name}`

export default function CostAgentCostItemPicker({ items, value, disabled, onChange, className = '' }: {
  items: CostAgentCostItem[]          // cost item aktif
  value: number | null
  disabled?: boolean
  onChange: (id: number | null) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  // Posisi daftar dlm koordinat LAYAR (getBoundingClientRect). `scale` = faktor zoom global (html{zoom:90%} di layar <=1600px):
  // style px elemen `fixed` ikut dikali zoom, jadi nilai style = koordinat layar / scale. Diukur sendiri dari lebar daftar yang
  // dirender (laporan user 2026-10-15: di laptop 14" daftar bergeser & menutupi kotak ketik).
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null)
  const [scale, setScale] = useState(1)

  const current = useMemo(() => items.find(c => c.id === value) || null, [items, value])

  // Hasil: kosong = semua item; ada teks = semua kata harus ada di code/nama/kategori/keyword. Urut kategori lalu code.
  const options = useMemo<Opt[]>(() => {
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (c: CostAgentCostItem) => {
      if (!words.length) return true
      const hay = `${c.code} ${c.name} ${c.category} ${(c.keywords || []).join(' ')}`.toLowerCase()
      return words.every(w => hay.includes(w))
    }
    const list = items.filter(hit).sort((a, b) => (a.category || 'OTHER').localeCompare(b.category || 'OTHER') || a.code.localeCompare(b.code))
    const out: Opt[] = words.length ? [] : [{ id: null, label: '— not mapped —' }]
    list.forEach(c => out.push({ id: c.id, label: label(c), cat: c.category || 'OTHER' }))
    return out
  }, [items, term])

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 200 && above > below
    const width = Math.min(Math.max(r.width, 420), window.innerWidth - 16)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 4 : r.bottom + 4, width, up, maxH: Math.max(140, Math.min(380, up ? above : below)) })
  }
  const openList = () => {
    if (disabled) return
    setTerm('')
    setActive(Math.max(0, value === null ? 0 : options.findIndex(o => o.id === value)))
    place()
    setOpen(true)
  }
  const close = () => { setOpen(false); setTerm('') }
  const pick = (o: Opt) => {
    close()
    inputRef.current?.blur()
    if (o.id !== value) onChange(o.id)
  }

  // Koreksi zoom: lebar tampil / lebar style = faktor skala sebenarnya (1 kali ukur, lalu stabil).
  useLayoutEffect(() => {
    if (!open || !pos || !listRef.current) return
    const shown = listRef.current.getBoundingClientRect().width
    const styleW = pos.width / scale
    if (shown > 0 && styleW > 0) {
      const k = shown / styleW
      if (Math.abs(k - scale) > 0.005) setScale(k)
    }
  }, [open, pos, scale])

  // Indeks aktif ikut hasil pencarian & item aktif terlihat di daftar.
  useEffect(() => { if (open && term) setActive(0) }, [term, open])
  useLayoutEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-opt-idx="${active}"]`)?.scrollIntoView?.({ block: "nearest" })
  }, [active, open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return
      close()
    }
    const onScroll = (e: Event) => { if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return; close() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) pick(o) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); close() }
    else if (e.key === 'Tab') close()
  }

  let lastCat: string | undefined
  return (
    <div className={`relative ${className}`} data-cost-item-picker>
      <input ref={inputRef} type="text" role="combobox" aria-expanded={open} aria-autocomplete="list" disabled={disabled}
        value={open ? term : current ? label(current) : ''} placeholder={open ? 'Type to search code / name…' : '— not mapped —'}
        title={current ? label(current) : undefined}
        onFocus={openList} onClick={() => { if (!open) openList() }} onKeyDown={onKeyDown}
        onChange={e => { setTerm(e.target.value); if (!open) { place(); setOpen(true) } }}
        className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-[#EADFD6] bg-white text-[12px] text-[#3B1B3D] truncate focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15 disabled:bg-[#F6EFEA] disabled:text-[#6E5E70] placeholder:text-[#8A7A8B]" />
      {open ? <Search size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
        : <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />}
      {open && pos && createPortal(
        <div ref={listRef} role="listbox" data-cost-item-list
          className="fixed z-[120] bg-white border border-[#EADFD6] rounded-lg shadow-xl overflow-y-auto py-1"
          style={{ left: pos.left / scale, width: pos.width / scale, maxHeight: pos.maxH / scale, ...(pos.up ? { bottom: (window.innerHeight - pos.top) / scale } : { top: pos.top / scale }) }}>
          {/* Teks yang diketik selalu terlihat di daftar juga (cadangan bila kotak ketik tertutup). */}
          <div className="sticky top-0 z-10 bg-white border-b border-[#F3EEEA] px-3 py-1.5 -mt-1 mb-1 flex items-center gap-1.5 text-[12px]" data-cost-item-term>
            <Search size={12} className="text-[#8A7A8B] shrink-0" />
            {term ? <span className="text-[#3B1B3D] font-semibold truncate">{term}</span> : <span className="text-[#8A7A8B]">Type to search code / name / keyword…</span>}
            <span className="ml-auto text-[10.5px] text-[#8A7A8B] shrink-0">{options.filter(o => o.id !== null).length} items</span>
          </div>
          {options.length === 0 && <div className="px-3 py-2 text-[12px] text-[#8A7A8B]">No cost item matches "{term}"</div>}
          {options.map((o, i) => {
            const head = o.cat && o.cat !== lastCat ? o.cat : null
            lastCat = o.cat
            return (
              <React.Fragment key={o.id ?? 'none'}>
                {head && <div className="px-3 pt-2 pb-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#3B1B3D]">{head}</div>}
                <div role="option" aria-selected={o.id === value} data-opt-idx={i}
                  onMouseDown={e => { e.preventDefault(); pick(o) }} onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 ${o.cat ? 'pl-6' : ''} py-1.5 text-[12.5px] truncate ${i === active ? 'bg-[#F5EDF3] text-[#3B1B3D]' : 'text-[#3B1B3D]'} ${o.id === value ? 'font-bold' : ''} ${o.id === null ? 'text-[#6E5E70]' : ''}`}>
                  {o.label}
                </div>
              </React.Fragment>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
