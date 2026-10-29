// Kartu dokumen (Invoice / Tax invoice / Attachment), halaman per dokumen, duplikat, FP lumpsum. Hanya bentuk tampilan dari hasil RPC; tanpa import runtime ke supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachmentDateRange, buildDocCards, cardCount, cardKeyOfDocType, coveredReasonText, pageText, rangesText, withPage } from './CostAgentDocCards'
import { LUMP_SUM_LABEL, sideState } from './CostAgentDocLines'

const file = (id: number, seq: number, name: string) => ({ id, seq, file_name: name, file_url: `https://drive.google.com/file/d/F${id}/view`, created_at: '2026-10-29T01:00:00Z' })
const part = (id: number, file_id: number, doc_type: string, from: number, to: number, over: Record<string, unknown> = {}) =>
  ({ id, file_id, file_name: null, doc_type, is_tax_equivalent: false, doc_no: `NO-${id}`, doc_date: null, page_from: from, page_to: to, duplicate_of: null, ...over })
const comp = (key: string, ids: number[], parts: any[]) => ({ key, label: key, required: true, status: ids.length ? 'present' : 'missing', docs: ids.map(i => ({ part_id: i, doc_no: parts.find(p => p.id === i)?.doc_no ?? null, doc_date: null, doc_type: parts.find(p => p.id === i)?.doc_type ?? null })) })
const cmpOf = (files: any[], parts: any[], tax: number[], att: number[], inv: number[]): any => ({
  analysed: true, files, parts, completeness: [comp('invoice', inv, parts), comp('tax_invoice', tax, parts), comp('attachment', att, parts)],
})

test('tiga file terpisah: tiap kartu memakai file MILIKNYA; urutan Invoice, Tax invoice, Attachment; nota Pelindo = lampiran (Port note)', () => {
  const parts = [part(10, 1, 'invoice', 1, 2), part(11, 2, 'faktur_pajak', 1, 1), part(12, 3, 'nota_pelabuhan', 1, 9)]
  const c = buildDocCards(cmpOf([file(1, 1, 'INV.pdf'), file(2, 2, 'FP.pdf'), file(3, 3, 'LAMP.pdf')], parts, [11], [12], [10]), [])
  assert.deepEqual([c.invoice[0].fileName, c.tax_invoice[0].fileName, c.attachment[0].fileName], ['INV.pdf', 'FP.pdf', 'LAMP.pdf'])
  assert.equal(c.attachment[0].label, 'Port note')
  assert.equal(c.tax_invoice.length, 1)
  assert.equal(c.invoice[0].url, 'https://drive.google.com/file/d/F1/view#page=1')
  assert.equal(c.attachment[0].pages, 'p. 1–9')
})

test('file campuran: file yang sama di beberapa kartu dengan halaman berbeda', () => {
  const parts = [part(10, 1, 'invoice', 1, 2), part(11, 1, 'faktur_pajak', 3, 3), part(12, 1, 'nota_pelabuhan', 4, 9)]
  const c = buildDocCards(cmpOf([file(1, 1, 'INV.pdf')], parts, [11], [12], [10]), [])
  assert.deepEqual([c.invoice[0].pages, c.tax_invoice[0].pages, c.attachment[0].pages], ['p. 1–2', 'p. 3', 'p. 4–9'])
  assert.ok(c.tax_invoice[0].url!.endsWith('#page=3'))
  assert.ok(c.attachment[0].url!.endsWith('#page=4'))
  assert.equal(c.tax_invoice[0].fileId, c.attachment[0].fileId)
})

test('duplikat: berlabel (duplicateOf), menuju file & halaman ASLI, tidak dihitung di jumlah kartu, urut setelah dokumen asli', () => {
  const parts = [part(11, 2, 'faktur_pajak', 1, 1), part(13, 1, 'faktur_pajak', 3, 3, { duplicate_of: 11 })]
  const c = buildDocCards(cmpOf([file(1, 1, 'INV.pdf'), file(2, 2, 'FP.pdf')], parts, [11], [], []), [])
  assert.equal(c.tax_invoice.length, 2)
  assert.equal(cardCount(c.tax_invoice), 1)
  const dup = c.tax_invoice.find(d => d.duplicateOf != null)!
  assert.equal(dup.duplicateOf, 11)
  assert.equal(dup.fileName, 'FP.pdf') // file asli, bukan file tempat salinan
  assert.ok(dup.url!.includes('/F2/'))
  assert.equal(c.tax_invoice[1].partId, 13)
})

