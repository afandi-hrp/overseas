import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, X, Circle, ChevronDown, Search as SearchIcon, RefreshCw, CalendarDays, AlertTriangle, Save, SlidersHorizontal, RotateCcw, SquareX, UploadCloud, Pencil, GripVertical, ArrowUpDown } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Greeting from './Greeting'
import { LoadingState, LoadingSpinner } from '../components/LoadingState'
import ExportModal from '../components/ExportModal'
import CourierUploadSusulanModal from '../components/CourierUploadSusulanModal'
import { VW_TOOLBAR, VW_BODY, VW_CARD, VW_CARD_TITLE, VW_BTN_PRIMARY, VW_BTN_SECONDARY, vwPctBar, vwPctText } from '../components/validationWindowStyles'
import CourierValidationWindow, { rowValidationPct, validationDotClass, validationDotLabel, VALIDATION_TAB_LABEL, VALIDATION_TAB_ORDER, type ValidationTabKey, type WindowTabKey } from '../components/CourierValidationWindow'
import SeaAirChecklistModal from '../components/SeaAirChecklistModal'
import SeaAirValidasiModal from '../components/SeaAirValidasiModal'
import ValidasiShipmentInvoiceLengkap from '../components/ValidasiShipmentInvoiceLengkap'
import { computeLiveCostSummary } from '../utils/CostValidationHelpers'
import { relaxSeaAirDocChecks } from '../utils/SeaAirValidasiHelpers'
import { computeSeaAirCostGlobalStats } from '../utils/SeaAirCostValidasiHelpers'
import { SECTIONS, computeStatus } from '../utils/ValidasiHelper'
import { generateValues } from '../utils/ValidasiFill'
import { calculatePibStats } from '../utils/ValidasiPibHelper'
import {
  formatNoAju, computeSeaAirBalanceAsuransi, SEA_AIR_BALANCE_DEP_KEYS, SEA_AIR_AUDIT_SEARCH_COLS,
  fetchSeaAirAuditSummary, fetchSeaAirAuditLinkInfo, fetchCompanyNameMap, notifySeaAirAuditChanged, fmtRp as fmtRpSeaAir, fmtDateShort as fmtDateShortSeaAir,
  type SeaAirAuditSummary, type SeaAirAuditLinkInfo,
} from '../utils/SeaAirAuditHelpers'
import { SeaAirAuditCardList, SeaAirAuditKpiCards } from './SeaAirAuditCardList'
import SeaAirAuditDetailModal from './SeaAirAuditDetailModal'
import SeaAirAuditEditModal from './SeaAirAuditEditModal'
import { computeRecapIssues, fetchRecapSummary, isRecapLocked, notifySeaAirRecapChanged, type RecapSummary, type RecapIssue } from '../utils/SeaAirRecapHelpers'
import {
  COURIER_AUDIT_CALC_FIELDS, computeCourierAuditCalc, courierAuditCalcNum, fetchCourierAuditSummary, courierDocType, courierDocNo,
  courierTableOf, makeColOk, isCourierDraft, notifyCourierAuditChanged, type CourierAuditSummary, type CourierDocType,
} from '../utils/CourierAuditHelpers'
import { CourierAuditCardList, CourierAuditKpiCards } from './CourierAuditCardList'
import CourierAuditOverview from './CourierAuditOverview'
import CourierAuditTrail from './CourierAuditTrail'
import CourierAuditEditModal from './CourierAuditEditModal'
import { SA_BTN_OUTLINE, SA_BTN_GREEN } from './SeaAirAuditUi'
import { SeaAirRecapCardList, SeaAirRecapKpiCards, CostMixLegend } from './SeaAirRecapCardList'
import SeaAirRecapDetailModal from './SeaAirRecapDetailModal'
import SeaAirRecapEditModal from './SeaAirRecapEditModal'

// ─── Konfigurasi Tab ──────────────────────────────────────────

const MAIN_TABS = [
  { 
    id: 'courier',   
    label: '✈️ Courier', 
    subTabs: [
      { id: 'courier_audit', label: 'Audit' },
      { id: 'courier_rekapan', label: 'Recap', table: 'rekapan_courier' },
      { id: 'courier_validasi', label: 'Validation', table: 'dokumen_validasi' },
    ]
  },
  {
    id: 'sea_air',
    label: '🚢 Sea & Air',
    subTabs: [
      { id: 'sea_air_audit',   label: 'Audit',   table: 'tabel_audit_seaair' },
      { id: 'sea_air_rekapan', label: 'Recap', table: 'rekapan_seaair' },
    ]
  },
  { id: 'trail',   label: '📜 Audit Trail',     table: 'v_audit_trail', realTable: 'audit_trail' },
]

// Daftar nama tabel sumber per kategori "jenis aksi" di Audit Trail -- dipetakan ke kolom
// "tabel" pada v_audit_trail. BUNKER memakai nama tabel real modul Bunker (bunker_dokumen,
// bunker_processing_queue), pola sama dengan COURIER/SEA_AIR yang sudah ada sebelumnya.
const TRAIL_TABLES: Record<string, string[]> = {
  COURIER: ['tabel_audit_pib', 'tabel_audit_cn', 'rekapan_courier', 'tabel_checklist_validasi', 'tabel_cost_validasi'],
  SEA_AIR: ['tabel_audit_seaair', 'rekapan_seaair', 'dokumen_validasi_matriks_seaair', 'cost_validasi_seaair'],
  BUNKER: ['bunker_dokumen'],
  // Audit AP Local/Overseas/PI Local (2026-09) -- lihat logAuditPoAudit/logAuditPoDelete di
  // src/utils/AuditPoLogHelpers.ts, dipakai ketiga halaman itu via AuditPoLogModal.tsx.
  AUDIT_PO: ['audit_po_ap_comp', 'audit_po_apovs_comp', 'audit_po_pi_local_comp'],
}

// Filter server-side (2026-09, laporan user + screenshot: kolom "Catatan" di halaman Audit
// Trail global tampil dump JSON RAKSASA -- `summary`/`source_files`/`extracted_raw`/
// `table_kelengkapan`/`matrix_perbandingan` dst) -- entri SEPERTI ITU BUKAN ditulis oleh
// aplikasi ini, MELAINKAN proses lain (kemungkinan besar trigger Postgres/n8n yang mirror
// SETIAP UPDATE ke `bunker_dokumen`/tabel Courier & Sea & Air langsung ke `audit_trail`, dump
// SELURUH kolom yang berubah apa adanya) -- SUDAH didokumentasikan sebagian utk Bunker (lihat
// "Bunker -- Riwayat Perubahan menyembunyikan entri asing" di CLAUDE.md, tapi fix-nya dulu
// HANYA diterapkan di modal per-baris `BunkerAuditLogModal.tsx`, BUKAN di halaman Audit Trail
// GLOBAL ini). Root cause pastinya sudah DIKONFIRMASI (2026-09, akses SQL Editor user sendiri):
// trigger Postgres `trg_audit_*` (fn_audit_bunker_dokumen/fn_audit_pib/fn_audit_cn/dst) yang
// mirror SETIAP insert/update/delete ke tabel terkait langsung ke `audit_trail`, cabang UPDATE
// panggil `fn_audit_diff(to_jsonb(OLD), to_jsonb(NEW))` yang dump SELURUH kolom yang berubah
// mentah-mentah (bukan cuma field manusiawi). Trigger-trigger ini SUDAH ditambah guard
// `IF auth.email() IS NULL THEN ... END IF;` (email NULL = koneksi service role key, dipakai
// n8n) supaya update dari n8n TIDAK LAGI insert ke audit_trail sama sekali -- TAPI update lewat
// aplikasi (user login) TETAP memicu dump mentah `fn_audit_diff` ini, jadi filter DI SINI masih
// tetap perlu sbg lapis kedua di sisi tampilan.
// fix DI SINI murni di sisi TAMPILAN (server-side filter query, bukan hapus dari DB): entri
// HANYA ditampilkan kalau (a) `catatan` KOSONG/NULL (SEMUA baris INSERT/DELETE dari trigger di
// atas TIDAK PERNAH mengisi kolom catatan sama sekali -- lihat definisi trigger, kolom itu
// bahkan tidak masuk daftar kolom INSERT-nya -- jadi NULL selalu aman ditampilkan, TIDAK PERNAH
// jadi sumber dump panjang), ATAU (b) `catatan` cocok format ringkas yang dipakai KEDUA fungsi
// tulis milik app ini -- `logBunkerAudit()`/`logAuditPoAudit()` ("{field} — Lama: X → Baru: Y")
// ATAU `logAuditPoDelete()` ("Baris dihapus permanen — ..."). **Bug ditemukan & diperbaiki**:
// versi PERTAMA filter ini LUPA syarat (a) -- `.ilike()` terhadap kolom NULL selalu FALSE di
// Postgres (bukan NULL yang dianggap "lolos"), jadi SEMUA baris INSERT/DELETE (dari SEMUA
// kategori, bukan cuma Bunker) ikut kebuang & Audit Trail sempat tampil "No data yet" total
// walau datanya ada di DB (laporan user + screenshot). Konsekuensi DISENGAJA yang TETAP berlaku:
// kategori Courier/Sea & Air TIDAK py fungsi log manual di app ini (grep dikonfirmasi 0 hasil)
// -- entri UPDATE kategori itu (hasil dump `fn_audit_diff` dari edit manual lewat UI, BUKAN dari
// n8n lagi setelah guard di atas) MASIH tersaring krn tidak cocok pola (b), sesuai permintaan
// user "biar rapi", HANYA baris INSERT/DELETE-nya yang tetap tampil.
const TRAIL_APP_WRITTEN_FILTER = 'catatan.is.null,catatan.ilike.%— Lama:%,catatan.ilike.Baris dihapus permanen —%';

// ─── Field AI (disabled) dan Manual (editable) per tipe ───────

const MANUAL_FIELDS = {
  audit: [
    { key: 'status',          label: 'Status', type: 'select',
      options: ['LENGKAP', 'PROSES', 'PENDING', 'REVISI'] },
    { key: 'remarks',         label: 'Remarks', type: 'text' },
    { key: 'no_sptnp',        label: 'No. SPTNP', type: 'text' },
    { key: 'tgl_sptnp',       label: 'SPTNP Date', type: 'date' },
    { key: 'marking',         label: 'Marking (Box)', type: 'text' },
    { key: 'doc_acceptance',  label: 'Doc Acceptance', type: 'text' },
    { key: 'tgl_submit_nas',  label: 'NAS Submit Date', type: 'date' },
    { key: 'notes',           label: 'Notes', type: 'textarea' },
  ],
  courier: [
    { key: 'ntpn',        label: 'NTPN', type: 'text' },
    { key: 'tgl_lunas',   label: 'Paid Date', type: 'date' },
    { key: 'submit_date', label: 'Approved / Submit Date', type: 'date' },
    { key: 'keterangan',  label: 'Internal Remarks', type: 'text' },
    { key: 'notes',       label: 'Remarks', type: 'textarea' },
  ],
}

// ─── Helper ───────────────────────────────────────────────────
// formatNoAju dipindah ke SeaAirAuditHelpers.ts (2026-09-30, dipakai juga tampilan kartu Audit PIB).

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num)
}

const fmtPct = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num) + ' %'
}

// Format tanggal seragam di seluruh aplikasi: DD-MMMM-YYYY, nama bulan Bahasa Inggris
// (mis. "31-August-2026"). Dipakai lintas tabel (Courier, Sea & Air, Audit Trail, dll).
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtDate = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${MONTHS_EN[d.getMonth()]}-${d.getFullYear()}`
}
const fmtDateTime = (v: any) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmtDate(v)}, ${time}`
}

// ─── Drag & Drop Reorder -- Audit Courier (Draft/PIB/CN) & Invoice Recap Courier (2026-09) ────
// Lihat docs/claude/courier-features.md & sql/022_.../023_... utk arsitektur lengkap (GLOBAL utk
// semua user, bukan per-user -- dikonfirmasi eksplisit user).

// State "belum ada sort eksplisit dari user" -- default `sortColumn`/`sortDirection` app ini.
// Selama tuple ini tidak berubah (klik header kolom lain menjauhkannya), urutan tampilan pakai
// `sort_order` (hasil drag) BUKAN `created_at` polos lagi -- lihat pemakaian di fetchRecords()/
// getExportData().
const isDefaultSortState = (sortColumn: string, sortDirection: 'asc' | 'desc') =>
  sortColumn === 'created_at' && sortDirection === 'desc';

// Jarak antar sort_order baris bersebelahan yang BELUM pernah di-drag (default value = negatif
// epoch created_at, lihat sql/022_...) SELALU >> GAP ini (beda antar-detik upload dokumen jauh
// lebih besar dari 1000) -- aman dipakai sbg "loncatan" saat drop di ujung paling atas/bawah
// tanpa nabrak baris lain.
const SORT_ORDER_GAP = 1000;

// Hitung sort_order BARU utk 1 baris yang di-drop di antara `before`/`after` (posisi barunya di
// array hasil drag, urut ASCENDING) -- titik tengah dari 2 tetangga, atau loncat GAP kalau di
// ujung. Dipakai SATU-SATUNYA di handleRowDragEnd, TIDAK ada RPC/reindex massal -- keterbatasan
// diterima: drag berulang-ulang PERSIS di titik yang sama bisa menghabiskan presisi float lama2,
// belum di-renormalize otomatis (pola project ini: trade-off minor diterima kecuali ada laporan).
const computeDroppedSortOrder = (before: number | null | undefined, after: number | null | undefined): number => {
  if (before == null && after == null) return 0;
  if (before == null) return (after as number) - SORT_ORDER_GAP;
  if (after == null) return (before as number) + SORT_ORDER_GAP;
  return (before + after) / 2;
};

// Urutan default tab Draft Audit Courier (2026-09-29): Created At TERBARU di atas (gabungan PIB+CN
// di-sort di browser). Tiebreak jenis dokumen + id supaya urutan stabil antar-halaman `slice()`.
const compareCreatedAtDesc = (a: any, b: any): number => {
  const ta = a.created_at ? Date.parse(a.created_at) : 0;
  const tb = b.created_at ? Date.parse(b.created_at) : 0;
  return (tb - ta) || String(a.jenis_dokumen).localeCompare(String(b.jenis_dokumen)) || (Number(b.id) - Number(a.id));
};

// Reorder Mode PER HALAMAN (2026-09-28, ganti fetch-semua-baris + batas 2.000) -- aman krn filter
// DILARANG selama Reorder (lihat `showReorderButton`), jadi 1 halaman = potongan UTUH urutan global
// scope tab. Halaman lebih besar dari default (100) supaya jarang perlu pindah halaman.
const REORDER_PAGE_SIZE = 100;
// Jarak minimum 2 tetangga sebelum nilai tengah dianggap "terlalu rapat" (nilai `sort_order`
// kembar -- baris n8n yg `created_at`-nya di detik yg sama -- ATAU presisi float habis krn drag
// berulang di titik yg sama) -> `sort_order` di sekitarnya dirapikan ulang dulu (respace).
const SORT_ORDER_MIN_GAP = 1e-3;
// Batas jumlah baris 1 blok nilai kembar yg boleh dirapikan ulang sekaligus (jaga2, kasus nyata
// biasanya cuma belasan baris yg ter-insert n8n di detik yg sama).
const SORT_ORDER_RESPACE_MAX = 500;

// Sel kolom "No." SAAT Reorder Mode (Audit Courier & Invoice Recap) -- grip drag + badge nomor
// posisi GLOBAL (bukan nomor di halaman). Klik badge -> popover "pindah ke posisi" (portal ke
// body, `position:fixed` -- tabel ini `overflow-auto`, popover absolute biasa akan ter-clip).
const ReorderIndexCell: React.FC<{
  sortable: ReturnType<typeof useSortable>,
  index: number,
  rowSpan: number,
  totalRows: number,
  onMoveTo?: (position: number) => void,
}> = ({ sortable, index, rowSpan, totalRows, onMoveTo }) => {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [popPos, setPopPos] = useState<{ top: number, left: number } | null>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = badgeRef.current?.getBoundingClientRect();
    if (r) setPopPos({ top: r.bottom + 6, left: r.left });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !badgeRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const move = (position: number) => { setOpen(false); setTarget(''); onMoveTo?.(position); };
  const targetNum = Number(target);
  const targetValid = Number.isInteger(targetNum) && targetNum >= 1 && targetNum <= totalRows && targetNum !== index + 1;

  return (
    <td className="px-2 py-3 align-top" rowSpan={rowSpan}>
      <div className="flex items-center justify-center gap-1.5">
        <button type="button" ref={sortable.setActivatorNodeRef} title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-[#5A305A] touch-none" {...sortable.attributes} {...sortable.listeners}>
          <GripVertical size={15} />
        </button>
        <button
          type="button"
          ref={badgeRef}
          onClick={() => onMoveTo && setOpen(o => !o)}
          title={onMoveTo ? 'Move to another position' : undefined}
          className={`min-w-6 h-6 px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${onMoveTo ? 'hover:bg-orange-600 cursor-pointer' : 'cursor-default'}`}
        >
          {index + 1}
        </button>
      </div>
      {open && popPos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: popPos.top, left: popPos.left }}
          className="z-[80] w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 flex flex-col gap-2 text-xs text-[#5A305A]"
        >
          <p className="font-bold">Move row No. {index + 1}</p>
          <div className="flex gap-1.5">
            <button type="button" disabled={index === 0} onClick={() => move(1)} className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40 disabled:cursor-not-allowed">To top</button>
            <button type="button" disabled={index === totalRows - 1} onClick={() => move(totalRows)} className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40 disabled:cursor-not-allowed">To bottom</button>
          </div>
          <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); if (targetValid) move(targetNum); }}>
            <input
              type="number"
              min={1}
              max={totalRows}
              autoFocus
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={`No. 1–${totalRows}`}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-orange-400"
            />
            <button type="submit" disabled={!targetValid} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Move</button>
          </form>
        </div>,
        document.body
      )}
    </td>
  );
};

// Rekonsiliasi urutan kolom hasil drag (tersimpan `table_column_order.column_order`, array key
// string) dgn definisi kolom yang SEDANG aktif (`activeCols`, bisa beda2 antar tab Draft/PIB/CN
// krn field opsional spt kurs_bi/sanksi_adm) -- kolom `type==='index'` SELALU dipaksa posisi
// PERTAMA (struktural, tidak ikut di-drag). Key tersimpan yang sudah tidak ada di `baseCols`
// (kolom dihapus dari kode) di-skip; kolom BARU di `baseCols` yang belum pernah ada di
// `storedKeys` (field baru ditambah developer) di-APPEND di akhir -- graceful, tidak hilang diam2.
const reorderCols = (baseCols: any[], storedKeys: string[] | null): any[] => {
  const indexCol = baseCols.find(c => c.type === 'index');
  const dataCols = baseCols.filter(c => c.type !== 'index');
  if (!storedKeys || storedKeys.length === 0) return baseCols;
  const byKey = new Map(dataCols.map(c => [c.key, c]));
  const ordered: any[] = [];
  storedKeys.forEach(k => { const c = byKey.get(k); if (c) { ordered.push(c); byKey.delete(k); } });
  byKey.forEach(c => ordered.push(c));
  return indexCol ? [indexCol, ...ordered] : ordered;
};

// ─── Status Badge ─────────────────────────────────────────────
// Nilai `status` di bawah ini APA ADANYA dari database (ditulis otomasi n8n) -- JANGAN pernah
// diubah. STATUS_LABELS di sini CUMA lapisan translasi tampilan (Indonesia -> Inggris), murni
// kosmetik di level render, tidak menyentuh nilai yang dikirim balik ke Supabase. Lihat catatan
// "Translasi UI ke Bahasa Inggris" di CLAUDE.md.
const STATUS_LABELS: Record<string, string> = {
  LENGKAP: 'Complete',
  PROSES: 'In Process',
  PENDING: 'Pending',
  REVISI: 'Revision',
  'TIDAK LENGKAP': 'Incomplete',
  'BELUM LENGKAP': 'Not Complete Yet',
  LULUS: 'Passed',
  'PERLU REVIEW': 'Needs Review',
  ARCHIVED: 'Archived',
}
const getStatusLabel = (status: string) => STATUS_LABELS[status] || status

