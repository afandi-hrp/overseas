// Panggilan READ-ONLY ke master Ascend lewat proxy lean-api (browser -> /api/lean/odata/*, X-Api-Key diisi SERVER). Dipakai tab Ascend (daftar),
// tab Finance mapping dan kartu Finance mapping di detail invoice. Tidak ada kredensial di frontend.
// Pencarian kandidat hanya meminta kolom aman ($select wajib; server membatasi user ber-hak cost_agent_invoice saja ke kolom yang sama,
// server/leanPolicy.ts) -- JANGAN menambah kolom bank/rekening/alamat.
import { apiFetch } from '../../../lib/apiFetch'

// 13 database Ascend yang dikenal (dipakai tab Ascend & dialog Map vessels to Ascend). AS_MJS_TSET = penulisan asli di lean-api.
export const ASCEND_DATABASES = [
  'AS_WNS', 'AS_WNS_TEST', 'AS_MJS', 'AS_MJS_TSET', 'AS_AMT', 'AS_AMT_TEST', 'AS_IMI', 'AS_IMI_TEST', 'AS_GMI', 'AS_GMI_TEST', 'AS_TTP', 'AS_TTP_TEST', 'AS_GUN', 'AS_WSI',
] as const

export class AscendError extends Error {
  status: number | null
  constructor(message: string, status: number | null) { super(message); this.status = status }
  // Proxy/lean-api/SQL Server tidak terjangkau (jaringan putus atau 502/503/504).
  get unreachable(): boolean { return this.status === null || [502, 503, 504].includes(this.status) }
}

export async function odata<T>(path: string, params: Record<string, string>): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(`/api/lean/odata/${path}?${new URLSearchParams(params)}`)
  } catch (e: any) {
    throw new AscendError(e?.message || 'Network error', null)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new AscendError(body?.error?.message || body?.pesan || `Request failed (HTTP ${res.status})`, res.status)
  return body as T
}

export const ascendErrorText = (e: unknown): string => {
  if (e instanceof AscendError && e.unreachable) return 'Ascend is not reachable. Try again in a moment.'
  return (e as { message?: string })?.message || String(e)
}

// ─── Pencarian kandidat ─────────────────────────────────────────────────────────────────────────────────────────
export type AscendKind = 'supplier' | 'vessel' | 'expense'

// ─── Master COA (AC_Accounts) -- dipilih per baris draft AP Note ──────────────────────────────────────────────
export interface AscendAccount { id: number; code: string | null; name: string | null }
// Istilah dipecah per kata (semua harus ada, di kode ATAU nama akun); kosong = semua akun aktif urut kode.
export async function searchAccounts(database: string, term: string, top = 50): Promise<AscendAccount[]> {
  const toks = words(term).filter(w => w.length >= 2).slice(0, 4)
  const filter = ['IsDisabled eq false', ...toks.map(w => `(contains(AccountName,${lit(w)}) or contains(AccountCode,${lit(w)}))`)].join(' and ')
  const r = await odata<{ value: Record<string, unknown>[] }>('AC_Accounts', { database, $select: 'AccountID,AccountCode,AccountName,IsDisabled', $filter: filter, $orderby: 'AccountCode', $top: String(top) })
  return (r.value || []).map(x => ({ id: Number(x.AccountID), code: x.AccountCode == null ? null : String(x.AccountCode), name: x.AccountName == null ? null : String(x.AccountName) }))
}

// Bentuk kandidat = bentuk yang dibaca fn_cost_agent_finance_pick & disimpan fn_cost_agent_finance_save_map.
export interface AscendCandidate {
  id: string | number
  code?: string | null
  name?: string | null
  npwp?: string | null
  description?: string | null
  account_name?: string | null
  is_vessel?: boolean | null
  disabled?: boolean | null
  fleet?: string | null
}