test('is_tax_equivalent (data lama) TIDAK membuat nota Pelindo masuk kartu Tax invoice; keanggotaan kartu = completeness server', () => {
  const parts = [part(12, 3, 'nota_pelabuhan', 1, 9, { is_tax_equivalent: true })]
  const c = buildDocCards(cmpOf([file(3, 1, 'LAMP.pdf')], parts, [], [12], []), [])
  assert.equal(c.tax_invoice.length, 0)
  assert.equal(c.attachment.length, 1)
  assert.equal(cardKeyOfDocType('nota_pelabuhan'), 'attachment')
  assert.equal(cardKeyOfDocType('faktur_pajak'), 'tax_invoice')
})

test('tanpa FP: kartu Tax invoice kosong; invoice tanpa part memakai file invoice (cadangan)', () => {
  const c = buildDocCards({ analysed: false, files: [], parts: [], completeness: [] } as any, [{ file_name: 'INV.pdf', file_url: 'https://x/inv.pdf' }], '2026-10-29')
  assert.equal(c.tax_invoice.length, 0)
  assert.equal(c.invoice[0].url, 'https://x/inv.pdf')
  assert.equal(c.invoice[0].pages, null)
})

test('halaman & rentang baris', () => {
  assert.equal(pageText(3, 3), 'p. 3'); assert.equal(pageText(3, 5), 'p. 3–5'); assert.equal(pageText(null, null), null)
  assert.equal(withPage('https://x/a.pdf', 4), 'https://x/a.pdf#page=4'); assert.equal(withPage('https://x/a.pdf#page=2', 4), 'https://x/a.pdf#page=2'); assert.equal(withPage(null, 4), null)
  assert.equal(rangesText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), '1–14')
  assert.equal(rangesText([3, 1, 2, 5, 7, 8]), '1–3, 5, 7, 8')
})

test('FP lumpsum: sisi pajak match_agg = "Covered by tax invoice (lump sum)" (hijau, tooltip = note apa adanya); sisi lampiran match_agg tetap OK', () => {
  const note = 'Covered by the lump-sum line "Jasa Keagenan Tanker" (28.023.874)'
  const t = sideState({ status: 'match_agg', diff: null, note }, 'tax')
  assert.deepEqual([t.label, t.tone, t.neutral, t.tip], [LUMP_SUM_LABEL, 'green', false, note])
  assert.equal(sideState({ status: 'match_agg', diff: null, note: 'x' }, 'attachment').label, 'OK')
  assert.equal(sideState({ status: 'pending', diff: null }, 'tax').label, 'n/a')
})

test('keterangan "Also supports an invoice line": dua alasan dikenal; alasan lain / kosong tidak ditebak', () => {
  assert.equal(coveredReasonText('same_amount_as_line'), 'Same amount as an invoice line')
  assert.equal(coveredReasonText('total_of_document_items'), 'Total of the items in a document')
  assert.equal(coveredReasonText('something_new'), ''); assert.equal(coveredReasonText(null), '')
})

test('periode lampiran: rentang tanggal dokumen lampiran saja (bukan invoice / faktur pajak / duplikat); kosong -> null', () => {
  const parts: any[] = [
    part(1, 1, 'invoice', 1, 1, { doc_date: '2026-10-01' }), part(2, 1, 'faktur_pajak', 2, 2, { doc_date: '2026-10-30' }),
    part(3, 1, 'nota_pelabuhan', 3, 3, { doc_date: '2026-10-24T08:00:00Z' }), part(4, 1, 'pnbp', 4, 4, { doc_date: '2026-10-22' }),
    part(5, 1, 'pranota', 5, 5, { doc_date: '2026-10-28', duplicate_of: 4 }), part(6, 1, 'kwitansi', 6, 6, { doc_date: null }),
  ]
  assert.deepEqual(attachmentDateRange(parts), { from: '2026-10-22', to: '2026-10-24' })
  assert.equal(attachmentDateRange([parts[0], parts[1]]), null)
  assert.equal(attachmentDateRange(null), null)
})
