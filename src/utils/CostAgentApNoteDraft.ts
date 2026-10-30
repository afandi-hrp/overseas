// Draft AP Note Cost Agent (sql/104) -- CRUD murni lewat supabase-js (RLS), TANPA RPC. Isi draft diambil dari pratinjau yang sudah ada
// (fn_cost_agent_apnote_preview, hanya baca) lalu disimpan ke cost_agent_apnote_drafts + _lines. Kirim ke Ascend = tahap berikutnya.
import { supabase } from '../lib/supabase'
import { finApnotePreview, type ApNotePreview } from '../pages/cost-agent/settings/financeApi'

export interface ApNoteDraft {
  id: number; invoice_id: number; status: 'draft' | 'posting' | 'posted' | 'failed' | 'cancelled'
  ascend_db: string | null; company_code: string | null; supplier_code: string | null; supplier_name: string | null
  vessel_name: string | null; office: string | null; note_type: string | null; reference: string | null
  fp_no: string | null; remarks: string | null
  issues: ApNotePreview['issues']; errors: number; warnings: number
  ascend_number: string | null; post_error: string | null
  built_at: string; created_by: string | null; updated_by: string | null; updated_at: string
}
export interface ApNoteDraftLine {
  id: number; draft_id: number; line_no: number | null; invoice_line_id: number | null
  expense_type: string | null; expense_type_id: number | null; description: string | null
  qty: number; unit_price: number; ppn_rate: number | null; pph_rate: number | null; pph_type: string | null
}
export interface ApNoteDraftFull { draft: ApNoteDraft; lines: ApNoteDraftLine[] }

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export async function fetchApNoteDraft(invoiceId: number): Promise<ApNoteDraftFull | null> {
  const { data: d, error } = await supabase.from('cost_agent_apnote_drafts').select('*').eq('invoice_id', invoiceId).neq('status', 'cancelled').maybeSingle()
  if (error) throw new Error(error.message)
  if (!d) return null
  const { data: l, error: e2 } = await supabase.from('cost_agent_apnote_draft_lines').select('id,draft_id,line_no,invoice_line_id,expense_type,expense_type_id,description,qty,unit_price,ppn_rate,pph_rate,pph_type')
    .eq('draft_id', d.id).order('sort_order')
  if (e2) throw new Error(e2.message)
  return { draft: d as ApNoteDraft, lines: (l ?? []) as ApNoteDraftLine[] }
}

