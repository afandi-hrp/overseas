// Sinkron "Checklist Note" (tab Checklist Invoice Recap Sea & Air, tabel `seaair_form_e_note`, 1 baris per seaair_id) <-> "Remarks"
// Audit PIB (`tabel_audit_seaair.remarks`) -- 2026-10-13, keputusan user (opsi a; meniru CourierRemarksSync). Aturan:
// - Sinkron HANYA saat ada yang mengedit (tidak ada penimpaan otomatis saat tampil/baca).
// - Hanya selama PIB masih Draft (status ARCHIVED); PIB Audited -> Remarks / catatan dibiarkan (Audit Audited = baca saja).
// - Recap yang sudah di-Submit ke Finance (terkunci) tidak ikut berubah.
// - Remarks -> catatan: catatan minimal 5 karakter (CHECK sql/044) -> Remarks lebih pendek tidak disalin; Remarks dikosongkan -> catatan dihapus.
// - Tulis langsung (RPC lama `update_seaair_row` utk Remarks, upsert/delete tabel catatan) -- bukan lewat jalur simpan masing2,
//   supaya dua arah tidak saling memicu berulang. Gagal sinkron TIDAK menggagalkan simpan utama (hanya console.warn).
import { supabase } from '../lib/supabase'

export const CHECKLIST_NOTE_MIN = 5
const SEAAIR_DRAFT = 'ARCHIVED'

const clean = (v: any): string | null => {
  const s = String(v ?? '')
  return s.trim() === '' ? null : s
}

async function auditRow(seaairId: any): Promise<{ id: any; status: string | null; remarks: string | null } | null> {
  const { data, error } = await supabase.from('tabel_audit_seaair').select('id, status, remarks').eq('id', seaairId).maybeSingle()
  if (error || !data) return null
  return data as any
}

// Checklist Note -> Remarks Audit PIB. Dipanggil setelah catatan tersimpan / dihapus. true = Remarks diubah.
export async function syncChecklistNoteToRemarks(seaairId: any, note: string | null): Promise<boolean> {
  try {
    if (!seaairId) return false
    const row = await auditRow(seaairId)
    if (!row || row.status !== SEAAIR_DRAFT) return false
    const value = clean(note)
    if ((clean(row.remarks) ?? '') === (value ?? '')) return false
    const { error } = await supabase.rpc('update_seaair_row', { p_id: seaairId, p_updates: { remarks: value } })
    if (error) { console.warn('[SeaAirRemarksSync] Checklist Note -> Remarks gagal', error.message); return false }
    return true
  } catch (e) {
    console.warn('[SeaAirRemarksSync] Checklist Note -> Remarks error', e)
    return false
  }
}

// Remarks Audit PIB -> Checklist Note. Dipanggil setelah Remarks diedit & tersimpan (form Edit / edit inline List). true = catatan diubah.
export async function syncRemarksToChecklistNote(seaairId: any, remarks: string | null): Promise<boolean> {
  try {
    if (!seaairId) return false
    const row = await auditRow(seaairId)
    if (!row || row.status !== SEAAIR_DRAFT) return false
    // Recap sudah di-Submit ke Finance -> terkunci, catatan tidak diubah.
    const { data: recaps } = await supabase.from('rekapan_seaair').select('id, tgl_submit_finance').eq('seaair_id', seaairId)
    if ((recaps || []).some((r: any) => r.tgl_submit_finance)) return false
    const value = clean(remarks)
    if (value === null) {
      const { error } = await supabase.from('seaair_form_e_note').delete().eq('seaair_id', seaairId)
      if (error) { console.warn('[SeaAirRemarksSync] Remarks -> Checklist Note (hapus) gagal', error.message); return false }
      return true
    }
    if (value.trim().length < CHECKLIST_NOTE_MIN) return false
    const { data: sess } = await supabase.auth.getSession()
    const { error } = await supabase.from('seaair_form_e_note')
      .upsert({ seaair_id: seaairId, note: value, updated_by: sess?.session?.user?.email || null, updated_at: new Date().toISOString() }, { onConflict: 'seaair_id' })
    if (error) { console.warn('[SeaAirRemarksSync] Remarks -> Checklist Note gagal', error.message); return false }
    return true
  } catch (e) {
    console.warn('[SeaAirRemarksSync] Remarks -> Checklist Note error', e)
    return false
  }
}

// Remarks Audit PIB yang tersimpan sekarang (isi awal kotak Checklist Note bila catatan masih kosong). null = tak ada / tak bisa dibaca.
export async function fetchAuditRemarks(seaairId: any): Promise<{ remarks: string | null; draft: boolean } | null> {
  try {
    if (!seaairId) return null
    const row = await auditRow(seaairId)
    return row ? { remarks: clean(row.remarks), draft: row.status === SEAAIR_DRAFT } : null
  } catch {
    return null
  }
}
