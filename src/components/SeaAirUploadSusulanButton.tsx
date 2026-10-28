// Tombol + status "Upload Additional Document" (dokumen susulan) Sea & Air (2026-10-20). Dialog kirimnya ada di
// SeaAirUploadSusulanModal.tsx. Komponen ini pemilik: (1) syarat aktif/nonaktif tombol, (2) polling job
// `tabel_processing_queue` per-id tiap 4 detik (pola ChecklistModal Courier di SharedDataTable.tsx), berhenti saat SUCCESS/FAILED
// atau setelah 12 menit ("Still processing" -- BUKAN gagal), (3) strip status inline, (4) callback `onCompleted` setelah SUCCESS
// supaya induk memuat ulang data. Dialog boleh ditutup saat proses berjalan: prosesnya di backend; saat komponen ini dipasang
// ulang, job PENDING/PROCESSING utk AWB yang sama ditemukan lagi lewat `seaair_awb_hint` sehingga indikator tetap benar.
// Frontend TIDAK menulis ke tabel hasil -- hanya membaca status job.
// `inline` (2026-10-28, permintaan user): panel upload TIDAK popup -- terbuka di bawah tombol (toggle), strip loading/hasil n8n tampil di
// tempat yang sama (tab Documents / Cost Validation). Tanpa `inline` = dialog modal lama (SeaAirChecklistModal / Audit PIB).
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Loader2, RotateCcw, UploadCloud, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { SA_BTN_OUTLINE } from './SeaAirAuditUi'
import { isRecapLocked } from '../utils/SeaAirRecapHelpers'
import SeaAirUploadSusulanModal from './SeaAirUploadSusulanModal'

const POLL_MS = 4000
const POLL_MAX_MS = 12 * 60 * 1000          // lewat ini: berhenti polling, tampilkan "Still processing" (bukan gagal)
const RESUME_WINDOW_MS = 15 * 60 * 1000     // job PENDING/PROCESSING lebih tua dari ini dianggap macet -> tidak memblokir tombol
const JOB_COLS = 'status, awb, seaair_id, status_validasi, status_cost, error_message, error_step, seaair_peringatan, updated_at'

type JobStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'SENT' | 'TIMEOUT'
type JobState = {
  jobId: string | null
  status: JobStatus
  error?: string
  step?: string
  warning?: string
  message?: string      // SENT: pesan ringkas
  isWarning?: boolean   // SENT: true = webhook membalas "warning" (timeout gateway)
}
const isRunning = (j: JobState | null) => !!j && (j.status === 'PENDING' || j.status === 'PROCESSING')

export const SUSULAN_LOCKED_MSG = 'Locked — already submitted to Finance. Ask an Admin to unlock it first.'

export type SusulanRec = { awb?: string | null; no_aju?: string | null; vendor?: string | null; tgl_submit_finance?: any }

