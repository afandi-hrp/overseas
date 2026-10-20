// Panel "Vendor payments (goods)" Sea & Air (2026-10-20) -- tab Documents jendela Open Invoice Recap, di bawah Document validation.
// SEMUA angka/status dihitung DATABASE (RPC `fn_vp_*_seaair`); frontend hanya menampilkan dan memanggil 5 RPC aksi. Tiap RPC aksi
// mengembalikan jsonb yang SAMA dgn `fn_vp_ambil_seaair` -> cukup `setData(hasil)`, tanpa refetch. Frontend TIDAK menulis tabel
// `seaair_vp_*` (penegakan hak akses + kunci Finance ada di DB: `_seaair_vp_cek_akses`). Komponen memuat datanya SENDIRI (tidak
// menyentuh `load()` SeaAirRecapDocumentsTab yang mereset perubahan belum disimpan); `refreshNonce` naik -> dimuat ulang (mis. setelah
// dokumen susulan SUCCESS). Jangan menghitung ulang apa pun di sini.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { LoadingState } from './LoadingState'
import { SA_CARD, SA_LABEL, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT, Chip, Pill, type Tone } from './SeaAirAuditUi'

export const VP_LOCKED_MSG = 'Locked — already submitted to Finance. Ask an Admin to unlock it first.'
export const VP_PANEL_ID = 'sa-vendor-payments'

// ── Bentuk data `fn_vp_ambil_seaair` (longgar: dari DB apa adanya) ──
type Split = { invoice: string; amount: number }
type Alokasi = {
  bt_ref: string | null; bt_file: string | null; sumber: 'ai' | 'manual'; input_id: number | null; tgl: string | null; charge_type: string | null
  bt_amount: number | null; bt_ccy: string | null; remark: string | null; kode: string | null; doc: string | null; tag: string | null; termin: string | null
  amount: number | null; kurs: number | null; rp: number | null; selisih_bank: number | null; catatan: string | null; split_with: Split[]; peringatan: string[]
}
type Termin = { no: any; label: string; persen: number | null; keterangan: string | null; expected: number | null; paid: number | null; remaining: number | null; status: string }
type Dokumen = { dokumen: string; goods: number | null; other: number | null; adj: number | null; grand: number | null; validasi: 'Match' | 'Mismatch' | null; catatan: string | null }
type Invoice = {
  no: string; nos?: string[]; ccy: string; po?: string[]; termin_src: string | null; total: number | null; obligation: number | null; paid: number | null
  remaining: number | null; status: string; to_check: number; bt_count: number; stages: number
  dokumen: Dokumen[]; termin: Termin[]; alokasi: Alokasi[]
}
type ReviewItem = {
  kunci: string; jenis: string; severity: 'blocker' | 'info'; pesan: string; data: any; invoice: string | null; bt_ref: string | null
  diterima: boolean; catatan_terima: string | null; diterima_oleh: string | null; diterima_at: string | null
}
type VpData = {
  ada_data: boolean; alasan?: string; error?: string; awb?: string; status?: string; blocker_count?: number
  ringkasan?: { ccy: string; obligation: number; paid: number; remaining: number; pct: number; invoices: number }[]
  invoices?: Invoice[]; review?: ReviewItem[]; belum_teralokasi?: ReviewItem[]
  transfer?: { ref: string | null; sumber: string; input_id: number | null; tgl: string | null; amount: number | null; ccy: string | null; charge_type: string | null; remark: string | null; teralokasi: boolean }[]
  bank?: { biaya_idr: number | null; rincian: { ref: string | null; tgl: string | null; charge_type: string | null; biaya_idr: number | null; total_debit_idr: number | null; nominal_idr: number | null; kurs: number | null; catatan: string | null }[] }
  dihitung_at?: string
}

