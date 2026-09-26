import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardCheck, Search, RefreshCw, FileDown, ChevronDown, Pencil, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown, LayoutDashboard, CalendarDays, Download, Printer, FilterX } from 'lucide-react';
import {
  formatDateTimeID,
} from '../utils/AuditPoHelpers';
import {
  statusProsesMeta, formatRupiah, updateAccountingRekapRow, deleteAccountingRekapRow,
  type AccountingRekapRow,
} from '../utils/AccountingRekapHelpers';
import Greeting from '../components/Greeting';
import { LoadingState, LoadingTableRow } from '../components/LoadingState';

// ── Kontrak data (Supabase, diisi otomasi backend) ──
// accounting_rekap_finance (1 baris = 1 dokumen finance/accounting): id, created_at,
//   tanggal_dokumen, vendor, nomor_po, pt_internal, bank, total_bayar, lokasi_folder,
//   drive_file_id, url_view, waktu_proses, status_proses. Kolom vendor/bank/total_bayar/
//   tanggal_dokumen/status_proses boleh dikoreksi manual (modal Edit) & barisnya boleh dihapus
//   (modal Hapus) -- kolom lain murni hasil otomasi backend, read-only. Halaman ini DUPLIKASI
//   SENGAJA dari Audit AP Local (`AuditPoPage.tsx`) dgn skema tabel beda -- lihat CLAUDE.md
//   bagian "Audit AP Local"/"Accounting Rekap" soal duplikasi arsitektur, kalau ada bug/fitur di
//   satu halaman JANGAN asumsikan otomatis ke-apply ke yang lain.

// Fallback SEBELUM daftar dinamis (di bawah) selesai di-fetch pertama kali, ATAU kalau fetch-nya
// gagal -- sama pola dgn `PT_OPTIONS` di AuditPoPage.tsx (PT internal Waruna Group yang sama).
const PT_OPTIONS = ['AMT', 'GMI', 'TTP', 'MJS', 'WSI', 'WNS', 'GENERAL'];

// Ambil daftar `pt_internal` DISTINCT yang BENERAN ada di tabel (replika `fetchDistinctNamaPt()`
// di AuditPoPage.tsx) -- dipakai DI 2 TEMPAT: dropdown filter panel utama, DAN seed daftar PT
// di tab "Per Vendor" modal Dashboard.
// RPC `fn_reporting_distinct_pt` (2026-09, `sql/007_audit_po_distinct_and_stats_rpc.sql`) --
// GANTI dari `select('pt_internal')` tanpa `.limit()` -- lihat catatan lengkap di AuditPoPage.tsx.
async function fetchDistinctPtInternal(table: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('fn_reporting_distinct_pt', { p_table: table });
  if (error || !data) return PT_OPTIONS;
  const list = (data as { pt: string }[]).map(r => r.pt).filter(Boolean);
  return list.length === 0 ? PT_OPTIONS : list;
}

