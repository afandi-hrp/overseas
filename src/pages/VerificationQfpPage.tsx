import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import {
  BrainCircuit, CheckCircle2, FileImage, FileText, Files, FolderUp, Printer, Receipt, Table2, TriangleAlert, UploadCloud, X, Zap,
} from 'lucide-react';
import Greeting from '../components/Greeting';
import { LoadingSpinner } from '../components/LoadingState';

// Verification QFP (2026-10-06) -- MIGRASI dari halaman mandiri `Verification QFP.html` ("Purchasing AI
// — Waruna Group") ke dalam app, submenu Compare Doc. LOGIKA SAMA dgn file asli (permintaan user:
// "murni migrasi"): file PDF/gambar (bisa banyak, dedup nama+ukuran) dikirim sbg FormData field
// `data` (berulang) LANGSUNG ke webhook n8n `verify-documents` (bukan lewat proxy /api); respons JSON
// dirender jadi 3 tabel (Kelengkapan / Ringkasan PO:Invoice:Faktur Pajak / Item) dgn
// `formatFinanceValue` & `generateVisualTextDiff` yg SAMA; gagal fetch/parse/susun = "SISTEM ERROR".
// Cetak = window.print() dgn judul dokumen sementara `Audit_Report_<id>`. Yang berubah: tampilan gaya
// app & semua nilai dari n8n disanitasi DOMPurify (dulu disuntik mentah ke innerHTML).
const WEBHOOK_URL = 'https://n8.waruna-group.co.id/webhook/verify-documents';

const SORA: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };

// 🔥 FIX SAKTI: Penambahan Kolom Faktur Pajak & Penyesuaian Lebar Tabel 2 & 3 🔥 (sama asli)
const COLS = {
  t1: ['5%', '35%', '60%'],
  t2: ['4%', '24%', '21%', '21%', '21%', '9%'],
  t3: ['4%', '14%', '20%', '20%', '20%', '6%', '16%'],
};

function formatFinanceValue(komp: any, val: any) {
  if (val === undefined || val === null || val === '' || val === '-') return '-';
  if (['QTY', 'DISCOUNT', 'UNIT PRICE', 'TOTAL', 'TOTAL AMOUNT', 'PPN'].includes(komp.toUpperCase())) {
    const cleanNum = String(val).replace(/[^\d.-]/g, '');
    if (cleanNum !== '' && !isNaN(Number(cleanNum))) {
      return new Intl.NumberFormat('id-ID').format(Number(cleanNum));
    }
  }
  return val;
}

function generateVisualTextDiff(str1: any, str2: any) {
  if (!str1 || str1 === '-') return str2 || '-';
  if (!str2 || str2 === '-') return str2 || '-';
  if (str1.toLowerCase() === str2.toLowerCase()) return str2;
  const words1 = str1.split(' ');
  const words2 = str2.split(' ');

  return words2.map((word: string, idx: number) => {
    const cleanW1 = String(words1[idx] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanW2 = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanW1 !== cleanW2 ? `<span class="addition-marker">${word}</span>` : word;
  }).join(' ');
}

// Model tampilan -- disusun di dalam try (sama spt renderResult asli yg dipanggil di dalam try),
// jadi data n8n yg bentuknya tak terduga jatuh ke "SISTEM ERROR", bukan merusak halaman.
type QfpView = {
  kategori: string;
  waktu: string;
  t1: { no: number; field: any; val: any }[];
  t2: { no: number; field: any; po: any; inv: any; fp: any; isOk: boolean }[];
  t3: { item_index: any; rows: { komponen: any; po: any; inv: any; fp: any; isOk: boolean; note: any; bold: boolean }[] }[];
};

function buildView(data: any): QfpView {
  const view: QfpView = { kategori: data.kategori_terdeteksi || 'Error', waktu: new Date().toLocaleString('id-ID'), t1: [], t2: [], t3: [] };

  if (data.table_kelengkapan && data.table_kelengkapan.length > 0) {
    let no = 1;
    data.table_kelengkapan.forEach((r: any) => { view.t1.push({ no: no++, field: r.field, val: r.val }); });
  }

  if (data.table_ringkasan && data.table_ringkasan.length > 0) {
    let no = 1;
    data.table_ringkasan.forEach((r: any) => {
      const displayL = formatFinanceValue(r.field, r.poVal);
      let displayR = formatFinanceValue(r.field, r.invVal);
      let displayF = formatFinanceValue(r.field, r.fpVal);
      if (r.field.toLowerCase().includes('vendor') || r.field.toLowerCase().includes('customer')) {
        displayR = generateVisualTextDiff(r.poVal, r.invVal);
        displayF = generateVisualTextDiff(r.invVal, r.fpVal);
      }
      view.t2.push({ no: no++, field: r.field, po: displayL, inv: displayR, fp: displayF, isOk: !!r.isOk });
    });
  }

  if (data.table_items && data.table_items.length > 0) {
    data.table_items.forEach((item: any) => {
      const rows = item.rows.map((r: any) => {
        const fPo = formatFinanceValue(r.komponen, r.po);
        let fInv = formatFinanceValue(r.komponen, r.inv);
        let fFp = formatFinanceValue(r.komponen, r.fp);
        if (r.komponen === 'NAMA ITEM') {
          fInv = generateVisualTextDiff(r.po, r.inv);
          fFp = generateVisualTextDiff(r.inv, r.fp);
        }
        return { komponen: r.komponen, po: fPo, inv: fInv, fp: fFp, isOk: !!r.isOk, note: r.note, bold: r.komponen === 'TOTAL' };
      });
      view.t3.push({ item_index: item.item_index, rows });
    });
  }
  return view;
}

// Nilai dulu di-interpolasi `${...}` ke innerHTML -> String() + sanitasi (span diff tetap tampil).
const Html: React.FC<{ v: unknown; className?: string }> = ({ v, className }) => (
  <span className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`${v}`) }} />
);

