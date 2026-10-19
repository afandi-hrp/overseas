// Ringkasan Cost Validation di panel Validation Invoice Recap Courier (2026-10-05, keputusan user).
// - Revisi 2026-10-19: SEMUA baris berstatus selain OK & N/A (Over/Undercharge, Selisih, RULE/ZONE NOT FOUND, Menunggu Invoice
//   Freight, TOTAL vs dokumen invoice, termasuk Other charges) -- daftar & persen dari `computeLiveCostSummary` + konteks
//   `fetchCourierCostContexts` (SATU sumber, sama badge kartu/KPI & tabel lengkap). Lihat docs/claude/courier-features.md.
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
// - Revisi 2026-10-14 (permintaan user): form Credit Note Details DIDUPLIKAT ke depan (`CourierCreditNoteBox`, 1 kartu per jenis CN
//   selama sisanya belum habis) + info "Credit note not allocated yet". Auto hide: CN yang sudah habis & estimasi storage yang
//   sudah disimpan disembunyikan -> link "Show credit note (x/y)" / "Show bonded storage" sejajar "Show accepted" (ringkasan +
//   tombol "Edit estimate" membuka kartu lagi). Details tidak ikut disembunyikan. Syarat 100%: lihat CourierRecapRules.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LoadingSpinner } from './LoadingState';
import { VW_BTN_PRIMARY, VW_BTN_SECONDARY, VW_INPUT, vwPctBar, vwPctText } from './validationWindowStyles';
import { computeLiveCostSummary, type CostDiffRow } from '../utils/CostValidationHelpers';
import { fetchCourierCostContexts, courierCostCtxKey, type CourierCostContext } from '../utils/CourierCostNormalize';
import {
  fetchCourierCostReviews, reviewMapOf, saveCourierCostItemReview, deleteCourierCostItemReview,
  type CourierCostReviews, type CourierCostItemReviewRow,
} from '../utils/CourierCostReviewHelpers';
import { fmtRp } from '../utils/SeaAirAuditHelpers';
import { appendNoteLine, removeNoteLinesWhere } from '../utils/NoteLines';
import { courierStorageActualDays, computeCourierStorageExpected, saveCourierStorageEstimate, type StorageEstimate } from '../utils/CourierStorageEstimate';
import { courierCnStates, courierHasStorage, courierStorageSaved } from '../utils/CourierRecapRules';
import CourierCreditNoteBox, { CnLogList, cnNosOf, cnSideLabel, type CnInvoiceInfo } from './CourierCreditNoteBox';

export const COST_SUMMARY_POLL_MS = 30000;

