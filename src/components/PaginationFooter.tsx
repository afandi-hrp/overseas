// Footer pagination BERSAMA (2026-10-02, permintaan user: warna & bentuk SAMA di semua halaman list) -- dipakai footer
// SharedDataTable (Audit/Invoice Recap Courier & Sea & Air), kartu Invoice Recap Courier, Finance Handover, Cost Agent, Auto Rename.
// Revisi 2026-10-15 (permintaan user: tampilan di-improve & lebih pendek): tinggi ±40px (dulu ±56px), latar putih + garis atas
// warna app, tombol ‹ › ikon + NOMOR HALAMAN (maks 7, "…" bila banyak; halaman aktif ungu), pilihan Rows ringkas. Props TIDAK berubah.
import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// 1 … 4 5 6 … 20 -- selalu halaman pertama, terakhir, dan tetangga halaman aktif.
function pageItems(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach(n => set.add(n))
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach(n => set.add(n))
  const nums = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push('gap'); out.push(n) })
  return out
}

const NAV_BTN = 'inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export default function PaginationFooter({
  start, end, total, unit = 'records', note, page, totalPages, onPage, pageSize, onPageSize,
  pageSizeOptions = [10, 20, 50, 100], pageSizeDisabled = false,
}: {
  start: number
  end: number
  total: number
  unit?: string
  note?: React.ReactNode
  page: number
  totalPages: number
  onPage: (p: number) => void
  pageSize?: number
  onPageSize?: (n: number) => void
  pageSizeOptions?: number[]
  pageSizeDisabled?: boolean
}) {
  const pages = Math.max(1, totalPages)
  return (
    <div className="flex max-sm:flex-col justify-between items-center px-4 py-1.5 border-t border-[#EADFD6] bg-white gap-x-3 gap-y-1.5 shrink-0 relative z-20" data-pagination>
      <div className="text-[12px] text-[#6E5E70]">
        Showing <span className="font-semibold text-[#3B1B3D] tabular-nums">{total === 0 ? 0 : start}–{end}</span> of <span className="font-semibold text-[#3B1B3D] tabular-nums">{total}</span> {unit}
        {note}
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-end">
        {pageSize != null && onPageSize && (
          <label className="flex items-center gap-1.5 text-[12px] text-[#6E5E70]">
            Rows
            <select
              aria-label="Rows per page"
              value={pageSize}
              disabled={pageSizeDisabled}
              onChange={e => onPageSize(Number(e.target.value))}
              className="h-7 rounded-lg border border-[#EADFD6] bg-white pl-2 pr-1 text-[12px] font-semibold text-[#3B1B3D] focus:outline-none focus:border-[#6B3470] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button type="button" aria-label="Previous page" title="Previous page" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
            className={`${NAV_BTN} text-[#5A305A] hover:bg-[#F5EDF3]`}>
            <ChevronLeft size={15} />
          </button>
          {pageItems(page, pages).map((n, i) => n === 'gap'
            ? <span key={`g${i}`} className="px-0.5 text-[12px] text-[#8A7A8B]">…</span>
            : (
              <button key={n} type="button" aria-label={`Page ${n} of ${pages}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}
                className={`${NAV_BTN} tabular-nums ${n === page ? 'bg-[#6B3470] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-[#F5EDF3]'}`}>
                {n}
              </button>
            ))}
          <button type="button" aria-label="Next page" title="Next page" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}
            className={`${NAV_BTN} text-[#5A305A] hover:bg-[#F5EDF3]`}>
            <ChevronRight size={15} />
          </button>
        </nav>
      </div>
    </div>
  )
}