// PPN / PPh yang belum terisi di invoice dianggap 0% di DRAFT (invoice sendiri tidak diubah): tarif kosong -> 0, isu "tax ... is not set" turun dari error ke warning.
async function loadPreview(invoiceId: number): Promise<ApNotePreview> {
  const p = await finApnotePreview(invoiceId)
  const rows = p.rows.map(r => ({ ...r, 'PPN Rate': r['PPN Rate'] ?? 0, 'PPh Rate': r['PPh Rate'] ?? 0 }))
  const issues = p.issues.map(i => (i.level === 'error' && i.line_no !== undefined && /tax/i.test(i.message) && /not set/i.test(i.message))
    ? { ...i, level: 'warning' as const, message: `${i.message} — treated as 0%` } : i)
  return { ...p, rows, issues, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warning').length }
}

const headerFrom = (p: ApNotePreview) => ({
  ascend_db: p.header.ascend_db, company_code: p.header.company_code, supplier_code: p.header.supplier_code, supplier_name: p.header.supplier_name,
  vessel_name: p.header.vessel_name, office: p.header.office, note_type: p.header.note_type, reference: p.header.reference,
  fp_no: p.header.fp_no, remarks: p.header.remarks, issues: p.issues, errors: p.errors, warnings: p.warnings,
})
const linesFrom = (p: ApNotePreview, draftId: number) => p.rows.map((r, i) => ({
  draft_id: draftId, sort_order: i, line_no: num(r._line_no), invoice_line_id: num(r._line_id),
  expense_type: (r['Expense Type'] as string) || null, expense_type_id: num(r._expense_type_id),
  description: (r.Description as string) || null, qty: num(r.Qty) ?? 1, unit_price: num(r['Unit Price']) ?? 0,
  ppn_rate: num(r['PPN Rate']), pph_rate: num(r['PPh Rate']), pph_type: (r['PPh Type'] as string) || null, raw: r,
}))

/** Buat draft dari invoice yang sudah approved. Insert ganda (user lain lebih dulu) -> kembalikan draft yang sudah ada. */
export async function createApNoteDraft(invoiceId: number, actor: string | null): Promise<ApNoteDraftFull | null> {
  const p = await loadPreview(invoiceId)
  const { data: d, error } = await supabase.from('cost_agent_apnote_drafts')
    .insert({ invoice_id: invoiceId, status: 'draft', created_by: actor, updated_by: actor, ...headerFrom(p) }).select('id').single()
  if (error) { if (error.code === '23505') return fetchApNoteDraft(invoiceId); throw new Error(error.message) }
  if (p.rows.length) {
    const { error: e2 } = await supabase.from('cost_agent_apnote_draft_lines').insert(linesFrom(p, d.id))
    if (e2) throw new Error(e2.message)
  }
  return fetchApNoteDraft(invoiceId)
}

/** Bangun ulang dari invoice (setelah mapping/pajak berubah): header & baris diganti, edit manual hilang. */
export async function rebuildApNoteDraft(draftId: number, invoiceId: number, actor: string | null): Promise<ApNoteDraftFull | null> {
  const p = await loadPreview(invoiceId)
  const { error: e1 } = await supabase.from('cost_agent_apnote_draft_lines').delete().eq('draft_id', draftId)
  if (e1) throw new Error(e1.message)
  if (p.rows.length) {
    const { error: e2 } = await supabase.from('cost_agent_apnote_draft_lines').insert(linesFrom(p, draftId))
    if (e2) throw new Error(e2.message)
  }
  const { error: e3 } = await supabase.from('cost_agent_apnote_drafts')
    .update({ ...headerFrom(p), built_at: new Date().toISOString(), updated_by: actor, updated_at: new Date().toISOString(), post_error: null }).eq('id', draftId)
  if (e3) throw new Error(e3.message)
  return fetchApNoteDraft(invoiceId)
}

/** Sinkron setelah mapping Finance berubah: header (tanpa FPNo/Remarks), isu, dan expense type per baris diperbarui; deskripsi/qty/harga hasil edit TIDAK ditimpa. */
export async function syncApNoteDraftMapping(draftId: number, invoiceId: number, actor: string | null): Promise<ApNoteDraftFull | null> {
  const p = await loadPreview(invoiceId)
  const { fp_no: _fp, remarks: _rm, ...hdr } = headerFrom(p)
  const { error } = await supabase.from('cost_agent_apnote_drafts').update({ ...hdr, updated_by: actor, updated_at: new Date().toISOString() }).eq('id', draftId)
  if (error) throw new Error(error.message)
  const cur = await fetchApNoteDraft(invoiceId)
  const byLine = new Map(p.rows.map(r => [num(r._line_id), r]))
  await Promise.all((cur?.lines ?? []).map(async l => {
    const r = l.invoice_line_id !== null ? byLine.get(l.invoice_line_id) : undefined
    if (!r) return
    const { error: e } = await supabase.from('cost_agent_apnote_draft_lines').update({
      expense_type: (r['Expense Type'] as string) || null, expense_type_id: num(r._expense_type_id),
      ppn_rate: num(r['PPN Rate']), pph_rate: num(r['PPh Rate']), pph_type: (r['PPh Type'] as string) || null, raw: r,
    }).eq('id', l.id)
    if (e) throw new Error(e.message)
  }))
  return fetchApNoteDraft(invoiceId)
}

export async function updateApNoteDraftHeader(draftId: number, patch: { fp_no?: string | null; remarks?: string | null }, actor: string | null) {
  const { error } = await supabase.from('cost_agent_apnote_drafts').update({ ...patch, updated_by: actor, updated_at: new Date().toISOString() }).eq('id', draftId)
  if (error) throw new Error(error.message)
}
export async function updateApNoteDraftLine(lineId: number, patch: Partial<Pick<ApNoteDraftLine, 'description' | 'qty' | 'unit_price'>>) {
  const { error } = await supabase.from('cost_agent_apnote_draft_lines').update(patch).eq('id', lineId)
  if (error) throw new Error(error.message)
}
/** Hapus draft (hanya status draft/failed lewat RLS); baris ikut terhapus (cascade). Draft baru dibuat lagi saat tab dibuka. */
export async function deleteApNoteDraft(draftId: number) {
  const { error } = await supabase.from('cost_agent_apnote_drafts').delete().eq('id', draftId)
  if (error) throw new Error(error.message)
}

export function apNoteDraftTotals(lines: ApNoteDraftLine[]) {
  let subtotal = 0, ppn = 0, pph = 0
  for (const l of lines) {
    const amt = (Number(l.qty) || 0) * (Number(l.unit_price) || 0)
    subtotal += amt; ppn += amt * (l.ppn_rate ?? 0); pph += amt * (l.pph_rate ?? 0)
  }
  return { subtotal, ppn, pph, totalWithPpn: subtotal + ppn, totalAfterPph: subtotal + ppn - pph }
}
