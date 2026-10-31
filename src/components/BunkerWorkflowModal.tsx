import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, CheckCircle2, XCircle, AlertTriangle, Info, Send, FlaskConical, FileText, Banknote, UploadCloud, ExternalLink,
  FileDown, Pencil, Printer, Ban, Plus, Loader2, FileSignature,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { parseJsonField, formatDateTimeID, logBunkerAudit, updateBunkerDokumen, friendlyDbError } from '../utils/BunkerHelpers';
import {
  fetchSyaratSubmit, fetchDokumenWajibAktif, fetchDokumenWajibSemua, submitKeFinance, fetchRingkasanPembayaran, fetchPembayaran,
  catatPembayaran, cariUrlBukti, fetchTahapSatu, fetchPejabatAktif, fetchDaftarBa, fetchBaById, fetchTipeBaDisarankan, ubahStatusBa,
  formatUang, labStatusEfektif, lihatLabDetail, lihatNilaiTagihan, errMsg,
  LAB_META, PEMBAYARAN_META, TAHAP_META,
  type SyaratSubmit, type DokumenWajib, type RingkasanPembayaran, type PembayaranRow, type TahapBayar, type TahapBunker,
} from '../utils/bunkerWorkflow';
import { parseAngka, type BaRow, type PejabatBa } from '../utils/bunkerBa';
import { formatTanggalID, JUDUL_BA, type TipeBa } from '../utils/bunkerBaText';
import { unduhBaDocx } from '../utils/bunkerBaDocx';
import BunkerUploadModal, { type BunkerJenisHint } from './BunkerUploadModal';
import BunkerBaFormModal from './BunkerBaFormModal';

const inp = 'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-[#5A305A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] disabled:bg-slate-50';
const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5';
const btnPrimary = `${btn} bg-[#5A305A] hover:bg-[#73507B] text-white`;
const btnGhost = `${btn} border border-slate-200 bg-white text-[#5A305A] hover:bg-slate-50`;

// Dokumen non-AI: ditandai lewat dokumen_manual. SPB/Approval/Foto saat ini belum berlaku (bunker_dokumen_wajib.aktif = false) -> hanya disiapkan.
const DOKUMEN_MANUAL = ['spb', 'approval', 'foto'];

// Slot upload dokumen pembayaran -> jenis_hint yang dikirim ke n8n.
const SLOT_LABEL: Record<BunkerJenisHint, string> = {
  bt_dpp: 'Transfer proof — DPP (or full payment)', bt_ppn: 'Transfer proof — PPN', bpe: 'BPE', a2: 'Lampiran A2',
};
const TAHAP_BAYAR_LABEL: Record<TahapBayar, string> = { DPP: 'DPP', PPN: 'PPN', FULL: 'Full payment (no PPN)' };

