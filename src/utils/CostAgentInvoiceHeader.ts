// Bagian atas modal detail invoice Cost Agent (2026-10-29, permintaan user: mengikuti gambar referensi). Fungsi murni tampilan; tanpa import runtime supaya bisa dites (npm test).

// "Voyage route" untuk grid info: pelabuhan voyage berurutan + aktivitas, mis. "PAD (L) → MLH (D)". Data = `calls` dari fn_cost_agent_get_voyage apa adanya (urut `seq`).
export interface RouteCall { seq?: number | null; port_code?: string | null; activity?: string | null }
export const voyageRouteText = (calls: RouteCall[] | null | undefined): string | null => {
  const rows = [...(calls ?? [])].filter(c => c.port_code).sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
  return rows.length ? rows.map(c => (c.activity ? `${c.port_code} (${c.activity})` : String(c.port_code))).join(' → ') : null
}

// Bilah progres "7/12 verified": persen isi bilah (0..100, dibulatkan). Total 0 -> 0.
export const verifiedPercent = (verified: number, total: number): number => (total > 0 ? Math.max(0, Math.min(100, Math.round((verified / total) * 100))) : 0)
