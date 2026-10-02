// Persen validasi Courier (Checklist / Doc validation / Cost validation) per baris Audit PIB/CN -- SATU sumber
// (dipindah dari SharedDataTable.tsx 2026-10-02, isi TIDAK berubah) supaya badge sidebar "needs attention" Invoice
// Recap Courier memakai rumus yang SAMA dengan titik kartu, jendela Validation & KPI.
import { supabase } from '../lib/supabase';
import { computeLiveCostSummary } from './CostValidationHelpers';
import { fetchCourierCostReviewMaps } from './CourierCostReviewHelpers';
import { SECTIONS, computeStatus } from './ValidasiHelper';
import { generateValues } from './ValidasiFill';
import { calculatePibStats } from './ValidasiPibHelper';
import type { ValidationTabKey } from '../components/CourierValidationWindow';

// Gabungkan kolom kelengkapan dari dokumen_checklist ke baris Audit (pib_id/cn_id = id).
export async function mergeChecklistFields(records: any[], fields: string[], docTypeHint?: 'pib' | 'cn') {
  if (!records || records.length === 0) return records
  const isPibRec = (r: any) => r.jenis_dokumen === 'PIB' || docTypeHint === 'pib'
  const isCnRec = (r: any) => r.jenis_dokumen === 'CN' || docTypeHint === 'cn'
  const pibIds = records.filter(isPibRec).map(r => r.id).filter(Boolean)
  const cnIds = records.filter(isCnRec).map(r => r.id).filter(Boolean)

  const checklistByPibId: Record<string, any> = {}
  const checklistByCnId: Record<string, any> = {}
  const chunkSize = 50

  const fetchChunked = async (idKey: 'pib_id' | 'cn_id', ids: any[], target: Record<string, any>) => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize)
      const { data } = await supabase.from('dokumen_checklist').select('*').in(idKey, chunkIds)
      if (data) data.forEach((c: any) => { target[c[idKey]] = c })
    }
  }

  if (pibIds.length > 0) await fetchChunked('pib_id', pibIds, checklistByPibId)
  if (cnIds.length > 0) await fetchChunked('cn_id', cnIds, checklistByCnId)

  records.forEach(r => {
    const c = isPibRec(r) ? checklistByPibId[r.id] : (isCnRec(r) ? checklistByCnId[r.id] : undefined)
    fields.forEach(key => {
      r[key] = c ? c[key] : null
    })
  })

  return records
}

