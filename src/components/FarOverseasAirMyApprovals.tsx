import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Stamp, FolderOpen, ClipboardList, Clock, AlertTriangle, CheckCircle2, ArrowRight, Info } from 'lucide-react';
import { LoadingState } from './LoadingState';
import {
  STEP_LABEL, getWaitInfo, deriveMemoWarnings, fetchCostInfoMap, totalInIdr, formatIdr, formatMoney, formatDateShort,
  getRouteDisplay, getDueInfo, COST_STATUS_META, getApprovalEntries, getMemoDueValue, canSignStep, memoRefLabel,
  type ApprovalStep, type CostInfo, type StepSignerMap,
} from '../utils/FarOverseasAirHelpers';
import { getDokumenList } from './FarOverseasAirDocumentsModal';

// Tab "My Approvals" (redesain tahap 1, 2026-09-28) -- khusus user yang punya jabatan approval
// FAR Overseas (`approvalTiersByPage.direct_loading`, diatur di Kelola Role & Akses). Query-nya
// MENGIKUTI PERSIS aturan eligibility modal Memo (FarOverseasAirDetailModal.tsx):
// - Prepared By/SPV/Director: status menunggu tahap itu (`nextStepForStatus`).
// - PIC Shipment: status TIER1_DONE DAN `pic_user_id` = user login (assignment per memo).
// "Signed by you" dari entri `approvals` (jsonb) dgn `user_email` = email login (ditulis RPC
// approve). Reject belum mencatat siapa yang menolak -> "rejected by you" tahap 2.

const STATUS_WAITING_FOR: Record<ApprovalStep, string> = { TIER1: 'PENDING', PIC: 'TIER1_DONE', TIER2: 'PIC_DONE', TIER3: 'TIER2_DONE' };
const STATUS_BEFORE: Partial<Record<ApprovalStep, string>> = { PIC: 'PENDING', TIER2: 'TIER1_DONE', TIER3: 'PIC_DONE' };

type Props = {
  // Semua tahap yang bisa ditandatangani user (jabatan global + penandatangan per PT, tahap 2).
  mySteps: ApprovalStep[];
  myTier: ApprovalStep | null;
  signers: StepSignerMap | null;
  phase2: boolean;
  userId: string | null;
  userEmail: string | null;
  greetingName: string;
  canSign: boolean;
  refreshKey: number;
  onOpenMemo: (id: string) => void;
  onOpenDocs: (row: any) => void;
  onOpenCost: (row: any) => void;
  onOpenMemosList: () => void;
};

const SELECT_COLS_BASE = 'id, created_at, memo_title, ship_via, vendor, no_invoice, route_note, dominant_company_code, total_amount, total_amount_currency, total_amount_idr, expected_payment_date, approval_status, approvals, pic_user_id, pic_name, notes, po_list, po_ori, dokumen_urls';

