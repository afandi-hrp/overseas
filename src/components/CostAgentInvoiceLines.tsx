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
import { Plus, CheckCheck, AlertTriangle, History, RotateCcw, Pin, Pencil, Check, CheckCircle2, MessageSquare, Info, ArrowUp, ArrowDown, Equal, Scissors, Percent } from 'lucide-react'
import { CompareFlagChip, MatchLevelLabel, CostAgentModal, FieldLabel } from './CostAgentUi'
import { SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, Chip } from './SeaAirAuditUi'
import { DOC_GATE_TOAST, isDocGateError } from '../utils/CostAgentGate'
import { costAgentCheckerSetCostItem, costAgentCheckerSetLineRemark, costAgentCheckerValidateLine, costAgentCheckerValidateLines, isSodError } from '../utils/CostAgentWorkflow'
import { originalOf } from '../utils/CostAgentLinesView'
import { LineTaxDialog, LineVatDialog, SplitLineDialog } from './CostAgentLineDialogs'
import { classifyCostLine, classifyCostLines, costKey } from './CostAgentValidationReports'
import { VerifyReasonIcon, VerifyReasonsToggle, VerifyReasonsList } from './CostAgentVerifyReasons'
import { reasonByLine, type LineVerifyReasons } from '../utils/CostAgentVerifyReasons'
import CostAgentCostItemPicker from './CostAgentCostItemPicker'
import { ONLY_CHECKER_ADDS_TEXT, useCanAddCostItem } from '../utils/useCanAddCostItem'
import CostAgentHistoryBrowser, { LineMatchBadge, ChosenByUserLabel, type HistoryCache } from './CostAgentHistoryBrowser'
import {
  costAgentVerifyLine, costAgentAddCostItem, costAgentSetLineReference, costAgentUpdateLine, COST_AGENT_LINE_DESCRIPTION_MAX,
  MATCH_METHOD_LABEL, matchLevelLabel, fmtMoney, fmtRupiah, fmtNumber, fmtPct, fmtDate, daysDiffLabel,
  type CostAgentInvoiceLine, type CostAgentLineHistory, type CostAgentCostItem, type CostAgentPort,
  type CostAgentVessel, type CostAgentVendor,
} from '../utils/CostAgentHelpers'

// Grid tampilan ringkas gaya Cost validation (header kolom tampil >= 870px = laptop 14" saat file tampil): >= 870px SATU baris enam kolom kompak (jarak kolom 8px); >= 1200px lebih lega (jarak 16px, Action 248px + label Split/Tax); 640-869px: baris 1 Validation penuh, baris 2 Actual | Expected | Difference | Status, baris 3 Action rata kanan; < 640px bertumpuk. Kolom: Validation | Actual | Expected | Difference | Status | Action.
const SUM_GRID = 'grid-cols-3 @min-[640px]:grid-cols-[repeat(3,minmax(0,1fr))_auto] @min-[870px]:grid-cols-[minmax(190px,1.5fr)_minmax(96px,0.6fr)_minmax(96px,0.6fr)_minmax(104px,0.65fr)_minmax(84px,0.6fr)_204px] @min-[1200px]:grid-cols-[minmax(260px,1.7fr)_minmax(112px,0.65fr)_minmax(112px,0.65fr)_minmax(128px,0.7fr)_minmax(132px,0.8fr)_248px]'
const CV_CHIP: Record<string, string> = { ok: 'bg-[#EAF6EF] text-[#17663D]', accepted: 'bg-[#FFF1D6] text-[#7A4F00]', difference: 'bg-[#FDE7E4] text-[#A8231A]', above: 'bg-[#FDE7E4] text-[#A8231A]', under: 'bg-[#EEF1FA] text-[#2F4FA8]', na: 'bg-[#F3EEEA] text-[#6E5E70]' }
const CV_LABEL: Record<string, string> = { ok: 'OK', accepted: 'Accepted', difference: 'Difference', above: 'Above', under: 'Under', na: 'N/A' }
const CATEGORIES = ['PORT', 'AGENCY', 'CREW', 'DOCUMENT', 'WATER', 'ADMIN', 'TAX', 'OTHER']
// Tautan aksi kecil = chip lembut (2026-10-20, permintaan user: tombol/ikon lebih cantik) -- fungsi tetap.
const LINK = 'h-6 px-2 rounded-full border border-[#E4D3E2] bg-[#F5EDF3] text-[11px] font-semibold text-[#6B3470] hover:bg-[#EFE2EC] hover:border-[#C9A9C4] inline-flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

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


