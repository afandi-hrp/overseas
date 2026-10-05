// Ringkasan Cost Validation di panel Validation Invoice Recap Courier (2026-10-05, keputusan user).
// - HANYA baris biaya Overcharge / Undercharge / Difference (N/A & OK tidak tampil) -- daftar & persen dari
//   `computeLiveCostSummary` (SATU sumber, sama badge kartu/KPI & tabel lengkap).
// - Accept PER BARIS (sql/041): catatan alasan WAJIB, snapshot Expected/Actual; baris yang di-Accept hilang dari
//   daftar. Kalau nilainya berubah sesudahnya (upload susulan -> n8n menghitung ulang), Accept gugur & baris muncul
//   lagi (ditandai "values changed since accepted"). Review per invoice lama (sql/038) tetap dihormati.
// - Auto-update: data dibaca ulang senyap tiap ±30 detik selama tampil, saat `reloadKey` naik (upload susulan
//   selesai / Checklist disimpan / jendela Details ditutup) & saat ganti kartu (remount).
// - Catatan Accept juga ditambahkan ke "Catatan Perubahan Manual" (tabel_cost_validasi.catatan, 1 baris per catatan;
//   Undo menghapus barisnya) -- keputusan user 2026-10-05.
//   Format (revisi 2026-10-05): "<Nama item> · <Status> ✓ <catatan>" (format lama "- <item> (Invoice ..): .." tetap dikenali
//   saat Accept ulang/Undo).
// - Form "Bonded storage estimate" (revisi 2026-10-05) = SALINAN form "Hitung Ulang Estimasi Bonded Storage" Details,
//   logika SATU sumber (src/utils/CourierStorageEstimate.ts) & kolom yang sama -> isian depan/Details saling sinkron.
// - Toolbar hanya tombol Details (`onOpenDetails`: tabel lengkap + Edit di jendela penuh).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LoadingSpinner } from './LoadingState';
import { VW_BTN_PRIMARY, VW_BTN_SECONDARY, VW_INPUT, vwPctBar, vwPctText } from './validationWindowStyles';
import { computeLiveCostSummary, type CostDiffRow } from '../utils/CostValidationHelpers';
import {
  fetchCourierCostReviews, reviewMapOf, saveCourierCostItemReview, deleteCourierCostItemReview,
  type CourierCostReviews, type CourierCostItemReviewRow,
} from '../utils/CourierCostReviewHelpers';
import { fmtRp } from '../utils/SeaAirAuditHelpers';
import { appendNoteLine, removeNoteLinesWhere } from '../utils/NoteLines';
import { courierStorageActualDays, computeCourierStorageExpected, saveCourierStorageEstimate, type StorageEstimate } from '../utils/CourierStorageEstimate';

export const COST_SUMMARY_POLL_MS = 30000;

