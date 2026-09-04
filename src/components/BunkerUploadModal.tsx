import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud, FolderOpen, CheckCircle2, FileText, Sparkles, X, AlertTriangle, RotateCcw } from 'lucide-react';

function humanizeUploadError(raw: string): string {
  const msg = (raw || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Could not connect to the server. Check your internet connection, then try again.';
  }
  if (msg.includes('webhook url tidak dikonfigurasi')) {
    return 'The webhook URL has not been configured on the server. Contact an admin to set it up.';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return 'The automation server did not respond in a reasonable time (timeout). The document may still be processing in the background — check the processing queue again shortly.';
  }
  if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('bad gateway') || msg.includes('unavailable') || msg.includes('econnrefused')) {
    return 'The automation server is currently unreachable (it may be busy or under maintenance). Please try again in a few minutes.';
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'Access to the automation server was denied. Contact an admin to check the credentials/permissions.';
  }
  if (msg.includes('413') || msg.includes('too large') || msg.includes('payload')) {
    return 'The file size is too large to send. Try compressing the file or uploading in multiple batches.';
  }
  return 'An error occurred while sending the document to the automation server. Please try again, or contact an admin if the problem keeps happening.';
}

const FileRow: React.FC<{ file: File; index: number; onRemove: (i: number) => void }> = ({ file, index, onRemove }) => {
  const size = file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : (file.size / 1024).toFixed(0) + ' KB';
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200">
      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
        <FileText size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#5A305A] truncate">{file.name}</p>
        <p className="text-[10px] text-[#5A305A] mt-0.5">{size}</p>
      </div>
      <button onClick={() => onRemove(index)} className="w-6 h-6 rounded-full bg-slate-200 hover:bg-red-200 text-[#5A305A] hover:text-red-600 flex items-center justify-center flex-shrink-0 transition-all">
        <X size={12} />
      </button>
    </div>
  );
};

// Dipakai di 2 tempat: (1) tombol "Upload Dokumen" di halaman utama Bunker -- noPoHint kosong,
// sistem coba baca No PO dari isi dokumen; (2) tombol "Upload dokumen susulan" di dalam modal
// Kelengkapan Dokumen -- noPoHint WAJIB diisi (no_po baris itu) supaya dokumen yang tidak selalu
// mencantumkan No PO di dalamnya sendiri (mis. Kwitansi) tetap bisa digabung ke baris yang benar.
export default function BunkerUploadModal({ onClose, onJobStarted, onSentNoJob, noPoHint }: {
  onClose: () => void;
  onJobStarted: (jobId: string) => void;
  onSentNoJob: (message: string, isWarning: boolean) => void;
  noPoHint?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorModal, setErrorModal] = useState<{ friendly: string; raw: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const allowed = Array.from(newFiles).filter(f =>
      f.type === 'application/pdf' || f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/jpg'
    );
    if (!allowed.length) return;
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + '_' + f.size));
      return [...prev, ...allowed.filter(f => !existing.has(f.name + '_' + f.size))];
    });
  }, []);

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };

  const handleSubmit = async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    const formData = new FormData();
    files.forEach((file, i) => formData.append('file_' + i, file));
    if (noPoHint) formData.append('no_po_hint', noPoHint);
    try {
      const customWebhook = localStorage.getItem('n8n_bunker_webhook_url');
      const headers: HeadersInit = { 'X-Webhook-Type': 'bunker' };
      if (customWebhook) headers['X-Webhook-Url'] = customWebhook;

      const res = await fetch('/api/n8n-proxy-start', { method: 'POST', body: formData, headers });
      const data = await res.json();
      if (!res.ok || data.status === 'error') throw new Error(data.pesan || 'Failed to start the process on the automation server.');

      if (data.job_id) {
        onJobStarted(data.job_id);
      } else if (data.status === 'warning') {
        onSentNoJob(data.pesan || 'Document sent, but its status could not be confirmed yet.', true);
      } else {
        onSentNoJob('Document sent to the processing queue successfully.', false);
      }
      onClose();
    } catch (err: any) {
      const raw = err?.message || String(err);
      setErrorModal({ friendly: humanizeUploadError(raw), raw });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex justify-center items-center p-2 sm:p-4">
      <div className="bg-white w-[70vw] max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#5A305A]">Upload Document — Bunker</h2>
            <p className="text-xs font-light text-[#5A305A] mt-0.5">PO, Invoice, Tax Invoice, Receipt, Bunker Receipt, Tank Sounding, Stock In, Official Report, Lab Results, Credit Note</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {noPoHint ? (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
              This document will automatically be merged into <span className="font-bold">No PO: {noPoHint}</span>, even if the document itself doesn't mention the No PO (e.g. a Receipt).
            </div>
          ) : (
            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#5A305A]">
              Documents for the same No PO will automatically be merged into existing data, no need to re-enter it. You can upload some document types first and add the rest later.
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest">Step 1 — Select Files</p>
            {files.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{files.length} files</span>
            )}
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              dragging ? 'border-[#5A305A] bg-[#5A305A]/5' :
              files.length > 0 ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400' :
              'border-slate-200 bg-slate-50 hover:border-[#5A305A]/40 hover:bg-[#5A305A]/5'
            }`}
          >
            <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center transition-colors ${
              dragging ? 'bg-[#5A305A] text-white' : files.length > 0 ? 'bg-emerald-500 text-white' : 'bg-[#5A305A]/8 text-[#5A305A]'
            }`}>
              {dragging ? <FolderOpen size={22} strokeWidth={1.75} /> : files.length > 0 ? <CheckCircle2 size={22} strokeWidth={1.75} /> : <UploadCloud size={22} strokeWidth={1.75} />}
            </div>
            <p className="font-semibold text-sm text-[#5A305A]">
              {dragging ? 'Drop the files here...' : files.length === 0 ? 'Click or drag & drop files (PDF, JPG, PNG)' : 'Click to add more files'}
            </p>
            <p className="text-xs text-[#5A305A] mt-1">
              You can upload just some document types, no need to have everything at once.
            </p>
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, i) => <FileRow key={file.name + i} file={file} index={i} onRemove={removeFile} />)}
              <button onClick={() => setFiles([])} className="w-full py-2 text-xs text-[#5A305A] hover:text-red-500 border border-dashed border-slate-200 hover:border-red-300 rounded-xl transition-all">
                Remove all files
              </button>
            </div>
          )}

          <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mt-5 mb-3">Step 2 — Process & Submit</p>
          <button
            onClick={handleSubmit}
            disabled={!files.length || uploading}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              (files.length && !uploading) ? 'bg-[#5A305A] hover:bg-[#73507B] text-white shadow-md active:scale-[0.98]' : 'bg-slate-100 text-[#5A305A] cursor-not-allowed'
            }`}
          >
            {uploading ? 'Sending document...' : <><Sparkles size={15} /> Process {files.length || ''} Document(s) with AI</>}
          </button>
        </div>
      </div>

      {errorModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-[#5A305A] leading-tight">Failed to Send Document</h3>
                <p className="text-xs font-light text-[#5A305A] mt-0.5">File was not sent to the automation server</p>
              </div>
            </div>
            <p className="text-sm text-[#5A305A] leading-relaxed mb-4">{errorModal.friendly}</p>
            <div className="mb-5 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-[#5A305A] break-words max-h-32 overflow-y-auto">{errorModal.raw}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setErrorModal(null)} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all">
                Close
              </button>
              <button onClick={() => { setErrorModal(null); handleSubmit(); }} className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5">
                <RotateCcw size={14} /> Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
