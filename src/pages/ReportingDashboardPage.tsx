import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Ship, TrendingUp, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import Greeting from '../components/Greeting';
import {
  fetchMasterVessels, fetchAllocationRows, MasterVessel,
  MetricKey, zeroSums, totalCost, totalExclPpn, metricForMethod, addSums, AllocationMethod,
  PeriodMode, quarterOfMonth,
} from '../utils/ReportingHelpers';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "All-In Import" -> "FAR Ovs" (2026-09 "REVISI MENU REPORTING" -- kembali ke penamaan sebelum
// direname jadi "All-In Import" sesi lalu). Value internal `AllocationMethod` TETAP `'BORONGAN'`.
const METHOD_LABEL: Record<AllocationMethod, string> = { COURIER: 'Courier', SEA: 'Sea', AIR: 'Air', BORONGAN: 'FAR Ovs' };
const METHOD_COLOR: Record<AllocationMethod, string> = { COURIER: '#5A305A', SEA: '#2563EB', AIR: '#0EA5E9', BORONGAN: '#D97706' };
// Opsi dropdown filter method di header panel "Cost per Method" (2026-09, permintaan user) --
// TIDAK memfilter panel "Cost per Method" itu sendiri (tetap tampil breakdown semua method),
// tapi memfilter SELURUH bagian lain dashboard (kartu ringkasan, Vessels with Highest Cost,
// Cost by Category, Cost per Fleet Group, Monthly Trend).
const METHOD_FILTER_OPTIONS: { id: 'ALL' | AllocationMethod; label: string }[] = [
  { id: 'ALL', label: 'All Method' },
  { id: 'COURIER', label: 'Courier' },
  { id: 'SEA', label: 'Sea' },
  { id: 'AIR', label: 'Air' },
  { id: 'BORONGAN', label: 'FAR Ovs' },
];

// Nominal SELALU ditampilkan penuh (pemisah ribuan titik id-ID) -- TIDAK PERNAH disingkat
// M/Jt/K (2026-09, permintaan user eksplisit: "Rp 2.4 M" salah, "Rp 2.412.885.640" benar).
// Versi singkat (dulu `fmtRpShort()`) SUDAH DIHAPUS TOTAL -- jangan reintroduce di halaman ini.
const fmtRp = (n: number) => n ? `Rp ${Math.round(n).toLocaleString('id-ID')}` : 'Rp 0';

// HTML (BUKAN SVG lagi) — 2026-09, laporan user nama vessel/kategori kepotong "...." di versi
// SVG (`<text>` SVG tidak bisa wrap multi-baris tanpa hitung manual per-karakter, jadi dulu
// dipotong paksa `.slice(0,19)+'…'`). HTML `break-words` bisa wrap alami ke baris berikutnya
// tanpa perlu hitung lebar teks manual -- label kolom lebar tetap (`w-48`), TIDAK PERNAH
// dipotong apapun panjangnya. Tooltip native lewat atribut `title` (pengganti `<title>` SVG).
function HorizontalBarChart({ data, color, formatValue, onBarClick }: {
  data: { label: string; value: number }[]; color: string; formatValue: (n: number) => string;
  onBarClick?: (index: number) => void;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div
          key={`${d.label}-${i}`}
          title={`${d.label}: ${formatValue(d.value)}`}
          onClick={() => onBarClick?.(i)}
          className={`flex items-center gap-3 ${onBarClick ? 'cursor-pointer group' : ''}`}
        >
          <div className="w-48 shrink-0 text-xs font-medium text-[#5A305A] break-words leading-snug group-hover:underline">{d.label}</div>
          <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden min-w-0">
            <div className="h-full rounded transition-all" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: color }} />
          </div>
          <div className="w-44 shrink-0 text-right text-xs font-bold font-mono text-[#5A305A]">{formatValue(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

// HTML (BUKAN SVG lagi) — 2026-09, laporan user bar-nya "gepeng & pecah" di versi SVG. Root
// cause: `preserveAspectRatio="none"` (fix percobaan sebelumnya utk masalah "bolong kanan")
// meregangkan SUMBU X JAUH lebih besar drpd sumbu Y (viewBox 720x220 dipaksa isi container
// ratusan-ribuan px lebar tapi tinggi tetap ~220px) -- sudut membulat (`rx=4`) & garis putus2
// gridline TIDAK ikut proporsional thdp stretch non-uniform ini, jadi kelihatan distorsi/pecah.
// Fix TUNTAS: ganti total ke `<div>` flex (lebar kolom otomatis dari `flex-1`, TIDAK PERNAH
// ada masalah stretch non-uniform krn tidak ada viewBox/scaling manual sama sekali) -- pola
// sama dgn `HorizontalBarChart` yg sudah lebih dulu dipindah dari SVG ke HTML.
function VerticalBarChart({ data, color, formatValue, onBarClick }: {
  data: { label: string; value: number }[]; color: string; formatValue: (n: number) => string;
  onBarClick?: (index: number) => void;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div>
      <div className="relative h-52">
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {gridLines.map(g => <div key={g} className="border-t border-dashed border-slate-200" />)}
        </div>
        <div className="relative h-full flex items-end gap-1.5">
          {data.map((d, i) => (
            <div
              key={d.label}
              title={`${d.label}: ${formatValue(d.value)}`}
              onClick={() => onBarClick?.(i)}
              className={`flex-1 h-full flex items-end ${onBarClick ? 'cursor-pointer' : ''}`}
            >
              <div
                className="w-full rounded-t transition-all"
                style={{ height: `${Math.max(1, (d.value / max) * 100)}%`, backgroundColor: color, opacity: d.value > 0 ? 1 : 0.15 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 mt-2">
        {data.map(d => (
          <div key={d.label} className="flex-1 text-center text-[10px] font-bold text-[#5A305A]">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// Donut chart -- SVG stroke-dasharray per segment, pola serupa pie chart manual
// `AuditPoPage.tsx` DashboardModal yang sudah ada di project. BUKAN bar chart -- viewBox persegi
// tetap (`0 0 100 100`), TIDAK PERNAH di-stretch non-uniform kayak `VerticalBarChart` versi SVG
// lama yang pernah "gepeng & pecah" (lihat komentar di atas), jadi aman dari masalah itu. Total
// (sum seluruh segmen) dirender di tengah donut via `<text>`. Legend di kanan: nama method,
// persentase, DAN nominal PENUH (bukan singkatan -- pola `fmtRp` yang sudah ada).
function DonutChart({ data, formatValue }: { data: { label: string; value: number; color: string }[]; formatValue: (n: number) => string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 40, CX = 50, CY = 50, STROKE = 16;
  const circumference = 2 * Math.PI * R;
  let offsetAcc = 0;
  const segments = data.filter(d => d.value > 0).map(d => {
    const frac = total > 0 ? d.value / total : 0;
    const dash = frac * circumference;
    const seg = { ...d, frac, dashArray: `${dash} ${circumference - dash}`, dashOffset: -offsetAcc };
    offsetAcc += dash;
    return seg;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-48 h-48 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F1F5F9" strokeWidth={STROKE} />
          {segments.map((s, i) => (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.color} strokeWidth={STROKE}
              strokeDasharray={s.dashArray} strokeDashoffset={s.dashOffset} strokeLinecap="butt">
              <title>{s.label}: {formatValue(s.value)}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase text-[#5A305A]/60">Total</span>
          <span className="text-sm font-black text-[#5A305A] text-center px-2 break-words">{formatValue(total)}</span>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs font-semibold text-[#5A305A] flex-1">{d.label}</span>
            <span className="text-xs font-bold text-[#5A305A]/70 w-12 text-right shrink-0">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
            <span className="text-xs font-bold font-mono text-[#5A305A] shrink-0">{formatValue(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Header berwarna per panel (2026-09, permintaan user -- dulu SEMUA panel flat putih polos).
// Riwayat warna (SEMUA 8 panel 1 warna dulu, lalu dipecah 2 kelompok): 4 warna brand berbeda
// per panel -> diseragamkan `#FFF5C5` -> `#73507B` -> `#8F7395` -> `#DCC9E0` (lavender, SEMUA 8
// panel) -> dipecah 2 kelompok (4 kartu ringkasan tetap `#DCC9E0`, 5 panel lain sempat
// `#F7A392`/coral muda) -> **SEKARANG (final)**: 5 panel yg tadi `#F7A392` diganti LAGI balik ke
// `#FFF5C5` (permintaan eksplisit user, BUKAN reintroduce state lama -- ini keputusan BARU,
// kebetulan hex-nya sama dgn salah satu iterasi lampau). **Kondisi FINAL SEKARANG**: 4 panel
// kartu ringkasan (Total Cost/Total Cost Exclude PPN+PPH/Highest Vessel Cost/Previous Period)
// = `#DCC9E0`; 5 panel analitik/chart (Cost per Method/Vessels with Highest Cost/Cost by
// Category/Cost per Fleet Group/Monthly Trend) = `#FFF5C5`. SEMUA varian warna panel pakai
// `dark` (teks `#5A305A`) krn brightness keduanya (formula ITU-R BT.601 `0.299R+0.587G+
// 0.114B`) di atas ambang ~150 -- teks putih akan sulit terbaca. **Content di bawah header
// SELALU `bg-white` POLOS** (permintaan eksplisit user "konten tetap putih", TIDAK ikut tint
// warna header). `dark`/`color` prop TETAP fleksibel di komponen `PanelHeader` kalau diminta
// variasi/warna lain lagi ke depan.
function PanelHeader({ color, dark, children, right }: { color: string; dark?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 rounded-t-2xl flex items-center justify-between gap-2" style={{ backgroundColor: color }}>
      <h3 className={`font-bold text-sm ${dark ? 'text-[#5A305A]' : 'text-white'}`}>{children}</h3>
      {right}
    </div>
  );
}

// `embedded` (2026-09, dipakai `CostByVesselPage.tsx`) -- kalau true, `<header>` bawaan halaman
// ini (judul+ikon+Greeting) DISKIP -- halaman induk (`CostByVesselPage`) sudah py header+tab bar
// sendiri, dobel header kelihatan aneh. Sisanya (SEMUA logic/tampilan di bawah `<main>`) TIDAK
// berubah sama sekali.
export default function ReportingDashboardPage({ embedded }: { embedded?: boolean } = {}) {
  useEffect(() => { document.title = 'Reporting Dashboard · BeeHive'; }, []);
  const navigate = useNavigate();

  const today = new Date();
  // Mode periode diperluas Monthly/Yearly -> Monthly/Quarterly/Yearly (2026-09 "REVISI MENU
  // REPORTING" poin A2). Quarterly TIDAK multi-select (beda dari Cost per Vessel) -- 1 quarter
  // aktif via dropdown Q1-Q4 terpisah, `quarter` derive default dari bulan berjalan.
  const [periodMode, setPeriodMode] = useState<PeriodMode>('MONTHLY');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(quarterOfMonth(today.getMonth() + 1));
  // Dropdown filter method di header "Cost per Method" (2026-09) -- lihat `METHOD_FILTER_OPTIONS`.
  const [methodFilter, setMethodFilter] = useState<'ALL' | AllocationMethod>('ALL');

  const [masterVessels, setMasterVessels] = useState<MasterVessel[]>([]);
  const [yearRows, setYearRows] = useState<any[]>([]); // seluruh baris tahun `year` -- dipotong client-side utk MONTHLY/QUARTERLY
  const [prevRows, setPrevRows] = useState<any[]>([]); // periode sebelumnya (utk perbandingan) -- bisa beda tahun dari `year`
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMasterVessels().then(setMasterVessels); }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Sama fungsi (`fetchAllocationRows`) & tabel yg dipakai Cost per Vessel (Aturan Umum #1) --
    // Dashboard ambil 1 tahun penuh sekali fetch (dipotong per bulan/quarter di client), lebih
    // hemat drpd fetch berulang. Periode SEBELUMNYA (`prevRows`) fetch tahun yg relevan (bisa
    // tahun-1 kalau bulan/quarter aktif ada di awal tahun).
    const prevYear = periodMode === 'YEARLY' ? year - 1
      : periodMode === 'QUARTERLY' ? (quarter === 1 ? year - 1 : year)
      : (month === 1 ? year - 1 : year);
    Promise.all([
      fetchAllocationRows('YEARLY', year, month),
      fetchAllocationRows('YEARLY', prevYear, month),
    ]).then(([yr, pr]) => {
      if (!active) return;
      setYearRows(yr);
      setPrevRows(pr);
      setLoading(false);
    }).catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [year, month, quarter, periodMode]);

  const currentRows = useMemo(() => {
    if (periodMode === 'YEARLY') return yearRows;
    if (periodMode === 'QUARTERLY') {
      const months = [1, 2, 3].map(i => (quarter - 1) * 3 + i);
      return yearRows.filter(r => months.includes(Number(String(r.period_month).substring(5, 7))));
    }
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    return yearRows.filter(r => String(r.period_month).startsWith(monthStr));
  }, [yearRows, periodMode, year, month, quarter]);

  const previousRows = useMemo(() => {
    if (periodMode === 'YEARLY') return prevRows.filter(r => String(r.period_month).startsWith(String(year - 1)));
    if (periodMode === 'QUARTERLY') {
      const pq = quarter === 1 ? 4 : ((quarter - 1) as 1 | 2 | 3);
      const py = quarter === 1 ? year - 1 : year;
      const months = [1, 2, 3].map(i => (pq - 1) * 3 + i);
      return prevRows.filter(r => String(r.period_month).startsWith(String(py)) && months.includes(Number(String(r.period_month).substring(5, 7))));
    }
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    const monthStr = `${py}-${String(pm).padStart(2, '0')}`;
    return prevRows.filter(r => String(r.period_month).startsWith(monthStr));
  }, [prevRows, periodMode, year, month, quarter]);

  // Label pembanding dinamis mengikuti mode periode aktif (2026-09, poin A2):
  // Monthly -> "vs Aug 2026", Quarterly -> "vs Q2 2026", Yearly -> "vs 2025".
  const comparePeriodLabel = useMemo(() => {
    if (periodMode === 'YEARLY') return `vs ${year - 1}`;
    if (periodMode === 'QUARTERLY') {
      const pq = quarter === 1 ? 4 : quarter - 1;
      const py = quarter === 1 ? year - 1 : year;
      return `vs Q${pq} ${py}`;
    }
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    return `vs ${MONTH_NAMES_FULL[pm - 1].slice(0, 3)} ${py}`;
  }, [periodMode, year, month, quarter]);

  const masterById = useMemo(() => new Map(masterVessels.map(m => [m.vessel_id, m])), [masterVessels]);

  // `methodFilter` memfilter SEMUA bagian dashboard KECUALI panel "Cost per Method" itu sendiri
  // (yg tetap butuh breakdown semua method, lihat `perMethod` di bawah -- sengaja tetap pakai
  // `currentRows`/`previousRows`/`yearRows` MENTAH, bukan versi filtered ini).
  const filteredCurrentRows = useMemo(() => methodFilter === 'ALL' ? currentRows : currentRows.filter(r => r.method === methodFilter), [currentRows, methodFilter]);
  const filteredPreviousRows = useMemo(() => methodFilter === 'ALL' ? previousRows : previousRows.filter(r => r.method === methodFilter), [previousRows, methodFilter]);
  const filteredYearRows = useMemo(() => methodFilter === 'ALL' ? yearRows : yearRows.filter(r => r.method === methodFilter), [yearRows, methodFilter]);

  // ─── Kartu 1: ringkasan ──────────────────────────────────────────────
  const curSums = useMemo(() => { const s = zeroSums(); filteredCurrentRows.forEach(r => addSums(s, r)); return s; }, [filteredCurrentRows]);
  const prevSums = useMemo(() => { const s = zeroSums(); filteredPreviousRows.forEach(r => addSums(s, r)); return s; }, [filteredPreviousRows]);
  const curTotal = totalCost(curSums);
  const curTotalExclPpn = totalExclPpn(curSums);
  const prevTotal = totalCost(prevSums);
  const prevTotalExclPpn = totalExclPpn(prevSums);
  const curPpn = curSums.ppn_pph;
  const prevPpn = prevSums.ppn_pph;
  // Helper generik %-perubahan -- dipakai 3 kartu nominal (Total Cost/Excl PPN+PPH/Total
  // PPN+PPH). Highest Vessel Cost SENGAJA TIDAK pakai ini (poin A3: tidak perlu persentase).
  const pctOf = (cur: number, prev: number) => prev !== 0 ? ((cur - prev) / prev) * 100 : (cur !== 0 ? 100 : 0);
  const pctChange = pctOf(curTotal, prevTotal);
  const pctChangeExclPpn = pctOf(curTotalExclPpn, prevTotalExclPpn);
  const pctChangePpn = pctOf(curPpn, prevPpn);

  // ─── Kartu 2: biaya per method ───────────────────────────────────────
  const perMethod = useMemo(() => {
    const out: Record<AllocationMethod, number> = { COURIER: 0, SEA: 0, AIR: 0, BORONGAN: 0 };
    (['COURIER', 'SEA', 'AIR', 'BORONGAN'] as AllocationMethod[]).forEach(m => {
      const s = zeroSums();
      currentRows.filter(r => r.method === m).forEach(r => addSums(s, r));
      out[m] = metricForMethod(s, m);
    });
    return out;
  }, [currentRows]);

  // ─── Kartu 3: vessel biaya tertinggi ─────────────────────────────────
  // `key` (`v:<vessel_id>`/`u:<vessel_name_raw>`) SENGAJA sama persis format `VesselAgg.key`
  // di `ReportingCostPerVesselPage.tsx` -- dipakai param `?highlight=` (2026-09, permintaan
  // user: klik vessel di chart ini harus scroll+blink ke baris yg sama di Cost per Vessel).
  const topVessels = useMemo(() => {
    const map = new Map<string, { name: string; sums: Record<MetricKey, number> }>();
    filteredCurrentRows.forEach(r => {
      const key = r.vessel_id ? `v:${r.vessel_id}` : `u:${r.vessel_name_raw}`;
      const name = r.vessel_id ? (masterById.get(r.vessel_id)?.vessel_name || r.vessel_name_raw) : `${r.vessel_name_raw} (needs review)`;
      if (!map.has(key)) map.set(key, { name, sums: zeroSums() });
      addSums(map.get(key)!.sums, r);
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, name: v.name, total: totalCost(v.sums) })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [filteredCurrentRows, masterById]);

  // ─── Kartu 4: biaya per jenis biaya ──────────────────────────────────
  const perJenisBiaya: { label: string; value: number }[] = [
    { label: 'Courier Adm', value: curSums.courier_adm },
    { label: 'Duty', value: curSums.duty },
    { label: 'Freight', value: curSums.freight },
    { label: 'Handling Total', value: curSums.handling_total },
    { label: 'BM', value: curSums.bm },
    { label: 'PPN+PPH', value: curSums.ppn_pph },
    { label: 'All-In Import', value: curSums.borongan_total },
  ].filter(x => x.value > 0);

  // ─── Kartu 5: biaya per fleet_group ───────────────────────────────────
  const perFleetGroup = useMemo(() => {
    const map = new Map<string, number>();
    filteredCurrentRows.forEach(r => {
      const fg = r.vessel_id ? (masterById.get(r.vessel_id)?.fleet_group || 'NEEDS REVIEW') : 'NEEDS REVIEW';
      map.set(fg, (map.get(fg) || 0) + totalCost({ courier_adm: r.courier_adm, duty: r.duty, freight: r.freight, handling_total: r.handling_total, bm: r.bm, ppn_pph: r.ppn_pph, borongan_total: r.borongan_total }));
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filteredCurrentRows, masterById]);

  // ─── Kartu 6: tren bulanan (selalu 1 tahun penuh, terlepas dari periodMode) ──
  const monthlyTrend = useMemo(() => {
    const arr = Array.from({ length: 12 }).map(() => zeroSums());
    filteredYearRows.forEach(r => {
      const mn = Number(String(r.period_month).substring(5, 7));
      if (mn >= 1 && mn <= 12) addSums(arr[mn - 1], r);
    });
    return arr.map(s => totalCost(s));
  }, [filteredYearRows]);

  // Halaman gabungan "Cost by Vessel" (2026-09) -- Dashboard & Cost per Vessel SEKARANG 1 route
  // (`/reporting/cost-by-vessel`) 2 tab, BUKAN lagi 2 route terpisah. Navigasi internal ke tab
  // "Cost per Vessel" WAJIB sisip `view=cost_per_vessel` (dibaca `CostByVesselPage.tsx` utk
  // pindah tab) -- param lama (mode/year/month/tab/highlight) TETAP dikirim apa adanya, dibaca
  // `ReportingCostPerVesselPage.tsx` sendiri via `useSearchParams()` (URL yg sama).
  const COST_PER_VESSEL_PATH = '/reporting/cost-by-vessel';
  // Method aktif dipakai sbg param `tab` saat navigasi ke Cost per Vessel dari kartu/chart yg
  // ikut ter-filter (2026-09) -- konsisten dgn apa yg lagi ditampilkan dashboard saat diklik.
  const filterQuery = (tab: string) => `?view=cost_per_vessel&mode=${periodMode}&year=${year}&month=${month}&tab=${tab}`;
  const filteredTabParam = methodFilter;
  // Sama dgn `filterQuery`, tapi nyisipin `&highlight=<vesselKey>` -- Cost per Vessel baca param
  // ini utk scroll+blink otomatis ke baris vessel yg diklik dari chart Dashboard (2026-09).
  const vesselFilterQuery = (tab: string, vesselKey: string) => `${filterQuery(tab)}&highlight=${encodeURIComponent(vesselKey)}`;

  // Tombol lompat atas/bawah melayang (2026-09, permintaan user) -- `pageScrollRef` nunjuk ke
  // div `overflow-y-auto` yg BENERAN scroll halaman ini (halaman ini TETAP scroll penuh, beda
  // dari Cost per Vessel yg dikonversi ke shell "tinggi tetap" -- di sini tidak diminta lock
  // header/footer, cuma tombol lompatnya saja). Scrollbar-nya sendiri sudah default disembunyikan
  // di seluruh app (`src/index.css`), tombol ini gantinya.
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const el = pageScrollRef.current;
    if (!el) return;
    const check = () => {
      setAtTop(el.scrollTop <= 4);
      setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
    // `methodFilter`/`periodMode`/`year`/`month` ikut jadi dependency -- konten (jumlah baris
    // chart dst) bisa berubah tinggi tanpa event scroll/resize asli terpicu, effect ini WAJIB
    // jalan ulang biar `atTop`/`atBottom` tidak basi setelah ganti filter.
  }, [loading, methodFilter, periodMode, year, month, quarter]);

  return (
    <div ref={pageScrollRef} className="flex-1 h-full overflow-y-auto min-w-0 pb-10 relative">
      {!embedded && (
        <header className="px-3 pt-1 pb-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
                <LayoutDashboard size={17} />
              </div>
              <div>
                <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Reporting Dashboard</h1>
                <p className="text-[#5A305A] font-light text-sm mt-1">Cost summary per vessel — Courier, Sea, Air, FAR Overseas</p>
              </div>
            </div>
            <Greeting />
          </div>
        </header>
      )}

      <main className="px-3 pt-2 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            {/* Warna tematik per dropdown (2026-09, permintaan user, pola sama "Warna toolbar per
                tombol" di `ReportingCostPerVesselPage.tsx`) -- 3 dropdown periode (Monthly/Yearly,
                bulan, tahun) dikelompokkan 1 warna ungu `#73507B` (soal "kapan"), dropdown method
                dikasih warna coral `#F58C77` TERPISAH supaya kelihatan beda fungsi & sengaja
                disamakan dgn warna header panel "Cost per Method" yg jadi sumber `METHOD_LABEL`-nya
                -- asosiasi visual "warna ini = filter method". */}
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as PeriodMode)} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            {periodMode === 'MONTHLY' && (
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            )}
            {periodMode === 'QUARTERLY' && (
              <select value={quarter} onChange={e => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
            )}
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
              {Array.from({ length: 6 }).map((_, i) => { const y = today.getFullYear() - 3 + i; return <option key={y} value={y}>{y}</option>; })}
            </select>
            {/* Dropdown filter method -- 2026-09, DIPINDAH dari header panel "Cost per Method"
                ke sini (permintaan susulan user "di sebelah tahun") supaya sejajar dgn filter
                periode lain, lebih gampang ditemukan drpd nyempil di header panel. Tetap
                memfilter bagian LAIN dashboard (lihat komentar `METHOD_FILTER_OPTIONS`), TIDAK
                memfilter panel "Cost per Method" itu sendiri. */}
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value as 'ALL' | AllocationMethod)}
              className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#F58C77]/10 text-[#F58C77] border border-[#F58C77]/40">
              {METHOD_FILTER_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#5A305A]">Loading data...</div>
        ) : (
          <div className="space-y-4">
            {/* Baris 1: 4 kartu ringkasan (2026-09 "REVISI MENU REPORTING" poin A2 -- urutan
                BARU: Total Cost | Highest Vessel Cost | Total Cost Excl. PPN+PPH | Total PPN+PPH.
                Kartu "Total PPN+PPH" BARU. 3 kartu nominal (Total Cost/Excl PPN+PPH/Total
                PPN+PPH) tampilkan %, "Highest Vessel Cost" TIDAK. Teks pembanding dinamis
                mengikuti mode periode aktif (`comparePeriodLabel`) -- Monthly "vs Aug 2026",
                Quarterly "vs Q2 2026", Yearly "vs 2025". Kartu "Previous Period" LAMA DIHAPUS
                (posisinya digantikan "Total PPN+PPH"), nominal periode sebelumnya sekarang murni
                bahan hitung %, tidak perlu kartu sendiri lagi. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Link to={`${COST_PER_VESSEL_PATH}${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#DCC9E0" dark>Total Cost</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curTotal)}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${pctChange >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {pctChange >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {Math.abs(pctChange).toFixed(1)}% {comparePeriodLabel}
                  </div>
                </div>
              </Link>
              <Link to={topVessels.length > 0 ? `${COST_PER_VESSEL_PATH}${vesselFilterQuery(filteredTabParam, topVessels[0].key)}` : `${COST_PER_VESSEL_PATH}${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#DCC9E0" dark>Highest Vessel Cost</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  {topVessels.length === 0 ? (
                    <p className="text-sm text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-[#5A305A] flex items-center gap-1.5 break-words"><Ship size={15} className="shrink-0" /> {topVessels[0].name}</p>
                      <p className="text-2xl font-bold text-[#5A305A] mt-1">{fmtRp(topVessels[0].total)}</p>
                    </>
                  )}
                </div>
              </Link>
              <Link to={`${COST_PER_VESSEL_PATH}${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#DCC9E0" dark>Total Cost Excl. PPN+PPH</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curTotalExclPpn)}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${pctChangeExclPpn >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {pctChangeExclPpn >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {Math.abs(pctChangeExclPpn).toFixed(1)}% {comparePeriodLabel}
                  </div>
                </div>
              </Link>
              <Link to={`${COST_PER_VESSEL_PATH}${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#DCC9E0" dark>Total PPN+PPH</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curPpn)}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${pctChangePpn >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {pctChangePpn >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {Math.abs(pctChangePpn).toFixed(1)}% {comparePeriodLabel}
                  </div>
                </div>
              </Link>
            </div>

            {/* Baris 2: "Cost per Method" (donut, kiri) + "Vessels with Highest Cost" (bar,
                kanan) -- 1 baris berdampingan (2026-09 "REVISI MENU REPORTING" poin A3, GANTI
                TOTAL dari layout lama: dulu Cost per Method full-width kartu kecil per method,
                lalu Vessels with Highest Cost full-width baris sendiri di bawahnya). Cost per
                Method TETAP tidak terfilter dropdown method (`perMethod` dihitung dari
                `currentRows` mentah, breakdown semua method harus tetap kelihatan semua). Klik
                bar Vessels -> Cost per Vessel scroll+blink ke baris vessel itu (sudah ada
                sebelumnya, TIDAK diubah). */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Cost per Method</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  {(['COURIER', 'SEA', 'AIR', 'BORONGAN'] as AllocationMethod[]).every(m => perMethod[m] === 0) ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <DonutChart
                      data={(['COURIER', 'SEA', 'AIR', 'BORONGAN'] as AllocationMethod[]).map(m => ({ label: METHOD_LABEL[m], value: perMethod[m], color: METHOD_COLOR[m] }))}
                      formatValue={fmtRp}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Vessels with Highest Cost</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  {topVessels.length === 0 ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <HorizontalBarChart
                      data={topVessels.map(v => ({ label: v.name, value: v.total }))}
                      color="#5A305A" formatValue={fmtRp}
                      onBarClick={(i) => navigate(`${COST_PER_VESSEL_PATH}${vesselFilterQuery(filteredTabParam, topVessels[i].key)}`)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Baris 4: Cost by Category (kiri) + Cost per Fleet Group (kanan), setengah lebar
                masing2 -- 2026-09, posisi "Cost per Fleet Group" ditukar dgn "Vessels with
                Highest Cost" (dulu di sini, sekarang pindah jadi baris sendiri di atas). */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Cost by Category</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  {perJenisBiaya.length === 0 ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <HorizontalBarChart data={perJenisBiaya} color="#D97706" formatValue={fmtRp} />
                  )}
                </div>
              </div>

              <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Cost per Fleet Group</PanelHeader>
                <div className="p-4 flex-1 bg-white">
                  {perFleetGroup.length === 0 ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <HorizontalBarChart data={perFleetGroup} color="#0284C7" formatValue={fmtRp} />
                  )}
                </div>
              </div>
            </div>

            {/* Baris 5: Monthly trend */}
            <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
              <PanelHeader color="#FFF5C5" dark>Monthly Trend ({year})</PanelHeader>
              <div className="p-4 flex-1 bg-white">
                <VerticalBarChart
                  data={monthlyTrend.map((v, i) => ({ label: MONTH_NAMES[i], value: v }))}
                  color="#5A305A" formatValue={fmtRp}
                  onBarClick={(i) => navigate(`${COST_PER_VESSEL_PATH}?view=cost_per_vessel&mode=MONTHLY&year=${year}&month=${i + 1}&tab=${filteredTabParam}`)}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Diperkecil + digeser rapat ke pojok kanan-bawah LAYAR (2026-09, samakan dgn susulan
          fix di `ReportingCostPerVesselPage.tsx`: dulu `w-10 h-10`/ikon `18`/`right-6` kegedean
          & agak menjorok ke dalam dari tepi layar) -- `w-8 h-8`/ikon `14`/`right-1`. */}
      {!atTop && (
        <button onClick={() => pageScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Jump to top" aria-label="Jump to top"
          className="fixed bottom-14 right-1 z-30 w-8 h-8 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white shadow-lg flex items-center justify-center transition-all">
          <ArrowUp size={14} />
        </button>
      )}
      {!atBottom && (
        <button onClick={() => pageScrollRef.current?.scrollTo({ top: pageScrollRef.current.scrollHeight, behavior: 'smooth' })}
          title="Jump to bottom" aria-label="Jump to bottom"
          className="fixed bottom-3 right-1 z-30 w-8 h-8 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white shadow-lg flex items-center justify-center transition-all">
          <ArrowDown size={14} />
        </button>
      )}
    </div>
  );
}
