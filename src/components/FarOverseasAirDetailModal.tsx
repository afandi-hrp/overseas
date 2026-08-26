import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Printer, Stamp, Ban, ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney, formatDateID, formatDateMemo, APPROVAL_STATUS_META, LOGO_ASSETS, parseJsonField } from '../utils/FarOverseasAirHelpers';

type SignerConfig = {
  company_code: string;
  company_name_full: string;
  logo_asset_key: string | null;
  tier1_role: string | null;
  tier2_name: string | null;
  tier2_role: string | null;
  tier3_name: string | null;
  tier3_role: string | null;
};

type ApprovalEntry = { tier: number; nama: string; jabatan: string; approved_at: string; user_email?: string | null };

const TIER_NEXT_STATUS: Record<number, string> = { 1: 'TIER1_DONE', 2: 'TIER2_DONE', 3: 'APPROVED' };
const TIER_ACTION_LABEL: Record<number, string> = { 1: 'Setujui — Disiapkan Oleh', 2: 'Setujui — Diperiksa Oleh (Tahap 1)', 3: 'Setujui — Diperiksa Oleh (Tahap 2)' };

function CompanyLogo({ signer }: { signer: SignerConfig | null }) {
  const asset = signer?.company_code ? LOGO_ASSETS[signer.company_code] : null;
  if (asset) {
    return <img src={asset} alt={signer?.company_name_full || 'Logo'} className="h-14 object-contain shrink-0" />;
  }
  // Fallback teks nama perusahaan hanya kalau logonya belum ada -- supaya header tidak kosong.
  return (
    <div className="text-base font-black text-[#5A305A] leading-tight uppercase">
      {signer?.company_name_full || '-'}
    </div>
  );
}

