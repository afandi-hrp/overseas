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

type ApprovalTier = number | 'PIC';
type ApprovalEntry = { tier: ApprovalTier; nama: string; jabatan: string; approved_at: string; user_email?: string | null };

// Alur approval FAR Overseas Air (2026-09, VERSI FINAL) -- PIC SEKARANG BAGIAN dari rantai utama
// & WAJIB berurutan: Prepared By (Exim) -> PIC -> SPV -> Director. Setiap tahap gating-nya
// GANDA: (1) `canEditDirectLoading` (akses edit halaman ini, RBAC biasa) DAN (2)
// `canApproveTier('direct_loading', step)` dari AuthContext -- user ITU SENDIRI (bukan role-nya)
// harus punya baris `user_approval_tiers` utk halaman `direct_loading` yang tier-nya PERSIS
// cocok dgn tahap yang sedang menunggu (diatur di halaman Kelola Role & Akses, panel "Role per
// User"). Admin TIDAK otomatis lolos gerbang ke-2 ini (SENGAJA, atas permintaan user) -- Admin
// tetap harus di-assign jabatan approval-nya sendiri kalau mau bisa approve. Gating ini ditegakkan DI DUA
// TEMPAT: (a) frontend (tombolnya disembunyikan/diganti pesan kalau tidak eligible, lihat render
// di bawah) DAN (b) server, lewat RPC `approve_far_overseas_air` (SECURITY DEFINER, cek jabatan +
// urutan status di dalamnya) yang dipanggil `handleApprove` -- BUKAN `.update()` langsung lagi ke
// `rekapan_far_overseas_air` (lihat CLAUDE.md utk SQL migration RPC ini, WAJIB dijalankan manual
// dulu di Supabase sebelum approval bisa jalan sama sekali). SATU KLIK LANGSUNG approve (2026-09,
// permintaan user) -- TIDAK ADA lagi modal konfirmasi nama di tengah (`ApprovalConfirmModal`
// DIHAPUS TOTAL, jangan reintroduce), nama diambil langsung dari `defaultNamaForStep(step)` saat
// tombol diklik.
type ApprovalStep = 'TIER1' | 'PIC' | 'TIER2' | 'TIER3';
const STEP_LABEL: Record<ApprovalStep, string> = { TIER1: 'Prepared By (Exim)', PIC: 'PIC', TIER2: 'SPV', TIER3: 'Director' };
const STEP_ACTION_LABEL: Record<ApprovalStep, string> = {
  TIER1: 'Approve — Prepared By',
  PIC: 'Approve — PIC',
  TIER2: 'Approve — SPV',
  TIER3: 'Approve — Director',
};

// Status "menunggu tahap apa" -- lihat juga APPROVAL_STATUS_META (FarOverseasAirHelpers.ts) utk
// label badge-nya. null = tidak ada tahap tersisa (APPROVED/REJECTED).
function nextStepForStatus(status: string | null | undefined): ApprovalStep | null {
  if (!status || status === 'PENDING') return 'TIER1';
  if (status === 'TIER1_DONE') return 'PIC';
  if (status === 'PIC_DONE') return 'TIER2';
  if (status === 'TIER2_DONE') return 'TIER3';
  return null;
}

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

function SignatureColumn({ label, role, entry, defaultNama, nameOverride }: { label: string; role: string | null; entry?: ApprovalEntry; defaultNama?: string | null; nameOverride?: string | null }) {
  const nama = nameOverride !== undefined ? nameOverride : (entry?.nama || defaultNama || null);
  return (
    <div className="flex-1 text-center px-3">
      <p className="text-xs text-[#5A305A] mb-14">{label}</p>
      <div className="border-b border-[#FFF5C5] mb-1 h-10 flex items-end justify-center pb-1">
        <span className="text-sm font-semibold text-[#5A305A] uppercase">{nama || ''}</span>
      </div>
      <p className="text-xs font-bold text-[#5A305A] uppercase">{nama || '( _______________ )'}</p>
      <p className="text-[11px] text-[#5A305A]/70 mt-0.5">{role || '-'}</p>
      <p className="text-[10px] text-[#5A305A]/60 mt-2">Tanggal: {entry?.approved_at ? formatDateID(entry.approved_at) : '-'}</p>
    </div>
  );
}

