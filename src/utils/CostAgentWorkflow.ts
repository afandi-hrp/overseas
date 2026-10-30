// Alur kerja Cost Agent Tahap 2b (2026-10-28, SQL 088): role maker / checker / approver, jalur PARALEL (validasi checker + approval), pemisahan tugas (SoD),
// split baris, void, My tasks dan Settings. Server menegakkan semuanya; tombol di UI MENGIKUTI `me.can_*` dari fn_cost_agent_get_workflow.
// Kode error server (diawali): "SoD:" pemisahan tugas, "TOTAL_CHANGED:" total invoice berubah sejak submit, "DOC_GATE:" dokumen belum lengkap. Detail: docs/claude/cost-agent.md.
import { callCostAgentRpc } from './CostAgentHelpers'
import type { MyRoles, UserRolesList } from './CostAgentRolesLogic'
import type { LineVerifyReasons } from './CostAgentVerifyReasons'
import type { EvidenceSide, LinkCandidates } from './CostAgentLinkLogic'

export type ValidationStatus = 'pending' | 'validated' | 'returned' | 'skipped'
// Approval Matrix v2 (sql/090): mode 'any' (salah satu email cukup) | 'all' (SEMUA email harus setuju); votes = suara yang tercatat (by = yang menekan, for = email yang diwakili).
export type ApprovalMode = 'any' | 'all'
export interface ApprovalVote { by: string; for: string; decision: 'approved' | 'rejected'; at: string; note?: string | null }
export interface WorkflowApproval {
  step: number; label: string; emails: string[]; decision: 'pending' | 'approved' | 'rejected' | 'skipped'
  decided_by: string | null; decided_at: string | null; note: string | null
  mode?: ApprovalMode; votes?: ApprovalVote[]; is_director?: boolean
}
export interface Workflow {
  invoice_id: number
  status: string
  round: number | null
  submitted_by: string | null
  submitted_at: string | null
  approved_at: string | null
  validation: null | { status: ValidationStatus; by: string | null; at: string | null; note: string | null }
  approvals: WorkflowApproval[]
  current_step: null | { step: number; label: string; emails: string[]; mode?: ApprovalMode; votes?: ApprovalVote[]; since?: string | null; waiting_days?: number | null }
  me: { email: string; can_verify: boolean; can_validate: boolean; can_approve: boolean; can_forward?: boolean; acting_for?: string | null; blocked_reason: string | null }
}
export const costAgentGetWorkflow = (invoiceId: number) => callCostAgentRpc<Workflow>('fn_cost_agent_get_workflow', { p_invoice_id: invoiceId })

export interface MyTask {
  task: 'verify' | 'validate' | 'approve'
  invoice_id: number; invoice_no: string | null; company: string | null; vendor: string | null; vessel: string | null
  amount: number | null; status: string; since: string | null; open_lines: number | null
  acting_for?: string | null // sql/090: tugas approve sbg PENGGANTI dari email ini
}
// Alasan per baris kenapa belum auto-verified (hanya baca; aturan dihitung di database). Tipe & tampilan: utils/CostAgentVerifyReasons.ts.
export const costAgentGetLineVerifyReasons = (invoiceId: number) => callCostAgentRpc<LineVerifyReasons>('fn_cost_agent_get_line_verify_reasons', { p_invoice_id: invoiceId })
export const costAgentMyTasks = (limit = 200) => callCostAgentRpc<MyTask[]>('fn_cost_agent_my_tasks', { p_limit: limit })

export const costAgentCheckerValidate = (invoiceId: number, note: string | null, actor?: string | null) =>
  callCostAgentRpc<{ status: string; validated?: boolean; approvals_pending?: number; history_rows?: number }>('fn_cost_agent_checker_validate', { p_invoice_id: invoiceId, p_note: note, p_actor: actor ?? null })
// sql/101: "Validated" per baris (checker, saat validasi menunggu). p_validated = false membatalkan. Mengubah teks / nominal / split baris otomatis mencabutnya.
export const costAgentCheckerValidateLine = (lineId: number, validated = true, actor?: string | null) =>
  callCostAgentRpc<{ line_id: number; validated: boolean }>('fn_cost_agent_checker_validate_line', { p_line_id: lineId, p_validated: validated, p_actor: actor ?? null })
export const costAgentCheckerValidateLines = (invoiceId: number, actor?: string | null) =>
  callCostAgentRpc<{ validated: number; skipped_without_cost_item: number }>('fn_cost_agent_checker_validate_lines', { p_invoice_id: invoiceId, p_actor: actor ?? null })
