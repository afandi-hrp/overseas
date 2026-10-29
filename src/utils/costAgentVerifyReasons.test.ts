// Ringkasan & pengelompokan alasan "belum auto-verified": hanya bentuk tampilan dari hasil RPC (aturan TIDAK dihitung di klien). Tanpa import runtime ke supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupHeading, groupNeedsUser, reasonByLine, reasonsSummary, type LineReason, type LineVerifyReasons } from './CostAgentVerifyReasons'

const L = (line_no: number, code: string, over: Partial<LineReason> = {}): LineReason => ({
  line_id: 100 + line_no, line_no, verified: false, code, label: `label ${code}`, hint: null, needs_user: !['ready', 'documents_incomplete', 'invoice_status', 'verified'].includes(code), ...over,
})
const R = (lines: LineReason[], over: Partial<LineVerifyReasons> = {}): LineVerifyReasons => ({
  invoice_id: 1, auto_verify: { enabled: true, methods: [], levels: [] }, documents_complete: true,
  summary: { total: lines.length, verified: lines.filter(l => l.verified).length, eligible: lines.filter(l => l.code === 'ready').length, needs_user: lines.filter(l => l.needs_user && !l.verified).length },
  lines, ...over,
})

test('ringkasan: "Auto-verified N of M · K need your check"', () => {
  const r = R([L(1, 'verified', { verified: true, needs_user: false }), L(2, 'above_history'), L(3, 'no_history')])
  assert.deepEqual(reasonsSummary(r), { text: 'Auto-verified 1 of 3 · 2 need your check', tone: 'user' })
})

test('ringkasan: auto-verify mati -> satu kalimat; dokumen belum lengkap & K=0 -> "Waiting for documents"; selain itu hanya hitungan', () => {
  assert.equal(reasonsSummary(R([L(1, 'auto_verify_off')], { auto_verify: { enabled: false, methods: [], levels: [] } }))?.text, 'Auto-verify is off in Settings')
  const wait = reasonsSummary(R([L(1, 'documents_incomplete')], { documents_complete: false }))
  assert.deepEqual(wait, { text: 'Auto-verified 0 of 1 · Waiting for documents', tone: 'wait' })
  assert.deepEqual(reasonsSummary(R([L(1, 'verified', { verified: true, needs_user: false })])), { text: 'Auto-verified 1 of 1', tone: 'ok' })
  assert.equal(reasonsSummary(null), null)
})

test('ada needs_user walau dokumen belum lengkap -> tampil "need your check" (bukan Waiting)', () => {
  const r = R([L(1, 'above_history'), L(2, 'documents_incomplete')], { documents_complete: false })
  assert.equal(reasonsSummary(r)?.text, 'Auto-verified 0 of 2 · 1 need your check')
})

test('pengelompokan needs_user per kode: urutan tetap, nomor baris terurut, tunggal/jamak di judul', () => {
  const r = R([L(14, 'above_history'), L(8, 'above_history'), L(11, 'above_history'), L(3, 'no_cost_item'), L(5, 'ready'), L(6, 'verified', { verified: true, needs_user: false })])
  const g = groupNeedsUser(r)
  assert.deepEqual(g.map(x => groupHeading(x)), ['Above history (3)', 'No cost item (1)'])
  assert.deepEqual(g[0].lineNos, [8, 11, 14])
  assert.deepEqual(g[0].lineIds, [108, 111, 114])
})

test('kode tak dikenal tetap muncul (judul = label baris pertama); baris ready / documents_incomplete tidak masuk daftar', () => {
  const r = R([L(2, 'brand_new_code', { label: 'Something new', needs_user: true }), L(4, 'ready'), L(5, 'documents_incomplete')])
  const g = groupNeedsUser(r)
  assert.equal(g.length, 1)
  assert.equal(g[0].title, 'Something new')
})

test('reasonByLine: dipetakan per line_id; null aman', () => {
  const m = reasonByLine(R([L(1, 'above_history'), L(2, 'ready')]))
  assert.equal(m.get(101)?.code, 'above_history')
  assert.equal(m.get(102)?.code, 'ready')
  assert.equal(reasonByLine(null).size, 0)
})
