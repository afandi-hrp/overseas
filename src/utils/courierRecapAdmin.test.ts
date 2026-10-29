// Kunci kolom Invoice Recap Courier setelah Submit: Admin tidak terkunci (sql/094), selain Admin tetap. Tanpa import runtime ke supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { courierRecapColumnLocked, COURIER_RECAP_LOCKED_COLUMNS, toDatetimeLocalValue } from './CourierRecapRules'

const submitted = { submit_date: '2026-10-20' }
const draft = { submit_date: null }

test('non-Admin: kolom terkunci tetap terkunci pada invoice Submit; kolom lain bebas', () => {
  for (const k of COURIER_RECAP_LOCKED_COLUMNS) assert.equal(courierRecapColumnLocked(submitted, k), true, k)
  assert.equal(courierRecapColumnLocked(submitted, 'notes'), false)
  assert.equal(courierRecapColumnLocked(submitted, 'ppjk'), false)
})

test('Admin: tidak ada kolom yang terkunci, juga pada invoice Submit', () => {
  for (const k of COURIER_RECAP_LOCKED_COLUMNS) assert.equal(courierRecapColumnLocked(submitted, k, true), false, k)
})

test('invoice belum Submit tidak pernah terkunci (Admin atau bukan)', () => {
  for (const k of COURIER_RECAP_LOCKED_COLUMNS) { assert.equal(courierRecapColumnLocked(draft, k), false); assert.equal(courierRecapColumnLocked(draft, k, true), false) }
})

test('toDatetimeLocalValue: kosong / invalid -> kosong; valid -> yyyy-MM-ddTHH:mm (waktu lokal)', () => {
  assert.equal(toDatetimeLocalValue(null), '')
  assert.equal(toDatetimeLocalValue('bukan tanggal'), '')
  const d = new Date(2026, 9, 5, 8, 7)
  assert.equal(toDatetimeLocalValue(d.toISOString()), '2026-10-05T08:07')
})