// Revisi 2026-10-19: notifikasi menampilkan SEMUA status selain OK & N/A. Label "Menunggu Invoice Freight" mengikuti teks spek user.
const STATUS_LABEL: Record<CostDiffRow['status'], string> = {
  OVERCHARGE: 'Overcharge', UNDERCHARGE: 'Undercharge', DIFFERENCE: 'Difference', SELISIH: 'Selisih',
  RULE_NOT_FOUND: 'Rule not found', ZONE_NOT_FOUND: 'Zone not found', RATE_NOT_FOUND: 'Rate not found', WAITING_FREIGHT: 'Menunggu Invoice Freight',
};
const STATUS_TEXT: Partial<Record<CostDiffRow['status'], string>> = { UNDERCHARGE: 'text-[#7A4F00]', WAITING_FREIGHT: 'text-[#7A4F00]', ZONE_NOT_FOUND: 'text-[#C2410C]' };
const fmtDateTime = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDay = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDiff = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${fmtRp(n)}`);
// Baris catatan di "Catatan Perubahan Manual" utk 1 Accept: "<Nama item> · <Status> ✓ <catatan>".
export const costAcceptNoteLine = (r: Pick<CostDiffRow, 'label' | 'status'>, note: string) =>
  `${r.label} · ${STATUS_LABEL[r.status]} ✓ ${String(note).replace(/\s*\n\s*/g, ' ').trim()}`;
// Semua catatan Accept milik 1 baris biaya (format baru + format lama "- <item> (Invoice ...): ...").
const isCostNoteOf = (label: string) => (line: string) => line.startsWith(`${label} · `) && line.includes(' ✓ ') || line.startsWith(`- ${label} (Invoice `);

// Form estimasi Bonded Storage (salinan form Details, logika CourierStorageEstimate). Nilai awal dari kolom tersimpan.
const StorageEstimateBox: React.FC<{ data: any; docType: string; canEdit: boolean; saved?: boolean; onCancel?: () => void; onSaved: (fresh: any | null) => void }> = ({ data, docType, canEdit, saved, onCancel, onSaved }) => {
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
        <div className="text-[12.5px] font-bold text-[#7A4F00] flex items-center gap-1.5">Bonded storage estimate
          {!saved && <span className="px-1.5 py-0.5 rounded-md bg-[#FFE9C2] text-[#7A4F00] text-[10px] font-bold">needs saving</span>}</div>
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
        <div className="flex items-center gap-2">
          {onCancel && <button type="button" className={VW_BTN_SECONDARY} disabled={saving} onClick={onCancel}>Cancel</button>}
          {canEdit && <button type="button" className={VW_BTN_PRIMARY} disabled={saving || !eta || !rel || !result} onClick={save}>{saving ? 'Saving…' : 'Save new estimate'}</button>}
        </div>
      </div>
      {msg && <div className={`mt-1.5 text-[11.5px] font-semibold ${msg.ok ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>{msg.text}</div>}
    </div>
  );
};

