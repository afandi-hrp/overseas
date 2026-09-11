import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardCheck, Search, RefreshCw, FileDown, FileText, Check, ChevronDown, Pencil, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown, LayoutDashboard, CalendarDays, Download, Printer, FilterX } from 'lucide-react';
import {
  formatDateTimeID, statusAuditMeta, updateAuditPoKategori, updateAuditPoRow, deleteAuditPoRow,
  KATEGORI_OPTIONS, type AuditPoRow,
} from '../utils/AuditPoHelpers';
import Greeting from '../components/Greeting';

// ── Kontrak data (Supabase, diisi otomasi backend tiap 30 menit) ──
// audit_po_ap_comp (1 baris = 1 hasil audit PO/vendor): id, created_at, nama_pt, nomor_po,
//   vendor_name, status_audit ("Selesai Diproses" | "Doc tidak terbaca"), durasi_text,
//   durasi_detik, url_pdf, url_html, drive_file_id_pdf, drive_file_id_html, kategori. Kolom
//   nama_pt/nomor_po/vendor_name/status_audit/kategori boleh dikoreksi manual (modal Edit) &
//   barisnya boleh dihapus (modal Hapus) -- kolom lain murni hasil otomasi backend, read-only.
//   Lihat src/utils/AuditPoHelpers.ts untuk tipe & helper.

// Fallback SEBELUM daftar dinamis (di bawah) selesai di-fetch pertama kali, ATAU kalau fetch-nya
// gagal -- bukan lagi daftar TETAP (2026-09, FIX bug "tidak semua nama PT tampil di filter" --
// lihat `fetchDistinctNamaPt()`).
const PT_OPTIONS = ['AMT', 'GMI', 'TTP', 'MJS', 'WSI', 'WNS', 'GENERAL'];

// Ambil daftar `nama_pt` DISTINCT yang BENERAN ada di tabel (2026-09, FIX bug laporan user +
// screenshot: dropdown filter "Semua PT" cuma menampilkan 7 nama hardcode `PT_OPTIONS`, PADAHAL
// data asli bisa punya nama PT lain yang tidak ada di daftar itu, mis. "GUN" -- akibatnya PT itu
// TIDAK BISA difilter sama sekali lewat dropdown, walau barisnya sendiri tetap muncul & bisa
// dicari via search). Supabase-js `.select()` TIDAK punya opsi "distinct" bawaan, jadi kolom
// `nama_pt` di-fetch APA ADANYA (1 kolom saja, ringan) lalu di-dedup+sort di client -- dipakai
// DI 2 TEMPAT: dropdown filter panel utama, DAN seed daftar PT di tab "Per Vendor" modal
// Dashboard (supaya PT yang jarang/baru tetap ikut tampil sbg batang 0 kalau rentang tanggal
// tidak py dokumen bermasalah utk PT itu, bukan cuma PT dari `PT_OPTIONS` lama).
async function fetchDistinctNamaPt(table: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select('nama_pt');
  if (error || !data) return PT_OPTIONS;
  const set = new Set<string>();
  data.forEach((r: any) => {
    const pt = (r.nama_pt || '').trim();
    if (pt) set.add(pt);
  });
  if (set.size === 0) return PT_OPTIONS;
  return Array.from(set).sort();
}

