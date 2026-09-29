import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import {
  CheckCircle2, FileCheck2, UploadCloud, X, AlertTriangle, Clock, ClipboardList, Edit3, Trash2, RefreshCw, LayoutGrid,
  List as ListIcon, Search, FolderOpen, Plus, Bell, Download, SlidersHorizontal, Lock, FileText, ExternalLink, Eye,
} from 'lucide-react';
import {
  formatMoney, APPROVAL_STATUS_META, COST_STATUS_META, REKAPAN_EDITABLE_FIELDS, updateRekapanFarOverseasAir, insertRekapanFarOverseasManual,
  parseRouteNote, rematchTarif, mapModeToJenisLayanan, computeExpectedFromRate, computeCostStatus, fetchPicEligibleUsers,
  fetchDistinctMemoTitles, fetchSignerCompanyOptions, fetchActiveTarifRateRows, fetchCostInfoMap, deriveMemoWarnings, getDueInfo,
  isPaymentAlarmActive, getMemoDueValue, getStatusLabel, getFinanceStage, fetchStepSigners, mySignableSteps, canSignStep, probePhase2,
  allocateByVessel, memoRefLabel, isMemoLocked, completedStepCount, nextStepForStatus, getRouteDisplay, getPoNumbers, totalInIdr, formatIdr,
  formatDateShort, implicitFxRate, toLocalDay, STEP_ORDER, ensureFarFont, FAR_FONT_FAMILY, getApprovalEntries, getPoList,
  type PicEligibleUser, type RateRow, type CompanyOption, type CostInfo, type ApprovalStep, type MemoWarning, type StepSignerMap,
} from '../utils/FarOverseasAirHelpers';
import FarOverseasAirDetailModal from '../components/FarOverseasAirDetailModal';
import FarOverseasAirCostValidationModal from '../components/FarOverseasAirCostValidationModal';
import FarOverseasAirWeightBreakdownModal from '../components/FarOverseasAirWeightBreakdownModal';
import FarOverseasAirDocumentsModal, { getMemoDocs } from '../components/FarOverseasAirDocumentsModal';
import FarOverseasAirUploadModal from '../components/FarOverseasAirUploadModal';
import FarOverseasAirEditMemoModal, { validateMemoEdits } from '../components/FarOverseasAirEditMemoModal';
import FarOverseasAirFinanceHandover from '../components/FarOverseasAirFinanceHandover';
import FarOverseasAirMyApprovals from '../components/FarOverseasAirMyApprovals';
import ExportModal from '../components/ExportModal';
import Greeting from '../components/Greeting';
import { LoadingState, LoadingTableRow } from '../components/LoadingState';

// ════════════════════════════════════════════════════════════════════════════════════════════
// FAR Overseas — halaman Memos + My Approvals (REDESAIN TAHAP 1, 2026-09-28).
// - Card/List MURNI tampilan ringkas; SEMUA edit lewat modal "Edit memo"
//   (FarOverseasAirEditMemoModal.tsx) -- tabel inline-edit ~25 kolom & tombol "Save All" lama
//   DIGANTI. State edit tetap `pendingEdits`/`getVal`/`setVal` (key = id baris), simpan lewat RPC
//   `update_rekapan_far_overseas_manual` (field terbatas `REKAPAN_EDITABLE_FIELDS`).
// - Approval, Cost Validation, Documents, Weight breakdown: modal masing-masing (logika
//   approval/RPC TIDAK berubah, lihat header FarOverseasAirDetailModal.tsx).
// - Lock (spek): Edit/Delete/KG terkunci setelah Prepared By sign (`isMemoLocked`) -- baru di
//   frontend, penegakan server di draft SQL tahap 2.
// - Fitur yang butuh kolom/RPC baru (Finance Handover, Non-PO, kurs terkunci, Undo sign, nomor
//   memo FAR/YYMM/NNN, pengingat, alokasi biaya per kapal) = TAHAP 2, tidak ditampilkan.
// ════════════════════════════════════════════════════════════════════════════════════════════

