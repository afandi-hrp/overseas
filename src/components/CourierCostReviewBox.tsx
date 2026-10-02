// Kotak review cost per invoice (Freight / Duty) Audit Courier (2026-10-02, sql/038) -- dipakai jendela baru
// (tab Costs, gaya Sea & Air) DAN versi lama mode List (`legacy`) supaya logikanya SAMA. Pola UI & aturan SAMA
// review segmen Invoice Recap Sea & Air: Accept difference (catatan opsional) / Ask vendor to revise (catatan
// wajib), Change / Undo. Muncul kalau invoice punya selisih ATAU sudah pernah direview.
import React, { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { CostReviewSection } from '../utils/CostValidationHelpers';
import { saveCourierCostReview, deleteCourierCostReview, type CourierCostReview } from '../utils/CourierCostReviewHelpers';

const fmtDateTimeEN = (v: any): string => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function CourierCostReviewBox({ docType, auditId, section, review, hasDifference, canEdit, legacy = false, onChange }: {
  docType: string;
  auditId: any;
  section: CostReviewSection;
  review: CourierCostReview | undefined;
  hasDifference: boolean;
  canEdit: boolean;
  legacy?: boolean;
  onChange: (r: CourierCostReview | null) => void;
}) {
  const { profile, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ status: 'MATCH' | 'MISMATCH'; catatan: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  if (!review && !hasDifference) return null;
  if (auditId === null || auditId === undefined || auditId === '') return null;

  const cur = draft || (review ? { status: review.status_konfirmasi, catatan: review.catatan || '' } : { status: 'MATCH' as const, catatan: '' });
  const flash = (text: string, tone: 'ok' | 'err') => { setMsg({ text, tone }); setTimeout(() => setMsg(null), 3000); };

  const save = async () => {
    if (cur.status === 'MISMATCH' && !cur.catatan.trim()) { flash('A note is required when asking the vendor to revise.', 'err'); return; }
    setSaving(true);
    const { data, error } = await saveCourierCostReview(docType, auditId, section, cur.status, cur.catatan, profile?.nama || user?.email || null);
    setSaving(false);
    if (error) { flash('Failed to save review: ' + error.message, 'err'); return; }
    setDraft(null); setOpen(false);
    onChange(data as CourierCostReview);
    flash('Review saved.', 'ok');
  };
  const undo = async () => {
    if (!review) return;
    setSaving(true);
    const { error } = await deleteCourierCostReview(review.id);
    setSaving(false);
    if (error) { flash('Failed to undo review: ' + error.message, 'err'); return; }
    setDraft(null);
    onChange(null);
    flash('Review removed.', 'ok');
  };

  const wrap = legacy
    ? 'mb-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 print:hidden'
    : 'px-4 py-3 border-t border-[#EADFD6] bg-[#FFFCFA] print:hidden';
  const btnPrimary = legacy
    ? 'px-3 h-8 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-semibold disabled:opacity-50'
    : 'px-3.5 h-8 rounded-xl bg-[#6B3470] hover:bg-[#5A2A5E] text-white text-xs font-semibold disabled:opacity-50';
  const btnOutline = 'px-3 h-8 rounded-lg border border-[#EADFD6] bg-white text-[#3B1B3D] text-xs font-semibold hover:bg-[#F6EFEA]';

  return (
    <div className={wrap} data-cost-review={section}>
      {review && !open ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className={`font-bold ${review.status_konfirmasi === 'MATCH' ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>
            {review.status_konfirmasi === 'MATCH' ? '✓ Reviewed — difference accepted' : '↺ Reviewed — vendor asked to revise'}
          </span>
          <span className="text-[#6E5E70]">by {review.dikonfirmasi_oleh || '—'}{review.dikonfirmasi_at ? ` · ${fmtDateTimeEN(review.dikonfirmasi_at)}` : ''}</span>
          {review.catatan && <span className="text-[#3B1B3D] whitespace-pre-wrap [overflow-wrap:anywhere]">· {review.catatan}</span>}
          {canEdit && (
            <span className="ml-auto flex items-center gap-2">
              <button type="button" className="text-[#6B3470] font-semibold hover:underline" onClick={() => { setOpen(true); setDraft(null); }}>Change</button>
              <button type="button" disabled={saving} className="text-[#A8231A] font-semibold hover:underline disabled:opacity-50" onClick={undo}>Undo</button>
            </span>
          )}
        </div>
      ) : open ? (
        <div className="flex flex-col md:flex-row md:items-start gap-2">
          <span className="text-[12px] font-bold text-[#3B1B3D] md:pt-2 shrink-0">Your review</span>
          <div className="inline-flex p-0.5 rounded-xl border border-[#EADFD6] bg-white shrink-0 h-fit">
            <button type="button" onClick={() => setDraft({ ...cur, status: 'MATCH' })}
              className={`px-3 h-8 rounded-lg text-[11.5px] font-bold flex items-center gap-1 ${cur.status === 'MATCH' ? 'bg-[#17663D] text-white' : 'text-[#3B1B3D] hover:bg-[#F6EFEA]'}`}>
              <Check size={12} /> Accept difference
            </button>
            <button type="button" onClick={() => setDraft({ ...cur, status: 'MISMATCH' })}
              className={`px-3 h-8 rounded-lg text-[11.5px] font-bold flex items-center gap-1 ${cur.status === 'MISMATCH' ? 'bg-[#A8231A] text-white' : 'text-[#3B1B3D] hover:bg-[#F6EFEA]'}`}>
              <RotateCcw size={12} /> Ask vendor to revise
            </button>
          </div>
          <input
            aria-label={`Review note ${section.toLowerCase()}`}
            value={cur.catatan}
            onChange={e => setDraft({ ...cur, catatan: e.target.value })}
            placeholder={cur.status === 'MISMATCH' ? 'Note required (what should the vendor revise?)' : 'Note (e.g. agreed with vendor / claim the difference)'}
            className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[#EADFD6] bg-white text-[12.5px] focus:outline-none focus:border-[#6B3470]"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className={btnOutline} onClick={() => { setOpen(false); setDraft(null); }}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={saving || (cur.status === 'MISMATCH' && !cur.catatan.trim())} onClick={save}>
              {saving ? 'Saving…' : 'Save review'}
            </button>
          </div>
        </div>
      ) : canEdit ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[#7A4F00] font-semibold">This invoice has a difference against the rate sheet.</span>
          <button type="button" className="font-semibold text-[#6B3470] hover:underline" onClick={() => setOpen(true)}>+ Add review</button>
        </div>
      ) : (
        <span className="text-[12px] text-[#8A7A8B]">Difference not reviewed yet</span>
      )}
      {msg && <div className={`mt-1.5 text-[11.5px] font-semibold ${msg.tone === 'ok' ? 'text-[#17663D]' : 'text-[#A8231A]'}`}>{msg.text}</div>}
    </div>
  );
}
