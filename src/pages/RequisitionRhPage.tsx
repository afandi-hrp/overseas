import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import DOMPurify from 'dompurify';
import {
  Anchor, BrainCircuit, CalendarDays, ChevronRight, ClipboardCheck, Cog, FileDown,
  Layers, OctagonX, Printer, RotateCcw, ScanSearch, ShieldCheck, TriangleAlert, UploadCloud, Zap,
} from 'lucide-react';
import Greeting from '../components/Greeting';
import SingleFileDrop from '../components/SingleFileDrop';
import { LoadingSpinner } from '../components/LoadingState';

// Requisition RH (2026-10-06) -- MIGRASI dari halaman mandiri `Manualbook.html` ("Verification
// Portal - Waruna Group") ke dalam app. LOGIKA SENGAJA SAMA PERSIS dgn file asli (permintaan user:
// "murni migrasi, jangan ubah logika"): POST FormData ke webhook n8n, polling status tiap 3 dtk
// (maks 60x = 3 menit), pengelompokan per Subsystem, checkbox VERIFY default tercentang kalau
// AI_Status mengandung "APPROVED", Download (simple: tanpa kolom Inventory & Decision) / Download
// Full -- hanya baris tercentang yang dicetak, header subsystem tanpa baris tercentang ikut
// disembunyikan. Yang berubah HANYA tampilan (gaya app, font Sora, lebar penuh) + nilai dari n8n
// disanitasi DOMPurify (dulu disuntik mentah ke innerHTML; hasil ekstraksi AI = input tak tepercaya).
// URL webhook dipanggil LANGSUNG dari browser seperti versi asli (bukan lewat proxy /api).
const WEBHOOK_URL = 'https://n8.waruna-group.co.id/webhook/277b56f1-5761-412a-9be5-86298d5aa5de';
const STATUS_URL = 'https://n8.waruna-group.co.id/webhook/check-audit-status';
const MAX_POLLS = 60; // Timeout 3 menit (60 x 3 detik)

// Font app dipaksa eksplisit -- kontrol bawaan browser (select, tombol file) tidak selalu mewarisi.
const SORA: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };

type RhItem = Record<string, any>;
type PrintMode = 'simple' | 'full' | null;

// Nilai dari n8n dulu di-interpolasi `${...}` ke innerHTML -> String() + sanitasi, tampilan sama.
const Html: React.FC<{ v: unknown; as?: 'span' | 'div'; className?: string; style?: React.CSSProperties }> = ({ v, as: Tag = 'span', className, style }) => (
  <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`${v}`) }} />
);

const isUnderOrder = (s: string) => s === 'UNDER-ORDER';
const statusBadgeClass = (aiStatus: string) =>
  aiStatus.includes('REDUCED')
    ? 'bg-red-50 text-red-600 border-red-200'
    : isUnderOrder(aiStatus)
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
const rowAccentClass = (aiStatus: string) =>
  aiStatus.includes('REDUCED') ? 'border-l-red-400' : isUnderOrder(aiStatus) ? 'border-l-amber-400' : 'border-l-emerald-400';

function groupBySubsystem(items: RhItem[]) {
  // Objek polos (bukan Map) -- urutan kelompok SAMA dgn versi asli.
  const grouped: Record<string, { item: RhItem; idx: number }[]> = {};
  items.forEach((item, idx) => {
    const s = item.Subsystem && item.Subsystem !== '-' ? item.Subsystem : 'GENERAL COMPONENTS';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push({ item, idx });
  });
  return grouped;
}

