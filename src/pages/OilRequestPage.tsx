import React, { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit, CheckCircle2, Droplets, FileSearch, FileStack, FileText, Layers, ShieldCheck, TriangleAlert, UploadCloud, X, Zap,
} from 'lucide-react';
import Greeting from '../components/Greeting';
import { LoadingSpinner } from '../components/LoadingState';

// Oil Request (2026-10-06) -- MIGRASI dari halaman mandiri `Oil Request.html` ("Waruna AI LSA Audit")
// ke dalam app, submenu SPB. LOGIKA SAMA dgn file asli (permintaan user: "murni migrasi"): PDF
// Requisition/PO & Lubricating Oil Record (masing2 bisa >1 file) digabung di browser dgn pdf-lib
// (1 file = dikirim apa adanya), POST FormData `file_permintaan` (Requisition_Merged.pdf) & `file_oil`
// (OilRecord_Merged.pdf) LANGSUNG ke webhook n8n (bukan lewat proxy /api), respons JSON ->
// `html || data || JSON.stringify(...)` ditampilkan & script di dalamnya dijalankan.
// BEDA (keamanan): versi asli menyuntik HTML n8n ke halaman + `eval` script-nya (bisa membaca sesi
// login app). Sekarang dirender di <iframe sandbox> TANPA allow-same-origin -> script n8n tetap jalan
// (perilaku sama) tapi terisolasi dari app (origin opaque, tidak bisa akses token/localStorage).
// DOMPurify SENGAJA tidak dipakai di sini krn akan membuang script yg dibutuhkan hasil n8n.
const WEBHOOK_URL = 'https://n8.waruna-group.co.id/webhook/Permintaan-Oli';

const SORA: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };
const HEIGHT_MSG = '__beehiveOilResultHeight';

async function mergePdfs(filesArray: File[]): Promise<Blob | File> {
  if (filesArray.length === 1) return filesArray[0];
  const { PDFDocument } = await import('pdf-lib');
  const mergedPdf = await PDFDocument.create();
  for (const file of filesArray) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }
  const mergedPdfBytes = await mergedPdf.save();
  return new Blob([mergedPdfBytes as BlobPart], { type: 'application/pdf' });
}