const MARKER_CLS = '[&_.addition-marker]:bg-[#ffcdd2] [&_.addition-marker]:text-[#b71c1c] [&_.addition-marker]:px-0.5 [&_.addition-marker]:rounded-sm [&_.addition-marker]:font-bold';

function ResultTables({ view, print }: { view: QfpView; print?: boolean }) {
  const th = `text-left font-bold uppercase text-[#5A305A] bg-[#F9F5FA] border-b-2 border-[#5A305A] border-r border-r-[#EADFD6] last:border-r-0 ${print ? 'px-2 py-1.5 text-[9.5px]' : 'px-3 py-2.5 text-[11px]'}`;
  const td = `border-b border-[#EADFD6] border-r border-r-[#EADFD6] last:border-r-0 align-middle text-[#333] ${print ? 'px-2 py-1 text-[9.5px]' : 'px-3 py-2.5 text-xs'}`;
  const section = `bg-[#5A305A] text-white font-bold uppercase ${print ? 'px-2.5 py-1.5 text-[10px]' : 'px-3.5 py-2.5 text-[12.5px]'}`;
  const status = (ok: boolean) => `text-center font-bold ${print ? 'text-xs' : 'text-base'} ${ok ? 'bg-[#f1f8e9] text-[#2e7d32]' : 'bg-[#ffebee] text-[#c62828]'}`;
  const block = `border border-[#EADFD6] rounded-xl overflow-hidden bg-white ${print ? 'mb-3' : 'mb-5'} break-inside-avoid`;
  const table = 'w-full border-collapse table-fixed [overflow-wrap:anywhere] [&_tr:last-child_td]:border-b-0';
  const colgroup = (w: string[]) => <colgroup>{w.map((x, i) => <col key={i} style={{ width: x }} />)}</colgroup>;

  return (
    <div className={MARKER_CLS}>
      {view.t1.length > 0 && (
        <div className={block}>
          <table className={table}>
            {colgroup(COLS.t1)}
            <thead>
              <tr><td colSpan={3} className={section}>TABEL 1: KELENGKAPAN DOKUMEN</td></tr>
              <tr><th className={`${th} text-center`}>NO</th><th className={th}>DOCUMENT TYPE</th><th className={th}>KETERANGAN DOKUMEN</th></tr>
            </thead>
            <tbody>
              {view.t1.map(r => (
                <tr key={r.no} className="break-inside-avoid">
                  <td className={`${td} text-center`}>{r.no}</td>
                  <td className={td}><b><Html v={r.field} /></b></td>
                  <td className={td}><Html v={r.val} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.t2.length > 0 && (
        <div className={block}>
          <table className={table}>
            {colgroup(COLS.t2)}
            <thead>
              <tr><td colSpan={6} className={section}>TABEL 2: PO : INVOICE : FAKTUR PAJAK</td></tr>
              <tr>
                <th className={`${th} text-center`}>NO</th><th className={th}>HAL YANG DIBANDINGKAN</th><th className={th}>DATA PO</th>
                <th className={th}>DATA INVOICE</th><th className={th}>DATA FAKTUR PAJAK</th><th className={`${th} text-center`}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {view.t2.map(r => (
                <tr key={r.no} className="break-inside-avoid">
                  <td className={`${td} text-center`}>{r.no}</td>
                  <td className={td}><b><Html v={r.field} /></b></td>
                  <td className={td}><Html v={r.po} /></td>
                  <td className={td}><Html v={r.inv} /></td>
                  <td className={td}><Html v={r.fp} /></td>
                  <td className={`${td} ${status(r.isOk)}`}>{r.isOk ? '✔' : '✘'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.t3.length > 0 && (
        <div className={block}>
          <table className={table}>
            {colgroup(COLS.t3)}
            <thead>
              <tr><td colSpan={7} className={section}>TABEL 3: PO : INVOICE : FAKTUR PAJAK</td></tr>
              <tr>
                <th className={`${th} text-center`}>NO</th><th className={th}>KOMPONEN</th><th className={th}>DATA PO</th><th className={th}>DATA INVOICE</th>
                <th className={th}>DATA FAKTUR PAJAK</th><th className={`${th} text-center`}>STATUS</th><th className={th}>KETERANGAN ERROR</th>
              </tr>
            </thead>
            <tbody>
              {view.t3.map((item, ii) =>
                item.rows.map((r, idx) => (
                  <tr key={`${ii}-${idx}`} className="break-inside-avoid">
                    {idx === 0 && (
                      <td rowSpan={item.rows.length} className={`${td} text-center font-bold bg-[#FAFAFA] align-middle`}><Html v={item.item_index} /></td>
                    )}
                    <td className={td}><b><Html v={r.komponen} /></b></td>
                    <td className={`${td} ${r.bold ? 'font-bold' : ''}`}><Html v={r.po} /></td>
                    <td className={`${td} ${r.bold ? 'font-bold' : ''}`}><Html v={r.inv} /></td>
                    <td className={`${td} ${r.bold ? 'font-bold' : ''}`}><Html v={r.fp} /></td>
                    <td className={`${td} ${status(r.isOk)}`}>{r.isOk ? '✔' : '✘'}</td>
                    <td className={`${td} !text-[10px] text-[#555] bg-[#FBF9FC]`}><Html v={r.note} /></td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isAccepted = (f: File) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.pdf');

export default function VerificationQfpPage() {
  useEffect(() => { document.title = 'Verification QFP · BeeHive'; }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<QfpView | null>(null);
  const [emptyHint, setEmptyHint] = useState(false);

  function addFilesToArray(filesList: FileList) {
    const incoming = Array.from(filesList);
    const ok = incoming.filter(isAccepted);
    setRejected(ok.length < incoming.length ? 'Only PDF or image files are accepted.' : null);
    setEmptyHint(false);
    setUploadedFiles(prev => {
      const next = [...prev];
      ok.forEach(file => { if (!next.some(f => f.name === file.name && f.size === file.size)) next.push(file); });
      return next;
    });
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadedFiles.length === 0) { setEmptyHint(true); return; }

    setRunning(true);
    setFailed(false);
    setView(null);

    const fd = new FormData();
    uploadedFiles.forEach(file => { fd.append('data', file); });

    try {
      const req = await fetch(WEBHOOK_URL, { method: 'POST', body: fd, mode: 'cors' });
      const jsonResponse = await req.json();
      setView(buildView(jsonResponse));
    } catch (err) {
      setFailed(true);
    }
    setRunning(false);
  };

  function printReport(bundleId: string) {
    const originalTitle = document.title;
    document.title = `Audit_Report_${bundleId || 'Waruna'}`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 2000);
  }

  const cleanFileName = String('Audit_Report_PO_Invoice').replace(/[^a-z0-9]/gi, '_').trim();
  const okCount = view ? view.t2.filter(r => r.isOk).length + view.t3.reduce((s, it) => s + it.rows.filter(r => r.isOk).length, 0) : 0;
  const checkCount = view ? view.t2.length + view.t3.reduce((s, it) => s + it.rows.length, 0) : 0;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10" style={SORA}>
      {/* Kertas A4 portrait margin 10mm (sama asli) -- hanya selama halaman ini terpasang. */}
      <style>{'@media print { @page { size: A4 portrait; margin: 10mm; } }'}</style>

      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Receipt size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Verification QFP</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">AI reconciliation of the PO, invoice and tax invoice (Faktur Pajak) bundle.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-3 items-start">
          {/* ===== FORM ===== */}
          <aside className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden lg:sticky lg:top-2">
            <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-[#5A305A] to-[#73507B] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Receipt size={18} /></div>
                <div>
                  <h2 className="font-bold text-base leading-tight">AI Tools</h2>
                  <p className="text-[11px] text-white/75 mt-0.5">Verification QFP Appendix</p>
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-[#2A1A2C]">Transaction documents</span>
                  <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-md px-1.5 py-0.5">PDF / image · multiple</span>
                </div>
                <label
                  onDragOver={e => { e.preventDefault(); if (!running) setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={e => { e.preventDefault(); setOver(false); if (!running && e.dataTransfer.files.length > 0) addFilesToArray(e.dataTransfer.files); }}
                  className={`block rounded-xl border-2 border-dashed transition-all ${running ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
                    over ? 'border-[#5A305A] bg-[#F5EDF3] scale-[1.01]' : 'border-[#EADFD6] bg-[#FBF7F4] hover:border-[#5A305A]/50 hover:bg-[#F5EDF3]/60'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf, image/*"
                    multiple
                    disabled={running}
                    className="sr-only"
                    onChange={e => { if (e.target.files && e.target.files.length > 0) { addFilesToArray(e.target.files); e.target.value = ''; } }}
                  />
                  <div className={`flex items-center justify-center gap-2.5 px-3 ${uploadedFiles.length ? 'py-3' : 'py-7 flex-col text-center'}`}>
                    <FolderUp size={uploadedFiles.length ? 17 : 30} className="text-[#5A305A]/80" />
                    <div>
                      <div className="text-xs font-semibold text-[#5A305A]">{uploadedFiles.length ? 'Add more documents' : 'Click to choose or drop documents'}</div>
                      {!uploadedFiles.length && <div className="text-[11px] text-[#6E5E70] mt-0.5">PO, invoice, Faktur Pajak & other bundle documents</div>}
                    </div>
                  </div>
                </label>

                {uploadedFiles.length > 0 && (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/50 divide-y divide-emerald-100 max-h-[260px] overflow-y-auto">
                    {uploadedFiles.map((f, i) => {
                      const img = f.type.startsWith('image/');
                      return (
                        <div key={`${f.name}|${f.size}`} className="flex items-center gap-2.5 px-3 py-2">
                          {img ? <FileImage size={15} className="text-sky-600 shrink-0" /> : <FileText size={15} className="text-red-500 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-[#2A1A2C] truncate" title={f.name}>{f.name}</div>
                            <div className="text-[10px] text-[#6E5E70]">{fmtSize(f.size)}</div>
                          </div>
                          {!running && (
                            <button
                              type="button"
                              title="Remove file"
                              onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                              className="w-6 h-6 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {uploadedFiles.length > 0 && (
                  <div className="text-[10px] text-emerald-700 flex items-center gap-1 mt-1.5">
                    <CheckCircle2 size={11} /> {uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'} · {fmtSize(uploadedFiles.reduce((s, f) => s + f.size, 0))}
                  </div>
                )}
                {rejected && <div className="text-[11px] text-red-600 mt-1">{rejected}</div>}
                {emptyHint && <div className="text-[11px] text-amber-700 mt-1">Choose at least one document first.</div>}
              </div>

              <button
                type="submit"
                disabled={running}
                className="w-full h-11 bg-[#5A305A] hover:bg-[#73507B] text-white rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {running ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> RUNNING AI...</>
                ) : (
                  <><Zap size={15} /> Run AI</>
                )}
              </button>
            </form>
          </aside>

          {/* ===== HASIL ===== */}
          <section className="min-w-0">
            {running && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-full bg-[#F5EDF3] flex items-center justify-center">
                    <BrainCircuit size={34} className="text-[#5A305A]" />
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#5A305A]/30 animate-ping" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">Analyzing...</h3>
                <p className="text-xs text-[#6E5E70] mt-1">The AI is reading and matching {uploadedFiles.length} document{uploadedFiles.length === 1 ? '' : 's'}, please wait.</p>
                <div className="w-full max-w-sm mt-6 h-1.5 rounded-full bg-[#F5EDF3] overflow-hidden relative">
                  <div className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-[#5A305A] to-transparent animate-[qfpSlide_1.4s_ease-in-out_infinite]" />
                </div>
                <style>{'@keyframes qfpSlide { 0% { left: -40%; } 100% { left: 100%; } }'}</style>
                <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#6E5E70]"><LoadingSpinner className="scale-75" /> Running AI</div>
              </div>
            )}

            {!running && failed && (
              <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-5">
                <div className="bg-red-50 border border-red-200 border-l-[5px] border-l-red-600 rounded-xl p-5 text-red-600 flex items-center gap-3">
                  <TriangleAlert size={22} className="shrink-0" />
                  <div>
                    <div className="font-extrabold text-sm">SISTEM ERROR: Gagal Menghubungi Webhook n8n</div>
                    <div className="text-[11px] text-red-800 mt-1">Check the documents, then click Run AI to try again.</div>
                  </div>
                </div>
              </div>
            )}

            {!running && !failed && !view && (
              <div className="bg-white/80 rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EDF3] flex items-center justify-center mb-4">
                  <Files size={28} className="text-[#5A305A]" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">No analysis yet</h3>
                <p className="text-xs text-[#6E5E70] mt-1 max-w-md">Choose the transaction bundle documents in the left panel.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full max-w-3xl text-left">
                  {[
                    { icon: UploadCloud, title: 'Upload the bundle', desc: 'PO, invoice, Faktur Pajak and supporting documents — PDF or image, several at once.' },
                    { icon: BrainCircuit, title: 'AI reconciliation', desc: 'The AI checks completeness and matches PO, invoice and tax invoice per field and item.' },
                    { icon: Table2, title: 'Review & print', desc: 'Differences are marked in red; print or save the report as PDF.' },
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

            {!running && !failed && view && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap border-b border-[#EADFD6]">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-[#5A305A] leading-tight">REKONSILIASI KELENGKAPAN BUNDLE</h2>
                    <Html v={view.kategori} className="inline-block mt-2 bg-[#5A305A] text-white text-[11px] font-bold rounded-md px-2 py-1" />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {checkCount > 0 && (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                        okCount === checkCount ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'
                      }`}>
                        {okCount === checkCount ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />} {okCount} / {checkCount} checks match
                      </span>
                    )}
                    <div className="text-right text-xs text-[#6E5E70]"><strong className="text-[#2A1A2C]">Waktu Audit:</strong><br />{view.waktu}</div>
                    <button
                      onClick={() => printReport(cleanFileName)}
                      className="h-9 px-4 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Printer size={14} /> Print / Save as PDF
                    </button>
                  </div>
                </div>
                <div className="p-5 overflow-x-auto">
                  <div className="min-w-[820px]">
                    <ResultTables view={view} />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {view && !failed && !running && createPortal(
        <div id="verification-qfp-print-area" className="hidden print:block bg-white text-[10px] leading-[1.3]" style={{ ...SORA, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <div className="flex justify-between items-start pb-2 mb-3 border-b-2 border-[#F9F5FA]">
            <div>
              <h2 className="text-sm font-bold text-[#5A305A] mb-1">REKONSILIASI KELENGKAPAN BUNDLE</h2>
              <Html v={view.kategori} className="inline-block bg-[#5A305A] text-white text-[9px] font-bold rounded px-1.5 py-0.5" />
            </div>
            <div className="text-right text-[10px] text-[#555]"><strong>Waktu Audit:</strong><br />{view.waktu}</div>
          </div>
          <ResultTables view={view} print />
        </div>,
        document.body,
      )}
    </div>
  );
}
