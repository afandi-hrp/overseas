// Tampilan per peran Cost Agent (2026-10-29): tab Payments tidak untuk Maker / Approver, dan nominal Split dikunci ke nilai baris.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSeePaymentsTab, type MyRoles } from './CostAgentRolesLogic'
import { clampSplitInput, splitRoom } from './CostAgentSplit'

const my = (effective: MyRoles['effective']): MyRoles => ({ email: 'a@b.co', assigned: [], roles_strict: true, effective })

test('Payments: Maker saja / Approver saja / Maker+Approver tidak melihat tab', () => {
  assert.equal(canSeePaymentsTab(my({ maker: true })), false)
  assert.equal(canSeePaymentsTab(my({ approver: true })), false)
  assert.equal(canSeePaymentsTab(my({ maker: true, approver: true })), false)
})

test('Payments: peran keuangan (Checker / AP Note / Treasury) tetap melihat, juga bila merangkap Maker', () => {
  assert.equal(canSeePaymentsTab(my({ checker: true })), true)
  assert.equal(canSeePaymentsTab(my({ treasury: true })), true)
  assert.equal(canSeePaymentsTab(my({ apnote: true })), true)
  assert.equal(canSeePaymentsTab(my({ maker: true, treasury: true })), true)
})

test('Payments: tanpa peran (View only) dan peran belum terbaca tetap tampil', () => {
  assert.equal(canSeePaymentsTab(my({})), true)
  assert.equal(canSeePaymentsTab(null), true)
  assert.equal(canSeePaymentsTab(undefined), true)
})

test('Split: sisa = nilai baris dikurangi bagian lain; baris negatif / nol tidak dikunci', () => {
  assert.equal(splitRoom(1000, ['300']), 700)
  assert.equal(splitRoom(1000, ['300', '', 'abc', '200']), 500)
  assert.equal(splitRoom(1000, ['1000']), 0)
  assert.equal(splitRoom(-500, ['100']), null)
  assert.equal(splitRoom(0, []), null)
})

test('Split: angka yang melebihi sisa dipotong ke sisa; yang sah dibiarkan; minus dibuang', () => {
  assert.equal(clampSplitInput('800', 1000, ['300']), '700')
  assert.equal(clampSplitInput('700', 1000, ['300']), '700')
  assert.equal(clampSplitInput('250', 1000, ['300']), '250')
  assert.equal(clampSplitInput('5000', 1000, []), '1000')
  assert.equal(clampSplitInput('-50', 1000, []), '50')
  assert.equal(clampSplitInput('', 1000, ['300']), '')
  assert.equal(clampSplitInput('12.', 1000, []), '12.')
})

test('Split: baris negatif (credit) memakai isian apa adanya; sisa nol menolak angka tambahan', () => {
  assert.equal(clampSplitInput('-200', -500, []), '-200')
  assert.equal(clampSplitInput('50', 1000, ['1000']), '0')
})

// ─── Baris menurut peran (sql/101) ───────────────────────────────────────────────────────────────────────────────
import { mergeLinesView, originalOf, CHECKER_ONLY_KEYS } from './CostAgentLinesView'

const hl = (id: number, over: Record<string, unknown> = {}): any => ({
  id, invoice_id: 7, line_no: id, description_raw: `L${id}`, amount: 100, cost_item_code: `C${id}`, cost_item_name: `Item ${id}`, history: [{ history_id: id }],
  is_validated: true, checker_remark: 'secret', maker_amount: 999, origin_line_id: null, ...over,
})
const hist = (lines: any[]): any => ({ invoice: { id: 7 }, lines, approvals: [], tax_checks: [], payments: [], timeline: [] })

test('view maker (approver saja): baris split checker dibuang, nilai asli maker dipakai, kolom checker hilang', () => {
  const h = hist([hl(1, { description_raw: 'edited', amount: 60 }), hl(2, { origin_line_id: 1, amount: 40 })])
  const r: any = { invoice_id: 7, view: 'maker', lines: [{ id: 1, invoice_id: 7, line_no: 1, description_raw: 'original', amount: 100 }] }
  const m = mergeLinesView(h, r)!
  assert.equal(m.lines_view, 'maker')
  assert.equal(m.lines.length, 1)
  assert.equal(m.lines[0].description_raw, 'original'); assert.equal(m.lines[0].amount, 100)
  assert.equal(m.lines[0].cost_item_name, 'Item 1') // kolom tambahan dari RPC history tetap
  assert.deepEqual(m.lines[0].history, [{ history_id: 1 }])
  for (const k of CHECKER_ONLY_KEYS) assert.equal(k in m.lines[0], false, `kolom ${k} bocor`)
})

test('view full: semua baris (termasuk split) tampil dengan kolom checker dari RPC baris', () => {
  const h = hist([hl(1), hl(2, { origin_line_id: 1 })])
  const r: any = { invoice_id: 7, view: 'full', lines: [{ id: 1, amount: 60, is_validated: true, checker_remark: 'ok' }, { id: 2, amount: 40, origin_line_id: 1, is_validated: false }] }
  const m = mergeLinesView(h, r)!
  assert.equal(m.lines_view, 'full'); assert.equal(m.lines.length, 2)
  assert.equal(m.lines[0].amount, 60); assert.equal(m.lines[0].checker_remark, 'ok'); assert.equal(m.lines[1].origin_line_id, 1)
})

test('mergeLinesView: history kosong -> null; tanpa respons peran dipakai apa adanya sebagai full', () => {
  assert.equal(mergeLinesView(null, { invoice_id: 1, view: 'full', lines: [] }), null)
  assert.equal(mergeLinesView(hist([hl(1)]), undefined)!.lines.length, 1)
})

test('"Original": hanya bila teks / nominal berbeda dari versi maker', () => {
  assert.equal(originalOf({ description_raw: 'A', amount: 5, maker_description: null, maker_amount: null }), null)
  assert.equal(originalOf({ description_raw: 'A', amount: 5, maker_description: 'A', maker_amount: 5 }), null)
  assert.deepEqual(originalOf({ description_raw: 'B', amount: 5, maker_description: 'A', maker_amount: 5 }), { description: 'A', amount: null })
  assert.deepEqual(originalOf({ description_raw: 'A', amount: 4, maker_description: null, maker_amount: 5 }), { description: null, amount: 5 })
})

// ─── Gerbang dokumen untuk non-Maker ──────────────────────────────────────────────────────────────────────────────
import { isAccessDeniedError } from './CostAgentRolesLogic'
test('Akses ditolak karena peran dikenali (jatuh ke baca gerbang); error lain tidak', () => {
  assert.equal(isAccessDeniedError(new Error('Akses ditolak: butuh role maker (cost_agent_maker)')), true)
  assert.equal(isAccessDeniedError({ message: '  Akses ditolak: butuh role checker (cost_agent_checker)' }), true)
  assert.equal(isAccessDeniedError(new Error('DOC_GATE: dokumen belum lengkap')), false)
  assert.equal(isAccessDeniedError(new Error('SoD: the person who submitted this invoice cannot validate it')), false)
  assert.equal(isAccessDeniedError(null), false)
})
