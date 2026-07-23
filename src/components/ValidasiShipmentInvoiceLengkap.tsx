import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { X, CheckCircle2, Edit3, Printer, XCircle, Clock, Info, Receipt } from 'lucide-react';

export const EditModeContext = React.createContext(false);

const fmtUSD = (n: any) => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtIDR = (val: any) => {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num);
};

const selisihStatus = (exp: any, act: any, tolerance: number = 1000) => {
  if (exp == null || act == null || exp === '' || act === '') return { status: 'BELUM_LENGKAP', selisih: 0 };
  const e = Number(exp);
  const a = Number(act);
  const diff = a - e;
  if (Math.abs(diff) <= tolerance) {
    return { status: 'MATCH', selisih: diff };
  }
  if (diff > tolerance) {
    return { status: 'OVERCHARGE', selisih: diff };
  }
  return { status: 'UNDERCHARGE', selisih: diff };
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'MATCH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={12} /> Match
      </span>
    );
  }
  if (status === 'OVERCHARGE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap bg-rose-100 text-rose-700">
        <XCircle size={12} /> Overcharge
      </span>
    );
  }
  if (status === 'UNDERCHARGE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap bg-amber-100 text-amber-700">
        <Clock size={12} /> Undercharge
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap bg-slate-100 text-slate-500">
      <Clock size={12} /> Belum Lengkap
    </span>
  );
};

const EditableIDR = ({ val, onSave, isUSD }: any) => {
  const isEditMode = React.useContext(EditModeContext);
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');
  
  if (isEditing) {
    return (
      <input 
        autoFocus
        className="border border-blue-400 rounded px-2 py-1 text-xs w-28 outline-none font-mono text-right bg-white shadow-inner"
        value={tempVal}
        onChange={e => setTempVal(e.target.value)}
        onBlur={() => { setIsEditing(false); onSave(tempVal); }}
        onKeyDown={e => { if (e.key === 'Enter') { setIsEditing(false); onSave(tempVal); } }}
      />
    );
  }
  
  return (
    <div 
      className={`px-2 py-1 rounded transition-colors inline-block min-w-[80px] ${isEditMode ? 'cursor-pointer hover:bg-slate-200 ring-1 ring-slate-200 bg-white' : ''}`}
      onClick={() => { 
        if (isEditMode) {
          setTempVal(val == null ? '' : val.toString()); 
          setIsEditing(true); 
        }
      }}
    >
      <div className="flex items-center justify-end gap-1">
        {val != null && val !== '' ? (
          (isUSD ? fmtUSD(val) : fmtIDR(val))
        ) : (
          isEditMode ? <span className="text-slate-400 italic text-xs">Klik isi</span> : <span className="text-slate-300">—</span>
        )}
      </div>
    </div>
  );
};

