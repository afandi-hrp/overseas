// Tampilan KARTU Invoice Recap Courier (2026-10-02) -- 1 kartu = 1 AWB (invoice Freight / Duty / Credit Note
// digabung), pola kartu Invoice Recap Sea & Air (token SeaAirAuditUi). Data diambil SENDIRI per halaman AWB
// (fetchCourierRecapPage: RPC sql/037 opsi B, fallback di browser) -- BUKAN `records` tabel List.
// Kolom yang tidak diizinkan role (getAllowedColumns 'courier_rekapan') TIDAK ditampilkan (`colOk`).
// 2026-10-05 (keputusan user): tombol Open DIHAPUS -- tinggal tombol Validation yang membuka PANEL SAMPING
// (CourierRecapValidationPanel) di kanan daftar; kartu tanpa pasangan Audit -> panel tab Invoices. Kartu memakai
// container query (@container) supaya otomatis ringkas saat lebarnya berbagi dgn panel.
import React, { useEffect, useRef, useState } from 'react'
import PaginationFooter from './PaginationFooter'
import { SA_CARD, SA_LABEL, Chip, Pill } from './SeaAirAuditUi'
import { fmtRp, fmtDateShort, companyFullName } from '../utils/SeaAirAuditHelpers'
import { todayLocalIso } from '../utils/SeaAirRecapHelpers'
import { courierDocNo, isCourierDraft } from '../utils/CourierAuditHelpers'
import {
  fetchCourierRecapPage, fetchRecapAuditLinks, fetchCourierRecapAttentionGroups, fetchCourierRecapKpiGroups, recapGroupStatus, recapGroupDue, ppjkCode, INVOICE_KIND_LABEL, COURIER_DUE_DAYS,
  type RecapFilters, type RecapGroup, type RecapSummaryCourier, type InvoiceKind, type RecapKpiFilter,
} from '../utils/CourierRecapHelpers'
import { LoadingState } from './LoadingState'
import type { ValidationTabKey } from './CourierValidationWindow'
import type { RecapPanelTab } from './CourierRecapValidationPanel'

// ─── KPI ──────────────────────────────────────────────────────────────────────
// 2026-10-05 (keputusan user): 4 kartu -- AWB | Freight + Duty (BERSIH: − credit notes) | Not submitted | Submitted · unpaid;
// rupiah PENUH (tanpa singkatan). Kartu "Total (− credit notes)" dihapus (nilainya kini di Freight + Duty).
// 2026-10-07 (keputusan user): "Freight + Duty" / "Not submitted to Finance" / "Submitted · unpaid" bisa diklik = filter KPI
// (berlaku List & Card, ikut tab PPJK & filter aktif; "Freight + Duty" = semua invoice). "AWB" tidak bisa diklik. KPI aktif
// diberi border; klik lagi = kembali ke semua data.
export const CourierRecapKpiCards: React.FC<{ summary: RecapSummaryCourier | null; loading: boolean; colOk: (k: string) => boolean; kpi?: RecapKpiFilter; onKpi?: (k: RecapKpiFilter) => void }> = ({ summary, loading, colOk, kpi = null, onKpi }) => {
  const v = (fn: (s: RecapSummaryCourier) => React.ReactNode) => (summary ? fn(summary) : loading ? '…' : '—')
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, valueClass = 'text-[#3B1B3D]', key?: Exclude<RecapKpiFilter, null>) => {
    const body = (
      <>
        <div className="text-[11.5px] font-semibold text-[#6E5E70]">{label}</div>
        <div className={`text-[22px] leading-tight font-bold mt-0.5 tabular-nums truncate ${valueClass}`}>{value}</div>
        <div className="text-[11px] text-[#8A7A8B] mt-0.5 truncate">{sub}</div>
      </>
    )
    if (!key || !onKpi) return <div className={`${SA_CARD} px-4 py-3 min-w-0`}>{body}</div>
    const active = kpi === key
    return (
      <button type="button" aria-pressed={active} data-kpi={key} onClick={() => onKpi(active ? null : key)}
        title={active ? 'Click again to show all data' : 'Click to filter'}
        className={`${SA_CARD} px-4 py-3 min-w-0 text-left transition-colors ${active ? 'ring-2 ring-[#6B3470] border-transparent' : 'hover:border-[#6B3470]/40'}`}>
        {body}
      </button>
    )
  }
  const amountOk = colOk('total_amount')
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {card('AWB', v(s => s.awb), v(s => `${s.invoices} invoice${s.invoices === 1 ? '' : 's'}${s.not_in_audit > 0 ? ` · ${s.not_in_audit} not found in Audit` : ''}`))}
      {amountOk
        ? card('Freight + Duty', v(s => fmtRp(s.charges - s.credit_notes)), v(s => `all invoices incl. credit notes (−${fmtRp(s.credit_notes)})`), undefined, 'all')
        : card('Freight + Duty', '—', 'Hidden for your role', undefined, 'all')}
      {card('Not submitted to Finance', v(s => s.not_submitted), 'invoices without Submit Date', 'text-[#7A4F00]', 'not_submitted')}
      {card('Submitted · unpaid', v(s => s.submitted_unpaid), v(s => `${s.paid} paid`), 'text-[#2F4FA8]', 'submitted_unpaid')}
    </div>
  )
}

