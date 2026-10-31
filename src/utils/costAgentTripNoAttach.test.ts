// Update 112 / 112b (2026-10-31): kartu "Trip dates & vessel", "No attachment for this vendor", kode gerbang trip_*.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIRMED_NONE_LABEL, hasDiff, needsCheck, sideState } from './CostAgentDocLines'
import {
  TRIP_AGREE_TEXT, TRIP_NOT_LINKED_NOTE, TRIP_PAGE_APPROX_TIP, gapOutOfTolerance, gapText, orderTripFields, tripFieldChip, tripFieldLabel, tripFileOrder, tripNeedsAttention, tripNotFoundLabel,
  tripPage, tripReferenceCaption, tripReferenceValue, tripHasHidden, tripRowIcon, tripRowOrder, tripRows, tripSourceChip, tripSourceName, tripSummaryPills, tripToleranceText, tripValueText, tripVisible, tripVisibleCount,
} from './CostAgentTripLogic'
import {
  NEEDS_VENDOR_ITEM_HINT, canShowConfirmNone, confirmBody, confirmToast, confirmedRuleId, needsVendorItemHint, noteError, reasonError,
} from './CostAgentNoAttachLogic'
import { KNOWN_GATE_CODES, gateCodesToSave, otherGateCodes } from './CostAgentRolesLogic'
import { groupNotes } from './CostAgentGateView'

const side = (o: Record<string, unknown>) => ({ status: 'none', matched_amount: null, diff: null, refs: null, ...o }) as any
const src = (o: Record<string, unknown>) => ({ kind: 'document', label: 'Port note', doc_type: null, doc_no: null, file_name: null, page: null, page_exact: false, page_from: null, page_to: null, location: null, value: 'x', status: 'ok', gap_days: null, manual: false, ...o }) as any

test('pil ringkasan trip: hanya angka > 0 (tunggal / jamak), semua nol = kosong (pil hijau "All sources agree")', () => {
  assert.deepEqual(tripSummaryPills({ diff: 2, warn: 1, missing: 1 }), [{ text: '2 differences', tone: 'red' }, { text: '1 warning', tone: 'amber' }, { text: '1 not found', tone: 'grey' }])
  assert.deepEqual(tripSummaryPills({ diff: 1, warn: 0, missing: 0 }), [{ text: '1 difference', tone: 'red' }])
  assert.deepEqual(tripSummaryPills({ diff: 0, warn: 3, missing: 0 }), [{ text: '3 warnings', tone: 'amber' }])
  assert.deepEqual(tripSummaryPills({ diff: 0, warn: 0, missing: 0 }), [])
  assert.deepEqual(tripSummaryPills(null), [])
  assert.equal(TRIP_AGREE_TEXT, 'All sources agree')
  assert.equal(tripToleranceText(1), 'Tolerance ±1 day')
  assert.equal(tripToleranceText(2), 'Tolerance ±2 days')
  assert.equal(tripNeedsAttention({ tolerance_days: 1, voyage_linked: true, call_id: 1, fields: [], summary: { diff: 0, warn: 0, missing: 2 } }), false)
  assert.equal(tripNeedsAttention({ tolerance_days: 1, voyage_linked: true, call_id: 1, fields: [], summary: { diff: 0, warn: 1, missing: 0 } }), true)
})

test('chip status bidang: All match hijau, N different merah, Dates spread N days amber, Single source abu, Not found abu muda', () => {
  assert.deepEqual(tripFieldChip({ status: 'ok', spread_days: 0 }), { label: 'All match', tone: 'green' })
  assert.deepEqual(tripFieldChip({ status: 'diff', spread_days: null, sources: [{ status: 'diff' }, { status: 'ok' }, { status: 'diff' }] }), { label: '2 different', tone: 'red' })
  assert.equal(tripFieldChip({ status: 'diff', spread_days: null }).label, 'Different')
  assert.deepEqual(tripFieldChip({ status: 'warn', spread_days: 3 }), { label: 'Dates spread 3 days', tone: 'amber' })
  assert.equal(tripFieldChip({ status: 'warn', spread_days: 1 }).label, 'Dates spread 1 day')
  assert.deepEqual(tripFieldChip({ status: 'single', spread_days: null }), { label: 'Single source', tone: 'grey' })
  assert.equal(tripFieldChip({ status: 'missing', spread_days: null }).label, 'Not found')
  assert.equal(tripFieldChip({ status: 'missing', spread_days: null }).faint, true)
  assert.deepEqual([tripSourceChip('diff').label, tripSourceChip('diff').tone], ['Different', 'red'])
  assert.equal(tripSourceChip('whatever').label, 'whatever')
})