export const costAgentCheckerSetLineRemark = (lineId: number, remark: string, actor?: string | null) =>
  callCostAgentRpc<{ line_id: number }>('fn_cost_agent_checker_set_line_remark', { p_line_id: lineId, p_remark: remark, p_actor: actor ?? null })
export const costAgentCheckerSetCostItem =(lineId: number, costItemId: number, learnAlias = true, actor?: string | null) =>
  callCostAgentRpc<unknown>('fn_cost_agent_checker_set_cost_item', { p_line_id: lineId, p_cost_item_id: costItemId, p_learn_alias: learnAlias, p_actor: actor ?? null })

// Pecah satu baris jadi 2..20 bagian; JUMLAH bagian harus sama dengan nilai baris asal (total invoice tidak berubah).
export interface SplitPart { description: string; amount: number; cost_item_id?: number | null }
export const costAgentSplitLine = (lineId: number, parts: SplitPart[], actor?: string | null) =>
  callCostAgentRpc<{ line_ids: number[]; total_unchanged: boolean }>('fn_cost_agent_split_line', { p_line_id: lineId, p_parts: parts, p_actor: actor ?? null })

// Ubah pajak satu baris (checker / apnote): tarif PECAHAN (0.11), wajib alasan; baris ditandai tax_source = 'manual'.
export const costAgentOverrideLineTax = (lineId: number, data: { ppn_rate: number | null; pph_type: string | null; pph_rate: number | null }, reason: string) =>
  callCostAgentRpc<unknown>('fn_cost_agent_override_line_tax', { p_line_id: lineId, p_data: data, p_reason: reason })

// SQL 108: penanda "Amount includes VAT" per baris (true = sudah termasuk PPN, false = di luar PPN); alasan wajib. Server menghitung ulang ppn_amount / pph_amount.
export interface SetLineIncludesVatResult { id: number; line_no: number; amount: number; amount_includes_vat: boolean | null; ppn_rate: number | null; ppn_amount: number | null; pph_rate: number | null; pph_amount: number | null }
export const costAgentSetLineIncludesVat = (lineId: number, includes: boolean, reason: string) =>
  callCostAgentRpc<SetLineIncludesVatResult>('fn_cost_agent_set_line_includes_vat', { p_line_id: lineId, p_includes: includes, p_reason: reason })

// SQL 109: tautan manual baris <-> item dokumen. Kandidat diurutkan server (jangan diurutkan ulang). Simpan = SATU sisi per panggilan, 1..20 item, alasan wajib.
export const costAgentLineLinkCandidates = (lineId: number) => callCostAgentRpc<LinkCandidates>('fn_cost_agent_line_link_candidates', { p_line_id: lineId })
export const costAgentLinkLineItems = (lineId: number, side: EvidenceSide, itemIds: number[], reason: string, includesVat: boolean) =>
  callCostAgentRpc<{ line_id: number; side: string; linked: number; includes_vat: boolean; validation_reset: boolean }>('fn_cost_agent_link_line_items',
    { p_line_id: lineId, p_side: side, p_item_ids: itemIds, p_reason: reason, p_includes_vat: includesVat })
export const costAgentUnlinkLineItems = (lineId: number, side: EvidenceSide, reason: string) =>
  callCostAgentRpc<{ line_id: number; side: string; unlinked: number }>('fn_cost_agent_unlink_line_items', { p_line_id: lineId, p_side: side, p_reason: reason })

export const costAgentVoidInvoice = (invoiceId: number, reason: string, actor?: string | null) =>
  callCostAgentRpc<{ status: string }>('fn_cost_agent_void_invoice', { p_invoice_id: invoiceId, p_reason: reason, p_actor: actor ?? null })

export interface CostAgentSetting { key: string; value: unknown; type: 'number' | 'boolean' | 'string' | 'array' | 'object'; group: string; updated_at: string | null }
export const costAgentListSettings = () => callCostAgentRpc<CostAgentSetting[]>('fn_cost_agent_list_settings', {})
export const costAgentSaveSetting = (key: string, value: unknown) => callCostAgentRpc<{ key: string; value: unknown }>('fn_cost_agent_save_setting', { p_key: key, p_value: value })

const msg = (e: unknown) => String((e as { message?: string })?.message ?? e ?? '')
export const isSodError = (e: unknown): boolean => /^\s*SoD:/.test(msg(e))
export const isTotalChangedError = (e: unknown): boolean => /^\s*TOTAL_CHANGED:/.test(msg(e))

