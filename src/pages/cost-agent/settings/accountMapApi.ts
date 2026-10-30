// Account mapping (SQL 110/110b/111, 2026-10-30): jenis biaya -> akun Ascend (AC_Accounts) per PT, plus override akun / nama AP Note per vendor.
// Alur sama dgn Finance mapping: Supabase dulu (list) -> Ascend READ-ONLY lewat proxy lean-api yang sudah ada (ascendApi.odata, X-Api-Key diisi server) -> simpan hasil.
// Server yang memilih akun; UI tidak menghitung pajak / memilih akun sendiri. Logika murni + tes: utils/CostAgentAccountMapLogic.ts.
import { supabase } from '../../../lib/supabase'
import { odata } from './ascendApi'
import { hubRpc } from './hubApi'
import {
  ACCOUNT_SELECT, collectAllAccounts, normalizeAutofill, toAscendAccount, accountPayload,
  type AccountMapList, type AccountMapStatus, type AscendAccount, type AutofillResult, type OverrideForm, type VendorOverride, overridePayload,
} from '../../../utils/CostAgentAccountMapLogic'

export const ACCOUNT_MAP_PAGE_SIZE = 100

export const accountMapList = (p: { company: string; q?: string; status?: AccountMapStatus; limit?: number; offset?: number }) =>
  hubRpc<AccountMapList>('fn_cost_agent_account_map_list', {
    p_company: p.company, p_q: p.q?.trim() || null, p_status: p.status || 'all', p_limit: p.limit ?? ACCOUNT_MAP_PAGE_SIZE, p_offset: p.offset ?? 0,
  })

// Pilihan user = source 'user' (terkunci, tidak ditimpa Auto-map).
export const accountMapSave = (costItemId: number, company: string, a: AscendAccount) =>
  hubRpc<{ saved: boolean; reason?: string; map?: Record<string, unknown>; current?: Record<string, unknown> }>('fn_cost_agent_account_map_save', {
    p_cost_item_id: costItemId, p_company: company, p_data: accountPayload(a), p_source: 'user',
  })
export const accountMapDelete = (costItemId: number, company: string) =>
  hubRpc<{ deleted: boolean }>('fn_cost_agent_account_map_delete', { p_cost_item_id: costItemId, p_company: company })

export const accountMapAutofill = (company: string, accounts: AscendAccount[]) =>
  hubRpc<Partial<AutofillResult> | null>('fn_cost_agent_account_map_autofill', { p_company: company, p_accounts: accounts.map(accountPayload) }).then(normalizeAutofill)

// ─── Ascend: AC_Accounts ────────────────────────────────────────────────────────────────────────────────────────
type ODataList = { value?: Record<string, unknown>[]; '@odata.count'?: number }
const toAccounts = (r: ODataList): AscendAccount[] => (r.value ?? []).map(toAscendAccount).filter((a): a is AscendAccount => a !== null)

// Pencarian manual (dialog "Choose account"): hanya akun aktif, maks 50. Teks kosong = 50 akun pertama menurut kode.
export async function searchAscendAccounts(database: string, text: string, top = 50): Promise<AscendAccount[]> {
  const params: Record<string, string> = { database, $select: ACCOUNT_SELECT, $filter: 'IsDisabled eq false', $orderby: 'AccountCode asc', $top: String(top) }
  if (text.trim()) params.$search = text.trim()
  return toAccounts(await odata<ODataList>('AC_Accounts', params))
}

// Auto-map: SEMUA akun database PT itu (aktif maupun nonaktif, supaya server bisa menandai yang dinonaktifkan), halaman demi halaman.
export const fetchAllAscendAccounts = (database: string, onProgress?: (loaded: number, total: number | null) => void, isStopped?: () => boolean) =>
  collectAllAccounts(async (skip, top) => {
    const r = await odata<ODataList>('AC_Accounts', { database, $select: ACCOUNT_SELECT, $orderby: 'AccountCode asc', $top: String(top), $skip: String(skip), $count: 'true' })
    const total = r['@odata.count']
    return { rows: toAccounts(r), total: typeof total === 'number' ? total : null }
  }, onProgress, isStopped)

// ─── Override per vendor ────────────────────────────────────────────────────────────────────────────────────────
// Tabel dibaca langsung (RLS); tulis hanya lewat RPC.
export async function listVendorOverrides(vendorId: number): Promise<VendorOverride[]> {
  const { data, error } = await supabase.from('cost_agent_vendor_item_overrides').select('id,vendor_id,cost_item_id,gl_account,ap_description,note').eq('vendor_id', vendorId).order('cost_item_id')
  if (error) throw new Error(error.message)
  return (data ?? []) as VendorOverride[]
}
export const saveVendorOverride = (vendorId: number, f: OverrideForm) =>
  hubRpc<VendorOverride>('fn_cost_agent_save_vendor_item_override', { p_vendor_id: vendorId, p_cost_item_id: f.cost_item_id, p_data: overridePayload(f) })
export const deleteVendorOverride = (vendorId: number, costItemId: number) =>
  hubRpc<unknown>('fn_cost_agent_delete_vendor_item_override', { p_vendor_id: vendorId, p_cost_item_id: costItemId })
