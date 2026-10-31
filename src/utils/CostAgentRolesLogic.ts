// Logika MURNI peran Cost Agent (Tahap 3c, 2026-10-28, SQL 092): tabel Settings > User roles (checkbox <-> p_roles), strip coverage, chip "peran saya" di header,
// dan daftar centang `gate_block_codes` (centang <-> array yang disimpan). Tanpa import runtime (hanya tipe) supaya bisa dites langsung (npm test).
// Aturan bisnis TIDAK dihitung di sini: siapa boleh apa tetap hasil RPC (fn_cost_agent_my_roles / get_workflow.me.can_*); modul ini hanya bentuk data tampilan.

export const ROLE_KEYS = ['maker', 'checker', 'approver', 'apnote', 'treasury'] as const
export type RoleKey = typeof ROLE_KEYS[number]
export const ROLE_LABEL: Record<RoleKey, string> = { maker: 'Maker', checker: 'Checker', approver: 'Approver', apnote: 'AP Note', treasury: 'Treasury' }
export type RoleChecks = Record<RoleKey, boolean>

export interface UserRolesRow { email: string; roles: string[]; note: string | null; updated_at: string | null; updated_by: string | null }
export interface UserRolesList { roles_strict: boolean; users: UserRolesRow[]; coverage: Partial<Record<RoleKey, number>> }
export interface MyRoles { email: string | null; assigned: string[]; roles_strict: boolean; effective: Partial<Record<RoleKey, boolean>> }

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isValidEmail = (s: string): boolean => EMAIL_RE.test(s.trim())

export const emptyChecks = (): RoleChecks => ({ maker: false, checker: false, approver: false, apnote: false, treasury: false })
export const checksFromRoles = (roles: readonly string[] | null | undefined): RoleChecks => {
  const c = emptyChecks()
  ;(roles ?? []).forEach(r => { const k = String(r).toLowerCase() as RoleKey; if (k in c) c[k] = true })
  return c
}
// Checkbox baris -> p_roles (urutan tetap ROLE_KEYS; kosong = hapus user dari daftar).
export const rolesFromChecks = (c: Partial<RoleChecks>): RoleKey[] => ROLE_KEYS.filter(k => c[k] === true)
export const sameChecks = (a: Partial<RoleChecks>, b: Partial<RoleChecks>): boolean => ROLE_KEYS.every(k => (a[k] === true) === (b[k] === true))

export interface CoverageItem { key: RoleKey; label: string; count: number; warn: boolean; help: string | null }
// "Maker 2 · Checker 1 · Approver 0 ..." -- peran tanpa user diberi tanda peringatan + teks bantu.
export const coverageItems = (coverage: Partial<Record<RoleKey, number>> | null | undefined): CoverageItem[] =>
  ROLE_KEYS.map(k => {
    const count = Number(coverage?.[k] ?? 0)
    return { key: k, label: ROLE_LABEL[k], count, warn: count === 0, help: count === 0 ? `No one can act as ${ROLE_LABEL[k]} yet` : null }
  })
// Satu kalimat utk semua peran yang masih 0 user (null bila semuanya terisi): "No one can act as Maker, Checker yet."
export const noOneSentence = (items: CoverageItem[]): string | null => { const z = items.filter(i => i.warn).map(i => i.label); return z.length ? `No one can act as ${z.join(', ')} yet.` : null }
export const coverageText = (items: CoverageItem[]): string => items.map(i => `${i.label} ${i.count}`).join(' · ')

// Chip peran saya di header Agency Invoices: peran efektif yang true; bila tidak ada dan roles_strict aktif -> "View only".
export function myRoleChips(my: MyRoles | null | undefined): { chips: string[]; viewOnly: boolean } {
  if (!my) return { chips: [], viewOnly: false }
  const chips = ROLE_KEYS.filter(k => my.effective?.[k] === true).map(k => ROLE_LABEL[k])
  return { chips, viewOnly: chips.length === 0 && my.roles_strict === true }
}

// Tab Payments di detail invoice (2026-10-29, permintaan user): disembunyikan dari Maker dan Approver. Yang punya peran sisi keuangan (Checker / AP Note / Treasury)
// tetap melihatnya, jadi orang yang merangkap tidak kehilangan tab. Peran belum terbaca (null) -> tampil (server tetap yang menegakkan).
export const canSeePaymentsTab = (my: MyRoles | null | undefined): boolean => {
  if (!my) return true
  const e = my.effective ?? {}
  const finance = e.checker === true || e.apnote === true || e.treasury === true
  return finance || !(e.maker === true || e.approver === true)
}

