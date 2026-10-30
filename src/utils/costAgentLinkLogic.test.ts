// Tautan manual baris <-> dokumen dan penanda "Amount includes VAT" (SQL 108 & 109, 2026-10-30): lencana manual, status tak dikenal, pilihan item per sisi,
// alasan wajib, kontrol tiga keadaan, hak TAMPIL tombol per peran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MANUAL_LABEL, needsCheck, sideState } from './CostAgentDocLines'
import { coveredReasonText } from './CostAgentDocCards'
import {
  MAX_LINK_ITEMS, canEditLineEvidence, canLinkLine, defaultLinkSide, initialSelection, itemsOfSide, linkFormError, manualTipLines, nearGap, needsVatDecision,
  toggleItem, unlinkFormError, vatChoiceOf, vatChoiceToBool, vatFormError, vatPctText, type LinkCandidateItem,
} from './CostAgentLinkLogic'
import type { MyRoles } from './CostAgentRolesLogic'

const my = (effective: MyRoles['effective']): MyRoles => ({ email: 'a@b.co', assigned: [], roles_strict: true, effective })
const manual = { ids: [11, 12], by: 'maker@x.co', at: '2026-10-30T08:00:00Z', reason: 'Port note total', incl: true }

test('status manual = lencana "Linked manually" netral/biru (bukan merah), selisih tampil bila tidak 0', () => {
  const s = sideState({ status: 'manual', diff: 500, note: 'Linked manually by maker@x.co', manual }, 'attachment')
  assert.equal(s.label, MANUAL_LABEL)
  assert.equal(s.tone, 'blue')
  assert.equal(s.neutral, false)
  assert.equal(s.sub, 'Diff (+500)')
  assert.match(s.tip ?? '', /maker@x\.co/)
  assert.match(s.tip ?? '', /Port note total/)
  assert.match(s.tip ?? '', /item \+ VAT/)
  assert.equal(sideState({ status: 'manual', diff: 0, manual: { ...manual, incl: false } }, 'tax').sub, undefined)
  assert.equal(sideState({ status: 'manual', diff: -1250, manual }, 'tax').sub, 'Diff (−1.250)')
})

test('baris manual tidak dihitung "perlu dicek" (tidak merah / kuning)', () => {
  assert.equal(needsCheck({ attachment: { status: 'manual', diff: 500 }, tax: { status: 'manual', diff: 0 } }), false)
  assert.equal(needsCheck({ attachment: { status: 'manual', diff: 0 }, tax: { status: 'diff', diff: 10 } }), true)
})

test('status tidak dikenal TIDAK error: teks mentah ditampilkan; status dikenal tanpa perbandingan tetap n/a', () => {
  const s = sideState({ status: 'brand_new_status', diff: null }, 'attachment')
  assert.equal(s.label, 'brand_new_status')
  assert.equal(s.tone, 'grey')
  assert.equal(s.neutral, true)
  assert.equal(sideState({ status: 'pending', diff: null }, 'tax').label, 'n/a')
  assert.equal(sideState({ status: 'not_required', diff: null }, 'tax').label, 'n/a')
  assert.equal(sideState({ status: '', diff: null }, 'tax').label, 'n/a')
  assert.equal(sideState(null, 'tax').label, 'n/a')
})

test('alasan baru "components_of_line" berlabel; alasan lain tak dikenal tetap kosong', () => {
  assert.equal(coveredReasonText('components_of_line'), 'Components of an invoice line')
  assert.equal(coveredReasonText('nothing_known'), '')
})

test('tombol Link document hanya pada diff / none / not_in_fp / manual', () => {
  const l = (a: string | null, t: string | null) => ({ attachment: a ? { status: a, matched_amount: null, diff: null, refs: null } : null, tax: t ? { status: t, matched_amount: null, diff: null, refs: null } : null })
  assert.equal(canLinkLine(l('diff', 'match')), true)
  assert.equal(canLinkLine(l('match', 'not_in_fp')), true)
  assert.equal(canLinkLine(l('none', null)), true)
  assert.equal(canLinkLine(l('manual', 'match')), true)
  assert.equal(canLinkLine(l('match', 'match_gross')), false)
  assert.equal(canLinkLine(l('not_required', 'pending')), false)
  assert.equal(defaultLinkSide(l('match', 'not_in_fp')), 'tax')
  assert.equal(defaultLinkSide(l('diff', 'not_in_fp')), 'attachment')
  assert.equal(defaultLinkSide(l('match', 'match')), 'attachment')
})

test('hak tampil per peran: maker saat verification, checker saat validasi pending, AP Note; Approver tidak', () => {
  const ev = (status: string, validationPending: boolean, roles: MyRoles | null) => canEditLineEvidence({ status, validationPending, roles })
  assert.equal(ev('verification', false, my({ maker: true })), true)
  assert.equal(ev('rejected', false, my({ maker: true })), true)
  assert.equal(ev('waiting_approval', true, my({ maker: true })), false)
  assert.equal(ev('waiting_approval', true, my({ checker: true })), true)
  assert.equal(ev('waiting_approval', false, my({ checker: true })), false)
  assert.equal(ev('verification', false, my({ checker: true })), false)
  assert.equal(ev('waiting_approval', true, my({ approver: true })), false)
  assert.equal(ev('verification', false, my({ approver: true })), false)
  assert.equal(ev('waiting_approval', false, my({ apnote: true })), true)
  assert.equal(ev('approved', false, my({ apnote: true })), false)
  assert.equal(ev('paid', false, my({ maker: true, checker: true, apnote: true })), false)
  assert.equal(ev('verification', false, null), false)
})

