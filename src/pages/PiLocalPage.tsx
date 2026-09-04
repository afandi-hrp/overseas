import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardList, Search, RefreshCw, FileDown, FileText, Check, ChevronDown, Pencil, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown, LayoutDashboard, CalendarDays, Download } from 'lucide-react';
import {
  formatDateTimeID, statusAuditMeta, updatePiLocalKategori, updatePiLocalRow, deletePiLocalRow,
  KATEGORI_OPTIONS, type PiLocalRow,
} from '../utils/PiLocalHelpers';
import Greeting from '../components/Greeting';

// ── Kontrak data (Supabase, diisi otomasi backend) ──
// audit_po_pi_local_comp (1 baris = 1 hasil audit PO/vendor PI Local): id, created_at, nama_pt,
//   nomor_po, nomor_sj, nomor_stock_in, vendor_name, status_audit ("Selesai Diproses" |
//   "Doc tidak terbaca"), durasi_text, durasi_detik, url_pdf, url_html, drive_file_id_pdf,
//   drive_file_id_html, kategori. Kolom nama_pt/nomor_po/nomor_sj/nomor_stock_in/vendor_name/
//   status_audit/kategori boleh dikoreksi manual (modal Edit, tapi nama_pt/nomor_po/nomor_sj/
//   nomor_stock_in DITAMPILKAN READ-ONLY di modal-nya) & barisnya boleh dihapus (modal Hapus) --
//   kolom lain murni hasil otomasi backend, read-only. DUPLIKASI PERSIS dari
//   AuditPoOverseasPage.tsx (yg jg duplikasi dari AuditPoPage.tsx/Audit AP Local), TAPI tabel ini
//   punya 2 kolom tambahan yg tidak ada di 2 halaman Audit AP lainnya: nomor_sj, nomor_stock_in.
//   Lihat src/utils/PiLocalHelpers.ts untuk tipe & helper.

const PT_OPTIONS = ['AMT', 'GMI', 'TTP', 'MJS', 'WSI', 'WNS', 'GENERAL'];
const STATUS_AUDIT_OPTIONS = ['Selesai Diproses', 'Doc tidak terbaca'];

