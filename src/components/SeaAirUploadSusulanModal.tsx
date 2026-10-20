// Dialog "Upload Additional Document" (dokumen susulan) Sea & Air (2026-10-20). Pola SAMA dgn
// CourierUploadSusulanModal.tsx (modal, modal error "Failed to Send Document" + Try Again), TAPI komponen
// terpisah: Courier memakai header `X-Webhook-Type:'courier'` & localStorage `n8n_webhook_url`, Sea & Air memakai
// `sea_air` (logika kirim = UploadPage.tsx, TANPA override webhook) + field `awb_hint`, `mode=susulan`, `replace`.
// Dialog HANYA mengirim; polling status job, indikator "processing", dan refresh data ada di
// SeaAirUploadSusulanButton.tsx (dialog boleh ditutup saat proses berjalan -- prosesnya di backend n8n).
// Frontend TIDAK menulis ke tabel hasil apa pun untuk fitur ini; semua lewat webhook.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UploadCloud, FolderOpen, CheckCircle2, FileText, X, AlertTriangle, RotateCcw, ChevronDown, ChevronRight, XCircle, Loader2, Send } from 'lucide-react'
import { apiFetch } from '../lib/apiFetch'
import { supabase } from '../lib/supabase'
import { SA_LABEL, SA_BTN_PRIMARY, SA_BTN_OUTLINE, Chip } from './SeaAirAuditUi'

// Batas server (server/routes/n8n.ts: multer 50 MB/file, 30 file).
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_FILES = 30
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']

// Nilai kirim = daftar `replace` kontrak backend n8n Sea & Air; label hanya tampilan.
export const SEA_AIR_REPLACE_OPTIONS: { value: string; label: string }[] = [
  { value: 'pabean', label: 'PIB (customs declaration)' },
  { value: 'sppb', label: 'SPPB' },
  { value: 'bl', label: 'Bill of Lading / AWB' },
  { value: 'billing_djbc', label: 'Billing DJBC' },
  { value: 'bpn', label: 'BPN' },
  { value: 'po', label: 'Purchase Order (PO)' },
  { value: 'cipl', label: 'Commercial Invoice / Packing List (CIPL)' },
  { value: 'final_invoice', label: 'Final Invoice' },
  { value: 'bt_vendor', label: 'Vendor transfer proof (BT Vendor)' },
  { value: 'invoice_ppjk', label: 'PPJK invoice' },
  { value: 'invoice_ocean_freight', label: 'Ocean freight invoice' },
  { value: 'invoice_ocean_freight_2', label: 'Ocean freight invoice (2nd)' },
  { value: 'invoice_ppjk_lain', label: 'Other PPJK invoice' },
  { value: 'invoice_port_storage', label: 'Port storage invoice' },
  { value: 'kwitansi_lift_off', label: 'Lift-off receipt' },
  { value: 'form_e', label: 'Form E' },
  { value: 'form_ak', label: 'Form AK' },
  { value: 'e_coo', label: 'E-COO' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'laporan_surveyor', label: 'Surveyor report' },
  { value: 'invoice_surveyor', label: 'Surveyor invoice' },
  { value: 'billing_sptnp', label: 'Billing SPTNP' },
  { value: 'bpn_sptnp', label: 'BPN SPTNP' },
  { value: 'faktur_pajak', label: 'Tax invoice (Faktur Pajak)' },
  { value: 'quotation_freight', label: 'Freight quotation' },
  { value: 'sptnp', label: 'SPTNP' },
  { value: 'invoice_pendahuluan', label: 'Preliminary invoice (Invoice Pendahuluan)' },
  { value: 'credit_debit_note', label: 'Credit / Debit note' },
]

