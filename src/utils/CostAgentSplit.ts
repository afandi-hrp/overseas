// Kunci nominal dialog Split line (2026-10-29, permintaan user): jumlah semua bagian TIDAK boleh melebihi nilai baris yang dipecah.
// Hanya bentuk isian di layar; aturan "jumlah bagian = nilai baris" tetap ditegakkan fn_cost_agent_split_line di database.
// Tanpa import runtime supaya bisa dites (npm test).

const parse = (s: string): number => { const t = s.trim().replace(/,/g, ''); return t === '' ? NaN : Number(t) }

// Sisa nilai yang boleh dipakai bagian ini = nilai baris - jumlah bagian LAIN. Baris bernilai negatif / nol (credit) tidak dikunci (null).
export function splitRoom(target: number, otherAmounts: string[]): number | null {
  if (!Number.isFinite(target) || target <= 0) return null
  const others = otherAmounts.reduce((a, s) => a + (Number.isFinite(parse(s)) ? parse(s) : 0), 0)
  return Math.max(0, Math.round((target - others) * 100) / 100)
}

// Isian yang dikembalikan setelah diketik: tanda minus dibuang dan angka dipotong ke sisa yang boleh dipakai (baris positif). Teks belum selesai ("12.") dibiarkan.
export function clampSplitInput(raw: string, target: number, otherAmounts: string[]): string {
  const room = splitRoom(target, otherAmounts)
  if (room === null) return raw
  const cleaned = raw.replace(/-/g, '')
  const n = parse(cleaned)
  if (!Number.isFinite(n)) return cleaned
  return n > room ? String(room) : cleaned
}