// ─── Kartu 1 AWB ──────────────────────────────────────────────────────────────
// Susunan (2026-10-05, keputusan user): baris atas "PPJK · PT" + tag Freight/Duty; AWB; Vendor | Email received (kecil),
// PO, Origin | status Submit + PIB/CN Draft/Audited + Due Date (Tgl Invoice + 30 hari, menggantikan titik validasi) |
// GRAND TOTAL + Validation. Berat & Vessel DIHAPUS dari kartu.
const kindChip = (k: InvoiceKind, n: number) => (n > 0 ? (
  <Chip key={k} tone={k === 'freight' ? 'blue' : k === 'duty' ? 'amber' : 'purple'}>{INVOICE_KIND_LABEL[k]}{n > 1 ? ` ×${n}` : ''}</Chip>
) : null)

export const RecapDueChip: React.FC<{ g: RecapGroup }> = ({ g }) => {
  const d = recapGroupDue(g, todayLocalIso())
  if (d.allPaid) return null
  const title = d.perInvoice.map(p => `${INVOICE_KIND_LABEL[p.kind]} ${p.no}: ${p.due ? `due ${fmtDateShort(p.due)}` : 'no Invoice PPJK Date yet'}${p.paid ? ' (paid)' : ''}`).join('\n')
  if (!d.due) return <Chip tone="grey" title={`Invoice PPJK Date not available yet — due date = earliest Invoice PPJK Date + ${COURIER_DUE_DAYS} days\n${title}`}>Due —</Chip>
  return <Chip tone={d.overdue ? 'red' : 'grey'} title={title}>{d.overdue ? 'Overdue · ' : 'Due '}{fmtDateShort(d.due)}</Chip>
}

