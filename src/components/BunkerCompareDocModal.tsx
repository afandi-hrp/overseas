import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, ListChecks, ClipboardList, Save, ShieldCheck, CheckCircle2, XCircle, RotateCcw, Printer } from 'lucide-react';
import {
  parseJsonField, getMatrixColumns, resolveAcuanColumnKey, summaryStatusMeta,
  STATUS_WORKFLOW_OPTIONS, workflowMeta, rowStatusClass, rowStatusMeta, updateBunkerDokumen,
  setStatusManualEntry, clearStatusManualEntry, friendlyDbError, formatDateTimeID,
  computeMatrixMatchStats, logBunkerAudit,
} from '../utils/BunkerHelpers';
import { useAuth } from '../lib/AuthContext';

type TableKelengkapanGroup = { group: string; items: { label: string; val: string | null }[] };
type RowStatus = 'Match' | 'Warning' | 'Mismatch';
type MatrixRow = {
  field: string; acuan_label?: string | null;
  po?: string | null; si?: string | null; kwi?: string | null; inv?: string | null; fp?: string | null; br?: string | null; ts?: string | null;
  row_status?: RowStatus | null; row_reason?: string | null;
};

// Value di table_kelengkapan.items[].val dan matrix_perbandingan[].<kolom> SERING berisi HTML
// mentah (span berwarna pakai var(--success)/var(--error)/var(--warning-color), .page-ref, dst)
// dari backend sendiri (bukan input user bebas) -- WAJIB dirender apa adanya, jangan di-escape,
// atau yang muncul di layar cuma teks tag <span> mentah.
// Tandai literal "⚙️ Calc: <angka>" (penanda nilai hasil kalkulasi otomatis, bukan dari
// dokumen asli) jadi warna beda (#F58C77) + baris baru di antara label & angkanya, supaya
// kelihatan jelas bedanya dari teks lain di sel yang sama. Angka ikut diwarnai sama (bukan
// cuma labelnya) -- ditempel pakai class (bukan style inline) jadi TIDAK ketiban aturan
// .bunker-html-value di index.css yang memaksa warna default #5A305A.
function highlightCalcMarker(html: string): string {
  return html.replace(/⚙️\s*Calc:\s*([\d.,]+)/g, (_m, num: string) =>
    `<span class="bunker-calc-marker">⚙️ Calc:</span><br/><span class="bunker-calc-marker">${num}</span>`);
}

function HtmlValue({ html }: { html: string | null | undefined }) {
  if (html == null || html === '') return <span className="italic text-slate-400">-</span>;
  // class "bunker-html-value" (lihat index.css) memaksa semua teks di dalam HTML mentah ini
  // pakai #5A305A -- KECUALI span yang backend sendiri warnai pakai var(--success)/
  // var(--error)/var(--warning-color), supaya badge hijau/merah/kuningnya tetap kebaca.
  return <span className="bunker-html-value" dangerouslySetInnerHTML={{ __html: highlightCalcMarker(html) }} />;
}

// no_po/vendor/kapal di bunker_dokumen kadang ikut membawa suffix "(Hal N)" -- referensi nomor
// halaman dokumen sumber tempat AI mengambil nilai itu, dari hasil ekstraksi backend. Berguna
// di tabel perbandingan (page-ref), tapi cuma bikin ramai di header modal -- dibuang di sini saja.
function stripPageRef(v: string | null | undefined): string {
  if (!v) return '-';
  return v.replace(/\s*\(Hal\s*\d+\)\s*/gi, ' ').trim() || '-';
}

// Deteksi mismatch yang secara eksplisit memperingatkan kemungkinan dokumen ke-upload ke baris
// No PO yang salah (lihat kontrak no_po_hint) -- ini harus lebih mencolok dari mismatch biasa.
function isWrongRowMismatch(msg: string): boolean {
  return /salah upload|baris yang salah|po lain|po berbeda|tidak sesuai.*po/i.test(msg);
}