// Dokumen iframe hasil: lingkungan mirip halaman asli (lucide global tersedia utk script n8n),
// font Sora, + skrip kecil yg melapor tinggi konten ke parent supaya iframe tidak scroll sendiri.
function buildResultDoc(finalHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js"></script>
<style>
html,body{margin:0;padding:0;background:transparent;}
body{color:#1e293b;font-size:13px;line-height:1.5;padding:2px;}
body, body *:not(pre):not(code):not(kbd):not(samp){font-family:'Sora',sans-serif !important;}
</style></head><body>
${finalHtml}
<script>(function(){
  function report(){ try { parent.postMessage({ ${HEIGHT_MSG}: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch(e){} }
  window.addEventListener('load', report);
  try { new ResizeObserver(report).observe(document.body); } catch(e){}
  setTimeout(report, 50); setTimeout(report, 600); setTimeout(report, 2000);
})();</script>
</body></html>`;
}

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Kotak upload multi-file. Pilih file berkali-kali = DITAMBAHKAN ke daftar (urutan daftar = urutan
// halaman di PDF gabungan), bisa dihapus per file. Daftar ini yang dikirim saat submit.
function MultiFileDrop({ step, label, files, onChange, disabled }: {
  step: number; label: string; files: File[]; onChange: (f: File[]) => void; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setRejected(pdfs.length < incoming.length ? 'Only PDF files are accepted.' : null);
    const seen = new Set(files.map(fileKey));
    onChange([...files, ...pdfs.filter(f => !seen.has(fileKey(f)))]);
  };
  const total = files.reduce((s, f) => s + f.size, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#5A305A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{step}</span>
          <span className="text-xs font-semibold text-[#2A1A2C]">{label}</span>
        </div>
        <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-md px-1.5 py-0.5">Multiple files OK</span>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
        className={`block rounded-xl border-2 border-dashed transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
          over ? 'border-[#5A305A] bg-[#F5EDF3]' : 'border-[#EADFD6] bg-[#FBF7F4] hover:border-[#5A305A]/50 hover:bg-[#F5EDF3]/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={e => { add(e.target.files); e.target.value = ''; }}
        />
        <div className={`flex items-center justify-center gap-2.5 px-3 ${files.length ? 'py-2.5' : 'py-5 flex-col text-center'}`}>
          <UploadCloud size={files.length ? 16 : 22} className="text-[#5A305A]/70" />
          <div>
            <div className="text-xs font-semibold text-[#5A305A]">{files.length ? 'Add more PDF files' : 'Click to choose or drop PDF files'}</div>
            {!files.length && <div className="text-[11px] text-[#6E5E70] mt-0.5">Several files are merged into one PDF, in list order</div>}
          </div>
        </div>
      </label>

      {files.length > 0 && (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/50 divide-y divide-emerald-100">
          {files.map((f, i) => (
            <div key={fileKey(f)} className="flex items-center gap-2.5 px-3 py-2">
              <span className="text-[10px] font-bold text-emerald-700 w-4 text-right shrink-0">{i + 1}</span>
              <FileText size={15} className="text-red-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[#2A1A2C] truncate" title={f.name}>{f.name}</div>
                <div className="text-[10px] text-[#6E5E70]">{fmtSize(f.size)}</div>
              </div>
              {!disabled && (
                <button
                  type="button"
                  title="Remove file"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  className="w-6 h-6 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-emerald-700 flex items-center gap-1">
            <CheckCircle2 size={11} /> {files.length} file{files.length === 1 ? '' : 's'} · {fmtSize(total)}{files.length > 1 ? ' · will be merged' : ''}
          </div>
        </div>
      )}
      {rejected && <div className="text-[11px] text-red-600 mt-1">{rejected}</div>}
    </div>
  );
}

export default function OilRequestPage() {
  useEffect(() => { document.title = 'Oil Request · BeeHive'; }, []);

  const [filesPermintaan, setFilesPermintaan] = useState<File[]>([]);
  const [filesOilCom, setFilesOilCom] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'merge' | 'ai'>('merge'); // tampilan saja
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultHtml, setResultHtml] = useState<string | null>(null);
  const [resultAt, setResultAt] = useState<Date | null>(null);
  const [frameHeight, setFrameHeight] = useState(600);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const h = e.data?.[HEIGHT_MSG];
      if (typeof h === 'number' && h > 0) setFrameHeight(Math.max(240, h + 4));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filesPermintaan.length === 0 || filesOilCom.length === 0) {
      setErrorMsg('Harap upload dokumen di kedua kolom!');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    setPhase('merge');
    setResultHtml(null);

    try {
      const mergedPermintaan = await mergePdfs(filesPermintaan);
      const mergedOilCom = await mergePdfs(filesOilCom);
      const formData = new FormData();
      formData.append('file_permintaan', mergedPermintaan, 'Requisition_Merged.pdf');
      formData.append('file_oil', mergedOilCom, 'OilRecord_Merged.pdf');

      setPhase('ai');
      const response = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Gagal terhubung ke server n8n.');

      const resultData = await response.json();
      const finalHtml = resultData.html || resultData.data || JSON.stringify(resultData);

      setLoading(false);
      setFrameHeight(600);
      setResultHtml(`${finalHtml}`);
      setResultAt(new Date());
    } catch (error: any) {
      setErrorMsg('Terjadi kesalahan: ' + (error?.message || String(error)));
      setLoading(false);
    }
  };

  const totalFiles = filesPermintaan.length + filesOilCom.length;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10" style={SORA}>
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <Droplets size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Oil Request</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">AI audit of lubricating oil requisition / PO against the Lubricating Oil Record.</p>
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
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><ShieldCheck size={18} /></div>
                <div>
                  <h2 className="font-bold text-base leading-tight">Verification</h2>
                  <p className="text-[11px] text-white/75 mt-0.5">AI Engine System</p>
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-5">
              <MultiFileDrop step={1} label="Requisition / PO" files={filesPermintaan} onChange={setFilesPermintaan} disabled={loading} />
              <MultiFileDrop step={2} label="Lubricating Oil Record" files={filesOilCom} onChange={setFilesOilCom} disabled={loading} />

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#5A305A] hover:bg-[#73507B] text-white rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
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
            {loading && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-full bg-[#F5EDF3] flex items-center justify-center">
                    {phase === 'merge' ? <FileStack size={32} className="text-[#5A305A]" /> : <BrainCircuit size={34} className="text-[#5A305A]" />}
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#5A305A]/30 animate-ping" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">Analyzing...</h3>
                <p className="text-xs text-[#6E5E70] mt-1">Merging &amp; extracting {totalFiles} document{totalFiles === 1 ? '' : 's'}</p>
                <div className="flex items-center gap-2 mt-6 text-[11px]">
                  {[
                    { k: 'merge', label: 'Merge PDF' },
                    { k: 'ai', label: 'AI audit' },
                  ].map((s, i) => {
                    const done = phase === 'ai' && s.k === 'merge';
                    const active = phase === s.k;
                    return (
                      <React.Fragment key={s.k}>
                        {i > 0 && <span className={`w-8 h-px ${done || active ? 'bg-[#5A305A]' : 'bg-[#EADFD6]'}`} />}
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
                          done ? 'bg-emerald-50 text-emerald-700' : active ? 'bg-[#F5EDF3] text-[#5A305A]' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {done ? <CheckCircle2 size={12} /> : active ? <LoadingSpinner className="scale-[0.6] -mx-1.5" /> : null}
                          {s.label}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {!loading && resultHtml === null && (
              <div className="bg-white/80 rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EDF3] flex items-center justify-center mb-4">
                  <FileSearch size={28} className="text-[#5A305A]" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">No data yet</h3>
                <p className="text-xs text-[#6E5E70] mt-1 max-w-md">Upload the documents in the left panel to start the automatic audit.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full max-w-3xl text-left">
                  {[
                    { icon: UploadCloud, title: 'Upload documents', desc: 'Add the Requisition / PO and the Lubricating Oil Record — several files each are fine.' },
                    { icon: Layers, title: 'Merge & extract', desc: 'Files are merged into one PDF per document, then read by the AI.' },
                    { icon: BrainCircuit, title: 'AI audit result', desc: 'The audit result from the AI appears on the right.' },
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

            {!loading && resultHtml !== null && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden">
                <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap border-b border-[#EADFD6]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#F5EDF3] flex items-center justify-center shrink-0"><Droplets size={18} className="text-[#5A305A]" /></div>
                    <div className="min-w-0">
                      <div className="text-base font-bold text-[#2A1A2C] leading-tight">Audit Result</div>
                      <div className="text-[11px] text-[#6E5E70] mt-0.5">
                        {resultAt?.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{filesPermintaan.length} requisition file{filesPermintaan.length === 1 ? '' : 's'} · {filesOilCom.length} oil record file{filesOilCom.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                    <CheckCircle2 size={12} /> Completed
                  </span>
                </div>
                <div className="p-4">
                  <iframe
                    ref={frameRef}
                    title="Oil Request audit result"
                    srcDoc={buildResultDoc(resultHtml)}
                    sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-forms"
                    className="w-full block border-0"
                    style={{ height: frameHeight }}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
