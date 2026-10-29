// Tes logika murni Tahap 3c (peran per user, kode pemblokir gerbang, pill status, pengelompokan Notes). Jalankan: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupNotes, gatePill, noteRowCount, noteRowText, taxTotalsTitle, visibleBlockers } from './CostAgentGateView'
import {
  checksFromRoles, coverageItems, coverageText, gateCodesToSave, isValidEmail, myRoleChips, otherGateCodes, rolesFromChecks, sameChecks, toggleGateCode,
} from './CostAgentRolesLogic'
import type { GateItem } from './CostAgentGate'

const w = (code: string, extra: Partial<GateItem> = {}): GateItem => ({ code, label: `label ${code}`, detail: `detail ${code}`, ...extra })

test('Notes: 6 temuan line_not_in_fp menjadi SATU baris dengan nomor baris', () => {
  const items = [6, 7, 10, 11, 12, 13].map(n => w('line_not_in_fp', { line_no: n, label: `Line ${n}: not found in the tax invoice` }))
  const groups = groupNotes(items)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].key, 'tax')
  assert.equal(groups[0].rows.length, 1)
  const row = groups[0].rows[0]
  assert.equal(row.title, '6 lines are not on the tax invoice')
  assert.deepEqual(row.lines, [6, 7, 10, 11, 12, 13])
  assert.equal(row.items.length, 6)
  assert.equal(noteRowText(row), '6 lines are not on the tax invoice (lines 6, 7, 10, 11, 12, 13)')
})

test('Notes: satu baris saja memakai bentuk tunggal; nomor baris tidak berulang', () => {
  const g = groupNotes([w('line_not_in_fp', { line_no: 6 })])
  assert.equal(g[0].rows[0].title, '1 line is not on the tax invoice')
  assert.equal(noteRowText(g[0].rows[0]), '1 line is not on the tax invoice (line 6)')
})

test('Notes: tax_total_diff digabung, tax_line_diff per baris, kelompok & urutan Tax -> Dates -> Other', () => {
  const groups = groupNotes([
    w('orphan_attachment', { label: 'The attachment has items that are not on the invoice' }),
    w('date_out_of_period', { label: 'port call is outside the invoice period' }),
    w('voyage_not_linked'),
    w('tax_total_diff', { label: 'Tax totals differ: VAT', detail: 'Invoice 100 vs document 116500 (difference -16500)' }),
    w('tax_total_diff', { label: 'Tax totals differ: Selling price', detail: 'Invoice 1 vs document 2 (difference -2182800)' }),
    w('tax_line_diff', { line_no: 3 }), w('tax_line_diff', { line_no: 4 }),
    w('fp_missing'), w('tax_rate_diff'), w('header_diff'),
  ])
  assert.deepEqual(groups.map(g => g.key), ['tax', 'dates', 'other'])
  const tax = groups[0].rows
  assert.equal(tax[0].items[0].code, 'fp_missing')
  assert.equal(tax[1].title, 'Tax totals differ: VAT −16,500 · Selling price −2,182,800')
  assert.equal(tax.filter(r => r.items[0].code === 'tax_line_diff').length, 2)
  assert.equal(groups[1].rows.length, 2)
  assert.deepEqual(groups[2].rows.map(r => r.items[0].code), ['orphan_attachment', 'header_diff'])
  assert.equal(noteRowCount(groups), 9)
  assert.ok(groups[0].hint?.startsWith('Notes do not block submit'))
})

test('Notes: tanpa warnings -> tidak ada kelompok; taxTotalsTitle tanpa angka selisih tetap aman', () => {
  assert.deepEqual(groupNotes([]), [])
  assert.deepEqual(groupNotes(null), [])
  assert.equal(taxTotalsTitle([w('tax_total_diff', { label: 'Tax totals differ: VAT', detail: 'something else' })]), 'Tax totals differ: VAT')
})

test('Pill status HANYA dari blockers (warnings tidak membuatnya merah)', () => {
  assert.deepEqual(gatePill({ enabled: true, blockers: [] }), { tone: 'green', text: 'Ready to submit', blockers: 0 })
  assert.deepEqual(gatePill({ enabled: true, blockers: [w('attachment_diff')] }), { tone: 'red', text: 'Fix 1 item(s) before submit', blockers: 1 })
  assert.equal(gatePill({ enabled: true, blockers: [w('a'), w('b'), w('c')] })?.text, 'Fix 3 item(s) before submit')
  assert.equal(gatePill({ enabled: false, blockers: [] }), null)
  assert.equal(gatePill(null), null)
  // objek gerbang lengkap dengan banyak warnings -> tetap hijau
  const full = { enabled: true, complete: true, blockers: [] as GateItem[], warnings: [w('fp_missing'), w('date_warn')] }
  assert.equal(gatePill(full)?.tone, 'green')
})

