import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Stamp, Ban, ChevronDown, ChevronUp, Printer, FolderOpen, ClipboardList, MoreHorizontal, CheckCircle2, AlertTriangle, Clock, Info, Undo2, History, Bell, Lock, Pencil, Wallet } from 'lucide-react';
import {
  formatMoney, formatDateShort, formatDateTimeID, COST_STATUS_META, parseJsonField, computeCostStatus,
  nextStepForStatus, STEP_LABEL, STEP_ORDER, getApprovalEntries, findApprovalEntry, getWaitInfo, completedStepCount,
  getStatusLabel, getFinanceStage, isMemoLocked, fetchCanSign, fetchPreparedByBlockers, fetchMemoLog, implicitFxRate,
  ensureFarFont, FAR_FONT_FAMILY, type ApprovalStep, type SignerConfig, type MemoLogEntry,
} from '../utils/FarOverseasAirHelpers';
import FarOverseasMemoPaper, { MemoPaymentLine } from './FarOverseasMemoPaper';
import FarOverseasAirCostValidationModal from './FarOverseasAirCostValidationModal';
import FarOverseasAirDocumentsModal, { getMemoDocs } from './FarOverseasAirDocumentsModal';

// Modal Approval memo FAR Overseas Air. ATURAN (jangan dilonggarkan):
// - Rantai WAJIB berurutan Prepared By (TIER1) -> PIC Shipment -> SPV (TIER2) -> Director (TIER3).
// - Gating GANDA: `canEdit('direct_loading')` DAN eligible tahap aktif. Eligible diambil dari RPC
//   `fn_far_overseas_can_sign` (tahap 2: termasuk penandatangan per PT/rantai IMI); kalau RPC itu
//   belum ada (sql/027 belum dijalankan) fallback ke aturan lama: PIC = `pic_user_id`, lainnya
//   `canApproveTier` (TANPA bypass Admin). Server menegakkan ulang di `approve_far_overseas_air`.
// - Satu klik sign; nama = `defaultNamaForStep`. Reject hanya utk eligible tahap AKTIF.
// - Syarat Prepared By: tahap 2 dari `fn_far_overseas_prepared_by_blockers` (SAMA dgn guard RPC);
//   fallback tahap 1 = Notes (Manual) wajib kalau unit price tidak MATCH (`tier1BlockedByNotes`).
// - Tahap 2: memo REJECTED kembali ke Prepared By (boleh sign ulang), Undo last sign (hanya
//   penanda tangan terakhir), Remind (tercatat di audit trail, belum kirim notifikasi), audit trail.

const STEP_ACTION_LABEL: Record<ApprovalStep, string> = {
  TIER1: 'Sign as Prepared By',
  PIC: 'Sign as PIC Shipment',
  TIER2: 'Sign as Exim Supervisor',
  TIER3: 'Sign as Director',
};
// Status -> tahap yang BARU SAJA ditandatangani (utk Undo last sign).
const LAST_SIGNED_STEP: Record<string, ApprovalStep> = { TIER1_DONE: 'TIER1', PIC_DONE: 'PIC', TIER2_DONE: 'TIER2', APPROVED: 'TIER3' };

function RejectModal({ onConfirm, onClose, submitting }: { onConfirm: (reason: string) => void; onClose: () => void; submitting: boolean }) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < 5;
  return (
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[80] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl sm:max-w-sm w-full p-6">
        <h3 className="font-bold text-[#2A1A2C] mb-1">Reject memo</h3>
        <p className="text-xs text-[#6E5E70] mb-4">The memo goes back to Prepared By and all signatures are removed. The reason is shown on the memo.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Reason for rejection (min. 5 characters)..."
          className="w-full border border-[#EADFD6] rounded-xl px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
        />
        <p className={`text-[11px] mb-4 ${tooShort && reason.length > 0 ? 'text-rose-600' : 'text-[#6E5E70]'}`}>{reason.trim().length}/5 characters minimum</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={submitting} className="min-h-[44px] rounded-xl border border-[#EADFD6] text-[#2A1A2C] font-semibold text-sm hover:bg-[#F5EDF3] transition-all disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={submitting || tooShort}
            className="min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, icon, children, action }: { tone: 'red' | 'amber' | 'grey' | 'green'; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  const cls = tone === 'red' ? 'bg-rose-50 border-rose-200 text-rose-800'
    : tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-900'
    : tone === 'green' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-white border-[#EADFD6] text-[#6E5E70]';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs print:hidden ${cls}`}>
      <div className="flex items-start gap-2 min-w-0"><span className="shrink-0 mt-0.5">{icon}</span><div className="min-w-0">{children}</div></div>
      {action && <div className="shrink-0 flex items-center gap-1.5">{action}</div>}
    </div>
  );
}