function RejectModal({ onConfirm, onClose, submitting }: { onConfirm: (reason: string) => void; onClose: () => void; submitting: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="font-bold text-[#5A305A] mb-1">Reject Memo</h3>
        <p className="text-xs text-[#5A305A] mb-4">The rejection reason will be saved in the memo notes.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Explain the reason for rejection..."
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={submitting} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={submitting || !reason.trim()}
            className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FarOverseasAirDetailModal({ record, onClose, onChanged }: { record: any; onClose: () => void; onChanged?: () => void }) {
  const { user, profile, canEdit, canApproveTier, approvalTiersByPage } = useAuth();
  const canEditDirectLoading = canEdit('direct_loading');
  // Reject HANYA boleh dilakukan user yang punya jabatan approval APA SAJA utk halaman ini (2026-09,
  // permintaan user) -- user yang cuma py akses edit halaman (canEditDirectLoading) tapi TIDAK
  // punya baris `user_approval_tiers` sama sekali utk `direct_loading` tidak boleh reject. TIDAK
  // ADA bypass isAdmin di sini, sama pola dgn `canApproveTier`.
  const canReject = !!approvalTiersByPage['direct_loading'];
  const [rec, setRec] = useState(record);
  const [signer, setSigner] = useState<SignerConfig | null>(null);
  const [showPoDetail, setShowPoDetail] = useState(false);
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
  const entryFor = (tier: ApprovalTier) => approvals.find(a => a.tier === tier);
  const picEntry = entryFor('PIC');
  const statusMeta = APPROVAL_STATUS_META[rec.approval_status] || APPROVAL_STATUS_META.PENDING;

  // Kolom "Disiapkan Oleh" tampilkan nama Exim Officer (approval tahap 1) DAN nama PIC
  // berdampingan format "exim/pic" -- nama PIC ambil dari approval PIC (kalau sudah approve,
  // sama pola dengan tier1/2/3: nama approver menggantikan default), fallback ke `pic_name`
  // manual selama belum ada yang approve. Kalau salah satunya belum ada, tampilkan yang ada saja.
  const eximName = entryFor(1)?.nama || null;
  const picDisplayName = picEntry?.nama || rec.pic_name || null;
  const disiapkanNama = eximName && picDisplayName ? `${eximName}/${picDisplayName}` : (eximName || picDisplayName || null);

  const nextStep = nextStepForStatus(rec.approval_status);

  const roleForStep = (step: ApprovalStep) => step === 'TIER1' ? signer?.tier1_role : step === 'PIC' ? 'PIC' : step === 'TIER2' ? signer?.tier2_role : signer?.tier3_role;
  const defaultNamaForStep = (step: ApprovalStep) => step === 'TIER1' || step === 'PIC' ? (profile?.nama || user?.email || '') : step === 'TIER2' ? (signer?.tier2_name || '') : (signer?.tier3_name || '');

  // Rantai approval WAJIB berurutan Prepared By -> PIC -> SPV -> Director (2026-09) -- SETIAP
  // tahap sekarang mengubah `approval_status` (beda dari versi lama, PIC dulu independen &
  // TIDAK mengubah status). Lewat RPC `approve_far_overseas_air` (SECURITY DEFINER, guard jabatan
  // + urutan status DI DALAM function-nya, lihat CLAUDE.md) -- BUKAN `.update()` langsung lagi,
  // supaya gating jabatan approval ditegakkan di server juga (bukan cuma sembunyikan tombol di
  // frontend). RPC ini balikin `{approval_status, approvals}` hasil akhir, dipakai APA ADANYA
  // buat update state lokal (bukan dihitung ulang di client) supaya selalu sinkron persis dgn DB.
  const handleApprove = async (step: ApprovalStep, nama: string) => {
    setSubmitting(true);
    const jabatan = step === 'PIC' ? 'PIC' : (roleForStep(step) || '-');
    const { data, error } = await supabase.rpc('approve_far_overseas_air', {
      p_id: rec.id,
      p_step: step,
      p_nama: nama,
      p_jabatan: jabatan,
    });
    setSubmitting(false);
    if (error || !data) {
      showToast('Failed to save approval: ' + (error?.message || 'unknown error'), 'error');
    } else {
      setRec({ ...rec, approval_status: data.approval_status, approvals: data.approvals });
      showToast(STEP_LABEL[step] + ' approval saved successfully.', 'success');
      onChanged?.();
    }
  };

  // Lewat RPC `reject_far_overseas_air` (SECURITY DEFINER, guard jabatan approval + status
  // saat ini DI DALAM function-nya, lihat CLAUDE.md) -- BUKAN `.update()` langsung lagi, supaya
  // batasan "cuma user berjabatan approval yang boleh reject" ditegakkan di server juga (bukan
  // cuma sembunyikan tombol di frontend), sama pola dengan `handleApprove`.
  const handleReject = async (reason: string) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('reject_far_overseas_air', { p_id: rec.id, p_reason: reason });
    setSubmitting(false);
    if (error || !data) {
      showToast('Failed to reject memo: ' + (error?.message || 'unknown error'), 'error');
    } else {
      setRec({ ...rec, approval_status: data.approval_status, notes: data.notes });
      setShowReject(false);
      showToast('Memo rejected.', 'success');
      onChanged?.();
    }
  };

  const parsedPoList = parseJsonField(rec.po_list);
  const poList: any[] = Array.isArray(parsedPoList) ? parsedPoList : [];
  const showIdrHint = rec.total_amount_currency && rec.total_amount_currency !== 'IDR' && rec.total_amount_idr != null;
  // Kurs implisit = total_amount_idr / total_amount (bukan field tersimpan terpisah -- `kurs_used`
  // ada di tabel tapi TIDAK SELALU sinkron dgn rasio total_amount_idr/total_amount aktual yang
  // tercetak, jadi dihitung ulang langsung dari 2 angka yang sama-sama tampil di baris ini).
  const kursValue = showIdrHint && rec.total_amount ? Number(rec.total_amount_idr) / Number(rec.total_amount) : null;

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
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Approval Memo — FAR Overseas Air</h2>
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

              {/* Field baris -- PO.No/Supplier (kiri) & Inv.No/Date (kanan) SENGAJA dipisah jadi
                  2 kolom independen (bukan 2 baris flex-row PO.No+Inv.No lalu Supplier+Date)
                  supaya Inv.No & Date tetap rapat berdekatan walau PO.No isinya panjang/wrap
                  banyak baris (mis. gabungan banyak PO) -- kalau digabung 1 baris, tinggi baris
                  itu ikut ketarik setinggi PO.No, jadi Date jadi jauh dari Inv.No di baris bawah. */}
              <div className="p-4 space-y-2 text-sm">
                <div className="flex flex-col md:flex-row print:flex-row md:items-start print:items-start gap-1 md:gap-6 print:gap-6">
                  <div className="flex-1 space-y-2"><MemoField label="PO. No." value={rec.po_ori || '-'} /><MemoField label="Supplier" value={rec.vendor || '-'} /></div>
                  <div className="md:w-56 print:w-56 space-y-2"><MemoField label="Inv. No" labelWidth="w-20" value={rec.no_invoice || '-'} /><MemoField label="Date" labelWidth="w-20" value={formatDateMemo(rec.created_at)} /></div>
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
                      {kursValue != null && <span className="font-normal italic text-[10px] text-[#5A305A]/70 ml-2">(Kurs: {kursValue.toLocaleString('id-ID', { maximumFractionDigits: 2 })})</span>}
                    </>
                  }
                />
              </div>

              {/* NOTE -- NOTE 1 (route_note) & NOTE 2 (item_description) datang dari ekstraksi
                  otomatis, NOTE 3 (status_note) & NOTE 4 (other_note) diisi manual dari List Memo.
                  Baris NOTE 3/4 HANYA muncul kalau diisi (bukan tampil kosong/"-") -- baris yang
                  null sama sekali tidak dirender. Tiap baris dikasih nomor sumbernya (1/2/3/4,
                  sesuai NOTE 1-4 di List Memo) di depan teksnya -- permintaan user supaya jelas
                  baris mana berasal dari NOTE keberapa. */}
              <div className="border-t-2 border-[#FFF5C5] p-4 text-sm flex gap-2">
                <span className="underline font-semibold shrink-0">NOTE :</span>
                <div className="space-y-1">
                  {rec.route_note && <p><span className="font-semibold">1.</span> {rec.route_note}</p>}
                  {rec.item_description && <p><span className="font-semibold">2.</span> {rec.item_description}</p>}
                  {rec.status_note && <p><span className="font-semibold">3.</span> {rec.status_note}</p>}
                  {rec.other_note && <p><span className="font-semibold">4.</span> {rec.other_note}</p>}
                  {!rec.route_note && !rec.item_description && !rec.status_note && !rec.other_note && <p className="text-[#5A305A]/50 italic">-</p>}
                </div>
              </div>

              {/* Signature table -- PIC (nama manual `pic_name`, jabatan tetap "PIC") ditaruh
                  bersebelahan dengan "Disiapkan Oleh" -- persetujuannya INDEPENDEN dari tahap
                  1/2/3, lihat tombol "Setujui — PIC" terpisah di bawah. */}
              <div className="flex border-t-2 border-[#FFF5C5] pt-6 pb-4 px-4">
                <SignatureColumn label="Disiapkan Oleh," role={signer?.tier1_role || null} entry={entryFor(1)} nameOverride={disiapkanNama} />
                <SignatureColumn label="Diperiksa Oleh," role={signer?.tier2_role || null} entry={entryFor(2)} defaultNama={signer?.tier2_name} />
                <SignatureColumn label="Diperiksa Oleh," role={signer?.tier3_role || null} entry={entryFor(3)} defaultNama={signer?.tier3_name} />
              </div>
            </div>

            {/* Note pembayaran -- DI LUAR tabel/kotak memo (bukan bagian replika resmi), tapi
                TETAP ikut tercetak (bukan print:hidden) & tampil di modal. Sengaja teks kecil. */}
            <p className="text-[11px] text-[#5A305A] mt-2 px-1">
              Note:
              <br />
              MOHON DIBANTU BAYARKAN PADA TANGGAL : <span className="font-semibold">{formatDateMemo(rec.expected_payment_date)}</span>
            </p>

            {/* ── Rincian PO (opsional, tidak masuk memo cetak) ── */}
            {poList.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 mt-5 overflow-hidden print:hidden">
                <button onClick={() => setShowPoDetail(s => !s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-bold text-[#5A305A]">PO Details ({poList.length})</span>
                  {showPoDetail ? <ChevronUp size={16} className="text-[#5A305A]" /> : <ChevronDown size={16} className="text-[#5A305A]" />}
                </button>
                {showPoDetail && (
                  <div className="border-t border-slate-200 divide-y divide-slate-100">
                    {poList.map((po, i) => (
                      <div key={i} className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><p className="text-[#5A305A]/60">PO No.</p><p className="font-semibold text-[#5A305A]">{po.po_no_raw || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Company</p><p className="font-semibold text-[#5A305A]">{po.company_code || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Vendor</p><p className="font-semibold text-[#5A305A]">{po.vendor_name || '-'}</p></div>
                        <div><p className="text-[#5A305A]/60">Value</p><p className="font-semibold text-[#5A305A]">{formatMoney(po.total_value, po.currency)}</p></div>
                        <div><p className="text-[#5A305A]/60">Weight</p><p className="font-semibold text-[#5A305A]">{po.weight_kg != null ? `${po.weight_kg} KG` : '-'}</p></div>
                        {po.item_summary && <div className="col-span-2 md:col-span-4"><p className="text-[#5A305A]/60">Item</p><p className="text-[#5A305A]">{po.item_summary}</p></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Catatan: vessel_internal_note SENGAJA TIDAK pernah dirender di sini atau di
                manapun pada memo cetak, field itu HANYA boleh tampil di kolom VESSEL tabel List
                Memo. Expected Payment Date sekarang sudah tercetak lewat note "MOHON DIBANTU
                BAYARKAN..." di atas, tidak perlu blok "Catatan Internal" terpisah lagi. */}

            {rec.approval_status === 'REJECTED' && rec.notes && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl mt-5 p-4 print:hidden">
                <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-1.5">Rejection Reason</p>
                <p className="text-sm text-rose-800">{rec.notes}</p>
              </div>
            )}

            {/* ── Aksi persetujuan -- rantai WAJIB berurutan Prepared By -> PIC -> SPV -> Director
                (2026-09). Tombol approve tahap berjalan HANYA muncul kalau user-nya eligible
                (`canApproveTier`, dari jabatan approval role-nya) -- kalau tidak eligible, tampil
                pesan penjelas (bukan disembunyikan total, supaya user tahu kenapa tidak ada
                tombol & tahap apa yang sedang ditunggu). ── */}
            {canEditDirectLoading && rec.approval_status !== 'APPROVED' && rec.approval_status !== 'REJECTED' && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 mt-5 p-4 print:hidden">
                <p className="text-xs text-[#5A305A]">
                  {nextStep != null ? `Awaiting ${STEP_LABEL[nextStep]} approval.` : 'No action available.'}
                  {nextStep != null && !canApproveTier('direct_loading', nextStep) && (
                    <span className="block text-[#5A305A]/60 italic mt-0.5">You don't have the "{STEP_LABEL[nextStep]}" approval role for this step.</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {canReject && (
                    <button onClick={() => setShowReject(true)} className="px-4 py-2 rounded-xl border border-rose-300 text-rose-600 font-semibold text-sm hover:bg-rose-50 transition-all flex items-center gap-1.5">
                      <Ban size={15} /> Reject
                    </button>
                  )}
                  {nextStep != null && canApproveTier('direct_loading', nextStep) && (
                    <button
                      onClick={() => handleApprove(nextStep, defaultNamaForStep(nextStep))}
                      disabled={submitting}
                      className="px-4 py-2 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Stamp size={15} /> {submitting ? 'Saving...' : STEP_ACTION_LABEL[nextStep]}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {showReject && (
        <RejectModal submitting={submitting} onClose={() => setShowReject(false)} onConfirm={handleReject} />
      )}
    </div>,
    document.body
  );
}