// ── Format: ribuan koma + 2 desimal; Rupiah tanpa desimal; tanggal DD MMM YYYY ──
const fmt2 = (n: any) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fmtRpV = (n: any) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '—' : 'Rp ' + Math.round(Number(n)).toLocaleString('en-US'))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (v: any) => {
  const s = String(v ?? '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]} ${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? (s || '—') : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const statusTone = (s: string | null | undefined): Tone =>
  s === 'Fully paid' || s === 'Paid' ? 'green' : s === 'Partly paid' ? 'blue' : s === 'Overpaid' ? 'red' : 'grey'
const StatusChip: React.FC<{ status: string | null | undefined }> = ({ status }) => <Chip tone={statusTone(status)}>{status || '—'}</Chip>

// Dialog kecil: portal, Esc menutup, fokus kembali ke pemicu.
const Dialog: React.FC<{ title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, busy, children, footer }) => {
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCloseRef.current() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy])
  // Fokus kembali ke pemicu hanya saat dialog benar-benar ditutup.
  useEffect(() => {
    const el = opener.current as HTMLElement | null
    return () => { setTimeout(() => el?.focus?.(), 0) }
  }, [])
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[85] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EADFD6] shrink-0">
          <h3 className="text-[14px] font-bold text-[#5A305A]">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-full hover:bg-slate-100 text-[#5A305A] disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-3">{children}</div>
        <div className="px-5 py-3 border-t border-[#EADFD6] bg-[#FBF7F4] flex justify-end gap-2 shrink-0">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="flex flex-col gap-1">
    <span className={SA_LABEL}>{label}</span>
    {children}
    {hint && <span className="text-[11px] text-[#8A7A8B]">{hint}</span>}
  </label>
)

