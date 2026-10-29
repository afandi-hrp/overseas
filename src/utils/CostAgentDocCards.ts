// Kartu dokumen tab Documents & Tax (2026-10-29, permintaan user; SQL 097). Tiga kartu: Invoice, Tax invoice, Attachment (urutan itu). Isi tiap kartu = dokumen logis (parts)
// yang dikirim SERVER di `completeness[key].docs` (status/keanggotaan TIDAK dihitung di klien); klien hanya memasangkan tiap dokumen dengan file MILIKNYA (`part.file_id` ->
// file) dan rentang halamannya (`page_from`..`page_to`). Satu file campuran boleh muncul di beberapa kartu dengan halaman berbeda. Duplikat (`duplicate_of`) tampil berlabel
// "Duplicate", tautannya menuju dokumen ASLI, dan tidak dihitung di jumlah kartu. Tanpa import runtime (hanya tipe) supaya bisa dites (npm test).
import type { CostAgentDocCompare, DocCmpPart } from './CostAgentHelpers'

export type CardKey = 'invoice' | 'tax_invoice' | 'attachment'
export const CARD_ORDER: CardKey[] = ['invoice', 'tax_invoice', 'attachment'] // Invoice dulu, lalu Tax invoice, lalu lampiran

const TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice', faktur_pajak: 'Tax invoice', nota_pelabuhan: 'Port note', lampiran: 'Attachment', pnbp: 'PNBP', pranota: 'Pre-invoice',
  kwitansi: 'Receipt', po: 'PO', lainnya: 'Other', unknown: 'Document',
}
export const docTypeLabel = (t: string | null | undefined): string => TYPE_LABEL[String(t ?? 'unknown')] ?? String(t ?? 'Document')

// Dokumen duplikat (tidak ada di `completeness.docs`) ditaruh di kartu menurut jenisnya; nota Pelindo / lampiran / PNBP ... = Attachment, BUKAN Tax invoice.
export const cardKeyOfDocType = (t: string | null | undefined): CardKey => (t === 'invoice' ? 'invoice' : t === 'faktur_pajak' ? 'tax_invoice' : 'attachment')

export const pageText = (from: number | null | undefined, to: number | null | undefined): string | null => {
  if (from == null) return null
  return to == null || to === from ? `p. ${from}` : `p. ${from}–${to}`
}
// Fragmen halaman PDF (#page=N). Tidak ditambah bila URL sudah berfragmen. (Penampil Google Drive bisa saja mengabaikan fragmen ini.)
export const withPage = (url: string | null | undefined, pageFrom: number | null | undefined): string | null => {
  if (!url) return null
  return pageFrom == null || url.includes('#') ? url : `${url}#page=${pageFrom}`
}

export interface CardDoc {
  partId: number | null
  label: string // jenis dokumen (Invoice / Tax invoice / Port note ...)
  docNo: string | null
  fileId: number | null
  fileName: string | null
  url: string | null // sudah memuat #page=N bila ada halaman
  pages: string | null // "p. 3–5"
  received: string | null
  duplicateOf: number | null // id part ASLI bila ini duplikat
}
export interface InvoiceFileLike { file_name?: string | null; file_url?: string | null }

