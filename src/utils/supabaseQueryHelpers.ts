// Helper query Supabase/PostgREST bersama (2026-10-06, analisa halaman Audit Trail).

// Nilai Search aman utk filter `.or()` PostgREST (2026-10-06, analisa Audit Trail): wildcard LIKE (\ % _) di-escape,
// karakter pemisah sintaks or() (koma, kurung, kutip) diganti `_` (cocok 1 karakter apa pun) -- dulu mengetik
// "PO/WNS, 0349" membuat query error & daftar kosong. Pola SAMA FarOverseasAirPage (`escLike`).
export const orSafe = (term: string) => term.replace(/[\\%_]/g, c => `\\${c}`).replace(/[,()"]/g, '_');

// Export diambil PER HALAMAN (2026-10-06, analisa Audit Trail): 1 request `.limit(50000)` bisa terpotong diam-diam
// oleh batas baris per request PostgREST (`max-rows`). Builder yang sama dipakai ulang -- `.range()` menimpa
// offset/limit & tiap `await` = request baru (postgrest-js). Berhenti saat halaman kosong (aman walau server
// membatasi < EXPORT_PAGE) atau mencapai `cap`.
export const EXPORT_PAGE = 1000;
export async function fetchAllPages(builder: any, cap = 50000): Promise<{ data: any[]; error: any }> {
  const out: any[] = [];
  let from = 0;
  while (out.length < cap) {
    const { data, error } = await builder.range(from, from + EXPORT_PAGE - 1);
    if (error) return { data: out, error };
    if (!data || data.length === 0) break;
    out.push(...data);
    from += data.length;
  }
  return { data: out.slice(0, cap), error: null };
}