export default function SeaAirVendorPaymentsPanel({ seaairId, locked, refreshNonce = 0, onData }: {
  seaairId: any
  locked: boolean                                            // shipment sudah Submit to Finance (isRecapLocked(rec)) -> semua aksi nonaktif
  refreshNonce?: number
  onData?: (blockerCount: number | null) => void             // opsional: kabari induk jumlah blocker terbaru
}) {
  const { canEdit, isAdmin } = useAuth()
  const canAct = canEdit('sea_air_dokumen_validation') || canEdit('sea_air_audit') || isAdmin
  const lockTitle = locked ? VP_LOCKED_MSG : undefined

  const [data, setData] = useState<VpData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openInv, setOpenInv] = useState<Record<string, boolean>>({})
  const [acceptFor, setAcceptFor] = useState<ReviewItem | null>(null)
  const [acceptNote, setAcceptNote] = useState('')
  const [proofFor, setProofFor] = useState<Invoice | null>(null)
  const reqId = useRef(0)
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  const apply = useCallback((d: VpData) => {
    setData(d)
    setRpcError(null)
    onDataRef.current?.(typeof d?.blocker_count === 'number' ? d.blocker_count : null)
  }, [])

  const load = useCallback(async () => {
    if (!seaairId) { setData(null); setLoading(false); return }
    const id = ++reqId.current
    const { data: d, error } = await supabase.rpc('fn_vp_ambil_seaair', { p_seaair_id: seaairId })
    if (id !== reqId.current) return // jawaban basi (seaairId/nonce sudah berganti)
    if (error) {
      console.error('[SeaAirVendorPayments] ambil gagal:', error.message)
      setRpcError(error.message || 'Unknown error')
      setData(null)
    } else {
      apply((d || { ada_data: false, alasan: 'No data.' }) as VpData)
    }
    setLoading(false)
  }, [seaairId, apply])

  // Muat saat seaairId berubah; muat ulang saat refreshNonce naik TANPA layar Loading (isi lama tetap tampil).
  useEffect(() => { setLoading(true); setData(null); setOpenInv({}); load() }, [seaairId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshNonce > 0) load() }, [refreshNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Jalankan RPC aksi: sukses -> setData(hasil); gagal -> alert verbatim (pola error app).
  const act = async (key: string, failLabel: string, fn: () => PromiseLike<{ data: any; error: any }>): Promise<boolean> => {
    if (busy) return false
    setBusy(key)
    try {
      const { data: d, error } = await fn()
      if (error) { alert(`Failed to ${failLabel}: ${error.message}`); return false }
      if (d) apply(d as VpData)
      return true
    } finally {
      setBusy(null)
    }
  }

  const sid = seaairId
  const doAccept = async () => {
    if (!acceptFor) return
    const ok = await act('accept:' + acceptFor.kunci, 'accept the review item', () => supabase.rpc('fn_vp_terima_review_seaair', { p_seaair_id: sid, p_kunci: acceptFor.kunci, p_catatan: acceptNote.trim() }))
    if (ok) { setAcceptFor(null); setAcceptNote('') }
  }
  const doUndo = (it: ReviewItem) => {
    if (!window.confirm('Undo the acceptance of this review item?')) return
    act('undo:' + it.kunci, 'undo the acceptance', () => supabase.rpc('fn_vp_batal_terima_seaair', { p_seaair_id: sid, p_kunci: it.kunci }))
  }
  const doConfirmRef = (it: ReviewItem, invoiceNo: string, setuju: boolean, berlakuKode: boolean) =>
    act('ref:' + it.kunci, setuju ? 'confirm the reference' : 'reject the suggestion', () => supabase.rpc('fn_vp_konfirmasi_ref_seaair', {
      p_seaair_id: sid, p_kode: it.data?.kode ?? null, p_doc: it.data?.doc ?? null, p_invoice_no: invoiceNo, p_setuju: setuju, p_berlaku_kode: berlakuKode,
    }))
  const doDeleteProof = (a: Alokasi) => {
    if (a.input_id == null) return
    if (!window.confirm('Delete this manual transfer proof?')) return
    act('del:' + a.input_id, 'delete the transfer proof', () => supabase.rpc('fn_vp_hapus_bukti_seaair', { p_input_id: a.input_id }))
  }

  // Tombol aksi: tersembunyi tanpa hak edit; nonaktif + tooltip bila shipment terkunci.
  // (fungsi render biasa, BUKAN komponen: komponen yang didefinisikan di dalam render akan di-remount tiap render -> fokus hilang)
  const actBtn = (children: React.ReactNode, onClick: () => void) => {
    if (!canAct) return null
    return (
      <span title={lockTitle} className="inline-flex">
        <button type="button" className={SA_BTN_OUTLINE} onClick={onClick} disabled={locked || !!busy}>{children}</button>
      </span>
    )
  }

  const blockers = data?.blocker_count ?? 0
  const review = data?.review || []
  const blockerItems = review.filter(r => r.severity === 'blocker')
  const infoItems = review.filter(r => r.severity !== 'blocker')
  const invoices = data?.invoices || []
  const invoiceNos = invoices.map(i => i.no)
  const rincian = data?.bank?.rincian || []

  const header = (
    <div className={`${SA_CARD} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
      <div className="mr-auto min-w-0">
        <div className="text-[14px] font-bold text-[#3B1B3D]">Vendor payments (goods)</div>
        <div className="text-[11.5px] text-[#6E5E70]">Transfer proofs matched to each final invoice{data?.dihitung_at ? ` · calculated ${fmtDay(data.dihitung_at)}` : ''}</div>
      </div>
      {data?.ada_data && (
        <div className="flex flex-col items-end gap-0.5 text-[12px]">
          {(data.ringkasan || []).map(r => (
            <div key={r.ccy} className="text-[#3B1B3D]">
              <b className="tabular-nums">Paid {r.ccy} {fmt2(r.paid)} of {fmt2(r.obligation)} ({Math.round(Number(r.pct) || 0)}%)</b>
              {Number(r.remaining) > 0 && <span className="text-[#A8231A] font-semibold tabular-nums"> · {r.ccy} {fmt2(r.remaining)} without BT</span>}
            </div>
          ))}
        </div>
      )}
      {data?.ada_data && <StatusChip status={data.status} />}
      {data?.ada_data && blockers > 0 && <Chip tone="amber" title="Review items that must be accepted or resolved before submitting to Finance">{blockers} to check</Chip>}
    </div>
  )

  let body: React.ReactNode
  if (loading) {
    body = <LoadingState fullHeight={false} />
  } else if (rpcError) {
    body = (
      <div role="alert" className="rounded-xl border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-3 text-[12.5px] text-[#A8231A]">
        <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Vendor payment calculation failed — ask IT to check.</div>
        {isAdmin && <div className="mt-1 font-mono text-[11px] break-words">{rpcError}</div>}
      </div>
    )
  } else if (!data) {
    body = null
  } else if (!data.ada_data && data.error) {
    body = (
      <div role="alert" className="rounded-xl border border-[#F4C3BC] bg-[#FDE7E4] px-4 py-3 text-[12.5px] text-[#A8231A]">
        <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Vendor payment calculation failed — ask IT to check.</div>
        {isAdmin && <div className="mt-1 font-mono text-[11px] break-words">{data.error}</div>}
      </div>
    )
  } else if (!data.ada_data) {
    body = <div className="rounded-xl border border-[#EADFD6] bg-[#F6F1EE] px-4 py-3 text-[12.5px] text-[#6E5E70]">{data.alasan || 'No vendor payment data for this shipment yet.'}</div>
  } else {
    body = (
      <>
        {canAct && locked && <div className="rounded-xl border border-[#EADFD6] bg-white px-4 py-2 text-[11.5px] text-[#6E5E70]">{VP_LOCKED_MSG}</div>}

        {/* Needs review */}
        {(blockerItems.length > 0 || infoItems.length > 0) && (
          <div className={`${SA_CARD} overflow-hidden`} data-vp-review>
            {blockerItems.length > 0 && (
              <>
                <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[#EADFD6] bg-[#FFFCF5]">
                  <span className="text-[13px] font-bold text-[#3B1B3D]">Needs review</span>
                  <Chip tone={blockers > 0 ? 'amber' : 'green'}>{blockers > 0 ? `${blockers} to check` : 'All reviewed'}</Chip>
                </div>
                <div className="divide-y divide-[#F1E8E1]">
                  {blockerItems.map(it => (
                    <div key={it.kunci} className={`px-4 py-2.5 flex flex-col gap-1.5 ${it.diterima ? 'bg-[#FAFAFA]' : 'bg-white'}`}>
                      <div className="flex flex-wrap items-start gap-2">
                        <span className={`text-[12.5px] mr-auto min-w-0 [overflow-wrap:anywhere] ${it.diterima ? 'text-[#8A7A8B]' : 'text-[#7A4F00] font-semibold'}`}>
                          {it.jenis === 'REF_BELUM_KONFIRMASI'
                            ? <>Ref code <b>{it.data?.kode}</b> (unidentified) · doc {it.data?.doc ?? '—'} · {fmt2(it.data?.amount)}</>
                            : it.pesan}
                        </span>
                        {!it.diterima && actBtn('Accept…', () => { setAcceptFor(it); setAcceptNote('') })}
                      </div>
                      {(it.invoice || it.bt_ref) && (
                        <div className="text-[11px] text-[#8A7A8B]">{it.invoice ? `Invoice ${it.invoice}` : ''}{it.invoice && it.bt_ref ? ' · ' : ''}{it.bt_ref ? `BT ${it.bt_ref}` : ''}</div>
                      )}
                      {it.jenis === 'REF_BELUM_KONFIRMASI' && !it.diterima && (
                        <RefControls item={it} invoiceNos={invoiceNos} canAct={canAct} locked={locked} busy={!!busy} lockTitle={lockTitle} onConfirm={doConfirmRef} />
                      )}
                      {it.diterima && (
                        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#6E5E70]">
                          <span>Accepted by {it.diterima_oleh || '—'}{it.diterima_at ? ` · ${fmtDay(it.diterima_at)}` : ''} · {it.catatan_terima || '—'}</span>
                          {canAct && <span title={lockTitle}><button type="button" disabled={locked || !!busy} onClick={() => doUndo(it)} className="font-semibold text-[#6B3470] hover:underline disabled:opacity-50 disabled:no-underline">Undo</button></span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {infoItems.length > 0 && (
              <div className={`px-4 py-2 flex flex-col gap-0.5 ${blockerItems.length > 0 ? 'border-t border-[#EADFD6]' : ''}`}>
                {infoItems.map(it => <div key={it.kunci} className="text-[11.5px] text-[#2F4FA8] [overflow-wrap:anywhere]">ℹ {it.pesan}{it.invoice ? ` (${it.invoice})` : ''}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Transfer yang belum masuk invoice manapun (informasi; penanganannya lewat item review di atas) */}
        {(data.transfer || []).some(t => !t.teralokasi) && (
          <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF8EA] px-4 py-2 text-[11.5px] text-[#7A4F00]">
            <b>Transfers not allocated to any invoice:</b>{' '}
            {(data.transfer || []).filter(t => !t.teralokasi).map((t, i) => <span key={i} className="mr-3 whitespace-nowrap">{t.ref || 'BT'} · {t.ccy} {fmt2(t.amount)}{t.tgl ? ` · ${fmtDay(t.tgl)}` : ''}</span>)}
          </div>
        )}

        {invoices.map(inv => {
          const isOpen = !!openInv[inv.no]
          const panelId = `vp-inv-${String(inv.no).replace(/[^A-Za-z0-9_-]/g, '_')}`
          const termText = (inv.termin || []).map(t => `${t.persen != null ? `${Number(t.persen)}% ` : ''}${t.label}`).join(' / ')
          const remaining = Number(inv.remaining) || 0
          return (
            <div key={inv.no} className={`${SA_CARD} overflow-hidden`}>
              <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenInv(p => ({ ...p, [inv.no]: !isOpen }))}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-[#FBF7F4]">
                {isOpen ? <ChevronDown size={15} className="text-[#6E5E70] shrink-0" /> : <ChevronRight size={15} className="text-[#6E5E70] shrink-0" />}
                <span className="text-[13.5px] font-bold text-[#3B1B3D]" title={inv.nos && inv.nos.length > 1 ? inv.nos.join(', ') : undefined}>{inv.no}</span>
                <span className="text-[12px] text-[#6E5E70] tabular-nums">FI total {inv.ccy} {fmt2(inv.total)}</span>
                <span className="text-[12px] text-[#3B1B3D] font-semibold tabular-nums">Obligation {inv.ccy} {fmt2(inv.obligation)}</span>
                {termText && <Chip tone="plum">{termText}</Chip>}
                {inv.termin_src && <span className="text-[11px] text-[#8A7A8B]">{inv.termin_src}</span>}
                <span className="text-[11.5px] text-[#6E5E70] tabular-nums ml-auto">Paid {fmt2(inv.paid)} of {fmt2(inv.obligation)} · {inv.bt_count} BT · {inv.stages} stage{inv.stages === 1 ? '' : 's'}</span>
                {inv.to_check > 0 && <Chip tone="amber">{inv.to_check} to check</Chip>}
                <StatusChip status={inv.status} />
              </button>

              {isOpen && (
                <div id={panelId} className="border-t border-[#EADFD6] flex flex-col gap-3 p-4">
                  {/* a) Tabel dokumen */}
                  <div className="overflow-x-auto rounded-lg border border-[#EADFD6]">
                    <table className="w-full text-[12px] min-w-[640px]">
                      <thead>
                        <tr className="bg-[#FBF7F4] border-b border-[#EADFD6]">
                          <th className={`${SA_LABEL} text-left px-3 py-2`}>Document</th>
                          <th className={`${SA_LABEL} text-right px-3 py-2`}>Goods value</th>
                          <th className={`${SA_LABEL} text-right px-3 py-2`}>Other cost</th>
                          <th className={`${SA_LABEL} text-right px-3 py-2`}>Adj / tax</th>
                          <th className={`${SA_LABEL} text-right px-3 py-2`}>Grand total</th>
                          <th className={`${SA_LABEL} text-right px-3 py-2`}>Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inv.dokumen || []).map((d, i) => {
                          const strong = /^payment obligation/i.test(d.dokumen)
                          return (
                            <tr key={i} className={`border-b border-[#F1E8E1] last:border-b-0 align-top ${strong ? 'bg-[#FBF7F4]' : ''}`}>
                              <td className={`px-3 py-2 text-[#3B1B3D] ${strong ? 'font-bold' : 'font-semibold'}`}>
                                {d.dokumen}
                                {d.catatan && <div className="text-[11px] font-normal text-[#6E5E70] [overflow-wrap:anywhere]">{d.catatan}</div>}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt2(d.goods)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt2(d.other)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt2(d.adj)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{fmt2(d.grand)}</td>
                              <td className="px-3 py-2 text-right">
                                {d.validasi === 'Match' ? <Chip tone="green">Match</Chip> : d.validasi === 'Mismatch' ? <Chip tone="red">Mismatch</Chip> : <span className="text-[#B7A9B8]">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* b) Tile termin */}
                  {(inv.termin || []).length > 0 && (
                    <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2">
                      {inv.termin.map((t, i) => (
                        <div key={i} className="rounded-xl border border-[#EADFD6] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-bold text-[#3B1B3D] mr-auto">{t.persen != null ? `${Number(t.persen)}% ` : ''}{t.label}</span>
                            <StatusChip status={t.status} />
                          </div>
                          {t.keterangan && <div className="text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]">{t.keterangan}</div>}
                          <div className="mt-1 grid grid-cols-3 gap-2 text-[11.5px] tabular-nums">
                            <div><div className={SA_LABEL}>Expected</div>{fmt2(t.expected)}</div>
                            <div><div className={SA_LABEL}>Paid</div>{fmt2(t.paid)}</div>
                            <div><div className={SA_LABEL}>Remaining</div><span className={Number(t.remaining) > 0 ? 'text-[#A8231A] font-semibold' : ''}>{fmt2(t.remaining)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* c) Transfer proofs */}
                  <div>
                    <div className={`${SA_LABEL} mb-1.5`}>Transfer proofs</div>
                    {(inv.alokasi || []).length === 0 ? (
                      <div className="text-[12px] text-[#6E5E70]">No transfer proof allocated to this invoice yet.</div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#F1E8E1] rounded-lg border border-[#EADFD6]">
                        {inv.alokasi.map((a, i) => {
                          const bank = a.bt_ref ? rincian.find(r => r.ref === a.bt_ref && Number(r.biaya_idr) > 0) : undefined
                          return (
                            <div key={`${a.bt_ref}-${a.input_id}-${i}`} className="px-3 py-2 flex flex-wrap items-start gap-x-4 gap-y-1">
                              <div className="w-[120px] shrink-0 text-[11.5px]">
                                <div className="font-semibold text-[#3B1B3D]">{fmtDay(a.tgl)}</div>
                                {a.charge_type && <div className="text-[#6E5E70]">{a.charge_type}</div>}
                              </div>
                              <div className="flex-1 min-w-[220px] text-[12px] flex flex-col gap-0.5">
                                <div className="text-[#3B1B3D] font-semibold [overflow-wrap:anywhere]">
                                  {a.bt_ref || a.bt_file || '—'}{a.bt_amount != null ? ` · ${fmt2(a.bt_amount)} ${a.bt_ccy || ''}` : ''}
                                  {a.sumber === 'manual' && <Chip tone="grey" className="ml-1.5">manual</Chip>}
                                </div>
                                {a.remark && <div className="font-mono text-[11px] text-[#6E5E70] [overflow-wrap:anywhere]">{a.remark}</div>}
                                <div className="text-[11.5px] text-[#3B1B3D]">
                                  {a.termin ? <>→ {a.termin}</> : null}{a.kode ? <span className="text-[#6E5E70]"> · ref code {a.kode}</span> : null}
                                  {a.tag && <Chip tone="blue" className="ml-1.5">{a.tag}</Chip>}
                                </div>
                                {(a.peringatan || []).map((w, k) => <div key={k} className="text-[11.5px] font-semibold text-[#B45309]">⚠ {w}</div>)}
                                {(a.split_with || []).length > 0 && (
                                  <div className="text-[11.5px] text-[#2F4FA8]">Same BT also pays {a.split_with.map(s => `${s.invoice} (${fmt2(s.amount)})`).join(', ')}</div>
                                )}
                                {bank && <div className="text-[11.5px] text-[#6E5E70]">Bank cost, not goods: {bank.charge_type || 'OUR'} charges {fmtRpV(bank.biaya_idr)}</div>}
                                {a.catatan && <div className="text-[11px] text-[#8A7A8B] [overflow-wrap:anywhere]">{a.catatan}</div>}
                              </div>
                              <div className="text-right text-[12px] tabular-nums shrink-0">
                                <div className="font-bold text-[#3B1B3D]">{inv.ccy} {fmt2(a.amount)}</div>
                                <div className="text-[11px] text-[#6E5E70]">{a.kurs != null ? `${fmtRpV(a.rp)} @ ${fmt2(a.kurs)}` : 'bank rate not on BT'}</div>
                                {a.selisih_bank != null && Number(a.selisih_bank) !== 0 && (
                                  <div className="text-[11px] text-[#B45309]">bank deduction −{fmt2(Math.abs(Number(a.selisih_bank)))}{a.charge_type ? ` (${a.charge_type})` : ''}</div>
                                )}
                              </div>
                              {a.sumber === 'manual' && a.input_id != null && canAct && (
                                <span title={lockTitle} className="inline-flex">
                                  <button type="button" disabled={locked || !!busy} onClick={() => doDeleteProof(a)} aria-label="Delete manual transfer proof"
                                    className="p-1.5 rounded-lg text-[#A8231A] hover:bg-[#FDE7E4] disabled:opacity-50"><Trash2 size={14} /></button>
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* d) Open balance + tambah bukti */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-[12.5px] mr-auto">
                      <span className="text-[#6E5E70]">Open balance </span>
                      <b className={`tabular-nums ${remaining > 0 ? 'text-[#A8231A]' : 'text-[#17663D]'}`}>{inv.ccy} {fmt2(inv.remaining)}</b>
                    </div>
                    {actBtn(<><Plus size={13} /> Add transfer proof</>, () => setProofFor(inv))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <section id={VP_PANEL_ID} className="flex flex-col gap-3 scroll-mt-4" data-vendor-payments>
      {header}
      {body}

      {acceptFor && (
        <Dialog title="Accept review item" onClose={() => setAcceptFor(null)} busy={!!busy}
          footer={<>
            <button type="button" className={SA_BTN_OUTLINE} disabled={!!busy} onClick={() => setAcceptFor(null)}>Cancel</button>
            <button type="button" className={SA_BTN_PRIMARY} disabled={!!busy || !acceptNote.trim()} onClick={doAccept}>{busy ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Accept'}</button>
          </>}>
          <div className="text-[12.5px] text-[#3B1B3D] [overflow-wrap:anywhere]">{acceptFor.pesan}</div>
          <Field label="Note (required)" hint="Explain why this item is acceptable. It is recorded in the audit trail.">
            <textarea autoFocus rows={3} value={acceptNote} onChange={e => setAcceptNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#EADFD6] text-[13px] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15" />
          </Field>
        </Dialog>
      )}

      {proofFor && (
        <AddProofDialog inv={proofFor} busy={!!busy} onClose={() => setProofFor(null)}
          onSubmit={async v => {
            const ok = await act('add:' + proofFor.no, 'add the transfer proof', () => supabase.rpc('fn_vp_tambah_bukti_seaair', {
              p_seaair_id: sid, p_invoice_no: proofFor.no, p_tgl: v.tgl, p_amount: v.amount, p_mata_uang: proofFor.ccy,
              p_ref: v.ref || null, p_file: v.file || null, p_kurs: v.kurs, p_catatan: v.note || null,
            }))
            if (ok) setProofFor(null)
          }} />
      )}
    </section>
  )
}

// Kontrol item "Ref code … (unidentified)": saran invoice (Confirm / Not this) + Assign to invoice… + "berlaku utk kode".
function RefControls({ item, invoiceNos, canAct, locked, busy, lockTitle, onConfirm }: {
  item: ReviewItem; invoiceNos: string[]; canAct: boolean; locked: boolean; busy: boolean; lockTitle?: string
  onConfirm: (it: ReviewItem, invoiceNo: string, setuju: boolean, berlakuKode: boolean) => Promise<boolean>
}) {
  const [assign, setAssign] = useState('')
  const [allBt, setAllBt] = useState(false)
  const saran: string | null = item.data?.saran_invoice || null
  const dis = locked || busy
  if (!canAct) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-[#FBF7F4] border border-[#EADFD6] px-3 py-2" title={lockTitle}>
      {saran && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#3B1B3D]">
          <span>Suggestion: is <b>{item.data?.doc}</b> = invoice <b>{saran}</b>?</span>
          <button type="button" className={SA_BTN_PRIMARY} disabled={dis} onClick={() => onConfirm(item, saran, true, allBt)}>Confirm</button>
          <button type="button" className={SA_BTN_OUTLINE} disabled={dis} onClick={() => onConfirm(item, saran, false, false)}>Not this</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Assign to invoice" value={assign} onChange={e => setAssign(e.target.value)} disabled={dis} className={`${SA_INPUT} !w-auto min-w-[180px]`}>
          <option value="">Assign to invoice…</option>
          {invoiceNos.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className={SA_BTN_PRIMARY} disabled={dis || !assign} onClick={() => onConfirm(item, assign, true, allBt)}>Confirm</button>
      </div>
      <label className="inline-flex items-center gap-2 text-[11.5px] text-[#3B1B3D] cursor-pointer">
        <input type="checkbox" checked={allBt} disabled={dis} onChange={e => setAllBt(e.target.checked)} className="accent-[#5A305A]" />
        Apply to every BT with ref code {item.data?.kode} for this supplier
      </label>
    </div>
  )
}

function AddProofDialog({ inv, busy, onClose, onSubmit }: {
  inv: Invoice; busy: boolean; onClose: () => void
  onSubmit: (v: { tgl: string; amount: number; ref: string; file: string; kurs: number | null; note: string }) => void
}) {
  const [tgl, setTgl] = useState('')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [file, setFile] = useState('')
  const [kurs, setKurs] = useState('')
  const [note, setNote] = useState('')
  const remaining = Number(inv.remaining) || 0
  const amt = Number(amount)
  const amountErr = amount === '' ? null
    : !(amt > 0) ? 'Amount must be greater than zero.'
    : amt > remaining + 0.005 ? `Amount exceeds the open balance of ${inv.ccy} ${fmt2(remaining)}.` : null
  const kursNum = kurs.trim() === '' ? null : Number(kurs)
  const kursErr = kursNum !== null && !(kursNum > 0) ? 'Bank rate must be greater than zero.' : null
  const needRefOrFile = !ref.trim() && !file.trim()
  const valid = !!tgl && amount !== '' && !amountErr && !kursErr && !needRefOrFile
  return (
    <Dialog title={`Add transfer proof — ${inv.no}`} onClose={onClose} busy={busy}
      footer={<>
        <button type="button" className={SA_BTN_OUTLINE} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className={SA_BTN_PRIMARY} disabled={busy || !valid}
          onClick={() => onSubmit({ tgl, amount: amt, ref: ref.trim(), file: file.trim(), kurs: kursNum, note: note.trim() })}>
          {busy ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Add proof'}
        </button>
      </>}>
      <div className="text-[12px] text-[#6E5E70]">Open balance: <b className="text-[#3B1B3D] tabular-nums">{inv.ccy} {fmt2(remaining)}</b></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Transfer date (required)"><input autoFocus type="date" value={tgl} onChange={e => setTgl(e.target.value)} className={SA_INPUT} /></Field>
        <Field label="Currency"><input value={inv.ccy} readOnly disabled className={SA_INPUT} /></Field>
      </div>
      <Field label="Amount (required)" hint={amountErr ? undefined : `Maximum ${inv.ccy} ${fmt2(remaining)}`}>
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={SA_INPUT} aria-invalid={!!amountErr} />
        {amountErr && <span className="text-[11.5px] font-semibold text-[#A8231A]" role="alert">{amountErr}</span>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference no."><input value={ref} onChange={e => setRef(e.target.value)} className={SA_INPUT} /></Field>
        <Field label="or File name"><input value={file} onChange={e => setFile(e.target.value)} className={SA_INPUT} /></Field>
      </div>
      {needRefOrFile && <div className="text-[11.5px] text-[#8A7A8B]">Provide a reference number or a file name.</div>}
      <Field label="Bank rate (optional)" hint="IDR per 1 unit of the invoice currency, if the bank rate is known.">
        <input type="number" min="0" step="any" value={kurs} onChange={e => setKurs(e.target.value)} className={SA_INPUT} aria-invalid={!!kursErr} />
        {kursErr && <span className="text-[11.5px] font-semibold text-[#A8231A]" role="alert">{kursErr}</span>}
      </Field>
      <Field label="Note (optional)"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#EADFD6] text-[13px] focus:outline-none focus:border-[#6B3470] focus:ring-2 focus:ring-[#6B3470]/15" /></Field>
    </Dialog>
  )
}