export const CourierRecapGroupCard: React.FC<{
  g: RecapGroup
  companyNames: Record<string, string>
  colOk: (k: string) => boolean
  validationTabs: ValidationTabKey[]
  selected?: boolean
  onValidation: (g: RecapGroup, tab?: RecapPanelTab) => void
}> = ({ g, companyNames, colOk, validationTabs, selected = false, onValidation }) => {
  const [expanded, setExpanded] = useState(false)
  const status = recapGroupStatus(g)
  const audit = g.audit
  const draft = audit ? isCourierDraft(audit.rec) : false
  const border = status.tone === 'green' ? 'border-l-[#17663D]' : status.tone === 'blue' ? 'border-l-[#2F4FA8]' : status.tone === 'amber' ? 'border-l-[#E0A526]' : 'border-l-[#D9CFD6]'
  const ppjks = Array.from(new Set(g.ppjks.map(ppjkCode).filter(Boolean)))
  const pos = colOk('po_pt_imi') ? g.pos : []
  const emailRange = g.firstEmail && g.lastEmail && g.firstEmail !== g.lastEmail ? `${fmtDateShort(g.firstEmail)} – ${fmtDateShort(g.lastEmail)}` : fmtDateShort(g.firstEmail)
  const vendor = colOk('vendor') ? (g.rows.map(r => r.vendor).find(v => v && String(v).trim()) || '') : ''
  const ppjkPt = [ppjks.join(' / '), colOk('an') ? g.an : ''].filter(Boolean).join(' · ')

  return (
    <div className={`${SA_CARD} border-l-4 ${border} overflow-hidden @container ${selected ? 'ring-2 ring-[#6B3470]' : ''}`} data-recap-card={g.key}>
      <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_200px] gap-x-5 gap-y-3 px-4 py-3.5 items-center">
        {/* 1. PPJK · PT + jenis invoice, AWB, Vendor */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {ppjkPt && <Chip tone="grey" title={colOk('an') && g.an ? companyFullName(companyNames, g.an) : undefined}>{ppjkPt}</Chip>}
            {(['freight', 'duty', 'cn'] as InvoiceKind[]).map(k => kindChip(k, g.byKind[k].length))}
          </div>
          <div className="text-[15px] font-bold text-[#3B1B3D] truncate tabular-nums mt-1" title={g.awbRaw}>{g.awb}</div>
          {vendor && <div className="text-[12px] font-semibold text-[#6E5E70] truncate" title={vendor}>{vendor}</div>}
        </div>

        {/* 2. Email received, PO, Origin */}
        <div className="min-w-0">
          <div className="text-[10.5px] text-[#8A7A8B]">Email received {emailRange}</div>
          {colOk('po_pt_imi') && (
            <div className="text-[11.5px] text-[#3B1B3D] min-w-0 mt-0.5">
              {pos.length === 0 ? <span className="text-[#6E5E70]">No PO</span> : (
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
          {colOk('origin') && <div className="text-[11.5px] text-[#6E5E70] truncate mt-0.5">Origin: {g.origin || '—'}</div>}
        </div>

        {/* 3. Status, PIB/CN, Due Date */}
        <div className="min-w-0 flex flex-col gap-1.5 items-start">
          <Pill tone={status.tone}>{status.label}</Pill>
          <div className="flex flex-wrap items-center gap-1.5">
            {audit ? (
              <>
                <Chip tone={draft ? 'amber' : 'green'} title={`${audit.docType} ${courierDocNo(audit.rec, audit.docType) || ''}`.trim()}>{audit.docType} · {draft ? 'Draft' : 'Audited'}</Chip>
                {audit.rec.reaudit_reason && <Chip tone="purple" title={audit.rec.reaudit_reason}>↻ Re-audit</Chip>}
              </>
            ) : g.key.startsWith('ID:') ? (
              <Chip tone="grey">No AWB</Chip>
            ) : (
              <Chip tone="red" title="No PIB / CN with this AWB was found in Audit Courier">Not found in Audit</Chip>
            )}
            <RecapDueChip g={g} />
          </div>
        </div>

        {/* 4. GRAND TOTAL + Validation */}
        <div className="min-w-0 flex flex-col @4xl:items-end gap-1.5">
          {colOk('total_amount') ? (
            <>
              <div className={SA_LABEL}>Grand total</div>
              <div className="text-[18px] font-bold text-[#3B1B3D] tabular-nums leading-tight">{fmtRp(g.finalTotal)}</div>
              {g.cn > 0 && <div className="text-[11px] text-[#6E5E70] tabular-nums">{fmtRp(g.charges)} − {fmtRp(g.cn)} CN</div>}
            </>
          ) : <div className="text-[11px] text-[#8A7A8B]">Amounts hidden for your role</div>}
          <div className="flex items-center gap-1.5">
            {/* Tanpa pasangan Audit (atau tanpa hak lihat validasi) -> panel langsung tab Invoices. */}
            <button type="button" onClick={() => onValidation(g, audit && validationTabs.length > 0 ? undefined : 'invoices')}
              aria-pressed={selected}
              className={`inline-flex items-center justify-center px-4 h-8 rounded-xl text-xs font-semibold ${selected ? 'bg-[#3B1B3D] text-white' : 'bg-[#6B3470] hover:bg-[#5A2A5E] text-white'}`}>Validation</button>
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
  onValidation: (g: RecapGroup, tab?: RecapPanelTab) => void
  onLoaded?: (groups: RecapGroup[]) => void
  // Panel Validation samping (2026-10-05) -- null = daftar lebar penuh.
  selectedKey?: string | null
  panel?: React.ReactNode
  // "Needs attention" (2026-10-02): hanya AWB yang perlu perhatian (recapGroupNeedsAttention), dihitung di browser.
  attentionOnly?: boolean
  // Filter KPI (2026-10-07): AWB dgn minimal 1 invoice berstatus itu (isi kartu tetap lengkap), dihitung di browser.
  kpiFilter?: RecapKpiFilter
}> = ({ filters, nonce, companyNames, colOk, validationTabs, enrichAudit, onValidation, onLoaded, attentionOnly = false, kpiFilter = null, selectedKey = null, panel = null }) => {
  const [pageSize, setPageSize] = useState(COURIER_RECAP_PAGE_SIZE)
  const kpiStatus = kpiFilter === 'not_submitted' || kpiFilter === 'submitted_unpaid' ? kpiFilter : null
  const filterKey = JSON.stringify(filters) + (attentionOnly ? ':attention' : '') + (kpiStatus ? `:kpi-${kpiStatus}` : '') + ':' + pageSize
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
        } else if (kpiStatus) {
          const all = await fetchCourierRecapKpiGroups(filters, kpiStatus)
          res = { total: all.length, groups: all.slice((page - 1) * pageSize, page * pageSize), fallback: false }
          await fetchRecapAuditLinks(res.groups)
          await enrichAudit(res.groups.map(g => g.audit?.rec).filter(Boolean))
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

  const list = (
    <div className={panel ? 'flex flex-col min-h-0 lg:w-[44%] lg:min-w-[380px] lg:max-w-[720px] lg:shrink-0 max-lg:min-h-[420px]' : 'flex-1 min-h-0 flex flex-col'}>
      <div className="flex-1 min-h-0 relative overflow-y-auto p-2.5">
        {groups === null && loading ? <LoadingState /> : error ? (
          <div className="text-center py-16 text-[#A8231A] text-[13px]">Failed to load Invoice Recap: {error}</div>
        ) : (groups || []).length === 0 ? (
          <div className="text-center py-20 text-[#6E5E70] text-[13px]">{attentionOnly ? 'No AWB needs attention — every open invoice has 100% validation.' : kpiStatus === 'not_submitted' ? 'No AWB with invoices not yet submitted to Finance.' : kpiStatus === 'submitted_unpaid' ? 'No AWB with submitted, unpaid invoices.' : 'No AWB matches the current filters.'}</div>
        ) : (
          <>
            {loading && <div className="absolute top-2 right-3 z-10 text-[11px] text-[#6E5E70] bg-white/90 px-2 py-0.5 rounded-full border border-[#EADFD6]">Updating…</div>}
            {/* Baris "N AWB · newest email received first" DIHAPUS 2026-10-02 (permintaan user) -- jumlah ada di footer. */}
            <div className="flex flex-col gap-2.5">
              {(groups || []).map(g => (
                <CourierRecapGroupCard key={g.key} g={g} companyNames={companyNames} colOk={colOk} validationTabs={validationTabs} selected={selectedKey === g.key} onValidation={onValidation} />
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
  if (!panel) return list
  // 2 kolom: daftar kiri, panel kanan (layar sempit: ditumpuk, panel di bawah daftar).
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row max-lg:overflow-y-auto">
      {list}
      <div className="lg:flex-1 min-w-0 min-h-0 flex flex-col p-2.5 lg:pl-0 max-lg:min-h-[640px]">{panel}</div>
    </div>
  )
}