function Card({ icon: Icon, title, right, children }: { icon: React.ElementType; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-[#5A305A] uppercase tracking-wider flex items-center gap-2"><Icon size={14} />{title}</h3>
        {right}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

const CheckRow: React.FC<{ ok: boolean; label: string; note?: string; optional?: boolean }> = ({ ok, label, note, optional }) => {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : optional ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
      {ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <span className="font-semibold">{label}</span>{optional && <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">Optional</span>}
        {note && <p className="text-[11px] opacity-80 mt-0.5">{note}</p>}
      </div>
    </div>
  );
};

export default function BunkerWorkflowModal({ record, onClose, onChanged, canEdit }: {
  record: any; onClose: () => void; onChanged?: () => void; canEdit: boolean;
}) {
  const { user } = useAuth();
  const [rec, setRec] = useState<any>(record);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [syarat, setSyarat] = useState<SyaratSubmit | null>(null);
  const [wajib, setWajib] = useState<DokumenWajib[]>([]);
  const [wajibSemua, setWajibSemua] = useState<DokumenWajib[]>([]);
  const [tahap, setTahap] = useState<TahapBunker | null>(null);
  const [ringkasan, setRingkasan] = useState<RingkasanPembayaran | null>(null);
  const [bayar, setBayar] = useState<PembayaranRow[]>([]);
  const [baList, setBaList] = useState<BaRow[]>([]);
  const [pejabat, setPejabat] = useState<PejabatBa[]>([]);
  const [tipeSaran, setTipeSaran] = useState<TipeBa | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [baForm, setBaForm] = useState<{ ba: BaRow | null; tipe: TipeBa } | null>(null);
  const [upload, setUpload] = useState<{ jenis: BunkerJenisHint | null; forPayment: boolean } | null>(null);
  const [job, setJob] = useState<{ id: string; status: 'PENDING' | 'SUCCESS' | 'FAILED'; error?: string } | null>(null);

  const kelengkapan = parseJsonField(rec.kelengkapan_status) || {};
  const dokumenManual = parseJsonField(rec.dokumen_manual) || {};
  const submitted = !!rec.submitted_to_finance_at;
  const nilai = lihatNilaiTagihan(rec);
  const lab = lihatLabDetail(rec);
  const labEff = labStatusEfektif(rec);
  const mataUang = (ringkasan?.mata_uang || nilai.mata_uang || 'IDR').toUpperCase();
  const editable = canEdit && !submitted;

  const showToast = (msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const reload = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!opts.quiet) setLoading(true);
    const { data: fresh } = await supabase.from('bunker_dokumen').select('*').eq('id', record.id).maybeSingle();
    const cur = fresh ?? record;
    if (fresh) setRec(fresh);
    const [s, w, t, ba] = await Promise.all([
      fetchSyaratSubmit(record.id), fetchDokumenWajibAktif(), fetchTahapSatu(record.id), fetchDaftarBa(record.id),
    ]);
    if (s.data) setSyarat(s.data);
    setWajib(w.data);
    setTahap(t);
    setBaList(ba.data);
    if (cur.submitted_to_finance_at) {
      const [r, p] = await Promise.all([fetchRingkasanPembayaran(record.id), fetchPembayaran(record.id)]);
      setRingkasan(r.data);
      setBayar(p.data);
    }
    if (!opts.quiet) setLoading(false);
  }, [record]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    fetchDokumenWajibSemua().then(r => setWajibSemua(r.data));
    fetchPejabatAktif().then(r => setPejabat(r.data));
  }, []);
  useEffect(() => {
    if (syarat?.ba_wajib) fetchTipeBaDisarankan(record.id).then(setTipeSaran);
  }, [syarat?.ba_wajib, record.id, rec.perlu_test_lab, rec.lab_status, rec.lab_status_manual]);

  // Polling job upload (dokumen pembayaran / BA bertandatangan) -- begitu selesai, muat ulang agar kelengkapan_status & syarat ter-update.
  useEffect(() => {
    if (!job || job.status !== 'PENDING') return;
    const iv = setInterval(async () => {
      const { data } = await supabase.from('bunker_processing_queue').select('*').eq('id', job.id).maybeSingle();
      if (!data) return;
      if (data.status === 'SUCCESS') { setJob({ id: job.id, status: 'SUCCESS' }); await reload({ quiet: true }); onChanged?.(); }
      else if (data.status === 'FAILED') setJob({ id: job.id, status: 'FAILED', error: data.error_message || 'Failed to process document.' });
    }, 4000);
    return () => clearInterval(iv);
  }, [job, reload, onChanged]);

  const afterChange = async () => { await reload({ quiet: true }); onChanged?.(); };

  // ── Keputusan test lab & dokumen manual (kolom milik APLIKASI) ──
  const simpanKolom = async (updates: Record<string, any>, logs: { field_label: string; old_value: string | null; new_value: string | null }[]) => {
    setBusy('kolom');
    const { error } = await updateBunkerDokumen(rec.id, updates);
    setBusy(null);
    if (error) { showToast(friendlyDbError('Failed to save: ' + error.message), 'error'); return false; }
    setRec((p: any) => ({ ...p, ...updates }));
    logBunkerAudit(rec.no_po, user?.email, logs);
    await afterChange();
    return true;
  };
  const labKeputusanLabel = (v: boolean | null) => (v == null ? null : v ? 'Needs lab test' : 'No lab test needed');
  const setPerluLab = (v: boolean) => simpanKolom({ perlu_test_lab: v },
    [{ field_label: 'Test Lab Decision', old_value: labKeputusanLabel(rec.perlu_test_lab), new_value: labKeputusanLabel(v) }]);

  const [alasan, setAlasan] = useState<string>(rec.lab_menyusul_alasan || '');
  const simpanMenyusul = (aktif: boolean) => {
    if (aktif && !alasan.trim()) { showToast('Reason is required when the lab result will follow.', 'error'); return; }
    return simpanKolom({ lab_menyusul: aktif, lab_menyusul_alasan: aktif ? alasan.trim() : null },
      [{ field_label: 'Lab Result Follows', old_value: rec.lab_menyusul ? (rec.lab_menyusul_alasan || 'yes') : 'no', new_value: aktif ? alasan.trim() : 'no' }]);
  };
  const setLabManual = (v: '' | 'ONSPEC' | 'OFFSPEC') => simpanKolom({ lab_status_manual: v || null },
    [{ field_label: 'Lab Status (manual)', old_value: rec.lab_status_manual || null, new_value: v || null }]);

  const toggleManual = (kode: string, ada: boolean) => {
    const fresh = parseJsonField(rec.dokumen_manual) || {};
    const merged = { ...fresh };
    if (ada) merged[kode] = true; else delete merged[kode];
    return simpanKolom({ dokumen_manual: merged }, [{ field_label: `Manual Document: ${kode}`, old_value: fresh[kode] ? 'present' : 'absent', new_value: ada ? 'present' : 'absent' }]);
  };

  // ── Submit ke Finance ──
  const handleSubmit = async () => {
    setSubmitError(null);
    setBusy('submit');
    const { error } = await submitKeFinance(rec.id, user?.email);
    setBusy(null);
    if (error) { setSubmitError(errMsg(error)); await reload({ quiet: true }); return; }
    logBunkerAudit(rec.no_po, user?.email, [{ field_label: 'Submit to Finance', old_value: null, new_value: 'submitted' }]);
    showToast('Sent to Finance.', 'success');
    await afterChange();
  };

  // ── Pembayaran ──
  const adaPpn = ringkasan?.ada_ppn ?? nilai.ada_ppn ?? null;
  const opsiTahap: TahapBayar[] = adaPpn === true ? ['DPP', 'PPN'] : adaPpn === false ? ['FULL'] : ['DPP', 'PPN', 'FULL'];
  const [form, setForm] = useState<{ tahap: TahapBayar; nominal: string; tgl: string; ref: string; catatan: string; bukti: string }>({ tahap: 'DPP', nominal: '', tgl: '', ref: '', catatan: '', bukti: '' });
  const nominalDiedit = React.useRef(false);
  useEffect(() => { if (!opsiTahap.includes(form.tahap)) setForm(f => ({ ...f, tahap: opsiTahap[0] })); }, [adaPpn]); // eslint-disable-line react-hooks/exhaustive-deps
  const sisaTahap = useMemo(() => {
    if (!ringkasan) return null;
    return form.tahap === 'DPP' ? ringkasan.sisa.dpp : form.tahap === 'PPN' ? ringkasan.sisa.ppn : ringkasan.sisa.total;
  }, [ringkasan, form.tahap]);
  useEffect(() => {
    if (!nominalDiedit.current) setForm(f => ({ ...f, nominal: sisaTahap && sisaTahap > 0 ? String(sisaTahap) : '' }));
  }, [sisaTahap]);

  const handleCatat = async () => {
    setPayError(null);
    const nominal = parseAngka(form.nominal);
    if (!nominal || nominal <= 0) { setPayError('Enter a transfer amount greater than 0.'); return; }
    setBusy('bayar');
    const { error } = await catatPembayaran({
      bunker_dokumen_id: rec.id, tahap: form.tahap, nominal, mata_uang: mataUang, tgl_transfer: form.tgl || null,
      no_referensi: form.ref.trim() || null, catatan: form.catatan.trim() || null, bukti_filename: form.bukti.trim() || null,
      dicatat_oleh: user?.email ?? null,
    });
    setBusy(null);
    if (error) { setPayError(errMsg(error)); return; } // pesan database apa adanya
    logBunkerAudit(rec.no_po, user?.email, [{ field_label: `Payment ${form.tahap}`, old_value: null, new_value: formatUang(nominal, mataUang) }]);
    nominalDiedit.current = false;
    setForm(f => ({ ...f, nominal: '', tgl: '', ref: '', catatan: '', bukti: '' }));
    showToast('Transfer recorded.', 'success');
    await afterChange(); // status_pembayaran dihitung trigger database -- cukup muat ulang
  };

  const bptAda = !!kelengkapan.bpe && !!kelengkapan.a2;
  const sudahDpp = bayar.some(b => b.tahap === 'DPP');
  const slots: { jenis: BunkerJenisHint; aktif: boolean; alasanNonaktif?: string }[] = adaPpn === false
    ? [{ jenis: 'bt_dpp', aktif: true }]
    : [
      { jenis: 'bt_dpp', aktif: true },
      { jenis: 'bpe', aktif: sudahDpp || adaPpn == null, alasanNonaktif: 'Available after the DPP transfer is recorded' },
      { jenis: 'a2', aktif: sudahDpp || adaPpn == null, alasanNonaktif: 'Available after the DPP transfer is recorded' },
      { jenis: 'bt_ppn', aktif: bptAda, alasanNonaktif: 'Requires BPE and Lampiran A2 to be uploaded first' },
    ];

  // ── Berita Acara ──
  const baAktif = baList.find(b => b.status !== 'DIBATALKAN') ?? null;
  const butuhBa = !!syarat?.ba_wajib && !kelengkapan.ba;
  const tipeDefault: TipeBa = tipeSaran ?? (rec.perlu_test_lab === true ? 'TANPA_POTONGAN' : 'TANPA_LAB');

  const unduhBa = async (id: string) => {
    setBusy('dl-' + id);
    const { data, error } = await fetchBaById(id); // dari data TERSIMPAN
    if (error || !data) { setBusy(null); showToast(error ? errMsg(error) : 'BA not found.', 'error'); return; }
    try { await unduhBaDocx(data.tipe, data.nomor_ba || '', data.tanggal, data.isi); } catch (e) { showToast('Failed to build the Word file: ' + errMsg(e), 'error'); }
    setBusy(null);
  };
  const ubahBaStatus = async (b: BaRow, status: 'DICETAK' | 'DIBATALKAN') => {
    const pesan = status === 'DICETAK'
      ? `Mark BA ${b.nomor_ba} as printed? Its content will be locked and can no longer be edited.`
      : `Cancel BA ${b.nomor_ba}? This cannot be undone and the number will not be reused.`;
    if (!confirm(pesan)) return;
    setBusy('ba-' + b.id);
    const { error } = await ubahStatusBa(b.id, status);
    setBusy(null);
    if (error) { showToast(errMsg(error), 'error'); return; }
    logBunkerAudit(rec.no_po, user?.email, [{ field_label: `Berita Acara ${b.nomor_ba}`, old_value: b.status, new_value: status }]);
    await afterChange();
  };

  const kurangKodeWajib = new Set(wajib.map(w => w.kode));
  const kurangLain = (syarat?.kurang ?? []).filter(k => !kurangKodeWajib.has(k.kode));
  const tahapMeta = tahap ? TAHAP_META[tahap] : null;
  const statusBayarMeta = PEMBAYARAN_META[(rec.status_pembayaran as keyof typeof PEMBAYARAN_META) || 'BELUM BAYAR'] ?? PEMBAYARAN_META['BELUM BAYAR'];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
      <div className="bg-slate-50 w-full max-w-3xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-start gap-3 p-4 sm:px-6 border-b border-slate-200 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#5A305A]">Submit & Payment</h2>
            <p className="text-xs text-[#5A305A]/70 truncate">No PO: {rec.no_po || '-'} · {rec.vendor || '-'}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {tahapMeta && <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${tahapMeta.badgeClass}`}>{tahapMeta.label}</span>}
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusBayarMeta.badgeClass}`}>Payment: {statusBayarMeta.label}</span>
              {labEff && <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LAB_META[labEff].badgeClass}`}>{LAB_META[labEff].label}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] shrink-0"><X size={20} /></button>
        </div>

        {toast && (
          <div className={`mx-5 mt-3 p-2.5 rounded-lg border text-xs font-medium shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{toast.msg}</div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {job && (
            <div className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${job.status === 'PENDING' ? 'bg-amber-50 border-amber-200 text-amber-800' : job.status === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {job.status === 'PENDING' ? <Loader2 size={14} className="animate-spin" /> : job.status === 'SUCCESS' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span className="font-semibold">{job.status === 'PENDING' ? 'Document being processed by AI...' : job.status === 'SUCCESS' ? 'Document processed and merged into this PO.' : `Failed to process the document. ${job.error || ''}`}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center text-[#5A305A] text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Loading data...</div>
          ) : (<>
            {/* ── 1. Kelengkapan & Submit ── */}
            <Card icon={Send} title="Completeness & Submit to Finance">
              {!syarat ? (
                <p className="text-xs text-rose-700">Could not load the submit requirements. Make sure bunker_update_beehive.sql has been run.</p>
              ) : (<>
                <div className="grid sm:grid-cols-2 gap-2">
                  {wajib.map(w => <CheckRow key={w.kode} ok={!syarat.kurang.some(k => k.kode === w.kode)} label={w.nama} />)}
                  <CheckRow ok={!!kelengkapan.kwi} optional label="Receipt (Kwitansi)" />
                </div>
                <div className="space-y-2">
                  {rec.perlu_test_lab != null && !syarat.kurang.some(k => k.kode === 'tentukan_test_lab') && (
                    <CheckRow ok label={`Test lab decision: ${rec.perlu_test_lab ? 'lab test needed' : 'no lab test needed'}`} />
                  )}
                  {syarat.lab_wajib && !syarat.kurang.some(k => k.kode === 'lab') && <CheckRow ok label="Lab result" note={labEff ? `Status: ${labEff}` : undefined} />}
                  {syarat.ba_wajib && !syarat.kurang.some(k => k.kode === 'ba') && <CheckRow ok label="Berita Acara" />}
                  {kurangLain.map(k => <CheckRow key={k.kode} ok={false} label={k.nama} note={k.alasan} />)}
                  {syarat.kurang.filter(k => kurangKodeWajib.has(k.kode)).length > 0 && (
                    <p className="text-[11px] text-rose-700">Missing required documents: {syarat.kurang.filter(k => kurangKodeWajib.has(k.kode)).map(k => k.nama).join(', ')}.</p>
                  )}
                  {syarat.info.map(i => (
                    <div key={i.kode} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs"><Info size={14} className="shrink-0 mt-0.5" /><span>{i.pesan}</span></div>
                  ))}
                </div>

                {submitted ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Sent to Finance on {formatDateTimeID(rec.submitted_to_finance_at)} by {rec.submitted_by || '-'}
                  </div>
                ) : canEdit ? (
                  <div className="space-y-2">
                    <button onClick={handleSubmit} disabled={!syarat.boleh_submit || busy === 'submit'} className={btnPrimary + ' w-full justify-center py-2.5 text-sm'}>
                      {busy === 'submit' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to Finance
                    </button>
                    {!syarat.boleh_submit && <p className="text-[11px] text-rose-700 flex items-center gap-1"><AlertTriangle size={12} /> Not ready: {syarat.kurang.map(k => k.nama).join(', ')}.</p>}
                    {submitError && <div className="rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs p-2.5 break-words">{submitError}</div>}
                  </div>
                ) : null}
              </>)}
            </Card>

            {/* ── 2. Keputusan test lab ── */}
            <Card icon={FlaskConical} title="Test Lab Decision" right={labEff ? <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LAB_META[labEff].badgeClass}`}>{LAB_META[labEff].label}</span> : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#5A305A]">This PO:</span>
                {rec.perlu_test_lab == null && <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Not decided yet</span>}
                {[{ v: true, l: 'Needs lab test' }, { v: false, l: 'No lab test needed' }].map(o => (
                  <button key={String(o.v)} disabled={!editable || busy === 'kolom'} onClick={() => rec.perlu_test_lab !== o.v && setPerluLab(o.v)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all disabled:cursor-not-allowed ${rec.perlu_test_lab === o.v ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white border-slate-200 text-[#5A305A]/70 hover:bg-slate-50'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {submitted && <p className="text-[11px] text-slate-500">Locked: already sent to Finance.</p>}

              {rec.perlu_test_lab === true && !kelengkapan.lab && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#5A305A]">
                    <input type="checkbox" disabled={!editable || busy === 'kolom'} checked={!!rec.lab_menyusul} onChange={e => simpanMenyusul(e.target.checked)} />
                    Lab result will follow (short credit term)
                  </label>
                  <textarea className={inp} rows={2} disabled={!editable} value={alasan} onChange={e => setAlasan(e.target.value)} placeholder="Reason (required), e.g. short credit term" />
                  {editable && rec.lab_menyusul && alasan.trim() !== (rec.lab_menyusul_alasan || '') && (
                    <button onClick={() => simpanMenyusul(true)} className={btnPrimary}>Save reason</button>
                  )}
                </div>
              )}

              {rec.perlu_test_lab === true && kelengkapan.lab && !rec.lab_status && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                  <AlertTriangle size={14} /> The ONSPEC / OFFSPEC status could not be read automatically — set it manually:
                  {(['ONSPEC', 'OFFSPEC'] as const).map(v => (
                    <button key={v} disabled={!editable || busy === 'kolom'} onClick={() => setLabManual(rec.lab_status_manual === v ? '' : v)}
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${rec.lab_status_manual === v ? LAB_META[v].badgeClass + ' border-transparent ring-2 ring-[#5A305A]/30' : 'bg-white border-slate-200 text-[#5A305A]/70'}`}>{v}</button>
                  ))}
                </div>
              )}

              {(lab.penyedia || lab.tgl_report || lab.kesimpulan || lab.param_offspec) && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1 text-[#5A305A]">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Lab report summary</p>
                  {lab.penyedia && <p><span className="opacity-60">Provider:</span> {lab.penyedia}</p>}
                  {lab.tgl_report && <p><span className="opacity-60">Report date:</span> {lab.tgl_report}</p>}
                  {lab.nomor_sample && <p><span className="opacity-60">Sample no.:</span> {lab.nomor_sample}</p>}
                  {lab.kesimpulan && <p><span className="opacity-60">Conclusion:</span> {lab.kesimpulan}</p>}
                  {lab.param_offspec && <p className="text-rose-700"><span className="opacity-60 text-[#5A305A]">Out-of-limit parameters:</span> {lab.param_offspec}</p>}
                </div>
              )}

              {!kelengkapan.ba && labEff === 'OFFSPEC' && rec.perlu_test_lab === true && (
                <p className="text-xs text-rose-700 flex items-center gap-1.5"><AlertTriangle size={13} /> Lab result is OFFSPEC: a “Pembayaran Bunker Tanpa Pemotongan” Berita Acara is required.</p>
              )}
              {!kelengkapan.ba && rec.perlu_test_lab === false && (
                <p className="text-xs text-rose-700 flex items-center gap-1.5"><AlertTriangle size={13} /> No lab test: a “Pembayaran Bunker Tanpa Hasil Tes Laboratorium” Berita Acara is required.</p>
              )}
            </Card>

            {/* ── 3. Berita Acara ── */}
            {(butuhBa || baList.length > 0) && (
              <Card icon={FileSignature} title="Berita Acara (BA)" right={canEdit && butuhBa && !baAktif ? (
                <button onClick={() => setBaForm({ ba: null, tipe: tipeDefault })} className={btnPrimary}><Plus size={13} /> Create Berita Acara</button>
              ) : undefined}>
                {butuhBa && !tipeSaran && !baAktif && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> BA type cannot be determined from the test lab decision / lab result — you will choose it manually.</p>
                )}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[11px] text-blue-800 flex gap-2"><Info size={13} className="shrink-0 mt-0.5" />
                  <span>Print, sign, then upload the signed BA so it is recorded as complete. A BA created here is not counted until the signed copy is uploaded and read.</span></div>
                {baList.length === 0 ? <p className="text-xs italic text-[#5A305A]/60">No BA created yet.</p> : (
                  <div className="space-y-2">
                    {baList.map(b => (
                      <div key={b.id} className={`rounded-lg border p-3 text-xs ${b.status === 'DIBATALKAN' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-[#5A305A] break-all">{b.nomor_ba}</p>
                            <p className="text-[11px] text-[#5A305A]/70">{formatTanggalID(b.tanggal)} · {JUDUL_BA[b.tipe].replace('PEMBAYARAN BUNKER ', '')} · by {b.dibuat_oleh || '-'}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${b.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' : b.status === 'DICETAK' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{b.status === 'DRAFT' ? 'Draft' : b.status === 'DICETAK' ? 'Printed' : 'Cancelled'}</span>
                        </div>
                        {b.status !== 'DIBATALKAN' && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {canEdit && b.status === 'DRAFT' && <button onClick={() => setBaForm({ ba: b, tipe: b.tipe })} className={btnGhost}><Pencil size={12} /> Edit</button>}
                            <button onClick={() => unduhBa(b.id)} disabled={busy === 'dl-' + b.id} className={btnGhost}>{busy === 'dl-' + b.id ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} Download Word</button>
                            {canEdit && b.status === 'DRAFT' && <button onClick={() => ubahBaStatus(b, 'DICETAK')} disabled={busy === 'ba-' + b.id} className={btnGhost}><Printer size={12} /> Mark as printed</button>}
                            {canEdit && <button onClick={() => ubahBaStatus(b, 'DIBATALKAN')} disabled={busy === 'ba-' + b.id} className={btnGhost + ' !text-rose-600 !border-rose-200'}><Ban size={12} /> Cancel</button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && baAktif && !kelengkapan.ba && (
                  <button onClick={() => setUpload({ jenis: null, forPayment: false })} className={btnGhost}><UploadCloud size={13} /> Upload signed BA</button>
                )}
              </Card>
            )}

            {/* ── 4. Dokumen non-AI ── */}
            {wajibSemua.some(w => DOKUMEN_MANUAL.includes(w.kode)) && (
              <Card icon={FileText} title="Other Documents (manual mark)">
                <p className="text-[11px] text-[#5A305A]/70">These documents are not read by AI. Mark them as present manually. They only block submission once switched on in the required-documents table.</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {wajibSemua.filter(w => DOKUMEN_MANUAL.includes(w.kode)).map(w => {
                    const ada = !!dokumenManual[w.kode];
                    return (
                      <label key={w.kode} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${ada ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-[#5A305A]'}`}>
                        <input type="checkbox" checked={ada} disabled={!editable || busy === 'kolom'} onChange={e => toggleManual(w.kode, e.target.checked)} />
                        <span className="min-w-0">{w.nama}<span className="block text-[10px] font-normal opacity-60">{w.aktif ? 'Required' : 'Not required yet'} · manual</span></span>
                      </label>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ── 5. Pembayaran ── */}
            {submitted && (
              <Card icon={Banknote} title="Payment" right={<span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusBayarMeta.badgeClass}`}>{statusBayarMeta.label}</span>}>
                {ringkasan ? (
                  <div className="grid sm:grid-cols-3 gap-2 text-xs">
                    {[
                      ['Invoice amount', adaPpn === false ? { total: ringkasan.tagihan.total } : { dpp: ringkasan.tagihan.dpp, ppn: ringkasan.tagihan.ppn, total: ringkasan.tagihan.total }],
                      ['Paid', adaPpn === false ? { full: ringkasan.dibayar.full + ringkasan.dibayar.dpp } : { dpp: ringkasan.dibayar.dpp, ppn: ringkasan.dibayar.ppn, full: ringkasan.dibayar.full }],
                      ['Remaining', adaPpn === false ? { total: ringkasan.sisa.total } : { dpp: ringkasan.sisa.dpp, ppn: ringkasan.sisa.ppn, total: ringkasan.sisa.total }],
                    ].map(([judul, nilaiObj]) => (
                      <div key={judul as string} className="rounded-lg border border-slate-200 bg-white p-3 space-y-0.5 text-[#5A305A]">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">{judul as string}</p>
                        {Object.entries(nilaiObj as Record<string, number | null>).map(([k, v]) => (
                          <p key={k} className="flex justify-between gap-2"><span className="opacity-60 uppercase">{k}</span><span className="font-semibold">{formatUang(v, ringkasan.mata_uang)}</span></p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-rose-700">Could not load the payment summary.</p>}
                {adaPpn == null && <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> VAT (PPN) was not read from the invoice — all stages are offered; the database validates your choice.</p>}

                {/* Slot dokumen pembayaran (jenis_hint) */}
                {canEdit && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {slots.map(s => {
                      const ada = !!kelengkapan[s.jenis];
                      return (
                        <div key={s.jenis} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${ada ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                          <span className="flex items-center gap-1.5 font-semibold text-[#5A305A] min-w-0">{ada ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <XCircle size={13} className="text-slate-300 shrink-0" />}<span className="truncate" title={s.aktif ? undefined : s.alasanNonaktif}>{adaPpn === false && s.jenis === 'bt_dpp' ? 'Transfer proof (full payment)' : SLOT_LABEL[s.jenis]}</span></span>
                          <button disabled={!s.aktif} title={s.aktif ? undefined : s.alasanNonaktif} onClick={() => setUpload({ jenis: s.jenis, forPayment: true })} className={btnGhost}><UploadCloud size={12} /> Upload</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Form catat transfer */}
                {canEdit && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <p className="text-xs font-bold text-[#5A305A]">Record transfer</p>
                    <div className="grid sm:grid-cols-4 gap-2">
                      <label className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Stage</span>
                        <select className={inp} value={form.tahap} onChange={e => { nominalDiedit.current = false; setForm(f => ({ ...f, tahap: e.target.value as TahapBayar })); }}>
                          {opsiTahap.map(t => <option key={t} value={t}>{TAHAP_BAYAR_LABEL[t]}</option>)}
                        </select></label>
                      <label className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Amount ({mataUang})</span>
                        <input type="number" step="0.01" min="0" className={inp} value={form.nominal} onChange={e => { nominalDiedit.current = true; setForm(f => ({ ...f, nominal: e.target.value })); }} /></label>
                      <label className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Transfer date</span>
                        <input type="date" className={inp} value={form.tgl} onChange={e => setForm(f => ({ ...f, tgl: e.target.value }))} /></label>
                      <label className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Reference no.</span>
                        <input className={inp} value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} /></label>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <label className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Notes</span>
                        <input className={inp} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} /></label>
                      <div className="block"><span className="block text-[11px] font-semibold text-[#5A305A] mb-1">Proof file</span>
                        <div className="flex gap-1.5">
                          <input className={inp} value={form.bukti} onChange={e => setForm(f => ({ ...f, bukti: e.target.value }))} placeholder="File name (filled after upload)" />
                          <button type="button" onClick={() => setUpload({ jenis: form.tahap === 'PPN' ? 'bt_ppn' : 'bt_dpp', forPayment: true })} className={btnGhost + ' shrink-0'}><UploadCloud size={12} /> Upload</button>
                        </div></div>
                    </div>
                    {payError && <div className="rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs p-2.5 break-words">{payError}</div>}
                    <button onClick={handleCatat} disabled={busy === 'bayar'} className={btnPrimary}>{busy === 'bayar' ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />} Record transfer</button>
                  </div>
                )}

                {/* Daftar transfer */}
                {bayar.length === 0 ? <p className="text-xs italic text-[#5A305A]/60">No transfers recorded yet.</p> : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-[11px] text-[#5A305A]">
                      <thead><tr className="bg-slate-50 text-[10px] uppercase text-[#5A305A]/70">
                        {['Stage', 'Amount', 'Date', 'Reference', 'Recorded by', 'Proof'].map(h => <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {bayar.map(b => {
                          const url = cariUrlBukti(rec.source_files, b.bukti_filename);
                          return (
                            <tr key={b.id}>
                              <td className="px-3 py-2 font-bold">{b.tahap}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{formatUang(b.nominal, b.mata_uang)}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{b.tgl_transfer ? formatTanggalID(b.tgl_transfer) : '-'}</td>
                              <td className="px-3 py-2">{b.no_referensi || '-'}{b.catatan && <span className="block opacity-60">{b.catatan}</span>}</td>
                              <td className="px-3 py-2">{b.dicatat_oleh || '-'}<span className="block opacity-60">{formatDateTimeID(b.created_at)}</span></td>
                              <td className="px-3 py-2">
                                {!b.bukti_filename ? '-' : url
                                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"><ExternalLink size={11} /> {b.bukti_filename}</a>
                                  : <span className="text-slate-400" title={b.bukti_filename}>Preview unavailable</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </>)}
        </div>
      </div>

      {baForm && (
        <BunkerBaFormModal
          dokumen={rec} ba={baForm.ba} tipeAwal={baForm.tipe} tipeDisarankan={tipeSaran} pejabat={pejabat}
          onClose={() => setBaForm(null)}
          onSaved={() => { reload({ quiet: true }); onChanged?.(); }}
        />
      )}

      {upload && (
        <BunkerUploadModal
          noPoHint={upload.forPayment ? (rec.no_po_key || rec.no_po) : rec.no_po}
          jenisHint={upload.jenis ?? undefined}
          jenisLabel={upload.jenis ? SLOT_LABEL[upload.jenis] : undefined}
          onClose={() => setUpload(null)}
          onJobStarted={id => setJob({ id, status: 'PENDING' })}
          onSentNoJob={(msg, warn) => showToast(msg, warn ? 'error' : 'success')}
          onUploaded={names => { if ((upload.jenis === 'bt_dpp' || upload.jenis === 'bt_ppn') && names[0]) setForm(f => ({ ...f, bukti: names[0] })); }}
        />
      )}
    </div>
  );
}