// Baris "Label : Value" ala dokumen memo cetak resmi -- label lebar tetap supaya titik dua sejajar.
function MemoField({ label, value, bold, labelWidth = 'w-32' }: { label: string; value: React.ReactNode; bold?: boolean; labelWidth?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`${labelWidth} shrink-0 text-[#5A305A]`}>{label}</span>
      <span className="shrink-0 text-[#5A305A]">:</span>
      <span className={`text-[#5A305A] break-words ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

function SignatureColumn({ label, role, entry, defaultNama }: { label: string; role: string | null; entry?: ApprovalEntry; defaultNama?: string | null }) {
  const nama = entry?.nama || defaultNama || null;
  return (
    <div className="flex-1 text-center px-3">
      <p className="text-xs text-[#5A305A] mb-14">{label}</p>
      <div className="border-b border-[#FFF5C5] mb-1 h-10 flex items-end justify-center pb-1">
        <span className="text-sm font-semibold text-[#5A305A]">{nama || ''}</span>
      </div>
      <p className="text-xs font-bold text-[#5A305A]">{nama || '( _______________ )'}</p>
      <p className="text-[11px] text-[#5A305A]/70 mt-0.5">{role || '-'}</p>
      <p className="text-[10px] text-[#5A305A]/60 mt-2">Tanggal: {entry?.approved_at ? formatDateID(entry.approved_at) : '-'}</p>
    </div>
  );
}

function ApprovalConfirmModal({ tier, role, defaultNama, onConfirm, onClose, submitting }: {
  tier: number; role: string; defaultNama: string; onConfirm: (nama: string) => void; onClose: () => void; submitting: boolean;
}) {
  const [nama, setNama] = useState(defaultNama);
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="font-bold text-[#5A305A] mb-1">Konfirmasi Persetujuan — Tahap {tier}</h3>
        <p className="text-xs text-[#5A305A] mb-4">Jabatan: <span className="font-semibold">{role || '-'}</span></p>
        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Nama Penyetuju</label>
        <input
          value={nama}
          onChange={e => setNama(e.target.value)}
          autoFocus
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={submitting} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Batal
          </button>
          <button
            onClick={() => onConfirm(nama.trim())}
            disabled={submitting || !nama.trim()}
            className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {submitting ? 'Menyimpan...' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ onConfirm, onClose, submitting }: { onConfirm: (reason: string) => void; onClose: () => void; submitting: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="font-bold text-[#5A305A] mb-1">Tolak Memo</h3>
        <p className="text-xs text-[#5A305A] mb-4">Alasan penolakan akan tersimpan di catatan memo.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Jelaskan alasan penolakan..."
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={submitting} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Batal
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={submitting || !reason.trim()}
            className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {submitting ? 'Menyimpan...' : 'Tolak'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FarOverseasAirDetailModal({ record, onClose, onChanged }: { record: any; onClose: () => void; onChanged?: () => void }) {
  const { user, profile } = useAuth();
  const [rec, setRec] = useState(record);
  const [signer, setSigner] = useState<SignerConfig | null>(null);
  const [showPoDetail, setShowPoDetail] = useState(false);
  const [confirmTier, setConfirmTier] = useState<number | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const loadSigner = async () => {
      if (!rec?.dominant_company_code) { setSigner(null); return; }
      const { data } = await supabase.from('far_overseas_signer_config').select('*').eq('company_code', rec.dominant_company_code).maybeSingle();
      setSigner(data || null);
    };
    loadSigner();
  }, [rec?.dominant_company_code]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const approvals: ApprovalEntry[] = Array.isArray(rec.approvals) ? rec.approvals : [];
  const entryFor = (tier: number) => approvals.find(a => a.tier === tier);
  const statusMeta = APPROVAL_STATUS_META[rec.approval_status] || APPROVAL_STATUS_META.PENDING;

  const nextTier: number | null =
    rec.approval_status === 'PENDING' ? 1 :
    rec.approval_status === 'TIER1_DONE' ? 2 :
    rec.approval_status === 'TIER2_DONE' ? 3 :
    null;

  const roleForTier = (tier: number) => tier === 1 ? signer?.tier1_role : tier === 2 ? signer?.tier2_role : signer?.tier3_role;
  const defaultNamaForTier = (tier: number) => tier === 1 ? (profile?.nama || user?.email || '') : tier === 2 ? (signer?.tier2_name || '') : (signer?.tier3_name || '');

  const handleApprove = async (tier: number, nama: string) => {
    setSubmitting(true);
    const entry: ApprovalEntry = {
      tier,
      nama,
      jabatan: roleForTier(tier) || '-',
      approved_at: new Date().toISOString(),
      user_email: user?.email || null,
    };
    const newApprovals = [...approvals.filter(a => a.tier !== tier), entry];
    const newStatus = TIER_NEXT_STATUS[tier];
    const { error } = await supabase.from('rekapan_far_overseas_air').update({ approval_status: newStatus, approvals: newApprovals }).eq('id', rec.id);
    setSubmitting(false);
    if (error) {
      showToast('Gagal menyimpan persetujuan: ' + error.message, 'error');
    } else {
      setRec({ ...rec, approval_status: newStatus, approvals: newApprovals });
      setConfirmTier(null);
      showToast('Persetujuan tahap ' + tier + ' berhasil disimpan.', 'success');
      onChanged?.();
    }
  };

  const handleReject = async (reason: string) => {
    setSubmitting(true);
    const { error } = await supabase.from('rekapan_far_overseas_air').update({ approval_status: 'REJECTED', notes: reason }).eq('id', rec.id);
    setSubmitting(false);
    if (error) {
      showToast('Gagal menolak memo: ' + error.message, 'error');
    } else {
      setRec({ ...rec, approval_status: 'REJECTED', notes: reason });
      setShowReject(false);
      showToast('Memo ditolak.', 'success');
      onChanged?.();
    }
  };

  const parsedPoList = parseJsonField(rec.po_list);
  const poList: any[] = Array.isArray(parsedPoList) ? parsedPoList : [];
  const showIdrHint = rec.total_amount_currency && rec.total_amount_currency !== 'IDR' && rec.total_amount_idr != null;

  // Portal langsung ke document.body: kalau modal ini dirender inline di dalam tree halaman
  // (bukan portal), print CSS #far-overseas-print-area jadi berpotensi ke-posisi relatif ke
  // ancestor "relative" milik halaman itu sendiri (bukan ke halaman cetak), dan ancestor itu
  // masih ikut terdorong ruang kosong dari konten lain yang cuma visibility:hidden. Portal ke
  // body menghilangkan ambiguitas itu sepenuhnya -- tidak ada ancestor apapun selain <body>.
  return createPortal(
    <div id="far-overseas-print-area" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex justify-center items-center p-2 sm:p-4 md:p-6 print:static print:bg-white print:p-0 print:block">
      <div className="bg-slate-50 w-full max-w-4xl h-[92vh] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden print:shadow-none print:w-full print:m-0 print:rounded-none print:h-auto print:max-h-none print:overflow-visible print:block">

        {/* Toolbar */}
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0 print:hidden">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Memo Approval — FAR Overseas Air</h2>
            <p className="text-xs font-light text-[#5A305A] mt-0.5">{rec.memo_title || '-'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            <button onClick={() => window.print()} className="px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-[#5A305A] rounded-md flex items-center gap-2 transition-colors">
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mx-6 mt-4 p-3 rounded-lg border text-sm font-medium shrink-0 print:hidden ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar print:overflow-visible">
          <div className="p-4 md:p-8 print:p-0">

            {/* ── Memo cetak (replika dokumen asli) ── */}
            <div className="bg-white border-2 border-[#FFF5C5] text-[#5A305A] font-sans print:border-[#FFF5C5]">

              {/* Header: logo + judul */}
              <div className="flex flex-col sm:flex-row border-b-2 border-[#FFF5C5]">
                <div className="sm:w-2/5 border-b-2 sm:border-b-0 sm:border-r-2 border-[#FFF5C5] p-3 flex items-center">
                  <CompanyLogo signer={signer} />
                </div>
                <div className="flex-1 flex items-center justify-center p-3">
                  <h1 className="text-lg md:text-2xl font-bold uppercase tracking-wide text-center">{rec.memo_title || '-'}</h1>
                </div>
              </div>

              {/* Field baris */}
              <div className="p-4 space-y-2 text-sm">
                <div className="flex flex-col md:flex-row print:flex-row md:items-start print:items-start gap-1 md:gap-6 print:gap-6">
                  <div className="flex-1"><MemoField label="PO. No." value={rec.po_ori || '-'} /></div>
                  <div className="md:w-56 print:w-56"><MemoField label="Inv. No" labelWidth="w-20" value={rec.no_invoice || '-'} /></div>
                </div>
                <div className="flex flex-col md:flex-row print:flex-row md:items-start print:items-start gap-1 md:gap-6 print:gap-6">
                  <div className="flex-1"><MemoField label="Supplier" value={rec.vendor || '-'} /></div>
                  <div className="md:w-56 print:w-56"><MemoField label="Date" labelWidth="w-20" value={formatDateMemo(rec.created_at)} /></div>
                </div>
                <MemoField label="Ship Via" value={rec.ship_via || '-'} bold />
                <MemoField label="Buyer" value={rec.buyer_name || '-'} />
                <MemoField label="Weight" value={rec.qty != null ? <>{rec.qty}<span className="ml-6">{rec.weight_unit || ''}</span></> : '-'} />
                <MemoField label="Price /Kg" value={formatMoney(rec.unit_price, rec.unit_price_currency)} />
                <MemoField label="Departure Date" value={formatDateMemo(rec.departure_date)} />
                <MemoField
                  label="TOTAL AMOUNT"
                  bold
                  value={
                    <>
                      {formatMoney(rec.total_amount, rec.total_amount_currency)}
                      {showIdrHint && <span className="font-normal text-xs ml-2">(≈ Rp {Number(rec.total_amount_idr).toLocaleString('id-ID')})</span>}
                    </>
                  }
                />
              </div>

              {/* NOTE */}
              <div className="border-t-2 border-[#FFF5C5] p-4 text-sm flex gap-2">
                <span className="underline font-semibold shrink-0">NOTE :</span>
                <div className="space-y-1">
                  {rec.route_note && <p>{rec.route_note}</p>}
                  {rec.item_description && <p>{rec.item_description}</p>}
                  {!rec.route_note && !rec.item_description && <p className="text-[#5A305A]/50 italic">-</p>}
                </div>
              </div>

              {/* Signature table */}
              <div className="flex border-t-2 border-[#FFF5C5] pt-6 pb-4 px-4">
                <SignatureColumn label="Disiapkan Oleh," role={signer?.tier1_role || null} entry={entryFor(1)} defaultNama={null} />
                <SignatureColumn label="Diperiksa Oleh," role={signer?.tier2_role || null} entry={entryFor(2)} defaultNama={signer?.tier2_name} />
                <SignatureColumn label="Diperiksa Oleh," role={signer?.tier3_role || null} entry={entryFor(3)} defaultNama={signer?.tier3_name} />
              </div>
            </div>

            {/* ── Catatan tambahan sistem (di luar replika cetak resmi) ── */}
            {(rec.status_note || rec.other_note) && (
              <div className="mt-5 space-y-3 print:hidden">
                {rec.status_note && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <span className="text-sm text-[#5A305A]">{rec.status_note}</span>
                  </div>
                )}
                {rec.other_note && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <span className="text-sm text-[#5A305A]">{rec.other_note}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Rincian PO (opsional, tidak masuk memo cetak) ── */}
            {poList.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 mt-5 overflow-hidden print:hidden">
                <button onClick={() => setShowPoDetail(s => !s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-bold text-[#5A305A]">Rincian PO ({poList.length})</span>
                  {showPoDetail ? <ChevronUp size={16} className="text-[#5A305A]" /> : <ChevronDown size={16} className="text-[#5A305A]" />}
                </button>
                {showPoDetail && (
                  <div className="border-t border-slate-200 divide-y divide-slate-100">
                    {poList.map((po, i) => (
                      <div key={i} className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><p className="text-[#5A305A]/60">PO No.</p><p className="font-semibold text-[#5A305A]">{po.po_no_raw || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Perusahaan</p><p className="font-semibold text-[#5A305A]">{po.company_code || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Vendor</p><p className="font-semibold text-[#5A305A]">{po.vendor_name || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Nilai</p><p className="font-semibold text-[#5A305A]">{formatMoney(po.total_value, po.currency)}</p></div>
                        <div><p className="text-[#5A305A]/60">Weight</p><p className="font-semibold text-[#5A305A]">{po.weight_kg != null ? `${po.weight_kg} KG` : '-'}</p></div>
                        {po.item_summary && <div className="col-span-2 md:col-span-4"><p className="text-[#5A305A]/60">Item</p><p className="text-[#5A305A]">{po.item_summary}</p></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Catatan internal (TIDAK tercetak di memo) ── */}
            {(rec.vessel_internal_note || rec.expected_payment_date) && (
              <div className="bg-slate-100 border border-slate-300 rounded-xl mt-5 p-4 print:hidden">
                <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-wider mb-1.5">Catatan Internal (tidak tercetak di memo)</p>
                {rec.vessel_internal_note && <p className="text-sm text-[#5A305A]">{rec.vessel_internal_note}</p>}
                {rec.expected_payment_date && <p className="text-xs text-[#5A305A]/70 mt-2">Expected Payment Date: {formatDateID(rec.expected_payment_date)}</p>}
              </div>
            )}

            {rec.approval_status === 'REJECTED' && rec.notes && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl mt-5 p-4 print:hidden">
                <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-1.5">Alasan Penolakan</p>
                <p className="text-sm text-rose-800">{rec.notes}</p>
              </div>
            )}

            {/* ── Aksi persetujuan ── */}
            {rec.approval_status !== 'APPROVED' && rec.approval_status !== 'REJECTED' && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 mt-5 p-4 print:hidden">
                <p className="text-xs text-[#5A305A]">
                  {nextTier != null ? `Menunggu persetujuan Tahap ${nextTier}.` : 'Tidak ada aksi tersedia.'}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowReject(true)} className="px-4 py-2 rounded-xl border border-rose-300 text-rose-600 font-semibold text-sm hover:bg-rose-50 transition-all flex items-center gap-1.5">
                    <Ban size={15} /> Tolak
                  </button>
                  {nextTier != null && (
                    <button onClick={() => setConfirmTier(nextTier)} className="px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all flex items-center gap-1.5">
                      <Stamp size={15} /> {TIER_ACTION_LABEL[nextTier]}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {confirmTier != null && (
        <ApprovalConfirmModal
          tier={confirmTier}
          role={roleForTier(confirmTier) || '-'}
          defaultNama={defaultNamaForTier(confirmTier)}
          submitting={submitting}
          onClose={() => setConfirmTier(null)}
          onConfirm={(nama) => handleApprove(confirmTier, nama)}
        />
      )}

      {showReject && (
        <RejectModal submitting={submitting} onClose={() => setShowReject(false)} onConfirm={handleReject} />
      )}
    </div>,
    document.body
  );
}