// Badge persentase Doc Validation/Cost Validation Courier Audit -- Doc Validation dari tabel_checklist_validasi
// (match/(match+mismatch)), Cost Validation pakai computeLiveCostSummary() + review cost per invoice (sql/038).
// JANGAN duplikat formula di tempat lain.
export async function fetchCourierValidationBadgePct(rows: any[]): Promise<{ docPctMap: Record<string, number>, costPctMap: Record<string, number> }> {
  const docPctMap: Record<string, number> = {};
  const costPctMap: Record<string, number> = {};
  if (!rows || rows.length === 0) return { docPctMap, costPctMap };

  const pibIds = rows.filter(r => r.jenis_dokumen === 'PIB').map(r => r.id).filter(Boolean);
  const cnIds = rows.filter(r => r.jenis_dokumen === 'CN').map(r => r.id).filter(Boolean);
  const chunkSize = 50;

  const fetchChecklistPct = async (idKey: 'pib_id' | 'cn_id', ids: any[], keyPrefix: string) => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: chk } = await supabase.from('tabel_checklist_validasi').select(`${idKey}, total_match, total_mismatch`).in(idKey, chunk);
      (chk || []).forEach((c: any) => {
        const checked = (c.total_match || 0) + (c.total_mismatch || 0);
        docPctMap[`${keyPrefix}${c[idKey]}`] = checked > 0 ? Math.round((c.total_match / checked) * 100) : 0;
      });
    }
  };
  // Review cost per invoice (sql/038) ikut dihitung -- SAMA jendela Validation (computeLiveCostSummary + review).
  const reviewMaps = await fetchCourierCostReviewMaps([
    ...pibIds.map(id => ({ docType: 'PIB', id })),
    ...cnIds.map(id => ({ docType: 'CN', id })),
  ]);
  const fetchCostPct = async (idKey: 'pib_id' | 'cn_id', ids: any[], keyPrefix: string, jenisDok: 'PIB' | 'CN') => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: cvRows } = await supabase.from('tabel_cost_validasi').select('*').in(idKey, chunk).order('created_at', { ascending: false });
      (cvRows || []).forEach((cv: any) => {
        const mapKey = `${keyPrefix}${cv[idKey]}`;
        if (costPctMap[mapKey] !== undefined) return; // sudah ada baris LEBIH BARU (order desc), skip
        costPctMap[mapKey] = computeLiveCostSummary(cv, jenisDok, reviewMaps[`${jenisDok}:${cv[idKey]}`]).pct;
      });
    }
  };

  await Promise.all([
    fetchChecklistPct('pib_id', pibIds, 'pib_'),
    fetchChecklistPct('cn_id', cnIds, 'cn_'),
    fetchCostPct('pib_id', pibIds, 'pib_', 'PIB'),
    fetchCostPct('cn_id', cnIds, 'cn_', 'CN'),
  ]);

  // FALLBACK live-calc utk Doc Validation -- tabel_checklist_validasi CUMA keisi kalau
  // seseorang pernah buka ValidasiModal (Doc Validation) dan klik Simpan (lihat ValidasiModal.tsx
  // ~baris 1001-1013, INSERT/UPDATE manual, BUKAN diisi n8n otomatis). Jadi mayoritas baris yang
  // belum pernah dibuka modalnya TIDAK punya baris di situ -- sebelumnya badge-nya jadi 0% terus
  // (bukan krn nilainya beneran 0%, tapi krn datanya belum ada), tidak sinkron sama sekali dgn
  // yang kelihatan begitu user buka modal Doc Validation-nya. Fix: baris yang belum ada di
  // docPctMap dihitung ulang live di sini, REPLIKA PERSIS fallback yang sama dipakai
  // CourierValidasiPage.tsx (SECTIONS/computeStatus/generateValues/calculatePibStats) --
  // JANGAN duplikat/tulis ulang formula ini lagi di tempat lain, lihat file itu kalau perlu diubah.
  const missingPibIds = pibIds.filter(id => docPctMap[`pib_${id}`] === undefined);
  const missingCnIds = cnIds.filter(id => docPctMap[`cn_${id}`] === undefined);
  if (missingPibIds.length > 0 || missingCnIds.length > 0) {
    let allDokumenValidasi: any[] = [];
    for (let i = 0; i < missingPibIds.length; i += chunkSize) {
      const chunk = missingPibIds.slice(i, i + chunkSize);
      const { data: dv } = await supabase.from('dokumen_validasi').select('pib_id, cn_id, jenis_dokumen, awb, data_validasi_raw').in('pib_id', chunk);
      if (dv) allDokumenValidasi = [...allDokumenValidasi, ...dv];
    }
    for (let i = 0; i < missingCnIds.length; i += chunkSize) {
      const chunk = missingCnIds.slice(i, i + chunkSize);
      const { data: dv } = await supabase.from('dokumen_validasi').select('pib_id, cn_id, jenis_dokumen, awb, data_validasi_raw').in('cn_id', chunk);
      if (dv) allDokumenValidasi = [...allDokumenValidasi, ...dv];
    }

    if (allDokumenValidasi.length > 0) {
      const { data: npwpData } = await supabase.from('tabel_npwp').select('*');
      const localNpwps = npwpData || [];

      allDokumenValidasi.forEach((r: any) => {
        let raw: any = {};
        try {
          raw = typeof r.data_validasi_raw === 'string' ? JSON.parse(r.data_validasi_raw) : (r.data_validasi_raw || {});
        } catch (e) {}

        const docType = r.jenis_dokumen || (r.pib_id ? 'PIB' : 'CN');
        const activeSections = SECTIONS.filter(section => {
          if (docType === 'CN' && section.id === 's_pib') return false;
          if (docType === 'CN' && section.id === 's_sptnp') return false;
          if (docType === 'PIB' && section.id === 's_cipl') return false;
          if (docType === 'PIB' && section.id === 's_sppbmcp') return false;
          if (docType === 'PIB' && section.id === 's_billing') return false;
          return true;
        });

        const values = generateValues(raw, r.awb || '', localNpwps);
        let match = 0, mismatch = 0;
        activeSections.forEach(s => s.rows.forEach(row => {
          const v = values[row.id] || { src: '', cmp: '' };
          const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field, raw?.is_po_non_imi);
          if (st === 'match') match++;
          else if (st === 'mismatch') mismatch++;
        }));

        const pibStats = calculatePibStats(raw, docType);
        match += pibStats.match;
        mismatch += pibStats.mismatch;

        const checked = match + mismatch;
        const pct = checked > 0 ? Math.round((match / checked) * 100) : 0;
        if (r.pib_id) docPctMap[`pib_${r.pib_id}`] = pct;
        if (r.cn_id) docPctMap[`cn_${r.cn_id}`] = pct;
      });
    }
  }

  return { docPctMap, costPctMap };
}

const toPct = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// % per tab dari data baris: pct_kelengkapan (merge dokumen_checklist), doc_validation_pct & cost_validation_pct
// (fetchCourierValidationBadgePct).
export const rowValidationPct = (rec: any): Record<ValidationTabKey, number | null> => ({
  checklist: toPct(rec?.pct_kelengkapan),
  doc: toPct(rec?.doc_validation_pct),
  cost: toPct(rec?.cost_validation_pct),
});

// "Belum 100%" = salah satu tab yang boleh dilihat user belum ada datanya atau < 100% (SAMA KPI "Validation
// incomplete" Audit Courier).
export const courierValidationIncomplete = (rec: any, tabs: ValidationTabKey[]): boolean => {
  const pct = rowValidationPct(rec);
  return tabs.some(t => pct[t] === null || (pct[t] as number) < 100);
};

// Isi pct_kelengkapan + doc/cost_validation_pct ke baris Audit (minimal, tanpa kolom checklist lain).
export async function enrichCourierValidationPct(recs: any[]): Promise<void> {
  if (recs.length === 0) return;
  await mergeChecklistFields(recs, ['pct_kelengkapan']);
  const { docPctMap, costPctMap } = await fetchCourierValidationBadgePct(recs);
  recs.forEach(r => {
    const key = r.jenis_dokumen === 'CN' ? `cn_${r.id}` : `pib_${r.id}`;
    r.doc_validation_pct = docPctMap[key] ?? 0;
    r.cost_validation_pct = costPctMap[key] ?? 0;
  });
}