// Audit Sea & Air -- Delivery Term mengandung "CIF" (case-insensitive substring, bukan exact
// match -- nilainya bisa "CIF" polos atau gabungan spt "CIF JAKARTA") -> Balance & Asuransi
// dipaksa 0 (2026-09, permintaan user: shipment CIF asuransinya sudah ditanggung
// seller/freight, jadi kolom Balance/Asuransi TIDAK relevan lagi utk term ini). Definisi +
// rumus Balance/Asuransi DIPINDAH (2026-09-30) ke `SeaAirAuditHelpers.ts`
// (`isCifDeliveryTerm`/`computeSeaAirBalanceAsuransi`, di-import di atas) -- dipakai 4 titik di
// file ini (EditModal, fetchRecords, getExportData, handleInlineSaveRow) + form Edit PIB baru.

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    LENGKAP: 'bg-emerald-100 text-emerald-700',
    PROSES:  'bg-amber-100 text-amber-700',
    PENDING: 'bg-orange-100 text-orange-700',
    REVISI:  'bg-red-100 text-red-700',
    'TIDAK LENGKAP': 'bg-red-100 text-red-700',
    'BELUM LENGKAP': 'bg-amber-100 text-amber-700',
    LULUS: 'bg-emerald-100 text-emerald-700',
    'PERLU REVIEW': 'bg-amber-100 text-amber-700',
    ARCHIVED: 'bg-slate-100 text-[#5A305A]',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${map[status] || 'bg-slate-100 text-[#5A305A]'}`}>
      {getStatusLabel(status) || '—'}
    </span>
  )
}

// ─── Number Input ───────────────────────────────────────────────
const NumberInput = ({ value, onChange, placeholder, className, isPct }: { value: any, onChange: (v: any) => void, placeholder: string, className: string, isPct?: boolean }) => {
  const [isFocused, setIsFocused] = useState(false);
  
  const displayVal = isFocused 
    ? (value === null || value === undefined ? '' : value) 
    : (isPct ? fmtPct(value) : fmt(value));
    
  return (
    <input
      type={isFocused ? 'number' : 'text'}
      step="any"
      value={displayVal === '—' ? '' : displayVal}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}

// Audit Courier — Auto-Calculate 7 kolom turunan: `COURIER_AUDIT_CALC_FIELDS`, `computeCourierAuditCalc`
// & `courierAuditCalcNum` DIPINDAH (2026-10-01, isi TIDAK berubah) ke src/utils/CourierAuditHelpers.ts
// supaya form baru CourierAuditEditModal memakai fungsi yang sama. Lihat komentar lengkap di sana.

// ─── Rekapan Courier — Auto-Calculate Kolom Turunan (2026-09) ───────────────
// Sama prinsip dgn COURIER_AUDIT_CALC_FIELDS di atas (override manual permanen, live-compute di
// semua jalur input). "Jumlah Vessel" = jumlah pemisah '+' pada kolom Vessel + 1 (vessel kosong
// atau tanpa '+' otomatis = 1, jangan sampai pembagi nol) -- PIC WAJIB pisah vessel dgn '+'
// (spasi-plus-spasi spt data lama), pemisah lain (koma dst) bikin hitungan ini salah.
const COURIER_REKAPAN_CALC_FIELDS = ['total_amount', 'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel'] as const;

function courierRekapanVesselCount(vesselText: any): number {
  const text = String(vesselText || '');
  if (!text) return 1;
  const plusCount = text.split('+').length - 1;
  return plusCount + 1;
}

function computeCourierRekapanCalc(row: Record<string, any>, overrideFields: string[] | Set<string> | null | undefined): Record<string, any> {
  const ov = overrideFields instanceof Set ? overrideFields : new Set(overrideFields || []);
  const n = courierAuditCalcNum;
  const out: Record<string, any> = {};

  const courierAdmFee = n(row.courier_adm_fee);
  const totalDutyTax = n(row.total_duty_tax);
  const totalFreight = n(row.total_freight);
  const bm = n(row.bm);
  const ppn = n(row.ppn);
  const pph = n(row.pph);
  const vesselCount = courierRekapanVesselCount(row.vessel);

  // 1. Total Amount = Courier Adm Fee + Total Duty Tax + Total Freight
  if (!ov.has('total_amount')) out.total_amount = courierAdmFee + totalDutyTax + totalFreight;

  // 2-6. Breakdown per Vessel
  if (!ov.has('breakdown_courier_adm_vessel')) out.breakdown_courier_adm_vessel = courierAdmFee / vesselCount;
  if (!ov.has('breakdown_duty_vessel')) out.breakdown_duty_vessel = totalDutyTax / vesselCount;
  if (!ov.has('breakdown_freight_vessel')) out.breakdown_freight_vessel = totalFreight / vesselCount;
  if (!ov.has('breakdown_bm_vessel')) out.breakdown_bm_vessel = bm / vesselCount;
  if (!ov.has('breakdown_ppnpph_vessel')) out.breakdown_ppnpph_vessel = (ppn + pph) / vesselCount;

  return out;
}

// ─── Edit Modal ───────────────────────────────────────────────
function EditModal({ record, tab, cols, onClose, onSaved, isCreate, createDefaults }: { record: any, tab: any, cols: any[], onClose: () => void, onSaved: () => void, isCreate?: boolean, createDefaults?: Record<string, any> }) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    cols.forEach(f => {
      if (f.type !== 'index') {
        init[f.key] = record[f.key] ?? ''
      }
    })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  // Field2 auto-calculate (COURIER_AUDIT_CALC_FIELDS) yg SUDAH PERNAH diedit manual oleh user --
  // dari data lama (`record.manual_override_fields`) atau baru ditandai selama sesi form ini.
  // `setManual` dipakai KHUSUS onChange input kolom auto-calculate (bukan `set` biasa) supaya
  // kalkulasi otomatis berhenti menimpa field itu setelah user ketik manual.
  const [overrides, setOverrides] = useState<Set<string>>(
    () => new Set(Array.isArray(record?.manual_override_fields) ? record.manual_override_fields : [])
  );

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }))
  const setManual = (key: string, val: any) => {
    set(key, val);
    setOverrides(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  useEffect(() => {
    if (tab.id === 'courier_audit') {
      const jenisDokumen = String(form.jenis_dokumen || (record && record.jenis_dokumen) || '').trim().toUpperCase();
      const calc = computeCourierAuditCalc(form, jenisDokumen, overrides);

      setForm(prev => {
        let updates: any = {};
        let changed = false;
        Object.keys(calc).forEach(k => {
          // Bandingkan sbg angka biar tidak infinite-loop gara2 beda representasi string vs number
          const a = calc[k] === '' ? '' : Number(calc[k]);
          const b = prev[k] === '' || prev[k] === undefined || prev[k] === null ? '' : Number(prev[k]);
          if (a !== b) {
            updates[k] = calc[k];
            changed = true;
          }
        });
        return changed ? { ...prev, ...updates } : prev;
      });
    }
  }, [
    tab.id, overrides, form.jenis_dokumen,
    form.valas_dpp, form.kurs_ndpbm, form.bm, form.ppn_nilai, form.pph_nilai,
    form.item_price, form.other_cost, form.kurs, form.kurs_bi, form.total_inv_freight,
    form.sanksi_adm,
    form.total_nilai_pabean, form.total_nilai_pabean_bm, form.item_price_idr,
  ]);

  useEffect(() => {
    if (tab.id === 'courier_rekapan') {
      const calc = computeCourierRekapanCalc(form, overrides);

      setForm(prev => {
        let updates: any = {};
        let changed = false;
        Object.keys(calc).forEach(k => {
          const a = Number(calc[k]);
          const b = prev[k] === '' || prev[k] === undefined || prev[k] === null ? 0 : Number(prev[k]);
          if (a !== b) {
            updates[k] = Number(a.toFixed(2));
            changed = true;
          }
        });
        return changed ? { ...prev, ...updates } : prev;
      });
    }
  }, [
    tab.id, overrides,
    form.vessel, form.courier_adm_fee, form.total_duty_tax, form.total_freight, form.bm, form.ppn, form.pph,
  ]);

  // BALANCE = VALAS DPP * KURS NDPBM - (TOTAL INV FREIGHT + ITEM PRICE (RP))
  // ASURANSI = 0.5% * (TOTAL INV FREIGHT + ITEM PRICE (RP))
  // Auto re-kalkulasi tiap salah satu dari 4 kolom sumbernya berubah -- sama pola dengan
  // item_price_idr/cek_selisih di courier_audit di atas. Balance & Asuransi TIDAK diedit
  // manual lagi (lihat isInlineEditable), murni hasil formula ini.
  useEffect(() => {
    if (tab.id === 'sea_air_audit') {
      const getNum = (key: string) => {
        const v = form[key];
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string') return Number(v.replace(/,/g, ''));
        return Number(v) || 0;
      };

      // Rumus di computeSeaAirBalanceAsuransi (SeaAirAuditHelpers.ts), SATU-SATUNYA definisi.
      const { balance: expectedBalance, asuransi: expectedAsuransi } = computeSeaAirBalanceAsuransi({
        valas_dpp: getNum('valas_dpp'),
        kurs_ndpbm: getNum('kurs_ndpbm'),
        total_inv_freight: getNum('total_inv_freight'),
        item_price_idr: getNum('item_price_idr'),
        delivery_term: form.delivery_term,
      });

      setForm(prev => {
        let updates: any = {};
        let changed = false;

        if (Number(prev.balance) !== expectedBalance) {
          updates.balance = expectedBalance;
          changed = true;
        }
        if (Number(prev.asuransi) !== expectedAsuransi) {
          updates.asuransi = expectedAsuransi;
          changed = true;
        }

        if (changed) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [tab.id, form.valas_dpp, form.kurs_ndpbm, form.total_inv_freight, form.item_price_idr, form.delivery_term]);

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const EXCLUDED_COLS = ['jenis_source', 'validasi_jalur', 'catatan_jalur', 'status_kelengkapan', 'dokumen_kurang', 'pct_kelengkapan', 'total_mandatory', 'total_mandatory_ada'];
      const payload: Record<string, any> = { ...form }

      // Simpan daftar kolom auto-calculate yg pernah diedit manual (lihat `overrides`/`setManual`
      // di atas) supaya kalkulasi otomatis di fetch/inline-edit berikutnya tidak menimpa lagi.
      if (tab.id === 'courier_audit' || tab.id === 'courier_rekapan') {
        const calcFieldSet = new Set<string>(tab.id === 'courier_audit' ? COURIER_AUDIT_CALC_FIELDS : COURIER_REKAPAN_CALC_FIELDS);
        payload.manual_override_fields = Array.from(overrides).filter((f: string) => calcFieldSet.has(f));
      }

      Object.keys(payload).forEach(key => {
        if (payload[key] === '') payload[key] = null;
      });

      cols.forEach(c => {
        if ((c.type === 'num' || c.type === 'pct') && payload[c.key] !== null && payload[c.key] !== undefined) {
          payload[c.key] = Number(payload[c.key]);
        }
      });

      EXCLUDED_COLS.forEach(k => delete payload[k]);

      // created_at biasanya punya default now() di DB -- jangan kirim null eksplisit saat create
      // supaya default-nya tetap kepakai (bukan mengosongkan kolom).
      if (isCreate && !payload.created_at) delete payload.created_at;

      // Field seperti "status" (mis. ARCHIVED saat tambah dari tab Draft) tidak selalu ada di
      // `cols` yang dirender, jadi tidak ke-set lewat form -- dipaksa masuk di sini.
      if (isCreate && createDefaults) Object.assign(payload, createDefaults);

      if (isCreate) {
        if (tab.table === 'tabel_audit_seaair') {
          const { error: rpcErr } = await supabase.rpc('insert_seaair_row', { p_data: payload });
          if (rpcErr) throw rpcErr;
          onSaved()
          onClose()
          return;
        }
        if (tab.id === 'courier_audit') {
          const jenisDokumen = String(payload.jenis_dokumen || '').trim().toUpperCase() === 'CN' ? 'CN' : 'PIB';
          payload.jenis_dokumen = jenisDokumen;
          const targetTableCreate = jenisDokumen === 'CN' ? 'tabel_audit_cn' : 'tabel_audit_pib';
          // Form "Add Data" ini dirender pakai `cols` = activeCols, yg ikut TAB YANG SEDANG AKTIF
          // (PIB/CN/Draft) -- TAPI field "Document Type" (jenis_dokumen) adalah <input> teks bebas
          // (lihat render generik di atas), jadi user BISA mengetik "CN" manual walau field2 yg
          // muncul di form masih dari PIB_COLS (mis. `no_pib`), atau sebaliknya. Kalau tidak
          // di-strip, payload itu ikut terkirim ke tabel yg SKEMANYA BEDA (mis. `no_pib` dikirim
          // ke `tabel_audit_cn` yg tidak punya kolom itu sama sekali) -> Supabase error "Could not
          // find the '<kolom>' column of '<tabel>' in the schema cache" (2026-09, laporan user).
          // Fix: buang key manapun yg TIDAK ada di daftar kolom tabel tujuan yg SEBENARNYA dipakai.
          // `status` (kolom asli tabel_audit_pib/cn, dipakai filter ARCHIVED) SENGAJA tidak ada
          // di PIB_COLS/CN_COLS (yg ada cuma `status_kelengkapan`) -- kalau tidak di-whitelist
          // manual di sini, createDefaults={status:'ARCHIVED'} di atas ikut ke-strip diam2 &
          // insert jatuh ke default kolom DB (2026-09, laporan user "status masih LENGKAP").
          const allowedKeysCreate = new Set([...(jenisDokumen === 'CN' ? CN_COLS : PIB_COLS).map(c => c.key), 'status', 'manual_override_fields']);
          Object.keys(payload).forEach(k => { if (!allowedKeysCreate.has(k)) delete payload[k]; });
          const { error: insErr } = await supabase.from(targetTableCreate).insert(payload);
          if (insErr) throw insErr;
          onSaved()
          onClose()
          return;
        }
        if (tab.table === 'rekapan_courier') {
          const { error: insErr } = await supabase.from('rekapan_courier').insert(payload);
          if (insErr) throw insErr;
          onSaved()
          onClose()
          return;
        }
        throw new Error('Manual add is not supported for this table.');
      }

      let targetTable = tab.table;
      if (!targetTable) {
        if (record.jenis_dokumen === 'PIB' || payload.jenis_dokumen === 'PIB') {
          targetTable = 'tabel_audit_pib';
        } else if (record.jenis_dokumen === 'CN' || payload.jenis_dokumen === 'CN') {
          targetTable = 'tabel_audit_cn';
        } else if (tab.id === 'courier_audit') {
           // fallback if somehow missing jenis_dokumen
           targetTable = record.no_pib ? 'tabel_audit_pib' : 'tabel_audit_cn';
        }
      }

      let error = null;
      if (targetTable === 'tabel_audit_seaair') {
        const { error: rpcErr } = await supabase.rpc('update_seaair_row', { p_id: record.id, p_updates: payload });
        error = rpcErr;
      } else if (targetTable === 'rekapan_seaair') {
        const rekapanPayload = { ...payload };
        if (rekapanPayload.cbm !== undefined) {
          const cbmVal = rekapanPayload.cbm;
          delete rekapanPayload.cbm;
          if (record.seaair_id) {
            const { error: updErr } = await supabase.from('tabel_audit_seaair').update({ cbm: cbmVal }).eq('id', record.seaair_id);
            if (updErr) error = updErr;
          }
        }
        if (!error && Object.keys(rekapanPayload).length > 0) {
          const { error: rpcErr } = await supabase.from('rekapan_seaair').update(rekapanPayload).eq('id', record.id);
          error = rpcErr;
        }
      } else {
        const { error: updErr } = await supabase
          .from(targetTable)
          .update(payload)
          .eq('id', record.id);
        error = updErr;
      }
        
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: any) {
      setErr(e.message || 'Failed to save. Check your Supabase connection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-navy-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-6 animate-fade-up">

        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-[#5A305A]">{isCreate ? 'Add New Data' : 'Edit Record'}</h3>
            <p className="text-xs text-[#5A305A] mt-0.5 font-mono">
              {isCreate ? 'Fill in the available fields, the rest can be completed later via Edit' : (record.awb || record.no_invoice || record.no_pib || record.no_aju || record.id)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A] text-sm transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {cols.map(c => {
              if (c.type === 'index') return null;

              let inputType = 'text';
              if (c.type === 'date') inputType = 'date';
              if (c.type === 'num' || c.type === 'pct') inputType = 'number';

              let inputElement = null;
              if (c.key === 'jenis_dokumen' && tab.id === 'courier_audit') {
                // Dropdown TERBATAS PIB/CN (2026-09, permintaan user) -- sebelumnya field teks
                // bebas, resiko salah ketik/salah tabel tujuan saat "Add Data" (lihat fix
                // stripping payload di handleSave di atas). Dropdown TIDAK menutup celah itu
                // sepenuhnya (masih perlu stripping krn form fields yg tampil ikut tab AKTIF,
                // bukan value dropdown ini), tapi cegah user salah ketik/typo nilai selain
                // PIB/CN. Disabled saat EDIT (bukan create) -- record yg sudah ada tabelnya
                // ditentukan dari `record.jenis_dokumen` asli (lihat handleSave), mengubah field
                // ini di mode Edit TIDAK memindahkan row ke tabel lain, jadi disable supaya
                // tidak menyesatkan user mengira bisa "pindah jalur" lewat sini.
                inputElement = (
                  <select
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    disabled={!isCreate}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-[#5A305A] h-[34px] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="PIB">PIB</option>
                    <option value="CN">CN</option>
                  </select>
                )
              } else if (c.key === 'status' && tab.id === 'courier_audit' && isCreate) {
                // Data manual di Audit Courier SELALU masuk sbg ARCHIVED (tidak muncul di Audit,
                // baru kelihatan lewat tab Draft) -- field terkunci, bukan pilihan user.
                inputElement = (
                  <input
                    type="text"
                    value={getStatusLabel('ARCHIVED')}
                    disabled
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs font-medium text-[#5A305A] h-[34px] opacity-60 cursor-not-allowed"
                  />
                )
              } else if (c.key === 'status') {
                inputElement = (
                  <select
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-[#5A305A] h-[34px]"
                  >
                    <option value="">— Select —</option>
                    {['LENGKAP', 'PROSES', 'PENDING', 'REVISI'].map(o => <option key={o} value={o}>{getStatusLabel(o)}</option>)}
                  </select>
                )
              } else if (c.key === 'notes' || c.key === 'remarks') {
                inputElement = (
                  <textarea
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    rows={3}
                    placeholder={`Enter ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all font-medium text-[#5A305A]"
                  />
                )
              } else if (c.type === 'num' || c.type === 'pct') {
                // Kolom auto-calculate (COURIER_AUDIT_CALC_FIELDS) tetap bisa diketik manual --
                // via `setManual` biar ditandai `overrides` & berhenti ditimpa kalkulasi otomatis
                // (lihat useEffect di atas). Marker biru+pensil di label ditangani di bawah.
                const isCalcField = (tab.id === 'courier_audit' && (COURIER_AUDIT_CALC_FIELDS as readonly string[]).includes(c.key))
                  || (tab.id === 'courier_rekapan' && (COURIER_REKAPAN_CALC_FIELDS as readonly string[]).includes(c.key));
                inputElement = (
                  <NumberInput
                    value={form[c.key]}
                    onChange={(v) => isCalcField ? setManual(c.key, v) : set(c.key, v)}
                    placeholder={`Enter ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-[#5A305A] h-[34px]"
                    isPct={c.type === 'pct'}
                  />
                )
              } else {
                inputElement = (
                  <input
                    type={inputType}
                    step="any"
                    value={form[c.key] ?? ''}
                    onChange={e => set(c.key, e.target.value)}
                    placeholder={c.type === 'date' ? 'YYYY-MM-DD' : `Enter ${c.label}...`}
                    className="w-full border border-blue-200 bg-blue-50/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-[#5A305A] h-[34px]"
                  />
                )
              }

              const isOverriddenCalc = ((tab.id === 'courier_audit' && (COURIER_AUDIT_CALC_FIELDS as readonly string[]).includes(c.key))
                || (tab.id === 'courier_rekapan' && (COURIER_REKAPAN_CALC_FIELDS as readonly string[]).includes(c.key))) && overrides.has(c.key);

              return (
                <div key={c.key} className={c.key === 'notes' || c.key === 'remarks' ? 'col-span-2 md:col-span-3 lg:col-span-4' : 'col-span-2 md:col-span-1'}>
                  <label className="text-[10px] font-semibold flex items-center gap-1.5 mb-1 text-blue-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4a3552] inline-block"></span>
                    {c.label}
                    {isOverriddenCalc && (
                      <span className="inline-flex items-center gap-0.5 text-blue-600" title="Nilai diedit manual, tidak lagi dihitung otomatis">
                        <Pencil size={9} />
                      </span>
                    )}
                  </label>
                  {inputElement}
                </div>
              )
            })}
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mt-5">
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-bold text-sm disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Columns Config ─────────────────────────────────────────────

const SEA_AIR_AUDIT_COLS = [
  { key: 'jenis_dokumen', label: 'Document Type' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'vendor', label: 'Vendor' },
  // kurs = KODE mata uang (TEXT di DB, mis. USD) -- dulu salah type:'num' (Number("USD") = NaN). Fix 2026-10-01.
  { key: 'kurs', label: 'Kurs' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Price Detail' },
  { key: 'impor_an', label: 'Import A/N' },
  { key: 'via', label: 'Via', type: 'badge_via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'no_aju', label: 'No. PIB', type: 'no_aju_format' },
  { key: 'awb', label: 'AWB/BL' },
  { key: 'total_pib', label: 'Total PIB', type: 'num_bold' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'no_sptnp', label: 'No. SPTNP', type: 'dash_if_null' },
  { key: 'sptnp_total', label: 'SPTNP Total (Rp)', type: 'num_dash_if_null' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'CUSTOMS VALUE', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'IMPORT VALUE', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'PPJK Date', type: 'date' },
  { key: 'tgl_sptnp', label: 'SPTNP Date', type: 'date_dash_if_null' },
  { key: 'status', label: 'Status', type: 'status' },
  // 'num' (BUKAN 'num_dash_null' lagi, 2026-09) -- disamakan dgn Insurance: value 0 (mis. hasil
  // pengecualian Delivery Term CIF, lihat isCifDeliveryTerm) TETAP tampil "0", bukan "-".
  // 'num_dash_null' dulu SATU-SATUNYA dipakai kolom ini, jadi ganti di sini TIDAK mempengaruhi
  // kolom lain (mis. sptnp_total pakai 'num_dash_if_null', beda string, sengaja tetap "-" saat 0).
  { key: 'balance', label: 'Balance', type: 'num' },
  { key: 'asuransi', label: 'Insurance', type: 'num' },
  { key: 'notes', label: 'Notes' },
]

const SEA_AIR_REKAPAN_COLS = [
  { key: 'tgl', label: 'Date', type: 'date' },
  { key: 'shipment_type', label: 'Shipment Type', type: 'badge_shipment' },
  { key: 'total_keseluruhan_biaya', label: 'Grand Total', type: 'num_highlight' },
  { key: 'tgl_submit_finance', label: 'Finance Submit Date', type: 'date_badge_if_null' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'no_invoice', label: 'No. Invoice' },
  { key: 'po_no', label: 'PO No.' },
  { key: 'a_n', label: 'A/N' },
  { key: 'container_count', label: 'Qty Container' },
  { key: 'container_type', label: 'Container Type' },
  { key: 'awb', label: 'AWB/BL' },
  { key: 'weight_kg', label: 'Weight (KG)' },
  { key: 'cbm', label: 'CBM', type: 'num_dash_null_2dec' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'origin', label: 'Origin' },
  { key: 'destination', label: 'Destination' },
  { key: 'etd', label: 'ETD', type: 'date_dash_if_null' },
  { key: 'eta', label: 'ETA', type: 'date_dash_if_null' },
  { key: 'atd', label: 'ATD', type: 'date_dash_if_null' },
  { key: 'ata', label: 'ATA', type: 'date_dash_if_null' },

  { key: 'total_invoice', label: 'Total Invoice', type: 'num' },

  { key: 'emkl_vendor', label: 'Vendor EMKL' },
  { key: 'emkl_biaya', label: 'EMKL Cost', type: 'num' },
  { key: 'emkl_split', label: 'Split EMKL', type: 'num' },

  { key: 'freight_vendor', label: 'Vendor Freight' },
  { key: 'biaya_origin', label: 'Origin Cost', type: 'num' },
  { key: 'biaya_destination', label: 'Destination Cost', type: 'num' },
  { key: 'split_biaya_origin', label: 'Split Origin', type: 'num' },
  { key: 'split_biaya_destination', label: 'Split Destination', type: 'num' },

  { key: 'pbm_vendor', label: 'Vendor PBM' },
  { key: 'pbm_biaya', label: 'PBM Cost', type: 'num' },
  { key: 'pbm_split', label: 'Split PBM', type: 'num' },

  { key: 'lift_off_vendor', label: 'Vendor Lift Off' },
  { key: 'lift_off_biaya', label: 'Lift Off Cost', type: 'num' },
  { key: 'lift_off_split', label: 'Split Lift Off', type: 'num' },

  { key: 'inspeksi_vendor', label: 'Inspection Vendor', type: 'dash_if_null' },
  { key: 'inspeksi_biaya', label: 'Inspection Cost', type: 'num_dash_if_null' },
  { key: 'inspeksi_split', label: 'Split Inspection', type: 'num_dash_if_null' },

  { key: 'handling_vendor', label: 'Vendor Handling', type: 'dash_if_null' },
  { key: 'handling_biaya', label: 'Handling Cost', type: 'num_dash_if_null' },
  { key: 'handling_split', label: 'Split Handling', type: 'num_dash_if_null' },

  { key: 'other_vendor', label: 'Other Vendor', type: 'dash_if_null' },
  { key: 'other_biaya', label: 'Other Cost', type: 'num_dash_if_null' },
  { key: 'other_split', label: 'Other Split', type: 'num_dash_if_null' },

  { key: 'duty_total', label: 'Duty Total', type: 'num' },
  { key: 'duty_split', label: 'Duty Split', type: 'num' },

  { key: 'bm_split', label: 'BM', type: 'num' },
  { key: 'ppn_split', label: 'PPN', type: 'num' },
  { key: 'pph_split', label: 'PPH', type: 'num' },

  { key: 'bm', label: 'BM (Total)', type: 'num' },
  { key: 'ppn', label: 'PPN (Total)', type: 'num' },
  { key: 'pph', label: 'PPH (Total)', type: 'num' },

  { key: 'notes', label: 'Notes' },
]

const PIB_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'kurs', label: 'CURRENCY' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Price Detail' },
  { key: 'impor_an', label: 'A/N' },
  { key: 'via', label: 'Via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_pib', label: 'No. PIB', type: 'no_aju_format' },
  { key: 'no_sptnp', label: 'No. SPTNP' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'total_inv_duty', label: 'Total Inv Duty', type: 'num' },
  { key: 'total_pib_cn', label: 'Total PIB/CN (Rp)', type: 'num' },
  { key: 'sptnp_total', label: 'SPTNP Total (Rp)', type: 'num' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'Total Customs Value', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'T N.Pabean + BM', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'PPJK Date', type: 'date' },
  { key: 'tgl_sptnp', label: 'SPTNP Date', type: 'date' },
  { key: 'status_kelengkapan', label: 'Completeness Status', type: 'status' },
  { key: 'dokumen_kurang', label: 'Missing Documents' },
  { key: 'pct_kelengkapan', label: 'Percentage (%)', type: 'pct' },
  { key: 'jenis_source', label: 'Source Type' },
  { key: 'created_at', label: 'Created At', type: 'date' },
  { key: 'validasi_jalur', label: 'Path Validation' },
  { key: 'catatan_jalur', label: 'Path Notes' },
  { key: 'notes', label: 'Notes' },
  { key: 'doc_acceptance', label: 'Doc Acceptance', type: 'date' },
  { key: 'tgl_submit_nas', label: 'NAS Submit Date', type: 'date' },
  { key: 'marking', label: 'Marking' },
  { key: 'cek_selisih', label: 'Check Difference (Rp)', type: 'num' },
  { key: 'jenis_dokumen', label: 'Document Type' },
]

const CN_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'po_ori', label: 'PO ORI' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'kurs', label: 'CURRENCY' },
  { key: 'item_price', label: 'Item Price', type: 'num' },
  { key: 'other_cost', label: 'Other Cost', type: 'num' },
  { key: 'kurs_bi', label: 'Kurs BI (Rp)', type: 'num' },
  { key: 'item_price_idr', label: 'Item Price (Rp)', type: 'num' },
  { key: 'vendor_inv_no', label: 'Vendor Inv No' },
  { key: 'po_harga_detail', label: 'PO Price Detail' },
  { key: 'impor_an', label: 'A/N' },
  { key: 'via', label: 'Via' },
  { key: 'delivery_term', label: 'Delivery Term' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_sppbmcp', label: 'No. SPPBMCP' },
  { key: 'no_sptnp', label: 'No. SPTNP' },
  { key: 'total_inv_freight', label: 'Total Inv Freight', type: 'num' },
  { key: 'total_inv_duty', label: 'Total Inv Duty', type: 'num' },
  { key: 'total_pib_cn', label: 'Total PIB/CN (Rp)', type: 'num' },
  { key: 'sanksi_adm', label: 'Admin Penalty', type: 'num' },
  { key: 'ppn_nilai', label: 'PPN Nilai (Rp)', type: 'num' },
  { key: 'ppn_pct', label: 'PPN (%)', type: 'pct' },
  { key: 'pph_nilai', label: 'PPH Nilai (Rp)', type: 'num' },
  { key: 'pph_pct', label: 'PPH (%)', type: 'pct' },
  { key: 'valas_dpp', label: 'Valas DPP', type: 'num' },
  { key: 'kurs_ndpbm', label: 'Kurs NDPBM', type: 'num' },
  { key: 'total_nilai_pabean', label: 'Total Customs Value', type: 'num' },
  { key: 'bm', label: 'BM (Rp)', type: 'num' },
  { key: 'total_nilai_pabean_bm', label: 'T N.Pabean + BM', type: 'num' },
  { key: 'hs_code', label: 'HS Code' },
  { key: 'tgl_ppjk', label: 'PPJK Date', type: 'date' },
  { key: 'tgl_sptnp', label: 'SPTNP Date', type: 'date' },
  { key: 'status_kelengkapan', label: 'Completeness Status', type: 'status' },
  { key: 'dokumen_kurang', label: 'Missing Documents' },
  { key: 'pct_kelengkapan', label: 'Percentage (%)', type: 'pct' },
  { key: 'jenis_source', label: 'Source Type' },
  { key: 'created_at', label: 'Created At', type: 'date' },
  { key: 'validasi_jalur', label: 'Path Validation' },
  { key: 'catatan_jalur', label: 'Path Notes' },
  { key: 'notes', label: 'Notes' },
  { key: 'doc_acceptance', label: 'Doc Acceptance', type: 'date' },
  { key: 'tgl_submit_nas', label: 'NAS Submit Date', type: 'date' },
  { key: 'marking', label: 'Marking' },
  { key: 'cek_selisih', label: 'Check Difference (Rp)', type: 'num' },
  { key: 'jenis_dokumen', label: 'Document Type' },
]

const COURIER_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'tgl_terima_email', label: 'Email Received Date', type: 'date' },
  { key: 'tgl_lapor_fp', label: 'FP Report Date', type: 'date' },
  { key: 'ppjk', label: 'PPJK' },
  { key: 'invoice_type', label: 'Invoice Type', type: 'invType' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'origin', label: 'Origin' },
  { key: 'no_invoice', label: 'No. Invoice' },
  { key: 'courier_adm_fee', label: 'Courier Adm Fee', type: 'num' },
  { key: 'total_duty_tax', label: 'Total Duty Tax', type: 'num' },
  { key: 'total_freight', label: 'Total Freight', type: 'num' },
  { key: 'total_amount', label: 'Total Amount', type: 'num' },
  { key: 'bm', label: 'BM', type: 'num' },
  { key: 'ppn', label: 'PPN', type: 'num' },
  { key: 'pph', label: 'PPH', type: 'num' },
  { key: 'ntpn', label: 'NTPN' },
  { key: 'awb', label: 'AWB', type: 'awb_strip_carrier' },
  { key: 'weight_kg', label: 'Weight (Kg)', type: 'num' },
  { key: 'an', label: 'A/N' },
  { key: 'po_pt_imi', label: 'PO PT IMI' },
  { key: 'po_shipping', label: 'PO Non IMI' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'breakdown_courier_adm_vessel', label: 'Breakdown Courier Adm (Vessel)', type: 'num' },
  { key: 'breakdown_duty_vessel', label: 'Breakdown Duty (Vessel)', type: 'num' },
  { key: 'breakdown_freight_vessel', label: 'Breakdown Freight (Vessel)', type: 'num' },
  { key: 'breakdown_bm_vessel', label: 'Breakdown BM (Vessel)', type: 'num' },
  { key: 'breakdown_ppnpph_vessel', label: 'Breakdown PPN/PPH (Vessel)', type: 'num' },
  { key: 'notes', label: 'Remarks' },
  { key: 'submit_date', label: 'Submit Date', type: 'date' },
  { key: 'tgl_lunas', label: 'Paid Date', type: 'date' },
  { key: 'keterangan', label: 'Internal Remarks' },
  { key: 'created_at', label: 'Created At', type: 'date' }
]

// Sumber daftar kolom utk modal "Customize View" -- Audit gabungan (dedup by key) dari
// PIB_COLS + CN_COLS krn Audit Courier punya sub-tipe PIB/CN/Draft yg kolomnya sedikit beda,
// tapi 1 preferensi customize view berlaku ke semua sub-tipe (lihat CLAUDE.md). Kolom 'index'
// dikeluarkan -- selalu tampil, tidak bisa disembunyikan.
const COURIER_AUDIT_CUSTOMIZABLE_COLS: { key: string; label: string }[] = (() => {
  const seen = new Set<string>();
  const merged: { key: string; label: string }[] = [];
  ;[...PIB_COLS, ...CN_COLS].forEach(c => {
    if (c.type === 'index' || seen.has(c.key)) return;
    seen.add(c.key);
    merged.push({ key: c.key, label: c.label });
  })
  return merged;
})();

const COURIER_REKAPAN_CUSTOMIZABLE_COLS: { key: string; label: string }[] =
  COURIER_COLS.filter(c => c.type !== 'index').map(c => ({ key: c.key, label: c.label }));

// Halaman yg kolomnya bisa DIBATASI PER ROLE (2026-09-29, `role_page_access.visible_columns`,
// diatur di RoleManagementPage.tsx) -> daftar kolom pilihan. SATU-SATUNYA sumber, dipakai
// RoleManagementPage (checklist) & SharedDataTable (filter tampilan) -- JANGAN duplikat daftar
// kolom di tempat lain. Tujuan murni merapikan tampilan (role Finance), BUKAN keamanan.
export const COLUMN_ACCESS_PAGES: Record<string, { key: string; label: string }[]> = {
  courier_audit: COURIER_AUDIT_CUSTOMIZABLE_COLS,
  courier_rekapan: COURIER_REKAPAN_CUSTOMIZABLE_COLS,
};

const TRAIL_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'created_at', label: 'Waktu', type: 'datetime' },
  { key: 'user_email', label: 'User' },
  { key: 'tabel', label: 'Tabel' },
  { key: 'jenis', label: 'Jenis' },
  { key: 'action', label: 'Action' },
  { key: 'awb', label: 'AWB' },
  { key: 'no_dokumen', label: 'No. Dokumen' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'catatan', label: 'Catatan' },
]

const VALIDASI_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'status_validasi', label: 'Validation Status', type: 'status' },
  { key: 'awb', label: 'AWB' },
  { key: 'jenis_dokumen', label: 'Document Type' },
  { key: 'pib_id', label: 'PIB ID' },
  { key: 'cn_id', label: 'CN ID' },
  { key: 'total_validasi', label: 'Total Item', type: 'num' },
  { key: 'total_lulus', label: 'Passed', type: 'num' },
  { key: 'total_gagal', label: 'Failed', type: 'num' },
  { key: 'persentase', label: 'Accuracy (%)', type: 'pct_dynamic' },
  { key: 'v1_weight_match', label: 'V1 (Weight Match)', type: 'bool' },
  { key: 'v1_pt_name_match', label: 'V1 (PT Name Match)', type: 'bool' },
  { key: 'v1_awb_no_match', label: 'V1 (AWB Match)', type: 'bool' },
  { key: 'v2_subtotal_match', label: 'V2 (Subtotal Match)', type: 'bool' },
  { key: 'v2_ppn_match', label: 'V2 (PPN Match)', type: 'bool' },
  { key: 'v2_pt_name_match', label: 'V2 (PT Name Match)', type: 'bool' },
  { key: 'v3_other_fees_match', label: 'V3 (Other Fees Match)', type: 'bool' },
  { key: 'v3_ppn_match', label: 'V3 (PPN Match)', type: 'bool' },
  { key: 'v4_awb_match', label: 'V4 (AWB Match)', type: 'bool' },
  { key: 'v4_value_match', label: 'V4 (Value Match)', type: 'bool' },
  { key: 'v4_ppn_match', label: 'V4 (PPN Match)', type: 'bool' },
  { key: 'v5_awb_match', label: 'V5 (AWB Match)', type: 'bool' },
  { key: 'v5_value_match', label: 'V5 (Value Match)', type: 'bool' },
  { key: 'v5_ppn_match', label: 'V5 (PPN Match)', type: 'bool' },
  { key: 'v6_awb_match', label: 'V6 (AWB Match)', type: 'bool' },
  { key: 'v6_pt_match', label: 'V6 (PT Match)', type: 'bool' },
  { key: 'v7_awb_match', label: 'V7 (AWB Match)', type: 'bool' },
  { key: 'v7_pt_match', label: 'V7 (PT Match)', type: 'bool' },
  { key: 'v8_inv_no_match', label: 'V8 (Inv No Match)', type: 'bool' },
  { key: 'v8_value_match', label: 'V8 (Value Match)', type: 'bool' },
  { key: 'v9_value_match', label: 'V9 (Value Match)', type: 'bool' },
  { key: 'v10_inv_no_match', label: 'V10 (Inv No Match)', type: 'bool' },
  { key: 'v10_value_match', label: 'V10 (Value Match)', type: 'bool' },
  { key: 'v11_inv_no_match', label: 'V11 (Inv No Match)', type: 'bool' },
  { key: 'v11_value_match', label: 'V11 (Value Match)', type: 'bool' },
  { key: 'v12_djbc_match', label: 'V12 (DJBC Match)', type: 'bool' },
  { key: 'v12_bpn_match', label: 'V12 (BPN Match)', type: 'bool' },
  { key: 'v13_pass', label: 'V13 (Vessel Pass)', type: 'bool' },
  { key: 'v14_pass', label: 'V14 (Final Vessel Pass)', type: 'bool' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
]

// ─── Checklist Modal ──────────────────────────────────────────────
const CHECKLIST_FIELDS = [
  { key: 'ada_invoice_freight', label: 'Invoice Freight', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_fp_invoice_freight', label: 'FP Invoice Freight', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_credit_note_freight', label: 'Credit Note Freight', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_fp_revisi_freight', label: 'FP Revisi Freight', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_credit_note_duty', label: 'Credit Note Duty', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_fp_revisi_duty', label: 'FP Revisi Duty', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_invoice_duty', label: 'Invoice Duty', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_fp_invoice_duty', label: 'FP Invoice Duty', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_sppb', label: 'SPPB', mand: ['pib'], scope: ['pib'] },
  { key: 'ada_pib', label: 'PIB', mand: ['pib'], scope: ['pib'] },
  { key: 'ada_sppbmcp', label: 'SPPBMCP', mand: ['cn'], scope: ['cn'] },
  { key: 'ada_billing_djbc', label: 'Billing DJBC', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_bpn', label: 'BPN', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_po', label: 'PO (Ascend)', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_cipl', label: 'CIPL', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_awb', label: 'AWB', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_final_invoice', label: 'Final Invoice', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_bt_vendor', label: 'BT Vendor', mand: ['pib', 'cn'], scope: ['pib', 'cn'] },
  { key: 'ada_rincian_bt_vendor', label: 'BT Vendor Details', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_spjm_npd', label: 'SPJM / NPD', mand: [], scope: ['pib'] },
  { key: 'ada_sptnp', label: 'SPTNP', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_billing_djbc_sptnp', label: 'Billing DJBC SPTNP', mand: [], scope: ['pib', 'cn'] },
  { key: 'ada_bpn_sptnp', label: 'BPN SPTNP', mand: [], scope: ['pib', 'cn'] },
]

// Kolom dokumen_checklist yang dulunya di-join lewat view v_pib_lengkap/v_cn_lengkap.
// Sejak view dihilangkan (2026-09), kolom-kolom ini di-merge manual di sini dari tabel dokumen_checklist.
const CHECKLIST_MERGE_FIELDS = [
  'status_kelengkapan', 'dokumen_kurang', 'pct_kelengkapan', 'total_mandatory', 'total_mandatory_ada',
  ...CHECKLIST_FIELDS.map(f => f.key),
]

async function mergeChecklistData(records: any[], docTypeHint?: 'pib' | 'cn') {
  if (!records || records.length === 0) return records
  const isPibRec = (r: any) => r.jenis_dokumen === 'PIB' || docTypeHint === 'pib'
  const isCnRec = (r: any) => r.jenis_dokumen === 'CN' || docTypeHint === 'cn'
  const pibIds = records.filter(isPibRec).map(r => r.id).filter(Boolean)
  const cnIds = records.filter(isCnRec).map(r => r.id).filter(Boolean)

  const checklistByPibId: Record<string, any> = {}
  const checklistByCnId: Record<string, any> = {}
  const chunkSize = 50

  const fetchChunked = async (idKey: 'pib_id' | 'cn_id', ids: any[], target: Record<string, any>) => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize)
      const { data } = await supabase.from('dokumen_checklist').select('*').in(idKey, chunkIds)
      if (data) data.forEach((c: any) => { target[c[idKey]] = c })
    }
  }

  if (pibIds.length > 0) await fetchChunked('pib_id', pibIds, checklistByPibId)
  if (cnIds.length > 0) await fetchChunked('cn_id', cnIds, checklistByCnId)

  records.forEach(r => {
    const c = isPibRec(r) ? checklistByPibId[r.id] : (isCnRec(r) ? checklistByCnId[r.id] : undefined)
    CHECKLIST_MERGE_FIELDS.forEach(key => {
      r[key] = c ? c[key] : null
    })
  })

  return records
}

// Badge persentase Doc Validation/Cost Validation Courier Audit (dipakai di dalam tombol Action
// tiap baris) -- SATU-SATUNYA tempat kalkulasinya, dipanggil dari 2 jalur fetch berbeda di
// fetchRecords (jalur normal PIB-only/CN-only, DAN jalur khusus tab Draft/archive yang gabung
// PIB+CN dari 2 query terpisah) supaya badge-nya selalu muncul di mana pun tombolnya dirender,
// bukan cuma di 1 jalur. Doc Validation dari tabel_checklist_validasi (persentase = match/
// (match+mismatch), SAMA PERSIS formula CourierValidasiPage.tsx). Cost Validation pakai
// computeLiveCostSummary() (src/utils/CostValidationHelpers.ts) yang sama dipakai
// CostValidationModal.tsx -- JANGAN duplikat formula di tempat lain.
async function fetchCourierValidationBadgePct(rows: any[]): Promise<{ docPctMap: Record<string, number>, costPctMap: Record<string, number> }> {
  const docPctMap: Record<string, number> = {};
  const costPctMap: Record<string, number> = {};
  if (!rows || rows.length === 0) return { docPctMap, costPctMap };

  const pibIds = rows.filter(r => r.jenis_dokumen === 'PIB').map(r => r.id).filter(Boolean);
  const cnIds = rows.filter(r => r.jenis_dokumen === 'CN').map(r => r.id).filter(Boolean);
  const chunkSize = 50;

  const fetchChecklistPct = async (idKey: 'pib_id' | 'cn_id', ids: any[], keyPrefix: string) => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: chk } = await supabase.from('tabel_checklist_validasi').select(`${idKey}, total_match, total_mismatch`).in(idKey, chunk);
      (chk || []).forEach((c: any) => {
        const checked = (c.total_match || 0) + (c.total_mismatch || 0);
        docPctMap[`${keyPrefix}${c[idKey]}`] = checked > 0 ? Math.round((c.total_match / checked) * 100) : 0;
      });
    }
  };
  const fetchCostPct = async (idKey: 'pib_id' | 'cn_id', ids: any[], keyPrefix: string, jenisDok: 'PIB' | 'CN') => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: cvRows } = await supabase.from('tabel_cost_validasi').select('*').in(idKey, chunk).order('created_at', { ascending: false });
      (cvRows || []).forEach((cv: any) => {
        const mapKey = `${keyPrefix}${cv[idKey]}`;
        if (costPctMap[mapKey] !== undefined) return; // sudah ada baris LEBIH BARU (order desc), skip
        costPctMap[mapKey] = computeLiveCostSummary(cv, jenisDok).pct;
      });
    }
  };

  await Promise.all([
    fetchChecklistPct('pib_id', pibIds, 'pib_'),
    fetchChecklistPct('cn_id', cnIds, 'cn_'),
    fetchCostPct('pib_id', pibIds, 'pib_', 'PIB'),
    fetchCostPct('cn_id', cnIds, 'cn_', 'CN'),
  ]);

  // FALLBACK live-calc utk Doc Validation -- tabel_checklist_validasi CUMA keisi kalau
  // seseorang pernah buka ValidasiModal (Doc Validation) dan klik Simpan (lihat ValidasiModal.tsx
  // ~baris 1001-1013, INSERT/UPDATE manual, BUKAN diisi n8n otomatis). Jadi mayoritas baris yang
  // belum pernah dibuka modalnya TIDAK punya baris di situ -- sebelumnya badge-nya jadi 0% terus
  // (bukan krn nilainya beneran 0%, tapi krn datanya belum ada), tidak sinkron sama sekali dgn
  // yang kelihatan begitu user buka modal Doc Validation-nya. Fix: baris yang belum ada di
  // docPctMap dihitung ulang live di sini, REPLIKA PERSIS fallback yang sama dipakai
  // CourierValidasiPage.tsx (SECTIONS/computeStatus/generateValues/calculatePibStats) --
  // JANGAN duplikat/tulis ulang formula ini lagi di tempat lain, lihat file itu kalau perlu diubah.
  const missingPibIds = pibIds.filter(id => docPctMap[`pib_${id}`] === undefined);
  const missingCnIds = cnIds.filter(id => docPctMap[`cn_${id}`] === undefined);
  if (missingPibIds.length > 0 || missingCnIds.length > 0) {
    let allDokumenValidasi: any[] = [];
    for (let i = 0; i < missingPibIds.length; i += chunkSize) {
      const chunk = missingPibIds.slice(i, i + chunkSize);
      const { data: dv } = await supabase.from('dokumen_validasi').select('pib_id, cn_id, jenis_dokumen, awb, data_validasi_raw').in('pib_id', chunk);
      if (dv) allDokumenValidasi = [...allDokumenValidasi, ...dv];
    }
    for (let i = 0; i < missingCnIds.length; i += chunkSize) {
      const chunk = missingCnIds.slice(i, i + chunkSize);
      const { data: dv } = await supabase.from('dokumen_validasi').select('pib_id, cn_id, jenis_dokumen, awb, data_validasi_raw').in('cn_id', chunk);
      if (dv) allDokumenValidasi = [...allDokumenValidasi, ...dv];
    }

    if (allDokumenValidasi.length > 0) {
      const { data: npwpData } = await supabase.from('tabel_npwp').select('*');
      const localNpwps = npwpData || [];

      allDokumenValidasi.forEach((r: any) => {
        let raw: any = {};
        try {
          raw = typeof r.data_validasi_raw === 'string' ? JSON.parse(r.data_validasi_raw) : (r.data_validasi_raw || {});
        } catch (e) {}

        const docType = r.jenis_dokumen || (r.pib_id ? 'PIB' : 'CN');
        const activeSections = SECTIONS.filter(section => {
          if (docType === 'CN' && section.id === 's_pib') return false;
          if (docType === 'CN' && section.id === 's_sptnp') return false;
          if (docType === 'PIB' && section.id === 's_cipl') return false;
          if (docType === 'PIB' && section.id === 's_sppbmcp') return false;
          if (docType === 'PIB' && section.id === 's_billing') return false;
          return true;
        });

        const values = generateValues(raw, r.awb || '', localNpwps);
        let match = 0, mismatch = 0;
        activeSections.forEach(s => s.rows.forEach(row => {
          const v = values[row.id] || { src: '', cmp: '' };
          const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field, raw?.is_po_non_imi);
          if (st === 'match') match++;
          else if (st === 'mismatch') mismatch++;
        }));

        const pibStats = calculatePibStats(raw, docType);
        match += pibStats.match;
        mismatch += pibStats.mismatch;

        const checked = match + mismatch;
        const pct = checked > 0 ? Math.round((match / checked) * 100) : 0;
        if (r.pib_id) docPctMap[`pib_${r.pib_id}`] = pct;
        if (r.cn_id) docPctMap[`cn_${r.cn_id}`] = pct;
      });
    }
  }

  return { docPctMap, costPctMap };
}

// `embedded` (2026-09-30) -- dirender sbg tab "Checklist" di dalam CourierValidationWindow (tanpa
// overlay/judul sendiri, Save Checklist TIDAK menutup jendela). `onPctChange` melaporkan % live
// ke label tab (null = belum ada baris dokumen_checklist & belum ada perubahan).
function ChecklistModal({ record, tab, onClose, onSaved, canEdit = true, embedded = false, onPctChange }: { record: any, tab: any, onClose: () => void, onSaved?: () => void, canEdit?: boolean, embedded?: boolean, onPctChange?: (pct: number | null) => void }) {
  const [form, setForm] = useState<Record<string, boolean>>({})
  const [existingId, setExistingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Catatan Checklist -- kolom BARU dokumen_checklist.catatan_checklist (sql/028). Selama SQL
  // belum dijalankan, `hasCatatanCol` false: textarea nonaktif & kolom TIDAK ikut payload.
  const [catatan, setCatatan] = useState('')
  const [hasCatatanCol, setHasCatatanCol] = useState(false)
  // Snapshot nilai tersimpan terakhir -- dipakai tombol Cancel mode embedded (kembalikan isian
  // yang belum di-Save, bukan menutup jendela).
  const [savedForm, setSavedForm] = useState<Record<string, boolean>>({})
  const [savedCatatan, setSavedCatatan] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)

  // Upload dokumen susulan (2026-09) -- tombol "Upload Additional Doc" di footer modal ini,
  // kirim ulang dokumen yang belum terupload saat upload pertama di halaman Upload Courier,
  // dikunci ke AWB record ini (lihat CourierUploadSusulanModal.tsx). Status job-nya ditampilkan
  // inline di sini, REPLIKA PERSIS pola polling per-job BunkerKelengkapanModal.tsx (bukan cuma
  // mengandalkan widget ProcessingQueue generik yang tidak dirender di halaman Audit Courier).
  const [showUploadSusulan, setShowUploadSusulan] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeJobStatus, setActiveJobStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | 'SENT' | null>(null)
  const [activeJobError, setActiveJobError] = useState<string | null>(null)

  const isPib = record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || tab.id === 'pib';
  const docType = isPib ? 'pib' : 'cn';

  // Refetch checklist boolean fields dari dokumen_checklist setelah job upload susulan SUCCESS --
  // supaya centang di modal ini ikut update tanpa perlu tutup-buka modal manual. TIDAK
  // mempengaruhi/menimpa pending toggle checkbox yang belum di-Save (kalau ada), krn cuma
  // di-trigger dari event job SUCCESS, bukan dipanggil terus-menerus.
  const refetchChecklistAfterUpload = useCallback(async () => {
    try {
      const { data } = await supabase.from('dokumen_checklist').select('*').eq(isPib ? 'pib_id' : 'cn_id', record.id).maybeSingle()
      if (data) {
        const updated: Record<string, boolean> = {}
        CHECKLIST_FIELDS.forEach(f => { updated[f.key] = !!data[f.key] })
        setForm(updated)
        setSavedForm(updated)
        setExistingId(data.id)
      }
    } catch (e) {
      // Diamkan -- kalau gagal refresh otomatis, user masih bisa tutup & buka lagi modal ini manual.
    }
  }, [record.id, isPib])

  useEffect(() => {
    if (!activeJobId || activeJobStatus !== 'PENDING') return
    const iv = setInterval(async () => {
      const { data } = await supabase.from('tabel_processing_queue').select('*').eq('id', activeJobId).maybeSingle()
      if (data) {
        if (data.status === 'SUCCESS') {
          setActiveJobStatus('SUCCESS')
          refetchChecklistAfterUpload()
          onSaved?.()
        } else if (data.status === 'FAILED') {
          setActiveJobStatus('FAILED')
          setActiveJobError(data.error_message || 'Failed to process document.')
        }
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [activeJobId, activeJobStatus, refetchChecklistAfterUpload, onSaved])

  const handleUploadJobStarted = (jobId: string) => {
    setActiveJobId(jobId)
    setActiveJobStatus('PENDING')
    setActiveJobError(null)
  }
  const handleUploadSentNoJob = () => {
    // n8n tidak mengembalikan job_id -- tidak bisa di-poll per-job spesifik, cukup kasih tau
    // user dokumennya sudah terkirim & minta buka ulang checklist ini nanti utk lihat hasilnya.
    setActiveJobId('sent-no-job')
    setActiveJobStatus('SENT')
    setActiveJobError(null)
  }

  useEffect(() => {
    async function loadData() {
      // Init form from record view directly so it doesn't flicker
      const initForm: Record<string, boolean> = {}
      CHECKLIST_FIELDS.forEach(f => {
        initForm[f.key] = !!record[f.key]
      })
      setForm(initForm)
      setSavedForm(initForm)

      try {
        const idCol = isPib ? 'pib_id' : 'cn_id'
        // Coba sekalian ambil catatan_checklist; kalau kolomnya belum ada (sql/028 belum
        // dijalankan) PostgREST error -> ulang tanpa kolom itu & tandai hasCatatanCol=false.
        let colExists = true
        let res: any = await supabase.from('dokumen_checklist').select('id, catatan_checklist').eq(idCol, record.id).maybeSingle()
        if (res.error && /catatan_checklist/i.test(res.error.message || '')) {
          colExists = false
          res = await supabase.from('dokumen_checklist').select('id').eq(idCol, record.id).maybeSingle()
        }
        const { data, error } = res

        if (error) throw error
        setHasCatatanCol(colExists)

        if (data) {
          setExistingId(data.id)
          const c = colExists ? (data.catatan_checklist || '') : ''
          setCatatan(c)
          setSavedCatatan(c)
        }
      } catch (e: any) {
        setErr(e.message || 'Failed to load checklist id.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [record, tab.id, isPib])

  const toggle = (key: string) => setForm(p => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload: Record<string, any> = { ...form }
      if (isPib) {
        payload.pib_id = record.id;
        payload.jenis_dokumen = 'PIB';
      } else {
        payload.cn_id = record.id;
        payload.jenis_dokumen = 'CN';
      }
      payload.no_aju = record.no_aju || null
      payload.awb = record.awb || null
      payload.po_ori = record.po_ori || null
      payload.vendor = record.vendor || null
      
      const mandatoryFields = CHECKLIST_FIELDS.filter(f => f.mand.includes(docType))
      const total_mandatory = mandatoryFields.length
      const total_mandatory_ada = mandatoryFields.filter(f => form[f.key]).length
      
      payload.total_mandatory = total_mandatory
      payload.total_mandatory_ada = total_mandatory_ada
      payload.pct_kelengkapan = total_mandatory > 0 ? Math.round((total_mandatory_ada / total_mandatory) * 100) : 100;
      payload.status_kelengkapan = total_mandatory_ada === total_mandatory ? 'LENGKAP' : 'TIDAK LENGKAP'
      
      const dokumen_kurang = mandatoryFields.filter(f => !form[f.key]).map(f => f.label).join(', ')
      payload.dokumen_kurang = dokumen_kurang || '-'
      if (hasCatatanCol) payload.catatan_checklist = catatan.trim() ? catatan : null

      if (existingId) {
        const { error } = await supabase.from('dokumen_checklist').update(payload).eq('id', existingId)
        if (error) throw error
      } else {
        // `.select('id')` -- mode embedded jendela tetap terbuka setelah Save, jadi id baris
        // baru WAJIB disimpan supaya Save berikutnya jadi UPDATE (bukan insert baris kembar).
        const { data: inserted, error } = await supabase.from('dokumen_checklist').insert(payload).select('id').maybeSingle()
        if (error) throw error
        if (inserted?.id) setExistingId(inserted.id)
      }

      if (onSaved) onSaved()
      if (embedded) {
        setSavedForm(form)
        setSavedCatatan(catatan)
        setSavedMsg(true)
        setTimeout(() => setSavedMsg(false), 3000)
      } else {
        onClose()
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to save checklist.')
    } finally {
      setSaving(false)
    }
  }

  // Calculate live values
  const applicableFields = CHECKLIST_FIELDS.filter(f => f.scope.includes(docType));
  const mandatoryFields = applicableFields.filter(f => f.mand.includes(docType));
  const optionalFields = applicableFields.filter(f => !f.mand.includes(docType));

  const mandatoryCount = mandatoryFields.length;
  const checkedMandatoryCount = mandatoryFields.filter(f => form[f.key]).length;
  const pct = mandatoryCount > 0 ? Math.round((checkedMandatoryCount / mandatoryCount) * 100) : 100;
  const status = pct === 100 ? 'LENGKAP' : 'BELUM LENGKAP';
  const missingDocs = mandatoryFields.filter(f => !form[f.key]).map(f => f.label);
  const isDirty = catatan !== savedCatatan || CHECKLIST_FIELDS.some(f => !!form[f.key] !== !!savedForm[f.key]);

  // Label tab jendela Validation: null (titik abu) kalau belum pernah ada baris checklist
  // tersimpan & belum ada perubahan -- sama arti dgn badge baris (pct_kelengkapan NULL).
  useEffect(() => {
    if (!onPctChange || loading) return
    onPctChange(existingId == null && !isDirty ? null : pct)
  }, [onPctChange, loading, existingId, isDirty, pct])

  const mapStatusColor: Record<string, string> = {
    LENGKAP: 'bg-emerald-100 text-emerald-700',
    'BELUM LENGKAP': 'bg-amber-100 text-amber-700',
    'TIDAK LENGKAP': 'bg-red-100 text-red-700',
  }

  if (loading) {
    if (embedded) return <LoadingState />
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <LoadingSpinner className="mx-auto mb-4" />
           <p className="text-[#5A305A] font-medium">Loading data...</p>
        </div>
      </div>
    );
  }

  const revertUnsaved = () => {
    setForm(savedForm)
    setCatatan(savedCatatan)
    setErr(null)
  }

  // Banner status job "Upload Additional Doc" -- dipakai kedua mode (embedded & standalone).
  const jobBanners = (
    <>
      {activeJobStatus === 'PENDING' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
          <p className="text-xs font-semibold text-amber-800">Additional document being processed by AI...</p>
        </div>
      )}
      {activeJobStatus === 'SUCCESS' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2.5">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-800">Additional document merged into this record successfully.</p>
        </div>
      )}
      {activeJobStatus === 'FAILED' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-start gap-2.5">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-rose-800">Failed to process the additional document.</p>
            <p className="text-[11px] text-rose-700 mt-0.5">{activeJobError}</p>
          </div>
        </div>
      )}
      {activeJobStatus === 'SENT' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-2.5">
          <UploadCloud size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-blue-800">Document sent to the processing queue. Reopen this checklist in a moment to see the update.</p>
        </div>
      )}
    </>
  )

  const catatanInput = canEdit ? (
    <textarea
      value={catatan}
      onChange={e => setCatatan(e.target.value)}
      disabled={!hasCatatanCol}
      rows={embedded ? 4 : 3}
      placeholder={hasCatatanCol ? 'No notes yet.' : 'Notes are unavailable until database migration 028 is applied.'}
      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-purple-200 resize-y disabled:bg-slate-50 disabled:cursor-not-allowed [overflow-wrap:anywhere]"
    />
  ) : (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-[#5A305A] whitespace-pre-wrap [overflow-wrap:anywhere]">
      {catatan || <span className="italic text-[#5A305A]/50">No notes yet.</span>}
    </div>
  )

  const uploadSusulanModal = showUploadSusulan && (
    <CourierUploadSusulanModal
      awbHint={record.awb || undefined}
      onClose={() => setShowUploadSusulan(false)}
      onJobStarted={handleUploadJobStarted}
      onSentNoJob={handleUploadSentNoJob}
    />
  )

  // ── Mode embedded: tab "Checklist" jendela Validation -- lebar penuh, toolbar tab di atas
  //    (status + tombol), isi 2 kolom (daftar dokumen | dokumen kurang + catatan). ──
  if (embedded) {
    const optionalChecked = optionalFields.filter(f => form[f.key]).length
    const docTile = (field: typeof CHECKLIST_FIELDS[number]) => {
      const val = !!form[field.key]
      return (
        <button
          type="button"
          key={field.key}
          onClick={canEdit ? () => toggle(field.key) : undefined}
          disabled={!canEdit}
          className={`w-full min-w-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
            val ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'
          } ${canEdit ? (val ? 'hover:border-emerald-300 cursor-pointer' : 'hover:border-[#5A305A]/30 hover:bg-[#5A305A]/[0.03] cursor-pointer') : 'cursor-default'}`}
        >
          <span className={`text-[13px] font-medium [overflow-wrap:anywhere] ${val ? 'text-emerald-900' : 'text-[#5A305A]'}`}>{field.label}</span>
          {val
            ? <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />
            : <Circle size={17} className="text-slate-300 shrink-0" />}
        </button>
      )
    }
    return (
      <div className="flex flex-col flex-1 min-h-0 cvw-fill">
        <div className={VW_TOOLBAR}>
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${mapStatusColor[status] || 'bg-slate-100 text-[#5A305A]'}`}>
              {getStatusLabel(status)}
            </span>
            <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${vwPctBar(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-sm font-bold ${vwPctText(pct)}`}>{pct}%</span>
            <span className="text-xs text-slate-500 whitespace-nowrap">{checkedMandatoryCount}/{mandatoryCount} required</span>
          </div>
          <div className="ml-auto flex items-center gap-2 print:hidden">
            {savedMsg && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={14} /> Checklist saved
              </span>
            )}
            {canEdit ? (
              <>
                <button onClick={() => setShowUploadSusulan(true)} className={VW_BTN_SECONDARY}>
                  <UploadCloud size={14} /> Upload Additional Doc
                </button>
                <button onClick={revertUnsaved} disabled={!isDirty} title="Discard unsaved checklist changes" className={VW_BTN_SECONDARY}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className={VW_BTN_PRIMARY}>
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Checklist'}
                </button>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">View only</span>
            )}
          </div>
        </div>

        <div className={VW_BODY}>
          {jobBanners}
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-4">⚠️ {err}</div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <div className="space-y-4 min-w-0">
              <section className={`${VW_CARD} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={VW_CARD_TITLE}>Required Documents</h3>
                  <span className="text-[11px] font-semibold text-slate-500">{checkedMandatoryCount}/{mandatoryCount}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {mandatoryFields.map(docTile)}
                </div>
              </section>
              {optionalFields.length > 0 && (
                <section className={`${VW_CARD} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={VW_CARD_TITLE}>Optional Documents</h3>
                    <span className="text-[11px] font-semibold text-slate-500">{optionalChecked}/{optionalFields.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {optionalFields.map(docTile)}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-4 min-w-0">
              <section className={`${VW_CARD} p-4`}>
                <h3 className={`${VW_CARD_TITLE} mb-2.5`}>Missing Documents</h3>
                {missingDocs.length > 0 ? (
                  <ul className="space-y-1.5">
                    {missingDocs.map((d: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-red-700">
                        <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                        <span className="[overflow-wrap:anywhere]">{d}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-700">
                    <CheckCircle2 size={15} /> All required documents are complete.
                  </p>
                )}
              </section>
              <section className={`${VW_CARD} p-4`}>
                <h3 className={`${VW_CARD_TITLE} mb-2.5`}>Catatan Checklist</h3>
                {catatanInput}
              </section>
            </div>
          </div>
        </div>
        {uploadSusulanModal}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-[#5A305A]">Document Completeness Checklist</h2>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {jobBanners}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-[#5A305A] mb-1">Completeness Status</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${mapStatusColor[status] || 'bg-slate-100 text-[#5A305A]'}`}>
                  {getStatusLabel(status)}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#5A305A] mb-1">Percentage</p>
                <span className="text-2xl font-bold text-[#5A305A]">{pct}%</span>
              </div>
            </div>
            
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-4">
              <div 
                className={`h-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }}
              ></div>
            </div>
            {missingDocs.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs font-bold text-red-800 mb-2">Missing Documents:</p>
                <ul className="list-disc pl-4 text-xs text-red-700">
                  {missingDocs.map((d: string, i: number) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-full mb-2">
              <h3 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Required Documents</h3>
            </div>
            {mandatoryFields.map(field => {
              const val = form[field.key];
              return (
                <div key={field.key} onClick={canEdit ? () => toggle(field.key) : undefined} className={`flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors group ${canEdit ? 'hover:border-slate-300 cursor-pointer' : ''}`}>
                  <span className="text-sm font-medium text-[#5A305A]">{field.label}</span>
                  {val ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : (
                    <span className="text-xs text-[#5A305A] group-hover:text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                  )}
                </div>
              );
            })}

            {optionalFields.length > 0 && (
              <>
                <div className="col-span-full mb-2 mt-6">
                  <h3 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Optional Documents</h3>
                </div>
                {optionalFields.map(field => {
                  const val = form[field.key];
                  return (
                    <div key={field.key} onClick={canEdit ? () => toggle(field.key) : undefined} className={`flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors group ${canEdit ? 'hover:border-slate-300 cursor-pointer' : ''}`}>
                      <span className="text-sm font-medium text-[#5A305A] flex items-center gap-2">
                        {field.label}
                        <span className="text-[10px] bg-slate-100 text-[#5A305A] px-1.5 py-0.5 rounded font-semibold">(Optional)</span>
                      </span>
                      {val ? (
                        <CheckCircle2 size={20} className="text-emerald-500" />
                      ) : (
                        <span className="text-xs text-[#5A305A] group-hover:text-[#5A305A] font-medium bg-slate-100 px-2 py-0.5 rounded-full">—</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Catatan Checklist -- kolom dokumen_checklist.catatan_checklist (sql/028), ikut
              tersimpan lewat tombol Save Checklist. */}
          <div className="mt-6">
            <label className="block text-xs font-bold text-[#5A305A] mb-1.5">Catatan Checklist</label>
            {catatanInput}
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mt-5">
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100 bg-slate-50">
          {canEdit && (
            <button
              onClick={() => setShowUploadSusulan(true)}
              className="shrink-0 flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-[#5A305A]/30 bg-white text-[#5A305A] font-semibold text-sm hover:bg-[#5A305A]/5 transition-all"
            >
              <UploadCloud size={15} /> Upload Additional Doc
            </button>
          )}
          {canEdit ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : 'Save Checklist'}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {uploadSusulanModal}
    </div>
  )
}
const DeleteModal: React.FC<{ record: any | any[], tab: any, onClose: () => void, onSaved: () => void, customMessage?: string, activeMainTab?: string, activeSubTab?: string, courierAuditType?: string }> = ({ record, tab, onClose, onSaved, customMessage, activeMainTab, activeSubTab, courierAuditType }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const isBulk = Array.isArray(record);
  const records = isBulk ? record : [record];

  const handleDelete = async () => {
    setLoading(true);
    setErr('');
    try {
      const ids = records.map((r: any) => r.id).filter(Boolean);
      
      if (ids.length === 0) {
        throw new Error('No valid data or ID to delete.');
      }
      
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
        for (const rec of records) {
          if (!rec.id) continue;
          const isPib = rec.jenis_dokumen === 'PIB' || rec.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib');
          const rpcName = isPib ? 'fn_delete_pib' : 'fn_delete_cn';
          const { data, error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: rec.id });
          if (error) throw error;
          if (data && data.error) throw new Error(data.error);
        }
      } else {
        let tableToModify = tab.realTable || tab.table;
        if (!tableToModify) {
          if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
             tableToModify = (courierAuditType === 'pib' || (records[0] && records[0].jenis_dokumen === 'PIB')) ? 'tabel_audit_pib' : 'tabel_audit_cn';
          }
        }
        
        const chunkSize = 15;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunkIds = ids.slice(i, i + chunkSize);
          
          if (tableToModify === 'tabel_audit_seaair') {
            await supabase.from('tabel_processing_queue').delete().in('seaair_id', chunkIds);
            await supabase.from('dokumen_checklist_seaair').delete().in('seaair_id', chunkIds);
            await supabase.from('dokumen_validasi_seaair').delete().in('seaair_id', chunkIds);
            await supabase.from('rekapan_seaair').delete().in('seaair_id', chunkIds);
          }
          
          const { error } = await supabase.from(tableToModify).delete().in('id', chunkIds);
          if (error) throw error;
        }
      }
      
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to delete data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-[#5A305A]">Confirm Delete</h3>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-[#5A305A] mb-3">{customMessage ? customMessage : `Are you sure you want to delete ${isBulk ? `${records.length} records` : 'this record'}? This action cannot be undone.`}</p>
          {!isBulk && (
            <>
              {record.no_pib && <p className="text-xs font-bold text-[#5A305A] mb-1">No. PIB: {record.no_pib}</p>}
              {record.awb && <p className="text-xs font-bold text-[#5A305A]">AWB: {record.awb}</p>}
            </>
          )}
          {err && <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{err}</div>}
        </div>
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 transition-all">{loading ? 'Processing...' : 'Yes, Delete'}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal Customize View (pilih kolom yg tampil di tabel) ───────────────────
const CustomizeViewModal: React.FC<{
  title: string;
  allCols: { key: string; label: string }[];
  hiddenKeys: Set<string>;
  onCancel: () => void;
  onSave: (newHiddenKeys: Set<string>) => void;
}> = ({ title, allCols, hiddenKeys, onCancel, onSave }) => {
  const [pendingHidden, setPendingHidden] = useState<Set<string>>(new Set(hiddenKeys));
  const [search, setSearch] = useState('');

  const filteredCols = allCols.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));

  const toggle = (key: string) => {
    setPendingHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#5A305A] flex items-center gap-2"><SlidersHorizontal size={17} /> {title}</h3>
            <p className="text-xs text-[#5A305A]/70 mt-0.5">Choose which columns are shown in the table.</p>
          </div>
          <button onClick={onCancel} className="text-[#5A305A] hover:text-[#5A305A] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <div className="relative">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A305A]/50" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search columns..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-[#5A305A] focus:outline-none focus:border-[#5A305A]/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-[200px]">
          {filteredCols.length === 0 ? (
            <p className="text-xs text-[#5A305A]/60 text-center py-6">No matching columns.</p>
          ) : (
            <ul className="space-y-1">
              {filteredCols.map(c => (
                <li key={c.key}>
                  <label className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!pendingHidden.has(c.key)}
                      onChange={() => toggle(c.key)}
                      className="w-4 h-4 rounded border-slate-300 text-[#5A305A] focus:ring-[#5A305A]/40"
                    />
                    <span className="text-sm text-[#5A305A]">{c.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-5 border-t border-slate-100 shrink-0">
          <button
            onClick={() => setPendingHidden(new Set())}
            className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-xs hover:bg-slate-50 transition-all"
          >
            <RotateCcw size={13} /> Reset to Default
          </button>
          <button
            onClick={() => setPendingHidden(new Set(allCols.map(c => c.key)))}
            className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-xs hover:bg-slate-50 transition-all"
          >
            <SquareX size={13} /> Uncheck All
          </button>
          <div className="flex-1" />
          <button onClick={onCancel} className="py-2.5 px-4 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={() => onSave(pendingHidden)} className="py-2.5 px-5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-bold text-sm transition-all">Save</button>
        </div>
      </div>
    </div>
  );
};

// ─── Baris Tabel Universal ───────────────────────────────

const getCellData = (c: any, rec: any, index: number) => {
  let content: any = rec[c.key] || '—';

  // Sembunyikan kolom khusus LCL
  if (rec.shipment_type === 'LCL') {
    const hiddenForLcl = ['lift_off_vendor', 'lift_off_biaya', 'lift_off_split', 'handling_vendor', 'handling_biaya', 'handling_split'];
    if (hiddenForLcl.includes(c.key)) {
      return { content: '—', alignClass: 'text-center text-[#5A305A] font-mono' };
    }
  }
  let alignClass = 'text-left font-mono text-[#5A305A]';

  if (c.type === 'index') {
    content = index + 1;
    alignClass = 'text-center font-bold text-[#5A305A] whitespace-nowrap';
  } else if (c.key === 'cek_selisih') {
    const val = Number(rec[c.key]);
    if (!isNaN(val) && (val >= 4000000 || val <= -4000000)) {
      content = <span className="bg-red-100 text-red-700 font-bold px-2 py-1 rounded inline-block">{fmt(rec[c.key])}</span>;
    } else {
      content = fmt(rec[c.key]);
    }
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'num') {
    content = fmt(rec[c.key]);
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'pct') {
    content = fmtPct(rec[c.key]);
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'pct_dynamic') {
    const match = rec.total_lulus || 0;
    const mismatch = rec.total_gagal || 0;
    const checked = match + mismatch;
    content = checked === 0 ? '0%' : Math.round((match / checked) * 100) + '%';
    alignClass = 'text-center font-bold text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'date') {
    content = fmtDate(rec[c.key]);
    alignClass = 'text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'datetime') {
    content = fmtDateTime(rec[c.key]);
    alignClass = 'text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'json') {
    content = rec[c.key] ? JSON.stringify(rec[c.key], null, 2) : '—';
    alignClass = 'text-left font-mono text-[#5A305A] whitespace-pre max-w-xs overflow-hidden text-ellipsis';
  } else if (c.type === 'bool') {
    content = rec[c.key] === true ? '✅ PASS' : rec[c.key] === false ? '❌ FAIL' : '—';
    alignClass = 'text-center font-bold whitespace-nowrap text-[10px]';
  } else if (c.type === 'status') {
    content = <StatusBadge status={rec[c.key]} />;
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'badge_via') {
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        rec[c.key] === 'SEA' ? 'bg-sky-100 text-sky-700' : 
        rec[c.key] === 'AIR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-[#5A305A]'
      }`}>
        {rec[c.key] || '—'}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'badge_shipment') {
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        rec[c.key] === 'LCL' ? 'bg-cyan-100 text-cyan-700' : 
        rec[c.key] === 'FCL' ? 'bg-blue-100 text-blue-700' : 
        rec[c.key] === 'AIR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-[#5A305A]'
      }`}>
        {rec[c.key] || '—'}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'num_dash_null' || c.type === 'num_dash_if_null') {
    content = rec[c.key] === null || rec[c.key] === 0 ? '—' : fmt(rec[c.key]);
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'num_dash_null_2dec') {
    content = rec[c.key] === null || rec[c.key] === '' ? '—' : Number(rec[c.key]).toFixed(2);
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'date_dash_if_null') {
    content = rec[c.key] ? fmtDate(rec[c.key]) : '—';
    alignClass = 'text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'dash_if_null') {
    content = rec[c.key] || '—';
    alignClass = 'text-[#5A305A]';
  } else if (c.type === 'num_bold') {
    content = rec[c.key] ? <span className="font-bold">{fmt(rec[c.key])}</span> : '—';
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'num_highlight') {
    content = rec[c.key] ? <span className="font-bold bg-amber-100 text-amber-900 px-2 py-1 rounded">{fmt(rec[c.key])}</span> : '—';
    alignClass = 'text-right font-mono text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'date_badge_if_null') {
    content = rec[c.key] 
      ? fmtDate(rec[c.key]) 
      : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Not Submitted</span>;
    alignClass = 'text-[#5A305A] whitespace-nowrap';
  } else if (c.type === 'invType') {
    // Badge warna per jenis invoice (2026-09, permintaan user): Freight = coral, Duty = kuning
    // gelap, Credit Note (Duty/Freight) = ungu brand. Dicek via .toUpperCase()/.includes() biar
    // tahan variasi casing dari data ("Credit Note Duty" vs "CREDIT NOTE DUTY", dst).
    const invTypeVal = String(rec[c.key] ?? '').toUpperCase();
    const invTypeBadgeClass = invTypeVal.includes('CREDIT NOTE')
      ? 'bg-[#5A305A] text-white'
      : invTypeVal === 'DUTY'
      ? 'bg-[#F5E28F] text-[#5A305A]'
      : invTypeVal === 'FREIGHT'
      ? 'bg-[#F58C77] text-white'
      : 'bg-sky-100 text-sky-700';
    content = (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${invTypeBadgeClass}`}>
        {rec[c.key]}
      </span>
    );
    alignClass = 'whitespace-nowrap';
  } else if (c.type === 'no_aju_format') {
    let val = rec[c.key];
    val = formatNoAju(val);
    content = <span className="block max-w-[300px] whitespace-normal break-words leading-relaxed">{val || '—'}</span>;
  } else if (c.type === 'awb_strip_carrier') {
    // KHUSUS Courier Rekapan (COURIER_COLS) -- prefix carrier "DHL NO."/"FEDEX No." dibuang dari
    // tampilan, cukup nomornya saja. SENGAJA beda dari Audit Courier (PIB_COLS/CN_COLS) yang
    // kolom `awb`-nya TANPA `type` ini (masuk cabang `!c.type` di bawah) supaya tampil apa
    // adanya dari database -- user eksplisit minta 2 halaman ini beda perilaku (2026-09):
    // Audit = raw, Rekapan = di-strip. JANGAN disatukan lagi jadi 1 perilaku.
    let val = rec[c.key];
    if (typeof val === 'string') val = val.replace(/^(DHL|FEDEX)\s*NO\.?\s*:?\s*/i, '').trim();
    content = <span className="block max-w-[300px] whitespace-normal break-words leading-relaxed">{val || '—'}</span>;
  } else if (!c.type) {
    let val = rec[c.key];
    if (c.key === 'hs_code' && typeof val === 'string') {
      const parts = val.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
      val = Array.from(new Set(parts)).join(', ');
    } else if (c.key === 'no_aju') {
      val = formatNoAju(val);
    } else if (c.key === 'ppjk' && typeof val === 'string') {
      // Gemini extract PPJK "OWN" jadi "OWN <nama>" (mis. "OWN DHL") -- prefix "OWN"-nya cuma
      // metadata internal, tidak perlu ditampilkan ke user, cukup nama PPJK-nya saja.
      val = val.replace(/^OWN\s+/i, '').trim();
    }
    // Kolom 'awb' di Audit Courier (PIB_COLS/CN_COLS, masuk cabang `!c.type` ini) SENGAJA
    // ditampilkan APA ADANYA dari database (2026-09) -- lihat cabang `awb_strip_carrier` di atas
    // utk perilaku KHUSUS Courier Rekapan yang sebaliknya (prefix carrier di-strip). JANGAN
    // tambahkan replace/strip apapun ke kolom `awb` di cabang `!c.type` ini.
    content = <span className="block max-w-[300px] whitespace-normal break-words leading-relaxed">{val || '—'}</span>;
  }
  
  return { content, alignClass };
};