export function buildDocCards(cmp: CostAgentDocCompare | null | undefined, invoiceFiles: InvoiceFileLike[] | null | undefined, invoiceCreatedAt?: string | null): Record<CardKey, CardDoc[]> {
  const out: Record<CardKey, CardDoc[]> = { invoice: [], tax_invoice: [], attachment: [] }
  const parts = cmp?.parts ?? []
  const partById = new Map<number, DocCmpPart>(parts.map(p => [p.id, p]))
  const files = cmp?.files ?? []
  const fileById = new Map(files.map(f => [f.id, f]))
  const seqOf = (fileId: number | null): number => { const f = fileId != null ? fileById.get(fileId) : undefined; return f ? (f.seq ?? files.indexOf(f)) : 9999 }
  const toDoc = (p: DocCmpPart, viaOriginal?: DocCmpPart): CardDoc => {
    const target = viaOriginal ?? p // duplikat -> file & halaman dokumen ASLI
    const f = target.file_id != null ? fileById.get(target.file_id) : undefined
    return {
      partId: p.id, label: docTypeLabel(p.doc_type), docNo: p.doc_no ?? null, fileId: target.file_id ?? null, fileName: f?.file_name ?? target.file_name ?? null,
      url: withPage(f?.file_url ?? null, target.page_from), pages: pageText(target.page_from, target.page_to), received: f?.created_at ?? null, duplicateOf: p.duplicate_of ?? null,
    }
  }
  const seen = new Set<number>()
  for (const key of CARD_ORDER) {
    const comp = (cmp?.completeness ?? []).find(c => c.key === key)
    for (const d of comp?.docs ?? []) {
      const p = d.part_id != null ? partById.get(d.part_id) : undefined
      if (!p || p.duplicate_of != null || seen.has(p.id)) continue
      seen.add(p.id); out[key].push(toDoc(p))
    }
  }
  for (const p of parts) {
    if (p.duplicate_of == null || seen.has(p.id)) continue
    seen.add(p.id)
    out[cardKeyOfDocType(p.doc_type)].push(toDoc(p, partById.get(p.duplicate_of)))
  }
  if (out.invoice.length === 0) {
    for (const f of invoiceFiles ?? []) out.invoice.push({ partId: null, label: 'Invoice', docNo: null, fileId: null, fileName: f.file_name ?? 'Invoice', url: f.file_url ?? null, pages: null, received: invoiceCreatedAt ?? null, duplicateOf: null })
  }
  for (const key of CARD_ORDER) {
    out[key].sort((a, b) => (a.duplicateOf != null ? 1 : 0) - (b.duplicateOf != null ? 1 : 0) || seqOf(a.fileId) - seqOf(b.fileId)
      || (partById.get(a.partId ?? -1)?.page_from ?? 0) - (partById.get(b.partId ?? -1)?.page_from ?? 0))
  }
  return out
}
// Periode lampiran untuk strip di puncak tab Documents & Tax (2026-10-29): tanggal dokumen paling awal - paling akhir dari dokumen lampiran (BUKAN invoice / faktur pajak,
// duplikat tidak ikut). Server tidak mengirim "periode lampiran", jadi ini hanya rentang tanggal dokumen apa adanya (tanpa aturan); tidak ada tanggal -> null.
export function attachmentDateRange(parts: DocCmpPart[] | null | undefined): { from: string; to: string } | null {
  const ds = (parts ?? []).filter(p => p.duplicate_of == null && p.doc_date && cardKeyOfDocType(p.doc_type) === 'attachment').map(p => String(p.doc_date).slice(0, 10)).sort()
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null
}

// Jumlah dokumen pada kartu = tanpa duplikat.
export const cardCount = (docs: CardDoc[]): number => docs.filter(d => d.duplicateOf == null).length

// Keterangan kecil bagian "Also supports an invoice line" (SQL 098). Alasan tak dikenal -> kosong (tidak menebak).
export const COVERED_REASON_TEXT: Record<string, string> = {
  same_amount_as_line: 'Same amount as an invoice line',
  total_of_document_items: 'Total of the items in a document',
}
export const coveredReasonText = (reason: string | null | undefined): string => COVERED_REASON_TEXT[String(reason ?? '')] ?? ''

// Daftar nomor baris -> "1–14, 16" (rentang berurutan diringkas).
export function rangesText(nums: number[]): string {
  const a = Array.from(new Set(nums)).sort((x, y) => x - y)
  const out: string[] = []
  for (let i = 0; i < a.length; i++) {
    let j = i
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++
    out.push(j - i >= 2 ? `${a[i]}–${a[j]}` : a.slice(i, j + 1).join(', '))
    i = j
  }
  return out.join(', ')
}