test('Must fix: 5 teratas lalu "Show all"', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7]
  assert.deepEqual(visibleBlockers(xs, false), [1, 2, 3, 4, 5])
  assert.deepEqual(visibleBlockers(xs, true), xs)
})

test('gate_block_codes: centang -> array yang disimpan (urutan daftar, kode terkunci selalu ikut, tanpa duplikat)', () => {
  const def = ['not_analysed', 'attachment_missing', 'attachment_diff', 'attachment_line_missing']
  assert.deepEqual(gateCodesToSave(def), def)
  assert.deepEqual(toggleGateCode(def, 'fp_missing', true), [...def, 'fp_missing'])
  assert.deepEqual(toggleGateCode([...def, 'fp_missing'], 'fp_missing', false), def)
  assert.deepEqual(toggleGateCode(def, 'header_diff', true).slice(-1), ['header_diff'])
  assert.deepEqual(toggleGateCode(['attachment_diff'], 'tax_line_diff', true), ['not_analysed', 'attachment_diff', 'tax_line_diff'])
  assert.ok(toggleGateCode(def, 'not_analysed', false).includes('not_analysed'), 'not_analysed terkunci')
  assert.deepEqual(gateCodesToSave(['FP_MISSING', 'fp_missing', ' tax_rate_diff ']), ['not_analysed', 'fp_missing', 'tax_rate_diff'])
  assert.deepEqual(toggleGateCode(['not_analysed', 'zzz_new'], 'attachment_diff', true), ['not_analysed', 'attachment_diff', 'zzz_new'])
})

test('gate_block_codes: kode di luar daftar tampil sebagai "Other" dan tetap bisa dicabut', () => {
  assert.deepEqual(otherGateCodes(['not_analysed', 'zzz_new', 'attachment_diff']), ['zzz_new'])
  assert.deepEqual(toggleGateCode(['not_analysed', 'zzz_new'], 'zzz_new', false), ['not_analysed'])
  assert.deepEqual(otherGateCodes('bukan array'), [])
})

test('User roles: checkbox -> p_roles (urutan tetap; kosong = hapus) dan sebaliknya', () => {
  assert.deepEqual(rolesFromChecks({ maker: true, treasury: true, checker: false }), ['maker', 'treasury'])
  assert.deepEqual(rolesFromChecks({ apnote: true, approver: true, maker: true }), ['maker', 'approver', 'apnote'])
  assert.deepEqual(rolesFromChecks({}), [])
  const c = checksFromRoles(['checker', 'APNOTE', 'unknown'])
  assert.deepEqual(rolesFromChecks(c), ['checker', 'apnote'])
  assert.equal(sameChecks(c, { checker: true, apnote: true }), true)
  assert.equal(sameChecks(c, { checker: true }), false)
  assert.deepEqual(rolesFromChecks(checksFromRoles(null)), [])
})

test('User roles: strip coverage + peringatan peran tanpa user', () => {
  const items = coverageItems({ maker: 2, checker: 1, approver: 0, apnote: 1, treasury: 0 })
  assert.equal(coverageText(items), 'Maker 2 · Checker 1 · Approver 0 · AP Note 1 · Treasury 0')
  assert.deepEqual(items.filter(i => i.warn).map(i => i.help), ['No one can act as Approver yet', 'No one can act as Treasury yet'])
  assert.equal(coverageItems(undefined).every(i => i.warn), true)
})

test('Chip peran saya: hanya peran efektif; kosong + roles_strict -> View only', () => {
  assert.deepEqual(myRoleChips({ email: 'a@b.co', assigned: ['maker'], roles_strict: true, effective: { maker: true, checker: false } }), { chips: ['Maker'], viewOnly: false })
  assert.deepEqual(myRoleChips({ email: 'a@b.co', assigned: [], roles_strict: true, effective: {} }), { chips: [], viewOnly: true })
  assert.deepEqual(myRoleChips({ email: 'a@b.co', assigned: [], roles_strict: false, effective: {} }), { chips: [], viewOnly: false })
  assert.deepEqual(myRoleChips(null), { chips: [], viewOnly: false })
})

test('Email: validasi format ringan sebelum dikirim', () => {
  assert.equal(isValidEmail('rina@waruna-group.co.id'), true)
  assert.equal(isValidEmail(' rina@x.co '), true)
  assert.equal(isValidEmail('rina@x'), false)
  assert.equal(isValidEmail('rina x@y.co'), false)
})

// ─── Tahap 3d ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { countToCheck, defaultOnlyCheck, hasDiff, needsCheck, sideState, NA_ATTACHMENT_TIP, NA_TAX_TIP } from './CostAgentDocLines'
import { submitBlockReason } from './CostAgentGateView'

const side = (status: string, diff: number | null = null) => ({ status, diff })