// Server menolak karena peran ("Akses ditolak: butuh role maker (cost_agent_maker)", fn_cost_agent_assert_role). fn_cost_agent_run_checks (auto-verify) khusus Maker;
// pengguna lain (Checker / Approver / View) cukup membaca gerbang lewat fn_cost_agent_get_doc_gate -- lihat useInvoiceGate (components/CostAgentDocGate.tsx).
export const isAccessDeniedError = (e: unknown): boolean => /^\s*Akses ditolak/i.test(String((e as { message?: string })?.message ?? e ?? ''))

// ─── gate_block_codes (Settings > Documents & auto-verify) ──────────────────────────────────────────────────────
export interface GateCodeOption { code: string; label: string; locked?: boolean }
export interface GateCodeGroup { title: string; codes: GateCodeOption[] }
export const GATE_CODE_GROUPS: GateCodeGroup[] = [
  { title: 'Cost lines vs attachment', codes: [
    { code: 'not_analysed', label: 'Documents not read yet', locked: true },
    { code: 'attachment_missing', label: 'No attachment received' },
    { code: 'attachment_diff', label: 'Line amount differs from the attachment' },
    { code: 'attachment_line_missing', label: 'Line has no matching attachment' },
  ] },
  { title: 'Tax invoice', codes: [
    { code: 'fp_missing', label: 'Tax invoice not received' },
    { code: 'tax_line_diff', label: 'Line amount differs from the tax invoice' },
    { code: 'line_not_in_fp', label: 'Taxable line (per tax rule) is not on the tax invoice' },
    { code: 'tax_total_diff', label: 'Tax totals differ' },
    { code: 'tax_rate_diff', label: 'Unexpected VAT rate on the tax invoice' },
  ] },
  { title: 'Header and dates', codes: [
    { code: 'header_diff', label: 'Seller, buyer, NPWP, vessel or invoice number differs' },
    { code: 'invoice_date_diff', label: 'Invoice date differs from the printed date' },
    { code: 'period_missing', label: 'Invoice period is empty' },
    { code: 'date_out_of_period', label: 'Port document date is outside the invoice period' },
    { code: 'voyage_missing', label: 'Invoice is not linked to a voyage report' },
    { code: 'voyage_period_diff', label: 'Voyage report period differs from the invoice period' },
    { code: 'trip_date_diff', label: 'Arrival/departure date differs between sources' }, // SQL 112
    { code: 'trip_vessel_diff', label: 'Vessel name differs between sources' }, // SQL 112
  ] },
]
export const KNOWN_GATE_CODES: string[] = GATE_CODE_GROUPS.flatMap(g => g.codes.map(c => c.code))
export const LOCKED_GATE_CODES: string[] = GATE_CODE_GROUPS.flatMap(g => g.codes.filter(c => c.locked).map(c => c.code))

const normCodes = (v: unknown): string[] => (Array.isArray(v) ? v : []).map(x => String(x).trim().toLowerCase()).filter(Boolean)
// Kode di setting yang tidak ada di daftar di atas -> baris "Other: <kode>" yang tetap bisa diubah.
export const otherGateCodes = (selected: unknown): string[] => Array.from(new Set(normCodes(selected))).filter(c => !KNOWN_GATE_CODES.includes(c))
// Nilai yang disimpan: urutan daftar dikenal dulu, lalu kode lain; kode terkunci (not_analysed) SELALU ikut; tanpa duplikat.
export function gateCodesToSave(selected: unknown): string[] {
  const set = new Set(normCodes(selected))
  LOCKED_GATE_CODES.forEach(c => set.add(c))
  const known = KNOWN_GATE_CODES.filter(c => set.has(c))
  const other = Array.from(set).filter(c => !KNOWN_GATE_CODES.includes(c))
  return [...known, ...other]
}
export const toggleGateCode = (selected: unknown, code: string, on: boolean): string[] => {
  const c = code.trim().toLowerCase()
  const cur = normCodes(selected).filter(x => x !== c)
  return gateCodesToSave(on || LOCKED_GATE_CODES.includes(c) ? [...cur, c] : cur)
}
