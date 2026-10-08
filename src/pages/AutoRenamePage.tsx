import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleAlert, CircleCheck, Download, FilePenLine, FileSpreadsheet, FileText, Info, Lock, Search, ShieldCheck,
  Sparkles, Table2, Upload, X,
} from 'lucide-react';
import Greeting from '../components/Greeting';
import PaginationFooter from '../components/PaginationFooter';

// Auto Rename (2026-10-08) -- MIGRASI dari halaman mandiri `auto Rename.html` ("Item Names AI -- Item
// Normalization Workspace") ke dalam app, submenu SPB. LOGIKA SAMA dgn file asli (permintaan user:
// "murni migrasi"): Excel dibaca di browser dgn SheetJS (versi sama, 0.20.3), pilih sheet pertama yg
// punya header ItemName, "Process with AI" mengirim sheet terpilih (dibangun ulang jadi xlsx 1 sheet
// "Items") sbg FormData `data` LANGSUNG ke webhook n8n (bukan lewat proxy /api), hasil dipasangkan per
// `row_id` + `ItemCode`, review/approve manual disimpan di browser, Export Excel menambah kolom hasil AI.
// Tanpa tabel Supabase. Semua nilai dari n8n dirender sbg teks biasa (React), tanpa innerHTML.
const WEBHOOK_URL = 'https://n8.waruna-group.co.id/webhook/validate-excel-ai-v2';
const MAX_ITEMS = 2000;
const MAX_BYTES = 4 * 1024 * 1024;
const PER_PAGE = 15;

const SORA: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };

type XlsxModule = typeof import('xlsx');
type RowStatus = 'PENDING' | 'VALID' | 'REVISI' | 'NEED_REVIEW';
type Cells = Record<string, string>;
interface ItemRow {
  id: string;
  original: Cells;
  status: RowStatus;
  recommended: string;
  errors: string;
  approved: string;
  reviewStatus: '' | 'APPROVED';
}
interface ToastItem { id: number; type: 'info' | 'error' | 'success'; message: string }

const SAMPLE: Cells[] = [
  { ItemCode: 'T01.008.00001', ItemName: 'ISI PISAU CUTTER L500 (KENKO/JOYKO) TYPE : L150', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'UNIT' },
  { ItemCode: 'T01.008.00005', ItemName: 'SPIDOL PERMANEN (SNOWMAN) COLOR : RED', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'UNIT' },
  { ItemCode: 'T01.008.00008', ItemName: 'PULPEN (MY GEL) COLOR : BLACK', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'UNIT' },
  { ItemCode: 'T01.008.00012', ItemName: 'AMPLOP (AA) MODEL : PEREKAT COLOR : BROWN @100PCS / BOX', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'BOX' },
  { ItemCode: 'T01.008.00015', ItemName: 'DOUBLE TAPE (DAIMARU) 2"', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'ROLL' },
  { ItemCode: 'T01.008.00028', ItemName: 'PLASTIK LAMINATING (V-TEC/JOYKO) A4 @100 LEMBAR / PACK', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'PACK' },
  { ItemCode: 'T01.008.00029', ItemName: 'PULPEN COLOR : WARNI 4 IN 1', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'SET' },
  { ItemCode: 'T01.008.00034', ItemName: 'STAPLER (MAX) HD 10', StockCategoryCode: 'T01', StockCategoryName: 'STATIONERY', UOM1: 'UNIT' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'VALID', label: 'Valid' },
  { value: 'REVISI', label: 'Revisi' },
  { value: 'NEED_REVIEW', label: 'Need Review' },
  { value: 'APPROVED', label: 'Approved' },
];

const STATUS_LABEL: Record<RowStatus, string> = { VALID: 'Valid', REVISI: 'Revisi', NEED_REVIEW: 'Need Review', PENDING: 'Pending' };
const STATUS_STYLE: Record<RowStatus | 'APPROVED', string> = {
  PENDING: 'bg-slate-100 text-slate-500',
  VALID: 'bg-emerald-50 text-emerald-700',
  REVISI: 'bg-amber-50 text-amber-700',
  NEED_REVIEW: 'bg-red-50 text-red-600',
  APPROVED: 'bg-blue-50 text-blue-700',
};

