// "Recompute" Doc Validation Courier (2026-10-02, keputusan user) -- SATU fungsi dipakai ValidasiModal (jendela baru)
// DAN ValidasiModalLegacy (mode List) supaya logikanya sama.
// Konteks: dokumen susulan (Upload additional doc) diproses n8n & MENIMPA `dokumen_validasi` (data lama). Checklist
// Doc Validation yang SUDAH tersimpan tidak ikut berubah sendiri -> user menekan Recompute.
// Aturan: tiap sisi (src / cmp) diisi dari data dokumen TERBARU kalau sisi itu BELUM PERNAH diedit manual
// (`src_edited`/`cmp_edited`) DAN data terbaru tidak kosong DAN nilainya beda. Edit manual TIDAK PERNAH ditimpa;
// data terbaru yang kosong tidak menghapus isi lama; `manual_status` (override Match/Mismatch) tetap.
// (Versi 2026-09 hanya mengisi sisi yang masih KOSONG -> nilai yang diganti dokumen susulan tidak ikut terbaru.)
const filled = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';

export type DocRecomputePlan = { next: Record<string, any>; filled: number; updated: number; total: number };

export function planCourierDocRecompute(prev: Record<string, any>, computed: Record<string, any> | null | undefined): DocRecomputePlan {
  const next: Record<string, any> = { ...(prev || {}) };
  let nFilled = 0, nUpdated = 0;
  if (!computed) return { next, filled: 0, updated: 0, total: 0 };
  Object.keys(computed).forEach(id => {
    const cur = (prev || {})[id] || {};
    const comp = computed[id] || {};
    const takeSrc = !cur.src_edited && filled(comp.src) && String(comp.src) !== String(cur.src ?? '');
    const takeCmp = !cur.cmp_edited && filled(comp.cmp) && String(comp.cmp) !== String(cur.cmp ?? '');
    if (!takeSrc && !takeCmp) return;
    if (takeSrc) { if (filled(cur.src)) nUpdated++; else nFilled++; }
    if (takeCmp) { if (filled(cur.cmp)) nUpdated++; else nFilled++; }
    next[id] = {
      ...cur,
      src: takeSrc ? comp.src : cur.src,
      cmp: takeCmp ? comp.cmp : cur.cmp,
      srcDisplay: takeSrc ? comp.srcDisplay : cur.srcDisplay,
      srcNote: takeSrc ? comp.srcNote : cur.srcNote,
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