// Badge status per baris -- kolom "Status", murni hasil hitungan sistem apa adanya. TIDAK
// PERNAH berubah karena konfirmasi manual (lihat ConfirmMatchCell) -- baris yang sudah
// dikonfirmasi manual boleh tetap tampil merah/Mismatch di sini, itu memang disengaja.
function StatusBadgeCell({ row }: { row: MatrixRow }) {
  const meta = rowStatusMeta(row.row_status);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-1 text-[11px] xl:text-[13px] font-bold px-1.5 py-1 rounded-full whitespace-nowrap ${meta.badgeClass}`}>
        {row.row_status === 'Match' ? <CheckCircle2 size={12} /> : row.row_status === 'Mismatch' ? <XCircle size={12} /> : row.row_status === 'Warning' ? <AlertTriangle size={12} /> : null}
        {meta.label}
      </span>
      {row.row_reason && <p className="text-[10px] xl:text-[12px] text-[#5A305A]/60 break-words leading-snug" title={row.row_reason}>{row.row_reason}</p>}
    </div>
  );
}

const MANUAL_STATUS_OPTIONS: { value: 'Match' | 'Warning' | 'Mismatch'; label: string; activeClass: string }[] = [
  { value: 'Match', label: 'Match', activeClass: 'bg-emerald-600 border-emerald-600 text-white' },
  { value: 'Warning', label: 'Warning', activeClass: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'Mismatch', label: 'Mismatch', activeClass: 'bg-rose-600 border-rose-600 text-white' },
];

// Popup terpisah (bukan form di dalam sel tabel) supaya tidak terpotong oleh sempitnya kolom
// Konfirmasi -- dipicu dari tombol "Konfirmasi" di ConfirmMatchCell. Staff pilih penilaian
// sendiri (Match/Warning/Mismatch) + catatan opsional. PENTING: pilihan ini HANYA tersimpan sbg
// keterangan di badge "Dikonfirmasi Manual" pada kolom Konfirmasi -- TIDAK PERNAH mengubah
// row_status hasil sistem di kolom Status.
function ConfirmMatchPopup({ fieldName, onSubmit, onClose, saving }: {
  fieldName: string;
  onSubmit: (manualStatus: 'Match' | 'Warning' | 'Mismatch', catatan: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [manualStatus, setManualStatus] = useState<'Match' | 'Warning' | 'Mismatch' | null>(null);
  const [catatan, setCatatan] = useState('');

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5">
        <h3 className="font-bold text-[#5A305A] leading-tight mb-1">Manual Confirmation</h3>
        <p className="text-xs text-[#5A305A]/70 mb-4">Field: <span className="font-semibold">{fieldName}</span> — this assessment is only a note, it does NOT change the system's result status.</p>

        <label className="block text-xs font-semibold text-[#5A305A] mb-1.5">Your Assessment</label>
        <div className="flex gap-2 mb-4">
          {MANUAL_STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setManualStatus(opt.value)}
              className={`flex-1 text-xs font-bold px-2 py-2 rounded-xl border transition-all ${manualStatus === opt.value ? opt.activeClass : 'bg-white border-slate-200 text-[#5A305A]/70 hover:bg-slate-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-[#5A305A] mb-1.5">Notes (optional)</label>
        <textarea
          value={catatan}
          onChange={e => setCatatan(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Explain why this difference is considered valid..."
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
        />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={saving} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => manualStatus && onSubmit(manualStatus, catatan.trim())}
            disabled={saving || !manualStatus}
            className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kolom AKSI terpisah, khusus anotasi "sudah dicek manual" -- BUKAN untuk mengubah row_status.
// Kosong ("-") utk baris Match, cuma tampil isi utk baris Mismatch/Warning (kasus yang memang
// perlu ditinjau manual). status_manual lepas total dari alur n8n -- murni dibaca/ditulis
// langsung oleh app, dan begitu tersimpan langsung tampil sbg badge "Dikonfirmasi Manual" di
// state lokal (tidak perlu refetch/panggil apapun ke n8n). Kolom Status di sebelahnya TETAP
// menampilkan row_status asli, tidak ikut berubah.
function ConfirmMatchCell({ row, bunkerId, noPo, statusManualRaw, onConfirmed }: {
  row: MatrixRow;
  bunkerId: string;
  noPo: string | null | undefined;
  statusManualRaw: unknown;
  onConfirmed: (merged: any, type: 'success' | 'error', message: string) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const canConfirm = row.row_status === 'Mismatch' || row.row_status === 'Warning';
  if (!canConfirm) return <span className="text-[11px] xl:text-[13px] text-slate-300">-</span>;

  const statusManual = parseJsonField(statusManualRaw) || {};
  const entry = statusManual[row.field];
  const isConfirmed = entry?.confirmed_match === true;

  const submit = async (manualStatus: 'Match' | 'Warning' | 'Mismatch', catatan: string) => {
    setSaving(true);
    const { error, merged } = await setStatusManualEntry(bunkerId, statusManualRaw, row.field, {
      confirmed_match: true,
      manual_status: manualStatus,
      catatan: catatan || null,
      confirmed_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      onConfirmed(null, 'error', friendlyDbError('Failed to save confirmation: ' + error.message));
    } else {
      onConfirmed(merged, 'success', 'Manual confirmation saved.');
      setShowPopup(false);
      logBunkerAudit(noPo, user?.email, [{
        field_label: `Manual Confirmation: ${row.field}`,
        old_value: isConfirmed ? `${entry.manual_status}${entry.catatan ? ' - ' + entry.catatan : ''}` : null,
        new_value: `${manualStatus}${catatan ? ' - ' + catatan : ''}`,
      }]);
    }
  };

  const cancel = async () => {
    setSaving(true);
    const { error, merged } = await clearStatusManualEntry(bunkerId, statusManualRaw, row.field);
    setSaving(false);
    if (error) {
      onConfirmed(null, 'error', friendlyDbError('Failed to cancel confirmation: ' + error.message));
    } else {
      onConfirmed(merged, 'success', 'Confirmation canceled.');
      logBunkerAudit(noPo, user?.email, [{
        field_label: `Manual Confirmation: ${row.field}`,
        old_value: `${entry?.manual_status || ''}${entry?.catatan ? ' - ' + entry.catatan : ''}`,
        new_value: null,
      }]);
    }
  };

  if (isConfirmed) {
    // Badge Manual pakai warna yang sama dgn kolom Status (hijau/kuning/merah) berdasarkan
    // penilaian staff sendiri (manual_status) -- ini TIDAK mengubah row_status hasil sistem
    // di kolom Status sebelahnya, cuma keterangan visual di kolom Konfirmasi.
    const badgeMeta = rowStatusMeta(entry.manual_status);
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className={`inline-flex items-center gap-1 text-[11px] xl:text-[13px] font-bold px-1.5 py-1 rounded-full whitespace-nowrap ${badgeMeta.badgeClass}`}>
          <ShieldCheck size={12} /> Manual{entry.manual_status ? `: ${entry.manual_status}` : ''}
        </span>
        {entry.catatan && <p className="text-[10px] xl:text-[12px] text-[#5A305A]/70 break-words leading-snug italic">"{entry.catatan}"</p>}
        {entry.confirmed_at && <p className="text-[9.5px] xl:text-[11px] text-[#5A305A]/50 leading-snug">{formatDateTimeID(entry.confirmed_at)}</p>}
        <button onClick={cancel} disabled={saving} className="text-[10px] xl:text-[12px] font-semibold text-[#5A305A]/60 hover:text-rose-600 underline disabled:opacity-50 flex items-center gap-0.5">
          <RotateCcw size={10} /> Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setShowPopup(true)} className="text-[11px] xl:text-[13px] font-bold text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full whitespace-nowrap transition-all">
        Confirm
      </button>
      {showPopup && (
        <ConfirmMatchPopup
          fieldName={row.field}
          saving={saving}
          onClose={() => setShowPopup(false)}
          onSubmit={submit}
        />
      )}
    </>
  );
}

export default function BunkerCompareDocModal({ record, onClose, onChanged, canEdit = true }: {
  record: any;
  onClose: () => void;
  onChanged?: () => void;
  canEdit?: boolean;
}) {
  const [rec, setRec] = useState(record);
  const [statusWorkflow, setStatusWorkflow] = useState<string>(rec.status_workflow || 'BARU');
  const [catatanManual, setCatatanManual] = useState<string>(rec.catatan_manual || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const { user } = useAuth();

  const groups: TableKelengkapanGroup[] = parseJsonField(rec.table_kelengkapan) || [];
  const matrixRows: MatrixRow[] = parseJsonField(rec.matrix_perbandingan) || [];
  const allMatrixColumns = getMatrixColumns(rec.kolom_urutan);
  // Sembunyikan kolom KWITANSI (key "kwi") SAJA dari tabel "Perbandingan Antar Dokumen" kalau
  // SEMUA baris kosong utk kolom itu -- kolom dokumen lain TETAP selalu tampil apa adanya walau
  // kosong (dikonfirmasi user 2026-09, cakupannya sengaja dipersempit dari "semua kolom kosong"
  // ke KWITANSI doang). value-nya HTML mentah dari backend (lihat HtmlValue), jadi tag di-strip
  // dulu sebelum dicek supaya "<span></span>"/"-" ikut dianggap kosong juga, bukan cuma null/''.
  const matrixColumns = allMatrixColumns.filter(c => {
    if (c.key !== 'kwi') return true;
    return matrixRows.some(r => {
      const raw = (r as any)[c.key];
      if (raw == null) return false;
      const text = String(raw).replace(/<[^>]*>/g, '').trim();
      return text !== '' && text !== '-';
    });
  });
  const summary = parseJsonField(rec.summary) || {};
  const mismatches: string[] = Array.isArray(summary.mismatches) ? summary.mismatches : [];
  const actions: string[] = Array.isArray(summary.actions) ? summary.actions : [];
  const wrongRowWarnings = mismatches.filter(isWrongRowMismatch);
  const normalMismatches = mismatches.filter(m => !isWrongRowMismatch(m));
  const statusMeta = summaryStatusMeta(summary.status);

  // Ringkasan Match/Warning/Mismatch + persentase akurasi -- lihat computeMatrixMatchStats
  // (BunkerHelpers.ts), dipakai juga oleh badge di tombol "Compare Doc" pada BunkerPage.tsx.
  const { match: matchCount, warning: warningCount, mismatch: mismatchCount, pct: matchPct } = computeMatrixMatchStats(rec.matrix_perbandingan);
  const matchPctBarClass = matchPct >= 90 ? 'bg-emerald-500' : matchPct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  const matchPctTextClass = matchPct >= 90 ? 'text-emerald-700' : matchPct >= 60 ? 'text-amber-700' : 'text-rose-700';

  const hasUnsaved = statusWorkflow !== (rec.status_workflow || 'BARU') || catatanManual !== (rec.catatan_manual || '');

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    const prevStatusWorkflow = rec.status_workflow || 'BARU';
    const prevCatatanManual = rec.catatan_manual || '';
    const { error } = await updateBunkerDokumen(rec.id, { status_workflow: statusWorkflow, catatan_manual: catatanManual });
    setSaving(false);
    if (error) {
      showToast(friendlyDbError('Failed to save: ' + error.message), 'error');
    } else {
      setRec((prev: any) => ({ ...prev, status_workflow: statusWorkflow, catatan_manual: catatanManual }));
      showToast('Changes saved.', 'success');
      onChanged?.();
      const changes: { field_label: string; old_value: string | null; new_value: string | null }[] = [];
      if (statusWorkflow !== prevStatusWorkflow) {
        changes.push({ field_label: 'Status Workflow', old_value: prevStatusWorkflow, new_value: statusWorkflow });
      }
      if (catatanManual !== prevCatatanManual) {
        changes.push({ field_label: 'Manual Notes', old_value: prevCatatanManual || null, new_value: catatanManual || null });
      }
      logBunkerAudit(rec.no_po, user?.email, changes);
    }
  };

  // Portal langsung ke document.body -- lihat komentar sama di FarOverseasAirDetailModal.tsx:
  // menghindari #bunker-print-area ke-posisi relatif ke ancestor "relative" milik halaman ini
  // sendiri saat print, yang masih ikut terdorong ruang kosong konten lain (visibility:hidden
  // tetap memakan tempat).
  return createPortal(
    <div id="bunker-print-area" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4 md:p-6 w-full h-full print:static print:bg-white print:p-0 print:block print:w-auto print:h-auto">
      <div className="bg-slate-50 w-full h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden print:h-auto print:max-h-none print:shadow-none print:rounded-none print:w-full print:overflow-visible print:block">

        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0 print:border-b-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A]">Document Comparison — Bunker</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
              <p className="text-xs xl:text-sm text-[#5A305A] truncate"><span className="font-semibold">No PO:</span> {stripPageRef(rec.no_po)}</p>
              <p className="text-xs xl:text-sm text-[#5A305A] truncate"><span className="font-semibold">Vendor:</span> {stripPageRef(rec.vendor)}</p>
              <p className="text-xs xl:text-sm text-[#5A305A] truncate"><span className="font-semibold">Vessel:</span> {stripPageRef(rec.kapal)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] xl:text-sm font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            <button onClick={() => window.print()} className="px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-[#5A305A] rounded-md flex items-center gap-2 transition-colors print:hidden">
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors print:hidden">
              <X size={20} />
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mx-6 mt-4 p-3 rounded-lg border text-sm font-medium shrink-0 print:hidden ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar print:overflow-visible print:block print:h-auto">
          <div className="p-4 md:p-6 space-y-5 print:p-0">

            {/* Summary */}
            <div className={`rounded-xl border p-4 ${statusMeta.bannerClass}`}>
              <p className="text-base font-black">{statusMeta.label.toUpperCase()}</p>

              {matrixRows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-black/10">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs xl:text-sm font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> Match: {matchCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> Warning: {warningCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /> Mismatch: {mismatchCount}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] xl:text-[11px] font-bold uppercase tracking-wider opacity-70">Match Percentage</span>
                      <span className={`text-xs xl:text-sm font-black ${matchPctTextClass}`}>{matchPct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/60 overflow-hidden">
                      <div className={`h-full rounded-full ${matchPctBarClass}`} style={{ width: `${matchPct}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {wrongRowWarnings.length > 0 && (
              <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                  <p className="text-sm font-black text-rose-800">Possibly Uploaded to the Wrong Row</p>
                </div>
                <ul className="space-y-1 list-disc list-inside">
                  {wrongRowWarnings.map((m, i) => <li key={i} className="text-xs xl:text-sm text-rose-800 font-medium">{m}</li>)}
                </ul>
              </div>
            )}

            {(normalMismatches.length > 0 || actions.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {normalMismatches.length > 0 && (
                  <div className="p-4 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                      <p className="text-xs font-bold text-[#5A305A] uppercase tracking-wider">Mismatches</p>
                    </div>
                    <ul className="space-y-1 list-disc list-inside">
                      {normalMismatches.map((m, i) => <li key={i} className="text-xs xl:text-sm text-[#5A305A]">{m}</li>)}
                    </ul>
                  </div>
                )}
                {actions.length > 0 && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ListChecks size={15} className="text-blue-500 shrink-0" />
                      <p className="text-xs font-bold text-[#5A305A] uppercase tracking-wider">Actions</p>
                    </div>
                    <ul className="space-y-1 list-disc list-inside">
                      {actions.map((a, i) => <li key={i} className="text-xs xl:text-sm text-[#5A305A]">{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 1. DATA UTAMA DOKUMEN */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm xl:text-base font-bold text-[#5A305A]">1. Main Document Data</h3>
              </div>
              {groups.length === 0 ? (
                <p className="text-xs text-[#5A305A] italic text-center py-6">No data yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {groups.map((g, gi) => (
                    <div key={gi} className="p-4">
                      <p className="text-[11px] xl:text-sm font-black text-[#5A305A] uppercase tracking-wider mb-2">{g.group}</p>
                      {/* Semua field berjejer ke bawah (1 kolom), tidak ada yang berdampingan */}
                      <div className="flex flex-col gap-1.5">
                        {(g.items || []).map((it, ii) => (
                          <div key={ii} className="flex items-start gap-2 text-xs xl:text-sm">
                            <span className="text-[#5A305A]/60 w-40 shrink-0">{it.label}</span>
                            <span className="text-[#5A305A] font-medium break-words"><HtmlValue html={it.val} /></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. PERBANDINGAN ANTAR DOKUMEN */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:overflow-visible">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-[#5A305A]">2. Document Comparison</h3>
              </div>
              {matrixRows.length === 0 ? (
                <p className="text-xs text-[#5A305A] italic text-center py-6">No comparison data yet.</p>
              ) : (
                // table-fixed + lebar kolom proporsional (persen) supaya seluruh tabel selalu
                // muat dalam 1 layar penuh tanpa scroll horizontal, baik di laptop 14" maupun
                // monitor 24" -- teks panjang turun ke baris baru (break-words) alih-alih
                // memaksa kolom melebar / overflow.
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-[11px] xl:text-[13px] border-collapse table-fixed min-w-[1050px] print:min-w-0">
                    <colgroup>
                      <col style={{ width: '14%' }} />
                      {matrixColumns.map(c => <col key={c.key} style={{ width: `${68 / matrixColumns.length}%` }} />)}
                      {/* Kolom Status lebar normalnya 9%, tapi saat print melebar jadi 18% --
                          mengambil alih jatah kolom Konfirmasi yang di-print:hidden di bawah
                          ini, supaya total tetap 100% dan tidak menyisakan ruang kosong di
                          kanan tabel saat dicetak (col dgn display:none TIDAK otomatis
                          membebaskan lebarnya ke kolom lain di table-layout:fixed). */}
                      <col className="w-[9%] print:w-[18%]" />
                      <col className="w-[9%] print:hidden" />
                    </colgroup>
                    <thead>
                      <tr className="text-[9.5px] xl:text-[11px] text-white uppercase bg-[#5A305A]">
                        <th className="text-left font-semibold px-2.5 py-2 align-bottom break-words">Field</th>
                        {matrixColumns.map(c => (
                          <th key={c.key} className="text-left font-semibold px-2.5 py-2 align-bottom break-words leading-tight">{c.label}</th>
                        ))}
                        <th className="text-left font-semibold px-1.5 py-2 align-bottom break-words leading-tight">Status</th>
                        <th className="text-left font-semibold px-1.5 py-2 align-bottom break-words leading-tight print:hidden">Confirmation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matrixRows.map((row, ri) => {
                        const acuanKey = resolveAcuanColumnKey(row.acuan_label);
                        return (
                          <tr key={ri} className={rowStatusClass(row.row_status)}>
                            <td className="px-2.5 py-2 align-top border-r border-slate-200 bg-[#F58C77]">
                              <p className="font-bold text-[#5A305A] break-words leading-tight">{row.field}</p>
                              {row.acuan_label && <p className="text-[9.5px] xl:text-[11px] text-[#5A305A]/70 break-words mt-0.5">Reference: {row.acuan_label}</p>}
                            </td>
                            {matrixColumns.map(c => (
                              <td
                                key={c.key}
                                className="px-2.5 py-2 align-top break-words leading-snug"
                                style={acuanKey === c.key ? { backgroundColor: 'var(--c-acuan)' } : undefined}
                              >
                                <HtmlValue html={(row as any)[c.key]} />
                              </td>
                            ))}
                            <td className="px-1.5 py-2 align-top border-l border-slate-100">
                              <StatusBadgeCell row={row} />
                            </td>
                            <td className="px-1.5 py-2 align-top border-l border-slate-100 print:hidden">
                              {canEdit && (
                                <ConfirmMatchCell
                                  row={row}
                                  bunkerId={rec.id}
                                  noPo={rec.no_po}
                                  statusManualRaw={rec.status_manual}
                                  onConfirmed={(merged, type, message) => {
                                    if (merged) {
                                      setRec((prev: any) => ({ ...prev, status_manual: merged }));
                                      onChanged?.();
                                    }
                                    showToast(message, type);
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Status workflow + catatan manual -- BEBAS diedit dari aplikasi, tidak lewat n8n */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-[#5A305A]" />
                <p className="text-xs font-bold text-[#5A305A] uppercase tracking-wider">Work Status & Manual Notes</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1.5">Workflow Status</label>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    {STATUS_WORKFLOW_OPTIONS.map(opt => {
                      const meta = workflowMeta(opt);
                      const active = statusWorkflow === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setStatusWorkflow(opt)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                            active ? `${meta.badgeClass} border-transparent ring-2 ring-[#5A305A]/30` : 'bg-white border-slate-200 text-[#5A305A]/60 hover:bg-slate-50'
                          }`}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full inline-block ${workflowMeta(statusWorkflow).badgeClass}`}>{workflowMeta(statusWorkflow).label}</span>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1.5">Manual Notes</label>
                {canEdit ? (
                  <textarea
                    value={catatanManual}
                    onChange={e => setCatatanManual(e.target.value)}
                    rows={3}
                    placeholder="Manual correction or free-form staff notes..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
                  />
                ) : (
                  <p className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm text-[#5A305A] min-h-[4.5rem] whitespace-pre-wrap">{catatanManual || '-'}</p>
                )}
              </div>
            </div>

          </div>
        </div>

        {canEdit && hasUnsaved && (
          <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 print:hidden">
            <p className="text-xs font-medium text-amber-800">There are unsaved work status / notes changes.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStatusWorkflow(rec.status_workflow || 'BARU'); setCatatanManual(rec.catatan_manual || ''); }}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] font-semibold text-xs hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}