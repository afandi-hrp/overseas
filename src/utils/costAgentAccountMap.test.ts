// Account mapping, Auto-map akun Ascend, override vendor, Port di aturan pajak, issue baru AP Note (SQL 110/110b/111, 2026-10-30).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_MAX_PAGES, ACCOUNT_PAGE_SIZE, ACCOUNT_STATUS_CHIPS, ALL_PORTS_LABEL, accountBadges, accountPayload, apNoteIssueText, autofillLists, autofillSummary,
  collectAllAccounts, isAccountMapStatus, normalizeAutofill, overrideFormError, overridePayload, overrideToForm, taxPortLabel, toAscendAccount,
  type AscendAccount, type OverrideForm,
} from './CostAgentAccountMapLogic'

const acc = (id: number): AscendAccount => ({ id, code: `A${id}`, name: `Account ${id}`, disabled: false })

test('filter status Account mapping: lima chip, nilai persis seperti p_status RPC', () => {
  assert.deepEqual(ACCOUNT_STATUS_CHIPS.map(c => c.key), ['all', 'mapped', 'missing', 'mismatch', 'no_account'])
  assert.deepEqual(ACCOUNT_STATUS_CHIPS.map(c => c.label), ['All', 'Mapped', 'Missing', 'Mismatch', 'No account code'])
  assert.equal(isAccountMapStatus('mismatch'), true)
  assert.equal(isAccountMapStatus('bogus'), false)
  assert.equal(isAccountMapStatus(null), false)
})

test('lencana: mismatch kuning, disabled merah, sumber auto/manual, gembok; belum dipetakan = tanpa lencana', () => {
  const base = { mapped: true, mismatch: false, is_disabled: false, source: 'auto' as const, is_locked: false }
  assert.deepEqual(accountBadges(base), [{ key: 'source', label: 'Auto', tone: 'blue', locked: false }])
  const all = accountBadges({ mapped: true, mismatch: true, is_disabled: true, source: 'user', is_locked: true })
  assert.deepEqual(all.map(b => b.key), ['mismatch', 'disabled', 'source'])
  assert.equal(all[0].tone, 'amber')
  assert.equal(all[0].label, "Differs from item's default account")
  assert.equal(all[1].tone, 'red')
  assert.equal(all[1].label, 'Disabled in Ascend')
  assert.deepEqual(all[2], { key: 'source', label: 'Manual', tone: 'plum', locked: true })
  assert.deepEqual(accountBadges({ mapped: false, mismatch: true, is_disabled: true, source: 'user', is_locked: true }), [])
  assert.deepEqual(accountBadges({ mapped: true, mismatch: false, is_disabled: null, source: null, is_locked: null }), [])
})

test('OData AC_Accounts -> akun; baris tanpa id/kode dibuang; payload simpan = {id, code, name, disabled}', () => {
  assert.deepEqual(toAscendAccount({ AccountID: 7, AccountCode: ' 61050 ', AccountName: 'Materai', IsDisabled: false }), { id: 7, code: '61050', name: 'Materai', disabled: false })
  assert.deepEqual(toAscendAccount({ AccountID: '8', AccountCode: '1', AccountName: null, IsDisabled: true }), { id: 8, code: '1', name: null, disabled: true })
  assert.equal(toAscendAccount({ AccountID: 9, AccountCode: '  ' }), null)
  assert.equal(toAscendAccount({ AccountCode: '1' }), null)
  assert.equal(toAscendAccount(null), null)
  assert.deepEqual(accountPayload({ id: 7, code: '61050', name: 'Materai', disabled: true }), { id: 7, code: '61050', name: 'Materai', disabled: true })
})

test('menarik semua akun: halaman demi halaman sampai total, id ganda dibuang, progres dilaporkan', async () => {
  const total = ACCOUNT_PAGE_SIZE * 2 + 30
  const seen: [number, number][] = []
  const progress: number[] = []
  const r = await collectAllAccounts(async (skip, top) => {
    seen.push([skip, top])
    const rows = Array.from({ length: Math.max(0, Math.min(top, total - skip)) }, (_, i) => acc(skip + i + 1))
    if (skip === 0) rows.push(acc(1)) // duplikat sengaja
    return { rows, total }
  }, (loaded) => progress.push(loaded))
  assert.deepEqual(seen, [[0, ACCOUNT_PAGE_SIZE], [ACCOUNT_PAGE_SIZE, ACCOUNT_PAGE_SIZE], [ACCOUNT_PAGE_SIZE * 2, ACCOUNT_PAGE_SIZE]])
  assert.equal(r.accounts.length, total)
  assert.equal(r.total, total)
  assert.equal(r.stopped, false)
  assert.equal(progress[progress.length - 1], total)
})

test('menarik semua akun: tanpa $count berhenti di halaman pendek; halaman kosong = daftar kosong; Stop menghentikan; ada batas halaman', async () => {
  const short = await collectAllAccounts(async (skip) => ({ rows: skip === 0 ? [acc(1), acc(2)] : [], total: null }))
  assert.equal(short.accounts.length, 2)
  assert.equal(short.total, null)
  const empty = await collectAllAccounts(async () => ({ rows: [], total: 0 }))
  assert.deepEqual(empty, { accounts: [], total: 0, stopped: false })
  let calls = 0
  const stopped = await collectAllAccounts(async (skip) => { calls++; return { rows: Array.from({ length: ACCOUNT_PAGE_SIZE }, (_, i) => acc(skip + i + 1)), total: 99999 } }, undefined, () => calls >= 1)
  assert.equal(stopped.stopped, true)
  assert.equal(calls, 1)
  let infinite = 0
  const capped = await collectAllAccounts(async (skip) => { infinite++; return { rows: Array.from({ length: ACCOUNT_PAGE_SIZE }, (_, i) => acc(skip + i + 1)), total: null } })
  assert.equal(infinite, ACCOUNT_MAX_PAGES)
  assert.equal(capped.accounts.length, ACCOUNT_MAX_PAGES * ACCOUNT_PAGE_SIZE)
})