const STATUS_LABEL: Record<CostDiffRow['status'], string> = { OVERCHARGE: 'Overcharge', UNDERCHARGE: 'Undercharge', DIFFERENCE: 'Difference' };
const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDiff = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${fmtRp(n)}`);
// Baris catatan di "Catatan Perubahan Manual" utk 1 Accept: "<Nama item> · <Status> ✓ <catatan>".
export const costAcceptNoteLine = (r: Pick<CostDiffRow, 'label' | 'status'>, note: string) =>
  `${r.label} · ${STATUS_LABEL[r.status]} ✓ ${String(note).replace(/\s*\n\s*/g, ' ').trim()}`;
// Semua catatan Accept milik 1 baris biaya (format baru + format lama "- <item> (Invoice ...): ...").
const isCostNoteOf = (label: string) => (line: string) => line.startsWith(`${label} · `) && line.includes(' ✓ ') || line.startsWith(`- ${label} (Invoice `);

// Form estimasi Bonded Storage (salinan form Details, logika CourierStorageEstimate). Nilai awal dari kolom tersimpan.
const StorageEstimateBox: React.FC<{ data: any; docType: string; canEdit: boolean; onSaved: (fresh: any | null) => void }> = ({ data, docType, canEdit, onSaved }) => {
  const [weight, setWeight] = useState('');
  const [eta, setEta] = useState('');
  const [rel, setRel] = useState('');
  const [result, setResult] = useState<StorageEstimate | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const savedWeight = String(Number(data.cv_storage_weight_kg) || Number(data.cv_chargeable_kg) || '');
  const savedEta = data.cv_eta_date ? String(data.cv_eta_date).substring(0, 10) : '';
  const savedRel = data.cv_release_date ? String(data.cv_release_date).substring(0, 10) : '';
  useEffect(() => { setWeight(savedWeight); setEta(savedEta); setRel(savedRel); }, [data.id, savedWeight, savedEta, savedRel]);
  useEffect(() => {
    let alive = true;
    if (!eta || !rel) { setResult(null); setErr(''); return; }
    setErr('');
    computeCourierStorageExpected(data, docType, weight, eta, rel)
      .then(r => { if (alive) setResult(r); })
      .catch((e: any) => { if (alive) { console.error('Error calling fn_hitung_storage:', e); setErr(e?.message || String(e)); } });
    return () => { alive = false; };
  }, [eta, rel, weight, data, docType]);
  const save = async () => {
    if (!eta || !rel || !result) return;
    setSaving(true);
    try {
      const fresh = await saveCourierStorageEstimate(data, eta, rel, weight, result);
      setMsg({ text: 'New storage estimate saved.', ok: true });
      onSaved(fresh);
    } catch (e: any) {
      console.error(e);
      setMsg({ text: 'Failed to save estimate: ' + (e?.message || ''), ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };
  const cell = 'bg-[#FBF7F4] border border-[#EADFD6] rounded-lg px-2 py-1.5 text-center font-bold text-[#3B1B3D] text-[12px]';
  return (
    <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2.5" data-storage-estimate>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-[12.5px] font-bold text-[#7A4F00]">Bonded storage estimate</div>
        <div className="text-[11.5px] text-[#6E5E70]">Storage actual <b className="text-[#3B1B3D]">{fmtRp(data.cv_storage_actual)}</b>{data.cv_storage_input_manual && data.cv_storage_days ? ` · saved ${data.cv_storage_days} days` : ''}</div>
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-5 gap-2 items-end text-[11px]">
        <label className="flex flex-col gap-1"><span className="font-semibold text-[#6E5E70]">Storage weight (kg)</span>
          <input aria-label="Storage weight" type="number" step="any" disabled={!canEdit} value={weight} onChange={e => setWeight(e.target.value)} className={`${VW_INPUT} w-full`} /></label>
        <label className="flex flex-col gap-1"><span className="font-semibold text-[#6E5E70]">ETA date</span>
          <input aria-label="ETA date" type="date" disabled={!canEdit} value={eta} onChange={e => setEta(e.target.value)} className={`${VW_INPUT} w-full`} /></label>
        <label className="flex flex-col gap-1"><span className="font-semibold text-[#6E5E70]">Release date</span>
          <input aria-label="Release date" type="date" disabled={!canEdit} value={rel} onChange={e => setRel(e.target.value)} className={`${VW_INPUT} w-full`} /></label>
        <div className="flex flex-col gap-1"><span className="font-semibold text-[#6E5E70]">Actual days</span><div className={cell}>{eta && rel ? courierStorageActualDays(eta, rel) : '-'}</div></div>
        <div className="flex flex-col gap-1"><span className="font-semibold text-[#6E5E70]">Billing days</span><div className={cell}>{eta && rel && result ? result.billing_days : '-'}</div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <div className="text-[12px] text-[#6E5E70]">Expected storage <b className="text-[14px] text-[#3B1B3D] tabular-nums">{result ? fmtRp(result.expected_idr) : 'Rp 0'}</b>
          {err && <span className="block text-[11px] font-bold text-[#A8231A]">{err}</span>}</div>
        {canEdit && <button type="button" className={VW_BTN_PRIMARY} disabled={saving || !eta || !rel || !result} onClick={save}>{saving ? 'Saving…' : 'Save new estimate'}</button>}
      </div>
      {msg && <div className={`mt-1.5 text-[11.5px] font-semibold ${msg.ok ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>{msg.text}</div>}
    </div>
  );
};

