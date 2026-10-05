// Catatan manual 1 baris per catatan (Accept di panel Validation Invoice Recap Courier, 2026-10-05) -- dipakai
// "Manual Change Notes" Doc Validation (tabel_checklist_validasi.catatan_manual) & "Catatan Perubahan Manual"
// Cost Validation (tabel_cost_validasi.catatan).
// Tambah 1 baris catatan ke catatan manual -- baris yang sama tidak diduplikasi.
export const appendNoteLine = (notes: string | null | undefined, line: string): string => {
  const cur = (notes || '').replace(/\s+$/, '');
  if (cur.split('\n').some(l => l.trim() === line.trim())) return cur;
  return cur ? `${cur}\n${line}` : line;
};
// Hapus 1 baris catatan (Undo Accept cost).
export const removeNoteLine = (notes: string | null | undefined, line: string): string =>
  (notes || '').split('\n').filter(l => l.trim() !== line.trim()).join('\n').replace(/\s+$/, '');