function StatusBadge({ status }: { status: string | null }) {
  const meta = statusProsesMeta(status);
  // `status_proses` bebas teks (bukan enum tetap, lihat AccountingRekapHelpers.ts) -- bisa
  // panjang, jadi badge-nya WAJIB bisa wrap ke baris baru (rounded-lg, bukan rounded-full
  // whitespace-nowrap spt sebelumnya -- pill penuh + nowrap bikin teks panjang overflow keluar
  // kolom tak kelihatan). Sama pola dgn kolom Nomor PO/Vendor (break-words).
  return <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded-lg break-words ${meta.badgeClass}`}>{meta.label}</span>;
}

type SortKey = 'created_at' | 'pt_internal';

// Header kolom yang bisa diklik utk sort -- toggle asc/desc, dipakai kolom Tanggal & Waktu dan
// PT Internal. Sort dilakukan server-side (lihat query.order() di fetchList) karena pagination
// di halaman ini juga server-side.
function SortableHeader({ label, sortKey, activeSort, activeDir, onSort }: {
  label: string; sortKey: SortKey; activeSort: SortKey; activeDir: 'asc' | 'desc'; onSort: (key: SortKey) => void;
}) {
  const active = activeSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-semibold hover:text-[#5A305A] transition-colors"
    >
      {label}
      {active ? (
        activeDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
      ) : (
        <ArrowUpDown size={11} className="opacity-40" />
      )}
    </button>
  );
}

function PtBadge({ pt }: { pt: string | null }) {
  return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap bg-slate-100 text-[#5A305A]">
      {pt || '-'}
    </span>
  );
}

function EditAccountingRekapModal({ record, onClose, onSaved }: { record: AccountingRekapRow; onClose: () => void; onSaved: (row: AccountingRekapRow) => void }) {
  const [vendor, setVendor] = useState(record.vendor || '');
  const [bank, setBank] = useState(record.bank || '');
  const [totalBayar, setTotalBayar] = useState(record.total_bayar !== null && record.total_bayar !== undefined ? String(record.total_bayar) : '');
  const [tanggalDokumen, setTanggalDokumen] = useState(record.tanggal_dokumen || '');
  const [statusProses, setStatusProses] = useState(record.status_proses || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const updates = {
      vendor: vendor.trim() || null,
      bank: bank.trim() || null,
      total_bayar: totalBayar.trim() ? Number(totalBayar.replace(/[^0-9-]/g, '')) : null,
      tanggal_dokumen: tanggalDokumen.trim() || null,
      status_proses: statusProses || null,
    };
    const { error: err } = await updateAccountingRekapRow(record.id, updates);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved({ ...record, ...updates });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Pencil size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#5A305A] leading-tight">Edit Data Accounting Rekap</h3>
              <p className="text-xs text-[#5A305A]/70 mt-0.5 truncate">{record.nomor_po || record.id}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-[#5A305A]/60 hover:text-[#5A305A] p-1 disabled:opacity-50"><X size={18} /></button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">PT Internal</label>
            <input
              value={record.pt_internal || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nomor PO</label>
            <input
              value={record.nomor_po || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Vendor</label>
            <input
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Bank</label>
            <input
              value={bank}
              onChange={e => setBank(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Total Bayar</label>
            <input
              type="number"
              value={totalBayar}
              onChange={e => setTotalBayar(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Tanggal Dokumen</label>
            <input
              value={tanggalDokumen}
              onChange={e => setTanggalDokumen(e.target.value)}
              placeholder="mis. 2026-09-01"
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Status Proses</label>
            <input
              value={statusProses}
              onChange={e => setStatusProses(e.target.value)}
              placeholder="Ketik catatan manual (mis. keterangan status)..."
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-6">
          <button onClick={onClose} disabled={saving} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteAccountingRekapModal({ record, onConfirm, onClose, deleting, error }: {
  record: AccountingRekapRow; onConfirm: () => void; onClose: () => void; deleting: boolean; error: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[#5A305A] leading-tight">Hapus Data Ini?</h3>
            <p className="text-xs text-[#5A305A]/70 mt-0.5 truncate">{record.nomor_po || record.id}</p>
          </div>
        </div>
        <p className="text-sm font-bold text-rose-600 mb-4">Tindakan ini tidak bisa dibatalkan.</p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={deleting} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Trash2 size={14} /> {deleting ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Proxy backend `/api/drive-file-proxy?id=<drive_file_id>` (lihat server.ts & catatan lengkap di
// CLAUDE.md bagian "Audit AP Local") -- REPLIKA PERSIS `buildPreviewSrc()` AuditPoPage.tsx,
// fallback ke `url_view` mentah kalau `drive_file_id`-nya null.
function buildPreviewSrc(driveFileId: string | null, rawUrl: string | null): string | null {
  if (driveFileId) return `/api/drive-file-proxy?id=${encodeURIComponent(driveFileId)}`;
  return rawUrl;
}

// Tabel ini cuma py 1 file per baris (`url_view`/`drive_file_id`, beda dari Audit AP Local yg
// py 2 file terpisah PDF & Hasil Audit) -- jenis kontennya ditebak dari ekstensi URL, fallback
// 'pdf' (kemungkinan besar dokumen finance/accounting yg di-scan/discan sbg PDF).
function guessPreviewKind(url: string | null): 'pdf' | 'html' {
  if (url && /\.html?(\?|#|$)/i.test(url)) return 'html';
  return 'pdf';
}

type PreviewTarget = { title: string; src: string; externalUrl: string; kind: 'pdf' | 'html' };

// Modal preview file -- REPLIKA PERSIS `PreviewModal` AuditPoPage.tsx (fetch dulu lewat JS,
// suntikkan hasilnya via srcDoc/blob: supaya lolos X-Frame-Options server asal, lihat komentar
// lengkap di versi aslinya).
function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'html' | 'blob' | 'error'>('loading');
  const [htmlContent, setHtmlContent] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setStatus('loading');

    (async () => {
      try {
        const res = await apiFetch(target.src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (cancelled) return;
        if (target.kind === 'html') {
          const text = await res.text();
          if (cancelled) return;
          setHtmlContent(text);
          setStatus('html');
        } else {
          const rawBlob = await res.blob();
          if (cancelled) return;
          const blob = rawBlob.type === 'application/pdf' ? rawBlob : new Blob([rawBlob], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setStatus('blob');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target.src, target.kind]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[97vw] max-w-[1600px] h-[99.5vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-[#5A305A] text-sm truncate">{target.title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {(status === 'html' || status === 'blob') && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                <Printer size={13} /> Print
              </button>
            )}
            <a
              href={target.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <Download size={13} /> Download File
            </a>
            <button onClick={onClose} className="text-[#5A305A]/60 hover:text-[#5A305A] p-1.5"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-slate-100">
          {status === 'loading' && (
            <div className="w-full h-full flex items-center justify-center text-[#5A305A] text-sm">Memuat preview...</div>
          )}
          {status === 'error' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-8">
              <p className="text-[#5A305A] text-sm font-semibold">Preview tidak bisa dimuat di dalam aplikasi.</p>
              <p className="text-[#5A305A]/70 text-xs max-w-md">Kemungkinan server asal file ini memblokir akses dari luar (CORS). Gunakan tombol "Download File" di pojok kanan atas untuk melihatnya.</p>
            </div>
          )}
          {status === 'html' && (
            <iframe ref={iframeRef} srcDoc={htmlContent} title={target.title} className="w-full h-full border-0" sandbox="allow-same-origin allow-modals" />
          )}
          {status === 'blob' && (
            <iframe ref={iframeRef} src={blobUrl} title={target.title} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// Format ringkas utk judul rentang tanggal dashboard, mis. "21 - 27 Aug 2026".
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS_SHORT_EN[m - 1]} ${y}`;
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type DashboardStats = { total: number; sesuai: number; bermasalah: number };
type VendorStat = { pt: string; count: number };

// "Sumbu bagus" utk gridline chart batang -- REPLIKA `niceAxisStep()` AuditPoPage.tsx.
function niceAxisStep(maxVal: number): number {
  const target = Math.max(maxVal, 1) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const residual = target / magnitude;
  if (residual > 5) return 10 * magnitude;
  if (residual > 2) return 5 * magnitude;
  if (residual > 1) return 2 * magnitude;
  return magnitude;
}

// Geometri pie chart "callout" -- REPLIKA PERSIS AuditPoPage.tsx.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function buildPieSlicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const p1 = polarPoint(cx, cy, r, startAngle);
  const p2 = polarPoint(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
}
function lightenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}
function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

