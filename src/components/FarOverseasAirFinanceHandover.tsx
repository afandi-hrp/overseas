import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { FolderOpen, ClipboardList, FileText, CheckCircle2, X, Upload, Inbox, Wallet } from 'lucide-react';
import { LoadingState } from './LoadingState';
import {
  formatMoney, formatIdr, formatDateShort, totalInIdr, implicitFxRate, getFinanceStage, getMemoDueValue, getDueInfo,
  getApprovalEntries, findApprovalEntry, localIsoDate, PAYMENT_PROOF_BUCKET, FAR_FONT_FAMILY,
  type FinanceStage,
} from '../utils/FarOverseasAirHelpers';

// Tab "Finance Handover" (redesain TAHAP 2, 2026-09-28) -- memo APPROVED diserahkan ke Finance.
// Accept (nama penerima + tanggal) & Mark paid (tanggal transfer + bukti bayar WAJIB, referensi
// opsional) lewat RPC `fn_far_overseas_finance_accept`/`fn_far_overseas_mark_paid` (sql/027,
// SECURITY DEFINER, guard `has_edit_access('far_overseas_finance')`). Bukti bayar diupload ke
// Supabase Storage bucket `far-overseas-payment-proofs` (sql/027 bagian G) lalu otomatis tampil di
// Docs memo. Finance hanya LIHAT memo/dokumen/Cost Validation (view only).

