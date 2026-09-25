// Sea & Air Cost Validation -- logic hitung statistik global (Match/Overcharge/Undercharge/%)
// dipakai `ValidasiShipmentInvoiceLengkap.tsx` (SATU-SATUNYA tempat asalnya, DIEKSTRAK ke sini
// 2026-09 bareng fitur "Catatan Konfirmasi Manual per-Segmen") DAN badge % Cost Validation di
// `SharedDataTable.tsx` (Rekapan Sea & Air) -- pola sama `relaxSeaAirDocChecks()` di
// `SeaAirValidasiHelpers.ts` (Doc Validation): badge & modal WAJIB pakai formula yang PERSIS
// SAMA, JANGAN duplikat logic ini di tempat ketiga.

export type SeaAirCostGlobalStats = {
  match: number;
  mismatch: number;
  overcharge: number;
  undercharge: number;
  total: number;
  pct: number;
};

export type SectionConfirmation = 'MATCH' | 'MISMATCH';

// `confirmationBySection` -- section (EMKL/TRUCKING/FREIGHT_ORIGIN/dst) yang SUDAH dikonfirmasi
// manual staf (ada baris di `cost_validasi_catatan_seaair`), map ke status_konfirmasi yang
// DIPILIH staf (MATCH/MISMATCH) -- lihat "Catatan Konfirmasi Manual per-Segmen" di
// ValidasiShipmentInvoiceLengkap.tsx. Section yang PUNYA konfirmasi -> SEMUA baris `checks`
// section itu dianggap ikut status_konfirmasi tsb utk keperluan statistik (murni tampilan/
// agregasi, TIDAK PERNAH menulis balik ke kolom `checks` tersimpan di `cost_validasi_seaair`).
// Section TANPA konfirmasi -> tetap pakai `c.status` masing2 baris apa adanya (perilaku lama).
export function computeSeaAirCostGlobalStats(checksRaw: any, confirmationBySection: Map<string, SectionConfirmation>): SeaAirCostGlobalStats {
  const checks = Array.isArray(checksRaw) ? checksRaw : [];
  // Tabel INVOICE SURVEYOR (OPSIONAL) dikecualikan dari statistik -- opsional, jadi tidak ikut
  // menentukan persentase akurasi keseluruhan (baris SURVEYOR yang kosong/belum diisi
  // seharusnya tidak menurunkan skor validasi cost yang wajib).
  const countedChecks = checks.filter((c: any) => c.section !== 'SURVEYOR');
  let match = 0, overcharge = 0, undercharge = 0;
  const total = countedChecks.length;
  countedChecks.forEach((c: any) => {
    const confirmation = confirmationBySection.get(c.section);
    let effectiveStatus = c.status;
    if (confirmation === 'MATCH') {
      effectiveStatus = 'MATCH';
    } else if (confirmation === 'MISMATCH') {
      // Segmen sengaja ditandai TIDAK sesuai -- pertahankan klasifikasi over/under asli baris
      // itu kalau memang sudah OVERCHARGE/UNDERCHARGE; baris yang secara hitungan otomatis
      // MATCH tapi segmennya ditandai manual MISMATCH tetap dihitung tidak sesuai (fallback
      // 'OVERCHARGE', sekadar butuh 1 kategori pasti -- kasus tepi, staf biasanya cuma
      // menandai MISMATCH utk segmen yang memang sudah py selisih).
      effectiveStatus = (c.status === 'OVERCHARGE' || c.status === 'UNDERCHARGE') ? c.status : 'OVERCHARGE';
    }
    if (effectiveStatus === 'MATCH') match++;
    else if (effectiveStatus === 'OVERCHARGE') overcharge++;
    else if (effectiveStatus === 'UNDERCHARGE') undercharge++;
  });
  const mismatch = overcharge + undercharge;
  return { match, mismatch, overcharge, undercharge, total, pct: total > 0 ? Math.round((match / total) * 100) : 0 };
}
