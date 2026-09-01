import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardCheck, Search, RefreshCw, FileDown, FileText, Check, ChevronDown, Pencil, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
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
            <select
              value={namaPt}
              onChange={e => setNamaPt(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            >
              <option value="">- Pilih PT -</option>
              {PT_OPTIONS.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#5A305A] mb-1 block">Nomor PO</label>
            <input
              value={nomorPo}
              onChange={e => setNomorPo(e.target.value)}
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
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
              list="status-audit-suggestions"
              placeholder="Pilih dari saran atau ketik catatan manual (mis. keterangan error)..."
              className="w-full rounded-xl px-3 py-2 border border-slate-200 bg-white text-sm text-[#5A305A] focus:outline-none focus:ring-1 focus:ring-[#5A305A]/30"
            />
            <datalist id="status-audit-suggestions">
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

export default function AuditPoPage() {
  useEffect(() => { document.title = 'Audit AP Local · Shipment'; }, []);
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
  const [statusFilter, setStatusFilter] = useState('');
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
    let query = supabase.from('audit_po_ap_comp').select('*', { count: 'exact' }).order(sortBy, { ascending: sortDir === 'asc' });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      query = query.or(`nomor_po.ilike.%${s}%,vendor_name.ilike.%${s}%`);
    }
    if (ptFilter) query = query.eq('nama_pt', ptFilter);
    if (statusFilter) query = query.eq('status_audit', statusFilter);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data as AuditPoRow[]);
      setTotalRecords(count || 0);
    }
    setLoadingList(false);
  }, [page, pageSize, search, ptFilter, statusFilter, dateFrom, dateTo, sortBy, sortDir]);

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
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10 no-scrollbar">
      <header className="px-6 pt-1 pb-2">
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

      <main className="px-6 py-4 space-y-5">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-white/60 flex items-center justify-end gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 rounded-full pl-3.5 pr-3 py-1.5 border border-slate-200 bg-white shrink-0">
                <Search size={13} className="text-[#5A305A]/50 shrink-0" />
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Cari No PO / Vendor..."
                  className="border-0 bg-transparent text-xs text-[#5A305A] focus:outline-none w-36"
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
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer shrink-0"
              >
                <option value="">Semua Status</option>
                <option value="Selesai Diproses">Selesai Diproses</option>
                <option value="Doc tidak terbaca">Doc Tidak Terbaca</option>
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none shrink-0"
              />
              <span className="text-[#5A305A]/50 text-xs shrink-0">s/d</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none shrink-0"
              />
              <button
                onClick={() => fetchList()}
                disabled={loadingList}
                className="px-3 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 h-[34px]"
              >
                <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} /> Refresh
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

          <div className="overflow-x-auto">
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
              <thead>
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
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Kategori</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Durasi</th>
                  <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingList ? (
                  <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data Audit AP Local.</td></tr>
                ) : (
                  rows.map(r => (
                    <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 align-top text-[#5A305A] break-words">{formatDateTimeID(r.created_at)}</td>
                      <td className="px-3 py-3 align-top"><PtBadge pt={r.nama_pt} /></td>
                      <td className="px-3 py-3 align-top text-[#5A305A] font-semibold break-words">{r.nomor_po || '-'}</td>
                      <td className="px-3 py-3 align-top text-[#5A305A] truncate" title={r.vendor_name || undefined}>{r.vendor_name || '-'}</td>
                      <td className="px-3 py-3 align-top"><StatusBadge status={r.status_audit} /></td>
                      <td className="px-3 py-3 align-top"><KategoriCell row={r} onChanged={handleKategoriChanged} canEdit={canEditAuditPo} /></td>
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
                              {canEditAuditPo && (
                                <button
                                  onClick={() => { setEditRow(r); setOpenActionsRowId(null); }}
                                  title="Edit"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <Pencil size={10} /> Edit
                                </button>
                              )}
                              {canEditAuditPo && (
                                <button
                                  onClick={() => { openDeleteConfirm(r); setOpenActionsRowId(null); }}
                                  title="Hapus"
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[9px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                                >
                                  <Trash2 size={10} /> Hapus
                                </button>
                              )}
                              {r.url_pdf ? (
                                <a
                                  href={r.url_pdf}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Download PDF"
                                  onClick={() => setOpenActionsRowId(null)}
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileDown size={10} /> Download PDF
                                </a>
                              ) : (
                                <span className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-100 bg-white text-[9px] font-semibold text-slate-300">
                                  <FileDown size={10} /> Download PDF
                                </span>
                              )}
                              {r.url_html ? (
                                <a
                                  href={r.url_html}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Download Hasil Audit"
                                  onClick={() => setOpenActionsRowId(null)}
                                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-slate-200 bg-white text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                                >
                                  <FileText size={10} /> Hasil Audit
                                </a>
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
