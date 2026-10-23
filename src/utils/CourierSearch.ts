// Pencarian lintas tabel Courier (2026-10-23, permintaan user: "KATEGORI SEARCH"). Kotak Search Audit Courier & Invoice Recap Courier sama2 bisa mencari:
// AWB, Invoice no, PO, Vendor, PIB no, NTPN.
// - Audit (tabel_audit_pib / tabel_audit_cn) TIDAK punya kolom Invoice no & NTPN (adanya di rekapan_courier: `no_invoice`, `ntpn`) -> `resolveAuditSearchExtra`
//   mencari dulu di rekapan_courier, hasilnya (id PIB/CN terhubung + AWB) ditambahkan sebagai kondisi OR ke query Audit.
// - Invoice Recap (rekapan_courier) tidak punya No. PIB (adanya di tabel_audit_pib.no_pib) -> `resolveRecapSearchExtra` (jalur List); jalur Card memakai RPC
//   (sql/074: kolom pencarian 'ntpn' & 'pib_no').
// Dipicu hanya bila kata kunci >= 3 karakter & dibatasi 60 baris pencocokan (kata kunci pendek = terlalu banyak cocok). Hasil di-cache 20 dtk per kata
// kunci supaya beberapa query yang berjalan bersamaan (daftar, hitungan tab, KPI) tidak mengulang pencarian yang sama.
import { supabase } from '../lib/supabase'
import { orSafe } from './supabaseQueryHelpers'
// Salinan lokal `courierAwbNorm` (CourierRecapHelpers) -- hindari import melingkar dgn CourierAuditHelpers.
const courierAwbNorm = (v: any): string | null => {
  const s = String(v ?? '').toUpperCase().replace(/^[A-Z]+\s*NO\.?\s*:?\s*/, '').replace(/[^A-Z0-9]/g, '')
  return s || null
}

export type CourierSearchExtra = { pibIds: string[]; cnIds: string[]; awbs: string[] }
export const EMPTY_SEARCH_EXTRA: CourierSearchExtra = { pibIds: [], cnIds: [], awbs: [] }

const MIN_LEN = 3
const MAX_HITS = 60
const TTL_MS = 20000
const cache = new Map<string, { at: number; p: Promise<CourierSearchExtra> }>()
function memo(key: string, load: () => Promise<CourierSearchExtra>): Promise<CourierSearchExtra> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p
  const p = load().catch(e => { console.warn('[CourierSearch] pencarian tambahan gagal', e); return EMPTY_SEARCH_EXTRA })
  cache.set(key, { at: Date.now(), p })
  return p
}
const uniq = (a: (string | null | undefined)[]) => Array.from(new Set(a.filter((x): x is string => !!x)))

// Audit: Invoice no (rekapan_courier.no_invoice) & NTPN (rekapan_courier.ntpn) -> id PIB/CN terhubung + AWB.
export function resolveAuditSearchExtra(term: string): Promise<CourierSearchExtra> {
  const t = (term || '').trim()
  if (t.length < MIN_LEN) return Promise.resolve(EMPTY_SEARCH_EXTRA)
  return memo(`audit:${t}`, async () => {
    const { data, error } = await supabase.from('rekapan_courier').select('pib_id, cn_id, awb')
      .or(`no_invoice.ilike.%${orSafe(t)}%,ntpn.ilike.%${orSafe(t)}%`).limit(MAX_HITS)
    if (error) throw error
    const rows = data || []
    return {
      pibIds: uniq(rows.map((r: any) => (r.pib_id != null ? String(r.pib_id) : null))),
      cnIds: uniq(rows.map((r: any) => (r.cn_id != null ? String(r.cn_id) : null))),
      awbs: uniq(rows.map((r: any) => courierAwbNorm(r.awb))),
    }
  })
}

// Invoice Recap (jalur List): PIB no (tabel_audit_pib.no_pib) -> id PIB + AWB.
export function resolveRecapSearchExtra(term: string): Promise<CourierSearchExtra> {
  const t = (term || '').trim()
  if (t.length < MIN_LEN) return Promise.resolve(EMPTY_SEARCH_EXTRA)
  return memo(`recap:${t}`, async () => {
    const { data, error } = await supabase.from('tabel_audit_pib').select('id, awb').ilike('no_pib', `%${orSafe(t)}%`).limit(MAX_HITS)
    if (error) throw error
    const rows = data || []
    return {
      pibIds: uniq(rows.map((r: any) => (r.id != null ? String(r.id) : null))),
      cnIds: [],
      awbs: uniq(rows.map((r: any) => courierAwbNorm(r.awb))),
    }
  })
}

// Susun kondisi `.or(...)`: kolom biasa (ilike) + (id terhubung) + (AWB cocok). mode: 'pib' / 'cn' = tabel Audit, 'recap' = rekapan_courier (kolom pib_id).
export function courierSearchOr(term: string, cols: string[], extra: CourierSearchExtra, mode: 'pib' | 'cn' | 'recap'): string {
  const parts = cols.map(c => `${c}.ilike.%${orSafe(term)}%`)
  const ids = mode === 'cn' ? extra.cnIds : extra.pibIds
  if (ids.length) parts.push(`${mode === 'recap' ? 'pib_id' : 'id'}.in.(${ids.join(',')})`)
  extra.awbs.forEach(a => parts.push(`awb.ilike.%${orSafe(a)}%`))
  return parts.join(',')
}
