import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Ship, TrendingUp, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import Greeting from '../components/Greeting';
import {
  fetchMasterVessels, fetchAllocationRows, MasterVessel,
  MetricKey, zeroSums, totalCost, totalExclPpn, metricForMethod, addSums, AllocationMethod,
} from '../utils/ReportingHelpers';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// "Chartered" -> "All-In Import" (2026-09, permintaan user -- samakan penamaan dgn label tab
// BORONGAN di Cost per Vessel). Value internal `AllocationMethod` TETAP `'BORONGAN'`.
const METHOD_LABEL: Record<AllocationMethod, string> = { COURIER: 'Courier', SEA: 'Sea', AIR: 'Air', BORONGAN: 'All-In Import' };
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
  { id: 'BORONGAN', label: 'All-In Import' },
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

// Header berwarna per panel (2026-09, permintaan user -- dulu SEMUA panel flat putih polos).
// Palet dari brand: ungu tua `#5A305A`/ungu medium `#73507B` (teks putih, kontras cukup) +
// kuning pastel `#FFF5C5` (teks TETAP `#5A305A`, background-nya terlalu terang utk teks putih).
// Warna coral `#F58C77` dari gradient header aplikasi (`src/index.css`?) juga dipakai teks putih.
function PanelHeader({ color, dark, children, right }: { color: string; dark?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 rounded-t-2xl flex items-center justify-between gap-2" style={{ backgroundColor: color }}>
      <h3 className={`font-bold text-sm ${dark ? 'text-[#5A305A]' : 'text-white'}`}>{children}</h3>
      {right}
    </div>
  );
}

