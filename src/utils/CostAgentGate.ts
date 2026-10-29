// Gerbang kelengkapan dokumen, periode invoice & auto-verify (Tahap 2a, 2026-10-28, SQL 087). Verify satu baris DAN Submit for approval ditolak server
// bila dokumen belum lengkap; error SELALU diawali "DOC_GATE:" (verify/unverify yang MEMBATALKAN tetap boleh). Detail: docs/claude/cost-agent.md.
import { callCostAgentRpc } from './CostAgentHelpers'

export interface GateItem {
  code: string; label: string; detail?: string | null; line_no?: number | null; doc_type?: string | null; doc_no?: string | null
}
export type PeriodSource = 'invoice' | 'invoice_document' | 'service_date'
export interface GatePeriod { from: string | null; to: string | null; source: PeriodSource | null }
export interface DocGate {
  enabled: boolean
  complete: boolean
  blockers: GateItem[]
  warnings: GateItem[]
  period?: GatePeriod | null
  voyage?: { arrived: string | null; departed: string | null } | null
  tolerance_days?: number
  counts?: { blockers: number; warnings: number }
}
export interface RunChecksResult {
  invoice_id: number
  status: string
  gate: DocGate
  auto_verify: { verified: number; reason: string }
  lines: { total: number; verified: number }
  ready_to_submit: boolean
}

export const costAgentGetDocGate = (invoiceId: number) => callCostAgentRpc<DocGate>('fn_cost_agent_get_doc_gate', { p_invoice_id: invoiceId })
// Menjalankan auto-verify lalu menghitung gerbang. Butuh hak edit; aman diulang.
export const costAgentRunChecks = (invoiceId: number) => callCostAgentRpc<RunChecksResult>('fn_cost_agent_run_checks', { p_invoice_id: invoiceId })
// Dua tanggal terisi atau dua-duanya kosong (kosong = hapus). Hanya status verification / rejected / failed.
export const costAgentSetInvoicePeriod = (invoiceId: number, from: string | null, to: string | null, actor?: string | null) =>
  callCostAgentRpc<GatePeriod>('fn_cost_agent_set_invoice_period', { p_invoice_id: invoiceId, p_from: from, p_to: to, p_actor: actor ?? null })

// Toast bersama saat server menolak dengan DOC_GATE: (teks mentah server panjang). Hanya temuan "Must fix" (blockers) yang menolak; Notes (warnings) tidak pernah.
export const DOC_GATE_TOAST = 'Some items must be fixed first - see Documents & Tax or the bell.'
export const isDocGateError = (e: unknown): boolean => /^\s*DOC_GATE:/.test(String((e as { message?: string })?.message ?? e ?? ''))

// Kode blocker yang diselesaikan di tab Documents & Tax (unggah susulan / lihat perbandingan).
export const isDocumentsBlocker = (code: string): boolean =>
  code === 'fp_missing' || code === 'not_analysed' || code === 'header_diff' || code === 'date_out_of_period' || code === 'line_not_in_fp' || code === 'invoice_date_diff'
  || code.startsWith('attachment_') || code.startsWith('tax_')

export const PERIOD_SOURCE_TEXT: Record<string, string> = {
  invoice: 'Period saved on the invoice (read from the header or entered by hand)',
  invoice_document: 'Arrival / departure dates printed on the invoice document',
  service_date: 'Service date (no period found on the invoice)',
}
