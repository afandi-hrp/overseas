// Hub "Cost Agent Settings" (2026-10-26) -- tipe hasil RPC + pembungkus RPC. Semua tulis lewat RPC berguard (sql/076/077/079), TIDAK menulis
// langsung ke tabel master. Bentuk hasil mengikuti sql/079 (diverifikasi dari file SQL); RPC Cost Items / aliases / master log / delete_vessel
// (sql/076-077) belum terbaca di DB production saat ini dibuat -> field-nya opsional & dibaca toleran di komponen.
import { supabase } from '../../../lib/supabase'

export type Office = 'MEDAN' | 'JAKARTA'
export const OFFICE_LABEL: Record<string, string> = { MEDAN: 'Medan', JAKARTA: 'Jakarta', NONE: 'Not set' }
export const OFFICE_OPTIONS: { value: Office; label: string }[] = [{ value: 'MEDAN', label: 'Medan' }, { value: 'JAKARTA', label: 'Jakarta' }]

// Error RPC dgn kode Postgres (23505 duplikat, 23503 masih dipakai) -- pesan server (Inggris) dipakai apa adanya.
export class HubRpcError extends Error {
  code: string | null
  constructor(message: string, code: string | null) { super(message); this.code = code }
}
export async function hubRpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new HubRpcError(error.message, (error as { code?: string }).code ?? null)
  return data as T
}
// Buang nilai kosong ('' / null / undefined) dari p_filter (kosong = tidak difilter).
export const cleanFilter = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) out[k] = v })
  return out
}
// Jumlah baris yang dipindahkan oleh merge (`moved` = { tabel: n }).
export const sumMoved = (moved: unknown): number =>
  moved && typeof moved === 'object' ? Object.values(moved as Record<string, unknown>).reduce<number>((a, b) => a + (Number(b) || 0), 0) : 0

// ─── Vessels ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface HubVessel {
  id: number; name: string; name_key?: string | null; prefix: string | null; vessel_type: string | null
  dwt: number | null; gt: number | null; hp: number | null; year_built: number | null
  company_code: string | null; short_code: string | null; aliases: string[] | null; is_active: boolean
  office: Office | null; office_hint: Office | null; missing: string[] | null
  invoices_count: number; voyages_count: number; history_count: number
}
export interface HubList<T> { total: number; rows: T[] }
export const hubListVessels = (f: Record<string, unknown>) => hubRpc<HubList<HubVessel>>('fn_cost_agent_list_vessels', { p_filter: cleanFilter(f) })
export const hubSaveVessel = (id: number | null, data: Record<string, unknown>) => hubRpc<HubVessel>('fn_cost_agent_save_vessel', { p_id: id, p_data: data })
export const hubSetVesselsOffice = (ids: number[], office: Office | null) =>
  hubRpc<{ updated: number; office: string | null }>('fn_cost_agent_set_vessels_office', { p_ids: ids, p_office: office })
export const hubMergeVessels = (keep: number, remove: number) => hubRpc<HubMergeResult>('fn_cost_agent_merge_vessels', { p_keep: keep, p_remove: remove })
export const hubDeleteVessel = (id: number) => hubRpc<unknown>('fn_cost_agent_delete_vessel', { p_id: id })
export interface HubMergeResult { kept_id: number; removed_id: number; moved: Record<string, number>; invoices_recompared: number }

// ─── Vendors ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface HubVendor {
  id: number; name: string; name_key?: string | null; npwp: string | null; aliases: string[] | null; is_active: boolean; missing: string[] | null
  invoices_count: number; history_count: number; rules_count: number; alias_count: number
}
export const hubListVendors = (f: Record<string, unknown>) => hubRpc<HubList<HubVendor>>('fn_cost_agent_list_vendors', { p_filter: cleanFilter(f) })
export const hubSaveVendor = (id: number | null, data: Record<string, unknown>) => hubRpc<HubVendor>('fn_cost_agent_save_vendor', { p_id: id, p_data: data })
export const hubMergeVendors = (keep: number, remove: number) => hubRpc<HubMergeResult>('fn_cost_agent_merge_vendors', { p_keep: keep, p_remove: remove })
export const hubDeleteVendor = (id: number) => hubRpc<unknown>('fn_cost_agent_delete_vendor', { p_id: id })

