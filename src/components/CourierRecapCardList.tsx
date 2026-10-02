// Tampilan KARTU Invoice Recap Courier (2026-10-02) -- 1 kartu = 1 AWB (invoice Freight / Duty / Credit Note
// digabung), pola kartu Invoice Recap Sea & Air (token SeaAirAuditUi). Data diambil SENDIRI per halaman AWB
// (fetchCourierRecapPage: RPC sql/037 opsi B, fallback di browser) -- BUKAN `records` tabel List.
// Kolom yang tidak diizinkan role (getAllowedColumns 'courier_rekapan') TIDAK ditampilkan (`colOk`).
import React, { useEffect, useRef, useState } from 'react'
import PaginationFooter from './PaginationFooter'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, Chip, Pill, PtBadge } from './SeaAirAuditUi'
import { fmtRp, fmtRpShort, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import { courierDocNo, isCourierDraft } from '../utils/CourierAuditHelpers'
import {
  fetchCourierRecapPage, fetchRecapAuditLinks, fetchCourierRecapAttentionGroups, recapGroupStatus, ppjkCode, INVOICE_KIND_LABEL,
  type RecapFilters, type RecapGroup, type RecapSummaryCourier, type InvoiceKind,
} from '../utils/CourierRecapHelpers'
import { LoadingState } from './LoadingState'
import { ValidationDots } from './CourierAuditCardList'
import type { ValidationTabKey } from './CourierValidationWindow'

// ─── KPI ──────────────────────────────────────────────────────────────────────
export const CourierRecapKpiCards: React.FC<{ summary: RecapSummaryCourier | null; loading: boolean; colOk: (k: string) => boolean }> = ({ summary, loading, colOk }) => {
  const v = (fn: (s: RecapSummaryCourier) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]') => (
    <div className={`${SA_CARD} px-4 py-3 min-w-0`}>
      <div className="text-[11.5px] font-semibold text-[#6E5E70]">{label}</div>
      <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
    </div>
  )
  const amountOk = colOk('total_amount')
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {card('AWB', v(s => s.awb), v(s => `${s.invoices} invoice${s.invoices === 1 ? '' : 's'}${s.not_in_audit > 0 ? ` · ${s.not_in_audit} not found in Audit` : ''}`))}
      {amountOk ? card('Freight + Duty', v(s => fmtRpShort(s.charges)), 'all invoices excl. credit notes') : card('Freight + Duty', '—', 'Hidden for your role')}
      {amountOk ? card('Total (− credit notes)', v(s => fmtRpShort(s.charges - s.credit_notes)), v(s => `credit notes −${fmtRpShort(s.credit_notes)}`)) : card('Total (− credit notes)', '—', 'Hidden for your role')}
      {card('Not submitted to Finance', v(s => s.not_submitted), 'invoices without Submit Date', 'text-[#7A4F00]')}
      {card('Submitted · unpaid', v(s => s.submitted_unpaid), v(s => `${s.paid} paid`), 'text-[#2F4FA8]')}
    </div>
  )
}

// ─── Kartu 1 AWB ──────────────────────────────────────────────────────────────
const kindChip = (k: InvoiceKind, n: number) => (n > 0 ? (
  <Chip key={k} tone={k === 'freight' ? 'blue' : k === 'duty' ? 'amber' : 'purple'}>{INVOICE_KIND_LABEL[k]}{n > 1 ? ` ×${n}` : ''}</Chip>
) : null)