function StatusBadge({ status }: { status: string | null }) {
  const meta = statusAuditMeta(status);
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${meta.badgeClass}`}>{meta.label}</span>;
}

type SortKey = 'created_at' | 'nama_pt' | 'kategori';

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

// Pemisah antar kategori kalau lebih dari 1 dipilih -- SAMA pola dgn gabungan PO/vessel di
// modul lain app ini (tanda "+"), disimpan APA ADANYA sbg 1 string di kolom `kategori` (text,
// TIDAK ada migrasi skema jadi array/tabel terpisah).
const KATEGORI_MULTI_SEPARATOR = ' + ';
function parseKategoriMulti(value: string | null): string[] {
  return (value || '').split(KATEGORI_MULTI_SEPARATOR).map(s => s.trim()).filter(Boolean);
}

// Combobox searchable terkontrol utk kategori -- ketik utk filter daftar KATEGORI_OPTIONS, klik
// utk pilih (bukan free text bebas, sesuai daftar tetap dari user). Dipakai 2 tempat: sel tabel
// (KategoriCell, auto-save per pilih) & modal Edit (form biasa, disimpan barengan field lain
// saat klik "Simpan"). Mode multi (2026-09) -- `value` bisa berisi BEBERAPA kategori sekaligus
// digabung tanda "+" (`KATEGORI_MULTI_SEPARATOR`), tiap opsi jadi checkbox toggle (dropdown TIDAK
// otomatis tertutup habis klik satu, supaya user bisa pilih lebih dari 1 sekaligus) --
// `onSelect` dipanggil dgn STRING GABUNGAN barunya tiap kali toggle.
// Lebar & estimasi tinggi panel dropdown -- dipakai `updateCoords()` menghitung posisi & arah
// (atas/bawah) SEBELUM panel benar-benar dirender, supaya tidak "kedip" salah arah dulu baru
// pindah.
const KATEGORI_PANEL_W = 280;
const KATEGORI_PANEL_MAX_H = 260;

function KategoriPicker({ value, onSelect, disabled, buttonLabel, widthClass = 'w-[220px]' }: {
  value: string | null; onSelect: (val: string) => void; disabled?: boolean; buttonLabel?: string; widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Posisi panel DIHITUNG SAAT DIBUKA dari posisi tombol di VIEWPORT (2026-09, FIX bug "list
  // kategori kepotong kalau baris tabel cuma sedikit") -- SEBELUMNYA arah buka (atas/bawah)
  // ditentukan STATIS dari index baris (`idx >= rows.length - 3 ? 'up' : 'down'`, lihat
  // `KategoriCell`), dgn asumsi "3 baris terakhir tabel pasti dekat bawah kartu, sisanya pasti
  // py ruang cukup di atas". Asumsi itu SALAH kalau baris totalnya SEDIKIT (1-3 baris) --
  // SEMUA baris kena `idx >= rows.length - 3` (jadi buka ke ATAS), padahal baris itu ADA DI
  // BARIS PALING ATAS TABEL, TIDAK PUNYA ruang cukup di atasnya SAMA SEKALI sebelum mentok
  // toolbar filter -- panel jadi kepotong ke ATAS, bukan ke bawah spt sebelumnya. Fix TUNTAS:
  // panel SEKARANG di-render via React Portal ke `document.body` (`position: fixed`, koordinat
  // dari `getBoundingClientRect()` tombol) -- otomatis LEPAS dari `overflow-hidden` kartu
  // pembungkus tabel manapun (akar masalah kliping di 2 arah, atas MAUPUN bawah), DAN arah buka
  // dihitung ULANG tiap kali dibuka dari SISA RUANG VIEWPORT ASLI (bukan tebakan index baris) --
  // benar utk BERAPA PUN jumlah barisnya. Prop `openDirection` yang dulu dikirim `KategoriCell`
  // SUDAH TIDAK DIPAKAI lagi (dihapus dari signature) -- kalau pemanggil lama masih mengirimnya,
  // TypeScript akan menandai prop itu berlebih, tinggal hapus dari pemanggilnya.
  const [coords, setCoords] = useState<{ left: number; direction: 'up' | 'down'; top?: number; bottom?: number } | null>(null);

  const updateCoords = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const direction: 'up' | 'down' = spaceBelow >= KATEGORI_PANEL_MAX_H || spaceBelow >= spaceAbove ? 'down' : 'up';
    let left = rect.left;
    if (left + KATEGORI_PANEL_W > window.innerWidth - 8) left = window.innerWidth - KATEGORI_PANEL_W - 8;
    if (left < 8) left = 8;
    setCoords(
      direction === 'down'
        ? { left, direction, top: rect.bottom + 4 }
        : { left, direction, bottom: window.innerHeight - rect.top + 4 }
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KATEGORI_OPTIONS;
    return KATEGORI_OPTIONS.filter(opt => opt.toLowerCase().includes(q));
  }, [query]);

  const selected = useMemo(() => parseKategoriMulti(value), [value]);

  const handleToggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
    onSelect(next.join(KATEGORI_MULTI_SEPARATOR));
  };

  return (
    <div ref={wrapRef} className={widthClass}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-[#5A305A] hover:bg-slate-50 transition-colors disabled:opacity-50 text-left"
      >
        <span className="truncate">{buttonLabel || value || 'Pilih kategori...'}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: coords.left, top: coords.top, bottom: coords.bottom, width: KATEGORI_PANEL_W }}
          className="z-[9999] bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden"
        >
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
              filtered.map(opt => {
                const isSelected = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleToggle(opt)}
                    className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[11px] hover:bg-slate-50 transition-colors ${isSelected ? 'text-[#5A305A] font-semibold bg-slate-50' : 'text-[#5A305A]/80'}`}
                  >
                    <span className={`w-[13px] h-[13px] shrink-0 rounded border flex items-center justify-center ${isSelected ? 'bg-[#5A305A] border-[#5A305A]' : 'border-slate-300'}`}>
                      {isSelected && <Check size={9} className="text-white" />}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="p-1.5 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => { setOpen(false); setQuery(''); }}
              className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-[#5A305A] hover:bg-[#73507B] transition-colors"
            >
              Selesai
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Sel tabel Kategori -- auto-save ke DB per pilih (beda dari picker di modal Edit yang cuma
// disimpan barengan field lain saat klik "Simpan"). `openDirection` SUDAH TIDAK DIPAKAI lagi
// (2026-09) -- `KategoriPicker` sekarang menghitung arah buka sendiri via portal, lihat
// komentar panjang di deklarasinya.
function KategoriCell({ row, onChanged, canEdit }: { row: AuditPoRow; onChanged: (id: string, kategori: string | null) => void; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);

  const handleSelect = async (val: string) => {
    setSaving(true);
    const { error } = await updateAuditPoKategori(row.id, val);
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

function EditAuditPoModal({ record, onClose, onSaved }: { record: AuditPoRow; onClose: () => void; onSaved: (row: AuditPoRow) => void }) {
  const [namaPt, setNamaPt] = useState(record.nama_pt || '');
  const [nomorPo, setNomorPo] = useState(record.nomor_po || '');
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
      vendor_name: vendorName.trim() || null,
      status_audit: statusAudit || null,
      kategori: kategori || null,
    };
    const { error: err } = await updateAuditPoRow(record.id, updates);
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
              placeholder="Ketik catatan manual (mis. keterangan error)..."
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
            <p className="text-[10px] text-[#5A305A]/60 mt-1">Ketik bebas untuk catatan internal (mis. jenis error).</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Kategori</label>
            <KategoriPicker value={kategori || null} onSelect={setKategori} widthClass="w-full" />
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

function DeleteAuditPoModal({ record, onConfirm, onClose, deleting, error }: {
  record: AuditPoRow; onConfirm: () => void; onClose: () => void; deleting: boolean; error: string | null;
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
// DIKONFIRMASI user (2026-09): url_pdf/url_html MEMANG link Google Drive juga (bukan host lain
// terpisah dari drive_file_id_*), dan Google Drive TIDAK PERNAH me-render file HTML upload user
// sbg halaman hidup lewat link/endpoint Drive manapun (proteksi bawaan Google, cegah
// XSS/phishing dari origin drive.google.com) -- baik dibuka langsung di Drive maupun di-fetch
// dari app ini, yang didapat cuma source code-nya mentah, BUKAN halaman ter-render. Proxy
// backend inilah yang menembus ini: server kita minta file ASLI (bukan halaman viewer Drive)
// dari Drive server-ke-server (endpoint `drive.usercontent.google.com/download`, bukan endpoint
// `/view`/`/preview` yg dipakai browser), lalu stream balik ke browser sbg konten same-origin.
// Fallback ke url_pdf/url_html mentah HANYA kalau drive_file_id-nya null (mis. baris lama) --
// fallback ini kemungkinan besar tetap gagal (client fetch langsung ke Drive kena CORS + dapat
// halaman viewer, bukan file asli), tapi tetap dicoba drpd langsung nyerah.
function buildPreviewSrc(driveFileId: string | null, rawUrl: string | null): string | null {
  if (driveFileId) return `/api/drive-file-proxy?id=${encodeURIComponent(driveFileId)}`;
  return rawUrl;
}

type PreviewTarget = { title: string; src: string; externalUrl: string; kind: 'pdf' | 'html' };

// Modal preview PDF/Hasil Audit -- dibuka dari kolom Aksi (ganti behavior lama yg langsung buka
// tab baru/download), supaya user bisa lihat isi file tanpa keluar dari aplikasi.
//
// PENTING soal cara kerjanya: taruh `target.src` LANGSUNG di `<iframe src=...>` (versi awal)
// TERNYATA blank total tanpa pesan error apapun (dikonfirmasi user via screenshot) -- ini gejala
// khas server asli file itu ngirim header `X-Frame-Options`/CSP `frame-ancestors` yg BLOKIR
// framing dari origin lain (browser blank-in diam2, tidak nampilin halaman error besar). Iframe
// `src` ke URL pihak lain SELALU tunduk ke header itu, mau di-preview app manapun.
//
// FIX-nya: `fetch()` konten file itu lewat JS dulu, baru suntikkan HASIL fetch-nya (bukan
// URL-nya) ke iframe via `srcDoc` (utk HTML, taruh teks HTML mentah) atau `blob:` object URL
// (utk PDF, browser tetap render pakai PDF viewer bawaannya). Iframe yg isinya `srcDoc`/`blob:`
// DIANGGAP SAME-ORIGIN oleh browser, jadi TIDAK tunduk ke X-Frame-Options/frame-ancestors server
// asalnya lagi -- itu bedanya kenapa cara ini bisa nembus sementara `src` langsung tidak bisa.
// KETERBATASAN: fetch() ini MASIH tunduk CORS biasa (beda dari X-Frame-Options) -- kalau server
// asal file TIDAK mengirim header `Access-Control-Allow-Origin` yg mengizinkan origin app ini,
// fetch bakal gagal total (browser block baca response-nya) dan preview tidak akan pernah bisa
// tampil dgn cara apapun dari sisi frontend murni (perlu proxy lewat backend sendiri kalau mau
// menembus ini, BELUM diimplementasikan). Makanya ada state 'error' eksplisit + pesan yg
// mengarahkan ke tombol "Buka di tab baru", bukan cuma diam2 blank lagi kalau fetch gagal.
function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'html' | 'blob' | 'error'>('loading');
  const [htmlContent, setHtmlContent] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  // Tombol Print (2026-09, permintaan user "sama dgn tombol print di halaman preview PDF") --
  // PDF SEBENARNYA sudah "punya" tombol print, tapi itu BAWAAN PDF viewer browser sendiri
  // (toolbar Chrome PDF viewer), BUKAN tombol milik modal ini -- Hasil Audit (HTML) tidak py
  // viewer bawaan serupa jadi butuh tombol eksplisit sendiri. `iframeRef` dipakai bareng utk
  // KEDUA jenis konten (`status === 'html'` MAUPUN `'blob'`, cuma 1 yg render pada satu waktu)
  // supaya 1 tombol Print konsisten berfungsi utk keduanya, bukan cuma Hasil Audit.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    // `focus()` dulu sebelum `print()` -- beberapa versi Chrome DIAM-DIAM tidak membuka dialog
    // print kalau browsing context iframe-nya belum "aktif"/focused (dilaporkan user "print
    // seperti tidak berfungsi"), fokuskan dulu supaya print() ditujukan ke context yg benar.
    win.focus();
    win.print();
  };

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
          // malah trigger download blob tanpa nama/ekstensi. Kita sudah tau pasti ini PDF dari
          // `target.kind`, jadi override type-nya di sini drpd percaya header upstream.
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
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-6xl h-[98vh] flex flex-col overflow-hidden">
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
type VendorStat = { pt: string; count: number };

// "Sumbu bagus" utk gridline chart batang (2026-09, dipakai halaman Dashboard baru "Per Vendor")
// -- pilih step gridline (10/20/25/50/100/...) berdasar skala nilai maksimum, supaya jumlah garis
// horizontal wajar (~4-6 garis) apapun skala datanya (puluhan sampai ribuan), REPLIKA pola umum
// "nice numbers" utk axis chart, generik -- bukan cuma cocok utk 200-an spt contoh screenshot.
function niceAxisStep(maxVal: number): number {
  const target = Math.max(maxVal, 1) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const residual = target / magnitude;
  if (residual > 5) return 10 * magnitude;
  if (residual > 2) return 5 * magnitude;
  if (residual > 1) return 2 * magnitude;
  return magnitude;
}

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

// Varian lebih terang dari warna hex -- dipakai bikin radial gradient per slice pie (2026-09,
// permintaan user "buat pie-nya seperti 3D") supaya ada kesan highlight/glossy dari tengah ke
// tepi (pusat lebih terang, tepi warna asli) -- ilusi "gelembung"/dome 3D tanpa perlu geometri
// elips/ekstrusi (yang beresiko merusak perhitungan garis callout label, lihat komentar pie chart
// di bawah). `amount` 0-1, 1 = putih penuh.
function lightenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}
// Varian lebih gelap -- dipakai stroke/rim tiap slice biar batas antar slice lebih tegas (lagi2
// demi kesan 3D, bukan cuma flat fill polos).
function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

// Modal "Dashboard" -- ringkasan poin AP PO Local dalam rentang tanggal terpilih (created_at),
// pola mirip slide "Document Test Overview" yang dipakai tim Cost Controller. Total Running AI =
// jumlah baris dalam rentang; Total Bermasalah = baris dgn status_audit TIDAK null dalam rentang
// (lihat catatan poin 3 di CLAUDE.md soal reset status_audit ke null); Total Sesuai = selisihnya.
// Fetch count-only (head: true) langsung ke Supabase, TIDAK menarik seluruh baris ke client.
function DashboardModal({ onClose }: { onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(6));
  const [dateTo, setDateTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(dateFrom);
  const [appliedTo, setAppliedTo] = useState(dateTo);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Halaman ke-2 modal Dashboard (2026-09) -- "Per Vendor": chart batang jumlah baris PER
  // `nama_pt` yang `status_audit`-nya SUDAH TERISI (bukan null/kosong) dalam rentang tanggal yang
  // sama dgn tab Overview -- REPLIKA visual slide "Cost Controller - AP Local" yang diberikan
  // user. Tab terpisah (bukan gabung ke halaman Overview) krn beda jenis chart (pie vs batang)
  // & beda skala data (per-PT vs total), disatukan dlm 1 modal ini biar 1 pintu masuk Dashboard.
  const [activeTab, setActiveTab] = useState<'overview' | 'vendor' | 'kategori'>('overview');
  const [vendorStats, setVendorStats] = useState<VendorStat[] | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorError, setVendorError] = useState<string | null>(null);

  // Tab ke-3 modal Dashboard: "Kategori" (2026-09, REPLIKA PERSIS AuditPoOverseasPage.tsx --
  // kalau diubah, ingat sinkronkan ke sana & PiLocalPage.tsx juga) -- chart batang HORIZONTAL
  // jumlah baris per `kategori` (bukan per PT), dalam rentang tanggal SAMA dgn 2 tab lain.
  const [kategoriStats, setKategoriStats] = useState<VendorStat[] | null>(null);
  const [kategoriLoading, setKategoriLoading] = useState(true);
  const [kategoriError, setKategoriError] = useState<string | null>(null);

  // Daftar PT DINAMIS (2026-09, lihat `fetchDistinctNamaPt()`) -- dipakai seed tab "Per Vendor"
  // supaya PT yang benar-benar ada di data (bukan cuma 7 nama hardcode `PT_OPTIONS` lama) ikut
  // tampil sbg batang 0 kalau rentang tanggal tidak py dokumen bermasalah utk PT itu.
  const [ptOptions, setPtOptions] = useState<string[]>(PT_OPTIONS);
  useEffect(() => {
    fetchDistinctNamaPt('audit_po_ap_comp').then(setPtOptions);
  }, []);

  const fetchStats = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    const totalQuery = supabase.from('audit_po_ap_comp').select('*', { count: 'exact', head: true })
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    const bermasalahQuery = supabase.from('audit_po_ap_comp').select('*', { count: 'exact', head: true })
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

  // Ambil kolom `nama_pt` SAJA (bukan `select('*')`) utk baris yang `status_audit` terisi dalam
  // rentang tanggal -- dikelompokkan & dihitung di client.
  const fetchVendorStats = useCallback(async (from: string, to: string) => {
    setVendorLoading(true);
    setVendorError(null);
    const { data, error: fetchError } = await supabase.from('audit_po_ap_comp').select('nama_pt')
      .not('status_audit', 'is', null)
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    setVendorLoading(false);
    if (fetchError) { setVendorError(fetchError.message); return; }

    // Selalu mulai dari SEMUA `ptOptions` (daftar DINAMIS, lihat `fetchDistinctNamaPt()`)
    // bernilai 0 dulu (2026-09, permintaan user "kalau datanya tidak ada, tetap munculkan
    // grafiknya, angkanya 0, nama PT-nya tetap muncul") -- supaya chart TETAP tampil dgn semua
    // nama PT yang BENERAN ada di data + batang setinggi 0, bukan "Tidak ada data" polos,
    // biarpun rentang tanggal itu kosong/nol dokumen bermasalah. **BUKAN LAGI** `PT_OPTIONS`
    // hardcode 7 nama (2026-09, FIX bug laporan user "Per Vendor belum sync nama PT" -- kalau
    // ada PT baru/jarang di data, dulu tidak ikut ke-seed di sini, walau tetap muncul lewat loop
    // hasil query di bawah SELAMA PT itu py minimal 1 baris bermasalah dalam rentang tanggal ini
    // -- seed dari `ptOptions` memastikan tetap tampil 0 walau PT itu TIDAK py baris bermasalah
    // sama sekali di rentang ini).
    const counts: Record<string, number> = {};
    // "GENERAL" SENGAJA dikeluarkan dari chart ini (permintaan user 2026-09) -- bukan nama PT
    // spesifik, jadi tidak relevan ditampilkan sbg batang per-vendor.
    ptOptions.filter(pt => pt !== 'GENERAL').forEach(pt => { counts[pt] = 0; });
    (data || []).forEach((r: any) => {
      const pt = (r.nama_pt || '').trim() || 'TIDAK DIKETAHUI';
      if (pt === 'GENERAL') return;
      counts[pt] = (counts[pt] || 0) + 1;
    });
    const list = Object.entries(counts)
      .map(([pt, count]) => ({ pt, count }))
      .sort((a, b) => b.count - a.count);
    setVendorStats(list);
  }, [ptOptions]);

  // `kategori` bisa berisi GABUNGAN beberapa kategori (dipisah " + ") -- dipecah pakai
  // `parseKategoriMulti()`, tiap bagian dihitung TERPISAH. TIDAK di-seed ke semua
  // `KATEGORI_OPTIONS` (beda dari `fetchVendorStats` yg seed semua `PT_OPTIONS`) -- HANYA
  // kategori yg BENERAN ada datanya yg ditampilkan (descending), sesuai referensi user.
  const fetchKategoriStats = useCallback(async (from: string, to: string) => {
    setKategoriLoading(true);
    setKategoriError(null);
    const { data, error: fetchError } = await supabase.from('audit_po_ap_comp').select('kategori')
      .not('kategori', 'is', null)
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
    setKategoriLoading(false);
    if (fetchError) { setKategoriError(fetchError.message); return; }

    const counts: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      parseKategoriMulti(r.kategori).forEach(k => {
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    const list = Object.entries(counts)
      .map(([pt, count]) => ({ pt, count }))
      .sort((a, b) => b.count - a.count);
    setKategoriStats(list);
  }, []);

  useEffect(() => {
    fetchStats(appliedFrom, appliedTo);
    fetchVendorStats(appliedFrom, appliedTo);
    fetchKategoriStats(appliedFrom, appliedTo);
  }, [appliedFrom, appliedTo, fetchStats, fetchVendorStats, fetchKategoriStats]);

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
                Document Overview {stats ? `(${formatDateShort(appliedFrom)} - ${formatDateShort(appliedTo)})` : ''}
                <span className="text-rose-500">*</span>
              </h3>
              <h4 className="font-semibold text-slate-800 text-lg mt-1 pb-1 border-b-2 border-slate-800 inline-block">
                Audit AP Local
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

            {/* Tab switcher (2026-09) -- "Overview" (pie, sudah ada) & "Per Vendor" (batang,
                baru). ml-auto supaya nempel kanan panel filter, tidak ikut ke kiri berdesakan
                dgn 3 elemen filter tanggal di atas. */}
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
              <button
                onClick={() => setActiveTab('kategori')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeTab === 'kategori' ? 'bg-[#5A305A] text-white shadow-sm' : 'text-slate-500 hover:text-[#5A305A]'}`}
              >
                Kategori
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>
          )}

          {/* min-h SAMA utk kedua tab (2026-09, permintaan user "ukuran modal per tab jangan
              beda-beda") -- modal ini `max-h-[92vh] overflow-y-auto` (tinggi ikut konten), tanpa
              min-h yang disamakan, pindah tab Overview<->Per Vendor bikin modal "loncat" ukuran
              krn konten pie chart (dgn panel poin di sampingnya) vs chart batang beda tinggi
              natural-nya. flex+items-center supaya konten yang lebih pendek dari min-h tetap
              rata tengah vertikal, bukan nempel atas. */}
          <div className="min-h-[380px] mt-3 flex flex-col justify-center">
          {activeTab === 'overview' && (loading ? (
            <div className="text-center py-14 text-[#5A305A] text-sm">Memuat data...</div>
          ) : stats ? (
            <div className="flex max-lg:flex-col items-center gap-10 pl-8">
              <div className="shrink-0 space-y-3">
                <h4 className="font-bold text-slate-800 text-base whitespace-nowrap"># AP PO Local</h4>
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
                  <svg width={600} height={300} viewBox="0 0 600 300">
                    {(() => {
                      // r dinaikkan dari 90 -> 105 (~+17%, permintaan user "agak dibesarkan
                      // sedikit"), cx digeser 285 -> 300 supaya margin kiri/kanan ke garis
                      // callout label TETAP SAMA persis (cx - r = 195, IDENTIK dgn versi lama
                      // 285-90 -- lihat catatan "HITUNG ULANG margin ini SEBELUM ubah lebar
                      // modal/pie" di CLAUDE.md) -- viewBox/svg width ikut dilebarkan dari
                      // 570 -> 600 biar margin kanan (600-300=300) juga tetap simetris & cukup.
                      const cx = 300, cy = 150, r = 105;
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
                          {/* Efek "3D" (2026-09, permintaan user "buat pie-nya seperti 3D,
                              terlihat lebih hidup") -- BUKAN elips/ekstrusi beneran (itu akan
                              merusak perhitungan garis callout label yang asumsikan lingkaran
                              utuh, lihat komentar `polarPoint` di atas) -- gunakan kombinasi:
                              (1) radial gradient per slice (terang di pusat -> warna asli di
                              tepi, ilusi cahaya jatuh dari tengah kayak permukaan bola/dome),
                              (2) drop-shadow di bawah seluruh piringan (kesan piringan
                              "terangkat" dari kertas), (3) rim/garis tepi lebih gelap per slice
                              (batas antar slice lebih tegas, bukan flat polos). */}
                          <defs>
                            <filter id="auditPoPieShadow" x="-30%" y="-30%" width="160%" height="160%">
                              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.25" />
                            </filter>
                            {slices.map(s => (
                              <radialGradient key={`grad-${s.label}`} id={`auditPoPieGrad-${s.label.replace(/\s+/g, '')}`} cx="35%" cy="30%" r="75%">
                                <stop offset="0%" stopColor={lightenHex(s.color, 0.55)} />
                                <stop offset="65%" stopColor={s.color} />
                                <stop offset="100%" stopColor={darkenHex(s.color, 0.12)} />
                              </radialGradient>
                            ))}
                          </defs>
                          <g filter="url(#auditPoPieShadow)">
                            {slices.map(s => {
                              if (s.pct <= 0.05) return null;
                              const gradId = `url(#auditPoPieGrad-${s.label.replace(/\s+/g, '')})`;
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

          {activeTab === 'kategori' && (
            <KategoriTabContent loading={kategoriLoading} error={kategoriError} stats={kategoriStats} />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab "Per Vendor" modal Dashboard -- chart batang jumlah baris (`status_audit` terisi) per
// `nama_pt`, REPLIKA visual slide "Cost Controller - AP Local" yang diberikan user. Dipisah jadi
// komponen sendiri (bukan inline di DashboardModal) supaya JSX-nya tidak menumpuk terlalu dalam.
function VendorTabContent({ loading, error, stats }: { loading: boolean; error: string | null; stats: VendorStat[] | null }) {
  if (error) {
    return <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>;
  }
  if (loading) {
    return <div className="text-center py-14 text-[#5A305A] text-sm">Memuat data...</div>;
  }
  // `stats` cuma `null` sesaat sebelum fetch pertama selesai (loading sudah pasti true di titik
  // itu, jadi ditangkap cabang `loading` di atas) -- fallback array kosong murni jaga-jaga TS.
  const rows = stats || [];

  const totalDokumen = rows.reduce((sum, s) => sum + s.count, 0);
  const maxCount = rows.length > 0 ? Math.max(...rows.map(s => s.count)) : 0;
  // Semua nilai 0 (belum ada dokumen bermasalah di rentang ini) -- tetap tampilkan chart apa
  // adanya (2026-09, permintaan user), pakai skala placeholder kecil (0-10) supaya gridline-nya
  // tetap rapi, BUKAN skala pecahan aneh hasil `niceAxisStep(0)`.
  const step = maxCount > 0 ? niceAxisStep(maxCount) : 2;
  const axisTop = maxCount > 0 ? step * Math.ceil(maxCount / step) : 10;
  const gridlines = Array.from({ length: Math.round(axisTop / step) + 1 }, (_, i) => i * step);

  // Layout SVG -- margin kiri utk label sumbu Y, margin bawah utk label PT + judul sumbu X.
  const W = 640, H = 340;
  const marginLeft = 50, marginRight = 20, marginTop = 20, marginBottom = 60;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const barGap = 18;
  const barW = Math.min(70, (plotW - barGap * (rows.length + 1)) / rows.length);
  const scaleY = (val: number) => plotH - (val / axisTop) * plotH;

  // Kalimat "PT X dan PT Y yang sering ditemui" -- 2 PT dgn jumlah TERBANYAK (list sudah
  // disortir descending dari fetchVendorStats), REPLIKA kalimat Key Notes di slide contoh user.
  // Cuma ditampilkan kalau BENERAN ada dokumen bermasalah (maxCount > 0) -- kalau semua 0, klaim
  // "sering ditemui" jadi tidak masuk akal (tidak ada satu pun kejadian sama sekali).
  const top2 = maxCount > 0 ? rows.slice(0, 2).map(s => s.pt) : [];

  return (
    <div className="pl-8">
      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
          <g transform={`translate(${marginLeft},${marginTop})`}>
            {/* Gridline + label sumbu Y */}
            {gridlines.map(v => (
              <g key={v}>
                <line x1={0} y1={scaleY(v)} x2={plotW} y2={scaleY(v)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={-8} y={scaleY(v)} fontSize={11} fill="#64748b" textAnchor="end" dominantBaseline="middle">{v}</text>
              </g>
            ))}
            {/* Sumbu X */}
            <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#334155" strokeWidth={1.5} />

            {/* Batang + label nilai + label PT -- batang setinggi 0 (belum ada dokumen
                bermasalah utk PT itu) TETAP dirender apa adanya (tinggi 0 = tidak kelihatan,
                cuma garis dasar), label nilai "0" dipindah ke ATAS titik dasar (bukan "di dalam
                batang dekat puncak" spt batang normal) supaya tidak numpuk sama label nama PT
                di bawah sumbu X. */}
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

            {/* Judul sumbu */}
            <text x={plotW / 2} y={plotH + 42} fontSize={11} fill="#64748b" textAnchor="middle">NAMA PT</text>
            <text x={-marginLeft + 12} y={plotH / 2} fontSize={11} fill="#64748b" textAnchor="middle" transform={`rotate(-90, ${-marginLeft + 12}, ${plotH / 2})`}>Jumlah</text>
          </g>
        </svg>
      </div>
      <p className="text-xs text-slate-500 mt-3 max-w-2xl">
        * Key Notes: Visualisasi menunjukkan frekuensi vendor yang sudah masuk pada rentang tanggal
        terpilih. {top2.length === 2 && (
          <>Adapun <span className="font-bold">PT {top2[0]}</span> dan <span className="font-bold">PT {top2[1]}</span> yang sering ditemui dalam test atau verifikasi AI. </>
        )}
        Total vendor yang sudah uji coba sebanyak <span className="font-bold">{totalDokumen}</span> Dokumen.
      </p>
    </div>
  );
}

// Pecah label kategori jadi maks 2 baris (greedy word-wrap sederhana) -- dipakai label sumbu Y
// tabel "Kategori" (2026-09, REPLIKA PERSIS AuditPoOverseasPage.tsx) krn nama kategori bisa
// panjang, replika visual referensi user yang label panjangnya wrap 2 baris di kolom label kiri.
function wrapKategoriLabel(label: string, maxCharsPerLine = 24): string[] {
  const words = label.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

// Tab "Kategori" modal Dashboard (2026-09, REPLIKA PERSIS AuditPoOverseasPage.tsx -- kalau
// diubah, ingat sinkronkan ke sana & PiLocalPage.tsx juga) -- chart batang HORIZONTAL jumlah
// baris per `kategori`, HANYA kategori yang muncul di data (tidak di-seed 0 spt PT_OPTIONS).
function KategoriTabContent({ loading, error, stats }: { loading: boolean; error: string | null; stats: VendorStat[] | null }) {
  if (error) {
    return <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 break-words">{error}</div>;
  }
  if (loading) {
    return <div className="text-center py-14 text-[#5A305A] text-sm">Memuat data...</div>;
  }

  const rows = stats || [];
  if (rows.length === 0) {
    return <div className="py-14 text-center text-xs text-[#5A305A]/50">Tidak ada kategori tercatat di rentang ini.</div>;
  }

  const totalDokumen = rows.reduce((sum, s) => sum + s.count, 0);
  const maxCount = Math.max(...rows.map(s => s.count));
  const step = niceAxisStep(maxCount);
  const axisTop = step * Math.ceil(maxCount / step);
  const gridlines = Array.from({ length: Math.round(axisTop / step) + 1 }, (_, i) => i * step);

  const marginLeft = 190, marginRight = 30, marginTop = 10, marginBottom = 50;
  const rowH = 42, rowGap = 12;
  const plotW = 480;
  const plotH = rows.length * (rowH + rowGap) - rowGap;
  const W = marginLeft + plotW + marginRight;
  const H = marginTop + plotH + marginBottom;
  const scaleX = (val: number) => (val / axisTop) * plotW;

  const top2 = rows.slice(0, 2).map(s => s.pt);

  return (
    <div className="pl-8">
      <h4 className="font-bold text-slate-800 text-base mb-1">Kategori Terbanyak</h4>
      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full">
          <g transform={`translate(${marginLeft},${marginTop})`}>
            {gridlines.map(v => (
              <line key={v} x1={scaleX(v)} y1={0} x2={scaleX(v)} y2={plotH} stroke="#e2e8f0" strokeWidth={1} />
            ))}
            <line x1={0} y1={0} x2={0} y2={plotH} stroke="#334155" strokeWidth={1.5} />
            <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#334155" strokeWidth={1.5} />
            {gridlines.map(v => (
              <text key={`t-${v}`} x={scaleX(v)} y={plotH + 16} fontSize={11} fill="#64748b" textAnchor="middle">{v}</text>
            ))}

            {rows.map((s, i) => {
              const y = i * (rowH + rowGap);
              const barLen = scaleX(s.count);
              const barCenter = y + rowH / 2;
              const barTooNarrow = barLen < 26;
              const lines = wrapKategoriLabel(s.pt);
              const lineStartY = barCenter - ((lines.length - 1) * 6);
              return (
                <g key={s.pt}>
                  {lines.map((line, li) => (
                    <text key={li} x={-10} y={lineStartY + li * 12} fontSize={10} fill="#1e293b" textAnchor="end" dominantBaseline="middle">{line}</text>
                  ))}
                  <rect x={0} y={y} width={Math.max(barLen, 1)} height={rowH} fill="#5A305A" rx={2} />
                  <text
                    x={barTooNarrow ? barLen + 6 : barLen - 8}
                    y={barCenter}
                    fontSize={11}
                    fontWeight={700}
                    fill={barTooNarrow ? '#5A305A' : '#ffffff'}
                    textAnchor={barTooNarrow ? 'start' : 'end'}
                    dominantBaseline="middle"
                  >
                    {s.count}
                  </text>
                </g>
              );
            })}

            <text x={plotW / 2} y={plotH + 38} fontSize={11} fill="#64748b" textAnchor="middle">Jumlah</text>
            <text x={-marginLeft + 12} y={plotH / 2} fontSize={11} fill="#64748b" textAnchor="middle" transform={`rotate(-90, ${-marginLeft + 12}, ${plotH / 2})`}>Kategori</text>
          </g>
        </svg>
      </div>
      <p className="text-xs text-slate-500 mt-3 max-w-2xl">
        * Key Notes: Visualisasi menunjukkan frekuensi mayoritas kategori kesalahan terbanyak pada
        rentang tanggal terpilih. {top2.length === 2 && (
          <>Adapun kategori <span className="font-bold">{top2[0]}</span> dan <span className="font-bold">{top2[1]}</span> memiliki tingkat kesalahan yang sering ditemui. </>
        )}
        Total kategori tercatat sebanyak <span className="font-bold">{totalDokumen}</span> Dokumen.
      </p>
    </div>
  );
}

export default function AuditPoPage() {
  useEffect(() => { document.title = 'Audit AP Local · BeeHive'; }, []);
  const { canEdit } = useAuth();
  const canEditAuditPo = canEdit('audit_po');

  const [rows, setRows] = useState<AuditPoRow[]>([]);
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

  // Opsi dropdown filter PT -- DINAMIS dari data asli (2026-09, lihat `fetchDistinctNamaPt()`),
  // di-fetch SEKALI saat halaman dibuka, TIDAK bergantung pada filter/pagination apa pun.
  const [ptOptions, setPtOptions] = useState<string[]>(PT_OPTIONS);
  useEffect(() => {
    fetchDistinctNamaPt('audit_po_ap_comp').then(setPtOptions);
  }, []);

  // Reset semua filter panel (search/PT/Kategori/rentang tanggal) sekaligus ke default kosong
  // (2026-09, permintaan user, tombol ikon polos tanpa teks) -- TIDAK menyentuh `sortBy`/
  // `sortDir`/`pageSize`, itu bukan "filter" tapi preferensi tampilan/urutan tabel.
  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setPtFilter('');
    setKategoriFilter('');
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
  const [editRow, setEditRow] = useState<AuditPoRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<AuditPoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Debounce search text (Nomor PO / Vendor) -- tidak ada preseden di BunkerPage, ditambahkan
  // khusus di sini karena tabel ini besar & terus bertambah tiap 30 menit dari automasi.
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
    // nullsFirst: false -- baris tanpa kategori (null) SELALU di bawah, baik ASC maupun DESC
    // (2026-09, laporan user: sort default Postgres taruh NULL di ATAS saat ASC -- membingungkan
    // krn baris "kosong" jadi terlihat "duluan"). Berlaku aman jg utk created_at/nama_pt (kolom
    // itu jarang/tidak pernah null di data asli, jadi tidak mengubah perilaku sort yang sudah ada).
    let query = supabase.from('audit_po_ap_comp').select('*', { count: 'exact' }).order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      query = query.or(`nomor_po.ilike.%${s}%,vendor_name.ilike.%${s}%`);
    }
    if (ptFilter) query = query.eq('nama_pt', ptFilter);
    // .ilike (bukan .eq) -- 2026-09, sejak kolom `kategori` bisa berisi GABUNGAN beberapa
    // kategori (dipisah " + ", lihat KategoriPicker mode multi), exact match akan gagal cocok
    // ke baris yang kategori-nya digabung dgn kategori lain.
    if (kategoriFilter) query = query.ilike('kategori', `%${kategoriFilter}%`);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data as AuditPoRow[]);
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

  const handleRowSaved = (updated: AuditPoRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    showToast('Perubahan berhasil disimpan.');
  };

  const openDeleteConfirm = (r: AuditPoRow) => { setDeleteConfirmRow(r); setDeleteError(null); };

  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAuditPoRow(deleteConfirmRow.id);
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
    {/* Shell tinggi tetap -- lihat catatan lengkap di CLAUDE.md "Bunker -- kartu List selalu
        utuh" (2026-09), pola sama di-porting ke sini: kartu tabel SELALU utuh kelihatan (sudut
        membulat tidak pernah ke-scroll lewat viewport), cuma baris tabel yg scroll internal. */}
    <div className="flex-1 h-full flex flex-col overflow-hidden min-w-0">
      <header className="px-3 pt-1 pb-1 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h1 className="font-bold text-[#5A305A] text-base leading-tight">Audit AP Local</h1>
              <p className="text-xs font-light text-[#5A305A] mt-0.5">Hasil audit PO/vendor otomatis</p>
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
            <table className="w-full text-[11px] bg-white table-fixed min-w-[980px]">
              <colgroup>
                <col style={{ width: '135px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '185px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '115px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '105px' }} />
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Tanggal & Waktu" sortKey="created_at" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Nama PT" sortKey="nama_pt" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Nomor PO</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Vendor</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Status Audit</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">
                    <SortableHeader label="Kategori" sortKey="kategori" activeSort={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Durasi</th>
                  <th className="text-center font-semibold px-3 py-2.5 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingList ? (
                  <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data Audit AP Local.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{formatDateTimeID(r.created_at)}</td>
                      <td className="px-3 py-3 align-top"><PtBadge pt={r.nama_pt} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] font-semibold break-words">{r.nomor_po || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{r.vendor_name || '-'}</td>
                      <td className="px-3 py-3 align-top"><StatusBadge status={r.status_audit} /></td>
                      {/* Arah buka dropdown Kategori (atas/bawah) SEKARANG dihitung otomatis oleh
                          `KategoriPicker` sendiri (portal ke document.body + posisi dari
                          getBoundingClientRect), TIDAK LAGI ditebak dari index baris seperti
                          sebelumnya -- lihat komentar panjang di `KategoriPicker` soal kenapa
                          tebakan berbasis index gagal saat baris tabel cuma sedikit (2026-09). */}
                      <td className="px-3 py-3 align-top"><KategoriCell row={r} onChanged={handleKategoriChanged} canEdit={canEditAuditPo} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] truncate" title={r.durasi_text || undefined}>{r.durasi_text || '-'}</td>
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
                              {canEditAuditPo && (
                                <button
                                  onClick={() => { setEditRow(r); }}
                                  title="Edit"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil size={10} /> Edit
                                </button>
                              )}
                              {canEditAuditPo && (
                                <button
                                  onClick={() => { openDeleteConfirm(r); }}
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
                                  }}
                                  title="Preview PDF"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileDown size={10} /> PDF
                                </button>
                              ) : (
                                <span className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-100 bg-white text-[9px] font-semibold text-slate-300">
                                  <FileDown size={10} /> PDF
                                </span>
                              )}
                              {r.url_html ? (
                                <button
                                  onClick={() => {
                                    const src = buildPreviewSrc(r.drive_file_id_html, r.url_html);
                                    if (src) setPreviewTarget({ title: `Hasil Audit — ${r.nomor_po || r.vendor_name || r.id}`, src, externalUrl: r.url_html!, kind: 'html' });
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
      <EditAuditPoModal record={editRow} onClose={() => setEditRow(null)} onSaved={handleRowSaved} />
    )}

    {deleteConfirmRow && (
      <DeleteAuditPoModal
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