// Kelengkapan dokumen (kolom `ada_*` dokumen_checklist_seaair) -- hanya informasi.
const CHECK_REQUIRED: [string, string][] = [
  ['ada_po', 'PO'], ['ada_final_invoice', 'Final Invoice'], ['ada_cipl', 'CIPL'], ['ada_bl', 'BL / AWB'], ['ada_pib', 'PIB'],
  ['ada_sppb', 'SPPB'], ['ada_billing_djbc', 'Billing DJBC'], ['ada_bpn', 'BPN'], ['ada_bt_vendor', 'BT Vendor'], ['ada_invoice_ppjk', 'Invoice PPJK'],
]
const CHECK_OPTIONAL: [string, string][] = [
  ['ada_form_e', 'Form E'], ['ada_e_coo', 'E-COO'], ['ada_form_ak', 'Form AK'], ['ada_sptnp', 'SPTNP'], ['ada_billing_sptnp', 'Billing SPTNP'],
  ['ada_bpn_sptnp', 'BPN SPTNP'], ['ada_invoice_surveyor', 'Surveyor invoice'], ['ada_laporan_surveyor', 'Surveyor report'], ['ada_insurance', 'Insurance'],
]
const ALWAYS_SHOW_OPTIONAL = new Set(['ada_form_e', 'ada_e_coo', 'ada_form_ak', 'ada_sptnp', 'ada_billing_sptnp', 'ada_bpn_sptnp'])

// Error kirim: `verbatim` = pesan dari backend (Indonesia, sudah ramah) -> tampil APA ADANYA, tanpa terjemahan/penggantian.
class SendError extends Error {
  constructor(public status: number | null, message: string, public verbatim: boolean) { super(message) }
}

function humanizeSendError(status: number | null, raw: string): string {
  const msg = (raw || '').toLowerCase()
  if (status === 401) return 'Your session is no longer valid. Please log in again, then try again.'
  if (status === 403) return 'You do not have access to send additional documents for this shipment. Contact an admin to check your permissions.'
  if (status === 413) return 'The files are too large to send. Try compressing them or uploading in multiple batches.'
  if (status === 429) return 'Too many requests. Please wait a moment, then try again.'
  if (status === 502 || status === 503 || status === 504) return 'The automation server is currently unreachable (it may be busy or under maintenance). Please try again in a few minutes.'
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) return 'Could not connect to the server. Check your internet connection, then try again.'
  if (msg.includes('webhook url tidak dikonfigurasi')) return 'The webhook URL has not been configured on the server. Contact an admin to set it up.'
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) return 'The automation server did not respond in a reasonable time (timeout). The documents may still be processing in the background — check back shortly.'
  return 'An error occurred while sending the documents to the automation server. Please try again, or contact an admin if the problem keeps happening.'
}