const SPEC: Record<AscendKind, { entity: string; select: string; nameCol: string; order: string }> = {
  supplier: { entity: 'AP_Suppliers', select: 'SupplierID,SupplierCode,SupplierName,NPWP,Disabled', nameCol: 'SupplierName', order: 'SupplierName asc' },
  vessel: { entity: 'IC_InventoryUsers_Fleet', select: 'InventoryUserID,InventoryUserCode,InventoryUserName,FleetName,Disabled,IsVessel', nameCol: 'InventoryUserName', order: 'InventoryUserName asc' },
  expense: { entity: 'FI_ExpenseTypes_Account', select: 'ExpenseTypeID,ExpenseTypeDescription,AccountName,Disabled', nameCol: 'ExpenseTypeDescription', order: 'ExpenseTypeDescription asc' },
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

// Bentuk badan usaha / awalan kapal dibuang supaya "PT. ABC" cocok dgn "ABC, PT" dan "MV. BERLIAN 1" cocok dgn "BERLIAN 1".
const LEGAL = /\b(PT|CV|UD|PD|TBK|PTE|LTD|LIMITED|CO|CORP|CORPORATION|INC|SDN|BHD|KOPERASI|PERSERO)\b/gi
// Kata umum di nama perusahaan: tidak membedakan vendor, jadi tidak dipakai sbg kata cari bila ada kata lain.
const GENERIC = new Set([
  'INDONESIA', 'INDO', 'NUSANTARA', 'INTERNASIONAL', 'INTERNATIONAL', 'GLOBAL', 'GROUP', 'UTAMA', 'SERVICE', 'SERVICES', 'JASA', 'TRANS', 'TRANSPORT',
  'TRANSPORTASI', 'LOGISTIK', 'LOGISTICS', 'SHIPPING', 'MARINE', 'MARITIM', 'AGENCY', 'AGENCIES', 'AGEN', 'PELAYARAN', 'PERKASA', 'SEJAHTERA', 'MANDIRI', 'ABADI',
])
const VESSEL_PREFIX = /^\s*(M\/?V|M\/?T|T\/?B|S\/?P\/?O\/?B|K\/?M|K\/?T|TB|MV|MT|KM|KT)\b\.?\s*/i
export const stripVesselPrefix = (name: string) => name.replace(VESSEL_PREFIX, '').trim()

const words = (t: string) => t.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)

// Kata paling khas dari nama vendor: badan usaha & kata umum dibuang, ambil kata terpanjang (>= 3 huruf).
export function distinctiveWord(name: string): string {
  const all = words(name.toUpperCase().replace(LEGAL, ' '))
  const pool = all.filter(w => w.length >= 3 && !GENERIC.has(w))
  const pick = (a: string[]) => a.reduce((best, w) => (w.length > best.length ? w : best), '')
  return pick(pool) || pick(all.filter(w => w.length >= 3)) || all[0] || name.trim().toUpperCase()
}

// Beberapa kata (semuanya harus ada), dipakai utk istilah yang diketik user & jenis biaya: 3 kata terpanjang, urutan asli dijaga.
function tokens(term: string): string[] {
  const all = words(term)
  const long = all.filter(w => w.length >= 3)
  const pick = new Set([...long].sort((a, b) => b.length - a.length).slice(0, 3))
  const res = long.filter(w => pick.has(w))
  return res.length ? [...new Set(res)] : all.slice(0, 2)
}

const vesselPhrase = (name: string) => stripVesselPrefix(name.toUpperCase()).replace(/\s+/g, ' ').trim()

export const looksLikeNpwp = (term: string): boolean => {
  const digits = term.replace(/\D/g, '')
  return digits.length >= 10 && /^[\d.\-\s]+$/.test(term.trim())
}

const ACTIVE = 'Disabled eq false'

// NPWP: hanya digit dikirim. NPWP di Ascend yang berformat titik/strip tidak akan cocok -> hasil kosong itu NORMAL (bukan error).
const npwpFilter = (npwp: string) => `${ACTIVE} and contains(NPWP,${lit(npwp.replace(/\D/g, ''))})`