function StatusBadge({ status }: { status: string | null }) {
  const meta = statusAuditMeta(status);
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${meta.badgeClass}`}>{meta.label}</span>;
}

type SortKey = 'created_at' | 'nama_pt';

// Header kolom yang bisa diklik utk sort -- toggle asc/desc, dipakai kolom Tanggal & Waktu dan
// Nama PT. Sort dilakukan server-side (lihat query.order() di fetchList) karena pagination di
// halaman ini juga server-side.
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

// Combobox searchable terkontrol utk kategori -- ketik utk filter daftar KATEGORI_OPTIONS, klik
// utk pilih (bukan free text bebas, sesuai daftar tetap dari user). Dipakai 2 tempat: sel tabel
// (KategoriCell, auto-save per pilih) & modal Edit (form biasa, disimpan barengan field lain
// saat klik "Simpan").
function KategoriPicker({ value, onSelect, disabled, buttonLabel, widthClass = 'w-[220px]', openDirection = 'down' }: {
  value: string | null; onSelect: (val: string) => void; disabled?: boolean; buttonLabel?: string; widthClass?: string; openDirection?: 'down' | 'up';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KATEGORI_OPTIONS;
    return KATEGORI_OPTIONS.filter(opt => opt.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = (val: string) => {
    setOpen(false);
    setQuery('');
    if (val !== value) onSelect(val);
  };

  return (
    <div ref={wrapRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-[#5A305A] hover:bg-slate-50 transition-colors disabled:opacity-50 text-left"
      >
        <span className="truncate">{buttonLabel || value || 'Pilih kategori...'}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <div className={`absolute z-30 w-[280px] bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden ${openDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ketik untuk cari kategori..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-[#5A305A]/60 italic text-center py-4">Tidak ada kategori cocok.</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[11px] hover:bg-slate-50 transition-colors ${opt === value ? 'text-[#5A305A] font-semibold bg-slate-50' : 'text-[#5A305A]/80'}`}
                >
                  {opt === value ? <Check size={11} className="shrink-0" /> : <span className="w-[11px] shrink-0" />}
                  <span className="truncate">{opt}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sel tabel Kategori -- auto-save ke DB per pilih (beda dari picker di modal Edit yang cuma
// disimpan barengan field lain saat klik "Simpan").
function KategoriCell({ row, onChanged, canEdit }: { row: PiLocalRow; onChanged: (id: string, kategori: string | null) => void; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);

  const handleSelect = async (val: string) => {
    setSaving(true);
    const { error } = await updatePiLocalKategori(row.id, val);
    setSaving(false);
    if (!error) onChanged(row.id, val);
  };

  if (!canEdit) {
    return <span className="text-[10px] font-semibold text-[#5A305A] truncate block">{row.kategori || '-'}</span>;
  }

  return (
    <KategoriPicker
      value={row.kategori}
      onSelect={handleSelect}
      disabled={saving}
      buttonLabel={saving ? 'Menyimpan...' : undefined}
      widthClass="w-full"
    />
  );
}

function EditPiLocalModal({ record, onClose, onSaved }: { record: PiLocalRow; onClose: () => void; onSaved: (row: PiLocalRow) => void }) {
  const [namaPt, setNamaPt] = useState(record.nama_pt || '');
  const [nomorPo, setNomorPo] = useState(record.nomor_po || '');
  const [nomorSj, setNomorSj] = useState(record.nomor_sj || '');
  const [nomorStockIn, setNomorStockIn] = useState(record.nomor_stock_in || '');
  const [vendorName, setVendorName] = useState(record.vendor_name || '');
  const [statusAudit, setStatusAudit] = useState(record.status_audit || '');
  const [kategori, setKategori] = useState(record.kategori || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const updates = {
      nama_pt: namaPt || null,
      nomor_po: nomorPo.trim() || null,
      nomor_sj: nomorSj.trim() || null,
      nomor_stock_in: nomorStockIn.trim() || null,
      vendor_name: vendorName.trim() || null,
      status_audit: statusAudit || null,
      kategori: kategori || null,
    };
    const { error: err } = await updatePiLocalRow(record.id, updates);
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Pencil size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#5A305A] leading-tight">Edit Data Audit</h3>
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
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nama PT</label>
            <input
              value={namaPt || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nomor PO</label>
            <input
              value={nomorPo || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nomor SJ</label>
            <input
              value={nomorSj || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nomor Stock In</label>
            <input
              value={nomorStockIn || '-'}
              disabled
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-slate-50 text-sm text-[#5A305A]/70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Vendor</label>
            <input
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Status Audit</label>
            <input
              value={statusAudit}
              onChange={e => setStatusAudit(e.target.value)}
              list="status-audit-suggestions-pi-local"
              placeholder="Pilih dari saran atau ketik catatan manual (mis. keterangan error)..."
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
            <datalist id="status-audit-suggestions-pi-local">
              {STATUS_AUDIT_OPTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
            <p className="text-[10px] text-[#5A305A]/60 mt-1">Bisa pilih dari saran, atau ketik bebas untuk catatan internal (mis. jenis error).</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Kategori</label>
            <KategoriPicker value={kategori || null} onSelect={setKategori} widthClass="w-full" openDirection="up" />
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

function DeletePiLocalModal({ record, onConfirm, onClose, deleting, error }: {
  record: PiLocalRow; onConfirm: () => void; onClose: () => void; deleting: boolean; error: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[#5A305A] leading-tight">Hapus Data Audit Ini?</h3>
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

// Prioritaskan proxy backend `/api/drive-file-proxy?id=<drive_file_id>` (lihat server.ts) --
// pola sama persis dgn AuditPoPage.tsx/AuditPoOverseasPage.tsx: url_pdf/url_html link Google
// Drive juga, dan Google Drive TIDAK PERNAH me-render file HTML upload user sbg halaman hidup
// lewat link/endpoint Drive manapun (proteksi bawaan Google, cegah XSS/phishing dari origin
// drive.google.com). Proxy backend inilah yang menembus ini: server kita minta file ASLI (bukan
// halaman viewer Drive) dari Drive server-ke-server, lalu stream balik ke browser sbg konten
// same-origin. Fallback ke url_pdf/url_html mentah HANYA kalau drive_file_id-nya null.
function buildPreviewSrc(driveFileId: string | null, rawUrl: string | null): string | null {
  if (driveFileId) return `/api/drive-file-proxy?id=${encodeURIComponent(driveFileId)}`;
  return rawUrl;
}

type PreviewTarget = { title: string; src: string; externalUrl: string; kind: 'pdf' | 'html' };

// Modal preview PDF/Hasil Audit -- dibuka dari kolom Aksi. `fetch()` konten file lewat JS dulu,
// baru suntikkan hasilnya (bukan URL-nya) ke iframe via `srcDoc` (HTML) atau `blob:` object URL
// (PDF) -- iframe berisi `srcDoc`/`blob:` dianggap same-origin oleh browser, jadi tidak tunduk
// X-Frame-Options/frame-ancestors server asalnya lagi.
function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'html' | 'blob' | 'error'>('loading');
  const [htmlContent, setHtmlContent] = useState('');
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setStatus('loading');

    (async () => {
      try {
        const res = await fetch(target.src);
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
          // Paksa content-type application/pdf -- header Content-Type dari respons Drive
          // kadang generik ("application/octet-stream"), bikin browser nolak render inline &
          // malah trigger download blob tanpa nama/ekstensi.
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-6xl h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-[#5A305A] text-sm truncate">{target.title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
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
            <iframe srcDoc={htmlContent} title={target.title} className="w-full h-full border-0" sandbox="allow-same-origin" />
          )}
          {status === 'blob' && (
            <iframe src={blobUrl} title={target.title} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// Format ringkas utk judul rentang tanggal dashboard, mis. "21 - 27 Aug 2026". Beda dari
// formatDateTimeID (dipakai kolom tabel, DD-MMMM-YYYY + jam) -- ini tanpa jam, bulan disingkat.
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

// Geometri pie chart "callout" (garis penunjuk keluar ke label, gaya slide asli) -- dipakai
// DashboardModal. angleDeg diukur searah jarum jam dari atas (0deg = jam 12), SAMA dgn arah
// CSS conic-gradient default supaya warnanya konsisten kalau nanti dibanding-bandingkan.
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

// Modal "Dashboard" -- ringkasan poin PI Local dalam rentang tanggal terpilih (created_at), pola
// mirip slide "Document Test Overview" yang dipakai tim Cost Controller. Total Running AI =
// jumlah baris dalam rentang; Total Bermasalah = baris dgn status_audit TIDAK null dalam rentang;
// Total Sesuai = selisihnya. Fetch count-only (head: true) langsung ke Supabase, TIDAK menarik
// seluruh baris ke client.
function DashboardModal({ onClose }: { onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(6));
  const [dateTo, setDateTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(dateFrom);
  const [appliedTo, setAppliedTo] = useState(dateTo);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    const totalQuery = supabase.from('audit_po_pi_local_comp').select('*', { count: 'exact', head: true })
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    const bermasalahQuery = supabase.from('audit_po_pi_local_comp').select('*', { count: 'exact', head: true })
      .not('status_audit', 'is', null)
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);

    const [totalRes, bermasalahRes] = await Promise.all([totalQuery, bermasalahQuery]);
    setLoading(false);
    if (totalRes.error) { setError(totalRes.error.message); return; }
    if (bermasalahRes.error) { setError(bermasalahRes.error.message); return; }

    const total = totalRes.count || 0;
    const bermasalah = bermasalahRes.count || 0;
    setStats({ total, bermasalah, sesuai: total - bermasalah });
  }, []);

  useEffect(() => {
    fetchStats(appliedFrom, appliedTo);
  }, [appliedFrom, appliedTo, fetchStats]);

  const handleApply = () => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const sesuaiPct = stats && stats.total > 0 ? (stats.sesuai / stats.total) * 100 : 0;
  const bermasalahPct = stats && stats.total > 0 ? 100 - sesuaiPct : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="relative bg-[#f4f4f5] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto overflow-x-hidden">
        {/* ── Ornamen dekoratif (mengikuti gaya slide "Document Test Overview") ── */}
        {/* Concentric arcs, pojok kiri atas */}
        <svg className="absolute -top-2 -left-2 w-24 h-24 text-slate-300 pointer-events-none" viewBox="0 0 100 100" fill="none">
          {[18, 32, 46, 60, 74].map(r => (
            <circle key={r} cx="0" cy="0" r={r} stroke="currentColor" strokeWidth="2.5" />
          ))}
        </svg>
        {/* Diamond/chevron mark, di bawah arcs */}
        <div className="absolute top-16 left-4 w-9 h-9 pointer-events-none">
          <div className="absolute inset-0 rotate-45 rounded-[3px] border-2 border-[#3fb8af]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-[#f7a324]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-[#5A305A]" />
        </div>
        {/* Dotted grid, kanan tengah */}
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 w-16 h-16 pointer-events-none opacity-70"
          style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1.4px, transparent 1.4px)', backgroundSize: '9px 9px' }}
        />
        {/* Stripe segitiga hijau, pojok kiri bawah */}
        <div
          className="absolute bottom-0 left-0 w-16 h-16 pointer-events-none opacity-90"
          style={{
            clipPath: 'polygon(0 100%, 0 30%, 70% 100%)',
            backgroundImage: 'repeating-linear-gradient(45deg, #bbf7c0 0 4px, transparent 4px 9px)',
          }}
        />
        {/* Stripe segitiga kuning, pojok kanan bawah */}
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
                Document Test Overview {stats ? `(${formatDateShort(appliedFrom)} - ${formatDateShort(appliedTo)})` : ''}
                <span className="text-rose-500">*</span>
              </h3>
              <h4 className="font-semibold text-slate-800 text-lg mt-1 pb-1 border-b-2 border-slate-800 inline-block">
                PI Local
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
              disabled={loading}
              className="px-4 py-1.5 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all disabled:opacity-50"
            >
              Terapkan
            </button>
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-14 text-[#5A305A] text-sm">Memuat data...</div>
          ) : stats ? (
            <div className="flex max-lg:flex-col items-center gap-10 pl-8">
              <div className="shrink-0 space-y-3">
                <h4 className="font-bold text-slate-800 text-base whitespace-nowrap"># PI Local</h4>
                <ul className="space-y-2.5 text-sm text-slate-700">
                  <li className="whitespace-nowrap">
                    <span>Total PO Running AI : </span>
                    <span className="font-bold">{stats.total} Documents</span>
                  </li>
                  <li className="whitespace-nowrap">
                    <span>Total PO Sesuai : </span>
                    <span className="font-bold">{stats.sesuai} Documents</span>
                  </li>
                  <li className="whitespace-nowrap">
                    <span>Total PO Bermasalah : </span>
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
                  <svg width={570} height={300} viewBox="0 0 570 300">
                    {(() => {
                      const cx = 285, cy = 150, r = 90;
                      let cum = 0;
                      const slices = [
                        { pct: sesuaiPct, color: '#86efac', label: 'PO Sesuai' },
                        { pct: bermasalahPct, color: '#fde68a', label: 'PO Bermasalah' },
                      ].map(seg => {
                        const startAngle = cum;
                        cum += seg.pct * 3.6;
                        return { ...seg, startAngle, endAngle: cum, midAngle: (startAngle + cum) / 2 };
                      });
                      return (
                        <>
                          {slices.map(s => {
                            if (s.pct <= 0.05) return null;
                            if (s.pct >= 99.95) return <circle key={s.label} cx={cx} cy={cy} r={r} fill={s.color} />;
                            return <path key={s.label} d={buildPieSlicePath(cx, cy, r, s.startAngle, s.endAngle)} fill={s.color} />;
                          })}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PiLocalPage() {
  useEffect(() => { document.title = 'PI Local · BeeHive'; }, []);
  const { canEdit } = useAuth();
  const canEditPiLocal = canEdit('pi_local');

  const [rows, setRows] = useState<PiLocalRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ptFilter, setPtFilter] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
  const [editRow, setEditRow] = useState<PiLocalRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<PiLocalRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Debounce search text (Nomor PO / Vendor) -- tidak ada preseden di BunkerPage, ditambahkan
  // khusus di sini karena tabel ini besar & terus bertambah dari automasi.
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
    let query = supabase.from('audit_po_pi_local_comp').select('*', { count: 'exact' }).order(sortBy, { ascending: sortDir === 'asc' });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      query = query.or(`nomor_po.ilike.%${s}%,vendor_name.ilike.%${s}%`);
    }
    if (ptFilter) query = query.eq('nama_pt', ptFilter);
    if (kategoriFilter) query = query.eq('kategori', kategoriFilter);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data as PiLocalRow[]);
      setTotalRecords(count || 0);
    }
    setLoadingList(false);
  }, [page, pageSize, search, ptFilter, kategoriFilter, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleKategoriChanged = (id: string, kategori: string | null) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, kategori } : r));
  };

  const handleRowSaved = (updated: PiLocalRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    showToast('Perubahan berhasil disimpan.');
  };

  const openDeleteConfirm = (r: PiLocalRow) => { setDeleteConfirmRow(r); setDeleteError(null); };

  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deletePiLocalRow(deleteConfirmRow.id);
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
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10 no-scrollbar">
      <header className="px-6 pt-1 pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ClipboardList size={20} />
            </div>
            <div>
              <h1 className="font-bold text-[#5A305A] text-base leading-tight">PI Local</h1>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Hasil audit PO/vendor otomatis</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-6 py-4 space-y-5">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-white/60 flex items-center flex-nowrap gap-2 overflow-x-auto">
              <button
                onClick={() => setDashboardOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all shadow-sm shrink-0"
              >
                <LayoutDashboard size={14} /> Dashboard
              </button>
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
                {PT_OPTIONS.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>
              <select
                value={kategoriFilter}
                onChange={e => { setKategoriFilter(e.target.value); setPage(1); }}
                className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer shrink-0 max-w-[160px]"
              >
                <option value="">Semua Kategori</option>
                {KATEGORI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
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
              <div className="flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[34px] border border-slate-200 bg-white shrink-0 ml-auto">
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

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] bg-white table-fixed min-w-[1180px]">
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '65px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '105px' }} />
              </colgroup>
              <thead>
                <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Tanggal & Waktu" sortKey="created_at" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Nama PT" sortKey="nama_pt" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Nomor PO</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Nomor SJ</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Nomor Stock In</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Vendor</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Status Audit</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Kategori</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Durasi</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingList ? (
                  <tr><td colSpan={10} className="text-center py-10 text-[#5A305A] text-sm">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data PI Local.</td></tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{formatDateTimeID(r.created_at)}</td>
                      <td className="px-3 py-3 align-top"><PtBadge pt={r.nama_pt} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] font-semibold break-words">{r.nomor_po || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.nomor_sj || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.nomor_stock_in || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] truncate" title={r.vendor_name || undefined}>{r.vendor_name || '-'}</td>
                      <td className="px-3 py-3 align-top"><StatusBadge status={r.status_audit} /></td>
                      <td className="px-3 py-3 align-top"><KategoriCell row={r} onChanged={handleKategoriChanged} canEdit={canEditPiLocal} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] truncate" title={r.durasi_text || undefined}>{r.durasi_text || '-'}</td>
                      <td className="px-2 py-3 align-top sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-10 border-l border-slate-200 transition-colors">
                        <div className="flex flex-col items-center gap-1.5 w-[92px]">
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
                              {canEditPiLocal && (
                                <button
                                  onClick={() => { setEditRow(r); setOpenActionsRowId(null); }}
                                  title="Edit"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil size={10} /> Edit
                                </button>
                              )}
                              {canEditPiLocal && (
                                <button
                                  onClick={() => { openDeleteConfirm(r); setOpenActionsRowId(null); }}
                                  title="Hapus"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[9px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                                >
                                  <Trash2 size={10} /> Hapus
                                </button>
                              )}
                              {r.url_pdf ? (
                                <button
                                  onClick={() => {
                                    const src = buildPreviewSrc(r.drive_file_id_pdf, r.url_pdf);
                                    if (src) setPreviewTarget({ title: `PDF — ${r.nomor_po || r.vendor_name || r.id}`, src, externalUrl: r.url_pdf!, kind: 'pdf' });
                                    setOpenActionsRowId(null);
                                  }}
                                  title="Preview PDF"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileDown size={10} /> Preview PDF
                                </button>
                              ) : (
                                <span className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-100 bg-white text-[9px] font-semibold text-slate-300">
                                  <FileDown size={10} /> Preview PDF
                                </span>
                              )}
                              {r.url_html ? (
                                <button
                                  onClick={() => {
                                    const src = buildPreviewSrc(r.drive_file_id_html, r.url_html);
                                    if (src) setPreviewTarget({ title: `Hasil Audit — ${r.nomor_po || r.vendor_name || r.id}`, src, externalUrl: r.url_html!, kind: 'html' });
                                    setOpenActionsRowId(null);
                                  }}
                                  title="Preview Hasil Audit"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileText size={10} /> Hasil Audit
                                </button>
                              ) : (
                                <span className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-100 bg-white text-[9px] font-semibold text-slate-300">
                                  <FileText size={10} /> Hasil Audit
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
            <div className="flex max-sm:flex-col justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 gap-3">
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
      <EditPiLocalModal record={editRow} onClose={() => setEditRow(null)} onSaved={handleRowSaved} />
    )}

    {deleteConfirmRow && (
      <DeletePiLocalModal
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