test('ringkasan Auto-map: angka + tiga daftar; daftar kosong / hilang tidak error', () => {
  const full = normalizeAutofill({
    company: 'GMI', accounts_received: 1200, mapped_new: 10, updated: 2, unchanged: 30, skipped_locked: 1, cost_items_without_account: 4,
    not_in_ascend: [{ cost_item_id: 1, code: 'MATERAI', gl_account: '61050' }], ambiguous: [{ cost_item_id: 2, code: 'X', gl_account: '1', candidates: 2 }],
    disabled_in_ascend: [], vendor_override_not_in_ascend: [{ vendor_id: 3, cost_item_id: 1, gl_account: '999' }],
  })
  assert.deepEqual(autofillSummary(full).map(s => s.value), [1200, 10, 2, 30, 1, 4])
  const lists = autofillLists(full)
  assert.deepEqual(lists.map(l => l.key), ['not_in_ascend', 'ambiguous', 'disabled_in_ascend'])
  assert.deepEqual(lists.map(l => l.title), ['Not in Ascend', 'Ambiguous', 'Disabled in Ascend'])
  assert.deepEqual(lists.map(l => l.rows.length), [1, 1, 0])
  const none = normalizeAutofill(null)
  assert.deepEqual(autofillSummary(none).map(s => s.value), [0, 0, 0, 0, 0, 0])
  assert.deepEqual(autofillLists(none).map(l => l.rows.length), [0, 0, 0])
  assert.deepEqual(none.vendor_override_not_in_ascend, [])
  const bad = normalizeAutofill({ not_in_ascend: 'oops' as never, mapped_new: 'x' as never })
  assert.deepEqual(bad.not_in_ascend, [])
  assert.equal(bad.mapped_new, 0)
})

test('form override vendor: jenis biaya wajib, minimal satu dari account code / AP Note description', () => {
  const f = (o: Partial<OverrideForm> = {}): OverrideForm => ({ cost_item_id: 5, gl_account: '', ap_description: '', note: '', ...o })
  assert.equal(overrideFormError(f({ cost_item_id: null, gl_account: '61050' })), 'Choose a cost item.')
  assert.equal(overrideFormError(f()), 'Fill the account code or the AP Note description.')
  assert.equal(overrideFormError(f({ gl_account: '   ', ap_description: '  ' })), 'Fill the account code or the AP Note description.')
  assert.equal(overrideFormError(f({ gl_account: '61050' })), null)
  assert.equal(overrideFormError(f({ ap_description: 'MATERAI PELINDO' })), null)
  assert.equal(overrideFormError(f({ gl_account: 'x'.repeat(41) })), 'Account code is too long (max 40).')
  assert.equal(overrideFormError(f({ ap_description: 'x'.repeat(101) })), 'AP Note description is too long (max 100).')
})

test('payload override: kedua kunci selalu dikirim, kosong = null; form dari baris tersimpan', () => {
  assert.deepEqual(overridePayload({ cost_item_id: 5, gl_account: ' 61050 ', ap_description: '', note: ' ' }), { gl_account: '61050', ap_description: null, note: null })
  assert.deepEqual(overrideToForm({ id: 1, vendor_id: 2, cost_item_id: 5, gl_account: null, ap_description: 'MATERAI', note: null }), { cost_item_id: 5, gl_account: '', ap_description: 'MATERAI', note: '' })
})

test('kolom Port di aturan pajak: kosong = "All ports"', () => {
  assert.equal(ALL_PORTS_LABEL, 'All ports')
  assert.equal(taxPortLabel({ port_name: 'Belawan' }), 'Belawan')
  assert.equal(taxPortLabel({ port_name: null }), 'All ports')
  assert.equal(taxPortLabel({}), 'All ports')
  assert.equal(taxPortLabel({ port_name: '  ' }), 'All ports')
})

test('issue AP Note: issue baru tampil dengan message server; kode tak dikenal / tanpa message tidak error', () => {
  const m1 = 'Line 2: cost item "MATERAI" has no account code - AccountCode will be empty'
  assert.equal(apNoteIssueText({ level: 'warning', code: 'account_code', line_no: 2, message: m1 }, 'GMI'), m1)
  const m2 = 'Line 3: Ascend account 61050 is disabled - choose another account for "MATERAI"'
  assert.equal(apNoteIssueText({ level: 'error', code: 'account_disabled', line_no: 3, message: m2 }, 'GMI'), m2)
  const m3 = 'Line 4: mapped Ascend account 61051 differs from the cost item account 61050 - the mapped account is used'
  assert.equal(apNoteIssueText({ level: 'warning', code: 'account_mismatch', line_no: 4, message: m3 }, null), m3)
  assert.equal(apNoteIssueText({ level: 'warning', code: 'brand_new_code', message: 'Something new' }, 'GMI'), 'Something new')
  assert.equal(apNoteIssueText({ code: 'brand_new_code' }, 'GMI'), 'brand_new_code')
  assert.equal(apNoteIssueText({}, null), 'Unknown issue')
  // perilaku lama tetap: expense_map memakai nama PT
  assert.equal(apNoteIssueText({ code: 'expense_map', message: 'Line 1: cost item "X" is not mapped to an Ascend expense type' }, 'WNS'), 'Line 1: cost item "X" is not mapped for WNS')
})