// Modal "Dashboard" -- ringkasan poin Accounting Rekap dalam rentang tanggal terpilih
// (created_at), REPLIKA PERSIS `DashboardModal` AuditPoPage.tsx TAPI HANYA 2 tab (Overview/Per
// Vendor) -- tab "Kategori" TIDAK ADA krn tabel ini tidak punya kolom `kategori` sama sekali.
// Total Running = jumlah baris dalam rentang; Total Bermasalah = baris dgn `status_proses` TIDAK
// null; Total Sesuai = selisihnya (KONVENSI SAMA dgn Audit AP Local, sesuai permintaan user
// "tampilannya identik").
function DashboardModal({ onClose }: { onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(6));
  const [dateTo, setDateTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(dateFrom);
  const [appliedTo, setAppliedTo] = useState(dateTo);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'vendor'>('overview');
  const [vendorStats, setVendorStats] = useState<VendorStat[] | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorError, setVendorError] = useState<string | null>(null);

  const [ptOptions, setPtOptions] = useState<string[]>(PT_OPTIONS);
  useEffect(() => {
    fetchDistinctPtInternal('accounting_rekap_finance').then(setPtOptions);
  }, []);

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    const totalQuery = supabase.from('accounting_rekap_finance').select('*', { count: 'exact', head: true })
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    const bermasalahQuery = supabase.from('accounting_rekap_finance').select('*', { count: 'exact', head: true })
      .not('status_proses', 'is', null)
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);

    const [totalRes, bermasalahRes] = await Promise.all([totalQuery, bermasalahQuery]);
    setLoading(false);
    if (totalRes.error) { setError(totalRes.error.message); return; }
    if (bermasalahRes.error) { setError(bermasalahRes.error.message); return; }

    const total = totalRes.count || 0;
    const bermasalah = bermasalahRes.count || 0;
    setStats({ total, bermasalah, sesuai: total - bermasalah });
  }, []);

  // RPC `fn_reporting_vendor_stats` (2026-09) -- GANTI dari fetch SEMUA baris kolom
  // `pt_internal` + hitung manual di JS, jadi GROUP BY di Postgres.
  const fetchVendorStats = useCallback(async (from: string, to: string) => {
    setVendorLoading(true);
    setVendorError(null);
    const { data, error: fetchError } = await supabase.rpc('fn_reporting_vendor_stats', {
      p_table: 'accounting_rekap_finance', p_from: from, p_to: to,
    });
    setVendorLoading(false);
    if (fetchError) { setVendorError(fetchError.message); return; }

    const counts: Record<string, number> = {};
    ptOptions.filter(pt => pt !== 'GENERAL').forEach(pt => { counts[pt] = 0; });
    (data as { pt: string; cnt: number }[] || []).forEach(r => {
      const pt = r.pt || 'TIDAK DIKETAHUI';
      if (pt === 'GENERAL') return;
      counts[pt] = (counts[pt] || 0) + Number(r.cnt || 0);
    });
    const list = Object.entries(counts)
      .map(([pt, count]) => ({ pt, count }))
      .sort((a, b) => b.count - a.count);
    setVendorStats(list);
  }, [ptOptions]);

  useEffect(() => {
    fetchStats(appliedFrom, appliedTo);
    fetchVendorStats(appliedFrom, appliedTo);
  }, [appliedFrom, appliedTo, fetchStats, fetchVendorStats]);

  const handleApply = () => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const sesuaiPct = stats && stats.total > 0 ? (stats.sesuai / stats.total) * 100 : 0;
  const bermasalahPct = stats && stats.total > 0 ? 100 - sesuaiPct : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="relative bg-[#f4f4f5] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto overflow-x-hidden">
        {/* Ornamen dekoratif -- REPLIKA PERSIS AuditPoPage.tsx */}
        <svg className="absolute -top-2 -left-2 w-24 h-24 text-slate-300 pointer-events-none" viewBox="0 0 100 100" fill="none">
          {[18, 32, 46, 60, 74].map(r => (
            <circle key={r} cx="0" cy="0" r={r} stroke="currentColor" strokeWidth="2.5" />
          ))}
        </svg>
        <div className="absolute top-16 left-4 w-9 h-9 pointer-events-none">
          <div className="absolute inset-0 rotate-45 rounded-[3px] border-2 border-[#3fb8af]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-[#f7a324]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-[#5A305A]" />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 w-16 h-16 pointer-events-none opacity-70"
          style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1.4px, transparent 1.4px)', backgroundSize: '9px 9px' }}
        />
        <div
          className="absolute bottom-0 left-0 w-16 h-16 pointer-events-none opacity-90"
          style={{
            clipPath: 'polygon(0 100%, 0 30%, 70% 100%)',
            backgroundImage: 'repeating-linear-gradient(45deg, #bbf7c0 0 4px, transparent 4px 9px)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none opacity-90"
          style={{
            clipPath: 'polygon(100% 100%, 100% 30%, 30% 100%)',
            backgroundImage: 'repeating-linear-gradient(-45deg, #fde68a 0 4px, transparent 4px 9px)',
          }}
        />

        <div className="relative px-7 pt-5 pb-5">
          <div className="flex items-start justify-between gap-3 pl-8">
            <div className="min-w-0">
              <h3 className="font-extrabold text-[#5A305A] text-base leading-tight">
                Document Overview {stats ? `(${formatDateShort(appliedFrom)} - ${formatDateShort(appliedTo)})` : ''}
                <span className="text-rose-500">*</span>
              </h3>
              <h4 className="font-semibold text-slate-800 text-lg mt-1 pb-1 border-b-2 border-slate-800 inline-block">
                Accounting Rekap
              </h4>
            </div>
            <button onClick={onClose} className="text-[#5A305A]/60 hover:text-[#5A305A] p-1 shrink-0"><X size={18} /></button>
          </div>

          <div className="flex items-center flex-wrap gap-2 mt-4 mb-4 pb-4 border-b border-slate-300/60 pl-8">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-full px-3 py-1.5 border border-slate-300 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none"
            />
            <span className="text-[#5A305A]/50 text-xs">s/d</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-full px-3 py-1.5 border border-slate-300 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none"
            />
            <button
              onClick={handleApply}
              disabled={loading || vendorLoading}
              className="px-4 py-1.5 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all disabled:opacity-50"
            >
              Terapkan
            </button>

            <div className="ml-auto flex items-center gap-1 bg-slate-200/70 rounded-full p-1">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeTab === 'overview' ? 'bg-[#5A305A] text-white shadow-sm' : 'text-slate-500 hover:text-[#5A305A]'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('vendor')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeTab === 'vendor' ? 'bg-[#5A305A] text-white shadow-sm' : 'text-slate-500 hover:text-[#5A305A]'}`}
              >
                Per Vendor
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>
          )}

          <div className="min-h-[380px] mt-3 flex flex-col justify-center">
          {activeTab === 'overview' && (loading ? (
            <LoadingState fullHeight={false} />
          ) : stats ? (
            <div className="flex max-lg:flex-col items-center gap-10 pl-8">
              <div className="shrink-0 space-y-3">
                <h4 className="font-bold text-slate-800 text-base whitespace-nowrap"># Accounting Rekap</h4>
                <ul className="space-y-2.5 text-sm text-slate-700">
                  <li className="whitespace-nowrap">
                    <span>Total Dokumen Running AI : </span>
                    <span className="font-bold">{stats.total} Documents</span>
                  </li>
                  <li className="whitespace-nowrap">
                    <span>Total Dokumen Sesuai : </span>
                    <span className="font-bold">{stats.sesuai} Documents</span>
                  </li>
                  <li className="whitespace-nowrap">
                    <span>Total Dokumen Bermasalah : </span>
                    <span className="font-bold">{stats.bermasalah} Documents</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col items-start gap-1 shrink-0">
                <p className="text-xs text-slate-500">Poin yang diperoleh</p>
                {stats.total === 0 ? (
                  <div className="w-56 h-56 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-xs text-[#5A305A]/50 text-center px-6">
                    Tidak ada data di rentang ini
                  </div>
                ) : (
                  <svg width={600} height={300} viewBox="0 0 600 300">
                    {(() => {
                      const cx = 300, cy = 150, r = 105;
                      let cum = 0;
                      const slices = [
                        { pct: sesuaiPct, color: '#86efac', label: 'Sesuai' },
                        { pct: bermasalahPct, color: '#fde68a', label: 'Bermasalah' },
                      ].map(seg => {
                        const startAngle = cum;
                        cum += seg.pct * 3.6;
                        return { ...seg, startAngle, endAngle: cum, midAngle: (startAngle + cum) / 2 };
                      });
                      return (
                        <>
                          <defs>
                            <filter id="accountingRekapPieShadow" x="-30%" y="-30%" width="160%" height="160%">
                              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.25" />
                            </filter>
                            {slices.map(s => (
                              <radialGradient key={`grad-${s.label}`} id={`accountingRekapPieGrad-${s.label.replace(/\s+/g, '')}`} cx="35%" cy="30%" r="75%">
                                <stop offset="0%" stopColor={lightenHex(s.color, 0.55)} />
                                <stop offset="65%" stopColor={s.color} />
                                <stop offset="100%" stopColor={darkenHex(s.color, 0.12)} />
                              </radialGradient>
                            ))}
                          </defs>
                          <g filter="url(#accountingRekapPieShadow)">
                            {slices.map(s => {
                              if (s.pct <= 0.05) return null;
                              const gradId = `url(#accountingRekapPieGrad-${s.label.replace(/\s+/g, '')})`;
                              const rim = darkenHex(s.color, 0.18);
                              if (s.pct >= 99.95) return <circle key={s.label} cx={cx} cy={cy} r={r} fill={gradId} stroke={rim} strokeWidth={1.5} />;
                              return <path key={s.label} d={buildPieSlicePath(cx, cy, r, s.startAngle, s.endAngle)} fill={gradId} stroke={rim} strokeWidth={1.5} strokeLinejoin="round" />;
                            })}
                          </g>
                          {slices.map(s => {
                            if (s.pct <= 0.05) return null;
                            const p1 = polarPoint(cx, cy, r, s.midAngle);
                            const p2 = polarPoint(cx, cy, r + 18, s.midAngle);
                            const rightSide = p2.x >= cx;
                            const p3 = { x: p2.x + (rightSide ? 45 : -45), y: p2.y };
                            const textAnchor = rightSide ? 'start' : 'end';
                            const textX = p3.x + (rightSide ? 6 : -6);
                            return (
                              <g key={`label-${s.label}`}>
                                <polyline points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="none" stroke="#94a3b8" strokeWidth={1} />
                                <text x={textX} y={p3.y - 4} fontSize={12} fontWeight={700} fill="#1e293b" textAnchor={textAnchor}>{s.label}</text>
                                <text x={textX} y={p3.y + 11} fontSize={11} fill="#64748b" textAnchor={textAnchor}>{s.pct.toFixed(1)}%</text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          ) : null)}

          {activeTab === 'vendor' && (
            <VendorTabContent loading={vendorLoading} error={vendorError} stats={vendorStats} />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab "Per Vendor" modal Dashboard -- chart batang jumlah baris (`status_proses` terisi) per
// `pt_internal` -- REPLIKA PERSIS `VendorTabContent` AuditPoPage.tsx.
function VendorTabContent({ loading, error, stats }: { loading: boolean; error: string | null; stats: VendorStat[] | null }) {
  if (error) {
    return <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>;
  }
  if (loading) {
    return <LoadingState fullHeight={false} />;
  }
  const rows = stats || [];

  const totalDokumen = rows.reduce((sum, s) => sum + s.count, 0);
  const maxCount = rows.length > 0 ? Math.max(...rows.map(s => s.count)) : 0;
  const step = maxCount > 0 ? niceAxisStep(maxCount) : 2;
  const axisTop = maxCount > 0 ? step * Math.ceil(maxCount / step) : 10;
  const gridlines = Array.from({ length: Math.round(axisTop / step) + 1 }, (_, i) => i * step);

  const W = 640, H = 340;
  const marginLeft = 50, marginRight = 20, marginTop = 20, marginBottom = 60;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const barGap = 18;
  const barW = Math.min(70, (plotW - barGap * (rows.length + 1)) / rows.length);
  const scaleY = (val: number) => plotH - (val / axisTop) * plotH;

  const top2 = maxCount > 0 ? rows.slice(0, 2).map(s => s.pt) : [];

  return (
    <div className="pl-8">
      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
          <g transform={`translate(${marginLeft},${marginTop})`}>
            {gridlines.map(v => (
              <g key={v}>
                <line x1={0} y1={scaleY(v)} x2={plotW} y2={scaleY(v)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={-8} y={scaleY(v)} fontSize={11} fill="#64748b" textAnchor="end" dominantBaseline="middle">{v}</text>
              </g>
            ))}
            <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#334155" strokeWidth={1.5} />

            {rows.map((s, i) => {
              const x = barGap + i * (barW + barGap);
              const barH = plotH - scaleY(s.count);
              const y = scaleY(s.count);
              const valueLabelY = barH < 20 ? y - 6 : y + 16;
              const valueLabelFill = barH < 20 ? '#5A305A' : '#ffffff';
              return (
                <g key={s.pt}>
                  {barH > 0 && <rect x={x} y={y} width={barW} height={barH} fill="#5A305A" rx={2} />}
                  <text x={x + barW / 2} y={valueLabelY} fontSize={11} fontWeight={700} fill={valueLabelFill} textAnchor="middle">{s.count}</text>
                  <text x={x + barW / 2} y={plotH + 18} fontSize={11} fontWeight={600} fill="#334155" textAnchor="middle">{s.pt}</text>
                </g>
              );
            })}

            <text x={plotW / 2} y={plotH + 42} fontSize={11} fill="#64748b" textAnchor="middle">PT INTERNAL</text>
            <text x={-marginLeft + 12} y={plotH / 2} fontSize={11} fill="#64748b" textAnchor="middle" transform={`rotate(-90, ${-marginLeft + 12}, ${plotH / 2})`}>Jumlah</text>
          </g>
        </svg>
      </div>
      <p className="text-xs text-slate-500 mt-3 max-w-2xl">
        * Key Notes: Visualisasi menunjukkan frekuensi PT internal yang sudah masuk pada rentang
        tanggal terpilih. {top2.length === 2 && (
          <>Adapun <span className="font-bold">PT {top2[0]}</span> dan <span className="font-bold">PT {top2[1]}</span> yang sering ditemui dalam proses ini. </>
        )}
        Total dokumen yang sudah diproses sebanyak <span className="font-bold">{totalDokumen}</span> Dokumen.
      </p>
    </div>
  );
}

export default function AccountingRekapPage() {
  useEffect(() => { document.title = 'Accounting Rekap · BeeHive'; }, []);
  const { canEdit } = useAuth();
  const canEditAccountingRekap = canEdit('accounting_rekap');

  const [rows, setRows] = useState<AccountingRekapRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ptFilter, setPtFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [ptOptions, setPtOptions] = useState<string[]>(PT_OPTIONS);
  useEffect(() => {
    fetchDistinctPtInternal('accounting_rekap_finance').then(setPtOptions);
  }, []);

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setPtFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const [sortBy, setSortBy] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [openActionsRowId, setOpenActionsRowId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AccountingRekapRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<AccountingRekapRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const startIndex = (page - 1) * pageSize;
    let query = supabase.from('accounting_rekap_finance').select('*', { count: 'exact' }).order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      query = query.or(`nomor_po.ilike.%${s}%,vendor.ilike.%${s}%`);
    }
    if (ptFilter) query = query.eq('pt_internal', ptFilter);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data as AccountingRekapRow[]);
      setTotalRecords(count || 0);
    }
    setLoadingList(false);
  }, [page, pageSize, search, ptFilter, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleRowSaved = (updated: AccountingRekapRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    showToast('Perubahan berhasil disimpan.');
  };

  const openDeleteConfirm = (r: AccountingRekapRow) => { setDeleteConfirmRow(r); setDeleteError(null); };

  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccountingRekapRow(deleteConfirmRow.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setRows(prev => prev.filter(row => row.id !== deleteConfirmRow.id));
    setTotalRecords(prev => Math.max(0, prev - 1));
    setDeleteConfirmRow(null);
    showToast('Data berhasil dihapus.');
  };

  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const validPage = Math.min(page, totalPages);
  const listStartIndex = (validPage - 1) * pageSize;

  return (
    <>
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 font-medium text-sm z-[9999] min-w-[300px]">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-lg">✅</span>
            <span className="leading-tight max-w-[400px]">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white p-1 ml-4">&times;</button>
        </div>
      )}
    <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h1 className="font-bold text-[#5A305A] text-base leading-tight">Accounting Rekap</h1>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Rekap dokumen finance/accounting otomatis</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-2 flex-1 flex flex-col overflow-hidden">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="px-5 py-4 border-b border-white/60 flex items-center flex-nowrap gap-2 overflow-x-auto shrink-0">
              <button
                onClick={() => setDashboardOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all shadow-sm shrink-0"
              >
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <div className="flex items-center justify-end gap-2 flex-nowrap overflow-x-auto min-w-0 flex-1">
                <div className="flex items-center gap-2 rounded-full pl-3.5 pr-3 py-1.5 border border-slate-200 bg-white shrink-0">
                  <Search size={13} className="text-[#5A305A]/50 shrink-0" />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Cari No PO / Vendor..."
                    className="border-0 bg-transparent text-xs text-[#5A305A] focus:outline-none w-28"
                  />
                </div>
                <select
                  value={ptFilter}
                  onChange={e => { setPtFilter(e.target.value); setPage(1); }}
                  className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer shrink-0"
                >
                  <option value="">Semua PT</option>
                  {ptOptions.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                </select>
                <div className="flex gap-1.5 items-center rounded-full pl-2.5 pr-1.5 py-1 h-[34px] border border-slate-200 bg-white shrink-0">
                  <CalendarDays size={13} className="text-[#5A305A] shrink-0" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                    className="w-[100px] text-[11px] bg-transparent focus:outline-none text-[#5A305A] cursor-pointer"
                  />
                  <span className="text-[#5A305A] text-xs">–</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPage(1); }}
                    className="w-[100px] text-[11px] bg-transparent focus:outline-none text-[#5A305A] cursor-pointer"
                  />
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="text-[#5A305A] hover:text-[#5A305A] ml-0.5 shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => fetchList()}
                  disabled={loadingList}
                  title="Refresh"
                  className="p-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] transition-all flex items-center justify-center shrink-0 disabled:opacity-50 h-[34px] w-[34px]"
                >
                  <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleResetFilters}
                  title="Reset Filter"
                  className="p-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] transition-all flex items-center justify-center shrink-0 h-[34px] w-[34px]"
                >
                  <FilterX size={14} />
                </button>
                <div className="flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[34px] border border-slate-200 bg-white shrink-0">
                  <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Items</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer"
                  >
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            {/* Kolom Waktu Proses disembunyikan (2026-09, permintaan user) -- col/th/td-nya
                dihapus, min-w disamakan dgn SUM lebar <col> tersisa (lihat aturan wajib
                table-fixed di CLAUDE.md, kalau tidak disamakan kolom lain redistribusi tidak
                proporsional). */}
            <table className="w-full text-[11px] bg-white table-fixed min-w-[1075px]">
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '105px' }} />
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Tanggal & Waktu" sortKey="created_at" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Tgl Dokumen</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="PT Internal" sortKey="pt_internal" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Nomor PO</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Vendor</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Bank</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Total Bayar</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Status Proses</th>
                  <th className="text-center font-semibold px-3 py-2.5 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingList ? (
                  <LoadingTableRow colSpan={9} />
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data Accounting Rekap.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{formatDateTimeID(r.created_at)}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.tanggal_dokumen || '-'}</td>
                      <td className="px-3 py-3 align-top"><PtBadge pt={r.pt_internal} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] font-semibold break-words">{r.nomor_po || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.vendor || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.bank || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] font-mono break-words">{formatRupiah(r.total_bayar)}</td>
                      <td className="px-3 py-3 align-top break-words"><StatusBadge status={r.status_proses} /></td>
                      <td className="px-2 py-3 align-top sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-10 border-l border-slate-200 transition-colors">
                        <div className="flex flex-col items-center gap-1.5 w-[92px] mx-auto">
                          <button
                            onClick={() => setOpenActionsRowId(openActionsRowId === r.id ? null : r.id)}
                            className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                              openActionsRowId === r.id
                                ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                                : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                            }`}
                          >
                            Aksi
                            <ChevronDown size={12} className={`transition-transform duration-200 ${openActionsRowId === r.id ? 'rotate-180' : ''}`} />
                          </button>
                          {openActionsRowId === r.id && (
                            <div className="flex flex-col gap-1.5 items-stretch w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                              {canEditAccountingRekap && (
                                <button
                                  onClick={() => { setEditRow(r); }}
                                  title="Edit"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil size={10} /> Edit
                                </button>
                              )}
                              {canEditAccountingRekap && (
                                <button
                                  onClick={() => { openDeleteConfirm(r); }}
                                  title="Hapus"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[9px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                                >
                                  <Trash2 size={10} /> Hapus
                                </button>
                              )}
                              {r.url_view ? (
                                <button
                                  onClick={() => {
                                    const kind = guessPreviewKind(r.url_view);
                                    const src = buildPreviewSrc(r.drive_file_id, r.url_view);
                                    if (src) setPreviewTarget({ title: `Dokumen — ${r.nomor_po || r.vendor || r.id}`, src, externalUrl: r.url_view!, kind });
                                  }}
                                  title="Preview Dokumen"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileDown size={10} /> Preview
                                </button>
                              ) : (
                                <span className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-100 bg-white text-[9px] font-semibold text-slate-300">
                                  <FileDown size={10} /> Preview
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="flex max-sm:flex-col justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 gap-3 shrink-0">
              <div className="text-xs text-[#5A305A]">
                Menampilkan <span className="font-semibold text-[#5A305A]">{listStartIndex + 1}-{Math.min(listStartIndex + pageSize, totalRecords)}</span> dari <span className="font-semibold text-[#5A305A]">{totalRecords}</span> record
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={validPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Prev
                </button>
                <span className="text-xs text-[#5A305A] font-medium min-w-[80px] text-center">
                  Page <span className="font-bold text-[#5A305A]">{validPage}</span> of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={validPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[#5A305A] text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>

    {dashboardOpen && (
      <DashboardModal onClose={() => setDashboardOpen(false)} />
    )}

    {previewTarget && (
      <PreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    )}

    {editRow && (
      <EditAccountingRekapModal record={editRow} onClose={() => setEditRow(null)} onSaved={handleRowSaved} />
    )}

    {deleteConfirmRow && (
      <DeleteAccountingRekapModal
        record={deleteConfirmRow}
        deleting={deleting}
        error={deleteError}
        onClose={() => setDeleteConfirmRow(null)}
        onConfirm={confirmDelete}
      />
    )}
    </>
  );
}