// ─── Approval Matrix v2 (SQL 090, 2026-10-28) ────────────────────────────────────────────────────────────────────
// Semua aturan (mode, urutan, pengganti, SoD, Director) dihitung DATABASE; UI hanya meneruskan & menampilkan. fn_cost_agent_due_reminders / mark_reminded KHUSUS n8n (bukan dari browser).
export interface RouteStep { step: number; label: string; emails: string[]; mode: ApprovalMode; substitutes: { for: string; substitute: string; until: string }[]; missing_emails: boolean }
export interface ApprovalRoute {
  matched: boolean; steps: RouteStep[]; validation: boolean; sod: boolean; director_forward: boolean; reason?: string | null
  invoice_id?: number; company?: string | null; office?: string | null; amount?: number
}
export const costAgentApprovalPreview = (invoiceId: number) => callCostAgentRpc<ApprovalRoute>('fn_cost_agent_approval_preview', { p_invoice_id: invoiceId })
export const costAgentSimulateMatrix = (company: string | null, vendorId: number | null, amount: number, office: string | null) =>
  callCostAgentRpc<ApprovalRoute>('fn_cost_agent_simulate_matrix', { p_company: company, p_vendor_id: vendorId, p_amount: amount, p_office: office })
// p_ids = id baris matriks dari SATU aturan (PT, vendor, office, rentang nilai sama) dalam urutan baru -> step_no 1..n.
export const costAgentReorderMatrix = (ids: number[]) => callCostAgentRpc<{ id: number; step_no: number; label: string }[]>('fn_cost_agent_reorder_matrix', { p_ids: ids })
export const costAgentForwardApproval = (invoiceId: number, note: string | null, actor?: string | null) =>
  callCostAgentRpc<{ status: string; forwarded_to?: string[]; director_step?: number }>('fn_cost_agent_forward_approval', { p_invoice_id: invoiceId, p_note: note, p_actor: actor ?? null })

export interface Delegation { id: number; from: string; to: string; valid_from: string; valid_to: string; reason: string | null; active_now: boolean; created_by: string | null }
export const costAgentListDelegations = (onlyActive = false) => callCostAgentRpc<Delegation[]>('fn_cost_agent_list_delegations', { p_only_active: onlyActive })
export const costAgentSaveDelegation = (id: number | null, from: string, to: string, validFrom: string, validTo: string, reason: string | null) =>
  callCostAgentRpc<unknown>('fn_cost_agent_save_delegation', { p_id: id, p_from: from, p_to: to, p_valid_from: validFrom, p_valid_to: validTo, p_reason: reason })
export const costAgentDeleteDelegation = (id: number) => callCostAgentRpc<{ deleted: number }>('fn_cost_agent_delete_delegation', { p_id: id })

// Hari menunggu sebelum langkah berwarna oranye = setting reminder_after_days (hak baca master; bila tak terbaca dipakai 3).
let reminderDays: Promise<number> | null = null
export const getReminderAfterDays = (): Promise<number> => {
  if (!reminderDays) {
    reminderDays = costAgentListSettings().then(l => { const v = Number(l.find(s => s.key === 'reminder_after_days')?.value); return Number.isFinite(v) && v > 0 ? v : 3 }).catch(() => 3)
  }
  return reminderDays
}
export const isAlreadyRecordedError = (e: unknown): boolean => /already recorded/i.test(msg(e))

// ─── Peran per user (SQL 092, Tahap 3c) ──────────────────────────────────────────────────────────────────────────
// Ditetapkan di Settings > User roles. Hak LIHAT/EDIT per fitur tidak lagi dipakai; setiap user tetap butuh View ke Agency Invoices.
export const costAgentListUserRoles = () => callCostAgentRpc<UserRolesList>('fn_cost_agent_list_user_roles', {})
export const costAgentSaveUserRoles = (email: string, roles: string[], note?: string | null) =>
  callCostAgentRpc<{ email: string; roles: string[] }>('fn_cost_agent_save_user_roles', { p_email: email, p_roles: roles, p_note: note ?? null })
export const costAgentMyRoles = () => callCostAgentRpc<MyRoles>('fn_cost_agent_my_roles', {})
// Cache sesi (sekali per muat halaman, tanpa polling); gagal -> dibuang supaya muat halaman berikutnya mencoba lagi.
let myRolesCache: Promise<MyRoles> | null = null
export const getMyRoles = (): Promise<MyRoles> => {
  if (!myRolesCache) myRolesCache = costAgentMyRoles().catch(e => { myRolesCache = null; throw e })
  return myRolesCache
}
export const resetMyRolesCache = () => { myRolesCache = null }