type Filter = 'WAITING_FINANCE' | 'RECEIVED' | 'PAID' | 'ALL';
const SELECT_COLS = 'id, memo_no, created_at, memo_title, ship_via, vendor, no_invoice, dominant_company_code, total_amount, total_amount_currency, total_amount_idr, kurs_used, expected_payment_date, due_date, approval_status, approvals, finance_received_by, finance_received_at, paid_at, paid_reference, payment_proof_path, dokumen_urls, po_list, po_ori';

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Bottom sheet di HP (items-end), dialog biasa di desktop.
  return createPortal(
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[85] flex items-end sm:items-center justify-center sm:p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#2A1A2C]">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-[#F5EDF3] text-[#6E5E70]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

const inputCls = 'w-full border border-[#EADFD6] rounded-xl px-3 min-h-[44px] text-sm text-[#2A1A2C] bg-white focus:outline-none focus:ring-2 focus:ring-[#6B3470]/25';

function Stepper({ rec }: { rec: any }) {
  const tier3 = findApprovalEntry(getApprovalEntries(rec), 'TIER3');
  const steps = [
    { label: 'Sent', date: tier3?.approved_at || null, done: true },
    { label: 'Received', date: rec.finance_received_at, done: !!rec.finance_received_at },
    { label: 'Paid', date: rec.paid_at, done: !!rec.paid_at },
  ];
  return (
    <div className="flex items-start gap-1">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className={`mt-2 h-0.5 w-5 ${s.done ? 'bg-emerald-500' : 'bg-[#EADFD6]'}`} />}
          <div className="text-center min-w-[52px]">
            <span className={`mx-auto w-4 h-4 rounded-full flex items-center justify-center ${s.done ? 'bg-emerald-500 text-white' : 'border-2 border-[#EADFD6] bg-white'}`}>{s.done && <CheckCircle2 size={10} />}</span>
            <p className="text-[10px] font-bold text-[#2A1A2C] mt-0.5">{s.label}</p>
            <p className="text-[10px] text-[#6E5E70]">{s.date ? formatDateShort(s.date) : '—'}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function FarOverseasAirFinanceHandover({ canAct, defaultReceiverName, refreshKey, onOpenMemo, onOpenDocs, onOpenCost, onChanged }: {
  canAct: boolean;
  defaultReceiverName: string;
  refreshKey: number;
  onOpenMemo: (id: string) => void;
  onOpenDocs: (row: any) => void;
  onOpenCost: (row: any) => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>('WAITING_FINANCE');
  const [acceptRow, setAcceptRow] = useState<any | null>(null);
  const [paidRow, setPaidRow] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.from('rekapan_far_overseas_air').select(SELECT_COLS).eq('approval_status', 'APPROVED').order('created_at', { ascending: false }).limit(1000);
    if (e) setError(e.message); else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  if (loading) return <LoadingState />;
  if (error) return <div className="p-4 text-sm text-rose-700 bg-rose-50 rounded-2xl">Failed to load Finance Handover: {error}</div>;

  const stageOf = (r: any): FinanceStage => getFinanceStage(r);
  const groups: Record<Filter, any[]> = {
    WAITING_FINANCE: rows.filter(r => stageOf(r) === 'WAITING_FINANCE'),
    RECEIVED: rows.filter(r => stageOf(r) === 'RECEIVED'),
    PAID: rows.filter(r => stageOf(r) === 'PAID'),
    ALL: rows,
  };
  const sumIdr = (list: any[]) => list.reduce((s, r) => s + (totalInIdr(r) || 0), 0);
  const overdueReceived = groups.RECEIVED.filter(r => getDueInfo(getMemoDueValue(r), 0)?.level === 'overdue').length;
  const boxes: { key: Filter; label: string; sub?: string; tone: string }[] = [
    { key: 'WAITING_FINANCE', label: 'Waiting for Finance', tone: 'text-[#2A1A2C]' },
    { key: 'RECEIVED', label: 'Accepted · unpaid', sub: overdueReceived > 0 ? `${overdueReceived} overdue` : undefined, tone: overdueReceived > 0 ? 'text-rose-700' : 'text-[#2A1A2C]' },
    { key: 'PAID', label: 'Paid', tone: 'text-emerald-700' },
    { key: 'ALL', label: 'All approved', tone: 'text-[#2A1A2C]' },
  ];
  const list = groups[filter];

  const actionFor = (r: any) => {
    const st = stageOf(r);
    if (!canAct || st === 'PAID') return null;
    if (st === 'WAITING_FINANCE') return <button onClick={() => setAcceptRow(r)} className="min-h-[36px] px-3 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-bold flex items-center gap-1.5"><Inbox size={13} /> Accept</button>;
    return <button onClick={() => setPaidRow(r)} className="min-h-[36px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"><Wallet size={13} /> Mark paid</button>;
  };
  const viewButtons = (r: any) => (
    <>
      <button onClick={() => onOpenMemo(r.id)} title="Memo" aria-label="Memo" className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F5EDF3] text-[#6B3470]"><FileText size={14} /></button>
      <button onClick={() => onOpenDocs(r)} title="Docs" aria-label="Docs" className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#6B3470]"><FolderOpen size={14} /></button>
      <button onClick={() => onOpenCost(r)} title="Cost Validation" aria-label="Cost Validation" className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EADFD6] text-[#6B3470]"><ClipboardList size={14} /></button>
    </>
  );
  const dueCell = (r: any) => {
    const d = getDueInfo(getMemoDueValue(r), 3);
    const overdue = d?.level === 'overdue' && stageOf(r) !== 'PAID';
    return <span className={overdue ? 'font-bold text-rose-700' : 'text-[#2A1A2C]'}>{d ? formatDateShort(d.date) : '—'}{overdue ? ' · overdue' : ''}</span>;
  };

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-3">
      {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2">{toast}</div>}
      {!canAct && <div className="rounded-xl bg-[#F5EDF3] text-[#6B3470] text-xs px-3 py-2">View only — Accept and Mark paid need the "Finance Handover (FAR Overseas)" edit access.</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {boxes.map(b => (
          <button key={b.key} onClick={() => setFilter(b.key)} className={`text-left rounded-2xl border p-4 transition-colors ${filter === b.key ? 'bg-white border-[#6B3470] shadow-sm' : 'bg-white/70 border-[#EADFD6] hover:bg-white'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">{b.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${b.tone}`}>{groups[b.key].length}</p>
            <p className="text-xs text-[#6E5E70]">{formatIdr(sumIdr(groups[b.key]))}{b.sub ? <span className="text-rose-700 font-bold"> · {b.sub}</span> : null}</p>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EADFD6] p-8 text-center text-sm text-[#6E5E70]">Nothing here.</div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-[#EADFD6] overflow-x-auto">
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[#6E5E70] bg-[#FBF3EC]">
                  {['Memo', 'PT', 'Payable to (ship via)', 'Total', 'Due date', 'Status', ''].map(h => <th key={h} className={`px-3 py-2.5 font-bold ${h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EADFD6]">
                {list.map(r => {
                  const fx = implicitFxRate(r);
                  const tier3 = findApprovalEntry(getApprovalEntries(r), 'TIER3');
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2.5"><p className="font-bold text-[#2A1A2C]">{r.memo_no || r.memo_title || '—'}</p><p className="text-[10px] text-[#6E5E70]">{r.memo_no ? `${r.memo_title || ''} · ` : ''}Approved {tier3 ? formatDateShort(tier3.approved_at) : '—'}</p></td>
                      <td className="px-3 py-2.5"><span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#3B1B3D] text-white">{r.dominant_company_code || '—'}</span></td>
                      <td className="px-3 py-2.5"><p className="font-bold text-[#2A1A2C] uppercase">{r.ship_via || '—'}</p><p className="text-[10px] text-[#6E5E70]">{r.vendor || '—'}</p></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap"><p className="font-extrabold text-[#2A1A2C]">{formatMoney(r.total_amount, r.total_amount_currency)}</p>{fx != null && <p className="text-[10px] text-[#6E5E70]">≈ {formatIdr(totalInIdr(r))}</p>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{dueCell(r)}</td>
                      <td className="px-3 py-2.5"><Stepper rec={r} />{r.finance_received_by && <p className="text-[10px] text-[#6E5E70] mt-1">Received by {r.finance_received_by}</p>}{r.paid_reference && <p className="text-[10px] text-[#6E5E70]">Ref {r.paid_reference}</p>}</td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5 justify-end">{actionFor(r)}{viewButtons(r)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {list.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-[#EADFD6] p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-extrabold text-[#2A1A2C]">{r.memo_no || r.memo_title || '—'}</p><p className="text-[11px] text-[#6E5E70]">{r.dominant_company_code || '—'} · {r.memo_title || ''}</p></div>
                  <p className="font-extrabold text-[#2A1A2C] text-right whitespace-nowrap">{formatMoney(r.total_amount, r.total_amount_currency)}</p>
                </div>
                <p className="text-xs"><span className="text-[10px] font-bold uppercase text-[#6E5E70] mr-1">Payable to</span><span className="font-bold">{r.ship_via || '—'}</span></p>
                <p className="text-xs text-[#6E5E70]">Due {dueCell(r)}</p>
                <Stepper rec={r} />
                <div className="flex items-center gap-1.5 flex-wrap">{actionFor(r)}{viewButtons(r)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {acceptRow && <AcceptSheet row={acceptRow} defaultName={defaultReceiverName} onClose={() => setAcceptRow(null)} onDone={() => { setAcceptRow(null); flash('Accepted by Finance.'); load(); onChanged(); }} />}
      {paidRow && <PaidSheet row={paidRow} onClose={() => setPaidRow(null)} onDone={() => { setPaidRow(null); flash('Marked as paid. The payment proof is now in Docs.'); load(); onChanged(); }} />}
    </div>
  );
}

function AcceptSheet({ row, defaultName, onClose, onDone }: { row: any; defaultName: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(defaultName);
  const [date, setDate] = useState(localIsoDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('fn_far_overseas_finance_accept', { p_id: row.id, p_receiver_name: name.trim(), p_received_date: date });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  };
  return (
    <Sheet title={`Accept ${row.memo_no || row.memo_title || 'memo'}`} onClose={onClose}>
      <label className="block mb-3"><span className="block text-xs font-semibold text-[#2A1A2C] mb-1">Received by</span><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></label>
      <label className="block mb-3"><span className="block text-xs font-semibold text-[#2A1A2C] mb-1">Date received</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></label>
      {err && <p className="text-xs text-rose-700 mb-2">{err}</p>}
      <button onClick={submit} disabled={busy || !name.trim() || !date} className="w-full min-h-[44px] rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white font-bold text-sm disabled:opacity-50">{busy ? 'Saving...' : 'Accept'}</button>
    </Sheet>
  );
}

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
function PaidSheet({ row, onClose, onDone }: { row: any; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(localIsoDate(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileProblem = file && file.size > MAX_PROOF_BYTES ? 'File is larger than 10 MB.' : file && !/\.(pdf|png|jpe?g)$/i.test(file.name) ? 'Use a PDF, PNG or JPG file.' : null;
  const submit = async () => {
    if (!file || fileProblem) return;
    setBusy(true); setErr(null);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const folder = String(row.memo_no || row.id).replace(/[^a-zA-Z0-9_-]+/g, '-');
    const path = `${folder}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from(PAYMENT_PROOF_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) { setBusy(false); setErr(`Upload failed: ${up.error.message}. (Is the "${PAYMENT_PROOF_BUCKET}" storage bucket set up? See sql/027 section G.)`); return; }
    const { error } = await supabase.rpc('fn_far_overseas_mark_paid', { p_id: row.id, p_paid_date: date, p_proof_path: path, p_reference: reference.trim() || null });
    setBusy(false);
    if (error) {
      // Jangan tinggalkan file yatim kalau RPC menolak (best effort).
      await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([path]);
      setErr(error.message);
      return;
    }
    onDone();
  };
  return (
    <Sheet title={`Mark ${row.memo_no || row.memo_title || 'memo'} as paid`} onClose={onClose}>
      <label className="block mb-3"><span className="block text-xs font-semibold text-[#2A1A2C] mb-1">Transfer date *</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></label>
      <label className="block mb-3"><span className="block text-xs font-semibold text-[#2A1A2C] mb-1">Payment proof * (PDF / JPG / PNG, max 10 MB)</span>
        <span className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-dashed border-[#6B3470]/40 text-xs text-[#6B3470] cursor-pointer">
          <Upload size={14} /> {file ? file.name : 'Choose file'}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </span>
        {fileProblem && <span className="block text-[11px] text-rose-700 mt-1">{fileProblem}</span>}
      </label>
      <label className="block mb-3"><span className="block text-xs font-semibold text-[#2A1A2C] mb-1">Reference / bank (optional)</span><input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. BCA 0012345" className={inputCls} /></label>
      {err && <p className="text-xs text-rose-700 mb-2">{err}</p>}
      <button onClick={submit} disabled={busy || !file || !!fileProblem || !date} className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50">{busy ? 'Saving...' : 'Mark paid'}</button>
    </Sheet>
  );
}