const number = (n: number) => new Intl.NumberFormat('id-ID').format(n);
const fmtKb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const normalizeKey = (k: unknown) => String(k || '').trim().toLowerCase().replace(/[\s_]+/g, '');
const getField = (obj: Cells, field: string): string => {
  const key = Object.keys(obj).find(k => normalizeKey(k) === normalizeKey(field));
  return key === undefined ? '' : obj[key];
};
const statusKey = (row: ItemRow): RowStatus | 'APPROVED' => (row.reviewStatus === 'APPROVED' ? 'APPROVED' : row.status);
const statusLabel = (row: ItemRow) => (row.reviewStatus === 'APPROVED' ? 'Approved' : STATUS_LABEL[row.status] || 'Pending');

let xlsxPromise: Promise<XlsxModule> | null = null;
const loadXlsx = () => (xlsxPromise ??= import('xlsx'));

function rowsFromSheet(XLSX: XlsxModule, sheet: import('xlsx').WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  if (!matrix.length) throw Error('Sheet kosong. Pilih sheet yang berisi data ItemCode dan ItemName.');
  const headers = matrix[0].map((v, i) => String(v || `Column_${i + 1}`).trim());
  if (!headers.some(k => normalizeKey(k) === 'itemname')) throw Error('Kolom ItemName tidak ditemukan pada sheet ini.');
  const rows: ItemRow[] = matrix.slice(1)
    .filter(row => row.some(c => String(c ?? '').trim() !== ''))
    .map((arr, i) => {
      const original: Cells = {};
      headers.forEach((h, j) => { original[h] = (arr[j] ?? '') as string; });
      return { id: `R${i + 2}`, original, status: 'PENDING' as RowStatus, recommended: '', errors: '', approved: '', reviewStatus: '' as const };
    });
  return { headers, rows };
}

function normalizeResponse(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  throw Error('Format response tidak sesuai: results array tidak ditemukan.');
}

