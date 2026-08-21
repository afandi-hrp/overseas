import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, CheckCircle2, XCircle, UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { parseJsonField, formatDateTimeID, KELENGKAPAN_LABELS, KELENGKAPAN_ORDER } from '../utils/BunkerHelpers';
import BunkerUploadModal from './BunkerUploadModal';

type SourceFile = { filename: string; uploaded_at: string; job_id: string };

export default function BunkerKelengkapanModal({ record, onClose, onChanged }: {
  record: any;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [rec, setRec] = useState(record);
  const [showUpload, setShowUpload] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | null>(null);
  const [activeJobError, setActiveJobError] = useState<string | null>(null);

  const kelengkapan = parseJsonField(rec.kelengkapan_status) || {};
  const sourceFiles: SourceFile[] = (parseJsonField(rec.source_files) || []) as SourceFile[];
  const sortedFiles = [...sourceFiles].sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));

  const refetchRow = useCallback(async () => {
    const { data } = await supabase.from('bunker_dokumen').select('*').eq('id', rec.id).maybeSingle();
    if (data) setRec(data);
  }, [rec.id]);

  // Polling job khusus modal ini -- begitu SUCCESS/FAILED, refetch baris supaya badge
  // kelengkapan & riwayat source_files ter-update tanpa perlu tutup-buka modal.
  useEffect(() => {
    if (!activeJobId || activeJobStatus !== 'PENDING') return;
    const iv = setInterval(async () => {
      const { data } = await supabase.from('bunker_processing_queue').select('*').eq('id', activeJobId).maybeSingle();
      if (data) {
        if (data.status === 'SUCCESS') {
          setActiveJobStatus('SUCCESS');
          refetchRow();
          onChanged?.();
        } else if (data.status === 'FAILED') {
          setActiveJobStatus('FAILED');
          setActiveJobError(data.error_message || 'Gagal memproses dokumen.');
        }
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [activeJobId, activeJobStatus, refetchRow, onChanged]);

  const handleJobStarted = (jobId: string) => {
    setActiveJobId(jobId);
    setActiveJobStatus('PENDING');
    setActiveJobError(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-[#5A305A]">Kelengkapan Dokumen</h2>
            <p className="text-xs font-light text-[#5A305A] mt-0.5 truncate">No PO: {rec.no_po || '-'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {activeJobId && activeJobStatus === 'PENDING' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
              <p className="text-xs font-semibold text-amber-800">Dokumen susulan sedang diproses AI...</p>
            </div>
          )}
          {activeJobId && activeJobStatus === 'SUCCESS' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold text-emerald-800">Dokumen berhasil digabung ke PO ini.</p>
            </div>
          )}
          {activeJobId && activeJobStatus === 'FAILED' && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-rose-800">Gagal memproses dokumen susulan.</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{activeJobError}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mb-2.5">Status Dokumen</p>
            <div className="grid grid-cols-2 gap-2">
              {KELENGKAPAN_ORDER.map(key => {
                const ok = !!kelengkapan[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                      ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    {ok ? <CheckCircle2 size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}
                    <span className="truncate">{KELENGKAPAN_LABELS[key] || key}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mb-2.5">Riwayat File Diupload</p>
            {sortedFiles.length === 0 ? (
              <p className="text-xs text-[#5A305A]/60 italic">Belum ada riwayat file.</p>
            ) : (
              <div className="space-y-1.5">
                {sortedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                    <FileText size={13} className="text-[#5A305A]/60 shrink-0" />
                    <span className="text-xs text-[#5A305A] font-medium truncate flex-1" title={f.filename}>{f.filename}</span>
                    <span className="text-[10px] text-[#5A305A]/60 shrink-0">{formatDateTimeID(f.uploaded_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowUpload(true)}
            className="w-full py-3 rounded-xl border-2 border-dashed border-[#5A305A]/30 hover:border-[#5A305A]/50 hover:bg-[#5A305A]/5 text-[#5A305A] font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            <UploadCloud size={16} /> Upload Dokumen Susulan
          </button>
        </div>
      </div>

      {showUpload && (
        <BunkerUploadModal
          noPoHint={rec.no_po}
          onClose={() => setShowUpload(false)}
          onJobStarted={handleJobStarted}
          onSentNoJob={() => { /* tidak ada job_id -- tidak perlu poll, biarkan user cek antrian */ }}
        />
      )}
    </div>
  );
}