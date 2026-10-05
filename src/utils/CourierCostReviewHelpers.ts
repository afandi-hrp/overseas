// Review cost per invoice Audit Courier (2026-10-02, sql/038 `cost_validasi_review_courier`).
// "Accept difference" = MATCH (invoice dihitung sesuai di ringkasan/persen), "Ask vendor to revise" = MISMATCH
// (catatan WAJIB, tetap dihitung selisih). Pola SAMA konfirmasi segmen Invoice Recap Sea & Air
// (`cost_validasi_catatan_seaair`). Kunci = jenis dokumen (PIB/CN) + id baris Audit + section (FREIGHT/DUTY).
// + Accept PER BARIS (2026-10-05, sql/041 `cost_validasi_review_courier_item`, panel Validation Invoice Recap):
// kunci = jenis dokumen + id Audit + item_key (freight/fuel/.../total_duty), catatan WAJIB, snapshot Expected/Actual.
// SATU-SATUNYA tempat query kedua tabel ini -- dipakai jendela baru, versi lama (mode List), panel & badge persen.
import { supabase } from '../lib/supabase';
import type { CostReviewMap, CostReviewSection, CostItemReview } from './CostValidationHelpers';

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
export type CourierCostItemReviewRow = {
  id: string;
  doc_type: 'PIB' | 'CN';
  audit_id: string;
  item_key: string;
  section: CostReviewSection;
  status_konfirmasi: 'MATCH' | 'MISMATCH';
  catatan: string;
  nilai_expected: number | null;
  nilai_actual: number | null;
  dikonfirmasi_oleh: string | null;
  dikonfirmasi_at: string | null;
};
export type CourierCostReviews = Partial<Record<CostReviewSection, CourierCostReview>> & { items?: Record<string, CourierCostItemReviewRow> };

const TABLE = 'cost_validasi_review_courier';
const ITEM_TABLE = 'cost_validasi_review_courier_item';
const docTypeOf = (t: any): 'PIB' | 'CN' => (String(t || '').toUpperCase() === 'CN' ? 'CN' : 'PIB');
const toNumOrNull = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const itemOf = (r: any): CostItemReview => ({ status: r.status_konfirmasi, expected: toNumOrNull(r.nilai_expected), actual: toNumOrNull(r.nilai_actual) });

export const reviewMapOf = (r: CourierCostReviews | null | undefined): CostReviewMap => {
  const m: CostReviewMap = {};
  if (r?.FREIGHT) m.FREIGHT = r.FREIGHT.status_konfirmasi;
  if (r?.DUTY) m.DUTY = r.DUTY.status_konfirmasi;
  if (r?.items && Object.keys(r.items).length > 0) {
    m.items = {};
    Object.entries(r.items).forEach(([k, v]) => { m.items![k] = itemOf(v); });
  }
  return m;
};

// Accept per baris -- gagal (sql/041 belum jalan / tanpa akses) -> {} (fail-open, perilaku lama).
async function fetchItemReviews(docType: any, auditId: any): Promise<Record<string, CourierCostItemReviewRow>> {
  const { data, error } = await supabase.from(ITEM_TABLE).select('*').eq('doc_type', docTypeOf(docType)).eq('audit_id', String(auditId));
  if (error) { console.warn('[CourierCostReview] review per baris tidak terbaca (sql/041?)', error.message); return {}; }
  const out: Record<string, CourierCostItemReviewRow> = {};
  (data || []).forEach((r: any) => { out[r.item_key] = r; });
  return out;
}

// Gagal (mis. tabel belum ada / tidak ada akses) -> {} supaya halaman tetap jalan (fail-open: tanpa review).
export async function fetchCourierCostReviews(docType: any, auditId: any): Promise<CourierCostReviews> {
  if (auditId === null || auditId === undefined || auditId === '') return {};
  const [{ data, error }, items] = await Promise.all([
    supabase.from(TABLE).select('*').eq('doc_type', docTypeOf(docType)).eq('audit_id', String(auditId)),
    fetchItemReviews(docType, auditId),
  ]);
  const out: CourierCostReviews = {};
  if (error) console.warn('[CourierCostReview] tidak terbaca (sql/038?)', error.message);
  else (data || []).forEach((r: any) => { out[r.section as CostReviewSection] = r; });
  if (Object.keys(items).length > 0) out.items = items;
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
      const chunk = ids.slice(i, i + 100);
      const { data, error } = await supabase.from(TABLE).select('doc_type, audit_id, section, status_konfirmasi').eq('doc_type', t).in('audit_id', chunk);
      if (error) { console.warn('[CourierCostReview] tidak terbaca (sql/038?)', error.message); return out; }
      (data || []).forEach((r: any) => {
        const k = `${t}:${r.audit_id}`;
        out[k] = { ...(out[k] || {}), [r.section]: r.status_konfirmasi };
      });
      const { data: items, error: itemErr } = await supabase.from(ITEM_TABLE).select('doc_type, audit_id, item_key, status_konfirmasi, nilai_expected, nilai_actual').eq('doc_type', t).in('audit_id', chunk);
      if (itemErr) { console.warn('[CourierCostReview] review per baris tidak terbaca (sql/041?)', itemErr.message); continue; }
      (items || []).forEach((r: any) => {
        const k = `${t}:${r.audit_id}`;
        const cur = out[k] || {};
        out[k] = { ...cur, items: { ...(cur.items || {}), [r.item_key]: itemOf(r) } };
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

// Accept 1 baris biaya (catatan WAJIB) + snapshot nilai Expected/Actual saat ini.
export async function saveCourierCostItemReview(docType: any, auditId: any, row: { key: string; section: CostReviewSection; expected: number | null; actual: number | null }, catatan: string, by: string | null) {
  return supabase.from(ITEM_TABLE).upsert({
    doc_type: docTypeOf(docType),
    audit_id: String(auditId),
    item_key: row.key,
    section: row.section,
    status_konfirmasi: 'MATCH',
    catatan: catatan.trim(),
    nilai_expected: row.expected,
    nilai_actual: row.actual,
    dikonfirmasi_oleh: by,
    dikonfirmasi_at: new Date().toISOString(),
  }, { onConflict: 'doc_type,audit_id,item_key' }).select().single();
}

export async function deleteCourierCostItemReview(id: string) {
  return supabase.from(ITEM_TABLE).delete().eq('id', id);
}
