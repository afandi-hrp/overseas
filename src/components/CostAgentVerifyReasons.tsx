// Alasan "kenapa baris belum auto-verified" (2026-10-29, permintaan user): ikon info per baris (popover label + hint), ringkasan di atas tabel Lines
// (daftar baris needs_user per kode, klik nomor = gulir ke baris) dan hook pengambilan data. Teks & aturan SEMUA dari RPC
// fn_cost_agent_get_line_verify_reasons -- komponen ini hanya menampilkan. Gagal ambil data = diam (tanpa ikon/ringkasan, tanpa toast).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { costAgentGetLineVerifyReasons } from '../utils/CostAgentWorkflow'
import { groupHeading, groupNeedsUser, reasonsSummary, type LineReason, type LineVerifyReasons } from '../utils/CostAgentVerifyReasons'

// Dipanggil sekali saat detail terbuka (verification / rejected) dan ulang saat `signature` berubah (aksi yang mengubah baris / gerbang dokumen). TANPA polling.
export function useLineVerifyReasons(invoiceId: number, enabled: boolean, signature: string): LineVerifyReasons | null {
  const [data, setData] = useState<LineVerifyReasons | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!enabled) { setData(null); return }
    const my = ++seq.current
    costAgentGetLineVerifyReasons(invoiceId)
      .then(r => { if (my === seq.current) setData(r && Array.isArray(r.lines) ? r : null) })
      .catch(() => { if (my === seq.current) setData(null) }) // RPC gagal / belum ada: sembunyikan saja
    return () => { seq.current++ }
  }, [invoiceId, enabled, signature])
  return data
}

// Faktor zoom global (html{zoom:90%} di layar <= 1600px): style px elemen `fixed` ikut dikali zoom -> style = koordinat layar / zoom.
const pageZoom = (): number => {
  try {
    const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1')
    return !z || isNaN(z) ? 1 : z > 3 ? z / 100 : z
  } catch { return 1 }
}

const scrollToLine = (lineId: number) => document.querySelector(`[data-line-id="${lineId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })

// Ikon per baris yang BELUM verified. Hover (desktop) / fokus / ketuk (mobile) membuka popover: label tebal + hint abu-abu. Netral; kuning hanya bila needs_user.
export function VerifyReasonIcon({ reason }: { reason: LineReason }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = hover || pinned
  const ready = reason.code === 'ready'

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const b = btnRef.current?.getBoundingClientRect(); const p = popRef.current?.getBoundingClientRect()
    if (!b || !p) return
    const z = pageZoom()
    const left = Math.max(8, Math.min(b.left + b.width / 2 - p.width / 2, window.innerWidth - p.width - 8))
    const below = b.bottom + 6
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, b.top - 6 - p.height) : below
    setPos({ left: left / z, top: top / z })
  }, [open, reason.label, reason.hint])

  useEffect(() => {
    if (!pinned) return
    const away = (e: Event) => { const t = e.target as Node; if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setPinned(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinned(false) }
    const close = () => setPinned(false)
    document.addEventListener('mousedown', away); document.addEventListener('touchstart', away); document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [pinned])

  const tone = reason.needs_user ? 'bg-[#FFF1D6] text-[#9A6700] border-[#F2D58A]' : 'bg-[#F3EEEA] text-[#8A7A8B] border-[#E4D9D2]'
  return (
    <>
      <button ref={btnRef} type="button" data-verify-reason={reason.code} data-needs-user={reason.needs_user ? '1' : '0'} aria-label={`Why is line ${reason.line_no} not verified: ${reason.label}`} aria-expanded={open}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} onClick={() => setPinned(p => !p)}
        className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border transition-colors hover:brightness-95 ${tone}`}>
        {ready ? <Check size={10} /> : <Info size={10} />}
      </button>
      {open && createPortal(
        <div ref={popRef} role="tooltip" data-verify-reason-popover
          style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', maxWidth: 280 }}
          className="z-[95] w-max rounded-xl border border-[#EADFD6] bg-white shadow-xl px-3 py-2 pointer-events-none">
          <div className="text-[12px] font-bold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{reason.label}</div>
          {!ready && reason.hint && <div className="mt-0.5 text-[11.5px] text-[#6E5E70] leading-snug [overflow-wrap:anywhere]">{reason.hint}</div>}
        </div>,
        document.body,
      )}
    </>
  )
}

// Ringkasan satu baris (dipakai INLINE di toolbar Cost lines); klik = buka daftar baris needs_user per kode (VerifyReasonsList di bawah toolbar).
export function VerifyReasonsToggle({ reasons, open, onToggle }: { reasons: LineVerifyReasons; open: boolean; onToggle: () => void }) {
  const s = reasonsSummary(reasons)
  if (!s) return null
  const tone = s.tone === 'user' ? 'text-[#7A4F00]' : s.tone === 'ok' ? 'text-[#17663D]' : 'text-[#6E5E70]'
  return groupNeedsUser(reasons).length > 0 ? (
    <button type="button" onClick={onToggle} aria-expanded={open} data-verify-reasons-summary className={`inline-flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap hover:underline ${tone}`}>
      {s.text} {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  ) : <span data-verify-reasons-summary className={`text-[11.5px] font-semibold whitespace-nowrap ${tone}`}>{s.text}</span>
}

// Daftar baris needs_user per kode ("Above history (3): lines 8, 11, 14"); nomor baris = tombol gulir ke baris.
export function VerifyReasonsList({ reasons }: { reasons: LineVerifyReasons }) {
  const groups = groupNeedsUser(reasons)
  if (groups.length === 0) return null
  return (
    <ul className="px-3 py-1.5 border-b border-[#EADFD6] shrink-0 flex flex-col gap-1 max-h-36 overflow-y-auto" data-verify-reasons-groups>
      {groups.map(g => (
        <li key={g.code} className="text-[11.5px] text-[#3B1B3D] flex items-baseline gap-1 flex-wrap">
          <span className="font-semibold">{groupHeading(g)}:</span>
          <span className="text-[#6E5E70]">{g.lineNos.length === 1 ? 'line' : 'lines'}</span>
          {g.lineNos.map((n, i) => (
            <React.Fragment key={g.lineIds[i]}>
              <button type="button" onClick={() => scrollToLine(g.lineIds[i])} className="font-semibold text-[#6B3470] hover:underline tabular-nums">{n}</button>
              {i < g.lineNos.length - 1 && <span className="text-[#C9BFCB]">,</span>}
            </React.Fragment>
          ))}
        </li>
      ))}
    </ul>
  )
}
