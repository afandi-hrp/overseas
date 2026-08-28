import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle2, FileCheck2, UploadCloud, X, AlertTriangle, Clock, ClipboardCheck, ClipboardList, Edit3, Save, Scale, Trash2, RefreshCw, ChevronDown, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { formatMoney, formatDateID, APPROVAL_STATUS_META, COST_STATUS_META, REKAPAN_EDITABLE_FIELDS, updateRekapanFarOverseasAir, parseRouteNote, matchOctagonTarif, computeExpectedFromRate, computeCostStatus } from '../utils/FarOverseasAirHelpers';
import { useAuth } from '../lib/AuthContext';
import { EditableCell } from '../components/FarOverseasAirEditableField';
import FarOverseasAirDetailModal from '../components/FarOverseasAirDetailModal';
import FarOverseasAirCostValidationModal from '../components/FarOverseasAirCostValidationModal';
import FarOverseasAirWeightBreakdownModal from '../components/FarOverseasAirWeightBreakdownModal';
import FarOverseasAirUploadModal from '../components/FarOverseasAirUploadModal';
import ExportModal from '../components/ExportModal';

// Sapaan + ikon waktu -- pola sama seperti halaman Audit/Rekapan Courier & Sea & Air
// (SharedDataTable.tsx, getGreetingMeta), disamakan di sini karena tombol aksi header pindah
// posisi ke sebelah "Items" pada kartu List Memo.
function getGreetingMeta(date: Date) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return { text: 'Selamat pagi', Icon: Sunrise };
  if (hour >= 11 && hour < 15) return { text: 'Selamat siang', Icon: Sun };
  if (hour >= 15 && hour < 18) return { text: 'Selamat sore', Icon: Sunset };
  return { text: 'Selamat malam', Icon: Moon };
}

