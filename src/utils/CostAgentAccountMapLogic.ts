// Pemetaan akun Ascend per PT + override vendor + pratinjau AP Note (SQL 110/110b/111, 2026-10-30) -- logika MURNI (tanpa supabase/React) supaya bisa dites.
// Server yang memilih akun & menghitung pajak; di sini hanya bentuk data, lencana, ringkasan, validasi form, dan teks issue.

// ─── Daftar Account mapping ────────────────────────────────────────────────────────────────────────────────────
export type AccountMapStatus = 'all' | 'mapped' | 'missing' | 'mismatch' | 'no_account'
export const ACCOUNT_STATUS_CHIPS: { key: AccountMapStatus; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'mapped', label: 'Mapped' }, { key: 'missing', label: 'Missing' },
  { key: 'mismatch', label: 'Mismatch' }, { key: 'no_account', label: 'No account code' },
]
export const isAccountMapStatus = (s: string | null | undefined): s is AccountMapStatus => ACCOUNT_STATUS_CHIPS.some(c => c.key === s)

export interface AccountMapRow {
  cost_item_id: number; code: string; name: string; category: string | null; gl_account: string | null; ap_description: string | null
  company_code: string; ascend_db: string | null
  map_id: number | null; ascend_account_id: number | null; account_code: string | null; account_name: string | null
  is_disabled: boolean | null; source: 'auto' | 'user' | null; is_locked: boolean | null; synced_at: string | null
  mapped: boolean; mismatch: boolean
}
export interface AccountMapList { total: number; rows: AccountMapRow[] }

export interface AccountBadge { key: 'mismatch' | 'disabled' | 'source'; label: string; tone: 'amber' | 'red' | 'blue' | 'plum'; locked?: boolean }
// Lencana satu baris: mismatch (kuning), dinonaktifkan di Ascend (merah), sumber auto / manual (+ gembok bila terkunci). Baris belum dipetakan = tanpa lencana.
export function accountBadges(r: Pick<AccountMapRow, 'mapped' | 'mismatch' | 'is_disabled' | 'source' | 'is_locked'>): AccountBadge[] {
  if (!r.mapped) return []
  const out: AccountBadge[] = []
  if (r.mismatch) out.push({ key: 'mismatch', label: "Differs from item's default account", tone: 'amber' })
  if (r.is_disabled) out.push({ key: 'disabled', label: 'Disabled in Ascend', tone: 'red' })
  if (r.source === 'user') out.push({ key: 'source', label: 'Manual', tone: 'plum', locked: !!r.is_locked })
  else if (r.source === 'auto') out.push({ key: 'source', label: 'Auto', tone: 'blue', locked: !!r.is_locked })
  return out
}

// ─── Akun Ascend (entity AC_Accounts) ──────────────────────────────────────────────────────────────────────────
export const ACCOUNT_SELECT = 'AccountID,AccountCode,AccountName,IsDisabled'
export interface AscendAccount { id: number; code: string; name: string | null; disabled: boolean }
// Baris OData -> akun; tanpa id atau kode (tidak bisa dipetakan) dibuang.
export function toAscendAccount(r: Record<string, unknown> | null | undefined): AscendAccount | null {
  if (!r) return null
  const id = Number(r.AccountID)
  const code = r.AccountCode === null || r.AccountCode === undefined ? '' : String(r.AccountCode).trim()
  if (!Number.isFinite(id) || id <= 0 || !code) return null
  const name = r.AccountName === null || r.AccountName === undefined || r.AccountName === '' ? null : String(r.AccountName)
  return { id, code, name, disabled: r.IsDisabled === true }
}
// Bentuk p_data fn_cost_agent_account_map_save / satu elemen p_accounts fn_cost_agent_account_map_autofill.
export const accountPayload = (a: AscendAccount) => ({ id: a.id, code: a.code, name: a.name, disabled: a.disabled })

export interface AccountPage { rows: AscendAccount[]; total: number | null }
export const ACCOUNT_PAGE_SIZE = 200 // $top per halaman saat menarik SEMUA akun (aman utk proxy; server menerima sampai 50.000 akun)
export const ACCOUNT_MAX_PAGES = 250
// Tarik semua akun halaman demi halaman ($top/$skip). Berhenti bila jumlah sudah mencapai total ($count), halaman kosong/kurang dari $top, atau batas halaman.
// Id ganda dibuang. `fetchPage` dibuat pemanggil (odata AC_Accounts), supaya fungsi ini murni.
export async function collectAllAccounts(
  fetchPage: (skip: number, top: number) => Promise<AccountPage>,
  onProgress?: (loaded: number, total: number | null) => void,
  isStopped?: () => boolean,
): Promise<{ accounts: AscendAccount[]; total: number | null; stopped: boolean }> {
  const byId = new Map<number, AscendAccount>()
  let total: number | null = null
  let skip = 0
  for (let page = 0; page < ACCOUNT_MAX_PAGES; page++) {
    if (isStopped?.()) return { accounts: [...byId.values()], total, stopped: true }
    const r = await fetchPage(skip, ACCOUNT_PAGE_SIZE)
    if (r.total !== null) total = r.total
    r.rows.forEach(a => byId.set(a.id, a))
    skip += ACCOUNT_PAGE_SIZE
    onProgress?.(byId.size, total)
    if (r.rows.length < ACCOUNT_PAGE_SIZE || (total !== null && skip >= total)) break
  }
  return { accounts: [...byId.values()], total, stopped: false }
}