test('pilihan item: satu sisi per simpan, maksimal 20, memilih sisi lain memulai ulang', () => {
  let sel = { side: 'attachment' as const, ids: [] as number[] }
  sel = toggleItem(sel, 'attachment', 1) as typeof sel
  sel = toggleItem(sel, 'attachment', 2) as typeof sel
  assert.deepEqual(sel.ids, [1, 2])
  assert.deepEqual(toggleItem(sel, 'attachment', 1).ids, [2]) // dilepas
  assert.deepEqual(toggleItem(sel, 'tax', 9), { side: 'tax', ids: [9] }) // sisi lain = pilihan baru
  let full = { side: 'attachment' as const, ids: [] as number[] }
  for (let i = 1; i <= MAX_LINK_ITEMS + 5; i++) full = toggleItem(full, 'attachment', i) as typeof full
  assert.equal(full.ids.length, MAX_LINK_ITEMS)
  assert.deepEqual(initialSelection({ status: 'manual', matched_amount: null, diff: 0, refs: null, manual }, 'tax'), { side: 'tax', ids: [11, 12] })
  assert.deepEqual(initialSelection(null, 'attachment'), { side: 'attachment', ids: [] })
})

test('kandidat dibagi per sisi TANPA mengubah urutan server', () => {
  const it = (item_id: number, side: string): LinkCandidateItem => ({ item_id, part_id: 1, side, doc_type: null, doc_no: null, doc_date: null, description: null, group_name: null, kind: 'item', amount: 1, gap: 0, gap_with_vat: 0, similarity: 0, linked_manually: false, matched_line_no: null })
  const items = [it(5, 'attachment'), it(3, 'tax'), it(9, 'attachment'), it(1, 'tax'), it(2, 'attachment')]
  assert.deepEqual(itemsOfSide(items, 'attachment').map(i => i.item_id), [5, 9, 2])
  assert.deepEqual(itemsOfSide(items, 'tax').map(i => i.item_id), [3, 1])
  assert.deepEqual(itemsOfSide(null, 'tax'), [])
})

test('alasan wajib di UI: simpan tautan, lepas tautan, penanda VAT', () => {
  assert.equal(linkFormError({ side: 'attachment', ids: [] }, 'x'), 'Select at least one document item.')
  assert.equal(linkFormError({ side: 'attachment', ids: [1] }, '   '), 'A reason is required.')
  assert.equal(linkFormError({ side: 'attachment', ids: [1] }, 'sesuai nota'), null)
  assert.equal(linkFormError({ side: 'tax', ids: Array.from({ length: MAX_LINK_ITEMS + 1 }, (_, i) => i) }, 'x'), `Select at most ${MAX_LINK_ITEMS} items.`)
  assert.equal(unlinkFormError(''), 'A reason is required.')
  assert.equal(unlinkFormError(' ok '), null)
  assert.equal(vatFormError('yes', null, ''), 'A reason is required.')
  assert.equal(vatFormError('yes', null, 'sudah termasuk PPN'), null)
})

test('"Amount includes VAT": tiga keadaan Not decided / Yes / No', () => {
  assert.deepEqual([null, true, false, undefined].map(vatChoiceOf), ['undecided', 'yes', 'no', 'undecided'])
  assert.deepEqual((['undecided', 'yes', 'no'] as const).map(vatChoiceToBool), [null, true, false])
  assert.equal(vatFormError('undecided', null, 'x'), 'Choose Yes or No.') // RPC tidak menerima null
  assert.equal(vatFormError('yes', true, 'x'), 'Nothing changed.')
  assert.equal(vatFormError('no', true, 'ganti'), null)
})

test('peringatan kuning hanya bila hint true DAN penanda belum diputuskan', () => {
  assert.equal(needsVatDecision(true, null), true)
  assert.equal(needsVatDecision(true, undefined), true)
  assert.equal(needsVatDecision(true, true), false)
  assert.equal(needsVatDecision(true, false), false)
  assert.equal(needsVatDecision(false, null), false)
  assert.equal(needsVatDecision(undefined, null), false)
})

test('gap incl. VAT kecil bertanda hijau; tarif ditampilkan dari vat_rate_used', () => {
  assert.equal(nearGap(0), true)
  assert.equal(nearGap(-5), true)
  assert.equal(nearGap(5), true)
  assert.equal(nearGap(6), false)
  assert.equal(nearGap(null), false)
  assert.equal(vatPctText(0.11), '11%')
  assert.equal(vatPctText(0.125), '12.5%')
  assert.equal(vatPctText(null), '')
})

test('tooltip tautan manual: pelaku, waktu, alasan, "item + VAT" hanya bila incl', () => {
  const t = manualTipLines(manual, s => `@${s.slice(0, 10)}`)
  assert.equal(t[0], 'Linked by maker@x.co · @2026-10-30')
  assert.equal(t[1], 'Reason: Port note total')
  assert.equal(t[2], 'Compared as item + VAT')
  assert.equal(manualTipLines({ ...manual, incl: false }).length, 2)
  assert.deepEqual(manualTipLines(null), [])
})
