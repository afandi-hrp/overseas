import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { UploadCloud, FolderOpen, CheckCircle2, FileText, Sparkles, Plane, Ship, X, AlertTriangle, RotateCcw } from 'lucide-react'
import ProcessingQueue from '../components/ProcessingQueue'
import Greeting from '../components/Greeting'

// ─── Terjemahkan error teknis jadi pesan yang mudah dipahami ──
function humanizeUploadError(raw: string): string {
  const msg = (raw || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.';
  }
  if (msg.includes('webhook url tidak dikonfigurasi')) {
    return 'URL webhook belum diatur di server. Hubungi admin untuk mengatur konfigurasinya.';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return 'Server otomasi tidak merespon dalam waktu yang wajar (timeout). Dokumen mungkin masih diproses di belakang layar — cek "Antrian Proses" beberapa saat lagi sebelum mencoba ulang.';
  }
  if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('bad gateway') || msg.includes('unavailable') || msg.includes('econnrefused')) {
    return 'Server otomasi sedang tidak dapat dihubungi (kemungkinan sedang sibuk atau maintenance). Coba lagi dalam beberapa menit.';
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'Akses ke server otomasi ditolak. Hubungi admin untuk memeriksa kredensial/izin akses.';
  }
  if (msg.includes('413') || msg.includes('too large') || msg.includes('payload')) {
    return 'Ukuran file terlalu besar untuk dikirim. Coba kompres file atau kirim dalam beberapa kali upload.';
  }
  return 'Terjadi kesalahan saat mengirim dokumen ke server otomasi. Silakan coba lagi, atau hubungi admin jika masalah terus berulang.';
}

