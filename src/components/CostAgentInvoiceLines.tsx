// Baris biaya invoice + pembanding history (2026-10-13, Prompt 3). Data dari fn_cost_agent_get_invoice_history.
// Aksi (hanya status verification/rejected & canEdit('cost_agent_invoice')): ganti cost item / Verify / remark ->
// fn_cost_agent_verify_line (p_learn_alias true saat memilih/verifikasi cost item -> server belajar alias deskripsi vendor);
// "Add as new cost item" -> fn_cost_agent_add_cost_item lalu verify_line(id baru). Setiap perubahan -> parent memuat ulang
// (flag compare dihitung server). "Browse history" -> drawer CostAgentHistoryBrowser (pembanding manual ->
// fn_cost_agent_set_line_reference); "Reset to automatic" bila ref_history_id terisi.
// sql/061: `pick` primary/next/alternative/manual; `compare_check` = badge "Check reference", difilter di footer ("Needs check")
// & TIDAK ikut "Verify all matching".
// sql/065 (2026-10-16): tampilan KIRI (baris invoice) – KANAN (pembanding utama + ke-2) per baris, grid 2 kolom mulai layar
// 1280px (xl), bertumpuk di bawahnya (2026-10-16: diganti container query panel >= 900px). Checkbox "Use as reference" DIHAPUS (include_in_history selalu true). Baris tanpa cost item
// tidak bisa di-Verify / ikut Verify all / Submit. Edit manual baris (pensil) -> fn_cost_agent_update_line. Panel kanan otomatis
// DILIPAT bila flag sesuai + pembanding same_line + bukan compare_check (toggle "Show all compares" / "Show only differences").
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, CheckCheck, AlertTriangle, History, RotateCcw, Pin, Pencil, Check, ChevronDown, ChevronUp, MessageSquare, Info } from 'lucide-react'
import { CompareFlagChip, MatchLevelLabel, CostAgentModal, FieldLabel } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, Chip } from './SeaAirAuditUi'
import CostAgentCostItemPicker from './CostAgentCostItemPicker'
import CostAgentHistoryBrowser, { LineMatchBadge, ChosenByUserLabel, type HistoryCache } from './CostAgentHistoryBrowser'
import {
  costAgentVerifyLine, costAgentAddCostItem, costAgentSetLineReference, costAgentUpdateLine, COST_AGENT_LINE_DESCRIPTION_MAX,
  MATCH_METHOD_LABEL, matchLevelLabel, fmtMoney, fmtNumber, fmtPct, fmtDate, daysDiffLabel,
  type CostAgentInvoiceLine, type CostAgentLineHistory, type CostAgentCostItem, type CostAgentPort,
  type CostAgentVessel, type CostAgentVendor,
} from '../utils/CostAgentHelpers'

const CATEGORIES = ['PORT', 'AGENCY', 'CREW', 'DOCUMENT', 'WATER', 'ADMIN', 'TAX', 'OTHER']
const LINK = 'text-[11px] font-semibold text-[#6B3470] hover:underline inline-flex items-center gap-0.5 disabled:opacity-50'

// Pembanding utama = pilihan user (manual) > primary (sql/061) > baris pertama (data lama tanpa `pick`).
// Pembanding lain = next / alternative (alternative didahulukan: alasan "Check reference").
function pickComparators(l: CostAgentInvoiceLine): { main: CostAgentLineHistory | null; others: CostAgentLineHistory[] } {
  const hist = l.history || []
  const main = hist.find(h => h.pick === 'manual') || hist.find(h => h.pick === 'primary') || hist[0] || null
  const tagged = hist.some(h => h.pick)
  const others = hist.filter(h => h !== main && (!tagged || h.pick === 'next' || h.pick === 'alternative'))
    .sort((a, b) => (a.pick === 'alternative' ? 0 : 1) - (b.pick === 'alternative' ? 0 : 1))
  return { main, others }
}

// Auto-hide (sql/065 E): sesuai + pembanding same_line + bukan compare_check -> panel kanan dilipat (ringkasan 1 baris).
const isQuietLine = (l: CostAgentInvoiceLine, main: CostAgentLineHistory | null) =>
  l.compare_flag === 'sesuai' && main?.line_match === 'same_line' && !l.compare_check

