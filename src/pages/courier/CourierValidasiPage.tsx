import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ExportModal from '../../components/ExportModal';

import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
            const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field);
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
              const st = computeStatus(v.src, v.cmp, (row as any).isFormat, row.field);
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

  const S = {
    card: {
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "16px",
      display: "flex",
      flexDirection: "row" as const,
      justifyContent: "space-between",
      alignItems: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      gap: "16px"
    },
    metaRow: {
      display: "flex",
      gap: "32px",
      flexWrap: "wrap" as const
    },
    metaCol: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px"
    },
    label: {
      fontSize: "11px",
      color: "#64748b",
      fontWeight: 500,
      textTransform: "uppercase" as const,
      letterSpacing: "0.5px"
    },
    value: {
      fontSize: "14px",
      fontWeight: 600,
      color: "#0f172a"
    },
    scoreWrap: {
      display: "flex",
      gap: "8px",
      flexShrink: 0
    },
    scoreCard: (bg: string, c: string) => ({
      background: bg,
      color: c,
      borderRadius: "8px",
      padding: "6px 12px",
      textAlign: "center" as const,
      minWidth: "64px"
    }),
    scoreNum: {
      fontSize: "18px",
      fontWeight: 600,
      display: "block",
      lineHeight: 1.1
    },
    scoreLabel: {
      fontSize: "11px",
      fontWeight: 500,
      display: "block",
      marginTop: "4px"
    },
    progressWrap: {
      height: "6px",
      borderRadius: "3px",
      background: "#e2e8f0",
      marginTop: "8px",
      overflow: "hidden"
    },
    progressBar: (pct: number) => ({
      height: "100%",
      width: pct + "%",
      background: pct >= 90 ? "#3B6D11" : pct >= 60 ? "#BA7517" : "#A32D2D",
      transition: "width .4s"
    })
  };

  const bgSuccess = "#ecfccb";
  const txtSuccess = "#3f6212";
  const bgDanger = "#ffe4e6";
  const txtDanger = "#9f1239";
  const bgSec = "#f1f5f9";
  const txtSec = "#475569";

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 relative">
      <div className="p-4 md:px-6 md:py-5 border-b border-slate-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Validasi Courier</h1>
          <p className="text-sm text-slate-500 mt-1">Daftar rekapan validasi dokumen</p>
    
    </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRecords}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-all h-[38px]"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setExportModalState({ title: 'Validasi Dokumen', cols: VALIDASI_COLS, dateFieldLabel: 'Filter Tgl. Validasi' })}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold border border-emerald-700 transition-all h-[38px] flex justify-center items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Export
          </button>
    
    </div>

        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Cari AWB, Jenis Dokumen..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
    
    </div>
  
    </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      
    </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
            Tidak ada data validasi ditemukan.
      
    </div>
        ) : (
          <div className="flex flex-col gap-4 max-w-6xl mx-auto">
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
                <div key={record.id} style={S.card} className="flex-col md:flex-row">
                  <div style={S.metaRow} className="flex-1 w-full md:w-auto">
                    <div style={{...S.metaCol, minWidth: '100px'}}>
                      <span style={S.label}>Jenis Dokumen</span>
                      <span style={S.value}>{docType}</span>
                
    </div>
                    <div style={{...S.metaCol, minWidth: '180px'}}>
                      <span style={S.label}>No. PIB</span>
                      <span style={S.value} className="break-all">{noPib}</span>
                
    </div>
                    <div style={{...S.metaCol, minWidth: '180px', flex: 1}}>
                      <span style={S.label}>Vendor</span>
                      <span style={S.value} className="line-clamp-2" title={vendor}>{vendor}</span>
                
    </div>
                    <div style={{...S.metaCol, minWidth: '140px'}}>
                      <span style={S.label}>No. AWB</span>
                      <span style={S.value}>{awbNo}</span>
                
    </div>
              
    </div>

                  <div className="flex flex-col items-end gap-2 w-full md:w-auto mt-4 md:mt-0 shrink-0">
                    <div style={S.scoreWrap}>
                      <div style={S.scoreCard(bgSuccess, txtSuccess)}>
                        <span style={S.scoreNum}>{match}</span>
                        <span style={S.scoreLabel}>Sesuai</span>
                  
    </div>
                      <div style={S.scoreCard(bgDanger, txtDanger)}>
                        <span style={S.scoreNum}>{mismatch}</span>
                        <span style={S.scoreLabel}>Tidak sesuai</span>
                  
    </div>
                      <div style={S.scoreCard(bgSec, txtSec)}>
                        <span style={S.scoreNum}>{empty}</span>
                        <span style={S.scoreLabel}>Belum diisi</span>
                  
    </div>
                
    </div>
                    
                    <div style={{ width: "100%", minWidth: "220px", marginTop: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <span style={{ fontSize: "12px", color: txtSec }}>Akurasi validasi</span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>
                          {match}/{checked} ({pct}%)
                        </span>
                  
    </div>
                      <div style={S.progressWrap}>
                        <div style={S.progressBar(pct)} />
                  
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
        <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-sm text-slate-500">
            Menampilkan <span className="font-medium text-slate-700">{((page - 1) * pageSize) + 1}</span> hingga <span className="font-medium text-slate-700">{Math.min(page * pageSize, totalRecords)}</span> dari <span className="font-medium text-slate-700">{totalRecords}</span> dokumen
      
    </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-300 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded border border-slate-300 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronRight size={18} />
            </button>
      
    </div>
    
    </div>
      )}

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