export default function AutoRenamePage() {
  useEffect(() => { document.title = 'Auto Rename · BeeHive'; }, []);

  const [workbook, setWorkbook] = useState<import('xlsx').WorkBook | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [page, setPage] = useState(1);
  const [isSample, setIsSample] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modalId, setModalId] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [dragging, setDragging] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const toastSeq = useRef(0);

  const toast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6500);
  }, []);

  const closeReview = useCallback(() => setModalId(null), []);
  useEffect(() => {
    if (modalId === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeReview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalId, closeReview]);

  const applyParsed = (name: string, parsed: { headers: string[]; rows: ItemRow[] }) => {
    setSheetName(name); setHeaders(parsed.headers); setRows(parsed.rows); setPage(1); setIsSample(false);
  };

  const reset = () => {
    setWorkbook(null); setFile(null); setIsSample(false); setSheetName(''); setHeaders([]); setRows([]); setPage(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSearch(''); setStatusFilter('ALL');
  };

  const updateSheet = async (name: string) => {
    if (!workbook) return;
    try {
      const XLSX = await loadXlsx();
      const parsed = rowsFromSheet(XLSX, workbook.Sheets[name]);
      applyParsed(name, parsed);
      toast(`${number(parsed.rows.length)} item dimuat dari sheet ${name}.`, 'success');
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) { toast('Gunakan file Excel .xlsx atau .xls.', 'error'); return; }
    if (f.size > MAX_BYTES) { toast('File melebihi 4 MB. Pisahkan file menjadi beberapa batch dahulu.', 'error'); return; }
    try {
      const XLSX = await loadXlsx();
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: false });
      if (!wb.SheetNames.length) throw Error('Tidak ada sheet dalam file ini.');
      let selected = wb.SheetNames[0];
      let parsed: ReturnType<typeof rowsFromSheet> | undefined;
      for (const name of wb.SheetNames) {
        try { parsed = rowsFromSheet(XLSX, wb.Sheets[name]); selected = name; break; } catch { /* cari sheet yang bisa dipakai */ }
      }
      if (!parsed) throw Error('Tidak ditemukan sheet dengan header ItemName pada file Excel.');
      setWorkbook(wb); setFile(f); applyParsed(selected, parsed);
      toast(`File berhasil dibaca. ${number(parsed.rows.length)} baris siap direview.`, 'success');
      workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e: any) {
      toast('Gagal membaca Excel: ' + e.message, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const trySample = () => {
    reset();
    setIsSample(true);
    setHeaders(['ItemCode', 'ItemName', 'StockCategoryCode', 'StockCategoryName', 'UOM1']);
    setSheetName('Sample');
    setRows(SAMPLE.map((item, i) => ({ id: `R${i + 2}`, original: { ...item }, status: 'PENDING', recommended: '', errors: '', approved: '', reviewStatus: '' })));
    toast('Sample dari Item Names (T01) dimuat. Ini hanya preview, bukan hasil AI.');
  };

  const visible = rows.filter(row => {
    const q = search.trim().toLowerCase();
    const code = String(getField(row.original, 'ItemCode') ?? '');
    const name = String(getField(row.original, 'ItemName') ?? '');
    const match = !q || `${code} ${name} ${row.recommended}`.toLowerCase().includes(q);
    return match && (statusFilter === 'ALL' || statusKey(row) === statusFilter);
  });
  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const curPage = Math.max(1, Math.min(page, totalPages));
  const slice = visible.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const hasRows = rows.length > 0;
  const stat = {
    total: rows.length,
    valid: rows.filter(r => r.status === 'VALID').length,
    revision: rows.filter(r => r.status === 'REVISI').length,
    review: rows.filter(r => r.status === 'NEED_REVIEW' && r.reviewStatus !== 'APPROVED').length,
  };
  const subtitle = !hasRows
    ? 'Import file untuk melihat daftar item yang akan divalidasi.'
    : isSample
      ? `${number(rows.length)} sample item · Data contoh, belum diproses AI.`
      : `${number(rows.length)} item · Sheet ${sheetName} · ${rows.some(r => r.status !== 'PENDING') ? 'AI result available' : 'Awaiting AI validation'}`;

  const openReview = (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setModalId(id);
    setModalValue(row.approved || row.recommended || getField(row.original, 'ItemName') || '');
  };
  const modalRow = modalId ? rows.find(r => r.id === modalId) ?? null : null;

  const saveReview = () => {
    if (!modalRow) return;
    const result = modalValue.trim();
    if (!result) { toast('Nama final tidak boleh kosong.', 'error'); return; }
    setRows(rs => rs.map(r => (r.id === modalRow.id ? { ...r, approved: result, reviewStatus: 'APPROVED' } : r)));
    closeReview();
    toast('Nama final disimpan di browser dan siap diekspor.', 'success');
  };

  const exportExcel = async () => {
    if (!rows.length) return;
    try {
      const XLSX = await loadXlsx();
      const data = rows.map(row => ({
        ...row.original,
        'Status Validasi AI': row.status,
        'Rekomendasi Item Name AI': row.recommended || '',
        'Catatan Error AI': row.errors || '-',
        'Final Item Name': row.approved || row.recommended || getField(row.original, 'ItemName'),
        'Review Status': row.reviewStatus || 'NOT_REVIEWED',
      }));
      const extra = ['Status Validasi AI', 'Rekomendasi Item Name AI', 'Catatan Error AI', 'Final Item Name', 'Review Status'];
      const columns = [...headers, ...extra.filter(k => !headers.includes(k))];
      const sheet = XLSX.utils.json_to_sheet(data, { header: columns });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'AI Review');
      const clean = (file?.name || 'Item_Names').replace(/\.(xlsx|xls)$/i, '').replace(/[^a-z0-9_-]/gi, '_');
      XLSX.writeFile(book, `${clean}_AI_Review.xlsx`);
      toast('Excel berhasil diekspor. File asli tidak diubah.', 'success');
    } catch (e: any) { toast('Gagal export Excel: ' + e.message, 'error'); }
  };

  const processAI = async () => {
    if (!file || processing) return;
    if (rows.length > MAX_ITEMS) { toast('Workflow n8n V2 maksimal 2.000 item per request.', 'error'); return; }
    setProcessing(true);
    try {
      const XLSX = await loadXlsx();
      // Kirim persis worksheet yang sedang dipilih, bukan sheet pertama sembarang.
      const input = rows.map(r => r.original);
      const s = XLSX.utils.json_to_sheet(input, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, s, 'Items');
      const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const form = new FormData();
      form.append('data', new File([bytes], 'items-to-validate.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      let response: Response;
      try { response = await fetch(WEBHOOK_URL, { method: 'POST', body: form, signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (!response.ok) {
        let detail = '';
        try {
          const errorText = await response.text();
          try { const parsed = JSON.parse(errorText); detail = parsed.message || parsed.error || errorText; } catch { detail = errorText; }
        } catch { /* abaikan */ }
        if (response.status === 404) throw Error('Webhook n8n tidak ditemukan (404). Pastikan workflow sudah Active/Published dan URL production sesuai.');
        throw Error(`n8n HTTP ${response.status}${detail ? ' — ' + String(detail).slice(0, 250) : ''}`);
      }
      const body = await response.json();
      const results = normalizeResponse(body);
      const mapping = new Map<string, any[]>();
      for (const result of results) {
        const k = String(result.row_id || '').trim();
        if (k) { if (!mapping.has(k)) mapping.set(k, []); mapping.get(k)!.push(result); }
      }
      let returned = 0, missing = 0;
      const next = rows.map(r => {
        const row: ItemRow = { ...r };
        const matches = mapping.get(row.id) || [];
        const matched = matches.length === 1 ? matches[0] : null;
        const expectedCode = String(getField(row.original, 'ItemCode') ?? '').trim();
        if (!matched || String(matched.ItemCode ?? '').trim() !== expectedCode) {
          row.status = 'NEED_REVIEW';
          row.recommended = getField(row.original, 'ItemName') || '';
          row.errors = matches.length > 1 ? 'Duplikat row_id dari backend' : !matched ? 'Hasil AI tidak tersedia untuk baris ini' : 'ItemCode tidak cocok, rekomendasi ditolak';
          missing++;
        } else {
          const valid = ['VALID', 'REVISI', 'NEED_REVIEW'];
          row.status = valid.includes(matched['Status Validasi AI']) ? matched['Status Validasi AI'] : 'NEED_REVIEW';
          row.recommended = String(matched['Rekomendasi Item Name AI'] || getField(row.original, 'ItemName') || '');
          row.errors = String(matched['Catatan Error AI'] || '-');
          returned++;
        }
        row.approved = ''; row.reviewStatus = '';
        return row;
      });
      setRows(next);
      toast(`AI selesai: ${returned} item dipasangkan berdasarkan row_id & ItemCode${missing ? `, ${missing} perlu review` : ''}.`, 'success');
    } catch (e: any) {
      const errorMessage = e.name === 'AbortError'
        ? 'n8n belum merespons dalam 180 detik. Untuk file besar, nanti kita gunakan job queue.'
        : e instanceof TypeError
          ? 'Gagal menghubungi webhook n8n. Periksa CORS (Allowed Origins) di node Webhook, koneksi, dan SSL server.'
          : e.message;
      toast(errorMessage, 'error');
      console.error('Process with AI gagal:', e);
    } finally {
      setProcessing(false);
    }
  };

  const btnBase = 'inline-flex items-center justify-center gap-2 h-[34px] px-3.5 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
  const btnGhost = `${btnBase} border-[#EADFD6] bg-white text-[#5A305A] hover:bg-[#FBF7F4]`;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10" style={SORA}>
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <FilePenLine size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Auto Rename</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Upload an Excel file, review the AI-standardized item names, and export the result.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-2 space-y-3">
        {/* ===== UPLOAD + RULES ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(295px,0.9fr)] gap-3">
          <section className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F5EDF3] text-[#5A305A] flex items-center justify-center"><Upload size={17} /></div>
                <div>
                  <div className="text-sm font-bold text-[#2A1A2C]">Upload Excel File</div>
                  <div className="text-[11px] text-[#6E5E70]">Mulai dari file item master yang ingin diperiksa</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#5A305A] bg-[#F5EDF3] rounded-lg px-2.5 py-1">STEP 01</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Upload file Excel"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={e => { e.preventDefault(); setDragging(false); }}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              className={`mt-4 min-h-[166px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-center p-5 cursor-pointer outline-none transition-colors focus-visible:border-[#5A305A] ${
                dragging ? 'border-[#5A305A] bg-[#F5EDF3]' : 'border-[#EADFD6] bg-[#FBF7F4] hover:border-[#5A305A]/50 hover:bg-[#F5EDF3]/60'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-[#F5EDF3] text-[#5A305A] flex items-center justify-center mb-1"><FileText size={22} /></div>
              <strong className="text-sm text-[#2A1A2C]">Drop your Excel file here</strong>
              <span className="text-[11px] text-[#6E5E70]">
                atau <span className="font-bold text-[#5A305A] underline underline-offset-[3px]">browse file</span> dari komputer
              </span>
              <span className="text-[11px] text-[#6E5E70]">XLSX / XLS · Maks. 4 MB · 2.000 item untuk AI</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={e => handleFile(e.target.files?.[0])}
            />

            {file && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet size={17} className="text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#2A1A2C] truncate" title={file.name}>{file.name}</div>
                    <div className="text-[10px] text-emerald-700">{fmtKb(file.size)} · {sheetName}</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Hapus file"
                  onClick={reset}
                  className="w-7 h-7 rounded-md border border-emerald-200 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#6E5E70]">
              <Info size={14} className="shrink-0" /> Preview Excel diproses lokal. Saat Process with AI ditekan, data dikirim langsung ke n8n untuk validasi.
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F5EDF3] text-[#5A305A] flex items-center justify-center"><ShieldCheck size={17} /></div>
                <div>
                  <div className="text-sm font-bold text-[#2A1A2C]">Normalization Rules</div>
                  <div className="text-[11px] text-[#6E5E70]">Ringkasan kebijakan validasi T01</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#5A305A] bg-[#F5EDF3] rounded-lg px-2.5 py-1">REFERENCE</span>
            </div>
            {[
              { t: 'Preserve information', d: 'Brand, kode produk, angka, ukuran, dan quantity tidak boleh hilang.' },
              { t: 'Consistent naming', d: 'Susun atribut TYPE, MODEL, COLOR, SIZE, QTY, dan NO jika tersedia.' },
              { t: 'Flag ambiguous records', d: 'Jangan mengarang data; item yang meragukan perlu human review.' },
            ].map((r, i) => (
              <div key={r.t} className="flex items-start gap-3 mt-4">
                <span className="w-6 h-6 rounded-lg bg-[#F5EDF3] text-[#5A305A] flex items-center justify-center text-[10px] font-bold shrink-0">0{i + 1}</span>
                <div>
                  <div className="text-xs font-bold text-[#2A1A2C] leading-tight">{r.t}</div>
                  <p className="text-[11px] text-[#6E5E70] leading-snug mt-1">{r.d}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 border-t border-[#EADFD6] mt-4 pt-3 text-[10px] text-[#6E5E70]">
              <span>Reference: Rules Item Names · T01</span><span>Read only</span>
            </div>
          </section>
        </div>

        {/* ===== STATS ===== */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Ringkasan data">
          {[
            { label: 'Total Items', value: stat.total, icon: Table2, tone: 'bg-[#F5EDF3] text-[#5A305A]' },
            { label: 'Valid Items', value: stat.valid, icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-700' },
            { label: 'AI Revisions', value: stat.revision, icon: Sparkles, tone: 'bg-amber-50 text-amber-700' },
            { label: 'Need Review', value: stat.review, icon: CircleAlert, tone: 'bg-red-50 text-red-600', onClick: () => { setStatusFilter('NEED_REVIEW'); setPage(1); } },
          ].map(s => {
            const body = (
              <>
                <div>
                  <small className="block text-[11px] font-semibold text-[#6E5E70]">{s.label}</small>
                  <strong className="block text-2xl font-bold text-[#2A1A2C] leading-tight mt-1">{number(s.value)}</strong>
                </div>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.tone}`}><s.icon size={18} /></span>
              </>
            );
            const cls = 'bg-white rounded-2xl shadow-sm border border-[#EADFD6] px-4 py-3.5 flex items-center justify-between gap-3 text-left';
            return s.onClick
              ? <button key={s.label} type="button" onClick={s.onClick} title="Filter: Need Review" className={`${cls} hover:border-[#5A305A]/40 transition-colors`}>{body}</button>
              : <div key={s.label} className={cls}>{body}</div>;
          })}
        </section>

        {/* ===== WORKSPACE ===== */}
        <section ref={workspaceRef} className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden scroll-mt-2">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-[#2A1A2C]">Item Workspace</h2>
              <p className="text-[11px] text-[#6E5E70] mt-0.5">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className={btnGhost} onClick={trySample} disabled={processing}>
                <FileText size={15} /> Try Sample
              </button>
              <button type="button" className={btnGhost} onClick={exportExcel} disabled={!hasRows || processing}>
                <Download size={15} /> Export Excel
              </button>
              <button
                type="button"
                className={`${btnBase} border-[#5A305A] bg-[#5A305A] text-white shadow-sm hover:bg-[#73507B]`}
                onClick={processAI}
                disabled={!file || processing || !hasRows || rows.length > MAX_ITEMS}
              >
                {processing
                  ? <span className="w-3.5 h-3.5 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                  : <Sparkles size={15} />}
                {processing ? 'Processing AI...' : 'Process with AI'}
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 h-[37px] rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 min-w-[240px] flex-1 max-w-[430px] text-slate-400">
              <Search size={16} className="shrink-0" />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search item code or item name..."
                aria-label="Cari item"
                className="w-full min-w-0 bg-transparent outline-none text-xs text-[#2A1A2C] placeholder:text-slate-400"
              />
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="Pilih sheet"
                value={sheetName}
                disabled={!workbook || processing}
                onChange={e => updateSheet(e.target.value)}
                className="h-[37px] max-w-[210px] rounded-lg border border-[#EADFD6] bg-white px-3 text-xs font-semibold text-[#5A305A] outline-none focus:border-[#5A305A] disabled:opacity-60"
              >
                {workbook
                  ? workbook.SheetNames.map(n => <option key={n} value={n}>{n}</option>)
                  : <option value="">No Sheet</option>}
              </select>
              <select
                aria-label="Filter status"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="h-[37px] rounded-lg border border-[#EADFD6] bg-white px-3 text-xs font-semibold text-[#5A305A] outline-none focus:border-[#5A305A]"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-slate-200">
            {hasRows && visible.length > 0 ? (
              <table className="w-full min-w-[850px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-[#6E5E70]">
                    <th className="px-4 py-3 w-[3%]">#</th>
                    <th className="px-4 py-3 w-[14%]">Item Code</th>
                    <th className="px-4 py-3 w-[29%]">Original Item Name</th>
                    <th className="px-4 py-3 w-[29%]">AI Recommendation / Final</th>
                    <th className="px-4 py-3 w-[13%]">Status</th>
                    <th className="px-4 py-3 w-[12%] text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((row, i) => {
                    const suggestion = row.reviewStatus === 'APPROVED' ? row.approved : row.recommended;
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-b-0 hover:bg-[#FBF7F4]/60">
                        <td className="px-4 py-3.5 text-[10px] text-slate-400 tabular-nums">{(curPage - 1) * PER_PAGE + i + 1}</td>
                        <td className="px-4 py-3.5 text-[11px] font-bold text-[#5A305A] whitespace-nowrap">{getField(row.original, 'ItemCode') || '—'}</td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-[#2A1A2C] leading-relaxed break-words max-w-[365px]">{getField(row.original, 'ItemName') || '—'}</td>
                        <td className={`px-4 py-3.5 text-xs leading-relaxed break-words max-w-[370px] ${suggestion ? 'font-bold text-emerald-800' : 'italic text-slate-400'}`}>
                          {suggestion || 'Waiting for AI validation...'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap ${STATUS_STYLE[statusKey(row)]}`}>{statusLabel(row)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={row.status === 'PENDING' || processing}
                            onClick={() => openReview(row.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#EADFD6] bg-white text-[#5A305A] text-[10px] font-bold hover:bg-[#FBF7F4] disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-4 py-16">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EDF3] text-[#5A305A] flex items-center justify-center mb-4"><Table2 size={30} /></div>
                <h3 className="text-base font-bold text-[#5A305A]">{hasRows ? 'No matching items' : 'No items imported yet'}</h3>
                <p className="text-xs text-[#6E5E70] mt-1.5 mb-4 max-w-sm leading-relaxed">
                  {hasRows
                    ? 'Tidak ada item yang cocok dengan kata kunci atau filter yang dipilih.'
                    : <>Upload file Excel untuk mulai bekerja atau klik <strong>Try Sample</strong> untuk melihat contoh tampilan tabel.</>}
                </p>
                {!hasRows && (
                  <button type="button" className={btnGhost} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={15} /> Upload Excel
                  </button>
                )}
              </div>
            )}
          </div>

          <PaginationFooter
            start={(curPage - 1) * PER_PAGE + 1}
            end={Math.min(curPage * PER_PAGE, visible.length)}
            total={visible.length}
            unit="items"
            page={curPage}
            totalPages={totalPages}
            onPage={setPage}
          />
        </section>

        <div className="flex items-center gap-2 text-[11px] text-[#6E5E70] px-1">
          <Lock size={14} className="shrink-0" /> Original item names remain unchanged in the exported data. Approved names are saved to a separate column.
        </div>
      </main>

      {/* ===== MODAL REVIEW ===== */}
      {modalRow && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) closeReview(); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="auto-rename-review-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-[620px] max-h-[90vh] overflow-auto" style={SORA}>
            <div className="px-6 py-5 border-b border-[#EADFD6] flex items-start justify-between gap-5">
              <div>
                <h3 id="auto-rename-review-title" className="text-base font-bold text-[#5A305A]">Review Item Name</h3>
                <p className="text-[11px] text-[#6E5E70] mt-0.5">{getField(modalRow.original, 'ItemCode') || modalRow.id}</p>
              </div>
              <button type="button" aria-label="Tutup" onClick={closeReview} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center shrink-0">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[#6E5E70] mb-1.5">ORIGINAL ITEM NAME</label>
                <div className="rounded-lg border border-[#EADFD6] bg-[#FBF7F4] px-3 py-2.5 text-xs font-bold text-[#2A1A2C] break-words">{getField(modalRow.original, 'ItemName') || '—'}</div>
              </div>
              <div>
                <label htmlFor="auto-rename-final" className="block text-[11px] font-bold text-[#6E5E70] mb-1.5">AI RECOMMENDATION / FINAL NAME</label>
                <textarea
                  id="auto-rename-final"
                  autoFocus
                  spellCheck={false}
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  className="w-full min-h-[105px] rounded-lg border border-[#EADFD6] p-3 text-xs text-[#2A1A2C] leading-relaxed resize-y outline-none focus:border-[#5A305A]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#6E5E70] mb-1.5">AI VALIDATION NOTES</label>
                <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800 whitespace-pre-wrap">
                  {modalRow.errors && modalRow.errors !== '-' ? modalRow.errors : 'Tidak ada catatan tambahan dari AI.'}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={btnGhost} onClick={closeReview}>Cancel</button>
                <button type="button" className={`${btnBase} border-[#5A305A] bg-[#5A305A] text-white hover:bg-[#73507B]`} onClick={saveReview}>
                  <CircleCheck size={15} /> Save &amp; Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      <div className="fixed right-5 bottom-5 z-[80] flex flex-col gap-2 max-w-[390px] w-[calc(100%-2.5rem)] pointer-events-none" role="status" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs text-white shadow-xl ${
              t.type === 'error' ? 'bg-[#7e353d]' : t.type === 'success' ? 'bg-[#265944]' : 'bg-[#252339]'
            }`}
          >
            {t.type === 'error' ? <CircleAlert size={16} className="shrink-0" /> : t.type === 'success' ? <CircleCheck size={16} className="shrink-0" /> : <Info size={16} className="shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