export default function CostAgentInvoiceLines({ lines, currency, costItems, editable, actor, onChanged, onToast, footerRight, toolbarLeft, invoice, ports, vessels, vendors, historyCache }: {
  lines: CostAgentInvoiceLine[]
  currency: string
  costItems: CostAgentCostItem[]
  editable: boolean
  actor: string | null
  onChanged: () => Promise<void> | void
  onToast?: (msg: string, tone?: 'ok' | 'warn') => void
  footerRight?: React.ReactNode // 2026-10-16: Grand total (dari modal review) di ujung kanan footer ringkasan flag
  toolbarLeft?: React.ReactNode // mis. tombol Show/Hide file dari modal review (hemat 1 baris di laptop 14")
  // Browse history (sql/057): filter awal dari header invoice + master utk select filter; cache milik modal review.
  invoice: { port_id: number | null; vessel_id: number | null; vendor_id: number | null; service_date?: string | null; invoice_date?: string | null }
  ports: CostAgentPort[]
  vessels: CostAgentVessel[]
  vendors: CostAgentVendor[]
  historyCache: HistoryCache
}) {
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remarks, setRemarks] = useState<Record<number, string>>({})
  const [addFor, setAddFor] = useState<CostAgentInvoiceLine | null>(null)
  const [editFor, setEditFor] = useState<CostAgentInvoiceLine | null>(null)
  const [browseFor, setBrowseFor] = useState<CostAgentInvoiceLine | null>(null)
  const [onlyCheck, setOnlyCheck] = useState(false) // footer "Needs check": tampilkan hanya baris compare_check
  // sql/065 E: default "Show only differences" (baris tenang dilipat); state halaman saja (tanpa localStorage).
  const [showAllCompares, setShowAllCompares] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [remarkOpen, setRemarkOpen] = useState<Set<number>>(() => new Set()) // textarea remark sedang dibuka
  const [moreOpen, setMoreOpen] = useState<Set<number>>(() => new Set()) // "+n more reference" dibuka

  const items = useMemo(() => costItems.filter(c => c.is_active !== false), [costItems])

  const run = async (key: number | 'all', fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); await onChanged() } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(null) }
  }
  const verify = (l: CostAgentInvoiceLine, patch: { costItemId?: number | null; isVerified?: boolean; remark?: string | null; learnAlias?: boolean }) =>
    costAgentVerifyLine({
      lineId: l.id,
      costItemId: patch.costItemId !== undefined ? patch.costItemId : l.cost_item_id,
      isVerified: patch.isVerified ?? l.is_verified,
      remark: patch.remark ?? null,
      learnAlias: patch.learnAlias ?? false,
      actor,
    })
  const toggleMore = (id: number) => setMoreOpen(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleExpanded = (id: number) => setExpanded(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // compare_check (sql/061) & baris tanpa cost item (sql/065) TIDAK ikut.
  const matching = lines.filter(l => l.compare_flag === 'sesuai' && !l.is_verified && l.cost_item_id && !l.compare_check)
  const needsCheck = lines.filter(l => l.compare_check)
  const unmapped = lines.filter(l => !l.cost_item_id).length
  const shownLines = onlyCheck && needsCheck.length ? needsCheck : lines
  const verifyAllMatching = () => run('all', async () => {
    for (const l of matching) await verify(l, { isVerified: true, learnAlias: true })
  })

  const unverified = lines.filter(l => !l.is_verified).length

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
        <div className="text-[12.5px] text-[#3B1B3D] flex items-center gap-3 flex-wrap">
          {toolbarLeft}
          <span><b>{lines.length}</b> line{lines.length === 1 ? '' : 's'} · <span className={unverified ? 'text-[#7A4F00] font-semibold' : 'text-[#17663D] font-semibold'}>{unverified ? `${unverified} not verified` : 'all verified'}</span>
            {unmapped > 0 && <> · <span className="text-[#A8231A] font-semibold" data-unmapped-count>{unmapped} without cost item</span></>}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-[#EADFD6] overflow-hidden text-[11.5px] font-semibold" role="group" aria-label="Compare display">
            <button type="button" aria-pressed={!showAllCompares} onClick={() => setShowAllCompares(false)} data-compare-toggle="differences"
              className={`px-2.5 py-1 ${!showAllCompares ? 'bg-[#6B3470] text-white' : 'bg-white text-[#6E5E70] hover:bg-[#FBF7F4]'}`}
              title="Fold the comparison of lines that match the same line in history">Show only differences</button>
            <button type="button" aria-pressed={showAllCompares} onClick={() => setShowAllCompares(true)} data-compare-toggle="all"
              className={`px-2.5 py-1 border-l border-[#EADFD6] ${showAllCompares ? 'bg-[#6B3470] text-white' : 'bg-white text-[#6E5E70] hover:bg-[#FBF7F4]'}`}>Show all compares</button>
          </div>
          {editable && (
            <button type="button" className={SA_BTN_OUTLINE} disabled={!matching.length || busy !== null} onClick={verifyAllMatching}
              title="Verify every line whose amount is in line with history (lines without a cost item are skipped)">
              <CheckCheck size={13} /> {busy === 'all' ? 'Verifying…' : `Verify all matching (${matching.length})`}
            </button>
          )}
        </div>
      </div>
      {error && <div className="mx-3 mt-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-1.5 text-[12px] text-[#A8231A] flex items-start gap-1.5 shrink-0"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
      {/* 2026-10-16 v2 (laporan user: compare masih membingungkan, baris terlalu tinggi, "seperti bursa saham"): 3 kolom
          Invoice line | Compare with history | Action. Container query panel >= 640px (2026-10-16: dulu 900px -> laptop 14" + file terbuka jadi bertumpuk); di bawahnya kolom bertumpuk.
          Baris putih (tanpa latar merah/kuning), warna hanya di chip flag. Kolom Compare = 1 kalimat utama (flag + nominal history +
          selisih Rp), detail history 2 baris kecil, pembanding lain dilipat ("+n more"). */}
      <div className="overflow-auto flex-1 min-h-0 @container" data-lines-scroll>
        {lines.length > 0 && (
          <div className={`hidden @min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-4 px-3 border-l-4 border-l-transparent sticky top-0 z-10 bg-[#FBF7F4] border-b border-[#EADFD6] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70]`}>
            <span className="py-1.5">Invoice line</span>
            <span className="py-1.5 @min-[640px]:border-l @min-[640px]:border-[#E4D8CF] @min-[640px]:pl-3">Compare with history <span className="normal-case tracking-normal font-normal text-[#8A7A8B]">— flag is based on the main reference</span></span>
            <span className="py-1.5 w-[120px] @min-[1000px]:w-[136px] @min-[640px]:border-l @min-[640px]:border-[#E4D8CF] @min-[640px]:pl-3 text-center">Action</span>
          </div>
        )}
        {lines.length === 0 && <div className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No cost lines.</div>}
        {shownLines.map(l => {
          const rowBusy = busy === l.id || busy === 'all'
          const { main, others } = pickComparators(l)
          const newItem = !l.cost_item_id || l.compare_flag === 'item_baru'
          const noCostItem = !l.cost_item_id
          const remarkVal = remarks[l.id] ?? (l.remark || '')
          const editingRemark = editable && remarkOpen.has(l.id)
          const remarkRows = Math.min(6, Math.max(1, remarkVal.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 90)), 0)))
          const quiet = isQuietLine(l, main)
          const folded = quiet && !showAllCompares && !expanded.has(l.id)
          // Pembanding lain (next / alternative) tampil otomatis bila compare_check (alasan cek) atau "Show all compares".
          const othersOpen = !folded && (showAllCompares || !!l.compare_check || moreOpen.has(l.id))
          const verifyTitle = !l.is_verified && noCostItem ? 'Choose a cost item first (or LAIN_LAIN)' : l.is_verified ? `Verified${l.verified_by ? ` by ${l.verified_by}` : ''} — click to undo` : 'Mark this line as verified'
          return (
            <div key={l.id} data-line-id={l.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-4 gap-y-0 px-3 border-b border-[#F0E8E2] border-l-4 bg-white hover:bg-[#FDFBFA] ${l.is_verified ? 'border-l-[#17663D]' : 'border-l-transparent'} ${rowBusy ? 'opacity-60' : ''}`}>
              {/* ── Kolom 1: baris invoice (2 baris) ── */}
              <div className="min-w-0 col-span-2 @min-[640px]:col-span-1 pt-2 pb-1.5 @min-[640px]:pb-2" data-line-left>
                <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                  <span className="shrink-0 mt-px inline-flex items-center justify-center min-w-[22px] h-[20px] px-1 rounded-md bg-[#F5EDF3] text-[11px] font-bold text-[#6B3470] tabular-nums">{l.line_no}</span>
                  <div className="flex-1 min-w-[110px] text-[12.5px] font-semibold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{l.description_raw}</div>
                  <div className="ml-auto shrink-0 text-right text-[13px] font-bold text-[#3B1B3D] tabular-nums whitespace-nowrap">{fmtMoney(l.amount, currency)}</div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[30px]">
                  <div className="flex-1 min-w-[140px] max-w-[260px]">
                    {editable ? (
                      <CostAgentCostItemPicker items={items} value={l.cost_item_id ?? null} disabled={rowBusy}
                        onChange={id => run(l.id, () => verify(l, { costItemId: id, learnAlias: id !== null }))} />
                    ) : (
                      <span className="text-[12px] text-[#3B1B3D] truncate block">{l.cost_item_code ? `${l.cost_item_code} — ${l.cost_item_name}` : '—'}</span>
                    )}
                  </div>
                  {/* 2026-10-16 v5 (permintaan user): Remark DI SAMPING cost item (dulu bar di bawah -> baris terlalu tinggi). */}
                  {editable && <ActionBtn data="remark" active={editingRemark} onClick={() => setRemarkOpen(p => new Set(p).add(l.id))} icon={<MessageSquare size={12} />} title={l.remark || undefined}>{l.remark ? 'Edit remark' : 'Remark'}</ActionBtn>}
                  {noCostItem && <Chip tone="red" title="Choose a cost item (or LAIN_LAIN) before verifying and submitting">Not mapped</Chip>}
                  {newItem && editable && <button type="button" className={LINK} onClick={() => setAddFor(l)}><Plus size={11} /> Add as new cost item</button>}
                  {/* sql/063: cara AI mencocokkan cost item (hanya metode yang diberi label). */}
                  {l.cost_item_id && l.match_method && MATCH_METHOD_LABEL[l.match_method] && (
                    <span className="text-[10.5px] text-[#8A7A8B]" title={`Matched by: ${MATCH_METHOD_LABEL[l.match_method]}`} data-match-method={l.match_method}>{MATCH_METHOD_LABEL[l.match_method]}</span>
                  )}
                  {l.remark && !editingRemark && <span className="min-w-0 max-w-full text-[11px] text-[#6E5E70] italic truncate" title={l.remark}>{l.remark}</span>}
                  {(l.qty != null || l.unit_price != null) && <span className="ml-auto text-[10.5px] text-[#8A7A8B] tabular-nums whitespace-nowrap">{fmtNumber(l.qty, 3)}{l.unit ? ` ${l.unit}` : ''} × {fmtNumber(l.unit_price)}</span>}
                </div>
              </div>

              {/* ── Kolom 2: compare ── */}
              <div className="min-w-0 col-span-1 pb-2 @min-[640px]:pt-2 @min-[640px]:border-l @min-[640px]:border-[#E4D8CF] @min-[640px]:pl-3 flex items-start gap-2" data-line-right data-folded={folded || undefined}>
                <div className="flex-1 min-w-0">
                {!main ? (
                  <div className="flex items-center gap-2 flex-wrap min-h-[22px]">
                    <CompareFlagChip flag={l.compare_flag} />
                    <span className="text-[12px] text-[#6E5E70]">{newItem ? 'Not in cost master yet — nothing to compare' : 'No history yet for this cost item'}</span>
                  </div>
                ) : (
                  <>
                    <MainReference line={l} h={main} currency={currency} folded={folded}
                      toggle={quiet && !showAllCompares ? { open: !folded, onClick: () => toggleExpanded(l.id) } : undefined} />
                    {!folded && others.length > 0 && (
                      othersOpen ? (
                        <div className="mt-1.5 flex flex-col gap-1.5 border-t border-dashed border-[#EADFD6] pt-1.5">
                          {others.map(o => (
                            <React.Fragment key={`${o.pick}-${o.history_id}`}><OtherReference line={l} h={o} currency={currency}
                              onUse={o.pick === 'alternative' && editable ? () => run(l.id, () => costAgentSetLineReference(l.id, o.history_id, actor)) : undefined}
                              useDisabled={busy !== null} /></React.Fragment>
                          ))}
                          {!showAllCompares && !l.compare_check && (
                            <button type="button" className={`${LINK} !text-[#8A7A8B] self-start ml-[108px] @min-[1000px]:ml-[124px]`} onClick={() => toggleMore(l.id)}>Hide other reference{others.length > 1 ? 's' : ''}</button>
                          )}
                        </div>
                      ) : (
                        <button type="button" className={`${LINK} !text-[#8A7A8B] mt-1 ml-[108px] @min-[1000px]:ml-[124px]`} onClick={() => toggleMore(l.id)}>
                          + {others.length} more reference{others.length > 1 ? 's' : ''}
                        </button>
                      )
                    )}
                  </>
                )}
                </div>
                {/* 2026-10-16 v5 (permintaan user): History (+ Reset pembanding manual) DI SAMPING kanan compare, sejajar headline. */}
                <div className="shrink-0 flex flex-col items-stretch gap-1">
                  <ActionBtn data="browse-history" onClick={() => setBrowseFor(l)} icon={<History size={12} />} title="Browse cost history for this line">History</ActionBtn>
                  {editable && l.ref_history_id != null && (
                    <ActionBtn data="reset-ref" disabled={rowBusy} onClick={() => run(l.id, () => costAgentSetLineReference(l.id, null, actor))} icon={<RotateCcw size={12} />} title="Reset comparison — go back to the automatically chosen history">Reset</ActionBtn>
                  )}
                </div>
              </div>

              {/* ── Kolom 3: aksi (Verify + Edit line) ── */}
              {/* 2026-10-16 v3: tombol vertikal (dulu menu ⋯); v4: History -> kolom Compare, Remark -> kolom Invoice line. */}
              <div className={`w-[120px] @min-[1000px]:w-[136px] flex flex-col items-stretch gap-1 justify-self-end pb-2 @min-[640px]:pt-2 @min-[640px]:border-l @min-[640px]:border-[#E4D8CF] @min-[640px]:pl-3`} data-line-actions>
                {editable ? (
                  <button type="button" data-verify-line disabled={rowBusy || (!l.is_verified && noCostItem)} title={verifyTitle}
                    onClick={() => run(l.id, () => verify(l, { isVerified: !l.is_verified, learnAlias: !l.is_verified && !!l.cost_item_id }))}
                    className={`inline-flex items-center justify-center gap-1 h-7 rounded-md text-[11.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${l.is_verified ? 'bg-[#17663D] text-white hover:bg-[#12522F]' : 'border border-[#9FD3B4] bg-white text-[#17663D] hover:bg-[#EAF7EF]'}`}>
                    <Check size={12} /> {l.is_verified ? 'Verified' : 'Verify'}
                  </button>
                ) : (
                  <Chip tone={l.is_verified ? 'green' : 'grey'} className="justify-center h-7" title={l.verified_by ? `By ${l.verified_by}` : undefined}>{l.is_verified ? <><Check size={10} /> Verified</> : 'Not verified'}</Chip>
                )}
                {editable && <ActionBtn data="edit-line" disabled={rowBusy} onClick={() => setEditFor(l)} icon={<Pencil size={12} />} title="Edit line text, qty, price or amount">Edit line</ActionBtn>}
              </div>

              {editingRemark && (
                <div className="col-span-full pl-[30px] pb-2">
                  <textarea className={`${SA_INPUT} !h-auto min-h-7 py-1 text-[12px] leading-snug resize-y`} rows={remarkRows} value={remarkVal} disabled={rowBusy} placeholder="Remark — saved when you leave the box"
                    aria-label="Remark" autoFocus
                    onChange={e => setRemarks(p => ({ ...p, [l.id]: e.target.value }))}
                    onBlur={() => {
                      const v = remarkVal.trim()
                      setRemarkOpen(p => { const n = new Set(p); n.delete(l.id); return n })
                      if (v && v !== (l.remark || '')) run(l.id, () => verify(l, { remark: v }))
                    }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* 2026-10-16 (permintaan user): ringkasan jumlah & total per flag DIHAPUS; footer = Needs check + Grand total. */}
      {(needsCheck.length > 0 || footerRight) && (
        <div className="px-3 py-1.5 border-t border-[#EADFD6] bg-[#FBF7F4] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] shrink-0">
          {needsCheck.length > 0 && (
            <button type="button" aria-pressed={onlyCheck} onClick={() => setOnlyCheck(v => !v)} data-needs-check-filter
              title={onlyCheck ? 'Show all lines' : 'Show only lines whose same-line alternative differs from the main reference'}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ${onlyCheck ? 'bg-[#7A4F00] text-white' : 'bg-[#FFF1D6] text-[#7A4F00] hover:bg-[#FFE6B3]'}`}>
              <AlertTriangle size={11} /> Needs check: <b className="tabular-nums">{needsCheck.length}</b>{onlyCheck ? ' · show all' : ''}
            </button>
          )}
          {footerRight && <div className="ml-auto">{footerRight}</div>}
        </div>
      )}
      {browseFor && (
        <CostAgentHistoryBrowser line={lines.find(x => x.id === browseFor.id) || browseFor} currency={currency} invoice={invoice}
          costItems={items} ports={ports} vessels={vessels} vendors={vendors} cache={historyCache} editable={editable}
          onClose={() => setBrowseFor(null)}
          onUse={async historyId => {
            const l = browseFor
            await costAgentSetLineReference(l.id, historyId, actor) // gagal -> error tampil di drawer (drawer tetap terbuka)
            setBrowseFor(null)
            await run(l.id, async () => {}) // muat ulang modal (flag compare dihitung ulang server)
          }} />
      )}
      {addFor && <AddCostItemModal line={addFor} costItems={items} actor={actor} onClose={() => setAddFor(null)} onAdded={async id => {
        const l = addFor
        setAddFor(null)
        await run(l.id, () => verify(l, { costItemId: id, isVerified: true, learnAlias: true }))
      }} />}
      {editFor && <EditLineModal line={editFor} currency={currency} actor={actor} onClose={() => setEditFor(null)} onSaved={async changed => {
        const l = editFor
        setEditFor(null)
        if (!changed) { onToast?.('No changes to save.', 'warn'); return }
        await run(l.id, async () => {})
        onToast?.('Line updated — please verify again')
      }} />}
    </div>
  )
}

// Selisih baris invoice vs pembanding (Rp & %): positif = invoice lebih mahal.
function diffOf(l: CostAgentInvoiceLine, h: CostAgentLineHistory) {
  const diff = Number(l.amount || 0) - Number(h.amount || 0)
  const pct = h.amount ? (diff / Math.abs(Number(h.amount))) * 100 : null
  return { diff, pct }
}

// Grid 3 kolom ditulis LITERAL di className (Tailwind tidak membaca kelas hasil interpolasi):
// >= 640px: [minmax(0,1fr) minmax(0,1.2fr) auto]; di bawahnya: kolom 1 penuh, lalu Compare | Action.

// Posisi popover portal `fixed` di bawah anchor (atas bila tidak muat), dibagi faktor zoom yang DIUKUR (rect / offsetWidth popover) --
// pola dropdown portal di bawah zoom 90% (cost item picker). align 'right' = tepi kanan popover sejajar tepi kanan anchor.
function useFixedPopover(open: boolean, anchorRef: React.RefObject<HTMLElement | null>, popRef: React.RefObject<HTMLElement | null>, align: 'left' | 'right' = 'left') {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const a = anchorRef.current, pop = popRef.current
    if (!a || !pop) return
    const r = a.getBoundingClientRect()
    const scale = pop.offsetWidth ? pop.getBoundingClientRect().width / pop.offsetWidth : 1
    const vw = window.innerWidth / scale, vh = window.innerHeight / scale
    const w = pop.offsetWidth, ht = pop.offsetHeight
    let left = align === 'right' ? r.right / scale - w : r.left / scale, top = r.bottom / scale + 4
    if (left + w > vw - 8) left = vw - w - 8
    left = Math.max(8, left)
    if (top + ht > vh - 8) top = Math.max(8, r.top / scale - ht - 4)
    setPos({ left, top })
  }, [open, align, anchorRef, popRef])
  return pos
}
// Klik di luar anchor & popover -> onOutside (dipakai menutup menu / popover ⓘ).
function useOutsideClick(open: boolean, refs: React.RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!refs.some(r => r.current?.contains(e.target as Node))) onOutside() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }) // sengaja tanpa deps: refs & onOutside baru tiap render
}

// Tombol aksi kecil kolom Action (vertikal, ikon + label).
function ActionBtn({ data, onClick, disabled, active, icon, title, children }: {
  data: string; onClick: () => void; disabled?: boolean; active?: boolean; icon: React.ReactNode; title?: string; children: React.ReactNode
}) {
  return (
    <button type="button" data-action={data} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-semibold disabled:opacity-40 ${active ? 'border-[#C9A9C4] bg-[#F5EDF3] text-[#6B3470]' : 'border-[#EADFD6] bg-white text-[#6E5E70] hover:text-[#6B3470] hover:border-[#C9A9C4]'}`}>
      <span className="shrink-0">{icon}</span><span className="truncate">{children}</span>
    </button>
  )
}

// 2026-10-16 v6 (permintaan user): kolom Compare = NOMINAL HISTORY DI KIRI (blok 112px, langsung bersanding dgn nominal invoice di
// ujung kanan kolom Invoice line) + selisih Rp di bawahnya; di kanannya: [flag / 2nd ref / Alternative] [line_match] nama baris cost
// history, lalu baris kecil sumber · vessel · port + ⓘ (tgl, DWT, vendor, invoice no, voyage, invoice title tetap di popover).
const sourceLabel = (h: CostAgentLineHistory) => matchLevelLabel(h.match_level, { dwt_diff: h.dwt_diff, distance_km: h.distance_km })
const AMT_COL = 'w-[96px] @min-[1000px]:w-[112px] shrink-0 tabular-nums'
const diffCls = (diff: number, neutral = false) => neutral || diff === 0 ? 'text-[#8A7A8B]' : diff > 0 ? 'text-[#A8231A]' : 'text-[#17663D]'
const signedMoney = (v: number, currency: string) => `${v > 0 ? '+' : ''}${fmtMoney(v, currency)}`

// Baris kecil: sumber · vessel · port ⓘ.
function RefWhere({ line, h, showMainLabel }: { line: CostAgentInvoiceLine; h: CostAgentLineHistory; showMainLabel?: boolean }) {
  const manual = h.pick === 'manual' || h.match_level === 'manual'
  const where = [h.vessel_name, h.port_code ? `${h.port_code}${h.port_name ? ` — ${h.port_name}` : ''}` : null].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0 text-[11px] leading-snug text-[#8A7A8B] [overflow-wrap:anywhere]">
      <span title={`${manual ? 'Chosen by user' : sourceLabel(h)}${where ? ` · ${where}` : ''}`}>
        {/* sql/061: primary tetap dikirim walau ada pembanding manual -> "Main reference" hanya tanpa manual. */}
        {manual ? <span className="font-semibold text-[#6B3470]">Chosen by user</span>
          : <>{showMainLabel && h.pick === 'primary' && line.ref_history_id == null ? <span className="font-semibold text-[#6B3470]">Main reference: </span> : null}{sourceLabel(h)}</>}
        {where && <> · <span className="text-[#6E5E70] font-medium">{where}</span></>}
      </span>{' '}
      <span className="inline-block align-middle"><HistoryInfo h={h} /></span>
    </div>
  )
}

// Pembanding utama (flag dihitung dari sini). folded = baris tenang dilipat (hanya baris 1).
function MainReference({ line, h, currency, folded, toggle }: {
  line: CostAgentInvoiceLine; h: CostAgentLineHistory; currency: string; folded: boolean; toggle?: { open: boolean; onClick: () => void }
}) {
  const { diff } = diffOf(line, h)
  const manual = h.pick === 'manual' || h.match_level === 'manual'
  const toggleBtn = toggle && (
    <button type="button" className={`${LINK} !text-[#8A7A8B] whitespace-nowrap shrink-0`} onClick={toggle.onClick}>
      {toggle.open ? <><ChevronUp size={11} /> Less</> : <><ChevronDown size={11} /> Details</>}
    </button>
  )
  return (
    <div className="flex items-start gap-3 min-w-0" data-compare-headline data-comparator="main" data-history-pick={h.pick || undefined}
      data-compare-summary={folded ? true : undefined}>
      <div className={AMT_COL} data-history-amount>
        <div className="text-[13px] font-bold text-[#3B1B3D] whitespace-nowrap leading-snug">{fmtMoney(h.amount, currency)}</div>
        <div className={`text-[10.5px] whitespace-nowrap ${diffCls(diff, line.compare_flag === 'sesuai')}`} data-diff>{diff === 0 ? 'same amount' : signedMoney(diff, currency)}</div>
      </div>
      <div className={`flex-1 min-w-0 pl-2 border-l-2 ${manual ? 'border-[#6B3470]' : 'border-[#EADFD6]'}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <CompareFlagChip flag={line.compare_flag} diffPct={line.compare_diff_pct} />
          <LineMatchBadge match={h.line_match} similarity={h.similarity} />
          {line.compare_check && (
            <Chip tone="amber" title={`Main reference: ${fmtMoney(line.compare_ref_amount, currency)} · Same-line alternative: ${fmtMoney(line.compare_alt_amount, currency)}`}>
              <AlertTriangle size={10} /> Check reference
            </Chip>
          )}
          <span className="min-w-[140px] flex-1 text-[12px] font-medium text-[#3B1B3D] truncate" title={h.description_raw || undefined}>{h.description_raw || '—'}</span>
          {folded && toggleBtn}
        </div>
        {!folded && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0"><RefWhere line={line} h={h} showMainLabel /></div>
            {toggleBtn}
          </div>
        )}
      </div>
    </div>
  )
}

// Pembanding lain (next / alternative): pola SAMA pembanding utama, lebih tipis. Nominal di kiri + selisih (Rp & %), lalu
// [2nd ref / Alternative · same line] [line_match] nama baris cost / sumber · vessel · port ⓘ [Use as comparison].
function OtherReference({ line, h, currency, onUse, useDisabled }: {
  line: CostAgentInvoiceLine; h: CostAgentLineHistory; currency: string; onUse?: () => void; useDisabled?: boolean
}) {
  const { diff, pct } = diffOf(line, h)
  const alt = h.pick === 'alternative'
  return (
    <div className="flex items-start gap-3 min-w-0" data-comparator="second" data-history-pick={h.pick || undefined}>
      <div className={AMT_COL}>
        <div className="text-[12px] font-semibold text-[#6E5E70] whitespace-nowrap leading-snug">{fmtMoney(h.amount, currency)}</div>
        <div className={`text-[10.5px] leading-tight ${diffCls(diff)}`}>{diff === 0 ? 'same amount' : <><span className="whitespace-nowrap">{signedMoney(diff, currency)}</span>{pct !== null ? <> <span className="whitespace-nowrap">({fmtPct(pct)})</span></> : null}</>}</div>
      </div>
      <div className={`flex-1 min-w-0 pl-2 border-l-2 ${alt ? 'border-dashed border-[#B9A6DC]' : 'border-[#EADFD6]'} text-[11px] leading-snug`}>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0" title={h.description_raw || undefined}>
          {alt ? <span className="shrink-0 px-1.5 py-px rounded bg-[#ECE6F7] text-[#5B2E8C] text-[10px] font-bold" title="Same service found elsewhere. The flag is still based on the main reference — check which one fits.">Alternative · same line</span>
            : <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.04em] text-[#8A7A8B]">2nd ref</span>}
          <span className="shrink-0"><LineMatchBadge match={h.line_match} similarity={h.similarity} /></span>
          <span className="min-w-[140px] flex-1 text-[#3B1B3D] truncate">{h.description_raw || '—'}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0"><RefWhere line={line} h={h} /></div>
          {onUse && (
            <button type="button" disabled={useDisabled} onClick={onUse} className="shrink-0 inline-flex items-center gap-0.5 font-semibold text-[#5B2E8C] hover:underline disabled:opacity-50 whitespace-nowrap"
              title="Use this same-line history as the comparison for this invoice line">
              <Pin size={11} /> Use as comparison
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Ikon ⓘ + popover detail history. Hover (desktop) membuka, klik (mobile) toggle. Popover = portal `fixed` supaya tidak terpotong
// panel scroll; posisi dibagi faktor zoom yang DIUKUR (rect / offsetWidth popover) -- pola dropdown portal di bawah zoom 90% (cost item picker).
function HistoryInfo({ h }: { h: CostAgentLineHistory }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const cancelClose = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const show = () => { cancelClose(); setOpen(true) }
  const hideSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(false), 150) }
  const pos = useFixedPopover(open, btnRef, popRef)
  useOutsideClick(open, [btnRef, popRef], () => setOpen(false))
  useEffect(() => () => cancelClose(), [])

  const rows: [string, string][] = [
    ['Date', `${fmtDate(h.service_date)}${daysDiffLabel(h.days_diff) ? ` (${daysDiffLabel(h.days_diff)})` : ''}`],
    ['Vessel', `${h.vessel_name || '—'}${h.vessel_dwt ? ` (DWT ${fmtNumber(h.vessel_dwt, 0)})` : ''}`],
    ['Port', h.port_code ? `${h.port_code}${h.port_name ? ` — ${h.port_name}` : ''}` : '—'],
    ['Vendor', h.vendor_name || '—'],
    ['Invoice title', h.invoice_description || '—'], // judul invoice lama -- tidak ditampilkan di panel compare
    ['Invoice no', h.invoice_no || '—'],
    ['Voyage', h.voyage_no || '—'],
  ]
  return (
    <>
      <button ref={btnRef} type="button" aria-label="History details" aria-expanded={open} data-history-info
        onMouseEnter={show} onMouseLeave={hideSoon} onClick={e => { e.stopPropagation(); cancelClose(); setOpen(o => !o) }}
        className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full ${open ? 'text-[#6B3470]' : 'text-[#A898A9] hover:text-[#6B3470]'}`}>
        <Info size={12} />
      </button>
      {open && createPortal(
        <div ref={popRef} role="tooltip" data-history-info-popover onMouseEnter={cancelClose} onMouseLeave={hideSoon}
          style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="z-[120] w-[300px] max-w-[90vw] rounded-lg border border-[#EADFD6] bg-white shadow-xl px-3 py-2 text-[11.5px]">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-[#8A7A8B]">{k}</dt>
                <dd className="text-[#3B1B3D] [overflow-wrap:anywhere]">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>,
        document.body,
      )}
    </>
  )
}

// Angka bebas: "1.250.000" / "1,5" / "1250000.5" -> number | null. Tanpa koma & 1 titik = desimal ("2.5").
function parseAmountInput(v: string): number | null {
  let s = v.trim().replace(/\s+/g, '').replace(/^Rp/i, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // separator terakhir = desimal
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const numStr = (v: number | null | undefined) => (v === null || v === undefined || isNaN(Number(v)) ? '' : String(Number(v)))

// sql/065 C: edit manual baris -> fn_cost_agent_update_line. Amount otomatis qty × unit price saat keduanya diisi (tetap bisa diubah).
function EditLineModal({ line, currency, actor, onClose, onSaved }: {
  line: CostAgentInvoiceLine; currency: string; actor: string | null; onClose: () => void; onSaved: (changed: boolean) => void
}) {
  const [desc, setDesc] = useState(line.description_raw || '')
  const [qty, setQty] = useState(numStr(line.qty))
  const [price, setPrice] = useState(numStr(line.unit_price))
  const [amount, setAmount] = useState(numStr(line.amount))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recalc = (q: string, p: string) => {
    const qn = parseAmountInput(q), pn = parseAmountInput(p)
    if (qn !== null && pn !== null) setAmount(String(Math.round(qn * pn * 100) / 100))
  }
  const qtyN = parseAmountInput(qty), priceN = parseAmountInput(price), amountN = parseAmountInput(amount)

  const save = async () => {
    const d = desc.trim()
    if (!d) { setError('Description is required.'); return }
    if (d.length > COST_AGENT_LINE_DESCRIPTION_MAX) { setError(`Description is at most ${COST_AGENT_LINE_DESCRIPTION_MAX} characters.`); return }
    if (qty.trim() && qtyN === null) { setError('Qty is not a valid number.'); return }
    if (price.trim() && priceN === null) { setError('Unit price is not a valid number.'); return }
    if (amountN === null) { setError('Amount is required.'); return }
    setBusy(true); setError(null)
    try {
      const res = await costAgentUpdateLine({ lineId: line.id, description: d, qty: qty.trim() ? qtyN : null, unitPrice: price.trim() ? priceN : null, amount: amountN, actor })
      onSaved(!!res?.changed)
    } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
  }

  return (
    <CostAgentModal z="z-[80]" maxWidth="max-w-xl" onClose={() => { if (!busy) onClose() }} title={`Edit line ${line.line_no}`}
      subtitle="After saving, the line must be verified again; the cost item may be re-detected from the new text."
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="p-5 grid grid-cols-2 gap-3 content-start" data-edit-line-modal>
        <div className="col-span-2">
          <FieldLabel required hint={`${desc.trim().length}/${COST_AGENT_LINE_DESCRIPTION_MAX}`}>Description</FieldLabel>
          <textarea className={`${SA_INPUT} !h-auto py-1.5 leading-snug resize-y`} rows={3} maxLength={COST_AGENT_LINE_DESCRIPTION_MAX} value={desc} autoFocus
            onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Qty</FieldLabel>
          <input className={SA_INPUT} inputMode="decimal" value={qty} placeholder="optional" onChange={e => { setQty(e.target.value); recalc(e.target.value, price) }} />
        </div>
        <div>
          <FieldLabel>Unit price</FieldLabel>
          <input className={SA_INPUT} inputMode="decimal" value={price} placeholder="optional" onChange={e => { setPrice(e.target.value); recalc(qty, e.target.value) }} />
        </div>
        <div className="col-span-2">
          <FieldLabel required hint="auto = qty × unit price when both are filled">Amount</FieldLabel>
          <input className={SA_INPUT} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          <p className="mt-1 text-[11px] text-[#6E5E70] tabular-nums">{amountN !== null ? fmtMoney(amountN, currency) : amount.trim() ? 'Not a valid number' : '—'}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-2 text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]" data-original>
          Original: <i>{line.description_raw}</i> · {line.qty != null || line.unit_price != null ? `${fmtNumber(line.qty, 3)} × ${fmtNumber(line.unit_price)} · ` : ''}{fmtMoney(line.amount, currency)}
        </div>
        {error && <div className="col-span-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
      </div>
    </CostAgentModal>
  )
}

// Field Code = combobox: pilih cost item yg SUDAH ADA (baris langsung memakai item itu, tanpa add_cost_item -- teks baris
// dipelajari sbg alias lewat verify_line learn_alias) atau ketik code baru (alur lama: add_cost_item).
function AddCostItemModal({ line, costItems, actor, onClose, onAdded }: {
  line: CostAgentInvoiceLine; costItems: CostAgentCostItem[]; actor: string | null; onClose: () => void; onAdded: (id: number) => void
}) {
  const [code, setCode] = useState('')
  const [codeOpen, setCodeOpen] = useState(true) // daftar cost item langsung tampil saat modal dibuka
  const [name, setName] = useState(line.description_raw.slice(0, 80))
  const [category, setCategory] = useState('PORT')
  const [gl, setGl] = useState('')
  const [keywords, setKeywords] = useState(line.description_raw.toUpperCase().slice(0, 60))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const codeTerm = code.trim().toUpperCase()
  const existing = codeTerm ? costItems.find(c => c.code.toUpperCase() === codeTerm) || null : null
  const codeMatches = useMemo(() => {
    const t = codeTerm.toLowerCase()
    return (t ? costItems.filter(c => `${c.code} ${c.name} ${c.category}`.toLowerCase().includes(t)) : costItems).slice(0, 60)
  }, [costItems, codeTerm])

  const save = async () => {
    // Code sudah ada: keyword tambahan (bila diisi) ditambahkan server ke item itu (sql/058 add_cost_item: nama & keyword lama tetap).
    if (existing) {
      const extra = keywords.split(',').map(k => k.trim()).filter(Boolean)
      if (!extra.length) { onAdded(existing.id); return }
      setBusy(true); setError(null)
      try {
        const id = await costAgentAddCostItem({ code: existing.code, name: existing.name, category: existing.category, glAccount: existing.gl_account, keywords: extra, actor })
        onAdded(Number(id || existing.id))
      } catch (e: any) { setError(e.message || String(e)); setBusy(false) }
      return
    }
    if (!code.trim() || !name.trim()) { setError('Code and name are required.'); return }
    setBusy(true); setError(null)
    try {
      const id = await costAgentAddCostItem({
        code: code.trim(), name: name.trim(), category, glAccount: gl.trim() || null,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), actor,
      })
      onAdded(Number(id))
    } catch (e: any) {
      setError(e.message || String(e)); setBusy(false)
    }
  }

  return (
    <CostAgentModal z="z-[80]" maxWidth="max-w-3xl" onClose={() => { if (!busy) onClose() }} title={existing ? 'Use existing cost item' : 'Add new cost item'}
      subtitle={<>From line: <i>{line.description_raw}</i></>}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={busy}>{busy ? 'Saving…' : existing ? 'Use for this line' : 'Add & use for this line'}</button>
      </>}>
      <div className="p-5 grid grid-cols-2 gap-3 content-start min-h-[460px]">
        <div className="relative">
          <FieldLabel required hint="pick existing or type a new one">Code</FieldLabel>
          <input className={SA_INPUT} value={code} placeholder="e.g. PORT_CLEARANCE" autoFocus
            onFocus={() => setCodeOpen(true)} onBlur={() => setTimeout(() => setCodeOpen(false), 150)}
            onChange={e => { setCode(e.target.value.toUpperCase()); setCodeOpen(true) }} />
          {codeOpen && (
            <div className="absolute z-[90] mt-1 w-[min(560px,85vw)] max-h-72 overflow-y-auto bg-white border border-[#EADFD6] rounded-lg shadow-xl">
              {codeTerm && !existing && (
                <button type="button" onMouseDown={e => { e.preventDefault(); setCodeOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-[#6B3470] hover:bg-[#F5EDF3] border-b border-[#F3EEEA] inline-flex items-center gap-1">
                  <Plus size={12} /> New code "{codeTerm}"
                </button>
              )}
              {codeMatches.length === 0 ? <div className="px-3 py-2 text-[12px] text-[#8A7A8B]">No existing cost item matches</div> : codeMatches.map(c => (
                <button type="button" key={c.id} onMouseDown={e => { e.preventDefault(); setCode(c.code); setCodeOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#FBF7F4] ${existing?.id === c.id ? 'bg-[#F5EDF3]' : ''}`}>
                  <span className="block text-[#3B1B3D] font-semibold truncate">{c.code} <span className="font-normal text-[#8A7A8B]">· {c.category}</span></span>
                  <span className="block text-[11px] text-[#6E5E70] truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <FieldLabel>Category</FieldLabel>
          <select className={SA_INPUT} value={existing ? existing.category : category} disabled={!!existing} onChange={e => setCategory(e.target.value)}>
            {[...new Set([...(existing ? [existing.category] : []), ...CATEGORIES])].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {existing && (
          <div className="col-span-2 rounded-lg border border-[#C9D3F0] bg-[#EEF1FA] px-3 py-2 text-[12px] text-[#2F4FA8]">
            <b>{existing.code}</b> already exists — this line will use it, and the line text is learned as an alias.
          </div>
        )}
        <div className="col-span-2"><FieldLabel required>Name</FieldLabel><input className={SA_INPUT} value={existing ? existing.name : name} disabled={!!existing} onChange={e => setName(e.target.value)} /></div>
        <div><FieldLabel>GL account</FieldLabel><input className={SA_INPUT} value={existing ? existing.gl_account || '' : gl} disabled={!!existing} onChange={e => setGl(e.target.value)} placeholder="e.g. 61050" /></div>
        <div className="col-span-2">
          <FieldLabel hint="comma separated">{existing ? 'Keywords to add' : 'Keywords'}</FieldLabel>
          <input className={SA_INPUT} value={keywords} onChange={e => setKeywords(e.target.value)} />
          <p className="mt-1 text-[11px] text-[#6E5E70] leading-snug">Comma-separated words used to auto-detect this cost on future invoices. If the code already exists, these keywords are added to it (existing keywords and name are kept).</p>
          {existing && (existing.keywords || []).length > 0 && <p className="mt-0.5 text-[11px] text-[#8A7A8B] [overflow-wrap:anywhere]">Existing keywords: {(existing.keywords || []).join(', ')}</p>}
        </div>
        {error && <div className="col-span-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{error}</div>}
      </div>
    </CostAgentModal>
  )
}
