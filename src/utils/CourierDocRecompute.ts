// "Recompute" Doc Validation Courier (2026-10-02, keputusan user) -- SATU fungsi dipakai ValidasiModal (jendela baru)
// DAN ValidasiModalLegacy (mode List) supaya logikanya sama.
// Konteks: dokumen susulan (Upload additional doc) diproses n8n & MENIMPA `dokumen_validasi` (data lama). Checklist
// Doc Validation yang SUDAH tersimpan tidak ikut berubah sendiri -> user menekan Recompute.
// Aturan: tiap sisi (src / cmp) diisi dari data dokumen TERBARU kalau sisi itu BELUM PERNAH diedit manual
// (`src_edited`/`cmp_edited`) DAN data terbaru tidak kosong DAN nilainya beda. Edit manual TIDAK PERNAH ditimpa;
// data terbaru yang kosong tidak menghapus isi lama; `manual_status` (override Match/Mismatch) tetap.
// (Versi 2026-09 hanya mengisi sisi yang masih KOSONG -> nilai yang diganti dokumen susulan tidak ikut terbaru.)
const filled = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';

// JSON dgn urutan key terurut. Kolom `values_json` bertipe jsonb: Postgres mengurutkan ulang key objek (pendek dulu, lalu abjad),
// jadi `JSON.stringify` objek `bt` hasil hitung != versi tersimpan walau isinya sama -> banner "newer document data" muncul lagi
// tiap buka ulang padahal sudah di-Recompute (2026-10-22).
const stableJson = (v: any): string => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.keys(val).sort().reduce((o: Record<string, any>, k) => { o[k] = val[k]; return o; }, {})
    : val);

export type DocRecomputePlan = { next: Record<string, any>; filled: number; updated: number; total: number };

export function planCourierDocRecompute(prev: Record<string, any>, computed: Record<string, any> | null | undefined): DocRecomputePlan {
  const next: Record<string, any> = { ...(prev || {}) };
  let nFilled = 0, nUpdated = 0;
  if (!computed) return { next, filled: 0, updated: 0, total: 0 };
  Object.keys(computed).forEach(id => {
    const cur = (prev || {})[id] || {};
    const comp = computed[id] || {};
    // Baris BT Vendor (BtVendorCombined.ts) membawa `bt` (null = bukan gabungan): cmp KOSONG di sini bermakna ("Perlu rincian BT") dan
    // harus menimpa nilai lama; meta `bt` ikut diperbarui supaya tampilan sama dgn status hasil hitung.
    const isBtRow = 'bt' in comp;
    const takeSrc = !cur.src_edited && filled(comp.src) && String(comp.src) !== String(cur.src ?? '');
    const takeCmp = !cur.cmp_edited && (filled(comp.cmp) || (isBtRow && !!comp.bt)) && String(comp.cmp ?? '') !== String(cur.cmp ?? '');
    const takeBt = isBtRow && !cur.src_edited && !cur.cmp_edited && stableJson(comp.bt ?? null) !== stableJson(cur.bt ?? null);
    if (!takeSrc && !takeCmp && !takeBt) return;
    if (takeSrc) { if (filled(cur.src)) nUpdated++; else nFilled++; }
    if (takeCmp) { if (filled(cur.cmp)) nUpdated++; else nFilled++; }
    if (takeBt && !takeSrc && !takeCmp) nUpdated++;
    next[id] = {
      ...cur,
      src: takeSrc ? comp.src : cur.src,
      cmp: takeCmp ? comp.cmp : cur.cmp,
      srcDisplay: takeSrc ? comp.srcDisplay : cur.srcDisplay,
      srcNote: takeSrc ? comp.srcNote : cur.srcNote,
      ...(takeBt || (isBtRow && (takeSrc || takeCmp)) ? { bt: comp.bt ?? null } : {}),
    };
  });
  return { next, filled: nFilled, updated: nUpdated, total: nFilled + nUpdated };
}

export const docRecomputeMessage = (p: DocRecomputePlan) =>
  p.total > 0
    ? `Recompute done: ${p.filled} field(s) filled and ${p.updated} field(s) updated from the latest document data.`
    : 'Nothing to recompute — every field already matches the latest document data or was edited manually.';

export const docRecomputePendingText = (n: number, canEdit: boolean) =>
  `${n} field(s) have newer document data (e.g. an additional document)` +
  (canEdit ? ' — click Recompute to apply.' : ' — an editor can apply it with Recompute while the record is Draft.');