const fmtSize = (bytes: number) => (bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB')

const FileRow: React.FC<{ file: File; index: number; disabled: boolean; onRemove: (i: number) => void }> = ({ file, index, disabled, onRemove }) => (
  <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-[#FBF7F4] border border-[#EADFD6]">
    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0"><FileText size={15} /></div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-[#5A305A] truncate" title={file.name}>{file.name}</p>
      <p className="text-[10px] text-[#6E5E70] mt-0.5">{fmtSize(file.size)}</p>
    </div>
    <button type="button" disabled={disabled} onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}
      className="w-6 h-6 rounded-full bg-slate-200 hover:bg-red-200 text-[#5A305A] hover:text-red-600 flex items-center justify-center shrink-0 transition-all disabled:opacity-50">
      <X size={12} />
    </button>
  </div>
)

export type SusulanAck = { job_id?: string; status?: string; mode?: string; awb?: string }

export default function SeaAirUploadSusulanModal({ awb, noAju, vendor, seaairId, checklist, context, onClose, onJobStarted, onSentNoJob }: {
  awb: string                       // kolom `awb` shipment yang dibuka (WAJIB; bukan input bebas)
  noAju?: string | null
  vendor?: string | null
  seaairId?: any
  checklist?: any                   // baris dokumen_checklist_seaair dari induk; undefined = dimuat sendiri
  context?: 'quotation'             // dibuka dari "+ Add quotation" (Cost Validation › Freight): tampilkan petunjuk khusus (tanpa `replace` otomatis)
  onClose: () => void
  onJobStarted: (jobId: string, ack: SusulanAck) => void
  onSentNoJob: (message: string, isWarning: boolean) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorModal, setErrorModal] = useState<{ friendly: string; raw: string } | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [replaceOn, setReplaceOn] = useState(false)
  const [replaceSel, setReplaceSel] = useState<string[]>([])
  const [ownChecklist, setOwnChecklist] = useState<any | null | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Kelengkapan: pakai data induk bila ada; kalau tidak, baca sendiri (read-only, hanya informasi).
  useEffect(() => {
    if (checklist !== undefined || !seaairId) return
    let cancelled = false
    supabase.from('dokumen_checklist_seaair').select('*').eq('seaair_id', seaairId).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setOwnChecklist(data || null) })
    return () => { cancelled = true }
  }, [checklist, seaairId])
  const cl = checklist !== undefined ? checklist : ownChecklist

  useEffect(() => { dropRef.current?.focus() }, [])
  // Esc: tutup modal error dulu; dialog tidak bisa ditutup saat sedang mengirim.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (errorModal) setErrorModal(null)
      else if (!uploading) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [errorModal, uploading, onClose])

  const addFiles = useCallback((list: FileList | File[] | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const notes: string[] = []
    const typed = incoming.filter(f => ALLOWED_TYPES.includes(f.type))
    if (typed.length < incoming.length) notes.push(`${incoming.length - typed.length} file(s) skipped — only PDF, JPG and PNG are accepted.`)
    const sized = typed.filter(f => f.size <= MAX_FILE_BYTES)
    if (sized.length < typed.length) notes.push(`${typed.length - sized.length} file(s) skipped — the limit is 50 MB per file.`)
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + '_' + f.size))
      const fresh: File[] = []
      for (const f of sized) {
        const k = f.name + '_' + f.size
        if (existing.has(k)) continue
        existing.add(k)
        fresh.push(f)
      }
      const room = MAX_FILES - prev.length
      if (fresh.length > room) notes.push(`Only ${MAX_FILES} files can be sent at once — ${fresh.length - Math.max(room, 0)} file(s) skipped.`)
      return [...prev, ...fresh.slice(0, Math.max(room, 0))]
    })
    setFileNotice(notes.length ? notes.join(' ') : null)
  }, [])

  const removeFile = (i: number) => { setFiles(prev => prev.filter((_, idx) => idx !== i)); setFileNotice(null) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (!uploading) addFiles(e.dataTransfer.files) }
  const toggleReplace = (v: string) => setReplaceSel(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))

  const totalBytes = files.reduce((a, f) => a + f.size, 0)
  const replaceInvalid = replaceOn && replaceSel.length === 0
  const canSend = files.length >= 1 && !uploading && !replaceInvalid && !!awb

  const handleSubmit = async () => {
    if (!canSend) return
    setUploading(true)
    const formData = new FormData()
    files.forEach((file, i) => formData.append('file_' + i, file))
    formData.append('awb_hint', awb)
    formData.append('mode', 'susulan')
    if (replaceOn && replaceSel.length) {
      // Urutan mengikuti daftar kontrak, bukan urutan klik.
      formData.append('replace', SEA_AIR_REPLACE_OPTIONS.filter(o => replaceSel.includes(o.value)).map(o => o.value).join(','))
    }
    try {
      // Tanpa `X-Webhook-Url`: server memilih webhook susulan sendiri (override localStorage `n8n_seaair_webhook_url` adalah utk upload normal).
      const headers: HeadersInit = { 'X-Webhook-Type': 'sea_air' }

      const res = await apiFetch('/api/n8n-proxy-start', { method: 'POST', body: formData, headers })
      let data: any = null
      try { data = await res.json() } catch { data = null }

      if (!res.ok || data?.status === 'error' || data?.error === true) {
        const backendMsg: string = (typeof data?.pesan === 'string' && data.pesan) || (typeof data?.message === 'string' && data.message) || ''
        // 422 = ditolak n8n sebelum diproses (AWB tidak ditemukan, sudah submit Finance, dst): pesan Indonesia tampil apa adanya.
        if (res.status === 422 && backendMsg) throw new SendError(422, backendMsg, true)
        throw new SendError(res.ok ? null : res.status, backendMsg || 'Failed to start the process on the automation server.', false)
      }

      if (typeof data?.job_id === 'string' && data.job_id) {
        onJobStarted(data.job_id, data)
      } else if (data?.status === 'warning') {
        onSentNoJob(data.pesan || 'Documents sent, but their status could not be confirmed yet. Reopen this shipment later to see the result.', true)
      } else {
        onSentNoJob('Documents sent to the processing queue. Reopen this shipment later to see the result.', false)
      }
      onClose()
    } catch (err: any) {
      if (err instanceof SendError && err.verbatim) {
        setErrorModal({ friendly: err.message, raw: `HTTP ${err.status}` })
      } else {
        const status = err instanceof SendError ? err.status : null
        const raw = err?.message || String(err)
        setErrorModal({ friendly: humanizeSendError(status, raw), raw: status ? `HTTP ${status} — ${raw}` : raw })
      }
    } finally {
      setUploading(false)
    }
  }

  const checkRow = (key: string, label: string, required: boolean) => {
    const v = cl?.[key]
    return (
      <div key={key} className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg border text-[11.5px] ${v ? 'border-[#D6EEDF] bg-[#F5FBF7]' : required ? 'border-[#F4C3BC] bg-[#FFF6F4]' : 'border-[#EADFD6] bg-white'}`}>
        <span className="font-semibold text-[#3B1B3D] truncate" title={label}>{label}</span>
        {v ? <CheckCircle2 size={13} className="text-[#17663D] shrink-0" /> : required ? <XCircle size={13} className="text-[#A8231A] shrink-0" /> : <span className="text-[#B7A9B8] shrink-0">–</span>}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex justify-center items-center p-2 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !uploading && !errorModal) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sa-susulan-title" className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-[#EADFD6] shrink-0">
          <div>
            <h2 id="sa-susulan-title" className="text-base font-bold tracking-tight text-[#5A305A]">Upload Additional Document — Sea &amp; Air</h2>
            <p className="text-xs font-light text-[#5A305A] mt-0.5">For documents that arrived after the first upload, or corrected versions of documents already sent</p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} aria-label="Close" className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors disabled:opacity-50"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {context === 'quotation' && (
            <div className="rounded-xl bg-[#EEF1FA] border border-[#CFE0F7] px-3 py-2 text-[12px] text-[#2F4FA8]">
              Upload the <b>freight quotation</b> for this BL. After processing, the Freight section in Cost Validation is compared against it.
            </div>
          )}
          {/* 1. Info shipment (read-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#E4D3E2] rounded-xl overflow-hidden border border-[#D9C7DA]">
            {([['AWB', awb], ['No. aju', noAju], ['Vendor', vendor]] as const).map(([l, v]) => (
              <div key={l} className="bg-[#FCF8FB] px-3 py-2 min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-none mb-1">{l}</p>
                <p className="text-[12.5px] font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{v || '—'}</p>
              </div>
            ))}
          </div>

          {/* 2. Kelengkapan dokumen */}
          <div>
            <div className={`${SA_LABEL} mb-1.5`}>Document completeness</div>
            {cl === undefined ? (
              <div className="text-[12px] text-[#6E5E70] inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</div>
            ) : cl === null ? (
              <div className="text-[12px] text-[#6E5E70]">No checklist recorded for this shipment yet.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {CHECK_REQUIRED.map(([k, l]) => checkRow(k, l, true))}
                {CHECK_OPTIONAL.filter(([k]) => ALWAYS_SHOW_OPTIONAL.has(k) || Object.prototype.hasOwnProperty.call(cl, k)).map(([k, l]) => checkRow(k, l, false))}
              </div>
            )}
          </div>

          {/* 3. Pemilih file */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-[#5A305A] uppercase tracking-widest">Select files</p>
              {files.length > 0 && <Chip tone="green">{files.length} file{files.length === 1 ? '' : 's'} · {fmtSize(totalBytes)}</Chip>}
            </div>
            <div
              ref={dropRef}
              tabIndex={0}
              role="button"
              aria-label="Select files to upload"
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => { if (!uploading) inputRef.current?.click() }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); inputRef.current?.click() } }}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3470]/40 ${
                dragging ? 'border-[#5A305A] bg-[#5A305A]/5' :
                files.length > 0 ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400' :
                'border-slate-200 bg-slate-50 hover:border-[#5A305A]/40 hover:bg-[#5A305A]/5'
              }`}
            >
              <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" multiple className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center transition-colors ${
                dragging ? 'bg-[#5A305A] text-white' : files.length > 0 ? 'bg-emerald-500 text-white' : 'bg-[#5A305A]/10 text-[#5A305A]'
              }`}>
                {dragging ? <FolderOpen size={20} strokeWidth={1.75} /> : files.length > 0 ? <CheckCircle2 size={20} strokeWidth={1.75} /> : <UploadCloud size={20} strokeWidth={1.75} />}
              </div>
              <p className="font-semibold text-sm text-[#5A305A]">
                {dragging ? 'Drop the files here...' : files.length === 0 ? 'Click or drag & drop files (PDF, JPG, PNG)' : 'Click to add more files'}
              </p>
              <p className="text-xs text-[#6E5E70] mt-1">At least 1 file. Upload only the missing or corrected document(s) — no need to resend everything.</p>
            </div>
            {fileNotice && <div className="mt-2 rounded-lg bg-[#FFF8EA] border border-[#F3D9A4] px-3 py-1.5 text-[11.5px] text-[#7A4F00]">{fileNotice}</div>}
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => <FileRow key={f.name + '_' + f.size} file={f} index={i} disabled={uploading} onRemove={removeFile} />)}
                <button type="button" disabled={uploading} onClick={() => { setFiles([]); setFileNotice(null) }}
                  className="w-full py-2 text-xs text-[#5A305A] hover:text-red-500 border border-dashed border-slate-200 hover:border-red-300 rounded-xl transition-all disabled:opacity-50">
                  Remove all files
                </button>
              </div>
            )}
          </div>

          {/* 4. Advanced options */}
          <div className="rounded-xl border border-[#EADFD6]">
            <button type="button" onClick={() => setAdvOpen(v => !v)} aria-expanded={advOpen}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-[#5A305A] hover:bg-[#FBF7F4] rounded-xl">
              {advOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced options
              {replaceOn && replaceSel.length > 0 && <Chip tone="amber">Replace · {replaceSel.length}</Chip>}
            </button>
            {advOpen && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#3B1B3D] cursor-pointer">
                  <input type="checkbox" checked={replaceOn} disabled={uploading} onChange={e => setReplaceOn(e.target.checked)} className="accent-[#5A305A]" />
                  Replace existing document (instead of adding)
                </label>
                {replaceOn && (
                  <>
                    <div className="rounded-lg bg-[#FFF8EA] border border-[#F3D9A4] px-3 py-2 text-[11.5px] text-[#7A4F00]">
                      The existing data for this document type will be discarded and replaced by the files you upload now.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {SEA_AIR_REPLACE_OPTIONS.map(o => (
                        <label key={o.value} className="inline-flex items-center gap-2 text-[12px] text-[#3B1B3D] cursor-pointer">
                          <input type="checkbox" checked={replaceSel.includes(o.value)} disabled={uploading} onChange={() => toggleReplace(o.value)} className="accent-[#5A305A]" />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {replaceInvalid && <div className="text-[11.5px] font-semibold text-[#A8231A]">Select at least one document type to replace.</div>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 5 & 6. Teks bantuan + catatan */}
          <div className="rounded-xl bg-[#F5EDF3] border border-[#D9C7DA] px-3 py-2.5 text-[11.5px] text-[#3B1B3D] flex flex-col gap-1.5">
            <p>For installment payments (DP 1, DP 2, balance), upload each transfer proof — amounts are added up automatically. Re-uploading the same transfer proof is not counted twice.</p>
            <p>Commercial invoices / packing lists and final invoices are matched by invoice number: new numbers are added to the shipment, the same number replaces the earlier document.</p>
            <p className="font-semibold">After processing, this shipment returns to Draft and needs to be audited again. Your manual edits are kept.</p>
          </div>
        </div>

        {/* 7. Aksi */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4]">
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={uploading}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={handleSubmit} disabled={!canSend}>
            {uploading ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send{files.length ? ` ${files.length} file${files.length === 1 ? '' : 's'}` : ''}</>}
          </button>
        </div>
      </div>

      {errorModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0"><AlertTriangle size={22} /></div>
              <div>
                <h3 className="font-bold text-[#5A305A] leading-tight">Failed to Send Document</h3>
                <p className="text-xs font-light text-[#5A305A] mt-0.5">The files were not sent to the automation server</p>
              </div>
            </div>
            <p className="text-sm text-[#5A305A] leading-relaxed mb-4 whitespace-pre-wrap">{errorModal.friendly}</p>
            <div className="mb-5 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-[#5A305A] break-words max-h-32 overflow-y-auto">{errorModal.raw}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setErrorModal(null)} className="py-2.5 rounded-xl border border-slate-200 text-[#5A305A] font-semibold text-sm hover:bg-slate-50 transition-all">Close</button>
              <button type="button" onClick={() => { setErrorModal(null); handleSubmit() }} className="py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5">
                <RotateCcw size={14} /> Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
