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
      const cur = inv.currency || 'IDR'
      return inv.lines_total != null && invTotal != null
        ? `Line total does not match invoice total (Lines: ${fmtMoney(inv.lines_total, cur)} · Invoice: ${fmtMoney(invTotal, cur)})`
        : 'Line total does not match invoice total'
    }
    case 'susulan_mismatch': return 'Supporting document refers to a different invoice number'
    default: return 'Check required'
  }
}