export default function CostAgentInvoiceLines({ lines, currency, costItems, editable, actor, onChanged, onToast, footerRight, toolbarLeft, invoice, ports, vessels, vendors, historyCache, verifyBlock, onGateBlocked, checkerMode, canEditEvidence, variant = 'detailed', viewSwitch, verifyReasons }: {
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
  // Gerbang dokumen (sql/087): bila terisi, Verify (per baris & "Verify all") dinonaktifkan dgn teks ini sbg tooltip; Unverify tetap boleh.
  verifyBlock?: string | null
  // Dipanggil saat server menolak dgn "DOC_GATE:" (gerbang berubah sejak terakhir dimuat) -> induk memuat ulang gerbang.
  onGateBlocked?: () => void
  // Mode checker (sql/088 + sql/101): invoice menunggu validasi & user boleh memvalidasi -> jenis biaya bisa diganti (fn_cost_agent_checker_set_cost_item),
  // edit teks + nominal (fn_cost_agent_update_line), remark checker, Validate / Validated per baris, Split dan Tax. Maker: HANYA jenis biaya, tambah jenis biaya, Verify, Remark.
  checkerMode?: boolean
  // SQL 108: boleh mengubah penanda "Amount includes VAT" (maker sebelum submit / checker saat validasi / AP Note; hanya hak TAMPIL, server menegakkan). Approver: hanya melihat lencana.
  canEditEvidence?: boolean
  // Tahap 3b: 'summary' = baris ringkas 4 kolom (bawaan tab Cost lines); 'detailed' = tampilan lengkap (modal "Cost lines — detailed"). Logika & aksi SAMA.
  variant?: 'summary' | 'detailed'
  viewSwitch?: React.ReactNode // switch Summary | Detailed (di samping "Cost validation")
  // Alasan "kenapa belum auto-verified" dari RPC (null = tidak ada / gagal diambil -> ikon & ringkasan tidak tampil).
  verifyReasons?: LineVerifyReasons | null
}) {
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remarks, setRemarks] = useState<Record<number, string>>({})
  const [addFor, setAddFor] = useState<CostAgentInvoiceLine | null>(null)
  const [editFor, setEditFor] = useState<CostAgentInvoiceLine | null>(null)
  const [browseFor, setBrowseFor] = useState<CostAgentInvoiceLine | null>(null)
  const [splitFor, setSplitFor] = useState<CostAgentInvoiceLine | null>(null)
  const [taxFor, setTaxFor] = useState<CostAgentInvoiceLine | null>(null)
  const [vatFor, setVatFor] = useState<CostAgentInvoiceLine | null>(null)
  const canSplit = !!checkerMode // 2026-10-29 (permintaan user): Split hanya milik checker; maker tidak lagi bisa memecah baris
  const [reasonsOpen, setReasonsOpen] = useState(false) // daftar baris needs_user (dibuka dari ringkasan di toolbar)
  const [onlyCheck, setOnlyCheck] = useState(false) // footer "Needs check": tampilkan hanya baris compare_check
  // sql/065 E: "Show only differences" (baris tenang dilipat) = SATU-SATUNYA mode. Toggle "Show all compares" DIHAPUS 2026-10-23 (permintaan user);
  // pembanding lain tetap bisa dibuka lewat "+n more reference" per baris.
  const showAllCompares = false
  const [remarkOpen, setRemarkOpen] = useState<Set<number>>(() => new Set()) // textarea remark sedang dibuka
  const [moreOpen, setMoreOpen] = useState<Set<number>>(() => new Set()) // "+n more reference" dibuka
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set()) // tampilan ringkas: panel Main reference dibuka segitiga

  const items = useMemo(() => costItems.filter(c => c.is_active !== false), [costItems])
  // SQL 112: hanya checker / master yang boleh menambah jenis biaya baru (keputusan dari RPC fn_cost_agent_can_add_cost_item, sekali per sesi). Maker: teks petunjuk, tanpa tombol; memilih jenis biaya yang ada tetap bisa.
  const canAddItem = useCanAddCostItem()
  const addItemControl = (l: CostAgentInvoiceLine) => canAddItem === true
    ? <button type="button" className={LINK} onClick={() => setAddFor(l)}><Plus size={11} /> Add as new cost item</button>
    : canAddItem === false ? <span className="text-[11px] text-[#8A7A8B]" data-only-checker-adds>{ONLY_CHECKER_ADDS_TEXT}</span> : null
  const reasons = useMemo(() => reasonByLine(verifyReasons), [verifyReasons])

  const run = async (key: number | 'all', fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); await onChanged() } catch (e: any) {
      if (isDocGateError(e)) { onToast?.(DOC_GATE_TOAST, 'warn'); onGateBlocked?.() } // jangan tampilkan teks mentah yang panjang
      else if (isSodError(e)) onToast?.(e.message, 'warn') // pemisahan tugas: pesan server apa adanya
      else setError(e.message || String(e))
    } finally { setBusy(null) }
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

  // compare_check (sql/061) & baris tanpa cost item (sql/065) TIDAK ikut.
  const matching = lines.filter(l => l.compare_flag === 'sesuai' && !l.is_verified && l.cost_item_id && !l.compare_check)
  const needsCheck = lines.filter(l => l.compare_check)
  const shownLines = onlyCheck && needsCheck.length ? needsCheck : lines
  const verifyAllMatching = () => run('all', async () => {
    for (const l of matching) await verify(l, { isVerified: true, learnAlias: true })
  })

  return (
    <div className="flex flex-col min-h-0 h-full @container">
      {variant === 'summary' ? (() => {
        // 2026-10-29 (permintaan user): SATU baris -- Show file | chip OK / Accepted / Above / Under / N/A / Accuracy | ringkasan auto-verify | Verify all matching.
        // Tombol "Cost validation" dihapus; kalimat "n above / under not reviewed by the maker" jadi tooltip chip (angkanya sudah di chip Above / Under).
        const cs = lines.length > 0 ? classifyCostLines(lines) : null
        const chips: { k: string; label: string; n: number }[] = cs ? [{ k: 'ok', label: 'OK', n: cs.counts.ok }, { k: 'accepted', label: 'Accepted', n: cs.counts.accepted }, { k: 'above', label: 'Above', n: cs.above }, { k: 'under', label: 'Under', n: cs.under }, { k: 'na', label: 'N/A', n: cs.counts.na }] : []
        const unreviewed = cs && cs.counts.difference > 0 ? `${cs.counts.difference} above / under not reviewed by the maker` : 'All reviewed'
        return (
          <>
            <div className="flex items-center gap-x-2 gap-y-1.5 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap" data-lines-toolbar>
              {toolbarLeft}
              {cs && (
                <div className="flex items-center gap-1.5 flex-wrap" data-cost-validation-strip title={unreviewed}>
                  {chips.map(c => <span key={c.k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${CV_CHIP[c.k]}`}>{c.label} <b className="tabular-nums">{c.n}</b></span>)}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F5EDF3] text-[#6B3470]"><span className="hidden @min-[1100px]:inline">Accuracy</span><span className="@min-[1100px]:hidden" title="Accuracy">Acc.</span> <b className="tabular-nums" data-accuracy>{cs.accuracy === null ? '—' : `${cs.accuracy}%`}</b></span>
                </div>
              )}
              {verifyReasons ? <VerifyReasonsToggle reasons={verifyReasons} open={reasonsOpen} onToggle={() => setReasonsOpen(o => !o)} />
                : checkerMode ? <span className="text-[11.5px] font-semibold text-[#6E5E70] whitespace-nowrap" data-lines-summary-text>{lines.filter(x => x.is_validated).length}/{lines.length} validated</span>
                : <span className="text-[11.5px] font-semibold text-[#6E5E70] whitespace-nowrap" data-lines-summary-text>{lines.filter(x => x.is_verified).length}/{lines.length} verified</span>}
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {viewSwitch}
                {checkerMode && (
                  <button type="button" className={`${SA_BTN_OUTLINE} !border-[#BFE3CD] !bg-[#EAF6EF] !text-[#17663D] hover:!bg-[#DDF0E5]`} data-validate-all-lines
                    disabled={busy !== null || lines.length === 0 || lines.every(x => x.is_validated)} title="Mark every line that has a cost item as validated"
                    onClick={() => run('all', async () => {
                      const r = await costAgentCheckerValidateLines(lines[0].invoice_id, actor)
                      onToast?.(r.skipped_without_cost_item > 0 ? `${r.validated} line${r.validated === 1 ? '' : 's'} validated · ${r.skipped_without_cost_item} without a cost item skipped` : `${r.validated} line${r.validated === 1 ? '' : 's'} validated`, r.skipped_without_cost_item > 0 ? 'warn' : 'ok')
                    })}>
                    <CheckCheck size={13} /> {busy === 'all' ? 'Validating…' : <><span className="hidden @min-[1100px]:inline">Validate all lines</span><span className="@min-[1100px]:hidden">Validate all</span></>}
                  </button>
                )}
                {editable && (
            <button type="button" className={`${SA_BTN_OUTLINE} !border-[#BFE3CD] !bg-[#EAF6EF] !text-[#17663D] hover:!bg-[#DDF0E5]`} disabled={!matching.length || busy !== null || !!verifyBlock} onClick={verifyAllMatching}
              title={verifyBlock ?? 'Verify every line whose amount is in line with history (lines without a cost item are skipped)'}>
              <CheckCheck size={13} /> {busy === 'all' ? 'Verifying…' : <><span className="hidden @min-[1100px]:inline">Verify all matching</span><span className="@min-[1100px]:hidden">Verify all</span> ({matching.length})</>}
            </button>
                )}
              </div>
            </div>
            {reasonsOpen && verifyReasons && <VerifyReasonsList reasons={verifyReasons} />}
          </>
        )
      })() : (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#EADFD6] shrink-0 flex-wrap">
          <div className="text-[12.5px] text-[#3B1B3D] flex items-center gap-3 flex-wrap">{toolbarLeft}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {viewSwitch}
            {editable && (
            <button type="button" className={`${SA_BTN_OUTLINE} !border-[#BFE3CD] !bg-[#EAF6EF] !text-[#17663D] hover:!bg-[#DDF0E5]`} disabled={!matching.length || busy !== null || !!verifyBlock} onClick={verifyAllMatching}
              title={verifyBlock ?? 'Verify every line whose amount is in line with history (lines without a cost item are skipped)'}>
              <CheckCheck size={13} /> {busy === 'all' ? 'Verifying…' : <><span className="hidden @min-[1100px]:inline">Verify all matching</span><span className="@min-[1100px]:hidden">Verify all</span> ({matching.length})</>}
            </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="mx-3 mt-2 rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-1.5 text-[12px] text-[#A8231A] flex items-start gap-1.5 shrink-0"><AlertTriangle size={13} className="mt-0.5" /> {error}</div>}
      {/* 2026-10-16 v9 (permintaan user): "3 kolom" = Invoice line | Invoice vs history (Invoice · % · History dalam SATU kolom) |
          Main reference -- + # & Action, garis pemisah antar kolom. Tata letak SAMA saat file/PDF tampil (hanya lebar kolom menyesuaikan,
          Main reference TIDAK turun ke bawah): panel >= 640px `grid-cols-[28px_minmax(0,0.9fr)_296px_minmax(0,1fr)_128px]`, >= 1200px `grid-cols-[28px_minmax(0,1fr)_320px_minmax(0,1.2fr)_132px]`; < 640px bertumpuk.
          Posisi sel memakai [grid-column]/[grid-row] eksplisit (col-span/row-span Tailwind v4 menimpa col-start). */}
      <div className="overflow-auto flex-1 min-h-0 @container bg-[#FBF7F4] pb-2.5" data-lines-scroll>
        {lines.length > 0 && variant === 'summary' && (
          <div className="hidden @min-[870px]:block sticky top-0 z-10 bg-[#FBF7F4] px-2.5 pt-2.5 pb-2" data-lines-header-wrap>
            <div className={`grid ${SUM_GRID} gap-x-2 @min-[1200px]:gap-x-4 items-center rounded-xl border border-transparent border-l-4 border-l-transparent bg-[#F5EDF3] px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B3470] whitespace-nowrap`} data-lines-header>
              <span className="pl-[60px]">Validation</span><span className="text-center">Actual</span><span className="text-center">Expected (history)</span><span className="text-center">Difference</span><span className="text-center">Status</span><span className="text-center">Action</span>
            </div>
          </div>
        )}
        {lines.length > 0 && variant !== 'summary' && (
          <div className="hidden @min-[640px]:block sticky top-0 z-10 bg-[#FBF7F4] px-2.5 pt-2.5 pb-2" data-lines-header-wrap>
            <div className="grid grid-cols-[28px_minmax(0,0.9fr)_296px_minmax(0,1fr)_128px] @min-[1200px]:grid-cols-[28px_minmax(0,1fr)_320px_minmax(0,1.2fr)_132px] rounded-xl border border-transparent border-l-4 border-l-transparent bg-[#F5EDF3] text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B3470]" data-lines-header>
              <span className="px-2 py-2">#</span>
              <span className="px-3 py-2 text-center">Invoice line</span>
              <span className="px-3 py-2 text-center border-l border-[#E4D3E2]">Invoice vs history</span>
              <span className="px-3 py-2 text-center border-l border-[#E4D3E2]">Main reference</span>
              <span className="px-3 py-2 text-center border-l border-[#E4D3E2]">Action</span>
            </div>
          </div>
        )}
        {lines.length === 0 && <div className="px-4 py-8 text-center text-sm text-[#6E5E70] italic">No cost lines.</div>}
        <div className="flex flex-col gap-2 px-2.5 pt-2.5 @min-[640px]:pt-0">
        {shownLines.map(l => {
          const rowBusy = busy === l.id || busy === 'all'
          const { main, others } = pickComparators(l)
          const newItem = !l.cost_item_id || l.compare_flag === 'item_baru'
          const noCostItem = !l.cost_item_id
          // Remark: maker menulis `remark` (verify_line); checker menulis `checker_remark` (sql/101) dan hanya membaca remark maker. Approver tidak menerima checker_remark.
          const remarkBase = checkerMode ? (l.checker_remark || '') : (l.remark || '')
          const remarkVal = remarks[l.id] ?? remarkBase
          const editingRemark = (editable || !!checkerMode) && remarkOpen.has(l.id)
          const orig = originalOf(l) // versi asli maker bila checker mengubah teks / nominal
          const isSplitPart = l.origin_line_id != null
          const remarkRows = Math.min(6, Math.max(1, remarkVal.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 90)), 0)))
          // Pembanding lain (next / alternative) tampil otomatis bila compare_check (alasan cek) atau "Show all compares".
          const othersOpen = showAllCompares || !!l.compare_check || moreOpen.has(l.id)
          const autoVerified = l.is_verified && l.verified_by === 'system'
          const gateBlocked = !l.is_verified && !!verifyBlock
          const verifyTitle = gateBlocked ? verifyBlock! : !l.is_verified && noCostItem ? 'Choose a cost item first (or LAIN_LAIN)' : l.is_verified ? `${autoVerified ? 'Auto-verified by the system' : `Verified${l.verified_by ? ` by ${l.verified_by}` : ''}`} — click to undo` : 'Mark this line as verified'
          const mainDiff = main ? diffOf(l, main) : null
          if (variant === 'summary') {
            // Tampilan RINGKAS = gaya "Cost validation" (Tahap 3b, revisi 2026-10-28; Actual & Expected ditukar 2026-10-30): Validation | Actual | Expected (history) | Difference | Status | Action.
            // Rincian MAIN REFERENCE (pembanding utama, View history, +n more reference, remark) ada di panel yang dibuka segitiga di kiri baris. Logika & aksi SAMA dgn Detailed.
            const cv = classifyCostLine(l)
            const edge = noCostItem ? 'border-l-[#A8231A]' : l.is_verified ? 'border-l-[#17663D]' : (l.compare_check || cv.status === 'difference') ? 'border-l-[#E0A526]' : 'border-l-transparent'
            const expected = l.compare_ref_amount ?? null
            const diff = expected === null ? null : Number(l.amount || 0) - Number(expected)
            const expanded = openRows.has(l.id) || editingRemark
            const colLabel = 'text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] @min-[870px]:hidden'
            const ck = costKey(cv.status, cv.dir)
            const chip = CV_CHIP[ck]
            return (
              <div key={l.id} data-line-id={l.id} data-summary-row data-cv-status={cv.status}
                className={`rounded-xl border border-[#EADFD6] border-l-4 ${edge} bg-white shadow-[0_1px_2px_rgba(59,27,61,0.04)] ${rowBusy ? 'opacity-60' : ''}`}>
                <div className={`grid ${SUM_GRID} gap-x-2 @min-[1200px]:gap-x-4 gap-y-2.5 items-center px-3 py-3`}>
                  {/* Validation: segitiga + no + deskripsi + jenis biaya */}
                  <div className="col-span-3 @min-[640px]:col-span-4 @min-[870px]:col-span-1 min-w-0 flex items-start gap-2">
                    <button type="button" onClick={() => setOpenRows(p => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })}
                      aria-expanded={expanded} aria-label={expanded ? 'Hide main reference' : 'Show main reference'} title={expanded ? 'Hide main reference' : 'Show main reference'} data-toggle-reference
                      className={`shrink-0 mt-px w-6 h-6 inline-flex items-center justify-center rounded-md text-[12px] leading-none transition-colors ${expanded ? 'bg-[#EFE2EC] text-[#6B3470]' : 'text-[#8A7A8B] hover:bg-[#F5EDF3] hover:text-[#6B3470]'}`}>{expanded ? '▼' : '▶'}</button>
                    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#3B1B3D] text-[10.5px] font-bold text-white tabular-nums">{l.line_no}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 text-[12.5px] font-semibold text-[#3B1B3D] leading-snug line-clamp-2 [overflow-wrap:anywhere]" title={l.description_raw}>{l.description_raw}</div>
                        {(l.remark || l.checker_remark) && <MessageSquare size={12} className="mt-0.5 shrink-0 text-[#B7791F]" aria-label="Has a remark" />}
                        {checkerMode && <button type="button" data-action="edit-line" disabled={rowBusy} onClick={() => setEditFor(l)} title="Edit line text or amount" aria-label="Edit line"
                          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#E4D3E2] bg-[#F5EDF3] text-[#6B3470] hover:bg-[#EFE2EC] disabled:opacity-40"><Pencil size={10} /></button>}
                        {!l.is_verified && reasons.get(l.id) && <VerifyReasonIcon reason={reasons.get(l.id)!} />}
                      </div>
                      {orig && (
                        <div className="mt-0.5 text-[11px] text-[#8A7A8B] [overflow-wrap:anywhere]" data-line-original title="The version the maker submitted">
                          Original: {orig.description != null && <i>{orig.description}</i>}{orig.description != null && orig.amount != null ? ' · ' : ''}{orig.amount != null && <span className="tabular-nums">{fmtRupiah(orig.amount)}</span>}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {isSplitPart && <Chip tone="plum" title="This line was created by splitting another line">Split</Chip>}
                        {noCostItem && <Chip tone="red" title="Choose a cost item (or LAIN_LAIN) before verifying and submitting">Not mapped</Chip>}
                        {(editable || checkerMode) ? (
                          <div className="w-full min-w-[170px] max-w-[340px]"><CostAgentCostItemPicker items={items} value={l.cost_item_id ?? null} disabled={rowBusy}
                            onChange={id => (checkerMode ? (id !== null ? run(l.id, () => costAgentCheckerSetCostItem(l.id, id, true, actor)) : undefined) : run(l.id, () => verify(l, { costItemId: id, learnAlias: id !== null })))} /></div>
                        ) : !noCostItem && <Chip tone="plum" title={l.cost_item_code ? `${l.cost_item_code} — ${l.cost_item_name}` : undefined}>{l.cost_item_name || l.cost_item_code}</Chip>}
                        {editable && newItem && addItemControl(l)}
                        {/* SQL 108: "Incl. VAT" = nominal sudah termasuk PPN (PPN/PPh dihitung server). Yang boleh mengubah: tombol; lainnya hanya lencana. */}
                        {l.amount_includes_vat === true && (canEditEvidence
                          ? <button type="button" data-action="line-vat" disabled={rowBusy} onClick={() => setVatFor(l)} title="The amount includes VAT — click to change"><Chip tone="blue">Incl. VAT</Chip></button>
                          : <Chip tone="blue" title="The amount includes VAT">Incl. VAT</Chip>)}
                        {canEditEvidence && l.amount_includes_vat !== true && Number(l.ppn_rate ?? 0) > 0 && (
                          <button type="button" className={LINK} data-action="line-vat" disabled={rowBusy} onClick={() => setVatFor(l)} title="Tell the system whether this amount already includes VAT">{l.amount_includes_vat === false ? 'VAT: excluded' : 'Incl. VAT?'}</button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actual / Expected / Difference (satu baris, tidak membungkus; Actual di depan sejak 2026-10-30, permintaan user) */}
                  <div className="min-w-0 @min-[870px]:text-center"><div className={colLabel}>Actual</div>
                    <div className="text-[13px] font-extrabold tabular-nums text-[#3B1B3D] whitespace-nowrap" data-invoice-amount>{fmtRupiah(l.amount)}</div></div>
                  <div className="min-w-0 @min-[870px]:text-center"><div className={colLabel}>Expected (history)</div>
                    <div className="text-[12.5px] tabular-nums text-[#6E5E70] whitespace-nowrap">{expected === null ? '—' : fmtRupiah(expected)}</div></div>
                  <div className="min-w-0 @min-[870px]:text-center"><div className={colLabel}>Difference</div>
                    <div className={`text-[12.5px] font-semibold tabular-nums whitespace-nowrap ${diff ? (diff > 0 ? 'text-[#A8231A]' : 'text-[#17663D]') : 'text-[#6E5E70]'}`}>
                      {diff === null ? '—' : diff === 0 ? 'Rp 0' : `${diff > 0 ? '+' : '−'}${fmtRupiah(Math.abs(diff))}`}</div></div>

                  {/* Status */}
                  <div className="col-span-3 @min-[640px]:col-span-1 min-w-0 flex items-center gap-1.5 flex-wrap @min-[870px]:justify-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${chip}`} data-compare-pill={cv.status}>{CV_LABEL[ck]}</span>
                    {cv.reason && <span className="text-[11px] text-[#6E5E70]">{cv.reason}</span>}
                    {l.compare_check && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#FFF1D6] text-[#7A4F00]" title="Differs from the alternative reference by more than 5%" data-compare-check><AlertTriangle size={10} /> Check</span>}
                  </div>

                  {/* Action */}
                  <div className="col-span-3 @min-[640px]:col-span-4 @min-[870px]:col-span-1 flex flex-row flex-nowrap items-center gap-1.5 justify-start @min-[640px]:justify-end @min-[870px]:justify-center" data-line-actions>
                    {editable ? (
                      <>
                        <button type="button" data-verify-line disabled={rowBusy || (!l.is_verified && noCostItem) || gateBlocked}
                          title={autoVerified ? 'Verified automatically: same as history — click to undo' : verifyTitle}
                          onClick={() => run(l.id, () => verify(l, { isVerified: !l.is_verified, learnAlias: !l.is_verified && !!l.cost_item_id }))}
                          className={`inline-flex items-center justify-center gap-1.5 h-8 w-[128px] px-3 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${l.is_verified ? 'bg-[#17663D] text-white shadow-sm hover:bg-[#12522F]' : 'border border-[#9FD3B4] bg-[#EAF6EF] text-[#17663D] hover:bg-[#DDF0E5]'}`}>
                          {l.is_verified ? <CheckCircle2 size={14} /> : <Check size={14} />} {l.is_verified ? 'Verified' : 'Verify'}{autoVerified && <span data-auto-verified className="ml-0.5 px-1.5 rounded bg-white/20 text-[9.5px] font-bold uppercase tracking-wide">Auto</span>}
                        </button>
                      </>
                    ) : checkerMode ? (
                      // sql/101: checker memvalidasi PER BARIS. "Validate" -> "Validated" (hijau, klik lagi membatalkan). Aturan (wajib/tidak, SoD) diputuskan server; pesan error tampil apa adanya.
                      <button type="button" data-validate-line disabled={rowBusy || (!l.is_validated && noCostItem)}
                        title={l.is_validated ? `Validated${l.validated_by ? ` by ${l.validated_by}` : ''} — click to undo` : noCostItem ? 'Choose a cost item first' : 'Mark this line as validated'}
                        onClick={() => run(l.id, () => costAgentCheckerValidateLine(l.id, !l.is_validated, actor))}
                        className={`inline-flex items-center justify-center gap-1.5 h-8 w-[128px] px-3 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${l.is_validated ? 'bg-[#17663D] text-white shadow-sm hover:bg-[#12522F]' : 'border border-[#9FD3B4] bg-[#EAF6EF] text-[#17663D] hover:bg-[#DDF0E5]'}`}>
                        {l.is_validated ? <CheckCircle2 size={14} /> : <Check size={14} />} {l.is_validated ? 'Validated' : 'Validate'}
                      </button>
                    ) : (
                      <Chip tone={l.is_verified ? 'green' : 'grey'} className="h-8" title={l.verified_by ? `By ${l.verified_by}` : undefined}>
                        {l.is_verified ? <><Check size={10} /> {autoVerified ? 'Auto-verified' : 'Verified by maker'}</> : 'Not verified'}
                      </Chip>
                    )}
                    {(editable || checkerMode) && (
                      <button type="button" data-action="remark" onClick={() => { setRemarkOpen(p => new Set(p).add(l.id)); setOpenRows(p => new Set(p).add(l.id)) }} title={remarkBase || 'Add a remark'} aria-label={remarkBase ? 'Edit remark' : 'Add remark'}
                        className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-xl border transition-colors ${editingRemark || remarkBase ? 'border-[#C9A9C4] bg-[#F5EDF3] text-[#6B3470]' : 'border-[#E4D3E2] bg-white text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4]'}`}>
                        <MessageSquare size={13} />
                      </button>
                    )}
                    {canSplit && (
                      <button type="button" data-action="split" disabled={rowBusy} onClick={() => setSplitFor(l)} title="Split this line into several lines (the total does not change)"
                        className="inline-flex items-center justify-center gap-1 h-8 min-w-8 px-2 @min-[1200px]:px-2.5 shrink-0 rounded-xl border border-[#E4D3E2] bg-white text-[12px] font-bold text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4] disabled:opacity-50" aria-label="Split line"><Scissors size={13} /><span className="hidden @min-[1200px]:inline">Split</span></button>
                    )}
                    {checkerMode && (
                      <button type="button" data-action="line-tax" disabled={rowBusy} onClick={() => setTaxFor(l)} title="Change PPN / PPh of this line"
                        className="inline-flex items-center justify-center gap-1 h-8 min-w-8 px-2 @min-[1200px]:px-2.5 shrink-0 rounded-xl border border-[#E4D3E2] bg-white text-[12px] font-bold text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4] disabled:opacity-50" aria-label="Change tax"><Percent size={13} /><span className="hidden @min-[1200px]:inline">Tax</span></button>
                    )}
                  </div>
                </div>

                {/* Rincian MAIN REFERENCE (dibuka segitiga) */}
                {expanded && (
                  <div className="border-t border-[#F3EEEA] bg-[#FBF7F4] px-4 py-3 rounded-b-xl" data-reference-panel>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">Main reference</div>
                    {!main ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[12px] text-[#8A7A8B]">Nothing to compare</span>
                        <button type="button" className={LINK} onClick={() => setBrowseFor(l)} data-action="browse-history"><History size={11} /> Browse history</button>
                      </div>
                    ) : (
                      <div data-comparator="main" className="max-w-3xl">
                        <RefWhere h={main} strong />
                        <div className="text-[11px] text-[#8A7A8B]">{fmtDate(main.service_date)}{main.invoice_no ? ` · ${main.invoice_no}` : ''} · <b className="tabular-nums text-[#3B1B3D]">{fmtRupiah(main.amount)}</b></div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <button type="button" className={LINK} onClick={() => setBrowseFor(l)} data-action="browse-history"><History size={11} /> View history</button>
                          {others.length > 0 && <button type="button" className={LINK} onClick={() => toggleMore(l.id)}>{othersOpen ? 'Hide other reference' : `+${others.length} more reference${others.length > 1 ? 's' : ''}`}</button>}
                          {editable && l.ref_history_id != null && <button type="button" className={`${LINK} !text-[#6E5E70]`} disabled={rowBusy} onClick={() => run(l.id, () => costAgentSetLineReference(l.id, null, actor))} title="Reset comparison — go back to the automatically chosen history"><RotateCcw size={11} /> Reset to automatic</button>}
                        </div>
                        {(othersOpen || l.compare_check) && others.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-[#EADFD6] pt-2">
                            {others.map(o => (
                              <React.Fragment key={`${o.pick}-${o.history_id}`}><OtherReference line={l} h={o} currency={currency}
                                onUse={o.pick === 'alternative' && editable ? () => run(l.id, () => costAgentSetLineReference(l.id, o.history_id, actor)) : undefined} useDisabled={busy !== null} /></React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {editingRemark ? (
                      <div className="mt-2.5" data-line-remark>
                        <textarea className={`${SA_INPUT} !h-auto min-h-7 py-1 text-[12px] leading-snug resize-y`} rows={remarkRows} value={remarkVal} disabled={rowBusy} placeholder="Remark — saved when you leave the box" aria-label="Remark" autoFocus
                          onChange={e => setRemarks(p => ({ ...p, [l.id]: e.target.value }))}
                          onBlur={() => {
                            const v = remarkVal.trim()
                            setRemarkOpen(p => { const n = new Set(p); n.delete(l.id); return n })
                            if (v !== remarkBase) run(l.id, () => (checkerMode ? costAgentCheckerSetLineRemark(l.id, v, actor) : verify(l, { remark: v })))
                          }} />
                      </div>
                    ) : null}
                    {/* Remark maker (selalu terbaca) dan remark checker (hanya view 'full'; approver tidak menerimanya). Saat checker mengetik remark-nya, remark maker tetap tampil. */}
                    {l.remark && !(editingRemark && !checkerMode) && (
                      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[#FFF8E6] border border-[#F2D58A] px-2 py-1 text-[11.5px] text-[#7A4F00] [overflow-wrap:anywhere] whitespace-pre-wrap" data-line-remark>
                        <MessageSquare size={12} className="mt-0.5 shrink-0 text-[#B7791F]" /><span className="min-w-0">{l.checker_remark || checkerMode ? <b>Maker: </b> : null}{l.remark}</span>
                      </div>
                    )}
                    {l.checker_remark && !(editingRemark && checkerMode) && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#EEF1FA] border border-[#C9D3F0] px-2 py-1 text-[11.5px] text-[#2F4FA8] [overflow-wrap:anywhere] whitespace-pre-wrap" data-checker-remark>
                        <MessageSquare size={12} className="mt-0.5 shrink-0" /><span className="min-w-0"><b>Checker: </b>{l.checker_remark}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={l.id} data-line-id={l.id}
              className={`grid grid-cols-[28px_minmax(0,1fr)_112px] @min-[640px]:grid-cols-[28px_minmax(0,0.9fr)_296px_minmax(0,1fr)_128px] @min-[1200px]:grid-cols-[28px_minmax(0,1fr)_320px_minmax(0,1.2fr)_132px] rounded-xl border border-[#EADFD6] border-l-4 shadow-[0_1px_2px_rgba(59,27,61,0.04)] transition-colors ${l.is_verified ? 'bg-[#F8FCFA] border-l-[#17663D]' : noCostItem ? 'bg-white border-l-[#E0A526] hover:bg-[#FFFEFB]' : 'bg-white border-l-[#D9CFD6] hover:bg-[#FDFBFA]'} ${rowBusy ? 'opacity-60' : ''}`}>
              {/* # */}
              <div className="px-2 py-3 [grid-column:1] [grid-row:1/span_3] @min-[640px]:[grid-row:1]">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#3B1B3D] text-[11px] font-bold text-white tabular-nums">{l.line_no}</span>
              </div>

              {/* Invoice line */}
              <div className="min-w-0 px-3 pt-3 pb-2 @min-[640px]:pb-3 @min-[640px]:self-center [grid-column:2] [grid-row:1]" data-line-left>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 text-[13px] font-bold text-[#3B1B3D] leading-snug [overflow-wrap:anywhere]">{l.description_raw}</div>
                  {checkerMode && (
                    <button type="button" data-action="edit-line" disabled={rowBusy} onClick={() => setEditFor(l)} title="Edit line text, qty, price or amount"
                      className="shrink-0 -mt-0.5 inline-flex items-center gap-1 h-6 px-2 rounded-full border border-[#E4D3E2] bg-[#F5EDF3] text-[11px] font-semibold text-[#6B3470] hover:bg-[#EFE2EC] hover:border-[#C9A9C4] transition-colors disabled:opacity-40">
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                </div>
                <div className="mt-1.5 max-w-[260px]">
                  {editable || checkerMode ? (
                    <CostAgentCostItemPicker items={items} value={l.cost_item_id ?? null} disabled={rowBusy}
                      onChange={id => (checkerMode ? (id !== null ? run(l.id, () => costAgentCheckerSetCostItem(l.id, id, true, actor)) : undefined) : run(l.id, () => verify(l, { costItemId: id, learnAlias: id !== null })))} />
                  ) : (
                    <span className="text-[12px] text-[#3B1B3D] truncate block">{l.cost_item_code ? `${l.cost_item_code} — ${l.cost_item_name}` : '—'}</span>
                  )}
                </div>
                {editable && newItem && (
                  <div className="mt-1.5">{addItemControl(l)}</div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
                  {noCostItem && <Chip tone="amber" title="Choose a cost item (or LAIN_LAIN) before verifying and submitting"><AlertTriangle size={10} /> Not in master record</Chip>}
                  {l.cost_item_id && l.match_method && MATCH_METHOD_LABEL[l.match_method] && (
                    <span className="text-[10.5px] text-[#8A7A8B]" title={`Matched by: ${MATCH_METHOD_LABEL[l.match_method]}`} data-match-method={l.match_method}>{MATCH_METHOD_LABEL[l.match_method]}</span>
                  )}
                  {(l.qty != null || l.unit_price != null) && <span className="text-[10.5px] text-[#8A7A8B] tabular-nums whitespace-nowrap">{fmtNumber(l.qty, 3)}{l.unit ? ` ${l.unit}` : ''} × {fmtNumber(l.unit_price)}</span>}
                </div>
              </div>

              {/* Invoice vs history -- SATU kolom: Invoice | pill % | History */}
              <div className="[grid-column:2] [grid-row:2] px-3 pb-2 @min-[640px]:[grid-column:3] @min-[640px]:[grid-row:1] @min-[640px]:py-3 @min-[640px]:flex @min-[640px]:items-center @min-[640px]:border-l @min-[640px]:border-[#EFE6E0] @container" data-line-amounts>
                {/* sel = container sendiri: lebar sel >= 270px -> Invoice | pill | History SEJAJAR; lebih sempit -> pill turun di bawah, tengah.
                    Pill 3 digit (>= 100%, mis. "↑ 360,6%") lebih lebar -> varian KOMPAK (font/jarak/pill lebih kecil) supaya tetap sejajar tanpa
                    saling menimpa (2026-10-22, permintaan user: tetap sejajar). */}
                {(() => {
                  const wide = Math.abs(mainDiff?.pct ?? 0) >= 100
                  return (
                    <div className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @min-[270px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] ${wide ? 'gap-x-1' : 'gap-x-2'} gap-y-1 items-start`}>
                      <div className="min-w-0 [grid-column:1] [grid-row:1]" data-invoice-amount>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">Invoice</div>
                        <div className={`${wide ? 'text-[13px]' : 'text-[14.5px]'} font-extrabold text-[#3B1B3D] tabular-nums whitespace-nowrap`}>{fmtMoney(l.amount, currency)}</div>
                      </div>
                      <div className={`[grid-column:1/span_2] [grid-row:2] flex justify-center @min-[270px]:[grid-column:2] @min-[270px]:[grid-row:1] @min-[270px]:pt-3.5 ${wide ? '[&_[data-diff-pill]]:px-1.5 [&_[data-diff-pill]]:gap-0.5 [&_[data-diff-pill]]:text-[10.5px]' : ''}`}><DiffPill line={l} pct={mainDiff?.pct ?? null} /></div>
                      <div className="min-w-0 text-right [grid-column:2] [grid-row:1] @min-[270px]:[grid-column:3]" data-history-amount>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B]">History</div>
                        <div className={`${wide ? 'text-[12.5px]' : 'text-[13.5px]'} text-[#6E5E70] tabular-nums whitespace-nowrap`}>{main ? fmtMoney(main.amount, currency) : '—'}</div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Main reference -- kolom sendiri (juga saat PDF tampil) */}
              <div className="[grid-column:2] [grid-row:3] min-w-0 px-3 pb-3 @min-[640px]:[grid-column:4] @min-[640px]:[grid-row:1] @min-[640px]:pt-3 @min-[640px]:flex @min-[640px]:flex-col @min-[640px]:justify-center @min-[640px]:border-l @min-[640px]:border-[#EFE6E0]" data-line-right>
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8A7A8B] mb-0.5 @min-[640px]:hidden">Main reference</div>
                {!main ? (
                  <div className="text-[12px] text-[#6E5E70]">{newItem ? 'Not in cost master yet — nothing to compare' : 'No history yet for this cost item'}</div>
                ) : (
                  <div data-comparator="main" data-history-pick={main.pick || undefined} className="rounded-lg bg-[#FBF7F4] border border-[#F0E8E2] px-2.5 py-1.5">
                    {/* nama baris history + badge line_match di popover ⓘ; yang tampil "sumber · vessel · port" tebal. */}
                    <RefWhere h={main} strong />
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <button type="button" className={LINK} onClick={() => setBrowseFor(l)} data-action="browse-history"><History size={11} /> View history</button>
                      {others.length > 0 && !showAllCompares && !l.compare_check && (
                        <button type="button" className={LINK} onClick={() => toggleMore(l.id)}>{othersOpen ? 'Hide other reference' : `+${others.length} more reference${others.length > 1 ? 's' : ''}`}</button>
                      )}
                      {editable && l.ref_history_id != null && (
                        <button type="button" className={`${LINK} !text-[#6E5E70]`} disabled={rowBusy} onClick={() => run(l.id, () => costAgentSetLineReference(l.id, null, actor))}
                          title="Reset comparison — go back to the automatically chosen history" data-action="reset-ref"><RotateCcw size={11} /> Reset to automatic</button>
                      )}
                      {l.compare_check && (
                        <Chip tone="amber" title={`Main reference: ${fmtMoney(l.compare_ref_amount, currency)} · Same-line alternative: ${fmtMoney(l.compare_alt_amount, currency)}`}>
                          <AlertTriangle size={10} /> Check reference
                        </Chip>
                      )}
                    </div>
                    {othersOpen && others.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-1.5 border-t border-dashed border-[#EADFD6] pt-1.5">
                        {others.map(o => (
                          <React.Fragment key={`${o.pick}-${o.history_id}`}><OtherReference line={l} h={o} currency={currency}
                            onUse={o.pick === 'alternative' && editable ? () => run(l.id, () => costAgentSetLineReference(l.id, o.history_id, actor)) : undefined}
                            useDisabled={busy !== null} /></React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Remark (2026-10-16, permintaan user): di kolom Main reference, SETELAH link & pembanding lain -> ikut turun saat
                    "+n more reference" dibuka. Edit = textarea di posisi yang sama (simpan saat blur). */}
                {editingRemark ? (
                  <div className="mt-2" data-line-remark>
                    <textarea className={`${SA_INPUT} !h-auto min-h-7 py-1 text-[12px] leading-snug resize-y`} rows={remarkRows} value={remarkVal} disabled={rowBusy} placeholder="Remark — saved when you leave the box"
                      aria-label="Remark" autoFocus
                      onChange={e => setRemarks(p => ({ ...p, [l.id]: e.target.value }))}
                      onBlur={() => {
                        const v = remarkVal.trim()
                        setRemarkOpen(p => { const n = new Set(p); n.delete(l.id); return n })
                        // Dikosongkan = kirim '' (RPC verify_line: remark = coalesce(p_remark, remark) -> null TIDAK mengubah, '' mengosongkan).
                        if (v !== (l.remark || '')) run(l.id, () => verify(l, { remark: v }))
                      }} />
                  </div>
                ) : l.remark ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#FFF8E6] border border-[#F2D58A] px-2 py-1 text-[11.5px] text-[#7A4F00] [overflow-wrap:anywhere] whitespace-pre-wrap" data-line-remark>
                    <MessageSquare size={12} className="mt-0.5 shrink-0 text-[#B7791F]" /><span className="min-w-0">{l.remark}</span>
                  </div>
                ) : null}
              </div>

              {/* Action: Verify + Remark */}
              <div className="[grid-column:3] [grid-row:1/span_3] px-2 py-3 flex flex-col items-stretch gap-1.5 @min-[640px]:justify-center @min-[640px]:[grid-column:5] @min-[640px]:[grid-row:1] @min-[640px]:px-3 @min-[640px]:border-l @min-[640px]:border-[#EFE6E0]" data-line-actions>
                {autoVerified && <span className="self-center" data-auto-verified><Chip tone="blue" title="Auto-verified: documents complete and amount not above history">Auto</Chip></span>}
                {editable ? (
                  <button type="button" data-verify-line disabled={rowBusy || (!l.is_verified && noCostItem) || gateBlocked} title={verifyTitle}
                    onClick={() => run(l.id, () => verify(l, { isVerified: !l.is_verified, learnAlias: !l.is_verified && !!l.cost_item_id }))}
                    className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${l.is_verified ? 'bg-[#17663D] text-white shadow-sm hover:bg-[#12522F]' : 'border border-[#9FD3B4] bg-[#EAF6EF] text-[#17663D] hover:bg-[#DDF0E5]'}`}>
                    {l.is_verified ? <CheckCircle2 size={14} /> : <Check size={14} />} {l.is_verified ? 'Verified' : 'Verify'}
                  </button>
                ) : (
                  <Chip tone={l.is_verified ? 'green' : 'grey'} className="justify-center h-8" title={l.verified_by ? `By ${l.verified_by}` : undefined}>{l.is_verified ? <><Check size={10} /> Verified</> : 'Not verified'}</Chip>
                )}
                {editable && (
                  <button type="button" data-action="remark" onClick={() => setRemarkOpen(p => new Set(p).add(l.id))} title={l.remark || 'Add a remark'}
                    className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-xl border text-[12px] font-bold whitespace-nowrap transition-colors ${editingRemark || l.remark ? 'border-[#C9A9C4] bg-[#F5EDF3] text-[#6B3470]' : 'border-[#E4D3E2] bg-white text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4]'}`}>
                    <MessageSquare size={13} /> {l.remark ? 'Edit remark' : 'Remark'}
                  </button>
                )}
                {canSplit && (
                  <button type="button" data-action="split" disabled={rowBusy} onClick={() => setSplitFor(l)} title="Split this line into several lines (the total does not change)"
                    className="inline-flex items-center justify-center gap-1.5 h-8 rounded-xl border border-[#E4D3E2] bg-white text-[12px] font-bold whitespace-nowrap text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4] disabled:opacity-50">
                    <Scissors size={13} /> Split
                  </button>
                )}
                {checkerMode && (
                  <button type="button" data-action="line-tax" disabled={rowBusy} onClick={() => setTaxFor(l)} title="Change PPN / PPh of this line"
                    className="inline-flex items-center justify-center gap-1.5 h-8 rounded-xl border border-[#E4D3E2] bg-white text-[12px] font-bold whitespace-nowrap text-[#6E5E70] hover:bg-[#F5EDF3] hover:text-[#6B3470] hover:border-[#C9A9C4] disabled:opacity-50">
                    <Percent size={13} /> Tax
                  </button>
                )}
              </div>

            </div>
          )
        })}
        </div>
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
      {splitFor && <SplitLineDialog line={lines.find(x => x.id === splitFor.id) || splitFor} costItems={items} currency={currency} actor={actor} mode={checkerMode ? 'checker' : 'maker'} onClose={() => setSplitFor(null)}
        onSaved={async () => { setSplitFor(null); await run('all', async () => {}); onToast?.(checkerMode ? 'Line split.' : 'Line split — please verify the new lines') }} />}
      {vatFor && <LineVatDialog line={lines.find(x => x.id === vatFor.id) || vatFor} onClose={() => setVatFor(null)}
        onSaved={async () => { setVatFor(null); await run('all', async () => {}); onToast?.('VAT setting saved.') }} />}
      {taxFor && <LineTaxDialog line={lines.find(x => x.id === taxFor.id) || taxFor} onClose={() => setTaxFor(null)}
        onSaved={async () => { setTaxFor(null); await run('all', async () => {}); onToast?.('Line tax saved.') }} />}
      {editFor && <EditLineModal line={lines.find(x => x.id === editFor.id) || editFor} currency={currency} actor={actor} checker={!!checkerMode} onClose={() => setEditFor(null)} onSaved={async changed => {
        const l = editFor
        setEditFor(null)
        if (!changed) { onToast?.('No changes to save.', 'warn'); return }
        await run(l.id, async () => {})
        onToast?.(checkerMode ? 'Line updated — validate it again' : 'Line updated — please verify again')
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

// 2026-10-16 v6 (permintaan user): kolom Compare = NOMINAL HISTORY DI KIRI (blok 112px, langsung bersanding dgn nominal invoice di
// ujung kanan kolom Invoice line) + selisih Rp di bawahnya; di kanannya: [flag / 2nd ref / Alternative] [line_match] nama baris cost
// history, lalu baris kecil sumber · vessel · port + ⓘ (tgl, DWT, vendor, invoice no, voyage, invoice title tetap di popover).
const sourceLabel = (h: CostAgentLineHistory) => matchLevelLabel(h.match_level, { dwt_diff: h.dwt_diff, distance_km: h.distance_km })
const diffCls = (diff: number) => diff === 0 ? 'text-[#8A7A8B]' : diff > 0 ? 'text-[#A8231A]' : 'text-[#17663D]'
const pct1 = (v: number) => `${Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// Pill selisih (kolom tengah antara Invoice & History): naik merah ▲ x,x% / turun biru ▼ / sesuai hijau / item baru & tanpa history.
function DiffPill({ line, pct }: { line: CostAgentInvoiceLine; pct: number | null }) {
  const p = line.compare_diff_pct ?? pct
  const f = line.compare_flag
  const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap tabular-nums'
  if (f === 'naik') return <span className={`${base} bg-[#FDE7E4] text-[#A8231A]`} data-diff-pill title="Higher than history"><ArrowUp size={11} />{p != null ? pct1(p) : 'Higher'}</span>
  if (f === 'turun') return <span className={`${base} bg-[#E6ECFA] text-[#2F4FA8]`} data-diff-pill title="Lower than history"><ArrowDown size={11} />{p != null ? pct1(p) : 'Lower'}</span>
  if (f === 'sesuai') return <span className={`${base} bg-[#E3F4EA] text-[#17663D]`} data-diff-pill title="In line with history"><Equal size={11} />{p != null ? pct1(p) : 'In line'}</span>
  if (f === 'item_baru') return <span className={`${base} bg-[#FFF1D6] text-[#7A4F00]`} data-diff-pill>New item</span>
  if (f === 'tanpa_history') return <span className={`${base} bg-[#F1ECEF] text-[#6E5E70]`} data-diff-pill>No history</span>
  return <span className={`${base} bg-[#F1ECEF] text-[#8A7A8B]`} data-diff-pill>—</span>
}

// Baris kecil: sumber · vessel · port ⓘ (port lengkap & tgl/DWT/vendor/invoice di popover).
function RefWhere({ h, strong }: { h: CostAgentLineHistory; strong?: boolean }) {
  const manual = h.pick === 'manual' || h.match_level === 'manual'
  const where = [h.vessel_name, h.port_code].filter(Boolean).join(' · ')
  return (
    <div className={`min-w-0 leading-snug [overflow-wrap:anywhere] ${strong ? 'text-[12px] font-bold text-[#3B1B3D]' : 'mt-0.5 text-[11px] text-[#8A7A8B]'}`}>
      <span title={`${manual ? 'Chosen by user' : sourceLabel(h)}${where ? ` · ${where}` : ''}${h.port_name ? ` (${h.port_name})` : ''}`}>
        {/* sql/061: primary tetap dikirim walau ada pembanding manual -> label pilihan user hanya utk manual. */}
        {manual ? <span className="font-semibold text-[#6B3470]">Chosen by user</span> : sourceLabel(h)}
        {where && <> · {where}</>}
      </span>{' '}
      <span className="inline-block align-middle"><HistoryInfo h={h} /></span>
    </div>
  )
}

// Pembanding lain (next / alternative), ringkas: [2nd ref / Alternative] Rp X (this line ±x%) nama baris / sumber · vessel · port ⓘ.
function OtherReference({ line, h, currency, onUse, useDisabled }: {
  line: CostAgentInvoiceLine; h: CostAgentLineHistory; currency: string; onUse?: () => void; useDisabled?: boolean
}) {
  const { diff, pct } = diffOf(line, h)
  const alt = h.pick === 'alternative'
  return (
    <div className={`pl-2 border-l-2 ${alt ? 'border-dashed border-[#B9A6DC]' : 'border-[#EADFD6]'} text-[11px] leading-snug min-w-0`} data-comparator="second" data-history-pick={h.pick || undefined}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        {alt ? <span className="shrink-0 px-1.5 py-px rounded bg-[#ECE6F7] text-[#5B2E8C] text-[10px] font-bold" title="Same service found elsewhere. The flag is still based on the main reference — check which one fits.">Alternative · same line</span>
          : <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.04em] text-[#8A7A8B]">2nd ref</span>}
        <b className="shrink-0 tabular-nums text-[#3B1B3D] whitespace-nowrap">{fmtMoney(h.amount, currency)}</b>
        {pct !== null && diff !== 0 && <span className={`shrink-0 tabular-nums whitespace-nowrap ${diffCls(diff)}`}>(this line {diff > 0 ? '▲' : '▼'} {pct1(pct)})</span>}
        <span className="min-w-[120px] flex-1 text-[#3B1B3D] uppercase truncate" title={h.description_raw || undefined}>{h.description_raw || '—'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 min-w-0">
        <div className="flex-1 min-w-[150px]"><RefWhere h={h} /></div>
        {onUse && (
          <button type="button" disabled={useDisabled} onClick={onUse} className="shrink-0 inline-flex items-center gap-0.5 font-semibold text-[#5B2E8C] hover:underline disabled:opacity-50 whitespace-nowrap"
            title="Use this same-line history as the comparison for this invoice line">
            <Pin size={11} /> Use as comparison
          </button>
        )}
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
    ['History line', h.description_raw || '—'],
    ['Line match', h.line_match === 'same_line' ? 'Same line' : h.line_match === 'similar' ? 'Similar line' : h.line_match === 'different_line' ? 'Different line — check manually' : '—'],
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
// sql/101: hanya CHECKER yang boleh mengedit (teks + nominal; saat nominal berubah qty / harga dikosongkan server), jadi bentuk checker menyembunyikan Qty / Unit price.
function EditLineModal({ line, currency, actor, checker = false, onClose, onSaved }: {
  line: CostAgentInvoiceLine; currency: string; actor: string | null; checker?: boolean; onClose: () => void; onSaved: (changed: boolean) => void
}) {
  const [desc, setDesc] = useState(line.description_raw || '')
  const [qty, setQty] = useState(numStr(line.qty))
  const [price, setPrice] = useState(numStr(line.unit_price))
  const [amount, setAmount] = useState(numStr(line.amount))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recalc = (q: string, p: string) => {
    const qn = parseAmountInput(q), pn = parseAmountInput(p)
    // Rupiah bulat (sql/071): sen dibuang (dipotong, bukan dibulatkan) -- sama perilaku database.
    if (qn !== null && pn !== null) setAmount(String(Math.trunc(qn * pn)))
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
      subtitle={checker ? 'After saving, the line is no longer validated. The invoice total must match the submitted total again before it can be validated.' : 'After saving, the line must be verified again; the cost item may be re-detected from the new text.'}
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
        <div className={checker ? 'hidden' : ''}>
          <FieldLabel>Qty</FieldLabel>
          <input className={SA_INPUT} inputMode="decimal" value={qty} placeholder="optional" onChange={e => { setQty(e.target.value); recalc(e.target.value, price) }} />
        </div>
        <div className={checker ? 'hidden' : ''}>
          <FieldLabel>Unit price</FieldLabel>
          <input className={SA_INPUT} inputMode="decimal" value={price} placeholder="optional" onChange={e => { setPrice(e.target.value); recalc(qty, e.target.value) }} />
        </div>
        <div className="col-span-2">
          <FieldLabel required hint="auto = qty × unit price when both are filled">Amount</FieldLabel>
          {/* Rupiah bulat tanpa desimal: step 1, bagian sen dibuang saat mengetik; nilai dikirim apa adanya, database yang memotong. */}
          <input className={SA_INPUT} type="number" step={1} inputMode="numeric" value={amount} data-amount-input
            onChange={e => setAmount(e.target.value.includes('.') || e.target.value.includes(',') ? e.target.value.split(/[.,]/)[0] : e.target.value)} />
          <p className="mt-1 text-[11px] text-[#6E5E70] tabular-nums">{amountN !== null ? fmtMoney(amountN) : amount.trim() ? 'Not a valid number' : '—'}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-2 text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]" data-original>
          Original: <i>{checker ? line.maker_description ?? line.description_raw : line.description_raw}</i> · {(checker ? line.maker_qty ?? line.qty : line.qty) != null || (checker ? line.maker_unit_price ?? line.unit_price : line.unit_price) != null ? `${fmtNumber(checker ? line.maker_qty ?? line.qty : line.qty, 3)} × ${fmtNumber(checker ? line.maker_unit_price ?? line.unit_price : line.unit_price)} · ` : ''}{fmtMoney(checker ? line.maker_amount ?? line.amount : line.amount)}
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
