import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Ship, TrendingUp, TrendingDown } from 'lucide-react';
import Greeting from '../components/Greeting';
import {
  fetchMasterVessels, fetchAllocationRows, MasterVessel,
  MetricKey, zeroSums, totalCost, metricForMethod, addSums, AllocationMethod,
} from '../utils/ReportingHelpers';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const METHOD_LABEL: Record<AllocationMethod, string> = { COURIER: 'Courier', SEA: 'Sea', AIR: 'Air', BORONGAN: 'Chartered' };
const METHOD_COLOR: Record<AllocationMethod, string> = { COURIER: '#5A305A', SEA: '#2563EB', AIR: '#0EA5E9', BORONGAN: '#D97706' };

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

function VerticalBarChart({ data, color, formatValue, onBarClick }: {
  data: { label: string; value: number }[]; color: string; formatValue: (n: number) => string;
  onBarClick?: (index: number) => void;
}) {
  const chartW = 720;
  const chartH = 220;
  const padBottom = 26;
  const padTop = 10;
  const plotH = chartH - padBottom - padTop;
  const max = Math.max(1, ...data.map(d => d.value));
  const barGap = 6;
  const barW = (chartW / data.length) - barGap;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  // `preserveAspectRatio="none"` (2026-09, laporan user "panel Monthly Trend kelihatan bolong
  // kanan") -- default SVG `xMinYMin meet` PERTAHANKAN rasio viewBox (720:220) di dalam
  // container yg CSS-nya `w-full` (lebar penuh kartu, ratusan px) tapi TINGGI TETAP (`chartH`
  // px pas) -- krn tinggi sudah pas-pasan (scale=1), "meet" TIDAK ikut meregangkan lebar,
  // sisa ruang kanan kosong. `none` paksa stretch penuh kedua sumbu (aman utk bar chart --
  // semua koordinat bar/gridline berbasis proporsi `chartW`/`chartH`, stretch uniform tidak
  // mendistorsi tampilan bar).
  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ height: chartH }} preserveAspectRatio="none">
      {gridLines.map(g => {
        const y = padTop + plotH - g * plotH;
        return <line key={g} x1={0} x2={chartW} y1={y} y2={y} stroke="#E2E8F0" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '3,3'} />;
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH;
        const x = i * (barW + barGap) + barGap / 2;
        const y = padTop + plotH - h;
        return (
          <g key={d.label} className={onBarClick ? 'cursor-pointer' : ''} onClick={() => onBarClick?.(i)}>
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            <rect x={x} y={y} width={barW} height={Math.max(1, h)} rx={4} fill={color} opacity={d.value > 0 ? 1 : 0.15} className="transition-all" />
            <text x={x + barW / 2} y={chartH - 10} fontSize="10" fill="#5A305A" textAnchor="middle" fontWeight="bold">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReportingDashboardPage() {
  useEffect(() => { document.title = 'Reporting Dashboard · BeeHive'; }, []);
  const navigate = useNavigate();

  const today = new Date();
  const [periodMode, setPeriodMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

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

  // ─── Kartu 1: ringkasan ──────────────────────────────────────────────
  const curSums = useMemo(() => { const s = zeroSums(); currentRows.forEach(r => addSums(s, r)); return s; }, [currentRows]);
  const prevSums = useMemo(() => { const s = zeroSums(); previousRows.forEach(r => addSums(s, r)); return s; }, [previousRows]);
  const curTotal = totalCost(curSums);
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
  const topVessels = useMemo(() => {
    const map = new Map<string, { name: string; sums: Record<MetricKey, number> }>();
    currentRows.forEach(r => {
      const key = r.vessel_id ? `v:${r.vessel_id}` : `u:${r.vessel_name_raw}`;
      const name = r.vessel_id ? (masterById.get(r.vessel_id)?.vessel_name || r.vessel_name_raw) : `${r.vessel_name_raw} (needs review)`;
      if (!map.has(key)) map.set(key, { name, sums: zeroSums() });
      addSums(map.get(key)!.sums, r);
    });
    return Array.from(map.values()).map(v => ({ name: v.name, total: totalCost(v.sums) })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [currentRows, masterById]);

  // ─── Kartu 4: biaya per jenis biaya ──────────────────────────────────
  const perJenisBiaya: { label: string; value: number }[] = [
    { label: 'Courier Adm', value: curSums.courier_adm },
    { label: 'Duty', value: curSums.duty },
    { label: 'Freight', value: curSums.freight },
    { label: 'Handling Total', value: curSums.handling_total },
    { label: 'BM', value: curSums.bm },
    { label: 'PPN+PPH', value: curSums.ppn_pph },
    { label: 'Chartered', value: curSums.borongan_total },
  ].filter(x => x.value > 0);

  // ─── Kartu 5: biaya per fleet_group ───────────────────────────────────
  const perFleetGroup = useMemo(() => {
    const map = new Map<string, number>();
    currentRows.forEach(r => {
      const fg = r.vessel_id ? (masterById.get(r.vessel_id)?.fleet_group || 'NEEDS REVIEW') : 'NEEDS REVIEW';
      map.set(fg, (map.get(fg) || 0) + totalCost({ courier_adm: r.courier_adm, duty: r.duty, freight: r.freight, handling_total: r.handling_total, bm: r.bm, ppn_pph: r.ppn_pph, borongan_total: r.borongan_total }));
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [currentRows, masterById]);

  // ─── Kartu 6: tren bulanan (selalu 1 tahun penuh, terlepas dari periodMode) ──
  const monthlyTrend = useMemo(() => {
    const arr = Array.from({ length: 12 }).map(() => zeroSums());
    yearRows.forEach(r => {
      const mn = Number(String(r.period_month).substring(5, 7));
      if (mn >= 1 && mn <= 12) addSums(arr[mn - 1], r);
    });
    return arr.map(s => totalCost(s));
  }, [yearRows]);

  const filterQuery = (tab: string) => `?mode=${periodMode}&year=${year}&month=${month}&tab=${tab}`;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <LayoutDashboard size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Reporting Dashboard</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Cost summary per vessel — Courier, Sea, Air, Chartered</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 pt-2 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3">
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as any)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            {periodMode === 'MONTHLY' && (
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            )}
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-[#5A305A]">
              {Array.from({ length: 6 }).map((_, i) => { const y = today.getFullYear() - 3 + i; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#5A305A]">Loading data...</div>
        ) : (
          <div className="space-y-4">
            {/* Baris 1: 3 kartu ringkasan (Total Cost | Highest Vessel Cost | Previous Period) --
                2026-09, permintaan user: kartu kedua GANTI TOTAL dari "jumlah vessel" jadi nama +
                nominal vessel BIAYA TERTINGGI periode ini (`topVessels[0]`, array yg sama dgn
                chart section "Vessels with Highest Cost" di bawah -- SATU sumber data, JANGAN
                hitung ulang terpisah). */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Link to={`/reporting/cost-per-vessel${filterQuery('ALL')}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:border-[#5A305A] transition-all">
                <p className="text-xs text-[#5A305A]/70 font-medium mb-1">Total Cost</p>
                <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(curTotal)}</p>
                <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${pctChange >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {pctChange >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {Math.abs(pctChange).toFixed(1)}% vs previous period
                </div>
              </Link>
              <Link to={`/reporting/cost-per-vessel${filterQuery('ALL')}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:border-[#5A305A] transition-all">
                <p className="text-xs text-[#5A305A]/70 font-medium mb-1">Highest Vessel Cost</p>
                {topVessels.length === 0 ? (
                  <p className="text-sm text-[#5A305A]/60 italic mt-1">No data yet.</p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-[#5A305A] flex items-center gap-1.5 break-words"><Ship size={15} className="shrink-0" /> {topVessels[0].name}</p>
                    <p className="text-2xl font-bold text-[#5A305A] mt-1">{fmtRp(topVessels[0].total)}</p>
                  </>
                )}
              </Link>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <p className="text-xs text-[#5A305A]/70 font-medium mb-1">Previous Period</p>
                <p className="text-2xl font-bold text-[#5A305A]">{fmtRp(prevTotal)}</p>
              </div>
            </div>

            {/* Baris 2: Cost per Method */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-bold text-[#5A305A] text-sm mb-3">Cost per Method</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['COURIER', 'SEA', 'AIR', 'BORONGAN'] as AllocationMethod[]).map(m => (
                  <Link key={m} to={`/reporting/cost-per-vessel${filterQuery(m)}`} className="rounded-xl border border-slate-200 p-3 hover:border-[#5A305A] transition-all">
                    <p className="text-[11px] font-bold uppercase mb-1" style={{ color: METHOD_COLOR[m] }}>{METHOD_LABEL[m]}</p>
                    <p className="text-sm font-bold text-[#5A305A]">{fmtRp(perMethod[m])}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Baris 3: Vessels with Highest Cost -- MELEBAR PENUH, baris sendiri (2026-09,
                permintaan user, dulu setengah lebar bersebelahan dgn "Cost by Category"). */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-bold text-[#5A305A] text-sm mb-3">Vessels with Highest Cost</h3>
              {topVessels.length === 0 ? (
                <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
              ) : (
                <HorizontalBarChart
                  data={topVessels.map(v => ({ label: v.name, value: v.total }))}
                  color="#5A305A" formatValue={fmtRp}
                  onBarClick={() => navigate(`/reporting/cost-per-vessel${filterQuery('ALL')}`)}
                />
              )}
            </div>

            {/* Baris 4: Cost by Category (kiri) + Cost per Fleet Group (kanan), setengah lebar
                masing2 -- 2026-09, posisi "Cost per Fleet Group" ditukar dgn "Vessels with
                Highest Cost" (dulu di sini, sekarang pindah jadi baris sendiri di atas). */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <h3 className="font-bold text-[#5A305A] text-sm mb-3">Cost by Category</h3>
                {perJenisBiaya.length === 0 ? (
                  <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                ) : (
                  <HorizontalBarChart data={perJenisBiaya} color="#D97706" formatValue={fmtRp} />
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                <h3 className="font-bold text-[#5A305A] text-sm mb-3">Cost per Fleet Group</h3>
                {perFleetGroup.length === 0 ? (
                  <p className="text-xs text-[#5A305A]/60 italic">No data yet.</p>
                ) : (
                  <HorizontalBarChart data={perFleetGroup} color="#0284C7" formatValue={fmtRp} />
                )}
              </div>
            </div>

            {/* Baris 5: Monthly trend */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-bold text-[#5A305A] text-sm mb-3">Monthly Trend ({year})</h3>
              <VerticalBarChart
                data={monthlyTrend.map((v, i) => ({ label: MONTH_NAMES[i], value: v }))}
                color="#5A305A" formatValue={fmtRp}
                onBarClick={(i) => navigate(`/reporting/cost-per-vessel?mode=MONTHLY&year=${year}&month=${i + 1}&tab=ALL`)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
