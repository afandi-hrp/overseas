// Sinkron "Checklist Note" (dokumen_checklist.catatan_checklist, per record PIB/CN) <-> "Remarks" (rekapan_courier.notes, per
// invoice) -- 2026-10-08, keputusan user (Invoice Recap Courier, "Valid (note)"). Aturan:
// - Satu AWB bisa punya beberapa invoice: Remarks SEMUA invoice AWB itu diisi sama (hanya yang BELUM di-Submit; invoice
//   ber-submit_date terkunci sql/038 & tetap memakai Remarks lamanya).
// - Sinkron HANYA saat ada yang mengedit (tidak ada penimpaan otomatis saat tampil/baca).
// - Checklist hanya bisa diedit selama PIB/CN masih Draft: edit Remarks tidak mengubah Checklist Note kalau PIB/CN Audited.
// - Tulis langsung ke tabel (BUKAN lewat jalur simpan List/Checklist) supaya dua arah tidak saling memicu berulang.
// - Gagal sinkron TIDAK menggagalkan simpan utama (hanya console.warn).
import { supabase } from '../lib/supabase'
import { courierAwbNorm, buildRecapGroup, fetchRecapAuditLinks } from './CourierRecapHelpers'
import { isCourierDraft } from './CourierAuditHelpers'

const clean = (v: any): string | null => {
  const s = String(v ?? '')
  return s.trim() === '' ? null : s
}

// Invoice (rekapan_courier) milik 1 AWB: kunci = AWB ternormalisasi (SAMA pengelompokan kartu); `linkCol/linkId` (pib_id/
// cn_id record Audit) ikut dihitung utk invoice yang tertaut lewat id walau AWB-nya ditulis beda.
export async function fetchGroupInvoices(awb: any, link?: { col: 'pib_id' | 'cn_id'; id: any }): Promise<any[]> {
  const key = courierAwbNorm(awb)
  const out = new Map<string, any>()
  if (key) {
    const { data } = await supabase.from('rekapan_courier').select('id, awb, notes, submit_date, pib_id, cn_id').ilike('awb', `%${key.replace(/[%_,()"]/g, '_')}%`)
    ;(data || []).forEach((r: any) => { if (courierAwbNorm(r.awb) === key) out.set(String(r.id), r) })
  }
  if (link && link.id != null) {
    const { data } = await supabase.from('rekapan_courier').select('id, awb, notes, submit_date, pib_id, cn_id').eq(link.col, link.id)
    ;(data || []).forEach((r: any) => out.set(String(r.id), r))
  }
  return Array.from(out.values())
}

// Checklist Note -> Remarks semua invoice AWB yang belum di-Submit. Dipanggil setelah Checklist Note berubah & tersimpan.
export async function syncChecklistNoteToRemarks(auditRec: any, note: string | null): Promise<number> {
  try {
    const isCn = String(auditRec?.jenis_dokumen || '').toUpperCase() === 'CN'
    const rows = await fetchGroupInvoices(auditRec?.awb, { col: isCn ? 'cn_id' : 'pib_id', id: auditRec?.id })
    const ids = rows.filter(r => !r.submit_date && (clean(r.notes) ?? '') !== (clean(note) ?? '')).map(r => r.id)
    if (ids.length === 0) return 0
    const { error } = await supabase.from('rekapan_courier').update({ notes: clean(note) }).in('id', ids)
    if (error) { console.warn('[RemarksSync] Checklist Note -> Remarks gagal', error.message); return 0 }
    return ids.length
  } catch (e) {
    console.warn('[RemarksSync] Checklist Note -> Remarks error', e)
    return 0
  }
}

// Remarks 1 invoice -> invoice lain AWB itu (belum Submit) + Checklist Note record PIB/CN-nya (kalau masih Draft).
export async function syncRemarkToGroup(row: any, note: string | null): Promise<void> {
  try {
    const value = clean(note)
    // 1. invoice lain di AWB yang sama
    const rows = await fetchGroupInvoices(row?.awb, row?.pib_id ? { col: 'pib_id', id: row.pib_id } : row?.cn_id ? { col: 'cn_id', id: row.cn_id } : undefined)
    const others = rows.filter(r => String(r.id) !== String(row?.id) && !r.submit_date && (clean(r.notes) ?? '') !== (value ?? '')).map(r => r.id)
    if (others.length > 0) {
      const { error } = await supabase.from('rekapan_courier').update({ notes: value }).in('id', others)
      if (error) console.warn('[RemarksSync] Remarks -> invoice lain gagal', error.message)
    }
    // 2. Checklist Note (hanya PIB/CN Draft & baris dokumen_checklist yang SUDAH ada -- tidak membuat baris baru)
    const g = buildRecapGroup(courierAwbNorm(row?.awb) || `ID:${row?.id}`, [row])
    await fetchRecapAuditLinks([g])
    const audit = g.audit
    if (!audit || !isCourierDraft(audit.rec)) return
    const col = audit.docType === 'CN' ? 'cn_id' : 'pib_id'
    const { data: cl } = await supabase.from('dokumen_checklist').select('id, catatan_checklist').eq(col, audit.rec.id).maybeSingle()
    if (!cl || !Object.prototype.hasOwnProperty.call(cl, 'catatan_checklist')) return
    if ((clean(cl.catatan_checklist) ?? '') === (value ?? '')) return
    const { error } = await supabase.from('dokumen_checklist').update({ catatan_checklist: value }).eq('id', cl.id)
    if (error) console.warn('[RemarksSync] Remarks -> Checklist Note gagal', error.message)
  } catch (e) {
    console.warn('[RemarksSync] Remarks -> grup error', e)
  }
}
