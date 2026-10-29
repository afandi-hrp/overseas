// Aturan revisi Invoice Recap Courier (2026-10-14, permintaan user) -- SATU sumber utk panel Validation (Card), List & persen
// Cost Validation (computeLiveCostSummary):
// - Credit Note: per baris tabel_cost_validasi ada SATU agregat CN Freight & SATU agregat CN Duty (n8n menjumlah bila ada >1
//   credit note sejenis). "Belum habis" = sisa subtotal ATAU sisa VAT masih > 0.
// - Bonded storage estimate "sudah disimpan" = cv_storage_input_manual true (diisi saveCourierStorageEstimate).
// - Kunci Submit all to Finance & Paid Date sampai Cost Validation = 100% DAN Doc Validation = 100% (Checklist tidak wajib),
//   HANYA utk invoice yang dibuat SETELAH fitur aktif (COURIER_RECAP_RULES_FROM) & belum di-Submit. Invoice lama tidak dikunci.
//   Syarat CN habis + storage disimpan ikut menentukan 100% Cost Validation, juga hanya utk data setelah tanggal yang sama.
// Kunci HANYA di frontend (pola kunci "Needs check" Section Total) -- DB tidak menolak.

// ── Kunci SETELAH Submit Date terisi (2026-10-23, permintaan user; DB: sql/075 `fn_courier_recap_lock`) ──
// Dulu: invoice ber-Submit Date terkunci SELURUH baris. Kini semua kolom TETAP BISA DIEDIT kecuali kolom di bawah (nama kolom `rekapan_courier`); kolom itu hanya bisa
// diubah setelah Unlock (Admin, cara unlock TIDAK berubah). DELETE tetap ditolak. Kolom Finance (finance_received_*, tgl_lunas, paid_*) tetap bebas; aturan akses Paid Date TIDAK berubah.
export const COURIER_RECAP_LOCKED_COLUMNS: readonly string[] = [
  'no_invoice', 'courier_adm_fee', 'total_duty_tax', 'total_freight', 'total_amount', 'bm', 'ppn', 'pph', 'ntpn', 'awb',
  'breakdown_courier_adm_vessel', 'breakdown_duty_vessel', 'breakdown_freight_vessel', 'breakdown_bm_vessel', 'breakdown_ppnpph_vessel', 'created_at',
  'submit_date', // keputusan user 2026-10-23: Submit Date ikut terkunci (mengosongkannya = membuka kunci tanpa Unlock Admin & alasan) -- DB: sql/076
]
// 2026-10-29 (permintaan user, DB: sql/094): role ADMIN tidak terkena kunci kolom ini di Edit Mode List (semua kolom bisa diedit tanpa Unlock); selain Admin tetap terkunci.
export const courierRecapColumnLocked = (r: any, key: string, isAdmin = false): boolean => !isAdmin && !!r?.submit_date && COURIER_RECAP_LOCKED_COLUMNS.includes(key)
// Nilai <input type="datetime-local"> (waktu lokal browser) dari timestamp ISO; kosong/invalid -> ''.
export const toDatetimeLocalValue = (v: any): string => {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Tanggal fitur aktif (jam lokal WIB). Data yang dibuat sebelum ini TIDAK terkena aturan kunci & syarat CN/storage.
export const COURIER_RECAP_RULES_FROM = '2026-10-14T00:00:00+07:00'
const RULES_FROM_MS = new Date(COURIER_RECAP_RULES_FROM).getTime()
export const isCourierRulesRecord = (createdAt: any): boolean => {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  return !isNaN(t) && t >= RULES_FROM_MS
}

const n = (v: any) => { const x = Number(v); return isNaN(x) ? 0 : x }

export type CnSide = 'freight' | 'duty'
export type CnState = { side: CnSide; total: number; subtotal: number; vat: number; done: boolean; log: any[] }
const logOf = (v: any): any[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
// CN yang ADA di baris cost (total > 0, sama syarat form CN di Details).
export function courierCnStates(cv: any): CnState[] {
  if (!cv) return []
  return (['freight', 'duty'] as CnSide[])
    .filter(side => n(cv[`cv_cn_${side}_total`]) > 0)
    .map(side => {
      const subtotal = n(cv[`cv_cn_${side}_subtotal`])
      const vat = n(cv[`cv_cn_${side}_vat`])
      return { side, total: Math.abs(n(cv[`cv_cn_${side}_total`])), subtotal, vat, done: subtotal <= 0 && vat <= 0, log: logOf(cv[`cv_cn_${side}_log`]) }
    })
}
export const courierHasStorage = (cv: any) => !!cv && cv.cv_storage_actual !== null && cv.cv_storage_actual !== undefined
export const courierStorageSaved = (cv: any) => !!cv?.cv_storage_input_manual

// ─── Kunci Submit / Paid Date ────────────────────────────────────────────────────────────────────────────────
// null = tidak dikunci. 'validation' = validasi belum 100%; 'no_audit' = invoice baru tanpa pasangan PIB/CN (tidak bisa divalidasi).
export type CourierValidationLock = null | 'validation' | 'no_audit'
// Invoice yang terkena aturan: dibuat setelah fitur aktif & belum di-Submit.
export const courierRowUnderRules = (r: any) => isCourierRulesRecord(r?.created_at) && !r?.submit_date
export function courierValidationLock(rows: any[], hasAudit: boolean, docPct: number | null | undefined, costPct: number | null | undefined): CourierValidationLock {
  if (!rows.some(courierRowUnderRules)) return null
  if (!hasAudit) return 'no_audit'
  return (docPct ?? 0) >= 100 && (costPct ?? 0) >= 100 ? null : 'validation'
}
export const courierLockTitle = (lock: CourierValidationLock, docPct?: number | null, costPct?: number | null) =>
  lock === 'no_audit'
    ? 'Locked — this AWB has no PIB / CN in Audit yet, so it cannot be validated'
    : lock === 'validation'
      ? `Locked until Cost Validation and Doc Validation are 100% (Checklist not required) — Cost ${costPct ?? 0}% · Doc ${docPct ?? 0}%`
      : undefined
