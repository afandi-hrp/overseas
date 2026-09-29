import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/apiFetch';
import { supabase } from '../lib/supabase';
import { X, FileText, Download, Printer, FolderOpen } from 'lucide-react';
import { parseJsonField, FAR_FONT_FAMILY, PAYMENT_PROOF_BUCKET } from '../utils/FarOverseasAirHelpers';

// `storage_path` = file di Supabase Storage (bukti bayar, tahap 2); `kind_label` = label jenis.
export type DokumenEntry = { filename?: string; file_url?: string; drive_file_id?: string; storage_path?: string; kind_label?: string };

// Daftar dokumen sumber memo -- `dokumen_urls` (jsonb array) diisi OTOMATIS oleh n8n tiap
// dokumen yang diproses berhasil diupload ke Google Drive (bukan oleh app ini).
export function getDokumenList(record: any): DokumenEntry[] {
  const parsed = parseJsonField(record?.dokumen_urls);
  return Array.isArray(parsed) ? parsed.filter((d: any) => d && (d.drive_file_id || d.file_url)) : [];
}

// Dokumen utk viewer Docs: dokumen sumber + bukti bayar (kalau sudah Paid). Memo & Cost Validation
// SENGAJA tidak masuk (punya tombol sendiri, spek).
export function getMemoDocs(record: any): DokumenEntry[] {
  const out = getDokumenList(record);
  if (record?.payment_proof_path) {
    const name = String(record.payment_proof_path).split('/').pop() || 'payment-proof';
    out.push({ filename: name.replace(/^\d+-/, ''), storage_path: record.payment_proof_path, kind_label: 'Payment proof' });
  }
  return out;
}

// Proxy backend `/api/drive-file-proxy?id=<drive_file_id>` -- REPLIKA PERSIS `buildPreviewSrc()`
// AuditPoPage.tsx/AccountingRekapPage.tsx/`buildBunkerPreviewSrc()` BunkerCompareDocModal.tsx.
// Iframe `src` LANGSUNG ke Google Drive tampil dgn chrome/UI Drive sendiri -- makanya file di-
// fetch via JS lewat proxy dulu, baru disuntik (srcDoc/blob:) ke iframe polos.
function buildPreviewSrc(driveFileId: string | undefined | null): string | null {
  if (!driveFileId) return null;
  return `/api/drive-file-proxy?id=${encodeURIComponent(driveFileId)}`;
}

// Dokumen FAR Overseas Air hampir selalu PDF -- fallback 'pdf', cek ekstensi HTML jaga2.
function guessPreviewKind(filename: string | undefined | null): 'pdf' | 'html' | 'image' {
  if (filename && /\.html?$/i.test(filename)) return 'html';
  if (filename && /\.(png|jpe?g)$/i.test(filename)) return 'image';
  return 'pdf';
}