test('selisih hari ("+1 d" / "−2 d", merah hanya di luar toleransi), tanggal DD Mon YYYY, kosong = "—", nama kapal apa adanya', () => {
  assert.equal(gapText(1), '+1 d')
  assert.equal(gapText(-2), '−2 d')
  assert.equal(gapText(0), null)
  assert.equal(gapText(null), null)
  assert.equal(gapOutOfTolerance(1, 1), false)
  assert.equal(gapOutOfTolerance(-2, 1), true)
  assert.equal(gapOutOfTolerance(null, 1), false)
  assert.equal(tripValueText('arrival', '2026-10-05'), '05 Oct 2026')
  assert.equal(tripValueText('departure', '2026-01-31T10:00:00Z'), '31 Jan 2026')
  assert.equal(tripValueText('arrival', null), '—')
  assert.equal(tripValueText('vessel', 'MV. SAMPLE 1'), 'MV. SAMPLE 1')
})

test('acuan: nilai besar + "Reference: <label>" ; tanpa acuan = "—" + "No reference available"', () => {
  const f = { key: 'arrival', reference: { label: 'Voyage report', value: '2026-10-13' } }
  assert.equal(tripReferenceValue(f), '13 Oct 2026')
  assert.equal(tripReferenceCaption(f), 'Reference: Voyage report')
  assert.equal(tripReferenceValue({ key: 'arrival', reference: null }), '—')
  assert.equal(tripReferenceCaption({ reference: null }), 'No reference available')
  assert.equal(tripReferenceCaption({ reference: { label: null, value: null } }), 'No reference available')
  assert.deepEqual(tripSourceName({ label: 'Port note', doc_no: 'PN-1' }), { name: 'Port note', sub: 'PN-1' })
  assert.equal(tripFieldLabel({ key: 'vessel', label: 'x' }), 'Vessel name')
  assert.equal(tripFieldLabel({ key: 'other', label: 'Other' }), 'Other')
  assert.equal(TRIP_NOT_LINKED_NOTE, 'No voyage report is linked, so the first available source is the reference.')
})

test('halaman sumber disusun dari angka: "p. 5", rentang "pp. 4–5", kosong = tidak ada pil; tanpa kata "page range" dan tanpa nama file di teks', () => {
  const exact = tripPage(src({ page: 5, page_exact: true, file_name: 'a.pdf' }))!
  assert.equal(exact.text, 'p. 5')
  assert.equal(exact.exact, true)
  assert.equal(exact.tip, 'a.pdf — page 5\nRead from page 5')
  const one = tripPage(src({ page_from: 3, page_to: 3 }))!
  assert.equal(one.text, 'p. 3')
  assert.equal(one.exact, false)
  assert.equal(one.tip, 'Page 3\n' + TRIP_PAGE_APPROX_TIP)
  const range = tripPage(src({ page_from: 4, page_to: 5, file_name: 'a.pdf' }))!
  assert.equal(range.text, 'pp. 4–5')
  assert.equal(range.exact, false)
  assert.match(range.tip, /^a\.pdf — pages 4–5/)
  assert.match(range.tip, /Run "Analyse again" to get the exact page\./)
  assert.equal(tripPage(src({})), null)
  assert.equal(tripPage(src({ location: 'Page 3 of x.pdf (page range)' })), null) // `location` TIDAK dipakai
  assert.doesNotMatch(exact.text + range.text + one.text, /range|\.pdf/)
})

test('awalan file "F1 · p. 5" hanya bila kartu memuat lebih dari satu nama file; urutan = kemunculan pertama', () => {
  const fields = [{ sources: [src({ file_name: 'a.pdf', page: 1, page_exact: true }), src({ file_name: 'b.pdf', page: 5, page_exact: true })] }, { sources: [src({ file_name: 'a.pdf', page: 2, page_exact: true })] }]
  const order = tripFileOrder(fields)
  assert.deepEqual([...order.entries()], [['a.pdf', 1], ['b.pdf', 2]])
  assert.equal(tripPage(fields[0].sources[1], order)!.text, 'F2 · p. 5')
  assert.equal(tripPage(fields[1].sources[0], order)!.text, 'F1 · p. 2')
  assert.match(tripPage(fields[0].sources[1], order)!.tip, /^b\.pdf — page 5/)
  const single = tripFileOrder([{ sources: [src({ file_name: 'a.pdf', page: 1, page_exact: true })] }])
  assert.equal(tripPage(src({ file_name: 'a.pdf', page: 1, page_exact: true }), single)!.text, 'p. 1')
})