const QueueCard: React.FC<{ item: any; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => {
  let filenames: string[] = [];
  try {
    if (typeof item.file_names === 'string') filenames = JSON.parse(item.file_names);
    else if (Array.isArray(item.file_names)) filenames = item.file_names;
  } catch { /* ignore */ }
  const filesStr = filenames.join(', ');
  const time = new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (item.status === 'PENDING' || item.status === 'PROCESSING') {
    return (
      <div className="relative bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm">
        <div className="font-bold text-amber-800 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          Processing...
        </div>
        <div className="text-amber-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-amber-700/70 text-xs">Sent: {time}</div>
      </div>
    );
  }

  if (item.status === 'FAILED') {
    return (
      <div className="relative bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm pr-8">
        <button onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="absolute top-2.5 right-3 text-rose-400 hover:text-rose-600"><X size={16} /></button>
        <div className="font-bold text-rose-800 flex items-center gap-2"><AlertTriangle size={15} /> Processing failed</div>
        <div className="text-rose-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-rose-700/80 text-xs break-words">Error: {item.error_message || '-'}{item.error_step ? ` (${item.error_step})` : ''}</div>
      </div>
    );
  }

  return (
    <div className="relative bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm pr-8">
      <button onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="absolute top-2.5 right-3 text-emerald-500 hover:text-emerald-700"><X size={16} /></button>
      <div className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 size={15} /> Processed successfully</div>
      <div className="text-emerald-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
    </div>
  );
};

function DeleteConfirmModal({ record, onConfirm, onClose, deleting, error }: {
  record: any; onConfirm: () => void; onClose: () => void; deleting: boolean; error: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[#2A1A2C] leading-tight">Delete this memo?</h3>
            <p className="text-xs text-[#6E5E70] mt-0.5 truncate">{record.memo_title || 'Memo'} · {record.ship_via || '—'} · Invoice {record.no_invoice || '—'}</p>
          </div>
        </div>
        <p className="text-sm text-[#2A1A2C] leading-relaxed mb-1">Its cost validation data is deleted too.</p>
        <p className="text-sm font-bold text-rose-600 mb-4">This cannot be undone.</p>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={deleting} className="py-2.5 rounded-xl border border-[#EADFD6] text-[#2A1A2C] font-semibold text-sm hover:bg-[#F5EDF3] transition-all disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
            <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Komponen tampilan kecil ──────────────────────────────────────────────────────────────────

function AiChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5EDF3] text-[#6E5E70] whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-[#6E5E70]/50" />No AI check</span>;
  const meta = COST_STATUS_META[status];
  const dot = status === 'MATCH' ? 'bg-emerald-500' : status === 'OVERCHARGE' ? 'bg-rose-500' : 'bg-amber-500';
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${meta?.badgeClass || 'bg-[#F5EDF3] text-[#6E5E70]'}`}><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{meta?.label || status}</span>;
}

function PtChip({ code }: { code: string | null | undefined }) {
  if (!code) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 whitespace-nowrap">PT?</span>;
  return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#3B1B3D] text-white whitespace-nowrap">{code}</span>;
}

function warningCls(level: MemoWarning['level']) {
  return level === 'red' ? 'bg-rose-50 text-rose-700' : level === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-[#F5EDF3] text-[#6E5E70]';
}
function warningDot(level: MemoWarning['level']) {
  return level === 'red' ? 'bg-rose-500' : level === 'amber' ? 'bg-amber-500' : 'bg-[#6E5E70]/50';
}

function MainWarning({ warnings }: { warnings: MemoWarning[] }) {
  if (warnings.length === 0) return null;
  const [first, ...rest] = warnings;
  return (
    <div className="flex items-center gap-1.5 min-w-0" title={warnings.map(w => '• ' + w.text).join('\n')}>
      <span className={`flex items-center gap-1.5 min-w-0 text-[11px] px-2 py-1 rounded-lg ${warningCls(first.level)}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${warningDot(first.level)}`} />
        <span className="truncate">{first.text}</span>
      </span>
      {rest.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F5EDF3] text-[#6B3470] shrink-0">+{rest.length} more</span>}
    </div>
  );
}

function ProgressBar({ status }: { status: string | null | undefined }) {
  const done = completedStepCount(status);
  const next = nextStepForStatus(status);
  const nextIdx = next ? STEP_ORDER.indexOf(next) : -1;
  return (
    <div className="flex gap-1">
      {STEP_ORDER.map((_, i) => {
        let cls = 'bg-[#EADFD6]';
        if (status === 'REJECTED') cls = i === 0 ? 'bg-rose-500' : 'bg-[#EADFD6]';
        else if (status === 'APPROVED') cls = 'bg-emerald-500';
        else if (i < done) cls = 'bg-[#6B3470]';
        else if (i === nextIdx) cls = 'bg-amber-400';
        return <span key={i} className={`h-1 flex-1 rounded-full ${cls}`} />;
      })}
    </div>
  );
}

function StatusLine({ rec }: { rec: any }) {
  const status = rec?.approval_status;
  const fin = getFinanceStage(rec);
  const dot = fin === 'PAID' ? 'bg-emerald-500' : status === 'APPROVED' ? 'bg-[#6E5E70]' : status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500';
  return <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2A1A2C] whitespace-nowrap min-w-0"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} /><span className="truncate">{getStatusLabel(rec)}</span></span>;
}

function DueStrip({ rec, dueWindow }: { rec: any; dueWindow: number }) {
  if (!isPaymentAlarmActive(rec)) return null;
  if (rec.on_hold === true) {
    return <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white bg-[#6E5E70]"><Clock size={11} /> On hold · goods not received</div>;
  }
  const due = getDueInfo(getMemoDueValue(rec), dueWindow);
  if (!due || due.level === 'later') return null;
  const text = due.level === 'overdue' ? `Overdue by ${-due.daysLeft} day${due.daysLeft === -1 ? '' : 's'}` : due.level === 'today' ? 'Due today' : `Due in ${due.daysLeft} day${due.daysLeft === 1 ? '' : 's'}`;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white ${due.level === 'overdue' ? 'bg-rose-600' : 'bg-[#B7791F]'}`}>
      <Bell size={11} /> {text}
    </div>
  );
}

type RowActions = {
  canEdit: boolean;
  onMemo: (r: any) => void;
  onEdit: (r: any) => void;
  onCost: (r: any) => void;
  onDocs: (r: any) => void;
  onDelete: (r: any) => void;
};

function editButtonState(r: any, canEdit: boolean): { label: string; muted: boolean } {
  if (!canEdit) return { label: 'View only', muted: true };
  if (isMemoLocked(r.approval_status)) return { label: 'Locked', muted: true };
  return { label: 'Edit', muted: false };
}

const MemoCard: React.FC<{ r: any; cost: CostInfo | undefined; dueWindow: number; actions: RowActions }> = ({ r, cost, dueWindow, actions }) => {
  const route = getRouteDisplay(r.route_note);
  const pos = getPoNumbers(r);
  const warnings = deriveMemoWarnings(r, cost);
  const due = getDueInfo(getMemoDueValue(r), dueWindow);
  const fx = implicitFxRate(r);
  const locked = isMemoLocked(r.approval_status);
  const editState = editButtonState(r, actions.canEdit);
  const docCount = getMemoDocs(r).length;
  const dueStrip = isPaymentAlarmActive(r) && r.on_hold !== true && due && due.level !== 'later';
  const border = dueStrip && due?.level === 'overdue' ? 'border-rose-300' : dueStrip ? 'border-[#E9C98B]' : 'border-[#EADFD6]';
  return (
    <div className={`bg-white rounded-2xl border ${border} shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow`}>
      <DueStrip rec={r} dueWindow={dueWindow} />
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {r.memo_no && <p className="text-sm font-extrabold text-[#2A1A2C] leading-tight">{r.memo_no}</p>}
            <p className={r.memo_no ? 'inline-block mt-0.5 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#F5EDF3] text-[#6B3470]' : 'text-sm font-extrabold text-[#2A1A2C] leading-tight break-words'}>{r.memo_title || <span className="italic font-semibold text-[#6E5E70]">Untitled memo</span>}</p>
          </div>
          <AiChip status={cost?.status} />
        </div>

        <div className="rounded-xl bg-[#F5EDF3] px-3 py-2">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#6B3470]">Payable to</p>
          <p className="text-sm font-extrabold text-[#2A1A2C] uppercase leading-tight break-words">{r.ship_via || <span className="italic normal-case font-semibold text-[#6E5E70]">Ship via not set</span>}</p>
          <p className="text-[11px] text-[#6E5E70] mt-0.5 truncate">Invoice <span className="font-semibold text-[#2A1A2C]">{r.no_invoice || '—'}</span> · {r.invoice_date ? formatDateShort(r.invoice_date) : '—'}</p>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <PtChip code={r.dominant_company_code} />
          <span className="text-xs font-semibold text-[#2A1A2C] truncate">{route ? `${route.origin} → ${route.destination}` : <span className="italic text-[#6E5E70] font-normal">Route not set</span>}</span>
          {route && <span className="text-[9px] font-extrabold text-[#6B3470] shrink-0">{route.mode}</span>}
        </div>

        <div className="flex items-end justify-between gap-2">
          <span className="text-[11px] text-[#6E5E70] uppercase">{r.qty != null && r.qty !== '' ? `${r.qty} ${r.weight_unit || ''}` : '—'}</span>
          <div className="text-right">
            <p className="text-lg font-extrabold text-[#2A1A2C] leading-none">{formatMoney(r.total_amount, r.total_amount_currency)}</p>
            {fx != null && <p className="text-[11px] text-[#6E5E70] mt-1">≈ {formatIdr(Number(r.total_amount_idr))}</p>}
            {fx != null && <p className="text-[10px] text-[#6E5E70]">FX 1 {r.total_amount_currency} = Rp {fx.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</p>}
          </div>
        </div>

        <div className="text-[11px] min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#6E5E70]">Vendor</p>
          <p className="text-[#2A1A2C] break-words leading-snug">{r.vendor || <span className="italic text-[#6E5E70]">—</span>}</p>
          <p className="text-[#6E5E70] mt-0.5 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{pos[0] || 'No PO'}</span>
            {pos.length > 1 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F5EDF3] text-[#6B3470] shrink-0">+{pos.length - 1} PO</span>}
            {r.item_description_manual && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 shrink-0 truncate max-w-[40%]" title="Remark">{r.item_description_manual}</span>}
          </p>
        </div>

        <MainWarning warnings={warnings} />

        <div className="mt-auto space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <StatusLine rec={r} />
            <span className="text-[11px] text-[#6E5E70] whitespace-nowrap">Due {due ? formatDateShort(due.date) : '—'}</span>
          </div>
          <ProgressBar status={r.approval_status} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3.5 pb-3.5">
        <button onClick={() => actions.onMemo(r)} className="flex-1 h-9 rounded-xl bg-[#F5EDF3] text-[#6B3470] text-xs font-bold hover:bg-[#EADFD6] transition-colors">Memo</button>
        <button onClick={() => actions.onEdit(r)} title={editState.muted ? (locked ? 'Locked after Prepared By signed — opens read-only' : 'You have view access only') : 'Edit memo'}
          className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors ${editState.muted ? 'bg-[#FBF3EC] text-[#6E5E70] hover:bg-[#F5EDF3]' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
          {editState.muted && <Lock size={11} />} {editState.label}
        </button>
        <button onClick={() => actions.onCost(r)} title="Cost Validation" aria-label="Cost Validation" className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#6B3470] hover:bg-[#F5EDF3]"><ClipboardList size={14} /></button>
        <button onClick={() => actions.onDocs(r)} title={`Docs (${docCount})`} aria-label="Docs" className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#6B3470] hover:bg-[#F5EDF3]"><FolderOpen size={14} /></button>
        {actions.canEdit && (
          <button onClick={() => { if (!locked) actions.onDelete(r); }} disabled={locked} title={locked ? 'Cannot delete after Prepared By signed' : 'Delete memo'} aria-label="Delete"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-rose-600 hover:bg-rose-50 disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed"><Trash2 size={14} /></button>
        )}
      </div>
    </div>
  );
};

// ── Filter / sort / group ─────────────────────────────────────────────────────────────────────

// FINANCE/PAID = status Finance (tahap 2): APPROVED & belum dibayar / sudah dibayar.
type StatusFilter = 'ALL' | ApprovalStep | 'APPROVED' | 'REJECTED' | 'FINANCE' | 'PAID';
const STATUS_FILTER_VALUE: Record<Exclude<StatusFilter, 'ALL'>, string> = {
  TIER1: 'PENDING', PIC: 'TIER1_DONE', TIER2: 'PIC_DONE', TIER3: 'TIER2_DONE', APPROVED: 'APPROVED', REJECTED: 'REJECTED', FINANCE: 'APPROVED', PAID: 'APPROVED',
};
// Batas kandidat mode "Show them" (alarm due) -- disaring & dipaginasi di client.
const DUE_CANDIDATE_LIMIT = 1000;
type SortBy = 'NEWEST' | 'OLDEST' | 'DUE_SOON' | 'INVOICE_NEW';
const SORT_LABEL: Record<SortBy, string> = { NEWEST: 'Newest upload', OLDEST: 'Oldest upload', DUE_SOON: 'Due date soonest', INVOICE_NEW: 'Invoice date newest' };
type GroupBy = 'DATE' | 'MONTH' | 'YEAR' | 'OFF';
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Filters = { shipVia: string; pt: string; origin: string; destination: string; mode: string; remark: string; startDate: string; endDate: string };
const EMPTY_FILTERS: Filters = { shipVia: '', pt: '', origin: '', destination: '', mode: '', remark: '', startDate: '', endDate: '' };

// Escape wildcard LIKE (% _) dari input user.
const escLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`);

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function groupKeyOf(r: any, g: GroupBy): { key: string; label: string } {
  const d = toLocalDay(r.created_at);
  if (!d || g === 'OFF') return { key: 'all', label: '' };
  if (g === 'YEAR') return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
  if (g === 'MONTH') return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` };
  return { key: localIso(d), label: formatDateShort(d) };
}

// Kolom export -- label Bahasa Inggris (spek). Nilai gabungan diformat di `getExportData`.
const FAR_EXPORT_COLS = [
  { key: 'memo_no', label: 'MEMO NO' },
  { key: 'memo_title', label: 'MEMO TITLE' },
  { key: 'created_at', label: 'UPLOAD DATE', type: 'date' },
  { key: 'approval_status_display', label: 'APPROVAL STATUS' },
  { key: 'ship_via', label: 'PAYABLE TO (SHIP VIA)' },
  { key: 'no_invoice', label: 'INVOICE NO' },
  { key: 'invoice_date', label: 'INVOICE DATE', type: 'date' },
  { key: 'nama_pt_display', label: 'PAYING PT' },
  { key: 'vendor', label: 'VENDOR' },
  { key: 'po_ori', label: 'PO' },
  { key: 'weight_breakdown', label: 'KG PER PO' },
  { key: 'vessel_internal_note', label: 'VESSEL' },
  { key: 'qty', label: 'WEIGHT', type: 'num' },
  { key: 'weight_unit', label: 'UNIT' },
  { key: 'unit_price_display', label: 'UNIT PRICE' },
  { key: 'freight_amount_display', label: 'FREIGHT' },
  { key: 'clearance_amount_display', label: 'CLEARANCE' },
  { key: 'other_amount_display', label: 'OTHER' },
  { key: 'clearance_other_total_display', label: 'OTHER CHARGES TOTAL' },
  { key: 'total_amount_display', label: 'TOTAL' },
  { key: 'total_amount_currency', label: 'CURRENCY' },
  { key: 'fx_display', label: 'FX RATE' },
  { key: 'total_idr_display', label: 'TOTAL IDR' },
  { key: 'route_note', label: 'NOTE 1' },
  { key: 'item_description', label: 'NOTE 2' },
  { key: 'item_description_manual', label: 'REMARK' },
  { key: 'status_note', label: 'NOTE 3' },
  { key: 'other_note', label: 'NOTE 4' },
  { key: 'pic_name', label: 'PIC SHIPMENT' },
  { key: 'buyer_name', label: 'BUYER' },
  { key: 'due_display', label: 'DUE DATE', type: 'date' },
  { key: 'expected_payment_date', label: 'PAYMENT DATE (PRINTED)', type: 'date' },
  { key: 'departure_date', label: 'DEPARTURE DATE', type: 'date' },
  { key: 'cost_status_display', label: 'AI CHECK' },
  { key: 'pic_create_display', label: 'PIC CREATE (PREPARED BY)' },
  { key: 'finance_received_at', label: 'RECEIVED BY FINANCE', type: 'date' },
  { key: 'paid_at', label: 'PAID', type: 'date' },
];

// Export 1 baris per PO (spek) -- alokasi IDR per PO via `allocateByVessel` (dasar KG kalau KG
// semua PO terisi, else rata), jumlahnya selalu = total memo.
const FAR_EXPORT_PO_COLS = [
  { key: 'memo_no', label: 'MEMO NO' },
  { key: 'memo_title', label: 'MEMO TITLE' },
  { key: 'created_at', label: 'UPLOAD DATE', type: 'date' },
  { key: 'status_display', label: 'STATUS' },
  { key: 'ship_via', label: 'PAYABLE TO (SHIP VIA)' },
  { key: 'no_invoice', label: 'INVOICE NO' },
  { key: 'invoice_date', label: 'INVOICE DATE', type: 'date' },
  { key: 'nama_pt_display', label: 'PAYING PT' },
  { key: 'vendor', label: 'VENDOR' },
  { key: 'po_display', label: 'PO' },
  { key: 'po_pt_display', label: 'PT FROM PO' },
  { key: 'vessel_display', label: 'VESSEL' },
  { key: 'po_kg_display', label: 'KG PER PO' },
  { key: 'alloc_basis_display', label: 'ALLOCATION BASIS' },
  { key: 'alloc_idr_display', label: 'ALLOCATION IDR' },
  { key: 'qty', label: 'WEIGHT', type: 'num' },
  { key: 'weight_unit', label: 'UNIT' },
  { key: 'unit_price_display', label: 'UNIT PRICE' },
  { key: 'freight_amount_display', label: 'FREIGHT' },
  { key: 'clearance_other_total_display', label: 'OTHER' },
  { key: 'total_amount_display', label: 'TOTAL' },
  { key: 'total_amount_currency', label: 'CURRENCY' },
  { key: 'fx_display', label: 'FX RATE' },
  { key: 'total_idr_display', label: 'TOTAL IDR' },
  { key: 'route_note', label: 'NOTE 1' },
  { key: 'item_description', label: 'NOTE 2' },
  { key: 'status_note', label: 'NOTE 3' },
  { key: 'other_note', label: 'NOTE 4' },
  { key: 'item_description_manual', label: 'REMARK' },
  { key: 'pic_create_display', label: 'PIC CREATE' },
  { key: 'pic_name', label: 'PIC SHIPMENT' },
  { key: 'due_display', label: 'DUE DATE', type: 'date' },
  { key: 'finance_received_at', label: 'RECEIVED BY FINANCE', type: 'date' },
];

export default function FarOverseasAirPage() {
  useEffect(() => { document.title = 'FAR Overseas · BeeHive'; ensureFarFont(); }, []);

  // Link langsung ke satu memo: /direct-loading/:id -- buka modal Memo otomatis.
  const { id: deepLinkId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, profile, canEdit: canEditPage, approvalTiersByPage, allowedPageKeys, isAdmin } = useAuth();
  const canEditDirectLoading = canEditPage('direct_loading');
  const rawTier = approvalTiersByPage['direct_loading'];
  const myTier: ApprovalStep | null = (STEP_ORDER as string[]).includes(rawTier) ? (rawTier as ApprovalStep) : null;
  const canOpenVendorRates = isAdmin || allowedPageKeys.has('settings_tarif_far_overseas_vendor');

  const [tab, setTab] = useState<'MEMOS' | 'MY_APPROVALS' | 'FINANCE'>('MEMOS');
  // Tahap 2 terpasang? (sql/027) & penandatangan per PT -- dicek sekali saat halaman dibuka.
  const [phase2, setPhase2] = useState(false);
  const [stepSigners, setStepSigners] = useState<StepSignerMap | null>(null);
  const [rolesReady, setRolesReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([probePhase2(), fetchStepSigners()]).then(([p2, sg]) => {
      if (cancelled) return;
      setPhase2(p2);
      setStepSigners(sg);
      setRolesReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  const mySteps = useMemo(() => mySignableSteps(user?.id, myTier, stepSigners), [user?.id, myTier, stepSigners]);
  const canSeeFinance = phase2 && (isAdmin || allowedPageKeys.has('far_overseas_finance'));
  const canActFinance = canEditPage('far_overseas_finance');
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [exportMode, setExportMode] = useState<'MEMO' | 'PO' | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const showToast = (text: string, warn = false, ms = 5000) => { setToastMessage({ text, warn }); setTimeout(() => setToastMessage(null), ms); };

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | null>(null);
  const [activeJobError, setActiveJobError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [costMap, setCostMap] = useState<Record<string, CostInfo>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [totalRecords, setTotalRecords] = useState(0);

  const [viewMode, setViewMode] = useState<'LIST' | 'CARD'>('CARD');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('NEWEST');
  const [groupBy, setGroupBy] = useState<GroupBy>('MONTH');
  const [approvalCounts, setApprovalCounts] = useState<Record<ApprovalStep, number>>({ TIER1: 0, PIC: 0, TIER2: 0, TIER3: 0 });

  // Search debounced 400ms (pola Audit AP) -- cari invoice, vendor, PO, ship via, notes, vessel.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  // Alarm pembayaran: memo yang MASIH di rantai approval & due <= N hari (spek N = 1/3/5/7).
  const [dueWindow, setDueWindow] = useState(3);
  const [dueOnly, setDueOnly] = useState(false);
  const [dueAlert, setDueAlert] = useState<{ overdue: number; soon: number; onHold: number }>({ overdue: 0, soon: 0, onHold: 0 });
  const [myApprovalsCount, setMyApprovalsCount] = useState(0);
  const [myApprovalsRefreshKey, setMyApprovalsRefreshKey] = useState(0);

  useEffect(() => { setPage(1); }, [searchTerm, filters, statusFilter, sortBy, dueOnly, dueWindow]);

  const [queue, setQueue] = useState<any[]>([]);
  const [picUsers, setPicUsers] = useState<PicEligibleUser[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [memoTitleOptions, setMemoTitleOptions] = useState<string[]>([]);
  const [tarifVendorRows, setTarifVendorRows] = useState<RateRow[]>([]);
  const addMemoTitleOption = (title: string) => {
    const v = title.trim();
    if (!v) return;
    setMemoTitleOptions(prev => prev.includes(v) ? prev : [...prev, v].sort());
  };

  const [selected, setSelected] = useState<any | null>(null);
  const [costModalRow, setCostModalRow] = useState<any | null>(null);
  const [weightModalRow, setWeightModalRow] = useState<any | null>(null);
  const [docsModalRow, setDocsModalRow] = useState<any | null>(null);
  const [editRow, setEditRow] = useState<any | null>(null);
  // Baris hasil "Add manual entry" yang BELUM pernah disimpan -- kalau Cancel, baris kosong itu
  // dihapus balik (`fn_delete_far_overseas_air`) supaya tidak nyangkut di DB.
  const [isNewManualRow, setIsNewManualRow] = useState(false);
  const [creatingManualEntry, setCreatingManualEntry] = useState(false);

  const fetchSeqRef = useRef(0);
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, any>>>({});
  const [savingEdits, setSavingEdits] = useState(false);

  const [deleteConfirmRow, setDeleteConfirmRow] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const startIndex = (page - 1) * pageSize;
    let query = supabase.from('rekapan_far_overseas_air').select('*', { count: 'exact' });
    if (statusFilter !== 'ALL') query = query.eq('approval_status', STATUS_FILTER_VALUE[statusFilter]);
    if (statusFilter === 'FINANCE') query = query.is('paid_at', null);
    if (statusFilter === 'PAID') query = query.not('paid_at', 'is', null);
    if (searchTerm) {
      // Karakter pemisah sintaks `.or()` PostgREST (koma, kurung, kutip, backslash) diganti
      // wildcard `_` (cocok 1 karakter apa pun) supaya query tidak pecah.
      const safe = escLike(searchTerm).replace(/[,()"]/g, '_');
      const p = `%${safe}%`;
      query = query.or(`ship_via.ilike.${p},vendor.ilike.${p},no_invoice.ilike.${p},po_ori.ilike.${p},route_note.ilike.${p},item_description_manual.ilike.${p},vessel_internal_note.ilike.${p},memo_title.ilike.${p}${phase2 ? `,memo_no.ilike.${p}` : ''}`);
    }
    if (filters.shipVia) query = query.ilike('ship_via', `%${escLike(filters.shipVia)}%`);
    if (filters.pt) query = query.eq('dominant_company_code', filters.pt);
    if (filters.origin) query = query.ilike('route_note', `%DARI ${escLike(filters.origin)} KE %`);
    if (filters.destination) query = query.ilike('route_note', `% KE ${escLike(filters.destination)} (%`);
    if (filters.mode) query = query.ilike('route_note', `%(%${escLike(filters.mode)}%)`);
    if (filters.remark) query = query.ilike('item_description_manual', `%${escLike(filters.remark)}%`);
    if (filters.startDate) query = query.gte('invoice_date', filters.startDate);
    if (filters.endDate) query = query.lte('invoice_date', filters.endDate);
    const dueLimitIso = (() => { const d = new Date(); d.setDate(d.getDate() + dueWindow); return localIso(d); })();
    if (dueOnly) {
      // Kandidat longgar di server, disaring & dipaginasi di client (`isPaymentAlarmActive` +
      // due efektif `due_date ?? expected_payment_date` tidak bisa diekspresikan 1 filter REST).
      query = query.neq('approval_status', 'REJECTED');
      if (phase2) query = query.is('paid_at', null);
      else query = query.not('expected_payment_date', 'is', null).lte('expected_payment_date', dueLimitIso);
    }
    if (sortBy === 'NEWEST') query = query.order('created_at', { ascending: false });
    else if (sortBy === 'OLDEST') query = query.order('created_at', { ascending: true });
    else if (sortBy === 'DUE_SOON') query = query.order('expected_payment_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    else query = query.order('invoice_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });

    const seq = ++fetchSeqRef.current;
    let data: any[] | null; let error: any; let count: number | null;
    if (dueOnly) {
      const res = await query.limit(DUE_CANDIDATE_LIMIT);
      const all = (res.data || []).filter((r: any) => {
        if (!isPaymentAlarmActive(r) || r.on_hold === true) return false;
        const d = getDueInfo(getMemoDueValue(r), dueWindow);
        return !!d && d.level !== 'later';
      });
      data = all.slice(startIndex, startIndex + pageSize); error = res.error; count = all.length;
    } else {
      const res = await query.range(startIndex, startIndex + pageSize - 1);
      data = res.data; error = res.error; count = res.count;
    }
    // Respons filter LAMA yang datang belakangan tidak boleh menimpa hasil filter terbaru.
    if (seq !== fetchSeqRef.current) return;
    if (error) {
      setListError(error.message);
      setRows([]);
      setTotalRecords(0);
    } else {
      // Cost info di-set BARENG baris -- kalau tidak, card sempat tampil peringatan "cost
      // validation not available" sesaat sebelum map-nya datang.
      const cm = await fetchCostInfoMap((data || []).map((r: any) => r.id).filter(Boolean));
      if (seq !== fetchSeqRef.current) return;
      setCostMap(cm);
      setRows(data || []);
      setTotalRecords(count || 0);
    }
    setLoadingList(false);
  }, [page, statusFilter, searchTerm, filters, dueOnly, dueWindow, sortBy, phase2]);

  const fetchApprovalCounts = useCallback(async () => {
    const res = await Promise.all(STEP_ORDER.map(step =>
      supabase.from('rekapan_far_overseas_air').select('id', { count: 'exact', head: true }).eq('approval_status', STATUS_FILTER_VALUE[step])
    ));
    setApprovalCounts({ TIER1: res[0].count || 0, PIC: res[1].count || 0, TIER2: res[2].count || 0, TIER3: res[3].count || 0 });
  }, []);

  const fetchDueAlert = useCallback(async () => {
    const limit = new Date(); limit.setDate(limit.getDate() + dueWindow);
    const limitIso = localIso(limit);
    // Tahap 2: due efektif = due_date ?? expected_payment_date; berhenti setelah Paid; on hold
    // dihitung terpisah (abu). Tahap 1: hanya memo di rantai approval.
    let res: { data: any[] | null; error: any };
    if (phase2) {
      res = await supabase.from('rekapan_far_overseas_air').select('id, approval_status, expected_payment_date, due_date, on_hold, finance_received_at, paid_at')
        .neq('approval_status', 'REJECTED').is('paid_at', null)
        .or(`due_date.lte.${limitIso},expected_payment_date.lte.${limitIso},on_hold.eq.true`)
        .limit(2000);
    } else {
      res = await supabase.from('rekapan_far_overseas_air').select('id, approval_status, expected_payment_date')
        .not('approval_status', 'in', '(APPROVED,REJECTED)').not('expected_payment_date', 'is', null).lte('expected_payment_date', limitIso)
        .limit(2000);
    }
    const { data, error } = res;
    if (error) { console.error('fetchDueAlert failed:', error); return; }
    let overdue = 0; let soon = 0; let onHold = 0;
    (data || []).forEach((r: any) => {
      if (!isPaymentAlarmActive(r)) return;
      if (r.on_hold === true) { onHold++; return; }
      const due = getDueInfo(getMemoDueValue(r), dueWindow);
      if (!due) return;
      if (due.level === 'overdue') overdue++;
      else if (due.level === 'today' || due.level === 'soon') soon++;
    });
    setDueAlert({ overdue, soon, onHold });
  }, [dueWindow, phase2]);

  // Hitungan "menunggu saya" -- aturan SAMA dgn tab My Approvals (PIC per memo, penandatangan
  // per PT utk TIER2/TIER3, memo REJECTED kembali ke Prepared By di tahap 2).
  const fetchMyApprovalsCount = useCallback(async () => {
    if (!rolesReady || mySteps.length === 0) { setMyApprovalsCount(0); return; }
    const ids = new Set<string>();
    await Promise.all(mySteps.map(async step => {
      const statuses = step === 'TIER1' && phase2 ? ['PENDING', 'REJECTED'] : [STATUS_FILTER_VALUE[step]];
      let q = supabase.from('rekapan_far_overseas_air').select('id, pic_user_id, dominant_company_code').in('approval_status', statuses);
      if (step === 'PIC') q = q.eq('pic_user_id', user?.id || '00000000-0000-0000-0000-000000000000');
      const { data } = await q.limit(1000);
      (data || []).forEach((r: any) => { if (canSignStep(r, step, user?.id, myTier, stepSigners)) ids.add(r.id); });
    }));
    setMyApprovalsCount(ids.size);
  }, [rolesReady, mySteps, phase2, myTier, stepSigners, user?.id]);

  // Tab awal per peran (spek): Finance -> Finance Handover; SPV/Director -> My Approvals.
  const initialTabDone = useRef(false);
  useEffect(() => {
    if (!rolesReady || initialTabDone.current) return;
    initialTabDone.current = true;
    if (deepLinkId) return;
    if (canSeeFinance && !canEditDirectLoading) setTab('FINANCE');
    else if (mySteps.length > 0 && !mySteps.includes('TIER1') && mySteps.some(st => st === 'TIER2' || st === 'TIER3')) setTab('MY_APPROVALS');
  }, [rolesReady, canSeeFinance, canEditDirectLoading, mySteps, deepLinkId]);

  const refreshList = useCallback(() => {
    fetchList();
    fetchApprovalCounts();
    fetchDueAlert();
    fetchMyApprovalsCount();
    setMyApprovalsRefreshKey(k => k + 1);
  }, [fetchList, fetchApprovalCounts, fetchDueAlert, fetchMyApprovalsCount]);

  const fetchQueue = useCallback(async () => {
    const { data } = await supabase.from('far_overseas_air_processing_queue').select('*').order('created_at', { ascending: false }).limit(20);
    if (data) setQueue(data.filter((q: any) => q.status === 'PENDING' || q.status === 'PROCESSING' || q.status === 'FAILED' || (q.status === 'SUCCESS' && !q.is_read)));
  }, []);

  useEffect(() => {
    if (!deepLinkId) return;
    const loadDeepLink = async () => {
      const { data, error } = await supabase.from('rekapan_far_overseas_air').select('*').eq('id', deepLinkId).maybeSingle();
      if (error || !data) {
        showToast('No memo found for this link.', true, 6000);
        navigate('/direct-loading', { replace: true });
        return;
      }
      setSelected(data);
    };
    loadDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, navigate]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    fetchQueue();
    const iv = setInterval(fetchQueue, 5000);
    return () => clearInterval(iv);
  }, [fetchQueue]);
  useEffect(() => { fetchApprovalCounts(); }, [fetchApprovalCounts]);
  useEffect(() => { fetchDueAlert(); }, [fetchDueAlert]);
  useEffect(() => { fetchMyApprovalsCount(); }, [fetchMyApprovalsCount]);
  useEffect(() => { fetchPicEligibleUsers().then(setPicUsers); }, []);
  useEffect(() => { fetchSignerCompanyOptions().then(setCompanyOptions); }, []);
  useEffect(() => { fetchDistinctMemoTitles().then(setMemoTitleOptions); }, []);
  useEffect(() => { fetchActiveTarifRateRows().then(setTarifVendorRows); }, []);

  const originOptions = useMemo(() => Array.from(new Set(tarifVendorRows.map(t => t.origin).filter(Boolean) as string[])).sort(), [tarifVendorRows]);
  const destinationOptions = useMemo(() => Array.from(new Set(tarifVendorRows.map(t => t.tujuan).filter(Boolean) as string[])).sort(), [tarifVendorRows]);

  // ── Edit state (pendingEdits) ────────────────────────────────────────────────────────────────

  const getVal = useCallback((r: any, field: string) => {
    const rowEdits = pendingEdits[r.id];
    if (rowEdits && field in rowEdits) return rowEdits[field];
    return r[field];
  }, [pendingEdits]);

  // Kalau nilai dikembalikan ke nilai tersimpan, field DIBUANG dari pending (tidak dikirim).
  const setVal = useCallback((r: any, field: string, value: any) => {
    if (!REKAPAN_EDITABLE_FIELDS.has(field)) return;
    setPendingEdits(prev => {
      const rowEdits = { ...(prev[r.id] || {}) };
      const original = r[field] ?? null;
      const same = (value ?? null) === original || (value != null && original != null && String(value) === String(original));
      if (same) delete rowEdits[field]; else rowEdits[field] = value;
      const next = { ...prev };
      if (Object.keys(rowEdits).length === 0) delete next[r.id]; else next[r.id] = rowEdits;
      return next;
    });
  }, []);

  const discardRowEdit = (id: string) => setPendingEdits(prev => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });

  // Dipanggil HANYA kalau NOTE 1 (route_note) berubah & tersimpan -- cocokkan ulang tarif dan
  // hitung ulang cost validation. WAJIB pakai `rematchTarif`/`computeExpectedFromRate` apa adanya
  // (replika logic n8n). `shipVia`/`qty` diambil dari edit yang BARU tersimpan kalau ada.
  const reMatchAfterRouteNoteEdit = async (rekapanId: string, newRouteNote: string, savedEdits: Record<string, any>, baseRow: any) => {
    const parsed = parseRouteNote(newRouteNote);
    if (!parsed) return { skipped: true as const, reason: 'format_tidak_dikenali' as const };

    const shipVia = ('ship_via' in savedEdits ? savedEdits.ship_via : baseRow?.ship_via) ?? null;
    const qtyRaw = 'qty' in savedEdits ? savedEdits.qty : baseRow?.qty;
    const qty = qtyRaw != null && qtyRaw !== '' ? Number(qtyRaw) : null;

    const { data: cvRow, error: cvErr } = await supabase
      .from('cost_validasi_far_overseas_air')
      .select('id, cost_validation, rate_row_used, status')
      .eq('far_overseas_id', rekapanId)
      .maybeSingle();
    if (cvErr || !cvRow) return { skipped: true as const, reason: 'no_cost_validasi' as const };

    let costValidation: any[] = [];
    if (Array.isArray(cvRow.cost_validation)) costValidation = cvRow.cost_validation;
    else if (typeof cvRow.cost_validation === 'string') {
      try { costValidation = JSON.parse(cvRow.cost_validation || '[]') || []; } catch { costValidation = []; }
    }

    const existingRate = Array.isArray(cvRow.rate_row_used) ? null : cvRow.rate_row_used;
    const jenisDariNote = mapModeToJenisLayanan(parsed.mode);
    const jenisLayananSaatIni = jenisDariNote ?? (existingRate?.jenis_layanan ?? null);

    const unitPriceRow = costValidation.find(r => r.row_key === 'UNIT_PRICE_DARI_DESCRIPTION');
    const totalRow = costValidation.find(r => r.row_key === 'TOTAL');
    const actualUnitPrice = unitPriceRow?.actual != null && unitPriceRow.actual !== '' ? Number(unitPriceRow.actual) : null;
    const actualTotal = totalRow?.actual != null && totalRow.actual !== '' ? Number(totalRow.actual) : null;

    const tarifRows = await fetchActiveTarifRateRows();
    const candidates = rematchTarif({ vendorRows: tarifRows, shipVia, jenisLayananSaatIni, origin: parsed.origin, tujuan: parsed.destination, qty });

    let newCostValidation = costValidation;
    let newRateRowUsed: any = null;
    let newStatus = cvRow.status;
    let newCatatan: string | null = null;

    if (candidates.length === 0) {
      newCostValidation = costValidation.map((row: any) => (
        row.row_key === 'KG' || row.row_key === 'UNIT_PRICE_DARI_DESCRIPTION' || row.row_key === 'TOTAL' ? { ...row, expected: null, edited: true } : row
      ));
      newRateRowUsed = null;
      newStatus = 'BELUM_LENGKAP';
      newCatatan = 'No matching rate found after NOTE 1 was changed -- please check manually.';
    } else if (candidates.length === 1) {
      const rate = candidates[0];
      const { unitPriceExpected, unitPriceNotes, kgExpected, totalExpected } = computeExpectedFromRate(rate, qty, actualUnitPrice, parsed.origin, parsed.destination);
      newStatus = computeCostStatus(totalExpected, actualTotal) ?? cvRow.status;
      newCostValidation = costValidation.map((row: any) => {
        if (row.row_key === 'KG') return { ...row, expected: kgExpected, edited: true };
        if (row.row_key === 'UNIT_PRICE_DARI_DESCRIPTION') return { ...row, expected: unitPriceExpected, notes: unitPriceNotes, edited: true };
        if (row.row_key === 'TOTAL') return { ...row, expected: totalExpected, edited: true };
        return row;
      });
      newRateRowUsed = rate;
    } else {
      newRateRowUsed = candidates;
      newStatus = 'BELUM_LENGKAP';
      newCatatan = 'Several matching rates found after NOTE 1 was changed -- please select manually.';
    }

    const { error: saveErr } = await supabase.rpc('update_cost_validasi_far_overseas_manual', {
      p_id: cvRow.id,
      p_cost_validation: newCostValidation,
      p_rate_row_used: newRateRowUsed,
      p_status: newStatus,
      p_catatan: newCatatan,
    });
    if (saveErr) return { skipped: false as const, error: saveErr.message };
    return { skipped: false as const, candidateCount: candidates.length };
  };

  // Simpan pending edit 1 baris. Pending HANYA dibuang kalau RPC sukses (dulu ikut dibuang walau
  // gagal -> perubahan hilang diam-diam). Return true kalau sukses.
  const saveRowEdits = async (id: string, baseRow: any): Promise<boolean> => {
    const edits = pendingEdits[id];
    if (!edits || Object.keys(edits).length === 0) return true;
    setSavingEdits(true);
    const { error } = await updateRekapanFarOverseasAir(id, edits);
    if (error) {
      setSavingEdits(false);
      showToast('Failed to save changes: ' + error.message, true, 8000);
      return false;
    }
    let msg = 'Changes saved.';
    let warn = false;
    if ('route_note' in edits && edits.route_note) {
      const res = await reMatchAfterRouteNoteEdit(id, edits.route_note, edits, baseRow);
      if (res.skipped && res.reason === 'format_tidak_dikenali') { msg = 'Changes saved. NOTE 1 format was not recognized — cost validation was not recalculated.'; warn = true; }
      else if (!res.skipped && 'error' in res && res.error) { msg = 'Changes saved, but cost validation could not be recalculated: ' + res.error; warn = true; }
      else if (!res.skipped) msg = 'Changes saved. Cost validation was recalculated for the new route.';
    }
    setSavingEdits(false);
    discardRowEdit(id);
    showToast(msg, warn, warn ? 8000 : 4000);
    return true;
  };

  // ── Aksi ────────────────────────────────────────────────────────────────────────────────────

  const handleAddManualEntry = async () => {
    setCreatingManualEntry(true);
    const { data, error } = await insertRekapanFarOverseasManual();
    setCreatingManualEntry(false);
    if (error || !data) {
      showToast('Failed to create manual entry: ' + (error || 'unknown error'), true);
      return;
    }
    setIsNewManualRow(true);
    setEditRow(data);
  };

  const closeEditModal = async () => {
    const row = editRow;
    const wasNew = isNewManualRow;
    if (row) discardRowEdit(row.id);
    setEditRow(null);
    setIsNewManualRow(false);
    if (wasNew && row) {
      const { error } = await supabase.rpc('fn_delete_far_overseas_air', { p_far_overseas_id: row.id });
      if (error) console.error('[FAR] failed to remove unsaved manual entry:', error);
    }
  };

  const saveEditModal = async () => {
    if (!editRow) return;
    const merged = { ...editRow, ...(pendingEdits[editRow.id] || {}) };
    const problem = validateMemoEdits(merged, phase2);
    if (problem) { setEditSaveError(problem); return; }
    setEditSaveError(null);
    const wasNew = isNewManualRow;
    const ok = await saveRowEdits(editRow.id, editRow);
    if (!ok) return;
    setEditRow(null);
    setIsNewManualRow(false);
    setDetailRefreshToken(t => t + 1);
    refreshList();
    if (wasNew) fetchList();
  };

  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc('fn_delete_far_overseas_air', { p_far_overseas_id: deleteConfirmRow.id });
    setDeleting(false);
    if (error) { setDeleteError(error.message); return; }
    setDeleteConfirmRow(null);
    showToast('Memo deleted.');
    refreshList();
  };

  const getExportData = useCallback(async (startDate?: string, endDate?: string) => {
    let query = supabase.from('rekapan_far_overseas_air').select('*').order('created_at', { ascending: false }).limit(50000);
    if (startDate) query = query.gte('invoice_date', startDate);
    if (endDate) query = query.lte('invoice_date', endDate);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const exportRows = data || [];
    const ids = exportRows.map((r: any) => r.id).filter(Boolean);
    const costStatus: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 500) {
      const { data: cvData } = await supabase.from('cost_validasi_far_overseas_air').select('far_overseas_id, status').in('far_overseas_id', ids.slice(i, i + 500));
      (cvData || []).forEach((c: any) => { costStatus[c.far_overseas_id] = c.status; });
    }
    const base = (r: any) => {
      const fx = implicitFxRate(r);
      const idr = totalInIdr(r);
      const cs = costStatus[r.id];
      const tier1 = getApprovalEntries(r).find(e => e.tier === 1);
      return {
        ...r,
        status_display: getStatusLabel(r),
        due_display: getMemoDueValue(r),
        pic_create_display: tier1?.nama || '',
        unit_price_display: formatMoney(r.unit_price, r.unit_price_currency),
        freight_amount_display: formatMoney(r.freight_amount, r.total_amount_currency),
        clearance_amount_display: formatMoney(r.clearance_amount, r.total_amount_currency),
        other_amount_display: formatMoney(r.other_amount, r.total_amount_currency),
        clearance_other_total_display: formatMoney(r.clearance_other_total, r.total_amount_currency),
        total_amount_display: formatMoney(r.total_amount, r.total_amount_currency),
        fx_display: fx != null ? fx.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '',
        total_idr_display: idr != null ? formatIdr(idr) : '',
        approval_status_display: (APPROVAL_STATUS_META[r.approval_status] || APPROVAL_STATUS_META.PENDING).label,
        cost_status_display: cs ? (COST_STATUS_META[cs]?.label || cs) : 'No AI check',
        nama_pt_display: companyOptions.find(c => c.company_code === r.dominant_company_code)?.company_name_full || r.dominant_company_code || '',
      };
    };
    if (exportMode !== 'PO') return exportRows.map(base);
    // 1 baris per PO (memo tanpa PO tetap 1 baris).
    const out: any[] = [];
    exportRows.forEach((r: any) => {
      const b = base(r);
      const alloc = allocateByVessel(r);
      const poList = getPoList(r);
      const basis = alloc.basis === 'KG' ? 'By KG per PO' : alloc.basis === 'EVEN' ? 'Split evenly (KG incomplete)' : alloc.basis === 'SINGLE' ? 'Whole memo' : '—';
      alloc.rows.forEach((a, i) => {
        out.push({
          ...b,
          po_display: a.po,
          po_pt_display: poList[i]?.company_code || (poList.length === 0 ? (r.non_po_billed_company_code || r.dominant_company_code || '') : ''),
          vessel_display: a.vessel,
          po_kg_display: a.kg != null ? String(a.kg) : '',
          alloc_basis_display: basis,
          alloc_idr_display: a.idr != null ? formatIdr(a.idr) : '',
        });
      });
    });
    return out;
  }, [companyOptions, exportMode]);

  useEffect(() => {
    if (!activeJobId || activeJobStatus !== 'PENDING') return;
    const iv = setInterval(async () => {
      const { data } = await supabase.from('far_overseas_air_processing_queue').select('*').eq('id', activeJobId).maybeSingle();
      if (data) {
        if (data.status === 'SUCCESS') { setActiveJobStatus('SUCCESS'); refreshList(); fetchQueue(); }
        else if (data.status === 'FAILED') { setActiveJobStatus('FAILED'); setActiveJobError(data.error_message || 'Failed to process document.'); fetchQueue(); }
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [activeJobId, activeJobStatus, refreshList, fetchQueue]);

  const handleJobStarted = (jobId: string) => { setActiveJobId(jobId); setActiveJobStatus('PENDING'); setActiveJobError(null); fetchQueue(); };
  const handleSentNoJob = (message: string, isWarning: boolean) => { showToast(message, isWarning, isWarning ? 8000 : 6000); fetchQueue(); };

  const dismissQueueItem = async (id: string) => {
    await supabase.from('far_overseas_air_processing_queue').delete().eq('id', id);
    setQueue(prev => prev.filter(i => i.id !== id));
  };
  const clearCompletedFailedQueue = async () => {
    const idsToDismiss = queue.filter(i => i.status === 'SUCCESS' || i.status === 'FAILED').map(i => i.id);
    if (idsToDismiss.length === 0) return;
    if (!confirm('Clear all completed/failed queue items?')) return;
    const { error } = await supabase.from('far_overseas_air_processing_queue').delete().in('id', idsToDismiss);
    if (error) { showToast('Failed to clear queue: ' + error.message, true, 6000); return; }
    setQueue(prev => prev.filter(i => i.status !== 'SUCCESS' && i.status !== 'FAILED'));
    showToast('Queue cleared.');
  };

  const openMemo = (r: any) => navigate(`/direct-loading/${r.id}`);
  const rowActions: RowActions = {
    canEdit: canEditDirectLoading,
    onMemo: openMemo,
    onEdit: (r) => { setIsNewManualRow(false); setEditRow(r); },
    onCost: (r) => setCostModalRow(r),
    onDocs: (r) => setDocsModalRow(r),
    onDelete: (r) => { setDeleteConfirmRow(r); setDeleteError(null); },
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const validPage = Math.min(page, totalPages);
  const listStartIndex = (validPage - 1) * pageSize;
  const pageIdr = rows.reduce((s, r) => s + (totalInIdr(r) || 0), 0);
  const groupingActive = groupBy !== 'OFF' && (sortBy === 'NEWEST' || sortBy === 'OLDEST');
  const anyFilterActive = activeFilterCount > 0 || statusFilter !== 'ALL' || !!searchInput || dueOnly;

  // Kelompok berurutan (rows sudah terurut upload) -- total per kelompok = memo di halaman ini.
  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: any[] }[] = [];
    rows.forEach(r => {
      const g = groupingActive ? groupKeyOf(r, groupBy) : { key: 'all', label: '' };
      const last = out[out.length - 1];
      if (last && last.key === g.key) last.rows.push(r);
      else out.push({ key: g.key, label: g.label, rows: [r] });
    });
    return out;
  }, [rows, groupBy, groupingActive]);

  const clearAllFilters = () => { setFilters(EMPTY_FILTERS); setStatusFilter('ALL'); setSearchInput(''); setDueOnly(false); };

  const selectCls = 'h-9 border border-[#EADFD6] rounded-xl px-2.5 text-xs text-[#2A1A2C] bg-white focus:outline-none focus:ring-2 focus:ring-[#6B3470]/25';

  const renderListTable = () => (
    <table className="w-full text-[11px] bg-white min-w-[1450px]">
      <thead className="sticky top-0 z-20">
        <tr className="text-[10px] text-[#6E5E70] uppercase tracking-wide bg-[#FBF3EC] shadow-[0_1px_0_#EADFD6]">
          {['Memo', 'PT', 'Payable to (ship via)', 'Route', 'Invoice', 'Due date', 'Vendor', 'No PO', 'Vessel', 'Cost per vessel', 'Total', 'AI check', 'Approval'].map(h => (
            <th key={h} className={`font-bold px-3 py-2.5 whitespace-nowrap ${h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
          <th className="text-left font-bold px-3 py-2.5 whitespace-nowrap sticky right-0 bg-[#FBF3EC] border-l border-[#EADFD6] z-20">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#EADFD6]">
        {loadingList ? (
          <LoadingTableRow colSpan={14} />
        ) : rows.length === 0 ? (
          <tr><td colSpan={14} className="text-center py-10 text-[#6E5E70] text-sm italic">No memos match.</td></tr>
        ) : rows.map(r => {
          const cost = costMap[r.id];
          const route = getRouteDisplay(r.route_note);
          const pos = getPoNumbers(r);
          const due = getDueInfo(getMemoDueValue(r), dueWindow);
          const dueAlarm = isPaymentAlarmActive(r) && r.on_hold !== true && due && due.level !== 'later';
          const warnings = deriveMemoWarnings(r, cost);
          const fx = implicitFxRate(r);
          const locked = isMemoLocked(r.approval_status);
          const editState = editButtonState(r, canEditDirectLoading);
          return (
            <tr key={r.id} className="group hover:bg-[#FBF3EC]/60 align-top">
              <td className="px-3 py-2.5 w-[140px]">{r.memo_no && <p className="font-extrabold text-[#2A1A2C] whitespace-nowrap">{r.memo_no}</p>}<p className={r.memo_no ? 'text-[10px] font-bold text-[#6B3470] break-words' : 'font-bold text-[#2A1A2C] break-words'}>{r.memo_title || '—'}</p><p className="text-[10px] text-[#6E5E70]">Uploaded {formatDateShort(r.created_at)}</p></td>
              <td className="px-3 py-2.5"><PtChip code={r.dominant_company_code} /></td>
              <td className="px-3 py-2.5 w-[170px]"><span className="inline-block rounded-lg bg-[#F5EDF3] px-2 py-1 font-bold text-[#2A1A2C] uppercase break-words">{r.ship_via || '—'}</span></td>
              <td className="px-3 py-2.5 w-[150px] text-[#2A1A2C]">{route ? <>{route.origin} → {route.destination} <span className="text-[9px] font-extrabold text-[#6B3470]">{route.mode}</span></> : <span className="italic text-[#6E5E70]">—</span>}</td>
              <td className="px-3 py-2.5 whitespace-nowrap"><p className="font-semibold text-[#2A1A2C]">{r.no_invoice || '—'}</p><p className="text-[10px] text-[#6E5E70]">{r.invoice_date ? formatDateShort(r.invoice_date) : '—'}</p></td>
              <td className="px-3 py-2.5 whitespace-nowrap"><span className={dueAlarm ? (due?.level === 'overdue' ? 'font-bold text-rose-700' : 'font-bold text-amber-800') : 'text-[#2A1A2C]'}>{due ? formatDateShort(due.date) : '—'}</span></td>
              <td className="px-3 py-2.5 w-[170px] text-[#2A1A2C] break-words">{r.vendor || '—'}</td>
              <td className="px-3 py-2.5 w-[170px] text-[#2A1A2C]"><span className="break-all">{pos[0] || '—'}</span>{pos.length > 1 && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F5EDF3] text-[#6B3470] whitespace-nowrap">+{pos.length - 1} PO</span>}</td>
              <td className="px-3 py-2.5 w-[160px] text-[#6E5E70] break-words">{r.vessel_internal_note || '—'}</td>
              <td className="px-3 py-2.5 w-[200px]">{(() => {
                const alloc = allocateByVessel(r);
                if (alloc.basis === 'NONE') return <span className="italic text-[#6E5E70]">No IDR total</span>;
                const shown = alloc.vessels.slice(0, 2);
                return (
                  <div className="space-y-0.5">
                    {shown.map(v => <p key={v.vessel} className="flex justify-between gap-2"><span className="truncate text-[#2A1A2C]">{v.vessel}</span><span className="font-semibold text-[#2A1A2C] whitespace-nowrap">{formatIdr(v.idr)}</span></p>)}
                    {alloc.vessels.length > 2 && <p className="text-[10px] text-[#6B3470] font-bold">+{alloc.vessels.length - 2} more vessels</p>}
                    <p className="text-[10px] text-[#6E5E70]">{alloc.basis === 'KG' ? 'Split by KG per PO' : alloc.basis === 'EVEN' ? 'Split evenly (KG incomplete)' : 'Whole memo'}</p>
                  </div>
                );
              })()}</td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><p className="font-extrabold text-[#2A1A2C]">{formatMoney(r.total_amount, r.total_amount_currency)}</p>{fx != null && <p className="text-[10px] text-[#6E5E70]">≈ {formatIdr(Number(r.total_amount_idr))}</p>}</td>
              <td className="px-3 py-2.5"><AiChip status={cost?.status} /></td>
              <td className="px-3 py-2.5 w-[230px] space-y-1"><StatusLine rec={r} /><ProgressBar status={r.approval_status} /><MainWarning warnings={warnings} /></td>
              <td className="px-3 py-2.5 sticky right-0 bg-white group-hover:bg-[#FBF3EC] border-l border-[#EADFD6] z-10">
                <div className="flex items-center gap-1">
                  <button onClick={() => openMemo(r)} title="Memo" aria-label="Memo" className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5EDF3] text-[#6B3470] hover:bg-[#EADFD6]"><FileText size={13} /></button>
                  <button onClick={() => rowActions.onEdit(r)} title={editState.label} aria-label={editState.label} className={`w-8 h-8 flex items-center justify-center rounded-lg ${editState.muted ? 'bg-[#FBF3EC] text-[#6E5E70]' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>{editState.muted ? (locked ? <Lock size={13} /> : <Eye size={13} />) : <Edit3 size={13} />}</button>
                  <button onClick={() => setCostModalRow(r)} title="Cost Validation" aria-label="Cost Validation" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EADFD6] text-[#6B3470] hover:bg-[#F5EDF3]"><ClipboardList size={13} /></button>
                  <button onClick={() => setDocsModalRow(r)} title="Docs" aria-label="Docs" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EADFD6] text-[#6B3470] hover:bg-[#F5EDF3]"><FolderOpen size={13} /></button>
                  {canEditDirectLoading && (
                    <button onClick={() => { if (!locked) rowActions.onDelete(r); }} disabled={locked} title={locked ? 'Cannot delete after Prepared By signed' : 'Delete'} aria-label="Delete" className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EADFD6] text-rose-600 hover:bg-rose-50 disabled:opacity-35 disabled:cursor-not-allowed"><Trash2 size={13} /></button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-[#2A1A2C] text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center justify-between gap-3 font-medium text-sm z-[9999] min-w-[300px] max-w-[460px]" style={{ fontFamily: FAR_FONT_FAMILY }}>
          <div className="flex items-center gap-3">
            {toastMessage.warn ? <AlertTriangle size={18} className="text-amber-400 shrink-0" /> : <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
            <span className="leading-tight">{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} aria-label="Dismiss" className="text-white/60 hover:text-white p-1"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 h-full overflow-hidden min-w-0 flex flex-col" style={{ fontFamily: FAR_FONT_FAMILY }}>
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#6B3470] text-white flex items-center justify-center shrink-0">
                <FileCheck2 size={17} />
              </div>
              <div>
                <h1 className="font-extrabold text-2xl text-[#2A1A2C] leading-tight">FAR Overseas</h1>
                <p className="text-[#6E5E70] text-sm mt-0.5">Combined PO informal freight approval memo</p>
              </div>
            </div>
            <Greeting />
          </div>
        </header>

        <main className="px-3 pt-2 pb-2 flex-1 flex flex-col overflow-hidden gap-3 min-h-0">
          {/* Tab + aksi utama */}
          <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-1 bg-white border border-[#EADFD6] rounded-xl p-1">
              <button onClick={() => setTab('MEMOS')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === 'MEMOS' ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>Memos</button>
              {mySteps.length > 0 && (
                <button onClick={() => setTab('MY_APPROVALS')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${tab === 'MY_APPROVALS' ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>
                  My Approvals {myApprovalsCount > 0 && <span className={`text-[10px] px-1.5 rounded-full ${tab === 'MY_APPROVALS' ? 'bg-white text-[#3B1B3D]' : 'bg-rose-600 text-white'}`}>{myApprovalsCount}</span>}
                </button>
              )}
              {canSeeFinance && (
                <button onClick={() => setTab('FINANCE')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === 'FINANCE' ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>Finance Handover</button>
              )}
              {canOpenVendorRates && (
                <button onClick={() => navigate('/settings/tarif-far-overseas-vendor')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#6E5E70] hover:text-[#2A1A2C]">
                  Vendor Rates <ExternalLink size={11} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {mySteps.length > 0 && (
                <button onClick={() => setTab('MY_APPROVALS')} title="Waiting for your approval" aria-label="Waiting for your approval" className="relative h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-[#EADFD6] text-[#2A1A2C] hover:bg-[#F5EDF3]">
                  <Bell size={15} />
                  {myApprovalsCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">{myApprovalsCount}</span>}
                </button>
              )}
              <button onClick={() => setShowQueuePanel(true)} className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-white border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
                <Clock size={14} /> Processing Queue
                <span className={`text-[10px] font-bold px-1.5 rounded-full ${queue.length > 0 ? 'bg-rose-600 text-white' : 'bg-[#F5EDF3] text-[#6E5E70]'}`}>{queue.length}</span>
              </button>
              <div className="relative">
                <button onClick={() => setShowExportMenu(m => !m)} className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-white border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
                  <Download size={14} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-10 z-30 w-56 bg-white border border-[#EADFD6] rounded-xl shadow-lg py-1 text-xs">
                    <button onClick={() => { setShowExportMenu(false); setExportMode('PO'); }} className="w-full text-left px-3 py-2 hover:bg-[#F5EDF3]"><span className="font-bold text-[#2A1A2C]">1 row per PO</span><span className="block text-[#6E5E70]">Full data incl. vessel & IDR allocation</span></button>
                    <button onClick={() => { setShowExportMenu(false); setExportMode('MEMO'); }} className="w-full text-left px-3 py-2 hover:bg-[#F5EDF3]"><span className="font-bold text-[#2A1A2C]">1 row per memo</span></button>
                  </div>
                )}
              </div>
              {canEditDirectLoading && (
                <button onClick={handleAddManualEntry} disabled={creatingManualEntry} title="For shipments that the upload automation never processed" className="h-9 flex items-center gap-1.5 px-3 rounded-xl bg-white border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3] disabled:opacity-50">
                  <Plus size={14} /> {creatingManualEntry ? 'Creating...' : 'Add manual entry'}
                </button>
              )}
              {canEditDirectLoading && (
                <button onClick={() => setShowUploadModal(true)} className="h-9 flex items-center gap-1.5 px-3.5 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-bold shadow-sm">
                  <UploadCloud size={14} /> Upload Document
                </button>
              )}
            </div>
          </div>

          {/* Banner job upload aktif */}
          {activeJobId && activeJobStatus === 'PENDING' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 shrink-0">
              <div className="w-7 h-7 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900">AI is processing the document...</p>
                <p className="text-xs text-amber-800 mt-0.5">The list refreshes automatically when it's done.</p>
              </div>
            </div>
          )}
          {activeJobId && activeJobStatus === 'SUCCESS' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3"><CheckCircle2 size={20} className="text-emerald-600 shrink-0" /><p className="text-sm font-bold text-emerald-800">Document processed — it now appears in the list.</p></div>
              <button onClick={() => { setActiveJobId(null); setActiveJobStatus(null); }} aria-label="Dismiss" className="text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
            </div>
          )}
          {activeJobId && activeJobStatus === 'FAILED' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3"><AlertTriangle size={20} className="text-rose-600 shrink-0" /><div><p className="text-sm font-bold text-rose-800">Failed to process document.</p><p className="text-xs text-rose-700 mt-0.5">{activeJobError}</p></div></div>
              <button onClick={() => { setActiveJobId(null); setActiveJobStatus(null); }} aria-label="Dismiss" className="text-rose-600 hover:text-rose-800"><X size={16} /></button>
            </div>
          )}

          {tab === 'FINANCE' && canSeeFinance ? (
            <div className="flex-1 min-h-0">
              <FarOverseasAirFinanceHandover
                canAct={canActFinance}
                defaultReceiverName={profile?.nama || user?.email || ''}
                refreshKey={myApprovalsRefreshKey}
                onOpenMemo={(id) => navigate(`/direct-loading/${id}`)}
                onOpenDocs={(r) => setDocsModalRow(r)}
                onOpenCost={(r) => setCostModalRow(r)}
                onChanged={refreshList}
              />
            </div>
          ) : tab === 'MY_APPROVALS' && mySteps.length > 0 ? (
            <div className="flex-1 min-h-0">
              <FarOverseasAirMyApprovals
                mySteps={mySteps}
                signers={stepSigners}
                phase2={phase2}
                myTier={myTier}
                userId={user?.id || null}
                userEmail={user?.email || null}
                greetingName={profile?.nama || user?.email || ''}
                canSign={canEditDirectLoading}
                refreshKey={myApprovalsRefreshKey}
                onOpenMemo={(id) => navigate(`/direct-loading/${id}`)}
                onOpenDocs={(r) => setDocsModalRow(r)}
                onOpenCost={(r) => setCostModalRow(r)}
                onOpenMemosList={() => { setTab('MEMOS'); setStatusFilter(mySteps[0] || 'ALL'); }}
              />
            </div>
          ) : (
            <>
              {/* PANEL FILTER -- 1 kartu putih solid (toolbar + filter lanjutan + alarm due, dipisah
                  garis tipis). SENGAJA beda tampilan dari kartu konten di bawahnya (permintaan user:
                  panel filter & tabel harus jelas terpisah). */}
              <div className="bg-white rounded-2xl border border-[#EADFD6] shadow-sm shrink-0 overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2 flex-nowrap overflow-x-auto">
                <div className="flex items-center rounded-xl bg-[#FBF3EC] p-1 shrink-0">
                  <button onClick={() => setViewMode('LIST')} className={`flex items-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold ${viewMode === 'LIST' ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70]'}`}><ListIcon size={13} /> List</button>
                  <button onClick={() => setViewMode('CARD')} className={`flex items-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold ${viewMode === 'CARD' ? 'bg-[#3B1B3D] text-white' : 'text-[#6E5E70]'}`}><LayoutGrid size={13} /> Card</button>
                </div>
                <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-[#EADFD6] flex-1 min-w-[220px]">
                  <Search size={14} className="text-[#6E5E70] shrink-0" />
                  <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search invoice, vendor, PO number, ship via..." className="flex-1 min-w-0 text-xs bg-transparent text-[#2A1A2C] placeholder:text-[#6E5E70]/70 focus:outline-none" />
                  {searchInput && <button onClick={() => setSearchInput('')} aria-label="Clear search" className="text-[#6E5E70] hover:text-[#2A1A2C]"><X size={13} /></button>}
                </div>
                <button onClick={() => setShowFilters(s => !s)} className={`relative h-9 flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold shrink-0 ${showFilters || activeFilterCount > 0 ? 'border-[#6B3470] text-[#6B3470] bg-[#F5EDF3]' : 'border-[#EADFD6] text-[#2A1A2C]'}`}>
                  <SlidersHorizontal size={14} /> Filter
                  {activeFilterCount > 0 && <span className="text-[10px] px-1.5 rounded-full bg-[#6B3470] text-white">{activeFilterCount}</span>}
                </button>
                <label className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-xl border border-[#EADFD6] shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Status</span>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="h-8 text-xs font-semibold text-[#2A1A2C] bg-transparent focus:outline-none cursor-pointer">
                    <option value="ALL">All statuses</option>
                    <option value="TIER1">Waiting on Prepared By ({approvalCounts.TIER1})</option>
                    <option value="PIC">Waiting on PIC Shipment ({approvalCounts.PIC})</option>
                    <option value="TIER2">Waiting on Exim Supervisor ({approvalCounts.TIER2})</option>
                    <option value="TIER3">Waiting on Director ({approvalCounts.TIER3})</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    {phase2 && <option value="FINANCE">Waiting on Finance</option>}
                    {phase2 && <option value="PAID">Paid</option>}
                  </select>
                </label>
                <label className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-xl border border-[#EADFD6] shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Sort</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="h-8 text-xs font-semibold text-[#2A1A2C] bg-transparent focus:outline-none cursor-pointer">
                    {(Object.keys(SORT_LABEL) as SortBy[]).map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                  </select>
                </label>
                <button onClick={refreshList} disabled={loadingList} title="Refresh" aria-label="Refresh" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#2A1A2C] hover:bg-[#F5EDF3] shrink-0 disabled:opacity-50">
                  <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
                </button>
              </div>

              {showFilters && (
                <div className="border-t border-[#EADFD6] bg-[#F5EDF3]/40 px-3 py-2.5 flex items-end gap-2 flex-wrap">
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Ship via</span>
                    <select value={filters.shipVia} onChange={e => setFilters(f => ({ ...f, shipVia: e.target.value }))} className={selectCls}>
                      <option value="">All</option><option value="OCTAGON">Octagon</option><option value="JIANQIAO">Jianqiao</option>
                    </select>
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Paying PT</span>
                    <select value={filters.pt} onChange={e => setFilters(f => ({ ...f, pt: e.target.value }))} className={selectCls}>
                      <option value="">All</option>{companyOptions.map(c => <option key={c.company_code} value={c.company_code}>{c.company_code}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Origin</span>
                    <select value={filters.origin} onChange={e => setFilters(f => ({ ...f, origin: e.target.value }))} className={selectCls}>
                      <option value="">All</option>{originOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Destination</span>
                    <select value={filters.destination} onChange={e => setFilters(f => ({ ...f, destination: e.target.value }))} className={selectCls}>
                      <option value="">All</option>{destinationOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Mode</span>
                    <select value={filters.mode} onChange={e => setFilters(f => ({ ...f, mode: e.target.value }))} className={selectCls}>
                      <option value="">All</option><option value="AIR">Air</option><option value="SEA">Sea</option>
                    </select>
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Remark</span>
                    <input value={filters.remark} onChange={e => setFilters(f => ({ ...f, remark: e.target.value }))} placeholder="LARTAS..." className={`${selectCls} w-28`} />
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">Invoice date from</span>
                    <input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className={selectCls} />
                  </label>
                  <label className="block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#6E5E70] mb-1">to</span>
                    <input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className={selectCls} />
                  </label>
                  {activeFilterCount > 0 && <button onClick={() => setFilters(EMPTY_FILTERS)} className="h-9 px-3 text-xs font-bold text-[#6B3470] hover:underline">Clear</button>}
                </div>
              )}

              {canEditDirectLoading && (dueAlert.overdue > 0 || dueAlert.soon > 0 || dueAlert.onHold > 0 || dueOnly) && (
                <div className="border-t border-rose-200 bg-rose-50/70 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-rose-800 flex items-center gap-2 flex-wrap">
                    <Bell size={14} className="shrink-0" />
                    <span className="font-bold">Payment due alert:</span>
                    {dueAlert.overdue} overdue · {dueAlert.soon} due within
                    <select value={dueWindow} onChange={e => setDueWindow(Number(e.target.value))} className="border border-rose-200 bg-white rounded-md px-1 py-0.5 text-xs">
                      {[1, 3, 5, 7].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    days{dueAlert.onHold > 0 ? ` · ${dueAlert.onHold} on hold (goods)` : ''} <span className="text-rose-700/70">{phase2 ? '(stops once paid)' : '(memos still in approval)'}</span>
                  </p>
                  <button onClick={() => { const next = !dueOnly; setDueOnly(next); if (next) setSortBy('DUE_SOON'); }} className="px-3 py-1 rounded-lg border border-rose-300 bg-white text-xs font-bold text-rose-700 hover:bg-rose-100">
                    {dueOnly ? 'Show all memos' : 'Show them'}
                  </button>
                </div>
              )}

              </div>

              {/* KARTU KONTEN (tabel/card) -- header ringkasan + group by, area scroll, pagination. */}
              <div className="flex-1 min-h-0 flex flex-col bg-white/70 backdrop-blur-md rounded-2xl border border-white/70 shadow-sm overflow-hidden">
                {/* Ringkasan + group by */}
                <div className="px-4 py-2.5 border-b border-[#EADFD6] bg-white flex items-center justify-between gap-2 flex-wrap shrink-0">
                  <p className="text-xs text-[#6E5E70]">
                    <span className="font-bold text-[#2A1A2C]">{totalRecords} memo{totalRecords === 1 ? '' : 's'}</span>
                    {rows.length > 0 && <> · this page {formatIdr(pageIdr)}</>}
                    {anyFilterActive && <button onClick={clearAllFilters} className="ml-2 font-bold text-[#6B3470] hover:underline">Clear filters</button>}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Group by</span>
                    <div className={`flex items-center rounded-xl bg-white border border-[#EADFD6] p-0.5 ${groupingActive || groupBy === 'OFF' ? '' : 'opacity-60'}`} title={sortBy === 'NEWEST' || sortBy === 'OLDEST' ? undefined : 'Grouping works with upload-date sorting'}>
                      {(['DATE', 'MONTH', 'YEAR', 'OFF'] as GroupBy[]).map(g => (
                        <button key={g} onClick={() => setGroupBy(g)} className={`px-2.5 h-7 rounded-lg text-xs font-bold ${groupBy === g ? 'bg-[#6B3470] text-white' : 'text-[#6E5E70] hover:text-[#2A1A2C]'}`}>
                          {g === 'DATE' ? 'Date' : g === 'MONTH' ? 'Month' : g === 'YEAR' ? 'Year' : 'Off'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {listError ? (
                  <div className="m-4 p-4 rounded-xl bg-rose-50 text-sm text-rose-700">Failed to load memos: {listError}</div>
                ) : viewMode === 'LIST' ? (
                  <div className="flex-1 min-h-0 overflow-auto">{renderListTable()}</div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    {loadingList ? (
                      <LoadingState fullHeight={false} />
                    ) : rows.length === 0 ? (
                      <div className="text-center py-12 text-[#6E5E70]">
                        <p className="text-sm font-semibold text-[#2A1A2C]">{anyFilterActive ? 'No memos match these filters.' : 'No FAR Overseas memos yet.'}</p>
                        <p className="text-xs mt-1">{anyFilterActive ? 'Try clearing the filters.' : 'Click "Upload Document" to get started.'}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {groups.map(g => {
                          const gIdr = g.rows.reduce((s, r) => s + (totalInIdr(r) || 0), 0);
                          return (
                            <div key={g.key}>
                              {groupingActive && (
                                <div className="flex items-baseline justify-between gap-2 mb-2 px-0.5">
                                  <p className="text-base font-extrabold text-[#2A1A2C]">{g.label} <span className="text-xs font-medium text-[#6E5E70] ml-1">{g.rows.length} memo{g.rows.length === 1 ? '' : 's'} on this page</span></p>
                                  <p className="text-xs text-[#6E5E70]">Total ≈ <span className="font-bold text-[#2A1A2C]">{formatIdr(gIdr)}</span></p>
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                {g.rows.map(r => <MemoCard key={r.id} r={r} cost={costMap[r.id]} dueWindow={dueWindow} actions={rowActions} />)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {rows.length > 0 && (
                  <div className="flex max-sm:flex-col justify-between items-center px-4 py-2.5 border-t border-[#EADFD6] bg-white gap-3 shrink-0">
                    <div className="text-xs text-[#6E5E70]">
                      Showing <span className="font-bold text-[#2A1A2C]">{listStartIndex + 1}–{Math.min(listStartIndex + pageSize, totalRecords)}</span> of <span className="font-bold text-[#2A1A2C]">{totalRecords}</span> records
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={validPage === 1} className="px-3 py-1.5 rounded-lg border border-[#EADFD6] bg-white text-[#2A1A2C] text-xs font-semibold hover:bg-[#F5EDF3] disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                      <span className="text-xs text-[#6E5E70] min-w-[80px] text-center">Page <span className="font-bold text-[#2A1A2C]">{validPage}</span> of {totalPages}</span>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={validPage === totalPages} className="px-3 py-1.5 rounded-lg border border-[#EADFD6] bg-white text-[#2A1A2C] text-xs font-semibold hover:bg-[#F5EDF3] disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {selected && (
        // Fragment ber-key: memo lain dibuka (deep link berubah) -> modal di-mount ulang dgn
        // state bersih (state `rec` internalnya diinisialisasi dari `record` sekali saja).
        <React.Fragment key={selected.id}>
          <FarOverseasAirDetailModal
            record={selected}
            onClose={() => { setSelected(null); if (deepLinkId) navigate('/direct-loading', { replace: true }); }}
            onChanged={refreshList}
            onOpenEdit={(rec) => { setIsNewManualRow(false); setEditSaveError(null); setEditRow(rec); }}
            refreshToken={detailRefreshToken}
          />
        </React.Fragment>
      )}

      {costModalRow && (
        <FarOverseasAirCostValidationModal
          farOverseasId={costModalRow.id}
          approvalStatus={costModalRow.approval_status}
          onClose={() => setCostModalRow(null)}
          onChanged={refreshList}
        />
      )}

      {docsModalRow && <FarOverseasAirDocumentsModal record={docsModalRow} onClose={() => setDocsModalRow(null)} />}

      {editRow && (
        <FarOverseasAirEditMemoModal
          row={editRow}
          ctx={{
            getVal, setVal, pendingForRow: pendingEdits[editRow.id], picUsers, companyOptions, memoTitleOptions, addMemoTitleOption,
            tarifVendorRows, costCity: costMap[editRow.id]?.destinationCity || '', phase2,
          }}
          readOnly={!canEditDirectLoading || isMemoLocked(editRow.approval_status)}
          readOnlyReason={!canEditDirectLoading ? 'View only — you do not have edit access to FAR Overseas.' : 'Locked — Prepared By has signed. The memo opens again only after a Reject.'}
          receiptEditable={phase2 && canEditDirectLoading && isMemoLocked(editRow.approval_status) && !editRow.paid_at}
          isNew={isNewManualRow}
          saving={savingEdits}
          saveError={editSaveError}
          onCancel={() => { setEditSaveError(null); closeEditModal(); }}
          onSave={saveEditModal}
          onOpenWeight={(r) => setWeightModalRow(r)}
        />
      )}

      {weightModalRow && (
        <FarOverseasAirWeightBreakdownModal
          record={weightModalRow}
          readOnly={!canEditDirectLoading}
          onClose={() => setWeightModalRow(null)}
          onSaved={(updates) => {
            setEditRow((prev: any) => (prev && prev.id === weightModalRow.id ? { ...prev, ...updates } : prev));
            // Kalau kapal per PO sedang diedit (po_list pending), KG yang baru disimpan WAJIB ikut
            // dimasukkan ke po_list pending -- kalau tidak, Save memo menimpa KG dgn nilai lama.
            setPendingEdits(prev => {
              const rowEdits = prev[weightModalRow.id];
              if (!rowEdits || !Array.isArray(rowEdits.po_list)) return prev;
              const merged = rowEdits.po_list.map((p: any, i: number) => ({ ...p, weight_kg: updates.po_list[i]?.weight_kg ?? p.weight_kg }));
              return { ...prev, [weightModalRow.id]: { ...rowEdits, po_list: merged, dominant_company_code: updates.dominant_company_code } };
            });
            setDetailRefreshToken(t => t + 1);
            fetchList();
          }}
        />
      )}

      {deleteConfirmRow && (
        <DeleteConfirmModal record={deleteConfirmRow} deleting={deleting} error={deleteError} onClose={() => setDeleteConfirmRow(null)} onConfirm={confirmDelete} />
      )}

      {showUploadModal && (
        <FarOverseasAirUploadModal onClose={() => setShowUploadModal(false)} onJobStarted={handleJobStarted} onSentNoJob={handleSentNoJob} />
      )}

      {exportMode && (
        <React.Fragment key={exportMode}><ExportModal
          title={exportMode === 'PO' ? 'FAR Overseas (per PO)' : 'FAR Overseas'}
          cols={exportMode === 'PO' ? FAR_EXPORT_PO_COLS : FAR_EXPORT_COLS}
          fetchData={getExportData}
          dateFieldLabel="Invoice date filter"
          onClose={() => setExportMode(null)}
        /></React.Fragment>
      )}

      {showQueuePanel && (
        <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
          <div className="bg-white rounded-2xl shadow-2xl w-[85vw] max-w-6xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[#EADFD6] shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5"><Clock size={19} className="text-[#6B3470]" /><h2 className="text-lg font-bold text-[#2A1A2C]">Processing Queue</h2></div>
                {queue.some(i => i.status === 'SUCCESS' || i.status === 'FAILED') && (
                  <button onClick={clearCompletedFailedQueue} className="text-[11px] font-semibold text-[#6B3470] bg-[#F5EDF3] hover:bg-[#EADFD6] px-2.5 py-1 rounded-lg transition-colors">Clear completed/failed</button>
                )}
              </div>
              <button onClick={() => setShowQueuePanel(false)} aria-label="Close" className="text-[#6E5E70] hover:text-[#2A1A2C] p-1"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              {queue.length === 0 ? (
                <p className="text-sm text-[#6E5E70] italic text-center py-8">No documents in the queue.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {queue.map(item => <QueueCard key={item.id} item={item} onDismiss={dismissQueueItem} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