test('Sel per baris: Missing menjadi n/a netral bila dokumen tidak diharapkan (expect)', () => {
  const att = sideState(side('none'), 'attachment', { attachment: false, tax: false })
  assert.deepEqual([att.label, att.tone, att.neutral, att.tip], ['n/a', 'grey', true, NA_ATTACHMENT_TIP])
  const noAtt = sideState(side('no_doc'), 'attachment', { attachment: false })
  assert.equal(noAtt.neutral, true)
  const tax = sideState(side('not_in_fp'), 'tax', { attachment: true, tax: false })
  assert.deepEqual([tax.label, tax.neutral, tax.tip], ['n/a', true, NA_TAX_TIP])
  assert.equal(sideState(side('none'), 'tax', { tax: false }).neutral, true)
})

test('Sel per baris: expect true / tidak ada -> tetap Missing kuning; Diff tetap merah walau expect false; OK hijau', () => {
  assert.deepEqual([sideState(side('not_in_fp'), 'tax', { tax: true }).label, sideState(side('not_in_fp'), 'tax', { tax: true }).tone], ['Missing', 'amber'])
  assert.equal(sideState(side('none'), 'attachment', { attachment: true }).label, 'Missing')
  assert.equal(sideState(side('not_in_fp'), 'tax', undefined).label, 'Missing') // data lama tanpa expect = perilaku lama
  const diff = sideState(side('diff', -2000), 'tax', { tax: false })
  assert.deepEqual([diff.label, diff.tone, diff.neutral], ['Diff (−2.000)', 'red', false])
  assert.equal(sideState(side('match_group'), 'attachment', { attachment: false }).label, 'OK')
  assert.equal(sideState(side('pending'), 'tax', { tax: true }).neutral, true)
  assert.equal(sideState(null, 'tax', { tax: true }).neutral, true)
})

test('"N to check": baris yang hanya netral tidak dihitung; filter bawaan aktif hanya bila ada yang perlu dicek', () => {
  const line = (a: string | null, t: string | null, expect?: { attachment: boolean; tax: boolean }) => ({ attachment: a ? side(a) : null, tax: t ? side(t) : null, expect })
  const lines = [
    line('match', 'match', { attachment: true, tax: true }),
    line('match', 'not_in_fp', { attachment: true, tax: false }), // Harbour Dues: non-PPN -> netral
    line('none', 'match', { attachment: false, tax: true }),      // Materai: lampiran tidak wajib -> netral
    line('match', 'not_in_fp', { attachment: true, tax: true }),  // kena PPN tapi tidak ada di FP -> Missing
    line('diff', 'match', { attachment: true, tax: true }),       // Diff
  ]
  assert.deepEqual(lines.map(needsCheck), [false, false, false, true, true])
  assert.equal(countToCheck(lines), 2)
  assert.deepEqual(lines.map(hasDiff), [false, false, false, false, true])
  assert.equal(defaultOnlyCheck(lines), true)
  assert.equal(defaultOnlyCheck(lines.slice(0, 3)), false)
  assert.equal(countToCheck([]), 0)
})

test('Alasan Submit nonaktif: SATU alasan, yang pertama berlaku', () => {
  assert.equal(submitBlockReason({}), null)
  assert.equal(submitBlockReason({ unverified: 14 }), 'Verify 14 lines first')
  assert.equal(submitBlockReason({ unverified: 1 }), 'Verify 1 line first')
  assert.equal(submitBlockReason({ unmapped: 1, unverified: 14 }), '1 line has no cost item')
  assert.equal(submitBlockReason({ unmapped: 3 }), '3 lines have no cost item')
  assert.equal(submitBlockReason({ companyMissing: true, unmapped: 1 }), 'Choose the company first')
  assert.equal(submitBlockReason({ blockedReason: 'SoD: you cannot submit your own validation', companyMissing: true, unverified: 2 }), 'SoD: you cannot submit your own validation')
  assert.equal(submitBlockReason({ gateFirst: 'Line 5: amount differs', routeBlock: 'No approval rule matches' }), 'Fix first: Line 5: amount differs')
  assert.equal(submitBlockReason({ routeBlock: 'No approval rule matches (company WNS)' }), 'No approval rule matches (company WNS)')
  assert.equal(submitBlockReason({ unverified: 0, unmapped: 0, gateFirst: null }), null)
})

import { coverageItems as cov3d, noOneSentence } from './CostAgentRolesLogic'
test('Peran 0 user: SATU kalimat berisi hanya peran yang kosong', () => {
  assert.equal(noOneSentence(cov3d({ maker: 0, checker: 0, approver: 0, apnote: 0, treasury: 0 })), 'No one can act as Maker, Checker, Approver, AP Note, Treasury yet.')
  assert.equal(noOneSentence(cov3d({ maker: 2, checker: 1, approver: 0, apnote: 1, treasury: 0 })), 'No one can act as Approver, Treasury yet.')
  assert.equal(noOneSentence(cov3d({ maker: 1, checker: 1, approver: 1, apnote: 1, treasury: 1 })), null)
})
