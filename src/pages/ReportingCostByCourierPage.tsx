import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Download, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import Greeting from '../components/Greeting';
import ExcelJS from 'exceljs';
import {
  CourierRow, PeriodMode, fetchCourierRows, fetchDistinctAn, fetchDistinctPpjk,
  stripAwbCarrier, distinctAwbCount, distinctPoCount, distinctWeightTotal, distinctWeightMap,
  zeroCourierSums, addCourierSums, exclPpnPph, CourierSums, WEIGHT_RANGES, weightRangeLabel,
  periodRange, previousPeriod, periodLabel, buildPeriodSeries, fmtIdr, fmtIdrSigned, pctOf,
  quarterOfMonth, MONTH_ABBR,
} from '../utils/ReportingCourierHelpers';

// "Overseas Cost by Courier" (2026-09) -- halaman BARU di bawah menu Reporting, sumber data
// Invoice Recap Courier (`rekapan_courier`), TERPISAH TOTAL dari modul "Overseas Cost by
// Vessel" (beda tabel sumber & semantik). Lihat `ReportingCourierHelpers.ts` utk SATU-SATUNYA
// tempat logic fetch/agregasi. Style mengikuti tema aplikasi (kartu putih rounded-2xl,
// shadow-sm) dgn aksen warna coral/peach mengikuti acuan tampilan yang dilampirkan user.

const ACCENT = '#F58C77'; // coral -- aksen ikon/header, konsisten dgn acuan tampilan terlampir

// ─── Dropdown multi-select generik (portal ke body, pola sama ReportingCostPerVesselPage.tsx) ──
function MultiSelect({ label, options, selected, onChange, allLabel = 'All' }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void; allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, minWidth: Math.max(r.width, 190) });
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

  const toggle = (v: string) => { const next = new Set(selected); if (next.has(v)) next.delete(v); else next.add(v); onChange(next); };
  const summary = selected.size === 0 ? allLabel : selected.size === 1 ? Array.from(selected)[0] : `${selected.size} selected`;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)}
        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5A305A] bg-white flex items-center gap-1.5 whitespace-nowrap">
        {label}: {summary} <ChevronDown size={12} />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className="z-[999] bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-72 overflow-y-auto">
          <div className="flex gap-3 mb-1.5 pb-1.5 border-b border-slate-100">
            <button onClick={() => onChange(new Set(options))} className="text-[10px] font-bold text-[#5A305A] hover:underline">All</button>
            <button onClick={() => onChange(new Set())} className="text-[10px] font-bold text-[#5A305A] hover:underline">Clear</button>
          </div>
          {options.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic px-1 py-1">No options.</p>
          ) : options.map(o => (
            <label key={o} className="flex items-center gap-2 text-xs text-[#5A305A] py-1 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} className="w-3.5 h-3.5 accent-[#5A305A] shrink-0" />
              {o}
            </label>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Kartu ringkasan (4 card di header) ─────────────────────────────────────
function SummaryCard({ label, value, sub, pct, pctPrevValue, comparePeriodLabel }: {
  label: string; value: string; sub?: string; pct?: number; pctPrevValue?: string; comparePeriodLabel?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <p className="text-[11px] font-semibold text-[#5A305A]/70">{label}</p>
      <p className="text-lg font-bold text-[#5A305A] mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-[#5A305A]/50 mt-0.5">{sub}</p>}
      {pct !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-[10px] font-bold ${pct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(pct).toFixed(1)}% vs {comparePeriodLabel} {pctPrevValue && `(${pctPrevValue})`}
        </div>
      )}
    </div>
  );
}

// ─── Bar breakdown komponen biaya (horizontal, label kiri - bar tengah - nilai kanan) ──────────
function ComponentBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-[#5A305A]">{label}</span>
      <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden min-w-0">
        <div className="h-full rounded" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, backgroundColor: color }} />
      </div>
      <span className="w-32 shrink-0 text-right text-xs font-bold font-mono text-[#5A305A]">{fmtIdr(value)}</span>
    </div>
  );
}

