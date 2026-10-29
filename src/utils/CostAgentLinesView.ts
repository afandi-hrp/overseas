// Baris invoice menurut peran (sql/101, 2026-10-29): fn_cost_agent_get_invoice_lines mengembalikan view 'maker' bila pengguna HANYA approver (baris asli maker, tanpa
// bagian split dan tanpa kolom checker) dan view 'full' untuk peran lain. Detail invoice masih memakai fn_cost_agent_get_invoice_history untuk kolom tambahan per baris
// (nama jenis biaya, history pembanding); modul ini hanya menentukan BARIS MANA yang tampil dan nilainya dari RPC peran -- tanpa menghitung ulang apa pun.
// Hanya `import type` supaya bisa dites (npm test).
import type { CostAgentInvoiceHistory, CostAgentInvoiceLine } from './CostAgentHelpers'

export interface InvoiceLinesResponse { invoice_id: number; view: 'full' | 'maker'; lines: Record<string, unknown>[] }

// Kolom khusus checker: dibuang dari baris view 'maker' (RPC history masih mengirimnya, RPC baris tidak).
export const CHECKER_ONLY_KEYS = ['origin_line_id', 'maker_description', 'maker_amount', 'maker_qty', 'maker_unit_price', 'is_validated', 'validated_by', 'validated_at', 'checker_remark'] as const

export function mergeLinesView(h: CostAgentInvoiceHistory | null, r: InvoiceLinesResponse | null | undefined): CostAgentInvoiceHistory | null {
  if (!h) return null
  const view: 'full' | 'maker' = r?.view === 'maker' ? 'maker' : 'full'
  const byId = new Map<number, Record<string, unknown>>((r?.lines ?? []).map(l => [Number(l.id), l]))
  const lines: CostAgentInvoiceLine[] = []
  for (const hl of h.lines ?? []) {
    const rl = byId.get(hl.id)
    if (!rl) { if (view === 'full') lines.push(hl); continue } // view 'maker': baris yang tidak dikirim server (split checker) tidak ditampilkan
    const m: Record<string, unknown> = { ...hl, ...rl, history: hl.history, cost_item_code: hl.cost_item_code, cost_item_name: hl.cost_item_name }
    if (view === 'maker') for (const k of CHECKER_ONLY_KEYS) delete m[k]
    lines.push(m as unknown as CostAgentInvoiceLine)
  }
  return { ...h, lines, lines_view: view }
}

// Teks "Original" kecil di bawah baris yang diubah checker (null bila tidak berbeda dari versi maker).
export interface OriginalInfo { description: string | null; amount: number | null }
export function originalOf(l: Pick<CostAgentInvoiceLine, 'description_raw' | 'amount' | 'maker_description' | 'maker_amount'>): OriginalInfo | null {
  const descChanged = l.maker_description != null && l.maker_description !== l.description_raw
  const amtChanged = l.maker_amount != null && Number(l.maker_amount) !== Number(l.amount)
  if (!descChanged && !amtChanged) return null
  return { description: descChanged ? l.maker_description ?? null : null, amount: amtChanged ? Number(l.maker_amount) : null }
}