const ValidationTable = ({ title, rows, updateCheck }: { title: string, rows: any[], updateCheck: any }) => {
  const [isJalurMerah, setIsJalurMerah] = useState(false);

  if (!rows || rows.length === 0) return null;

  const hasJalurMerahOption = title === "INVOICE EMKL" && rows.some(r => r.expected_alt?.nilai != null);

  const displayRows = rows.map(row => {
    if (title === "INVOICE EMKL" && isJalurMerah && row.expected_alt?.nilai != null) {
      const expAlt = row.expected_alt.nilai;
      const computedSelisih = row.actual != null ? Number(row.actual) - Number(expAlt) : null;
      let computedStatus = 'BELUM_LENGKAP';
      if (row.actual != null && expAlt != null && row.actual !== '' && expAlt !== '') {
         const toleransi = row.mata_uang === 'USD' ? 1 : 1000;
         if (Math.abs(computedSelisih as number) <= toleransi) computedStatus = 'MATCH';
         else if ((computedSelisih as number) > toleransi) computedStatus = 'OVERCHARGE';
         else computedStatus = 'UNDERCHARGE';
      }
      return {
        ...row,
        expected: expAlt,
        selisih: computedSelisih,
        status: computedStatus,
        isAlt: true
      };
    }
    return row;
  });

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Receipt size={16} />
          </div>
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{title}</h4>
        </div>
        
        {hasJalurMerahOption && (
          <div className="flex flex-col items-end">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setIsJalurMerah(false)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                  !isJalurMerah 
                    ? 'bg-white text-emerald-700 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Jalur Hijau
              </button>
              <button
                onClick={() => setIsJalurMerah(true)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                  isJalurMerah 
                    ? 'bg-rose-50 text-rose-700 shadow-sm ring-1 ring-rose-200' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Jalur Merah
              </button>
            </div>
            <p className="text-[10px] text-slate-400 italic mt-1 max-w-[250px] text-right">
              Jalur Merah jarang dipakai -- hanya pilih kalau memang shipment ini pakai Jalur Merah
            </p>
          </div>
        )}
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-r border-slate-200" style={{ backgroundColor: "#f1f5f9", color: "#475569", width: '35%' }}>Validasi</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-right border-r border-slate-200" style={{ backgroundColor: "#bae6fd", color: "#0369a1", width: '15%' }}>Expected {hasJalurMerahOption && isJalurMerah && <span className="text-rose-600 ml-1">(Merah)</span>}</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-right border-r border-slate-200" style={{ backgroundColor: "#fef08a", color: "#854d0e", width: '15%' }}>Actual</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-right border-r border-slate-200" style={{ backgroundColor: "#e9d5ff", color: "#6b21a8", width: '20%' }}>Selisih</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-center" style={{ backgroundColor: "#f1f5f9", color: "#475569", width: '15%' }}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.map((row, idx) => (
              <React.Fragment key={idx}>
                <tr className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-3 text-xs text-slate-700 font-medium border-r border-slate-200 bg-white">
                    <div className="flex items-center gap-1.5">
                      {row.row}
                      {row.vendor_name && <span className="text-slate-400">({row.vendor_name})</span>}
                      {row.manual && (
                        <Edit3 size={12} className="text-amber-500 ml-1 shrink-0" title="Diedit manual" />
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono text-right border-r border-slate-200 ${row.isAlt ? 'bg-rose-50/30 text-rose-800' : 'bg-white text-slate-700'}`}>
                    <EditableIDR isUSD={row.mata_uang === 'USD'} val={row.expected} onSave={(v: any) => updateCheck(row.section, row.row, row.vendor_name, row.isAlt ? 'expected_alt.nilai' : 'expected', v)} />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-700 text-right border-r border-slate-200 bg-amber-50/20">
                    <EditableIDR isUSD={row.mata_uang === 'USD'} val={row.actual} onSave={(v: any) => updateCheck(row.section, row.row, row.vendor_name, 'actual', v)} />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right border-r border-slate-200 bg-white">
                    {(() => {
                      const toleransi = row.mata_uang === 'USD' ? 1 : 1000;
                      return (
                        <span className={!row.selisih || Math.abs(row.selisih) <= toleransi ? 'text-emerald-600' : 'text-rose-600 font-bold'}>
                          {row.selisih != null ? (row.mata_uang === 'USD' ? fmtUSD(row.selisih) : fmtIDR(row.selisih)) : '—'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center bg-white">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
                {row.catatan && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={5} className="px-4 py-2 border-t-0">
                      <div className="flex items-start gap-1.5">
                        <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <span className="text-[11px] text-slate-600 italic leading-tight">
                          {row.catatan}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function ValidasiShipmentInvoiceLengkap({ record, onClose }: { record: any, onClose: () => void }) {
  const [checks, setChecks] = useState<any[]>([]);
  const [costValidasiId, setCostValidasiId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [shipmentInfoError, setShipmentInfoError] = useState('');
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [shipmentInfo, setShipmentInfo] = useState<any>(null);
  const [kursSaatItu, setKursSaatItu] = useState<number | null>(null);
  const [showKursTooltip, setShowKursTooltip] = useState(false);

  useEffect(() => {
    const fetchValidasi = async () => {
      try {
        setLoading(true);
        
        const [validasiRes, auditRes, rekapRes, matriksRes] = await Promise.all([
           supabase.from('cost_validasi_seaair').select('*').eq('seaair_id', record.id).single(),
           supabase.from('tabel_audit_seaair').select('awb, via, cbm').eq('id', record.id).single(),
           supabase.from('rekapan_seaair').select('emkl_vendor, etd, atd, eta, ata, weight_kg, tgl_invoice_freight, tgl_storage_mulai, tgl_storage_selesai').eq('seaair_id', record.id).single(),
           supabase.from('dokumen_validasi_matriks_seaair').select('checks').eq('seaair_id', record.id).single()
        ]);
        
        console.log("rekapRes.data:", rekapRes.data);

        if (rekapRes.data?.tgl_invoice_freight) {
           const kursRes = await supabase
             .from('kurs_bi_seaair')
             .select('kurs_jual, kurs_tengah, tanggal')
             .eq('mata_uang', 'USD')
             .lte('tanggal', rekapRes.data?.tgl_invoice_freight)
             .order('tanggal', { ascending: false })
             .limit(1)
             .single();
           if (kursRes.data) {
             setKursSaatItu(kursRes.data.kurs_jual);
           } else {
             setKursSaatItu(null);
           }
        } else {
           setKursSaatItu(null);
        }
        
        let infoErrorMsg = '';
        if (auditRes.error) {
           console.error('Gagal fetch tabel_audit_seaair:', auditRes.error);
           infoErrorMsg += `[Audit: ${auditRes.error.message}] `;
        }
        if (rekapRes.error) {
           console.error('Gagal fetch rekapan_seaair:', rekapRes.error);
           infoErrorMsg += `[Rekap: ${rekapRes.error.message}]`;
        }
        if (infoErrorMsg) {
           setShipmentInfoError(`Gagal memuat data shipment: ${infoErrorMsg.trim()}`);
        } else {
           setShipmentInfoError('');
        }
        
        const matriksChecks = matriksRes.data?.checks || [];
        const cbmFallback = matriksChecks.find((c: any) => c.section === 'ACTUAL' && c.row === 'CBM');
        const cbmValue = auditRes.data?.cbm ?? cbmFallback?.values?.ref ?? cbmFallback?.values?.doc ?? null;
        
        const hariStorage = (rekapRes.data?.tgl_storage_mulai && rekapRes.data?.tgl_storage_selesai)
          ? Math.round((new Date(rekapRes.data.tgl_storage_selesai).getTime() - new Date(rekapRes.data.tgl_storage_mulai).getTime()) / 86400000) + 1
          : null;

        setShipmentInfo({
           awb: auditRes.data?.awb,
           vendor: rekapRes.data?.emkl_vendor,
           via: auditRes.data?.via,
           kg: rekapRes.data?.weight_kg,
           cbm: cbmValue,
           etd: rekapRes.data?.etd,
           atd: rekapRes.data?.atd,
           eta: rekapRes.data?.eta,
           ata: rekapRes.data?.ata,
           tglInvoiceFreight: rekapRes.data?.tgl_invoice_freight,
           tglStorageMulai: rekapRes.data?.tgl_storage_mulai,
           tglStorageSelesai: rekapRes.data?.tgl_storage_selesai,
           hariStorage: hariStorage,
        });

        if (validasiRes.error) {
          if (validasiRes.error.code === 'PGRST116') {
             setLoadError("Data cost validasi belum tersedia untuk shipment ini.");
          } else {
             setLoadError("Gagal mengambil data validasi: " + validasiRes.error.message);
          }
        } else if (validasiRes.data) {
          setCostValidasiId(validasiRes.data.id);
          setChecks(validasiRes.data.checks || []);
        }
      } catch (err: any) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (record?.id) {
      fetchValidasi();
    }
  }, [record]);

  const updateCheck = (section: string, rowName: string, vendor_name: string | undefined, field: string, val: string) => {
    setChecks(prev => prev.map(c => {
      if (c.section === section && c.row === rowName && c.vendor_name === vendor_name) {
        if (field === 'expected_alt.nilai') {
          const newCheck = { 
             ...c, 
             expected_alt: { ...(c.expected_alt || {}), nilai: val === '' ? null : val }, 
             manual: true 
          };
          setHasUnsavedChanges(true);
          return newCheck;
        } else {
          const newCheck = { ...c, [field]: val === '' ? null : val, manual: true };
          const { status, selisih } = selisihStatus(newCheck.expected, newCheck.actual, 1000);
          newCheck.status = status;
          newCheck.selisih = selisih;
          setHasUnsavedChanges(true);
          return newCheck;
        }
      }
      return c;
    }));
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!costValidasiId) return;
    try {
      setSaving(true);
      const { error } = await supabase.rpc('update_cost_validasi_manual', {
        p_id: costValidasiId,
        p_checks: checks
      });
      if (error) throw error;
      
      // Verify saved successfully
      const { data: verifyData } = await supabase.from('cost_validasi_seaair').select('id').eq('id', costValidasiId).single();
      if (!verifyData) throw new Error("Verifikasi gagal");
      
      showToast('Berhasil menyimpan perubahan validasi!', 'success');
      setHasUnsavedChanges(false);
      setIsEditMode(false);
    } catch (e: any) {
      showToast('Gagal menyimpan: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const globalStats = useMemo(() => {
    let match = 0, overcharge = 0, undercharge = 0, total = checks.length;
    checks.forEach(c => {
      if (c.status === "MATCH") match++;
      else if (c.status === "OVERCHARGE") overcharge++;
      else if (c.status === "UNDERCHARGE") undercharge++;
    });
    const mismatch = overcharge + undercharge;
    return { match, mismatch, overcharge, undercharge, total, pct: total > 0 ? Math.round((match / total) * 100) : 0 };
  }, [checks]);

  const getRowsFor = (section: string) => checks.filter(c => c.section === section);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center h-full w-full">
        <div className="bg-white p-6 rounded-2xl shadow-xl">
           <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
           <p className="text-slate-600 font-medium">Memuat data validasi cost...</p>
        </div>
      </div>
    );
  }

  return (
    <EditModeContext.Provider value={isEditMode}>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-2 sm:p-4 md:p-6 w-full h-full print:bg-white print:p-0">
        <div className="bg-slate-50 w-full h-full rounded-2xl shadow-xl flex flex-col relative overflow-hidden print:shadow-none print:w-full print:m-0 print:border-none print:rounded-none">
          
          {/* Header */}
          <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 bg-white shrink-0 print:hidden">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-800">Cost Validasi Shipment & Invoice</h2>
              <p className="text-sm text-slate-500">Review dan koreksi data cost Sea & Air ({record.no_master_awb_bl || record.awb || record.id})</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                 onClick={() => window.print()}
                 className="px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md flex items-center gap-2 transition-colors"
              >
                 <Printer size={16} /> Print
              </button>
              <button
                 onClick={() => setIsEditMode(!isEditMode)}
                 className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${isEditMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
              >
                 <Edit3 size={16} /> {isEditMode ? 'Mode Edit Aktif' : 'Mode Edit'}
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
          
          {toast && (
            <div className={`mx-6 mt-4 p-3 rounded-lg border text-sm font-medium shrink-0 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {toast.msg}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar print:p-0 print:overflow-visible relative">
            
            {loadError ? (
               <div className="p-4 md:p-6 pb-24"><div className="p-8 text-center text-rose-600 bg-rose-50 border border-rose-200 rounded-xl">{loadError}</div></div>
            ) : (
              <div className="pb-24">
                {/* SHIPMENT INFO */}
                <div className="sticky top-0 z-20 bg-slate-50 pt-2 px-4 md:pt-4 md:px-6 pb-2 border-b border-slate-200 shadow-sm print:relative print:border-none print:shadow-none print:p-0 print:pb-6">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-2 px-3 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Shipment Info</h4>
                      {shipmentInfoError && (
                        <span className="text-[10px] text-rose-500 italic bg-white/60 px-2 py-0.5 rounded max-w-md truncate" title={shipmentInfoError}>
                          {shipmentInfoError}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-1 gap-x-3 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">No AWB/BL</span>
                        <span className="font-semibold text-slate-800">{shipmentInfo?.awb || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">Vendor</span>
                        <span className="font-semibold text-slate-800 truncate block w-full" title={shipmentInfo?.vendor || ''}>{shipmentInfo?.vendor || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">Shipment Mode</span>
                        <span className="font-semibold text-slate-800">{shipmentInfo?.via || '—'}</span>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase">KG</span>
                          <span className="font-semibold text-slate-800">{shipmentInfo?.kg != null ? `${shipmentInfo.kg} Kg` : '—'}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase">CBM</span>
                          <span className="font-semibold text-slate-800">{shipmentInfo?.cbm != null ? `${Number(shipmentInfo.cbm).toFixed(2)} M3` : '—'}</span>
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">ETD / ATD</span>
                        <span className="font-semibold text-slate-800">{shipmentInfo?.etd || '—'} / {shipmentInfo?.atd || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">ETA / ATA</span>
                        <span className="font-semibold text-slate-800">{shipmentInfo?.eta || '—'} / {shipmentInfo?.ata || '—'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 relative">
                          <span className="block text-[10px] text-slate-500 uppercase">Tgl Invoice Freight</span>
                          {shipmentInfo?.tglInvoiceFreight && (
                            <div className="relative">
                              <button
                                onClick={() => setShowKursTooltip(!showKursTooltip)}
                                className="text-slate-400 hover:text-blue-500 transition-colors rounded-full focus:outline-none"
                              >
                                <Info size={12} />
                              </button>
                              {showKursTooltip && (
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-max max-w-[200px] bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-50 pointer-events-none">
                                  {kursSaatItu ? `Kurs USD: Rp ${kursSaatItu.toLocaleString('id-ID')}` : "Data kurs belum tersedia"}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="font-semibold text-slate-800 block">
                          {shipmentInfo?.tglInvoiceFreight || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase">Storage</span>
                        <span className="font-semibold text-slate-800 block">
                          {(shipmentInfo?.tglStorageMulai && shipmentInfo?.tglStorageSelesai) 
                            ? `${shipmentInfo.tglStorageMulai} - ${shipmentInfo.tglStorageSelesai} (${shipmentInfo.hariStorage} hari)`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 md:px-6 pt-6">
                  {/* STATUS BAR */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Ringkasan Validasi Cost
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Keseluruhan akurasi cost vs actual invoice
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-4 py-2 text-center min-w-[60px]">
                      <span className="block text-xl font-bold leading-none">{globalStats.match}</span>
                      <span className="block text-[10px] uppercase font-bold mt-1 tracking-wide">Match</span>
                    </div>
                    <div className="bg-rose-50 text-rose-700 border border-rose-100 rounded-lg px-4 py-2 text-center min-w-[60px]">
                      <span className="block text-xl font-bold leading-none">{globalStats.overcharge}</span>
                      <span className="block text-[10px] uppercase font-bold mt-1 tracking-wide">Over</span>
                    </div>
                    <div className="bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-4 py-2 text-center min-w-[60px]">
                      <span className="block text-xl font-bold leading-none">{globalStats.undercharge}</span>
                      <span className="block text-[10px] uppercase font-bold mt-1 tracking-wide">Under</span>
                    </div>
                    <div className="w-40 mx-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Progres</span>
                        <span className="text-[10px] font-bold text-slate-700">{globalStats.match}/{globalStats.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                        <div 
                          className={`h-full transition-all duration-500 ${globalStats.pct >= 90 ? 'bg-emerald-500' : globalStats.pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                          style={{ width: `${globalStats.pct}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <ValidationTable
                  title="INVOICE EMKL"
                  rows={getRowsFor("EMKL")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE FREIGHT"
                  rows={getRowsFor("FREIGHT")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE STORAGE"
                  rows={getRowsFor("STORAGE")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE LOLO"
                  rows={getRowsFor("LOLO")}
                  updateCheck={updateCheck}
                />
                <ValidationTable
                  title="INVOICE SURVEYOR (OPSIONAL)"
                  rows={getRowsFor("SURVEYOR")}
                  updateCheck={updateCheck}
                />
                </div>
              </div>
            )}
          </div>
          
          {hasUnsavedChanges && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 p-2 flex items-center gap-3 pr-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
               <div className="w-10 h-10 rounded-full bg-amber-100 flex justify-center items-center text-amber-600">
                 <Info size={20} />
               </div>
               <div>
                  <p className="text-sm font-bold text-slate-800 leading-none">Perubahan belum disimpan</p>
                  <p className="text-[10px] text-slate-500 mt-1">Klik simpan untuk memperbarui ke database</p>
               </div>
               <button
                  onClick={handleSave}
                  disabled={saving}
                  className="ml-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
               >
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
               </button>
            </div>
          )}
        </div>
      </div>
    </EditModeContext.Provider>
  );
}