export const CourierRecapGroupCard: React.FC<{
  g: RecapGroup
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  validationTabs: ValidationTabKey[]
  onOpen: (g: RecapGroup) => void
  onValidation: (g: RecapGroup, tab?: ValidationTabKey) => void
}> = ({ g, companyNames, colOk, validationTabs, onOpen, onValidation }) => {
  const [expanded, setExpanded] = useState(false)
  const status = recapGroupStatus(g)
  const audit = g.audit
  const draft = audit ? isCourierDraft(audit.rec) : false
  const border = status.tone === 'green' ? 'border-l-[#17663D]' : status.tone === 'blue' ? 'border-l-[#2F4FA8]' : status.tone === 'amber' ? 'border-l-[#E0A526]' : 'border-l-[#D9CFD6]'
  const ppjks = Array.from(new Set(g.ppjks.map(ppjkCode).filter(Boolean)))
  const pos = colOk('po_pt_imi') ? g.pos : []
  const emailRange = g.firstEmail && g.lastEmail && g.firstEmail !== g.lastEmail ? `${fmtDateShort(g.firstEmail)} – ${fmtDateShort(g.lastEmail)}` : fmtDateShort(g.firstEmail)

  return (
    <div className={`${SA_CARD} border-l-4 ${border} overflow-hidden`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[230px_minmax(0,1fr)_260px_220px] gap-x-5 gap-y-3 px-4 py-3.5 items-center">
        {/* 1. AWB */}
        <div className="min-w-0">
          <div className="text-[11px] text-[#8A7A8B] font-medium">AWB</div>
          <div className="text-[15px] font-bold text-[#3B1B3D] truncate tabular-nums" title={g.awbRaw}>{g.awb}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {ppjks.map(p => <Chip key={p} tone="grey">{p}</Chip>)}
            {colOk('an') && g.an && <PtBadge code={g.an} title={companyFullName(companyNames, g.an)} />}
          </div>
          <div className="text-[11px] text-[#8A7A8B] mt-1">Email received {emailRange}</div>
        </div>

        {/* 2. Shipment & invoices */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['freight', 'duty', 'cn'] as InvoiceKind[]).map(k => kindChip(k, g.byKind[k].length))}
          </div>
          <div className="text-[12px] text-[#3B1B3D] mt-1 truncate">
            {colOk('origin') ? (g.origin || '—') : ''}{colOk('weight_kg') && g.weight !== null ? ` · ${g.weight.toLocaleString('id-ID')} kg` : ''}
          </div>
          {colOk('po_pt_imi') && (
            <div className="text-[11px] text-[#6E5E70] min-w-0 mt-0.5">
              {pos.length === 0 ? <span>No PO</span> : (
                <div className="flex items-start gap-1.5 min-w-0">
                  <div className="min-w-0">{(expanded ? pos : pos.slice(0, 1)).map((p, i) => <div key={i} className="truncate" title={p}>{p}</div>)}</div>
                  {pos.length > 1 && (
                    <button type="button" onClick={() => setExpanded(v => !v)} className="shrink-0 px-1.5 py-[1px] rounded-full border border-[#D9C7DA] bg-[#F5EDF3] text-[#6B3470] text-[10.5px] font-semibold hover:bg-[#EFE2EC]">
                      {expanded ? 'Hide' : `+${pos.length - 1} PO`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {colOk('vessel') && g.vessels.length > 0 && <div className="text-[11px] text-[#6E5E70] truncate" title={g.vessels.join(' + ')}>Vessel: {g.vessels.join(' + ')}</div>}
        </div>

        {/* 3. Status & Audit */}
        <div className="min-w-0 flex flex-col gap-1.5 items-start">
          <Pill tone={status.tone}>{status.label}</Pill>
          {audit ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={draft ? 'amber' : 'green'} title={`${audit.docType} ${courierDocNo(audit.rec, audit.docType) || ''}`.trim()}>{audit.docType} · {draft ? 'Draft' : 'Audited'}</Chip>
              {audit.rec.reaudit_reason && <Chip tone="purple" title={audit.rec.reaudit_reason}>↻ Re-audit</Chip>}
              <ValidationDots rec={audit.rec} tabs={validationTabs} onOpenTab={t => onValidation(g, t)} />
            </div>
          ) : g.key.startsWith('ID:') ? (
            <Chip tone="grey">No AWB</Chip>
          ) : (
            <Chip tone="red" title="No PIB / CN with this AWB was found in Audit Courier">Not found in Audit</Chip>
          )}
        </div>

        {/* 4. Total */}
        <div className="min-w-0 flex flex-col lg:items-end gap-1.5">
          {colOk('total_amount') ? (
            <>
              <div className={SA_LABEL}>Total{g.cn > 0 ? ' (− credit note)' : ''}</div>
              <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(g.finalTotal)}</div>
              {g.cn > 0 && <div className="text-[11px] text-[#6E5E70] tabular-nums">{fmtRp(g.charges)} − {fmtRp(g.cn)}</div>}
            </>
          ) : <div className="text-[11px] text-[#8A7A8B]">Amounts hidden for your role</div>}
          <div className="flex items-center gap-1.5">
            {audit && validationTabs.length > 0 && (
              <button type="button" onClick={() => onValidation(g)} className={`${SA_BTN_OUTLINE} h-8 px-3`}>Validation</button>
            )}
            <button type="button" onClick={() => onOpen(g)} className="inline-flex items-center justify-center px-4 h-8 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold">Open</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Daftar kartu + pagination per AWB ────────────────────────────────────────
// Default 10 kartu/halaman + pilihan Rows per page (2026-10-02, permintaan user; dulu tetap 12).
export const COURIER_RECAP_PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const CourierRecapCardView: React.FC<{
  filters: RecapFilters
  nonce: number
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  validationTabs: ValidationTabKey[]
  enrichAudit: (recs: any[]) => Promise<void>
  onOpen: (g: RecapGroup) => void
  onValidation: (g: RecapGroup, tab?: ValidationTabKey) => void
  onLoaded?: (groups: RecapGroup[]) => void
  // "Needs attention" (2026-10-02): hanya AWB yang perlu perhatian (recapGroupNeedsAttention), dihitung di browser.
  attentionOnly?: boolean
}> = ({ filters, nonce, companyNames, colOk, validationTabs, enrichAudit, onOpen, onValidation, onLoaded, attentionOnly = false }) => {
  const [pageSize, setPageSize] = useState(COURIER_RECAP_PAGE_SIZE)
  const filterKey = JSON.stringify(filters) + (attentionOnly ? ':attention' : '') + ':' + pageSize
  const [page, setPage] = useState(1)
  const [groups, setGroups] = useState<RecapGroup[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const prevFilterKey = useRef(filterKey)

  useEffect(() => {
    // Filter berubah -> kembali ke halaman 1 (fetch jalan dari effect page).
    if (prevFilterKey.current !== filterKey) { prevFilterKey.current = filterKey; if (page !== 1) { setPage(1); return } }
    const my = ++seq.current
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        let res: { total: number; groups: RecapGroup[]; fallback: boolean }
        if (attentionOnly) {
          const all = await fetchCourierRecapAttentionGroups(filters, validationTabs, enrichAudit)
          res = { total: all.length, groups: all.slice((page - 1) * pageSize, page * pageSize), fallback: false }
        } else {
          res = await fetchCourierRecapPage(filters, (page - 1) * pageSize, pageSize)
          await fetchRecapAuditLinks(res.groups)
          await enrichAudit(res.groups.map(g => g.audit?.rec).filter(Boolean))
        }
        if (my !== seq.current) return
        setGroups(res.groups)
        setTotal(res.total)
        onLoaded?.(res.groups)
      } catch (e: any) {
        console.error('[CourierRecap] gagal memuat kartu', e)
        if (my === seq.current) setError(e?.message || 'Failed to load')
      } finally {
        if (my === seq.current) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, nonce])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 relative overflow-y-auto p-2.5">
        {groups === null && loading ? <LoadingState /> : error ? (
          <div className="text-center py-16 text-[#A8231A] text-[13px]">Failed to load Invoice Recap: {error}</div>
        ) : (groups || []).length === 0 ? (
          <div className="text-center py-20 text-[#6E5E70] text-[13px]">{attentionOnly ? 'No AWB needs attention — every open invoice has 100% validation.' : 'No AWB matches the current filters.'}</div>
        ) : (
          <>
            {loading && <div className="absolute top-2 right-3 z-10 text-[11px] text-[#6E5E70] bg-white/90 px-2 py-0.5 rounded-full border border-[#EADFD6]">Updating…</div>}
            {/* Baris "N AWB · newest email received first" DIHAPUS 2026-10-02 (permintaan user) -- jumlah ada di footer. */}
            <div className="flex flex-col gap-2.5">
              {(groups || []).map(g => (
                <CourierRecapGroupCard key={g.key} g={g} companyNames={companyNames} colOk={colOk} validationTabs={validationTabs} onOpen={onOpen} onValidation={onValidation} />
              ))}
            </div>
          </>
        )}
      </div>
      {total > 0 && (
        <PaginationFooter start={start} end={end} total={total} unit="AWB" page={page} totalPages={pages} onPage={setPage}
          pageSize={pageSize} onPageSize={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
      )}
    </div>
  )
}