// ─── Modal Notifikasi Gagal Kirim ──────────────────────────────
function UploadErrorModal({ friendly, raw, onClose, onRetry }: { friendly: string, raw: string, onClose: () => void, onRetry: () => void }) {
  const [showDetail, setShowDetail] = useState(false)
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="font-bold text-[#5A305A] leading-tight">Gagal Mengirim Dokumen</h3>
            <p className="text-xs font-light text-[#5A305A] mt-0.5">File tidak terkirim ke server otomasi</p>
          </div>
        </div>
        <p className="text-sm text-[#5A305A] leading-relaxed mb-4">{friendly}</p>
        {raw && (
          <div className="mb-5">
            <button onClick={() => setShowDetail(s => !s)} className="text-xs text-[#5A305A] hover:text-[#5A305A] font-semibold underline">
              {showDetail ? 'Sembunyikan detail teknis' : 'Lihat detail teknis'}
            </button>
            {showDetail && (
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-[#5A305A] break-words max-h-32 overflow-y-auto">{raw}</div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all">
            Tutup
          </button>
          <button onClick={onRetry} className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5">
            <RotateCcw size={14} /> Coba Lagi
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panduan dokumen per jenis ────────────────────────────────
const PANDUAN: Record<string, {label: string, wajib: boolean, icon: string}[]> = {
  PIB: [
    { label: 'Dokumen PIB (BC 2.0)',           wajib: true,  icon: '🏛️' },
    { label: 'Invoice Duty DHL/FedEx (FINAL)', wajib: true,  icon: '💰' },
    { label: 'Invoice Freight DHL/FedEx',      wajib: true,  icon: '✈️' },
    { label: 'BPN (Bukti Penerimaan Negara)',  wajib: true,  icon: '🏦' },
    { label: 'Vendor Invoice / CIPL',          wajib: false, icon: '📄' },
    { label: 'Dokumen lain boleh disertakan — AI akan abaikan yang tidak relevan', wajib: false, icon: 'ℹ️' },
  ],
  CN: [
    { label: 'Dokumen SPPBMCP',                wajib: true,  icon: '🏛️' },
    { label: 'Invoice Duty DHL/FedEx',         wajib: true,  icon: '💰' },
    { label: 'Invoice Freight DHL/FedEx',      wajib: true,  icon: '✈️' },
    { label: 'History Tracking Bea Cukai',     wajib: true,  icon: '🔍' },
    { label: 'Vendor Invoice / CIPL',          wajib: false, icon: '📄' },
    { label: 'Dokumen lain boleh disertakan — AI akan abaikan yang tidak relevan', wajib: false, icon: 'ℹ️' },
  ],
}

// ─── Loading Overlay ──────────────────────────────────────────
function LoadingOverlay({ jenis, count }: { jenis: string, count: number }) {
  const [step, setStep] = useState(0)
  const steps = [
    'Mengirim ' + count + ' file ke n8n...',
    'AI memproses setiap PDF satu per satu...',
    'Mengidentifikasi jenis setiap dokumen...',
    'Mengekstrak data kepabeanan...',
    'Mengekstrak data courier & BPN...',
    'Membaca vendor invoice untuk PO & item price...',
    'Menghitung & memvalidasi angka...',
    'Menyimpan ke Supabase...',
  ]

  useEffect(() => {
    const id = setInterval(() => {
      setStep(s => s < steps.length - 1 ? s + 1 : s)
    }, 4000)
    return () => clearInterval(id)
  }, [steps.length])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5A305A]/80 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="relative w-20 h-20 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-[#5A305A]/10" />
          <div className="absolute inset-0 rounded-full border-4 border-[#5A305A] border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">
            {jenis === 'PIB' ? '📋' : '📦'}
          </div>
        </div>
        <h3 className="font-bold text-[#5A305A] text-lg mb-1">AI Sedang Membaca Dokumen</h3>
        <p className="text-[#5A305A] text-xs mb-5">
          {count} file · Menunggu respons n8n (maksimal 5 menit)
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left space-y-1">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs py-0.5 transition-all duration-500 ${
              i < step ? 'text-emerald-500' : i === step ? 'text-[#5A305A] font-semibold' : 'text-[#5A305A]'
            }`}>
              <span className="w-4 flex-shrink-0 text-center">
                {i < step ? '✓' : i === step ? '▶' : '·'}
              </span>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── File Row ─────────────────────────────────────────────────
const FileRow: React.FC<{ file: File, index: number, onRemove: (i: number) => void }> = ({ file, index, onRemove }) => {
  const size = file.size > 1024 * 1024
    ? (file.size / 1024 / 1024).toFixed(1) + ' MB'
    : (file.size / 1024).toFixed(0) + ' KB'
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/70 border border-white/60">
      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
        <FileText size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#5A305A] truncate">{file.name}</p>
        <p className="text-[10px] text-[#5A305A] mt-0.5">{size}</p>
      </div>
      <button
        onClick={() => onRemove(index)}
        className="w-6 h-6 rounded-full bg-slate-200 hover:bg-red-200 text-[#5A305A] hover:text-red-600 flex items-center justify-center flex-shrink-0 transition-all"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ─── Hasil Sukses ─────────────────────────────────────────────
function ResultSuccess({ data, onReset }: { data: any, onReset: () => void }) {
  const klasifikasi = data.klasifikasi || []
  return (
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-lg">✓</div>
        <div>
          <p className="font-bold text-emerald-800">Dokumen Berhasil Diarsipkan</p>
          <p className="text-xs text-emerald-600 mt-0.5">{data.pesan}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-2 mb-3">
        {[['Jenis', data.jenis], ['No. Dokumen', data.no_dokumen], ['AWB', data.awb], ['Vendor', data.vendor], ['PO ORI', data.po_ori]].map(([label, val]) => (
          <div key={label} className="flex justify-between items-start gap-4">
            <span className="text-xs text-[#5A305A] flex-shrink-0">{label}</span>
            <span className="text-xs font-semibold text-[#5A305A] text-right font-mono truncate max-w-[220px]">{val || '—'}</span>
          </div>
        ))}
      </div>
      {klasifikasi.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-emerald-200 mb-4">
          <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mb-2">Hasil Identifikasi AI</p>
          <div className="space-y-1.5">
            {klasifikasi.map((k: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#5A305A] truncate flex-1">{k.file}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  ['PIB','SPPBMCP'].includes(k.jenis) ? 'bg-blue-100 text-blue-700' :
                  k.jenis === 'INVOICE_DUTY'    ? 'bg-amber-100 text-amber-700' :
                  k.jenis === 'INVOICE_FREIGHT' ? 'bg-sky-100 text-sky-700' :
                  k.jenis === 'BPN'             ? 'bg-purple-100 text-purple-700' :
                  k.jenis === 'VENDOR_INVOICE'  ? 'bg-emerald-100 text-emerald-700' :
                                                  'bg-slate-100 text-[#5A305A]'
                }`}>{k.jenis}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onReset} className="py-3 rounded-xl border border-emerald-300 text-emerald-700 font-semibold text-sm hover:bg-emerald-100 transition-all">
          Upload Lagi
        </button>
        <Link to="/dashboard" className="py-3 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm text-center transition-all">
          Lihat Dashboard →
        </Link>
      </div>
    </div>
  )
}

// ─── Hasil Gagal ──────────────────────────────────────────────
function ResultError({ data, onReset }: { data: any, onReset: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-red-500 flex items-center justify-center text-white text-lg">✕</div>
        <div>
          <p className="font-bold text-red-800">Gagal Memproses Dokumen</p>
          {data.node_gagal && data.node_gagal !== '-' && (
            <p className="text-xs text-red-500 mt-0.5 font-mono">Node: {data.node_gagal}</p>
          )}
        </div>
      </div>
      <div className="bg-white rounded-xl p-4 border border-red-200 space-y-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold text-[#5A305A] uppercase tracking-wider mb-1">Pesan Error</p>
          <p className="text-sm text-red-700">{data.pesan || 'Terjadi kesalahan tidak diketahui'}</p>
        </div>
        {data.saran && data.saran !== data.pesan && (
          <div>
            <p className="text-[10px] font-semibold text-[#5A305A] uppercase tracking-wider mb-1">💡 Saran</p>
            <p className="text-sm text-[#5A305A]">{data.saran}</p>
          </div>
        )}
      </div>
      <button onClick={onReset} className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-all">
        Coba Lagi
      </button>
    </div>
  )
}

// ─── Halaman Utama ────────────────────────────────────────────
export default function UploadPage({ fixedType }: { fixedType?: 'courier' | 'sea_air' } = {}) {
  const [jenis,   setJenis]   = useState('PIB')
  const [webhookType, setWebhookType] = useState<'courier' | 'sea_air'>(fixedType || 'courier')
  const [files,   setFiles]   = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [result,  setResult]  = useState<any>(null)
  const [errorModal, setErrorModal] = useState<{ friendly: string, raw: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = (fixedType === 'sea_air' ? 'Upload Dokumen Sea & Air' : fixedType === 'courier' ? 'Upload Dokumen Courier' : 'Upload Dokumen') + ' · IMI Import System'
  }, [fixedType])

  const panduan   = PANDUAN[jenis]
  const canSubmit = files.length >= 4 && !loading

  const addFiles = useCallback((newFiles: FileList | null) => {
    if(!newFiles) return
    const allowed = Array.from(newFiles).filter(f => 
      f.type === 'application/pdf' || 
      f.type === 'image/jpeg' || 
      f.type === 'image/png' ||
      f.type === 'image/jpg'
    )
    if (!allowed.length) return
    
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + '_' + f.size))
      return [...prev, ...allowed.filter(f => !existing.has(f.name + '_' + f.size))]
    })
  }, [])

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }

  const handleJenisChange = (j: string) => { setJenis(j); setResult(null) }
  const handleReset = () => { setFiles([]); setResult(null) }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setResult(null)
    const formData = new FormData()
    files.forEach((file, i) => formData.append('file_' + i, file))
    try {
      const customWebhook = localStorage.getItem(webhookType === 'courier' ? 'n8n_webhook_url' : 'n8n_seaair_webhook_url');
      const headers: HeadersInit = {
        'X-Webhook-Type': webhookType
      };
      if (customWebhook) {
        headers['X-Webhook-Url'] = customWebhook;
      }
      
      const res  = await fetch('/api/n8n-proxy-start', { method: 'POST', body: formData, headers })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.pesan || 'Gagal memulai proses ke server otomasi.')

      // Success quick response
      if (data.status === 'warning') {
        setToastMessage('⚠️ ' + data.pesan);
      } else {
        setToastMessage('Dokumen berhasil dikirim ke antrian proses.');
      }
      setTimeout(() => setToastMessage(null), 8000);
      setFiles([]);
      setResult(null);
    } catch (err: any) {
      const raw = err?.message || String(err);
      setErrorModal({ friendly: humanizeUploadError(raw), raw });
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 font-medium text-sm z-[9999] min-w-[300px]">
          <div className="flex items-center gap-3">
            {toastMessage.includes('Gagal') ? <span className="text-rose-400 text-lg">❌</span> : toastMessage.includes('⚠️') ? <span className="text-amber-400 text-lg">⚠️</span> : <span className="text-emerald-400 text-lg">✅</span>}
            <span className="leading-tight max-w-[400px]">{toastMessage.replace('⚠️ ', '')}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-[#5A305A] hover:text-white p-1 ml-4">&times;</button>
        </div>
      )}

      {errorModal && (
        <UploadErrorModal
          friendly={errorModal.friendly}
          raw={errorModal.raw}
          onClose={() => setErrorModal(null)}
          onRetry={() => { setErrorModal(null); handleSubmit(); }}
        />
      )}

      <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
        {fixedType && (
          <header className="px-6 pt-1 pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0 shadow-sm">
                  {fixedType === 'sea_air' ? <Ship size={20} /> : <Plane size={20} />}
                </div>
                <div>
                  <h1 className="font-bold text-[#5A305A] text-base leading-tight">
                    Upload Dokumen {fixedType === 'sea_air' ? 'Sea & Air' : 'Courier'}
                  </h1>
                  <p className="text-xs font-light text-[#5A305A] mt-0.5">
                    {fixedType === 'sea_air' ? 'AI akan membaca & mengarsipkan dokumen sea & air secara otomatis' : 'AI akan membaca & mengarsipkan dokumen DHL/FedEx secara otomatis'}
                  </p>
                </div>
              </div>
              <Greeting />
            </div>
          </header>
        )}

        <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
          <ProcessingQueue type={webhookType} />

          {/* Webhook Selector — disembunyikan jika halaman sudah spesifik Courier/Sea & Air */}
          {!fixedType && (
            <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 p-1 shadow-sm flex">
              <button
                onClick={() => setWebhookType('courier')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  webhookType === 'courier' ? 'bg-[#5A305A] text-white shadow-sm' : 'text-[#5A305A] hover:bg-slate-50'
                }`}
              >
                Courier (DHL/FedEx)
              </button>
              <button
                onClick={() => setWebhookType('sea_air')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  webhookType === 'sea_air' ? 'bg-[#5A305A] text-white shadow-sm' : 'text-[#5A305A] hover:bg-slate-50'
                }`}
              >
                Sea & Air
              </button>
            </div>
          )}

          {/* Step 1 */}
          <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest">Langkah 1 — Upload Semua PDF</p>
              {files.length > 0 && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  files.length >= 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>{files.length} file</span>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                dragging ? 'border-[#5A305A] bg-[#5A305A]/5' :
                files.length >= 4 ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400' :
                'border-slate-200 bg-slate-50 hover:border-[#5A305A]/40 hover:bg-[#5A305A]/5'
              }`}
            >
              <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple className="hidden"
                onChange={(e) => addFiles(e.target.files)} />
              <div className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center transition-colors ${
                dragging ? 'bg-[#5A305A] text-white' : files.length >= 4 ? 'bg-emerald-500 text-white' : 'bg-[#5A305A]/8 text-[#5A305A]'
              }`}>
                {dragging ? <FolderOpen size={22} strokeWidth={1.75} /> : files.length >= 4 ? <CheckCircle2 size={22} strokeWidth={1.75} /> : <UploadCloud size={22} strokeWidth={1.75} />}
              </div>
              <p className="font-semibold text-sm text-[#5A305A]">
                {dragging ? 'Lepaskan file di sini...' :
                 files.length === 0 ? 'Klik atau drag & drop file (PDF, JPG, PNG)' :
                 'Klik untuk tambah file lagi'}
              </p>
              <p className="text-xs text-[#5A305A] mt-1">
                {files.length === 0 ? 'AI akan mengenali jenis setiap dokumen secara otomatis' :
                 files.length < 4 ? 'Tambahkan ' + (4 - files.length) + ' file lagi (minimal 4 wajib)' :
                 'Sudah cukup — boleh tambah vendor invoice jika ada'}
              </p>
            </div>

            {/* Daftar file */}
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, i) => (
                  <FileRow key={file.name + i} file={file} index={i} onRemove={removeFile} />
                ))}
                <button onClick={() => setFiles([])}
                  className="w-full py-2 text-xs text-[#5A305A] hover:text-red-500 border border-dashed border-slate-200 hover:border-red-300 rounded-xl transition-all">
                  Hapus semua file
                </button>
              </div>
            )}

            {/* Panduan */}
            <div className="mt-4 bg-[#5A305A]/5 rounded-xl p-4 border border-[#5A305A]/10">
              <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mb-2">
                Dokumen yang dibutuhkan
              </p>
              <div className="space-y-1.5">
                {panduan.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0">{item.icon}</span>
                    <span className={`text-xs leading-tight ${item.wajib ? 'text-[#5A305A] font-medium' : 'text-[#5A305A] italic'}`}>
                      {item.wajib && <span className="text-red-500 font-bold">* </span>}
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#5A305A] mt-2"><span className="text-red-500">*</span> Wajib</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/60 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest mb-3">Langkah 2 — Proses & Arsipkan</p>
            <button onClick={handleSubmit} disabled={!canSubmit || loading}
              className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                (canSubmit && !loading) ? 'bg-[#5A305A] hover:bg-[#73507B] text-white shadow-md active:scale-[0.98]'
                          : 'bg-slate-100 text-[#5A305A] cursor-not-allowed'
              }`}>
              {loading
                ? 'Mengirim dokumen...'
                : files.length < 4
                  ? 'Tambahkan ' + (4 - files.length) + ' file lagi untuk melanjutkan'
                  : <><Sparkles size={15} /> Proses {files.length} Dokumen dengan AI</>
              }
            </button>
            {files.length >= 4 && (
              <p className="text-center text-xs text-[#5A305A] mt-2">
                AI mengidentifikasi dan mengekstrak data setiap PDF secara otomatis
              </p>
            )}
          </div>



        </main>
      </div>
    </>
  )
}