// ─── Hasil Auto-map (fn_cost_agent_account_map_autofill) ───────────────────────────────────────────────────────
export interface AutofillItem { cost_item_id: number; code: string; gl_account: string; candidates?: number }
export interface AutofillOverrideItem { vendor_id: number; cost_item_id: number; gl_account: string }
export interface AutofillResult {
  company: string; accounts_received: number; mapped_new: number; updated: number; unchanged: number; skipped_locked: number
  cost_items_without_account: number
  not_in_ascend: AutofillItem[]; ambiguous: AutofillItem[]; disabled_in_ascend: AutofillItem[]; vendor_override_not_in_ascend: AutofillOverrideItem[]
}
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
// Daftar yang hilang / bukan array dianggap kosong (jangan error).
export function normalizeAutofill(r: Partial<AutofillResult> | null | undefined): AutofillResult {
  return {
    company: String(r?.company ?? ''), accounts_received: n(r?.accounts_received), mapped_new: n(r?.mapped_new), updated: n(r?.updated), unchanged: n(r?.unchanged),
    skipped_locked: n(r?.skipped_locked), cost_items_without_account: n(r?.cost_items_without_account),
    not_in_ascend: arr(r?.not_in_ascend), ambiguous: arr(r?.ambiguous), disabled_in_ascend: arr(r?.disabled_in_ascend),
    vendor_override_not_in_ascend: arr(r?.vendor_override_not_in_ascend),
  }
}
export const autofillSummary = (r: AutofillResult): { label: string; value: number }[] => [
  { label: 'Accounts received', value: r.accounts_received }, { label: 'Newly mapped', value: r.mapped_new }, { label: 'Updated', value: r.updated },
  { label: 'Unchanged', value: r.unchanged }, { label: 'Skipped (manual, locked)', value: r.skipped_locked }, { label: 'Cost items without account code', value: r.cost_items_without_account },
]
export type AutofillListKey = 'not_in_ascend' | 'ambiguous' | 'disabled_in_ascend'
// Tiga daftar yang selalu ditampilkan (kosong = "None"); pemanggil menambah daftar override vendor bila ada.
export const autofillLists = (r: AutofillResult): { key: AutofillListKey; title: string; hint: string; rows: AutofillItem[] }[] => [
  { key: 'not_in_ascend', title: 'Not in Ascend', hint: 'No account with this code exists in the Ascend database. Choose one manually.', rows: r.not_in_ascend },
  { key: 'ambiguous', title: 'Ambiguous', hint: 'More than one Ascend account has this code. Choose one manually.', rows: r.ambiguous },
  { key: 'disabled_in_ascend', title: 'Disabled in Ascend', hint: 'Mapped, but the account is disabled in Ascend. AP Note sending is blocked until another account is chosen.', rows: r.disabled_in_ascend },
]

// ─── Override per vendor ───────────────────────────────────────────────────────────────────────────────────────
export interface VendorOverride { id: number; vendor_id: number; cost_item_id: number; gl_account: string | null; ap_description: string | null; note: string | null }
export interface OverrideForm { cost_item_id: number | null; gl_account: string; ap_description: string; note: string }
export const OVERRIDE_GL_MAX = 40
export const OVERRIDE_DESC_MAX = 100
export function overrideFormError(f: OverrideForm): string | null {
  if (f.cost_item_id === null) return 'Choose a cost item.'
  const gl = f.gl_account.trim(), desc = f.ap_description.trim()
  if (!gl && !desc) return 'Fill the account code or the AP Note description.'
  if (gl.length > OVERRIDE_GL_MAX) return `Account code is too long (max ${OVERRIDE_GL_MAX}).`
  if (desc.length > OVERRIDE_DESC_MAX) return `AP Note description is too long (max ${OVERRIDE_DESC_MAX}).`
  return null
}
// Kedua kunci selalu dikirim: kosong = dikosongkan (server memperlakukan kunci yang ada sebagai nilai baru).
export const overridePayload = (f: OverrideForm) => ({ gl_account: f.gl_account.trim() || null, ap_description: f.ap_description.trim() || null, note: f.note.trim() || null })
export const overrideToForm = (o: VendorOverride): OverrideForm => ({ cost_item_id: o.cost_item_id, gl_account: o.gl_account || '', ap_description: o.ap_description || '', note: o.note || '' })

// ─── Aturan pajak per pelabuhan ────────────────────────────────────────────────────────────────────────────────
export const ALL_PORTS_LABEL = 'All ports'
export const taxPortLabel = (r: { port_name?: string | null }): string => (r.port_name && r.port_name.trim() ? r.port_name : ALL_PORTS_LABEL)

// ─── Pratinjau AP Note ─────────────────────────────────────────────────────────────────────────────────────────
export interface ApNoteIssueLike { level?: string; code?: string; message?: string | null; line_no?: number }
// Issue baru (account_code / account_disabled / account_mismatch) dan kode yang belum dikenal tampil memakai `message` mentah dari server; tanpa message -> kode.
export function apNoteIssueText(i: ApNoteIssueLike, company: string | null | undefined): string {
  const msg = typeof i.message === 'string' ? i.message : ''
  if (!msg) return i.code ? String(i.code) : 'Unknown issue'
  // Pemetaan jenis biaya SELALU per PT (sql/086): "... is not mapped to an Ascend expense type" -> "... is not mapped for <PT>".
  return i.code === 'expense_map' && company ? msg.replace(/ is not mapped to an Ascend expense type\s*$/, ` is not mapped for ${company}`) : msg
}