// ─── Donut (pola sama ReportingDashboardPage.tsx) -- 1 slice highlight di posisi ASLI kalau
// PPJK dipilih sebagian, sisanya abu kosong (meeting-mode). ─────────────────────────────────
function Donut({ segments, centerLabel, centerValue }: { segments: { label: string; value: number; color: string; dimmed?: boolean }[]; centerLabel: string; centerValue: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 40, CX = 50, CY = 50, STROKE = 16;
  const circumference = 2 * Math.PI * R;
  let offsetAcc = 0;
  const drawn = segments.filter(s => s.value > 0).map(s => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = frac * circumference;
    const seg = { ...s, dashArray: `${dash} ${circumference - dash}`, dashOffset: -offsetAcc };
    offsetAcc += dash;
    return seg;
  });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F1F5F9" strokeWidth={STROKE} />
          {drawn.map((s, i) => (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.dimmed ? '#E2E8F0' : s.color} strokeWidth={STROKE}
              strokeDasharray={s.dashArray} strokeDashoffset={s.dashOffset} strokeLinecap="butt">
              <title>{s.label}: {fmtIdr(s.value)}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase text-[#5A305A]/60">{centerLabel}</span>
          <span className="text-sm font-black text-[#5A305A] text-center px-2 break-words">{centerValue}</span>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.dimmed ? '#E2E8F0' : s.color }} />
            <span className={`text-xs font-semibold flex-1 ${s.dimmed ? 'text-slate-400' : 'text-[#5A305A]'}`}>{s.label}</span>
            <span className={`text-xs font-bold w-12 text-right shrink-0 ${s.dimmed ? 'text-slate-400' : 'text-[#5A305A]/70'}`}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            {!s.dimmed && <span className="text-xs font-bold font-mono text-[#5A305A] shrink-0">{fmtIdr(s.value)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar horizontal generik (dipakai By Origin -- SEMUA origin, scroll, bukan top-5; & By
// Weight Range -- Cost/Shipment). `formatValue` OPSIONAL (default `fmtIdr`, format Rupiah) --
// 2026-09, fix laporan user: chart "Shipment" (By Weight Range) SEBELUMNYA ikut `fmtIdr()`
// hardcode, jadi salah tampil "IDR 14" dst padahal itu JUMLAH shipment (angka biasa), bukan
// nominal. Chart Cost TETAP pakai `fmtIdr` (default), chart Shipment kirim `formatValue`
// custom (angka polos `toLocaleString('id-ID')`, TANPA prefix "IDR"). ─────────────────────────
function HBar({ data, color, formatValue = fmtIdr }: { data: { label: string; value: number }[]; color: string; formatValue?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${formatValue(d.value)}`} className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-xs font-medium text-[#5A305A] truncate">{d.label}</span>
          <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden min-w-0">
            <div className="h-full rounded" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: color }} />
          </div>
          <span className="w-32 shrink-0 text-right text-[11px] font-bold font-mono text-[#5A305A]">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Trend line chart (SVG polyline sederhana, 12 bulan Jan-Dec) ───────────────────────────────
function TrendLine({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  const min = Math.min(0, ...data.map(d => d.value));
  const W = 600, H = 140, PAD = 8;
  const pts = data.map((d, i) => {
    const x = PAD + (i / Math.max(1, data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.value - min) / Math.max(1, max - min)) * (H - PAD * 2);
    return { x, y, ...d };
  });
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color}>
            <title>{p.label}: {fmtIdr(p.value)}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[9px] font-semibold text-[#5A305A]/60 mt-1 px-1">
        <span>{data[0]?.label}</span>
        <span>—</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

type ViewMode = 'PPJK' | 'ORIGIN' | 'WEIGHT';
type PerfMode = 'MTM' | 'QTQ' | 'YOY';
type CompareMode = 'YOY' | 'MTM';

export default function ReportingCostByCourierPage() {
  useEffect(() => { document.title = 'Overseas Cost by Courier · BeeHive'; }, []);

  const today = new Date();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('MONTHLY');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(quarterOfMonth(today.getMonth() + 1));

  const [anOptions, setAnOptions] = useState<string[]>([]);
  const [ppjkOptions, setPpjkOptions] = useState<string[]>([]);
  const [selectedAn, setSelectedAn] = useState<Set<string>>(new Set());
  const [selectedPpjk, setSelectedPpjk] = useState<Set<string>>(new Set());

  const [viewMode, setViewMode] = useState<ViewMode>('PPJK');
  const [perfMode, setPerfMode] = useState<PerfMode>('MTM');
  const [compareMode, setCompareMode] = useState<CompareMode>('MTM');

  const [yearRows, setYearRows] = useState<CourierRow[]>([]);
  const [prevYearRows, setPrevYearRows] = useState<CourierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExportPreview, setShowExportPreview] = useState(false);

  useEffect(() => {
    fetchDistinctAn().then(setAnOptions).catch(() => {});
    fetchDistinctPpjk().then(setPpjkOptions).catch(() => {});
  }, []);

  const prevAnchor = useMemo(() => previousPeriod(periodMode, year, month, quarter), [periodMode, year, month, quarter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const yr = { start: `${year}-01-01`, end: `${year}-12-31` };
    const fetches = [fetchCourierRows(yr.start, yr.end, selectedAn)];
    if (prevAnchor.year !== year) {
      const py = { start: `${prevAnchor.year}-01-01`, end: `${prevAnchor.year}-12-31` };
      fetches.push(fetchCourierRows(py.start, py.end, selectedAn));
    }
    Promise.all(fetches).then(([yr1, py1]) => {
      if (!active) return;
      setYearRows(yr1);
      setPrevYearRows(prevAnchor.year !== year ? (py1 || []) : yr1);
      setLoading(false);
    }).catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [year, prevAnchor.year, selectedAn]);

  const inRange = (r: CourierRow, start: string, end: string) => {
    const d = r.tgl_terima_email;
    return !!d && d >= start && d <= end;
  };

  const currentRange = useMemo(() => periodRange(periodMode, year, month, quarter), [periodMode, year, month, quarter]);
  const previousRange = useMemo(() => periodRange(periodMode, prevAnchor.year, prevAnchor.month, prevAnchor.quarter), [prevAnchor]);

  const currentRows = useMemo(() => yearRows.filter(r => inRange(r, currentRange.start, currentRange.end)), [yearRows, currentRange]);
  const previousRows = useMemo(() => prevYearRows.filter(r => inRange(r, previousRange.start, previousRange.end)), [prevYearRows, previousRange]);

  // "All PPJK" (selectedPpjk kosong) vs subset terpilih -- meeting-mode: % SELALU dihitung
  // terhadap total SEMUA PPJK, TIDAK dinormalisasi ulang jadi 100% (permintaan eksplisit user).
  const currentRowsSelected = useMemo(
    () => selectedPpjk.size === 0 ? currentRows : currentRows.filter(r => r.ppjk && selectedPpjk.has(r.ppjk)),
    [currentRows, selectedPpjk]
  );
  const previousRowsSelected = useMemo(
    () => selectedPpjk.size === 0 ? previousRows : previousRows.filter(r => r.ppjk && selectedPpjk.has(r.ppjk)),
    [previousRows, selectedPpjk]
  );

  const sumsAll = useMemo(() => { const s = zeroCourierSums(); currentRows.forEach(r => addCourierSums(s, r)); return s; }, [currentRows]);
  const sumsSelected = useMemo(() => { const s = zeroCourierSums(); currentRowsSelected.forEach(r => addCourierSums(s, r)); return s; }, [currentRowsSelected]);
  const sumsPrevSelected = useMemo(() => { const s = zeroCourierSums(); previousRowsSelected.forEach(r => addCourierSums(s, r)); return s; }, [previousRowsSelected]);

  const pctSelectedOfAll = sumsAll.totalCost > 0 ? (sumsSelected.totalCost / sumsAll.totalCost) * 100 : 0;
  const pctChangeTotal = pctOf(sumsSelected.totalCost, sumsPrevSelected.totalCost);
  const pctChangeFCB = pctOf(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm, sumsPrevSelected.freight + sumsPrevSelected.courierAdm + sumsPrevSelected.bm);

  const weightNow = useMemo(() => distinctWeightTotal(currentRowsSelected), [currentRowsSelected]);
  const weightPrev = useMemo(() => distinctWeightTotal(previousRowsSelected), [previousRowsSelected]);
  const pctChangeWeight = pctOf(weightNow, weightPrev);

  const awbNow = useMemo(() => distinctAwbCount(currentRowsSelected), [currentRowsSelected]);
  const poNow = useMemo(() => distinctPoCount(currentRowsSelected), [currentRowsSelected]);

  const comparePeriodLabel = periodLabel(periodMode, prevAnchor.year, prevAnchor.month, prevAnchor.quarter);
  const ppjkSuffix = selectedPpjk.size === 1 ? ` (${Array.from(selectedPpjk)[0]})` : selectedPpjk.size > 1 ? ` (${selectedPpjk.size} PPJK)` : '';

  // ─── Donut PPJK (all vs selected) ─────────────────────────────────────────
  const ppjkColors = ['#F58C77', '#5A305A', '#73507B', '#0EA5E9', '#D97706', '#0284C7', '#16A34A'];
  const ppjkTotals = useMemo(() => {
    const map = new Map<string, number>();
    currentRows.forEach(r => { const k = r.ppjk || 'Unknown'; const s = map.get(k) || 0; map.set(k, s + Number(r.total_amount || 0)); });
    return map;
  }, [currentRows]);
  const donutSegments = useMemo(() => {
    return Array.from(ppjkTotals.entries()).map(([label, value], i) => ({
      label, value, color: ppjkColors[i % ppjkColors.length],
      dimmed: selectedPpjk.size > 0 && !selectedPpjk.has(label),
    })).sort((a, b) => b.value - a.value);
  }, [ppjkTotals, selectedPpjk]);

  // ─── Trend (12 bulan Jan-Dec tahun `year`, ikut PPJK terpilih) ────────────
  const trendData = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    yearRows.forEach(r => {
      if (selectedPpjk.size > 0 && !(r.ppjk && selectedPpjk.has(r.ppjk))) return;
      const d = r.tgl_terima_email;
      if (!d) return;
      const mn = Number(d.substring(5, 7));
      if (mn >= 1 && mn <= 12) arr[mn - 1] += Number(r.total_amount || 0);
    });
    return arr.map((v, i) => ({ label: MONTH_ABBR[i], value: v }));
  }, [yearRows, selectedPpjk]);

  // ─── By PPJK detail table ──────────────────────────────────────────────────
  const byPpjkDetail = useMemo(() => {
    const map = new Map<string, { sums: CourierSums; rows: CourierRow[] }>();
    currentRows.forEach(r => {
      const k = r.ppjk || 'Unknown';
      if (selectedPpjk.size > 0 && !selectedPpjk.has(k)) return;
      if (!map.has(k)) map.set(k, { sums: zeroCourierSums(), rows: [] });
      const g = map.get(k)!;
      addCourierSums(g.sums, r);
      g.rows.push(r);
    });
    return Array.from(map.entries()).map(([ppjk, g]) => ({
      ppjk, sums: g.sums, weight: distinctWeightTotal(g.rows), shipment: distinctAwbCount(g.rows), po: distinctPoCount(g.rows),
    })).sort((a, b) => b.sums.totalCost - a.sums.totalCost);
  }, [currentRows, selectedPpjk]);

  // ─── By Origin ──────────────────────────────────────────────────────────────
  const byOriginDetail = useMemo(() => {
    const map = new Map<string, { sums: CourierSums; rows: CourierRow[] }>();
    currentRowsSelected.forEach(r => {
      const k = (r.origin || 'Unknown').trim() || 'Unknown';
      if (!map.has(k)) map.set(k, { sums: zeroCourierSums(), rows: [] });
      const g = map.get(k)!;
      addCourierSums(g.sums, r);
      g.rows.push(r);
    });
    return Array.from(map.entries()).map(([origin, g]) => ({
      origin, sums: g.sums, weight: distinctWeightTotal(g.rows), shipment: distinctAwbCount(g.rows), po: distinctPoCount(g.rows),
    })).sort((a, b) => b.sums.totalCost - a.sums.totalCost);
  }, [currentRowsSelected]);

  // ─── By Weight Range ─────────────────────────────────────────────────────
  const weightBuckets = useMemo(() => {
    const wmap = distinctWeightMap(currentRowsSelected);
    const bucketOf = new Map<string, string>();
    wmap.forEach((w, awb) => bucketOf.set(awb, weightRangeLabel(w)));
    const out = new Map<string, { sums: CourierSums; shipment: Set<string> }>();
    WEIGHT_RANGES.forEach(rg => out.set(rg.label, { sums: zeroCourierSums(), shipment: new Set() }));
    currentRowsSelected.forEach(r => {
      const key = stripAwbCarrier(r.awb);
      const label = bucketOf.get(key);
      if (!label) return;
      const g = out.get(label)!;
      addCourierSums(g.sums, r);
      g.shipment.add(key);
    });
    return WEIGHT_RANGES.map(rg => ({ label: rg.label, sums: out.get(rg.label)!.sums, shipment: out.get(rg.label)!.shipment.size }));
  }, [currentRowsSelected]);

  // ─── Data Performance (MTM/QTQ/YoY) ─────────────────────────────────────
  const perfPeriodMode: PeriodMode = perfMode === 'MTM' ? 'MONTHLY' : perfMode === 'QTQ' ? 'QUARTERLY' : 'YEARLY';
  const perfCount = perfMode === 'MTM' ? 6 : perfMode === 'QTQ' ? 4 : 3;
  const perfSeries = useMemo(
    () => buildPeriodSeries(perfPeriodMode, year, month, quarter, perfCount),
    [perfPeriodMode, year, month, quarter, perfCount]
  );
  const [perfRowsByPeriod, setPerfRowsByPeriod] = useState<CourierRow[][]>([]);
  useEffect(() => {
    let active = true;
    Promise.all(perfSeries.map(p => {
      const r = periodRange(perfPeriodMode, p.year, p.month, p.quarter);
      return fetchCourierRows(r.start, r.end, selectedAn);
    })).then(res => { if (active) setPerfRowsByPeriod(res); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfPeriodMode, JSON.stringify(perfSeries.map(p => `${p.year}-${p.month}-${p.quarter}`)), selectedAn]);

  const perfColumns = useMemo(() => perfSeries.map((p, i) => {
    const rowsRaw = perfRowsByPeriod[i] || [];
    const rows = selectedPpjk.size === 0 ? rowsRaw : rowsRaw.filter(r => r.ppjk && selectedPpjk.has(r.ppjk));
    const sums = zeroCourierSums();
    rows.forEach(r => addCourierSums(sums, r));
    return { label: p.label, shipment: distinctAwbCount(rows), weight: distinctWeightTotal(rows), sums };
  }), [perfSeries, perfRowsByPeriod, selectedPpjk]);

  const perfTotal = useMemo(() => {
    const sums = zeroCourierSums();
    let shipment = 0, weight = 0;
    const allRows: CourierRow[] = [];
    perfRowsByPeriod.forEach(rowsRaw => {
      const rows = selectedPpjk.size === 0 ? rowsRaw : rowsRaw.filter(r => r.ppjk && selectedPpjk.has(r.ppjk));
      allRows.push(...rows);
    });
    allRows.forEach(r => addCourierSums(sums, r));
    shipment = distinctAwbCount(allRows);
    weight = distinctWeightTotal(allRows);
    return { sums, shipment, weight };
  }, [perfRowsByPeriod, selectedPpjk]);

  // ─── Conclusion ──────────────────────────────────────────────────────────
  const conclusionCompareLabel = compareMode === 'YOY' ? `${year - 1}` : comparePeriodLabel;
  const topComponent = useMemo(() => {
    const parts: { label: string; value: number }[] = [
      { label: 'Freight', value: sumsSelected.freight },
      { label: 'Courier Adm', value: sumsSelected.courierAdm },
      { label: 'BM', value: sumsSelected.bm },
      { label: 'PPN', value: sumsSelected.ppn },
      { label: 'PPH', value: sumsSelected.pph },
    ];
    return parts.sort((a, b) => b.value - a.value)[0];
  }, [sumsSelected]);

  // Detail rows utk viewMode yang lagi aktif -- SATU sumber dipakai preview modal DAN
  // handleExport (Aturan Umum "export ikut persis tampilan") supaya keduanya TIDAK PERNAH beda.
  const activeDetailTitle = viewMode === 'PPJK' ? 'Detail Data (By PPJK)' : viewMode === 'ORIGIN' ? 'Detail Data (By Origin)' : 'Detail Data (By Weight Range)';
  const activeDetailNameLabel = viewMode === 'PPJK' ? 'PPJK' : viewMode === 'ORIGIN' ? 'Origin' : 'Weight Range';
  const activeDetailRows = viewMode === 'PPJK'
    ? byPpjkDetail.map(d => ({ name: d.ppjk, sums: d.sums, weight: d.weight, shipment: d.shipment, po: d.po }))
    : viewMode === 'ORIGIN'
    ? byOriginDetail.map(d => ({ name: d.origin, sums: d.sums, weight: d.weight, shipment: d.shipment, po: d.po }))
    : weightBuckets.map(b => ({ name: b.label, sums: b.sums, weight: 0, shipment: b.shipment, po: 0 }));
  const activeHideWeightPo = viewMode === 'WEIGHT';

  // Export Excel -- HASIL SAMA PERSIS dgn yang tampil di aplikasi (permintaan eksplisit user):
  // nominal ditulis sbg TEKS yang SUDAH diformat (`fmtIdr()`/`toLocaleString('id-ID')`, BUKAN
  // angka mentah) supaya pemisah ribuan & prefix "IDR" identik dgn layar -- Excel TIDAK diberi
  // angka + number format bawaan krn locale Excel penerima file belum tentu id-ID (bisa tampil
  // beda drpd yg dimaksud). Header tiap tabel diberi warna brand `FF5A305A` + teks putih tebal
  // (`HEADER_FILL`/`HEADER_FONT`, dipakai ULANG di semua tabel dlm 1 file) -- konsisten dgn
  // header panel berwarna di modul Reporting lain.
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Overseas Cost by Courier');
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A305A' } };
    const styleHeaderRow = (row: ExcelJS.Row) => {
      row.eachCell(c => { c.fill = HEADER_FILL; c.font = { color: { argb: 'FFFFFFFF' }, bold: true }; });
    };

    const titleRow = ws.addRow(['Overseas Cost by Courier']);
    titleRow.font = { bold: true, size: 14, color: { argb: 'FF5A305A' } };
    ws.addRow([`Period: ${periodLabel(periodMode, year, month, quarter)}`, `PT: ${selectedAn.size ? Array.from(selectedAn).join(', ') : 'All'}`, `PPJK: ${selectedPpjk.size ? Array.from(selectedPpjk).join(', ') : 'All'}`]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow(['Summary', 'Value']));
    ws.addRow([`Total Cost${ppjkSuffix}`, fmtIdr(sumsSelected.totalCost)]);
    ws.addRow(['Freight+Courier Adm+BM', fmtIdr(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm)]);
    ws.addRow(['Total Weight (distinct)', `${weightNow.toLocaleString('id-ID')} kg`]);
    ws.addRow(['Shipment (distinct)', String(awbNow)]);
    ws.addRow(['PO (distinct)', String(poNow)]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow(['Component', 'Value']));
    ws.addRow(['Freight', fmtIdr(sumsSelected.freight)]);
    ws.addRow(['Courier Adm Fee', fmtIdr(sumsSelected.courierAdm)]);
    ws.addRow(['BM', fmtIdr(sumsSelected.bm)]);
    ws.addRow(['PPN', fmtIdr(sumsSelected.ppn)]);
    ws.addRow(['PPH', fmtIdr(sumsSelected.pph)]);
    ws.addRow(['Total Cost', fmtIdr(sumsSelected.totalCost)]);
    ws.addRow(['Excl PPN+PPH', fmtIdr(exclPpnPph(sumsSelected))]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow([activeDetailTitle]));
    const detailHeaderCells = activeHideWeightPo
      ? ['No', activeDetailNameLabel, 'Total Cost', 'Shipment']
      : ['No', activeDetailNameLabel, 'Total Cost', 'Freight+Adm+BM', 'BM', 'Weight', 'Shipment', 'PO'];
    styleHeaderRow(ws.addRow(detailHeaderCells));
    activeDetailRows.forEach((r, i) => {
      ws.addRow(activeHideWeightPo
        ? [i + 1, r.name, fmtIdr(r.sums.totalCost), String(r.shipment)]
        : [i + 1, r.name, fmtIdr(r.sums.totalCost), fmtIdr(r.sums.freight + r.sums.courierAdm + r.sums.bm), fmtIdr(r.sums.bm), r.weight.toLocaleString('id-ID'), String(r.shipment), String(r.po)]);
    });

    ws.columns.forEach(col => { col.width = 22; });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `overseas-cost-by-courier-${periodLabel(periodMode, year, month, quarter)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportPreview(false);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Truck size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Overseas Cost by Courier</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Cost & shipment performance — meeting-ready</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-8">
        {/* Filter bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3 sticky top-0 z-20">
          <div className="flex flex-nowrap items-center gap-2.5 overflow-x-auto">
            <MultiSelect label="PT" options={anOptions} selected={selectedAn} onChange={setSelectedAn} />
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as PeriodMode)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
            </select>
            {periodMode === 'MONTHLY' && (
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
                {MONTH_ABBR.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            )}
            {periodMode === 'QUARTERLY' && (
              <select value={quarter} onChange={e => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
            )}
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
              {Array.from({ length: 6 }, (_, i) => { const y = today.getFullYear() - 3 + i; return <option key={y} value={y}>{y}</option>; })}
            </select>
            <MultiSelect label="PPJK" options={ppjkOptions} selected={selectedPpjk} onChange={setSelectedPpjk} />
            <button onClick={() => setShowExportPreview(true)} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 whitespace-nowrap">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#5A305A]">Loading data...</div>
        ) : (
          <div className="space-y-3">
            {/* B. 4 kartu ringkasan */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <SummaryCard
                label={`Total Cost${ppjkSuffix}`}
                value={fmtIdr(sumsSelected.totalCost)}
                sub={selectedPpjk.size > 0 ? `${pctSelectedOfAll.toFixed(1)}% total` : undefined}
                pct={pctChangeTotal} pctPrevValue={fmtIdr(sumsPrevSelected.totalCost)} comparePeriodLabel={comparePeriodLabel}
              />
              <SummaryCard
                label="Freight+Courier Adm+BM"
                value={fmtIdr(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm)}
                pct={pctChangeFCB} pctPrevValue={fmtIdr(sumsPrevSelected.freight + sumsPrevSelected.courierAdm + sumsPrevSelected.bm)} comparePeriodLabel={comparePeriodLabel}
              />
              <SummaryCard
                label="Total Weight (distinct)"
                value={`${weightNow.toLocaleString('id-ID')} kg`}
                pct={pctChangeWeight} pctPrevValue={`${weightPrev.toLocaleString('id-ID')} kg`} comparePeriodLabel={comparePeriodLabel}
              />
              <SummaryCard
                label="Shipment / PO (distinct)"
                value={`${awbNow} / ${poNow}`}
              />
            </div>

            {/* C. Breakdown Komponen Biaya */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <p className="text-sm font-bold text-[#5A305A] mb-3">Breakdown Komponen Biaya{ppjkSuffix} ({periodLabel(periodMode, year, month, quarter)})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <ComponentBar label="Freight" value={sumsSelected.freight} max={sumsSelected.freight} color="#F58C77" />
                <ComponentBar label="Courier Adm" value={sumsSelected.courierAdm} max={sumsSelected.freight} color="#73507B" />
                <ComponentBar label="BM" value={sumsSelected.bm} max={sumsSelected.freight} color="#16A34A" />
                <ComponentBar label="PPN" value={sumsSelected.ppn} max={sumsSelected.freight} color="#D97706" />
                <ComponentBar label="PPH" value={sumsSelected.pph} max={sumsSelected.freight} color="#0EA5E9" />
              </div>
              <p className="text-xs text-[#5A305A] mt-3 pt-3 border-t border-slate-100">
                Total Cost: <span className="font-bold">{fmtIdr(sumsSelected.totalCost)}</span> · Excl PPN+PPH: <span className="font-bold">{fmtIdr(exclPpnPph(sumsSelected))}</span>
              </p>
            </div>

            {/* D. Sub-toggle */}
            <div className="flex items-center gap-2">
              {(['PPJK', 'ORIGIN', 'WEIGHT'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${viewMode === v ? 'bg-[#5A305A] text-white border-[#5A305A]' : 'bg-white text-[#5A305A] border-slate-200 hover:border-[#5A305A]'}`}>
                  {v === 'PPJK' ? 'By PPJK' : v === 'ORIGIN' ? 'By Origin' : 'By Weight Range'}
                </button>
              ))}
              <span className="text-[10px] text-[#5A305A]/50 ml-1">← hanya blok bawah yang berganti; Card & Breakdown di atas tetap</span>
            </div>

            {viewMode === 'PPJK' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <p className="text-sm font-bold text-[#5A305A] mb-3">Cost Distribution by PPJK{ppjkSuffix}</p>
                    {donutSegments.length === 0 ? <p className="text-xs text-slate-400 italic">No data.</p> : <Donut segments={donutSegments} centerLabel="Total" centerValue={fmtIdr(sumsAll.totalCost)} />}
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <p className="text-sm font-bold text-[#5A305A] mb-3">Trend Cost{ppjkSuffix} ({year})</p>
                    <TrendLine data={trendData} color={ACCENT} />
                  </div>
                </div>
                <DetailTable
                  title="Detail Data (By PPJK)"
                  rows={byPpjkDetail.map(d => ({ name: d.ppjk, sums: d.sums, weight: d.weight, shipment: d.shipment, po: d.po }))}
                />
                <ConclusionBox
                  title="By PPJK"
                  compareMode={compareMode} setCompareMode={setCompareMode}
                  compareLabel={conclusionCompareLabel}
                  text={`Total cost${ppjkSuffix} ${pctChangeTotal >= 0 ? 'naik' : 'turun'} ${Math.abs(pctChangeTotal).toFixed(1)}% (${fmtIdrSigned(sumsSelected.totalCost - sumsPrevSelected.totalCost)}) dibanding ${comparePeriodLabel}${selectedPpjk.size > 0 ? `, menyumbang ${pctSelectedOfAll.toFixed(1)}% dari seluruh biaya PPJK` : ''}. ${awbNow} shipment / ${poNow} PO distinct. Komponen terbesar: ${topComponent.label} (${fmtIdr(topComponent.value)}).`}
                />
              </>
            )}

            {viewMode === 'ORIGIN' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <p className="text-sm font-bold text-[#5A305A] mb-3">Cost Distribution by Origin{ppjkSuffix}</p>
                    {byOriginDetail.length === 0 ? <p className="text-xs text-slate-400 italic">No data.</p> : (
                      <Donut
                        segments={byOriginDetail.map((d, i) => ({ label: d.origin, value: d.sums.totalCost, color: ppjkColors[i % ppjkColors.length] }))}
                        centerLabel="Total" centerValue={fmtIdr(sumsSelected.totalCost)}
                      />
                    )}
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <p className="text-sm font-bold text-[#5A305A] mb-3">Total Cost by Origin{ppjkSuffix} (all origin)</p>
                    {byOriginDetail.length === 0 ? <p className="text-xs text-slate-400 italic">No data.</p> : (
                      <HBar data={byOriginDetail.map(d => ({ label: d.origin, value: d.sums.totalCost }))} color={ACCENT} />
                    )}
                  </div>
                </div>
                <DetailTable
                  title="Detail Data (By Origin)"
                  rows={byOriginDetail.map(d => ({ name: d.origin, sums: d.sums, weight: d.weight, shipment: d.shipment, po: d.po }))}
                />
                <ConclusionBox
                  title="By Origin"
                  compareMode={compareMode} setCompareMode={setCompareMode}
                  compareLabel={conclusionCompareLabel}
                  text={`Origin terbesar: ${byOriginDetail[0]?.origin || '-'} (${fmtIdr(byOriginDetail[0]?.sums.totalCost || 0)}, ${sumsSelected.totalCost > 0 ? ((byOriginDetail[0]?.sums.totalCost || 0) / sumsSelected.totalCost * 100).toFixed(1) : 0}% dari total${ppjkSuffix}). Total ${byOriginDetail.length} origin tercatat pada periode ini.`}
                />
              </>
            )}

            {viewMode === 'WEIGHT' && (
              <>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                  <p className="text-sm font-bold text-[#5A305A] mb-3">Shipment & Cost by Weight Range{ppjkSuffix}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold text-[#5A305A]/60 uppercase mb-2">Cost</p>
                      <HBar data={weightBuckets.map(b => ({ label: b.label, value: b.sums.totalCost }))} color={ACCENT} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[#5A305A]/60 uppercase mb-2">Shipment</p>
                      <HBar data={weightBuckets.map(b => ({ label: b.label, value: b.shipment }))} color="#73507B" formatValue={n => n.toLocaleString('id-ID')} />
                    </div>
                  </div>
                </div>
                <DetailTable
                  title="Detail Data (By Weight Range)"
                  rows={weightBuckets.map(b => ({ name: b.label, sums: b.sums, weight: 0, shipment: b.shipment, po: 0 }))}
                  hideWeightPo
                />

                {/* Data Performance */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <p className="text-sm font-bold text-[#5A305A]">Data Performance{ppjkSuffix}</p>
                    <div className="flex items-center gap-1">
                      {(['MTM', 'QTQ', 'YOY'] as PerfMode[]).map(m => (
                        <button key={m} onClick={() => setPerfMode(m)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${perfMode === m ? 'bg-[#5A305A] text-white border-[#5A305A]' : 'bg-white text-[#5A305A] border-slate-200'}`}>
                          {m === 'MTM' ? 'Month-to-Month' : m === 'QTQ' ? 'Quarter-to-Quarter' : 'Year-to-Year'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-[10px] text-[#5A305A]/70 uppercase border-b border-slate-200">
                          <th className="text-left px-2 py-2 whitespace-nowrap">Metric</th>
                          {perfColumns.map(c => <th key={c.label} className="text-right px-2 py-2 whitespace-nowrap">{c.label}</th>)}
                          <th className="text-right px-2 py-2 whitespace-nowrap font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <PerfRow label="Shipment Growth %" values={perfColumns.map((c, i) => i === 0 ? null : pctOf(c.shipment, perfColumns[i - 1].shipment))} isPct total={null} />
                        <PerfRow label="Weight Growth %" values={perfColumns.map((c, i) => i === 0 ? null : pctOf(c.weight, perfColumns[i - 1].weight))} isPct total={null} />
                        <PerfRow label="Total Shipment (AWB)" values={perfColumns.map(c => c.shipment)} total={perfTotal.shipment} />
                        <PerfRow label="Total Weight (kg)" values={perfColumns.map(c => c.weight)} total={perfTotal.weight} />
                        <PerfRow label="Total Freight" values={perfColumns.map(c => c.sums.freight)} total={perfTotal.sums.freight} isMoney />
                        <PerfRow label="Total Duty Tax" values={perfColumns.map(c => c.sums.totalDutyTax)} total={perfTotal.sums.totalDutyTax} isMoney />
                        <PerfRow label="Courier Adm Fee" values={perfColumns.map(c => c.sums.courierAdm)} total={perfTotal.sums.courierAdm} isMoney />
                        <PerfRow label="Sum of Total Amount" values={perfColumns.map(c => c.sums.totalCost)} total={perfTotal.sums.totalCost} isMoney bold />
                      </tbody>
                    </table>
                  </div>
                </div>

                <ConclusionBox
                  title="By Weight Range"
                  compareMode={compareMode} setCompareMode={setCompareMode}
                  compareLabel={conclusionCompareLabel}
                  text={`Rentang berat dominan: ${[...weightBuckets].sort((a, b) => b.shipment - a.shipment)[0]?.label || '-'} (${[...weightBuckets].sort((a, b) => b.shipment - a.shipment)[0]?.shipment || 0} shipment). Total cost seluruh rentang berat: ${fmtIdr(weightBuckets.reduce((a, b) => a + b.sums.totalCost, 0))}.`}
                />
              </>
            )}
          </div>
        )}
      </main>

      {showExportPreview && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-bold text-[#5A305A]">Export Preview — Overseas Cost by Courier</h3>
              <button onClick={() => setShowExportPreview(false)} className="text-slate-400 hover:text-slate-600">
                <ChevronDown size={18} className="rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-[11px] text-[#5A305A]/60">
                Period: <b>{periodLabel(periodMode, year, month, quarter)}</b> · PT: <b>{selectedAn.size ? Array.from(selectedAn).join(', ') : 'All'}</b> · PPJK: <b>{selectedPpjk.size ? Array.from(selectedPpjk).join(', ') : 'All'}</b> · View: <b>{viewMode === 'PPJK' ? 'By PPJK' : viewMode === 'ORIGIN' ? 'By Origin' : 'By Weight Range'}</b>
              </p>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead><tr style={{ backgroundColor: '#5A305A' }}><th colSpan={2} className="text-left px-2 py-1.5 text-white font-bold">Summary</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Total Cost{ppjkSuffix}</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.totalCost)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Freight+Courier Adm+BM</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Total Weight (distinct)</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{weightNow.toLocaleString('id-ID')} kg</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Shipment (distinct)</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{awbNow}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">PO (distinct)</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{poNow}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead><tr style={{ backgroundColor: '#5A305A' }}><th colSpan={2} className="text-left px-2 py-1.5 text-white font-bold">Component</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Freight</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.freight)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">Courier Adm Fee</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.courierAdm)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">BM</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.bm)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">PPN</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.ppn)}</td></tr>
                    <tr><td className="px-2 py-1.5 text-[#5A305A]">PPH</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.pph)}</td></tr>
                    <tr className="font-bold"><td className="px-2 py-1.5 text-[#5A305A]">Total Cost</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(sumsSelected.totalCost)}</td></tr>
                    <tr className="font-bold"><td className="px-2 py-1.5 text-[#5A305A]">Excl PPN+PPH</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{fmtIdr(exclPpnPph(sumsSelected))}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="px-2 py-1.5 font-bold text-white text-[11px]" style={{ backgroundColor: '#5A305A' }}>{activeDetailTitle}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ backgroundColor: '#5A305A' }} className="text-white">
                        <th className="text-left px-2 py-1.5">No</th>
                        <th className="text-left px-2 py-1.5 whitespace-nowrap">{activeDetailNameLabel}</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Total Cost</th>
                        {!activeHideWeightPo && <th className="text-right px-2 py-1.5 whitespace-nowrap">Frght+Adm+BM</th>}
                        {!activeHideWeightPo && <th className="text-right px-2 py-1.5 whitespace-nowrap">BM</th>}
                        {!activeHideWeightPo && <th className="text-right px-2 py-1.5 whitespace-nowrap">Weight</th>}
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Shipment</th>
                        {!activeHideWeightPo && <th className="text-right px-2 py-1.5 whitespace-nowrap">PO</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeDetailRows.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-4 text-slate-400 italic">No data.</td></tr>
                      )}
                      {activeDetailRows.slice(0, 15).map((r, i) => (
                        <tr key={r.name} className="text-[#5A305A]">
                          <td className="px-2 py-1.5">{i + 1}</td>
                          <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.totalCost)}</td>
                          {!activeHideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.freight + r.sums.courierAdm + r.sums.bm)}</td>}
                          {!activeHideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.bm)}</td>}
                          {!activeHideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{r.weight.toLocaleString('id-ID')}</td>}
                          <td className="px-2 py-1.5 text-right font-mono">{r.shipment}</td>
                          {!activeHideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{r.po}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activeDetailRows.length > 15 && (
                  <p className="text-[10px] text-[#5A305A]/50 px-2 py-1.5">showing first 15 of {activeDetailRows.length} rows — file Excel tetap berisi SEMUA baris.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowExportPreview(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-[#5A305A] hover:bg-slate-50">Cancel</button>
              <button onClick={handleExport} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5">
                <Download size={13} /> Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailTable({ title, rows, hideWeightPo }: {
  title: string; rows: { name: string; sums: CourierSums; weight: number; shipment: number; po: number }[]; hideWeightPo?: boolean;
}) {
  const totalSums = zeroCourierSums();
  let totalWeight = 0, totalShipment = 0, totalPo = 0;
  rows.forEach(r => {
    totalSums.totalCost += r.sums.totalCost; totalSums.freight += r.sums.freight; totalSums.courierAdm += r.sums.courierAdm;
    totalSums.bm += r.sums.bm; totalSums.ppn += r.sums.ppn; totalSums.pph += r.sums.pph; totalSums.totalDutyTax += r.sums.totalDutyTax;
    totalWeight += r.weight; totalShipment += r.shipment; totalPo += r.po;
  });
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-hidden">
      <p className="text-sm font-bold text-[#5A305A] mb-3">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] text-[#5A305A]/70 uppercase border-b border-slate-200">
              <th className="text-left px-2 py-2">No</th>
              <th className="text-left px-2 py-2 whitespace-nowrap">{title.includes('PPJK') ? 'PPJK' : title.includes('Origin') ? 'Origin' : 'Weight Range'}</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Total Cost</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Frght+Adm+BM</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">BM</th>
              {!hideWeightPo && <th className="text-right px-2 py-2 whitespace-nowrap">Weight</th>}
              <th className="text-right px-2 py-2 whitespace-nowrap">Shpmt</th>
              {!hideWeightPo && <th className="text-right px-2 py-2 whitespace-nowrap">PO</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-slate-400 italic">No data.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.name} className="text-[#5A305A]">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.totalCost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.freight + r.sums.courierAdm + r.sums.bm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.bm)}</td>
                {!hideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{r.weight.toLocaleString('id-ID')}</td>}
                <td className="px-2 py-1.5 text-right font-mono">{r.shipment}</td>
                {!hideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{r.po}</td>}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-bold text-[#5A305A] bg-slate-50">
                <td className="px-2 py-1.5" colSpan={2}>Total</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.totalCost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.freight + totalSums.courierAdm + totalSums.bm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.bm)}</td>
                {!hideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{totalWeight.toLocaleString('id-ID')}</td>}
                <td className="px-2 py-1.5 text-right font-mono">{totalShipment}</td>
                {!hideWeightPo && <td className="px-2 py-1.5 text-right font-mono">{totalPo}</td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfRow({ label, values, total, isPct, isMoney, bold }: {
  label: string; values: (number | null)[]; total: number | null; isPct?: boolean; isMoney?: boolean; bold?: boolean;
}) {
  const fmt = (v: number | null) => {
    if (v === null) return '—';
    if (isPct) return `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`;
    if (isMoney) return fmtIdr(v);
    return v.toLocaleString('id-ID');
  };
  return (
    <tr className={bold ? 'font-bold text-[#5A305A]' : 'text-[#5A305A]'}>
      <td className="px-2 py-1.5 whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-2 py-1.5 text-right font-mono ${isPct && v !== null ? (v >= 0 ? 'text-red-600' : 'text-emerald-600') : ''}`}>{fmt(v)}</td>
      ))}
      <td className="px-2 py-1.5 text-right font-mono">{fmt(total)}</td>
    </tr>
  );
}

function ConclusionBox({ title, text, compareMode, setCompareMode, compareLabel }: {
  title: string; text: string; compareMode: CompareMode; setCompareMode: (m: CompareMode) => void; compareLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <p className="text-xs font-bold text-amber-800 mb-1">Conclusion ({title}) — vs {compareLabel}</p>
        <p className="text-xs text-amber-900 leading-relaxed">{text}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(['MTM', 'YOY'] as CompareMode[]).map(m => (
          <button key={m} onClick={() => setCompareMode(m)}
            className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${compareMode === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-200'}`}>
            {m === 'MTM' ? 'Month-to-Month' : 'Year-over-Year'}
          </button>
        ))}
      </div>
    </div>
  );
}