export default function ReportingDashboardPage() {
  useEffect(() => { document.title = 'Reporting Dashboard · BeeHive'; }, []);
  const navigate = useNavigate();

  const today = new Date();
  const [periodMode, setPeriodMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  // Dropdown filter method di header "Cost per Method" (2026-09) -- lihat `METHOD_FILTER_OPTIONS`.
  const [methodFilter, setMethodFilter] = useState<'ALL' | AllocationMethod>('ALL');

  const [masterVessels, setMasterVessels] = useState<MasterVessel[]>([]);
  const [yearRows, setYearRows] = useState<any[]>([]); // seluruh baris tahun `year` -- dipotong client-side utk MONTHLY
  const [prevRows, setPrevRows] = useState<any[]>([]); // periode sebelumnya (utk perbandingan)
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMasterVessels().then(setMasterVessels); }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Sama fungsi (`fetchAllocationRows`) & tabel yg dipakai Cost per Vessel (Aturan Umum #1) --
    // Dashboard ambil 1 tahun penuh sekali fetch (dipotong per bulan di client utk kartu/mode
    // MONTHLY + dipakai langsung utk chart "Tren Bulanan"), lebih hemat drpd fetch berulang.
    Promise.all([
      fetchAllocationRows('YEARLY', year, month),
      periodMode === 'MONTHLY'
        ? fetchAllocationRows('YEARLY', month === 1 ? year - 1 : year, month) // ambil tahun yg mencakup bulan sebelumnya
        : fetchAllocationRows('YEARLY', year - 1, month),
    ]).then(([yr, pr]) => {
      if (!active) return;
      setYearRows(yr);
      setPrevRows(pr);
      setLoading(false);
    }).catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [year, month, periodMode]);

  const currentRows = useMemo(() => {
    if (periodMode === 'YEARLY') return yearRows;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    return yearRows.filter(r => String(r.period_month).startsWith(monthStr));
  }, [yearRows, periodMode, year, month]);

  const previousRows = useMemo(() => {
    if (periodMode === 'YEARLY') return prevRows.filter(r => String(r.period_month).startsWith(String(year - 1)));
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    const monthStr = `${py}-${String(pm).padStart(2, '0')}`;
    return prevRows.filter(r => String(r.period_month).startsWith(monthStr));
  }, [prevRows, periodMode, year, month]);

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
  const pctChange = prevTotal !== 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : (curTotal !== 0 ? 100 : 0);

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

  // Method aktif dipakai sbg param `tab` saat navigasi ke Cost per Vessel dari kartu/chart yg
  // ikut ter-filter (2026-09) -- konsisten dgn apa yg lagi ditampilkan dashboard saat diklik.
  const filterQuery = (tab: string) => `?mode=${periodMode}&year=${year}&month=${month}&tab=${tab}`;
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
  }, [loading, methodFilter, periodMode, year, month]);

  return (
    <div ref={pageScrollRef} className="flex-1 h-full overflow-y-auto min-w-0 pb-10 relative">
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

      <main className="px-3 pt-2 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            {/* Warna tematik per dropdown (2026-09, permintaan user, pola sama "Warna toolbar per
                tombol" di `ReportingCostPerVesselPage.tsx`) -- 3 dropdown periode (Monthly/Yearly,
                bulan, tahun) dikelompokkan 1 warna ungu `#73507B` (soal "kapan"), dropdown method
                dikasih warna coral `#F58C77` TERPISAH supaya kelihatan beda fungsi & sengaja
                disamakan dgn warna header panel "Cost per Method" yg jadi sumber `METHOD_LABEL`-nya
                -- asosiasi visual "warna ini = filter method". */}
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as any)} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            {periodMode === 'MONTHLY' && (
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="rounded-lg px-2 py-1.5 text-xs font-bold bg-[#73507B]/10 text-[#73507B] border border-[#73507B]/30">
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
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
            {/* Baris 1: 4 kartu ringkasan (Total Cost | Total Cost Exclude PPN+PPH | Highest
                Vessel Cost | Previous Period) -- 2026-09, kartu "Total Cost Exclude PPN+PPH"
                BARU disisipkan tepat di samping "Total Cost" (permintaan user eksplisit).
                Kartu kedua (lama) GANTI TOTAL dari "jumlah vessel" jadi nama + nominal vessel
                BIAYA TERTINGGI periode ini (`topVessels[0]`, array yg sama dgn chart section
                "Vessels with Highest Cost" di bawah -- SATU sumber data, JANGAN hitung ulang
                terpisah). Semua 4 kartu ikut ter-filter `methodFilter` (lihat dropdown di panel
                "Cost per Method" di bawah) krn `curTotal`/`curTotalExclPpn`/`prevTotal`/
                `topVessels` sumbernya sudah `filteredCurrentRows`/`filteredPreviousRows`. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Link to={`/reporting/cost-per-vessel${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#5A305A">Total Cost</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#5A305A0D' }}>
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curTotal)}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${pctChange >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {pctChange >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {Math.abs(pctChange).toFixed(1)}% vs previous period
                  </div>
                </div>
              </Link>
              <Link to={`/reporting/cost-per-vessel${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#D97706">Total Cost Exclude PPN+PPH</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#D977060D' }}>
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curTotalExclPpn)}</p>
                </div>
              </Link>
              <Link to={topVessels.length > 0 ? `/reporting/cost-per-vessel${vesselFilterQuery(filteredTabParam, topVessels[0].key)}` : `/reporting/cost-per-vessel${filterQuery(filteredTabParam)}`} className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:border-[#5A305A] transition-all">
                <PanelHeader color="#73507B">Highest Vessel Cost</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#73507B0D' }}>
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
              <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Previous Period</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#FFF5C580' }}>
                  <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(prevTotal)}</p>
                </div>
              </div>
            </div>

            {/* Baris 2: Cost per Method -- dropdown filter method dipindah ke panel filter
                periode di atas (2026-09, permintaan susulan user "di sebelah tahun"). Panel ini
                TIDAK ikut terfilter dropdown itu (`perMethod` sengaja tetap dihitung dari
                `currentRows` mentah, breakdown semua method harus tetap kelihatan semua). */}
            <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <PanelHeader color="#F58C77">Cost per Method</PanelHeader>
              <div className="p-4 flex-1" style={{ backgroundColor: '#F58C770D' }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(['COURIER', 'SEA', 'AIR', 'BORONGAN'] as AllocationMethod[]).map(m => (
                    <Link key={m} to={`/reporting/cost-per-vessel${filterQuery(m)}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-[#5A305A] transition-all">
                      <p className="text-[11px] font-bold uppercase mb-1" style={{ color: METHOD_COLOR[m] }}>{METHOD_LABEL[m]}</p>
                      <p className="text-sm font-bold text-[#5A305A]">{fmtRp(perMethod[m])}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Baris 3: Vessels with Highest Cost -- MELEBAR PENUH, baris sendiri (2026-09,
                permintaan user, dulu setengah lebar bersebelahan dgn "Cost by Category"). Klik
                bar -> Cost per Vessel scroll+blink ke baris vessel itu (2026-09, permintaan
                user: "harusnya baris vesselnya langsung mengarah ke situ + efek kedap kedip"). */}
            <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <PanelHeader color="#5A305A">Vessels with Highest Cost</PanelHeader>
              <div className="p-4 flex-1" style={{ backgroundColor: '#5A305A0D' }}>
                {topVessels.length === 0 ? (
                  <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                ) : (
                  <HorizontalBarChart
                    data={topVessels.map(v => ({ label: v.name, value: v.total }))}
                    color="#5A305A" formatValue={fmtRp}
                    onBarClick={(i) => navigate(`/reporting/cost-per-vessel${vesselFilterQuery(filteredTabParam, topVessels[i].key)}`)}
                  />
                )}
              </div>
            </div>

            {/* Baris 4: Cost by Category (kiri) + Cost per Fleet Group (kanan), setengah lebar
                masing2 -- 2026-09, posisi "Cost per Fleet Group" ditukar dgn "Vessels with
                Highest Cost" (dulu di sini, sekarang pindah jadi baris sendiri di atas). */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader color="#73507B">Cost by Category</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#73507B0D' }}>
                  {perJenisBiaya.length === 0 ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <HorizontalBarChart data={perJenisBiaya} color="#D97706" formatValue={fmtRp} />
                  )}
                </div>
              </div>

              <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <PanelHeader color="#FFF5C5" dark>Cost per Fleet Group</PanelHeader>
                <div className="p-4 flex-1" style={{ backgroundColor: '#FFF5C580' }}>
                  {perFleetGroup.length === 0 ? (
                    <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                  ) : (
                    <HorizontalBarChart data={perFleetGroup} color="#0284C7" formatValue={fmtRp} />
                  )}
                </div>
              </div>
            </div>

            {/* Baris 5: Monthly trend */}
            <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <PanelHeader color="#F58C77">Monthly Trend ({year})</PanelHeader>
              <div className="p-4 flex-1" style={{ backgroundColor: '#F58C770D' }}>
                <VerticalBarChart
                  data={monthlyTrend.map((v, i) => ({ label: MONTH_NAMES[i], value: v }))}
                  color="#5A305A" formatValue={fmtRp}
                  onBarClick={(i) => navigate(`/reporting/cost-per-vessel?mode=MONTHLY&year=${year}&month=${i + 1}&tab=${filteredTabParam}`)}
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