export default function FarOverseasAirMyApprovals({ mySteps, myTier, signers, phase2, userId, userEmail, greetingName, canSign, refreshKey, onOpenMemo, onOpenDocs, onOpenCost, onOpenMemosList }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<any[]>([]);
  const [comingNext, setComingNext] = useState<any[]>([]);
  const [signed, setSigned] = useState<any[]>([]);
  const [signedError, setSignedError] = useState(false);
  const [costMap, setCostMap] = useState<Record<string, CostInfo>>({});

  // Kolom tahap 2 (memo_no, due_date, dst) ikut di-select HANYA kalau sql/027 sudah jalan.
  const SELECT_COLS = phase2 ? SELECT_COLS_BASE + ', memo_no, due_date, on_hold, payment_type, rejected_step, finance_received_at, paid_at, ai_duplicate_of, ai_findings_confirmed, kurs_used' : SELECT_COLS_BASE;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const uid = userId || '00000000-0000-0000-0000-000000000000';
    const stepQuery = (step: ApprovalStep, status: string[]) => {
      let q = supabase.from('rekapan_far_overseas_air').select(SELECT_COLS).in('approval_status', status);
      if (step === 'PIC') q = q.eq('pic_user_id', uid);
      return q.order('created_at', { ascending: true }).limit(300);
    };
    const waitingStatuses = (step: ApprovalStep) => (step === 'TIER1' && phase2 ? ['PENDING', 'REJECTED'] : [STATUS_WAITING_FOR[step]]);
    const [wResults, nResults, sRes] = await Promise.all([
      Promise.all(mySteps.map(step => stepQuery(step, waitingStatuses(step)).then(r => ({ step, r })))),
      Promise.all(mySteps.filter(step => STATUS_BEFORE[step]).map(step => stepQuery(step, [STATUS_BEFORE[step]!]).then(r => ({ step, r })))),
      userEmail
        ? supabase.from('rekapan_far_overseas_air').select(SELECT_COLS).contains('approvals', JSON.stringify([{ user_email: userEmail }])).order('created_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    const firstErr = wResults.find(x => x.r.error)?.r.error;
    if (firstErr) { setError(firstErr.message); setLoading(false); return; }
    // Gabung per tahap + saring penandatangan per PT (TIER2/TIER3) -- sama aturan fn_far_overseas_can_sign.
    const collect = (results: { step: ApprovalStep; r: any }[]) => {
      const map = new Map<string, any>();
      results.forEach(({ step, r }) => (r.data || []).forEach((row: any) => {
        if (canSignStep(row, step, userId, myTier, signers)) map.set(row.id, row);
      }));
      return Array.from(map.values());
    };
    const w = collect(wResults);
    const now = new Date();
    // Urut dari yang PALING LAMA menunggu (spek) -- hari kerja desc.
    w.sort((a, b) => (getWaitInfo(b, now)?.days ?? -1) - (getWaitInfo(a, now)?.days ?? -1));
    setWaiting(w);
    setComingNext(collect(nResults));
    setSignedError(!!sRes.error);
    if (sRes.error) console.error('[MyApprovals] signed-by-you query failed:', sRes.error);
    setSigned((sRes.data || []) as any[]);
    setCostMap(await fetchCostInfoMap(w.map(r => r.id)));
    setLoading(false);
  }, [mySteps.join(','), myTier, signers, phase2, userId, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, refreshKey]);

  const roleLabel = mySteps.map(st => STEP_LABEL[st]).join(' & ');
  const hasBefore = mySteps.some(st => !!STATUS_BEFORE[st]);
  if (loading) return <LoadingState />;
  if (error) return <div className="p-6 text-sm text-rose-700 bg-rose-50 rounded-2xl">Failed to load approvals: {error}</div>;

  const now = new Date();
  const waitingIdr = waiting.reduce((s, r) => s + (totalInIdr(r) || 0), 0);
  const waitingNoIdr = waiting.filter(r => totalInIdr(r) == null).length;
  const pastLimit = waiting.filter(r => getWaitInfo(r, now)?.overLimit).length;
  const byPt: Record<string, number> = {};
  waiting.forEach(r => { const k = r.dominant_company_code || 'Not set'; byPt[k] = (byPt[k] || 0) + 1; });

  const signedAt = (r: any) => {
    const e = getApprovalEntries(r).filter(x => x.user_email === userEmail).sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)))[0];
    return e?.approved_at || null;
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#2A1A2C]">My Approvals{greetingName ? ` · ${greetingName}` : ''}</h2>
          <p className="text-xs text-[#6E5E70] mt-0.5">
            Your approval role{mySteps.length > 1 ? 's' : ''}: <span className="font-bold text-[#2A1A2C]">{roleLabel}</span>
            {mySteps.includes('PIC') ? ' — PIC Shipment only for memos assigned to you.' : ''}{mySteps.some(st => st === 'TIER2' || st === 'TIER3') && signers && Object.keys(signers).length > 0 ? ' — Checked By steps follow the per-PT signer list.' : ''}
          </p>
        </div>
        <button onClick={onOpenMemosList} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EADFD6] bg-white text-xs font-semibold text-[#6B3470] hover:bg-[#F5EDF3]">
          Open in Memos list <ArrowRight size={13} />
        </button>
      </div>

      {!canSign && (
        <div className="mb-3 flex items-center gap-2 text-xs bg-amber-50 text-amber-900 rounded-xl px-3 py-2">
          <Info size={13} /> You have the {roleLabel} role but no edit access to FAR Overseas, so you cannot sign. Ask an admin.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Waiting for you</p>
          <p className="text-2xl font-extrabold text-[#2A1A2C] mt-1">{waiting.length}</p>
          <p className="text-xs text-[#6E5E70]">{formatIdr(waitingIdr)}{waitingNoIdr > 0 ? ` · ${waitingNoIdr} without IDR` : ''}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${pastLimit > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-[#EADFD6]'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${pastLimit > 0 ? 'text-rose-700' : 'text-[#6E5E70]'}`}>Past approval limit</p>
          <p className={`text-2xl font-extrabold mt-1 ${pastLimit > 0 ? 'text-rose-700' : 'text-[#2A1A2C]'}`}>{pastLimit}</p>
          <p className="text-xs text-[#6E5E70]">{mySteps.every(st => st === 'TIER1') ? 'No limit for Prepared By' : 'Working days, Mon–Fri'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Coming to you next</p>
          <p className="text-2xl font-extrabold text-[#2A1A2C] mt-1">{hasBefore ? comingNext.length : '—'}</p>
          <p className="text-xs text-[#6E5E70]">{hasBefore ? 'One step before yours' : 'You are the first step'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Signed by you</p>
          <p className="text-2xl font-extrabold text-[#2A1A2C] mt-1">{signedError ? '—' : signed.length}{!signedError && signed.length === 20 ? '+' : ''}</p>
          <p className="text-xs text-[#6E5E70]">{signedError ? 'Could not load' : 'Most recent 20'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        <div className="bg-white rounded-2xl border border-[#EADFD6] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EADFD6]">
            <h3 className="text-sm font-bold text-[#2A1A2C]">Waiting for your approval</h3>
            <p className="text-[11px] text-[#6E5E70]">Longest waiting first.</p>
          </div>
          {waiting.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 size={26} className="text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#2A1A2C]">Nothing is waiting for you.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#EADFD6]">
              {waiting.map(r => {
                const wait = getWaitInfo(r, now);
                const warnings = deriveMemoWarnings(r, costMap[r.id], now).filter(w => !w.text.startsWith('Waiting for'));
                const route = getRouteDisplay(r.route_note);
                const cost = costMap[r.id];
                const costMeta = cost?.status ? COST_STATUS_META[cost.status] : null;
                const due = getDueInfo(getMemoDueValue(r), 3, now);
                const docCount = getDokumenList(r).length;
                return (
                  <div key={r.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-[#2A1A2C]">{memoRefLabel(r)}</span>{r.approval_status === 'REJECTED' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Rejected — sign again</span>}
                        {r.dominant_company_code && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3B1B3D] text-white">{r.dominant_company_code}</span>}
                        {costMeta && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${costMeta.badgeClass}`}>{costMeta.label}</span>}
                      </div>
                      <p className="text-xs mt-1"><span className="text-[10px] font-bold uppercase tracking-wide text-[#6E5E70] mr-1">Payable to</span><span className="font-bold text-[#2A1A2C]">{r.ship_via || '—'}</span></p>
                      <p className="text-xs text-[#6E5E70] truncate">{route ? `${route.origin} → ${route.destination} ${route.mode}` : 'Route not set'} · {r.vendor || 'No vendor'}</p>
                      {warnings[0] && (
                        <span className={`inline-flex mt-1.5 text-[11px] px-2 py-0.5 rounded-full ${warnings[0].level === 'red' ? 'bg-rose-50 text-rose-700' : warnings[0].level === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-[#F5EDF3] text-[#6E5E70]'}`}>
                          {warnings[0].text}{warnings.length > 1 ? ` · +${warnings.length - 1} more` : ''}
                        </span>
                      )}
                    </div>
                    <div className="md:text-right shrink-0">
                      <p className="text-sm font-extrabold text-[#2A1A2C]">{formatMoney(r.total_amount, r.total_amount_currency)}</p>
                      <p className="text-[11px] text-[#6E5E70]">Due {due ? formatDateShort(due.date) : '—'}</p>
                      {wait && (
                        <p className={`text-[11px] font-semibold flex md:justify-end items-center gap-1 ${wait.overLimit ? 'text-rose-700' : 'text-[#6E5E70]'}`}>
                          <Clock size={11} /> {wait.days != null ? `Waiting ${wait.days}${wait.limit != null ? ` of ${wait.limit}` : ''} working day${wait.days === 1 ? '' : 's'}` : 'Waiting time unknown'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => onOpenMemo(r.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-bold">
                        <Stamp size={13} /> Review &amp; sign
                      </button>
                      <button onClick={() => onOpenDocs(r)} className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
                        <FolderOpen size={13} /> Docs · {docCount}
                      </button>
                      <button onClick={() => onOpenCost(r)} className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#EADFD6] text-xs font-semibold text-[#2A1A2C] hover:bg-[#F5EDF3]">
                        <ClipboardList size={13} /> Cost
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
            <h4 className="text-xs font-bold text-[#2A1A2C] mb-2">Waiting by PT</h4>
            {Object.keys(byPt).length === 0 ? <p className="text-xs text-[#6E5E70] italic">—</p> : (
              <div className="space-y-1.5">
                {Object.entries(byPt).sort((a, b) => b[1] - a[1]).map(([pt, n]) => (
                  <div key={pt} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#2A1A2C]">{pt}</span><span className="text-[#6E5E70]">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
            <h4 className="text-xs font-bold text-[#2A1A2C] mb-2">Coming to you next</h4>
            {!hasBefore ? <p className="text-xs text-[#6E5E70] italic">You are the first step.</p> : comingNext.length === 0 ? <p className="text-xs text-[#6E5E70] italic">Nothing on the way.</p> : (
              <div className="space-y-2">
                {comingNext.slice(0, 6).map(r => (
                  <button key={r.id} onClick={() => onOpenMemo(r.id)} className="w-full text-left text-xs hover:bg-[#F5EDF3] rounded-lg px-1.5 py-1">
                    <p className="font-semibold text-[#2A1A2C] truncate">{memoRefLabel(r)} · {r.ship_via || '—'}</p>
                    <p className="text-[#6E5E70]">{formatMoney(r.total_amount, r.total_amount_currency)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-[#EADFD6] p-4">
            <h4 className="text-xs font-bold text-[#2A1A2C] mb-2">Recently signed by you</h4>
            {signedError ? (
              <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle size={12} /> Could not load.</p>
            ) : signed.length === 0 ? <p className="text-xs text-[#6E5E70] italic">—</p> : (
              <div className="space-y-2">
                {signed.slice(0, 6).map(r => (
                  <button key={r.id} onClick={() => onOpenMemo(r.id)} className="w-full text-left text-xs hover:bg-[#F5EDF3] rounded-lg px-1.5 py-1">
                    <p className="font-semibold text-[#2A1A2C] truncate">{memoRefLabel(r)} · {r.ship_via || '—'}</p>
                    <p className="text-[#6E5E70]">Signed {formatDateShort(signedAt(r))}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