const QueueCard: React.FC<{ item: any; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => {
  let filenames: string[] = [];
  try {
    if (typeof item.file_names === 'string') filenames = JSON.parse(item.file_names);
    else if (Array.isArray(item.file_names)) filenames = item.file_names;
  } catch { /* ignore */ }
  const filesStr = filenames.join(', ');
  const time = new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  if (item.status === 'PENDING' || item.status === 'PROCESSING') {
    return (
      <div className="relative bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm">
        <div className="font-bold text-amber-800 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Sedang diproses...
        </div>
        <div className="text-amber-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-amber-700/70 text-[10px]">Dikirim: {time}</div>
      </div>
    );
  }

  if (item.status === 'FAILED') {
    return (
      <div className="relative bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm pr-6">
        <button onClick={() => onDismiss(item.id)} className="absolute top-2 right-2 text-rose-400 hover:text-rose-600 font-bold">&times;</button>
        <div className="font-bold text-rose-800 flex items-center gap-1.5">❌ Gagal diproses</div>
        <div className="text-rose-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
        <div className="text-rose-700/80 text-[10px] break-words">Error: {item.error_message || '-'}{item.error_step ? ` (${item.error_step})` : ''}</div>
      </div>
    );
  }

  // SUCCESS unread
  return (
    <div className="relative bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm pr-6">
      <button onClick={() => onDismiss(item.id)} className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 font-bold">&times;</button>
      <div className="font-bold text-emerald-800 flex items-center gap-1.5">✅ Berhasil diproses</div>
      <div className="text-emerald-900 truncate" title={filesStr}>File: {filesStr || '-'}</div>
    </div>
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
            <h3 className="font-bold text-[#5A305A] leading-tight">Hapus Memo Ini?</h3>
            <p className="text-xs font-light text-[#5A305A]/70 mt-0.5 truncate">{record.po_ori || record.id}</p>
          </div>
        </div>
        <p className="text-sm text-[#5A305A] leading-relaxed mb-1">
          Menghapus memo ini akan menghapus juga data cost validation terkait.
        </p>
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

function ApprovalBadge({ status, compact }: { status: string | null; compact?: boolean }) {
  const meta = APPROVAL_STATUS_META[status || 'PENDING'] || APPROVAL_STATUS_META.PENDING;
  const cls = compact ? 'text-[8.5px] font-bold px-1.5 py-0.5 rounded-full leading-tight' : 'text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap';
  return <span className={`${cls} ${meta.badgeClass}`}>{meta.label}</span>;
}

function CostBadge({ status, compact }: { status: string | null | undefined; compact?: boolean }) {
  const cls = compact ? 'text-[8.5px] font-bold px-1.5 py-0.5 rounded-full leading-tight' : 'text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap';
  if (!status) return <span className={`${cls} bg-slate-100 text-[#5A305A]`}>Belum Ada Data</span>;
  const meta = COST_STATUS_META[status];
  if (!meta) return <span className={`${cls} bg-slate-100 text-[#5A305A]`}>{status}</span>;
  return <span className={`${cls} ${meta.badgeClass}`}>{meta.label}</span>;
}

// Replika urutan kolom sheet Excel acuan — 1 kolom = 1 field database, jangan diringkas.
// Kolom yang punya `field` bisa diedit inline (baris yang sedang di Mode Edit); kolom yang
// cuma punya `render` murni tampilan (badge, tombol, hasil hitungan) dan tidak bisa diedit langsung.
type ListRenderCtx = {
  onOpenWeightModal: (r: any) => void;
  editingRowId: string | null;
  getVal: (r: any, field: string) => any;
  setVal: (r: any, field: string, value: any) => void;
  expandedPoRows: Set<string>;
  togglePoExpanded: (id: string) => void;
};

type ListColumn = {
  header: string;
  align?: 'left' | 'right';
  field?: string;
  inputType?: 'text' | 'number' | 'date';
  wide?: boolean;
  format?: (v: any, r: any) => React.ReactNode;
  render?: (r: any, idx: number, costStatus: string | undefined, ctx: ListRenderCtx) => React.ReactNode;
};

const fmtWithCurrency = (currencyField: string) => (v: any, r: any) => formatMoney(v, r[currencyField]);

const fmtTotalAmount = (v: any, r: any) => {
  const showIdrHint = r.total_amount_currency && r.total_amount_currency !== 'IDR' && r.total_amount_idr != null;
  return (
    <span>
      {formatMoney(v, r.total_amount_currency)}
      {showIdrHint && <span className="text-[#5A305A]/60 ml-1">(≈ Rp {Number(r.total_amount_idr).toLocaleString('id-ID')})</span>}
    </span>
  );
};

// Lebar PIKSEL TETAP (bukan persen) per kolom field -- lihat catatan panjang di render <td>
// di bawah: lebar persen ("w-full") pada <input> di dalam tabel "table-layout: auto" tidak
// bisa dihitung andal, jadi SEMUA kolom field (bukan cuma yang wide) butuh lebar tetap eksplisit
// supaya inputnya selalu tampil besar & teks yang diedit selalu kebaca saat mode edit.
const colWidthClass = (col: ListColumn): string => {
  if (col.wide) return 'w-[300px]';
  if (col.inputType === 'date') return 'w-[130px]';
  if (col.inputType === 'number') return 'w-[120px]';
  return 'w-[150px]';
};

const LIST_COLUMNS: ListColumn[] = [
    { header: 'NO', render: (_r, idx) => idx + 1 },
    {
      // Sama seperti pola PO. No di halaman Audit Sea & Air: tampilkan 1 PO paling atas,
      // sisanya disembunyikan di balik tombol "+N PO" -- po_ori di sini adalah 1 string
      // gabungan "PO1 + PO2 + ...", jadi di-split dulu baru dipotong tampilannya.
      header: 'NO PO',
      render: (r, _idx, _costStatus, ctx) => {
        const editing = ctx.editingRowId === r.id;
        const val = ctx.getVal(r, 'po_ori');
        const edited = Array.isArray(r.edited_fields) && r.edited_fields.includes('po_ori');
        if (editing) {
          return (
            <EditableCell
              value={val}
              editable
              edited={edited}
              className="w-[300px] whitespace-normal break-words"
              onChange={(v) => ctx.setVal(r, 'po_ori', v)}
            />
          );
        }
        const parts = typeof val === 'string' ? val.split('+').map((s: string) => s.trim()).filter(Boolean) : [];
        if (parts.length === 0) {
          return <span className="italic text-slate-400 text-xs">-</span>;
        }
        const isExpanded = ctx.expandedPoRows.has(r.id);
        return (
          <div className="w-[260px] flex items-start gap-1.5">
            <div className="whitespace-normal break-words leading-snug flex-1">
              {isExpanded ? parts.join(' + ') : parts[0]}
            </div>
            {parts.length > 1 && (
              <button
                onClick={() => ctx.togglePoExpanded(r.id)}
                className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100 font-bold whitespace-nowrap shrink-0"
              >
                {isExpanded ? 'Hide' : `+${parts.length - 1} PO`}
              </button>
            )}
            {edited && <Edit3 size={11} className="text-amber-500 shrink-0 mt-0.5" />}
          </div>
        );
      }
    },
    { header: 'VENDOR', field: 'vendor', wide: true },
    { header: 'SHIP VIA', field: 'ship_via' },
    { header: 'INVOICE NO', field: 'no_invoice' },
    { header: 'INVOICE DATE', field: 'invoice_date', inputType: 'date', format: v => formatDateID(v) },
    // departure_date SELALU kosong dari hasil ekstraksi otomatis (Gemini tidak pernah isi ini) --
    // wajib diisi manual oleh user di sini. Dipakai sebagai field "Departure Date" di memo cetak
    // (FarOverseasAirDetailModal.tsx), TERPISAH dari invoice_date.
    { header: 'DEPARTURE DATE', field: 'departure_date', inputType: 'date', format: v => formatDateID(v) },
    { header: 'QTY', field: 'qty', inputType: 'number', align: 'right' },
    { header: 'WEIGHT', field: 'weight_unit' },
    {
      header: 'WEIGHT BREAKDOWN',
      render: (r, _idx, _costStatus, ctx) => {
        const edited = Array.isArray(r.edited_fields) && r.edited_fields.includes('weight_breakdown');
        return (
          <div className="w-[260px] flex flex-col gap-1.5">
            <div className="whitespace-normal break-words leading-snug flex items-start gap-1">
              <span>{r.weight_breakdown || <span className="italic text-slate-400">Belum diisi</span>}</span>
              {edited && <span className="shrink-0"><Edit3 size={11} className="text-amber-500 inline-block" /></span>}
            </div>
            <button onClick={() => ctx.onOpenWeightModal(r)} className="self-start text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1">
              <Scale size={11} /> {r.weight_breakdown ? 'Edit Breakdown' : 'Isi Breakdown'}
            </button>
          </div>
        );
      }
    },
    { header: 'UNIT PRICE', field: 'unit_price', inputType: 'number', align: 'right', format: fmtWithCurrency('unit_price_currency') },
    { header: 'AMOUNT', field: 'freight_amount', inputType: 'number', align: 'right', format: fmtWithCurrency('total_amount_currency') },
    { header: 'CLEARANCE', field: 'clearance_amount', inputType: 'number', align: 'right', format: fmtWithCurrency('total_amount_currency') },
    { header: 'OTHER', field: 'other_amount', inputType: 'number', align: 'right', format: fmtWithCurrency('total_amount_currency') },
    { header: 'AMOUNT', field: 'clearance_other_total', inputType: 'number', align: 'right', format: fmtWithCurrency('total_amount_currency') },
    { header: 'TOTAL AMOUNT', field: 'total_amount', inputType: 'number', align: 'right', format: fmtTotalAmount },
    { header: 'NOTE 1', field: 'route_note', wide: true },
    { header: 'NOTE 2', field: 'item_description', wide: true },
    { header: 'NOTE 3', field: 'status_note', wide: true },
    { header: 'NOTE 4', field: 'other_note', wide: true },
    { header: 'JUDUL MEMO', field: 'memo_title' },
    { header: 'EXPECTED PAYMENT DATE', field: 'expected_payment_date', inputType: 'date', format: v => formatDateID(v) },
    { header: 'VESSEL', field: 'vessel_internal_note', wide: true },
    { header: 'STATUS APPROVAL', render: r => <ApprovalBadge status={r.approval_status} /> },
    { header: 'STATUS COST', render: (_r, _idx, costStatus) => <CostBadge status={costStatus} /> },
];

// Kolom export Excel -- 1:1 dengan LIST_COLUMNS di atas (semua kolom yang tampil di tabel list
// ikut ter-export), pola/method/tampilan sama seperti tombol Export di halaman Audit Sea & Air
// (ExportModal.tsx yang sama, dipanggil dengan konfigurasi kolom khusus FAR Overseas Air).
// Kolom gabungan (harga+mata uang, breakdown, dst) sudah diformat jadi teks siap tampil oleh
// getExportData di bawah -- ExportModal generik tidak tahu cara gabungkan field-field itu.
const FAR_EXPORT_COLS = [
  { key: 'po_ori', label: 'NO PO' },
  { key: 'vendor', label: 'VENDOR' },
  { key: 'ship_via', label: 'SHIP VIA' },
  { key: 'no_invoice', label: 'INVOICE NO' },
  { key: 'invoice_date', label: 'INVOICE DATE', type: 'date' },
  { key: 'departure_date', label: 'DEPARTURE DATE', type: 'date' },
  { key: 'qty', label: 'QTY', type: 'num' },
  { key: 'weight_unit', label: 'WEIGHT' },
  { key: 'weight_breakdown', label: 'WEIGHT BREAKDOWN' },
  { key: 'unit_price_display', label: 'UNIT PRICE' },
  { key: 'freight_amount_display', label: 'AMOUNT' },
  { key: 'clearance_amount_display', label: 'CLEARANCE' },
  { key: 'other_amount_display', label: 'OTHER' },
  { key: 'clearance_other_total_display', label: 'AMOUNT' },
  { key: 'total_amount_display', label: 'TOTAL AMOUNT' },
  { key: 'route_note', label: 'NOTE 1' },
  { key: 'item_description', label: 'NOTE 2' },
  { key: 'status_note', label: 'NOTE 3' },
  { key: 'other_note', label: 'NOTE 4' },
  { key: 'memo_title', label: 'JUDUL MEMO' },
  { key: 'expected_payment_date', label: 'EXPECTED PAYMENT DATE', type: 'date' },
  { key: 'vessel_internal_note', label: 'VESSEL' },
  { key: 'approval_status_display', label: 'STATUS APPROVAL' },
  { key: 'cost_status_display', label: 'STATUS COST' },
];

export default function FarOverseasAirPage() {
  useEffect(() => { document.title = 'FAR Overseas · Shipment'; }, []);

  // Link langsung ke satu memo: /direct-loading/:id -- buka detail modal otomatis begitu
  // halaman dimuat, tanpa perlu cari-cari di daftar (URL berubah otomatis saat tombol
  // "Approval" di kolom AKSI diklik).
  const { id: deepLinkId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | null>(null);
  const [activeJobError, setActiveJobError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [costStatusMap, setCostStatusMap] = useState<Record<string, string>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [costModalRow, setCostModalRow] = useState<any | null>(null);
  const [weightModalRow, setWeightModalRow] = useState<any | null>(null);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [openActionsRowId, setOpenActionsRowId] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, any>>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const [expandedPoRows, setExpandedPoRows] = useState<Set<string>>(new Set());

  // Scrollbar geser horizontal ganda (atas + bawah tabel, tersinkron) -- pola yang sama
  // dipakai di SharedDataTable.tsx supaya user tidak perlu scroll ke bawah dulu untuk
  // menemukan scrollbar-nya di tabel yang lebar.
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  useEffect(() => {
    if (!tableRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) setTableWidth(entry.target.scrollWidth);
    });
    resizeObserver.observe(tableRef.current);
    return () => resizeObserver.disconnect();
  }, [rows]);

  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };
  const handleBottomScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  const toggleEditRow = (id: string) => setEditingRowId(prev => prev === id ? null : id);
  const togglePoExpanded = (id: string) => setExpandedPoRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [deleteConfirmRow, setDeleteConfirmRow] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteConfirm = (r: any) => { setDeleteConfirmRow(r); setDeleteError(null); };

  // Hapus WAJIB lewat RPC (bukan .delete() langsung ke tabel) -- RPC yang urus urutan hapus
  // data terkait (cost_validasi_far_overseas_air, dll) dengan benar supaya tidak kena error
  // foreign key.
  const confirmDelete = async () => {
    if (!deleteConfirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc('fn_delete_far_overseas_air', { p_far_overseas_id: deleteConfirmRow.id });
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setRows(prev => prev.filter(row => row.id !== deleteConfirmRow.id));
    setToastMessage('Memo berhasil dihapus.');
    setTimeout(() => setToastMessage(null), 4000);
    setDeleteConfirmRow(null);
    fetchList();
  };

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    const startIndex = (page - 1) * pageSize;
    const { data, error, count } = await supabase
      .from('rekapan_far_overseas_air')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(startIndex, startIndex + pageSize - 1);
    if (!error && data) {
      setRows(data);
      setTotalRecords(count || 0);
      const ids = data.map((r: any) => r.id).filter(Boolean);
      if (ids.length) {
        const { data: cvData } = await supabase.from('cost_validasi_far_overseas_air').select('far_overseas_id, status').in('far_overseas_id', ids);
        const map: Record<string, string> = {};
        (cvData || []).forEach((c: any) => { map[c.far_overseas_id] = c.status; });
        setCostStatusMap(map);
      } else {
        setCostStatusMap({});
      }
    }
    setLoadingList(false);
  }, [page, pageSize]);

  // Data untuk Export Excel -- ambil SEMUA baris yang cocok filter tanggal (bukan cuma
  // halaman yang lagi ditampilkan), lalu format kolom gabungan (harga+mata uang, dst) jadi
  // teks siap tampil supaya ExportModal generik tidak perlu tahu logic format khusus FAR.
  const getExportData = useCallback(async (startDate?: string, endDate?: string) => {
    let query = supabase.from('rekapan_far_overseas_air').select('*').order('created_at', { ascending: false }).limit(50000);
    if (startDate) query = query.gte('invoice_date', startDate);
    if (endDate) query = query.lte('invoice_date', endDate);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const exportRows = data || [];

    const ids = exportRows.map((r: any) => r.id).filter(Boolean);
    const costMap: Record<string, string> = {};
    if (ids.length) {
      const { data: cvData } = await supabase.from('cost_validasi_far_overseas_air').select('far_overseas_id, status').in('far_overseas_id', ids);
      (cvData || []).forEach((c: any) => { costMap[c.far_overseas_id] = c.status; });
    }

    return exportRows.map((r: any) => {
      const showIdrHint = r.total_amount_currency && r.total_amount_currency !== 'IDR' && r.total_amount_idr != null;
      const costStatus = costMap[r.id];
      const costMeta = costStatus ? (COST_STATUS_META[costStatus]?.label || costStatus) : 'Belum Ada Data';
      return {
        ...r,
        unit_price_display: formatMoney(r.unit_price, r.unit_price_currency),
        freight_amount_display: formatMoney(r.freight_amount, r.total_amount_currency),
        clearance_amount_display: formatMoney(r.clearance_amount, r.total_amount_currency),
        other_amount_display: formatMoney(r.other_amount, r.total_amount_currency),
        clearance_other_total_display: formatMoney(r.clearance_other_total, r.total_amount_currency),
        total_amount_display: formatMoney(r.total_amount, r.total_amount_currency) + (showIdrHint ? ` (≈ Rp ${Number(r.total_amount_idr).toLocaleString('id-ID')})` : ''),
        approval_status_display: (APPROVAL_STATUS_META[r.approval_status] || APPROVAL_STATUS_META.PENDING).label,
        cost_status_display: costMeta,
      };
    });
  }, []);

  const fetchQueue = useCallback(async () => {
    const { data } = await supabase
      .from('far_overseas_air_processing_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setQueue(data.filter((q: any) => q.status === 'PENDING' || q.status === 'PROCESSING' || q.status === 'FAILED' || (q.status === 'SUCCESS' && !q.is_read)));
    }
  }, []);

  // Kalau halaman dibuka lewat link langsung (/direct-loading/:id), langsung ambil baris itu
  // dan buka detail modal-nya -- tidak perlu tunggu daftar penuh selesai dimuat.
  useEffect(() => {
    if (!deepLinkId) return;
    const loadDeepLink = async () => {
      const { data, error } = await supabase.from('rekapan_far_overseas_air').select('*').eq('id', deepLinkId).maybeSingle();
      if (error || !data) {
        setToastMessage('⚠️ Memo dengan link ini tidak ditemukan.');
        setTimeout(() => setToastMessage(null), 6000);
        navigate('/direct-loading', { replace: true });
        return;
      }
      setSelected(data);
    };
    loadDeepLink();
  }, [deepLinkId, navigate]);

  useEffect(() => {
    fetchList();
    fetchQueue();
    const iv = setInterval(fetchQueue, 5000);
    return () => clearInterval(iv);
  }, [fetchList, fetchQueue]);

  // Nilai efektif sebuah field: kalau ada edit lokal yang belum disimpan, pakai itu -- kalau
  // tidak, pakai nilai dari server. Perubahan HANYA disimpan ke DB saat "Simpan Semua" diklik.
  const getVal = useCallback((r: any, field: string) => {
    const rowEdits = pendingEdits[r.id];
    if (rowEdits && field in rowEdits) return rowEdits[field];
    return r[field];
  }, [pendingEdits]);

  const setVal = useCallback((r: any, field: string, value: any) => {
    if (!REKAPAN_EDITABLE_FIELDS.has(field)) return;
    setPendingEdits(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), [field]: value } }));
  }, []);

  const changedRowIds = Object.keys(pendingEdits).filter(id => Object.keys(pendingEdits[id]).length > 0);
  const hasUnsavedChanges = changedRowIds.length > 0;

  // Dipanggil HANYA saat NOTE 1 (route_note) diedit & di-save, dan HANYA berlaku untuk vendor
  // OCTAGON LOGISTIC (Jianqiao rutenya selalu tetap China-Jakarta, tidak perlu re-matching).
  // Parse ulang kota asal/tujuan hasil koreksi manual user -> cocokkan ulang tarif -> hitung ulang
  // cost validation. HARUS pakai matchOctagonTarif/computeExpectedFromRate apa adanya (replika
  // persis logic n8n) -- jangan diubah sendirian di sini.
  const reMatchOctagonAfterRouteNoteEdit = async (rekapanId: string, newRouteNote: string) => {
    const parsed = parseRouteNote(newRouteNote);
    if (!parsed) return { skipped: true as const, reason: 'format_tidak_dikenali' as const };

    const { data: cvRow, error: cvErr } = await supabase
      .from('cost_validasi_far_overseas_air')
      .select('id, vendor_matched, cost_validation, rate_row_used, status')
      .eq('far_overseas_id', rekapanId)
      .maybeSingle();
    if (cvErr || !cvRow) return { skipped: true as const, reason: 'no_cost_validasi' as const };
    if (cvRow.vendor_matched !== 'OCTAGON LOGISTIC') return { skipped: true as const, reason: 'bukan_octagon' as const };

    const costValidation: any[] = Array.isArray(cvRow.cost_validation)
      ? cvRow.cost_validation
      : (typeof cvRow.cost_validation === 'string' ? (JSON.parse(cvRow.cost_validation || '[]') || []) : []);

    const rateRowRaw = cvRow.rate_row_used;
    const existingRate = Array.isArray(rateRowRaw) ? rateRowRaw[0] : rateRowRaw;
    const jenisLayananLama = existingRate?.jenis_layanan ?? null;

    const kgRow = costValidation.find(r => r.row_key === 'KG');
    const unitPriceRow = costValidation.find(r => r.row_key === 'UNIT_PRICE_DARI_DESCRIPTION');
    const totalRow = costValidation.find(r => r.row_key === 'TOTAL');
    const qty = kgRow?.actual != null && kgRow.actual !== '' ? Number(kgRow.actual) : null;
    const actualUnitPrice = unitPriceRow?.actual != null && unitPriceRow.actual !== '' ? Number(unitPriceRow.actual) : null;
    const actualTotal = totalRow?.actual != null && totalRow.actual !== '' ? Number(totalRow.actual) : null;

    const { data: tarifRows, error: tarifErr } = await supabase
      .from('far_overseas_tarif_vendor')
      .select('*')
      .eq('vendor_name', 'OCTAGON LOGISTIC');
    if (tarifErr) return { skipped: true as const, reason: 'gagal_ambil_tarif' as const };

    const candidates = matchOctagonTarif(tarifRows || [], jenisLayananLama, parsed.origin, parsed.destination, qty);

    let newCostValidation = costValidation;
    let newRateRowUsed: any = null;
    let newStatus = cvRow.status;
    let newCatatan: string | null = null;

    if (candidates.length === 0) {
      newCostValidation = costValidation.map((row: any) => (
        row.row_key === 'KG' || row.row_key === 'UNIT_PRICE_DARI_DESCRIPTION' || row.row_key === 'TOTAL'
          ? { ...row, expected: null, edited: true }
          : row
      ));
      newRateRowUsed = null;
      newStatus = 'BELUM_LENGKAP';
      newCatatan = 'Tidak ditemukan tarif untuk kota asal/tujuan hasil koreksi manual -- mohon cek manual.';
    } else if (candidates.length === 1) {
      const rate = candidates[0];
      const { unitPriceExpected, unitPriceNotes, kgExpected, totalExpected } = computeExpectedFromRate(rate, qty, actualUnitPrice);
      newStatus = computeCostStatus(totalExpected, actualTotal) ?? cvRow.status;
      newCostValidation = costValidation.map((row: any) => {
        if (row.row_key === 'KG') return { ...row, expected: kgExpected, edited: true };
        if (row.row_key === 'UNIT_PRICE_DARI_DESCRIPTION') return { ...row, expected: unitPriceExpected, notes: unitPriceNotes, edited: true };
        if (row.row_key === 'TOTAL') return { ...row, expected: totalExpected, edited: true };
        return row;
      });
      newRateRowUsed = rate;
    } else {
      newRateRowUsed = candidates;
      newStatus = 'BELUM_LENGKAP';
    }

    const { error: saveErr } = await supabase.rpc('update_cost_validasi_far_overseas_manual', {
      p_id: cvRow.id,
      p_cost_validation: newCostValidation,
      p_rate_row_used: newRateRowUsed,
      p_status: newStatus,
      p_catatan: newCatatan,
    });
    if (saveErr) return { skipped: false as const, error: saveErr.message };
    return { skipped: false as const, candidateCount: candidates.length };
  };

  const handleSaveAllEdits = async () => {
    setSavingEdits(true);
    const results = await Promise.all(changedRowIds.map(id => updateRekapanFarOverseasAir(id, pendingEdits[id])));

    const routeNoteChangedIds = changedRowIds.filter(id => 'route_note' in pendingEdits[id]);
    let formatWarningCount = 0;
    if (routeNoteChangedIds.length > 0) {
      const rematchResults = await Promise.all(
        routeNoteChangedIds.map(id => reMatchOctagonAfterRouteNoteEdit(id, pendingEdits[id].route_note))
      );
      formatWarningCount = rematchResults.filter(r => r.skipped && r.reason === 'format_tidak_dikenali').length;
    }

    setSavingEdits(false);
    const firstError = results.find(r => r.error);
    if (firstError?.error) {
      setToastMessage('⚠️ Gagal menyimpan sebagian perubahan: ' + firstError.error.message);
      setTimeout(() => setToastMessage(null), 8000);
    } else if (formatWarningCount > 0) {
      setToastMessage(`Perubahan tersimpan. ${formatWarningCount} NOTE 1 formatnya tidak dikenali -- cost validation tidak diperbarui otomatis untuk baris itu.`);
      setTimeout(() => setToastMessage(null), 8000);
    } else {
      setToastMessage('Perubahan berhasil disimpan.');
      setTimeout(() => setToastMessage(null), 4000);
    }
    setPendingEdits({});
    fetchList();
  };

  const handleDiscardAllEdits = () => setPendingEdits({});

  // Polling job spesifik untuk feedback langsung setelah submit upload di halaman ini
  useEffect(() => {
    if (!activeJobId || activeJobStatus !== 'PENDING') return;
    const iv = setInterval(async () => {
      const { data } = await supabase.from('far_overseas_air_processing_queue').select('*').eq('id', activeJobId).maybeSingle();
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
    await supabase.from('far_overseas_air_processing_queue').delete().eq('id', id);
    setQueue(prev => prev.filter(i => i.id !== id));
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

      <div className="flex-1 h-full overflow-hidden min-w-0 flex flex-col">
        <main className="px-6 py-4 flex-1 flex flex-col overflow-hidden gap-5">

          <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
                <FileCheck2 size={20} />
              </div>
              <div>
                <h1 className="font-bold text-[#5A305A] text-base leading-tight">FAR Overseas</h1>
                <p className="text-xs font-light text-[#5A305A] mt-0.5">Memo approval freight informal gabungan PO</p>
              </div>
            </div>
            {(() => {
              const now = new Date();
              const { text, Icon } = getGreetingMeta(now);
              const displayName = profile?.nama || user?.email?.split('@')[0] || '';
              const dayDate = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
              return (
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-2">
                    <p className="font-bold text-lg text-[#5A305A] leading-tight">{text}{displayName ? `, ${displayName}` : ''}</p>
                    <Icon size={19} className="text-amber-500 shrink-0" />
                  </div>
                  <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">{dayDate}</p>
                </div>
              );
            })()}
          </div>

          {/* Banner job aktif */}
          {activeJobId && activeJobStatus === 'PENDING' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Dokumen sedang diproses AI...</p>
                <p className="text-xs text-amber-700 mt-0.5">Halaman ini akan otomatis memperbarui daftar begitu selesai.</p>
              </div>
            </div>
          )}
          {activeJobId && activeJobStatus === 'SUCCESS' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <p className="text-sm font-bold text-emerald-800">Dokumen berhasil diproses dan sudah muncul di daftar.</p>
              </div>
              <button onClick={() => { setActiveJobId(null); setActiveJobStatus(null); }} className="text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
            </div>
          )}
          {activeJobId && activeJobStatus === 'FAILED' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-3 shrink-0">
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

          {/* List -- flex-1 min-h-0 supaya kartu ini yang mengisi sisa tinggi layar, dan HANYA
              area tabel di dalamnya yang scroll (pola sama seperti SharedDataTable.tsx di
              halaman Audit Sea & Air / Courier) -- bukan seluruh halaman yang discroll panjang. */}
          <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-white/60 flex items-center justify-between gap-3 flex-wrap shrink-0">
              <h2 className="text-sm font-bold text-[#5A305A]">List Memo FAR Overseas</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { fetchList(); fetchQueue(); }}
                  disabled={loadingList}
                  className="px-3 py-2 rounded-full bg-white/70 backdrop-blur-md border border-white/60 hover:bg-white/90 text-[#5A305A] font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50 h-[34px]"
                >
                  <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-3 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border border-emerald-700 transition-all shadow-sm flex items-center gap-1.5 shrink-0 h-[34px]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  Export
                </button>
                <button
                  onClick={() => setShowQueuePanel(o => !o)}
                  className="relative px-3 py-2 rounded-full bg-white/70 backdrop-blur-md border border-white/60 hover:bg-white/90 text-[#5A305A] font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 shrink-0 h-[34px]"
                >
                  <Clock size={14} /> Antrian Proses
                  {queue.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      {queue.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-3 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5 shrink-0 h-[34px]"
                >
                  <UploadCloud size={14} /> Upload Dokumen
                </button>
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
            <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto w-full shrink-0 scrollbar-visible">
              <div style={{ width: tableWidth, height: '1px' }} />
            </div>
            <div ref={bottomScrollRef} onScroll={handleBottomScroll} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto scrollbar-x-visible">
              <table ref={tableRef} className="w-full text-[11px] bg-white">
                <thead className="sticky top-0 z-20">
                  <tr className="text-[10px] text-[#5A305A]/70 uppercase bg-slate-50 shadow-sm">
                    {LIST_COLUMNS.map((col, i) => (
                      <th key={i} className={`font-bold tracking-wider px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.header}</th>
                    ))}
                    <th className="text-left font-bold tracking-wider px-4 py-3 whitespace-nowrap sticky right-0 top-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-20 border-l border-slate-200">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingList ? (
                    <tr><td colSpan={LIST_COLUMNS.length + 1} className="text-center py-10 text-[#5A305A] text-sm">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={LIST_COLUMNS.length + 1} className="text-center py-10 text-[#5A305A] text-sm italic">Belum ada data FAR Overseas. Klik "Upload Dokumen" untuk memulai.</td></tr>
                  ) : (
                    rows.map((r, idx) => {
                      const costStatus = costStatusMap[r.id];
                      const editingThisRow = editingRowId === r.id;
                      const ctx: ListRenderCtx = { onOpenWeightModal: setWeightModalRow, editingRowId, getVal, setVal, expandedPoRows, togglePoExpanded };
                      return (
                        <tr key={r.id} className="group bg-white hover:bg-slate-50 transition-colors">
                          {LIST_COLUMNS.map((col, i) => {
                            if (col.render) {
                              return (
                                <td key={i} className={`px-4 py-3 align-top text-[#5A305A] ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                  {col.render(r, idx, costStatus, ctx)}
                                </td>
                              );
                            }
                            const field = col.field as string;
                            const val = getVal(r, field);
                            const edited = Array.isArray(r.edited_fields) && r.edited_fields.includes(field);
                            const widthClass = colWidthClass(col);
                            return (
                              // SEMUA kolom field (bukan cuma yang wide) dikasih lebar PIKSEL TETAP,
                              // dipasang di <td> ITU SENDIRI sebagai hint lebar kolom, DAN di
                              // EditableCell (lewat className, lihat FarOverseasAirEditableField.tsx)
                              // sebagai lebar tetap pada input-nya saat mode edit -- lebar persen
                              // ("w-full") pada <input> di dalam tabel "table-layout: auto" tidak bisa
                              // dihitung andal (lebar <td>-nya sendiri belum pasti saat browser
                              // menghitung ukuran kolom), jadi kalau dibiarkan persen, input malah
                              // menyusut ke ukuran instrinsik kecil bawaan browser.
                              <td key={i} className={`px-4 py-3 align-top text-[#5A305A] ${col.align === 'right' ? 'text-right' : 'text-left'} ${widthClass}`}>
                                <EditableCell
                                  value={val}
                                  displayValue={col.format ? col.format(val, r) : undefined}
                                  editable={editingThisRow}
                                  edited={edited}
                                  type={col.inputType || 'text'}
                                  align={col.align === 'right' ? 'right' : 'left'}
                                  className={`${widthClass} ${col.wide ? 'whitespace-normal break-words' : ''}`}
                                  onChange={(v) => setVal(r, field, col.inputType === 'number' ? (v === null ? null : Number(v)) : v)}
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 align-top sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-10 border-l border-slate-200 transition-colors">
                            <div className="flex flex-col items-center gap-1.5 w-[104px]">
                              <button
                                onClick={() => setOpenActionsRowId(openActionsRowId === r.id ? null : r.id)}
                                className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all ${
                                  openActionsRowId === r.id
                                    ? 'bg-[#5A305A] text-white border-[#5A305A] shadow-md'
                                    : 'bg-white text-[#5A305A] border-slate-200 shadow-sm hover:border-[#5A305A] hover:bg-[#5A305A]/5'
                                }`}
                              >
                                Action
                                <ChevronDown size={13} className={`transition-transform duration-200 ${openActionsRowId === r.id ? 'rotate-180' : ''}`} />
                              </button>
                              {openActionsRowId === r.id && (
                                <div className="flex flex-col gap-1.5 items-stretch w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
                                  <button
                                    onClick={() => { navigate(`/direct-loading/${r.id}`); setOpenActionsRowId(null); }}
                                    title="Approval"
                                    className="w-full flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
                                  >
                                    <span className="flex items-center gap-1 text-[9px] font-semibold text-[#5A305A]"><ClipboardCheck size={10} /> Approval</span>
                                    <ApprovalBadge status={r.approval_status} compact />
                                  </button>
                                  <button
                                    onClick={() => { setCostModalRow(r); setOpenActionsRowId(null); }}
                                    title="Cost Validation"
                                    className="w-full flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
                                  >
                                    <span className="flex items-center gap-1 text-[9px] font-semibold text-[#5A305A]"><ClipboardList size={10} /> Cost</span>
                                    <CostBadge status={costStatus} compact />
                                  </button>
                                  <button
                                    onClick={() => { toggleEditRow(r.id); setOpenActionsRowId(null); }}
                                    title="Edit baris ini"
                                    className={`w-full flex items-center gap-1 px-1.5 py-1 rounded-md border text-[9px] font-semibold transition-colors ${editingThisRow ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'border-slate-200 bg-white text-[#5A305A] hover:bg-slate-100'}`}
                                  >
                                    <Edit3 size={10} /> {editingThisRow ? 'Edit Aktif' : 'Edit'}
                                  </button>
                                  <button
                                    onClick={() => { openDeleteConfirm(r); setOpenActionsRowId(null); }}
                                    title="Hapus memo ini"
                                    className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-[9px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                                  >
                                    <Trash2 size={10} /> Hapus
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Pagination -- pola sama seperti SharedDataTable.tsx (halaman Audit Sea & Air) */}
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

      {hasUnsavedChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-200 p-2 flex items-center gap-3 pr-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex justify-center items-center text-amber-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#5A305A] leading-none">{changedRowIds.length} baris punya perubahan belum disimpan</p>
            <p className="text-[10px] text-[#5A305A]/70 mt-1">Klik simpan untuk memperbarui ke database</p>
          </div>
          <button
            onClick={handleDiscardAllEdits}
            disabled={savingEdits}
            className="ml-2 px-3 py-2 rounded-full border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSaveAllEdits}
            disabled={savingEdits}
            className="px-4 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <Save size={14} /> {savingEdits ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
        </div>
      )}

      {selected && (
        <FarOverseasAirDetailModal
          record={selected}
          onClose={() => { setSelected(null); if (deepLinkId) navigate('/direct-loading', { replace: true }); }}
          onChanged={fetchList}
        />
      )}

      {costModalRow && (
        <FarOverseasAirCostValidationModal farOverseasId={costModalRow.id} onClose={() => setCostModalRow(null)} />
      )}

      {weightModalRow && (
        <FarOverseasAirWeightBreakdownModal
          record={weightModalRow}
          onClose={() => setWeightModalRow(null)}
          onSaved={() => fetchList()}
        />
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
        <FarOverseasAirUploadModal
          onClose={() => setShowUploadModal(false)}
          onJobStarted={handleJobStarted}
          onSentNoJob={handleSentNoJob}
        />
      )}

      {showExportModal && (
        <ExportModal
          title="FAR Overseas"
          cols={FAR_EXPORT_COLS}
          fetchData={getExportData}
          dateFieldLabel="Filter Tgl. Invoice"
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Antrian proses (PENDING/FAILED global) -- modal, bukan panel inline, supaya posisi
          munculnya selalu konsisten di tengah layar (bukan "menggantung" di atas tombolnya). */}
      {showQueuePanel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-[#5A305A]" />
                <h2 className="text-sm font-bold text-[#5A305A]">Antrian Proses</h2>
              </div>
              <button onClick={() => setShowQueuePanel(false)} className="text-[#5A305A] hover:text-[#5A305A] p-1"><X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {queue.length === 0 ? (
                <p className="text-xs text-[#5A305A] italic text-center py-4">Tidak ada antrian dokumen.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {queue.map(item => <QueueCard key={item.id} item={item} onDismiss={dismissQueueItem} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
