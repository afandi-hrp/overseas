// Review cost per invoice Audit Courier (2026-10-02, sql/038 `cost_validasi_review_courier`).
// "Accept difference" = MATCH (invoice dihitung sesuai di ringkasan/persen), "Ask vendor to revise" = MISMATCH
// (catatan WAJIB, tetap dihitung selisih). Pola SAMA konfirmasi segmen Invoice Recap Sea & Air
// (`cost_validasi_catatan_seaair`). Kunci = jenis dokumen (PIB/CN) + id baris Audit + section (FREIGHT/DUTY).
// SATU-SATUNYA tempat query tabel ini -- dipakai jendela baru, versi lama (mode List) & badge persen.
import { supabase } from '../lib/supabase';
import type { CostReviewMap, CostReviewSection } from './CostValidationHelpers';

export type CourierCostReview = {
  id: string;
  doc_type: 'PIB' | 'CN';
  audit_id: string;
  section: CostReviewSection;
  status_konfirmasi: 'MATCH' | 'MISMATCH';
  catatan: string | null;
  dikonfirmasi_oleh: string | null;
  dikonfirmasi_at: string | null;
};
export type CourierCostReviews = Partial<Record<CostReviewSection, CourierCostReview>>;

const TABLE = 'cost_validasi_review_courier';
const docTypeOf = (t: any): 'PIB' | 'CN' => (String(t || '').toUpperCase() === 'CN' ? 'CN' : 'PIB');

export const reviewMapOf = (r: CourierCostReviews | null | undefined): CostReviewMap => {
  const m: CostReviewMap = {};
  if (r?.FREIGHT) m.FREIGHT = r.FREIGHT.status_konfirmasi;
  if (r?.DUTY) m.DUTY = r.DUTY.status_konfirmasi;
  return m;
};

// Gagal (mis. tabel belum ada / tidak ada akses) -> {} supaya halaman tetap jalan (fail-open: tanpa review).
export async function fetchCourierCostReviews(docType: any, auditId: any): Promise<CourierCostReviews> {
  if (auditId === null || auditId === undefined || auditId === '') return {};
  const { data, error } = await supabase.from(TABLE).select('*').eq('doc_type', docTypeOf(docType)).eq('audit_id', String(auditId));
  if (error) { console.warn('[CourierCostReview] tidak terbaca (sql/038?)', error.message); return {}; }
  const out: CourierCostReviews = {};
  (data || []).forEach((r: any) => { out[r.section as CostReviewSection] = r; });
  return out;
}

// Banyak baris sekaligus (badge persen / KPI). Kunci hasil: `${PIB|CN}:${id}`.
export async function fetchCourierCostReviewMaps(rows: { docType: any; id: any }[]): Promise<Record<string, CostReviewMap>> {
  const out: Record<string, CostReviewMap> = {};
  const byType: Record<'PIB' | 'CN', string[]> = { PIB: [], CN: [] };
  rows.forEach(r => { if (r.id !== null && r.id !== undefined) byType[docTypeOf(r.docType)].push(String(r.id)); });
  for (const t of ['PIB', 'CN'] as const) {
    const ids = Array.from(new Set(byType[t]));
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from(TABLE).select('doc_type, audit_id, section, status_konfirmasi').eq('doc_type', t).in('audit_id', ids.slice(i, i + 100));
      if (error) { console.warn('[CourierCostReview] tidak terbaca (sql/038?)', error.message); return out; }
      (data || []).forEach((r: any) => {
        const k = `${t}:${r.audit_id}`;
        out[k] = { ...(out[k] || {}), [r.section]: r.status_konfirmasi };
      });
    }
  }
  return out;
}

export async function saveCourierCostReview(docType: any, auditId: any, section: CostReviewSection, status: 'MATCH' | 'MISMATCH', catatan: string, by: string | null) {
  return supabase.from(TABLE).upsert({
    doc_type: docTypeOf(docType),
    audit_id: String(auditId),
    section,
    status_konfirmasi: status,
    catatan: catatan.trim() || null,
    dikonfirmasi_oleh: by,
    dikonfirmasi_at: new Date().toISOString(),
  }, { onConflict: 'doc_type,audit_id,section' }).select().single();
}

export async function deleteCourierCostReview(id: string) {
  return supabase.from(TABLE).delete().eq('id', id);
}