test('urutan baris SAMA di semua kolom (Voyage report, Invoice, lalu dokumen); acuan tidak dipindah ke atas', () => {
  const vessel = { status: 'ok', sources: [src({ kind: 'voyage', label: 'Voyage report', status: 'ref' }), src({ kind: 'invoice', label: 'Invoice', doc_no: 'I-1' }), src({ label: 'Port note', doc_no: 'P1' }), src({ label: 'Pranota', doc_no: 'P1' })] }
  const departure = { status: 'ok', sources: [src({ label: 'Invoice document', doc_no: 'I-1', status: 'ref' }), src({ kind: 'invoice', label: 'Invoice', doc_no: 'I-1', status: 'missing', value: null }), src({ kind: 'voyage', label: 'Voyage report', status: 'not_linked', value: null }), src({ label: 'Port note', doc_no: 'P1' })] }
  const order = tripRowOrder([vessel, departure])
  assert.deepEqual(tripRows(vessel, order).map(x => x.label), ['Voyage report', 'Invoice', 'Port note', 'Pranota'])
  assert.deepEqual(tripRows(departure, order).map(x => x.label), ['Voyage report', 'Invoice', 'Invoice document', 'Port note'])
  assert.equal(tripNotFoundLabel(tripRows(departure, order)[0]), 'Not linked')
  assert.equal(tripNotFoundLabel(tripRows(departure, order)[1]), 'Not found')
  assert.equal(tripNotFoundLabel(tripRows(departure, order)[2]), null)
})

test('bawaan HANYA baris not found dan tidak cocok; yang cocok disembunyikan & dihitung; "show all" menampilkan semuanya', () => {
  const f = { status: 'diff', sources: [src({ kind: 'voyage', label: 'Voyage report', status: 'not_linked', value: null }), src({ kind: 'invoice', label: 'Invoice', status: 'missing', value: null }), src({ label: 'Doc A', status: 'ref' }), src({ label: 'Doc B', status: 'ok', gap_days: 0 }), src({ label: 'Doc C', status: 'diff', gap_days: 3 })] }
  const v = tripVisible(f, null, false)
  assert.deepEqual(v.shown.map(x => x.label), ['Voyage report', 'Invoice', 'Doc C'])
  assert.equal(v.hidden, 2)
  assert.equal(tripVisible(f, null, true).shown.length, 5)
  assert.equal(tripVisible(f, null, true).hidden, 0)
  const allOk = { status: 'ok', sources: [src({ status: 'ref' }), src({ status: 'ok' })] }
  assert.deepEqual(tripVisible(allOk, null, false), { shown: [], hidden: 2 })
  const warn = { status: 'warn', sources: [src({ label: 'R', status: 'ref' }), src({ label: 'A', status: 'ok', gap_days: 0 }), src({ label: 'B', status: 'ok', gap_days: 1 })] }
  assert.deepEqual(tripVisible(warn, null, false).shown.map(x => x.label), ['R', 'A', 'B'].filter(l => l === 'B'))
  assert.equal(tripHasHidden([allOk]), true)
  assert.equal(tripHasHidden([{ status: 'missing', sources: [src({ status: 'missing' })] }]), false)
})

test('nilai pengganti sumber tidak ditemukan; > 6 baris = 5 teratas + "Show N more"', () => {
  assert.equal(tripNotFoundLabel({ status: 'not_linked' }), 'Not linked')
  assert.equal(tripNotFoundLabel({ status: 'missing' }), 'Not found')
  assert.equal(tripNotFoundLabel({ status: 'ok' }), null)
  assert.equal(tripRowIcon({ status: 'missing', gap_days: null }, 'ok').label, 'Not found')
  assert.equal(tripRowIcon({ status: 'missing', gap_days: null }, 'ok').kind, 'na')
  assert.equal(tripVisibleCount(6, false), 6)
  assert.equal(tripVisibleCount(7, false), 5)
  assert.equal(tripVisibleCount(7, true), 7)
})

test('ikon status baris: centang (ok / ref), ! merah (diff), setengah amber (bergeser pada bidang warn), titik abu (tidak bisa dibandingkan)', () => {
  assert.equal(tripRowIcon({ status: 'ok', gap_days: 0 }, 'ok').kind, 'ok')
  assert.equal(tripRowIcon({ status: 'ref', gap_days: null }, 'ok').kind, 'ok')
  assert.equal(tripRowIcon({ status: 'diff', gap_days: 3 }, 'diff').kind, 'diff')
  assert.equal(tripRowIcon({ status: 'ok', gap_days: 1 }, 'warn').kind, 'warn')
  assert.equal(tripRowIcon({ status: 'ok', gap_days: 1 }, 'ok').kind, 'ok')
  assert.equal(tripRowIcon({ status: 'na', gap_days: null }, 'ok').kind, 'na')
  assert.equal(tripRowIcon({ status: 'ok', gap_days: 0 }, 'ok').label, 'Match')
})

test('kartu trip berurutan Vessel | Arrival | Departure, apa pun urutan dari server', () => {
  const f = (key: string) => ({ key, label: key, status: 'ok', reference: null, spread_days: null, sources: [] })
  assert.deepEqual(orderTripFields([f('arrival'), f('departure'), f('vessel')]).map(x => x.key), ['vessel', 'arrival', 'departure'])
  assert.deepEqual(orderTripFields([f('departure'), f('extra'), f('arrival')]).map(x => x.key), ['arrival', 'departure', 'extra'])
})

