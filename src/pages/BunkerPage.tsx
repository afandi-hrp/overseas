import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Fuel, UploadCloud, Clock, X, CheckCircle2, AlertTriangle, ClipboardList, FileCheck2, Trash2, Search, RefreshCw } from 'lucide-react';
import {
  formatDateTimeID, summaryStatusMeta, STATUS_WORKFLOW_OPTIONS, workflowMeta, updateBunkerDokumen,
} from '../utils/BunkerHelpers';
import BunkerUploadModal from '../components/BunkerUploadModal';
import BunkerKelengkapanModal from '../components/BunkerKelengkapanModal';
import BunkerCompareDocModal from '../components/BunkerCompareDocModal';
import Greeting from '../components/Greeting';

// ── Kontrak data (Supabase, sudah dibuat backend n8n -- lihat BunkerHelpers.ts) ──
// bunker_dokumen (1 baris = 1 No PO): no_po, no_po_key(unik, internal), vendor, kapal, lokasi,
//   kelengkapan_status(jsonb), table_kelengkapan(jsonb), matrix_perbandingan(jsonb), summary(jsonb),
//   source_files(jsonb array), status(sistem, read-only), status_workflow(bebas diedit), catatan_manual(bebas diedit)
// bunker_processing_queue (1 baris = 1 batch upload): id(=job_id), status, file_names, total_files,
//   bunker_dokumen_id, status_summary, error_message

const QueueCard: React.FC<{ item: any; onDismiss: (id: string) => void; onOpenCompare: (bunkerDokumenId: string) => void }> = ({ item, onDismiss, onOpenCompare }) => {
  let filenames: string[] = [];
  try {
    if (typeof item.file_names === 'string') filenames = JSON.parse(item.file_names);
    else if (Array.isArray(item.file_names)) filenames = item.file_names;
  } catch { /* ignore */ }
  const filesStr = filenames.join(', ');
  const time = new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  if (item.status === 'PENDING') {
    return (
      <div className="relative bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm">
        <div className="font-bold text-amber-800 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          Sedang diproses...
        </div>
        <div className="text-amber-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-amber-700/70 text-xs">Dikirim: {time}</div>
      </div>
    );
  }

  if (item.status === 'FAILED') {
    return (
      <div className="relative bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm pr-8">
        <button onClick={() => onDismiss(item.id)} className="absolute top-2.5 right-3 text-rose-400 hover:text-rose-600 font-bold text-lg leading-none">&times;</button>
        <div className="font-bold text-rose-800 flex items-center gap-2">❌ Gagal diproses</div>
        <div className="text-rose-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-rose-700/80 text-xs break-words">Error: {item.error_message || '-'}</div>
      </div>
    );
  }

  // SUCCESS
  return (
    <button
      onClick={() => item.bunker_dokumen_id && onOpenCompare(item.bunker_dokumen_id)}
      className="relative bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm flex flex-col gap-2 shadow-sm pr-8 text-left w-full hover:bg-emerald-100 transition-colors"
    >
      <span onClick={(e) => { e.stopPropagation(); onDismiss(item.id); }} className="absolute top-2.5 right-3 text-emerald-500 hover:text-emerald-700 font-bold text-lg leading-none cursor-pointer">&times;</span>
      <div className="font-bold text-emerald-800 flex items-center gap-2">✅ Berhasil diproses{item.status_summary ? ` — ${item.status_summary}` : ''}</div>
      <div className="text-emerald-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
    </button>
  );
};