// ─── Ports ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface HubPort {
  id: number; code: string; name: string; aliases: string[] | null; province: string | null; lat: number | null; lon: number | null
  tz: string | null; is_verified: boolean; source: string | null; notes: string | null
  invoices_count: number; history_count: number; calls_count: number
}
export interface HubPortList extends HubList<HubPort> { provinces: string[]; sources: string[] }
export const hubListPorts = (f: Record<string, unknown>) => hubRpc<HubPortList>('fn_cost_agent_list_ports', { p_filter: cleanFilter(f) })
export const hubSavePort = (id: number | null, data: Record<string, unknown>) => hubRpc<HubPort>('fn_cost_agent_save_port', { p_id: id, p_data: data })
export const hubSetPortsVerified = (ids: number[], verified: boolean) => hubRpc<{ updated: number }>('fn_cost_agent_set_ports_verified', { p_ids: ids, p_verified: verified })
export const hubMergePorts = (keep: number, remove: number) => hubRpc<HubMergeResult>('fn_cost_agent_merge_ports', { p_keep: keep, p_remove: remove })
export const hubDeletePort = (id: number) => hubRpc<unknown>('fn_cost_agent_delete_port', { p_id: id })
export const PORT_TZ: { value: string; label: string }[] = [
  { value: 'Asia/Jakarta', label: 'WIB' }, { value: 'Asia/Makassar', label: 'WITA' }, { value: 'Asia/Jayapura', label: 'WIT' },
]
export const tzShort = (tz: string | null | undefined): string => PORT_TZ.find(t => t.value === tz)?.label ?? (tz || '—')

// ─── Companies ───────────────────────────────────────────────────────────────────────────────────────────────
export interface HubCompany {
  code: string; name: string | null; npwp: string | null; is_active: boolean; missing: string[] | null
  vessels_count: number; invoices_count: number; rules_count: number
}
export const hubListCompanies = () => hubRpc<{ rows: HubCompany[] }>('fn_cost_agent_list_companies', {})
export const hubSaveCompany = (code: string, data: Record<string, unknown>) => hubRpc<HubCompany>('fn_cost_agent_save_company', { p_code: code, p_data: data })

// ─── History ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface HubHistoryRow {
  id: number; service_date: string | null; invoice_date: string | null; invoice_no: string | null; voyage_no: string | null; activity: string | null
  description_raw: string | null; qty: number | null; unit_price: number | null; amount: number | null; currency: string | null
  company_code: string | null; vessel_dwt: number | null; source: string | null; is_active: boolean; source_invoice_id: number | null
  cost_item_code: string | null; cost_item_name: string | null; vendor_name: string | null; vessel_name: string | null
  port_code: string | null; port_name: string | null; used_by_lines: number
}
export interface HubHistoryList extends HubList<HubHistoryRow> { total_amount: number; sources: string[] }
export const hubBrowseHistory = (f: Record<string, unknown>) => hubRpc<HubHistoryList>('fn_cost_agent_browse_history', { p_filter: cleanFilter(f) })
export const hubSetHistoryActive = (ids: number[], active: boolean, reason: string | null) =>
  hubRpc<{ updated: number; invoices_recompared: number }>('fn_cost_agent_set_history_active', { p_ids: ids, p_active: active, p_reason: reason })

// ─── Dashboard ───────────────────────────────────────────────────────────────────────────────────────────────
export interface HubDashboard {
  filter?: { office: string | null; company_code: string | null; months: number; from: string }
  generated_at?: string
  status?: { status: string; count: number; total: number }[]
  attention?: Record<string, number>
  compare?: {
    flags?: Record<string, number>
    top_naik?: { invoice_id: number; invoice_no: string | null; description_raw: string | null; amount: number | null; ref_amount: number | null; compare_diff_pct: number | null }[]
  }
  trend?: { month: string; office: string; invoices: number; total: number }[]
  top_cost_items?: { code: string; name: string; category: string | null; lines: number; total: number }[]
  top_vendors?: { id: number; name: string; invoices: number; total: number }[]
  top_vessels?: { id: number; name: string; office: Office | null; invoices: number; total: number }[]
  waiting_list?: {
    id: number; invoice_no: string | null; vendor_name: string | null; vessel_name: string | null; office: Office | null; company_code: string | null
    total: number | null; submitted_at: string | null; age_days: number | null; pending_step: number | null; pending_approver: string | null
  }[]
  failed_list?: { kind: 'invoice' | 'document'; invoice_id: number; invoice_no: string | null; file_name: string | null; error: string | null; at: string | null }[]
  master_health?: Record<string, number>
}
export const hubDashboard = (f: Record<string, unknown>) => hubRpc<HubDashboard>('fn_cost_agent_dashboard', { p_filter: cleanFilter(f) })