export default function SeaAirUploadSusulanButton({ rec, seaairId, checklist, onCompleted, className = '', label = 'Upload Additional Document', variant = 'button', context, inline = false }: {
  rec: SusulanRec | null | undefined
  seaairId?: any
  checklist?: any                       // baris dokumen_checklist_seaair dari induk (opsional; dialog memuat sendiri bila undefined)
  onCompleted?: () => void              // dipanggil SEKALI per job setelah SUCCESS -> induk memuat ulang datanya
  className?: string
  label?: string
  variant?: 'button' | 'link'         // 'link' = teks ungu kecil (mis. "+ Add quotation" di Cost Validation)
  context?: 'quotation'               // diteruskan ke dialog (petunjuk khusus quotation freight)
  inline?: boolean                    // true = panel di tempat (tanpa popup)
}) {
  const { canEdit } = useAuth()           // canEdit() sudah true utk Admin; SAMA dgn kunci server UPLOAD_ACCESS.sea_air (sea_air_audit, edit)
  const awb = String(rec?.awb ?? '').trim()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  const [techOpen, setTechOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const deadlineRef = useRef(0)
  const completedFor = useRef<string | null>(null)
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted

  const permitted = canEdit('sea_air_audit')
  const locked = isRecapLocked(rec)
  const running = isRunning(job)
  const reason = !permitted ? "You don't have permission to edit Sea & Air audit data."
    : locked ? SUSULAN_LOCKED_MSG
    : !awb ? 'This shipment has no AWB yet.'
    : running ? 'A process is already running for this AWB'
    : null

  // Terapkan baris job dari DB ke state; true = polling boleh berhenti.
  const applyRow = useCallback((jobId: string, row: any): boolean => {
    const st = String(row?.status || '').toUpperCase()
    if (st === 'SUCCESS') {
      setJob({ jobId, status: 'SUCCESS', warning: String(row.seaair_peringatan || '').trim() || undefined })
      if (completedFor.current !== jobId) { completedFor.current = jobId; onCompletedRef.current?.() }
      return true
    }
    if (st === 'FAILED') {
      setJob({ jobId, status: 'FAILED', error: String(row.error_message || '').trim() || 'Failed to process the documents.', step: String(row.error_step || '').trim() || undefined })
      return true
    }
    const next: JobStatus = st === 'PROCESSING' ? 'PROCESSING' : 'PENDING'
    setJob(prev => (prev && prev.jobId === jobId && prev.status === next ? prev : { jobId, status: next }))
    return false
  }, [])

  // Temukan lagi job yang masih berjalan utk AWB ini (dialog ditutup / komponen dipasang ulang).
  useEffect(() => {
    if (!awb) return
    let cancelled = false
    const since = new Date(Date.now() - RESUME_WINDOW_MS).toISOString()
    supabase.from('tabel_processing_queue').select('id, status, created_at, ' + JOB_COLS)
      .eq('seaair_awb_hint', awb).in('status', ['PENDING', 'PROCESSING']).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data, error }) => {
        if (cancelled || error || !data || !data.length) return
        const row: any = data[0]
        setJob(prev => {
          if (prev) return prev
          deadlineRef.current = new Date(row.created_at).getTime() + POLL_MAX_MS
          return { jobId: row.id, status: String(row.status).toUpperCase() === 'PROCESSING' ? 'PROCESSING' : 'PENDING' }
        })
      })
    return () => { cancelled = true }
  }, [awb])

  // Polling per-id.
  useEffect(() => {
    if (!job || !job.jobId || !isRunning(job)) return
    const jobId = job.jobId
    let stopped = false
    const iv = setInterval(async () => {
      if (Date.now() > deadlineRef.current) {
        clearInterval(iv)
        if (!stopped) setJob(prev => (prev && prev.jobId === jobId && isRunning(prev) ? { jobId, status: 'TIMEOUT' } : prev))
        return
      }
      const { data, error } = await supabase.from('tabel_processing_queue').select(JOB_COLS).eq('id', jobId).maybeSingle()
      if (stopped || error || !data) return
      if (applyRow(jobId, data)) clearInterval(iv)
    }, POLL_MS)
    return () => { stopped = true; clearInterval(iv) }
  }, [job?.jobId, job?.status, applyRow]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeDialog = () => {
    setDialogOpen(false)
    // Fokus kembali ke tombol semula.
    setTimeout(() => btnRef.current?.focus(), 0)
  }

  const handleJobStarted = (jobId: string) => {
    completedFor.current = null
    deadlineRef.current = Date.now() + POLL_MAX_MS
    setTechOpen(false)
    setJob({ jobId, status: 'PENDING' })
  }
  const handleSentNoJob = (message: string, isWarning: boolean) => {
    setTechOpen(false)
    setJob({ jobId: null, status: 'SENT', message, isWarning })
  }

  // "Check now" setelah TIMEOUT: satu kali baca; kalau masih berjalan, lanjutkan polling dgn jatah baru.
  const checkNow = async () => {
    if (!job?.jobId) return
    const jobId = job.jobId
    const { data } = await supabase.from('tabel_processing_queue').select(JOB_COLS).eq('id', jobId).maybeSingle()
    if (!data) return
    deadlineRef.current = Date.now() + POLL_MAX_MS
    applyRow(jobId, data)
  }

  const strip = (() => {
    if (!job) return null
    const dismiss = (
      <button type="button" onClick={() => setJob(null)} aria-label="Dismiss" className="ml-auto p-1 rounded-full hover:bg-black/5 shrink-0"><X size={13} /></button>
    )
    if (isRunning(job)) {
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[#D9C7DA] bg-[#F5EDF3] px-3 py-2 text-[12px] font-semibold text-[#5A305A]" data-susulan-processing>
          <Loader2 size={14} className="animate-spin shrink-0" /> Merging additional documents…
        </div>
      )
    }
    if (job.status === 'SUCCESS') {
      return (
        <div className="flex flex-col gap-1.5">
          <div role="status" className="flex items-start gap-2 rounded-xl border border-[#BFE3CD] bg-[#EAF6EF] px-3 py-2 text-[12px] text-[#17663D]">
            <CheckCircle2 size={14} className="mt-[1px] shrink-0" />
            <span><b>Additional documents merged.</b> This shipment is back to Draft and needs to be audited again. Your manual edits are kept.</span>
            {dismiss}
          </div>
          {job.warning && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2 text-[12px] text-[#7A4F00]">
              <AlertTriangle size={14} className="mt-[1px] shrink-0" />
              <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{job.warning}</span>
            </div>
          )}
        </div>
      )
    }
    if (job.status === 'FAILED') {
      return (
        <div role="alert" className="rounded-xl border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-[1px] shrink-0" />
            <span className="font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]">{job.error}</span>
            {dismiss}
          </div>
          {job.step && (
            <div className="mt-1 ml-[22px]">
              <button type="button" onClick={() => setTechOpen(v => !v)} aria-expanded={techOpen} className="inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline">
                {techOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Technical details
              </button>
              {techOpen && <div className="mt-1 rounded-lg bg-white/70 border border-[#F4C3BC] px-2 py-1 font-mono text-[11px] break-words">Step: {job.step}</div>}
            </div>
          )}
          {permitted && !locked && awb && (
            <div className="mt-2 ml-[22px]">
              <button type="button" onClick={() => setDialogOpen(true)} className="inline-flex items-center gap-1 text-[11.5px] font-bold hover:underline"><RotateCcw size={12} /> Try Again</button>
            </div>
          )}
        </div>
      )
    }
    if (job.status === 'TIMEOUT') {
      return (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-3 py-2 text-[12px] text-[#7A4F00]">
          <Info size={14} className="mt-[1px] shrink-0" />
          <span><b>Still processing — check again later.</b> The documents are taking longer than usual; this is not a failure.
            {job.jobId && <> <button type="button" onClick={checkNow} className="font-bold underline">Check now</button></>}</span>
          {dismiss}
        </div>
      )
    }
    // SENT: webhook tidak mengembalikan job_id -> tidak bisa dipantau per-job.
    return (
      <div role="status" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] ${job.isWarning ? 'border-[#F3D9A4] bg-[#FFF8EA] text-[#7A4F00]' : 'border-[#CFE0F7] bg-[#EEF5FE] text-[#2F4FA8]'}`}>
        <Info size={14} className="mt-[1px] shrink-0" />
        <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{job.message}</span>
        {dismiss}
      </div>
    )
  })()

  return (
    <div className={`flex flex-col gap-2 ${className} ${inline && (job || dialogOpen) ? 'basis-full w-full' : ''}`}>
      {strip}
      <span title={reason || undefined} className={`inline-flex ${inline && variant === 'link' ? 'self-end' : 'self-start'}`}>
        <button ref={btnRef} type="button" className={variant === 'link' ? 'text-[12px] font-semibold text-[#6B3470] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed' : SA_BTN_OUTLINE} disabled={!!reason}
          onClick={() => (inline ? (dialogOpen ? closeDialog() : setDialogOpen(true)) : setDialogOpen(true))} aria-expanded={inline ? dialogOpen : undefined} data-susulan-button>
          {variant === 'button' && <UploadCloud size={13} />} {label}
        </button>
      </span>
      {reason && <span className="sr-only">{reason}</span>}
      {dialogOpen && (
        <SeaAirUploadSusulanModal
          awb={awb}
          noAju={rec?.no_aju}
          vendor={rec?.vendor}
          seaairId={seaairId}
          checklist={checklist}
          context={context}
          inline={inline}
          onClose={closeDialog}
          onJobStarted={handleJobStarted}
          onSentNoJob={handleSentNoJob}
        />
      )}
    </div>
  )
}
