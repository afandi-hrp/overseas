import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, Eye, Download, Printer, FolderOpen } from 'lucide-react';
import { parseJsonField } from '../utils/FarOverseasAirHelpers';

type DokumenEntry = { filename?: string; file_url?: string; drive_file_id?: string };

// Proxy backend `/api/drive-file-proxy?id=<drive_file_id>` -- REPLIKA PERSIS `buildPreviewSrc()`
// AuditPoPage.tsx/AccountingRekapPage.tsx/`buildBunkerPreviewSrc()` BunkerCompareDocModal.tsx.
// Iframe `src` LANGSUNG ke Google Drive (`/file/d/{id}/preview`) TERNYATA tetap tampil dgn
// chrome/UI Drive sendiri (toolbar, spinner loading Drive) yang tidak konsisten dgn preview
// modul lain di app ini -- diganti ke pola sama: fetch via JS lewat proxy backend dulu, baru
// suntikkan hasilnya (srcDoc/blob:) ke iframe polos, dianggap same-origin & imun ke UI/X-Frame-
// Options bawaan Drive.
function buildPreviewSrc(driveFileId: string | undefined | null): string | null {
  if (!driveFileId) return null;
  return `/api/drive-file-proxy?id=${encodeURIComponent(driveFileId)}`;
}

// Dokumen FAR Overseas Air hampir selalu PDF -- fallback 'pdf', cek ekstensi HTML jaga2.
function guessPreviewKind(filename: string | undefined | null): 'pdf' | 'html' {
  if (filename && /\.html?$/i.test(filename)) return 'html';
  return 'pdf';
}

type PreviewTarget = { title: string; src: string; externalUrl: string; kind: 'pdf' | 'html' };

// Modal preview file -- REPLIKA PERSIS `PreviewModal` AuditPoPage.tsx/AccountingRekapPage.tsx/
// `BunkerPreviewModal` BunkerCompareDocModal.tsx: fetch dulu lewat JS, suntikkan hasilnya via
// srcDoc (HTML)/blob: (PDF, di-rewrap paksa `type:'application/pdf'`) -- lihat komentar lengkap
// di versi aslinya (AuditPoPage.tsx) soal kenapa `src` langsung ke proxy/Drive tidak dipakai.
function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'html' | 'blob' | 'error'>('loading');
  const [htmlContent, setHtmlContent] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setStatus('loading');

    (async () => {
      try {
        const res = await fetch(target.src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (cancelled) return;
        if (target.kind === 'html') {
          const text = await res.text();
          if (cancelled) return;
          setHtmlContent(text);
          setStatus('html');
        } else {
          const rawBlob = await res.blob();
          if (cancelled) return;
          const blob = rawBlob.type === 'application/pdf' ? rawBlob : new Blob([rawBlob], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setStatus('blob');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target.src, target.kind]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[97vw] max-w-[1600px] h-[99.5vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-[#5A305A] text-sm truncate">{target.title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {(status === 'html' || status === 'blob') && (
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors">
                <Printer size={13} /> Print
              </button>
            )}
            <a href={target.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors">
              <Download size={13} /> Download File
            </a>
            <button onClick={onClose} className="text-[#5A305A]/60 hover:text-[#5A305A] p-1.5"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-slate-100">
          {status === 'loading' && (
            <div className="w-full h-full flex items-center justify-center text-[#5A305A] text-sm">Memuat preview...</div>
          )}
          {status === 'error' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-8">
              <p className="text-[#5A305A] text-sm font-semibold">Preview tidak bisa dimuat di dalam aplikasi.</p>
              <p className="text-[#5A305A]/70 text-xs max-w-md">Kemungkinan server asal file ini memblokir akses dari luar (CORS). Gunakan tombol "Download File" di pojok kanan atas untuk melihatnya.</p>
            </div>
          )}
          {status === 'html' && (
            <iframe ref={iframeRef} srcDoc={htmlContent} title={target.title} className="w-full h-full border-0" sandbox="allow-same-origin allow-modals" />
          )}
          {status === 'blob' && (
            <iframe ref={iframeRef} src={blobUrl} title={target.title} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

function toPreviewTarget(d: DokumenEntry): PreviewTarget | null {
  const src = buildPreviewSrc(d.drive_file_id);
  if (!src) return null;
  return { title: d.filename || 'Dokumen', src, externalUrl: d.file_url || src, kind: guessPreviewKind(d.filename) };
}

// `dokumen_urls` (jsonb array di `rekapan_far_overseas_air`) diisi OTOMATIS oleh n8n tiap
// dokumen yang diproses berhasil diupload ke Google Drive (bukan oleh app ini) -- file sudah
// di-share "anyone with link can view".
//
// 1 shipment FAR Overseas Air = 1 dokumen (BEDA dari Bunker/Audit AP yang bisa py banyak file
// per baris) -- klik tombol "Dokumen" LANGSUNG buka `PreviewModal`, TIDAK ADA modal
// list/perantara lagi (versi awal sempat py modal list dulu spt Bunker, DIHAPUS atas permintaan
// eksplisit user: "tidak perlu modal, langsung ke preview dokumennya"). List ringkas HANYA
// dipakai sbg fallback kalau kebetulan `dokumen_urls` py >1 entry (jaga2, bukan alur normal).
export default function FarOverseasAirDocumentsModal({ record, onClose }: {
  record: any;
  onClose: () => void;
}) {
  const parsed = parseJsonField(record?.dokumen_urls);
  const docs: DokumenEntry[] = Array.isArray(parsed) ? parsed.filter(d => d && (d.drive_file_id || d.file_url)) : [];

  if (docs.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center">
          <FolderOpen size={28} className="text-[#5A305A]/40 mx-auto mb-3" />
          <p className="text-sm text-[#5A305A] italic mb-4">Dokumen tidak tersedia.</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors">Tutup</button>
        </div>
      </div>
    );
  }

  if (docs.length === 1) {
    const target = toPreviewTarget(docs[0]);
    if (target) return <PreviewModal target={target} onClose={onClose} />;
  }

  // Fallback (>1 dokumen ATAU satu2nya dokumen tidak py drive_file_id yg valid) -- list ringkas.
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderOpen size={17} className="text-[#5A305A]" />
            <h2 className="text-base font-bold text-[#5A305A]">Dokumen</h2>
          </div>
          <button onClick={onClose} className="text-[#5A305A] hover:text-[#5A305A] p-1"><X size={20} /></button>
        </div>
        <DocumentsListWithPreview docs={docs} />
      </div>
    </div>
  );
}

function DocumentsListWithPreview({ docs }: { docs: DokumenEntry[] }) {
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  return (
    <>
      <div className="overflow-y-auto divide-y divide-slate-100">
        {docs.map((d, i) => {
          const target = toPreviewTarget(d);
          return (
            <div key={d.drive_file_id || d.file_url || i} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} className="text-[#5A305A]/50 shrink-0" />
                <p className="text-sm font-medium text-[#5A305A] break-words">{d.filename || 'Dokumen tanpa nama'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {target ? (
                  <button
                    onClick={() => setPreviewTarget(target)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors"
                  >
                    <Eye size={13} /> Preview
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">Preview unavailable</span>
                )}
                {d.file_url && (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[#5A305A] text-xs font-semibold hover:bg-slate-50 transition-colors"
                  >
                    <Download size={13} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {previewTarget && <PreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />}
    </>
  );
}
