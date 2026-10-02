// Footer pagination BERSAMA (2026-10-02, permintaan user: warna & bentuk SAMA di semua halaman list) -- dipakai footer
// SharedDataTable (Audit/Invoice Recap Courier & Sea & Air), kartu Invoice Recap Courier, dan Finance Handover.
// Gaya = footer lama SharedDataTable (bg-slate-50, Prev / Page X of Y / Next) + pilihan Rows per page.
import React from 'react'

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
  return (
    <div className="flex max-sm:flex-col justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 gap-3 shrink-0 relative z-20">
      <div className="text-xs text-[#5A305A]">
        Showing <span className="font-semibold text-[#5A305A]">{total === 0 ? 0 : start}-{end}</span> of <span className="font-semibold text-[#5A305A]">{total}</span> {unit}
        {note}
      </div>
      <div className="flex items-center gap-2">
        {pageSize != null && onPageSize && (
          <label className="flex items-center gap-1.5 text-xs text-[#5A305A] mr-1">
            Rows
            <select
              aria-label="Rows per page"
              value={pageSize}
              disabled={pageSizeDisabled}
              onChange={e => onPageSize(Number(e.target.value))}
              className="h-[30px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          Prev
        </button>
        <span className="text-xs text-[#5A305A] font-medium min-w-[80px] text-center">
          Page <span className="font-bold text-[#5A305A]">{page}</span> of {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          Next
        </button>
      </div>
    </div>
  )
}
