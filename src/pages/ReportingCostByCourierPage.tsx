import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Download, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import Greeting from '../components/Greeting';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from '../lib/AuthContext';
import ExcelJS from 'exceljs';
import {
  CourierRow, PeriodMode, YearMonth, PeriodColumn, fetchCourierYear, fetchDistinctAn, fetchDistinctPpjk, fetchDistinctOrigin,
  normalizePpjk, stripAwbCarrier, distinctAwbCount, distinctPoCount, distinctWeightTotal, distinctWeightMap,
  zeroCourierSums, addCourierSums, exclPpnPph, CourierSums, WEIGHT_RANGES, weightRangeLabel,
  periodRange, previousPeriod, periodLabel, buildSelectedPeriods, buildPeriodColumns, rowsInMonthKeys, monthKeyOf,
  fmtIdr, fmtIdrSigned, pctOf, quarterOfMonth, MONTH_ABBR,
} from '../utils/ReportingCourierHelpers';

// "Overseas Cost by Courier" (2026-09, REVISI besar) -- halaman di bawah menu Reporting, sumber
// data Invoice Recap Courier (`rekapan_courier`), TERPISAH TOTAL dari modul "Overseas Cost by
// Vessel". Lihat `ReportingCourierHelpers.ts` utk SATU-SATUNYA tempat logic fetch/agregasi.

const ACCENT = '#F58C77'; // coral -- KHUSUS warna bar/line chart (bukan elemen UI interaktif,
// tombol/toggle aktif pakai `#5A305A` brand ungu, samakan dgn halaman lain -- lihat CLAUDE.md).
const PPJK_COLORS = ['#F58C77', '#5A305A', '#73507B', '#0EA5E9', '#D97706', '#0284C7', '#16A34A'];
const OTHERS_COLOR = '#E2E8F0';

type DonutSegType = { label: string; value: number; color: string; isOthers?: boolean };

// Generik utk ketiga tab Donut (PPJK/Origin/Weight Range, 2026-09) -- SATU-SATUNYA tempat logic
// "item terpilih di posisi asli + sisanya digabung 1 slice Others". `entriesAll` = SEMUA item
// (BUKAN cuma yang terpilih) supaya "Others" bisa dihitung benar & supaya kondisi "tidak ada
// yang dipilih" bisa menampilkan seluruh item apa adanya.
function buildDonutSegments(entriesAll: [string, number][], selected: Set<string>, showZeroCost: boolean): DonutSegType[] {
  if (selected.size === 0) {
    let entries = entriesAll;
    if (!showZeroCost) entries = entries.filter(([, v]) => v !== 0);
    return entries.map(([label, value], i) => ({ label, value, color: PPJK_COLORS[i % PPJK_COLORS.length] })).sort((a, b) => b.value - a.value);
  }
  const selectedEntries: [string, number][] = [];
  selected.forEach(k => {
    const found = entriesAll.find(([l]) => l === k);
    const v = found ? found[1] : 0;
    if (showZeroCost || v !== 0) selectedEntries.push([k, v]);
  });
  let othersValue = 0;
  entriesAll.forEach(([k, v]) => { if (!selected.has(k)) othersValue += v; });
  const segs: DonutSegType[] = selectedEntries.map(([label, value], i) => ({ label, value, color: PPJK_COLORS[i % PPJK_COLORS.length] }));
  if (othersValue > 0) segs.push({ label: 'Others', value: othersValue, color: OTHERS_COLOR, isOthers: true });
  return segs;
}

// Total tengah donut (2026-09) -- "All" (tidak ada item dipilih) = total SELURUH item;
// 1/lebih item dipilih = total item terpilih SAJA (BUKAN disembunyikan, lihat komentar `Donut`).
function donutCenterTotal(entriesAll: [string, number][], selected: Set<string>): number {
  if (selected.size === 0) return entriesAll.reduce((a, [, v]) => a + v, 0);
  return entriesAll.reduce((a, [k, v]) => selected.has(k) ? a + v : a, 0);
}

// Toggle keanggotaan 1 label di Set seleksi -- dipakai `onToggle` ketiga Donut.
function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