const LOG_ACTION_LABEL: Record<string, string> = {
  UPLOAD: 'Uploaded', EDIT: 'Edited', SIGN: 'Signed', UNDO_SIGN: 'Undid last sign', REJECT: 'Rejected',
  CONFIRM_AI: 'Confirmed AI finding', REMIND: 'Reminder', FINANCE_ACCEPT: 'Received by Finance', PAID: 'Paid',
};
function describeLog(e: MemoLogEntry): string {
  if (e.action === 'EDIT') return `${e.field}: ${e.old_value ?? '—'} → ${e.new_value ?? '—'}`;
  if (e.action === 'SIGN' || e.action === 'REJECT' || e.action === 'REMIND') return `${e.field ? STEP_LABEL[e.field as ApprovalStep] || e.field : ''}${e.note ? ` — ${e.note}` : ''}`;
  if (e.action === 'CONFIRM_AI') return `${e.field || ''}${e.note ? ` — ${e.note}` : ''}`;
  return e.note || '';
}

export default function FarOverseasAirDetailModal({ record, onClose, onChanged, onOpenEdit, refreshToken }: {
  record: any;
  onClose: () => void;
  onChanged?: () => void;
  onOpenEdit?: (rec: any) => void;
  refreshToken?: number;
}) {
  const { user, profile, canEdit, canApproveTier } = useAuth();
  const canEditDirectLoading = canEdit('direct_loading');
  const [rec, setRec] = useState(record);
  const [signer, setSigner] = useState<SignerConfig | null>(null);
  const [showPoDetail, setShowPoDetail] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [costNotesManual, setCostNotesManual] = useState<string | null>(null);
  const [unitPriceCostStatus, setUnitPriceCostStatus] = useState<string | null>(null);
  const [costStatus, setCostStatus] = useState<string | null>(null);
  const [costCatatan, setCostCatatan] = useState<string | null>(null);
  const [costExists, setCostExists] = useState(false);
  const [costNotesLoaded, setCostNotesLoaded] = useState(false);
  const [costReloadKey, setCostReloadKey] = useState(0);
  const [rpcEligible, setRpcEligible] = useState<boolean | null>(null);
  const [serverBlockers, setServerBlockers] = useState<{ available: boolean; blockers: string[] } | null>(null);
  const [log, setLog] = useState<MemoLogEntry[] | null>(null);
  const [logReloadKey, setLogReloadKey] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstRefresh = useRef(true);

  const phase2 = rec != null && 'payment_type' in rec;
  const nextStep = nextStepForStatus(rec.approval_status);
  // Tahap yang bisa DITANDATANGANI sekarang: tahap 2 -> memo REJECTED kembali ke Prepared By.
  const signStep: ApprovalStep | null = rec.approval_status === 'REJECTED' && phase2 ? 'TIER1' : nextStep;

  useEffect(() => { ensureFarFont(); }, []);

  const reloadRec = async () => {
    const { data } = await supabase.from('rekapan_far_overseas_air').select('*').eq('id', rec.id).maybeSingle();
    if (data) setRec(data);
  };
  // Halaman menaikkan `refreshToken` setelah Edit memo disimpan -> ambil ulang memo ini.
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return; }
    reloadRec();
    setCostReloadKey(k => k + 1);
    setLogReloadKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    const loadSigner = async () => {
      if (!rec?.dominant_company_code) { setSigner(null); return; }
      const { data } = await supabase.from('far_overseas_signer_config').select('*').eq('company_code', rec.dominant_company_code).maybeSingle();
      setSigner(data || null);
    };
    loadSigner();
  }, [rec?.dominant_company_code]);

  useEffect(() => {
    const loadCost = async () => {
      setCostNotesLoaded(false);
      const { data } = await supabase.from('cost_validasi_far_overseas_air').select('notes_manual, cost_validation, status, catatan').eq('far_overseas_id', rec.id).maybeSingle();
      setCostExists(!!data);
      setCostNotesManual(data?.notes_manual ?? null);
      setCostStatus(data?.status ?? null);
      setCostCatatan(data?.catatan ?? null);
      const checks = parseJsonField(data?.cost_validation);
      const unitPriceRow = Array.isArray(checks) ? checks.find((c: any) => c?.row_key === 'UNIT_PRICE_DARI_DESCRIPTION') : null;
      const expected = unitPriceRow?.expected != null && unitPriceRow.expected !== '' ? Number(unitPriceRow.expected) : null;
      const actual = unitPriceRow?.actual != null && unitPriceRow.actual !== '' ? Number(unitPriceRow.actual) : null;
      setUnitPriceCostStatus(computeCostStatus(expected, actual));
      setCostNotesLoaded(true);
    };
    loadCost();
  }, [rec?.id, costReloadKey]);

  // Eligibility & syarat dari SERVER (tahap 2). null/available=false -> fallback lokal.
  useEffect(() => {
    let cancelled = false;
    if (!signStep) { setRpcEligible(null); return; }
    fetchCanSign(rec.id, signStep).then(v => { if (!cancelled) setRpcEligible(v); });
    return () => { cancelled = true; };
  }, [rec.id, signStep, rec.pic_user_id, rec.dominant_company_code]);
  useEffect(() => {
    let cancelled = false;
    if (signStep !== 'TIER1') { setServerBlockers(null); return; }
    fetchPreparedByBlockers(rec.id).then(v => { if (!cancelled) setServerBlockers(v); });
    return () => { cancelled = true; };
  }, [rec.id, signStep, rec.updated_at, costReloadKey]);
  useEffect(() => {
    let cancelled = false;
    if (!phase2) { setLog(null); return; }
    fetchMemoLog(rec.id).then(v => { if (!cancelled) setLog(v); });
    return () => { cancelled = true; };
  }, [rec.id, phase2, logReloadKey]);

  useEffect(() => {
    if (!showMenu) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showMenu]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const entries = getApprovalEntries(rec);
  const doneCount = completedStepCount(rec.approval_status);
  const wait = getWaitInfo(rec);
  const fin = getFinanceStage(rec);

  const localEligible = (step: ApprovalStep) =>
    step === 'PIC' ? (!!rec.pic_user_id && rec.pic_user_id === user?.id) : canApproveTier('direct_loading', step);
  const isEligibleForStep = (step: ApprovalStep) => (step === signStep && rpcEligible != null ? rpcEligible : localEligible(step));

  const canReject = nextStep != null && canEditDirectLoading && isEligibleForStep(nextStep);

  const unitPriceIsMatch = unitPriceCostStatus === 'MATCH';
  const tier1BlockedByNotes = signStep === 'TIER1' && costNotesLoaded && !unitPriceIsMatch && !(costNotesManual && costNotesManual.trim());
  const blockerList: string[] = signStep !== 'TIER1' ? []
    : serverBlockers?.available ? serverBlockers.blockers
    : tier1BlockedByNotes ? [costExists ? 'Unit price in Cost Validation is not a match — fill in "Notes (Manual)" first' : 'Cost validation for this memo is not available yet'] : [];
  const prepBlocked = blockerList.length > 0;

  const roleForStep = (step: ApprovalStep) => step === 'TIER1' ? signer?.tier1_role : step === 'PIC' ? 'PIC' : step === 'TIER2' ? signer?.tier2_role : signer?.tier3_role;
  const defaultNamaForStep = (step: ApprovalStep) => step === 'TIER1' || step === 'PIC' ? (profile?.nama || user?.email || '') : step === 'TIER2' ? (signer?.tier2_name || '') : (signer?.tier3_name || '');

  const handleApprove = async (step: ApprovalStep, nama: string) => {
    setSubmitting(true);
    const jabatan = step === 'PIC' ? 'PIC' : (roleForStep(step) || '-');
    const { data, error } = await supabase.rpc('approve_far_overseas_air', { p_id: rec.id, p_step: step, p_nama: nama, p_jabatan: jabatan });
    setSubmitting(false);
    if (error || !data) {
      showToast('Failed to sign: ' + (error?.message || 'unknown error'), 'error');
    } else {
      setRec({ ...rec, approval_status: data.approval_status, approvals: data.approvals, ...(step === 'TIER1' && phase2 ? { fx_locked_at: new Date().toISOString() } : {}) });
      showToast(`Signed as ${STEP_LABEL[step]}.`, 'success');
      setLogReloadKey(k => k + 1);
      onChanged?.();
    }
  };

  const handleReject = async (reason: string) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('reject_far_overseas_air', { p_id: rec.id, p_reason: reason });
    setSubmitting(false);
    if (error || !data) {
      showToast('Failed to reject memo: ' + (error?.message || 'unknown error'), 'error');
    } else {
      // Tahap 2: RPC mengosongkan tanda tangan -- ambil ulang baris supaya kertas memo sinkron.
      setRec({ ...rec, approval_status: data.approval_status, notes: data.notes, ...(data.approvals ? { approvals: data.approvals, rejected_step: data.rejected_step } : {}) });
      setShowReject(false);
      showToast('Memo rejected — it goes back to Prepared By.', 'success');
      if (phase2) reloadRec();
      setLogReloadKey(k => k + 1);
      onChanged?.();
    }
  };

  const lastStep = LAST_SIGNED_STEP[rec.approval_status || ''];
  const lastEntry = lastStep ? findApprovalEntry(entries, lastStep) : undefined;
  const canUndo = phase2 && canEditDirectLoading && !!lastEntry && !!user?.email && lastEntry.user_email === user.email && !rec.finance_received_at;
  const handleUndo = async () => {
    setShowMenu(false);
    if (!window.confirm(`Undo your ${STEP_LABEL[lastStep]} signature?`)) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('fn_far_overseas_undo_last_sign', { p_id: rec.id });
    setSubmitting(false);
    if (error || !data) { showToast('Failed to undo: ' + (error?.message || 'unknown error'), 'error'); return; }
    setRec({ ...rec, approval_status: data.approval_status, approvals: data.approvals });
    if (data.approval_status === 'PENDING') reloadRec();
    showToast('Your signature was removed.', 'success');
    setLogReloadKey(k => k + 1);
    onChanged?.();
  };

  const handleRemind = async () => {
    const { error } = await supabase.rpc('fn_far_overseas_log_reminder', { p_id: rec.id, p_note: null });
    if (error) { showToast('Failed to record reminder: ' + error.message, 'error'); return; }
    showToast('Reminder recorded in the audit trail. (No email/WhatsApp is sent yet.)', 'success');
    setLogReloadKey(k => k + 1);
  };

  const parsedPoList = parseJsonField(rec.po_list);
  const poList: any[] = Array.isArray(parsedPoList) ? parsedPoList : [];
  const docCount = getMemoDocs(rec).length;
  const costMeta = costStatus ? COST_STATUS_META[costStatus] : null;
  const locked = isMemoLocked(rec.approval_status);
  const fx = implicitFxRate(rec);
  const statusLabel = getStatusLabel(rec);

  const stepInfo = (step: ApprovalStep): { name: string; sub: string } => {
    const entry = findApprovalEntry(entries, step);
    if (entry) return { name: entry.nama || '—', sub: `Signed ${formatDateShort(entry.approved_at)}` };
    if (step === 'TIER1') return { name: 'Exim Officer', sub: signStep === 'TIER1' ? 'Waiting' : '—' };
    if (step === 'PIC') return rec.pic_name ? { name: rec.pic_name, sub: signStep === 'PIC' ? 'Waiting' : 'Assigned' } : { name: 'Not assigned', sub: 'PIC shipment' };
    if (step === 'TIER2') return { name: signer?.tier2_name || 'Exim Supervisor', sub: signer?.tier2_role || 'Checked By' };
    return { name: signer?.tier3_name || 'Director', sub: signer?.tier3_role || 'Checked By' };
  };

  let signLabel: string | null = null;
  let signDisabled = true;
  if (signStep) {
    if (!canEditDirectLoading) signLabel = 'View only';
    else if (!isEligibleForStep(signStep)) signLabel = `Waiting for ${STEP_LABEL[signStep]}`;
    else if (signStep === 'TIER1' && prepBlocked) signLabel = phase2 ? 'Complete the memo first' : 'Complete Cost Validation notes first';
    else { signLabel = STEP_ACTION_LABEL[signStep]; signDisabled = false; }
  }
  const signBtn = (extra: string) => signLabel && (
    <button
      onClick={() => { if (!signDisabled && signStep) handleApprove(signStep, defaultNamaForStep(signStep)); }}
      disabled={signDisabled || submitting}
      title={signDisabled ? signLabel : undefined}
      className={`${extra} flex items-center justify-center gap-1.5 px-3.5 rounded-xl text-xs font-bold transition-all ${signDisabled ? 'bg-[#EADFD6] text-[#6E5E70] cursor-not-allowed' : 'bg-[#6B3470] hover:bg-[#5A2A5E] text-white shadow-sm'} disabled:opacity-90`}
    >
      <Stamp size={14} /> {submitting ? 'Saving...' : signLabel}
    </button>
  );
  const rejectBtn = (extra: string) => canReject && (
    <button onClick={() => setShowReject(true)} disabled={submitting} className={`${extra} flex items-center justify-center gap-1.5 px-3 rounded-xl border border-rose-300 text-rose-600 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50`}>
      <Ban size={14} /> Reject
    </button>
  );
  const openEditBtn = onOpenEdit && canEditDirectLoading && !locked && (
    <button onClick={() => onOpenEdit(rec)} className="px-2.5 py-1 rounded-lg border border-current/30 bg-white text-[11px] font-bold hover:opacity-80 flex items-center gap-1"><Pencil size={11} /> Open Edit</button>
  );

  return createPortal(
    <div id="far-overseas-print-area" style={{ fontFamily: FAR_FONT_FAMILY }} className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[60] flex justify-center items-center p-0 sm:p-4 md:p-6 print:static print:bg-white print:p-0 print:block">
      {/* Ukuran kertas cetak A5 -- <style> di dalam tree portal ini, HANYA saat modal terbuka. */}
      <style>{`@media print { @page { size: A5; margin: 8mm; } }`}</style>
      <div className="bg-[#FBF3EC] w-full max-w-4xl h-full sm:h-[94vh] sm:max-h-[94vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden print:shadow-none print:w-full print:m-0 print:rounded-none print:h-auto print:max-h-none print:overflow-visible print:block print:bg-white">

        <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-3 border-b border-[#EADFD6] bg-white shrink-0 print:hidden">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Memo no</p>
            <h2 className="text-base font-extrabold text-[#2A1A2C] truncate">{rec.memo_no || rec.memo_title || 'Untitled memo'}</h2>
            <p className="text-[11px] text-[#6E5E70] truncate">{rec.memo_no && rec.memo_title ? `${rec.memo_title} · ` : ''}Uploaded {formatDateShort(rec.created_at)} · <span className="font-semibold text-[#2A1A2C]">{statusLabel}</span></p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(m => !m)} aria-label="More actions" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#2A1A2C] hover:bg-[#F5EDF3]">
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-10 z-10 w-48 bg-white border border-[#EADFD6] rounded-xl shadow-lg py-1 text-xs">
                  <button onClick={() => { setShowMenu(false); window.print(); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[#2A1A2C] hover:bg-[#F5EDF3]"><Printer size={13} /> Print memo</button>
                  {phase2 && (
                    <button onClick={handleUndo} disabled={!canUndo} title={canUndo ? undefined : 'Only the person who signed last can undo (not after Finance received it)'}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[#2A1A2C] hover:bg-[#F5EDF3] disabled:opacity-40 disabled:hover:bg-transparent">
                      <Undo2 size={13} /> Undo last sign
                    </button>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowDocs(true)} className="h-9 flex items-center gap-1.5 px-3 rounded-xl border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
              <FolderOpen size={14} /> <span className="hidden sm:inline">Documents</span>{docCount > 0 ? ` · ${docCount}` : ''}
            </button>
            {phase2 && (
              <button onClick={() => setShowLog(s => !s)} className={`h-9 flex items-center gap-1.5 px-3 rounded-xl border text-xs font-semibold hover:bg-[#F5EDF3] ${showLog ? 'border-[#6B3470] text-[#6B3470]' : 'border-[#EADFD6] text-[#2A1A2C]'}`}>
                <History size={14} /> <span className="hidden sm:inline">Audit trail</span>{log ? ` · ${log.length}` : ''}
              </button>
            )}
            <button onClick={() => setShowCost(true)} className="h-9 flex items-center gap-1.5 px-3 rounded-xl border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
              <ClipboardList size={14} /> <span className="hidden sm:inline">Cost Validation</span>
            </button>
            <div className="hidden sm:flex items-center gap-1.5">
              {rejectBtn('h-9')}
              {signBtn('h-9')}
            </div>
            <button onClick={onClose} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-[#F5EDF3] text-[#6E5E70]">
              <X size={18} />
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mx-4 sm:mx-6 mt-3 p-3 rounded-xl border text-sm font-medium shrink-0 print:hidden ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar print:overflow-visible">
          <div className="p-4 md:p-6 space-y-3 print:p-0 print:space-y-0">

            {showLog && phase2 && (
              <div className="bg-white rounded-2xl border border-[#EADFD6] p-4 print:hidden">
                <p className="text-sm font-bold text-[#2A1A2C] mb-2">Audit trail <span className="text-xs font-normal text-[#6E5E70]">(newest first)</span></p>
                {log == null ? <p className="text-xs text-[#6E5E70] italic">Could not load the audit trail.</p> : log.length === 0 ? <p className="text-xs text-[#6E5E70] italic">No entries yet.</p> : (
                  <ol className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {log.map(e => (
                      <li key={e.id} className="text-xs flex gap-2">
                        <span className="text-[#6E5E70] shrink-0 w-36">{formatDateTimeID(e.created_at)}</span>
                        <span className="min-w-0"><span className="font-bold text-[#2A1A2C]">{LOG_ACTION_LABEL[e.action] || e.action}</span> {describeLog(e)} <span className="text-[#6E5E70]">· {e.user_email || 'system / AI'}</span></span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {rec.approval_status === 'REJECTED' && (
              <Banner tone="red" icon={<Ban size={14} />} action={openEditBtn}>
                <span className="font-bold">Rejected{rec.rejected_step ? ` by ${STEP_LABEL[rec.rejected_step as ApprovalStep] || rec.rejected_step}` : ''}</span>{rec.notes ? <> — {rec.notes}</> : null}
                {phase2 && <span className="block mt-0.5">Back to Prepared By — revise and sign again.</span>}
              </Banner>
            )}
            {fin === 'PAID' && (
              <Banner tone="green" icon={<Wallet size={14} />}>
                <span className="font-bold">Paid · {formatDateShort(rec.paid_at)}</span>{rec.paid_reference ? ` · Ref ${rec.paid_reference}` : ''} — the payment proof is in Documents.
              </Banner>
            )}
            {fin === 'RECEIVED' && (
              <Banner tone="grey" icon={<CheckCircle2 size={14} />}>
                <span className="font-bold text-[#2A1A2C]">Received by Finance</span> · {rec.finance_received_by || '—'} · {formatDateShort(rec.finance_received_at)} · unpaid
              </Banner>
            )}
            {rec.approval_status === 'APPROVED' && fin !== 'PAID' && fin !== 'RECEIVED' && (
              <Banner tone="green" icon={<CheckCircle2 size={14} />}>
                <span className="font-bold">Approved</span> — all four signatures are complete{phase2 ? '; sent to Finance.' : '.'}
              </Banner>
            )}
            {signStep === 'TIER1' && prepBlocked && (
              <Banner
                tone="amber"
                icon={<AlertTriangle size={14} />}
                action={<>
                  {openEditBtn}
                  <button onClick={() => setShowCost(true)} className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-[11px] font-bold text-amber-900 hover:bg-amber-100">Open Cost Validation</button>
                </>}
              >
                <span className="font-bold">Cannot sign yet.</span>
                <ul className="list-disc list-inside mt-0.5">{blockerList.map(b => <li key={b}>{b}</li>)}</ul>
              </Banner>
            )}
            {phase2 && rec.fx_locked_at && fx != null && (
              <Banner tone="grey" icon={<Lock size={14} />}>
                FX rate locked since Prepared By signed: <span className="font-bold text-[#2A1A2C]">1 {rec.total_amount_currency} = IDR {fx.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</span>. It opens again after an undo or a reject.
              </Banner>
            )}
            {rec.on_hold === true && rec.approval_status !== 'REJECTED' && fin !== 'PAID' && (
              <Banner tone="grey" icon={<Clock size={14} />}>
                <span className="font-bold text-[#2A1A2C]">On hold</span> — goods not received yet, so payment waits.
              </Banner>
            )}
            {wait && wait.step !== 'TIER1' && (
              <Banner
                tone={wait.overLimit ? 'red' : 'grey'}
                icon={<Clock size={14} />}
                action={phase2 && wait.overLimit ? <button onClick={handleRemind} className="px-2.5 py-1 rounded-lg border border-rose-300 bg-white text-[11px] font-bold text-rose-700 hover:bg-rose-100 flex items-center gap-1"><Bell size={11} /> Send reminder</button> : undefined}
              >
                Waiting for <span className="font-bold">{STEP_LABEL[wait.step]}</span>
                {wait.days != null && <> · {wait.days} working day{wait.days === 1 ? '' : 's'}</>}
                {wait.limit != null && <> · limit {wait.limit}</>}
                {wait.overLimit && <span className="font-bold"> — past the approval limit</span>}
              </Banner>
            )}
            {signStep && canEditDirectLoading && !isEligibleForStep(signStep) && (
              <Banner tone="grey" icon={<Info size={14} />}>
                {signStep === 'PIC'
                  ? (rec.pic_user_id ? 'Only the PIC Shipment assigned to this memo can sign this step.' : 'No PIC Shipment is assigned yet — set it in Edit memo (Prepared By section).')
                  : `This step needs the "${STEP_LABEL[signStep]}" approval role${signStep === 'TIER2' || signStep === 'TIER3' ? ' for this PT' : ''}.`}
              </Banner>
            )}

            <div className="bg-white rounded-2xl border border-[#EADFD6] px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
              {STEP_ORDER.map((step, i) => {
                const info = stepInfo(step);
                const done = i < doneCount;
                const current = signStep === step;
                return (
                  <div key={step} className="flex items-start gap-2.5 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2 ${done ? 'bg-emerald-600 border-emerald-600 text-white' : current ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-[#EADFD6] text-[#6E5E70] bg-white'}`}>
                      {done ? <CheckCircle2 size={14} /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#2A1A2C]">{i < 2 ? (i === 0 ? 'Prepared By' : 'PIC Shipment') : 'Checked By'}</p>
                      <p className={`text-[11px] truncate ${current ? 'text-amber-700' : 'text-[#6E5E70]'}`}>{info.name} · {info.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`flex items-start justify-between gap-3 rounded-xl px-4 py-2.5 text-xs print:hidden ${costStatus === 'MATCH' ? 'bg-emerald-50 text-emerald-800' : costStatus === 'OVERCHARGE' ? 'bg-rose-50 text-rose-800' : costStatus ? 'bg-amber-50 text-amber-900' : 'bg-white border border-[#EADFD6] text-[#6E5E70]'}`}>
              <p className="min-w-0">
                <span className="font-bold">AI check: {costMeta?.label || (costExists ? (costStatus || 'No status') : 'Not available')}.</span>{' '}
                {costCatatan || (costStatus === 'MATCH' ? 'Invoice matches the vendor rate.' : '')}
              </p>
              <span className="shrink-0 text-[10px] font-semibold opacity-70">Not printed</span>
            </div>

            <div className="bg-white rounded-2xl p-3 md:p-6 shadow-sm print:shadow-none print:p-0 print:rounded-none overflow-x-auto">
              <div className="min-w-[560px] print:min-w-0">
                <FarOverseasMemoPaper rec={rec} signer={signer} />
                <MemoPaymentLine rec={rec} />
              </div>
            </div>

            {poList.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#EADFD6] overflow-hidden print:hidden">
                <button onClick={() => setShowPoDetail(s => !s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5EDF3]/50 transition-colors">
                  <span className="text-sm font-bold text-[#2A1A2C]">PO details ({poList.length})</span>
                  {showPoDetail ? <ChevronUp size={16} className="text-[#6E5E70]" /> : <ChevronDown size={16} className="text-[#6E5E70]" />}
                </button>
                {showPoDetail && (
                  <div className="border-t border-[#EADFD6] divide-y divide-[#EADFD6]">
                    {poList.map((po, i) => (
                      <div key={i} className="px-4 py-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                        <div className="col-span-2 md:col-span-1"><p className="text-[#6E5E70]">PO</p><p className="font-semibold text-[#2A1A2C] break-all">{po.po_no_raw || '—'}</p></div>
                        <div><p className="text-[#6E5E70]">PT</p><p className="font-semibold text-[#2A1A2C]">{po.company_code || '—'}</p></div>
                        <div><p className="text-[#6E5E70]">Vendor</p><p className="font-semibold text-[#2A1A2C]">{po.vendor_name || '—'}</p></div>
                        <div><p className="text-[#6E5E70]">Value</p><p className="font-semibold text-[#2A1A2C]">{formatMoney(po.total_value, po.currency)}</p></div>
                        <div><p className="text-[#6E5E70]">KG</p><p className="font-semibold text-[#2A1A2C]">{po.weight_kg != null ? `${po.weight_kg} KG` : '—'}</p></div>
                        <div><p className="text-[#6E5E70]">Vessel</p><p className="font-semibold text-[#2A1A2C]">{po.vessel_raw || '—'}</p></div>
                        {po.item_summary && <div className="col-span-2 md:col-span-6"><p className="text-[#6E5E70]">Items</p><p className="text-[#2A1A2C]">{po.item_summary}</p></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bar bawah HP: Reject + Sign (tombol >= 44px, spek tampilan HP). */}
        {(canReject || signLabel) && (
          <div className="sm:hidden shrink-0 border-t border-[#EADFD6] bg-white px-3 py-2 flex gap-2 print:hidden">
            {rejectBtn('min-h-[44px] flex-1')}
            {signBtn('min-h-[44px] flex-[2]')}
          </div>
        )}
      </div>

      {showReject && (
        <RejectModal submitting={submitting} onClose={() => setShowReject(false)} onConfirm={handleReject} />
      )}
      {showCost && (
        <FarOverseasAirCostValidationModal
          farOverseasId={rec.id}
          approvalStatus={rec.approval_status}
          onClose={async () => {
            setShowCost(false);
            setCostReloadKey(k => k + 1);
            setLogReloadKey(k => k + 1);
            // KG per PO / konfirmasi AI bisa berubah di Cost Validation -> ambil ulang memo.
            await reloadRec();
          }}
          onChanged={onChanged}
        />
      )}
      {showDocs && <FarOverseasAirDocumentsModal record={rec} onClose={() => setShowDocs(false)} />}
    </div>,
    document.body
  );
}