// ─── Cost items (sql/076-077) -- field dibaca toleran ──────────────────────────────────────────────────────────
export interface HubCostItem {
  id: number; code: string; name: string; category: string | null; gl_account: string | null; priority: number | null
  keywords: string[] | null; is_active: boolean; is_system?: boolean | null
  lines_count?: number | null; history_count?: number | null; alias_count?: number | null
}
export interface HubCostItemList { categories?: { category: string; count: number }[]; rows: HubCostItem[]; total?: number }
export const hubListCostItems = (f: Record<string, unknown>) => hubRpc<HubCostItemList>('fn_cost_agent_list_cost_items', { p_filter: cleanFilter(f) })
export interface HubKeywordWarning { keyword?: string; other_code?: string; kind?: string }
export const hubSaveCostItem = (id: number | null, data: Record<string, unknown>) =>
  hubRpc<{ item: HubCostItem; warnings?: HubKeywordWarning[] | null }>('fn_cost_agent_save_cost_item', { p_id: id, p_data: data })
export const hubRenameCategory = (oldName: string, newName: string) => hubRpc<unknown>('fn_cost_agent_rename_category', { p_old: oldName, p_new: newName })
export const hubTestClassify = (desc: string, vendorId: number | null) =>
  hubRpc<{ normalized?: string; result?: Record<string, any> | null; candidates?: Record<string, any>[] | null }>('fn_cost_agent_test_classify', { p_desc: desc, p_vendor_id: vendorId })
export const hubListAliases = (costItemId: number | null, q: string | null, limit = 100) =>
  hubRpc<{ total?: number; rows: Record<string, any>[] }>('fn_cost_agent_list_aliases', { p_cost_item_id: costItemId, p_q: q, p_limit: limit })
export const hubUpdateAlias = (id: number, costItemId: number) => hubRpc<unknown>('fn_cost_agent_update_alias', { p_id: id, p_cost_item_id: costItemId })
export const hubDeleteAlias = (id: number) => hubRpc<unknown>('fn_cost_agent_delete_alias', { p_id: id })
export interface HubReclassifyResult { changed?: number; has_more?: boolean; last_line_id?: number | null; invoices?: number | null; changes?: Record<string, any>[] | null }
export const hubReclassify = (costItemId: number | null, apply: boolean, limit: number, afterLineId: number | null) =>
  hubRpc<HubReclassifyResult>('fn_cost_agent_reclassify_open_lines', { p_cost_item_id: costItemId, p_apply: apply, p_limit: limit, p_after_line_id: afterLineId })

// ─── Master log ──────────────────────────────────────────────────────────────────────────────────────────────
export interface HubLogRow { id: number; entity: string; entity_id: number | null; action: string; summary: string | null; actor: string | null; created_at: string }
export const hubMasterLog = (entity: string | null, limit = 20) =>
  hubRpc<HubLogRow[] | null>('fn_cost_agent_list_master_log', { p_entity: entity, p_limit: limit }).then(r => r || [])

// Kode NPWP: 15 atau 16 digit (titik / strip diperbolehkan); kosong = valid (dikosongkan).
export const npwpError = (v: string): string | null => {
  if (!v.trim()) return null
  const n = v.replace(/\D/g, '').length
  return n === 15 || n === 16 ? null : 'NPWP must have 15 or 16 digits'
}
// Teks lengkap angka bulat id-ID (DWT/GT/HP: tanpa desimal bila bulat, maks 2 desimal).
export const numOrNull = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
