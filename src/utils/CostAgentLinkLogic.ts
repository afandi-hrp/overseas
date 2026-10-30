// Logika MURNI tautan manual baris <-> item dokumen dan penanda "Amount includes VAT" (SQL 108 & 109, 2026-10-30). Hanya tipe yang diimpor, supaya bisa dites (npm test).
// Aturan bisnis (siapa boleh, PPN/PPh, urutan kandidat) dihitung DATABASE; modul ini hanya bentuk data tampilan, validasi isian dan hak TAMPIL tombol.
import type { DocCmpLine, DocCmpLineSide, DocCmpManualLink } from './CostAgentHelpers'
import type { MyRoles } from './CostAgentRolesLogic'

export type EvidenceSide = 'attachment' | 'tax'
export const MAX_LINK_ITEMS = 20
// "Gap incl. VAT" bernilai kecil (|selisih| <= 5 rupiah) diberi tanda hijau.
export const NEAR_GAP = 5

// Hanya TAMPIL: tombol muncul bila user punya peran yang boleh (server tetap menegakkan lewat fn_cost_agent_can_edit_line_evidence): AP Note kapan saja;
// Maker saat verification / rejected; Checker saat waiting_approval dan validasi masih pending. Approver / View saja = tidak ada tombol. Peran belum terbaca (null) = tersembunyi.
export function canEditLineEvidence(a: { status: string | null | undefined; validationPending: boolean; roles: MyRoles | null | undefined }): boolean {
  const e = a.roles?.effective
  if (!e) return false
  if (a.status === 'approved' || a.status === 'journal' || a.status === 'paid' || a.status === 'cancelled') return false
  if (e.apnote === true) return true
  if ((a.status === 'verification' || a.status === 'rejected') && e.maker === true) return true
  return a.status === 'waiting_approval' && a.validationPending && e.checker === true
}

// Tombol "Link document…" pada baris tab Documents: salah satu sisi berstatus diff / none / not_in_fp (atau manual, untuk mengubah / melepas).
const LINKABLE = ['diff', 'none', 'not_in_fp', 'manual']
export const canLinkLine = (l: Pick<DocCmpLine, 'attachment' | 'tax'>): boolean => LINKABLE.includes(String(l.attachment?.status ?? '')) || LINKABLE.includes(String(l.tax?.status ?? ''))
// Sisi yang dibuka pertama di dialog: sisi bermasalah / manual (lampiran dulu).
export const defaultLinkSide = (l: Pick<DocCmpLine, 'attachment' | 'tax'>): EvidenceSide => (LINKABLE.includes(String(l.attachment?.status ?? '')) || !LINKABLE.includes(String(l.tax?.status ?? '')) ? 'attachment' : 'tax')

// Peringatan kuning "Matches the documents as price + VAT": baris cocok dokumen sebagai harga + PPN DAN penanda belum diputuskan.
export const needsVatDecision = (hint: boolean | null | undefined, amountIncludesVat: boolean | null | undefined): boolean => hint === true && (amountIncludesVat === null || amountIncludesVat === undefined)

// Kontrol tiga keadaan "Amount includes VAT": Not decided (null) / Yes (true) / No (false).
export type VatChoice = 'undecided' | 'yes' | 'no'
export const vatChoiceOf = (v: boolean | null | undefined): VatChoice => (v === true ? 'yes' : v === false ? 'no' : 'undecided')
export const vatChoiceToBool = (c: VatChoice): boolean | null => (c === 'yes' ? true : c === 'no' ? false : null)
export const VAT_CHOICE_LABEL: Record<VatChoice, string> = { undecided: 'Not decided', yes: 'Yes', no: 'No' }
// RPC fn_cost_agent_set_line_includes_vat menolak null: "Not decided" hanya keadaan awal, tidak bisa disimpan. Alasan wajib.
export function vatFormError(choice: VatChoice, current: boolean | null | undefined, reason: string): string | null {
  if (choice === 'undecided') return 'Choose Yes or No.'
  if (vatChoiceToBool(choice) === (current ?? null)) return 'Nothing changed.'
  return reason.trim() ? null : 'A reason is required.'
}

// Item kandidat (fn_cost_agent_line_link_candidates). Urutan dari server dipertahankan; hanya dibagi per sisi.
export interface LinkCandidateItem {
  item_id: number; part_id: number; side: EvidenceSide | string; doc_type: string | null; doc_no: string | null; doc_date: string | null; description: string | null
  group_name: string | null; kind: string | null; amount: number | null; gap: number | null; gap_with_vat: number | null; similarity: number | null
  linked_manually: boolean; matched_line_no: number | null
}
export interface LinkCandidates {
  line: { line_id: number; line_no: number; description: string | null; amount: number | null; ppn_rate: number | null; vat_rate_used: number | null; amount_includes_vat: boolean | null }
  current: { attachment: DocCmpLineSide | null; tax: DocCmpLineSide | null } | null
  items: LinkCandidateItem[]
}
export const itemsOfSide = (items: LinkCandidateItem[] | null | undefined, side: EvidenceSide): LinkCandidateItem[] => (items ?? []).filter(i => i.side === side)
export const nearGap = (gapWithVat: number | null | undefined): boolean => gapWithVat !== null && gapWithVat !== undefined && Math.abs(Number(gapWithVat)) <= NEAR_GAP
// "11%" dari tarif pecahan yang dipakai server (vat_rate_used); tanpa nilai -> kosong.
export const vatPctText = (rate: number | null | undefined): string => (rate === null || rate === undefined || !Number.isFinite(Number(rate)) ? '' : `${Math.round(Number(rate) * 10000) / 100}%`)

// Pilihan item: SATU sisi per simpan (maks. 20). Memilih item dari sisi lain memulai pilihan baru di sisi itu.
export interface LinkSelection { side: EvidenceSide; ids: number[] }
export function toggleItem(sel: LinkSelection, side: EvidenceSide, itemId: number): LinkSelection {
  if (sel.side !== side) return { side, ids: [itemId] }
  if (sel.ids.includes(itemId)) return { side, ids: sel.ids.filter(x => x !== itemId) }
  return sel.ids.length >= MAX_LINK_ITEMS ? sel : { side, ids: [...sel.ids, itemId] }
}
export const initialSelection = (current: DocCmpLineSide | null | undefined, side: EvidenceSide): LinkSelection => ({ side, ids: current?.manual?.ids ? [...current.manual.ids].slice(0, MAX_LINK_ITEMS) : [] })
export function linkFormError(sel: LinkSelection, reason: string): string | null {
  if (sel.ids.length < 1) return 'Select at least one document item.'
  if (sel.ids.length > MAX_LINK_ITEMS) return `Select at most ${MAX_LINK_ITEMS} items.`
  return reason.trim() ? null : 'A reason is required.'
}
export const unlinkFormError = (reason: string): string | null => (reason.trim() ? null : 'A reason is required.')

// Tooltip lencana "Linked manually": pelaku, waktu, alasan; "item + VAT" bila incl.
export function manualTipLines(m: DocCmpManualLink | null | undefined, fmtAt: (s: string) => string = s => s): string[] {
  if (!m) return []
  return [`Linked by ${m.by || '—'}${m.at ? ` · ${fmtAt(m.at)}` : ''}`, m.reason ? `Reason: ${m.reason}` : '', m.incl ? 'Compared as item + VAT' : ''].filter(Boolean)
}