// $filter untuk istilah yang diketik user di dialog. Supplier: NPWP bila istilah berupa NPWP; kapal: seluruh nama (tanpa awalan MV/MT);
// lainnya: kata-kata nama (semuanya harus ada).
export function buildAscendFilter(kind: AscendKind, term: string): string {
  const spec = SPEC[kind]
  const raw = term.trim()
  if (!raw) return ACTIVE
  if (kind === 'supplier' && looksLikeNpwp(raw)) return npwpFilter(raw)
  if (kind === 'vessel') return `${ACTIVE} and contains(${spec.nameCol},${lit(vesselPhrase(raw) || raw.toUpperCase())})`
  const toks = tokens(raw)
  return [ACTIVE, ...(toks.length ? toks : [raw.toUpperCase()]).map(w => `contains(${spec.nameCol},${lit(w)})`)].join(' and ')
}

type Raw = Record<string, unknown>
const s = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

export function toCandidate(kind: AscendKind, r: Raw): AscendCandidate {
  if (kind === 'supplier') return { id: r.SupplierID as number, code: s(r.SupplierCode), name: s(r.SupplierName), npwp: s(r.NPWP), disabled: r.Disabled === true }
  if (kind === 'vessel') return { id: r.InventoryUserID as number, code: s(r.InventoryUserCode), name: s(r.InventoryUserName), fleet: s(r.FleetName), is_vessel: r.IsVessel !== false, disabled: r.Disabled === true }
  return { id: r.ExpenseTypeID as number, description: s(r.ExpenseTypeDescription), account_name: s(r.AccountName), disabled: r.Disabled === true }
}

async function searchByFilter(kind: AscendKind, database: string, filter: string, top: number): Promise<AscendCandidate[]> {
  const spec = SPEC[kind]
  const r = await odata<{ value: Raw[] }>(spec.entity, {
    database, $select: spec.select, $filter: filter, $orderby: spec.order, $top: String(top),
  })
  return (r.value || []).map(x => toCandidate(kind, x))
}

export const searchAscend = (kind: AscendKind, database: string, term: string, top = 50) => searchByFilter(kind, database, buildAscendFilter(kind, term), top)

// `aliases` = alias vendor (dialog Map to Ascend massal): tiap alias menambah satu pencarian kata khas (maks 3 kata unik), hanya utk supplier.
export interface MasterQuery { name: string; npwp?: string | null; alias?: string | null; aliases?: string[] | null }

// Pencarian dari data master (Auto-map & pembukaan dialog), hasil digabung & dedup per id; yang memutuskan cocok-tidaknya = fn_cost_agent_finance_pick di database.
//  - Supplier: NPWP (digit saja) bila vendor punya NPWP + satu kata paling khas dari nama vendor.
//  - Kapal: seluruh nama kapal tanpa awalan MV/MT.
//  - Jenis biaya: AP Note name (finance_alias) lebih dulu, lalu nama jenis biaya.
export function masterFilters(kind: AscendKind, m: MasterQuery): string[] {
  if (kind === 'supplier') {
    const f: string[] = []
    if (m.npwp && looksLikeNpwp(m.npwp)) f.push(npwpFilter(m.npwp))
    const words = new Set([distinctiveWord(m.name)])
    for (const a of m.aliases ?? []) { if (words.size >= 3) break; if (a.trim()) words.add(distinctiveWord(a)) }
    for (const w of words) f.push(`${ACTIVE} and contains(SupplierName,${lit(w)})`)
    return f
  }
  if (kind === 'vessel') return [buildAscendFilter('vessel', m.name)]
  return [...new Set([m.alias, m.name].filter((x): x is string => !!x && !!x.trim()))].map(t => buildAscendFilter('expense', t))
}

export async function candidatesForMaster(kind: AscendKind, database: string, m: MasterQuery): Promise<AscendCandidate[]> {
  const seen = new Map<string, AscendCandidate>()
  for (const f of masterFilters(kind, m)) {
    for (const c of await searchByFilter(kind, database, f, 100)) seen.set(String(c.id), c)
  }
  return [...seen.values()]
}

// Cetakan data yang disimpan fn_cost_agent_finance_save_map (p_data).
export function saveData(kind: AscendKind, c: AscendCandidate): Record<string, unknown> {
  if (kind === 'supplier') return { id: c.id, code: c.code, name: c.name, npwp: c.npwp }
  if (kind === 'vessel') return { id: c.id, code: c.code, name: c.name }
  return { id: c.id, description: c.description, account_name: c.account_name }
}