const isInlineEditable = (colKey: string) => {
   // status_kelengkapan/dokumen_kurang/pct_kelengkapan di-merge manual dari tabel dokumen_checklist
   // (lihat mergeChecklistData), bukan kolom asli tabel_audit_pib/tabel_audit_cn -- kalau diedit di
   // sini, penyimpanannya akan gagal karena kolom itu tidak ada di tabel tujuan.
   return !['id', 'created_at', 'seaair_id', 'po_detail', 'index', 'cek_selisih', 'balance', 'asuransi', 'action', 'emkl_vendor', 'status_kelengkapan', 'dokumen_kurang', 'pct_kelengkapan'].includes(colKey);
};

const SeaAirAuditRowGroup: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void,
  onChecklist?: (r: any) => void,
  onDelete?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, onDelete, onInlineSaveRow }) => {
  const repeatingCols = ['po_ori', 'vendor_inv_no', 'po_harga_detail'];

  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // PO Price Detail (2026-09, permintaan user) -- SATU-SATUNYA dari 3 repeatingCols yang bisa
  // diedit manual di mode edit (po_ori/vendor_inv_no TETAP read-only, tidak diminta). Karena
  // `po_harga_detail` 1 kolom DB gabungan banyak nilai (dipisah "+"), tiap nilai split diedit
  // TERPISAH per baris (array `editHargaSplits`, index selaras `splittedData`), baru digabung
  // balik jadi 1 string " + "-separated saat Save.
  const [editHargaSplits, setEditHargaSplits] = useState<string[]>([]);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setEditHargaSplits(splittedData.map(d => d.harga));
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);

    const updatedForm = { ...editForm, po_harga_detail: editHargaSplits.map(v => (v ?? '').trim()).filter(Boolean).join(' + ') };

    // Only send changed fields
    const changes: any = {};
    Object.keys(updatedForm).forEach(k => {
      if (updatedForm[k] !== rec[k]) {
        changes[k] = updatedForm[k];
      }
    });

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }

    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setEditForm(updatedForm);
      setIsEditing(false);
    }
  };

  let splittedData: { po: string, inv: string, harga: string }[] = [];
  const pos = typeof rec.po_ori === 'string' ? rec.po_ori.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const invs = typeof rec.vendor_inv_no === 'string' ? rec.vendor_inv_no.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const hargas = typeof rec.po_harga_detail === 'string' ? rec.po_harga_detail.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];

  const maxLen = Math.max(pos.length, invs.length, hargas.length);
  for (let i = 0; i < maxLen; i++) {
    splittedData.push({
      po: pos[i] || (pos.length === 1 ? pos[0] : ''),
      inv: invs[i] || (invs.length === 1 ? invs[0] : ''),
      harga: hargas[i] || (hargas.length === 1 ? hargas[0] : '')
    });
  }

  if (splittedData.length === 0) splittedData = [{ po: '', inv: '', harga: '' }];
  const rowCount = splittedData.length;
  const displayData = isExpanded ? splittedData : [splittedData[0]];

  return (
    <>
      {displayData.map((data, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : 'hover:bg-blue-50/30'}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) { 
                return null;
              }
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_ori' || c.key === 'vendor_inv_no' || c.key === 'po_harga_detail') {
                const val = c.key === 'po_ori' ? data.po : c.key === 'vendor_inv_no' ? data.inv : data.harga;
                const isHargaEditable = isEditing && c.key === 'po_harga_detail';
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    {isHargaEditable ? (
                      <input
                        type="text"
                        value={editHargaSplits[i] ?? val ?? ''}
                        onChange={e => setEditHargaSplits(prev => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })}
                        className="flex-1 min-w-0 text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] font-mono"
                      />
                    ) : (
                      <span>{val || '—'}</span>
                    )}
                    {isFirst && rowCount > 1 && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle Data Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} Data`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-[#5A305A]';
              }
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">{getStatusLabel('LENGKAP')}</option>
                      <option value="ARCHIVED">{getStatusLabel('ARCHIVED')}</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="w-[80px] bg-slate-200 text-[#5A305A] hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  ) : rec.status === 'LENGKAP' ? (
                    <span className="text-[10px] text-[#5A305A] font-semibold bg-slate-100 px-2.5 py-1.5 rounded-full whitespace-nowrap">
                      ✓ Selesai
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowActions(!showActions)}
                        className={`w-[80px] flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                          showActions
                            ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                            : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                        }`}
                      >
                        Action
                        <ChevronDown size={13} className={`transition-transform duration-200 ${showActions ? 'rotate-180' : ''}`} />
                      </button>
                      {showActions && (
                        <div className="flex flex-col gap-1.5 items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                          {onEdit && (
                            <button
                              onClick={handleStartEdit}
                              className="w-[80px] bg-white border border-slate-200 text-[#5A305A] hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                            >
                              ✏️ Edit
                            </button>
                          )}
                          {onChecklist && (
                            <button
                              onClick={() => onChecklist(rec)}
                              className={`w-[80px] border text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm ${
                                rec.status_kelengkapan === 'LENGKAP'
                                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              ✓ Checklist
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(rec)}
                              className="w-[80px] bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-red-100"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};