function DeleteConfirmModal({ record, onConfirm, onClose, deleting, error }: {
  record: any; onConfirm: () => void; onClose: () => void; deleting: boolean; error: string | null;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-[#5A305A] leading-tight">Hapus Data No PO Ini?</h3>
            <p className="text-xs text-[#5A305A]/70 mt-0.5 truncate">{record.no_po || record.id}</p>
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

function StatusBadge({ status }: { status: string | null }) {
  const meta = summaryStatusMeta(status);
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${meta.badgeClass}`}>{meta.label}</span>;
}

function WorkflowSelect({ row, onChanged, canEdit }: { row: any; onChanged: () => void; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);
  const meta = workflowMeta(row.status_workflow);

  const handleChange = async (val: string) => {
    setSaving(true);
    await updateBunkerDokumen(row.id, { status_workflow: val });
    setSaving(false);
    onChanged();
  };

  if (!canEdit) {
    return <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${meta.badgeClass}`}>{meta.label}</span>;
  }

  return (
    <select
      value={row.status_workflow || 'BARU'}
      onChange={e => handleChange(e.target.value)}
      disabled={saving}
      className={`text-[10px] font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer disabled:opacity-50 ${meta.badgeClass}`}
    >
      {STATUS_WORKFLOW_OPTIONS.map(opt => (
        <option key={opt} value={opt}>{workflowMeta(opt).label}</option>
      ))}
    </select>
  );
}

export default function BunkerPage() {
  useEffect(() => { document.title = 'Bunker · Shipment'; }, []);
  const { canEdit: canEditPage } = useAuth();
  const canEditBunker = canEditPage('bunker');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | null>(null);
  const [activeJobError, setActiveJobError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [queue, setQueue] = useState<any[]>([]);
  const [kelengkapanRow, setKelengkapanRow] = useState<any | null>(null);
  const [compareRow, setCompareRow] = useState<any | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const startIndex = (page - 1) * pageSize;
    let query = supabase.from('bunker_dokumen').select('*', { count: 'exact' }).order('updated_at', { ascending: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, '');
      query = query.or(`no_po.ilike.%${s}%,vendor.ilike.%${s}%,kapal.ilike.%${s}%`);
    }
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error, count } = await query.range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data);
      setTotalRecords(count || 0);
    }
    setLoadingList(false);
  }, [page, pageSize, search, statusFilter]);

  const fetchQueue = useCallback(async () => {
    const { data } = await supabase
      .from('bunker_processing_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      // bunker_processing_queue tidak punya kolom "is_read" -- SUCCESS ditampilkan selama masih
      // masuk 20 job terbaru; user bisa dismiss manual (hapus baris queue-nya) kalau sudah tidak perlu.
      setQueue(data.filter((q: any) => q.status === 'PENDING' || q.status === 'FAILED' || q.status === 'SUCCESS'));
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchQueue();
    const iv = setInterval(fetchQueue, 5000);
    return () => clearInterval(iv);
  }, [fetchQueue]);

  // Polling job spesifik untuk feedback langsung setelah submit upload di halaman ini
  useEffect(() => {
    if (!activeJobId || activeJobStatus !== 'PENDING') return;
    const iv = setInterval(async () => {
      const { data } = await supabase.from('bunker_processing_queue').select('*').eq('id', activeJobId).maybeSingle();
      if (data) {
        if (data.status === 'SUCCESS') {
          setActiveJobStatus('SUCCESS');
          fetchList();
          fetchQueue();
        } else if (data.status === 'FAILED') {
          setActiveJobStatus('FAILED');
          setActiveJobError(data.error_message || 'Gagal memproses dokumen.');
          fetchQueue();
        }
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [activeJobId, activeJobStatus, fetchList, fetchQueue]);

  const handleJobStarted = (jobId: string) => {
    setActiveJobId(jobId);
    setActiveJobStatus('PENDING');
    setActiveJobError(null);
    fetchQueue();
  };

  const handleSentNoJob = (message: string, isWarning: boolean) => {
    setToastMessage((isWarning ? '⚠️ ' : '') + message);
    setTimeout(() => setToastMessage(null), isWarning ? 8000 : 6000);
    fetchQueue();
  };

  const dismissQueueItem = async (id: string) => {
    await supabase.from('bunker_processing_queue').delete().eq('id', id);
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const openCompareFromQueue = async (bunkerDokumenId: string) => {
    const { data } = await supabase.from('bunker_dokumen').select('*').eq('id', bunkerDokumenId).maybeSingle();
    if (data) setCompareRow(data);
    else setToastMessage('⚠️ Data dokumen untuk antrian ini tidak ditemukan.');
  };

  const openDeleteConfirm = (r: any) => { setDeleteConfirmRow(r); setDeleteError(null); };

  // Sesuai kontrak: hapus LANGSUNG ke bunker_dokumen (bukan lewat n8n/RPC). Baris
  // bunker_processing_queue lama tetap ada, cuma bunker_dokumen_id-nya jadi kosong (backend).
  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from('bunker_dokumen').delete().eq('id', deleteConfirmRow.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setRows(prev => prev.filter(row => row.id !== deleteConfirmRow.id));
    setToastMessage('Data berhasil dihapus.');
    setTimeout(() => setToastMessage(null), 4000);
    setDeleteConfirmRow(null);
    fetchList();
  };

  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const validPage = Math.min(page, totalPages);
  const listStartIndex = (validPage - 1) * pageSize;

  return (
    <>
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 font-medium text-sm z-[9999] min-w-[300px]">
          <div className="flex items-center gap-3">
            {toastMessage.includes('⚠️') ? <span className="text-amber-400 text-lg">⚠️</span> : <span className="text-emerald-400 text-lg">✅</span>}
            <span className="leading-tight max-w-[400px]">{toastMessage.replace('⚠️ ', '')}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-[#5A305A] hover:text-white p-1 ml-4">&times;</button>
        </div>
      )}

      <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10 no-scrollbar">
        <header className="px-6 pt-1 pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Fuel size={20} />
              </div>
              <div>
                <h1 className="font-bold text-[#5A305A] text-base leading-tight">Bunker</h1>
                <p className="text-xs font-light text-[#5A305A] mt-0.5">Verifikasi dokumen Bunker</p>
              </div>
            </div>
            <Greeting />
          </div>
        </header>

        <main className="px-6 py-4 space-y-5">

          {activeJobId && activeJobStatus === 'PENDING' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Dokumen sedang diproses AI...</p>
                <p className="text-xs text-amber-700 mt-0.5">Halaman ini akan otomatis memperbarui daftar begitu selesai.</p>
              </div>
            </div>
          )}
          {activeJobId && activeJobStatus === 'SUCCESS' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <p className="text-sm font-bold text-emerald-800">Dokumen berhasil diproses dan sudah muncul di daftar.</p>
              </div>
              <button onClick={() => { setActiveJobId(null); setActiveJobStatus(null); }} className="text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
            </div>
          )}
          {activeJobId && activeJobStatus === 'FAILED' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-rose-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-rose-800">Gagal memproses dokumen.</p>
                  <p className="text-xs text-rose-700 mt-0.5">{activeJobError}</p>
                </div>
              </div>
              <button onClick={() => { setActiveJobId(null); setActiveJobStatus(null); }} className="text-rose-600 hover:text-rose-800"><X size={16} /></button>
            </div>
          )}

          {/* List */}
          <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-white/60 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-[#5A305A] shrink-0">Daftar Dokumen Bunker</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 rounded-full pl-3.5 pr-3 py-1.5 border border-slate-200 bg-white shrink-0">
                  <Search size={13} className="text-[#5A305A]/50 shrink-0" />
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Cari No PO / Vendor / Kapal..."
                    className="border-0 bg-transparent text-xs text-[#5A305A] focus:outline-none w-36"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="rounded-full px-3 py-2 border border-slate-200 bg-white text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer shrink-0"
                >
                  <option value="">Semua Status</option>
                  <option value="LOLOS VERIFIKASI">Lolos Verifikasi</option>
                  <option value="BUTUH REVIEW">Butuh Review</option>
                </select>
                <button
                  onClick={() => { fetchList(); fetchQueue(); }}
                  disabled={loadingList}
                  className="px-3 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 h-[34px]"
                >
                  <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  onClick={() => setShowQueuePanel(o => !o)}
                  className="relative px-3 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 h-[34px]"
                >
                  <Clock size={14} /> Antrian Proses
                  {queue.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      {queue.length}
                    </span>
                  )}
                </button>
                {canEditBunker && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-3 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 h-[34px]"
                  >
                    <UploadCloud size={14} /> Upload Dokumen
                  </button>
                )}
                <div className="flex items-center gap-2 rounded-full pl-3.5 pr-2.5 py-1 h-[34px] border border-slate-200 bg-white shrink-0">
                  <span className="text-[10px] text-[#5A305A] font-bold uppercase tracking-wide">Items</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="border-0 bg-transparent text-xs font-semibold text-[#5A305A] focus:outline-none cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] bg-white">
                <thead>
                  <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50">
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">No PO</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Vendor</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Kapal</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Lokasi</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Status</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Status Workflow</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">Terakhir Diupdate</th>
                    <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingList ? (
                    <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data Bunker. Klik "Upload Dokumen" untuk memulai.</td></tr>
                  ) : (
                    rows.map(r => (
                      <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 align-top text-[#5A305A] font-semibold whitespace-nowrap">{r.no_po || '-'}</td>
                        <td className="px-3 py-3 align-top text-[#5A305A]">{r.vendor || '-'}</td>
                        <td className="px-3 py-3 align-top text-[#5A305A]">{r.kapal || '-'}</td>
                        <td className="px-3 py-3 align-top text-[#5A305A]">{r.lokasi || '-'}</td>
                        <td className="px-3 py-3 align-top"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-3 align-top"><WorkflowSelect row={r} onChanged={fetchList} canEdit={canEditBunker} /></td>
                        <td className="px-3 py-3 align-top text-[#5A305A] whitespace-nowrap">{formatDateTimeID(r.updated_at)}</td>
                        <td className="px-2 py-3 align-top sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-10 border-l border-slate-200 transition-colors">
                          <div className="flex flex-col gap-1 w-[110px]">
                            <button
                              onClick={() => setKelengkapanRow(r)}
                              title="Kelengkapan Dokumen"
                              className="w-full flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                            >
                              <FileCheck2 size={10} /> Kelengkapan
                            </button>
                            <button
                              onClick={() => setCompareRow(r)}
                              title="Compare Doc"
                              className="w-full flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 text-[9px] font-semibold text-[#5A305A] hover:bg-slate-100 transition-colors"
                            >
                              <ClipboardList size={10} /> Compare Doc
                            </button>
                            {canEditBunker && (
                              <button
                                onClick={() => openDeleteConfirm(r)}
                                title="Hapus"
                                className="w-full flex items-center gap-1 px-1.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-[9px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                              >
                                <Trash2 size={10} /> Hapus
                              </button>
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

      {kelengkapanRow && (
        <BunkerKelengkapanModal record={kelengkapanRow} onClose={() => setKelengkapanRow(null)} onChanged={fetchList} canEdit={canEditBunker} />
      )}

      {compareRow && (
        <BunkerCompareDocModal record={compareRow} onClose={() => setCompareRow(null)} onChanged={fetchList} canEdit={canEditBunker} />
      )}

      {deleteConfirmRow && (
        <DeleteConfirmModal
          record={deleteConfirmRow}
          deleting={deleting}
          error={deleteError}
          onClose={() => setDeleteConfirmRow(null)}
          onConfirm={confirmDelete}
        />
      )}

      {showUploadModal && (
        <BunkerUploadModal
          onClose={() => setShowUploadModal(false)}
          onJobStarted={handleJobStarted}
          onSentNoJob={handleSentNoJob}
        />
      )}

      {/* Antrian proses -- modal, bukan panel inline, supaya posisi munculnya selalu konsisten
          di tengah layar (pola sama seperti halaman FAR Overseas). */}
      {showQueuePanel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[85vw] max-w-6xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <Clock size={19} className="text-[#5A305A]" />
                <h2 className="text-lg font-bold text-[#5A305A]">Antrian Proses</h2>
              </div>
              <button onClick={() => setShowQueuePanel(false)} className="text-[#5A305A] hover:text-[#5A305A] p-1"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              {queue.length === 0 ? (
                <p className="text-sm text-[#5A305A] italic text-center py-8">Tidak ada antrian dokumen.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {queue.map(item => <QueueCard key={item.id} item={item} onDismiss={dismissQueueItem} onOpenCompare={openCompareFromQueue} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}