test('confirmed_none = chip HIJAU netral, bukan Missing dan tidak dihitung masalah; none / no_doc tetap Missing', () => {
  const s = sideState(side({ status: 'confirmed_none', note: 'Confirmed by a@b.co on 31 Oct 2026: ...' }), 'attachment')
  assert.equal(s.label, CONFIRMED_NONE_LABEL)
  assert.equal(s.label, 'No attachment (confirmed)')
  assert.equal(s.tone, 'green')
  assert.equal(s.neutral, true)
  assert.match(s.tip ?? '', /Confirmed by a@b\.co/)
  const line = { attachment: side({ status: 'confirmed_none' }), tax: side({ status: 'not_required' }), expect: { attachment: true, tax: false } }
  assert.equal(needsCheck(line), false)
  assert.equal(hasDiff(line), false)
  assert.equal(sideState(side({ status: 'none' }), 'attachment', { attachment: true }).label, 'Missing')
  assert.equal(needsCheck({ attachment: side({ status: 'none' }), tax: null, expect: { attachment: true } }), true)
})

test('tombol "No attachment for this vendor": hanya bila server mengizinkan; petunjuk bila vendor / jenis biaya belum dipilih', () => {
  const on = { attachment: side({ status: 'none', can_confirm_none: true }), cost_item: 'MATERAI' }
  assert.equal(canShowConfirmNone(on), true)
  assert.equal(canShowConfirmNone({ attachment: side({ status: 'no_doc', can_confirm_none: true }) }), true)
  assert.equal(canShowConfirmNone({ attachment: side({ status: 'none', can_confirm_none: false }) }), false)
  assert.equal(canShowConfirmNone({ attachment: side({ status: 'match', can_confirm_none: true }) }), false)
  assert.equal(canShowConfirmNone({ attachment: null }), false)
  assert.equal(needsVendorItemHint(on, 5), false) // tombol tampil -> tidak ada petunjuk
  assert.equal(needsVendorItemHint({ attachment: side({ status: 'none', can_confirm_none: false }), cost_item: null }, 5), true)
  assert.equal(needsVendorItemHint({ attachment: side({ status: 'none', can_confirm_none: false }), cost_item: 'MATERAI' }, null), true)
  assert.equal(needsVendorItemHint({ attachment: side({ status: 'none', can_confirm_none: false }), cost_item: 'MATERAI' }, 5), false) // ditolak karena alasan lain: tanpa petunjuk
  assert.equal(needsVendorItemHint({ attachment: side({ status: 'diff', can_confirm_none: false }), cost_item: null }, null), false)
  assert.equal(NEEDS_VENDOR_ITEM_HINT, 'Choose the vendor and a specific cost item first.')
})

test('revoke: rule_id hanya pada baris confirmed_none; catatan & alasan wajib; teks dialog & toast', () => {
  assert.equal(confirmedRuleId(side({ status: 'confirmed_none', confirmation: { rule_id: 7 } })), 7)
  assert.equal(confirmedRuleId(side({ status: 'confirmed_none', confirmation: null })), null)
  assert.equal(confirmedRuleId(side({ status: 'none', confirmation: { rule_id: 7 } })), null)
  assert.equal(noteError('  '), 'A note is required.')
  assert.equal(noteError('Vendor never sends one'), null)
  assert.equal(reasonError(''), 'A reason is required.')
  assert.match(confirmBody('PT ABC', 'MATERAI'), /Vendor PT ABC and cost item MATERAI will be remembered/)
  assert.equal(confirmToast({ validation_reset: false }), 'Saved. This vendor will be recognised automatically next time.')
  assert.equal(confirmToast({ validation_reset: true }), 'Saved. This vendor will be recognised automatically next time. The line validation was reset - validate it again.')
})

test('kode gerbang trip_* dikenal (bukan "Other"), bisa dicentang, dan tampil di Notes "Dates & voyage"', () => {
  assert.ok(KNOWN_GATE_CODES.includes('trip_date_diff'))
  assert.ok(KNOWN_GATE_CODES.includes('trip_vessel_diff'))
  assert.deepEqual(otherGateCodes(['trip_date_diff', 'trip_vessel_diff']), [])
  assert.ok(gateCodesToSave(['trip_vessel_diff']).includes('trip_vessel_diff'))
  const g = groupNotes([{ code: 'trip_date_diff', label: 'Arrival (TA) is not the same in all documents' }, { code: 'trip_vessel_diff', label: 'Vessel name is not the same in all documents' }])
  assert.equal(g.length, 1)
  assert.equal(g[0].key, 'dates')
  assert.equal(g[0].rows.length, 2)
})