// Drag & Drop Reorder -- header kolom (2026-09). Komponen terpisah (bukan inline di dalam
// `.map()`) krn butuh panggil `useSortable()` per kolom -- hooks TIDAK boleh dipanggil di dalam
// callback `.map()` biasa (Rules of Hooks). `draggable` (kolom data & `reorderMode` aktif) HANYA
// mempengaruhi apakah drag handle+listener dipasang -- klik-utk-sort (perilaku existing) tetap
// dipakai HANYA saat TIDAK reorderMode (2 mode ini sengaja saling eksklusif, cegah drag & sort
// klik ketuker/konflik di gesture yang sama).
const SortableColumnHeader: React.FC<{
  col: any;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onHeaderClick: () => void;
  reorderMode: boolean;
}> = ({ col, sortColumn, sortDirection, onHeaderClick, reorderMode }) => {
  const isComputed = col.key.startsWith('breakdown_') || col.key === 'cek_selisih';
  const draggable = reorderMode && col.type !== 'index';
  const sortable = useSortable({ id: col.key, disabled: !draggable });
  const style: React.CSSProperties = draggable ? {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition || 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: sortable.isDragging ? 0.4 : 1,
  } : {};
  return (
    <th
      ref={draggable ? sortable.setNodeRef : undefined}
      style={style}
      onClick={() => { if (!reorderMode && !isComputed && col.type !== 'index') onHeaderClick(); }}
      className={`px-4 py-3 text-[10px] font-bold text-[#5A305A] uppercase tracking-wider whitespace-nowrap bg-slate-50 ${
        col.type === 'index' ? 'text-center' : (col.type === 'num' || col.type === 'pct') ? 'text-right' : 'text-left'
      } ${(!isComputed && col.type !== 'index' && !reorderMode) ? 'cursor-pointer hover:bg-slate-100 hover:text-[#5A305A] transition-colors' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      {...(draggable ? sortable.attributes : {})}
      {...(draggable ? sortable.listeners : {})}
    >
      <div className={`flex items-center gap-1 ${col.type === 'index' ? 'justify-center' : (col.type === 'num' || col.type === 'pct') ? 'justify-end' : 'justify-start'}`}>
        {draggable && <GripVertical size={11} className="text-slate-400 shrink-0" />}
        {col.label}
        {!reorderMode && sortColumn === col.key && (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
            {sortDirection === 'asc' ? (
              <path d="m18 15-6-6-6 6"/>
            ) : (
              <path d="m6 9 6 6 6-6"/>
            )}
          </svg>
        )}
      </div>
    </th>
  );
};

const CourierAuditRowGroup: React.FC<{
  rec: any, index: number, cols: any[],
  onValidation?: (r: any) => void,
  validationTabs?: ValidationTabKey[],
  onArchive?: (r: any) => void,
  onUndraft?: (r: any) => void,
  onDelete?: (r: any) => void,
  editMode?: boolean,
  getVal?: (r: any, field: string) => any,
  setVal?: (r: any, field: string, value: any) => void,
  onSaveRow?: (id: number | string) => Promise<boolean>,
  reorderMode?: boolean,
  totalRows?: number,
  onMoveTo?: (r: any, position: number) => void,
}> = ({ rec, index, cols, onValidation, validationTabs = [], onArchive, onUndraft, onDelete, editMode, getVal, setVal, onSaveRow, reorderMode, totalRows, onMoveTo }) => {
  const repeatingCols = ['po_ori', 'vendor_inv_no', 'po_harga_detail'];
  // Drag & Drop Reorder (2026-09) -- hook dipanggil TANPA SYARAT (Rules of Hooks), tapi
  // listeners/transform HANYA dipakai saat `reorderMode` true (`disabled` mematikan drag-nya,
  // bukan skip pemanggilan hook). Cuma baris PERTAMA (`isFirst`) yang jadi anchor drag -- baris
  // split PO lanjutan (`i>0`, lihat displayData di bawah) TIDAK ikut ter-transform saat drag,
  // keterbatasan diterima (kasus jarang, PO split biasanya tidak sedang di-reorder).
  const sortable = useSortable({ id: rec.id, disabled: !reorderMode });
  // Transisi eksplisit (fallback kalau `sortable.transition` kosong) -- easing lebih halus (2026-09,
  // permintaan user "bisa dibuat lebih smooth") drpd default dnd-kit polos, dipakai KONSISTEN di
  // baris & kolom (lihat sortableStyle SortableColumnHeader) supaya "rasa" animasi sama semua.
  const sortableStyle: React.CSSProperties = reorderMode ? {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition || 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: sortable.isDragging ? 0.4 : 1,
    zIndex: sortable.isDragging ? 10 : undefined,
    position: 'relative',
  } : {};

  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // Toggle edit per-baris (independen dari tombol "Edit Mode" global di toolbar) -- dikonfirmasi
  // user 2026-09 masih perlu ada dua-duanya: klik satu tombol global utk edit SEMUA baris
  // sekaligus, ATAU klik "Edit" di baris ini saja tanpa mengaktifkan mode global.
  const [rowEditOn, setRowEditOn] = useState(false);
  const [savingRow, setSavingRow] = useState(false);

  const canBulkEdit = !!(getVal && setVal);
  // Baris status LENGKAP (tab PIB/CN, sudah di-Undraft) DULU tidak bisa diedit sama sekali di
  // sini (restriksi `rec.status !== 'LENGKAP'`) -- SEKARANG DIHAPUS (2026-09, permintaan user:
  // tabel PIB & CN perlu tombol Edit yg bisa koreksi semua kolom termasuk NAS Submit Date, dulu
  // hanya tombol Unarchived yg muncul). Tab Draft TIDAK terdampak (baris di situ status-nya
  // SELALU ARCHIVED, tidak pernah LENGKAP).
  const editingThisRow = (!!editMode || rowEditOn) && canBulkEdit;
  // NAS Submit Date terisi = proses submit NAS sudah selesai utk baris ini (2026-09) -- dipakai
  // utk highlight baris & badge "Archived" di bawah. Pakai getVal() (bukan rec.tgl_submit_nas
  // mentah) supaya ikut nilai pending-edit yg BELUM disimpan juga (indikator visual langsung
  // responsif saat user mengetik tanggalnya, konsisten dgn effectiveRec di atas).
  const nasSubmitted = !!(canBulkEdit ? getVal!(rec, 'tgl_submit_nas') : rec.tgl_submit_nas);

  let splittedData: { po: string, inv: string, harga: string }[] = [];
  const pos = typeof rec.po_ori === 'string' ? rec.po_ori.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const invs = typeof rec.vendor_inv_no === 'string' ? rec.vendor_inv_no.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];
  const hargas = typeof rec.po_harga_detail === 'string' ? rec.po_harga_detail.split(/\s*\+\s*|,\s+/).map((s: string) => s.trim()).filter(Boolean) : [];

  const maxLen = Math.max(pos.length, invs.length, hargas.length);
  for (let i = 0; i < maxLen; i++) {
    splittedData.push({
      po: pos[i] || (pos.length === 1 ? pos[0] : ''),
      inv: invs[i] || (invs.length === 1 ? invs[0] : ''),
      harga: hargas[i] || (hargas.length === 1 ? hargas[0] : '')
    });
  }

  if (splittedData.length === 0) splittedData = [{ po: '', inv: '', harga: '' }];
  const rowCount = splittedData.length;
  const displayData = isExpanded ? splittedData : [splittedData[0]];

  // Kalau baris ini punya pending edit belum disimpan (lihat courierEdit* di parent), tampilan
  // read-only-nya ikut pakai nilai hasil edit itu (bukan nilai lama dari server) -- supaya user
  // tetap lihat perubahannya walau lagi tidak "aktif" mengedit baris ini (bisa sambil edit baris
  // lain, baru "Simpan Semua" belakangan). Sama pola dengan getVal() di FarOverseasAirPage.tsx.
  const effectiveRec = canBulkEdit ? cols.reduce((acc: any, c: any) => { acc[c.key] = getVal!(rec, c.key); return acc; }, { ...rec }) : rec;

  return (
    <>
      {displayData.map((data, i: number) => {
        const isFirst = i === 0;
        return (
          <tr
            key={`${rec.id}-${i}`}
            ref={isFirst ? sortable.setNodeRef : undefined}
            style={isFirst ? sortableStyle : undefined}
            className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0 bg-slate-50/40' : ''} ${
              editingThisRow ? 'bg-blue-50/50 hover:bg-blue-50/60' : nasSubmitted ? 'bg-emerald-50/70 hover:bg-emerald-50 border-l-[3px] border-l-emerald-400' : 'hover:bg-blue-50/30'
            }`}
          >
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) return null;

              if (c.type === 'index' && reorderMode) {
                return (
                  <ReorderIndexCell
                    key={c.key}
                    sortable={sortable}
                    index={index}
                    rowSpan={isExpanded ? rowCount : 1}
                    totalRows={totalRows ?? 0}
                    onMoveTo={onMoveTo ? (position) => onMoveTo(rec, position) : undefined}
                  />
                );
              }

              let { content, alignClass } = getCellData(c, effectiveRec, index);

              if (c.key === 'po_ori' || c.key === 'vendor_inv_no' || c.key === 'po_harga_detail') {
                const val = c.key === 'po_ori' ? data.po : c.key === 'vendor_inv_no' ? data.inv : data.harga;
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    <span>{val || '—'}</span>
                    {isFirst && rowCount > 1 && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle Data Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} Data`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-[#5A305A]';
              }

              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';

              if (editingThisRow && canBulkEdit && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel') {
                const cellVal = getVal!(rec, c.key);
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = cellVal ? String(cellVal).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={val} onChange={e => setVal!(rec, c.key, e.target.value)} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] text-right" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, Number(e.target.value))} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, e.target.value)}>
                      <option value="LENGKAP">{getStatusLabel('LENGKAP')}</option>
                      <option value="PROSES">{getStatusLabel('PROSES')}</option>
                      <option value="PENDING">{getStatusLabel('PENDING')}</option>
                      <option value="REVISI">{getStatusLabel('REVISI')}</option>
                      <option value="ARCHIVED">{getStatusLabel('ARCHIVED')}</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, e.target.value)} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }

              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}

            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {nasSubmitted && (
                    <span
                      title="NAS Submit Date is filled in -- this row's NAS submission is complete"
                      className="w-[80px] flex items-center justify-center gap-1 bg-emerald-100 text-emerald-700 border border-emerald-300 text-[10px] font-bold px-2 py-1 rounded-md"
                    >
                      🗄️ Archived
                    </span>
                  )}
                  <>
                    <button
                      onClick={() => setShowActions(!showActions)}
                      className={`w-[80px] flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                        showActions
                          ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                          : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                      }`}
                    >
                      Action
                      <ChevronDown size={13} className={`transition-transform duration-200 ${showActions ? 'rotate-180' : ''}`} />
                    </button>
                    {showActions && (
                      <div className="flex flex-col gap-1.5 items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                          {canBulkEdit && (
                            <button
                              onClick={() => setRowEditOn(v => !v)}
                              className={`w-[80px] text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm border ${
                                rowEditOn ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white border-slate-200 text-[#5A305A] hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              ✏️ {rowEditOn ? 'Editing' : 'Edit'}
                            </button>
                          )}
                          {rowEditOn && onSaveRow && (
                            <button
                              disabled={savingRow}
                              onClick={async () => {
                                setSavingRow(true);
                                const ok = await onSaveRow(rec.id);
                                setSavingRow(false);
                                if (ok) { setRowEditOn(false); setShowActions(false); }
                              }}
                              className="w-[80px] bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                            >
                              💾 {savingRow ? 'Saving...' : 'Save'}
                            </button>
                          )}
                          {/* Tombol "Validation" (2026-09-30) -- menggantikan 3 tombol lama Checklist/Doc
                              Validation/Cost Validation; membuka CourierValidationWindow (3 tab). 3 titik
                              = status tiap tab (hijau 100%, oranye <100%, abu belum ada data), hanya tab
                              yang boleh dilihat user. */}
                          {onValidation && validationTabs.length > 0 && rec.status !== 'LENGKAP' && (() => {
                            const vp = rowValidationPct(rec);
                            return (
                              <span className="relative inline-flex shrink-0">
                                <button
                                  onClick={() => { onValidation(rec); setShowActions(false); }}
                                  title={validationTabs.map(t => `${VALIDATION_TAB_LABEL[t]}: ${validationDotLabel(vp[t])}`).join(' · ')}
                                  className="w-[80px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                                >
                                  ✅ Validation
                                </button>
                                <span className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 h-[13px] px-1 rounded-full bg-white border border-slate-200 shadow-sm flex items-center gap-[3px]">
                                  {validationTabs.map(t => (
                                    <span key={t} className={`w-[6px] h-[6px] rounded-full ${validationDotClass(vp[t])}`} />
                                  ))}
                                </span>
                              </span>
                            );
                          })()}
                          {onArchive && (
                            <button onClick={() => { onArchive(rec); setShowActions(false); }} className="w-[80px] bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-orange-200 shadow-sm">
                              {rec.status === 'LENGKAP' ? '📦 Unarchived' : '🗄️ Draft'}
                            </button>
                          )}
                          {onUndraft && (
                            <button onClick={() => { onUndraft(rec); setShowActions(false); }} className="w-[80px] bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                              🗄️ Undraft
                            </button>
                          )}
                          {onDelete && rec.status !== 'LENGKAP' && (
                            <button onClick={() => { onDelete(rec); setShowActions(false); }} className="w-[80px] bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      )}
                  </>
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};


const CourierRekapanRowGroup: React.FC<{
  rec: any, index: number, cols: any[],
  onDelete?: (r: any) => void,
  editMode?: boolean,
  getVal?: (r: any, field: string) => any,
  setVal?: (r: any, field: string, value: any) => void,
  onSaveRow?: (id: number | string) => Promise<boolean>,
  reorderMode?: boolean,
  totalRows?: number,
  onMoveTo?: (r: any, position: number) => void,
}> = ({ rec, index, cols, onDelete, editMode, getVal, setVal, onSaveRow, reorderMode, totalRows, onMoveTo }) => {
  const repeatingCols = ['po_pt_imi', 'vessel', 'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel'];
  // Drag & Drop Reorder (2026-09) -- pola sama persis CourierAuditRowGroup, lihat komentarnya.
  const sortable = useSortable({ id: rec.id, disabled: !reorderMode });
  // Transisi eksplisit (fallback kalau `sortable.transition` kosong) -- easing lebih halus (2026-09,
  // permintaan user "bisa dibuat lebih smooth") drpd default dnd-kit polos, dipakai KONSISTEN di
  // baris & kolom (lihat sortableStyle SortableColumnHeader) supaya "rasa" animasi sama semua.
  const sortableStyle: React.CSSProperties = reorderMode ? {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition || 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: sortable.isDragging ? 0.4 : 1,
    zIndex: sortable.isDragging ? 10 : undefined,
    position: 'relative',
  } : {};

  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  // Sama pola dgn CourierAuditRowGroup -- edit per-baris tetap ada terpisah dari "Edit Mode" global.
  const [rowEditOn, setRowEditOn] = useState(false);
  const [savingRow, setSavingRow] = useState(false);

  const canBulkEdit = !!(getVal && setVal);
  const editingThisRow = (!!editMode || rowEditOn) && canBulkEdit;

  let poVesselPairs: { po: string, vessel: string }[] = [];
  // Dulu blok ini cuma jalan kalau po_pt_imi ada isinya -- akibatnya baris yang ditambah manual
  // dengan PO kosong tapi Vessel diisi, nilai vessel-nya hilang dari tampilan tabel (walau tetap
  // tersimpan normal di rec.vessel, makanya masih muncul di form Edit & export Excel). Sekarang
  // jalan kalau SALAH SATU po_pt_imi ATAU vessel ada isinya.
  const poStr = typeof rec.po_pt_imi === 'string' ? rec.po_pt_imi : '';
  const vesselStr = typeof rec.vessel === 'string' ? rec.vessel : '';
  if (poStr || vesselStr) {
    const pos = poStr.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);
    const vessels = vesselStr.split(/[+,]+/).map((s: string) => s.trim()).filter(Boolean);

    // Create pairs up to the max length of pos or vessels
    const maxLen = Math.max(pos.length, vessels.length);
    for (let i = 0; i < maxLen; i++) {
      poVesselPairs.push({
        po: pos[i] || (pos.length === 1 ? pos[0] : ''),
        vessel: vessels[i] || (vessels.length === 1 ? vessels[0] : '')
      });
    }
  }
  if (poVesselPairs.length === 0) poVesselPairs = [{ po: '', vessel: '' }];

  const rowCount = poVesselPairs.length;
  const displayPairs = isExpanded ? poVesselPairs : [poVesselPairs[0]];

  // Sama pola dengan CourierAuditRowGroup -- tampilan read-only ikut nilai pending edit yang
  // belum disimpan, biar user tetap lihat perubahannya walau sedang tidak "aktif" mengedit
  // baris ini.
  const effectiveRec = canBulkEdit ? cols.reduce((acc: any, c: any) => { acc[c.key] = getVal!(rec, c.key); return acc; }, { ...rec }) : rec;

  // Highlight baris Rekapan Courier yang `submit_date`-nya sudah terisi (lihat CLAUDE.md,
  // "Highlight baris Submit Date -- Rekapan Courier"). Murni berdasar isi `effectiveRec` (ikut
  // pending edit yang belum disimpan, sama seperti tampilan sel lain), bukan posisi baris --
  // jadi tetap ikut baris pas sorting/filter/pagination/search.
  const hasSubmitDate = !!String(effectiveRec.submit_date ?? '').trim();

  return (
    <>
      {displayPairs.map((pair, i: number) => {
        const isFirst = i === 0;
        const rowBgClass = hasSubmitDate
          ? 'bg-[#FFF5C5] hover:bg-[#F5E28F]'
          : editingThisRow
          ? 'bg-blue-50/50 hover:bg-blue-50/60'
          : !isFirst
          ? 'bg-slate-50/40 hover:bg-blue-50/30'
          : 'hover:bg-blue-50/30';
        return (
          <tr
            key={`${rec.id}-${i}`}
            ref={isFirst ? sortable.setNodeRef : undefined}
            style={isFirst ? sortableStyle : undefined}
            className={`transition-colors group ${hasSubmitDate ? 'border-l-[3px] border-l-[#E6C25C]' : ''} ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0' : ''} ${rowBgClass}`}
          >
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) return null;

              if (c.type === 'index' && reorderMode) {
                return (
                  <ReorderIndexCell
                    key={c.key}
                    sortable={sortable}
                    index={index}
                    rowSpan={isExpanded ? rowCount : 1}
                    totalRows={totalRows ?? 0}
                    onMoveTo={onMoveTo ? (position) => onMoveTo(rec, position) : undefined}
                  />
                );
              }

              let { content, alignClass } = getCellData(c, effectiveRec, index);

              if (c.key === 'po_pt_imi') {
                content = (
                  <div className="flex items-center gap-2 justify-between">
                    <span>{pair.po || '—'}</span>
                    {isFirst && rowCount > 1 && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                        title="Toggle PO Splits"
                      >
                        {isExpanded ? 'Hide' : `+${rowCount - 1} PO`}
                      </button>
                    )}
                  </div>
                );
                alignClass = 'text-left font-mono text-[#5A305A]';
              } else if (c.key === 'vessel') {
                if (editingThisRow && canBulkEdit) {
                  if (isFirst) {
                    content = (
                      <input
                        type="text"
                        className="w-full min-w-[120px] text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] bg-white"
                        value={getVal!(rec, 'vessel') ?? ''}
                        onChange={e => setVal!(rec, 'vessel', e.target.value)}
                      />
                    );
                  } else {
                    content = pair.vessel || '—';
                  }
                } else {
                  content = pair.vessel || '—';
                }
                alignClass = 'text-left font-mono text-[#5A305A]';
              }
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded
                ? `border-r border-slate-200 ${hasSubmitDate ? 'bg-[#FFF5C5] group-hover:bg-[#F5E28F]' : 'bg-white group-hover:bg-blue-50/30'}`
                : '';

              if (editingThisRow && canBulkEdit && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                const cellVal = getVal!(rec, c.key);
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = cellVal ? String(cellVal).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={val} onChange={e => setVal!(rec, c.key, e.target.value)} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] text-right" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, Number(e.target.value))} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, e.target.value)}>
                      <option value="LENGKAP">{getStatusLabel('LENGKAP')}</option>
                      <option value="ARCHIVED">{getStatusLabel('ARCHIVED')}</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={cellVal ?? ''} onChange={e => setVal!(rec, c.key, e.target.value)} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }

              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}

            {isFirst && (
              <td className={`px-4 py-3 text-center sticky right-0 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100 ${hasSubmitDate ? 'bg-[#FFF5C5] group-hover:bg-[#F5E28F]' : 'bg-white group-hover:bg-slate-50'}`} rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  <>
                    <button
                      onClick={() => setShowActions(!showActions)}
                      className={`w-[80px] flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                        showActions
                          ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                          : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                      }`}
                    >
                      Action
                      <ChevronDown size={13} className={`transition-transform duration-200 ${showActions ? 'rotate-180' : ''}`} />
                    </button>
                    {showActions && (
                      <div className="flex flex-col gap-1.5 items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                          {canBulkEdit && (
                            <button
                              onClick={() => setRowEditOn(v => !v)}
                              className={`w-[80px] text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm border ${
                                rowEditOn ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white border-slate-200 text-[#5A305A] hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              ✏️ {rowEditOn ? 'Editing' : 'Edit'}
                            </button>
                          )}
                          {rowEditOn && onSaveRow && (
                            <button
                              disabled={savingRow}
                              onClick={async () => {
                                setSavingRow(true);
                                const ok = await onSaveRow(rec.id);
                                setSavingRow(false);
                                if (ok) { setRowEditOn(false); setShowActions(false); }
                              }}
                              className="w-[80px] bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                            >
                              💾 {savingRow ? 'Saving...' : 'Save'}
                            </button>
                          )}
                          {onDelete && (
                            <button onClick={() => { onDelete(rec); setShowActions(false); }} className="w-[80px] bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
};

const SeaAirRekapanRowGroup: React.FC<{
  rec: any, index: number, cols: any[],
  onEdit?: (r: any) => void,
  onChecklist?: (r: any) => void,
  onValidasi?: (r: any) => void,
  onCostValidasi?: (r: any) => void,
  onDelete?: (r: any) => void,
  onDraft?: (r: any) => void,
  onUndraft?: (r: any) => void,
  onVesselChange?: (recId: number, poNo: string, newVal: string) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, onValidasi, onCostValidasi, onDelete, onDraft, onUndraft, onVesselChange, onInlineSaveRow }) => {
  const repeatingCols = ['po_no', 'vessel', 'emkl_split', 'split_biaya_origin', 'split_biaya_destination', 'pbm_split', 'lift_off_split', 'inspeksi_split', 'handling_split', 'other_split', 'duty_split', 'bm_split', 'ppn_split', 'pph_split'];
  // Record ini sudah aktif/pindah ke tab Audit (status audit terkait LENGKAP) -- tandai dengan highlight biru.
  const isAudited = rec.audit_status === 'LENGKAP';
  // Bagian 2 (sql/031): baris yg sudah Submit to Finance TERKUNCI -- Edit/Delete disembunyikan di
  // mode List juga (DB menolak juga). "Audit" (undraft PIB) hanya kalau Recap 0 issue.
  const recapLocked = isRecapLocked(rec);
  const recapIssueCount = Array.isArray(rec.recap_issues) ? rec.recap_issues.length : 0;
  const auditHighlightClass = 'bg-[#FFF5C5] hover:bg-[#F5E28F]';

  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showActions, setShowActions] = useState(false);

  let pos: any[] = [];
  try {
    if (Array.isArray(rec.po_detail) && rec.po_detail.length > 0) {
      pos = rec.po_detail;
    } else if (typeof rec.po_detail === 'string') {
      const parsed = JSON.parse(rec.po_detail);
      if (Array.isArray(parsed) && parsed.length > 0) {
        pos = parsed;
      } else {
        pos = [{ po_no: '', vessel: '' }];
      }
    } else {
      pos = [{ po_no: '', vessel: '' }];
    }
  } catch (e) {
    pos = [{ po_no: '', vessel: '' }];
  }

  const [localPoDetail, setLocalPoDetail] = useState<any[]>(pos);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setLocalPoDetail(pos);
      setIsEditing(true);
      setIsExpanded(true); // Auto expand when editing to see all POs
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    
    // Only send changed fields
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) {
        changes[k] = editForm[k];
      }
    });

    if (JSON.stringify(localPoDetail) !== JSON.stringify(pos)) {
      changes.po_detail = localPoDetail;
    }

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }
    
    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const rowCount = isEditing ? localPoDetail.length : pos.length;
  const displayPos = isEditing ? localPoDetail : (isExpanded ? pos : [pos[0]]);

  return (
    <>
      {displayPos.map((po: any, i: number) => {
        const isFirst = i === 0;
        return (
          <tr key={`${rec.id}-${i}`} className={`transition-colors group ${(isExpanded ? i === rowCount - 1 : true) ? 'border-b-[3px] border-slate-300' : 'border-b border-slate-100'} ${!isFirst ? 'border-t-0' : ''} ${isEditing ? 'bg-blue-50/50 hover:bg-blue-50/60' : isAudited ? auditHighlightClass : (!isFirst ? 'bg-slate-50/40 hover:bg-blue-50/30' : 'hover:bg-blue-50/30')}`}>
            {cols.map(c => {
              const isRepeating = repeatingCols.includes(c.key);
              if (!isRepeating && !isFirst) {
                 return null;
              }
              
              let { content, alignClass } = getCellData(c, rec, index);
              
              if (c.key === 'po_no') {
                if (isEditing) {
                  content = (
                    <input
                      type="text"
                      className="w-full min-w-[120px] bg-white border border-blue-400 rounded px-1 py-0.5 text-[#5A305A] focus:outline-none"
                      value={po.po_no || ''}
                      onChange={(e) => {
                        const newArr = [...localPoDetail];
                        newArr[i] = { ...newArr[i], po_no: e.target.value };
                        setLocalPoDetail(newArr);
                      }}
                    />
                  );
                } else {
                  content = (
                    <div className="flex items-center gap-2 justify-between">
                      <span>{po.po_no || '—'}</span>
                      {isFirst && rowCount > 1 && (
                        <button 
                          onClick={() => setIsExpanded(!isExpanded)} 
                          className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold ml-2 whitespace-nowrap"
                          title="Toggle PO Splits"
                        >
                          {isExpanded ? 'Hide' : `+${rowCount - 1} PO`}
                        </button>
                      )}
                    </div>
                  );
                }
                alignClass = 'text-left font-mono text-[#5A305A]';
              } else if (c.key === 'vessel') {
                if (isEditing) {
                  content = (
                    <input 
                      type="text"
                      className="w-full min-w-[120px] bg-white border border-blue-400 rounded px-1 py-0.5 text-[#5A305A] focus:outline-none"
                      value={po.vessel || ''}
                      onChange={(e) => {
                        const newArr = [...localPoDetail];
                        newArr[i] = { ...newArr[i], vessel: e.target.value };
                        setLocalPoDetail(newArr);
                      }}
                    />
                  );
                } else {
                  content = po.vessel || '—';
                }
                alignClass = 'text-left font-mono text-[#5A305A]';
              }
              
              const additionalClasses = !isRepeating && isFirst && rowCount > 1 && isExpanded ? 'border-r border-slate-200 bg-white group-hover:bg-blue-50/30' : '';
              
              if (isEditing && isInlineEditable(c.key) && (!isRepeating || isFirst) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
                let inputEl;
                if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
                  const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
                  inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
                  inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
                } else if (c.key === 'status') {
                  inputEl = (
                    <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                      <option value="LENGKAP">{getStatusLabel('LENGKAP')}</option>
                      <option value="ARCHIVED">{getStatusLabel('ARCHIVED')}</option>
                    </select>
                  );
                } else {
                  inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
                }
                return (
                  <td key={c.key} className={`px-2 py-2 align-top ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                    {inputEl}
                  </td>
                );
              }
              
              return (
                <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass} ${additionalClasses}`} rowSpan={isRepeating ? 1 : (isExpanded ? rowCount : 1)}>
                   {content}
                </td>
              )
            })}
            
            {isFirst && (
              <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100" rowSpan={isExpanded ? rowCount : 1}>
                <div className="flex flex-col items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        disabled={isSaving}
                        className="w-[80px] bg-slate-200 text-[#5A305A] hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowActions(!showActions)}
                        className={`w-[80px] flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                          showActions
                            ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                            : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                        }`}
                      >
                        Action
                        <ChevronDown size={13} className={`transition-transform duration-200 ${showActions ? 'rotate-180' : ''}`} />
                      </button>
                      {showActions && (
                        <div className="flex flex-col gap-1.5 items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                          {recapLocked && (
                            <span className="w-[80px] text-center bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200" title="Submitted to Finance — read-only. Ask an Admin to unlock it (Open › Unlock).">
                              🔒 Locked
                            </span>
                          )}
                          {(onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && !recapLocked && (
                            <button
                              onClick={handleStartEdit}
                              className="w-[80px] bg-white text-blue-600 hover:text-white hover:bg-[#5A305A] text-[10px] font-bold px-2 py-1 rounded-md border border-blue-200 hover:border-blue-600 transition-all"
                            >
                              Edit
                            </button>
                          )}
                          {onValidasi && (
                            <span className="relative inline-flex shrink-0">
                              <button onClick={() => onValidasi(rec)} className="w-[80px] bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                                🔎 Doc Validation
                              </button>
                              {rec.doc_validation_pct !== null && rec.doc_validation_pct !== undefined && (
                                <span className={`absolute -top-1.5 -right-1.5 z-10 min-w-[26px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm border-2 border-white ${
                                  rec.doc_validation_pct >= 90 ? 'bg-emerald-500 text-white' : rec.doc_validation_pct >= 60 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                                }`}>
                                  {rec.doc_validation_pct}%
                                </span>
                              )}
                            </span>
                          )}
                          {onCostValidasi && (
                            <span className="relative inline-flex shrink-0">
                              <button onClick={() => onCostValidasi(rec)} className="w-[80px] bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm">
                                💲 Cost Validation
                              </button>
                              {rec.cost_validation_pct !== null && rec.cost_validation_pct !== undefined && (
                                <span className={`absolute -top-1.5 -right-1.5 z-10 min-w-[26px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm border-2 border-white ${
                                  rec.cost_validation_pct >= 90 ? 'bg-emerald-500 text-white' : rec.cost_validation_pct >= 60 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                                }`}>
                                  {rec.cost_validation_pct}%
                                </span>
                              )}
                            </span>
                          )}
                          {onChecklist && (
                            <span className="relative inline-flex shrink-0">
                              <button
                                onClick={() => onChecklist(rec)}
                                className={`w-[80px] border text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm ${
                                  rec.status_kelengkapan === 'LENGKAP'
                                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                }`}
                              >
                                ✓ Checklist
                              </button>
                              {rec.checklist_pct !== null && rec.checklist_pct !== undefined && (
                                <span className={`absolute -top-1.5 -right-1.5 z-10 min-w-[26px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm border-2 border-white ${
                                  rec.checklist_pct >= 90 ? 'bg-emerald-500 text-white' : rec.checklist_pct >= 60 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                                }`}>
                                  {rec.checklist_pct}%
                                </span>
                              )}
                            </span>
                          )}
                          {rec.audit_status === 'ARCHIVED'
                            ? (onUndraft && (
                                <button
                                  onClick={() => onUndraft(rec)}
                                  disabled={recapIssueCount > 0}
                                  title={recapIssueCount > 0 ? `${recapIssueCount} open issue(s) must be confirmed by an Admin first` : undefined}
                                  className="w-[80px] bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  🗄️ Audit
                                </button>
                              ))
                            : (onDraft && (
                                <button
                                  onClick={() => onDraft(rec)}
                                  className="w-[80px] bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-orange-200 shadow-sm"
                                >
                                  🗄️ Draft
                                </button>
                              ))
                          }
                          {onDelete && !recapLocked && (
                            <button
                              onClick={() => onDelete(rec)}
                              className="w-[80px] bg-white text-red-600 hover:text-white hover:bg-red-600 text-[10px] font-bold px-2 py-1 rounded-md border border-red-200 hover:border-red-600 transition-all"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
const DataRow: React.FC<{ 
  rec: any, index: number, cols: any[], 
  onEdit?: (r: any) => void, onChecklist?: (r: any) => void, showChecklist?: boolean, 
  onDelete?: (r: any) => void, hideEdit?: boolean, selected?: boolean, 
  onSelect?: (r: any, checked: boolean) => void, onValidasi?: (r: any) => void, showValidasi?: boolean, 
  onCostValidasi?: (r: any) => void, onArchive?: (r: any) => void, onUndraft?: (r: any) => void,
  onInlineSaveRow?: (id: number, payload: any) => Promise<boolean>
}> = ({ rec, index, cols, onEdit, onChecklist, showChecklist, onDelete, hideEdit, selected, onSelect, onValidasi, showValidasi, onCostValidasi, onArchive, onUndraft, onInlineSaveRow }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (onInlineSaveRow) {
      setEditForm(rec);
      setIsEditing(true);
    } else if (onEdit) {
      onEdit(rec);
    }
  };

  const handleSave = async () => {
    if (!onInlineSaveRow) return;
    setIsSaving(true);
    
    // Only send changed fields
    const changes: any = {};
    Object.keys(editForm).forEach(k => {
      if (editForm[k] !== rec[k]) {
        changes[k] = editForm[k];
      }
    });

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setIsSaving(false);
      return;
    }

    const success = await onInlineSaveRow(rec.id, changes);
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  return (
    <tr className={`border-b border-slate-100 transition-colors group ${selected ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'} ${isEditing ? 'bg-blue-50/50' : ''}`}>
      {onSelect && (
        <td className="px-4 py-3 text-center align-top border-r border-slate-100">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={!!selected} onChange={(e) => onSelect(rec, e.target.checked)} disabled={isEditing} />
        </td>
      )}
      {cols.map(c => {
        const { content, alignClass } = getCellData(c, rec, index);
        
        if (isEditing && isInlineEditable(c.key) && c.key !== 'po_no' && c.key !== 'vessel' && c.key !== 'po_ori' && c.key !== 'vendor_inv_no' && c.key !== 'po_harga_detail') {
          let inputEl;
          if (c.type === 'date' || c.type === 'date_dash_if_null' || c.type === 'datetime' || c.type === 'date_badge_if_null') {
            const val = editForm[c.key] ? String(editForm[c.key]).substring(0, 10) : '';
            inputEl = <input type="date" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={val} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
          } else if (c.type === 'num' || c.type === 'num_dash_null' || c.type === 'num_dash_null_2dec' || c.type === 'num_dash_if_null' || c.type === 'num_bold' || c.type === 'num_highlight') {
            inputEl = <input type="number" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A] text-right" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: Number(e.target.value)})} />;
          } else if (c.key === 'status') {
            inputEl = (
              <select className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})}>
                <option value="LENGKAP">{getStatusLabel('LENGKAP')}</option>
                <option value="ARCHIVED">{getStatusLabel('ARCHIVED')}</option>
              </select>
            );
          } else {
            inputEl = <input type="text" className="w-full text-[10px] p-1 border border-blue-400 rounded outline-none text-[#5A305A]" value={editForm[c.key] ?? ''} onChange={e => setEditForm({...editForm, [c.key]: e.target.value})} />;
          }
          return (
            <td key={c.key} className={`px-2 py-2 align-top`}>
              {inputEl}
            </td>
          );
        }

        return (
          <td key={c.key} className={`px-4 py-3 text-[11px] align-top ${alignClass}`}>
            {content}
          </td>
        )
      })}
      
      {/* Sticky Right Column untuk Tombol Aksi */}
      <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-10 transition-colors border-l border-slate-100">
        <div className="flex flex-col items-center gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-[80px] bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="w-[80px] bg-slate-200 text-[#5A305A] hover:bg-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {!hideEdit && (onEdit || onInlineSaveRow) && rec.status !== 'LENGKAP' && (
                <button
                  onClick={handleStartEdit}
                  className="w-[80px] bg-white border border-slate-200 text-[#5A305A] hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                >
                  ✏️ Edit
                </button>
              )}
              {showChecklist && onChecklist && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onChecklist(rec)}
                  className={`w-[80px] border text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm ${
                    rec.status_kelengkapan === 'LENGKAP' 
                      ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                      : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  ✓ Checklist
                </button>
              )}
              {showValidasi && onValidasi && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onValidasi(rec)}
                  className="w-[80px] bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all shadow-sm"
                >
                  🔎 Doc Validation
                </button>
              )}
              {onCostValidasi && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onCostValidasi(rec)}
                  className={`w-[80px] block text-[10px] font-bold px-2 py-1.5 rounded-md border text-center transition-all shadow-sm ${
                    rec.status_cost === 'OK'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : rec.status_cost === 'ADA SELISIH' || rec.status_cost === 'SELISIH'
                      ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                      : 'bg-slate-50 border-slate-200 text-[#5A305A] hover:bg-slate-100'
                  }`}
                >
                  💰 Cost Valid.
                </button>
              )}
              {onArchive && (
                <button
                  onClick={() => onArchive(rec)}
                  className="w-[80px] bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-orange-200 shadow-sm"
                >
                  {rec.status === 'LENGKAP' ? '📦 Unarchived' : '🗄️ Draft'}
                </button>
              )}
              {onUndraft && (
                <button
                  onClick={() => onUndraft(rec)}
                  className="w-[80px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-emerald-200 shadow-sm"
                >
                  🗄️ Undraft
                </button>
              )}
              {onDelete && rec.status !== 'LENGKAP' && (
                <button
                  onClick={() => onDelete(rec)}
                  className="w-[80px] bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all border border-red-100 shadow-sm"
                >
                  🗑️ Delete
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Gaya toolbar terpadu (dipakai semua pill filter, input, dan dropdown) ─────
const TOOLBAR_PILL_BASE = 'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border'
const TOOLBAR_PILL_ACTIVE = 'bg-[#5A305A] text-white border-[#5A305A] shadow-sm shadow-[#5A305A]/25'
const TOOLBAR_PILL_INACTIVE = 'bg-white/70 backdrop-blur-md text-[#5A305A] border-white/60 shadow-sm hover:bg-white/90 hover:border-[#5A305A]/25 hover:text-[#5A305A]'
const toolbarPillClass = (isActive: boolean) => `${TOOLBAR_PILL_BASE} ${isActive ? TOOLBAR_PILL_ACTIVE : TOOLBAR_PILL_INACTIVE}`
// Kapsul kaca untuk elemen non-pill di toolbar (search, date range, refresh, dropdown)
const TOOLBAR_GLASS = 'bg-white/70 backdrop-blur-md border-slate-200/80 shadow-sm'

export default function SharedDataTable({ defaultMainTab = 'courier', defaultSubTab = 'courier_audit' }: { defaultMainTab?: string, defaultSubTab?: string }) {
  const { allowedPageKeys, isAdmin, canEdit, user, getAllowedColumns, columnAccessByPage } = useAuth();
  const navigate = useNavigate();
  // `?q=` (2026-09-30) -- isi awal kotak Search, dipakai tombol "Open in Invoice Recap" di Audit PIB
  // Sea & Air (buka Invoice Recap terfilter BL/AWB shipment itu). Tanpa param = perilaku lama.
  const [searchParams] = useSearchParams();
  const initialSearchParam = searchParams.get('q') || '';
  // Search Audit/Rekapan Courier HANYA mencari di kolom yang boleh dilihat role user (2026-09-29,
  // lihat COLUMN_ACCESS_PAGES) -- supaya baris tidak "muncul tanpa alasan kelihatan" krn cocok di
  // kolom tersembunyi. Kalau TIDAK ADA satu pun kolom search yang diizinkan, pakai daftar asli
  // (Search tetap berfungsi, bukan mati diam-diam). Deps = state mentah (bukan getAllowedColumns
  // yg identitasnya berubah tiap render) supaya useCallback pemakainya tidak refetch terus.
  const restrictSearchCols = useCallback((menu: 'courier_audit' | 'courier_rekapan', cols: string[]) => {
    const allowed = getAllowedColumns(menu);
    if (!allowed) return cols;
    const kept = cols.filter(c => allowed.has(c));
    return kept.length > 0 ? kept : cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnAccessByPage, isAdmin]);
  const canSee = (pageKey: string) => isAdmin || allowedPageKeys.has(pageKey);
  // Tab jendela Validation yang boleh DILIHAT user (per page_key lama masing2 tombol).
  const courierValidationAccess: Record<ValidationTabKey, boolean> = {
    checklist: canSee('courier_checklist_dokumen'),
    doc: canSee('courier_dokumen_validation'),
    cost: canSee('courier_cost_validation'),
  };
  const courierValidationTabs = VALIDATION_TAB_ORDER.filter(t => courierValidationAccess[t]);
  const [activeMainTab, setActiveMainTab] = useState(defaultMainTab)
  const [activeSubTab,  setActiveSubTab]  = useState(defaultSubTab)

  // ── Customize View (pilih kolom yg tampil) -- per-user & per-menu (Audit vs Recap), lihat CLAUDE.md ──
  const customizeViewStorageKey = (menu: 'courier_audit' | 'courier_rekapan') => `beehive_customize_view:${user?.id || 'anon'}:${menu}`
  const loadHiddenCols = (menu: 'courier_audit' | 'courier_rekapan'): Set<string> => {
    try {
      const raw = localStorage.getItem(customizeViewStorageKey(menu));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
      return new Set();
    }
  };
  const [courierAuditHiddenCols, setCourierAuditHiddenCols] = useState<Set<string>>(() => loadHiddenCols('courier_audit'))
  const [courierRekapanHiddenCols, setCourierRekapanHiddenCols] = useState<Set<string>>(() => loadHiddenCols('courier_rekapan'))
  const [showCustomizeView, setShowCustomizeView] = useState<'courier_audit' | 'courier_rekapan' | null>(null)
  // Reload dari localStorage begitu user (login) berubah -- state di-init sekali saja via useState initializer di atas
  useEffect(() => {
    setCourierAuditHiddenCols(loadHiddenCols('courier_audit'));
    setCourierRekapanHiddenCols(loadHiddenCols('courier_rekapan'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
  const saveHiddenCols = (menu: 'courier_audit' | 'courier_rekapan', hidden: Set<string>) => {
    try {
      localStorage.setItem(customizeViewStorageKey(menu), JSON.stringify(Array.from(hidden)));
    } catch {
      // localStorage bisa gagal (mode private/quota) -- preferensi tetap berlaku di sesi ini via state
    }
    if (menu === 'courier_audit') setCourierAuditHiddenCols(hidden);
    else setCourierRekapanHiddenCols(hidden);
    setShowCustomizeView(null);
  };

  // ── Drag & Drop Reorder -- urutan KOLOM (2026-09) ──────────────────────────
  // GLOBAL (semua user, bukan per-user seperti hidden-set di atas) -- disimpan tabel Supabase
  // `table_column_order` (sql/023_...), 1 baris per "menu" (SAMA partisi dgn Customize View:
  // 'courier_audit' mewakili Draft+PIB+CN, 'courier_rekapan' mewakili Invoice Recap semua PPJK).
  const [courierAuditColumnOrder, setCourierAuditColumnOrder] = useState<string[] | null>(null)
  const [courierRekapanColumnOrder, setCourierRekapanColumnOrder] = useState<string[] | null>(null)
  const fetchColumnOrder = useCallback(async () => {
    const { data, error } = await supabase.from('table_column_order').select('menu, column_order');
    if (error || !data) return;
    data.forEach((row: any) => {
      if (row.menu === 'courier_audit' && Array.isArray(row.column_order)) setCourierAuditColumnOrder(row.column_order);
      if (row.menu === 'courier_rekapan' && Array.isArray(row.column_order)) setCourierRekapanColumnOrder(row.column_order);
    });
  }, []);
  useEffect(() => { fetchColumnOrder(); }, [fetchColumnOrder]);

  // ── Drag & Drop Reorder -- urutan BARIS (2026-09) ──────────────────────────
  // Aktif via toggle "Reorder Mode" (toolbar). Sejak 2026-09-28 PER HALAMAN (paginasi server
  // biasa `fetchRecords()`, `pageSize` sementara dipaksa REORDER_PAGE_SIZE) -- BUKAN lagi fetch
  // semua baris + batas 2.000. Pindah lintas halaman lewat drag ke ujung halaman (tetangga halaman
  // sebelah diambil 1 baris) atau popover "Move to" di badge No. (lihat handleMoveRowTo).
  // `prevPageSizeRef` = pageSize user sebelum masuk Reorder, dikembalikan saat keluar.
  const [reorderMode, setReorderMode] = useState(false)
  const [reorderSaving, setReorderSaving] = useState(false)
  const prevPageSizeRef = useRef<number | null>(null)
  // CSS `transform` pada elemen `<tr>`/`<th>` TIDAK reliable di semua browser (keterbatasan
  // dikenal luas dnd-kit + tabel HTML) -- baris/kolom sumber TETAP di tempat selama drag (cuma
  // opacity redup), feedback visual "mengikuti kursor" SEPENUHNYA dari `DragOverlay` (portal ke
  // `document.body`, div biasa, transform-nya SELALU jalan). `draggingRowId`/`draggingColKey`
  // HANYA state UI (transform/isi overlay), TIDAK dipakai logic reorder (`handleRowDragEnd`/
  // `handleColumnDragEnd` baca `event.active`/`event.over` langsung dari dnd-kit).
  const [draggingRowId, setDraggingRowId] = useState<string | number | null>(null)
  const [draggingColKey, setDraggingColKey] = useState<string | null>(null)

  useEffect(() => {
    setActiveMainTab(defaultMainTab);
    setActiveSubTab(defaultSubTab);
    setPage(1); // Reset page on tab switch
  }, [defaultMainTab, defaultSubTab]);

  const [courierAuditType, setCourierAuditType] = useState('archive')
  // 'draft' (status ARCHIVED) | 'audit' (Audited, non-ARCHIVED) | 'all' -- default Draft sejak
  // redesain PIB Audit 2026-09-30 (tab Draft paling kiri & aktif, sesuai mockup user).
  const [seaAirAuditType, setSeaAirAuditType] = useState('draft')
  // Invoice Recap (2026-10-01): toggle "Needs attention" -- id baris yg punya issue diambil dari
  // ringkasan KPI (fetchRecapSummary, SEMUA baris yg lolos filter), lalu daftar difilter `.in('id')`.
  const [recapNeedsAttentionOnly, setRecapNeedsAttentionOnly] = useState(false)
  const [recapNeedsAttentionIds, setRecapNeedsAttentionIds] = useState<any[] | null>(null)
  const [activeTrailFilter, setActiveTrailFilter] = useState('ALL')
  const [activeTrailUserFilter, setActiveTrailUserFilter] = useState('All')
  const [trailUserTabs, setTrailUserTabs] = useState<string[]>(['All'])
  const [activePpjkFilter, setActivePpjkFilter] = useState('All')
  const [activeShipmentTypeFilter, setActiveShipmentTypeFilter] = useState('All')
  const [activeAnFilter, setActiveAnFilter] = useState('All')
  const [anTabs, setAnTabs] = useState<string[]>(['All'])
  const [activeImporAnFilter, setActiveImporAnFilter] = useState('All')
  const [importAnTabs, setImportAnTabs] = useState<string[]>(['All'])
  const [activeCourierAnFilter, setActiveCourierAnFilter] = useState('All')
  const [courierAnTabs, setCourierAnTabs] = useState<string[]>(['All'])
  const [activeCourierImporAnFilter, setActiveCourierImporAnFilter] = useState('All')
  const [courierImporAnTabs, setCourierImporAnTabs] = useState<string[]>(['All'])
  const [ppjkTabs, setPpjkTabs] = useState<string[]>(['All'])
  const [records,       setRecords]       = useState<any[]>([])
  const [totalRecords,  setTotalRecords]  = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [search,        setSearch]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fetchError,    setFetchError]    = useState<string | null>(null)

  // Reorder Mode (2026-09) keluar otomatis begitu tab/filter berubah -- scope drag (tabel, tab
  // PPJK/PIB-CN) harus sama persis dgn yg ditampilkan, ganti tab bikin posisi yg dihitung basi.
  // pageSize dikembalikan ke nilai sebelum Reorder (fetch ulang otomatis lewat deps fetchRecords).
  useEffect(() => {
    setReorderMode(false);
    if (prevPageSizeRef.current != null) {
      setPageSize(prevPageSizeRef.current);
      prevPageSizeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab, activeSubTab, courierAuditType, activePpjkFilter, activeCourierAnFilter, activeCourierImporAnFilter, debouncedSearch, filterStartDate, filterEndDate])

  useEffect(() => {
    const fetchPpjks = async () => {
      // Fetch distinct PPJKs from recent records
      const { data } = await supabase.from('rekapan_courier').select('ppjk').neq('ppjk', null).order('created_at', { ascending: false }).limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map(d => {
          let ppjk = d.ppjk && d.ppjk.trim().toUpperCase();
          if (ppjk && ppjk.startsWith('OWN ')) {
            ppjk = ppjk.substring(4);
          }
          return ppjk;
        }))).filter(Boolean) as string[];
        const allUnique = unique.sort();
        setPpjkTabs(['All', ...allUnique]);
      }
    };
    fetchPpjks();
  }, []);

  useEffect(() => {
    const fetchAns = async () => {
      // Fetch distinct A/N from recent rekapan Sea & Air records
      const { data } = await supabase.from('rekapan_seaair').select('a_n').neq('a_n', null).order('created_at', { ascending: false }).limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map(d => d.a_n && String(d.a_n).trim()).filter(Boolean))) as string[];
        setAnTabs(['All', ...unique.sort()]);
      }
    };
    fetchAns();
  }, []);

  useEffect(() => {
    const fetchImporAns = async () => {
      // Fetch distinct Impor An from recent audit Sea & Air records
      const { data } = await supabase.from('tabel_audit_seaair').select('impor_an').neq('impor_an', null).order('created_at', { ascending: false }).limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map(d => d.impor_an && String(d.impor_an).trim()).filter(Boolean))) as string[];
        setImportAnTabs(['All', ...unique.sort()]);
      }
    };
    fetchImporAns();
  }, []);

  useEffect(() => {
    const fetchCourierAns = async () => {
      // Fetch distinct A/N from recent rekapan Courier records
      const { data } = await supabase.from('rekapan_courier').select('an').neq('an', null).order('created_at', { ascending: false }).limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map((d: any) => d.an && String(d.an).trim()).filter(Boolean))) as string[];
        setCourierAnTabs(['All', ...unique.sort()]);
      }
    };
    fetchCourierAns();
  }, []);

  useEffect(() => {
    const fetchCourierImporAns = async () => {
      // Fetch distinct Impor An dari audit Courier (PIB + CN)
      const [pibRes, cnRes] = await Promise.all([
        supabase.from('tabel_audit_pib').select('impor_an').neq('impor_an', null).order('created_at', { ascending: false }).limit(1000),
        supabase.from('tabel_audit_cn').select('impor_an').neq('impor_an', null).order('created_at', { ascending: false }).limit(1000),
      ]);
      const combined = [...(pibRes.data || []), ...(cnRes.data || [])];
      const unique = Array.from(new Set(combined.map((d: any) => d.impor_an && String(d.impor_an).trim()).filter(Boolean))) as string[];
      setCourierImporAnTabs(['All', ...unique.sort()]);
    };
    fetchCourierImporAns();
  }, []);

  useEffect(() => {
    const fetchTrailUsers = async () => {
      // Fetch distinct user (buat filter "peruser" di Audit Trail)
      const { data } = await supabase.from('v_audit_trail').select('user_email').neq('user_email', null).order('created_at', { ascending: false }).limit(2000);
      if (data) {
        const unique = Array.from(new Set(data.map((d: any) => d.user_email && String(d.user_email).trim()).filter(Boolean))) as string[];
        setTrailUserTabs(['All', ...unique.sort()]);
      }
    };
    fetchTrailUsers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (search !== debouncedSearch) setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search, debouncedSearch])

  // Remove debouncedPpjkFilter logic
  const [editRecord,    setEditRecord]    = useState<any>(null)
  const [showAddRowModal, setShowAddRowModal] = useState(false)
  const [seaAirChecklistRecord, setSeaAirChecklistRecord] = useState<any>(null)
  const [deleteRecord,  setDeleteRecord]  = useState<any>(null)
  const [seaAirValidasiRecord, setSeaAirValidasiRecord] = useState<any>(null)
  const [seaAirCostValidasiRecord, setSeaAirCostValidasiRecord] = useState<any>(null)
  // Jendela "Validation" Audit Courier (Checklist + Doc Validation + Cost Validation, 2026-09-30)
  const [courierValidationRecord, setCourierValidationRecord] = useState<any>(null)

  // Edit massal (Audit Courier & Rekapan Courier) -- 1 tombol "Edit Mode" di toolbar membuka
  // mode input di SEMUA baris yang lagi tampil sekaligus (bukan toggle per baris), tiap baris/
  // kolom bisa diisi nilai beda-beda, ditampung di pendingEdits keyed by row id, baru disimpan
  // sekaligus lewat "Save All". Dikonfirmasi user 2026-09: "saya mau klik satu tombol edit" --
  // bukan pola per-baris ala FarOverseasAirPage.tsx (List Memo) lagi (versi awal fitur ini SEMPAT
  // pakai pola itu, sudah diganti total ke toggle global di sini).
  const [courierAuditEditMode, setCourierAuditEditMode] = useState(false)
  // Key object ini SENGAJA `string` (bukan `number`) -- `rec.id` kolom bigint/int8 di Postgres
  // dikembalikan Supabase-js sbg STRING (bukan JS number, utk hindari presisi hilang di angka
  // besar), sedangkan kolom int4 biasa dikembalikan sbg number. Kalau id di sini dipaksa lewat
  // Number(...) lalu dibandingkan balik ke `r.id` pakai `===` (strict, beda tipe = selalu false),
  // baris ketemu `undefined` & save diam-diam gagal -- lihat catatan di handleInlineSaveRow.
  const [courierAuditPendingEdits, setCourierAuditPendingEdits] = useState<Record<string, Record<string, any>>>({})
  const [savingCourierAuditEdits, setSavingCourierAuditEdits] = useState(false)

  const [courierRekapanEditMode, setCourierRekapanEditMode] = useState(false)
  const [courierRekapanPendingEdits, setCourierRekapanPendingEdits] = useState<Record<string, Record<string, any>>>({})
  const [savingCourierRekapanEdits, setSavingCourierRekapanEdits] = useState(false)


  // Pagination
  const [page,          setPage]          = useState(1)
  const [pageSize,      setPageSize]      = useState(10)

  // Buang pending edits massal & matikan Edit Mode kalau user pindah tab/tipe Draft-PIB-CN --
  // SENGAJA TIDAK ikut ke-reset saat pindah HALAMAN (page) -- Edit Mode global dimaksudkan
  // supaya user bisa edit banyak baris LINTAS HALAMAN dulu, baru "Save All" sekaligus di akhir.
  useEffect(() => {
    setCourierAuditPendingEdits({});
    setCourierAuditEditMode(false);
    setCourierRekapanPendingEdits({});
    setCourierRekapanEditMode(false);
  }, [activeMainTab, activeSubTab, courierAuditType]);
  const [sortColumn,    setSortColumn]    = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  
  const [exportModalState, setExportModalState] = useState<{title: string, cols: any[], dateFieldLabel?: string, splitByPoDetail?: 'sea_air_rekapan' | 'courier_rekapan'} | null>(null)

  // Scroll sync refs
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const savedScrollX = useRef(0)

  // Restore scroll position after records or sorting changes
  useEffect(() => {
    if (bottomScrollRef.current && savedScrollX.current !== undefined) {
      bottomScrollRef.current.scrollLeft = savedScrollX.current;
    }
    if (topScrollRef.current && savedScrollX.current !== undefined) {
      topScrollRef.current.scrollLeft = savedScrollX.current;
    }
  }, [records, sortColumn, sortDirection]);

  useEffect(() => {
    setPage(1);
    setSortColumn('created_at');
    setSortDirection('desc');
    setSearch(initialSearchParam);
    setDebouncedSearch(initialSearchParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainTab, activeSubTab, activeTrailFilter])

  // Sort hasil klik header kembali ke default tiap pindah tab PPJK (Invoice Recap) atau tab
  // Draft/PIB/CN (Audit) -- 2026-09-29, default urutan kini BEDA per tab (All PPJK = Created At,
  // per-PPJK = sort_order dari Email Received Date), sort 1 tab tidak boleh terbawa ke tab lain.
  useEffect(() => {
    setSortColumn('created_at');
    setSortDirection('desc');
  }, [activePpjkFilter, courierAuditType])
  const tableRef = useRef<HTMLTableElement>(null)
  const [tableWidth, setTableWidth] = useState(0)

  useEffect(() => {
    if (!tableRef.current) return
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setTableWidth(entry.target.scrollWidth)
      }
    })
    resizeObserver.observe(tableRef.current)
    return () => resizeObserver.disconnect()
  }, [records, activeMainTab, activeSubTab])

  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    savedScrollX.current = e.currentTarget.scrollLeft;
    if (bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleBottomScroll = (e: React.UIEvent<HTMLDivElement>) => {
    savedScrollX.current = e.currentTarget.scrollLeft;
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const mainTabObj = MAIN_TABS.find(t => t.id === activeMainTab);
  const activeSubTabs = mainTabObj?.subTabs || [];
  
  const activeTabId = activeSubTabs.length > 0 ? activeSubTab : activeMainTab;
  const tab = activeSubTabs.length > 0 ? activeSubTabs.find(t => t.id === activeSubTab) : mainTabObj;

  const fetchRecords = useCallback(async () => {
    if (!tab) return
    if (!(activeMainTab === 'courier' && activeSubTab === 'courier_audit') && !tab.table) return

    setLoading(true)
    setFetchError(null)

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
      try {
        // Fetch PIB
        let queryPib = supabase.from('tabel_audit_pib').select('*').eq('status', 'ARCHIVED')
        // Fetch CN
        let queryCn = supabase.from('tabel_audit_cn').select('*').eq('status', 'ARCHIVED')

        if (activeCourierImporAnFilter !== 'All') {
          queryPib = queryPib.eq('impor_an', activeCourierImporAnFilter);
          queryCn = queryCn.eq('impor_an', activeCourierImporAnFilter);
        }

        // Filter tanggal (`tgl_ppjk`, sama kolom dgn tab PIB/CN & export Draft). Dulu jalur Draft
        // ini `return` duluan sebelum blok "Apply Date Filter" di bawah, jadi input tanggal di tab
        // Draft tidak menyaring apa pun (fix 2026-09-28).
        if (filterStartDate) {
          queryPib = queryPib.gte('tgl_ppjk', filterStartDate);
          queryCn = queryCn.gte('tgl_ppjk', filterStartDate);
        }
        if (filterEndDate) {
          const endOfDay = `${filterEndDate} 23:59:59`;
          queryPib = queryPib.lte('tgl_ppjk', endOfDay);
          queryCn = queryCn.lte('tgl_ppjk', endOfDay);
        }

        if (debouncedSearch) {
          const searchColsPib = restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor']);
          const searchColsCn = restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'po_ori', 'vendor']);
          queryPib = queryPib.or(searchColsPib.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
          queryCn = queryCn.or(searchColsCn.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
        }

        const [resPib, resCn] = await Promise.all([queryPib, queryCn])
        if (resPib.error) throw resPib.error
        if (resCn.error) throw resCn.error

        // `sptnp_total` SUDAH ikut `select('*')` dari `tabel_audit_pib` di atas -- query ulang
        // per-50-id yg dulu ada di sini dobel & sudah dibuang (2026-09-28).
        let combined = [
          ...(resPib.data || []).map(r => ({ ...r, jenis_dokumen: 'PIB' })),
          ...(resCn.data || []).map(r => ({ ...r, jenis_dokumen: 'CN' }))
        ];

        // Live-compute 7 kolom turunan Audit Courier (lihat COURIER_AUDIT_CALC_FIELDS) tiap
        // fetch -- supaya data hasil isian n8n (yg tidak pernah lewat form ini) ikut auto-koreksi
        // saat tampil, KECUALI field yg sudah pernah ditandai override manual per baris.
        combined.forEach(r => Object.assign(r, computeCourierAuditCalc(r, r.jenis_dokumen, r.manual_override_fields)));

        await mergeChecklistData(combined);

        const { docPctMap: draftDocPctMap, costPctMap: draftCostPctMap } = await fetchCourierValidationBadgePct(combined);
        combined.forEach(r => {
          const badgeKey = r.jenis_dokumen === 'CN' ? `cn_${r.id}` : `pib_${r.id}`;
          r.doc_validation_pct = draftDocPctMap[badgeKey] ?? 0;
          r.cost_validation_pct = draftCostPctMap[badgeKey] ?? 0;
        });

        // Apply Ordering locally -- state default (belum ada sort eksplisit dari user, lihat
        // isDefaultSortState()) = Created At TERBARU di atas LANGSUNG (2026-09-29, keputusan user),
        // BUKAN `sort_order` lagi -- `sort_order` tabel_audit_pib/cn kini diturunkan dari Doc
        // Acceptance (utk tab PIB/CN), tidak relevan utk Draft (Draft juga tanpa Reorder Mode).
        // Sort eksplisit by kolom lain TIDAK berubah (perilaku existing).
        if (isDefaultSortState(sortColumn, sortDirection)) {
          combined.sort(compareCreatedAtDesc);
        } else if (sortColumn) {
          combined.sort((a, b) => {
            const valA = a[sortColumn] || '';
            const valB = b[sortColumn] || '';
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
          });
        }

        setTotalRecords(combined.length)
        
        // Apply Pagination locally
        const start = (page - 1) * pageSize
        const end = start + pageSize
        setRecords(combined.slice(start, end))
      } catch (err: any) {
        setFetchError(err.message)
      } finally {
        setLoading(false)
      }
      return;
    }

    let fetchTarget = (tab as any).view || tab.table
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
      fetchTarget = courierAuditType === 'pib' ? 'tabel_audit_pib' : 'tabel_audit_cn';
    }
    let query = supabase.from(fetchTarget).select('*', { count: 'exact' })

    // Apply Archive Filter
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && ((courierAuditType === 'pib') || (courierAuditType === 'cn'))) {
      query = query.neq('status', 'ARCHIVED');
    }

    // Apply Archive Filter (Sea & Air Audit -- Draf berisi status ARCHIVED, Audited menyembunyikannya,
    // tab "All" (2026-09-30, redesain PIB Audit) tanpa filter status)
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
      if (seaAirAuditType === 'draft') query = query.eq('status', 'ARCHIVED');
      else if (seaAirAuditType !== 'all') query = query.neq('status', 'ARCHIVED');
    }

    // Apply Filter by Trail -- jenis aksi (Courier / Sea & Air / Bunker / Semua)
    if (activeMainTab === 'trail') {
      if (activeTrailFilter !== 'ALL' && TRAIL_TABLES[activeTrailFilter]) {
        query = query.in('tabel', TRAIL_TABLES[activeTrailFilter]);
      }
      if (activeTrailUserFilter !== 'All') {
        query = query.eq('user_email', activeTrailUserFilter);
      }
      query = query.or(TRAIL_APP_WRITTEN_FILTER);
    }

    // Apply Filter by PPJK
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && activePpjkFilter && activePpjkFilter !== 'All') {
      query = query.ilike('ppjk', `%${activePpjkFilter}%`);
    }

    // Apply Filter by Shipment Type
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeShipmentTypeFilter !== 'All') {
      query = query.eq('shipment_type', activeShipmentTypeFilter);
    }

    // Filter "Needs attention" (Invoice Recap kartu, 2026-10-01) -- id dari ringkasan KPI.
    // Ringkasan belum siap (null) = belum difilter; 0 id = daftar kosong tanpa query.
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && recapNeedsAttentionOnly && recapNeedsAttentionIds) {
      if (recapNeedsAttentionIds.length === 0) {
        setRecords([]);
        setTotalRecords(0);
        setLoading(false);
        return;
      }
      query = query.in('id', recapNeedsAttentionIds);
    }

    // Apply Filter by A/N
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeAnFilter !== 'All') {
      query = query.eq('a_n', activeAnFilter);
    }

    // Apply Filter by Impor An
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit' && activeImporAnFilter !== 'All') {
      query = query.eq('impor_an', activeImporAnFilter);
    }

    // Apply Filter by A/N (Rekapan Courier)
    if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && activeCourierAnFilter !== 'All') {
      query = query.eq('an', activeCourierAnFilter);
    }

    // Apply Filter by Impor An (Audit Courier)
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && activeCourierImporAnFilter !== 'All') {
      query = query.eq('impor_an', activeCourierImporAnFilter);
    }

    // Apply Date Filter
    if (filterStartDate) {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.gte('tgl_terima_email', filterStartDate);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.gte('tgl_ppjk', filterStartDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.gte('tgl_ppjk', filterStartDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.gte('tgl', filterStartDate);
      else if (activeMainTab === 'trail') query = query.gte('created_at', filterStartDate);
    }
    if (filterEndDate) {
      const endOfDay = `${filterEndDate} 23:59:59`;
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.lte('tgl_terima_email', endOfDay);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.lte('tgl', endOfDay);
      else if (activeMainTab === 'trail') query = query.lte('created_at', endOfDay);
    }

    // Apply Search
    if (debouncedSearch) {
      let searchCols: string[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') || (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')) {
        searchCols = restrictSearchCols('courier_audit', (courierAuditType === 'pib') ? ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'] : ['awb', 'vendor_inv_no', 'po_ori', 'vendor']);
      } else if (activeMainTab === 'sea_air') {
        searchCols = activeSubTab === 'sea_air_audit' ? SEA_AIR_AUDIT_SEARCH_COLS : ['no_aju', 'no_invoice', 'vendor', 'awb'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        searchCols = restrictSearchCols('courier_rekapan', ['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_validasi')) {
        searchCols = ['awb', 'jenis_dokumen', 'status_validasi'];
      } else if (activeMainTab === 'trail') {
        searchCols = ['awb', 'no_dokumen', 'user_email', 'tabel'];
      }
      if (searchCols.length > 0) {
        const orCondition = searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply Ordering -- state default (2026-09, lihat isDefaultSortState()) pakai `sort_order`
    // (hasil drag reorder) di tab yang punya kolom ini (Audit Courier PIB/CN & Invoice Recap
    // Courier, lihat sql/022_courier_row_sort_order.sql) -- tab lain (Sea & Air/Trail/dll) TIDAK
    // punya kolom ini, TETAP pakai perilaku lama. Sort eksplisit by kolom lain TIDAK berubah.
    const usesRowSortOrder = isDefaultSortState(sortColumn, sortDirection) && (
      (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && (courierAuditType === 'pib' || courierAuditType === 'cn')) ||
      // Invoice Recap tab "All PPJK" SENGAJA TIDAK pakai sort_order (2026-09-29) -- default-nya
      // Created At terbaru LANGSUNG (jatuh ke cabang `.order(sortColumn)` di bawah, sortColumn
      // default = 'created_at' desc). Tab per-PPJK tetap sort_order, yg nilai awalnya sekarang
      // diturunkan dari Email Received Date oleh trigger DB (fn_set_default_sort_order).
      (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && activePpjkFilter !== 'All')
    );
    if (usesRowSortOrder) {
      // Tiebreak `id` WAJIB -- baris n8n di detik yg sama punya `sort_order` kembar; tanpa ini
      // urutan antar-halaman `.range()` tidak stabil (baris bisa dobel/terlewat saat pindah halaman).
      query = query.order('sort_order', { ascending: true }).order('id', { ascending: true });
    } else if (sortColumn) {
      let actualSortCol = sortColumn;
      if (actualSortCol === 'po_no' && tab?.table === 'rekapan_seaair') {
         actualSortCol = 'po_detail';
      }
      query = query.order(actualSortCol, { ascending: sortDirection === 'asc', nullsFirst: false });
    }

    // Apply Pagination
    const startIndex = (page - 1) * pageSize;
    query = query.range(startIndex, startIndex + pageSize - 1);

    const { data, count, error } = await query

    if (!error) {
      setTotalRecords(count || 0)
      
      let costValidations: any[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && data && data.length > 0) {
        const awbList = data.map(r => r.awb).filter(Boolean);
        if (awbList.length > 0) {
          const chunkSize = 25;
          let allCvData: any[] = [];
          for (let i = 0; i < awbList.length; i += chunkSize) {
            const chunkAwbs = awbList.slice(i, i + chunkSize);
            const { data: cvDataChunk } = await supabase.from('tabel_cost_validasi').select('awb, status_cost').in('awb', chunkAwbs).order('created_at', { ascending: false });
            if (cvDataChunk) allCvData = [...allCvData, ...cvDataChunk];
          }
          costValidations = allCvData;
        }
      }

      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && data && data.length > 0) {
        const pibIds = data.filter(r => r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive').map(r => r.id).filter(Boolean);
        if (pibIds.length > 0) {
          const chunkSize = 50;
          let allSptnpData: any[] = [];
          for (let i = 0; i < pibIds.length; i += chunkSize) {
            const chunkIds = pibIds.slice(i, i + chunkSize);
            const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
            if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
          }
          const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
          data.forEach(r => {
            if ((r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive') && sptnpMap[r.id] !== undefined) {
              r.sptnp_total = sptnpMap[r.id];
            }
          });
        }
        await mergeChecklistData(data, courierAuditType === 'pib' ? 'pib' : (courierAuditType === 'cn' ? 'cn' : undefined));

        // Live-compute 7 kolom turunan Audit Courier (lihat COURIER_AUDIT_CALC_FIELDS di atas)
        // -- data langsung dari `tabel_audit_pib`/`tabel_audit_cn` tidak selalu punya `jenis_dokumen`
        // (kolom itu murni tag di sisi frontend utk tab Draft), jadi dipastikan dari courierAuditType.
        const jenisDokumenNormal = courierAuditType === 'pib' ? 'PIB' : 'CN';
        data.forEach((r: any) => Object.assign(r, computeCourierAuditCalc(r, r.jenis_dokumen || jenisDokumenNormal, r.manual_override_fields)));
      }

      // Badge persentase di tombol "Doc Validation"/"Cost. Validation" halaman Audit Courier --
      // lihat fetchCourierValidationBadgePct() (~baris 918) utk detail formula & alasan
      // dipisah jadi fungsi module-level (dipanggil dari jalur ini DAN jalur khusus tab
      // Draft/archive di atas, supaya badge-nya konsisten muncul di kedua jalur fetch).
      let courierDocValidationPctMap: Record<string, number> = {};
      let courierCostValidationPctMap: Record<string, number> = {};
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && data && data.length > 0) {
        const taggedRows = data.map(r => ({ ...r, jenis_dokumen: r.jenis_dokumen || (courierAuditType === 'pib' ? 'PIB' : courierAuditType === 'cn' ? 'CN' : r.jenis_dokumen) }));
        const badgeResult = await fetchCourierValidationBadgePct(taggedRows);
        courierDocValidationPctMap = badgeResult.docPctMap;
        courierCostValidationPctMap = badgeResult.costPctMap;
      }

      let seaAirAuditStatusMap: Record<string, string> = {};
      let seaAirDocValidationPctMap: Record<string, number | null> = {};
      let seaAirCostValidationPctMap: Record<string, number | null> = {};
      let seaAirChecklistPctMap: Record<string, number | null> = {};
      // Invoice Recap tampilan kartu (2026-10-01) -- daftar "issues" (needs attention) & penanda
      // apakah data Doc/Cost/Checklist SUDAH ada (titik abu kalau belum), dari data yg SAMA dgn badge %.
      let seaAirRecapIssuesMap: Record<string, RecapIssue[]> = {};
      let seaAirRecapHasMap: Record<string, { doc: boolean; cost: boolean; checklist: boolean }> = {};
      if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') && data && data.length > 0) {
        const seaairIds = Array.from(new Set(data.map(r => r.seaair_id).filter(Boolean)));
        if (seaairIds.length > 0) {
          const chunkSize = 50;
          let allStatusData: any[] = [];
          let allMatriksData: any[] = [];
          let allCostValidasiData: any[] = [];
          let allChecklistData: any[] = [];
          let allCatatanKonfirmasiData: any[] = [];
          for (let i = 0; i < seaairIds.length; i += chunkSize) {
            const chunkIds = seaairIds.slice(i, i + chunkSize);
            const { data: statusChunk } = await supabase.from('tabel_audit_seaair').select('id, status').in('id', chunkIds);
            if (statusChunk) allStatusData = [...allStatusData, ...statusChunk];
            const { data: matriksChunk } = await supabase.from('dokumen_validasi_matriks_seaair').select('seaair_id, checks').in('seaair_id', chunkIds);
            if (matriksChunk) allMatriksData = [...allMatriksData, ...matriksChunk];
            const { data: costChunk } = await supabase.from('cost_validasi_seaair').select('seaair_id, checks').in('seaair_id', chunkIds);
            if (costChunk) allCostValidasiData = [...allCostValidasiData, ...costChunk];
            const { data: checklistChunk } = await supabase.from('dokumen_checklist_seaair').select('seaair_id, pct_kelengkapan, dokumen_kurang').in('seaair_id', chunkIds);
            if (checklistChunk) allChecklistData = [...allChecklistData, ...checklistChunk];
            // Catatan Konfirmasi Manual per-Segmen (2026-09) -- lihat catatan di bawah dekat
            // seaAirCostValidationPctMap, dipakai supaya badge % ikut memperhitungkan segmen
            // yang sudah dikonfirmasi manual, SAMA persis dgn ValidasiShipmentInvoiceLengkap.tsx.
            const { data: catatanChunk } = await supabase.from('cost_validasi_catatan_seaair').select('seaair_id, section, status_konfirmasi').in('seaair_id', chunkIds);
            if (catatanChunk) allCatatanKonfirmasiData = [...allCatatanKonfirmasiData, ...catatanChunk];
          }
          seaAirAuditStatusMap = Object.fromEntries(allStatusData.map(r => [r.id, r.status]));

          // Persentase badge tombol Checklist -- langsung dari kolom tersimpan pct_kelengkapan
          // (bukan hasil hitung ulang, beda dari Doc/Cost Validation di atas), diisi lewat
          // ChecklistModal/SeaAirChecklistModal saat checklist disimpan. Lihat juga
          // rec.pct_kelengkapan di CourierAuditRowGroup yang dapat nilai sama tapi dari
          // mergeChecklistData() (tabel dokumen_checklist, courier).
          seaAirChecklistPctMap = Object.fromEntries(allChecklistData.map(c => [c.seaair_id, Number(c.pct_kelengkapan) || 0]));

          // Persentase akurasi Doc Validation -- replika PERSIS formula globalStats di
          // SeaAirValidasiModal.tsx: cuma hitung check yang sudah punya nilai match (true/false),
          // "Belum dicek" (match null) tidak masuk total. `relaxSeaAirDocChecks()` WAJIB dipanggil
          // DULU (2026-09, fix bug badge tidak sinkron dgn modal) -- `c.match` MENTAH tersimpan di
          // DB bisa basi (nilai match versi TERAKHIR DISIMPAN, dari algoritma fuzzy match lama),
          // sementara modal SELALU hitung ulang `c.match` di client tiap dibuka. Tanpa baris ini,
          // badge & modal bisa tampil % berbeda walau baca tabel yang sama persis.
          seaAirDocValidationPctMap = Object.fromEntries(allMatriksData.map(m => {
            const checks = relaxSeaAirDocChecks(m.checks);
            let total = 0, match = 0;
            checks.forEach((c: any) => {
              if (c.match !== null && c.match !== undefined) {
                total++;
                if (c.match === true) match++;
              }
            });
            return [m.seaair_id, total > 0 ? Math.round((match / total) * 100) : 0];
          }));

          // Persentase akurasi Cost Validation -- `computeSeaAirCostGlobalStats()`
          // (SeaAirCostValidasiHelpers.ts) SATU-SATUNYA sumber formula ini, SAMA PERSIS dipakai
          // globalStats di ValidasiShipmentInvoiceLengkap.tsx -- termasuk pengecualian segmen
          // SURVEYOR dari total & segmen yang SUDAH dikonfirmasi manual (2026-09, lihat
          // `allCatatanKonfirmasiData`) ikut status_konfirmasi (MATCH/MISMATCH) yang DIPILIH
          // staf, bukan otomatis MATCH semua. Badge % di sini WAJIB tetap sinkron dgn modal,
          // JANGAN duplikat logic hitungnya lagi di tempat ketiga manapun.
          const confirmationBySeaairId = new Map<string, Map<string, 'MATCH' | 'MISMATCH'>>();
          allCatatanKonfirmasiData.forEach((c: any) => {
            if (!confirmationBySeaairId.has(c.seaair_id)) confirmationBySeaairId.set(c.seaair_id, new Map());
            confirmationBySeaairId.get(c.seaair_id)!.set(c.section, c.status_konfirmasi);
          });
          seaAirCostValidationPctMap = Object.fromEntries(allCostValidasiData.map(cv => {
            const confirmation = confirmationBySeaairId.get(cv.seaair_id) || new Map();
            return [cv.seaair_id, computeSeaAirCostGlobalStats(cv.checks, confirmation).pct];
          }));

          // Issues & penanda data (tampilan kartu Invoice Recap) -- computeRecapIssues
          // (SeaAirRecapHelpers.ts) SATU-SATUNYA definisi "needs attention".
          const matriksBy = new Map(allMatriksData.map(m => [String(m.seaair_id), m.checks]));
          const costBy = new Map(allCostValidasiData.map(c => [String(c.seaair_id), c.checks]));
          const checklistBy = new Map(allChecklistData.map(c => [String(c.seaair_id), c]));
          seaairIds.forEach(sid => {
            const k = String(sid);
            seaAirRecapIssuesMap[k] = computeRecapIssues({
              checklist: checklistBy.get(k) || null,
              matriksChecks: matriksBy.has(k) ? matriksBy.get(k) : null,
              costChecks: costBy.has(k) ? costBy.get(k) : null,
              confirmations: confirmationBySeaairId.get(sid as any) || confirmationBySeaairId.get(k as any) || new Map(),
            });
            seaAirRecapHasMap[k] = { doc: matriksBy.has(k), cost: costBy.has(k), checklist: checklistBy.has(k) };
          });
        }
      }

      const enrichedData = (data || []).map(r => {
        if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) {
          r.audit_status = r.seaair_id ? (seaAirAuditStatusMap[r.seaair_id] ?? null) : null;
          r.doc_validation_pct = r.seaair_id ? (seaAirDocValidationPctMap[r.seaair_id] ?? 0) : 0;
          r.cost_validation_pct = r.seaair_id ? (seaAirCostValidationPctMap[r.seaair_id] ?? 0) : 0;
          r.checklist_pct = r.seaair_id ? (seaAirChecklistPctMap[r.seaair_id] ?? 0) : 0;
          r.recap_issues = r.seaair_id ? (seaAirRecapIssuesMap[String(r.seaair_id)] || []) : [];
          r.recap_has = r.seaair_id ? (seaAirRecapHasMap[String(r.seaair_id)] || { doc: false, cost: false, checklist: false }) : { doc: false, cost: false, checklist: false };
        }
        if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
          const cv = costValidations.find(c => c.awb === r.awb);
          r.status_cost = cv ? cv.status_cost : null;

          Object.assign(r, computeCourierRekapanCalc(r, r.manual_override_fields));
        } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) {
          // Kalkulasi 7 kolom turunan (computeCourierAuditCalc) SUDAH dijalankan lebih dulu di
          // `data.forEach` sebelum enrichedData ini dibangun (lihat di atas) -- JANGAN hitung
          // ulang di sini pakai formula lama (dulu ada duplikat formula di sini yg CUMA jalan
          // utk CN & tidak sadar `manual_override_fields`, jadi menimpa balik hasil yg sudah
          // benar dgn nilai lama. Dihapus, bukan lupa).
          const badgeKey = (r.jenis_dokumen === 'CN' || courierAuditType === 'cn') ? `cn_${r.id}` : `pib_${r.id}`;
          r.doc_validation_pct = courierDocValidationPctMap[badgeKey] ?? 0;
          r.cost_validation_pct = courierCostValidationPctMap[badgeKey] ?? 0;
        } else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) {
          // BALANCE/ASURANSI dihitung ulang di sini juga (bukan cuma saat inline-edit/create)
          // supaya kolomnya langsung menampilkan hasil kalkulasi dari data yang sudah ada,
          // tanpa user harus mengedit salah satu dari 4 kolom sumbernya dulu -- sebelumnya
          // rumus ini CUMA jalan saat trigger edit, jadi baris yang belum pernah diedit selalu
          // tampil "-" walau datanya lengkap.
          Object.assign(r, computeSeaAirBalanceAsuransi(r));
        }
        return r;
      });
      setRecords(enrichedData);
    } else {
      console.error(error);
      setFetchError(error.message);
    }
    setLoading(false)
  }, [tab, activeMainTab, activeSubTab, courierAuditType, seaAirAuditType, activeTrailFilter, activeTrailUserFilter, activePpjkFilter, activeShipmentTypeFilter, activeAnFilter, activeImporAnFilter, activeCourierAnFilter, activeCourierImporAnFilter, debouncedSearch, sortColumn, sortDirection, page, pageSize, filterStartDate, filterEndDate, restrictSearchCols, recapNeedsAttentionOnly, recapNeedsAttentionIds])

  // ── Indikator "Outstanding" (badge angka di pojok tab) ──────────────────────
  // Rekapan Courier: jumlah baris per-tab PPJK yang Submit Date-nya masih kosong (key 'All' =
  // total gabungan, dipakai di tab "Semua PPJK"). Audit Courier: jumlah baris yang Tgl Submit
  // Nas-nya masih kosong -- Draft (PIB+CN status ARCHIVED), PIB (tabel_audit_pib non-ARCHIVED),
  // CN (tabel_audit_cn non-ARCHIVED). Rule counter ini WAJIB SERAGAM di ketiga tab (2026-09,
  // permintaan eksplisit user -- badge tab PIB/CN dulu tidak ada sama sekali, HARUS pakai logika
  // "outstanding" yang sama persis dengan tab Draft: hitung dari NAS Submit Date kosong, BUKAN
  // total seluruh baris). Dihitung terpisah dari `records` karena tabel dipaginasi -- `records`
  // cuma berisi 1 halaman, tidak merepresentasikan total keseluruhan.
  const [ppjkOutstandingMap, setPpjkOutstandingMap] = useState<Record<string, number>>({})
  const [courierAuditOutstandingCounts, setCourierAuditOutstandingCounts] = useState<{ archive: number | null, pib: number | null, cn: number | null }>({ archive: null, pib: null, cn: null })

  const fetchOutstandingCount = useCallback(async () => {
    if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') {
      let query = supabase.from('rekapan_courier').select('ppjk').is('submit_date', null).limit(20000)
      if (activeCourierAnFilter !== 'All') {
        query = query.eq('an', activeCourierAnFilter);
      }
      if (filterStartDate) query = query.gte('tgl_terima_email', filterStartDate);
      if (filterEndDate) query = query.lte('tgl_terima_email', `${filterEndDate} 23:59:59`);
      if (debouncedSearch) {
        const searchCols = restrictSearchCols('courier_rekapan', ['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
        query = query.or(searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
      }
      const { data, error } = await query;
      if (error || !data) {
        setPpjkOutstandingMap({});
        return;
      }
      const map: Record<string, number> = { All: data.length };
      data.forEach((r: any) => {
        let ppjk = r.ppjk && String(r.ppjk).trim().toUpperCase();
        if (ppjk && ppjk.startsWith('OWN ')) ppjk = ppjk.substring(4);
        if (ppjk) map[ppjk] = (map[ppjk] || 0) + 1;
      });
      setPpjkOutstandingMap(map);
      return;
    }
    setPpjkOutstandingMap({});

    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
      const buildQuery = (table: string, searchCols: string[], statusMode: 'archived' | 'active') => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true }).is('tgl_submit_nas', null)
        q = statusMode === 'archived' ? q.eq('status', 'ARCHIVED') : q.neq('status', 'ARCHIVED');
        if (activeCourierImporAnFilter !== 'All') q = q.eq('impor_an', activeCourierImporAnFilter);
        if (debouncedSearch) {
          q = q.or(searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
        }
        return q;
      }
      const pibSearchCols = ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'];
      const cnSearchCols = ['awb', 'vendor_inv_no', 'po_ori', 'vendor'];
      const [pibArchiveRes, cnArchiveRes, pibActiveRes, cnActiveRes] = await Promise.all([
        buildQuery('tabel_audit_pib', pibSearchCols, 'archived'),
        buildQuery('tabel_audit_cn', cnSearchCols, 'archived'),
        buildQuery('tabel_audit_pib', pibSearchCols, 'active'),
        buildQuery('tabel_audit_cn', cnSearchCols, 'active'),
      ]);
      setCourierAuditOutstandingCounts({
        archive: (pibArchiveRes.error || cnArchiveRes.error) ? null : (pibArchiveRes.count ?? 0) + (cnArchiveRes.count ?? 0),
        pib: pibActiveRes.error ? null : (pibActiveRes.count ?? 0),
        cn: cnActiveRes.error ? null : (cnActiveRes.count ?? 0),
      });
      return;
    }
    setCourierAuditOutstandingCounts({ archive: null, pib: null, cn: null });
  }, [activeMainTab, activeSubTab, activeCourierAnFilter, activeCourierImporAnFilter, filterStartDate, filterEndDate, debouncedSearch, restrictSearchCols])

  useEffect(() => {
    fetchOutstandingCount()
  }, [fetchOutstandingCount])

  // ── Audit PIB Sea & Air -- tampilan kartu (2026-09-30, lihat docs/claude/bunker-courier-seaair.md
  // "Audit PIB Sea & Air -- tampilan baru"). Semua di bawah HANYA aktif di tab sea_air_audit &
  // HANYA query baca (ringkasan KPI, status validasi Invoice Recap, nama PT). Tulis data tetap
  // lewat RPC lama (update_seaair_row/insert_seaair_row) dari modal Edit/Open.
  const isSeaAirAudit = activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit';
  const [seaAirViewMode, setSeaAirViewMode] = useState<'card' | 'list'>('card')
  const [seaAirSummary, setSeaAirSummary] = useState<SeaAirAuditSummary | null>(null)
  const [seaAirSummaryLoading, setSeaAirSummaryLoading] = useState(false)
  const [seaAirSummaryNonce, setSeaAirSummaryNonce] = useState(0)
  const [seaAirLinkInfo, setSeaAirLinkInfo] = useState<Record<string, SeaAirAuditLinkInfo>>({})
  const [seaAirCompanyNames, setSeaAirCompanyNames] = useState<Record<string, string>>({})
  const [seaAirDetailRecord, setSeaAirDetailRecord] = useState<any>(null)
  // `record: null` = Add manually, object = Edit PIB
  const [seaAirEditState, setSeaAirEditState] = useState<{ record: any | null } | null>(null)

  useEffect(() => {
    if (!isSeaAirAudit) return;
    let cancelled = false;
    fetchCompanyNameMap().then(map => { if (!cancelled) setSeaAirCompanyNames(map); });
    return () => { cancelled = true; };
  }, [isSeaAirAudit]);

  useEffect(() => {
    if (!isSeaAirAudit) { setSeaAirSummary(null); return; }
    let cancelled = false;
    setSeaAirSummaryLoading(true);
    fetchSeaAirAuditSummary({ importAn: activeImporAnFilter, startDate: filterStartDate, endDate: filterEndDate, search: debouncedSearch })
      .then(s => { if (!cancelled) setSeaAirSummary(s); })
      .finally(() => { if (!cancelled) setSeaAirSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isSeaAirAudit, activeImporAnFilter, filterStartDate, filterEndDate, debouncedSearch, seaAirSummaryNonce]);

  useEffect(() => {
    if (!isSeaAirAudit || records.length === 0) { setSeaAirLinkInfo({}); return; }
    let cancelled = false;
    fetchSeaAirAuditLinkInfo(records.map(r => r.id)).then(info => { if (!cancelled) setSeaAirLinkInfo(info); });
    return () => { cancelled = true; };
  }, [isSeaAirAudit, records]);

  // Refresh daftar + ringkasan + badge sidebar setelah aksi tulis apa pun di Audit PIB.
  const refreshSeaAirAudit = () => {
    fetchRecords();
    setSeaAirSummaryNonce(n => n + 1);
    notifySeaAirAuditChanged();
  };

  // Baca ulang 1 baris (dipakai jendela Open setelah Edit/ubah status).
  const reloadSeaAirRow = async (id: any) => {
    const { data, error } = await supabase.from('tabel_audit_seaair').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return { ...data, ...computeSeaAirBalanceAsuransi(data) };
  };

  const handleSeaAirSetStatus = async (rec: any, status: 'ARCHIVED' | 'LENGKAP') => {
    const { error } = await supabase.rpc('update_seaair_row', { p_id: rec.id, p_updates: { status } });
    if (error) {
      alert('Failed to update status: ' + error.message);
      return false;
    }
    const fresh = await reloadSeaAirRow(rec.id);
    if (fresh) setSeaAirDetailRecord(fresh);
    refreshSeaAirAudit();
    return true;
  };

  // ── Invoice Recap Sea & Air -- tampilan kartu (2026-10-01, lihat docs/claude/bunker-courier-seaair.md
  // "Invoice Recap Sea & Air -- tampilan baru"). HANYA aktif di tab sea_air_rekapan. Query baca
  // tambahan = ringkasan KPI; tulis data tetap lewat fungsi lama (handleInlineSaveRow, RPC Cost
  // Validation, Draft/Undraft, DeleteModal).
  const isSeaAirRekapan = activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan';
  const [seaAirRecapView, setSeaAirRecapView] = useState<'card' | 'list'>('card')
  const [recapSummary, setRecapSummary] = useState<RecapSummary | null>(null)
  const [recapSummaryLoading, setRecapSummaryLoading] = useState(false)
  const [recapSummaryNonce, setRecapSummaryNonce] = useState(0)
  const [recapDetailId, setRecapDetailId] = useState<any>(null)
  const [recapDetailSnapshot, setRecapDetailSnapshot] = useState<any>(null)
  const [recapEditRec, setRecapEditRec] = useState<any>(null)

  useEffect(() => {
    if (!isSeaAirRekapan) return;
    let cancelled = false;
    fetchCompanyNameMap().then(map => { if (!cancelled) setSeaAirCompanyNames(map); });
    return () => { cancelled = true; };
  }, [isSeaAirRekapan]);

  useEffect(() => {
    if (!isSeaAirRekapan) { setRecapSummary(null); return; }
    let cancelled = false;
    setRecapSummaryLoading(true);
    fetchRecapSummary({ shipmentType: activeShipmentTypeFilter, company: activeAnFilter, startDate: filterStartDate, endDate: filterEndDate, search: debouncedSearch })
      .then(s => {
        if (cancelled) return;
        setRecapSummary(s);
        const ids = s ? s.needsAttentionIds : null;
        // Set HANYA kalau isinya berubah -- array baru tiap refetch akan memicu fetchRecords ulang.
        setRecapNeedsAttentionIds(prev => (prev && ids && prev.length === ids.length && prev.every((v, i) => String(v) === String(ids[i]))) ? prev : ids);
      })
      .finally(() => { if (!cancelled) setRecapSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isSeaAirRekapan, activeShipmentTypeFilter, activeAnFilter, filterStartDate, filterEndDate, debouncedSearch, recapSummaryNonce]);

  const refreshRecap = () => {
    fetchRecords();
    setRecapSummaryNonce(n => n + 1);
    notifySeaAirRecapChanged(); // badge sidebar "needs attention"
  };

  // ── Audit Courier -- tampilan kartu (2026-10-01, mengikuti Audit PIB Sea & Air; lihat
  // docs/claude/courier-features.md "Audit Courier — tampilan baru"). Mode List = tabel & toolbar
  // lama APA ADANYA (Reorder, Edit Mode, Customize View, Export). Validasi = info saja, TIDAK pernah
  // mengunci Mark as audited (keputusan user). Kolom dibatasi role (getAllowedColumns) di semua tampilan.
  const isCourierAuditView = activeMainTab === 'courier' && activeSubTab === 'courier_audit';
  const [courierAuditView, setCourierAuditView] = useState<'card' | 'list'>('card')
  const [courierSummary, setCourierSummary] = useState<CourierAuditSummary | null>(null)
  const [courierSummaryLoading, setCourierSummaryLoading] = useState(false)
  const [courierSummaryNonce, setCourierSummaryNonce] = useState(0)
  const [courierValidationIncomplete, setCourierValidationIncomplete] = useState<number | null>(null)
  const [courierCompanyNames, setCourierCompanyNames] = useState<Record<string, string>>({})
  const [courierOpen, setCourierOpen] = useState<{ rec: any; tab: WindowTabKey } | null>(null)
  const [courierEditState, setCourierEditState] = useState<{ record: any | null; docType: CourierDocType } | null>(null)
  const [courierBusy, setCourierBusy] = useState(false)
  const courierColOk = makeColOk(isCourierAuditView ? getAllowedColumns('courier_audit') : null)
  const courierDocTypeOf = (rec: any): CourierDocType => courierDocType(rec, courierAuditType)

  useEffect(() => {
    if (!isCourierAuditView) return;
    let cancelled = false;
    fetchCompanyNameMap().then(map => { if (!cancelled) setCourierCompanyNames(map); });
    return () => { cancelled = true; };
  }, [isCourierAuditView]);

  useEffect(() => {
    if (!isCourierAuditView) { setCourierSummary(null); setCourierValidationIncomplete(null); return; }
    let cancelled = false;
    setCourierSummaryLoading(true);
    (async () => {
      const s = await fetchCourierAuditSummary({
        importAn: activeCourierImporAnFilter, startDate: filterStartDate, endDate: filterEndDate, search: debouncedSearch,
        searchColsPib: restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor']),
        searchColsCn: restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'po_ori', 'vendor']),
      });
      if (cancelled) return;
      setCourierSummary(s);
      setCourierSummaryLoading(false);
      // "Validation incomplete" = baris Draft yg salah satu tab validasi (yg boleh dilihat) < 100% /
      // belum ada -- persen dihitung dgn fungsi yg SAMA tombol Validation (mergeChecklistData +
      // fetchCourierValidationBadgePct). Info saja.
      if (!s || courierValidationTabs.length === 0) { setCourierValidationIncomplete(null); return; }
      const draftRows = s.draftRows;
      await mergeChecklistData(draftRows);
      const { docPctMap, costPctMap } = await fetchCourierValidationBadgePct(draftRows);
      if (cancelled) return;
      let n = 0;
      draftRows.forEach(r => {
        const key = r.jenis_dokumen === 'CN' ? `cn_${r.id}` : `pib_${r.id}`;
        const pct = rowValidationPct({ ...r, doc_validation_pct: docPctMap[key] ?? 0, cost_validation_pct: costPctMap[key] ?? 0 });
        if (courierValidationTabs.some(t => pct[t] === null || (pct[t] as number) < 100)) n++;
      });
      setCourierValidationIncomplete(n);
    })().catch(e => { console.error('[CourierAudit] ringkasan gagal', e); if (!cancelled) setCourierSummaryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCourierAuditView, activeCourierImporAnFilter, filterStartDate, filterEndDate, debouncedSearch, restrictSearchCols, courierSummaryNonce]);

  const refreshCourierAudit = () => {
    fetchRecords();
    fetchOutstandingCount();
    setCourierSummaryNonce(n => n + 1);
    notifyCourierAuditChanged(); // badge sidebar Draft
  };

  // Baca ulang 1 baris (enrich SAMA fetchRecords: auto-calc, kelengkapan, persen validasi) utk jendela Open.
  const reloadCourierRow = async (id: any, t: CourierDocType) => {
    const { data, error } = await supabase.from(courierTableOf(t)).select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const row: any = { ...data, jenis_dokumen: t };
    Object.assign(row, computeCourierAuditCalc(row, t, row.manual_override_fields));
    await mergeChecklistData([row], t === 'CN' ? 'cn' : 'pib');
    const { docPctMap, costPctMap } = await fetchCourierValidationBadgePct([row]);
    const key = t === 'CN' ? `cn_${row.id}` : `pib_${row.id}`;
    row.doc_validation_pct = docPctMap[key] ?? 0;
    row.cost_validation_pct = costPctMap[key] ?? 0;
    return row;
  };

  // Mark as audited / Move back to Draft dari jendela Open (logika SAMA tombol lama Undraft/Draft).
  const courierSetStatus = async (rec: any, target: 'audited' | 'draft') => {
    const t = courierDocTypeOf(rec);
    setCourierBusy(true);
    const ok = target === 'audited' ? await undraftCourierRecord(rec, t) : await archiveCourierRecord(rec, t);
    if (ok) {
      const fresh = await reloadCourierRow(rec.id, t);
      if (fresh) setCourierOpen(prev => (prev ? { ...prev, rec: fresh } : prev));
      refreshCourierAudit();
    }
    setCourierBusy(false);
    return ok;
  };
  const switchCourierView = (m: 'card' | 'list') => {
    if (m === 'card') {
      if (reorderMode) exitReorderMode();
      setCourierAuditEditMode(false);
    }
    setCourierAuditView(m);
  };

  // Baris yg sedang dibuka di jendela Open -- selalu ambil versi terbaru dari `records`; kalau baris
  // sudah tidak ada di halaman aktif (mis. difilter), pakai snapshot terakhir.
  const recapDetailRec = recapDetailId !== null
    ? (records.find(r => String(r.id) === String(recapDetailId)) || recapDetailSnapshot)
    : null;
  useEffect(() => {
    if (recapDetailId === null) return;
    const fresh = records.find(r => String(r.id) === String(recapDetailId));
    if (fresh) setRecapDetailSnapshot(fresh);
  }, [records, recapDetailId]);

  const handleRecapSave = async (rec: any, changes: Record<string, any>) => {
    const ok = await handleInlineSaveRow(rec.id, changes);
    if (ok) {
      setRecapDetailSnapshot((prev: any) => (prev && String(prev.id) === String(rec.id) ? { ...prev, ...changes } : prev));
      refreshRecap();
    }
    return ok;
  };

  // Buka kunci Submit to Finance (RPC fn_seaair_unlock_submit, sql/031) -- Admin saja, wajib alasan,
  // tercatat di audit trail oleh RPC-nya.
  const handleRecapUnlock = async (rec: any, reason: string) => {
    const { error } = await supabase.rpc('fn_seaair_unlock_submit', { p_rekapan_id: rec.id, p_reason: reason });
    if (error) {
      alert('Failed to unlock: ' + error.message);
      return false;
    }
    setRecapDetailSnapshot((prev: any) => (prev && String(prev.id) === String(rec.id) ? { ...prev, tgl_submit_finance: null, submit_unlock_reason: reason, submit_unlocked_at: new Date().toISOString() } : prev));
    refreshRecap();
    return true;
  };

  // Re-read nilai PIB dari snapshot AI (RPC fn_seaair_reread_from_ai, sql/031) -- Draft saja.
  const handleSeaAirReread = async (rec: any) => {
    const { error } = await supabase.rpc('fn_seaair_reread_from_ai', { p_seaair_id: rec.id });
    if (error) {
      alert('Failed to re-read from AI: ' + error.message);
      return false;
    }
    const fresh = await reloadSeaAirRow(rec.id);
    if (fresh) setSeaAirDetailRecord(fresh);
    refreshSeaAirAudit();
    return true;
  };

  const handleSeaAirOpenRecap = (rec: any) => {
    const key = String(rec?.awb || rec?.no_aju || '').trim();
    navigate(key ? `/sea-air/rekapan?q=${encodeURIComponent(key)}` : '/sea-air/rekapan');
  };

  const getExportData = async (startDate?: string, endDate?: string) => {
    if (!tab) return []
    if (!(activeMainTab === 'courier' && activeSubTab === 'courier_audit') && !tab.table) return []

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) {
      let queryPib = supabase.from('tabel_audit_pib').select('*').eq('status', 'ARCHIVED').limit(25000);
      let queryCn = supabase.from('tabel_audit_cn').select('*').eq('status', 'ARCHIVED').limit(25000);

      if (activeCourierImporAnFilter !== 'All') {
        queryPib = queryPib.eq('impor_an', activeCourierImporAnFilter);
        queryCn = queryCn.eq('impor_an', activeCourierImporAnFilter);
      }

      if (startDate) {
        queryPib = queryPib.gte('tgl_ppjk', startDate);
        queryCn = queryCn.gte('tgl_ppjk', startDate);
      }
      if (endDate) {
        const endOfDay = `${endDate} 23:59:59`;
        queryPib = queryPib.lte('tgl_ppjk', endOfDay);
        queryCn = queryCn.lte('tgl_ppjk', endOfDay);
      }
      if (debouncedSearch) {
        const searchColsPib = restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor']);
        const searchColsCn = restrictSearchCols('courier_audit', ['awb', 'vendor_inv_no', 'po_ori', 'vendor']);
        queryPib = queryPib.or(searchColsPib.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
        queryCn = queryCn.or(searchColsCn.map(col => `${col}.ilike.%${debouncedSearch}%`).join(','));
      }
      
      const [resPib, resCn] = await Promise.all([queryPib, queryCn]);
      
      // `sptnp_total` sudah ikut `select('*')` -- query ulang per-50-id dibuang (2026-09-28).
      const combined = [
        ...(resPib.data || []).map(r => ({ ...r, jenis_dokumen: 'PIB' })),
        ...(resCn.data || []).map(r => ({ ...r, jenis_dokumen: 'CN' }))
      ];

      combined.forEach(r => Object.assign(r, computeCourierAuditCalc(r, r.jenis_dokumen, r.manual_override_fields)));

      await mergeChecklistData(combined);

      // Export ikut urutan layar -- SAMA logic dgn fetchRecords() Draft branch (Created At
      // terbaru kalau belum ada sort eksplisit, else by sortColumn).
      if (isDefaultSortState(sortColumn, sortDirection)) {
        combined.sort(compareCreatedAtDesc);
      } else if (sortColumn) {
        combined.sort((a, b) => {
          const valA = a[sortColumn] || '';
          const valB = b[sortColumn] || '';
          if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
          if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return combined;
    }

    let fetchTarget = (tab as any).view || tab.table
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
      fetchTarget = courierAuditType === 'pib' ? 'tabel_audit_pib' : 'tabel_audit_cn';
    }
    let query = supabase.from(fetchTarget).select('*').limit(50000)

    if (startDate) {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.gte('tgl_terima_email', startDate);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.gte('tgl_ppjk', startDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.gte('tgl_ppjk', startDate);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.gte('tgl', startDate);
      else if (activeMainTab === 'trail') query = query.gte('created_at', startDate);
    }
    if (endDate) {
      const endOfDay = `${endDate} 23:59:59`;
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) query = query.lte('tgl_terima_email', endOfDay);
      else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) query = query.lte('tgl_ppjk', endOfDay);
      else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) query = query.lte('tgl', endOfDay);
      else if (activeMainTab === 'trail') query = query.lte('created_at', endOfDay);
    }

    // Apply Archive Filter
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && ((courierAuditType === 'pib') || (courierAuditType === 'cn'))) {
      query = query.neq('status', 'ARCHIVED');
    }

    // Apply Archive Filter (Sea & Air Audit) -- sama persis fetchRecords() (Draft/Audited/All)
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
      if (seaAirAuditType === 'draft') query = query.eq('status', 'ARCHIVED');
      else if (seaAirAuditType !== 'all') query = query.neq('status', 'ARCHIVED');
    }

    // Apply Filter by Trail -- jenis aksi (Courier / Sea & Air / Bunker / Semua)
    if (activeMainTab === 'trail') {
      if (activeTrailFilter !== 'ALL' && TRAIL_TABLES[activeTrailFilter]) {
        query = query.in('tabel', TRAIL_TABLES[activeTrailFilter]);
      }
      if (activeTrailUserFilter !== 'All') {
        query = query.eq('user_email', activeTrailUserFilter);
      }
      query = query.or(TRAIL_APP_WRITTEN_FILTER);
    }

    // Apply Filter by PPJK
    if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') && activePpjkFilter && activePpjkFilter !== 'All') {
      query = query.ilike('ppjk', `%${activePpjkFilter}%`);
    }

    // Apply Filter by Shipment Type
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeShipmentTypeFilter !== 'All') {
      query = query.eq('shipment_type', activeShipmentTypeFilter);
    }

    // Apply Filter by A/N
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && activeAnFilter !== 'All') {
      query = query.eq('a_n', activeAnFilter);
    }

    // Apply Filter by Impor An
    if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit' && activeImporAnFilter !== 'All') {
      query = query.eq('impor_an', activeImporAnFilter);
    }

    // Apply Filter by A/N (Rekapan Courier)
    if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && activeCourierAnFilter !== 'All') {
      query = query.eq('an', activeCourierAnFilter);
    }

    // Apply Filter by Impor An (Audit Courier)
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && activeCourierImporAnFilter !== 'All') {
      query = query.eq('impor_an', activeCourierImporAnFilter);
    }

    // Apply Search
    if (debouncedSearch) {
      let searchCols: string[] = [];
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') || (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')) {
        searchCols = restrictSearchCols('courier_audit', (courierAuditType === 'pib') ? ['awb', 'vendor_inv_no', 'no_pib', 'po_ori', 'vendor'] : ['awb', 'vendor_inv_no', 'po_ori', 'vendor']);
      } else if (activeMainTab === 'sea_air') {
        searchCols = activeSubTab === 'sea_air_audit' ? SEA_AIR_AUDIT_SEARCH_COLS : ['no_aju', 'no_invoice', 'vendor', 'awb'];
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        searchCols = restrictSearchCols('courier_rekapan', ['awb', 'no_invoice', 'vendor', 'po_pt_imi', 'ppjk']);
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_validasi')) {
        searchCols = ['awb', 'jenis_dokumen', 'status_validasi'];
      } else if (activeMainTab === 'trail') {
        searchCols = ['awb', 'no_dokumen', 'user_email', 'tabel'];
      }
      if (searchCols.length > 0) {
        const orCondition = searchCols.map(col => `${col}.ilike.%${debouncedSearch}%`).join(',');
        query = query.or(orCondition);
      }
    }

    // Apply Ordering -- pola sama fetchRecords() (2026-09, lihat isDefaultSortState()).
    const usesRowSortOrderExport = isDefaultSortState(sortColumn, sortDirection) && (
      (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && (courierAuditType === 'pib' || courierAuditType === 'cn')) ||
      // Invoice Recap tab "All PPJK" SENGAJA TIDAK pakai sort_order (2026-09-29) -- default-nya
      // Created At terbaru LANGSUNG (jatuh ke cabang `.order(sortColumn)` di bawah, sortColumn
      // default = 'created_at' desc). Tab per-PPJK tetap sort_order, yg nilai awalnya sekarang
      // diturunkan dari Email Received Date oleh trigger DB (fn_set_default_sort_order).
      (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && activePpjkFilter !== 'All')
    );
    if (usesRowSortOrderExport) {
      // Tiebreak `id` WAJIB -- baris n8n di detik yg sama punya `sort_order` kembar; tanpa ini
      // urutan antar-halaman `.range()` tidak stabil (baris bisa dobel/terlewat saat pindah halaman).
      query = query.order('sort_order', { ascending: true }).order('id', { ascending: true });
    } else if (sortColumn) {
      let actualSortCol = sortColumn;
      if (actualSortCol === 'po_no' && tab?.table === 'rekapan_seaair') {
         actualSortCol = 'po_detail';
      }
      query = query.order(actualSortCol, { ascending: sortDirection === 'asc', nullsFirst: false });
    }

    const { data, error } = await query

    if (error) {
      console.error(error);
      throw error;
    }

    if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && data && data.length > 0) {
      const pibIds = data.filter(r => r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive').map(r => r.id).filter(Boolean);
      if (pibIds.length > 0) {
        const chunkSize = 50;
        let allSptnpData: any[] = [];
        for (let i = 0; i < pibIds.length; i += chunkSize) {
          const chunkIds = pibIds.slice(i, i + chunkSize);
          const { data: sptnpChunk } = await supabase.from('tabel_audit_pib').select('id, sptnp_total').in('id', chunkIds);
          if (sptnpChunk) allSptnpData = [...allSptnpData, ...sptnpChunk];
        }
        const sptnpMap = Object.fromEntries(allSptnpData.map(r => [r.id, r.sptnp_total]));
        data.forEach(r => {
          if ((r.jenis_dokumen === 'PIB' || courierAuditType === 'pib' || courierAuditType === 'archive') && sptnpMap[r.id] !== undefined) {
            r.sptnp_total = sptnpMap[r.id];
          }
        });
      }
      await mergeChecklistData(data, courierAuditType === 'pib' ? 'pib' : (courierAuditType === 'cn' ? 'cn' : undefined));

      const jenisDokumenNormalExport = courierAuditType === 'pib' ? 'PIB' : 'CN';
      data.forEach((r: any) => Object.assign(r, computeCourierAuditCalc(r, r.jenis_dokumen || jenisDokumenNormalExport, r.manual_override_fields)));
    }

    return (data || []).map(r => {
      if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) {
        Object.assign(r, computeCourierRekapanCalc(r, r.manual_override_fields));
      } else if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) {
        // Kalkulasi courier_audit sudah dijalankan lewat `data.forEach` di atas (lihat
        // jenisDokumenNormalExport) -- JANGAN duplikat formula di sini lagi (lihat catatan sama
        // di fetchRecords/enrichedData).
      } else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) {
        Object.assign(r, computeSeaAirBalanceAsuransi(r));
      }
      return r;
    });
  }

  const handleDelete = (record: any) => {
    setDeleteRecord(record);
  };

  // "Move back to Draft" (dulu label "📦 Unarchived"/"🗄️ Draft") -- RPC fn_archive_pib/cn.
  const archiveCourierRecord = async (record: any, docType?: CourierDocType): Promise<boolean> => {
    try {
      const isPib = docType ? docType === 'PIB' : (record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib'));
      const rpcName = isPib ? 'fn_archive_pib' : 'fn_archive_cn';
      const { error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: record.id });
      if (error) throw error;
      return true;
    } catch (e: any) {
      alert('Failed to move back to Draft: ' + e.message);
      return false;
    }
  };
  const handleArchive = async (record: any) => {
    setLoading(true);
    const ok = await archiveCourierRecord(record);
    if (ok) { fetchRecords(); setCourierSummaryNonce(n => n + 1); notifyCourierAuditChanged(); }
    setLoading(false);
  };

    
  const handleInlineSaveRow = async (id: number | string, payload: any, silent?: boolean) => {
    try {
      const cleanedPayload = { ...payload };
      Object.keys(cleanedPayload).forEach(key => {
        if (cleanedPayload[key] === '') cleanedPayload[key] = null;
      });

      let activeCols: any[] = [];
      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') activeCols = SEA_AIR_AUDIT_COLS;
      else if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') activeCols = SEA_AIR_REKAPAN_COLS;
      // PIB_COLS+CN_COLS (bukan COURIER_COLS, yg isinya kolom Rekapan) -- perlu tipe num/pct yg
      // BENAR utk kolom2 auto-calculate (lihat COURIER_AUDIT_CALC_FIELDS) supaya konversi Number
      // di bawah jalan sebelum dipakai hitung ulang dependency-nya.
      else if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') activeCols = [...PIB_COLS, ...CN_COLS];
      else if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') activeCols = COURIER_COLS;

      activeCols.forEach(c => {
        if ((c.type === 'num' || c.type === 'pct' || c.type === 'num_dash_if_null' || c.type === 'num_dash_null_2dec') && cleanedPayload[c.key] !== null && cleanedPayload[c.key] !== undefined) {
          cleanedPayload[c.key] = Number(cleanedPayload[c.key]);
        }
      });

      let error = null;
      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
        // BALANCE = VALAS DPP * KURS NDPBM - (TOTAL INV FREIGHT + ITEM PRICE (RP))
        // ASURANSI = 0.5% * (TOTAL INV FREIGHT + ITEM PRICE (RP))
        // Inline edit cuma kirim field yang berubah (bukan seluruh record) -- jadi kalau salah
        // satu dari 4 kolom sumber formula ini diubah, hitung ulang balance/asuransi dari
        // gabungan record lama + perubahan baru, lalu ikut disisipkan ke payload yang dikirim.
        if (SEA_AIR_BALANCE_DEP_KEYS.some(k => k in cleanedPayload)) {
          const record = records.find(r => String(r.id) === String(id));
          const { balance, asuransi } = computeSeaAirBalanceAsuransi({ ...record, ...cleanedPayload });
          cleanedPayload.balance = balance;
          cleanedPayload.asuransi = asuransi;
        }

        const res = await supabase.rpc('update_seaair_row', { p_id: id, p_updates: cleanedPayload });
        error = res.error;
      } else if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') {
        const record = records.find(r => String(r.id) === String(id));
        if (!record) return false;
        
        const rekapanPayload = { ...cleanedPayload };
        if (rekapanPayload.cbm !== undefined) {
          const cbmVal = rekapanPayload.cbm;
          delete rekapanPayload.cbm;
          if (record.seaair_id) {
            const res2 = await supabase.from('tabel_audit_seaair').update({ cbm: cbmVal }).eq('id', record.seaair_id);
            if (res2.error) error = res2.error;
          }
        }
        
        if (!error && Object.keys(rekapanPayload).length > 0) {
          const res = await supabase.from('rekapan_seaair').update(rekapanPayload).eq('id', id);
          error = res.error;
        }
      } else if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
        const record = records.find(r => String(r.id) === String(id));
        if (!record) return false;

        let targetTable = '';
        if (record.jenis_dokumen === 'PIB' || cleanedPayload.jenis_dokumen === 'PIB') {
          targetTable = 'tabel_audit_pib';
        } else if (record.jenis_dokumen === 'CN' || cleanedPayload.jenis_dokumen === 'CN') {
          targetTable = 'tabel_audit_cn';
        } else {
          targetTable = record.no_pib ? 'tabel_audit_pib' : 'tabel_audit_cn';
        }

        // 7 kolom turunan (COURIER_AUDIT_CALC_FIELDS) -- inline edit cuma kirim field yg berubah
        // (bukan seluruh record), jadi hitung ulang dari gabungan record lama + perubahan baru.
        // Kalau salah satu field kalkulasi itu sendiri yg diketik langsung lewat inline edit,
        // tandai override permanen (manual_override_fields) supaya tidak ditimpa lagi ke depannya.
        const jenisDokumenForCalc = targetTable === 'tabel_audit_cn' ? 'CN' : 'PIB';
        const existingOverrides: string[] = Array.isArray(record.manual_override_fields) ? record.manual_override_fields : [];
        const newlyOverridden = COURIER_AUDIT_CALC_FIELDS.filter(f => f in cleanedPayload);
        const mergedOverrides = Array.from(new Set([...existingOverrides, ...newlyOverridden]));

        const mergedRow = { ...record, ...cleanedPayload };
        const calc = computeCourierAuditCalc(mergedRow, jenisDokumenForCalc, mergedOverrides);
        Object.assign(cleanedPayload, calc);
        Object.keys(cleanedPayload).forEach(k => { if (cleanedPayload[k] === '') cleanedPayload[k] = null; });
        if (mergedOverrides.length !== existingOverrides.length) {
          cleanedPayload.manual_override_fields = mergedOverrides;
        }

        const res = await supabase.from(targetTable).update(cleanedPayload).eq('id', id);
        error = res.error;
      } else if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') {
        const record = records.find(r => String(r.id) === String(id));

        // 6 kolom turunan Rekapan Courier (lihat COURIER_REKAPAN_CALC_FIELDS) -- pola sama
        // persis dgn courier_audit di atas: hitung ulang dari gabungan record lama + perubahan
        // baru, field kalkulasi yg diketik langsung ditandai override permanen.
        if (record) {
          const existingOverrides: string[] = Array.isArray(record.manual_override_fields) ? record.manual_override_fields : [];
          const newlyOverridden = COURIER_REKAPAN_CALC_FIELDS.filter(f => f in cleanedPayload);
          const mergedOverrides = Array.from(new Set([...existingOverrides, ...newlyOverridden]));

          const mergedRow = { ...record, ...cleanedPayload };
          const calc = computeCourierRekapanCalc(mergedRow, mergedOverrides);
          Object.assign(cleanedPayload, calc);
          Object.keys(cleanedPayload).forEach(k => { if (cleanedPayload[k] === '') cleanedPayload[k] = null; });
          if (mergedOverrides.length !== existingOverrides.length) {
            cleanedPayload.manual_override_fields = mergedOverrides;
          }
        }

        const res = await supabase.from('rekapan_courier').update(cleanedPayload).eq('id', id);
        error = res.error;
      } else {
        return false;
      }
      
      if (error) throw error;
      
      setRecords(prev => prev.map(r => String(r.id) === String(id) ? { ...r, ...cleanedPayload } : r));
      return true;
    } catch (err: any) {
      // Selalu log ke console (walau silent=true, dipakai Save All/Save per-baris) -- laporan
      // user 2026-09 "Save All tidak berfungsi, tidak bisa simpan ke database" tapi TIDAK ada
      // alert manapun yg kelihatan; console.error ini supaya error asli dari Supabase (RLS/kolom
      // salah/dst) kelihatan di DevTools kalau kejadian lagi, bukan cuma "gagal diam-diam".
      console.error('handleInlineSaveRow failed:', { id, payload, error: err });
      if (!silent) alert('Failed to save: ' + err.message);
      return false;
    }
  };

  // ── Edit massal Audit Courier & Rekapan Courier ──────────────────────────
  // getVal/setVal: nilai efektif sebuah field pakai pending edit kalau ada, kalau tidak pakai
  // nilai dari server. Simpan HANYA saat "Save All" diklik -- reuse handleInlineSaveRow per
  // baris (SATU-SATUNYA tempat resolusi target tabel PIB/CN & coercion angka, jangan tulis
  // ulang di sini) lewat Promise.all supaya paralel. Edit Mode (on/off) diatur TERPISAH dari
  // pending edits/save -- toggle 1 tombol di toolbar (lihat toolbarEditButton di render), TIDAK
  // otomatis mati setelah Save All supaya user bisa lanjut edit baris lain tanpa klik toggle lagi.
  const getCourierAuditVal = (r: any, field: string) => {
    const rowEdits = courierAuditPendingEdits[r.id];
    if (rowEdits && field in rowEdits) return rowEdits[field];
    return r[field];
  };
  const setCourierAuditVal = (r: any, field: string, value: any) => {
    setCourierAuditPendingEdits(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), [field]: value } }));
  };
  // Id di sini SENGAJA dibiarkan string (key asli object, TIDAK di-Number()-kan) -- kolom
  // bigint/int8 (mis. `tabel_audit_pib.id`) dikembalikan Supabase-js sbg string, sedangkan int4
  // sbg number; handleInlineSaveRow membandingkannya balik ke `records` via String(r.id) ===
  // String(id), jadi id yang diteruskan ke situ HARUS tetap representasi string yang identik
  // dgn key aslinya di pendingEdits, bukan hasil re-parsing Number() yang bisa beda tipe dari
  // `r.id` asli dan bikin `.find()` gagal cocok (root cause "Save All tidak tersimpan" 2026-09).
  const courierAuditChangedRowIds = Object.entries(courierAuditPendingEdits)
    .filter(([, edits]) => edits && Object.keys(edits).length > 0)
    .map(([id]) => id);

  const handleSaveAllCourierAuditEdits = async () => {
    setSavingCourierAuditEdits(true);
    const ids = courierAuditChangedRowIds;
    const results = await Promise.all(ids.map(async id => ({ id, ok: await handleInlineSaveRow(id, courierAuditPendingEdits[id], true) })));
    setSavingCourierAuditEdits(false);
    const failedIds = results.filter(r => !r.ok).map(r => r.id);
    setCourierAuditPendingEdits(prev => {
      const next = { ...prev };
      results.filter(r => r.ok).forEach(r => delete next[r.id]);
      return next;
    });
    if (failedIds.length > 0) {
      alert(`Failed to save ${failedIds.length} of ${ids.length} row(s). Please check the browser console (F12) for the exact error and try again.`);
    }
    // Refetch supaya tabel benar-benar mencerminkan state DB terkini (bukan cuma patch optimis
    // dari handleInlineSaveRow) -- laporan user 2026-09 "Save All tidak berfungsi, tidak bisa
    // simpan ke database".
    if (results.some(r => r.ok)) fetchRecords();
  };
  const handleDiscardAllCourierAuditEdits = () => {
    setCourierAuditPendingEdits({});
  };
  // Simpan 1 baris saja (dipakai tombol "Save" di panel Action tiap baris, terpisah dari
  // "Save All" toolbar) -- dikonfirmasi user 2026-09: harus ada tombol simpan sendiri utk edit
  // per-baris, bukan cuma "Save All" yang commit SEMUA baris pending sekaligus.
  const handleSaveOneCourierAuditRow = async (id: number | string) => {
    const payload = courierAuditPendingEdits[id];
    if (!payload || Object.keys(payload).length === 0) return true;
    const ok = await handleInlineSaveRow(id, payload, true);
    if (ok) {
      setCourierAuditPendingEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      fetchRecords();
    } else {
      alert('Failed to save this row. Please check the browser console (F12) for the exact error and try again.');
    }
    return ok;
  };

  const getCourierRekapanVal = (r: any, field: string) => {
    const rowEdits = courierRekapanPendingEdits[r.id];
    if (rowEdits && field in rowEdits) return rowEdits[field];
    return r[field];
  };
  const setCourierRekapanVal = (r: any, field: string, value: any) => {
    setCourierRekapanPendingEdits(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), [field]: value } }));
  };
  // Sama alasan dgn courierAuditChangedRowIds di atas -- id dibiarkan string, jangan Number().
  const courierRekapanChangedRowIds = Object.entries(courierRekapanPendingEdits)
    .filter(([, edits]) => edits && Object.keys(edits).length > 0)
    .map(([id]) => id);

  const handleSaveAllCourierRekapanEdits = async () => {
    setSavingCourierRekapanEdits(true);
    const ids = courierRekapanChangedRowIds;
    const results = await Promise.all(ids.map(async id => ({ id, ok: await handleInlineSaveRow(id, courierRekapanPendingEdits[id], true) })));
    setSavingCourierRekapanEdits(false);
    const failedIds = results.filter(r => !r.ok).map(r => r.id);
    setCourierRekapanPendingEdits(prev => {
      const next = { ...prev };
      results.filter(r => r.ok).forEach(r => delete next[r.id]);
      return next;
    });
    if (failedIds.length > 0) {
      alert(`Failed to save ${failedIds.length} of ${ids.length} row(s). Please check the browser console (F12) for the exact error and try again.`);
    }
    if (results.some(r => r.ok)) fetchRecords();
  };
  const handleDiscardAllCourierRekapanEdits = () => {
    setCourierRekapanPendingEdits({});
  };
  // Sama pola dgn handleSaveOneCourierAuditRow di atas -- tombol "Save" per-baris terpisah.
  const handleSaveOneCourierRekapanRow = async (id: number | string) => {
    const payload = courierRekapanPendingEdits[id];
    if (!payload || Object.keys(payload).length === 0) return true;
    const ok = await handleInlineSaveRow(id, payload, true);
    if (ok) {
      setCourierRekapanPendingEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      fetchRecords();
    } else {
      alert('Failed to save this row. Please check the browser console (F12) for the exact error and try again.');
    }
    return ok;
  };

  const handleUpdateVessel = async (rekapanId: number, poNo: string, newVessel: string) => {
    try {
      const { error } = await supabase.rpc('update_rekapan_po_vessel', {
        p_rekapan_id: rekapanId,
        p_po_no: poNo,
        p_vessel: newVessel
      });
      if (error) throw error;
      fetchRecords(); // re-fetch to see the updated data
    } catch (err: any) {
      alert('Failed to update vessel: ' + err.message);
    }
  };

  // "Mark as audited" (dulu label "Undraft") -- RPC fn_undraft_pib/cn + Doc Acceptance otomatis.
  // TIDAK ada syarat validasi lengkap (keputusan user 2026-10-01: ada kasus invoice freight memang
  // tidak ditagihkan). Dipakai tombol tabel lama, jendela Open & form "Save & mark as audited".
  const undraftCourierRecord = async (record: any, docType?: CourierDocType): Promise<boolean> => {
    try {
      const isPib = docType ? docType === 'PIB' : (record.jenis_dokumen === 'PIB' || record.tabel === 'tabel_audit_pib' || (courierAuditType === 'pib'));
      const rpcName = isPib ? 'fn_undraft_pib' : 'fn_undraft_cn';
      const { error } = await supabase.rpc(rpcName, { [isPib ? 'p_pib_id' : 'p_cn_id']: record.id });
      if (error) throw error;
      // Doc Acceptance diisi OTOMATIS tanggal sistem saat Undraft diklik (2026-09, permintaan
      // user -- PIC Invoice Recap & PIC Audit orang berbeda, isi manual menyulitkan tracking).
      // Update terpisah (bukan parameter RPC fn_undraft_pib/cn yg sudah ada -- RPC ini dibuat
      // user sendiri di Supabase, JANGAN diubah signature-nya tanpa konfirmasi) via .update()
      // langsung, pola sama handleInlineSaveRow (RLS courier_audit yg menggerbangi, bukan RPC).
      // Revisi 2026-09-28: HANYA kalau masih kosong -- nilai yg sudah ada (mis. diisi via Edit di
      // tab Draft, tanggal lama/baru apa pun) TIDAK BOLEH ditimpa. Syarat `.is(null)` ada DI DALAM
      // 1 perintah UPDATE yg sama (atomik, bukan baca-dulu-lalu-tulis); baris yg sudah terisi =
      // 0 baris ter-update, bukan error. "Kosong" = NULL saja -- app selalu simpan '' sbg null
      // (EditModal/handleInlineSaveRow).
      // Tanggal LOKAL (bukan toISOString() = UTC -- dulu Undraft jam 00:00-06:59 WIB terisi
      // tanggal kemarin).
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const targetTable = isPib ? 'tabel_audit_pib' : 'tabel_audit_cn';
      const { error: docAcceptanceError } = await supabase.from(targetTable)
        .update({ doc_acceptance: todayIso })
        .eq('id', record.id)
        .is('doc_acceptance', null);
      if (docAcceptanceError) console.error('Failed to auto-fill Doc Acceptance on undraft:', docAcceptanceError);
      return true;
    } catch (e: any) {
      alert('Failed to mark as audited: ' + e.message);
      return false;
    }
  };
  const handleUndraft = async (record: any) => {
    setLoading(true);
    const ok = await undraftCourierRecord(record);
    if (ok) { fetchRecords(); setCourierSummaryNonce(n => n + 1); notifyCourierAuditChanged(); }
    setLoading(false);
  };

  // ── Drag & Drop Reorder -- BARIS (2026-09, PER HALAMAN sejak 2026-09-28) ─────────────────────
  // HANYA tab PIB/CN (Audit Courier) & tab per-PPJK (Invoice Recap), gated `canEdit`, filter
  // dilarang (lihat `showReorderButton`). Tanpa filter & dgn urutan default, 1 halaman
  // `fetchRecords()` = potongan UTUH urutan global scope tab -> posisi baru cukup dihitung dari
  // tetangga (di halaman, atau 1 baris dari halaman sebelah kalau drop di ujung). Lihat
  // docs/claude/courier-features.md.

  // Scope = tabel + kondisi tab (SAMA PERSIS dgn fetchRecords() utk tab ini, TANPA filter krn
  // filter memang tidak boleh aktif saat Reorder). `null` = tab ini tidak punya Reorder Mode.
  const getReorderScope = (): { table: string, scope: (q: any) => any } | null => {
    if (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && (courierAuditType === 'pib' || courierAuditType === 'cn')) {
      return { table: courierAuditType === 'pib' ? 'tabel_audit_pib' : 'tabel_audit_cn', scope: q => q.neq('status', 'ARCHIVED') };
    }
    if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && activePpjkFilter !== 'All') {
      return { table: 'rekapan_courier', scope: q => q.ilike('ppjk', `%${activePpjkFilter}%`) };
    }
    return null;
  };

  type SortRow = { id: any, sort_order: number | null };

  // Baris di posisi GLOBAL `pos` (0-based) dalam scope tab, urut `sort_order`+`id` (SAMA dgn
  // fetchRecords). `null` kalau di luar rentang.
  const fetchScopeRowAt = async (pos: number): Promise<SortRow | null> => {
    const s = getReorderScope();
    if (!s || pos < 0) return null;
    const { data, error } = await s.scope(supabase.from(s.table).select('id, sort_order'))
      .order('sort_order', { ascending: true }).order('id', { ascending: true })
      .range(pos, pos);
    if (error) throw error;
    return data?.[0] ?? null;
  };

  // Tetangga terlalu rapat/kembar -> rapikan ulang `sort_order` SEMUA baris tabel (lintas scope,
  // mis. PPJK/status lain ikut) yg nilainya di rentang [before, after], dibagi rata di antara nilai
  // distinct terdekat di luar rentang itu (`lo`/`hi`) -- urutan relatif baris lain TIDAK berubah,
  // baris yg dipindah disisipkan TEPAT setelah `before`.
  const respaceSortOrder = async (table: string, movedId: any, before: SortRow, after: SortRow) => {
    const v1 = before.sort_order as number, v2 = after.sort_order as number;
    const [loRes, hiRes, blockRes] = await Promise.all([
      supabase.from(table).select('sort_order').lt('sort_order', v1).order('sort_order', { ascending: false }).limit(1),
      supabase.from(table).select('sort_order').gt('sort_order', v2).order('sort_order', { ascending: true }).limit(1),
      supabase.from(table).select('id, sort_order').gte('sort_order', v1).lte('sort_order', v2)
        .order('sort_order', { ascending: true }).order('id', { ascending: true }).limit(SORT_ORDER_RESPACE_MAX + 1),
    ]);
    if (loRes.error) throw loRes.error;
    if (hiRes.error) throw hiRes.error;
    if (blockRes.error) throw blockRes.error;
    if ((blockRes.data || []).length > SORT_ORDER_RESPACE_MAX) {
      throw new Error(`more than ${SORT_ORDER_RESPACE_MAX} rows share the same order value here`);
    }
    const block: SortRow[] = (blockRes.data || []).filter((r: SortRow) => String(r.id) !== String(movedId));
    const beforeIdx = block.findIndex(r => String(r.id) === String(before.id));
    if (beforeIdx === -1) throw new Error('neighbour row not found, please refresh and try again');
    const ordered: SortRow[] = [...block.slice(0, beforeIdx + 1), { id: movedId, sort_order: null }, ...block.slice(beforeIdx + 1)];
    const lo: number = loRes.data?.[0]?.sort_order ?? v1 - SORT_ORDER_GAP;
    const hi: number = hiRes.data?.[0]?.sort_order ?? v2 + SORT_ORDER_GAP;
    const step = (hi - lo) / (ordered.length + 1);
    if (!(step > SORT_ORDER_MIN_GAP)) throw new Error('no room left between neighbouring rows');
    const updates = ordered
      .map((r, i) => ({ id: r.id, value: lo + step * (i + 1), old: r.sort_order }))
      .filter(u => u.value !== u.old);
    for (let i = 0; i < updates.length; i += 50) {
      const results = await Promise.all(updates.slice(i, i + 50).map(u =>
        supabase.from(table).update({ sort_order: u.value }).eq('id', u.id)
      ));
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    }
  };

  // Taruh 1 baris di antara `before`/`after` (tetangga di scope tab SETELAH dipindah; `null` =
  // ujung paling atas/bawah). Return nilai baru, atau `null` kalau jalur respace dipakai (nilai
  // baris lain ikut berubah -> pemanggil WAJIB refetch).
  const placeRowBetween = async (table: string, movedId: any, before: SortRow | null, after: SortRow | null): Promise<number | null> => {
    const b = before?.sort_order, a = after?.sort_order;
    if (before && after && b != null && a != null && a - b < SORT_ORDER_MIN_GAP) {
      await respaceSortOrder(table, movedId, before, after);
      return null;
    }
    const value = computeDroppedSortOrder(b, a);
    const { error } = await supabase.from(table).update({ sort_order: value }).eq('id', movedId);
    if (error) throw error;
    return value;
  };

  // Keluar Reorder Mode -- kembalikan pageSize user sebelumnya (halaman dipilih supaya baris
  // pertama yg terlihat tetap di layar). TIDAK panggil fetchRecords() manual: `records` sudah
  // sinkron DB (tiap drag disimpan + diupdate lokal), dan kalau pageSize berubah fetch ulang jalan
  // otomatis lewat deps -- fetch manual di sini justru bisa balapan dgn closure pageSize lama.
  const exitReorderMode = () => {
    setReorderMode(false);
    if (prevPageSizeRef.current != null) {
      const ps = prevPageSizeRef.current;
      prevPageSizeRef.current = null;
      setPage(Math.floor(((page - 1) * pageSize) / ps) + 1);
      setPageSize(ps);
    }
  };

  const handleToggleReorderMode = () => {
    if (reorderMode) {
      exitReorderMode();
      return;
    }
    // Halaman baru dipilih supaya baris PERTAMA yg sedang terlihat tetap ada di layar.
    prevPageSizeRef.current = pageSize;
    setPage(Math.floor(((Math.min(page, Math.ceil(totalRecords / pageSize) || 1)) - 1) * pageSize / REORDER_PAGE_SIZE) + 1);
    setPageSize(REORDER_PAGE_SIZE);
    // Reorder Mode SELALU di atas urutan default (sort_order) -- reset sort eksplisit kolom lain.
    setSortColumn('created_at');
    setSortDirection('desc');
    setReorderMode(true);
    // Edit Mode & Reorder Mode saling menonaktifkan (2026-09). Pending edit TIDAK dibuang (sama
    // perilaku toggle Edit Mode off biasa) -- masih ada kalau Edit Mode dinyalakan lagi.
    setCourierAuditEditMode(false);
    setCourierRekapanEditMode(false);
  };

  const handleRowDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || reorderSaving) return;
    const s = getReorderScope();
    if (!s) return;
    const oldIndex = records.findIndex(r => String(r.id) === String(active.id));
    const newIndex = records.findIndex(r => String(r.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const pageStart = (page - 1) * pageSize;
    const newRows: any[] = arrayMove(records, oldIndex, newIndex);
    setRecords(newRows); // optimistic
    const movedRow = newRows[newIndex];

    setReorderSaving(true);
    try {
      // Drop di ujung halaman -> tetangga-nya ada di halaman sebelah (posisinya tidak bergeser krn
      // baris yg dipindah berasal dari halaman ini).
      const before: SortRow | null = newIndex > 0 ? newRows[newIndex - 1] : await fetchScopeRowAt(pageStart - 1);
      const after: SortRow | null = newIndex < newRows.length - 1 ? newRows[newIndex + 1] : await fetchScopeRowAt(pageStart + newRows.length);
      const value = await placeRowBetween(s.table, movedRow.id, before, after);
      if (value == null) await fetchRecords();
      else setRecords(prev => prev.map(r => String(r.id) === String(movedRow.id) ? { ...r, sort_order: value } : r));
    } catch (e: any) {
      console.error('Failed to persist row reorder:', e);
      alert('Failed to save new row order: ' + e.message);
      fetchRecords(); // kembalikan tampilan ke urutan asli DB
    } finally {
      setReorderSaving(false);
    }
  };

  // Pindah baris ke posisi GLOBAL `position` (1-based, nomor di badge kolom No.) -- boleh lintas
  // halaman. Setelah tersimpan, tabel loncat ke halaman tempat baris itu mendarat.
  const handleMoveRowTo = async (rec: any, position: number) => {
    const s = getReorderScope();
    if (!s || reorderSaving) return;
    const pageStart = (page - 1) * pageSize;
    const idxInPage = records.findIndex(r => String(r.id) === String(rec.id));
    if (idxInPage === -1 || totalRecords < 1) return;
    const current = pageStart + idxInPage;
    const target = Math.max(0, Math.min(totalRecords - 1, position - 1));
    if (target === current) return;

    setReorderSaving(true);
    try {
      // Tetangga di urutan AKHIR = baris di urutan SEKARANG (baris yg dipindah belum dihitung):
      // naik -> [target-1, target]; turun -> [target, target+1].
      const [before, after] = target < current
        ? await Promise.all([fetchScopeRowAt(target - 1), fetchScopeRowAt(target)])
        : await Promise.all([fetchScopeRowAt(target), fetchScopeRowAt(target + 1)]);
      await placeRowBetween(s.table, rec.id, before, after);
      const targetPage = Math.floor(target / pageSize) + 1;
      if (targetPage !== page) setPage(targetPage); // fetch ulang otomatis lewat deps fetchRecords
      else await fetchRecords();
    } catch (e: any) {
      console.error('Failed to move row:', e);
      alert('Failed to move row: ' + e.message);
      fetchRecords();
    } finally {
      setReorderSaving(false);
    }
  };

  // ── Drag & Drop Reorder -- KOLOM (2026-09) ──────────────────────────────────────────────────
  // GLOBAL (tabel Supabase `table_column_order`, sql/023_...), 1 baris per "menu" (SAMA partisi
  // dgn Customize View -- lihat `activeCourierCustomizeMenu`/`orderedActiveCols` di render body,
  // AMAN direferensikan di sini walau dideklarasikan lebih bawah krn closure ini baru dieksekusi
  // saat event drag beneran terjadi, bukan saat definisi).
  const handleColumnDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeCourierCustomizeMenu) return;
    const dataCols = orderedActiveCols.filter((c: any) => c.type !== 'index');
    const oldIndex = dataCols.findIndex((c: any) => c.key === active.id);
    const newIndex = dataCols.findIndex((c: any) => c.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newKeys = arrayMove(dataCols, oldIndex, newIndex).map((c: any) => c.key);
    if (activeCourierCustomizeMenu === 'courier_audit') setCourierAuditColumnOrder(newKeys);
    else setCourierRekapanColumnOrder(newKeys);
    const { error } = await supabase.from('table_column_order').upsert(
      { menu: activeCourierCustomizeMenu, column_order: newKeys, updated_by: user?.id },
      { onConflict: 'menu' }
    );
    if (error) {
      console.error('Failed to persist column reorder:', error);
      alert('Failed to save new column order: ' + error.message);
    }
  };

  // Dipicu dari halaman Rekapan Sea & Air -- record di sini adalah baris rekapan_seaair,
  // jadi update status-nya menyasar tabel_audit_seaair lewat seaair_id (bukan record.id).
  const handleDraftSeaAir = async (record: any) => {
    if (!record.seaair_id) {
      alert('The related Audit record was not found for this record.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.rpc('update_seaair_row', { p_id: record.seaair_id, p_updates: { status: 'ARCHIVED' } });
      if (error) throw error;
      fetchRecords();
    } catch (e: any) {
      alert('Failed to move to Draft: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUndraftSeaAir = async (record: any) => {
    if (!record.seaair_id) {
      alert('The related Audit record was not found for this record.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.rpc('update_seaair_row', { p_id: record.seaair_id, p_updates: { status: 'LENGKAP' } });
      if (error) throw error;
      fetchRecords();
    } catch (e: any) {
      alert('Failed to undraft: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Dashboard · BeeHive'
    // Jangan reset search, dll di sini secara lgsg kecuali kalau pindah tab beneran
  }, [])
  
  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Kita biarkan ppjkList di client side saja sbg referensi yang ada di halaman saat ini
  const cleanPpjk = (val: string) => val.replace(/^OWN\s+/i, '').trim().toUpperCase()

  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const validPage = Math.min(page, totalPages);
  const startIndex = (validPage - 1) * pageSize;

  const activeCols = (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'pib') 
    ? PIB_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'cn') 
    ? CN_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditType === 'archive')
    ? (() => {
        // Tab Draft gabung baris PIB+CN, tapi header-nya pakai PIB_COLS -- PIB_COLS TIDAK punya
        // kolom 'kurs_bi' (cuma dimiliki CN_COLS, PIB pakai 'kurs_ndpbm'), jadi baris CN di tab
        // ini dulu nilai Kurs BI (Rp)-nya tidak kelihatan sama sekali walau tetap tersimpan di DB.
        // Disisipkan manual di sini, tepat setelah kolom 'kurs_ndpbm' biar posisinya senada.
        const base = [{ key: 'jenis_dokumen', label: 'Type', type: 'text' }, ...PIB_COLS.filter(c => c.key !== 'jenis_dokumen')];
        const idx = base.findIndex(c => c.key === 'kurs_ndpbm');
        const kursBiCol = { key: 'kurs_bi', label: 'Kurs BI (Rp)', type: 'num' };
        const withKursBi = idx === -1 ? [...base, kursBiCol] : [...base.slice(0, idx + 1), kursBiCol, ...base.slice(idx + 1)];
        // Sama alasannya dgn kurs_bi di atas -- `sanksi_adm` cuma ada di CN_COLS, tapi tab Draft
        // (form Add Data-nya) butuh field ini kelihatan juga saat Document Type dipilih 'CN'
        // (formula Total PIB/CN butuh Sanksi ADM utk jalur CN, lihat COURIER_AUDIT_CALC_FIELDS).
        return [...withKursBi, { key: 'sanksi_adm', label: 'Admin Penalty', type: 'num' }];
      })()
    : activeTabId === 'sea_air_audit'
    ? SEA_AIR_AUDIT_COLS
    : activeTabId === 'sea_air_rekapan'
    ? SEA_AIR_REKAPAN_COLS.filter(c => {
        // Lift Off cuma relevan untuk shipment FCL (container) -- sembunyikan kolomnya
        // saat filter LCL/AIR aktif, bukan cuma di-dash-kan seperti sebelumnya.
        if ((activeShipmentTypeFilter === 'LCL' || activeShipmentTypeFilter === 'AIR') && ['lift_off_vendor', 'lift_off_biaya', 'lift_off_split'].includes(c.key)) return false;
        // Inspeksi & Handling cuma relevan untuk shipment SEA -- sembunyikan saat filter AIR aktif.
        if (activeShipmentTypeFilter === 'AIR' && ['inspeksi_vendor', 'inspeksi_biaya', 'inspeksi_split', 'handling_vendor', 'handling_biaya', 'handling_split'].includes(c.key)) return false;
        return true;
      })
    : activeTabId === 'trail'
    ? TRAIL_COLS 
    : (activeMainTab === 'courier' && activeSubTab === 'courier_validasi')
    ? VALIDASI_COLS
    : COURIER_COLS

  // Customize View -- filter kolom yg ditampilkan di tabel (thead + row), HANYA utk Audit Courier
  // & Rekapan Courier. `activeCols` (di atas) TETAP UTUH -- masih dipakai apa adanya utk
  // EditModal/AddRowModal/Export, supaya field yg disembunyikan dari tampilan tabel tetap bisa
  // diedit/di-export.
  const activeCourierCustomizeMenu: 'courier_audit' | 'courier_rekapan' | null =
    activeMainTab === 'courier' && activeSubTab === 'courier_audit' ? 'courier_audit'
    : activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' ? 'courier_rekapan'
    : null;
  const activeCourierHiddenCols = activeCourierCustomizeMenu === 'courier_audit'
    ? courierAuditHiddenCols
    : activeCourierCustomizeMenu === 'courier_rekapan'
    ? courierRekapanHiddenCols
    : null;
  // Urutan kolom GLOBAL hasil drag (2026-09, lihat table_column_order/reorderCols()) -- DIPAKAI
  // DULU sebelum filter hidden-set, 2 concern independen (urutan vs visibility) TIDAK saling
  // ganggu. Kalau belum pernah di-drag (`storedKeys` null), reorderCols() balikin `activeCols`
  // apa adanya (urutan array literal PIB_COLS/CN_COLS/COURIER_COLS, perilaku lama).
  const orderedActiveCols = activeCourierCustomizeMenu === 'courier_audit'
    ? reorderCols(activeCols, courierAuditColumnOrder)
    : activeCourierCustomizeMenu === 'courier_rekapan'
    ? reorderCols(activeCols, courierRekapanColumnOrder)
    : activeCols;
  // Batas kolom PER ROLE (2026-09-29, `role_page_access.visible_columns` via getAllowedColumns) --
  // diterapkan SEBELUM Customize View (per-user) supaya user tidak bisa membuka lagi kolom di luar
  // izin role-nya. Kolom 'index' (No.) selalu tampil. `null` = semua kolom (Admin / role tanpa
  // batasan). Otomatis ikut ke tabel & Export (keduanya pakai `visibleCols`).
  const roleAllowedCols = activeCourierCustomizeMenu ? getAllowedColumns(activeCourierCustomizeMenu) : null;
  const roleVisibleCols = roleAllowedCols
    ? orderedActiveCols.filter(c => c.type === 'index' || roleAllowedCols.has(c.key))
    : orderedActiveCols;
  const visibleCols = activeCourierHiddenCols
    ? roleVisibleCols.filter(c => c.type === 'index' || !activeCourierHiddenCols.has(c.key))
    : roleVisibleCols;
  // Form Edit/Add Data ikut dibatasi kolom role (kalau role terbatas kebetulan juga punya akses
  // EDIT -- keputusan user 2026-09-29, konsisten dgn tabel). Tanpa batasan = `activeCols` utuh
  // (perilaku lama: form tetap tampilkan kolom yg disembunyikan via Customize View).
  const editFormCols = roleAllowedCols
    ? activeCols.filter(c => c.type === 'index' || roleAllowedCols.has(c.key))
    : activeCols;

  // Drag & Drop Reorder (2026-09) -- sejak 2026-09-28 Reorder Mode PER HALAMAN, tabel SELALU render
  // dari `records` (paginasi server biasa); alias `displayRows` dipertahankan utk render di bawah.
  // Sensor pointer dgn `activationConstraint` kecil (8px) -- cegah klik biasa (mis. buka
  // panel Action baris lain) kesenggol jadi drag tidak sengaja.
  const displayRows = records;
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── Toolbar Courier Audit/Invoice Recap (2026-09) -- lihat docs/claude/courier-features.md ──
  const isCourierAuditTab = activeMainTab === 'courier' && activeSubTab === 'courier_audit';
  const isCourierRekapanTab = activeMainTab === 'courier' && activeSubTab === 'courier_rekapan';
  const isCourierToolbar = isCourierAuditTab || isCourierRekapanTab;
  // Tab yg urutan DEFAULT-nya dari kolom `sort_order` (Audit PIB/CN = Doc Acceptance, Invoice Recap
  // per-PPJK = Email Received Date, + drag manual), BUKAN kolom Created At langsung (Audit Draft &
  // Invoice Recap "All PPJK", 2026-09-29). Di state default, panah sort di header "Created At"
  // disembunyikan (`headerSortColumn`) supaya tidak menyesatkan di tab ber-`sort_order`.
  const courierDefaultUsesSortOrder = (isCourierAuditTab && courierAuditType !== 'archive') || (isCourierRekapanTab && activePpjkFilter !== 'All');
  const headerSortColumn = courierDefaultUsesSortOrder && isDefaultSortState(sortColumn, sortDirection) ? '' : sortColumn;
  const courierEditModeCanEdit = (isCourierAuditTab && canEdit('courier_audit')) || (isCourierRekapanTab && canEdit('courier_rekapan'));
  const courierEditModeOn = isCourierAuditTab ? courierAuditEditMode : isCourierRekapanTab ? courierRekapanEditMode : false;
  // Edit Mode & Reorder Mode saling menonaktifkan -- nyalakan Edit Mode = keluar Reorder Mode dulu.
  const toggleCourierEditMode = () => {
    if (!courierEditModeOn && reorderMode) exitReorderMode();
    if (isCourierAuditTab) setCourierAuditEditMode(v => !v);
    else if (isCourierRekapanTab) setCourierRekapanEditMode(v => !v);
  };
  // "Filter aktif" = Search terisi, rentang tanggal terisi, ATAU Company selain "All". Tab
  // Draft-PIB-CN/PPJK TIDAK dihitung filter di sini (itu scope tab, diatur `reorderTabEligible`).
  const courierFilterActive = isCourierToolbar && (
    search.trim() !== '' || !!filterStartDate || !!filterEndDate ||
    (isCourierAuditTab ? activeCourierImporAnFilter !== 'All' : activeCourierAnFilter !== 'All')
  );
  // Reorder Mode HANYA di tab PIB/CN (Audit, bukan Draft) & tab per-PPJK (Invoice Recap, bukan
  // "All PPJK"), dan disembunyikan TOTAL (bukan disabled) selama ada filter aktif.
  const reorderTabEligible = (isCourierAuditTab && canEdit('courier_audit') && courierAuditType !== 'archive')
    || (isCourierRekapanTab && canEdit('courier_rekapan') && activePpjkFilter !== 'All');
  const showReorderButton = reorderTabEligible && !courierFilterActive;
  // User isi filter SAAT Reorder Mode aktif -> keluar otomatis (pakai `search` mentah, bukan
  // `debouncedSearch`, supaya langsung keluar begitu mulai mengetik).
  useEffect(() => {
    if (reorderMode && courierFilterActive) exitReorderMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reorderMode, courierFilterActive]);

  const dateRangeEl = (
    <div className={`flex gap-1.5 items-center rounded-full pl-2.5 pr-1.5 py-1 h-[38px] border shrink-0 ${TOOLBAR_GLASS}`}>
      <CalendarDays size={13} className="text-[#5A305A] shrink-0" />
      <input
        type="date"
        value={filterStartDate}
        onChange={e => setFilterStartDate(e.target.value)}
        className="w-[82px] text-[11px] bg-transparent focus:outline-none text-[#5A305A] cursor-pointer"
      />
      <span className="text-[#5A305A] text-xs">–</span>
      <input
        type="date"
        value={filterEndDate}
        onChange={e => setFilterEndDate(e.target.value)}
        className="w-[82px] text-[11px] bg-transparent focus:outline-none text-[#5A305A] cursor-pointer"
      />
      {(filterStartDate || filterEndDate) && (
        <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[#5A305A] hover:text-[#5A305A] ml-0.5 shrink-0">
           <X size={14} />
        </button>
      )}
    </div>
  );

  const searchEl = (
    <div className="relative shrink-0">
      <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A305A] pointer-events-none" />
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className={`w-32 rounded-full pl-8 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/15 focus:border-[#5A305A] focus:bg-white/90 focus:w-44 transition-all border ${TOOLBAR_GLASS}`}
      />
      {search && (
        <button
          onClick={() => setSearch('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A305A] hover:text-[#5A305A] focus:outline-none"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );

  const refreshBtnEl = (
    <button
      onClick={fetchRecords}
      title="Refresh"
      aria-label="Refresh"
      className={`w-[38px] p-0 rounded-full text-[#5A305A] hover:border-[#5A305A]/30 hover:text-[#5A305A] hover:bg-white/90 transition-all h-[38px] flex items-center justify-center border shrink-0 ${TOOLBAR_GLASS}`}
    >
      <RefreshCw size={14} />
    </button>
  );

  // `outline` = gaya outline hijau (Courier Audit/Invoice Recap, supaya tidak bersaing dgn Add
  // Data yg jadi satu-satunya tombol solid). Tab lain tetap hijau solid lama.
  const renderExportBtn = (outline: boolean) => (
    <button
      onClick={() => {
        const title = (activeMainTab === 'courier' && activeSubTab === 'courier_audit')
          ? ((courierAuditType === 'pib') ? 'PIB' : 'CN')
          : (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') ? 'Courier Recap'
          : (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') ? 'Sea & Air Audit'
          : (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') ? 'Sea & Air Recap'
          : 'Document Validation'
        let dateFieldLabel = undefined;
        if ((activeMainTab === 'courier' && activeSubTab === 'courier_audit')) dateFieldLabel = 'Filter by PPJK Date';
        else if ((activeMainTab === 'courier' && activeSubTab === 'courier_rekapan')) dateFieldLabel = 'Filter by Email Received Date';
        else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit')) dateFieldLabel = 'Filter by PPJK Date';
        else if ((activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) dateFieldLabel = 'Filter by Date';

        const splitByPoDetail =
          (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') ? 'sea_air_rekapan' :
          (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') ? 'courier_rekapan' :
          undefined;
        // `visibleCols` (BUKAN `activeCols` mentah) -- Export Excel sekarang ikut
        // Customize View aktif (2026-09, permintaan user: "export = cerminan persis
        // tampilan layar"). `visibleCols` SUDAH otomatis fallback ke `activeCols`
        // penuh (SEMUA kolom default) kalau user belum pernah kustomisasi apa pun
        // ATAU utk tab yang tidak punya Customize View (Sea & Air Audit/Rekapan,
        // Document Validation) -- lihat definisinya di atas, TIDAK perlu cabang
        // kondisi tambahan di sini.
        setExportModalState({ title, cols: visibleCols, dateFieldLabel, splitByPoDetail })
      }}
      disabled={reorderMode}
      title={reorderMode ? 'Selesaikan Reorder dulu' : undefined}
      className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all h-[38px] flex justify-center items-center gap-1.5 shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
        outline ? 'bg-white text-emerald-700 border-emerald-500 hover:bg-emerald-50' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
      }`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
      Export
    </button>
  );

  const addDataBtnEl = (
    (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit' && canEdit('sea_air_audit')) ||
    (activeMainTab === 'courier' && activeSubTab === 'courier_audit' && canEdit('courier_audit')) ||
    (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && canEdit('courier_rekapan'))
  ) ? (
    <button
      onClick={() => (isCourierAuditView ? setCourierEditState({ record: null, docType: courierAuditType === 'cn' ? 'CN' : 'PIB' }) : setShowAddRowModal(true))}
      className="px-3 py-2 rounded-full bg-[#5A305A] hover:bg-[#4a2749] text-white text-xs font-semibold border border-[#5A305A] transition-all h-[38px] flex justify-center items-center gap-1.5 shadow-sm shrink-0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Data
    </button>
  ) : null;

  return (
    <>
      {showCustomizeView && (
        <CustomizeViewModal
          title="Customize View"
          allCols={(() => {
            // Pilihan Customize View dibatasi kolom yg diizinkan role user (2026-09-29).
            const base = showCustomizeView === 'courier_audit' ? COURIER_AUDIT_CUSTOMIZABLE_COLS : COURIER_REKAPAN_CUSTOMIZABLE_COLS;
            const allowed = getAllowedColumns(showCustomizeView);
            return allowed ? base.filter(c => allowed.has(c.key)) : base;
          })()}
          hiddenKeys={showCustomizeView === 'courier_audit' ? courierAuditHiddenCols : courierRekapanHiddenCols}
          onCancel={() => setShowCustomizeView(null)}
          onSave={(newHiddenKeys) => saveHiddenCols(showCustomizeView, newHiddenKeys)}
        />
      )}

      {editRecord && tab && (
        <EditModal
          record={editRecord}
          tab={tab}
          cols={editFormCols}
          onClose={() => setEditRecord(null)}
          onSaved={fetchRecords}
        />
      )}

      {showAddRowModal && tab && (
        <EditModal
          record={(activeMainTab === 'courier' && activeSubTab === 'courier_audit') ? { jenis_dokumen: courierAuditType === 'cn' ? 'CN' : 'PIB' } : {}}
          tab={tab}
          cols={editFormCols}
          isCreate
          createDefaults={(activeMainTab === 'courier' && activeSubTab === 'courier_audit') ? { status: 'ARCHIVED' } : undefined}
          onClose={() => setShowAddRowModal(false)}
          onSaved={fetchRecords}
        />
      )}

      {courierValidationRecord && tab && (
        <CourierValidationWindow
          record={courierValidationRecord}
          mainTab={activeMainTab}
          subTab={activeSubTab}
          jenisDokumen={courierValidationRecord.jenis_dokumen || (courierValidationRecord.tabel === 'tabel_audit_pib' || courierAuditType === 'pib' ? 'PIB' : (courierValidationRecord.tabel === 'tabel_audit_cn' || courierAuditType === 'cn' ? 'CN' : ''))}
          access={courierValidationAccess}
          editAccess={{ checklist: canEdit('courier_checklist_dokumen'), doc: canEdit('courier_dokumen_validation'), cost: canEdit('courier_cost_validation') }}
          renderChecklist={({ onPctChange, onSaved }) => (
            <ChecklistModal
              record={courierValidationRecord}
              tab={tab}
              embedded
              onClose={() => { setCourierValidationRecord(null); fetchRecords(); }}
              onSaved={onSaved}
              onPctChange={onPctChange}
              canEdit={canEdit('courier_checklist_dokumen')}
            />
          )}
          // Refetch 1x saat jendela ditutup -> titik status/badge baris ikut data terbaru
          // (Checklist/Doc/Cost semua bisa berubah selama jendela terbuka, Doc via autosave).
          onClose={() => { setCourierValidationRecord(null); fetchRecords(); }}
        />
      )}

      {deleteRecord && tab && (
        <DeleteModal
          record={deleteRecord}
          tab={tab}
          customMessage={((activeMainTab === 'courier' && activeSubTab === 'courier_audit') && (courierAuditType === 'archive')) ? 'This record will be permanently deleted along with all related courier recap data. This action cannot be undone.' : undefined}
          activeMainTab={activeMainTab}
          activeSubTab={activeSubTab}
          courierAuditType={courierAuditType}
          onClose={() => setDeleteRecord(null)}
          onSaved={() => {
            if (isSeaAirAudit) refreshSeaAirAudit();
            else if (isSeaAirRekapan) { setRecapDetailId(null); refreshRecap(); }
            else if (isCourierAuditView) refreshCourierAudit();
            else fetchRecords();
          }}
        />
      )}

      {/* Invoice Recap Sea & Air (2026-10-01) -- jendela Open & Edit shipment. Jendela Open
          disembunyikan sementara modal Document Validation lama terbuka (modal lama z-50). */}
      {isSeaAirRekapan && recapDetailRec && !seaAirValidasiRecord && (
        <SeaAirRecapDetailModal
          rec={recapDetailRec}
          companyNames={seaAirCompanyNames}
          canEdit={canEdit('sea_air_rekapan')}
          canSeeCosts={canSee('sea_air_cost_validation')}
          canEditCosts={canEdit('sea_air_cost_validation')}
          canSeeDocs={canSee('sea_air_dokumen_validation') || canSee('sea_air_checklist_validation')}
          canEditDocs={canEdit('sea_air_dokumen_validation')}
          isAdmin={isAdmin}
          onUnlock={handleRecapUnlock}
          onClose={() => { setRecapDetailId(null); setRecapDetailSnapshot(null); }}
          onEdit={rec => setRecapEditRec(rec)}
          onSubmit={(rec, dateIso) => handleRecapSave(rec, { tgl_submit_finance: dateIso })}
          onToggleDraft={async rec => {
            if (rec.audit_status === 'ARCHIVED') await handleUndraftSeaAir(rec);
            else await handleDraftSeaAir(rec);
            setRecapSummaryNonce(n => n + 1);
            notifySeaAirAuditChanged();
          }}
          onDelete={rec => { setRecapDetailId(null); setDeleteRecord(rec); }}
          onChanged={refreshRecap}
        />
      )}
      {isSeaAirRekapan && recapEditRec && (
        <SeaAirRecapEditModal
          rec={recapEditRec}
          onClose={() => setRecapEditRec(null)}
          onSave={async changes => {
            const ok = await handleRecapSave(recapEditRec, changes);
            if (ok) setRecapEditRec(null);
            return ok;
          }}
        />
      )}

      {/* Audit Courier (2026-10-01) -- jendela Open = jendela Validation + tab Overview & tombol aksi */}
      {isCourierAuditView && courierOpen && tab && (() => {
        const rec = courierOpen.rec;
        const t = courierDocTypeOf(rec);
        const draft = isCourierDraft(rec);
        const canEditAudit = canEdit('courier_audit');
        const docNo = courierColOk(t === 'CN' ? 'no_sppbmcp' : 'no_pib') ? courierDocNo(rec, t) : '';
        const closeOpen = () => { setCourierOpen(null); fetchRecords(); };
        return (
          <React.Fragment key={`courier-open-${t}-${rec.id}`}>
          <CourierValidationWindow
            record={rec}
            mainTab={activeMainTab}
            subTab={activeSubTab}
            jenisDokumen={t}
            access={courierValidationAccess}
            // Validasi hanya bisa diubah selama Draft (sama tombol Validation tabel lama); baris Audited = lihat saja.
            editAccess={{ checklist: draft && canEdit('courier_checklist_dokumen'), doc: draft && canEdit('courier_dokumen_validation'), cost: draft && canEdit('courier_cost_validation') }}
            renderChecklist={({ onPctChange, onSaved }) => (
              <ChecklistModal record={rec} tab={tab} embedded onClose={closeOpen} onSaved={onSaved} onPctChange={onPctChange} canEdit={draft && canEdit('courier_checklist_dokumen')} />
            )}
            initialTab={courierOpen.tab}
            title={<span className="flex items-center gap-2 flex-wrap">{t} {docNo || (courierColOk('awb') ? rec.awb : '') || ''}<span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${draft ? 'bg-[#FFF1D6] text-[#7A4F00]' : 'bg-[#EAF6EF] text-[#17663D]'}`}>{draft ? 'Draft' : 'Audited'}</span></span>}
            subtitle={[courierColOk('tgl_ppjk') ? fmtDateShortSeaAir(rec.tgl_ppjk) : '', courierColOk('awb') && docNo ? rec.awb : '', courierColOk('impor_an') ? rec.impor_an : '', courierColOk('vendor') ? rec.vendor : ''].filter(Boolean).join(' · ')}
            headerActions={canEditAudit ? (
              <>
                <button type="button" onClick={() => setCourierEditState({ record: rec, docType: t })} className={SA_BTN_OUTLINE}>Edit</button>
                {draft ? (
                  <button type="button" disabled={courierBusy} onClick={() => courierSetStatus(rec, 'audited')} className={SA_BTN_GREEN}>{courierBusy ? 'Saving…' : 'Mark as audited'}</button>
                ) : (
                  <button type="button" disabled={courierBusy} onClick={() => courierSetStatus(rec, 'draft')} className={SA_BTN_OUTLINE}>{courierBusy ? 'Saving…' : 'Move back to Draft'}</button>
                )}
                {draft && courierAuditType === 'archive' && (
                  <button type="button" title="Delete this draft" onClick={() => { setCourierOpen(null); setDeleteRecord(rec); }} className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl border border-[#F4C3BC] bg-white text-[#A8231A] text-xs font-semibold hover:bg-[#FDE7E4] transition-colors">Delete</button>
                )}
              </>
            ) : null}
            overview={openTab => (
              <CourierAuditOverview
                rec={rec}
                docType={t}
                companyNames={courierCompanyNames}
                colOk={courierColOk}
                validationTabs={courierValidationTabs}
                canEdit={canEditAudit}
                onOpenTab={openTab}
              />
            )}
            trail={<CourierAuditTrail rec={rec} docType={t} />}
            onClose={closeOpen}
          />
          </React.Fragment>
        );
      })()}
      {isCourierAuditView && courierEditState && (
        <React.Fragment key={courierEditState.record ? `courier-edit-${courierEditState.docType}-${courierEditState.record.id}` : 'courier-edit-new'}>
        <CourierAuditEditModal
          record={courierEditState.record}
          docType={courierEditState.docType}
          companyNames={courierCompanyNames}
          importAnOptions={courierImporAnTabs}
          colOk={courierColOk}
          canMarkAudited={canEdit('courier_audit')}
          onClose={() => setCourierEditState(null)}
          onMarkAudited={rec => undraftCourierRecord(rec, rec.jenis_dokumen)}
          onSaved={async (id, t) => {
            setCourierEditState(null);
            if (courierOpen && String(courierOpen.rec.id) === String(id) && courierDocTypeOf(courierOpen.rec) === t) {
              const fresh = await reloadCourierRow(id, t);
              if (fresh) setCourierOpen(prev => (prev ? { ...prev, rec: fresh } : prev));
            }
            refreshCourierAudit();
          }}
        />
        </React.Fragment>
      )}

      {/* Audit PIB Sea & Air (2026-09-30) -- jendela Open & form Edit/Add manually */}
      {isSeaAirAudit && seaAirDetailRecord && (
        <SeaAirAuditDetailModal
          rec={seaAirDetailRecord}
          info={seaAirLinkInfo[String(seaAirDetailRecord.id)]}
          companyNames={seaAirCompanyNames}
          canEdit={canEdit('sea_air_audit')}
          onClose={() => setSeaAirDetailRecord(null)}
          onEdit={rec => setSeaAirEditState({ record: rec })}
          onDelete={rec => { setSeaAirDetailRecord(null); setDeleteRecord(rec); }}
          onSetStatus={handleSeaAirSetStatus}
          onOpenRecap={handleSeaAirOpenRecap}
          onReread={handleSeaAirReread}
        />
      )}
      {isSeaAirAudit && seaAirEditState && (
        <SeaAirAuditEditModal
          record={seaAirEditState.record}
          companyNames={seaAirCompanyNames}
          importAnOptions={importAnTabs}
          onClose={() => setSeaAirEditState(null)}
          onSaved={async (id) => {
            setSeaAirEditState(null);
            if (id !== undefined && seaAirDetailRecord && String(seaAirDetailRecord.id) === String(id)) {
              const fresh = await reloadSeaAirRow(id);
              if (fresh) setSeaAirDetailRecord(fresh);
            }
            refreshSeaAirAudit();
          }}
        />
      )}

      {exportModalState && (
        <ExportModal
          title={exportModalState.title}
          cols={exportModalState.cols}
          dateFieldLabel={exportModalState.dateFieldLabel}
          splitByPoDetail={exportModalState.splitByPoDetail}
          onClose={() => setExportModalState(null)}
          fetchData={getExportData}
        />
      )}

      
      {seaAirChecklistRecord && (
        <SeaAirChecklistModal
          record={seaAirChecklistRecord}
          onClose={() => setSeaAirChecklistRecord(null)}
        />
      )}

      
      {seaAirCostValidasiRecord && (
        <ValidasiShipmentInvoiceLengkap
          record={seaAirCostValidasiRecord}
          onClose={() => setSeaAirCostValidasiRecord(null)}
          // Bagian 2: konfirmasi cost HANYA Admin & tidak setelah Submit to Finance (DB menolak juga).
          canEdit={canEdit('sea_air_cost_validation') && isAdmin && !isRecapLocked(seaAirCostValidasiRecord)}
        />
      )}

      {seaAirValidasiRecord && (
        <SeaAirValidasiModal
          record={seaAirValidasiRecord}
          onClose={() => { setSeaAirValidasiRecord(null); if (isSeaAirRekapan) refreshRecap(); }}
          // Bagian 2: modal lama = 1 hak edit utk accept/koreksi/duty -> Admin saja & tidak setelah submit
          // (edit Duty oleh non-Admin tetap bisa lewat tab Documents di jendela Open).
          canEdit={canEdit('sea_air_dokumen_validation') && isAdmin && !isRecapLocked(seaAirValidasiRecord)}
        />
      )}


      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        
        {isCourierAuditView ? (
        /* Header Audit Courier (2026-10-01): eyebrow + judul; mode Card + Export/Add manually
           (mode List: Export/Add Data tetap di toolbar lama). */
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A7A8B]">Courier</div>
              <h1 className="font-bold text-2xl text-[#3B1B3D] leading-tight">PIB &amp; CN Audit</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {courierAuditView === 'card' && renderExportBtn(true)}
              {courierAuditView === 'card' && canEdit('courier_audit') && (
                <button
                  type="button"
                  onClick={() => setCourierEditState({ record: null, docType: courierAuditType === 'cn' ? 'CN' : 'PIB' })}
                  className="px-4 h-[38px] rounded-full bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
                >
                  + Add manually
                </button>
              )}
              <Greeting />
            </div>
          </div>
        </header>
        ) : isSeaAirAudit ? (
        /* Header Audit PIB Sea & Air (2026-09-30): eyebrow + judul + Export/Add manually. */
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A7A8B]">Sea &amp; Air</div>
              <h1 className="font-bold text-2xl text-[#3B1B3D] leading-tight">PIB Audit</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {renderExportBtn(true)}
              {canEdit('sea_air_audit') && (
                <button
                  type="button"
                  onClick={() => setSeaAirEditState({ record: null })}
                  className="px-4 h-[38px] rounded-full bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
                >
                  + Add manually
                </button>
              )}
              <Greeting />
            </div>
          </div>
        </header>
        ) : isSeaAirRekapan ? (
        /* Header Invoice Recap Sea & Air (2026-10-01): eyebrow + judul + Export/Upload documents. */
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A7A8B]">Sea &amp; Air</div>
              <h1 className="font-bold text-2xl text-[#3B1B3D] leading-tight">Invoice Recap</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {renderExportBtn(true)}
              {canSee('sea_air_upload') && (
                <Link
                  to="/sea-air/upload"
                  className="px-4 h-[38px] rounded-full bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold shadow-sm transition-colors shrink-0 inline-flex items-center gap-1.5"
                >
                  <UploadCloud size={14} /> Upload documents
                </Link>
              )}
              <Greeting />
            </div>
          </div>
        </header>
        ) : (
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-xl text-[#5A305A] leading-tight">
                {tab?.label || mainTabObj?.label || 'Dashboard'}
              </h1>
              {mainTabObj?.label && tab?.label !== mainTabObj?.label && (
                <div className="flex items-center gap-2 text-sm text-[#5A305A]">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                  <span>{mainTabObj.label}</span>
                </div>
              )}
            </div>
            <Greeting />
          </div>
        </header>
        )}

        <main className="px-3 pt-2 pb-2 flex-1 flex flex-col overflow-hidden">

                              {/* ── Tabs & Search ── */}
            <div className="flex flex-col gap-4 mb-4">
              {isCourierAuditView && courierAuditView === 'card' ? (
                /* Audit Courier mode Card (2026-10-01): 5 kartu KPI + 1 kartu filter (tab Draft/PIB/CN,
                   Search, PPJK date, Company, Card/List, Refresh). State filter SAMA toolbar lama. */
                <div className="flex flex-col gap-3">
                  <CourierAuditKpiCards summary={courierSummary} loading={courierSummaryLoading} validationIncomplete={courierValidationIncomplete} colOk={courierColOk} />
                  <div className="bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5 flex flex-nowrap items-center gap-2.5 overflow-x-auto">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] shrink-0">
                      {([
                        { id: 'archive', label: 'Draft', count: courierSummary?.draft },
                        { id: 'pib', label: 'PIB', count: courierSummary?.pib },
                        { id: 'cn', label: 'CN', count: courierSummary?.cn },
                      ] as const).map(t => {
                        const active = courierAuditType === t.id;
                        const nas = courierAuditOutstandingCounts[t.id];
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => { setCourierAuditType(t.id); setPage(1); }}
                            title={nas ? `${nas} without NAS Submit Date` : undefined}
                            className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}
                          >
                            {t.label}
                            <span className={`min-w-[20px] px-1.5 h-[18px] rounded-full text-[10.5px] flex items-center justify-center tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-white text-[#6E5E70]'}`}>
                              {t.count ?? '…'}
                            </span>
                            {!!nas && <span className="min-w-[18px] px-1 h-[18px] rounded-full bg-amber-400 text-[#3B1B3D] text-[10px] flex items-center justify-center tabular-nums" aria-label="Without NAS Submit Date">{nas > 99 ? '99+' : nas}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="relative flex-1 min-w-[220px]">
                      <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search AWB, PIB no., PO, supplier, invoice"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 rounded-xl pl-8 pr-8 text-[13px] bg-[#FBF7F4] border border-[#EADFD6] text-[#3B1B3D] placeholder:text-[#8A7A8B] focus:outline-none focus:border-[#6B3470] focus:bg-white"
                      />
                      {search && (
                        <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#3B1B3D]">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">PPJK date</span>
                      <input type="date" aria-label="From date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      <span className="text-[#8A7A8B] text-xs">–</span>
                      <input type="date" aria-label="To date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      {(filterStartDate || filterEndDate) && (
                        <button type="button" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} aria-label="Clear dates" className="text-[#8A7A8B] hover:text-[#3B1B3D]"><X size={13} /></button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Company</span>
                      <select
                        aria-label="Company"
                        value={activeCourierImporAnFilter}
                        onChange={e => { setActiveCourierImporAnFilter(e.target.value); setPage(1); }}
                        className="border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer max-w-[160px]"
                      >
                        {courierImporAnTabs.map(an => (
                          <option key={an} value={an}>{an}</option>
                        ))}
                      </select>
                    </div>
                    <div className="inline-flex items-center p-1 rounded-xl bg-[#F5EDF3] shrink-0" role="group" aria-label="View mode">
                      {(['card', 'list'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => switchCourierView(m)}
                          className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${courierAuditView === m ? 'bg-white text-[#3B1B3D] shadow-sm' : 'text-[#6E5E70] hover:text-[#3B1B3D]'}`}
                        >
                          {m === 'card' ? 'Card' : 'List'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={refreshCourierAudit}
                      title="Refresh"
                      aria-label="Refresh"
                      className="w-9 h-9 rounded-xl border border-[#EADFD6] bg-white text-[#3B1B3D] hover:bg-[#FBF7F4] flex items-center justify-center shrink-0"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              ) : isCourierToolbar ? (
                /* Toolbar 2 baris KHUSUS Audit Courier & Invoice Recap Courier (2026-09, lihat
                   docs/claude/courier-features.md "Toolbar 2 baris"). Baris 1: tab + Company.
                   Baris 2: tanggal/search/refresh/customize (kiri) -- Edit/Reorder | Export/Add
                   Data (kanan). Tab lain (Sea & Air/Audit Trail) TETAP pakai toolbar 1 baris lama. */
                <div className={`flex flex-col rounded-2xl px-3 py-2 border ${TOOLBAR_GLASS}`}>
                  <div className="flex items-center justify-between gap-3 pb-2">
                    <div className="flex gap-1 items-center pt-1.5 pb-1 pr-2 overflow-x-auto min-w-0">
                      {isCourierRekapanTab && ppjkTabs.map(ppjk => {
                        const badgeCount = ppjkOutstandingMap[ppjk];
                        return (
                          <span key={ppjk} className="relative inline-flex shrink-0">
                            <button
                              onClick={() => { setActivePpjkFilter(ppjk); setPage(1); }}
                              className={toolbarPillClass(activePpjkFilter === ppjk)}
                            >
                              {ppjk === 'All' ? 'All PPJK' : ppjk}
                            </button>
                            {!!badgeCount && (
                              <span
                                title="Number of rows with an empty Submit Date"
                                className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm border-2 border-white"
                              >
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {isCourierAuditTab && [{id: 'archive', label: '🗄️ Draft'}, {id: 'pib', label: 'PIB'}, {id: 'cn', label: 'CN'}].map(type => {
                        const badgeCount = courierAuditOutstandingCounts[type.id as 'archive' | 'pib' | 'cn'];
                        return (
                          <span key={type.id} className="relative inline-flex shrink-0">
                            <button
                              onClick={() => { setCourierAuditType(type.id); setPage(1); }}
                              className={toolbarPillClass(courierAuditType === type.id)}
                            >
                              {type.label}
                            </button>
                            {!!badgeCount && (
                              <span
                                title="Number of rows with an empty NAS Submit Date"
                                className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm border-2 border-white"
                              >
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {isCourierAuditTab && (
                      <div className="ml-auto shrink-0">
                        <div className="inline-flex items-center p-1 rounded-xl bg-[#F5EDF3] shrink-0" role="group" aria-label="View mode">
                      {(['card', 'list'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => switchCourierView(m)}
                          className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${courierAuditView === m ? 'bg-white text-[#3B1B3D] shadow-sm' : 'text-[#6E5E70] hover:text-[#3B1B3D]'}`}
                        >
                          {m === 'card' ? 'Card' : 'List'}
                        </button>
                      ))}
                    </div>
                      </div>
                    )}
                    <div className={`flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[38px] border shrink-0 ${TOOLBAR_GLASS}`}>
                      <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Company</span>
                      {isCourierRekapanTab ? (
                        <select
                          value={activeCourierAnFilter}
                          onChange={e => { setActiveCourierAnFilter(e.target.value); setPage(1); }}
                          className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[160px]"
                        >
                          {courierAnTabs.map(an => (
                            <option key={an} value={an}>{an}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={activeCourierImporAnFilter}
                          onChange={e => { setActiveCourierImporAnFilter(e.target.value); setPage(1); }}
                          className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[160px]"
                        >
                          {courierImporAnTabs.map(an => (
                            <option key={an} value={an}>{an}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-between gap-3 pt-2 pb-0.5 border-t border-slate-200/80 overflow-x-auto">
                    <div className="flex gap-1.5 items-center flex-nowrap shrink-0">
                      {dateRangeEl}
                      {searchEl}
                      {refreshBtnEl}
                      {activeCourierCustomizeMenu && (
                        <button
                          onClick={() => setShowCustomizeView(activeCourierCustomizeMenu)}
                          title="Customize View"
                          aria-label="Customize View"
                          className={`w-[38px] p-0 rounded-full border transition-all h-[38px] flex justify-center items-center shrink-0 ${
                            activeCourierHiddenCols && activeCourierHiddenCols.size > 0 ? 'bg-[#5A305A]/10 text-[#5A305A] border-[#5A305A]/30' : `text-[#5A305A] hover:border-[#5A305A]/30 hover:bg-white/90 ${TOOLBAR_GLASS}`
                          }`}
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex gap-1.5 items-center flex-nowrap shrink-0">
                      {courierEditModeCanEdit && (
                        <button
                          onClick={toggleCourierEditMode}
                          title="Toggle Edit Mode for all rows"
                          className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all h-[38px] flex justify-center items-center gap-1.5 shadow-sm shrink-0 ${
                            courierEditModeOn ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700' : 'bg-white text-[#5A305A] border-slate-200 hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                          }`}
                        >
                          ✏️ {courierEditModeOn ? 'Editing All Rows' : 'Edit Mode'}
                        </button>
                      )}

                      {/* Drag & Drop Reorder (2026-09) -- HANYA tab PIB/CN (Audit) & tab per-PPJK
                          (Invoice Recap, bukan "All PPJK"), DAN disembunyikan TOTAL selama ada
                          filter aktif (search/tanggal/Company) -- drag di data terfilter menghitung
                          posisi dari baris yg kelihatan saja, urutan global bisa meleset. Lihat
                          `showReorderButton` & docs/claude/courier-features.md. */}
                      {showReorderButton && (
                        <button
                          onClick={handleToggleReorderMode}
                          title="Drag rows/columns to reorder manually -- order is saved for everyone"
                          className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all h-[38px] flex justify-center items-center gap-1.5 shadow-sm shrink-0 disabled:opacity-60 ${
                            reorderMode ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600' : 'bg-white text-[#5A305A] border-slate-200 hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                          }`}
                        >
                          <GripVertical size={14} />
                          {reorderMode ? 'Reordering…' : 'Reorder Mode'}
                        </button>
                      )}
                      {courierEditModeCanEdit && !reorderMode && !isDefaultSortState(sortColumn, sortDirection) && (
                        <button
                          onClick={() => { setSortColumn('created_at'); setSortDirection('desc'); }}
                          title={courierDefaultUsesSortOrder ? 'Return to the manually reordered display (clears the active column sort)' : 'Return to the default sort (Created At, newest first)'}
                          className="px-3 py-2 rounded-full bg-white text-[#5A305A] border border-slate-200 hover:border-[#5A305A] hover:bg-[#5A305A]/5 text-xs font-semibold transition-all h-[38px] flex justify-center items-center gap-1.5 shadow-sm shrink-0"
                        >
                          <ArrowUpDown size={14} />
                          {courierDefaultUsesSortOrder ? 'Reset to Manual Order' : 'Reset to Default Sort'}
                        </button>
                      )}

                      <div className="w-px h-6 bg-slate-300/80 mx-1 shrink-0" aria-hidden="true" />

                      {renderExportBtn(true)}
                      {addDataBtnEl}
                    </div>
                  </div>
                </div>
              ) : isSeaAirAudit ? (
                /* Audit PIB Sea & Air (2026-09-30): 4 kartu KPI + 1 kartu filter (tab Draft/Audited/All,
                   Search, PIB DATE, COMPANY, List/Card, Refresh). Filter & state SAMA dgn toolbar lama. */
                <div className="flex flex-col gap-3">
                  <SeaAirAuditKpiCards summary={seaAirSummary} loading={seaAirSummaryLoading} />
                  <div className="bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5 flex flex-nowrap items-center gap-2.5 overflow-x-auto">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] shrink-0">
                      {([
                        { id: 'draft', label: 'Draft', count: seaAirSummary?.draft },
                        { id: 'audit', label: 'Audited', count: seaAirSummary?.audited },
                        { id: 'all', label: 'All', count: seaAirSummary?.total },
                      ] as const).map(t => {
                        const active = seaAirAuditType === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => { setSeaAirAuditType(t.id); setPage(1); }}
                            className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}
                          >
                            {t.label}
                            <span className={`min-w-[20px] px-1.5 h-[18px] rounded-full text-[10.5px] flex items-center justify-center tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-white text-[#6E5E70]'}`}>
                              {t.count ?? '…'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="relative flex-1 min-w-[220px]">
                      <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search PIB no., BL, PO, supplier, HS code"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 rounded-xl pl-8 pr-8 text-[13px] bg-[#FBF7F4] border border-[#EADFD6] text-[#3B1B3D] placeholder:text-[#8A7A8B] focus:outline-none focus:border-[#6B3470] focus:bg-white"
                      />
                      {search && (
                        <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#3B1B3D]">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">PIB date</span>
                      <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      <span className="text-[#8A7A8B] text-xs">–</span>
                      <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      {(filterStartDate || filterEndDate) && (
                        <button type="button" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[#8A7A8B] hover:text-[#3B1B3D]"><X size={13} /></button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Company</span>
                      <select
                        value={activeImporAnFilter}
                        onChange={e => { setActiveImporAnFilter(e.target.value); setPage(1); }}
                        className="border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer max-w-[160px]"
                      >
                        {importAnTabs.map(an => (
                          <option key={an} value={an}>{an}</option>
                        ))}
                      </select>
                    </div>
                    <div className="inline-flex items-center p-1 rounded-xl bg-[#F5EDF3] shrink-0" role="group" aria-label="View mode">
                      {(['card', 'list'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSeaAirViewMode(m)}
                          className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${seaAirViewMode === m ? 'bg-white text-[#3B1B3D] shadow-sm' : 'text-[#6E5E70] hover:text-[#3B1B3D]'}`}
                        >
                          {m === 'card' ? 'Card' : 'List'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={refreshSeaAirAudit}
                      title="Refresh"
                      aria-label="Refresh"
                      className="w-9 h-9 rounded-xl border border-[#EADFD6] bg-white text-[#3B1B3D] hover:bg-[#FBF7F4] flex items-center justify-center shrink-0"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              ) : isSeaAirRekapan ? (
                /* Invoice Recap Sea & Air (2026-10-01): 5 kartu KPI + 1 kartu filter (tipe All/LCL/FCL/AIR,
                   Search, tanggal, COMPANY, Needs attention, SORT, Card/List, Refresh). */
                <div className="flex flex-col gap-3">
                  <SeaAirRecapKpiCards summary={recapSummary} loading={recapSummaryLoading} />
                  <div className="bg-white rounded-[14px] border border-[#EADFD6] shadow-sm px-3 py-2.5 flex flex-nowrap items-center gap-2.5 overflow-x-auto">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F5EDF3] shrink-0">
                      {['All', 'LCL', 'FCL', 'AIR'].map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setActiveShipmentTypeFilter(t); setPage(1); }}
                          className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${activeShipmentTypeFilter === t ? 'bg-[#3B1B3D] text-white shadow-sm' : 'text-[#3B1B3D] hover:bg-white'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="relative flex-1 min-w-[220px]">
                      <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7A8B] pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search BL / AWB, supplier, invoice, PIB no.…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 rounded-xl pl-8 pr-8 text-[13px] bg-[#FBF7F4] border border-[#EADFD6] text-[#3B1B3D] placeholder:text-[#8A7A8B] focus:outline-none focus:border-[#6B3470] focus:bg-white"
                      />
                      {search && (
                        <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A7A8B] hover:text-[#3B1B3D]"><X size={14} /></button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Date</span>
                      <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      <span className="text-[#8A7A8B] text-xs">–</span>
                      <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-[108px] text-[12px] bg-transparent focus:outline-none text-[#3B1B3D] cursor-pointer" />
                      {(filterStartDate || filterEndDate) && (
                        <button type="button" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-[#8A7A8B] hover:text-[#3B1B3D]"><X size={13} /></button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Company</span>
                      <select
                        value={activeAnFilter}
                        onChange={e => { setActiveAnFilter(e.target.value); setPage(1); }}
                        className="border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer max-w-[160px]"
                      >
                        {anTabs.map(an => <option key={an} value={an}>{an === 'All' ? 'All companies' : an}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setRecapNeedsAttentionOnly(v => !v); setPage(1); }}
                      aria-pressed={recapNeedsAttentionOnly}
                      className={`h-9 px-3 rounded-xl border text-xs font-bold shrink-0 transition-colors ${recapNeedsAttentionOnly ? 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]' : 'bg-white border-[#EADFD6] text-[#3B1B3D] hover:bg-[#FBF7F4]'}`}
                    >
                      Needs attention{recapSummary ? ` · ${recapSummary.needsAttention}` : ''}
                    </button>
                    <div className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-[#EADFD6] bg-white shrink-0">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8A7A8B]">Sort</span>
                      <select
                        value={sortColumn === 'total_invoice' ? 'total_invoice' : sortDirection === 'asc' ? 'oldest' : 'newest'}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === 'total_invoice') { setSortColumn('total_invoice'); setSortDirection('desc'); }
                          else { setSortColumn('created_at'); setSortDirection(v === 'oldest' ? 'asc' : 'desc'); }
                          setPage(1);
                        }}
                        className="border-0 bg-transparent text-xs font-bold text-[#3B1B3D] focus:outline-none cursor-pointer"
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="total_invoice">Total invoice · highest</option>
                      </select>
                    </div>
                    <div className="inline-flex items-center p-1 rounded-xl bg-[#F5EDF3] shrink-0" role="group" aria-label="View mode">
                      {(['card', 'list'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setSeaAirRecapView(m)}
                          className={`px-3 h-7 rounded-lg text-xs font-bold transition-colors ${seaAirRecapView === m ? 'bg-white text-[#3B1B3D] shadow-sm' : 'text-[#6E5E70] hover:text-[#3B1B3D]'}`}>
                          {m === 'card' ? 'Card' : 'List'}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={refreshRecap} title="Refresh" aria-label="Refresh"
                      className="w-9 h-9 rounded-xl border border-[#EADFD6] bg-white text-[#3B1B3D] hover:bg-[#FBF7F4] flex items-center justify-center shrink-0">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              ) : (
              <div className={`flex flex-nowrap items-center gap-2 rounded-2xl px-3 py-3 border overflow-x-auto ${TOOLBAR_GLASS}`}>
                <div className="flex-1 flex gap-2 items-center flex-nowrap min-w-0">
                  {/* Trail Filter -- jenis aksi/modul: Semua / Courier / Sea & Air / Bunker / dst.
                      Pakai 1 dropdown (bukan tombol pill per modul) supaya rapi & gampang nambah
                      modul baru ke depannya tanpa toolbar makin penuh. */}
                  {activeMainTab === 'trail' && (
                    <div className={`flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[38px] border shrink-0 ${TOOLBAR_GLASS}`}>
                      <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Module</span>
                      <select
                        value={activeTrailFilter}
                        onChange={e => { setActiveTrailFilter(e.target.value); setPage(1); }}
                        className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[130px]"
                      >
                        <option value="ALL">All</option>
                        <option value="COURIER">Courier</option>
                        <option value="SEA_AIR">Sea & Air</option>
                        <option value="BUNKER">Bunker</option>
                        <option value="AUDIT_PO">Audit AP Local/Overseas/PI Local</option>
                      </select>
                    </div>
                  )}
                  {/* Trail Filter -- per user */}
                  {activeMainTab === 'trail' && (
                    <div className={`flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[38px] border shrink-0 ${TOOLBAR_GLASS}`}>
                      <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">User</span>
                      <select
                        value={activeTrailUserFilter}
                        onChange={e => { setActiveTrailUserFilter(e.target.value); setPage(1); }}
                        className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[140px]"
                      >
                        {trailUserTabs.map(u => (
                          <option key={u} value={u}>{u === 'All' ? 'All Users' : u}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Sea & Air Audit Type Filter (Audit / Draft) */}
                  {activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit' && (
                    <div className="flex gap-2 items-center pb-1 overflow-x-auto max-w-[60vw]">
                      {[{id: 'audit', label: 'Audit'}, {id: 'draft', label: '🗄️ Draft'}].map(type => (
                        <button
                          key={type.id}
                          onClick={() => { setSeaAirAuditType(type.id); setPage(1); }}
                          className={toolbarPillClass(seaAirAuditType === type.id)}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Shipment Type Filter for Sea & Air Rekapan */}
                  {activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' && (
                    <div className="flex gap-2 items-center pb-1 overflow-x-auto max-w-[60vw]">
                      {['All', 'LCL', 'FCL', 'AIR'].map(type => (
                        <button
                          key={type}
                          onClick={() => { setActiveShipmentTypeFilter(type); setPage(1); }}
                          className={toolbarPillClass(activeShipmentTypeFilter === type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 items-center flex-nowrap justify-end shrink-0">
                {(['sea_air_audit', 'sea_air_rekapan'].includes(activeSubTab) || activeMainTab === 'trail') && dateRangeEl}
                {searchEl}
                {refreshBtnEl}
                {((activeMainTab === 'courier' && activeSubTab === 'courier_validasi') || (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') || (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan')) && renderExportBtn(false)}
                {addDataBtnEl}

                {activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan' ? (
                  <div className={`flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 h-[38px] border shrink-0 ${TOOLBAR_GLASS}`}>
                    <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Company</span>
                    <select
                      value={activeAnFilter}
                      onChange={e => { setActiveAnFilter(e.target.value); setPage(1); }}
                      className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[110px]"
                    >
                      {anTabs.map(an => (
                        <option key={an} value={an}>{an}</option>
                      ))}
                    </select>
                  </div>
                ) : activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit' ? (
                  <div className={`flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[38px] border ${TOOLBAR_GLASS}`}>
                    <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Company</span>
                    <select
                      value={activeImporAnFilter}
                      onChange={e => { setActiveImporAnFilter(e.target.value); setPage(1); }}
                      className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer max-w-[160px]"
                    >
                      {importAnTabs.map(an => (
                        <option key={an} value={an}>{an}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className={`flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[38px] border ${TOOLBAR_GLASS}`}>
                    <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Items</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                      className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
              )}
          </div>


          {/* ── Tabel ── (Audit PIB Sea & Air mode Card: kartu melayang di atas latar, tanpa kotak putih) */}
          <div className={`relative isolate flex-1 flex flex-col min-h-0 overflow-hidden ${(isSeaAirAudit && seaAirViewMode === 'card') || (isSeaAirRekapan && seaAirRecapView === 'card') || (isCourierAuditView && courierAuditView === 'card') ?'bg-white/40 rounded-2xl border border-[#EADFD6]/70' : 'bg-white rounded-2xl border border-slate-200 shadow-sm'}`}>
            {reorderMode && (
              <div className="px-4 py-2 bg-orange-50 border-b border-orange-200 text-orange-800 text-xs font-medium flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <GripVertical size={14} className="shrink-0" />
                  Reorder Mode aktif — drag ikon di kolom No. untuk mengubah urutan
                  <span className="text-orange-700/70 font-normal">· klik nomor untuk pindah ke posisi/halaman lain</span>
                  {reorderSaving && <span className="text-orange-700/70 font-normal italic">· Saving…</span>}
                </span>
                <button
                  onClick={exitReorderMode}
                  className="px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold border border-orange-600 transition-all shrink-0"
                >
                  Selesai
                </button>
              </div>
            )}
            {loading && displayRows.length === 0 ? (
              <LoadingState />
            ) : fetchError ? (
              <div className="text-center py-24 text-red-500">
                <p className="text-4xl mb-3">⚠️</p>
                <p className="font-semibold">An Error Occurred</p>
                <p className="text-sm mt-1 max-w-lg mx-auto bg-red-50 p-4 rounded-lg break-words">{fetchError}</p>
                <p className="text-xs text-[#5A305A] mt-4">Tip: If you recently deleted/renamed a column in the Supabase table, make sure the code referencing that column has been updated.</p>
              </div>
            ) : displayRows.length === 0 ? (
              <div className="text-center py-24 text-[#5A305A]">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-semibold text-[#5A305A]">No data yet</p>
                <p className="text-sm mt-1">
                  {search ? 'Try a different search term' : 'Upload your first document'}
                </p>
                {!search && (
                  <Link to={activeMainTab === 'sea_air' ? '/sea-air/upload' : '/courier/upload'} className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white text-sm font-semibold shadow-sm transition-all">
                    Upload now →
                  </Link>
                )}
              </div>
            ) : isCourierAuditView && courierAuditView === 'card' ? (
              <div className="flex-1 min-h-0 relative overflow-y-auto p-2.5">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-md border border-slate-100 text-[#5A305A] font-medium text-sm">
                      <LoadingSpinner className="mr-3" />
                      Updating data...
                    </div>
                  </div>
                )}
                <div className="text-[12px] text-[#6E5E70] px-1 pb-2 tabular-nums">
                  <b className="text-[#3B1B3D]">{totalRecords}</b> {courierAuditType === 'archive' ? 'draft' : courierAuditType === 'pib' ? 'PIB' : 'CN'} record{totalRecords === 1 ? '' : 's'}
                  {courierAuditType !== 'archive' && ' · order follows the manual order (reorder in List view)'}
                </div>
                <CourierAuditCardList
                  rows={displayRows}
                  docTypeOf={courierDocTypeOf}
                  companyNames={courierCompanyNames}
                  colOk={courierColOk}
                  validationTabs={courierValidationTabs}
                  onOpen={(rec, t) => setCourierOpen({ rec, tab: t || 'overview' })}
                />
              </div>
            ) : isSeaAirAudit && seaAirViewMode === 'card' ? (
              <div className="flex-1 min-h-0 relative overflow-y-auto p-2.5">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-md border border-slate-100 text-[#5A305A] font-medium text-sm">
                      <LoadingSpinner className="mr-3" />
                      Updating data...
                    </div>
                  </div>
                )}
                <div className="text-[12px] text-[#6E5E70] px-1 pb-2 tabular-nums">
                  <b className="text-[#3B1B3D]">{totalRecords}</b> of {seaAirSummary?.total ?? '…'} PIB · duty &amp; tax{' '}
                  <b className="text-[#3B1B3D]">{seaAirSummary ? fmtRpSeaAir(seaAirAuditType === 'draft' ? seaAirSummary.dutyDraft : seaAirAuditType === 'audit' ? seaAirSummary.dutyAudited : seaAirSummary.dutySum) : '…'}</b>
                </div>
                <SeaAirAuditCardList
                  rows={displayRows}
                  linkInfo={seaAirLinkInfo}
                  companyNames={seaAirCompanyNames}
                  onOpen={rec => setSeaAirDetailRecord(rec)}
                />
              </div>
            ) : isSeaAirRekapan && seaAirRecapView === 'card' ? (
              <div className="flex-1 min-h-0 relative overflow-y-auto p-2.5">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-md border border-slate-100 text-[#5A305A] font-medium text-sm">
                      <LoadingSpinner className="mr-3" />
                      Updating data...
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
                  <div className="text-[12px] text-[#6E5E70] tabular-nums">
                    <b className="text-[#3B1B3D]">{totalRecords}</b> of {recapSummary?.total ?? '…'} shipments · landed cost{' '}
                    <b className="text-[#3B1B3D]">{recapSummary ? fmtRpSeaAir(recapSummary.landedSum) : '…'}</b>
                  </div>
                  <CostMixLegend />
                </div>
                <SeaAirRecapCardList
                  rows={displayRows}
                  onOpen={rec => { setRecapDetailId(rec.id); setRecapDetailSnapshot(rec); }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 relative w-full">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-md border border-slate-100 text-[#5A305A] font-medium text-sm">
                      <LoadingSpinner className="mr-3" />
                      Updating data...
                    </div>
                  </div>
                )}
                {/* Custom top scrollbar */}
                <div 
                  ref={topScrollRef}
                  className="overflow-x-auto w-full scrollbar-visible"
                  onScroll={handleTopScroll}
                >
                  <div style={{ width: tableWidth, height: '1px' }}></div>
                </div>
                {/* Table container */}
                <div 
                  ref={bottomScrollRef}
                  className="flex-1 overflow-x-auto overflow-y-auto w-full scrollbar-x-visible"
                  onScroll={handleBottomScroll}
                >
                  <table ref={tableRef} className="w-full text-sm min-w-max relative border-collapse">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50 shadow-sm border-b border-slate-200">
                      {/* Drag & Drop Reorder (2026-09) -- DndContext/SortableContext SELALU
                          bungkus header (bukan cuma saat reorderMode) krn tidak render DOM
                          tambahan apa pun (murni context provider) DAN drag cuma bisa dipicu
                          lewat handle yg cuma di-render `SortableColumnHeader` saat `reorderMode`
                          true -- lebih simpel drpd percabangan render 2 jalur terpisah. */}
                      <DndContext
                        sensors={dndSensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToHorizontalAxis]}
                        onDragStart={(e: DragStartEvent) => setDraggingColKey(String(e.active.id))}
                        onDragEnd={(e: DragEndEvent) => { setDraggingColKey(null); handleColumnDragEnd(e); }}
                        onDragCancel={() => setDraggingColKey(null)}
                      >
                        <SortableContext items={visibleCols.filter(c => c.type !== 'index').map(c => c.key)} strategy={horizontalListSortingStrategy}>
                          {visibleCols.map(col => (
                            <SortableColumnHeader key={col.key} col={col} sortColumn={headerSortColumn} sortDirection={sortDirection} reorderMode={reorderMode} onHeaderClick={() => {
                              if (sortColumn === col.key) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                              else { setSortColumn(col.key); setSortDirection('asc'); }
                            }} />
                          ))}
                        </SortableContext>
                        {/* DragOverlay -- portal ke document.body, transform-nya SELALU jalan
                            (beda dari `<th>` yang tidak reliable, lihat catatan draggingColKey).
                            `dropAnimation` default dnd-kit (transisi balik ke posisi akhir) TETAP
                            dipakai (tidak di-override) -- sudah cukup halus, `modifiers`
                            (restrict ke 1 sumbu) yang paling berpengaruh ke "rasa" smooth-nya. */}
                        <DragOverlay>
                          {draggingColKey ? (
                            <div className="flex items-center gap-1.5 bg-white shadow-lg border border-[#5A305A] rounded-md px-3 py-2 text-[10px] font-bold text-[#5A305A] uppercase tracking-wider">
                              <GripVertical size={12} />
                              {(visibleCols.find(c => c.key === draggingColKey)?.label) || draggingColKey}
                            </div>
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                      {/* Sticky Right Column Header */}
                      <th className="px-4 py-3 text-[10px] font-bold text-[#5A305A] uppercase tracking-wider text-center sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.03)] z-30 border-l border-slate-100">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragStart={(e: DragStartEvent) => setDraggingRowId(e.active.id)}
                    onDragEnd={(e: DragEndEvent) => { setDraggingRowId(null); handleRowDragEnd(e); }}
                    onDragCancel={() => setDraggingRowId(null)}
                  >
                  <SortableContext items={displayRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {displayRows.map((rec, index) => {
                      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_audit') {
                        const canEditSeaAirAudit = canEdit('sea_air_audit');
                        return (
                          <SeaAirAuditRowGroup
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onEdit={canEditSeaAirAudit ? setEditRecord : undefined}
                            onDelete={canEditSeaAirAudit ? handleDelete : undefined}
                            onInlineSaveRow={canEditSeaAirAudit ? handleInlineSaveRow : undefined}
                          />
                        );
                      }
                      if (activeMainTab === 'sea_air' && activeSubTab === 'sea_air_rekapan') {
                        const canEditSeaAirRekapan = canEdit('sea_air_rekapan');
                        return (
                          <SeaAirRekapanRowGroup
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={activeCols}
                            onChecklist={canSee('sea_air_checklist_validation') ? setSeaAirChecklistRecord : undefined}
                            onValidasi={canSee('sea_air_dokumen_validation') ? setSeaAirValidasiRecord : undefined}
                            onCostValidasi={canSee('sea_air_cost_validation') ? setSeaAirCostValidasiRecord : undefined}
                            onDelete={canEditSeaAirRekapan ? handleDelete : undefined}
                            onDraft={canEditSeaAirRekapan ? handleDraftSeaAir : undefined}
                            onUndraft={canEditSeaAirRekapan ? handleUndraftSeaAir : undefined}
                            onVesselChange={canEditSeaAirRekapan ? handleUpdateVessel : undefined}
                            onInlineSaveRow={canEditSeaAirRekapan ? handleInlineSaveRow : undefined}
                          />
                        );
                      }
                      if (activeMainTab === 'courier' && activeSubTab === 'courier_audit') {
                        const canEditCourierAudit = canEdit('courier_audit');
                        return (
                          <CourierAuditRowGroup
                            // Tab Draft gabung PIB+CN (2 sequence id, bisa kembar) -> key ikut jenis dokumen.
                            key={`${courierDocTypeOf(rec)}-${rec.id}`}
                            rec={rec}
                            index={startIndex + index}
                            cols={visibleCols}
                            onValidation={setCourierValidationRecord}
                            validationTabs={courierValidationTabs}
                            onArchive={canEditCourierAudit && courierAuditType !== 'archive' ? handleArchive : undefined}
                            onUndraft={canEditCourierAudit && courierAuditType === 'archive' ? handleUndraft : undefined}
                            onDelete={canEditCourierAudit ? handleDelete : undefined}
                            editMode={canEditCourierAudit ? courierAuditEditMode : undefined}
                            getVal={canEditCourierAudit ? getCourierAuditVal : undefined}
                            setVal={canEditCourierAudit ? setCourierAuditVal : undefined}
                            onSaveRow={canEditCourierAudit ? handleSaveOneCourierAuditRow : undefined}
                            reorderMode={reorderMode}
                            totalRows={totalRecords}
                            onMoveTo={reorderMode ? handleMoveRowTo : undefined}
                          />
                        );
                      }
                      if (activeMainTab === 'courier' && activeSubTab === 'courier_rekapan') {
                        const canEditCourierRekapan = canEdit('courier_rekapan');
                        return (
                          <CourierRekapanRowGroup
                            key={rec.id}
                            rec={rec}
                            index={startIndex + index}
                            cols={visibleCols}
                            onDelete={canEditCourierRekapan ? handleDelete : undefined}
                            editMode={canEditCourierRekapan ? courierRekapanEditMode : undefined}
                            getVal={canEditCourierRekapan ? getCourierRekapanVal : undefined}
                            setVal={canEditCourierRekapan ? setCourierRekapanVal : undefined}
                            onSaveRow={canEditCourierRekapan ? handleSaveOneCourierRekapanRow : undefined}
                            reorderMode={reorderMode}
                            totalRows={totalRecords}
                            onMoveTo={reorderMode ? handleMoveRowTo : undefined}
                          />
                        );
                      }
                      return (
                        <DataRow
                          key={rec.id}
                          rec={rec}
                          index={startIndex + index}
                          cols={activeCols}
                          onEdit={setEditRecord}
                          onChecklist={undefined}
                          showChecklist={false}
                          onDelete={activeMainTab === 'trail' ? undefined : handleDelete}
                          hideEdit={activeMainTab === 'trail'}
                          onSelect={undefined}
                          showValidasi={false}
                          onValidasi={undefined}
                          onCostValidasi={undefined}
                          onArchive={undefined}
                          onUndraft={undefined}
                          onInlineSaveRow={undefined}
                        />
                      );
                    })}
                  </tbody>
                  </SortableContext>
                  {/* DragOverlay -- portal ke document.body, transform-nya SELALU jalan (beda
                      dari `<tr>`/`<td>` yang tidak reliable ikut CSS transform di semua browser,
                      lihat catatan draggingRowId di atas). */}
                  <DragOverlay>
                    {draggingRowId != null ? (() => {
                      const draggedIdx = displayRows.findIndex(r => String(r.id) === String(draggingRowId));
                      return (
                        <div className="flex items-center gap-2 bg-white shadow-lg border border-[#5A305A] rounded-lg px-3 py-2 text-xs font-semibold text-[#5A305A]">
                          <GripVertical size={14} />
                          <span className="min-w-6 h-6 px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{startIndex + draggedIdx + 1}</span>
                          Moving row...
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                  </DndContext>
                </table>
              </div>
              </div>
            )}

            {/* Footer Pagination -- TETAP tampil saat Reorder Mode (sejak 2026-09-28 Reorder per
                halaman, pageSize sementara REORDER_PAGE_SIZE). */}
            {records.length > 0 && (
              <div className="flex max-sm:flex-col justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 gap-3 shrink-0 relative z-20">
                <div className="text-xs text-[#5A305A]">
                  Showing <span className="font-semibold text-[#5A305A]">{startIndex + 1}-{Math.min(startIndex + pageSize, totalRecords)}</span> of <span className="font-semibold text-[#5A305A]">{totalRecords}</span> records
                  {search && ` (Filter: "${search}")`}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={validPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-[#5A305A] font-medium min-w-[80px] text-center">
                    Page <span className="font-bold text-[#5A305A]">{validPage}</span> of {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={validPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bar "Simpan Semua"/"Batal Semua" edit massal Audit Courier -- muncul kalau ada baris
          punya perubahan belum disimpan (lihat courierAuditPendingEdits di atas). Replika
          persis pola yang sama di FarOverseasAirPage.tsx List Memo. */}
      {activeMainTab === 'courier' && activeSubTab === 'courier_audit' && courierAuditEditMode && courierAuditChangedRowIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-200 p-2 flex items-center gap-3 pr-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex justify-center items-center text-amber-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#5A305A] leading-none">{courierAuditChangedRowIds.length} row(s) have unsaved changes</p>
            <p className="text-[10px] text-[#5A305A]/70 mt-1">Click save to update the database</p>
          </div>
          <button
            onClick={handleDiscardAllCourierAuditEdits}
            disabled={savingCourierAuditEdits}
            className="ml-2 px-3 py-2 rounded-full border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAllCourierAuditEdits}
            disabled={savingCourierAuditEdits}
            className="px-4 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <Save size={14} /> {savingCourierAuditEdits ? 'Saving...' : 'Save All'}
          </button>
        </div>
      )}

      {activeMainTab === 'courier' && activeSubTab === 'courier_rekapan' && courierRekapanEditMode && courierRekapanChangedRowIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-200 p-2 flex items-center gap-3 pr-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex justify-center items-center text-amber-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#5A305A] leading-none">{courierRekapanChangedRowIds.length} row(s) have unsaved changes</p>
            <p className="text-[10px] text-[#5A305A]/70 mt-1">Click save to update the database</p>
          </div>
          <button
            onClick={handleDiscardAllCourierRekapanEdits}
            disabled={savingCourierRekapanEdits}
            className="ml-2 px-3 py-2 rounded-full border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAllCourierRekapanEdits}
            disabled={savingCourierRekapanEdits}
            className="px-4 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <Save size={14} /> {savingCourierRekapanEdits ? 'Saving...' : 'Save All'}
          </button>
        </div>
      )}
    </>
  )
}
