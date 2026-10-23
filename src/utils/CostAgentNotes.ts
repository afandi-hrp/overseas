// Teks alert check_notes Agent Invoice (2026-10-16). Field `msg` dari n8n/SQL berbahasa Indonesia TIDAK ditampilkan -- teks
// Inggris disusun dari `type` + data invoice yang sudah ada, SATU baris per alert. Dipakai semua tempat yang menampilkan
// check_notes (modal review header, tab Documents & Tax) supaya seragam.
import { fmtMoney, type CostAgentCheckNote, type CostAgentInvoice } from './CostAgentHelpers'

type NoteInvoice = Pick<CostAgentInvoice,
  'vendor_name_raw' | 'vessel_name_raw' | 'vessel_name' | 'port_name_raw' | 'duplicate_of' | 'lines_total' | 'grand_total' | 'subtotal' | 'currency'>

// "<label>: <nilai>" -- nilai kosong -> label saja.
const withValue = (label: string, value: string | number | null | undefined) => {
  const v = value === null || value === undefined ? '' : String(value).trim()
  return v ? `${label}: ${v}` : label
}

// Pesan asli server (`msg`, Indonesia) -- ditampilkan KECIL & abu-abu di bawah teks Inggris (permintaan 2026-10-23); kosong -> null.
export function noteMsg(note: CostAgentCheckNote): string | null {
  const m = (note?.msg ?? note?.message) as unknown
  return typeof m === 'string' && m.trim() ? m.trim() : null
}

export function noteText(note: CostAgentCheckNote, inv: NoteInvoice): string {
  switch (note.type) {
    case 'vendor_unknown': return withValue('Vendor not in master', inv.vendor_name_raw)
    case 'vessel_unknown': return withValue('Vessel not in master', inv.vessel_name_raw)
    case 'port_unknown': return withValue('Port not in master', inv.port_name_raw)
    case 'vessel_fuzzy': {
      const raw = (inv.vessel_name_raw || '').trim(), name = (inv.vessel_name || '').trim()
      const pair = raw && name ? `${raw} → ${name}` : raw || name
      return pair ? `Vessel matched by similar name: ${pair} — please check` : 'Vessel matched by similar name — please check'
    }
    case 'voyage_unmatched': return 'Voyage / port call not matched'
    case 'duplicate': return inv.duplicate_of != null ? `Possible duplicate of invoice #${inv.duplicate_of}` : 'Possible duplicate invoice'
    case 'total_mismatch': {
      const invTotal = inv.grand_total ?? inv.subtotal
      return inv.lines_total != null && invTotal != null
        ? `Line total does not match invoice total (Lines: ${fmtMoney(inv.lines_total)} · Invoice: ${fmtMoney(invTotal)})`
        : 'Line total does not match invoice total'
    }
    case 'susulan_mismatch': return 'A supporting document refers to a different invoice number.'
    // 2026-10-23 (sql/071 & 072): PT tak bisa ditentukan dari kapal; grand total tak cocok; mata uang bukan IDR (angka tetap dianggap rupiah).
    case 'company_unknown': return 'Company could not be determined from the vessel. Please choose the company.'
    case 'grand_mismatch': return 'Grand total does not match subtotal + VAT + stamp duty − WHT. Please check the figures.'
    case 'non_idr_currency': return 'A currency other than IDR was found on the document — amounts are treated as rupiah. Please check.'
    default: return 'Check required'
  }
}