function AiBox({ item, aiStatus, print }: { item: RhItem; aiStatus: string; print?: boolean }) {
  const steps: string[] = item.Rekomendasi_AI ? String(item.Rekomendasi_AI).split('|').map((s: string) => s.trim()) : [];
  return (
    <div className={print ? 'border border-black rounded p-2 text-[11px]' : 'bg-[#FBF7F4] border border-[#EADFD6] rounded-xl p-3 text-[11px]'}>
      {steps.map((step, i) =>
        step.includes('FINAL DECISION') ? (
          <Html
            key={i}
            as="div"
            v={step}
            className={`mt-2.5 pt-2.5 border-t border-dashed ${print ? 'border-black' : 'border-[#EADFD6]'} font-extrabold text-center text-xs rounded-lg p-2 ${
              print ? '' : aiStatus.includes('REDUCED') ? 'text-red-600 bg-red-50' : 'text-[#5A305A] bg-[#F5EDF3]'
            }`}
          />
        ) : (
          <div key={i} className="flex items-start gap-1.5 text-slate-600 mb-1.5 leading-relaxed">
            <ChevronRight size={11} className="mt-[3px] shrink-0 text-[#5A305A]/60" />
            <Html v={step} />
          </div>
        ),
      )}
    </div>
  );
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;


function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone: 'plum' | 'green' | 'red' | 'amber' | 'slate' }) {
  const toneCls = {
    plum: 'bg-[#F5EDF3] text-[#5A305A]',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];
  return (
    <div className={`rounded-xl px-3.5 py-2.5 ${toneCls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );
}

export default function RequisitionRhPage() {
  useEffect(() => { document.title = 'Requisition RH · BeeHive'; }, []);

  const [engineType, setEngineType] = useState('ME');
  const rhFileRef = useRef<HTMLInputElement>(null);
  const reqFileRef = useRef<HTMLInputElement>(null);
  // Hanya utk tampilan kotak upload; file yg dikirim tetap dibaca dari input (sama asli).
  const [rhFileView, setRhFileView] = useState<File | null>(null);
  const [reqFileView, setReqFileView] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [items, setItems] = useState<RhItem[]>([]);
  const [header, setHeader] = useState({ title: 'VESSEL NAME', date: '-' });
  const [checked, setChecked] = useState<boolean[]>([]);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [elapsed, setElapsed] = useState(0); // tampilan saja (kartu Analyzing)

  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = () => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = null;
  };
  useEffect(() => stopPolling, []);

  useEffect(() => {
    const after = () => setPrintMode(null);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  useEffect(() => {
    if (!polling) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [polling]);

  function renderTable(auditData: RhItem[]) {
    setSubmitting(false);
    setPolling(false);
    setReportVisible(true);
    setItems(auditData);
    // PENCEGAT ERROR DARI N8N (BANNER MERAH MUTLAK) -- header laporan tidak diubah (sama asli).
    if (auditData[0].PESAN_ERROR) {
      setChecked([]);
      return;
    }
    const vessel = auditData[0].Nama_Kapal || 'Unknown';
    const engine = auditData[0].Tipe_Mesin || 'ME';
    setHeader({ title: `${vessel} — ${engine}`, date: `${auditData[0].Tanggal || '-'}` });
    setChecked(auditData.map(item => (item.AI_Status || '').includes('APPROVED')));
  }

  async function checkStatus(jobId: string) {
    try {
      const res = await fetch(`${STATUS_URL}?job_id=${jobId}`);
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: API Pengecekan gagal diakses.`);
      }
      const json = await res.json();

      if (json.status === 'error' || json.error) {
        stopPolling();
        renderTable([{ PESAN_ERROR: 'API ERROR: ' + (json.message || json.error || 'Gagal menarik data dari Database.') }]);
        return;
      }

      if (json.status === 'completed' || Array.isArray(json)) {
        stopPolling();
        const dataToRender = Array.isArray(json) ? json : json.data;
        if (!dataToRender || dataToRender.length === 0) {
          renderTable([{ PESAN_ERROR: 'DATA KOSONG: N8N sukses, tapi Google Sheets mengirimkan array kosong. Kemungkinan file Mandatory Excel tidak terbaca dengan benar.' }]);
        } else {
          renderTable(dataToRender);
        }
        return;
      }
    } catch (e: any) {
      console.warn('Sedang menunggu respon API...', e?.message);
    }

    pollCount.current++;
    if (pollCount.current > MAX_POLLS) {
      stopPolling();
      renderTable([{ PESAN_ERROR: 'TIMEOUT (3 MENIT): Sistem dihentikan paksa. Koneksi nyangkut atau AI gagal merespon tepat waktu.' }]);
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `JOB-${Date.now()}`;

    setSubmitting(true);
    setErrorMsg(null);
    setReportVisible(false);
    pollCount.current = 0; // Reset bom waktu

    const fd = new FormData();
    fd.append('engine_type', engineType);
    fd.append('job_id', id);
    const rhFile = rhFileRef.current?.files?.[0];
    const reqFile = reqFileRef.current?.files?.[0];
    if (rhFile) fd.append('RH_Report', rhFile);
    fd.append('Requisition_Report', reqFile as File);

    try {
      const req = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
      if (!req.ok) throw new Error('Koneksi ke server N8N gagal terhubung di awal.');

      setPolling(true);
      stopPolling();
      pollingInterval.current = setInterval(() => checkStatus(id), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
      setSubmitting(false);
    }
  };

  const printReport = (mode: 'simple' | 'full') => {
    flushSync(() => setPrintMode(mode));
    window.print();
  };

  const isError = !!items[0]?.PESAN_ERROR;
  const grouped = useMemo(() => (isError ? {} : groupBySubsystem(items)), [items, isError]);

  // Ringkasan (tampilan saja) -- kategori status SAMA dgn warna badge di tabel.
  const stats = useMemo(() => {
    if (isError) return null;
    let approved = 0, reduced = 0, under = 0;
    items.forEach(it => {
      const s: string = it.AI_Status || '';
      if (s.includes('REDUCED')) reduced++;
      else if (isUnderOrder(s)) under++;
      else if (s.includes('APPROVED')) approved++;
    });
    return { total: items.length, approved, reduced, under, verified: checked.filter(Boolean).length };
  }, [items, checked, isError]);

  const busy = submitting || polling;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10" style={SORA}>
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <ClipboardCheck size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Requisition RH</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">AI verification of requisition / PO against the Running Hours report.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)] gap-3 items-start">
          {/* ===== FORM ===== */}
          <aside className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden lg:sticky lg:top-2">
            <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-[#5A305A] to-[#73507B] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><ShieldCheck size={18} /></div>
                <div>
                  <h2 className="font-bold text-base leading-tight">Verification</h2>
                  <p className="text-[11px] text-white/75 mt-0.5">AI Engine System</p>
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-[#5A305A] text-white text-[10px] font-bold flex items-center justify-center">1</span>
                  <span className="text-xs font-semibold text-[#2A1A2C]">Engine Category</span>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Engine Category">
                  {[
                    { v: 'ME', title: 'Main Engine', code: 'ME' },
                    { v: 'AE', title: 'Aux Engine', code: 'AE' },
                  ].map(o => {
                    const on = engineType === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={busy}
                        onClick={() => setEngineType(o.v)}
                        className={`rounded-xl border-2 px-3 py-2.5 text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          on ? 'border-[#5A305A] bg-[#F5EDF3]' : 'border-[#EADFD6] bg-white hover:border-[#5A305A]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Cog size={15} className={on ? 'text-[#5A305A]' : 'text-slate-400'} />
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${on ? 'bg-[#5A305A] text-white' : 'bg-slate-100 text-slate-500'}`}>{o.code}</span>
                        </div>
                        <div className={`text-xs font-semibold mt-1.5 ${on ? 'text-[#5A305A]' : 'text-[#2A1A2C]'}`}>{o.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <SingleFileDrop
                step={2}
                label="Running Hours Report"
                hint="PDF, XLS or XLSX"
                accept=".pdf,.xls,.xlsx"
                inputRef={rhFileRef}
                file={rhFileView}
                onFile={setRhFileView}
                disabled={busy}
              />

              <SingleFileDrop
                step={3}
                label="Requisition / PO"
                hint="PDF only"
                accept=".pdf"
                inputRef={reqFileRef}
                file={reqFileView}
                onFile={setReqFileView}
                disabled={busy}
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 bg-[#5A305A] hover:bg-[#73507B] text-white rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> PROCESSING...</>
                ) : (
                  <><Zap size={15} /> RUN AI VERIFICATION</>
                )}
              </button>

              {errorMsg && (
                <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-200 rounded-xl p-3 text-[11px] font-semibold">
                  <TriangleAlert size={14} className="shrink-0 mt-px" /> {errorMsg}
                </div>
              )}
            </form>
          </aside>

          {/* ===== HASIL ===== */}
          <section className="min-w-0">
            {polling && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-full bg-[#F5EDF3] flex items-center justify-center">
                    <BrainCircuit size={34} className="text-[#5A305A]" />
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#5A305A]/30 animate-ping" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">Analyzing...</h3>
                <p className="text-xs text-[#6E5E70] mt-1">Performing Triangulation Data</p>
                <div className="w-full max-w-sm mt-6">
                  <div className="h-1.5 rounded-full bg-[#F5EDF3] overflow-hidden">
                    <div className="h-full bg-[#5A305A] transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsed / (MAX_POLLS * 3)) * 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6E5E70] mt-2">
                    <span className="inline-flex items-center gap-1.5"><LoadingSpinner className="scale-75" /> Elapsed {fmtClock(elapsed)}</span>
                    <span>Timeout {fmtClock(MAX_POLLS * 3)}</span>
                  </div>
                </div>
              </div>
            )}

            {!polling && !reportVisible && (
              <div className="bg-white/80 rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EDF3] flex items-center justify-center mb-4">
                  <ScanSearch size={28} className="text-[#5A305A]" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">No verification result yet</h3>
                <p className="text-xs text-[#6E5E70] mt-1 max-w-md">The AI compares the requisition / PO against the Running Hours report and the mandatory spare-part database.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full max-w-3xl text-left">
                  {[
                    { icon: UploadCloud, title: 'Upload documents', desc: 'Pick the engine category, then the Running Hours report and the Requisition / PO.' },
                    { icon: BrainCircuit, title: 'AI triangulation', desc: 'Each item is checked against RH history, ROB and the mandatory list (up to 3 minutes).' },
                    { icon: Printer, title: 'Verify & download', desc: 'Tick the items to keep, then download the simple or full report.' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-white border border-[#EADFD6] flex items-center justify-center"><s.icon size={15} className="text-[#5A305A]" /></div>
                        <span className="text-[10px] font-bold text-[#6E5E70]">STEP {i + 1}</span>
                      </div>
                      <div className="text-xs font-semibold text-[#2A1A2C]">{s.title}</div>
                      <div className="text-[11px] text-[#6E5E70] mt-1 leading-relaxed">{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportVisible && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap border-b border-[#EADFD6]">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#F5EDF3] flex items-center justify-center shrink-0">
                      <Anchor size={20} className="text-[#5A305A]" />
                    </div>
                    <div className="min-w-0">
                      <Html as="div" v={header.title} className="text-lg font-bold text-[#2A1A2C] leading-tight truncate" />
                      <p className="text-xs text-[#6E5E70] mt-1 inline-flex items-center gap-1.5"><CalendarDays size={12} /> Request Date: {header.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => printReport('simple')}
                      title="Print checked items without Inventory & Decision columns"
                      className="h-9 px-4 rounded-xl border border-[#5A305A] text-[#5A305A] bg-white hover:bg-[#F5EDF3] text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Printer size={14} /> Download
                    </button>
                    <button
                      onClick={() => printReport('full')}
                      title="Print checked items with all columns"
                      className="h-9 px-4 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <FileDown size={14} /> Download Full
                    </button>
                  </div>
                </div>

                {stats && (
                  <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 border-b border-[#EADFD6] bg-[#FCF8FB]">
                    <StatTile label="Items" value={stats.total} tone="plum" />
                    <StatTile label="Approved" value={stats.approved} tone="green" />
                    <StatTile label="Reduced" value={stats.reduced} tone="red" />
                    <StatTile label="Under-order" value={stats.under} tone="amber" />
                    <StatTile label="Verified (to print)" value={<>{stats.verified}<span className="text-xs font-semibold opacity-70"> / {stats.total}</span></>} tone="slate" />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px] min-w-[960px]">
                    <thead>
                      <tr className="bg-[#FBF7F4] text-[#6E5E70] text-[10px] font-bold uppercase tracking-wide">
                        <th className="px-4 py-3 text-center border-b border-[#EADFD6]" style={{ width: '5%' }}>NO</th>
                        <th className="px-4 py-3 text-left border-b border-[#EADFD6]" style={{ width: '30%' }}>IDENTITY &amp; TRACEABILITY</th>
                        <th className="px-4 py-3 text-center border-b border-[#EADFD6]" style={{ width: '10%' }}>INVENTORY</th>
                        <th className="px-4 py-3 text-left border-b border-[#EADFD6]" style={{ width: '25%' }}>TARGET RH &amp; HISTORY</th>
                        <th className="px-4 py-3 text-left border-b border-[#EADFD6]" style={{ width: '25%' }}>DECISION LOGIC</th>
                        <th className="px-4 py-3 text-center border-b border-[#EADFD6]" style={{ width: '5%' }}>VERIFY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isError ? (
                        <tr>
                          <td colSpan={6} className="p-6">
                            <div className="bg-red-50 border border-red-200 border-l-[5px] border-l-red-600 rounded-xl p-5 text-red-600">
                              <div className="font-extrabold text-base mb-2.5 flex items-center gap-2">
                                <OctagonX size={22} /> SYSTEM ERROR / AI TIMEOUT
                              </div>
                              <div className="text-[13px] leading-relaxed">
                                <b>Pesan Diagnostik:</b><br />
                                <Html v={items[0].PESAN_ERROR} />
                              </div>
                              <div className="mt-4 text-[11px] text-red-800 font-semibold flex items-center gap-1.5">
                                <RotateCcw size={12} /> *Silakan cek dokumen atau klik tombol "RUN AI VERIFICATION" untuk mencoba ulang (Retry).
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        Object.keys(grouped).map(sub => (
                          <React.Fragment key={sub}>
                            <tr>
                              <td colSpan={6} className="bg-[#5A305A] text-white font-semibold text-xs uppercase tracking-wide px-4 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5"><Layers size={13} /> SYSTEM: <Html v={sub} /></span>
                                  <span className="text-[10px] font-medium normal-case bg-white/15 rounded-full px-2 py-0.5">{grouped[sub].length} item{grouped[sub].length === 1 ? '' : 's'}</span>
                                </div>
                              </td>
                            </tr>
                            {grouped[sub].map(({ item, idx }) => {
                              const aiStatus: string = item.AI_Status || '';
                              const on = !!checked[idx];
                              return (
                                <tr key={idx} className={`align-top border-b border-[#EADFD6] transition-colors ${on ? 'bg-white' : 'bg-slate-50/70'} hover:bg-[#FCF8FB]`}>
                                  <td className={`p-4 text-center border-l-4 ${rowAccentClass(aiStatus)}`}>
                                    <Html v={item.No_Item_PDF || '-'} className="inline-flex min-w-[28px] h-7 px-1.5 items-center justify-center rounded-lg bg-[#F5EDF3] text-[#5A305A] font-bold text-xs" />
                                  </td>
                                  <td className="p-4">
                                    <span className="inline-block bg-[#5A305A] text-white text-[9px] font-bold px-2 py-0.5 rounded-md mb-2 tracking-wide">MANDATORY</span>
                                    <Html as="div" v={item.Nama_Barang} className="font-bold text-[#5A305A] text-[13px] mb-1" />
                                    <div className="text-[11px] text-[#6E5E70]">PN: <b className="text-[#2A1A2C]"><Html v={item.No_Part || '-'} /></b></div>
                                    <div className="border border-dashed border-[#EADFD6] rounded-xl px-3 py-2.5 mt-2.5 text-[11px] bg-[#FBF7F4] space-y-1">
                                      <div><b className="text-[#6E5E70]">DB:</b> <Html v={item.Nama_Master} /></div>
                                      <div className="text-orange-700"><b>RH:</b> <Html v={item.Nama_RH || '[NOT FOUND]'} /></div>
                                      <Html as="div" v={item.Warning_Text || ''} />
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div className="grid grid-cols-1 gap-2">
                                      <div className="rounded-xl bg-[#F5EDF3] py-2 text-center">
                                        <div className="text-[9px] font-semibold text-[#6E5E70] tracking-wide">REQ</div>
                                        <Html v={item.Qty_Diminta} className="text-lg font-bold text-[#5A305A]" />
                                      </div>
                                      <div className="rounded-xl bg-slate-100 py-2 text-center">
                                        <div className="text-[9px] font-semibold text-[#6E5E70] tracking-wide">ROB</div>
                                        <Html v={item.ROB} className="text-lg font-bold text-[#2A1A2C]" />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <Html as="div" v={item.Target_Cylinder !== '-' ? item.Target_Cylinder : 'SAFE'} className="inline-block font-bold text-[11px] mb-2 px-2 py-0.5 rounded-md bg-slate-100 text-[#2A1A2C]" />
                                    <Html as="div" v={item.RH_Terakhir} className="text-xs text-[#2A1A2C] leading-relaxed" />
                                  </td>
                                  <td className="p-4">
                                    <Html v={aiStatus} className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg border mb-2.5 ${statusBadgeClass(aiStatus)}`} />
                                    <AiBox item={item} aiStatus={aiStatus} />
                                  </td>
                                  <td className="p-4 text-center align-middle">
                                    <input
                                      type="checkbox"
                                      title={on ? 'Included in the download' : 'Not included in the download'}
                                      className="w-[22px] h-[22px] cursor-pointer accent-[#5A305A]"
                                      checked={on}
                                      onChange={e => {
                                        const v = e.target.checked;
                                        setChecked(prev => { const n = [...prev]; n[idx] = v; return n; });
                                      }}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {reportVisible && createPortal(
        <PrintArea header={header} items={items} grouped={grouped} isError={isError} checked={checked} printMode={printMode} />,
        document.body,
      )}
    </div>
  );
}

// Area cetak (portal ke body, hanya tampil saat print -- lihat #requisition-rh-print-area di
// index.css). Aturan SAMA versi asli: kolom VERIFY tidak dicetak; lewat tombol Download/Download
// Full hanya baris tercentang & header subsystem tanpa baris tercentang disembunyikan; mode
// 'simple' tanpa kolom INVENTORY & DECISION LOGIC. Ctrl+P biasa (printMode null) = semua baris.
function PrintArea({ header, items, grouped, isError, checked, printMode }: {
  header: { title: string; date: string };
  items: RhItem[];
  grouped: Record<string, { item: RhItem; idx: number }[]>;
  isError: boolean;
  checked: boolean[];
  printMode: PrintMode;
}) {
  const simple = printMode === 'simple';
  const filterRows = printMode !== null;
  const colCount = simple ? 3 : 5;
  const cell = 'border border-black p-2.5 align-top';
  return (
    <div id="requisition-rh-print-area" className="hidden print:block bg-white text-black text-[12px] leading-normal" style={SORA}>
      <div className="text-center pb-4 border-b-2 border-black mb-5">
        <Html as="div" v={header.title} className="text-lg font-bold mb-1" />
        <p className="text-xs text-neutral-600">Request Date: {header.date}</p>
        <p className="text-xs font-bold mt-1">GENERATED BY AI WARUNA</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-left">
            <th className={cell} style={{ width: '5%' }}>NO</th>
            <th className={cell} style={{ width: '30%' }}>IDENTITY &amp; TRACEABILITY</th>
            {!simple && <th className={`${cell} text-center`} style={{ width: '10%' }}>INVENTORY</th>}
            <th className={cell} style={{ width: '25%' }}>TARGET RH &amp; HISTORY</th>
            {!simple && <th className={cell} style={{ width: '25%' }}>DECISION LOGIC</th>}
          </tr>
        </thead>
        <tbody>
          {isError ? (
            <tr><td colSpan={colCount} className={cell}><b>SYSTEM ERROR / AI TIMEOUT</b><br /><Html v={items[0]?.PESAN_ERROR} /></td></tr>
          ) : (
            Object.keys(grouped).map(sub => {
              const rows = grouped[sub].filter(({ idx }) => !filterRows || checked[idx]);
              if (rows.length === 0) return null;
              return (
                <React.Fragment key={sub}>
                  <tr>
                    <td colSpan={colCount} className={`${cell} bg-[#f0f0f0] font-bold uppercase`} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                      SYSTEM: <Html v={sub} />
                    </td>
                  </tr>
                  {rows.map(({ item, idx }) => {
                    const aiStatus: string = item.AI_Status || '';
                    return (
                      <tr key={idx}>
                        <td className={`${cell} text-center font-bold`}><Html v={item.No_Item_PDF || '-'} /></td>
                        <td className={cell}>
                          <span className="inline-block border border-black text-[9px] font-extrabold px-2 py-0.5 rounded mb-1.5">MANDATORY</span>
                          <Html as="div" v={item.Nama_Barang} className="font-bold mb-1" />
                          <div className="text-[10px]">PN: <b><Html v={item.No_Part || '-'} /></b></div>
                          <div className="border border-dashed border-black rounded px-2 py-1.5 mt-2 text-[11px]">
                            <div className="mb-1"><b>DB:</b> <Html v={item.Nama_Master} /></div>
                            <div><b>RH:</b> <Html v={item.Nama_RH || '[NOT FOUND]'} /></div>
                            <Html as="div" v={item.Warning_Text || ''} className="mt-1" />
                          </div>
                        </td>
                        {!simple && (
                          <td className={`${cell} text-center`}>
                            <div className="mb-2"><span className="text-[9px]">REQ</span><br /><Html v={item.Qty_Diminta} className="text-base font-extrabold" /></div>
                            <div><span className="text-[9px]">ROB</span><br /><Html v={item.ROB} className="text-base font-extrabold" /></div>
                          </td>
                        )}
                        <td className={cell}>
                          <Html as="div" v={item.Target_Cylinder !== '-' ? item.Target_Cylinder : 'SAFE'} className="font-bold text-[11px] mb-1.5" />
                          <Html as="div" v={item.RH_Terakhir} />
                        </td>
                        {!simple && (
                          <td className={cell}>
                            <Html v={aiStatus} className="inline-block border border-black text-[10px] font-bold px-2.5 py-1 rounded mb-2" />
                            <AiBox item={item} aiStatus={aiStatus} print />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