export default function CourierCostSummary({ docType, auditId, canEdit, reloadKey = 0, onOpenDetails, onPctChange, onChanged }: {
  docType: string;
  auditId: any;
  canEdit: boolean;
  reloadKey?: number;
  onOpenDetails?: () => void;
  onPctChange?: (pct: number | null) => void;
  onChanged?: () => void;
}) {
  const { profile, user } = useAuth();
  const isCn = String(docType || '').toUpperCase() === 'CN';
  const [data, setData] = useState<any>(null);
  const [reviews, setReviews] = useState<CourierCostReviews>({});
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAccepted, setShowAccepted] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const [{ data: rows }, rv] = await Promise.all([
      supabase.from('tabel_cost_validasi').select('*').eq(isCn ? 'cn_id' : 'pib_id', auditId).order('created_at', { ascending: false }).limit(1),
      fetchCourierCostReviews(docType, auditId),
    ]);
    if (my !== seq.current) return;
    setData(rows && rows.length > 0 ? rows[0] : null);
    setReviews(rv);
    setLoaded(true);
  }, [auditId, docType, isCn]);

  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => {
    const iv = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load(); }, COST_SUMMARY_POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const summary = useMemo(() => computeLiveCostSummary(data, docType, reviewMapOf(reviews)), [data, docType, reviews]);
  const pct = data ? summary.pct : null;
  useEffect(() => { if (loaded) onPctChange?.(pct); }, [loaded, pct, onPctChange]);

  const open = summary.diff_rows.filter(r => r.accepted === null);
  const acceptedRows = summary.diff_rows.filter(r => r.accepted === 'item');
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const saveCostNotes = async (notes: string): Promise<boolean> => {
    if (!data?.id) return false;
    if ((data.catatan || '') === notes) return true;
    const { error } = await supabase.from('tabel_cost_validasi').update({ catatan: notes || null }).eq('id', data.id);
    if (error) { console.error('[CourierCostSummary] catatan gagal disimpan', error); return false; }
    setData((d: any) => (d ? { ...d, catatan: notes || null } : d));
    return true;
  };
  const doAccept = async (row: CostDiffRow) => {
    if (!note.trim()) return;
    setSaving(true);
    const { data: saved, error } = await saveCourierCostItemReview(docType, auditId, row, note, profile?.nama || user?.email || null);
    setSaving(false);
    if (error) { flash('Failed to save: ' + error.message, false); return; }
    setReviews(p => ({ ...p, items: { ...(p.items || {}), [row.key]: saved as CourierCostItemReviewRow } }));
    setAccepting(null); setNote('');
    // Catatan Perubahan Manual: ganti catatan lama utk baris biaya yg sama (Accept ulang), lalu tambah baris baru.
    const notes = appendNoteLine(removeNoteLinesWhere(data?.catatan, isCostNoteOf(row.label)), costAcceptNoteLine(row, note));
    const ok = await saveCostNotes(notes);
    flash(ok ? 'Accepted — the line is counted as OK.' : 'Accepted, but the note could not be added to the manual change notes.', ok);
    onChanged?.();
  };
  const undoAccept = async (key: string) => {
    const rev = reviews.items?.[key];
    if (!rev) return;
    setSaving(true);
    const { error } = await deleteCourierCostItemReview(rev.id);
    setSaving(false);
    if (error) { flash('Failed to undo: ' + error.message, false); return; }
    setReviews(p => { const items = { ...(p.items || {}) }; delete items[key]; return { ...p, items }; });
    const row = summary.diff_rows.find(r => r.key === key);
    if (row) await saveCostNotes(removeNoteLinesWhere(data?.catatan, isCostNoteOf(row.label)));
    onChanged?.();
  };

  if (!loaded) return <div className="py-10 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="flex flex-col gap-3 min-w-0" data-cost-summary>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-bold text-[#3B1B3D]">Cost differences {open.length > 0 && <span className="text-[#A8231A]">({open.length})</span>}</div>
        {onOpenDetails && <button type="button" className={VW_BTN_PRIMARY} onClick={onOpenDetails} disabled={!data}>Details</button>}
      </div>
      {toast && <div className={`px-3 py-2 rounded-xl border text-[12px] font-semibold ${toast.ok ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{toast.msg}</div>}
      {!data ? (
        <div className="rounded-xl border border-[#EADFD6] bg-white px-3 py-2.5 text-[12px] text-[#6E5E70]">No cost validation for this shipment yet.</div>
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-[#BFE3CD] bg-[#EAF6EF] px-3 py-2.5 text-[12px] font-semibold text-[#17663D]">No overcharge or undercharge to review.</div>
      ) : open.map(r => (
        <div key={r.key} data-cost-diff={r.key} className="rounded-r-xl border-l-[3px] border-l-[#A8231A] bg-[#FFF8F7] border border-[#F4C3BC] px-3 py-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-[#3B1B3D]">{r.label}</div>
              <div className="text-[11px] text-[#6E5E70]">Invoice {r.section === 'FREIGHT' ? 'freight' : 'duty'}{r.stale ? ' · values changed since accepted' : ''}</div>
            </div>
            <span className={`shrink-0 text-[11px] font-bold ${r.status === 'UNDERCHARGE' ? 'text-[#7A4F00]' : 'text-[#A8231A]'}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div className="text-[12px] text-[#3B1B3D] mt-1 tabular-nums">
            Expected {r.expected === null ? '—' : fmtRp(r.expected)} · Actual {r.actual === null ? '—' : fmtRp(r.actual)} · <b>{fmtDiff(r.selisih)}</b>
          </div>
          {canEdit && accepting !== r.key && (
            <div className="flex justify-end mt-1">
              <button type="button" className={VW_BTN_SECONDARY} onClick={() => { setAccepting(r.key); setNote(''); }}>Accept</button>
            </div>
          )}
          {canEdit && accepting === r.key && (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea aria-label="Accept reason" autoFocus value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="Reason for accepting this difference (required)"
                className={`${VW_INPUT} w-full py-1.5 min-h-[52px] leading-[1.35] resize-y`} />
              <div className="flex justify-end gap-2">
                <button type="button" className={VW_BTN_SECONDARY} disabled={saving} onClick={() => { setAccepting(null); setNote(''); }}>Cancel</button>
                <button type="button" className={VW_BTN_PRIMARY} disabled={saving || !note.trim()} onClick={() => doAccept(r)}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {acceptedRows.length > 0 && (
        <div>
          <button type="button" className="text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAccepted(v => !v)}>
            {showAccepted ? 'Hide' : 'Show'} accepted ({acceptedRows.length})
          </button>
          {showAccepted && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {acceptedRows.map(r => {
                const rev = reviews.items?.[r.key];
                return (
                  <div key={r.key} className="rounded-lg border border-[#BFE3CD] bg-[#F4FBF7] px-3 py-1.5 text-[11.5px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-[#3B1B3D]">{r.label} <span className="font-normal text-[#6E5E70]">· {STATUS_LABEL[r.status]} {fmtDiff(r.selisih)}</span></div>
                      {canEdit && <button type="button" disabled={saving} className="text-[#A8231A] font-semibold hover:underline shrink-0" onClick={() => undoAccept(r.key)}>Undo</button>}
                    </div>
                    <div className="text-[#17663D] [overflow-wrap:anywhere]">✓ {rev?.catatan}</div>
                    <div className="text-[#8A7A8B]">{rev?.dikonfirmasi_oleh || '—'}{rev?.dikonfirmasi_at ? ` · ${fmtDateTime(rev.dikonfirmasi_at)}` : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {data && data.cv_storage_actual !== null && data.cv_storage_actual !== undefined && (
        <StorageEstimateBox data={data} docType={docType} canEdit={canEdit} onSaved={fresh => { if (fresh) setData(fresh); else load(); onChanged?.(); }} />
      )}
      {data && (
        <div className="pt-2 border-t border-[#F1E8E1]">
          <div className="flex justify-between items-baseline mb-1 text-[11.5px] text-[#6E5E70]">
            <span>Accuracy</span>
            <b className={vwPctText(summary.pct)}>{summary.total_ok}/{summary.total_cost_cek} OK ({summary.pct}%)</b>
          </div>
          <div className="h-2 rounded-full bg-[#F3EEEA] overflow-hidden"><div className={`h-full transition-all duration-500 ${vwPctBar(summary.pct)}`} style={{ width: `${summary.pct}%` }} /></div>
        </div>
      )}
    </div>
  );
}
