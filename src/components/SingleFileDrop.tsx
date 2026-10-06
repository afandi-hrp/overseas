import React, { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileText, UploadCloud, X } from 'lucide-react';

// Kotak upload 1 file (drag & drop) -- dipakai halaman migrasi HTML mandiri (Requisition RH, LSA).
// Diekstrak dari RequisitionRhPage (2026-10-06) tanpa ubah perilaku; prop baru `required` (default
// true) & `badge` (mis. "Optional").
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Pengganti input file polos. Input asli TETAP ada (sr-only, bukan display:none
// supaya validasi `required` browser tetap muncul) & tetap jadi sumber file saat submit.
export default function SingleFileDrop({ step, label, hint, accept, inputRef, file, onFile, disabled, required = true, badge }: {
  step: number; label: string; hint: string; accept: string; required?: boolean; badge?: string;
  inputRef: React.RefObject<HTMLInputElement | null>; file: File | null; onFile: (f: File | null) => void; disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const exts = accept.split(',').map(s => s.trim().toLowerCase());
  const isSheet = file ? /\.(xls|xlsx)$/i.test(file.name) : false;
  const pick = (f: File | null) => { setRejected(null); onFile(f); };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-[#5A305A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{step}</span>
        <span className="text-xs font-semibold text-[#2A1A2C]">{label}</span>
        {badge && <span className="ml-auto text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{badge}</span>}
      </div>
      <label
        onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault(); setOver(false);
          if (disabled || !inputRef.current) return;
          const f = e.dataTransfer.files?.[0];
          if (!f) return;
          if (!exts.some(x => f.name.toLowerCase().endsWith(x))) { setRejected(`Only ${exts.join(' / ')} files are accepted.`); return; }
          inputRef.current.files = e.dataTransfer.files;
          pick(f);
        }}
        className={`relative block rounded-xl border-2 border-dashed transition-colors ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
          over ? 'border-[#5A305A] bg-[#F5EDF3]' : file ? 'border-emerald-300 bg-emerald-50/60' : 'border-[#EADFD6] bg-[#FBF7F4] hover:border-[#5A305A]/50 hover:bg-[#F5EDF3]/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          required={required}
          disabled={disabled}
          className="sr-only"
          onChange={e => pick(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-3 p-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSheet ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
              {isSheet ? <FileSpreadsheet size={18} /> : <FileText size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#2A1A2C] truncate" title={file.name}>{file.name}</div>
              <div className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5"><CheckCircle2 size={11} /> {fmtSize(file.size)} · ready</div>
            </div>
            {!disabled && (
              <button
                type="button"
                title="Remove file"
                onClick={e => { e.preventDefault(); if (inputRef.current) inputRef.current.value = ''; pick(null); }}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-3 py-5">
            <UploadCloud size={22} className="text-[#5A305A]/70 mb-1.5" />
            <div className="text-xs font-semibold text-[#5A305A]">Click to choose or drop a file</div>
            <div className="text-[11px] text-[#6E5E70] mt-0.5">{hint}</div>
          </div>
        )}
      </label>
      {rejected && <div className="text-[11px] text-red-600 mt-1">{rejected}</div>}
    </div>
  );
}
