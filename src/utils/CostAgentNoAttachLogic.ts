// Logika MURNI "No attachment for this vendor" (SQL 112, 2026-10-31): vendor + jenis biaya yang memang tidak pernah mengirim lampiran, dikonfirmasi maker di baris invoice.
// Server memutuskan siapa boleh (can_confirm_none, can_add_cost_item) dan mengubah status baris menjadi 'confirmed_none'; di sini hanya validasi form & teks. Hanya tipe yang diimpor (npm test).
import type { DocCmpLine, DocCmpLineSide, NoAttachConfirmResult } from './CostAgentHelpers'

export const NO_ATT_NOTE_MAX = 300 // server memotong catatan di 300 karakter
export const NO_ATT_STATUSES = ['none', 'no_doc']

// Tombol "No attachment for this vendor": hanya bila server mengizinkan (can_confirm_none) pada baris berstatus none / no_doc.
export const canShowConfirmNone = (l: Pick<DocCmpLine, 'attachment'>): boolean => !!l.attachment && l.attachment.can_confirm_none === true && NO_ATT_STATUSES.includes(String(l.attachment.status ?? ''))
// Baris 'none' / 'no_doc' yang belum bisa dikonfirmasi karena vendor / jenis biaya belum dipilih -> teks petunjuk kecil (bukan tombol).
export const NEEDS_VENDOR_ITEM_HINT = 'Choose the vendor and a specific cost item first.'
export function needsVendorItemHint(l: Pick<DocCmpLine, 'attachment' | 'cost_item'>, vendorId: number | null | undefined): boolean {
  const a = l.attachment
  if (!a || !NO_ATT_STATUSES.includes(String(a.status ?? '')) || a.can_confirm_none === true) return false
  return !l.cost_item || vendorId === null || vendorId === undefined
}
export const isConfirmedNone = (side: Pick<DocCmpLineSide, 'status'> | null | undefined): boolean => side?.status === 'confirmed_none'
// rule_id pencabutan: hanya ada pada baris confirmed_none yang punya aturan aktif.
export const confirmedRuleId = (side: Pick<DocCmpLineSide, 'status' | 'confirmation'> | null | undefined): number | null => (isConfirmedNone(side) && side?.confirmation?.rule_id != null ? Number(side.confirmation.rule_id) : null)

export const noteError = (note: string): string | null => (note.trim() ? null : 'A note is required.')
export const reasonError = (reason: string): string | null => (reason.trim() ? null : 'A reason is required.')

export const CONFIRM_TITLE = 'Confirm: this vendor sends no attachment for this cost'
export const confirmBody = (vendor: string | null | undefined, item: string | null | undefined): string =>
  `Vendor ${vendor || '—'} and cost item ${item || '—'} will be remembered. Next invoices from this vendor with this cost item will be recognised automatically and will not need manual verification.`
export function confirmToast(r: Pick<NoAttachConfirmResult, 'validation_reset'> | null | undefined): string {
  return `Saved. This vendor will be recognised automatically next time.${r?.validation_reset ? ' The line validation was reset - validate it again.' : ''}`
}