// Iframe preview 1 dokumen (fetch via proxy -> srcDoc/blob:). Dipakai modal Documents DAN panel
// kiri modal Edit memo. `iframeRef` opsional (utk tombol Print).
type DrivePreviewFrameProps = {
  doc: DokumenEntry;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  onStatus?: (s: 'loading' | 'ready' | 'error') => void;
};
export const DrivePreviewFrame: React.FC<DrivePreviewFrameProps> = ({ doc, iframeRef, onStatus }) => {
  const src = doc.storage_path ? `storage:${doc.storage_path}` : buildPreviewSrc(doc.drive_file_id);
  const kind = guessPreviewKind(doc.storage_path || doc.filename);
  const [status, setStatus] = useState<'loading' | 'html' | 'blob' | 'image' | 'error'>('loading');
  const [htmlContent, setHtmlContent] = useState('');
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setStatus('loading');
    onStatus?.('loading');
    if (!src) { setStatus('error'); onStatus?.('error'); return; }

    (async () => {
      try {
        if (doc.storage_path) {
          // Bukti bayar: unduh lewat Supabase Storage (policy bucket, sql/027 bagian G).
          const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).download(doc.storage_path);
          if (error || !data) throw new Error(error?.message || 'download failed');
          if (cancelled) return;
          const blob = kind === 'image' ? data : (data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' }));
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setStatus(kind === 'image' ? 'image' : 'blob');
          onStatus?.('ready');
          return;
        }
        const res = await apiFetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (cancelled) return;
        if (kind === 'html') {
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
        onStatus?.('ready');
      } catch {
        if (!cancelled) { setStatus('error'); onStatus?.('error'); }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, kind]);

  if (status === 'loading') {
    return <div className="w-full h-full flex items-center justify-center text-[#6E5E70] text-sm">Loading preview...</div>;
  }
  if (status === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-8">
        <p className="text-[#2A1A2C] text-sm font-semibold">This file can't be previewed inside the app.</p>
        <p className="text-[#6E5E70] text-xs max-w-md">
          {doc.storage_path ? 'The payment proof could not be loaded from storage.' : src ? 'The source server may be blocking access. Use "Download file" to open it.' : 'The file has no Google Drive ID. Use "Download file" to open it.'}
        </p>
      </div>
    );
  }
  if (status === 'html') {
    return <iframe ref={iframeRef as React.RefObject<HTMLIFrameElement>} srcDoc={htmlContent} title={doc.filename || 'Document'} className="w-full h-full border-0 bg-white" sandbox="allow-same-origin allow-modals" />;
  }
  if (status === 'image') {
    return <div className="w-full h-full overflow-auto flex items-start justify-center p-4 bg-white"><img src={blobUrl} alt={doc.filename || 'Document'} className="max-w-full h-auto" /></div>;
  }
  return <iframe ref={iframeRef as React.RefObject<HTMLIFrameElement>} src={blobUrl} title={doc.filename || 'Document'} className="w-full h-full border-0 bg-white" />;
};

// Jenis dokumen dari nama file (label daftar kiri) -- tebakan ringan, bukan klasifikasi AI.
function docKindLabel(filename: string | undefined, idx: number, explicit?: string): string {
  if (explicit) return explicit;
  const f = (filename || '').toLowerCase();
  if (/\bpo\b|purchase/.test(f)) return 'PO';
  if (/receipt|log|gr[_\s-]/.test(f)) return 'Goods receipt';
  if (/invoice|inv/.test(f) || idx === 0) return 'Freight invoice';
  return 'Document';
}

// Documents viewer (spek redesain): kiri daftar file, kanan preview (lihat saja). File pertama
// LANGSUNG terbuka saat modal dibuka -- tetap memenuhi permintaan lama user "langsung ke preview
// dokumennya, tanpa modal perantara". Hanya dokumen sumber (`dokumen_urls`); memo & Cost
// Validation punya tombol sendiri.
export default function FarOverseasAirDocumentsModal({ record, onClose }: {
  record: any;
  onClose: () => void;
}) {
  const docs = getMemoDocs(record);
  const [activeIdx, setActiveIdx] = useState(0);
  const [frameStatus, setFrameStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const active = docs[activeIdx];

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  return createPortal(
    <div className="fixed inset-0 bg-[#2A1A2C]/50 backdrop-blur-sm z-[90] flex items-center justify-center p-2 sm:p-4" style={{ fontFamily: FAR_FONT_FAMILY }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[97vw] max-w-[1500px] h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EADFD6] shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6E5E70]">Docs</p>
            <h3 className="font-bold text-[#2A1A2C] text-sm truncate">{record?.memo_title || 'Memo'} · {record?.ship_via || '—'} · Invoice {record?.no_invoice || '—'}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {active?.storage_path && (
              <button onClick={async () => {
                const { data } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(active.storage_path!, 300);
                if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
              }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EADFD6] text-[#2A1A2C] text-xs font-semibold hover:bg-[#F5EDF3] transition-colors">
                <Download size={13} /> Download file
              </button>
            )}
            {active && frameStatus === 'ready' && !active.storage_path && (
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EADFD6] text-[#2A1A2C] text-xs font-semibold hover:bg-[#F5EDF3] transition-colors">
                <Printer size={13} /> Print
              </button>
            )}
            {active?.file_url && (
              <a href={active.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EADFD6] text-[#2A1A2C] text-xs font-semibold hover:bg-[#F5EDF3] transition-colors">
                <Download size={13} /> Download file
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="text-[#6E5E70] hover:text-[#2A1A2C] p-1.5"><X size={18} /></button>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
            <FolderOpen size={30} className="text-[#6B3470]/40" />
            <p className="text-sm font-semibold text-[#2A1A2C]">No source documents yet.</p>
            <p className="text-xs text-[#6E5E70] max-w-sm">Documents appear here automatically once the upload has been processed and saved to Google Drive.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-[#EADFD6] bg-[#FBF3EC]/60 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1.5 p-2">
              {docs.map((d, i) => (
                <button
                  key={d.drive_file_id || d.storage_path || d.file_url || i}
                  onClick={() => setActiveIdx(i)}
                  className={`text-left rounded-xl px-3 py-2.5 border transition-colors shrink-0 md:shrink min-w-[200px] md:min-w-0 ${i === activeIdx ? 'bg-white border-[#6B3470] shadow-sm' : 'bg-white/60 border-transparent hover:border-[#EADFD6]'}`}
                >
                  <div className="flex items-start gap-2">
                    <FileText size={15} className="text-[#6B3470] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B3470]">{docKindLabel(d.filename, i, d.kind_label)}</p>
                      <p className="text-xs font-semibold text-[#2A1A2C] break-words">{d.filename || 'Untitled document'}</p>
                      {!d.drive_file_id && !d.storage_path && <p className="text-[10px] text-[#6E5E70] mt-0.5">Preview unavailable — download only</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 bg-[#F5EDF3]/40">
              {active && <DrivePreviewFrame key={active.drive_file_id || active.storage_path || active.file_url || activeIdx} doc={active} iframeRef={iframeRef} onStatus={setFrameStatus} />}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
