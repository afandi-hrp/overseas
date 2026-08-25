import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ExportModal from '../../components/ExportModal';

import { Search, ChevronLeft, ChevronRight, RefreshCw, Download, X, FileCheck2 } from 'lucide-react';
import { SECTIONS, computeStatus } from '../../utils/ValidasiHelper';
import { generateValues } from '../../utils/ValidasiFill';
import { calculatePibStats } from '../../utils/ValidasiPibHelper';

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}


const VALIDASI_COLS = [
  { key: 'index', label: 'No.', type: 'index' },
  { key: 'jenis_dokumen', label: 'Jenis Dokumen' },
  { key: 'no_pib', label: 'No. PIB / SPPBMCP' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'awb', label: 'No. AWB' },
  { key: 'total_lulus', label: 'Sesuai', type: 'num' },
  { key: 'total_gagal', label: 'Tidak sesuai', type: 'num' },
  { key: 'belum_diisi', label: 'Belum diisi', type: 'num' },
  { key: 'persentase', label: 'Akurasi (%)', type: 'pct_dynamic' }
];

export default function CourierValidasiPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const getExportData = async (startDate?: string, endDate?: string) => {
    let query = supabase
      .from('dokumen_validasi')
      .select(`
        *,
        tabel_audit_pib ( no_pib, vendor ),
        tabel_audit_cn ( no_sppbmcp, vendor )
      `)
      .limit(50000);

    if (startDate) {
      query = query.gte('updated_at', startDate);
    }
    if (endDate) {
      const endOfDay = `${endDate} 23:59:59`;
      query = query.lte('updated_at', endOfDay);
    }

    if (debouncedSearch) {
      query = query.or(`awb.ilike.%${debouncedSearch}%,jenis_dokumen.ilike.%${debouncedSearch}%,status_validasi.ilike.%${debouncedSearch}%`);
    }

    const { data, error } = await query;
    if (error) return [];
    
    let resData = data || [];

    const pibIds = resData.map((r: any) => r.pib_id).filter(Boolean);
    const cnIds = resData.map((r: any) => r.cn_id).filter(Boolean);
    const checklistMap = new Map();

    if (pibIds.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < pibIds.length; i += chunkSize) {
        const chunk = pibIds.slice(i, i + chunkSize);
        const { data: pibChecklists } = await supabase.from('tabel_checklist_validasi')
          .select('pib_id, total_match, total_mismatch, total_empty')
          .in('pib_id', chunk);
        if (pibChecklists) pibChecklists.forEach((c: any) => checklistMap.set(`pib_${c.pib_id}`, c));
      }
    }

    if (cnIds.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < cnIds.length; i += chunkSize) {
        const chunk = cnIds.slice(i, i + chunkSize);
        const { data: cnChecklists } = await supabase.from('tabel_checklist_validasi')
          .select('cn_id, total_match, total_mismatch, total_empty')
          .in('cn_id', chunk);
        if (cnChecklists) cnChecklists.forEach((c: any) => checklistMap.set(`cn_${c.cn_id}`, c));
      }
    }

    let localNpwps: any[] = [];
    const needsCalculation = resData.some((r: any) => {
       const chk = r.pib_id ? checklistMap.get(`pib_${r.pib_id}`) : (r.cn_id ? checklistMap.get(`cn_${r.cn_id}`) : null);
       return !chk || typeof chk.total_match !== 'number';
    });

    if (needsCalculation) {
       const { data: npwpData } = await supabase.from('tabel_npwp').select('*');
       if (npwpData) localNpwps = npwpData;
    }

    return resData.map((r: any) => {
       let match = 0, mismatch = 0, totalItems = 0;
       const chk = r.pib_id ? checklistMap.get(`pib_${r.pib_id}`) : (r.cn_id ? checklistMap.get(`cn_${r.cn_id}`) : null);
       
       if (chk && typeof chk.total_match === 'number') {
          match = chk.total_match;
          mismatch = chk.total_mismatch;
          totalItems = chk.total_match + chk.total_mismatch + (chk.total_empty || 0);
       } else {
          let raw: any = {};
          try {
            raw = typeof r.data_validasi_raw === 'string' ? JSON.parse(r.data_validasi_raw) : (r.data_validasi_raw || {});
          } catch(e) { }

          const docType = r.jenis_dokumen || (r.tabel_audit_pib ? 'PIB' : (r.tabel_audit_cn ? 'CN' : ''));
          const activeSections = SECTIONS.filter(section => {
            if (docType === 'CN' && section.id === 's_pib') return false;
            if (docType === 'CN' && section.id === 's_sptnp') return false;
            if (docType === 'PIB' && section.id === 's_cipl') return false;
            if (docType === 'PIB' && section.id === 's_sppbmcp') return false;
            if (docType === 'PIB' && section.id === 's_billing') return false;
            return true;
          });

          const values = generateValues(raw, r.awb || '', localNpwps);
          let partial = 0, empty = 0;

          activeSections.forEach(s => s.rows.forEach(row => {
            const v = values[row.id] || {src: '', cmp: ''};
            const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field, raw?.is_po_non_imi);
            if (st === "match") match++;
            else if (st === "mismatch") mismatch++;
            else if (st === "partial") partial++;
            else empty++;
          }));

          const pibStats = calculatePibStats(raw, docType);
          match += pibStats.match;
          mismatch += pibStats.mismatch;
          empty += pibStats.empty;

          totalItems = match + mismatch + partial + empty;
       }

       const emptyCount = Math.max(0, totalItems - match - mismatch);
       const checkedCount = match + mismatch;

       return {
         ...r,
         no_pib: r.tabel_audit_pib?.no_pib || r.tabel_audit_cn?.no_sppbmcp || '-',
         vendor: r.tabel_audit_pib?.vendor || r.tabel_audit_cn?.vendor || '-',
         total_lulus: match,
         total_gagal: mismatch,
         belum_diisi: emptyCount,
         persentase: checkedCount ? (match / checkedCount * 100) : 0
       };
    });
  };

  const [exportModalState, setExportModalState] = useState<{title: string, cols: any[], dateFieldLabel?: string} | null>(null);

  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchRecords();
  }, [debouncedSearch, page]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('dokumen_validasi')
        .select(`
          *,
          tabel_audit_pib ( no_pib, vendor ),
          tabel_audit_cn ( no_sppbmcp, vendor )
        `, { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`awb.ilike.%${debouncedSearch}%,jenis_dokumen.ilike.%${debouncedSearch}%,status_validasi.ilike.%${debouncedSearch}%`);
      }

      // Pagination
      const startIndex = (page - 1) * pageSize;
      query = query.order('updated_at', { ascending: false }).range(startIndex, startIndex + pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      
      let resData = data || [];

      // Fetch checklist validasi stats to synchronize with Validasi Dokumen modal
      const pibIds = resData.map((r: any) => r.pib_id).filter(Boolean);
      const cnIds = resData.map((r: any) => r.cn_id).filter(Boolean);

      const checklistMap = new Map();

      if (pibIds.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < pibIds.length; i += chunkSize) {
          const chunk = pibIds.slice(i, i + chunkSize);
          const { data: pibChecklists } = await supabase.from('tabel_checklist_validasi')
            .select('pib_id, total_match, total_mismatch, total_empty')
            .in('pib_id', chunk);
          if (pibChecklists) pibChecklists.forEach((c: any) => checklistMap.set(`pib_${c.pib_id}`, c));
        }
      }
      
      if (cnIds.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < cnIds.length; i += chunkSize) {
          const chunk = cnIds.slice(i, i + chunkSize);
          const { data: cnChecklists } = await supabase.from('tabel_checklist_validasi')
            .select('cn_id, total_match, total_mismatch, total_empty')
            .in('cn_id', chunk);
          if (cnChecklists) cnChecklists.forEach((c: any) => checklistMap.set(`cn_${c.cn_id}`, c));
        }
      }

      let localNpwps: any[] = [];
      const needsCalculation = resData.some((r: any) => {
         const chk = r.pib_id ? checklistMap.get(`pib_${r.pib_id}`) : (r.cn_id ? checklistMap.get(`cn_${r.cn_id}`) : null);
         return !chk || typeof chk.total_match !== 'number';
      });

      if (needsCalculation) {
         const { data: npwpData } = await supabase.from('tabel_npwp').select('*');
         if (npwpData) localNpwps = npwpData;
      }

      const finalRecords = resData.map((r: any) => {
         const chk = r.pib_id ? checklistMap.get(`pib_${r.pib_id}`) : (r.cn_id ? checklistMap.get(`cn_${r.cn_id}`) : null);
         if (chk && typeof chk.total_match === 'number') {
            return {
              ...r,
              is_from_checklist: true,
              total_lulus: chk.total_match,
              total_gagal: chk.total_mismatch,
              total_validasi: chk.total_match + chk.total_mismatch + (chk.total_empty || 0)
            };
         } else {
            // Kalkulasi dinamis jika belum pernah dibuka di Validasi Dokumen
            let raw: any = {};
            try {
              raw = typeof r.data_validasi_raw === 'string' ? JSON.parse(r.data_validasi_raw) : (r.data_validasi_raw || {});
            } catch(e) { }

            const docType = r.jenis_dokumen || (r.tabel_audit_pib ? 'PIB' : (r.tabel_audit_cn ? 'CN' : ''));
            const activeSections = SECTIONS.filter(section => {
              if (docType === 'CN' && section.id === 's_pib') return false;
              if (docType === 'CN' && section.id === 's_sptnp') return false;
              if (docType === 'PIB' && section.id === 's_cipl') return false;
              if (docType === 'PIB' && section.id === 's_sppbmcp') return false;
              if (docType === 'PIB' && section.id === 's_billing') return false;
              return true;
            });

            const values = generateValues(raw, r.awb || '', localNpwps);
            let match = 0, mismatch = 0, partial = 0, empty = 0;

            activeSections.forEach(s => s.rows.forEach(row => {
              const v = values[row.id] || {src: '', cmp: ''};
              const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field, raw?.is_po_non_imi);
              if (st === "match") match++;
              else if (st === "mismatch") mismatch++;
              else if (st === "partial") partial++;
              else empty++;
            }));

            const pibStats = calculatePibStats(raw, docType);
            match += pibStats.match;
            mismatch += pibStats.mismatch;
            empty += pibStats.empty;

            const totalItems = match + mismatch + partial + empty;

            return {
              ...r,
              is_from_checklist: false,
              total_lulus: match,
              total_gagal: mismatch,
              total_validasi: totalItems
            };
         }
      });

      setRecords(finalRecords);
      if (count !== null) setTotalRecords(count);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalRecords / pageSize);

  // Toolbar/panel "kaca" senada dengan halaman Audit/Rekapan Courier & Sea/Air (SharedDataTable.tsx).
  const TOOLBAR_GLASS = 'bg-white/70 backdrop-blur-md border-slate-200/80 shadow-sm';

  const progressBarColor = (pct: number) =>
    pct >= 90 ? 'bg-emerald-600' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-600';

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
      <header className="px-6 pt-1 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
            <FileCheck2 size={17} />
          </div>
          <div>
            <h1 className="font-bold text-xl text-[#5A305A] leading-tight">Validasi Courier</h1>
            <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">Daftar rekapan validasi dokumen</p>
          </div>
        </div>
      </header>

      <main className="px-6 py-4 flex-1 flex flex-col overflow-hidden">
        {/* ── Toolbar: search + aksi ── */}
        <div className={`flex flex-nowrap justify-between items-center gap-2 rounded-2xl px-3 py-3 border overflow-x-auto mb-4 shrink-0 ${TOOLBAR_GLASS}`}>
          <div className="relative shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A305A] pointer-events-none" />
            <input
              type="text"
              placeholder="Cari AWB, Jenis Dokumen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-40 rounded-full pl-8 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/15 focus:border-[#5A305A] focus:bg-white/90 focus:w-56 transition-all border ${TOOLBAR_GLASS}`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A305A] hover:text-[#5A305A] focus:outline-none"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchRecords}
              className="px-3.5 py-2 rounded-full bg-white text-[#5A305A] text-xs font-semibold hover:border-[#5A305A] transition-all h-[38px] flex items-center gap-1.5 border border-slate-200"
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => setExportModalState({ title: 'Validasi Dokumen', cols: VALIDASI_COLS, dateFieldLabel: 'Filter Tgl. Validasi' })}
              className="px-3.5 py-2 rounded-full bg-[#5A305A] hover:bg-[#73507B] text-white text-xs font-semibold transition-all h-[38px] flex items-center gap-1.5"
            >
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {/* ── Daftar record ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 border-4 border-[#5A305A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className={`text-center py-12 text-[#5A305A]/70 text-sm italic rounded-2xl border ${TOOLBAR_GLASS}`}>
              Tidak ada data validasi ditemukan.
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-6xl mx-auto">
              {records.map((record) => {
                const docType = record.jenis_dokumen || "—";
                const awbNo = record.awb || "—";
                const noPib = record.tabel_audit_pib?.no_pib || record.tabel_audit_cn?.no_sppbmcp || "—";
                const vendor = record.tabel_audit_pib?.vendor || record.tabel_audit_cn?.vendor || "—";

                const match = record.total_lulus || 0;
                const mismatch = record.total_gagal || 0;
                const total = record.total_validasi || (match + mismatch);

                // We just subtract match and mismatch to get the remaining "Belum diisi" equivalent
                const empty = Math.max(0, total - match - mismatch);

                // Total checked is just match + mismatch + partial, but for UI pct we can use match/total
                const checked = match + mismatch;
                const pct = checked === 0 ? 0 : Math.round((match / checked) * 100);

                return (
                  <div key={record.id} className={`rounded-2xl border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${TOOLBAR_GLASS}`}>
                    <div className="flex gap-6 flex-wrap flex-1 w-full md:w-auto">
                      <div className="flex flex-col gap-1 min-w-[100px]">
                        <span className="text-[10px] font-bold text-[#5A305A]/50 uppercase tracking-wider">Jenis Dokumen</span>
                        <span className="text-sm font-semibold text-[#5A305A]">{docType}</span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-[180px]">
                        <span className="text-[10px] font-bold text-[#5A305A]/50 uppercase tracking-wider">No. PIB</span>
                        <span className="text-sm font-semibold text-[#5A305A] break-all">{noPib}</span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                        <span className="text-[10px] font-bold text-[#5A305A]/50 uppercase tracking-wider">Vendor</span>
                        <span className="text-sm font-semibold text-[#5A305A] line-clamp-2" title={vendor}>{vendor}</span>
                      </div>
                      <div className="flex flex-col gap-1 min-w-[140px]">
                        <span className="text-[10px] font-bold text-[#5A305A]/50 uppercase tracking-wider">No. AWB</span>
                        <span className="text-sm font-semibold text-[#5A305A]">{awbNo}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 w-full md:w-auto mt-2 md:mt-0 shrink-0">
                      <div className="flex gap-2 shrink-0">
                        <div className="bg-emerald-50 text-emerald-700 rounded-lg px-3 py-1.5 text-center min-w-[64px]">
                          <span className="text-lg font-bold block leading-tight">{match}</span>
                          <span className="text-[10px] font-semibold block mt-0.5">Sesuai</span>
                        </div>
                        <div className="bg-rose-50 text-rose-700 rounded-lg px-3 py-1.5 text-center min-w-[64px]">
                          <span className="text-lg font-bold block leading-tight">{mismatch}</span>
                          <span className="text-[10px] font-semibold block mt-0.5">Tidak sesuai</span>
                        </div>
                        <div className="bg-slate-100 text-[#5A305A]/70 rounded-lg px-3 py-1.5 text-center min-w-[64px]">
                          <span className="text-lg font-bold block leading-tight">{empty}</span>
                          <span className="text-[10px] font-semibold block mt-0.5">Belum diisi</span>
                        </div>
                      </div>

                      <div className="w-full min-w-[220px] mt-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-[#5A305A]/60">Akurasi validasi</span>
                          <span className="text-[11px] font-bold text-[#5A305A]">{match}/{checked} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${progressBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {!loading && totalPages > 1 && (
          <div className={`mt-4 px-4 py-3 rounded-2xl border flex items-center justify-between shrink-0 ${TOOLBAR_GLASS}`}>
            <div className="text-xs text-[#5A305A]">
              Menampilkan <span className="font-bold">{((page - 1) * pageSize) + 1}</span> hingga <span className="font-bold">{Math.min(page * pageSize, totalRecords)}</span> dari <span className="font-bold">{totalRecords}</span> dokumen
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      {exportModalState && (
        <ExportModal
          title={exportModalState.title}
          cols={exportModalState.cols}
          dateFieldLabel={exportModalState.dateFieldLabel}
          onClose={() => setExportModalState(null)}
          fetchData={getExportData}
        />
      )}
    </div>
  );
}