export default function CourierCostSummary({ docType, auditId, canEdit, reloadKey = 0, onOpenDetails, onOpenChecklist, onEditShipment, onPctChange, onChanged, cnInvoices = [] }: {
  docType: string;
  auditId: any;
  canEdit: boolean;
  reloadKey?: number;
  onOpenDetails?: () => void;
  onOpenChecklist?: () => void;   // kartu "Menunggu Invoice Freight" -> tab Checklist panel
  onEditShipment?: () => void;    // kartu "Zone not found" -> Details dalam mode Edit (Edit Shipment Info)
  onPctChange?: (pct: number | null) => void;
  onChanged?: () => void;
  cnInvoices?: CnInvoiceInfo[]; // invoice Credit Note AWB ini (nomor & tanggal email) utk label kartu CN
}) {
  const { profile, user } = useAuth();
  const isCn = String(docType || '').toUpperCase() === 'CN';
  const [data, setData] = useState<any>(null);
  const [reviews, setReviews] = useState<CourierCostReviews>({});
  const [ctx, setCtx] = useState<CourierCostContext | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAccepted, setShowAccepted] = useState(false);
  const [showCn, setShowCn] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [editStorage, setEditStorage] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const [{ data: rows }, rv, ctxMap] = await Promise.all([
      supabase.from('tabel_cost_validasi').select('*').eq(isCn ? 'cn_id' : 'pib_id', auditId).order('created_at', { ascending: false }).limit(1),
      fetchCourierCostReviews(docType, auditId),
      fetchCourierCostContexts([{ docType, id: auditId }]),
    ]);
    if (my !== seq.current) return;
    setData(rows && rows.length > 0 ? rows[0] : null);
    setReviews(rv);
    setCtx(ctxMap[courierCostCtxKey(docType, auditId)] || null);
    setLoaded(true);
  }, [auditId, docType, isCn]);

  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => {
    const iv = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load(); }, COST_SUMMARY_POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const summary = useMemo(() => computeLiveCostSummary(data, docType, reviewMapOf(reviews), ctx), [data, docType, reviews, ctx]);
  const pct = data ? summary.pct : null;
  useEffect(() => { if (loaded) onPctChange?.(pct); }, [loaded, pct, onPctChange]);

  const cnStates = useMemo(() => courierCnStates(data), [data]);
  const cnOpen = cnStates.filter(c => !c.done);
  const cnDone = cnStates.filter(c => c.done);
  const hasStorage = courierHasStorage(data);
  const storageSaved = courierStorageSaved(data);
  const storagePending = hasStorage && !storageSaved;
  const storageCard = hasStorage && (!storageSaved || editStorage);
  const pendingTodo = [
    cnOpen.length > 0 ? `deduct the credit note (${cnOpen.length} CN not fully deducted)` : null,
    storagePending ? 'save the bonded storage estimate' : null,
  ].filter(Boolean).join(' and ');
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
      {data && pendingTodo && (
        <div className="rounded-xl border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12px] text-[#7A4F00]" data-cn-pending-info>
          {cnOpen.length > 0 && <div className="font-bold">Credit note not allocated yet</div>}
          <div>To complete: {pendingTodo} (see below).</div>
        </div>
      )}
      {!data ? (
        <div className="rounded-xl border border-[#EADFD6] bg-white px-3 py-2.5 text-[12px] text-[#6E5E70]">No cost validation for this shipment yet.</div>
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-[#BFE3CD] bg-[#EAF6EF] px-3 py-2.5 text-[12px] font-semibold text-[#17663D]">No cost difference to review.</div>
      ) : open.map(r => {
        // Kartu SAMA model mismatch lama; "Menunggu Invoice Freight" kuning + link Checklist (tanpa Accept); Zone not found -> Edit Shipment Info.
        const waiting = r.status === 'WAITING_FREIGHT';
        const zone = r.status === 'ZONE_NOT_FOUND';
        return (
        <div key={r.key} data-cost-diff={r.key} data-cost-status={r.status}
          className={`rounded-r-xl border-l-[3px] px-3 py-2 border ${waiting ? 'border-l-[#C98A00] bg-[#FFF8E6] border-[#F2D58A]' : 'border-l-[#A8231A] bg-[#FFF8F7] border-[#F4C3BC]'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-[#3B1B3D]">{r.label}</div>
              <div className="text-[11px] text-[#6E5E70]">Invoice {r.section === 'FREIGHT' ? 'freight' : 'duty'}{r.stale ? ' · values changed since accepted' : ''}</div>
            </div>
            <span className={`shrink-0 text-[11px] font-bold ${STATUS_TEXT[r.status] || 'text-[#A8231A]'}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div className="text-[12px] text-[#3B1B3D] mt-1 tabular-nums">
            Expected {r.expected === null ? '—' : fmtRp(r.expected)} · Actual {r.actual === null ? '—' : fmtRp(r.actual)}{waiting ? '' : <> · <b>{fmtDiff(r.selisih)}</b></>}
          </div>
          {waiting && (
            <div className="flex justify-end mt-1">
              <button type="button" data-open-checklist className="text-[11.5px] font-semibold text-[#6B3470] hover:underline disabled:opacity-50" disabled={!onOpenChecklist} onClick={() => onOpenChecklist?.()}>
                lihat Checklist
              </button>
            </div>
          )}
          {!waiting && canEdit && accepting !== r.key && (
            <div className="flex justify-end gap-2 mt-1">
              {zone ? (
                onEditShipment && <button type="button" data-edit-shipment className={VW_BTN_SECONDARY} onClick={onEditShipment}>Edit Shipment Info</button>
              ) : (
                <>
                  {onOpenDetails && <button type="button" data-cost-edit className={VW_BTN_SECONDARY} onClick={onOpenDetails}>Edit</button>}
                  <button type="button" className={VW_BTN_SECONDARY} onClick={() => { setAccepting(r.key); setNote(''); }}>Accept</button>
                </>
              )}
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
        );
      })}
      {(acceptedRows.length > 0 || cnDone.length > 0 || (hasStorage && storageSaved && !editStorage)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-cost-toggles>
          {acceptedRows.length > 0 && (
            <button type="button" className="text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowAccepted(v => !v)}>
              {showAccepted ? 'Hide' : 'Show'} accepted ({acceptedRows.length})
            </button>
          )}
          {cnDone.length > 0 && (
            <button type="button" data-toggle-cn className="text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowCn(v => !v)}>
              {showCn ? 'Hide' : 'Show'} credit note ({cnDone.length}/{cnStates.length})
            </button>
          )}
          {hasStorage && storageSaved && !editStorage && (
            <button type="button" data-toggle-storage className="text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => setShowStorage(v => !v)}>
              {showStorage ? 'Hide' : 'Show'} bonded storage
            </button>
          )}
        </div>
      )}
      {acceptedRows.length > 0 && showAccepted && (
        <div>
          {showAccepted && (
            <div className="flex flex-col gap-1.5">
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
      {data && showCn && cnDone.length > 0 && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FFFBF2] px-3 py-2 flex flex-col gap-1.5" data-cn-history>
          {cnDone.map(c => {
            const nos = cnNosOf(cnInvoices, c.side).map(x => x.no);
            return (
              <div key={c.side}>
                <div className="text-[12px] text-[#3B1B3D]"><b>{cnSideLabel(c.side)}</b>{nos.length ? <b> · CN {nos.join(', ')}</b> : null}
                  <span className="text-[#6E5E70]"> · Remaining subtotal {fmtRp(c.subtotal)} · Remaining VAT {fmtRp(c.vat)}</span></div>
                <div className="pl-3"><CnLogList cv={data} state={c} /></div>
              </div>
            );
          })}
        </div>
      )}
      {data && showStorage && hasStorage && storageSaved && !editStorage && (
        <div className="rounded-xl border border-[#F3D9A4] bg-[#FFFBF2] px-3 py-2 text-[12px] text-[#3B1B3D]" data-storage-saved>
          <div><b>Estimate saved</b><span className="text-[#6E5E70]">
            {data.cv_storage_weight_kg ? ` · ${data.cv_storage_weight_kg} kg` : ''}
            {data.cv_eta_date ? ` · ETA ${fmtDay(data.cv_eta_date)}` : ''}
            {data.cv_release_date ? ` · Release ${fmtDay(data.cv_release_date)}` : ''}
            {data.cv_storage_days ? ` · Billing ${data.cv_storage_days} days` : ''}</span></div>
          <div className="text-[#6E5E70]">Expected storage <b className="text-[#3B1B3D]">{fmtRp(data.cv_storage_expected)}</b> · Storage actual <b className="text-[#3B1B3D]">{fmtRp(data.cv_storage_actual)}</b>
            {(data.cv_storage_saved_by || data.updated_by) ? ` · ${data.cv_storage_saved_by || data.updated_by}` : ''}{data.updated_at ? ` · ${fmtDateTime(data.updated_at)}` : ''}</div>
          {canEdit && <button type="button" className="mt-1 text-[11.5px] font-semibold text-[#6B3470] hover:underline" onClick={() => { setEditStorage(true); setShowStorage(false); }}>✎ Edit estimate</button>}
        </div>
      )}
      {data && cnOpen.map(c => (
        <React.Fragment key={c.side}>
          <CourierCreditNoteBox cv={data} state={c} cnInvoices={cnInvoices} canEdit={canEdit}
            onApplied={fresh => { if (fresh) setData(fresh); else load(); onChanged?.(); }} />
        </React.Fragment>
      ))}
      {data && storageCard && (
        <StorageEstimateBox data={data} docType={docType} canEdit={canEdit} saved={storageSaved}
          onCancel={editStorage ? () => setEditStorage(false) : undefined}
          onSaved={fresh => { if (fresh) setData(fresh); else load(); setEditStorage(false); onChanged?.(); }} />
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