// ─── Dropdown multi-select generik (portal ke body, pola sama ReportingCostPerVesselPage.tsx) ──
function MultiSelect({ label, options, selected, onChange, emptyMeansAll }: {
  label: string; options: { value: string; text: string }[]; selected: Set<string>; onChange: (next: Set<string>) => void; emptyMeansAll?: boolean;
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
  const summary = selected.size === 0 ? (emptyMeansAll ? 'All' : 'None') : selected.size === 1 ? (options.find(o => o.value === Array.from(selected)[0])?.text || '1') : `${selected.size} selected`;

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
            <button onClick={() => onChange(new Set(options.map(o => o.value)))} className="text-[10px] font-bold text-[#5A305A] hover:underline">All</button>
            <button onClick={() => onChange(new Set())} className="text-[10px] font-bold text-[#5A305A] hover:underline">Clear</button>
          </div>
          {options.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic px-1 py-1">No options.</p>
          ) : options.map(o => (
            <label key={o.value} className="flex items-center gap-2 text-xs text-[#5A305A] py-1 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5 accent-[#5A305A] shrink-0" />
              {o.text}
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

// ─── Baris komponen biaya (list vertikal, GANTI dari bar chart -- 2026-09 revisi) ───────────────
function ComponentLine({ label, value, prevValue, compareLabel }: { label: string; value: number; prevValue: number; compareLabel: string }) {
  const pct = pctOf(value, prevValue);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-semibold text-[#5A305A] w-32 shrink-0">{label}</span>
      <span className="text-sm font-bold font-mono text-[#5A305A] flex-1 text-right">{fmtIdr(value)}</span>
      <span className={`flex items-center gap-1 text-[10px] font-bold w-52 justify-end shrink-0 ${pct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {Math.abs(pct).toFixed(1)}% vs {compareLabel} ({fmtIdr(prevValue)})
      </span>
    </div>
  );
}

// ─── Donut -- 1 slice highlight per item terpilih pada posisi ASLI, sisanya digabung 1 slice
// "Others" abu (2026-09 revisi: dulu tiap item non-terpilih tetap tampil nama+dimmed satu-satu,
// SEKARANG digabung jadi 1 "Others: %" TANPA rincian nama). Total di tengah donut SELALU
// tampil (2026-09 revisi lanjutan -- SEBELUMNYA `hideCenterValue` menyembunyikan total
// saat ada item terpilih, SEKARANG `centerValue` yang dikirim pemanggil sendiri yang berganti
// isi (Total keseluruhan saat "All", Total item terpilih saat 1/lebih item dipilih -- lihat
// `donutCenterTotal()`), Donut TIDAK PERNAH lagi menyembunyikan angka). `onToggle` opsional --
// klik legend/slice toggle keanggotaan label itu di Set seleksi pemanggil (dipakai ketiga tab
// PPJK/Origin/Weight Range, lihat `buildDonutSegments()`). ────────────────────────────────────
function Donut({ segments, centerLabel, centerValue, onToggle }: { segments: { label: string; value: number; color: string; isOthers?: boolean }[]; centerLabel: string; centerValue: string; onToggle?: (label: string) => void }) {
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
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.isOthers ? OTHERS_COLOR : s.color} strokeWidth={STROKE}
              strokeDasharray={s.dashArray} strokeDashoffset={s.dashOffset} strokeLinecap="butt"
              onClick={onToggle && !s.isOthers ? () => onToggle(s.label) : undefined}
              className={onToggle && !s.isOthers ? 'cursor-pointer' : undefined}>
              <title>{s.label}: {fmtIdr(s.value)}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase text-[#5A305A]/60">{centerLabel}</span>
          <span className="text-sm font-black text-center px-2 break-words" style={{ color: '#8A7415' }}>{centerValue}</span>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2">
        {segments.map((s, i) => (
          <div key={i} onClick={onToggle && !s.isOthers ? () => onToggle(s.label) : undefined}
            className={`flex items-center gap-2 ${onToggle && !s.isOthers ? 'cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.isOthers ? OTHERS_COLOR : s.color }} />
            <span className={`text-xs font-semibold flex-1 ${s.isOthers ? 'text-slate-400' : 'text-[#5A305A]'}`}>{s.label}</span>
            <span className={`text-xs font-bold w-12 text-right shrink-0 ${s.isOthers ? 'text-slate-400' : 'text-[#5A305A]/70'}`}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            {!s.isOthers && <span className="text-xs font-bold font-mono text-[#5A305A] shrink-0">{fmtIdr(s.value)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar horizontal generik (By Origin -- SEMUA origin, scroll, bukan top-5). `formatValue`
// opsional (default fmtIdr Rupiah). ─────────────────────────────────────────────────────────────
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

// ─── Bar VERTIKAL Shipment x Weight, dual-axis, khusus Weight Range (2026-09 revisi, GANTI dari
// single-series) -- 2 bar berdampingan per kategori: Shipment (sumbu kiri) & Weight (sumbu
// kanan), skala independen masing2 supaya proporsional walau satuan beda jauh. ──────────────────
function ShipmentWeightBar({ data, shipmentColor, weightColor }: { data: { label: string; shipment: number; weight: number }[]; shipmentColor: string; weightColor: string }) {
  const H = 200;
  const leftMax = Math.max(1, ...data.map(d => d.shipment)) * 1.15;
  const rightMax = Math.max(1, ...data.map(d => d.weight)) * 1.15;
  const ticks = [0, 1, 2, 3, 4];
  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[10px] font-bold text-[#5A305A]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: weightColor }} />Weight (Kg)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: shipmentColor }} />Shipment</span>
      </div>
      <div className="flex" style={{ height: H }}>
        <div className="w-10 flex flex-col justify-between text-left text-[10px] text-[#5A305A]/60 shrink-0">
          {ticks.map(t => <span key={t}>{Math.round(leftMax * (4 - t) / 4).toLocaleString('id-ID')}</span>)}
        </div>
        <div className="flex-1 relative min-w-0">
          {ticks.map(t => <div key={t} className="absolute left-0 right-0 border-t border-slate-100" style={{ bottom: `${t * 25}%` }} />)}
          <div className="absolute inset-0 flex items-end gap-1 px-1">
            {data.map((d, i) => (
              <div key={i} title={`${d.label}: ${d.shipment} Shipment / ${d.weight.toLocaleString('id-ID')} Kg`}
                className="flex-1 flex items-end justify-center gap-1 h-full min-w-0">
                <div className="w-full max-w-[16px] rounded-t relative" style={{ height: `${Math.max(2, (d.shipment / leftMax) * 100)}%`, backgroundColor: shipmentColor }}>
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#5A305A] whitespace-nowrap">{d.shipment}</span>
                </div>
                <div className="w-full max-w-[16px] rounded-t relative" style={{ height: `${Math.max(2, (d.weight / rightMax) * 100)}%`, backgroundColor: weightColor }}>
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#5A305A] whitespace-nowrap">{d.weight.toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-12 flex flex-col justify-between text-left pl-1 text-[10px] text-[#5A305A]/60 shrink-0">
          {ticks.map(t => <span key={t}>{Math.round(rightMax * (4 - t) / 4).toLocaleString('id-ID')}</span>)}
        </div>
      </div>
      <div className="flex mt-1">
        <div className="w-10 shrink-0" />
        <div className="flex-1 flex gap-1 px-1 min-w-0">
          {data.map((d, i) => <span key={i} className="flex-1 text-center text-[10px] font-medium text-[#5A305A] truncate min-w-0">{d.label}</span>)}
        </div>
        <div className="w-12 shrink-0" />
      </div>
    </div>
  );
}

// ─── Trend line chart (SVG polyline sederhana) ──────────────────────────────────────────────────
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
      <div className="flex justify-between text-[9px] font-semibold text-[#5A305A]/60 mt-1 px-1 flex-wrap gap-1">
        {data.map(d => <span key={d.label}>{d.label}</span>)}
      </div>
    </div>
  );
}

type ViewMode = 'PPJK' | 'ORIGIN' | 'WEIGHT';
type CompareMode = 'YOY' | 'MTM';
type DetailRow = { name: string; sums: CourierSums; shipment: number; po: number };

export default function ReportingCostByCourierPage() {
  useEffect(() => { document.title = 'Overseas Cost by Courier · BeeHive'; }, []);
  const { user } = useAuth();

  const today = new Date();
  // 6 tahun pilihan dropdown (today-3..+2) -- SATU-SATUNYA sumber "seluruh tahun" saat filter
  // Year kosong (lihat `effectiveYears` di bawah), pola sama `selectedMonths` kosong = seluruh
  // 12 bulan (2026-09, disamakan atas permintaan user -- SEBELUMNYA default `selectedYears`
  // terisi tahun berjalan & TIDAK ADA fallback "All", bikin uncheck semua tahun = data kosong
  // total karena `buildSelectedPeriods`/fetch effect/`currentRows` iterasi `selectedYears`
  // langsung, Set kosong = 0 periode).
  const yearOptions = Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('MONTHLY');
  // Multi-select Bulan+Tahun (2026-09 revisi, GANTI dari single year/month/quarter) -- pola
  // SAMA `ReportingCostPerVesselPage.tsx`. Bulan kosong = seluruh 12 bulan tahun terpilih.
  // Year kosong = SEMUA tahun di `yearOptions` (2026-09, lihat komentar `yearOptions` di atas) --
  // default sekarang kosong ("Year: All"), BUKAN tahun berjalan.
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set([today.getMonth() + 1]));
  // Dropdown Monthly/Quarterly/Yearly KHUSUS section "Trend & Performance" (2026-09 revisi,
  // dipindah dari filter bar utama) -- SENGAJA state terpisah dari `periodMode` di atas, supaya
  // ganti granularitas di sini TIDAK ikut mengubah Summary Cards/Breakdown/Cost Distribution/
  // Detail Data (semua itu tetap pakai `periodMode`/`selectedPeriods` apa adanya).
  const [trendPeriodMode, setTrendPeriodMode] = useState<PeriodMode>('MONTHLY');
  const [trendOpen, setTrendOpen] = useState(true);

  const [anOptions, setAnOptions] = useState<string[]>([]);
  const [ppjkOptions, setPpjkOptions] = useState<string[]>([]);
  const [originOptions, setOriginOptions] = useState<string[]>([]);
  const [selectedAn, setSelectedAn] = useState<Set<string>>(new Set());
  const [selectedPpjk, setSelectedPpjk] = useState<Set<string>>(new Set());
  // Item terpilih di Donut tab Origin/Weight Range (2026-09 BARU) -- MURNI mempengaruhi Donut
  // (Total tengah + grouping "Others"), TIDAK memfilter Summary Cards/Breakdown/Detail Data
  // lain (beda dari `selectedPpjk` yang MEMANG sudah jadi filter global sejak awal via dropdown
  // PPJK di filter bar -- disengaja tetap begitu, klik Donut PPJK toggle Set YANG SAMA supaya
  // dropdown & Donut selalu sinkron). Lihat `buildDonutSegments`/`donutCenterTotal` di bawah.
  const [selectedOriginDonut, setSelectedOriginDonut] = useState<Set<string>>(new Set());
  const [selectedWeightDonut, setSelectedWeightDonut] = useState<Set<string>>(new Set());
  // "Show zero-cost" (2026-09 BARU, pola sama Cost per Vessel) -- default DISEMBUNYIKAN.
  const [showZeroCost, setShowZeroCost] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('PPJK');
  const [compareMode, setCompareMode] = useState<CompareMode>('MTM');

  // Cache per tahun -- fetch SEKALI per tahun (`an` filter ikut jadi bagian cache key krn
  // mengubah HASIL query server-side), dipakai ulang tiap ganti bulan/kuartal dalam tahun yg sama.
  const [yearsData, setYearsData] = useState<Map<number, CourierRow[]>>(new Map());
  const yearsDataKeyRef = useRef<string>('');
  const [loading, setLoading] = useState(true);
  const [showExportPreview, setShowExportPreview] = useState(false);

  // ─── Persist Last State (2026-09 BARU) ──────────────────────────────────────────────────────
  // Filter/toggle/collapse/Donut-selection halaman ini disimpan ke localStorage per-user (pola
  // sama `beehive_customize_view:${user.id}:...` di SharedDataTable.tsx -- localStorage, BUKAN
  // Supabase, murni preferensi tampilan, tidak sinkron lintas device/browser, disengaja) supaya
  // auto-load balik saat logout/login, session expired, atau pindah-balik menu (remount
  // komponen). `hydrated` guard 2 arah: (1) cegah efek Save menimpa localStorage dgn state
  // DEFAULT sebelum proses Load sempat jalan; (2) Load HANYA jalan sekali per mount.
  const storageKey = user?.id ? `beehive_cost_by_courier:${user.id}` : null;
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!storageKey || hydrated) { if (!storageKey) setHydrated(true); return; }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.selectedAn)) setSelectedAn(new Set(saved.selectedAn));
        if (Array.isArray(saved.selectedYears)) setSelectedYears(new Set(saved.selectedYears));
        if (Array.isArray(saved.selectedMonths)) setSelectedMonths(new Set(saved.selectedMonths));
        if (Array.isArray(saved.selectedPpjk)) setSelectedPpjk(new Set(saved.selectedPpjk));
        if (Array.isArray(saved.selectedOriginDonut)) setSelectedOriginDonut(new Set(saved.selectedOriginDonut));
        if (Array.isArray(saved.selectedWeightDonut)) setSelectedWeightDonut(new Set(saved.selectedWeightDonut));
        if (saved.trendPeriodMode === 'MONTHLY' || saved.trendPeriodMode === 'QUARTERLY' || saved.trendPeriodMode === 'YEARLY') setTrendPeriodMode(saved.trendPeriodMode);
        if (saved.viewMode === 'PPJK' || saved.viewMode === 'ORIGIN' || saved.viewMode === 'WEIGHT') setViewMode(saved.viewMode);
        if (typeof saved.showZeroCost === 'boolean') setShowZeroCost(saved.showZeroCost);
        if (saved.compareMode === 'MTM' || saved.compareMode === 'YOY') setCompareMode(saved.compareMode);
        if (typeof saved.trendOpen === 'boolean') setTrendOpen(saved.trendOpen);
      }
    } catch { /* localStorage korup/diblokir -- diamkan, pakai default */ }
    setHydrated(true);
  }, [storageKey, hydrated]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    const payload = {
      selectedAn: Array.from(selectedAn), selectedYears: Array.from(selectedYears), selectedMonths: Array.from(selectedMonths),
      selectedPpjk: Array.from(selectedPpjk), selectedOriginDonut: Array.from(selectedOriginDonut), selectedWeightDonut: Array.from(selectedWeightDonut),
      trendPeriodMode, viewMode, showZeroCost, compareMode, trendOpen,
    };
    try { localStorage.setItem(storageKey, JSON.stringify(payload)); } catch { /* quota/private mode -- diamkan */ }
  }, [storageKey, hydrated, selectedAn, selectedYears, selectedMonths, selectedPpjk, selectedOriginDonut, selectedWeightDonut, trendPeriodMode, viewMode, showZeroCost, compareMode, trendOpen]);

  // Tahun EFEKTIF utk semua komputasi (fetch/agregasi) -- `selectedYears` mentah (bisa kosong)
  // TETAP dipakai APA ADANYA di kontrol UI filter (supaya MultiSelect tampil "Year: All" saat
  // kosong, lihat `emptyMeansAll`), TIDAK PERNAH di sini.
  const effectiveYears = useMemo(() => selectedYears.size > 0 ? selectedYears : new Set(yearOptions), [selectedYears]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchDistinctAn().then(setAnOptions).catch(() => {});
    fetchDistinctPpjk().then(setPpjkOptions).catch(() => {});
    fetchDistinctOrigin().then(setOriginOptions).catch(() => {});
  }, []);

  const selectedPeriods: YearMonth[] = useMemo(() => buildSelectedPeriods(effectiveYears, selectedMonths), [effectiveYears, selectedMonths]);
  const earliestPeriod = useMemo(() => {
    if (selectedPeriods.length === 0) return { year: today.getFullYear(), month: today.getMonth() + 1 };
    return selectedPeriods.reduce((a, b) => (a.year * 100 + a.month) <= (b.year * 100 + b.month) ? a : b);
  }, [selectedPeriods]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevAnchor = useMemo(
    () => previousPeriod(periodMode, earliestPeriod.year, earliestPeriod.month, quarterOfMonth(earliestPeriod.month)),
    [periodMode, earliestPeriod]
  );

  // Fetch tahun yg dibutuhkan (semua tahun terpilih + tahun anchor periode sebelumnya) -- cache
  // key gabungan tahun+filter PT supaya refetch benar saat filter PT berubah.
  useEffect(() => {
    const neededYears = Array.from(new Set([...Array.from(effectiveYears), prevAnchor.year]));
    const cacheKey = `${neededYears.sort().join(',')}|${Array.from(selectedAn).sort().join(',')}`;
    if (cacheKey === yearsDataKeyRef.current) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    Promise.all(neededYears.map(y => fetchCourierYear(y, selectedAn))).then(results => {
      if (!active) return;
      const map = new Map<number, CourierRow[]>();
      neededYears.forEach((y, i) => map.set(y, results[i]));
      setYearsData(map);
      yearsDataKeyRef.current = cacheKey;
      setLoading(false);
    }).catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [effectiveYears, prevAnchor.year, selectedAn]);

  const currentRows = useMemo(() => {
    const keySet = new Set(selectedPeriods.map(p => `${p.year}-${String(p.month).padStart(2, '0')}`));
    const out: CourierRow[] = [];
    effectiveYears.forEach(y => (yearsData.get(y) || []).forEach(r => { const mk = monthKeyOf(r); if (mk && keySet.has(mk)) out.push(r); }));
    return out;
  }, [yearsData, effectiveYears, selectedPeriods]);

  const previousRows = useMemo(() => {
    const range = periodRange(periodMode, prevAnchor.year, prevAnchor.month, prevAnchor.quarter);
    const rows = yearsData.get(prevAnchor.year) || [];
    return rows.filter(r => r.tgl_terima_email && r.tgl_terima_email >= range.start && r.tgl_terima_email <= range.end);
  }, [yearsData, prevAnchor, periodMode]);

  const currentRowsSelected = useMemo(
    () => selectedPpjk.size === 0 ? currentRows : currentRows.filter(r => selectedPpjk.has(normalizePpjk(r.ppjk))),
    [currentRows, selectedPpjk]
  );
  const previousRowsSelected = useMemo(
    () => selectedPpjk.size === 0 ? previousRows : previousRows.filter(r => selectedPpjk.has(normalizePpjk(r.ppjk))),
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

  // ─── Donut PPJK/Origin/Weight Range -- item terpilih di posisi ASLI + "Others" gabungan
  // (2026-09 revisi, generik lewat `buildDonutSegments`/`donutCenterTotal`, lihat komentarnya) ──
  const ppjkTotalsAll = useMemo(() => {
    const map = new Map<string, number>();
    currentRows.forEach(r => { const k = normalizePpjk(r.ppjk) || 'Unknown'; map.set(k, (map.get(k) || 0) + Number(r.total_amount || 0)); });
    return map;
  }, [currentRows]);
  const ppjkEntriesAll = useMemo((): [string, number][] => Array.from(ppjkTotalsAll.entries()), [ppjkTotalsAll]);
  const donutSegments = useMemo(() => buildDonutSegments(ppjkEntriesAll, selectedPpjk, showZeroCost), [ppjkEntriesAll, selectedPpjk, showZeroCost]);
  const ppjkDonutTotal = useMemo(() => donutCenterTotal(ppjkEntriesAll, selectedPpjk), [ppjkEntriesAll, selectedPpjk]);

  // `periodColumns` (ikut `periodMode` filter UTAMA, BUKAN `trendPeriodMode`) -- dipakai HANYA
  // utk label rentang periode aktif (`activePeriodLabel`, judul Breakdown/nama file export),
  // TIDAK terkait section "Trend & Performance" di bawah.
  const periodColumns: PeriodColumn[] = useMemo(() => buildPeriodColumns(selectedPeriods, periodMode), [selectedPeriods, periodMode]);

  // ─── Kolom periode (Trend & Data Performance, SATU sumber) -- ikut `trendPeriodMode` KHUSUS
  // section "Trend & Performance" (2026-09 revisi, TERPISAH dari `periodMode` filter utama) ─────
  const trendPeriodColumns: PeriodColumn[] = useMemo(() => buildPeriodColumns(selectedPeriods, trendPeriodMode), [selectedPeriods, trendPeriodMode]);
  const trendPeriodColumnRows = useMemo(() => trendPeriodColumns.map(col => {
    const rowsAll = rowsInMonthKeys(currentRows, col.monthKeys);
    const rows = selectedPpjk.size === 0 ? rowsAll : rowsAll.filter(r => selectedPpjk.has(normalizePpjk(r.ppjk)));
    const sums = zeroCourierSums();
    rows.forEach(r => addCourierSums(sums, r));
    return {
      label: col.label, shipment: distinctAwbCount(rows), weight: distinctWeightTotal(rows),
      totalCost: sums.totalCost, freight: sums.freight, courierAdm: sums.courierAdm, bm: sums.bm, ppnPph: sums.ppn + sums.pph,
    };
  }), [trendPeriodColumns, currentRows, selectedPpjk]);

  const trendData = useMemo(() => trendPeriodColumnRows.map(c => ({ label: c.label, value: c.totalCost })), [trendPeriodColumnRows]);

  // ─── Data Performance (digabung ke section "Trend & Performance" tab By PPJK -- 2026-09 revisi:
  // GANTI dari fetch N-periode terpisah + tombol MTM/QTQ/YoY internal, SEKARANG reuse
  // `trendPeriodColumnRows` yang sama dgn Trend chart, 8 baris metrik) ──────────────────────────
  const perfTotalShipment = awbNow, perfTotalWeight = weightNow;
  const perfTotalFreight = sumsSelected.freight, perfTotalCourierAdm = sumsSelected.courierAdm, perfTotalBm = sumsSelected.bm, perfTotalPpnPph = sumsSelected.ppn + sumsSelected.pph;

  // ─── By PPJK detail ──────────────────────────────────────────────────────
  const byPpjkDetail: DetailRow[] = useMemo(() => {
    const universeList = showZeroCost ? (selectedPpjk.size > 0 ? Array.from(selectedPpjk) : ppjkOptions) : null;
    const map = new Map<string, { sums: CourierSums; rows: CourierRow[] }>();
    if (universeList) universeList.forEach(p => map.set(p, { sums: zeroCourierSums(), rows: [] }));
    currentRows.forEach(r => {
      const k = normalizePpjk(r.ppjk) || 'Unknown';
      if (selectedPpjk.size > 0 && !selectedPpjk.has(k)) return;
      if (!map.has(k)) map.set(k, { sums: zeroCourierSums(), rows: [] });
      const g = map.get(k)!;
      addCourierSums(g.sums, r);
      g.rows.push(r);
    });
    let arr = Array.from(map.entries()).map(([name, g]) => ({ name, sums: g.sums, shipment: distinctAwbCount(g.rows), po: distinctPoCount(g.rows) }));
    if (!showZeroCost) arr = arr.filter(d => d.sums.totalCost !== 0 || d.shipment > 0);
    return arr.sort((a, b) => b.sums.totalCost - a.sums.totalCost);
  }, [currentRows, selectedPpjk, showZeroCost, ppjkOptions]);

  // ─── By Origin detail ──────────────────────────────────────────────────────
  const byOriginDetail: DetailRow[] = useMemo(() => {
    const map = new Map<string, { sums: CourierSums; rows: CourierRow[] }>();
    if (showZeroCost) originOptions.forEach(o => map.set(o, { sums: zeroCourierSums(), rows: [] }));
    currentRowsSelected.forEach(r => {
      const k = (r.origin || 'Unknown').trim() || 'Unknown';
      if (!map.has(k)) map.set(k, { sums: zeroCourierSums(), rows: [] });
      const g = map.get(k)!;
      addCourierSums(g.sums, r);
      g.rows.push(r);
    });
    let arr = Array.from(map.entries()).map(([name, g]) => ({ name, sums: g.sums, shipment: distinctAwbCount(g.rows), po: distinctPoCount(g.rows) }));
    if (!showZeroCost) arr = arr.filter(d => d.sums.totalCost !== 0 || d.shipment > 0);
    return arr.sort((a, b) => b.sums.totalCost - a.sums.totalCost);
  }, [currentRowsSelected, showZeroCost, originOptions]);
  const originEntriesAll = useMemo((): [string, number][] => byOriginDetail.map(d => [d.name, d.sums.totalCost]), [byOriginDetail]);
  const originDonutSegments = useMemo(() => buildDonutSegments(originEntriesAll, selectedOriginDonut, showZeroCost), [originEntriesAll, selectedOriginDonut, showZeroCost]);
  const originDonutTotal = useMemo(() => donutCenterTotal(originEntriesAll, selectedOriginDonut), [originEntriesAll, selectedOriginDonut]);

  // ─── By Weight Range ─────────────────────────────────────────────────────
  const weightBucketsFull = useMemo((): (DetailRow & { weight: number })[] => {
    const wmap = distinctWeightMap(currentRowsSelected);
    const bucketOf = new Map<string, string>();
    wmap.forEach((w, awb) => bucketOf.set(awb, weightRangeLabel(w)));
    const out = new Map<string, { sums: CourierSums; rows: CourierRow[]; weight: number }>();
    WEIGHT_RANGES.forEach(rg => out.set(rg.label, { sums: zeroCourierSums(), rows: [], weight: 0 }));
    const seenAwbPerBucket = new Map<string, Set<string>>();
    WEIGHT_RANGES.forEach(rg => seenAwbPerBucket.set(rg.label, new Set()));
    currentRowsSelected.forEach(r => {
      const key = stripAwbCarrier(r.awb);
      const label = bucketOf.get(key);
      if (!label) return;
      const g = out.get(label)!;
      addCourierSums(g.sums, r);
      g.rows.push(r);
      const seen = seenAwbPerBucket.get(label)!;
      if (!seen.has(key)) { seen.add(key); g.weight += wmap.get(key) || 0; }
    });
    return WEIGHT_RANGES.map(rg => {
      const g = out.get(rg.label)!;
      // `name` (BUKAN `label`) -- WAJIB sama persis field `DetailRow.name` (dipakai `DetailTable`
      // generik By PPJK/Origin/Weight Range) supaya kolom "Weight Range" di Detail Data terisi.
      // Bug ditemukan & diperbaiki (2026-09): field ini sempat bernama `label`, bikin baris Detail
      // Data (By Weight Range) tampil KOSONG di kolom nama walau data lain (Freight dst) tetap
      // terisi -- TypeScript TIDAK menangkap ini krn `weightBuckets` tidak diberi anotasi tipe
      // eksplisit `DetailRow[]` di titik deklarasinya (baru di-cek longgar saat dipakai belakangan).
      return { name: rg.label, sums: g.sums, shipment: distinctAwbCount(g.rows), po: distinctPoCount(g.rows), weight: g.weight };
    });
  }, [currentRowsSelected]);
  const weightBuckets = useMemo(
    () => showZeroCost ? weightBucketsFull : weightBucketsFull.filter(b => b.sums.totalCost !== 0 || b.shipment > 0),
    [weightBucketsFull, showZeroCost]
  );
  // entriesAll dari `weightBucketsFull` (SEMUA 5 rentang, BUKAN `weightBuckets` yang sudah
  // difilter Show zero-cost) -- Total "All" di tengah donut tetap grand total SELURUH rentang
  // berat terlepas toggle Show zero-cost (sama semantik `sumsAll.totalCost` PPJK), sementara
  // slice mana yang TAMPIL tetap ikut `showZeroCost` lewat `buildDonutSegments`.
  const weightEntriesAll = useMemo((): [string, number][] => weightBucketsFull.map(b => [b.name, b.sums.totalCost]), [weightBucketsFull]);
  const weightDonutSegments = useMemo(() => buildDonutSegments(weightEntriesAll, selectedWeightDonut, showZeroCost), [weightEntriesAll, selectedWeightDonut, showZeroCost]);
  const weightDonutTotal = useMemo(() => donutCenterTotal(weightEntriesAll, selectedWeightDonut), [weightEntriesAll, selectedWeightDonut]);
  const highestRangeBucket = useMemo(
    () => weightBucketsFull.reduce((best, b) => (b.shipment > (best?.shipment ?? -1) ? b : best), null as null | typeof weightBucketsFull[number]),
    [weightBucketsFull]
  );

  // ─── Conclusion ──────────────────────────────────────────────────────────
  const conclusionCompareLabel = compareMode === 'YOY' ? `${earliestPeriod.year - 1}` : comparePeriodLabel;
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

  const activePeriodLabel = periodColumns.length === 1 ? periodColumns[0].label : `${periodColumns[0]?.label || ''} – ${periodColumns[periodColumns.length - 1]?.label || ''}`;

  const activeDetailTitle = viewMode === 'PPJK' ? 'Detail Data (By PPJK)' : viewMode === 'ORIGIN' ? 'Detail Data (By Origin)' : 'Detail Data (By Weight Range)';
  const activeDetailNameLabel = viewMode === 'PPJK' ? 'PPJK' : viewMode === 'ORIGIN' ? 'Origin' : 'Weight Range';
  const activeDetailRows: DetailRow[] = viewMode === 'PPJK' ? byPpjkDetail : viewMode === 'ORIGIN' ? byOriginDetail : weightBuckets;

  // Export Excel -- SAMA PERSIS tampilan (nominal sbg teks terformat, BUKAN angka mentah),
  // header berwarna brand `FF5A305A` + teks putih tebal, MENCAKUP semua tabel termasuk Data
  // Performance (2026-09 revisi -- sebelumnya Data Performance belum ikut export).
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Overseas Cost by Courier');
    const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A305A' } };
    const styleHeaderRow = (row: ExcelJS.Row) => { row.eachCell(c => { c.fill = HEADER_FILL; c.font = { color: { argb: 'FFFFFFFF' }, bold: true }; }); };

    const titleRow = ws.addRow(['Overseas Cost by Courier']);
    titleRow.font = { bold: true, size: 14, color: { argb: 'FF5A305A' } };
    ws.addRow([`Period: ${activePeriodLabel}`, `PT: ${selectedAn.size ? Array.from(selectedAn).join(', ') : 'All'}`, `PPJK: ${selectedPpjk.size ? Array.from(selectedPpjk).join(', ') : 'All'}`]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow(['Summary', 'Value']));
    ws.addRow([`Total Cost${ppjkSuffix}`, fmtIdr(sumsSelected.totalCost)]);
    ws.addRow(['Freight+Courier Adm+BM', fmtIdr(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm)]);
    ws.addRow(['Total Weight (distinct)', `${weightNow.toLocaleString('id-ID')} kg`]);
    ws.addRow(['Shipment / PO (distinct)', `${awbNow} shipment / ${poNow} PO`]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow(['Component', 'Value', `vs ${comparePeriodLabel}`]));
    const compRows: [string, number, number][] = [
      ['Freight', sumsSelected.freight, sumsPrevSelected.freight],
      ['Courier Adm Fee', sumsSelected.courierAdm, sumsPrevSelected.courierAdm],
      ['BM', sumsSelected.bm, sumsPrevSelected.bm],
      ['PPN', sumsSelected.ppn, sumsPrevSelected.ppn],
      ['PPH', sumsSelected.pph, sumsPrevSelected.pph],
    ];
    compRows.forEach(([label, v, pv]) => ws.addRow([label, fmtIdr(v), `${pctOf(v, pv) >= 0 ? '▲' : '▼'} ${Math.abs(pctOf(v, pv)).toFixed(1)}% (${fmtIdr(pv)})`]));
    ws.addRow(['Total Cost', fmtIdr(sumsSelected.totalCost)]);
    ws.addRow(['Excl PPN+PPH', fmtIdr(exclPpnPph(sumsSelected))]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow(['Data Performance']));
    styleHeaderRow(ws.addRow(['Metric', ...trendPeriodColumnRows.map(c => c.label), 'Total']));
    ws.addRow(['Shipment Growth %', ...trendPeriodColumnRows.map((c, i) => i === 0 ? '—' : `${pctOf(c.shipment, trendPeriodColumnRows[i - 1].shipment).toFixed(1)}%`), '—']);
    ws.addRow(['Weight Growth %', ...trendPeriodColumnRows.map((c, i) => i === 0 ? '—' : `${pctOf(c.weight, trendPeriodColumnRows[i - 1].weight).toFixed(1)}%`), '—']);
    ws.addRow(['Total Shipment (AWB)', ...trendPeriodColumnRows.map(c => c.shipment), perfTotalShipment]);
    ws.addRow(['Total Weight (kg)', ...trendPeriodColumnRows.map(c => c.weight.toLocaleString('id-ID')), perfTotalWeight.toLocaleString('id-ID')]);
    ws.addRow(['Total Freight', ...trendPeriodColumnRows.map(c => fmtIdr(c.freight)), fmtIdr(perfTotalFreight)]);
    ws.addRow(['Total Courier Adm Fee', ...trendPeriodColumnRows.map(c => fmtIdr(c.courierAdm)), fmtIdr(perfTotalCourierAdm)]);
    ws.addRow(['Total BM', ...trendPeriodColumnRows.map(c => fmtIdr(c.bm)), fmtIdr(perfTotalBm)]);
    ws.addRow(['Total PPN+PPH', ...trendPeriodColumnRows.map(c => fmtIdr(c.ppnPph)), fmtIdr(perfTotalPpnPph)]);
    ws.addRow([]);

    styleHeaderRow(ws.addRow([activeDetailTitle]));
    styleHeaderRow(ws.addRow(['No', activeDetailNameLabel, 'Freight', 'Courier Adm Fee', 'BM', 'PPN', 'PPH', 'Total Cost', 'Total Excl. PPN+PPH', 'Shipment', 'PO']));
    activeDetailRows.forEach((r, i) => {
      ws.addRow([i + 1, r.name, fmtIdr(r.sums.freight), fmtIdr(r.sums.courierAdm), fmtIdr(r.sums.bm), fmtIdr(r.sums.ppn), fmtIdr(r.sums.pph), fmtIdr(r.sums.totalCost), fmtIdr(exclPpnPph(r.sums)), String(r.shipment), String(r.po)]);
    });

    ws.columns.forEach(col => { col.width = 20; });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `overseas-cost-by-courier-${activePeriodLabel.replace(/\s+/g, '-')}.xlsx`;
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
            <MultiSelect label="PT" options={anOptions.map(a => ({ value: a, text: a }))} selected={selectedAn} onChange={setSelectedAn} />
            <MultiSelect label="Year" options={yearOptions.map(y => ({ value: String(y), text: String(y) }))}
              selected={new Set(Array.from(selectedYears).map(String))} onChange={s => setSelectedYears(new Set(Array.from(s).map(Number)))} emptyMeansAll />
            <MultiSelect label="Month" options={MONTH_ABBR.map((m, i) => ({ value: String(i + 1), text: m }))}
              selected={new Set(Array.from(selectedMonths).map(String))} onChange={s => setSelectedMonths(new Set(Array.from(s).map(Number)))} emptyMeansAll />
            <MultiSelect label="PPJK" options={ppjkOptions.map(p => ({ value: p, text: p }))} selected={selectedPpjk} onChange={setSelectedPpjk} />
            <label className="flex items-center gap-1.5 text-xs text-[#5A305A] font-medium whitespace-nowrap cursor-pointer shrink-0">
              <input type="checkbox" checked={showZeroCost} onChange={e => setShowZeroCost(e.target.checked)} className="w-3.5 h-3.5 accent-[#5A305A]" />
              Show zero-cost
            </label>
            <button onClick={() => setShowExportPreview(true)} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 whitespace-nowrap">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState fullHeight={false} />
        ) : (
          <div className="space-y-3">
            {/* A. 4 kartu ringkasan */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
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
                value={`${awbNow} shipment / ${poNow} PO`}
              />
              {highestRangeBucket && (
                <SummaryCard
                  label="Highest Range (Shipment)"
                  value={highestRangeBucket.name}
                  sub={`${highestRangeBucket.shipment} shipment / ${highestRangeBucket.weight.toLocaleString('id-ID')} kg`}
                />
              )}
            </div>

            {/* B. Breakdown Komponen Biaya (kiri) + Cost Distribution (kanan) -- 2026-09 revisi,
                GANTI dari sub-toggle 3 tombol PPJK/Origin/Weight Range di baris sendiri: dropdown
                "Group by" sekarang di header panel Cost Distribution, HANYA mengganti Donut+Bar
                chart & Detail Data di bawah -- Summary Cards/Breakdown/Trend&Performance TIDAK
                ikut berubah. */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 xl:col-span-2">
                <p className="text-sm font-bold text-[#5A305A] mb-2">Breakdown Komponen Biaya{ppjkSuffix} ({activePeriodLabel})</p>
                <div>
                  <ComponentLine label="Freight" value={sumsSelected.freight} prevValue={sumsPrevSelected.freight} compareLabel={comparePeriodLabel} />
                  <ComponentLine label="Courier Adm Fee" value={sumsSelected.courierAdm} prevValue={sumsPrevSelected.courierAdm} compareLabel={comparePeriodLabel} />
                  <ComponentLine label="BM" value={sumsSelected.bm} prevValue={sumsPrevSelected.bm} compareLabel={comparePeriodLabel} />
                  <ComponentLine label="PPN" value={sumsSelected.ppn} prevValue={sumsPrevSelected.ppn} compareLabel={comparePeriodLabel} />
                  <ComponentLine label="PPH" value={sumsSelected.pph} prevValue={sumsPrevSelected.pph} compareLabel={comparePeriodLabel} />
                </div>
                <p className="text-xs text-[#5A305A] mt-3 pt-3 border-t border-slate-100">
                  Total Cost: <span className="font-bold">{fmtIdr(sumsSelected.totalCost)}</span> · Excl PPN+PPH: <span className="font-bold">{fmtIdr(exclPpnPph(sumsSelected))}</span>
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 xl:col-span-3">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <p className="text-sm font-bold text-[#5A305A]">Cost Distribution</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5A305A]/60 font-medium whitespace-nowrap">Group by:</span>
                    <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
                      <option value="PPJK">PPJK</option>
                      <option value="ORIGIN">Origin</option>
                      <option value="WEIGHT">Weight Range</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-[#5A305A]/60 uppercase mb-2">Cost Distribution by {activeDetailNameLabel}</p>
                    {viewMode === 'PPJK' && (donutSegments.length === 0
                      ? <p className="text-xs text-slate-400 italic">No data.</p>
                      : <Donut segments={donutSegments} centerLabel="Total" centerValue={fmtIdr(ppjkDonutTotal)} onToggle={label => setSelectedPpjk(prev => toggleInSet(prev, label))} />)}
                    {viewMode === 'ORIGIN' && (originDonutSegments.length === 0
                      ? <p className="text-xs text-slate-400 italic">No data.</p>
                      : <Donut segments={originDonutSegments} centerLabel="Total" centerValue={fmtIdr(originDonutTotal)} onToggle={label => setSelectedOriginDonut(prev => toggleInSet(prev, label))} />)}
                    {viewMode === 'WEIGHT' && (weightDonutSegments.length === 0
                      ? <p className="text-xs text-slate-400 italic">No data.</p>
                      : <Donut segments={weightDonutSegments} centerLabel="Total" centerValue={fmtIdr(weightDonutTotal)} onToggle={label => setSelectedWeightDonut(prev => toggleInSet(prev, label))} />)}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[#5A305A]/60 uppercase mb-2">
                      {viewMode === 'WEIGHT' ? 'Shipment & Weight' : `Total Cost by ${activeDetailNameLabel}`}
                    </p>
                    {viewMode === 'PPJK' && (byPpjkDetail.length === 0
                      ? <p className="text-xs text-slate-400 italic">No data.</p>
                      : <HBar data={byPpjkDetail.map(d => ({ label: d.name, value: d.sums.totalCost }))} color={ACCENT} />)}
                    {viewMode === 'ORIGIN' && (byOriginDetail.length === 0
                      ? <p className="text-xs text-slate-400 italic">No data.</p>
                      : <HBar data={byOriginDetail.map(d => ({ label: d.name, value: d.sums.totalCost }))} color={ACCENT} />)}
                    {viewMode === 'WEIGHT' && (
                      <ShipmentWeightBar data={weightBuckets.map(b => ({ label: b.name, shipment: b.shipment, weight: b.weight }))} shipmentColor="#73507B" weightColor={ACCENT} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Data -- ikut `viewMode`/dropdown "Group by" panel Cost Distribution di atas */}
            <DetailTable title={activeDetailTitle} nameLabel={activeDetailNameLabel} rows={activeDetailRows} />
            {viewMode === 'PPJK' && (
              <ConclusionBox
                title="By PPJK"
                compareMode={compareMode} setCompareMode={setCompareMode}
                compareLabel={conclusionCompareLabel}
                text={`Total cost${ppjkSuffix} ${pctChangeTotal >= 0 ? 'naik' : 'turun'} ${Math.abs(pctChangeTotal).toFixed(1)}% (${fmtIdrSigned(sumsSelected.totalCost - sumsPrevSelected.totalCost)}) dibanding ${comparePeriodLabel}${selectedPpjk.size > 0 ? `, menyumbang ${pctSelectedOfAll.toFixed(1)}% dari seluruh biaya PPJK` : ''}. ${awbNow} shipment / ${poNow} PO distinct. Komponen terbesar: ${topComponent.label} (${fmtIdr(topComponent.value)}).`}
              />
            )}
            {viewMode === 'ORIGIN' && (
              <ConclusionBox
                title="By Origin"
                compareMode={compareMode} setCompareMode={setCompareMode}
                compareLabel={conclusionCompareLabel}
                text={`Origin terbesar: ${byOriginDetail[0]?.name || '-'} (${fmtIdr(byOriginDetail[0]?.sums.totalCost || 0)}, ${sumsSelected.totalCost > 0 ? ((byOriginDetail[0]?.sums.totalCost || 0) / sumsSelected.totalCost * 100).toFixed(1) : 0}% dari total${ppjkSuffix}). Total ${byOriginDetail.length} origin tercatat pada periode ini.`}
              />
            )}
            {viewMode === 'WEIGHT' && (
              <ConclusionBox
                title="By Weight Range"
                compareMode={compareMode} setCompareMode={setCompareMode}
                compareLabel={conclusionCompareLabel}
                text={`Rentang berat dominan: ${highestRangeBucket?.name || '-'} (${highestRangeBucket?.shipment || 0} shipment). Total cost seluruh rentang berat: ${fmtIdr(weightBucketsFull.reduce((a, b) => a + b.sums.totalCost, 0))}.`}
              />
            )}

            {/* C. Trend & Performance -- panel gabungan (2026-09 revisi, GANTI dari 2 blok
                terpisah: Trend Cost dulu di grid PPJK, Data Performance dulu selalu tampil di
                luar tab). DIPINDAH keluar dari tab By PPJK -- SEKARANG SELALU tampil di sini,
                TIDAK terkait sub-toggle PPJK/Origin/Weight Range di bawah sama sekali. Dropdown
                Monthly/Quarterly/Yearly di sini KHUSUS panel ini (`trendPeriodMode`), TIDAK
                mengubah Summary Cards/Breakdown/Cost Distribution/Detail Data. */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-hidden">
              <button onClick={() => setTrendOpen(o => !o)} className="flex items-center justify-between w-full gap-3">
                <span className="flex items-center gap-1.5 text-sm font-bold text-[#5A305A]">
                  <ChevronDown size={16} className={`transition-transform ${trendOpen ? '' : '-rotate-90'}`} />
                  Trend & Performance{ppjkSuffix}
                </span>
                <select value={trendPeriodMode} onClick={e => e.stopPropagation()} onChange={e => setTrendPeriodMode(e.target.value as PeriodMode)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5A305A]">
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </button>
              {trendOpen && (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-[#5A305A]/70 uppercase mb-2">Trend Cost</p>
                    <TrendLine data={trendData} color={ACCENT} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#5A305A]/70 uppercase mb-2">Data Performance</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[10px] text-[#5A305A]/70 uppercase border-b border-slate-200">
                            <th className="text-left px-2 py-2 whitespace-nowrap">Metric</th>
                            {trendPeriodColumnRows.map(c => <th key={c.label} className="text-right px-2 py-2 whitespace-nowrap">{c.label}</th>)}
                            <th className="text-right px-2 py-2 whitespace-nowrap font-bold">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <PerfRow label="Shipment Growth %" values={trendPeriodColumnRows.map((c, i) => i === 0 ? null : pctOf(c.shipment, trendPeriodColumnRows[i - 1].shipment))} isPct total={null} />
                          <PerfRow label="Weight Growth %" values={trendPeriodColumnRows.map((c, i) => i === 0 ? null : pctOf(c.weight, trendPeriodColumnRows[i - 1].weight))} isPct total={null} />
                          <PerfRow label="Total Shipment (AWB)" values={trendPeriodColumnRows.map(c => c.shipment)} total={perfTotalShipment} />
                          <PerfRow label="Total Weight (kg)" values={trendPeriodColumnRows.map(c => c.weight)} total={perfTotalWeight} />
                          <PerfRow label="Total Freight" values={trendPeriodColumnRows.map(c => c.freight)} total={perfTotalFreight} isMoney />
                          <PerfRow label="Total Courier Adm Fee" values={trendPeriodColumnRows.map(c => c.courierAdm)} total={perfTotalCourierAdm} isMoney />
                          <PerfRow label="Total BM" values={trendPeriodColumnRows.map(c => c.bm)} total={perfTotalBm} isMoney />
                          <PerfRow label="Total PPN+PPH" values={trendPeriodColumnRows.map(c => c.ppnPph)} total={perfTotalPpnPph} isMoney />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
                Period: <b>{activePeriodLabel}</b> · PT: <b>{selectedAn.size ? Array.from(selectedAn).join(', ') : 'All'}</b> · PPJK: <b>{selectedPpjk.size ? Array.from(selectedPpjk).join(', ') : 'All'}</b> · View: <b>{viewMode === 'PPJK' ? 'By PPJK' : viewMode === 'ORIGIN' ? 'By Origin' : 'By Weight Range'}</b>
              </p>

              <PreviewTable title="Summary" rows={[
                [`Total Cost${ppjkSuffix}`, fmtIdr(sumsSelected.totalCost)],
                ['Freight+Courier Adm+BM', fmtIdr(sumsSelected.freight + sumsSelected.courierAdm + sumsSelected.bm)],
                ['Total Weight (distinct)', `${weightNow.toLocaleString('id-ID')} kg`],
                ['Shipment / PO (distinct)', `${awbNow} shipment / ${poNow} PO`],
              ]} />

              <PreviewTable title="Component" rows={[
                ['Freight', fmtIdr(sumsSelected.freight)],
                ['Courier Adm Fee', fmtIdr(sumsSelected.courierAdm)],
                ['BM', fmtIdr(sumsSelected.bm)],
                ['PPN', fmtIdr(sumsSelected.ppn)],
                ['PPH', fmtIdr(sumsSelected.pph)],
                ['Total Cost', fmtIdr(sumsSelected.totalCost)],
                ['Excl PPN+PPH', fmtIdr(exclPpnPph(sumsSelected))],
              ]} />

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="px-2 py-1.5 font-bold text-white text-[11px]" style={{ backgroundColor: '#5A305A' }}>Data Performance</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ backgroundColor: '#5A305A' }} className="text-white">
                        <th className="text-left px-2 py-1.5">Metric</th>
                        {trendPeriodColumnRows.map(c => <th key={c.label} className="text-right px-2 py-1.5 whitespace-nowrap">{c.label}</th>)}
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[#5A305A]">
                      <tr><td className="px-2 py-1.5">Total Shipment (AWB)</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{c.shipment}</td>)}<td className="px-2 py-1.5 text-right font-mono">{perfTotalShipment}</td></tr>
                      <tr><td className="px-2 py-1.5">Total Weight (kg)</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{c.weight.toLocaleString('id-ID')}</td>)}<td className="px-2 py-1.5 text-right font-mono">{perfTotalWeight.toLocaleString('id-ID')}</td></tr>
                      <tr><td className="px-2 py-1.5">Total Freight</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{fmtIdr(c.freight)}</td>)}<td className="px-2 py-1.5 text-right font-mono">{fmtIdr(perfTotalFreight)}</td></tr>
                      <tr><td className="px-2 py-1.5">Total Courier Adm Fee</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{fmtIdr(c.courierAdm)}</td>)}<td className="px-2 py-1.5 text-right font-mono">{fmtIdr(perfTotalCourierAdm)}</td></tr>
                      <tr><td className="px-2 py-1.5">Total BM</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{fmtIdr(c.bm)}</td>)}<td className="px-2 py-1.5 text-right font-mono">{fmtIdr(perfTotalBm)}</td></tr>
                      <tr><td className="px-2 py-1.5">Total PPN+PPH</td>{trendPeriodColumnRows.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{fmtIdr(c.ppnPph)}</td>)}<td className="px-2 py-1.5 text-right font-mono">{fmtIdr(perfTotalPpnPph)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="px-2 py-1.5 font-bold text-white text-[11px]" style={{ backgroundColor: '#5A305A' }}>{activeDetailTitle}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ backgroundColor: '#5A305A' }} className="text-white">
                        <th className="text-left px-2 py-1.5">No</th>
                        <th className="text-left px-2 py-1.5 whitespace-nowrap">{activeDetailNameLabel}</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Freight</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Courier Adm Fee</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">BM</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">PPN</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">PPH</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Total Cost</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Total Excl. PPN+PPH</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">Shipment</th>
                        <th className="text-right px-2 py-1.5 whitespace-nowrap">PO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeDetailRows.length === 0 && (
                        <tr><td colSpan={11} className="text-center py-4 text-slate-400 italic">No data.</td></tr>
                      )}
                      {activeDetailRows.slice(0, 15).map((r, i) => (
                        <tr key={r.name} className="text-[#5A305A]">
                          <td className="px-2 py-1.5">{i + 1}</td>
                          <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.freight)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.courierAdm)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.bm)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.ppn)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.pph)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.totalCost)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(exclPpnPph(r.sums))}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.shipment}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.po}</td>
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

function PreviewTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-[11px]">
        <thead><tr style={{ backgroundColor: '#5A305A' }}><th colSpan={2} className="text-left px-2 py-1.5 text-white font-bold">{title}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <tr key={k}><td className="px-2 py-1.5 text-[#5A305A]">{k}</td><td className="px-2 py-1.5 text-right font-mono text-[#5A305A]">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Detail table -- kolom SERAGAM utk By PPJK/Origin/Weight Range (2026-09 revisi):
// Freight | Courier Adm Fee | BM | PPN | PPH | Total Cost | Total Excl. PPN+PPH | Shipment | PO
function DetailTable({ title, nameLabel, rows, bare }: { title?: string; nameLabel: string; rows: DetailRow[]; bare?: boolean }) {
  const totalSums = zeroCourierSums();
  let totalShipment = 0, totalPo = 0;
  rows.forEach(r => {
    totalSums.totalCost += r.sums.totalCost; totalSums.freight += r.sums.freight; totalSums.courierAdm += r.sums.courierAdm;
    totalSums.bm += r.sums.bm; totalSums.ppn += r.sums.ppn; totalSums.pph += r.sums.pph;
    totalShipment += r.shipment; totalPo += r.po;
  });
  return (
    <div className={bare ? '' : 'bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-hidden'}>
      {title && <p className="text-sm font-bold text-[#5A305A] mb-3">{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] text-[#5A305A]/70 uppercase border-b border-slate-200">
              <th className="text-left px-2 py-2">No</th>
              <th className="text-left px-2 py-2 whitespace-nowrap">{nameLabel}</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Freight</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Courier Adm Fee</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">BM</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">PPN</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">PPH</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Total Cost</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Total Excl. PPN+PPH</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">Shipment</th>
              <th className="text-right px-2 py-2 whitespace-nowrap">PO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="text-center py-6 text-slate-400 italic">No data.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.name} className="text-[#5A305A]">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.freight)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.courierAdm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.bm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.ppn)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.pph)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(r.sums.totalCost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(exclPpnPph(r.sums))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.shipment}</td>
                <td className="px-2 py-1.5 text-right font-mono">{r.po}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-bold text-[#5A305A] bg-slate-50">
                <td className="px-2 py-1.5" colSpan={2}>Total</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.freight)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.courierAdm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.bm)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.ppn)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.pph)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(totalSums.totalCost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtIdr(exclPpnPph(totalSums))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{totalShipment}</td>
                <td className="px-2 py-1.5 text-right font-mono">{totalPo}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfRow({ label, values, total, isPct, isMoney }: {
  label: string; values: (number | null)[]; total: number | null; isPct?: boolean; isMoney?: boolean;
}) {
  const fmt = (v: number | null) => {
    if (v === null) return '—';
    if (isPct) return `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%`;
    if (isMoney) return fmtIdr(v);
    return v.toLocaleString('id-ID');
  };
  return (
    <tr className="text-[#5A305A]">
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
