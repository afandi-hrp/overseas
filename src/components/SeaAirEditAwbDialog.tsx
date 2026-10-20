// Edit AWB / House BL shipment Sea & Air (2026-10-20). AI bisa salah baca nomor BL/AWB dari dokumen -> user mengoreksinya di sini.
// SATU-SATUNYA jalur ubah AWB: RPC `fn_ubah_awb_seaair` (server menyinkronkan Audit, Recap, Checklist, Validation & kunci data mentah
// Upload Additional Document, serta menolak nomor duplikat / terlalu pendek / shipment sudah di-submit ke Finance). Frontend TIDAK
// menulis tabel apa pun; kolom AWB di jalur edit biasa (form Edit PIB, inline edit List) sengaja read-only.
// Dua pemakai: detail Audit PIB (SeaAirAuditDetailModal) & tab Overview Invoice Recap (SeaAirRecapDetailModal) -- via <SeaAirEditAwbButton>.
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { SA_INPUT, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY } from './SeaAirAuditUi'

// Validasi klien HANYA utk menonaktifkan tombol; server tetap memvalidasi.
const MIN_ALNUM = 5
const alnumCount = (s: string) => (s.match(/[A-Za-z0-9]/g) || []).length

export const EDIT_AWB_LOCKED_MSG = 'Locked after Submit to Finance'
export const EDIT_AWB_NO_ACCESS_MSG = 'No edit access'

export function SeaAirEditAwbDialog({ seaairId, currentAwb, onClose, onSaved }: {
  seaairId: string | number
  currentAwb: string
  onClose: () => void
  onSaved: (res: { awb: string; berubah: boolean }) => void
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const next = value.trim()
  const canSave = !saving && next !== '' && alnumCount(next) >= MIN_ALNUM && next !== currentAwb.trim()

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setErr(null)
    const { data, error } = await supabase.rpc('fn_ubah_awb_seaair', { p_seaair_id: seaairId, p_awb_baru: next })
    if (error) {
      // Pesan server sudah berbahasa Inggris & boleh ditampilkan apa adanya; dialog TIDAK ditutup.
      setErr(error.message || 'Failed to change the AWB.')
      setSaving(false)
      return
    }
    const res: any = Array.isArray(data) ? data[0] : data
    onSaved({ awb: String(res?.awb ?? next), berubah: res?.berubah !== false })
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit AWB / House BL">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EADFD6]">
          <h2 className="text-[16px] font-bold text-[#3B1B3D]">Edit AWB / House BL</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-[#6E5E70] hover:bg-[#F6EFEA] disabled:opacity-50"><X size={17} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-[12px] text-[#6E5E70] leading-relaxed">
            Use this if the AWB / House BL was read incorrectly from a document. It updates this shipment everywhere (Audit, Recap, Checklist) and is used for follow-up uploads.
          </p>
          <div>
            <div className={`${SA_LABEL} mb-1`}>Current AWB / House BL</div>
            <div className="px-3 py-2 rounded-lg bg-[#F6EFEA] text-[13px] font-semibold text-[#3B1B3D] [overflow-wrap:anywhere]">{currentAwb || '—'}</div>
          </div>
          <label className="block">
            <span className={`${SA_LABEL} block mb-1`}>New AWB / House BL</span>
            <input ref={inputRef} value={value} onChange={e => { setValue(e.target.value); setErr(null) }} disabled={saving}
              onKeyDown={e => { if (e.key === 'Enter') save() }} className={SA_INPUT} autoComplete="off" spellCheck={false} />
          </label>
          {err && <div role="alert" className="px-3 py-2 rounded-xl border border-[#F4C3BC] bg-[#FDE7E4] text-[12.5px] font-semibold text-[#A8231A]">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4]">
          <button type="button" className={SA_BTN_OUTLINE} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className={SA_BTN_PRIMARY} onClick={save} disabled={!canSave}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Ikon pensil kecil di samping nilai AWB + dialog + toast sukses. `locked` = shipment sudah di-submit ke Finance (tgl_submit_finance
// terisi). Hak = edit access `sea_air_audit` (canEdit sudah true utk Admin) -- sama dgn kunci server. Tanpa hak: ikon disembunyikan;
// terkunci / belum terhubung ke Audit PIB: ikon nonaktif + tooltip penjelas.
export default function SeaAirEditAwbButton({ seaairId, awb, locked, onChanged, className = '' }: {
  seaairId?: string | number | null
  awb: string | null | undefined
  locked: boolean
  onChanged: (newAwb: string) => void
  className?: string
}) {
  const { canEdit } = useAuth()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  if (!canEdit('sea_air_audit')) return null
  const noLink = seaairId === null || seaairId === undefined || seaairId === ''
  const reason = locked ? EDIT_AWB_LOCKED_MSG : noLink ? 'Not linked to an Audit PIB record' : null

  return (
    <>
      <button type="button" disabled={!!reason} onClick={() => setOpen(true)} aria-label="Edit AWB / House BL" title={reason || 'Edit AWB / House BL'}
        className={`inline-flex items-center justify-center h-6 w-6 rounded-md text-[#6B3470] hover:bg-[#F5EDF3] disabled:text-[#B7A9B8] disabled:hover:bg-transparent disabled:cursor-not-allowed shrink-0 align-middle ${className}`}>
        <Pencil size={12} />
      </button>
      {open && !noLink && (
        <SeaAirEditAwbDialog seaairId={seaairId as string | number} currentAwb={String(awb ?? '')} onClose={() => setOpen(false)}
          onSaved={res => {
            setOpen(false)
            setToast(res.berubah ? `AWB / House BL changed to ${res.awb}.` : 'AWB / House BL is unchanged.')
            if (res.berubah) onChanged(res.awb)
          }} />
      )}
      {toast && createPortal(
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] px-4 py-2.5 rounded-xl border border-[#BFE3CD] bg-[#EAF6EF] text-[12.5px] font-semibold text-[#17663D] shadow-lg">{toast}</div>,
        document.body,
      )}
    </>
  )
}
