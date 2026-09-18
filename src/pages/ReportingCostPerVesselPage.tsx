import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import { BarChart3, RefreshCw, Download, AlertTriangle, SlidersHorizontal, X, ChevronDown, ChevronsDownUp, ChevronsUpDown, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react';
import ExcelJS from 'exceljs';
import Greeting from '../components/Greeting';
import { useAuth } from '../lib/AuthContext';
import {
  fetchMasterVessels, fetchAllocationRowsByMonths, recomputeReportingMonth,
  MasterVessel, YearMonth, MetricKey, zeroSums, totalCost, totalExclPpn, metricForMethod, addSums,
  METHOD_SOURCE_PAGE, AllocationMethod,
} from '../utils/ReportingHelpers';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// Sea & Air DIPISAH LAGI jadi 2 tab terpisah (2026-09, permintaan user -- sempat digabung 1 tab
// "Sea & Air" sebelumnya, TERNYATA diminta balik ke versi awal). `TabId` sekarang PERSIS sama
// dgn `AllocationMethod` (`ReportingHelpers.ts`) + `'ALL'` -- TIDAK ADA lagi mapping/alias
// gabungan spt 'SEA_AIR' dulu.
type TabId = 'ALL' | AllocationMethod;
// Dropdown method (2026-09 "REVISI MENU REPORTING" poin B2, GANTI TOTAL dari deretan tombol tab
// -- 1 `<select>` "All Method"/Courier/Sea/Air/FAR Ovs). Label BORONGAN dikembalikan ke "FAR Ovs"
// (poin B1, sempat direname "All-In Import" sesi lalu) -- value internal `TabId`/
// `AllocationMethod` TETAP `'BORONGAN'`.
const TABS: { id: TabId; label: string }[] = [
  { id: 'ALL', label: 'All Method' },
  { id: 'COURIER', label: 'Courier' },
  { id: 'SEA', label: 'Sea' },
  { id: 'AIR', label: 'Air' },
  { id: 'BORONGAN', label: 'FAR Ovs' },
];

// Kolom biaya yg ditampilkan per tab (Summary View). 2026-09 poin 4 (revisi susulan): All
// Method/Courier/Sea/Air DISERAGAMKAN jadi 2 kolom generik "Total Vessel Cost"/"Total Excl.
// PPN+PPH" (dulu Courier/Sea/Air dijabarkan per Duty/Handling/BM/dst -- DIHAPUS, breakdown itu
// TIDAK PERNAH salah krn `sums` yg dipakai SUDAH terfilter per-method lewat `rowsForTab`, cuma
// beda cara tampil). FAR Ovs (BORONGAN) SENGAJA TETAP 1 kolom sendiri -- memang cuma py 1 jenis
// biaya (`borongan_total`), tidak ada breakdown apa pun utk diseragamkan.
function columnsForTab(tab: TabId): { key: MetricKey | 'total_cost' | 'total_excl_ppn'; label: string }[] {
  if (tab === 'BORONGAN') return [{ key: 'borongan_total', label: 'Total FAR Ovs' }];
  return [{ key: 'total_cost', label: 'Total Vessel Cost' }, { key: 'total_excl_ppn', label: 'Total Excl. PPN+PPH' }];
}

const metricForTab = (s: Record<MetricKey, number>, tab: TabId) => metricForMethod(s, tab);

const fmtRp = (n: number) => n ? `Rp ${Math.round(n).toLocaleString('id-ID')}` : '-';

type VesselAgg = {
  key: string;
  vesselId: number | null;
  vesselName: string;
  base: string;
  fleetGroup: string;
  sums: Record<MetricKey, number>; // gabungan SELURUH periode terpilih -- dipakai Summary View & jadi kolom akumulasi Periodic View
  periodSums: Record<string, Record<MetricKey, number>>; // key 'YYYY-MM' -> sums bulan itu (Periodic View menggabungkan ulang ke level quarter/year saat render)
};

const NEEDS_REVIEW = 'NEEDS REVIEW';
type ViewMode = 'SUMMARY' | 'PERIODIC';
type PeriodicMode = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

// Kolom periode (Periodic View) -- 1 kolom per grup bulan terpilih, granularitas mengikuti
// `PeriodicMode`. TIDAK ADA dropdown Quarter/Year terpisah (2026-09, dikonfirmasi user): quarter
// & year DITURUNKAN dari bulan-bulan yang SUDAH dipilih user via dropdown Bulan/Tahun, cuma
// menjumlah bulan yang BENERAN dipilih di grup itu (bukan otomatis tarik bulan lain yg tidak
// dipilih).
type PeriodColumn = { key: string; label: string; monthKeys: string[] };

function buildPeriodColumns(periods: YearMonth[], mode: PeriodicMode): PeriodColumn[] {
  const map = new Map<string, PeriodColumn>();
  periods.forEach(p => {
    const monthKey = `${p.year}-${String(p.month).padStart(2, '0')}`;
    let colKey: string; let label: string;
    if (mode === 'MONTHLY') { colKey = monthKey; label = `${MONTH_NAMES_FULL[p.month - 1]} ${p.year}`; }
    else if (mode === 'QUARTERLY') {
      const q = Math.ceil(p.month / 3);
      const qMonths = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3];
      colKey = `${p.year}-Q${q}`; label = `${MONTH_NAMES[qMonths[0] - 1]}-${MONTH_NAMES[qMonths[2] - 1]} (Q${q}) ${p.year}`;
    } else { colKey = String(p.year); label = `TAHUN ${p.year}`; }
    if (!map.has(colKey)) map.set(colKey, { key: colKey, label, monthKeys: [] });
    map.get(colKey)!.monthKeys.push(monthKey);
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function sumPeriodKeys(periodSums: Record<string, Record<MetricKey, number>>, monthKeys: string[]): Record<MetricKey, number> {
  const out = zeroSums();
  monthKeys.forEach(k => { if (periodSums[k]) addSums(out, periodSums[k]); });
  return out;
}

// Dropdown Bulan/Tahun jadi multi-select (2026-09 poin B4) -- tombol + panel `absolute` daftar
// checkbox + "All"/"Clear" (TIDAK perlu React Portal serumit `KategoriPicker` di
// AuditPoHelpers.ts, filter bar di halaman ini cukup ruang, bukan sel tabel sempit). Tutup
// otomatis kalau klik di luar panel.
// FIX 2026-09 (poin 2, laporan user "dropdown Year/Month tidak bisa diklik"): panel dulu
// `position:absolute` di dalam container filter bar yang punya `overflow-x-auto`
// (`flex flex-nowrap ... overflow-x-auto`) -- CSS `overflow-x` non-`visible` ikut meng-clip
// sumbu Y juga (quirk browser: `overflow-x:auto` tanpa `overflow-y` eksplisit browser
// menganggap keduanya `auto`), jadi panel checkbox-nya literally TIDAK PERNAH terlihat/bisa
// diklik -- ke-clip habis oleh parent-nya sendiri. Fix: render panel via React Portal ke
// `document.body`, `position:fixed` dihitung dari `getBoundingClientRect()` tombolnya (pola sama
// `KategoriPicker` di AuditPoHelpers.ts) -- lolos dari overflow container manapun.
function MultiSelectDropdown({ label, options, selected, onChange, emptyMeansAll }: {
  label: string; options: { value: number; label: string }[]; selected: Set<number>;
  onChange: (next: Set<number>) => void; emptyMeansAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, minWidth: Math.max(r.width, 170) });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => { window.removeEventListener('resize', updatePos); window.removeEventListener('scroll', updatePos, true); };
  }, [open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggle = (v: number) => { const next = new Set(selected); if (next.has(v)) next.delete(v); else next.add(v); onChange(next); };
  const summary = selected.size === 0
    ? (emptyMeansAll ? 'All' : 'None')
    : selected.size === 1 ? (options.find(o => o.value === Array.from(selected)[0])?.label || '1 selected') : `${selected.size} selected`;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)}
        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A] bg-white flex items-center gap-1.5 whitespace-nowrap">
        {label}: {summary} <ChevronDown size={12} />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className="z-[999] bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto">
          <div className="flex gap-3 mb-1.5 pb-1.5 border-b border-slate-100">
            <button onClick={() => onChange(new Set(options.map(o => o.value)))} className="text-[10px] font-bold text-[#5A305A] hover:underline">All</button>
            <button onClick={() => onChange(new Set())} className="text-[10px] font-bold text-[#5A305A] hover:underline">Clear</button>
          </div>
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 text-xs text-[#5A305A] py-1 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5 accent-[#5A305A] shrink-0" />
              {o.label}
            </label>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// `embedded` (2026-09, dipakai `CostByVesselPage.tsx`) -- kalau true, `<header>` bawaan halaman
// ini (judul+ikon+Greeting) DISKIP -- halaman induk (`CostByVesselPage`) sudah py header+tab bar
// sendiri, dobel header kelihatan aneh. Sisanya (SEMUA logic/tampilan di bawah `<header>`) TIDAK
// berubah sama sekali.
export default function ReportingCostPerVesselPage({ embedded }: { embedded?: boolean } = {}) {
  useEffect(() => { document.title = 'Cost per Vessel · BeeHive'; }, []);
  const { canEdit, user } = useAuth();
  const canEditPage = canEdit('reporting_cost_per_vessel');

  // Chart Dashboard bisa diklik utk buka halaman ini sudah terfilter (permintaan user) -- baca
  // state awal dari query string (?year=&month=&tab=), fallback ke bulan berjalan. `mode` param
  // lama (Monthly/Yearly) TIDAK dipakai lagi -- diganti multi-select tahun/bulan di bawah, link
  // Dashboard yg masih kirim `mode=` diabaikan dgn aman.
  const [searchParams] = useSearchParams();
  const today = new Date();
  const [activeTab, setActiveTab] = useState<TabId>((searchParams.get('tab') as TabId) || 'ALL');
  // Periode multi-select (2026-09 "REVISI MENU REPORTING" poin B4) -- ganti `year`/`month`
  // single-value lama. Bulan KOSONG utk 1 tahun = seluruh 12 bulan tahun itu (mendukung contoh
  // user "pilih 2024+2025+2026 saja tanpa bulan spesifik" = 1 tahun penuh masing2). Periode final
  // = cartesian product tahun x bulan (lihat `selectedPeriods` useMemo di bawah).
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set([Number(searchParams.get('year')) || today.getFullYear()]));
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set([Number(searchParams.get('month')) || today.getMonth() + 1]));
  // 2 versi tampilan (poin B3): Summary View (layout existing, angka gabungan seluruh periode
  // terpilih) & Periodic View (matriks kolom per periode, BARU). `periodicMode` HANYA relevan
  // saat `viewMode==='PERIODIC'`.
  const [viewMode, setViewMode] = useState<ViewMode>('SUMMARY');
  const [periodicMode, setPeriodicMode] = useState<PeriodicMode>('MONTHLY');
  // Scroll+blink ke baris vessel spesifik saat datang dari chart "Vessels with Highest Cost" di
  // Dashboard (`?highlight=<VesselAgg.key>`, 2026-09 permintaan user). `highlightKey` dikonsumsi
  // SEKALI (di-null-kan setelah ketemu) supaya tidak berulang tiap re-render/perubahan filter
  // lain; `blinkKey` cuma nyalakan animasi CSS sesaat lalu ikut dibersihkan via timeout.
  const [highlightKey, setHighlightKey] = useState<string | null>(searchParams.get('highlight'));
  const [blinkKey, setBlinkKey] = useState<string | null>(null);

  const [masterVessels, setMasterVessels] = useState<MasterVessel[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Export sekarang lewat preview dulu (2026-09, permintaan user -- sama pola dgn export Excel
  // Audit Courier/`ExportModal.tsx`) -- tombol "Export" cuma buka modal ini, file baru beneran
  // dibuat saat user klik "Export" di dalam modal.
  const [showExportPreview, setShowExportPreview] = useState(false);
  // Detail baris sumber (method/identifier) per vessel_name yg perlu diperiksa -- dibuka dari
  // tombol "View Details" di banner NEEDS REVIEW.
  const [showReviewDetails, setShowReviewDetails] = useState(false);

  // Customize View -- pilih kolom biaya yg tampil/disembunyikan PER TAB (MONTHLY view saja;
  // YEARLY selalu 12 kolom bulan tetap, lihat Aturan Umum "1 kolom total per bulan"). Disimpan
  // localStorage (BUKAN Supabase, murni preferensi tampilan) -- pola sama persis
  // `beehive_customize_view:*` di SharedDataTable.tsx.
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showCustomize, setShowCustomize] = useState(false);
  // Sembunyikan vessel tanpa biaya (SEMUA kolom biayanya 0) dari pivot -- default DISEMBUNYIKAN
  // (2026-09, permintaan user). Berlaku di SEMUA tab (angka `v.sums` sudah terfilter per-tab
  // lewat `rowsForTab`, jadi cek totalCost otomatis benar per-tab tanpa logic tambahan).
  // Checkbox "Show zero-cost" utk menampilkan lagi kalau perlu.
  const [showZeroCost, setShowZeroCost] = useState(false);
  // Ciutkan/lebarkan baris per fleet_group (2026-09, permintaan user -- halaman kepanjangan
  // kalau semua vessel selalu tampil). State lokal saja (tidak disimpan), key `${base}::${fleetGroup}`
  // sama persis dgn `groupKey` yg sudah dihitung di useMemo displayRows.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const customizeStorageKey = (tab: TabId) => `beehive_customize_view:${user?.id}:reporting_cost_per_vessel:${tab}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(customizeStorageKey(activeTab));
      setHiddenCols(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setHiddenCols(new Set()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id]);

  // `mastersLoaded` dipakai gate effect scroll+blink (di bawah) -- tanpa ini, effect bisa jalan
  // "sukses" duluan pas `masterVessels` masih `[]` (fetch async terpisah dari `loadRows()`),
  // ketemu barisnya di grup sementara "NEEDS REVIEW" (fallback saat vessel_id belum ke-map),
  // langsung consume `highlightKey`+scroll ke posisi SEMENTARA itu -- begitu masterVessels
  // datang & baris pindah ke grup asli, tidak ada scroll susulan lagi krn highlightKey sudah
  // ke-null-kan (2026-09, akar penyebab laporan user "klik vessel belum mengarah ke baris").
  const [mastersLoaded, setMastersLoaded] = useState(false);
  useEffect(() => {
    fetchMasterVessels().then(v => { setMasterVessels(v); setMastersLoaded(true); }).catch(e => { setError(e.message); setMastersLoaded(true); });
  }, []);

  // Cartesian product tahun x bulan terpilih -- bulan kosong utk 1 tahun = seluruh 12 bulan tahun
  // itu (lihat komentar state di atas). Ini SATU-SATUNYA tempat resolusi periode final, dipakai
  // fetch, Recompute, DAN kolom Periodic View, supaya ketiganya selalu konsisten.
  const selectedPeriods: YearMonth[] = useMemo(() => {
    const years: number[] = [...selectedYears].sort((a, b) => a - b);
    const months: number[] = selectedMonths.size > 0 ? [...selectedMonths].sort((a, b) => a - b) : Array.from({ length: 12 }, (_, i) => i + 1);
    const out: YearMonth[] = [];
    years.forEach(year => months.forEach(month => out.push({ year, month })));
    return out;
  }, [selectedYears, selectedMonths]);
  const periodKey = selectedPeriods.map(p => `${p.year}-${p.month}`).join(',');

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllocationRowsByMonths(selectedPeriods);
      setRawRows(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodKey]);

  // "Last recomputed" -- TANPA kolom/tabel baru (2026-09 poin B6): ambil MAX(created_at) dari
  // baris yg SUDAH ter-fetch client-side utk periode yg lagi terpilih (`created_at` sudah
  // ke-select via `select('*')` di `fetchAllocationRowsByMonths`).
  const lastRecomputed = useMemo(() => {
    if (rawRows.length === 0) return null;
    const max = rawRows.reduce((a, r) => Math.max(a, new Date(r.created_at).getTime()), 0);
    return max > 0 ? new Date(max) : null;
  }, [rawRows]);

  const handleRecompute = async () => {
    if (!canEditPage) return;
    setRecomputing(true);
    setToast(null);
    try {
      // Recompute SETIAP bulan unik dalam periode yg SEDANG TERPILIH (2026-09 poin B6) -- bukan
      // lagi tergantung mode Monthly/Yearly terpisah. Summary View, DAN ketiga sub-mode Periodic
      // View (Monthly/Quarterly/Yearly) semuanya murni agregasi dari baris bulanan yg sama, jadi
      // merecompute bulan2 ini otomatis bikin SEMUA tampilan konsisten tanpa logic terpisah.
      let totalRows = 0, totalReview = 0;
      for (const p of selectedPeriods) {
        const res = await recomputeReportingMonth(new Date(p.year, p.month - 1, 1));
        totalRows += res.rows; totalReview += res.needsReview;
      }
      setToast(`Recompute complete (${selectedPeriods.length} month(s)): ${totalRows} rows (${totalReview} need review).`);
      await loadRows();
    } catch (e: any) {
      setToast('Recompute failed: ' + e.message);
    } finally {
      setRecomputing(false);
    }
  };

  // Aturan Umum #1: agregasi ini SATU-SATUNYA tempat hitung pivot, dipakai tab manapun & dibaca
  // ulang (query sama) oleh ReportingDashboardPage.tsx supaya angka tidak pernah beda.
  const { displayRows, needsReviewDetails } = useMemo(() => {
    const rowsForTab = activeTab === 'ALL' ? rawRows : rawRows.filter(r => r.method === activeTab);

    const aggMap = new Map<string, VesselAgg>();
    // Urutan `masterVessels.forEach` SUDAH `sort_order` (ikut file Excel Master Vessel persis --
    // lihat `fetchMasterVessels()`), jadi urutan alami `Array.from(aggMap.values())` di bawah
    // OTOMATIS benar TANPA sort tambahan (2026-09 "REVISI MENU REPORTING" poin B7 -- resort
    // alfabet yg dulu ada di sini SUDAH DIHAPUS). Ini juga yg bikin kasus "BASE tidak berurutan
    // rapi di file" (mis. JAKARTA muncul 2 blok terpisah) otomatis benar: grouping baris
    // konsekutif `${base}::${fleetGroup}` di bawah membuat blok terpisah kalau posisinya memang
    // tidak berurutan di file aslinya, TANPA logic tambahan apa pun.
    masterVessels.forEach(mv => {
      aggMap.set(`v:${mv.vessel_id}`, {
        key: `v:${mv.vessel_id}`, vesselId: mv.vessel_id, vesselName: mv.vessel_name,
        base: mv.base, fleetGroup: mv.fleet_group, sums: zeroSums(), periodSums: {},
      });
    });

    // Kumpulkan detail baris sumber (method/source_label) per vessel_name yg tidak cocok master
    // -- dipakai panel "NEEDS REVIEW" supaya user tahu di halaman mana + identifier apa yg harus
    // dicari manual (permintaan user "supaya mempermudah user mencari").
    const reviewMap = new Map<string, { method: AllocationMethod; sourceLabel: string | null; periodMonth: string }[]>();
    rowsForTab.forEach(r => {
      const monthKey = String(r.period_month).substring(0, 7); // 'YYYY-MM'
      let key = r.vessel_id ? `v:${r.vessel_id}` : `u:${r.vessel_name_raw}`;
      let agg = aggMap.get(key);
      if (!agg) {
        agg = {
          key, vesselId: r.vessel_id ?? null, vesselName: r.vessel_name_raw,
          base: NEEDS_REVIEW, fleetGroup: NEEDS_REVIEW, sums: zeroSums(), periodSums: {},
        };
        aggMap.set(key, agg);
      }
      if (r.needs_review) {
        if (!reviewMap.has(r.vessel_name_raw)) reviewMap.set(r.vessel_name_raw, []);
        reviewMap.get(r.vessel_name_raw)!.push({ method: r.method, sourceLabel: r.source_label ?? null, periodMonth: r.period_month });
      }
      addSums(agg.sums, r);
      if (!agg.periodSums[monthKey]) agg.periodSums[monthKey] = zeroSums();
      addSums(agg.periodSums[monthKey], r);
    });

    // Vessel tanpa biaya (SEMUA periode terpilih = 0) DIBUANG sebelum grouping -- supaya jumlah
    // "(N vessel)" di baris header/subtotal & count di preview export ikut menyesuaikan otomatis.
    // Grup yg SEMUA vesselnya kebuang otomatis tidak muncul sama sekali, krn grup dibangun dari
    // isi `all` yg sudah difilter ini. NEEDS_REVIEW entries (tidak match master) TETAP jatuh ke
    // urutan paling akhir secara alami (di-insert ke aggMap belakangan, setelah semua master).
    let all = Array.from(aggMap.values());
    if (!showZeroCost) all = all.filter(v => totalCost(v.sums) !== 0);

    // Bangun daftar tampil: baris HEADER grup (toggle ciutkan, DI ATAS -- cuma nama grup+jumlah
    // vessel, TANPA angka total) + baris vessel + baris SUBTOTAL (angka total, TETAP DI BAWAH
    // spt semula, TANPA toggle) + grand total. 2026-09: sempat dicoba pindahkan baris Subtotal
    // itu sendiri ke atas (gabung fungsi header+total jadi 1 baris), TERNYATA salah paham
    // maksud user -- yg diminta cuma TOGGLE-nya yg naik ke atas, Subtotal (rekap angka) TETAP di
    // bawah spt desain awal. Jangan gabung lagi jadi 1 baris tanpa diminta ulang.
    type Disp = { type: 'header'; base: string; fleetGroup: string; groupKey: string; count: number }
      | { type: 'vessel'; data: VesselAgg; groupKey: string }
      | { type: 'subtotal'; base: string; fleetGroup: string; groupKey: string; count: number; sums: Record<MetricKey, number>; periodSums: Record<string, Record<MetricKey, number>> }
      | { type: 'grand'; sums: Record<MetricKey, number>; periodSums: Record<string, Record<MetricKey, number>> };
    // `rawGroupKey` (base::fleetGroup) dipakai HANYA utk deteksi kontinuitas (blok baru kalau
    // beda dari blok sebelumnya) -- BUKAN dipakai sbg React key/collapsedGroups key final, krn
    // base+fleetGroup yg SAMA PERSIS bisa muncul di >1 blok TERPISAH (non-kontinu, mis. JAKARTA
    // muncul 2x di file Master Vessel -- lihat poin B7). Kalau dipakai apa adanya, key React
    // (header/subtotal) DAN entry `collapsedGroups` jadi BENTROK antar blok yg beda tapi nama
    // sama -- akibatnya toggle collapse 1 blok ikut mempengaruhi blok lain yg key-nya kebetulan
    // sama (bug ditemukan 2026-09: "beberapa fleet group tidak muncul lengkap saat Show
    // Zero Cost dicentang, tapi collapse/uncollapse berulang kadang memunculkannya" -- gejala
    // klasik React key collision, BUKAN bug logic filter `showZeroCost`). Fix: setiap BLOK
    // (bukan tiap NAMA grup) dapat `groupKey` unik `${rawGroupKey}#${index blok}`.
    const groups: { base: string; fleetGroup: string; groupKey: string; vessels: VesselAgg[] }[] = [];
    all.forEach(v => {
      const rawGroupKey = `${v.base}::${v.fleetGroup}`;
      const g = groups[groups.length - 1];
      if (!g || `${g.base}::${g.fleetGroup}` !== rawGroupKey) {
        groups.push({ base: v.base, fleetGroup: v.fleetGroup, groupKey: `${rawGroupKey}#${groups.length}`, vessels: [v] });
      } else {
        g.vessels.push(v);
      }
    });

    const out: Disp[] = [];
    const grandSums = zeroSums();
    const grandPeriodSums: Record<string, Record<MetricKey, number>> = {};
    groups.forEach(g => {
      const subSums = zeroSums();
      const subPeriodSums: Record<string, Record<MetricKey, number>> = {};
      g.vessels.forEach(v => {
        addSums(subSums, v.sums); addSums(grandSums, v.sums);
        Object.entries(v.periodSums).forEach(([pk, ps]) => {
          if (!subPeriodSums[pk]) subPeriodSums[pk] = zeroSums();
          if (!grandPeriodSums[pk]) grandPeriodSums[pk] = zeroSums();
          addSums(subPeriodSums[pk], ps); addSums(grandPeriodSums[pk], ps);
        });
      });
      out.push({ type: 'header', base: g.base, fleetGroup: g.fleetGroup, groupKey: g.groupKey, count: g.vessels.length });
      g.vessels.forEach(v => out.push({ type: 'vessel', data: v, groupKey: g.groupKey }));
      out.push({ type: 'subtotal', base: g.base, fleetGroup: g.fleetGroup, groupKey: g.groupKey, count: g.vessels.length, sums: subSums, periodSums: subPeriodSums });
    });
    out.push({ type: 'grand', sums: grandSums, periodSums: grandPeriodSums });

    const needsReviewDetails = Array.from(reviewMap.entries()).map(([vesselName, occurrences]) => ({ vesselName, occurrences }));
    return { displayRows: out, needsReviewDetails };
  }, [rawRows, masterVessels, activeTab, showZeroCost]);

  // Kolom Periodic View -- 1x hitung per render, dipakai header + sel tabel + export.
  const periodColumns = useMemo(() => buildPeriodColumns(selectedPeriods, periodicMode), [selectedPeriods, periodicMode]);

  // Jalankan scroll+blink sekali begitu baris targetnya sudah ada di DOM (setelah loading selesai
  // & displayRows terbentuk). Grup fleet_group vessel ini juga dipaksa terbuka dulu (kalau
  // sebelumnya diciutkan) supaya barisnya benar2 ada di DOM saat di-scroll.
  useEffect(() => {
    if (!highlightKey || loading || !mastersLoaded) return;
    const row = displayRows.find(r => r.type === 'vessel' && r.data.key === highlightKey) as
      { type: 'vessel'; data: VesselAgg; groupKey: string } | undefined;
    if (!row) return;
    setCollapsedGroups(prev => { if (!prev.has(row.groupKey)) return prev; const next = new Set(prev); next.delete(row.groupKey); return next; });
    const el = document.getElementById(`vessel-row-${encodeURIComponent(highlightKey)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setBlinkKey(highlightKey);
      const t = setTimeout(() => setBlinkKey(null), 5000);
      setHighlightKey(null);
      return () => clearTimeout(t);
    }
    // Elemen belum ada di DOM (mis. grup baru saja dibuka, belum re-render) -- `collapsedGroups`
    // di dependency supaya effect ini jalan lagi begitu grup selesai dibuka.
  }, [highlightKey, loading, mastersLoaded, displayRows, collapsedGroups]);

  const handleExport = async () => {
    // Export ikut PERSIS tampilan layar (2026-09 poin B5): viewMode, kolom Customize View yg
    // sedang tampil, DAN status ciutkan grup (`visibleDisplayRows`, BUKAN `displayRows` mentah --
    // fix bug lama, baris grup yg sedang diciutkan dulu TETAP ikut ke Excel).
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cost per Vessel');
    const rowsToExport = visibleDisplayRows.filter(r => r.type !== 'header');

    if (viewMode === 'SUMMARY') {
      const visibleCols = columnsForTab(activeTab).filter(c => !hiddenCols.has(c.key));
      ws.columns = [
        { header: 'Base', key: 'base', width: 16 },
        { header: 'Fleet Group', key: 'fleet_group', width: 18 },
        { header: 'Vessel', key: 'vessel', width: 30 },
        ...visibleCols.map(c => ({ header: c.label, key: c.key, width: 18 })),
      ];
      const cellVal = (c: any, sums: Record<MetricKey, number>) => c.key === 'total_cost' ? totalCost(sums) : c.key === 'total_excl_ppn' ? totalExclPpn(sums) : sums[c.key as MetricKey];
      rowsToExport.forEach(row => {
        if (row.type === 'vessel') {
          const rec: any = { base: row.data.base, fleet_group: row.data.fleetGroup, vessel: row.data.vesselName };
          visibleCols.forEach(c => { rec[c.key] = cellVal(c, row.data.sums); });
          ws.addRow(rec);
        } else if (row.type === 'subtotal') {
          const rec: any = { base: '', fleet_group: `Subtotal ${row.fleetGroup}`, vessel: '' };
          visibleCols.forEach(c => { rec[c.key] = cellVal(c, row.sums); });
          const r = ws.addRow(rec); r.font = { bold: true };
        } else {
          const rec: any = { base: '', fleet_group: 'GRAND TOTAL', vessel: '' };
          visibleCols.forEach(c => { rec[c.key] = cellVal(c, row.sums); });
          const r = ws.addRow(rec); r.font = { bold: true };
          r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEAF3' } }; });
        }
      });
      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A305A' } }; cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; });
    } else {
      // Periodic View -- header 2 tingkat via mergeCells (poin B5: "header ikut 2 tingkat dgn
      // sel digabung, supaya tidak perlu dirapikan manual di Excel"). Baris 1 = Base/Fleet
      // Group/Vessel (rowSpan 2, vertical merge) + label periode (colSpan 2 per kolom, horizontal
      // merge). Baris 2 = "Total Cost"/"Excl PPN+PPH" berulang per kolom periode. **Kolom
      // akumulasi paling kanan (2026-09 poin 5-7, revisi susulan)**: label "TOTAL YTD"/"TOTAL
      // TAHUN"/"TOTAL AKUMULASI" DIHAPUS -- header "Total Cost"/"Excl PPN+PPH"-nya di-merge
      // VERTIKAL (rowSpan 2) langsung dari baris 1, SAMA seperti Base/Fleet Group/Vessel.
      ws.columns = [
        { key: 'base', width: 16 }, { key: 'fleet_group', width: 18 }, { key: 'vessel', width: 30 },
        ...periodColumns.flatMap(p => [{ key: `${p.key}_t`, width: 18 }, { key: `${p.key}_e`, width: 18 }]),
        { key: 'acc_t', width: 18 }, { key: 'acc_e', width: 18 },
      ];
      const headerRow1 = ws.getRow(1); const headerRow2 = ws.getRow(2);
      headerRow1.getCell(1).value = 'Base'; headerRow1.getCell(2).value = 'Fleet Group'; headerRow1.getCell(3).value = 'Vessel';
      ws.mergeCells(1, 1, 2, 1); ws.mergeCells(1, 2, 2, 2); ws.mergeCells(1, 3, 2, 3);
      let col = 4;
      periodColumns.forEach(p => {
        headerRow1.getCell(col).value = p.label;
        ws.mergeCells(1, col, 1, col + 1);
        headerRow2.getCell(col).value = 'Total Cost'; headerRow2.getCell(col + 1).value = 'Excl PPN+PPH';
        col += 2;
      });
      headerRow1.getCell(col).value = 'Total Cost';
      headerRow1.getCell(col + 1).value = 'Excl PPN+PPH';
      ws.mergeCells(1, col, 2, col); ws.mergeCells(1, col + 1, 2, col + 1);
      [headerRow1, headerRow2].forEach(hr => hr.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A305A' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }));

      const rowValues = (sums: Record<MetricKey, number>, periodSums: Record<string, Record<MetricKey, number>>) => {
        const rec: number[] = [];
        periodColumns.forEach(p => { const s = sumPeriodKeys(periodSums, p.monthKeys); rec.push(totalCost(s), totalExclPpn(s)); });
        rec.push(totalCost(sums), totalExclPpn(sums)); // akumulasi = seluruh periode terpilih (sudah = `sums`)
        return rec;
      };
      rowsToExport.forEach(row => {
        if (row.type === 'vessel') {
          const r = ws.addRow([row.data.base, row.data.fleetGroup, row.data.vesselName, ...rowValues(row.data.sums, row.data.periodSums)]);
        } else if (row.type === 'subtotal') {
          const r = ws.addRow(['', `Subtotal ${row.fleetGroup}`, '', ...rowValues(row.sums, row.periodSums)]);
          r.font = { bold: true };
        } else {
          const r = ws.addRow(['', 'GRAND TOTAL', '', ...rowValues(row.sums, row.periodSums)]);
          r.font = { bold: true };
          r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEAF3' } }; });
        }
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const periodLabel = selectedPeriods.length === 1 ? `${selectedPeriods[0].year}-${String(selectedPeriods[0].month).padStart(2, '0')}` : `${selectedPeriods.length}periods`;
    a.download = `CostPerVessel_${activeTab}_${viewMode}_${periodLabel}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const monthlyCols = columnsForTab(activeTab);
  const visibleMonthlyCols = monthlyCols.filter(c => !hiddenCols.has(c.key));
  // Lebar kolom numerik tetap (colgroup di bawah) -- jumlah kolom beda2 tergantung viewMode/tab.
  // Periodic View: 2 sub-kolom (Total Cost/Excl PPN+PPH) per periode + 2 sub-kolom akumulasi.
  const numericColCount = viewMode === 'SUMMARY' ? visibleMonthlyCols.length : (periodColumns.length + 1) * 2;
  const numColW = 150;

  // Baris vessel dari fleet_group yg diciutkan disembunyikan dari render -- baris Subtotal &
  // Grand Total TETAP tampil (jadi Subtotal berfungsi jg sbg "header" grup saat diciutkan).
  const visibleDisplayRows = displayRows.filter(row => row.type !== 'vessel' || !collapsedGroups.has(row.groupKey));
  const allGroupKeys = Array.from(new Set(displayRows.filter(r => r.type === 'vessel').map(r => r.groupKey)));
  // Tombol Collapse/Expand All digabung jadi 1 (2026-09, permintaan user -- dulu 2 tombol
  // terpisah) -- label & aksinya berganti otomatis mengikuti status semua grup saat ini.
  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every(k => collapsedGroups.has(k));

  // Tombol lompat atas/bawah melayang (2026-09, permintaan user, ganti scrollbar tabel yg
  // memang sudah disembunyikan default di seluruh app -- lihat `src/index.css`). `scrollRef`
  // nunjuk ke div `overflow-auto` yg BENERAN scroll (tabel), bukan halaman -- lihat catatan
  // "shell tinggi tetap" di bawah kenapa scroll dipindah ke sini. `atTop`/`atBottom` dipakai
  // sembunyikan tombol yg arahnya sudah tidak relevan.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setAtTop(el.scrollTop <= 4);
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [visibleDisplayRows.length, loading]);

  return (
    <div className="flex-1 h-full overflow-hidden min-w-0 flex flex-col">
      {!embedded && (
        <header className="px-3 pt-1 pb-1 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
                <BarChart3 size={17} />
              </div>
              <div>
                <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Cost per Vessel</h1>
                <p className="text-[#5A305A] font-light text-sm mt-1">Cost summary per vessel — Courier, Sea, Air, FAR Overseas</p>
              </div>
            </div>
            <Greeting />
          </div>
        </header>
      )}

      {/* Shell "tinggi tetap + scroll internal" (2026-09, permintaan user "lock header & grand
          total") -- pola sama `BunkerPage.tsx`/`AuditPoPage.tsx` dkk (lihat CLAUDE.md). Halaman
          ITU SENDIRI tidak lagi scroll (`overflow-hidden` di wrapper terluar) -- filter/toolbar
          `shrink-0` jadi SELALU terlihat (tidak perlu sticky, memang tidak pernah ikut scroll),
          & tabel dapat area `flex-1` sendiri yg BENERAN scroll (`scrollRef`), thead `sticky
          top-0` & baris GRAND TOTAL `sticky bottom-0` di dalam area scroll itu. */}
      <main className="px-3 pt-2 pb-2 w-full flex-1 flex flex-col min-h-0">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3 shrink-0">
          {/* Dropdown method (2026-09 poin B2, GANTI TOTAL dari deretan tombol tab) -- "All
              Method" default. Multi-select Bulan/Tahun (poin B4) -- bulan kosong = seluruh 12
              bulan tahun itu (`MultiSelectDropdown emptyMeansAll`). */}
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <select value={activeTab} onChange={e => setActiveTab(e.target.value as TabId)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
              {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <MultiSelectDropdown label="Year" options={Array.from({ length: 6 }, (_, i) => { const y = today.getFullYear() - 3 + i; return { value: y, label: String(y) }; })}
              selected={selectedYears} onChange={setSelectedYears} />
            <MultiSelectDropdown label="Month" options={MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }))}
              selected={selectedMonths} onChange={setSelectedMonths} emptyMeansAll />

            {/* "Show zero-cost" & "Collapse All" DIPINDAH (2026-09, permintaan user) ke toolbar
                kartu tabel, sebaris dgn tombol Summary View/Periodic View -- lihat di bawah,
                dekat deklarasi `allCollapsed`. Tiap tombol lain di baris ini dikasih warna
                tematik sendiri (2026-09, permintaan user -- dulu semua putih/outline polos):
                Recompute = oranye (aksi hitung ulang data, sudah ada sejak awal), Customize View
                = biru (pengaturan tampilan), Export = hijau (aksi keluar/unduh, konvensi umum). */}
            <div className="ml-auto flex items-center gap-2">
              {canEditPage && (
                <button onClick={handleRecompute} disabled={recomputing}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 disabled:opacity-50">
                  <RefreshCw size={13} className={recomputing ? 'animate-spin' : ''} /> {recomputing ? 'Computing...' : 'Recompute'}
                </button>
              )}
              {viewMode === 'SUMMARY' && (
                <button onClick={() => setShowCustomize(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                  <SlidersHorizontal size={13} /> Customize View
                </button>
              )}
              <button onClick={() => setShowExportPreview(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                <Download size={13} /> Export
              </button>
            </div>
          </div>
          {/* Chip periode aktif (poin B4 "tampilkan periode aktif sebagai chip/label") + waktu
              Recompute terakhir (poin B6). */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] font-bold uppercase text-[#5A305A]/50">Active period:</span>
            {selectedPeriods.length === 0 ? (
              <span className="text-[10px] text-red-600 font-semibold">None selected</span>
            ) : selectedMonths.size === 0 ? (
              [...selectedYears].sort((a, b) => a - b).map(y => (
                <span key={y} className="text-[10px] font-semibold bg-[#73507B]/10 text-[#73507B] px-2 py-0.5 rounded-full">{y} (all months)</span>
              ))
            ) : (
              selectedPeriods.map(p => (
                <span key={`${p.year}-${p.month}`} className="text-[10px] font-semibold bg-[#73507B]/10 text-[#73507B] px-2 py-0.5 rounded-full">{MONTH_NAMES[p.month - 1]} {p.year}</span>
              ))
            )}
            {lastRecomputed && <span className="text-[10px] text-[#5A305A]/50 ml-auto">Last recomputed: {lastRecomputed.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {toast && <p className="text-xs text-[#5A305A] mt-2 font-medium">{toast}</p>}
          {needsReviewDetails.length > 0 && (
            <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1"><b>{needsReviewDetails.length} vessel name(s)</b> did not match Master Vessel and need review: {needsReviewDetails.slice(0, 8).map(d => d.vesselName).join(', ')}{needsReviewDetails.length > 8 ? ', ...' : ''}</span>
              <button onClick={() => setShowReviewDetails(true)} className="font-bold underline shrink-0 whitespace-nowrap">View Details</button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0">
          {/* 2 sub-tab tampilan DIPINDAH ke pojok kiri-atas kartu tabel (2026-09 poin 1, laporan
              user "jangan di deretan filter atas") -- shrink-0, di ATAS area scroll tabel. */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0 border-b border-slate-100">
            <div className="flex items-center gap-1">
              {(['SUMMARY', 'PERIODIC'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${viewMode === v ? 'bg-[#5A305A] text-white border-[#5A305A]' : 'bg-white text-[#5A305A] border-slate-200 hover:border-[#5A305A]'}`}>
                  {v === 'SUMMARY' ? 'Summary View' : 'Periodic View'}
                </button>
              ))}
            </div>
            {viewMode === 'PERIODIC' && (
              <select value={periodicMode} onChange={e => setPeriodicMode(e.target.value as PeriodicMode)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            )}
            {/* "Show zero-cost" & "Collapse All" (2026-09, DIPINDAH dari filter bar atas ke sini
                -- permintaan user "sebaris dengan tombol Summary View/Periodic View", posisi
                kanan). */}
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-[#5A305A] font-medium whitespace-nowrap cursor-pointer">
                <input type="checkbox" checked={showZeroCost} onChange={e => setShowZeroCost(e.target.checked)} className="w-3.5 h-3.5 accent-[#5A305A]" />
                Show zero-cost
              </label>
              <button onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(allGroupKeys))}
                title={allCollapsed ? 'Expand all Fleet Groups' : 'Collapse all Fleet Groups'}
                className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30 hover:bg-[#73507B]/20 whitespace-nowrap">
                {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                {allCollapsed ? 'Expand All' : 'Collapse All'}
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="overflow-auto flex-1 min-h-0">
            {/* table-fixed + colgroup lebar eksplisit (2026-09, laporan user "jarak terlalu
                jauh") -- tanpa ini, `<table>` auto-layout meregangkan 1-2 kolom angka terakhir
                mengisi SISA lebar layar (bisa ratusan px kosong sebelum angkanya), krn cuma ada
                sedikit kolom. Lebar numerik `numColW` tetap per kolom, `min-w` total dihitung
                dinamis (jumlah kolom beda2 tiap tab/Customize View/Bulanan-Tahunan). */}
            <table className="w-full text-[11px] table-fixed" style={{ minWidth: `${430 + numericColCount * numColW}px` }}>
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                {Array.from({ length: numericColCount }).map((_, i) => <col key={i} style={{ width: `${numColW}px` }} />)}
              </colgroup>
              <thead className="bg-slate-50 sticky top-0 z-10">
                {viewMode === 'SUMMARY' ? (
                  <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                    <th className="text-left px-3 py-2.5 whitespace-nowrap">Base</th>
                    <th className="text-left px-3 py-2.5 whitespace-nowrap">Fleet Group</th>
                    <th className="text-left px-3 py-2.5 whitespace-nowrap">Vessel</th>
                    {visibleMonthlyCols.map(c => <th key={c.key} className="text-right px-3 py-2.5 whitespace-nowrap truncate last:pr-5">{c.label}</th>)}
                  </tr>
                ) : (
                  // Header 2 tingkat (poin B3, revisi 5-7): tingkat 1 = label periode (colSpan 2)
                  // per kolom periode, tingkat 2 = "Total Cost"/"Excl PPN+PPH" berulang di
                  // bawahnya. Kolom AKUMULASI paling kanan SENGAJA TIDAK py label periode
                  // ("TOTAL YTD"/"TOTAL TAHUN"/"TOTAL AKUMULASI" DIHAPUS, laporan user) --
                  // header "Total Cost"/"Excl PPN+PPH"-nya `rowSpan={2}` MEMBENTANG dari row1
                  // langsung (menutupi posisi yg dulu diisi label akumulasi), SAMA seperti
                  // Base/Fleet Group/Vessel di kiri.
                  <>
                    <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                      <th rowSpan={2} className="text-left px-3 py-2.5 whitespace-nowrap align-bottom">Base</th>
                      <th rowSpan={2} className="text-left px-3 py-2.5 whitespace-nowrap align-bottom">Fleet Group</th>
                      <th rowSpan={2} className="text-left px-3 py-2.5 whitespace-nowrap align-bottom">Vessel</th>
                      {periodColumns.map(p => <th key={p.key} colSpan={2} className="text-center px-3 py-1.5 whitespace-nowrap border-l border-slate-200">{p.label}</th>)}
                      <th rowSpan={2} className="text-right px-3 py-2 whitespace-nowrap border-l border-slate-200 align-bottom bg-slate-200/70">Total Cost</th>
                      <th rowSpan={2} className="text-right px-3 py-2 whitespace-nowrap last:pr-5 align-bottom bg-slate-200/70">Excl PPN+PPH</th>
                    </tr>
                    <tr className="text-[10px] text-[#5A305A]/70 uppercase">
                      {periodColumns.map(p => (
                        <React.Fragment key={p.key}>
                          <th className="text-right px-3 py-2 whitespace-nowrap border-l border-slate-200">Total Cost</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">Excl PPN+PPH</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={20} className="text-center py-10 text-[#5A305A]">Loading data...</td></tr>
                ) : error ? (
                  <tr><td colSpan={20} className="text-center py-10 text-red-600">{error}</td></tr>
                ) : visibleDisplayRows.length === 0 ? (
                  <tr><td colSpan={20} className="text-center py-10 text-[#5A305A] italic">No master vessel data yet.</td></tr>
                ) : visibleDisplayRows.filter(row => row.type !== 'grand').map((row, idx) => {
                  // Sel angka -- generik utk vessel/subtotal/grand, cabang per `viewMode`. Summary
                  // View pakai `visibleMonthlyCols` (kolom lama, TIDAK berubah strukturnya).
                  // Periodic View pakai `periodColumns` (Total Cost/Excl PPN+PPH per periode) +
                  // 2 kolom akumulasi (SUM seluruh periode terpilih = `sums`, lihat klarifikasi
                  // user di plan).
                  const renderNumericCells = (sums: Record<MetricKey, number>, periodSums: Record<string, Record<MetricKey, number>>) => {
                    if (viewMode === 'SUMMARY') {
                      return visibleMonthlyCols.map(c => (
                        <td key={c.key} className="px-3 py-2 text-right font-mono text-[#5A305A] last:pr-5">
                          {fmtRp(c.key === 'total_cost' ? totalCost(sums) : c.key === 'total_excl_ppn' ? totalExclPpn(sums) : sums[c.key as MetricKey])}
                        </td>
                      ));
                    }
                    return (
                      <>
                        {periodColumns.map(p => {
                          const s = sumPeriodKeys(periodSums, p.monthKeys);
                          return (
                            <React.Fragment key={p.key}>
                              <td className="px-3 py-2 text-right font-mono text-[#5A305A] border-l border-slate-100">{fmtRp(totalCost(s))}</td>
                              <td className="px-3 py-2 text-right font-mono text-[#5A305A]">{fmtRp(totalExclPpn(s))}</td>
                            </React.Fragment>
                          );
                        })}
                        {/* 2 kolom akumulasi PALING KANAN diberi latar abu-abu agak gelap
                            (2026-09, permintaan user) -- supaya jelas beda dari kolom-kolom
                            periode di kirinya (yg latarnya polos/putih). */}
                        <td className="px-3 py-2 text-right font-mono text-[#5A305A] border-l border-slate-200 bg-slate-200/70">{fmtRp(totalCost(sums))}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#5A305A] last:pr-5 bg-slate-200/70">{fmtRp(totalExclPpn(sums))}</td>
                      </>
                    );
                  };

                  if (row.type === 'header') {
                    const isCollapsed = collapsedGroups.has(row.groupKey);
                    return (
                      <tr key={`hdr-${row.groupKey}`} className="bg-slate-50 hover:bg-slate-100 border-l-[3px]" style={{ borderLeftColor: '#73507B' }}>
                        <td className="px-3 py-2 text-[#5A305A] font-medium">{row.base}</td>
                        <td className="px-3 py-2 text-[#5A305A]" colSpan={2}>
                          <button onClick={() => toggleGroup(row.groupKey)} className="flex items-center gap-2 group font-semibold">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0" style={{ border: '1.5px solid #73507B', backgroundColor: isCollapsed ? 'transparent' : '#73507B1A' }}>
                              <ChevronDown size={12} strokeWidth={2.5} style={{ color: '#73507B' }} className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                            </span>
                            <span className="group-hover:underline">{row.fleetGroup}</span>
                            <span className="text-[10px] font-normal text-[#5A305A]/70">({row.count} {row.count === 1 ? 'vessel' : 'vessels'})</span>
                          </button>
                        </td>
                        {/* 2 kolom akumulasi paling kanan ikut diberi latar abu-abu gelap di
                            baris header grup juga (Periodic View) -- konsisten dgn body/subtotal,
                            supaya garis kolomnya kelihatan menerus dari header sampai footer. */}
                        {Array.from({ length: numericColCount }).map((_, i) => (
                          <td key={i} className={`px-3 py-2 ${viewMode === 'PERIODIC' && i >= numericColCount - 2 ? 'bg-slate-200/70' : ''}`}></td>
                        ))}
                      </tr>
                    );
                  }
                  if (row.type === 'vessel') {
                    // Base/Fleet Group TIDAK diulang di baris vessel (sengaja dikosongkan) --
                    // sudah tercantum di baris HEADER (toggle) di atas & baris Subtotal di bawah.
                    return (
                      <tr key={row.data.key} id={`vessel-row-${encodeURIComponent(row.data.key)}`} className={`hover:bg-blue-50/30 ${blinkKey === row.data.key ? 'reporting-row-blink' : ''}`}>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-[#5A305A] font-semibold pl-6">{row.data.vesselName}</td>
                        {renderNumericCells(row.data.sums, row.data.periodSums)}
                      </tr>
                    );
                  }
                  if (row.type === 'subtotal') {
                    return (
                      <tr key={`sub-${row.groupKey}`} className="bg-[#FFF5C5] hover:bg-[#F5E28F] border-l-[3px] border-l-[#E6C25C] font-bold">
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-[#5A305A]" colSpan={2}>
                          Subtotal {row.fleetGroup}
                          <span className="text-[10px] font-normal text-[#5A305A]/70 ml-1.5">({row.count} {row.count === 1 ? 'vessel' : 'vessels'})</span>
                        </td>
                        {renderNumericCells(row.sums, row.periodSums)}
                      </tr>
                    );
                  }
                  return null; // 'grand' difilter keluar dari sini, dirender terpisah di <tfoot> sticky bottom di bawah
                })}
              </tbody>
              {/* GRAND TOTAL dikunci di BAWAH area scroll tabel (2026-09, permintaan user) --
                  `<tfoot>` + `sticky bottom-0` (kebalikan pola `<thead> sticky top-0` di atas),
                  DIPISAH dari `visibleDisplayRows.map()` di atas (dulu baris terakhir di situ)
                  supaya bisa berdiri sendiri sbg elemen sticky-bottom yg valid. */}
              {!loading && !error && (() => {
                const grand = displayRows.find(r => r.type === 'grand') as { type: 'grand'; sums: Record<MetricKey, number>; periodSums: Record<string, Record<MetricKey, number>> } | undefined;
                if (!grand) return null;
                return (
                  <tfoot>
                    <tr className="bg-[#5A305A] text-white font-bold sticky bottom-0 z-10">
                      <td className="px-3 py-2.5" colSpan={3}>GRAND TOTAL</td>
                      {viewMode === 'SUMMARY'
                        ? visibleMonthlyCols.map(c => (
                            <td key={c.key} className="px-3 py-2.5 text-right font-mono last:pr-5">
                              {fmtRp(c.key === 'total_cost' ? totalCost(grand.sums) : c.key === 'total_excl_ppn' ? totalExclPpn(grand.sums) : grand.sums[c.key as MetricKey])}
                            </td>
                          ))
                        : (
                          <>
                            {periodColumns.map(p => {
                              const s = sumPeriodKeys(grand.periodSums, p.monthKeys);
                              return (
                                <React.Fragment key={p.key}>
                                  <td className="px-3 py-2.5 text-right font-mono border-l border-white/20">{fmtRp(totalCost(s))}</td>
                                  <td className="px-3 py-2.5 text-right font-mono">{fmtRp(totalExclPpn(s))}</td>
                                </React.Fragment>
                              );
                            })}
                            <td className="px-3 py-2.5 text-right font-mono border-l border-white/20">{fmtRp(totalCost(grand.sums))}</td>
                            <td className="px-3 py-2.5 text-right font-mono last:pr-5">{fmtRp(totalExclPpn(grand.sums))}</td>
                          </>
                        )}
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>

        {/* Tombol melayang (Back to Dashboard + lompat atas/bawah) -- `fixed` relatif viewport
            (BUKAN relatif kartu tabel), supaya posisinya tetap menempel pojok kanan bawah LAYAR
            walau area tabel di atas scroll internal (bukan lagi scroll halaman penuh, lihat
            catatan shell "tinggi tetap" di atas). **Susulan 2026-09 (laporan user + screenshot:
            ukuran kegedean & nutupin baris tabel di tengah layar)** -- diperkecil `w-10 h-10`
            ->`w-8 h-8` (ikon `18`->`14`), DAN digeser betulan ke pojok kanan BAWAH (`right-1`,
            digeser lebih dekat lagi ke tepi layar dari `right-3` semula -- laporan user susulan
            "masih kurang geser ke kanan"), ditumpuk rapat `bottom-3`/`bottom-14`/`bottom-24` -- BUKAN lagi tersebar
            `bottom-20`/`bottom-32`/`bottom-44` yg dulu melayang di tengah ketinggian tabel &
            nutupin banyak baris). Jarak ke baris GRAND TOTAL sticky (permintaan lama "jangan
            menutupi grand total") tetap terjaga krn tombol PALING BAWAH (`bottom-3`≈12px) masih
            lebih kecil dari tinggi baris Grand Total (~44px) TAPI grand total row z-index 10 <
            tombol z-30 -- baris itu sendiri yg sticky nempel PERSIS di tepi bawah area scroll,
            bukan di tepi layar, jadi tombol pojok kanan-BAWAH LAYAR (bukan bawah tabel) otomatis
            tidak pernah menutupinya (beda posisi vertikal, tabel berhenti sebelum tepi layar
            krn `main` masih py `pb-2`). Disembunyikan masing2 kalau sudah di ujung arahnya
            (`atTop`/`atBottom`). Tidak perlu tampilkan scrollbar tabel -- app ini sudah default
            sembunyikan semua scrollbar (`src/index.css`), tombol ini cuma gantinya. */}
        <Link to="/reporting/cost-by-vessel?view=dashboard" title="Back to Dashboard" aria-label="Back to Dashboard"
          className="fixed bottom-24 right-1 z-30 w-8 h-8 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white shadow-lg flex items-center justify-center transition-all">
          <ArrowLeft size={14} />
        </Link>
        {!atTop && (
          <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Jump to top" aria-label="Jump to top"
            className="fixed bottom-14 right-1 z-30 w-8 h-8 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white shadow-lg flex items-center justify-center transition-all">
            <ArrowUp size={14} />
          </button>
        )}
        {!atBottom && (
          <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
            title="Jump to bottom" aria-label="Jump to bottom"
            className="fixed bottom-3 right-1 z-30 w-8 h-8 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white shadow-lg flex items-center justify-center transition-all">
            <ArrowDown size={14} />
          </button>
        )}
      </main>

      {showCustomize && (
        <CustomizeViewModal
          allCols={monthlyCols}
          hiddenKeys={hiddenCols}
          onCancel={() => setShowCustomize(false)}
          onSave={(next) => {
            setHiddenCols(next);
            try { localStorage.setItem(customizeStorageKey(activeTab), JSON.stringify(Array.from(next))); } catch { /* localStorage bisa gagal di private mode, abaikan */ }
            setShowCustomize(false);
          }}
        />
      )}

      {showExportPreview && (
        <ExportPreviewModal
          displayRows={visibleDisplayRows}
          visibleMonthlyCols={visibleMonthlyCols}
          viewMode={viewMode}
          periodColumns={periodColumns}
          activeTab={activeTab}
          onClose={() => setShowExportPreview(false)}
          onConfirm={async () => { await handleExport(); setShowExportPreview(false); }}
        />
      )}

      {showReviewDetails && (
        <ReviewDetailsModal details={needsReviewDetails} onClose={() => setShowReviewDetails(false)} />
      )}
    </div>
  );
}

// Pilih kolom biaya yg tampil/sembunyi utk tab yg sedang aktif -- state pending lokal (butuh
// klik Save, bukan auto-apply), pola sama `CustomizeViewModal` di SharedDataTable.tsx (Audit/
// Rekapan Courier) TAPI komponen terpisah sendiri (SharedDataTable.tsx tidak expose punya-nya).
function CustomizeViewModal({ allCols, hiddenKeys, onCancel, onSave }: {
  allCols: { key: string; label: string }[]; hiddenKeys: Set<string>;
  onCancel: () => void; onSave: (next: Set<string>) => void;
}) {
  const [pending, setPending] = useState<Set<string>>(new Set(hiddenKeys));
  const toggle = (key: string) => setPending(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-[#5A305A] text-sm">Customize View</h3>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A]"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
          {allCols.map(c => (
            <label key={c.key} className="flex items-center gap-2 text-sm text-[#5A305A] cursor-pointer">
              <input type="checkbox" checked={!pending.has(c.key)} onChange={() => toggle(c.key)} className="w-4 h-4 accent-[#5A305A]" />
              {c.label}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100">
          <div className="flex gap-2">
            <button onClick={() => setPending(new Set())} className="text-xs font-bold text-[#5A305A] hover:underline">Reset to Default</button>
            <button onClick={() => setPending(new Set(allCols.map(c => c.key)))} className="text-xs font-bold text-[#5A305A] hover:underline">Uncheck All</button>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-[#5A305A]">Cancel</button>
            <button onClick={() => onSave(pending)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Preview sebelum file Excel beneran dibuat (2026-09, permintaan user -- pola sama `ExportModal.tsx`
// yg dipakai Audit Courier: tampilkan dulu isinya, baru user konfirmasi "Export"). Header tabel
// preview `#5A305A` (permintaan user eksplisit -- BEDA dari `ExportModal.tsx` yg pakai abu-abu,
// sengaja disamakan warna brand di modal Reporting ini).
function ExportPreviewModal({ displayRows, visibleMonthlyCols, viewMode, periodColumns, activeTab, onClose, onConfirm }: {
  displayRows: any[];
  visibleMonthlyCols: { key: MetricKey | 'total_cost' | 'total_excl_ppn'; label: string }[];
  viewMode: ViewMode; periodColumns: PeriodColumn[]; activeTab: TabId;
  onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);
  const vesselRowCount = displayRows.filter(r => r.type === 'vessel').length;
  const previewRows = displayRows.slice(0, 15);
  const cellValue = (sums: Record<MetricKey, number>) => (c: any) =>
    fmtRp(c.key === 'total_cost' ? totalCost(sums) : c.key === 'total_excl_ppn' ? totalExclPpn(sums) : sums[c.key as MetricKey]);

  const handleConfirm = async () => {
    setExporting(true);
    try { await onConfirm(); } finally { setExporting(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#5A305A]">Preview Export — Cost per Vessel</h3>
            <p className="text-sm text-[#5A305A] mt-1">{vesselRowCount} vessel row(s) will be exported ({TABS.find(t => t.id === activeTab)?.label}, {viewMode === 'SUMMARY' ? 'Summary View' : 'Periodic View'})</p>
          </div>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A]"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="min-w-max border rounded-xl overflow-hidden shadow-sm bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#5A305A] text-white font-bold sticky top-0 z-10">
                {viewMode === 'SUMMARY' ? (
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">Base</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Fleet Group</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Vessel</th>
                    {visibleMonthlyCols.map(c => <th key={c.key} className="px-3 py-2.5 text-right whitespace-nowrap">{c.label}</th>)}
                  </tr>
                ) : (
                  <>
                    <tr>
                      <th rowSpan={2} className="px-3 py-2.5 whitespace-nowrap align-bottom">Base</th>
                      <th rowSpan={2} className="px-3 py-2.5 whitespace-nowrap align-bottom">Fleet Group</th>
                      <th rowSpan={2} className="px-3 py-2.5 whitespace-nowrap align-bottom">Vessel</th>
                      {periodColumns.map(p => <th key={p.key} colSpan={2} className="px-3 py-1.5 text-center whitespace-nowrap border-l border-white/20">{p.label}</th>)}
                      <th rowSpan={2} className="px-3 py-2 text-right whitespace-nowrap border-l border-white/20 align-bottom">Total Cost</th>
                      <th rowSpan={2} className="px-3 py-2 text-right whitespace-nowrap align-bottom">Excl PPN+PPH</th>
                    </tr>
                    <tr>
                      {periodColumns.map(p => (
                        <React.Fragment key={p.key}>
                          <th className="px-3 py-2 text-right whitespace-nowrap border-l border-white/20">Total Cost</th>
                          <th className="px-3 py-2 text-right whitespace-nowrap">Excl PPN+PPH</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </>
                )}
              </thead>
              <tbody>
                {previewRows.map((row, idx) => {
                  if (row.type === 'header') return null; // murni UI ciutkan, tidak relevan di preview export
                  const cells = (sums: Record<MetricKey, number>, periodSums: Record<string, Record<MetricKey, number>>) => {
                    if (viewMode === 'SUMMARY') return visibleMonthlyCols.map(c => <td key={c.key} className="px-3 py-2 text-right font-mono">{cellValue(sums)(c)}</td>);
                    return (
                      <>
                        {periodColumns.map(p => { const s = sumPeriodKeys(periodSums, p.monthKeys); return (
                          <React.Fragment key={p.key}>
                            <td className="px-3 py-2 text-right font-mono border-l border-slate-100">{fmtRp(totalCost(s))}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtRp(totalExclPpn(s))}</td>
                          </React.Fragment>
                        ); })}
                        <td className="px-3 py-2 text-right font-mono border-l border-slate-100">{fmtRp(totalCost(sums))}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtRp(totalExclPpn(sums))}</td>
                      </>
                    );
                  };
                  if (row.type === 'vessel') {
                    return (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-[#5A305A]">{row.data.base}</td>
                        <td className="px-3 py-2 text-[#5A305A]">{row.data.fleetGroup}</td>
                        <td className="px-3 py-2 text-[#5A305A] font-semibold">{row.data.vesselName}</td>
                        {cells(row.data.sums, row.data.periodSums)}
                      </tr>
                    );
                  }
                  if (row.type === 'subtotal') {
                    return (
                      <tr key={idx} className="bg-[#FFF5C5] font-bold">
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-[#5A305A]" colSpan={2}>Subtotal {row.fleetGroup}</td>
                        {cells(row.sums, row.periodSums)}
                      </tr>
                    );
                  }
                  return (
                    <tr key={idx} className="bg-[#5A305A] text-white font-bold">
                      <td className="px-3 py-2.5" colSpan={3}>GRAND TOTAL</td>
                      {cells(row.sums, row.periodSums)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {displayRows.length > previewRows.length && (
            <div className="text-center py-4 text-xs text-[#5A305A] font-medium">
              Showing the first {previewRows.length} rows as preview. The remaining rows will still be included in the export.
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-5 border-t border-slate-100 bg-white">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={handleConfirm} disabled={exporting} className="flex-[2] flex justify-center items-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50">
            {exporting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Detail baris sumber per vessel_name yg NEEDS REVIEW -- klik "View Details" di banner. Nunjukin
// halaman/tabel asal + identifier (No. Invoice/AWB/dst) supaya user gampang cari manual & benerin
// (mis. tambah alias di Master Vessel, atau perbaiki ketikan nama vessel di sumbernya).
function ReviewDetailsModal({ details, onClose }: {
  details: { vesselName: string; occurrences: { method: AllocationMethod; sourceLabel: string | null; periodMonth: string }[] }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-[#5A305A]">Vessel Names Needing Review</h3>
            <p className="text-sm text-[#5A305A] mt-1">Fix the vessel name at the source, or add it as an alias in Master Vessel.</p>
          </div>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A]"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {details.map(d => (
            <div key={d.vesselName} className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
              <p className="font-bold text-[#5A305A] text-sm mb-2">"{d.vesselName}"</p>
              <div className="space-y-1.5">
                {d.occurrences.map((o, i) => {
                  const page = METHOD_SOURCE_PAGE[o.method];
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs bg-white rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <Link to={page.path} className="font-semibold text-[#5A305A] hover:underline">{page.label}</Link>
                        <p className="text-[#5A305A]/70 mt-0.5">{page.idLabel}: <span className="font-mono font-medium">{o.sourceLabel || '—'}</span> · Period: {o.periodMonth.substring(0, 7)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-xs font-bold px-4 py-2 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
